<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Visitor table storage helpers.
 */


/**
 * Upsert the per-day visitor activity row used for unique visitor reporting.
 *
 * @return bool True when a row was inserted or updated.
 */
function bbpa_upsert_visitor_activity_daily(array $hit): bool
{
    global $wpdb;

    $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
    if ($visitor_id === '') {
        return false;
    }

    $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
    $is_page_view = $event_name === 'page_view';

    $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
    if ($timestamp <= 0) {
        $timestamp = current_time('timestamp');
    }

    $table = bbpa_resolve_sql_table('bbpa_visitor_activity_daily');
    if ($table === null) {
        return false;
    }

    $granularity = (($hit['granularity'] ?? 'base') === 'enriched') ? 'enriched' : 'base';
    $date_bucket = wp_date('Y-m-d', $timestamp);
    $device_class = isset($hit['device_class']) ? sanitize_text_field((string) $hit['device_class']) : '';
    $country_code = $granularity === 'enriched' && isset($hit['country_code']) ? sanitize_text_field((string) $hit['country_code']) : '';
    $country = $granularity === 'enriched' && isset($hit['country']) ? sanitize_text_field((string) $hit['country']) : '';
    $city = $granularity === 'enriched' && isset($hit['city']) ? sanitize_text_field((string) $hit['city']) : '';
    $has_enriched_data = $granularity === 'enriched' ? 1 : 0;
    $page_views = $is_page_view ? 1 : 0;

    if (!$is_page_view) {
        $existing_activity = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM `{$table}` WHERE date_bucket = %s AND visitor_id = %s",
                $date_bucket,
                $visitor_id
            )
        );
        if ($existing_activity === 0) {
            return false;
        }
    }

    $result = $wpdb->query(
        $wpdb->prepare(
            "INSERT INTO `{$table}`
                (date_bucket, visitor_id, device_class, country_code, country, city, has_enriched_data, first_seen_at, last_seen_at, page_views)
            VALUES (%s, %s, %s, %s, %s, %s, %d, %d, %d, %d)
            ON DUPLICATE KEY UPDATE
                last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
                page_views = page_views + VALUES(page_views),
                device_class = CASE WHEN VALUES(device_class) <> '' THEN VALUES(device_class) ELSE device_class END,
                country_code = CASE WHEN VALUES(country_code) <> '' THEN VALUES(country_code) ELSE country_code END,
                country = CASE WHEN VALUES(country) <> '' THEN VALUES(country) ELSE country END,
                city = CASE WHEN VALUES(city) <> '' THEN VALUES(city) ELSE city END,
                has_enriched_data = CASE WHEN VALUES(has_enriched_data) = 1 THEN 1 ELSE has_enriched_data END",
            $date_bucket,
            $visitor_id,
            $device_class,
            $country_code,
            $country,
            $city,
            $has_enriched_data,
            $timestamp,
            $timestamp,
            $page_views
        )
    );

    return $result !== false;
}

/**
 * Upsert a visitor row from a hit payload.
 */
function bbpa_store_visitor_hit(array $hit): bool
{
    global $wpdb;

    $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
    $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
    if ($visitor_id === '' || $visit_id === '') {
        return false;
    }

    $timestamp = isset($hit['timestamp_bucket']) ? absint($hit['timestamp_bucket']) : 0;
    if ($timestamp <= 0) {
        $timestamp = current_time('timestamp');
    }

    $table = bbpa_resolve_sql_table('bbpa_visitors');
    if ($table === null) {
        return false;
    }

    $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
    $view_increment = $event_name === 'page_view' ? 1 : 0;

    if ($view_increment === 0) {
        $existing_visitor = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM `{$table}` WHERE visitor_id = %s", $visitor_id)
        );
        if ($existing_visitor === 0) {
            return false;
        }
    }

    $granularity = (($hit['granularity'] ?? 'base') === 'enriched') ? 'enriched' : 'base';

    $data = [
        'visitor_id' => $visitor_id,
        'first_view_at' => $timestamp,
        'last_view_at' => $timestamp,
        'entry_page' => isset($hit['page_path']) ? sanitize_text_field((string) $hit['page_path']) : '',
        'exit_page' => isset($hit['page_path']) ? sanitize_text_field((string) $hit['page_path']) : '',
        'total_views' => $view_increment,
        'active_time_ms' => isset($hit['active_ms_delta']) ? absint($hit['active_ms_delta']) : 0,
        'country_code' => isset($hit['country_code']) ? sanitize_text_field((string) $hit['country_code']) : '',
        'country' => isset($hit['country']) ? sanitize_text_field((string) $hit['country']) : '',
        'city' => isset($hit['city']) ? sanitize_text_field((string) $hit['city']) : '',
        'referrer_domain' => isset($hit['referrer_domain']) ? sanitize_text_field((string) $hit['referrer_domain']) : '',
        'source_category' => isset($hit['source_category']) ? sanitize_text_field((string) $hit['source_category']) : '',
        'browser' => isset($hit['browser']) ? sanitize_text_field((string) $hit['browser']) : '',
        'browser_version' => isset($hit['browser_version']) ? sanitize_text_field((string) $hit['browser_version']) : '',
        'device_class' => isset($hit['device_class']) ? sanitize_text_field((string) $hit['device_class']) : '',
        'operating_system' => isset($hit['operating_system']) ? sanitize_text_field((string) $hit['operating_system']) : '',
        'screen_resolution' => isset($hit['screen_resolution']) ? sanitize_text_field((string) $hit['screen_resolution']) : '',
        'has_enriched_data' => $granularity === 'enriched' ? 1 : 0,
    ];

    if ($granularity !== 'enriched') {
        $data['country_code'] = '';
        $data['country'] = '';
        $data['city'] = '';
        $data['referrer_domain'] = '';
        $data['source_category'] = '';
        $data['browser'] = '';
        $data['browser_version'] = '';
        $data['operating_system'] = '';
        $data['screen_resolution'] = '';
    }


    $result = $wpdb->query(
        $wpdb->prepare(
            "INSERT INTO `{$table}`
                (visitor_id, first_view_at, last_view_at, entry_page, exit_page, total_views, active_time_ms, country_code, country, city, referrer_domain, source_category, browser, browser_version, device_class, operating_system, screen_resolution, has_enriched_data)
            VALUES (%s, %d, %d, %s, %s, %d, %d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %d)
            ON DUPLICATE KEY UPDATE
                total_views = total_views + VALUES(total_views),
                active_time_ms = active_time_ms + VALUES(active_time_ms),
                last_view_at = VALUES(last_view_at),
                exit_page = VALUES(exit_page),
                country_code = CASE WHEN VALUES(country_code) <> '' THEN VALUES(country_code) ELSE country_code END,
                country = CASE WHEN VALUES(country) <> '' THEN VALUES(country) ELSE country END,
                city = CASE WHEN VALUES(city) <> '' THEN VALUES(city) ELSE city END,
                referrer_domain = CASE WHEN referrer_domain = '' AND VALUES(referrer_domain) <> '' THEN VALUES(referrer_domain) ELSE referrer_domain END,
                source_category = CASE WHEN source_category = '' AND VALUES(source_category) <> '' THEN VALUES(source_category) ELSE source_category END,
                browser = CASE WHEN VALUES(browser) <> '' THEN VALUES(browser) ELSE browser END,
                browser_version = CASE WHEN VALUES(browser_version) <> '' THEN VALUES(browser_version) ELSE browser_version END,
                device_class = CASE WHEN VALUES(device_class) <> '' THEN VALUES(device_class) ELSE device_class END,
                operating_system = CASE WHEN VALUES(operating_system) <> '' THEN VALUES(operating_system) ELSE operating_system END,
                screen_resolution = CASE WHEN VALUES(screen_resolution) <> '' THEN VALUES(screen_resolution) ELSE screen_resolution END,
                has_enriched_data = CASE WHEN VALUES(has_enriched_data) = 1 THEN 1 ELSE has_enriched_data END",
            $data['visitor_id'],
            $data['first_view_at'],
            $data['last_view_at'],
            $data['entry_page'],
            $data['exit_page'],
            $data['total_views'],
            $data['active_time_ms'],
            $data['country_code'],
            $data['country'],
            $data['city'],
            $data['referrer_domain'],
            $data['source_category'],
            $data['browser'],
            $data['browser_version'],
            $data['device_class'],
            $data['operating_system'],
            $data['screen_resolution'],
            $data['has_enriched_data']
        )
    );

    return $result !== false;
}


/**
 * Store visitor row and expose whether this is a newly created visitor.
 *
 * @return array{stored:bool,is_new_visitor:bool}
 */
function bbpa_store_visitor_hit_with_outcome(array $hit): array
{
    global $wpdb;

    $visitor_id = isset($hit['visitor_id']) ? sanitize_text_field((string) $hit['visitor_id']) : '';
    $visit_id = isset($hit['visit_id']) ? sanitize_text_field((string) $hit['visit_id']) : '';
    if ($visitor_id === '' || $visit_id === '') {
        return ['stored' => false, 'is_new_visitor' => false];
    }

    $table = bbpa_resolve_sql_table('bbpa_visitors');
    if ($table === null) {
        return ['stored' => false, 'is_new_visitor' => false];
    }

    $existing_visitor = (int) $wpdb->get_var(
        $wpdb->prepare("SELECT COUNT(*) FROM `{$table}` WHERE visitor_id = %s", $visitor_id)
    ) > 0;

    $event_name = isset($hit['event_name']) ? sanitize_key((string) $hit['event_name']) : 'page_view';
    if ($event_name !== 'page_view' && !$existing_visitor) {
        return ['stored' => false, 'is_new_visitor' => false];
    }

    $stored = bbpa_store_visitor_hit($hit);
    if ($stored) {
        bbpa_upsert_visitor_activity_daily($hit);
    }

    return [
        'stored' => $stored,
        'is_new_visitor' => $stored && !$existing_visitor,
    ];
}
