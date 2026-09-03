import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { Spinner } from '@wordpress/components';

import useAdminEndpoint from '../api/useAdminEndpoint';
import BpaCard from '../components/BpaCard';
import HourlyHeatmap from '../components/HourlyHeatmap';
import {
	getHourlyAvailability,
	getHourlyUnavailableReason,
	normalizeHourlyItems,
} from '../lib/hourlyHeatmap';
import { getRangeFromSelection } from '../lib/date';
import OverviewKpis from '../widgets/OverviewKpis';
import ReportTableCard from '../widgets/ReportTableCard';
import TimeseriesChart from '../widgets/TimeseriesChart';
import ReferrerLabel from '../components/ReferrerLabel';
import { isPanelEnabled } from '../constants';

const OverviewPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);
	const isTopPagesEnabled = isPanelEnabled( 'top-pages' );
	const isReferrersEnabled = isPanelEnabled( 'referrers' );
	const { data: hourlyData, isLoading: isHourlyLoading } =
		useAdminEndpoint( '/admin/hourly-heatmap-global', range );
	const hourlyItems = useMemo(
		() => normalizeHourlyItems( hourlyData?.items ),
		[ hourlyData ]
	);

	return (
		<div className="bbpa-overview">
			<div className="bbpa-overview__summary">
				<OverviewKpis range={ range } />
			</div>
			<TimeseriesChart range={ range } metric="overview" />
			<div className="bbpa-overview__grid">
				{ isTopPagesEnabled ? (
					<ReportTableCard
						title={ __( 'Pages', 'bimbeau-privacy-analytics' ) }
						labelHeader={ __( 'Url', 'bimbeau-privacy-analytics' ) }
						range={ range }
						endpoint="/top-pages"
						exportReportKey="top-pages"
						emptyLabel={ __( 'No popular pages available.', 'bimbeau-privacy-analytics' ) }
						labelFallback="/"
						supportsPageLabelToggle
						enableSearch={ false }
						showOpenButton={ false }
						showMetricTrend
					/>
				) : null }
				{ isReferrersEnabled ? (
					<ReportTableCard
						title={ __( 'Top referrers', 'bimbeau-privacy-analytics' ) }
						labelHeader={ __( 'Referrer', 'bimbeau-privacy-analytics' ) }
						range={ range }
						endpoint="/referrers"
						exportReportKey="referrers"
						emptyLabel={ __( 'No referrers available.', 'bimbeau-privacy-analytics' ) }
						labelFallback={ __( 'Direct', 'bimbeau-privacy-analytics' ) }
						maxDisplayedLabelCharacters={ 50 }
						renderLabel={ ( label, item, favicon, fullLabel ) => <ReferrerLabel domain={ item?.label || '' } label={ label } fullLabel={ fullLabel } favicon={ favicon } /> }
						loadReferrerFavicons
						metricLabel={ __( 'Visits', 'bimbeau-privacy-analytics' ) }
						enableSearch={ false }
						showMetricTrend
					/>
				) : null }
				<BpaCard title={ __( 'Hourly heatmap global', 'bimbeau-privacy-analytics' ) }>
					{ isHourlyLoading ? <Spinner /> : (
						<HourlyHeatmap
							ariaLabel={ __( 'Global hourly heatmap by day and hour', 'bimbeau-privacy-analytics' ) }
							emptyDataLabel={ __( 'No global hourly data available for this period.', 'bimbeau-privacy-analytics' ) }
							unavailableLabel={ __( 'Global hourly heatmaps require hourly page aggregation data.', 'bimbeau-privacy-analytics' ) }
							items={ hourlyItems }
							hourlyAvailable={ getHourlyAvailability( hourlyData ) }
							hourlyUnavailableReason={ getHourlyUnavailableReason( hourlyData ) }
							metricLabel={ __( 'Page views', 'bimbeau-privacy-analytics' ) }
							useShortDayLabels
						/>
					) }
				</BpaCard>
			</div>
		</div>
	);
};

export default OverviewPanel;
