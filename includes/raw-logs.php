<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Raw log retention helpers.
 */

const BBPA_RAW_LOGS_CRON_HOOK = 'bbpa_purge_raw_logs';
const BBPA_RAW_LOGS_CRON_SCHEDULE = 'bbpa_raw_logs_schedule';

/**
 * Check whether raw logs are enabled.
 */
function bbpa_raw_logs_enabled(): bool
{
    return (bool) apply_filters('bbpa_raw_logs_enabled', true);
}

/**
 * Resolve whether raw logs can store advanced fields.
 */
function bbpa_can_store_raw_logs(array $context = []): bool
{
    unset($context);

    return bbpa_raw_logs_enabled();
}

/**
 * Ensure the raw logs option is set with a default.
 */
function bbpa_register_raw_logs_option(): void
{
    // Raw logs are always enabled.
}

/**
 * Get retention in seconds for raw logs.
 */
function bbpa_get_raw_logs_retention_seconds(): int
{
    $settings = bbpa_get_settings();
    $retention_days = isset($settings['raw_logs_retention_days']) ? (int) $settings['raw_logs_retention_days'] : 1;
    if ($retention_days <= 0) {
        $retention = (int) apply_filters('bbpa_raw_logs_retention_seconds', 0);

        return max(0, $retention);
    }

    $retention = $retention_days * DAY_IN_SECONDS;
    $retention = apply_filters('bbpa_raw_logs_retention_seconds', $retention);
    $retention = absint($retention);

    return $retention > 0 ? $retention : DAY_IN_SECONDS;
}

/**
 * Get the cleanup schedule interval for raw logs.
 */
function bbpa_get_raw_logs_cleanup_interval(): int
{
    $settings = bbpa_get_settings();
    $retention_days = isset($settings['raw_logs_retention_days']) ? (int) $settings['raw_logs_retention_days'] : 1;
    if ($retention_days <= 0) {
        return HOUR_IN_SECONDS;
    }

    $interval = $retention_days * DAY_IN_SECONDS;
    $interval = max(HOUR_IN_SECONDS, $interval);

    return absint(apply_filters('bbpa_raw_logs_cleanup_interval', $interval, $retention_days));
}

/**
 * Register the cron schedule for raw log cleanup.
 */
function bbpa_register_raw_logs_cron_schedule(array $schedules): array
{
    $schedules[BBPA_RAW_LOGS_CRON_SCHEDULE] = [
        'interval' => bbpa_get_raw_logs_cleanup_interval(),
        'display' => __('BimBeau Privacy Analytics raw log cleanup', 'bimbeau-privacy-analytics'),
    ];

    return $schedules;
}

/**
 * Schedule raw log cleanup using the retention window.
 */
function bbpa_schedule_raw_log_cleanup(bool $force = false): void
{
    $current_schedule = wp_get_schedule(BBPA_RAW_LOGS_CRON_HOOK);
    $next_run = wp_next_scheduled(BBPA_RAW_LOGS_CRON_HOOK);

    if ($force || $current_schedule !== BBPA_RAW_LOGS_CRON_SCHEDULE || !$next_run) {
        wp_clear_scheduled_hook(BBPA_RAW_LOGS_CRON_HOOK);
        wp_schedule_event(time(), BBPA_RAW_LOGS_CRON_SCHEDULE, BBPA_RAW_LOGS_CRON_HOOK);
    }
}

/**
 * Re-create the raw logs cleanup event when it is missing (hooked on `init`, like the other cron ensures).
 *
 * Covers sites whose event was lost and multisite sites that never ran the activation routine.
 */
function bbpa_ensure_raw_log_cleanup_schedule(): void
{
    bbpa_schedule_raw_log_cleanup(false);
}

/**
 * Purge raw logs older than the retention period.
 *
 * Purges the `bbpa_raw_logs` table in bounded batches and, while it still holds rows written before schema 30,
 * the legacy `bbpa_hits` option. Expired plugin transients are cleaned up in the same run.
 */
function bbpa_purge_raw_logs(): void
{
    $retention_seconds = bbpa_get_raw_logs_retention_seconds();
    $cutoff = time() - $retention_seconds;

    if (bbpa_hit_log_tables_available()) {
        bbpa_delete_hit_log_rows_before('raw', $retention_seconds <= 0 ? 0 : $cutoff);
        bbpa_prune_legacy_realtime_rows();
    }

    bbpa_purge_expired_plugin_transients();

    $hits = get_option('bbpa_hits', []);
    if (!is_array($hits) || $hits === []) {
        return;
    }

    if ($retention_seconds <= 0) {
        update_option('bbpa_hits', [], false);

        return;
    }

    $filtered = array_filter(
        $hits,
        static function ($hit) use ($cutoff): bool {
            if (!is_array($hit)) {
                return false;
            }

            $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
            if ($timestamp === 0) {
                return true;
            }

            return $timestamp >= $cutoff;
        }
    );

    if (count($filtered) === count($hits)) {
        return;
    }

    update_option('bbpa_hits', array_values($filtered), false);
}

/**
 * Drop legacy realtime option rows that no realtime window can display any more.
 *
 * Once the realtime table is in use, the `bbpa_realtime_visitors` option only holds rows written before the upgrade.
 * Rows older than the longest visit window (one day) are never shown again by the realtime panel or the menu badge,
 * so they are removed instead of being read on every admin page. The option itself is kept.
 */
function bbpa_prune_legacy_realtime_rows(): void
{
    $rows = get_option('bbpa_realtime_visitors', []);
    if (!is_array($rows) || $rows === [] || !function_exists('bbpa_normalize_realtime_row_timestamp')) {
        return;
    }

    $cutoff = (int) current_time('timestamp', true) - BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX;
    $kept = array_values(array_filter(
        $rows,
        static function ($row) use ($cutoff): bool {
            if (is_string($row)) {
                $row = json_decode($row, true);
            }

            return is_array($row) && bbpa_normalize_realtime_row_timestamp($row) >= $cutoff;
        }
    ));

    if (count($kept) !== count($rows)) {
        update_option('bbpa_realtime_visitors', $kept, false);
    }
}

/**
 * Map a hit log name to its table suffix and legacy option name.
 *
 * `raw` is the raw hit log (formerly the `bbpa_hits` option), `realtime` the realtime visitor rows (formerly the
 * `bbpa_realtime_visitors` option).
 *
 * @return array{table: string, option: string}|null
 */
function bbpa_get_hit_log_storage(string $log): ?array
{
    $map = [
        'raw' => ['table' => 'bbpa_raw_logs', 'option' => 'bbpa_hits'],
        'realtime' => ['table' => 'bbpa_realtime_log', 'option' => 'bbpa_realtime_visitors'],
    ];

    return $map[$log] ?? null;
}

/**
 * Whether the raw-log and realtime tables (schema 30) are installed.
 *
 * The stored schema version is written only after every critical table exists, so no query is needed. Until the
 * upgrade routine has run (or when the tables cannot be created), rows keep going to the legacy options.
 */
function bbpa_hit_log_tables_available(): bool
{
    return (int) get_option('bbpa_schema_version', 0) >= 30;
}

/**
 * Return the maximum number of rows kept in a hit log.
 */
function bbpa_get_hit_log_max_rows(): int
{
    return max(1, (int) apply_filters('bbpa_max_hits', 1000));
}

/**
 * Append one row to a hit log.
 *
 * Writes a single row into the dedicated table and trims the table to the newest `bbpa_max_hits` rows. Falls back
 * to the legacy option (read, append, rewrite) when the table is not installed yet or the insert fails, so no hit is
 * lost during the upgrade.
 *
 * @param string               $log `raw` or `realtime`.
 * @param array<string, mixed> $row Row to store.
 */
function bbpa_append_hit_log_row(string $log, array $row): bool
{
    global $wpdb;

    $storage = bbpa_get_hit_log_storage($log);
    if ($storage === null) {
        return false;
    }

    $max_rows = bbpa_get_hit_log_max_rows();

    if (bbpa_hit_log_tables_available()) {
        $payload = wp_json_encode($row);
        $table = $wpdb->prefix . $storage['table'];
        if (is_string($payload)) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Append-only log table write.
            $inserted = $wpdb->insert(
                $table,
                [
                    'timestamp_bucket' => bbpa_get_hit_log_row_timestamp($row),
                    'payload' => $payload,
                ],
                ['%d', '%s']
            );

            if ($inserted !== false) {
                bbpa_trim_hit_log_table($table, $max_rows);

                return true;
            }
        }
    }

    $rows = get_option($storage['option'], []);
    if (!is_array($rows)) {
        $rows = [];
    }

    $rows[] = $row;
    if (count($rows) > $max_rows) {
        $rows = array_slice($rows, -$max_rows);
    }

    return update_option($storage['option'], $rows, false) !== false;
}

/**
 * Resolve the Unix timestamp (seconds) indexed for a hit log row.
 *
 * @param array<string, mixed> $row Hit log row.
 */
function bbpa_get_hit_log_row_timestamp(array $row): int
{
    $timestamp = isset($row['timestamp_bucket']) && is_numeric($row['timestamp_bucket'])
        ? (int) $row['timestamp_bucket']
        : 0;
    if ($timestamp > 9999999999) {
        $timestamp = (int) floor($timestamp / 1000);
    }

    return max(0, $timestamp);
}

/**
 * Keep only the newest rows of a hit log table.
 */
function bbpa_trim_hit_log_table(string $table, int $max_rows): void
{
    global $wpdb;

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Primary-key range lookup on a log table.
    $boundary_id = $wpdb->get_var(
        $wpdb->prepare('SELECT id FROM %i ORDER BY id DESC LIMIT 1 OFFSET %d', $table, max(1, $max_rows))
    );
    if ($boundary_id === null) {
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Bounded log trim.
    $wpdb->query($wpdb->prepare('DELETE FROM %i WHERE id <= %d', $table, (int) $boundary_id));
}

/**
 * Read hit log rows in chronological order (oldest first), like the former option arrays.
 *
 * Rows still stored in the legacy option (written before schema 30) come first, as they are older. Legacy rows are
 * returned as stored (callers already validate them); table rows are filtered on `timestamp_bucket >= $since`.
 * The legacy option is read during the transition release only.
 *
 * @param string $log   `raw` or `realtime`.
 * @param int    $since Minimum timestamp_bucket for table rows (0 = no lower bound).
 * @param int    $limit Maximum number of rows, newest kept (0 = `bbpa_max_hits`).
 * @return array<int, mixed>
 */
function bbpa_get_hit_log_rows(string $log, int $since = 0, int $limit = 0): array
{
    global $wpdb;

    $storage = bbpa_get_hit_log_storage($log);
    if ($storage === null) {
        return [];
    }

    $limit = $limit > 0 ? $limit : bbpa_get_hit_log_max_rows();
    $rows = [];

    if (bbpa_hit_log_tables_available()) {
        $table = $wpdb->prefix . $storage['table'];
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Indexed read of a live log table.
        $payloads = $wpdb->get_col(
            $wpdb->prepare(
                'SELECT payload FROM %i WHERE timestamp_bucket >= %d ORDER BY id DESC LIMIT %d',
                $table,
                max(0, $since),
                $limit
            )
        );

        foreach (array_reverse(is_array($payloads) ? $payloads : []) as $payload) {
            $decoded = json_decode((string) $payload, true);
            if (is_array($decoded)) {
                $rows[] = $decoded;
            }
        }
    }

    $legacy_rows = get_option($storage['option'], []);
    if (is_array($legacy_rows) && $legacy_rows !== [] && count($rows) < $limit) {
        $legacy_rows = array_slice(array_values($legacy_rows), -($limit - count($rows)));
        $rows = array_merge($legacy_rows, $rows);
    }

    return $rows;
}

/**
 * Read raw hit log rows, oldest first.
 *
 * @return array<int, mixed>
 */
function bbpa_get_raw_log_rows(int $since = 0, int $limit = 0): array
{
    return bbpa_get_hit_log_rows('raw', $since, $limit);
}

/**
 * Read realtime visitor rows, oldest first.
 *
 * @return array<int, mixed>
 */
function bbpa_get_realtime_log_rows(int $since = 0, int $limit = 0): array
{
    return bbpa_get_hit_log_rows('realtime', $since, $limit);
}

/**
 * Mark the oldest raw log row of a base page view as upgraded by an enriched hit.
 *
 * Looks in the legacy option first (older rows), then in the table rows of the same timestamp bucket.
 *
 * @param array{page_path: string, timestamp_bucket: int, device_class: string} $criteria Base page-view keys.
 * @param array<string, mixed>                                                  $changes  Fields to set.
 */
function bbpa_merge_raw_log_row(array $criteria, array $changes): bool
{
    global $wpdb;

    $page_path = (string) ($criteria['page_path'] ?? '');
    $timestamp_bucket = absint($criteria['timestamp_bucket'] ?? 0);
    $device_class = (string) ($criteria['device_class'] ?? '');
    $matches = static function ($row) use ($page_path, $timestamp_bucket, $device_class): bool {
        return is_array($row)
            && ((string) ($row['page_path'] ?? '')) === $page_path
            && absint($row['timestamp_bucket'] ?? 0) === $timestamp_bucket
            && ((string) ($row['device_class'] ?? '')) === $device_class;
    };

    $legacy_rows = get_option('bbpa_hits', []);
    if (is_array($legacy_rows) && $legacy_rows !== []) {
        foreach ($legacy_rows as $index => $row) {
            if (!$matches($row)) {
                continue;
            }

            $legacy_rows[$index] = array_merge($row, $changes);
            update_option('bbpa_hits', $legacy_rows, false);

            return true;
        }
    }

    if (!bbpa_hit_log_tables_available()) {
        return false;
    }

    $table = $wpdb->prefix . 'bbpa_raw_logs';
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Indexed lookup of one timestamp bucket.
    $candidates = $wpdb->get_results(
        $wpdb->prepare(
            'SELECT id, payload FROM %i WHERE timestamp_bucket = %d ORDER BY id ASC LIMIT 500',
            $table,
            $timestamp_bucket
        ),
        ARRAY_A
    );

    foreach (is_array($candidates) ? $candidates : [] as $candidate) {
        $row = json_decode((string) ($candidate['payload'] ?? ''), true);
        if (!$matches($row)) {
            continue;
        }

        $payload = wp_json_encode(array_merge($row, $changes));
        if (!is_string($payload)) {
            return false;
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Single-row update by primary key.
        $updated = $wpdb->update($table, ['payload' => $payload], ['id' => (int) $candidate['id']], ['%s'], ['%d']);

        return $updated !== false;
    }

    return false;
}

/**
 * Delete hit log table rows older than a cutoff, in bounded batches.
 *
 * @param string $log    `raw` or `realtime`.
 * @param int    $cutoff Rows with 0 < timestamp_bucket < $cutoff are deleted; 0 deletes every row.
 * @return int Number of deleted rows.
 */
function bbpa_delete_hit_log_rows_before(string $log, int $cutoff): int
{
    global $wpdb;

    $storage = bbpa_get_hit_log_storage($log);
    if ($storage === null) {
        return 0;
    }

    $table = $wpdb->prefix . $storage['table'];
    $batch_size = 5000;
    $deleted_total = 0;
    $deadline = microtime(true) + 20;

    do {
        if ($cutoff <= 0) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Batched log purge.
            $deleted = $wpdb->query($wpdb->prepare('DELETE FROM %i ORDER BY id ASC LIMIT %d', $table, $batch_size));
        } else {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Batched log purge.
            $deleted = $wpdb->query(
                $wpdb->prepare(
                    'DELETE FROM %i WHERE timestamp_bucket > 0 AND timestamp_bucket < %d ORDER BY timestamp_bucket ASC LIMIT %d',
                    $table,
                    $cutoff,
                    $batch_size
                )
            );
        }

        $deleted = is_int($deleted) ? $deleted : 0;
        $deleted_total += $deleted;
    } while ($deleted === $batch_size && microtime(true) < $deadline);

    return $deleted_total;
}

/**
 * Delete expired plugin transients from the options table, in bounded batches.
 *
 * Ingestion writes short-lived `bbpa_*` transients (dedupe, visit markers, rate limits). WordPress removes expired
 * transients only once a day; this keeps the options table small between two passes. Nothing is done when a
 * persistent object cache stores transients.
 */
function bbpa_purge_expired_plugin_transients(int $batch_size = 200): int
{
    global $wpdb;

    if (wp_using_ext_object_cache()) {
        return 0;
    }

    $timeout_prefix = '_transient_timeout_bbpa_';
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Expired transient lookup, like delete_expired_transients().
    $expired = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s AND option_value < %d LIMIT %d",
            $wpdb->esc_like($timeout_prefix) . '%',
            time(),
            max(1, $batch_size)
        )
    );
    if (!is_array($expired)) {
        return 0;
    }

    foreach ($expired as $timeout_name) {
        delete_transient(substr((string) $timeout_name, strlen('_transient_timeout_')));
    }

    return count($expired);
}
