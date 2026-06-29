import { __ } from '@wordpress/i18n';

const PRO_WORD_PATTERN = /\bPro\b/g;

const ProBadge = () => (
	<span className="bbpa-pro-badge">{ __( 'Pro', 'bimbeau-privacy-analytics' ) }</span>
);

const isTrailingSentencePeriod = ( segment, index, segments ) =>
	index === segments.length - 1 && segment === '.';

export const ProBadgeText = ( { text } ) => {
	const safeText = String( text || '' );
	const segments = safeText.split( PRO_WORD_PATTERN );

	if ( segments.length === 1 ) {
		return safeText;
	}

	return (
		<>
			{ segments.map( ( segment, index ) =>
				isTrailingSentencePeriod( segment, index, segments ) ? null : (
					<span key={ `${ segment }-${ index }` }>
						{ segment }
						{ index < segments.length - 1 ? <ProBadge /> : null }
					</span>
				)
			) }
		</>
	);
};

export default ProBadge;
