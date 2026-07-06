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
import AppSidebar from './components/AppSidebar';
import FeatureIcon from './components/icons/FeatureIcon';
import PeriodFilter from './widgets/PeriodFilter';

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
	const isPro = Boolean( ADMIN_CONFIG?.settings?.isPro );
	const panels = normalizePanels( ADMIN_CONFIG?.panels );
	const visiblePanels = getVisiblePanels( panels, isPro, appContext );
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
	const isWhiteLabel = Boolean( ADMIN_CONFIG?.settings?.isWhiteLabel );
	const pluginVersion = ADMIN_CONFIG?.settings?.pluginVersion || '';
	const pluginVersionLabel = pluginVersion ? `v${ pluginVersion }` : '';
	const dashboardUrl = useMemo( () => getAdminPanelUrl( 'dashboard' ), [] );
	const [ rangeSelection, setRangeSelection ] = useSharedRangeSelection();
	const noticesContainerRef = useRef( null );
	const [ hasFreemiusNotices, setHasFreemiusNotices ] = useState( false );
	const [ installPromptEvent, setInstallPromptEvent ] = useState( null );
	const [ isInstallBannerVisible, setIsInstallBannerVisible ] =
		useState( false );
	const [ isInstallAccepted, setIsInstallAccepted ] = useState( false );
	const [ geoIpDatabaseStatus, setGeoIpDatabaseStatus ] = useState( null );
	const [ isGeoIpStatusLoading, setIsGeoIpStatusLoading ] = useState( true );
	const installPromptMode =
		ADMIN_CONFIG?.settings?.pwa?.installPromptMode === 'custom'
			? 'custom'
			: 'native';
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
		if ( hasRequestedPanel || requestedPanel === currentPanel ) {
			return;
		}

		const fallbackUrl = getAdminPanelUrl( firstVisiblePanel );
		if ( fallbackUrl && typeof window !== 'undefined' ) {
			window.location.replace( fallbackUrl );
		}
	}, [ hasRequestedPanel, requestedPanel, currentPanel, firstVisiblePanel ] );

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

	useEffect( () => {
		if ( appContext !== 'app' ) {
			return undefined;
		}

		const isStandalone =
			window.matchMedia?.( '(display-mode: standalone)' )?.matches ||
			Boolean( window.navigator?.standalone );
		if ( isStandalone ) {
			return undefined;
		}

		const onBeforeInstallPrompt = ( event ) => {
			if ( installPromptMode !== 'custom' ) {
				return;
			}

			event.preventDefault();
			setInstallPromptEvent( event );
			setIsInstallBannerVisible( true );
		};

		const onAppInstalled = () => {
			setIsInstallAccepted( true );
			setInstallPromptEvent( null );
			setIsInstallBannerVisible( false );
		};

		window.addEventListener( 'beforeinstallprompt', onBeforeInstallPrompt );
		window.addEventListener( 'appinstalled', onAppInstalled );

		return () => {
			window.removeEventListener(
				'beforeinstallprompt',
				onBeforeInstallPrompt
			);
			window.removeEventListener( 'appinstalled', onAppInstalled );
		};
	}, [ appContext, installPromptMode ] );

	const onReloadApp = () => {
		reloadForAuthRequired();
	};

	const onInstallApp = async () => {
		if ( ! installPromptEvent ) {
			return;
		}

		installPromptEvent.prompt();
		const choice = await installPromptEvent.userChoice;
		setInstallPromptEvent( null );
		setIsInstallBannerVisible( false );
		setIsInstallAccepted( choice?.outcome === 'accepted' );
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
							{ isWhiteLabel || ! brandLogoUrl ? (
								pluginLabel
							) : (
								<>
									<img
										className="bbpa-admin-app__brand-logo"
										src={ brandLogoUrl }
										alt={ pluginLabel }
									/>
								</>
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
			{ installPromptMode === 'custom' &&
			isInstallBannerVisible &&
			installPromptEvent ? (
				<Notice
					className="bbpa-admin-app__install-notice"
					status="info"
					isDismissible
					onRemove={ () => setIsInstallBannerVisible( false ) }
				>
					<div className="bbpa-admin-app__install-banner">
						<div className="bbpa-admin-app__install-main">
							<div className="bbpa-admin-app__install-copy">
								<strong>
									{ __(
										'Install BimBeau Privacy Analytics app',
										'bimbeau-privacy-analytics'
									) }
								</strong>
								<p>
									{ __(
										'Get faster access from your home screen with an app-like experience.',
										'bimbeau-privacy-analytics'
									) }
								</p>
							</div>
						</div>
						<div className="bbpa-admin-app__install-action">
							<Button variant="primary" onClick={ onInstallApp }>
								{ __(
									'Install app',
									'bimbeau-privacy-analytics'
								) }
							</Button>
						</div>
					</div>
				</Notice>
			) : null }
			{ isInstallAccepted ? (
				<Notice status="success" isDismissible={ false }>
					{ __(
						'BimBeau Privacy Analytics app installation was accepted.',
						'bimbeau-privacy-analytics'
					) }
				</Notice>
			) : null }
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
				{ appContext === 'app' ? (
					<AppSidebar
						appMode={ appContext }
						panels={ visiblePanels }
						currentPanel={ currentPanel }
					/>
				) : null }
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
		</div>
	);
};

export default AdminApp;
