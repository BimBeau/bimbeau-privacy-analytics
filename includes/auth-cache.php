<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Auth-route cache bypass controls for BimBeau Privacy Analytics PWA authentication surface.
 */

/**
 * Return canonical auth route paths excluded from public/shared caches.
 *
 * @return array<int, string>
 */
function bbpa_get_auth_cache_excluded_paths(): array
{
    $paths = [
        '/bbpa/login',
        '/bbpa/auth/callback',
        '/bbpa/logout',
        '/bbpa/refresh-token',
        '/wp-json/' . BBPA_REST_INTERNAL_NAMESPACE . '/auth/login',
    ];

    /**
     * Filter auth route path exclusions for third-party extensions.
     *
     * @param array<int, string> $paths
     */
    $filtered = apply_filters('bbpa_auth_cache_excluded_paths', $paths);

    return is_array($filtered) ? array_values(array_unique(array_filter(array_map('strval', $filtered)))) : $paths;
}

/**
 * Determine whether current request targets an auth route excluded from cache.
 */
function bbpa_is_auth_cache_exclusion_request(?string $request_uri = null): bool
{
    $raw_uri = is_string($request_uri) && $request_uri !== ''
        ? $request_uri
        : bbpa_request_get_string($_SERVER, 'REQUEST_URI');

    $request_path = wp_parse_url($raw_uri, PHP_URL_PATH);
    if (!is_string($request_path) || $request_path === '') {
        return false;
    }

    $normalized_request_path = '/' . ltrim(rawurldecode($request_path), '/');
    foreach (bbpa_get_auth_cache_excluded_paths() as $path) {
        $normalized_candidate = '/' . ltrim((string) wp_parse_url(home_url($path), PHP_URL_PATH), '/');
        if (untrailingslashit($normalized_request_path) === untrailingslashit($normalized_candidate)) {
            return true;
        }
    }

    return false;
}

/**
 * Send no-cache response headers and cache-plugin/proxy bypass hints.
 */
function bbpa_send_auth_no_cache_headers(): void
{
    nocache_headers();
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');

    if (!defined('DONOTCACHEPAGE')) {
        define('DONOTCACHEPAGE', true);
    }
    if (!defined('DONOTCACHEDB')) {
        define('DONOTCACHEDB', true);
    }
    if (!defined('DONOTMINIFY')) {
        define('DONOTMINIFY', true);
    }

    // Proxy/CDN hints.
    header('Surrogate-Control: no-store');
    header('CDN-Cache-Control: no-store');
    header('X-Accel-Expires: 0');

    // Cache plugin bypass cookies.
    $expires = time() + HOUR_IN_SECONDS;
    $secure = is_ssl();
    setcookie('wordpress_logged_in_bbpa_auth', '1', $expires, COOKIEPATH, COOKIE_DOMAIN, $secure, true);
    setcookie('wp_rocket_cache_bypass', '1', $expires, COOKIEPATH, COOKIE_DOMAIN, $secure, true);
    setcookie('litespeed_no_cache', '1', $expires, COOKIEPATH, COOKIE_DOMAIN, $secure, true);
    setcookie('bbpa_auth_no_cache', '1', $expires, COOKIEPATH, COOKIE_DOMAIN, $secure, true);
}

/**
 * Force no-cache controls on known auth routes only.
 */
function bbpa_maybe_apply_auth_no_cache_controls(): void
{
    if (!bbpa_is_auth_cache_exclusion_request()) {
        return;
    }

    bbpa_send_auth_no_cache_headers();
}
add_action('send_headers', 'bbpa_maybe_apply_auth_no_cache_controls', 0);

/**
 * Add known no-cache cookies for cache plugins.
 *
 * @param array<int, string> $cookies
 * @return array<int, string>
 */
function bbpa_add_cache_bypass_cookie_exclusions(array $cookies): array
{
    $cookies[] = 'wordpress_logged_in_bbpa_auth';
    $cookies[] = 'wp_rocket_cache_bypass';
    $cookies[] = 'litespeed_no_cache';
    $cookies[] = 'bbpa_auth_no_cache';

    return array_values(array_unique($cookies));
}
add_filter('rocket_cache_reject_cookies', 'bbpa_add_cache_bypass_cookie_exclusions');
add_filter('litespeed_control_set_nocache', '__return_true');

/**
 * Add URI rejections for WP Super Cache and WP Rocket.
 *
 * @param array<int, string> $uri_reject
 * @return array<int, string>
 */
function bbpa_add_auth_uri_cache_rejections(array $uri_reject): array
{
    foreach (bbpa_get_auth_cache_excluded_paths() as $path) {
        $uri_reject[] = '^' . preg_quote((string) wp_parse_url(home_url($path), PHP_URL_PATH), '#') . '/?$';
    }

    return array_values(array_unique($uri_reject));
}
add_filter('wp_cache_no_cache_uri', 'bbpa_add_auth_uri_cache_rejections');
add_filter('rocket_cache_reject_uri', 'bbpa_add_auth_uri_cache_rejections');
