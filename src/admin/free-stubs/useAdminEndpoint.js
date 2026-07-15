/**
 * Free wp-admin REST endpoint helpers.
 */

import { useEffect, useMemo, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

import { ADMIN_CONFIG } from '../constants';

const buildApiPath = ( endpoint, params = null ) => {
	const path = endpoint.startsWith( '/' ) ? endpoint : `/${ endpoint }`;
	const query = new URLSearchParams();

	if ( params && typeof params === 'object' ) {
		Object.entries( params ).forEach( ( [ key, value ] ) => {
			if ( value !== undefined && value !== null && value !== '' ) {
				query.set( key, String( value ) );
			}
		} );
	}

	const version = ADMIN_CONFIG?.settings?.adminCacheVersion;
	if ( version ) {
		query.set( '_bbpa_admin_cache', String( version ) );
	}

	return `${ ADMIN_CONFIG?.restNamespace || 'bimbeau-privacy-analytics/v1' }${ path }${ query.toString() ? `?${ query.toString() }` : '' }`;
};

export const fetchAdminJson = async ( endpoint, options = {} ) => {
	const mergedParams = {
		...( options.params || {} ),
		...( options.urlOptions?.volatileParams || {} ),
	};
	const path = buildApiPath( endpoint, mergedParams );
	const requestOptions = { path };

	[ 'signal', 'method', 'data', 'body', 'headers' ].forEach( ( key ) => {
		if ( options[ key ] !== undefined ) {
			requestOptions[ key ] = options[ key ];
		}
	} );

	return apiFetch( requestOptions );
};

export const getAuthRequiredState = () => ( {
	isAuthRequired: false,
	error: null,
} );

export const subscribeAuthRequired = () => () => {};

const useAdminEndpoint = ( endpoint, params = null, options = {} ) => {
	const enabled = options.enabled !== false;
	const [ state, setState ] = useState( { data: null, isLoading: enabled, error: null } );
	const requestPath = useMemo( () => buildApiPath( endpoint, params ), [ endpoint, JSON.stringify( params || {} ) ] );

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
	}, [ enabled, requestPath ] );

	return state;
};

export { buildApiPath };
export default useAdminEndpoint;
