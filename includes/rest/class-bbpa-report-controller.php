<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
/*
 * Report queries interpolate table names from get_allowed_table()/bbpa_sql_table_name()
 * (closed allowlist), column names from closed allowlists (normalize_sorting(),
 * bbpa_sql_allowlisted_identifier()) and fixed SQL expressions built in this class; every
 * user value goes through $wpdb->prepare() placeholders. The sniffs below are disabled for
 * this class only and re-enabled at the end of the file.
 */
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * REST controller for report endpoints.
 */


class BBPA_Report_Controller {
    /**
     * Default maximum number of url_to_postid() lookups for one page-path report response.
     */
    private const DEFAULT_PAGE_TITLE_LOOKUP_LIMIT = 5000;

    /**
     * Largest per_page value whose payload is also persisted as a transient.
     */
    private const MAX_PERSISTED_PER_PAGE = 100;

    /**
     * Remaining page-title lookups for the page-path report being built; null means unlimited.
     */
    private ?int $page_title_lookups_remaining = null;

    /**
     * Per-request memo of table existence checks, keyed by table name.
     *
     * @var array<string, bool>
     */
    private array $table_exists_memo = [];

    /**
     * Per-request memo of column existence checks, keyed by "table|column".
     *
     * @var array<string, bool>
     */
    private array $table_column_memo = [];

    /**
     * Register routes for report data.
     */
    public function register_routes(): void {
        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/overview',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_overview'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'dashboard');
                },
                'args' => $this->get_date_range_args(),
            ]
        );

        $list_args = array_merge(
            $this->get_date_range_args(),
            $this->get_pagination_args()
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/top-pages',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_top_pages'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'top-pages');
                },
                'args' => array_merge(
                    $list_args,
                    [
                        'include_avg_time' => [
                            'required' => false,
                            'type' => 'boolean',
                            'default' => true,
                            'sanitize_callback' => 'rest_sanitize_boolean',
                        ],
                    ]
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/referrers',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_referrers'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'referrers');
                },
                'args' => $list_args,
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/referrer-sources',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_referrer_sources'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'referrers');
                },
                'args' => $list_args,
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/acquisition-channels',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_acquisition_channels'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'referrers');
                },
                'args' => $this->get_date_range_args(),
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/404s',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_not_found'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'top-pages');
                },
                'args' => $list_args,
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/search-terms',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_search_terms'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'search-terms');
                },
                'args' => $list_args,
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/geo-countries',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_geo_countries'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'geolocation');
                },
                'args' => $list_args,
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/entry-pages',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_entry_pages'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'top-pages');
                },
                'args' => array_merge(
                    $this->get_date_range_args(),
                    $this->get_pagination_args('entries')
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/exit-pages',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_exit_pages'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'top-pages');
                },
                'args' => array_merge(
                    $this->get_date_range_args(),
                    $this->get_pagination_args('exits')
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/visitors',
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_visitors'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'visitors');
                },
                'args' => array_merge(
                    $list_args,
                    [
                        'visitor_type' => [
                            'type' => 'string',
                            'required' => false,
                            'sanitize_callback' => 'sanitize_key',
                        ],
                    ]
                ),
            ]
        );

        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/purge',
            [
                'methods' => 'POST',
                'callback' => [$this, 'purge_cache'],
                'permission_callback' => function (WP_REST_Request $request) {
                    return $this->check_permissions_for_panel($request, 'settings');
                },
            ]
        );
    }

    /**
     * Permission check for report endpoints, scoped to the dashboard panel.
     *
     * The report routes use panel-scoped checks; this method is kept for backward
     * compatibility and for controllers extending this class.
     */
    public function check_permissions(WP_REST_Request $request) {
        return $this->check_permissions_for_panel($request, 'dashboard');
    }

    /**
     * Permission check for panel-scoped report endpoints.
     *
     * Protected so report controllers extending this class can scope their
     * routes to the panel that displays them.
     *
     * @return true|WP_Error
     */
    protected function check_permissions_for_panel(WP_REST_Request $request, string $panel) {
        return BBPA_REST_Query_Helpers::check_panel_permissions($request, $panel);
    }

    /**
     * Overview aggregation.
     */
    public function get_overview(WP_REST_Request $request): WP_REST_Response {
        $range = $this->get_day_range($request);
        $cache_key = $this->get_cache_key('overview-human-active-visitors', $range);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $overview = $this->build_overview_totals($range);
        $comparison_range = $this->get_previous_range($range);
        $comparison_overview = $this->build_overview_totals($comparison_range);
        $series = $this->build_overview_series($range);


        $payload = [
            'range' => $range,
            'comparison' => [
                'range' => $comparison_range,
                'overview' => $comparison_overview,
            ],
            'overview' => $overview,
            'series' => $series,
        ];

        $this->set_cached_payload($cache_key, $payload, 'overview');

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Top pages aggregation.
     */
    public function get_top_pages(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('daily');
        $response = $this->build_list_response($request, $table, 'page_path', 'top-pages');
        $payload = $response->get_data();

        // Raw stored path variants of the returned rows travel with the cached payload for the
        // average-time lookup below; they are never part of the REST response.
        $page_path_variants = [];
        if (is_array($payload) && array_key_exists('_page_path_variants', $payload)) {
            $page_path_variants = is_array($payload['_page_path_variants']) ? $payload['_page_path_variants'] : [];
            unset($payload['_page_path_variants']);
            $response->set_data($payload);
        }

        if (!is_array($payload) || !isset($payload['items']) || !is_array($payload['items']) || $payload['items'] === []) {
            return $response;
        }

        $include_avg_time = !($request->has_param('include_avg_time'))
            || rest_sanitize_boolean($request->get_param('include_avg_time'));
        if (!$include_avg_time) {
            return $response;
        }

        $range = $this->get_day_range($request);
        $payload['items'] = $this->append_top_pages_average_time($payload['items'], $range, $page_path_variants);
        $response->set_data($payload);

        return $response;
    }

    /**
     * Top referrers aggregation.
     */
    public function get_referrers(WP_REST_Request $request): WP_REST_Response {
        $range = $this->get_day_range($request);
        $page_path = $this->get_page_path_filter($request);

        // The cache is read before the source-table detection queries run.
        $cache_key = $this->get_source_report_cache_key('referrers', $request, $range, $page_path);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            $cached['items'] = $this->add_cached_favicons($cached['items'] ?? [], 'label');
            return new WP_REST_Response($cached, 200);
        }

        $source_category_table = $this->get_allowed_table('daily_source_category');
        if ($this->aggregate_table_has_rows_for_range($source_category_table, $range, $page_path)) {
            return $this->build_referrers_response($request, $source_category_table, true, $cache_key);
        }

        $daily_table = $this->get_allowed_table('daily');
        if ($this->aggregate_table_has_rows_for_range($daily_table, $range, $page_path)) {
            return $this->build_referrers_response($request, $daily_table, true, $cache_key);
        }

        return $this->build_referrers_response($request, $this->get_allowed_table('visitors'), false, $cache_key);
    }

    /**
     * Referrer sources aggregation.
     */
    public function get_referrer_sources(WP_REST_Request $request): WP_REST_Response {
        $range = $this->get_day_range($request);
        $page_path = $this->get_page_path_filter($request);

        // The cache is read before the source-table detection queries run.
        $cache_key = $this->get_source_report_cache_key('referrer-sources', $request, $range, $page_path);
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            $cached['items'] = $this->add_cached_favicons($cached['items'] ?? [], 'referrer_domain');
            return new WP_REST_Response($cached, 200);
        }

        $source_category_table = $this->get_allowed_table('daily_source_category');
        if ($this->aggregate_table_has_rows_for_range($source_category_table, $range, $page_path)) {
            return $this->build_referrer_sources_response($request, $source_category_table, true, true, $cache_key);
        }

        $daily_table = $this->get_allowed_table('daily');
        if ($this->aggregate_table_has_rows_for_range($daily_table, $range, $page_path)) {
            return $this->build_referrer_sources_response($request, $daily_table, true, false, $cache_key);
        }

        return $this->build_referrer_sources_response($request, $this->get_allowed_table('visitors'), false, true, $cache_key);
    }

    /**
     * Acquisition channel aggregation.
     */
    public function get_acquisition_channels(WP_REST_Request $request): WP_REST_Response {
        $range = $this->get_day_range($request);

        // The cache is read before the source-table detection queries run.
        $cache_key = $this->get_cache_key(
            'acquisition-channels',
            [
                'range' => $range,
                'contract' => 2,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $source_category_table = $this->get_allowed_table('daily_source_category');
        if ($this->aggregate_table_has_rows_for_range($source_category_table, $range)) {
            return $this->build_acquisition_channels_response($request, $source_category_table, true, true, $cache_key);
        }

        return $this->build_acquisition_channels_response($request, $this->get_allowed_table('visitors'), false, true, $cache_key);
    }

    /**
     * Build the response cache key of a referrer report before its source table is detected.
     *
     * The key only depends on request parameters, so a cache hit skips the table detection.
     */
    private function get_source_report_cache_key(string $cache_id, WP_REST_Request $request, array $range, string $page_path): string {
        return $this->get_cache_key(
            $cache_id,
            [
                'range' => $range,
                'pagination' => $this->normalize_pagination($request),
                'orderby' => sanitize_key((string) $request->get_param('orderby')),
                'order' => strtoupper(sanitize_key((string) $request->get_param('order'))) === 'ASC' ? 'ASC' : 'DESC',
                'search' => $this->get_search_term($request),
                'pagePath' => $page_path,
                'contract' => 2,
            ]
        );
    }

    /**
     * 404s aggregation.
     */
    public function get_not_found(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('not_found');
        $asset_filter = $this->get_not_found_page_filter_sql('page_path');

        return $this->build_list_response(
            $request,
            $table,
            'page_path',
            'not-found',
            'hits',
            [],
            'hits',
            $asset_filter['sql'],
            $asset_filter['args']
        );
    }

    /**
     * Search terms aggregation.
     */
    public function get_search_terms(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('search_terms');

        return $this->build_list_response($request, $table, 'search_term', 'search-terms');
    }

    /**
     * Top country aggregation.
     */
    public function get_geo_countries(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('geo_daily');

        return $this->build_geo_countries_response($request, $table);
    }

    /**
     * Entry pages aggregation.
     */
    public function get_entry_pages(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('entry_exit');

        [$frontend_only_sql, $frontend_only_args] = $this->get_frontend_page_filter_sql('page_path');

        return $this->build_list_response(
            $request,
            $table,
            'page_path',
            'entry-pages',
            'entries',
            [
                'entries' => 'metric',
                'label' => 'page_path',
            ],
            'entries',
            $frontend_only_sql,
            $frontend_only_args
        );
    }

    /**
     * Exit pages aggregation.
     */
    public function get_exit_pages(WP_REST_Request $request): WP_REST_Response {
        $table = $this->get_allowed_table('entry_exit');

        [$frontend_only_sql, $frontend_only_args] = $this->get_frontend_page_filter_sql('page_path');

        return $this->build_list_response(
            $request,
            $table,
            'page_path',
            'exit-pages',
            'exits',
            [
                'exits' => 'metric',
                'label' => 'page_path',
            ],
            'exits',
            $frontend_only_sql,
            $frontend_only_args
        );
    }


    /**
     * Visitors list from dedicated visitor records.
     */
    public function get_visitors(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;


        $range = $this->get_day_range($request);
        $pagination = $this->normalize_pagination($request);
        $search_term = $this->get_search_term($request);
        $page_path = $this->get_page_path_filter($request);
        // The filter runs once per request: the same map validates the sort key and resolves its column.
        $sorting_columns = apply_filters('bbpa_visitors_sorting_columns', [
            'pages' => 'total_views',
            'time_spent' => 'active_time_ms',
            'visitor' => 'visitor_id',
            'country' => 'country',
            'referrer' => 'referrer_domain',
            'source_category' => 'source_category',
            'browser' => 'browser',
            'device' => 'device_class',
            'os' => 'operating_system',
            'resolution' => 'screen_resolution',
            'first_view' => 'first_view_at',
            'last_view' => 'last_view_at',
        ]);
        $sorting = $this->normalize_sorting($request, $sorting_columns, 'first_view');

        $table = bbpa_sql_table_name('bbpa_visitors');
        $visitor_type = sanitize_key((string) $request->get_param('visitor_type'));
        if (!in_array($visitor_type, ['human', 'bot'], true)) {
            $visitor_type = 'human';
        }

        $cache_key = $this->get_cache_key(
            'visitors',
            [
                'range' => $range,
                'pagination' => $pagination,
                'sorting' => $sorting,
                'search' => $search_term,
                'pagePath' => $page_path,
                'visitorType' => $visitor_type,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            $cached['rawLogsEnabled'] = bbpa_raw_logs_enabled();
            $cached['items'] = $this->add_cached_favicons($cached['items'] ?? [], 'referrer_domain');

            return new WP_REST_Response($cached, 200);
        }

        $where = ['last_view_at BETWEEN %d AND %d'];
        $params = [
            bbpa_get_site_day_bounds($range['start'], $range['end'])[0],
            bbpa_get_site_day_bounds($range['start'], $range['end'])[1],
        ];
        if ($visitor_type === 'bot') {
            $where[] = 'device_class = %s';
            $params[] = 'bot';
        } else {
            $where[] = 'device_class <> %s';
            $params[] = 'bot';
        }

        if ($search_term !== '') {
            $like = '%' . $wpdb->esc_like($search_term) . '%';
            $allowed_search_columns = [
                'visitor_id', 'country', 'country_code', 'referrer_domain', 'source_category',
                'browser', 'browser_version', 'device_class', 'operating_system',
                'screen_resolution', 'entry_page', 'exit_page',
            ];
            $search_columns = apply_filters('bbpa_visitors_search_columns', $allowed_search_columns);
            $search_columns = array_values(array_intersect((array) $search_columns, apply_filters('bbpa_visitors_search_column_allowlist', $allowed_search_columns)));
            if ($search_columns !== []) {
                $where[] = '(' . implode(' OR ', array_map(static fn(string $column): string => $column . ' LIKE %s', $search_columns)) . ')';
                $params = array_merge($params, array_fill(0, count($search_columns), $like));
            }
        }

        if ($page_path !== '') {
            $where[] = '(entry_page = %s OR exit_page = %s)';
            $params[] = $page_path;
            $params[] = $page_path;
        }

        $where_parts = [];
        foreach ($where as $clause) {
            $where_parts[] = ['sql' => $clause, 'params' => []];
        }
        $where_compiled = bbpa_sql_build_where($where_parts);
        $where_sql = $where_compiled['sql'];
        $count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
        $total_items = (int) $wpdb->get_var($wpdb->prepare($count_sql, $params));

        $order_column = bbpa_sql_allowlisted_identifier((string) $sorting['orderby_key'], $sorting_columns, 'first_view');
        $order_direction = strtoupper($sorting['order']) === 'ASC' ? 'ASC' : 'DESC';

        $source_category_select = $this->table_has_column($table, 'source_category') ? 'source_category' : "'' AS source_category";

        $select_columns = apply_filters('bbpa_visitors_select_columns', []);
        $select_allowlist = apply_filters('bbpa_visitors_select_column_allowlist', []);
        $select_columns = array_values(array_intersect((array) $select_columns, (array) $select_allowlist));
        $extension_select = $select_columns !== [] ? ', ' . implode(', ', $select_columns) : '';

        $list_sql = "SELECT visitor_id, country_code, country{$extension_select}, total_views AS page_views, active_time_ms, referrer_domain, {$source_category_select}, browser, browser_version, device_class, operating_system, screen_resolution, has_enriched_data, entry_page, exit_page, first_view_at, last_view_at FROM {$table} WHERE {$where_sql} ORDER BY {$order_column} {$order_direction} LIMIT %d OFFSET %d";
        $list_params = array_merge($params, [$pagination['per_page'], $pagination['offset']]);
        $rows = $wpdb->get_results($wpdb->prepare($list_sql, $list_params), ARRAY_A);
        if (!is_array($rows)) {
            $rows = [];
        }

        $items = array_map(
            function (array $row): array {
                $item = [
                    'visitor_id' => sanitize_text_field((string) ($row['visitor_id'] ?? '')),
                    'country_code' => sanitize_text_field((string) ($row['country_code'] ?? '')),
                    'country' => sanitize_text_field((string) ($row['country'] ?? '')),
                    'page_views' => absint($row['page_views'] ?? 0),
                    'active_time_ms' => absint($row['active_time_ms'] ?? 0),
                    'referrer_domain' => sanitize_text_field((string) ($row['referrer_domain'] ?? '')),
                    'source_category' => sanitize_text_field((string) ($row['source_category'] ?? '')),
                    'browser' => sanitize_text_field((string) ($row['browser'] ?? '')),
                    'browser_version' => sanitize_text_field((string) ($row['browser_version'] ?? '')),
                    'device_class' => sanitize_text_field((string) ($row['device_class'] ?? '')),
                    'operating_system' => sanitize_text_field((string) ($row['operating_system'] ?? '')),
                    'screen_resolution' => $this->normalize_screen_resolution_for_reports(
                        sanitize_text_field((string) ($row['screen_resolution'] ?? ''))
                    ),
                    'has_enriched_data' => !empty($row['has_enriched_data']),
                    'entry_page' => bbpa_sanitize_page_path_value((string) ($row['entry_page'] ?? '')),
                    'exit_page' => bbpa_sanitize_page_path_value((string) ($row['exit_page'] ?? '')),
                    'first_view_at' => absint($row['first_view_at'] ?? 0),
                    'last_view_at' => absint($row['last_view_at'] ?? 0),
                ];

                $item = apply_filters('bbpa_visitors_response_item', $item, $row);
                return is_array($item) ? $item : [];
            },
            $rows
        );

        $items = $this->add_cached_favicons($items, 'referrer_domain');

        $payload = [
            'rawLogsEnabled' => bbpa_raw_logs_enabled(),
            'visitorType' => $visitor_type,
            'range' => $range,
            'pagination' => [
                'page' => $pagination['page'],
                'perPage' => $pagination['per_page'],
                'totalItems' => $total_items,
                'totalPages' => $pagination['per_page'] > 0
                    ? (int) ceil($total_items / $pagination['per_page'])
                    : 0,
            ],
            'items' => $items,
        ];

        $this->set_cached_payload(
            $cache_key,
            $payload,
            'visitors',
            $this->should_persist_cached_payload($search_term, $pagination)
        );

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Normalize exact viewport values into coarse viewport buckets.
     */
    private function normalize_screen_resolution_for_reports(string $screen_resolution): string {
        return BBPA_REST_Query_Helpers::normalize_screen_resolution_bucket($screen_resolution);
    }

    /**
     * Purge cached analytics data.
     */
    public function purge_cache(): WP_REST_Response {
        bbpa_flush_admin_cache();

        return new WP_REST_Response(
            [
                'purged' => true,
                'cacheVersion' => bbpa_get_admin_cache_version(),
            ],
            200
        );
    }

    /**
     * Common date range args for day aggregation.
     */
    protected function get_date_range_args(): array {
        return BBPA_REST_Query_Helpers::get_date_range_args();
    }

    /**
     * Pagination and sorting args.
     */
    protected function get_pagination_args(string $default_orderby = 'hits'): array {
        return BBPA_REST_Query_Helpers::get_pagination_args($default_orderby);
    }

    /**
     * Resolve a normalized optional page path filter.
     */
    protected function get_page_path_filter(WP_REST_Request $request): string {
        return BBPA_REST_Query_Helpers::normalize_page_path_filter($request);
    }

    /**
     * Resolve day range with defaults.
     */
    protected function get_day_range(WP_REST_Request $request): array {
        return BBPA_REST_Query_Helpers::normalize_day_range($request);
    }

    /**
     * Resolve inclusive day span for a range.
     */
    private function get_day_span(string $start, string $end): int {
        $start_timestamp = strtotime($start);
        $end_timestamp = strtotime($end);

        return (int) round(($end_timestamp - $start_timestamp) / DAY_IN_SECONDS) + 1;
    }

    /**
     * Resolve previous day range matching the length of the current range.
     */
    private function get_previous_range(array $range): array {
        $start_timestamp = strtotime($range['start']);
        $day_span = $this->get_day_span($range['start'], $range['end']);
        $previous_end = $start_timestamp - DAY_IN_SECONDS;
        $previous_start = $previous_end - (($day_span - 1) * DAY_IN_SECONDS);

        return [
            // Pure calendar arithmetic: strtotime() parses the days at UTC midnight, so format them in UTC too.
            'start' => gmdate('Y-m-d', $previous_start),
            'end' => gmdate('Y-m-d', $previous_end),
        ];
    }

    /**
     * Resolve hour range from a day range.
     */
    private function get_hour_range(array $range): array {
        return [
            'start' => $range['start'] . ' 00:00:00',
            'end' => $range['end'] . ' 23:00:00',
        ];
    }

    /**
     * Build overview totals for a given range.
     */
    private function build_overview_totals(array $range): array {
        // Source priority: canonical overview_daily aggregate table, then legacy fallback.
        global $wpdb;
        $overview_daily_table = bbpa_sql_table_name('bbpa_overview_daily');
        if ($this->table_exists($overview_daily_table)) {
            $overview_daily_query = $wpdb->prepare(
                "SELECT
                    COALESCE(SUM(page_views), 0) AS page_views,
                    COALESCE(SUM(visits), 0) AS visits,
                    COALESCE(SUM(visitors), 0) AS visitors,
                    COALESCE(SUM(bounces), 0) AS bounces,
                    COALESCE(SUM(active_ms_total), 0) AS active_ms_total,
                    COALESCE(SUM(visits_with_time), 0) AS visits_with_time,
                    COALESCE(SUM(bot_page_views), 0) AS bot_page_views
                FROM {$overview_daily_table}
                WHERE date_bucket BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            );
            $overview_daily_row = $wpdb->get_row($overview_daily_query, ARRAY_A);

            if (is_array($overview_daily_row)) {
                $has_rows = ((int) ($overview_daily_row['visits'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['page_views'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['visitors'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['bounces'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['active_ms_total'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['visits_with_time'] ?? 0)) > 0
                    || ((int) ($overview_daily_row['bot_page_views'] ?? 0)) > 0;

                if ($has_rows) {
                    return $this->build_overview_totals_from_overview_daily($range, $overview_daily_row);
                }
            }
        }

        return $this->build_overview_totals_legacy_fallback($range);
    }

    /**
     * Build overview totals from overview_daily plus secondary legacy metrics.
     */
    private function build_overview_totals_from_overview_daily(array $range, array $overview_daily_row): array {
        global $wpdb;

        $daily_table = $this->get_allowed_table('daily');
        $not_found_table = $this->get_allowed_table('not_found');
        $search_terms_table = $this->get_allowed_table('search_terms');

        $secondary_overview_query = $wpdb->prepare(
            "SELECT
                COUNT(DISTINCT page_path) AS unique_pages,
                COUNT(DISTINCT NULLIF(referrer_domain, '')) AS unique_referrers
            FROM {$daily_table}
            WHERE date_bucket BETWEEN %s AND %s
                AND device_class <> %s",
            $range['start'],
            $range['end'],
            'bot'
        );
        $secondary_overview_row = $wpdb->get_row($secondary_overview_query, ARRAY_A);
        if (!is_array($secondary_overview_row)) {
            $secondary_overview_row = [];
        }

        $not_found_query = $wpdb->prepare(
            "SELECT COALESCE(SUM(hits), 0) AS not_found_hits
            FROM {$not_found_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $not_found_row = $wpdb->get_row($not_found_query, ARRAY_A);
        if (!is_array($not_found_row)) {
            $not_found_row = [];
        }

        $search_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(hits), 0) AS search_hits,
                COUNT(DISTINCT search_term) AS unique_search_terms
            FROM {$search_terms_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $search_row = $wpdb->get_row($search_query, ARRAY_A);
        if (!is_array($search_row)) {
            $search_row = [];
        }

        $visits = isset($overview_daily_row['visits']) ? (int) $overview_daily_row['visits'] : 0;
        $canonical_visitors = $this->get_active_human_visitors_count($range);
        $visitors = $canonical_visitors !== null
            ? $canonical_visitors
            : (isset($overview_daily_row['visitors']) ? (int) $overview_daily_row['visitors'] : 0);
        if ($canonical_visitors === null && $visitors <= 0 && $visits > 0) {
            $visitors = $visits;
        }
        $active_ms_total = isset($overview_daily_row['active_ms_total']) ? (int) $overview_daily_row['active_ms_total'] : 0;
        $visits_with_time = isset($overview_daily_row['visits_with_time']) ? (int) $overview_daily_row['visits_with_time'] : 0;
        $visitor_avg_time_ms = $this->get_average_active_time_from_visitors($range);
        if ($visitor_avg_time_ms !== null) {
            $avg_time_per_visit_ms = $visitor_avg_time_ms;
        } else {
            $time_denominator = $visits_with_time > 0 ? $visits_with_time : $visits;
            $avg_time_per_visit_ms = ($active_ms_total > 0 && $time_denominator > 0)
                ? (int) floor($active_ms_total / $time_denominator)
                : 0;
        }

        return [
            'entries' => $visits,
            'visits' => $visits,
            'visitors' => $visitors,
            'avgTimePerVisitMs' => $avg_time_per_visit_ms,
            'avgTimePerVisitSeconds' => $avg_time_per_visit_ms / 1000,
            'pageViews' => isset($overview_daily_row['page_views']) ? (int) $overview_daily_row['page_views'] : 0,
            'uniquePages' => isset($secondary_overview_row['unique_pages']) ? (int) $secondary_overview_row['unique_pages'] : 0,
            'uniqueReferrers' => isset($secondary_overview_row['unique_referrers'])
                ? (int) $secondary_overview_row['unique_referrers']
                : 0,
            'notFoundHits' => isset($not_found_row['not_found_hits']) ? (int) $not_found_row['not_found_hits'] : 0,
            'searchHits' => isset($search_row['search_hits']) ? (int) $search_row['search_hits'] : 0,
            'uniqueSearchTerms' => isset($search_row['unique_search_terms'])
                ? (int) $search_row['unique_search_terms']
                : 0,
        ];
    }

    /**
     * Build overview totals using legacy aggregate tables only.
     */
    private function build_overview_totals_legacy_fallback(array $range): array {
        global $wpdb;

        $daily_table = $this->get_allowed_table('daily');
        $entry_exit_table = $this->get_allowed_table('entry_exit');
        $not_found_table = $this->get_allowed_table('not_found');
        $search_terms_table = $this->get_allowed_table('search_terms');
        $time_daily_table = $this->get_allowed_table('time_daily');

        $overview_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(hits), 0) AS page_views,
                COUNT(DISTINCT page_path) AS unique_pages,
                COUNT(DISTINCT NULLIF(referrer_domain, '')) AS unique_referrers
            FROM {$daily_table}
            WHERE date_bucket BETWEEN %s AND %s
                AND device_class <> %s",
            $range['start'],
            $range['end'],
            'bot'
        );
        $overview_row = $wpdb->get_row($overview_query, ARRAY_A);
        if (!is_array($overview_row)) {
            $overview_row = [];
        }
        $entries_query = $wpdb->prepare(
            "SELECT COALESCE(SUM(entries), 0) AS entries
            FROM {$entry_exit_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $entries_row = $wpdb->get_row($entries_query, ARRAY_A);
        if (!is_array($entries_row)) {
            $entries_row = [];
        }
        $not_found_query = $wpdb->prepare(
            "SELECT COALESCE(SUM(hits), 0) AS not_found_hits
            FROM {$not_found_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $not_found_row = $wpdb->get_row($not_found_query, ARRAY_A);
        if (!is_array($not_found_row)) {
            $not_found_row = [];
        }
        $search_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(hits), 0) AS search_hits,
                COUNT(DISTINCT search_term) AS unique_search_terms
            FROM {$search_terms_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $search_row = $wpdb->get_row($search_query, ARRAY_A);
        if (!is_array($search_row)) {
            $search_row = [];
        }
        $time_query = $wpdb->prepare(
            "SELECT
                COALESCE(SUM(active_ms_total), 0) AS active_ms_total,
                COALESCE(SUM(visits_with_time), 0) AS visits_with_time
            FROM {$time_daily_table}
            WHERE date_bucket BETWEEN %s AND %s",
            $range['start'],
            $range['end']
        );
        $time_row = $wpdb->get_row($time_query, ARRAY_A);
        if (!is_array($time_row)) {
            $time_row = [];
        }

        $entries = isset($entries_row['entries']) ? (int) $entries_row['entries'] : 0;
        $canonical_visitors = $this->get_active_human_visitors_count($range);
        $visitors = $canonical_visitors !== null ? $canonical_visitors : $entries;
        $active_ms_total = isset($time_row['active_ms_total']) ? (int) $time_row['active_ms_total'] : 0;
        $visits_with_time = isset($time_row['visits_with_time']) ? (int) $time_row['visits_with_time'] : 0;
        $time_denominator = $visits_with_time > 0 ? $visits_with_time : $entries;
        $avg_time_per_visit_ms = ($active_ms_total > 0 && $time_denominator > 0)
            ? (int) floor($active_ms_total / $time_denominator)
            : 0;

        return [
            'entries' => $entries,
            'visits' => $entries,
            'visitors' => $visitors,
            'avgTimePerVisitMs' => $avg_time_per_visit_ms,
            'avgTimePerVisitSeconds' => $avg_time_per_visit_ms / 1000,
            'pageViews' => isset($overview_row['page_views']) ? (int) $overview_row['page_views'] : 0,
            'uniquePages' => isset($overview_row['unique_pages']) ? (int) $overview_row['unique_pages'] : 0,
            'uniqueReferrers' => isset($overview_row['unique_referrers'])
                ? (int) $overview_row['unique_referrers']
                : 0,
            'notFoundHits' => isset($not_found_row['not_found_hits']) ? (int) $not_found_row['not_found_hits'] : 0,
            'searchHits' => isset($search_row['search_hits']) ? (int) $search_row['search_hits'] : 0,
            'uniqueSearchTerms' => isset($search_row['unique_search_terms'])
                ? (int) $search_row['unique_search_terms']
                : 0,
        ];
    }

    /**
     * Count active human visitors from visitor records for the requested range.
     */
    private function get_active_human_visitors_count(array $range): ?int {
        global $wpdb;
        $activity_table = bbpa_sql_table_name('bbpa_visitor_activity_daily');
        if ($this->table_exists($activity_table)) {
            return (int) $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT COUNT(DISTINCT visitor_id)
                    FROM {$activity_table}
                    WHERE date_bucket BETWEEN %s AND %s
                        AND device_class <> %s",
                    $range['start'],
                    $range['end'],
                    'bot'
                )
            );
        }

        $visitors_table = bbpa_sql_table_name('bbpa_visitors');
        if (!$this->table_exists($visitors_table)) {
            return null;
        }

        $start_timestamp = (int) bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
        $end_timestamp = (int) bbpa_get_site_day_bounds($range['start'], $range['end'])[1];

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(DISTINCT visitor_id)
                FROM {$visitors_table}
                WHERE last_view_at BETWEEN %d AND %d
                    AND device_class <> %s",
                $start_timestamp,
                $end_timestamp,
                'bot'
            )
        );
    }

    /**
     * Return average active time from visitor rows when visitor-level reporting is available.
     */
    private function get_average_active_time_from_visitors(array $range): ?int {
        global $wpdb;
        $visitors_table = bbpa_sql_table_name('bbpa_visitors');
        if (!$this->table_exists($visitors_table)) {
            return null;
        }

        $start_timestamp = (int) bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
        $end_timestamp = (int) bbpa_get_site_day_bounds($range['start'], $range['end'])[1];
        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT
                    COUNT(*) AS visit_count,
                    COALESCE(SUM(active_time_ms), 0) AS active_ms_total
                FROM {$visitors_table}
                WHERE last_view_at BETWEEN %d AND %d
                    AND device_class <> %s",
                $start_timestamp,
                $end_timestamp,
                'bot'
            ),
            ARRAY_A
        );

        if (!is_array($row)) {
            return null;
        }

        $visit_count = (int) ($row['visit_count'] ?? 0);
        if ($visit_count <= 0) {
            return null;
        }

        $active_ms_total = (int) ($row['active_ms_total'] ?? 0);
        if ($active_ms_total <= 0) {
            return 0;
        }

        return (int) floor($active_ms_total / $visit_count);
    }

    /**
     * Build overview timeseries payload.
     */
    private function build_overview_series(array $range): array {
        global $wpdb;

        $max_hourly_days = (int) apply_filters('bbpa_overview_hourly_days', 2);
        $day_span = ((strtotime($range['end']) - strtotime($range['start'])) / DAY_IN_SECONDS) + 1;
        $use_hourly = $max_hourly_days > 0
            && $day_span <= $max_hourly_days
            && bbpa_hourly_aggregation_enabled();

        if ($use_hourly) {
            $table = $this->get_allowed_table('hourly');
            $hour_range = $this->get_hour_range($range);
            $query = $wpdb->prepare(
                "SELECT date_bucket AS bucket, SUM(hits) AS hits
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s
                GROUP BY date_bucket
                ORDER BY date_bucket ASC",
                $hour_range['start'],
                $hour_range['end']
            );
        } else {
            $overview_table = $this->get_allowed_table('overview_daily');
            $overview_exists = $this->table_exists($overview_table);
            if ($overview_exists) {
                $query = $wpdb->prepare(
                    "SELECT date_bucket AS bucket, SUM(page_views) AS hits
                    FROM {$overview_table}
                    WHERE date_bucket BETWEEN %s AND %s
                    GROUP BY date_bucket
                    ORDER BY date_bucket ASC",
                    $range['start'],
                    $range['end']
                );
            } else {
                $table = $this->get_allowed_table('daily');
                $query = $wpdb->prepare(
                    "SELECT date_bucket AS bucket, SUM(hits) AS hits
                    FROM {$table}
                    WHERE date_bucket BETWEEN %s AND %s
                    GROUP BY date_bucket
                    ORDER BY date_bucket ASC",
                    $range['start'],
                    $range['end']
                );
            }
        }

        $rows = $wpdb->get_results($query, ARRAY_A);
        $items = array_map(
            static function (array $row): array {
                return [
                    'bucket' => $row['bucket'],
                    'hits' => (int) $row['hits'],
                ];
            },
            $rows ?: []
        );

        return [
            'interval' => $use_hourly ? 'hour' : 'day',
            'items' => $items,
        ];
    }

    /**
     * Normalize pagination values.
     */
    protected function normalize_pagination(WP_REST_Request $request): array {
        return BBPA_REST_Query_Helpers::normalize_pagination($request);
    }

    /**
     * Normalize orderby and order values.
     */
    protected function normalize_sorting(WP_REST_Request $request, array $allowed_orderby, string $default): array {
        return BBPA_REST_Query_Helpers::normalize_sorting($request, $allowed_orderby, $default);
    }

    /**
     * Resolve a normalized search term from request params.
     */
    protected function get_search_term(WP_REST_Request $request): string {
        return BBPA_REST_Query_Helpers::normalize_search_term($request);
    }

    /**
     * Check whether a value contains the provided search term.
     */
    private function string_contains_search(string $value, string $search_term): bool {
        if ($search_term === '') {
            return true;
        }

        if (function_exists('mb_stripos')) {
            return mb_stripos($value, $search_term, 0, 'UTF-8') !== false;
        }

        return stripos($value, $search_term) !== false;
    }

    /**
     * Append average active time metrics for top-pages rows.
     *
     * Data source: bbpa_page_time_daily.active_ms_total / visits_with_time.
     * Semantic: avg_time_on_page_ms is the average active time spent on each page, summed over
     * every stored variant of the row path (query-string, trailing-slash and absolute URL
     * variants merged into the row), like the row `hits`.
     *
     * @param array<int, string> $page_path_variants Stored page_path values of the returned rows.
     */
    private function append_top_pages_average_time(array $items, array $range, array $page_path_variants = []): array {
        global $wpdb;

        $lookup_paths = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
            if ($label === '') {
                continue;
            }

            $lookup_paths[$label] = true;
        }

        if ($lookup_paths === []) {
            return $items;
        }

        foreach ($page_path_variants as $variant) {
            if (is_scalar($variant) && (string) $variant !== '') {
                $lookup_paths[(string) $variant] = true;
            }
        }
        $lookup_paths = array_map('strval', array_keys($lookup_paths));

        $page_time_table = $this->get_allowed_table('page_time_daily');
        $query = $wpdb->prepare(
            "SELECT page_path, SUM(active_ms_total) AS total_active_time_ms, SUM(visits_with_time) AS visits_count
            FROM {$page_time_table}
            WHERE date_bucket BETWEEN %s AND %s
                AND page_path IN (" . $this->build_string_placeholders($lookup_paths) . ")
            GROUP BY page_path",
            array_merge([$range['start'], $range['end']], $lookup_paths)
        );

        $rows = $wpdb->get_results($query, ARRAY_A);
        $totals_by_label = [];
        foreach ($rows ?: [] as $row) {
            $stored_path = bbpa_sanitize_page_path_value($row['page_path'] ?? '');
            if ($stored_path === '') {
                continue;
            }

            $label = $this->normalize_report_page_path($stored_path);
            if (!isset($totals_by_label[$label])) {
                $totals_by_label[$label] = [
                    'active_ms' => 0,
                    'visits' => 0,
                ];
            }

            $totals_by_label[$label]['active_ms'] += isset($row['total_active_time_ms']) ? (int) $row['total_active_time_ms'] : 0;
            $totals_by_label[$label]['visits'] += isset($row['visits_count']) ? (int) $row['visits_count'] : 0;
        }

        $average_time_by_label = [];
        foreach ($totals_by_label as $label => $totals) {
            $average_time_by_label[$label] = (int) floor($totals['active_ms'] / max(1, $totals['visits']));
        }

        return array_map(
            function (array $item) use ($average_time_by_label): array {
                $label = isset($item['label']) ? $this->normalize_report_page_path(bbpa_sanitize_page_path_value($item['label'])) : '';
                $average_time_ms = $average_time_by_label[$label] ?? 0;
                $item['avg_time_on_page_ms'] = $average_time_ms;
                $item['avg_time_on_page_seconds'] = $average_time_ms / 1000;

                return $item;
            },
            $items
        );
    }

    /**
     * Resolve an allowlisted report table.
     */
    protected function get_allowed_table(string $key): string {
        $table_suffixes = [
            'daily' => 'bbpa_daily',
            'visitors' => 'bbpa_visitors',
            'hits_daily' => 'bbpa_hits_daily',
            'daily_source_category' => 'bbpa_daily_source_category',
            'entry_exit' => 'bbpa_entry_exit_daily',
            'not_found' => 'bbpa_404s_daily',
            'search_terms' => 'bbpa_search_terms_daily',
            'geo_daily' => 'bbpa_geo_daily',
            'hourly' => 'bbpa_hourly',
            'overview_daily' => 'bbpa_overview_daily',
            'time_daily' => 'bbpa_time_daily',
            'page_time_daily' => 'bbpa_page_time_daily',
            'visitor_activity_daily' => 'bbpa_visitor_activity_daily',
        ];

        $suffix = $table_suffixes[$key] ?? 'bbpa_daily';

        return bbpa_sql_table_name($suffix);
    }

    /**
     * Build paginated list response for a given table/label column.
     */
    private function build_list_response(
        WP_REST_Request $request,
        string $table,
        string $label_column,
        string $cache_id,
        string $metric_column = 'hits',
        array $allowed_orderby = [],
        string $default_orderby = 'hits',
        string $extra_where_sql = '',
        array $extra_where_args = []
    ): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $pagination = $this->normalize_pagination($request);
        $search_term = $this->get_search_term($request);
        $exclude_zero = rest_sanitize_boolean($request->get_param('exclude_zero'));
        $page_path = $this->get_page_path_filter($request);
        $is_page_path_table = $label_column === 'page_path';
        $page_path_sql = '';
        $page_path_args = [];
        if ($is_page_path_table && $page_path !== '') {
            $page_path_sql = " AND {$label_column} = %s";
            $page_path_args[] = $page_path;
        }

        if ($allowed_orderby === []) {
            $allowed_orderby = [
                'hits' => 'metric',
                'label' => $label_column,
            ];
        }
        if ($is_page_path_table && !isset($allowed_orderby['page_title'])) {
            $allowed_orderby['page_title'] = 'page_title';
        }
        if ($default_orderby !== '' && !isset($allowed_orderby[$default_orderby])) {
            $allowed_orderby[$default_orderby] = 'metric';
        }
        if ($default_orderby === '') {
            $default_orderby = array_key_first($allowed_orderby) ?: 'hits';
        }
        $sorting = $this->normalize_sorting(
            $request,
            $allowed_orderby,
            $default_orderby
        );
        $cache_key = $this->get_cache_key(
            $cache_id,
            [
                'range' => $range,
                'pagination' => $pagination,
                'sorting' => $sorting,
                'search' => $search_term,
                'excludeZero' => $exclude_zero,
                'pagePath' => $page_path,
                'includeViewsSeries' => $cache_id === 'top-pages',
                'sortVersion' => $cache_id === 'top-pages' ? 5 : 1,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        $page_path_variants = [];
        if ($is_page_path_table) {
            $all_rows_sql = "SELECT {$label_column} AS label, SUM({$metric_column}) AS metric
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s{$extra_where_sql}{$page_path_sql}";
            $all_rows_args = [$range['start'], $range['end']];
            $all_rows_args = array_merge($all_rows_args, $extra_where_args);
            $all_rows_args = array_merge($all_rows_args, $page_path_args);
            if ($search_term !== '' && $sorting['orderby_key'] !== 'page_title') {
                $all_rows_sql .= " AND {$label_column} LIKE %s";
                $all_rows_args[] = '%' . $wpdb->esc_like($search_term) . '%';
            }
            $all_rows_sql .= " GROUP BY {$label_column}";
            if ($exclude_zero) {
                $all_rows_sql .= " HAVING SUM({$metric_column}) > 0";
            }

            $all_rows_query = $wpdb->prepare($all_rows_sql, ...$all_rows_args);
            $all_rows = $wpdb->get_results($all_rows_query, ARRAY_A) ?: [];

            // Without a page_path filter or SQL search, $all_rows lists every stored path of the range.
            $all_rows_cover_range = $page_path === ''
                && ($search_term === '' || $sorting['orderby_key'] === 'page_title');

            $this->page_title_lookups_remaining = $this->get_page_title_lookup_limit($cache_id);
            try {
                $page_path_result = $this->build_page_path_report_rows(
                    $all_rows,
                    $table,
                    $cache_id,
                    $metric_column,
                    $sorting,
                    $pagination,
                    $range,
                    $search_term,
                    $all_rows_cover_range
                );
            } finally {
                $this->page_title_lookups_remaining = null;
            }

            $items = $page_path_result['items'];
            $total_items = $page_path_result['total'];
            $page_path_variants = $page_path_result['variants'];
        } else {
            $search_sql = '';
            $search_args = [];
            if ($search_term !== '') {
                $search_sql = " AND {$label_column} LIKE %s";
                $search_args[] = '%' . $wpdb->esc_like($search_term) . '%';
            }

            $count_query_args = array_merge([$range['start'], $range['end']], $extra_where_args, $page_path_args, $search_args);
            $count_query = $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s{$extra_where_sql}{$page_path_sql}{$search_sql}
                GROUP BY {$label_column}" . ($exclude_zero ? " HAVING SUM({$metric_column}) > 0" : '') . ") AS totals",
                $count_query_args
            );
            $total_items = (int) $wpdb->get_var($count_query);

            $list_query_args = array_merge(
                [$range['start'], $range['end']],
                $extra_where_args,
                $page_path_args,
                $search_args,
                [$pagination['per_page'], $pagination['offset']]
            );
            $list_query = $wpdb->prepare(
                "SELECT {$label_column} AS label, SUM({$metric_column}) AS metric
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s{$extra_where_sql}{$page_path_sql}{$search_sql}
                GROUP BY {$label_column}
                " . ($exclude_zero ? "HAVING SUM({$metric_column}) > 0" : '') . "
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $list_query_args
            );

            $rows = $wpdb->get_results($list_query, ARRAY_A);
            $items = array_map(
                function (array $row) use ($metric_column, $is_page_path_table): array {
                    $label = isset($row['label']) ? sanitize_text_field((string) $row['label']) : '';
                    $item = [
                        'label' => $label,
                        $metric_column => isset($row['metric']) ? (int) $row['metric'] : 0,
                    ];

                    if ($is_page_path_table) {
                        $item['page_title'] = $this->resolve_page_title_from_path($label);
                    }

                    return $item;
                },
                $rows ?: []
            );
        }

        $payload = [
            'range' => $range,
            'pagination' => [
                'page' => $pagination['page'],
                'perPage' => $pagination['per_page'],
                'totalItems' => $total_items,
                'totalPages' => $pagination['per_page'] > 0
                    ? (int) ceil($total_items / $pagination['per_page'])
                    : 0,
            ],
            'items' => $items,
        ];

        if ($cache_id === 'top-pages') {
            // Internal key consumed and removed by get_top_pages(); cached with the payload.
            $payload['_page_path_variants'] = $page_path_variants;
        }

        $this->set_cached_payload(
            $cache_key,
            $payload,
            $cache_id,
            $this->should_persist_cached_payload($search_term, $pagination)
        );

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Merge, filter, sort and paginate page-path report rows.
     *
     * Page titles are resolved lazily, only for rows whose title decides filtering, ordering
     * or display, instead of one url_to_postid() lookup per distinct stored path. The result
     * is identical to resolving every title up front.
     *
     * @param array<int, array<string, mixed>> $all_rows Grouped rows (`label`, `metric`) of the range.
     * @param bool $all_rows_cover_range Whether $all_rows lists every stored path of the range.
     * @return array{items: array<int, array<string, mixed>>, total: int, variants: array<int, string>}
     */
    private function build_page_path_report_rows(
        array $all_rows,
        string $table,
        string $cache_id,
        string $metric_column,
        array $sorting,
        array $pagination,
        array $range,
        string $search_term,
        bool $all_rows_cover_range
    ): array {
        $items = array_map(
            static function (array $row) use ($metric_column): array {
                $label = bbpa_sanitize_page_path_value($row['label'] ?? '');

                return [
                    'label' => $label,
                    // Resolved on demand from the stored path of the first merged variant.
                    'page_title' => null,
                    $metric_column => isset($row['metric']) ? (int) $row['metric'] : 0,
                    '_title_path' => $label,
                ];
            },
            $all_rows
        );

        if ($search_term !== '' && $sorting['orderby_key'] === 'page_title') {
            $matching_items = [];
            foreach ($items as $item) {
                if ($this->string_contains_search((string) $item['label'], $search_term)) {
                    $matching_items[] = $item;
                    continue;
                }

                $item['page_title'] = $this->resolve_page_title_from_path((string) $item['_title_path']);
                if ($this->string_contains_search($item['page_title'], $search_term)) {
                    $matching_items[] = $item;
                }
            }
            $items = $matching_items;
        }

        $items = $this->merge_page_path_items($items, $metric_column);

        if ($cache_id === 'top-pages') {
            // Top pages keep only the homepage and rows resolving to a WordPress post. That rule
            // already drops every unresolved path tracked as a 404, so the 404 exclusion of the
            // other page reports would not change the result.
            $items = $this->filter_resolved_page_path_items($items, $metric_column);
        } elseif ($cache_id !== 'not-found') {
            $items = $this->exclude_not_found_page_path_items($items, $range, $metric_column);
        }

        $total_items = count($items);
        $items = $this->sort_and_slice_page_path_items(
            $items,
            $metric_column,
            $sorting,
            (int) $pagination['offset'],
            (int) $pagination['per_page']
        );

        foreach ($items as $index => $item) {
            if ($item['page_title'] === null) {
                $item['page_title'] = $this->resolve_page_title_from_path((string) $item['_title_path']);
            }
            unset($item['_title_path']);
            $items[$index] = $item;
        }

        $variants = [];
        if ($cache_id === 'top-pages') {
            $variants = $this->get_page_path_variants_for_items($items, $table, $range, $all_rows_cover_range ? $all_rows : null);
            $items = $this->append_top_pages_views_series($items, $range, $variants);
        }

        return [
            'items' => $items,
            'total' => $total_items,
            'variants' => $variants,
        ];
    }

    /**
     * Keep the homepage and the page-path rows that resolve to a WordPress post (top pages).
     */
    private function filter_resolved_page_path_items(array $items, string $metric_column): array {
        $candidates = [];
        foreach ($items as $item) {
            $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
            if (!$this->is_home_page_path($label)) {
                $candidates[] = [
                    'path' => $label,
                    'metric' => (int) ($item[$metric_column] ?? 0),
                ];
            }
        }
        $this->prime_page_titles($candidates);

        return array_values(
            array_filter(
                $items,
                function (array $item): bool {
                    $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
                    if ($this->is_home_page_path($label)) {
                        return true;
                    }

                    return $this->resolve_page_title_from_path($label) !== '';
                }
            )
        );
    }

    /**
     * Sort page-path rows and return the requested page.
     *
     * Rows are ordered like sort_page_path_report_items(). For metric sorts, titles are only
     * resolved for the groups of equal metric values that overlap the requested page, because
     * titles only break ties inside such groups.
     */
    private function sort_and_slice_page_path_items(array $items, string $metric_column, array $sorting, int $offset, int $length): array {
        $items = array_values($items);
        $orderby_key = isset($sorting['orderby_key']) ? (string) $sorting['orderby_key'] : $metric_column;

        if ($orderby_key === 'page_title') {
            $items = $this->resolve_page_path_item_titles($items, $metric_column);

            return array_slice($this->sort_page_path_report_items($items, $metric_column, $sorting), $offset, $length);
        }

        if ($orderby_key === 'label') {
            return array_slice($this->sort_page_path_report_items($items, $metric_column, $sorting), $offset, $length);
        }

        $sort_direction = ($sorting['order'] ?? 'DESC') === 'DESC' ? -1 : 1;
        $positions = array_keys($items);
        usort(
            $positions,
            static function (int $left, int $right) use ($items, $metric_column, $sort_direction): int {
                $left_metric = (int) ($items[$left][$metric_column] ?? 0);
                $right_metric = (int) ($items[$right][$metric_column] ?? 0);
                if ($left_metric !== $right_metric) {
                    return ($left_metric <=> $right_metric) * $sort_direction;
                }

                return $left <=> $right;
            }
        );

        $ordered = [];
        foreach ($positions as $position) {
            $ordered[] = $items[$position];
        }

        $count = count($ordered);
        $slice_end = $offset + $length;
        $group_start = 0;
        while ($group_start < $count && $group_start < $slice_end) {
            $group_metric = (int) ($ordered[$group_start][$metric_column] ?? 0);
            $group_end = $group_start;
            while ($group_end + 1 < $count && (int) ($ordered[$group_end + 1][$metric_column] ?? 0) === $group_metric) {
                $group_end++;
            }

            if ($group_end >= $offset && $group_end > $group_start) {
                $group = array_slice($ordered, $group_start, $group_end - $group_start + 1);
                $group = $this->resolve_page_path_item_titles($group, $metric_column);
                $group = $this->sort_page_path_report_items($group, $metric_column, $sorting);
                foreach ($group as $group_index => $group_item) {
                    $ordered[$group_start + $group_index] = $group_item;
                }
            }

            $group_start = $group_end + 1;
        }

        return array_slice($ordered, $offset, $length);
    }

    /**
     * Resolve the display title of page-path rows whose title is still unknown.
     *
     * Rows are resolved by descending metric so the lookup limit keeps the busiest rows.
     */
    private function resolve_page_path_item_titles(array $items, string $metric_column): array {
        $pending = [];
        foreach ($items as $index => $item) {
            if (array_key_exists('page_title', $item) && $item['page_title'] === null) {
                $pending[] = $index;
            }
        }

        usort(
            $pending,
            static function ($left, $right) use ($items, $metric_column): int {
                $left_metric = (int) ($items[$left][$metric_column] ?? 0);
                $right_metric = (int) ($items[$right][$metric_column] ?? 0);
                if ($left_metric !== $right_metric) {
                    return $right_metric <=> $left_metric;
                }

                return $left <=> $right;
            }
        );

        foreach ($pending as $index) {
            $title_path = (string) ($items[$index]['_title_path'] ?? ($items[$index]['label'] ?? ''));
            $items[$index]['page_title'] = $this->resolve_page_title_from_path($title_path);
        }

        return $items;
    }

    /**
     * Resolve page titles for candidate paths, busiest first, before a filter reads them.
     *
     * With a lookup limit in place this decides which paths get a url_to_postid() lookup.
     *
     * @param array<int, array{path: string, metric: int}> $candidates
     */
    private function prime_page_titles(array $candidates): void {
        if ($this->page_title_lookups_remaining === null || $candidates === []) {
            return;
        }

        usort(
            $candidates,
            static function (array $left, array $right): int {
                if ($left['metric'] !== $right['metric']) {
                    return $right['metric'] <=> $left['metric'];
                }

                return strcmp($left['path'], $right['path']);
            }
        );

        foreach ($candidates as $candidate) {
            if ($this->page_title_lookups_remaining !== null && $this->page_title_lookups_remaining <= 0) {
                return;
            }

            $this->resolve_page_title_from_path($candidate['path']);
        }
    }

    /**
     * Resolve the page-title lookup limit for one page-path report response.
     */
    private function get_page_title_lookup_limit(string $endpoint): ?int {
        /**
         * Filters the maximum number of page-title lookups (url_to_postid()) performed to build
         * one page-path report response (top pages, entry pages, exit pages, 404s).
         *
         * Rows beyond the limit are handled as rows without a WordPress post title. Return 0 or
         * a negative value to remove the limit.
         *
         * @param int    $limit    Default 5000.
         * @param string $endpoint Report identifier: top-pages, entry-pages, exit-pages or not-found.
         */
        $limit = (int) apply_filters('bbpa_report_page_title_lookup_limit', self::DEFAULT_PAGE_TITLE_LOOKUP_LIMIT, $endpoint);

        return $limit > 0 ? $limit : null;
    }

    /**
     * Collect the stored page_path values of the range that normalize to the given rows.
     *
     * @param array<int, array<string, mixed>>|null $all_rows Grouped rows covering every stored
     *                                                        path of the range, or null to query them.
     * @return array<int, string>
     */
    private function get_page_path_variants_for_items(array $items, string $table, array $range, ?array $all_rows): array {
        global $wpdb;

        $labels = [];
        foreach ($items as $item) {
            $label = $this->normalize_report_page_path(bbpa_sanitize_page_path_value($item['label'] ?? ''));
            if ($label !== '') {
                $labels[$label] = true;
            }
        }

        if ($labels === []) {
            return [];
        }

        if ($all_rows === null) {
            $stored_paths = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT DISTINCT page_path
                    FROM {$table}
                    WHERE date_bucket BETWEEN %s AND %s",
                    $range['start'],
                    $range['end']
                )
            ) ?: [];
        } else {
            $stored_paths = array_map(
                static function (array $row): string {
                    return (string) ($row['label'] ?? '');
                },
                $all_rows
            );
        }

        $variants = [];
        foreach ($stored_paths as $stored_path) {
            $stored_path = (string) $stored_path;
            if (isset($variants[$stored_path])) {
                continue;
            }

            $label = $this->normalize_report_page_path(bbpa_sanitize_page_path_value($stored_path));
            if (isset($labels[$label])) {
                $variants[$stored_path] = true;
            }
        }

        return array_map('strval', array_keys($variants));
    }

    /**
     * Build a prepared-statement placeholder list for raw string values.
     */
    private function build_string_placeholders(array $values): string {
        return implode(', ', array_fill(0, count($values), '%s'));
    }

    /**
     * Whether a response payload is also persisted as a transient.
     *
     * Free-text searches and large pages are cached in the object cache only, so they cannot
     * fill the options table with one transient per typed term.
     */
    private function should_persist_cached_payload(string $search_term, array $pagination): bool {
        return $search_term === '' && (int) ($pagination['per_page'] ?? 0) <= self::MAX_PERSISTED_PER_PAGE;
    }

    /**
     * Append compact daily page-view series to top-pages rows.
     *
     * @param array<int, string> $page_path_variants Stored page_path values of the returned rows.
     */
    private function append_top_pages_views_series(array $items, array $range, array $page_path_variants = []): array {
        global $wpdb;

        if ($items === []) {
            return $items;
        }

        $buckets = $this->get_day_buckets($range['start'], $range['end']);
        $empty_series = array_fill(0, count($buckets), 0);
        $bucket_indexes = array_flip($buckets);
        $labels = [];
        foreach ($items as $item) {
            $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
            $normalized_label = $this->normalize_report_page_path($label);
            if ($normalized_label !== '') {
                $labels[$normalized_label] = true;
            }
        }

        if ($labels === []) {
            return array_map(
                static function (array $item) use ($empty_series): array {
                    $item['views_series'] = $empty_series;

                    return $item;
                },
                $items
            );
        }

        $table = $this->get_allowed_table('daily');
        $series_by_label = [];
        foreach (array_keys($labels) as $label) {
            $series_by_label[$label] = $empty_series;
        }

        // Only the stored variants of the returned rows are read, instead of every path of the range.
        $rows = [];
        if ($page_path_variants !== []) {
            $query = $wpdb->prepare(
                "SELECT date_bucket, page_path, SUM(hits) AS hits
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s
                    AND page_path IN (" . $this->build_string_placeholders($page_path_variants) . ")
                GROUP BY date_bucket, page_path",
                array_merge([$range['start'], $range['end']], array_values($page_path_variants))
            );
            $rows = $wpdb->get_results($query, ARRAY_A) ?: [];
        }

        foreach ($rows as $row) {
            $bucket = isset($row['date_bucket']) ? (string) $row['date_bucket'] : '';
            if (!isset($bucket_indexes[$bucket])) {
                continue;
            }

            $label = $this->normalize_report_page_path(bbpa_sanitize_page_path_value($row['page_path'] ?? ''));
            if ($label === '' || !isset($series_by_label[$label])) {
                continue;
            }

            $series_by_label[$label][$bucket_indexes[$bucket]] += (int) ($row['hits'] ?? 0);
        }

        return array_map(
            function (array $item) use ($series_by_label, $empty_series): array {
                $label = isset($item['label']) ? $this->normalize_report_page_path(bbpa_sanitize_page_path_value($item['label'])) : '';
                $item['views_series'] = $series_by_label[$label] ?? $empty_series;

                return $item;
            },
            $items
        );
    }

    /**
     * Build an array of daily buckets for a range.
     */
    private function get_day_buckets(string $start, string $end): array {
        return BBPA_REST_Query_Helpers::get_day_buckets($start, $end);
    }

    /**
     * Build SQL filters that keep only front-end page paths.
     */
    private function get_frontend_page_filter_sql(string $label_column): array {
        return [
            " AND {$label_column} NOT LIKE %s",
            ['/wp-admin/%'],
        ];
    }

    /**
     * Build SQL filters that keep only page-like 404 paths in the report.
     */
    private function get_not_found_page_filter_sql(string $label_column): array {
        $asset_like_patterns = [
            '/wp-content/%',
            '/wp-includes/%',
            '/%.css',
            '/%.js',
            '/%.map',
            '/%.json',
            '/%.xml',
            '/%.txt',
            '/%.ico',
            '/%.png',
            '/%.jpg',
            '/%.jpeg',
            '/%.gif',
            '/%.svg',
            '/%.webp',
            '/%.avif',
            '/%.pdf',
            '/%.zip',
            '/%.woff',
            '/%.woff2',
            '/%.ttf',
            '/%.eot',
            '/%.otf',
        ];

        $conditions = ["{$label_column} <> ''", "{$label_column} <> '/'"];
        $arguments = [];

        foreach ($asset_like_patterns as $pattern) {
            $conditions[] = "LOWER({$label_column}) NOT LIKE %s";
            $arguments[] = $pattern;
        }

        // Technical /.well-known endpoints (with or without a sub-path or query string) are excluded before
        // counting and pagination, so totals, pages and exports stay consistent.
        $conditions[] = "LOWER({$label_column}) <> %s";
        $arguments[] = '/.well-known';
        foreach (['/.well-known/%', '/.well-known?%', '/.well-known#%'] as $pattern) {
            $conditions[] = "LOWER({$label_column}) NOT LIKE %s";
            $arguments[] = $pattern;
        }

        return [
            'sql' => ' AND ' . implode(' AND ', $conditions),
            'args' => $arguments,
        ];
    }

    /**
     * Build visit totals by acquisition channel.
     */
    private function build_acquisition_channels_response(
        WP_REST_Request $request,
        string $table,
        bool $is_aggregate_table,
        bool $aggregate_has_source_category = true,
        string $cache_key = ''
    ): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $cache_id = 'acquisition-channels';
        $source_category_sql = $this->resolve_source_category_sql_expression($is_aggregate_table, $aggregate_has_source_category);

        if ($is_aggregate_table) {
            $range_start = gmdate('Y-m-d', strtotime($range['start'] . ' 00:00:00'));
            $range_end = gmdate('Y-m-d', strtotime($range['end'] . ' 23:59:59'));
            $date_column = $this->resolve_date_bucket_column($table);
            $visit_metric_sql = $this->table_has_column($table, 'visits')
                ? 'SUM(visits)'
                // Legacy aggregate tables store only page-view hits. This path is kept only
                // when no visit-capable acquisition aggregate exists for the requested range.
                : 'SUM(hits)';
            $query = $wpdb->prepare(
                "SELECT {$source_category_sql} AS channel, {$visit_metric_sql} AS visits
                FROM {$table}
                WHERE {$date_column} BETWEEN %s AND %s
                GROUP BY {$source_category_sql}
                ORDER BY visits DESC",
                $range_start,
                $range_end
            );
        } else {
            $range_start = bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
            $range_end = bbpa_get_site_day_bounds($range['start'], $range['end'])[1];
            $query = $wpdb->prepare(
                "SELECT {$source_category_sql} AS channel, COUNT(*) AS visits
                FROM {$table}
                WHERE first_view_at BETWEEN %d AND %d
                GROUP BY {$source_category_sql}
                ORDER BY visits DESC",
                $range_start,
                $range_end
            );
        }

        $rows = $wpdb->get_results($query, ARRAY_A);
        $this->log_report_debug('Acquisition channels report queried.', [
            'table' => $table,
            'aggregate' => $is_aggregate_table,
            'aggregateHasSourceCategory' => $aggregate_has_source_category,
            'range' => $range,
            'row_count' => is_array($rows) ? count($rows) : 0,
            'db_error' => (string) $wpdb->last_error,
        ]);
        $total = 0;
        foreach ($rows ?: [] as $row) {
            $total += isset($row['visits']) ? (int) $row['visits'] : 0;
        }

        $items = array_map(
            static function (array $row) use ($total): array {
                $channel = isset($row['channel']) ? sanitize_text_field((string) $row['channel']) : '';
                if ($channel === '') {
                    $channel = 'Other';
                }

                $visits = isset($row['visits']) ? (int) $row['visits'] : 0;
                return [
                    'channel' => $channel,
                    'key' => sanitize_title($channel),
                    'visits' => $visits,
                    'share' => $total > 0 ? round(($visits / $total) * 100, 1) : 0,
                ];
            },
            $rows ?: []
        );

        $payload = [
            'range' => $range,
            'items' => $items,
            'total' => $total,
        ];

        if ($cache_key !== '') {
            $this->set_cached_payload($cache_key, $payload, $cache_id);
        }

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Build paginated list response for referrer source categories.
     */
    private function build_referrer_sources_response(
        WP_REST_Request $request,
        string $table,
        bool $is_aggregate_table,
        bool $aggregate_has_source_category = true,
        string $cache_key = ''
    ): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $pagination = $this->normalize_pagination($request);
        $search_term = $this->get_search_term($request);
        $page_path = $this->get_page_path_filter($request);
        $sorting = $this->normalize_sorting(
            $request,
            [
                'hits' => $is_aggregate_table ? 'hits' : 'visits',
                'visits' => 'visits',
                'referrer' => 'referrer_domain',
                'category' => 'source_category',
            ],
            'visits'
        );
        $cache_id = 'referrer-sources';

        $source_category_sql = $this->resolve_source_category_sql_expression(
            $is_aggregate_table,
            $aggregate_has_source_category
        );
        $search_sql = '';
        $search_args = [];

        if ($search_term !== '') {
            $search_sql = " AND (referrer_domain LIKE %s OR {$source_category_sql} LIKE %s)";
            $search_like = '%' . $wpdb->esc_like($search_term) . '%';
            $search_args = [$search_like, $search_like];
        }

        if ($is_aggregate_table) {
            $range_start = gmdate('Y-m-d', strtotime($range['start'] . ' 00:00:00'));
            $range_end = gmdate('Y-m-d', strtotime($range['end'] . ' 23:59:59'));
            $date_column = $this->resolve_date_bucket_column($table);
            $page_sql = '';
            $page_args = [];

            if ($page_path !== '') {
                $page_sql = ' AND page_path = %s';
                $page_args[] = $page_path;
            }

            $count_query_args = array_merge([$range_start, $range_end], $page_args, $search_args);
            $count_query = $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE {$date_column} BETWEEN %s AND %s{$page_sql}{$search_sql}
                GROUP BY referrer_domain, {$source_category_sql}) AS totals",
                $count_query_args
            );
            $total_items = (int) $wpdb->get_var($count_query);

            $list_query_args = array_merge(
                [$range_start, $range_end],
                $page_args,
                $search_args,
                [$pagination['per_page'], $pagination['offset']]
            );
            // `hits` reports page views and `visits` reports visits when the table stores both.
            $visits_sql = $this->table_has_column($table, 'visits') ? 'SUM(visits)' : 'SUM(hits)';
            $hits_sql = $this->table_has_column($table, 'hits') ? 'SUM(hits)' : $visits_sql;
            $list_query = $wpdb->prepare(
                "SELECT
                    referrer_domain,
                    {$source_category_sql} AS source_category,
                    {$hits_sql} AS hits,
                    {$visits_sql} AS visits
                FROM {$table}
                WHERE {$date_column} BETWEEN %s AND %s{$page_sql}{$search_sql}
                GROUP BY referrer_domain, {$source_category_sql}
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $list_query_args
            );
        } else {
            $range_start = bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
            $range_end = bbpa_get_site_day_bounds($range['start'], $range['end'])[1];
            $page_sql = '';
            $page_args = [];

            if ($page_path !== '') {
                $page_sql = ' AND (entry_page = %s OR exit_page = %s)';
                $page_args = [$page_path, $page_path];
            }

            $count_query_args = array_merge([$range_start, $range_end], $page_args, $search_args);
            $count_query = $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE first_view_at BETWEEN %d AND %d{$page_sql}{$search_sql}
                GROUP BY referrer_domain, {$source_category_sql}) AS totals",
                $count_query_args
            );
            $total_items = (int) $wpdb->get_var($count_query);

            $list_query_args = array_merge(
                [$range_start, $range_end],
                $page_args,
                $search_args,
                [$pagination['per_page'], $pagination['offset']]
            );
            $list_query = $wpdb->prepare(
                "SELECT
                    referrer_domain,
                    {$source_category_sql} AS source_category,
                    COUNT(*) AS visits
                FROM {$table}
                WHERE first_view_at BETWEEN %d AND %d{$page_sql}{$search_sql}
                GROUP BY referrer_domain, {$source_category_sql}
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $list_query_args
            );
        }

        $rows = $wpdb->get_results($list_query, ARRAY_A);
        $items = array_map(
            static function (array $row): array {
                return [
                    'referrer_domain' => isset($row['referrer_domain'])
                        ? sanitize_text_field((string) $row['referrer_domain'])
                        : '',
                    'source_category' => isset($row['source_category'])
                        ? sanitize_text_field((string) $row['source_category'])
                        : '',
                    'hits' => isset($row['hits']) ? (int) $row['hits'] : (isset($row['visits']) ? (int) $row['visits'] : 0),
                    'visits' => isset($row['visits']) ? (int) $row['visits'] : 0,
                ];
            },
            $rows ?: []
        );

        $items = $this->add_cached_favicons($items, 'referrer_domain');

        $payload = [
            'range' => $range,
            'pagination' => [
                'page' => $pagination['page'],
                'perPage' => $pagination['per_page'],
                'totalItems' => $total_items,
                'totalPages' => $pagination['per_page'] > 0
                    ? (int) ceil($total_items / $pagination['per_page'])
                    : 0,
            ],
            'items' => $items,
        ];

        if ($cache_key !== '') {
            $this->set_cached_payload(
                $cache_key,
                $payload,
                $cache_id,
                $this->should_persist_cached_payload($search_term, $pagination)
            );
        }

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Build paginated visit totals by referrer domain.
     */
    private function build_referrers_response(WP_REST_Request $request, string $table, bool $is_aggregate_table, string $cache_key = ''): WP_REST_Response {
        global $wpdb;

        $range = $this->get_day_range($request);
        $pagination = $this->normalize_pagination($request);
        $search_term = $this->get_search_term($request);
        $page_path = $this->get_page_path_filter($request);
        $sorting = $this->normalize_sorting(
            $request,
            [
                'hits' => $is_aggregate_table ? 'hits' : 'visits',
                'visits' => $is_aggregate_table ? 'hits' : 'visits',
                'label' => 'referrer_domain',
            ],
            'visits'
        );
        $cache_id = 'referrers';

        $range_start = bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
        $range_end = bbpa_get_site_day_bounds($range['start'], $range['end'])[1];
        $search_sql = '';
        $search_args = [];

        if ($search_term !== '') {
            $search_sql = ' AND referrer_domain LIKE %s';
            $search_args[] = '%' . $wpdb->esc_like($search_term) . '%';
        }

        if ($is_aggregate_table) {
            $range_start_day = $range['start'];
            $range_end_day = $range['end'];
            $date_column = $this->resolve_date_bucket_column($table);
            $page_sql = '';
            $page_args = [];

            if ($page_path !== '') {
                $page_sql = ' AND page_path = %s';
                $page_args[] = $page_path;
            }

            $count_query_args = array_merge([$range_start_day, $range_end_day], $page_args, $search_args);
            $count_query = $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE {$date_column} BETWEEN %s AND %s{$page_sql}{$search_sql}
                GROUP BY referrer_domain) AS totals",
                $count_query_args
            );
            $total_items = (int) $wpdb->get_var($count_query);

            $list_query_args = array_merge(
                [$range_start_day, $range_end_day],
                $page_args,
                $search_args,
                [$pagination['per_page'], $pagination['offset']]
            );
            $list_query = $wpdb->prepare(
                "SELECT referrer_domain AS label, SUM(hits) AS hits
                FROM {$table}
                WHERE {$date_column} BETWEEN %s AND %s{$page_sql}{$search_sql}
                GROUP BY referrer_domain
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $list_query_args
            );

            $rows = $wpdb->get_results($list_query, ARRAY_A);
            $this->log_report_debug('Referrers report queried.', [
                'table' => $table,
                'aggregate' => $is_aggregate_table,
                'range' => $range,
                'pagination' => $pagination,
                'row_count' => is_array($rows) ? count($rows) : 0,
                'total_items' => $total_items,
                'db_error' => (string) $wpdb->last_error,
            ]);
            $items = array_map(
                static function (array $row): array {
                    $hits = isset($row['hits']) ? (int) $row['hits'] : 0;

                    return [
                        'label' => isset($row['label']) ? sanitize_text_field((string) $row['label']) : '',
                        'hits' => $hits,
                        'visits' => $hits,
                    ];
                },
                $rows ?: []
            );
        } else {
            $page_sql = '';
            $page_args = [];

            if ($page_path !== '') {
                $page_sql = ' AND (entry_page = %s OR exit_page = %s)';
                $page_args = [$page_path, $page_path];
            }

            $count_query_args = array_merge([$range_start, $range_end], $page_args, $search_args);
            $count_query = $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE first_view_at BETWEEN %d AND %d{$page_sql}{$search_sql}
                GROUP BY referrer_domain) AS totals",
                $count_query_args
            );
            $total_items = (int) $wpdb->get_var($count_query);

            $list_query_args = array_merge(
                [$range_start, $range_end],
                $page_args,
                $search_args,
                [$pagination['per_page'], $pagination['offset']]
            );
            $list_query = $wpdb->prepare(
                "SELECT referrer_domain AS label, COUNT(*) AS visits
                FROM {$table}
                WHERE first_view_at BETWEEN %d AND %d{$page_sql}{$search_sql}
                GROUP BY referrer_domain
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $list_query_args
            );

            $rows = $wpdb->get_results($list_query, ARRAY_A);
            $items = array_map(
                static function (array $row): array {
                    $visits = isset($row['visits']) ? (int) $row['visits'] : 0;

                    return [
                        'label' => isset($row['label']) ? sanitize_text_field((string) $row['label']) : '',
                        'hits' => $visits,
                        'visits' => $visits,
                    ];
                },
                $rows ?: []
            );
        }

        $items = $this->add_cached_favicons($items, 'label');

        $payload = [
            'range' => $range,
            'pagination' => [
                'page' => $pagination['page'],
                'perPage' => $pagination['per_page'],
                'totalItems' => $total_items,
                'totalPages' => $pagination['per_page'] > 0
                    ? (int) ceil($total_items / $pagination['per_page'])
                    : 0,
            ],
            'items' => $items,
        ];

        if ($cache_key !== '') {
            $this->set_cached_payload(
                $cache_key,
                $payload,
                $cache_id,
                $this->should_persist_cached_payload($search_term, $pagination)
            );
        }

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Build a SQL condition that keeps only resolved country codes in country reports.
     */
    private function get_known_country_code_condition(string $column = 'country_code'): string {
        $column = preg_replace('/[^A-Za-z0-9_`.]/', '', $column);
        if ($column === '') {
            $column = 'country_code';
        }

        return "TRIM({$column}) <> '' AND UPPER(TRIM({$column})) NOT IN ('XX', 'UNKNOWN', 'UN')";
    }

    /**
     * Build paginated list response for top countries.
     */
    private function build_geo_countries_response(WP_REST_Request $request, string $table): WP_REST_Response {
        global $wpdb;

        $cache_id = 'geo-countries';
        $range = $this->get_day_range($request);
        $pagination = $this->normalize_pagination($request);
        $page_path = $this->get_page_path_filter($request);
        $config_status = $this->get_geolocation_config_status();
        $sorting = $this->normalize_sorting(
            $request,
            [
                'visitors' => 'visitors',
                'visits' => 'visitors',
                'hits' => 'hits',
                'country' => 'country_code',
            ],
            'visitors'
        );
        $cache_key = $this->get_cache_key(
            'geo-countries',
            [
                'metricVersion' => 'visitors-v2',
                'range' => $range,
                'pagination' => $pagination,
                'sorting' => $sorting,
                'configStatus' => $config_status,
                'pagePath' => $page_path,
            ]
        );
        $cached = $this->get_cached_payload($cache_key);
        if ($cached !== null) {
            return new WP_REST_Response($cached, 200);
        }

        if ($page_path !== '') {
            $result = $this->query_geo_countries_from_visitors($range, $pagination, $sorting, $page_path);
        } else {
            $result = $this->query_geo_countries_from_activity($range, $pagination, $sorting);
            if ((int) $result['totalItems'] === 0) {
                $result = $this->query_geo_countries_from_visitors($range, $pagination, $sorting);
            }
            if ((int) $result['totalItems'] === 0) {
                $result = $this->query_geo_countries_from_legacy_aggregates($table, $range, $pagination, $sorting);
            }
        }

        $total_items = (int) $result['totalItems'];
        $rows = is_array($result['rows']) ? $result['rows'] : [];
        $summary = is_array($result['summary']) ? $result['summary'] : [];

        $countries = array_map(
            static function (array $row): array {
                $country_code = isset($row['country_code'])
                    ? strtoupper(sanitize_text_field((string) $row['country_code']))
                    : '';
                $visitors = isset($row['visitors']) ? (int) $row['visitors'] : (isset($row['visits']) ? (int) $row['visits'] : 0);

                return [
                    'code' => $country_code,
                    'label' => $country_code,
                    'hits' => isset($row['hits']) ? (int) $row['hits'] : 0,
                    'visitors' => $visitors,
                    'visits' => $visitors,
                ];
            },
            $rows
        );

        $total_hits = isset($summary['total_hits']) ? (int) $summary['total_hits'] : 0;
        $max_hits = isset($summary['max_hits']) ? (int) $summary['max_hits'] : 0;
        $total_visitors = isset($summary['total_visitors']) ? (int) $summary['total_visitors'] : 0;
        $max_visitors = isset($summary['max_visitors']) ? (int) $summary['max_visitors'] : 0;

        $payload = [
            'range' => $range,
            'pagination' => [
                'page' => $pagination['page'],
                'perPage' => $pagination['per_page'],
                'totalItems' => $total_items,
                'totalPages' => $pagination['per_page'] > 0
                    ? (int) ceil($total_items / $pagination['per_page'])
                    : 0,
            ],
            'configStatus' => [
                'enabled' => $config_status['enabled'],
                'maxmindConfigured' => $config_status['maxmindConfigured'],
                'canAggregate' => $config_status['canAggregate'],
            ],
            'countries' => $countries,
            'totalHits' => $total_hits,
            'maxHits' => $max_hits,
            'totalVisitors' => $total_visitors,
            'maxVisitors' => $max_visitors,
            // Backward-compatibility alias for list cards still bound to `items`.
            'items' => array_map(
                static function (array $country): array {
                    $visitors = isset($country['visitors']) ? (int) $country['visitors'] : (isset($country['visits']) ? (int) $country['visits'] : 0);
                    return [
                        'label' => (string) ($country['label'] ?? ''),
                        'country_code' => (string) ($country['code'] ?? ''),
                        'hits' => isset($country['hits']) ? (int) $country['hits'] : 0,
                        'visitors' => $visitors,
                        'visits' => $visitors,
                    ];
                },
                $countries
            ),
        ];

        $this->set_cached_payload($cache_key, $payload, $cache_id);

        return new WP_REST_Response($payload, 200);
    }

    /**
     * Query country-level geolocation data from daily visitor activity.
     */
    private function query_geo_countries_from_activity(array $range, array $pagination, array $sorting): array {
        global $wpdb;

        $activity_table = $this->get_allowed_table('visitor_activity_daily');
        if (!$this->table_exists($activity_table)) {
            return ['totalItems' => 0, 'rows' => [], 'summary' => []];
        }

        $known_country_condition = $this->get_known_country_code_condition();
        $base_args = [$range['start'], $range['end'], 'bot'];

        $total_items = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$activity_table}
                WHERE date_bucket BETWEEN %s AND %s
                    AND device_class <> %s
                    AND {$known_country_condition}
                GROUP BY country_code
                HAVING COUNT(DISTINCT visitor_id) > 0) AS totals",
                $base_args
            )
        );

        if ($total_items === 0) {
            return ['totalItems' => 0, 'rows' => [], 'summary' => []];
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT country_code, SUM(page_views) AS hits, COUNT(DISTINCT visitor_id) AS visitors
                FROM {$activity_table}
                WHERE date_bucket BETWEEN %s AND %s
                    AND device_class <> %s
                    AND {$known_country_condition}
                GROUP BY country_code
                HAVING COUNT(DISTINCT visitor_id) > 0
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                array_merge($base_args, [$pagination['per_page'], $pagination['offset']])
            ),
            ARRAY_A
        );

        $summary = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COALESCE(SUM(country_hits), 0) AS total_hits,
                    COALESCE(MAX(country_hits), 0) AS max_hits,
                    COALESCE(SUM(country_visitors), 0) AS total_visitors,
                    COALESCE(MAX(country_visitors), 0) AS max_visitors
                FROM (
                    SELECT SUM(page_views) AS country_hits, COUNT(DISTINCT visitor_id) AS country_visitors
                    FROM {$activity_table}
                    WHERE date_bucket BETWEEN %s AND %s
                        AND device_class <> %s
                        AND {$known_country_condition}
                    GROUP BY country_code
                    HAVING COUNT(DISTINCT visitor_id) > 0
                ) AS country_totals",
                $base_args
            ),
            ARRAY_A
        );

        return ['totalItems' => $total_items, 'rows' => is_array($rows) ? $rows : [], 'summary' => is_array($summary) ? $summary : []];
    }

    /**
     * Query country-level geolocation data from visitors as a visitor-level fallback.
     */
    private function query_geo_countries_from_visitors(array $range, array $pagination, array $sorting, string $page_path = ''): array {
        global $wpdb;

        $visitors_table = $this->get_allowed_table('visitors');
        if (!$this->table_exists($visitors_table)) {
            return ['totalItems' => 0, 'rows' => [], 'summary' => []];
        }

        $range_start = bbpa_get_site_day_bounds($range['start'], $range['end'])[0];
        $range_end = bbpa_get_site_day_bounds($range['start'], $range['end'])[1];
        $known_country_condition = $this->get_known_country_code_condition();
        $page_path_sql = '';
        $page_path_args = [];
        if ($page_path !== '') {
            $page_path_sql = ' AND (entry_page = %s OR exit_page = %s)';
            $page_path_args = [$page_path, $page_path];
        }
        $base_args = array_merge([$range_start, $range_end, 'bot'], $page_path_args);

        $total_items = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$visitors_table}
                WHERE last_view_at BETWEEN %d AND %d
                    AND device_class <> %s
                    AND {$known_country_condition}{$page_path_sql}
                GROUP BY country_code
                HAVING COUNT(DISTINCT visitor_id) > 0) AS totals",
                $base_args
            )
        );

        if ($total_items === 0) {
            return ['totalItems' => 0, 'rows' => [], 'summary' => []];
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT country_code, SUM(total_views) AS hits, COUNT(DISTINCT visitor_id) AS visitors
                FROM {$visitors_table}
                WHERE last_view_at BETWEEN %d AND %d
                    AND device_class <> %s
                    AND {$known_country_condition}{$page_path_sql}
                GROUP BY country_code
                HAVING COUNT(DISTINCT visitor_id) > 0
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                array_merge($base_args, [$pagination['per_page'], $pagination['offset']])
            ),
            ARRAY_A
        );

        $summary = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COALESCE(SUM(country_hits), 0) AS total_hits,
                    COALESCE(MAX(country_hits), 0) AS max_hits,
                    COALESCE(SUM(country_visitors), 0) AS total_visitors,
                    COALESCE(MAX(country_visitors), 0) AS max_visitors
                FROM (
                    SELECT SUM(total_views) AS country_hits, COUNT(DISTINCT visitor_id) AS country_visitors
                    FROM {$visitors_table}
                    WHERE last_view_at BETWEEN %d AND %d
                        AND device_class <> %s
                        AND {$known_country_condition}{$page_path_sql}
                    GROUP BY country_code
                    HAVING COUNT(DISTINCT visitor_id) > 0
                ) AS country_totals",
                $base_args
            ),
            ARRAY_A
        );

        return ['totalItems' => $total_items, 'rows' => is_array($rows) ? $rows : [], 'summary' => is_array($summary) ? $summary : []];
    }

    /**
     * Query legacy country aggregates when visitor-level country data is unavailable.
     */
    private function query_geo_countries_from_legacy_aggregates(string $table, array $range, array $pagination, array $sorting): array {
        global $wpdb;

        if (!$this->table_exists($table)) {
            return ['totalItems' => 0, 'rows' => [], 'summary' => []];
        }

        $known_country_condition = $this->get_known_country_code_condition();

        $total_items = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM (SELECT 1
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s
                    AND {$known_country_condition}
                GROUP BY country_code
                HAVING SUM(visits) > 0) AS totals",
                $range['start'],
                $range['end']
            )
        );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT country_code, SUM(hits) AS hits, SUM(visits) AS visitors, SUM(visits) AS visits
                FROM {$table}
                WHERE date_bucket BETWEEN %s AND %s
                    AND {$known_country_condition}
                GROUP BY country_code
                HAVING SUM(visits) > 0
                ORDER BY {$sorting['orderby']} {$sorting['order']}
                LIMIT %d OFFSET %d",
                $range['start'],
                $range['end'],
                $pagination['per_page'],
                $pagination['offset']
            ),
            ARRAY_A
        );

        $summary = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COALESCE(SUM(country_hits), 0) AS total_hits,
                    COALESCE(MAX(country_hits), 0) AS max_hits,
                    COALESCE(SUM(country_visitors), 0) AS total_visitors,
                    COALESCE(MAX(country_visitors), 0) AS max_visitors
                FROM (
                    SELECT SUM(hits) AS country_hits, SUM(visits) AS country_visitors
                    FROM {$table}
                    WHERE date_bucket BETWEEN %s AND %s
                        AND {$known_country_condition}
                    GROUP BY country_code
                    HAVING SUM(visits) > 0
                ) AS country_totals",
                $range['start'],
                $range['end']
            ),
            ARRAY_A
        );

        return ['totalItems' => $total_items, 'rows' => is_array($rows) ? $rows : [], 'summary' => is_array($summary) ? $summary : []];
    }


    /**
     * Check whether an aggregate report table has data for the requested range.
     */
    private function aggregate_table_has_rows_for_range(string $table, array $range, string $page_path = ''): bool {
        global $wpdb;

        $allowed_tables = [
            $this->get_allowed_table('daily'),
            $this->get_allowed_table('hits_daily'),
            $this->get_allowed_table('daily_source_category'),
        ];

        if (!in_array($table, $allowed_tables, true) || !$this->table_exists($table)) {
            return false;
        }

        $date_column = $this->resolve_date_bucket_column($table);
        $range_start = gmdate('Y-m-d', strtotime($range['start'] . ' 00:00:00'));
        $range_end = gmdate('Y-m-d', strtotime($range['end'] . ' 23:59:59'));
        $where_sql = "WHERE {$date_column} BETWEEN %s AND %s";
        $query_args = [$range_start, $range_end];

        if ($page_path !== '') {
            $where_sql .= ' AND page_path = %s';
            $query_args[] = $page_path;
        }

        $row_count = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT 1 FROM {$table} {$where_sql} LIMIT 1",
                $query_args
            )
        );

        return $row_count > 0;
    }

    /**
     * Resolve the source-category SQL expression from a closed allowlist.
     */
    private function resolve_source_category_sql_expression(bool $is_aggregate_table, bool $aggregate_has_source_category): string {
        $allowed_expressions = [
            'aggregate_source_category' => $this->get_source_category_sql_expression('source_category'),
            'derived_source_category' => $this->get_source_category_sql_expression(null),
        ];

        if ($is_aggregate_table && $aggregate_has_source_category) {
            return $allowed_expressions['aggregate_source_category'];
        }

        return $allowed_expressions['derived_source_category'];
    }


    /**
     * Build a SQL expression that classifies acquisition sources from referrer domains.
     *
     * Stored specific categories stay authoritative. Generic legacy referral categories are
     * re-evaluated from the referrer domain so older rows can appear as Organic Search,
     * AI Assistants, Organic Social, or Referrals in channel reports.
     */
    private function get_source_category_sql_expression(?string $stored_source_category_column): string {
        $domain_sql = "LOWER(TRIM(LEADING 'www.' FROM referrer_domain))";
        $stored_sql = $stored_source_category_column !== null
            ? "NULLIF({$stored_source_category_column}, '')"
            : 'NULL';
        $generic_condition = $stored_source_category_column !== null
            ? "{$stored_source_category_column} IS NULL OR {$stored_source_category_column} IN ('', 'Referrer', 'Referrals')"
            : '1 = 1';

        return "CASE
            WHEN {$stored_sql} = 'Social' THEN 'Organic Social'
            WHEN {$stored_sql} = 'Campaigns' THEN 'Other Campaigns'
            WHEN NOT ({$generic_condition}) THEN {$stored_sql}
            WHEN referrer_domain = '' THEN 'Direct'
            WHEN {$domain_sql} IN ('chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'poe.com', 'you.com', 'phind.com', 'andisearch.com', 'mistral.ai', 'chat.mistral.ai')
                OR {$domain_sql} LIKE '%%.chatgpt.com'
                OR {$domain_sql} LIKE '%%.openai.com'
                OR {$domain_sql} LIKE '%%.perplexity.ai'
                OR {$domain_sql} LIKE '%%.claude.ai'
                OR {$domain_sql} LIKE '%%.gemini.google.com'
                OR {$domain_sql} LIKE '%%.copilot.microsoft.com'
                OR {$domain_sql} LIKE '%%.poe.com'
                OR {$domain_sql} LIKE '%%.you.com'
                OR {$domain_sql} LIKE '%%.phind.com'
                OR {$domain_sql} LIKE '%%.andisearch.com'
                OR {$domain_sql} LIKE '%%.mistral.ai'
                OR {$domain_sql} LIKE '%%.chat.mistral.ai'
                THEN 'AI Assistants'
            WHEN {$domain_sql} LIKE '%%google.%%'
                OR {$domain_sql} LIKE '%%bing.com%%'
                OR {$domain_sql} LIKE '%%duckduckgo.com%%'
                OR {$domain_sql} LIKE '%%yahoo.%%'
                OR {$domain_sql} LIKE '%%ecosia.org%%'
                OR {$domain_sql} LIKE '%%qwant.com%%'
                OR {$domain_sql} LIKE '%%startpage.com%%'
                OR {$domain_sql} LIKE '%%baidu.com%%'
                OR {$domain_sql} LIKE '%%yandex.%%'
                OR {$domain_sql} LIKE '%%naver.com%%'
                OR {$domain_sql} LIKE '%%seznam.cz%%'
                THEN 'Organic Search'
            WHEN {$domain_sql} IN ('facebook.com', 'meta.com', 'instagram.com', 'threads.net', 'x.com', 'twitter.com', 'linkedin.com', 'reddit.com', 't.co', 'youtube.com', 'youtu.be', 'tiktok.com', 'bsky.app', 'mastodon.social')
                OR {$domain_sql} LIKE '%%pinterest.%%'
                OR {$domain_sql} LIKE '%%.facebook.com'
                OR {$domain_sql} LIKE '%%.meta.com'
                OR {$domain_sql} LIKE '%%.instagram.com'
                OR {$domain_sql} LIKE '%%.threads.net'
                OR {$domain_sql} LIKE '%%.x.com'
                OR {$domain_sql} LIKE '%%.twitter.com'
                OR {$domain_sql} LIKE '%%.linkedin.com'
                OR {$domain_sql} LIKE '%%.reddit.com'
                OR {$domain_sql} LIKE '%%.t.co'
                OR {$domain_sql} LIKE '%%.youtube.com'
                OR {$domain_sql} LIKE '%%.youtu.be'
                OR {$domain_sql} LIKE '%%.tiktok.com'
                OR {$domain_sql} LIKE '%%.bsky.app'
                OR {$domain_sql} LIKE '%%.mastodon.social'
                THEN 'Organic Social'
            ELSE 'Referrals'
        END";
    }

    /**
     * Resolve the date bucket column name for aggregate tables.
     */
    private function resolve_date_bucket_column(string $table): string {
        $preferred_columns = ['date_bucket', 'bucket_date'];
        foreach ($preferred_columns as $column) {
            if ($this->table_has_column($table, $column)) {
                return $column;
            }
        }

        return 'date_bucket';
    }

    /**
     * Check whether a table contains a specific column.
     */
    private function table_has_column(string $table, string $column): bool {
        global $wpdb;

        if ($table === '' || $column === '') {
            return false;
        }

        $allowed_tables = [
            $wpdb->prefix . 'bbpa_daily',
            $wpdb->prefix . 'bbpa_daily_source_category',
            $wpdb->prefix . 'bbpa_geo_daily',
            $wpdb->prefix . 'bbpa_entry_exit_daily',
            $wpdb->prefix . 'bbpa_entry_exit_hourly',
            $wpdb->prefix . 'bbpa_visitors',
        ];

        $allowed_columns = ['date_bucket', 'bucket_date', 'last_triggered_at', 'first_view_at', 'hits', 'visits', 'source_category'];

        if (!in_array($table, $allowed_tables, true) || !in_array($column, $allowed_columns, true)) {
            return false;
        }

        $memo_key = $table . '|' . $column;
        if (!isset($this->table_column_memo[$memo_key])) {
            $exists = $wpdb->get_var($wpdb->prepare('SHOW COLUMNS FROM %i LIKE %s', $table, $column));
            $this->table_column_memo[$memo_key] = is_string($exists) && $exists !== '';
        }

        return $this->table_column_memo[$memo_key];
    }

    /**
     * Check whether a table exists.
     */
    protected function table_exists(string $table): bool {
        if ($table === '') {
            return false;
        }

        if (!isset($this->table_exists_memo[$table])) {
            $this->table_exists_memo[$table] = BBPA_REST_Query_Helpers::table_exists($table);
        }

        return $this->table_exists_memo[$table];
    }

    /**
     * Resolve geolocation aggregation configuration status.
     */
    private function get_geolocation_config_status(): array {
        $settings = bbpa_get_settings();
        $enabled = !empty($settings['geo_aggregation_enabled']);
        $lookup_mode = (string) ($settings['geoip_lookup_mode'] ?? 'local_database');
        $maxmind_configured = true;

        if ($lookup_mode === 'maxmind_api') {
            $maxmind_errors = bbpa_validate_maxmind_settings($settings);
            $maxmind_configured = empty($maxmind_errors);
        }

        return [
            'enabled' => $enabled,
            'maxmindConfigured' => $maxmind_configured,
            'canAggregate' => $enabled && $maxmind_configured,
        ];
    }

    /**
     * Sort normalized page-path report rows after title enrichment and path merging.
     */
    private function sort_page_path_report_items(array $items, string $metric_column, array $sorting): array {
        $sort_direction = ($sorting['order'] ?? 'DESC') === 'DESC' ? -1 : 1;
        $orderby_key = isset($sorting['orderby_key']) ? (string) $sorting['orderby_key'] : $metric_column;

        usort(
            $items,
            static function (array $left, array $right) use ($metric_column, $orderby_key, $sort_direction): int {
                $left_label = (string) ($left['label'] ?? '');
                $right_label = (string) ($right['label'] ?? '');
                $left_title = (string) ($left['page_title'] ?? '');
                $right_title = (string) ($right['page_title'] ?? '');
                $left_display_title = $left_title !== '' ? $left_title : $left_label;
                $right_display_title = $right_title !== '' ? $right_title : $right_label;

                if ($orderby_key === 'page_title') {
                    $comparison = strcasecmp($left_display_title, $right_display_title);
                    if ($comparison !== 0) {
                        return $comparison * $sort_direction;
                    }

                    return strcasecmp($left_label, $right_label);
                }

                if ($orderby_key === 'label') {
                    $comparison = strcasecmp($left_label, $right_label);

                    return $comparison * $sort_direction;
                }

                $left_metric = (int) ($left[$metric_column] ?? 0);
                $right_metric = (int) ($right[$metric_column] ?? 0);
                if ($left_metric !== $right_metric) {
                    return ($left_metric <=> $right_metric) * $sort_direction;
                }

                $comparison = strcasecmp($left_display_title, $right_display_title);
                if ($comparison !== 0) {
                    return $comparison;
                }

                return strcasecmp($left_label, $right_label);
            }
        );

        return $items;
    }

    /**
     * Merge page-path rows that map to the same normalized URL path.
     */
    private function merge_page_path_items(array $items, string $metric_column): array {
        $merged_items = [];

        foreach ($items as $item) {
            $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
            $normalized_label = $this->normalize_report_page_path($label);
            $merge_key = $normalized_label !== '' ? $normalized_label : $label;

            if ($merge_key === '') {
                continue;
            }

            if (!isset($merged_items[$merge_key])) {
                $item['label'] = $merge_key;
                $item[$metric_column] = (int) ($item[$metric_column] ?? 0);
                if (!array_key_exists('page_title', $item)) {
                    $item['page_title'] = $this->resolve_page_title_from_path($merge_key);
                } elseif ($item['page_title'] !== null) {
                    // A null title is resolved later, only when the row needs it.
                    $item['page_title'] = (string) $item['page_title'];
                }
                $merged_items[$merge_key] = $item;
                continue;
            }

            $merged_items[$merge_key][$metric_column] += (int) ($item[$metric_column] ?? 0);
        }

        return array_values($merged_items);
    }

    /**
     * Remove paths that are tracked as 404 pages for the requested range.
     *
     * A row is removed when its path is a tracked 404 path and does not resolve to a
     * WordPress post. Titles are only looked up for rows matching a tracked 404 path.
     */
    private function exclude_not_found_page_path_items(array $items, array $range, string $metric_column = 'hits'): array {
        $not_found_paths = $this->get_not_found_page_paths_for_range($range);
        if ($not_found_paths === []) {
            return $items;
        }

        $candidates = [];
        foreach ($items as $item) {
            $normalized_label = $this->normalize_report_page_path(bbpa_sanitize_page_path_value($item['label'] ?? ''));
            if ($normalized_label !== '' && !$this->is_home_page_path($normalized_label) && isset($not_found_paths[$normalized_label])) {
                $candidates[] = [
                    'path' => $normalized_label,
                    'metric' => (int) ($item[$metric_column] ?? 0),
                ];
            }
        }
        $this->prime_page_titles($candidates);

        return array_values(
            array_filter(
                $items,
                function (array $item) use ($not_found_paths): bool {
                    $label = bbpa_sanitize_page_path_value($item['label'] ?? '');
                    $normalized_label = $this->normalize_report_page_path($label);

                    if ($normalized_label === '' || $this->is_home_page_path($normalized_label)) {
                        return true;
                    }

                    if (!isset($not_found_paths[$normalized_label])) {
                        return true;
                    }

                    return $this->resolve_page_title_from_path($normalized_label) !== '';
                }
            )
        );
    }

    /**
     * Return normalized 404 page paths keyed by path for fast report exclusion.
     *
     * Titles are not resolved here: the caller only checks titles of report rows matching
     * one of these paths, which gives the same result without one lookup per 404 path.
     */
    private function get_not_found_page_paths_for_range(array $range): array {
        global $wpdb;

        $start = isset($range['start']) ? sanitize_text_field((string) $range['start']) : '';
        $end = isset($range['end']) ? sanitize_text_field((string) $range['end']) : '';
        if ($start === '' || $end === '') {
            return [];
        }

        $table = $this->get_allowed_table('not_found');
        $query = $wpdb->prepare(
            "SELECT DISTINCT page_path
            FROM {$table}
            WHERE date_bucket BETWEEN %s AND %s",
            $start,
            $end
        );
        $rows = $wpdb->get_col($query) ?: [];
        $paths = [];

        foreach ($rows as $row) {
            $raw_path = bbpa_sanitize_page_path_value($row);
            if (trim($raw_path) === '') {
                continue;
            }

            $path = $this->normalize_report_page_path($raw_path);
            if ($path === '' || $this->is_home_page_path($path)) {
                continue;
            }

            $paths[$path] = true;
        }

        return $paths;
    }

    /**
     * Normalize report page paths so equivalent URLs share one row.
     */
    private function normalize_report_page_path(string $page_path): string {
        $normalized = trim($page_path);

        if ($normalized === '' || $normalized === '/') {
            return '/';
        }

        if (preg_match('#^https?://#i', $normalized) === 1) {
            $parsed_path = wp_parse_url($normalized, PHP_URL_PATH);
            $normalized = is_string($parsed_path) && $parsed_path !== '' ? $parsed_path : '/';
        } else {
            $query_position = strpos($normalized, '?');
            $fragment_position = strpos($normalized, '#');
            $cut_positions = array_filter(
                [$query_position, $fragment_position],
                static function ($position): bool {
                    return is_int($position);
                }
            );

            if ($cut_positions !== []) {
                $normalized = substr($normalized, 0, min($cut_positions));
            }
        }

        if ($normalized === '') {
            return '/';
        }

        $normalized = preg_replace('#/+#', '/', $normalized) ?: $normalized;

        if ($normalized[0] !== '/') {
            $normalized = '/' . $normalized;
        }

        $normalized = untrailingslashit($normalized);

        if ($normalized === '') {
            return '/';
        }

        return $normalized;
    }

    /**
     * Return the path of the WordPress home URL without trailing slash ('' at the domain root).
     *
     * Subdirectory installs and multisite subfolder sites return their directory (`/blog`).
     */
    private function get_home_path_prefix(): string {
        $home_path = wp_parse_url(home_url('/'), PHP_URL_PATH);
        if (!is_string($home_path)) {
            return '';
        }

        return untrailingslashit($home_path);
    }

    /**
     * Whether a normalized report path is the site homepage ('/' or the install directory).
     */
    private function is_home_page_path(string $path): bool {
        if ($path === '/') {
            return true;
        }

        $home_path = $this->get_home_path_prefix();

        return $home_path !== '' && $path === $home_path;
    }

    /**
     * Convert a stored request path into a path relative to the WordPress home URL.
     *
     * Stored paths keep the install directory (`/blog/about` for a site installed in `/blog`),
     * while home_url() already contains it. Stored history is not rewritten; the prefix is
     * only removed to look up the post.
     */
    private function strip_home_path_prefix(string $path, string $home_path): string {
        if ($home_path === '' || $path === '' || strpos($path, $home_path) !== 0) {
            return $path;
        }

        $rest = (string) substr($path, strlen($home_path));
        if ($rest === '') {
            return '/';
        }

        if ($rest[0] === '/') {
            return $rest;
        }

        if ($rest[0] === '?' || $rest[0] === '#') {
            return '/' . $rest;
        }

        // `/blogger` does not belong to the `/blog` install.
        return $path;
    }

    private function resolve_page_title_from_path(string $page_path): string {
        static $title_cache = [];

        $normalized_path = trim($page_path);
        $home_path = $this->get_home_path_prefix();
        $lookup_path = $this->strip_home_path_prefix($normalized_path, $home_path);
        $cache_key = $home_path === '' ? $normalized_path : $home_path . '|' . $normalized_path;
        if ($lookup_path === '/') {
            $cache_key .= '|front:' . (int) get_option('page_on_front');
        }

        if (isset($title_cache[$cache_key])) {
            return $title_cache[$cache_key];
        }

        if ($normalized_path === '') {
            $title_cache[$cache_key] = '';

            return '';
        }

        if ($lookup_path === '/') {
            $front_page_id = (int) get_option('page_on_front');
            if ($front_page_id > 0) {
                $front_title = get_the_title($front_page_id);
                $title_cache[$cache_key] = is_string($front_title) ? sanitize_text_field($front_title) : '';

                return $title_cache[$cache_key];
            }
        }

        if ($this->page_title_lookups_remaining !== null) {
            if ($this->page_title_lookups_remaining <= 0) {
                // Lookup limit reached: handled as untitled and not cached.
                return '';
            }

            $this->page_title_lookups_remaining--;
        }

        $post_id = url_to_postid(home_url($lookup_path));
        if ($post_id <= 0) {
            $title_cache[$cache_key] = '';

            return '';
        }

        $title = get_the_title($post_id);
        $title_cache[$cache_key] = is_string($title) ? sanitize_text_field($title) : '';

        return $title_cache[$cache_key];
    }

    /**
     * Log report diagnostics when BimBeau Privacy Analytics debug mode is enabled.
     */
    private function log_report_debug(string $message, array $context = []): void {
        if (!$this->is_debug_mode_enabled() || !class_exists('BBPA_Logger')) {
            return;
        }

        BBPA_Logger::channel('API')->debug($message, $context);
    }

    /**
     * Determine whether plugin debug mode is enabled.
     */
    protected function is_debug_mode_enabled(): bool {
        return BBPA_REST_Query_Helpers::is_debug_mode_enabled();
    }

    /**
     * Resolve cache TTL for report analytics.
     */
    private function get_cache_ttl(string $endpoint): int {
        $default_ttls = [
            'overview' => 45,
            'visitors' => 30,
        ];

        $default_ttl = $default_ttls[$endpoint] ?? 90;
        $ttl = (int) apply_filters('bbpa_report_cache_ttl', $default_ttl, $endpoint);

        return max(30, min(300, $ttl));
    }

    /**
     * Build a cache key for report analytics responses.
     */
    protected function get_cache_key(string $endpoint, array $params): string {
        return BBPA_REST_Query_Helpers::build_cache_key('report_', $endpoint, $params);
    }

    /**
     * Fetch cached response payload.
     */
    protected function get_cached_payload(string $cache_key): ?array {
        return BBPA_REST_Query_Helpers::get_cached_payload($cache_key, 'bbpa_report');
    }

    /**
     * Store cached response payload.
     */
    protected function set_cached_payload(string $cache_key, array $payload, string $endpoint = '', bool $persist = true): void {
        BBPA_REST_Query_Helpers::set_cached_payload($cache_key, $payload, 'bbpa_report', $this->get_cache_ttl($endpoint), $persist);
    }
    /**
     * Add only already-local favicons to visible response rows without network access.
     *
     * One resolver lists the favicon directory once and each distinct domain is
     * looked up once, whatever the number of rows.
     */
    private function add_cached_favicons(array $items, string $domain_key): array {
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        if (empty($settings['referrer_favicons_enabled'])) { return $items; }
        $resolver = new BBPA_Favicon_Resolver();
        $favicons_by_domain = [];
        foreach ($items as &$item) {
            $domain = trim((string) ($item[$domain_key] ?? ''));
            if ($domain === '') { continue; }
            if (!array_key_exists($domain, $favicons_by_domain)) {
                $favicons_by_domain[$domain] = $resolver->get_cached_favicon_for_domain($domain);
            }
            $favicon = $favicons_by_domain[$domain];
            if (!empty($favicon['url']) && !empty($favicon['path'])) {
                $item['favicon'] = ['status' => 'available', 'url' => (string) $favicon['url'], 'is_local' => true];
            }
        }
        unset($item);
        return $items;
    }

}
// phpcs:enable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
