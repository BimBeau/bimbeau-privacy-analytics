import { __ } from '@wordpress/i18n';

/**
 * Return the country-level location label available in the Free edition.
 */
export const getLocationLabel = ( location = {} ) => {
	const country = typeof location?.country === 'string'
		? location.country.trim()
		: '';

	return country || __( 'No available', 'bimbeau-privacy-analytics' );
};
