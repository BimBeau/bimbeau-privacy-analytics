<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function bbpa_sql_table_name(string $suffix): string
{
    global $wpdb;

    $default_suffix = 'bbpa_daily';
    $allowed_suffixes = function_exists('bbpa_get_allowed_sql_table_suffixes')
        ? bbpa_get_allowed_sql_table_suffixes()
        : [$default_suffix];

    if (!in_array($suffix, $allowed_suffixes, true)) {
        $suffix = $default_suffix;
    }

    return $wpdb->prefix . $suffix;
}

function bbpa_sql_allowlisted_identifier(string $key, array $allowlist, string $default_key): string
{
    if (!isset($allowlist[$key])) {
        $key = $default_key;
    }

    return $allowlist[$key];
}

/**
 * @param array<int, array{sql:string,params:array<int, mixed>}> $conditions
 * @return array{sql:string,params:array<int, mixed>}
 */
function bbpa_sql_build_where(array $conditions): array
{
    $clauses = [];
    $params = [];

    foreach ($conditions as $condition) {
        if (!is_array($condition) || !isset($condition['sql'], $condition['params']) || $condition['sql'] === '') {
            continue;
        }

        $clauses[] = (string) $condition['sql'];

        foreach ((array) $condition['params'] as $param) {
            $params[] = $param;
        }
    }

    if ($clauses === []) {
        return [
            'sql' => '1=1',
            'params' => [],
        ];
    }

    return [
        'sql' => implode(' AND ', $clauses),
        'params' => $params,
    ];
}
