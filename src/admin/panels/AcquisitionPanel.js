import { useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
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
import FeatureIcon from '../components/icons/FeatureIcon';
import BpaCard from '../components/BpaCard';
import ReportExportAction from '../components/ReportExportAction';
import { ADMIN_CONFIG } from '../constants';
import { getPreviousRange, getRangeFromSelection } from '../lib/date';
import { calculateChangePercent, formatChangePercent } from '../lib/formatters';
import { getChannelLabel } from '../lib/channelLabels';

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

const formatShare = ( value ) => `${ Number( value || 0 ).toFixed( 1 ) }%`;

const AcquisitionPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);
	const previousRange = useMemo( () => getPreviousRange( range ), [ range ] );

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

	const items = data?.items || [];
	const comparisonByKey = ( comparisonData?.items || [] ).reduce(
		( accumulator, item ) => {
			accumulator.set( item?.key || '', Number( item?.visits || 0 ) );
			return accumulator;
		},
		new Map()
	);
	const total = Number( data?.total || 0 );
	const headerActions = (
		<ReportExportAction
			report="acquisition-channels"
			params={ range }
			totalItems={ items.length }
		/>
	);

	return (
		<div className="bbpa-report-panel">
			<BpaCard
				title={ __( 'Acquisition channels', 'bimbeau-privacy-analytics' ) }
				headerActions={ headerActions }
			>
				<DataState
					isLoading={ isLoading }
					error={ error }
					isEmpty={ ! isLoading && ! error && items.length === 0 }
					emptyLabel={ __(
						'No acquisition channel data is available for this period.',
						'bimbeau-privacy-analytics'
					) }
				/>
				{ ! isLoading && ! error && items.length > 0 ? (
					<div className="bbpa-table-scroll">
						<table
							className="widefat striped bbpa-report-table"
							aria-label={ __(
								'Table: Acquisition channels',
								'bimbeau-privacy-analytics'
							) }
						>
							<thead>
								<tr>
									<th scope="col">
										{ __( 'Channel', 'bimbeau-privacy-analytics' ) }
									</th>
									<th scope="col">
										{ __( 'Visits', 'bimbeau-privacy-analytics' ) }
									</th>
									<th scope="col">
										{ __( 'Traffic share', 'bimbeau-privacy-analytics' ) }
									</th>
								</tr>
							</thead>
							<tbody>
								{ items.map( ( item ) => {
									const Icon =
										CHANNEL_ICONS[ item.key ] ||
										LuCircleHelp;
									const channelLabel = getChannelLabel(
										item.key || item.channel
									);
									const previousVisits = comparisonByKey.get(
										item.key
									);
									const change = calculateChangePercent(
										Number( item.visits || 0 ),
										previousVisits
									);
									const changeLabel =
										isComparisonLoading ||
										previousVisits === undefined
											? null
											: formatChangePercent( change );
									const isNegative = Number( change ) < 0;
									const isNeutral = Number( change ) === 0;
									let trendClassName =
										'bbpa-report-table__trend bbpa-report-table__trend--positive';

									if ( isNeutral ) {
										trendClassName =
											'bbpa-report-table__trend bbpa-report-table__trend--neutral';
									} else if ( isNegative ) {
										trendClassName =
											'bbpa-report-table__trend bbpa-report-table__trend--negative';
									}

									return (
										<tr key={ item.key }>
											<th scope="row">
												<span className="bbpa-channel-label">
													<Icon
														aria-hidden="true"
														focusable="false"
													/>
													{ channelLabel }
												</span>
											</th>
											<td>
												<div className="bbpa-report-table__metric">
													<span className="bbpa-report-table__metric-value">
														{ Number(
															item.visits || 0
														).toLocaleString() }
													</span>
													{ changeLabel !== null ? (
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
																	size={ 12 }
																/>
															) }
														</span>
													) : null }
												</div>
											</td>
											<td>
												{ formatShare( item.share ) }
											</td>
										</tr>
									);
								} ) }
							</tbody>
						</table>
						<p className="description">
							{ sprintf(
								/* translators: %s: Total visits in the selected range. */
								__( 'Total visits: %s', 'bimbeau-privacy-analytics' ),
								total.toLocaleString()
							) }
						</p>
					</div>
				) : null }
			</BpaCard>
		</div>
	);
};

export default AcquisitionPanel;
