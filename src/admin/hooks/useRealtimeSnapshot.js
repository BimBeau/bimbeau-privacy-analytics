import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	fetchAdminJson,
	getAuthRequiredState,
	subscribeAuthRequired,
} from '../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../constants';

const ACTIVE_POLL_INTERVAL_MS = 5000;
const IDLE_POLL_INTERVAL_MS = 15000;
const NON_REALTIME_POLL_INTERVAL_MS = 60000;
// Failed requests are retried with a doubling delay, capped at five minutes.
const MAX_ERROR_BACKOFF_MS = 300000;
// A request without an answer after this delay is settled as a failure, so a
// hung connection cannot block the polling.
const REQUEST_TIMEOUT_MS = 30000;

/*
 * One snapshot store is shared by every consumer of the page (header counter,
 * Real-time panel, dashboard KPI). Polling runs while at least one mounted
 * consumer enables it, with one request at a time: a tick that comes while a
 * request is still running is skipped, and the next poll is scheduled when the
 * request settles.
 */
const realtimeStore = {
	data: null,
	error: null,
	isLoading: false,
	listeners: new Set(),
	// Consumers that enable polling, mapped to "is the Real-time panel".
	pollers: new Map(),
	timeoutId: null,
	activeController: null,
	lastFetchAt: 0,
	// When the last request (success or failure) settled.
	lastSettledAt: 0,
	consecutiveErrors: 0,
};

const notifyListeners = () => {
	realtimeStore.listeners.forEach( ( listener ) => {
		listener( {
			data: realtimeStore.data,
			error: realtimeStore.error,
			isLoading: realtimeStore.isLoading,
		} );
	} );
};

const normalizeRealtimeError = ( fetchError ) => {
	if ( typeof fetchError === 'object' && fetchError !== null ) {
		return fetchError;
	}

	return {
		message:
			fetchError?.message ||
			__( 'Loading error.', 'bimbeau-privacy-analytics' ),
		isLocked: false,
	};
};

const isDocumentHidden = () =>
	typeof document !== 'undefined' && Boolean( document.hidden );

const getBasePollIntervalMs = ( isRealtimePanel ) => {
	if ( ! isRealtimePanel ) {
		return NON_REALTIME_POLL_INTERVAL_MS;
	}

	return isDocumentHidden() ? IDLE_POLL_INTERVAL_MS : ACTIVE_POLL_INTERVAL_MS;
};

const hasRealtimePanelPoller = () =>
	Array.from( realtimeStore.pollers.values() ).some( Boolean );

const isPollingActive = () =>
	realtimeStore.pollers.size > 0 &&
	! getAuthRequiredState().isAuthRequired;

/**
 * Delay before the next poll, or null while polling is suspended.
 *
 * Outside the Real-time panel the counter is not visible in a hidden tab, so
 * polling pauses until the tab is visible again.
 *
 * @return {number|null} Delay in milliseconds.
 */
const getNextPollDelayMs = () => {
	const isRealtimePanel = hasRealtimePanelPoller();
	if ( ! isRealtimePanel && isDocumentHidden() ) {
		return null;
	}

	const baseIntervalMs = getBasePollIntervalMs( isRealtimePanel );
	if ( realtimeStore.consecutiveErrors <= 0 ) {
		return baseIntervalMs;
	}

	const backoffMs =
		baseIntervalMs * 2 ** Math.min( realtimeStore.consecutiveErrors, 10 );
	return Math.min(
		backoffMs,
		Math.max( baseIntervalMs, MAX_ERROR_BACKOFF_MS )
	);
};

const clearScheduledPoll = () => {
	if ( realtimeStore.timeoutId ) {
		window.clearTimeout( realtimeStore.timeoutId );
		realtimeStore.timeoutId = null;
	}
};

const stopRealtimePolling = () => {
	clearScheduledPoll();

	if ( realtimeStore.activeController ) {
		realtimeStore.activeController.abort();
		realtimeStore.activeController = null;
	}
};

const scheduleNextPoll = () => {
	clearScheduledPoll();

	// The request in flight schedules the next poll when it settles.
	if ( ! isPollingActive() || realtimeStore.activeController ) {
		return;
	}

	const delayMs = getNextPollDelayMs();
	if ( delayMs === null ) {
		return;
	}

	// Focus and visibility changes re-arm the timer: after a failure, keep the
	// retry at its due time (last failure + backoff) instead of postponing it.
	const timerDelayMs =
		realtimeStore.consecutiveErrors > 0 && realtimeStore.lastSettledAt > 0
			? Math.max(
					0,
					realtimeStore.lastSettledAt + delayMs - Date.now()
			  )
			: delayMs;

	realtimeStore.timeoutId = window.setTimeout( () => {
		realtimeStore.timeoutId = null;
		fetchRealtimeSnapshot( { showLoading: false } );
	}, timerDelayMs );
};

const fetchRealtimeSnapshot = async ( { showLoading = false } = {} ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}

	// Never cancel and restart a slow request: wait for it instead.
	if ( realtimeStore.activeController ) {
		return;
	}

	clearScheduledPoll();
	const controller = new AbortController();
	realtimeStore.activeController = controller;

	if ( showLoading ) {
		realtimeStore.isLoading = true;
		notifyListeners();
	}

	let isFinished = false;
	let requestTimeoutId = null;

	// Settles the request once: by its answer, or by the timeout below.
	const finishRequest = ( { status, payload = null, error = null } ) => {
		if ( isFinished ) {
			return;
		}
		isFinished = true;
		window.clearTimeout( requestTimeoutId );

		// stopRealtimePolling() may already have released this controller.
		if ( realtimeStore.activeController === controller ) {
			realtimeStore.activeController = null;
		}

		if ( showLoading ) {
			realtimeStore.isLoading = false;
		}

		if ( status === 'aborted' ) {
			if ( showLoading ) {
				notifyListeners();
			}
			return;
		}

		if ( status === 'success' ) {
			realtimeStore.data = payload;
			realtimeStore.error = null;
			realtimeStore.lastFetchAt = Date.now();
			realtimeStore.consecutiveErrors = 0;
		} else {
			realtimeStore.error = normalizeRealtimeError( error );
			realtimeStore.consecutiveErrors += 1;
		}

		realtimeStore.lastSettledAt = Date.now();
		notifyListeners();
		scheduleNextPoll();
	};

	requestTimeoutId = window.setTimeout( () => {
		// Polling was stopped meanwhile: the abort already settles the request.
		if ( realtimeStore.activeController !== controller ) {
			return;
		}

		finishRequest( {
			status: 'error',
			error: {
				code: 'bbpa_realtime_timeout',
				message: __( 'Loading error.', 'bimbeau-privacy-analytics' ),
				isLocked: false,
			},
		} );
		controller.abort();
	}, REQUEST_TIMEOUT_MS );

	try {
		const payload = await fetchAdminJson( '/admin/realtime', {
			signal: controller.signal,
			urlOptions: {
				volatileParams: {
					bbpa_realtime_t: Date.now(),
				},
			},
		} );

		finishRequest(
			controller.signal.aborted
				? { status: 'aborted' }
				: { status: 'success', payload }
		);
	} catch ( fetchError ) {
		finishRequest(
			fetchError?.name === 'AbortError' || controller.signal.aborted
				? { status: 'aborted' }
				: { status: 'error', error: fetchError }
		);
	}
};

const fetchRealtimeSnapshotIfStale = ( maxAgeMs = ACTIVE_POLL_INTERVAL_MS ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}
	if ( realtimeStore.activeController ) {
		return;
	}

	const hasData = realtimeStore.data !== null || realtimeStore.error !== null;
	if ( ! hasData ) {
		fetchRealtimeSnapshot( { showLoading: true } );
		return;
	}

	// After a failure, the backoff timer retries: focus changes do not.
	if ( realtimeStore.consecutiveErrors > 0 ) {
		return;
	}

	if (
		realtimeStore.lastFetchAt === 0 ||
		Date.now() - realtimeStore.lastFetchAt >= maxAgeMs
	) {
		fetchRealtimeSnapshot( { showLoading: false } );
	}
};

/**
 * Bring polling in line with the mounted consumers and the tab visibility.
 */
const refreshRealtimePolling = () => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}

	if ( ! isPollingActive() ) {
		return;
	}

	const isFirstLoad =
		realtimeStore.data === null && realtimeStore.error === null;
	if ( isFirstLoad ) {
		fetchRealtimeSnapshot( { showLoading: true } );
		return;
	}

	if ( getNextPollDelayMs() === null ) {
		clearScheduledPoll();
		return;
	}

	fetchRealtimeSnapshotIfStale(
		getBasePollIntervalMs( hasRealtimePanelPoller() )
	);
	scheduleNextPoll();
};

const getRealtimeState = () => ( {
	data: realtimeStore.data,
	error: realtimeStore.error,
	isLoading: realtimeStore.isLoading,
} );

const isRealtimePanelFromLocation = () => {
	if ( typeof window === 'undefined' ) {
		return false;
	}

	const params = new URLSearchParams( window.location.search || '' );
	const page = params.get( 'page' ) || '';
	const pluginSlug = ADMIN_CONFIG?.settings?.slug || 'bimbeau-privacy-analytics';
	return page === `${ pluginSlug }-realtime`;
};

const isRealtimePanelActive = ( currentPanel ) => {
	if ( currentPanel === 'realtime' ) {
		return true;
	}

	if ( ADMIN_CONFIG?.currentPanel === 'realtime' ) {
		return true;
	}

	return isRealtimePanelFromLocation();
};

const useRealtimeSnapshot = ( {
	enabled = true,
	currentPanel = null,
} = {} ) => {
	const [ state, setState ] = useState( () => getRealtimeState() );
	const isRealtimePanel = isRealtimePanelActive( currentPanel );
	const isPollingEnabled = enabled;

	useEffect( () => {
		const pollerToken = {};
		const handleStoreUpdate = ( nextState ) => {
			setState( nextState );
		};

		realtimeStore.listeners.add( handleStoreUpdate );
		setState( getRealtimeState() );
		if ( isPollingEnabled ) {
			realtimeStore.pollers.set( pollerToken, isRealtimePanel );
			refreshRealtimePolling();
		}

		const unsubscribeAuthRequired = subscribeAuthRequired(
			( nextState ) => {
				if ( nextState.isAuthRequired ) {
					stopRealtimePolling();
				}
			}
		);

		const handleVisibilityOrFocusChange = () => {
			if ( ! isPollingEnabled ) {
				return;
			}
			refreshRealtimePolling();
		};
		document.addEventListener(
			'visibilitychange',
			handleVisibilityOrFocusChange
		);
		window.addEventListener( 'focus', handleVisibilityOrFocusChange );

		return () => {
			unsubscribeAuthRequired();
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityOrFocusChange
			);
			window.removeEventListener(
				'focus',
				handleVisibilityOrFocusChange
			);
			realtimeStore.listeners.delete( handleStoreUpdate );

			if ( isPollingEnabled ) {
				realtimeStore.pollers.delete( pollerToken );
				if ( realtimeStore.pollers.size === 0 ) {
					stopRealtimePolling();
				} else {
					// The remaining consumers may poll at another interval.
					scheduleNextPoll();
				}
			}
		};
	}, [ isPollingEnabled, isRealtimePanel ] );

	return {
		data: state.data,
		error: state.error,
		isLoading: state.isLoading,
		pollIntervalMs: getBasePollIntervalMs( isRealtimePanel ),
	};
};

export default useRealtimeSnapshot;
