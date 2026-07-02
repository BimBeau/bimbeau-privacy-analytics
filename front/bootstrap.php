<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Front-end bootstrap for BimBeau Privacy Analytics.
 */

defined('ABSPATH') || exit;

add_action('wp_enqueue_scripts', 'bbpa_enqueue_front_assets', 20);
add_filter('bbpa_advanced_tracker_cmp_attributes', 'bbpa_add_front_tracker_no_optimize_attributes', 10, 2);
add_filter('script_loader_tag', 'bbpa_filter_front_tracker_script_tag', 10, 3);
if (function_exists('bbpa_register_front_app_rewrite_rules')) {
    add_action('init', 'bbpa_register_front_app_rewrite_rules');
}
if (function_exists('bbpa_register_front_app_query_vars')) {
    add_filter('query_vars', 'bbpa_register_front_app_query_vars');
}
if (function_exists('bbpa_disable_front_app_pwa_canonical_redirect')) {
    add_filter('redirect_canonical', 'bbpa_disable_front_app_pwa_canonical_redirect');
}
if (function_exists('bbpa_output_front_app_pwa_head_tags')) {
    add_action('wp_head', 'bbpa_output_front_app_pwa_head_tags', 1);
}
if (function_exists('bbpa_maybe_render_front_app_shell')) {
    add_action('template_redirect', 'bbpa_maybe_render_front_app_shell');
}

