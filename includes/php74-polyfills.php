<?php

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle)
    {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}

if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle)
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle)
    {
        if ($needle === '') {
            return true;
        }

        $needle_length = strlen($needle);
        if ($needle_length > strlen($haystack)) {
            return false;
        }

        return substr($haystack, -$needle_length) === $needle;
    }
}
