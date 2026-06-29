<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Shared helpers for REST query normalization and cache key generation.
 */
class BBPA_REST_Query_Helpers {
    private const ALLOWED_SORT_DIRECTIONS = ['ASC', 'DESC'];
    private const MAX_DAY_RANGE_DAYS = 730;

    public static function get_date_range_args(): array {
        return [
            'start' => [
                'required' => false,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'end' => [
                'required' => false,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ];
    }

    public static function get_pagination_args(string $default_orderby = 'hits'): array {
        return [
            'page' => [
                'required' => false,
                'type' => 'integer',
                'default' => 1,
                'sanitize_callback' => 'absint',
            ],
            'per_page' => [
                'required' => false,
                'type' => 'integer',
                'default' => 10,
                'sanitize_callback' => 'absint',
            ],
            'orderby' => [
                'required' => false,
                'type' => 'string',
                'default' => $default_orderby,
                'sanitize_callback' => 'sanitize_key',
            ],
            'order' => [
                'required' => false,
                'type' => 'string',
                'default' => 'desc',
                'sanitize_callback' => 'sanitize_key',
            ],
            'search' => [
                'required' => false,
                'type' => 'string',
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'page_path' => [
                'required' => false,
                'type' => 'string',
                'default' => '',
                'sanitize_callback' => 'bbpa_sanitize_rest_page_path_arg',
            ],
            'exclude_zero' => [
                'required' => false,
                'type' => 'boolean',
                'default' => false,
                'sanitize_callback' => 'rest_sanitize_boolean',
            ],
        ];
    }

    public static function normalize_day_range(WP_REST_Request $request): array {
        $now = current_time('timestamp');
        $default_end = wp_date('Y-m-d', $now);
        $default_start = wp_date('Y-m-d', $now - (29 * DAY_IN_SECONDS));

        $start = sanitize_text_field((string) $request->get_param('start'));
        $end = sanitize_text_field((string) $request->get_param('end'));

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !self::is_valid_day_value($start)) {
            $start = $default_start;
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || !self::is_valid_day_value($end)) {
            $end = $default_end;
        }

        if (
            strtotime($start) > strtotime($end)
            || self::get_day_span($start, $end) > self::MAX_DAY_RANGE_DAYS
        ) {
            $start = $default_start;
            $end = $default_end;
        }

        return [
            'start' => $start,
            'end' => $end,
        ];
    }

    public static function normalize_search_term(WP_REST_Request $request): string {
        return trim(sanitize_text_field((string) $request->get_param('search')));
    }

    public static function normalize_page_path_filter(WP_REST_Request $request): string {
        return trim(sanitize_text_field((string) $request->get_param('page_path')));
    }

    private static function is_valid_day_value(string $value): bool {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, wp_timezone());
        $errors = DateTimeImmutable::getLastErrors();

        return $date instanceof DateTimeImmutable
            && $date->format('Y-m-d') === $value
            && (!is_array($errors) || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }

    private static function get_day_span(string $start, string $end): int {
        $start_timestamp = strtotime($start);
        $end_timestamp = strtotime($end);

        return (int) round(($end_timestamp - $start_timestamp) / DAY_IN_SECONDS) + 1;
    }


    public static function normalize_pagination(WP_REST_Request $request, int $default_per_page = 10, int $max_per_page = 1000): array {
        $page = absint($request->get_param('page'));
        if ($page < 1) {
            $page = 1;
        }

        $per_page = absint($request->get_param('per_page'));
        if ($per_page < 1) {
            $per_page = $default_per_page;
        }

        $per_page = min($per_page, $max_per_page);

        return [
            'page' => $page,
            'per_page' => $per_page,
            'offset' => ($page - 1) * $per_page,
        ];
    }

    public static function normalize_sorting(WP_REST_Request $request, array $allowed_orderby, string $default): array {
        $orderby_key = sanitize_key((string) $request->get_param('orderby'));
        if (!isset($allowed_orderby[$orderby_key])) {
            $orderby_key = $default;
        }

        $order = strtoupper(sanitize_key((string) $request->get_param('order')));
        if (!in_array($order, self::ALLOWED_SORT_DIRECTIONS, true)) {
            $order = 'DESC';
        }

        return [
            'orderby_key' => $orderby_key,
            'orderby' => $allowed_orderby[$orderby_key],
            'order' => $order,
        ];
    }

    public static function build_cache_key(string $prefix, string $endpoint, array $params): string {
        $payload = [
            'endpoint' => $endpoint,
            'params' => $params,
            'version' => defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown',
        ];

        return bbpa_get_admin_cache_key($prefix . md5(wp_json_encode($payload)));
    }

    public static function build_limit_offset_sql(int $per_page, int $offset): string {
        return ' LIMIT ' . (int) $per_page . ' OFFSET ' . (int) $offset;
    }
}
