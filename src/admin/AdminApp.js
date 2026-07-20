/**
 * Admin application shell for BimBeau Privacy Analytics.
 */

import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { Button } from '@wordpress/components';
import Notice from './components/BrandNotice';
import { __, sprintf } from '@wordpress/i18n';

import { ADMIN_CONFIG, isPanelEnabled } from './constants';
import {
	fetchAdminJson,
	reloadForAuthRequired,
	useAuthRequiredState,
} from './api/useAdminEndpoint';
import useRealtimeSnapshot from './hooks/useRealtimeSnapshot';
import useSharedRangeSelection from './hooks/useSharedRangePreset';
import { getAdminPanelUrl } from './lib/adminUrls';
import {
	createLogger,
	createTraceId,
	getRuntimeDiagnostics,
	setupGlobalErrorHandlers,
} from './logger';
import {
	getCurrentPanelTitle,
	getPanelComponent,
	getVisiblePanels,
	normalizePanels,
} from './panels/registry';

import FeatureIcon from './components/icons/FeatureIcon';
import PeriodFilter from './widgets/PeriodFilter';
import SetupWizard from './components/SetupWizard';

const HEADING_NOTICE_SELECTOR = [
	'.bbpa-admin-app__heading > .notice',
	'.bbpa-admin-app__heading > .fs-notice',
].join( ', ' );

const AdminApp = () => {
	const debugEnabled = Boolean(
		window.BBPA_DEBUG ?? ADMIN_CONFIG?.settings?.debugEnabled
	);
	const logger = useMemo(
		() => createLogger( { debugEnabled } ),
		[ debugEnabled ]
	);

	const appContext =
		ADMIN_CONFIG?.settings?.appMode === 'app' ? 'app' : 'admin';
	let hasPremiumAccess = false;
	
	const panels = normalizePanels( ADMIN_CONFIG?.panels );
	const visiblePanels = getVisiblePanels( panels, hasPremiumAccess, appContext );
	const firstVisiblePanel = visiblePanels[ 0 ]?.name || 'dashboard';
	const requestedPanel = ADMIN_CONFIG?.currentPanel || firstVisiblePanel;
	const hasRequestedPanel = visiblePanels.some(
		( panel ) => panel.name === requestedPanel
	);
	const currentPanel = hasRequestedPanel ? requestedPanel : firstVisiblePanel;
	const currentPanelConfig =
		visiblePanels.find( ( panel ) => panel.name === currentPanel ) || null;
	const PanelComponent = getPanelComponent( currentPanel );
	const panelTitle = getCurrentPanelTitle( currentPanel, visiblePanels );
	const pluginLabel =
		ADMIN_CONFIG?.settings?.pluginLabel ||
		__( 'Statistics', 'bimbeau-privacy-analytics' );
	const brandLogoUrl = ADMIN_CONFIG?.settings?.brandLogoUrl || '';
	let displayBrandLogo = Boolean( brandLogoUrl );
	
	const pluginVersion = ADMIN_CONFIG?.settings?.pluginVersion || '';
	const pluginVersionLabel = pluginVersion ? `v${ pluginVersion }` : '';
	const dashboardUrl = useMemo( () => getAdminPanelUrl( 'dashboard' ), [] );
	const [ rangeSelection, setRangeSelection ] = useSharedRangeSelection();
	const noticesContainerRef = useRef( null );
	const [ hasFreemiusNotices, setHasFreemiusNotices ] = useState( false );
	
	const [ geoIpDatabaseStatus, setGeoIpDatabaseStatus ] = useState( null );
	const [ setupWizard, setSetupWizard ] = useState( null );
	const [ isSetupWizardLoaded, setIsSetupWizardLoaded ] = useState( false );
	const [ isSetupWizardOpen, setIsSetupWizardOpen ] = useState( false );
	const [ setupNotice, setSetupNotice ] = useState( false );
	const setupWizardRequestRef = useRef( null );
	const setupWizardResetRef = useRef( null );
	const isSetupWizardMountedRef = useRef( true );
	const [ isGeoIpStatusLoading, setIsGeoIpStatusLoading ] = useState( true );
	
	const { isAuthRequired, error: authRequiredError } = useAuthRequiredState();
	const { data: realtimeData, isLoading: isRealtimeLoading } =
		useRealtimeSnapshot( {
			enabled: ! isAuthRequired,
			currentPanel,
		} );
	const activeRealtimeVisitors = Number( realtimeData?.activeVisitors ?? 0 );
	const realtimeUrl = useMemo( () => getAdminPanelUrl( 'realtime' ), [] );
	const isAdvancedStatsEnabled =
		ADMIN_CONFIG?.settings?.advanced_stats_enabled !== false;
	const isRealtimeEnabled =
		isAdvancedStatsEnabled && isPanelEnabled( 'realtime' );
	const formattedRealtimeVisitors = new Intl.NumberFormat().format(
		activeRealtimeVisitors
	);
	const realtimeVisitorLabel =
		activeRealtimeVisitors <= 1
			? /* translators: %s: active real-time visitor count. */
			  __( '%s Visitor', 'bimbeau-privacy-analytics' )
			: /* translators: %s: active real-time visitor count. */
			  __( '%s Visitors', 'bimbeau-privacy-analytics' );
	const realtimeLabel =
		isRealtimeLoading && ! realtimeData
			? __( 'Visitors', 'bimbeau-privacy-analytics' )
			: sprintf( realtimeVisitorLabel, formattedRealtimeVisitors );
	const isRealtimeSkeletonVisible = isRealtimeLoading && ! realtimeData;
	const lookupMode =
		ADMIN_CONFIG?.settings?.geoip_lookup_mode || 'local_database';
	const geolocationSettingsUrl = useMemo(
		() =>
			getAdminPanelUrl( 'settings', {
				bbpa_settings_tab: 'geolocation',
			} ),
		[]
	);
	const shouldShowMissingGeoIpDatabaseNotice =
		lookupMode === 'local_database' &&
		! isAuthRequired &&
		! isGeoIpStatusLoading &&
		Number( geoIpDatabaseStatus?.last_success_at || 0 ) <= 0 &&
		geoIpDatabaseStatus?.local_available !== true &&
		geoIpDatabaseStatus?.operational !== true;

	useEffect( () => {
		if ( isAuthRequired ) {
			setIsGeoIpStatusLoading( false );
			return undefined;
		}

		let isCurrent = true;
		setIsGeoIpStatusLoading( true );

		fetchAdminJson( '/admin/geoip-database/status' )
			.then( ( payload ) => {
				if ( isCurrent ) {
					setGeoIpDatabaseStatus( payload?.database || null );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setGeoIpDatabaseStatus( null );
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsGeoIpStatusLoading( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ isAuthRequired ] );

	useEffect( () => {
		isSetupWizardMountedRef.current = true;
		return () => {
			isSetupWizardMountedRef.current = false;
		};
	}, [] );

	useEffect( () => {
		const openWizard = async ( event ) => {
			const shouldReset =
				event?.detail?.reset === true || event?.detail?.restart === true;
			if ( ! shouldReset ) {
				setIsSetupWizardOpen( true );
				return;
			}

			if ( setupWizardResetRef.current ) {
				return;
			}

			try {
				setSetupNotice( false );
				const resetRequest = fetchAdminJson( '/admin/setup-wizard', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify( { action: 'reset' } ),
				} );
				setupWizardResetRef.current = resetRequest;
				const result = await resetRequest;
				const refreshed = await fetchAdminJson( '/admin/setup-wizard' );
				if ( ! isSetupWizardMountedRef.current ) {
					return;
				}
				setSetupWizard( {
					...refreshed,
					state: result?.state || refreshed?.state,
				} );
				setIsSetupWizardOpen( true );
			} catch ( error ) {
				if ( isSetupWizardMountedRef.current ) {
					setSetupNotice( {
						status: 'error',
						message: __(
							'Unable to restart the configuration assistant. Please try again.',
							'bimbeau-privacy-analytics'
						),
					} );
				}
				logger.warn( 'Unable to reset setup wizard', {
					action: 'admin.setup_wizard_reset_failed',
					message: error?.message || String( error ),
				} );
			} finally {
				setupWizardResetRef.current = null;
			}
		};
		window.addEventListener( 'bbpa-open-setup-wizard', openWizard );
		return () => window.removeEventListener( 'bbpa-open-setup-wizard', openWizard );
	}, [ logger ] );

	useEffect( () => {
		if ( isAuthRequired ) {
			setupWizardRequestRef.current = null;
			setSetupWizard( null );
			setIsSetupWizardLoaded( true );
			return undefined;
		}
		let current = true;
		setIsSetupWizardLoaded( false );
		if ( ! setupWizardRequestRef.current ) {
			setupWizardRequestRef.current = fetchAdminJson( '/admin/setup-wizard' ).then( async ( payload ) => {
				if ( ! payload?.auto_open_allowed ) {
					return payload;
				}
				const opened = await fetchAdminJson( '/admin/setup-wizard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { action: 'mark_auto_opened' } ) } );
				return { ...payload, state: opened?.state || payload.state, auto_open_allowed: false, shouldOpen: true };
			} );
		}
		setupWizardRequestRef.current.then( ( payload ) => {
			if ( ! current ) return;
			setSetupWizard( payload );
			if ( payload?.shouldOpen ) {
				setIsSetupWizardOpen( true );
			}
		} ).catch( () => {
			if ( current ) setSetupWizard( null );
		} ).finally( () => {
			if ( current ) setIsSetupWizardLoaded( true );
		} );
		return () => { current = false; };
	}, [ isAuthRequired ] );

	const closeSetupWizard = () => setIsSetupWizardOpen( false );
	const completeSetupWizard = () => {
		setIsSetupWizardOpen( false );
		setSetupWizard( ( current ) => ( { ...current, state: { ...current?.state, status: 'completed' } } ) );
		setSetupNotice( { status: 'success', message: __( 'Initial configuration completed.', 'bimbeau-privacy-analytics' ) } );
	};

	useEffect( () => {
		if ( hasRequestedPanel || requestedPanel === currentPanel ) {
			return;
		}

		logger.warn( 'Requested admin panel is unavailable', {
			action: 'admin.panel_unavailable',
			requestedPanel,
			fallbackPanel: firstVisiblePanel,
			advancedStatsEnabled:
				ADMIN_CONFIG?.settings?.advanced_stats_enabled,
			visiblePanels: visiblePanels.map( ( panel ) => panel.name ),
		} );

		const fallbackUrl = getAdminPanelUrl( firstVisiblePanel );
		if ( fallbackUrl && typeof window !== 'undefined' ) {
			window.location.replace( fallbackUrl );
		}
	}, [
		hasRequestedPanel,
		requestedPanel,
		currentPanel,
		firstVisiblePanel,
		logger,
		visiblePanels,
	] );

	useEffect( () => {
		setupGlobalErrorHandlers( logger );
		logger.info( 'Loading admin interface', {
			action: 'admin.init',
			traceId: createTraceId(),
			context: getRuntimeDiagnostics(),
		} );
	}, [ logger ] );

	useEffect( () => {
		const moveHeaderNotices = () => {
			const noticesContainer = noticesContainerRef.current;
			const headingNotices = Array.from(
				document.querySelectorAll( HEADING_NOTICE_SELECTOR )
			);

			if ( ! noticesContainer ) {
				setHasFreemiusNotices( headingNotices.length > 0 );
				return;
			}

			headingNotices.forEach( ( noticeElement ) => {
				noticesContainer.append( noticeElement );
			} );

			setHasFreemiusNotices(
				noticesContainer.querySelectorAll( '.notice, .fs-notice' )
					.length > 0
			);
		};

		moveHeaderNotices();

		const MutationObserverClass = window.MutationObserver;

		if ( ! MutationObserverClass ) {
			return undefined;
		}

		const observer = new MutationObserverClass( moveHeaderNotices );
		observer.observe( document.body, {
			childList: true,
			subtree: true,
		} );

		return () => {
			observer.disconnect();
		};
	}, [] );

	

	const onReloadApp = () => {
		reloadForAuthRequired();
	};

	

	if ( ! ADMIN_CONFIG ) {
		return (
			<Notice status="error" isDismissible={ false }>
				{ __(
					'Missing admin configuration.',
					'bimbeau-privacy-analytics'
				) }
			</Notice>
		);
	}

	const authDiagnostics =
		debugEnabled && authRequiredError
			? [
					authRequiredError.status
						? `status: ${ authRequiredError.status }`
						: '',
					authRequiredError.code
						? `code: ${ authRequiredError.code }`
						: '',
					authRequiredError.endpoint
						? `endpoint: ${ authRequiredError.endpoint }`
						: '',
			  ]
					.filter( Boolean )
					.join( ' | ' )
			: '';

	const reconnectContent = (
		<Notice status="error" isDismissible={ false }>
			<div className="bbpa-admin-app__auth-required">
				<p>
					{ authRequiredError?.message ||
						__(
							'Session expired, reload the application.',
							'bimbeau-privacy-analytics'
						) }
				</p>
				{ authDiagnostics ? (
					<p className="bbpa-admin-app__auth-diagnostics">
						{ authDiagnostics }
					</p>
				) : null }
				<Button variant="primary" onClick={ onReloadApp }>
					{ authRequiredError?.actionLabel ||
						__(
							'Reload application',
							'bimbeau-privacy-analytics'
						) }
				</Button>
			</div>
		</Notice>
	);

	let panelContent = reconnectContent;

	if ( ! isAuthRequired ) {
		panelContent = PanelComponent ? (
			<PanelComponent
				panel={ {
					name: currentPanel,
					title: panelTitle,
					availability: currentPanelConfig?.availability || 'free',
				} }
				rangeSelection={ rangeSelection }
				setRangeSelection={ setRangeSelection }
			/>
		) : (
			<Notice status="warning" isDismissible={ false }>
				{ __(
					'No panel available for this screen.',
					'bimbeau-privacy-analytics'
				) }
			</Notice>
		);
	}

	return (
		<div
			className={ `bbpa-admin-app bbpa-admin-app--${ appContext }` }
			data-context={ appContext }
		>
			<div className="bbpa-admin-app__header">
				<div className="bbpa-admin-app__heading">
					<h1>
						<a
							className="bbpa-admin-app__title-link"
							href={ dashboardUrl }
						>
							{ displayBrandLogo ? (
								<>
									<img
										className="bbpa-admin-app__brand-logo"
										src={ brandLogoUrl }
										alt={ pluginLabel }
									/>
								</>
							) : (
								pluginLabel
							) }
						</a>
					</h1>
					{ pluginVersion ? (
						<span className="bbpa-admin-app__version">
							{ pluginVersionLabel }
						</span>
					) : null }
				</div>
				{ isRealtimeEnabled ? (
					<Button
						variant="primary"
						className="bbpa-admin-app__realtime-button"
						href={ realtimeUrl }
					>
						<FeatureIcon
							name="activity"
							className="bbpa-admin-app__realtime-button-icon"
							size={ 16 }
						/>
						<span className="bbpa-admin-app__realtime-button-label">
							{ isRealtimeSkeletonVisible ? (
								<span
									className="bbpa-admin-app__realtime-button-skeleton"
									aria-hidden="true"
								/>
							) : null }
							<span>{ realtimeLabel }</span>
						</span>
					</Button>
				) : null }
				<div className="bbpa-admin-app__period-filter">
					<PeriodFilter
						value={ rangeSelection }
						onChange={ setRangeSelection }
						isCompact
					/>
				</div>
			</div>
			{ hasFreemiusNotices ? (
				<div
					className="bbpa-admin-app__notices"
					ref={ noticesContainerRef }
				/>
			) : null }
			{}
			{}
			{ isSetupWizardLoaded && setupWizard && setupWizard.state?.status !== 'completed' && ! isSetupWizardOpen ? (
				<Notice status="info" isDismissible={ false }>
					<strong>{ __( 'Complete the initial configuration', 'bimbeau-privacy-analytics' ) }</strong>
					<p>{ __( 'Finish configuring tracking, local geolocation, and optional referrer favicons.', 'bimbeau-privacy-analytics' ) }</p>
					<Button variant="secondary" onClick={ () => setIsSetupWizardOpen( true ) }>{ __( 'Resume configuration', 'bimbeau-privacy-analytics' ) }</Button>
				</Notice>
			) : null }
			{ setupNotice ? <Notice status={ setupNotice.status } isDismissible onRemove={ () => setSetupNotice( false ) }>{ setupNotice.message }</Notice> : null }
			{ shouldShowMissingGeoIpDatabaseNotice ? (
				<Notice status="warning" isDismissible={ false }>
					<div className="bbpa-admin-app__geoip-notice">
						<div className="bbpa-admin-app__geoip-notice-copy">
							<strong>
								{ __(
									'GeoIP database not installed',
									'bimbeau-privacy-analytics'
								) }
							</strong>
							<p>
								{ __(
									'Location reports are unavailable until the local GeoIP database has been downloaded. Download it from the Geolocation settings page.',
									'bimbeau-privacy-analytics'
								) }
							</p>
						</div>
						<Button
							variant="secondary"
							href={ geolocationSettingsUrl }
						>
							{ __(
								'Open geolocation settings',
								'bimbeau-privacy-analytics'
							) }
						</Button>
					</div>
				</Notice>
			) : null }
			<div className="bbpa-admin-app__body">
				{}
				<div className="bbpa-admin-app__panel-content">
					{ panelContent }
				</div>
			</div>
			{ pluginVersion ? (
				<div className="bbpa-admin-app__footer">
					<span className="bbpa-admin-app__version bbpa-admin-app__version--footer">
						{ pluginVersionLabel }
					</span>
				</div>
			) : null }
			{ isSetupWizardOpen && setupWizard ? <SetupWizard initial={ setupWizard } onClose={ closeSetupWizard } onComplete={ completeSetupWizard } /> : null }
		</div>
	);
};

export default AdminApp;
