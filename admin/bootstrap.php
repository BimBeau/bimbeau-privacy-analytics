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
     * Ensure the Free Upgrade to Pro submenu item remains last.
     */
    function bbpa_place_free_upgrade_submenu_last(): void
    {
        if (!function_exists('bbpa_is_pro') || bbpa_is_pro()) {
            return;
        }

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

if (!function_exists('bbpa_remove_pro_upgrade_submenu')) {
    /**
     * Remove Freemius pricing/upgrade submenu entries from Pro admin menus.
     */
    function bbpa_remove_pro_upgrade_submenu(): void
    {
        if (!function_exists('bbpa_is_pro') || !bbpa_is_pro()) {
            return;
        }

        $submenu_root = BBPA_SLUG;
        $upgrade_slug = BBPA_SLUG . '-pricing';

        if (!isset($GLOBALS['submenu'][$submenu_root]) || !is_array($GLOBALS['submenu'][$submenu_root])) {
            return;
        }

        $clean_submenu = [];
        foreach ($GLOBALS['submenu'][$submenu_root] as $submenu_item) {
            if (!is_array($submenu_item)) {
                continue;
            }

            $submenu_slug = isset($submenu_item[2]) ? (string) $submenu_item[2] : '';
            $submenu_label_raw = isset($submenu_item[0]) ? (string) $submenu_item[0] : '';
            $submenu_label = wp_strip_all_tags($submenu_label_raw);
            $submenu_css_classes = isset($submenu_item[4]) ? strtolower((string) $submenu_item[4]) : '';
            $candidate_haystack = strtolower($submenu_label_raw . ' ' . $submenu_label . ' ' . $submenu_slug . ' ' . $submenu_css_classes);

            $looks_like_upgrade = $submenu_slug === $upgrade_slug
                || strpos($candidate_haystack, 'pricing') !== false
                || strpos($candidate_haystack, 'upgrade') !== false
                || strpos($candidate_haystack, 'fs-upgrade') !== false
                || strpos($candidate_haystack, 'fs-submenu-item-pricing') !== false
                || preg_match('/\b(mise\s*à\s*jour|mettre\s*à\s*jour|upgrade|updates?)\b/ui', $submenu_label) === 1;

            if ($looks_like_upgrade) {
                continue;
            }

            $clean_submenu[] = $submenu_item;
        }

        $GLOBALS['submenu'][$submenu_root] = array_values($clean_submenu);
    }
}

add_action('admin_menu', 'bbpa_register_admin_menu');
add_action('admin_menu', 'bbpa_register_free_upgrade_submenu', 999);
add_action('admin_menu', 'bbpa_register_contact_submenu', 100);
add_action('admin_head', 'bbpa_remove_pro_upgrade_submenu', 1);
add_action('admin_head', 'bbpa_normalize_free_upgrade_submenu', 1);
add_action('admin_head', 'bbpa_place_free_upgrade_submenu_last', 2);
add_action('admin_init', 'bbpa_redirect_disabled_admin_page');
add_action('admin_enqueue_scripts', 'bbpa_enqueue_admin_assets');
add_action('admin_head', 'bbpa_add_admin_menu_icon_styles');
add_action('admin_head', 'bbpa_add_admin_color_scheme_styles');
add_action('wp_dashboard_setup', 'bbpa_register_dashboard_widget');
add_filter('rest_url', 'bbpa_filter_rest_url_for_admin_pages', 10, 4);
