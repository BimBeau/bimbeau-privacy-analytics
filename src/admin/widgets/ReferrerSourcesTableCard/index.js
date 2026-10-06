import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { Button, SelectControl } from '@wordpress/components';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import {
	DataViewsPagination,
	DataViewsToolbar,
} from '../../components/DataViewsFrame';
import { ADMIN_CONFIG } from '../../constants';
import FeatureIcon from '../../components/icons/FeatureIcon';
import ReferrerLabel from '../../components/ReferrerLabel';
import { normalizeReferrerHost, useReferrerFavicons } from '../../components/ReferrerLabel/faviconCache';
import ReportExportAction from '../../components/ReportExportAction';
import { getPreviousRange } from '../../lib/date';
import {
	calculateChangePercent,
	formatChangePercent,
} from '../../lib/formatters';
import { getChannelLabel } from '../../lib/channelLabels';

/**
 * Visits of a referrer-source row. `hits` holds page views; it is only used for payloads
 * that predate the separate `visits` key.
 */
const getRowVisits = ( item ) =>
	item?.visits !== undefined && item?.visits !== null
		? Number( item.visits )
		: Number( item?.hits || 0 );

const ReferrerSourcesTableCard = ( { range, requestParams = {} } ) => {
	const [ page, setPage ] = useState( 1 );
	const [ perPage, setPerPage ] = useState( 10 );
	const [ orderBy, setOrderBy ] = useState( 'visits' );
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
				orderby: 'visits',
				order: 'desc',
				search: searchTerm,
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
			}
		);

	const items = data?.items || [];
	const faviconsEnabled = Boolean( ADMIN_CONFIG?.settings?.referrer_favicons_enabled );
	const favicons = useReferrerFavicons( items.map( ( item ) => item.referrer_domain || '' ), faviconsEnabled, items.map( ( item ) => item.favicon ) );
	const pagination = data?.pagination || {};
	const totalPages = pagination.totalPages || 1;
	const totalItems = pagination.totalItems || items.length;

	useEffect( () => {
		if ( ! isLoading && ! error && totalPages && page > totalPages ) {
			setPage( totalPages );
		}
	}, [ totalPages, page, isLoading, error ] );


	const orderLabel =
		order === 'asc'
			? __( 'Ascending', 'bimbeau-privacy-analytics' )
			: __( 'Descending', 'bimbeau-privacy-analytics' );
	const orderToggleLabel = sprintf(
		/* translators: %s: current sort order, "Ascending" or "Descending". */
		__( 'Toggle sort order: %s', 'bimbeau-privacy-analytics' ),
		orderLabel
	);
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
			favicon: item.favicon || favicons.get( normalizeReferrerHost( item.referrer_domain || '' ) ),
			category,
			visits: getRowVisits( item ),
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
			accumulator.set( key, getRowVisits( item ) );
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
			className="bbpa-dataviews-card"
			bodyClassName="bbpa-listing-region bbpa-dataviews"
		>
			<DataViewsToolbar
				searchValue={ searchInput }
				onSearchChange={ ( value ) => {
					setSearchInput( value );
					setPage( 1 );
				} }
				viewOptions={
					<>
						<SelectControl
							label={ __( 'Sort by', 'bimbeau-privacy-analytics' ) }
							value={ orderBy }
							options={ [
								{
									label: __(
										'Visits',
										'bimbeau-privacy-analytics'
									),
									value: 'visits',
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
					</>
				}
				actions={ headerActions }
			/>
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
							className="bbpa-dataviews-table bbpa-report-table bbpa-report-table--adaptive-label bbpa-report-table--referrers"
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
												favicon={ row.favicon }
											/>
										</td>
										<td>{ row.category }</td>
										<td>
											<div className="bbpa-report-table__metric">
												<span>{ row.visits }</span>
												{ ! isComparisonLoading &&
													( () => {
														const previousValue =
															comparisonByKey.get(
																row.comparisonKey
															) || 0;
														const change =
															calculateChangePercent(
																Number(
																	row.visits
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
					<DataViewsPagination
						page={ page }
						totalPages={ totalPages }
						totalItems={ totalItems }
						onPageChange={ setPage }
					/>
				</>
			) }
		</BpaCard>
	);
};

export default ReferrerSourcesTableCard;
