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
 * _wpnonce request parameter. App-mode requests may also use the app-session
 * nonce from X-Lean-Stats-App-Nonce or app_nonce when allowed.
 */
function bbpa_rest_request_has_valid_nonce(WP_REST_Request $request, bool $allow_app_nonce = true): bool
{
    $rest_nonce = bbpa_rest_request_get_nonce_value($request, 'X-WP-Nonce', '_wpnonce');
    if ($rest_nonce !== '' && wp_verify_nonce($rest_nonce, 'wp_rest')) {
        return true;
    }

    if (!$allow_app_nonce) {
        return false;
    }

    return bbpa_rest_request_has_valid_authenticated_app_session($request);
}

/**
 * Validate an app-mode REST request against an authenticated WordPress session.
 *
 * WordPress REST cookie authentication resets the current user to anonymous when
 * X-WP-Nonce is omitted. PWA requests intentionally avoid that header so a stale
 * REST nonce cannot fail before route permissions run. For those requests, the
 * app nonce is accepted only when the logged-in cookie still identifies a real
 * WordPress user and the nonce validates against that session token.
 */
function bbpa_rest_request_has_valid_authenticated_app_session(WP_REST_Request $request): bool
{
    $app_nonce = bbpa_rest_request_get_nonce_value($request, 'X-Lean-Stats-App-Nonce', 'app_nonce');
    if ($app_nonce === '') {
        return false;
    }

    if (is_user_logged_in() && wp_verify_nonce($app_nonce, 'bbpa_app_session')) {
        return true;
    }

    $cookie_user_id = wp_validate_auth_cookie('', 'logged_in');
    if (!$cookie_user_id) {
        return false;
    }

    wp_set_current_user((int) $cookie_user_id);

    return wp_verify_nonce($app_nonce, 'bbpa_app_session') !== false;
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
