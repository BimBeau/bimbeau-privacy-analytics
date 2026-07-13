<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * GeoIP database updater service.
 *
 * Compliance note: vendor code under includes/maxmind-db remains unchanged.
 * Filesystem policy is enforced by wrapping file access in this service layer.
 */
class BBPA_GeoIP_Database_Updater {
    private BBPA_Filesystem_Service $filesystem_service;

    /**
     * Canonical temporary workspaces created by this updater instance.
     *
     * @var array<string, true>
     */
    private array $owned_temp_workspaces = [];

    public function __construct(?BBPA_Filesystem_Service $filesystem_service = null) {
        $this->filesystem_service = $filesystem_service ?? new BBPA_Filesystem_Service();
    }
    private const LOCAL_DATABASE_MANIFEST_URL = 'https://raw.githubusercontent.com/BimBeau/bimbeau-geoip-database/main/manifest.json';
    private const STATUS_OPTION = 'bbpa_geoip_database_update_status';
    private const LOCAL_DATABASE_AVAILABLE_OPTION = 'bbpa_geoip_database_local_available';
    private const DATABASE_RELATIVE_PATH = 'bpa/geoip/GeoLite2-City.mmdb';
    private const TEMP_WORKSPACE_PREFIX = 'bbpa-geoip-workspace-';
    private const TEMP_WORKSPACE_MARKER = '.bbpa-geoip-workspace';

    /**
     * Run the full GeoIP database update workflow.
     */
    public function update_database() {
        $this->persist_update_status(
            [
                'status' => 'pending',
            ]
        );

        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        $lookup_mode = isset($settings['geoip_lookup_mode'])
            ? sanitize_key((string) $settings['geoip_lookup_mode'])
            : 'local_database';
        if ($lookup_mode !== 'local_database') {
            $this->persist_local_database_availability(false);
            $error = new WP_Error(
                'bbpa_geoip_local_mode_required',
                __('Local database mode is required to update the GeoIP database.', 'bimbeau-privacy-analytics')
            );
            $this->persist_update_status(
                [
                    'status' => 'error',
                    'message' => $error->get_error_message(),
                    'error_code' => $error->get_error_code(),
                ]
            );

            return $error;
        }

        $downloaded_path = $this->download_database();
        if (is_wp_error($downloaded_path)) {
            $this->log_debug('download failed');
            $this->persist_failed_update_status($downloaded_path);

            return $downloaded_path;
        }

        $mmdb_path = $this->resolve_downloaded_database_path($downloaded_path);
        if (is_wp_error($mmdb_path)) {
            $this->log_debug('resolve downloaded database failed');
            $this->persist_failed_update_status($mmdb_path);

            return $mmdb_path;
        }

        $stored_path = $this->store_database($mmdb_path);
        if (is_wp_error($stored_path)) {
            $this->persist_failed_update_status($stored_path);

            return $stored_path;
        }

        $file_size = $this->filesystem_service->size($stored_path);
        $local_database_available = $this->persist_local_database_availability();

        $this->persist_update_status(
            [
                'status' => 'success',
                'file_size' => $file_size,
                'message' => '',
            ]
        );

        return [
            'path' => $stored_path,
            'file_size' => $file_size,
            'updated_at' => time(),
            'local_database_available' => $local_database_available,
        ];
    }

    /**
     * Return the current local MMDB destination path.
     *
     * Lookup routing to local MMDB remains in a separate implementation step.
     */
    public function get_local_database_path(): string {
        $uploads = wp_upload_dir();
        $default_path = empty($uploads['basedir'])
            ? ''
            : trailingslashit($uploads['basedir']) . self::DATABASE_RELATIVE_PATH;

        $path = apply_filters(
            'bbpa_geoip_local_mmdb_path',
            $default_path,
            $uploads
        );

        return is_string($path) ? $path : '';
    }

    /**
     * Download the GeoLite2 City database file declared by the official manifest.
     */
    public function download_database() {
        $manifest = $this->fetch_database_manifest();
        if (is_wp_error($manifest)) {
            return $manifest;
        }

        $temp_file = $this->create_temp_file('bbpa-geolite2-city.mmdb.gz');
        if (is_wp_error($temp_file)) {
            return new WP_Error(
                'bbpa_geoip_download_failed',
                __('Unable to create a temporary file for the GeoIP database download.', 'bimbeau-privacy-analytics')
            );
        }

        $version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';
        $response = wp_remote_get(
            $manifest['download_url'],
            [
                'timeout' => 60,
                'redirection' => 3,
                'stream' => true,
                'filename' => $temp_file,
                'headers' => [
                    'User-Agent' => sprintf('BimBeau Privacy Analytics/%s; GeoIP updater', $version),
                    'Accept' => 'application/octet-stream',
                ],
            ]
        );

        if (is_wp_error($response)) {
            $this->delete_file_if_exists($temp_file);

            return new WP_Error(
                'bbpa_geoip_download_failed',
                sprintf(
                    /* translators: %s: HTTP error message returned by wp_remote_get. */
                    __('GeoIP database download failed: %s', 'bimbeau-privacy-analytics'),
                    $response->get_error_message()
                )
            );
        }

        $status_code = (int) wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            $this->delete_file_if_exists($temp_file);

            return new WP_Error(
                'bbpa_geoip_download_failed',
                sprintf(
                    /* translators: %d: HTTP status code returned by the GeoIP download request. */
                    __('GeoIP database download failed with HTTP status %d.', 'bimbeau-privacy-analytics'),
                    $status_code
                )
            );
        }

        if (!$this->filesystem_service->is_readable($temp_file) || $this->filesystem_service->size($temp_file) <= 0) {
            $this->delete_file_if_exists($temp_file);

            return new WP_Error(
                'bbpa_geoip_download_failed',
                __('GeoIP database download returned an empty response body.', 'bimbeau-privacy-analytics')
            );
        }

        $actual_size = $this->filesystem_service->size($temp_file);
        if ($actual_size !== (int) $manifest['size']) {
            $this->delete_file_if_exists($temp_file);

            return new WP_Error(
                'bbpa_geoip_download_failed',
                __('GeoIP database download size does not match the manifest.', 'bimbeau-privacy-analytics')
            );
        }

        $checksum = hash_file('sha256', $temp_file);
        if (!is_string($checksum) || !hash_equals(strtolower((string) $manifest['sha256']), strtolower($checksum))) {
            $this->delete_file_if_exists($temp_file);

            return new WP_Error(
                'bbpa_geoip_checksum_failed',
                __('GeoIP database checksum does not match the manifest.', 'bimbeau-privacy-analytics')
            );
        }

        return $temp_file;
    }

    /**
     * Fetch and validate the official GeoIP database manifest.
     */
    private function fetch_database_manifest() {
        $version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';
        $response = wp_remote_get(
            self::LOCAL_DATABASE_MANIFEST_URL,
            [
                'timeout' => 20,
                'redirection' => 3,
                'headers' => [
                    'User-Agent' => sprintf('BimBeau Privacy Analytics/%s; GeoIP updater', $version),
                    'Accept' => 'application/json',
                ],
            ]
        );

        if (is_wp_error($response)) {
            return new WP_Error(
                'bbpa_geoip_manifest_failed',
                sprintf(
                    /* translators: %s: HTTP error message returned by wp_remote_get. */
                    __('GeoIP database manifest request failed: %s', 'bimbeau-privacy-analytics'),
                    $response->get_error_message()
                )
            );
        }

        $status_code = (int) wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            return new WP_Error(
                'bbpa_geoip_manifest_failed',
                sprintf(
                    /* translators: %d: HTTP status code returned by the GeoIP manifest request. */
                    __('GeoIP database manifest request failed with HTTP status %d.', 'bimbeau-privacy-analytics'),
                    $status_code
                )
            );
        }

        $body = wp_remote_retrieve_body($response);
        $manifest = json_decode((string) $body, true);
        if (!is_array($manifest)) {
            return new WP_Error(
                'bbpa_geoip_manifest_invalid',
                __('GeoIP database manifest is not valid JSON.', 'bimbeau-privacy-analytics')
            );
        }

        return $this->validate_database_manifest($manifest);
    }

    /**
     * Validate manifest metadata before trusting its archive URL.
     */
    private function validate_database_manifest(array $manifest) {
        $download_url = isset($manifest['download_url']) ? esc_url_raw((string) $manifest['download_url']) : '';
        $sha256 = isset($manifest['sha256']) ? strtolower((string) $manifest['sha256']) : '';
        $size = $manifest['size'] ?? null;

        $valid = isset($manifest['schema_version'], $manifest['service'], $manifest['database'], $manifest['format'], $manifest['status'])
            && (int) $manifest['schema_version'] === 1
            && (string) $manifest['service'] === 'BimBeau GeoIP Database Service'
            && (string) $manifest['database'] === 'GeoLite2-City'
            && (string) $manifest['format'] === 'mmdb.gz'
            && (string) $manifest['status'] === 'ready'
            && $download_url !== ''
            && preg_match('/^[a-f0-9]{64}$/', $sha256) === 1
            && is_int($size)
            && $size > 0
            && $this->is_allowed_database_download_url($download_url);

        if (!$valid) {
            return new WP_Error(
                'bbpa_geoip_manifest_invalid',
                __('GeoIP database manifest metadata is invalid.', 'bimbeau-privacy-analytics')
            );
        }

        return [
            'download_url' => $download_url,
            'sha256' => $sha256,
            'size' => $size,
        ];
    }

    /**
     * Allow archive downloads only from the official BimBeau GeoIP database repository.
     */
    private function is_allowed_database_download_url(string $url): bool {
        $parts = wp_parse_url($url);
        if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');

        if ($host === 'raw.githubusercontent.com') {
            return str_starts_with($path, '/BimBeau/bimbeau-geoip-database/');
        }

        if ($host === 'github.com') {
            return str_starts_with($path, '/BimBeau/bimbeau-geoip-database/raw/');
        }

        return false;
    }

    /**
     * Resolve the MMDB path from the downloaded file.
     */
    private function resolve_downloaded_database_path(string $downloaded_path) {
        if (!$this->filesystem_service->is_readable($downloaded_path)) {
            return new WP_Error(
                'bbpa_geoip_extract_failed',
                __('GeoIP database file is not readable.', 'bimbeau-privacy-analytics')
            );
        }

        return $this->extract_database($downloaded_path);
    }

    /**
     * Extract the MMDB file from a gzip-compressed MMDB archive.
     */
    public function extract_database(string $archive_path) {
        if (!$this->filesystem_service->is_readable($archive_path)) {
            return new WP_Error(
                'bbpa_geoip_extract_failed',
                __('GeoIP archive file is not readable.', 'bimbeau-privacy-analytics')
            );
        }

        if (!function_exists('gzdecode')) {
            $this->delete_file_if_exists($archive_path);

            return new WP_Error(
                'bbpa_geoip_extract_failed',
                __('Server is missing required gzip extraction capabilities.', 'bimbeau-privacy-analytics')
            );
        }

        $temp_dir = $this->create_temp_workspace();
        if (is_wp_error($temp_dir)) {
            $this->delete_file_if_exists($archive_path);

            return new WP_Error(
                'bbpa_geoip_extract_failed',
                __('Unable to allocate temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics')
            );
        }

        $temp_mmdb_path = trailingslashit($temp_dir) . 'GeoLite2-City.mmdb';
        $extract_succeeded = false;

        try {
            $archive_contents = $this->filesystem_service->read_contents($archive_path);
            if (!is_string($archive_contents) || $archive_contents === '') {
                return new WP_Error(
                    'bbpa_geoip_extract_failed',
                    __('GeoIP archive is empty or unreadable.', 'bimbeau-privacy-analytics')
                );
            }

            $mmdb_contents = gzdecode($archive_contents);
            if (!is_string($mmdb_contents) || $mmdb_contents === '') {
                return new WP_Error(
                    'bbpa_geoip_extract_failed',
                    __('GeoIP archive decompression failed.', 'bimbeau-privacy-analytics')
                );
            }

            if (!$this->filesystem_service->put_contents($temp_mmdb_path, $mmdb_contents)) {
                return new WP_Error(
                    'bbpa_geoip_extract_failed',
                    __('Unable to write decompressed GeoIP MMDB file.', 'bimbeau-privacy-analytics')
                );
            }

            $extract_succeeded = true;

            return $temp_mmdb_path;
        } finally {
            $this->delete_file_if_exists($archive_path);

            if (!$extract_succeeded) {
                if ($this->filesystem_service->exists($temp_mmdb_path)) {
                    $this->delete_file_if_exists($temp_mmdb_path);
                }
                $this->filesystem_service->delete_directory($temp_dir);
            }
        }
    }

    /**
     * Store the MMDB file in uploads with atomic replacement.
     */
    public function store_database(string $mmdb_path) {
        $safe_mmdb_path = $this->filesystem_service->resolve_safe_runtime_path($mmdb_path, true);
        $temp_root = function_exists('get_temp_dir') ? realpath(get_temp_dir()) : realpath(sys_get_temp_dir());
        $safe_temp_root = is_string($temp_root) ? wp_normalize_path(rtrim($temp_root, '/')) : '';
        $safe_mmdb_parent = is_string($safe_mmdb_path) ? wp_normalize_path(dirname($safe_mmdb_path)) : '';
        if (
            $safe_mmdb_path === null
            || !is_file($safe_mmdb_path)
            || $safe_temp_root === ''
            || ($safe_mmdb_parent !== $safe_temp_root && !str_starts_with($safe_mmdb_parent . '/', trailingslashit($safe_temp_root)))
            || !$this->filesystem_service->is_readable($safe_mmdb_path)
        ) {
            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('GeoIP MMDB file is not readable from an allowed temporary directory.', 'bimbeau-privacy-analytics')
            );
        }

        $mmdb_path = $safe_mmdb_path;

        $target_path = $this->get_local_database_path();
        if ($target_path === '') {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);

            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('Unable to resolve GeoIP destination path.', 'bimbeau-privacy-analytics')
            );
        }

        $target_dir = dirname($target_path);

        if ($this->filesystem_service->resolve_safe_directory_path($target_dir, false) === null || !$this->filesystem_service->ensure_directory($target_dir)) {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);

            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('Unable to create GeoIP destination directory.', 'bimbeau-privacy-analytics')
            );
        }

        $temp_target = $target_path . '.tmp-' . wp_generate_password(12, false, false);
        $mmdb_contents = $this->filesystem_service->read_contents($mmdb_path);
        if (!is_string($mmdb_contents) || $mmdb_contents === '') {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);
            $this->delete_file_if_exists($temp_target);

            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('Unable to read GeoIP MMDB file before storage.', 'bimbeau-privacy-analytics')
            );
        }

        if (!$this->write_file($temp_target, $mmdb_contents)) {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);
            $this->delete_file_if_exists($temp_target);

            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('Unable to write GeoIP database temporary file.', 'bimbeau-privacy-analytics')
            );
        }

        $this->delete_file_if_exists($mmdb_path);
        $this->delete_owned_temp_workspace(dirname($mmdb_path));

        if (!$this->move_file($temp_target, $target_path, true)) {
            $this->delete_file_if_exists($temp_target);

            return new WP_Error(
                'bbpa_geoip_store_failed',
                __('Unable to replace GeoIP database file atomically.', 'bimbeau-privacy-analytics')
            );
        }

        return $target_path;
    }

    /**
     * Return the current status of the local GeoIP database.
     */
    public function get_database_status(): array {
        $target_path = $this->get_local_database_path();
        $exists = $target_path !== '' && $this->filesystem_service->exists($target_path);
        $readable = $exists && $this->filesystem_service->is_readable($target_path);
        $file_size = $exists ? $this->filesystem_service->size($target_path) : 0;
        $local_available = $exists && $readable && $file_size > 0;
        $status = get_option(self::STATUS_OPTION, []);
        if (!is_array($status)) {
            $status = [];
        }
        $stored_local_available = (bool) get_option(self::LOCAL_DATABASE_AVAILABLE_OPTION, false);
        $last_updated = isset($status['last_success_at']) ? (int) $status['last_success_at'] : 0;

        return [
            'exists' => $exists,
            'last_updated' => $last_updated,
            'file_size' => $file_size,
            'readable' => $readable,
            'operational' => $local_available,
            'local_available' => $stored_local_available,
            'status' => isset($status['status']) ? sanitize_key((string) $status['status']) : 'pending',
            'message' => isset($status['message']) ? sanitize_text_field((string) $status['message']) : '',
            'last_attempt_at' => isset($status['last_attempt_at']) ? (int) $status['last_attempt_at'] : 0,
            'last_success_at' => isset($status['last_success_at']) ? (int) $status['last_success_at'] : 0,
            'last_error_code' => isset($status['last_error_code']) ? sanitize_key((string) $status['last_error_code']) : '',
            'retry_count' => isset($status['retry_count']) ? max(0, (int) $status['retry_count']) : 0,
        ];
    }


    /**
     * Persist a failed attempt without hiding an existing usable local database.
     */
    private function persist_failed_update_status(WP_Error $error): void {
        $this->persist_local_database_availability();
        $this->persist_update_status(
            [
                'status' => 'error',
                'message' => $error->get_error_message(),
                'error_code' => $error->get_error_code(),
            ]
        );
    }

    /**
     * Persist update status for diagnostics.
     */
    private function persist_update_status(array $data): void {
        $existing_status = get_option(self::STATUS_OPTION, []);
        if (!is_array($existing_status)) {
            $existing_status = [];
        }

        $next_status = sanitize_key((string) ($data['status'] ?? ($existing_status['status'] ?? 'unknown')));
        $last_attempt_at = time();
        $existing_retry_count = isset($existing_status['retry_count']) ? (int) $existing_status['retry_count'] : 0;
        $retry_count = $next_status === 'error'
            ? $existing_retry_count + 1
            : ($next_status === 'success' ? 0 : $existing_retry_count);
        $last_success_at = isset($existing_status['last_success_at']) ? (int) $existing_status['last_success_at'] : 0;
        if ($next_status === 'success') {
            $last_success_at = $last_attempt_at;
        }

        $status = [
            'timestamp' => $last_attempt_at,
            'status' => $next_status,
            'file_size' => isset($data['file_size']) ? (int) $data['file_size'] : 0,
            'message' => isset($data['message']) ? sanitize_text_field((string) $data['message']) : '',
            'last_attempt_at' => $last_attempt_at,
            'last_success_at' => $last_success_at,
            'last_error_code' => isset($data['error_code'])
                ? sanitize_key((string) $data['error_code'])
                : ($next_status === 'success' ? '' : (string) ($existing_status['last_error_code'] ?? '')),
            'retry_count' => max(0, $retry_count),
        ];

        update_option(self::STATUS_OPTION, $status, false);
    }

    /**
     * Persist whether the local MMDB file is present and readable.
     *
     * Lookup routing to local MMDB remains in a separate implementation step.
     */
    private function persist_local_database_availability(?bool $available = null): bool {
        $resolved = is_bool($available) ? $available : $this->is_local_database_available();
        update_option(self::LOCAL_DATABASE_AVAILABLE_OPTION, $resolved ? 1 : 0, false);

        return $resolved;
    }

    /**
     * Check whether the local MMDB file is ready for future lookup routing.
     */
    private function is_local_database_available(): bool {
        $target_path = $this->get_local_database_path();
        if ($target_path === '' || !$this->filesystem_service->exists($target_path) || !$this->filesystem_service->is_readable($target_path)) {
            return false;
        }

        return $this->filesystem_service->size($target_path) > 0;
    }

    /**
     * Create a temporary path for GeoIP operations.
     *
     * @return string|WP_Error
     */
    private function create_temp_path(string $filename) {
        if (!function_exists('wp_tempnam') && defined('ABSPATH')) {
            $file_functions_path = ABSPATH . 'wp-admin/includes/file.php';
            if ($this->filesystem_service->exists($file_functions_path)) {
                require_once $file_functions_path;
            }
        }

        if (function_exists('wp_tempnam')) {
            $path = wp_tempnam($filename);
            if (is_string($path) && $path !== '') {
                return $path;
            }
        }

        $temp_dir = function_exists('get_temp_dir') ? get_temp_dir() : sys_get_temp_dir();
        $fallback_path = tempnam($temp_dir, 'bbpa-');
        if (is_string($fallback_path) && $fallback_path !== '') {
            return $fallback_path;
        }

        return new WP_Error(
            'bbpa_geoip_temp_file_unavailable',
            __('Unable to create a temporary file for GeoIP operations.', 'bimbeau-privacy-analytics')
        );
    }

    /**
     * Allocate a temporary file path for GeoIP operations.
     *
     * @return string|WP_Error
     */
    private function create_temp_file(string $filename) {
        return $this->create_temp_path($filename);
    }



    /**
     * Create an owned temporary workspace for GeoIP extraction.
     *
     * @return string|WP_Error
     */
    private function create_temp_workspace() {
        $workspace_file = $this->create_temp_path(self::TEMP_WORKSPACE_PREFIX);
        if (is_wp_error($workspace_file)) {
            return $workspace_file;
        }

        $this->delete_file_if_exists($workspace_file);
        $workspace = $workspace_file . '-' . wp_generate_password(12, false, false);
        if (!$this->filesystem_service->ensure_directory($workspace)) {
            return new WP_Error(
                'bbpa_geoip_temp_file_unavailable',
                __('Unable to create temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics')
            );
        }

        $marker = trailingslashit($workspace) . self::TEMP_WORKSPACE_MARKER;
        if (!$this->filesystem_service->put_contents($marker, 'bbpa-geoip')) {
            $this->filesystem_service->delete_directory($workspace);
            return new WP_Error(
                'bbpa_geoip_temp_file_unavailable',
                __('Unable to create temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics')
            );
        }

        $safe_workspace = $this->filesystem_service->resolve_safe_directory_path($workspace, true);
        if (!is_string($safe_workspace)) {
            $this->filesystem_service->delete_directory($workspace);
            return new WP_Error(
                'bbpa_geoip_temp_file_unavailable',
                __('Unable to create temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics')
            );
        }

        $this->owned_temp_workspaces[wp_normalize_path(rtrim($safe_workspace, '/'))] = true;

        return $workspace;
    }

    /**
     * Remove a temporary MMDB and its owned workspace when it belongs to this updater instance.
     */
    private function cleanup_owned_workspace_for_mmdb(string $mmdb_path): void {
        $workspace = dirname($mmdb_path);
        if ($this->is_owned_temp_workspace($workspace)) {
            $this->delete_file_if_exists($mmdb_path);
            $this->delete_owned_temp_workspace($workspace);
        }
    }

    /**
     * Delete an owned temporary workspace and unregister it from this updater instance.
     */
    private function delete_owned_temp_workspace(string $directory): void {
        if (!$this->is_owned_temp_workspace($directory)) {
            return;
        }

        $safe_directory = $this->filesystem_service->resolve_safe_directory_path($directory, true);
        if (!is_string($safe_directory)) {
            return;
        }

        $canonical = wp_normalize_path(rtrim($safe_directory, '/'));
        $deleted = $this->filesystem_service->delete_directory($canonical);
        if ($deleted || !$this->filesystem_service->exists($canonical)) {
            unset($this->owned_temp_workspaces[$canonical]);
        }
    }

    /**
     * Verify that a directory is an owned BBPA GeoIP temporary workspace.
     */
    private function is_owned_temp_workspace(string $directory): bool {
        $safe_directory = $this->filesystem_service->resolve_safe_directory_path($directory, true);
        $temp_root = function_exists('get_temp_dir') ? realpath(get_temp_dir()) : realpath(sys_get_temp_dir());
        $safe_temp_root = is_string($temp_root) ? wp_normalize_path(rtrim($temp_root, '/')) : '';
        if ($safe_directory === null || $safe_temp_root === '') {
            return false;
        }

        $safe_directory = wp_normalize_path(rtrim($safe_directory, '/'));
        if (!isset($this->owned_temp_workspaces[$safe_directory])) {
            return false;
        }

        if (!str_starts_with($safe_directory . '/', trailingslashit($safe_temp_root))) {
            return false;
        }

        if (!str_starts_with(basename($safe_directory), self::TEMP_WORKSPACE_PREFIX)) {
            return false;
        }

        $marker = trailingslashit($safe_directory) . self::TEMP_WORKSPACE_MARKER;
        if (is_link($marker) || !is_file($marker)) {
            return false;
        }

        $contents = $this->filesystem_service->read_contents($marker);
        return $contents === 'bbpa-geoip';
    }

    /**
     * Delete a file path using WordPress file helpers when possible.
     */
    private function delete_file_if_exists(string $path): void {
        if ($path === '') {
            return;
        }

        $this->filesystem_service->delete_file($path);
    }

    /**
     * Move file using WP_Filesystem when available.
     */
    private function move_file(string $source, string $destination, bool $overwrite = false): bool {
        if ($source === '' || $destination === '') {
            return false;
        }

        return $this->filesystem_service->move($source, $destination, $overwrite);
    }

    /**
     * Write file content with WP_Filesystem when available.
     */
    private function write_file(string $path, string $contents): bool {
        return $this->filesystem_service->put_contents($path, $contents);
    }

    /**
     * Write debug logs when debug mode is enabled.
     */
    private function log_debug(string $message): void {
        if (function_exists('bbpa_is_debug_mode_enabled')) {
            if (!bbpa_is_debug_mode_enabled()) {
                return;
            }
        } else {
            $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
            if (empty($settings['debug_enabled'])) {
                return;
            }
        }

        BBPA_Logger::channel('Geo')->info($message);
    }
}
