<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enqueue the Premium standalone app shell bundle.
 */
function bbpa_enqueue_front_app_admin_assets(string $current_panel, string $root_id, string $app_base_url): void
{
    bbpa_enqueue_admin_app_assets($current_panel);

    $pwa_assets = function_exists('bbpa_get_front_app_pwa_assets') ? bbpa_get_front_app_pwa_assets() : [];
    $payload = function_exists('bbpa_build_front_app_localized_payload')
        ? bbpa_build_front_app_localized_payload($root_id, $current_panel, $app_base_url, $pwa_assets)
        : [];

    if ($payload !== []) {
        $localized = wp_json_encode($payload);
        if (is_string($localized) && $localized !== '') {
            wp_add_inline_script('bbpa-admin', 'window.BBPAAdmin = Object.assign({}, window.BBPAAdmin || {}, ' . $localized . ');', 'before');
        }
    }

    wp_register_style('bbpa-front-app-shell', BBPA_URL . 'front/css/app-shell.css', [], BBPA_VERSION);
    wp_enqueue_style('bbpa-front-app-shell');
}

/**
 * Build Premium app shell-only runtime keys.
 */
function bbpa_build_front_app_localized_payload(string $root_id, string $current_panel, string $app_base_url, array $pwa_assets): array
{
    $sanitize_url = static function ($value): string {
        return is_string($value) ? esc_url_raw($value) : '';
    };
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
        'rootId' => bbpa_normalize_admin_root_id($root_id),
        'currentPanel' => sanitize_key($current_panel),
        'settings' => [
            'isWhiteLabel' => function_exists('bbpa_is_white_label_enabled') && bbpa_is_white_label_enabled(),
            'appMode' => 'app',
            'appBaseUrl' => $sanitize_url($app_base_url),
            'pwa' => [
                'appUrl' => $sanitize_url(function_exists('bbpa_get_front_app_url') ? bbpa_get_front_app_url() : home_url('/')),
                'serviceWorkerUrl' => $sanitize_url($pwa_assets['service_worker_url'] ?? ''),
                'installPromptMode' => sanitize_key(function_exists('bbpa_get_front_app_install_prompt_mode') ? bbpa_get_front_app_install_prompt_mode() : 'disabled'),
                'manifestUrl' => $sanitize_url($pwa_assets['manifest_url'] ?? ''),
                'previewIconUrl' => $sanitize_url($pwa_assets['preview_icon_url'] ?? ''),
                'appleTouchIconUrl' => $sanitize_url($pwa_assets['apple_touch_icon'] ?? ''),
                'loadingIconUrl' => $sanitize_url($pwa_assets['loading_icon'] ?? ''),
                'fallbackIconUrl' => $sanitize_url($pwa_assets['fallback_icon_url'] ?? ''),
                'generatedIcons' => $sanitize_generated_icons($pwa_assets['generated_icons'] ?? []),
                'iconSource' => sanitize_key((string) ($pwa_assets['icon_source'] ?? 'fallback')),
                'iconGenerationStatus' => sanitize_key((string) ($pwa_assets['icon_generation_status'] ?? 'fallback')),
                'iconGenerationMessage' => sanitize_text_field((string) ($pwa_assets['icon_generation_message'] ?? '')),
            ],
        ],
    ];
}
