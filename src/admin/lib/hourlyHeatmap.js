import { __, sprintf } from "@wordpress/i18n";

export const HOURLY_HEATMAP_HOURS = Array.from(
  { length: 24 },
  (_, hour) => hour,
);

export const formatHourlyHeatmapHour = (hour) =>
  `${String(hour).padStart(2, "0")}:00`;

export const HOURLY_HEATMAP_DAYS = [
  {
    value: 1,
    key: "monday",
    label: __("Monday", "bimbeau-privacy-analytics"),
    shortLabel: __("Mon", "bimbeau-privacy-analytics"),
  },
  {
    value: 2,
    key: "tuesday",
    label: __("Tuesday", "bimbeau-privacy-analytics"),
    shortLabel: __("Tue", "bimbeau-privacy-analytics"),
  },
  {
    value: 3,
    key: "wednesday",
    label: __("Wednesday", "bimbeau-privacy-analytics"),
    shortLabel: __("Wed", "bimbeau-privacy-analytics"),
  },
  {
    value: 4,
    key: "thursday",
    label: __("Thursday", "bimbeau-privacy-analytics"),
    shortLabel: __("Thu", "bimbeau-privacy-analytics"),
  },
  {
    value: 5,
    key: "friday",
    label: __("Friday", "bimbeau-privacy-analytics"),
    shortLabel: __("Fri", "bimbeau-privacy-analytics"),
  },
  {
    value: 6,
    key: "saturday",
    label: __("Saturday", "bimbeau-privacy-analytics"),
    shortLabel: __("Sat", "bimbeau-privacy-analytics"),
  },
  {
    value: 7,
    key: "sunday",
    label: __("Sunday", "bimbeau-privacy-analytics"),
    shortLabel: __("Sun", "bimbeau-privacy-analytics"),
  },
];

export const buildHourlyHeatmapData = (items = []) => {
  const dayLabels = HOURLY_HEATMAP_DAYS.reduce(
    (acc, day) => ({
      ...acc,
      [day.key]: day.label,
    }),
    {},
  );
  const dayShortLabels = HOURLY_HEATMAP_DAYS.reduce(
    (acc, day) => ({
      ...acc,
      [day.key]: day.shortLabel,
    }),
    {},
  );
  const days = HOURLY_HEATMAP_DAYS.map((day) => day.key);
  const valuesByDayHour = new Map();
  let maxValue = 0;

  items.forEach((item) => {
    const dayOfWeek = Number(item?.dayOfWeek);
    const hour = Number(item?.hour);
    const value = Number(item?.value) || 0;
    const day = HOURLY_HEATMAP_DAYS.find(
      (weekday) => weekday.value === dayOfWeek,
    )?.key;

    if (!day || Number.isNaN(hour) || hour < 0 || hour > 23) {
      return;
    }

    valuesByDayHour.set(`${day}|${hour}`, value);
    maxValue = Math.max(maxValue, value);
  });

  const data = HOURLY_HEATMAP_HOURS.map((hour) => ({
    id: formatHourlyHeatmapHour(hour),
    data: days.map((day) => ({
      x: day,
      y: valuesByDayHour.get(`${day}|${hour}`) ?? 0,
    })),
  }));

  return {
    data,
    days,
    dayLabels,
    dayShortLabels,
    maxValue,
  };
};

export const normalizeHourlyItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    dayOfWeek: Number(item?.dayOfWeek ?? item?.day_of_week),
    hour: Number(item?.hour),
    value: Number(item?.value) || 0,
  }));
};

export const getHourlyAvailability = (payload) => {
  const explicitFlag = payload?.hourlyAvailable ?? payload?.hourly_available;

  if (typeof explicitFlag === "boolean") {
    return explicitFlag;
  }

  return normalizeHourlyItems(payload?.items).length > 0;
};

export const getHourlyUnavailableReason = (payload) =>
  payload?.hourlyUnavailableReason || payload?.hourly_unavailable_reason || "";

export const getHourlyHeatmapEmptyLabel = (
  source,
  hourlyUnavailableReason = "",
) => {
  if (
    source === "404s" ||
    hourlyUnavailableReason === "source_not_compatible"
  ) {
    return __(
      "Hourly heatmaps are unavailable for pages not found (404).",
      "bimbeau-privacy-analytics",
    );
  }

  if (hourlyUnavailableReason === "feature_disabled") {
    return __(
      "Hourly heatmaps are disabled by the bbpa_hourly_aggregation_enabled filter.",
      "bimbeau-privacy-analytics",
    );
  }

  if (hourlyUnavailableReason === "table_missing") {
    return __(
      "Hourly heatmaps are unavailable because the hourly aggregation table is missing.",
      "bimbeau-privacy-analytics",
    );
  }

  return __(
    "Hourly heatmaps require hourly page aggregation data for the selected source.",
    "bimbeau-privacy-analytics",
  );
};

export const formatHourlyHeatmapTooltip = ({
  day,
  hour,
  metricLabel,
  value,
  numberFormatter,
}) =>
  sprintf(
    /* translators: 1: calendar day, 2: hour label, 3: metric label, 4: metric count */
    __("%1$s at %2$s — %3$s: %4$s", "bimbeau-privacy-analytics"),
    day,
    formatHourlyHeatmapHour(hour),
    metricLabel,
    numberFormatter.format(value),
  );

export {
  DEFAULT_HEATMAP_THEME_COLOR,
  HEATMAP_THEME_COLOR_PROPERTY,
  buildHeatmapThemeColorRange,
	buildHeatmapThemeColorInterpolator,
	getHeatmapLabelTextColor,
} from "./heatmapTheme";
