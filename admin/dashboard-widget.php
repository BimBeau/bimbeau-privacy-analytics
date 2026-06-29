<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * WordPress Dashboard widget integration for BimBeau Privacy Analytics KPIs.
 */

defined('ABSPATH') || exit;

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
    $disabled_panels = isset($settings['disabled_panels']) && is_array($settings['disabled_panels'])
        ? $settings['disabled_panels']
        : [];
    $is_visitors_enabled = !in_array('visitors', $disabled_panels, true);
    $is_top_pages_enabled = !in_array('top-pages', $disabled_panels, true);
    $is_referrers_enabled = !in_array('referrers', $disabled_panels, true);

    $visits = isset($kpis['visits']) ? (int) $kpis['visits'] : 0;
    $page_views = isset($kpis['pageViews']) ? (int) $kpis['pageViews'] : 0;
    $unique_referrers = isset($kpis['uniqueReferrers']) ? (int) $kpis['uniqueReferrers'] : 0;

    $start = isset($range['start']) ? sanitize_text_field((string) $range['start']) : '';
    $end = isset($range['end']) ? sanitize_text_field((string) $range['end']) : '';

    if ($start !== '' && $end !== '') {
        $period_label = sprintf(
            /* translators: 1: Start date, 2: End date for the selected reporting period. */
            __('Period: %1$s to %2$s', 'bimbeau-privacy-analytics'),
            $start,
            $end
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
            echo '<li>' . esc_html__('Visits', 'bimbeau-privacy-analytics') . ': <strong>' . esc_html(number_format_i18n($visits)) . '</strong></li>';
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
