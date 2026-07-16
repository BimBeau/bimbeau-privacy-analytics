<?php
if (!defined('ABSPATH')) { exit; }

/** Downloads explicitly enabled referrer favicons into local uploads storage. */
class BBPA_Favicon_Resolver {
    private const CACHE_KEY_PREFIX = 'bbpa_favicon_';
    private const NEGATIVE_KEY_PREFIX = 'bbpa_favicon_negative_';
    private const MAX_BYTES = 262144;

    public function resolve_favicon_url_for_domain(string $domain): string {
        $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
        if (empty($settings['referrer_favicons_enabled'])) { return ''; }
        $host = $this->normalize_domain($domain);
        if ($host === '' || !$this->is_safe_public_host($host)) { return ''; }
        $cache_key = self::CACHE_KEY_PREFIX . md5($host);
        $cached = get_transient($cache_key);
        if (is_array($cached) && isset($cached['url'], $cached['path'])) {
            $filesystem = new BBPA_Filesystem_Service();
            if ($filesystem->exists((string) $cached['path'])) { return (string) $cached['url']; }
            delete_transient($cache_key);
        }
        if (get_transient(self::NEGATIVE_KEY_PREFIX . md5($host))) { return ''; }
        $homepage = 'https://' . $host . '/';
        $html = $this->request($homepage, 'text/html,application/xhtml+xml');
        $candidate = $html ? $this->extract_favicon_from_html((string) $html['body'], $homepage) : '';
        if ($candidate === '') { $candidate = 'https://' . $host . '/favicon.ico'; }
        $favicon = $this->download_and_store($candidate, $host);
        if ($favicon === '') { set_transient(self::NEGATIVE_KEY_PREFIX . md5($host), 1, HOUR_IN_SECONDS); return ''; }
        set_transient($cache_key, $favicon, DAY_IN_SECONDS);
        delete_transient(self::NEGATIVE_KEY_PREFIX . md5($host));
        return $favicon['url'];
    }

    private function request(string $url, string $accept): ?array {
        $parts = wp_parse_url($url);
        if (!is_array($parts) || empty($parts['host']) || empty($parts['scheme']) || !$this->is_allowed_scheme((string) $parts['scheme']) || !$this->is_safe_public_host((string) $parts['host'])) return null;
        $response = wp_safe_remote_get($url, ['timeout' => 4, 'redirection' => 0, 'limit_response_size' => self::MAX_BYTES, 'reject_unsafe_urls' => true, 'user-agent' => $this->get_user_agent(), 'headers' => ['Accept' => $accept]]);
        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) return null;
        $body = wp_remote_retrieve_body($response);
        if (!is_string($body) || strlen($body) > self::MAX_BYTES) return null;
        return ['body' => $body, 'content_type' => strtolower((string) wp_remote_retrieve_header($response, 'content-type'))];
    }

    private function download_and_store(string $url, string $host): array|string {
        $response = $this->request($url, 'image/x-icon,image/png,image/jpeg,image/webp');
        if (!$response) return '';
        $format = $this->validate_image((string) $response['body'], (string) $response['content_type']);
        if ($format === '') return '';
        $uploads = wp_upload_dir(null, false, false);
        if (!empty($uploads['error']) || empty($uploads['basedir']) || empty($uploads['baseurl'])) return '';
        $directory = trailingslashit($uploads['basedir']) . 'bbpa/favicons';
        $name = hash('sha256', $host) . '.' . $format;
        $path = trailingslashit($directory) . $name;
        $service = new BBPA_Filesystem_Service();
        if (!$service->ensure_directory($directory) || !$service->put_contents($path, (string) $response['body'])) return '';
        return ['path' => $path, 'url' => trailingslashit($uploads['baseurl']) . 'bbpa/favicons/' . $name];
    }

    private function validate_image(string $body, string $content_type): string {
        if ($body === '' || strlen($body) > self::MAX_BYTES || preg_match('/<(?:svg|html|script|\?xml)/i', substr($body, 0, 512))) return '';
        if ($content_type !== '' && !preg_match('#^image/(?:x-icon|vnd\.microsoft\.icon|png|jpeg|webp)#', $content_type)) return '';
        $signatures = ['png' => "\x89PNG\r\n\x1a\n", 'jpg' => "\xff\xd8\xff", 'webp' => 'RIFF', 'ico' => "\x00\x00\x01\x00"];
        foreach ($signatures as $format => $signature) if (str_starts_with($body, $signature) && ($format !== 'webp' || substr($body, 8, 4) === 'WEBP')) return $format;
        return '';
    }

    private function extract_favicon_from_html(string $html, string $base): string {
        if (!class_exists('DOMDocument')) return '';
        $dom = new DOMDocument(); libxml_use_internal_errors(true); $dom->loadHTML($html); libxml_clear_errors();
        foreach ($dom->getElementsByTagName('link') as $link) {
            if (strpos(strtolower((string) $link->getAttribute('rel')), 'icon') === false) continue;
            $href = trim((string) $link->getAttribute('href')); $url = $this->resolve_absolute_url($href, $base);
            if ($url !== '') return $url;
        }
        return '';
    }
    private function resolve_absolute_url(string $url, string $base): string {
        if ($url === '') return ''; $parsed = wp_parse_url($url);
        if (is_array($parsed) && isset($parsed['scheme'])) return $this->is_allowed_scheme((string)$parsed['scheme']) ? $url : '';
        $p = wp_parse_url($base); if (!is_array($p) || empty($p['host'])) return '';
        if (str_starts_with($url, '//')) return 'https:' . $url;
        return 'https://' . $p['host'] . (str_starts_with($url, '/') ? $url : '/' . $url);
    }
    private function normalize_domain(string $domain): string { $value = strtolower(trim(preg_replace('#^https?://#i', '', $domain))); $value = explode('/', $value)[0] ?? ''; $value = explode(':', $value)[0] ?? ''; return preg_match('/^[a-z0-9.-]+$/', $value) ? rtrim($value, '.') : ''; }
    private function is_safe_public_host(string $host): bool { if ($host === 'localhost' || str_ends_with($host, '.local')) return false; if (filter_var($host, FILTER_VALIDATE_IP)) return $this->is_public_ip($host); $ip = gethostbyname($host); return $ip !== $host && $this->is_public_ip($ip); }
    private function is_public_ip(string $ip): bool { return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false; }
    private function is_allowed_scheme(string $scheme): bool { return in_array(strtolower($scheme), ['http', 'https'], true); }
    private function get_user_agent(): string { return 'BimBeau Privacy Analytics Favicon Fetcher'; }
}
