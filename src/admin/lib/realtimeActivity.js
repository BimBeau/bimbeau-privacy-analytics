import { __ } from '@wordpress/i18n';

import { getChannelLabel } from './channelLabels';

/**
 * Query parameters kept in stored page paths for attribution (settings `url_query_allowlist`), hidden from the
 * activity feed: the address shows the page, the source line shows where the visit came from.
 */
const MARKETING_QUERY_KEY = /^(utm_[a-z_]+|gclid|gbraid|wbraid|msclkid|fbclid|gad_source|gad_campaignid|_gl)$/i;

const AD_CLICK_SOURCES = {
	gclid: 'Google Ads',
	gbraid: 'Google Ads',
	wbraid: 'Google Ads',
	msclkid: 'Microsoft Ads',
};

const splitPagePath = ( pagePath ) => {
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

const decodeQueryValue = ( value ) => {
	try {
		return decodeURIComponent( String( value ).replace( /\+/g, ' ' ) );
	} catch {
		return String( value );
	}
};

/**
 * Address shown under the page title: the stored path without its marketing parameters.
 *
 * @param {string} pagePath Stored page path (`/offre?utm_source=x&gclid=y&id=3`).
 * @return {string} Display path (`/offre?id=3`).
 */
export const getActivityDisplayPath = ( pagePath ) => {
	const { path, params } = splitPagePath( pagePath );
	const kept = params.filter( ( [ key ] ) => ! MARKETING_QUERY_KEY.test( key ) );

	return kept.length > 0
		? `${ path }?${ kept.map( ( [ key, value ] ) => ( value === '' ? key : `${ key }=${ value }` ) ).join( '&' ) }`
		: path;
};

/**
 * Name of the page in the feed: its WordPress title, "Home page" for the homepage, or its address.
 *
 * @param {Object} item Activity item (`page_title`, `page_path`).
 * @return {{ label: string, hasTitle: boolean }} Label and whether it is a title (the address then goes below).
 */
export const getActivityPageLabel = ( item ) => {
	const title = typeof item?.page_title === 'string' ? item.page_title.trim() : '';
	if ( title ) {
		return { label: title, hasTitle: true };
	}

	const displayPath = getActivityDisplayPath( item?.page_path );
	if ( displayPath === '/' ) {
		return { label: __( 'Home page', 'bimbeau-privacy-analytics' ), hasTitle: true };
	}

	return {
		label: displayPath || __( 'Unknown page', 'bimbeau-privacy-analytics' ),
		hasTitle: false,
	};
};

/**
 * Source of a visit entry, in the order a reader trusts it: ad click, UTM source, referrer site, then channel.
 *
 * @param {Object} item Activity item (`page_path`, `referrer_domain`, `source_category`).
 * @return {string} Source name, or an empty string for a direct visit.
 */
export const getActivityEntrySource = ( item ) => {
	const { params } = splitPagePath( item?.page_path );
	const keys = new Map( params.map( ( [ key, value ] ) => [ key.toLowerCase(), value ] ) );

	const adClick = Object.keys( AD_CLICK_SOURCES ).find( ( key ) => keys.get( key ) );
	if ( adClick ) {
		return AD_CLICK_SOURCES[ adClick ];
	}

	const utmSource = keys.get( 'utm_source' );
	if ( utmSource ) {
		return decodeQueryValue( utmSource );
	}

	const referrerDomain = typeof item?.referrer_domain === 'string'
		? item.referrer_domain.trim().replace( /^www\./i, '' )
		: '';
	if ( referrerDomain ) {
		return referrerDomain;
	}

	const sourceCategory = typeof item?.source_category === 'string' ? item.source_category.trim() : '';
	if ( sourceCategory && sourceCategory !== 'Direct' ) {
		return getChannelLabel( sourceCategory );
	}

	return '';
};
