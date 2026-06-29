<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * Aggregation helpers for BimBeau Privacy Analytics.
 */

const BBPA_AGGREGATION_CRON_HOOK = 'bbpa_aggregate_hits';
const BBPA_AGGREGATION_INTERVAL_OPTION = 'bbpa_aggregation_interval';
const BBPA_AGGREGATED_RETENTION_CRON_HOOK = 'bbpa_purge_aggregated_retention';
const BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE = 'bbpa_aggregated_retention_schedule';
/**
 * Return the base aggregation interval in seconds.
 */
function bbpa_get_aggregation_base_interval(): int
{
    $interval = (int) apply_filters('bbpa_aggregation_base_interval', 5 * MINUTE_IN_SECONDS);
    $interval = max(MINUTE_IN_SECONDS, $interval);

    return $interval;
}

/**
 * Return the maximum aggregation interval in seconds.
 */
function bbpa_get_aggregation_max_interval(): int
{
    $max_interval = (int) apply_filters('bbpa_aggregation_max_interval', DAY_IN_SECONDS);

    return max(bbpa_get_aggregation_base_interval(), $max_interval);
}

/**
 * Return the currently stored aggregation interval.
 */
function bbpa_get_stored_aggregation_interval(): int
{
    $stored = (int) get_option(BBPA_AGGREGATION_INTERVAL_OPTION, bbpa_get_aggregation_base_interval());

    return min(bbpa_get_aggregation_max_interval(), max(bbpa_get_aggregation_base_interval(), $stored));
}

/**
 * Compute the next aggregation interval after one run.
 */
function bbpa_compute_next_aggregation_interval(bool $processed_items): int
{
    $base_interval = bbpa_get_aggregation_base_interval();
    if ($processed_items) {
        return $base_interval;
    }

    $current_interval = bbpa_get_stored_aggregation_interval();
    $next_interval = $current_interval * 2;

    return min(bbpa_get_aggregation_max_interval(), max($base_interval, $next_interval));
}

/**
 * Store and schedule the next aggregation run.
 */
function bbpa_schedule_next_aggregation(bool $processed_items): void
{
    $interval = bbpa_compute_next_aggregation_interval($processed_items);
    update_option(BBPA_AGGREGATION_INTERVAL_OPTION, $interval, false);

    wp_clear_scheduled_hook(BBPA_AGGREGATION_CRON_HOOK);
    wp_schedule_single_event(time() + $interval, BBPA_AGGREGATION_CRON_HOOK);
}

/**
 * Ensure a single aggregation event is scheduled.
 */
function bbpa_ensure_aggregation_schedule(): void
{
    $current_schedule = wp_get_schedule(BBPA_AGGREGATION_CRON_HOOK);
    if ($current_schedule) {
        wp_clear_scheduled_hook(BBPA_AGGREGATION_CRON_HOOK);
    }

    if (!wp_next_scheduled(BBPA_AGGREGATION_CRON_HOOK)) {
        $interval = bbpa_get_stored_aggregation_interval();
        wp_schedule_single_event(time() + $interval, BBPA_AGGREGATION_CRON_HOOK);
    }
}

/**
 * Get the cleanup schedule interval for aggregated retention.
 */
function bbpa_get_aggregated_retention_cleanup_interval(): int
{
    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
    $frequency_days = isset($settings['aggregated_retention_frequency_days'])
        ? absint($settings['aggregated_retention_frequency_days'])
        : 30;
    if ($frequency_days < 1) {
        $frequency_days = 30;
    }

    $interval = $frequency_days * DAY_IN_SECONDS;
    $interval = max(DAY_IN_SECONDS, $interval);

    return absint(apply_filters('bbpa_aggregated_retention_cleanup_interval', $interval, $frequency_days));
}

/**
 * Register the cron schedule for aggregated retention cleanup.
 */
function bbpa_register_aggregated_retention_cron_schedule(array $schedules): array
{
    $schedules[BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE] = [
        'interval' => bbpa_get_aggregated_retention_cleanup_interval(),
        'display' => __('BimBeau Privacy Analytics aggregated retention cleanup', 'bimbeau-privacy-analytics'),
    ];

    return $schedules;
}

/**
 * Schedule aggregated retention cleanup using the configured frequency.
 */
function bbpa_schedule_aggregated_retention_cleanup(bool $force = false): void
{
    $current_schedule = wp_get_schedule(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    $next_run = wp_next_scheduled(BBPA_AGGREGATED_RETENTION_CRON_HOOK);

    if ($force || $current_schedule !== BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE || !$next_run) {
        wp_clear_scheduled_hook(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
        wp_schedule_event(time(), BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE, BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    }
}


/**
 * Determine if an aggregation table exists.
 */
function bbpa_aggregation_table_exists(string $table): bool
{
    global $wpdb;

    $cache_key = bbpa_cache_key('aggregation_table_exists', [
        'table' => $table,
    ]);
    $cached = wp_cache_get($cache_key, 'bpa');
    if (is_bool($cached)) {
        return $cached;
    }

    $result = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
    $exists = $result === $table;

    wp_cache_set($cache_key, $exists, 'bpa', HOUR_IN_SECONDS);

    return $exists;
}

/**
 * Purge aggregated rows that exceed the configured retention window.
 */
function bbpa_purge_aggregated_data_by_retention(): void
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

    $overview_retention_days = isset($settings['overview_totals_retention_days'])
        ? absint($settings['overview_totals_retention_days'])
        : 730;
    $overview_retention_days = max($retention_days, max(365, min(3650, $overview_retention_days)));

    $current_timestamp = (int) current_time('timestamp');
    $cutoff_timestamp = $current_timestamp - ($retention_days * DAY_IN_SECONDS);
    $overview_cutoff_timestamp = $current_timestamp - ($overview_retention_days * DAY_IN_SECONDS);
    $cutoff_date = wp_date('Y-m-d', $cutoff_timestamp);
    $overview_cutoff_date = wp_date('Y-m-d', $overview_cutoff_timestamp);
    $cutoff_datetime = wp_date('Y-m-d H:i:s', $cutoff_timestamp);

    $deleted_any_rows = false;

    $visitors_table = $wpdb->prefix . 'bbpa_visitors';
    if (bbpa_aggregation_table_exists($visitors_table)) {
        $deleted_rows = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$visitors_table} WHERE last_view_at < %d",
                $cutoff_timestamp
            )
        );
        $deleted_any_rows = $deleted_any_rows || (is_int($deleted_rows) && $deleted_rows > 0);
    }

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
        'bbpa_visitor_activity_daily' => 'date_bucket',
        'bbpa_event_actions_daily' => 'day_bucket',
        'bbpa_events_daily' => 'day_bucket',
    ];
    foreach ($date_bucket_tables as $table_suffix => $bucket_column) {
        $table = $wpdb->prefix . $table_suffix;
        if (!bbpa_aggregation_table_exists($table)) {
            continue;
        }

        $deleted_rows = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE {$bucket_column} < %s",
                $cutoff_date
            )
        );
        $deleted_any_rows = $deleted_any_rows || (is_int($deleted_rows) && $deleted_rows > 0);
    }

    $overview_daily_table = $wpdb->prefix . 'bbpa_overview_daily';
    if (bbpa_aggregation_table_exists($overview_daily_table)) {
        $deleted_rows = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$overview_daily_table} WHERE date_bucket < %s",
                $overview_cutoff_date
            )
        );
        $deleted_any_rows = $deleted_any_rows || (is_int($deleted_rows) && $deleted_rows > 0);
    }

    $datetime_bucket_tables = [
        'bbpa_hourly' => 'date_bucket',
        'bbpa_entry_exit_hourly' => 'date_bucket',
        'bbpa_event_occurrences' => 'triggered_at',
    ];
    foreach ($datetime_bucket_tables as $table_suffix => $bucket_column) {
        $table = $wpdb->prefix . $table_suffix;
        if (!bbpa_aggregation_table_exists($table)) {
            continue;
        }

        $deleted_rows = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE {$bucket_column} < %s",
                $cutoff_datetime
            )
        );
        $deleted_any_rows = $deleted_any_rows || (is_int($deleted_rows) && $deleted_rows > 0);
    }

    if ($deleted_any_rows) {
        bbpa_flush_admin_cache();
    }
}

/**
 * Determine whether hourly aggregation is enabled and available.
 */
function bbpa_hourly_aggregation_enabled(): bool
{
    static $enabled = null;

    if ($enabled !== null) {
        return $enabled;
    }

    $enabled = (bool) apply_filters('bbpa_hourly_aggregation_enabled', true);
    if (!$enabled) {
        return false;
    }

    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_hourly';
    $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
    $enabled = ($exists === $table);

    return $enabled;
}

/**
 * Run aggregation for stored raw hits.
 */
function bbpa_aggregate_hits(): void
{
    $processed_items = false;

    if (!bbpa_raw_logs_enabled()) {
        bbpa_schedule_next_aggregation($processed_items);
        return;
    }

    $hits = get_option('bbpa_hits', []);
    if (!is_array($hits) || $hits === []) {
        bbpa_schedule_next_aggregation($processed_items);
        return;
    }

    $aggregates = bbpa_build_aggregates_from_hits($hits);
    if (
        $aggregates['updated_hits'] === $hits
        && $aggregates['daily'] === []
        && $aggregates['hourly'] === []
        && $aggregates['entry_exit'] === []
        && $aggregates['daily_source_category'] === []
        && $aggregates['entry_exit_hourly'] === []
        && $aggregates['time_daily'] === []
        && $aggregates['page_time_daily'] === []
    ) {
        bbpa_schedule_next_aggregation($processed_items);
        return;
    }

    $processed_items = true;

    if ($aggregates['daily'] !== []) {
        bbpa_upsert_aggregate_rows('daily', $aggregates['daily']);
    }

    if ($aggregates['hourly'] !== []) {
        bbpa_upsert_aggregate_rows('hourly', $aggregates['hourly']);
    }

    if ($aggregates['daily_source_category'] !== []) {
        bbpa_upsert_daily_source_category_rows($aggregates['daily_source_category']);
    }

    if ($aggregates['entry_exit'] !== []) {
        bbpa_upsert_entry_exit_rows($aggregates['entry_exit']);
    }
    if ($aggregates['entry_exit_hourly'] !== []) {
        bbpa_upsert_entry_exit_hourly_rows($aggregates['entry_exit_hourly']);
    }
    foreach ($aggregates['time_daily'] as $row) {
        bbpa_increment_time_active_ms_total_daily($row['date_bucket'], (int) $row['active_ms_total']);
        bbpa_increment_time_visits_with_time_daily($row['date_bucket'], (int) $row['visits_with_time']);
    }
    foreach ($aggregates['page_time_daily'] as $row) {
        bbpa_increment_page_time_daily($row['date_bucket'], $row['page_path'], (int) $row['active_ms_total'], (int) $row['visits_with_time']);
    }
    if ($aggregates['overview_daily'] !== []) {
        bbpa_upsert_overview_daily_rows($aggregates['overview_daily']);
    }

    update_option('bbpa_hits', $aggregates['updated_hits'], false);

    if (
        $aggregates['daily'] !== []
        || $aggregates['hourly'] !== []
        || $aggregates['entry_exit'] !== []
        || $aggregates['daily_source_category'] !== []
        || $aggregates['entry_exit_hourly'] !== []
        || $aggregates['time_daily'] !== []
        || $aggregates['page_time_daily'] !== []
    ) {
        bbpa_flush_admin_cache();
    }

    bbpa_schedule_next_aggregation($processed_items);
}

/**
 * Build aggregate rows and update raw hits with aggregation markers.
 */
function bbpa_build_aggregates_from_hits(array $hits): array
{
    $daily = [];
    $hourly = [];
    $updated_hits = [];
    $entry_exit = [];
    $entry_exit_hourly = [];
    $time_daily = [];
    $page_time_daily = [];
    $daily_source_category = [];
    $acquisition_visit_keys = [];
    $collect_hourly = bbpa_hourly_aggregation_enabled();
    $session_exit_mode = bbpa_get_exit_detection_mode();
    $session_timeout = bbpa_get_exit_session_timeout();
    $session_hits = [];
    $time_denominator_keys = [];

    foreach ($hits as $hit) {
        if (!is_array($hit)) {
            continue;
        }

        if (!empty($hit['aggregated'])) {
            $updated_hits[] = $hit;
            continue;
        }

        $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
        $page_path = isset($hit['page_path']) ? (string) $hit['page_path'] : '';
        $device_class = isset($hit['device_class']) ? (string) $hit['device_class'] : '';
        $referrer_domain = isset($hit['referrer_domain']) && $hit['referrer_domain'] !== null
            ? (string) $hit['referrer_domain']
            : '';

        if ($timestamp === 0 || $page_path === '' || $device_class === '') {
            $updated_hits[] = $hit;
            continue;
        }

        $date_bucket = wp_date('Y-m-d', $timestamp);
        $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
        $is_page_view_event = $event_name === 'page_view';
        $active_ms_delta = isset($hit['active_ms_delta']) ? absint($hit['active_ms_delta']) : 0;
        $tracks_time_metrics = ($is_page_view_event || $event_name === 'heartbeat')
            && $active_ms_delta > 0
            && $device_class !== 'bot';

        if ($tracks_time_metrics) {
            $time_denominator_key = bbpa_get_time_denominator_key($hit, $date_bucket, $page_path, $timestamp);
            $visits_with_time_increment = isset($time_denominator_keys[$time_denominator_key]) ? 0 : 1;
            $time_denominator_keys[$time_denominator_key] = true;

            if (!isset($time_daily[$date_bucket])) {
                $time_daily[$date_bucket] = [
                    'date_bucket' => $date_bucket,
                    'active_ms_total' => 0,
                    'visits_with_time' => 0,
                ];
            }
            $time_daily[$date_bucket]['active_ms_total'] += $active_ms_delta;
            $time_daily[$date_bucket]['visits_with_time'] += $visits_with_time_increment;

            $page_time_key = implode('|', [$date_bucket, $page_path]);
            if (!isset($page_time_daily[$page_time_key])) {
                $page_time_daily[$page_time_key] = [
                    'date_bucket' => $date_bucket,
                    'page_path' => $page_path,
                    'active_ms_total' => 0,
                    'visits_with_time' => 0,
                ];
            }
            $page_time_daily[$page_time_key]['active_ms_total'] += $active_ms_delta;
            $page_time_daily[$page_time_key]['visits_with_time'] += $visits_with_time_increment;
        }

        if (!$is_page_view_event) {
            $hit['aggregated'] = true;
            $hit['aggregated_at'] = current_time('timestamp');
            $updated_hits[] = $hit;
            continue;
        }

        $daily_key = implode('|', [$date_bucket, $page_path, $referrer_domain, $device_class]);
        if (!isset($daily[$daily_key])) {
            $daily[$daily_key] = [
                'date_bucket' => $date_bucket,
                'page_path' => $page_path,
                'referrer_domain' => $referrer_domain,
                'device_class' => $device_class,
                'hits' => 0,
            ];
        }
        $daily[$daily_key]['hits']++;

        $utm_params = isset($hit['utm_params']) && is_array($hit['utm_params']) ? $hit['utm_params'] : [];
        $source_category = bbpa_get_source_category_from_tracking_context($referrer_domain, $utm_params);
        $source_category_key = implode('|', [$date_bucket, $page_path, $referrer_domain, $source_category]);
        if (!isset($daily_source_category[$source_category_key])) {
            $daily_source_category[$source_category_key] = [
                'date_bucket' => $date_bucket,
                'page_path' => $page_path,
                'referrer_domain' => $referrer_domain,
                'source_category' => $source_category,
                'hits' => 0,
                'visits' => 0,
            ];
        }
        $daily_source_category[$source_category_key]['hits']++;

        if ($collect_hourly) {
            $hour_bucket = wp_date('Y-m-d H:00:00', $timestamp);
            $hourly_key = implode('|', [$hour_bucket, $page_path, $referrer_domain, $device_class]);
            if (!isset($hourly[$hourly_key])) {
                $hourly[$hourly_key] = [
                    'date_bucket' => $hour_bucket,
                    'page_path' => $page_path,
                    'referrer_domain' => $referrer_domain,
                    'device_class' => $device_class,
                    'hits' => 0,
                ];
            }
            $hourly[$hourly_key]['hits']++;
        }

        $is_entry = bbpa_is_entry_hit($page_path, $referrer_domain);
        if ($is_entry) {
            $entry_exit_key = implode('|', [$date_bucket, $page_path]);
            if (!isset($entry_exit[$entry_exit_key])) {
                $entry_exit[$entry_exit_key] = [
                    'date_bucket' => $date_bucket,
                    'page_path' => $page_path,
                    'entries' => 0,
                    'exits' => 0,
                ];
            }
            if ($is_entry) {
                $entry_exit[$entry_exit_key]['entries']++;
            }

            $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
            $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
            if ($visit_id !== '' || $visitor_id !== '') {
                $acquisition_visit_key = $visit_id !== ''
                    ? 'visit:' . $visit_id
                    : 'visitor-day:' . $date_bucket . ':' . $visitor_id;
                if (!isset($acquisition_visit_keys[$acquisition_visit_key])) {
                    $daily_source_category[$source_category_key]['visits']++;
                    $acquisition_visit_keys[$acquisition_visit_key] = true;
                }
            } elseif ($is_entry) {
                $daily_source_category[$source_category_key]['visits']++;
            }
            if ($collect_hourly) {
                $hour_bucket = wp_date('Y-m-d H:00:00', $timestamp);
                $entry_exit_hourly_key = implode('|', [$hour_bucket, $page_path]);
                if (!isset($entry_exit_hourly[$entry_exit_hourly_key])) {
                    $entry_exit_hourly[$entry_exit_hourly_key] = [
                        'date_bucket' => $hour_bucket,
                        'page_path' => $page_path,
                        'entries' => 0,
                        'exits' => 0,
                    ];
                }
                if ($is_entry) {
                    $entry_exit_hourly[$entry_exit_hourly_key]['entries']++;
                }
            }
        }

        $session_hits[] = [
            'visitor_id' => isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '',
            'timestamp' => $timestamp,
            'date_bucket' => $date_bucket,
            'hour_bucket' => $collect_hourly ? wp_date('Y-m-d H:00:00', $timestamp) : '',
            'page_path' => $page_path,
            'referrer_domain' => $referrer_domain,
        ];

        $hit['aggregated'] = true;
        $hit['aggregated_at'] = current_time('timestamp');
        $updated_hits[] = $hit;
    }

    if ($session_exit_mode === 'session') {
        bbpa_apply_session_exit_counts(
            $session_hits,
            $session_timeout,
            $entry_exit,
            $entry_exit_hourly,
            $collect_hourly
        );

        $session_fallback_hits = array_values(array_filter(
            $session_hits,
            static function (array $session_hit): bool {
                return ((string) ($session_hit['visitor_id'] ?? '')) === '';
            }
        ));
        if ($session_fallback_hits !== []) {
            bbpa_apply_referrer_exit_counts($session_fallback_hits, $entry_exit, $entry_exit_hourly, $collect_hourly);
        }
    } else {
        bbpa_apply_referrer_exit_counts($session_hits, $entry_exit, $entry_exit_hourly, $collect_hourly);
    }

    return [
        'daily' => array_values($daily),
        'hourly' => array_values($hourly),
        'entry_exit' => array_values($entry_exit),
        'daily_source_category' => array_values($daily_source_category),
        'entry_exit_hourly' => array_values($entry_exit_hourly),
        'time_daily' => array_values($time_daily),
        'page_time_daily' => array_values($page_time_daily),
        'overview_daily' => bbpa_build_overview_daily_rows($daily, $entry_exit, $time_daily),
        'updated_hits' => $updated_hits,
    ];
}

/**
 * Build canonical overview daily rows from detailed aggregate buckets.
 *
 * Visits source: entry buckets (`entries`) from entry/exit aggregation.
 * Fallback: when no entries exist for a date bucket, visits fallback to human page views.
 */
function bbpa_build_overview_daily_rows(array $daily_rows, array $entry_exit_rows, array $time_rows): array
{
    $overview = [];

    foreach ($daily_rows as $row) {
        $date_bucket = isset($row['date_bucket']) ? (string) $row['date_bucket'] : '';
        if ($date_bucket === '') {
            continue;
        }

        if (!isset($overview[$date_bucket])) {
            $overview[$date_bucket] = [
                'date_bucket' => $date_bucket,
                'page_views' => 0,
                'bot_page_views' => 0,
                'visits' => 0,
                'active_ms_total' => 0,
                'visits_with_time' => 0,
                'has_entry_signal' => false,
            ];
        }

        $hits = isset($row['hits']) ? (int) $row['hits'] : 0;
        $device_class = isset($row['device_class']) ? (string) $row['device_class'] : '';
        if ($device_class === 'bot') {
            $overview[$date_bucket]['bot_page_views'] += $hits;
        } else {
            $overview[$date_bucket]['page_views'] += $hits;
        }
    }

    foreach ($entry_exit_rows as $row) {
        $date_bucket = isset($row['date_bucket']) ? (string) $row['date_bucket'] : '';
        if ($date_bucket === '') {
            continue;
        }

        if (!isset($overview[$date_bucket])) {
            $overview[$date_bucket] = [
                'date_bucket' => $date_bucket,
                'page_views' => 0,
                'bot_page_views' => 0,
                'visits' => 0,
                'active_ms_total' => 0,
                'visits_with_time' => 0,
                'has_entry_signal' => false,
            ];
        }

        $entries = isset($row['entries']) ? (int) $row['entries'] : 0;
        if ($entries > 0) {
            $overview[$date_bucket]['visits'] += $entries;
            $overview[$date_bucket]['has_entry_signal'] = true;
        }
    }

    foreach ($time_rows as $row) {
        $date_bucket = isset($row['date_bucket']) ? (string) $row['date_bucket'] : '';
        if ($date_bucket === '') {
            continue;
        }

        if (!isset($overview[$date_bucket])) {
            $overview[$date_bucket] = [
                'date_bucket' => $date_bucket,
                'page_views' => 0,
                'bot_page_views' => 0,
                'visits' => 0,
                'active_ms_total' => 0,
                'visits_with_time' => 0,
                'has_entry_signal' => false,
            ];
        }

        $overview[$date_bucket]['active_ms_total'] += isset($row['active_ms_total']) ? (int) $row['active_ms_total'] : 0;
        $overview[$date_bucket]['visits_with_time'] += isset($row['visits_with_time']) ? (int) $row['visits_with_time'] : 0;
    }

    foreach ($overview as &$row) {
        if (!$row['has_entry_signal']) {
            $row['visits'] = $row['page_views'];
        }
        unset($row['has_entry_signal']);
    }
    unset($row);

    return array_values($overview);
}

/**
 * Resolve the exit detection mode used by the aggregation pipeline.
 *
 * Exit detection is session-only: the exit page is the last page of a visitor session.
 */
function bbpa_get_exit_detection_mode(): string
{
    return 'session';
}

/**
 * Resolve the session timeout (seconds) used for session-based exit detection.
 */
function bbpa_get_exit_session_timeout(): int
{
    $timeout = (int) apply_filters('bbpa_exit_session_timeout', 30 * MINUTE_IN_SECONDS);

    return max(MINUTE_IN_SECONDS, $timeout);
}

/**
 * Apply session-based exit classification from grouped visitor hits.
 */
function bbpa_apply_session_exit_counts(
    array $session_hits,
    int $session_timeout,
    array &$entry_exit,
    array &$entry_exit_hourly,
    bool $collect_hourly
): void {
    $hits_by_visitor = [];

    foreach ($session_hits as $session_hit) {
        $visitor_id = $session_hit['visitor_id'];
        if ($visitor_id === '') {
            continue;
        }

        if (!isset($hits_by_visitor[$visitor_id])) {
            $hits_by_visitor[$visitor_id] = [];
        }

        $hits_by_visitor[$visitor_id][] = $session_hit;
    }

    foreach ($hits_by_visitor as $visitor_hits) {
        usort(
            $visitor_hits,
            static function (array $left, array $right): int {
                return $left['timestamp'] <=> $right['timestamp'];
            }
        );

        $previous = null;
        foreach ($visitor_hits as $current_hit) {
            if ($previous !== null && ($current_hit['timestamp'] - $previous['timestamp']) > $session_timeout) {
                bbpa_increment_exit_bucket(
                    $entry_exit,
                    $previous['date_bucket'],
                    $previous['page_path']
                );

                if ($collect_hourly) {
                    bbpa_increment_exit_bucket(
                        $entry_exit_hourly,
                        $previous['hour_bucket'],
                        $previous['page_path']
                    );
                }
            }

            $previous = $current_hit;
        }

        if ($previous !== null) {
            bbpa_increment_exit_bucket(
                $entry_exit,
                $previous['date_bucket'],
                $previous['page_path']
            );

            if ($collect_hourly) {
                bbpa_increment_exit_bucket(
                    $entry_exit_hourly,
                    $previous['hour_bucket'],
                    $previous['page_path']
                );
            }
        }
    }
}

/**
 * Increment exits in an entry/exit bucket map.
 */
function bbpa_increment_exit_bucket(array &$bucket_rows, string $date_bucket, string $page_path): void
{
    if ($date_bucket === '' || $page_path === '') {
        return;
    }

    $bucket_key = implode('|', [$date_bucket, $page_path]);
    if (!isset($bucket_rows[$bucket_key])) {
        $bucket_rows[$bucket_key] = [
            'date_bucket' => $date_bucket,
            'page_path' => $page_path,
            'entries' => 0,
            'exits' => 0,
        ];
    }

    $bucket_rows[$bucket_key]['exits']++;
}

/**
 * Resolve the cache key used to store the latest visitor page-view state.
 */
function bbpa_get_session_exit_state_cache_key(string $visitor_id): string
{
    return 'bbpa_exit_state_' . md5($visitor_id);
}

/**
 * Persist session-based provisional exit counts per visitor.
 */
function bbpa_apply_session_exit_tracking_for_hit(string $visitor_id, string $page_path, int $timestamp): void
{
    global $wpdb;

    if ($visitor_id === '' || $page_path === '' || $timestamp <= 0) {
        return;
    }

    $visitor_id = sanitize_text_field($visitor_id);
    $page_path = sanitize_text_field($page_path);
    if ($visitor_id === '' || $page_path === '') {
        return;
    }

    $cache_key = bbpa_get_session_exit_state_cache_key($visitor_id);
    $state = wp_cache_get($cache_key, 'bpa');
    if (!is_array($state)) {
        $state = get_transient($cache_key);
    }
    if (!is_array($state)) {
        $state = [];
    }

    $previous_page_path = isset($state['page_path']) ? sanitize_text_field((string) $state['page_path']) : '';
    $previous_timestamp = isset($state['timestamp']) ? absint($state['timestamp']) : 0;
    $timeout = bbpa_get_exit_session_timeout();

    if (
        $previous_page_path !== ''
        && $previous_timestamp > 0
        && $timestamp > $previous_timestamp
        && ($timestamp - $previous_timestamp) <= $timeout
    ) {
        $previous_date_bucket = wp_date('Y-m-d', $previous_timestamp);
        $previous_hour_bucket = wp_date('Y-m-d H:00:00', $previous_timestamp);
        $entry_exit_table = bbpa_sql_table_name('bbpa_entry_exit_daily');
        $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$entry_exit_table} SET exits = GREATEST(exits - 1, 0) WHERE date_bucket = %s AND page_path = %s",
                $previous_date_bucket,
                $previous_page_path
            )
        );

        if (bbpa_hourly_aggregation_enabled()) {
            $entry_exit_hourly_table = bbpa_sql_table_name('bbpa_entry_exit_hourly');
            $wpdb->query(
                $wpdb->prepare(
                    "UPDATE {$entry_exit_hourly_table} SET exits = GREATEST(exits - 1, 0) WHERE date_bucket = %s AND page_path = %s",
                    $previous_hour_bucket,
                    $previous_page_path
                )
            );
        }
    }

    $date_bucket = wp_date('Y-m-d', $timestamp);
    bbpa_increment_entry_exit_daily($date_bucket, $page_path, 0, 1);
    if (bbpa_hourly_aggregation_enabled()) {
        bbpa_increment_entry_exit_hourly(
            wp_date('Y-m-d H:00:00', $timestamp),
            $page_path,
            0,
            1
        );
    }

    $new_state = [
        'page_path' => $page_path,
        'timestamp' => $timestamp,
    ];
    wp_cache_set($cache_key, $new_state, 'bpa', 2 * DAY_IN_SECONDS);
    set_transient($cache_key, $new_state, 2 * DAY_IN_SECONDS);
}


/**
 * Build the stable page-time denominator key for a hit.
 */
function bbpa_get_time_denominator_key(array $hit, string $date_bucket, string $page_path, int $timestamp): string
{
    $temporary_hit_id = isset($hit['temporary_hit_id']) ? sanitize_text_field((string) $hit['temporary_hit_id']) : '';
    if ($temporary_hit_id !== '') {
        return implode('|', ['tmp', $date_bucket, $page_path, $temporary_hit_id]);
    }

    $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
    if ($visit_id !== '') {
        return implode('|', ['visit', $date_bucket, $page_path, $visit_id]);
    }

    $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
    if ($visitor_id !== '') {
        return implode('|', ['visitor-time', $date_bucket, $page_path, $visitor_id, (string) $timestamp]);
    }

    $idempotency_key = isset($hit['idempotency_key']) ? sanitize_text_field((string) $hit['idempotency_key']) : '';
    if ($idempotency_key !== '') {
        return implode('|', ['idempotency', $date_bucket, $page_path, $idempotency_key]);
    }

    return implode('|', ['timestamp', $date_bucket, $page_path, (string) $timestamp]);
}

/**
 * Claim a direct-ingestion page-time denominator once across repeated heartbeat deltas.
 */
function bbpa_claim_time_denominator_increment(array $hit, string $date_bucket, string $page_path, int $timestamp): int
{
    $marker_key = 'bbpa_time_denominator_' . md5(bbpa_get_time_denominator_key($hit, $date_bucket, $page_path, $timestamp));

    if (wp_cache_get($marker_key, 'bpa')) {
        return 0;
    }

    if (get_transient($marker_key)) {
        wp_cache_set($marker_key, true, 'bpa', 2 * DAY_IN_SECONDS);
        return 0;
    }

    wp_cache_set($marker_key, true, 'bpa', 2 * DAY_IN_SECONDS);
    set_transient($marker_key, true, 2 * DAY_IN_SECONDS);

    return 1;
}

/**
 * Store a single hit directly into aggregation tables.
 */
function bbpa_store_aggregate_hit(array $hit, array $utm_params = []): void
{
    $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
    $page_path = isset($hit['page_path']) ? (string) $hit['page_path'] : '';
    $device_class = isset($hit['device_class']) ? (string) $hit['device_class'] : '';
    $referrer_domain = isset($hit['referrer_domain']) && $hit['referrer_domain'] !== null
        ? (string) $hit['referrer_domain']
        : '';

    if ($timestamp === 0 || $page_path === '' || $device_class === '') {
        return;
    }

    $date_bucket = wp_date('Y-m-d', $timestamp);
    $collect_hourly = bbpa_hourly_aggregation_enabled();
    if ($collect_hourly) {
        $hour_bucket = wp_date('Y-m-d H:00:00', $timestamp);
    }

    $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
    $is_page_view_event = $event_name === 'page_view';
    $is_not_found_page_view = $is_page_view_event && bbpa_hit_is_not_found_page($hit);

    $source_category = bbpa_get_source_category_from_tracking_context($referrer_domain, $utm_params);
    if ($is_page_view_event) {
        bbpa_increment_hits_daily($date_bucket, $page_path, $referrer_domain, $source_category);
        if ($is_not_found_page_view) {
            bbpa_increment_404s_daily($date_bucket, $page_path);
        }
    }
    $active_ms_delta = isset($hit['active_ms_delta']) ? absint($hit['active_ms_delta']) : 0;
    $tracks_time_metrics = ($is_page_view_event || $event_name === 'heartbeat')
        && $active_ms_delta > 0
        && $device_class !== 'bot';
    $tracked_active_ms_delta = $tracks_time_metrics ? $active_ms_delta : 0;
    $visits_with_time_increment = $tracked_active_ms_delta > 0
        ? bbpa_claim_time_denominator_increment($hit, $date_bucket, $page_path, $timestamp)
        : 0;
    if (bbpa_time_metrics_integrity_debug_enabled() && $visits_with_time_increment > 0 && $tracked_active_ms_delta <= 0) {
        bbpa_safe_log('Tracking', 'warning', 'Time metrics integrity anomaly: visits_with_time increment without positive active time', [
            'date_bucket' => $date_bucket,
            'event_name' => $event_name,
            'page_path' => $page_path,
            'tracked_active_ms_delta' => $tracked_active_ms_delta,
            'is_page_view_event' => $is_page_view_event,
        ]);
    }


    if ($tracked_active_ms_delta > 0) {
        bbpa_increment_time_active_ms_total_daily($date_bucket, $tracked_active_ms_delta);
        if ($visits_with_time_increment > 0) {
            bbpa_increment_time_visits_with_time_daily($date_bucket, $visits_with_time_increment);
        }
        bbpa_increment_page_time_daily($date_bucket, $page_path, $tracked_active_ms_delta, $visits_with_time_increment);
    }

    $entry_count = 0;
    $exit_count = 0;

    if ($is_page_view_event) {
        $entry_count = bbpa_is_entry_hit($page_path, $referrer_domain) ? 1 : 0;
        $acquisition_visit_increment = bbpa_claim_acquisition_visit_increment($hit, $date_bucket);
        if ($acquisition_visit_increment < 0) {
            $acquisition_visit_increment = $entry_count;
        }

        bbpa_increment_entry_exit_daily(
            $date_bucket,
            $page_path,
            $entry_count,
            $exit_count
        );

        bbpa_increment_daily_source_category(
            $date_bucket,
            $page_path,
            $referrer_domain,
            $source_category,
            1,
            $acquisition_visit_increment
        );

        if ($collect_hourly) {
            bbpa_increment_entry_exit_hourly(
                $hour_bucket,
                $page_path,
                $entry_count,
                $exit_count
            );
        }

        $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
        if ($visitor_id !== '') {
            bbpa_apply_session_exit_tracking_for_hit($visitor_id, $page_path, $timestamp);
        }
    }

    if ($is_page_view_event) {
        bbpa_upsert_aggregate_rows(
            'daily',
            [
                [
                    'date_bucket' => $date_bucket,
                    'page_path' => $page_path,
                    'referrer_domain' => $referrer_domain,
                    'device_class' => $device_class,
                    'hits' => 1,
                ],
            ]
        );

        if ($collect_hourly) {
            bbpa_upsert_aggregate_rows(
                'hourly',
                [
                    [
                        'date_bucket' => $hour_bucket,
                        'page_path' => $page_path,
                        'referrer_domain' => $referrer_domain,
                        'device_class' => $device_class,
                        'hits' => 1,
                    ],
                ]
            );
        }
    }

    bbpa_upsert_overview_daily_rows(
        [
            [
                'date_bucket' => $date_bucket,
                'page_views' => ($is_page_view_event && $device_class !== 'bot') ? 1 : 0,
                'bot_page_views' => ($is_page_view_event && $device_class === 'bot') ? 1 : 0,
                'visits' => $entry_count,
                'active_ms_total' => $tracked_active_ms_delta,
                'visits_with_time' => $visits_with_time_increment,
            ],
        ]
    );

    bbpa_flush_admin_cache();
}

/**
 * Determine whether a hit payload represents a 404 page view.
 */
function bbpa_hit_is_not_found_page(array $hit): bool
{
    $http_status = isset($hit['http_status']) ? absint($hit['http_status']) : 0;
    if ($http_status === 404) {
        return true;
    }

    $page_context = isset($hit['page_context']) ? sanitize_key((string) $hit['page_context']) : '';
    if ($page_context === 'not_found') {
        return true;
    }

    return false;
}

/**
 * Upsert canonical daily overview aggregate rows.
 */
function bbpa_upsert_overview_daily_rows(array $rows): void
{
    if ($rows === []) {
        return;
    }

    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_overview_daily';
    $placeholders = [];
    $values = [];

    foreach ($rows as $row) {
        $placeholders[] = '(%s, %d, %d, %d, %d, %d, %d)';
        $values[] = $row['date_bucket'];
        $values[] = isset($row['page_views']) ? (int) $row['page_views'] : 0;
        $values[] = isset($row['bot_page_views']) ? (int) $row['bot_page_views'] : 0;
        $values[] = isset($row['visits']) ? (int) $row['visits'] : 0;
        $values[] = isset($row['visitors']) ? (int) $row['visitors'] : 0;
        $values[] = isset($row['active_ms_total']) ? (int) $row['active_ms_total'] : 0;
        $values[] = isset($row['visits_with_time']) ? (int) $row['visits_with_time'] : 0;
    }

    $sql = "INSERT INTO {$table} (date_bucket, page_views, bot_page_views, visits, visitors, active_ms_total, visits_with_time) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE'
        . ' page_views = page_views + VALUES(page_views),'
        . ' bot_page_views = bot_page_views + VALUES(bot_page_views),'
        . ' visits = visits + VALUES(visits),'
        . ' visitors = visitors + VALUES(visitors),'
        . ' active_ms_total = active_ms_total + VALUES(active_ms_total),'
        . ' visits_with_time = visits_with_time + VALUES(visits_with_time)';

    $wpdb->query($wpdb->prepare($sql, ...$values));
}


/**
 * Increment visitors in canonical daily overview aggregate rows.
 */
function bbpa_increment_overview_daily_visitors(string $date_bucket): void
{
    if ($date_bucket === '') {
        return;
    }

    bbpa_upsert_overview_daily_rows(
        [
            [
                'date_bucket' => $date_bucket,
                'visitors' => 1,
            ],
        ]
    );
}

/**
 * Store a single hit directly into the geolocation aggregation table.
 */
function bbpa_store_geo_aggregate_hit(array $hit): void
{
    $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
    if ($timestamp === 0) {
        return;
    }

    $geo = bbpa_get_geo_aggregate_payload($hit);
    if ($geo === []) {
        return;
    }

    $city_name_fallback_source = '';
    if (isset($hit['city_name']) && bbpa_normalize_city_name($hit['city_name']) !== '') {
        $city_name_fallback_source = 'city_name';
    } elseif (isset($hit['city']) && bbpa_normalize_city_name($hit['city']) !== '') {
        $city_name_fallback_source = 'city';
    }

    $date_bucket = wp_date('Y-m-d', $timestamp);
    $page_path = isset($hit['page_path']) ? wp_unslash((string) $hit['page_path']) : '';
    $referrer_domain = isset($hit['referrer_domain'])
        ? sanitize_text_field((string) $hit['referrer_domain'])
        : '';
    $is_entry = $page_path !== '' && bbpa_is_entry_hit($page_path, $referrer_domain);

    $upsert_row = [
        'date_bucket' => $date_bucket,
        'country_code' => $geo['country_code'],
        'region_code' => $geo['region_code'],
        'city_name' => $geo['city_name'],
        'city_geoname_id' => $geo['city_geoname_id'] ?? null,
        'latitude' => isset($geo['latitude']) ? (float) $geo['latitude'] : null,
        'longitude' => isset($geo['longitude']) ? (float) $geo['longitude'] : null,
        'hits' => 1,
        'visits' => $is_entry ? 1 : 0,
    ];

    $upsert_result = bbpa_upsert_geo_rows([$upsert_row]);

    if (function_exists('bbpa_log_geolocation_debug')) {
        bbpa_log_geolocation_debug('Geo daily aggregate payload prepared', [
            'date_bucket' => $date_bucket,
            'country_code' => $upsert_row['country_code'],
            'region_code' => $upsert_row['region_code'],
            'city_name' => $upsert_row['city_name'],
            'city_fallback_source' => $city_name_fallback_source,
            'latitude' => $upsert_row['latitude'],
            'longitude' => $upsert_row['longitude'],
            'latitude_present' => $upsert_row['latitude'] !== null,
            'longitude_present' => $upsert_row['longitude'] !== null,
            'city_geoname_id' => $upsert_row['city_geoname_id'],
            'page_path' => $page_path,
            'event_name' => isset($hit['event_name']) ? sanitize_text_field((string) $hit['event_name']) : '',
            'upsert_result' => $upsert_result,
            'db_error' => isset($GLOBALS['wpdb']) && isset($GLOBALS['wpdb']->last_error) ? (string) $GLOBALS['wpdb']->last_error : '',
        ]);
    }
}

/**
 * Upsert entry/exit aggregate rows.
 */
function bbpa_upsert_entry_exit_rows(array $rows): void
{
    if ($rows === []) {
        return;
    }

    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_entry_exit_daily';
    $placeholders = [];
    $values = [];

    foreach ($rows as $row) {
        $placeholders[] = '(%s, %s, %d, %d)';
        $values[] = $row['date_bucket'];
        $values[] = $row['page_path'];
        $values[] = (int) $row['entries'];
        $values[] = (int) $row['exits'];
    }

    $sql = "INSERT INTO {$table} (date_bucket, page_path, entries, exits) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE entries = entries + VALUES(entries), exits = exits + VALUES(exits)';

    $wpdb->query($wpdb->prepare($sql, ...$values));

}

/**
 * Upsert entry/exit hourly aggregate rows.
 */
function bbpa_upsert_entry_exit_hourly_rows(array $rows): void
{
    if ($rows === []) {
        return;
    }

    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_entry_exit_hourly';
    $placeholders = [];
    $values = [];

    foreach ($rows as $row) {
        $placeholders[] = '(%s, %s, %d, %d)';
        $values[] = $row['date_bucket'];
        $values[] = $row['page_path'];
        $values[] = (int) $row['entries'];
        $values[] = (int) $row['exits'];
    }

    $sql = "INSERT INTO {$table} (date_bucket, page_path, entries, exits) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE entries = entries + VALUES(entries), exits = exits + VALUES(exits)';

    $wpdb->query($wpdb->prepare($sql, ...$values));
}

/**
 * Upsert geolocation aggregate rows.
 */
function bbpa_upsert_geo_rows(array $rows): int
{
    if ($rows === []) {
        return 0;
    }

    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_geo_daily';
    $placeholders = [];
    $values = [];

    foreach ($rows as $row) {
        $coordinates = bbpa_normalize_coordinate_pair(
            $row['latitude'] ?? null,
            $row['longitude'] ?? null
        );
        $city_geoname_id = bbpa_normalize_geoname_id($row['city_geoname_id'] ?? null);

        $placeholders[] = '(%s, %s, %s, %s, %d, %f, %f, %d, %d)';
        $values[] = $row['date_bucket'];
        $values[] = $row['country_code'];
        $values[] = $row['region_code'];
        $values[] = $row['city_name'];
        $values[] = $city_geoname_id !== null ? $city_geoname_id : 0;
        $values[] = $coordinates['latitude'] !== null ? $coordinates['latitude'] : 0.0;
        $values[] = $coordinates['longitude'] !== null ? $coordinates['longitude'] : 0.0;
        $values[] = (int) $row['hits'];
        $values[] = isset($row['visits']) ? (int) $row['visits'] : 0;
    }

    $sql = "INSERT INTO {$table} (date_bucket, country_code, region_code, city_name, city_geoname_id, latitude, longitude, hits, visits) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE'
        . ' hits = hits + VALUES(hits),'
        . ' visits = visits + VALUES(visits),'
        . ' city_geoname_id = CASE'
        . ' WHEN VALUES(city_geoname_id) > 0 THEN VALUES(city_geoname_id)'
        . ' ELSE city_geoname_id'
        . ' END,'
        . ' latitude = CASE'
        . ' WHEN ABS(VALUES(latitude)) < 0.0001 AND ABS(VALUES(longitude)) < 0.0001 THEN latitude'
        . ' ELSE VALUES(latitude)'
        . ' END,'
        . ' longitude = CASE'
        . ' WHEN ABS(VALUES(latitude)) < 0.0001 AND ABS(VALUES(longitude)) < 0.0001 THEN longitude'
        . ' ELSE VALUES(longitude)'
        . ' END';

    $result = $wpdb->query($wpdb->prepare($sql, ...$values));

    return $result === false ? 0 : (int) $result;
}

/**
 * Upsert aggregate rows into the daily or hourly table.
 */
function bbpa_upsert_aggregate_rows(string $bucket, array $rows): void
{
    if ($rows === []) {
        return;
    }

    global $wpdb;

    $table = $bucket === 'hourly'
        ? $wpdb->prefix . 'bbpa_hourly'
        : $wpdb->prefix . 'bbpa_daily';

    $placeholders = [];
    $values = [];

    foreach ($rows as $row) {
        $placeholders[] = '(%s, %s, %s, %s, %d)';
        $values[] = $row['date_bucket'];
        $values[] = $row['page_path'];
        $values[] = $row['referrer_domain'];
        $values[] = $row['device_class'];
        $values[] = (int) $row['hits'];
    }

    $sql = "INSERT INTO {$table} (date_bucket, page_path, referrer_domain, device_class, hits) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE hits = hits + VALUES(hits)';

    $wpdb->query($wpdb->prepare($sql, ...$values));
}

/**
 * Upsert daily acquisition source-category aggregate rows.
 */
function bbpa_upsert_daily_source_category_rows(array $rows): void
{
    if ($rows === []) {
        return;
    }

    foreach ($rows as $row) {
        bbpa_increment_daily_source_category(
            (string) $row['date_bucket'],
            (string) $row['page_path'],
            (string) $row['referrer_domain'],
            (string) $row['source_category'],
            isset($row['hits']) ? (int) $row['hits'] : 0,
            isset($row['visits']) ? (int) $row['visits'] : 0
        );
    }
}
