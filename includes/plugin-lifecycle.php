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
            'bpa_geoip_retry_state' => 'bbpa_geoip_retry_state',
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



function bbpa_log_prefix_migration(string $message, array $context = []): void
{
    if (function_exists('error_log')) {
        error_log('[BBPA prefix migration] ' . $message . ($context ? ' ' . wp_json_encode($context) : ''));
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
 * Plugin activation tasks.
 */
function bbpa_activate(bool $network_wide = false, bool $allow_redirect = true): void
{
    bbpa_run_legacy_prefix_migration();
    bbpa_with_suppressed_db_errors(static function (): void {
        bbpa_install_schema();
    });
    bbpa_register_raw_logs_option();
    bbpa_register_settings_option();
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

    flush_rewrite_rules();
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
 * Run one-time upgrade migrations.
 */
function bbpa_maybe_run_upgrades(): void
{
    bbpa_run_legacy_prefix_migration();
    bbpa_maybe_install_schema();
    bbpa_register_settings_option();
    bbpa_migrate_existing_settings_for_setup_wizard();
    bbpa_backfill_marketing_query_allowlist();
    bbpa_run_legacy_privacy_options_cleanup();
    bbpa_with_suppressed_db_errors(static function (): void {
        bbpa_run_db_migrations();
    });

    if (function_exists('bbpa_get_geoip_update_frequency') && bbpa_get_geoip_update_frequency() === 'disabled' && function_exists('bbpa_clear_geoip_update_schedule')) {
        bbpa_clear_geoip_update_schedule();
    }

    /**
     * Fires after core plugin upgrade tasks complete so edition-specific runtime can attach lifecycle work.
     */
    do_action('bbpa_after_plugin_upgrade');
}


/**
 * Cleanup plugin data after Freemius uninstall when explicitly enabled in settings.
 */
function bbpa_after_uninstall_cleanup(): void
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
        'bbpa_event_occurrences',
        'bbpa_event_actions_daily',
        'bbpa_events_daily',
    ];

    foreach ($table_suffixes as $table_suffix) {
        $table_name = $wpdb->prefix . $table_suffix;
        $wpdb->query("DROP TABLE IF EXISTS `{$table_name}`"); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table names are from a static allowlist.
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
 */
function bbpa_deactivate(): void
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
    flush_rewrite_rules();
}
