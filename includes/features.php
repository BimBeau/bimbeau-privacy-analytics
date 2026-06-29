<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Feature flags for BimBeau Privacy Analytics.
 */

/**
 * Get BimBeau Privacy Analytics feature flags.
 */
function bbpa_features(): array
{
    $defaults = [
        'admin_panels' => false,
        'rest_sources' => false,
    ];

    $features = apply_filters('bbpa_features', $defaults);
    if (!is_array($features)) {
        return $defaults;
    }

    return wp_parse_args($features, $defaults);
}


/**
 * Register premium runtime hooks from shared modules.
 */
function bbpa_bootstrap_premium_runtime__premium_only(): void
{
    do_action('bbpa_premium_loaded');
}
