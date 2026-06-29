<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * Purge helpers for BimBeau Privacy Analytics data.
 */

/**
 * Purge aggregated analytics tables and raw logs.
 */
function bbpa_purge_analytics_data(): array
{
    global $wpdb;

    $tables = bbpa_get_allowed_sql_table_suffixes();

    $results = [];
    foreach ($tables as $table) {
        $table_name = bbpa_resolve_sql_table($table);
        if ($table_name === null) {
            bbpa_safe_log('Storage', 'warning', 'SQL guard blocked unknown table in analytics purge', ['table_suffix' => $table]);
            continue;
        }
        $results[$table] = (int) $wpdb->query("TRUNCATE TABLE `{$table_name}`"); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name is allowlisted via bbpa_resolve_sql_table().
    }

    update_option('bbpa_hits', [], false);
    update_option('bbpa_realtime_visitors', [], false);
    bbpa_flush_admin_cache();

    return [
        'tables' => $results,
        'rawLogsPurged' => true,
    ];
}

/**
 * Purge captured events entries from events stats.
 */
function bbpa_purge_captured_events_data(): array
{
    global $wpdb;

    $table_suffixes = [
        'bbpa_event_occurrences',
        'bbpa_event_actions_daily',
        'bbpa_events_daily',
    ];

    $results = [];
    foreach ($table_suffixes as $table_suffix) {
        $table_name = bbpa_resolve_sql_table($table_suffix);
        if ($table_name === null) {
            bbpa_safe_log('Storage', 'warning', 'SQL guard blocked unknown table in captured events purge', ['table_suffix' => $table_suffix]);
            continue;
        }
        $results[$table_suffix] = (int) $wpdb->query("DELETE FROM `{$table_name}`"); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name is allowlisted via bbpa_resolve_sql_table().
    }

    bbpa_flush_admin_cache();

    return [
        'tables' => $results,
    ];
}

/**
 * Purge visitor-detail analytics data while keeping aggregate KPI tables.
 */
function bbpa_purge_aggregated_data(): array
{
    global $wpdb;

    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
    $retention_limits = function_exists('bbpa_get_aggregated_retention_limits')
        ? bbpa_get_aggregated_retention_limits()
        : ['max' => 3650];
    $retention_days = isset($settings['aggregated_data_retention_days'])
        ? absint($settings['aggregated_data_retention_days'])
        : 365;
    $retention_days = max(30, min((int) ($retention_limits['max'] ?? 3650), $retention_days));

    $current_timestamp = (int) current_time('timestamp');
    $cutoff_timestamp = $current_timestamp - ($retention_days * DAY_IN_SECONDS);
    $cutoff_date = wp_date('Y-m-d', $cutoff_timestamp);
    $cutoff_datetime = wp_date('Y-m-d H:i:s', $cutoff_timestamp);

    $table_deletions = [];

    $table_deletions['bbpa_visitors'] = bbpa_delete_by_retention_cutoff(
        'bbpa_visitors',
        'last_view_at',
        $cutoff_timestamp,
        '%d'
    );

    $date_bucket_tables = [
        'bbpa_daily' => 'date_bucket',
        'bbpa_hits_daily' => 'date_bucket',
        'bbpa_daily_source_category' => 'date_bucket',
        'bbpa_entry_exit_daily' => 'date_bucket',
        'bbpa_404s_daily' => 'date_bucket',
        'bbpa_search_terms_daily' => 'date_bucket',
        'bbpa_geo_daily' => 'date_bucket',
        'bbpa_time_daily' => 'date_bucket',
        'bbpa_page_time_daily' => 'date_bucket',
        'bbpa_event_actions_daily' => 'day_bucket',
        'bbpa_events_daily' => 'day_bucket',
    ];
    foreach ($date_bucket_tables as $table_suffix => $bucket_column) {
        $table_deletions[$table_suffix] = bbpa_delete_by_retention_cutoff(
            $table_suffix,
            $bucket_column,
            $cutoff_date,
            '%s'
        );
    }

    $datetime_bucket_tables = [
        'bbpa_hourly' => 'date_bucket',
        'bbpa_entry_exit_hourly' => 'date_bucket',
        'bbpa_event_occurrences' => 'triggered_at',
    ];
    foreach ($datetime_bucket_tables as $table_suffix => $bucket_column) {
        $table_deletions[$table_suffix] = bbpa_delete_by_retention_cutoff(
            $table_suffix,
            $bucket_column,
            $cutoff_datetime,
            '%s'
        );
    }

    bbpa_flush_admin_cache();

    return [
        'tables' => $table_deletions,
        'rawLogsPurged' => false,
        'retentionDays' => $retention_days,
    ];
}

/**
 * Delete rows older than the provided retention cutoff.
 */
function bbpa_delete_by_retention_cutoff(string $table_suffix, string $column, $cutoff_value, string $format): int
{
    global $wpdb;

    $table = bbpa_resolve_sql_table($table_suffix);
    if ($table === null) {
        bbpa_safe_log('Storage', 'warning', 'SQL guard blocked unknown table in retention purge', ['table_suffix' => $table_suffix]);
        return 0;
    }

    $resolved_column = bbpa_resolve_sql_column($table_suffix, $column);
    if ($resolved_column === null) {
        bbpa_safe_log('Storage', 'warning', 'SQL guard blocked unknown column in retention purge', ['table_suffix' => $table_suffix, 'column' => $column]);
        return 0;
    }

    $column_exists = $wpdb->get_var(
        $wpdb->prepare(
            "SHOW COLUMNS FROM `{$table}` LIKE %s",
            $resolved_column
        )
    );
    if ($column_exists !== $resolved_column) {
        return 0;
    }

    if ($format === '%d') {
        $query = $wpdb->prepare(
            "DELETE FROM `{$table}` WHERE `{$resolved_column}` < %d",
            (int) $cutoff_value
        );
    } else {
        $query = $wpdb->prepare(
            "DELETE FROM `{$table}` WHERE `{$resolved_column}` < %s",
            (string) $cutoff_value
        );
    }
    $deleted_rows = $wpdb->query($query);

    return is_int($deleted_rows) ? $deleted_rows : 0;
}
