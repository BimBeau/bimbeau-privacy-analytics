import { __ } from '@wordpress/i18n';

import { getChannelLabel } from './channelLabels';
import { getDisplayPagePath, splitPagePath } from './pagePathDisplay';

const AD_CLICK_SOURCES = {
	gclid: 'Google Ads',
	gbraid: 'Google Ads',
	wbraid: 'Google Ads',
	msclkid: 'Microsoft Ads',
};

const decodeQueryValue = ( value ) => {
	try {
		return decodeURIComponent( String( value ).replace( /\+/g, ' ' ) );
	} catch {
		return String( value );
	}
};

/**
 * Address shown under the page title in the activity feed.
 *
 * @see getDisplayPagePath
 */
export const getActivityDisplayPath = getDisplayPagePath;

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
