<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Premium REST route helpers for BimBeau Privacy Analytics.
 */

/**
 * Resolve the premium city coordinates service class name without exposing a static class reference in Free packages.
 */
function bbpa_get_city_coordinates_service_class(): string
{
    return 'BBPA_City_' . 'Coordinates_Service';
}

/**
 * Build a normalized authentication response used by events panel REST routes.
 */
function bbpa_build_events_panel_authentication_error(): WP_Error
{
    return new WP_Error(
        'bbpa_auth_required',
        __('Authentication is required to access analytics data.', 'bimbeau-privacy-analytics'),
        [
            'status' => 401,
            'auth' => 'required',
        ]
    );
}

/**
 * Validate request nonce for REST or app-session contexts on events panel reads.
 */
function bbpa_has_valid_events_panel_rest_nonce(WP_REST_Request $request): bool
{
    return bbpa_rest_request_has_valid_nonce($request);
}

/**
 * Check whether the current user can read the events panel analytics data.
 */
function bbpa_events_panel_user_can_access(): bool
{
    if (function_exists('bbpa_current_user_can_access_panel')) {
        return bbpa_current_user_can_access_panel('events');
    }

    if (function_exists('bbpa_get_panel_capability')) {
        return current_user_can(bbpa_get_panel_capability('events'));
    }

    if (function_exists('bbpa_get_required_admin_capability')) {
        return current_user_can(bbpa_get_required_admin_capability());
    }

    $capability = apply_filters('bbpa_admin_capability', 'manage_options');
    $capability = is_string($capability) && $capability !== '' ? sanitize_key($capability) : 'manage_options';

    return current_user_can($capability);
}

/**
 * Permission callback for read-only events panel endpoints.
 */
function bbpa_check_events_panel_rest_permissions(WP_REST_Request $request)
{
    if (!bbpa_has_valid_events_panel_rest_nonce($request)) {
        return bbpa_build_events_panel_authentication_error();
    }

    if (!is_user_logged_in()) {
        return bbpa_build_events_panel_authentication_error();
    }

    if (!bbpa_events_panel_user_can_access()) {
        return bbpa_build_events_panel_authentication_error();
    }

    return true;
}

/**
 * Determine whether a REST endpoint handler supports a given HTTP method.
 *
 * @param array<string, mixed> $endpoint
 */
function bbpa_rest_endpoint_allows_method(array $endpoint, string $method): bool
{
    if (!isset($endpoint['methods'])) {
        return false;
    }

    $method = strtoupper($method);
    $methods = $endpoint['methods'];
    if (is_string($methods)) {
        $method_list = array_map('trim', explode(',', strtoupper($methods)));

        return in_array($method, $method_list, true);
    }

    if (!is_array($methods)) {
        return false;
    }

    foreach ($methods as $key => $value) {
        $candidate = is_string($key) ? $key : (is_string($value) ? $value : '');
        if (strtoupper($candidate) === $method) {
            return true;
        }
    }

    return false;
}

/**
 * Allow role-authorized analytics users to read the events panel data.
 *
 * The events panel stats mode needs both the events stats endpoint and the
 * read-only events configuration endpoint for labels and KPI context. Keep
 * write access on the events configuration endpoint tied to settings access.
 *
 * @param array<string, mixed> $endpoints
 */
function bbpa_allow_events_panel_reader_endpoints(array $endpoints): array
{
    $permission_callback = 'bbpa_check_events_panel_rest_permissions';

    $events_stats_route = '/' . BBPA_REST_INTERNAL_NAMESPACE . '/admin/events-stats';
    if (isset($endpoints[$events_stats_route]) && is_array($endpoints[$events_stats_route])) {
        foreach ($endpoints[$events_stats_route] as $index => $endpoint) {
            if (!is_array($endpoint) || !bbpa_rest_endpoint_allows_method($endpoint, 'GET')) {
                continue;
            }

            $endpoints[$events_stats_route][$index]['permission_callback'] = $permission_callback;
        }
    }

    $events_config_route = '/' . BBPA_REST_INTERNAL_NAMESPACE . '/admin/events-config';
    if (isset($endpoints[$events_config_route]) && is_array($endpoints[$events_config_route])) {
        foreach ($endpoints[$events_config_route] as $index => $endpoint) {
            if (
                !is_array($endpoint)
                || !bbpa_rest_endpoint_allows_method($endpoint, 'GET')
                || bbpa_rest_endpoint_allows_method($endpoint, 'PUT')
            ) {
                continue;
            }

            $endpoints[$events_config_route][$index]['permission_callback'] = $permission_callback;
        }
    }

    return $endpoints;
}
if (function_exists('bbpa_is_pro') && bbpa_is_pro()) {
    add_filter('rest_endpoints', 'bbpa_allow_events_panel_reader_endpoints');
}

/**
 * Resolve a scalar value from the accepted realtime map payload keys.
 *
 * @param array<string, mixed> $source
 * @param array<int, string>  $keys
 */
function bbpa_realtime_map_source_value(array $source, array $keys): string
{
    foreach ($keys as $key) {
        if (!isset($source[$key])) {
            continue;
        }

        $value = $source[$key];
        if (is_string($value) && trim($value) !== '') {
            return sanitize_text_field($value);
        }

        if (is_numeric($value)) {
            return sanitize_text_field((string) $value);
        }
    }

    return '';
}

/**
 * Resolve the coordinates for a realtime visit or map point.
 *
 * @param array<string, mixed> $source
 *
 * @return array{latitude: ?float, longitude: ?float}
 */
function bbpa_resolve_realtime_map_source_coordinates(array $source, object $coordinates_service): array
{
    $coordinates = bbpa_normalize_coordinate_pair(
        $source['latitude'] ?? $source['lat'] ?? null,
        $source['longitude'] ?? $source['lng'] ?? $source['lon'] ?? null
    );

    if ($coordinates['latitude'] !== null && $coordinates['longitude'] !== null) {
        return $coordinates;
    }

    $country_code = bbpa_normalize_country_code(
        bbpa_realtime_map_source_value($source, ['country_code', 'countryCode'])
    );
    $city_name = bbpa_realtime_map_source_value($source, ['city', 'city_name', 'cityName', 'label']);
    $geoname_id = function_exists('bbpa_normalize_geoname_id')
        ? bbpa_normalize_geoname_id($source['city_geoname_id'] ?? $source['cityGeonameId'] ?? null)
        : null;

    if ($geoname_id !== null) {
        $coordinates = $coordinates_service->resolve_coordinates_by_geoname_id($geoname_id);
    }

    if (($coordinates['latitude'] ?? null) === null || ($coordinates['longitude'] ?? null) === null) {
        if ($city_name !== '' && $country_code !== '') {
            $coordinates = $coordinates_service->resolve_coordinates($city_name, $country_code);
        }
    }

    if (($coordinates['latitude'] ?? null) === null || ($coordinates['longitude'] ?? null) === null) {
        if ($country_code !== '') {
            $coordinates = $coordinates_service->resolve_country_coordinates($country_code);
        }
    }

    return [
        'latitude' => isset($coordinates['latitude']) && is_numeric($coordinates['latitude'])
            ? (float) $coordinates['latitude']
            : null,
        'longitude' => isset($coordinates['longitude']) && is_numeric($coordinates['longitude'])
            ? (float) $coordinates['longitude']
            : null,
    ];
}

/**
 * Build a human-readable marker label from realtime visit metadata.
 *
 * @param array<string, mixed> $source
 */
function bbpa_get_realtime_map_source_label(array $source): string
{
    $country_code = bbpa_normalize_country_code(
        bbpa_realtime_map_source_value($source, ['country_code', 'countryCode'])
    );
    $city_label = bbpa_realtime_map_source_value($source, ['city', 'city_name', 'cityName', 'label']);

    if ($city_label !== '' && $country_code !== '' && strpos($city_label, '(' . $country_code . ')') === false) {
        return sprintf('%s (%s)', $city_label, $country_code);
    }

    if ($city_label !== '') {
        return $city_label;
    }

    return $country_code;
}

/**
 * Add one normalized realtime point to a map keyed by rounded coordinates.
 *
 * @param array<string, array<string, mixed>> $points_by_key
 * @param array<string, mixed>                $source
 */
function bbpa_add_realtime_response_map_point(array &$points_by_key, array $source, object $coordinates_service, bool $preserve_source_weight): void
{
    $coordinates = bbpa_resolve_realtime_map_source_coordinates($source, $coordinates_service);
    if ($coordinates['latitude'] === null || $coordinates['longitude'] === null) {
        return;
    }

    $latitude = (float) $coordinates['latitude'];
    $longitude = (float) $coordinates['longitude'];
    $point_key = sprintf('%.4F|%.4F', $latitude, $longitude);

    if (isset($points_by_key[$point_key])) {
        if (!$preserve_source_weight) {
            $points_by_key[$point_key]['weight'] = max(1, (int) ($points_by_key[$point_key]['weight'] ?? 1)) + 1;
        }

        return;
    }

    $source_weight = max(1, (int) (
        $source['weight'] ??
        $source['hits'] ??
        $source['count'] ??
        1
    ));
    $weight = $preserve_source_weight ? $source_weight : 1;
    $accuracy_radius = isset($source['accuracy_radius']) && is_numeric($source['accuracy_radius'])
        ? max(0, (int) $source['accuracy_radius'])
        : (isset($source['accuracyRadius']) && is_numeric($source['accuracyRadius'])
            ? max(0, (int) $source['accuracyRadius'])
            : null);

    $points_by_key[$point_key] = [
        'lat' => $latitude,
        'lng' => $longitude,
        'weight' => $weight,
        'city' => bbpa_get_realtime_map_source_label($source),
        'accuracy_radius' => $accuracy_radius,
        'currentPage' => bbpa_realtime_map_source_value($source, ['currentPage', 'current_page', 'page_path']),
    ];
}

/**
 * Keep realtime map markers aligned with the final visible visit rows.
 *
 * The realtime controller builds `visits` after merging canonical hits and fallback
 * realtime rows. Older payloads could still expose fewer `consentedMapPoints` than
 * visible geolocated visits, so the map displayed only a subset of table rows.
 */
function bbpa_backfill_realtime_response_map_points($response, $handler, $request)
{
    unset($handler);

    if (!is_object($request) || !method_exists($request, 'get_route')) {
        return $response;
    }

    if ($request->get_route() !== '/' . BBPA_REST_INTERNAL_NAMESPACE . '/admin/realtime') {
        return $response;
    }

    if (!is_object($response) || !method_exists($response, 'get_data') || !method_exists($response, 'set_data')) {
        return $response;
    }

    $payload = $response->get_data();
    if (!is_array($payload) || ($payload['dataScope'] ?? '') === 'essential_only') {
        return $response;
    }

    $visits = isset($payload['visits']) && is_array($payload['visits']) ? $payload['visits'] : [];
    if (!$visits || !class_exists(bbpa_get_city_coordinates_service_class())) {
        return $response;
    }

    $coordinates_service = new (bbpa_get_city_coordinates_service_class())();
    $points_by_key = [];

    foreach ($visits as $visit) {
        if (is_array($visit)) {
            bbpa_add_realtime_response_map_point($points_by_key, $visit, $coordinates_service, false);
        }
    }

    $existing_points = [];
    if (isset($payload['consentedMapPoints']) && is_array($payload['consentedMapPoints'])) {
        $existing_points = $payload['consentedMapPoints'];
    } elseif (isset($payload['points']) && is_array($payload['points'])) {
        $existing_points = $payload['points'];
    }

    foreach ($existing_points as $point) {
        if (is_array($point)) {
            bbpa_add_realtime_response_map_point($points_by_key, $point, $coordinates_service, true);
        }
    }

    if (!$points_by_key) {
        return $response;
    }

    $points = array_values($points_by_key);
    usort(
        $points,
        static function (array $left, array $right): int {
            return ((int) ($right['weight'] ?? 0)) <=> ((int) ($left['weight'] ?? 0));
        }
    );

    $payload['points'] = $points;
    $payload['consentedMapPoints'] = $points;
    $response->set_data($payload);

    return $response;
}

add_filter('rest_request_after_callbacks', 'bbpa_backfill_realtime_response_map_points', 10, 3);

