/**
 * Shared admin bootstrap for BimBeau Privacy Analytics.
 */

import { createRoot, render } from '@wordpress/element';
import AdminErrorBoundary from './components/AdminErrorBoundary';
import AdminApp from './AdminApp';
import { ADMIN_CONFIG } from './constants';
import { setupEditionAdminRuntime } from './edition-admin-runtime';

const rootId = ADMIN_CONFIG?.rootId || 'bbpa-admin';

export const bootstrapAdmin = ( {
	beforeRender = [],
	afterRender = []
} = {} ) => {
	const root = document.getElementById( rootId );

	if ( ! root ) {
		return;
	}

	beforeRender.forEach( ( initialize ) => {
		if ( typeof initialize === 'function' ) {
			initialize( root );
		}
	} );

	setupEditionAdminRuntime( root, { rootId } );

	const appElement = (
		<AdminErrorBoundary>
			<AdminApp />
		</AdminErrorBoundary>
	);

	if ( typeof createRoot === 'function' ) {
		createRoot( root ).render( appElement );
	} else {
		render( appElement, root );
	}

	afterRender.forEach( ( initialize ) => {
		if ( typeof initialize === 'function' ) {
			initialize( root );
		}
	} );
};
