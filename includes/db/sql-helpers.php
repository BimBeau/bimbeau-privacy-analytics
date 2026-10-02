<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Resolve the full name of an allowlisted plugin table.
 *
 * A suffix outside the allowlist (`bbpa_allowed_sql_table_suffixes`) falls back to `bbpa_daily`, as it always did;
 * the fallback is now logged so that a typo or a table missing from the allowlist does not go unnoticed. Prefer
 * bbpa_resolve_sql_table(), which returns null instead, in new code.
 */
function bbpa_sql_table_name(string $suffix): string
{
    global $wpdb;

    $default_suffix = 'bbpa_daily';

    if (!in_array($suffix, bbpa_get_allowed_sql_table_suffixes(), true)) {
        bbpa_safe_log('Storage', 'warning', 'SQL guard replaced an unknown table suffix with the default table', [
            'table_suffix' => $suffix,
            'default_suffix' => $default_suffix,
        ]);
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
