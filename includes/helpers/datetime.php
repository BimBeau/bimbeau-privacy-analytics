<?php

if (!defined('ABSPATH')) {
    exit;
}

/*
 * Site timezone date helpers.
 *
 * Daily buckets (`date_bucket`) and report ranges are calendar days in the site timezone (`wp_timezone()`),
 * while stored timestamps (`timestamp_bucket`, `first_view_at`, `last_view_at`) are real Unix epochs.
 * Never pass `current_time('timestamp')` (epoch shifted by the site offset) to `wp_date()`: the offset would be
 * applied twice. Use `time()` or these helpers instead.
 */

if (!function_exists('bbpa_get_site_date')) {
    /**
     * Current calendar day in the site timezone, shifted by whole calendar days (DST safe).
     *
     * @param int $day_offset Number of days to add (negative for past days).
     * @return string Date in `Y-m-d` format.
     */
    function bbpa_get_site_date(int $day_offset = 0): string
    {
        $now = new DateTimeImmutable('now', wp_timezone());
        if ($day_offset !== 0) {
            $now = $now->modify(sprintf('%+d days', $day_offset));
        }

        return $now->format('Y-m-d');
    }
}

if (!function_exists('bbpa_get_site_day_bounds')) {
    /**
     * Unix timestamps of the first and last second of an inclusive site-timezone day range.
     *
     * @param string $start_date Start day (`Y-m-d`), interpreted in the site timezone.
     * @param string $end_date   End day (`Y-m-d`), interpreted in the site timezone.
     * @return int[] `[start_timestamp, end_timestamp]`.
     */
    function bbpa_get_site_day_bounds(string $start_date, string $end_date): array
    {
        $timezone = wp_timezone();
        $start = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $start_date . ' 00:00:00', $timezone);
        $end = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $end_date . ' 23:59:59', $timezone);

        return [
            $start instanceof DateTimeImmutable ? (int) $start->format('U') : (int) strtotime($start_date . ' 00:00:00'),
            $end instanceof DateTimeImmutable ? (int) $end->format('U') : (int) strtotime($end_date . ' 23:59:59'),
        ];
    }
}
