<?php

if (!defined('ABSPATH')) {
    exit;
}

function bbpa_esc_html($value): string
{
    return esc_html((string) $value);
}

function bbpa_esc_attr($value): string
{
    return esc_attr((string) $value);
}

function bbpa_esc_inline_svg($svg_markup): string
{
    $svg_markup = (string) $svg_markup;
    if ($svg_markup === '') {
        return '';
    }

    $allowed_svg_tags = [
        'svg' => ['xmlns' => true,'viewbox' => true,'role' => true,'focusable' => true,'aria-hidden' => true,'width' => true,'height' => true,'fill' => true,'stroke' => true,'stroke-width' => true,'stroke-linecap' => true,'stroke-linejoin' => true],
        'defs' => [],
        'lineargradient' => ['id' => true,'x1' => true,'x2' => true,'y1' => true,'y2' => true],
        'stop' => ['offset' => true,'stop-color' => true,'stop-opacity' => true],
        'polygon' => ['points' => true,'fill' => true],
        'polyline' => ['points' => true,'fill' => true,'stroke' => true,'stroke-width' => true,'stroke-linecap' => true,'stroke-linejoin' => true],
        'path' => ['d' => true,'fill' => true,'stroke' => true,'stroke-width' => true,'stroke-linecap' => true,'stroke-linejoin' => true],
        'circle' => ['cx' => true,'cy' => true,'r' => true,'fill' => true,'stroke' => true,'stroke-width' => true],
        'rect' => ['x' => true,'y' => true,'width' => true,'height' => true,'rx' => true,'fill' => true,'stroke' => true,'stroke-width' => true],
    ];

    return wp_kses($svg_markup, $allowed_svg_tags);
}
