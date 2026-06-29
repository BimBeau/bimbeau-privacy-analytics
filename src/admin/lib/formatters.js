export const decodeHtmlEntities = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	if ( typeof window !== 'undefined' && window.document ) {
		const textarea = window.document.createElement( 'textarea' );
		textarea.innerHTML = value;
		return textarea.value;
	}

	return value.replace( /&#(\d+);/g, ( _, decimalCode ) =>
		String.fromCodePoint( Number( decimalCode ) )
	);
};

export const truncatePageTitle = ( title ) => {
	if ( typeof title !== 'string' ) {
		return '';
	}

	return title.length > 25 ? `${ title.slice( 0, 25 ) }...` : title;
};

export const calculateChangePercent = ( current, previous ) => {
	if ( previous === null || previous === undefined ) {
		return null;
	}

	if ( previous === 0 ) {
		return current === 0 ? 0 : 100;
	}

	return ( ( current - previous ) / previous ) * 100;
};

export const formatChangePercent = ( value ) => {
	if ( value === null || value === undefined ) {
		return null;
	}

	const normalizedValue = Number( value );
	const safeValue = Number.isFinite( normalizedValue ) ? normalizedValue : 0;
	const absoluteValue = Math.abs( safeValue );

	if ( absoluteValue >= 1000 ) {
		const compactSuffixes = [
			{ divisor: 1000, suffix: 'k' },
			{ divisor: 1000000, suffix: 'M' },
			{ divisor: 1000000000, suffix: 'B' },
		];

		let { divisor, suffix } = compactSuffixes[ 0 ];
		compactSuffixes.forEach( ( candidate ) => {
			if ( absoluteValue >= candidate.divisor ) {
				divisor = candidate.divisor;
				suffix = candidate.suffix;
			}
		} );

		let scaled = absoluteValue / divisor;
		let decimals = scaled < 10 ? 1 : 0;
		scaled = Number( scaled.toFixed( decimals ) );

		if ( scaled >= 1000 && divisor < 1000000000 ) {
			divisor *= 1000;
			suffix = divisor === 1000000 ? 'M' : 'B';
			scaled = absoluteValue / divisor;
			decimals = scaled < 10 ? 1 : 0;
			scaled = Number( scaled.toFixed( decimals ) );
		}

		if ( Math.abs( scaled - Math.round( scaled ) ) < 0.00001 ) {
			decimals = 0;
			scaled = Math.round( scaled );
		}

		let sign = '';
		if ( safeValue > 0 ) {
			sign = '+';
		} else if ( safeValue < 0 ) {
			sign = '-';
		}

		return (
			sign +
			new Intl.NumberFormat( undefined, {
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals,
			} ).format( scaled ) +
			suffix +
			'%'
		);
	}

	const formatter = new Intl.NumberFormat( undefined, {
		maximumFractionDigits: 1,
		minimumFractionDigits: 0,
		signDisplay: 'exceptZero',
	} );

	if ( safeValue === 0 || Object.is( safeValue, -0 ) ) {
		return `${ formatter.format( 0 ) }%`;
	}

	return `${ formatter.format( safeValue ) }%`;
};

export const formatCompactMetricValue = ( value ) => {
	const normalizedValue = Number( value );
	const safeValue =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;

	if ( safeValue < 1000 ) {
		return new Intl.NumberFormat( undefined, {
			maximumFractionDigits: 0,
		} ).format( safeValue );
	}

	const suffixes = [
		{ divisor: 1000, suffix: 'k' },
		{ divisor: 1000000, suffix: 'M' },
		{ divisor: 1000000000, suffix: 'B' },
	];

	let { divisor, suffix } = suffixes[ 0 ];
	suffixes.forEach( ( candidate ) => {
		if ( safeValue >= candidate.divisor ) {
			divisor = candidate.divisor;
			suffix = candidate.suffix;
		}
	} );

	let scaled = safeValue / divisor;
	let decimals = scaled < 10 ? 1 : 0;
	scaled = Number( scaled.toFixed( decimals ) );

	if ( scaled >= 1000 && divisor < 1000000000 ) {
		divisor *= 1000;
		suffix = divisor === 1000000 ? 'M' : 'B';
		scaled = safeValue / divisor;
		decimals = scaled < 10 ? 1 : 0;
		scaled = Number( scaled.toFixed( decimals ) );
	}

	if ( Math.abs( scaled - Math.round( scaled ) ) < 0.00001 ) {
		decimals = 0;
		scaled = Math.round( scaled );
	}

	return (
		new Intl.NumberFormat( undefined, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		} ).format( scaled ) + suffix
	);
};

export const formatRatioMetricValue = ( value ) => {
	const normalizedValue = Number( value );
	const safeValue =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;

	return new Intl.NumberFormat( undefined, {
		minimumFractionDigits: safeValue < 10 ? 1 : 0,
		maximumFractionDigits: safeValue < 10 ? 1 : 0,
	} ).format( safeValue );
};

export const formatDurationMetricValue = ( valueInMs ) => {
	const normalizedValue = Number( valueInMs );
	const safeValueInMs =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;
	const totalSeconds = Math.floor( safeValueInMs / 1000 );

	if ( totalSeconds < 60 ) {
		return `${ totalSeconds }s`;
	}

	if ( totalSeconds < 3600 ) {
		const minutes = Math.floor( totalSeconds / 60 );
		const seconds = totalSeconds % 60;
		return `${ minutes }m ${ seconds }s`;
	}

	const hours = Math.floor( totalSeconds / 3600 );
	const minutes = Math.floor( ( totalSeconds % 3600 ) / 60 );

	return `${ hours }h ${ minutes }m`;
};

export const formatCompactDurationMetricValue = ( valueInMs ) => {
	const normalizedValue = Number( valueInMs );
	const safeValueInMs =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;
	const totalSeconds = Math.floor( safeValueInMs / 1000 );

	if ( totalSeconds < 60 ) {
		return `${ totalSeconds }s`;
	}

	if ( totalSeconds < 3600 ) {
		const minutes = Math.floor( totalSeconds / 60 );
		const seconds = totalSeconds % 60;
		return `${ minutes }:${ String( seconds ).padStart( 2, '0' ) }`;
	}

	const hours = Math.floor( totalSeconds / 3600 );
	const minutes = Math.floor( ( totalSeconds % 3600 ) / 60 );

	return `${ hours }:${ String( minutes ).padStart( 2, '0' ) }`;
};
