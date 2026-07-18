import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';

const DEBUG_FLAG = () =>
	Boolean( window.BBPA_DEBUG ?? ADMIN_CONFIG?.settings?.debugEnabled );

const ADMIN_CACHE_VERSION_PARAM = '_bbpa_cv';
let APP_NONCE_RELOAD_STORAGE_KEY = 'bbpa-admin-nonce-reload-attempted';


const AUTH_REQUIRED_ERROR_CODES = new Set( [
	'rest_cookie_invalid_nonce',
	'bbpa_auth_required',
	'bbpa_invalid_rest_nonce',
	'bbpa_invalid_app_nonce',
] );

const authRequiredStore = {
	isAuthRequired: false,
	error: null,
	listeners: new Set(),
};

const notifyAuthRequiredListeners = () => {
	authRequiredStore.listeners.forEach( ( listener ) => {
		listener( getAuthRequiredState() );
	} );
};

export const getAuthRequiredState = () => ( {
	isAuthRequired: authRequiredStore.isAuthRequired,
	error: authRequiredStore.error,
} );

export const subscribeAuthRequired = ( listener ) => {
	authRequiredStore.listeners.add( listener );
	return () => authRequiredStore.listeners.delete( listener );
};

export const setAuthRequired = ( error = null ) => {
	authRequiredStore.isAuthRequired = true;
	authRequiredStore.error = error;
	notifyAuthRequiredListeners();
};

export const clearAuthRequired = () => {
	authRequiredStore.isAuthRequired = false;
	authRequiredStore.error = null;
	notifyAuthRequiredListeners();
};

export const clearAppNonceReloadAttempt = () => {
	try {
		window.sessionStorage?.removeItem( APP_NONCE_RELOAD_STORAGE_KEY );
	} catch ( error ) {
		// Ignore storage cleanup failures.
	}
};

export const reloadForAuthRequired = () => {
	clearAppNonceReloadAttempt();
	if ( typeof window !== 'undefined' && window.location ) {
		window.location.reload();
	}
};

export const useAuthRequiredState = () => {
	const [ state, setState ] = useState( () => getAuthRequiredState() );

	useEffect( () => subscribeAuthRequired( setState ), [] );

	return state;
};

const triggerAppNonceReload = () => {
	if (
		ADMIN_CONFIG?.settings?.appMode !== 'app' ||
		typeof window === 'undefined' ||
		! window.location
	) {
		return false;
	}

	try {
		if ( window.sessionStorage?.getItem( APP_NONCE_RELOAD_STORAGE_KEY ) ) {
			return false;
		}
		window.sessionStorage?.setItem( APP_NONCE_RELOAD_STORAGE_KEY, '1' );
	} catch ( error ) {
		// Continue with a normal reload when sessionStorage is unavailable.
	}

	window.location.reload();
	return true;
};

export const buildRestUrl = ( path, params, namespace, options = {} ) => {
	const base = ADMIN_CONFIG?.restUrl ? `${ ADMIN_CONFIG.restUrl }` : '';
	const resolvedNamespace =
		namespace ?? ( ADMIN_CONFIG?.settings?.restInternalNamespace || '' );
	const url = new URL( base );
	const normalizedNamespace = `${ resolvedNamespace }`.replace(
		/^\/+|\/+$/g,
		''
	);
	const normalizedPath = `${ path }`.replace( /^\/+/, '' );
	const routePath = [ normalizedNamespace, normalizedPath ]
		.filter( Boolean )
		.join( '/' );

	if ( url.searchParams.has( 'rest_route' ) ) {
		url.searchParams.set( 'rest_route', `/${ routePath }` );
	} else {
		const basePath = url.pathname.endsWith( '/' )
			? url.pathname
			: `${ url.pathname }/`;
		url.pathname = `${ basePath }${ routePath }`;
	}
	const mergedParams = {
		...( options?.includeAdminCacheVersion !== false &&
		ADMIN_CONFIG?.settings?.adminCacheVersion
			? {
					[ ADMIN_CACHE_VERSION_PARAM ]:
						ADMIN_CONFIG.settings.adminCacheVersion,
			  }
			: {} ),
		...( params || {} ),
		...( options?.volatileParams || {} ),
	};

	Object.entries( mergedParams ).forEach( ( [ key, value ] ) => {
		if ( value !== undefined && value !== null && value !== '' ) {
			url.searchParams.set( key, value );
		}
	} );

	return url.toString();
};

export const isAppSessionExpiredErrorCode = ( code ) =>
	AUTH_REQUIRED_ERROR_CODES.has( code );

export const parseEndpointError = async ( response, endpoint = '' ) => {
	let payload = null;

	try {
		payload = await response.json();
	} catch ( error ) {
		payload = null;
	}

	const errorCode = payload?.code || 'bbpa_api_error';
	const endpointLabel = endpoint || response.url || '';
	const isAuthStatus = response.status === 401 || response.status === 403;
	const isExpiredSession =
		ADMIN_CONFIG?.settings?.appMode === 'app'
			? isAuthStatus && isAppSessionExpiredErrorCode( errorCode )
			: response.status === 403 &&
			  errorCode === 'rest_cookie_invalid_nonce';
	const explicitMessage = isExpiredSession
		? __(
				'Session expired, reload the application.',
				'bimbeau-privacy-analytics'
		  )
		: payload?.message ||
		  `${ __( 'API error', 'bimbeau-privacy-analytics' ) } (${
				response.status
		  })`;
	return {
		status: response.status,
		code: errorCode,
		message: explicitMessage,
		endpoint: endpointLabel,
		isLocked: false,
		isExpiredSession,
		actionLabel: isExpiredSession
			? __( 'Reload application', 'bimbeau-privacy-analytics' )
			: '',
		upgradeUrl: '',
	};
};

export const parseJsonResponse = async ( response ) => {
	const contentType = response.headers?.get?.( 'content-type' ) || '';
	const diagnosticsResponse =
		typeof response.clone === 'function' ? response.clone() : null;

	try {
		return await response.json();
	} catch ( error ) {
		const isJsonResponse = contentType.includes( 'application/json' );
		let rawBody = '';
		if (
			diagnosticsResponse &&
			typeof diagnosticsResponse.text === 'function'
		) {
			try {
				rawBody = await diagnosticsResponse.text();
			} catch ( bodyError ) {
				rawBody = '';
			}
		}
		const compactBody = rawBody.replace( /\s+/g, ' ' ).trim();
		const bodyPreview =
			compactBody.length > 180
				? `${ compactBody.slice( 0, 180 ) }…`
				: compactBody;
		const urlLabel =
			response.url ||
			__( 'unknown endpoint', 'bimbeau-privacy-analytics' );
		const statusLabel = response.status
			? `HTTP ${ response.status }`
			: __( 'unknown status', 'bimbeau-privacy-analytics' );
		const genericMessage = isJsonResponse
			? __(
					'The server returned invalid JSON. Check the endpoint response preview for details.',
					'bimbeau-privacy-analytics'
			  )
			: __(
					'The server returned an unexpected response. Check the endpoint response preview for details.',
					'bimbeau-privacy-analytics'
			  );
		const parseReason =
			error &&
			typeof error.message === 'string' &&
			error.message.trim() !== ''
				? error.message.trim()
				: '';
		const messageWithReason = parseReason
			? `${ genericMessage } ${ __(
					'Parser error:',
					'bimbeau-privacy-analytics'
			  ) } ${ parseReason }`
			: genericMessage;

		throw {
			status: response.status,
			code: 'bbpa_invalid_json',
			message: `${ messageWithReason } (${ statusLabel })`,
			details: {
				endpoint: urlLabel,
				contentType,
				preview:
					bodyPreview ||
					__( 'Empty response body.', 'bimbeau-privacy-analytics' ),
			},
			isLocked: false,
			originalError: error,
		};
	}
};

export const fetchAdminJson = async ( path, options = {} ) => {
	const {
		body,
		headers = {},
		method = 'GET',
		namespace,
		params,
		signal,
		urlOptions,
	} = options;

	const isAppMode = ADMIN_CONFIG?.settings?.appMode === 'app';
	if ( isAppMode && getAuthRequiredState().isAuthRequired ) {
		throw (
			getAuthRequiredState().error || {
				message: __(
					'Session expired, reload the application.',
					'bimbeau-privacy-analytics'
				),
				isExpiredSession: true,
				isAuthRequired: true,
				isLocked: false,
			}
		);
	}
	const appNonce = ADMIN_CONFIG?.appNonce;
	const restNonce = ADMIN_CONFIG?.restNonce;
	const authHeaders = isAppMode
		? {
				...( appNonce ? { 'X-BBPA-App-Nonce': appNonce } : {} ),
		  }
		: {
				...( restNonce ? { 'X-WP-Nonce': restNonce } : {} ),
		  };

	if ( ! ADMIN_CONFIG?.restUrl || ( ! appNonce && ! restNonce ) ) {
		throw {
			message: __(
				'Missing REST configuration.',
				'bimbeau-privacy-analytics'
			),
			isLocked: false,
		};
	}

	const endpoint = buildRestUrl( path, params, namespace, urlOptions );
	const response = await fetch( endpoint, {
		body,
		cache: 'no-store',
		credentials: 'same-origin',
		headers: {
			...authHeaders,
			...( DEBUG_FLAG() ? { 'X-BBPA-Debug': '1' } : {} ),
			...headers,
		},
		method,
		signal,
	} );

	if ( ! response.ok ) {
		const endpointError = await parseEndpointError( response, endpoint );
		if ( endpointError.isExpiredSession && isAppMode ) {
			const didReload = triggerAppNonceReload();
			if ( ! didReload ) {
				setAuthRequired( {
					...endpointError,
					isAuthRequired: true,
				} );
			}
		}
		throw endpointError;
	}

	const payload = await parseJsonResponse( response );
	if ( isAppMode ) {
		clearAppNonceReloadAttempt();
		clearAuthRequired();
	}
	return payload;
};

const useAdminEndpoint = ( path, params, options = {} ) => {
	const [ data, setData ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const paramsKey = useMemo(
		() => JSON.stringify( params ?? {} ),
		[ params ]
	);
	const resolvedParams = useMemo(
		() => JSON.parse( paramsKey ),
		[ paramsKey ]
	);
	const {
		enabled = true,
		namespace = ADMIN_CONFIG?.settings?.restInternalNamespace,
		urlOptions,
	} = options;

	useEffect( () => {
		if (
			ADMIN_CONFIG?.settings?.appMode === 'app' &&
			getAuthRequiredState().isAuthRequired
		) {
			setIsLoading( false );
			setError( null );
			return undefined;
		}

		if ( ! enabled || ! path ) {
			setIsLoading( false );
			setError( null );
			setData( null );
			return undefined;
		}

		let isMounted = true;
		const controller = new AbortController();

		const fetchData = async () => {
			setIsLoading( true );
			setError( null );
			setData( null );
			try {
				const payload = await fetchAdminJson( path, {
					namespace,
					params: resolvedParams,
					signal: controller.signal,
					urlOptions,
				} );

				if ( isMounted ) {
					setData( payload );
				}
			} catch ( fetchError ) {
				if ( isMounted && fetchError.name !== 'AbortError' ) {
					setError(
						typeof fetchError === 'object' && fetchError !== null
							? fetchError
							: {
									message:
										fetchError?.message ||
										__(
											'Loading error.',
											'bimbeau-privacy-analytics'
										),
									isLocked: false,
							  }
					);
				}
			} finally {
				if ( isMounted ) {
					setIsLoading( false );
				}
			}
		};

		fetchData();

		return () => {
			isMounted = false;
			controller.abort();
		};
	}, [ enabled, namespace, path, paramsKey, resolvedParams, urlOptions ] );

	return { data, isLoading, error };
};

export default useAdminEndpoint;
