<?php

if (! defined('ABSPATH')) {
    exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * Dedicated database access layer for admin analytics reads.
 */
class BBPA_Analytics_Repository {
    /**
     * Read KPI source rows for a date range.
     *
     * Security: all dynamic values are bound via $wpdb->prepare.
     * Performance: each query is aggregate-only and scoped by date range.
     *
     * @return array{page_views:int,unique_referrers:int,canonical_visits:int,canonical_page_views:int,entries:int,visitor_entries:int,aggregated_visits:int,source:string}
     */
    public function get_kpis_rows(string $start_date, string $end_date): array {
        global $wpdb;

        $daily_table = bbpa_sql_table_name('bbpa_daily');
        $entry_exit_table = $wpdb->prefix . 'bbpa_entry_exit_daily';
        $visitors_table = $wpdb->prefix . 'bbpa_visitors';
        $overview_daily_table = bbpa_sql_table_name('bbpa_overview_daily');

        $kpi_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(hits), 0) AS page_views,
                COALESCE(SUM(visits), 0) AS aggregated_visits,
                COUNT(DISTINCT NULLIF(referrer_domain, '')) AS unique_referrers
            FROM {$daily_table}
            WHERE date_bucket BETWEEN %s AND %s
                AND device_class <> %s",
            $start_date,
            $end_date,
            'bot'
        );


        $canonical_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(visits), 0) AS canonical_visits,
                COALESCE(SUM(page_views), 0) AS canonical_page_views,
                COALESCE(SUM(visitors), 0) AS canonical_visitors
            FROM {$overview_daily_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $start_date,
            $end_date
        );

        $entries_query = $wpdb->prepare(
            "SELECT COALESCE(SUM(entries), 0) AS entries
            FROM {$entry_exit_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $start_date,
            $end_date
        );

        $timezone = wp_timezone();
        $start_boundary = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $start_date . ' 00:00:00', $timezone);
        $end_boundary = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $end_date . ' 23:59:59', $timezone);

        $day_start = $start_boundary instanceof DateTimeImmutable
            ? (int) $start_boundary->format('U')
            : (int) strtotime($start_date . ' 00:00:00');
        $day_end = $end_boundary instanceof DateTimeImmutable
            ? (int) $end_boundary->format('U')
            : (int) strtotime($end_date . ' 23:59:59');
        $visitor_entries_query = $wpdb->prepare(
            "SELECT COUNT(DISTINCT visitor_id) AS entries
            FROM {$visitors_table}
            WHERE last_view_at BETWEEN %d AND %d",
            $day_start,
            $day_end
        );

        $cache_key = bbpa_cache_key('kpis_rows', [
            'version' => bbpa_get_admin_cache_version(),
            'start_date' => $start_date,
            'end_date' => $end_date,
        ]);
        $cached_rows = wp_cache_get($cache_key, BBPA_CACHE_GROUP);
        if (is_array($cached_rows)) {
            return $cached_rows;
        }

        $kpi_row = $wpdb->get_row($kpi_query, ARRAY_A);
        $canonical_row = $wpdb->get_row($canonical_query, ARRAY_A);
        $entries_row = $wpdb->get_row($entries_query, ARRAY_A);
        $visitor_entries_row = $wpdb->get_row($visitor_entries_query, ARRAY_A);

        $canonical_visits = isset($canonical_row['canonical_visits']) ? (int) $canonical_row['canonical_visits'] : 0;
        $canonical_page_views = isset($canonical_row['canonical_page_views']) ? (int) $canonical_row['canonical_page_views'] : 0;
        $canonical_visitors = isset($canonical_row['canonical_visitors']) ? (int) $canonical_row['canonical_visitors'] : 0;

        $rows = [
            'page_views' => $canonical_page_views > 0 ? $canonical_page_views : (isset($kpi_row['page_views']) ? (int) $kpi_row['page_views'] : 0),
            'unique_referrers' => isset($kpi_row['unique_referrers']) ? (int) $kpi_row['unique_referrers'] : 0,
            'canonical_visits' => $canonical_visits,
            'canonical_page_views' => $canonical_page_views,
            'canonical_visitors' => $canonical_visitors,
            'entries' => $canonical_visits > 0 ? $canonical_visits : (isset($entries_row['entries']) ? (int) $entries_row['entries'] : 0),
            'visitor_entries' => isset($visitor_entries_row['entries']) ? (int) $visitor_entries_row['entries'] : 0,
            'aggregated_visits' => $canonical_visits > 0 ? $canonical_visits : (isset($kpi_row['aggregated_visits']) ? (int) $kpi_row['aggregated_visits'] : 0),
            'source' => ($canonical_visits > 0 || $canonical_page_views > 0 || $canonical_visitors > 0) ? 'canonical' : 'fallback',
        ];

        wp_cache_set($cache_key, $rows, BBPA_CACHE_GROUP, 60);

        return $rows;
    }

    /**
     * Check if the daily dataset contains any row.
     *
     * Security: table name is internal-only and no user input is interpolated.
     * Performance: COUNT(*) is used once to resolve available granularities.
     */
    public function has_daily_data(): bool {
        global $wpdb;

        $daily_table = bbpa_sql_table_name('bbpa_daily');
        $cache_key = bbpa_cache_key('has_daily_data', [
            'version' => bbpa_get_admin_cache_version(),
            'table' => $daily_table,
        ]);
        $cached = wp_cache_get($cache_key, BBPA_CACHE_GROUP);
        if (is_bool($cached)) {
            return $cached;
        }

        $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$daily_table}"); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Internal table name only.
        $has_daily_data = $count > 0;

        wp_cache_set($cache_key, $has_daily_data, BBPA_CACHE_GROUP, 60);

        return $has_daily_data;
    }
}
