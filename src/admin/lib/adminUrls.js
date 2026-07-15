import { ADMIN_CONFIG } from '../constants';

const DETAIL_SOURCE_TO_TAB = {
	'top-pages': 'top-pages',
	'entry-pages': 'entry-pages',
	'exit-pages': 'exit-pages',
	'404s': 'not-found',
	'not-found': 'not-found',
};

export const normalizePageDetailsSource = ( source ) =>
	DETAIL_SOURCE_TO_TAB[ source ] ? source : 'top-pages';

const getResolvedBaseUrl = ( baseUrl = null ) =>
	baseUrl ||
	( typeof window !== 'undefined' && window.location
		? window.location.href
		: '' );

export const getAdminPanelUrl = ( panelName, params = {}, baseUrl = null ) => {
	const resolvedBaseUrl = getResolvedBaseUrl( baseUrl );

	if ( ! resolvedBaseUrl ) {
		return '';
	}

	const pluginSlug = ADMIN_CONFIG?.settings?.slug || 'bimbeau-privacy-analytics';
	const page =
		panelName === 'dashboard'
			? pluginSlug
			: `${ pluginSlug }-${ panelName }`;
	const url = new URL( resolvedBaseUrl );

	url.searchParams.set( 'page', page );

	Object.entries( params ).forEach( ( [ key, value ] ) => {
		if ( value === undefined || value === null || value === '' ) {
			url.searchParams.delete( key );
			return;
		}

		url.searchParams.set( key, value );
	} );

	return url.toString();
};

export const getPageDetailsTab = ( source ) =>
	DETAIL_SOURCE_TO_TAB[ normalizePageDetailsSource( source ) ];

export const getPageDetailsAdminUrl = (
	pagePath,
	source = 'top-pages',
	baseUrl = null
) => {
	if ( ! pagePath ) {
		return getAdminPanelUrl( 'top-pages', {}, baseUrl );
	}

	const normalizedSource = normalizePageDetailsSource( source );

	return getAdminPanelUrl(
		'top-pages',
		{
			bbpa_tab: getPageDetailsTab( normalizedSource ),
			bbpa_detail_page: pagePath,
			bbpa_detail_source: normalizedSource,
		},
		baseUrl
	);
};

export const getInitialPageDetailsSelection = ( baseUrl = null ) => {
	const resolvedBaseUrl = getResolvedBaseUrl( baseUrl );

	if ( ! resolvedBaseUrl ) {
		return {
			selectedPage: null,
			selectedSource: 'top-pages',
		};
	}

	const url = new URL( resolvedBaseUrl );
	const selectedPagePath = url.searchParams.get( 'bbpa_detail_page' ) || '';
	const selectedSource = normalizePageDetailsSource(
		url.searchParams.get( 'bbpa_detail_source' ) || 'top-pages'
	);

	return {
		selectedPage: selectedPagePath ? { label: selectedPagePath } : null,
		selectedSource,
	};
};
