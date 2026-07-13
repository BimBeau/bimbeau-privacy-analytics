<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

/**
 * Front-end tracking helpers for BimBeau Privacy Analytics.
 */

const BBPA_MAX_SEARCH_TERM_LENGTH = 255;
const BBPA_MAX_REFERRER_LENGTH = 255;

/**
 * Execute a counter UPSERT in an allowlisted table.
 */
function bbpa_tracking_upsert_counter(string $table_suffix, array $columns, array $values, array $increment_columns): void
{
    global $wpdb;

    $table = bbpa_resolve_sql_table($table_suffix);
    if ($table === null) {
        bbpa_safe_log('Storage', 'warning', 'SQL guard blocked unknown tracking table', ['table_suffix' => $table_suffix]);
        return;
    }

    if (function_exists('bbpa_is_table_write_allowed') && !bbpa_is_table_write_allowed($table)) {
        return;
    }

    $validated_columns = [];
    foreach ($columns as $column) {
        $column_name = is_string($column) ? sanitize_key(wp_unslash($column)) : '';
        if ($column_name === '') {
            return;
        }
        $validated_columns[] = $column_name;
    }

    $validated_increment_columns = [];
    foreach ($increment_columns as $column) {
        $column_name = is_string($column) ? sanitize_key(wp_unslash($column)) : '';
        if ($column_name === '' || !in_array($column_name, $validated_columns, true)) {
            return;
        }
        $validated_increment_columns[] = $column_name;
    }

    $placeholders = array_fill(0, count($validated_columns), '%s');
    $updates = [];
    foreach ($validated_increment_columns as $column) {
        $updates[] = "{$column} = {$column} + VALUES({$column})";
    }

    $sql = "INSERT INTO `{$table}` (" . implode(', ', $validated_columns) . ') VALUES ('
        . implode(', ', $placeholders) . ') ON DUPLICATE KEY UPDATE ' . implode(', ', $updates);

    $prepared_sql = $wpdb->prepare($sql, ...$values);
    if ($prepared_sql === false) {
        bbpa_safe_log('Storage', 'error', 'Failed to prepare tracking UPSERT query', ['table_suffix' => $table_suffix]);
        return;
    }

    $wpdb->query($prepared_sql);

    if ($wpdb->last_error === '') {
        bbpa_flush_admin_cache();
    }
}


/**
 * Determine whether runtime context allows public front-end collection.
 */
function bbpa_is_frontend_collection_context(?array $settings = null, bool $allow_rest_request = false): bool
{
    if ($settings === null) {
        $settings = bbpa_get_settings();
    }

    if (is_admin()) {
        return false;
    }

    if (wp_doing_ajax()) {
        return false;
    }

    if (defined('REST_REQUEST') && REST_REQUEST && !$allow_rest_request) {
        return false;
    }

    if (defined('DOING_CRON') && DOING_CRON) {
        return false;
    }

    if (defined('WP_CLI') && WP_CLI) {
        return false;
    }

    if (function_exists('wp_is_json_request') && wp_is_json_request() && !(defined('REST_REQUEST') && REST_REQUEST && $allow_rest_request)) {
        return false;
    }

    return true;
}

/**
 * Track front-end requests and store aggregated counts.
 */
function bbpa_track_request(): void
{
    $settings = bbpa_get_settings();

    if (!bbpa_is_frontend_collection_context($settings)) {
        return;
    }
    if (bbpa_should_skip_tracking($settings)) {
        return;
    }

    $path = bbpa_get_request_path($settings);
    if ($path === '') {
        return;
    }

    if (bbpa_is_excluded_path($path, $settings)) {
        return;
    }

    $timestamp = current_time('timestamp');
    $date_bucket = wp_date('Y-m-d', $timestamp);

    if (is_404()) {
        bbpa_increment_404s_daily($date_bucket, $path);
    }

    if (is_search()) {
        $term = bbpa_normalize_search_term(get_search_query(false));
        if ($term !== '') {
            bbpa_increment_search_terms_daily($date_bucket, $term);
        }
    }

    // Browser trackers are the single source of truth for page-view ingestion.
    // Server-side request tracking is disabled to prevent duplicate counting.
    if (apply_filters('bbpa_disable_server_request_collection', true, $settings, $path)) {
        return;
    }

    $referrer = bbpa_get_referrer_info();
    bbpa_increment_hits_daily(
        $date_bucket,
        $path,
        $referrer['domain'],
        $referrer['category']
    );

    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
    $utm_params = bbpa_extract_utm_params($request_uri, $settings['url_query_allowlist'] ?? []);
}

/**
 * Determine whether tracking should be skipped.
 */
function bbpa_should_skip_tracking(array $settings): bool
{
    if (!empty($settings['excluded_roles']) && is_user_logged_in()) {
        $user = wp_get_current_user();
        if (!empty($user->roles)) {
            foreach ($user->roles as $role) {
                if (in_array($role, $settings['excluded_roles'], true)) {
                    return true;
                }
            }
        }
    }

    if (!empty($settings['respect_dnt_gpc'])) {
        $dnt = isset($_SERVER['HTTP_DNT']) ? bbpa_request_get_string($_SERVER, 'HTTP_DNT') : null;
        if ($dnt !== null && (string) $dnt === '1') {
            return true;
        }

        $gpc = isset($_SERVER['HTTP_SEC_GPC']) ? bbpa_request_get_string($_SERVER, 'HTTP_SEC_GPC') : null;
        if ($gpc !== null && (string) $gpc === '1') {
            return true;
        }
    }

    return false;
}

/**
 * Normalize the current request path.
 */
function bbpa_get_request_path(array $settings): string
{
    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI', '/');
    $request_uri = trim($request_uri);
    if ($request_uri === '') {
        return '';
    }

    $parsed = wp_parse_url($request_uri);
    $path = $parsed['path'] ?? '';
    if ($path === '') {
        return '';
    }

    $path = bbpa_lowercase($path);
    $path = '/' . ltrim($path, '/');
    $path = untrailingslashit($path);
    $path = $path === '' ? '/' : $path;

    $query = $parsed['query'] ?? '';
    if ($query === '') {
        return bbpa_trim_value($path, BBPA_MAX_PATH_LENGTH);
    }

    $query_args = [];
    wp_parse_str($query, $query_args);
    if (!is_array($query_args)) {
        return bbpa_trim_value($path, BBPA_MAX_PATH_LENGTH);
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

    $allowlist = $settings['url_query_allowlist'] ?? [];
    if ($allowlist) {
        $allowlist = array_fill_keys($allowlist, true);
        $sanitized_args = array_intersect_key($sanitized_args, $allowlist);
    } else {
        $sanitized_args = [];
    }

    if ($sanitized_args === []) {
        return bbpa_trim_value($path, BBPA_MAX_PATH_LENGTH);
    }

    $query_string = http_build_query($sanitized_args, '', '&', PHP_QUERY_RFC3986);
    $full_path = $query_string !== '' ? $path . '?' . $query_string : $path;

    return bbpa_trim_value($full_path, BBPA_MAX_PATH_LENGTH);
}

/**
 * Check excluded paths list.
 */
function bbpa_is_excluded_path(string $path, array $settings): bool
{
    if (empty($settings['excluded_paths'])) {
        return false;
    }

    if (in_array($path, $settings['excluded_paths'], true)) {
        return true;
    }

    $base_path = strtok($path, '?');
    if ($base_path === false || $base_path === '') {
        return false;
    }

    return in_array($base_path, $settings['excluded_paths'], true);
}

/**
 * Normalize a search term.
 */
function bbpa_normalize_search_term($term): string
{
    if (!is_string($term)) {
        return '';
    }

    $term = sanitize_text_field($term);
    $term = trim($term);
    if ($term === '') {
        return '';
    }

    return bbpa_trim_value($term, BBPA_MAX_SEARCH_TERM_LENGTH);
}

/**
 * Extract referrer domain and classify source category.
 */
function bbpa_get_referrer_info(): array
{
    $referrer = bbpa_request_get_string($_SERVER, 'HTTP_REFERER');
    if (!is_string($referrer) || trim($referrer) === '') {
        return [
            'domain' => '',
            'category' => 'Direct',
        ];
    }

    $candidate = trim($referrer);
    if (!str_contains($candidate, '://')) {
        $candidate = 'https://' . $candidate;
    }
    $parsed = wp_parse_url($candidate);
    if (empty($parsed['host'])) {
        return [
            'domain' => '',
            'category' => 'Unknown',
        ];
    }

    $domain = sanitize_text_field(bbpa_lowercase($parsed['host']));
    $domain = bbpa_trim_value($domain, BBPA_MAX_REFERRER_LENGTH);

    if (bbpa_is_internal_referrer_domain($domain)) {
        return [
            'domain' => '',
            'category' => 'Direct',
        ];
    }

    return [
        'domain' => $domain,
        'category' => bbpa_get_source_category_from_referrer($domain),
    ];
}

/**
 * Resolve the primary site domain for referrer checks.
 */
function bbpa_get_site_domain(): string
{
    $home_url = home_url();
    $parsed = wp_parse_url($home_url);

    return isset($parsed['host']) ? bbpa_lowercase($parsed['host']) : '';
}

/**
 * Resolve internal referrer domains.
 */
function bbpa_get_internal_referrer_domains(): array
{
    $domain = bbpa_get_site_domain();
    $domains = $domain !== '' ? [$domain] : [];

    $filtered = apply_filters('bbpa_internal_referrer_domains', $domains);
    if (!is_array($filtered)) {
        $filtered = $domains;
    }

    $normalized = [];
    foreach ($filtered as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }

        $candidate = trim($candidate);
        if ($candidate === '') {
            continue;
        }

        $candidate = bbpa_normalize_source_domain($candidate);
        if ($candidate === '') {
            continue;
        }

        $normalized[] = $candidate;
        $normalized[] = 'www.' . $candidate;
    }

    $normalized = array_values(array_unique($normalized));

    return $normalized;
}

/**
 * Determine whether a referrer domain belongs to the site.
 */
function bbpa_is_internal_referrer_domain(?string $referrer_domain): bool
{
    if (!$referrer_domain) {
        return false;
    }

    $referrer_domain = bbpa_normalize_source_domain($referrer_domain);
    if ($referrer_domain === '') {
        return false;
    }

    foreach (bbpa_get_internal_referrer_domains() as $domain) {
        if ($referrer_domain === $domain || str_ends_with($referrer_domain, '.' . $domain)) {
            return true;
        }
    }

    return false;
}

function bbpa_normalize_external_referrer_domain(?string $referrer_domain): string
{
    $domain = trim((string) $referrer_domain);
    if ($domain !== '' && str_contains($domain, '://')) {
        $host = wp_parse_url($domain, PHP_URL_HOST);
        $domain = is_string($host) ? $host : $domain;
    }
    $domain = bbpa_lowercase($domain);
    $domain = bbpa_trim_value($domain, BBPA_MAX_REFERRER_LENGTH);

    return bbpa_is_internal_referrer_domain($domain) ? '' : $domain;
}

function bbpa_remember_visit_attribution(array $hit, array $utm_params = []): void
{
    $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
    if ($visit_id === '') {
        return;
    }

    $referrer_domain = bbpa_normalize_external_referrer_domain($hit['referrer_domain'] ?? '');
    $source_category = isset($hit['source_category']) ? sanitize_text_field((string) $hit['source_category']) : '';
    if ($source_category === '') {
        $source_category = bbpa_get_source_category_from_tracking_context($referrer_domain, $utm_params);
    }

    set_transient('bbpa_visit_attr_' . md5($visit_id), [
        'referrer_domain' => $referrer_domain,
        'source_category' => $source_category,
        'utm_params' => array_filter($utm_params, 'is_scalar'),
    ], 2 * DAY_IN_SECONDS);
}

function bbpa_get_remembered_visit_attribution(string $visit_id): array
{
    $visit_id = sanitize_text_field($visit_id);
    if ($visit_id === '') {
        return [];
    }

    $attribution = get_transient('bbpa_visit_attr_' . md5($visit_id));
    return is_array($attribution) ? $attribution : [];
}

/**
 * Determine whether a hit qualifies as an entry.
 */
function bbpa_is_entry_hit(string $page_path, ?string $referrer_domain): bool
{
    $is_entry = !bbpa_is_internal_referrer_domain($referrer_domain);

    return (bool) apply_filters('bbpa_is_entry_hit', $is_entry, $page_path, $referrer_domain);
}

/**
 * Determine whether a hit qualifies as an exit.
 */
function bbpa_is_exit_hit(string $page_path, ?string $referrer_domain): bool
{
    $is_exit = !bbpa_is_internal_referrer_domain($referrer_domain);

    return (bool) apply_filters('bbpa_is_exit_hit', $is_exit, $page_path, $referrer_domain);
}

/**
 * Normalize a source-classification domain.
 */
function bbpa_normalize_source_domain(?string $domain): string
{
    $domain = bbpa_lowercase((string) $domain);

    return preg_replace('/^www\./', '', $domain) ?: '';
}

/**
 * Determine whether a normalized domain matches a known domain pattern.
 */
function bbpa_source_domain_matches(string $domain, array $patterns): bool
{
    foreach ($patterns as $pattern) {
        if ($domain === $pattern || str_ends_with($domain, '.' . $pattern) || str_contains($domain, $pattern)) {
            return true;
        }
    }

    return false;
}

/**
 * Return known social source and referrer domain patterns.
 */
function bbpa_get_social_source_patterns(): array
{
    return ['facebook', 'facebook.com', 'fb.com', 'meta.com', 'instagram', 'instagram.com', 'threads', 'threads.net', 'x.com', 'twitter', 'twitter.com', 'linkedin', 'linkedin.com', 'pinterest', 'pinterest.', 'reddit', 'reddit.com', 't.co', 'youtube', 'youtube.com', 'youtu.be', 'tiktok', 'tiktok.com', 'bsky.app', 'mastodon.social'];
}


/**
 * Return known exact UTM social source aliases.
 */
function bbpa_get_social_utm_source_aliases(): array
{
    return ['meta', 'fb', 'ig', 'facebook_ads', 'instagram_ads', 'meta_ads'];
}

/**
 * Determine whether a normalized UTM source is a known social source.
 */
function bbpa_is_social_utm_source(string $utm_source, array $social_patterns): bool
{
    if ($utm_source === '') {
        return false;
    }

    if (in_array($utm_source, bbpa_get_social_utm_source_aliases(), true)) {
        return true;
    }

    return bbpa_source_domain_matches($utm_source, $social_patterns);
}

/**
 * Return known AI assistant referrer domain patterns.
 */
function bbpa_get_ai_referrer_domains(): array
{
    $domains = ['chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'poe.com', 'you.com', 'phind.com', 'andisearch.com', 'mistral.ai', 'chat.mistral.ai'];

    $filtered = apply_filters('bbpa_ai_referrer_domains', $domains);
    if (!is_array($filtered)) {
        return $domains;
    }

    $normalized = [];
    foreach ($filtered as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }

        $candidate = bbpa_normalize_source_domain(trim($candidate));
        if ($candidate === '') {
            continue;
        }

        $normalized[] = $candidate;
    }

    $normalized = array_values(array_unique($normalized));

    return $normalized !== [] ? $normalized : $domains;
}


/**
 * Derive a source category from the captured referrer and campaign context.
 */
function bbpa_get_source_category_from_tracking_context(?string $referrer_domain, array $utm_params = []): string
{
    $domain = bbpa_normalize_source_domain($referrer_domain);
    $utm_medium = isset($utm_params['utm_medium']) ? bbpa_normalize_utm_value((string) $utm_params['utm_medium']) : '';
    $utm_source = isset($utm_params['utm_source']) ? bbpa_normalize_utm_value((string) $utm_params['utm_source']) : '';
    $utm_campaign = isset($utm_params['utm_campaign']) ? bbpa_normalize_utm_value((string) $utm_params['utm_campaign']) : '';

    if (in_array($utm_medium, ['email', 'mail', 'newsletter'], true)) {
        return 'Email';
    }

    $social_patterns = bbpa_get_social_source_patterns();
    $is_social_source = bbpa_is_social_utm_source($utm_source, $social_patterns);
    $is_paid_social_medium = in_array($utm_medium, ['paid_social', 'social_paid', 'paidsocial', 'paid-social'], true)
        || ($is_social_source && in_array($utm_medium, ['sponsored', 'ads', 'cpc', 'ppc', 'paid'], true));

    if ($is_paid_social_medium) {
        return 'Paid Social';
    }

    if (in_array($utm_medium, ['cpc', 'ppc', 'paidsearch', 'paid_search', 'sem'], true)) {
        return 'Paid Search';
    }

    foreach (['gclid', 'gbraid', 'wbraid', 'msclkid'] as $paid_click_id) {
        if (!empty($utm_params[$paid_click_id])) {
            return 'Paid Search';
        }
    }

    if (in_array($utm_medium, ['social'], true) || $is_social_source) {
        return 'Organic Social';
    }

    if ($utm_campaign !== '') {
        return 'Other Campaigns';
    }

    if ($domain === '') {
        return 'Direct';
    }

    $ai_domains = bbpa_get_ai_referrer_domains();
    if (bbpa_source_domain_matches($domain, $ai_domains)) {
        return 'AI Assistants';
    }

    $search_domains = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.', 'ecosia.org', 'qwant.com', 'startpage.com', 'baidu.com', 'yandex.', 'naver.com', 'seznam.cz'];
    if (bbpa_source_domain_matches($domain, $search_domains)) {
        return 'Organic Search';
    }

    if (bbpa_source_domain_matches($domain, $social_patterns)) {
        return 'Organic Social';
    }

    return 'Referrals';
}

/**
 * Derive a source category for a referrer domain.
 */
function bbpa_get_source_category_from_referrer(?string $referrer_domain): string
{
    return bbpa_get_source_category_from_tracking_context($referrer_domain);
}

/**
 * Increment entry/exit daily counters.
 */
function bbpa_increment_entry_exit_daily(
    string $date_bucket,
    string $page_path,
    int $entries,
    int $exits
): void {
    $entries = max(0, $entries);
    $exits = max(0, $exits);

    if ($entries === 0 && $exits === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_entry_exit_daily',
        ['date_bucket', 'page_path', 'entries', 'exits'],
        [$date_bucket, $page_path, $entries, $exits],
        ['entries', 'exits']
    );
}

/**
 * Increment entry/exit hourly counters.
 */
function bbpa_increment_entry_exit_hourly(
    string $date_bucket,
    string $page_path,
    int $entries,
    int $exits
): void {
    $entries = max(0, $entries);
    $exits = max(0, $exits);

    if ($entries === 0 && $exits === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_entry_exit_hourly',
        ['date_bucket', 'page_path', 'entries', 'exits'],
        [$date_bucket, $page_path, $entries, $exits],
        ['entries', 'exits']
    );
}

/**
 * Increment hits daily counter.
 */
function bbpa_increment_hits_daily(
    string $date_bucket,
    string $page_path,
    string $referrer_domain,
    string $source_category
): void {
    bbpa_tracking_upsert_counter(
        'bbpa_hits_daily',
        ['date_bucket', 'page_path', 'referrer_domain', 'source_category', 'hits'],
        [$date_bucket, $page_path, $referrer_domain, $source_category, 1],
        ['hits']
    );
}


/**
 * Increment the daily acquisition source-category counters.
 */
function bbpa_increment_daily_source_category(
    string $date_bucket,
    string $page_path,
    string $referrer_domain,
    string $source_category,
    int $hits,
    int $visits
): void {
    if ($hits === 0 && $visits === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_daily_source_category',
        ['date_bucket', 'page_path', 'referrer_domain', 'source_category', 'hits', 'visits'],
        [$date_bucket, $page_path, $referrer_domain, $source_category, max(0, $hits), max(0, $visits)],
        ['hits', 'visits']
    );
}

/**
 * Claim the acquisition visit increment for an identified visit once.
 */
function bbpa_claim_acquisition_visit_increment(array $hit, string $date_bucket): int
{
    $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
    $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';

    if ($visit_id === '' && $visitor_id === '') {
        return -1;
    }

    $identity = $visit_id !== '' ? 'visit:' . $visit_id : 'visitor-day:' . $date_bucket . ':' . $visitor_id;
    $marker_key = 'bbpa_acquisition_visit_' . md5($identity);

    if (wp_cache_get($marker_key, BBPA_CACHE_GROUP) || get_transient($marker_key)) {
        wp_cache_set($marker_key, true, BBPA_CACHE_GROUP, 2 * DAY_IN_SECONDS);
        return 0;
    }

    wp_cache_set($marker_key, true, BBPA_CACHE_GROUP, 2 * DAY_IN_SECONDS);
    set_transient($marker_key, true, 2 * DAY_IN_SECONDS);

    return 1;
}

/**
 * Increment 404 daily counter.
 */
function bbpa_increment_404s_daily(string $date_bucket, string $page_path): void
{
    bbpa_tracking_upsert_counter(
        'bbpa_404s_daily',
        ['date_bucket', 'page_path', 'hits'],
        [$date_bucket, $page_path, 1],
        ['hits']
    );
}

/**
 * Increment search term daily counter.
 */
function bbpa_increment_search_terms_daily(string $date_bucket, string $search_term): void
{
    bbpa_tracking_upsert_counter(
        'bbpa_search_terms_daily',
        ['date_bucket', 'search_term', 'hits'],
        [$date_bucket, $search_term, 1],
        ['hits']
    );
}

/**
 * Increment active duration total in the daily time aggregate table.
 */
function bbpa_increment_time_active_ms_total_daily(string $date_bucket, int $active_ms_delta): void
{
    $active_ms_delta = max(0, $active_ms_delta);
    if ($active_ms_delta === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_time_daily',
        ['date_bucket', 'active_ms_total', 'visits_with_time'],
        [$date_bucket, $active_ms_delta, 0],
        ['active_ms_total']
    );
}

/**
 * Increment valid visits with active duration in the daily time aggregate table.
 */
function bbpa_increment_time_visits_with_time_daily(string $date_bucket, int $visits = 1): void
{
    $visits = max(0, $visits);
    if ($visits === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_time_daily',
        ['date_bucket', 'active_ms_total', 'visits_with_time'],
        [$date_bucket, 0, $visits],
        ['visits_with_time']
    );
}


/**
 * Increment page-level active duration totals in the daily page-time aggregate table.
 */
function bbpa_increment_page_time_daily(string $date_bucket, string $page_path, int $active_ms_delta, int $visits = 1): void
{
    $active_ms_delta = max(0, $active_ms_delta);
    $visits = max(0, $visits);

    if ($active_ms_delta === 0 && $visits === 0) {
        return;
    }

    bbpa_tracking_upsert_counter(
        'bbpa_page_time_daily',
        ['date_bucket', 'page_path', 'active_ms_total', 'visits_with_time'],
        [$date_bucket, $page_path, $active_ms_delta, $visits],
        ['active_ms_total', 'visits_with_time']
    );

    $rows_written = (int) get_option('bbpa_page_time_daily_rows_written', 0);
    update_option('bbpa_page_time_daily_rows_written', $rows_written + 1, false);

    if (bbpa_is_debug_mode_enabled()) {
        bbpa_safe_log('Storage', 'debug', 'Page-time daily row upserted (forward-only)', [
            'date_bucket' => $date_bucket,
            'page_path' => $page_path,
            'rows_written_counter' => $rows_written + 1,
        ]);
    }
}

/**
 * Determine whether time-metric integrity debug checks are enabled.
 */
function bbpa_time_metrics_integrity_debug_enabled(): bool
{
    $enabled = bbpa_is_debug_mode_enabled();

    /**
     * Filter: toggle additional integrity diagnostics for time metrics.
     *
     * @param bool $enabled Current debug status.
     */
    return (bool) apply_filters('bbpa_time_metrics_integrity_debug', $enabled);
}


/**
 * Increment visits daily counter.
 */
function bbpa_increment_visits_daily(
    string $date_bucket,
    string $page_path,
    string $referrer_domain,
    string $device_class
): void {
    bbpa_tracking_upsert_counter(
        'bbpa_daily',
        ['date_bucket', 'page_path', 'referrer_domain', 'device_class', 'hits', 'visits'],
        [$date_bucket, $page_path, $referrer_domain, $device_class, 0, 1],
        ['visits']
    );
}
