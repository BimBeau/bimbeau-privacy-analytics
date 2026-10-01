<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Downloads explicitly enabled referrer favicons into local uploads storage.
 *
 * Network access is opt-in (setting `referrer_favicons_enabled`) and bounded:
 * every request is validated against public addresses only (SSRF guard), the
 * validated address is pinned for the connection when cURL is used, redirects,
 * response sizes, candidates, requests and time are capped per host, and
 * failures are remembered in a negative cache. Report endpoints only read the
 * durable local files and never trigger network access.
 */
class BBPA_Favicon_Resolver {
    private const CACHE_VERSION = 'v10';
    private const CACHE_KEY_PREFIX = 'bbpa_favicon_' . self::CACHE_VERSION . '_';
    private const NEGATIVE_KEY_PREFIX = 'bbpa_favicon_negative_' . self::CACHE_VERSION . '_';
    private const MAX_BYTES = 262144;
    private const MAX_REDIRECTS = 5;
    private const REQUEST_TIMEOUT = 3;
    private const MAX_DECLARED_ICONS = 8;
    private const MAX_MANIFESTS = 2;
    private const MAX_MANIFEST_ICONS = 8;
    private const MAX_REQUESTS_PER_HOST = 32;
    private const HOST_TIME_BUDGET = 8.0;
    private const TEMPORARY_NEGATIVE_TTL = 300;
    private const NEGATIVE_TTL = 3600;
    private const LOCAL_EXTENSIONS = ['ico', 'png', 'jpg', 'webp', 'gif', 'svg'];

    /** Reason of the last failure, used for the negative cache and debug logs. */
    private string $last_failure = '';

    /** Whether the last failure may disappear soon (network or server error). */
    private bool $last_failure_temporary = false;

    /** Memoized `referrer_favicons_enabled` setting for this instance. */
    private ?bool $enabled = null;

    /** Memoized uploads base directory and URL, or an empty array when unavailable. */
    private ?array $uploads = null;

    /** Memoized set of file names found in uploads/bbpa/favicons. */
    private ?array $local_files = null;

    /** Memoized write capability of the local favicon storage. */
    private ?bool $can_store = null;

    /** Validated public addresses per host, reused to pin connections. */
    private array $resolved_addresses = [];

    /** Absolute deadline (microtime) of the whole resolver instance, 0 when unbounded. */
    private float $deadline = 0.0;

    /** Absolute deadline (microtime) of the host being resolved, 0 when idle. */
    private float $host_deadline = 0.0;

    /** Number of HTTP requests (redirect hops included) made for the host being resolved. */
    private int $host_requests = 0;

    /** Invalidate every negative entry without an unbounded transient-table scan. */
    public static function invalidate_negative_cache(): void {
        update_option('bbpa_favicon_negative_cache_generation', self::negative_generation() + 1, false);
    }

    /** Return the current negative-cache generation. */
    private static function negative_generation(): int {
        return max(1, (int) get_option('bbpa_favicon_negative_cache_generation', 1));
    }

    /** Return the negative-cache transient key of a host. */
    private function negative_key(string $host): string {
        return self::NEGATIVE_KEY_PREFIX . self::negative_generation() . '_' . md5($host);
    }

    /**
     * Limit the total time this resolver instance may spend on network work.
     *
     * Hosts that are not resolved before the deadline keep their previous state
     * and can be retried by a later request.
     *
     * @param float $seconds Budget in seconds; 0 or less removes the limit.
     */
    public function set_time_budget(float $seconds): void {
        $this->deadline = $seconds > 0 ? microtime(true) + $seconds : 0.0;
    }

    /** Return whether the budget given to set_time_budget() is spent. */
    public function is_time_budget_exhausted(): bool {
        return $this->deadline > 0 && microtime(true) >= $this->deadline;
    }

    /**
     * Resolve a favicon and return its local URL, or an empty string.
     *
     * @param string $domain Observed referrer domain or URL.
     */
    public function resolve_favicon_url_for_domain(string $domain): string {
        $result = $this->resolve_favicon_for_domain($domain);
        return (string) ($result['url'] ?? '');
    }

    /**
     * Return an existing deterministic uploads favicon without DNS or HTTP access.
     *
     * The file is the durable positive cache. The favicons directory is listed
     * once per resolver instance, so a report page with many referrers costs one
     * directory read instead of several filesystem checks per row.
     *
     * @param string $domain Observed referrer domain or URL.
     * @return array{path?:string,url?:string,cache_version?:string}
     */
    public function get_cached_favicon_for_domain(string $domain): array {
        if (!$this->is_enabled()) {
            return [];
        }

        $host = $this->normalize_observed_host($domain);
        if ($host === '') {
            return [];
        }

        $uploads = $this->get_uploads();
        if ($uploads === []) {
            return [];
        }

        $local_files = $this->get_local_favicon_files();
        $directory = trailingslashit($uploads['basedir']) . 'bbpa/favicons';
        $basename = hash('sha256', $host);
        foreach (self::LOCAL_EXTENSIONS as $extension) {
            $name = $basename . '.' . $extension;
            if (!isset($local_files[$name])) {
                continue;
            }

            $entry = [
                'path' => trailingslashit($directory) . $name,
                'url' => trailingslashit($uploads['baseurl']) . 'bbpa/favicons/' . $name,
                'cache_version' => self::CACHE_VERSION,
            ];
            if ($this->is_valid_local_file($entry)) {
                return $entry;
            }
        }

        return [];
    }

    /**
     * Return a favicon only when its corresponding uploads file exists, downloading it when needed.
     *
     * @param string $domain Observed referrer domain or URL.
     * @return array{path?:string,url?:string,cache_version?:string}
     */
    public function resolve_favicon_for_domain(string $domain): array {
        if (!$this->is_enabled()) {
            return [];
        }

        $host = $this->normalize_observed_host($domain);
        $this->debug('normalized domain', $host);
        if ($host === '') {
            return $this->fail($host, 'unsafe or invalid domain', false);
        }

        $cached = $this->get_cached_favicon_for_domain($host);
        if ($cached) {
            $this->debug('cache', 'durable positive hit');
            return $cached;
        }

        // The negative cache is checked before any DNS or HTTP work.
        if (get_transient($this->negative_key($host))) {
            $this->debug('cache', 'negative hit');
            return [];
        }

        if ($this->is_time_budget_exhausted()) {
            return $this->fail($host, 'time budget exhausted', true);
        }

        if (!$this->can_store_favicons()) {
            // Nothing could be stored: skip the network entirely and retry in an hour.
            $this->remember_failure($host, 'local favicon storage unavailable', false);
            return $this->fail($host, 'local favicon storage unavailable', false);
        }

        if (!$this->is_safe_public_host($host)) {
            $this->remember_failure($host, 'unsafe or invalid domain', true);
            return $this->fail($host, 'unsafe or invalid domain', false);
        }

        $this->host_deadline = microtime(true) + self::HOST_TIME_BUDGET;
        $this->host_requests = 0;
        // Mark the host first so a request interrupted by a PHP or proxy timeout is not retried at once.
        $this->remember_failure($host, 'resolution in progress', true);

        try {
            $favicon = $this->download_favicon_for_host($host);
        } finally {
            $this->host_deadline = 0.0;
        }

        if (!$favicon) {
            $reason = $this->last_failure ?: 'favicon unavailable';
            $this->remember_failure($host, $reason, $this->last_failure_temporary);
            return $this->fail($host, $reason, $this->last_failure_temporary);
        }

        set_transient(self::CACHE_KEY_PREFIX . md5($host), $favicon, DAY_IN_SECONDS);
        delete_transient($this->negative_key($host));
        $this->debug('local path', $favicon['path']);
        $this->debug('local URL', $favicon['url']);

        return $favicon;
    }

    /**
     * Discover and download the first valid favicon of a host.
     *
     * On failure, last_failure holds the reason and last_failure_temporary
     * whether any attempt failed for a reason that may disappear soon.
     */
    private function download_favicon_for_host(string $host): array {
        $original_origin = 'https://' . $host;
        $homepage = $original_origin . '/';
        $origins = [$original_origin];
        $this->debug('homepage URL', $this->redact_url($homepage));
        $html = $this->request($homepage, 'text/html,application/xhtml+xml', true);
        if (!$html && $this->last_failure === 'network request failed') {
            $homepage = 'http://' . $host . '/';
            $origins[] = 'http://' . $host;
            $html = $this->request($homepage, 'text/html,application/xhtml+xml', true);
        }
        if (!$html && !$this->is_host_budget_exhausted()) {
            $alternate = str_starts_with($host, 'www.') ? substr($host, 4) : 'www.' . $host;
            if ($this->is_safe_public_host($alternate)) {
                $homepage = 'https://' . $alternate . '/';
                $origins[] = 'https://' . $alternate;
                $html = $this->request($homepage, 'text/html,application/xhtml+xml', true);
                if (!$html && $this->last_failure === 'network request failed') {
                    $homepage = 'http://' . $alternate . '/';
                    $origins[] = 'http://' . $alternate;
                    $html = $this->request($homepage, 'text/html,application/xhtml+xml', true);
                }
            }
        }

        $base = $html ? (string) $html['url'] : $homepage;
        $discovered = $html
            ? $this->extract_favicons_from_html((string) $html['body'], $base)
            : ['icons' => [], 'manifests' => []];
        $candidates = $discovered['icons'];
        foreach ($discovered['manifests'] as $manifest_url) {
            $manifest = $this->request($manifest_url, 'application/manifest+json,application/json', true);
            if ($manifest) {
                $candidates = array_merge(
                    $candidates,
                    $this->extract_favicons_from_manifest((string) $manifest['body'], (string) $manifest['url'])
                );
            }
        }
        if ($html) {
            $parts = wp_parse_url($base);
            $origins[] = (string) ($parts['scheme'] ?? 'https') . '://' . (string) ($parts['host'] ?? $host) . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }
        foreach (array_unique($origins) as $origin) {
            foreach (['/favicon.ico', '/favicon.png', '/apple-touch-icon.png'] as $path) {
                $candidates[] = $origin . $path;
            }
        }

        $candidates = array_values(array_unique(array_filter($candidates)));
        $this->debug('candidates', implode(', ', array_map([$this, 'redact_url'], $candidates)));
        $any_temporary_failure = false;
        foreach ($candidates as $index => $candidate) {
            if ($this->is_host_budget_exhausted()) {
                $this->set_failure('time budget exhausted', true);
                $any_temporary_failure = true;
                break;
            }

            $this->debug('candidate tried', ($index >= count($candidates) - 3 ? 'fallback ' : 'declared ') . $this->redact_url($candidate));
            $favicon = $this->download_and_store($candidate, $host);
            $any_temporary_failure = $any_temporary_failure || $this->last_failure_temporary;
            if ($favicon) {
                return $favicon;
            }
            $this->debug('candidate rejected', $this->last_failure ?: 'unavailable');
        }

        $this->last_failure_temporary = $any_temporary_failure;

        return [];
    }

    /**
     * Fetch a URL with manual, validated redirects and bounded size.
     *
     * @param string $url                  URL to fetch.
     * @param string $accept               Accept header.
     * @param bool   $allow_truncated_body Keep the first MAX_BYTES bytes of a larger body instead of failing
     *                                     (HTML pages and manifests only; icons must be complete).
     * @return array{body:string,content_type:string,url:string}|null
     */
    private function request(string $url, string $accept, bool $allow_truncated_body = false): ?array {
        $current = $url;
        for ($redirects = 0; $redirects <= self::MAX_REDIRECTS; $redirects++) {
            if ($this->is_host_budget_exhausted()) {
                $this->set_failure('time budget exhausted', true);
                return null;
            }
            if ($this->host_requests >= self::MAX_REQUESTS_PER_HOST) {
                $this->set_failure('request limit exceeded', true);
                return null;
            }
            if (!$this->is_safe_url($current)) {
                $this->set_failure('unsafe request or redirect destination', false);
                return null;
            }

            $this->host_requests++;
            $response = $this->pinned_safe_get($current, $accept);
            if (is_wp_error($response)) {
                $this->set_failure('network request failed', true);
                return null;
            }

            $code = (int) wp_remote_retrieve_response_code($response);
            $this->debug('HTTP response', $this->redact_url($current) . ' [' . $code . ']');
            if ($code >= 300 && $code < 400) {
                $location = trim((string) wp_remote_retrieve_header($response, 'location'));
                $next = $this->resolve_absolute_url($location, $current);
                $this->debug('redirect URL', $this->redact_url($next ?: $location));
                if ($redirects === self::MAX_REDIRECTS) {
                    $this->set_failure('redirect limit exceeded', true);
                    return null;
                }
                if ($next === '' || !$this->is_safe_url($next)) {
                    $this->set_failure('unsafe redirect destination', false);
                    return null;
                }
                $current = $next;
                continue;
            }

            if ($code !== 200) {
                $this->set_failure('unexpected HTTP status ' . $code, $code >= 500 || $code === 408 || $code === 429);
                return null;
            }

            $body = wp_remote_retrieve_body($response);
            if (!is_string($body)) {
                $body = '';
            }
            // One byte more than the limit is requested, so a longer body means the resource is too large
            // (the HTTP API truncates silently at limit_response_size). Icons must be complete; pages and
            // manifests are only scanned for icon declarations, so their first MAX_BYTES bytes are enough.
            if (strlen($body) > self::MAX_BYTES) {
                if (!$allow_truncated_body) {
                    $this->set_failure('response exceeds size limit', false);
                    return null;
                }
                $body = substr($body, 0, self::MAX_BYTES);
            }
            if ($body === '') {
                $this->set_failure('empty response body', false);
                return null;
            }

            return [
                'body' => $body,
                'content_type' => strtolower(trim((string) wp_remote_retrieve_header($response, 'content-type'))),
                'url' => $current,
            ];
        }

        return null;
    }

    /**
     * Send one GET request, pinning the connection to the address validated by the SSRF guard.
     *
     * Without pinning, cURL would resolve the host again and a DNS answer that
     * changed in between (DNS rebinding) could reach an internal address. The
     * pin applies to the cURL transport; WordPress still re-validates the host
     * through `reject_unsafe_urls`.
     *
     * @return array|WP_Error
     */
    private function pinned_safe_get(string $url, string $accept) {
        $pin = $this->build_curl_resolve_entry($url);
        $pin_host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        $pinner = null;
        if ($pin !== '') {
            $pinner = static function ($handle, $parsed_args = [], $request_url = '') use ($pin, $pin_host): void {
                if (!defined('CURLOPT_RESOLVE') || strtolower((string) wp_parse_url((string) $request_url, PHP_URL_HOST)) !== $pin_host) {
                    return;
                }
                // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_setopt -- Pins the SSRF-validated address on the WordPress cURL handle.
                curl_setopt($handle, CURLOPT_RESOLVE, [$pin]);
            };
            add_action('http_api_curl', $pinner, 10, 3);
        }

        $remaining = $this->host_deadline > 0 ? $this->host_deadline - microtime(true) : (float) self::REQUEST_TIMEOUT;
        $timeout = max(1, min(self::REQUEST_TIMEOUT, (int) ceil($remaining)));

        try {
            return wp_safe_remote_get(
                $url,
                [
                    'timeout' => $timeout,
                    'redirection' => 0,
                    'limit_response_size' => self::MAX_BYTES + 1,
                    'reject_unsafe_urls' => true,
                    'user-agent' => $this->get_user_agent(),
                    'headers' => ['Accept' => $accept],
                ]
            );
        } finally {
            if ($pinner !== null) {
                remove_action('http_api_curl', $pinner, 10);
            }
        }
    }

    /**
     * Build a CURLOPT_RESOLVE entry ("host:port:address") for a validated host name.
     */
    private function build_curl_resolve_entry(string $url): string {
        $parts = wp_parse_url($url);
        if (!is_array($parts) || empty($parts['host'])) {
            return '';
        }

        $host = strtolower((string) $parts['host']);
        if (filter_var($host, FILTER_VALIDATE_IP) || empty($this->resolved_addresses[$host])) {
            return '';
        }

        $address = '';
        foreach ($this->resolved_addresses[$host] as $candidate) {
            if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $address = $candidate;
                break;
            }
        }
        if ($address === '') {
            $address = '[' . (string) $this->resolved_addresses[$host][0] . ']';
        }

        $port = isset($parts['port'])
            ? (int) $parts['port']
            : (strtolower((string) ($parts['scheme'] ?? 'https')) === 'http' ? 80 : 443);

        return $host . ':' . $port . ':' . $address;
    }

    /**
     * Download a candidate, validate the image and store it in uploads/bbpa/favicons.
     */
    private function download_and_store(string $url, string $host): array {
        $response = $this->request($url, 'image/x-icon,image/vnd.microsoft.icon,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/octet-stream');
        if (!$response) {
            return [];
        }

        $this->debug('candidate HTTP response', $this->redact_url($response['url']) . ' [200]');
        $this->debug('candidate Content-Type', $response['content_type']);
        $validated = $this->validate_image((string) $response['body'], (string) $response['content_type']);
        $this->debug('validation result', $validated === [] ? 'rejected' : 'accepted ' . $validated['format']);
        if ($validated === []) {
            $this->set_failure('favicon content validation failed', false);
            return [];
        }

        $uploads = $this->get_uploads();
        if ($uploads === []) {
            $this->set_failure('uploads directory unavailable', true);
            return [];
        }

        $directory = trailingslashit($uploads['basedir']) . 'bbpa/favicons';
        $name = hash('sha256', $host) . '.' . $validated['format'];
        $path = trailingslashit($directory) . $name;
        $service = new BBPA_Filesystem_Service();
        if (
            !$service->ensure_directory($directory)
            || !$service->put_contents($path, $validated['body'])
            || !$service->exists($path)
            || !is_readable($path)
        ) {
            // A write failure repeats until the server configuration changes: do not retry it every few minutes.
            $this->set_failure('local favicon write failed', false);
            return [];
        }

        if ($this->local_files !== null) {
            $this->local_files[$name] = true;
        }

        return [
            'path' => $path,
            'url' => trailingslashit($uploads['baseurl']) . 'bbpa/favicons/' . $name,
            'cache_version' => self::CACHE_VERSION,
        ];
    }

    /** Return the detected format together with the exact bytes safe to persist. */
    private function validate_image(string $body, string $content_type): array {
        if ($body === '' || strlen($body) > self::MAX_BYTES || preg_match('/<html\b/i', substr($body, 0, 512))) {
            return [];
        }
        if (preg_match('/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i', $body)) {
            $sanitized = $this->sanitize_svg($body);
            return $sanitized === '' ? [] : ['format' => 'svg', 'body' => $sanitized];
        }

        $signatures = [
            'png' => "\x89PNG\r\n\x1a\n",
            'jpg' => "\xff\xd8\xff",
            'webp' => 'RIFF',
            'ico' => "\x00\x00\x01\x00",
            'gif' => 'GIF87a',
        ];
        foreach ($signatures as $format => $signature) {
            if (str_starts_with($body, $signature) && ($format !== 'webp' || substr($body, 8, 4) === 'WEBP')) {
                return ['format' => $format, 'body' => $body];
            }
        }
        if (str_starts_with($body, 'GIF89a')) {
            return ['format' => 'gif', 'body' => $body];
        }

        return [];
    }

    /** Parse a small, static SVG vocabulary and reject active or externally loaded content. */
    private function sanitize_svg(string $body): string {
        if ($body === '' || !class_exists('DOMDocument') || preg_match('/<!DOCTYPE|<!ENTITY/i', $body)) {
            return '';
        }

        $previous = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        try {
            $loaded = $dom->loadXML($body, LIBXML_NONET | LIBXML_NOBLANKS | LIBXML_NOERROR | LIBXML_NOWARNING);
        } catch (\Throwable $exception) {
            $loaded = false;
        }
        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded || $errors || $dom->doctype || !$dom->documentElement || strtolower($dom->documentElement->localName) !== 'svg') {
            return '';
        }

        $elements = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'title', 'desc', 'style', 'symbol', 'use'];
        $attributes = ['xmlns', 'viewbox', 'width', 'height', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'mask', 'clip-path', 'id', 'class', 'href', 'preserveaspectratio', 'data-name'];
        $style_properties = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'stop-color', 'stop-opacity'];
        foreach ($dom->getElementsByTagName('*') as $node) {
            if (!in_array(strtolower($node->localName), $elements, true) || ($node->namespaceURI && $node->namespaceURI !== 'http://www.w3.org/2000/svg')) {
                return '';
            }
            if (strtolower($node->localName) === 'style') {
                foreach (iterator_to_array($node->attributes) as $attribute) {
                    if (strtolower($attribute->localName) === 'type' && strtolower(trim($attribute->value)) === 'text/css') {
                        $node->removeAttributeNode($attribute);
                    } else {
                        return '';
                    }
                }
                $css = $this->sanitize_svg_stylesheet($node->textContent, $style_properties);
                if ($css === '') {
                    return '';
                }
                $node->nodeValue = $css;
                continue;
            }
            foreach (iterator_to_array($node->attributes) as $attribute) {
                $name = strtolower($attribute->localName);
                $value = trim($attribute->value);
                if ($name === 'style') {
                    if ($value === '' || str_contains($value, '/*') || str_contains($value, '*/') || str_contains($value, '\\')) {
                        return '';
                    }
                    $declarations = explode(';', $value);
                    foreach ($declarations as $index => $declaration) {
                        $declaration = trim($declaration);
                        if ($declaration === '' && $index === count($declarations) - 1) {
                            continue;
                        }
                        if ($declaration === '' || substr_count($declaration, ':') < 1) {
                            return '';
                        }
                        [$property, $property_value] = array_map('trim', explode(':', $declaration, 2));
                        $property = strtolower($property);
                        if ($property_value === '' || !$this->is_safe_svg_value($property_value)) {
                            return '';
                        }
                        if (!in_array($property, $style_properties, true)) {
                            continue;
                        }
                        // Inline CSS takes precedence over presentation attributes, so overwrite them in declaration order.
                        $node->setAttribute($property, $property_value);
                    }
                    $node->removeAttributeNode($attribute);
                    continue;
                }
                if (str_starts_with($name, 'on')) {
                    return '';
                }
                if (!in_array($name, $attributes, true)) {
                    // Passive metadata and unsupported presentation hints are unnecessary after storage.
                    $node->removeAttributeNode($attribute);
                    continue;
                }
                if ($name === 'xmlns') {
                    if ($node !== $dom->documentElement || $value !== 'http://www.w3.org/2000/svg') {
                        return '';
                    }
                    continue;
                }
                if ($name === 'href' && !preg_match('/^#[A-Za-z_][\w:.-]*$/', $value)) {
                    return '';
                }
                if (!$this->is_safe_svg_value($value)) {
                    return '';
                }
            }
        }

        $svg = $dom->saveXML($dom->documentElement);
        return is_string($svg) && strlen($svg) <= self::MAX_BYTES ? $svg : '';
    }

    /** Retain only simple local selectors and allowlisted presentation declarations. */
    private function sanitize_svg_stylesheet(string $css, array $allowed_properties): string {
        if ($css === '' || preg_match('/[\\@]|\/\*|\*\/|<|>/i', $css)) {
            return '';
        }

        $offset = 0;
        $safe_rules = [];
        if (!preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $rules, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            return '';
        }
        foreach ($rules as $rule) {
            if (trim(substr($css, $offset, $rule[0][1] - $offset)) !== '') {
                return '';
            }
            $selector = trim($rule[1][0]);
            $declarations = trim($rule[2][0]);
            if (!preg_match('/^(?:[.#]?[A-Za-z_][\w.-]*)(?:\s*,\s*(?:[.#]?[A-Za-z_][\w.-]*))*$/', $selector)) {
                return '';
            }
            $safe_declarations = [];
            foreach (explode(';', $declarations) as $declaration) {
                $declaration = trim($declaration);
                if ($declaration === '') {
                    continue;
                }
                if (!str_contains($declaration, ':')) {
                    return '';
                }
                [$property, $value] = array_map('trim', explode(':', $declaration, 2));
                $property = strtolower($property);
                if ($value === '' || !$this->is_safe_svg_value($value)) {
                    return '';
                }
                if (!in_array($property, $allowed_properties, true)) {
                    continue;
                }
                $safe_declarations[] = $property . ':' . $value;
            }
            if ($safe_declarations === []) {
                return '';
            }
            $safe_rules[] = $selector . '{' . implode(';', $safe_declarations) . '}';
            $offset = $rule[0][1] + strlen($rule[0][0]);
        }
        if (trim(substr($css, $offset)) !== '') {
            return '';
        }

        return implode('', $safe_rules);
    }

    /** Accept only passive values and local url(#id) paint references. */
    private function is_safe_svg_value(string $value): bool {
        if (
            preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)
            || preg_match('/(?:javascript|vbscript|data)\s*:/i', $value)
            || preg_match('#(?:https?:)?//#i', $value)
            || preg_match('/(?:expression|-moz-binding)\s*\(/i', $value)
        ) {
            return false;
        }

        $url_count = preg_match_all('/url\s*\(([^)]*)\)/i', $value, $matches);
        if ($url_count === false || preg_match_all('/url\s*\(/i', $value) !== $url_count) {
            return false;
        }
        if ($url_count > 0) {
            foreach ($matches[1] as $reference) {
                if (!preg_match('/^["\']?#[A-Za-z_][\w:.-]*["\']?$/', trim($reference))) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Extract declared icon and manifest URLs from an HTML document, capped and by preference.
     *
     * @return array{icons:list<string>,manifests:list<string>}
     */
    private function extract_favicons_from_html(string $html, string $base): array {
        $empty = ['icons' => [], 'manifests' => []];
        // DOMDocument::loadHTML() throws a ValueError for an empty string since PHP 8.0.
        if (!class_exists('DOMDocument') || trim($html) === '') {
            return $empty;
        }

        $previous = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        try {
            $loaded = $dom->loadHTML($html);
        } catch (\Throwable $exception) {
            $loaded = false;
        }
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded) {
            return $empty;
        }

        $base_nodes = $dom->getElementsByTagName('base');
        if ($base_nodes->length > 0) {
            $declared_base = $this->resolve_absolute_url(trim((string) $base_nodes->item(0)->getAttribute('href')), $base);
            if ($declared_base !== '') {
                $base = $declared_base;
            }
        }

        $candidates = [];
        $manifests = [];
        foreach ($dom->getElementsByTagName('link') as $link) {
            $rels = preg_split('/\s+/', strtolower(trim((string) $link->getAttribute('rel')))) ?: [];
            $is_icon = in_array('icon', $rels, true);
            $is_apple = in_array('apple-touch-icon', $rels, true) || in_array('apple-touch-icon-precomposed', $rels, true);
            if (in_array('manifest', $rels, true)) {
                $manifest = $this->resolve_absolute_url(trim((string) $link->getAttribute('href')), $base);
                if ($manifest !== '') {
                    $manifests[] = $manifest;
                }
            }
            if (!$is_icon && !$is_apple) {
                continue;
            }
            $url = $this->resolve_absolute_url(trim((string) $link->getAttribute('href')), $base);
            if ($url === '') {
                continue;
            }
            $extension = strtolower((string) pathinfo((string) (wp_parse_url($url, PHP_URL_PATH) ?: ''), PATHINFO_EXTENSION));
            $sizes = strtolower(trim((string) $link->getAttribute('sizes')));
            $safe_format = in_array($extension, ['ico', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'], true);
            $preferred_size = (bool) preg_match('/(?:^|\s)(?:16x16|32x32|48x48|180x180|192x192)(?:\s|$)/', $sizes);
            $priority = $safe_format ? 0 : ($preferred_size ? 1 : ($is_apple ? 2 : 3));
            $candidates[] = ['url' => $url, 'priority' => $priority];
        }
        usort($candidates, static fn(array $left, array $right): int => $left['priority'] <=> $right['priority']);

        return [
            'icons' => array_slice(array_values(array_unique(array_column($candidates, 'url'))), 0, self::MAX_DECLARED_ICONS),
            'manifests' => array_slice(array_values(array_unique($manifests)), 0, self::MAX_MANIFESTS),
        ];
    }

    /** Extract manifest icons as lower-priority candidates; downloads still use the normal SSRF validation path. */
    private function extract_favicons_from_manifest(string $body, string $base): array {
        $manifest = json_decode($body, true);
        if (!is_array($manifest) || !isset($manifest['icons']) || !is_array($manifest['icons'])) {
            return [];
        }

        $icons = [];
        foreach (array_slice($manifest['icons'], 0, self::MAX_MANIFEST_ICONS) as $icon) {
            if (!is_array($icon) || !isset($icon['src']) || !is_string($icon['src'])) {
                continue;
            }
            $url = $this->resolve_absolute_url(trim($icon['src']), $base);
            if ($url !== '') {
                $icons[] = $url;
            }
        }

        return array_values(array_unique($icons));
    }

    /** Resolve a possibly relative URL against a base URL, keeping only http(s) URLs. */
    private function resolve_absolute_url(string $url, string $base): string {
        if ($url === '') {
            return '';
        }

        $parsed = wp_parse_url($url);
        if (is_array($parsed) && isset($parsed['scheme'])) {
            return $this->is_allowed_scheme((string) $parsed['scheme']) ? $url : '';
        }

        $base_parts = wp_parse_url($base);
        if (!is_array($base_parts) || empty($base_parts['host']) || empty($base_parts['scheme'])) {
            return '';
        }
        if (str_starts_with($url, '//')) {
            return $base_parts['scheme'] . ':' . $url;
        }

        $port = isset($base_parts['port']) ? ':' . $base_parts['port'] : '';
        if (!str_starts_with($url, '/')) {
            $path = (string) ($base_parts['path'] ?? '/');
            $url = trailingslashit(dirname($path)) . $url;
        }

        return $base_parts['scheme'] . '://' . $base_parts['host'] . $port . $url;
    }

    /** Accept only http(s) URLs without credentials whose host resolves to public addresses only. */
    private function is_safe_url(string $url): bool {
        $parts = wp_parse_url($url);

        return is_array($parts)
            && !empty($parts['host'])
            && !empty($parts['scheme'])
            && empty($parts['user'])
            && empty($parts['pass'])
            && $this->is_allowed_scheme((string) $parts['scheme'])
            && $this->is_safe_public_host((string) $parts['host']);
    }

    /**
     * Check a stored favicon: inside uploads/bbpa/favicons, readable, complete, and revalidated for SVG.
     */
    private function is_valid_local_file(array $entry): bool {
        if (!isset($entry['url'], $entry['path'])) {
            return false;
        }

        $uploads = $this->get_uploads();
        $root = $uploads !== [] ? realpath(trailingslashit($uploads['basedir']) . 'bbpa/favicons') : false;
        $path = realpath((string) $entry['path']);
        if ($root === false || $path === false || !str_starts_with($path, trailingslashit($root)) || !is_file($path) || !is_readable($path)) {
            return false;
        }

        if (strtolower((string) pathinfo($path, PATHINFO_EXTENSION)) !== 'svg') {
            // Older versions stored bodies silently truncated at the size limit: never serve them.
            $size = filesize($path);
            return is_int($size) && $size > 0 && $size < self::MAX_BYTES;
        }

        $body = file_get_contents($path);
        $validated = is_string($body) ? $this->validate_image($body, 'image/svg+xml') : [];

        return ($validated['format'] ?? '') === 'svg' && hash_equals($body, $validated['body']);
    }

    /**
     * Normalize an observed referrer value to a lowercase host name, or an empty string.
     *
     * @param string $domain Domain, host or URL as stored in reports.
     */
    public function normalize_observed_host(string $domain): string {
        $value = strtolower(trim((string) preg_replace('#^https?://#i', '', $domain)));
        $value = explode('/', $value)[0] ?? '';
        $parts = wp_parse_url('https://' . $value);
        $value = is_array($parts) ? (string) ($parts['host'] ?? '') : '';

        return preg_match('/^[a-z0-9.-]+$/', $value) ? rtrim($value, '.') : '';
    }

    /** Return whether a host only resolves to public addresses. */
    private function is_safe_public_host(string $host): bool {
        return $this->resolve_public_addresses($host) !== [];
    }

    /**
     * Resolve a host to its addresses, once per resolver instance.
     *
     * Returns an empty list when the host is local, unresolvable, or when any of
     * its addresses is private or reserved.
     *
     * @return list<string>
     */
    private function resolve_public_addresses(string $host): array {
        $host = strtolower($host);
        if (array_key_exists($host, $this->resolved_addresses)) {
            return $this->resolved_addresses[$host];
        }

        $addresses = [];
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local')) {
            $addresses = [];
        } elseif (filter_var($host, FILTER_VALIDATE_IP)) {
            $addresses = $this->is_public_ip($host) ? [$host] : [];
        } else {
            $records = function_exists('dns_get_record') ? dns_get_record($host, DNS_A | DNS_AAAA) : [];
            foreach (is_array($records) ? $records : [] as $record) {
                $ip = $record['ip'] ?? $record['ipv6'] ?? '';
                if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP)) {
                    $addresses[] = $ip;
                }
            }
            if (!$addresses) {
                $ip = gethostbyname($host);
                if ($ip !== $host && filter_var($ip, FILTER_VALIDATE_IP)) {
                    $addresses[] = $ip;
                }
            }
            $addresses = array_values(array_unique($addresses));
            foreach ($addresses as $ip) {
                if (!$this->is_public_ip($ip)) {
                    $addresses = [];
                    break;
                }
            }
        }

        $this->resolved_addresses[$host] = $addresses;

        return $addresses;
    }

    /** Return whether an address is neither private nor reserved. */
    private function is_public_ip(string $ip): bool {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    /** Allow only the http and https schemes. */
    private function is_allowed_scheme(string $scheme): bool {
        return in_array(strtolower($scheme), ['http', 'https'], true);
    }

    /** Return the User-Agent sent with favicon requests. */
    private function get_user_agent(): string {
        return 'BimBeau Privacy Analytics Favicon Fetcher';
    }

    /** Return whether referrer favicons are enabled, read once per instance. */
    private function is_enabled(): bool {
        if ($this->enabled === null) {
            $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
            $this->enabled = !empty($settings['referrer_favicons_enabled']);
        }

        return $this->enabled;
    }

    /**
     * Return the uploads base directory and URL, read once per instance.
     *
     * @return array{basedir?:string,baseurl?:string}
     */
    private function get_uploads(): array {
        if ($this->uploads === null) {
            $uploads = wp_upload_dir(null, false, false);
            $this->uploads = !empty($uploads['error']) || empty($uploads['basedir']) || empty($uploads['baseurl'])
                ? []
                : [
                    'basedir' => (string) $uploads['basedir'],
                    'baseurl' => (string) $uploads['baseurl'],
                ];
        }

        return $this->uploads;
    }

    /**
     * List the stored favicon files once per instance.
     *
     * @return array<string,true>
     */
    private function get_local_favicon_files(): array {
        if ($this->local_files !== null) {
            return $this->local_files;
        }

        $this->local_files = [];
        $uploads = $this->get_uploads();
        $directory = $uploads !== [] ? trailingslashit($uploads['basedir']) . 'bbpa/favicons' : '';
        $entries = $directory !== '' && is_dir($directory) ? scandir($directory) : false;
        foreach (is_array($entries) ? $entries : [] as $entry) {
            if (preg_match('/^[a-f0-9]{64}\.(?:ico|png|jpg|webp|gif|svg)$/', (string) $entry)) {
                $this->local_files[(string) $entry] = true;
            }
        }

        return $this->local_files;
    }

    /** Return whether downloaded favicons can be written to uploads, checked once per instance. */
    private function can_store_favicons(): bool {
        if ($this->can_store === null) {
            $this->can_store = $this->get_uploads() !== [] && (new BBPA_Filesystem_Service())->can_write();
        }

        return $this->can_store;
    }

    /** Return whether the time budget of the host being resolved (or of the instance) is spent. */
    private function is_host_budget_exhausted(): bool {
        return $this->is_time_budget_exhausted()
            || ($this->host_deadline > 0 && microtime(true) >= $this->host_deadline);
    }

    /** Store a negative-cache entry for a host (short when the failure may be temporary). */
    private function remember_failure(string $host, string $reason, bool $temporary): void {
        set_transient(
            $this->negative_key($host),
            ['reason' => $reason, 'temporary' => $temporary],
            $temporary ? self::TEMPORARY_NEGATIVE_TTL : self::NEGATIVE_TTL
        );
    }

    /** Record the reason of the last failure. */
    private function set_failure(string $reason, bool $temporary): void {
        $this->last_failure = $reason;
        $this->last_failure_temporary = $temporary;
    }

    /** Record a failure, log it in debug mode and return an empty result. */
    private function fail(string $host, string $reason, bool $temporary): array {
        $this->set_failure($reason, $temporary);
        $this->debug('failure', ($host ? $host . ': ' : '') . $reason);

        return [];
    }

    /** Keep only the scheme, host, port and path of a URL for debug logs. */
    private function redact_url(string $url): string {
        $parts = wp_parse_url($url);
        if (!is_array($parts) || empty($parts['host'])) {
            return '[invalid URL]';
        }

        return (string) ($parts['scheme'] ?? '') . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '') . (string) ($parts['path'] ?? '/');
    }

    /** Write a diagnostic line when WP_DEBUG or the plugin debug mode is enabled. */
    private function debug(string $field, string $value): void {
        if ((defined('WP_DEBUG') && WP_DEBUG) || (function_exists('bbpa_is_debug_mode_enabled') && bbpa_is_debug_mode_enabled())) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Guarded diagnostic logging, URLs are redacted.
            error_log('[BBPA favicon] ' . $field . ': ' . $value);
        }
    }
}
