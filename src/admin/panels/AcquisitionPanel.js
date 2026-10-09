import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { filterSortAndPaginate } from '@wordpress/dataviews';
import ListDataViews, { resolveListColumns } from '../components/ListDataViews';
import { getStoredListColumns } from '../lib/storage';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	LuBadgeDollarSign,
	LuChevronRight,
	LuCircleHelp,
	LuLink,
	LuMail,
	LuMegaphone,
	LuMousePointerClick,
	LuSearch,
	LuShare2,
	LuSparkles,
} from 'react-icons/lu';

import useAdminEndpoint from '../api/useAdminEndpoint';
import DataState from '../components/DataState';
import BpaCard from '../components/BpaCard';
import ChannelDetails from '../components/ChannelDetails';
import MetricTrend from '../components/MetricTrend';
import ShareBar from '../components/ShareBar';
import ReportExportAction from '../components/ReportExportAction';
import { ADMIN_CONFIG } from '../constants';
import { getPreviousRange, getRangeFromSelection } from '../lib/date';
import { formatNumber } from '../lib/formatters';
import { getChannelLabel } from '../lib/channelLabels';
import { getChannelSources } from '../lib/channelSources';
import { registerDataViewsTranslations } from '../lib/dataviewsTranslations';


const CHANNEL_ICONS = {
	direct: LuMousePointerClick,
	'organic-search': LuSearch,
	'ai-assistants': LuSparkles,
	'paid-search': LuBadgeDollarSign,
	referrals: LuLink,
	'paid-social': LuShare2,
	'organic-social': LuShare2,
	email: LuMail,
	'other-campaigns': LuMegaphone,
	other: LuCircleHelp,
};

const ACQUISITION_COLUMNS_STORAGE_ID = 'acquisition_channels';
const CHANNEL_DETAILS_ID = 'bbpa-acquisition-channel-details';
// Referring sites loaded to list the sources of a channel (the maximum page size of the route).
const CHANNEL_SOURCES_LIMIT = 1000;

const DEFAULT_VIEW = {
	type: 'table',
	page: 1,
	perPage: 20,
	sort: { field: 'visits', direction: 'desc' },
	filters: [],
	fields: [ 'visits', 'change', 'share' ],
	titleField: 'channel',
	// Numbers are aligned to the end, with their header, so that digits line up.
	layout: {
		styles: {
			visits: { align: 'end' },
			change: { align: 'end' },
			share: { align: 'end' },
			orders: { align: 'end' },
			revenue: { align: 'end' },
			conversion_rate: { align: 'end' },
		},
	},
};

const ChannelLabel = ( { item } ) => {
	const Icon = CHANNEL_ICONS[ item.key ] || LuCircleHelp;

	return (
		<span className="bbpa-channel-label">
			<Icon aria-hidden="true" focusable="false" />
			{ item.label }
		</span>
	);
};

/**
 * Acquisition channels report: one row per channel (all channels fit on one page), sorted in
 * the browser, rendered with the WordPress DataViews component.
 *
 * @param {Object} props                Component props.
 * @param {Object} props.rangeSelection Selected range.
 */
const AcquisitionPanel = ( { rangeSelection } ) => {
	registerDataViewsTranslations();

	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);
	const previousRange = useMemo( () => getPreviousRange( range ), [ range ] );
	// Saved columns: the optional WooCommerce columns are not known yet on the first render, so
	// their saved place and visibility are kept as they are.
	const [ storedColumns ] = useState( () =>
		getStoredListColumns( ACQUISITION_COLUMNS_STORAGE_ID )
	);
	const [ view, setView ] = useState( () => ( {
		...DEFAULT_VIEW,
		fields: storedColumns
			? resolveListColumns(
					storedColumns,
					DEFAULT_VIEW.fields,
					[
						{ id: 'channel' },
						{ id: 'visits', enableHiding: false },
						{ id: 'change' },
						{ id: 'share' },
						...storedColumns.fields
							.filter( ( id ) => ! DEFAULT_VIEW.fields.includes( id ) )
							.map( ( id ) => ( { id } ) ),
					]
			  )
			: DEFAULT_VIEW.fields,
	} ) );
	// Optional columns (WooCommerce) are shown by default; these ones were hidden by the user.
	const [ hiddenOptionalFields, setHiddenOptionalFields ] = useState(
		() => storedColumns?.hidden || []
	);

	const { data, isLoading, error } = useAdminEndpoint(
		'/acquisition-channels',
		range,
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);
	const { data: comparisonData, isLoading: isComparisonLoading } =
		useAdminEndpoint( '/acquisition-channels', previousRange, {
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		} );

	const rows = useMemo(
		() =>
			( data?.items || [] ).map( ( item ) => ( {
				key: item.key || '',
				label: getChannelLabel( item.key || item.channel ),
				visits: Number( item.visits || 0 ),
				share: Number( item.share || 0 ),
			} ) ),
		[ data ]
	);
	const comparisonByKey = useMemo( () => {
		const values = new Map();
		( comparisonData?.items || [] ).forEach( ( item ) => {
			values.set( item?.key || '', Number( item?.visits || 0 ) );
		} );

		return values;
	}, [ comparisonData ] );
	const total = Number( data?.total || 0 );

	// Channel shown in the detail panel: the channel with the most visits until the user picks
	// another one (`chosenKey` undefined), or none once the user closes the panel (null). A chosen
	// channel missing from a new range falls back to the channel with the most visits.
	const [ chosenKey, setChosenKey ] = useState( undefined );
	const selectedRow =
		chosenKey === null
			? null
			: rows.find( ( row ) => row.key === chosenKey ) || rows[ 0 ] || null;
	const selectedKey = selectedRow?.key || null;
	const explorerRef = useRef( null );
	const detailsRef = useRef( null );
	// The sources of every channel come from one request on the referring sites of the range,
	// sent once a channel other than Direct is opened and kept while another channel is opened.
	const [ hasOpenedSources, setHasOpenedSources ] = useState( false );
	useEffect( () => {
		if ( selectedRow && selectedRow.key !== 'direct' ) {
			setHasOpenedSources( true );
		}
	}, [ selectedRow ] );
	const {
		data: sourcesData,
		isLoading: isSourcesLoading,
		error: sourcesError,
	} = useAdminEndpoint(
		'/referrer-sources',
		{
			...range,
			page: 1,
			per_page: CHANNEL_SOURCES_LIMIT,
			orderby: 'visits',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: hasOpenedSources,
		}
	);
	// Same referring sites over the previous period, for the trend of each source.
	const { data: previousSourcesData } = useAdminEndpoint(
		'/referrer-sources',
		{
			...previousRange,
			page: 1,
			per_page: CHANNEL_SOURCES_LIMIT,
			orderby: 'visits',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: hasOpenedSources,
		}
	);
	const selectedSources = useMemo( () => {
		const sources = getChannelSources( sourcesData?.items, selectedRow?.key );
		if ( ! previousSourcesData ) {
			return sources;
		}
		const previousByDomain = new Map(
			getChannelSources( previousSourcesData.items, selectedRow?.key ).map(
				( source ) => [ source.domain, source.visits ]
			)
		);
		// A source missing from the previous rows had no visit only when they are the whole list.
		const previousItemsCount = ( previousSourcesData.items || [] ).length;
		const isPreviousComplete =
			Number( previousSourcesData.pagination?.totalItems ?? previousItemsCount ) <=
			previousItemsCount;

		return sources.map( ( source ) => {
			let previousVisits = isPreviousComplete ? 0 : null;
			if ( previousByDomain.has( source.domain ) ) {
				previousVisits = previousByDomain.get( source.domain );
			}

			return { ...source, previousVisits };
		} );
	}, [ sourcesData, previousSourcesData, selectedRow?.key ] );
	const isSourcesPartial =
		Number( sourcesData?.pagination?.totalItems || 0 ) >
		( sourcesData?.items || [] ).length;

	const toggleChannel = ( key ) => setChosenKey( key === selectedKey ? null : key );
	const closeDetails = useCallback( () => {
		const key = selectedKey;
		setChosenKey( null );
		// Focus goes back to the row that opened the panel.
		const rowButton = Array.from(
			explorerRef.current?.querySelectorAll( '[data-bbpa-channel]' ) || []
		).find( ( element ) => element.dataset.bbpaChannel === key );
		rowButton?.focus();
	}, [ selectedKey ] );

	// Below the table (narrow screens), a panel opened by the user is scrolled into view; the
	// panel opened by default on load is not.
	useEffect( () => {
		const details = detailsRef.current;
		const table = explorerRef.current?.firstElementChild;
		if ( ! chosenKey || ! details || ! table || ! details.scrollIntoView ) {
			return;
		}
		if ( details.getBoundingClientRect().top >= table.getBoundingClientRect().bottom ) {
			details.scrollIntoView( { block: 'nearest' } );
		}
	}, [ chosenKey ] );

	// The channel name is a native button: DataViews keeps it clickable from the keyboard, and
	// `aria-pressed` tells which channel is shown in the detail panel.
	const renderChannelButton = ( { item, className, children } ) => (
		<button
			type="button"
			className={ `${ className || '' } bbpa-acquisition__channel-button` }
			aria-pressed={ item.key === selectedKey }
			aria-controls={ item.key === selectedKey ? CHANNEL_DETAILS_ID : undefined }
			data-bbpa-channel={ item.key }
			onClick={ () => toggleChannel( item.key ) }
		>
			{ children }
			<LuChevronRight
				className="bbpa-acquisition__channel-chevron"
				aria-hidden="true"
				focusable="false"
			/>
		</button>
	);
	let ecommerceFields = [];
	

	const fields = [
		{
			id: 'channel',
			label: __( 'Channel', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.label,
			render: ChannelLabel,
			enableHiding: false,
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
			// Every channel of the previous period is loaded: a missing channel had no visit.
			render: ( { item } ) =>
				isComparisonLoading || ! comparisonData ? null : (
					<MetricTrend
						value={ item.visits }
						previousValue={ comparisonByKey.get( item.key ) ?? 0 }
					/>
				),
			enableHiding: true,
			enableSorting: false,
			filterBy: false,
		},
		{
			id: 'share',
			label: __( 'Traffic share', 'bimbeau-privacy-analytics' ),
			type: 'number',
			getValue: ( { item } ) => item.share,
			render: ( { item } ) => (
				<ShareBar value={ item.share } shares={ rows.map( ( row ) => row.share ) } />
			),
			enableSorting: true,
			filterBy: false,
		},
		...ecommerceFields,
	];
	const optionalFieldIds = ecommerceFields.map( ( field ) => field.id );
	const fieldIds = fields.map( ( field ) => field.id );
	const visibleFields = [
		...view.fields.filter( ( id ) => fieldIds.includes( id ) ),
		...optionalFieldIds.filter(
			( id ) =>
				! view.fields.includes( id ) && ! hiddenOptionalFields.includes( id )
		),
	];
	const { data: shownRows, paginationInfo } = filterSortAndPaginate(
		rows,
		{ ...view, fields: visibleFields },
		fields
	);

	const onChangeView = ( nextView ) => {
		const nextFields = nextView.fields || [];
		setHiddenOptionalFields(
			optionalFieldIds.filter( ( id ) => ! nextFields.includes( id ) )
		);
		setView( {
			...nextView,
			// Saved optional columns not loaded yet keep their place for when they are.
			fields: [
				...nextFields,
				...view.fields.filter(
					( id ) => ! fieldIds.includes( id ) && ! nextFields.includes( id )
				),
			],
		} );
	};

	return (
		<div className="bbpa-report-panel">
			<div
				ref={ explorerRef }
				className={ `bbpa-acquisition-explorer${
					selectedRow ? ' has-channel-details' : ''
				}` }
			>
				<BpaCard
					className="bbpa-dataviews-card"
					bodyClassName="bbpa-listing-region bbpa-dataviews"
				>
					<div className="bbpa-report-dataview bbpa-report-dataview--acquisition">
						<ListDataViews
							title={ __( 'Acquisition channels', 'bimbeau-privacy-analytics' ) }
							notice={
								error ? (
									<DataState isLoading={ false } error={ error } isEmpty={ false } />
								) : null
							}
							view={ { ...view, fields: visibleFields } }
							onChangeView={ onChangeView }
							columnsStorageId={ ACQUISITION_COLUMNS_STORAGE_ID }
							fields={ fields }
							data={ error ? [] : shownRows }
							isLoading={ isLoading }
							getItemId={ ( item ) => item.key || item.label }
							isItemClickable={ ( item ) => Boolean( item.key ) }
							renderItemLink={ renderChannelButton }
							paginationInfo={ paginationInfo }
							defaultLayouts={ { table: {} } }
							search={ false }
							config={ { perPageSizes: [ 10, 20, 50 ] } }
							empty={
								<p className="bbpa-report-dataview__empty">
									{ __(
										'No acquisition channel data is available for this period.',
										'bimbeau-privacy-analytics'
									) }
								</p>
							}
							header={
								<ReportExportAction
									report="acquisition-channels"
									params={ range }
									totalItems={ rows.length }
								/>
							}
						/>
						{ ! isLoading && ! error && rows.length > 0 ? (
							<div className="bbpa-dataviews__footer">
								<p className="description">
									{ sprintf(
										/* translators: %s: Total visits in the selected range. */
										__( 'Total visits: %s', 'bimbeau-privacy-analytics' ),
										formatNumber( total )
									) }
								</p>
								<p className="description">
									{ __(
										'Select a channel to see where its visits come from.',
										'bimbeau-privacy-analytics'
									) }
								</p>
								{  }
							</div>
						) : null }
					</div>
				</BpaCard>
				{ selectedRow ? (
					<ChannelDetails
						ref={ detailsRef }
						id={ CHANNEL_DETAILS_ID }
						channel={ selectedRow }
						previousVisits={
							isComparisonLoading || ! comparisonData
								? null
								: comparisonByKey.get( selectedRow.key ) ?? 0
						}
						sources={ selectedSources }
						isLoading={ ! sourcesData && ( isSourcesLoading || ! hasOpenedSources ) }
						error={ sourcesError }
						isPartial={ isSourcesPartial }
						onClose={ closeDetails }
					/>
				) : null }
			</div>
			{  }
		</div>
	);
};

export default AcquisitionPanel;
