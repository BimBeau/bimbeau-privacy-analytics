<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolve favicon URLs for referrer domains with SSRF safeguards and caching.
 */
class BBPA_Favicon_Resolver
{
    private const CACHE_KEY_PREFIX = 'bbpa_favicon_';
    private const ERROR_KEY_PREFIX = 'bbpa_favicon_err_';

    /**
     * Resolve a favicon URL for a domain.
     */
    public function resolve_favicon_url_for_domain(string $domain): string
    {
        $normalized_domain = $this->normalize_domain($domain);
        if ($normalized_domain === '' || !$this->is_safe_public_host($normalized_domain)) {
            return '';
        }

        $cache_key = $this->get_cache_key($normalized_domain);
        $cached = get_transient($cache_key);
        if (is_string($cached)) {
            return $cached;
        }

        $resolved = $this->resolve_from_remote_html($normalized_domain);

        if ($resolved['network_error']) {
            $this->handle_network_error($normalized_domain);
            return '';
        }

        $this->reset_network_error_counter($normalized_domain);

        $favicon_url = $resolved['favicon_url'];
        if ($favicon_url === '') {
            $favicon_url = $this->resolve_from_advanced_paths($normalized_domain);
        }

        set_transient($cache_key, $favicon_url, $this->get_cache_ttl());

        return $favicon_url;
    }

    /**
     * Normalize domain input.
     */
    private function normalize_domain(string $domain): string
    {
        $value = trim(strtolower($domain));
        if ($value === '') {
            return '';
        }

        $value = preg_replace('#^https?://#i', '', $value);
        if (!is_string($value) || $value === '') {
            return '';
        }

        $value = explode('/', $value)[0] ?? '';
        $value = explode(':', $value)[0] ?? '';
        $value = rtrim($value, '.');

        if ($value === '' || strpos($value, ' ') !== false) {
            return '';
        }

        return $value;
    }

    /**
     * Resolve from HTML tags of the homepage.
     *
     * @return array{favicon_url:string,network_error:bool}
     */
    private function resolve_from_remote_html(string $domain): array
    {
        $homepage_url = 'https://' . $domain;
        $response = wp_remote_get(
            $homepage_url,
            [
                'timeout' => 4,
                'redirection' => 3,
                'limit_response_size' => 262144,
                'reject_unsafe_urls' => true,
                'user-agent' => $this->get_user_agent(),
                'headers' => [
                    'Accept' => 'text/html,application/xhtml+xml',
                ],
            ]
        );

        if (is_wp_error($response)) {
            return [
                'favicon_url' => '',
                'network_error' => true,
            ];
        }

        $body = wp_remote_retrieve_body($response);
        if (!is_string($body) || $body === '') {
            return [
                'favicon_url' => '',
                'network_error' => false,
            ];
        }

        $favicon = $this->extract_favicon_from_html($body, $homepage_url);

        return [
            'favicon_url' => $favicon,
            'network_error' => false,
        ];
    }

    /**
     * Parse HTML and extract favicon candidate.
     */
    private function extract_favicon_from_html(string $html, string $base_url): string
    {
        if (!class_exists('DOMDocument')) {
            return '';
        }

        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML($html);
        libxml_clear_errors();

        $links = $dom->getElementsByTagName('link');
        foreach ($links as $link) {
            $rel = strtolower((string) $link->getAttribute('rel'));
            if ($rel === '') {
                continue;
            }

            if (
                strpos($rel, 'icon') === false
                && strpos($rel, 'shortcut icon') === false
                && strpos($rel, 'apple-touch-icon') === false
            ) {
                continue;
            }

            $href = trim((string) $link->getAttribute('href'));
            $absolute = $this->resolve_absolute_url($href, $base_url);
            if ($absolute !== '') {
                return $absolute;
            }
        }

        $metas = $dom->getElementsByTagName('meta');
        foreach ($metas as $meta) {
            $name = strtolower((string) $meta->getAttribute('name'));
            if ($name !== 'msapplication-tileimage') {
                continue;
            }

            $content = trim((string) $meta->getAttribute('content'));
            $absolute = $this->resolve_absolute_url($content, $base_url);
            if ($absolute !== '') {
                return $absolute;
            }
        }

        return '';
    }

    /**
     * Resolve relative URLs into absolute URLs.
     */
    private function resolve_absolute_url(string $url, string $base_url): string
    {
        if ($url === '') {
            return '';
        }

        $parsed = wp_parse_url($url);
        if (is_array($parsed) && isset($parsed['scheme'])) {
            return $this->is_allowed_scheme($parsed['scheme']) ? $url : '';
        }

        if (strpos($url, '//') === 0) {
            return 'https:' . $url;
        }

        $base = wp_parse_url($base_url);
        if (!is_array($base) || empty($base['host'])) {
            return '';
        }

        $scheme = isset($base['scheme']) ? strtolower((string) $base['scheme']) : 'https';
        if (!$this->is_allowed_scheme($scheme)) {
            return '';
        }

        $host = (string) $base['host'];

        if (strpos($url, '/') === 0) {
            return sprintf('%s://%s%s', $scheme, $host, $url);
        }

        $path = isset($base['path']) ? (string) $base['path'] : '/';
        $directory = rtrim(dirname($path), '/');
        $directory = $directory === '' ? '' : $directory;

        return sprintf('%s://%s%s/%s', $scheme, $host, $directory, ltrim($url, '/'));
    }

    /**
     * Resolve favicon from advanced conventional paths.
     */
    private function resolve_from_advanced_paths(string $domain): string
    {
        $candidates = [
            '/favicon.ico',
            '/favicon.svg',
            '/favicon.png',
            '/apple-touch-icon.png',
        ];

        foreach ($candidates as $path) {
            return 'https://' . $domain . $path;
        }

        return '';
    }

    /**
     * Validate public host and reject private/local destinations.
     */
    private function is_safe_public_host(string $host): bool
    {
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local')) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return $this->is_public_ip($host);
        }

        $ips = [];
        $ipv4_records = function_exists('dns_get_record') ? dns_get_record($host, DNS_A) : [];
        if (is_array($ipv4_records)) {
            foreach ($ipv4_records as $record) {
                if (!empty($record['ip']) && is_string($record['ip'])) {
                    $ips[] = $record['ip'];
                }
            }
        }

        $ipv6_records = function_exists('dns_get_record') ? dns_get_record($host, DNS_AAAA) : [];
        if (is_array($ipv6_records)) {
            foreach ($ipv6_records as $record) {
                if (!empty($record['ipv6']) && is_string($record['ipv6'])) {
                    $ips[] = $record['ipv6'];
                }
            }
        }

        if ($ips === []) {
            $fallback_ip = gethostbyname($host);
            if (!is_string($fallback_ip) || $fallback_ip === $host) {
                return false;
            }

            $ips[] = $fallback_ip;
        }

        foreach ($ips as $ip) {
            if (!$this->is_public_ip($ip)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check whether an IP is public.
     */
    private function is_public_ip(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }

    /**
     * Allow only HTTP/HTTPS URLs.
     */
    private function is_allowed_scheme(string $scheme): bool
    {
        $normalized = strtolower($scheme);

        return $normalized === 'http' || $normalized === 'https';
    }

    /**
     * Resolve resolver cache TTL.
     */
    private function get_cache_ttl(): int
    {
        $ttl = (int) apply_filters('bbpa_favicon_cache_ttl', DAY_IN_SECONDS);

        return max(300, $ttl);
    }

    /**
     * Resolve user-agent for outgoing requests.
     */
    private function get_user_agent(): string
    {
        $version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';

        return sprintf('BimBeau Privacy Analytics/%s; %s', $version, home_url('/'));
    }

    /**
     * Build transient key for a normalized domain.
     */
    private function get_cache_key(string $normalized_domain): string
    {
        return self::CACHE_KEY_PREFIX . md5($normalized_domain);
    }

    /**
     * Build transient key for network-error tracking.
     */
    private function get_error_key(string $normalized_domain): string
    {
        return self::ERROR_KEY_PREFIX . md5($normalized_domain);
    }

    /**
     * Handle persistent network failures by invalidating stale cache.
     */
    private function handle_network_error(string $normalized_domain): void
    {
        $error_key = $this->get_error_key($normalized_domain);
        $error_count = (int) get_transient($error_key);
        $error_count++;

        set_transient($error_key, $error_count, HOUR_IN_SECONDS);

        if ($error_count >= 3) {
            delete_transient($this->get_cache_key($normalized_domain));
        }
    }

    /**
     * Reset persistent network failure counter.
     */
    private function reset_network_error_counter(string $normalized_domain): void
    {
        delete_transient($this->get_error_key($normalized_domain));
    }
}
