<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * REST controller for admin analytics queries.
 */


class BBPA_Admin_Controller extends WP_REST_Controller {
    private ?BBPA_Analytics_Repository $analytics_repository = null;

    private function analytics_repository(): BBPA_Analytics_Repository {
        if ($this->analytics_repository === null) {
            $this->analytics_repository = new BBPA_Analytics_Repository();
        }

        return $this->analytics_repository;
    }
    /**
     * Register routes for admin analytics.
     */
    public function register_routes(): void {
        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/settings',
            [
                [
                    'methods' => 'GET',
                    'callback' => [$this, 'get_settings'],
                    'permission_callback' => [$this, 'check_settings_permissions'],
                ],
                [
                    'methods' => 'POST',
                    'callback' => [$this, 'update_settings'],
                    'permission_callback' => [$this, 'check_settings_permissions'],
                ],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/geolocation',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_geolocation'],
                'permission_callback' => [$this, 'check_geolocation_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/maxmind-test',
            [
                'methods' => 'POST',
                'callback' => [$this, 'test_maxmind_connection'],
                'permission_callback' => [$this, 'check_settings_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/geoip-database/update',
            [
                'methods' => 'POST',
                'callback' => [$this, 'update_geoip_database'],
                'permission_callback' => [$this, 'check_settings_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/geoip-database/status',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_geoip_database_status'],
                'permission_callback' => [$this, 'check_settings_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/setup-wizard',
            [
                [
                    'methods' => 'GET',
                    'callback' => [$this, 'get_setup_wizard'],
                    'permission_callback' => [$this, 'check_settings_permissions'],
                ],
                [
                    'methods' => 'POST',
                    'callback' => [$this, 'update_setup_wizard'],
                    'permission_callback' => [$this, 'check_settings_permissions'],
                    'args' => [
                        'action' => ['required' => true, 'type' => 'string', 'sanitize_callback' => 'sanitize_key'],
                        'step' => ['required' => false, 'type' => 'string', 'sanitize_callback' => 'sanitize_key'],
                        'choice' => ['required' => false, 'type' => 'string', 'sanitize_callback' => 'sanitize_key'],
                        'value' => ['required' => false, 'type' => 'boolean', 'sanitize_callback' => 'rest_sanitize_boolean'],
                    ],
                ],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/realtime',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_realtime_snapshot'],
                'permission_callback' => [$this, 'check_realtime_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/raw-logs',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_raw_logs'],
                'permission_callback' => [$this, 'check_realtime_permissions'],
                'args' => [
                    'limit' => [
                        'required' => false,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                        'default' => 50,
                    ],
                ],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/purge-data',
            [
                'methods' => 'POST',
                'callback' => [$this, 'purge_data'],
                'permission_callback' => [$this, 'check_settings_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/purge-aggregated-data',
            [
                'methods' => 'POST',
                'callback' => [$this, 'purge_aggregated_data'],
                'permission_callback' => [$this, 'check_settings_permissions'],
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/kpis',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_kpis'],
                'permission_callback' => [$this, 'check_permissions'],
                'args' => $this->get_date_range_args(),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/top-pages',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_top_pages'],
                'permission_callback' => [$this, 'check_top_pages_permissions'],
                'args' => array_merge(
                    $this->get_date_range_args(),
                    [
                        'page' => [
                            'required' => false,
                            'type' => 'integer',
                            'sanitize_callback' => 'absint',
                            'default' => 1,
                        ],
                        'per_page' => [
                            'required' => false,
                            'type' => 'integer',
                            'sanitize_callback' => 'absint',
                            'default' => 10,
                        ],
                        'search' => [
                            'required' => false,
                            'type' => 'string',
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'orderby' => [
                            'required' => false,
                            'type' => 'string',
                            'sanitize_callback' => 'sanitize_key',
                            'default' => 'hits',
                        ],
                        'order' => [
                            'required' => false,
                            'type' => 'string',
                            'sanitize_callback' => 'sanitize_key',
                            'default' => 'desc',
                        ],
                        'limit' => [
                            'required' => false,
                            'type' => 'integer',
                            'sanitize_callback' => 'absint',
                            'default' => 10,
                        ],
                    ]
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/referrers',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_referrers'],
                'permission_callback' => [$this, 'check_referrers_permissions'],
                'args' => array_merge(
                    $this->get_date_range_args(),
                    [
                        'limit' => [
                            'required' => false,
                            'type' => 'integer',
                            'sanitize_callback' => 'absint',
                            'default' => 10,
                        ],
                    ]
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/hourly-heatmap-global',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_global_hourly_heatmap'],
                'permission_callback' => [$this, 'check_permissions'],
                'args' => $this->get_date_range_args(),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/timeseries/day',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_timeseries_day'],
                'permission_callback' => [$this, 'check_permissions'],
                'args' => $this->get_date_range_args(),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/timeseries/hour',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_timeseries_hour'],
                'permission_callback' => [$this, 'check_permissions'],
                'args' => $this->get_datetime_range_args(),
            ]
        );


        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/device-split',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_device_split'],
                'permission_callback' => [$this, 'check_permissions'],
                'args' => $this->get_date_range_args(),
            ]
        );

        register_rest_route(
            BBPA_REST_INTERNAL_NAMESPACE,
            '/admin/favicon',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_favicon'],
                'permission_callback' => [$this, 'check_referrers_permissions'],
                'args' => [
                    'domain' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ]
        );

        register_rest_route(BBPA_REST_INTERNAL_NAMESPACE, '/admin/favicons', [
            'methods' => 'GET',
            'callback' => [$this, 'get_favicons'],
            'permission_callback' => [$this, 'check_referrers_permissions'],
            'args' => ['domains' => ['required' => true, 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field']],
        ]);

    }

    /**
     * Permission check for admin analytics endpoints.
     */
    public function check_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'dashboard');
    }

    /**
     * Permission check for settings endpoints.
     */
    public function check_settings_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'settings');
    }

    /**
     * Permission check for realtime endpoints.
     */
    public function check_realtime_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'realtime');
    }

    /**
     * Permission check for geolocation endpoints.
     */
    public function check_geolocation_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'geolocation');
    }

    /**
     * Permission check for top pages endpoints.
     */
    public function check_top_pages_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'top-pages');
    }

    /**
     * Permission check for referrer endpoints.
     */
    public function check_referrers_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'referrers');
    }

    /**
     * Permission check for panel-scoped admin analytics endpoints.
     *
     * @return true|WP_Error
     */
    private function check_permissions_for_panel(WP_REST_Request $request, string $panel) {
        return BBPA_REST_Query_Helpers::check_panel_permissions($request, $panel);
    }

    /**
     * KPIs aggregation.
     */
    public function get_kpis(WP_REST_Request $request): WP_REST_Response {
        $range = $this->get_day_range($request);
        $cache_key = $this->get_cache_key('kpis', $range);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $rows = $this->analytics_repository()->get_kpis_rows($range['start'], $range['end']);
        $page_views = (int) $rows['page_views'];
        // Canonical visits when overview rows exist, otherwise the entry totals used by the overview and the daily
        // timeseries, and only then the per-page visits of bbpa_daily.
        $visits = isset($rows['entries']) ? (int) $rows['entries'] : 0;
        if ($visits <= 0) {
            $visits = isset($rows['aggregated_visits']) ? (int) $rows['aggregated_visits'] : 0;
        }

        $data = [
            'entries' => $visits,
            'visits' => $visits,
            'pageViews' => $page_views,
            'uniqueReferrers' => $rows['unique_referrers'],
        ];

        $payload = [
            'range' => $range,
            'kpis' => $data,
        ];

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }


    /**
     * Resolve available granularities from persisted datasets.
     */
    private function get_available_granularities(): array {
        $granularities = [];
        if ($this->analytics_repository()->has_daily_data()) {
            $granularities[] = 'base';
        }

        $persisted_granularity = get_option('bbpa_persisted_granularity', '');
        if ($persisted_granularity === 'enriched') {
            $granularities[] = 'enriched';
        }

        if ($granularities === []) {
            return ['unknown'];
        }

        return array_values(array_unique($granularities));
    }

    /**
     * Return current settings.
     *
     * The stored MaxMind license key is never returned: see bbpa_prepare_settings_for_rest_response().
     */
    public function get_settings(WP_REST_Request $request): WP_REST_Response {
        $settings = bbpa_prepare_settings_for_rest_response(bbpa_get_settings());

        return $this->build_admin_response(
            [
                'settings' => $settings,
                'availableGranularities' => $this->get_available_granularities(),
                'cacheVersion' => bbpa_get_admin_cache_version(),
                'fieldVisibilityMatrix' => function_exists('bbpa_get_ui_field_visibility_matrix') ? bbpa_get_ui_field_visibility_matrix() : [],
            ],
            200,
            true
        );
    }

    /**
     * Update settings.
     *
     * Partial update: keys omitted from the JSON body keep their stored value.
     *
     * @return WP_REST_Response|WP_Error WP_Error (HTTP 400 with `field_errors`) when validation fails.
     */
    public function update_settings(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = [];
        }

        $settings = bbpa_update_settings($payload);
        if (is_wp_error($settings)) {
            return $settings;
        }

        return $this->build_admin_response(
            [
                'settings' => bbpa_prepare_settings_for_rest_response($settings),
                'availableGranularities' => $this->get_available_granularities(),
                'cacheVersion' => bbpa_get_admin_cache_version(),
                'fieldVisibilityMatrix' => function_exists('bbpa_get_ui_field_visibility_matrix') ? bbpa_get_ui_field_visibility_matrix() : [],
            ],
            200,
            true
        );
    }

    /**
     * Return server-side geolocation for the current visitor IP.
     */
    public function get_geolocation(WP_REST_Request $request): WP_REST_Response {
        $payload = bbpa_get_geolocation_payload();

        return $this->build_admin_response(
            [
                'location' => $payload,
            ],
            200,
            true
        );
    }

    /**
     * Test MaxMind connection with provided credentials.
     */
    public function test_maxmind_connection(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = [];
        }

        // Omitted credentials (and the masked license key returned by GET /admin/settings)
        // fall back to the stored values, so the saved key never has to leave the server.
        $stored_settings = bbpa_get_settings();
        $account_id = array_key_exists('maxmind_account_id', $payload) && is_scalar($payload['maxmind_account_id'])
            ? trim(sanitize_text_field((string) $payload['maxmind_account_id']))
            : trim((string) ($stored_settings['maxmind_account_id'] ?? ''));
        $license_key = array_key_exists('maxmind_license_key', $payload) && is_scalar($payload['maxmind_license_key'])
            && !bbpa_is_masked_maxmind_license_key($payload['maxmind_license_key'])
            ? trim(sanitize_text_field((string) $payload['maxmind_license_key']))
            : trim((string) ($stored_settings['maxmind_license_key'] ?? ''));

        $errors = bbpa_validate_maxmind_credentials($account_id, $license_key);
        if ($errors) {
            return new WP_Error(
                'bbpa_invalid_maxmind_credentials',
                bbpa_format_maxmind_errors($errors),
                [
                    'status' => 400,
                    'field_errors' => $errors,
                ]
            );
        }

        $service = bbpa_get_maxmind_service();
        $result = $service->lookup('8.8.8.8', $account_id, $license_key);
        if (!empty($result['error'])) {
            return new WP_Error(
                'bbpa_maxmind_connection_failed',
                (string) $result['error'],
                [
                    'status' => 400,
                    'details' => $result['details'] ?? [],
                ]
            );
        }

        return new WP_REST_Response(
            [
                'ok' => true,
                'message' => __('MaxMind connection succeeded.', 'bimbeau-privacy-analytics'),
            ],
            200
        );
    }

    /**
     * Update the local GeoIP database from MaxMind.
     */
    public function update_geoip_database(WP_REST_Request $request): WP_REST_Response {
        // Same updater as the scheduled update (filter `bbpa_geoip_database_updater`).
        $updater = bbpa_get_geoip_database_updater();
        $result = $updater->update_database();

        if (is_wp_error($result)) {
            return $this->build_admin_response(
                [
                    'ok' => false,
                    'message' => $result->get_error_message(),
                    'status' => 'error',
                ],
                400,
                true
            );
        }

        return $this->build_admin_response(
            [
                'ok' => true,
                'message' => __('GeoIP database updated successfully.', 'bimbeau-privacy-analytics'),
                'status' => 'success',
            ],
            200,
            true
        );
    }

    /**
     * Return GeoIP database status payload for admin UI.
     */
    public function get_geoip_database_status(WP_REST_Request $request): WP_REST_Response {
        $updater = bbpa_get_geoip_database_updater();
        $database_status = $updater->get_database_status();

        $payload = [
            'ok' => (bool) ($database_status['operational'] ?? false),
            'status' => isset($database_status['status'])
                ? sanitize_key((string) $database_status['status'])
                : (!empty($database_status['operational']) ? 'success' : 'pending'),
            'message' => !empty($database_status['message'])
                ? sanitize_text_field((string) $database_status['message'])
                : (!empty($database_status['operational'])
                    ? __('GeoIP database is available.', 'bimbeau-privacy-analytics')
                    : __('GeoIP database is not available yet.', 'bimbeau-privacy-analytics')),
            'database' => [
                'exists' => (bool) ($database_status['exists'] ?? false),
                'readable' => (bool) ($database_status['readable'] ?? false),
                'file_size' => (int) ($database_status['file_size'] ?? 0),
                'last_updated' => (int) ($database_status['last_updated'] ?? 0),
                'last_attempt_at' => (int) ($database_status['last_attempt_at'] ?? 0),
                'last_success_at' => (int) ($database_status['last_success_at'] ?? 0),
                'last_error_code' => isset($database_status['last_error_code'])
                    ? sanitize_key((string) $database_status['last_error_code'])
                    : '',
                'retry_count' => (int) ($database_status['retry_count'] ?? 0),
                'next_scheduled' => function_exists('bbpa_get_geoip_next_scheduled_run')
                    ? bbpa_get_geoip_next_scheduled_run()
                    : 0,
                'operational' => (bool) ($database_status['operational'] ?? false),
                'local_available' => (bool) ($database_status['local_available'] ?? false),
                'status' => isset($database_status['status']) ? sanitize_key((string) $database_status['status']) : 'pending',
                'message' => isset($database_status['message']) ? sanitize_text_field((string) $database_status['message']) : '',
            ],
        ];

        return $this->build_admin_response($payload, 200, true);
    }

    /**
     * Return latest raw logs when raw logs are enabled.
     */
    public function get_raw_logs(WP_REST_Request $request): WP_REST_Response {
        $limit = $this->normalize_limit($request->get_param('limit'));
        $hits = bbpa_get_raw_log_rows(0, $limit);
        $hits = array_values(
            array_filter(
                $hits,
                static function ($hit): bool {
                    return is_array($hit);
                }
            )
        );
        $hits = array_reverse($hits);
        $hits = array_slice($hits, 0, $limit);

        $items = array_map(
            static function (array $hit): array {
                $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
                $post_id = isset($hit['post_id']) ? absint($hit['post_id']) : 0;

                $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
                $visitor_hash = $visit_id !== '' ? substr(hash('sha256', $visit_id), 0, 12) : '';

                return [
                    'timestamp_bucket' => $timestamp,
                    'page_path' => isset($hit['page_path']) ? bbpa_sanitize_page_path_value((string) $hit['page_path']) : '',
                    'referrer_domain' => isset($hit['referrer_domain'])
                        ? sanitize_text_field((string) $hit['referrer_domain'])
                        : '',
                    'device_class' => isset($hit['device_class'])
                        ? sanitize_key((string) $hit['device_class'])
                        : '',
                    'post_id' => $post_id > 0 ? $post_id : null,
                    'visitor_hash' => $visitor_hash,
                ];
            },
            $hits
        );

        return $this->build_admin_response(
            [
                'items' => $items,
            ],
            200,
            true
        );
    }

    /**
     * Return a realtime snapshot of active visitors and geolocation points.
     */
    public function get_realtime_snapshot(WP_REST_Request $request): WP_REST_Response {
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $advanced_enabled = isset($settings['advanced_stats_enabled'])
            && rest_sanitize_boolean($settings['advanced_stats_enabled']);
        $essential_only_mode = !$advanced_enabled;

        $window_seconds = bbpa_get_visit_identifier_window_seconds();
        $now = current_time('timestamp', true);
        $window_start = max(0, $now - $window_seconds);
        $privacy_threshold = 10;

        // Bot hits stay out of visitor totals: the counter, the visit rows and the map only show human visits.
        $hits = $this->exclude_bot_realtime_rows(bbpa_get_raw_log_rows((int) $window_start));
        $realtime_visitors = $this->exclude_bot_realtime_rows($this->get_realtime_visitor_rows_in_window($window_start, $now));

        $has_enriched_granularity = $this->realtime_has_enriched_data($hits, $window_start, $now);
        if (!$has_enriched_granularity && $this->realtime_has_enriched_data($realtime_visitors, $window_start, $now)) {
            $has_enriched_granularity = true;
            $hits = $realtime_visitors;
        }

        $active_visitors_total = $this->count_active_visitors_from_realtime_source($realtime_visitors, $window_start, $now);


        if (!$has_enriched_granularity) {
            $latest_hit_by_visitor = [];
            $country_counts = [];
            $page_counts = [];
            $referrer_counts = [];
            $device_counts = [];
            $browser_counts = [];
            $operating_system_counts = [];

            $extract_referrer_domain = static function (string $raw_value): string {
                $candidate = trim($raw_value);
                if ($candidate === '') {
                    return '';
                }

                $parsed = wp_parse_url($candidate);
                if (is_array($parsed) && isset($parsed['host'])) {
                    return strtolower(sanitize_text_field((string) $parsed['host']));
                }

                $candidate = preg_replace('#^https?://#i', '', $candidate);
                $candidate = explode('/', (string) $candidate)[0] ?? '';
                $candidate = explode('?', (string) $candidate)[0] ?? '';

                return strtolower(sanitize_text_field((string) $candidate));
            };

            $normalize_browser_name = static function (string $browser): string {
                $normalized = strtolower(trim($browser));
                if ($normalized === '') {
                    return __('Unknown', 'bimbeau-privacy-analytics');
                }

                if (strpos($normalized, 'chrome') !== false) {
                    return 'Chrome';
                }
                if (strpos($normalized, 'safari') !== false && strpos($normalized, 'chrome') === false) {
                    return 'Safari';
                }
                if (strpos($normalized, 'firefox') !== false) {
                    return 'Firefox';
                }
                if (strpos($normalized, 'edge') !== false || strpos($normalized, 'edg') !== false) {
                    return 'Edge';
                }

                return ucfirst($normalized);
            };

            $normalize_operating_system_name = static function (string $operating_system): string {
                $normalized = strtolower(trim($operating_system));
                if ($normalized === '') {
                    return __('Unknown', 'bimbeau-privacy-analytics');
                }

                if (strpos($normalized, 'windows') !== false) {
                    return 'Windows';
                }
                if (strpos($normalized, 'mac') !== false || strpos($normalized, 'os x') !== false) {
                    return 'macOS';
                }
                if (strpos($normalized, 'ios') !== false || strpos($normalized, 'iphone') !== false || strpos($normalized, 'ipad') !== false) {
                    return 'iOS';
                }
                if (strpos($normalized, 'android') !== false) {
                    return 'Android';
                }

                return ucfirst($normalized);
            };

            foreach ($hits as $index => $hit) {
                if (!is_array($hit)) {
                    continue;
                }

                $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
                if ($timestamp < $window_start || $timestamp > $now) {
                    continue;
                }

                $visitor_id = $this->resolve_realtime_visitor_bucket_id($hit);
                if ($visitor_id === '') {
                    continue;
                }

                $page_path = isset($hit['page_path'])
                    ? bbpa_sanitize_page_path_value((string) $hit['page_path'])
                    : '';
                if ($page_path !== '') {
                    if (!isset($page_counts[$page_path])) {
                        $page_counts[$page_path] = 0;
                    }
                    $page_counts[$page_path] += 1;
                }

                $domain = $extract_referrer_domain(
                    isset($hit['referrer_domain']) ? (string) $hit['referrer_domain'] : ''
                );
                if ($domain !== '') {
                    if (!isset($referrer_counts[$domain])) {
                        $referrer_counts[$domain] = 0;
                    }
                    $referrer_counts[$domain] += 1;
                }

                $device = isset($hit['device_class'])
                    ? strtolower(sanitize_text_field((string) $hit['device_class']))
                    : '';
                if ($device === '') {
                    $device = strtolower(__('Unknown', 'bimbeau-privacy-analytics'));
                }
                if (!isset($device_counts[$device])) {
                    $device_counts[$device] = 0;
                }
                $device_counts[$device] += 1;

                $browser = $normalize_browser_name(
                    isset($hit['browser']) ? (string) $hit['browser'] : ''
                );
                if (!isset($browser_counts[$browser])) {
                    $browser_counts[$browser] = 0;
                }
                $browser_counts[$browser] += 1;

                $operating_system = $normalize_operating_system_name(
                    isset($hit['operating_system']) ? (string) $hit['operating_system'] : ''
                );
                if (!isset($operating_system_counts[$operating_system])) {
                    $operating_system_counts[$operating_system] = 0;
                }
                $operating_system_counts[$operating_system] += 1;

                $latest = $latest_hit_by_visitor[$visitor_id] ?? null;
                if (
                    !is_array($latest)
                    || $timestamp > (int) ($latest['timestamp'] ?? 0)
                    || (
                        $timestamp === (int) ($latest['timestamp'] ?? 0)
                        && $index > (int) ($latest['index'] ?? -1)
                    )
                ) {
                    $latest_hit_by_visitor[$visitor_id] = [
                        'timestamp' => $timestamp,
                        'index' => $index,
                        'country_code' => isset($hit['country_code'])
                            ? strtoupper(sanitize_text_field((string) $hit['country_code']))
                            : '',
                        'country' => isset($hit['country'])
                            ? sanitize_text_field((string) $hit['country'])
                            : '',
                    ];
                }
            }

            foreach ($latest_hit_by_visitor as $latest) {
                if (!is_array($latest)) {
                    continue;
                }

                $country_code = isset($latest['country_code'])
                    ? strtoupper(sanitize_text_field((string) $latest['country_code']))
                    : '';
                $country_label = isset($latest['country'])
                    ? sanitize_text_field((string) $latest['country'])
                    : '';
                if ($country_code === '') {
                    $country_code = 'ZZ';
                }
                if ($country_label === '') {
                    $country_label = __('Unknown country', 'bimbeau-privacy-analytics');
                }

                if (!isset($country_counts[$country_code])) {
                    $country_counts[$country_code] = [
                        'code' => $country_code,
                        'label' => $country_label,
                        'hits' => 0,
                    ];
                }
                $country_counts[$country_code]['hits'] += 1;
            }

            $build_threshold_items = static function (array $counts, string $label_key = 'label') use ($privacy_threshold): array {
                arsort($counts);
                $items = [];
                $others = 0;

                foreach ($counts as $label => $count) {
                    $count = (int) $count;
                    if ($count < $privacy_threshold) {
                        $others += $count;
                        continue;
                    }

                    $items[] = [
                        // Page paths keep their percent-encoded octets (`/caf%C3%A9`), which sanitize_text_field() strips.
                        $label_key => $label_key === 'url'
                            ? bbpa_sanitize_page_path_value((string) $label)
                            : sanitize_text_field((string) $label),
                        'count' => $count,
                    ];
                }

                return [
                    'items' => $items,
                    'others' => $others,
                ];
            };

            $countries = array_values($country_counts);
            usort(
                $countries,
                static function (array $left, array $right): int {
                    return ($right['hits'] ?? 0) <=> ($left['hits'] ?? 0);
                }
            );

            $visits = [];
            foreach ($latest_hit_by_visitor as $visitor_id => $latest_hit) {
                if (!is_array($latest_hit)) {
                    continue;
                }

                $last_view_at = isset($latest_hit['timestamp']) ? (int) $latest_hit['timestamp'] : 0;
                $visits[] = [
                    'visitor_id' => sanitize_text_field((string) $visitor_id),
                    'country_code' => isset($latest_hit['country_code']) ? sanitize_text_field((string) $latest_hit['country_code']) : '',
                    'country' => isset($latest_hit['country']) ? sanitize_text_field((string) $latest_hit['country']) : '',
                    'current_page' => '',
                    'page_views' => 1,
                    'referrer_domain' => '',
                    'operating_system' => '',
                    'browser' => '',
                    'browser_version' => '',
                    'device_class' => '',
                    'screen_resolution' => '',
                    'first_view_at' => $last_view_at,
                    'last_view_at' => $last_view_at,
                ];
            }

            usort(
                $visits,
                static function (array $left, array $right): int {
                    return ($right['last_view_at'] ?? 0) <=> ($left['last_view_at'] ?? 0);
                }
            );

            $pages_data = $build_threshold_items($page_counts, 'url');
            $referrers_data = $build_threshold_items($referrer_counts, 'domain');
            $devices_data = $build_threshold_items($device_counts);
            $browsers_data = $build_threshold_items($browser_counts);
            $operating_systems_data = $build_threshold_items($operating_system_counts);

            $active_visitors_total = max(
                $active_visitors_total,
                $this->count_unique_displayable_realtime_visits($visits)
            );

            return $this->build_admin_response(
                [
                    'windowSeconds' => $window_seconds,
                    'activeVisitors' => $active_visitors_total,
                    'activeVisitorsTotal' => $active_visitors_total,
                    'generatedAt' => $now,
                    'privacyMode' => 'unknown',
                    'countries' => $countries,
                    'pages' => $pages_data['items'],
                    'pagesOthersCount' => $pages_data['others'],
                    'referrers' => $referrers_data['items'],
                    'referrersOthersCount' => $referrers_data['others'],
                    'devices' => $devices_data['items'],
                    'devicesOthersCount' => $devices_data['others'],
                    'browsers' => $browsers_data['items'],
                    'browsersOthersCount' => $browsers_data['others'],
                    'operatingSystems' => $operating_systems_data['items'],
                    'operatingSystemsOthersCount' => $operating_systems_data['others'],
                    'privacyThreshold' => $privacy_threshold,
                    'visits' => $visits,
                    'dataScope' => $essential_only_mode ? 'essential_only' : 'standard',
                ],
                200,
                true
            );
        }

        $visits = [];

        foreach ($hits as $index => $hit) {
            if (!is_array($hit)) {
                continue;
            }

            $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
            if ($timestamp < $window_start || $timestamp > $now) {
                continue;
            }

            $visitor_id = $this->resolve_realtime_visitor_bucket_id($hit);
            if ($visitor_id === '') {
                continue;
            }
            $visitor_bucket_id = $visitor_id;

            $country_code = isset($hit['country_code'])
                ? strtoupper(sanitize_text_field((string) $hit['country_code']))
                : '';
            $country_name = isset($hit['country'])
                ? sanitize_text_field((string) $hit['country'])
                : '';
            $referrer_domain = isset($hit['referrer_domain'])
                ? sanitize_text_field((string) $hit['referrer_domain'])
                : '';
            $source_category = isset($hit['source_category'])
                ? sanitize_text_field((string) $hit['source_category'])
                : '';
            $operating_system = isset($hit['operating_system'])
                ? sanitize_text_field((string) $hit['operating_system'])
                : '';
            $browser = isset($hit['browser'])
                ? sanitize_text_field((string) $hit['browser'])
                : '';
            $browser_version = isset($hit['browser_version'])
                ? sanitize_text_field((string) $hit['browser_version'])
                : '';
            $device_class = isset($hit['device_class'])
                ? sanitize_text_field((string) $hit['device_class'])
                : '';
            $screen_resolution = isset($hit['screen_resolution'])
                ? $this->normalize_screen_resolution_for_reports(sanitize_text_field((string) $hit['screen_resolution']))
                : '';
            $page_path = isset($hit['page_path'])
                ? bbpa_sanitize_page_path_value((string) $hit['page_path'])
                : '';
            $extension_fields = apply_filters('bbpa_realtime_visit_extension_fields', [], $hit);
            if (!is_array($extension_fields)) {
                $extension_fields = [];
            }

            if (!isset($visits[$visitor_bucket_id])) {
                $visits[$visitor_bucket_id] = [
                    'visitor_id' => $visitor_id,
                    'country_code' => $country_code,
                    'country' => $country_name,
                    'current_page' => $page_path,
                    'page_views' => 0,
                    'referrer_domain' => $referrer_domain,
                    'source_category' => $source_category,
                    'operating_system' => $operating_system,
                    'browser' => $browser,
                    'browser_version' => $browser_version,
                    'device_class' => $device_class,
                    'screen_resolution' => $screen_resolution,
                    'first_view_at' => $timestamp,
                    'last_view_at' => $timestamp,
                    'last_hit_index' => $index,
                ];
                $visits[$visitor_bucket_id] = array_merge($visits[$visitor_bucket_id], $extension_fields);
            }

            $existing_last_view_at = isset($visits[$visitor_bucket_id]['last_view_at'])
                ? (int) $visits[$visitor_bucket_id]['last_view_at']
                : 0;

            $visits[$visitor_bucket_id]['page_views'] += 1;
            $visits[$visitor_bucket_id]['first_view_at'] = min(
                (int) $visits[$visitor_bucket_id]['first_view_at'],
                $timestamp
            );
            $visits[$visitor_bucket_id]['last_view_at'] = max(
                (int) $visits[$visitor_bucket_id]['last_view_at'],
                $timestamp
            );
            if (
                $page_path !== ''
                && (
                    $timestamp > $existing_last_view_at
                    || (
                        $timestamp === $existing_last_view_at
                        && $index > (int) ($visits[$visitor_bucket_id]['last_hit_index'] ?? -1)
                    )
                )
            ) {
                $visits[$visitor_bucket_id]['current_page'] = $page_path;
            }
            if (
                $timestamp > $existing_last_view_at
                || (
                    $timestamp === $existing_last_view_at
                    && $index > (int) ($visits[$visitor_bucket_id]['last_hit_index'] ?? -1)
                )
            ) {
                $visits[$visitor_bucket_id]['last_hit_index'] = $index;
            }


            if ($country_code !== '') {
                $visits[$visitor_bucket_id]['country_code'] = $country_code;
            }
            if ($country_name !== '') {
                $visits[$visitor_bucket_id]['country'] = $country_name;
            }
            if ($extension_fields !== []) {
                $visits[$visitor_bucket_id] = $this->merge_known_realtime_extension_fields($visits[$visitor_bucket_id], $extension_fields);
            }
            if ($referrer_domain !== '') {
                $visits[$visitor_bucket_id]['referrer_domain'] = $referrer_domain;
            }
            if ($source_category !== '') {
                $visits[$visitor_bucket_id]['source_category'] = $source_category;
            }
            if ($operating_system !== '') {
                $visits[$visitor_bucket_id]['operating_system'] = $operating_system;
            }
            if ($browser !== '') {
                $visits[$visitor_bucket_id]['browser'] = $browser;
            }
            if ($browser_version !== '') {
                $visits[$visitor_bucket_id]['browser_version'] = $browser_version;
            }
            if ($device_class !== '') {
                $visits[$visitor_bucket_id]['device_class'] = $device_class;
            }
            if ($screen_resolution !== '') {
                $visits[$visitor_bucket_id]['screen_resolution'] = $screen_resolution;
            }
        }

        foreach ($realtime_visitors as $visitor_index => $realtime_row) {
            if (!is_array($realtime_row)) {
                continue;
            }

            $row_timestamp = $this->normalize_realtime_row_timestamp($realtime_row);
            if ($row_timestamp < $window_start || $row_timestamp > $now) {
                continue;
            }

            $visitor_bucket = $this->resolve_realtime_display_visitor_key($realtime_row);
            if ($visitor_bucket === '') {
                continue;
            }

            $fallback_visitor_id = $this->resolve_realtime_visitor_bucket_id($realtime_row);
            if ($fallback_visitor_id === '') {
                $fallback_visitor_id = $visitor_bucket;
            }

            $fallback_extension_fields = apply_filters('bbpa_realtime_visit_extension_fields', [], $realtime_row);
            if (!is_array($fallback_extension_fields)) {
                $fallback_extension_fields = [];
            }
            $fallback_visit_data = array_merge([
                'visitor_id' => $fallback_visitor_id,
                'country_code' => isset($realtime_row['country_code']) ? strtoupper(sanitize_text_field((string) $realtime_row['country_code'])) : '',
                'country' => isset($realtime_row['country']) ? sanitize_text_field((string) $realtime_row['country']) : '',
                'current_page' => isset($realtime_row['page_path']) ? bbpa_sanitize_page_path_value((string) $realtime_row['page_path']) : '',
                'page_views' => 1,
                'referrer_domain' => isset($realtime_row['referrer_domain']) ? sanitize_text_field((string) $realtime_row['referrer_domain']) : '',
                'source_category' => isset($realtime_row['source_category']) ? sanitize_text_field((string) $realtime_row['source_category']) : '',
                'operating_system' => isset($realtime_row['operating_system']) ? sanitize_text_field((string) $realtime_row['operating_system']) : '',
                'browser' => isset($realtime_row['browser']) ? sanitize_text_field((string) $realtime_row['browser']) : '',
                'browser_version' => isset($realtime_row['browser_version']) ? sanitize_text_field((string) $realtime_row['browser_version']) : '',
                'device_class' => isset($realtime_row['device_class']) ? sanitize_text_field((string) $realtime_row['device_class']) : '',
                'screen_resolution' => isset($realtime_row['screen_resolution']) ? sanitize_text_field((string) $realtime_row['screen_resolution']) : '',
                'first_view_at' => $row_timestamp,
                'last_view_at' => $row_timestamp,
                'realtime_page_views' => 1,
                'last_realtime_row_index' => (int) $visitor_index,
            ], $fallback_extension_fields);

            if (!isset($visits[$visitor_bucket])) {
                $visits[$visitor_bucket] = $fallback_visit_data;
                continue;
            }

            $existing_last_view_at = isset($visits[$visitor_bucket]['last_view_at'])
                ? (int) $visits[$visitor_bucket]['last_view_at']
                : 0;
            $existing_first_view_at = isset($visits[$visitor_bucket]['first_view_at'])
                ? (int) $visits[$visitor_bucket]['first_view_at']
                : $row_timestamp;
            $existing_realtime_row_index = isset($visits[$visitor_bucket]['last_realtime_row_index'])
                ? (int) $visits[$visitor_bucket]['last_realtime_row_index']
                : -1;
            $row_wins_current_context = $row_timestamp > $existing_last_view_at
                || ($row_timestamp === $existing_last_view_at && (int) $visitor_index > $existing_realtime_row_index);

            $visits[$visitor_bucket]['first_view_at'] = min($existing_first_view_at, $row_timestamp);
            $visits[$visitor_bucket]['last_view_at'] = max($existing_last_view_at, $row_timestamp);
            $visits[$visitor_bucket]['realtime_page_views'] = isset($visits[$visitor_bucket]['realtime_page_views'])
                ? max(0, (int) $visits[$visitor_bucket]['realtime_page_views']) + 1
                : 1;

            if ($row_wins_current_context) {
                $visits[$visitor_bucket]['last_realtime_row_index'] = (int) $visitor_index;

                if ($fallback_visit_data['current_page'] !== '') {
                    $visits[$visitor_bucket]['current_page'] = $fallback_visit_data['current_page'];
                }

                foreach ([
                    'country_code',
                    'country',
                    'referrer_domain',
                    'source_category',
                    'operating_system',
                    'browser',
                    'browser_version',
                    'device_class',
                    'screen_resolution',
                ] as $field) {
                    if ($fallback_visit_data[$field] !== '') {
                        $visits[$visitor_bucket][$field] = $fallback_visit_data[$field];
                    }
                }

                $visits[$visitor_bucket] = $this->merge_known_realtime_extension_fields($visits[$visitor_bucket], $fallback_extension_fields);
            }
        }

        $visits = array_values($visits);
        foreach ($visits as $visit_index => $visit) {
            $source_category = isset($visit['source_category']) ? sanitize_text_field((string) $visit['source_category']) : '';
            $referrer_domain = isset($visit['referrer_domain']) ? sanitize_text_field((string) $visit['referrer_domain']) : '';
            if ($source_category === '' && $referrer_domain !== '' && function_exists('bbpa_get_source_category_from_tracking_context')) {
                $source_category = sanitize_text_field((string) bbpa_get_source_category_from_tracking_context($referrer_domain, []));
            }
            if ($source_category === '' && $referrer_domain === '') {
                $source_category = 'Direct';
            }
            $visits[$visit_index]['source_category'] = $source_category;

            $hit_page_views = isset($visit['page_views']) ? max(1, (int) $visit['page_views']) : 1;
            $realtime_page_views = isset($visit['realtime_page_views']) ? max(0, (int) $visit['realtime_page_views']) : 0;
            $visits[$visit_index]['page_views'] = max($hit_page_views, $realtime_page_views);
        }

        // Premium can derive map points while the internal coordinates are still
        // available. The shared controller deliberately has no knowledge of the
        // Premium coordinate service; Free keeps the neutral empty default.
        $point_result = $essential_only_mode
            ? []
            : apply_filters('bbpa_realtime_map_points', [], $visits);
        $point_diagnostics = [];
        if (is_array($point_result) && isset($point_result['points']) && is_array($point_result['points'])) {
            $points = array_values($point_result['points']);
            $point_diagnostics = isset($point_result['diagnostics']) && is_array($point_result['diagnostics'])
                ? $point_result['diagnostics']
                : [];
        } else {
            $points = is_array($point_result) ? array_values($point_result) : [];
        }

        if ($essential_only_mode) {
            $visits = array_map(
                static function (array $visit): array {
                    return [
                        'visitor_id' => isset($visit['visitor_id']) ? sanitize_text_field((string) $visit['visitor_id']) : '',
                        'country_code' => isset($visit['country_code']) ? sanitize_text_field((string) $visit['country_code']) : '',
                        'country' => isset($visit['country']) ? sanitize_text_field((string) $visit['country']) : '',
                            'current_page' => '',
                        'page_views' => isset($visit['page_views']) ? max(1, (int) $visit['page_views']) : 1,
                        'referrer_domain' => '',
                        'source_category' => '',
                        'operating_system' => '',
                        'browser' => '',
                        'browser_version' => '',
                        'device_class' => '',
                        'screen_resolution' => '',
                        'first_view_at' => isset($visit['first_view_at']) ? (int) $visit['first_view_at'] : 0,
                        'last_view_at' => isset($visit['last_view_at']) ? (int) $visit['last_view_at'] : 0,
                    ];
                },
                $visits
            );
        }
        foreach ($visits as $visit_index => $visit) {
            foreach (['last_hit_index', 'last_realtime_row_index', 'realtime_page_views'] as $internal_field) {
                if (isset($visit[$internal_field])) {
                    unset($visits[$visit_index][$internal_field]);
                }
            }
        }
        usort(
            $visits,
            static function (array $left, array $right): int {
                return ($right['last_view_at'] ?? 0) <=> ($left['last_view_at'] ?? 0);
            }
        );
        $active_visitors_total = max(
            $active_visitors_total,
            $this->count_unique_displayable_realtime_visits($visits)
        );

        $country_counts = [];
        foreach ($visits as $visit) {
            $country_code = strtoupper(sanitize_text_field((string) ($visit['country_code'] ?? '')));
            if ($country_code === '') {
                $country_code = 'ZZ';
            }
            $country_label = sanitize_text_field((string) ($visit['country'] ?? ''));
            if ($country_label === '') {
                $country_label = __('Unknown country', 'bimbeau-privacy-analytics');
            }
            if (!isset($country_counts[$country_code])) {
                $country_counts[$country_code] = [
                    'code' => $country_code,
                    'label' => $country_label,
                    'hits' => 0,
                ];
            }
            $country_counts[$country_code]['hits']++;
        }
        $countries = array_values($country_counts);
        usort($countries, static function (array $left, array $right): int {
            return ($right['hits'] ?? 0) <=> ($left['hits'] ?? 0);
        });

        $this->log_debug('Realtime map point summary.', array_merge([
            'visits_received' => count($visits),
            'raw_coordinates' => 0,
            'geoname' => 0,
            'excluded' => count($visits),
            'consented_map_points' => count($points),
            'premium_callback' => has_filter('bbpa_realtime_map_points') !== false,
        ], $point_diagnostics));


        if (function_exists('bbpa_is_ui_field_visible')) {
            $visits = array_map(
                static function (array $visit) use ($advanced_enabled): array {
                    foreach (array_keys($visit) as $field) {
                        if (!bbpa_is_ui_field_visible('realtime_visits', (string) $field, $advanced_enabled)) {
                            unset($visit[$field]);
                        }
                    }

                    return $visit;
                },
                $visits
            );
        }

        return $this->build_admin_response(
            [
                'windowSeconds' => $window_seconds,
                'activeVisitors' => $active_visitors_total,
                'activeVisitorsTotal' => $active_visitors_total,
                'points' => $points,
                'consentedMapPoints' => $essential_only_mode ? [] : $points,
                'countries' => $countries,
                'visits' => $visits,
                'generatedAt' => $now,
                'privacyMode' => 'unknown',
                'dataScope' => $essential_only_mode ? 'essential_only' : 'standard',
            ],
            200,
            true
        );
    }

    /**
     * Merge realtime extension fields into a visit without letting an empty value erase a known one.
     *
     * A later row of the same visit may lack geolocation (for example a hit sent before the lookup finished): its
     * empty city or null coordinates must not remove the values of an earlier row, or the map marker disappears.
     *
     * @param array<string, mixed> $visit  Visit being built.
     * @param array<string, mixed> $fields Extension fields of the current row.
     * @return array<string, mixed>
     */
    private function merge_known_realtime_extension_fields(array $visit, array $fields): array {
        foreach ($fields as $field => $value) {
            if (($value === null || $value === '') && array_key_exists($field, $visit)) {
                continue;
            }
            $visit[$field] = $value;
        }

        return $visit;
    }

    /**
     * Resolve a stable realtime visitor bucket identifier from accepted hit fields.
     */
    private function resolve_realtime_visitor_bucket_id(array $hit): string {
        $visitor_id = isset($hit['visitor_id'])
            ? sanitize_text_field((string) $hit['visitor_id'])
            : '';
        if ($visitor_id !== '') {
            return $visitor_id;
        }

        $visit_id = isset($hit['visit_id'])
            ? sanitize_text_field((string) $hit['visit_id'])
            : '';

        return $visit_id;
    }

    /**
     * Resolve the unprefixed display key used to merge realtime rows into visit rows.
     */
    private function resolve_realtime_display_visitor_key(array $row): string {
        $visitor_id = isset($row['visitor_id'])
            ? sanitize_text_field((string) $row['visitor_id'])
            : '';
        if ($visitor_id !== '') {
            return $visitor_id;
        }

        $visitor_bucket = isset($row['visitor_bucket'])
            ? sanitize_text_field((string) $row['visitor_bucket'])
            : '';
        if ($visitor_bucket !== '') {
            return $visitor_bucket;
        }

        $visit_id = isset($row['visit_id'])
            ? sanitize_text_field((string) $row['visit_id'])
            : '';

        return $visit_id;
    }


    /**
     * Check whether realtime hits include enriched dimensions in the active window.
     */
    private function realtime_has_enriched_data(array $hits, int $window_start, int $now): bool {
        $window_hits = 0;
        $enriched_window_hits = 0;
        $reliable_enriched_hits = 0;
        $missing_identifier_hits = 0;
        $missing_dimension_hits = 0;

        foreach ($hits as $hit) {
            if (!is_array($hit)) {
                continue;
            }

            $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
            if ($timestamp < $window_start || $timestamp > $now) {
                continue;
            }

            $window_hits += 1;
            if (($hit['granularity'] ?? 'base') !== 'enriched') {
                continue;
            }

            $enriched_window_hits += 1;
            $visitor_id_present = !empty($hit['visitor_id']);
            $visit_id_present = !empty($hit['visit_id']);
            if (!$visitor_id_present || !$visit_id_present) {
                $missing_identifier_hits += 1;
            }

            if ($this->has_reliable_realtime_enriched_dimensions($hit)) {
                $reliable_enriched_hits += 1;
                return true;
            }

            $missing_dimension_hits += 1;
        }

        if ($window_hits > 0) {
            $this->log_debug('Realtime enriched detection fallback to base granularity.', [
                'window_hits' => $window_hits,
                'enriched_window_hits' => $enriched_window_hits,
                'reliable_enriched_hits' => $reliable_enriched_hits,
                'missing_identifier_hits' => $missing_identifier_hits,
                'missing_dimension_hits' => $missing_dimension_hits,
            ]);
        }

        return false;
    }

    /**
     * Validate that a realtime hit has reliable enriched dimensions.
     */
    private function has_reliable_realtime_enriched_dimensions(array $hit): bool {
        $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
        $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
        if ($visitor_id === '' || $visit_id === '') {
            return false;
        }

        $enriched_fields = [
            'country_code',
            'country',
            'operating_system',
            'browser',
            'device_class',
            'screen_resolution',
        ];

        foreach ($enriched_fields as $field) {
            if (!empty($hit[$field])) {
                return true;
            }

        }

        $this->log_debug('Realtime enriched hit has identifiers but no enriched dimensions.', [
            'visit_id' => $visit_id,
            'visitor_id' => $visitor_id,
            'checked_fields' => $enriched_fields,
        ]);

        return false;
    }

    /**
     * Count unique active visitors directly from realtime visitor rows.
     *
     * @param array<int, array<string, mixed>> $realtime_visitors Normalized rows from get_realtime_visitor_rows_in_window().
     */
    private function count_active_visitors_from_realtime_source(array $realtime_visitors, int $window_start, int $now): int {
        $active_keys = [];

        foreach ($realtime_visitors as $normalized_row) {
            $timestamp = $this->normalize_realtime_row_timestamp($normalized_row);
            if ($timestamp <= 0 || $timestamp < $window_start || $timestamp > $now) {
                continue;
            }

            $active_key = $this->resolve_realtime_active_visitor_key($normalized_row);
            if ($active_key !== '') {
                $active_keys[$active_key] = true;
            }
        }

        return count($active_keys);
    }

    /**
     * Resolve the stable identity used for realtime active visitor counting.
     */
    private function resolve_realtime_active_visitor_key(array $row): string {
        $visitor_id = isset($row['visitor_id'])
            ? sanitize_text_field((string) $row['visitor_id'])
            : '';
        if ($visitor_id !== '') {
            return 'visitor:' . $visitor_id;
        }

        $visitor_bucket = isset($row['visitor_bucket'])
            ? sanitize_text_field((string) $row['visitor_bucket'])
            : '';
        if ($visitor_bucket !== '') {
            return 'bucket:' . $visitor_bucket;
        }

        $visit_id = isset($row['visit_id'])
            ? sanitize_text_field((string) $row['visit_id'])
            : '';
        if ($visit_id !== '') {
            return 'visit:' . $visit_id;
        }

        return '';
    }

    /**
     * Count unique displayable visits using the same visitor identity preference as realtime rows.
     *
     * @param array<int, array<string, mixed>> $visits
     */
    private function count_unique_displayable_realtime_visits(array $visits): int {
        $active_keys = [];

        foreach ($visits as $visit) {
            if (!is_array($visit)) {
                continue;
            }

            $active_key = $this->resolve_realtime_active_visitor_key($visit);
            if ($active_key !== '') {
                $active_keys[$active_key] = true;
            }
        }

        return count($active_keys);
    }

    /**
     * Remove the rows recorded for bots (see bbpa_is_bot_realtime_row()).
     *
     * @param array<int|string, mixed> $rows Realtime visitor rows or raw log rows.
     * @return array<int, mixed>
     */
    private function exclude_bot_realtime_rows(array $rows): array {
        return array_values(array_filter($rows, static function ($row): bool {
            return !is_array($row) || !bbpa_is_bot_realtime_row($row);
        }));
    }

    /**
     * Return normalized realtime visitor rows within the active window.
     */
    private function get_realtime_visitor_rows_in_window(int $window_start, int $now): array {
        $rows = bbpa_get_realtime_log_rows($window_start);

        $window_rows = [];
        foreach ($rows as $row) {
            $normalized_row = $this->normalize_realtime_visitor_row($row);
            if (!is_array($normalized_row)) {
                continue;
            }

            $timestamp = $this->normalize_realtime_row_timestamp($normalized_row);
            if ($timestamp < $window_start || $timestamp > $now) {
                continue;
            }

            $window_rows[] = $normalized_row;
        }

        return $window_rows;
    }


    /**
     * Normalize a realtime visitor row that may be stored as JSON text.
     *
     * @param mixed $row Raw realtime visitor row.
     */
    private function normalize_realtime_visitor_row($row): ?array {
        if (is_array($row)) {
            return $row;
        }

        if (!is_string($row)) {
            return null;
        }

        $decoded = json_decode($row, true);
        if (!is_array($decoded)) {
            return null;
        }

        return $decoded;
    }

    /**
     * Normalize realtime visitor row timestamps across legacy/raw formats.
     */
    private function normalize_realtime_row_timestamp(array $row): int {
        $raw_timestamp = 0;
        if (isset($row['timestamp_bucket'])) {
            $raw_timestamp = $row['timestamp_bucket'];
        } elseif (isset($row['timestamp'])) {
            $raw_timestamp = $row['timestamp'];
        } elseif (isset($row['last_seen'])) {
            $raw_timestamp = $row['last_seen'];
        }

        if (is_string($raw_timestamp)) {
            $raw_timestamp = trim($raw_timestamp);
            if ($raw_timestamp === '') {
                return 0;
            }

            if (!preg_match('/^\d+$/', $raw_timestamp)) {
                $this->log_debug('Realtime visitor raw timestamp received before formatting.', [
                    'raw_timestamp' => $raw_timestamp,
                ]);

                $parsed_timestamp = strtotime($raw_timestamp);
                if ($parsed_timestamp === false) {
                    $this->log_debug('Realtime visitor raw timestamp parsing failed.', [
                        'raw_timestamp' => $raw_timestamp,
                    ]);
                    return 0;
                }

                $raw_timestamp = $parsed_timestamp;
            }
        }

        $timestamp = (int) $raw_timestamp;
        if ($timestamp <= 0) {
            return 0;
        }

        // Accept legacy millisecond timestamps by converting them to seconds.
        if ($timestamp > 9999999999) {
            $timestamp = (int) floor($timestamp / 1000);
        }

        return $timestamp;
    }

    /**
     * Normalize legacy exact viewport values into coarse viewport buckets.
     */
    private function normalize_screen_resolution_for_reports(string $screen_resolution): string {
        return BBPA_REST_Query_Helpers::normalize_screen_resolution_bucket($screen_resolution);
    }

    /**
     * Purge analytics data.
     */
    public function purge_data(WP_REST_Request $request): WP_REST_Response {
        $results = bbpa_purge_analytics_data();

        return $this->build_admin_response(
            [
                'purged' => true,
                'details' => $results,
            ],
            200,
            true
        );
    }

    /**
     * Purge only aggregated analytics data.
     */
    public function purge_aggregated_data(WP_REST_Request $request): WP_REST_Response {
        $results = bbpa_purge_aggregated_data();

        return $this->build_admin_response(
            [
                'purged' => true,
                'details' => $results,
            ],
            200,
            true
        );
    }

    /**
     * Top pages aggregation.
     */
    public function get_top_pages(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $page = max(1, absint($request->get_param('page')));
        $per_page = $this->normalize_limit($request->get_param('per_page'));
        $search = sanitize_text_field((string) $request->get_param('search'));
        $order_by = sanitize_key((string) $request->get_param('orderby'));
        $order = strtoupper(sanitize_text_field((string) $request->get_param('order'))) === 'ASC' ? 'ASC' : 'DESC';
        $sort_column = $order_by === 'label' ? 'label' : 'hits';
        $offset = ($page - 1) * $per_page;
        $cache_key = $this->get_cache_key(
            'top-pages',
            [
                'range' => $range,
                'page' => $page,
                'per_page' => $per_page,
                'search' => $search,
                'order_by' => $sort_column,
                'order' => $order,
                'includeViewsSeries' => true,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $table = bbpa_sql_table_name('bbpa_daily');
        $search_sql = '';
        $search_args = [];
        if ($search !== '') {
            $search_sql = ' HAVING label LIKE %s';
            $search_args[] = '%' . $wpdb->esc_like($search) . '%';
        }

        $totals_sql = "SELECT COUNT(*) FROM (
            SELECT page_path AS label
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY page_path{$search_sql}
        ) AS totals";
        $total_items = (int) $wpdb->get_var(
            $wpdb->prepare(
                $totals_sql,
                array_merge([$range['start'], $range['end']], $search_args)
            )
        );
        $total_pages = max(1, (int) ceil($total_items / max(1, $per_page)));

        $query = $wpdb->prepare(
            "SELECT page_path AS label, SUM(hits) AS hits
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY page_path{$search_sql}
            ORDER BY {$sort_column} {$order}
            LIMIT %d OFFSET %d",
            array_merge(
                [$range['start'], $range['end']],
                $search_args,
                [$per_page, $offset]
            )
        );

        $rows = $wpdb->get_results($query, ARRAY_A);
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $advanced_enabled = isset($settings['advanced_stats_enabled'])
            && rest_sanitize_boolean($settings['advanced_stats_enabled']);

        $items = array_map(
            function (array $row) use ($advanced_enabled): array {
                $label = $this->normalize_json_text($row['label'] ?? '');
                $item = [
                    'label' => $label,
                    '_series_label' => $label,
                    'hits' => (int) $row['hits'],
                ];

                if (function_exists('bbpa_is_ui_field_visible') && !bbpa_is_ui_field_visible('referrers', 'label', $advanced_enabled)) {
                    $item['label'] = '';
                }

                return $item;
            },
            $rows ?: []
        );
        $items = $this->append_top_pages_views_series($items, $range);

        $payload = [
            'range' => $range,
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'perPage' => $per_page,
                'totalItems' => $total_items,
                'totalPages' => $total_pages,
            ],
        ];

        $this->set_cached_payload($cache_key, $payload, $search === '');

        return new WP_REST_Response($payload, 200);
    }


    /**
     * Append compact daily page-view series to top-pages rows.
     */
    private function append_top_pages_views_series(array $items, array $range): array {
        global $wpdb;

        if ($items === []) {
            return $items;
        }

        $buckets = $this->get_day_buckets($range['start'], $range['end']);
        $empty_series = array_fill(0, count($buckets), 0);
        $bucket_indexes = array_flip($buckets);
        $labels = [];
        foreach ($items as $item) {
            // Page paths keep their percent-encoded octets, which sanitize_text_field() would strip.
            $label = bbpa_sanitize_page_path_value($item['_series_label'] ?? ($item['label'] ?? ''));
            if ($label !== '') {
                $labels[$label] = true;
            }
        }

        if ($labels === []) {
            return array_map(
                static function (array $item) use ($empty_series): array {
                    $item['views_series'] = $empty_series;
                    unset($item['_series_label']);

                    return $item;
                },
                $items
            );
        }

        $in_clause = bbpa_build_in_clause(array_keys($labels), 'page_path');
        if (!empty($in_clause['empty'])) {
            return array_map(
                static function (array $item) use ($empty_series): array {
                    $item['views_series'] = $empty_series;
                    unset($item['_series_label']);

                    return $item;
                },
                $items
            );
        }

        $table = bbpa_sql_table_name('bbpa_daily');
        $series_by_label = [];
        $label_by_key = [];
        foreach (array_keys($labels) as $label) {
            $series_by_label[$label] = $empty_series;
            $label_key = bbpa_normalize_percent_encoding_case((string) $label);
            if (!isset($label_by_key[$label_key])) {
                $label_by_key[$label_key] = (string) $label;
            }
        }

        $query = $wpdb->prepare(
            "SELECT date_bucket, page_path, SUM(hits) AS hits
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s
                AND page_path IN ({$in_clause['placeholders']})
            GROUP BY date_bucket, page_path",
            ...array_merge([$range['start'], $range['end']], $in_clause['args'])
        );
        $rows = $wpdb->get_results($query, ARRAY_A) ?: [];

        foreach ($rows as $row) {
            $bucket = isset($row['date_bucket']) ? (string) $row['date_bucket'] : '';
            $label = bbpa_sanitize_page_path_value($row['page_path'] ?? '');
            if (!isset($series_by_label[$label])) {
                // Case-insensitive collations match and group `/caf%c3%a9` with a `/caf%C3%A9` row, and
                // return either spelling: such a row belongs to the row of the other spelling.
                $label = $label_by_key[bbpa_normalize_percent_encoding_case($label)] ?? '';
            }
            if (!isset($bucket_indexes[$bucket]) || !isset($series_by_label[$label])) {
                continue;
            }

            $series_by_label[$label][$bucket_indexes[$bucket]] += (int) ($row['hits'] ?? 0);
        }

        return array_map(
            static function (array $item) use ($series_by_label, $empty_series): array {
                $label = bbpa_sanitize_page_path_value($item['_series_label'] ?? ($item['label'] ?? ''));
                $item['views_series'] = $series_by_label[$label] ?? $empty_series;
                unset($item['_series_label']);

                return $item;
            },
            $items
        );
    }

    /**
     * Resolve referrer favicon for a domain using server-side safeguards.
     */
    public function get_favicon(WP_REST_Request $request): WP_REST_Response {
        $domain = $this->normalize_json_text($request->get_param('domain'));

        if ($domain === '') {
            return new WP_REST_Response(
                [
                    'domain' => '',
                    'favicon_url' => '',
                    'is_local' => false,
                ],
                200
            );
        }

        $resolver = new BBPA_Favicon_Resolver();
        $favicon = $resolver->resolve_favicon_for_domain($domain);

        return new WP_REST_Response(
            [
                'domain' => $domain,
                'favicon_url' => (string) ($favicon['url'] ?? ''),
                'is_local' => isset($favicon['url'], $favicon['path']),
            ],
            200
        );
    }

    /**
     * Resolve a bounded, deduplicated set of observed hosts in one authenticated request.
     *
     * Network work shares a 20-second budget. Hosts left when the budget is spent
     * only get their already stored favicon, or the status "pending" so a later
     * request can resolve them.
     */
    public function get_favicons(WP_REST_Request $request): WP_REST_Response {
        $domains = array_slice(array_values(array_unique(array_filter(array_map('trim', explode(',', (string) $request->get_param('domains')))))), 0, 20);
        $resolver = new BBPA_Favicon_Resolver();
        $resolver->set_time_budget(20.0);
        $favicons = [];
        foreach ($domains as $domain) {
            $host = $resolver->normalize_observed_host($domain);
            if ($host === '' || isset($favicons[$host])) continue;
            $budget_exhausted = $resolver->is_time_budget_exhausted();
            $favicon = $budget_exhausted
                ? $resolver->get_cached_favicon_for_domain($host)
                : $resolver->resolve_favicon_for_domain($host);
            $is_local = isset($favicon['url'], $favicon['path']);
            $status = $is_local ? 'available' : ($budget_exhausted ? 'pending' : 'unavailable');
            $favicons[$host] = ['url' => $is_local ? (string) $favicon['url'] : '', 'is_local' => $is_local, 'status' => $status];
        }
        return new WP_REST_Response(['favicons' => $favicons], 200);
    }

    /** Return local setup metadata and read-only GeoIP status without downloading anything. */
    public function get_setup_wizard(WP_REST_Request $request): WP_REST_Response {
        $state = bbpa_get_setup_wizard_state();
        $settings = bbpa_get_settings();
        $updater = function_exists('bbpa_get_geoip_database_updater') ? bbpa_get_geoip_database_updater() : null;
        return new WP_REST_Response(['state' => $state, 'auto_open_allowed' => bbpa_setup_wizard_auto_open_allowed($state), 'settings' => [
            'advanced_stats_enabled' => (bool) $settings['advanced_stats_enabled'],
            'geoip_lookup_mode' => (string) $settings['geoip_lookup_mode'],
            'geoip_update_frequency' => (string) $settings['geoip_update_frequency'],
            'referrer_favicons_enabled' => (bool) $settings['referrer_favicons_enabled'],
        ], 'geoip' => ['local_database_available' => $updater ? $updater->is_local_database_available() : false]], 200);
    }

    /** Apply only whitelisted wizard state transitions; settings remain owned by their settings endpoint. */
    public function update_setup_wizard(WP_REST_Request $request) {
        $action = sanitize_key((string) $request->get_param('action'));
        if (in_array($action, ['reset', 'restart'], true)) {
            return new WP_REST_Response(['state' => bbpa_reset_setup_wizard_state()], 200);
        }

        $state = bbpa_get_setup_wizard_state();
        $user_id = get_current_user_id();
        $timestamp = current_time('mysql', true);

        if ($action === 'start') {
            $state['status'] = 'in_progress';
            $state['started_at'] = $state['started_at'] ?: $timestamp;
        } elseif ($action === 'set_step') {
            $step = sanitize_key((string) $request->get_param('step'));
            if (!in_array($step, ['tracking', 'geolocation', 'referrers', 'complete'], true)) {
                return new WP_Error(
                    'bbpa_invalid_setup_wizard_transition',
                    __('Invalid setup wizard step.', 'bimbeau-privacy-analytics'),
                    ['status' => 400]
                );
            }
            $state['current_step'] = $step;
        } elseif ($action === 'set_choice') {
            $choice = sanitize_key((string) $request->get_param('choice'));
            if (!in_array($choice, ['advanced_stats', 'geoip_database', 'referrer_favicons'], true)) {
                return new WP_Error(
                    'bbpa_invalid_setup_wizard_choice',
                    __('Invalid setup wizard choice.', 'bimbeau-privacy-analytics'),
                    ['status' => 400]
                );
            }
            $state['choices'][$choice] = (bool) rest_sanitize_boolean($request->get_param('value'));
        } elseif ($action === 'mark_auto_opened') {
            $state['auto_opened'] = true;
        } elseif ($action === 'mark_geoip_downloaded') {
            $state['authorizations']['geoip_downloaded_at'] = $timestamp;
            $state['authorizations']['geoip_downloaded_by'] = $user_id;
        } elseif ($action === 'mark_favicons_enabled') {
            $state['authorizations']['favicons_enabled_at'] = $timestamp;
            $state['authorizations']['favicons_enabled_by'] = $user_id;
        } elseif ($action === 'complete') {
            $state['status'] = 'completed';
            $state['current_step'] = 'complete';
            $state['completed_at'] = $timestamp;
            $state['completed_by'] = $user_id;
        } else {
            return new WP_Error(
                'bbpa_invalid_setup_wizard_action',
                __('Invalid setup wizard action.', 'bimbeau-privacy-analytics'),
                ['status' => 400]
            );
        }

        return new WP_REST_Response(['state' => bbpa_update_setup_wizard_state($state)], 200);
    }

    /**
     * Top referrers aggregation.
     */
    public function get_referrers(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $limit = $this->normalize_limit($request->get_param('limit'));
        $cache_key = $this->get_cache_key(
            'referrers',
            [
                'range' => $range,
                'limit' => $limit,
                'contract' => 2,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            $cached['items'] = $this->add_cached_referrer_favicons($cached['items'] ?? []);
            return new WP_REST_Response($cached, 200);
        }

        $table = bbpa_sql_table_name('bbpa_daily');

        $query = $wpdb->prepare(
            "SELECT referrer_domain AS label, SUM(hits) AS hits
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY referrer_domain
            ORDER BY hits DESC
            LIMIT %d",
            $range['start'],
            $range['end'],
            $limit
        );

        $rows = $wpdb->get_results($query, ARRAY_A);
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $advanced_enabled = isset($settings['advanced_stats_enabled'])
            && rest_sanitize_boolean($settings['advanced_stats_enabled']);

        $items = array_map(
            function (array $row) use ($advanced_enabled): array {
                $item = [
                    'label' => $this->normalize_json_text($row['label'] ?? ''),
                    'hits' => (int) $row['hits'],
                ];

                if (function_exists('bbpa_is_ui_field_visible') && !bbpa_is_ui_field_visible('referrers', 'label', $advanced_enabled)) {
                    $item['label'] = '';
                }

                return $item;
            },
            $rows ?: []
        );

        $items = $this->add_cached_referrer_favicons($items);

        $payload = [
            'range' => $range,
            'items' => $items,
        ];

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Daily timeseries aggregation.
     */
    public function get_timeseries_day(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $cache_key = $this->get_cache_key('timeseries-day', $range);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $daily_table = $wpdb->prefix . 'bbpa_daily';
        $entry_exit_table = $wpdb->prefix . 'bbpa_entry_exit_daily';
        $overview_daily_table = $wpdb->prefix . 'bbpa_overview_daily';

        $pageviews_query = $wpdb->prepare(
            "SELECT date_bucket AS bucket, SUM(hits) AS pageViews
            FROM {$daily_table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY date_bucket
            ORDER BY date_bucket ASC",
            $range['start'],
            $range['end']
        );

        $entries_query = $wpdb->prepare(
            "SELECT date_bucket AS bucket, SUM(entries) AS entries
            FROM {$entry_exit_table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY date_bucket
            ORDER BY date_bucket ASC",
            $range['start'],
            $range['end']
        );

        $overview_rows = [];
        if ($this->table_exists($overview_daily_table)) {
            $overview_query = $wpdb->prepare(
                "SELECT date_bucket AS bucket, SUM(page_views) AS pageViews, SUM(visitors) AS visitors, SUM(visits) AS visits
                FROM {$overview_daily_table}
                WHERE date_bucket BETWEEN %s AND %s
                GROUP BY date_bucket
                ORDER BY date_bucket ASC",
                $range['start'],
                $range['end']
            );

            $overview_rows = $wpdb->get_results($overview_query, ARRAY_A);
        }

        $pageviews_rows = $wpdb->get_results($pageviews_query, ARRAY_A);
        $entries_rows = $wpdb->get_results($entries_query, ARRAY_A);

        $pageviews_by_bucket = [];
        foreach ($pageviews_rows ?: [] as $row) {
            $pageviews_by_bucket[$row['bucket']] = (int) $row['pageViews'];
        }

        $entries_by_bucket = [];
        foreach ($entries_rows ?: [] as $row) {
            $entries_by_bucket[$row['bucket']] = (int) $row['entries'];
        }

        $overview_pageviews_by_bucket = [];
        $overview_visits_by_bucket = [];
        $visitors_by_bucket = [];
        $canonical_buckets = [];
        foreach ($overview_rows ?: [] as $row) {
            $bucket = (string) ($row['bucket'] ?? '');
            if ($bucket === '') {
                continue;
            }

            $canonical_visitors = (int) ($row['visitors'] ?? 0);
            $canonical_visits = (int) ($row['visits'] ?? 0);
            $canonical_buckets[$bucket] = true;
            $overview_pageviews_by_bucket[$bucket] = (int) ($row['pageViews'] ?? 0);
            $overview_visits_by_bucket[$bucket] = $canonical_visits;
            $visitors_by_bucket[$bucket] = $canonical_visitors > 0
                ? $canonical_visitors
                : ($canonical_visits > 0 ? $canonical_visits : 0);
        }

        $items = [];
        foreach ($this->get_day_buckets($range['start'], $range['end']) as $bucket) {
            $has_canonical_bucket = isset($canonical_buckets[$bucket]);
            $entries = $has_canonical_bucket ? ($overview_visits_by_bucket[$bucket] ?? 0) : ($entries_by_bucket[$bucket] ?? 0);
            $visitors = $has_canonical_bucket
                ? ($visitors_by_bucket[$bucket] ?? 0)
                : $entries;

            $items[] = [
                'bucket' => $bucket,
                'pageViews' => $has_canonical_bucket ? ($overview_pageviews_by_bucket[$bucket] ?? 0) : ($pageviews_by_bucket[$bucket] ?? 0),
                'entries' => $entries,
                'visits' => $entries,
                'visitors' => $visitors,
            ];
        }

        $payload = [
            'range' => $range,
            'items' => $items,
        ];

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Hourly timeseries aggregation.
     */
    public function get_timeseries_hour(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_hour_range($request);
        $cache_key = $this->get_cache_key('timeseries-hour', $range);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $hourly_table = $wpdb->prefix . 'bbpa_hourly';
        $entry_exit_hourly_table = $wpdb->prefix . 'bbpa_entry_exit_hourly';
        $visitors_table = $wpdb->prefix . 'bbpa_visitors';

        $pageviews_query = $wpdb->prepare(
            "SELECT date_bucket AS bucket, SUM(hits) AS pageViews
            FROM {$hourly_table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY date_bucket
            ORDER BY date_bucket ASC",
            $range['start'],
            $range['end']
        );

        $pageviews_rows = $wpdb->get_results($pageviews_query, ARRAY_A);

        $entries_rows = [];
        if ($this->table_exists($entry_exit_hourly_table)) {
            $entries_query = $wpdb->prepare(
                "SELECT date_bucket AS bucket, SUM(entries) AS entries
                FROM {$entry_exit_hourly_table}
                WHERE date_bucket BETWEEN %s AND %s
                GROUP BY date_bucket
                ORDER BY date_bucket ASC",
                $range['start'],
                $range['end']
            );

            $entries_rows = $wpdb->get_results($entries_query, ARRAY_A);
        }

        $pageviews_by_bucket = [];
        foreach ($pageviews_rows ?: [] as $row) {
            $pageviews_by_bucket[$row['bucket']] = (int) $row['pageViews'];
        }

        $entries_by_bucket = [];
        foreach ($entries_rows ?: [] as $row) {
            $entries_by_bucket[$row['bucket']] = (int) $row['entries'];
        }

        $visitors_by_bucket = null;
        if ($this->table_exists($visitors_table)) {
            $visitors_by_bucket = $this->get_hourly_visitors_by_bucket($visitors_table, $range);
        }
        $has_visitor_level_data = is_array($visitors_by_bucket);

        $items = [];
        foreach ($this->get_hour_buckets($range['start'], $range['end']) as $bucket) {
            $entries = $entries_by_bucket[$bucket] ?? 0;
            $items[] = [
                'bucket' => $bucket,
                'pageViews' => $pageviews_by_bucket[$bucket] ?? 0,
                'entries' => $entries,
                'visits' => $entries,
                'visitors' => $has_visitor_level_data
                    ? ($visitors_by_bucket[$bucket] ?? 0)
                    : $entries,
            ];
        }

        $payload = [
            'range' => $range,
            'items' => $items,
        ];

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Global hourly aggregation for dashboard heatmap.
     */
    public function get_global_hourly_heatmap(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $table = $wpdb->prefix . 'bbpa_hourly';
        $hourly_feature_enabled = (bool) apply_filters('bbpa_hourly_aggregation_enabled', true);
        $hourly_table_exists = $this->table_exists($table);
        $hourly_available = $hourly_feature_enabled && $hourly_table_exists;
        $hourly_unavailable_reason = null;

        if (!$hourly_available) {
            if (!$hourly_feature_enabled) {
                $hourly_unavailable_reason = 'feature_disabled';
            } elseif (!$hourly_table_exists) {
                $hourly_unavailable_reason = 'table_missing';
            } else {
                $hourly_unavailable_reason = 'unknown';
            }
        }

        $cache_key = $this->get_cache_key(
            'dashboard-hourly-heatmap-global',
            [
                'range' => $range,
                'hourly_available' => $hourly_available,
                'hourly_unavailable_reason' => $hourly_unavailable_reason,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $payload = [
            'range' => $range,
            'hourlyAvailable' => $hourly_available,
            'hourlyUnavailableReason' => $hourly_unavailable_reason,
            'items' => [],
        ];

        if ($hourly_available) {
            $hour_range = [
                'start' => $range['start'] . ' 00:00:00',
                'end' => $range['end'] . ' 23:00:00',
            ];

            $query = $wpdb->prepare(
                "SELECT WEEKDAY(date_bucket) AS weekday_bucket, HOUR(date_bucket) AS hour_bucket, SUM(hits) AS metric
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s
                GROUP BY weekday_bucket, hour_bucket
                ORDER BY weekday_bucket ASC, hour_bucket ASC",
                $hour_range['start'],
                $hour_range['end']
            );

            $rows = $wpdb->get_results($query, ARRAY_A);
            $values = [];
            foreach ($rows ?: [] as $row) {
                $weekday_bucket = isset($row['weekday_bucket']) ? (int) $row['weekday_bucket'] : -1;
                $hour_bucket = isset($row['hour_bucket']) ? (int) $row['hour_bucket'] : -1;

                if ($weekday_bucket < 0 || $weekday_bucket > 6 || $hour_bucket < 0 || $hour_bucket > 23) {
                    continue;
                }

                $day_of_week = $weekday_bucket + 1;
                $values[$day_of_week . '|' . $hour_bucket] = (int) ($row['metric'] ?? 0);
            }

            for ($day_of_week = 1; $day_of_week <= 7; $day_of_week++) {
                for ($hour = 0; $hour < 24; $hour++) {
                    $payload['items'][] = [
                        'dayOfWeek' => $day_of_week,
                        'hour' => $hour,
                        'value' => $values[$day_of_week . '|' . $hour] ?? 0,
                    ];
                }
            }
        }

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Device class split aggregation.
     */
    public function get_device_split(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $cache_key = $this->get_cache_key(
            'device-split',
            [
                'range' => $range,
                'contract' => 2,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $table = bbpa_sql_table_name('bbpa_daily');

        $query = $wpdb->prepare(
            "SELECT device_class AS label, SUM(hits) AS hits
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s
            GROUP BY device_class
            ORDER BY hits DESC",
            $range['start'],
            $range['end']
        );

        $rows = $wpdb->get_results($query, ARRAY_A);
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $advanced_enabled = isset($settings['advanced_stats_enabled'])
            && rest_sanitize_boolean($settings['advanced_stats_enabled']);

        $items = array_map(
            function (array $row) use ($advanced_enabled): array {
                $item = [
                    'label' => $this->normalize_json_text($row['label'] ?? ''),
                    'hits' => (int) $row['hits'],
                ];

                if (function_exists('bbpa_is_ui_field_visible') && !bbpa_is_ui_field_visible('devices', 'label', $advanced_enabled)) {
                    $item['label'] = '';
                }

                return $item;
            },
            $rows ?: []
        );

        $payload = [
            'range' => $range,
            'items' => $items,
        ];

        $this->set_cached_payload($cache_key, $payload);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Build an admin REST response with optional anti-cache headers.
     */
    private function build_admin_response(array $payload, int $status = 200, bool $disable_cache = false): WP_REST_Response {
        $response = new WP_REST_Response($payload, $status);

        if ($disable_cache) {
            $this->apply_no_cache_headers($response);
        }

        return $response;
    }

    /**
     * Apply anti-cache headers to sensitive admin REST responses.
     */
    private function apply_no_cache_headers(WP_REST_Response $response): void {
        if (!headers_sent()) {
            nocache_headers();
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
        }

        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Pragma', 'no-cache');
        $response->header('Expires', 'Wed, 11 Jan 1984 05:00:00 GMT');
    }


    /**
     * Common date range args for day aggregation.
     */
    protected function get_date_range_args(): array {
        return BBPA_REST_Query_Helpers::get_date_range_args();
    }

    /**
     * Common datetime range args for hour aggregation (same schema as day ranges).
     */
    private function get_datetime_range_args(): array {
        return BBPA_REST_Query_Helpers::get_date_range_args();
    }

    /**
     * Normalize a requested limit.
     */
    private function normalize_limit($limit): int {
        $limit = absint($limit);
        if ($limit === 0) {
            $limit = 10;
        }

        return min($limit, 100);
    }

    /**
     * Resolve day range with defaults.
     *
     * Delegates to the shared report helper so admin routes apply the same validation and
     * the same maximum range length as the public report routes.
     */
    protected function get_day_range(WP_REST_Request $request): array {
        return BBPA_REST_Query_Helpers::normalize_day_range($request);
    }

    /**
     * Resolve hour range with defaults.
     */
    private function get_hour_range(WP_REST_Request $request): array {
        return BBPA_REST_Query_Helpers::normalize_hour_range($request);
    }


    /**
     * Query visitor-level first views grouped into site-time hourly buckets.
     *
     * @return array<string, int>|null Null when no visitor-level rows exist in the requested range.
     */
    private function get_hourly_visitors_by_bucket(string $visitors_table, array $range): ?array {
        global $wpdb;

        $timezone = wp_timezone();
        $start = new DateTimeImmutable($range['start'], $timezone);
        $end = new DateTimeImmutable($range['end'], $timezone);
        $range_start = $start->getTimestamp();
        $range_end = $end->modify('+59 minutes +59 seconds')->getTimestamp();

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT visitor_id, first_view_at, device_class
                FROM {$visitors_table}
                WHERE first_view_at BETWEEN %d AND %d",
                $range_start,
                $range_end
            ),
            ARRAY_A
        );

        if (!is_array($rows) || $rows === []) {
            return null;
        }

        $visitors_by_bucket = [];
        $counted_visitors = [];
        foreach ($rows as $row) {
            $visitor_id = isset($row['visitor_id']) ? (string) $row['visitor_id'] : '';
            $first_view_at = isset($row['first_view_at']) ? (int) $row['first_view_at'] : 0;
            $device_class = isset($row['device_class'])
                ? strtolower(trim((string) $row['device_class']))
                : '';
            if (
                $visitor_id === ''
                || $first_view_at <= 0
                || $device_class === 'bot'
                || isset($counted_visitors[$visitor_id])
            ) {
                continue;
            }

            $bucket = wp_date('Y-m-d H:00:00', $first_view_at, $timezone);
            $visitors_by_bucket[$bucket] = ($visitors_by_bucket[$bucket] ?? 0) + 1;
            $counted_visitors[$visitor_id] = true;
        }

        return $visitors_by_bucket;
    }

    /**
     * Build an array of daily buckets for a range.
     */
    protected function get_day_buckets(string $start, string $end): array {
        return BBPA_REST_Query_Helpers::get_day_buckets($start, $end);
    }

    /**
     * Build an array of hourly buckets for a range.
     */
    private function get_hour_buckets(string $start, string $end): array {
        $timezone = wp_timezone();
        $start_date = new DateTimeImmutable($start, $timezone);
        $end_date = new DateTimeImmutable($end, $timezone);

        $period = new DatePeriod(
            $start_date,
            new DateInterval('PT1H'),
            $end_date->modify('+1 hour')
        );

        $buckets = [];
        foreach ($period as $date) {
            $buckets[] = $date->format('Y-m-d H:00:00');
        }

        return $buckets;
    }

    /**
     * Determine if a database table exists.
     */
    protected function table_exists(string $table): bool {
        return BBPA_REST_Query_Helpers::table_exists($table);
    }

    /**
     * Resolve cache TTL for admin analytics.
     */
    private function get_cache_ttl(): int {
        $ttl = (int) apply_filters('bbpa_admin_cache_ttl', 60);

        return max(30, min(120, $ttl));
    }

    /**
     * Build a cache key for admin analytics responses.
     */
    protected function get_cache_key(string $endpoint, array $params): string {
        $payload = [
            'endpoint' => $endpoint,
            'params' => $params,
        ];

        return bbpa_get_admin_cache_key(md5(wp_json_encode($payload)));
    }

    /**
     * Fetch cached response payload.
     */
    protected function get_cached_payload(string $cache_key): ?array {
        return BBPA_REST_Query_Helpers::get_cached_payload($cache_key, 'bbpa_admin');
    }

    /**
     * Store cached response payload.
     *
     * @param bool $persist Whether the payload is also stored as a transient. Free-text
     *                      searches only use the object cache, so they cannot fill the
     *                      options table with one transient per typed term.
     */
    protected function set_cached_payload(string $cache_key, array $payload, bool $persist = true): void {
        BBPA_REST_Query_Helpers::set_cached_payload($cache_key, $payload, 'bbpa_admin', $this->get_cache_ttl(), $persist);
    }

    /**
     * Normalize text values before REST JSON serialization.
     */
    private function normalize_json_text($value): string {
        if (!is_scalar($value)) {
            return '';
        }

        return wp_check_invalid_utf8((string) $value, true);
    }

    /**
     * Determine whether plugin debug mode is enabled.
     */
    private function is_debug_mode_enabled(): bool {
        return BBPA_REST_Query_Helpers::is_debug_mode_enabled();
    }

    /**
     * Write structured debug logs for admin analytics endpoints (debug level, written only in debug mode).
     */
    protected function log_debug(string $message, array $context = []): void {
        if (!$this->is_debug_mode_enabled()) {
            return;
        }

        BBPA_Logger::channel('Admin')->debug($message, $context);
    }
    /**
     * Add durable local favicons to the visible top-referrer rows only.
     *
     * Rows whose label is masked by the field visibility matrix keep no favicon, so the
     * favicon cannot reveal the hidden referrer domain.
     */
    private function add_cached_referrer_favicons(array $items): array {
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        if (empty($settings['referrer_favicons_enabled'])) { return $items; }
        $resolver = new BBPA_Favicon_Resolver();
        foreach ($items as &$item) {
            $domain = trim((string) ($item['label'] ?? ''));
            if ($domain === '') { continue; }
            $favicon = $resolver->get_cached_favicon_for_domain($domain);
            if (!empty($favicon['url']) && !empty($favicon['path'])) {
                $item['favicon'] = ['status' => 'available', 'url' => (string) $favicon['url'], 'is_local' => true];
            }
        }
        unset($item);
        return $items;
    }

}
