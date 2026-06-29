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

const realtimeStore = {
	data: null,
	error: null,
	isLoading: false,
	listeners: new Set(),
	intervalId: null,
	activeController: null,
	lastFetchAt: 0,
	currentPollIntervalMs: null,
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

const fetchRealtimeSnapshot = async ( { showLoading = false } = {} ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}
	if ( showLoading ) {
		realtimeStore.isLoading = true;
		notifyListeners();
	}

	if ( realtimeStore.activeController ) {
		realtimeStore.activeController.abort();
	}

	const controller = new AbortController();
	realtimeStore.activeController = controller;

	try {
		const payload = await fetchAdminJson( '/admin/realtime', {
			signal: controller.signal,
			urlOptions: {
				volatileParams: {
					bbpa_realtime_t: Date.now(),
				},
			},
		} );

		realtimeStore.data = payload;
		realtimeStore.error = null;
		realtimeStore.lastFetchAt = Date.now();
	} catch ( fetchError ) {
		if ( fetchError?.name === 'AbortError' ) {
			return;
		}

		realtimeStore.error = normalizeRealtimeError( fetchError );
	} finally {
		if ( showLoading ) {
			realtimeStore.isLoading = false;
		}
		realtimeStore.activeController = null;
		notifyListeners();
	}
};

const getDesiredPollIntervalMs = ( isRealtimePanel ) => {
	if ( ! isRealtimePanel ) {
		return NON_REALTIME_POLL_INTERVAL_MS;
	}

	if ( typeof document !== 'undefined' && document.hidden ) {
		return IDLE_POLL_INTERVAL_MS;
	}

	return ACTIVE_POLL_INTERVAL_MS;
};

const fetchRealtimeSnapshotIfStale = ( maxAgeMs = ACTIVE_POLL_INTERVAL_MS ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}
	if ( realtimeStore.isLoading ) {
		return;
	}

	const hasData = realtimeStore.data !== null || realtimeStore.error !== null;
	if ( ! hasData ) {
		fetchRealtimeSnapshot( { showLoading: true } );
		return;
	}

	if (
		realtimeStore.lastFetchAt === 0 ||
		Date.now() - realtimeStore.lastFetchAt >= maxAgeMs
	) {
		fetchRealtimeSnapshot( { showLoading: false } );
	}
};

const startRealtimePolling = ( intervalMs ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}
	if ( realtimeStore.intervalId ) {
		window.clearInterval( realtimeStore.intervalId );
	}

	realtimeStore.currentPollIntervalMs = intervalMs;
	realtimeStore.intervalId = window.setInterval( () => {
		fetchRealtimeSnapshot( { showLoading: false } );
	}, intervalMs );
};

const ensurePollingInterval = ( isRealtimePanel ) => {
	const desiredIntervalMs = getDesiredPollIntervalMs( isRealtimePanel );
	if ( realtimeStore.currentPollIntervalMs === desiredIntervalMs ) {
		return;
	}

	startRealtimePolling( desiredIntervalMs );
};

const ensureRealtimePolling = ( isRealtimePanel ) => {
	if ( getAuthRequiredState().isAuthRequired ) {
		stopRealtimePolling();
		return;
	}
	const isFirstLoad = realtimeStore.data === null && ! realtimeStore.error;

	if ( isFirstLoad ) {
		fetchRealtimeSnapshot( { showLoading: true } );
	} else {
		fetchRealtimeSnapshotIfStale(
			getDesiredPollIntervalMs( isRealtimePanel )
		);
	}

	ensurePollingInterval( isRealtimePanel );
};

const stopRealtimePolling = () => {
	if ( realtimeStore.intervalId ) {
		window.clearInterval( realtimeStore.intervalId );
		realtimeStore.intervalId = null;
	}
	realtimeStore.currentPollIntervalMs = null;

	if ( realtimeStore.activeController ) {
		realtimeStore.activeController.abort();
		realtimeStore.activeController = null;
	}
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
	return page === 'bbpa-realtime';
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
		const handleStoreUpdate = ( nextState ) => {
			setState( nextState );
		};

		realtimeStore.listeners.add( handleStoreUpdate );
		setState( getRealtimeState() );
		if ( isPollingEnabled && ! getAuthRequiredState().isAuthRequired ) {
			ensureRealtimePolling( isRealtimePanel );
		} else if ( realtimeStore.listeners.size === 1 ) {
			stopRealtimePolling();
		}

		const unsubscribeAuthRequired = subscribeAuthRequired(
			( nextState ) => {
				if ( nextState.isAuthRequired ) {
					stopRealtimePolling();
				}
			}
		);

		const handleVisibilityOrFocusChange = () => {
			if ( ! isPollingEnabled || getAuthRequiredState().isAuthRequired ) {
				return;
			}
			ensurePollingInterval( isRealtimePanel );
			fetchRealtimeSnapshotIfStale(
				getDesiredPollIntervalMs( isRealtimePanel )
			);
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

			if ( realtimeStore.listeners.size === 0 || ! isPollingEnabled ) {
				stopRealtimePolling();
			}
		};
	}, [ isPollingEnabled, isRealtimePanel ] );

	return {
		data: state.data,
		error: state.error,
		isLoading: state.isLoading,
		pollIntervalMs: getDesiredPollIntervalMs( isRealtimePanel ),
	};
};

export default useRealtimeSnapshot;
