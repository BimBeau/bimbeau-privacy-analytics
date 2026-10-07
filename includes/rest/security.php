<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Shared REST request nonce helpers.
 */

/**
 * Validate a BimBeau Privacy Analytics REST request nonce.
 *
 * Accepts the standard WordPress REST nonce from the X-WP-Nonce header or
 * _wpnonce request parameter. Requests authenticated
 * with an application password need no nonce (see below).
 */
function bbpa_rest_request_has_valid_nonce(WP_REST_Request $request): bool
{
    // Application passwords (HTTP Basic, WordPress 5.6+) authenticate each request on their own and
    // cannot carry a cookie session nonce: as in WordPress core, the nonce only guards cookie auth.
    // The route permission callbacks still check the capabilities of the user after this.
    if (bbpa_rest_request_uses_application_password()) {
        return true;
    }

    $rest_nonce = bbpa_rest_request_get_nonce_value($request, 'X-WP-Nonce', '_wpnonce');
    if ($rest_nonce !== '' && wp_verify_nonce($rest_nonce, 'wp_rest')) {
        return true;
    }

    return false;
}

/**
 * Whether the current REST request is authenticated with a WordPress application password.
 *
 * True only when WordPress validated an application password for this request and a user is
 * logged in through it. Cookie sessions never qualify, so they keep the nonce check.
 */
function bbpa_rest_request_uses_application_password(): bool
{
    if (!function_exists('rest_get_authenticated_app_password') || !is_user_logged_in()) {
        return false;
    }

    $application_password = rest_get_authenticated_app_password();

    return is_string($application_password) && $application_password !== '';
}

/**
 * Read and sanitize a nonce value from a REST request header or parameter.
 */
function bbpa_rest_request_get_nonce_value(WP_REST_Request $request, string $header, string $param): string
{
    $value = $request->get_header($header);
    if (!$value) {
        $value = $request->get_param($param);
    }

    if (!is_scalar($value)) {
        return '';
    }

    return sanitize_text_field(wp_unslash((string) $value));
}
