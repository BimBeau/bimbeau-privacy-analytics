import { useEffect, useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { Button, Tooltip } from '@wordpress/components';
import ListDataViews, { getInitialListColumns } from '../ListDataViews';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import BrandNotice from '../BrandNotice';
import DataState from '../DataState';
import FeatureIcon from '../icons/FeatureIcon';
import MetricTrend from '../MetricTrend';
import MiniSparkline, { getSeriesMaxValue } from '../MiniSparkline';
import PageTitle from '../PageTitle';
import ReportExportAction from '../ReportExportAction';
import {
	normalizeReferrerHost,
	useReferrerFavicons,
} from '../ReferrerLabel/faviconCache';
import {
	ADMIN_CONFIG,
	DEFAULT_PAGE_LABEL_DISPLAY,
	normalizeBooleanSetting,
} from '../../constants';
import useSharedPageLabelDisplay from '../../hooks/useSharedPageLabelDisplay';
import { decodeHtmlEntities, formatNumber } from '../../lib/formatters';
import { DATAVIEWS_PER_PAGE_SIZES } from '../../lib/dataviewsConfig';
import { formatDateStringForLocale, getPreviousRange } from '../../lib/date';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';


// Rows loaded at once when a list searches in the browser (the API accepts up to 1000).
const BROWSER_SEARCH_MAX_ITEMS = 1000;

// Case and accent insensitive comparison for browser searches ("etats" finds "États-Unis").
const normalizeSearchText = ( value ) =>
	String( value || '' )
		.normalize( 'NFD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.toLowerCase()
		.trim();

export const LABEL_FIELD = 'label';
export const PAGE_TITLE_FIELD = 'page_title';
// Change against the previous period and daily series of the main metric, in their own columns.
export const CHANGE_FIELD = 'change';
export const SERIES_FIELD = 'trend';
// Picture next to the label (an author avatar), in the DataViews media slot of the primary column.
export const MEDIA_FIELD = 'media';
// Second line under the label (the role of an author), in the DataViews description slot.
export const DESCRIPTION_FIELD = 'description';

export const truncateDisplayedLabel = ( value, maxLength ) => {
	const text = typeof value === 'string' ? value : String( value || '' );
	const characters = Array.from( text );

	if ( ! maxLength || characters.length <= maxLength ) {
		return text;
	}

	if ( maxLength <= 3 ) {
		return '.'.repeat( maxLength );
	}

	return `${ characters.slice( 0, maxLength - 3 ).join( '' ) }...`;
};

/**
 * Column header with an optional help tooltip. The header sits inside the column menu button,
 * so the help icon is not focusable: its text is also given as the field description.
 *
 * @param {Object} props          Component props.
 * @param {string} props.label    Column label.
 * @param {string} props.helpText Help text.
 */
const HeaderWithHelp = ( { label, helpText } ) => (
	<Tooltip text={ helpText }>
		<span className="bbpa-report-table__metric-header">
			<span>{ label }</span>
			<span
				className="dashicons dashicons-editor-help"
				aria-hidden="true"
			/>
		</span>
	</Tooltip>
);

const withHelp = ( field, helpText ) =>
	helpText
		? {
				...field,
				header: <HeaderWithHelp label={ field.label } helpText={ helpText } />,
				description: helpText,
		  }
		: field;

/**
 * Server sort key of a DataViews sort field.
 *
 * @param {Object}   view          DataViews view.
 * @param {string}   metricKey     Sort key of the metric.
 * @param {string[]} extraSortKeys Other fields the endpoint sorts by.
 * @return {{orderby: string, order: string}} Sort parameters.
 */
export const getReportSortParams = ( view, metricKey, extraSortKeys = [] ) => {
	const field = view?.sort?.field;
	const orderby = [
		LABEL_FIELD,
		PAGE_TITLE_FIELD,
		metricKey,
		...extraSortKeys,
	].includes( field )
		? field
		: metricKey;

	return {
		orderby,
		order: view?.sort?.direction === 'asc' ? 'asc' : 'desc',
	};
};

/**
 * Page label display ("url" or "title") matching the visible label fields, or null when it
 * does not change.
 *
 * @param {string[]} visibleFields Visible field ids.
 * @return {string|null} Display mode.
 */
export const getPageLabelDisplayFromFields = ( visibleFields = [] ) => {
	const showsUrl = visibleFields.includes( LABEL_FIELD );
	const showsTitle = visibleFields.includes( PAGE_TITLE_FIELD );

	if ( showsTitle && ! showsUrl ) {
		return 'title';
	}

	if ( showsUrl && ! showsTitle ) {
		return 'url';
	}

	return null;
};

const getVisibleFields = ( {
	supportsPageLabelToggle,
	pageLabelDisplay,
	metricKey,
	metricColumnIds = [],
	extraFieldIds = [],
	extraMetricValueKey,
} ) => {
	const labelFields = ! supportsPageLabelToggle
		? [ LABEL_FIELD ]
		: [ pageLabelDisplay === 'title' ? PAGE_TITLE_FIELD : LABEL_FIELD ];

	return [
		...labelFields,
		metricKey,
		...metricColumnIds,
		...extraFieldIds,
		...( extraMetricValueKey ? [ extraMetricValueKey ] : [] ),
	];
};

/**
 * Visible columns of a report list: the columns saved by the user (`columnsStorageId`) or the
 * default ones. A page list keeps one label column (URL or title).
 *
 * @param {Object}   options
 * @param {string}   options.columnsStorageId        Identifier of the saved columns.
 * @param {boolean}  options.supportsPageLabelToggle Whether the URL and Title columns exist.
 * @param {string}   options.pageLabelDisplay        Shared page label display (`url`, `title`).
 * @param {string}   options.metricKey               Main metric field id.
 * @param {string[]} options.metricColumnIds         Change and series column ids, when shown.
 * @param {string[]} options.extraFieldIds           Extra column ids.
 * @param {string}   options.extraMetricValueKey     Extra metric field id, or empty.
 * @param {boolean}  options.hasOpenField            Whether the Open column exists.
 * @return {string[]} Visible field ids.
 */
export const getInitialReportFields = ( {
	columnsStorageId,
	supportsPageLabelToggle,
	pageLabelDisplay,
	metricKey,
	metricColumnIds = [],
	extraFieldIds = [],
	extraMetricValueKey,
	hasOpenField = false,
} ) => {
	const defaultFields = getVisibleFields( {
		supportsPageLabelToggle,
		pageLabelDisplay,
		metricKey,
		metricColumnIds,
		extraFieldIds,
		extraMetricValueKey,
	} );
	// Same order and hiding rules as the field definitions of the list.
	const fields = getInitialListColumns( columnsStorageId, defaultFields, [
		{ id: LABEL_FIELD, enableHiding: supportsPageLabelToggle },
		...( supportsPageLabelToggle ? [ { id: PAGE_TITLE_FIELD } ] : [] ),
		{ id: metricKey, enableHiding: false },
		...metricColumnIds.map( ( id ) => ( { id } ) ),
		...extraFieldIds.map( ( id ) => ( { id } ) ),
		...( extraMetricValueKey ? [ { id: extraMetricValueKey } ] : [] ),
		...( hasOpenField ? [ { id: 'open', enableHiding: false } ] : [] ),
	] );

	if (
		supportsPageLabelToggle &&
		! fields.includes( LABEL_FIELD ) &&
		! fields.includes( PAGE_TITLE_FIELD )
	) {
		return [ defaultFields[ 0 ], ...fields ];
	}

	return fields;
};

/**
 * Report list (one label column and one or two metric columns) rendered with the WordPress
 * DataViews component: search, sort, page size, visible columns, server pagination and export.
 *
 * Shared by Free and Pro; the props are the ones of ReportTableCard.
 */
const ReportDataView = ( {
	title,
	// Card title shown in the toolbar row, when the list heads its card (see ListDataViews).
	cardTitle = '',
	labelHeader,
	range,
	endpoint,
	emptyLabel,
	emptyStateNoticeStatus,
	labelFallback,
	formatLabel,
	renderLabel,
	metricLabel = __( 'Page views', 'bimbeau-privacy-analytics' ),
	metricKey = 'hits',
	metricValueKey = 'hits',
	supportsPageLabelToggle = false,
	enableSearch = true,
	onRowClick,
	rowActionLabel,
	getRowHref,
	requestParams = {},
	showMetricTrend = false,
	// Narrow cards (dashboard): the change stays in the metric cell instead of its own column.
	inlineMetricChange = false,
	getComparisonKey,
	extraMetricLabel = '',
	extraMetricHelpText = '',
	extraMetricValueKey = '',
	formatExtraMetricValue,
	metricHelpText = '',
	metricFallbackValueKey = '',
	metricFallbackBadgeLabel = '',
	hideZeroPrimaryRows = false,
	exportReportKey = '',
	showOpenButton = true,
	metricSeriesKey = '',
	renderMetricAccessory,
	loadReferrerFavicons = false,
	maxDisplayedLabelCharacters = null,
	getRowClassName,
	footnote = '',
	// More columns after the metric: [ { id, label, getValue( item ), render( item, rows ), sortable } ],
	// `rows` being the raw items of the displayed page (a share bar scales to the largest one).
	extraFields = [],
	// Search in the browser, on the displayed label (formatLabel) and the raw label, for endpoints
	// that do not filter (countries: names are translated in the browser). Short lists only.
	searchInBrowser = false,
	// Identifier of the saved columns; defaults to one per endpoint (`report_top-pages`).
	columnsStorageId = '',
	// Picture before the label: { label, render( item ), round }. The label then becomes the
	// DataViews title field and the picture its media field (shown or hidden from View options).
	mediaField = null,
	// Second line under the label: { label, render( item ) }, the DataViews description field.
	descriptionField = null,
} ) => {
	registerDataViewsTranslations();

	const resolvedExtraMetricKey = extraMetricLabel ? extraMetricValueKey : '';
	const metricColumnIds = [
		...( showMetricTrend && ! inlineMetricChange ? [ CHANGE_FIELD ] : [] ),
		...( metricSeriesKey ? [ SERIES_FIELD ] : [] ),
	];
	const [ pageLabelDisplay, setPageLabelDisplay ] =
		useSharedPageLabelDisplay();
	const resolvedColumnsStorageId =
		columnsStorageId ||
		`report_${ String( endpoint || '' ).replace( /^\/+/, '' ) }`;
	const [ view, setView ] = useState( () => ( {
		type: 'table',
		page: 1,
		perPage: 10,
		search: '',
		sort: { field: metricKey, direction: 'desc' },
		filters: [],
		fields: getInitialReportFields( {
			columnsStorageId: resolvedColumnsStorageId,
			supportsPageLabelToggle,
			pageLabelDisplay,
			metricKey,
			metricColumnIds,
			extraFieldIds: extraFields.map( ( field ) => field.id ),
			extraMetricValueKey: resolvedExtraMetricKey,
			hasOpenField: showOpenButton && typeof getRowHref === 'function',
		} ),
		// Numbers are aligned to the end, with their header, so that digits line up.
		layout: {
			styles: {
				[ metricKey ]: { align: 'end' },
				[ CHANGE_FIELD ]: { align: 'end' },
				...Object.fromEntries(
					extraFields.map( ( field ) => [ field.id, { align: 'end' } ] )
				),
				...( resolvedExtraMetricKey
					? { [ resolvedExtraMetricKey ]: { align: 'end' } }
					: {} ),
			},
		},
	} ) );

	// A new range or report starts on the first page.
	useEffect( () => {
		setView( ( current ) => ( { ...current, page: 1 } ) );
	}, [ range.start, range.end, endpoint, requestParams.dimension, requestParams.page_path ] );

	// The display mode is shared by the page lists: follow a change made in another list.
	useEffect( () => {
		if ( ! supportsPageLabelToggle ) {
			return;
		}

		setView( ( current ) => {
			if (
				getPageLabelDisplayFromFields( current.fields ) === null ||
				getPageLabelDisplayFromFields( current.fields ) === pageLabelDisplay
			) {
				return current;
			}

			const nextLabel =
				pageLabelDisplay === 'title' ? PAGE_TITLE_FIELD : LABEL_FIELD;
			const fields = current.fields.map( ( id ) =>
				id === LABEL_FIELD || id === PAGE_TITLE_FIELD ? nextLabel : id
			);
			const sortField = current.sort?.field;

			return {
				...current,
				fields,
				sort:
					sortField === LABEL_FIELD || sortField === PAGE_TITLE_FIELD
						? { ...current.sort, field: nextLabel }
						: current.sort,
			};
		} );
	}, [ pageLabelDisplay, supportsPageLabelToggle ] );

	const search = enableSearch ? String( view.search || '' ).trim() : '';
	const sortParams = getReportSortParams(
		view,
		metricKey,
		extraFields.filter( ( field ) => field.sortable ).map( ( field ) => field.id )
	);
	const listParams = {
		...range,
		...requestParams,
		...( hideZeroPrimaryRows ? { exclude_zero: true } : {} ),
		...sortParams,
		search,
	};
	const isBrowserSearch = searchInBrowser && search !== '';
	const { data, isLoading, error } = useAdminEndpoint(
		endpoint,
		isBrowserSearch
			? {
					...listParams,
					search: '',
					page: 1,
					per_page: BROWSER_SEARCH_MAX_ITEMS,
			  }
			: { ...listParams, page: view.page, per_page: view.perPage },
		{ namespace: ADMIN_CONFIG?.settings?.restNamespace }
	);

	const comparisonRange = useMemo(
		() => ( showMetricTrend ? getPreviousRange( range ) : null ),
		[ showMetricTrend, range ]
	);
	const { data: comparisonData, isLoading: isComparisonLoading } =
		useAdminEndpoint(
			endpoint,
			{
				...( comparisonRange || {} ),
				...requestParams,
				page: 1,
				per_page: 100,
				orderby: metricKey,
				order: 'desc',
				search,
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
				enabled: showMetricTrend && Boolean( comparisonRange ),
			}
		);

	// Only the first rows of the previous period are loaded: a row missing from them had no value
	// only when they are the whole previous list; otherwise its previous value is unknown.
	const comparisonItemsCount = ( comparisonData?.items || [] ).length;
	const comparisonTotalItems = Number(
		comparisonData?.pagination?.totalItems ??
			comparisonData?.pagination?.total_items ??
			comparisonItemsCount
	);
	// Without a comparison response (request failed), every previous value stays unknown.
	const isComparisonComplete =
		Boolean( comparisonData ) && comparisonTotalItems <= comparisonItemsCount;

	const comparisonValuesByKey = useMemo( () => {
		const values = new Map();
		if ( ! showMetricTrend || isComparisonLoading ) {
			return values;
		}

		( comparisonData?.items || [] ).forEach( ( item ) => {
			const key =
				typeof getComparisonKey === 'function'
					? getComparisonKey( item )
					: item?.label || '';
			// An empty label is a real row (Direct in the referrer lists): compare it like the others.
			if ( typeof key === 'string' ) {
				values.set( key, Number( item?.[ metricValueKey ] || 0 ) );
			}
		} );

		return values;
	}, [
		comparisonData,
		getComparisonKey,
		isComparisonLoading,
		metricValueKey,
		showMetricTrend,
	] );

	const browserSearchMatches = useMemo( () => {
		if ( ! isBrowserSearch ) {
			return null;
		}
		const needle = normalizeSearchText( search );

		return ( data?.items || [] ).filter( ( item ) => {
			const rawLabel = decodeHtmlEntities( item?.label || '' );
			const displayed = formatLabel ? formatLabel( rawLabel, item ) : rawLabel;

			return [ rawLabel, displayed ].some( ( value ) =>
				normalizeSearchText( value ).includes( needle )
			);
		} );
	}, [ data, formatLabel, isBrowserSearch, search ] );
	const rawItems = useMemo( () => {
		if ( browserSearchMatches ) {
			const start = ( view.page - 1 ) * view.perPage;
			return browserSearchMatches.slice( start, start + view.perPage );
		}

		return data?.items || [];
	}, [ browserSearchMatches, data, view.page, view.perPage ] );
	const faviconsEnabled =
		loadReferrerFavicons &&
		normalizeBooleanSetting(
			ADMIN_CONFIG?.settings?.referrer_favicons_enabled,
			false
		);
	const favicons = useReferrerFavicons(
		rawItems.map( ( item ) => item?.label || '' ),
		faviconsEnabled,
		rawItems.map( ( item ) => item?.favicon )
	);

	const rows = useMemo(
		() =>
			rawItems.map( ( item, index ) => {
				const rawLabel = decodeHtmlEntities( item?.label || '' );
				const formattedLabel = formatLabel
					? formatLabel( rawLabel, item )
					: rawLabel;

				return {
					id: `${ rawLabel || index }-${ index }`,
					item,
					label: formattedLabel || labelFallback,
					pageTitle: decodeHtmlEntities( item?.page_title || '' ),
				};
			} ),
		[ rawItems, formatLabel, labelFallback ]
	);

	const seriesMaxValue = useMemo(
		() =>
			metricSeriesKey
				? getSeriesMaxValue(
						rawItems.map( ( item ) => item?.[ metricSeriesKey ] )
				  )
				: 0,
		[ metricSeriesKey, rawItems ]
	);

	const pagination = browserSearchMatches
		? {
				totalItems: browserSearchMatches.length,
				totalPages: Math.ceil( browserSearchMatches.length / view.perPage ),
		  }
		: data?.pagination || {};
	const totalItems =
		Number( pagination.totalItems || pagination.total_items ) || rows.length;
	const totalPages = Math.max(
		1,
		Number( pagination.totalPages || pagination.total_pages ) || 1
	);

	// A shorter list (new search or range) can end before the current page.
	useEffect( () => {
		if ( ! isLoading && ! error && view.page > totalPages ) {
			setView( ( current ) => ( { ...current, page: totalPages } ) );
		}
	}, [ isLoading, error, totalPages, view.page ] );

	// In title mode without the URL column, the address is shown under the title.
	const showsPathUnderTitle =
		supportsPageLabelToggle &&
		view.fields.includes( PAGE_TITLE_FIELD ) &&
		! view.fields.includes( LABEL_FIELD );

	const fields = useMemo( () => {
		const renderRowLabel = ( row, fullLabel, path = '' ) => {
			const visibleLabel = truncateDisplayedLabel(
				fullLabel,
				maxDisplayedLabelCharacters
			);
			const content = renderLabel
				? renderLabel(
						visibleLabel,
						row.item,
						row.item?.favicon ||
							favicons.get(
								normalizeReferrerHost( row.item?.label || '' )
							),
						fullLabel
				  )
				: visibleLabel;
			const href = typeof getRowHref === 'function' ? getRowHref( row.item ) : '';
			const isActionable = typeof onRowClick === 'function';
			const rowClassName =
				typeof getRowClassName === 'function'
					? getRowClassName( row.item ) || ''
					: '';
			const pageTitle = <PageTitle title={ fullLabel }>{ content }</PageTitle>;
			const label = path ? (
				<span className="bbpa-report-table__label-stack">
					{ pageTitle }
					<span className="bbpa-report-table__label-path">{ path }</span>
				</span>
			) : (
				pageTitle
			);
			const cell =
				! isActionable && ! href ? (
					label
				) : (
					<Button
						variant="link"
						href={ href || '#' }
						onClick={ ( event ) => {
							if ( ! isActionable ) {
								return;
							}

							event.preventDefault();
							onRowClick( row.item );
						} }
						className="bbpa-report-table__row-action bbpa-text-link"
						aria-label={ `${
							rowActionLabel ||
							__( 'Open details', 'bimbeau-privacy-analytics' )
						}: ${ fullLabel }` }
					>
						{ label }
					</Button>
				);

			return rowClassName ? (
				<span className={ rowClassName }>{ cell }</span>
			) : (
				cell
			);
		};

		const labelField = {
			id: LABEL_FIELD,
			label: supportsPageLabelToggle
				? __( 'URL', 'bimbeau-privacy-analytics' )
				: labelHeader,
			getValue: ( { item } ) => item.label,
			render: ( { item } ) => renderRowLabel( item, item.label ),
			enableHiding: supportsPageLabelToggle,
			enableSorting: true,
			filterBy: false,
		};
		const pageTitleField = {
			id: PAGE_TITLE_FIELD,
			label: __( 'Title', 'bimbeau-privacy-analytics' ),
			getValue: ( { item } ) => item.pageTitle || item.label,
			render: ( { item } ) =>
				renderRowLabel(
					item,
					item.pageTitle || item.label,
					showsPathUnderTitle && item.pageTitle && item.pageTitle !== item.label
						? item.label
						: ''
				),
			enableHiding: true,
			enableSorting: true,
			filterBy: false,
		};

		const getRowMetricValue = ( row ) =>
			row.item?.[ metricValueKey ] !== undefined
				? row.item[ metricValueKey ] ?? 0
				: ( metricFallbackValueKey && row.item?.[ metricFallbackValueKey ] ) ||
				  0;

		const renderChange = ( row ) => {
			if ( isComparisonLoading ) {
				return null;
			}

			const comparisonKey =
				typeof getComparisonKey === 'function'
					? getComparisonKey( row.item )
					: row.item?.label || '';
			let previousValue = null;
			if ( comparisonValuesByKey.has( comparisonKey ) ) {
				previousValue = comparisonValuesByKey.get( comparisonKey );
			} else if ( isComparisonComplete ) {
				previousValue = 0;
			}

			return (
				<MetricTrend
					value={ getRowMetricValue( row ) }
					previousValue={ previousValue }
				/>
			);
		};

		const metricField = withHelp(
			{
				id: metricKey,
				label: metricLabel,
				type: 'integer',
				getValue: ( { item } ) => item.item?.[ metricValueKey ],
				render: ( { item: row } ) => {
					const hasPrimaryMetric =
						row.item?.[ metricValueKey ] !== undefined;
					const value = hasPrimaryMetric
						? row.item[ metricValueKey ] ?? 0
						: ( metricFallbackValueKey &&
								row.item?.[ metricFallbackValueKey ] ) ||
						  0;

					return (
						<div className="bbpa-report-table__metric">
							<span className="bbpa-report-table__metric-value">
								{ formatNumber( Number( value ) || 0 ) }
							</span>
							{ typeof renderMetricAccessory === 'function'
								? renderMetricAccessory( row.item, row )
								: null }
							{ showMetricTrend && inlineMetricChange
								? renderChange( row )
								: null }
							{ ! hasPrimaryMetric && metricFallbackBadgeLabel ? (
								<span className="components-badge is-info">
									{ metricFallbackBadgeLabel }
								</span>
							) : null }
						</div>
					);
				},
				enableHiding: false,
				enableSorting: true,
				filterBy: false,
			},
			metricHelpText
		);

		const changeField =
			showMetricTrend && ! inlineMetricChange
				? {
						id: CHANGE_FIELD,
						label: __( 'Change', 'bimbeau-privacy-analytics' ),
						render: ( { item: row } ) => renderChange( row ),
						enableHiding: true,
						enableSorting: false,
						filterBy: false,
				  }
				: null;

		const seriesField = metricSeriesKey
			? {
					id: SERIES_FIELD,
					label: __( 'Trend', 'bimbeau-privacy-analytics' ),
					render: ( { item: row } ) => {
						const series = row.item?.[ metricSeriesKey ];

						// One point (a single day) draws no trend.
						return Array.isArray( series ) && series.length > 1 ? (
							<MiniSparkline
								series={ series }
								maxValue={ seriesMaxValue }
								filled
								width={ 96 }
								height={ 24 }
							/>
						) : null;
					},
					enableHiding: true,
					enableSorting: false,
					filterBy: false,
			  }
			: null;

		const extraField = resolvedExtraMetricKey
			? withHelp(
					{
						id: resolvedExtraMetricKey,
						label: extraMetricLabel,
						getValue: ( { item } ) => item.item?.[ resolvedExtraMetricKey ],
						render: ( { item: row } ) => {
							const value = row.item?.[ resolvedExtraMetricKey ] ?? 0;

							return typeof formatExtraMetricValue === 'function'
								? formatExtraMetricValue( value )
								: value;
						},
						enableHiding: true,
						// The report endpoints only sort by the label and the main metric.
						enableSorting: false,
						filterBy: false,
					},
					extraMetricHelpText
			  )
			: null;

		const additionalFields = extraFields.map( ( field ) => ( {
			id: field.id,
			label: field.label,
			getValue: ( { item: row } ) => field.getValue( row.item ),
			render: ( { item: row } ) =>
				field.render
					? field.render( row.item, rawItems )
					: field.getValue( row.item ),
			enableHiding: true,
			enableSorting: Boolean( field.sortable ),
			filterBy: false,
		} ) );

		const pictureField = mediaField
			? {
					id: MEDIA_FIELD,
					label: mediaField.label,
					render: ( { item: row } ) => mediaField.render( row.item ),
					enableHiding: true,
					enableSorting: false,
					filterBy: false,
			  }
			: null;

		const subtitleField = descriptionField
			? {
					id: DESCRIPTION_FIELD,
					label: descriptionField.label,
					render: ( { item: row } ) => (
						<span className="bbpa-report-table__description">
							{ descriptionField.render( row.item ) }
						</span>
					),
					enableHiding: true,
					enableSorting: false,
					filterBy: false,
			  }
			: null;

		const openField =
			showOpenButton && typeof getRowHref === 'function'
				? {
						id: 'open',
						label: __( 'Open row', 'bimbeau-privacy-analytics' ),
						header: (
							<span className="screen-reader-text">
								{ __( 'Open row', 'bimbeau-privacy-analytics' ) }
							</span>
						),
						render: ( { item: row } ) => {
							const href = getRowHref( row.item );

							return href ? (
								<Button
									variant="secondary"
									size="compact"
									href={ href }
									className="bbpa-report-table__open-button"
								>
									{ __( 'Open', 'bimbeau-privacy-analytics' ) }
								</Button>
							) : null;
						},
						enableHiding: false,
						enableSorting: false,
						filterBy: false,
				  }
				: null;

		return [
			labelField,
			...( pictureField ? [ pictureField ] : [] ),
			...( subtitleField ? [ subtitleField ] : [] ),
			...( supportsPageLabelToggle ? [ pageTitleField ] : [] ),
			metricField,
			...( changeField ? [ changeField ] : [] ),
			...( seriesField ? [ seriesField ] : [] ),
			...additionalFields,
			...( extraField ? [ extraField ] : [] ),
			...( openField ? [ openField ] : [] ),
		];
	}, [
		comparisonValuesByKey,
		extraFields,
		inlineMetricChange,
		isComparisonComplete,
		rawItems,
		seriesMaxValue,
		extraMetricHelpText,
		extraMetricLabel,
		favicons,
		formatExtraMetricValue,
		getComparisonKey,
		getRowClassName,
		getRowHref,
		isComparisonLoading,
		labelHeader,
		maxDisplayedLabelCharacters,
		descriptionField,
		mediaField,
		metricFallbackBadgeLabel,
		metricFallbackValueKey,
		metricHelpText,
		metricKey,
		metricLabel,
		metricSeriesKey,
		metricValueKey,
		onRowClick,
		renderLabel,
		renderMetricAccessory,
		resolvedExtraMetricKey,
		rowActionLabel,
		showMetricTrend,
		showOpenButton,
		showsPathUnderTitle,
		supportsPageLabelToggle,
	] );

	const viewFields =
		fields.some( ( field ) => field.id === 'open' ) &&
		! view.fields.includes( 'open' )
			? [ ...view.fields, 'open' ]
			: view.fields;
	// With a picture or a second line, they fill the DataViews primary column with the label.
	const displayedView =
		mediaField || descriptionField
			? {
					...view,
					titleField: LABEL_FIELD,
					...( mediaField ? { mediaField: MEDIA_FIELD } : {} ),
					...( descriptionField
						? { descriptionField: DESCRIPTION_FIELD }
						: {} ),
					fields: viewFields.filter(
						( id ) =>
							! [ LABEL_FIELD, MEDIA_FIELD, DESCRIPTION_FIELD ].includes( id )
					),
			  }
			: { ...view, fields: viewFields };

	const onChangeView = ( nextView ) => {
		let resolvedView = nextView;

		if ( supportsPageLabelToggle ) {
			const nextFields = nextView.fields || [];
			// One label column stays visible: hiding the last one shows the other.
			if (
				! nextFields.includes( LABEL_FIELD ) &&
				! nextFields.includes( PAGE_TITLE_FIELD )
			) {
				const otherLabel = view.fields.includes( LABEL_FIELD )
					? PAGE_TITLE_FIELD
					: LABEL_FIELD;
				resolvedView = {
					...nextView,
					fields: [ otherLabel, ...nextFields ],
				};
			}

			const nextDisplay = getPageLabelDisplayFromFields(
				resolvedView.fields
			);
			if ( nextDisplay && nextDisplay !== pageLabelDisplay ) {
				setPageLabelDisplay( nextDisplay || DEFAULT_PAGE_LABEL_DISPLAY );
			}
		}

		const resetsPage =
			resolvedView.search !== view.search ||
			resolvedView.perPage !== view.perPage ||
			resolvedView.sort?.field !== view.sort?.field ||
			resolvedView.sort?.direction !== view.sort?.direction;

		setView( resetsPage ? { ...resolvedView, page: 1 } : resolvedView );
	};

	let comparisonNote = '';
	if (
		showMetricTrend &&
		comparisonRange &&
		( inlineMetricChange || view.fields.includes( CHANGE_FIELD ) )
	) {
		comparisonNote =
			comparisonRange.start === comparisonRange.end
				? sprintf(
						/* translators: %s: Day of the previous period. */
						__( 'Change compared with %s.', 'bimbeau-privacy-analytics' ),
						formatDateStringForLocale( comparisonRange.start )
				  )
				: sprintf(
						/* translators: 1: First day of the previous period, 2: Last day of the previous period. */
						__(
							'Change compared with the period from %1$s to %2$s.',
							'bimbeau-privacy-analytics'
						),
						formatDateStringForLocale( comparisonRange.start ),
						formatDateStringForLocale( comparisonRange.end )
				  );
	}

	const emptyContent = emptyStateNoticeStatus ? (
		<BrandNotice status={ emptyStateNoticeStatus } isDismissible={ false }>
			<p>{ emptyLabel }</p>
		</BrandNotice>
	) : (
		<p className="bbpa-report-dataview__empty">{ emptyLabel }</p>
	);

	return (
		<div
			className={
				mediaField?.round
					? 'bbpa-report-dataview bbpa-report-dataview--round-media'
					: 'bbpa-report-dataview'
			}
		>
			<ListDataViews
				title={ cardTitle }
				notice={
					error ? (
						<DataState
							isLoading={ false }
							error={ error }
							isEmpty={ false }
							loadingLabel={ title }
						/>
					) : null
				}
				view={ displayedView }
				onChangeView={ onChangeView }
				columnsStorageId={ resolvedColumnsStorageId }
				fields={ fields }
				data={ error ? [] : rows }
				isLoading={ isLoading }
				getItemId={ ( row ) => row.id }
				paginationInfo={ { totalItems, totalPages } }
				defaultLayouts={ { table: {} } }
				search={ enableSearch }
				searchLabel={ __( 'Search', 'bimbeau-privacy-analytics' ) }
				config={ { perPageSizes: DATAVIEWS_PER_PAGE_SIZES } }
				empty={ emptyContent }
				header={
					exportReportKey ? (
						<ReportExportAction
							report={ exportReportKey }
							params={ listParams }
							totalItems={ totalItems }
						/>
					) : null
				}
			/>
			{ footnote || comparisonNote ? (
				<p className="bbpa-report-table__footnote bbpa-report-dataview__footnote">
					<FeatureIcon name="info" size={ 16 } />
					<span>
						{ [ footnote, comparisonNote ].filter( Boolean ).join( ' ' ) }
					</span>
				</p>
			) : null }
		</div>
	);
};

export default ReportDataView;
