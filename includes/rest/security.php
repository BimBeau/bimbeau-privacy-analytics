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
 * _wpnonce request parameter.
 */
function bbpa_rest_request_has_valid_nonce(WP_REST_Request $request): bool
{
    $rest_nonce = bbpa_rest_request_get_nonce_value($request, 'X-WP-Nonce', '_wpnonce');
    if ($rest_nonce !== '' && wp_verify_nonce($rest_nonce, 'wp_rest')) {
        return true;
    }

    return false;
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
