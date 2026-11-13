import Notice from '../BrandNotice';
import FeatureIcon from '../icons/FeatureIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";

import {
  buildHeatmapThemeColorInterpolator,
  buildHourlyHeatmapData,
  DEFAULT_HEATMAP_THEME_COLOR,
  formatHourlyHeatmapHour,
  getHourlyHeatmapEmptyLabel,
  getHourlyHeatmapPeak,
  HEATMAP_THEME_COLOR_PROPERTY,
  HOURLY_HEATMAP_HOURS,
} from "../../lib/hourlyHeatmap";

const MOBILE_VIEWPORT_MEDIA_QUERY = "(max-width: 782px)";
// Hours labelled above the grid; the other hours are read by screen readers
// only, so the axis stays legible on narrow screens.
const LABELLED_HOUR_STEP = 3;
const MIN_ACTIVE_SHADE = 0.15;
const ROOT_CLASS_NAME = "bbpa-hourly-heatmap";

const resolveCanvasColor = (color) => {
  if (typeof document === "undefined" || !document.body) {
    return color;
  }

  const probe = document.createElement("span");
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolvedColor = window.getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor || color;
};

const resolveHeatmapThemeColor = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return DEFAULT_HEATMAP_THEME_COLOR;
  }

  const themeColor = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(HEATMAP_THEME_COLOR_PROPERTY)
    .trim();

  return resolveCanvasColor(themeColor || DEFAULT_HEATMAP_THEME_COLOR);
};

/**
 * Activity by weekday (rows) and hour (columns).
 *
 * The cells carry colour only: the value of a cell shows in a tooltip on
 * hover and is read from the table by screen readers. A cell without
 * activity keeps the neutral background, and the busiest slot is named
 * under the grid.
 *
 * @param {Object}  props                         Component props.
 * @param {string}  props.ariaLabel               Accessible name of the grid.
 * @param {string}  props.className               Root class name.
 * @param {string}  props.emptyDataLabel          Notice shown without activity.
 * @param {Array}   props.items                   Normalized hourly rows ({ dayOfWeek, hour, value }).
 * @param {boolean} props.hourlyAvailable         Whether hourly data exists for the source.
 * @param {string}  props.hourlyUnavailableReason Reason sent by the REST route.
 * @param {string}  props.metricLabel             Name of the counted metric.
 * @param {string}  props.source                  Report source, for the unavailable notice.
 * @param {string}  props.tooltipClassName        Class added to the tooltip.
 * @param {string}  props.unavailableLabel        Notice shown without hourly data.
 * @param {boolean} props.useShortDayLabels       Use short weekday names on every screen.
 * @return {Element} Heatmap.
 */
const HourlyHeatmap = ({
  ariaLabel,
  className = ROOT_CLASS_NAME,
  emptyDataLabel,
  items,
  hourlyAvailable,
  hourlyUnavailableReason,
  metricLabel,
  source,
  tooltipClassName = "bbpa-hourly-heatmap__tooltip",
  unavailableLabel,
  useShortDayLabels = false,
}) => {
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const [heatmapThemeColor, setHeatmapThemeColor] = useState(
    resolveHeatmapThemeColor,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }

    return window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches;
  });
  const [activeCell, setActiveCell] = useState(null);
  const frameRef = useRef(null);
  const { data, days, dayLabels, dayShortLabels, maxValue } = useMemo(
    () => buildHourlyHeatmapData(items),
    [items],
  );
  const peak = useMemo(() => getHourlyHeatmapPeak(data, days), [data, days]);
  const visibleDayLabels =
    useShortDayLabels || isMobileViewport ? dayShortLabels : dayLabels;
  const heatmapColorInterpolator = useMemo(
    () => buildHeatmapThemeColorInterpolator(heatmapThemeColor),
    [heatmapThemeColor],
  );
  const getCellColor = useCallback(
    (value) =>
      value > 0 && maxValue > 0
        ? // Square-root scale: one busy slot does not wash out the others.
          // It starts above the lightest tint, so a cell with a single page
          // view still differs from a cell without any.
          heatmapColorInterpolator(
            MIN_ACTIVE_SHADE +
              (1 - MIN_ACTIVE_SHADE) * Math.sqrt(value / maxValue),
          )
        : undefined,
    [heatmapColorInterpolator, maxValue],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    const handleViewportChange = (event) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", handleViewportChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const updateHeatmapThemeColor = () => {
      setHeatmapThemeColor(resolveHeatmapThemeColor());
    };

    updateHeatmapThemeColor();
    window.addEventListener("focus", updateHeatmapThemeColor);

    if (typeof window.MutationObserver === "undefined") {
      return () => {
        window.removeEventListener("focus", updateHeatmapThemeColor);
      };
    }

    const observer = new window.MutationObserver(updateHeatmapThemeColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", updateHeatmapThemeColor);
    };
  }, []);

  if (!hourlyAvailable) {
    return (
      <Notice status="info" isDismissible={false}>
        {unavailableLabel ||
          getHourlyHeatmapEmptyLabel(source, hourlyUnavailableReason)}
      </Notice>
    );
  }

  if (!data.length || !days.length) {
    return (
      <Notice status="info" isDismissible={false}>
        {emptyDataLabel ||
          __(
            "No hourly details available for this page.",
            "bimbeau-privacy-analytics",
          )}
      </Notice>
    );
  }

  const resolvedAriaLabel =
    ariaLabel ||
    __("Hourly activity heatmap by day and hour", "bimbeau-privacy-analytics");
  const formatValue = (value) =>
    sprintf(
      /* translators: 1: Metric label, 2: Metric value. */
      __("%1$s: %2$s", "bimbeau-privacy-analytics"),
      metricLabel,
      numberFormatter.format(value),
    );

  const showCell = (event, day, hour, value) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const frameBounds = frame.getBoundingClientRect();
    const cellBounds = event.currentTarget.getBoundingClientRect();
    const left = cellBounds.left - frameBounds.left + cellBounds.width / 2;
    setActiveCell({
      day,
      hour,
      value,
      left,
      top: cellBounds.top - frameBounds.top,
      isNearStart: left < frameBounds.width * 0.25,
      isNearEnd: left > frameBounds.width * 0.75,
    });
  };

  return (
    <div
      className={
        [
          ROOT_CLASS_NAME,
          className === ROOT_CLASS_NAME ? "" : className,
          visibleDayLabels === dayShortLabels ? "" : "has-long-day-labels",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      <div className="bbpa-hourly-heatmap__frame" ref={frameRef}>
        <table
          className="bbpa-hourly-heatmap__grid"
          aria-label={resolvedAriaLabel}
          onMouseLeave={() => setActiveCell(null)}
        >
          <thead>
            <tr>
              <td className="bbpa-hourly-heatmap__corner" />
              {HOURLY_HEATMAP_HOURS.map((hour) => {
                const hourLabel = formatHourlyHeatmapHour(hour);
                const isLabelled = hour % LABELLED_HOUR_STEP === 0;
                const isMajor = hour % (LABELLED_HOUR_STEP * 2) === 0;

                return (
                  <th
                    key={hour}
                    scope="col"
                    className={`bbpa-hourly-heatmap__hour${
                      isMajor ? " is-major" : ""
                    }`}
                  >
                    {isLabelled ? (
                      <span
                        className="bbpa-hourly-heatmap__hour-label"
                        aria-hidden="true"
                      >
                        {`${hour}h`}
                      </span>
                    ) : null}
                    <span className="screen-reader-text">{hourLabel}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIndex) => (
              <tr key={day}>
                <th scope="row" className="bbpa-hourly-heatmap__day">
                  <span aria-hidden="true">{visibleDayLabels[day] || day}</span>
                  <span className="screen-reader-text">
                    {dayLabels[day] || day}
                  </span>
                </th>
                {data.map((row, hour) => {
                  const value = Number(row.data[dayIndex]?.y) || 0;
                  const isPeak = peak?.day === day && peak?.hour === hour;

                  return (
                    <td
                      key={row.id}
                      className={`bbpa-hourly-heatmap__cell${
                        value > 0 ? "" : " is-empty"
                      }${isPeak ? " is-peak" : ""}`}
                      style={{ backgroundColor: getCellColor(value) }}
                      onMouseEnter={(event) =>
                        showCell(event, day, hour, value)
                      }
                    >
                      <span className="screen-reader-text">
                        {numberFormatter.format(value)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {activeCell ? (
          <div
            className={`bbpa-world-map__tooltip bbpa-hourly-heatmap__floating ${tooltipClassName}${
              activeCell.isNearStart ? " is-near-start" : ""
            }${activeCell.isNearEnd ? " is-near-end" : ""}`}
            style={{ left: `${activeCell.left}px`, top: `${activeCell.top}px` }}
            aria-hidden="true"
          >
            <div className="bbpa-world-map__tooltip-title">
              <strong>{`${dayLabels[activeCell.day] || activeCell.day} • ${formatHourlyHeatmapHour(
                activeCell.hour,
              )}`}</strong>
            </div>
            <div className="bbpa-world-map__tooltip-value">
              <span
                className="bbpa-world-map__tooltip-dot"
                style={{
                  background:
                    getCellColor(activeCell.value) || "var(--color-5, #f6f7f7)",
                }}
              />
              <span>{formatValue(activeCell.value)}</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="bbpa-hourly-heatmap__footer">
        <div className="bbpa-hourly-heatmap__legend" aria-hidden="true">
          <span className="bbpa-hourly-heatmap__legend-title">
            {metricLabel}
          </span>
          <span className="bbpa-hourly-heatmap__legend-swatch" />
          <span>0</span>
          <span
            className="bbpa-hourly-heatmap__legend-scale"
            style={{
              background: `linear-gradient(90deg, ${heatmapColorInterpolator(
                MIN_ACTIVE_SHADE,
              )}, ${heatmapColorInterpolator(1)})`,
            }}
          />
          <span>{numberFormatter.format(maxValue)}</span>
        </div>
        {peak ? (
          <p className="bbpa-hourly-heatmap__peak">
            <FeatureIcon name="info" size={16} />
            <span>
              {sprintf(
                /* translators: 1: weekday name, 2: hour such as 13:00, 3: metric label and value such as "Page views: 47". */
                __(
                  "Busiest slot: %1$s, %2$s (%3$s)",
                  "bimbeau-privacy-analytics",
                ),
                dayLabels[peak.day] || peak.day,
                formatHourlyHeatmapHour(peak.hour),
                formatValue(peak.value),
              )}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default HourlyHeatmap;
