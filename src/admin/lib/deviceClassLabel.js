import { __ } from '@wordpress/i18n';

export const formatDeviceClassLabel = (
	value,
	fallback = __( 'Unknown', 'bimbeau-privacy-analytics' )
) => {
	const normalizedValue = String( value || '' )
		.trim()
		.toLowerCase();

	if ( ! normalizedValue ) {
		return fallback;
	}

	return `${ normalizedValue
		.charAt( 0 )
		.toUpperCase() }${ normalizedValue.slice( 1 ) }`;
};
