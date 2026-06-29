<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST controller for collecting BimBeau Privacy Analytics hits.
 */


class BBPA_Hit_Controller {
    private const MAX_PAGE_PATH_LENGTH = 2048;
    private const MAX_REFERRER_DOMAIN_LENGTH = 253;
    private const MAX_VISIT_ID_LENGTH = 64;
    private const MIN_VISIT_ID_LENGTH = 12;
    private const MAX_EVENT_NAME_LENGTH = 32;
    private const MAX_TEMPORARY_HIT_ID_LENGTH = 96;
    private const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
    private const TEMPORARY_HIT_TTL = 900;
    private const UPGRADE_IDEMPOTENCY_TTL = 900;
    private const BASE_TRANSPORT_REPLAY_TTL = 900;
    private const BASE_IMMEDIATE_REPLAY_TTL = 2;
    private const MAX_ACTIVE_MS_DELTA_PER_PING = 30000;
    private const MIN_REASONABLE_UNIX_SECONDS = 946684800;
    private const MAX_REASONABLE_UNIX_SECONDS = 4102444800;

    /**
     * Cached per-request advanced stats availability.
     */
    private ?bool $advanced_stats_enabled = null;

    /**
     * Register routes for hit collection.
     */
    public function register_routes(): void {
        register_rest_route(
            BBPA_REST_NAMESPACE,
            '/hits',
            [
                'methods' => 'POST',
                'callback' => [$this, 'create_item'],
                // /hits is the anonymous public analytics ingestion endpoint.
                // It is not an admin or privileged action, and requiring a logged-in
                // REST nonce would break anonymous tracking, cached pages, CDN usage,
                // and CMP-controlled loading of the advanced tracker. Security is
                // handled through strict route args, sanitize_hit_data(), payload
                // validation, deduplication, rate limiting, and a limited write scope.
                'permission_callback' => '__return_true',
                'args' => [
                    'page_path' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => 'bbpa_sanitize_rest_page_path_arg',
                    ],
                    'post_id' => [
                        'required' => false,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                    'referrer_domain' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'device_class' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_key',
                    ],
                    'timestamp_bucket' => [
                        'required' => true,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                    'visit_id' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'active_ms_delta' => [
                        'required' => false,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                    'event_name' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_key',
                    ],
                    'granularity_enrichment' => [
                        'required' => false,
                        'type' => 'boolean',
                        'sanitize_callback' => 'rest_sanitize_boolean',
                    ],
                    'upgrade_existing_hit' => [
                        'required' => false,
                        'type' => 'boolean',
                        'sanitize_callback' => 'rest_sanitize_boolean',
                    ],
                    'tracker_scope' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_key',
                    ],
                    'screen_resolution' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'temporary_hit_id' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'idempotency_key' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'http_status' => [
                        'required' => false,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                    'page_context' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_key',
                    ],
                ],
            ]
        );
    }

    /**
     * Handle hit collection.
     */
    public function create_item(WP_REST_Request $request): WP_REST_Response {
        $this->log_debug('Hit ingestion request received.', $this->build_request_debug_context($request));
        $skip_reason = $this->get_skip_tracking_reason($request);
        if ($skip_reason !== '') {
            return $this->create_skip_response($skip_reason, [
                'source' => 'privacy_or_role_rule',
            ]);
        }

        if ($this->is_rate_limited($request)) {
            return $this->create_skip_response('rate_limit', [
                'source' => 'rate_limit',
            ]);
        }

        $hit = $this->sanitize_hit_data($request);
        if (is_wp_error($hit)) {
            $this->log_debug('Hit payload rejected during sanitization.', [
                'error_code' => $hit->get_error_code(),
                'error_message' => $hit->get_error_message(),
            ]);
            return new WP_REST_Response(
                [
                    'message' => $hit->get_error_message(),
                ],
                400
            );
        }

        if ($this->is_duplicate_hit($hit, $request)) {
            $this->log_event_debug('Hit skipped as duplicate.', $hit, [
                'source' => 'duplicate_hit',
            ]);
            return $this->create_skip_response('duplicate_hit', [
                'source' => 'duplicate_hit',
                'granularity' => (string) ($hit['granularity'] ?? 'base'),
            ]);
        }

        $this->log_debug('Hit payload accepted after validation (core ingestion).', $this->build_hit_debug_context($hit));
        $this->log_event_debug('Hit payload accepted after validation (event pipeline).', $hit);

        if ($this->should_merge_enriched_hit($hit)) {
            $tracked = $this->store_upgrade_event($hit);
            $this->log_debug('Enriched upgrade merge processed.', [
                'tracked' => $tracked,
                'temporary_hit_id_present' => !empty($hit['temporary_hit_id']),
                'idempotency_key_present' => !empty($hit['idempotency_key']),
            ]);
            $this->log_event_debug('Enriched upgrade merge processed.', $hit, [
                'tracked' => $tracked,
            ]);
            if ($tracked) {
                bbpa_flush_admin_cache();
            }
            return new WP_REST_Response(['tracked' => $tracked], $tracked ? 201 : 204);
        }

        $utm_params = $this->extract_utm_params($request->get_param('page_path'), $hit);
        $source_category = bbpa_get_source_category_from_tracking_context($hit['referrer_domain'] ?? null, $utm_params);
        $hit['source_category'] = $source_category;
        $this->log_debug('UTM extraction completed for accepted hit.', [
            'utm_param_keys' => array_keys($utm_params),
            'utm_param_count' => count($utm_params),
            'source_category' => $source_category,
            'paid_click_id_presence' => [
                'gclid' => !empty($utm_params['gclid']),
                'gbraid' => !empty($utm_params['gbraid']),
                'wbraid' => !empty($utm_params['wbraid']),
                'msclkid' => !empty($utm_params['msclkid']),
            ],
        ]);
        $this->store_hit($hit, $utm_params);
        $this->log_event_debug('Hit persistence completed.', $hit, [
            'tracked' => true,
        ]);
        bbpa_flush_admin_cache();

        return new WP_REST_Response(['tracked' => true], 201);
    }


    /**
     * Build a skip response with debug-aware status code.
     */
    private function create_skip_response(string $reason, array $context = []): WP_REST_Response {
        $status = $this->is_debug_mode_enabled() ? 200 : 204;
        $this->log_debug('Hit skipped by server rule.', array_merge([
            'reason' => $reason,
        ], $context));

        return new WP_REST_Response(['tracked' => false, 'reason' => $reason], $status);
    }

    /**
     * Apply a short request limit window for public hit ingestion.
     */
    private function is_rate_limited(WP_REST_Request $request): bool {
        $window = (int) apply_filters('bbpa_hit_rate_limit_window_seconds', 60);
        $window = max(10, min(300, $window));

        $max_requests = (int) apply_filters('bbpa_hit_rate_limit_max_requests', 120);
        $max_requests = max(10, min(10000, $max_requests));

        $ip = bbpa_get_client_ip();
        $user_agent = sanitize_text_field((string) $request->get_header('User-Agent'));
        $fingerprint_source = $ip !== '' ? $ip : $user_agent;
        if ($fingerprint_source === '') {
            $fingerprint_source = 'unknown';
        }

        $cache_key = 'bbpa_rate_limit_' . md5($fingerprint_source);

        $count = wp_cache_get($cache_key, 'bbpa_rate_limit');
        if ($count === false) {
            $count = get_transient($cache_key);
        }

        $count = is_numeric($count) ? (int) $count : 0;
        if ($count >= $max_requests) {
            return true;
        }

        $count++;
        wp_cache_set($cache_key, $count, 'bbpa_rate_limit', $window);
        set_transient($cache_key, $count, $window);

        return false;
    }

    /**
     * Respect DNT/GPC headers when present.
     */
    private function get_skip_tracking_reason(WP_REST_Request $request): string {
        $settings = bbpa_get_settings();

        if (function_exists('bbpa_is_frontend_collection_context') && !bbpa_is_frontend_collection_context($settings, true)) {
            return 'non_front_context';
        }

        if (!empty($settings['excluded_roles']) && is_user_logged_in()) {
            $user = wp_get_current_user();
            if (!empty($user->roles)) {
                foreach ($user->roles as $role) {
                    if (in_array($role, $settings['excluded_roles'], true)) {
                        return 'excluded_role';
                    }
                }
            }
        }

        if (!empty($settings['respect_dnt_gpc'])) {
            $dnt = $request->get_header('DNT');
            if ($dnt !== null && (string) $dnt === '1') {
                return 'dnt_enabled';
            }

            $gpc = $request->get_header('Sec-GPC');
            if ($gpc !== null && (string) $gpc === '1') {
                return 'gpc_enabled';
            }
        }

        return '';
    }


    /**
     * Normalize incoming timestamp bucket to Unix seconds.
     */
    private function normalize_timestamp_bucket($value): int {
        if (is_string($value)) {
            $value = trim($value);
        }

        if (!is_numeric($value)) {
            return 0;
        }

        $timestamp = (int) floor((float) $value);
        if ($timestamp <= 0) {
            return 0;
        }

        if ($timestamp > 9999999999999) {
            $timestamp = (int) floor($timestamp / 1000000);
        } elseif ($timestamp > 9999999999) {
            $timestamp = (int) floor($timestamp / 1000);
        }

        $now = (int) current_time('timestamp', true);

        if (
            $timestamp < self::MIN_REASONABLE_UNIX_SECONDS
            || $timestamp > self::MAX_REASONABLE_UNIX_SECONDS
            || $timestamp > ($now + DAY_IN_SECONDS)
        ) {
            return $now;
        }

        return $timestamp;
    }

    /**
     * Sanitize and validate hit payload.
     */
    private function sanitize_hit_data(WP_REST_Request $request) {
        $page_path = $this->clean_page_path($request->get_param('page_path'));
        if ($page_path === '') {
            return new WP_Error('bbpa_invalid_page_path', __('Invalid page path.', 'bimbeau-privacy-analytics'));
        }

        if ($this->exceeds_max_length($page_path, self::MAX_PAGE_PATH_LENGTH)) {
            return new WP_Error('bbpa_page_path_too_long', __('Page path exceeds maximum length.', 'bimbeau-privacy-analytics'));
        }

        $post_id = $request->get_param('post_id');
        $post_id = $post_id !== null ? absint($post_id) : null;

        $referrer_domain = $this->clean_referrer_domain($request->get_param('referrer_domain'));
        if ($referrer_domain !== null && function_exists('bbpa_normalize_external_referrer_domain')) {
            $referrer_domain = bbpa_normalize_external_referrer_domain($referrer_domain);
        }
        if ($referrer_domain !== null && $this->exceeds_max_length($referrer_domain, self::MAX_REFERRER_DOMAIN_LENGTH)) {
            return new WP_Error('bbpa_referrer_domain_too_long', __('Referrer domain exceeds maximum length.', 'bimbeau-privacy-analytics'));
        }

        $device_class = $this->clean_device_class($request->get_param('device_class'));
        if ($device_class === '') {
            $user_agent = sanitize_text_field((string) $request->get_header('User-Agent'));
            $device_class = $this->detect_device_class_from_user_agent($user_agent);
        }

        $timestamp_bucket = $this->normalize_timestamp_bucket($request->get_param('timestamp_bucket'));
        if ($timestamp_bucket === 0) {
            return new WP_Error('bbpa_invalid_timestamp_bucket', __('Invalid timestamp bucket.', 'bimbeau-privacy-analytics'));
        }

        $visit_id_param = $request->get_param('visit_id');
        if (($visit_id_param === null || $visit_id_param === '') && $request->get_param('visitId') !== null) {
            $visit_id_param = $request->get_param('visitId');
        }
        $visit_id = $this->clean_visit_id($visit_id_param);
        $client_provided_visit_id = ($visit_id !== '');
        if ($visit_id === false) {
            return new WP_Error('bbpa_invalid_visit_id', __('Invalid visit identifier.', 'bimbeau-privacy-analytics'));
        }
        if ($visit_id === '' && $this->should_apply_enriched_visit_id_fallback($request)) {
            $this->log_debug('Missing visit_id on enriched hit payload.', [
                'page_path' => $page_path,
                'device_class' => $device_class,
                'timestamp_bucket' => $timestamp_bucket,
            ]);

            $visit_id = bbpa_get_visit_identifier($timestamp_bucket);
            $this->log_debug('Generated fallback visit_id for enriched payload; classification remains base to avoid unstable visitor grouping.', [
                'page_path' => $page_path,
                'device_class' => $device_class,
                'timestamp_bucket' => $timestamp_bucket,
            ]);
        }

        $tracker_scope = $this->normalize_tracker_scope($request);

        if (
            $visit_id === ''
            && ($tracker_scope === 'base' || $tracker_scope === '')
            && function_exists('bbpa_get_visit_identifier')
        ) {
            $visit_id = bbpa_get_visit_identifier($timestamp_bucket);

            $this->log_debug('Generated fallback visit_id for base payload.', [
                'page_path' => $page_path,
                'device_class' => $device_class,
                'timestamp_bucket' => $timestamp_bucket,
            ]);
        }

        $active_ms_delta = absint($request->get_param('active_ms_delta'));
        $active_ms_delta = min($active_ms_delta, self::MAX_ACTIVE_MS_DELTA_PER_PING);
        $event_name = $this->clean_event_name($request->get_param('event_name'));
        $granularity_enrichment_param = $request->get_param('granularity_enrichment');
        if ($granularity_enrichment_param === null && $request->get_param('granularityEnrichment') !== null) {
            $granularity_enrichment_param = $request->get_param('granularityEnrichment');
        }
        $granularity_enrichment = rest_sanitize_boolean($granularity_enrichment_param);
        // Legacy alias kept for backward compatibility (deprecated: use granularity_enrichment).
        $upgrade_existing_hit = rest_sanitize_boolean($request->get_param('upgrade_existing_hit'));
        if (!$granularity_enrichment && $upgrade_existing_hit) {
            $granularity_enrichment = true;
        }
        $temporary_hit_id = $this->clean_temporary_hit_id($request->get_param('temporary_hit_id'));
        $idempotency_key = $this->clean_idempotency_key($request->get_param('idempotency_key'));

        $screen_resolution = $this->detect_screen_resolution($request);
        $http_status = $this->clean_http_status($request->get_param('http_status'));
        if ($http_status === null && $request->get_param('httpStatus') !== null) {
            $http_status = $this->clean_http_status($request->get_param('httpStatus'));
        }
        $page_context = $this->clean_page_context($request->get_param('page_context'));
        if ($page_context === '' && $request->get_param('pageContext') !== null) {
            $page_context = $this->clean_page_context($request->get_param('pageContext'));
        }

        $hit = [
            'page_path' => $page_path,
            'post_id' => $post_id ?: null,
            'referrer_domain' => $referrer_domain,
            'device_class' => $device_class,
            'timestamp_bucket' => $timestamp_bucket,
            'visit_id' => $visit_id,
            'client_provided_visit_id' => $client_provided_visit_id,
            'active_ms_delta' => $active_ms_delta,
            'event_name' => $event_name,
            'granularity_enrichment' => $granularity_enrichment,
            'upgrade_existing_hit' => $upgrade_existing_hit,
            'temporary_hit_id' => $temporary_hit_id,
            'idempotency_key' => $idempotency_key,
            'http_status' => $http_status,
            'page_context' => $page_context,
            'screen_resolution' => $screen_resolution,
            'browser' => '',
            'browser_version' => '',
            'operating_system' => '',
            'country_code' => '',
            'country' => '',

        ];

        $hit['granularity'] = $this->resolve_hit_granularity($request, $hit);
        $hit['visitor_id'] = $this->resolve_visitor_id(
            $hit['visit_id'],
            $hit['granularity'],
            $timestamp_bucket,
            !empty($hit['client_provided_visit_id'])
        );

        if (!$this->is_advanced_stats_enabled()) {
            $hit = $this->scrub_advanced_fields_for_essential_scope($hit);
        }

        if ($hit['granularity'] === 'enriched' && $this->has_enriched_identifier($hit)) {
            $country = bbpa_get_visit_country_payload();
            $hit['browser'] = $this->detect_browser_family($request->get_header('User-Agent'));
            $hit['browser_version'] = $this->detect_browser_version($request->get_header('User-Agent'));
            $hit['operating_system'] = $this->detect_operating_system($request->get_header('User-Agent'));
            $hit['country_code'] = $country['country_code'] ?? '';
            $hit['country'] = $country['country'] ?? '';

            ]);
        }

        return $hit;
    }

    /**
     * Enforce essential-only ingestion by removing all advanced dimensions.
     */
    private function scrub_advanced_fields_for_essential_scope(array $hit): array {
        $hit['tracker_scope'] = 'base';
        $hit['granularity'] = 'base';
        $hit['granularity_enrichment'] = false;
        $hit['upgrade_existing_hit'] = false;
        $hit['temporary_hit_id'] = '';
        $hit['idempotency_key'] = '';

        foreach ([
            'screen_resolution',
            'browser',
            'browser_version',
            'operating_system',
            'country_code',
            'country',

            'referrer_domain',
        ] as $field) {
            $hit[$field] = in_array($field, ['city_geoname_id', 'latitude', 'longitude', 'accuracy_radius'], true)
                ? null
                : '';
        }

        return $hit;
    }

    private function clean_http_status($status): ?int {
        if ($status === null || $status === '') {
            return null;
        }

        $http_status = absint($status);
        if ($http_status < 100 || $http_status > 599) {
            return null;
        }

        return $http_status;
    }

    private function clean_page_context($context): string {
        $normalized_context = sanitize_key((string) $context);
        if (!in_array($normalized_context, ['not_found'], true)) {
            return '';
        }

        return $normalized_context;
    }

    private function is_advanced_stats_enabled(): bool {
        if ($this->advanced_stats_enabled !== null) {
            return $this->advanced_stats_enabled;
        }

        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $this->advanced_stats_enabled = !isset($settings['advanced_stats_enabled'])
            || rest_sanitize_boolean($settings['advanced_stats_enabled']);

        return $this->advanced_stats_enabled;
    }

    /**
     * Resolve hit granularity from client payload signals only.
     *
     * Classification is based on explicit client payload fields only, never on
     * server-side fallbacks, User-Agent derived metadata, or IP geolocation.
     */
    private function normalize_tracker_scope(WP_REST_Request $request): string {
        $tracker_scope_param = $request->get_param('tracker_scope');
        if (($tracker_scope_param === null || $tracker_scope_param === '') && $request->get_param('trackerScope') !== null) {
            $tracker_scope_param = $request->get_param('trackerScope');
        }

        $tracker_scope = sanitize_key((string) $tracker_scope_param);
        if ($tracker_scope === 'essential') {
            return 'base';
        }

        if ($tracker_scope === 'advanced') {
            return 'enriched';
        }

        return $tracker_scope;
    }

    private function resolve_hit_granularity(WP_REST_Request $request, array $hit): string {
        if (!$this->is_advanced_stats_enabled()) {
            $this->log_debug('Hit granularity forced to base because advanced stats are disabled.', [
                'reason' => 'advanced_stats_disabled',
                'tracker_scope' => $this->normalize_tracker_scope($request),
                'granularity_enrichment' => !empty($hit['granularity_enrichment']),
            ]);
            return 'base';
        }

        $tracker_scope = $this->normalize_tracker_scope($request);
        if ($tracker_scope === 'base') {
            return 'base';
        }

        $has_valid_visit_id = !empty($hit['client_provided_visit_id']);
        $has_enrichment_flag = !empty($hit['granularity_enrichment']);

        if ($tracker_scope !== 'enriched') {
            if ($tracker_scope !== '') {
                $this->log_debug('Unknown tracker_scope normalized to base granularity.', [
                    'tracker_scope' => $tracker_scope,
                ]);
            }
            return 'base';
        }

        if ($has_valid_visit_id && $has_enrichment_flag) {
            return 'enriched';
        }

        if (!$has_valid_visit_id) {
            $this->log_debug('Enriched request downgraded to base because client visit_id is missing.', [
                'tracker_scope' => $tracker_scope,
                'visit_id_present' => !empty($hit['visit_id']),
            ]);
        }

        if (!$has_enrichment_flag) {
            $this->log_debug('Enriched request downgraded to base because granularity_enrichment flag is missing.', [
                'tracker_scope' => $tracker_scope,
                'visit_id_present' => !empty($hit['visit_id']),
            ]);
        }

        return 'base';
    }


    private function should_apply_enriched_visit_id_fallback(WP_REST_Request $request): bool {
        if (!$this->is_advanced_stats_enabled()) {
            $this->log_debug('Enriched visit_id fallback disabled because advanced stats are disabled.', [
                'reason' => 'advanced_stats_disabled',
            ]);
            return false;
        }

        $tracker_scope = $this->normalize_tracker_scope($request);
        if ($tracker_scope !== 'enriched') {
            return false;
        }

        $granularity_enrichment_param = $request->get_param('granularity_enrichment');
        if ($granularity_enrichment_param === null && $request->get_param('granularityEnrichment') !== null) {
            $granularity_enrichment_param = $request->get_param('granularityEnrichment');
        }

        $granularity_enrichment = rest_sanitize_boolean($granularity_enrichment_param);
        $upgrade_existing_hit = rest_sanitize_boolean($request->get_param('upgrade_existing_hit'));

        return $granularity_enrichment || $upgrade_existing_hit;
    }

    private function has_enriched_identifier(array $hit): bool {
        return !empty($hit['visit_id']) || !empty($hit['visitor_id']);
    }

    private function visitor_row_exists(string $visitor_id): bool {
        global $wpdb;

        if ($visitor_id === '') {
            return false;
        }

        $table = bbpa_resolve_sql_table('bbpa_visitors');
        if ($table === null) {
            return false;
        }

        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM `{$table}` WHERE visitor_id = %s", $visitor_id)
        ) > 0;
    }

    /**
     * Determine whether the payload enriches a previously tracked temporary hit.
     */
    private function is_existing_hit_enrichment(array $hit): bool {
        $has_enrichment_flag = !empty($hit['granularity_enrichment']) || !empty($hit['upgrade_existing_hit']);
        if (!$has_enrichment_flag) {
            return false;
        }

        $temporary_hit_id = isset($hit['temporary_hit_id']) ? (string) $hit['temporary_hit_id'] : '';
        return $temporary_hit_id !== '';
    }

    /**
     * Detect a normalized browser family from User-Agent.
     */
    private function detect_browser_family($user_agent): string {
        if (!is_string($user_agent)) {
            return '';
        }
        return bbpa_detect_browser_family($user_agent);
    }

    /**
     * Detect browser major version from User-Agent.
     */
    private function detect_browser_version($user_agent): string {
        if (!is_string($user_agent)) {
            return '';
        }
        return bbpa_detect_browser_major_version($user_agent);
    }

    /**
     * Detect operating system family from User-Agent.
     */
    private function detect_operating_system($user_agent): string {
        if (!is_string($user_agent)) {
            return '';
        }
        return bbpa_detect_operating_system_family($user_agent);
    }

    /**
     * Detect a normalized screen resolution from payload or client hint headers.
     */
    private function detect_screen_resolution(WP_REST_Request $request): string {
        $screen_resolution = $this->clean_screen_resolution($request->get_param('screen_resolution'));
        if ($screen_resolution !== '') {
            return $screen_resolution;
        }

        $viewport_width = absint($request->get_header('Sec-CH-Viewport-Width'));
        $viewport_height = absint($request->get_header('Sec-CH-Viewport-Height'));

        if ($viewport_width <= 0 || $viewport_height <= 0) {
            return '';
        }

        return $viewport_width . "x" . $viewport_height;
    }

    /**
     * Sanitize viewport values and normalize them as WIDTHxHEIGHT format.
     */
    private function clean_screen_resolution($screen_resolution): string {
        if (!is_string($screen_resolution)) {
            return '';
        }

        $screen_resolution = trim($screen_resolution);
        if ($screen_resolution === '') {
            return '';
        }

        if (!preg_match('/^(\d{1,5})x(\d{1,5})$/', $screen_resolution, $matches)) {
            return '';
        }

        $width = absint($matches[1]);
        $height = absint($matches[2]);
        if ($width <= 0 || $height <= 0) {
            return '';
        }

        return $width . "x" . $height;
    }

    /**
     * Normalize page paths and strip query/fragment.
     */
    private function clean_page_path($page_path): string {
        if (!is_string($page_path)) {
            return '';
        }

        $page_path = trim($page_path);
        if ($page_path === '') {
            return '';
        }

        $parsed = wp_parse_url($page_path);
        $path = $parsed['path'] ?? '';
        if ($path === '') {
            return '';
        }

        $path = '/' . ltrim($path, '/');
        $path = untrailingslashit($path);
        $path = $path === '' ? '/' : $path;

        $query = $parsed['query'] ?? '';
        if ($query === '') {
            return $path;
        }

        $settings = bbpa_get_settings();

        if (function_exists('bbpa_is_frontend_collection_context') && !bbpa_is_frontend_collection_context($settings, true)) {
            return 'non_front_context';
        }
        $query_args = [];
        wp_parse_str($query, $query_args);
        if (!is_array($query_args)) {
            return $path;
        }

        $sanitized_args = [];
        foreach ($query_args as $key => $value) {
            $key = sanitize_key($key);
            if ($key === '') {
                continue;
            }

            if (is_array($value)) {
                $value = reset($value);
            }

            $sanitized_args[$key] = sanitize_text_field((string) $value);
        }

        $strip_query = !empty($settings['url_strip_query']);
        if ($strip_query) {
            $allowlist = $settings['url_query_allowlist'] ?? [];
            if ($allowlist) {
                $allowlist = array_fill_keys($allowlist, true);
                $sanitized_args = array_intersect_key($sanitized_args, $allowlist);
            } else {
                $sanitized_args = [];
            }

            if ($path === '/wp-admin/admin.php' && isset($query_args['page'])) {
                $admin_page = sanitize_key((string) $query_args['page']);
                if ($admin_page !== '' && strpos($admin_page, 'bimbeau-privacy-analytics') === 0) {
                    $sanitized_args['page'] = $admin_page;
                }
            }
        }

        if ($sanitized_args === []) {
            return $path;
        }

        $query_string = http_build_query($sanitized_args, '', '&', PHP_QUERY_RFC3986);

        return $query_string !== '' ? $path . '?' . $query_string : $path;
    }

    /**
     * Extract and sanitize referrer domain.
     */
    private function clean_referrer_domain($referrer_domain): ?string {
        if (!is_string($referrer_domain)) {
            return null;
        }

        $referrer_domain = trim($referrer_domain);
        if ($referrer_domain === '') {
            return null;
        }

        $candidate = $referrer_domain;
        if (!str_contains($candidate, '://')) {
            $candidate = 'https://' . $candidate;
        }

        $parsed = wp_parse_url($candidate);
        if (empty($parsed['host'])) {
            return null;
        }

        return bbpa_lowercase(sanitize_text_field($parsed['host']));
    }

    /**
     * Sanitize device class with allow list.
     */
    private function clean_device_class($device_class): string {
        if (!is_string($device_class)) {
            return '';
        }

        $device_class = sanitize_key($device_class);
        $allowed = [
            'desktop',
            'tablet',
            'mobile',
            'bot',
        ];

        return in_array($device_class, $allowed, true) ? $device_class : '';
    }


    private function detect_device_class_from_user_agent(string $user_agent): string {
        $normalized_user_agent = strtolower($user_agent);
        if ($normalized_user_agent === '') {
            return 'unknown';
        }

        if (preg_match('/bot|crawl|spider|slurp|bingpreview|headless/i', $normalized_user_agent) === 1) {
            return 'bot';
        }

        if (preg_match('/ipad|tablet|kindle|silk|playbook/i', $normalized_user_agent) === 1) {
            return 'tablet';
        }

        if (preg_match('/mobile|iphone|android|phone|opera mini|iemobile/i', $normalized_user_agent) === 1) {
            return 'mobile';
        }

        return 'desktop';
    }

    /**
     * Validate a client-side visit identifier.
     *
     * @return string|false Empty string when omitted, false when invalid.
     */
    private function clean_visit_id($visit_id)
    {
        if ($visit_id === null || $visit_id === '') {
            return '';
        }

        if (!is_string($visit_id)) {
            return false;
        }

        $visit_id = sanitize_text_field(trim($visit_id));
        if ($visit_id === '') {
            return '';
        }

        if (
            !preg_match('/^[A-Za-z0-9_-]+$/', $visit_id)
            || strlen($visit_id) < self::MIN_VISIT_ID_LENGTH
            || strlen($visit_id) > self::MAX_VISIT_ID_LENGTH
        ) {
            return false;
        }

        return $visit_id;
    }

    /**
     * Resolve a visitor identifier that stays stable across tabs in the same visit window.
     */
    private function resolve_visitor_id(string $visit_id, string $granularity, int $timestamp_bucket = 0, bool $client_provided_visit_id = false): string {
        if ($visit_id === '') {
            return '';
        }

        if ($client_provided_visit_id) {
            return hash_hmac(
                'sha256',
                $visit_id,
                wp_salt('bbpa_visitor_identifier')
            );
        }

        if ($granularity === 'base' && function_exists('bbpa_get_visit_identifier')) {
            return sanitize_text_field((string) bbpa_get_visit_identifier($timestamp_bucket));
        }

        return hash_hmac(
            'sha256',
            $visit_id,
            wp_salt('bbpa_visitor_identifier')
        );
    }

    /**
     * Sanitize analytics event name.
     */
    private function clean_event_name($event_name): string {
        if (!is_string($event_name)) {
            return 'page_view';
        }

        $event_name = sanitize_key($event_name);
        if ($event_name === '' || $this->exceeds_max_length($event_name, self::MAX_EVENT_NAME_LENGTH)) {
            return 'page_view';
        }

        if ($event_name === 'pageview' || $event_name === 'view') {
            return 'page_view';
        }

        return $event_name;
    }

    /**
     * Sanitize temporary hit identifier.
     */
    private function clean_temporary_hit_id($temporary_hit_id): string {
        if (!is_string($temporary_hit_id)) {
            return '';
        }

        $temporary_hit_id = sanitize_text_field(trim($temporary_hit_id));
        if ($temporary_hit_id === '') {
            return '';
        }

        if (
            !preg_match('/^[A-Za-z0-9_-]+$/', $temporary_hit_id)
            || $this->exceeds_max_length($temporary_hit_id, self::MAX_TEMPORARY_HIT_ID_LENGTH)
        ) {
            return '';
        }

        return $temporary_hit_id;
    }

    /**
     * Sanitize idempotency key for upgrade events.
     */
    private function clean_idempotency_key($idempotency_key): string {
        if (!is_string($idempotency_key)) {
            return '';
        }

        $idempotency_key = sanitize_text_field(trim($idempotency_key));
        if ($idempotency_key === '') {
            return '';
        }

        if (
            !preg_match('/^[A-Za-z0-9_|:-]+$/', $idempotency_key)
            || $this->exceeds_max_length($idempotency_key, self::MAX_IDEMPOTENCY_KEY_LENGTH)
        ) {
            return '';
        }

        return $idempotency_key;
    }

    /**
     * Determine whether plugin debug mode is enabled.
     */
    private function is_debug_mode_enabled(): bool {
        if (function_exists('bbpa_is_debug_mode_enabled')) {
            return bbpa_is_debug_mode_enabled();
        }

        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];

        return !empty($settings['debug_enabled']);
    }

    /**
     * Write structured debug logs for public hit ingestion.
     */
    private function log_debug(string $message, array $context = []): void {
        if (!$this->is_debug_mode_enabled()) {
            return;
        }

        $context = $this->sanitize_debug_context($context);
        BBPA_Logger::channel('Ingest')->info($message, $context);
    }

    /**
     * Write event-scoped debug logs for non-page-view traffic.
     */
    private function log_event_debug(string $message, array $hit, array $context = []): void {
        if (!$this->is_debug_mode_enabled()) {
            return;
        }

        $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : '';
        if ($event_name === '' || $event_name === 'page_view') {
            return;
        }

        $event_context = array_merge([
            'event_name' => $event_name,
            'granularity' => (string) ($hit['granularity'] ?? 'base'),
            'tracker_scope' => (string) ($hit['tracker_scope'] ?? ''),
            'temporary_hit_id_present' => !empty($hit['temporary_hit_id']),
            'idempotency_key_present' => !empty($hit['idempotency_key']),
        ], $context);

        BBPA_Logger::channel('Event')->info($message, $this->sanitize_debug_context($event_context));
    }

    /**
     * Remove sensitive network identifiers from debug context.
     */
    private function sanitize_debug_context(array $context): array {
        $blocked_keys = ['ip', 'client_ip', 'remote_addr', 'x_forwarded_for'];
        $sanitized = [];

        foreach ($context as $key => $value) {
            $normalized_key = strtolower((string) $key);
            if (in_array($normalized_key, $blocked_keys, true)) {
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitize_debug_context($value);
                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    /**
     * Determine whether a value exceeds a maximum character length.
     */
    private function exceeds_max_length(string $value, int $max_length): bool {
        if (function_exists('mb_strlen')) {
            return mb_strlen($value) > $max_length;
        }

        return strlen($value) > $max_length;
    }

    /**
     * Apply replay deduplication without collapsing legitimate page reloads.
     */
    private function is_duplicate_hit(array $hit, WP_REST_Request $request): bool {
        $granularity = (($hit['granularity'] ?? 'base') === 'enriched') ? 'enriched' : 'base';
        $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;

        if ($granularity === 'base') {
            $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
            if ($event_name === '') {
                $event_name = 'page_view';
            }

            if ($event_name !== 'page_view') {
                return false;
            }

            $request_meta = [
                'ip' => bbpa_get_client_ip(),
                'user_agent' => sanitize_text_field((string) $request->get_header('User-Agent')),
            ];
            $page_path = isset($hit['page_path']) ? (string) $hit['page_path'] : '';
            $temporary_hit_id = isset($hit['temporary_hit_id']) ? (string) $hit['temporary_hit_id'] : '';
            $idempotency_key = isset($hit['idempotency_key']) ? (string) $hit['idempotency_key'] : '';

            if ($temporary_hit_id !== '' || $idempotency_key !== '') {
                $dedupe_marker = md5(implode('|', [
                    'base_page_view_transport',
                    $temporary_hit_id,
                    $idempotency_key,
                ]));
                $ttl = (int) apply_filters(
                    'bbpa_base_transport_replay_ttl',
                    self::BASE_TRANSPORT_REPLAY_TTL,
                    $hit,
                    $request_meta
                );
                $ttl = max(10, min(self::BASE_TRANSPORT_REPLAY_TTL, $ttl));
            } else {
                $dedupe_marker = md5(implode('|', [
                    'base_page_view_immediate',
                    (string) $timestamp,
                    $page_path,
                    $request_meta['ip'],
                    $request_meta['user_agent'],
                ]));
                $ttl = (int) apply_filters(
                    'bbpa_base_immediate_replay_ttl',
                    self::BASE_IMMEDIATE_REPLAY_TTL,
                    $hit,
                    $request_meta
                );
                $ttl = max(1, min(10, $ttl));
            }
        } else {
            $ttl = (int) apply_filters('bbpa_enriched_replay_ttl', 20, $hit);
            $ttl = (int) apply_filters('bbpa_dedupe_ttl', $ttl);
            $ttl = max(10, min(30, $ttl));
            $visit_id = isset($hit['visit_id']) ? (string) $hit['visit_id'] : '';
            $idempotency_key = isset($hit['idempotency_key']) ? (string) $hit['idempotency_key'] : '';
            if ($visit_id === '' && $idempotency_key === '') {
                return false;
            }

            $dedupe_marker = md5(implode('|', [
                (string) $timestamp,
                $visit_id,
                $idempotency_key,
            ]));
        }

        $cache_key = 'bbpa_dedupe_' . $dedupe_marker;

        if (wp_cache_get($cache_key, 'bbpa_dedupe') !== false) {
            $this->log_debug('Duplicate hit detected from object cache.', [
                'granularity' => $granularity,
                'timestamp_bucket' => $timestamp,
            ]);
            return true;
        }

        if (get_transient($cache_key) !== false) {
            wp_cache_set($cache_key, 1, 'bbpa_dedupe', $ttl);
            $this->log_debug('Duplicate hit detected from transient cache.', [
                'granularity' => $granularity,
                'timestamp_bucket' => $timestamp,
            ]);
            return true;
        }

        wp_cache_set($cache_key, 1, 'bbpa_dedupe', $ttl);
        set_transient($cache_key, 1, $ttl);

        return false;
    }

    /**
     * Store hit data.
     */
    private function store_hit(array $hit, array $utm_params = []): void {
        $is_bot_hit = isset($hit['device_class']) && (string) $hit['device_class'] === 'bot';
        $event_name = (string) ($hit['event_name'] ?? 'page_view');
        $is_page_view_event = $event_name === 'page_view';
        $is_technical_event = $this->is_technical_event_name($event_name);
        $is_initial_page_view = $is_page_view_event && absint($hit['active_ms_delta'] ?? 0) === 0;

        if ($is_initial_page_view) {
            $this->remember_page_view_context($hit);
        }

        $is_enriched_hit = (($hit['granularity'] ?? 'base') === 'enriched') && $this->has_enriched_identifier($hit);
        $is_enriched_event_upgrade = $is_enriched_hit
            && !empty($hit['granularity_enrichment'])
            && !$is_page_view_event
            && !$is_technical_event;

        if (!$is_bot_hit && !$is_enriched_event_upgrade) {
            $base_hit = [
                'page_path' => $hit['page_path'] ?? '',
                'referrer_domain' => $hit['referrer_domain'] ?? '',
                'device_class' => $hit['device_class'] ?? '',
                'timestamp_bucket' => $hit['timestamp_bucket'] ?? 0,
                'active_ms_delta' => $hit['active_ms_delta'] ?? 0,
                'event_name' => $event_name,
                'visitor_id' => $hit['visitor_id'] ?? '',
                'visit_id' => $hit['visit_id'] ?? '',
                'temporary_hit_id' => $hit['temporary_hit_id'] ?? '',
                'idempotency_key' => $hit['idempotency_key'] ?? '',
            ];
            bbpa_store_aggregate_hit($base_hit, $utm_params);
            if ($is_page_view_event && function_exists('bbpa_remember_visit_attribution')) {
                bbpa_remember_visit_attribution($hit, $utm_params);
            }
            $this->log_debug('Aggregate hit persisted.', [
                'granularity' => (string) ($hit['granularity'] ?? 'base'),
                'event_name' => $event_name,
                'is_initial_page_view' => $is_initial_page_view,
                'is_enriched_hit' => $is_enriched_hit,
                'utm_param_count' => count($utm_params),
            ]);

            if ($is_enriched_hit) {
                bbpa_store_geo_aggregate_hit($hit);
                $this->log_debug('Geo aggregate persistence attempted for enriched hit.', [
                    'visit_id_present' => !empty($hit['visit_id']),
                    'visitor_id_present' => !empty($hit['visitor_id']),
                    'country_code' => (string) ($hit['country_code'] ?? ''),
                    'city' => (string) ($hit['city'] ?? ''),
                    'city_name' => (string) ($hit['city_name'] ?? ''),
                    'resolved_city_name' => (string) ($hit['city_name'] ?? $hit['city'] ?? ''),
                    'latitude_present' => isset($hit['latitude']) && is_numeric($hit['latitude']),
                    'longitude_present' => isset($hit['longitude']) && is_numeric($hit['longitude']),
                    'city_geoname_id' => bbpa_normalize_geoname_id($hit['city_geoname_id'] ?? null),
                ]);
            }
        } elseif ($is_enriched_event_upgrade) {
            if ($is_enriched_hit) {
                bbpa_store_geo_aggregate_hit($hit);
            }

            $this->log_debug('Aggregate hit skipped for enriched event upgrade payload.', [
                'granularity' => (string) ($hit['granularity'] ?? 'base'),
                'event_name' => $event_name,
                'temporary_hit_id_present' => !empty($hit['temporary_hit_id']),
                'idempotency_key_present' => !empty($hit['idempotency_key']),
            ]);
        }

        $visitor_write_succeeded = false;
        $realtime_write_succeeded = false;
        $can_persist_visitor = !empty($hit['visitor_id']) && in_array((string) ($hit['granularity'] ?? 'base'), ['base', 'enriched'], true);
        if ($can_persist_visitor) {
            $visitor_hit = $hit;
            $visitor_store_result = bbpa_store_visitor_hit_with_outcome($visitor_hit);
            $visitor_write_succeeded = !empty($visitor_store_result['stored']);
            $is_new_visitor = !empty($visitor_store_result['is_new_visitor']);
            $is_existing_hit_enrichment = $this->is_existing_hit_enrichment($hit);
            if ($is_new_visitor && !$is_existing_hit_enrichment) {
                $date_bucket = wp_date('Y-m-d', absint($hit['timestamp_bucket'] ?? current_time('timestamp')));
                bbpa_increment_visits_daily(
                    $date_bucket,
                    (string) ($hit['page_path'] ?? ''),
                    (string) ($hit['referrer_domain'] ?? ''),
                    (string) ($hit['device_class'] ?? '')
                );
                bbpa_increment_overview_daily_visitors($date_bucket);
            } elseif ($is_new_visitor && $is_existing_hit_enrichment) {
                $this->log_debug('Visitor aggregate increment skipped for existing hit enrichment.', [
                    'event_name' => $event_name,
                    'temporary_hit_id_present' => !empty($hit['temporary_hit_id']),
                    'granularity_enrichment' => !empty($hit['granularity_enrichment']),
                    'upgrade_existing_hit' => !empty($hit['upgrade_existing_hit']),
                ]);
            }
            if (!$visitor_write_succeeded) {
                $this->log_debug('Accepted enriched hit did not persist visitor row.', [
                    'reason' => 'visitor_write_failed',
                    'visit_id' => (string) ($hit['visit_id'] ?? ''),
                    'visitor_id' => (string) ($hit['visitor_id'] ?? ''),
                ]);
            }

            if ($is_enriched_hit) {
                $realtime_write_succeeded = $this->store_realtime_visitor_bucket($hit);
                if (!$realtime_write_succeeded) {
                    $this->log_debug('Accepted enriched hit did not persist realtime bucket.', [
                        'reason' => 'realtime_write_failed',
                        'visit_id' => (string) ($hit['visit_id'] ?? ''),
                        'visitor_id' => (string) ($hit['visitor_id'] ?? ''),
                    ]);
                }
            }
        } else {
            $granularity = (string) ($hit['granularity'] ?? 'base');
            $this->log_debug('Accepted hit skipped visitor persistence because visitor identity is unavailable.', [
                'reason' => 'visitor_identity_missing',
                'granularity' => $granularity,
                'visit_id' => (string) ($hit['visit_id'] ?? ''),
            ]);
        }

        $raw_enriched_log_written = false;
        if (!$is_enriched_hit || !bbpa_raw_logs_enabled()) {
            if ($is_enriched_hit && !bbpa_raw_logs_enabled()) {
                $this->log_debug('Accepted enriched hit skipped raw log persistence because raw logs are disabled.', [
                    'reason' => 'raw_log_not_written',
                    'visit_id' => (string) ($hit['visit_id'] ?? ''),
                    'visitor_id' => (string) ($hit['visitor_id'] ?? ''),
                ]);
            }
            $this->maybe_persist_enriched_granularity(
                $hit,
                $is_enriched_hit,
                $visitor_write_succeeded,
                $raw_enriched_log_written
            );
            return;
        }

        $hits = get_option('bbpa_hits', []);
        if (!is_array($hits)) {
            $hits = [];
        }

        $hit['aggregated'] = true;
        $hit['aggregated_at'] = current_time('timestamp');
        $hits[] = $hit;

        $max_hits = apply_filters('bbpa_max_hits', 1000);
        if (count($hits) > $max_hits) {
            $hits = array_slice($hits, -$max_hits);
        }

        update_option('bbpa_hits', $hits, false);
        $raw_enriched_log_written = true;

        $this->maybe_persist_enriched_granularity(
            $hit,
            $is_enriched_hit,
            $visitor_write_succeeded,
            $raw_enriched_log_written
        );

        if ($is_enriched_hit && !$raw_enriched_log_written) {
            $this->log_debug('Accepted enriched hit did not persist raw log.', [
                'reason' => 'raw_log_not_written',
                'visit_id' => (string) ($hit['visit_id'] ?? ''),
                'visitor_id' => (string) ($hit['visitor_id'] ?? ''),
            ]);
        }
    }

    /**
     * Persist enriched granularity only after a concrete enriched success signal.
     */
    private function maybe_persist_enriched_granularity(
        array $hit,
        bool $is_enriched_hit,
        bool $visitor_write_succeeded,
        bool $raw_enriched_log_written
    ): void {
        if (!$this->is_advanced_stats_enabled()) {
            $this->log_debug('Enriched granularity marker skipped because advanced stats are disabled.', [
                'reason' => 'advanced_stats_disabled',
            ]);
            return;
        }

        $has_valid_client_enriched_payload = $this->is_valid_client_enriched_payload($hit);

        $has_concrete_success = $visitor_write_succeeded
            || $raw_enriched_log_written
            || ($is_enriched_hit && $has_valid_client_enriched_payload);

        if (!$has_concrete_success) {
            $this->log_debug('Enriched granularity marker not persisted.', [
                'is_enriched_hit' => $is_enriched_hit,
                'visitor_write_succeeded' => $visitor_write_succeeded,
                'raw_enriched_log_written' => $raw_enriched_log_written,
                'has_valid_client_enriched_payload' => $has_valid_client_enriched_payload,
            ]);
            return;
        }

        update_option('bbpa_persisted_granularity', 'enriched', false);
        $this->log_debug('Enriched granularity marker persisted.', [
            'visitor_write_succeeded' => $visitor_write_succeeded,
            'raw_enriched_log_written' => $raw_enriched_log_written,
            'has_valid_client_enriched_payload' => $has_valid_client_enriched_payload,
        ]);
    }

    /**
     * Determine whether the hit is enriched from explicit client payload fields only.
     */
    private function is_valid_client_enriched_payload(array $hit): bool {
        if (($hit['granularity'] ?? 'base') !== 'enriched') {
            return false;
        }

        return !empty($hit['visit_id'])
            && !empty($hit['granularity_enrichment']);
    }

    /**
     * Store a minimal realtime visitor row for global active visitor counting.
     */
    private function store_realtime_visitor_bucket(array $hit): bool {
        $timestamp_bucket = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
        if ($timestamp_bucket <= 0) {
            return false;
        }

        $granularity = (($hit['granularity'] ?? 'base') === 'enriched') ? 'enriched' : 'base';

        $realtime_hits = get_option('bbpa_realtime_visitors', []);
        if (!is_array($realtime_hits)) {
            $realtime_hits = [];
        }

        $row = [
            'timestamp_bucket' => $timestamp_bucket,
            'granularity' => $granularity,
        ];

        if ($granularity === 'enriched') {
            $this->log_debug('Realtime bucket write pre-check.', [
                'accuracy_radius_key_exists' => array_key_exists('accuracy_radius', $hit),
                'accuracy_radius' => $hit['accuracy_radius'] ?? null,
                'latitude' => $hit['latitude'] ?? null,
                'longitude' => $hit['longitude'] ?? null,
            ]);
            $visitor_bucket = '';
            $visitor_id = !empty($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
            $visit_id = !empty($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
            if ($visitor_id !== '') {
                $visitor_bucket = $visitor_id;
            } elseif ($visit_id !== '') {
                $visitor_bucket = $visit_id;
            }

            if ($visitor_bucket === '') {
                return false;
            }

            $row['visitor_bucket'] = $visitor_bucket;
            if ($visitor_id !== '') {
                $row['visitor_id'] = $visitor_id;
            }
            if ($visit_id !== '') {
                $row['visit_id'] = $visit_id;
            }

            $page_path = isset($hit['page_path']) ? sanitize_text_field((string) $hit['page_path']) : '';
            if ($page_path !== '') {
                $row['page_path'] = $page_path;
            }

            foreach (['country_code', 'country', 'city', 'device_class', 'browser', 'browser_version', 'operating_system', 'screen_resolution', 'referrer_domain', 'source_category'] as $field) {
                if (!empty($hit[$field])) {
                    $row[$field] = sanitize_text_field((string) $hit[$field]);
                }
            }

            $coordinates = function_exists('bbpa_normalize_coordinate_pair')
                ? bbpa_normalize_coordinate_pair($hit['latitude'] ?? null, $hit['longitude'] ?? null)
                : ['latitude' => null, 'longitude' => null];

            if ($coordinates['latitude'] !== null && $coordinates['longitude'] !== null) {
                $row['latitude'] = (float) $coordinates['latitude'];
                $row['longitude'] = (float) $coordinates['longitude'];
            }

            if (function_exists('bbpa_normalize_geoname_id')) {
                $city_geoname_id = bbpa_normalize_geoname_id($hit['city_geoname_id'] ?? null);
                if ($city_geoname_id !== null) {
                    $row['city_geoname_id'] = $city_geoname_id;
                }
            }

            $accuracy_radius = isset($hit['accuracy_radius']) && is_numeric($hit['accuracy_radius'])
                ? max(0, (int) $hit['accuracy_radius'])
                : null;
            if ($accuracy_radius !== null) {
                $row['accuracy_radius'] = $accuracy_radius;
            }
            $this->log_debug('Realtime bucket row assembled.', [
                'accuracy_radius_key_exists' => array_key_exists('accuracy_radius', $row),
                'accuracy_radius' => $row['accuracy_radius'] ?? null,
                'latitude' => $row['latitude'] ?? null,
                'longitude' => $row['longitude'] ?? null,
            ]);
        }

        $realtime_hits[] = $row;

        $max_hits = apply_filters('bbpa_max_hits', 1000);
        if (count($realtime_hits) > $max_hits) {
            $realtime_hits = array_slice($realtime_hits, -$max_hits);
        }

        return update_option('bbpa_realtime_visitors', $realtime_hits, false) !== false;
    }


    /**
     * Store the initial page-view context for future granularity enrichment merges.
     */
    private function remember_page_view_context(array $hit): void {
        $temporary_hit_id = isset($hit['temporary_hit_id']) ? (string) $hit['temporary_hit_id'] : '';
        if ($temporary_hit_id === '') {
            return;
        }

        $context = [
            'page_path' => isset($hit['page_path']) ? (string) $hit['page_path'] : '',
            'referrer_domain' => isset($hit['referrer_domain']) ? (string) $hit['referrer_domain'] : '',
            'source_category' => isset($hit['source_category']) ? (string) $hit['source_category'] : '',
            'device_class' => isset($hit['device_class']) ? (string) $hit['device_class'] : '',
            'timestamp_bucket' => isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0,
            'visitor_id' => isset($hit['visitor_id']) ? (string) $hit['visitor_id'] : '',
            'event_name' => 'page_view',
            'created_at' => current_time('timestamp'),
        ];

        set_transient(
            'bbpa_tmp_hit_' . md5($temporary_hit_id),
            $context,
            self::TEMPORARY_HIT_TTL
        );
        $this->log_debug('Base page-view context stored for potential enriched merge.', [
            'temporary_hit_id_present' => true,
            'timestamp_bucket' => (int) $context['timestamp_bucket'],
            'device_class' => (string) $context['device_class'],
            'ttl_seconds' => self::TEMPORARY_HIT_TTL,
        ]);
    }

    private function store_upgrade_event(array $hit): bool {
        $idempotency_key = isset($hit['idempotency_key']) ? (string) $hit['idempotency_key'] : '';
        if ($idempotency_key === '') {
            $idempotency_key = (string) ($hit['temporary_hit_id'] ?? '') . '|enriched_upgrade';
        }

        $idempotency_cache_key = 'bbpa_upgrade_idem_' . md5($idempotency_key);
        if (get_transient($idempotency_cache_key) !== false) {
            $this->log_debug('Enriched upgrade ignored due to idempotency duplicate.', [
                'idempotency_key_present' => $idempotency_key !== '',
            ]);
            return false;
        }
        $temporary_hit_id = (string) ($hit['temporary_hit_id'] ?? '');
        $existing_context = get_transient('bbpa_tmp_hit_' . md5($temporary_hit_id));
        $has_stored_base_context = is_array($existing_context) && !empty($existing_context['page_path']);
        if (!$has_stored_base_context) {
            $existing_context = $this->resolve_upgrade_context_from_hit($hit);
            if (!is_array($existing_context) || empty($existing_context['page_path'])) {
                $this->log_debug('Enriched upgrade context resolution failed.', [
                    'temporary_hit_id_present' => $temporary_hit_id !== '',
                    'fallback_context_attempted' => true,
                ]);
                return false;
            }
        }

        $visitor_hit = $hit;
        if (!isset($visitor_hit['page_path']) || (string) $visitor_hit['page_path'] === '') {
            $visitor_hit['page_path'] = (string) ($existing_context['page_path'] ?? '');
        }
        if (!isset($visitor_hit['referrer_domain']) || (string) $visitor_hit['referrer_domain'] === '') {
            $visitor_hit['referrer_domain'] = (string) ($existing_context['referrer_domain'] ?? '');
        }
        if (!isset($visitor_hit['source_category']) || (string) $visitor_hit['source_category'] === '') {
            $visitor_hit['source_category'] = (string) ($existing_context['source_category'] ?? '');
            if ((string) $visitor_hit['source_category'] === '' && function_exists('bbpa_get_source_category_from_tracking_context')) {
                $context_url = (string) ($existing_context['page_path'] ?? $visitor_hit['page_path'] ?? '');
                $utm_params = $this->extract_utm_params($context_url, $visitor_hit);
                $visitor_hit['source_category'] = bbpa_get_source_category_from_tracking_context(
                    (string) ($visitor_hit['referrer_domain'] ?? ''),
                    $utm_params
                );
            }
        }
        if (!isset($visitor_hit['device_class']) || (string) $visitor_hit['device_class'] === '') {
            $visitor_hit['device_class'] = (string) ($existing_context['device_class'] ?? '');
        }
        if (absint($visitor_hit['timestamp_bucket'] ?? 0) <= 0) {
            $visitor_hit['timestamp_bucket'] = absint($existing_context['timestamp_bucket'] ?? 0);
        }
        $visitor_exists = $this->visitor_row_exists((string) ($visitor_hit['visitor_id'] ?? ''));
        if (($visitor_hit['event_name'] ?? '') === 'page_view') {
            if ($has_stored_base_context && $visitor_exists) {
                $visitor_hit['event_name'] = 'enrichment_update';
            }
        } else {
            $visitor_hit['upgrade_existing_hit'] = true;
            if (!$visitor_exists) {
                $visitor_hit['event_name'] = 'page_view';
            }
        }
        $visitor_store_result = bbpa_store_visitor_hit_with_outcome($visitor_hit);
        $visitor_write_succeeded = !empty($visitor_store_result['stored']);
        $is_new_visitor = !empty($visitor_store_result['is_new_visitor']);
        if ($is_new_visitor) {
            $this->log_debug('Visitor aggregate increment skipped for enriched upgrade merge.', [
                'temporary_hit_id_present' => $temporary_hit_id !== '',
                'context_resolved' => !empty($existing_context['page_path']),
            ]);
        }
        if (!$visitor_write_succeeded) {
            $this->log_debug('Enriched upgrade visitor row persistence failed.', [
                'visit_id' => (string) ($hit['visit_id'] ?? ''),
                'visitor_id' => (string) ($hit['visitor_id'] ?? ''),
                'event_name' => (string) ($hit['event_name'] ?? ''),
            ]);
        }

        $realtime_write_succeeded = $this->store_realtime_visitor_bucket($visitor_hit);
        if (!$realtime_write_succeeded) {
            $this->log_debug('Enriched upgrade realtime bucket persistence failed.', [
                'visit_id' => (string) ($visitor_hit['visit_id'] ?? ''),
                'visitor_id' => (string) ($visitor_hit['visitor_id'] ?? ''),
                'event_name' => (string) ($visitor_hit['event_name'] ?? ''),
                'timestamp_bucket' => absint($visitor_hit['timestamp_bucket'] ?? 0),
            ]);
        }

        $raw_logs_enabled = bbpa_raw_logs_enabled();
        $merged = false;

        if ($raw_logs_enabled) {
            $hits = get_option('bbpa_hits', []);
            if (is_array($hits) && $hits !== []) {
                $candidate_keys = [
                    'page_path' => (string) ($existing_context['page_path'] ?? ''),
                    'timestamp_bucket' => absint($existing_context['timestamp_bucket'] ?? 0),
                    'device_class' => (string) ($existing_context['device_class'] ?? ''),
                ];

                foreach ($hits as &$stored_hit) {
                    if (!is_array($stored_hit)) {
                        continue;
                    }

                    if (
                        ((string) ($stored_hit['page_path'] ?? '')) !== $candidate_keys['page_path']
                        || absint($stored_hit['timestamp_bucket'] ?? 0) !== $candidate_keys['timestamp_bucket']
                        || ((string) ($stored_hit['device_class'] ?? '')) !== $candidate_keys['device_class']
                    ) {
                        continue;
                    }

                    $stored_hit['enriched_upgrade'] = true;
                    $stored_hit['enriched_upgrade_at'] = current_time('timestamp');
                    if (!empty($hit['visit_id'])) {
                        $stored_hit['visit_id'] = sanitize_text_field((string) $hit['visit_id']);
                    }
                    if (!empty($hit['visitor_id'])) {
                        $stored_hit['visitor_id'] = sanitize_text_field((string) $hit['visitor_id']);
                    }
                    if (!empty($hit['browser_version'])) {
                        $stored_hit['browser_version'] = sanitize_text_field((string) $hit['browser_version']);
                    }
                    if (!empty($hit['screen_resolution'])) {
                        $stored_hit['screen_resolution'] = sanitize_text_field((string) $hit['screen_resolution']);
                    }

                    $merged = true;
                    break;
                }
                unset($stored_hit);

                if ($merged) {
                    update_option('bbpa_hits', $hits, false);
                }
            }
        }

        $upgrade_persisted = $visitor_write_succeeded || ($raw_logs_enabled && $merged);

        $this->log_debug('Enriched upgrade storage completed.', [
            'merged_existing_raw_hit' => $merged,
            'raw_logs_enabled' => $raw_logs_enabled,
            'visitor_write_succeeded' => $visitor_write_succeeded,
            'realtime_write_succeeded' => $realtime_write_succeeded,
            'upgrade_persisted' => $upgrade_persisted,
        ]);

        if (!$upgrade_persisted) {
            $this->log_debug('Enriched upgrade idempotency marker skipped because no persistence succeeded.', [
                'idempotency_key_present' => $idempotency_key !== '',
                'temporary_hit_id_present' => $temporary_hit_id !== '',
            ]);
            return false;
        }

        set_transient($idempotency_cache_key, 1, self::UPGRADE_IDEMPOTENCY_TTL);

        return true;
    }

    /**
     * Build request-level debug context for hit ingestion.
     */
    private function build_request_debug_context(WP_REST_Request $request): array {
        return [
            'tracker_scope' => $this->normalize_tracker_scope($request),
            'granularity_enrichment' => (bool) rest_sanitize_boolean($request->get_param('granularity_enrichment')),
            'temporary_hit_id_present' => ((string) $request->get_param('temporary_hit_id')) !== '',
            'idempotency_key_present' => ((string) $request->get_param('idempotency_key')) !== '',
            'timestamp_bucket' => absint($request->get_param('timestamp_bucket')),
        ];
    }

    /**
     * Build concise hit debug context for logging.
     */
    private function build_hit_debug_context(array $hit): array {
        return [
            'page_path' => (string) ($hit['page_path'] ?? ''),
            'event_name' => (string) ($hit['event_name'] ?? 'page_view'),
            'device_class' => (string) ($hit['device_class'] ?? ''),
            'granularity' => (string) ($hit['granularity'] ?? 'base'),
            'tracker_scope' => (string) ($hit['tracker_scope'] ?? ''),
            'timestamp_bucket' => isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0,
            'visit_id_present' => !empty($hit['visit_id']),
            'visitor_id_present' => !empty($hit['visitor_id']),
        ];
    }

    /**
     * Resolve fallback merge context for enrichment payloads when temporary IDs diverge.
     */
    private function resolve_upgrade_context_from_hit(array $hit): ?array {
        $page_path = isset($hit['page_path']) ? (string) $hit['page_path'] : '';
        $timestamp_bucket = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
        $device_class = isset($hit['device_class']) ? (string) $hit['device_class'] : '';
        if ($page_path === '' || $timestamp_bucket <= 0 || $device_class === '') {
            return null;
        }

        return [
            'page_path' => $page_path,
            'timestamp_bucket' => $timestamp_bucket,
            'device_class' => $device_class,
        ];
    }

    /**
     * Determine whether this hit should merge a previously stored base page view.
     */
    private function should_merge_enriched_hit(array $hit): bool {
        if (!$this->is_advanced_stats_enabled()) {
            $this->log_debug('Enriched merge skipped because advanced stats are disabled.', [
                'reason' => 'advanced_stats_disabled',
                'event_name' => isset($hit['event_name']) ? (string) $hit['event_name'] : '',
            ]);
            return false;
        }

        $is_enrichment_request = !empty($hit['granularity_enrichment']);
        $event_name = isset($hit['event_name']) ? (string) $hit['event_name'] : '';
        $is_upgrade_event = $event_name === 'enrichment_update';
        $is_correlated_page_view = $event_name === 'page_view'
            && !empty($hit['temporary_hit_id']);

        return $is_enrichment_request
            && ($is_upgrade_event || $is_correlated_page_view)
            && !empty($hit['temporary_hit_id'])
            && !empty($hit['idempotency_key'])
            && (($hit['granularity'] ?? 'base') === 'enriched');
    }

    /**
     * Technical events represent transport/session lifecycle updates and are excluded from business KPIs.
     */
    private function is_technical_event_name(string $event_name): bool {
        return in_array($event_name, ['enrichment_update', 'heartbeat'], true);
    }

    /**
     * Extract allowlisted UTM params from raw page path input.
     */
    private function extract_utm_params($page_path, array $hit = []): array {
        $settings = bbpa_get_settings();

        if (function_exists('bbpa_is_frontend_collection_context') && !bbpa_is_frontend_collection_context($settings, true)) {
            return [];
        }

        return bbpa_extract_utm_params($page_path, $settings['url_query_allowlist'] ?? []);
    }
}
