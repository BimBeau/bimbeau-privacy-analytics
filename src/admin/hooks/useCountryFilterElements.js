import { useMemo } from '@wordpress/element';

import useAdminEndpoint from '../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../constants';
import { getCountryLabel } from '../lib/countryNames';

/**
 * Values of the Country filter of a list: the countries with visitors in the range, most visited
 * first, as DataViews filter elements (`value`: two-letter code, `label`: country name).
 *
 * @param {Object}  range           `{ start, end }` reporting range.
 * @param {Object}  options
 * @param {boolean} options.enabled Whether the countries are loaded (default true).
 * @return {Array<{value: string, label: string}>} Filter elements, empty until loaded.
 */
const useCountryFilterElements = ( range, { enabled = true } = {} ) => {
	const { data } = useAdminEndpoint(
		'/geo-countries',
		{ ...range, per_page: 250, orderby: 'visitors', order: 'desc' },
		{ namespace: ADMIN_CONFIG?.settings?.restNamespace, enabled }
	);

	return useMemo( () => {
		const rows = Array.isArray( data?.items ) ? data.items : [];
		const seen = new Set();

		return rows.reduce( ( elements, row ) => {
			const code = String( row?.country_code || row?.code || '' ).toUpperCase();
			if ( ! /^[A-Z]{2}$/.test( code ) || seen.has( code ) ) {
				return elements;
			}
			seen.add( code );
			elements.push( {
				value: code,
				label: row?.country || getCountryLabel( code ) || code,
			} );

			return elements;
		}, [] );
	}, [ data ] );
};

export default useCountryFilterElements;
