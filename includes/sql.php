<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
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
    } elseif ($type === 'string') {
        $placeholder = '%s';

        foreach ($values as $value) {
            if (!is_scalar($value)) {
                continue;
            }

            $candidate = sanitize_text_field((string) $value);
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
