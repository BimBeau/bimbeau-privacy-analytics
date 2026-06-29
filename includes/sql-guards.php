<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Canonical source for dynamic BimBeau Privacy Analytics table suffixes.
 */
function bbpa_get_allowed_sql_table_suffixes(): array
{
    return [
        'bbpa_daily',
        'bbpa_hourly',
        'bbpa_sessions',
        'bbpa_hits_daily',
        'bbpa_entry_exit_daily',
        'bbpa_entry_exit_hourly',
        'bbpa_daily_source_category',
        'bbpa_entry_pages_daily',
        'bbpa_exit_pages_daily',
        'bbpa_referrers_daily',
        'bbpa_referrer_sources_daily',
        'bbpa_404s_daily',
        'bbpa_not_found_daily',
        'bbpa_search_terms_daily',
        'bbpa_geo_daily',
        'bbpa_geo_countries_daily',
        'bbpa_geo_cities_daily',
        'bbpa_time_daily',
        'bbpa_overview_daily',
        'bbpa_page_time_daily',
        'bbpa_visitors',
        'bbpa_visitor_activity_daily',
        'bbpa_event_occurrences',
        'bbpa_event_actions_daily',
        'bbpa_events_daily',
    ];
}

function bbpa_get_allowed_sql_columns(): array
{
    $date_bucket_tables = [
        'bbpa_daily',
        'bbpa_hits_daily',
        'bbpa_entry_exit_daily',
        'bbpa_daily_source_category',
        'bbpa_entry_pages_daily',
        'bbpa_exit_pages_daily',
        'bbpa_referrers_daily',
        'bbpa_referrer_sources_daily',
        'bbpa_404s_daily',
        'bbpa_not_found_daily',
        'bbpa_search_terms_daily',
        'bbpa_geo_daily',
        'bbpa_geo_countries_daily',
        'bbpa_geo_cities_daily',
        'bbpa_time_daily',
        'bbpa_overview_daily',
        'bbpa_page_time_daily',
        'bbpa_visitor_activity_daily',
    ];

    return array_merge(
        array_fill_keys($date_bucket_tables, ['date_bucket']),
        [
            'bbpa_visitors' => ['last_view_at'],
            'bbpa_visitor_activity_daily' => ['date_bucket'],
            'bbpa_hourly' => ['date_bucket'],
            'bbpa_entry_exit_hourly' => ['date_bucket'],
            'bbpa_event_actions_daily' => ['day_bucket'],
            'bbpa_events_daily' => ['day_bucket'],
            'bbpa_event_occurrences' => ['triggered_at'],
        ]
    );
}

function bbpa_resolve_sql_table(string $table_suffix): ?string
{
    global $wpdb;

    if (!in_array($table_suffix, bbpa_get_allowed_sql_table_suffixes(), true)) {
        return null;
    }

    return $wpdb->prefix . $table_suffix;
}

function bbpa_resolve_sql_column(string $table_suffix, string $column): ?string
{
    $columns_map = bbpa_get_allowed_sql_columns();
    $allowed_columns = $columns_map[$table_suffix] ?? [];

    return in_array($column, $allowed_columns, true) ? $column : null;
}

function bbpa_sql_placeholder(string $type): string
{
    return $type === 'int' ? '%d' : '%s';
}

function bbpa_build_upsert_additive_query(string $table, array $insert_columns, array $update_columns): string
{
    $columns_sql = implode(', ', $insert_columns);
    $values_sql = implode(', ', array_fill(0, count($insert_columns), '%s'));
    $updates = [];

    foreach ($update_columns as $column) {
        $updates[] = "{$column} = {$column} + VALUES({$column})";
    }

    return "INSERT INTO {$table} ({$columns_sql}) VALUES ({$values_sql}) ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
}
