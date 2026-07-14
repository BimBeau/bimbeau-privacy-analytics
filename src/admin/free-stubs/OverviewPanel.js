import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import BpaCard from '../components/BpaCard';
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
						renderLabel={ ( label, item ) => <ReferrerLabel domain={ item?.label || '' } label={ label } /> }
						metricLabel={ __( 'Visits', 'bimbeau-privacy-analytics' ) }
						enableSearch={ false }
						showMetricTrend
					/>
				) : null }
				<BpaCard title={ __( 'Hourly heatmap global', 'bimbeau-privacy-analytics' ) } />
			</div>
		</div>
	);
};

export default OverviewPanel;
