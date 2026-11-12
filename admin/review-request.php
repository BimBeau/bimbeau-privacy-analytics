<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * WordPress.org review request shown on the plugin screens.
 *
 * The notice appears to users who manage the plugin settings, on BimBeau
 * Privacy Analytics screens only, 14 days after the plugin screens were first
 * opened on the site. Each user can postpone it for 30 days or hide it for good.
 */

/**
 * Site option holding the Unix time of the first plugin screen view (autoload off).
 */
function bbpa_review_request_started_option(): string
{
    return 'bbpa_review_request_started_at';
}

/**
 * User meta holding the user's choice: `dismissed`, or the Unix time until which the notice is postponed.
 */
function bbpa_review_request_user_meta_key(): string
{
    return 'bbpa_review_request';
}

/**
 * Public review form of the plugin on WordPress.org.
 */
function bbpa_get_review_request_url(): string
{
    return 'https://wordpress.org/support/plugin/bimbeau-privacy-analytics/reviews/#new-post';
}

/**
 * Return the time the review request delay started, recording it on first call.
 *
 * @param int|null $now Current Unix time (tests).
 */
function bbpa_get_review_request_started_at(?int $now = null): int
{
    $started_at = (int) get_option(bbpa_review_request_started_option(), 0);
    if ($started_at > 0) {
        return $started_at;
    }

    $started_at = $now ?? time();
    add_option(bbpa_review_request_started_option(), $started_at, '', false);

    return $started_at;
}

/**
 * Decide whether the review request is due for a user.
 *
 * Does not check the current screen or the capability: see bbpa_should_render_review_request().
 *
 * @param int      $user_id User ID.
 * @param int|null $now     Current Unix time (tests).
 */
function bbpa_is_review_request_due(int $user_id, ?int $now = null): bool
{
    if ($user_id <= 0) {
        return false;
    }

    $now = $now ?? time();
    if ($now < bbpa_get_review_request_started_at($now) + 14 * DAY_IN_SECONDS) {
        return false;
    }

    $state = get_user_meta($user_id, bbpa_review_request_user_meta_key(), true);
    if ($state === 'dismissed') {
        return false;
    }

    if (is_numeric($state) && (int) $state > $now) {
        return false;
    }

    return true;
}

/**
 * Record a user's answer to the review request.
 *
 * @param string   $action  `later` (postpone 30 days) or `dismiss` (never show again).
 * @param int      $user_id User ID.
 * @param int|null $now     Current Unix time (tests).
 * @return bool Whether the action was recognised and stored.
 */
function bbpa_apply_review_request_action(string $action, int $user_id, ?int $now = null): bool
{
    if ($user_id <= 0) {
        return false;
    }

    if ($action === 'dismiss') {
        update_user_meta($user_id, bbpa_review_request_user_meta_key(), 'dismissed');
        return true;
    }

    if ($action === 'later') {
        update_user_meta($user_id, bbpa_review_request_user_meta_key(), (string) (($now ?? time()) + 30 * DAY_IN_SECONDS));
        return true;
    }

    return false;
}

/**
 * Whether the current request shows the review request.
 */
function bbpa_should_render_review_request(): bool
{
    if (!function_exists('bbpa_is_plugin_admin_page') || !bbpa_is_plugin_admin_page()) {
        return false;
    }

    if (!function_exists('bbpa_current_user_can_access_panel') || !bbpa_current_user_can_access_panel('settings')) {
        return false;
    }

    return bbpa_is_review_request_due(get_current_user_id());
}

/**
 * Build the URL of a review request answer on the current plugin screen.
 *
 * @param string $action `later` or `dismiss`.
 */
function bbpa_get_review_request_action_url(string $action): string
{
    $page = function_exists('bbpa_get_requested_admin_page_slug') ? bbpa_get_requested_admin_page_slug() : '';
    if ($page === '') {
        $page = BBPA_SLUG;
    }

    return add_query_arg(
        [
            'page' => $page,
            'bbpa_review_request' => $action,
            'bbpa_nonce' => wp_create_nonce('bbpa_admin_action'),
        ],
        admin_url('admin.php')
    );
}

/**
 * Store the answer sent from the notice, then reload the screen without the query arguments.
 *
 * Hooked on `admin_init`.
 */
function bbpa_handle_review_request_action(): void
{
    if (!function_exists('bbpa_get_admin_request_scalar')) {
        return;
    }

    $action = bbpa_get_admin_request_scalar(INPUT_GET, 'bbpa_review_request');
    if ($action !== 'later' && $action !== 'dismiss') {
        return;
    }

    if (
        !function_exists('bbpa_validate_admin_action_nonce_from_request')
        || !bbpa_validate_admin_action_nonce_from_request()
        || !function_exists('bbpa_current_user_can_access_panel')
        || !bbpa_current_user_can_access_panel('settings')
    ) {
        return;
    }

    bbpa_apply_review_request_action($action, get_current_user_id());

    $page = function_exists('bbpa_get_requested_admin_page_slug') ? bbpa_get_requested_admin_page_slug() : '';
    wp_safe_redirect(add_query_arg('page', $page !== '' ? $page : BBPA_SLUG, admin_url('admin.php')));
    exit;
}

/**
 * Print the review request notice.
 *
 * Hooked on `admin_notices`.
 */
function bbpa_render_review_request_notice(): void
{
    if (!bbpa_should_render_review_request()) {
        return;
    }

    printf(
        '<div class="notice notice-info bbpa-review-request-notice"><p>%1$s</p>'
        . '<p style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;">'
        . '<a class="button button-primary" href="%2$s" target="_blank" rel="noopener noreferrer">%3$s</a>'
        . '<a class="button" href="%4$s">%5$s</a>'
        . '<a href="%6$s">%7$s</a></p></div>',
        esc_html__('Thank you for using BimBeau Privacy Analytics. If it is useful to you, a short review on WordPress.org helps other site owners find it.', 'bimbeau-privacy-analytics'),
        esc_url(bbpa_get_review_request_url()),
        esc_html__('Leave a review', 'bimbeau-privacy-analytics'),
        esc_url(bbpa_get_review_request_action_url('later')),
        esc_html__('Remind me later', 'bimbeau-privacy-analytics'),
        esc_url(bbpa_get_review_request_action_url('dismiss')),
        esc_html__('Do not show again', 'bimbeau-privacy-analytics')
    );
}
