<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Request extraction helpers for BimBeau Privacy Analytics.
 */

/**
 * Get a sanitized string from a request source.
 *
 * @param array<string, mixed> $source
 */
function bbpa_request_get_string(array $source, string $key, string $default = ''): string
{
    if (!array_key_exists($key, $source) || !is_scalar($source[$key])) {
        return $default;
    }

    return sanitize_text_field(wp_unslash((string) $source[$key]));
}

/**
 * Get a sanitized key from a request source.
 *
 * @param array<string, mixed> $source
 */
function bbpa_request_get_key(array $source, string $key, string $default = ''): string
{
    if (!array_key_exists($key, $source) || !is_scalar($source[$key])) {
        return $default;
    }

    return sanitize_key(wp_unslash((string) $source[$key]));
}

/**
 * Get a sanitized integer from a request source.
 *
 * @param array<string, mixed> $source
 */
function bbpa_request_get_int(array $source, string $key, int $default = 0): int
{
    if (!array_key_exists($key, $source) || !is_scalar($source[$key])) {
        return $default;
    }

    return absint(wp_unslash((string) $source[$key]));
}

/**
 * Sanitize a REST page path argument without altering encoded URL octets.
 *
 * @param mixed $value Raw REST argument value.
 */
function bbpa_sanitize_rest_page_path_arg($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    return bbpa_sanitize_page_path_value((string) wp_unslash($value));
}

/**
 * Sanitize an already unslashed page path without altering encoded URL octets.
 *
 * Unlike sanitize_text_field(), percent-encoded octets such as `%C3%A9` are kept
 * so the path matches the value stored in the aggregate tables.
 *
 * @param mixed $value Page path value.
 */
function bbpa_sanitize_page_path_value($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = wp_check_invalid_utf8((string) $value);
    $value = trim($value);

    return preg_replace('/[\x00-\x1F\x7F]+/', '', $value) ?? '';
}

/**
 * Uppercase the hexadecimal digits of the percent-encoded octets of a page path.
 *
 * `/caf%c3%a9` (WordPress permalinks emit lowercase digits) and `/caf%C3%A9` (typed or shared URLs) encode
 * the same octets, and the default case-insensitive collations of the page_path columns treat them as
 * equal. The rest of the path is kept as is. Use the result only as a comparison key: stored page paths
 * and the labels returned by reports keep their original spelling.
 */
function bbpa_normalize_percent_encoding_case(string $page_path): string
{
    if (strpos($page_path, '%') === false) {
        return $page_path;
    }

    return preg_replace_callback(
        '/%[0-9a-fA-F]{2}/',
        static function (array $matches): string {
            return strtoupper($matches[0]);
        },
        $page_path
    ) ?? $page_path;
}

