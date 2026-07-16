import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { LuArrowRight, LuGlobe } from 'react-icons/lu';

import { fetchAdminJson } from '../../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../../constants';

const resolveNormalizedDomain = ( domain ) => {
	if ( typeof domain !== 'string' ) return '';
	return domain.trim().replace( /^https?:\/\//i, '' ).replace( /\/.*$/, '' ).replace( /^www\./i, '' );
};

export const resolveDomainFaviconCandidates = ( internalFaviconUrl = '' ) =>
	internalFaviconUrl ? [ internalFaviconUrl ] : [];

const isLocalFaviconUrl = ( url ) => {
	if ( ! url || typeof window === 'undefined' ) return false;
	try { return new URL( url, window.location.origin ).origin === window.location.origin; } catch ( error ) { return false; }
};

const ReferrerLabel = ( { domain, label, faviconsEnabled } ) => {
	const normalizedDomain = useMemo( () => resolveNormalizedDomain( domain ), [ domain ] );
	const enabled = faviconsEnabled ?? ADMIN_CONFIG?.settings?.referrer_favicons_enabled === true;
	const [ faviconUrl, setFaviconUrl ] = useState( '' );
	const resolvedLabel = label || __( 'Direct', 'bimbeau-privacy-analytics' );

	useEffect( () => {
		let isMounted = true;
		setFaviconUrl( '' );
		if ( ! enabled || ! normalizedDomain ) return undefined;
		fetchAdminJson( '/admin/favicon', { params: { domain: normalizedDomain } } )
			.then( ( payload ) => {
				const url = typeof payload?.favicon_url === 'string' ? payload.favicon_url.trim() : '';
				if ( isMounted ) setFaviconUrl( isLocalFaviconUrl( url ) ? url : '' );
			} )
			.catch( () => { if ( isMounted ) setFaviconUrl( '' ); } );
		return () => { isMounted = false; };
	}, [ enabled, normalizedDomain ] );

	return <span className="bbpa-referrer-label">
		{ faviconUrl ? <img className="bbpa-referrer-label__favicon" src={ faviconUrl } alt="" width={ 16 } height={ 16 } loading="lazy" decoding="async" /> :
			<span className={ `bbpa-referrer-label__favicon-fallback${ ! normalizedDomain ? ' bbpa-referrer-label__favicon-fallback--direct' : ' bbpa-referrer-label__favicon-fallback--globe' }` } aria-hidden="true">
				{ ! normalizedDomain ? <LuArrowRight size={ 12 } /> : <LuGlobe size={ 12 } /> }
			</span> }
		<span>{ resolvedLabel }</span>
	</span>;
};
export default ReferrerLabel;
