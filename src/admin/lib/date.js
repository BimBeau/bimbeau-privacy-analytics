export const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isDatePart = (part) =>
  part?.type === "day" || part?.type === "month" || part?.type === "year";

export const formatDateStringForLocale = (
  value,
  { shortYear = false } = {},
) => {
  const date = parseDateString(value);

  if (!date) {
    return value || "";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
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

export const formatLogTimestamp = (timestamp) => {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
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

  const wpDateFormat = String( window?.BBPAAdmin?.settings?.dateFormat || "" ).trim();
  const wpTimeFormat = String( window?.BBPAAdmin?.settings?.timeFormat || "" ).trim();

  const formatPattern = [wpDateFormat, wpTimeFormat].filter(Boolean).join(" ");
  if (window?.wp?.date?.dateI18n && formatPattern) {
    return window.wp.date.dateI18n(formatPattern, parsedDate);
  }

  return parsedDate.toLocaleString();
};

export const getWpDateTimeTimestamp = (value) => {
  const parsedDate = parseWpDateTime(value);
  if (!parsedDate) {
    return null;
  }

  const timestamp = parsedDate.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const getRangeFromPreset = (preset) => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  const previousEnd = new Date(startDate.getTime() - dayInMs);
  const previousStart = new Date(
    previousEnd.getTime() - (totalDays - 1) * dayInMs,
  );

  return {
    start: formatDate(previousStart),
    end: formatDate(previousEnd),
  };
};

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
