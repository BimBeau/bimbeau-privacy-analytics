<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * Database schema helpers for BimBeau Privacy Analytics.
 */

const BBPA_SCHEMA_VERSION = '28';
const BBPA_DB_MIGRATION_VERSION = '1.4.0';


/**
 * Run a database operation with WordPress DB error output suppressed.
 *
 * @param callable $operation Callback that performs DB reads/writes.
 * @return mixed
 */
function bbpa_with_suppressed_db_errors(callable $operation)
{
    global $wpdb;

    if (!($wpdb instanceof wpdb)) {
        return $operation();
    }

    $previous_suppress_errors = $wpdb->suppress_errors();
    $wpdb->suppress_errors(true);
    $wpdb->hide_errors();

    try {
        return $operation();
    } finally {
        $wpdb->suppress_errors((bool) $previous_suppress_errors);
    }
}

/**
 * Create or update the analytics tables.
 */
function bbpa_install_schema(): void
{
    global $wpdb;

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $charset_collate = $wpdb->get_charset_collate();
    $daily_table = $wpdb->prefix . 'bbpa_daily';
    $hourly_table = $wpdb->prefix . 'bbpa_hourly';
    $sessions_table = $wpdb->prefix . 'bbpa_sessions';
    $hits_daily_table = $wpdb->prefix . 'bbpa_hits_daily';
    $not_found_table = $wpdb->prefix . 'bbpa_404s_daily';
    $search_terms_table = $wpdb->prefix . 'bbpa_search_terms_daily';
    $entry_exit_table = $wpdb->prefix . 'bbpa_entry_exit_daily';
    $entry_exit_hourly_table = $wpdb->prefix . 'bbpa_entry_exit_hourly';
    $geo_table = $wpdb->prefix . 'bbpa_geo_daily';
    $visitors_table = $wpdb->prefix . 'bbpa_visitors';
    $visitor_activity_daily_table = $wpdb->prefix . 'bbpa_visitor_activity_daily';
    $time_daily_table = $wpdb->prefix . 'bbpa_time_daily';
    $overview_daily_table = $wpdb->prefix . 'bbpa_overview_daily';
    $event_actions_daily_table = $wpdb->prefix . 'bbpa_event_actions_daily';
    $events_daily_table = $wpdb->prefix . 'bbpa_events_daily';
    $event_occurrences_table = $wpdb->prefix . 'bbpa_event_occurrences';
    $page_time_daily_table = $wpdb->prefix . 'bbpa_page_time_daily';
    $daily_source_category_table = $wpdb->prefix . 'bbpa_daily_source_category';

    $daily_schema = "CREATE TABLE {$daily_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        referrer_domain VARCHAR(255) NOT NULL,
        device_class VARCHAR(50) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, device_class),
        KEY date_bucket (date_bucket),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY date_bucket_path_referrer (date_bucket, page_path(255), referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain)
    ) {$charset_collate};";

    $hourly_schema = "CREATE TABLE {$hourly_table} (
        date_bucket DATETIME NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        referrer_domain VARCHAR(255) NOT NULL,
        device_class VARCHAR(50) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, device_class),
        KEY date_bucket (date_bucket),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY date_bucket_path_referrer (date_bucket, page_path(255), referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain)
    ) {$charset_collate};";

    $hits_daily_schema = "CREATE TABLE {$hits_daily_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        referrer_domain VARCHAR(255) NOT NULL,
        source_category VARCHAR(20) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, source_category),
        KEY date_bucket (date_bucket),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY date_bucket_path_referrer (date_bucket, page_path(255), referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";

    $daily_source_category_schema = "CREATE TABLE {$daily_source_category_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        referrer_domain VARCHAR(255) NOT NULL,
        source_category VARCHAR(20) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, source_category),
        KEY date_bucket (date_bucket),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY date_bucket_path_referrer (date_bucket, page_path(255), referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";

    $not_found_schema = "CREATE TABLE {$not_found_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY date_bucket (date_bucket),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $search_terms_schema = "CREATE TABLE {$search_terms_table} (
        date_bucket DATE NOT NULL,
        search_term VARCHAR(255) NOT NULL,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, search_term(191)),
        KEY date_bucket (date_bucket),
        KEY search_term (search_term(191))
    ) {$charset_collate};";

    $entry_exit_schema = "CREATE TABLE {$entry_exit_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        entries BIGINT UNSIGNED NOT NULL DEFAULT 0,
        exits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY date_bucket (date_bucket),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $entry_exit_hourly_schema = "CREATE TABLE {$entry_exit_hourly_table} (
        date_bucket DATETIME NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        entries BIGINT UNSIGNED NOT NULL DEFAULT 0,
        exits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY date_bucket (date_bucket),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $geo_schema = "CREATE TABLE {$geo_table} (
        date_bucket DATE NOT NULL,
        country_code CHAR(2) NOT NULL,
        region_code VARCHAR(20) NOT NULL,
        city_name VARCHAR(255) NOT NULL,
        city_geoname_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        latitude DECIMAL(10,7) NOT NULL DEFAULT 0,
        longitude DECIMAL(10,7) NOT NULL DEFAULT 0,
        hits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, country_code, region_code, city_name(191)),
        KEY date_bucket (date_bucket),
        KEY country_code (country_code),
        KEY region_code (region_code),
        KEY city_name (city_name(191)),
        KEY city_geoname_id (city_geoname_id)
    ) {$charset_collate};";

    $visitors_schema = "CREATE TABLE {$visitors_table} (
        visitor_id VARCHAR(64) NOT NULL,
        first_view_at BIGINT UNSIGNED NOT NULL,
        last_view_at BIGINT UNSIGNED NOT NULL,
        entry_page VARCHAR(2048) NOT NULL,
        exit_page VARCHAR(2048) NOT NULL,
        total_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        active_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
        country_code CHAR(2) NOT NULL,
        country VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        referrer_domain VARCHAR(255) NOT NULL,
        source_category VARCHAR(20) NOT NULL DEFAULT '',
        browser VARCHAR(100) NOT NULL,
        browser_version VARCHAR(50) NOT NULL,
        device_class VARCHAR(50) NOT NULL,
        operating_system VARCHAR(100) NOT NULL,
        screen_resolution VARCHAR(50) NOT NULL,
        has_enriched_data TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY  (visitor_id),
        KEY last_view_at (last_view_at),
        KEY total_views (total_views),
        KEY country_code (country_code),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";


    $visitor_activity_daily_schema = "CREATE TABLE {$visitor_activity_daily_table} (
        date_bucket DATE NOT NULL,
        visitor_id VARCHAR(64) NOT NULL,
        device_class VARCHAR(50) NOT NULL,
        country_code CHAR(2) NOT NULL DEFAULT '',
        country VARCHAR(255) NOT NULL DEFAULT '',
        city VARCHAR(255) NOT NULL DEFAULT '',
        has_enriched_data TINYINT(1) NOT NULL DEFAULT 0,
        first_seen_at BIGINT UNSIGNED NOT NULL,
        last_seen_at BIGINT UNSIGNED NOT NULL,
        page_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, visitor_id),
        KEY date_bucket (date_bucket),
        KEY visitor_id (visitor_id),
        KEY date_bucket_device (date_bucket, device_class),
        KEY date_bucket_city (date_bucket, country_code, city(191))
    ) {$charset_collate};";

    $time_daily_schema = "CREATE TABLE {$time_daily_table} (
        date_bucket DATE NOT NULL,
        active_ms_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits_with_time BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket),
        KEY date_bucket (date_bucket)
    ) {$charset_collate};";

    $overview_daily_schema = "CREATE TABLE {$overview_daily_table} (
        date_bucket DATE NOT NULL,
        page_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visitors BIGINT UNSIGNED NOT NULL DEFAULT 0,
        bounces BIGINT UNSIGNED NOT NULL DEFAULT 0,
        active_ms_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits_with_time BIGINT UNSIGNED NOT NULL DEFAULT 0,
        bot_page_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket),
        KEY date_bucket (date_bucket)
    ) {$charset_collate};";

    $event_actions_daily_schema = "CREATE TABLE {$event_actions_daily_table} (
        day_bucket DATE NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        events_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (day_bucket, event_id, action_type, status),
        KEY day_bucket (day_bucket),
        KEY event_id (event_id),
        KEY action_type (action_type),
        KEY status (status)
    ) {$charset_collate};";


    $event_occurrences_schema = bbpa_get_event_occurrences_table_schema($event_occurrences_table, $charset_collate);


    $page_time_daily_schema = "CREATE TABLE {$page_time_daily_table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        active_ms_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits_with_time BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";
    $events_daily_schema = "CREATE TABLE {$events_daily_table} (
        day_bucket DATE NOT NULL,
        last_triggered_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00',
        event_id VARCHAR(191) NOT NULL,
        trigger_type VARCHAR(32) NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        action_status VARCHAR(32) NOT NULL DEFAULT 'no_action',
        triggered_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (day_bucket, event_id, trigger_type, page_path(255), action_status),
        KEY day_bucket (day_bucket),
        KEY event_id (event_id),
        KEY trigger_type (trigger_type),
        KEY action_status (action_status),
        KEY day_bucket_event_id (day_bucket, event_id)
    ) {$charset_collate};";

    bbpa_run_dbdelta_schemas([
        $daily_schema,
        $hourly_schema,
        $hits_daily_schema,
        $daily_source_category_schema,
        $not_found_schema,
        $search_terms_schema,
        $entry_exit_schema,
        $entry_exit_hourly_schema,
        $geo_schema,
        $visitors_schema,
        $visitor_activity_daily_schema,
        $time_daily_schema,
        $overview_daily_schema,
        $event_actions_daily_schema,
        $events_daily_schema,
        $event_occurrences_schema,
        $page_time_daily_schema,
    ]);

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta does not support DROP TABLE statements for cleanup migrations.
    $wpdb->query("DROP TABLE IF EXISTS `{$sessions_table}`");

    $legacy_action_status_exists = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW COLUMNS FROM ' . $events_daily_table . ' LIKE %s',
            'has_enabled_action'
        )
    );

    if (!empty($legacy_action_status_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot transform and backfill legacy columns conditionally.
        $wpdb->query("ALTER TABLE `{$events_daily_table}` ADD COLUMN action_status VARCHAR(32) NOT NULL DEFAULT 'no_action' AFTER page_path");
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- targeted one-off data migration from legacy boolean flag.
        $wpdb->query("UPDATE `{$events_daily_table}` SET action_status = CASE WHEN has_enabled_action = 1 THEN 'skipped' ELSE 'no_action' END");
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot adjust an existing composite primary key safely in place.
        $wpdb->query("ALTER TABLE `{$events_daily_table}` DROP PRIMARY KEY");
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot preserve legacy data while redefining composite primary keys.
        $wpdb->query("ALTER TABLE `{$events_daily_table}` ADD PRIMARY KEY (day_bucket, event_id, trigger_type, page_path(255), action_status)");
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta does not drop obsolete legacy columns.
        $wpdb->query("ALTER TABLE `{$events_daily_table}` DROP COLUMN has_enabled_action");
    }

    bbpa_run_db_migrations();

    update_option('bbpa_schema_version', BBPA_SCHEMA_VERSION, false);
}


/**
 * Build the canonical event occurrences table schema.
 */
function bbpa_get_event_occurrences_table_schema(string $table, string $charset_collate): string
{
    return "CREATE TABLE {$table} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        day_bucket DATE NOT NULL,
        triggered_at DATETIME NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        trigger_type VARCHAR(32) NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        action_status VARCHAR(32) NOT NULL DEFAULT 'no_action',
        execution_status VARCHAR(32) NOT NULL DEFAULT 'matched',
        skip_reason VARCHAR(191) NULL DEFAULT NULL,
        error_message VARCHAR(255) NULL DEFAULT NULL,
        verification_level VARCHAR(32) NOT NULL DEFAULT 'none',
        error_category VARCHAR(64) NULL DEFAULT NULL,
        http_status SMALLINT UNSIGNED NULL DEFAULT NULL,
        provider_code VARCHAR(64) NULL DEFAULT NULL,
        retryable TINYINT(1) NULL DEFAULT NULL,
        executed_at DATETIME NULL DEFAULT NULL,
        country VARCHAR(191) NOT NULL DEFAULT '',
        country_code CHAR(2) NOT NULL DEFAULT '',
        city VARCHAR(191) NOT NULL DEFAULT '',
        country_flag VARCHAR(16) NOT NULL DEFAULT '',
        operating_system VARCHAR(64) NOT NULL DEFAULT '',
        browser VARCHAR(64) NOT NULL DEFAULT '',
        screen_resolution VARCHAR(32) NOT NULL DEFAULT '',
        device_class VARCHAR(50) NOT NULL DEFAULT '',
        source_category VARCHAR(20) NOT NULL DEFAULT '',
        event_context_json LONGTEXT NULL DEFAULT NULL,
        consent_granted TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY  (id),
        KEY day_bucket (day_bucket),
        KEY triggered_at (triggered_at),
        KEY event_id (event_id),
        KEY event_id_triggered_at (event_id, triggered_at),
        KEY source_category (source_category)
    ) {$charset_collate};";
}

/**
 * Ensure event occurrences table exists before running incremental column migrations.
 */
function bbpa_ensure_event_occurrences_table(): void
{
    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_event_occurrences';
    if (bbpa_table_exists($table)) {
        return;
    }

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $schema = bbpa_get_event_occurrences_table_schema($table, $wpdb->get_charset_collate());
    dbDelta($schema);

    if (bbpa_table_exists($table)) {
        bbpa_safe_log('Storage', 'info', 'Event occurrences table ensured', [
            'table' => $table,
        ]);
    }
}

/**
 * Execute dbDelta statements for table creation/alignment.
 *
 * @param array<int, string> $schemas Full CREATE TABLE statements.
 */
function bbpa_run_dbdelta_schemas(array $schemas): void
{
    foreach ($schemas as $schema) {
        dbDelta($schema);
    }
}

/**
 * Ensure the events daily table contains the last_triggered_at column.
 */
function bbpa_ensure_events_daily_last_triggered_at_column(): void
{
    global $wpdb;
    $events_daily_table = $wpdb->prefix . 'bbpa_events_daily';
    $event_occurrences_table = $wpdb->prefix . 'bbpa_event_occurrences';
    $page_time_daily_table = $wpdb->prefix . 'bbpa_page_time_daily';

    if (!bbpa_table_exists($events_daily_table)) {
        bbpa_log_missing_table_debug($events_daily_table);
        return;
    }

    $last_triggered_column_exists = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW COLUMNS FROM ' . $events_daily_table . ' LIKE %s',
            'last_triggered_at'
        )
    );

    if (!empty($last_triggered_column_exists)) {
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot place a column with AFTER in a legacy table without table recreation.
    $wpdb->query("ALTER TABLE `{$events_daily_table}` ADD COLUMN last_triggered_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00' AFTER day_bucket");
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- one-time deterministic backfill for legacy rows.
    $wpdb->query("UPDATE `{$events_daily_table}` SET last_triggered_at = CONCAT(day_bucket, ' 00:00:00') WHERE last_triggered_at IN ('1970-01-01 00:00:00', '0000-00-00 00:00:00') OR last_triggered_at IS NULL");
}

/**
 * Ensure the event occurrences table contains the consent_granted column.
 */
function bbpa_ensure_event_occurrences_consent_column(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_event_occurrences';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return;
    }

    $consent_column_exists = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW COLUMNS FROM ' . $table . ' LIKE %s',
            'consent_granted'
        )
    );

    if (!empty($consent_column_exists)) {
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot preserve legacy column order in this migration path.
    $wpdb->query("ALTER TABLE `{$table}` ADD COLUMN consent_granted TINYINT(1) NOT NULL DEFAULT 0 AFTER city");
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- one-time idempotent data backfill for historical rows.
    $wpdb->query("UPDATE `{$table}` SET consent_granted = 1 WHERE city <> '' OR country <> ''");
}




/**
 * Check whether a table contains a specific column.
 */
function bbpa_table_has_column(string $table, string $column): bool
{
    global $wpdb;

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return false;
    }

    $exists = $wpdb->get_var(
        $wpdb->prepare(
            "SHOW COLUMNS FROM `{$table}` LIKE %s",
            $column
        )
    );

    return !empty($exists);
}

/**
 * Check whether a table exists.
 */
function bbpa_table_exists(string $table): bool
{
    global $wpdb;

    $table_name = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW TABLES LIKE %s',
            $table
        )
    );

    return $table_name === $table;
}

/**
 * Backfill canonical overview daily rows from legacy aggregate tables.
 */
function bbpa_backfill_overview_daily_from_existing(): void
{
    global $wpdb;

    $marker_option = 'bbpa_overview_daily_backfill_schema_23_last_run';
    $daily_table = $wpdb->prefix . 'bbpa_daily';
    $entry_exit_table = $wpdb->prefix . 'bbpa_entry_exit_daily';
    $time_daily_table = $wpdb->prefix . 'bbpa_time_daily';
    $overview_table = $wpdb->prefix . 'bbpa_overview_daily';

    $has_daily_visits = bbpa_table_has_column($daily_table, 'visits');

    $visits_sql = $has_daily_visits
        ? "COALESCE(SUM(CASE WHEN d.device_class <> 'bot' THEN d.visits ELSE 0 END), 0)"
        : 'NULL';

    $query = "
        SELECT
            d.date_bucket AS date_bucket,
            COALESCE(SUM(CASE WHEN d.device_class = 'bot' THEN d.hits ELSE 0 END), 0) AS bot_page_views,
            COALESCE(SUM(CASE WHEN d.device_class <> 'bot' THEN d.hits ELSE 0 END), 0) AS page_views,
            {$visits_sql} AS visits_from_daily,
            COALESCE(ee.entries, 0) AS visits_from_entries,
            COALESCE(td.active_ms_total, 0) AS active_ms_total,
            COALESCE(td.visits_with_time, 0) AS visits_with_time
        FROM {$daily_table} d
        LEFT JOIN (
            SELECT date_bucket, SUM(entries) AS entries
            FROM {$entry_exit_table}
            GROUP BY date_bucket
        ) ee ON ee.date_bucket = d.date_bucket
        LEFT JOIN (
            SELECT date_bucket, SUM(active_ms_total) AS active_ms_total, SUM(visits_with_time) AS visits_with_time
            FROM {$time_daily_table}
            GROUP BY date_bucket
        ) td ON td.date_bucket = d.date_bucket
        GROUP BY d.date_bucket
        ORDER BY d.date_bucket ASC
    ";

    $rows = $wpdb->get_results($query, ARRAY_A);
    if (!is_array($rows) || $rows === []) {
        update_option($marker_option, gmdate('c'), false);
        return;
    }

    $upsert_rows = [];
    foreach ($rows as $row) {
        $visits_from_daily = isset($row['visits_from_daily']) ? (int) $row['visits_from_daily'] : 0;
        $visits_from_entries = isset($row['visits_from_entries']) ? (int) $row['visits_from_entries'] : 0;

        $visits = $visits_from_entries;
        if ($has_daily_visits && $visits_from_daily > 0) {
            $visits = $visits_from_daily;
        }

        $upsert_rows[] = [
            'date_bucket' => (string) ($row['date_bucket'] ?? ''),
            'page_views' => (int) ($row['page_views'] ?? 0),
            'bot_page_views' => (int) ($row['bot_page_views'] ?? 0),
            'visits' => $visits,
            'active_ms_total' => (int) ($row['active_ms_total'] ?? 0),
            'visits_with_time' => (int) ($row['visits_with_time'] ?? 0),
        ];
    }

    $placeholders = [];
    $values = [];
    foreach ($upsert_rows as $row) {
        if ($row['date_bucket'] === '') {
            continue;
        }
        $placeholders[] = '(%s, %d, %d, %d, %d, %d)';
        $values[] = $row['date_bucket'];
        $values[] = $row['page_views'];
        $values[] = $row['bot_page_views'];
        $values[] = $row['visits'];
        $values[] = $row['active_ms_total'];
        $values[] = $row['visits_with_time'];
    }

    if ($placeholders === []) {
        update_option($marker_option, gmdate('c'), false);
        return;
    }

    $sql = "INSERT INTO {$overview_table} (date_bucket, page_views, bot_page_views, visits, active_ms_total, visits_with_time) VALUES "
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE'
        . ' page_views = VALUES(page_views),'
        . ' bot_page_views = VALUES(bot_page_views),'
        . ' visits = VALUES(visits),'
        . ' active_ms_total = VALUES(active_ms_total),'
        . ' visits_with_time = VALUES(visits_with_time)';

    $wpdb->query($wpdb->prepare($sql, ...$values));
    update_option($marker_option, gmdate('c'), false);
}




/**
 * Ensure visitor rows can record acquisition channel.
 */
function bbpa_ensure_visitors_source_category_column(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_visitors';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return;
    }

    $column_exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM `{$table}` LIKE %s", 'source_category'));
    if (empty($column_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive migration for visitor acquisition reporting.
        $wpdb->query("ALTER TABLE `{$table}` ADD COLUMN source_category VARCHAR(20) NOT NULL DEFAULT '' AFTER referrer_domain");
    }

    $index_exists = $wpdb->get_var($wpdb->prepare("SHOW INDEX FROM `{$table}` WHERE Key_name = %s", 'source_category'));
    if (empty($index_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive index for visitor acquisition reporting.
        $wpdb->query("ALTER TABLE `{$table}` ADD KEY source_category (source_category)");
    }
}

/**
 * Ensure event occurrence rows can record acquisition channel.
 */
function bbpa_ensure_event_occurrences_source_category_column(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_event_occurrences';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return;
    }

    $column_exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM `{$table}` LIKE %s", 'source_category'));
    if (empty($column_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive migration for event acquisition reporting.
        $wpdb->query("ALTER TABLE `{$table}` ADD COLUMN source_category VARCHAR(20) NOT NULL DEFAULT '' AFTER device_class");
    }

    $index_exists = $wpdb->get_var($wpdb->prepare("SHOW INDEX FROM `{$table}` WHERE Key_name = %s", 'source_category'));
    if (empty($index_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive index for event acquisition reporting.
        $wpdb->query("ALTER TABLE `{$table}` ADD KEY source_category (source_category)");
    }
}

/**
 * Ensure visitor rows can record whether Advanced tracker data enriched the visit.
 */
function bbpa_ensure_visitors_enriched_data_column(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_visitors';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return;
    }

    $column_exists = $wpdb->get_var(
        $wpdb->prepare(
            "SHOW COLUMNS FROM `{$table}` LIKE %s",
            'has_enriched_data'
        )
    );

    if (empty($column_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive migration for visitor privacy-state rendering.
        $wpdb->query("ALTER TABLE `{$table}` ADD COLUMN has_enriched_data TINYINT(1) NOT NULL DEFAULT 0 AFTER screen_resolution");
    }

    $backfill_option = 'bbpa_visitors_enriched_data_backfilled';
    if (get_option($backfill_option, null) !== null) {
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Historical rows do not have reliable tracker provenance, so they are treated as not eligible for Essential-only privacy overlays.
    $wpdb->query("UPDATE `{$table}` SET has_enriched_data = 1");
    add_option($backfill_option, gmdate('c'), '', false);
}

/**
 * Backfill overview daily visitors from visits for legacy rows.
 */
function bbpa_backfill_overview_daily_visitors_from_visits(): void
{
    global $wpdb;

    $overview_table = $wpdb->prefix . 'bbpa_overview_daily';

    if (!bbpa_table_exists($overview_table)) {
        bbpa_log_missing_table_debug($overview_table);
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Targeted idempotent migration backfill for legacy rows.
    $rows_updated = $wpdb->query("UPDATE {$overview_table} SET visitors = visits WHERE visitors = 0 AND visits > 0");

    if (is_int($rows_updated) && $rows_updated > 0 && function_exists('bbpa_flush_admin_cache')) {
        bbpa_flush_admin_cache();
    }
}

/**
 * Run plugin database migrations idempotently.
 */
function bbpa_run_db_migrations(): void
{
    bbpa_ensure_critical_schema_tables();

    if (!bbpa_can_run_db_migrations()) {
        return;
    }

    $installed = get_option('bbpa_db_migration_version', '0.0.0');

    bbpa_ensure_events_daily_last_triggered_at_column();
    bbpa_ensure_event_occurrences_table();
    bbpa_ensure_event_occurrences_consent_column();
    bbpa_ensure_event_occurrences_render_columns();
    bbpa_ensure_event_occurrences_source_category_column();
    bbpa_backfill_overview_daily_from_existing();
    bbpa_backfill_overview_daily_visitors_from_visits();
    bbpa_ensure_page_time_daily_table();
    bbpa_ensure_visitors_enriched_data_column();
    bbpa_ensure_visitors_source_category_column();

    if (version_compare((string) $installed, BBPA_DB_MIGRATION_VERSION, '<')) {
        update_option('bbpa_db_migration_version', BBPA_DB_MIGRATION_VERSION, false);
    }
}

/**
 * Determine whether required base tables exist before running incremental migrations.
 */
function bbpa_can_run_db_migrations(): bool
{
    global $wpdb;

    $required_tables = [
        $wpdb->prefix . 'bbpa_daily',
        $wpdb->prefix . 'bbpa_entry_exit_daily',
        $wpdb->prefix . 'bbpa_time_daily',
        $wpdb->prefix . 'bbpa_overview_daily',
        $wpdb->prefix . 'bbpa_events_daily',
    ];

    foreach ($required_tables as $table) {
        if (!bbpa_table_exists($table)) {
            bbpa_log_missing_table_debug($table);
            return false;
        }
    }

    return true;
}

/**
 * Ensure the event occurrences table contains render columns used by REST ingestion.
 */
function bbpa_ensure_event_occurrences_render_columns(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_event_occurrences';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return;
    }

    $columns = [
        'execution_status' => "ALTER TABLE `%s` ADD COLUMN execution_status VARCHAR(32) NOT NULL DEFAULT 'matched' AFTER action_status",
        'skip_reason' => "ALTER TABLE `%s` ADD COLUMN skip_reason VARCHAR(191) NULL DEFAULT NULL AFTER execution_status",
        'error_message' => "ALTER TABLE `%s` ADD COLUMN error_message VARCHAR(255) NULL DEFAULT NULL AFTER skip_reason",
        'verification_level' => "ALTER TABLE `%s` ADD COLUMN verification_level VARCHAR(32) NOT NULL DEFAULT 'none' AFTER error_message",
        'error_category' => "ALTER TABLE `%s` ADD COLUMN error_category VARCHAR(64) NULL DEFAULT NULL AFTER verification_level",
        'http_status' => "ALTER TABLE `%s` ADD COLUMN http_status SMALLINT UNSIGNED NULL DEFAULT NULL AFTER error_category",
        'provider_code' => "ALTER TABLE `%s` ADD COLUMN provider_code VARCHAR(64) NULL DEFAULT NULL AFTER http_status",
        'retryable' => "ALTER TABLE `%s` ADD COLUMN retryable TINYINT(1) NULL DEFAULT NULL AFTER provider_code",
        'executed_at' => "ALTER TABLE `%s` ADD COLUMN executed_at DATETIME NULL DEFAULT NULL AFTER retryable",
        'country' => "ALTER TABLE `%s` ADD COLUMN country VARCHAR(191) NOT NULL DEFAULT '' AFTER executed_at",
        'city' => "ALTER TABLE `%s` ADD COLUMN city VARCHAR(191) NOT NULL DEFAULT '' AFTER country",
        'country_code' => "ALTER TABLE `%s` ADD COLUMN country_code CHAR(2) NOT NULL DEFAULT '' AFTER country",
        'country_flag' => "ALTER TABLE `%s` ADD COLUMN country_flag VARCHAR(16) NOT NULL DEFAULT '' AFTER country_code",
        'operating_system' => "ALTER TABLE `%s` ADD COLUMN operating_system VARCHAR(64) NOT NULL DEFAULT '' AFTER city",
        'browser' => "ALTER TABLE `%s` ADD COLUMN browser VARCHAR(64) NOT NULL DEFAULT '' AFTER operating_system",
        'screen_resolution' => "ALTER TABLE `%s` ADD COLUMN screen_resolution VARCHAR(32) NOT NULL DEFAULT '' AFTER browser",
        'device_class' => "ALTER TABLE `%s` ADD COLUMN device_class VARCHAR(50) NOT NULL DEFAULT '' AFTER browser",
        'event_context_json' => "ALTER TABLE `%s` ADD COLUMN event_context_json LONGTEXT NULL DEFAULT NULL AFTER device_class",
    ];

    foreach ($columns as $column_name => $query) {
        $column_exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM `{$table}` LIKE %s", $column_name));
        if (empty($column_exists)) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta cannot guarantee AFTER placement for targeted incremental columns.
            $wpdb->query(sprintf($query, $table));
        }
    }
}



/**
 * Ensure page-level daily active-time aggregate table exists with required indexes.
 */
function bbpa_ensure_page_time_daily_table(): void
{
    global $wpdb;

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $table = $wpdb->prefix . 'bbpa_page_time_daily';
    $charset_collate = $wpdb->get_charset_collate();

    $schema = "CREATE TABLE {$table} (
        date_bucket DATE NOT NULL,
        page_path VARCHAR(2048) NOT NULL,
        active_ms_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visits_with_time BIGINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY date_bucket_page (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    dbDelta($schema);

    $row_count_option = 'bbpa_page_time_daily_rows_written';
    if (get_option($row_count_option, null) === null) {
        add_option($row_count_option, 0, '', false);
    }

}


/**
 * Log a debug message when a migration target table is missing.
 */
function bbpa_log_missing_table_debug(string $table): void
{
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('BimBeau Privacy Analytics migration skipped: missing table ' . $table); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- debug-only migration diagnostic.
    }
}

/**
 * Ensure the schema is up to date.
 */
function bbpa_maybe_install_schema(): void
{
    $installed = get_option('bbpa_schema_version');
    if ($installed !== BBPA_SCHEMA_VERSION) {
        bbpa_install_schema();
        return;
    }

    if (bbpa_is_critical_schema_missing()) {
        bbpa_ensure_critical_schema_tables();
        bbpa_run_db_migrations();
    }
}

/**
 * Return the strict allowlist of critical schema table suffixes.
 *
 * @return array<int, string>
 */
function bbpa_get_critical_schema_table_suffixes(): array
{
    return [
        'bbpa_daily',
        'bbpa_hits_daily',
        'bbpa_daily_source_category',
        'bbpa_entry_exit_daily',
        'bbpa_geo_daily',
        'bbpa_visitors',
        'bbpa_visitor_activity_daily',
        'bbpa_time_daily',
        'bbpa_overview_daily',
        'bbpa_events_daily',
        'bbpa_event_occurrences',
        'bbpa_event_actions_daily',
        'bbpa_page_time_daily',
        'bbpa_hourly',
        'bbpa_404s_daily',
        'bbpa_search_terms_daily',
        'bbpa_entry_exit_hourly',
    ];
}

/**
 * Return missing critical schema tables as full table names.
 *
 * @return array<int, string>
 */
function bbpa_get_missing_critical_schema_tables(): array
{
    global $wpdb;

    $missing_tables = [];

    foreach (bbpa_get_critical_schema_table_suffixes() as $table_suffix) {
        $table = $wpdb->prefix . $table_suffix;
        if (!bbpa_table_exists($table)) {
            $missing_tables[] = $table;
        }
    }

    return $missing_tables;
}

/**
 * Determine whether critical schema tables are missing.
 */
function bbpa_is_critical_schema_missing(): bool
{
    return bbpa_get_missing_critical_schema_tables() !== [];
}

/**
 * Ensure all critical schema tables exist without destructive operations.
 */
function bbpa_ensure_critical_schema_tables(): void
{
    global $wpdb;

    $missing_tables = bbpa_get_missing_critical_schema_tables();
    if ($missing_tables === []) {
        return;
    }

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    bbpa_install_schema();

    foreach ($missing_tables as $table) {
        if (bbpa_table_exists($table)) {
            bbpa_safe_log('Storage', 'info', 'Critical schema table ensured', [
                'table' => $table,
                'reason' => 'missing_table_repair',
            ]);
        }
    }
}
