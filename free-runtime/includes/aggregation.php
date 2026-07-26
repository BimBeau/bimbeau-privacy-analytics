<?php
/**
 * Free aggregation runtime.
 *
 * Country-level aggregation is handled by the shared hit repository and daily
 * report queries in the Free package. Premium packages provide additional
 * application-shell and city-level aggregation modules.
 *
 * @package BimBeauPrivacyAnalytics
 */

function bbpa_ensure_aggregation_schedule(): void
{
    if (!defined('BBPA_AGGREGATION_CRON_HOOK')) return;
    if (wp_get_schedule(BBPA_AGGREGATION_CRON_HOOK)) wp_clear_scheduled_hook(BBPA_AGGREGATION_CRON_HOOK);
    if (!wp_next_scheduled(BBPA_AGGREGATION_CRON_HOOK)) {
        $interval = function_exists('bbpa_get_stored_aggregation_interval') ? bbpa_get_stored_aggregation_interval() : 5 * MINUTE_IN_SECONDS;
        wp_schedule_single_event(time() + max(MINUTE_IN_SECONDS, (int) $interval), BBPA_AGGREGATION_CRON_HOOK);
    }
}

function bbpa_register_aggregated_retention_cron_schedule(array $schedules): array
{
    if (defined('BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE')) {
        $schedules[BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE] = [
            'interval' => function_exists('bbpa_get_aggregated_retention_cleanup_interval') ? bbpa_get_aggregated_retention_cleanup_interval() : 30 * DAY_IN_SECONDS,
            'display' => __('BimBeau Privacy Analytics aggregated retention cleanup', 'bimbeau-privacy-analytics'),
        ];
    }
    return $schedules;
}

function bbpa_schedule_aggregated_retention_cleanup(bool $force = false): void
{
    if (!defined('BBPA_AGGREGATED_RETENTION_CRON_HOOK') || !defined('BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE')) return;
    $current_schedule = wp_get_schedule(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    $next_run = wp_next_scheduled(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    if ($force || $current_schedule !== BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE || !$next_run) {
        wp_clear_scheduled_hook(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
        wp_schedule_event(time(), BBPA_AGGREGATED_RETENTION_CRON_SCHEDULE, BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    }
}
