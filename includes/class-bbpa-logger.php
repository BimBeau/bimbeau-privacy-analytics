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

        self::write_to_error_log($line);
    }

    public function debug(string $message, array $context = []): void
    {
        $this->log('debug', $message, $context);
    }

    public function info(string $message, array $context = []): void
    {
        $this->log('debug', $message, $context);
    }

    public function warning(string $message, array $context = []): void
    {
        $this->log('warning', $message, $context);
    }

    public function error(string $message, array $context = []): void
    {
        $this->log('error', $message, $context);
    }


    private static function should_log(string $level): bool
    {
        $normalized_level = self::normalize_level($level);

        if ($normalized_level === 'debug') {
            return self::is_debug_logging_enabled();
        }

        return true;
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

    private static function write_to_error_log(string $line): void
    {
        if (!self::is_debug_logging_enabled()) {
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

        if (!in_array($normalized, ['debug', 'warning', 'error'], true)) {
            return 'debug';
        }

        return $normalized;
    }

    private static function sanitize_context(array $context): array
    {
        $sanitized = [];
        $sensitive_keys = ['password', 'passwd', 'pass', 'token', 'secret', 'authorization', 'auth', 'cookie', 'nonce', 'email', 'ip', 'user_agent', 'session'];

        foreach ($context as $key => $value) {
            $safe_key = sanitize_key((string) $key);
            if ($safe_key === '') {
                continue;
            }

            foreach ($sensitive_keys as $sensitive_key) {
                if (str_contains($safe_key, $sensitive_key)) {
                    $sanitized[$safe_key] = '[redacted]';
                    continue 2;
                }
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
