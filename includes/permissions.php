<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Permissions helpers for BimBeau Privacy Analytics admin panels and app routes.
 */

defined('ABSPATH') || exit;

/**
 * Capability used for analytics panel access.
 */
function bbpa_get_stats_access_capability(): string
{
    $capability = apply_filters('bbpa_stats_access_capability', 'bbpa_view_stats');

    return is_string($capability) && $capability !== '' ? sanitize_key($capability) : 'bbpa_view_stats';
}

/**
 * Capability used for settings panel access.
 */
function bbpa_get_settings_access_capability(): string
{
    $capability = apply_filters('bbpa_settings_access_capability', 'bbpa_manage_settings');

    return is_string($capability) && $capability !== '' ? sanitize_key($capability) : 'bbpa_manage_settings';
}

/**
 * Capability used for contact panel access.
 */
function bbpa_get_contact_access_capability(): string
{
    $capability = apply_filters('bbpa_contact_access_capability', 'bbpa_access_contact');

    return is_string($capability) && $capability !== '' ? sanitize_key($capability) : 'bbpa_access_contact';
}

/**
 * Resolve capability required to access BimBeau Privacy Analytics protected analytics surfaces.
 */
function bbpa_get_required_admin_capability(): string
{
    $capability = apply_filters('bbpa_admin_capability', bbpa_get_stats_access_capability());

    if (!is_string($capability) || $capability === '') {
        return bbpa_get_stats_access_capability();
    }

    return sanitize_key($capability);
}

/**
 * Resolve panel-level capability map with extension hook support.
 *
 * @return array<string, string>
 */
function bbpa_get_panel_capability_map(): array
{
    $admin_capability = bbpa_get_required_admin_capability();
    $settings_capability = bbpa_get_settings_access_capability();
    $contact_capability = bbpa_get_contact_access_capability();
    $default_map = [
        'dashboard' => $admin_capability,
        'top-pages' => $admin_capability,
        'referrers' => $admin_capability,
        'search-terms' => $admin_capability,
        'geolocation' => $admin_capability,
        'visitors' => $admin_capability,
        'devices' => $admin_capability,
        'realtime' => $admin_capability,
        'settings' => $settings_capability,
        'contact' => $contact_capability,
    ];

    $map = apply_filters('bbpa_panel_capability_map', $default_map, $admin_capability);
    if (!is_array($map)) {
        return $default_map;
    }

    $normalized = [];
    foreach ($map as $panel => $capability) {
        $panel_key = sanitize_key((string) $panel);
        if ($panel_key === '') {
            continue;
        }

        $capability_name = is_string($capability) ? sanitize_key($capability) : '';
        $normalized[$panel_key] = $capability_name !== '' ? $capability_name : $admin_capability;
    }

    return wp_parse_args($normalized, $default_map);
}

/**
 * Resolve capability required for a specific panel.
 */
function bbpa_get_panel_capability(string $panel): string
{
    $panel_key = sanitize_key($panel);
    $admin_capability = bbpa_get_required_admin_capability();
    $map = bbpa_get_panel_capability_map();
    $resolved = isset($map[$panel_key]) && is_string($map[$panel_key]) && $map[$panel_key] !== ''
        ? $map[$panel_key]
        : $admin_capability;

    $filtered = apply_filters('bbpa_panel_capability', $resolved, $panel_key, $admin_capability);

    return is_string($filtered) && $filtered !== '' ? sanitize_key($filtered) : $resolved;
}

/**
 * Check whether current user can access requested BimBeau Privacy Analytics panel.
 */
function bbpa_current_user_can_access_panel(string $panel): bool
{
    return current_user_can(bbpa_get_panel_capability($panel));
}

/**
 * Grant virtual BimBeau Privacy Analytics capabilities from role-based settings.
 *
 * @param array<string, bool> $allcaps
 * @param array<int, string> $caps
 * @param array<int, mixed> $args
 * @param WP_User $user
 * @return array<string, bool>
 */
function bbpa_apply_role_access_capabilities(array $allcaps, array $caps, array $args, WP_User $user): array
{
    unset($args);

    $stats_capability = bbpa_get_stats_access_capability();
    $settings_capability = bbpa_get_settings_access_capability();
    $contact_capability = bbpa_get_contact_access_capability();
    $requested = array_fill_keys($caps, true);
    if (!isset($requested[$stats_capability]) && !isset($requested[$settings_capability]) && !isset($requested[$contact_capability])) {
        return $allcaps;
    }

    if (isset($allcaps['manage_options']) && $allcaps['manage_options']) {
        $allcaps[$stats_capability] = true;
        $allcaps[$settings_capability] = true;
        $allcaps[$contact_capability] = true;
        return $allcaps;
    }

    if (!function_exists('bbpa_get_settings')) {
        return $allcaps;
    }

    $settings = bbpa_get_settings();
    $user_roles = isset($user->roles) && is_array($user->roles)
        ? array_map('sanitize_key', $user->roles)
        : [];

    if (isset($requested[$stats_capability])) {
        $stats_roles = isset($settings['stats_access_roles']) && is_array($settings['stats_access_roles'])
            ? array_map('sanitize_key', $settings['stats_access_roles'])
            : [];
        if (!empty(array_intersect($user_roles, $stats_roles))) {
            $allcaps[$stats_capability] = true;
        }
    }

    if (isset($requested[$settings_capability])) {
        $settings_roles = isset($settings['settings_access_roles']) && is_array($settings['settings_access_roles'])
            ? array_map('sanitize_key', $settings['settings_access_roles'])
            : [];
        if (!empty(array_intersect($user_roles, $settings_roles))) {
            $allcaps[$settings_capability] = true;
        }
    }

    if (isset($requested[$contact_capability])) {
        $contact_roles = isset($settings['contact_access_roles']) && is_array($settings['contact_access_roles'])
            ? array_map('sanitize_key', $settings['contact_access_roles'])
            : [];
        if (!empty(array_intersect($user_roles, $contact_roles))) {
            $allcaps[$contact_capability] = true;
        }
    }

    return $allcaps;
}
add_filter('user_has_cap', 'bbpa_apply_role_access_capabilities', 10, 4);
