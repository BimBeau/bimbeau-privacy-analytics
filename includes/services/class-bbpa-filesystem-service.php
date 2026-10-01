<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Internal filesystem adapter to centralize WordPress file operations.
 *
 * Reads use native PHP functions (they never modify the filesystem). Writes,
 * moves and deletions go through a WP_Filesystem_Direct instance and are
 * confined to the WordPress uploads directory and a safe temporary directory.
 */
class BBPA_Filesystem_Service {
	/**
	 * Apache/LiteSpeed rules written next to private runtime files.
	 */
	private const ACCESS_DENIAL_HTACCESS = "# BimBeau Privacy Analytics: private runtime files, direct HTTP access is denied.\n"
		. "<IfModule mod_authz_core.c>\n"
		. "\tRequire all denied\n"
		. "</IfModule>\n"
		. "<IfModule !mod_authz_core.c>\n"
		. "\tOrder allow,deny\n"
		. "\tDeny from all\n"
		. "</IfModule>\n";

	/**
	 * Directory index placeholder written next to private runtime files.
	 */
	private const ACCESS_DENIAL_INDEX = "<?php\n// Silence is golden.\n";

	/**
	 * Uploads sub-directory used when the system temporary directory is not a safe root.
	 */
	private const UPLOADS_TEMP_SUBDIR = 'bbpa/tmp';

	/**
	 * Signature of the inputs used to resolve the write filesystem during this request.
	 *
	 * @var string|null
	 */
	private static $resolved_signature = null;

	/**
	 * Write filesystem resolved during this request, or null when writes are not possible.
	 *
	 * @var WP_Filesystem_Base|null
	 */
	private static $resolved_filesystem = null;

	/**
	 * Return whether a file exists.
	 */
	public function exists( string $path ): bool {
		if ( $path === '' ) {
			return false;
		}

		return file_exists( $path );
	}

	/**
	 * Return whether a file path is readable.
	 */
	public function is_readable( string $path ): bool {
		if ( $path === '' ) {
			return false;
		}

		return is_readable( $path );
	}

	/**
	 * Return file size in bytes.
	 */
	public function size( string $path ): int {
		if ( ! $this->exists( $path ) ) {
			return 0;
		}

		$size = filesize( $path );
		return is_numeric( $size ) ? (int) $size : 0;
	}

	/**
	 * Return last modified timestamp.
	 */
	public function modified_time( string $path ): int {
		if ( ! $this->exists( $path ) ) {
			return 0;
		}

		$time = filemtime( $path );
		return is_numeric( $time ) ? (int) $time : 0;
	}

	/**
	 * Read full file contents.
	 */
	public function read_contents( string $path ) {
		if ( ! $this->is_readable( $path ) ) {
			return false;
		}

		return file_get_contents( $path );
	}

	/**
	 * Return whether this request can write inside the allowed runtime roots.
	 *
	 * Writes need the WordPress "direct" filesystem method. The method is tested
	 * against the uploads directory with relaxed file ownership, so hosts where PHP
	 * runs under another user than the owner of the WordPress files can still
	 * write in uploads, while an explicit FS_METHOD constant or `filesystem_method`
	 * filter choosing another transport is respected.
	 */
	public function can_write(): bool {
		return $this->get_wp_filesystem() instanceof WP_Filesystem_Base;
	}

	/**
	 * Write contents to a file inside an allowed runtime root.
	 */
	public function put_contents( string $path, string $contents ): bool {
		$safe_path = $this->resolve_safe_runtime_path( $path, false );
		if ( $safe_path === null || is_link( $safe_path ) ) {
			return false;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		$safe_path = $this->resolve_safe_runtime_path( $safe_path, false );
		if ( $safe_path === null || is_link( $safe_path ) ) {
			return false;
		}

		return (bool) $filesystem->put_contents( $safe_path, $contents, $this->get_file_mode() );
	}

	/**
	 * Move/rename file inside allowed runtime roots.
	 *
	 * The move is a rename on the same device and falls back to a streamed copy
	 * between devices, so large files are never loaded in memory.
	 */
	public function move( string $source, string $destination, bool $overwrite = false ): bool {
		$safe_source      = $this->resolve_safe_runtime_path( $source, true );
		$safe_destination = $this->resolve_safe_runtime_path( $destination, false );
		if ( $safe_source === null || $safe_destination === null || is_link( $safe_destination ) ) {
			return false;
		}

		if ( ! $overwrite && $this->exists( $safe_destination ) ) {
			return false;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		$safe_destination = $this->resolve_safe_runtime_path( $safe_destination, false );
		if ( $safe_destination === null || is_link( $safe_destination ) ) {
			return false;
		}

		return (bool) $filesystem->move( $safe_source, $safe_destination, $overwrite );
	}

	/**
	 * Decompress a gzip file into a destination inside an allowed runtime root.
	 *
	 * PHP streams the zlib data in small chunks, so memory stays bounded whatever
	 * the archive size. The gzip signature, CRC32 and uncompressed size stored in
	 * the archive trailer are verified; the destination is removed when any check
	 * fails.
	 */
	public function decompress_gzip_file( string $source, string $destination ): bool {
		if ( ! in_array( 'compress.zlib', stream_get_wrappers(), true ) ) {
			return false;
		}

		$safe_source      = $this->resolve_safe_runtime_path( $source, true );
		$safe_destination = $this->resolve_safe_runtime_path( $destination, false );
		if ( $safe_source === null || $safe_destination === null || is_link( $safe_destination ) ) {
			return false;
		}

		$trailer = $this->read_gzip_trailer( $safe_source );
		if ( $trailer === null ) {
			return false;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		$safe_destination = $this->resolve_safe_runtime_path( $safe_destination, false );
		if ( $safe_destination === null || is_link( $safe_destination ) ) {
			return false;
		}

		$copied = (bool) $filesystem->copy( 'compress.zlib://' . $safe_source, $safe_destination, true, $this->get_file_mode() );
		clearstatcache( true, $safe_destination );
		$size     = $copied && is_file( $safe_destination ) ? filesize( $safe_destination ) : false;
		$checksum = is_int( $size ) ? hash_file( 'crc32b', $safe_destination ) : false;

		$valid = is_int( $size )
			&& $size > 0
			&& ( $size % 4294967296 ) === $trailer['size']
			&& is_string( $checksum )
			&& hash_equals( sprintf( '%08x', $trailer['crc32'] ), $checksum );

		if ( ! $valid ) {
			$this->delete_file( $safe_destination );
			return false;
		}

		return true;
	}

	/**
	 * Ensure a directory exists inside an allowed runtime root.
	 */
	public function ensure_directory( string $path ): bool {
		$safe_path = $this->resolve_safe_directory_path( $path, false );
		if ( $safe_path === null ) {
			return false;
		}

		if ( is_dir( $safe_path ) ) {
			return true;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		return function_exists( 'wp_mkdir_p' ) ? wp_mkdir_p( $safe_path ) : (bool) $filesystem->mkdir( $safe_path, defined( 'FS_CHMOD_DIR' ) ? FS_CHMOD_DIR : 0755 );
	}

	/**
	 * Write `.htaccess` and `index.php` files that deny direct HTTP access to a private directory.
	 *
	 * Existing files are kept untouched. Web servers that ignore `.htaccess` files
	 * (nginx, for example) need an equivalent rule in their own configuration.
	 */
	public function write_access_denial_files( string $directory ): bool {
		$safe_directory = $this->resolve_safe_directory_path( $directory, true );
		if ( $safe_directory === null ) {
			return false;
		}

		$files = [
			'.htaccess' => self::ACCESS_DENIAL_HTACCESS,
			'index.php' => self::ACCESS_DENIAL_INDEX,
		];

		$protected = true;
		foreach ( $files as $name => $contents ) {
			$path = $safe_directory . '/' . $name;
			if ( file_exists( $path ) ) {
				continue;
			}

			if ( ! $this->put_contents( $path, $contents ) ) {
				$protected = false;
			}
		}

		return $protected;
	}

	/**
	 * Return a temporary directory (with a trailing slash) confined to the allowed runtime roots.
	 *
	 * The WordPress temporary directory is used when it is a safe root. When
	 * WordPress falls back to wp-content or ABSPATH, a private uploads
	 * sub-directory is used instead so temporary files never land next to
	 * plugin, theme or drop-in code.
	 */
	public function get_runtime_temp_dir(): string {
		$temp_root = $this->get_safe_temp_root();
		if ( $temp_root !== '' ) {
			return trailingslashit( $temp_root );
		}

		if ( ! function_exists( 'wp_upload_dir' ) ) {
			return '';
		}

		$uploads = wp_upload_dir( null, false, false );
		if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) || ! is_string( $uploads['basedir'] ) ) {
			return '';
		}

		$directory = trailingslashit( $uploads['basedir'] ) . self::UPLOADS_TEMP_SUBDIR;
		if ( ! $this->ensure_directory( $directory ) ) {
			return '';
		}

		$this->write_access_denial_files( $directory );
		$safe_directory = $this->resolve_safe_directory_path( $directory, true );

		return $safe_directory === null ? '' : trailingslashit( $safe_directory );
	}

	/**
	 * Delete a directory recursively inside an allowed runtime root.
	 */
	public function delete_directory( string $path ): bool {
		$safe_path = $this->resolve_safe_directory_path( $path, true );
		if ( $safe_path === null || ! is_dir( $safe_path ) || is_link( $safe_path ) ) {
			return false;
		}

		foreach ( $this->get_allowed_runtime_roots() as $root ) {
			if ( $safe_path === $root ) {
				return false;
			}
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		return (bool) $filesystem->delete( $safe_path, true );
	}

	/**
	 * Delete a file inside an allowed runtime root.
	 */
	public function delete_file( string $path ): void {
		$safe_path = $this->resolve_safe_runtime_path( $path, true );
		if ( $safe_path === null || ! $this->exists( $safe_path ) || ! is_file( $safe_path ) || is_link( $safe_path ) ) {
			return;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return;
		}

		$filesystem->delete( $safe_path, false );
	}

	/**
	 * Resolve the direct WP_Filesystem instance used for writes, once per request.
	 *
	 * The global `$wp_filesystem` is deliberately not reused: another plugin may
	 * have initialised it with a remote transport. The result is recomputed only
	 * when FS_METHOD, the `filesystem_method` filter callbacks or the uploads
	 * directory change, so WordPress' write probe runs once per request instead of
	 * once per file operation.
	 */
	private function get_wp_filesystem(): ?WP_Filesystem_Base {
		$context   = $this->get_filesystem_method_context();
		$signature = $this->get_filesystem_method_signature( $context );
		if ( self::$resolved_signature === $signature ) {
			return self::$resolved_filesystem;
		}

		self::$resolved_signature  = $signature;
		self::$resolved_filesystem = null;

		if ( defined( 'ABSPATH' ) ) {
			if ( ! function_exists( 'get_filesystem_method' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
			}
			if ( ! class_exists( 'WP_Filesystem_Base', false ) ) {
				require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-base.php';
			}
			if ( ! class_exists( 'WP_Filesystem_Direct', false ) ) {
				require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-direct.php';
			}
		}

		if ( ! class_exists( 'WP_Filesystem_Direct', false ) ) {
			return null;
		}

		// get_filesystem_method() records how "direct" was chosen in a global read by core upgrades; keep it untouched.
		$had_direct_method_global = array_key_exists( '_wp_filesystem_direct_method', $GLOBALS );
		$direct_method_global     = $had_direct_method_global ? $GLOBALS['_wp_filesystem_direct_method'] : null;
		$method                   = function_exists( 'get_filesystem_method' ) ? get_filesystem_method( [], $context, true ) : 'direct';
		if ( $had_direct_method_global ) {
			$GLOBALS['_wp_filesystem_direct_method'] = $direct_method_global;
		} else {
			unset( $GLOBALS['_wp_filesystem_direct_method'] );
		}

		if ( $method !== 'direct' ) {
			return null;
		}

		self::$resolved_filesystem = new WP_Filesystem_Direct( null );

		return self::$resolved_filesystem;
	}

	/**
	 * Return the directory tested by get_filesystem_method(): the uploads base directory.
	 */
	private function get_filesystem_method_context(): string {
		if ( ! function_exists( 'wp_upload_dir' ) ) {
			return '';
		}

		$uploads = wp_upload_dir( null, false, false );
		if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) || ! is_string( $uploads['basedir'] ) || ! is_dir( $uploads['basedir'] ) ) {
			return '';
		}

		return $uploads['basedir'];
	}

	/**
	 * Build a cheap signature of every input that can change the resolved filesystem method.
	 */
	private function get_filesystem_method_signature( string $context ): string {
		global $wp_filter;

		$parts = [
			defined( 'FS_METHOD' ) ? (string) FS_METHOD : '',
			$context,
		];

		if ( isset( $wp_filter['filesystem_method'] ) && $wp_filter['filesystem_method'] instanceof WP_Hook ) {
			foreach ( $wp_filter['filesystem_method']->callbacks as $priority => $callbacks ) {
				$parts[] = $priority . ':' . implode( ',', array_keys( (array) $callbacks ) );
			}
		}

		return implode( '|', $parts );
	}

	/**
	 * Return the permission mode applied to written files.
	 */
	private function get_file_mode(): int {
		return defined( 'FS_CHMOD_FILE' ) ? (int) FS_CHMOD_FILE : 0644;
	}

	/**
	 * Read the CRC32 and the uncompressed size modulo 2^32 from a gzip file.
	 *
	 * @return array{crc32:int,size:int}|null Null when the file is not a gzip archive.
	 */
	private function read_gzip_trailer( string $path ): ?array {
		$file_size = filesize( $path );
		if ( ! is_int( $file_size ) || $file_size < 18 ) {
			return null;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Read-only access to the gzip signature and trailer.
		$handle = fopen( $path, 'rb' );
		if ( $handle === false ) {
			return null;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Two signature bytes only.
		$magic   = fread( $handle, 2 );
		$trailer = fseek( $handle, -8, SEEK_END ) === 0
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Eight trailer bytes only.
			? fread( $handle, 8 )
			: false;
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Paired with the read-only fopen above.
		fclose( $handle );

		if ( $magic !== "\x1f\x8b" || ! is_string( $trailer ) || strlen( $trailer ) !== 8 ) {
			return null;
		}

		$values = unpack( 'Vcrc32/Vsize', $trailer );
		if ( ! is_array( $values ) ) {
			return null;
		}

		return [
			'crc32' => (int) $values['crc32'],
			'size'  => (int) $values['size'],
		];
	}

	/**
	 * Normalize a filesystem path for comparisons and WP_Filesystem operations.
	 */
	private function normalize_path( string $path ): string {
		$normalized = function_exists( 'wp_normalize_path' ) ? wp_normalize_path( trim( $path ) ) : str_replace( '\\', '/', trim( $path ) );
		return $normalized === '' ? '' : rtrim( $normalized, '/' );
	}

	/**
	 * Resolve a local path and prove that it stays inside an allowed runtime root.
	 */
	public function resolve_safe_runtime_path( string $path, bool $must_exist ): ?string {
		return $this->resolve_safe_path( $path, $must_exist, false );
	}

	/**
	 * Resolve a local directory path and prove that it stays inside an allowed runtime root.
	 */
	public function resolve_safe_directory_path( string $path, bool $must_exist ): ?string {
		return $this->resolve_safe_path( $path, $must_exist, true );
	}

	/**
	 * Resolve a path while rejecting wrappers, traversal, and symlink leaf targets.
	 */
	private function resolve_safe_path( string $path, bool $must_exist, bool $directory ): ?string {
		if ( $path === '' || str_contains( $path, "\0" ) ) {
			return null;
		}

		$decoded_path = rawurldecode( $path );
		if ( str_contains( $decoded_path, "\0" ) || $this->has_stream_scheme( $decoded_path ) ) {
			return null;
		}

		$normalized = $this->normalize_path( $decoded_path );
		if ( $normalized === '' || $this->has_parent_traversal( $normalized ) || is_link( $normalized ) ) {
			return null;
		}

		if ( file_exists( $normalized ) ) {
			$existing = realpath( $normalized );
			if ( ! is_string( $existing ) ) {
				return null;
			}
			$safe_existing = $this->normalize_path( $existing );
			if ( ! $this->is_confined_to_allowed_roots( $safe_existing ) ) {
				return null;
			}
			if ( $directory && ! is_dir( $safe_existing ) ) {
				return null;
			}
			if ( ! $directory && is_dir( $safe_existing ) ) {
				return null;
			}
			return $safe_existing;
		}

		if ( $must_exist ) {
			return null;
		}

		$parent = dirname( $normalized );
		$tail = [ basename( $normalized ) ];
		while ( $parent !== '' && $parent !== '.' && ! file_exists( $parent ) ) {
			array_unshift( $tail, basename( $parent ) );
			$next_parent = dirname( $parent );
			if ( $next_parent === $parent ) {
				return null;
			}
			$parent = $next_parent;
		}

		if ( $parent === '' || $parent === '.' || is_link( $parent ) ) {
			return null;
		}

		$real_parent = realpath( $parent );
		if ( ! is_string( $real_parent ) ) {
			return null;
		}

		$safe_parent = $this->normalize_path( $real_parent );
		if ( ! $this->is_confined_to_allowed_roots( $safe_parent ) ) {
			return null;
		}

		foreach ( $tail as $segment ) {
			if ( $segment === '' || $segment === '.' || $segment === '..' ) {
				return null;
			}
			$safe_parent .= '/' . $segment;
		}

		return $safe_parent;
	}

	/**
	 * Reject URL/stream wrapper schemes such as php://, data://, and phar://.
	 */
	private function has_stream_scheme( string $path ): bool {
		return preg_match( '#^[a-z][a-z0-9+.-]*://#i', ltrim( $path ) ) === 1;
	}

	/**
	 * Reject dot-dot segments after normalization and URL decoding.
	 */
	private function has_parent_traversal( string $path ): bool {
		$segments = explode( '/', $path );
		return in_array( '..', $segments, true );
	}

	/**
	 * Return the normalized uploads base directory, or an empty string.
	 */
	private function get_uploads_root(): string {
		if ( ! function_exists( 'wp_upload_dir' ) ) {
			return '';
		}

		$uploads = wp_upload_dir( null, false, false );
		if ( ! empty( $uploads['error'] ) || ! isset( $uploads['basedir'] ) || ! is_string( $uploads['basedir'] ) ) {
			return '';
		}

		$real_root = realpath( $uploads['basedir'] );

		return is_string( $real_root ) ? $this->normalize_path( $real_root ) : '';
	}

	/**
	 * Return the normalized WordPress temporary directory when it is a safe write root.
	 *
	 * get_temp_dir() returns WP_CONTENT_DIR when neither the system temporary
	 * directory nor upload_tmp_dir is writable; that directory holds plugins,
	 * themes and drop-ins and must never become a write root.
	 */
	private function get_safe_temp_root(): string {
		$temp_root = realpath( $this->get_wordpress_temp_dir() );
		if ( ! is_string( $temp_root ) ) {
			return '';
		}

		$temp_root = $this->normalize_path( $temp_root );
		if ( $temp_root === '' || $this->is_inside_protected_code_directory( $temp_root ) ) {
			return '';
		}

		foreach ( $this->get_installation_directories() as $installation_directory ) {
			if ( $temp_root === $installation_directory ) {
				return '';
			}
		}

		return $temp_root;
	}

	/**
	 * Return the temporary directory chosen by WordPress.
	 */
	protected function get_wordpress_temp_dir(): string {
		return (string) ( function_exists( 'get_temp_dir' ) ? get_temp_dir() : sys_get_temp_dir() );
	}

	/**
	 * Runtime writes are confined to WordPress uploads and a safe temporary directory.
	 */
	private function get_allowed_runtime_roots(): array {
		return array_values( array_unique( array_filter( [ $this->get_uploads_root(), $this->get_safe_temp_root() ] ) ) );
	}

	/**
	 * Return the normalized ABSPATH and WP_CONTENT_DIR directories.
	 */
	private function get_installation_directories(): array {
		$directories = [];
		foreach ( [ defined( 'ABSPATH' ) ? ABSPATH : '', defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : '' ] as $directory ) {
			$real_directory = $directory === '' ? false : realpath( $directory );
			if ( is_string( $real_directory ) ) {
				$directories[] = $this->normalize_path( $real_directory );
			}
		}

		return array_values( array_unique( array_filter( $directories ) ) );
	}

	/**
	 * Return the WordPress code directories that runtime writes must never touch.
	 */
	private function get_protected_code_directories(): array {
		$directories = [];

		if ( defined( 'ABSPATH' ) ) {
			$directories[] = ABSPATH . 'wp-admin';
			$directories[] = ABSPATH . ( defined( 'WPINC' ) ? WPINC : 'wp-includes' );
		}
		if ( defined( 'WP_PLUGIN_DIR' ) ) {
			$directories[] = WP_PLUGIN_DIR;
		}
		if ( defined( 'WPMU_PLUGIN_DIR' ) ) {
			$directories[] = WPMU_PLUGIN_DIR;
		}
		if ( ! empty( $GLOBALS['wp_theme_directories'] ) && is_array( $GLOBALS['wp_theme_directories'] ) ) {
			foreach ( $GLOBALS['wp_theme_directories'] as $theme_directory ) {
				$directories[] = (string) $theme_directory;
			}
		} elseif ( defined( 'WP_CONTENT_DIR' ) ) {
			$directories[] = WP_CONTENT_DIR . '/themes';
		}

		$normalized = [];
		foreach ( $directories as $directory ) {
			$real_directory = realpath( $directory );
			if ( is_string( $real_directory ) ) {
				$normalized[] = $this->normalize_path( $real_directory );
			}
		}

		return array_values( array_unique( array_filter( $normalized ) ) );
	}

	/**
	 * Check whether a normalized path is one of the given directories or lives inside one.
	 */
	private function is_inside_any_directory( string $path, array $directories ): bool {
		foreach ( $directories as $directory ) {
			if ( $path === $directory || str_starts_with( $path, $directory . '/' ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check whether a normalized path is a WordPress code directory or lives inside one.
	 */
	private function is_inside_protected_code_directory( string $path ): bool {
		return $this->is_inside_any_directory( $path, $this->get_protected_code_directories() );
	}

	/**
	 * Check root confinement with segment boundaries instead of prefix matching.
	 *
	 * Paths inside uploads are allowed. Paths reached through the temporary root
	 * are refused when they belong to the WordPress installation (ABSPATH or
	 * wp-content) while the temporary root itself does not, which happens when
	 * the system temporary directory contains the whole installation. WordPress
	 * code directories are always refused.
	 */
	private function is_confined_to_allowed_roots( string $path ): bool {
		$normalized_path = $this->normalize_path( $path );
		if ( $normalized_path === '' || $this->is_inside_protected_code_directory( $normalized_path ) ) {
			return false;
		}

		$uploads_root = $this->get_uploads_root();
		if ( $uploads_root !== '' && $this->is_inside_any_directory( $normalized_path, [ $uploads_root ] ) ) {
			return true;
		}

		$temp_root = $this->get_safe_temp_root();
		if ( $temp_root === '' || ! $this->is_inside_any_directory( $normalized_path, [ $temp_root ] ) ) {
			return false;
		}

		foreach ( $this->get_installation_directories() as $installation_directory ) {
			if (
				$this->is_inside_any_directory( $normalized_path, [ $installation_directory ] )
				&& ! $this->is_inside_any_directory( $temp_root, [ $installation_directory ] )
			) {
				return false;
			}
		}

		return true;
	}

}
