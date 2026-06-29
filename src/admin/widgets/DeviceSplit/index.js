import { __, _n } from "@wordpress/i18n";

import useAdminEndpoint from "../../api/useAdminEndpoint";
import DataState from "../../components/DataState";
import BpaCard from "../../components/BpaCard";
const DeviceSplit = ({ range }) => {
  const { data, isLoading, error } = useAdminEndpoint(
    "/admin/device-split",
    range,
  );
  const items = data?.items || [];
  const labeledItems = items.map((item) => {
    const normalizedLabel = item.label
      ? item.label.toLowerCase()
      : "";
    const translatedLabel =
      normalizedLabel === "desktop"
        ? __("Desktop", "bimbeau-privacy-analytics")
        : null;

    return {
      ...item,
      label: translatedLabel
        ? translatedLabel
        : item.label
          ? item.label.charAt(0).toUpperCase() + item.label.slice(1)
          : __("Unknown", "bimbeau-privacy-analytics"),
    };
  });
  const maxHits = labeledItems.reduce(
    (max, item) => Math.max(max, item.hits),
    0,
  );

  return (
    <BpaCard title={__("Device page views", "bimbeau-privacy-analytics")}>
      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && labeledItems.length === 0}
        emptyLabel={__("No device data available.", "bimbeau-privacy-analytics")}
        loadingLabel={__("Loading device breakdown…", "bimbeau-privacy-analytics")}
      />
      {!isLoading && !error && labeledItems.length > 0 && (
        <div className="bbpa-device-breakdown">
          {labeledItems.map((entry) => {
            const percent = maxHits
              ? Math.round((entry.hits / maxHits) * 100)
              : 0;
            return (
              <div key={entry.label} className="bbpa-device-breakdown__row">
                <div className="bbpa-device-breakdown__label">{entry.label}</div>
                <div className="bbpa-device-breakdown__bar" aria-hidden="true">
                  <div
                    className="bbpa-device-breakdown__bar-fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="bbpa-device-breakdown__value">
                  {`${entry.hits} ${_n(
                    "view",
                    "views",
                    entry.hits,
                    "bimbeau-privacy-analytics",
                  )}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BpaCard>
  );
};

export default DeviceSplit;
