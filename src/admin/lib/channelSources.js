import { getChannelKey } from './channelLabels';

/**
 * Referring sites of one acquisition channel, from the rows of `/referrer-sources` (one row per
 * referrer domain and channel). Rows of the same host (`www.` or not, letter case) are merged.
 *
 * @param {Object[]} items      Rows of `/referrer-sources` (`referrer_domain`, `source_category`, `visits`).
 * @param {string}   channelKey Channel key of the acquisition report (`organic-search`).
 * @return {{domain: string, visits: number}[]} Sources sorted by visits, most visits first; an
 * empty `domain` gathers the visits without referring site (campaign links opened from an e-mail).
 */
export const getChannelSources = ( items, channelKey ) => {
	if ( ! Array.isArray( items ) || ! channelKey ) {
		return [];
	}

	const visitsByDomain = new Map();
	items.forEach( ( item ) => {
		if ( getChannelKey( item?.source_category ) !== channelKey ) {
			return;
		}

		const domain = String( item?.referrer_domain || '' )
			.trim()
			.toLowerCase()
			.replace( /^www\./, '' );
		const visits =
			item?.visits !== undefined && item?.visits !== null
				? Number( item.visits ) || 0
				: Number( item?.hits ) || 0;

		visitsByDomain.set( domain, ( visitsByDomain.get( domain ) || 0 ) + visits );
	} );

	return Array.from( visitsByDomain, ( [ domain, visits ] ) => ( { domain, visits } ) )
		.filter( ( source ) => source.visits > 0 )
		.sort(
			( first, second ) =>
				second.visits - first.visits || first.domain.localeCompare( second.domain )
		);
};
