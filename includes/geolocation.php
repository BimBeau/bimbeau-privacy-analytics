<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Server-side geolocation helpers.
 */

const BBPA_GEOIP_UPDATE_CRON_HOOK = 'bbpa_monthly_geoip_update';
const BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK = 'bbpa_geoip_retry_update';
const BBPA_GEOIP_RETRY_STATE_OPTION = 'bbpa_geoip_update_retry_state';
const BBPA_GEOIP_RETRY_LOCK_TRANSIENT = 'bbpa_geoip_update_retry_lock';
const BBPA_MAXMIND_API_CIRCUIT_TRANSIENT = 'bbpa_geo_api_circuit';
const BBPA_MAXMIND_API_RATE_TRANSIENT = 'bbpa_geo_api_rate';
const BBPA_MAXMIND_API_LOOKUP_TIMEOUT = 3;

/**
 * Return the available GeoIP update frequencies.
 */
function bbpa_get_geoip_update_frequency_options(): array
{
    return [
        'disabled' => [
            'schedule' => '',
            'interval' => 0,
        ],
        '15_days' => [
            'schedule' => 'bbpa_geoip_15_days',
            'interval' => 15 * DAY_IN_SECONDS,
        ],
        '30_days' => [
            'schedule' => 'monthly',
            'interval' => 30 * DAY_IN_SECONDS,
        ],
        '45_days' => [
            'schedule' => 'bbpa_geoip_45_days',
            'interval' => 45 * DAY_IN_SECONDS,
        ],
        '60_days' => [
            'schedule' => 'bbpa_geoip_60_days',
            'interval' => 60 * DAY_IN_SECONDS,
        ],
        '3_months' => [
            'schedule' => 'bbpa_geoip_3_months',
            'interval' => 90 * DAY_IN_SECONDS,
        ],
        '6_months' => [
            'schedule' => 'bbpa_geoip_6_months',
            'interval' => 180 * DAY_IN_SECONDS,
        ],
        '1_year' => [
            'schedule' => 'bbpa_geoip_1_year',
            'interval' => 365 * DAY_IN_SECONDS,
        ],
        '2_years' => [
            'schedule' => 'bbpa_geoip_2_years',
            'interval' => 730 * DAY_IN_SECONDS,
        ],
    ];
}

/**
 * Return the configured GeoIP update frequency.
 */
function bbpa_get_geoip_update_frequency(): string
{
    $settings = bbpa_get_settings();
    $frequency = isset($settings['geoip_update_frequency'])
        ? sanitize_key((string) $settings['geoip_update_frequency'])
        : 'disabled';
    $options = bbpa_get_geoip_update_frequency_options();

    return isset($options[$frequency]) ? $frequency : 'disabled';
}

/**
 * Register available GeoIP update schedules.
 */
function bbpa_register_geoip_update_cron_schedule(array $schedules): array
{
    // The generic "monthly" name is kept for already scheduled events, but a
    // definition provided by WordPress core or another plugin is never overridden.
    if (!isset($schedules['monthly'])) {
        $schedules['monthly'] = [
            'interval' => 30 * DAY_IN_SECONDS,
            'display' => __('Once Monthly', 'bimbeau-privacy-analytics'),
        ];
    }
    $schedules['bbpa_geoip_15_days'] = [
        'interval' => 15 * DAY_IN_SECONDS,
        'display' => __('Every 15 days', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_45_days'] = [
        'interval' => 45 * DAY_IN_SECONDS,
        'display' => __('Every 45 days', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_60_days'] = [
        'interval' => 60 * DAY_IN_SECONDS,
        'display' => __('Every 60 days', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_3_months'] = [
        'interval' => 90 * DAY_IN_SECONDS,
        'display' => __('Every 3 months', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_6_months'] = [
        'interval' => 180 * DAY_IN_SECONDS,
        'display' => __('Every 6 months', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_1_year'] = [
        'interval' => 365 * DAY_IN_SECONDS,
        'display' => __('Every year', 'bimbeau-privacy-analytics'),
    ];
    $schedules['bbpa_geoip_2_years'] = [
        'interval' => 730 * DAY_IN_SECONDS,
        'display' => __('Every 2 years', 'bimbeau-privacy-analytics'),
    ];

    return $schedules;
}


/**
 * Clear every GeoIP database update hook, including legacy one-time hooks.
 *
 * This runs on every request while updates are disabled (the default), so it
 * only touches the database when a GeoIP event was actually scheduled: the
 * retry state and the update lock can only be pending while an event exists.
 */
function bbpa_clear_geoip_update_schedule(): void
{
    $hooks = [
        BBPA_GEOIP_UPDATE_CRON_HOOK,
        BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK,
        'bbpa_geoip_initial_update',
        'bpa_monthly_geoip_update',
        'bpa_geoip_retry_update',
        'bpa_geoip_initial_update',
    ];

    $had_scheduled_event = false;
    foreach ($hooks as $hook) {
        if (wp_next_scheduled($hook) === false) {
            continue;
        }

        $had_scheduled_event = true;
        wp_clear_scheduled_hook($hook);
    }

    if (!$had_scheduled_event) {
        return;
    }

    bbpa_geoip_reset_retry_state();
    delete_transient(BBPA_GEOIP_RETRY_LOCK_TRANSIENT);
}

/**
 * Ensure the GeoIP update schedule matches current settings.
 */
function bbpa_ensure_geoip_update_schedule(): void
{
    bbpa_schedule_geoip_update(false);
}

/**
 * Schedule GeoIP updates according to configured frequency.
 */
function bbpa_schedule_geoip_update(bool $force = false): void
{
    $options = bbpa_get_geoip_update_frequency_options();
    $frequency = bbpa_get_geoip_update_frequency();
    $selected = $options[$frequency] ?? $options['disabled'];
    $interval = (int) ($selected['interval'] ?? 0);
    $schedule = isset($selected['schedule']) ? (string) $selected['schedule'] : '';

    if ($schedule === '' || $interval <= 0) {
        bbpa_clear_geoip_update_schedule();

        return;
    }

    $scheduled_event = wp_get_scheduled_event(BBPA_GEOIP_UPDATE_CRON_HOOK);
    $needs_reschedule = $force || !$scheduled_event || $scheduled_event->schedule !== $schedule;

    if ($needs_reschedule) {
        wp_clear_scheduled_hook(BBPA_GEOIP_UPDATE_CRON_HOOK);
        wp_schedule_event(time() + $interval, $schedule, BBPA_GEOIP_UPDATE_CRON_HOOK);
    }
}

/**
 * Run the scheduled GeoIP database update.
 */
function bbpa_run_monthly_geoip_update(): void
{
    if (bbpa_get_geoip_update_frequency() === 'disabled') {
        bbpa_clear_geoip_update_schedule();

        return;
    }

    if (!bbpa_geoip_acquire_update_lock()) {
        return;
    }

    $updater = bbpa_get_geoip_database_updater();
    try {
        $result = $updater->update_database();
    } finally {
        bbpa_geoip_release_update_lock();
    }

    if (is_wp_error($result)) {
        bbpa_geoip_schedule_retry();

        return;
    }

    bbpa_geoip_reset_retry_state();
}

/**
 * Return the next scheduled GeoIP database update timestamp.
 */
function bbpa_get_geoip_next_scheduled_run(): int
{
    $next_monthly = wp_next_scheduled(BBPA_GEOIP_UPDATE_CRON_HOOK);
    $next_retry = wp_next_scheduled(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);

    $scheduled = array_filter(
        [
            $next_monthly ? (int) $next_monthly : 0,
            $next_retry ? (int) $next_retry : 0,
        ],
        static function (int $timestamp): bool {
            return $timestamp > 0;
        }
    );

    if (empty($scheduled)) {
        return 0;
    }

    return (int) min($scheduled);
}

/**
 * Schedule a retry attempt for failed GeoIP updates using backoff delays.
 */
function bbpa_geoip_schedule_retry(): void
{
    if (bbpa_get_geoip_update_frequency() === 'disabled') {
        bbpa_clear_geoip_update_schedule();

        return;
    }

    $state = get_option(BBPA_GEOIP_RETRY_STATE_OPTION, []);
    if (!is_array($state)) {
        $state = [];
    }

    $current_level = isset($state['level']) ? max(0, (int) $state['level']) : 0;
    $delays = [
        15 * MINUTE_IN_SECONDS,
        HOUR_IN_SECONDS,
        6 * HOUR_IN_SECONDS,
    ];

    if (!isset($delays[$current_level])) {
        $next_state = [
            'level' => 0,
            'next_retry_at' => 0,
            'updated_at' => time(),
        ];
        update_option(BBPA_GEOIP_RETRY_STATE_OPTION, $next_state, false);
        wp_clear_scheduled_hook(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);

        return;
    }

    $retry_at = time() + (int) $delays[$current_level];
    $existing_retry = wp_next_scheduled(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);
    if (!$existing_retry || (int) $existing_retry > $retry_at) {
        wp_schedule_single_event($retry_at, BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);
    }

    $next_state = [
        'level' => $current_level + 1,
        'next_retry_at' => $retry_at,
        'updated_at' => time(),
    ];
    update_option(BBPA_GEOIP_RETRY_STATE_OPTION, $next_state, false);
}

/**
 * Clear the GeoIP retry state after a successful update.
 */
function bbpa_geoip_reset_retry_state(): void
{
    wp_clear_scheduled_hook(BBPA_GEOIP_RETRY_UPDATE_CRON_HOOK);

    $state = get_option(BBPA_GEOIP_RETRY_STATE_OPTION, null);
    if (
        is_array($state)
        && (int) ($state['level'] ?? 0) === 0
        && (int) ($state['next_retry_at'] ?? 0) === 0
    ) {
        // Already neutral: do not rewrite the option only to refresh its timestamp.
        return;
    }

    update_option(
        BBPA_GEOIP_RETRY_STATE_OPTION,
        [
            'level' => 0,
            'next_retry_at' => 0,
            'updated_at' => time(),
        ],
        false
    );
}

/**
 * Acquire a short lock to avoid concurrent update retries.
 */
function bbpa_geoip_acquire_update_lock(): bool
{
    if (get_transient(BBPA_GEOIP_RETRY_LOCK_TRANSIENT) !== false) {
        return false;
    }

    return set_transient(BBPA_GEOIP_RETRY_LOCK_TRANSIENT, 1, 5 * MINUTE_IN_SECONDS);
}

/**
 * Release the GeoIP update retry lock.
 */
function bbpa_geoip_release_update_lock(): void
{
    delete_transient(BBPA_GEOIP_RETRY_LOCK_TRANSIENT);
}

/**
 * Resolve the GeoIP updater service instance.
 */
function bbpa_get_geoip_database_updater(): BBPA_GeoIP_Database_Updater
{
    $updater = apply_filters('bbpa_geoip_database_updater', new BBPA_GeoIP_Database_Updater());

    return $updater instanceof BBPA_GeoIP_Database_Updater
        ? $updater
        : new BBPA_GeoIP_Database_Updater();
}

/**
 * Determine the client IP address from the request.
 *
 * Default mode (unchanged trust order): the proxy headers of `bbpa_client_ip_header_order`
 * (CF-Connecting-IP, X-Forwarded-For, X-Real-IP) are read before REMOTE_ADDR and the first public address wins, so
 * sites behind Cloudflare or a reverse proxy keep working without configuration. Header values are bounded and
 * normalized (port, brackets, IPv4-mapped IPv6, canonical IPv6 notation).
 *
 * Strict mode (opt-in, filter `bbpa_client_ip_strict_proxy_mode`): proxy headers are honored only when REMOTE_ADDR
 * is a loopback/private address or matches `bbpa_trusted_proxies`; X-Forwarded-For is then read from right to left
 * and the first address that is not a trusted proxy is used. Otherwise REMOTE_ADDR is used.
 */
function bbpa_get_client_ip(): string
{
    $candidates = apply_filters('bbpa_client_ip_header_order', [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'REMOTE_ADDR',
    ]);
    if (!is_array($candidates) || empty($candidates)) {
        $candidates = ['REMOTE_ADDR'];
    }

    $allow_private_fallback = (bool) apply_filters('bbpa_allow_private_client_ip_fallback', true);

    if (bbpa_client_ip_strict_proxy_mode()) {
        $ip = bbpa_get_client_ip_strict($candidates);

        return ($ip !== '' && ($allow_private_fallback || bbpa_is_public_ip($ip))) ? $ip : '';
    }

    $fallback_ip = '';

    foreach ($candidates as $key) {
        if (!is_string($key) || $key === '') {
            continue;
        }

        foreach (bbpa_get_client_ip_header_addresses($key) as $ip) {
            if (bbpa_is_public_ip($ip)) {
                return $ip;
            }

            if ($fallback_ip === '') {
                $fallback_ip = $ip;
            }
        }
    }

    if (!$allow_private_fallback) {
        return '';
    }

    return $fallback_ip;
}

/**
 * Whether the opt-in strict proxy mode is enabled.
 */
function bbpa_client_ip_strict_proxy_mode(): bool
{
    /**
     * Filter whether proxy headers are honored only from trusted proxies.
     *
     * @param bool $strict Default false (proxy headers are read from any client, as in previous versions).
     */
    return (bool) apply_filters('bbpa_client_ip_strict_proxy_mode', false);
}

/**
 * Resolve the client IP in strict proxy mode.
 *
 * @param array<int, mixed> $candidates Server keys in trust order.
 */
function bbpa_get_client_ip_strict(array $candidates): string
{
    $remote_addresses = bbpa_get_client_ip_header_addresses('REMOTE_ADDR');
    $remote_addr = $remote_addresses[0] ?? '';
    if ($remote_addr === '' || !bbpa_is_trusted_proxy_ip($remote_addr)) {
        return $remote_addr;
    }

    foreach ($candidates as $key) {
        if (!is_string($key) || $key === '' || $key === 'REMOTE_ADDR') {
            continue;
        }

        $addresses = bbpa_get_client_ip_header_addresses($key);
        if ($addresses === []) {
            continue;
        }

        // The right-most entries were appended by the proxies closest to the server.
        foreach (array_reverse($addresses) as $ip) {
            if (!bbpa_is_trusted_proxy_ip($ip)) {
                return $ip;
            }
        }

        return $addresses[0];
    }

    return $remote_addr;
}

/**
 * Whether an address belongs to a trusted proxy (strict mode).
 *
 * Loopback and private addresses (a reverse proxy on the same host or network) are trusted, plus every IP or CIDR
 * range returned by the `bbpa_trusted_proxies` filter (for example the published Cloudflare ranges).
 */
function bbpa_is_trusted_proxy_ip(string $ip): bool
{
    if ($ip === '') {
        return false;
    }

    if (!bbpa_is_public_ip($ip)) {
        return true;
    }

    /**
     * Filter the trusted proxy addresses used by the strict proxy mode.
     *
     * @param array<int, string> $proxies IP addresses or CIDR ranges (IPv4 or IPv6). Default empty.
     */
    $proxies = apply_filters('bbpa_trusted_proxies', []);
    if (!is_array($proxies)) {
        return false;
    }

    foreach ($proxies as $proxy) {
        if (is_string($proxy) && bbpa_ip_matches_range($ip, trim($proxy))) {
            return true;
        }
    }

    return false;
}

/**
 * Check whether an IP matches an address or a CIDR range of the same family.
 */
function bbpa_ip_matches_range(string $ip, string $range): bool
{
    if ($range === '') {
        return false;
    }

    $prefix_length = null;
    if (strpos($range, '/') !== false) {
        [$range, $prefix] = explode('/', $range, 2);
        if (!preg_match('/^\d{1,3}$/', $prefix)) {
            return false;
        }
        $prefix_length = (int) $prefix;
    }

    $ip_binary = @inet_pton($ip); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Invalid input returns false.
    $range_binary = @inet_pton($range); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Invalid input returns false.
    if ($ip_binary === false || $range_binary === false || strlen($ip_binary) !== strlen($range_binary)) {
        return false;
    }

    $total_bits = strlen($ip_binary) * 8;
    $prefix_length = $prefix_length === null ? $total_bits : $prefix_length;
    if ($prefix_length > $total_bits) {
        return false;
    }

    $full_bytes = intdiv($prefix_length, 8);
    if (substr($ip_binary, 0, $full_bytes) !== substr($range_binary, 0, $full_bytes)) {
        return false;
    }

    $remaining_bits = $prefix_length % 8;
    if ($remaining_bits === 0) {
        return true;
    }

    $mask = (0xFF << (8 - $remaining_bits)) & 0xFF;

    return (ord($ip_binary[$full_bytes]) & $mask) === (ord($range_binary[$full_bytes]) & $mask);
}

/**
 * Read the valid, normalized IP addresses of one server variable, in header order.
 *
 * Header values are bounded (1024 bytes, 20 entries) so an oversized forged header costs nothing.
 *
 * @return array<int, string>
 */
function bbpa_get_client_ip_header_addresses(string $key): array
{
    if (empty($_SERVER[$key]) || !is_string($_SERVER[$key])) {
        return [];
    }

    $value = substr(sanitize_text_field(wp_unslash($_SERVER[$key])), 0, 1024);
    $parts = $key === 'HTTP_X_FORWARDED_FOR' ? array_slice(explode(',', $value), 0, 20) : [$value];

    $addresses = [];
    foreach ($parts as $part) {
        $ip = bbpa_extract_ip_from_header_value((string) $part);
        if ($ip !== '') {
            $addresses[] = $ip;
        }
    }

    return $addresses;
}

/**
 * Check whether an IP address is publicly routable.
 */
function bbpa_is_public_ip(string $ip): bool
{
    if ($ip === '') {
        return false;
    }

    return filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) !== false;
}

/**
 * Extract an IP from a proxy or direct address header value.
 */
function bbpa_extract_ip_from_header_value(string $value): string
{
    $candidate = trim($value);
    if ($candidate === '' || strtolower($candidate) === 'unknown') {
        return '';
    }

    if (preg_match('/^\[(.+)\](?::\d+)?$/', $candidate, $matches)) {
        $candidate = $matches[1];
    } elseif (
        substr_count($candidate, ':') === 1
        && preg_match('/^(.+):(\d+)$/', $candidate, $matches)
    ) {
        $candidate = $matches[1];
    }

    if (!filter_var($candidate, FILTER_VALIDATE_IP)) {
        return '';
    }

    // One canonical spelling per address, so the same client cannot obtain fresh rate-limit counters by writing an
    // IPv6 address differently or as an IPv4-mapped IPv6 address.
    if (strpos($candidate, ':') !== false) {
        $packed = @inet_pton($candidate); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Validated above.
        $normalized = $packed !== false ? inet_ntop($packed) : false;
        if (is_string($normalized) && $normalized !== '') {
            $candidate = $normalized;
        }

        if (stripos($candidate, '::ffff:') === 0 && filter_var(substr($candidate, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $candidate = substr($candidate, 7);
        }
    }

    return $candidate;
}

/**
 * Return a short-lived visit identifier used only for visit-level grouping.
 */
function bbpa_get_visit_identifier(int $timestamp_bucket = 0): string
{
    $timestamp_bucket = $timestamp_bucket > 0 ? $timestamp_bucket : current_time('timestamp');

    $window_seconds = (int) apply_filters(
        'bbpa_visit_identifier_window_seconds',
        bbpa_get_visit_identifier_window_seconds()
    );
    $window_seconds = max(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN,
        min(BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX, $window_seconds)
    );

    $window_bucket = (int) floor($timestamp_bucket / $window_seconds);
    $daily_salt = wp_salt('bbpa_visit_identifier') . '|' . wp_date('Y-m-d', $timestamp_bucket);
    $client_fingerprint = '';
    $ip = bbpa_get_client_ip();

    if ($ip !== '') {
        $client_fingerprint = hash_hmac('sha256', $ip, wp_salt('bbpa_visit_identifier_ip'));
    } else {
        $user_agent = isset($_SERVER['HTTP_USER_AGENT'])
            ? sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_USER_AGENT']))
            : '';
        $accept_language = isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])
            ? sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_ACCEPT_LANGUAGE']))
            : '';

        $normalized_user_agent = strtolower(trim(preg_replace('/\s+/', ' ', $user_agent)));
        $normalized_accept_language = strtolower(trim($accept_language));

        $client_fingerprint = hash(
            'sha256',
            $normalized_user_agent . '|' . $normalized_accept_language
        );
    }

    return substr(
        hash(
            'sha256',
            $client_fingerprint . '|' . $window_bucket . '|' . $daily_salt
        ),
        0,
        16
    );
}

/**
 * Backward-compatible alias for visit identifier generation.
 *
 * @deprecated Not used by the plugin. Use `bbpa_get_visit_identifier()`.
 */
function bbpa_get_hashed_client_ip(): string
{
    return bbpa_get_visit_identifier();
}

/**
 * Return a normalized browser family from a User-Agent value.
 */
function bbpa_detect_browser_family(string $user_agent): string
{
    if (trim($user_agent) === '') {
        return '';
    }

    $agent = strtolower($user_agent);
    if (str_contains($agent, 'edg/')) {
        return 'Edge';
    }
    if (str_contains($agent, 'opr/') || str_contains($agent, 'opera')) {
        return 'Opera';
    }
    if (str_contains($agent, 'firefox/')) {
        return 'Firefox';
    }
    if (str_contains($agent, 'safari/') && !str_contains($agent, 'chrome/')) {
        return 'Safari';
    }
    if (str_contains($agent, 'chrome/')) {
        return 'Chrome';
    }

    return 'Other';
}

/**
 * Return a normalized browser major version from a User-Agent value.
 */
function bbpa_detect_browser_major_version(string $user_agent): string
{
    if (trim($user_agent) === '') {
        return '';
    }

    $patterns = [
        '/edg\/(\d+)/i',
        '/opr\/(\d+)/i',
        '/opera\/(\d+)/i',
        '/firefox\/(\d+)/i',
        '/version\/(\d+).+safari\//i',
        '/chrome\/(\d+)/i',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $user_agent, $matches) && !empty($matches[1])) {
            return sanitize_text_field((string) $matches[1]);
        }
    }

    return '';
}

/**
 * Return a normalized operating system family from a User-Agent value.
 */
function bbpa_detect_operating_system_family(string $user_agent): string
{
    if (trim($user_agent) === '') {
        return '';
    }

    $agent = strtolower($user_agent);
    if (str_contains($agent, 'windows')) {
        return 'Windows';
    }
    if (str_contains($agent, 'android')) {
        return 'Android';
    }
    if (str_contains($agent, 'iphone') || str_contains($agent, 'ipad') || str_contains($agent, 'ios')) {
        return 'iOS';
    }
    if (str_contains($agent, 'mac os') || str_contains($agent, 'macintosh')) {
        return 'macOS';
    }
    if (str_contains($agent, 'linux')) {
        return 'Linux';
    }

    return 'Other';
}

/**
 * Build a temporary visitor count key for essential/base hit deduplication.
 */
function bbpa_get_temporary_visitor_count_key(int $timestamp, array $request_meta): string
{
    $window_seconds = (int) apply_filters(
        'bbpa_visit_identifier_window_seconds',
        bbpa_get_visit_identifier_window_seconds()
    );
    $window_seconds = max(
        BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MIN,
        min(BBPA_VISIT_IDENTIFIER_WINDOW_SECONDS_MAX, $window_seconds)
    );
    $session_bucket = (int) floor(max(0, $timestamp) / $window_seconds);
    $site_salt = wp_salt('bbpa_temporary_visitor_count');

    $ip = isset($request_meta['ip']) ? (string) $request_meta['ip'] : '';
    $user_agent = isset($request_meta['user_agent']) ? (string) $request_meta['user_agent'] : '';
    $ip_hash = hash_hmac('sha256', $ip, wp_salt('bbpa_temporary_visitor_ip'));
    $browser_family = bbpa_detect_browser_family($user_agent);
    $browser_major_version = bbpa_detect_browser_major_version($user_agent);
    $os_family = bbpa_detect_operating_system_family($user_agent);

    $normalized_entry = implode('|', [
        $site_salt,
        $ip_hash,
        $browser_family,
        $browser_major_version,
        $os_family,
        (string) $session_bucket,
    ]);

    return hash('sha256', $normalized_entry);
}

/**
 * Resolve country metadata for the current visitor.
 */
function bbpa_get_visit_country_payload(): array
{
    $payload = bbpa_get_geolocation_payload();
    $country = [
        'country_code' => '',
        'country' => '',
    ];
    if (empty($payload['error'])) {
        $country['country_code'] = bbpa_normalize_country_code($payload['country_code'] ?? '');
        $country['country'] = isset($payload['country'])
            ? sanitize_text_field((string) $payload['country'])
            : '';
    }

    return apply_filters('bbpa_visit_country_payload', $country, $payload);
}

/**
 * Pick a localized name from a MaxMind names map.
 */
function bbpa_pick_maxmind_name($names): string
{
    if (!is_array($names)) {
        return '';
    }

    $locale = get_locale();
    $lang = strtolower(substr($locale, 0, 2));

    if ($lang && isset($names[$lang])) {
        return (string) $names[$lang];
    }

    if (isset($names['en'])) {
        return (string) $names['en'];
    }

    $first = reset($names);
    return $first ? (string) $first : '';
}

/**
 * Normalize a country ISO code from MaxMind payloads.
 */
function bbpa_normalize_country_code($code): string
{
    if (!is_string($code)) {
        return '';
    }

    $code = strtoupper(trim(sanitize_text_field($code)));
    $code = preg_replace('/[^A-Z]/', '', $code);

    return strlen($code) === 2 ? $code : '';
}

/**
 * Normalize a region code for aggregation.
 */
function bbpa_normalize_region_code($code): string
{
    if (!is_string($code)) {
        return 'unknown';
    }

    $code = strtoupper(trim(sanitize_text_field($code)));
    $code = preg_replace('/[^A-Z0-9_-]/', '', $code);

    return $code !== '' ? $code : 'unknown';
}







/**
 * Resolve the MaxMind API service.
 */
function bbpa_get_maxmind_service(): BBPA_MaxMind_Service
{
    static $service = null;

    if ($service === null) {
        $service = new BBPA_MaxMind_Service();
    }

    return $service;
}

/**
 * Ensure the bundled MaxMind DB reader classes are loaded.
 */
function bbpa_require_maxmind_db_reader(): void
{
    if (class_exists('\MaxMind\Db\Reader')) {
        return;
    }

    bbpa_safe_require_once(BBPA_PATH, 'includes/maxmind-db/MaxMind/Db/Reader/Util.php');
    bbpa_safe_require_once(BBPA_PATH, 'includes/maxmind-db/MaxMind/Db/Reader/InvalidDatabaseException.php');
    bbpa_safe_require_once(BBPA_PATH, 'includes/maxmind-db/MaxMind/Db/Reader/Metadata.php');
    bbpa_safe_require_once(BBPA_PATH, 'includes/maxmind-db/MaxMind/Db/Reader/Decoder.php');
    bbpa_safe_require_once(BBPA_PATH, 'includes/maxmind-db/MaxMind/Db/Reader.php');
}

/**
 * Resolve one country-level geolocation payload using the local GeoLite MMDB database.
 *
 * The MaxMind reader is opened once per request and per database file, and the
 * raw record of an address is memoized for the request, so an enriched hit
 * that resolves the same visitor more than once does not reopen and re-scan
 * the database. Filters still run on every call.
 */
function bbpa_lookup_local_geoip_location(string $ip): array
{
    static $readers = [];
    static $records = [];

    $updater = bbpa_get_geoip_database_updater();
    $database_path = $updater->get_local_database_path();

    // Same rule as the admin status: an empty file (left by a failed write) is unavailable, not unreadable.
    if (!$updater->is_database_file_usable($database_path)) {
        return [
            'error' => __('Local GeoLite database is unavailable.', 'bimbeau-privacy-analytics'),
            'source' => 'maxmind-local-database',
        ];
    }

    bbpa_require_maxmind_db_reader();

    clearstatcache(true, $database_path);
    $database_signature = implode(
        '|',
        [
            $database_path,
            (string) filemtime($database_path),
            (string) filesize($database_path),
            (string) fileinode($database_path),
        ]
    );
    $record_key = hash('sha256', $database_signature . '|' . $ip);

    try {
        if (!array_key_exists($record_key, $records)) {
            if (!isset($readers[$database_signature])) {
                foreach ($readers as $stale_reader) {
                    $stale_reader->close();
                }
                $readers = [];
                $records = [];
                $readers[$database_signature] = new \MaxMind\Db\Reader($database_path);
            }

            if (count($records) >= 64) {
                $records = [];
            }
            $records[$record_key] = $readers[$database_signature]->get($ip);
        }
        $record = $records[$record_key];
    } catch (\Throwable $exception) {
        unset($readers[$database_signature], $records[$record_key]);

        return [
            'error' => __('Unable to read the local GeoLite database.', 'bimbeau-privacy-analytics'),
            'details' => ['message' => sanitize_text_field($exception->getMessage())],
            'source' => 'maxmind-local-database',
        ];
    }

    if (!is_array($record) || empty($record)) {
        return [
            'error' => __('No geolocation record found for this IP.', 'bimbeau-privacy-analytics'),
            'source' => 'maxmind-local-database',
        ];
    }

    $location = [
        'country' => bbpa_pick_maxmind_name($record['country']['names'] ?? []),
        'country_code' => sanitize_text_field((string) ($record['country']['iso_code'] ?? '')),
        'source' => 'maxmind-local-database',
    ];

    return apply_filters('bbpa_local_geoip_location', $location, $record);
}

/**
 * Build the persistent cache key of a MaxMind API lookup.
 *
 * The address is never stored: the key is an HMAC of the address, the account
 * and the current UTC day, so keys cannot be linked across days.
 */
function bbpa_get_maxmind_lookup_cache_key(string $ip, string $account_id): string
{
    $digest = hash_hmac(
        'sha256',
        'maxmind-api|' . $ip . '|' . $account_id . '|' . gmdate('Y-m-d'),
        wp_salt('bbpa_visit_identifier_ip')
    );

    return 'bbpa_geo_api_' . substr($digest, 0, 40);
}

/**
 * Return how long a successful MaxMind API lookup is reused, in seconds.
 */
function bbpa_get_maxmind_lookup_cache_ttl(): int
{
    $ttl = (int) apply_filters('bbpa_maxmind_lookup_cache_ttl', 6 * HOUR_IN_SECONDS);

    return max(5 * MINUTE_IN_SECONDS, min(DAY_IN_SECONDS, $ttl));
}

/**
 * Return why outbound MaxMind API lookups are currently paused, or an empty string.
 *
 * Lookups pause after an authentication, quota or availability error (circuit
 * breaker) and when the per-minute request budget is spent.
 */
function bbpa_get_maxmind_api_pause_reason(): string
{
    $circuit = get_transient(BBPA_MAXMIND_API_CIRCUIT_TRANSIENT);
    if (is_array($circuit) && (int) ($circuit['until'] ?? 0) > time()) {
        return 'circuit_open';
    }

    $max_requests = (int) apply_filters('bbpa_maxmind_api_max_requests_per_minute', 120);
    $max_requests = max(1, min(10000, $max_requests));
    $window = (int) floor(time() / MINUTE_IN_SECONDS);
    $rate = get_transient(BBPA_MAXMIND_API_RATE_TRANSIENT);
    $count = is_array($rate) && (int) ($rate['window'] ?? -1) === $window ? (int) ($rate['count'] ?? 0) : 0;

    return $count >= $max_requests ? 'rate_limited' : '';
}

/**
 * Count one outbound MaxMind API request in the current one-minute window.
 */
function bbpa_count_maxmind_api_request(): void
{
    $window = (int) floor(time() / MINUTE_IN_SECONDS);
    $rate = get_transient(BBPA_MAXMIND_API_RATE_TRANSIENT);
    $count = is_array($rate) && (int) ($rate['window'] ?? -1) === $window ? (int) ($rate['count'] ?? 0) : 0;

    set_transient(
        BBPA_MAXMIND_API_RATE_TRANSIENT,
        [
            'window' => $window,
            'count' => $count + 1,
        ],
        2 * MINUTE_IN_SECONDS
    );
}

/**
 * Pause outbound MaxMind API lookups after an error that would repeat for every visitor.
 */
function bbpa_maybe_open_maxmind_api_circuit(array $location): void
{
    if (empty($location['error'])) {
        return;
    }

    $status = isset($location['details']['status']) ? (int) $location['details']['status'] : 0;
    if (in_array($status, [402, 429], true)) {
        $pause = HOUR_IN_SECONDS;
    } elseif (in_array($status, [401, 403], true)) {
        $pause = 15 * MINUTE_IN_SECONDS;
    } elseif ($status === 0 || $status >= 500) {
        $pause = 2 * MINUTE_IN_SECONDS;
    } else {
        // Other client errors (reserved or unknown address) only concern this visitor.
        return;
    }

    set_transient(
        BBPA_MAXMIND_API_CIRCUIT_TRANSIENT,
        [
            'until' => time() + $pause,
            'status' => $status,
        ],
        $pause
    );
}

/**
 * Lift the MaxMind API pause when the lookup mode or the credentials change.
 *
 * Hooked on `bbpa_settings_before_update`: a pause opened by an authentication
 * or quota error must not keep blocking lookups once the administrator saved
 * new credentials. Address-specific cached errors do not depend on the
 * credentials and are kept.
 *
 * @param mixed $settings Sanitized settings about to be stored.
 * @return mixed Unchanged settings.
 */
function bbpa_reset_maxmind_api_pause_on_credentials_change($settings)
{
    if (!is_array($settings)) {
        return $settings;
    }

    $previous = bbpa_get_settings();
    foreach (['geoip_lookup_mode', 'maxmind_account_id', 'maxmind_license_key'] as $key) {
        if ((string) ($previous[$key] ?? '') !== (string) ($settings[$key] ?? '')) {
            delete_transient(BBPA_MAXMIND_API_CIRCUIT_TRANSIENT);
            break;
        }
    }

    return $settings;
}
add_filter('bbpa_settings_before_update', 'bbpa_reset_maxmind_api_pause_on_credentials_change', 5);

/**
 * Build the address-free error payload returned for a cached MaxMind client error.
 *
 * @param int    $status     MaxMind HTTP status code.
 * @param string $error_code MaxMind error code, already sanitized.
 */
function bbpa_build_maxmind_cached_error_payload(int $status, string $error_code): array
{
    $details = ['status' => $status];
    $error_code = sanitize_key($error_code);
    if ($error_code !== '') {
        $details['error_code'] = $error_code;
    }

    return [
        'error' => sprintf(
            /* translators: %s: MaxMind API response code. */
            __('MaxMind API error (%s).', 'bimbeau-privacy-analytics'),
            $status
        ),
        'details' => $details,
        'source' => 'maxmind-api',
    ];
}

/**
 * Look up a MaxMind location with request, persistent and failure-aware caching.
 *
 * Successful answers are reused for a few hours per visitor address (hashed),
 * so heartbeats and page views of the same visit do not call the API again.
 * Address-specific errors are cached briefly; authentication, quota and
 * availability errors pause every lookup for a while; a per-minute budget caps
 * outbound calls. A paused lookup returns an error payload, which callers
 * already treat as "country unknown".
 */
function bbpa_lookup_maxmind_location(
    string $ip,
    string $account_id,
    string $license_key,
    bool $throttle = false
): array {
    static $cache = [];
    $ttl = 60;
    $key = hash('sha256', $ip . '|' . $account_id);
    $now = time();

    if (isset($cache[$key])) {
        $cached = $cache[$key];
        if (is_array($cached) && isset($cached['timestamp'], $cached['payload'])) {
            if (($now - (int) $cached['timestamp']) <= $ttl) {
                return $cached['payload'];
            }
        }
    }

    $persistent_key = bbpa_get_maxmind_lookup_cache_key($ip, $account_id);
    $persisted = get_transient($persistent_key);
    $persisted_payload = null;
    if (is_array($persisted) && isset($persisted['payload']) && is_array($persisted['payload'])) {
        $persisted_payload = $persisted['payload'];
    } elseif (is_array($persisted) && isset($persisted['error_status'])) {
        $persisted_payload = bbpa_build_maxmind_cached_error_payload(
            (int) $persisted['error_status'],
            (string) ($persisted['error_code'] ?? '')
        );
    }
    if ($persisted_payload !== null) {
        $cache[$key] = [
            'timestamp' => $now,
            'payload' => $persisted_payload,
        ];

        return $persisted_payload;
    }

    $pause_reason = bbpa_get_maxmind_api_pause_reason();
    if ($pause_reason !== '') {
        return [
            'error' => __('Unable to connect to MaxMind.', 'bimbeau-privacy-analytics'),
            'details' => ['reason' => $pause_reason],
            'source' => 'maxmind-api',
        ];
    }

    if ($throttle) {
        $throttle_ttl = (int) apply_filters('bbpa_geo_lookup_throttle_seconds', 2);
        $throttle_ttl = max(1, min(60, $throttle_ttl));
        $throttle_key = 'bbpa_geo_lookup_lock';

        if (get_transient($throttle_key) !== false) {
            return [];
        }

        set_transient($throttle_key, 1, $throttle_ttl);
    }

    bbpa_count_maxmind_api_request();
    $service = bbpa_get_maxmind_service();
    $location = $service->lookup($ip, $account_id, $license_key, BBPA_MAXMIND_API_LOOKUP_TIMEOUT);

    if (empty($location['error'])) {
        set_transient($persistent_key, ['payload' => $location], bbpa_get_maxmind_lookup_cache_ttl());
    } else {
        $status = isset($location['details']['status']) ? (int) $location['details']['status'] : 0;
        if ($status >= 400 && $status < 500 && !in_array($status, [401, 402, 403, 429], true)) {
            // MaxMind error messages repeat the queried address: only the status and the
            // error code are stored, the message is rebuilt when the entry is read.
            set_transient(
                $persistent_key,
                [
                    'error_status' => $status,
                    'error_code' => sanitize_key((string) ($location['details']['error_code'] ?? '')),
                ],
                15 * MINUTE_IN_SECONDS
            );
        }
        bbpa_maybe_open_maxmind_api_circuit($location);
    }

    $cache[$key] = [
        'timestamp' => $now,
        'payload' => $location,
    ];

    return $location;
}

/**
 * Resolve the effective geolocation lookup mode for runtime operations.
 */
function bbpa_get_runtime_geoip_lookup_mode(array $settings): string
{
    $lookup_mode = isset($settings['geoip_lookup_mode'])
        ? sanitize_key((string) $settings['geoip_lookup_mode'])
        : 'local_database';

    return $lookup_mode === 'maxmind_api' ? 'maxmind_api' : 'local_database';
}


/**
 * Write geolocation debug logs when debug mode is enabled.
 *
 * @deprecated Not used by the plugin. Use `BBPA_Logger::channel('Geo')->debug()`, gated by the same debug mode.
 */
function bbpa_log_geolocation_debug(string $message, array $context = []): void
{
    if (!bbpa_is_debug_mode_enabled()) {
        return;
    }

    $safe_context = [];
    $blocked_keys = ['ip', 'client_ip', 'remote_addr', 'x_forwarded_for'];
    foreach ($context as $key => $value) {
        $normalized_key = strtolower((string) $key);
        if (in_array($normalized_key, $blocked_keys, true)) {
            continue;
        }

        if (is_scalar($value) || $value === null) {
            $safe_context[$key] = $value;
            continue;
        }

        if (is_array($value)) {
            $safe_context[$key] = array_map(
                static function ($item) {
                    return is_scalar($item) || $item === null ? $item : gettype($item);
                },
                $value
            );
            continue;
        }

        $safe_context[$key] = gettype($value);
    }

    BBPA_Logger::channel('Geo')->info($message, $safe_context);
}

/**
 * Resolve country-level geolocation data for the current request without storing the IP.
 */
function bbpa_get_geolocation_payload(): array
{
    $ip = bbpa_get_client_ip();
    if ($ip === '') {
        return ['error' => __('Unable to determine the visitor IP.', 'bimbeau-privacy-analytics')];
    }

    $settings = bbpa_get_settings();
    $lookup_mode = bbpa_get_runtime_geoip_lookup_mode($settings);
    if ($lookup_mode !== 'local_database') {
        $errors = bbpa_validate_maxmind_settings($settings);
        if ($errors) return ['error' => bbpa_format_maxmind_errors($errors)];
    }

    if ($lookup_mode === 'local_database') {
        $location = bbpa_lookup_local_geoip_location($ip);
    } else {
        $location = bbpa_lookup_maxmind_location(
            $ip,
            trim((string) ($settings['maxmind_account_id'] ?? '')),
            trim((string) ($settings['maxmind_license_key'] ?? ''))
        );
    }

    if (!empty($location['error'])) {
        return [
            'error' => $location['error'],
            'ip' => $ip,
            'details' => $location['details'] ?? null,
            'source' => $location['source'] ?? 'maxmind-api',
        ];
    }

    $payload = [
        'ip' => $ip,
        'country' => sanitize_text_field((string) ($location['country'] ?? '')),
        'country_code' => bbpa_normalize_country_code($location['country_code'] ?? ''),
        'source' => sanitize_text_field((string) ($location['source'] ?? '')),
    ];

    return apply_filters('bbpa_geolocation_payload', $payload, $location);
}

/**
 * Resolve normalized country-level geolocation data for aggregation.
 */
function bbpa_get_geo_aggregate_payload(array $hit = []): array
{
    $country_code = bbpa_normalize_country_code($hit['country_code'] ?? '');
    if ($country_code !== '') {
        return apply_filters('bbpa_geo_aggregate_payload', ['country_code' => $country_code], $hit);
    }

    $location = bbpa_get_geolocation_payload();
    if (!empty($location['error'])) return [];
    $country_code = bbpa_normalize_country_code($location['country_code'] ?? '');
    if ($country_code === '') return [];

    return apply_filters('bbpa_geo_aggregate_payload', ['country_code' => $country_code], $hit, $location);
}
