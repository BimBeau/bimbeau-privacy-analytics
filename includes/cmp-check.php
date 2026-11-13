<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * CMP check: tells site owners whether their consent management platform (CMP) blocks the advanced tracker
 * until consent, releases it after consent, or does not control it at all.
 *
 * Two independent signals are combined:
 *
 * 1. Daily counters fed by the hit ingestion. The essential tracker reports, with each page view, the state of the
 *    advanced tracker tag on that page (`held`, `ran`, `open` or `absent`). The first enrichment of a page by the
 *    advanced tracker is counted as `enriched`. Only per-day totals are stored, never a visitor or page detail.
 * 2. A server-side read of the home page HTML (cached), which finds the advanced tracker tag, its attributes and the
 *    CMPs present on the site. It only sees CMPs that rewrite the HTML on the server.
 */

/**
 * Option that stores the daily counters (autoload disabled).
 */
function bbpa_cmp_check_option_name(): string
{
    return 'bbpa_cmp_check_daily';
}

/**
 * Transient that caches the home page probe.
 */
function bbpa_cmp_check_probe_transient_name(): string
{
    return 'bbpa_cmp_check_probe';
}

/**
 * Advanced tracker tag states reported by the essential tracker.
 *
 * - held: the tag is in the page with a non-executable type (a CMP neutralized it).
 * - ran: the advanced tracker already ran when the page view was sent.
 * - open: the tag is in the page, executable, but did not run yet.
 * - absent: the tag is not in the page.
 *
 * @return string[]
 */
function bbpa_cmp_check_states(): array
{
    return ['held', 'ran', 'open', 'absent'];
}

/**
 * Number of days kept in the counters option.
 */
function bbpa_cmp_check_retention_days(): int
{
    return 14;
}

/**
 * Minimum number of page views before the counters are allowed to decide.
 *
 * The counter rules compare shares (80% never held, 50% absent), so a few dozen page views already separate them
 * from noise. A higher bar would leave small sites collecting forever, which is where the check is most useful.
 */
function bbpa_cmp_check_minimum_page_views(): int
{
    return max(1, (int) apply_filters('bbpa_cmp_check_minimum_page_views', 30));
}

/**
 * Normalize a tag state sent by the essential tracker. Returns an empty string for unknown values.
 *
 * @param mixed $state Raw state.
 */
function bbpa_cmp_check_normalize_state($state): string
{
    if (!is_string($state)) {
        return '';
    }

    $state = sanitize_key($state);

    return in_array($state, bbpa_cmp_check_states(), true) ? $state : '';
}

/**
 * Today's day key in the site timezone.
 */
function bbpa_cmp_check_today(): string
{
    return function_exists('wp_date') ? (string) wp_date('Y-m-d') : gmdate('Y-m-d');
}

/**
 * Read the stored counters, keeping only well-formed days.
 *
 * @return array<string, array<string, int>>
 */
function bbpa_cmp_check_get_counters(): array
{
    $stored = get_option(bbpa_cmp_check_option_name(), []);
    if (!is_array($stored)) {
        return [];
    }

    $keys = array_merge(bbpa_cmp_check_states(), ['enriched']);
    $counters = [];
    foreach ($stored as $day => $values) {
        if (!is_string($day) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) !== 1 || !is_array($values)) {
            continue;
        }

        $counters[$day] = [];
        foreach ($keys as $key) {
            $counters[$day][$key] = isset($values[$key]) ? max(0, (int) $values[$key]) : 0;
        }
    }

    ksort($counters);

    return $counters;
}

/**
 * Increment one counter of today. Older days than the retention window are dropped.
 *
 * Concurrent requests may occasionally lose an increment: the counters feed a ratio, not a report.
 *
 * @param string $key One of the tag states or `enriched`.
 */
function bbpa_cmp_check_increment(string $key): void
{
    if (!in_array($key, array_merge(bbpa_cmp_check_states(), ['enriched']), true)) {
        return;
    }

    $counters = bbpa_cmp_check_get_counters();
    $today = bbpa_cmp_check_today();
    if (!isset($counters[$today])) {
        $counters[$today] = array_fill_keys(array_merge(bbpa_cmp_check_states(), ['enriched']), 0);
    }
    $counters[$today][$key]++;

    $oldest = gmdate('Y-m-d', (int) strtotime($today . ' -' . (bbpa_cmp_check_retention_days() - 1) . ' days'));
    foreach (array_keys($counters) as $day) {
        if ($day < $oldest) {
            unset($counters[$day]);
        }
    }

    update_option(bbpa_cmp_check_option_name(), $counters, false);
}

/**
 * Record the advanced tracker tag state reported with an accepted page view.
 *
 * @param mixed $state Raw state.
 */
function bbpa_cmp_check_record_state($state): void
{
    $state = bbpa_cmp_check_normalize_state($state);
    if ($state !== '') {
        bbpa_cmp_check_increment($state);
    }
}

/**
 * Record an accepted first enrichment of a page by the advanced tracker.
 */
function bbpa_cmp_check_record_enrichment(): void
{
    bbpa_cmp_check_increment('enriched');
}

/**
 * Return the counters of the last days, oldest first, with zero rows for days without data.
 *
 * @param int $days Number of days, today included.
 * @return array<int, array<string, int|string>>
 */
function bbpa_cmp_check_get_daily_series(int $days = 7): array
{
    $days = max(1, min(bbpa_cmp_check_retention_days(), $days));
    $counters = bbpa_cmp_check_get_counters();
    $today = bbpa_cmp_check_today();
    $keys = array_merge(bbpa_cmp_check_states(), ['enriched']);

    $series = [];
    for ($offset = $days - 1; $offset >= 0; $offset--) {
        $day = gmdate('Y-m-d', (int) strtotime($today . ' -' . $offset . ' days'));
        $row = ['date' => $day];
        foreach ($keys as $key) {
            $row[$key] = isset($counters[$day][$key]) ? (int) $counters[$day][$key] : 0;
        }
        $series[] = $row;
    }

    return $series;
}

/**
 * Sum a daily series.
 *
 * @param array<int, array<string, int|string>> $series Daily series.
 * @return array<string, int>
 */
function bbpa_cmp_check_sum_series(array $series): array
{
    $totals = array_fill_keys(array_merge(bbpa_cmp_check_states(), ['enriched']), 0);
    foreach ($series as $row) {
        foreach (array_keys($totals) as $key) {
            $totals[$key] += isset($row[$key]) ? (int) $row[$key] : 0;
        }
    }
    $totals['page_views'] = $totals['held'] + $totals['ran'] + $totals['open'] + $totals['absent'];

    return $totals;
}

/**
 * Turn totals, and the home page read when the counters are still too thin, into a verdict.
 *
 * Statuses: `disabled` (advanced stats off), `collecting` (not enough page views yet), `not_blocked` (the tag is
 * never held by a CMP), `script_missing` (the tag is missing), `never_released` (held but never released after
 * consent), `ok`.
 *
 * @param array<string, int>        $totals           Totals from bbpa_cmp_check_sum_series().
 * @param bool                      $advanced_enabled Whether advanced stats are enabled.
 * @param array<string, mixed>|null $probe            Home page read, when one is available.
 * @return array<string, mixed>
 */
function bbpa_cmp_check_evaluate(array $totals, bool $advanced_enabled, ?array $probe = null): array
{
    $page_views = (int) ($totals['page_views'] ?? 0);
    $held = (int) ($totals['held'] ?? 0);
    $ran = (int) ($totals['ran'] ?? 0);
    $open = (int) ($totals['open'] ?? 0);
    $absent = (int) ($totals['absent'] ?? 0);
    $enriched = (int) ($totals['enriched'] ?? 0);

    $share = static function (int $value) use ($page_views): float {
        return $page_views > 0 ? round($value / $page_views, 4) : 0.0;
    };

    $result = [
        'status' => 'ok',
        'source' => 'counters',
        'page_views' => $page_views,
        'minimum_page_views' => bbpa_cmp_check_minimum_page_views(),
        'held_share' => $share($held),
        'not_blocked_share' => $share($ran + $open),
        'absent_share' => $share($absent),
        'consent_share' => $page_views > 0 ? min(1.0, round($enriched / $page_views, 4)) : 0.0,
    ];

    if (!$advanced_enabled) {
        $result['status'] = 'disabled';
        $result['source'] = '';

        return $result;
    }

    if ($page_views >= $result['minimum_page_views']) {
        if ($held === 0 && ($ran + $open) >= 0.8 * $page_views) {
            $result['status'] = 'not_blocked';
        } elseif ($absent >= 0.5 * $page_views) {
            $result['status'] = 'script_missing';
        } elseif ($held > 0 && $enriched === 0) {
            $result['status'] = 'never_released';
        }

        return $result;
    }

    $result['status'] = 'collecting';

    // The home page read answers one case on its own, before any visit: the tag is nowhere in the page and no CMP
    // could have removed it. The other states need the counters, because a CMP may neutralize the tag in the browser.
    if (is_array($probe)
        && ($probe['status'] ?? '') === 'ok'
        && ($probe['tag_state'] ?? '') === 'absent'
        && (!isset($probe['cmps']) || !is_array($probe['cmps']) || $probe['cmps'] === [])
    ) {
        $result['status'] = 'script_missing';
        $result['source'] = 'probe';
    }

    return $result;
}

/**
 * Whether advanced stats are enabled in the saved settings.
 */
function bbpa_cmp_check_is_advanced_enabled(): bool
{
    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];

    return !isset($settings['advanced_stats_enabled']) || rest_sanitize_boolean($settings['advanced_stats_enabled']);
}

/**
 * Verdict over the last 7 days, computed from the counters only (no HTTP request).
 *
 * @return array<string, mixed>
 */
function bbpa_cmp_check_get_verdict(): array
{
    return bbpa_cmp_check_evaluate(
        bbpa_cmp_check_sum_series(bbpa_cmp_check_get_daily_series(7)),
        bbpa_cmp_check_is_advanced_enabled(),
        bbpa_cmp_check_get_cached_probe()
    );
}

/**
 * The cached home page read, without ever firing a new request.
 *
 * @return array<string, mixed>|null
 */
function bbpa_cmp_check_get_cached_probe(): ?array
{
    $cached = get_transient(bbpa_cmp_check_probe_transient_name());

    return is_array($cached) && isset($cached['status']) ? $cached : null;
}

/**
 * Find the advanced tracker tag in an HTML document and return its attributes.
 *
 * @param string $html HTML document.
 * @return array<string, string>|null Lowercase attribute names and their values, or null when the tag is missing.
 */
function bbpa_cmp_check_find_tracker_tag(string $html): ?array
{
    if (preg_match_all('/<script\b([^>]*)>/i', $html, $matches) === false) {
        return null;
    }

    foreach ($matches[1] as $attribute_markup) {
        $attributes = bbpa_cmp_check_parse_attributes((string) $attribute_markup);
        $id = $attributes['id'] ?? '';
        $source = $attributes['src'] ?? ($attributes['data-src'] ?? ($attributes['data-cmp-src'] ?? ''));
        if ($id === 'bbpa-advanced-tracker-js' || strpos($source, 'bbpa-advanced-tracker.js') !== false) {
            return $attributes;
        }
    }

    return null;
}

/**
 * Parse the attributes of an HTML start tag.
 *
 * @param string $markup Attribute markup (inside the tag).
 * @return array<string, string>
 */
function bbpa_cmp_check_parse_attributes(string $markup): array
{
    $attributes = [];
    if (preg_match_all('/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/', $markup, $matches, PREG_SET_ORDER) === false) {
        return $attributes;
    }

    foreach ($matches as $match) {
        $name = strtolower($match[1]);
        $value = '';
        foreach ([2, 3, 4] as $index) {
            if (isset($match[$index]) && $match[$index] !== '') {
                $value = $match[$index];
                break;
            }
        }
        $attributes[$name] = html_entity_decode($value, ENT_QUOTES);
    }

    return $attributes;
}

/**
 * Whether a script `type` attribute lets the browser run the script.
 *
 * @param string $type Type attribute value.
 */
function bbpa_cmp_check_is_executable_type(string $type): bool
{
    $type = strtolower(trim($type));

    return in_array($type, ['', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'module'], true);
}

/**
 * Known CMPs: active plugin basenames and HTML markers.
 *
 * @return array<string, array{plugins: string[], markers: string[]}>
 */
function bbpa_cmp_check_known_cmps(): array
{
    $cmps = [
        'Complianz' => ['plugins' => ['complianz-gdpr/complianz-gpdr.php', 'complianz-gdpr-premium/complianz-gpdr-premium.php'], 'markers' => ['cmplz-', 'complianz']],
        'Cookiebot' => ['plugins' => ['cookiebot/cookiebot.php'], 'markers' => ['consent.cookiebot.com', 'consent.cookiebot.eu']],
        'CookieYes' => ['plugins' => ['cookie-law-info/cookie-law-info.php'], 'markers' => ['cdn-cookieyes.com', 'cookieyes']],
        'Borlabs Cookie' => ['plugins' => ['borlabs-cookie/borlabs-cookie.php'], 'markers' => ['borlabs-cookie']],
        'Real Cookie Banner' => ['plugins' => ['real-cookie-banner/index.php', 'real-cookie-banner-pro/index.php'], 'markers' => ['real-cookie-banner']],
        'Axeptio' => ['plugins' => ['axeptio-sdk-integration/axeptio-wordpress-plugin.php'], 'markers' => ['static.axept.io', 'axeptio']],
        'Didomi' => ['plugins' => [], 'markers' => ['sdk.privacy-center.org']],
        'Usercentrics' => ['plugins' => [], 'markers' => ['app.usercentrics.eu', 'web.cmp.usercentrics.eu']],
        'OneTrust' => ['plugins' => [], 'markers' => ['cdn.cookielaw.org', 'otsdkstub']],
        'iubenda' => ['plugins' => ['iubenda-cookie-law-solution/iubenda_cookie_solution.php'], 'markers' => ['cdn.iubenda.com']],
        'tarteaucitron' => ['plugins' => [], 'markers' => ['tarteaucitron']],
    ];

    return (array) apply_filters('bbpa_cmp_check_known_cmps', $cmps);
}

/**
 * Names of the CMPs found among active plugins or in the HTML.
 *
 * @param string $html HTML document (may be empty).
 * @return string[]
 */
function bbpa_cmp_check_detect_cmps(string $html): array
{
    $active_plugins = (array) get_option('active_plugins', []);
    if (is_multisite()) {
        $active_plugins = array_merge($active_plugins, array_keys((array) get_site_option('active_sitewide_plugins', [])));
    }
    $haystack = strtolower($html);

    $found = [];
    foreach (bbpa_cmp_check_known_cmps() as $name => $definition) {
        $plugins = isset($definition['plugins']) && is_array($definition['plugins']) ? $definition['plugins'] : [];
        $markers = isset($definition['markers']) && is_array($definition['markers']) ? $definition['markers'] : [];
        if (array_intersect($plugins, $active_plugins) !== []) {
            $found[] = (string) $name;
            continue;
        }
        foreach ($markers as $marker) {
            if ($haystack !== '' && strpos($haystack, strtolower((string) $marker)) !== false) {
                $found[] = (string) $name;
                break;
            }
        }
    }

    return $found;
}

/**
 * Describe the advanced tracker tag found in an HTML document.
 *
 * @param string $html HTML document.
 * @return array<string, mixed>
 */
function bbpa_cmp_check_describe_html(string $html): array
{
    $attributes = bbpa_cmp_check_find_tracker_tag($html);
    $tag_state = 'absent';
    $cmp_attributes = [];
    if ($attributes !== null) {
        $tag_state = bbpa_cmp_check_is_executable_type($attributes['type'] ?? '') ? 'executable' : 'blocked';
        foreach ($attributes as $name => $value) {
            if (in_array($name, ['id', 'src', 'data-no-optimize', 'data-no-defer', 'data-no-minify', 'data-cfasync'], true)) {
                continue;
            }
            $cmp_attributes[$name] = $value;
        }
    }

    return [
        'tag_state' => $tag_state,
        'tag_attributes' => $cmp_attributes,
        'cmps' => bbpa_cmp_check_detect_cmps($html),
    ];
}

/**
 * Read the home page as an anonymous visitor and describe the advanced tracker tag. Cached for 12 hours.
 *
 * @param bool $force Ignore the cached result.
 * @return array<string, mixed>
 */
function bbpa_cmp_check_probe_home(bool $force = false): array
{
    $transient = bbpa_cmp_check_probe_transient_name();
    if (!$force) {
        $cached = get_transient($transient);
        if (is_array($cached) && isset($cached['status'])) {
            return $cached;
        }
    }

    $url = home_url('/');
    $response = wp_remote_get($url, [
        'timeout' => 10,
        'redirection' => 3,
        'sslverify' => (bool) apply_filters('https_local_ssl_verify', false),
        'headers' => ['Cache-Control' => 'no-cache'],
        'user-agent' => 'Mozilla/5.0 (compatible; BimBeau Privacy Analytics CMP check; ' . home_url('/') . ')',
    ]);

    $probe = [
        'status' => 'ok',
        'checked_at' => time(),
        'url' => $url,
        'tag_state' => 'unknown',
        'tag_attributes' => [],
        'cmps' => bbpa_cmp_check_detect_cmps(''),
    ];

    if (is_wp_error($response)) {
        $probe['status'] = 'unreachable';
    } else {
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = (string) wp_remote_retrieve_body($response);
        if ($code < 200 || $code >= 400 || $body === '') {
            $probe['status'] = 'unreachable';
            $probe['http_status'] = $code;
        } else {
            $probe = array_merge($probe, bbpa_cmp_check_describe_html($body));
        }
    }

    set_transient($transient, $probe, 12 * HOUR_IN_SECONDS);

    return $probe;
}

/**
 * Full CMP check report for the admin screen.
 *
 * @param bool $refresh Run a new home page probe.
 * @return array<string, mixed>
 */
function bbpa_cmp_check_get_report(bool $refresh = false): array
{
    $advanced_enabled = bbpa_cmp_check_is_advanced_enabled();
    $series = bbpa_cmp_check_get_daily_series(7);
    $totals = bbpa_cmp_check_sum_series($series);
    $probe = $advanced_enabled ? bbpa_cmp_check_probe_home($refresh) : null;

    return [
        'advanced_enabled' => $advanced_enabled,
        'verdict' => bbpa_cmp_check_evaluate($totals, $advanced_enabled, $probe),
        'totals' => $totals,
        'daily' => $series,
        'probe' => $probe,
    ];
}
