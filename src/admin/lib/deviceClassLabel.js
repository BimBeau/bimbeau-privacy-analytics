import { __ } from '@wordpress/i18n';

// Device classes stored by the trackers.
const getKnownDeviceClassLabel = ( normalizedValue ) => {
	switch ( normalizedValue ) {
		case 'desktop':
			return __( 'Desktop', 'bimbeau-privacy-analytics' );
		case 'mobile':
			return __( 'Mobile', 'bimbeau-privacy-analytics' );
		case 'tablet':
			return __( 'Tablet', 'bimbeau-privacy-analytics' );
		case 'bot':
			return __( 'Bot', 'bimbeau-privacy-analytics' );
		case 'unknown':
			return __( 'Unknown', 'bimbeau-privacy-analytics' );
		default:
			return '';
	}
};

/**
 * Return the translated label of a device class.
 *
 * Other values are shown capitalized, as received.
 *
 * @param {string} value    Device class, for example `desktop`.
 * @param {string} fallback Label of an empty value.
 * @return {string} Device class label.
 */
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

	return (
		getKnownDeviceClassLabel( normalizedValue ) ||
		`${ normalizedValue.charAt( 0 ).toUpperCase() }${ normalizedValue.slice(
			1
		) }`
	);
};
