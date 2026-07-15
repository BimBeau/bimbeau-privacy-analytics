/**
 * Free admin application shell.
 */

import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { ADMIN_CONFIG } from '../constants';
import { getCurrentPanelTitle, getPanelComponent, getVisiblePanels, normalizePanels } from '../panels/registry';
import AppSidebar from '../components/AppSidebar';

const AdminApp = () => {
	const panels = normalizePanels( ADMIN_CONFIG?.panels );
	const visiblePanels = getVisiblePanels( panels, false, 'admin' );
	const firstVisiblePanel = visiblePanels[ 0 ]?.name || 'dashboard';
	const requestedPanel = ADMIN_CONFIG?.currentPanel || firstVisiblePanel;
	const currentPanel = visiblePanels.some( ( panel ) => panel.name === requestedPanel )
		? requestedPanel
		: firstVisiblePanel;
	const PanelComponent = getPanelComponent( currentPanel );
	const panelTitle = getCurrentPanelTitle( currentPanel, visiblePanels );
	const pluginLabel = ADMIN_CONFIG?.settings?.pluginLabel || __( 'Statistics', 'bimbeau-privacy-analytics' );
	const dashboardUrl = useMemo( () => '#', [] );

	return (
		<div className="bbpa-admin-app">
			<div className="bbpa-admin-app__layout">
				<AppSidebar
					panels={ visiblePanels }
					currentPanel={ currentPanel }
					pluginLabel={ pluginLabel }
					dashboardUrl={ dashboardUrl }
				/>
				<main className="bbpa-admin-app__main">
					<header className="bbpa-admin-app__heading">
						<h1>{ panelTitle }</h1>
					</header>
					{ PanelComponent ? <PanelComponent /> : null }
				</main>
			</div>
		</div>
	);
};

export default AdminApp;
