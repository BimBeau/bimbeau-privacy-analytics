<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register rewrite rules for the front BimBeau Privacy Analytics app shell.
 */
function bbpa_register_front_app_rewrite_rules(): void
{
    add_rewrite_rule(
        '^bbpa/pwa-assets/(.+)$',
        'index.php?bbpa_pwa_asset=$matches[1]',
        'top'
    );

    add_rewrite_rule(
        '^bbpa/service-worker\.js/?$',
        'index.php?bbpa_sw=1',
        'top'
    );

    add_rewrite_rule(
        '^bbpa/manifest\.webmanifest/?$',
        'index.php?bbpa_manifest=1',
        'top'
    );

    add_rewrite_rule(
        '^bbpa/sw\.js/?$',
        'index.php?bbpa_sw=1',
        'top'
    );

    add_rewrite_rule(
        '^bbpa/?$',
        'index.php?bbpa_app=1',
        'top'
    );

    add_rewrite_rule(
        '^bbpa/([^/]+)/?$',
        'index.php?bbpa_app=1&bbpa_panel=$matches[1]',
        'top'
    );
}

/**
 * Check whether current request targets a front app PWA endpoint path.
 */
function bbpa_is_front_app_pwa_endpoint_request(): bool
{
    if (!isset($_SERVER['REQUEST_URI'])) {
        return false;
    }

    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
    $request_path = wp_parse_url($request_uri, PHP_URL_PATH);
    if (!is_string($request_path) || $request_path === '') {
        return false;
    }

    $normalized_request_path = untrailingslashit(rawurldecode($request_path));
    $manifest_path = untrailingslashit((string) wp_parse_url(home_url('/bbpa/manifest.webmanifest'), PHP_URL_PATH));
    $service_worker_path = untrailingslashit((string) wp_parse_url(home_url('/bbpa/service-worker.js'), PHP_URL_PATH));

    return $normalized_request_path === $manifest_path || $normalized_request_path === $service_worker_path;
}

/**
 * Prevent canonical redirects on front app PWA endpoints.
 */
function bbpa_disable_front_app_pwa_canonical_redirect($redirect_url)
{
    if (
        (string) get_query_var('bbpa_manifest') === '1'
        || (string) get_query_var('bbpa_sw') === '1'
        || bbpa_is_front_app_pwa_endpoint_request()
    ) {
        return false;
    }

    return $redirect_url;
}

/**
 * Send anti-clickjacking headers for front app shell responses.
 */
function bbpa_send_front_app_frame_protection_headers(): void
{
    header('X-Frame-Options: SAMEORIGIN');
    header("Content-Security-Policy: frame-ancestors 'self'");
}

/**
 * Disable page caches and HTML optimization for the isolated front app shell document only.
 */
function bbpa_prepare_front_app_shell_no_cache(): void
{
    foreach (['DONOTCACHEPAGE', 'DONOTMINIFY', 'DONOTCDN'] as $constant_name) {
        if (!defined($constant_name)) {
            define($constant_name, true);
        }
    }

    if (has_action('litespeed_control_set_nocache')) {
        do_action('litespeed_control_set_nocache', 'bbpa_front_app_shell');
    }

    header_remove('Cache-Control');
    nocache_headers();
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
    header('Pragma: no-cache');
    header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
}

/**
 * Register custom query vars used by the front BimBeau Privacy Analytics app shell.
 */
function bbpa_register_front_app_query_vars(array $query_vars): array
{
    $query_vars[] = 'bbpa_app';
    $query_vars[] = 'bbpa_panel';
    $query_vars[] = 'bbpa_manifest';
    $query_vars[] = 'bbpa_sw';
    $query_vars[] = 'bbpa_pwa_asset';

    return $query_vars;
}

function bbpa_get_pwa_asset_base_path(): string
{
    return '/bbpa/pwa-assets/';
}

function bbpa_get_pwa_asset_base_url(): string
{
    return untrailingslashit(home_url(bbpa_get_pwa_asset_base_path()));
}

function bbpa_get_pwa_asset_url(string $relative_asset_path): string
{
    $normalized_asset_path = bbpa_normalize_front_app_pwa_asset_relative_path($relative_asset_path);
    if ($normalized_asset_path === '') {
        return bbpa_get_front_app_url();
    }

    return add_query_arg('bbpa_pwa_asset', $normalized_asset_path, bbpa_get_front_app_url());
}

function bbpa_resolve_front_app_pwa_asset_relative_path(): string
{
    $asset_relative_path = (string) get_query_var('bbpa_pwa_asset');
    if ($asset_relative_path !== '') {
        return bbpa_normalize_front_app_pwa_asset_relative_path($asset_relative_path);
    }

    $asset_query_arg = bbpa_request_get_string(
        $_GET, // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only PWA asset routing query arg, no state change.
        'bbpa_pwa_asset'
    );
    if ($asset_query_arg !== '') {
        return bbpa_normalize_front_app_pwa_asset_relative_path($asset_query_arg);
    }

    if (!isset($_SERVER['REQUEST_URI'])) {
        return '';
    }

    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
    $request_path = wp_parse_url($request_uri, PHP_URL_PATH);
    if (!is_string($request_path) || $request_path === '') {
        return '';
    }

    $normalized_request_path = '/' . ltrim(rawurldecode($request_path), '/');
    $asset_base_path = bbpa_get_pwa_asset_base_path();
    if (strpos($normalized_request_path, $asset_base_path) !== 0) {
        return '';
    }

    return bbpa_normalize_front_app_pwa_asset_relative_path(substr($normalized_request_path, strlen($asset_base_path)));
}


function bbpa_normalize_front_app_pwa_asset_relative_path(string $asset_relative_path): string
{
    $normalized = trim($asset_relative_path);
    if ($normalized === '') {
        return '';
    }

    $normalized = ltrim($normalized, '/');

    if (substr($normalized, -1) === '/') {
        $normalized = rtrim($normalized, '/');
    }

    return $normalized;
}

function bbpa_resolve_front_app_pwa_asset_source_relative_path(string $asset_relative_path): string
{
    $normalized_asset_path = bbpa_normalize_front_app_pwa_asset_relative_path($asset_relative_path);
    if ($normalized_asset_path === '') {
        return '';
    }

    if (!bbpa_is_allowed_front_app_pwa_asset_path($normalized_asset_path)) {
        return '';
    }

    if (is_file(BBPA_PATH . $normalized_asset_path)) {
        return $normalized_asset_path;
    }

    $source_fallbacks = [
        'assets/js/admin.js' => 'build/admin.js',
        'assets/css/style-admin.css' => 'build/style-admin.css',
        'assets/css/style-build-admin.css' => 'build/style-style-admin.css',
        'assets/css/style-style-admin.css' => 'build/style-style-admin.css',
    ];

    $fallback_asset_path = $source_fallbacks[$normalized_asset_path] ?? '';
    if ($fallback_asset_path !== '' && is_file(BBPA_PATH . $fallback_asset_path)) {
        return $fallback_asset_path;
    }

    return $normalized_asset_path;
}

function bbpa_maybe_render_front_app_pwa_asset(): void
{
    $asset_relative_path = bbpa_resolve_front_app_pwa_asset_relative_path();
    if ($asset_relative_path === '') {
        return;
    }

    if (!bbpa_is_allowed_front_app_pwa_asset_path($asset_relative_path)) {
        status_header(404);
        exit;
    }

    $extension = strtolower((string) pathinfo($asset_relative_path, PATHINFO_EXTENSION));
    $allowed_extensions = ['js', 'css', 'png', 'svg', 'jpg', 'jpeg', 'webp', 'woff', 'woff2'];
    if (!in_array($extension, $allowed_extensions, true)) {
        status_header(404);
        exit;
    }

    $plugin_root_realpath = realpath(BBPA_PATH);
    $asset_source_relative_path = bbpa_resolve_front_app_pwa_asset_source_relative_path($asset_relative_path);
    $asset_file_realpath = realpath(BBPA_PATH . ltrim($asset_source_relative_path, '/'));
    if (!is_string($plugin_root_realpath) || !is_string($asset_file_realpath)) {
        status_header(404);
        exit;
    }

    if (strpos($asset_file_realpath, trailingslashit($plugin_root_realpath)) !== 0 || !is_file($asset_file_realpath)) {
        status_header(404);
        exit;
    }

    $content_types = [
        'js' => 'application/javascript',
        'css' => 'text/css',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
    ];

    status_header(200);
    header('Content-Type: ' . $content_types[$extension]);
    if ($extension === 'js' || $extension === 'css') {
        header('Cache-Control: public, max-age=31536000, immutable');
    }

    // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Static PWA assets are served as vetted plugin files in a raw HTTP response.
    readfile($asset_file_realpath);
    exit;
}

function bbpa_is_allowed_front_app_pwa_asset_path(string $asset_relative_path): bool
{
    if (
        $asset_relative_path === ''
        || strpos($asset_relative_path, '..') !== false
        || strpos($asset_relative_path, "\0") !== false
        || preg_match('#(^|/)\.#', $asset_relative_path) === 1
    ) {
        return false;
    }

    $extension = strtolower((string) pathinfo($asset_relative_path, PATHINFO_EXTENSION));
    $allowed_extensions = ['js', 'css', 'png', 'svg', 'jpg', 'jpeg', 'webp', 'woff', 'woff2'];

    return in_array($extension, $allowed_extensions, true);
}

/**
 * Resolve PWA icon URLs, colors, manifest URL, and service worker URL for front app shell.
 */
function bbpa_get_front_app_pwa_assets(): array
{
    $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
    $theme_color = isset($settings['pwa_theme_color']) ? sanitize_hex_color((string) $settings['pwa_theme_color']) : null;
    $generated_icons = isset($settings['pwa_icon_generated_icons']) && is_array($settings['pwa_icon_generated_icons'])
        ? $settings['pwa_icon_generated_icons']
        : [];
    $custom_icon_url = isset($settings['pwa_icon_url']) ? esc_url_raw((string) $settings['pwa_icon_url']) : '';
    $generation_status = isset($settings['pwa_icon_generation_status'])
        ? sanitize_key((string) $settings['pwa_icon_generation_status'])
        : 'fallback';
    $has_generated_icons = !empty($generated_icons) && $generation_status === 'ready';
    if (
        !$has_generated_icons
        && $custom_icon_url !== ''
        && function_exists('bbpa_resolve_pwa_icon_attachment_id')
        && function_exists('bbpa_generate_pwa_icons_from_attachment')
    ) {
        $attachment_id = bbpa_resolve_pwa_icon_attachment_id(
            $custom_icon_url,
            absint($settings['pwa_icon_attachment_id'] ?? 0)
        );
        if ($attachment_id > 0) {
            $generation = bbpa_generate_pwa_icons_from_attachment($attachment_id);
            $generated_icons = is_array($generation['icons']) ? $generation['icons'] : [];
            $generation_status = sanitize_key((string) ($generation['status'] ?? 'fallback'));
            $has_generated_icons = !empty($generated_icons) && $generation_status === 'ready';

            $settings['pwa_icon_attachment_id'] = $attachment_id;
            $settings['pwa_icon_generated_icons'] = $generated_icons;
            $settings['pwa_icon_generation_status'] = $generation_status;
            $settings['pwa_icon_generation_message'] = sanitize_text_field((string) ($generation['message'] ?? ''));
            update_option('bbpa_settings', $settings, false);
        }
    }

    $icons = bbpa_get_front_app_default_pwa_icons();
    if ($has_generated_icons) {
        $icons = bbpa_get_front_app_generated_pwa_icons($generated_icons);
    }
    $fallback_icon_url = bbpa_get_pwa_asset_url('assets/images/bbpa-pwa-icon-maskable-512x512.png');
    $apple_touch_icon = $has_generated_icons && !empty($generated_icons['192'])
        ? esc_url_raw((string) $generated_icons['192'])
        : $fallback_icon_url;
    $loading_icon = $has_generated_icons && !empty($generated_icons['192'])
        ? esc_url_raw((string) $generated_icons['192'])
        : $fallback_icon_url;

    return [
        'name' => __('BimBeau Privacy Analytics', 'bimbeau-privacy-analytics'),
        'short_name' => __('BimBeau Privacy Analytics', 'bimbeau-privacy-analytics'),
        'description' => __('BimBeau Privacy Analytics front analytics app.', 'bimbeau-privacy-analytics'),
        'theme_color' => is_string($theme_color) ? $theme_color : '#ff0000',
        'background_color' => is_string($theme_color) ? $theme_color : '#ff0000',
        'start_url' => bbpa_get_front_app_url(),
        'scope' => home_url('/bbpa/'),
        'manifest_url' => home_url('/bbpa/manifest.webmanifest'),
        'service_worker_url' => home_url('/bbpa/service-worker.js'),
        'icons' => $icons,
        'apple_touch_icon' => $apple_touch_icon,
        'loading_icon' => $loading_icon,
        'icon_source' => $has_generated_icons ? 'custom' : 'fallback',
        'preview_icon_url' => $loading_icon,
        'fallback_icon_url' => $fallback_icon_url,
        'generated_icons' => $generated_icons,
        'icon_generation_status' => $generation_status,
        'icon_generation_message' => sanitize_text_field((string) ($settings['pwa_icon_generation_message'] ?? '')),
        'shell_color_version' => is_string($theme_color) ? md5($theme_color) : 'default',
    ];
}

/**
 * Build default fallback favicon entries for the app manifest.
 */
function bbpa_get_front_app_default_pwa_icons(): array
{
    $icon_relative_path = 'assets/images/bbpa-pwa-icon-maskable-512x512.png';
    if (!is_file(BBPA_PATH . $icon_relative_path)) {
        return [];
    }

    return [
        [
            'src' => bbpa_get_pwa_asset_url($icon_relative_path),
            'sizes' => '512x512',
            'type' => 'image/png',
            'purpose' => 'any maskable',
        ],
    ];
}

/**
 * Build generated PNG icon entries for the app manifest.
 */
function bbpa_get_front_app_generated_pwa_icons(array $generated_icons): array
{
    $icons = [];
    foreach ([72, 96, 128, 144, 152, 192, 384, 512] as $size) {
        $key = (string) $size;
        if (!isset($generated_icons[$key])) {
            continue;
        }
        $src = esc_url_raw((string) $generated_icons[$key]);
        if ($src === '') {
            continue;
        }

        $icons[] = [
            'src' => $src,
            'sizes' => $size . 'x' . $size,
            'type' => 'image/png',
        ];
    }

    if (!empty($generated_icons['512'])) {
        $icons[] = [
            'src' => esc_url_raw((string) $generated_icons['512']),
            'sizes' => '512x512',
            'type' => 'image/png',
            'purpose' => 'maskable',
        ];
    }

    return $icons;
}

/**
 * Render front app web manifest route.
 */
function bbpa_maybe_render_front_app_manifest(): void
{
    $manifest_query_var = get_query_var('bbpa_manifest');
    $is_manifest_request = (string) $manifest_query_var === '1';

    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only PWA route detection; does not mutate state.
    $manifest_query_arg = bbpa_request_get_string($_GET, 'bbpa_manifest');
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only PWA route detection; does not mutate state.
    if (!$is_manifest_request && array_key_exists('bbpa_manifest', $_GET)) {
        $is_manifest_request = $manifest_query_arg === '1';
    }

    if (!$is_manifest_request && bbpa_is_front_app_pwa_endpoint_request()) {
        $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
        $request_path = wp_parse_url($request_uri, PHP_URL_PATH);
        $manifest_path = (string) wp_parse_url(home_url('/bbpa/manifest.webmanifest'), PHP_URL_PATH);
        $is_manifest_request = is_string($request_path)
            && untrailingslashit(rawurldecode($request_path)) === untrailingslashit($manifest_path);
    }

    if (!$is_manifest_request) {
        return;
    }

    $pwa_assets = bbpa_get_front_app_pwa_assets();

    $manifest = [
        'name' => $pwa_assets['name'],
        'short_name' => $pwa_assets['short_name'],
        'description' => $pwa_assets['description'],
        'start_url' => $pwa_assets['start_url'],
        'scope' => $pwa_assets['scope'],
        'display' => 'standalone',
        'theme_color' => $pwa_assets['theme_color'],
        'background_color' => $pwa_assets['background_color'],
        'icons' => $pwa_assets['icons'],
    ];

    status_header(200);
    nocache_headers();
    header('Content-Type: application/manifest+json; charset=' . get_option('blog_charset'));

    $encoded_manifest = wp_json_encode($manifest);
    if (!is_string($encoded_manifest)) {
        status_header(500);
        exit;
    }

    // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON manifest responses must be emitted as encoded JSON, not HTML-escaped.
    echo $encoded_manifest;
    exit;
}

/**
 * Build front app service-worker script content.
 */
function bbpa_build_front_app_service_worker_script(array $pwa_assets, string $plugin_version, array $active_cache_versions = []): string
{
    $normalized_plugin_version = strtolower((string) preg_replace('/[^a-z0-9.-]/i', '', $plugin_version));
    if (!is_string($normalized_plugin_version) || $normalized_plugin_version === '') {
        $normalized_plugin_version = '0.0.0';
    }

    $cache_name = 'bbpa-v' . $normalized_plugin_version;
    $active_versions = [];
    foreach ($active_cache_versions as $active_version) {
        if (!is_scalar($active_version)) {
            continue;
        }

        $normalized_active_version = strtolower((string) preg_replace('/[^a-z0-9.-]/i', '', (string) $active_version));
        if (!is_string($normalized_active_version) || $normalized_active_version === '') {
            continue;
        }

        $active_versions[] = 'bbpa-v' . $normalized_active_version;
    }

    if (!in_array($cache_name, $active_versions, true)) {
        $active_versions[] = $cache_name;
    }

    $start_url = $pwa_assets['start_url'];
    $manifest_url = $pwa_assets['manifest_url'];
    $offline_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BimBeau Privacy Analytics</title></head><body><main style="font-family:system-ui,-apple-system,sans-serif;margin:2rem;"><h1 style="font-size:1.25rem;">BimBeau Privacy Analytics</h1><p style="font-size:0.95rem;line-height:1.5;">Offline. Reconnect to load analytics data.</p></main></body></html>';
    $cache_name_json = wp_json_encode($cache_name);
    $active_cache_names_json = wp_json_encode(array_values(array_unique($active_versions)));
    $start_url_json = wp_json_encode($start_url);
    $manifest_url_json = wp_json_encode($manifest_url);
    $offline_html_json = wp_json_encode($offline_html);

    return implode("\n", [
        "const CACHE_NAME = {$cache_name_json};",
        "const ACTIVE_CACHE_NAMES = {$active_cache_names_json};",
        "const APP_SHELL_URLS = [{$manifest_url_json}];",
        "const OFFLINE_HTML = {$offline_html_json};",
        '',
        "self.addEventListener('install', (event) => {",
        '  event.waitUntil(',
        '    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting())',
        '  );',
        '});',
        '',
        "self.addEventListener('message', (event) => {",
        "  if (!event.data || event.data.type !== 'BBPA_SW_SKIP_WAITING') {",
        '    return;',
        '  }',
        '',
        '  self.skipWaiting();',
        '});',
        '',
        "self.addEventListener('activate', (event) => {",
        '  event.waitUntil(',
        '    caches.keys()',
        '      .then((keys) => Promise.all(keys',
        "        .filter((key) => key.startsWith('bbpa-v') && !ACTIVE_CACHE_NAMES.includes(key))",
        '        .map((key) => caches.delete(key))))',
        '      .then(() => self.clients.claim())',
        '  );',
        '});',
        '',
        "self.addEventListener('fetch', (event) => {",
        '  const request = event.request;',
        '  const requestUrl = new URL(request.url);',
        "  const CACHEABLE_DESTINATIONS = ['style', 'script', 'image', 'font'];",
        "  const SENSITIVE_AUTH_PATH_SEGMENTS = ['auth', 'session', 'token', 'nonce'];",
        '',
        '  const debugLog = (reason) => {',
        "    if (!self.location.search.includes('bbpa_sw_debug=1')) {",
        '      return;',
        '    }',
        '',
        "    console.debug('[BimBeau Privacy Analytics SW] cache exclusion', {",
        '      reason,',
        '      method: request.method,',
        '      url: request.url,',
        '      destination: request.destination,',
        '    });',
        '  };',
        '',
        '  const isCacheableResponse = (response) => {',
        "    if (!response || response.status !== 200 || response.type !== 'basic') {",
        '      return false;',
        '    }',
        '',
        "    if (response.headers.has('Set-Cookie')) {",
        '      return false;',
        '    }',
        '',
        "    const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();",
        "    if (cacheControl.includes('no-store') || cacheControl.includes('private') || cacheControl.includes('no-cache')) {",
        '      return false;',
        '    }',
        '',
        '    return true;',
        '  };',
        '',
        "  if (request.method !== 'GET') {",
        "    debugLog('non_get_method');",
        '    return;',
        '  }',
        '',
        '  if (requestUrl.origin !== self.location.origin) {',
        "    debugLog('cross_origin');",
        '    return;',
        '  }',
        '',
        "  const lowerPathname = requestUrl.pathname.toLowerCase();",
        "  if (SENSITIVE_AUTH_PATH_SEGMENTS.some((segment) => lowerPathname.includes('/' + segment))) {",
        "    debugLog('sensitive_auth_path');",
        '    event.respondWith(fetch(request));',
        '    return;',
        '  }',
        '',
        "  if (request.headers.has('Authorization')) {",
        "    debugLog('authorization_header');",
        '    event.respondWith(fetch(request));',
        '    return;',
        '  }',
        '',
        "  if (request.mode === 'navigate') {",
        "    debugLog('navigate_network_only');",
        '    event.respondWith(',
        '      fetch(request)',
        '        .catch(() => new Response(OFFLINE_HTML, {',
        '          headers: {',
        "            'Content-Type': 'text/html; charset=utf-8',",
        "            'Cache-Control': 'no-store',",
        '          },',
        '        }))',
        '    );',
        '    return;',
        '  }',
        '',
        '  if (!CACHEABLE_DESTINATIONS.includes(request.destination)) {',
        "    debugLog('non_static_destination');",
        '    return;',
        '  }',
        '',
        '  event.respondWith(',
        '    caches.match(request).then((cachedResponse) => {',
        '      const networkFetch = fetch(request)',
        '        .then((networkResponse) => {',
        '          if (!isCacheableResponse(networkResponse)) {',
        "            debugLog('non_cacheable_response');",
        '            return networkResponse;',
        '          }',
        '',
        '          const clonedResponse = networkResponse.clone();',
        '          caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));',
        '          return networkResponse;',
        '        });',
        '',
        "      if (cachedResponse && request.destination !== 'script') {",
        '        return cachedResponse;',
        '      }',
        '',
        '      if (cachedResponse) {',
        '        networkFetch.catch(() => null);',
        '      }',
        '',
        '      return networkFetch.catch(() => cachedResponse);',
        '    })',
        '  );',
        '});',
    ]);
}

/**
 * Build a deterministic service worker version token.
 */
function bbpa_get_front_app_service_worker_version(array $pwa_assets, string $plugin_version): string
{
    $manifest_fingerprint_payload = [
        'start_url' => isset($pwa_assets['start_url']) ? (string) $pwa_assets['start_url'] : '',
        'manifest_url' => isset($pwa_assets['manifest_url']) ? (string) $pwa_assets['manifest_url'] : '',
        'scope' => isset($pwa_assets['scope']) ? (string) $pwa_assets['scope'] : '',
        'icons' => isset($pwa_assets['icons']) && is_array($pwa_assets['icons']) ? $pwa_assets['icons'] : [],
        'theme_color' => isset($pwa_assets['theme_color']) ? (string) $pwa_assets['theme_color'] : '',
        'background_color' => isset($pwa_assets['background_color']) ? (string) $pwa_assets['background_color'] : '',
    ];
    $manifest_fingerprint = substr(md5((string) wp_json_encode($manifest_fingerprint_payload)), 0, 10);

    return sanitize_key($plugin_version . '-' . $manifest_fingerprint);
}

/**
 * Render front app service worker route.
 */
function bbpa_maybe_render_front_app_service_worker(): void
{
    $sw_query_var = get_query_var('bbpa_sw');
    $is_sw_request = (string) $sw_query_var === '1';

    $service_worker_query_arg = filter_input(INPUT_GET, 'bbpa_sw', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    if (!$is_sw_request && $service_worker_query_arg !== null) {
        $is_sw_request = $service_worker_query_arg === '1';
    }

    if (!$is_sw_request && bbpa_is_front_app_pwa_endpoint_request()) {
        $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
        $request_path = wp_parse_url($request_uri, PHP_URL_PATH);
        $service_worker_path = (string) wp_parse_url(home_url('/bbpa/service-worker.js'), PHP_URL_PATH);
        $is_sw_request = is_string($request_path)
            && untrailingslashit(rawurldecode($request_path)) === untrailingslashit($service_worker_path);
    }

    if (!$is_sw_request) {
        return;
    }

    $pwa_assets = bbpa_get_front_app_pwa_assets();
    $plugin_version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';
    $sw_version = bbpa_get_front_app_service_worker_version($pwa_assets, $plugin_version);
    $sw_script = bbpa_build_front_app_service_worker_script($pwa_assets, $sw_version, [$sw_version]);
    $scope = (string) wp_parse_url(home_url('/bbpa/'), PHP_URL_PATH);
    $scope = '/' . trim($scope, '/') . '/';
    $sw_path = (string) wp_parse_url($pwa_assets['service_worker_url'], PHP_URL_PATH);
    $sw_directory_path = trailingslashit((string) dirname($sw_path));
    $scope_exceeds_file_directory = strpos($scope, $sw_directory_path) !== 0;

    status_header(200);
    header_remove('Cache-Control');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int) get_option('bbpa_assets_updated_at', time())) . ' GMT');
    header('ETag: "' . sanitize_text_field($sw_version) . '"');
    if ($scope_exceeds_file_directory) {
        header('Service-Worker-Allowed: ' . $scope);
    }
    header('Content-Type: application/javascript; charset=' . get_option('blog_charset'));

    // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Front app shell markup is generated by BimBeau Privacy Analytics and escaped during template construction before output.
    echo (string) $sw_script;
    exit;
}

/**
 * Build the front app login-shell service worker registration script.
 */
function bbpa_get_front_app_login_sw_registration_script(): string
{
    $pwa_assets = bbpa_get_front_app_pwa_assets();
    $plugin_version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';
    $sw_version = bbpa_get_front_app_service_worker_version($pwa_assets, $plugin_version);
    $service_worker_url = isset($pwa_assets['service_worker_url']) ? esc_url_raw((string) $pwa_assets['service_worker_url']) : '';
    $service_worker_url = $service_worker_url !== '' ? add_query_arg('v', $sw_version, $service_worker_url) : '';
    $scope = (string) wp_parse_url(home_url('/bbpa/'), PHP_URL_PATH);
    $scope = '/' . trim($scope, '/') . '/';

    if ($service_worker_url === '') {
        return '';
    }

    $service_worker_url_json = wp_json_encode($service_worker_url);
    $scope_json = wp_json_encode($scope);

    return implode("\n", [
        '(function () {',
        "    if (!window.isSecureContext || !('serviceWorker' in window.navigator)) {",
        '        return;',
        '    }',
        '',
        "    var serviceWorkerUrl = {$service_worker_url_json};",
        "    var scope = {$scope_json};",
        '',
        "    if (typeof serviceWorkerUrl !== 'string' || serviceWorkerUrl === '') {",
        '        return;',
        '    }',
        '',
        '    window.navigator.serviceWorker.register(serviceWorkerUrl, { scope: scope }).catch(function () {',
        '        // Installability remains progressive when service worker registration is blocked.',
        '    });',
        '})();',
    ]);
}

/**
 * Output front app PWA head tags for Android/iOS install compatibility.
 */
function bbpa_output_front_app_pwa_head_tags(): void
{
    if (!bbpa_is_front_app_request()) {
        return;
    }

    $pwa_assets = bbpa_get_front_app_pwa_assets();
    $manifest_url = add_query_arg(
        [
            'v' => BBPA_VERSION,
            'shell_color' => sanitize_key((string) $pwa_assets['shell_color_version']),
        ],
        $pwa_assets['manifest_url']
    );
    ?>
    <link rel="manifest" href="<?php echo esc_url($manifest_url); ?>">
    <link rel="icon" href="<?php echo esc_url($pwa_assets['preview_icon_url']); ?>" type="image/png" sizes="192x192">
    <link rel="shortcut icon" href="<?php echo esc_url($pwa_assets['preview_icon_url']); ?>" type="image/png">
    <meta name="theme-color" content="<?php echo esc_attr($pwa_assets['theme_color']); ?>">
    <meta name="color-scheme" content="light">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="<?php echo esc_attr($pwa_assets['short_name']); ?>">
    <link rel="apple-touch-icon" href="<?php echo esc_url($pwa_assets['apple_touch_icon']); ?>">
    <?php
}

/**
 * Returns true when current request targets the front BimBeau Privacy Analytics app shell.
 */
function bbpa_is_front_app_request(): bool
{
    $app_query_var = get_query_var('bbpa_app');
    if ($app_query_var !== '') {
        return (string) $app_query_var === '1';
    }

    $fallback_query_arg = filter_input(INPUT_GET, 'bbpa_app', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    if ((string) $fallback_query_arg === '1') {
        return true;
    }

    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
    if ($request_uri === '') {
        return false;
    }

    $request_path = wp_parse_url($request_uri, PHP_URL_PATH);
    if (!is_string($request_path) || $request_path === '') {
        return false;
    }

    $normalized_request_path = '/' . trim($request_path, '/');
    $app_base_path = (string) wp_parse_url(home_url('/bbpa/'), PHP_URL_PATH);
    $normalized_app_base_path = '/' . trim($app_base_path, '/');

    if ($normalized_request_path === $normalized_app_base_path) {
        return true;
    }

    return str_starts_with($normalized_request_path . '/', $normalized_app_base_path . '/');
}

/**
 * Resolve current front app panel from rewrite vars and query fallback.
 */
function bbpa_get_front_app_current_panel(): string
{
    $panel = get_query_var('bbpa_panel');

    if ($panel === '') {
        $panel = (string) filter_input(INPUT_GET, 'bbpa_panel', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    }

    if ($panel === '') {
        $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
        $request_path = is_string($request_uri) ? wp_parse_url($request_uri, PHP_URL_PATH) : '';
        $app_base_path = (string) wp_parse_url(home_url('/bbpa/'), PHP_URL_PATH);

        if (is_string($request_path) && $request_path !== '' && $app_base_path !== '') {
            $normalized_request_path = trim($request_path, '/');
            $normalized_app_base_path = trim($app_base_path, '/');

            if ($normalized_request_path === $normalized_app_base_path) {
                $panel = 'dashboard';
            } elseif (str_starts_with($normalized_request_path . '/', $normalized_app_base_path . '/')) {
                $relative_path = ltrim(substr($normalized_request_path, strlen($normalized_app_base_path)), '/');
                $first_segment = $relative_path !== '' ? strtok($relative_path, '/') : '';
                $panel = is_string($first_segment) ? sanitize_key($first_segment) : '';
            }
        }
    }

    if (!is_string($panel) || $panel === '') {
        return 'dashboard';
    }

    return sanitize_key($panel);
}

/**
 * Build the canonical front app URL for dashboard and panel routes.
 */
function bbpa_get_front_app_url(string $panel = ''): string
{
    $base_url = home_url('/bbpa/');
    $normalized_panel = sanitize_key($panel);

    if ($normalized_panel === '' || $normalized_panel === 'dashboard') {
        return $base_url;
    }

    return home_url('/bbpa/' . $normalized_panel . '/');
}

/**
 * Resolve whether the request should fall back to wp-login.php.
 */
function bbpa_should_use_front_login_fallback(): bool
{
    $fallback_query_arg = filter_input(INPUT_GET, 'bbpa_login_fallback', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    $fallback_requested = in_array((string) $fallback_query_arg, ['1', 'true', 'yes'], true);

    if (!$fallback_requested) {
        return (bool) apply_filters('bbpa_front_login_force_wp_login', false);
    }

    $nonce = filter_input(INPUT_GET, 'bbpa_front_nonce', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
    $is_valid_nonce = is_string($nonce)
        && $nonce !== ''
        && wp_verify_nonce(sanitize_text_field(wp_unslash($nonce)), 'bbpa_front_action') === 1;

    return (bool) apply_filters('bbpa_front_login_force_wp_login', $is_valid_nonce);
}

/**
 * Render dedicated front-app login view with Gutenberg components.
 */
function bbpa_render_front_app_login_shell(): void
{
    $app_url = bbpa_get_front_app_url();
    bbpa_prepare_front_app_shell_no_cache();
    $fallback_login_url = add_query_arg(
        [
            'bbpa_login_fallback' => '1',
            'bbpa_front_nonce' => wp_create_nonce('bbpa_front_action'),
        ],
        wp_login_url($app_url)
    );
    $auth_endpoint = rest_url(BBPA_REST_INTERNAL_NAMESPACE . '/auth/login');

    wp_enqueue_script('wp-element');
    wp_enqueue_script('wp-components');
    wp_enqueue_script('wp-i18n');
    wp_enqueue_style('wp-components');

    $shared_tokens_css_url = function_exists('bbpa_get_pwa_asset_url')
        ? bbpa_get_pwa_asset_url('assets/css/app-shared-tokens.css')
        : BBPA_URL . 'assets/css/app-shared-tokens.css';

    $front_login_css_url = function_exists('bbpa_get_pwa_asset_url')
        ? bbpa_get_pwa_asset_url('assets/css/front-login.css')
        : BBPA_URL . 'assets/css/front-login.css';

    wp_enqueue_style(
        'bbpa-shared-tokens',
        $shared_tokens_css_url,
        [],
        BBPA_VERSION
    );

    wp_enqueue_style(
        'bbpa-front-login',
        $front_login_css_url,
        ['wp-components', 'bbpa-shared-tokens'],
        BBPA_VERSION
    );

    wp_register_script('bbpa-front-login', '', ['wp-element', 'wp-components', 'wp-i18n'], BBPA_VERSION, true);
    wp_enqueue_script('bbpa-front-login');
    $sw_registration_script = bbpa_get_front_app_login_sw_registration_script();
    if ($sw_registration_script !== '') {
        wp_add_inline_script('bbpa-front-login', $sw_registration_script, 'before');
    }
    wp_add_inline_script(
        'bbpa-front-login',
        'window.BPAFrontLogin = ' . wp_json_encode(
            [
                'appUrl' => esc_url_raw($app_url),
                'authEndpoint' => esc_url_raw($auth_endpoint),
                'fallbackLoginUrl' => esc_url_raw($fallback_login_url),
                'loginNonce' => wp_create_nonce('bbpa_front_login'),
                'labels' => [
                    'title' => __('BimBeau Privacy Analytics sign in', 'bimbeau-privacy-analytics'),
                    'description' => __('Sign in with a WordPress account that can access BimBeau Privacy Analytics analytics.', 'bimbeau-privacy-analytics'),
                    'username' => __('Username or email', 'bimbeau-privacy-analytics'),
                    'password' => __('Password', 'bimbeau-privacy-analytics'),
                    'remember' => __('Remember me', 'bimbeau-privacy-analytics'),
                    'submit' => __('Sign in', 'bimbeau-privacy-analytics'),
                    'fallback' => __('Open WordPress login', 'bimbeau-privacy-analytics'),
                    'genericError' => __('Authentication failed. Verify credentials and access policy.', 'bimbeau-privacy-analytics'),
                    'blockedError' => __('Custom login flow is unavailable in this environment.', 'bimbeau-privacy-analytics'),
                ],
            ]
        ) . ';',
        'before'
    );
    wp_add_inline_script(
        'bbpa-front-login',
        <<<'JS'
(function () {
    if (!window.wp || !window.wp.element || !window.wp.components || !window.BPAFrontLogin) {
        return;
    }

    const config = window.BPAFrontLogin;
    const element = window.wp.element.createElement;
    const { render, useState } = window.wp.element;
    const { Button, CheckboxControl, Notice, TextControl, Card, CardBody } = window.wp.components;

    function LoginShell() {
        const [username, setUsername] = useState('');
        const [password, setPassword] = useState('');
        const [remember, setRemember] = useState(true);
        const [notice, setNotice] = useState(null);
        const [isSubmitting, setIsSubmitting] = useState(false);

        const handleSubmit = async function (event) {
            event.preventDefault();
            setNotice(null);
            setIsSubmitting(true);

            try {
                const response = await window.fetch(config.authEndpoint, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        remember: remember,
                        login_nonce: config.loginNonce,
                    }),
                });

                const payload = await response.json().catch(function () {
                    return {};
                });

                if (!response.ok || !payload || !payload.success) {
                    const code = payload && payload.code ? String(payload.code) : '';
                    const message = payload && payload.message ? String(payload.message) : config.labels.genericError;
                    const isBlocked = code === 'bbpa_login_policy_blocked';
                    setNotice({
                        status: isBlocked ? 'warning' : 'error',
                        message: isBlocked ? config.labels.blockedError : message,
                        fallbackUrl: payload && payload.fallbackLoginUrl ? payload.fallbackLoginUrl : config.fallbackLoginUrl,
                    });
                    return;
                }

                try {
                    window.sessionStorage.removeItem('bbpa-nonce-reload-attempted');
                } catch (storageError) {
                    // Ignore storage cleanup failures before redirect.
                }
                const redirectUrl = payload.redirectUrl ? payload.redirectUrl : config.appUrl;
                window.location.assign(redirectUrl);
            } catch (error) {
                setNotice({
                    status: 'warning',
                    message: config.labels.blockedError,
                    fallbackUrl: config.fallbackLoginUrl,
                });
            } finally {
                setIsSubmitting(false);
            }
        };

        return element(
            Card,
            { className: 'bbpa-front-login-card', isRounded: false, size: 'medium' },
            element(
                CardBody,
                null,
                element('h1', { className: 'bbpa-front-login-title' }, config.labels.title),
                element('p', { className: 'bbpa-front-login-description' }, config.labels.description),
                notice
                    ? element(
                        Notice,
                        { status: notice.status, isDismissible: false },
                        notice.message,
                        notice.fallbackUrl
                            ? element(
                                'p',
                                null,
                                element(Button, { variant: 'link', href: notice.fallbackUrl }, config.labels.fallback)
                            )
                            : null
                    )
                    : null,
                element(
                    'form',
                    { onSubmit: handleSubmit, className: 'bbpa-front-login-form' },
                    element(TextControl, {
                        label: config.labels.username,
                        value: username,
                        onChange: setUsername,
                        autoComplete: 'username',
                        required: true,
                    }),
                    element(TextControl, {
                        label: config.labels.password,
                        type: 'password',
                        value: password,
                        onChange: setPassword,
                        autoComplete: 'current-password',
                        required: true,
                    }),
                    element(CheckboxControl, {
                        label: config.labels.remember,
                        checked: remember,
                        onChange: setRemember,
                    }),
                    element(
                        Button,
                        { variant: 'primary', type: 'submit', isBusy: isSubmitting, disabled: isSubmitting },
                        config.labels.submit
                    )
                )
            )
        );
    }

    const root = document.getElementById('bbpa-front-login');
    if (!root) {
        return;
    }

    render(element(LoginShell), root);
})();
JS
    );

    status_header(200);
    bbpa_prepare_front_app_shell_no_cache();
    bbpa_send_front_app_frame_protection_headers();
    ?>
    <!doctype html>
    <html <?php language_attributes(); ?>>
    <head>
        <?php bbpa_render_front_app_login_isolated_head(); ?>
    </head>
    <body <?php body_class('bbpa-shell bbpa-login-shell'); ?>>
        <main class="bbpa-front-login-layout">
            <div id="bbpa-front-login"></div>
        </main>
        <?php bbpa_render_front_app_login_isolated_footer(); ?>
    </body>
    </html>
    <?php
    exit;
}



/**
 * Return script/style handles allowed in the isolated front app shell.
 */
function bbpa_get_front_app_required_asset_handles(): array
{
    return [
        'scripts' => ['wp-element', 'wp-components', 'wp-i18n', 'bbpa-admin'],
        'styles' => ['wp-components', 'bbpa-admin-boot-fallback', 'bbpa-front-app-shell', 'bbpa-admin-extras', 'bbpa-admin'],
    ];
}

/**
 * Keep only the requested handles and their registered dependencies in a dependency queue.
 *
 * @param WP_Dependencies $dependencies Dependency registry.
 * @param string[]        $allowed_handles Explicitly allowed handles.
 */
function bbpa_filter_front_app_dependency_queue(WP_Dependencies $dependencies, array $allowed_handles): void
{
    $allowed = [];
    foreach ($allowed_handles as $handle) {
        if (is_string($handle) && $handle !== '') {
            $allowed[] = $handle;
        }
    }

    if (method_exists($dependencies, 'all_deps')) {
        $dependencies->all_deps($allowed);
        $allowed = array_values(array_unique(array_merge($allowed, $dependencies->to_do)));
    }

    $dependencies->queue = array_values(array_intersect($dependencies->queue, $allowed));
}

/**
 * Print only the WordPress dependencies and BimBeau assets required by the front app shell.
 */
function bbpa_print_front_app_required_assets(string $group): void
{
    $handles = bbpa_get_front_app_required_asset_handles();

    if ($group === 'styles') {
        bbpa_filter_front_app_dependency_queue(wp_styles(), $handles['styles']);
        wp_print_styles($handles['styles']);
        return;
    }

    if ($group === 'scripts') {
        $scripts = wp_scripts();
        bbpa_filter_front_app_dependency_queue($scripts, $handles['scripts']);
        wp_print_footer_scripts();
    }
}

/**
 * Render the isolated PWA document head without theme or frontend-plugin hooks.
 */
function bbpa_render_front_app_isolated_head(): void
{
    $title = wp_get_document_title();
    ?>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo esc_html($title); ?></title>
    <?php
    bbpa_output_front_app_pwa_head_tags();
    bbpa_print_front_app_required_assets('styles');
}

/**
 * Render the isolated PWA document footer without theme or frontend-plugin hooks.
 */
function bbpa_render_front_app_isolated_footer(): void
{
    bbpa_print_front_app_required_assets('scripts');
}

/**
 * Return script/style handles allowed in the isolated front app login shell.
 */
function bbpa_get_front_app_login_required_asset_handles(): array
{
    return [
        'scripts' => ['wp-element', 'wp-components', 'wp-i18n', 'bbpa-front-login'],
        'styles' => ['wp-components', 'bbpa-shared-tokens', 'bbpa-front-login'],
    ];
}

/**
 * Print only the WordPress dependencies and BimBeau assets required by the front app login shell.
 */
function bbpa_print_front_app_login_required_assets(string $group): void
{
    $handles = bbpa_get_front_app_login_required_asset_handles();

    if ($group === 'styles') {
        bbpa_filter_front_app_dependency_queue(wp_styles(), $handles['styles']);
        wp_print_styles($handles['styles']);
        return;
    }

    if ($group === 'scripts') {
        $scripts = wp_scripts();
        bbpa_filter_front_app_dependency_queue($scripts, $handles['scripts']);
        wp_print_footer_scripts();
    }
}

/**
 * Render the isolated front app login document head without theme or frontend-plugin hooks.
 */
function bbpa_render_front_app_login_isolated_head(): void
{
    $title = wp_get_document_title();
    ?>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo esc_html($title); ?></title>
    <?php
    bbpa_output_front_app_pwa_head_tags();
    bbpa_print_front_app_login_required_assets('styles');
}

/**
 * Render the isolated front app login footer without theme or frontend-plugin hooks.
 */
function bbpa_render_front_app_login_isolated_footer(): void
{
    bbpa_print_front_app_login_required_assets('scripts');
}

/**
 * Render front BimBeau Privacy Analytics app shell template.
 */
function bbpa_maybe_render_front_app_shell(): void
{
    bbpa_maybe_render_front_app_pwa_asset();
    bbpa_maybe_render_front_app_manifest();
    bbpa_maybe_render_front_app_service_worker();

    if (!bbpa_is_front_app_request()) {
        return;
    }

    $app_url = bbpa_get_front_app_url();
    if (!function_exists('bbpa_is_pro') || !bbpa_is_pro()) {
        status_header(403);
        nocache_headers();
        wp_die(esc_html__('BimBeau Privacy Analytics App is available in not included.', 'bimbeau-privacy-analytics'));
    }

    if (!is_user_logged_in()) {
        if (bbpa_should_use_front_login_fallback()) {
            wp_safe_redirect(add_query_arg(
                [
                    'bbpa_login_fallback' => '1',
                    'bbpa_front_nonce' => wp_create_nonce('bbpa_front_action'),
                ],
                wp_login_url($app_url)
            ));
            exit;
        }

        bbpa_render_front_app_login_shell();
    }

    if (!bbpa_current_user_can_access_panel('dashboard')) {
        status_header(403);
        nocache_headers();
        wp_die(esc_html__('You are not allowed to access this page.', 'bimbeau-privacy-analytics'));
    }

    $current_panel = bbpa_get_front_app_current_panel();
    if (!bbpa_current_user_can_access_panel($current_panel)) {
        status_header(403);
        nocache_headers();
        wp_die(esc_html__('You are not allowed to access this page.', 'bimbeau-privacy-analytics'));
    }

    $pwa_assets = bbpa_get_front_app_pwa_assets();
    $front_app_background_color = function_exists('bbpa_normalize_front_app_background_color')
        ? bbpa_normalize_front_app_background_color((string) ($pwa_assets['background_color'] ?? ''))
        : '#ffffff';

    bbpa_enqueue_admin_app_assets(
        $current_panel,
        [
            'root_id' => 'bbpa',
            'app_mode' => 'app',
            'app_base_url' => $app_url,
        ]
    );

    status_header(200);
    bbpa_prepare_front_app_shell_no_cache();
    bbpa_send_front_app_frame_protection_headers();
    ?>
    <!doctype html>
    <html <?php language_attributes(); ?>>
    <head>
        <?php bbpa_render_front_app_isolated_head(); ?>
    </head>
    <body <?php body_class('bbpa-shell'); ?>>
        <div
            id="bbpa"
            class="bbpa-front-app-loading"
            data-bbpa-loading="1"
            style="<?php echo esc_attr('--bbpa-front-app-bg:' . $front_app_background_color); ?>"
        >
            <div class="bbpa-front-app-loading__panel">
                <img class="bbpa-front-app-loading__icon" src="<?php echo esc_url($pwa_assets['loading_icon']); ?>" alt="<?php esc_attr_e('BimBeau Privacy Analytics icon', 'bimbeau-privacy-analytics'); ?>">
                <span class="components-spinner" aria-hidden="true"></span>
                <p class="bbpa-front-app-loading__label"><?php esc_html_e('Loading analytics workspace…', 'bimbeau-privacy-analytics'); ?></p>
            </div>
        </div>
        <?php bbpa_render_front_app_isolated_footer(); ?>
    </body>
    </html>
    <?php
    exit;
}


/**
 * Add optimization-bypass attributes to the front app admin bundle script tag.
 */
function bbpa_filter_front_app_admin_script_tag(string $tag, string $handle, string $src): string
{
    unset($src);

    if ($handle !== 'bbpa-admin' || !bbpa_is_front_app_request() || !is_string($tag) || $tag === '') {
        return $tag;
    }

    $attributes = [
        'data-no-optimize' => '1',
        'data-no-defer' => '1',
        'data-no-minify' => '1',
        'data-cfasync' => 'false',
    ];

    foreach ($attributes as $name => $value) {
        if (stripos($tag, ' ' . $name . '=') === false) {
            $tag = preg_replace('/<script\b/i', '<script ' . $name . '="' . esc_attr($value) . '"', $tag, 1) ?: $tag;
        }
    }

    return $tag;
}

/**
 * Force query-arg REST URLs on front app shell requests.
 */
function bbpa_filter_rest_url_for_front_app(string $url, string $path, ?int $blog_id = null, string $scheme = 'rest'): string
{
    unset($blog_id);

    if (!bbpa_is_front_app_request()) {
        return $url;
    }

    return bbpa_build_query_rest_url($path, $scheme);
}

add_filter('rest_url', 'bbpa_filter_rest_url_for_front_app', 10, 4);
add_filter('script_loader_tag', 'bbpa_filter_front_app_admin_script_tag', 20, 3);

/**
 * Hide WordPress admin bar on front app routes, including PWA mode.
 */
function bbpa_filter_show_admin_bar_on_front_app(bool $show): bool
{
    if (!bbpa_is_front_app_request()) {
        return $show;
    }

    return false;
}

add_filter('show_admin_bar', 'bbpa_filter_show_admin_bar_on_front_app');

/**
 * Force the front app shell document title away from theme/query titles.
 */
function bbpa_filter_front_app_document_title(string $title): string
{
    if (!bbpa_is_front_app_request()) {
        return $title;
    }

    $pwa_assets = bbpa_get_front_app_pwa_assets();
    return isset($pwa_assets['name']) ? (string) $pwa_assets['name'] : 'BimBeau Privacy Analytics';
}

add_filter('pre_get_document_title', 'bbpa_filter_front_app_document_title', 20);

/**
 * Keep the legacy global-style cleanup hook available without removing assets.
 *
 * WordPress global styles, classic theme styles, theme styles, and third-party
 * assets are allowed to coexist with the BimBeau Privacy Analytics front app shell.
 */
function bbpa_dequeue_global_styles_on_front_app(): void
{
    if (!bbpa_is_front_app_request()) {
        return;
    }
}

add_action('wp_enqueue_scripts', 'bbpa_dequeue_global_styles_on_front_app', 100);

/**
 * Keep the legacy front-app asset cleanup hook available without removing assets.
 *
 * The canonical PWA asset isolation hook in the premium PWA asset isolation bootstrap also
 * preserves queued WordPress, theme, and plugin assets for compatibility.
 */
function bbpa_dequeue_frontend_assets_on_front_app(): void
{
    if (!bbpa_is_front_app_request()) {
        return;
    }
}

add_action('wp_enqueue_scripts', 'bbpa_dequeue_frontend_assets_on_front_app', 120);

function bbpa_pwa_assets_cache_exclusions(array $entries): array
{
    $entries[] = 'bbpa/pwa-assets/';
    $entries[] = 'bbpa/service-worker.js';
    $entries[] = 'workbox-';
    return array_values(array_unique($entries));
}

add_filter('autoptimize_filter_js_exclude', static function ($excluded) {
    $list = is_string($excluded) ? array_filter(array_map('trim', explode(',', $excluded))) : [];
    $list = bbpa_pwa_assets_cache_exclusions($list);
    return implode(',', $list);
});
add_filter('autoptimize_filter_css_exclude', static function ($excluded) {
    $list = is_string($excluded) ? array_filter(array_map('trim', explode(',', $excluded))) : [];
    $list = bbpa_pwa_assets_cache_exclusions($list);
    return implode(',', $list);
});
add_filter('rocket_exclude_js', 'bbpa_pwa_assets_cache_exclusions');
add_filter('rocket_exclude_css', 'bbpa_pwa_assets_cache_exclusions');
add_filter('rocket_delay_js_exclusions', 'bbpa_pwa_assets_cache_exclusions');
add_filter('rocket_defer_inline_exclusions', 'bbpa_pwa_assets_cache_exclusions');
add_filter('litespeed_optimize_js_excludes', 'bbpa_pwa_assets_cache_exclusions');
add_filter('litespeed_optimize_css_excludes', 'bbpa_pwa_assets_cache_exclusions');
add_filter('litespeed_optimize_uri_excludes', 'bbpa_pwa_assets_cache_exclusions');
add_filter('wpsupercache_rejected_uri', 'bbpa_pwa_assets_cache_exclusions');

function bbpa_enforce_pwa_asset_cache_headers(): void
{
    $request_uri = bbpa_request_get_string($_SERVER, 'REQUEST_URI');
    $request_path = (string) wp_parse_url($request_uri, PHP_URL_PATH);
    if ($request_path === '') {
        return;
    }

    if (preg_match('#/bbpa/service-worker\.js$#i', $request_path) === 1) {
        return;
    }

    if (preg_match('#/bbpa/pwa-assets/.+\.[a-f0-9]{6,}\.(js|css)$#i', $request_path) === 1) {
        header('Cache-Control: public, max-age=31536000, immutable');
        header('Surrogate-Control: max-age=31536000');
    }
}
add_action('send_headers', 'bbpa_enforce_pwa_asset_cache_headers', 20);

add_action('init', 'bbpa_register_front_app_rewrite_rules');
add_filter('query_vars', 'bbpa_register_front_app_query_vars');
add_filter('redirect_canonical', 'bbpa_disable_front_app_pwa_canonical_redirect');
add_action('wp_head', 'bbpa_output_front_app_pwa_head_tags', 1);
add_action('template_redirect', 'bbpa_maybe_render_front_app_pwa_asset', 0);
add_action('template_redirect', 'bbpa_maybe_render_front_app_manifest', 0);
add_action('template_redirect', 'bbpa_maybe_render_front_app_service_worker', 0);
add_action('template_redirect', 'bbpa_maybe_render_front_app_shell');

/**
 * Flush front app rewrite rules once per premium runtime version.
 */
function bbpa_maybe_flush_front_app_rewrite_rules(): void
{
    $option_name = 'bbpa_front_app_rewrite_rules_version';
    $registered_version = get_option($option_name, '');

    if ($registered_version === BBPA_VERSION) {
        return;
    }

    bbpa_register_front_app_rewrite_rules();
    flush_rewrite_rules(false);
    update_option($option_name, BBPA_VERSION, false);
}
add_action('init', 'bbpa_maybe_flush_front_app_rewrite_rules', 20);
