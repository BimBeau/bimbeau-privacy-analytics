<?php
if (!defined('ABSPATH')) { exit; }

/** Downloads explicitly enabled referrer favicons into local uploads storage. */
class BBPA_Favicon_Resolver {
    private const CACHE_VERSION = 'v2';
    private const CACHE_KEY_PREFIX = 'bbpa_favicon_v2_';
    private const NEGATIVE_KEY_PREFIX = 'bbpa_favicon_negative_v2_';
    private const MAX_BYTES = 262144;
    private const MAX_REDIRECTS = 3;

    /** Invalidate every negative entry without an unbounded transient-table scan. */
    public static function invalidate_negative_cache(): void {
        update_option('bbpa_favicon_negative_cache_generation', self::negative_generation() + 1, false);
    }

    private static function negative_generation(): int {
        return max(1, (int) get_option('bbpa_favicon_negative_cache_generation', 1));
    }

    private function negative_key(string $host): string {
        return self::NEGATIVE_KEY_PREFIX . self::negative_generation() . '_' . md5($host);
    }

    public function resolve_favicon_url_for_domain(string $domain): string {
        $result = $this->resolve_favicon_for_domain($domain);
        return (string) ($result['url'] ?? '');
    }

    /** Return a favicon URL only when its corresponding uploads file still exists. */
    public function resolve_favicon_for_domain(string $domain): array {
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        if (empty($settings['referrer_favicons_enabled'])) { return []; }
        $host = $this->normalize_domain($domain);
        $this->debug('normalized domain', $host);
        if ($host === '' || !$this->is_safe_public_host($host)) { return $this->fail($host, 'unsafe or invalid domain', false); }

        $cache_key = self::CACHE_KEY_PREFIX . md5($host);
        $cached = get_transient($cache_key);
        if (is_array($cached) && $this->is_valid_local_file($cached)) { return $cached; }
        if ($cached !== false) { delete_transient($cache_key); }
        if (get_transient($this->negative_key($host))) { return []; }

        $homepage = 'https://' . $host . '/';
        $this->debug('homepage URL', $this->redact_url($homepage));
        $html = $this->request($homepage, 'text/html,application/xhtml+xml');
        $candidate = $html ? $this->extract_favicon_from_html((string) $html['body'], (string) $html['url']) : '';
        if ($candidate === '') {
            $base = $html ? (string) $html['url'] : $homepage;
            $parts = wp_parse_url($base);
            $candidate = (string) ($parts['scheme'] ?? 'https') . '://' . (string) ($parts['host'] ?? $host) . '/favicon.ico';
        }
        $this->debug('favicon candidate', $this->redact_url($candidate));
        $favicon = $this->download_and_store($candidate, $host);
        if (!$favicon) {
            $reason = $this->last_failure ?: 'favicon unavailable';
            $temporary = $this->last_failure_temporary;
            set_transient($this->negative_key($host), ['reason' => $reason, 'temporary' => $temporary], $temporary ? 5 * MINUTE_IN_SECONDS : HOUR_IN_SECONDS);
            return $this->fail($host, $reason, $temporary);
        }
        set_transient($cache_key, $favicon, DAY_IN_SECONDS);
        delete_transient($this->negative_key($host));
        $this->debug('local path', $favicon['path']);
        $this->debug('local URL', $favicon['url']);
        return $favicon;
    }

    private string $last_failure = '';
    private bool $last_failure_temporary = false;

    private function request(string $url, string $accept): ?array {
        $current = $url;
        for ($redirects = 0; $redirects <= self::MAX_REDIRECTS; $redirects++) {
            if (!$this->is_safe_url($current)) { $this->set_failure('unsafe request or redirect destination', false); return null; }
            $response = wp_safe_remote_get($current, ['timeout' => 4, 'redirection' => 0, 'limit_response_size' => self::MAX_BYTES, 'reject_unsafe_urls' => true, 'user-agent' => $this->get_user_agent(), 'headers' => ['Accept' => $accept]]);
            if (is_wp_error($response)) { $this->set_failure('network request failed', true); return null; }
            $code = (int) wp_remote_retrieve_response_code($response);
            $this->debug('HTTP response', $this->redact_url($current) . ' [' . $code . ']');
            if ($code >= 300 && $code < 400) {
                $location = trim((string) wp_remote_retrieve_header($response, 'location'));
                $next = $this->resolve_absolute_url($location, $current);
                $this->debug('redirect URL', $this->redact_url($next ?: $location));
                if ($redirects === self::MAX_REDIRECTS) { $this->set_failure('redirect limit exceeded', true); return null; }
                if ($next === '' || !$this->is_safe_url($next)) { $this->set_failure('unsafe redirect destination', false); return null; }
                $current = $next;
                continue;
            }
            if ($code !== 200) { $this->set_failure('unexpected HTTP status ' . $code, $code >= 500 || $code === 408 || $code === 429); return null; }
            $body = wp_remote_retrieve_body($response);
            if (!is_string($body) || strlen($body) > self::MAX_BYTES) { $this->set_failure('response exceeds size limit', false); return null; }
            return ['body' => $body, 'content_type' => strtolower(trim((string) wp_remote_retrieve_header($response, 'content-type'))), 'url' => $current];
        }
        return null;
    }

    private function download_and_store(string $url, string $host): array {
        $response = $this->request($url, 'image/x-icon,image/png,image/jpeg,image/webp');
        if (!$response) return [];
        $this->debug('candidate HTTP response', $this->redact_url($response['url']) . ' [200]');
        $this->debug('candidate Content-Type', $response['content_type']);
        $format = $this->validate_image((string) $response['body'], (string) $response['content_type']);
        $this->debug('validation result', $format === '' ? 'rejected' : 'accepted ' . $format);
        if ($format === '') { $this->set_failure('favicon content validation failed', false); return []; }
        $uploads = wp_upload_dir(null, false, false);
        if (!empty($uploads['error']) || empty($uploads['basedir']) || empty($uploads['baseurl'])) { $this->set_failure('uploads directory unavailable', true); return []; }
        $directory = trailingslashit($uploads['basedir']) . 'bbpa/favicons';
        $name = hash('sha256', $host) . '.' . $format;
        $path = trailingslashit($directory) . $name;
        $service = new BBPA_Filesystem_Service();
        if (!$service->ensure_directory($directory) || !$service->put_contents($path, (string) $response['body']) || !$service->exists($path) || !is_readable($path)) { $this->set_failure('local favicon write failed', true); return []; }
        return ['path' => $path, 'url' => trailingslashit($uploads['baseurl']) . 'bbpa/favicons/' . $name, 'cache_version' => self::CACHE_VERSION];
    }

    private function validate_image(string $body, string $content_type): string {
        if ($body === '' || strlen($body) > self::MAX_BYTES || preg_match('/<(?:svg|html|script|\?xml)/i', substr($body, 0, 512))) return '';
        $media_type = strtolower(trim(explode(';', $content_type, 2)[0]));
        if ($media_type !== '' && !in_array($media_type, ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/jpeg', 'image/webp'], true)) return '';
        $signatures = ['png' => "\x89PNG\r\n\x1a\n", 'jpg' => "\xff\xd8\xff", 'webp' => 'RIFF', 'ico' => "\x00\x00\x01\x00"];
        foreach ($signatures as $format => $signature) if (str_starts_with($body, $signature) && ($format !== 'webp' || substr($body, 8, 4) === 'WEBP')) return $format;
        return '';
    }

    private function extract_favicon_from_html(string $html, string $base): string {
        if (!class_exists('DOMDocument')) return '';
        $dom = new DOMDocument(); libxml_use_internal_errors(true); $dom->loadHTML($html); libxml_clear_errors();
        foreach ($dom->getElementsByTagName('link') as $link) {
            if (strpos(strtolower((string) $link->getAttribute('rel')), 'icon') === false) continue;
            $url = $this->resolve_absolute_url(trim((string) $link->getAttribute('href')), $base);
            if ($url !== '') return $url;
        }
        return '';
    }

    private function resolve_absolute_url(string $url, string $base): string {
        if ($url === '') return '';
        $parsed = wp_parse_url($url);
        if (is_array($parsed) && isset($parsed['scheme'])) return $this->is_allowed_scheme((string) $parsed['scheme']) ? $url : '';
        $p = wp_parse_url($base); if (!is_array($p) || empty($p['host']) || empty($p['scheme'])) return '';
        if (str_starts_with($url, '//')) return $p['scheme'] . ':' . $url;
        $port = isset($p['port']) ? ':' . $p['port'] : '';
        if (!str_starts_with($url, '/')) {
            $path = (string) ($p['path'] ?? '/');
            $url = trailingslashit(dirname($path)) . $url;
        }
        return $p['scheme'] . '://' . $p['host'] . $port . $url;
    }

    private function is_safe_url(string $url): bool {
        $parts = wp_parse_url($url);
        return is_array($parts) && !empty($parts['host']) && !empty($parts['scheme']) && empty($parts['user']) && empty($parts['pass']) && $this->is_allowed_scheme((string) $parts['scheme']) && $this->is_safe_public_host((string) $parts['host']);
    }
    private function is_valid_local_file(array $entry): bool {
        if (!isset($entry['url'], $entry['path'])) return false;
        $uploads = wp_upload_dir(null, false, false);
        $root = !empty($uploads['basedir']) ? realpath(trailingslashit($uploads['basedir']) . 'bbpa/favicons') : false;
        $path = realpath((string) $entry['path']);
        return $root !== false && $path !== false && str_starts_with($path, trailingslashit($root)) && (new BBPA_Filesystem_Service())->exists($path) && is_readable($path);
    }
    private function normalize_domain(string $domain): string { $value = strtolower(trim(preg_replace('#^https?://#i', '', $domain))); $value = explode('/', $value)[0] ?? ''; $value = explode(':', $value)[0] ?? ''; return preg_match('/^[a-z0-9.-]+$/', $value) ? rtrim($value, '.') : ''; }
    private function is_safe_public_host(string $host): bool { if ($host === 'localhost' || str_ends_with($host, '.local')) return false; if (filter_var($host, FILTER_VALIDATE_IP)) return $this->is_public_ip($host); $records = function_exists('dns_get_record') ? dns_get_record($host, DNS_A | DNS_AAAA) : []; if (!$records) { $ip = gethostbyname($host); $records = $ip === $host ? [] : [['ip' => $ip]]; } foreach ($records as $record) { $ip = $record['ip'] ?? $record['ipv6'] ?? ''; if ($ip === '' || !$this->is_public_ip($ip)) return false; } return count($records) > 0; }
    private function is_public_ip(string $ip): bool { return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false; }
    private function is_allowed_scheme(string $scheme): bool { return in_array(strtolower($scheme), ['http', 'https'], true); }
    private function get_user_agent(): string { return 'BimBeau Privacy Analytics Favicon Fetcher'; }
    private function set_failure(string $reason, bool $temporary): void { $this->last_failure = $reason; $this->last_failure_temporary = $temporary; }
    private function fail(string $host, string $reason, bool $temporary): array { $this->set_failure($reason, $temporary); $this->debug('failure', ($host ? $host . ': ' : '') . $reason); return []; }
    private function redact_url(string $url): string { $parts = wp_parse_url($url); if (!is_array($parts) || empty($parts['host'])) return '[invalid URL]'; return (string) ($parts['scheme'] ?? '') . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '') . (string) ($parts['path'] ?? '/'); }
    private function debug(string $field, string $value): void { if ((defined('WP_DEBUG') && WP_DEBUG) || (function_exists('bbpa_is_debug_mode_enabled') && bbpa_is_debug_mode_enabled())) error_log('[BBPA favicon] ' . $field . ': ' . $value); }
}
