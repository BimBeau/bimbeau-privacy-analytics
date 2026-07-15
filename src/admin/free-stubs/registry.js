import { __ } from '@wordpress/i18n';
import AcquisitionPanel from '../panels/AcquisitionPanel';
import GeolocationPanel from '../panels/GeolocationPanel';
import OverviewPanel from './OverviewPanel';
import DevicesPanel from '../panels/DevicesPanel';
import ReferrerSourcesPanel from '../panels/ReferrerSourcesPanel';
import RealtimePanel from '../panels/RealtimePanel';
import SearchTermsPanel from '../panels/SearchTermsPanel';
import SettingsPanel from './SettingsPanel';
import TopPagesPanel from '../panels/TopPagesPanel';
import VisitorsPanel from '../panels/VisitorsPanel';
import { ADMIN_CONFIG, ADVANCED_STATS_DEPENDENT_PANELS, getDisabledPanels, isAdvancedStatsEnabled } from '../constants';

const normalizePanels = ( panels ) => Array.isArray( panels ) ? panels.map( ( panel ) => ( {
	name: panel?.name || '',
	title: panel?.title || panel?.name || '',
	type: panel?.type || 'custom',
	availability: 'free',
} ) ).filter( ( panel ) => panel.name ) : [];

const getVisiblePanels = ( panels ) => panels.filter( ( panel ) => {
	const hiddenPanels = getDisabledPanels( ADMIN_CONFIG?.settings );
	const isPanelHiddenBySettings = panel.name !== 'dashboard' && hiddenPanels.includes( panel.name );
	const isPanelHiddenByAdvancedConsent = ! isAdvancedStatsEnabled( ADMIN_CONFIG?.settings ) && ADVANCED_STATS_DEPENDENT_PANELS.includes( panel.name );
	return ! isPanelHiddenBySettings && ! isPanelHiddenByAdvancedConsent;
} );
const getCurrentPanelTitle = ( panelName, panels ) => panels.find( ( panel ) => panel.name === panelName )?.title || __( 'BimBeau Privacy Analytics', 'bimbeau-privacy-analytics' );
const getPanelComponent = ( name ) => ( {
	dashboard: OverviewPanel,
	acquisition: AcquisitionPanel,
	'top-pages': TopPagesPanel,
	referrers: ReferrerSourcesPanel,
	'search-terms': SearchTermsPanel,
	geolocation: GeolocationPanel,
	visitors: VisitorsPanel,
	devices: DevicesPanel,
	realtime: RealtimePanel,
	settings: SettingsPanel,
} )[ name ] || null;
export { getCurrentPanelTitle, getPanelComponent, getVisiblePanels, normalizePanels };
