<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * MaxMind API service for geolocation lookups.
 */


class BBPA_MaxMind_Service {
    private const GEOLITE_BASE_URL = 'https://geolite.info/geoip/v2.1';

    /**
     * Look up geolocation data using the MaxMind API.
     */
    public function lookup(string $ip, string $account_id, string $license_key): array {
        $url = sprintf('%s/city/%s', self::GEOLITE_BASE_URL, rawurlencode($ip));
        $auth = base64_encode($account_id . ':' . $license_key);
        $version = defined('BBPA_VERSION') ? BBPA_VERSION : 'unknown';
        $user_agent = sprintf('BimBeau Privacy Analytics/%s; %s', $version, home_url('/'));
        $response = wp_remote_get(
            $url,
            [
                'headers' => [
                    'Authorization' => 'Basic ' . $auth,
                    'Accept' => 'application/json',
                    'User-Agent' => $user_agent,
                ],
                'timeout' => 5,
            ]
        );

        if (is_wp_error($response)) {
            return [
                'error' => $response->get_error_message(),
            ];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        if ($code !== 200) {
            $detail = '';
            $error_code = '';
            $error_message = '';
            $decoded = json_decode($body, true);
            if (is_array($decoded)) {
                $error_message = (string) ($decoded['error'] ?? '');
                $error_code = (string) ($decoded['code'] ?? '');
                if ($error_message || $error_code) {
                    $detail = trim($error_message . ($error_code ? ' (' . $error_code . ')' : ''));
                }
            }

            $details = [
                'status' => $code,
            ];
            $request_id = wp_remote_retrieve_header($response, 'x-request-id');
            if ($request_id) {
                $details['request_id'] = sanitize_text_field((string) $request_id);
            }
            if ($error_code) {
                $details['error_code'] = sanitize_text_field($error_code);
            }
            if ($error_message) {
                $details['error_message'] = sanitize_text_field($error_message);
            }
            if (empty($error_message) && $body) {
                $details['response_excerpt'] = mb_substr(trim(wp_strip_all_tags($body)), 0, 200);
            }

            $this->log_maxmind_error($url, $code, $error_code);

            return [
                'error' => $detail
                    ? sprintf(
                        /* translators: 1: MaxMind API response code, 2: MaxMind API error details. */
                        __('MaxMind API error (%1$s): %2$s.', 'bimbeau-privacy-analytics'),
                        $code,
                        $detail
                    )
                    : sprintf(
                        /* translators: %s: MaxMind API response code. */
                        __('MaxMind API error (%s).', 'bimbeau-privacy-analytics'),
                        $code
                    ),
                'details' => $details,
                'source' => 'maxmind-api',
            ];
        }

        $payload = json_decode($body, true);
        if (!is_array($payload)) {
            return [
                'error' => __('Invalid MaxMind API response.', 'bimbeau-privacy-analytics'),
            ];
        }

        return [
            'country' => bbpa_pick_maxmind_name($payload['country']['names'] ?? []),
            'country_code' => sanitize_text_field((string) ($payload['country']['iso_code'] ?? '')),
            'source' => 'maxmind-api',
        ];
    }

    /**
     * Log MaxMind API errors when debug mode is enabled.
     */
    private function log_maxmind_error(string $url, int $status, string $error_code): void {
        if (
            function_exists('bbpa_is_debug_mode_enabled')
            && !bbpa_is_debug_mode_enabled()
        ) {
            return;
        }

        if (!function_exists('bbpa_is_debug_mode_enabled')) {
            $settings = function_exists('bbpa_get_settings') ? bbpa_get_settings() : [];
            if (empty($settings['debug_enabled'])) {
                return;
            }
        }

        $message = sprintf(
            '[BPA][Geo] MaxMind API request failed. url=%s status=%d error_code=%s',
            esc_url_raw($url),
            $status,
            $error_code !== '' ? $error_code : 'unknown'
        );

        BBPA_Logger::channel('Geo')->info($message);
    }
}
