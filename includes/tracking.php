<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

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

    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- Table from bbpa_resolve_sql_table(), columns validated above, values bound to placeholders.
    $prepared_sql = $wpdb->prepare($sql, ...$values);
    if ($prepared_sql === false) {
        bbpa_safe_log('Storage', 'error', 'Failed to prepare tracking UPSERT query', ['table_suffix' => $table_suffix]);
        return;
    }

    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- Prepared above.
    $wpdb->query($prepared_sql);

    if ($wpdb->last_error === '') {
        bbpa_flush_admin_cache_after_tracking_write();
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

    $timestamp = time();
    $date_bucket = wp_date('Y-m-d', $timestamp);

    if ((is_404() || is_search()) && bbpa_should_skip_server_request_tracking()) {
        return;
    }

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
    $dnt = isset($_SERVER['HTTP_DNT']) ? bbpa_request_get_string($_SERVER, 'HTTP_DNT') : null;
    $gpc = isset($_SERVER['HTTP_SEC_GPC']) ? bbpa_request_get_string($_SERVER, 'HTTP_SEC_GPC') : null;

    return bbpa_get_tracking_privacy_skip_reason($settings, $dnt, $gpc) !== '';
}

/**
 * Apply the role exclusion and Do Not Track / Global Privacy Control rules shared by every collection path.
 *
 * Used by server-side request tracking (headers read from `$_SERVER`) and by the `/hits` route (headers read
 * from the REST request), so both apply the same rules in the same order.
 *
 * @param array<string, mixed> $settings Plugin settings (`excluded_roles`, `respect_dnt_gpc`).
 * @param mixed                $dnt      `DNT` request header value, null when absent.
 * @param mixed                $gpc      `Sec-GPC` request header value, null when absent.
 * @return string `excluded_role`, `dnt_enabled`, `gpc_enabled`, or an empty string when tracking may proceed.
 */
function bbpa_get_tracking_privacy_skip_reason(array $settings, $dnt = null, $gpc = null): string
{
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
        if ($dnt !== null && (string) $dnt === '1') {
            return 'dnt_enabled';
        }

        if ($gpc !== null && (string) $gpc === '1') {
            return 'gpc_enabled';
        }
    }

    return '';
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

    // Unlike the /hits route, server-side tracking lowercases the path, truncates it and always applies the
    // query allowlist. Both keep their rule so that stored page paths do not change.
    $sanitized_args = bbpa_filter_tracking_query_args_by_allowlist(
        bbpa_sanitize_tracking_query_args($query_args),
        $settings['url_query_allowlist'] ?? []
    );

    if ($sanitized_args === []) {
        return bbpa_trim_value($path, BBPA_MAX_PATH_LENGTH);
    }

    $query_string = http_build_query($sanitized_args, '', '&', PHP_QUERY_RFC3986);
    $full_path = $query_string !== '' ? $path . '?' . $query_string : $path;

    return bbpa_trim_value($full_path, BBPA_MAX_PATH_LENGTH);
}

/**
 * Sanitize parsed query arguments of a tracked URL.
 *
 * Keys go through sanitize_key() (empty keys are dropped), the first item of an array value is kept and values go
 * through sanitize_text_field().
 *
 * @param array<mixed, mixed> $query_args Arguments parsed by wp_parse_str().
 * @return array<string, string>
 */
function bbpa_sanitize_tracking_query_args(array $query_args): array
{
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

    return $sanitized_args;
}

/**
 * Keep only the query arguments listed in the URL query allowlist.
 *
 * @param array<string, string> $sanitized_args Arguments from bbpa_sanitize_tracking_query_args().
 * @param mixed                 $allowlist      The `url_query_allowlist` setting; an empty value keeps no argument.
 * @return array<string, string>
 */
function bbpa_filter_tracking_query_args_by_allowlist(array $sanitized_args, $allowlist): array
{
    if (!$allowlist) {
        return [];
    }

    return array_intersect_key($sanitized_args, array_fill_keys($allowlist, true));
}

/**
 * Check excluded paths list.
 *
 * Matches an entry of the `excluded_paths` setting exactly, either the whole path (with its query string) or the
 * path without its query string. `$path` must already be normalized like the setting (lowercase path, one leading
 * slash, no trailing slash), as bbpa_get_request_path() returns it; see bbpa_is_excluded_tracking_path() otherwise.
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
 * Check a page path that keeps its original case against the `excluded_paths` setting.
 *
 * Used by the `/hits` route, whose stored page paths keep the case sent by the browser
 * (`BBPA_Hit_Controller::clean_page_path()`). The setting stores lowercased paths with one leading slash and no
 * trailing slash (bbpa_normalize_path_value()), so the path part is normalized the same way before the shared
 * exact-match rule of bbpa_is_excluded_path() runs: `/Contact/` and `/Contact?utm_source=x` match `/contact`.
 * The query string is compared as sent, like server-side request tracking does. There is no prefix or wildcard
 * matching. Server-side request tracking calls bbpa_is_excluded_path() directly, because bbpa_get_request_path()
 * already returns a normalized path.
 *
 * @param string               $path     Page path, optionally followed by a query string.
 * @param array<string, mixed> $settings Plugin settings (`excluded_paths`).
 */
function bbpa_is_excluded_tracking_path(string $path, array $settings): bool
{
    if (empty($settings['excluded_paths'])) {
        return false;
    }

    $query_position = strpos($path, '?');
    $base_path = $query_position === false ? $path : substr($path, 0, $query_position);
    $query = $query_position === false ? '' : substr($path, $query_position);

    $base_path = bbpa_normalize_path_value($base_path);
    if ($base_path === '') {
        return false;
    }

    return bbpa_is_excluded_path($base_path . $query, $settings);
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

    $host = bbpa_extract_referrer_host($referrer);
    if ($host === '') {
        return [
            'domain' => '',
            'category' => 'Unknown',
        ];
    }

    $domain = sanitize_text_field(bbpa_lowercase($host));
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
 * Extract the host of a referrer URL or of a scheme-less referrer value.
 *
 * Shared by server-side request tracking and the /hits route. The host is returned as parsed: each caller keeps
 * its own lowercasing, sanitization and length rules.
 *
 * @return string The host, or an empty string when the value is empty or has no usable host.
 */
function bbpa_extract_referrer_host(string $referrer): string
{
    $candidate = trim($referrer);
    if ($candidate === '') {
        return '';
    }

    if (!str_contains($candidate, '://')) {
        $candidate = 'https://' . $candidate;
    }

    $parsed = wp_parse_url($candidate);
    if (!is_array($parsed) || empty($parsed['host'])) {
        return '';
    }

    return (string) $parsed['host'];
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

    $transient_key = 'bbpa_visit_attr_' . md5($visit_id);
    $remembered_attribution = get_transient($transient_key);
    if (is_array($remembered_attribution)) {
        $remembered_source_category = sanitize_text_field((string) ($remembered_attribution['source_category'] ?? ''));

        // Visit attribution is first-touch. Direct is only the absence of a new
        // acquisition signal, so it may be upgraded but cannot replace (or be
        // used to replace) an acquisition already identified for this visit.
        // The remembered value is kept as is: rewriting an unchanged transient on every page view cost two options
        // writes per hit. Its two-day lifetime already exceeds the longest visit window (one day).
        if ($remembered_source_category !== '' && $remembered_source_category !== 'Direct') {
            return;
        }

        if ($remembered_source_category === 'Direct' && $source_category === 'Direct') {
            return;
        }
    }

    set_transient($transient_key, [
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
 * Resolve the referrer domain used to classify a stored hit as an entry.
 *
 * Hit ingestion rewrites internal referrers to an empty string so acquisition
 * reports classify internal navigation as Direct, and the essential scope scrubs
 * referrers entirely. Both rewrites would turn every internal navigation into an
 * entry, so ingestion keeps the internal referrer host (the site's own domain,
 * never an external domain) in `internal_referrer_domain` for this purpose only.
 * Hits stored by older versions do not carry that key and keep the previous
 * classification.
 */
function bbpa_get_entry_referrer_domain(array $hit): string
{
    $referrer_domain = isset($hit['referrer_domain']) && is_scalar($hit['referrer_domain'])
        ? trim((string) $hit['referrer_domain'])
        : '';
    if ($referrer_domain !== '') {
        return $referrer_domain;
    }

    $internal_referrer_domain = isset($hit['internal_referrer_domain']) && is_scalar($hit['internal_referrer_domain'])
        ? trim((string) $hit['internal_referrer_domain'])
        : '';
    if ($internal_referrer_domain === '' || !bbpa_is_internal_referrer_domain($internal_referrer_domain)) {
        return '';
    }

    return $internal_referrer_domain;
}

/**
 * Determine whether a User-Agent belongs to a crawler, a headless browser or an automated client.
 *
 * The match is applied to every hit, even when the tracker already sent a device class,
 * because crawlers that execute JavaScript (Googlebot rendering, SEO audit tools, headless
 * monitoring probes) otherwise report a desktop or mobile viewport. The `bot` token is only
 * matched when it is not followed by a letter and not preceded by `cu`, so phone models such
 * as "CUBOT" keep their device class.
 */
function bbpa_is_bot_user_agent(string $user_agent): bool
{
    $user_agent = trim($user_agent);
    $is_bot = false;

    if ($user_agent !== '') {
        $is_bot = preg_match(
            '/(?<!cu)bot(?![a-z])|crawl|spider|slurp|bingpreview|headless|lighthouse|phantomjs|facebookexternalhit|inspectiontool|mediapartners-google|gtmetrix|pingdom|ptst\/|python-requests|python-urllib|curl\/|wget\/|go-http-client|libwww-perl|scrapy|node-fetch|axios\/|okhttp|apache-httpclient/i',
            $user_agent
        ) === 1;
    }

    /**
     * Filter whether a /hits request User-Agent is classified as a bot.
     *
     * Bot hits are stored with `device_class = 'bot'` and stay out of human page-view,
     * visit and visitor aggregates.
     *
     * @param bool   $is_bot     Whether the built-in patterns matched.
     * @param string $user_agent Request User-Agent.
     */
    return (bool) apply_filters('bbpa_is_bot_user_agent', $is_bot, $user_agent);
}

/**
 * Name of the robot family of a crawler User-Agent (for example "Googlebot" or "GPTBot"), or an empty
 * string when the robot is not identified.
 *
 * Only this coarse name is stored, on the visitor row of the robot (`browser` column, robot rows only):
 * the User-Agent itself is never kept.
 */
function bbpa_get_bot_family(string $user_agent): string
{
    $families = [
        'Googlebot' => 'googlebot|google-inspectiontool|googleother|adsbot-google|mediapartners-google|apis-google|google-extended',
        'Bingbot' => 'bingbot|bingpreview|msnbot|adidxbot',
        'GPTBot' => 'gptbot',
        'ChatGPT-User' => 'chatgpt-user',
        'OAI-SearchBot' => 'oai-searchbot',
        'ClaudeBot' => 'claudebot|claude-web|claude-user|claude-searchbot|anthropic-ai',
        'PerplexityBot' => 'perplexitybot|perplexity-user',
        'CCBot' => 'ccbot',
        'Bytespider' => 'bytespider',
        'Amazonbot' => 'amazonbot',
        'Applebot' => 'applebot',
        'YandexBot' => 'yandex(?:bot|images|metrika|accessibilitybot)',
        'Baiduspider' => 'baiduspider',
        'DuckDuckBot' => 'duckduckbot|duckassistbot',
        'Qwantbot' => 'qwantbot|qwantify',
        'PetalBot' => 'petalbot',
        'SeznamBot' => 'seznambot',
        'AhrefsBot' => 'ahrefsbot|ahrefssiteaudit',
        'SemrushBot' => 'semrushbot|siteauditbot',
        'MJ12bot' => 'mj12bot',
        'DotBot' => 'dotbot',
        'DataForSeoBot' => 'dataforseobot',
        'Screaming Frog' => 'screaming frog',
        'Meta' => 'facebookexternalhit|meta-externalagent|meta-externalfetcher|facebookbot',
        'Twitterbot' => 'twitterbot',
        'LinkedInBot' => 'linkedinbot',
        'Slackbot' => 'slackbot|slack-imgproxy',
        'Discordbot' => 'discordbot',
        'TelegramBot' => 'telegrambot',
        'WhatsApp' => 'whatsapp',
        'Pinterestbot' => 'pinterestbot',
        'Lighthouse' => 'lighthouse',
        'GTmetrix' => 'gtmetrix',
        'Pingdom' => 'pingdom',
        'UptimeRobot' => 'uptimerobot',
        'HeadlessChrome' => 'headlesschrome|headless',
        'PhantomJS' => 'phantomjs',
        'Python' => 'python-requests|python-urllib|aiohttp|httpx',
        'Scrapy' => 'scrapy',
        'curl' => 'curl\/',
        'Wget' => 'wget\/',
        'Go HTTP client' => 'go-http-client',
        'Node.js' => 'node-fetch|axios\/|undici',
        'OkHttp' => 'okhttp',
        'Apache HttpClient' => 'apache-httpclient',
        'WordPress' => 'wordpress\/',
    ];

    $family = '';
    $user_agent = trim($user_agent);
    if ($user_agent !== '') {
        foreach ($families as $name => $pattern) {
            if (preg_match('/' . $pattern . '/i', $user_agent) === 1) {
                $family = $name;
                break;
            }
        }
    }

    /**
     * Filter the robot family name stored for a crawler User-Agent.
     *
     * @param string $family     Name found by the built-in list, or an empty string.
     * @param string $user_agent Request User-Agent (never stored).
     */
    $family = apply_filters('bbpa_bot_family', $family, $user_agent);

    return is_string($family) ? substr(sanitize_text_field($family), 0, 64) : '';
}

/**
 * Classify a User-Agent as `bot`, `tablet`, `mobile` or `desktop` (`unknown` when it is empty).
 *
 * Used when a hit or an event signal carries no valid device class. The /hits route recognizes crawlers with
 * bbpa_is_bot_user_agent() (signature list and `bbpa_is_bot_user_agent` filter). Event signals pass
 * `$use_bot_signatures = false` to keep their shorter built-in crawler pattern, so the device classes they store
 * do not change.
 */
function bbpa_detect_device_class_from_user_agent(string $user_agent, bool $use_bot_signatures = true): string
{
    $normalized_user_agent = strtolower($user_agent);
    if ($normalized_user_agent === '') {
        return 'unknown';
    }

    $is_bot = $use_bot_signatures
        ? bbpa_is_bot_user_agent($user_agent)
        : preg_match('/bot|crawl|spider|slurp|bingpreview|headless/i', $normalized_user_agent) === 1;
    if ($is_bot) {
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
 * Count one request against a fixed-window rate limit and report whether it is over the limit.
 *
 * The window is aligned on `floor(time() / $window_seconds)`: the counter starts at the first request of a window
 * and resets when the next window starts, whatever the traffic (a sliding expiry would never reset under a steady
 * flow). With a persistent object cache the counter is an atomic `wp_cache_incr()`; otherwise it is stored in the
 * `bbpa_rate_limit_{md5(fingerprint)}` transient together with its window number.
 *
 * @param string $fingerprint    Client key (IP, network, ...). Never logged.
 * @param int    $window_seconds Window length.
 * @param int    $max_requests   Requests allowed per window.
 * @param string $scope          Short label used in the debug log.
 * @return bool True when the request exceeds the limit.
 */
function bbpa_rate_limit_exceeded(string $fingerprint, int $window_seconds, int $max_requests, string $scope = 'hits'): bool
{
    $window_seconds = max(1, $window_seconds);
    $max_requests = max(1, $max_requests);
    $window_index = (int) floor(time() / $window_seconds);
    $cache_key = 'bbpa_rate_limit_' . md5($fingerprint);
    $limited = false;
    $first_block = false;

    if (wp_using_ext_object_cache()) {
        $window_key = $cache_key . '_' . $window_index;
        wp_cache_add($window_key, 0, 'bbpa_rate_limit', $window_seconds);
        $count = wp_cache_incr($window_key, 1, 'bbpa_rate_limit');
        if ($count !== false) {
            $limited = (int) $count > $max_requests;
            $first_block = (int) $count === $max_requests + 1;
        }
    } else {
        $state = get_transient($cache_key);
        if (!is_array($state) || (int) ($state['window'] ?? -1) !== $window_index) {
            $state = ['window' => $window_index, 'count' => 0];
        }

        $count = (int) ($state['count'] ?? 0);
        if ($count >= $max_requests) {
            $limited = true;
            if (empty($state['logged'])) {
                $first_block = true;
                $state['logged'] = 1;
                set_transient($cache_key, $state, $window_seconds);
            }
        } else {
            $state['count'] = $count + 1;
            set_transient($cache_key, $state, $window_seconds);
        }
    }

    if ($first_block && function_exists('bbpa_safe_log')) {
        bbpa_safe_log('Ingestion', 'warning', 'Request rate limit reached; further requests are skipped until the window ends.', [
            'scope' => $scope,
            'window_seconds' => $window_seconds,
            'max_requests' => $max_requests,
        ]);
    }

    return $limited;
}

/**
 * Build the rate-limit fingerprint of a client IP.
 *
 * IPv6 clients are keyed by their /64 network (one subscriber), so rotating addresses inside it does not grant
 * fresh counters.
 */
function bbpa_get_rate_limit_ip_fingerprint(string $ip): string
{
    if ($ip === '' || strpos($ip, ':') === false) {
        return $ip;
    }

    $packed = @inet_pton($ip); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Invalid input returns false.
    if ($packed === false || strlen($packed) !== 16) {
        return $ip;
    }

    $network = inet_ntop(substr($packed, 0, 8) . str_repeat("\0", 8));

    return is_string($network) ? $network . '/64' : $ip;
}

/**
 * Whether server-side 404 and search tracking should skip the current request.
 *
 * Crawlers and vulnerability scanners request many missing URLs and random searches. Requests with a bot or empty
 * User-Agent are not recorded, and each client may record at most `bbpa_server_tracking_rate_limit_max_requests`
 * 404/search rows per minute (default 30).
 */
function bbpa_should_skip_server_request_tracking(): bool
{
    $user_agent = bbpa_request_get_string($_SERVER, 'HTTP_USER_AGENT');
    $is_bot = trim($user_agent) === '' || bbpa_is_bot_user_agent($user_agent);

    /**
     * Filter whether a bot request is excluded from the server-side 404 and search reports.
     *
     * @param bool   $skip       Default true for bot or empty User-Agents.
     * @param string $user_agent Request User-Agent.
     */
    if ((bool) apply_filters('bbpa_skip_bot_server_request_tracking', $is_bot, $user_agent)) {
        return true;
    }

    $max_requests = (int) apply_filters('bbpa_server_tracking_rate_limit_max_requests', 30);
    if ($max_requests <= 0) {
        return false;
    }

    $ip = function_exists('bbpa_get_client_ip') ? bbpa_get_client_ip() : '';
    $fingerprint = 'server|' . ($ip !== '' ? bbpa_get_rate_limit_ip_fingerprint($ip) : $user_agent);

    return bbpa_rate_limit_exceeded($fingerprint, MINUTE_IN_SECONDS, $max_requests, 'server_tracking');
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

    // The `bbpa_page_time_daily_rows_written` diagnostic counter is only maintained in debug mode: it is read by
    // nothing else and cost one options read and write per active-time ping.
    if (bbpa_is_debug_mode_enabled()) {
        $rows_written = (int) get_option('bbpa_page_time_daily_rows_written', 0);
        update_option('bbpa_page_time_daily_rows_written', $rows_written + 1, false);

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
