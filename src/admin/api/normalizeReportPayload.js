const normalizeEndpointPath = ( path ) =>
	`${ path || '' }`.split( '?', 1 )[ 0 ].replace( /\/+$/, '' );

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
 * Normalize report aliases consumed by shared admin visualizations.
 *
 * WorldMap historically reads maxHits/totalHits for every map mode. Country
 * choropleths now display visitors, so visitor-specific totals must drive the
 * scale and percentage calculations while the REST response keeps exposing
 * its original hit metrics unchanged.
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
