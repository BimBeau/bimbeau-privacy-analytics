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
 * Purge raw logs older than the retention period.
 */
function bbpa_purge_raw_logs(): void
{
    $hits = get_option('bbpa_hits', []);
    if (!is_array($hits) || $hits === []) {
        return;
    }

    $retention_seconds = bbpa_get_raw_logs_retention_seconds();
    if ($retention_seconds <= 0) {
        update_option('bbpa_hits', [], false);

        return;
    }

    $cutoff = current_time('timestamp') - $retention_seconds;

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
