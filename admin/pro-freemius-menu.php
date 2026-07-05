<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Premium Freemius menu cleanup for BimBeau Privacy Analytics.
 */
if (!function_exists('bbpa_remove_pro_upgrade_submenu')) {
    /**
     * Remove Freemius pricing/upgrade submenu entries from Pro admin menus.
     */
    function bbpa_remove_pro_upgrade_submenu(): void
    {
        $submenu_root = BBPA_SLUG;
        $upgrade_slug = BBPA_SLUG . '-pricing';

        if (!isset($GLOBALS['submenu'][$submenu_root]) || !is_array($GLOBALS['submenu'][$submenu_root])) {
            return;
        }

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

            $looks_like_upgrade = $submenu_slug === $upgrade_slug
                || strpos($candidate_haystack, 'pricing') !== false
                || strpos($candidate_haystack, 'upgrade') !== false
                || strpos($candidate_haystack, 'fs-upgrade') !== false
                || strpos($candidate_haystack, 'fs-submenu-item-pricing') !== false
                || preg_match('/\b(mise\s*à\s*jour|mettre\s*à\s*jour|upgrade|updates?)\b/ui', $submenu_label) === 1;

            if ($looks_like_upgrade) {
                continue;
            }

            $clean_submenu[] = $submenu_item;
        }

        $GLOBALS['submenu'][$submenu_root] = array_values($clean_submenu);
    }
}


if (!function_exists('bbpa_disable_free_upgrade_submenu_hooks')) {
    /**
     * Disable Free-only pricing/update submenu hooks in the premium package.
     */
    function bbpa_disable_free_upgrade_submenu_hooks(): void
    {
        remove_action('admin_menu', 'bbpa_register_free_upgrade_submenu', 999);
        remove_action('admin_head', 'bbpa_normalize_free_upgrade_submenu', 1);
        remove_action('admin_head', 'bbpa_place_free_upgrade_submenu_last', 2);
    }
}

if (!function_exists('bbpa_normalize_pro_submenu_order')) {
    /**
     * Keep premium admin submenu entries in the expected product order.
     */
    function bbpa_normalize_pro_submenu_order(): void
    {
        if (!isset($GLOBALS['submenu'][BBPA_SLUG]) || !is_array($GLOBALS['submenu'][BBPA_SLUG])) {
            return;
        }

        $priority_by_slug = [
            BBPA_SLUG => 10,
            BBPA_SLUG . '-realtime' => 20,
            BBPA_SLUG . '-top-pages' => 30,
            BBPA_SLUG . '-acquisition' => 40,
            BBPA_SLUG . '-referrers' => 50,
            BBPA_SLUG . '-search-terms' => 60,
            BBPA_SLUG . '-geolocation' => 70,
            BBPA_SLUG . '-visitors' => 80,
            BBPA_SLUG . '-devices' => 90,
            BBPA_SLUG . '-events' => 100,
            BBPA_SLUG . '-settings' => 110,
            BBPA_SLUG . '-account' => 130,
            BBPA_SLUG . '-contact' => 140,
        ];
        $unknown_priority = 120;
        $account_priority = 130;
        $contact_priority = 140;
        $normalized_items = [];
        $seen_signatures = [];

        foreach ($GLOBALS['submenu'][BBPA_SLUG] as $original_index => $submenu_item) {
            if (!is_array($submenu_item)) {
                continue;
            }

            $submenu_slug = isset($submenu_item[2]) ? (string) $submenu_item[2] : '';
            $submenu_label_raw = isset($submenu_item[0]) ? (string) $submenu_item[0] : '';
            $submenu_label = wp_strip_all_tags($submenu_label_raw);
            $submenu_css_classes = isset($submenu_item[4]) ? strtolower((string) $submenu_item[4]) : '';
            $candidate_haystack = strtolower($submenu_label_raw . ' ' . $submenu_label . ' ' . $submenu_slug . ' ' . $submenu_css_classes);

            $looks_like_upgrade = $submenu_slug === BBPA_SLUG . '-pricing'
                || strpos($candidate_haystack, 'pricing') !== false
                || strpos($candidate_haystack, 'upgrade') !== false
                || strpos($candidate_haystack, 'fs-upgrade') !== false
                || strpos($candidate_haystack, 'fs-submenu-item-pricing') !== false
                || preg_match('/\b(mise\s*à\s*jour|mettre\s*à\s*jour|upgrade|updates?)\b/ui', $submenu_label) === 1;

            if ($looks_like_upgrade) {
                continue;
            }

            $priority = $priority_by_slug[$submenu_slug] ?? null;
            if ($priority === null) {
                $slug_and_label = strtolower($submenu_slug . ' ' . $submenu_label);
                if (strpos($slug_and_label, 'account') !== false || strpos($slug_and_label, 'compte') !== false) {
                    $priority = $account_priority;
                } elseif (strpos($slug_and_label, 'contact') !== false || strpos($slug_and_label, 'support') !== false) {
                    $priority = $contact_priority;
                } else {
                    $priority = $unknown_priority;
                }
            }

            $signature = md5(serialize($submenu_item));
            if (isset($seen_signatures[$signature])) {
                continue;
            }
            $seen_signatures[$signature] = true;

            $normalized_items[] = [
                'priority' => $priority,
                'index' => (int) $original_index,
                'item' => $submenu_item,
            ];
        }

        usort(
            $normalized_items,
            static function (array $left, array $right): int {
                $priority_comparison = $left['priority'] <=> $right['priority'];
                if ($priority_comparison !== 0) {
                    return $priority_comparison;
                }

                return $left['index'] <=> $right['index'];
            }
        );

        $GLOBALS['submenu'][BBPA_SLUG] = array_values(array_map(static fn(array $entry): array => $entry['item'], $normalized_items));
    }
}

add_action('admin_init', 'bbpa_disable_free_upgrade_submenu_hooks', 20);
add_action('admin_menu', 'bbpa_remove_pro_upgrade_submenu', PHP_INT_MAX);
add_action('admin_menu', 'bbpa_normalize_pro_submenu_order', PHP_INT_MAX);
add_action('admin_head', 'bbpa_remove_pro_upgrade_submenu', 999);
add_action('admin_head', 'bbpa_normalize_pro_submenu_order', 1000);
