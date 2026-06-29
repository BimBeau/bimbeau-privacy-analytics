import { __ } from '@wordpress/i18n';
import {
	ADMIN_CONFIG,
	ADVANCED_STATS_DEPENDENT_PANELS,
	getDisabledPanels,
	isAdvancedStatsEnabled,
} from '../constants';

import AcquisitionPanel from './AcquisitionPanel';
import GeolocationPanel from './GeolocationPanel';
import OverviewPanel from './OverviewPanel';
import DevicesPanel from './DevicesPanel';
import EventsPanel from './EventsPanel';
import ReferrerSourcesPanel from './ReferrerSourcesPanel';
import RealtimePanel from './RealtimePanel';
import SearchTermsPanel from './SearchTermsPanel';
import SettingsPanel from './SettingsPanel';
import TopPagesPanel from './TopPagesPanel';
import VisitorsPanel from './VisitorsPanel';

const normalizePanelAvailability = ( availability ) => {
	const normalized = String( availability || 'free' ).toLowerCase();

	if ( [ 'free', 'pro' ].includes( normalized ) ) {
		return normalized;
	}

	return 'free';
};

const normalizePanels = ( panels ) => {
	if ( ! Array.isArray( panels ) ) {
		return [];
	}

	return panels
		.map( ( panel ) => {
			const availability = normalizePanelAvailability(
				panel?.availability
			);

			return {
				name: panel?.name || '',
				title: panel?.title || panel?.name || '',
				type: panel?.type || 'custom',
				availability,
				isPro: availability === 'pro',
			};
		} )
		.filter( ( panel ) => panel.name );
};

const getVisiblePanels = ( panels, isPro, appContext = 'admin' ) =>
	panels.filter( ( panel ) => {
		const isSettingsHiddenInApp =
			appContext === 'app' && panel.name === 'settings';
		const hiddenPanels = getDisabledPanels( ADMIN_CONFIG?.settings );
		const isPanelHiddenBySettings =
			panel.name !== 'dashboard' && hiddenPanels.includes( panel.name );
		const isPanelHiddenByAdvancedConsent =
			! isAdvancedStatsEnabled( ADMIN_CONFIG?.settings ) &&
			ADVANCED_STATS_DEPENDENT_PANELS.includes( panel.name );

		return (
			( isPro || panel.availability !== 'pro' ) &&
			! isSettingsHiddenInApp &&
			! isPanelHiddenBySettings &&
			! isPanelHiddenByAdvancedConsent
		);
	} );

const getCurrentPanelTitle = ( panelName, panels ) => {
	const match = panels.find( ( panel ) => panel.name === panelName );
	return match?.title || __( 'BimBeau Privacy Analytics', 'bimbeau-privacy-analytics' );
};

const getPanelComponent = ( name ) => {
	const corePanels = {
		dashboard: OverviewPanel,
		acquisition: AcquisitionPanel,
		'top-pages': TopPagesPanel,
		referrers: ReferrerSourcesPanel,
		'search-terms': SearchTermsPanel,
		geolocation: GeolocationPanel,
		visitors: VisitorsPanel,
		devices: DevicesPanel,
		realtime: RealtimePanel,
		events: EventsPanel,
		settings: SettingsPanel,
	};

	if ( corePanels[ name ] ) {
		return corePanels[ name ];
	}

	const registry = window.BBPAAdminPanels || {};
	return registry[ name ] || null;
};

export {
	getCurrentPanelTitle,
	getPanelComponent,
	getVisiblePanels,
	normalizePanels,
};
