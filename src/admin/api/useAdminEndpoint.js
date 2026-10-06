/**
 * Admin REST client of the wp-admin screens.
 *
 * The request, error and data-fetching logic lives in the shared client
 * (`adminEndpointClient.js`); this module authenticates requests with the
 * WordPress REST nonce of the admin page.
 */

import { ADMIN_CONFIG } from '../constants';
import { createAdminEndpointClient } from './adminEndpointClient';

const client = createAdminEndpointClient( {
	getConfig: () => ADMIN_CONFIG,
} );

export const {
	buildRestUrl,
	clearAuthRequired,
	fetchAdminJson,
	getAdminAuthHeaders,
	getAuthRequiredState,
	handleExpiredSessionError,
	parseEndpointError,
	parseJsonResponse,
	reloadForAuthRequired,
	setAuthRequired,
	subscribeAuthRequired,
	updateAdminCacheVersion,
	useAuthRequiredState,
} = client;

const { useAdminEndpoint } = client;

export default useAdminEndpoint;
