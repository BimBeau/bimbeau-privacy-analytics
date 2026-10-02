/**
 * Shared admin REST client.
 *
 * Both admin bundles use this request, error, session and data-fetching
 * logic. An edition module creates one client and only supplies how requests
 * are authenticated (see `wpAdminAuthStrategy` below and
 * `api/useAdminEndpoint.js`), so a fix made here reaches every bundle.
 */

import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { isAdminDebugEnabled } from '../lib/runtimeConfig';

export const ADMIN_CACHE_VERSION_PARAM = '_bbpa_cv';

/**
 * Default authentication strategy: the WordPress REST nonce of the admin page.
 *
 * Every hook receives the current admin configuration; the hooks that act on
 * the session state also receive the client session store.
 */
export const wpAdminAuthStrategy = Object.freeze( {
	/**
	 * Headers that authenticate a request.
	 *
	 * @param {Object|null} config Admin configuration.
	 * @return {Object} Request headers.
	 */
	getAuthHeaders: ( config ) =>
		config?.restNonce ? { 'X-WP-Nonce': config.restNonce } : {},
	/**
	 * Whether the page received the credentials needed to send requests.
	 *
	 * @param {Object|null} config Admin configuration.
	 * @return {boolean} True when requests can be authenticated.
	 */
	hasCredentials: ( config ) => Boolean( config?.restNonce ),
	/**
	 * Whether an error response means that the session of the page expired.
	 *
	 * @param {Object} response        Error response details.
	 * @param {number} response.status HTTP status.
	 * @param {string} response.code   REST error code.
	 * @return {boolean} True for an expired session.
	 */
	isExpiredSession: ( { status, code } ) =>
		status === 403 && code === 'rest_cookie_invalid_nonce',
	/**
	 * Message and action label of an expired session error, or null to keep
	 * the server message.
	 *
	 * @return {Object|null} `{ message, actionLabel }` or null.
	 */
	getExpiredSessionLabels: () => null,
	/**
	 * Throw before sending a request that must not be sent.
	 */
	assertRequestAllowed: () => {},
	/**
	 * React to an expired session.
	 *
	 * The REST nonce of this page has expired: every later request fails the
	 * same way, so show the reload screen and stop the polling. The shell
	 * displays its own session message; the error keeps the status, code and
	 * endpoint for the debug diagnostics.
	 *
	 * @param {Object}      endpointError Parsed error.
	 * @param {Object|null} config        Admin configuration.
	 * @param {Object}      session       Client session store.
	 */
	onExpiredSession: ( endpointError, config, session ) => {
		session.setAuthRequired( {
			...endpointError,
			message: '',
			actionLabel: '',
			isAuthRequired: true,
		} );
	},
	/**
	 * React to a successful response.
	 */
	onRequestSuccess: () => {},
	/**
	 * Whether data hooks must stop sending requests.
	 *
	 * @return {boolean} True to skip requests.
	 */
	shouldSkipRequests: () => false,
	/**
	 * Run before the page reloads from the expired session screen.
	 */
	beforeReload: () => {},
} );

const createSessionStore = () => {
	const store = {
		isAuthRequired: false,
		error: null,
		listeners: new Set(),
	};

	const getAuthRequiredState = () => ( {
		isAuthRequired: store.isAuthRequired,
		error: store.error,
	} );

	const notifyListeners = () => {
		store.listeners.forEach( ( listener ) => {
			listener( getAuthRequiredState() );
		} );
	};

	return {
		getAuthRequiredState,
		subscribeAuthRequired: ( listener ) => {
			store.listeners.add( listener );
			return () => store.listeners.delete( listener );
		},
		setAuthRequired: ( error = null ) => {
			store.isAuthRequired = true;
			store.error = error;
			notifyListeners();
		},
		clearAuthRequired: () => {
			store.isAuthRequired = false;
			store.error = null;
			notifyListeners();
		},
	};
};

/**
 * Parse a successful JSON response, with diagnostics for invalid bodies.
 *
 * @param {Response} response Fetch response.
 * @return {Promise<*>} Parsed payload.
 */
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
			} catch {
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

/**
 * Create the admin REST client of an edition.
 *
 * @param {Object}   options           Client options.
 * @param {Function} options.getConfig Returns the admin configuration object.
 * @param {Object}   options.strategy  Authentication hooks overriding
 *                                     `wpAdminAuthStrategy`.
 * @return {Object} Client functions and the `useAdminEndpoint` hook.
 */
export const createAdminEndpointClient = ( {
	getConfig = () => null,
	strategy: strategyOverrides = {},
} = {} ) => {
	const strategy = { ...wpAdminAuthStrategy, ...strategyOverrides };
	const session = createSessionStore();
	const {
		getAuthRequiredState,
		subscribeAuthRequired,
		setAuthRequired,
		clearAuthRequired,
	} = session;

	const reloadForAuthRequired = () => {
		strategy.beforeReload( getConfig(), session );
		if ( typeof window !== 'undefined' && window.location ) {
			window.location.reload();
		}
	};

	const useAuthRequiredState = () => {
		const [ state, setState ] = useState( () => getAuthRequiredState() );

		useEffect( () => subscribeAuthRequired( setState ), [] );

		return state;
	};

	/**
	 * Use a new admin cache version for the next requests.
	 *
	 * `buildRestUrl()` sends the cache version of the admin configuration with
	 * every request, so the reports stop reusing cached responses after a
	 * settings change.
	 *
	 * @param {number} version New cache version.
	 */
	const updateAdminCacheVersion = ( version ) => {
		const config = getConfig();
		if ( config?.settings ) {
			config.settings.adminCacheVersion = version;
		}
	};

	/**
	 * Authentication headers of admin REST requests.
	 *
	 * Built by the edition strategy; an empty nonce header is never sent
	 * (WordPress rejects an empty X-WP-Nonce before the route permissions
	 * run). Requests sent outside fetchAdminJson(), such as file exports, use
	 * the same headers.
	 *
	 * @return {Object} Request headers.
	 */
	const getAdminAuthHeaders = () => strategy.getAuthHeaders( getConfig() );

	const buildRestUrl = ( path, params, namespace, options = {} ) => {
		const config = getConfig();
		const base = config?.restUrl ? `${ config.restUrl }` : '';
		const resolvedNamespace =
			namespace ?? ( config?.settings?.restInternalNamespace || '' );
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
			config?.settings?.adminCacheVersion
				? {
						[ ADMIN_CACHE_VERSION_PARAM ]:
							config.settings.adminCacheVersion,
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

	const parseEndpointError = async ( response, endpoint = '' ) => {
		let payload = null;

		try {
			payload = await response.json();
		} catch {
			payload = null;
		}

		const config = getConfig();
		const errorCode = payload?.code || 'bbpa_api_error';
		const endpointLabel = endpoint || response.url || '';
		const isExpiredSession = Boolean(
			strategy.isExpiredSession(
				{ status: response.status, code: errorCode },
				config
			)
		);
		const expiredSessionLabels = isExpiredSession
			? strategy.getExpiredSessionLabels( config )
			: null;
		const explicitMessage =
			expiredSessionLabels?.message ||
			payload?.message ||
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
			actionLabel: expiredSessionLabels?.actionLabel || '',
			upgradeUrl: '',
			// Error details of the REST response, such as `field_errors`.
			data: payload?.data ?? null,
		};
	};

	const fetchAdminJson = async ( path, options = {} ) => {
		const {
			body,
			headers = {},
			method = 'GET',
			namespace,
			params,
			signal,
			urlOptions,
		} = options;
		const config = getConfig();

		strategy.assertRequestAllowed( config, session );

		if ( ! config?.restUrl || ! strategy.hasCredentials( config ) ) {
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
				...getAdminAuthHeaders(),
				...( isAdminDebugEnabled( config )
					? { 'X-BBPA-Debug': '1' }
					: {} ),
				...headers,
			},
			method,
			signal,
		} );

		if ( ! response.ok ) {
			const endpointError = await parseEndpointError( response, endpoint );
			if ( endpointError.isExpiredSession ) {
				strategy.onExpiredSession( endpointError, config, session );
			}
			throw endpointError;
		}

		const payload = await parseJsonResponse( response );
		strategy.onRequestSuccess( config, session );
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
			keepPreviousData = false,
			namespace = getConfig()?.settings?.restInternalNamespace,
			urlOptions,
		} = options;
		// Compared by value like params: an inline urlOptions object must not
		// restart the request on every render.
		const urlOptionsKey = useMemo(
			() => JSON.stringify( urlOptions ?? null ),
			[ urlOptions ]
		);
		const resolvedUrlOptions = useMemo(
			() => JSON.parse( urlOptionsKey ) ?? undefined,
			[ urlOptionsKey ]
		);

		useEffect( () => {
			if ( strategy.shouldSkipRequests( getConfig(), session ) ) {
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
				if ( ! keepPreviousData ) {
					setData( null );
				}
				try {
					const payload = await fetchAdminJson( path, {
						namespace,
						params: resolvedParams,
						signal: controller.signal,
						urlOptions: resolvedUrlOptions,
					} );

					if ( isMounted ) {
						setData( payload );
					}
				} catch ( fetchError ) {
					if ( isMounted && fetchError.name !== 'AbortError' ) {
						// keepPreviousData only bridges the loading time: the
						// data of the previous request must not stay on screen
						// as the answer of a request that failed.
						setData( null );
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
		}, [
			enabled,
			keepPreviousData,
			namespace,
			path,
			paramsKey,
			resolvedParams,
			resolvedUrlOptions,
		] );

		return { data, isLoading, error };
	};

	return {
		buildRestUrl,
		clearAuthRequired,
		fetchAdminJson,
		getAdminAuthHeaders,
		getAuthRequiredState,
		parseEndpointError,
		parseJsonResponse,
		reloadForAuthRequired,
		setAuthRequired,
		subscribeAuthRequired,
		updateAdminCacheVersion,
		useAdminEndpoint,
		useAuthRequiredState,
	};
};
