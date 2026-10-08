<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Admin hooks for BimBeau Privacy Analytics.
 */

/**
 * Get the BimBeau Privacy Analytics SVG icon mask for the WordPress admin menu.
 */
function bbpa_get_admin_menu_icon_mask(): string
{
    return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1500"><rect class="cls-1" x="275.34" y="190.28" width="160.36" height="320.72" transform="translate(854.86 347.19) rotate(135)"/><rect class="cls-1" x="1069.09" y="984.02" width="160.36" height="320.72" transform="translate(2771.13 1140.93) rotate(135)"/><path class="cls-1" d="M932.9,567.01c-96.81-96.81-253.78-96.81-350.59,0s-96.81,253.78,0,350.59c96.81,96.81,253.78,96.81,350.59,0s96.81-253.78,0-350.59ZM706.12,793.8c-28.44-28.44-28.44-74.54,0-102.98,28.44-28.44,74.54-28.44,102.98,0,28.44,28.44,28.44,74.54,0,102.98s-74.54,28.44-102.98,0Z"/><rect class="cls-1" x="982.01" y="154.21" width="160.36" height="567.01" transform="translate(620.62 -622.88) rotate(45)"/><rect class="cls-1" x="358.35" y="777.87" width="160.36" height="567.01" transform="translate(878.95 .78) rotate(45)"/></svg>';
}

/**
 * Get the BimBeau Privacy Analytics SVG icon data URI used by the admin menu mask.
 */
function bbpa_get_admin_menu_icon_mask_data_url(): string
{
    return 'data:image/svg+xml;base64,' . base64_encode(bbpa_get_admin_menu_icon_mask());
}

/**
 * Add admin menu icon mask styles for BimBeau Privacy Analytics.
 */
function bbpa_add_admin_menu_icon_styles(): void
{
    $icon_mask_data_url = bbpa_get_admin_menu_icon_mask_data_url();
    $icon_mask_data_url = esc_url($icon_mask_data_url, array_merge(wp_allowed_protocols(), array('data')));
    $menu_selector = '#adminmenu .toplevel_page_' . BBPA_SLUG . ' .wp-menu-image:before';
    $inline_css = $menu_selector
        . '{content:"";-webkit-mask-image:url("' . $icon_mask_data_url . '");mask-image:url("' . $icon_mask_data_url . '");'
        . '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;'
        . '-webkit-mask-size:contain;mask-size:contain;background-color:currentColor;display:block;width:20px;height:20px;margin:0 auto;}';

    wp_register_style('bbpa-admin-menu-icon', false, array(), BBPA_VERSION);
    wp_enqueue_style('bbpa-admin-menu-icon');
    wp_add_inline_style('bbpa-admin-menu-icon', $inline_css);

}

/**
 * Register the BimBeau Privacy Analytics admin menu page.
 */
function bbpa_register_admin_menu(): void
{
    $panels = bbpa_get_admin_panels();
    if (empty($panels)) {
        return;
    }

    $menu_slug = BBPA_SLUG;
    $menu_label = bbpa_get_plugin_label();

    $top_panel = $panels[0];

    $menu_hook = add_menu_page(
        $menu_label,
        $menu_label,
        bbpa_get_panel_capability('dashboard'),
        $menu_slug,
        'bbpa_render_admin_page',
        'none',
        30
    );

    $panel_pages = [];
    $panel_pages[$menu_slug] = $top_panel['name'] ?? 'dashboard';

    $submenu_hooks = [];
    foreach ($panels as $panel) {
        $panel_name = $panel['name'] ?? '';
        $panel_title = $panel['title'] ?? $panel_name;
        if ($panel_name === '') {
            continue;
        }

        if ($panel_name === 'realtime') {
            $panel_title = bbpa_get_realtime_menu_title($panel_title);
        }

        $panel_slug = $panel_name === $panel_pages[$menu_slug] ? $menu_slug : $menu_slug . '-' . $panel_name;
        $panel_pages[$panel_slug] = $panel_name;

        $submenu_hooks[] = add_submenu_page(
            $menu_slug,
            $panel_title,
            $panel_title,
            bbpa_get_panel_capability($panel_name),
            $panel_slug,
            'bbpa_render_admin_page'
        );
    }

    $bbpa_admin_pages = array_merge([$menu_hook], $submenu_hooks);
    $bbpa_admin_panel_map = $panel_pages;

    $GLOBALS['bbpa_admin_pages'] = $bbpa_admin_pages;
    $GLOBALS['bbpa_admin_panel_map'] = $bbpa_admin_panel_map;
}

/**
 * Build the admin submenu label for the realtime panel with active visitor badge.
 */
function bbpa_get_realtime_menu_title(string $panel_title): string
{
    // The badge is only useful to users who can open the realtime panel; skip
    // reading the realtime buffer for everyone else.
    if (!bbpa_current_user_can_access_panel('realtime')) {
        return $panel_title;
    }

    $active_visitors = bbpa_get_cached_realtime_active_visitors_count();
    if ($active_visitors < 1) {
        return $panel_title;
    }

    $count = number_format_i18n($active_visitors);
    $screen_reader_text = sprintf(
        /* translators: %s: Number of visitors currently active on the site. */
        _n('%s active visitor', '%s active visitors', $active_visitors, 'bimbeau-privacy-analytics'),
        $count
    );
    $badge = sprintf(
        '<span class="update-plugins count-%1$d"><span class="bbpa-menu-count" aria-hidden="true">%2$s</span><span class="screen-reader-text">%3$s</span></span>',
        $active_visitors,
        esc_html($count),
        esc_html($screen_reader_text)
    );

    return sprintf(
        '%1$s %2$s',
        esc_html($panel_title),
        $badge
    );
}

/**
 * Count active realtime visitors from the in-memory hit window.
 *
 * Uses the same identity rules as the realtime panel: rows without a visitor
 * id, visitor bucket or visit id (essential "base" rows) are not counted.
 */
function bbpa_get_realtime_active_visitors_count(): int
{
    $window_seconds = bbpa_get_visit_identifier_window_seconds();
    $now = (int) current_time('timestamp', true);
    $window_start = max(0, $now - $window_seconds);

    $realtime_rows = function_exists('bbpa_get_realtime_log_rows')
        ? bbpa_get_realtime_log_rows($window_start)
        : get_option('bbpa_realtime_visitors', []);
    if (!is_array($realtime_rows)) {
        $realtime_rows = [];
    }

    $active_visitor_keys = [];
    foreach ($realtime_rows as $row) {
        if (is_string($row)) {
            $decoded_row = json_decode($row, true);
            if (!is_array($decoded_row)) {
                continue;
            }

            $row = $decoded_row;
        }

        if (!is_array($row) || bbpa_is_bot_realtime_row($row)) {
            continue;
        }

        $timestamp = bbpa_normalize_realtime_row_timestamp($row);
        if ($timestamp <= 0 || $timestamp < $window_start || $timestamp > $now) {
            continue;
        }

        $active_visitor_key = bbpa_resolve_realtime_visitor_key($row);
        if ($active_visitor_key === '') {
            continue;
        }

        $active_visitor_keys[$active_visitor_key] = true;
    }

    return count($active_visitor_keys);
}

/**
 * Return the realtime menu badge count from a short-lived cache.
 *
 * The admin menu is built on every wp-admin screen, so the realtime buffer is
 * read at most once per cache lifetime instead of on each page load.
 */
function bbpa_get_cached_realtime_active_visitors_count(): int
{
    $cache_key = 'bbpa_realtime_menu_badge_count';
    $cached = get_transient($cache_key);
    if ($cached !== false && is_numeric($cached)) {
        return max(0, (int) $cached);
    }

    $count = bbpa_get_realtime_active_visitors_count();
    set_transient($cache_key, $count, 30);

    return $count;
}

/**
 * Resolve the identity used to count a realtime row as one active visitor.
 *
 * Mirrors the realtime panel preference order: visitor id, visitor bucket, then
 * visit id. Returns an empty string for rows without any identity.
 *
 * @param array<string, mixed> $row Realtime visitor row.
 */
function bbpa_resolve_realtime_visitor_key(array $row): string
{
    $identity_fields = [
        'visitor_id' => 'visitor:',
        'visitor_bucket' => 'bucket:',
        'visit_id' => 'visit:',
    ];

    foreach ($identity_fields as $field => $prefix) {
        $value = isset($row[$field]) && is_scalar($row[$field])
            ? sanitize_text_field((string) $row[$field])
            : '';
        if ($value !== '') {
            return $prefix . $value;
        }
    }

    return '';
}

/**
 * Tell whether a realtime or raw log row was recorded for a bot.
 *
 * Bot hits keep a visitor row but stay out of visitor totals (see bbpa_is_bot_user_agent()), so the realtime
 * counter, its rows and the menu badge skip them, like the dashboard visitor total.
 *
 * @param array<string, mixed> $row Realtime visitor row or raw log row.
 */
function bbpa_is_bot_realtime_row(array $row): bool
{
    $device_class = isset($row['device_class']) && is_scalar($row['device_class'])
        ? strtolower(trim((string) $row['device_class']))
        : '';

    return $device_class === 'bot';
}


/**
 * Normalize realtime visitor row timestamps across legacy/raw formats.
 */
function bbpa_normalize_realtime_row_timestamp(array $row): int
{
    $raw_timestamp = 0;
    if (isset($row['timestamp_bucket'])) {
        $raw_timestamp = $row['timestamp_bucket'];
    } elseif (isset($row['timestamp'])) {
        $raw_timestamp = $row['timestamp'];
    } elseif (isset($row['last_seen'])) {
        $raw_timestamp = $row['last_seen'];
    } elseif (isset($row['last_seen_at'])) {
        $raw_timestamp = $row['last_seen_at'];
    }

    if (is_string($raw_timestamp)) {
        $raw_timestamp = trim($raw_timestamp);
        if ($raw_timestamp == '') {
            return 0;
        }

        if (!preg_match('/^\d+$/', $raw_timestamp)) {
            $parsed_timestamp = strtotime($raw_timestamp);
            if ($parsed_timestamp === false) {
                return 0;
            }

            $raw_timestamp = $parsed_timestamp;
        }
    }

    $timestamp = (int) $raw_timestamp;
    if ($timestamp <= 0) {
        return 0;
    }

    if ($timestamp > 9999999999) {
        $timestamp = (int) floor($timestamp / 1000);
    }

    return $timestamp;
}


/**
 * Add the Freemius pricing submenu item under BimBeau Privacy Analytics in Free environments.
 *
 * The page uses the `pricing` panel capability (`manage_options` by default), the
 * capability Freemius requires for the same page slug, so users who cannot open
 * the pricing page never see a menu entry that leads to an access error.
 */
function bbpa_register_free_upgrade_submenu(): void
{
    if (!function_exists('bbpa_fs')) {
        return;
    }

    $hook_suffix = add_submenu_page(
        BBPA_SLUG,
        __('Upgrade to Pro', 'bimbeau-privacy-analytics'),
        bbpa_get_upgrade_menu_title(),
        bbpa_get_panel_capability('pricing'),
        BBPA_SLUG . '-pricing',
        'bbpa_render_freemius_pricing_page'
    );

    if (is_string($hook_suffix) && $hook_suffix !== '') {
        add_action('load-' . $hook_suffix, 'bbpa_prevent_duplicate_freemius_pricing_render');
    }
}

/**
 * Keep a single renderer on the pricing page.
 *
 * Freemius registers its own pricing page under the same parent and slug when it
 * shows the pricing menu item, which attaches a second render callback to the
 * same page hook. The plugin renderer already delegates to Freemius, so the
 * Freemius callback is detached before the page is rendered.
 *
 * @param string $page_hook Page hook name. Defaults to the hook of the current `load-{$page_hook}` action.
 */
function bbpa_prevent_duplicate_freemius_pricing_render(string $page_hook = ''): void
{
    if ($page_hook === '') {
        $current_action = (string) current_action();
        if (strpos($current_action, 'load-') !== 0) {
            return;
        }

        $page_hook = substr($current_action, strlen('load-'));
    }

    if ($page_hook === '' || false === has_action($page_hook, 'bbpa_render_freemius_pricing_page')) {
        return;
    }

    $freemius = function_exists('bbpa_fs') ? bbpa_fs() : null;
    if (!is_object($freemius)) {
        return;
    }

    $freemius_callback = [$freemius, '_pricing_page_render'];
    $priority = has_action($page_hook, $freemius_callback);
    if (false !== $priority) {
        remove_action($page_hook, $freemius_callback, $priority);
    }
}

/**
 * Build admin submenu label for the upgrade entry.
 */
function bbpa_get_upgrade_menu_title(): string
{
    return esc_html__('Upgrade to Pro', 'bimbeau-privacy-analytics');
}

/**
 * Check whether a plugin submenu item is the pricing/upgrade entry.
 *
 * Entries are identified by their page slug and by the CSS classes Freemius adds
 * to its own submenu titles, never by translated label text.
 *
 * @param array<int, mixed> $submenu_item WordPress submenu item.
 */
function bbpa_submenu_item_is_upgrade_entry(array $submenu_item): bool
{
    $upgrade_slug = BBPA_SLUG . '-pricing';
    $submenu_slug = isset($submenu_item[2]) && is_scalar($submenu_item[2]) ? (string) $submenu_item[2] : '';
    if ($submenu_slug === $upgrade_slug || strpos($submenu_slug, $upgrade_slug . '&') === 0) {
        return true;
    }

    $markup = strtolower(
        (isset($submenu_item[0]) && is_scalar($submenu_item[0]) ? (string) $submenu_item[0] : '')
        . ' '
        . (isset($submenu_item[4]) && is_scalar($submenu_item[4]) ? (string) $submenu_item[4] : '')
    );

    if (strpos($markup, 'fs-submenu-item-pricing') !== false || strpos($markup, 'fs-upgrade') !== false) {
        return true;
    }

    return strpos($markup, 'fs-submenu-item') !== false
        && preg_match('/\b(?:pricing|upgrade-mode)\b/', $markup) === 1;
}

/**
 * Normalize Free submenu upgrade entries so only one pricing item remains.
 *
 * The remaining pricing item is placed last, after the Contact item, which is the
 * order bbpa_place_free_upgrade_submenu_last() used to restore afterwards.
 */
function bbpa_normalize_free_upgrade_submenu(): void
{
    $submenu_root = BBPA_SLUG;
    $upgrade_slug = BBPA_SLUG . '-pricing';

    if (!isset($GLOBALS['submenu'][$submenu_root]) || !is_array($GLOBALS['submenu'][$submenu_root])) {
        return;
    }

    $upgrade_item = null;
    $clean_submenu = [];

    foreach ($GLOBALS['submenu'][$submenu_root] as $submenu_item) {
        if (!is_array($submenu_item)) {
            continue;
        }

        $submenu_slug = isset($submenu_item[2]) ? (string) $submenu_item[2] : '';

        if ($submenu_slug === $upgrade_slug) {
            if (null === $upgrade_item) {
                $submenu_item[0] = bbpa_get_upgrade_menu_title();
                if (isset($submenu_item[4])) {
                    $submenu_item[4] = '';
                }
                $upgrade_item = $submenu_item;
            }

            continue;
        }

        if (bbpa_submenu_item_is_upgrade_entry($submenu_item)) {
            continue;
        }

        $clean_submenu[] = $submenu_item;
    }

    if (null === $upgrade_item) {
        $upgrade_item = [
            bbpa_get_upgrade_menu_title(),
            bbpa_get_panel_capability('pricing'),
            $upgrade_slug,
            wp_specialchars_decode(bbpa_get_upgrade_menu_title(), ENT_QUOTES),
        ];
    }

    $contact_slug = BBPA_SLUG . '-contact';
    $contact_item = null;
    $ordered_submenu = [];

    foreach ($clean_submenu as $submenu_item) {
        $submenu_slug = isset($submenu_item[2]) ? (string) $submenu_item[2] : '';
        if ($submenu_slug === $contact_slug && null === $contact_item) {
            $contact_item = $submenu_item;
            continue;
        }

        $ordered_submenu[] = $submenu_item;
    }

    if (null !== $contact_item) {
        $ordered_submenu[] = $contact_item;
    }

    $ordered_submenu[] = $upgrade_item;

    $GLOBALS['submenu'][$submenu_root] = array_values($ordered_submenu);
}

/**
 * Delegate rendering of the pricing page to Freemius.
 */
function bbpa_render_freemius_pricing_page(): void
{
    $freemius = bbpa_fs();
    if (!is_object($freemius) || !is_callable([$freemius, '_pricing_page_render'])) {
        return;
    }

    ?>
    <div id="bbpa-freemius-pricing-page" class="bbpa-freemius-pricing-page">
        <?php call_user_func([$freemius, '_pricing_page_render']); ?>
    </div>
    <?php
}

/**
 * Add the Freemius Contact submenu item under BimBeau Privacy Analytics.
 */
function bbpa_register_contact_submenu(): void
{
    $contact_slug = BBPA_SLUG . '-contact';
    $existing_submenus = $GLOBALS['submenu'][BBPA_SLUG] ?? [];
    foreach ($existing_submenus as $submenu_item) {
        if (isset($submenu_item[2]) && $submenu_item[2] === $contact_slug) {
            return;
        }
    }

    add_submenu_page(
        BBPA_SLUG,
        __('Contact', 'bimbeau-privacy-analytics'),
        __('Contact', 'bimbeau-privacy-analytics'),
        bbpa_get_panel_capability('contact'),
        $contact_slug,
        'bbpa_render_freemius_contact_page'
    );
}

/**
 * Backward-compatible wrapper for the previous Pro-only contact submenu registration name.
 *
 * @deprecated 8.45.214 Use bbpa_register_contact_submenu().
 */
function bbpa_register_pro_contact_submenu(): void
{
    _deprecated_function(__FUNCTION__, '8.45.214', 'bbpa_register_contact_submenu()');

    bbpa_register_contact_submenu();
}

/**
 * Delegate rendering of the Contact page to Freemius.
 */
function bbpa_render_freemius_contact_page(): void
{
    if (!function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius) || !is_callable([$freemius, '_contact_page_render'])) {
        return;
    }

    call_user_func([$freemius, '_contact_page_render']);
}

/**
 * Register the Freemius Account page for the roles delegated through `account_access_roles`.
 *
 * Freemius registers its Account page with the `manage_options` capability: for other users
 * WordPress only records the page as forbidden in `$_wp_submenu_nopriv`. When Freemius tried
 * to add the entry for the current user (the forbidden flag exists under the plugin menu) and
 * the user holds the `account` panel capability, the flag is removed and the same page slug is
 * registered with that capability and rendered by Freemius. Users with `manage_options` keep
 * the entry registered by Freemius, and nothing is registered when Freemius did not add it.
 *
 * Runs on `admin_menu` after Freemius (priority 999999999).
 */
function bbpa_register_delegated_account_submenu(): void
{
    global $_wp_submenu_nopriv;

    if (bbpa_current_user_can_manage_account_access()) {
        return;
    }

    $account_slug = BBPA_SLUG . '-account';
    if (!isset($_wp_submenu_nopriv[BBPA_SLUG][$account_slug])) {
        return;
    }

    if (!bbpa_current_user_can_access_panel('account') || !function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (
        !is_object($freemius)
        || !is_callable([$freemius, '_account_page_render'])
        || !is_callable([$freemius, '_account_page_load'])
        || !is_callable([$freemius, 'get_text_inline'])
    ) {
        return;
    }

    $label = wp_strip_all_tags((string) call_user_func([$freemius, 'get_text_inline'], 'Account', 'account'));
    if ($label === '') {
        return;
    }

    unset($_wp_submenu_nopriv[BBPA_SLUG][$account_slug]);

    $hook_suffix = add_submenu_page(
        BBPA_SLUG,
        $label,
        esc_html($label),
        bbpa_get_panel_capability('account'),
        $account_slug,
        'bbpa_render_freemius_account_page'
    );

    if (is_string($hook_suffix) && $hook_suffix !== '') {
        add_action('load-' . $hook_suffix, 'bbpa_load_freemius_account_page');
    }
}

/**
 * Prepare the delegated Account page: Freemius resources and the read-only notice.
 */
function bbpa_load_freemius_account_page(): void
{
    if (function_exists('bbpa_fs')) {
        $freemius = bbpa_fs();
        if (is_object($freemius) && is_callable([$freemius, '_account_page_load'])) {
            call_user_func([$freemius, '_account_page_load']);
        }
    }

    if (!bbpa_current_user_can_manage_account_access()) {
        add_action('admin_notices', 'bbpa_render_account_read_only_notice');
    }
}

/**
 * Delegate rendering of the Account page to Freemius.
 */
function bbpa_render_freemius_account_page(): void
{
    if (!function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius) || !is_callable([$freemius, '_account_page_render'])) {
        return;
    }

    call_user_func([$freemius, '_account_page_render']);
}

/**
 * Print the read-only notice of the Account page for delegated users.
 */
function bbpa_render_account_read_only_notice(): void
{
    if (bbpa_current_user_can_manage_account_access()) {
        return;
    }

    printf(
        '<div class="notice notice-info bbpa-account-read-only-notice"><p>%s</p></div>',
        esc_html__('You are viewing this page in read-only mode. Contact an administrator to change the license or billing.', 'bimbeau-privacy-analytics')
    );
}

/**
 * Hide the license key from users who cannot manage the license (Freemius `hide_license_key` filter).
 *
 * @param mixed $hide Value computed by Freemius or a previous callback.
 */
function bbpa_filter_freemius_hide_license_key($hide): bool
{
    return (bool) $hide || !bbpa_current_user_can_manage_account_access();
}

/**
 * Hide billing and invoices from users who cannot manage the license (Freemius
 * `hide_billing_and_payments_info` filter).
 *
 * @param mixed $hide Value computed by Freemius or a previous callback.
 */
function bbpa_filter_freemius_hide_billing_and_payments_info($hide): bool
{
    return (bool) $hide || !bbpa_current_user_can_manage_account_access();
}

/**
 * Return the secret values that the Account page must never show to delegated users.
 *
 * @return array<int, string> Site secret key, license key and Freemius user secret key, when known.
 */
function bbpa_get_freemius_account_secret_values(): array
{
    if (!function_exists('bbpa_fs')) {
        return [];
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius)) {
        return [];
    }

    $entities = [];
    foreach (['get_site', '_get_license', 'get_user'] as $method) {
        if (is_callable([$freemius, $method])) {
            $entities[] = call_user_func([$freemius, $method]);
        }
    }

    $secrets = [];
    foreach ($entities as $entity) {
        if (is_object($entity) && isset($entity->secret_key) && is_string($entity->secret_key)) {
            $secret = trim($entity->secret_key);
            // Short values cannot be told apart from ordinary page text.
            if (strlen($secret) >= 8) {
                $secrets[] = $secret;
            }
        }
    }

    return array_values(array_unique($secrets));
}

/**
 * Remove the site key rows of the Freemius Account page for delegated users (Freemius
 * `templates/account.php` filter).
 *
 * The public key and secret key rows are consecutive table rows (`fs-field-site_public_key`,
 * `fs-field-site_secret_key`); removing both keeps the row striping. When a secret value is
 * still present after the removal (a changed Freemius template), the account details are
 * replaced with a short message instead of being shown.
 *
 * @param mixed $html Account page markup rendered by Freemius.
 * @return mixed Markup without the site key rows for delegated users.
 */
function bbpa_filter_freemius_account_template($html)
{
    if (!is_string($html) || bbpa_current_user_can_manage_account_access()) {
        return $html;
    }

    $filtered = preg_replace(
        '#<tr\s+class="fs-field-(?:site_public_key|site_secret_key)(?:\s[^"]*)?"\s*>.*?</tr>#s',
        '',
        $html
    );

    $is_safe = is_string($filtered);
    if ($is_safe) {
        foreach (bbpa_get_freemius_account_secret_values() as $secret) {
            if (strpos($filtered, $secret) !== false) {
                $is_safe = false;
                break;
            }
        }
    }

    if (!$is_safe) {
        return sprintf(
            '<div class="wrap"><div class="notice notice-warning inline"><p>%s</p></div></div>',
            esc_html__('The account details cannot be displayed in read-only mode. Contact an administrator.', 'bimbeau-privacy-analytics')
        );
    }

    return $filtered;
}

/**
 * Attach the Account page filters that protect the license details from delegated users.
 */
function bbpa_register_freemius_account_customizations(): void
{
    static $registered = false;

    if ($registered || !function_exists('bbpa_fs')) {
        return;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius) || !method_exists($freemius, 'add_filter')) {
        return;
    }

    $freemius->add_filter('hide_license_key', 'bbpa_filter_freemius_hide_license_key');
    $freemius->add_filter('hide_billing_and_payments_info', 'bbpa_filter_freemius_hide_billing_and_payments_info');
    $freemius->add_filter('templates/account.php', 'bbpa_filter_freemius_account_template');

    $registered = true;
}


/**
 * Normalize an admin app root id for DOM lookup.
 */
function bbpa_normalize_admin_root_id(string $root_id): string
{
    $root_id = sanitize_key($root_id);

    return preg_match('/^bbpa-[a-z0-9-]+$/', $root_id) === 1 ? $root_id : 'bbpa-admin';
}

/**
 * Render the admin root element.
 */
function bbpa_render_admin_page(): void
{
    $neutral_runtime_message = __('Base tracking remains active. Enriched tracking is declarable through an external CMP. Data granularity depends on collected signals.', 'bimbeau-privacy-analytics');
    $loading_message = __('Loading, please wait…', 'bimbeau-privacy-analytics');

    ?>
    <div class="wrap">
        <div id="bbpa-admin">
            <div class="bbpa-admin-boot-fallback" role="status" aria-live="polite" aria-busy="true">
                <span class="bbpa-admin-boot-fallback__spinner" aria-hidden="true"></span>
                <p class="bbpa-admin-boot-fallback__label"><?php echo esc_html($loading_message); ?></p>
            </div>
        </div>
        <noscript>
            <div class="notice notice-info inline">
                <p><strong><?php echo esc_html__('Current runtime state', 'bimbeau-privacy-analytics'); ?></strong></p>
                <p><?php echo esc_html($neutral_runtime_message); ?></p>
                <p><?php echo esc_html__('Technical diagnostics are indicative and remain limited to script attributes and CMP markers.', 'bimbeau-privacy-analytics'); ?></p>
            </div>
        </noscript>
    </div>
    <?php
}

/**
 * Get CSS variable values from the current admin color scheme and BimBeau Privacy Analytics accent.
 */
function bbpa_get_admin_color_scheme_variables(): array
{
    global $_wp_admin_css_colors;

    $scheme = get_user_option('admin_color', get_current_user_id());
    $scheme = is_string($scheme) && $scheme !== '' ? $scheme : 'fresh';

    $palette = [];
    if (isset($_wp_admin_css_colors[$scheme]) && !empty($_wp_admin_css_colors[$scheme]->colors)) {
        $palette = (array) $_wp_admin_css_colors[$scheme]->colors;
    } elseif (isset($_wp_admin_css_colors['fresh']) && !empty($_wp_admin_css_colors['fresh']->colors)) {
        $palette = (array) $_wp_admin_css_colors['fresh']->colors;
    }

    $palette = array_values($palette);
    $palette = array_pad($palette, 5, null);

    $defaults = [
        'color_1' => '#1d2327',
        'color_2' => '#2c3338',
        'color_3' => 'rgb(56, 88, 233)',
        'color_4' => '#72aee6',
        'color_5' => '#f6f7f7',
    ];

    $normalize_color = static function ($color, string $fallback): string {
        if (!is_string($color)) {
            return $fallback;
        }

        $color = sanitize_hex_color($color);
        return $color ?: $fallback;
    };

    return [
        '--color-1' => $normalize_color($palette[0], $defaults['color_1']),
        '--color-2' => $normalize_color($palette[1], $defaults['color_2']),
        '--color-3' => $defaults['color_3'],
        '--color-4' => $normalize_color($palette[3], $defaults['color_4']),
        '--color-5' => $normalize_color($palette[4], $defaults['color_5']),
    ];
}

/**
 * Inject admin color scheme variables for the BimBeau Privacy Analytics admin UI.
 */
function bbpa_add_admin_color_scheme_styles(): void
{
    $variables = bbpa_get_admin_color_scheme_variables();
    $declarations = [];

    foreach ($variables as $name => $value) {
        $declarations[] = $name . ': ' . $value;
    }

    if (empty($declarations)) {
        return;
    }

    $inline_css = 'body.wp-admin #bbpa-admin, body.bbpa-admin-app-shell #bbpa-admin-app{' . implode('; ', $declarations) . ';}';

    // The flag assets base URL variable is added once by bbpa_enqueue_admin_app_assets().
    if (wp_style_is('bbpa-admin', 'enqueued')) {
        wp_add_inline_style('bbpa-admin', $inline_css);
        return;
    }

    if (wp_style_is('bbpa-admin-extras', 'enqueued')) {
        wp_add_inline_style('bbpa-admin-extras', $inline_css);
    }
}

/**
 * Determine if the current admin request targets a BimBeau Privacy Analytics screen.
 */
function bbpa_is_plugin_admin_page(): bool
{
    if (!is_admin()) {
        return false;
    }

    $page = bbpa_get_requested_admin_page_slug();
    if ($page === '') {
        return false;
    }

    return $page === BBPA_SLUG || str_starts_with($page, BBPA_SLUG . '-');
}



/**
 * Parse current BimBeau Privacy Analytics admin page slug from the request.
 */
function bbpa_get_requested_admin_page_slug(): string
{
    $page = bbpa_get_admin_request_scalar(INPUT_GET, 'page');
    if ($page === '') {
        return '';
    }

    $normalized_page = (string) strtok($page, '&');
    return sanitize_key($normalized_page);
}

/**
 * Read a scalar value from GET or POST request data.
 */
function bbpa_get_admin_request_scalar(int $input_type, string $key): string
{
    $value = filter_input($input_type, $key, FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    if (!is_scalar($value) || $value === '') {
        $source = $input_type === INPUT_POST ? $_POST : $_GET;
        // This helper only reads and sanitizes request values; callers enforce
        // nonces before action handling.
        // phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.NonceVerification.Recommended
        $value = isset($source[$key]) && is_scalar($source[$key]) ? $source[$key] : '';
    }

    return is_scalar($value) ? sanitize_text_field(wp_unslash((string) $value)) : '';
}

/**
 * Validate BimBeau Privacy Analytics admin action nonce from request parameters.
 */
function bbpa_validate_admin_action_nonce_from_request(): bool
{
    $nonce = bbpa_get_admin_request_scalar(INPUT_GET, 'bbpa_nonce');
    if ($nonce === '') {
        $nonce = bbpa_get_admin_request_scalar(INPUT_GET, '_wpnonce');
    }
    if ($nonce === '') {
        $nonce = bbpa_get_admin_request_scalar(INPUT_POST, 'bbpa_nonce');
    }
    if ($nonce === '') {
        $nonce = bbpa_get_admin_request_scalar(INPUT_POST, '_wpnonce');
    }

    if ($nonce === '') {
        return false;
    }

    return false !== wp_verify_nonce($nonce, 'bbpa_admin_action');
}

/**
 * Redirect disabled BimBeau Privacy Analytics panel pages to dashboard.
 */
function bbpa_redirect_disabled_admin_page(): void
{
    if (!is_admin()) {
        return;
    }

    $page = bbpa_get_requested_admin_page_slug();
    if ($page === '') {
        return;
    }

    if ($page !== BBPA_SLUG && !str_starts_with($page, BBPA_SLUG . '-')) {
        return;
    }

    $freemius_page_slugs = [
        BBPA_SLUG . '-account',
        BBPA_SLUG . '-contact',
        BBPA_SLUG . '-pricing',
        BBPA_SLUG . '-addons',
    ];
    if (in_array($page, $freemius_page_slugs, true)) {
        return;
    }

    if (function_exists('bbpa_fs')) {
        $freemius = bbpa_fs();
        if (is_object($freemius) && is_callable([$freemius, 'is_admin_page'])) {
            $freemius_pages = ['account', 'contact', 'pricing', 'addons'];
            foreach ($freemius_pages as $freemius_page) {
                if (call_user_func([$freemius, 'is_admin_page'], $freemius_page)) {
                    return;
                }
            }
        }
    }

    $normalized_page = $page;

    $requested_panel = '';
    $panel_map = isset($GLOBALS['bbpa_admin_panel_map']) && is_array($GLOBALS['bbpa_admin_panel_map'])
        ? $GLOBALS['bbpa_admin_panel_map']
        : [];
    if (isset($panel_map[$normalized_page]) && is_string($panel_map[$normalized_page])) {
        $requested_panel = sanitize_key($panel_map[$normalized_page]);
    } elseif ($normalized_page === BBPA_SLUG) {
        $requested_panel = 'dashboard';
    } elseif (str_starts_with($normalized_page, BBPA_SLUG . '-')) {
        $requested_panel = sanitize_key(substr($normalized_page, strlen(BBPA_SLUG . '-')));
    }

    if ($requested_panel === '') {
        return;
    }

    $fallback_panel = bbpa_get_first_accessible_admin_panel_slug();

    $request_action_get = sanitize_key(bbpa_get_admin_request_scalar(INPUT_GET, 'action'));
    $request_action_post = sanitize_key(bbpa_get_admin_request_scalar(INPUT_POST, 'action'));
    $is_sensitive_action = $request_action_get !== '' || $request_action_post !== '';
    if ($is_sensitive_action && !bbpa_validate_admin_action_nonce_from_request()) {
        bbpa_safe_redirect_to_panel_slug($fallback_panel);
        return;
    }

    $panel_names = array_values(
        array_filter(
            array_map(
                static function (array $panel): string {
                    return isset($panel['name']) ? (string) $panel['name'] : '';
                },
                bbpa_get_admin_panels()
            )
        )
    );

    if (!in_array($requested_panel, $panel_names, true)) {
        bbpa_safe_redirect_to_panel_slug($fallback_panel);
        return;
    }

    $settings = bbpa_get_settings();
    $hidden_by_policy = bbpa_get_effective_hidden_panels($settings);
    $is_panel_disabled = $requested_panel !== 'dashboard'
        && $requested_panel !== 'settings'
        && in_array($requested_panel, $hidden_by_policy, true);

    if ($is_panel_disabled) {
        bbpa_safe_redirect_to_panel_slug($fallback_panel);
        return;
    }

    if (!bbpa_current_user_can_access_panel($requested_panel)) {
        bbpa_safe_redirect_to_panel_slug($fallback_panel);
        return;
    }
}

/**
 * Resolve the first BimBeau Privacy Analytics panel that the current user can access.
 */
function bbpa_get_first_accessible_admin_panel_slug(): string
{
    $panels = bbpa_get_admin_panels();
    foreach ($panels as $panel) {
        $panel_name = isset($panel['name']) ? (string) $panel['name'] : '';
        if ($panel_name === '') {
            continue;
        }

        if (!bbpa_current_user_can_access_panel($panel_name)) {
            continue;
        }

        if ($panel_name === 'dashboard') {
            return BBPA_SLUG;
        }

        return BBPA_SLUG . '-' . $panel_name;
    }

    return '';
}

/**
 * Redirect to a BimBeau Privacy Analytics panel slug when it differs from the current request.
 */
function bbpa_safe_redirect_to_panel_slug(string $target_page_slug): void
{
    if ($target_page_slug === '') {
        return;
    }

    $current_page = bbpa_get_requested_admin_page_slug();
    if ($current_page === $target_page_slug) {
        return;
    }

    if (wp_safe_redirect(admin_url('admin.php?page=' . $target_page_slug))) {
        exit;
    }
}

/**
 * Build a REST URL that uses the query-arg fallback format.
 */
function bbpa_build_query_rest_url(string $path = '', string $scheme = 'rest'): string
{
    $normalized_path = '/' . ltrim($path, '/');

    if ($normalized_path === '//') {
        $normalized_path = '/';
    }

    return add_query_arg('rest_route', $normalized_path, home_url('/', $scheme));
}

/**
 * Returns true when a REST base URL uses the ?rest_route= query fallback.
 */
function bbpa_is_query_rest_base(string $rest_url): bool
{
    return str_contains($rest_url, 'rest_route=');
}

/**
 * Build JavaScript REST config values compatible with URL() concatenation.
 *
 * @return array{rest_url:string,rest_namespace:string,rest_internal_namespace:string}
 */
function bbpa_get_js_rest_config(): array
{
    $rest_url = esc_url_raw(rest_url());
    $rest_namespace = BBPA_REST_NAMESPACE;
    $rest_internal_namespace = BBPA_REST_INTERNAL_NAMESPACE;

    if (!bbpa_is_query_rest_base($rest_url)) {
        return [
            'rest_url' => $rest_url,
            'rest_namespace' => $rest_namespace,
            'rest_internal_namespace' => $rest_internal_namespace,
        ];
    }

    return [
        'rest_url' => esc_url_raw(bbpa_build_query_rest_url('/')),
        'rest_namespace' => ltrim($rest_namespace, '/'),
        'rest_internal_namespace' => ltrim($rest_internal_namespace, '/'),
    ];
}

/**
 * Force query-arg REST URLs on BimBeau Privacy Analytics admin pages.
 */
function bbpa_filter_rest_url_for_admin_pages(string $url, string $path, ?int $blog_id = null, string $scheme = 'rest'): string
{
    unset($blog_id); // Filter callback parameter is intentionally unused.

    if (!bbpa_is_plugin_admin_page()) {
        return $url;
    }

    return bbpa_build_query_rest_url($path, $scheme);
}

/**
 * Enqueue the admin bundle and pass initialization data.
 */
function bbpa_enqueue_admin_assets(string $hook_suffix): void
{
    $registered_pages = $GLOBALS['bbpa_admin_pages'] ?? [];
    $current_page = bbpa_get_requested_admin_page_slug();
    if ($current_page === '') {
        $current_page = BBPA_SLUG;
    }
    $geolocation_page = BBPA_SLUG . '-geolocation';
    $is_geolocation_page = $current_page === $geolocation_page;

    if (!in_array($hook_suffix, $registered_pages, true) && !$is_geolocation_page) {
        return;
    }

    $panel_map = $GLOBALS['bbpa_admin_panel_map'] ?? [];
    $current_panel = $panel_map[$current_page] ?? 'dashboard';

    bbpa_enqueue_admin_app_assets($current_panel);
}

/**
 * Script dependencies of the admin bundle when no asset manifest ships with it.
 *
 * Distributed packages ship the bundle without its `*.asset.php` manifest, so this
 * list must include every WordPress script the bundle reads as an external
 * (see build/admin.asset.php), including the automatic JSX runtime.
 *
 * @return string[]
 */
function bbpa_get_admin_app_default_script_dependencies(): array
{
    return [
        'react',
        'react-dom',
        'react-jsx-runtime',
        'wp-components',
        'wp-element',
        'wp-i18n',
        'wp-primitives',
    ];
}

/**
 * Register a `react-jsx-runtime` fallback when WordPress does not provide it.
 *
 * WordPress core registers the `react-jsx-runtime` script (window.ReactJSXRuntime)
 * since 6.6. The admin bundle needs it and the plugin supports WordPress 6.4, so
 * older versions get a small shim built on the core `react` script. A handle
 * already registered by core or by another plugin is never replaced.
 */
function bbpa_register_react_jsx_runtime_fallback(): void
{
    if (wp_script_is('react-jsx-runtime', 'registered')) {
        return;
    }

    wp_register_script(
        'react-jsx-runtime',
        BBPA_URL . 'admin/js/react-jsx-runtime-shim.js',
        ['react'],
        BBPA_VERSION,
        true
    );
}

/**
 * Enqueue admin app bundle and pass runtime configuration.
 *
 * @param string $current_panel            Panel rendered by the current screen.
 * @param bool   $inject_localized_payload Whether the wp-admin `window.BBPAAdmin` payload is printed. A runtime that
 *                                         prints its own payload passes false, so the wp-admin payload is neither
 *                                         built nor printed next to it.
 */
function bbpa_enqueue_admin_app_assets(string $current_panel = 'dashboard', bool $inject_localized_payload = true): void
{
    $settings = bbpa_get_settings();
    $debug_enabled = function_exists('bbpa_is_debug_mode_enabled')
        ? bbpa_is_debug_mode_enabled()
        : !empty($settings['debug_enabled']);

    $root_id = bbpa_normalize_admin_root_id('bbpa-admin');
    $panels = bbpa_get_admin_panels();
    $panel_names = array_values(
        array_filter(
            array_map(
                static function (array $panel): string {
                    return isset($panel['name']) ? (string) $panel['name'] : '';
                },
                $panels
            )
        )
    );
    if (!in_array($current_panel, $panel_names, true)) {
        $current_panel = 'dashboard';
    }
    $asset_data = [
        'dependencies' => bbpa_get_admin_app_default_script_dependencies(),
        'version' => BBPA_VERSION,
    ];
    $admin_js_relative_path = 'assets/js/admin.js';
    $admin_js_candidates = [
        [
            'script_path' => 'assets/js/admin.js',
            'asset_path' => 'assets/js/admin.asset.php',
        ],
        [
            'script_path' => 'build/admin.js',
            'asset_path' => 'build/admin.asset.php',
        ],
    ];

    foreach ($admin_js_candidates as $candidate) {
        try {
            bbpa_safe_existing_file(BBPA_PATH, $candidate['script_path']);
            $admin_js_relative_path = $candidate['script_path'];

            try {
                $asset_file = bbpa_safe_existing_file(BBPA_PATH, $candidate['asset_path']);
                $candidate_asset_data = require $asset_file;
                if (is_array($candidate_asset_data)) {
                    $asset_data = $candidate_asset_data;
                }
            } catch (RuntimeException | InvalidArgumentException $exception) {
                // Use default asset metadata when the matching asset file is not available.
            }

            break;
        } catch (RuntimeException | InvalidArgumentException $exception) {
            continue;
        }
    }

    $admin_js_relative_path = apply_filters(
        'bbpa_admin_app_script_relative_path',
        $admin_js_relative_path,
        [
            'current_panel' => $current_panel,
        ]
    );
    if (!is_string($admin_js_relative_path) || $admin_js_relative_path === '') {
        $admin_js_relative_path = 'assets/js/admin.js';
    }

    $asset_data['dependencies'] = isset($asset_data['dependencies']) && is_array($asset_data['dependencies'])
        ? $asset_data['dependencies']
        : [];
    $asset_data['version'] = bbpa_normalize_asset_version($asset_data['version'] ?? '');
    $admin_js_url = BBPA_URL . $admin_js_relative_path;

    bbpa_register_react_jsx_runtime_fallback();

    wp_register_script(
        'bbpa-admin',
        $admin_js_url,
        $asset_data['dependencies'],
        $asset_data['version'],
        true
    );
    wp_enqueue_script('bbpa-admin');

    wp_register_style(
        'bbpa-admin-boot-fallback',
        BBPA_URL . 'admin/css/boot-fallback.css',
        [],
        BBPA_VERSION
    );
    wp_enqueue_style('bbpa-admin-boot-fallback');
    wp_register_script(
        'bbpa-admin-boot-fallback',
        BBPA_URL . 'admin/js/boot-fallback.js',
        ['bbpa-admin'],
        BBPA_VERSION,
        true
    );
    wp_localize_script(
        'bbpa-admin-boot-fallback',
        'BBPAAdminBootFallback',
        [
            'rootId' => $root_id,
        ]
    );
    wp_enqueue_script('bbpa-admin-boot-fallback');

    if (function_exists('wp_set_script_translations')) {
        wp_set_script_translations(
            'bbpa-admin',
            'bimbeau-privacy-analytics',
            BBPA_PATH . 'languages/'
        );
    }

    $admin_extra_css_candidates = [
        ['path' => 'assets/css/style-build-admin.css', 'url' => BBPA_URL . 'assets/css/style-build-admin.css'],
        ['path' => 'assets/css/style-style-admin.css', 'url' => BBPA_URL . 'assets/css/style-style-admin.css'],
        ['path' => 'build/style-style-admin.css', 'url' => BBPA_URL . 'build/style-style-admin.css'],
    ];
    $admin_extra_css_candidates = apply_filters(
        'bbpa_admin_extra_css_candidates',
        $admin_extra_css_candidates
    );
    $admin_extra_css_url = '';
    $admin_extra_css_path = '';

    foreach ($admin_extra_css_candidates as $candidate) {
        try {
            bbpa_safe_existing_file(BBPA_PATH, $candidate['path']);
            $admin_extra_css_url = $candidate['url'];
            $admin_extra_css_path = $candidate['path'];
            break;
        } catch (RuntimeException | InvalidArgumentException $exception) {
            continue;
        }
    }



    $admin_css_dependencies = [];

    if ($admin_extra_css_url !== '') {
        $admin_css_dependencies[] = 'bbpa-admin-extras';

        wp_enqueue_style(
            'bbpa-admin-extras',
            $admin_extra_css_url,
            [],
            bbpa_get_asset_file_version($admin_extra_css_path)
        );
        wp_style_add_data('bbpa-admin-extras', 'rtl', 'replace');
    }

    $admin_css_candidates = [
        ['path' => 'assets/css/style-admin.css', 'url' => BBPA_URL . 'assets/css/style-admin.css'],
        ['path' => 'build/style-admin.css', 'url' => BBPA_URL . 'build/style-admin.css'],
    ];
    $admin_css_candidates = apply_filters(
        'bbpa_admin_css_candidates',
        $admin_css_candidates
    );
    $admin_css_url = '';
    $admin_css_path = '';

    foreach ($admin_css_candidates as $candidate) {
        try {
            bbpa_safe_existing_file(BBPA_PATH, $candidate['path']);
            $admin_css_url = $candidate['url'];
            $admin_css_path = $candidate['path'];
            break;
        } catch (RuntimeException | InvalidArgumentException $exception) {
            continue;
        }
    }

    if ($admin_css_url !== '' && function_exists('set_url_scheme')) {
        $admin_css_url = set_url_scheme($admin_css_url);
    }


    if ($admin_css_url !== '') {
        wp_enqueue_style(
            'bbpa-admin',
            $admin_css_url,
            $admin_css_dependencies,
            bbpa_get_asset_file_version($admin_css_path)
        );
    }

    if (wp_style_is('bbpa-admin', 'enqueued')) {
        $flag_assets_base_url = trailingslashit(BBPA_URL . 'assets/images/flags/4x3');
        $flag_assets_base_url = esc_url(set_url_scheme($flag_assets_base_url));

        wp_add_inline_style(
            'bbpa-admin',
            ':root{--bbpa-flag-assets-base-url:url("' . $flag_assets_base_url . '");}'
        );
        wp_style_add_data('bbpa-admin', 'rtl', 'replace');
        wp_add_inline_style(
            'bbpa-admin',
            '.bbpa-overview__summary-card--interactive{cursor:pointer;}'
            . '.bbpa-overview__summary-card--interactive:focus-visible{outline:2px solid var(--wp-admin-theme-color,var(--color-3));outline-offset:2px;}'
            . '.wp-core-ui .bbpa-admin-app select{height:32px;min-height:32px;}'
            . '@media (max-width:782px){.bbpa-report-table--visitors{min-width:1080px;table-layout:auto;}.bbpa-report-table--visitors thead{display:table-header-group;}.bbpa-report-table--visitors tbody{display:table-row-group;}.bbpa-report-table--visitors tr{display:table-row;}.bbpa-report-table--visitors th,.bbpa-report-table--visitors td{display:table-cell;width:auto;white-space:nowrap;padding:10px 12px;border-bottom:1px solid var(--bbpa-border-subtle);vertical-align:top;}.bbpa-report-table--visitors td::before{content:none;}.bbpa-report-table--visitors .bbpa-country-label,.bbpa-report-table--visitors .bbpa-brand-label{min-width:0;align-items:center;}}'
        );
    }

    wp_enqueue_style('wp-components');



    bbpa_add_admin_color_scheme_styles();

    if ($inject_localized_payload) {
        $localized_admin_payload = bbpa_build_admin_localized_payload(
            $root_id,
            bbpa_get_js_rest_config(),
            $panels,
            $current_panel,
            bbpa_get_plugin_label(),
            $debug_enabled,
            bbpa_get_effective_hidden_panels($settings),
            bbpa_get_flag_assets(),
            bbpa_get_admin_panels(true)
        );

        $localized_admin_json = wp_json_encode($localized_admin_payload);
        if (is_string($localized_admin_json) && $localized_admin_json !== '') {
            wp_add_inline_script('bbpa-admin', 'window.BBPAAdmin = ' . $localized_admin_json . ';', 'before');
        }
    }

    wp_add_inline_script(
        'bbpa-admin',
        'window.BBPA_DEBUG = ' . ($debug_enabled ? 'true' : 'false') . ';',
        'before'
    );

    // Country flags: the image of every `.fi-xx` / `.bbpa-country-flag` node is resolved at runtime from
    // settings.flagAssets (the packaged flag files), independently of the image URLs compiled into the stylesheet.
    $inline_script = implode("\n", [
        '(function () {',
        "    if (typeof window === 'undefined' || !window.BBPAAdmin || !window.BBPAAdmin.settings) {",
        '        return;',
        '    }',
        '',
        '    var flagAssets = window.BBPAAdmin.settings.flagAssets || {};',
        '    var baseUrl = flagAssets.baseUrl;',
        '    var map = flagAssets.map || {};',
        '',
        '    if (!baseUrl) {',
        '        return;',
        '    }',
        '',
        '    var getFlagUrl = function (code) {',
        '        if (!code) {',
        "            return '';",
        '        }',
        '',
        '        var key = String(code).toLowerCase();',
        '        var filename = map[key];',
        "        return baseUrl + (filename || (key + '.svg'));",
        '    };',
        '',
        '    var applyFlags = function (root) {',
        '        var scope = root || document;',
        "        var nodes = scope.querySelectorAll('.bbpa-country-flag, .fi');",
        '',
        '        nodes.forEach(function (node) {',
        '            if (!node || node.dataset && node.dataset.bbpaFlagApplied) {',
        '                return;',
        '            }',
        '',
        '            var classList = Array.from(node.classList || []);',
        '            var flagClass = classList.find(function (name) {',
        "                return name.indexOf('fi-') === 0;",
        '            });',
        '',
        '            if (!flagClass) {',
        '                return;',
        '            }',
        '',
        "            var code = flagClass.replace('fi-', '');",
        '            var url = getFlagUrl(code);',
        '',
        '            if (!url) {',
        '                return;',
        '            }',
        '',
        '            node.style.backgroundImage = \'url("\' + url + \'")\';',
        "            node.style.backgroundSize = 'contain';",
        "            node.style.backgroundPosition = '50%';",
        "            node.style.backgroundRepeat = 'no-repeat';",
        '',
        '            if (node.dataset) {',
        "                node.dataset.bbpaFlagApplied = 'true';",
        '            }',
        '        });',
        '    };',
        '',
        '    var startObserver = function () {',
        '        var observer = new MutationObserver(function (mutations) {',
        '            mutations.forEach(function (mutation) {',
        '                mutation.addedNodes.forEach(function (node) {',
        '                    if (!(node instanceof HTMLElement)) {',
        '                        return;',
        '                    }',
        '',
        "                    if (node.matches && node.matches('.bbpa-country-flag, .fi')) {",
        '                        applyFlags(node.parentNode || document);',
        '                        return;',
        '                    }',
        '',
        '                    if (node.querySelectorAll) {',
        '                        applyFlags(node);',
        '                    }',
        '                });',
        '            });',
        '        });',
        '',
        '        observer.observe(document.body, { childList: true, subtree: true });',
        '    };',
        '',
        "    if (document.readyState === 'loading') {",
        "        document.addEventListener('DOMContentLoaded', function () {",
        '            applyFlags();',
        '            startObserver();',
        '        });',
        '    } else {',
        '        applyFlags();',
        '        startObserver();',
        '    }',
        '})();',
    ]);

    wp_add_inline_script('bbpa-admin', $inline_script, 'after');

    if ($current_panel === 'geolocation') {
        wp_add_inline_script(
            'bbpa-admin',
            bbpa_get_geolocation_admin_fallback_script(),
            'after'
        );
    }

    if ($current_panel === 'settings') {
        wp_add_inline_script(
            'bbpa-admin',
            bbpa_get_settings_geolocation_admin_fallback_script(),
            'after'
        );
    }
}

/**
 * Normalize runtime asset version used for cache-busting.
 */
function bbpa_normalize_asset_version($version): string
{
    if (!is_scalar($version)) {
        return BBPA_VERSION;
    }

    $normalized = sanitize_text_field((string) $version);

    return $normalized !== '' ? $normalized : BBPA_VERSION;
}

/**
 * Build a content-derived cache version for a distributed asset.
 */
function bbpa_get_asset_file_version(string $relative_path): string
{
    try {
        $asset_file = bbpa_safe_existing_file(BBPA_PATH, $relative_path);
    } catch (RuntimeException | InvalidArgumentException $exception) {
        return BBPA_VERSION;
    }

    $fingerprint = hash_file('sha256', $asset_file);

    return is_string($fingerprint) && $fingerprint !== ''
        ? substr($fingerprint, 0, 16)
        : BBPA_VERSION;
}

/**
 * Summarize the local GeoIP database status for the admin runtime payload.
 *
 * Reads the stored updater status only; it never schedules or starts a download.
 *
 * @return array<string, bool|int|string>
 */
function bbpa_get_admin_geoip_database_status_for_payload(): array
{
    if (!class_exists('BBPA_GeoIP_Database_Updater')) {
        return [
            'known' => false,
            'operational' => false,
        ];
    }

    $updater = bbpa_get_geoip_database_updater();
    $status = $updater->get_database_status();

    if (!is_array($status)) {
        return [
            'known' => false,
            'operational' => false,
        ];
    }

    return [
        'known' => true,
        'exists' => !empty($status['exists']),
        'readable' => !empty($status['readable']),
        'operational' => !empty($status['operational']),
        'local_available' => !empty($status['local_available']),
        'last_updated' => isset($status['last_updated']) ? absint($status['last_updated']) : 0,
        'last_success_at' => isset($status['last_success_at']) ? absint($status['last_success_at']) : 0,
        'last_error_code' => isset($status['last_error_code']) ? sanitize_key((string) $status['last_error_code']) : '',
    ];
}

/**
 * Build a sanitized payload injected in the admin runtime.
 *
 * @param array{rest_url:string,rest_namespace:string,rest_internal_namespace:string} $rest_config REST runtime values.
 */
function bbpa_build_admin_localized_payload(
    string $root_id,
    array $rest_config,
    array $panels,
    string $current_panel,
    string $menu_label,
    bool $debug_enabled,
    array $hidden_by_policy,
    array $flag_assets,
    array $available_panels = []
): array {
    $sanitize_url = static function ($value): string {
        return is_string($value) ? esc_url_raw($value) : '';
    };
    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];

    $payload = [
        'rootId' => sanitize_key($root_id),
        'currentUserId' => get_current_user_id(),
        'restNonce' => wp_create_nonce('wp_rest'),
        'restUrl' => $sanitize_url($rest_config['rest_url'] ?? ''),
        'roles' => bbpa_get_roles_for_admin(),
        'panels' => $panels,
        'availablePanels' => $available_panels ?: $panels,
        'restSources' => bbpa_get_rest_sources(),
        'features' => bbpa_features(),
        'currentPanel' => sanitize_key($current_panel),
        'settings' => [
            'restNamespace' => sanitize_text_field((string) ($rest_config['rest_namespace'] ?? '')),
            'restInternalNamespace' => sanitize_text_field((string) ($rest_config['rest_internal_namespace'] ?? '')),
            'appMode' => 'admin',
            'runtimeContext' => 'wordpress-admin',
            'pluginVersion' => BBPA_VERSION,
            'geoipLookupMode' => sanitize_key((string) ($settings['geoip_lookup_mode'] ?? 'local_database')),
            'geoipDbStatus' => bbpa_get_admin_geoip_database_status_for_payload(),
            'privacyMode' => function_exists('bbpa_get_privacy_mode')
                ? sanitize_key(bbpa_get_privacy_mode())
                : 'essential',
            'advanced_stats_enabled' => !array_key_exists('advanced_stats_enabled', $settings)
                || rest_sanitize_boolean($settings['advanced_stats_enabled']),
            'referrer_favicons_enabled' => isset($settings['referrer_favicons_enabled'])
                && rest_sanitize_boolean($settings['referrer_favicons_enabled']),
            'adminCacheVersion' => bbpa_get_admin_cache_version(),
            'slug' => sanitize_key(BBPA_SLUG),
            'pluginLabel' => sanitize_text_field($menu_label),
            'brandLogoUrl' => $sanitize_url(BBPA_URL . 'assets/images/bbpa-logo-compact.svg'),
            'timezoneString' => sanitize_text_field((string) wp_timezone_string()),
            'gmtOffset' => (float) get_option('gmt_offset', 0),
            'locale' => sanitize_text_field((string) get_locale()),
            'dateFormat' => sanitize_text_field((string) get_option('date_format', '')),
            'timeFormat' => sanitize_text_field((string) get_option('time_format', '')),
            'upgradeUrl' => $sanitize_url(
                function_exists('bbpa_get_upgrade_url')
                    ? bbpa_get_upgrade_url()
                    : admin_url('admin.php?page=' . BBPA_SLUG . '-pricing')
            ),
            'debugEnabled' => $debug_enabled,
            // Only users with manage_options may change the Account page role access.
            'canManageAccountAccess' => bbpa_current_user_can_manage_account_access(),
            'supportsXlsxExport' => class_exists('ZipArchive'),
            'exportMaxRows' => max(1, (int) apply_filters('bbpa_export_max_rows', 10000)),
            'fieldVisibilityMatrix' => function_exists('bbpa_get_ui_field_visibility_matrix') ? bbpa_get_ui_field_visibility_matrix() : [],
            'postTypes' => bbpa_get_post_types_for_admin(),
            'flagAssets' => $flag_assets,
        ],
    ];

    $filtered_payload = apply_filters('bbpa_admin_localized_payload', $payload);
    $filtered_payload = is_array($filtered_payload) ? $filtered_payload : $payload;
    $filtered_payload['settings'] = is_array($filtered_payload['settings'] ?? null) ? $filtered_payload['settings'] : [];
    // The WordPress admin context is authoritative and cannot be promoted to a PWA by filters.
    $filtered_payload['settings']['appMode'] = 'admin';
    $filtered_payload['settings']['runtimeContext'] = 'wordpress-admin';
    unset($filtered_payload['settings']['isPremiumPwa']);

    return $filtered_payload;
}

/**
 * Provide a resilient geolocation admin renderer when the packaged React bundle is stale.
 */
function bbpa_get_geolocation_admin_fallback_script(): string
{
    return <<<'JS'
(function () {
    if (
        typeof window === 'undefined' ||
        !window.wp ||
        !window.wp.element ||
        !window.wp.components ||
        !window.wp.i18n ||
        !window.BBPAAdmin
    ) {
        return;
    }

    var root = document.getElementById('bbpa-admin');
    if (!root) {
        return;
    }

    var adminConfig = window.BBPAAdmin || {};
    var el = window.wp.element.createElement;
    var render = window.wp.element.render;
    var useEffect = window.wp.element.useEffect;
    var useState = window.wp.element.useState;
    var __ = window.wp.i18n.__;
    var TabPanel = window.wp.components.TabPanel;
    var Notice = window.wp.components.Notice;
    var Button = window.wp.components.Button;
    var Card = window.wp.components.Card;
    var CardBody = window.wp.components.CardBody;
    var Spinner = window.wp.components.Spinner;

    if (typeof render !== 'function' || typeof TabPanel !== 'function') {
        return;
    }

    var rootContainsRuntimeError = function () {
        var text = (root.textContent || '').toLowerCase();
        return (
            text.indexOf('bimbeau privacy analytics cannot load the admin interface') !== -1 ||
            text.indexOf('is not a function') !== -1
        );
    };

    var buildRestUrl = function (path, params) {
        var baseUrl = String(adminConfig.restUrl || '');
        var namespace = String(
            adminConfig.settings && adminConfig.settings.restNamespace
                ? adminConfig.settings.restNamespace
                : ''
        );
        var url = new URL(namespace + path, baseUrl);

        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];

            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });

        return url.toString();
    };

    var renderConfigNotice = function (configStatus) {
        if (!configStatus || configStatus.canAggregate) {
            return null;
        }

        var message = !configStatus.enabled
            ? __('Geolocation aggregation is disabled in settings.', 'bimbeau-privacy-analytics')
            : __('MaxMind credentials are required before geolocation data can be aggregated.', 'bimbeau-privacy-analytics');

        return el(
            Notice,
            {
                status: 'warning',
                isDismissible: false,
            },
            message
        );
    };

    var formatCountryLabel = function (item) {
        if (!item) {
            return __('Unknown country', 'bimbeau-privacy-analytics');
        }

        return item.code || item.label || __('Unknown country', 'bimbeau-privacy-analytics');
    };

    var DataTable = function (props) {
        var items = Array.isArray(props.items) ? props.items : [];
        var labelFormatter =
            typeof props.labelFormatter === 'function'
                ? props.labelFormatter
                : function (item) {
                        return item && item.label ? item.label : '';
                  };
        var valueKey = props.valueKey || 'hits';

        if (props.isLoading) {
            return el(
                'div',
                {
                    style: {
                        padding: '24px',
                        textAlign: 'center',
                    },
                },
                el(Spinner, null)
            );
        }

        if (props.error) {
            return el(
                Notice,
                {
                    status: 'error',
                    isDismissible: false,
                },
                props.error
            );
        }

        if (items.length === 0) {
            return el(
                Notice,
                {
                    status: 'info',
                    isDismissible: false,
                },
                props.emptyLabel
            );
        }

        return el(
            'table',
            {
                className: 'widefat striped',
            },
            el(
                'thead',
                null,
                el(
                    'tr',
                    null,
                    el('th', { scope: 'col' }, props.labelHeader),
                    el('th', { scope: 'col' }, props.metricLabel)
                )
            ),
            el(
                'tbody',
                null,
                items.map(function (item, index) {
                    return el(
                        'tr',
                        {
                            key: (item && (item.id || item.code || item.label)) || index,
                        },
                        el('td', null, labelFormatter(item)),
                        el('td', null, Number(item && item[valueKey] ? item[valueKey] : 0).toLocaleString())
                    );
                })
            )
        );
    };

    var GeolocationTableCard = function (props) {
        return el(
            Card,
            {
                className: 'bbpa-settings-section',
            },
            el(
                CardBody,
                null,
                el('h2', null, props.title),
                props.notice,
                el(DataTable, props)
            )
        );
    };

    var useGeolocationEndpoint = function (path) {
        var initialState = {
            isLoading: true,
            error: '',
            items: [],
            configStatus: null,
        };
        var stateTuple = useState(initialState);
        var state = stateTuple[0];
        var setState = stateTuple[1];

        useEffect(function () {
            var isMounted = true;

            fetch(buildRestUrl(path, { per_page: 20, orderby: 'hits', order: 'desc' }), {
                headers: {
                    'X-WP-Nonce': adminConfig.restNonce || '',
                },
            })
                .then(function (response) {
                    if (!response.ok) {
                        return response.json()
                            .catch(function () {
                                return null;
                            })
                            .then(function (payload) {
                                var message = payload && payload.message
                                    ? payload.message
                                    : __('Geolocation data cannot be loaded.', 'bimbeau-privacy-analytics');
                                throw new Error(message);
                            });
                    }

                    return response.json();
                })
                .then(function (payload) {
                    if (!isMounted) {
                        return;
                    }

                    setState({
                        isLoading: false,
                        error: '',
                        items: Array.isArray(payload.items)
                            ? payload.items
                            : Array.isArray(payload.countries)
                                ? payload.countries
                                : [],
                        configStatus: payload.configStatus || null,
                    });
                })
                .catch(function (error) {
                    if (!isMounted) {
                        return;
                    }

                    setState({
                        isLoading: false,
                        error: error && error.message
                            ? error.message
                            : __('Geolocation data cannot be loaded.', 'bimbeau-privacy-analytics'),
                        items: [],
                        configStatus: null,
                    });
                });

            return function () {
                isMounted = false;
            };
        }, [path]);

        return state;
    };

    var CountriesPanel = function () {
        var state = useGeolocationEndpoint('/geo-countries');

        return el(GeolocationTableCard, {
            title: __('Top countries', 'bimbeau-privacy-analytics'),
            labelHeader: __('Country', 'bimbeau-privacy-analytics'),
            metricLabel: __('Visits', 'bimbeau-privacy-analytics'),
            emptyLabel: __('No country data available for the selected period.', 'bimbeau-privacy-analytics'),
            labelFormatter: formatCountryLabel,
            valueKey: 'visits',
            items: state.items,
            isLoading: state.isLoading,
            error: state.error,
            notice: renderConfigNotice(state.configStatus),
        });
    };

    var GeolocationFallbackApp = function () {
        var pluginLabel = adminConfig.settings && adminConfig.settings.pluginLabel
            ? adminConfig.settings.pluginLabel
            : __('BimBeau Privacy Analytics', 'bimbeau-privacy-analytics');
        var pluginVersion = adminConfig.settings && adminConfig.settings.pluginVersion
            ? adminConfig.settings.pluginVersion
            : '';
        var pluginSlug = adminConfig.settings && adminConfig.settings.slug
            ? adminConfig.settings.slug
            : 'bimbeau-privacy-analytics';
        var dashboardUrl = 'admin.php?page=' + encodeURIComponent(pluginSlug);

        return el(
            'div',
            {
                className: 'bbpa-admin-app',
            },
            el(
                'div',
                {
                    className: 'bbpa-admin-app__header',
                },
                el(
                    'div',
                    {
                        className: 'bbpa-admin-app__heading',
                    },
                    el(
                        'h1',
                        null,
                        el(
                            'a',
                            {
                                className: 'bbpa-admin-app__title-link',
                                href: dashboardUrl,
                            },
                            pluginLabel
                        )
                    ),
                    pluginVersion
                        ? el(
                                'span',
                                {
                                    className: 'bbpa-admin-app__version',
                                },
                                'v' + pluginVersion
                          )
                        : null
                )
            ),
            el(
                Notice,
                {
                    status: 'warning',
                    isDismissible: false,
                },
                __('The packaged geolocation screen is unavailable. BimBeau Privacy Analytics loads a compatible fallback view for this admin page.', 'bimbeau-privacy-analytics')
            ),
            el(
                'div',
                {
                    className: 'bbpa-report-panel',
                },
                el(
                    TabPanel,
                    {
                        className: 'bbpa-geolocation-tabs',
                        tabs: [
                            { name: 'countries', title: __('Top countries', 'bimbeau-privacy-analytics') },
                        ],
                    },
                    function () {
                        return el(CountriesPanel, null);
                    }
                )
            )
        );
    };

    window.setTimeout(function () {
        var alreadyHealthy =
            root.querySelector('.bbpa-geolocation-tabs') &&
            !rootContainsRuntimeError();

        if (alreadyHealthy || !rootContainsRuntimeError()) {
            return;
        }

        root.innerHTML = '';
        render(el(GeolocationFallbackApp, null), root);
    }, 0);
})();
JS;
}

/**
 * Provide a resilient settings/geolocation fallback for GeoIP database actions.
 *
 * This inline fallback keeps the GeoIP database status and update action reachable
 * from the settings screen when the packaged admin bundle does not render them.
 * It reuses translation strings shipped with the admin bundle, loads the status
 * once per mounted notice and never refetches from DOM mutation callbacks.
 */
function bbpa_get_settings_geolocation_admin_fallback_script(): string
{
    return <<<'JS'
(function () {
    if (typeof window === 'undefined' || !window.document || !window.fetch || !window.BBPAAdmin) {
        return;
    }

    var adminConfig = window.BBPAAdmin || {};
    var settings = adminConfig.settings || {};
    var pluginSlug = String(settings.slug || 'bimbeau-privacy-analytics');
    var currentParams = new URLSearchParams(window.location.search || '');
    var isSettingsPage = currentParams.get('page') === pluginSlug + '-settings';

    if (!isSettingsPage) {
        return;
    }

    var textDomain = 'bimbeau-privacy-analytics';
    var translate = function (text) {
        if (window.wp && window.wp.i18n && typeof window.wp.i18n.__ === 'function') {
            return window.wp.i18n.__(text, textDomain);
        }

        return text;
    };

    var formatTimestamp = function (timestamp) {
        var milliseconds = Number(timestamp || 0) * 1000;
        if (!milliseconds) {
            return '';
        }

        var format = String(settings.dateFormat || 'F j, Y') + ' ' + String(settings.timeFormat || 'g:i a');
        if (window.wp && window.wp.date && typeof window.wp.date.dateI18n === 'function') {
            try {
                return window.wp.date.dateI18n(format, milliseconds);
            } catch (error) {
                // Fall back to the browser formatter below.
            }
        }

        var locale = String(settings.locale || '').replace('_', '-');
        try {
            return new Date(milliseconds).toLocaleString(locale || undefined);
        } catch (error) {
            return new Date(milliseconds).toLocaleString();
        }
    };

    var matchesGeolocationContext = function () {
        var tab = String(currentParams.get('bbpa_tab') || '').toLowerCase();
        var path = String(window.location.hash || '').toLowerCase();

        if (tab === 'geolocation') {
            return true;
        }

        if (path.indexOf('geolocation') !== -1) {
            return true;
        }

        return Boolean(
            document.querySelector('[data-bbpa-settings-section="geolocation"]') ||
                document.querySelector('#bbpa-settings-geolocation') ||
                document.querySelector('[data-bbpa-geoip-database-status]') ||
                document.querySelector('.bbpa-settings-geolocation')
        );
    };

    var buildRestUrl = function (path) {
        var baseUrl = String(adminConfig.restUrl || '');
        var namespace = String(settings.restInternalNamespace || '');
        return new URL(namespace + path, baseUrl).toString();
    };

    var createFallbackShell = function (container) {
        if (!container || container.querySelector('[data-bbpa-geoip-fallback="true"]')) {
            return null;
        }

        var shell = document.createElement('div');
        shell.className = 'notice notice-info';
        shell.style.marginTop = '12px';
        shell.setAttribute('data-bbpa-geoip-fallback', 'true');
        shell.setAttribute('data-bbpa-geoip-fallback-mounted', 'true');

        var title = document.createElement('p');
        title.style.marginBottom = '8px';
        var titleText = document.createElement('strong');
        titleText.textContent = translate('GeoIP database status');
        title.appendChild(titleText);

        var controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '8px';
        controls.style.flexWrap = 'wrap';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = translate('Update now');
        button.setAttribute('data-bbpa-geoip-update-button', 'true');

        var status = document.createElement('p');
        status.style.margin = '0';
        status.style.fontSize = '13px';
        status.style.lineHeight = '1.5';
        status.setAttribute('data-bbpa-geoip-status', 'true');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = translate('Loading…');

        var notice = document.createElement('div');
        notice.style.marginTop = '8px';
        notice.setAttribute('data-bbpa-geoip-notice', 'true');
        notice.setAttribute('aria-live', 'polite');

        controls.appendChild(button);
        controls.appendChild(status);
        shell.appendChild(title);
        shell.appendChild(controls);
        shell.appendChild(notice);

        container.appendChild(shell);

        return shell;
    };

    var getFallbackContainer = function () {
        var explicitContainer =
            document.querySelector('[data-bbpa-settings-section="geolocation"]') ||
            document.querySelector('#bbpa-settings-geolocation') ||
            document.querySelector('.bbpa-settings-geolocation');

        if (explicitContainer) {
            return explicitContainer;
        }

        var adminRoot = document.getElementById('bbpa-admin');
        if (adminRoot) {
            return adminRoot;
        }

        return document.querySelector('.wrap') || document.body;
    };

    var renderNotice = function (shell, status, message) {
        if (!shell) {
            return;
        }

        var noticeNode = shell.querySelector('[data-bbpa-geoip-notice="true"]');
        if (!noticeNode) {
            return;
        }

        noticeNode.className = 'notice notice-' + status + ' inline';
        noticeNode.textContent = message;
    };

    var renderStatus = function (shell, payload) {
        var statusNode = shell ? shell.querySelector('[data-bbpa-geoip-status="true"]') : null;
        if (!statusNode) {
            return;
        }

        var database = payload && payload.database ? payload.database : {};
        var installed = Boolean(database.exists);
        var parts = [installed ? translate('Installed') : translate('GeoIP database not installed')];

        var updatedLabel = formatTimestamp(database.last_updated);
        if (updatedLabel) {
            parts.push(translate('Last updated') + ' ' + updatedLabel);
        }

        var nextScheduledLabel = formatTimestamp(database.next_scheduled);
        parts.push(
            nextScheduledLabel
                ? translate('Next update') + ' ' + nextScheduledLabel
                : translate('No automatic update scheduled')
        );

        statusNode.textContent = parts.join(' · ');
    };

    var fetchJson = function (path, options) {
        var headers = Object.assign({}, (options && options.headers) || {}, {
            'X-WP-Nonce': adminConfig.restNonce || '',
        });

        return fetch(buildRestUrl(path), Object.assign({}, options || {}, { headers: headers }))
            .then(function (response) {
                return response.json()
                    .catch(function () {
                        return {};
                    })
                    .then(function (payload) {
                        if (!response.ok) {
                            throw new Error(payload && payload.message ? String(payload.message) : '');
                        }

                        return payload;
                    });
            });
    };

    var refreshStatus = function (shell) {
        return fetchJson('/admin/geoip-database/status')
            .then(function (payload) {
                renderStatus(shell, payload);
                return payload;
            })
            .catch(function (error) {
                renderNotice(
                    shell,
                    'error',
                    error && error.message ? error.message : translate('Unable to load the GeoIP database status.')
                );
            });
    };

    var wireActions = function (shell) {
        if (!shell || shell.getAttribute('data-bbpa-geoip-bound') === 'true') {
            return;
        }

        var button = shell.querySelector('[data-bbpa-geoip-update-button="true"]');
        if (!button) {
            return;
        }

        button.addEventListener('click', function () {
            button.disabled = true;
            renderNotice(shell, 'info', translate('Update in progress'));

            fetchJson('/admin/geoip-database/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
                .then(function (payload) {
                    var message = payload && payload.message
                        ? String(payload.message)
                        : translate('GeoIP database updated successfully.');
                    renderNotice(shell, 'success', message);
                    return refreshStatus(shell);
                })
                .catch(function (error) {
                    renderNotice(
                        shell,
                        'error',
                        error && error.message ? error.message : translate('Unable to update the GeoIP database.')
                    );
                })
                .finally(function () {
                    button.disabled = false;
                });
        });

        shell.setAttribute('data-bbpa-geoip-bound', 'true');
    };

    // The React root may replace the notice once while it mounts: allow a few
    // remounts, then stop observing so the fallback can never loop.
    var maxMounts = 3;
    var mountCount = 0;
    var observer = null;

    var mountFallback = function () {
        if (!matchesGeolocationContext()) {
            return;
        }

        var container = getFallbackContainer();
        if (!container || container.querySelector('[data-bbpa-geoip-fallback="true"]')) {
            // Already mounted: status and notice updates must not trigger new requests.
            return;
        }

        if (mountCount >= maxMounts) {
            if (observer) {
                observer.disconnect();
            }
            return;
        }

        var shell = createFallbackShell(container);
        if (!shell) {
            return;
        }

        mountCount += 1;
        wireActions(shell);
        refreshStatus(shell);
    };

    if (typeof window.MutationObserver === 'function') {
        observer = new window.MutationObserver(function () {
            mountFallback();
        });

        observer.observe(document.getElementById('bbpa-admin') || document.body, { childList: true, subtree: true });
    }

    mountFallback();
})();
JS;
}

/**
 * Resolve available country flag assets from the packaged assets directory.
 *
 * @return array{baseUrl: string, map: array<string, string>}
 */
function bbpa_get_flag_assets(): array
{
    $base_url = trailingslashit(BBPA_URL . 'assets/images/flags/4x3');
    $map = [];

    try {
        $files = bbpa_safe_list_files_by_extension(BBPA_PATH, 'assets/images/flags/4x3', 'svg');
    } catch (RuntimeException | InvalidArgumentException $exception) {
        $files = [];
    }

    if (empty($files)) {
        return [
            'baseUrl' => $base_url,
            'map' => $map,
        ];
    }

    foreach ($files as $filename) {
        $code = '';

        if (preg_match('/^(.+)-[a-f0-9]{6,}\\.svg$/i', $filename, $matches)) {
            $code = strtolower($matches[1]);
        } else {
            $code = strtolower(pathinfo($filename, PATHINFO_FILENAME));
        }

        if ($code !== '' && !isset($map[$code])) {
            $map[$code] = $filename;
        }
    }

    return [
        'baseUrl' => $base_url,
        'map' => $map,
    ];
}

/**
 * Resolve the admin panels exposed to the current request.
 *
 * @param bool $include_disabled Whether panels hidden by the effective panel policy are kept.
 * @return array<int, array<string, string>>
 */
function bbpa_get_admin_panels(bool $include_disabled = false): array
{
    $settings = bbpa_get_settings();
    $hidden_by_policy = bbpa_get_effective_hidden_panels($settings);

    $panels = [
        [
            'name' => 'dashboard',
            'title' => __('Dashboard', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'realtime',
            'title' => __('Real-time', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'top-pages',
            'title' => __('Pages', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'acquisition',
            'title' => __('Acquisition', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'referrers',
            'title' => __('Referring sites', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'search-terms',
            'title' => __('Internal searches', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'geolocation',
            'title' => __('Geolocation', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'visitors',
            'title' => __('Visitors', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'devices',
            'title' => __('Devices', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
        [
            'name' => 'settings',
            'title' => __('Settings', 'bimbeau-privacy-analytics'),
            'type' => 'core',
        ],
    ];

    $filtered = apply_filters('bbpa_admin_panels', $panels);
    if (!is_array($filtered)) {
        $filtered = $panels;
    }


    $normalized = [];
    foreach ($filtered as $panel) {
        if (!is_array($panel)) {
            continue;
        }

        $name = isset($panel['name']) ? sanitize_key($panel['name']) : '';
        if ($name === '') {
            continue;
        }

        $normalized_panel = [
            'name' => $name,
            'title' => isset($panel['title']) ? wp_strip_all_tags((string) $panel['title']) : $name,
            'type' => isset($panel['type']) ? sanitize_key($panel['type']) : 'custom',
        ];

        // Optional documented key, kept only when a panel declares it (the admin app treats a missing value as free).
        $availability = bbpa_normalize_admin_availability($panel['availability'] ?? null);
        if ($availability !== '') {
            $normalized_panel['availability'] = $availability;
        }

        $normalized[] = $normalized_panel;
    }

    if ($include_disabled || empty($hidden_by_policy)) {
        return $normalized;
    }

    return array_values(
        array_filter(
            $normalized,
            static function (array $panel) use ($hidden_by_policy): bool {
                $name = $panel['name'];
                if ($name === 'dashboard') {
                    return true;
                }

                return !in_array($name, $hidden_by_policy, true);
            }
        )
    );
}

/**
 * Normalize the optional `availability` key of an admin panel or REST source entry.
 *
 * @param mixed $availability Declared availability.
 * @return string `free`, `pro`, or an empty string when the value is missing or unsupported.
 */
function bbpa_normalize_admin_availability($availability): string
{
    if (!is_string($availability)) {
        return '';
    }

    $availability = sanitize_key($availability);

    return in_array($availability, ['free', 'pro'], true) ? $availability : '';
}

/**
 * Get the effective hidden panels list from settings and consent-gated advanced stats.
 *
 * When advanced statistics are disabled, the panels that depend on them
 * (BBPA_ADVANCED_STATS_DEPENDENT_PANEL_IDS, which includes the realtime panel) are hidden.
 */
function bbpa_get_effective_hidden_panels(array $settings): array
{
    $hidden_panels = apply_filters('bbpa_user_hidden_panels', [], $settings);
    $hidden_panels = is_array($hidden_panels) ? array_values(array_unique(array_filter(array_map('sanitize_key', $hidden_panels)))) : [];
    $is_advanced_stats_enabled = !isset($settings['advanced_stats_enabled'])
        || rest_sanitize_boolean($settings['advanced_stats_enabled']);

    if ($is_advanced_stats_enabled) {
        return $hidden_panels;
    }

    return array_values(array_unique(array_merge($hidden_panels, BBPA_ADVANCED_STATS_DEPENDENT_PANEL_IDS)));
}

/**
 * Get REST data sources list for admin screens.
 */
function bbpa_get_rest_sources(): array
{
    $sources = [
        [
            'key' => 'settings',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/settings',
        ],
        [
            'key' => 'kpis',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/kpis',
        ],
        [
            'key' => 'purge-data',
            'method' => 'POST',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/purge-data',
        ],
        [
            'key' => 'top-pages',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/top-pages',
        ],
        [
            'key' => 'referrers',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/referrers',
        ],
        [
            'key' => 'timeseries-day',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/timeseries/day',
        ],
        [
            'key' => 'timeseries-hour',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/timeseries/hour',
        ],
        [
            'key' => 'device-split',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/device-split',
        ],
        [
            'key' => 'overview',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/overview',
        ],
        [
            'key' => 'report-top-pages',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/top-pages',
        ],
        [
            'key' => 'report-top-content',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/top-content',
        ],
        [
            'key' => 'report-referrers',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/referrers',
        ],
        [
            'key' => 'report-404s',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/404s',
        ],
        [
            'key' => 'report-search-terms',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/search-terms',
        ],
        [
            'key' => 'report-entry-pages',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/entry-pages',
        ],
        [
            'key' => 'report-exit-pages',
            'method' => 'GET',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/exit-pages',
        ],
        [
            'key' => 'report-purge',
            'method' => 'POST',
            'namespace' => BBPA_REST_NAMESPACE,
            'path' => '/purge',
        ],
    ];

    $filtered = apply_filters('bbpa_rest_sources', $sources);
    if (!is_array($filtered)) {
        $filtered = $sources;
    }

    $normalized = [];
    foreach ($filtered as $source) {
        if (!is_array($source)) {
            continue;
        }

        $key = isset($source['key']) ? sanitize_key($source['key']) : '';
        $method = isset($source['method']) ? strtoupper(sanitize_key($source['method'])) : 'GET';
        $namespace = isset($source['namespace']) ? sanitize_text_field((string) $source['namespace']) : '';
        $path = isset($source['path']) ? '/' . ltrim((string) $source['path'], '/') : '';

        if ($key === '' || $namespace === '' || $path === '/') {
            continue;
        }

        $normalized_source = [
            'key' => $key,
            'method' => $method,
            'namespace' => $namespace,
            'path' => $path,
        ];

        $availability = bbpa_normalize_admin_availability($source['availability'] ?? null);
        if ($availability !== '') {
            $normalized_source['availability'] = $availability;
        }

        $normalized[] = $normalized_source;
    }

    return $normalized;
}

/**
 * Prepare roles list for admin settings.
 */
function bbpa_get_roles_for_admin(): array
{
    $roles = wp_roles();
    if (!$roles) {
        return [];
    }

    $delegable_roles = function_exists('bbpa_get_delegable_access_roles')
        ? bbpa_get_delegable_access_roles()
        : [];

    $formatted = [];
    foreach ($roles->roles as $key => $role) {
        $formatted[] = [
            'key' => $key,
            'label' => translate_user_role($role['name']),
            'canDelegateAccess' => in_array(sanitize_key((string) $key), $delegable_roles, true),
        ];
    }

    return $formatted;
}

/**
 * Prepare post types list for admin settings.
 */
function bbpa_get_post_types_for_admin(): array
{
    $post_types = get_post_types(
        [
            'show_ui' => true,
        ],
        'objects'
    );
    if (!is_array($post_types) || !$post_types) {
        return [];
    }

    $formatted = [];
    foreach ($post_types as $post_type) {
        if (!is_object($post_type) || empty($post_type->name) || $post_type->name === 'attachment') {
            continue;
        }

        $formatted[] = [
            'key' => sanitize_key((string) $post_type->name),
            'label' => sanitize_text_field((string) $post_type->labels->singular_name),
        ];
    }

    return $formatted;
}
