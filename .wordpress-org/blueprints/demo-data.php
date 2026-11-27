<?php

/**
 * Demo data for the WordPress Playground preview of the WordPress.org listing.
 *
 * The preview boots an empty WordPress, so every report of the plugin would read zero:
 * a visitor evaluating the plugin would see its interface but none of its reports. This
 * file fills the analytics tables of a throwaway sandbox with a sample month of traffic,
 * so the dashboard, the page and referrer lists, the map and the visitor views show what
 * the plugin actually produces.
 *
 * It is NOT part of the distributed plugin. `scripts/build-playground-blueprint.js` embeds
 * it in `.wordpress-org/blueprints/blueprint.json`, which is committed to the `assets`
 * directory of the WordPress.org Subversion repository and read only by Playground.
 *
 * Everything here is invented. The pages are a generic sample site, the figures are
 * generated from a fixed formula — no randomness, so the preview looks the same for
 * everyone — and nothing claims to measure a real website.
 *
 * The column lists below mirror `db/schema.php`. When the schema changes, the
 * `playground-demo-data` test of the repository fails against a real installation, which
 * is what keeps this file from rotting unnoticed.
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pages of the sample site. The slug becomes the stored page path.
 *
 * @return array<int, array{slug: string, title: string, weight: int}>
 */
function bbpa_demo_pages(): array
{
    return [
        ['slug' => '', 'title' => 'Home', 'weight' => 100],
        ['slug' => 'pricing', 'title' => 'Pricing', 'weight' => 62],
        ['slug' => 'features', 'title' => 'Features', 'weight' => 48],
        ['slug' => 'docs/getting-started', 'title' => 'Getting started', 'weight' => 37],
        ['slug' => 'blog/measuring-without-cookies', 'title' => 'Measuring without cookies', 'weight' => 29],
        ['slug' => 'about', 'title' => 'About the team', 'weight' => 18],
        ['slug' => 'contact', 'title' => 'Contact', 'weight' => 12],
        ['slug' => 'changelog', 'title' => 'Changelog', 'weight' => 8],
    ];
}

/**
 * Referring sites, with the acquisition channel the plugin stores for each.
 *
 * The channel strings are the values returned by `bbpa_get_source_category_from_tracking_context()`.
 *
 * @return array<int, array{domain: string, channel: string, weight: int}>
 */
function bbpa_demo_sources(): array
{
    return [
        ['domain' => '', 'channel' => 'Direct', 'weight' => 34],
        ['domain' => 'www.google.com', 'channel' => 'Organic Search', 'weight' => 28],
        ['domain' => 'news.ycombinator.com', 'channel' => 'Referrals', 'weight' => 11],
        ['domain' => 'www.linkedin.com', 'channel' => 'Organic Social', 'weight' => 9],
        ['domain' => 'chatgpt.com', 'channel' => 'AI Assistants', 'weight' => 7],
        ['domain' => 'duckduckgo.com', 'channel' => 'Organic Search', 'weight' => 6],
        ['domain' => 'mastodon.social', 'channel' => 'Organic Social', 'weight' => 3],
        ['domain' => '', 'channel' => 'Email', 'weight' => 2],
    ];
}

/**
 * Countries of the sample audience.
 *
 * @return array<int, array{code: string, name: string, weight: int}>
 */
function bbpa_demo_countries(): array
{
    return [
        ['code' => 'FR', 'name' => 'France', 'weight' => 31],
        ['code' => 'US', 'name' => 'United States', 'weight' => 19],
        ['code' => 'DE', 'name' => 'Germany', 'weight' => 12],
        ['code' => 'GB', 'name' => 'United Kingdom', 'weight' => 9],
        ['code' => 'ES', 'name' => 'Spain', 'weight' => 7],
        ['code' => 'IT', 'name' => 'Italy', 'weight' => 6],
        ['code' => 'BE', 'name' => 'Belgium', 'weight' => 5],
        ['code' => 'CA', 'name' => 'Canada', 'weight' => 4],
        ['code' => 'NL', 'name' => 'Netherlands', 'weight' => 4],
        ['code' => 'CH', 'name' => 'Switzerland', 'weight' => 3],
    ];
}

/**
 * Browsers and devices of the sample audience.
 *
 * @return array<int, array{browser: string, version: string, os: string, device: string, screen: string}>
 */
function bbpa_demo_clients(): array
{
    return [
        ['browser' => 'Chrome', 'version' => '142', 'os' => 'Windows', 'device' => 'desktop', 'screen' => '1920x1080'],
        ['browser' => 'Safari', 'version' => '18', 'os' => 'macOS', 'device' => 'desktop', 'screen' => '1512x982'],
        ['browser' => 'Safari', 'version' => '18', 'os' => 'iOS', 'device' => 'mobile', 'screen' => '390x844'],
        ['browser' => 'Chrome', 'version' => '142', 'os' => 'Android', 'device' => 'mobile', 'screen' => '412x915'],
        ['browser' => 'Firefox', 'version' => '134', 'os' => 'Linux', 'device' => 'desktop', 'screen' => '1920x1080'],
        ['browser' => 'Edge', 'version' => '142', 'os' => 'Windows', 'device' => 'desktop', 'screen' => '2560x1440'],
        ['browser' => 'Safari', 'version' => '18', 'os' => 'iPadOS', 'device' => 'tablet', 'screen' => '1024x1366'],
    ];
}

/**
 * Number of days of history the preview shows.
 *
 * Twice the default 30-day range of the reports, so the comparison with the previous
 * period has data to compare against instead of showing "+100%" on every tile.
 */
const BBPA_DEMO_DAYS = 60;

/** Distinct visitors in the pool. Each one comes back a couple of times over the period. */
const BBPA_DEMO_VISITOR_POOL = 900;

/**
 * Daily traffic shape: a gentle upward trend, quieter at the weekend.
 *
 * `$day_index` counts backwards from today (0 = today). The figures are those of a small
 * site, so the ratios the reports derive from them stay believable.
 */
function bbpa_demo_day_volume(int $day_index, int $weekday): int
{
    $trend = 72 + (int) round((BBPA_DEMO_DAYS - $day_index) * 0.9);
    $weekly = in_array($weekday, [0, 6], true) ? -24 : (int) round(9 * sin($day_index / 2.0));

    return max(31, $trend + $weekly);
}

/**
 * Spread a daily total over weighted buckets, keeping the total exact.
 *
 * @param array<int, int> $weights
 * @return array<int, int>
 */
function bbpa_demo_split(int $total, array $weights): array
{
    $sum = array_sum($weights);
    if ($sum <= 0) {
        return array_fill(0, count($weights), 0);
    }

    $shares = [];
    $allocated = 0;
    foreach ($weights as $index => $weight) {
        $share = (int) floor($total * $weight / $sum);
        $shares[$index] = $share;
        $allocated += $share;
    }

    for ($index = 0; $allocated < $total; $index = ($index + 1) % count($weights)) {
        $shares[$index]++;
        $allocated++;
    }

    return $shares;
}

/**
 * Insert rows in batches, so a sandbox on SQLite stays fast.
 *
 * @param array<int, string>             $columns
 * @param array<int, array<int, mixed>>  $rows
 */
function bbpa_demo_insert(string $table, array $columns, array $rows): void
{
    global $wpdb;

    if ($rows === []) {
        return;
    }

    $column_list = '`' . implode('`, `', $columns) . '`';
    $placeholder = '(' . implode(', ', array_fill(0, count($columns), '%s')) . ')';

    foreach (array_chunk($rows, 80) as $chunk) {
        $values = [];
        foreach ($chunk as $row) {
            $values = array_merge($values, $row);
        }

        $sql = "INSERT INTO `{$table}` ({$column_list}) VALUES "
            . implode(', ', array_fill(0, count($chunk), $placeholder));

        // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- placeholders are built from a fixed column list.
        $wpdb->query($wpdb->prepare($sql, $values));
    }
}

/**
 * Create the pages of the sample site and return their stored paths.
 *
 * @return array<int, string>
 */
function bbpa_demo_create_pages(): array
{
    $paths = [];

    foreach (bbpa_demo_pages() as $page) {
        if ($page['slug'] === '') {
            $paths[] = '/';
            continue;
        }

        $segments = explode('/', $page['slug']);
        $parent = 0;
        foreach ($segments as $depth => $segment) {
            $existing = get_page_by_path(implode('/', array_slice($segments, 0, $depth + 1)));
            if ($existing instanceof WP_Post) {
                $parent = $existing->ID;
                continue;
            }

            $parent = (int) wp_insert_post([
                'post_type' => 'page',
                'post_status' => 'publish',
                'post_title' => $depth === count($segments) - 1 ? $page['title'] : ucfirst($segment),
                'post_name' => $segment,
                'post_parent' => $parent,
                'post_content' => '',
            ]);
        }

        $paths[] = '/' . $page['slug'] . '/';
    }

    return $paths;
}

/**
 * Close the configuration assistant, so the preview opens on the reports.
 */
function bbpa_demo_complete_setup_wizard(): void
{
    $completed_at = gmdate('Y-m-d H:i:s', time() - DAY_IN_SECONDS * BBPA_DEMO_DAYS);

    update_option('bbpa_setup_wizard_state', [
        'schema_version' => 1,
        'status' => 'completed',
        'auto_opened' => true,
        'current_step' => 'complete',
        'started_at' => $completed_at,
        'completed_at' => $completed_at,
        'completed_by' => 1,
        'wizard_version' => 1,
        'choices' => ['advanced_stats' => true, 'geoip_database' => true, 'referrer_favicons' => true],
        'authorizations' => [
            'geoip_downloaded_at' => null,
            'geoip_downloaded_by' => null,
            'favicons_enabled_at' => $completed_at,
            'favicons_enabled_by' => 1,
        ],
    ], false);

    // Everything the configuration assistant offers is on, so the preview shows the plugin
    // doing its job rather than asking to be set up.
    //
    // Geolocation runs in API mode here. The sandbox has no local GeoIP database — it is far
    // too large to download on every preview — and the local-database mode would put a
    // "database not installed" warning across the reports, which says nothing useful about a
    // demo whose country figures are pre-loaded and which never measures live traffic.
    $settings = get_option('bbpa_settings', []);
    $settings = is_array($settings) ? $settings : [];
    $settings['advanced_stats_enabled'] = true;
    $settings['geo_aggregation_enabled'] = true;
    $settings['geoip_lookup_mode'] = 'maxmind_api';
    $settings['geoip_update_frequency'] = 'disabled';
    $settings['referrer_favicons_enabled'] = true;
    update_option('bbpa_settings', $settings, false);
}

/**
 * Fill the analytics tables with the sample month.
 */
function bbpa_demo_seed(): void
{
    global $wpdb;

    $prefix = $wpdb->prefix . 'bbpa_';

    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM `{$prefix}overview_daily`") > 0) {
        return;
    }

    $paths = bbpa_demo_create_pages();
    $pages = bbpa_demo_pages();
    $sources = bbpa_demo_sources();
    $countries = bbpa_demo_countries();
    $clients = bbpa_demo_clients();

    $page_weights = array_column($pages, 'weight');
    $source_weights = array_column($sources, 'weight');
    $country_weights = array_column($countries, 'weight');

    $overview = [];
    $daily = [];
    $hourly = [];
    $hits_daily = [];
    $source_daily = [];
    $geo = [];
    $page_time = [];
    $entry_exit = [];
    $time_daily = [];
    $searches = [];
    $not_found = [];
    $activity = [];
    $visitors = [];

    $terms = ['pricing', 'export csv', 'gdpr', 'real time', 'heatmap', 'wordpress analytics'];
    $missing = ['/old-pricing/', '/blog/2019/welcome/', '/wp-content/uploads/report.pdf'];

    for ($day_index = BBPA_DEMO_DAYS - 1; $day_index >= 0; $day_index--) {
        $timestamp = time() - DAY_IN_SECONDS * $day_index;
        $date = gmdate('Y-m-d', $timestamp);
        $weekday = (int) gmdate('w', $timestamp);

        $page_views = bbpa_demo_day_volume($day_index, $weekday);
        $visits = max(12, (int) round($page_views / 3.4));
        $unique = (int) round($visits * 0.86);
        $bounces = (int) round($visits * 0.41);
        $active_ms = $visits * 52000;

        $overview[] = [$date, $page_views, $visits, $unique, $bounces, $active_ms, $visits, (int) round($page_views * 0.21)];
        $time_daily[] = [$date, $active_ms, $visits];

        $per_page = bbpa_demo_split($page_views, $page_weights);
        $per_page_visits = bbpa_demo_split($visits, $page_weights);

        foreach ($paths as $page_index => $path) {
            $hits = $per_page[$page_index];
            if ($hits === 0) {
                continue;
            }

            // The home page carries every source, the others the first two: enough variety
            // for the referrer and channel reports without one row per combination.
            $kept = $page_index === 0 ? count($sources) : 2;
            $per_source = bbpa_demo_split($hits, array_slice($source_weights, 0, $kept));
            foreach (array_slice($sources, 0, $kept) as $source_index => $source) {
                $source_hits = $per_source[$source_index];
                if ($source_hits === 0) {
                    continue;
                }

                $client = $clients[($day_index + $page_index + $source_index) % count($clients)];
                $source_visits = max(1, (int) round($source_hits / 1.9));

                // `bbpa_daily` is keyed by day, page, referring domain and device, and two
                // channels share an empty domain (direct traffic and email). Summing into
                // that key keeps the rows unique instead of failing the whole insert.
                $daily_key = $date . '|' . $path . '|' . $source['domain'] . '|' . $client['device'];
                if (isset($daily[$daily_key])) {
                    $daily[$daily_key][4] += $source_hits;
                    $daily[$daily_key][5] += $source_visits;
                } else {
                    $daily[$daily_key] = [$date, $path, $source['domain'], $client['device'], $source_hits, $source_visits];
                }
                $hits_daily[] = [$date, $path, $source['domain'], $source['channel'], $source_hits];
                $source_daily[] = [$date, $path, $source['domain'], $source['channel'], $source_hits, $source_visits];
            }

            $page_visits = max(1, $per_page_visits[$page_index]);
            $page_time[] = [$date, $path, $page_visits * (52000 + $page_index * 9000), $page_visits];
            $entry_exit[] = [$date, $path, (int) round($page_visits * 0.62), (int) round($page_visits * 0.58)];
        }

        $per_country = bbpa_demo_split($page_views, $country_weights);
        foreach ($countries as $country_index => $country) {
            if ($per_country[$country_index] === 0) {
                continue;
            }

            $geo[] = [
                $date,
                $country['code'],
                $per_country[$country_index],
                max(1, (int) round($per_country[$country_index] / 1.9)),
            ];
        }

        $searches[] = [$date, $terms[$day_index % count($terms)], 2 + ($day_index % 5)];
        if ($day_index % 4 === 0) {
            $not_found[] = [$date, $missing[($day_index / 4) % count($missing)], 1 + ($day_index % 3)];
        }

        // One row per visit, drawn from a rotating pool, so the same person comes back a
        // couple of times over the period and the unique-visitor counts stay below the visits.
        for ($slot = 0; $slot < $visits; $slot++) {
            $seed = ($day_index * 37 + $slot) % BBPA_DEMO_VISITOR_POOL;
            $client = $clients[$seed % count($clients)];
            $country = $countries[$seed % count($countries)];
            $source = $sources[$seed % count($sources)];
            $entry = $paths[$seed % count($paths)];
            $exit = $paths[($seed + 3) % count($paths)];
            $views = 2 + ($seed % 6);
            $first_seen = $timestamp - 3600 * (2 + $slot * 5);
            $last_seen = $first_seen + 60 * (4 + $seed % 20);
            $visitor_id = 'demo-' . str_pad((string) $seed, 4, '0', STR_PAD_LEFT);

            // The visitors table holds one row per person: a returning visitor keeps the
            // first sighting and takes the later one as its last view.
            if (isset($visitors[$visitor_id])) {
                $visitors[$visitor_id][2] = $last_seen;
                $visitors[$visitor_id][4] = $exit;
                $visitors[$visitor_id][5] += $views;
                $visitors[$visitor_id][6] += $views * 24000;
                $activity[] = [$date, $visitor_id, $client['device'], $country['code'], $country['name'], 1, $first_seen, $last_seen, $views];
                continue;
            }

            $visitors[$visitor_id] = [
                $visitor_id,
                $first_seen,
                $last_seen,
                $entry,
                $exit,
                $views,
                $views * 24000,
                $country['code'],
                $country['name'],
                $source['domain'],
                $source['channel'],
                $client['browser'],
                $client['version'],
                $client['device'],
                $client['os'],
                $client['screen'],
                1,
            ];

            $activity[] = [$date, $visitor_id, $client['device'], $country['code'], $country['name'], 1, $first_seen, $last_seen, $views];
        }

        // The hourly heatmap reads the last week.
        if ($day_index < 7) {
            foreach ([8, 10, 12, 14, 16, 18, 21] as $hour) {
                $busy = in_array($hour, [10, 14, 16], true) ? 2.1 : 1.0;
                $hourly_key = gmdate('Y-m-d', $timestamp) . sprintf(' %02d:00:00', $hour)
                    . '|' . $paths[$hour % count($paths)]
                    . '|' . $sources[$hour % count($sources)]['domain']
                    . '|' . $clients[$hour % count($clients)]['device'];
                $hourly[$hourly_key] = [
                    gmdate('Y-m-d', $timestamp) . sprintf(' %02d:00:00', $hour),
                    $paths[$hour % count($paths)],
                    $sources[$hour % count($sources)]['domain'],
                    $clients[$hour % count($clients)]['device'],
                    max(1, (int) round($page_views / 24 * $busy)),
                ];
            }
        }
    }

    bbpa_demo_insert($prefix . 'overview_daily', ['date_bucket', 'page_views', 'visits', 'visitors', 'bounces', 'active_ms_total', 'visits_with_time', 'bot_page_views'], $overview);
    bbpa_demo_insert($prefix . 'time_daily', ['date_bucket', 'active_ms_total', 'visits_with_time'], $time_daily);
    bbpa_demo_insert($prefix . 'daily', ['date_bucket', 'page_path', 'referrer_domain', 'device_class', 'hits', 'visits'], array_values($daily));
    bbpa_demo_insert($prefix . 'hourly', ['date_bucket', 'page_path', 'referrer_domain', 'device_class', 'hits'], array_values($hourly));
    bbpa_demo_insert($prefix . 'hits_daily', ['date_bucket', 'page_path', 'referrer_domain', 'source_category', 'hits'], $hits_daily);
    bbpa_demo_insert($prefix . 'daily_source_category', ['date_bucket', 'page_path', 'referrer_domain', 'source_category', 'hits', 'visits'], $source_daily);
    bbpa_demo_insert($prefix . 'geo_daily', ['date_bucket', 'country_code', 'hits', 'visits'], $geo);
    bbpa_demo_insert($prefix . 'page_time_daily', ['date_bucket', 'page_path', 'active_ms_total', 'visits_with_time'], $page_time);
    bbpa_demo_insert($prefix . 'entry_exit_daily', ['date_bucket', 'page_path', 'entries', 'exits'], $entry_exit);
    bbpa_demo_insert($prefix . 'search_terms_daily', ['date_bucket', 'search_term', 'hits'], $searches);
    bbpa_demo_insert($prefix . '404s_daily', ['date_bucket', 'page_path', 'hits'], $not_found);
    bbpa_demo_insert($prefix . 'visitors', ['visitor_id', 'first_view_at', 'last_view_at', 'entry_page', 'exit_page', 'total_views', 'active_time_ms', 'country_code', 'country', 'referrer_domain', 'source_category', 'browser', 'browser_version', 'device_class', 'operating_system', 'screen_resolution', 'has_enriched_data'], array_values($visitors));
    bbpa_demo_insert($prefix . 'visitor_activity_daily', ['date_bucket', 'visitor_id', 'device_class', 'country_code', 'country', 'has_enriched_data', 'first_seen_at', 'last_seen_at', 'page_views'], $activity);

    bbpa_demo_complete_setup_wizard();

    wp_cache_flush();
}

bbpa_demo_seed();
