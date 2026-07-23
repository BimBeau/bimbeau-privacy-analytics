import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { LuArrowRight, LuGlobe } from 'react-icons/lu';

import { ADMIN_CONFIG, normalizeBooleanSetting } from '../../constants';
import PageTitle from '../PageTitle';
import { getCachedFavicon, normalizeReferrerHost } from './faviconCache';

export const resolveDomainFaviconCandidates = ( internalFaviconUrl = '' ) =>
	internalFaviconUrl ? [ internalFaviconUrl ] : [];

const ReferrerLabel = ( { domain, label, faviconsEnabled, favicon } ) => {
	const normalizedDomain = useMemo(
		() => normalizeReferrerHost( domain ),
		[ domain ]
	);
	const enabled = normalizeBooleanSetting(
		faviconsEnabled ?? ADMIN_CONFIG?.settings?.referrer_favicons_enabled,
		false
	);
	const resolvedFavicon = favicon || getCachedFavicon( normalizedDomain );
	const faviconUrl = enabled && resolvedFavicon?.status === 'available' ? resolvedFavicon.url : '';
	const resolvedLabel = label || __( 'Direct', 'bimbeau-privacy-analytics' );

	return (
		<span className="bbpa-referrer-label">
			{ faviconUrl ? (
				<img
					className="bbpa-referrer-label__favicon"
					src={ faviconUrl }
					alt=""
					width={ 16 }
					height={ 16 }
				/>
			) : enabled && normalizedDomain && resolvedFavicon?.status === 'loading' ? (
				<span className="bbpa-referrer-label__favicon-fallback" aria-hidden="true" />
			) : (
				<span
					className={ `bbpa-referrer-label__favicon-fallback${
						! normalizedDomain
							? ' bbpa-referrer-label__favicon-fallback--direct'
							: ' bbpa-referrer-label__favicon-fallback--globe'
					}` }
					aria-hidden="true"
				>
					{ ! normalizedDomain ? (
						<LuArrowRight size={ 12 } />
					) : (
						<LuGlobe size={ 12 } />
					) }
				</span>
			) }
			<PageTitle>{ resolvedLabel }</PageTitle>
		</span>
	);
};
export default ReferrerLabel;
