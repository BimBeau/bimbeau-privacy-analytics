/**
 * Free wp-admin REST endpoint helpers.
 */

import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';

const ADMIN_CACHE_VERSION_PARAM = '_bbpa_cv';

export const buildRestUrl = ( endpoint, params = null, options = {} ) => {
	const restUrl = ADMIN_CONFIG?.restUrl;
	const namespace = ADMIN_CONFIG?.settings?.restInternalNamespace;

	if ( ! restUrl || ! namespace ) {
		return '';
	}

	const url = new URL( restUrl, window.location.href );
	const route = [
		namespace.replace( /^\/+|\/+$/g, '' ),
		String( endpoint ).replace( /^\/+/, '' ),
	]
		.filter( Boolean )
		.join( '/' );

	if ( url.searchParams.has( 'rest_route' ) ) {
		url.searchParams.set( 'rest_route', `/${ route }` );
	} else {
		url.pathname = `${ url.pathname.replace( /\/?$/, '/' ) }${ route }`;
	}

	const mergedParams = {
		...( options.includeAdminCacheVersion !== false &&
		ADMIN_CONFIG?.settings?.adminCacheVersion
			? { [ ADMIN_CACHE_VERSION_PARAM ]: ADMIN_CONFIG.settings.adminCacheVersion }
			: {} ),
		...( params || {} ),
		...( options.volatileParams || {} ),
	};

	Object.entries( mergedParams ).forEach( ( [ key, value ] ) => {
		if ( value !== undefined && value !== null && value !== '' ) {
			url.searchParams.set( key, String( value ) );
		}
	} );

	return url.toString();
};

export const fetchAdminJson = async ( endpoint, options = {} ) => {
	const mergedParams = {
		...( options.params || {} ),
		...( options.urlOptions?.volatileParams || {} ),
	};
	const url = buildRestUrl( endpoint, mergedParams, options.urlOptions );
	if ( ! url || ! ADMIN_CONFIG?.restNonce ) {
		throw {
			message: __( 'Missing REST configuration.', 'bimbeau-privacy-analytics' ),
			isLocked: false,
		};
	}

	const response = await fetch( url, {
		body: options.body,
		cache: 'no-store',
		credentials: 'same-origin',
		headers: {
			'X-WP-Nonce': ADMIN_CONFIG.restNonce,
			...( options.headers || {} ),
		},
		method: options.method || 'GET',
		signal: options.signal,
	} );

	if ( ! response.ok ) {
		let payload = null;
		try {
			payload = await response.json();
		} catch ( error ) {
			// Use the HTTP response when WordPress does not provide a JSON error.
		}
		throw {
			status: response.status,
			code: payload?.code || 'bbpa_api_error',
			message: payload?.message || `API error (${ response.status })`,
			endpoint: url,
			isLocked: false,
		};
	}

	return response.json();
};

export const getAuthRequiredState = () => ( {
	isAuthRequired: false,
	error: null,
} );

export const subscribeAuthRequired = () => () => {};

export const useAuthRequiredState = () => getAuthRequiredState();

export const reloadForAuthRequired = () => {
	window.location.reload();
};

const useAdminEndpoint = ( endpoint, params = null, options = {} ) => {
	const enabled = options.enabled !== false;
	const [ state, setState ] = useState( { data: null, isLoading: enabled, error: null } );
	const paramsKey = useMemo( () => JSON.stringify( params || {} ), [ params ] );

	useEffect( () => {
		if ( ! enabled ) {
			setState( { data: null, isLoading: false, error: null } );
			return;
		}

		let isMounted = true;
		setState( ( current ) => ( { ...current, isLoading: true, error: null } ) );
		fetchAdminJson( endpoint, { params } )
			.then( ( data ) => {
				if ( isMounted ) {
					setState( { data, isLoading: false, error: null } );
				}
			} )
			.catch( ( error ) => {
				if ( isMounted ) {
					setState( { data: null, isLoading: false, error } );
				}
			} );

		return () => {
			isMounted = false;
		};
	}, [ enabled, endpoint, paramsKey ] );

	return state;
};

export { buildRestUrl as buildApiPath };
export default useAdminEndpoint;
