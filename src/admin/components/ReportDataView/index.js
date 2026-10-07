import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { Button, Tooltip } from '@wordpress/components';
import { DataViews } from '@wordpress/dataviews';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import BrandNotice from '../BrandNotice';
import DataState from '../DataState';
import MetricTrend from '../MetricTrend';
import MiniSparkline from '../MiniSparkline';
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
import { decodeHtmlEntities } from '../../lib/formatters';
import { DATAVIEWS_PER_PAGE_SIZES } from '../../lib/dataviewsConfig';
import { getPreviousRange } from '../../lib/date';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';

export const LABEL_FIELD = 'label';
export const PAGE_TITLE_FIELD = 'page_title';

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
 * @param {Object} view      DataViews view.
 * @param {string} metricKey Sort key of the metric.
 * @return {{orderby: string, order: string}} Sort parameters.
 */
export const getReportSortParams = ( view, metricKey ) => {
	const field = view?.sort?.field;
	const orderby = [ LABEL_FIELD, PAGE_TITLE_FIELD, metricKey ].includes( field )
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
	extraMetricValueKey,
} ) => {
	const labelFields = ! supportsPageLabelToggle
		? [ LABEL_FIELD ]
		: [ pageLabelDisplay === 'title' ? PAGE_TITLE_FIELD : LABEL_FIELD ];

	return [
		...labelFields,
		metricKey,
		...( extraMetricValueKey ? [ extraMetricValueKey ] : [] ),
	];
};

/**
 * Report list (one label column and one or two metric columns) rendered with the WordPress
 * DataViews component: search, sort, page size, visible columns, server pagination and export.
 *
 * Shared by Free and Pro; the props are the ones of ReportTableCard.
 */
const ReportDataView = ( {
	title,
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
} ) => {
	registerDataViewsTranslations();

	const resolvedExtraMetricKey = extraMetricLabel ? extraMetricValueKey : '';
	const [ pageLabelDisplay, setPageLabelDisplay ] =
		useSharedPageLabelDisplay();
	const [ view, setView ] = useState( () => ( {
		type: 'table',
		page: 1,
		perPage: 10,
		search: '',
		sort: { field: metricKey, direction: 'desc' },
		filters: [],
		fields: getVisibleFields( {
			supportsPageLabelToggle,
			pageLabelDisplay,
			metricKey,
			extraMetricValueKey: resolvedExtraMetricKey,
		} ),
		layout: {
			styles: {
				[ metricKey ]: { align: 'end' },
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
	const sortParams = getReportSortParams( view, metricKey );
	const listParams = {
		...range,
		...requestParams,
		...( hideZeroPrimaryRows ? { exclude_zero: true } : {} ),
		...sortParams,
		search,
	};
	const { data, isLoading, error } = useAdminEndpoint(
		endpoint,
		{ ...listParams, page: view.page, per_page: view.perPage },
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
			if ( key ) {
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

	const rawItems = useMemo( () => data?.items || [], [ data ] );
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

	const pagination = data?.pagination || {};
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

	const fields = useMemo( () => {
		const renderRowLabel = ( row, fullLabel ) => {
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
			const label = <PageTitle title={ fullLabel }>{ content }</PageTitle>;
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
			render: ( { item } ) => renderRowLabel( item, item.pageTitle || item.label ),
			enableHiding: true,
			enableSorting: true,
			filterBy: false,
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
					const series = metricSeriesKey
						? row.item?.[ metricSeriesKey ]
						: undefined;
					const comparisonKey =
						typeof getComparisonKey === 'function'
							? getComparisonKey( row.item )
							: row.item?.label || '';

					return (
						<div className="bbpa-report-table__metric">
							<span className="bbpa-report-table__metric-value">
								{ value }
							</span>
							{ typeof renderMetricAccessory === 'function'
								? renderMetricAccessory( row.item, row )
								: null }
							{ ! hasPrimaryMetric && metricFallbackBadgeLabel ? (
								<span className="components-badge is-info">
									{ metricFallbackBadgeLabel }
								</span>
							) : null }
							{ showMetricTrend && ! isComparisonLoading ? (
								<MetricTrend
									value={ value }
									previousValue={
										comparisonValuesByKey.get( comparisonKey ) || 0
									}
								/>
							) : null }
							{ Array.isArray( series ) && series.length > 0 ? (
								<MiniSparkline series={ series } />
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
			...( supportsPageLabelToggle ? [ pageTitleField ] : [] ),
			metricField,
			...( extraField ? [ extraField ] : [] ),
			...( openField ? [ openField ] : [] ),
		];
	}, [
		comparisonValuesByKey,
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
		supportsPageLabelToggle,
	] );

	const viewFields =
		fields.some( ( field ) => field.id === 'open' ) &&
		! view.fields.includes( 'open' )
			? [ ...view.fields, 'open' ]
			: view.fields;

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

	const emptyContent = emptyStateNoticeStatus ? (
		<BrandNotice status={ emptyStateNoticeStatus } isDismissible={ false }>
			<p>{ emptyLabel }</p>
		</BrandNotice>
	) : (
		<p className="bbpa-report-dataview__empty">{ emptyLabel }</p>
	);

	return (
		<div className="bbpa-report-dataview">
			{ error ? (
				<DataState
					isLoading={ false }
					error={ error }
					isEmpty={ false }
					loadingLabel={ title }
				/>
			) : null }
			<DataViews
				view={ { ...view, fields: viewFields } }
				onChangeView={ onChangeView }
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
			{ footnote ? (
				<p className="bbpa-report-table__footnote bbpa-report-dataview__footnote">
					{ footnote }
				</p>
			) : null }
		</div>
	);
};

export default ReportDataView;
