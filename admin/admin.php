<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

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
    $active_visitors = bbpa_get_realtime_active_visitors_count();
    if ($active_visitors < 1) {
        return $panel_title;
    }

    $count = number_format_i18n($active_visitors);
    $badge = sprintf(
        '<span class="update-plugins count-%1$d"><span class="bbpa-menu-count">%2$s</span></span>',
        $active_visitors,
        esc_html($count)
    );

    return sprintf(
        '%1$s %2$s',
        esc_html($panel_title),
        $badge
    );
}

/**
 * Count active realtime visitors from the in-memory hit window.
 */
function bbpa_get_realtime_active_visitors_count(): int
{
    $window_seconds = bbpa_get_visit_identifier_window_seconds();
    $now = (int) current_time('timestamp', true);
    $window_start = max(0, $now - $window_seconds);

    $realtime_rows = get_option('bbpa_realtime_visitors', []);
    if (!is_array($realtime_rows)) {
        $realtime_rows = [];
    }

    $active_visitor_ids = [];
    foreach ($realtime_rows as $index => $row) {
        if (is_string($row)) {
            $decoded_row = json_decode($row, true);
            if (!is_array($decoded_row)) {
                continue;
            }

            $row = $decoded_row;
        }

        if (!is_array($row)) {
            continue;
        }

        $timestamp = bbpa_normalize_realtime_row_timestamp($row);
        if ($timestamp < $window_start || $timestamp > $now) {
            continue;
        }

        $visitor_bucket = isset($row['visitor_bucket'])
            ? sanitize_text_field((string) $row['visitor_bucket'])
            : '';
        $active_visitor_id = $visitor_bucket !== ''
            ? $visitor_bucket
            : sprintf('row-%d', (int) $index);

        $active_visitor_ids[$active_visitor_id] = true;
    }

    return count($active_visitor_ids);
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
 * Add the Freemius Upgrade to Pro submenu item under BimBeau Privacy Analytics in Free environments.
 */
function bbpa_register_free_upgrade_submenu(): void
{
    if (!function_exists('bbpa_is_pro') || bbpa_is_pro() || !function_exists('bbpa_fs')) {
        return;
    }

    add_submenu_page(
        BBPA_SLUG,
        __('Update', 'bimbeau-privacy-analytics'),
        bbpa_get_upgrade_menu_title(),
        bbpa_get_panel_capability('dashboard'),
        BBPA_SLUG . '-pricing',
        'bbpa_render_freemius_pricing_page'
    );
}


/**
 * Build admin submenu label for the upgrade entry.
 */
function bbpa_get_upgrade_menu_title(): string
{
    $badge_text = __('Pro', 'bimbeau-privacy-analytics');
    $label_text = __('Update', 'bimbeau-privacy-analytics');
    $label_text = preg_replace(
        '/(?:\s|\x{00A0})+' . preg_quote($badge_text, '/') . '$/iu',
        '',
        $label_text
    );

    if (!is_string($label_text) || '' === trim($label_text)) {
        $label_text = __('Update', 'bimbeau-privacy-analytics');
    }

    $label = esc_html($label_text);
    $badge = sprintf(
        '<span class="update-plugins count-1"><span class="plugin-count">%s</span></span>',
        esc_html($badge_text)
    );

    return sprintf('%1$s %2$s', $label, $badge);
}

/**
 * Normalize Free submenu upgrade entries so only one pricing item remains.
 */
function bbpa_normalize_free_upgrade_submenu(): void
{
    if (!function_exists('bbpa_is_pro') || bbpa_is_pro()) {
        return;
    }

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
        $submenu_label_raw = isset($submenu_item[0]) ? (string) $submenu_item[0] : '';
        $submenu_label = wp_strip_all_tags($submenu_label_raw);
        $submenu_css_classes = isset($submenu_item[4]) ? strtolower((string) $submenu_item[4]) : '';
        $candidate_haystack = strtolower($submenu_label_raw . ' ' . $submenu_label . ' ' . $submenu_slug . ' ' . $submenu_css_classes);

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

        $looks_like_upgrade = preg_match('/\b(mise\s*à\s*jour|mettre\s*à\s*jour|upgrade|updates?)\b/ui', $submenu_label) === 1
            || strpos($candidate_haystack, 'pricing') !== false
            || strpos($candidate_haystack, 'upgrade') !== false
            || strpos($candidate_haystack, 'fs-upgrade') !== false
            || strpos($candidate_haystack, 'fs-submenu-item-pricing') !== false;

        if ($looks_like_upgrade) {
            continue;
        }

        $clean_submenu[] = $submenu_item;
    }

    if (null === $upgrade_item) {
        $upgrade_item = [
            bbpa_get_upgrade_menu_title(),
            bbpa_get_panel_capability('dashboard'),
            $upgrade_slug,
            __('Upgrade to Pro', 'bimbeau-privacy-analytics'),
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

    $ordered_submenu[] = $upgrade_item;

    if (null !== $contact_item) {
        $ordered_submenu[] = $contact_item;
    }

    $GLOBALS['submenu'][$submenu_root] = array_values($ordered_submenu);
}

/**
 * Delegate rendering of the Upgrade to Pro page to Freemius.
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
 */
function bbpa_register_pro_contact_submenu(): void
{
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
 * Get admin boot fallback CSS.
 */
function bbpa_get_admin_boot_fallback_css(): string
{
    return '.bbpa-admin-boot-fallback{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:220px;margin:20px 0;color:#50575e}'
        . '.bbpa-admin-boot-fallback__spinner{width:24px;height:24px;border:2px solid #dcdcde;border-top-color:#2271b1;border-radius:50%;animation:bpaAdminBootSpin .8s linear infinite}'
        . '.bbpa-admin-boot-fallback__label{margin:0;font-size:13px;line-height:1.5;color:inherit}'
        . '.bbpa-admin-boot-fallback.is-hidden{display:none!important}'
        . '@keyframes bpaAdminBootSpin{to{transform:rotate(360deg)}}';
}

/**
 * Get admin boot fallback script.
 */
function bbpa_get_admin_boot_fallback_script(string $root_id = 'bbpa-admin'): string
{
    $root_id_json = wp_json_encode($root_id !== '' ? $root_id : 'bbpa-admin');
    if (!is_string($root_id_json) || $root_id_json === '') {
        $root_id_json = '"bbpa-admin"';
    }

    return '(function(){var root=document.getElementById(' . $root_id_json . ');if(!root){return;}var fallback=root.querySelector(".bbpa-admin-boot-fallback");if(!fallback){return;}var hideFallback=function(){if(!root.contains(fallback)){return;}var hasRealContent=root.childElementCount>1||!root.contains(fallback);if(hasRealContent){fallback.classList.add("is-hidden");}};if(document.readyState==="complete"){setTimeout(hideFallback,1200);}else{window.addEventListener("load",function(){setTimeout(hideFallback,1200);});}})();';
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

    $inline_css = 'body.wp-admin #bbpa-admin, body.bbpa-app-shell #bbpa-app{' . implode('; ', $declarations) . ';}';

    if (wp_style_is('bbpa-admin', 'enqueued')) {
        $flag_assets_base_url = trailingslashit(BBPA_URL . 'assets/images/flags/4x3');
        $flag_assets_base_url = esc_url(set_url_scheme($flag_assets_base_url));

        wp_add_inline_style(
            'bbpa-admin',
            ':root{--bbpa-flag-assets-base-url:url("' . $flag_assets_base_url . '");}'
        );
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
    $page = filter_input(INPUT_GET, 'page', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    $page = is_string($page) ? sanitize_text_field(wp_unslash($page)) : '';
    if (!is_string($page) || $page === '') {
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
    $disabled_panels = bbpa_get_effective_hidden_panels($settings);
    $is_panel_disabled = $requested_panel !== 'dashboard'
        && $requested_panel !== 'settings'
        && in_array($requested_panel, $disabled_panels, true);

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
 * Resolve install prompt UX mode for front app runtime.
 */
function bbpa_get_front_app_install_prompt_mode(): string
{
    $mode = apply_filters('bbpa_front_app_install_prompt_mode', 'custom');
    $mode = is_string($mode) ? sanitize_key($mode) : 'custom';

    if (!in_array($mode, ['native', 'custom'], true)) {
        return 'custom';
    }

    return $mode;
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
    unset($blog_id); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only callback parameter is intentionally unused.

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
    $current_page = sanitize_key((string) filter_input(INPUT_GET, 'page', FILTER_UNSAFE_RAW));
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
 * Enqueue admin app bundle and pass runtime configuration.
 */
function bbpa_enqueue_admin_app_assets(string $current_panel = 'dashboard', array $overrides = []): void
{
    $menu_label = bbpa_get_plugin_label();
    $settings = bbpa_get_settings();
    $debug_enabled = function_exists('bbpa_is_debug_mode_enabled')
        ? bbpa_is_debug_mode_enabled()
        : !empty($settings['debug_enabled']);
    $flag_assets = bbpa_get_flag_assets();

    $root_id = isset($overrides['root_id']) && is_string($overrides['root_id']) && $overrides['root_id'] !== ''
        ? $overrides['root_id']
        : 'bbpa-admin';
    $app_mode = isset($overrides['app_mode']) && is_string($overrides['app_mode']) && $overrides['app_mode'] !== ''
        ? $overrides['app_mode']
        : 'admin';
    $is_app_mode = $app_mode === 'app';
    $app_base_url = isset($overrides['app_base_url']) && is_string($overrides['app_base_url'])
        ? $overrides['app_base_url']
        : '';
    $panels = bbpa_get_admin_panels();
    if ($is_app_mode) {
        $panels = array_values(
            array_filter(
                $panels,
                static function (array $panel): bool {
                    return ($panel['name'] ?? '') !== 'settings';
                }
            )
        );
    }
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
    $disabled_panels = isset($settings['disabled_panels']) && is_array($settings['disabled_panels'])
        ? $settings['disabled_panels']
        : [];
    $pwa_assets = function_exists('bbpa_get_front_app_pwa_assets')
        ? bbpa_get_front_app_pwa_assets()
        : [];

    $asset_data = [
        'dependencies' => ['wp-element', 'wp-components', 'wp-i18n'],
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

    $asset_data['dependencies'] = isset($asset_data['dependencies']) && is_array($asset_data['dependencies'])
        ? $asset_data['dependencies']
        : [];
    if ($is_app_mode && !in_array('wp-components', $asset_data['dependencies'], true)) {
        $asset_data['dependencies'][] = 'wp-components';
    }
    $asset_data['version'] = bbpa_normalize_asset_version($asset_data['version'] ?? '');
    $admin_js_url = BBPA_URL . $admin_js_relative_path;
    if ($is_app_mode && function_exists('bbpa_get_pwa_asset_url')) {
        $admin_js_url = bbpa_get_pwa_asset_url('assets/js/admin.js');
    }

    wp_register_script(
        'bbpa-admin',
        $admin_js_url,
        $asset_data['dependencies'],
        $asset_data['version'],
        true
    );
    wp_enqueue_script('bbpa-admin');

    wp_register_style('bbpa-admin-boot-fallback', false, [], BBPA_VERSION);
    wp_enqueue_style('bbpa-admin-boot-fallback');
    wp_add_inline_style('bbpa-admin-boot-fallback', bbpa_get_admin_boot_fallback_css());
    wp_add_inline_script('bbpa-admin', bbpa_get_admin_boot_fallback_script($root_id), 'after');

    if ($is_app_mode && function_exists('bbpa_get_front_app_shell_inline_css')) {
        $front_app_background_color = isset($pwa_assets['background_color']) && is_string($pwa_assets['background_color'])
            ? $pwa_assets['background_color']
            : '';
        wp_register_style('bbpa-front-app-shell', false, [], BBPA_VERSION);
        wp_enqueue_style('bbpa-front-app-shell');
        wp_add_inline_style('bbpa-front-app-shell', bbpa_get_front_app_shell_inline_css($front_app_background_color));
    }

    if (bbpa_is_pro()) {
        wp_enqueue_media();
    }

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
    $admin_extra_css_url = '';

    foreach ($admin_extra_css_candidates as $candidate) {
        try {
            bbpa_safe_existing_file(BBPA_PATH, $candidate['path']);
            $admin_extra_css_url = $candidate['url'];
            break;
        } catch (RuntimeException | InvalidArgumentException $exception) {
            continue;
        }
    }

    if (
        $is_app_mode
        && function_exists('bbpa_get_pwa_asset_url')
        && function_exists('bbpa_resolve_front_app_pwa_asset_source_relative_path')
        && is_file(BBPA_PATH . bbpa_resolve_front_app_pwa_asset_source_relative_path('assets/css/style-build-admin.css'))
    ) {
        $admin_extra_css_url = bbpa_get_pwa_asset_url('assets/css/style-build-admin.css');
    }

    $admin_css_dependencies = [];

    if ($admin_extra_css_url !== '') {
        $admin_css_dependencies[] = 'bbpa-admin-extras';

        wp_enqueue_style(
            'bbpa-admin-extras',
            $admin_extra_css_url,
            [],
            $asset_data['version']
        );
        wp_style_add_data('bbpa-admin-extras', 'rtl', 'replace');
    }

    $admin_css_candidates = [
        ['path' => 'assets/css/style-admin.css', 'url' => BBPA_URL . 'assets/css/style-admin.css'],
        ['path' => 'build/style-admin.css', 'url' => BBPA_URL . 'build/style-admin.css'],
    ];
    $admin_css_url = '';

    foreach ($admin_css_candidates as $candidate) {
        try {
            bbpa_safe_existing_file(BBPA_PATH, $candidate['path']);
            $admin_css_url = $candidate['url'];
            break;
        } catch (RuntimeException | InvalidArgumentException $exception) {
            continue;
        }
    }

    if ($admin_css_url !== '' && function_exists('set_url_scheme')) {
        $admin_css_url = set_url_scheme($admin_css_url);
    }
    if ($is_app_mode && $admin_css_url !== '' && function_exists('bbpa_get_pwa_asset_url')) {
        $admin_css_url = bbpa_get_pwa_asset_url('assets/css/style-admin.css');
    }
    if (
        $is_app_mode
        && $admin_css_url === ''
        && function_exists('bbpa_get_pwa_asset_url')
        && function_exists('bbpa_resolve_front_app_pwa_asset_source_relative_path')
        && bbpa_resolve_front_app_pwa_asset_source_relative_path('assets/css/style-admin.css') !== 'assets/css/style-admin.css'
    ) {
        $admin_css_url = bbpa_get_pwa_asset_url('assets/css/style-admin.css');
    }

    if ($admin_css_url !== '') {
        wp_enqueue_style(
            'bbpa-admin',
            $admin_css_url,
            $admin_css_dependencies,
            $asset_data['version']
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

    // Explicit app-mode guard: always boot the admin application bundle/styles in app mode.
    if ($is_app_mode) {
        wp_enqueue_script('bbpa-admin');

        if (wp_style_is('bbpa-admin-extras', 'registered')) {
            wp_enqueue_style('bbpa-admin-extras');
        }

        if (wp_style_is('bbpa-admin', 'registered')) {
            wp_enqueue_style('bbpa-admin');
        }
    }

    bbpa_add_admin_color_scheme_styles();
    $rest_config = bbpa_get_js_rest_config();

    $localized_admin_payload = bbpa_build_admin_localized_payload(
        $root_id,
        $rest_config,
        $panels,
        $current_panel,
        $menu_label,
        $debug_enabled,
        $disabled_panels,
        $flag_assets,
        $app_mode,
        $app_base_url,
        $pwa_assets
    );

    $localized_admin_json = wp_json_encode($localized_admin_payload);
    if (is_string($localized_admin_json) && $localized_admin_json !== '') {
        wp_add_inline_script('bbpa-admin', 'window.BBPAAdmin = ' . $localized_admin_json . ';', 'before');
    }

    wp_add_inline_script(
        'bbpa-admin',
        'window.BBPA_DEBUG = ' . ($debug_enabled ? 'true' : 'false') . ';',
        'before'
    );

    wp_add_inline_script(
        'bbpa-admin',
        <<<'JS'
(function () {
    if (typeof window === 'undefined' || !window.location || !window.MutationObserver) {
        return;
    }

    var currentPageParams = new URLSearchParams(window.location.search);
    var pluginSlug = String(
        window.BBPAAdmin && window.BBPAAdmin.settings && window.BBPAAdmin.settings.slug
            ? window.BBPAAdmin.settings.slug
            : 'bimbeau-privacy-analytics'
    );
    var requestedTab = currentPageParams.get('bbpa_tab');
    var topPagesPage = pluginSlug + '-top-pages';
    var appSettings = window.BBPAAdmin && window.BBPAAdmin.settings
        ? window.BBPAAdmin.settings
        : {};
    var disabledPanels = Array.isArray(appSettings.disabledPanels) ? appSettings.disabledPanels : [];
    var availablePanels = Array.isArray(window.BBPAAdmin && window.BBPAAdmin.panels)
        ? window.BBPAAdmin.panels.map(function (panel) {
            return String(panel && panel.name ? panel.name : '');
        }).filter(Boolean)
        : [];
    var isPanelDisabled = function (panelName) {
        if (!panelName || panelName === 'dashboard') {
            return false;
        }

        if (disabledPanels.indexOf(panelName) !== -1) {
            return true;
        }

        return availablePanels.length > 0 && availablePanels.indexOf(panelName) === -1;
    };

    var summaryRoutes = [
        { key: 'visits', page: pluginSlug + '-visitors', panel: 'visitors' },
        { key: 'pageviews', page: topPagesPage, panel: 'top-pages' },
        { key: 'uniquereferrers', page: pluginSlug + '-referrers', panel: 'referrers' },
        { key: 'notfoundhits', page: topPagesPage, panel: 'top-pages', params: { bbpa_tab: 'not-found' } },
        { key: 'searchhits', page: pluginSlug + '-search-terms', panel: 'search-terms' }
    ];

    var isSummaryRouteEnabled = function (route) {
        var panelName = route && route.panel ? String(route.panel) : String(route.page || '').replace(pluginSlug + '-', '');
        return !isPanelDisabled(panelName);
    };

    var buildAdminUrl = function (page, params) {
        var url = new URL(window.location.href);
        url.searchParams.set('page', page);

        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];

            if (value === undefined || value === null || value === '') {
                url.searchParams.delete(key);
                return;
            }

            url.searchParams.set(key, value);
        });

        return url.toString();
    };

    var openDashboardSummaryCard = function (card, event) {
        if (!card) {
            return;
        }

        var href = card.getAttribute('data-bbpa-card-href');

        if (!href) {
            return;
        }

        if (event && event.target && typeof event.target.closest === 'function') {
            var interactiveTarget = event.target.closest('a, button, input, select, textarea, [role="button"], [role="link"]');
            if (interactiveTarget && interactiveTarget !== card) {
                return;
            }
        }

        window.location.assign(href);
    };

    var redirectIfDisabledPageRequested = function () {
        var page = currentPageParams.get('page');
        if (!page || page === pluginSlug) {
            return;
        }

        if (page.indexOf(pluginSlug + '-') !== 0) {
            return;
        }

        var panelName = page.replace(pluginSlug + '-', '');
        if (!isPanelDisabled(panelName)) {
            return;
        }

        window.location.replace(buildAdminUrl(pluginSlug, {}));
    };

    var decorateDashboardSummaryCards = function () {
        var page = currentPageParams.get('page');

        if (page !== pluginSlug) {
            return;
        }

        var cards = document.querySelectorAll('.bbpa-overview__summary .bbpa-overview__summary-card');

        summaryRoutes.forEach(function (route, index) {
            var card = cards[index];

            if (!card) {
                return;
            }

            if (!isSummaryRouteEnabled(route)) {
                card.classList.remove('bbpa-overview__summary-card--interactive');
                card.removeAttribute('role');
                card.removeAttribute('tabindex');
                card.removeAttribute('aria-label');
                card.removeAttribute('data-bbpa-card-href');
                return;
            }

            var label = card.querySelector('.bbpa-kpi-card__label');
            if (!label) {
                return;
            }

            card.classList.add('bbpa-overview__summary-card--interactive');
            card.setAttribute('role', 'link');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', (label.textContent || '').trim());
            card.setAttribute(
                'data-bbpa-card-href',
                buildAdminUrl(route.page, route.params || {})
            );

            if (card.dataset.lsCardBound !== 'true') {
                card.addEventListener('click', function (event) {
                    openDashboardSummaryCard(card, event);
                });
                card.addEventListener('keydown', function (event) {
                    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
                        return;
                    }

                    event.preventDefault();
                    openDashboardSummaryCard(card, event);
                });
                card.dataset.lsCardBound = 'true';
            }
        });
    };

    var activateRequestedTopPagesTab = function () {
        var page = currentPageParams.get('page');

        if (page !== topPagesPage || requestedTab !== 'not-found') {
            return;
        }

        var tabs = document.querySelectorAll('.bbpa-pages-tabs .components-tab-panel__tabs button');
        tabs.forEach(function (button) {
            var label = (button.textContent || '').toLowerCase();
            var isPagesNotFoundTab = label.indexOf('pages not found') !== -1 || label.indexOf('404') !== -1;
            if (isPagesNotFoundTab && button.getAttribute('aria-selected') !== 'true') {
                button.click();
            }
        });
    };

    var observer = new window.MutationObserver(function () {
        decorateDashboardSummaryCards();
        activateRequestedTopPagesTab();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    redirectIfDisabledPageRequested();
    decorateDashboardSummaryCards();
    activateRequestedTopPagesTab();
}());
JS,
        'after'
    );

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
        '            if (!node || node.dataset && node.dataset.lsFlagApplied) {',
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
        "                node.dataset.lsFlagApplied = 'true';",
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
    array $disabled_panels,
    array $flag_assets,
    string $app_mode,
    string $app_base_url,
    array $pwa_assets
): array {
    $sanitize_url = static function ($value): string {
        return is_string($value) ? esc_url_raw($value) : '';
    };
    $settings = bbpa_get_settings();
    $is_white_label = bbpa_is_pro() && (bool) rest_sanitize_boolean($settings['white_label_enabled'] ?? false);

    $sanitize_generated_icons = static function ($icons) use ($sanitize_url): array {
        if (!is_array($icons)) {
            return [];
        }

        $normalized = [];
        foreach ($icons as $size => $url) {
            $normalized[sanitize_key((string) $size)] = $sanitize_url($url);
        }

        return $normalized;
    };

    return [
        'rootId' => sanitize_key($root_id),
        'currentUserId' => get_current_user_id(),
        'restNonce' => wp_create_nonce('wp_rest'),
        'appNonce' => wp_create_nonce('bbpa_app_session'),
        'restUrl' => $sanitize_url($rest_config['rest_url'] ?? ''),
        'roles' => bbpa_get_roles_for_admin(),
        'panels' => $panels,
        'restSources' => bbpa_get_rest_sources(),
        'features' => bbpa_features(),
        'currentPanel' => sanitize_key($current_panel),
        'settings' => [
            'restNamespace' => sanitize_text_field((string) ($rest_config['rest_namespace'] ?? '')),
            'restInternalNamespace' => sanitize_text_field((string) ($rest_config['rest_internal_namespace'] ?? '')),
            'pluginVersion' => BBPA_VERSION,
            'privacyMode' => function_exists('bbpa_get_privacy_mode')
                ? sanitize_key(bbpa_get_privacy_mode())
                : 'essential',
            'adminCacheVersion' => bbpa_get_admin_cache_version(),
            'slug' => sanitize_key(BBPA_SLUG),
            'pluginLabel' => sanitize_text_field($menu_label),
            'brandLogoUrl' => $sanitize_url(BBPA_URL . 'assets/images/bbpa-logo-compact.svg'),
            'isWhiteLabel' => $is_white_label,
            'timezoneString' => sanitize_text_field((string) wp_timezone_string()),
            'gmtOffset' => (float) get_option('gmt_offset', 0),
            'locale' => sanitize_text_field((string) get_locale()),
            'dateFormat' => sanitize_text_field((string) get_option('date_format', '')),
            'timeFormat' => sanitize_text_field((string) get_option('time_format', '')),
            'upgradeUrl' => $sanitize_url(bbpa_get_upgrade_url()),
            'premiumLockImageBaseUrl' => bbpa_is_pro()
                ? $sanitize_url(trailingslashit(BBPA_URL . 'assets/images'))
                : '',
            'debugEnabled' => $debug_enabled,
            'isPro' => bbpa_is_pro(),
            'supportsXlsxExport' => class_exists('ZipArchive'),
            'exportMaxRows' => max(1, (int) apply_filters('bbpa_export_max_rows', 10000)),
            'fieldVisibilityMatrix' => function_exists('bbpa_get_ui_field_visibility_matrix') ? bbpa_get_ui_field_visibility_matrix() : [],
            'disabledPanels' => array_values(array_map('sanitize_key', $disabled_panels)),
            'postTypes' => bbpa_get_post_types_for_admin(),
            'flagAssets' => $flag_assets,
            'appMode' => sanitize_key($app_mode),
            'appBaseUrl' => $sanitize_url($app_base_url),
            'pwa' => [
                'appUrl' => $sanitize_url(function_exists('bbpa_get_front_app_url') ? bbpa_get_front_app_url() : home_url('/bbpa-app/')),
                'serviceWorkerUrl' => $sanitize_url($pwa_assets['service_worker_url'] ?? ''),
                'installPromptMode' => sanitize_key(bbpa_get_front_app_install_prompt_mode()),
                'manifestUrl' => $sanitize_url($pwa_assets['manifest_url'] ?? ''),
                'previewIconUrl' => $sanitize_url($pwa_assets['preview_icon_url'] ?? ''),
                'appleTouchIconUrl' => $sanitize_url($pwa_assets['apple_touch_icon'] ?? ''),
                'loadingIconUrl' => $sanitize_url($pwa_assets['loading_icon'] ?? ''),
                'fallbackIconUrl' => $sanitize_url($pwa_assets['fallback_icon_url'] ?? ''),
                'generatedIcons' => $sanitize_generated_icons($pwa_assets['generated_icons'] ?? []),
                'iconSource' => sanitize_key((string) ($pwa_assets['icon_source'] ?? 'fallback')),
                'iconGenerationStatus' => sanitize_key((string) ($pwa_assets['icon_generation_status'] ?? 'fallback')),
                'iconGenerationMessage' => sanitize_text_field((string) ($pwa_assets['icon_generation_message'] ?? '')),
                'labels' => [
                    'previewTitle' => __('Current PWA icon preview', 'bimbeau-privacy-analytics'),
                    'previewHelp' => __('Preview uses the same runtime icon resolution as the standalone app manifest and loading splash.', 'bimbeau-privacy-analytics'),
                    'sourceLabel' => __('Source', 'bimbeau-privacy-analytics'),
                    'statusLabel' => __('Generation status', 'bimbeau-privacy-analytics'),
                    'sourceCustom' => __('Custom generated icon', 'bimbeau-privacy-analytics'),
                    'sourceFallback' => __('Plugin fallback icon', 'bimbeau-privacy-analytics'),
                    'stateReady' => __('Custom icon set is ready.', 'bimbeau-privacy-analytics'),
                    'stateFallback' => __('Fallback icon set is active.', 'bimbeau-privacy-analytics'),
                    'stateTooSmall' => __('Source image is too small (minimum 512x512).', 'bimbeau-privacy-analytics'),
                    'stateInvalidSource' => __('Source image is invalid.', 'bimbeau-privacy-analytics'),
                    'stateGenerationFailed' => __('Icon generation failed on this server.', 'bimbeau-privacy-analytics'),
                    'stateUnknown' => __('Unknown generation status.', 'bimbeau-privacy-analytics'),
                    'unknownValue' => __('Unknown', 'bimbeau-privacy-analytics'),
                    'noPreview' => __('No preview icon URL is available.', 'bimbeau-privacy-analytics'),
                ],
                'version' => BBPA_VERSION,
            ],
        ],
    ];
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
            text.indexOf('lean stats cannot load the admin interface') !== -1 ||
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

    var formatCityLabel = function (item) {
        if (!item) {
            return __('Unknown', 'bimbeau-privacy-analytics');
        }

        var city = item.city_name || item.label || __('Unknown', 'bimbeau-privacy-analytics');
        var region = item.region_code || '';
        var country = item.country_code || '';
        var parts = [city];

        if (region) {
            parts.push(region);
        }

        if (country) {
            parts.push(country);
        }

        return parts.join(', ');
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

    var getPremiumLockFallbackImageUrl = function () {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgb(56, 88, 233)"/><stop offset="100%" stop-color="#2145e6"/></linearGradient></defs><rect width="960" height="540" fill="url(#bg)"/><text x="60" y="260" fill="white" font-family="Arial, sans-serif" font-size="52" font-weight="700">Geolocation analytics</text><text x="60" y="320" fill="white" font-family="Arial, sans-serif" font-size="32">BimBeau Privacy Analytics Pro</text></svg>';
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    var getPremiumLockImageUrl = function () {
        var baseUrl = String(
            adminConfig.settings && adminConfig.settings.premiumLockImageBaseUrl
                ? adminConfig.settings.premiumLockImageBaseUrl
                : ''
        );

        return baseUrl ? baseUrl + 'geolocation.jpeg' : getPremiumLockFallbackImageUrl();
    };

    var ProBadge = function () {
        return el(
            'span',
            { className: 'bbpa-pro-badge' },
            __('Pro', 'bimbeau-privacy-analytics')
        );
    };

    var PremiumLockCard = function () {
        var upgradeUrl = adminConfig.settings && adminConfig.settings.upgradeUrl
            ? adminConfig.settings.upgradeUrl
            : '';
        var imageUrl = getPremiumLockImageUrl();

        return el(
            Card,
            {
                className: 'bbpa-premium-lock-card',
            },
            el(
                CardBody,
                null,
                el(
                    'a',
                    {
                        className: 'bbpa-premium-lock-card__image-link',
                        href: upgradeUrl || undefined,
                        target: '_blank',
                        rel: 'noreferrer',
                    },
                    el('img', {
                        className: 'bbpa-premium-lock-card__image',
                        src: imageUrl,
                        alt: __('Top ' + 'cities', 'bimbeau-privacy-analytics'),
                        onError: function (event) {
                            event.currentTarget.src = getPremiumLockFallbackImageUrl();
                        },
                    })
                ),
                el('p', null, __('City map markers are available in BimBeau Privacy Analytics ', 'bimbeau-privacy-analytics'), el(ProBadge, null)),
                upgradeUrl && Button
                    ? el(
                            Button,
                            {
                                variant: 'primary',
                                href: upgradeUrl,
                                target: '_blank',
                                rel: 'noreferrer',
                            },
                            __('Upgrade to Pro', 'bimbeau-privacy-analytics')
                      )
                    : null
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

    var CityBreakdownPanel = function () {
        var isPro = Boolean(adminConfig.settings && adminConfig.settings.isPro);
        if (!isPro) {
            return null;
        }
        var state = useGeolocationEndpoint('/geo-' + 'cities');

        return el(
            'div',
            { className: 'bbpa-geo-countries-panel__split' },
            el(GeolocationTableCard, {
                title: __('Top ' + 'cities', 'bimbeau-privacy-analytics'),
                labelHeader: __('City', 'bimbeau-privacy-analytics'),
                metricLabel: __('Visits', 'bimbeau-privacy-analytics'),
                emptyLabel: __('No city data available for the selected period.', 'bimbeau-privacy-analytics'),
                labelFormatter: formatCityLabel,
                valueKey: 'visits',
                items: state.items,
                isLoading: state.isLoading,
                error: state.error,
                notice: null,
            })
        );
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
                        tabs: Boolean(adminConfig.settings && adminConfig.settings.isPro) ? [
                            { name: 'countries', title: __('Top countries', 'bimbeau-privacy-analytics') },
                            { name: 'cities', title: __('Top ' + 'cities', 'bimbeau-privacy-analytics') },
                        ] : [
                            { name: 'countries', title: __('Top countries', 'bimbeau-privacy-analytics') },
                        ],
                    },
                    function (tab) {
                        if (tab && tab.name === 'cities') {
                            return el(CityBreakdownPanel, null);
                        }

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
 * This inline fallback keeps the settings geolocation controls operational without
 * requiring a fresh JavaScript build (`npm run build`) when bundled assets lag behind.
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
        title.textContent = 'GeoIP database fallback';

        var description = document.createElement('p');
        description.style.marginTop = '0';
        description.style.marginBottom = '8px';
        description.textContent =
            'This fallback keeps geolocation settings operational when admin bundles are stale, without requiring npm run build.';

        var controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '8px';
        controls.style.flexWrap = 'wrap';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = 'Update GeoIP database';
        button.setAttribute('data-bbpa-geoip-update-button', 'true');

        var status = document.createElement('p');
        status.style.margin = '0';
        status.style.fontSize = '13px';
        status.style.lineHeight = '1.5';
        status.setAttribute('data-bbpa-geoip-status', 'true');
        status.textContent = 'Loading GeoIP database status…';

        var notice = document.createElement('div');
        notice.style.marginTop = '8px';
        notice.setAttribute('data-bbpa-geoip-notice', 'true');

        controls.appendChild(button);
        controls.appendChild(status);
        shell.appendChild(title);
        shell.appendChild(description);
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
        var state = database.status ? String(database.status) : (installed ? 'ready' : 'not_installed');
        var updated = Number(database.last_updated || 0);
        var updatedLabel = updated ? new Date(updated * 1000).toLocaleString() : '—';
        var nextScheduled = Number(database.next_scheduled || 0);
        var nextScheduledLabel = nextScheduled ? new Date(nextScheduled * 1000).toLocaleString() : '—';

        statusNode.textContent =
            'Status: ' + state + ' · Installed: ' + (installed ? 'yes' : 'no') + ' · Last update: ' + updatedLabel + ' · Next run: ' + nextScheduledLabel;
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
                            var message = payload && payload.message ? payload.message : 'GeoIP request failed.';
                            throw new Error(message);
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
                renderNotice(shell, 'error', error && error.message ? error.message : 'Unable to load GeoIP database status.');
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
            renderNotice(shell, 'info', 'GeoIP database update in progress…');

            fetchJson('/admin/geoip-database/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
                .then(function (payload) {
                    var message = payload && payload.message
                        ? payload.message
                        : 'GeoIP database update completed.';
                    renderNotice(shell, 'success', message);
                    return refreshStatus(shell);
                })
                .catch(function (error) {
                    renderNotice(shell, 'error', error && error.message ? error.message : 'Unable to update the GeoIP database.');
                })
                .finally(function () {
                    button.disabled = false;
                });
        });

        shell.setAttribute('data-bbpa-geoip-bound', 'true');
    };

    var mountFallback = function () {
        if (!matchesGeolocationContext()) {
            return;
        }

        var container = getFallbackContainer();
        if (!container) {
            return;
        }

        var shell =
            container.querySelector('[data-bbpa-geoip-fallback="true"]') ||
            createFallbackShell(container);

        if (!shell) {
            return;
        }

        wireActions(shell);
        refreshStatus(shell);
    };

    var observer = new MutationObserver(function () {
        mountFallback();
    });

    observer.observe(document.body, { childList: true, subtree: true });
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
 * Get admin panels configuration.
 */
function bbpa_get_admin_panels(): array
{
    $settings = bbpa_get_settings();
    $disabled_panels = bbpa_get_effective_hidden_panels($settings);

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
            'name' => 'events',
            'title' => __('Events', 'bimbeau-privacy-analytics'),
            'type' => 'core',
            'availability' => 'pro',
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

        $normalized[] = [
            'name' => $name,
            'title' => isset($panel['title']) ? wp_strip_all_tags((string) $panel['title']) : $name,
            'type' => isset($panel['type']) ? sanitize_key($panel['type']) : 'custom',
            'availability' => isset($panel['availability'])
                ? sanitize_key((string) $panel['availability'])
                : 'free',
        ];
    }

    if (!bbpa_is_pro()) {
        $normalized = array_values(
            array_filter(
                $normalized,
                static function (array $panel): bool {
                    return ($panel['availability'] ?? 'free') !== 'pro';
                }
            )
        );
    }

    if (empty($disabled_panels)) {
        return $normalized;
    }

    return array_values(
        array_filter(
            $normalized,
            static function (array $panel) use ($disabled_panels): bool {
                $name = $panel['name'] ?? '';
                if ($name === 'dashboard') {
                    return true;
                }

                return !in_array($name, $disabled_panels, true);
            }
        )
    );
}

/**
 * Get the effective hidden panels list from settings and consent-gated advanced stats.
 */
function bbpa_get_effective_hidden_panels(array $settings): array
{
    $hidden_panels = bbpa_normalize_disabled_panels($settings['disabled_panels'] ?? []);
    $is_advanced_stats_enabled = !isset($settings['advanced_stats_enabled'])
        || rest_sanitize_boolean($settings['advanced_stats_enabled']);

    if ($is_advanced_stats_enabled) {
        return $hidden_panels;
    }

    $consent_gated_panels = ['geolocation', 'visitors', 'devices', 'events', 'realtime'];
    return array_values(array_unique(array_merge($hidden_panels, $consent_gated_panels)));
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
            'key' => 'events-config',
            'method' => 'GET',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/events-config',
        ],
        [
            'key' => 'events-preview',
            'method' => 'POST',
            'namespace' => BBPA_REST_INTERNAL_NAMESPACE,
            'path' => '/admin/events-preview',
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

    if (!bbpa_is_pro()) {
        $filtered = array_values(
            array_filter(
                $filtered,
                static function (array $source): bool {
                    $key = isset($source['key']) ? sanitize_key((string) $source['key']) : '';
                    return !in_array($key, ['events-config', 'events-preview'], true);
                }
            )
        );
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

        $normalized[] = [
            'key' => $key,
            'method' => $method,
            'namespace' => $namespace,
            'path' => $path,
            'availability' => isset($source['availability'])
                ? sanitize_key((string) $source['availability'])
                : 'free',
        ];
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
