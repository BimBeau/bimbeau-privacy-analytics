import { TabPanel, Tooltip } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';
import { isAdvancedStatsEnabled } from '../lib/adminConstants';
import { getRangeFromSelection } from '../lib/date';
import { formatDurationMetricValue, formatNumber } from '../lib/formatters';
import BpaCard from '../components/BpaCard';
import ReportTableCard from '../widgets/ReportTableCard';
import TimeseriesChart from '../widgets/TimeseriesChart';

const TopPagesReportPanel = ( { range, onOpenDetails, getRowHref } ) => (
	<ReportTableCard
		withCard={ false }
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
			include_avg_time: isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? 1
				: 0,
		} }
		extraMetricLabel={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? __( 'Avg. time on page', 'bimbeau-privacy-analytics' )
				: ''
		}
		extraMetricValueKey={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? 'avg_time_on_page_ms'
				: ''
		}
		formatExtraMetricValue={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? formatDurationMetricValue
				: undefined
		}
	/>
);

const NotFoundPanel = ( { range } ) => (
	<ReportTableCard
		withCard={ false }
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
		withCard={ false }
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
		withCard={ false }
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

// Row key of the /top-content row that holds page views without a published post.
export const TOP_CONTENT_UNRESOLVED_KEY = 'unresolved';

// Top-content rows are matched with the previous period by group key: two authors
// or categories can share a label.
export const getTopContentComparisonKey = ( item ) =>
	String( item?.key ?? item?.label ?? '' );

const getTopContentRowClassName = ( item ) =>
	item?.key === TOP_CONTENT_UNRESOLVED_KEY
		? 'bbpa-report-table__row--muted'
		: '';

const renderTopContentLabel = ( visibleLabel, item ) => {
	if ( item?.key !== TOP_CONTENT_UNRESOLVED_KEY ) {
		return visibleLabel;
	}

	const helpText = __(
		'Page views of addresses that do not match a published post or page, such as archives, search results or the blog home page.',
		'bimbeau-privacy-analytics'
	);

	return (
		<span className="bbpa-report-table__label-with-help">
			<span>{ visibleLabel }</span>
			<Tooltip text={ helpText }>
				<span
					className="dashicons dashicons-editor-help"
					role="img"
					tabIndex={ 0 }
					aria-label={ helpText }
				/>
			</Tooltip>
		</span>
	);
};

const formatShare = ( value ) =>
	`${ formatNumber( Number( value ) || 0, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	} ) } %`;

// Share of the content page views and number of contents viewed, after Page views.
const TOP_CONTENT_EXTRA_FIELDS = [
	{
		id: 'share',
		label: __( 'Share', 'bimbeau-privacy-analytics' ),
		getValue: ( item ) => Number( item?.share ) || 0,
		render: ( item ) => (
			<span className="bbpa-report-table__share">
				<span className="bbpa-report-table__share-bar" aria-hidden="true">
					<span
						style={ {
							width: `${ Math.min( 100, Math.max( 0, Number( item?.share ) || 0 ) ) }%`,
						} }
					/>
				</span>
				<span>{ formatShare( item?.share ) }</span>
			</span>
		),
	},
	{
		id: 'items_count',
		label: __( 'Content viewed', 'bimbeau-privacy-analytics' ),
		getValue: ( item ) => Number( item?.items_count ) || 0,
		render: ( item ) => formatNumber( Number( item?.items_count ) || 0 ),
		sortable: true,
	},
];

const TopContentPanel = ( {
	range,
	dimension,
	title,
	labelHeader,
	emptyLabel,
	footnote = '',
} ) => (
	<ReportTableCard
		withCard={ false }
		title={ title }
		hideZeroPrimaryRows
		labelHeader={ labelHeader }
		range={ range }
		endpoint="/top-content"
		requestParams={ {
			dimension,
			include_avg_time: isAdvancedStatsEnabled( ADMIN_CONFIG?.settings ) ? 1 : 0,
		} }
		extraFields={ TOP_CONTENT_EXTRA_FIELDS }
		extraMetricLabel={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? __( 'Avg. time on page', 'bimbeau-privacy-analytics' )
				: ''
		}
		extraMetricValueKey={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? 'avg_time_on_page_ms'
				: ''
		}
		formatExtraMetricValue={
			isAdvancedStatsEnabled( ADMIN_CONFIG?.settings )
				? formatDurationMetricValue
				: undefined
		}
		emptyLabel={ emptyLabel }
		labelFallback="—"
		supportsPageLabelToggle={ false }
		showOpenButton={ false }
		showMetricTrend
		metricSeriesKey="views_series"
		getComparisonKey={ getTopContentComparisonKey }
		getRowClassName={ getTopContentRowClassName }
		renderLabel={ renderTopContentLabel }
		footnote={ footnote }
	/>
);

const contentTabPanels = {
	'content-types': {
		dimension: 'post_type',
		title: __( 'Content types', 'bimbeau-privacy-analytics' ),
		labelHeader: __( 'Content type', 'bimbeau-privacy-analytics' ),
		emptyLabel: __( 'No content types available.', 'bimbeau-privacy-analytics' ),
	},
	categories: {
		dimension: 'category',
		title: __( 'Categories', 'bimbeau-privacy-analytics' ),
		labelHeader: __( 'Category', 'bimbeau-privacy-analytics' ),
		emptyLabel: __( 'No categories available.', 'bimbeau-privacy-analytics' ),
		footnote: __(
			'A post filed in several categories counts in each of them.',
			'bimbeau-privacy-analytics'
		),
	},
	authors: {
		dimension: 'author',
		title: __( 'Authors', 'bimbeau-privacy-analytics' ),
		labelHeader: __( 'Author', 'bimbeau-privacy-analytics' ),
		emptyLabel: __( 'No authors available.', 'bimbeau-privacy-analytics' ),
	},
};

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
		...Object.keys( contentTabPanels ),
	];

	return supportedTabs.includes( requestedTab ) ? requestedTab : 'top-pages';
};


const pagesTabs = [
	{ name: 'top-pages', title: __( 'Top pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'entry-pages', title: __( 'Entry pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'exit-pages', title: __( 'Exit pages', 'bimbeau-privacy-analytics' ) },
	{ name: 'not-found', title: __( 'Pages not found', 'bimbeau-privacy-analytics' ) },
	...Object.entries( contentTabPanels ).map( ( [ name, panel ] ) => ( {
		name,
		title: panel.title,
	} ) ),
];

const TopPagesListPanel = ( { rangeSelection, getRowHref, onOpenDetails } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<TimeseriesChart range={ range } metric="pageViews" />
			<BpaCard
				className="bbpa-pages-listings-card bbpa-dataviews-card"
				bodyClassName="bbpa-listing-region bbpa-dataviews"
				title={ __( 'Pages', 'bimbeau-privacy-analytics' ) }
			>
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
						if ( contentTabPanels[ tab.name ] ) {
							return (
								<TopContentPanel
									key={ tab.name }
									range={ range }
									{ ...contentTabPanels[ tab.name ] }
								/>
							);
						}
						return <TopPagesReportPanel range={ range } onOpenDetails={ onOpenDetails?.( 'top-pages' ) } getRowHref={ getRowHref?.( 'top-pages' ) } />;
					} }
				</TabPanel>
			</BpaCard>
		</div>
	);
};

export default TopPagesListPanel;
