<?php
/**
 * Free country-level geolocation runtime.
 *
 * @package BimBeauPrivacyAnalytics
 */

function bbpa_normalize_country_code($value): string
{
    $code = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', (string) $value), 0, 2));
    return strlen($code) === 2 ? $code : '';
}

function bbpa_get_visit_country_payload(): array
{
    $payload = function_exists('bbpa_get_geolocation_payload') ? bbpa_get_geolocation_payload() : [];
    if (!is_array($payload) || !empty($payload['error'])) {
        return [
            'country_code' => '',
            'country' => '',
        ];
    }

    return [
        'country_code' => bbpa_normalize_country_code($payload['country_code'] ?? ''),
        'country' => isset($payload['country']) ? sanitize_text_field((string) $payload['country']) : '',
    ];
}

function bbpa_register_geoip_update_cron_schedule(array $schedules): array
{
    foreach ([
        'monthly' => [30, __('Once Monthly', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_15_days' => [15, __('Every 15 days', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_45_days' => [45, __('Every 45 days', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_60_days' => [60, __('Every 60 days', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_3_months' => [90, __('Every 3 months', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_6_months' => [180, __('Every 6 months', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_1_year' => [365, __('Every year', 'bimbeau-privacy-analytics')],
        'bbpa_geoip_2_years' => [730, __('Every 2 years', 'bimbeau-privacy-analytics')],
    ] as $name => [$days, $display]) {
        $schedules[$name] = ['interval' => $days * DAY_IN_SECONDS, 'display' => $display];
    }
    return $schedules;
}

function bbpa_ensure_geoip_update_schedule(): void
{
    if (function_exists('bbpa_schedule_geoip_update')) bbpa_schedule_geoip_update(false);
}

function bbpa_run_monthly_geoip_update(): void
{
    if (function_exists('bbpa_geoip_acquire_update_lock') && !bbpa_geoip_acquire_update_lock()) return;
    try {
        if (!function_exists('bbpa_get_geoip_database_updater')) return;
        $updater = bbpa_get_geoip_database_updater();
        if (!is_object($updater) || !method_exists($updater, 'update_database')) return;
        $result = $updater->update_database();
        if (is_wp_error($result) && function_exists('bbpa_geoip_schedule_retry')) { bbpa_geoip_schedule_retry(); return; }
        if (function_exists('bbpa_geoip_reset_retry_state')) bbpa_geoip_reset_retry_state();
    } finally {
        if (function_exists('bbpa_geoip_release_update_lock')) bbpa_geoip_release_update_lock();
    }
}
