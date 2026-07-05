<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Use the premium admin runtime as the main admin application bundle.
 */
function bbpa_use_edition_admin_runtime(string $relative_path, array $context): string
{
    if (!is_readable(BBPA_PATH . 'assets/js/admin-pro.js')) {
        return $relative_path;
    }

    $is_app_mode = isset($context['app_mode']) && $context['app_mode'] === 'app';
    $is_front_app_request = function_exists('bbpa_is_front_app_request') && bbpa_is_front_app_request();

    if (is_admin() || $is_app_mode || $is_front_app_request) {
        return 'assets/js/admin-pro.js';
    }

    return $relative_path;
}
add_filter('bbpa_admin_app_script_relative_path', 'bbpa_use_edition_admin_runtime', 10, 2);

/**
 * Add premium admin panels to the localized admin payload.
 */
function bbpa_register_edition_admin_panels(array $panels): array
{
    $events_panel = [
        'name' => 'events',
        'title' => __('Events', 'bimbeau-privacy-analytics'),
        'type' => 'core',
    ];
    $settings_index = null;

    foreach ($panels as $index => $panel) {
        if (is_array($panel) && isset($panel['name']) && $panel['name'] === 'settings') {
            $settings_index = $index;
            break;
        }
    }

    if ($settings_index === null) {
        $panels[] = $events_panel;

        return $panels;
    }

    array_splice($panels, $settings_index, 0, [$events_panel]);

    return $panels;
}
add_filter('bbpa_admin_panels', 'bbpa_register_edition_admin_panels');

/**
 * Add premium REST source metadata to the localized admin payload.
 */
function bbpa_register_edition_rest_sources(array $sources): array
{
    $sources[] = [
        'key' => 'events-config',
        'method' => 'GET',
        'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
        'path' => '/admin/events-config',
    ];
    $sources[] = [
        'key' => 'events-preview',
        'method' => 'POST',
        'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
        'path' => '/admin/events-preview',
    ];

    return $sources;
}
add_filter('bbpa_rest_sources', 'bbpa_register_edition_rest_sources');

/**
 * Add premium-only admin settings consumed by the premium admin bundle.
 */
function bbpa_filter_edition_admin_payload(array $payload): array
{
    if (!isset($payload['settings']) || !is_array($payload['settings'])) {
        $payload['settings'] = [];
    }

    $payload['settings']['isPro'] = true;

    return $payload;
}
add_filter('bbpa_admin_localized_payload', 'bbpa_filter_edition_admin_payload');
