<?php
if (!defined('ABSPATH')) { exit; }

/** Downloads explicitly enabled referrer favicons into local uploads storage. */
class BBPA_Favicon_Resolver {
    private const CACHE_VERSION = 'v4';
    private const CACHE_KEY_PREFIX = 'bbpa_favicon_v4_';
    private const NEGATIVE_KEY_PREFIX = 'bbpa_favicon_negative_v4_';
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
        $host = $this->normalize_observed_host($domain);
        $this->debug('normalized domain', $host);
        if ($host === '' || !$this->is_safe_public_host($host)) { return $this->fail($host, 'unsafe or invalid domain', false); }

        $cache_key = self::CACHE_KEY_PREFIX . md5($host);
        $cached = get_transient($cache_key);
        if (is_array($cached) && $this->is_valid_local_file($cached)) { $this->debug('cache', 'positive hit'); return $cached; }
        if ($cached !== false) { delete_transient($cache_key); }
        if (get_transient($this->negative_key($host))) { $this->debug('cache', 'negative hit'); return []; }

        $homepage = 'https://' . $host . '/';
        $this->debug('homepage URL', $this->redact_url($homepage));
        $html = $this->request($homepage, 'text/html,application/xhtml+xml');
        if (!$html) {
            $alternate = str_starts_with($host, 'www.') ? substr($host, 4) : 'www.' . $host;
            if ($this->is_safe_public_host($alternate)) {
                $homepage = 'https://' . $alternate . '/';
                $html = $this->request($homepage, 'text/html,application/xhtml+xml');
            }
        }
        $base = $html ? (string) $html['url'] : $homepage;
        $candidates = $html ? $this->extract_favicons_from_html((string) $html['body'], $base) : [];
        $parts = wp_parse_url($base);
        $origin = (string) ($parts['scheme'] ?? 'https') . '://' . (string) ($parts['host'] ?? $host) . (isset($parts['port']) ? ':' . $parts['port'] : '');
        foreach (['/favicon.ico', '/favicon.png', '/apple-touch-icon.png'] as $path) $candidates[] = $origin . $path;
        $candidates = array_values(array_unique(array_filter($candidates)));
        $this->debug('candidates', implode(', ', array_map([$this, 'redact_url'], $candidates)));
        $favicon = [];
        $any_temporary_failure = false;
        foreach ($candidates as $index => $candidate) {
            $this->debug('candidate tried', ($index >= count($candidates) - 3 ? 'fallback ' : 'declared ') . $this->redact_url($candidate));
            $favicon = $this->download_and_store($candidate, $host);
            $any_temporary_failure = $any_temporary_failure || $this->last_failure_temporary;
            if ($favicon) break;
            $this->debug('candidate rejected', $this->last_failure ?: 'unavailable');
        }
        if (!$favicon) {
            $reason = $this->last_failure ?: 'favicon unavailable';
            $temporary = $any_temporary_failure;
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
        $response = $this->request($url, 'image/x-icon,image/vnd.microsoft.icon,image/png,image/jpeg,image/webp,image/svg+xml,application/octet-stream');
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
        if ($body === '' || strlen($body) > self::MAX_BYTES || preg_match('/<(?:html|script)/i', substr($body, 0, 512))) return '';
        $media_type = strtolower(trim(explode(';', $content_type, 2)[0]));
        if ($media_type !== '' && !in_array($media_type, ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/octet-stream'], true)) return '';
        if ($media_type === 'image/svg+xml' || preg_match('/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i', $body)) {
            if (!preg_match('/^\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>.*<\/svg>\s*$/is', $body)) return '';
            if (preg_match('/<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["\']\s*(?:https?:|\/\/|data:)/i', $body)) return '';
            return 'svg';
        }
        $signatures = ['png' => "\x89PNG\r\n\x1a\n", 'jpg' => "\xff\xd8\xff", 'webp' => 'RIFF', 'ico' => "\x00\x00\x01\x00"];
        foreach ($signatures as $format => $signature) if (str_starts_with($body, $signature) && ($format !== 'webp' || substr($body, 8, 4) === 'WEBP')) return $format;
        return '';
    }

    private function extract_favicons_from_html(string $html, string $base): array {
        if (!class_exists('DOMDocument')) return [];
        $dom = new DOMDocument(); libxml_use_internal_errors(true); $dom->loadHTML($html); libxml_clear_errors();
        $base_nodes = $dom->getElementsByTagName('base');
        if ($base_nodes->length > 0) {
            $declared_base = $this->resolve_absolute_url(trim((string) $base_nodes->item(0)->getAttribute('href')), $base);
            if ($declared_base !== '') $base = $declared_base;
        }
        $candidates = [];
        foreach ($dom->getElementsByTagName('link') as $link) {
            $rels = preg_split('/\s+/', strtolower(trim((string) $link->getAttribute('rel')))) ?: [];
            $is_icon = in_array('icon', $rels, true);
            $is_apple = in_array('apple-touch-icon', $rels, true) || in_array('apple-touch-icon-precomposed', $rels, true);
            if (!$is_icon && !$is_apple) continue;
            $url = $this->resolve_absolute_url(trim((string) $link->getAttribute('href')), $base);
            if ($url === '') continue;
            $extension = strtolower((string) pathinfo((string) (wp_parse_url($url, PHP_URL_PATH) ?: ''), PATHINFO_EXTENSION));
            $sizes = strtolower(trim((string) $link->getAttribute('sizes')));
            $safe_format = in_array($extension, ['ico', 'png', 'webp', 'jpg', 'jpeg', 'svg'], true);
            $preferred_size = (bool) preg_match('/(?:^|\s)(?:16x16|32x32|48x48|180x180|192x192)(?:\s|$)/', $sizes);
            $priority = $safe_format ? 0 : ($preferred_size ? 1 : ($is_apple ? 2 : 3));
            $candidates[] = ['url' => $url, 'priority' => $priority];
        }
        usort($candidates, static fn(array $left, array $right): int => $left['priority'] <=> $right['priority']);
        return array_values(array_unique(array_column($candidates, 'url')));
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
    public function normalize_observed_host(string $domain): string { $value = strtolower(trim(preg_replace('#^https?://#i', '', $domain))); $value = explode('/', $value)[0] ?? ''; $parts = wp_parse_url('https://' . $value); $value = is_array($parts) ? (string) ($parts['host'] ?? '') : ''; return preg_match('/^[a-z0-9.-]+$/', $value) ? rtrim($value, '.') : ''; }
    private function is_safe_public_host(string $host): bool { if ($host === 'localhost' || str_ends_with($host, '.local')) return false; if (filter_var($host, FILTER_VALIDATE_IP)) return $this->is_public_ip($host); $records = function_exists('dns_get_record') ? dns_get_record($host, DNS_A | DNS_AAAA) : []; $addresses = []; foreach (is_array($records) ? $records : [] as $record) { $ip = $record['ip'] ?? $record['ipv6'] ?? ''; if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP)) $addresses[] = $ip; } if (!$addresses) { $ip = gethostbyname($host); if ($ip !== $host && filter_var($ip, FILTER_VALIDATE_IP)) $addresses[] = $ip; } if (!$addresses) return false; foreach (array_unique($addresses) as $ip) if (!$this->is_public_ip($ip)) return false; return true; }
    private function is_public_ip(string $ip): bool { return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false; }
    private function is_allowed_scheme(string $scheme): bool { return in_array(strtolower($scheme), ['http', 'https'], true); }
    private function get_user_agent(): string { return 'BimBeau Privacy Analytics Favicon Fetcher'; }
    private function set_failure(string $reason, bool $temporary): void { $this->last_failure = $reason; $this->last_failure_temporary = $temporary; }
    private function fail(string $host, string $reason, bool $temporary): array { $this->set_failure($reason, $temporary); $this->debug('failure', ($host ? $host . ': ' : '') . $reason); return []; }
    private function redact_url(string $url): string { $parts = wp_parse_url($url); if (!is_array($parts) || empty($parts['host'])) return '[invalid URL]'; return (string) ($parts['scheme'] ?? '') . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '') . (string) ($parts['path'] ?? '/'); }
    private function debug(string $field, string $value): void { if ((defined('WP_DEBUG') && WP_DEBUG) || (function_exists('bbpa_is_debug_mode_enabled') && bbpa_is_debug_mode_enabled())) error_log('[BBPA favicon] ' . $field . ': ' . $value); }
}
