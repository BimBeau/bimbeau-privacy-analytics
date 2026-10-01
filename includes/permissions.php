<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Permissions helpers for BimBeau Privacy Analytics admin panels and app routes.
 */

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
 * Capabilities WordPress reserves for super admins or grants without storing them in any site role.
 *
 * They can never be granted by the plugin role access settings.
 *
 * @return array<int, string>
 */
function bbpa_get_reserved_wordpress_capabilities(): array
{
    return [
        'create_sites',
        'delete_sites',
        'manage_network',
        'manage_network_options',
        'manage_network_plugins',
        'manage_network_themes',
        'manage_network_users',
        'manage_sites',
        'setup_network',
        'unfiltered_upload',
        'upgrade_network',
    ];
}

/**
 * Determine whether the role access settings may grant a panel access capability to delegated roles.
 *
 * The capability names come from the `bbpa_stats_access_capability`,
 * `bbpa_settings_access_capability` and `bbpa_contact_access_capability` filters.
 * Delegated roles only receive dedicated capabilities: the plugin's own `bbpa_*`
 * names, or a custom name that no site role stores and that WordPress does not
 * reserve. A capability managed by WordPress or another plugin (for example
 * `manage_options`) is never granted to them, because the grant would apply to
 * every capability check of the site, not only to the plugin screens. Users who
 * hold such a capability through their role keep it. Users with `manage_options`
 * keep receiving every non-reserved panel capability.
 *
 * @param string $capability Capability name.
 */
function bbpa_is_grantable_access_capability(string $capability): bool
{
    if ($capability === '') {
        return false;
    }

    if (strpos($capability, 'bbpa_') === 0) {
        return true;
    }

    if (in_array($capability, bbpa_get_reserved_wordpress_capabilities(), true)) {
        return false;
    }

    $roles = wp_roles();
    if (is_array($roles->roles)) {
        foreach ($roles->roles as $role_config) {
            if (
                is_array($role_config)
                && isset($role_config['capabilities'])
                && is_array($role_config['capabilities'])
                && array_key_exists($capability, $role_config['capabilities'])
            ) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Report, once per request and only in debug mode, a filtered access capability that cannot be granted.
 *
 * @param string $capability Capability name returned by an access capability filter.
 */
function bbpa_log_ignored_access_capability(string $capability): void
{
    static $reported = [];

    if (isset($reported[$capability]) || !function_exists('bbpa_safe_log')) {
        return;
    }

    $reported[$capability] = true;
    bbpa_safe_log(
        'Admin',
        'warning',
        'Role access settings do not grant a capability managed by WordPress or another plugin; use a dedicated bbpa_* capability name.',
        ['capability' => $capability]
    );
}

/**
 * Grant virtual BimBeau Privacy Analytics capabilities from role-based settings.
 *
 * Users with `manage_options` receive the panel access capabilities, except the
 * capabilities WordPress reserves for super admins. Delegated roles only receive
 * the capabilities accepted by bbpa_is_grantable_access_capability().
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

    $access_capabilities = [$stats_capability, $settings_capability, $contact_capability];

    // Site managers keep every panel capability, except the ones WordPress
    // reserves for super admins (network capabilities, unfiltered uploads).
    if (isset($allcaps['manage_options']) && $allcaps['manage_options']) {
        $reserved = bbpa_get_reserved_wordpress_capabilities();
        foreach ($access_capabilities as $access_capability) {
            if (in_array($access_capability, $reserved, true)) {
                if (isset($requested[$access_capability])) {
                    bbpa_log_ignored_access_capability($access_capability);
                }
                continue;
            }
            $allcaps[$access_capability] = true;
        }
        return $allcaps;
    }

    // Delegated roles: a capability that WordPress or another plugin manages is
    // decided by the site roles only, granting it here would apply site-wide.
    $grantable = [];
    foreach ($access_capabilities as $access_capability) {
        if (bbpa_is_grantable_access_capability($access_capability)) {
            $grantable[$access_capability] = true;
        } elseif (isset($requested[$access_capability])) {
            bbpa_log_ignored_access_capability($access_capability);
        }
    }
    $requested = array_intersect_key($requested, $grantable);
    if ($requested === []) {
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
