import { useMemo } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Spinner } from "@wordpress/components";

import useAdminEndpoint from "../api/useAdminEndpoint";
import BpaCard from "../components/BpaCard";
import PageDetailsHeatMap from "../premium/components/PageDetailsHeatMap";
import { getRangeFromSelection } from "../lib/date";
import { getPageDetailsAdminUrl } from "../lib/adminUrls";
import {
  getPageDetailsHourlyAvailability,
  getPageDetailsHourlyUnavailableReason,
  normalizePageDetailsHourlyItems,
} from "../premium/lib/pageDetailsHeatmap";
import OverviewKpis from "../widgets/OverviewKpis";
import ReportTableCard from "../widgets/ReportTableCard";
import TimeseriesChart from "../widgets/TimeseriesChart";
import ReferrerLabel from "../components/ReferrerLabel";
import { ADMIN_CONFIG, isPanelEnabled } from "../constants";

const OverviewPanel = ({ rangeSelection }) => {
  const range = useMemo(
    () => getRangeFromSelection(rangeSelection),
    [rangeSelection],
  );
  const isTopPagesEnabled = isPanelEnabled("top-pages");
  const canUsePageDetails = Boolean(ADMIN_CONFIG?.settings?.isPro);
  const isReferrersEnabled = isPanelEnabled("referrers");
  const { data: globalHourlyData, isLoading: isGlobalHourlyLoading } =
    useAdminEndpoint("/admin/hourly-heatmap-global", range);
  const globalHourlyItems = useMemo(
    () => normalizePageDetailsHourlyItems(globalHourlyData?.items),
    [globalHourlyData],
  );
  const isGlobalHourlyAvailable = useMemo(
    () => getPageDetailsHourlyAvailability(globalHourlyData),
    [globalHourlyData],
  );
  const globalHourlyUnavailableReason = useMemo(
    () => getPageDetailsHourlyUnavailableReason(globalHourlyData),
    [globalHourlyData],
  );

  return (
    <div className="bbpa-overview">
      <div className="bbpa-overview__summary">
        <OverviewKpis range={range} />
      </div>
      <TimeseriesChart range={range} metric="overview" />
      <div className="bbpa-overview__grid">
        {isTopPagesEnabled ? (
          <ReportTableCard
            title={__("Pages", "bimbeau-privacy-analytics")}
            labelHeader={__("Url", "bimbeau-privacy-analytics")}
            range={range}
            endpoint="/top-pages"
            exportReportKey="top-pages"
            emptyLabel={__(
              "No popular pages available.",
              "bimbeau-privacy-analytics",
            )}
            labelFallback="/"
            supportsPageLabelToggle
            enableSearch={false}
            getRowHref={
              canUsePageDetails
                ? (item) => getPageDetailsAdminUrl(item?.label, "top-pages")
                : undefined
            }
            showOpenButton={false}
            showMetricTrend
          />
        ) : null}
        {isReferrersEnabled ? (
          <ReportTableCard
            title={__("Top referrers", "bimbeau-privacy-analytics")}
            labelHeader={__("Referrer", "bimbeau-privacy-analytics")}
            range={range}
            endpoint="/referrers"
            exportReportKey="referrers"
            emptyLabel={__(
              "No referrers available.",
              "bimbeau-privacy-analytics",
            )}
            labelFallback={__("Direct", "bimbeau-privacy-analytics")}
            renderLabel={(label, item) => (
              <ReferrerLabel domain={item?.label || ""} label={label} />
            )}
            metricLabel={__("Visits", "bimbeau-privacy-analytics")}
            enableSearch={false}
            showMetricTrend
          />
        ) : null}
        <BpaCard
          title={__("Hourly heatmap global", "bimbeau-privacy-analytics")}
        >
          {isGlobalHourlyLoading ? (
            <Spinner />
          ) : (
            <PageDetailsHeatMap
              ariaLabel={__(
                "Global hourly heatmap by day and hour",
                "bimbeau-privacy-analytics",
              )}
              emptyDataLabel={__(
                "No global hourly data available for this period.",
                "bimbeau-privacy-analytics",
              )}
              unavailableLabel={__(
                "Global hourly heatmaps require hourly page aggregation data.",
                "bimbeau-privacy-analytics",
              )}
              items={globalHourlyItems}
              hourlyAvailable={isGlobalHourlyAvailable}
              hourlyUnavailableReason={globalHourlyUnavailableReason}
              metricLabel={__("Page views", "bimbeau-privacy-analytics")}
              source="top-pages"
              useShortDayLabels
            />
          )}
        </BpaCard>
      </div>
    </div>
  );
};

export default OverviewPanel;
