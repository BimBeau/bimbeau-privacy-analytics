<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin bootstrap for BimBeau Privacy Analytics.
 */

defined('ABSPATH') || exit;

if (!function_exists('bbpa_place_free_upgrade_submenu_last')) {
    /**
     * Ensure the Free pricing submenu item remains last.
     */
    function bbpa_place_free_upgrade_submenu_last(): void
    {
        $submenu_root = BBPA_SLUG;
        $upgrade_slug = BBPA_SLUG . '-pricing';

        if (!isset($GLOBALS['submenu'][$submenu_root]) || !is_array($GLOBALS['submenu'][$submenu_root])) {
            return;
        }

        $upgrade_item = null;
        $submenu_items = [];

        foreach ($GLOBALS['submenu'][$submenu_root] as $submenu_item) {
            if (!is_array($submenu_item)) {
                continue;
            }

            $submenu_slug = isset($submenu_item[2]) ? (string) $submenu_item[2] : '';
            if ($submenu_slug === $upgrade_slug) {
                $upgrade_item = $submenu_item;
                continue;
            }

            $submenu_items[] = $submenu_item;
        }

        if (null === $upgrade_item) {
            return;
        }

        $submenu_items[] = $upgrade_item;
        $GLOBALS['submenu'][$submenu_root] = array_values($submenu_items);
    }
}


add_action('admin_menu', 'bbpa_register_admin_menu');
add_action('admin_menu', 'bbpa_register_free_upgrade_submenu', 999);
add_action('admin_menu', 'bbpa_register_contact_submenu', 100);
add_action('admin_head', 'bbpa_normalize_free_upgrade_submenu', 1);
add_action('admin_head', 'bbpa_place_free_upgrade_submenu_last', 2);
add_action('admin_init', 'bbpa_redirect_disabled_admin_page');
add_action('admin_enqueue_scripts', 'bbpa_enqueue_admin_assets');
add_action('admin_head', 'bbpa_add_admin_menu_icon_styles');
add_action('admin_head', 'bbpa_add_admin_color_scheme_styles');
add_action('wp_dashboard_setup', 'bbpa_register_dashboard_widget');
add_filter('rest_url', 'bbpa_filter_rest_url_for_admin_pages', 10, 4);
add_action('admin_init', 'bbpa_handle_geoip_notice_dismissal');
add_action('admin_notices', 'bbpa_render_geoip_database_admin_notice');
