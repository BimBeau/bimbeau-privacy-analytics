import { _n, __, sprintf } from '@wordpress/i18n';

import { formatNumber } from './formatters';

/**
 * Pagination position of a report table, for example "Page 2 of 5".
 *
 * @param {number} page       Current page number.
 * @param {number} totalPages Number of pages.
 * @return {string} Translated label.
 */
export const formatPageOfTotal = ( page, totalPages ) =>
	sprintf(
		/* translators: 1: current page number, 2: total number of pages. */
		__( 'Page %1$d of %2$d', 'bimbeau-privacy-analytics' ),
		page,
		totalPages
	);

/**
 * Number of rows of a report table, for example "12 items".
 *
 * @param {number} count Number of rows.
 * @return {string} Translated label.
 */
export const formatItemCount = ( count ) => {
	const total = Number( count ) || 0;

	return sprintf(
		/* translators: %s: number of rows in the table. */
		_n( '%s item', '%s items', total, 'bimbeau-privacy-analytics' ),
		formatNumber( total )
	);
};
