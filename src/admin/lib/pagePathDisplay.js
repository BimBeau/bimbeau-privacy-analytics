/**
 * Query parameters kept in stored page paths for attribution (settings `url_query_allowlist`) and hidden
 * wherever the admin shows an address: the address names the page, the Channel column names where the visit
 * came from. Every other parameter is kept, because it can name the page itself (internal search, filter,
 * pagination, language).
 */
export const MARKETING_QUERY_KEY = /^(utm_[a-z_]+|gclid|gbraid|wbraid|msclkid|fbclid|gad_source|gad_campaignid|_gl)$/i;

/**
 * Splits a stored page path into its path and its query parameters, without its fragment.
 *
 * @param {string} pagePath Stored page path (`/offre?utm_source=x&gclid=y&id=3#top`).
 * @return {{ path: string, params: Array<[string, string]> }} Path and ordered key/value pairs.
 */
export const splitPagePath = ( pagePath ) => {
	const value = typeof pagePath === 'string' ? pagePath.trim() : '';
	const hashIndex = value.indexOf( '#' );
	const withoutHash = hashIndex >= 0 ? value.slice( 0, hashIndex ) : value;
	const queryIndex = withoutHash.indexOf( '?' );

	if ( queryIndex < 0 ) {
		return { path: withoutHash, params: [] };
	}

	const params = withoutHash
		.slice( queryIndex + 1 )
		.split( '&' )
		.filter( Boolean )
		.map( ( pair ) => {
			const separator = pair.indexOf( '=' );
			return separator >= 0
				? [ pair.slice( 0, separator ), pair.slice( separator + 1 ) ]
				: [ pair, '' ];
		} );

	return { path: withoutHash.slice( 0, queryIndex ), params };
};

/**
 * Address shown to the reader: the stored path without its marketing parameters. The stored value is never
 * changed, so the complete address stays available (hover title, exports, REST).
 *
 * @param {string} pagePath Stored page path (`/offre?utm_source=x&gclid=y&id=3`).
 * @return {string} Display path (`/offre?id=3`).
 */
export const getDisplayPagePath = ( pagePath ) => {
	const { path, params } = splitPagePath( pagePath );
	const kept = params.filter( ( [ key ] ) => ! MARKETING_QUERY_KEY.test( key ) );

	return kept.length > 0
		? `${ path }?${ kept.map( ( [ key, value ] ) => ( value === '' ? key : `${ key }=${ value }` ) ).join( '&' ) }`
		: path;
};
