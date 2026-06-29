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


