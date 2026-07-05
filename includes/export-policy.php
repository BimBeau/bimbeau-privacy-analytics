<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Central export policy for file-oriented analytics outputs.
 */
class BBPA_Export_Policy {
    public const MODE_AGGREGATE = 'aggregate';
    public const MODE_VISITOR_DETAIL = 'visitor_detail';

    /**
     * Resolve the export mode for a report key.
     */
    public static function get_report_mode(string $report_key): string {
        return $report_key === 'visitors' ? self::MODE_VISITOR_DETAIL : self::MODE_AGGREGATE;
    }

    /**
     * Check whether the report is handled by the export policy.
     */
    public static function is_supported_report(string $report_key): bool {
        return array_key_exists($report_key, self::get_default_columns_by_report());
    }

    /**
     * Check whether a report export requires Pro access.
     */
    public static function requires_pro(string $report_key): bool {
        return self::is_supported_report($report_key);
    }

    /**
     * Return the allowlisted export columns as internal key => stable CSV label.
     */
    public static function get_allowed_columns(string $report_key, array $context = []): array {
        $columns_by_report = self::get_default_columns_by_report();
        $columns = $columns_by_report[$report_key] ?? [];
        $context = array_merge(
            [
                'report' => $report_key,
                'mode' => self::get_report_mode($report_key),
            ],
            $context
        );

        /**
         * Filter the export column allowlist for a report.
         *
         * Extensions may add columns that they also add to the report payload. Sensitive
         * keys remain denied after the filter is applied.
         *
         * @param array<string,string>|list<string> $columns Internal column keys mapped to stable CSV labels.
         * @param array<string,mixed>              $context Export context with report and mode keys.
         */
        $columns = apply_filters('bbpa_export_allowed_columns', $columns, $context);

        return self::sanitize_columns(is_array($columns) ? $columns : []);
    }

    /**
     * Return sensitive keys that are never exportable through the policy.
     */
    public static function get_denied_sensitive_columns(): array {
        return [
            'ip',
            'ip_address',
            'client_ip',
            'remote_addr',
            'user_id',
            'user_login',
            'user_name',
            'username',
            'display_name',
            'email',
            'user_email',
            'full_referrer_url',
            'referrer_url',
            'query_string',
            'raw_query',
            'cookie',
            'cookies',
            'session_id',
            'raw_payload',
            'payload',
            'headers',
            'authorization',
        ];
    }

    /**
     * Sanitize filtered column definitions and remove denied sensitive keys.
     */
    private static function sanitize_columns(array $columns): array {
        $denied = array_fill_keys(self::get_denied_sensitive_columns(), true);
        $sanitized = [];

        foreach ($columns as $key => $label) {
            if (is_int($key)) {
                $key = $label;
                $label = self::build_label_from_key((string) $key);
            }

            $key = sanitize_key((string) $key);
            if ($key === '' || isset($denied[$key])) {
                continue;
            }

            $label = trim(wp_strip_all_tags((string) $label));
            if ($label === '') {
                $label = self::build_label_from_key($key);
            }

            $sanitized[$key] = $label;
        }

        return $sanitized;
    }

    /**
     * Build a readable fallback label for extension-provided keys.
     */
    private static function build_label_from_key(string $key): string {
        return ucwords(str_replace('_', ' ', $key));
    }

    /**
     * Default export policy by report.
     *
     * Report exports are Pro-only and use mode-specific column allowlists.
     */
    private static function get_default_columns_by_report(): array {
        $columns = [
            'top-pages' => [
                'label' => 'Page path',
                'page_title' => 'Page title',
                'hits' => 'Page views',
                'avg_time_on_page_ms' => 'Average active time (ms)',
                'avg_time_on_page_seconds' => 'Average active time (seconds)',
            ],
            'referrers' => [
                'label' => 'Referrer domain',
                'hits' => 'Page views',
                'visits' => 'Visits',
            ],
            'referrer-sources' => [
                'referrer_domain' => 'Referrer domain',
                'source_category' => 'Source category',
                'label' => 'Source',
                'hits' => 'Page views',
                'visits' => 'Visits',
            ],
            'acquisition-channels' => [
                'channel' => 'Channel',
                'key' => 'Channel key',
                'visits' => 'Visits',
                'share' => 'Traffic share (%)',
            ],
            '404s' => [
                'label' => 'Page path',
                'page_title' => 'Page title',
                'hits' => 'Page views',
            ],
            'search-terms' => [
                'label' => 'Search term',
                'hits' => 'Searches',
            ],
            'geo-countries' => [
                'label' => 'Country',
                'country_code' => 'Country code',
                'hits' => 'Page views',
                'visitors' => 'Visitors',
                'visits' => 'Legacy visits',
            ],
            'entry-pages' => [
                'label' => 'Page path',
                'page_title' => 'Page title',
                'entries' => 'Entries',
            ],
            'exit-pages' => [
                'label' => 'Page path',
                'page_title' => 'Page title',
                'exits' => 'Exits',
            ],
            'events' => [
                'event_label' => 'Event label',
                'event_id' => 'Event ID',
                'last_triggered_at' => 'Event time',
                'trigger_type' => 'Trigger type',
                'page_path' => 'Triggered page',
                'source_category' => 'Channel',
                'status' => 'Status',
                'execution_status' => 'Execution status',
                'country_code' => 'Country code',
                'country' => 'Country',
                'city' => 'City',
                'operating_system' => 'Operating system',
                'browser' => 'Browser',
                'device_class' => 'Device class',
                'screen_resolution' => 'Viewport bucket',
                'count' => 'Occurrences',
            ],
            'visitors' => [
                'visitor_id' => 'Visitor ID',
                'country_code' => 'Country code',
                'country' => 'Country',
                'city' => 'City',
                'page_views' => 'Page views',
                'active_time_ms' => 'Active time (ms)',
                'referrer_domain' => 'Referrer domain',
                'source_category' => 'Channel',
                'browser' => 'Browser',
                'browser_version' => 'Browser version',
                'device_class' => 'Device class',
                'operating_system' => 'Operating system',
                'screen_resolution' => 'Viewport bucket',
                'entry_page' => 'Entry page',
                'exit_page' => 'Exit page',
                'first_view_at' => 'First activity timestamp',
                'last_view_at' => 'Last activity timestamp',
            ],
        ];

        return apply_filters('bbpa_export_default_columns_by_report', $columns);
    }
}
