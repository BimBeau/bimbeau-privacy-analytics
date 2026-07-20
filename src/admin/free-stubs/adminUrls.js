import { ADMIN_CONFIG } from '../constants';

export const getAdminPanelUrl = ( panel, baseUrl = null ) => {
	const configuredBaseUrl = baseUrl || ADMIN_CONFIG?.settings?.adminBaseUrl || '';
	const url = new URL( configuredBaseUrl || window.location.href, window.location.origin );

	url.searchParams.set( 'page', 'bimbeau-privacy-analytics' );
	if ( panel ) {
		url.searchParams.set( 'bbpa_panel', panel );
	} else {
		url.searchParams.delete( 'bbpa_panel' );
	}

	return url.toString();
};
