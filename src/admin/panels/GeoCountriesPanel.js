import { __, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../api/useAdminEndpoint';
import GeoCountriesStatusNotice from '../components/GeoCountriesStatusNotice';
import ReportTableCard from '../widgets/ReportTableCard';
import WorldMap from '../components/WorldMap';
import { ADMIN_CONFIG } from '../constants';
import {
	getCountryFlagClass,
	getCountryLabel,
	isUnknownCountryCode,
} from '../lib/countryNames';

const GeoCountriesPanel = ( { range } ) => {
	const { data } = useAdminEndpoint(
		'/geo-countries',
		{
			...range,
			per_page: 1,
			orderby: 'visitors',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);
	const emptyCountryLabel = __(
		'No country data available for the selected period.',
		'bimbeau-privacy-analytics'
	);
	const unknownCountryLabel = __( 'Unknown country', 'bimbeau-privacy-analytics' );
	const configStatus = data?.configStatus || null;
	const hasHits = Number( data?.totalHits || 0 ) > 0;

	const renderCountryLabel = ( label, item ) => {
		const countryCode = item?.code || item?.label || '';
		const flagClass = getCountryFlagClass( countryCode );
		const isUnknown = ! flagClass || isUnknownCountryCode( countryCode );
		const countryLabel = label || unknownCountryLabel;
		const visitors = Number( item?.visitors ?? item?.visits ?? 0 );
		const formattedVisitors = new Intl.NumberFormat().format( visitors );
		const tooltipText =
			visitors > 0
				? sprintf(
						/* translators: 1: country name, 2: visitor count. */
						__( '%1$s — %2$s visitors', 'bimbeau-privacy-analytics' ),
						countryLabel,
						formattedVisitors
				  )
				: sprintf(
						/* translators: 1: country name, 2: no data label. */
						__( '%1$s — %2$s', 'bimbeau-privacy-analytics' ),
						countryLabel,
						__( 'No data', 'bimbeau-privacy-analytics' )
				  );
		const flagLabel = isUnknown
			? __( 'Unknown country flag', 'bimbeau-privacy-analytics' )
			: sprintf(
					/* translators: %s: country name. */
					__( 'Flag of %s', 'bimbeau-privacy-analytics' ),
					countryLabel
			  );

		return (
			<span className="bbpa-country-label" title={ tooltipText }>
				{ isUnknown ? (
					<span
						className="bbpa-country-flag bbpa-country-flag--unknown"
						role="img"
						aria-label={ flagLabel }
						title={ flagLabel }
					/>
				) : (
					<span
						className={ `bbpa-country-flag ${ flagClass }` }
						role="img"
						aria-label={ flagLabel }
						title={ flagLabel }
					/>
				) }
				<span>{ countryLabel }</span>
			</span>
		);
	};

	return (
		<div className="bbpa-geo-countries-panel__content">
			<GeoCountriesStatusNotice
				configStatus={ configStatus }
				hasHits={ hasHits }
			/>
			<div className="bbpa-geo-countries-panel__split">
				<WorldMap
					range={ range }
					emptyLabel={ emptyCountryLabel }
					emptyStateNoticeStatus="warning"
					unknownCountryLabel={ unknownCountryLabel }
				/>
				<ReportTableCard
					title={ __( 'Top countries', 'bimbeau-privacy-analytics' ) }
					labelHeader={ __( 'Country', 'bimbeau-privacy-analytics' ) }
					range={ range }
					endpoint="/geo-countries"
					emptyLabel={ emptyCountryLabel }
					emptyStateNoticeStatus="warning"
					labelFallback={ unknownCountryLabel }
					formatLabel={ getCountryLabel }
					renderLabel={ renderCountryLabel }
					metricLabel={ __( 'Visitors', 'bimbeau-privacy-analytics' ) }
					metricKey="visitors"
					metricValueKey="visitors"
					metricFallbackValueKey="visits"
					metricFallbackBadgeLabel={ __( 'Legacy visits', 'bimbeau-privacy-analytics' ) }
					exportReportKey="geo-countries"
				/>
			</div>
		</div>
	);
};

export default GeoCountriesPanel;
