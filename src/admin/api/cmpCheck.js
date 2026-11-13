import { fetchAdminJson } from './useAdminEndpoint';

/**
 * Fetch the CMP check report.
 *
 * @param {Object}  options         Options.
 * @param {boolean} options.refresh Read the home page again instead of using the cached result.
 * @return {Promise<Object>} Report (`{ advanced_enabled, verdict, totals, daily, probe }`).
 */
export const fetchCmpCheck = ( { refresh = false } = {} ) =>
	fetchAdminJson( '/admin/cmp-check', {
		params: refresh ? { refresh: 1 } : undefined,
	} );
