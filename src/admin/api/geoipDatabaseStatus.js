import { fetchAdminJson } from './useAdminEndpoint';

let pendingStatusRequest = null;

/**
 * Fetch the GeoIP database status, sharing a request that is still running.
 *
 * The admin shell and the Settings screen both read the status when the page
 * loads: they share a single request. Refreshes that follow a user action pass
 * `force` to always ask the server again.
 *
 * @param {Object}  options       Options.
 * @param {boolean} options.force Start a new request even if one is running.
 * @return {Promise<Object>} Status payload (`{ database: {...} }`).
 */
export const fetchGeoIpDatabaseStatus = ( { force = false } = {} ) => {
	if ( pendingStatusRequest && ! force ) {
		return pendingStatusRequest;
	}

	const request = Promise.resolve(
		fetchAdminJson( '/admin/geoip-database/status' )
	);
	const releaseRequest = () => {
		if ( pendingStatusRequest === request ) {
			pendingStatusRequest = null;
		}
	};

	pendingStatusRequest = request;
	request.then( releaseRequest, releaseRequest );

	return request;
};
