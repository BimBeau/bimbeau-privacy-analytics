<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Internal filesystem adapter to centralize WordPress file operations.
 */
class BBPA_Filesystem_Service {
	/**
	 * Return whether a file exists.
	 */
	public function exists( string $path ): bool {
		if ( $path === '' ) {
			return false;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			return (bool) $filesystem->exists( $path );
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

		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			return (bool) $filesystem->is_readable( $path );
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

		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			$size = $filesystem->size( $path );
			return is_numeric( $size ) ? (int) $size : 0;
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

		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			$time = $filesystem->mtime( $path );
			return is_numeric( $time ) ? (int) $time : 0;
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

		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			return $filesystem->get_contents( $path );
		}

		return file_get_contents( $path );
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

		return (bool) $filesystem->put_contents( $safe_path, $contents, defined( 'FS_CHMOD_FILE' ) ? FS_CHMOD_FILE : 0644 );
	}

	/**
	 * Move/rename file inside allowed runtime roots.
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
	 * Resolve a WP_Filesystem instance.
	 */
	private function get_wp_filesystem(): ?WP_Filesystem_Base {
		global $wp_filesystem;

		if ( $wp_filesystem instanceof WP_Filesystem_Base ) {
			return $this->is_direct_filesystem( $wp_filesystem ) ? $wp_filesystem : null;
		}

		if ( ! function_exists( 'WP_Filesystem' ) && defined( 'ABSPATH' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		if ( function_exists( 'get_filesystem_method' ) && get_filesystem_method() !== 'direct' ) {
			return null;
		}

		if ( function_exists( 'WP_Filesystem' ) && WP_Filesystem() ) {
			return $wp_filesystem instanceof WP_Filesystem_Base && $this->is_direct_filesystem( $wp_filesystem ) ? $wp_filesystem : null;
		}

		return null;
	}


	/**
	 * Return whether the WP_Filesystem instance can operate on validated local paths.
	 */
	private function is_direct_filesystem( WP_Filesystem_Base $filesystem ): bool {
		if ( function_exists( 'get_filesystem_method' ) && get_filesystem_method() !== 'direct' ) {
			return false;
		}

		return $filesystem instanceof WP_Filesystem_Direct || strtolower( (string) ( $filesystem->method ?? '' ) ) === 'direct';
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
	 * Runtime writes are confined to WordPress uploads and WordPress temp storage.
	 */
	private function get_allowed_runtime_roots(): array {
		$roots = [];

		if ( function_exists( 'wp_upload_dir' ) ) {
			$uploads = wp_upload_dir( null, false, false );
			if ( empty( $uploads['error'] ) && isset( $uploads['basedir'] ) && is_string( $uploads['basedir'] ) ) {
				$roots[] = $uploads['basedir'];
			}
		}

		if ( function_exists( 'get_temp_dir' ) ) {
			$roots[] = get_temp_dir();
		} else {
			$roots[] = sys_get_temp_dir();
		}

		$normalized_roots = [];
		foreach ( $roots as $root ) {
			$real_root = realpath( (string) $root );
			if ( is_string( $real_root ) ) {
				$normalized_roots[] = $this->normalize_path( $real_root );
			}
		}

		return array_values( array_unique( array_filter( $normalized_roots ) ) );
	}

	/**
	 * Check root confinement with segment boundaries instead of prefix matching.
	 */
	private function is_confined_to_allowed_roots( string $path ): bool {
		$normalized_path = $this->normalize_path( $path );
		foreach ( $this->get_allowed_runtime_roots() as $root ) {
			if ( $normalized_path === $root || str_starts_with( $normalized_path, $root . '/' ) ) {
				return true;
			}
		}

		return false;
	}

}

