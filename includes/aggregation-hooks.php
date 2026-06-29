<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Runtime hook registrations for BimBeau Privacy Analytics.
 */

defined('ABSPATH') || exit;

add_action(BBPA_AGGREGATION_CRON_HOOK, 'bbpa_aggregate_hits');
add_action(BBPA_AGGREGATED_RETENTION_CRON_HOOK, 'bbpa_purge_aggregated_data_by_retention');
add_action('init', 'bbpa_ensure_aggregation_schedule');
add_action('init', 'bbpa_schedule_aggregated_retention_cleanup');
add_filter('cron_schedules', 'bbpa_register_raw_logs_cron_schedule');
add_filter('cron_schedules', 'bbpa_register_aggregated_retention_cron_schedule');
add_filter('cron_schedules', 'bbpa_register_geoip_update_cron_schedule');
add_action(BBPA_RAW_LOGS_CRON_HOOK, 'bbpa_purge_raw_logs');
add_action('init', 'bbpa_ensure_geoip_update_schedule');
add_action(BBPA_GEOIP_UPDATE_CRON_HOOK, 'bbpa_run_monthly_geoip_update');
add_action('bbpa_geoip_initial_update', 'bbpa_run_monthly_geoip_update');
add_action(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK, 'bbpa_run_monthly_geoip_update');
add_action('template_redirect', 'bbpa_track_request_after_canonical_redirects', 20);
add_action('shutdown', 'bbpa_track_final_not_found_request', 1);
add_filter('wp_redirect', 'bbpa_mark_runtime_redirect', 10, 2);
add_filter('wp_redirect_status', 'bbpa_mark_runtime_redirect_status', 10, 2);
add_filter('rest_post_dispatch', 'bbpa_filter_not_found_report_technical_paths', 10, 3);

/**
 * Track requests after WordPress canonical redirects have had a chance to run.
 *
 * This prevents non-canonical URLs such as `/en` from being counted as 404s when
 * WordPress redirects them to a valid canonical destination such as `/en/`.
 *
 * Requests that still look like 404s at this stage are deferred until shutdown so
 * plugin-level redirects can run before BimBeau Privacy Analytics decides whether the final
 * response is a real 404.
 */
function bbpa_track_request_after_canonical_redirects(): void {
	if (is_404()) {
		if (bbpa_request_has_pending_canonical_redirect()) {
			bbpa_mark_runtime_redirect_detected();
		}

		return;
	}

	bbpa_track_request();
}

/**
 * Detect whether the current request is a 404 that WordPress can canonicalize.
 */
function bbpa_request_has_pending_canonical_redirect(): bool {
	if (!function_exists('redirect_canonical')) {
		return false;
	}

	$redirect_url = redirect_canonical(null, false);

	return is_string($redirect_url) && $redirect_url !== '';
}

/**
 * Mark the current request as redirected by WordPress or a plugin.
 */
function bbpa_mark_runtime_redirect_detected(): void {
	$GLOBALS['bbpa_runtime_redirect_detected'] = true;
}

/**
 * Determine whether a runtime redirect was observed for the current request.
 */
function bbpa_runtime_redirect_was_detected(): bool {
	return !empty($GLOBALS['bbpa_runtime_redirect_detected']);
}

/**
 * Check whether a HTTP status is a redirect status.
 */
function bbpa_is_redirect_status(int $status): bool {
	return $status >= 300 && $status < 400;
}

/**
 * Remember redirects triggered through wp_redirect().
 *
 * @param mixed $location Redirect destination, usually a string.
 * @param mixed $status   Redirect HTTP status.
 * @return mixed Original location value.
 */
function bbpa_mark_runtime_redirect($location, $status = 302) {
	if (is_string($location) && trim($location) !== '' && bbpa_is_redirect_status((int) $status)) {
		bbpa_mark_runtime_redirect_detected();
	}

	return $location;
}

/**
 * Remember redirects whose status is filtered independently.
 *
 * @param mixed $status   Redirect HTTP status.
 * @param mixed $location Redirect destination, usually a string.
 * @return mixed Original status value.
 */
function bbpa_mark_runtime_redirect_status($status, $location = '') {
	if (is_string($location) && trim($location) !== '' && bbpa_is_redirect_status((int) $status)) {
		bbpa_mark_runtime_redirect_detected();
	}

	return $status;
}

/**
 * Detect direct Location headers that bypass wp_redirect().
 */
function bbpa_response_has_location_header(): bool {
	foreach (headers_list() as $header) {
		if (stripos((string) $header, 'Location:') === 0) {
			return true;
		}
	}

	return false;
}

/**
 * Return the current response code when PHP exposes it.
 */
function bbpa_get_current_response_status(): int {
	$status = http_response_code();

	return is_int($status) ? $status : 0;
}

/**
 * Store 404 requests only once the final response is known not to be redirected.
 */
function bbpa_track_final_not_found_request(): void {
	if (!function_exists('is_404') || !is_404()) {
		return;
	}

	if (bbpa_runtime_redirect_was_detected() || bbpa_response_has_location_header()) {
		return;
	}

	$status = bbpa_get_current_response_status();
	if ($status !== 0 && $status !== 404) {
		return;
	}

	bbpa_track_request();
}

/**
 * Keep technical well-known endpoints out of the human-facing 404 report.
 */
function bbpa_filter_not_found_report_technical_paths($response, $server, $request) {
	if (!$response instanceof WP_REST_Response || !$request instanceof WP_REST_Request) {
		return $response;
	}

	if ($request->get_route() !== '/' . BBPA_REST_NAMESPACE . '/404s') {
		return $response;
	}

	$payload = $response->get_data();
	if (!is_array($payload) || !isset($payload['items']) || !is_array($payload['items'])) {
		return $response;
	}

	$removed_items = 0;
	$payload['items'] = array_values(
		array_filter(
			$payload['items'],
			static function (array $item) use (&$removed_items): bool {
				$label = isset($item['label']) ? strtolower(trim((string) $item['label'])) : '';
				if ($label === '/.well-known' || str_starts_with($label, '/.well-known/')) {
					$removed_items++;

					return false;
				}

				return true;
			}
		)
	);

	if ($removed_items > 0 && isset($payload['pagination']) && is_array($payload['pagination'])) {
		$total_items = isset($payload['pagination']['totalItems']) ? (int) $payload['pagination']['totalItems'] : 0;
		$per_page = isset($payload['pagination']['perPage']) ? max(1, (int) $payload['pagination']['perPage']) : 10;
		$payload['pagination']['totalItems'] = max(0, $total_items - $removed_items);
		$payload['pagination']['totalPages'] = (int) ceil($payload['pagination']['totalItems'] / $per_page);
	}

	$response->set_data($payload);

	return $response;
}
