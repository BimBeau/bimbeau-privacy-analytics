<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Build placeholders and normalized arguments for an SQL IN clause.
 *
 * Supported types: `int`, `string` (values sanitized with sanitize_text_field()) and `page_path` (values
 * sanitized with bbpa_sanitize_page_path_value(), which keeps percent-encoded octets so they match the page
 * paths stored in the aggregate tables). Any other type returns an empty clause.
 *
 * @param array<int, mixed> $values
 * @return array{placeholders:string,args:array<int,int|string>,empty:bool}
 */
function bbpa_build_in_clause(array $values, string $type): array
{
    $placeholder = '';
    $normalized = [];

    if ($type === 'int') {
        $placeholder = '%d';

        foreach ($values as $value) {
            if ($value === '' || $value === null || is_array($value) || is_object($value)) {
                continue;
            }

            if (is_string($value) && !preg_match('/^-?\d+$/', trim($value))) {
                continue;
            }

            if (!is_int($value) && !is_string($value) && !is_float($value)) {
                continue;
            }

            $normalized[] = (int) $value;
        }
    } elseif ($type === 'string' || $type === 'page_path') {
        $placeholder = '%s';

        foreach ($values as $value) {
            if (!is_scalar($value)) {
                continue;
            }

            // sanitize_text_field() strips "%xx" octets, which page paths keep.
            $candidate = $type === 'page_path'
                ? bbpa_sanitize_page_path_value($value)
                : sanitize_text_field((string) $value);
            if ($candidate === '') {
                continue;
            }

            $normalized[] = $candidate;
        }
    } else {
        return [
            'placeholders' => '',
            'args' => [],
            'empty' => true,
        ];
    }

    $normalized = array_values(array_unique($normalized));

    return [
        'placeholders' => implode(', ', array_fill(0, count($normalized), $placeholder)),
        'args' => $normalized,
        'empty' => $normalized === [],
    ];
}
