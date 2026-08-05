const normalizeEndpointPath = ( path ) => {
	const normalizedPath = `${ path || '' }`
		.split( '?', 1 )[ 0 ]
		.replace( /^\/+|\/+$/g, '' );

	return normalizedPath ? `/${ normalizedPath }` : '';
};

const getNonNegativeMetric = ( value ) => {
	if ( value === null || value === undefined || value === '' ) {
		return null;
	}

	const numericValue = Number( value );

	return Number.isFinite( numericValue ) && numericValue >= 0
		? numericValue
		: null;
};

/**
 * Normalize report aliases consumed by shared administration visualizations.
 *
 * WorldMap historically reads maxHits and totalHits for every map mode. The
 * country choropleth displays visitors, so visitor-specific totals must drive
 * its color scale and percentage calculations while the REST contract keeps
 * exposing the original hit metrics unchanged.
 *
 * @param {string} path    Requested endpoint path.
 * @param {*}      payload Parsed REST payload.
 * @return {*} The normalized payload, or the original value when untouched.
 */
export const normalizeAdminReportPayload = ( path, payload ) => {
	if (
		normalizeEndpointPath( path ) !== '/geo-countries' ||
		! payload ||
		typeof payload !== 'object' ||
		Array.isArray( payload )
	) {
		return payload;
	}

	const maxVisitors = getNonNegativeMetric( payload.maxVisitors );
	const totalVisitors = getNonNegativeMetric( payload.totalVisitors );

	if ( maxVisitors === null && totalVisitors === null ) {
		return payload;
	}

	return {
		...payload,
		...( maxVisitors === null ? {} : { maxHits: maxVisitors } ),
		...( totalVisitors === null ? {} : { totalHits: totalVisitors } ),
	};
};
