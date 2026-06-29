import Notice from './BrandNotice';
import { __ } from '@wordpress/i18n';

const GeoCountriesStatusNotice = ( { configStatus, hasHits } ) => {
	if ( ! configStatus ) {
		return null;
	}

	const enabled = Boolean( configStatus?.enabled );
	const maxmindConfigured = Boolean( configStatus?.maxmindConfigured );

	let status = 'info';
	let message = '';

	if ( ! enabled ) {
		status = 'warning';
		message = __( 'Enable geolocation aggregation', 'bimbeau-privacy-analytics' );
	} else if ( ! maxmindConfigured ) {
		status = 'warning';
		message = __( 'Enter the MaxMind credentials', 'bimbeau-privacy-analytics' );
	} else if ( ! hasHits ) {
		message = __( 'Traffic data is pending', 'bimbeau-privacy-analytics' );
	}

	if ( ! message ) {
		return null;
	}

	return (
		<Notice
			className="bbpa-geo-countries-status"
			status={ status }
			isDismissible={ false }
		>
			<p>{ message }</p>
		</Notice>
	);
};

export default GeoCountriesStatusNotice;
