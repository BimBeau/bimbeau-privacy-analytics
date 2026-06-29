<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Front-end hooks for BimBeau Privacy Analytics.
 */


/**
 * Build localized tracker settings shared by front and admin tracker runtimes.
 */
function bbpa_build_tracker_localized_settings(?int $post_id, bool $auto_track, ?string $page_path_override): array
{
    $settings = [];
    if (function_exists('bbpa_get_settings')) {
        $raw_settings = bbpa_get_settings();
        if (is_array($raw_settings)) {
            $settings = $raw_settings;
        }
    }

    $excluded_roles = isset($settings['excluded_roles']) && is_array($settings['excluded_roles'])
        ? $settings['excluded_roles']
        : [];

    $respect_dnt_gpc = isset($settings['respect_dnt_gpc']) && is_bool($settings['respect_dnt_gpc'])
        ? $settings['respect_dnt_gpc']
        : true;

    $debug_enabled = isset($settings['debug_enabled']) && is_bool($settings['debug_enabled'])
        ? $settings['debug_enabled']
        : false;
    $debug_query_enabled = false;
    if (isset($_GET['bbpa_debug'])) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only debug query flag, no state change.
        $debug_query_enabled = sanitize_text_field(wp_unslash((string) $_GET['bbpa_debug'])) === '1'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only debug query flag, no state change.
    }
    $debug_runtime_enabled = $debug_enabled || $debug_query_enabled;
    $run_id = function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : uniqid('bbpa_', true);
    $advanced_stats_enabled = isset($settings['advanced_stats_enabled']) && is_bool($settings['advanced_stats_enabled'])
        ? $settings['advanced_stats_enabled']
        : true;

    $current_user = wp_get_current_user();
    $current_user_roles = $current_user instanceof WP_User && is_array($current_user->roles)
        ? $current_user->roles
        : [];

    $is_user_excluded_by_role = !empty(array_intersect($excluded_roles, $current_user_roles));


    $visit_identifier_window_seconds = function_exists('bbpa_get_visit_identifier_window_seconds')
        ? bbpa_get_visit_identifier_window_seconds()
        : 1800;


    return [
        'restUrl' => esc_url_raw(rest_url()),
        'restNamespace' => BBPA_REST_NAMESPACE,
        'postId' => $post_id,
        'autoTrack' => $auto_track,
        'pagePathOverride' => $page_path_override,
        'isUserExcludedByRole' => (bool) $is_user_excluded_by_role,
        'respectDntGpc' => (bool) $respect_dnt_gpc,
        'debugEnabled' => (bool) $debug_runtime_enabled,
        'debug_enabled' => (bool) $debug_runtime_enabled,
        'runId' => (string) $run_id,
        'advanced_stats_enabled' => (bool) $advanced_stats_enabled,
        'visitIdentifierWindowSeconds' => (int) $visit_identifier_window_seconds,


    ];
}


/**
 * Build front event registry exposed to the advanced tracker runtime.
 */
function bbpa_get_front_event_registry(): array
{
    $default_registry = [
        'page_view' => [
            'description' => 'Essential page view event collected by the base tracker runtime.',
            'allowedParams' => ['page_path', 'post_id'],
        ],
        'enrichment_update' => [
            'description' => 'Advanced tracker enrichment payload sent when runtime starts.',
            'allowedParams' => ['active_ms_delta', 'screen_resolution', 'referrer_domain', 'device_class'],
        ],
        'heartbeat' => [
            'description' => 'Advanced tracker heartbeat payload sent while user stays active.',
            'allowedParams' => ['active_ms_delta', 'screen_resolution', 'referrer_domain', 'device_class'],
        ],
    ];

    $filtered_registry = apply_filters('bbpa_front_event_registry', $default_registry);

    return is_array($filtered_registry) ? $filtered_registry : $default_registry;
}

/**
 * Build advanced tracker runtime config exposed to JavaScript.
 */
function bbpa_get_advanced_tracker_runtime_config(): array
{
    $default_config = [
        'eventRegistry' => bbpa_get_front_event_registry(),
    ];

    $filtered_config = apply_filters('bbpa_advanced_tracker_runtime_config', $default_config);

    if (!is_array($filtered_config)) {
        return $default_config;
    }

    if (!isset($filtered_config['eventRegistry']) || !is_array($filtered_config['eventRegistry'])) {
        $filtered_config['eventRegistry'] = $default_config['eventRegistry'];
    }

    return $filtered_config;
}


/**
 * Write event runtime debug messages to PHP logs.
 *
 * @param string $message
 * @param array<string, mixed> $context
 */
function bbpa_log_event_debug(string $message, array $context = []): void
{
    if (!function_exists('bbpa_is_debug_mode_enabled') || !bbpa_is_debug_mode_enabled()) {
        return;
    }

    bbpa_safe_log('Event', 'debug', $message, $context);
}

/**
 * Enqueue the tracker script and inject runtime settings.
 */
function bbpa_enqueue_front_assets(): void
{
    static $did_enqueue = false;
    if ($did_enqueue) {
        return;
    }



    $did_enqueue = true;

    $essential_handle = 'bbpa-essential-tracker';
    $advanced_handle = 'bbpa-advanced-tracker';
    wp_register_script(
        $essential_handle,
        BBPA_URL . 'assets/js/bbpa-essential-tracker.js',
        [],
        BBPA_VERSION,
        true
    );
    $settings = bbpa_build_tracker_localized_settings(
        is_singular() ? get_queried_object_id() : null,
        false,
        null
    );
    $runtime_config_payload = [
        'BBPATracker' => $settings,
        'BPAEventRegistryConfig' => bbpa_get_advanced_tracker_runtime_config(),
    ];
    $runtime_config_json = wp_json_encode($runtime_config_payload);
    if (is_string($runtime_config_json) && $runtime_config_json !== '') {
        $runtime_inline_script = 'window.__bbpaRuntimeConfig = Object.freeze(' . $runtime_config_json . ');';
        wp_add_inline_script($essential_handle, $runtime_inline_script, 'before');
        wp_script_add_data($essential_handle, 'bbpa_runtime_config', base64_encode($runtime_config_json));
    }

    if (!is_admin()) {
        bbpa_log_event_debug('Front tracker settings prepared.', [

            'debug_enabled' => !empty($settings['debugEnabled']),
        ]);
    }

    wp_enqueue_script($essential_handle);

    if (!empty($settings['advanced_stats_enabled'])) {
        wp_register_script(
            $advanced_handle,
            BBPA_URL . 'assets/js/bbpa-advanced-tracker.js',
            [$essential_handle],
            BBPA_VERSION,
            true
        );

        foreach (bbpa_get_advanced_tracker_cmp_attributes($advanced_handle) as $attribute_name => $attribute_value) {
            wp_script_add_data($advanced_handle, $attribute_name, $attribute_value);
        }
        wp_enqueue_script($advanced_handle);


    }

}

/**
 * Resolve customizable CMP attributes for the advanced tracker script tag.
 */
function bbpa_get_advanced_tracker_cmp_attributes(string $handle): array
{
    $default_attributes = [];

    $filtered_attributes = apply_filters('bbpa_advanced_tracker_cmp_attributes', $default_attributes, $handle);
    if (!is_array($filtered_attributes)) {
        return $default_attributes;
    }

    return $filtered_attributes;
}


function bbpa_get_front_tracker_script_handles(): array
{
    return [
        'bbpa-essential-tracker',
        'bbpa-advanced-tracker',
    ];
}


/**
 * Add optimization bypass attributes for BimBeau Privacy Analytics tracker scripts.
 */
function bbpa_add_front_tracker_no_optimize_attributes(array $attributes, string $handle): array
{
    if (in_array($handle, bbpa_get_front_tracker_script_handles(), true)) {
        $attributes['data-no-optimize'] = '1';
        $attributes['data-no-defer'] = '1';
        $attributes['data-no-minify'] = '1';
        $attributes['data-cfasync'] = 'false';
    }

    return $attributes;
}

/**
 * Add optimization bypass and optional CMP attributes to tracker script tags in final HTML output.
 */
function bbpa_filter_front_tracker_script_tag(string $tag, string $handle, string $src): string
{
    if (!in_array($handle, bbpa_get_front_tracker_script_handles(), true)) {
        return $tag;
    }

    if (!is_string($tag) || $tag === '') {
        return $tag;
    }

    $script_attributes = [];
    if ($handle === 'bbpa-advanced-tracker') {
        $script_attributes = bbpa_get_advanced_tracker_cmp_attributes($handle);
    }

    if (!array_key_exists('data-no-optimize', $script_attributes)) {
        $script_attributes['data-no-optimize'] = '1';
    }
    if (!array_key_exists('data-no-defer', $script_attributes)) {
        $script_attributes['data-no-defer'] = '1';
    }
    if (!array_key_exists('data-no-minify', $script_attributes)) {
        $script_attributes['data-no-minify'] = '1';
    }
    if (!array_key_exists('data-cfasync', $script_attributes)) {
        $script_attributes['data-cfasync'] = 'false';
    }
    if ($handle === 'bbpa-essential-tracker') {
        $runtime_config = wp_scripts()->get_data($handle, 'bbpa_runtime_config');
        if (is_string($runtime_config) && $runtime_config !== '' && !array_key_exists('data-bbpa-runtime-config', $script_attributes)) {
            $script_attributes['data-bbpa-runtime-config'] = $runtime_config;
        }
    }

    if ($script_attributes === []) {
        return $tag;
    }

    $cmp_attributes_markup = '';

    foreach ($script_attributes as $attribute_name => $attribute_value) {
        if (!is_string($attribute_name) || $attribute_name === '') {
            continue;
        }

        $attribute_name = sanitize_key($attribute_name);
        if ($attribute_name === '') {
            continue;
        }

        $cmp_attributes_markup .= sprintf(' %s="%s"', esc_attr($attribute_name), esc_attr((string) $attribute_value));
    }

    if ($cmp_attributes_markup === '') {
        return $tag;
    }

    $updated_tag = preg_replace(
        '/<script\b((?=[^>]*\bsrc=)[^>]*)>/i',
        '<script$1' . $cmp_attributes_markup . '>',
        $tag,
        1
    );

    return is_string($updated_tag) ? $updated_tag : $tag;
}
