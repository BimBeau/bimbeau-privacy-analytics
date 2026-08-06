import { ADMIN_CONFIG } from '../constants';

const getResolvedBaseUrl = ( baseUrl = null ) =>
	baseUrl ||
	ADMIN_CONFIG?.settings?.adminBaseUrl ||
	( typeof window !== 'undefined' && window.location
		? window.location.href
		: '' );

export const getAdminPanelUrl = ( panelName, params = {}, baseUrl = null ) => {
	const resolvedBaseUrl = getResolvedBaseUrl( baseUrl );

	if ( ! resolvedBaseUrl ) {
		return '';
	}

	const pluginSlug =
		ADMIN_CONFIG?.settings?.slug || 'bimbeau-privacy-analytics';
	const page =
		! panelName || panelName === 'dashboard'
			? pluginSlug
			: `${ pluginSlug }-${ panelName }`;
	const windowOrigin =
		typeof window !== 'undefined' && window.location
			? window.location.origin
			: '';
	const url = windowOrigin
		? new URL( resolvedBaseUrl, windowOrigin )
		: new URL( resolvedBaseUrl );

	Object.entries( params ).forEach( ( [ key, value ] ) => {
		if ( value === undefined || value === null || value === '' ) {
			url.searchParams.delete( key );
			return;
		}

		url.searchParams.set( key, value );
	} );

	url.searchParams.set( 'page', page );
	url.searchParams.delete( 'bbpa_panel' );

	return url.toString();
};
