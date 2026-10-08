import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import ListDataViews, { getInitialListColumns } from '../../components/ListDataViews';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import ReferrerLabel from '../../components/ReferrerLabel';
import { normalizeReferrerHost, useReferrerFavicons } from '../../components/ReferrerLabel/faviconCache';
import ReportExportAction from '../../components/ReportExportAction';
import MetricTrend from '../../components/MetricTrend';
import { DATAVIEWS_PER_PAGE_SIZES } from '../../lib/dataviewsConfig';
import { getPreviousRange } from '../../lib/date';
import { getChannelLabel } from '../../lib/channelLabels';
import { formatNumber } from '../../lib/formatters';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';

/**
 * Visits of a referrer-source row. `hits` holds page views; it is only used for payloads
 * that predate the separate `visits` key.
 */
const getRowVisits = ( item ) =>
	item?.visits !== undefined && item?.visits !== null
		? Number( item.visits )
		: Number( item?.hits || 0 );

const getComparisonKey = ( domain, category ) => `${ domain || '' }::${ category || '' }`;

// DataViews field id => `orderby` of /referrer-sources.
const SORT_KEYS = {
	referrer: 'referrer',
	channel: 'category',
	visits: 'visits',
};

export const getReferrerSourcesSortParams = ( view ) => ( {
	orderby: SORT_KEYS[ view?.sort?.field ] || 'visits',
	order: view?.sort?.direction === 'asc' ? 'asc' : 'desc',
} );

const DEFAULT_VIEW = {
	type: 'table',
	page: 1,
	perPage: 10,
	search: '',
	sort: { field: 'visits', direction: 'desc' },
	filters: [],
	fields: [ 'referrer', 'channel', 'visits', 'change' ],
	// Numbers are aligned to the end, with their header, so that digits line up.
	layout: { styles: { visits: { align: 'end' }, change: { align: 'end' } } },
};

/**
 * Referring sites list (referrer, channel, visits with the trend against the previous period),
 * rendered with the WordPress DataViews component.
 *
 * @param {Object} props               Component props.
 * @param {Object} props.range         Reporting range.
 * @param {Object} props.requestParams Extra request parameters (page details: `page_path`).
 */
const ReferrerSourcesTableCard = ( { range, requestParams = {} } ) => {
	registerDataViewsTranslations();

	const [ view, setView ] = useState( () => ( {
		...DEFAULT_VIEW,
		fields: getInitialListColumns(
			'referrer_sources',
			DEFAULT_VIEW.fields,
			DEFAULT_VIEW.fields.map( ( id ) => ( { id } ) )
		),
	} ) );

	// A new range or page starts on the first page.
	useEffect( () => {
		setView( ( current ) => ( { ...current, page: 1 } ) );
	}, [ range.start, range.end, requestParams.page_path ] );

	const search = String( view.search || '' ).trim();
	const listParams = {
		...range,
		...requestParams,
		...getReferrerSourcesSortParams( view ),
		search,
	};
	const { data, isLoading, error } = useAdminEndpoint(
		'/referrer-sources',
		{ ...listParams, page: view.page, per_page: view.perPage },
		{ namespace: ADMIN_CONFIG?.settings?.restNamespace }
	);
	const comparisonRange = useMemo( () => getPreviousRange( range ), [ range ] );
	const { data: comparisonData, isLoading: isComparisonLoading } =
		useAdminEndpoint(
			'/referrer-sources',
			{
				...comparisonRange,
				...requestParams,
				page: 1,
				per_page: 100,
				orderby: 'visits',
				order: 'desc',
				search,
			},
			{ namespace: ADMIN_CONFIG?.settings?.restNamespace }
		);

	const items = useMemo( () => data?.items || [], [ data ] );
	const faviconsEnabled = Boolean( ADMIN_CONFIG?.settings?.referrer_favicons_enabled );
	const favicons = useReferrerFavicons(
		items.map( ( item ) => item.referrer_domain || '' ),
		faviconsEnabled,
		items.map( ( item ) => item.favicon )
	);
	const pagination = data?.pagination || {};
	const totalItems = Number( pagination.totalItems ) || items.length;
	const totalPages = Math.max( 1, Number( pagination.totalPages ) || 1 );

	// A shorter list (new search or range) can end before the current page.
	useEffect( () => {
		if ( ! isLoading && ! error && view.page > totalPages ) {
			setView( ( current ) => ( { ...current, page: totalPages } ) );
		}
	}, [ isLoading, error, totalPages, view.page ] );

	const directLabel = __( 'Direct', 'bimbeau-privacy-analytics' );
	const rows = items.map( ( item, index ) => {
		const categoryFallback = item.referrer_domain
			? __( 'Referrer', 'bimbeau-privacy-analytics' )
			: directLabel;
		const sourceCategory = item.source_category || categoryFallback;
		const category = getChannelLabel( sourceCategory );
		const referrer =
			item.referrer_domain ||
			( category === directLabel
				? directLabel
				: __( 'Referrer unavailable', 'bimbeau-privacy-analytics' ) );

		return {
			id: `${ referrer }-${ sourceCategory }-${ index }`,
			referrer,
			referrerDomain: item.referrer_domain || '',
			favicon:
				item.favicon ||
				favicons.get( normalizeReferrerHost( item.referrer_domain || '' ) ),
			category,
			visits: getRowVisits( item ),
			comparisonKey: getComparisonKey( item.referrer_domain, sourceCategory ),
		};
	} );

	const comparisonByKey = useMemo( () => {
		const values = new Map();
		( comparisonData?.items || [] ).forEach( ( item ) => {
			values.set(
				getComparisonKey( item?.referrer_domain, item?.source_category ),
				getRowVisits( item )
			);
		} );

		return values;
	}, [ comparisonData ] );
	// Only the first 100 rows of the previous period are loaded: a row missing from them had no
	// visit only when they are the whole previous list.
	const comparisonItemsCount = ( comparisonData?.items || [] ).length;
	const isComparisonComplete =
		Boolean( comparisonData ) &&
		Number( comparisonData?.pagination?.totalItems ?? comparisonItemsCount ) <=
		comparisonItemsCount;
	const getPreviousVisits = ( key ) => {
		if ( comparisonByKey.has( key ) ) {
			return comparisonByKey.get( key );
		}

		return isComparisonComplete ? 0 : null;
	};

	const fields = [
		{
			id: 'referrer',
			label: __( 'Referrer', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.referrer,
			render: ( { item } ) => (
				<ReferrerLabel
					domain={ item.referrerDomain }
					label={ item.referrer }
					favicon={ item.favicon }
				/>
			),
			enableHiding: false,
			enableSorting: true,
			filterBy: false,
		},
		{
			id: 'channel',
			label: __( 'Channel', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.category,
			enableHiding: true,
			enableSorting: true,
			filterBy: false,
		},
		{
			id: 'visits',
			label: __( 'Visits', 'bimbeau-privacy-analytics' ),
			type: 'integer',
			getValue: ( { item } ) => item.visits,
			render: ( { item } ) => (
				<span className="bbpa-report-table__metric-value">
					{ formatNumber( item.visits ) }
				</span>
			),
			enableHiding: false,
			enableSorting: true,
			filterBy: false,
		},
		{
			id: 'change',
			label: __( 'Change', 'bimbeau-privacy-analytics' ),
			render: ( { item } ) =>
				isComparisonLoading ? null : (
					<MetricTrend
						value={ item.visits }
						previousValue={ getPreviousVisits( item.comparisonKey ) }
					/>
				),
			enableHiding: true,
			enableSorting: false,
			filterBy: false,
		},
	];

	const onChangeView = ( nextView ) => {
		const resetsPage =
			nextView.search !== view.search ||
			nextView.perPage !== view.perPage ||
			nextView.sort?.field !== view.sort?.field ||
			nextView.sort?.direction !== view.sort?.direction;

		setView( resetsPage ? { ...nextView, page: 1 } : nextView );
	};

	return (
		<BpaCard
			title={ __( 'Referring sites', 'bimbeau-privacy-analytics' ) }
			className="bbpa-dataviews-card"
			bodyClassName="bbpa-listing-region bbpa-dataviews"
		>
			<div className="bbpa-report-dataview bbpa-report-dataview--referrers">
				{ error ? (
					<DataState
						isLoading={ false }
						error={ error }
						isEmpty={ false }
						loadingLabel={ __( 'Loading referring sites…', 'bimbeau-privacy-analytics' ) }
					/>
				) : null }
				<ListDataViews
					view={ view }
					onChangeView={ onChangeView }
					columnsStorageId="referrer_sources"
					fields={ fields }
					data={ error ? [] : rows }
					isLoading={ isLoading }
					getItemId={ ( row ) => row.id }
					paginationInfo={ { totalItems, totalPages } }
					defaultLayouts={ { table: {} } }
					searchLabel={ __( 'Search', 'bimbeau-privacy-analytics' ) }
					config={ { perPageSizes: DATAVIEWS_PER_PAGE_SIZES } }
					empty={
						<p className="bbpa-report-dataview__empty">
							{ __( 'No referring site data available.', 'bimbeau-privacy-analytics' ) }
						</p>
					}
					header={
						<ReportExportAction
							report="referrer-sources"
							params={ listParams }
							totalItems={ totalItems }
						/>
					}
				/>
			</div>
		</BpaCard>
	);
};

export default ReferrerSourcesTableCard;
