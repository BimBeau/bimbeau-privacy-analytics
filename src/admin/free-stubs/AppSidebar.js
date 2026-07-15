/**
 * Free admin sidebar for wp-admin navigation.
 */

import { Button, Card, CardBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { chevronDown, chevronUp } from '@wordpress/icons';
import { useState } from '@wordpress/element';

import { getAdminPanelUrl } from '../lib/adminUrls';

const AppSidebar = ( {
	panels = [],
	currentPanel = '',
} ) => {
	const [ isMobileExpanded, setIsMobileExpanded ] = useState( false );
	const safePanels = panels.filter( ( panel ) => panel && panel.name );

	if ( safePanels.length === 0 ) {
		return null;
	}

	return (
		<Card className="bbpa-admin-sidebar">
			<CardBody>
				<Button
					variant="tertiary"
					className="bbpa-admin-sidebar__mobile-toggle"
					onClick={ () => setIsMobileExpanded( ( value ) => ! value ) }
					icon={ isMobileExpanded ? chevronUp : chevronDown }
					iconPosition="right"
					aria-expanded={ isMobileExpanded }
					aria-controls="bbpa-admin-sidebar-nav-list"
					text={ __( 'Navigation', 'bimbeau-privacy-analytics' ) }
				/>
				<nav
					className="bbpa-admin-sidebar__nav"
					data-mobile-expanded={ isMobileExpanded ? 'true' : 'false' }
					aria-label={ __( 'BimBeau Privacy Analytics navigation', 'bimbeau-privacy-analytics' ) }
				>
					<ul id="bbpa-admin-sidebar-nav-list" className="bbpa-admin-sidebar__list">
						{ safePanels.map( ( panel ) => {
							const isActive = panel.name === currentPanel;

							return (
								<li key={ panel.name } className="bbpa-admin-sidebar__item">
									<Button
										variant={ isActive ? 'primary' : 'tertiary' }
										href={ getAdminPanelUrl( panel.name ) }
										className="bbpa-admin-sidebar__link"
										aria-current={ isActive ? 'page' : undefined }
									>
										<span>{ panel.title }</span>
									</Button>
								</li>
							);
						} ) }
					</ul>
				</nav>
			</CardBody>
		</Card>
	);
};

export default AppSidebar;
