<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Settings helpers for BimBeau Privacy Analytics.
 */

const BBPA_MAX_PATH_LENGTH = 2048;
const BBPA_LEGACY_PRIVACY_OPTIONS_CLEANUP_COMPLETED = 'bbpa_legacy_privacy_options_cleanup_completed';
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN = 300;
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX = 86400;
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_DEFAULT = 1800;
const BBPA_ALLOWED_DISABLED_PANEL_IDS = [
    'realtime',
    'top-pages',
    'acquisition',
    'referrers',
    'search-terms',
    'geolocation',
    'visitors',
    'devices',
    'events',
];
const BBPA_ADVANCED_STATS_DEPENDENT_PANEL_IDS = [
    'geolocation',
    'visitors',
    'devices',
    'events',
];
const BBPA_NON_DISABLABLE_PANEL_IDS = [
    'dashboard',
    'settings',
];
const BBPA_ACCESS_ROLE_KEYS = [
    'stats_access_roles',
    'settings_access_roles',
    'contact_access_roles',
];
const BBPA_DEFAULT_STATS_ACCESS_ROLES = [
    'editor',
];

/**
 * Return roles eligible for delegated access to stats/settings/contact panels.
 *
 * Eligible roles match editor-level capabilities or higher.
 *
 * @return array<int, string>
 */
function bbpa_get_delegable_access_roles(): array
{
    $roles = wp_roles();
    if (!$roles || !isset($roles->roles) || !is_array($roles->roles)) {
        return [];
    }

    $eligible = [];
    foreach ($roles->roles as $role_key => $role_config) {
        if (!is_string($role_key) || $role_key === '') {
            continue;
        }

        $capabilities = [];
        if (is_array($role_config) && isset($role_config['capabilities']) && is_array($role_config['capabilities'])) {
            $capabilities = $role_config['capabilities'];
        }

        $has_editor_level_access = !empty($capabilities['edit_others_posts']) || !empty($capabilities['manage_options']);
        if ($has_editor_level_access) {
            $eligible[] = sanitize_key($role_key);
        }
    }

    return array_values(array_unique(array_filter($eligible)));
}

/**
 * Default settings values.
 */
function bbpa_get_settings_defaults(): array
{
    $defaults = [
        // New installations wait for an explicit administrator wizard choice.
        'advanced_stats_enabled' => false,
        'referrer_favicons_enabled' => false,
        'respect_dnt_gpc' => true,
        'url_strip_query' => true,
        'url_query_allowlist' => ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'gbraid', 'wbraid', 'msclkid'],
        'raw_logs_enabled' => true,
        'raw_logs_retention_days' => 1,
        'aggregated_data_retention_days' => bbpa_get_default_aggregated_retention_days(),
        'overview_totals_retention_days' => 730,
        'aggregated_retention_frequency_days' => 30,
        'excluded_roles' => [],
        'stats_access_roles' => BBPA_DEFAULT_STATS_ACCESS_ROLES,
        'settings_access_roles' => [],
        'contact_access_roles' => [],
        'excluded_paths' => [],
        'debug_enabled' => false,
        'geo_aggregation_enabled' => true,
        'geoip_lookup_mode' => 'local_database',
        'geoip_update_frequency' => 'disabled',
        'maxmind_account_id' => '',
        'maxmind_license_key' => '',
        'visit_identifier_window_seconds' => BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_DEFAULT,
        'disabled_panels' => [],
        'export_async_threshold_rows' => 500,
        'delete_data_on_uninstall' => false,
    ];

    /**
     * Filter default settings before they are written or sanitized.
     *
     * @param array<string, mixed> $defaults Settings defaults.
     */
    return apply_filters('bbpa_settings_defaults', $defaults);
}

/**
 * Get aggregated retention limits for the current privacy mode.
 *
 * @return array{recommended:int,max:int}
 */
function bbpa_get_aggregated_retention_limits(): array
{
    return [
        'recommended' => 365,
        'max' => 3650,
    ];
}

/**
 * Get the default aggregated retention duration in days.
 */
function bbpa_get_default_aggregated_retention_days(): int
{
    $limits = bbpa_get_aggregated_retention_limits();

    return (int) $limits['recommended'];
}

/**
 * Ensure the settings option exists with defaults.
 */
function bbpa_register_settings_option(): void
{
    if (get_option('bbpa_settings', null) === null) {
        add_option('bbpa_settings', bbpa_get_settings_defaults(), '', false);
    }

}

/**
 * Run one-shot cleanup for legacy privacy-mode options.
 */
function bbpa_run_legacy_privacy_options_cleanup(): void
{
    $migration_completed = (bool) rest_sanitize_boolean(
        get_option(BBPA_LEGACY_PRIVACY_OPTIONS_CLEANUP_COMPLETED, false)
    );
    if ($migration_completed) {
        return;
    }

    // Compatibility cleanup only: remove deprecated privacy-mode options.
    delete_option('bbpa_collection_scope');
    delete_option('bbpa_advanced_mode_consent_managed');
    delete_option('bbpa_standard_mode_consent_managed');
    update_option(BBPA_LEGACY_PRIVACY_OPTIONS_CLEANUP_COMPLETED, true, false);
}

/**
 * Sanitize and normalize settings input.
 */
function bbpa_sanitize_settings($settings): array
{
    $defaults = bbpa_get_settings_defaults();

    if (!is_array($settings)) {
        $settings = [];
    }

    $settings = wp_parse_args($settings, $defaults);

    unset($settings['plugin_label']);
    $settings['advanced_stats_enabled'] = (bool) rest_sanitize_boolean($settings['advanced_stats_enabled']);
    $settings['referrer_favicons_enabled'] = (bool) rest_sanitize_boolean($settings['referrer_favicons_enabled'] ?? false);
    $settings['respect_dnt_gpc'] = (bool) rest_sanitize_boolean($settings['respect_dnt_gpc']);
    $settings['url_strip_query'] = (bool) rest_sanitize_boolean($settings['url_strip_query']);
    $settings['maxmind_account_id'] = trim(sanitize_text_field($settings['maxmind_account_id']));
    $settings['maxmind_license_key'] = trim(sanitize_text_field($settings['maxmind_license_key']));
    $visit_identifier_window_seconds = absint($settings['visit_identifier_window_seconds']);
    $settings['visit_identifier_window_seconds'] = max(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN,
        min(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX,
        $visit_identifier_window_seconds
        )
    );
    $lookup_mode = sanitize_key((string) ($settings['geoip_lookup_mode'] ?? ''));
    if (!in_array($lookup_mode, ['local_database', 'maxmind_api'], true)) {
        $lookup_mode = $defaults['geoip_lookup_mode'];
    }
    $settings['geoip_lookup_mode'] = $lookup_mode;

    $geoip_update_frequency = sanitize_key((string) ($settings['geoip_update_frequency'] ?? ''));
    $allowed_geoip_update_frequencies = function_exists('bbpa_get_geoip_update_frequency_options')
        ? array_keys(bbpa_get_geoip_update_frequency_options())
        : ['disabled', '15_days', '30_days', '45_days', '60_days', '3_months', '6_months', '1_year', '2_years'];
    if (!in_array($geoip_update_frequency, $allowed_geoip_update_frequencies, true)) {
        $geoip_update_frequency = $defaults['geoip_update_frequency'];
    }
    $settings['geoip_update_frequency'] = $geoip_update_frequency;
    $settings['geo_aggregation_enabled'] = true;
    $settings['raw_logs_enabled'] = true;
    $settings['debug_enabled'] = (bool) rest_sanitize_boolean($settings['debug_enabled']);
    $export_async_threshold_rows = absint($settings['export_async_threshold_rows'] ?? $defaults['export_async_threshold_rows']);
    if ($export_async_threshold_rows < 1) {
        $export_async_threshold_rows = $defaults['export_async_threshold_rows'];
    }
    $settings['export_async_threshold_rows'] = max(1, min($export_async_threshold_rows, 10000));
    $settings['delete_data_on_uninstall'] = (bool) rest_sanitize_boolean($settings['delete_data_on_uninstall'] ?? false);

    /**
     * Filter sanitized settings before they are persisted or returned.
     *
     * @param array<string, mixed> $settings Sanitized settings.
     * @param array<string, mixed> $defaults Settings defaults.
     */
    $settings = apply_filters('bbpa_sanitized_settings', $settings, $defaults);

    $allowlist = $settings['url_query_allowlist'];
    if (is_string($allowlist)) {
        $allowlist = preg_split('/[\s,]+/', $allowlist);
    }
    if (!is_array($allowlist)) {
        $allowlist = [];
    }
    $allowlist = array_filter(array_map('sanitize_key', $allowlist));
    $settings['url_query_allowlist'] = array_values(array_unique($allowlist));

    $retention_days = is_numeric($settings['raw_logs_retention_days'])
        ? (int) $settings['raw_logs_retention_days']
        : (int) $defaults['raw_logs_retention_days'];
    if ($retention_days === 0) {
        $retention_days = (int) $defaults['raw_logs_retention_days'];
    }
    $settings['raw_logs_retention_days'] = max(1, min($retention_days, 365));

    $retention_limits = bbpa_get_aggregated_retention_limits();
    $aggregated_retention_days = is_numeric($settings['aggregated_data_retention_days'])
        ? (int) $settings['aggregated_data_retention_days']
        : (int) $retention_limits['recommended'];
    if ($aggregated_retention_days === 0) {
        $aggregated_retention_days = (int) $retention_limits['recommended'];
    }
    $settings['aggregated_data_retention_days'] = max(30, min($aggregated_retention_days, (int) $retention_limits['max']));

    $overview_totals_retention_days = is_numeric($settings['overview_totals_retention_days'] ?? null)
        ? (int) $settings['overview_totals_retention_days']
        : 730;
    if ($overview_totals_retention_days === 0) {
        $overview_totals_retention_days = 730;
    }
    $settings['overview_totals_retention_days'] = max(
        $settings['aggregated_data_retention_days'],
        max(365, min($overview_totals_retention_days, 3650))
    );

    $aggregated_retention_frequency_days = is_numeric($settings['aggregated_retention_frequency_days'])
        ? (int) $settings['aggregated_retention_frequency_days']
        : (int) $defaults['aggregated_retention_frequency_days'];
    if ($aggregated_retention_frequency_days === 0) {
        $aggregated_retention_frequency_days = (int) $defaults['aggregated_retention_frequency_days'];
    }
    $settings['aggregated_retention_frequency_days'] = max(1, min($aggregated_retention_frequency_days, 365));

    $strict_mode = !empty($settings['strict_mode']) && rest_sanitize_boolean($settings['strict_mode']);
    $excluded_roles = $settings['excluded_roles'];
    if (is_string($excluded_roles)) {
        $excluded_roles = preg_split('/[\s,]+/', $excluded_roles);
    }
    if (!is_array($excluded_roles)) {
        $excluded_roles = [];
    }
    $excluded_roles = array_filter(array_map('sanitize_key', $excluded_roles));
    $roles = wp_roles();
    $valid_roles = $roles ? array_keys($roles->roles) : [];
    if ($valid_roles) {
        $excluded_roles = array_values(array_intersect($excluded_roles, $valid_roles));
    } else {
        $excluded_roles = [];
    }
    if ($strict_mode && $valid_roles) {
        $excluded_roles = $valid_roles;
    }
    $settings['excluded_roles'] = $excluded_roles;
    unset($settings['strict_mode']);
    foreach (BBPA_ACCESS_ROLE_KEYS as $access_role_key) {
        $settings[$access_role_key] = bbpa_sanitize_settings_role_list(
            $settings[$access_role_key] ?? [],
            bbpa_get_delegable_access_roles()
        );
    }

    $excluded_paths = $settings['excluded_paths'];
    if (is_string($excluded_paths)) {
        $excluded_paths = preg_split('/[\r\n,]+/', $excluded_paths);
    }
    if (!is_array($excluded_paths)) {
        $excluded_paths = [];
    }

    $normalized_paths = [];
    foreach ($excluded_paths as $path) {
        if (!is_string($path)) {
            continue;
        }
        $normalized = bbpa_normalize_path_value($path);
        if ($normalized !== '') {
            $normalized_paths[] = $normalized;
        }
    }
    $settings['excluded_paths'] = array_values(array_unique($normalized_paths));

    $settings['post_views_column_post_types'] = [];
    $settings['post_stats_metabox_post_types'] = [];
    $legacy_hidden_panels = $settings['hidden_panels'] ?? [];
    $disabled_panels = $settings['disabled_panels'] ?? $legacy_hidden_panels;
    $settings['disabled_panels'] = bbpa_normalize_disabled_panels($disabled_panels);
    unset($settings['hidden_panels'], $settings['hidden_dashboard_cards']);

    if (isset($settings['maxmind_api_key'])) {
        unset($settings['maxmind_api_key']);
    }

    return $settings;
}


/**
 * Return the server-side source of truth for panel identifiers that may be disabled.
 *
 * Extensions that register custom admin panels with the `bbpa_admin_panels` filter may
 * add their own panel identifiers here. Dashboard and settings are always excluded.
 *
 * @return array<int, string>
 */
function bbpa_get_allowed_disabled_panel_ids(): array
{
    /**
     * Filter the admin panel identifiers that may be disabled by administrators.
     *
     * The filter receives the default BBPA panel identifiers. Return panel names as
     * registered through `bbpa_admin_panels`; values are sanitized, deduplicated, and
     * dashboard/settings are removed after filtering.
     *
     * @param array<int, string> $panel_ids Allowed disabled panel identifiers.
     */
    $filtered = apply_filters('bbpa_allowed_disabled_panel_ids', BBPA_ALLOWED_DISABLED_PANEL_IDS);
    if (!is_array($filtered)) {
        $filtered = BBPA_ALLOWED_DISABLED_PANEL_IDS;
    }

    $non_disablable_ids = array_values(array_unique(array_map('sanitize_key', BBPA_NON_DISABLABLE_PANEL_IDS)));

    return array_values(
        array_filter(
            array_unique(array_filter(array_map('sanitize_key', $filtered))),
            static function (string $panel_id) use ($non_disablable_ids): bool {
                return !in_array($panel_id, $non_disablable_ids, true);
            }
        )
    );
}

/**
 * Normalize disabled panel identifiers from modern and legacy settings payloads.
 *
 * @param mixed $panel_ids
 * @param array<int, string> $allowed_panel_ids
 * @return array<int, string>
 */
function bbpa_normalize_disabled_panels($panel_ids, ?array $allowed_panel_ids = null): array
{
    $allowed_panel_ids = $allowed_panel_ids ?? bbpa_get_allowed_disabled_panel_ids();
    $normalized = bbpa_sanitize_settings_identifier_list($panel_ids, $allowed_panel_ids);
    if (empty($normalized)) {
        return [];
    }

    $allowed_panel_ids = array_values(array_unique(array_map('sanitize_key', $allowed_panel_ids)));
    $non_disablable_ids = array_values(array_unique(array_map('sanitize_key', BBPA_NON_DISABLABLE_PANEL_IDS)));

    $normalized = array_values(
        array_filter(
            $normalized,
            static function (string $panel_id) use ($non_disablable_ids): bool {
                return !in_array($panel_id, $non_disablable_ids, true);
            }
        )
    );

    if (empty($normalized)) {
        return [];
    }

    $allowed_disable_count = count($allowed_panel_ids);
    if ($allowed_disable_count > 0 && count($normalized) >= $allowed_disable_count) {
        return [];
    }

    return $normalized;
}

/**
 * Sanitize a role list setting value.
 *
 * @param mixed $roles
 * @param array<int, string> $valid_roles
 * @return array<int, string>
 */
function bbpa_sanitize_settings_role_list($roles, array $valid_roles): array
{
    if (is_string($roles)) {
        $roles = preg_split('/[\s,]+/', $roles);
    }

    if (!is_array($roles)) {
        return [];
    }

    $normalized = array_values(
        array_unique(
            array_filter(
                array_map('sanitize_key', $roles)
            )
        )
    );

    if (empty($valid_roles)) {
        return [];
    }

    return array_values(array_intersect($normalized, $valid_roles));
}

/**
 * Sanitize a settings identifier list with a strict allowlist.
 *
 * @param mixed $value Raw input value.
 * @param array $allowlist Allowed identifier values.
 */
function bbpa_sanitize_settings_identifier_list($value, array $allowlist): array
{
    if (is_string($value)) {
        $value = preg_split('/[\s,]+/', $value);
    }

    if (!is_array($value) || empty($allowlist)) {
        return [];
    }

    $normalized_allowlist = array_values(array_unique(array_filter(array_map('sanitize_key', $allowlist))));
    if (empty($normalized_allowlist)) {
        return [];
    }

    $normalized = array_values(array_unique(array_filter(array_map('sanitize_key', $value))));

    return array_values(array_intersect($normalized, $normalized_allowlist));
}

/**
 * Validate MaxMind credentials from settings.
 */
function bbpa_validate_maxmind_settings(array $settings): array
{
    $errors = [];
    $account_id = trim((string) ($settings['maxmind_account_id'] ?? ''));
    $license_key = trim((string) ($settings['maxmind_license_key'] ?? ''));

    if ($account_id === '') {
        $errors['maxmind_account_id'] = __('MaxMind Account ID is required.', 'bimbeau-privacy-analytics');
    } elseif (!ctype_digit($account_id)) {
        $errors['maxmind_account_id'] = __('MaxMind Account ID must be numeric.', 'bimbeau-privacy-analytics');
    }

    if ($license_key === '') {
        $errors['maxmind_license_key'] = __('MaxMind License Key is required.', 'bimbeau-privacy-analytics');
    }

    return $errors;
}

/**
 * Validate MaxMind credentials from raw values.
 */
function bbpa_validate_maxmind_credentials(string $account_id, string $license_key): array
{
    return bbpa_validate_maxmind_settings(
        [
            'maxmind_account_id' => $account_id,
            'maxmind_license_key' => $license_key,
        ]
    );
}

/**
 * Format validation errors for MaxMind credentials.
 */
function bbpa_format_maxmind_errors(array $errors): string
{
    $messages = array_values(array_filter($errors));
    if (!$messages) {
        return __('MaxMind credentials are required to enable IP geolocation.', 'bimbeau-privacy-analytics');
    }

    return implode(' ', $messages);
}

/**
 * Get plugin label used for admin menu and dashboard heading.
 */
function bbpa_get_plugin_label(): string
{
    return __('Statistics', 'bimbeau-privacy-analytics');
}

/**
 * Get sanitized settings with defaults.
 */
function bbpa_get_settings(): array
{
    $settings = get_option('bbpa_settings', []);
    $settings = bbpa_sanitize_settings($settings);

    return $settings;
}

/**
 * Resolve the session window used for visit identifiers.
 */
function bbpa_get_visit_identifier_window_seconds(): int
{
    $settings = bbpa_get_settings();
    $window_seconds = isset($settings['visit_identifier_window_seconds'])
        ? (int) $settings['visit_identifier_window_seconds']
        : BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_DEFAULT;

    return max(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN,
        min(BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX, $window_seconds)
    );
}

/**
 * Parse a request-scoped debug override value.
 */
function bbpa_parse_debug_override_value($value): ?bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_numeric($value)) {
        return ((int) $value) === 1;
    }

    if (!is_string($value)) {
        return null;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '') {
        return null;
    }

    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return null;
}

/**
 * Get debug mode request override from admin URLs or REST headers.
 */
function bbpa_get_debug_mode_request_override(): ?bool
{
    if (
        is_admin()
        && function_exists('bbpa_is_plugin_admin_page')
        && bbpa_is_plugin_admin_page()
        && isset($_GET['bbpa_debug'])
        && current_user_can(bbpa_get_settings_access_capability())
        && isset($_GET['_wpnonce'])
        && is_string($_GET['_wpnonce'])
        && wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_GET['_wpnonce'])), 'bbpa_toggle_debug_mode')
    ) {
        $debug_override = sanitize_text_field(wp_unslash((string) $_GET['bbpa_debug']));
        return bbpa_parse_debug_override_value($debug_override);
    }

    if (isset($_SERVER['HTTP_X_BBPA_DEBUG'])) {
        $debug_header = sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_X_BBPA_DEBUG']));
        return bbpa_parse_debug_override_value($debug_header);
    }

    return null;
}

/**
 * Determine whether debug mode is enabled for the current request.
 */
function bbpa_is_debug_mode_enabled(): bool
{
    $settings = bbpa_get_settings();
    $override = bbpa_get_debug_mode_request_override();
    if ($override !== null) {
        return $override;
    }

    return !empty($settings['debug_enabled']);
}

/**
 * Update settings with sanitization.
 */
function bbpa_update_settings($settings): array
{
    $requested_lookup_mode = '';
    if (is_array($settings) && isset($settings['geoip_lookup_mode'])) {
        $requested_lookup_mode = sanitize_key((string) $settings['geoip_lookup_mode']);
    }
    $previous = bbpa_get_settings();
    $sanitized = bbpa_sanitize_settings($settings);
    $sanitized = apply_filters('bbpa_settings_before_update', $sanitized);
    $lookup_mode = (string) ($sanitized['geoip_lookup_mode'] ?? 'local_database');
    if ($lookup_mode === 'maxmind_api') {
        $errors = bbpa_validate_maxmind_settings($sanitized);
        if ($errors) {
            return new WP_Error(
                'bbpa_invalid_maxmind_credentials',
                bbpa_format_maxmind_errors($errors),
                [
                    'status' => 400,
                    'field_errors' => $errors,
                ]
            );
        }
    }
    update_option('bbpa_settings', $sanitized, false);

    if (function_exists('bbpa_flush_admin_settings_cache')) {
        bbpa_flush_admin_settings_cache();
    } elseif (function_exists('bbpa_flush_admin_cache')) {
        bbpa_flush_admin_cache();
    } elseif (function_exists('bbpa_bump_admin_cache_version')) {
        bbpa_bump_admin_cache_version();
    }

    if (
        $sanitized['raw_logs_retention_days'] !== $previous['raw_logs_retention_days']
        && function_exists('bbpa_schedule_raw_log_cleanup')
    ) {
        bbpa_schedule_raw_log_cleanup(true);
    } elseif (function_exists('bbpa_schedule_raw_log_cleanup')) {
        bbpa_schedule_raw_log_cleanup(false);
    }

    $aggregated_retention_changed = ($sanitized['aggregated_data_retention_days'] ?? null) !== ($previous['aggregated_data_retention_days'] ?? null);
    if ($aggregated_retention_changed && function_exists('bbpa_ensure_aggregation_schedule')) {
        bbpa_ensure_aggregation_schedule();
    }
    $aggregated_retention_frequency_changed = ($sanitized['aggregated_retention_frequency_days'] ?? null) !== ($previous['aggregated_retention_frequency_days'] ?? null);
    if ($aggregated_retention_frequency_changed && function_exists('bbpa_schedule_aggregated_retention_cleanup')) {
        bbpa_schedule_aggregated_retention_cleanup(true);
    } elseif (function_exists('bbpa_schedule_aggregated_retention_cleanup')) {
        bbpa_schedule_aggregated_retention_cleanup(false);
    }

    if (function_exists('bbpa_schedule_geoip_update')) {
        bbpa_schedule_geoip_update($sanitized['geoip_update_frequency'] !== ($previous['geoip_update_frequency'] ?? null));
    }

    return $sanitized;
}

/**
 * Normalize a path for settings storage.
 */
function bbpa_normalize_path_value(string $path): string
{
    $path = trim($path);
    if ($path === '') {
        return '';
    }

    $path = bbpa_lowercase($path);
    $path = '/' . ltrim($path, '/');
    $path = untrailingslashit($path);
    $path = $path === '' ? '/' : $path;

    return bbpa_trim_value($path, BBPA_MAX_PATH_LENGTH);
}

/**
 * Lowercase helper with multibyte support.
 */
function bbpa_lowercase(string $value): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value);
    }

    return strtolower($value);
}

/**
 * Trim a string to a maximum length.
 */
function bbpa_trim_value(string $value, int $max): string
{
    if ($max <= 0) {
        return $value;
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max);
    }

    return substr($value, 0, $max);
}
