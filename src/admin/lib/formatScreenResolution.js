export const formatScreenResolution = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	const normalized = value.trim();
	const compactSeparatorNormalized = normalized.replace( /\s*[x×]\s*/gi, 'x' );

	const strictMatch = compactSeparatorNormalized.match( /^(\d{2,5})x(\d{2,5})$/ );
	if ( strictMatch ) {
		const width = Number.parseInt( strictMatch[ 1 ], 10 );
		if ( width <= 480 ) {
			return '0-480px';
		}
		if ( width <= 768 ) {
			return '481-768px';
		}
		if ( width <= 1024 ) {
			return '769-1024px';
		}
		if ( width <= 1440 ) {
			return '1025-1440px';
		}

		return '1441px+';
	}

	const numericParts = normalized.match( /\d{2,5}/g );
	if ( numericParts?.length >= 2 ) {
		return formatScreenResolution( `${ numericParts[ 0 ] }x${ numericParts[ 1 ] }` );
	}

	return compactSeparatorNormalized;
};
