<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Filesystem safety helpers.
 */

/**
 * Normalize a relative path to remove dot segments.
 */
function bbpa_normalize_relative_path(string $path): string
{
    $path = str_replace('\\', '/', $path);
    $segments = explode('/', $path);
    $normalized = [];

    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }

        if ($segment === '..') {
            throw new InvalidArgumentException('Parent path segments are not allowed.');
        }

        $normalized[] = $segment;
    }

    return implode('/', $normalized);
}

/**
 * Safely resolve a relative candidate inside a fixed base directory.
 */
function bbpa_safe_resolve(string $base_path, string $candidate): string
{
    if ($base_path === '') {
        throw new InvalidArgumentException('Base path cannot be empty.');
    }

    if ($candidate === '') {
        throw new InvalidArgumentException('Candidate path cannot be empty.');
    }

    if (strpos($candidate, "\0") !== false) {
        throw new InvalidArgumentException('Candidate path contains a null byte.');
    }

    $normalized_candidate = str_replace('\\', '/', $candidate);
    if (preg_match('#^(?:[a-zA-Z]:[\\/]|/)#', $normalized_candidate) === 1) {
        throw new InvalidArgumentException('Absolute paths are not allowed.');
    }

    $base_real = realpath($base_path);
    if ($base_real === false || !is_dir($base_real)) {
        throw new InvalidArgumentException('Base path must exist and be a directory.');
    }

    $base_real = wp_normalize_path($base_real);
    $normalized_relative = bbpa_normalize_relative_path($normalized_candidate);
    $resolved = wp_normalize_path($base_real . '/' . $normalized_relative);

    if ($resolved !== $base_real && strpos($resolved, $base_real . '/') !== 0) {
        throw new InvalidArgumentException('Resolved path escapes the base directory.');
    }

    return $resolved;
}

/**
 * Require a PHP file inside a fixed base directory.
 */
function bbpa_safe_require_once(string $base_path, string $candidate): void
{
    $resolved = bbpa_safe_resolve($base_path, $candidate);

    if (!is_file($resolved) || is_link($resolved)) {
        throw new RuntimeException(sprintf('Unsafe or missing require target: %s', $candidate));
    }

    require_once $resolved;
}

/**
 * Require a PHP file inside a fixed base directory when present.
 */
function bbpa_safe_require_once_if_exists(string $base_path, string $candidate): bool
{
    $resolved = bbpa_safe_resolve($base_path, $candidate);

    if (!is_file($resolved) || is_link($resolved)) {
        return false;
    }

    require_once $resolved;

    return true;
}

/**
 * Resolve a file path and verify that it exists as a regular file.
 */
function bbpa_safe_existing_file(string $base_path, string $candidate): string
{
    $resolved = bbpa_safe_resolve($base_path, $candidate);

    if (!is_file($resolved) || is_link($resolved)) {
        throw new RuntimeException('Unsafe or missing file target.');
    }

    return $resolved;
}

/**
 * List file names by extension in a safe directory inside a base path.
 *
 * @return string[]
 */
function bbpa_safe_list_files_by_extension(string $base_path, string $relative_dir, string $extension): array
{
    $directory = bbpa_safe_resolve($base_path, $relative_dir);

    if (!is_dir($directory) || is_link($directory)) {
        return [];
    }

    $normalized_extension = strtolower(ltrim($extension, '.'));
    $files = [];

    foreach (new DirectoryIterator($directory) as $entry) {
        if ($entry->isDot() || !$entry->isFile() || $entry->isLink()) {
            continue;
        }

        if (strtolower($entry->getExtension()) !== $normalized_extension) {
            continue;
        }

        $files[] = $entry->getFilename();
    }

    sort($files, SORT_STRING);

    return $files;
}
