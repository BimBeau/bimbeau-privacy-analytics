<?php
/**
 * Free country-level geolocation runtime.
 *
 * @package BimBeauPrivacyAnalytics
 */

function bbpa_normalize_country_code($value): string
{
    $code = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', (string) $value), 0, 2));
    return strlen($code) === 2 ? $code : '';
}

function bbpa_get_visit_country_payload(): array
{
    $payload = function_exists('bbpa_get_geolocation_payload') ? bbpa_get_geolocation_payload() : [];
    if (!is_array($payload) || !empty($payload['error'])) {
        return [
            'country_code' => '',
            'country' => '',
        ];
    }

    return [
        'country_code' => bbpa_normalize_country_code($payload['country_code'] ?? ''),
        'country' => isset($payload['country']) ? sanitize_text_field((string) $payload['country']) : '',
    ];
}
