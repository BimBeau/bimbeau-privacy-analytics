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

    /**
     * Whether update_database() is running, used by the fatal-error shutdown guard.
     */
    private bool $update_in_progress = false;

    /**
     * Whether the fatal-error shutdown guard has been registered for this instance.
     */
    private bool $shutdown_guard_registered = false;

    /**
     * Create the updater.
     *
     * @param BBPA_Filesystem_Service|null $filesystem_service Filesystem adapter; a default instance is created when omitted.
     */
    public function __construct(?BBPA_Filesystem_Service $filesystem_service = null) {
        $this->filesystem_service = $filesystem_service ?? new BBPA_Filesystem_Service();
    }
    private const LOCAL_DATABASE_MANIFEST_URL = 'https://raw.githubusercontent.com/BimBeau/bimbeau-geoip-database/main/manifest.json';
    private const STATUS_OPTION = 'bbpa_geoip_database_update_status';
    private const LOCAL_DATABASE_AVAILABLE_OPTION = 'bbpa_geoip_database_local_available';
    /**
     * Canonical database location, relative to the uploads directory.
     *
     * Older releases stored the database under bpa/geoip/. A usable database found there is moved to this location
     * by `bbpa_normalize_geoip_local_mmdb_path()` (filter `bbpa_geoip_local_mmdb_path`, priority 5).
     */
    private const DATABASE_RELATIVE_PATH = 'bbpa/geoip/GeoLite2-City.mmdb';
    private const TEMP_WORKSPACE_PREFIX = 'bbpa-geoip-workspace-';
    private const TEMP_WORKSPACE_MARKER = '.bbpa-geoip-workspace';

    /**
     * Uploads sub-directories that only hold the GeoIP database and may be locked down.
     */
    private const PRIVATE_DATABASE_DIRECTORIES = ['bbpa/geoip', 'bpa/geoip'];

    /**
     * Run the full GeoIP database update workflow.
     */
    public function update_database() {
        $this->persist_update_status(
            [
                'status' => 'pending',
            ]
        );

        $this->begin_update_guard();
        try {
            return $this->run_update();
        } catch (\Throwable $throwable) {
            $this->update_in_progress = false;
            $this->persist_update_status(
                [
                    'status' => 'error',
                    'error' => $this->build_error('bbpa_geoip_update_interrupted', 'update_interrupted'),
                ]
            );

            throw $throwable;
        } finally {
            $this->update_in_progress = false;
        }
    }

    /**
     * Download, verify, decompress and store the database.
     *
     * @return array|WP_Error
     */
    private function run_update() {
        $settings = bbpa_get_settings();
        $lookup_mode = isset($settings['geoip_lookup_mode'])
            ? sanitize_key((string) $settings['geoip_lookup_mode'])
            : 'local_database';
        if ($lookup_mode !== 'local_database') {
            $this->persist_local_database_availability(false);
            $error = $this->build_error('bbpa_geoip_local_mode_required', 'local_mode_required');
            $this->persist_update_status(
                [
                    'status' => 'error',
                    'error' => $error,
                ]
            );

            return $error;
        }

        if (!$this->filesystem_service->can_write()) {
            $error = $this->build_error('bbpa_geoip_filesystem_unavailable', 'filesystem_unavailable');
            $this->log_debug('filesystem not writable with the direct method');
            $this->persist_failed_update_status($error);

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
     * The default is uploads/bbpa/geoip/GeoLite2-City.mmdb. The `bbpa_geoip_local_mmdb_path` filter receives it
     * with the uploads directory metadata; its priority 5 callback returns the legacy uploads/bpa/geoip file while
     * that file cannot be moved to the canonical directory.
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

        $temp_file = $this->create_temp_path('bbpa-geolite2-city.mmdb.gz');
        if (is_wp_error($temp_file)) {
            return $this->build_error('bbpa_geoip_download_failed', 'download_temp_file_unavailable');
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

            return $this->build_error('bbpa_geoip_download_failed', 'download_request_failed', [$response->get_error_message()]);
        }

        $status_code = (int) wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            $this->delete_file_if_exists($temp_file);

            return $this->build_error('bbpa_geoip_download_failed', 'download_http_status', [$status_code]);
        }

        if (!$this->filesystem_service->is_readable($temp_file) || $this->filesystem_service->size($temp_file) <= 0) {
            $this->delete_file_if_exists($temp_file);

            return $this->build_error('bbpa_geoip_download_failed', 'download_empty');
        }

        $actual_size = $this->filesystem_service->size($temp_file);
        if ($actual_size !== (int) $manifest['size']) {
            $this->delete_file_if_exists($temp_file);

            return $this->build_error('bbpa_geoip_download_failed', 'download_size_mismatch');
        }

        $checksum = hash_file('sha256', $temp_file);
        if (!is_string($checksum) || !hash_equals(strtolower((string) $manifest['sha256']), strtolower($checksum))) {
            $this->delete_file_if_exists($temp_file);

            return $this->build_error('bbpa_geoip_checksum_failed', 'checksum_mismatch');
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
            return $this->build_error('bbpa_geoip_manifest_failed', 'manifest_request_failed', [$response->get_error_message()]);
        }

        $status_code = (int) wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            return $this->build_error('bbpa_geoip_manifest_failed', 'manifest_http_status', [$status_code]);
        }

        $body = wp_remote_retrieve_body($response);
        $manifest = json_decode((string) $body, true);
        if (!is_array($manifest)) {
            return $this->build_error('bbpa_geoip_manifest_invalid', 'manifest_invalid_json');
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
            return $this->build_error('bbpa_geoip_manifest_invalid', 'manifest_invalid_metadata');
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
            return $this->build_error('bbpa_geoip_extract_failed', 'database_not_readable');
        }

        return $this->extract_database($downloaded_path);
    }

    /**
     * Extract the MMDB file from a gzip-compressed MMDB archive.
     *
     * The archive is decompressed as a stream into a temporary workspace, so the
     * memory used does not depend on the archive or database size.
     */
    public function extract_database(string $archive_path) {
        if (!$this->filesystem_service->is_readable($archive_path)) {
            return $this->build_error('bbpa_geoip_extract_failed', 'archive_not_readable');
        }

        if (!in_array('compress.zlib', stream_get_wrappers(), true)) {
            $this->delete_file_if_exists($archive_path);

            return $this->build_error('bbpa_geoip_extract_failed', 'gzip_unsupported');
        }

        if ($this->filesystem_service->size($archive_path) <= 0) {
            $this->delete_file_if_exists($archive_path);

            return $this->build_error('bbpa_geoip_extract_failed', 'archive_empty');
        }

        if (!$this->filesystem_service->can_write()) {
            $this->delete_file_if_exists($archive_path);

            return $this->build_error('bbpa_geoip_extract_failed', 'decompressed_write_failed');
        }

        $temp_dir = $this->create_temp_workspace();
        if (is_wp_error($temp_dir)) {
            $this->delete_file_if_exists($archive_path);

            return $this->build_error('bbpa_geoip_extract_failed', 'workspace_unavailable');
        }

        $temp_mmdb_path = trailingslashit($temp_dir) . 'GeoLite2-City.mmdb';
        $extract_succeeded = false;

        try {
            if (!$this->filesystem_service->decompress_gzip_file($archive_path, $temp_mmdb_path)) {
                return $this->build_error('bbpa_geoip_extract_failed', 'decompression_failed');
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
     * Store the MMDB file in uploads, keeping the previous database until the new one is in place.
     *
     * The file is moved (renamed, or copied as a stream across devices) next to
     * the destination, then swapped in. The previous database is kept as a backup
     * during the swap and restored if the swap fails.
     */
    public function store_database(string $mmdb_path) {
        $safe_mmdb_path = $this->filesystem_service->resolve_safe_runtime_path($mmdb_path, true);
        $safe_temp_root = $this->get_runtime_temp_root();
        $safe_mmdb_parent = is_string($safe_mmdb_path) ? wp_normalize_path(dirname($safe_mmdb_path)) : '';
        if (
            $safe_mmdb_path === null
            || !is_file($safe_mmdb_path)
            || $safe_temp_root === ''
            || ($safe_mmdb_parent !== $safe_temp_root && !str_starts_with($safe_mmdb_parent . '/', trailingslashit($safe_temp_root)))
            || !$this->filesystem_service->is_readable($safe_mmdb_path)
        ) {
            return $this->build_error('bbpa_geoip_store_failed', 'store_source_invalid');
        }

        $mmdb_path = $safe_mmdb_path;

        $target_path = $this->get_local_database_path();
        if ($target_path === '') {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);

            return $this->build_error('bbpa_geoip_store_failed', 'store_destination_unresolved');
        }

        $target_dir = dirname($target_path);

        if ($this->filesystem_service->resolve_safe_directory_path($target_dir, false) === null || !$this->filesystem_service->ensure_directory($target_dir)) {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);

            return $this->build_error('bbpa_geoip_store_failed', 'store_directory_failed');
        }

        $this->protect_database_directory($target_path);

        $temp_target = $target_path . '.tmp-' . wp_generate_password(12, false, false);
        if (!$this->move_file($mmdb_path, $temp_target, false)) {
            $this->cleanup_owned_workspace_for_mmdb($mmdb_path);
            $this->delete_file_if_exists($temp_target);

            return $this->build_error('bbpa_geoip_store_failed', 'store_temp_write_failed');
        }

        $this->delete_owned_temp_workspace(dirname($mmdb_path));

        if (!$this->replace_database_file($temp_target, $target_path)) {
            $this->delete_file_if_exists($temp_target);

            return $this->build_error('bbpa_geoip_store_failed', 'store_replace_failed');
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
        if ($exists) {
            // Existing installations get the access protection the first time an administrator views the status.
            $this->protect_database_directory($target_path);
        }
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
            'message' => $this->resolve_status_message($status),
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
                'error' => $error,
            ]
        );
    }

    /**
     * Persist update status for diagnostics.
     *
     * Errors keep the historical translated `message` value and also store the
     * message identifier and its non-translatable arguments, so the message can
     * be rebuilt in the locale of whoever reads the status later.
     */
    private function persist_update_status(array $data): void {
        $existing_status = get_option(self::STATUS_OPTION, []);
        if (!is_array($existing_status)) {
            $existing_status = [];
        }

        $error = isset($data['error']) && $data['error'] instanceof WP_Error ? $data['error'] : null;
        $message_reference = $error !== null ? $this->get_error_message_reference($error) : null;
        if ($error !== null) {
            $data['message'] = $error->get_error_message();
            $data['error_code'] = $error->get_error_code();
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

        if ($message_reference !== null) {
            $status['message_id'] = $message_reference['id'];
            $status['message_args'] = $message_reference['args'];
        }

        update_option(self::STATUS_OPTION, $status, false);
    }

    /**
     * Rebuild the stored status message in the current locale when possible.
     */
    private function resolve_status_message(array $status): string {
        $message_id = isset($status['message_id']) ? sanitize_key((string) $status['message_id']) : '';
        if ($message_id !== '') {
            $args = isset($status['message_args']) && is_array($status['message_args']) ? $status['message_args'] : [];
            $message = $this->get_error_message($message_id, $args);
            if ($message !== '') {
                return sanitize_text_field($message);
            }
        }

        return isset($status['message']) ? sanitize_text_field((string) $status['message']) : '';
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
     * Check whether the local MMDB file is present, readable and not empty.
     */
    public function is_local_database_available(): bool {
        return $this->is_database_file_usable($this->get_local_database_path());
    }

    /**
     * Check whether a database file can be read: present, readable and not empty.
     *
     * Single rule shared by the status screen, the stored availability flag and the local lookup.
     *
     * @param string $path Database file path, usually the result of get_local_database_path().
     */
    public function is_database_file_usable(string $path): bool {
        if ($path === '' || !$this->filesystem_service->exists($path) || !$this->filesystem_service->is_readable($path)) {
            return false;
        }

        return $this->filesystem_service->size($path) > 0;
    }

    /**
     * Swap a staged database file into place, restoring the previous file when the swap fails.
     */
    private function replace_database_file(string $staged_path, string $target_path): bool {
        if (!$this->filesystem_service->exists($target_path)) {
            return $this->move_file($staged_path, $target_path, false);
        }

        $backup_path = $target_path . '.bak';
        if (!$this->move_file($target_path, $backup_path, true)) {
            // The current database stays in place untouched.
            return false;
        }

        if ($this->move_file($staged_path, $target_path, false)) {
            $this->delete_file_if_exists($backup_path);

            return true;
        }

        // A failed swap may leave a partial target behind (streamed copy across devices):
        // the backup always replaces it.
        $this->move_file($backup_path, $target_path, true);

        return false;
    }

    /**
     * Deny direct HTTP access to the directory that stores the database.
     *
     * Only the dedicated uploads/bbpa/geoip (or legacy uploads/bpa/geoip)
     * directories are locked down, never a directory chosen through the
     * `bbpa_geoip_local_mmdb_path` filter that could also hold public files.
     */
    private function protect_database_directory(string $database_path): void {
        $directory = wp_normalize_path(dirname($database_path));
        $uploads = wp_upload_dir(null, false, false);
        if (!empty($uploads['error']) || empty($uploads['basedir']) || !is_dir($directory)) {
            return;
        }

        $uploads_base = trailingslashit(wp_normalize_path((string) $uploads['basedir']));
        foreach (self::PRIVATE_DATABASE_DIRECTORIES as $private_directory) {
            if ($directory === $uploads_base . $private_directory) {
                $this->filesystem_service->write_access_denial_files($directory);

                return;
            }
        }
    }

    /**
     * Return the normalized temporary root used for GeoIP temporary files.
     */
    private function get_runtime_temp_root(): string {
        $temp_dir = $this->filesystem_service->get_runtime_temp_dir();
        $temp_root = $temp_dir !== '' ? realpath($temp_dir) : false;

        return is_string($temp_root) ? wp_normalize_path(rtrim($temp_root, '/')) : '';
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

        $temp_dir = $this->filesystem_service->get_runtime_temp_dir();
        if ($temp_dir === '') {
            return $this->build_error('bbpa_geoip_temp_file_unavailable', 'temp_file_unavailable');
        }

        if (function_exists('wp_tempnam')) {
            $path = wp_tempnam($filename, $temp_dir);
            if (is_string($path) && $path !== '') {
                return $path;
            }
        }

        $fallback_path = tempnam($temp_dir, 'bbpa-');
        if (is_string($fallback_path) && $fallback_path !== '') {
            return $fallback_path;
        }

        return $this->build_error('bbpa_geoip_temp_file_unavailable', 'temp_file_unavailable');
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
            return $this->build_error('bbpa_geoip_temp_file_unavailable', 'workspace_create_failed');
        }

        $marker = trailingslashit($workspace) . self::TEMP_WORKSPACE_MARKER;
        if (!$this->filesystem_service->put_contents($marker, 'bbpa-geoip')) {
            $this->filesystem_service->delete_directory($workspace);
            return $this->build_error('bbpa_geoip_temp_file_unavailable', 'workspace_create_failed');
        }

        $safe_workspace = $this->filesystem_service->resolve_safe_directory_path($workspace, true);
        if (!is_string($safe_workspace)) {
            $this->filesystem_service->delete_directory($workspace);
            return $this->build_error('bbpa_geoip_temp_file_unavailable', 'workspace_create_failed');
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
        $safe_temp_root = $this->get_runtime_temp_root();
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
     * Register a shutdown guard so a fatal error during an update does not leave the status on "pending".
     */
    private function begin_update_guard(): void {
        $this->update_in_progress = true;
        if ($this->shutdown_guard_registered) {
            return;
        }

        $this->shutdown_guard_registered = true;
        register_shutdown_function(
            function (): void {
                $this->handle_interrupted_update();
            }
        );
    }

    /**
     * Persist an error status when the request died with a fatal error during an update.
     */
    private function handle_interrupted_update(): void {
        if (!$this->update_in_progress) {
            return;
        }

        $this->update_in_progress = false;
        $last_error = error_get_last();
        $fatal_types = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR];
        if (!is_array($last_error) || !in_array((int) $last_error['type'], $fatal_types, true)) {
            return;
        }

        $this->persist_update_status(
            [
                'status' => 'error',
                'error' => $this->build_error('bbpa_geoip_update_interrupted', 'update_interrupted'),
            ]
        );
    }

    /**
     * Build an updater error that remembers how to rebuild its message later.
     *
     * @param string $code       Machine-readable error code.
     * @param string $message_id Stable message identifier understood by get_error_message().
     * @param array  $args       Non-translatable message arguments (status codes, transport errors).
     */
    private function build_error(string $code, string $message_id, array $args = []): WP_Error {
        $safe_args = [];
        foreach (array_values($args) as $arg) {
            $safe_args[] = is_int($arg) ? $arg : sanitize_text_field((string) $arg);
        }

        return new WP_Error(
            $code,
            $this->get_error_message($message_id, $safe_args),
            [
                'bbpa_message_id' => $message_id,
                'bbpa_message_args' => $safe_args,
            ]
        );
    }

    /**
     * Return the message identifier and arguments attached to an updater error.
     *
     * @return array{id:string,args:array}|null
     */
    private function get_error_message_reference(WP_Error $error): ?array {
        $data = $error->get_error_data();
        if (!is_array($data) || empty($data['bbpa_message_id'])) {
            return null;
        }

        return [
            'id' => sanitize_key((string) $data['bbpa_message_id']),
            'args' => isset($data['bbpa_message_args']) && is_array($data['bbpa_message_args']) ? array_values($data['bbpa_message_args']) : [],
        ];
    }

    /**
     * Translate an updater message in the current locale.
     */
    private function get_error_message(string $message_id, array $args = []): string {
        $first_arg = $args[0] ?? '';

        switch ($message_id) {
            case 'local_mode_required':
                return __('Local database mode is required to update the GeoIP database.', 'bimbeau-privacy-analytics');
            case 'filesystem_unavailable':
                return __('WordPress cannot write files directly in the uploads directory, so the GeoIP database cannot be stored. Make the uploads directory writable by PHP or define FS_METHOD as "direct" in wp-config.php.', 'bimbeau-privacy-analytics');
            case 'download_temp_file_unavailable':
                return __('Unable to create a temporary file for the GeoIP database download.', 'bimbeau-privacy-analytics');
            case 'download_request_failed':
                return sprintf(
                    /* translators: %s: HTTP error message returned by wp_remote_get. */
                    __('GeoIP database download failed: %s', 'bimbeau-privacy-analytics'),
                    (string) $first_arg
                );
            case 'download_http_status':
                return sprintf(
                    /* translators: %d: HTTP status code returned by the GeoIP download request. */
                    __('GeoIP database download failed with HTTP status %d.', 'bimbeau-privacy-analytics'),
                    (int) $first_arg
                );
            case 'download_empty':
                return __('GeoIP database download returned an empty response body.', 'bimbeau-privacy-analytics');
            case 'download_size_mismatch':
                return __('GeoIP database download size does not match the manifest.', 'bimbeau-privacy-analytics');
            case 'checksum_mismatch':
                return __('GeoIP database checksum does not match the manifest.', 'bimbeau-privacy-analytics');
            case 'manifest_request_failed':
                return sprintf(
                    /* translators: %s: HTTP error message returned by wp_remote_get. */
                    __('GeoIP database manifest request failed: %s', 'bimbeau-privacy-analytics'),
                    (string) $first_arg
                );
            case 'manifest_http_status':
                return sprintf(
                    /* translators: %d: HTTP status code returned by the GeoIP manifest request. */
                    __('GeoIP database manifest request failed with HTTP status %d.', 'bimbeau-privacy-analytics'),
                    (int) $first_arg
                );
            case 'manifest_invalid_json':
                return __('GeoIP database manifest is not valid JSON.', 'bimbeau-privacy-analytics');
            case 'manifest_invalid_metadata':
                return __('GeoIP database manifest metadata is invalid.', 'bimbeau-privacy-analytics');
            case 'database_not_readable':
                return __('GeoIP database file is not readable.', 'bimbeau-privacy-analytics');
            case 'archive_not_readable':
                return __('GeoIP archive file is not readable.', 'bimbeau-privacy-analytics');
            case 'gzip_unsupported':
                return __('Server is missing required gzip extraction capabilities.', 'bimbeau-privacy-analytics');
            case 'workspace_unavailable':
                return __('Unable to allocate temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics');
            case 'archive_empty':
                return __('GeoIP archive is empty or unreadable.', 'bimbeau-privacy-analytics');
            case 'decompression_failed':
                return __('GeoIP archive decompression failed.', 'bimbeau-privacy-analytics');
            case 'decompressed_write_failed':
                return __('Unable to write decompressed GeoIP MMDB file.', 'bimbeau-privacy-analytics');
            case 'store_source_invalid':
                return __('GeoIP MMDB file is not readable from an allowed temporary directory.', 'bimbeau-privacy-analytics');
            case 'store_destination_unresolved':
                return __('Unable to resolve GeoIP destination path.', 'bimbeau-privacy-analytics');
            case 'store_directory_failed':
                return __('Unable to create GeoIP destination directory.', 'bimbeau-privacy-analytics');
            case 'store_temp_write_failed':
                return __('Unable to write GeoIP database temporary file.', 'bimbeau-privacy-analytics');
            case 'store_replace_failed':
                return __('Unable to replace GeoIP database file atomically.', 'bimbeau-privacy-analytics');
            case 'temp_file_unavailable':
                return __('Unable to create a temporary file for GeoIP operations.', 'bimbeau-privacy-analytics');
            case 'workspace_create_failed':
                return __('Unable to create temporary workspace for GeoIP extraction.', 'bimbeau-privacy-analytics');
            case 'update_interrupted':
                return __('The last GeoIP database update failed.', 'bimbeau-privacy-analytics');
        }

        return '';
    }

    /**
     * Write debug logs when debug mode is enabled.
     */
    private function log_debug(string $message): void {
        // The logger writes `info` lines only when the plugin debug mode is enabled.
        BBPA_Logger::channel('Geo')->info($message);
    }
}
