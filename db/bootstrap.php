<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Database bootstrap for BimBeau Privacy Analytics.
 */

defined('ABSPATH') || exit;

add_action('plugins_loaded', 'bbpa_maybe_install_schema');
