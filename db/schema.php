<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Database schema helpers for BimBeau Privacy Analytics.
 *
 * Schema installation and data migrations are version gated: the per-request entry points compare the stored
 * `bbpa_schema_version` / `bbpa_db_migration_version` options with the code constants and run one cheap
 * critical-table check. The full routine runs once per version change, under an options-table lock.
 */

const BBPA_SCHEMA_VERSION = '30';
const BBPA_DB_MIGRATION_VERSION = '1.7.0';

/**
 * Option used as an atomic lock around schema installation, repairs, and data migrations.
 *
 * The stored value is the Unix timestamp at which the lock expires.
 */
const BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION = 'bbpa_upgrade_lock';

/**
 * Run a database operation with WordPress DB error output suppressed.
 *
 * The previous `suppress_errors` and `show_errors` states are restored afterwards, and database errors raised by
 * the operation are forwarded to the plugin logger (debug mode only) instead of being printed.
 *
 * @param callable $operation Callback that performs DB reads/writes.
 * @return mixed
 */
function bbpa_with_suppressed_db_errors(callable $operation)
{
    global $wpdb, $EZSQL_ERROR;

    if (!($wpdb instanceof wpdb)) {
        return $operation();
    }

    $previous_suppress_errors = $wpdb->suppress_errors(true);
    $previous_show_errors = $wpdb->hide_errors();
    $error_offset = is_array($EZSQL_ERROR) ? count($EZSQL_ERROR) : 0;

    try {
        return $operation();
    } finally {
        $wpdb->suppress_errors((bool) $previous_suppress_errors);
        $wpdb->show_errors((bool) $previous_show_errors);
        bbpa_log_suppressed_db_errors($error_offset);
    }
}

/**
 * Forward database errors recorded since the given offset to the plugin logger.
 */
function bbpa_log_suppressed_db_errors(int $error_offset): void
{
    global $EZSQL_ERROR;

    if (!is_array($EZSQL_ERROR) || count($EZSQL_ERROR) <= $error_offset || !function_exists('bbpa_safe_log')) {
        return;
    }

    foreach (array_slice($EZSQL_ERROR, $error_offset, 20) as $error) {
        // dbDelta() probes new tables with DESCRIBE; the resulting "doesn't exist" errors are expected.
        if (!is_array($error) || stripos(ltrim((string) ($error['query'] ?? '')), 'DESCRIBE ') === 0) {
            continue;
        }

        bbpa_safe_log('Storage', 'warning', 'Database error during schema maintenance', [
            'error' => (string) ($error['error_str'] ?? ''),
            'query' => substr((string) ($error['query'] ?? ''), 0, 300),
        ]);
    }
}

/**
 * Build the page-level daily active-time table definition.
 */
function bbpa_get_page_time_daily_table_schema(string $table, string $charset_collate): string
{
    return "CREATE TABLE {$table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        active_ms_total bigint(20) unsigned NOT NULL DEFAULT 0,
        visits_with_time bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";
}

/**
 * Build the raw-log and realtime-row table definitions (schema 30).
 *
 * These append-only tables replace the `bbpa_hits` and `bbpa_realtime_visitors` options, which were read and
 * rewritten in full on every enriched hit. Each row keeps the former option entry as a JSON object in `payload`;
 * `timestamp_bucket` is copied out for window queries and retention purges.
 *
 * @return array<int, string>
 */
function bbpa_get_hit_log_table_schemas(string $charset_collate): array
{
    global $wpdb;

    $schemas = [];
    foreach (['bbpa_raw_logs', 'bbpa_realtime_log'] as $table_suffix) {
        $table = $wpdb->prefix . $table_suffix;
        $schemas[] = "CREATE TABLE {$table} (
        id bigint(20) unsigned NOT NULL auto_increment,
        timestamp_bucket bigint(20) unsigned NOT NULL DEFAULT 0,
        payload longtext NOT NULL,
        PRIMARY KEY  (id),
        KEY timestamp_bucket (timestamp_bucket)
    ) {$charset_collate};";
    }

    return $schemas;
}

/**
 * Build the filtered list of CREATE TABLE statements passed to dbDelta().
 *
 * Integer columns declare the display width reported by MariaDB and MySQL < 8.0.19 (`bigint(20) unsigned`), so
 * dbDelta() finds nothing to change on an up-to-date table. Each KEY stays on its own line, as required by the
 * dbDelta() index parser. Secondary indexes that duplicate a left prefix of the primary key are not declared.
 *
 * @return array<int, string>
 */
function bbpa_get_schema_statements(): array
{
    global $wpdb;

    $charset_collate = $wpdb->get_charset_collate();
    $daily_table = $wpdb->prefix . 'bbpa_daily';
    $hourly_table = $wpdb->prefix . 'bbpa_hourly';
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
    $page_time_daily_table = $wpdb->prefix . 'bbpa_page_time_daily';
    $daily_source_category_table = $wpdb->prefix . 'bbpa_daily_source_category';

    $daily_schema = "CREATE TABLE {$daily_table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        referrer_domain varchar(255) NOT NULL,
        device_class varchar(50) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        visits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, device_class),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain)
    ) {$charset_collate};";

    $hourly_schema = "CREATE TABLE {$hourly_table} (
        date_bucket datetime NOT NULL,
        page_path varchar(2048) NOT NULL,
        referrer_domain varchar(255) NOT NULL,
        device_class varchar(50) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, device_class),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain)
    ) {$charset_collate};";

    $hits_daily_schema = "CREATE TABLE {$hits_daily_table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        referrer_domain varchar(255) NOT NULL,
        source_category varchar(20) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, source_category),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";

    $daily_source_category_schema = "CREATE TABLE {$daily_source_category_table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        referrer_domain varchar(255) NOT NULL,
        source_category varchar(20) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        visits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255), referrer_domain, source_category),
        KEY date_bucket_referrer (date_bucket, referrer_domain),
        KEY page_path (page_path(255)),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";

    $not_found_schema = "CREATE TABLE {$not_found_table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $search_terms_schema = "CREATE TABLE {$search_terms_table} (
        date_bucket date NOT NULL,
        search_term varchar(255) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, search_term(191)),
        KEY search_term (search_term(191))
    ) {$charset_collate};";

    $entry_exit_schema = "CREATE TABLE {$entry_exit_table} (
        date_bucket date NOT NULL,
        page_path varchar(2048) NOT NULL,
        entries bigint(20) unsigned NOT NULL DEFAULT 0,
        exits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $entry_exit_hourly_schema = "CREATE TABLE {$entry_exit_hourly_table} (
        date_bucket datetime NOT NULL,
        page_path varchar(2048) NOT NULL,
        entries bigint(20) unsigned NOT NULL DEFAULT 0,
        exits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, page_path(255)),
        KEY page_path (page_path(255))
    ) {$charset_collate};";

    $geo_schema = "CREATE TABLE {$geo_table} (
        date_bucket date NOT NULL,
        country_code char(2) NOT NULL,
        hits bigint(20) unsigned NOT NULL DEFAULT 0,
        visits bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, country_code),
        KEY country_code (country_code)
    ) {$charset_collate};";
    $geo_schema = apply_filters('bbpa_geo_daily_schema', $geo_schema, $geo_table, $charset_collate);

    $visitors_schema = "CREATE TABLE {$visitors_table} (
        visitor_id varchar(64) NOT NULL,
        first_view_at bigint(20) unsigned NOT NULL,
        last_view_at bigint(20) unsigned NOT NULL,
        entry_page varchar(2048) NOT NULL,
        exit_page varchar(2048) NOT NULL,
        total_views bigint(20) unsigned NOT NULL DEFAULT 0,
        active_time_ms bigint(20) unsigned NOT NULL DEFAULT 0,
        country_code char(2) NOT NULL,
        country varchar(255) NOT NULL,
        referrer_domain varchar(255) NOT NULL,
        source_category varchar(20) NOT NULL DEFAULT '',
        browser varchar(100) NOT NULL,
        browser_version varchar(50) NOT NULL,
        device_class varchar(50) NOT NULL,
        operating_system varchar(100) NOT NULL,
        screen_resolution varchar(50) NOT NULL,
        has_enriched_data tinyint(1) NOT NULL DEFAULT 0,
        PRIMARY KEY  (visitor_id),
        KEY last_view_at (last_view_at),
        KEY total_views (total_views),
        KEY country_code (country_code),
        KEY referrer_domain (referrer_domain),
        KEY source_category (source_category)
    ) {$charset_collate};";


    $visitor_activity_daily_schema = "CREATE TABLE {$visitor_activity_daily_table} (
        date_bucket date NOT NULL,
        visitor_id varchar(64) NOT NULL,
        device_class varchar(50) NOT NULL,
        country_code char(2) NOT NULL DEFAULT '',
        country varchar(255) NOT NULL DEFAULT '',
        has_enriched_data tinyint(1) NOT NULL DEFAULT 0,
        first_seen_at bigint(20) unsigned NOT NULL,
        last_seen_at bigint(20) unsigned NOT NULL,
        page_views bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket, visitor_id),
        KEY visitor_id (visitor_id),
        KEY date_bucket_device (date_bucket, device_class)
    ) {$charset_collate};";

    $time_daily_schema = "CREATE TABLE {$time_daily_table} (
        date_bucket date NOT NULL,
        active_ms_total bigint(20) unsigned NOT NULL DEFAULT 0,
        visits_with_time bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket)
    ) {$charset_collate};";

    $overview_daily_schema = "CREATE TABLE {$overview_daily_table} (
        date_bucket date NOT NULL,
        page_views bigint(20) unsigned NOT NULL DEFAULT 0,
        visits bigint(20) unsigned NOT NULL DEFAULT 0,
        visitors bigint(20) unsigned NOT NULL DEFAULT 0,
        bounces bigint(20) unsigned NOT NULL DEFAULT 0,
        active_ms_total bigint(20) unsigned NOT NULL DEFAULT 0,
        visits_with_time bigint(20) unsigned NOT NULL DEFAULT 0,
        bot_page_views bigint(20) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (date_bucket)
    ) {$charset_collate};";

    $page_time_daily_schema = bbpa_get_page_time_daily_table_schema($page_time_daily_table, $charset_collate);
    $visitors_schema = apply_filters('bbpa_visitors_schema', $visitors_schema, $visitors_table, $charset_collate);
    $visitor_activity_daily_schema = apply_filters('bbpa_visitor_activity_daily_schema', $visitor_activity_daily_schema, $visitor_activity_daily_table, $charset_collate);

    $schemas = [
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
        $page_time_daily_schema,
    ];
    $schemas = array_merge($schemas, bbpa_get_hit_log_table_schemas($charset_collate));
    $filtered_schemas = apply_filters('bbpa_additional_schema_definitions', $schemas, $charset_collate);

    return is_array($filtered_schemas) ? array_values($filtered_schemas) : $schemas;
}

/**
 * Create or update the analytics tables.
 *
 * A nested call (for example from the critical-table repair that runs inside the migrations) returns immediately,
 * so a table that cannot be created never causes an endless install -> migrations -> repair -> install recursion.
 * The schema version is stored only when every critical table exists afterwards.
 */
function bbpa_install_schema(): void
{
    global $wpdb;
    static $installing = false;

    if ($installing) {
        return;
    }

    $installing = true;

    try {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $schema_statements = bbpa_get_schema_statements();
        bbpa_run_dbdelta_schemas($schema_statements);
        bbpa_drop_redundant_schema_indexes();
        do_action('bbpa_after_core_schema_install');

        $sessions_table = $wpdb->prefix . 'bbpa_sessions';
        if (bbpa_table_exists($sessions_table)) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- dbDelta does not support DROP TABLE statements for cleanup migrations.
            $wpdb->query($wpdb->prepare('DROP TABLE IF EXISTS %i', $sessions_table));
        }

        bbpa_run_db_migrations();

        $missing_tables = bbpa_get_missing_critical_schema_tables();
        if ($missing_tables === []) {
            update_option('bbpa_schema_version', BBPA_SCHEMA_VERSION, true);
            update_option('bbpa_schema_signature', bbpa_build_schema_signature($schema_statements), true);
            return;
        }

        if (function_exists('bbpa_safe_log')) {
            bbpa_safe_log('Storage', 'error', 'Schema installation left critical tables missing', [
                'tables' => $missing_tables,
                'error' => (string) $wpdb->last_error,
            ]);
        }
    } finally {
        $installing = false;
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
        if (is_string($schema) && $schema !== '') {
            dbDelta($schema);
        }
    }
}

/**
 * Secondary indexes created by earlier schema versions that duplicate a left prefix of the primary key.
 *
 * @return array<string, array<int, string>> Table suffix => index names.
 */
function bbpa_get_redundant_schema_index_candidates(): array
{
    $date_page_referrer_prefixes = ['date_bucket', 'date_bucket_page', 'date_bucket_path_referrer'];

    return [
        'bbpa_daily' => $date_page_referrer_prefixes,
        'bbpa_hourly' => $date_page_referrer_prefixes,
        'bbpa_hits_daily' => $date_page_referrer_prefixes,
        'bbpa_daily_source_category' => $date_page_referrer_prefixes,
        'bbpa_404s_daily' => ['date_bucket'],
        'bbpa_search_terms_daily' => ['date_bucket'],
        'bbpa_entry_exit_daily' => ['date_bucket'],
        'bbpa_entry_exit_hourly' => ['date_bucket'],
        'bbpa_geo_daily' => ['date_bucket'],
        'bbpa_visitor_activity_daily' => ['date_bucket'],
        'bbpa_time_daily' => ['date_bucket'],
        'bbpa_overview_daily' => ['date_bucket'],
        'bbpa_page_time_daily' => ['date_bucket_page'],
    ];
}

/**
 * Drop legacy secondary indexes that duplicate a left prefix of the primary key.
 *
 * dbDelta() never drops indexes, so this cleanup runs after it. An index is dropped only when it is non-unique
 * and its columns (including prefix lengths) exactly match the first columns of the table's primary key, so no
 * query loses an access path. No data is modified.
 */
function bbpa_drop_redundant_schema_indexes(): void
{
    global $wpdb;

    $existing_tables = bbpa_get_existing_schema_tables();

    foreach (bbpa_get_redundant_schema_index_candidates() as $table_suffix => $index_names) {
        $table = $wpdb->prefix . $table_suffix;
        if (!isset($existing_tables[strtolower($table)])) {
            continue;
        }

        $indexes = bbpa_get_table_index_definitions($table);
        if (!isset($indexes['PRIMARY'])) {
            continue;
        }

        $primary_columns = $indexes['PRIMARY']['columns'];
        $redundant = [];
        foreach ($index_names as $index_name) {
            if (!isset($indexes[$index_name]) || $indexes[$index_name]['unique']) {
                continue;
            }

            $columns = $indexes[$index_name]['columns'];
            if ($columns !== [] && $columns === array_slice($primary_columns, 0, count($columns))) {
                $redundant[] = $index_name;
            }
        }

        if ($redundant === []) {
            continue;
        }

        $query = 'ALTER TABLE %i ' . implode(', ', array_fill(0, count($redundant), 'DROP INDEX %i'));
        // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Static template; identifiers are bound through %i placeholders.
        $result = $wpdb->query($wpdb->prepare($query, $table, ...$redundant));
        if ($result === false && function_exists('bbpa_safe_log')) {
            bbpa_safe_log('Storage', 'warning', 'Redundant index cleanup failed', [
                'table' => $table,
                'indexes' => $redundant,
                'error' => (string) $wpdb->last_error,
            ]);
        }
    }
}

/**
 * Read the index definitions of a table.
 *
 * @return array<string, array{unique: bool, columns: array<int, string>}> Index name => definition. Columns are
 *     lowercase names followed by their prefix length when set (for example `page_path(255)`), in index order.
 */
function bbpa_get_table_index_definitions(string $table): array
{
    global $wpdb;

    $rows = $wpdb->get_results($wpdb->prepare('SHOW INDEX FROM %i', $table), ARRAY_A);
    if (!is_array($rows)) {
        return [];
    }

    $indexes = [];
    foreach ($rows as $row) {
        $name = (string) ($row['Key_name'] ?? '');
        if ($name === '') {
            continue;
        }

        if (!isset($indexes[$name])) {
            $indexes[$name] = [
                'unique' => (string) ($row['Non_unique'] ?? '1') === '0',
                'columns' => [],
            ];
        }

        $sub_part = isset($row['Sub_part']) ? '(' . (int) $row['Sub_part'] . ')' : '';
        $indexes[$name]['columns'][(int) ($row['Seq_in_index'] ?? 0)] = strtolower((string) ($row['Column_name'] ?? '')) . $sub_part;
    }

    foreach ($indexes as $name => $definition) {
        $columns = $definition['columns'];
        ksort($columns);
        $indexes[$name]['columns'] = array_values($columns);
    }

    return $indexes;
}

/**
 * Return the primary key column names of a table, in key order.
 *
 * @return array<int, string>
 */
function bbpa_get_table_primary_key_columns(string $table): array
{
    $indexes = bbpa_get_table_index_definitions($table);
    if (!isset($indexes['PRIMARY'])) {
        return [];
    }

    return array_map(
        static function (string $column): string {
            return (string) preg_replace('/\(\d+\)$/', '', $column);
        },
        $indexes['PRIMARY']['columns']
    );
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
            'SHOW COLUMNS FROM %i LIKE %s',
            $table,
            $wpdb->esc_like($column)
        )
    );

    return !empty($exists);
}

/**
 * Check whether a table exists.
 *
 * The name is escaped for LIKE (the `_` of the table prefix is a wildcard) and compared case-insensitively, as
 * MySQL reports lowercase names when `lower_case_table_names` is enabled.
 */
function bbpa_table_exists(string $table): bool
{
    global $wpdb;

    $table_name = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW TABLES LIKE %s',
            $wpdb->esc_like($table)
        )
    );

    return is_string($table_name) && strcasecmp($table_name, $table) === 0;
}

/**
 * List the plugin tables (`{prefix}bbpa_*`) of the current site with one query.
 *
 * @return array<string, true> Lowercase table name => true.
 */
function bbpa_get_existing_schema_tables(): array
{
    global $wpdb;

    $pattern = $wpdb->esc_like($wpdb->prefix . 'bbpa_') . '%';
    $tables = $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $pattern));

    $existing = [];
    foreach (is_array($tables) ? $tables : [] as $table) {
        $existing[strtolower((string) $table)] = true;
    }

    return $existing;
}

/**
 * Return the first date bucket that backfills must leave untouched.
 *
 * Backfills only rewrite completed days: rows of the current day (in the site timezone or in UTC, whichever is
 * earlier) are still written by live ingestion.
 */
function bbpa_get_backfill_cutoff_date(): string
{
    $site_today = function_exists('wp_date') ? (string) wp_date('Y-m-d') : '';
    $utc_today = gmdate('Y-m-d');

    if ($site_today === '' || strcmp($utc_today, $site_today) < 0) {
        return $utc_today;
    }

    return $site_today;
}

/**
 * Backfill canonical overview daily rows from legacy aggregate tables.
 *
 * One-shot migration for installations created before schema version 23. The migration routine runs it only
 * while its marker option is absent, and it only rewrites completed days.
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
        FROM %i d
        LEFT JOIN (
            SELECT date_bucket, SUM(entries) AS entries
            FROM %i
            GROUP BY date_bucket
        ) ee ON ee.date_bucket = d.date_bucket
        LEFT JOIN (
            SELECT date_bucket, SUM(active_ms_total) AS active_ms_total, SUM(visits_with_time) AS visits_with_time
            FROM %i
            GROUP BY date_bucket
        ) td ON td.date_bucket = d.date_bucket
        WHERE d.date_bucket < %s
        GROUP BY d.date_bucket
        ORDER BY d.date_bucket ASC
    ";

    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- $query only interpolates one of two static SQL fragments; identifiers and values are bound by prepare().
    $rows = $wpdb->get_results($wpdb->prepare($query, $daily_table, $entry_exit_table, $time_daily_table, bbpa_get_backfill_cutoff_date()), ARRAY_A);
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
    $values = [$overview_table];
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

    $sql = 'INSERT INTO %i (date_bucket, page_views, bot_page_views, visits, active_ms_total, visits_with_time) VALUES '
        . implode(', ', $placeholders)
        . ' ON DUPLICATE KEY UPDATE'
        . ' page_views = VALUES(page_views),'
        . ' bot_page_views = VALUES(bot_page_views),'
        . ' visits = VALUES(visits),'
        . ' active_ms_total = VALUES(active_ms_total),'
        . ' visits_with_time = VALUES(visits_with_time)';

    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery -- The statement only contains static SQL and placeholders bound by prepare().
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

    $column_exists = $wpdb->get_var($wpdb->prepare('SHOW COLUMNS FROM %i LIKE %s', $table, $wpdb->esc_like('source_category')));
    if (empty($column_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive migration for visitor acquisition reporting.
        $wpdb->query($wpdb->prepare("ALTER TABLE %i ADD COLUMN source_category VARCHAR(20) NOT NULL DEFAULT '' AFTER referrer_domain", $table));
    }

    $index_exists = $wpdb->get_var($wpdb->prepare('SHOW INDEX FROM %i WHERE Key_name = %s', $table, 'source_category'));
    if (empty($index_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive index for visitor acquisition reporting.
        $wpdb->query($wpdb->prepare('ALTER TABLE %i ADD KEY source_category (source_category)', $table));
    }
}

/**
 * Seconds a single run may spend on batched data backfills before resuming on a later run.
 */
function bbpa_get_schema_maintenance_time_budget(): float
{
    return 5.0;
}

/**
 * Ensure visitor rows can record whether Advanced tracker data enriched the visit.
 *
 * Historical rows (first seen before the backfill started) are flagged as enriched once, in bounded primary-key
 * range batches that are committed one by one. When the time budget is exhausted, a later run resumes the
 * backfill; the completion marker is written only at the end.
 *
 * @param int $batch_size Rows per key-range batch.
 * @return bool True when the column exists and the one-shot backfill is complete.
 */
function bbpa_ensure_visitors_enriched_data_column(int $batch_size = 5000): bool
{
    global $wpdb;
    $table = $wpdb->prefix . 'bbpa_visitors';

    if (!bbpa_table_exists($table)) {
        bbpa_log_missing_table_debug($table);
        return true;
    }

    $column_exists = $wpdb->get_var(
        $wpdb->prepare(
            'SHOW COLUMNS FROM %i LIKE %s',
            $table,
            $wpdb->esc_like('has_enriched_data')
        )
    );

    if (empty($column_exists)) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Targeted additive migration for visitor privacy-state rendering.
        $added = $wpdb->query($wpdb->prepare('ALTER TABLE %i ADD COLUMN has_enriched_data TINYINT(1) NOT NULL DEFAULT 0 AFTER screen_resolution', $table));
        if ($added === false) {
            return false;
        }
    }

    $backfill_option = 'bbpa_visitors_enriched_data_backfilled';
    if (get_option($backfill_option, null) !== null) {
        return true;
    }

    // Historical rows do not have reliable tracker provenance, so they are treated as not eligible for
    // Essential-only privacy overlays. Rows first seen after the backfill started keep their ingestion value.
    $cutoff_option = 'bbpa_visitors_enriched_data_backfill_cutoff';
    $cutoff = (int) get_option($cutoff_option, 0);
    if ($cutoff <= 0) {
        $cutoff = time();
        update_option($cutoff_option, $cutoff, false);
    }

    $batch_size = max(1, $batch_size);
    $deadline = microtime(true) + bbpa_get_schema_maintenance_time_budget();
    $last_visitor_id = '';

    while (true) {
        $upper_visitor_id = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT visitor_id FROM %i WHERE visitor_id > %s ORDER BY visitor_id ASC LIMIT 1 OFFSET %d',
                $table,
                $last_visitor_id,
                $batch_size - 1
            )
        );
        if ((string) $wpdb->last_error !== '') {
            return false;
        }

        if ($upper_visitor_id === null) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Final bounded batch of a one-shot historical backfill.
            $updated = $wpdb->query($wpdb->prepare('UPDATE %i SET has_enriched_data = 1 WHERE visitor_id > %s AND has_enriched_data = 0 AND first_view_at < %d', $table, $last_visitor_id, $cutoff));
            if ($updated === false) {
                return false;
            }

            add_option($backfill_option, gmdate('c'), '', false);
            delete_option($cutoff_option);

            return true;
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Bounded key-range batch of a one-shot historical backfill.
        $updated = $wpdb->query($wpdb->prepare('UPDATE %i SET has_enriched_data = 1 WHERE visitor_id > %s AND visitor_id <= %s AND has_enriched_data = 0 AND first_view_at < %d', $table, $last_visitor_id, (string) $upper_visitor_id, $cutoff));
        if ($updated === false) {
            return false;
        }

        $last_visitor_id = (string) $upper_visitor_id;
        if (microtime(true) >= $deadline) {
            return false;
        }
    }
}

/**
 * Backfill overview daily visitors from visits for legacy rows.
 *
 * One-shot migration for rows written before visitors were counted at ingestion time. The migration routine runs
 * it only when upgrading from a migration version older than 1.4.0, and it only rewrites completed days, so the
 * live row of the current day is never modified.
 */
function bbpa_backfill_overview_daily_visitors_from_visits(): void
{
    global $wpdb;

    $overview_table = $wpdb->prefix . 'bbpa_overview_daily';

    if (!bbpa_table_exists($overview_table)) {
        bbpa_log_missing_table_debug($overview_table);
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Targeted one-shot migration backfill for legacy rows.
    $rows_updated = $wpdb->query($wpdb->prepare('UPDATE %i SET visitors = visits WHERE visitors = 0 AND visits > 0 AND date_bucket < %s', $overview_table, bbpa_get_backfill_cutoff_date()));

    if (is_int($rows_updated) && $rows_updated > 0 && function_exists('bbpa_flush_admin_cache')) {
        bbpa_flush_admin_cache();
    }
}

/**
 * Run plugin database migrations.
 *
 * Every step is idempotent. One-shot historical backfills are guarded by their marker option or by the stored
 * migration version, so repeated runs never rewrite live rows. The stored migration version is updated only when
 * every step completed. A nested call returns immediately.
 */
function bbpa_run_db_migrations(): void
{
    static $running = false;

    if ($running) {
        return;
    }

    $running = true;

    try {
        bbpa_ensure_critical_schema_tables();

        if (!bbpa_can_run_db_migrations()) {
            return;
        }

        $installed = (string) get_option('bbpa_db_migration_version', '0.0.0');
        $completed = true;

        if (get_option('bbpa_overview_daily_backfill_schema_23_last_run', null) === null) {
            bbpa_backfill_overview_daily_from_existing();
        }

        if (version_compare($installed, '1.4.0', '<')) {
            bbpa_backfill_overview_daily_visitors_from_visits();
        }

        bbpa_ensure_page_time_daily_table();
        if (!bbpa_ensure_visitors_enriched_data_column()) {
            $completed = false;
        }
        bbpa_ensure_visitors_source_category_column();
        do_action('bbpa_run_additional_db_migrations');

        if ($completed && version_compare($installed, BBPA_DB_MIGRATION_VERSION, '<')) {
            update_option('bbpa_db_migration_version', BBPA_DB_MIGRATION_VERSION, true);
        }
    } finally {
        $running = false;
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
    ];

    $existing_tables = bbpa_get_existing_schema_tables();
    foreach ($required_tables as $table) {
        if (!isset($existing_tables[strtolower($table)])) {
            bbpa_log_missing_table_debug($table);
            return false;
        }
    }

    return true;
}

/**
 * Ensure the page-level daily active-time aggregate table exists.
 *
 * Index alignment of an existing table is handled by bbpa_install_schema().
 */
function bbpa_ensure_page_time_daily_table(): void
{
    global $wpdb;

    $table = $wpdb->prefix . 'bbpa_page_time_daily';

    if (!bbpa_table_exists($table)) {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta(bbpa_get_page_time_daily_table_schema($table, $wpdb->get_charset_collate()));
    }

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
    // Routed through the plugin logger: written only when the plugin debug mode and a log sink are enabled.
    if (function_exists('bbpa_safe_log')) {
        bbpa_safe_log('Storage', 'debug', 'Migration skipped: missing table', ['table' => $table]);
    }
}

/**
 * Build the signature of a list of schema statements.
 *
 * @param array<int, string> $schema_statements
 */
function bbpa_build_schema_signature(array $schema_statements): string
{
    return md5(BBPA_SCHEMA_VERSION . '|' . (string) wp_json_encode(array_values($schema_statements)));
}

/**
 * Signature of the schema the running code expects.
 *
 * It changes with the schema version and with the schema filters, for example when the Pro edition (Events and city
 * tables) replaces the Free edition or the reverse, so an edition switch installs the matching schema once. Building
 * the statements only runs PHP string filters; it issues no query.
 */
function bbpa_get_schema_signature(): string
{
    return bbpa_build_schema_signature(bbpa_get_schema_statements());
}

/**
 * Determine whether the schema must be (re)installed: stored schema version or schema signature differs.
 */
function bbpa_is_schema_install_required(): bool
{
    return get_option('bbpa_schema_version') !== BBPA_SCHEMA_VERSION
        || get_option('bbpa_schema_signature') !== bbpa_get_schema_signature();
}

/**
 * Determine whether the stored schema version differs from the code or the stored migration version is older.
 *
 * The schema signature is deliberately not part of this check: it is compared once per request, by
 * bbpa_maybe_install_schema(), so a schema filter registered later during `plugins_loaded` cannot make the two
 * entry points disagree.
 */
function bbpa_is_upgrade_required(): bool
{
    if (get_option('bbpa_schema_version') !== BBPA_SCHEMA_VERSION) {
        return true;
    }

    return version_compare((string) get_option('bbpa_db_migration_version', '0.0.0'), BBPA_DB_MIGRATION_VERSION, '<');
}

/**
 * Acquire the schema maintenance lock.
 *
 * Uses an atomic `INSERT IGNORE` on the options table (the technique of the WordPress core upgrader lock), so only
 * one request at a time runs schema installation, repairs, or migrations. An expired lock is taken over.
 *
 * @param int $ttl Seconds before the lock expires when it is never released.
 */
function bbpa_acquire_schema_maintenance_lock(int $ttl = 600): bool
{
    global $wpdb;

    if (!($wpdb instanceof wpdb)) {
        return true;
    }

    $now = time();
    $expires_at = (string) ($now + max(1, $ttl));

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Atomic lock row; the option API cannot insert conditionally.
    $created = $wpdb->query(
        $wpdb->prepare(
            "INSERT IGNORE INTO %i (option_name, option_value, autoload) VALUES (%s, %s, 'off') /* LOCK */",
            $wpdb->options,
            BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION,
            $expires_at
        )
    );
    if ($created) {
        return true;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The lock must be read from the database, not from a cache.
    $current = $wpdb->get_var(
        $wpdb->prepare(
            'SELECT option_value FROM %i WHERE option_name = %s',
            $wpdb->options,
            BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION
        )
    );
    if ($current === null || (int) $current > $now) {
        return false;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Compare-and-swap takeover of an expired lock.
    $taken = $wpdb->query(
        $wpdb->prepare(
            'UPDATE %i SET option_value = %s WHERE option_name = %s AND option_value = %s',
            $wpdb->options,
            $expires_at,
            BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION,
            (string) $current
        )
    );

    return (bool) $taken;
}

/**
 * Release the schema maintenance lock.
 *
 * @param int $retry_after When greater than zero, keep the lock for this many seconds so that failing or partial
 *                         maintenance is retried later instead of on every request.
 */
function bbpa_release_schema_maintenance_lock(int $retry_after = 0): void
{
    global $wpdb;

    if (!($wpdb instanceof wpdb)) {
        return;
    }

    if ($retry_after > 0) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The lock row is managed outside the option cache.
        $wpdb->query(
            $wpdb->prepare(
                'UPDATE %i SET option_value = %s WHERE option_name = %s',
                $wpdb->options,
                (string) (time() + $retry_after),
                BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION
            )
        );
        return;
    }

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The lock row is managed outside the option cache.
    $wpdb->query(
        $wpdb->prepare(
            'DELETE FROM %i WHERE option_name = %s',
            $wpdb->options,
            BBPA_SCHEMA_MAINTENANCE_LOCK_OPTION
        )
    );
}

/**
 * Ensure the schema is up to date.
 *
 * Hooked on `plugins_loaded` (priority 10). When the stored schema or migration version is outdated, or the schema
 * signature changed (Free/Pro edition switch), the upgrade routine runs once under the maintenance lock. Otherwise one `SHOW TABLES` query checks that the critical tables
 * still exist (skipped for five minutes after a successful check when a persistent object cache is available), and
 * missing tables are repaired under the lock.
 */
function bbpa_maybe_install_schema(): void
{
    if (bbpa_is_upgrade_required() || bbpa_is_schema_install_required()) {
        if (function_exists('bbpa_run_locked_upgrade_routine')) {
            bbpa_run_locked_upgrade_routine();
            return;
        }

        if (bbpa_acquire_schema_maintenance_lock()) {
            bbpa_with_suppressed_db_errors(static function (): void {
                bbpa_install_schema();
            });
            bbpa_release_schema_maintenance_lock(bbpa_is_schema_install_required() ? MINUTE_IN_SECONDS : 0);
        }

        return;
    }

    $use_cache = function_exists('wp_using_ext_object_cache') && wp_using_ext_object_cache();
    $cache_group = defined('BBPA_CACHE_GROUP') ? BBPA_CACHE_GROUP : 'bbpa';
    $cache_key = '';
    if ($use_cache) {
        $cache_key = 'critical_schema_ok_' . md5(BBPA_SCHEMA_VERSION . '|' . wp_json_encode(bbpa_get_critical_schema_table_suffixes()));
        if (wp_cache_get($cache_key, $cache_group)) {
            return;
        }
    }

    if (!bbpa_is_critical_schema_missing()) {
        if ($use_cache) {
            wp_cache_set($cache_key, 1, $cache_group, 5 * MINUTE_IN_SECONDS);
        }
        return;
    }

    if (!bbpa_acquire_schema_maintenance_lock()) {
        return;
    }

    bbpa_with_suppressed_db_errors(static function (): void {
        bbpa_ensure_critical_schema_tables();
    });

    bbpa_release_schema_maintenance_lock(bbpa_is_critical_schema_missing() ? 10 * MINUTE_IN_SECONDS : 0);
}

/**
 * Return the strict allowlist of critical schema table suffixes.
 *
 * @return array<int, string>
 */
function bbpa_get_critical_schema_table_suffixes(): array
{
    $tables = [
        'bbpa_daily',
        'bbpa_hits_daily',
        'bbpa_daily_source_category',
        'bbpa_entry_exit_daily',
        'bbpa_geo_daily',
        'bbpa_visitors',
        'bbpa_visitor_activity_daily',
        'bbpa_time_daily',
        'bbpa_overview_daily',
        'bbpa_page_time_daily',
        'bbpa_hourly',
        'bbpa_404s_daily',
        'bbpa_search_terms_daily',
        'bbpa_entry_exit_hourly',
        'bbpa_raw_logs',
        'bbpa_realtime_log',
    ];

    return apply_filters('bbpa_critical_schema_table_suffixes', $tables);
}

/**
 * Return missing critical schema tables as full table names.
 *
 * Plugin tables are checked with a single `SHOW TABLES LIKE '{prefix}bbpa\_%'` query.
 *
 * @return array<int, string>
 */
function bbpa_get_missing_critical_schema_tables(): array
{
    global $wpdb;

    $missing_tables = [];
    $existing_tables = null;

    foreach (bbpa_get_critical_schema_table_suffixes() as $table_suffix) {
        if (!is_string($table_suffix) || $table_suffix === '') {
            continue;
        }

        $table = $wpdb->prefix . $table_suffix;
        if (strpos($table_suffix, 'bbpa_') === 0) {
            if ($existing_tables === null) {
                $existing_tables = bbpa_get_existing_schema_tables();
            }
            if (!isset($existing_tables[strtolower($table)])) {
                $missing_tables[] = $table;
            }
            continue;
        }

        if (!bbpa_table_exists($table)) {
            $missing_tables[] = $table;
        }
    }

    return $missing_tables;
}

/**
 * Determine whether critical schema tables are missing.
 *
 * The result depends on the live database, so it can change between two calls.
 *
 * @phpstan-impure
 */
function bbpa_is_critical_schema_missing(): bool
{
    return bbpa_get_missing_critical_schema_tables() !== [];
}

/**
 * Ensure all critical schema tables exist without destructive operations.
 *
 * Runs the schema installation once when a critical table is missing. When the schema installation is already
 * running (install -> migrations -> repair), the nested installation returns immediately instead of recursing.
 */
function bbpa_ensure_critical_schema_tables(): void
{
    $missing_tables = bbpa_get_missing_critical_schema_tables();
    if ($missing_tables === []) {
        return;
    }

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    bbpa_install_schema();

    if (!function_exists('bbpa_safe_log')) {
        return;
    }

    $still_missing = bbpa_get_missing_critical_schema_tables();
    foreach ($missing_tables as $table) {
        if (!in_array($table, $still_missing, true)) {
            bbpa_safe_log('Storage', 'info', 'Critical schema table ensured', [
                'table' => $table,
                'reason' => 'missing_table_repair',
            ]);
        }
    }

    if ($still_missing !== []) {
        bbpa_safe_log('Storage', 'error', 'Critical schema tables are still missing after repair', [
            'tables' => $still_missing,
        ]);
    }
}
