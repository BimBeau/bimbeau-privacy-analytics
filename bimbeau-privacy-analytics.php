<?php

/**
 * Plugin Name: BimBeau Privacy Analytics
 * Description: Privacy-friendly, self-hosted analytics for WordPress.
 * Version: 8.45.95
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

register_activation_hook(
    __FILE__,
    static function (bool $network_wide = false): void {
        bbpa_prevent_parallel_package_activation(__FILE__, $network_wide);
    }
);


add_action('admin_notices', 'bbpa_show_activation_conflict_notice');
add_action('network_admin_notices', 'bbpa_show_activation_conflict_notice');

bbpa_resolve_package_activation_conflict(__FILE__);


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

    $freemius = bbpa_fs();

    $freemius->add_filter('plugin_icon', 'bbpa_get_freemius_plugin_icon_path');
    $freemius->add_filter('default_currency', 'bbpa_get_freemius_default_currency');
    $freemius->add_filter('pricing/css_path', 'bbpa_get_freemius_pricing_css_path');

    $registered = true;
}

 else {
    function bbpa_fs()
    {
        static $freemius = null;

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
bbpa_safe_require_once(BBPA_PATH, 'includes/setup-wizard.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/consent.php');
bbpa_safe_require_once(BBPA_PATH, 'includes/utm.php');

bbpa_safe_require_once(BBPA_PATH, 'admin/admin.php');
bbpa_safe_require_once(BBPA_PATH, 'admin/dashboard-widget.php');

bbpa_safe_require_once(BBPA_PATH, 'front/front.php');

bbpa_safe_require_once(BBPA_PATH, 'db/schema.php');

bbpa_safe_require_once(BBPA_PATH, 'includes/cache.php');
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
    bbpa_activate(false, false);
}
