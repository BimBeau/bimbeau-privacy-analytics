import { getAdminConfig } from "./runtimeConfig";

export const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isDatePart = (part) =>
  part?.type === "day" || part?.type === "month" || part?.type === "year";

const normalizeLocale = (value) => {
  const locale = String(value || "").trim().replace(/_/g, "-");
  return locale || undefined;
};

export const getAdminLocale = () => {
  const documentLocale =
    typeof document !== "undefined"
      ? normalizeLocale(document.documentElement?.lang)
      : undefined;

  if (documentLocale) {
    return documentLocale;
  }

  const adminConfig = getAdminConfig();
  const configuredLocale = normalizeLocale(
    adminConfig?.settings?.locale || adminConfig?.locale,
  );

  if (configuredLocale) {
    return configuredLocale;
  }

  return typeof navigator !== "undefined"
    ? normalizeLocale(navigator.language)
    : undefined;
};

export const formatDateStringForLocale = (
  value,
  { shortYear = false } = {},
) => {
  const date = parseDateString(value);

  if (!date) {
    return value || "";
  }

  const formatter = new Intl.DateTimeFormat(getAdminLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: shortYear ? "2-digit" : "numeric",
  });

  const dateParts = formatter.formatToParts(date).filter(isDatePart);
  return dateParts.map((part) => part.value).join("/");
};

export const parseDateString = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

export const isValidDateString = (value) => Boolean(parseDateString(value));

export const MAX_CUSTOM_RANGE_DAYS = 730;

export const isRangeWithinMaxDays = (start, end, maxDays = MAX_CUSTOM_RANGE_DAYS) => {
  if (!isValidDateString(start) || !isValidDateString(end)) {
    return false;
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const dayInMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((endDate - startDate) / dayInMs) + 1;

  return totalDays >= 1 && totalDays <= maxDays;
};

const MIN_REASONABLE_UNIX_SECONDS = 946684800; // 2000-01-01 UTC
const MAX_REASONABLE_UNIX_SECONDS = 4102444800; // 2100-01-01 UTC


export const normalizeUnixTimestampSeconds = (rawValue) => {
  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  const normalizedValue = Math.trunc(numericValue);
  const candidateSeconds = [
    normalizedValue,
    Math.trunc(normalizedValue / 1000),
    Math.trunc(normalizedValue / 1000000),
    normalizedValue >= 1000000 ? Math.trunc(normalizedValue * 1000) : 0,
  ];

  for (const candidate of candidateSeconds) {
    if (candidate < MIN_REASONABLE_UNIX_SECONDS || candidate > MAX_REASONABLE_UNIX_SECONDS) {
      continue;
    }

    return candidate;
  }

  return null;
};
const parseReasonableUnixDate = (rawValue) => {
  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  const normalizedSeconds = normalizeUnixTimestampSeconds(numericValue);
  if (normalizedSeconds === null) {
    return null;
  }

  const candidateDate = new Date(normalizedSeconds * 1000);
  return Number.isNaN(candidateDate.getTime()) ? null : candidateDate;
};

export const parseWpDateTime = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseReasonableUnixDate(value);
  }

  const normalizedValue = String(value).trim();

  if (/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
    return parseReasonableUnixDate(normalizedValue);
  }

  const dateTimeMatch = normalizedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (dateTimeMatch) {
    return new Date(
      Date.UTC(
        Number(dateTimeMatch[1]),
        Number(dateTimeMatch[2]) - 1,
        Number(dateTimeMatch[3]),
        Number(dateTimeMatch[4] || 0),
        Number(dateTimeMatch[5] || 0),
        Number(dateTimeMatch[6] || 0),
      ),
    );
  }

  const fallback = new Date(normalizedValue);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const formatWpDateTime = (value, fallbackLabel = "") => {
  const parsedDate = parseWpDateTime(value);
  if (!parsedDate) {
    return fallbackLabel || String(value || "");
  }

  const adminSettings = getAdminConfig()?.settings;
  const wpDateFormat = String( adminSettings?.dateFormat || "" ).trim();
  const wpTimeFormat = String( adminSettings?.timeFormat || "" ).trim();

  const formatPattern = [wpDateFormat, wpTimeFormat].filter(Boolean).join(" ");
  if (window?.wp?.date?.dateI18n && formatPattern) {
    return window.wp.date.dateI18n(formatPattern, parsedDate);
  }

  return parsedDate.toLocaleString(getAdminLocale());
};

export const getWpDateTimeTimestamp = (value) => {
  const parsedDate = parseWpDateTime(value);
  if (!parsedDate) {
    return null;
  }

  const timestamp = parsedDate.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getSiteTodayParts = (now) => {
  const settings = getAdminConfig()?.settings;
  const timeZone = String(settings?.timezoneString || "").trim();

  if (timeZone && typeof Intl !== "undefined" && Intl.DateTimeFormat) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const read = (type) =>
        Number(parts.find((part) => part.type === type)?.value);
      const year = read("year");
      const month = read("month");
      const day = read("day");
      if (year > 0 && month > 0 && day > 0) {
        return { year, month, day };
      }
    } catch (error) {
      // Unsupported time zone identifier (e.g. an offset string): fall back to gmtOffset.
    }
  }

  const gmtOffset = Number(settings?.gmtOffset);
  if (
    settings?.gmtOffset !== undefined &&
    settings?.gmtOffset !== null &&
    settings?.gmtOffset !== "" &&
    Number.isFinite(gmtOffset)
  ) {
    const shifted = new Date(now.getTime() + gmtOffset * 60 * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
};

/**
 * Current calendar day of the WordPress site (site timezone, as the server buckets days),
 * returned as a local-midnight Date suitable for calendar arithmetic and formatDate().
 */
export const getSiteToday = (now = new Date()) => {
  const { year, month, day } = getSiteTodayParts(now);
  return new Date(year, month - 1, day);
};

export const getRangeFromPreset = (preset, now = new Date()) => {
  const end = getSiteToday(now);
  const start = new Date(end);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      start.setDate(start.getDate() + 1);
      break;
    case "12m":
      start.setMonth(start.getMonth() - 12);
      start.setDate(start.getDate() + 1);
      break;
    case "24m":
      start.setMonth(start.getMonth() - 24);
      start.setDate(start.getDate() + 1);
      break;
    case "this-month":
      start.setDate(1);
      break;
    case "last-month":
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setDate(0);
      break;
    case "this-year":
      start.setMonth(0, 1);
      break;
    case "last-year":
      start.setFullYear(start.getFullYear() - 1, 0, 1);
      end.setFullYear(end.getFullYear() - 1, 11, 31);
      break;
    default:
      start.setDate(start.getDate() - 29);
  }

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

export const getRangeFromSelection = (selection) => {
  if (selection?.type === "custom") {
    const { start, end } = selection;
    if (isRangeWithinMaxDays(start, end)) {
      return { start, end };
    }
  }

  if (selection?.type === "preset" && selection?.preset) {
    return getRangeFromPreset(selection.preset);
  }

  return getRangeFromPreset("30d");
};

export const getPreviousRange = (range) => {
  if (!range?.start || !range?.end) {
    return null;
  }

  const startDate = new Date(`${range.start}T00:00:00`);
  const endDate = new Date(`${range.end}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const dayInMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(
    1,
    Math.round((endDate - startDate) / dayInMs) + 1,
  );
  // Calendar-day arithmetic (setDate) so DST transitions never shift the comparison range.
  const previousEnd = new Date(startDate);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (totalDays - 1));

  return {
    start: formatDate(previousStart),
    end: formatDate(previousEnd),
  };
};

/**
 * Range moved one period back (direction -1) or forward (1), for the previous / next arrows of the
 * period filter. Whole calendar months and years move by one month or year (the current month or
 * year counts as whole); any other range moves by its own length. The end never goes past the
 * site's today. Returns null when the moved range would start after today.
 *
 * @param {{start: string, end: string}} range     Range of Y-m-d dates.
 * @param {number}                       direction -1 for the previous period, 1 for the next one.
 * @param {Date}                         [now]     Current time, for tests.
 * @return {{start: string, end: string}|null} Moved range.
 */
export const getShiftedRange = (range, direction, now = new Date()) => {
  const start = parseDateString(range?.start);
  const end = parseDateString(range?.end);

  if (!start || !end || (direction !== 1 && direction !== -1)) {
    return null;
  }

  const today = getSiteToday(now);
  const dayAfterEnd = new Date(end);
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
  const endsMonth = dayAfterEnd.getDate() === 1 || end.getTime() === today.getTime();
  const isWholeYear =
    start.getMonth() === 0 &&
    start.getDate() === 1 &&
    start.getFullYear() === end.getFullYear() &&
    ((end.getMonth() === 11 && end.getDate() === 31) || end.getTime() === today.getTime());
  const isWholeMonth =
    start.getDate() === 1 &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    endsMonth;
  let nextStart;
  let nextEnd;

  if (isWholeYear && !isWholeMonth) {
    nextStart = new Date(start.getFullYear() + direction, 0, 1);
    nextEnd = new Date(start.getFullYear() + direction, 11, 31);
  } else if (isWholeMonth) {
    nextStart = new Date(start.getFullYear(), start.getMonth() + direction, 1);
    nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 0);
  } else {
    const dayInMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.round((end - start) / dayInMs) + 1);
    nextStart = new Date(start);
    nextStart.setDate(nextStart.getDate() + direction * totalDays);
    nextEnd = new Date(end);
    nextEnd.setDate(nextEnd.getDate() + direction * totalDays);
  }

  if (nextStart > today) {
    return null;
  }

  if (nextEnd > today) {
    nextEnd = today;
  }

  return {
    start: formatDate(nextStart),
    end: formatDate(nextEnd),
  };
};

/**
 * Preset whose range is exactly the given range today, or null.
 *
 * @param {{start: string, end: string}} range   Range of Y-m-d dates.
 * @param {string[]}                     presets Preset values to try, in order.
 * @param {Date}                         [now]   Current time, for tests.
 * @return {string|null} Matching preset.
 */
export const getPresetForRange = (range, presets, now = new Date()) =>
  (presets || []).find((preset) => {
    const presetRange = getRangeFromPreset(preset, now);
    return presetRange.start === range?.start && presetRange.end === range?.end;
  }) || null;

export const isSingleDayRange = (range) => {
  if (!range?.start || !range?.end) {
    return false;
  }

  return range.start === range.end && isValidDateString(range.start);
};

export const toHourlyRange = (range) => {
  if (!isSingleDayRange(range)) {
    return null;
  }

  return {
    start: `${range.start} 00:00:00`,
    end: `${range.end} 23:00:00`,
  };
};
