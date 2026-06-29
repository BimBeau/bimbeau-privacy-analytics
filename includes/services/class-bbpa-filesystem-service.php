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
	 * Write contents to a file.
	 */
	public function put_contents( string $path, string $contents ): bool {
		$filesystem = $this->get_wp_filesystem();
		if ( $filesystem instanceof WP_Filesystem_Base ) {
			return (bool) $filesystem->put_contents( $path, $contents, FS_CHMOD_FILE );
		}

		return file_put_contents( $path, $contents ) !== false;
	}

	/**
	 * Move/rename file.
	 */
	public function move( string $source, string $destination, bool $overwrite = false ): bool {
		if ( $source === '' || $destination === '' ) {
			return false;
		}

		$normalized_source      = $this->normalize_path( $source );
		$normalized_destination = $this->normalize_path( $destination );
		if ( $normalized_source === '' || $normalized_destination === '' ) {
			return false;
		}

		if ( ! $this->is_path_safe_for_move( $normalized_source ) || ! $this->is_path_safe_for_move( $normalized_destination ) ) {
			return false;
		}

		$filesystem = $this->get_wp_filesystem();
		if ( ! $filesystem instanceof WP_Filesystem_Base ) {
			return false;
		}

		$moved = (bool) $filesystem->move( $normalized_source, $normalized_destination, $overwrite );
		if ( $moved ) {
			return true;
		}

		if ( isset( $filesystem->errors ) && $filesystem->errors instanceof WP_Error ) {
			return false;
		}

		return false;
	}

	/**
	 * Delete file with WordPress helper when available.
	 */
	public function delete_file( string $path ): void {
		if ( $path === '' || ! $this->exists( $path ) || ! is_file( $path ) ) {
			return;
		}

		if ( function_exists( 'wp_delete_file' ) ) {
			wp_delete_file( $path );
			return;
		}

		wp_delete_file( $path );
	}

	/**
	 * Resolve a WP_Filesystem instance.
	 */
	private function get_wp_filesystem(): ?WP_Filesystem_Base {
		global $wp_filesystem;

		if ( $wp_filesystem instanceof WP_Filesystem_Base ) {
			return $wp_filesystem;
		}

		if ( ! function_exists( 'WP_Filesystem' ) && defined( 'ABSPATH' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		if ( function_exists( 'get_filesystem_method' ) && get_filesystem_method() !== 'direct' ) {
			return null;
		}

		if ( function_exists( 'WP_Filesystem' ) && WP_Filesystem() ) {
			return $wp_filesystem instanceof WP_Filesystem_Base ? $wp_filesystem : null;
		}

		return null;
	}

	/**
	 * Normalize a filesystem path for comparisons and WP_Filesystem operations.
	 */
	private function normalize_path( string $path ): string {
		$normalized = wp_normalize_path( trim( $path ) );
		return $normalized === '' ? '' : rtrim( $normalized, '/' );
	}

	/**
	 * Ensure paths used in move operations are confined to local allowed roots.
	 */
	private function is_path_safe_for_move( string $path ): bool {
		if ( $path === '' || str_contains( $path, '../' ) || str_contains( $path, '/..' ) ) {
			return false;
		}

		$uploads_dir = '';
		if ( function_exists( 'wp_upload_dir' ) ) {
			$uploads = wp_upload_dir();
			if ( isset( $uploads['basedir'] ) && is_string( $uploads['basedir'] ) ) {
				$uploads_dir = $uploads['basedir'];
			}
		}

		$allowed_roots = array_filter(
			array_map(
				array( $this, 'normalize_path' ),
				array( ABSPATH, WP_CONTENT_DIR, WP_PLUGIN_DIR, $uploads_dir )
			)
		);

		foreach ( $allowed_roots as $allowed_root ) {
			if ( $path === $allowed_root || str_starts_with( $path . '/', trailingslashit( $allowed_root ) ) ) {
				return true;
			}
		}

		return false;
	}
}
