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
 * Return the packaged BPA app favicon used for Freemius branding.
 *
 * Freemius renders the plugin icon on pricing and upgrade screens from its
 * plugin_icon filter. Keep this aligned with the app/update favicon instead
 * of the compact BBPA logo so the branding is consistent across admin flows.
 */
function bbpa_get_freemius_app_icon_path(): string
{
    return BBPA_PATH . 'assets/images/bpa-favicon-app.svg';
}

/**
 * Register the BPA app favicon for Freemius screens after the SDK is loaded.
 */
function bbpa_register_freemius_app_icon(): void
{
    if (!function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius) || !method_exists($freemius, 'add_filter')) {
        return;
    }

    $freemius->add_filter('plugin_icon', 'bbpa_get_freemius_app_icon_path');
}
add_action('bbpa_fs_loaded', 'bbpa_register_freemius_app_icon', 20);

if (function_exists('bbpa_fs')) {
    bbpa_register_freemius_app_icon();
}

/**
 * Force the BPA app favicon in WordPress plugin update metadata.
 *
 * WordPress.org and Freemius can both provide their own icon set. Replacing
 * every supported icon size guarantees that the Updates screen consistently
 * uses the packaged BPA favicon for both Free and Pro distributions.
 *
 * @param mixed $transient Plugin update transient.
 * @return mixed
 */
function bbpa_filter_plugin_update_icons($transient)
{
    if (!is_object($transient) || !defined('BBPA_PATH') || !defined('BBPA_URL')) {
        return $transient;
    }

    $plugin_file = BBPA_PATH . 'bimbeau-privacy-analytics.php';
    if (function_exists('bbpa_get_current_package_basename')) {
        $plugin_basename = bbpa_get_current_package_basename($plugin_file);
    } elseif (function_exists('plugin_basename')) {
        $plugin_basename = plugin_basename($plugin_file);
    } else {
        $plugin_basename = basename(dirname(BBPA_PATH)) . '/bimbeau-privacy-analytics.php';
    }

    $icon_url = BBPA_URL . 'assets/images/bpa-favicon-app.svg';
    $icons = [
        'svg'     => $icon_url,
        '2x'      => $icon_url,
        '1x'      => $icon_url,
        'default' => $icon_url,
    ];

    foreach (['response', 'no_update'] as $bucket) {
        if (!isset($transient->{$bucket}) || !is_array($transient->{$bucket}) || !isset($transient->{$bucket}[$plugin_basename])) {
            continue;
        }

        $entry = $transient->{$bucket}[$plugin_basename];
        if (is_object($entry)) {
            $entry->icons = $icons;
            $transient->{$bucket}[$plugin_basename] = $entry;
        } elseif (is_array($entry)) {
            $entry['icons'] = $icons;
            $transient->{$bucket}[$plugin_basename] = $entry;
        }
    }

    return $transient;
}
add_filter('site_transient_update_plugins', 'bbpa_filter_plugin_update_icons', 999);
