import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	Button,
	Flex,
	FlexItem,
	Tooltip,
	SelectControl,
	TextControl,
} from '@wordpress/components';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG, DEFAULT_PAGE_LABEL_DISPLAY } from '../../constants';
import FeatureIcon from '../../components/icons/FeatureIcon';
import ReportExportAction from '../../components/ReportExportAction';
import MiniSparkline from '../../components/MiniSparkline';
import PageTitle from '../../components/PageTitle';
import useSharedPageLabelDisplay from '../../hooks/useSharedPageLabelDisplay';
import {
	calculateChangePercent,
	formatChangePercent,
	decodeHtmlEntities,
} from '../../lib/formatters';
import { getPreviousRange } from '../../lib/date';
import { normalizePageLabelDisplay } from '../../lib/storage';

const ReportTableCard = ( {
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
} ) => {
	const [ page, setPage ] = useState( 1 );
	const [ perPage, setPerPage ] = useState( 10 );
	const [ orderBy, setOrderBy ] = useState( metricKey );
	const [ order, setOrder ] = useState( 'desc' );
	const [ searchInput, setSearchInput ] = useState( '' );
	const [ searchTerm, setSearchTerm ] = useState( '' );
	const [ pageLabelDisplay, setPageLabelDisplay ] =
		useSharedPageLabelDisplay();
	const activeLabelHeader =
		supportsPageLabelToggle && pageLabelDisplay === 'title'
			? __( 'Title', 'bimbeau-privacy-analytics' )
			: labelHeader;
	const activeLabelSortKey =
		supportsPageLabelToggle && pageLabelDisplay === 'title'
			? 'page_title'
			: 'label';
	const allowedSortKeys = useMemo(
		() => [ metricKey, 'label', 'page_title' ],
		[ metricKey ]
	);

	useEffect( () => {
		setPage( 1 );
	}, [ range.start, range.end ] );

	useEffect( () => {
		setOrderBy( metricKey );
		setOrder( 'desc' );
	}, [ metricKey ] );

	useEffect( () => {
		if ( allowedSortKeys.includes( orderBy ) ) {
			return;
		}

		setOrderBy( metricKey );
		setPage( 1 );
	}, [ allowedSortKeys, metricKey, orderBy ] );

	useEffect( () => {
		if ( ! enableSearch ) {
			setSearchInput( '' );
			setSearchTerm( '' );
			return undefined;
		}

		const debounceId = window.setTimeout( () => {
			setSearchTerm( searchInput.trim() );
		}, 250 );

		return () => {
			window.clearTimeout( debounceId );
		};
	}, [ searchInput, enableSearch ] );

	useEffect( () => {
		if (
			supportsPageLabelToggle &&
			orderBy === 'label' &&
			activeLabelSortKey === 'page_title'
		) {
			setOrderBy( 'page_title' );
			setPage( 1 );
		}

		if (
			supportsPageLabelToggle &&
			orderBy === 'page_title' &&
			activeLabelSortKey === 'label'
		) {
			setOrderBy( 'label' );
			setPage( 1 );
		}
	}, [ supportsPageLabelToggle, orderBy, activeLabelSortKey ] );

	const { data, isLoading, error } = useAdminEndpoint(
		endpoint,
		{
			...range,
			...requestParams,
			...( hideZeroPrimaryRows ? { exclude_zero: true } : {} ),
			page,
			per_page: perPage,
			orderby: orderBy,
			order,
			search: searchTerm,
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
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
				search: searchTerm,
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
				enabled: showMetricTrend && Boolean( comparisonRange ),
			}
		);

	const items = data?.items || [];
	const pagination = data?.pagination || {};
	const totalPages =
		Number( pagination.totalPages || pagination.total_pages || 1 ) || 1;
	const totalItems =
		Number( pagination.totalItems || pagination.total_items || items.length ) ||
		items.length;

	useEffect( () => {
		if ( ! isLoading && ! error && totalPages && page > totalPages ) {
			setPage( totalPages );
		}
	}, [ totalPages, page, isLoading, error ] );

	const canPrevious = page > 1;
	const canNext = page < totalPages;

	const orderLabel =
		order === 'asc'
			? __( 'Ascending', 'bimbeau-privacy-analytics' )
			: __( 'Descending', 'bimbeau-privacy-analytics' );
	/* translators: %s: active first-column label. */
	const labelSortLabel = `${ activeLabelHeader } ${ __(
		'label',
		'bimbeau-privacy-analytics'
	) }`;
	/* translators: %s: current sort order label. */
	const orderToggleLabel = `${ __(
		'Toggle sort order',
		'bimbeau-privacy-analytics'
	) }: ${ orderLabel }`;
	/* translators: %s: table title. */
	const tableLabel = `${ __( 'Table', 'bimbeau-privacy-analytics' ) }: ${ title }`;

	const exportParams = {
		...range,
		...requestParams,
		...( hideZeroPrimaryRows ? { exclude_zero: true } : {} ),
		orderby: orderBy,
		order,
		search: searchTerm,
	};

	const rows = items
		.map( ( item, index ) => {
			const rawLabel = decodeHtmlEntities( item.label || '' );
			const formattedLabel = formatLabel
				? formatLabel( rawLabel, item )
				: rawLabel;
			const resolvedLabel = formattedLabel || labelFallback;
			const series = metricSeriesKey ? item?.[ metricSeriesKey ] : undefined;

			return {
				key: `${ rawLabel || resolvedLabel }-${ index }`,
				label: resolvedLabel,
				item,
				pageTitle: decodeHtmlEntities( item.page_title || '' ),
				value: item?.[ metricValueKey ] ?? 0,
				hasPrimaryMetric: item?.[ metricValueKey ] !== undefined,
				fallbackValue:
					metricFallbackValueKey !== ''
						? item?.[ metricFallbackValueKey ] ?? 0
						: 0,
				extraValue:
					extraMetricValueKey !== ''
						? item?.[ extraMetricValueKey ] ?? 0
						: null,
				metricSeries: Array.isArray( series ) ? series : [],
				href:
					typeof getRowHref === 'function' ? getRowHref( item ) : '',
				isActionable: typeof onRowClick === 'function',
			};
		} );
	const comparisonValuesByKey = useMemo( () => {
		if ( ! showMetricTrend ) {
			return new Map();
		}

		const comparisonItems = comparisonData?.items || [];
		return comparisonItems.reduce( ( accumulator, item ) => {
			const comparisonKey =
				typeof getComparisonKey === 'function'
					? getComparisonKey( item )
					: item?.label || '';

			if ( comparisonKey ) {
				accumulator.set(
					comparisonKey,
					Number( item?.[ metricValueKey ] || 0 )
				);
			}

			return accumulator;
		}, new Map() );
	}, [
		comparisonData?.items,
		getComparisonKey,
		metricValueKey,
		showMetricTrend,
	] );
	const hasFlexComponents = Boolean( Flex ) && Boolean( FlexItem );
	const PaginationWrapper = hasFlexComponents ? Flex : 'div';
	const PaginationItem = hasFlexComponents ? FlexItem : 'div';
	const paginationWrapperProps = hasFlexComponents
		? {
				className: 'bbpa-table-pagination',
				justify: 'space-between',
				align: 'center',
		  }
		: { className: 'bbpa-table-pagination' };
	const paginationItemClass = hasFlexComponents
		? undefined
		: 'bbpa-table-pagination__item';
	const paginationMetaClass = hasFlexComponents
		? 'bbpa-table-pagination__meta'
		: 'bbpa-table-pagination__meta bbpa-table-pagination__item';
	const headerActions = exportReportKey ? (
		<ReportExportAction
			report={ exportReportKey }
			params={ exportParams }
			totalItems={ totalItems }
		/>
	) : null;

	return (
		<BpaCard
			title={ title }
			headerActions={ headerActions }
			bodyClassName="bbpa-listing-region"
		>
			<div className="bbpa-table-controls">
				<div className="bbpa-table-controls__group">
					<SelectControl
						label={ __( 'Sort by', 'bimbeau-privacy-analytics' ) }
						value={ orderBy }
						options={ [
							{ label: metricLabel, value: metricKey },
							{
								label: labelSortLabel,
								value: activeLabelSortKey,
							},
						] }
						onChange={ ( value ) => {
							setOrderBy( value );
							setPage( 1 );
						} }
						__next40pxDefaultSize __nextHasNoMarginBottom
					/>
					{ supportsPageLabelToggle && (
						<SelectControl
							label={ __( 'Display', 'bimbeau-privacy-analytics' ) }
							value={ pageLabelDisplay }
							options={ [
								{
									label: __( 'URL', 'bimbeau-privacy-analytics' ),
									value: 'url',
								},
								{
									label: __( 'Title', 'bimbeau-privacy-analytics' ),
									value: 'title',
								},
							] }
							onChange={ ( value ) => {
								const nextMode =
									normalizePageLabelDisplay( value ) ||
									DEFAULT_PAGE_LABEL_DISPLAY;
								setPageLabelDisplay( nextMode );
								setPage( 1 );
							} }
							__next40pxDefaultSize __nextHasNoMarginBottom
						/>
					) }
					<Button
						variant="secondary"
						icon={
							<FeatureIcon
								name={
									order === 'asc' ? 'ascending' : 'descending'
								}
								size={ 14 }
							/>
						}
						onClick={ () => {
							setOrder( order === 'asc' ? 'desc' : 'asc' );
							setPage( 1 );
						} }
						aria-label={ orderToggleLabel }
					>
						{ orderLabel }
					</Button>
					<SelectControl
						className="bbpa-table-controls__rows-control"
						label={ __( 'Rows', 'bimbeau-privacy-analytics' ) }
						value={ String( perPage ) }
						options={ [
							{ label: '5', value: '5' },
							{ label: '10', value: '10' },
							{ label: '20', value: '20' },
						] }
						onChange={ ( value ) => {
							setPerPage( Number( value ) );
							setPage( 1 );
						} }
						__next40pxDefaultSize __nextHasNoMarginBottom
					/>
				</div>
				{ enableSearch && (
					<TextControl
						className="bbpa-table-controls__search"
						label={ __( 'Search', 'bimbeau-privacy-analytics' ) }
						value={ searchInput }
						onChange={ ( value ) => {
							setSearchInput( value );
							setPage( 1 );
						} }
						placeholder={ __( 'Search…', 'bimbeau-privacy-analytics' ) }
						__next40pxDefaultSize __nextHasNoMarginBottom
					/>
				) }
			</div>
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && rows.length === 0 }
				emptyLabel={ emptyLabel }
				emptyAsNotice={ Boolean( emptyStateNoticeStatus ) }
				emptyNoticeStatus={ emptyStateNoticeStatus || 'warning' }
				loadingLabel={ `${ __(
					'Loading',
					'bimbeau-privacy-analytics'
				) }: ${ title }` }
			/>
			{ ! isLoading && ! error && rows.length > 0 && (
				<>
					<div className="bbpa-table-scroll">
						<table
							className="widefat striped bbpa-report-table bbpa-report-table--adaptive-label"
							aria-label={ tableLabel }
						>
							<thead>
								<tr>
									<th
										scope="col"
										className="bbpa-report-table__page-column"
									>
										{ activeLabelHeader }
									</th>
									<th scope="col">
										<span className="bbpa-report-table__metric-header">
											<span>{ metricLabel }</span>
											{ metricHelpText ? (
												<Tooltip
													text={ metricHelpText }
												>
													<span
														className="dashicons dashicons-editor-help"
														aria-label={
															metricHelpText
														}
													/>
												</Tooltip>
											) : null }
										</span>
									</th>
									{ extraMetricLabel ? (
										<th scope="col">
											<span className="bbpa-report-table__metric-header">
												<span>
													{ extraMetricLabel }
												</span>
												{ extraMetricHelpText ? (
													<Tooltip
														text={
															extraMetricHelpText
														}
													>
														<span
															className="dashicons dashicons-editor-help"
															aria-label={
																extraMetricHelpText
															}
														/>
													</Tooltip>
												) : null }
											</span>
										</th>
									) : null }
									{ showOpenButton ? (
										<th
											scope="col"
											className="bbpa-report-table__open-column"
										>
											<span className="screen-reader-text">
												{ __( 'Open row', 'bimbeau-privacy-analytics' ) }
											</span>
										</th>
									) : null }
								</tr>
							</thead>
							<tbody>
								{ rows.map( ( row ) => (
									<tr
										key={ row.key }
										className={
											showOpenButton && row.href
												? 'bbpa-report-table__row--has-open-link'
												: undefined
										}
									>
										<td className="bbpa-report-table__page-cell">
											{ ( () => {
												const baseLabel =
													supportsPageLabelToggle &&
													pageLabelDisplay === 'title'
																? row.pageTitle ||
																  row.label
														: row.label;
												const renderedLabel =
													renderLabel
														? renderLabel(
																baseLabel,
																row.item
														  )
														: baseLabel;

												if (
													! row.isActionable &&
													! row.href
												) {
															return (
																<PageTitle title={ baseLabel }>
																	{ renderedLabel }
																</PageTitle>
															);
												}

												return (
													<Button
														variant="link"
														href={ row.href || '#' }
														onClick={ ( event ) => {
															if (
																! row.isActionable
															) {
																return;
															}

															event.preventDefault();
															onRowClick(
																row.item
															);
														} }
														className="bbpa-report-table__row-action"
														aria-label={
																	`${
																		rowActionLabel ||
																		__(
																'Open details',
																'bimbeau-privacy-analytics'
																			)
																	}: ${ baseLabel }`
														}
													>
														<PageTitle title={ baseLabel }>
															{ renderedLabel }
														</PageTitle>
													</Button>
												);
											} )() }
										</td>
										<td>
											<div className="bbpa-report-table__metric">
												<span className="bbpa-report-table__metric-value">
													{ row.hasPrimaryMetric
														? row.value
														: row.fallbackValue }
												</span>
												{ typeof renderMetricAccessory === 'function'
													? renderMetricAccessory( row.item, row )
													: null }
												{ ! row.hasPrimaryMetric &&
												metricFallbackBadgeLabel ? (
													<span className="components-badge is-info">
														{
															metricFallbackBadgeLabel
														}
													</span>
												) : null }
												{ showMetricTrend &&
													( () => {
														const comparisonKey =
															typeof getComparisonKey ===
															'function'
																? getComparisonKey(
																		row.item
																  )
																: row.item
																		?.label ||
																  '';
														const previousValue =
															comparisonValuesByKey.has(
																comparisonKey
															)
																? comparisonValuesByKey.get(
																		comparisonKey
																  )
																: 0;
														const change =
															calculateChangePercent(
																Number(
																	row.value
																),
																previousValue
															);
														const changeLabel =
															formatChangePercent(
																change
															);
														const isNegative =
															Number( change ) <
															0;
														const isNeutral =
															Number( change ) ===
															0;
														let trendClassName =
															'bbpa-report-table__trend bbpa-report-table__trend--positive';

														if ( isNeutral ) {
															trendClassName =
																'bbpa-report-table__trend bbpa-report-table__trend--neutral';
														} else if (
															isNegative
														) {
															trendClassName =
																'bbpa-report-table__trend bbpa-report-table__trend--negative';
														}

														if (
															changeLabel ===
																null ||
															isComparisonLoading
														) {
															return null;
														}

														return (
															<span
																className={
																	trendClassName
																}
															>
																{ changeLabel }
																{ ! isNeutral && (
																	<FeatureIcon
																		name={
																			isNegative
																				? 'trendingDown'
																				: 'trendingUp'
																		}
																		size={
																			12
																		}
																	/>
																) }
															</span>
														);
													} )() }
												{ metricSeriesKey && row.metricSeries.length > 0 ? (
													<MiniSparkline series={ row.metricSeries } />
												) : null }
											</div>
										</td>
										{ extraMetricLabel ? (
											<td>
												{ typeof formatExtraMetricValue ===
												'function'
													? formatExtraMetricValue(
															row.extraValue
													  )
													: row.extraValue }
											</td>
										) : null }
										{ showOpenButton ? (
											<td className="bbpa-report-table__open-cell">
												{ row.href ? (
													<Button
														variant="secondary"
														href={ row.href }
														className="bbpa-report-table__open-button"
													>
														{ __(
															'Open',
															'bimbeau-privacy-analytics'
														) }
													</Button>
												) : null }
											</td>
										) : null }
									</tr>
								) ) }
							</tbody>
						</table>
					</div>
					<PaginationWrapper { ...paginationWrapperProps }>
						<PaginationItem className={ paginationItemClass }>
							<div className="components-button-group">
								<Button
									variant="secondary"
									onClick={ () =>
										setPage( ( prev ) =>
											Math.max( prev - 1, 1 )
										)
									}
									disabled={ ! canPrevious }
									aria-label={ __(
										'Previous page',
										'bimbeau-privacy-analytics'
									) }
								>
									{ __( 'Previous', 'bimbeau-privacy-analytics' ) }
								</Button>
								<Button
									variant="secondary"
									onClick={ () =>
										setPage( ( prev ) =>
											Math.min( prev + 1, totalPages )
										)
									}
									disabled={ ! canNext }
									aria-label={ __(
										'Next page',
										'bimbeau-privacy-analytics'
									) }
								>
									{ __( 'Next', 'bimbeau-privacy-analytics' ) }
								</Button>
							</div>
						</PaginationItem>
						<PaginationItem className={ paginationMetaClass }>
							{ `${ __( 'Page', 'bimbeau-privacy-analytics' ) } ${ page } ${ __(
								'of',
								'bimbeau-privacy-analytics'
							) } ${ totalPages }` }
						</PaginationItem>
						<PaginationItem className={ paginationMetaClass }>
							{ `${ totalItems } ${ __(
								'items',
								'bimbeau-privacy-analytics'
							) }` }
						</PaginationItem>
					</PaginationWrapper>
				</>
			) }
		</BpaCard>
	);
};

export default ReportTableCard;
