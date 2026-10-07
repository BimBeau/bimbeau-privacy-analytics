import { useMemo, useState } from '@wordpress/element';
import { filterSortAndPaginate } from '@wordpress/dataviews';
import ListDataViews from '../components/ListDataViews';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	LuBadgeDollarSign,
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
import MetricTrend from '../components/MetricTrend';
import ReportExportAction from '../components/ReportExportAction';
import { ADMIN_CONFIG } from '../constants';
import { getPreviousRange, getRangeFromSelection } from '../lib/date';
import { formatNumber } from '../lib/formatters';
import { getChannelLabel } from '../lib/channelLabels';
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

const formatShare = ( value ) =>
	`${ formatNumber( Number( value || 0 ), {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	} ) }%`;

const DEFAULT_VIEW = {
	type: 'table',
	page: 1,
	perPage: 20,
	sort: { field: 'visits', direction: 'desc' },
	filters: [],
	fields: [ 'visits', 'share' ],
	titleField: 'channel',
	// Numbers aligned to the start, under their header (mockups).
	layout: {
		styles: {
			visits: { align: 'start' },
			share: { align: 'start' },
			orders: { align: 'start' },
			revenue: { align: 'start' },
			conversion_rate: { align: 'start' },
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
	const [ view, setView ] = useState( DEFAULT_VIEW );
	// Optional columns (WooCommerce) are shown by default; these ones were hidden by the user.
	const [ hiddenOptionalFields, setHiddenOptionalFields ] = useState( [] );

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
				<div className="bbpa-report-table__metric">
					<span className="bbpa-report-table__metric-value">
						{ formatNumber( item.visits ) }
					</span>
					{ ! isComparisonLoading && comparisonByKey.has( item.key ) ? (
						<MetricTrend
							value={ item.visits }
							previousValue={ comparisonByKey.get( item.key ) }
						/>
					) : null }
				</div>
			),
			enableHiding: false,
			enableSorting: true,
			filterBy: false,
		},
		{
			id: 'share',
			label: __( 'Traffic share', 'bimbeau-privacy-analytics' ),
			type: 'number',
			getValue: ( { item } ) => item.share,
			render: ( { item } ) => formatShare( item.share ),
			enableSorting: true,
			filterBy: false,
		},
		...ecommerceFields,
	];
	const optionalFieldIds = ecommerceFields.map( ( field ) => field.id );
	const visibleFields = [
		...view.fields,
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
		setView( nextView );
	};

	return (
		<div className="bbpa-report-panel">
			<BpaCard
				title={ __( 'Acquisition channels', 'bimbeau-privacy-analytics' ) }
				className="bbpa-dataviews-card"
				bodyClassName="bbpa-listing-region bbpa-dataviews"
			>
				<div className="bbpa-report-dataview bbpa-report-dataview--acquisition">
					{ error ? (
						<DataState isLoading={ false } error={ error } isEmpty={ false } />
					) : null }
					<ListDataViews
						view={ { ...view, fields: visibleFields } }
						onChangeView={ onChangeView }
						fields={ fields }
						data={ error ? [] : shownRows }
						isLoading={ isLoading }
						getItemId={ ( item ) => item.key || item.label }
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
							{  }
						</div>
					) : null }
				</div>
			</BpaCard>
			{  }
		</div>
	);
};

export default AcquisitionPanel;
