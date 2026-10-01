<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Central logging helper for BimBeau Privacy Analytics.
 */
class BBPA_Logger
{
    private const DEFAULT_CHANNEL = 'General';

    /**
     * @var string[]
     */
    private const ALLOWED_CHANNELS = [
        'General',
        'Admin',
        'Event',
        'Geo',
        'Ingest',
        'Storage',
        'Enrich',
        'Realtime',
        'API',
        'Cron',
    ];

    /**
     * @var string
     */
    private $channel;

    private function __construct(string $channel)
    {
        $this->channel = self::normalize_channel($channel);
    }

    public static function channel(string $channel): self
    {
        return new self($channel);
    }

    public function log(string $level, string $message, array $context = []): void
    {
        if (!self::should_log($level)) {
            return;
        }

        $line = sprintf('[BPA][%s][%s] %s', $this->channel, self::normalize_level($level), sanitize_text_field($message));

        $safe_context = self::sanitize_context($context);
        if (!empty($safe_context)) {
            $line .= ' ' . wp_json_encode($safe_context);
        }

        self::write_to_error_log($line, self::normalize_level($level));
    }

    public function debug(string $message, array $context = []): void
    {
        $this->log('debug', $message, $context);
    }

    /**
     * Log an informational diagnostic. Like `debug`, it is written only when debug mode is enabled.
     */
    public function info(string $message, array $context = []): void
    {
        $this->log('info', $message, $context);
    }

    public function warning(string $message, array $context = []): void
    {
        $this->log('warning', $message, $context);
    }

    public function error(string $message, array $context = []): void
    {
        $this->log('error', $message, $context);
    }


    /**
     * Decide whether a level can be written.
     *
     * `debug` and `info` diagnostics require the plugin debug mode and a log sink. `warning` and `error` entries are
     * real problems: they are written whenever a log sink is configured (`WP_DEBUG_LOG` or `BBPA_DEBUG_LOG_SINK`),
     * even when the plugin debug mode is off.
     */
    private static function should_log(string $level): bool
    {
        $normalized_level = self::normalize_level($level);

        if ($normalized_level === 'debug' || $normalized_level === 'info') {
            return self::is_debug_logging_enabled();
        }

        return self::is_wp_debug_log_enabled() || self::has_explicit_safe_sink();
    }

    private static function is_debug_logging_enabled(): bool
    {
        if (!function_exists('bbpa_get_settings')) {
            return false;
        }

        $settings = bbpa_get_settings();
        if (empty($settings['debug_enabled'])) {
            return false;
        }

        return self::is_wp_debug_log_enabled() || self::has_explicit_safe_sink();
    }

    private static function is_wp_debug_log_enabled(): bool
    {
        return defined('WP_DEBUG')
            && WP_DEBUG
            && defined('WP_DEBUG_LOG')
            && WP_DEBUG_LOG;
    }

    private static function has_explicit_safe_sink(): bool
    {
        return self::get_explicit_safe_sink() !== null;
    }

    private static function get_explicit_safe_sink(): ?string
    {
        if (!defined('BBPA_DEBUG_LOG_SINK')) {
            return null;
        }

        $sink = BBPA_DEBUG_LOG_SINK;
        if (!is_string($sink)) {
            return null;
        }

        $sink = trim($sink);

        return $sink !== '' ? $sink : null;
    }

    private static function write_to_error_log(string $line, string $level = 'debug'): void
    {
        if (!self::should_log($level)) {
            return;
        }

        if (self::is_wp_debug_log_enabled()) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Guarded diagnostic logging.
            error_log($line);
            return;
        }

        $sink = self::get_explicit_safe_sink();
        if ($sink !== null) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Guarded plugin-level sink for diagnostics.
            error_log($line . PHP_EOL, 3, $sink);
        }
    }


    private static function normalize_level(string $level): string
    {
        $normalized = strtolower(trim($level));

        if (!in_array($normalized, ['debug', 'info', 'warning', 'error'], true)) {
            return 'debug';
        }

        return $normalized;
    }

    private static function sanitize_context(array $context): array
    {
        $sanitized = [];
        // Long patterns match anywhere in the key; short ones match a whole `_`-separated segment only, so keys such
        // as `description`, `skip_reason`, `zip_path` or `author_id` stay readable.
        $sensitive_substrings = ['password', 'passwd', 'passphrase', 'ipaddress', 'token', 'secret', 'authorization', 'cookie', 'nonce', 'email', 'user_agent', 'session'];
        $sensitive_segments = ['pass', 'pwd', 'auth', 'ip', 'ips', 'ua'];

        foreach ($context as $key => $value) {
            $safe_key = sanitize_key((string) $key);
            if ($safe_key === '') {
                continue;
            }

            foreach ($sensitive_substrings as $sensitive_key) {
                if (str_contains($safe_key, $sensitive_key)) {
                    $sanitized[$safe_key] = '[redacted]';
                    continue 2;
                }
            }

            $key_segments = preg_split('/[_\-]+/', $safe_key);
            if (is_array($key_segments) && array_intersect($key_segments, $sensitive_segments) !== []) {
                $sanitized[$safe_key] = '[redacted]';
                continue;
            }

            if (is_scalar($value) || $value === null) {
                $sanitized[$safe_key] = sanitize_text_field((string) $value);
                continue;
            }

            if (is_array($value)) {
                $sanitized[$safe_key] = self::sanitize_context($value);
                continue;
            }

            $sanitized[$safe_key] = '[complex]';
        }

        return $sanitized;
    }

    public static function normalize_channel(string $channel): string
    {
        $normalized = trim($channel);

        if (!in_array($normalized, self::ALLOWED_CHANNELS, true)) {
            return self::DEFAULT_CHANNEL;
        }

        return $normalized;
    }

    /**
     * @return string[]
     */
    public static function allowed_channels(): array
    {
        return self::ALLOWED_CHANNELS;
    }
}


if (!function_exists('bbpa_safe_log')) {
    function bbpa_safe_log(string $channel, string $level, string $message, array $context = []): void
    {
        BBPA_Logger::channel($channel)->log($level, $message, $context);
    }
}
