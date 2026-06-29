<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * UTM aggregation helpers for BimBeau Privacy Analytics.
 */

const BBPA_MAX_UTM_VALUE_LENGTH = 255;

/**
 * Normalize a UTM value for storage.
 */
function bbpa_normalize_utm_value($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = sanitize_text_field($value);
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $value = bbpa_lowercase($value);

    return bbpa_trim_value($value, BBPA_MAX_UTM_VALUE_LENGTH);
}

/**
 * Extract allowlisted UTM params from a URL or query string.
 */
function bbpa_extract_utm_params($input, array $allowlist): array
{
    if (!is_string($input) || $allowlist === []) {
        return [];
    }

    $allowlist = array_filter(array_map('sanitize_key', $allowlist));
    if ($allowlist === []) {
        return [];
    }

    $query = '';
    $parsed = wp_parse_url($input);
    if (is_array($parsed)) {
        $query = isset($parsed['query']) ? (string) $parsed['query'] : '';
    }

    if ($query === '' && !str_contains($input, '://') && str_contains($input, '=')) {
        $query = $input;
    }

    if ($query === '') {
        return [];
    }

    $query_args = [];
    wp_parse_str($query, $query_args);
    if (!is_array($query_args)) {
        return [];
    }

    $normalized = [];
    foreach ($allowlist as $key) {
        if (!array_key_exists($key, $query_args)) {
            continue;
        }

        $value = $query_args[$key];
        if (is_array($value)) {
            $value = reset($value);
        }

        $value = bbpa_normalize_utm_value($value);
        if ($value === '') {
            continue;
        }

        $normalized[$key] = $value;
    }

    return $normalized;
}
