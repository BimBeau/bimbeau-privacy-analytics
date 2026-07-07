import { ResponsiveBar } from '@nivo/bar';
import { __, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import { buildDeviceDetailsBreakdowns } from '../../lib/deviceDetails';
import './styles.css';

const CHART_SECTIONS = [
	{
		key: 'devices',
		title: __( 'Devices', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.devices,
		selectIdentifiedTotal: ( stats ) => stats.devicesIdentifiedTotal,
	},
	{
		key: 'operating-systems',
		title: __( 'Operating systems', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.operatingSystems,
		selectIdentifiedTotal: ( stats ) =>
			stats.operatingSystemsIdentifiedTotal,
	},
	{
		key: 'browsers',
		title: __( 'Browsers', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.browsers,
		selectIdentifiedTotal: ( stats ) => stats.browsersIdentifiedTotal,
	},
	{
		key: 'screen-resolutions',
		title: __( 'Screen resolutions', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.resolutions,
		selectIdentifiedTotal: ( stats ) => stats.resolutionsIdentifiedTotal,
	},
	{
		key: 'browser-versions',
		title: __( 'Browser versions', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.browserVersions,
		selectIdentifiedTotal: ( stats ) =>
			stats.browserVersionsIdentifiedTotal,
	},
];

const BreakdownChart = ( { title, items, identifiedTotal, totalTracked } ) => {
	const chartData = items.map( ( item ) => ( {
		label: item.label,
		hits: item.hits,
		share: item.share,
	} ) );

	const coveragePercent =
		totalTracked > 0
			? Math.round( ( identifiedTotal / totalTracked ) * 100 )
			: 0;

	return (
		<div className="bbpa-device-details-card__section">
			<h4 className="bbpa-device-details-card__section-title">
				{ title }
			</h4>
			{ items.length > 0 ? (
				<div
					className="bbpa-device-details-card__chart"
					role="img"
					aria-label={ title }
				>
					<ResponsiveBar
						data={ chartData }
						keys={ [ 'hits' ] }
						indexBy="label"
						layout="horizontal"
						margin={ {
							top: 8,
							right: 16,
							bottom: 32,
							left: 140,
						} }
						padding={ 0.22 }
						valueScale={ { type: 'linear' } }
						indexScale={ { type: 'band', round: true } }
						colors={ [ '#2271b1' ] }
						enableLabel={ false }
						axisTop={ null }
						axisRight={ null }
						axisBottom={ {
							tickSize: 5,
							tickPadding: 5,
							tickRotation: 0,
						} }
						axisLeft={ {
							tickSize: 0,
							tickPadding: 10,
							tickRotation: 0,
						} }
						tooltip={ ( { indexValue, value, data } ) => (
							<div className="bbpa-device-details-card__tooltip">
								<strong>{ indexValue }</strong>
								<div>{ `${ value } • ${ data.share }%` }</div>
							</div>
						) }
						role="application"
						ariaLabel={ title }
					/>
				</div>
			) : (
				<p className="bbpa-device-details-card__empty">
					{ __(
						'Aucune donnée identifiée disponible pour cette période.',
						'bimbeau-privacy-analytics'
					) }
				</p>
			) }
			<p className="bbpa-device-details-card__basis">
				{ sprintf(
					/* translators: 1: identified page views, 2: coverage percentage, 3: total tracked page views. */
					__(
						'Basé sur %1$d pages vues identifiées, soit %2$d%% des %3$d pages vues suivies.',
						'bimbeau-privacy-analytics'
					),
					identifiedTotal,
					coveragePercent,
					totalTracked
				) }
			</p>
		</div>
	);
};

const DeviceDetailsCard = ( { range, requestParams = {} } ) => {
	const { data, isLoading, error } = useAdminEndpoint(
		'/visitors',
		{
			...range,
			...requestParams,
			page: 1,
			per_page: 500,
			orderby: 'pages',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);

	const items = data?.items || [];
	const stats = buildDeviceDetailsBreakdowns( items );
	return (
		<BpaCard title={ __( 'Device details', 'bimbeau-privacy-analytics' ) }>
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && stats.totalHits === 0 }
				emptyLabel={ __(
					'No device details available.',
					'bimbeau-privacy-analytics'
				) }
				loadingLabel={ __(
					'Loading device details…',
					'bimbeau-privacy-analytics'
				) }
			/>
			{ ! isLoading && ! error && stats.totalHits > 0 ? (
				<div className="bbpa-device-details-card__charts">
					{ CHART_SECTIONS.map( ( section ) => {
						const sectionItems = section.selectItems( stats );

						const identifiedTotal =
							section.selectIdentifiedTotal( stats );

						return (
							<BreakdownChart
								key={ section.key }
								title={ section.title }
								items={ sectionItems }
								identifiedTotal={ identifiedTotal }
								totalTracked={ stats.totalHits }
							/>
						);
					} ) }
				</div>
			) : null }
		</BpaCard>
	);
};

export default DeviceDetailsCard;
