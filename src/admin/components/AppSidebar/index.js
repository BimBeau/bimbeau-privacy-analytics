import { Button, Card, CardBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { chevronDown, chevronUp } from '@wordpress/icons';
import { useState } from '@wordpress/element';

import ProBadge from '../ProBadge';
import { getAdminPanelUrl } from '../../lib/adminUrls';

const AppSidebar = ( {
	panels = [],
	currentPanel = '',
	appMode = 'admin',
} ) => {
	const [ isMobileExpanded, setIsMobileExpanded ] = useState( false );
	const safePanels =
		appMode === 'app'
			? panels.filter( ( panel ) => panel.name !== 'settings' )
			: panels;

	if ( safePanels.length === 0 ) {
		return null;
	}

	return (
		<Card className="bbpa-sidebar">
			<CardBody>
				<Button
					variant="tertiary"
					className="bbpa-sidebar__mobile-toggle"
					onClick={ () =>
						setIsMobileExpanded( ( value ) => ! value )
					}
					icon={ isMobileExpanded ? chevronUp : chevronDown }
					iconPosition="right"
					aria-expanded={ isMobileExpanded }
					aria-controls="bbpa-sidebar-nav-list"
					text={ __( 'Navigation', 'bimbeau-privacy-analytics' ) }
				/>
				<nav
					className="bbpa-sidebar__nav"
					data-mobile-expanded={ isMobileExpanded ? 'true' : 'false' }
					aria-label={ __( 'BimBeau Privacy Analytics navigation', 'bimbeau-privacy-analytics' ) }
				>
					<ul
						id="bbpa-sidebar-nav-list"
						className="bbpa-sidebar__list"
					>
						{ safePanels.map( ( panel ) => {
							const isActive = panel.name === currentPanel;

							return (
								<li
									key={ panel.name }
									className="bbpa-sidebar__item"
								>
									<Button
										variant={
											isActive ? 'primary' : 'tertiary'
										}
										href={ getAdminPanelUrl( panel.name ) }
										className="bbpa-sidebar__link"
										aria-current={
											isActive ? 'page' : undefined
										}
									>
										<span>{ panel.title }</span>
										{ appMode !== 'app' && panel.isPro ? (
											<ProBadge />
										) : null }
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
