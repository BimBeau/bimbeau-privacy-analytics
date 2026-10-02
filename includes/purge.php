<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

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
        // The allowlist also names legacy tables that are no longer created; skip the ones that do not exist.
        if (function_exists('bbpa_aggregation_table_exists') && !bbpa_aggregation_table_exists($table_name)) {
            continue;
        }
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Explicit administrator purge of an allowlisted plugin table.
        $results[$table] = (int) $wpdb->query($wpdb->prepare('TRUNCATE TABLE %i', $table_name));
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
 * Run the aggregated retention cleanup immediately (`POST /admin/purge-aggregated-data`).
 *
 * Applies the same tables and cutoffs as the retention cron (bbpa_purge_aggregated_data_by_retention()), without
 * its time budget: only rows older than the retention windows are deleted.
 */
function bbpa_purge_aggregated_data(): array
{
    $window = bbpa_get_aggregated_retention_window();
    $result = bbpa_apply_aggregated_retention_targets(bbpa_get_aggregated_retention_targets($window));

    bbpa_flush_admin_cache();

    return [
        'tables' => $result['tables'],
        'rawLogsPurged' => false,
        'retentionDays' => $window['retention_days'],
    ];
}

/**
 * Delete rows older than the provided retention cutoff.
 *
 * @param int|string $cutoff_value Rows with `$column < $cutoff_value` are deleted.
 * @param string     $format       `%d` or `%s`.
 * @return int Deleted rows.
 */
function bbpa_delete_by_retention_cutoff(string $table_suffix, string $column, $cutoff_value, string $format): int
{
    return bbpa_delete_rows_by_retention_cutoff($table_suffix, $column, $cutoff_value, $format)['deleted'];
}
