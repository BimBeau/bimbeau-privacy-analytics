<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Settings helpers for BimBeau Privacy Analytics.
 */

/**
 * Name of the option that stores the plugin settings.
 */
const BBPA_SETTINGS_OPTION = 'bbpa_settings';
const BBPA_MAX_PATH_LENGTH = 2048;
const BBPA_LEGACY_PRIVACY_OPTIONS_CLEANUP_COMPLETED = 'bbpa_legacy_privacy_options_cleanup_completed';
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN = 300;
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX = 86400;
const BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_DEFAULT = 1800;
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
 * Placeholder returned by the admin REST API instead of a stored MaxMind license key.
 * Sending it back to POST /admin/settings keeps the stored key.
 */
const BBPA_MAXMIND_LICENSE_KEY_MASK = '********';

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
    if (get_option(BBPA_SETTINGS_OPTION, null) === null) {
        add_option(BBPA_SETTINGS_OPTION, bbpa_get_settings_defaults(), '', false);
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

    $input = $settings;
    $settings = wp_parse_args($settings, $defaults);

    unset($settings['plugin_label']);
    $settings['advanced_stats_enabled'] = (bool) rest_sanitize_boolean($settings['advanced_stats_enabled']);
    $settings['referrer_favicons_enabled'] = bbpa_sanitize_opt_in_boolean_setting($settings['referrer_favicons_enabled'] ?? false);
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
    $allowed_geoip_update_frequencies = array_keys(bbpa_get_geoip_update_frequency_options());
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
     * @param array<string, mixed> $input    Settings as received, before the defaults were merged in. Lets a
     *                                       callback tell a stored value from a default.
     */
    $settings = apply_filters('bbpa_sanitized_settings', $settings, $defaults, $input);

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

    // Retired keys: no module reads them, the post views column and key stats metabox use their own post type setting.
    unset(
        $settings['post_views_column_post_types'],
        $settings['post_stats_metabox_post_types'],
        $settings['hidden_dashboard_cards']
    );

    if (isset($settings['maxmind_api_key'])) {
        unset($settings['maxmind_api_key']);
    }

    return $settings;
}


/**
 * Sanitize an opt-in boolean setting with the same rules as the admin settings screen.
 *
 * rest_sanitize_boolean() turns every string except "false" and "0" into true, so "no" or "off" would enable an
 * opt-in feature. Strings "0", "false", "off", "no" (any case) are false, "1", "true", "on", "yes" are true.
 *
 * @param mixed $value Raw setting value.
 */
function bbpa_sanitize_opt_in_boolean_setting($value): bool
{
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if (in_array($normalized, ['', '0', 'false', 'off', 'no'], true)) {
            return false;
        }
        if (in_array($normalized, ['1', 'true', 'on', 'yes'], true)) {
            return true;
        }
    }

    return (bool) $value;
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
 *
 * The sanitized result is memoized for the current request. The memo is reused
 * only while the raw stored option, the callbacks of the filters used during
 * sanitization and the site roles are identical to the ones used to build it,
 * so any write (bbpa_update_settings(), update_option(), an option filter), a
 * blog switch or a filter registered later in the request rebuilds it.
 */
function bbpa_get_settings(): array
{
    $raw_settings = get_option(BBPA_SETTINGS_OPTION, []);
    $filters_signature = bbpa_get_settings_filters_signature();
    $roles = bbpa_get_settings_cache_roles();
    $memo = bbpa_settings_runtime_cache();
    if (
        is_array($memo)
        && $memo['filters'] === $filters_signature
        && $memo['raw'] === $raw_settings
        && $memo['roles'] === $roles
    ) {
        return $memo['settings'];
    }

    $settings = bbpa_sanitize_settings($raw_settings);

    // Only keys owned by the loaded edition are visible at runtime. Module data
    // remains opaque in the stored option until its owning edition is loaded.
    $settings = array_intersect_key($settings, bbpa_get_settings_defaults());

    bbpa_settings_runtime_cache(
        false,
        [
            'raw' => $raw_settings,
            'filters' => $filters_signature,
            'roles' => $roles,
            'settings' => $settings,
        ]
    );

    return $settings;
}

/**
 * Read, store or reset the per-request memo used by bbpa_get_settings().
 *
 * @internal Read settings with bbpa_get_settings() and reset the memo with bbpa_reset_settings_cache().
 *
 * @param bool                      $reset Whether to drop the memoized entry.
 * @param array<string, mixed>|null $entry Entry to store, or null to only read the current entry.
 * @return array<string, mixed>|null Current memo entry, or null when nothing is memoized.
 */
function bbpa_settings_runtime_cache(bool $reset = false, ?array $entry = null): ?array
{
    static $memo = null;

    if ($reset) {
        $memo = null;
        return null;
    }

    if ($entry !== null) {
        $memo = $entry;
    }

    return $memo;
}

/**
 * Drop the settings memoized for the current request.
 *
 * Runs on every write of the `bbpa_settings` option and on blog switches. The
 * memo also compares the raw option on each read, so these hooks are a safety net.
 */
function bbpa_reset_settings_cache(): void
{
    bbpa_settings_runtime_cache(true);
}
add_action('add_option_bbpa_settings', 'bbpa_reset_settings_cache', 10, 0);
add_action('update_option_bbpa_settings', 'bbpa_reset_settings_cache', 10, 0);
add_action('delete_option_bbpa_settings', 'bbpa_reset_settings_cache', 10, 0);
add_action('switch_blog', 'bbpa_reset_settings_cache', 10, 0);

/**
 * Build a signature of the filter callbacks that influence settings sanitization.
 *
 * @return string Signature that changes when one of these filters gains or loses a callback.
 */
function bbpa_get_settings_filters_signature(): string
{
    global $wp_filter;

    $hooks = [
        'bbpa_settings_defaults',
        'bbpa_sanitized_settings',
        'bbpa_allowed_disabled_panel_ids',
        'bbpa_events_kpi_slot_limit',
        'bbpa_events_registry',
        'bbpa_event_actions_registry',
        'bbpa_event_action_payload',
    ];

    $parts = [];
    foreach ($hooks as $hook) {
        if (!isset($wp_filter[$hook]) || !$wp_filter[$hook] instanceof WP_Hook) {
            continue;
        }

        foreach ($wp_filter[$hook]->callbacks as $priority => $callbacks) {
            if (!is_array($callbacks) || $callbacks === []) {
                continue;
            }

            $parts[] = $hook . '@' . $priority . ':' . implode(',', array_keys($callbacks));
        }
    }

    return implode('|', $parts);
}

/**
 * Return the role definitions that settings sanitization depends on.
 *
 * @return array<string, mixed>
 */
function bbpa_get_settings_cache_roles(): array
{
    if (!function_exists('wp_roles')) {
        return [];
    }

    $roles = wp_roles();

    return is_array($roles->roles) ? $roles->roles : [];
}

/**
 * Determine whether a submitted MaxMind license key is the REST placeholder.
 *
 * @param mixed $value Submitted license key.
 */
function bbpa_is_masked_maxmind_license_key($value): bool
{
    return is_string($value) && trim($value) === BBPA_MAXMIND_LICENSE_KEY_MASK;
}

/**
 * Prepare settings for admin REST responses without exposing stored secrets.
 *
 * The MaxMind license key keeps its place in the payload but carries
 * BBPA_MAXMIND_LICENSE_KEY_MASK when a key is stored (an empty string otherwise),
 * and the additive `maxmind_license_key_set` flag tells clients whether a key is saved.
 *
 * @param array<string, mixed> $settings Sanitized settings.
 * @return array<string, mixed>
 */
function bbpa_prepare_settings_for_rest_response(array $settings): array
{
    if (!array_key_exists('maxmind_license_key', $settings)) {
        return $settings;
    }

    $has_license_key = is_string($settings['maxmind_license_key']) && trim($settings['maxmind_license_key']) !== '';
    $settings['maxmind_license_key'] = $has_license_key ? BBPA_MAXMIND_LICENSE_KEY_MASK : '';
    $settings['maxmind_license_key_set'] = $has_license_key;

    return $settings;
}

/**
 * Return setting keys that must be removed from the shared option.
 *
 * Unknown keys are otherwise retained as opaque module data. Extensions may
 * declare retired keys here once their migration no longer needs the value.
 *
 * @return array<int, string>
 */
function bbpa_get_deprecated_settings_keys(): array
{
    $keys = [
        'hidden_dashboard_cards',
        'maxmind_api_key',
        'plugin_label',
        'post_stats_metabox_post_types',
        'post_views_column_post_types',
        'strict_mode',
    ];

    /**
     * Filter setting keys that are intentionally deleted during general writes.
     *
     * @param array<int, string> $keys Deprecated setting keys.
     */
    $keys = apply_filters('bbpa_deprecated_settings_keys', $keys);
    if (!is_array($keys)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map('sanitize_key', $keys))));
}

/**
 * Resolve the session window used for visit identifiers.
 *
 * @param array<string, mixed>|null $settings Already sanitized settings, to avoid reading the option again.
 */
function bbpa_get_visit_identifier_window_seconds(?array $settings = null): int
{
    if ($settings === null) {
        $settings = bbpa_get_settings();
    }
    $window_seconds = isset($settings['visit_identifier_window_seconds'])
        ? (int) $settings['visit_identifier_window_seconds']
        : BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_DEFAULT;

    return max(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN,
        min(BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX, $window_seconds)
    );
}

/**
 * Determine whether debug mode is enabled for the current request.
 */
function bbpa_is_debug_mode_enabled(): bool
{
    $settings = bbpa_get_settings();
    return !empty($settings['debug_enabled']);
}

/**
 * Update settings with sanitization.
 *
 * The update is partial: settings keys absent from $settings keep their stored
 * value, while keys present in $settings are applied, including deliberately
 * emptied lists. A caller that sends the complete settings object (the settings
 * screen) therefore replaces every managed value, as before. A MaxMind license
 * key equal to BBPA_MAXMIND_LICENSE_KEY_MASK is treated as absent.
 *
 * @param mixed $settings Settings input (key => value).
 * @return array<string, mixed>|WP_Error Sanitized settings owned by the loaded edition, or a WP_Error
 *                                       (HTTP 400 data with `field_errors`) when the MaxMind API mode is
 *                                       selected with missing or invalid credentials. Nothing is written on error.
 */
function bbpa_update_settings($settings)
{
    $raw_previous = get_option(BBPA_SETTINGS_OPTION, []);
    if (!is_array($raw_previous)) {
        $raw_previous = [];
    }
    $previous = bbpa_get_settings();
    if (is_array($settings) && array_key_exists('maxmind_license_key', $settings) && bbpa_is_masked_maxmind_license_key($settings['maxmind_license_key'])) {
        unset($settings['maxmind_license_key']);
    }
    $settings = apply_filters('bbpa_settings_input_before_sanitize', $settings, $previous);
    if (!is_array($settings)) {
        $settings = [];
    }

    // Only defaults registered by the loaded runtime define writable keys.
    // Values owned by absent modules remain opaque and cannot enter sanitizers.
    $defaults = bbpa_get_settings_defaults();
    $managed_input = array_intersect_key($settings, $defaults);
    // Partial update: managed keys omitted from the input keep their current
    // value instead of falling back to the defaults.
    $managed_input = array_merge(array_intersect_key($previous, $defaults), $managed_input);
    $sanitized = bbpa_sanitize_settings($managed_input);
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
    $persisted = array_merge($raw_previous, $sanitized);
    foreach (bbpa_get_deprecated_settings_keys() as $deprecated_key) {
        unset($persisted[$deprecated_key]);
    }
    update_option(BBPA_SETTINGS_OPTION, $persisted, false);

    if (!empty($sanitized['referrer_favicons_enabled']) && empty($previous['referrer_favicons_enabled'])) {
        BBPA_Favicon_Resolver::invalidate_negative_cache();
    }

    bbpa_flush_admin_settings_cache();

    bbpa_schedule_raw_log_cleanup($sanitized['raw_logs_retention_days'] !== $previous['raw_logs_retention_days']);

    $aggregated_retention_changed = ($sanitized['aggregated_data_retention_days'] ?? null) !== ($previous['aggregated_data_retention_days'] ?? null);
    if ($aggregated_retention_changed) {
        bbpa_ensure_aggregation_schedule();
    }
    $aggregated_retention_frequency_changed = ($sanitized['aggregated_retention_frequency_days'] ?? null) !== ($previous['aggregated_retention_frequency_days'] ?? null);
    bbpa_schedule_aggregated_retention_cleanup($aggregated_retention_frequency_changed);

    bbpa_schedule_geoip_update($sanitized['geoip_update_frequency'] !== ($previous['geoip_update_frequency'] ?? null));

    // Same projection as bbpa_get_settings(): only keys owned by the loaded edition.
    return array_intersect_key($sanitized, $defaults);
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
