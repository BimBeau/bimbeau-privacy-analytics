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
    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
    $frequency = isset($settings['geoip_update_frequency'])
        ? sanitize_key((string) $settings['geoip_update_frequency'])
        : '30_days';
    $options = bbpa_get_geoip_update_frequency_options();

    return isset($options[$frequency]) ? $frequency : '30_days';
}

/**
 * Register available GeoIP update schedules.
 */
function bbpa_register_geoip_update_cron_schedule(array $schedules): array
{
    $schedules['monthly'] = [
        'interval' => 30 * DAY_IN_SECONDS,
        'display' => __('Once Monthly', 'bimbeau-privacy-analytics'),
    ];
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
    $selected = $options[$frequency] ?? $options['30_days'];
    $interval = (int) ($selected['interval'] ?? 0);
    $schedule = isset($selected['schedule']) ? (string) $selected['schedule'] : '';

    if ($schedule === '' || $interval <= 0) {
        wp_clear_scheduled_hook(BBPA_GEOIP_UPDATE_CRON_HOOK);
        bbpa_geoip_reset_retry_state();

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
    bbpa_schedule_geoip_update(false);

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

    $fallback_ip = '';

    foreach ($candidates as $key) {
        if (!is_string($key) || $key === '') {
            continue;
        }

        if (empty($_SERVER[$key])) {
            continue;
        }

        $value = sanitize_text_field(wp_unslash($_SERVER[$key]));
        $parts = $key === 'HTTP_X_FORWARDED_FOR' ? array_map('trim', explode(',', $value)) : [$value];
        foreach ($parts as $part) {
            $ip = bbpa_extract_ip_from_header_value((string) $part);
            if ($ip !== '') {
                if (bbpa_is_public_ip($ip)) {
                    return $ip;
                }

                if ($fallback_ip === '') {
                    $fallback_ip = $ip;
                }
            }
        }
    }

    if (!$allow_private_fallback) {
        return '';
    }

    return $fallback_ip;
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
    $country_code = '';
    $country_name = '';


    $payload = bbpa_get_geolocation_payload();
    if (!empty($payload['error'])) {
        return [
            'country_code' => $country_code,
            'country' => $country_name,

        ];
    }

    $country_code = bbpa_normalize_country_code($payload['country_code'] ?? '');
    $country_name = isset($payload['country'])
        ? sanitize_text_field((string) $payload['country'])
        : '';



    return [
        'country_code' => $country_code,
        'country' => $country_name,
        'city' => $city_name,
        'city_geoname_id' => $city_geoname_id,
        'accuracy_radius' => $accuracy_radius,
        'latitude' => $latitude,
        'longitude' => $longitude,
    ];
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
 * Normalize a city name for aggregation.
 */
function bbpa_normalize_city_name($city): string
{
    if (!is_string($city)) {
        return 'unknown';
    }

    $city = trim(sanitize_text_field($city));
    if ($city === '') {
        return 'unknown';
    }

    $city = preg_replace('/\s+/', ' ', $city);
    $city = mb_strtolower($city);

    return $city !== '' ? $city : 'unknown';
}

/**
 * Normalize a latitude and longitude pair for storage and payloads.
 */
function bbpa_normalize_coordinate_pair($latitude, $longitude): array
{
    if (!is_numeric($latitude) || !is_numeric($longitude)) {
        return [
            'latitude' => null,
            'longitude' => null,
        ];
    }

    $latitude = (float) $latitude;
    $longitude = (float) $longitude;

    if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        return [
            'latitude' => null,
            'longitude' => null,
        ];
    }

    if (abs($latitude) < 0.0001 && abs($longitude) < 0.0001) {
        return [
            'latitude' => null,
            'longitude' => null,
        ];
    }

    return [
        'latitude' => $latitude,
        'longitude' => $longitude,
    ];
}

/**
 * Normalize a MaxMind GeoName identifier for payloads and storage.
 */
function bbpa_normalize_geoname_id($geoname_id): ?int
{
    if ($geoname_id === null || $geoname_id === '') {
        return null;
    }

    if (is_string($geoname_id)) {
        $geoname_id = trim(sanitize_text_field($geoname_id));
    }

    if (!is_numeric($geoname_id)) {
        return null;
    }

    $normalized_geoname_id = (int) $geoname_id;

    return $normalized_geoname_id > 0 ? $normalized_geoname_id : null;
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
 * Resolve one geolocation payload using the local GeoLite MMDB database.
 */
function bbpa_lookup_local_geoip_location(string $ip): array
{
    $updater = bbpa_get_geoip_database_updater();
    $database_path = $updater->get_local_database_path();

    if ($database_path === '' || !is_readable($database_path)) {
        return [
            'error' => __('Local GeoLite database is unavailable.', 'bimbeau-privacy-analytics'),
            'source' => 'maxmind-local-database',
        ];
    }

    bbpa_require_maxmind_db_reader();

    try {
        $reader = new \MaxMind\Db\Reader($database_path);
        $record = $reader->get($ip);
        $reader->close();
    } catch (\Throwable $exception) {
        return [
            'error' => __('Unable to read the local GeoLite database.', 'bimbeau-privacy-analytics'),
            'details' => [
                'message' => sanitize_text_field($exception->getMessage()),
            ],
            'source' => 'maxmind-local-database',
        ];
    }

    if (!is_array($record) || empty($record)) {
        return [
            'error' => __('No geolocation record found for this IP.', 'bimbeau-privacy-analytics'),
            'source' => 'maxmind-local-database',
        ];
    }

    return [
        'country' => bbpa_pick_maxmind_name($record['country']['names'] ?? []),
        'country_code' => sanitize_text_field((string) ($record['country']['iso_code'] ?? '')),
        'region' => bbpa_pick_maxmind_name($record['subdivisions'][0]['names'] ?? []),
        'region_code' => sanitize_text_field((string) ($record['subdivisions'][0]['iso_code'] ?? '')),
        'city' => bbpa_pick_maxmind_name($record['city']['names'] ?? []),
        'city_geoname_id' => bbpa_normalize_geoname_id($record['city']['geoname_id'] ?? null),
        'latitude' => isset($record['location']['latitude'])
            ? (float) $record['location']['latitude']
            : null,
        'longitude' => isset($record['location']['longitude'])
            ? (float) $record['location']['longitude']
            : null,
        'accuracy_radius' => isset($record['location']['accuracy_radius'])
            ? max(0, (int) $record['location']['accuracy_radius'])
            : null,
        'source' => 'maxmind-local-database',
    ];
}

/**
 * Look up a MaxMind location with a short-lived in-memory cache.
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

    if ($throttle) {
        $throttle_ttl = (int) apply_filters('bbpa_geo_lookup_throttle_seconds', 2);
        $throttle_ttl = max(1, min(60, $throttle_ttl));
        $throttle_key = 'bbpa_geo_lookup_lock';

        if (get_transient($throttle_key) !== false) {
            return [];
        }

        set_transient($throttle_key, 1, $throttle_ttl);
    }

    $service = bbpa_get_maxmind_service();
    $location = $service->lookup($ip, $account_id, $license_key);

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
 */
function bbpa_log_geolocation_debug(string $message, array $context = []): void
{
    if (!function_exists('bbpa_is_debug_mode_enabled') || !bbpa_is_debug_mode_enabled()) {
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
 * Resolve geolocation data for the current request without storing the IP.
 */
function bbpa_get_geolocation_payload(): array
{
    $ip = bbpa_get_client_ip();
    if ($ip === '') {
        return [
            'error' => __('Unable to determine the visitor IP.', 'bimbeau-privacy-analytics'),
        ];
    }

    $settings = bbpa_get_settings();
    $lookup_mode = bbpa_get_runtime_geoip_lookup_mode($settings);

    if ($lookup_mode !== 'local_database') {
        $errors = bbpa_validate_maxmind_settings($settings);
        if ($errors) {
            return [
                'error' => bbpa_format_maxmind_errors($errors),
            ];
        }
    }

    if ($lookup_mode === 'local_database') {
        $location = bbpa_lookup_local_geoip_location($ip);
    } else {
        $account_id = trim((string) ($settings['maxmind_account_id'] ?? ''));
        $license_key = trim((string) ($settings['maxmind_license_key'] ?? ''));
        $location = bbpa_lookup_maxmind_location($ip, $account_id, $license_key);
    }

    if (!empty($location['error'])) {
        bbpa_log_geolocation_debug('Geolocation lookup failed.', [
            'lookup_mode' => $lookup_mode,
            'ip' => $ip,
            'source' => $location['source'] ?? 'maxmind-api',
            'error' => (string) $location['error'],
            'details' => isset($location['details']) && is_array($location['details'])
                ? array_keys($location['details'])
                : null,
        ]);

        return [
            'error' => $location['error'],
            'ip' => $ip,
            'details' => $location['details'] ?? null,
            'source' => $location['source'] ?? 'maxmind-api',
        ];
    }


/* </fs_premium_only> */

    return [
        'ip' => $ip,
        'country' => $location['country'],
        'country_code' => $location['country_code'] ?? '',
        'region' => $location['region'],
        'region_code' => $location['region_code'] ?? '',

        'source' => $location['source'],
    ];
}

/**
 * Resolve normalized geolocation data for aggregation.
 */
function bbpa_get_geo_aggregate_payload(array $hit = []): array
{
    $country_code = bbpa_normalize_country_code($hit['country_code'] ?? '');


    if ($country_code !== '') {
        return [
            'country_code' => $country_code,
            'region_code' => bbpa_normalize_region_code($hit['region_code'] ?? ''),
        ];
    }

    $ip = bbpa_get_client_ip();
    if ($ip === '') {
        return [];
    }

    $settings = bbpa_get_settings();
    if (!bbpa_can_enrich_geolocation([
        'settings' => $settings,
        'server' => $_SERVER,
    ])) {
        return [];
    }
    $lookup_mode = bbpa_get_runtime_geoip_lookup_mode($settings);

    if ($lookup_mode === 'local_database') {
        $location = bbpa_lookup_local_geoip_location($ip);
    } else {
        if (bbpa_validate_maxmind_settings($settings)) {
            return [];
        }

        $account_id = trim((string) ($settings['maxmind_account_id'] ?? ''));
        $license_key = trim((string) ($settings['maxmind_license_key'] ?? ''));
        $location = bbpa_lookup_maxmind_location($ip, $account_id, $license_key, true);
    }

    if (!empty($location['error'])) {
        bbpa_log_geolocation_debug('Geo aggregate lookup failed.', [
            'lookup_mode' => $lookup_mode,
            'ip' => $ip,
            'source' => $location['source'] ?? 'maxmind-api',
            'error' => (string) $location['error'],
        ]);

        return [];
    }


    ];
}
