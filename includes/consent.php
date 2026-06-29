<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Consent and collection-policy helpers.
 */

/**
 * Return the UI field visibility matrix by panel context.
 *
 * - essential: always available without advanced consent.
 * - advanced_after_consent: available only when advanced tracking is enabled.
 * - never: never exposed in admin responses/UI.
 */
function bbpa_get_ui_field_visibility_matrix(): array
{
    return [
        'dashboard' => [
            'bucket' => 'essential',
            'pageViews' => 'essential',
            'entries' => 'essential',
            'visits' => 'essential',
            'label' => 'essential',
            'hits' => 'essential',
        ],
        'realtime_visits' => [
            'visitor_id' => 'essential',
            'country_code' => 'essential',
            'country' => 'essential',
            'first_view_at' => 'essential',
            'last_view_at' => 'essential',
            'page_views' => 'essential',
            'city' => 'advanced_after_consent',
            'current_page' => 'advanced_after_consent',
            'referrer_domain' => 'advanced_after_consent',
            'source_category' => 'advanced_after_consent',
            'operating_system' => 'advanced_after_consent',
            'browser' => 'advanced_after_consent',
            'browser_version' => 'advanced_after_consent',
            'device_class' => 'advanced_after_consent',
            'screen_resolution' => 'advanced_after_consent',
            'latitude' => 'never',
            'longitude' => 'never',
        ],
        'realtime_points' => [
            'lat' => 'advanced_after_consent',
            'lng' => 'advanced_after_consent',
            'weight' => 'advanced_after_consent',
            'city' => 'advanced_after_consent',
            'accuracy_radius' => 'advanced_after_consent',
            'currentPage' => 'advanced_after_consent',
        ],
        'referrers' => [
            'label' => 'advanced_after_consent',
            'hits' => 'essential',
        ],
        'geo' => [
            'country_code' => 'essential',
            'country' => 'essential',
            'visits' => 'essential',
            'hits' => 'essential',
            'city' => 'advanced_after_consent',
            'latitude' => 'never',
            'longitude' => 'never',
        ],
        'devices' => [
            'label' => 'advanced_after_consent',
            'hits' => 'essential',
            'visits' => 'essential',
        ],
        'browsers' => [
            'label' => 'advanced_after_consent',
            'hits' => 'essential',
            'visits' => 'essential',
        ],
    ];
}

/**
 * Return whether a field is visible in a panel context for the selected scope.
 */
function bbpa_is_ui_field_visible(string $context, string $field, bool $advanced_enabled): bool
{
    $matrix = bbpa_get_ui_field_visibility_matrix();
    if (!isset($matrix[$context]) || !is_array($matrix[$context])) {
        return true;
    }

    $classification = isset($matrix[$context][$field])
        ? sanitize_key((string) $matrix[$context][$field])
        : 'essential';

    if ($classification === 'never') {
        return false;
    }

    if ($classification === 'advanced_after_consent') {
        return $advanced_enabled;
    }

    return true;
}

/**
 * Return whether the current request carries explicit advanced consent.
 */
function bbpa_can_collect_advanced_fields(array $context = []): bool
{
    $server = $context['server'] ?? $_SERVER;
    if (!is_array($server)) {
        $server = [];
    }

    $raw_signal = $server['HTTP_X_BBPA_CONSENT'] ?? '';
    $signal = strtolower(trim((string) $raw_signal));

    return in_array($signal, ['granted', 'allow', 'yes', '1', 'true'], true);
}

/**
 * Return whether geolocation enrichment is allowed for this request.
 *
 * Fallback behavior when consent settings are missing:
 * - geolocation aggregation defaults to enabled (settings default), and
 * - consent still requires an explicit request signal.
 */
function bbpa_can_enrich_geolocation(array $context = []): bool
{
    $settings = $context['settings'] ?? null;
    if (!is_array($settings)) {
        $settings = function_exists('bbpa_get_settings_defaults') ? bbpa_get_settings_defaults() : [];
    }

    $geo_enabled = true;
    if (array_key_exists('geo_aggregation_enabled', $settings)) {
        $geo_enabled = (bool) rest_sanitize_boolean($settings['geo_aggregation_enabled']);
    }

    if (!$geo_enabled) {
        return false;
    }

    return bbpa_can_collect_advanced_fields($context);
}
