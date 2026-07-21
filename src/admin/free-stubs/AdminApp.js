/**
 * Free admin application shell.
 */

import { ADMIN_CONFIG } from '../constants';
import { getCurrentPanelTitle, getPanelComponent, getVisiblePanels, normalizePanels } from '../panels/registry';

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
	return (
		<div className="bbpa-admin-app">
			<main className="bbpa-admin-app__main">
				<header className="bbpa-admin-app__heading">
					<h1>{ panelTitle }</h1>
				</header>
				{ PanelComponent ? <PanelComponent /> : null }
			</main>
		</div>
	);
};

export default AdminApp;
