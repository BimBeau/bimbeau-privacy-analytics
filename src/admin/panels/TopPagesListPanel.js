import { TabPanel } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';
import { getRangeFromSelection } from '../lib/date';
import { formatDurationMetricValue } from '../lib/formatters';
import BpaCard from '../components/BpaCard';
import ReportTableCard from '../widgets/ReportTableCard';
import TimeseriesChart from '../widgets/TimeseriesChart';

const TopPagesReportPanel = ( { range, onOpenDetails, getRowHref } ) => (
	<ReportTableCard
		title={ __( 'Top pages', 'bimbeau-privacy-analytics' ) }
		hideZeroPrimaryRows
		labelHeader={ __( 'Url', 'bimbeau-privacy-analytics' ) }
		range={ range }
		endpoint="/top-pages"
		emptyLabel={ __( 'No popular pages available.', 'bimbeau-privacy-analytics' ) }
		labelFallback="/"
		supportsPageLabelToggle
		onRowClick={ onOpenDetails }
		getRowHref={ getRowHref }
		showOpenButton={ false }
		showMetricTrend
		metricSeriesKey="views_series"
		exportReportKey="top-pages"
		requestParams={ {
			include_avg_time:
				ADMIN_CONFIG?.settings?.advanced_stats_enabled !== false
					? 1
					: 0,
		} }
		extraMetricLabel={
			ADMIN_CONFIG?.settings?.advanced_stats_enabled !== false
				? __( 'Avg. time on page:', 'bimbeau-privacy-analytics' )
				: ''
		}
		extraMetricValueKey={
			ADMIN_CONFIG?.settings?.advanced_stats_enabled !== false
				? 'avg_time_on_page_ms'
				: ''
		}
		formatExtraMetricValue={
			ADMIN_CONFIG?.settings?.advanced_stats_enabled !== false
				? formatDurationMetricValue
				: undefined
		}
	/>
);

const NotFoundPanel = ( { range } ) => (
	<ReportTableCard
		title={ __( 'Top 404s', 'bimbeau-privacy-analytics' ) }
		hideZeroPrimaryRows
		labelHeader={ __( 'Url', 'bimbeau-privacy-analytics' ) }
		range={ range }
		endpoint="/404s"
		emptyLabel={ __( 'No missing pages available.', 'bimbeau-privacy-analytics' ) }
		labelFallback="/"
		exportReportKey="404s"
	/>
);

const EntryPagesPanel = ( { range, onOpenDetails, getRowHref } ) => (
	<ReportTableCard
		title={ __( 'Entry pages (approx.)', 'bimbeau-privacy-analytics' ) }
		hideZeroPrimaryRows
		labelHeader={ __( 'Url', 'bimbeau-privacy-analytics' ) }
		range={ range }
		endpoint="/entry-pages"
		emptyLabel={ __( 'No entry pages available.', 'bimbeau-privacy-analytics' ) }
		labelFallback="/"
		metricLabel={ __( 'Entries (approx.)', 'bimbeau-privacy-analytics' ) }
		metricKey="entries"
		metricValueKey="entries"
		supportsPageLabelToggle
		onRowClick={ onOpenDetails }
		getRowHref={ getRowHref }
		showOpenButton={ false }
		exportReportKey="entry-pages"
	/>
);

const ExitPagesPanel = ( { range, onOpenDetails, getRowHref } ) => (
	<ReportTableCard
		title={ __( 'Exit pages', 'bimbeau-privacy-analytics' ) }
		hideZeroPrimaryRows
		labelHeader={ __( 'Url', 'bimbeau-privacy-analytics' ) }
		range={ range }
		endpoint="/exit-pages"
		emptyLabel={ __( 'No exit pages available.', 'bimbeau-privacy-analytics' ) }
		labelFallback="/"
		metricLabel={ __( 'Exits (approx.)', 'bimbeau-privacy-analytics' ) }
		metricKey="exits"
		metricValueKey="exits"
		supportsPageLabelToggle
		onRowClick={ onOpenDetails }
		getRowHref={ getRowHref }
		showOpenButton={ false }
		exportReportKey="exit-pages"
	/>
);

const getInitialTabName = () => {
	if ( typeof window === 'undefined' || ! window.location ) {
		return 'top-pages';
	}

	const params = new URLSearchParams( window.location.search );
	const requestedTab = params.get( 'bbpa_tab' );
	const supportedTabs = [
		'top-pages',
		'entry-pages',
		'exit-pages',
		'not-found',
	];

	return supportedTabs.includes( requestedTab ) ? requestedTab : 'top-pages';
};


const pagesTabs = [
	{ name: 'top-pages', title: __( 'Top pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'entry-pages', title: __( 'Entry pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'exit-pages', title: __( 'Exit pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'not-found', title: __( 'Pages not found', 'bimbeau-privacy-analytics' ) },
];

const TopPagesListPanel = ( { rangeSelection, getRowHref, onOpenDetails } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<TimeseriesChart range={ range } metric="pageViews" />
			<BpaCard className="bbpa-pages-listings-card" title={ __( 'Pages', 'bimbeau-privacy-analytics' ) }>
				<TabPanel className="bbpa-pages-tabs" initialTabName={ getInitialTabName() } tabs={ pagesTabs }>
					{ ( tab ) => {
						if ( tab.name === 'entry-pages' ) {
							return <EntryPagesPanel range={ range } onOpenDetails={ onOpenDetails?.( 'entry-pages' ) } getRowHref={ getRowHref?.( 'entry-pages' ) } />;
						}
						if ( tab.name === 'exit-pages' ) {
							return <ExitPagesPanel range={ range } onOpenDetails={ onOpenDetails?.( 'exit-pages' ) } getRowHref={ getRowHref?.( 'exit-pages' ) } />;
						}
						if ( tab.name === 'not-found' ) {
							return <NotFoundPanel range={ range } />;
						}
						return <TopPagesReportPanel range={ range } onOpenDetails={ onOpenDetails?.( 'top-pages' ) } getRowHref={ getRowHref?.( 'top-pages' ) } />;
					} }
				</TabPanel>
			</BpaCard>
		</div>
	);
};

export default TopPagesListPanel;
