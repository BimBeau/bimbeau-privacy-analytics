import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import ListDataViews from '../ListDataViews';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../DataState';
import ReferrerLabel from '../ReferrerLabel';
import {
	normalizeReferrerHost,
	useReferrerFavicons,
} from '../ReferrerLabel/faviconCache';
import ReportExportAction from '../ReportExportAction';
import BrandIcon from '../icons/BrandIcon';
import { ADMIN_CONFIG } from '../../constants';
import {
	getCountryFlagClass,
	getCountryLabel,
	isUnknownCountryCode,
} from '../../lib/countryNames';
import { formatScreenResolution } from '../../lib/formatScreenResolution';
import { formatWpDateTime, normalizeUnixTimestampSeconds } from '../../lib/date';
import { getLocationLabel } from '../../lib/locationLabel';
import { formatDeviceClassLabel } from '../../lib/deviceClassLabel';
import { CHANNEL_LABELS, getChannelLabel } from '../../lib/channelLabels';
import { formatHiddenPrivateCount } from '../../lib/paginationLabels';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';


const UNKNOWN_LABEL = __( 'Unknown', 'bimbeau-privacy-analytics' );
const UNKNOWN_COUNTRY_LABEL = __( 'Unknown country', 'bimbeau-privacy-analytics' );
const NO_AVAILABLE_LABEL = __( 'No available', 'bimbeau-privacy-analytics' );
const PRIVATE_LABEL = __( 'Private', 'bimbeau-privacy-analytics' );
const MUTED_PLACEHOLDER_LABELS = new Set( [
	NO_AVAILABLE_LABEL,
	UNKNOWN_LABEL,
	UNKNOWN_COUNTRY_LABEL,
] );

/** Filter values of the "Data" field: consented visitors only. */
export const DATA_SCOPE_ENRICHED = 'enriched';

/**
 * View field id → `orderby` key of the visitors route. Fields missing here cannot be sorted.
 */
const SORT_KEYS = {
	visitor: 'visitor',
	country: 'country',
	city: 'city',
	first_view: 'first_view',
	last_view: 'last_view',
	time_spent: 'time_spent',
	page_views: 'pages',
	referrer: 'referrer',
	channel: 'source_category',
	os: 'os',
	browser: 'browser',
	device: 'device',
	resolution: 'resolution',
};

const DEVICE_FILTER_ELEMENTS = [ 'desktop', 'mobile', 'tablet' ].map(
	( value ) => ( { value, label: formatDeviceClassLabel( value, value ) } )
);

const CHANNEL_FILTER_ELEMENTS = Object.entries( CHANNEL_LABELS ).map(
	( [ value, label ] ) => ( { value, label } )
);

const formatVisitTime = ( timestamp ) => {
	const parsedTimestamp = Number( timestamp );
	if ( ! Number.isFinite( parsedTimestamp ) || parsedTimestamp <= 0 ) {
		return UNKNOWN_LABEL;
	}
	const normalizedTimestamp = normalizeUnixTimestampSeconds( parsedTimestamp );

	return normalizedTimestamp === null
		? UNKNOWN_LABEL
		: formatWpDateTime( normalizedTimestamp, UNKNOWN_LABEL );
};

export const formatTimeSpent = ( timeSpentMs ) => {
	const totalMilliseconds = Number( timeSpentMs );
	if ( ! Number.isFinite( totalMilliseconds ) || totalMilliseconds <= 0 ) {
		return __( '0s', 'bimbeau-privacy-analytics' );
	}
	const totalSeconds = Math.floor( totalMilliseconds / 1000 );
	const hours = Math.floor( totalSeconds / 3600 );
	const minutes = Math.floor( ( totalSeconds % 3600 ) / 60 );
	const seconds = totalSeconds % 60;
	if ( hours > 0 ) {
		return `${ hours }h ${ String( minutes ).padStart( 2, '0' ) }m ${ String(
			seconds
		).padStart( 2, '0' ) }s`;
	}
	if ( minutes > 0 ) {
		return `${ minutes }m ${ String( seconds ).padStart( 2, '0' ) }s`;
	}

	return `${ seconds }s`;
};

export const formatVisitorHash = ( hash ) => {
	if ( typeof hash !== 'string' ) {
		return '';
	}
	const normalizedHash = hash.trim();

	return normalizedHash.length <= 10
		? normalizedHash
		: `${ normalizedHash.slice( 0, 10 ) }…`;
};

const maybeUnavailable = ( label ) =>
	MUTED_PLACEHOLDER_LABELS.has( label ) ? (
		<span className="bbpa-label--unavailable">{ label }</span>
	) : (
		label
	);

const isPrivateVisitor = ( item ) => item?.has_enriched_data === false;

const PrivateLabel = () => (
	<span className="bbpa-private-label">{ PRIVATE_LABEL }</span>
);

/** Wraps a consented-only cell: private visitors show "Private". */
const consentedOnly = ( render ) => {
	const ConsentedCell = ( { item } ) =>
		isPrivateVisitor( item ) ? <PrivateLabel /> : render( item );

	return ConsentedCell;
};

const BrandCell = ( { kind, value, label } ) => (
	<span className="bbpa-brand-label">
		<BrandIcon kind={ kind } value={ value } className="bbpa-brand-icon" />
		<span>{ maybeUnavailable( label ) }</span>
	</span>
);

const CountryCell = ( { item } ) => {
	const countryCode = String( item.country_code || '' ).toLowerCase();
	const flagClass = getCountryFlagClass( countryCode );
	const hasCountry = ! isUnknownCountryCode( countryCode ) && flagClass;
	const label = item.country || UNKNOWN_COUNTRY_LABEL;

	return (
		<span className="bbpa-country-label">
			<span
				className={
					hasCountry
						? `bbpa-country-flag ${ flagClass }`
						: 'bbpa-country-flag bbpa-country-flag--unknown'
				}
				role="img"
				aria-label={ hasCountry ? label : UNKNOWN_COUNTRY_LABEL }
			/>
			<span>{ maybeUnavailable( label ) }</span>
		</span>
	);
};

/**
 * Fields of the visitors list, in the DataViews field format.
 *
 * @param {Object}   options
 * @param {boolean}  options.isBotList     Robots list (activity fields only).
 * @param {boolean}  options.showCity      Whether the City field exists (Pro).
 * @param {Array}    options.countries     `{ value, label }` country filter elements.
 * @param {boolean}  options.canFilterData Whether the "Data" filter (consented visitors) is offered.
 * @param {Function} options.getFavicon    Favicon of a referrer host.
 * @return {Array} DataViews fields.
 */
export const getVisitorFields = ( {
	isBotList = false,
	showCity = false,
	countries = [],
	canFilterData = false,
	getFavicon = () => undefined,
} = {} ) => {
	const visitorField = {
		id: 'visitor',
		label: __( 'Visitor ID hash', 'bimbeau-privacy-analytics' ),
		enableHiding: false,
		getValue: ( { item } ) => item.visitor_id || '',
		render: ( { item } ) =>
			item.visitor_id ? (
				<code title={ item.visitor_id }>
					{ formatVisitorHash( item.visitor_id ) }
				</code>
			) : (
				'—'
			),
	};
	const firstViewField = {
		id: 'first_view',
		label: __( 'Connection time', 'bimbeau-privacy-analytics' ),
		getValue: ( { item } ) => Number( item.first_view_at ) || 0,
		render: isBotList
			? ( { item } ) => formatVisitTime( item.first_view_at )
			: consentedOnly( ( item ) => formatVisitTime( item.first_view_at ) ),
	};
	const pageViewsField = {
		id: 'page_views',
		label: __( 'Page views', 'bimbeau-privacy-analytics' ),
		type: 'integer',
		getValue: ( { item } ) => Number( item.page_views ) || 0,
		render: ( { item } ) => item.page_views || 0,
	};
	const deviceField = {
		id: 'device',
		label: __( 'Device', 'bimbeau-privacy-analytics' ),
		getValue: ( { item } ) => item.device_class || '',
		render: ( { item } ) => (
			<BrandCell
				kind="device"
				value={ item.device_class }
				label={ formatDeviceClassLabel( item.device_class, UNKNOWN_LABEL ) }
			/>
		),
		...( isBotList
			? { filterBy: false }
			: {
					elements: DEVICE_FILTER_ELEMENTS,
					filterBy: { operators: [ 'is' ] },
			  } ),
	};

	if ( isBotList ) {
		return withServerFilters( [
			{
				id: 'robot',
				label: __( 'Robot', 'bimbeau-privacy-analytics' ),
				// Robot rows carry the robot family name ("Googlebot") in `browser`.
				getValue: ( { item } ) => item.browser || '',
				render: ( { item } ) => (
					<BrandCell
						kind="device"
						value="bot"
						label={
							item.browser ||
							__( 'Unidentified robot', 'bimbeau-privacy-analytics' )
						}
					/>
				),
				enableHiding: false,
				enableSorting: false,
			},
			{ ...visitorField, enableHiding: true },
			firstViewField,
			{
				id: 'last_view',
				label: __( 'Last activity', 'bimbeau-privacy-analytics' ),
				getValue: ( { item } ) => Number( item.last_view_at ) || 0,
				render: ( { item } ) => formatVisitTime( item.last_view_at ),
			},
			pageViewsField,
			{
				id: 'entry_page',
				label: __( 'Entry page', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				getValue: ( { item } ) => item.entry_page || '',
				render: ( { item } ) =>
					item.entry_page ? (
						<code>{ item.entry_page }</code>
					) : (
						maybeUnavailable( UNKNOWN_LABEL )
					),
			},
			deviceField,
		] );
	}

	const fields = [
		visitorField,
		{
			id: 'country',
			label: __( 'Country', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) =>
				String( item.country_code || '' ).toUpperCase(),
			render: consentedOnly( ( item ) => <CountryCell item={ item } /> ),
			...( countries.length
				? { elements: countries, filterBy: { operators: [ 'is' ] } }
				: { filterBy: false } ),
		},
	];

	if ( showCity ) {
		fields.push( {
			id: 'city',
			label: __( 'City', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.city || '',
			render: consentedOnly( ( item ) =>
				maybeUnavailable( getLocationLabel( item ) )
			),
		} );
	}

	fields.push(
		firstViewField,
		{
			id: 'time_spent',
			label: __( 'Active time', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => Number( item.active_time_ms ) || 0,
			render: consentedOnly( ( item ) => formatTimeSpent( item.active_time_ms ) ),
		},
		pageViewsField,
		{
			id: 'referrer',
			label: __( 'Referrer', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.referrer_domain || '',
			render: consentedOnly( ( item ) => (
				<ReferrerLabel
					domain={ item.referrer_domain || '' }
					label={
						item.referrer_domain ||
						__( 'Direct', 'bimbeau-privacy-analytics' )
					}
					favicon={
						item.favicon ||
						getFavicon( normalizeReferrerHost( item.referrer_domain || '' ) )
					}
				/>
			) ),
		},
		{
			id: 'channel',
			label: __( 'Entry channel', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.source_category || '',
			render: consentedOnly( ( item ) =>
				maybeUnavailable(
					item.source_category
						? getChannelLabel( item.source_category )
						: UNKNOWN_LABEL
				)
			),
			elements: CHANNEL_FILTER_ELEMENTS,
			filterBy: { operators: [ 'is' ] },
		},
		{
			id: 'os',
			label: __( 'Operating system', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.operating_system || '',
			render: consentedOnly( ( item ) => (
				<BrandCell
					kind="os"
					value={ item.operating_system }
					label={ item.operating_system || UNKNOWN_LABEL }
				/>
			) ),
		},
		{
			id: 'browser',
			label: __( 'Browser', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.browser || '',
			render: consentedOnly( ( item ) => (
				<BrandCell
					kind="browser"
					value={ item.browser }
					label={ item.browser || UNKNOWN_LABEL }
				/>
			) ),
		},
		{
			id: 'browser_version',
			label: __( 'Browser version', 'bimbeau-privacy-analytics' ),
			enableSorting: false,
			getValue: ( { item } ) => item.browser_version || '',
			render: consentedOnly( ( item ) =>
				maybeUnavailable( item.browser_version || UNKNOWN_LABEL )
			),
		},
		deviceField,
		{
			id: 'resolution',
			label: __( 'Resolution', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.screen_resolution || '',
			render: consentedOnly( ( item ) =>
				maybeUnavailable(
					formatScreenResolution( item.screen_resolution ) || UNKNOWN_LABEL
				)
			),
		}
	);

	if ( canFilterData ) {
		// A filter-only field: the chip "Data: Consented visitors" stays visible like a primary filter.
		fields.push( {
			id: 'data',
			label: __( 'Data', 'bimbeau-privacy-analytics' ),
			enableHiding: false,
			enableSorting: false,
			getValue: ( { item } ) =>
				isPrivateVisitor( item ) ? 'private' : DATA_SCOPE_ENRICHED,
			elements: [
				{
					value: DATA_SCOPE_ENRICHED,
					label: __( 'Consented visitors', 'bimbeau-privacy-analytics' ),
				},
			],
			filterBy: { operators: [ 'is' ], isPrimary: true },
		} );
	}

	return withServerFilters( fields );
};

/**
 * Only the filters applied by the visitors route stay available: DataViews makes the other fields
 * filterable by default ("contains" on text fields), which the server would ignore.
 *
 * @param {Array} fields DataViews fields.
 * @return {Array} Fields with `filterBy: false` unless set.
 */
const withServerFilters = ( fields ) =>
	fields.map( ( field ) =>
		'filterBy' in field ? field : { ...field, filterBy: false }
	);

/**
 * Builds the visitors route parameters of a DataViews view.
 *
 * @param {Object}  view      DataViews view.
 * @param {boolean} isBotList Robots list.
 * @return {Object} `orderby`, `order`, `search` and filter parameters.
 */
export const getVisitorRequestParams = ( view, isBotList = false ) => {
	const params = {
		orderby: SORT_KEYS[ view?.sort?.field ] || 'first_view',
		order: view?.sort?.direction === 'asc' ? 'asc' : 'desc',
		search: String( view?.search || '' ).trim(),
	};

	( view?.filters || [] ).forEach( ( filter ) => {
		const value = Array.isArray( filter?.value )
			? filter.value[ 0 ]
			: filter?.value;
		if ( ! value || isBotList ) {
			return;
		}
		if ( filter.field === 'country' ) {
			params.country_code = String( value ).toUpperCase();
		} else if ( filter.field === 'device' ) {
			params.device_class = value;
		} else if ( filter.field === 'channel' ) {
			params.source_category = value;
		} else if ( filter.field === 'data' && value === DATA_SCOPE_ENRICHED ) {
			params.data_scope = DATA_SCOPE_ENRICHED;
		}
	} );

	return params;
};

const isDataFilterActive = ( filters = [] ) =>
	filters.some(
		( filter ) =>
			filter?.field === 'data' &&
			( Array.isArray( filter.value )
				? filter.value.includes( DATA_SCOPE_ENRICHED )
				: filter.value === DATA_SCOPE_ENRICHED )
	);

const getDefaultView = ( { isBotList, showCity, hidePrivateVisitors } ) => ( {
	type: 'table',
	page: 1,
	perPage: 10,
	search: '',
	sort: { field: 'first_view', direction: 'desc' },
	filters: hidePrivateVisitors
		? [ { field: 'data', operator: 'is', value: DATA_SCOPE_ENRICHED } ]
		: [],
	titleField: isBotList ? 'robot' : 'visitor',
	fields: isBotList
		? [ 'visitor', 'first_view', 'last_view', 'page_views', 'entry_page' ]
		: [
				'country',
				...( showCity ? [ 'city' ] : [] ),
				'first_view',
				'time_spent',
				'page_views',
				'referrer',
				'channel',
				'os',
				'browser',
				'browser_version',
				'device',
				'resolution',
		  ],
	// Numbers aligned to the start, under their header (mockups).
	layout: { styles: { page_views: { align: 'start' } } },
} );

/**
 * Visitors or robots list in the WordPress DataViews layout: search, filters
 * as chips (country, device, channel, consented data), view options (sort,
 * order, items per page, visible properties), export and pagination. Sorting,
 * filtering and paging run on the server, so the totals and the export match.
 *
 * @param {Object}   props
 * @param {Object}   props.range                       `{ start, end }` reporting range.
 * @param {Object}   props.requestParams               Fixed route parameters (`visitor_type`, `page_path`).
 * @param {boolean}  props.showCity                    Whether the City field is shown (Pro).
 * @param {boolean}  props.hidePrivateVisitors         Saved "consented only" preference.
 * @param {Function} props.onHidePrivateVisitorsChange Saves the preference; omitted to hide the Data filter.
 * @param {string}   props.emptyLabel                  Message without rows.
 * @param {string}   props.loadingLabel                Accessible loading message.
 */
const VisitorsDataView = ( {
	range,
	requestParams = {},
	showCity = false,
	hidePrivateVisitors = false,
	onHidePrivateVisitorsChange,
	emptyLabel = __( 'No visitor data available.', 'bimbeau-privacy-analytics' ),
	loadingLabel = __( 'Loading visitors…', 'bimbeau-privacy-analytics' ),
} ) => {
	registerDataViewsTranslations();

	const isBotList = requestParams.visitor_type === 'bot';
	const canFilterData =
		! isBotList && typeof onHidePrivateVisitorsChange === 'function';
	const [ view, setView ] = useState( () =>
		getDefaultView( {
			isBotList,
			showCity,
			hidePrivateVisitors: canFilterData && hidePrivateVisitors,
		} )
	);

	// A new range or list starts on the first page.
	useEffect( () => {
		setView( ( current ) => ( { ...current, page: 1 } ) );
	}, [ range.start, range.end, requestParams.page_path, requestParams.visitor_type ] );

	const { data: countriesData } = useAdminEndpoint(
		'/geo-countries',
		{ ...range, per_page: 250, orderby: 'visitors', order: 'desc' },
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: ! isBotList,
		}
	);
	const countries = useMemo( () => {
		const rows = Array.isArray( countriesData?.items )
			? countriesData.items
			: [];
		const seen = new Set();

		return rows.reduce( ( elements, row ) => {
			const code = String( row?.country_code || row?.code || '' ).toUpperCase();
			if ( ! /^[A-Z]{2}$/.test( code ) || seen.has( code ) ) {
				return elements;
			}
			seen.add( code );
			elements.push( {
				value: code,
				label: row?.country || getCountryLabel( code ) || code,
			} );

			return elements;
		}, [] );
	}, [ countriesData ] );

	const viewParams = getVisitorRequestParams( view, isBotList );
	const { data, isLoading, error } = useAdminEndpoint(
		'/visitors',
		{
			...range,
			...requestParams,
			...viewParams,
			page: view.page,
			per_page: view.perPage,
		},
		{ namespace: ADMIN_CONFIG?.settings?.restNamespace }
	);

	const items = useMemo( () => data?.items || [], [ data ] );
	const pagination = data?.pagination || {};
	const totalItems = Number( pagination.totalItems ) || items.length;
	const totalPages = Math.max( 1, Number( pagination.totalPages ) || 1 );
	const hiddenPrivateItems = viewParams.data_scope
		? Math.max( 0, Number( data?.hiddenPrivateItems ) || 0 )
		: 0;

	const faviconsEnabled = Boolean(
		ADMIN_CONFIG?.settings?.referrer_favicons_enabled
	);
	const favicons = useReferrerFavicons(
		items.map( ( item ) => item.referrer_domain || '' ),
		faviconsEnabled && ! isBotList,
		items.map( ( item ) => item.favicon )
	);

	const fields = useMemo(
		() =>
			getVisitorFields( {
				isBotList,
				showCity,
				countries,
				canFilterData,
				getFavicon: ( host ) => favicons.get( host ),
			} ),
		[ isBotList, showCity, countries, canFilterData, favicons ]
	);

	const onChangeView = ( nextView ) => {
		const filtersChanged = nextView.filters !== view.filters;
		const searchChanged = nextView.search !== view.search;
		const sortChanged =
			nextView.sort?.field !== view.sort?.field ||
			nextView.sort?.direction !== view.sort?.direction;
		const perPageChanged = nextView.perPage !== view.perPage;
		setView(
			filtersChanged || searchChanged || sortChanged || perPageChanged
				? { ...nextView, page: 1 }
				: nextView
		);

		if ( canFilterData && filtersChanged ) {
			const nextHidePrivate = isDataFilterActive( nextView.filters );
			if ( nextHidePrivate !== isDataFilterActive( view.filters ) ) {
				onHidePrivateVisitorsChange( nextHidePrivate );
			}
		}
	};

	const resolvedEmptyLabel = viewParams.data_scope
		? __(
				'No visitor with advanced data for this period. Private visitors are hidden.',
				'bimbeau-privacy-analytics'
		  )
		: emptyLabel;

	return (
		<div className="bbpa-visitors-dataview">
			{ error ? (
				<DataState
					isLoading={ false }
					error={ error }
					isEmpty={ false }
					loadingLabel={ loadingLabel }
				/>
			) : null }
			<ListDataViews
				view={ view }
				onChangeView={ onChangeView }
				fields={ fields }
				data={ error ? [] : items }
				isLoading={ isLoading }
				getItemId={ ( item ) =>
					`${ item.visitor_id || 'visitor' }-${ item.first_view_at || '' }`
				}
				paginationInfo={ { totalItems, totalPages } }
				defaultLayouts={ { table: {} } }
				searchLabel={ __( 'Search visitors', 'bimbeau-privacy-analytics' ) }
				config={ { perPageSizes: [ 5, 10, 20, 50, 100 ] } }
				empty={ <p className="bbpa-visitors-dataview__empty">{ resolvedEmptyLabel }</p> }
				header={
					<ReportExportAction
						report="visitors"
						params={ {
							...range,
							...requestParams,
							...viewParams,
						} }
						totalItems={ totalItems }
					/>
				}
			/>
			{ hiddenPrivateItems > 0 ? (
				<p className="bbpa-visitors-dataview__meta">
					{ formatHiddenPrivateCount( hiddenPrivateItems ) }
				</p>
			) : null }
		</div>
	);
};

export default VisitorsDataView;
