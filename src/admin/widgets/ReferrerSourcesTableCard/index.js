import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	Button,
	Flex,
	FlexItem,
	SelectControl,
	TextControl,
} from '@wordpress/components';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import FeatureIcon from '../../components/icons/FeatureIcon';
import ReferrerLabel from '../../components/ReferrerLabel';
import ReportExportAction from '../../components/ReportExportAction';
import { getPreviousRange } from '../../lib/date';
import {
	calculateChangePercent,
	formatChangePercent,
} from '../../lib/formatters';
import { getChannelLabel } from '../../lib/channelLabels';

const ReferrerSourcesTableCard = ( { range, requestParams = {} } ) => {
	const [ page, setPage ] = useState( 1 );
	const [ perPage, setPerPage ] = useState( 10 );
	const [ orderBy, setOrderBy ] = useState( 'hits' );
	const [ order, setOrder ] = useState( 'desc' );
	const [ searchInput, setSearchInput ] = useState( '' );
	const [ searchTerm, setSearchTerm ] = useState( '' );

	useEffect( () => {
		setPage( 1 );
	}, [ range.start, range.end ] );

	useEffect( () => {
		const debounceId = window.setTimeout( () => {
			setSearchTerm( searchInput.trim() );
		}, 250 );

		return () => {
			window.clearTimeout( debounceId );
		};
	}, [ searchInput ] );

	const { data, isLoading, error } = useAdminEndpoint(
		'/referrer-sources',
		{
			...range,
			...requestParams,
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
	const comparisonRange = getPreviousRange( range );
	const { data: comparisonData, isLoading: isComparisonLoading } =
		useAdminEndpoint(
			'/referrer-sources',
			{
				...comparisonRange,
				...requestParams,
				page: 1,
				per_page: 100,
				orderby: 'hits',
				order: 'desc',
				search: searchTerm,
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
			}
		);

	const items = data?.items || [];
	const pagination = data?.pagination || {};
	const totalPages = pagination.totalPages || 1;
	const totalItems = pagination.totalItems || items.length;

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
	/* translators: %s: current sort order label. */
	const orderToggleLabel = `${ __(
		'Toggle sort order',
		'bimbeau-privacy-analytics'
	) }: ${ orderLabel }`;
	const tableLabel = __(
		'Table: Referring sites',
		'bimbeau-privacy-analytics'
	);

	const exportParams = {
		...range,
		...requestParams,
		orderby: orderBy,
		order,
		search: searchTerm,
	};

	const directLabel = __( 'Direct', 'bimbeau-privacy-analytics' );
	const rows = items.map( ( item, index ) => {
		const categoryFallback = item.referrer_domain
			? __( 'Referrer', 'bimbeau-privacy-analytics' )
			: directLabel;
		const sourceCategory = item.source_category || categoryFallback;
		const category = getChannelLabel( sourceCategory );
		const referrerDomain =
			item.referrer_domain ||
			( category === directLabel
				? directLabel
				: __( 'Referrer unavailable', 'bimbeau-privacy-analytics' ) );

		return {
			key: `${ referrerDomain }-${ sourceCategory }-${ index }`,
			referrer: referrerDomain,
			referrerDomain: item.referrer_domain || '',
			category,
			hits: item.hits,
			comparisonKey: `${
				item.referrer_domain || ''
			}::${ sourceCategory }`,
		};
	} );
	const comparisonByKey = ( comparisonData?.items || [] ).reduce(
		( accumulator, item ) => {
			const key = `${ item?.referrer_domain || '' }::${
				item?.source_category || ''
			}`;
			accumulator.set( key, Number( item?.hits || 0 ) );
			return accumulator;
		},
		new Map()
	);
	const headerActions = (
		<ReportExportAction
			report="referrer-sources"
			params={ exportParams }
			totalItems={ totalItems }
		/>
	);

	return (
		<BpaCard
			title={ __( 'Referring sites', 'bimbeau-privacy-analytics' ) }
			headerActions={ headerActions }
		>
			<div className="bbpa-table-controls">
				<div className="bbpa-table-controls__group">
					<SelectControl
						label={ __( 'Sort by', 'bimbeau-privacy-analytics' ) }
						value={ orderBy }
						options={ [
							{
								label: __(
									'Visits',
									'bimbeau-privacy-analytics'
								),
								value: 'hits',
							},
							{
								label: __(
									'Referrer',
									'bimbeau-privacy-analytics'
								),
								value: 'referrer',
							},
							{
								label: __(
									'Channel',
									'bimbeau-privacy-analytics'
								),
								value: 'category',
							},
						] }
						onChange={ ( value ) => {
							setOrderBy( value );
							setPage( 1 );
						} }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
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
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
				</div>
				<TextControl
					className="bbpa-table-controls__search"
					label={ __( 'Search', 'bimbeau-privacy-analytics' ) }
					value={ searchInput }
					onChange={ ( value ) => {
						setSearchInput( value );
						setPage( 1 );
					} }
					placeholder={ __( 'Search…', 'bimbeau-privacy-analytics' ) }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			</div>
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && rows.length === 0 }
				emptyLabel={ __(
					'No referring site data available.',
					'bimbeau-privacy-analytics'
				) }
				loadingLabel={ __(
					'Loading referring sites…',
					'bimbeau-privacy-analytics'
				) }
			/>
			{ ! isLoading && ! error && rows.length > 0 && (
				<>
					<div className="bbpa-table-scroll">
						<table
							className="widefat striped bbpa-report-table"
							aria-label={ tableLabel }
						>
							<thead>
								<tr>
									<th scope="col">
										{ __(
											'Referrer',
											'bimbeau-privacy-analytics'
										) }
									</th>
									<th scope="col">
										{ __(
											'Channel',
											'bimbeau-privacy-analytics'
										) }
									</th>
									<th scope="col">
										{ __(
											'Visits',
											'bimbeau-privacy-analytics'
										) }
									</th>
								</tr>
							</thead>
							<tbody>
								{ rows.map( ( row ) => (
									<tr key={ row.key }>
										<td>
											<ReferrerLabel
												domain={ row.referrerDomain }
												label={ row.referrer }
											/>
										</td>
										<td>{ row.category }</td>
										<td>
											<div className="bbpa-report-table__metric">
												<span>{ row.hits }</span>
												{ ! isComparisonLoading &&
													( () => {
														const previousValue =
															comparisonByKey.get(
																row.comparisonKey
															) || 0;
														const change =
															calculateChangePercent(
																Number(
																	row.hits
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
															changeLabel === null
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
											</div>
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					</div>
					<Flex
						className="bbpa-table-pagination"
						justify="space-between"
						align="center"
					>
						<FlexItem>
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
									{ __(
										'Previous',
										'bimbeau-privacy-analytics'
									) }
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
									{ __(
										'Next',
										'bimbeau-privacy-analytics'
									) }
								</Button>
							</div>
						</FlexItem>
						<FlexItem className="bbpa-table-pagination__meta">
							{ `${ __(
								'Page',
								'bimbeau-privacy-analytics'
							) } ${ page } ${ __(
								'of',
								'bimbeau-privacy-analytics'
							) } ${ totalPages }` }
						</FlexItem>
						<FlexItem className="bbpa-table-pagination__meta">
							{ `${ totalItems } ${ __(
								'items',
								'bimbeau-privacy-analytics'
							) }` }
						</FlexItem>
					</Flex>
				</>
			) }
		</BpaCard>
	);
};

export default ReferrerSourcesTableCard;
