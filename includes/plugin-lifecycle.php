<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin lifecycle callbacks for BimBeau Privacy Analytics.
 */

const BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED = 'bbpa_marketing_query_allowlist_backfill_completed';
const BBPA_ACTIVATION_REDIRECT_TRANSIENT = 'bbpa_redirect_after_activation';


/**
 * Loads bundled plugin translations from the active package languages directory.
 */
function bbpa_load_textdomain(): void
{
    load_plugin_textdomain(
        'bimbeau-privacy-analytics',
        false,
        dirname(plugin_basename(BBPA_PATH . 'bimbeau-privacy-analytics.php')) . '/languages'
    );
}


/**
 * Legacy 3-letter prefix migration metadata.
 *
 * These old names are read only so existing installations can move to bbpa_* storage.
 */
function bbpa_get_legacy_prefix_migration_map(): array
{
    return [
        'options' => [
            'bpa_settings' => 'bbpa_settings',
            'bpa_schema_version' => 'bbpa_schema_version',
            'bpa_db_migration_version' => 'bbpa_db_migration_version',
            'bpa_overview_daily_backfill_schema_23_last_run' => 'bbpa_overview_daily_backfill_schema_23_last_run',
            'bpa_visitors_enriched_data_backfilled' => 'bbpa_visitors_enriched_data_backfilled',
            'bpa_page_time_daily_rows_written' => 'bbpa_page_time_daily_rows_written',
            'bpa_marketing_query_allowlist_backfill_completed' => 'bbpa_marketing_query_allowlist_backfill_completed',
            'bpa_legacy_privacy_options_cleanup_completed' => 'bbpa_legacy_privacy_options_cleanup_completed',
            'bpa_assets_updated_at' => 'bbpa_assets_updated_at',
            'bpa_geoip_update_retry_state' => 'bbpa_geoip_update_retry_state',
            'bpa_geoip_retry_state' => 'bbpa_geoip_update_retry_state',
            'bpa_aggregation_interval' => 'bbpa_aggregation_interval',
        ],
        'cron_hooks' => [
            'bpa_purge_raw_logs',
            'bpa_aggregate_hits',
            'bpa_purge_aggregated_retention',
            'bpa_monthly_geoip_update',
            'bpa_geoip_retry_update',
            'bpa_geoip_initial_update',
            'bpa_process_export_job',
            'bpa_purge_expired_export_files',
        ],
    ];
}



/**
 * Log a legacy prefix migration diagnostic through the plugin logger (written only in debug mode).
 */
function bbpa_log_prefix_migration(string $message, array $context = []): void
{
    if (function_exists('bbpa_safe_log')) {
        bbpa_safe_log('Storage', 'warning', '[BBPA prefix migration] ' . $message, $context);
    }
}

function bbpa_detect_legacy_prefix_tables(): array
{
    global $wpdb;

    if (!($wpdb instanceof wpdb)) {
        return [];
    }

    $pattern = $wpdb->esc_like($wpdb->prefix . 'bpa_') . '%';
    $tables = $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $pattern));

    if (!is_array($tables)) {
        return [];
    }

    return array_values(array_map('strval', $tables));
}

function bbpa_store_legacy_prefix_table_notice(array $legacy_tables): void
{
    if ($legacy_tables === []) {
        delete_transient('bbpa_legacy_prefix_tables_detected');
        return;
    }

    $legacy_tables = array_values(array_unique(array_map('sanitize_text_field', $legacy_tables)));
    set_transient('bbpa_legacy_prefix_tables_detected', $legacy_tables, WEEK_IN_SECONDS);
}

function bbpa_detect_legacy_prefix_table_leftovers(): array
{
    $legacy_tables = bbpa_detect_legacy_prefix_tables();

    if ($legacy_tables === []) {
        bbpa_store_legacy_prefix_table_notice([]);
        return [];
    }

    bbpa_log_prefix_migration('legacy bpa tables detected; automatic table recovery is retired', [
        'tables' => $legacy_tables,
    ]);
    bbpa_store_legacy_prefix_table_notice($legacy_tables);

    return $legacy_tables;
}

/**
 * Migrate legacy three-letter options and cron hooks to the canonical namespace.
 *
 * Legacy bpa_* tables are detected without automatic merge, rename, or drop actions.
 */
function bbpa_run_legacy_prefix_migration(): void
{
    $map = bbpa_get_legacy_prefix_migration_map();

    foreach ($map['options'] as $old_option => $new_option) {
        if (get_option($new_option, null) !== null) {
            delete_option($old_option);
            continue;
        }

        $old_value = get_option($old_option, null);
        if ($old_value === null) {
            continue;
        }

        update_option($new_option, $old_value, false);
        delete_option($old_option);
    }

    bbpa_detect_legacy_prefix_table_leftovers();

    foreach ($map['cron_hooks'] as $old_hook) {
        wp_clear_scheduled_hook($old_hook);
    }

    // Earlier releases copied `bpa_geoip_retry_state` to this orphan option, which the runtime never reads.
    delete_option('bbpa_geoip_retry_state');

    update_option('bbpa_prefix_migration_completed', true, false);
}

/**
 * Backfill the default marketing attribution query allowlist on existing installs.
 */
function bbpa_backfill_marketing_query_allowlist(): void
{
    if ((bool) rest_sanitize_boolean(get_option(BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED, false))) {
        return;
    }

    $settings = get_option('bbpa_settings', null);
    if (!is_array($settings)) {
        update_option(BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED, true, false);
        return;
    }

    $allowlist = $settings['url_query_allowlist'] ?? [];
    if (is_string($allowlist)) {
        $allowlist = preg_split('/[\s,]+/', $allowlist);
    }
    if (!is_array($allowlist)) {
        $allowlist = [];
    }

    $allowlist = array_values(array_unique(array_filter(array_map('sanitize_key', $allowlist))));
    if ($allowlist !== []) {
        update_option(BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED, true, false);
        return;
    }

    $defaults = function_exists('bbpa_get_settings_defaults') ? bbpa_get_settings_defaults() : [];
    $default_allowlist = is_array($defaults) && isset($defaults['url_query_allowlist']) && is_array($defaults['url_query_allowlist'])
        ? $defaults['url_query_allowlist']
        : [];
    $default_allowlist = array_values(array_unique(array_filter(array_map('sanitize_key', $default_allowlist))));

    if ($default_allowlist === []) {
        update_option(BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED, true, false);
        return;
    }

    $settings['url_query_allowlist'] = $default_allowlist;
    update_option('bbpa_settings', $settings, false);
    update_option(BBPA_MARKETING_QUERY_ALLOWLIST_BACKFILL_COMPLETED, true, false);
}

/** Preserve the historic advanced-statistics default for sites upgrading from older releases. */
function bbpa_migrate_existing_settings_for_setup_wizard(): void
{
    $settings = get_option('bbpa_settings', null);
    if (!is_array($settings)) {
        return;
    }
    $changed = false;
    if (!array_key_exists('advanced_stats_enabled', $settings)) {
        $settings['advanced_stats_enabled'] = true;
        $changed = true;
    }
    if (!array_key_exists('referrer_favicons_enabled', $settings)) {
        $settings['referrer_favicons_enabled'] = false;
        $changed = true;
    }
    if ($changed) {
        update_option('bbpa_settings', $settings, false);
    }
}

/**
 * Return the ids of the sites of the current network that lifecycle tasks should run on.
 *
 * Returns an empty list on single-site installs. When `$capped` is true and the network has more sites than the
 * `bbpa_network_lifecycle_max_sites` limit (default 50), or on large networks (see `wp_is_large_network()`), only
 * the current site is returned: the other sites install their tables on their next request (`plugins_loaded`
 * upgrade routine) and their cron events on `init`, which keeps network activation within the request time limit.
 *
 * @param bool $capped Whether to apply the per-request site limit (used by network activation).
 * @return int[]
 */
function bbpa_get_network_site_ids_for_lifecycle(bool $capped = false): array
{
    if (!is_multisite() || !function_exists('get_sites')) {
        return [];
    }

    if (function_exists('wp_is_large_network') && wp_is_large_network('sites')) {
        return [(int) get_current_blog_id()];
    }

    $network_id = function_exists('get_current_network_id') ? get_current_network_id() : null;

    if ($capped) {
        /**
         * Filters the maximum number of sites set up synchronously during a network activation.
         *
         * Above this number only the current site is set up during the request; the other sites set themselves up
         * on their next request.
         *
         * @param int $max_sites Maximum number of sites. Default 50.
         */
        $max_sites = (int) apply_filters('bbpa_network_lifecycle_max_sites', 50);
        $site_count = (int) get_sites(['count' => true, 'number' => 0, 'network_id' => $network_id]);
        if ($max_sites < 1 || $site_count > $max_sites) {
            return [(int) get_current_blog_id()];
        }
    }

    $site_ids = get_sites([
        'fields' => 'ids',
        'number' => 0,
        'network_id' => $network_id,
    ]);

    return is_array($site_ids) ? array_values(array_map('intval', $site_ids)) : [];
}

/**
 * Run a lifecycle callback on every site of the current network, or on the current site only on single-site installs.
 *
 * @param callable $callback Called without arguments while the target site is the current blog.
 * @param bool     $capped   Whether to apply the `bbpa_network_lifecycle_max_sites` limit.
 */
function bbpa_run_on_each_network_site(callable $callback, bool $capped = false): void
{
    $site_ids = bbpa_get_network_site_ids_for_lifecycle($capped);
    if ($site_ids === []) {
        $callback();
        return;
    }

    foreach ($site_ids as $site_id) {
        switch_to_blog($site_id);
        try {
            $callback();
        } finally {
            restore_current_blog();
        }
    }
}

/**
 * Refresh rewrite rules after a lifecycle change.
 *
 * `flush_rewrite_rules()` would store the current site's rules into a switched site, so a switched site only gets
 * its stored rules deleted: WordPress rebuilds them on that site's next request.
 */
function bbpa_refresh_rewrite_rules_for_lifecycle(): void
{
    if (function_exists('ms_is_switched') && ms_is_switched()) {
        delete_option('rewrite_rules');
        return;
    }

    flush_rewrite_rules();
}

/**
 * Plugin activation tasks.
 *
 * A network activation runs the activation tasks on every site of the network.
 */
function bbpa_activate(bool $network_wide = false, bool $allow_redirect = true): void
{
    if ($network_wide && is_multisite()) {
        // Capped: sites beyond the limit set themselves up on their next request.
        bbpa_run_on_each_network_site(static function (): void {
            bbpa_activate_site(true, false);
        }, true);
        return;
    }

    bbpa_activate_site($network_wide, $allow_redirect);
}

/**
 * Network-activated plugin: run the activation tasks on a site created after the network activation.
 *
 * Hooked on `wp_initialize_site` after WordPress has created the site tables and options.
 *
 * @param WP_Site|mixed $site New site.
 */
function bbpa_initialize_new_network_site($site): void
{
    if (!($site instanceof WP_Site) || !is_multisite() || !defined('BBPA_PATH')) {
        return;
    }

    $basename = plugin_basename(BBPA_PATH . 'bimbeau-privacy-analytics.php');
    $network_active_plugins = get_site_option('active_sitewide_plugins', []);
    if (!is_array($network_active_plugins) || !isset($network_active_plugins[$basename])) {
        return;
    }

    switch_to_blog((int) $site->blog_id);
    try {
        bbpa_activate_site(true, false);
    } finally {
        restore_current_blog();
    }
}

add_action('wp_initialize_site', 'bbpa_initialize_new_network_site', 200);

/**
 * Activation tasks for the current site.
 */
function bbpa_activate_site(bool $network_wide = false, bool $allow_redirect = true): void
{
    bbpa_run_legacy_prefix_migration();
    bbpa_with_suppressed_db_errors(static function (): void {
        bbpa_install_schema();
    });
    bbpa_register_raw_logs_option();
    bbpa_register_settings_option();
    bbpa_migrate_existing_settings_for_setup_wizard();
    bbpa_backfill_marketing_query_allowlist();
    bbpa_run_legacy_privacy_options_cleanup();

    if (get_option(BBPA_SETUP_WIZARD_OPTION, null) === null) {
        bbpa_update_setup_wizard_state(bbpa_get_setup_wizard_default_state());
    }

    if ($allow_redirect && bbpa_should_schedule_activation_redirect($network_wide)) {
        set_transient(BBPA_ACTIVATION_REDIRECT_TRANSIENT, 1, MINUTE_IN_SECONDS);
    }

    if (function_exists('bbpa_schedule_raw_log_cleanup')) {
        bbpa_schedule_raw_log_cleanup(true);
    } elseif (!wp_next_scheduled(BBPA_RAW_LOGS_CRON_HOOK)) {
        wp_schedule_event(time(), 'daily', BBPA_RAW_LOGS_CRON_HOOK);
    }

    if (function_exists('bbpa_schedule_next_aggregation')) {
        bbpa_schedule_next_aggregation(true);
    } elseif (!wp_next_scheduled(BBPA_AGGREGATION_CRON_HOOK)) {
        wp_schedule_event(time(), 'hourly', BBPA_AGGREGATION_CRON_HOOK);
    }
    if (function_exists('bbpa_schedule_aggregated_retention_cleanup')) {
        bbpa_schedule_aggregated_retention_cleanup(true);
    } elseif (!wp_next_scheduled(BBPA_AGGREGATED_RETENTION_CRON_HOOK)) {
        wp_schedule_event(time(), 'monthly', BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    }


    if (function_exists('bbpa_get_geoip_update_frequency') && bbpa_get_geoip_update_frequency() === 'disabled' && function_exists('bbpa_clear_geoip_update_schedule')) {
        bbpa_clear_geoip_update_schedule();
    }

    /**
     * Fires after core plugin activation tasks complete so edition-specific runtime can attach lifecycle work.
     */
    do_action('bbpa_after_plugin_activation');

    do_action('bbpa_register_premium_rewrite_rules_for_activation');

    bbpa_refresh_rewrite_rules_for_lifecycle();
}

/** Decide whether this request represents a normal, single-site admin activation. */
function bbpa_should_schedule_activation_redirect(bool $network_wide): bool
{
    $action = isset($_GET['action']) ? sanitize_key(wp_unslash($_GET['action'])) : '';
    $blocked_runtime = (defined('WP_CLI') && WP_CLI)
        || wp_doing_ajax()
        || (defined('REST_REQUEST') && REST_REQUEST)
        || (defined('DOING_CRON') && DOING_CRON);

    if ($network_wide || $blocked_runtime || isset($_GET['activate-multi']) || in_array($action, ['activate-selected', 'update-selected'], true)) {
        return false;
    }

    $state = bbpa_get_setup_wizard_state();
    return is_admin() && bbpa_setup_wizard_auto_open_allowed($state);
}

/** Consume and validate the one-time activation redirect target. */
function bbpa_consume_activation_redirect(): ?string
{
    if (!get_transient(BBPA_ACTIVATION_REDIRECT_TRANSIENT)) {
        return null;
    }

    delete_transient(BBPA_ACTIVATION_REDIRECT_TRANSIENT);

    if (
        !is_admin()
        || wp_doing_ajax()
        || (defined('WP_CLI') && WP_CLI)
        || (defined('REST_REQUEST') && REST_REQUEST)
        || (defined('DOING_CRON') && DOING_CRON)
        || !current_user_can(bbpa_get_panel_capability('dashboard'))
    ) {
        return null;
    }

    return admin_url('admin.php?page=bimbeau-privacy-analytics');
}

/** Redirect once after activation, consuming the marker before sending headers. */
function bbpa_maybe_redirect_after_activation(): void
{
    $redirect_url = bbpa_consume_activation_redirect();
    if ($redirect_url === null) {
        return;
    }

    wp_safe_redirect($redirect_url);
    exit;
}

// Run after licensing SDK activation redirects so their connection flow keeps priority.
add_action('admin_init', 'bbpa_maybe_redirect_after_activation', 999);

/**
 * Run the upgrade routine when the stored schema or migration version is older than the code.
 *
 * Hooked on `plugins_loaded` (priority 20). With up-to-date versions this returns after reading two autoloaded
 * options. `bbpa_maybe_install_schema()` (priority 10) runs first and also handles schema signature changes.
 */
function bbpa_maybe_run_upgrades(): void
{
    if (!bbpa_is_upgrade_required()) {
        return;
    }

    bbpa_run_locked_upgrade_routine();
}

/**
 * Run the upgrade routine under the schema maintenance lock.
 *
 * A single request runs it; concurrent requests skip it and continue. An incomplete run keeps the lock for a short
 * delay so that it is retried later instead of on every request.
 */
function bbpa_run_locked_upgrade_routine(): void
{
    if (!bbpa_acquire_schema_maintenance_lock()) {
        return;
    }

    $completed = false;
    try {
        $completed = bbpa_run_upgrade_routine();
    } finally {
        if ($completed) {
            bbpa_release_schema_maintenance_lock();
        } else {
            bbpa_release_schema_maintenance_lock(bbpa_is_critical_schema_missing() ? 10 * MINUTE_IN_SECONDS : MINUTE_IN_SECONDS);
        }
    }
}

/**
 * Run the upgrade tasks once: legacy option migration, schema installation, settings backfills, and data
 * migrations, then fire `bbpa_after_plugin_upgrade`.
 *
 * Callers are expected to hold the schema maintenance lock (see `bbpa_maybe_run_upgrades()`).
 *
 * @return bool True when the stored schema and migration versions match the code afterwards.
 */
function bbpa_run_upgrade_routine(): bool
{
    bbpa_run_legacy_prefix_migration();

    bbpa_with_suppressed_db_errors(static function (): void {
        if (bbpa_is_schema_install_required()) {
            bbpa_install_schema();
            return;
        }

        bbpa_ensure_critical_schema_tables();
    });

    bbpa_register_settings_option();
    bbpa_migrate_existing_settings_for_setup_wizard();
    bbpa_backfill_marketing_query_allowlist();
    bbpa_run_legacy_privacy_options_cleanup();

    if (version_compare((string) get_option('bbpa_db_migration_version', '0.0.0'), BBPA_DB_MIGRATION_VERSION, '<')) {
        bbpa_with_suppressed_db_errors(static function (): void {
            bbpa_run_db_migrations();
        });
    }

    if (function_exists('bbpa_get_geoip_update_frequency') && bbpa_get_geoip_update_frequency() === 'disabled' && function_exists('bbpa_clear_geoip_update_schedule')) {
        bbpa_clear_geoip_update_schedule();
    }

    if (bbpa_is_upgrade_required() || bbpa_is_schema_install_required()) {
        return false;
    }

    /**
     * Fires once after the core upgrade tasks complete, so edition-specific runtime can attach lifecycle work.
     *
     * Runs only when the stored schema or migration version was older than the code or the schema signature
     * changed (Free/Pro edition switch), not on every request.
     */
    do_action('bbpa_after_plugin_upgrade');

    return true;
}


/**
 * Cleanup plugin data after Freemius uninstall when explicitly enabled in settings.
 *
 * On multisite every site of the network is processed, and each site is cleaned only when its own
 * `delete_data_on_uninstall` setting is enabled. Nothing is deleted when the setting is disabled.
 */
function bbpa_after_uninstall_cleanup(): void
{
    // Deleting the old Free package after moving to Pro (or the reverse) must not wipe the data the other package uses.
    if (bbpa_is_other_package_installed()) {
        return;
    }

    bbpa_run_on_each_network_site('bbpa_uninstall_cleanup_current_site');
}

/**
 * Whether the other BimBeau Privacy Analytics package (Free or Pro) is still installed.
 */
function bbpa_is_other_package_installed(): bool
{
    if (!defined('BBPA_PATH') || !function_exists('bbpa_get_conflicting_package_basename')) {
        return false;
    }

    if (!function_exists('get_plugins') && function_exists('bbpa_load_plugin_api')) {
        bbpa_load_plugin_api();
    }
    if (!function_exists('get_plugins')) {
        return false;
    }

    $current_basename = plugin_basename(BBPA_PATH . 'bimbeau-privacy-analytics.php');
    $other_basename = bbpa_get_conflicting_package_basename($current_basename);
    $installed_plugins = get_plugins();

    return is_array($installed_plugins) && isset($installed_plugins[$other_basename]);
}

/**
 * Delete the current site's plugin data (tables, options, transients, cron events and files) when the
 * `delete_data_on_uninstall` setting is enabled.
 */
function bbpa_uninstall_cleanup_current_site(): void
{
    $settings = get_option('bbpa_settings', []);
    $delete_data_on_uninstall = is_array($settings)
        ? !empty($settings['delete_data_on_uninstall'])
        : false;

    if (!$delete_data_on_uninstall) {
        return;
    }

    global $wpdb;

    if (!($wpdb instanceof wpdb)) {
        return;
    }

    bbpa_uninstall_drop_tables($wpdb);
    bbpa_uninstall_clear_cron_events();
    bbpa_uninstall_delete_files();
    bbpa_uninstall_delete_options($wpdb);
}

/**
 * Drop the plugin tables of the current site.
 */
function bbpa_uninstall_drop_tables(wpdb $wpdb): void
{
    $table_suffixes = [
        'bbpa_daily',
        'bbpa_hourly',
        'bbpa_sessions',
        'bbpa_hits_daily',
        'bbpa_daily_source_category',
        'bbpa_utm_daily',
        'bbpa_404s_daily',
        'bbpa_search_terms_daily',
        'bbpa_entry_exit_daily',
        'bbpa_entry_exit_hourly',
        'bbpa_geo_daily',
        'bbpa_visitors',
        'bbpa_visitor_activity_daily',
        'bbpa_time_daily',
        'bbpa_page_time_daily',
        'bbpa_overview_daily',
        'bbpa_raw_logs',
        'bbpa_realtime_log',
    ];
    $table_suffixes = apply_filters('bbpa_uninstall_table_suffixes', $table_suffixes);
    $table_suffixes = is_array($table_suffixes) ? $table_suffixes : [];

    $table_names = [];
    foreach ($table_suffixes as $table_suffix) {
        // Filtered values are identifiers: keep only plugin table suffixes.
        if (!is_string($table_suffix) || !preg_match('/^bbpa_[a-z0-9_]{1,60}$/', $table_suffix)) {
            continue;
        }
        $table_names[] = $wpdb->prefix . $table_suffix;
    }

    // Also drop any other `{prefix}bbpa_*` table (tables added by later versions or by the other edition).
    $pattern = $wpdb->esc_like($wpdb->prefix . 'bbpa_') . '%';
    $existing_tables = $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $pattern)); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Uninstall cleanup.
    if (is_array($existing_tables)) {
        foreach ($existing_tables as $existing_table) {
            if (is_string($existing_table) && preg_match('/^[A-Za-z0-9_]+$/', $existing_table)) {
                $table_names[] = $existing_table;
            }
        }
    }

    foreach (array_unique($table_names) as $table_name) {
        $wpdb->query($wpdb->prepare('DROP TABLE IF EXISTS %i', $table_name)); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Explicit uninstall cleanup of plugin tables.
    }
}

/**
 * Remove every plugin cron event of the current site, whatever its arguments.
 */
function bbpa_uninstall_clear_cron_events(): void
{
    $hooks = [
        BBPA_RAW_LOGS_CRON_HOOK,
        BBPA_AGGREGATION_CRON_HOOK,
        BBPA_AGGREGATED_RETENTION_CRON_HOOK,
    ];

    // Every `bbpa_*` event of either edition, including events scheduled with arguments.
    $cron = function_exists('_get_cron_array') ? _get_cron_array() : [];
    if (is_array($cron)) {
        foreach ($cron as $events) {
            if (!is_array($events)) {
                continue;
            }
            foreach (array_keys($events) as $hook) {
                if (is_string($hook) && strpos($hook, 'bbpa_') === 0) {
                    $hooks[] = $hook;
                }
            }
        }
    }

    // Legacy hook names are an explicit list so that other plugins' `bpa_*` events are never touched.
    $legacy_map = bbpa_get_legacy_prefix_migration_map();
    $hooks = array_merge($hooks, $legacy_map['cron_hooks']);

    foreach (array_unique($hooks) as $hook) {
        wp_unschedule_hook($hook);
    }
}

/**
 * Delete the plugin files stored in the current site's uploads directory: GeoIP database, favicon cache,
 * export files and generated PWA icons.
 */
function bbpa_uninstall_delete_files(): void
{
    if (!class_exists('BBPA_Filesystem_Service')) {
        return;
    }

    $uploads = wp_upload_dir(null, false, false);
    if (!empty($uploads['error']) || empty($uploads['basedir']) || !is_string($uploads['basedir'])) {
        return;
    }

    $base = trailingslashit($uploads['basedir']);
    $filesystem_service = new BBPA_Filesystem_Service();

    // `uploads/bpa/` is the legacy directory name: only the plugin's own sub-directories and file are removed.
    foreach (['bbpa', 'bpa/exports', 'bpa/pwa-icons', 'bpa/geoip'] as $directory) {
        $path = $base . $directory;
        if ($directory === 'bpa/geoip') {
            $filesystem_service->delete_file($path . '/GeoLite2-City.mmdb');
            continue;
        }
        if ($filesystem_service->exists($path)) {
            $filesystem_service->delete_directory($path);
        }
    }
}

/**
 * Delete the plugin options and transients of the current site.
 *
 * Every `bbpa_*` option and `bbpa_*` transient is removed, plus the legacy `bpa_*` option names the plugin used to
 * store (explicit list, so other plugins' `bpa_*` options are never touched). Licensing SDK options are kept.
 */
function bbpa_uninstall_delete_options(wpdb $wpdb): void
{
    $option_names = [];
    $patterns = [
        $wpdb->esc_like('bbpa_') . '%',
        $wpdb->esc_like('_transient_bbpa_') . '%',
        $wpdb->esc_like('_transient_timeout_bbpa_') . '%',
    ];

    foreach ($patterns as $pattern) {
        $names = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $pattern)); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Uninstall cleanup.
        if (is_array($names)) {
            $option_names = array_merge($option_names, $names);
        }
    }

    $legacy_map = bbpa_get_legacy_prefix_migration_map();
    $option_names = array_merge($option_names, array_keys($legacy_map['options']));

    foreach (array_unique(array_map('strval', $option_names)) as $option_name) {
        if (strpos($option_name, '_transient_timeout_') === 0) {
            continue;
        }
        if (strpos($option_name, '_transient_') === 0) {
            delete_transient(substr($option_name, strlen('_transient_')));
            continue;
        }
        delete_option($option_name);
    }

    // Transients kept in a persistent object cache never reach the options table.
    foreach (['bbpa', 'bbpa_metrics'] as $cache_group) {
        if (function_exists('wp_cache_supports') && wp_cache_supports('flush_group')) {
            wp_cache_flush_group($cache_group);
        }
    }
}

/**
 * Register Freemius uninstall callback when the SDK instance is available.
 */
function bbpa_register_freemius_uninstall_hook(): void
{
    if (!function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius) || !method_exists($freemius, 'add_action')) {
        return;
    }

    $freemius->add_action('after_uninstall', 'bbpa_after_uninstall_cleanup');
}

/**
 * Plugin deactivation tasks.
 *
 * A network deactivation runs the deactivation tasks on every site of the network.
 */
function bbpa_deactivate(bool $network_wide = false): void
{
    if ($network_wide && is_multisite()) {
        bbpa_run_on_each_network_site('bbpa_deactivate_site');
        return;
    }

    bbpa_deactivate_site();
}

/**
 * Deactivation tasks for the current site.
 */
function bbpa_deactivate_site(): void
{
    wp_clear_scheduled_hook(BBPA_RAW_LOGS_CRON_HOOK);
    wp_clear_scheduled_hook(BBPA_AGGREGATION_CRON_HOOK);
    wp_clear_scheduled_hook(BBPA_AGGREGATED_RETENTION_CRON_HOOK);
    if (function_exists('bbpa_clear_geoip_update_schedule')) {
        bbpa_clear_geoip_update_schedule();
    } else {
        wp_clear_scheduled_hook(BBPA_GEOIP_UPDATE_CRON_HOOK);
        wp_clear_scheduled_hook(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);
        wp_clear_scheduled_hook('bbpa_geoip_initial_update');
    }
    /**
     * Fires before core plugin deactivation cleanup finishes so edition-specific runtime can clear lifecycle work.
     */
    do_action('bbpa_before_plugin_deactivation');
    delete_option(BBPA_AGGREGATION_INTERVAL_OPTION);
    delete_option(BBPA_GEOIP_RETRY_STATE_OPTION);
    delete_transient(BBPA_GEOIP_RETRY_LOCK_TRANSIENT);
    bbpa_refresh_rewrite_rules_for_lifecycle();
}
