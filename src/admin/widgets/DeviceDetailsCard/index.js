import { ResponsiveBar } from '@nivo/bar';
import { __ } from '@wordpress/i18n';

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
	},
	{
		key: 'operating-systems',
		title: __( 'Operating systems', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.operatingSystems,
	},
	{
		key: 'browsers',
		title: __( 'Browsers', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.browsers,
	},
	{
		key: 'screen-resolutions',
		title: __( 'Screen resolutions', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.resolutions,
	},
	{
		key: 'browser-versions',
		title: __( 'Browser versions', 'bimbeau-privacy-analytics' ),
		selectItems: ( stats ) => stats.browserVersions,
	},
];

const BreakdownChart = ( { title, items } ) => {
	const chartData = items.map( ( item ) => ( {
		label: item.label,
		hits: item.hits,
		share: item.share,
	} ) );

	return (
		<div className="bbpa-device-details-card__section">
			<h4 className="bbpa-device-details-card__section-title">{ title }</h4>
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
				loadingLabel={ __( 'Loading device details…', 'bimbeau-privacy-analytics' ) }
			/>
			{ ! isLoading && ! error && stats.totalHits > 0 ? (
				<div className="bbpa-device-details-card__charts">
					{ CHART_SECTIONS.map( ( section ) => {
						const sectionItems = section.selectItems( stats );

						if ( sectionItems.length === 0 ) {
							return null;
						}

						return (
							<BreakdownChart
								key={ section.key }
								title={ section.title }
								items={ sectionItems }
							/>
						);
					} ) }
				</div>
			) : null }
		</BpaCard>
	);
};

export default DeviceDetailsCard;
