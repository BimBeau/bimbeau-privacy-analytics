<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CSV-backed coordinate lookup service for analytics map markers.
 */

class BBPA_City_Coordinates_Service {
    private const CACHE_GROUP = 'bbpa_city_coordinates';
    private const CACHE_KEY_PREFIX = 'worldcities_index_v2_';

    private ?array $index = null;
    private string $csv_path;
    private BBPA_Filesystem_Service $filesystem_service;

    public function __construct(?string $csv_path = null, ?BBPA_Filesystem_Service $filesystem_service = null) {
        $this->csv_path = $csv_path !== null && $csv_path !== ''
            ? $csv_path
            : BBPA_PATH . 'assets/data/worldcities.csv';
        $this->filesystem_service = $filesystem_service ?? new BBPA_Filesystem_Service();
    }

    /**
     * Resolve coordinates from a legacy city + country lookup index.
     */
    public function resolve_coordinates(string $city_name, string $country_code): array {
        $lookup_key = $this->build_lookup_key($city_name, $country_code);

        if ($lookup_key === '') {
            return [
                'found' => false,
                'lookup_key' => '',
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => null,
            ];
        }

        $legacy_index = $this->get_legacy_index();
        if (!isset($legacy_index[$lookup_key])) {
            return [
                'found' => false,
                'lookup_key' => $lookup_key,
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => null,
            ];
        }

        return [
            'found' => true,
            'lookup_key' => $lookup_key,
            'latitude' => (float) $legacy_index[$lookup_key]['latitude'],
            'longitude' => (float) $legacy_index[$lookup_key]['longitude'],
            'geoname_id' => null,
        ];
    }



    /**
     * Resolve fallback coordinates for a country code.
     */
    public function resolve_country_coordinates(string $country_code): array {
        $normalized_country_code = function_exists('bbpa_normalize_country_code')
            ? bbpa_normalize_country_code($country_code)
            : strtoupper(trim($country_code));

        if ($normalized_country_code === '') {
            return [
                'found' => false,
                'lookup_key' => '',
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => null,
            ];
        }

        $country_index = $this->get_country_index();
        if (!isset($country_index[$normalized_country_code])) {
            return [
                'found' => false,
                'lookup_key' => $normalized_country_code,
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => null,
            ];
        }

        return [
            'found' => true,
            'lookup_key' => $normalized_country_code,
            'latitude' => (float) $country_index[$normalized_country_code]['latitude'],
            'longitude' => (float) $country_index[$normalized_country_code]['longitude'],
            'geoname_id' => null,
        ];
    }

    /**
     * Resolve coordinates from the GeoName ID index built from worldcities.csv.
     *
     * @param mixed $geoname_id GeoName identifier to resolve.
     */
    public function resolve_coordinates_by_geoname_id($geoname_id): array {
        $normalized_geoname_id = $this->normalize_geoname_id($geoname_id);

        if ($normalized_geoname_id === null) {
            return [
                'found' => false,
                'lookup_key' => '',
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => null,
            ];
        }

        $geoname_index = $this->get_geoname_index();
        if (!isset($geoname_index[$normalized_geoname_id])) {
            return [
                'found' => false,
                'lookup_key' => (string) $normalized_geoname_id,
                'latitude' => null,
                'longitude' => null,
                'geoname_id' => $normalized_geoname_id,
            ];
        }

        return [
            'found' => true,
            'lookup_key' => (string) $normalized_geoname_id,
            'latitude' => (float) $geoname_index[$normalized_geoname_id]['latitude'],
            'longitude' => (float) $geoname_index[$normalized_geoname_id]['longitude'],
            'geoname_id' => $normalized_geoname_id,
        ];
    }

    /**
     * Build a normalized lookup key for city + country code.
     */
    public function build_lookup_key(string $city_name, string $country_code): string {
        $normalized_country_code = function_exists('bbpa_normalize_country_code')
            ? bbpa_normalize_country_code($country_code)
            : strtoupper(trim($country_code));
        $normalized_city_name = $this->normalize_city_name($city_name);

        if ($normalized_city_name === '' || $normalized_country_code === '') {
            return '';
        }

        return $normalized_city_name . '|' . $normalized_country_code;
    }

    /**
     * Normalize a city name for CSV lookups.
     */
    public function normalize_city_name(string $city_name): string {
        $city_name = trim(sanitize_text_field($city_name));
        if ($city_name === '') {
            return '';
        }

        if (function_exists('remove_accents')) {
            $city_name = remove_accents($city_name);
        }

        if (function_exists('mb_strtolower')) {
            $city_name = mb_strtolower($city_name, 'UTF-8');
        } else {
            $city_name = strtolower($city_name);
        }

        $city_name = str_replace(['-', '_'], ' ', $city_name);
        $city_name = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $city_name);
        $city_name = preg_replace('/\s+/u', ' ', $city_name);

        return trim($city_name);
    }

    /**
     * Load the indexed CSV once per request and reuse a WordPress cache when available.
     */
    private function get_indexes(): array {
        if ($this->index !== null) {
            return $this->index;
        }

        $cache_key = $this->get_cache_key();
        $cached_index = wp_cache_get($cache_key, self::CACHE_GROUP);
        if (is_array($cached_index)) {
            $this->index = $cached_index;

            return $this->index;
        }

        $cached_index = get_transient($cache_key);
        if (is_array($cached_index)) {
            wp_cache_set($cache_key, $cached_index, self::CACHE_GROUP, DAY_IN_SECONDS);
            $this->index = $cached_index;

            return $this->index;
        }

        $this->index = $this->parse_csv_index();
        wp_cache_set($cache_key, $this->index, self::CACHE_GROUP, DAY_IN_SECONDS);
        set_transient($cache_key, $this->index, DAY_IN_SECONDS);

        return $this->index;
    }

    /**
     * Resolve the GeoName ID index for the current CSV file.
     */
    private function get_geoname_index(): array {
        $indexes = $this->get_indexes();

        return isset($indexes['geoname']) && is_array($indexes['geoname'])
            ? $indexes['geoname']
            : [];
    }

    /**
     * Resolve the country code lookup index for country-level fallbacks.
     */
    private function get_country_index(): array {
        $indexes = $this->get_indexes();

        return isset($indexes['country']) && is_array($indexes['country'])
            ? $indexes['country']
            : [];
    }

    /**
     * Resolve the legacy city + country lookup index for backward compatibility.
     */
    private function get_legacy_index(): array {
        $indexes = $this->get_indexes();

        return isset($indexes['legacy']) && is_array($indexes['legacy'])
            ? $indexes['legacy']
            : [];
    }

    /**
     * Parse worldcities.csv into normalized lookup indexes.
     */
    private function parse_csv_index(): array {
        $indexes = [
            'geoname' => [],
            'legacy' => [],
            'country' => [],
        ];

        if (!$this->filesystem_service->is_readable($this->csv_path)) {
            return $indexes;
        }

        try {
            $file = new SplFileObject($this->csv_path, 'r');
            $file->setFlags(SplFileObject::READ_CSV | SplFileObject::SKIP_EMPTY);
            $file->setCsvControl(',', '"', '\\');
        } catch (RuntimeException $exception) {
            return $indexes;
        }

        $header = $file->fgetcsv(',', '"', '\\');
        $header_map = $this->build_header_map($header);
        $has_geoname_format = $this->find_header_index($header_map, ['geoname id', 'geoname_id']) !== null
            && $this->find_header_index($header_map, ['coordinates']) !== null;
        $has_legacy_format = $this->find_header_index($header_map, ['city']) !== null
            && $this->find_header_index($header_map, ['lat']) !== null
            && $this->find_header_index($header_map, ['lng', 'lon', 'longitude']) !== null
            && $this->find_header_index($header_map, ['iso2', 'country_code']) !== null;

        if (!$has_geoname_format && !$has_legacy_format) {
            return $indexes;
        }

        while (!$file->eof()) {
            $row = $file->fgetcsv(',', '"', '\\');
            if ($row === false || $row === [null]) {
                continue;
            }

            if ($has_geoname_format) {
                $geoname_row = $this->parse_geoname_row($row, $header_map);
                if ($geoname_row !== null && !isset($indexes['geoname'][$geoname_row['geoname_id']])) {
                    $indexes['geoname'][$geoname_row['geoname_id']] = $geoname_row;
                }
            }

            if ($has_legacy_format) {
                $legacy_row = $this->parse_legacy_row($row, $header_map);
                if ($legacy_row !== null) {
                    if (!isset($indexes['legacy'][$legacy_row['lookup_key']])) {
                        $indexes['legacy'][$legacy_row['lookup_key']] = [
                            'latitude' => $legacy_row['latitude'],
                            'longitude' => $legacy_row['longitude'],
                        ];
                    }

                    if (!isset($indexes['country'][$legacy_row['country_code']])) {
                        $indexes['country'][$legacy_row['country_code']] = [
                            'latitude' => $legacy_row['latitude'],
                            'longitude' => $legacy_row['longitude'],
                        ];
                    }
                }
            }
        }

        return $indexes;
    }

    /**
     * Convert the CSV header row into a lowercase column map.
     */
    private function build_header_map($header): array {
        if (!is_array($header)) {
            return [];
        }

        $header_map = [];
        foreach ($header as $index => $column_name) {
            if (!is_string($column_name)) {
                continue;
            }

            $normalized_column_name = strtolower(trim(ltrim($column_name, "\xEF\xBB\xBF")));
            if ($normalized_column_name === '') {
                continue;
            }

            $header_map[$normalized_column_name] = (int) $index;
        }

        return $header_map;
    }

    /**
     * Find the first matching CSV header index from a list of aliases.
     */
    private function find_header_index(array $header_map, array $aliases): ?int {
        foreach ($aliases as $alias) {
            if (isset($header_map[$alias])) {
                return (int) $header_map[$alias];
            }
        }

        return null;
    }

    /**
     * Parse a GeoName-based CSV row.
     */
    private function parse_geoname_row(array $row, array $header_map): ?array {
        $geoname_id_index = $this->find_header_index($header_map, ['geoname id', 'geoname_id']);
        $coordinates_index = $this->find_header_index($header_map, ['coordinates']);

        if ($geoname_id_index === null || $coordinates_index === null) {
            return null;
        }

        $geoname_id = $this->normalize_geoname_id($row[$geoname_id_index] ?? null);
        $coordinates = $this->parse_coordinates_string($row[$coordinates_index] ?? null);

        if (
            $geoname_id === null
            || $coordinates['latitude'] === null
            || $coordinates['longitude'] === null
        ) {
            return null;
        }

        return [
            'geoname_id' => $geoname_id,
            'latitude' => $coordinates['latitude'],
            'longitude' => $coordinates['longitude'],
        ];
    }

    /**
     * Parse a legacy city + country CSV row.
     */
    private function parse_legacy_row(array $row, array $header_map): ?array {
        $city_index = $this->find_header_index($header_map, ['city']);
        $country_index = $this->find_header_index($header_map, ['iso2', 'country_code']);
        $latitude_index = $this->find_header_index($header_map, ['lat']);
        $longitude_index = $this->find_header_index($header_map, ['lng', 'lon', 'longitude']);

        if (
            $city_index === null
            || $country_index === null
            || $latitude_index === null
            || $longitude_index === null
        ) {
            return null;
        }

        $raw_country_code = isset($row[$country_index]) ? (string) $row[$country_index] : '';
        $normalized_country_code = function_exists('bbpa_normalize_country_code')
            ? bbpa_normalize_country_code($raw_country_code)
            : strtoupper(trim($raw_country_code));

        $lookup_key = $this->build_lookup_key(
            isset($row[$city_index]) ? (string) $row[$city_index] : '',
            $raw_country_code
        );
        $coordinates = bbpa_normalize_coordinate_pair(
            $row[$latitude_index] ?? null,
            $row[$longitude_index] ?? null
        );

        if ($lookup_key === '' || $normalized_country_code === '' || $coordinates['latitude'] === null || $coordinates['longitude'] === null) {
            return null;
        }

        return [
            'lookup_key' => $lookup_key,
            'latitude' => $coordinates['latitude'],
            'longitude' => $coordinates['longitude'],
        ];
    }

    /**
     * Parse a CSV Coordinates cell formatted as "lat, lng".
     */
    private function parse_coordinates_string($value): array {
        if (!is_string($value)) {
            return [
                'latitude' => null,
                'longitude' => null,
            ];
        }

        $value = trim(sanitize_text_field($value));
        if ($value === '') {
            return [
                'latitude' => null,
                'longitude' => null,
            ];
        }

        $parts = array_map('trim', explode(',', $value));
        if (count($parts) < 2) {
            return [
                'latitude' => null,
                'longitude' => null,
            ];
        }

        return bbpa_normalize_coordinate_pair($parts[0], $parts[1]);
    }

    /**
     * Normalize a GeoName identifier for CSV lookups.
     *
     * @param mixed $geoname_id Raw GeoName identifier value.
     */
    private function normalize_geoname_id($geoname_id): ?int {
        if (function_exists('bbpa_normalize_geoname_id')) {
            return bbpa_normalize_geoname_id($geoname_id);
        }

        if (!is_numeric($geoname_id)) {
            return null;
        }

        $normalized_geoname_id = (int) $geoname_id;

        return $normalized_geoname_id > 0 ? $normalized_geoname_id : null;
    }

    /**
     * Generate a cache key that changes when the CSV file changes.
     */
    private function get_cache_key(): string {
        $filemtime = $this->filesystem_service->is_readable($this->csv_path)
            ? $this->filesystem_service->modified_time($this->csv_path)
            : 0;
        $filesize = $this->filesystem_service->is_readable($this->csv_path)
            ? $this->filesystem_service->size($this->csv_path)
            : 0;

        return self::CACHE_KEY_PREFIX . md5($this->csv_path . '|' . $filemtime . '|' . $filesize);
    }
}
