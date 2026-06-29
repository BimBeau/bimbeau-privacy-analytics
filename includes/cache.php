<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Cache helpers for BimBeau Privacy Analytics admin analytics.
 */


const BBPA_METRICS_CACHE_GROUP = 'bbpa_metrics';

/**
 * Resolve metrics cache TTL in seconds.
 */
function bbpa_get_metrics_cache_ttl(string $context = 'view'): int
{
    return $context === 'admin_live' ? 30 : 300;
}

/**
 * Build a deterministic metrics cache key with the current cache version.
 */
function bbpa_build_metrics_cache_key(string $metric, array $dimensions = []): string
{
    ksort($dimensions);

    return md5(wp_json_encode([
        'version' => bbpa_get_admin_cache_version(),
        'metric' => sanitize_key($metric),
        'dimensions' => $dimensions,
    ]));
}


/**
 * Build a deterministic cache key from namespace and arguments.
 */
function bbpa_cache_key(string $namespace, array $args = []): string
{
    ksort($args);

    return sanitize_key($namespace) . '_' . md5(wp_json_encode($args));
}

/**
 * Read a metrics cache value.
 */
function bbpa_get_metrics_cache_value(string $metric, array $dimensions, ?bool &$found = null)
{
    $key = bbpa_build_metrics_cache_key($metric, $dimensions);

    return wp_cache_get($key, BBPA_METRICS_CACHE_GROUP, false, $found);
}

/**
 * Store a metrics cache value.
 */
function bbpa_set_metrics_cache_value(string $metric, array $dimensions, $value, string $context = 'view'): void
{
    $key = bbpa_build_metrics_cache_key($metric, $dimensions);
    wp_cache_set($key, $value, BBPA_METRICS_CACHE_GROUP, bbpa_get_metrics_cache_ttl($context));
}

/**
 * Invalidate runtime metrics cache namespace.
 */
function bbpa_invalidate_metrics_cache(): void
{
    wp_cache_delete('version', BBPA_METRICS_CACHE_GROUP);
}

/**
 * Return the current admin cache version.
 */
function bbpa_get_admin_cache_version(): int
{
    $version = (int) get_option('bbpa_admin_cache_version', 1);

    return $version > 0 ? $version : 1;
}

/**
 * Bump the admin cache version to invalidate transients.
 */
function bbpa_bump_admin_cache_version(): void
{
    $version = bbpa_get_admin_cache_version();
    update_option('bbpa_admin_cache_version', $version + 1, false);
}

/**
 * Build a transient key for admin analytics.
 */
function bbpa_get_admin_cache_key(string $suffix): string
{
    return 'bbpa_admin_' . bbpa_get_admin_cache_version() . '_' . $suffix;
}

/**
 * Flush cached admin analytics.
 */
function bbpa_flush_admin_cache(): void
{
    bbpa_bump_admin_cache_version();
    bbpa_invalidate_metrics_cache();
}

/**
 * Flush cached admin configuration payloads.
 *
 * Settings and analytics currently share the same admin cache version so a
 * single invalidation stays observable across REST consumers and the admin UI.
 */
function bbpa_flush_admin_settings_cache(): void
{
    bbpa_flush_admin_cache();
}
