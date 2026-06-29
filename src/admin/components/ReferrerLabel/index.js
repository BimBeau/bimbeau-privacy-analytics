import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { LuArrowRight, LuGlobe } from 'react-icons/lu';

import { fetchAdminJson } from '../../api/useAdminEndpoint';

const resolveNormalizedDomain = ( domain ) => {
	if ( typeof domain !== 'string' ) {
		return '';
	}

	return domain
		.trim()
		.replace( /^https?:\/\//i, '' )
		.replace( /\/.*$/, '' )
		.replace( /^www\./i, '' );
};

const resolveDomainFaviconCandidates = ( domain, internalFaviconUrl = '' ) => {
	const normalizedDomain = resolveNormalizedDomain( domain );

	if ( normalizedDomain === '' ) {
		return [];
	}

	const domainUrl = `https://${ normalizedDomain }`;
	const candidates = [
		internalFaviconUrl,
		`https://www.google.com/s2/favicons?domain_url=${ encodeURIComponent(
			domainUrl
		) }&sz=64`,
		`https://icons.duckduckgo.com/ip3/${ normalizedDomain }.ico`,
		`${ domainUrl }/favicon.ico`,
		`${ domainUrl }/favicon.svg`,
		`${ domainUrl }/favicon.png`,
		`${ domainUrl }/apple-touch-icon.png`,
	];

	return [ ...new Set( candidates.filter( Boolean ) ) ];
};

const ReferrerLabel = ( { domain, label } ) => {
	const normalizedDomain = useMemo( () => resolveNormalizedDomain( domain ), [ domain ] );
	const [ internalFaviconUrl, setInternalFaviconUrl ] = useState( '' );
	const faviconCandidates = useMemo(
		() =>
			resolveDomainFaviconCandidates( normalizedDomain, internalFaviconUrl ),
		[ normalizedDomain, internalFaviconUrl ]
	);
	const [ faviconCandidateIndex, setFaviconCandidateIndex ] = useState( 0 );
	const resolvedLabel = label || __( 'Direct', 'bimbeau-privacy-analytics' );

	useEffect( () => {
		let isMounted = true;

		if ( ! normalizedDomain ) {
			setInternalFaviconUrl( '' );
			return undefined;
		}

		setInternalFaviconUrl( '' );

		fetchAdminJson( '/admin/favicon', {
			params: {
				domain: normalizedDomain,
			},
		} )
			.then( ( payload ) => {
				if ( ! isMounted ) {
					return;
				}

				const endpointFavicon =
					typeof payload?.favicon_url === 'string'
						? payload.favicon_url.trim()
						: '';
				setInternalFaviconUrl( endpointFavicon );
			} )
			.catch( () => {
				if ( isMounted ) {
					setInternalFaviconUrl( '' );
				}
			} );

		return () => {
			isMounted = false;
		};
	}, [ normalizedDomain ] );

	useEffect( () => {
		setFaviconCandidateIndex( 0 );
	}, [ faviconCandidates ] );

	const faviconUrl = faviconCandidates[ faviconCandidateIndex ] || '';
	const isDirectAccess = faviconCandidates.length === 0;

	return (
		<span className="bbpa-referrer-label">
			{ faviconUrl ? (
				<img
					className="bbpa-referrer-label__favicon"
					src={ faviconUrl }
					alt=""
					width={ 16 }
					height={ 16 }
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					onError={ () => {
						setFaviconCandidateIndex( ( currentIndex ) => currentIndex + 1 );
					} }
				/>
			) : (
				<span
					className={ `bbpa-referrer-label__favicon-fallback${
						isDirectAccess
							? ' bbpa-referrer-label__favicon-fallback--direct'
							: ' bbpa-referrer-label__favicon-fallback--globe'
					}` }
					aria-hidden="true"
				>
					{ isDirectAccess ? (
						<LuArrowRight size={ 12 } />
					) : (
						<LuGlobe size={ 12 } />
					) }
				</span>
			) }
			<span>{ resolvedLabel }</span>
		</span>
	);
};

export default ReferrerLabel;
