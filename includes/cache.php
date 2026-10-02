<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Cache helpers for BimBeau Privacy Analytics admin analytics.
 */


const BBPA_CACHE_GROUP = 'bbpa';
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
 *
 * @deprecated No effect: nothing stores the `version` key of the metrics cache group. Metrics cache keys embed the
 *             admin cache version (see `bbpa_build_metrics_cache_key()`), so `bbpa_flush_admin_cache()` is the
 *             function that invalidates them.
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
    // A reader may cache data under this version, so the next tracking write must bump it again.
    bbpa_admin_cache_bump_pending(false);

    return bbpa_read_admin_cache_version();
}

/**
 * Read the stored admin cache version.
 */
function bbpa_read_admin_cache_version(): int
{
    $version = (int) get_option('bbpa_admin_cache_version', 1);

    return $version > 0 ? $version : 1;
}

/**
 * Track whether the admin cache version was bumped and not read since, in this request.
 *
 * @param bool|null $set New state, or null to read the current state.
 */
function bbpa_admin_cache_bump_pending(?bool $set = null): bool
{
    static $bumped_since_last_read = false;

    if ($set !== null) {
        $bumped_since_last_read = $set;
    }

    return $bumped_since_last_read;
}

/**
 * Bump the admin cache version to invalidate transients.
 */
function bbpa_bump_admin_cache_version(): void
{
    update_option('bbpa_admin_cache_version', bbpa_read_admin_cache_version() + 1, false);
    bbpa_admin_cache_bump_pending(true);
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
}

/**
 * Flush cached admin analytics after an ingestion write.
 *
 * One tracked hit performs several counter UPSERTs. The admin cache version (a wp_options row) is bumped only when
 * nothing has read it since the previous bump of this request, so a hit costs one options UPDATE instead of one per
 * UPSERT. Data cached by a reader after the last bump is still invalidated by the next write.
 */
function bbpa_flush_admin_cache_after_tracking_write(): void
{
    if (bbpa_admin_cache_bump_pending()) {
        return;
    }

    bbpa_flush_admin_cache();
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
