<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Shared helpers for the REST controllers.
 *
 * Query normalization (date ranges, pagination, sorting), cache keys and payload caching,
 * panel permission checks, schema probes and small formatting helpers used by several
 * controllers. Controllers keep their own methods as thin wrappers, so their public and
 * protected methods stay available to extending classes.
 */
class BBPA_REST_Query_Helpers {
    private const ALLOWED_SORT_DIRECTIONS = ['ASC', 'DESC'];

    /**
     * Longest accepted inclusive day range.
     *
     * The admin UI caps custom ranges at 730 days; its 24-month preset spans 731 days when the
     * window contains February 29, so one extra day is accepted for that preset.
     */
    private const MAX_DAY_RANGE_DAYS = 731;

    public static function get_date_range_args(): array {
        return [
            'start' => [
                'required' => false,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'end' => [
                'required' => false,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ];
    }

    public static function get_pagination_args(string $default_orderby = 'hits'): array {
        return [
            'page' => [
                'required' => false,
                'type' => 'integer',
                'default' => 1,
                'sanitize_callback' => 'absint',
            ],
            'per_page' => [
                'required' => false,
                'type' => 'integer',
                'default' => 10,
                'sanitize_callback' => 'absint',
            ],
            'orderby' => [
                'required' => false,
                'type' => 'string',
                'default' => $default_orderby,
                'sanitize_callback' => 'sanitize_key',
            ],
            'order' => [
                'required' => false,
                'type' => 'string',
                'default' => 'desc',
                'sanitize_callback' => 'sanitize_key',
            ],
            'search' => [
                'required' => false,
                'type' => 'string',
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'page_path' => [
                'required' => false,
                'type' => 'string',
                'default' => '',
                'sanitize_callback' => 'bbpa_sanitize_rest_page_path_arg',
            ],
            'exclude_zero' => [
                'required' => false,
                'type' => 'boolean',
                'default' => false,
                'sanitize_callback' => 'rest_sanitize_boolean',
            ],
        ];
    }

    public static function normalize_day_range(WP_REST_Request $request): array {
        $default_end = bbpa_get_site_date();
        $default_start = bbpa_get_site_date(-29);

        $start = sanitize_text_field((string) $request->get_param('start'));
        $end = sanitize_text_field((string) $request->get_param('end'));

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !self::is_valid_day_value($start)) {
            $start = $default_start;
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || !self::is_valid_day_value($end)) {
            $end = $default_end;
        }

        if (
            strtotime($start) > strtotime($end)
            || self::get_day_span($start, $end) > self::MAX_DAY_RANGE_DAYS
        ) {
            $start = $default_start;
            $end = $default_end;
        }

        return [
            'start' => $start,
            'end' => $end,
        ];
    }

    /**
     * Resolve an hourly datetime range (`Y-m-d H:i:s`) with the last 24 hours as default.
     *
     * Invalid values, reversed bounds and ranges longer than the day-range cap fall back to
     * the default range, like normalize_day_range().
     *
     * @return array{start: string, end: string}
     */
    public static function normalize_hour_range(WP_REST_Request $request): array {
        $now = time();
        $default_end = wp_date('Y-m-d H:00:00', $now);
        $default_start = wp_date('Y-m-d H:00:00', $now - (23 * HOUR_IN_SECONDS));

        $start = sanitize_text_field((string) $request->get_param('start'));
        $end = sanitize_text_field((string) $request->get_param('end'));

        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $start) || !self::is_valid_hour_value($start)) {
            $start = $default_start;
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $end) || !self::is_valid_hour_value($end)) {
            $end = $default_end;
        }

        if (
            strtotime($start) > strtotime($end)
            || (strtotime($end) - strtotime($start)) > (self::MAX_DAY_RANGE_DAYS * DAY_IN_SECONDS)
        ) {
            $start = $default_start;
            $end = $default_end;
        }

        return [
            'start' => $start,
            'end' => $end,
        ];
    }

    public static function normalize_search_term(WP_REST_Request $request): string {
        return trim(sanitize_text_field((string) $request->get_param('search')));
    }

    public static function normalize_page_path_filter(WP_REST_Request $request): string {
        return trim(sanitize_text_field((string) $request->get_param('page_path')));
    }

    private static function is_valid_day_value(string $value): bool {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, wp_timezone());
        $errors = DateTimeImmutable::getLastErrors();

        return $date instanceof DateTimeImmutable
            && $date->format('Y-m-d') === $value
            && (!is_array($errors) || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }

    private static function is_valid_hour_value(string $value): bool {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, wp_timezone());
        $errors = DateTimeImmutable::getLastErrors();

        return $date instanceof DateTimeImmutable
            && $date->format('Y-m-d H:i:s') === $value
            && (!is_array($errors) || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }

    private static function get_day_span(string $start, string $end): int {
        $start_timestamp = strtotime($start);
        $end_timestamp = strtotime($end);

        return (int) round(($end_timestamp - $start_timestamp) / DAY_IN_SECONDS) + 1;
    }


    public static function normalize_pagination(WP_REST_Request $request, int $default_per_page = 10, int $max_per_page = 1000): array {
        $page = absint($request->get_param('page'));
        if ($page < 1) {
            $page = 1;
        }

        $per_page = absint($request->get_param('per_page'));
        if ($per_page < 1) {
            $per_page = $default_per_page;
        }

        $per_page = min($per_page, $max_per_page);

        return [
            'page' => $page,
            'per_page' => $per_page,
            'offset' => ($page - 1) * $per_page,
        ];
    }

    public static function normalize_sorting(WP_REST_Request $request, array $allowed_orderby, string $default): array {
        $orderby_key = sanitize_key((string) $request->get_param('orderby'));
        if (!isset($allowed_orderby[$orderby_key])) {
            $orderby_key = $default;
        }

        // Never build an ORDER BY clause from a default key that the allowlist does not map.
        if (!isset($allowed_orderby[$orderby_key])) {
            $orderby_key = (string) array_key_first($allowed_orderby);
        }

        $order = strtoupper(sanitize_key((string) $request->get_param('order')));
        if (!in_array($order, self::ALLOWED_SORT_DIRECTIONS, true)) {
            $order = 'DESC';
        }

        return [
            'orderby_key' => $orderby_key,
            'orderby' => $allowed_orderby[$orderby_key],
            'order' => $order,
        ];
    }

    public static function build_cache_key(string $prefix, string $endpoint, array $params): string {
        $payload = [
            'endpoint' => $endpoint,
            'params' => $params,
            'version' => defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown',
        ];

        return bbpa_get_admin_cache_key($prefix . md5(wp_json_encode($payload)));
    }

    public static function build_limit_offset_sql(int $per_page, int $offset): string {
        return ' LIMIT ' . (int) $per_page . ' OFFSET ' . (int) $offset;
    }

    /**
     * Permission check of a panel-scoped analytics route.
     *
     * Order: request nonce, logged-in user, opt-in disabled-panel policy, then panel capability.
     *
     * @return true|WP_Error
     */
    public static function check_panel_permissions(WP_REST_Request $request, string $panel) {
        if (!bbpa_rest_request_has_valid_nonce($request)) {
            return self::build_authentication_error();
        }

        if (!is_user_logged_in()) {
            return self::build_authentication_error();
        }

        if (self::is_panel_endpoint_blocked($panel)) {
            return new WP_Error(
                'bbpa_admin_panel_disabled',
                __('This analytics panel is disabled for navigation.', 'bimbeau-privacy-analytics'),
                ['status' => 403]
            );
        }

        if (!self::current_user_can_access_panel($panel)) {
            return self::build_authentication_error();
        }

        return true;
    }

    /**
     * Whether the routes of a panel hidden by `bbpa_user_hidden_panels` are blocked.
     *
     * Blocking is opt-in through `bbpa_block_disabled_panel_endpoints`; the dashboard is never blocked.
     */
    public static function is_panel_endpoint_blocked(string $panel): bool {
        if ($panel === '' || $panel === 'dashboard') {
            return false;
        }

        $should_block = (bool) apply_filters(
            'bbpa_block_disabled_panel_endpoints',
            false,
            $panel
        );

        if (!$should_block || !function_exists('bbpa_get_settings')) {
            return false;
        }

        $settings = bbpa_get_settings();
        $hidden_by_policy = apply_filters('bbpa_user_hidden_panels', [], $settings);
        $hidden_by_policy = is_array($hidden_by_policy) ? $hidden_by_policy : [];

        return in_array($panel, $hidden_by_policy, true);
    }

    /**
     * Normalized authentication error used by the admin and app clients.
     */
    public static function build_authentication_error(): WP_Error {
        return new WP_Error(
            'bbpa_auth_required',
            __('Authentication is required to access analytics data.', 'bimbeau-privacy-analytics'),
            [
                'status' => 401,
                'auth' => 'required',
            ]
        );
    }

    /**
     * Whether the current user can open a panel (global access and panel capability).
     */
    public static function current_user_can_access_panel(string $panel): bool {
        if (function_exists('bbpa_current_user_can_access_panel')) {
            return bbpa_current_user_can_access_panel($panel);
        }

        return current_user_can(self::get_panel_capability($panel));
    }

    /**
     * Capability required by a panel, `manage_options` when none resolves.
     */
    public static function get_panel_capability(string $panel = 'dashboard'): string {
        if (function_exists('bbpa_get_panel_capability')) {
            $capability = bbpa_get_panel_capability($panel);
        } else {
            $capability = apply_filters('bbpa_admin_capability', 'manage_options');
        }

        return is_string($capability) && $capability !== '' ? $capability : 'manage_options';
    }

    /**
     * Whether the plugin debug mode is enabled.
     */
    public static function is_debug_mode_enabled(): bool {
        if (function_exists('bbpa_is_debug_mode_enabled')) {
            return bbpa_is_debug_mode_enabled();
        }

        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];

        return !empty($settings['debug_enabled']);
    }

    /**
     * Read a cached response payload from the object cache group, then from its transient.
     */
    public static function get_cached_payload(string $cache_key, string $cache_group): ?array {
        $cached = wp_cache_get($cache_key, $cache_group);
        if (is_array($cached)) {
            return $cached;
        }

        $cached = get_transient($cache_key);

        return is_array($cached) ? $cached : null;
    }

    /**
     * Store a response payload in the object cache group and, when persisted, as a transient.
     *
     * @param int  $ttl     Lifetime in seconds, already resolved by the controller; nothing is stored when it is not positive.
     * @param bool $persist Whether the payload is also stored as a transient. Free-text searches only use the
     *                      object cache, so they cannot fill the options table with one transient per typed term.
     */
    public static function set_cached_payload(string $cache_key, array $payload, string $cache_group, int $ttl, bool $persist = true): void {
        if ($ttl <= 0) {
            return;
        }

        wp_cache_set($cache_key, $payload, $cache_group, $ttl);
        if ($persist) {
            set_transient($cache_key, $payload, $ttl);
        }
    }

    /**
     * Whether a database table exists, through the canonical schema helper.
     *
     * bbpa_table_exists() escapes the LIKE pattern and compares names case-insensitively.
     */
    public static function table_exists(string $table): bool {
        if ($table === '') {
            return false;
        }

        if (function_exists('bbpa_table_exists')) {
            return bbpa_table_exists($table);
        }

        global $wpdb;
        $result = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($table)));

        return is_string($result) && strcasecmp($result, $table) === 0;
    }

    /**
     * List the site-timezone days (`Y-m-d`) of an inclusive day range.
     *
     * @return array<int, string>
     */
    public static function get_day_buckets(string $start, string $end): array {
        $timezone = wp_timezone();
        $start_date = new DateTimeImmutable($start, $timezone);
        $end_date = new DateTimeImmutable($end, $timezone);

        $period = new DatePeriod(
            $start_date,
            new DateInterval('P1D'),
            $end_date->modify('+1 day')
        );

        $buckets = [];
        foreach ($period as $date) {
            $buckets[] = $date->format('Y-m-d');
        }

        return $buckets;
    }

    /**
     * Map an exact `WIDTHxHEIGHT` viewport value to its coarse report bucket.
     *
     * Bucket values are returned unchanged; other unparsable values are returned trimmed.
     */
    public static function normalize_screen_resolution_bucket(string $screen_resolution): string {
        $screen_resolution = trim($screen_resolution);
        if ($screen_resolution === '') {
            return '';
        }

        $allowed_buckets = [
            '0-480px',
            '481-768px',
            '769-1024px',
            '1025-1440px',
            '1441px+',
        ];
        if (in_array($screen_resolution, $allowed_buckets, true)) {
            return $screen_resolution;
        }

        if (!preg_match('/^(\d{1,5})x(\d{1,5})$/', $screen_resolution, $matches)) {
            return $screen_resolution;
        }

        $width = absint($matches[1]);
        if ($width <= 0) {
            return '';
        }

        if ($width <= 480) {
            return '0-480px';
        }
        if ($width <= 768) {
            return '481-768px';
        }
        if ($width <= 1024) {
            return '769-1024px';
        }
        if ($width <= 1440) {
            return '1025-1440px';
        }

        return '1441px+';
    }
}
