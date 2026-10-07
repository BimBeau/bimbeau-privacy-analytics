<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * WordPress Dashboard widget integration for BimBeau Privacy Analytics KPIs.
 */

/**
 * Register the BimBeau Privacy Analytics WordPress Dashboard widget.
 */
function bbpa_register_dashboard_widget(): void
{
    if (!bbpa_current_user_can_access_panel('dashboard')) {
        return;
    }

    wp_add_dashboard_widget(
        'bbpa_dashboard_widget',
        sprintf(
            /* translators: %s: Resolved plugin label shown in the WordPress admin. */
            __('%s overview', 'bimbeau-privacy-analytics'),
            bbpa_get_plugin_label()
        ),
        'bbpa_render_dashboard_widget'
    );
}

/**
 * Check whether the BimBeau Privacy Analytics dashboard admin page is available.
 */
function bbpa_is_dashboard_page_available(): bool
{
    if (!bbpa_current_user_can_access_panel('dashboard')) {
        return false;
    }

    foreach (bbpa_get_admin_panels() as $panel) {
        if (!is_array($panel)) {
            continue;
        }

        $panel_name = isset($panel['name']) ? sanitize_key((string) $panel['name']) : '';
        if ($panel_name === 'dashboard') {
            return true;
        }
    }

    return false;
}

/**
 * Fetch dashboard widget KPI payload using existing admin controller logic.
 */
function bbpa_get_dashboard_widget_payload(): array
{
    if (!class_exists('BBPA_Admin_Controller')) {
        return [];
    }

    $controller = new BBPA_Admin_Controller();
    $request = new WP_REST_Request('GET', '/bbpa/internal/v1/admin/kpis');
    $response = $controller->get_kpis($request);

    if (!($response instanceof WP_REST_Response)) {
        return [];
    }

    $data = $response->get_data();
    return is_array($data) ? $data : [];
}

/**
 * Human visitors and excluded robots of the widget period, counted like the dashboard.
 *
 * Visitors come from the overview report used by the Visitors card of the plugin dashboard; robots are the bot rows
 * listed by the Robots tab of the Visitors report for the same days.
 *
 * @param array<string, mixed> $range Reporting range with `start` and `end` days (`Y-m-d`).
 * @return array{visitors: int|null, robots: int}
 */
function bbpa_get_dashboard_widget_visitor_counts(array $range): array
{
    $counts = ['visitors' => null, 'robots' => 0];
    $start = isset($range['start']) ? (string) $range['start'] : '';
    $end = isset($range['end']) ? (string) $range['end'] : '';

    if (class_exists('BBPA_Report_Controller')) {
        $controller = new BBPA_Report_Controller();
        $request = new WP_REST_Request('GET', '/bbpa/v1/overview');
        if ($start !== '' && $end !== '') {
            $request->set_param('start', $start);
            $request->set_param('end', $end);
        }
        $data = $controller->get_overview($request)->get_data();
        if (is_array($data) && isset($data['overview']['visitors'])) {
            $counts['visitors'] = (int) $data['overview']['visitors'];
        }
    }

    if ($start === '' || $end === '' || !function_exists('bbpa_get_site_day_bounds') || !function_exists('bbpa_sql_table_name')) {
        return $counts;
    }

    global $wpdb;
    $visitors_table = bbpa_sql_table_name('bbpa_visitors');
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $visitors_table)) !== $visitors_table) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- Table probe.
        return $counts;
    }

    $bounds = bbpa_get_site_day_bounds($start, $end);
    // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery -- Internal table name; read-only count.
    $counts['robots'] = (int) $wpdb->get_var(
        $wpdb->prepare(
            "SELECT COUNT(*) FROM {$visitors_table} WHERE last_view_at BETWEEN %d AND %d AND device_class = %s",
            (int) $bounds[0],
            (int) $bounds[1],
            'bot'
        )
    );
    // phpcs:enable

    return $counts;
}

/**
 * Format a `Y-m-d` reporting day with the site date format.
 *
 * The day is interpreted in the site timezone, so the displayed date is the same
 * calendar day. Values that are not valid `Y-m-d` dates are returned unchanged.
 */
function bbpa_format_dashboard_widget_date(string $date): string
{
    $day = DateTimeImmutable::createFromFormat('!Y-m-d', $date, wp_timezone());
    if (!$day instanceof DateTimeImmutable || $day->format('Y-m-d') !== $date) {
        return $date;
    }

    $date_format = get_option('date_format');
    if (!is_string($date_format) || $date_format === '') {
        $date_format = 'Y-m-d';
    }

    $formatted = wp_date($date_format, $day->getTimestamp(), wp_timezone());

    return is_string($formatted) && $formatted !== '' ? $formatted : $date;
}

/**
 * Render the BimBeau Privacy Analytics WordPress Dashboard widget content.
 */
function bbpa_render_dashboard_widget(): void
{
    $payload = bbpa_get_dashboard_widget_payload();
    $kpis = isset($payload['kpis']) && is_array($payload['kpis']) ? $payload['kpis'] : [];
    $range = isset($payload['range']) && is_array($payload['range']) ? $payload['range'] : [];
    $plugin_label = bbpa_get_plugin_label();

    if (empty($kpis)) {
        echo '<p>' . esc_html(sprintf(
            /* translators: %s: Resolved plugin label shown in the WordPress admin. */
            __('%s data is not available for this period.', 'bimbeau-privacy-analytics'),
            $plugin_label
        )) . '</p>';

        if (bbpa_is_dashboard_page_available()) {
            $dashboard_url = admin_url('admin.php?page=' . BBPA_SLUG);
            echo '<p><a href="' . esc_url($dashboard_url) . '">' . esc_html(sprintf(
                /* translators: %s: Resolved plugin label shown in the WordPress admin. */
                __('View %s dashboard', 'bimbeau-privacy-analytics'),
                $plugin_label
            )) . '</a></p>';
        }

        return;
    }

    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
    $hidden_by_policy = apply_filters('bbpa_user_hidden_panels', [], $settings);
    $hidden_by_policy = is_array($hidden_by_policy) ? $hidden_by_policy : [];
    $is_visitors_enabled = !in_array('visitors', $hidden_by_policy, true);
    $is_top_pages_enabled = !in_array('top-pages', $hidden_by_policy, true);
    $is_referrers_enabled = !in_array('referrers', $hidden_by_policy, true);

    $visits = isset($kpis['visits']) ? (int) $kpis['visits'] : 0;
    $visitor_counts = $is_visitors_enabled
        ? bbpa_get_dashboard_widget_visitor_counts($range)
        : ['visitors' => null, 'robots' => 0];
    $page_views = isset($kpis['pageViews']) ? (int) $kpis['pageViews'] : 0;
    $unique_referrers = isset($kpis['uniqueReferrers']) ? (int) $kpis['uniqueReferrers'] : 0;

    $start = isset($range['start']) ? sanitize_text_field((string) $range['start']) : '';
    $end = isset($range['end']) ? sanitize_text_field((string) $range['end']) : '';

    if ($start !== '' && $end !== '') {
        $period_label = sprintf(
            /* translators: 1: Start date, 2: End date for the selected reporting period. */
            __('Period: %1$s to %2$s', 'bimbeau-privacy-analytics'),
            bbpa_format_dashboard_widget_date($start),
            bbpa_format_dashboard_widget_date($end)
        );
    } else {
        $period_label = __('Period: last 30 days', 'bimbeau-privacy-analytics');
    }

    echo '<p><strong>' . esc_html($period_label) . '</strong></p>';
    if (!$is_visitors_enabled && !$is_top_pages_enabled && !$is_referrers_enabled) {
        echo '<p>' . esc_html__('Enable at least one analytics panel to display KPI values in this widget.', 'bimbeau-privacy-analytics') . '</p>';
    } else {
        echo '<ul>';
        if ($is_visitors_enabled) {
            // Same human visitors as the Visitors card of the plugin dashboard; visits only when they are unavailable.
            if ($visitor_counts['visitors'] !== null) {
                echo '<li>' . esc_html__('Visitors', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($visitor_counts['visitors'])) . '</strong></li>';
            } else {
                echo '<li>' . esc_html__('Visits', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($visits)) . '</strong></li>';
            }
            if ($visitor_counts['robots'] > 0) {
                echo '<li>' . esc_html__('Robots excluded', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($visitor_counts['robots'])) . '</strong></li>';
            }
        }
        if ($is_top_pages_enabled) {
            echo '<li>' . esc_html__('Page views', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($page_views)) . '</strong></li>';
        }
        if ($is_referrers_enabled) {
            echo '<li>' . esc_html__('Referrers', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($unique_referrers)) . '</strong></li>';
        }
        echo '</ul>';
    }

    if (bbpa_is_dashboard_page_available()) {
        $dashboard_url = admin_url('admin.php?page=' . BBPA_SLUG);
        echo '<p><a href="' . esc_url($dashboard_url) . '">' . esc_html(sprintf(
            /* translators: %s: Resolved plugin label shown in the WordPress admin. */
            __('View %s dashboard', 'bimbeau-privacy-analytics'),
            $plugin_label
        )) . '</a></p>';
    }
}
