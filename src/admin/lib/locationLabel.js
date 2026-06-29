import { __, sprintf } from '@wordpress/i18n';

const CITY_LABEL_MAX_ACCURACY_RADIUS_KM = 100;

const toFiniteNumber = ( value ) => {
	if ( value === null || value === undefined || value === '' ) {
		return null;
	}

	const number = Number( value );
	return Number.isFinite( number ) ? number : null;
};

export const getLocationLabel = ( location = {} ) => {
	const cityCandidate =
		typeof location?.city === 'string'
			? location.city
			: typeof location?.city_name === 'string'
				? location.city_name
				: typeof location?.label === 'string'
					? location.label
					: '';
	const city = cityCandidate.trim();
	const normalizedCity = city.toLowerCase();
	const approximatePositionLabel = __( 'Approximate position', 'bimbeau-privacy-analytics' )
		.trim()
		.toLowerCase();
	const approximateCityLabel = __( 'Approximate city', 'bimbeau-privacy-analytics' )
		.trim()
		.toLowerCase();
	const accuracyRadius = toFiniteNumber(
		location?.accuracy_radius ?? location?.accuracyRadius ?? null
	);
	const shouldPreferRadius =
		accuracyRadius !== null && accuracyRadius >= CITY_LABEL_MAX_ACCURACY_RADIUS_KM;

	if (
		city !== '' &&
		! shouldPreferRadius &&
		normalizedCity !== 'approximate position' &&
		normalizedCity !== approximatePositionLabel &&
		normalizedCity !== 'approximate city' &&
		normalizedCity !== approximateCityLabel
	) {
		return city;
	}

	if ( accuracyRadius !== null && accuracyRadius > 0 ) {
		return sprintf(
			/* translators: %d: geolocation accuracy radius in kilometers. */
			__( 'Approx. %d km', 'bimbeau-privacy-analytics' ),
			Math.round( accuracyRadius )
		);
	}

	const latitude = toFiniteNumber( location?.latitude ?? location?.lat ?? null );
	const longitude = toFiniteNumber(
		location?.longitude ?? location?.lng ?? location?.lon ?? null
	);
	if ( latitude !== null && longitude !== null ) {
		return __( 'Approximate position', 'bimbeau-privacy-analytics' );
	}

	return __( 'No available', 'bimbeau-privacy-analytics' );
};
