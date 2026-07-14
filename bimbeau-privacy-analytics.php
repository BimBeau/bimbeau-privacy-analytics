<?php

/**
 * Plugin Name: BimBeau Privacy Analytics
 * Description: Privacy-friendly, self-hosted analytics for WordPress.
 * Version: 8.45.25
 * Author: BimBeau
 * Text Domain: bimbeau-privacy-analytics
 * Domain Path: /languages
 * Requires at least: 6.4
 * Requires PHP: 7.4
 *
 *
 * License: GPLv3 or later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

defined('ABSPATH') || exit;

if (!function_exists('bbpa_get_current_package_basename')) {
    /**
     * Returns the plugin basename for a BimBeau Privacy Analytics package file.
     */
    function bbpa_get_current_package_basename(string $plugin_file): string
    {
        if (function_exists('plugin_basename')) {
            return plugin_basename($plugin_file);
        }

        return basename(dirname($plugin_file)) . '/' . basename($plugin_file);
    }
}

if (!function_exists('bbpa_get_package_label')) {
    /**
     * Returns the product label for a BimBeau Privacy Analytics package basename.
     */
    function bbpa_get_package_label(string $plugin_basename): string
    {
        return dirname($plugin_basename) === 'bimbeau-privacy-analytics-pro'
            ? __('BimBeau Privacy Analytics Pro', 'bimbeau-privacy-analytics')
            : __('BimBeau Privacy Analytics Free', 'bimbeau-privacy-analytics');
    }
}

if (!function_exists('bbpa_get_conflicting_package_basename')) {
    /**
     * Returns the other known BimBeau Privacy Analytics package basename for Free/Pro switching.
     */
    function bbpa_get_conflicting_package_basename(string $plugin_basename): string
    {
        return dirname($plugin_basename) === 'bimbeau-privacy-analytics-pro'
            ? 'bimbeau-privacy-analytics/bimbeau-privacy-analytics.php'
            : 'bimbeau-privacy-analytics-pro/bimbeau-privacy-analytics.php';
    }
}

if (!function_exists('bbpa_is_plugin_active_basename')) {
    /**
     * Checks single-site and network activation state for a plugin basename.
     */
    function bbpa_is_plugin_active_basename(string $plugin_basename): bool
    {
        if (function_exists('is_plugin_active') && is_plugin_active($plugin_basename)) {
            return true;
        }

        if (function_exists('is_plugin_active_for_network') && is_plugin_active_for_network($plugin_basename)) {
            return true;
        }

        $active_plugins = get_option('active_plugins', []);
        if (is_array($active_plugins) && in_array($plugin_basename, $active_plugins, true)) {
            return true;
        }

        if (function_exists('get_site_option')) {
            $network_active_plugins = get_site_option('active_sitewide_plugins', []);
            if (is_array($network_active_plugins) && isset($network_active_plugins[$plugin_basename])) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('bbpa_store_activation_notice')) {
    /**
     * Stores a one-time admin notice for the next plugins screen load.
     */
    function bbpa_store_activation_notice(string $message, string $type = 'success'): void
    {
        $notice = [
            'message' => $message,
            'type' => $type,
        ];

        if (function_exists('set_transient')) {
            set_transient('bbpa_activation_conflict_notice', $notice, MINUTE_IN_SECONDS * 5);
            return;
        }

        update_option('bbpa_activation_conflict_notice', $notice, false);
    }
}

if (!function_exists('bbpa_show_activation_conflict_notice')) {
    /**
     * Prints the stored Free/Pro package switch notice in WordPress admin.
     */
    function bbpa_show_activation_conflict_notice(): void
    {
        if (function_exists('current_user_can') && !current_user_can('activate_plugins')) {
            return;
        }

        $notice = function_exists('get_transient')
            ? get_transient('bbpa_activation_conflict_notice')
            : get_option('bbpa_activation_conflict_notice', false);

        if (empty($notice) || !is_array($notice) || empty($notice['message'])) {
            return;
        }

        if (function_exists('delete_transient')) {
            delete_transient('bbpa_activation_conflict_notice');
        }
        delete_option('bbpa_activation_conflict_notice');

        $type = !empty($notice['type']) && in_array($notice['type'], ['success', 'warning', 'error', 'info'], true)
            ? $notice['type']
            : 'success';

        printf(
            '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
            esc_attr($type),
            esc_html((string) $notice['message'])
        );
    }
}

if (!function_exists('bbpa_load_plugin_api')) {
    /**
     * Loads WordPress plugin helpers when the activation sandbox has not loaded them yet.
     */
    function bbpa_load_plugin_api(): void
    {
        if (function_exists('deactivate_plugins') && function_exists('is_plugin_active')) {
            return;
        }

        $plugin_api_path = ABSPATH . 'wp-admin/includes/plugin.php';
        if (is_readable($plugin_api_path)) {
            require_once $plugin_api_path;
        }
    }
}

if (!function_exists('bbpa_get_package_activation_conflict_message')) {
    /**
     * Returns the admin-facing message used when activation is blocked by the other package.
     */
    function bbpa_get_package_activation_conflict_message(): string
    {
        return __('Deactivate the other BimBeau Privacy Analytics package first.', 'bimbeau-privacy-analytics');
    }
}

if (!function_exists('bbpa_prevent_parallel_package_activation')) {
    /**
     * Stops activation before Free and Pro can run in the same request.
     */
    function bbpa_prevent_parallel_package_activation(string $plugin_file, bool $network_wide = false): void
    {
        if (!function_exists('get_option')) {
            return;
        }

        bbpa_load_plugin_api();

        $current_basename = bbpa_get_current_package_basename($plugin_file);
        $conflicting_basename = bbpa_get_conflicting_package_basename($current_basename);

        if (!bbpa_is_plugin_active_basename($conflicting_basename)) {
            return;
        }

        if (function_exists('deactivate_plugins')) {
            deactivate_plugins($current_basename, true, $network_wide);
        }

        $message = bbpa_get_package_activation_conflict_message();
        bbpa_store_activation_notice($message, 'error');

        if (function_exists('wp_die')) {
            wp_die(
                esc_html($message),
                esc_html__('BimBeau Privacy Analytics activation blocked', 'bimbeau-privacy-analytics'),
                [
                    'back_link' => true,
                    'response'  => 200,
                ]
            );
        }
    }
}

if (!function_exists('bbpa_resolve_package_activation_conflict')) {
    /**
     * Shows an admin notice if BimBeau Privacy Analytics Free and Pro are active together.
     */
    function bbpa_resolve_package_activation_conflict(string $plugin_file): void
    {
        if (!function_exists('get_option')) {
            return;
        }

        bbpa_load_plugin_api();

        $current_basename = bbpa_get_current_package_basename($plugin_file);
        $conflicting_basename = bbpa_get_conflicting_package_basename($current_basename);

        if (
            !bbpa_is_plugin_active_basename($current_basename)
            || !bbpa_is_plugin_active_basename($conflicting_basename)
        ) {
            return;
        }

        bbpa_store_activation_notice(
            __('Only one BimBeau Privacy Analytics package can be active at a time. Deactivate the other BimBeau Privacy Analytics package first.', 'bimbeau-privacy-analytics'),
            'warning'
        );
    }
}

register_activation_hook(
    __FILE__,
    static function (bool $network_wide = false): void {
        bbpa_prevent_parallel_package_activation(__FILE__, $network_wide);
    }
);


add_action('admin_notices', 'bbpa_show_activation_conflict_notice');
add_action('network_admin_notices', 'bbpa_show_activation_conflict_notice');

bbpa_resolve_package_activation_conflict(__FILE__);


if (defined('BBPA_VERSION')) {
    return;
}

require_once __DIR__ . '/includes/php74-polyfills.php';

$bbpa_config = require __DIR__ . '/includes/config.php';

define('BBPA_VERSION', $bbpa_config['version']);
define('BBPA_SLUG', $bbpa_config['slug']);
define('BBPA_REST_NAMESPACE', $bbpa_config['rest_namespace']);
define('BBPA_REST_INTERNAL_NAMESPACE', $bbpa_config['rest_namespace_internal']);

define('BBPA_PATH', plugin_dir_path(__FILE__));
define('BBPA_URL', plugin_dir_url(__FILE__));

function bbpa_get_admin_menu_icon(): string
{
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="10" fill="#0000ff"/><path d="M10 19.5V12.5M16 23V9M22 19.5V14.5" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/><path d="M9 23.5H23" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="3"/></svg>';

    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}

function bbpa_get_freemius_plugin_icon_path(): string
{
    return BBPA_PATH . 'assets/images/bbpa-pwa-icon-maskable-512x512.png';
}

function bbpa_get_freemius_default_currency($currency): string
{
    return 'eur';
}

function bbpa_get_freemius_pricing_css_path($default_css_path): string
{
    return BBPA_PATH . 'assets/css/style-freemius-pricing.css';
}

function bbpa_register_freemius_pricing_customizations(): void
{
    static $registered = false;

    if ($registered || !function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();

    if (!is_object($freemius) || !method_exists($freemius, 'add_filter')) {
        return;
    }

    $freemius->add_filter('plugin_icon', 'bbpa_get_freemius_plugin_icon_path');
    $freemius->add_filter('default_currency', 'bbpa_get_freemius_default_currency');
    $freemius->add_filter('pricing/css_path', 'bbpa_get_freemius_pricing_css_path');

    $registered = true;
}

if (function_exists('bbpa_fs')) {
    bbpa_fs()->set_basename(false, __FILE__);
    bbpa_register_freemius_pricing_customizations();
} else {
    if (!function_exists('fs_dynamic_init')) {
        require_once __DIR__ . '/vendor/freemius/start.php';
    }

    function bbpa_fs()
    {
        static $freemius = null;

        if (null === $freemius) {
            $freemius = fs_dynamic_init(
                [
                    'id'             => '25370',
                    'slug'           => 'bimbeau-privacy-analytics',
                    'premium_slug'   => 'bimbeau-privacy-analytics-pro',
                    'premium_suffix' => 'Pro',
                    'type'           => 'plugin',
                    'public_key'     => 'pk_ff8036dd822bcd42413a0193fa2c0',
                    'is_premium'     => false,
                    'has_addons'     => false,
                    'has_paid_plans' => true,
                    
                    'menu'           => [
                        'slug'       => 'bimbeau-privacy-analytics',
                        'contact'    => false,
                        'support'    => false,
                        'account'    => true,
                        'pricing'    => true,
                        'navigation' => 'menu',
                        'icon'       => bbpa_get_admin_menu_icon(),
                    ],
                ]
            );
        }

        return $freemius;
    }

    bbpa_fs();
    bbpa_register_freemius_pricing_customizations();
    do_action('bbpa_fs_loaded');
}

require_once __DIR__ . '/includes/filesystem.php';

bbpa_safe_require_once(BBPA_PATH, 'includes/helpers/output.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/request.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/features.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/permissions.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/settings.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/consent.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/utm.php');

bbpa_safe_require_once(BBPA_PATH, 'admin/admin.php');
bbpa_safe_require_once(BBPA_PATH, 'admin/dashboard-widget.php');

bbpa_safe_require_once(BBPA_PATH, 'front/front.php');

bbpa_safe_require_once(BBPA_PATH, 'db/schema.php');

bbpa_safe_require_once(BBPA_PATH, 'includes/cache.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/auth-cache.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/sql-guards.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/sql.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/db/sql-helpers.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/db/class-bbpa-analytics-repository.php');

bbpa_safe_require_once(BBPA_PATH, 'includes/purge.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/raw-logs.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/aggregation.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/tracking.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/class-bbpa-logger.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/visitors.php');

bbpa_safe_require_once(BBPA_PATH, 'includes/services/class-bbpa-filesystem-service.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/services/class-bbpa-maxmind-service.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/services/class-bbpa-geoip-database-updater.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/services/class-bbpa-favicon-resolver.php');

bbpa_safe_require_once(BBPA_PATH, 'includes/geolocation.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/plugin-lifecycle.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/licensing.php');

add_action('init', 'bbpa_load_textdomain', 0);


if (function_exists('bbpa_register_freemius_uninstall_hook')) {
    bbpa_register_freemius_uninstall_hook();
}

$bbpa_edition_runtime = BBPA_PATH . 'includes/edition-runtime.php';
if (is_readable($bbpa_edition_runtime)) {
    require_once $bbpa_edition_runtime;
}

bbpa_safe_require_once(BBPA_PATH, 'admin/bootstrap.php');
bbpa_safe_require_once(BBPA_PATH, 'front/bootstrap.php');
bbpa_safe_require_once(BBPA_PATH, 'rest/routes.php');
bbpa_safe_require_once(BBPA_PATH, 'db/bootstrap.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/aggregation-hooks.php');

add_action('plugins_loaded', 'bbpa_maybe_run_upgrades', 20);

register_activation_hook(__FILE__, 'bbpa_activate');
register_deactivation_hook(__FILE__, 'bbpa_deactivate');

if (get_option('bbpa_pending_activation_after_package_switch') === bbpa_get_current_package_basename(__FILE__)) {
    delete_option('bbpa_pending_activation_after_package_switch');
    bbpa_activate();
}
