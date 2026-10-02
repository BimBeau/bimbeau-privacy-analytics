import { __, sprintf } from '@wordpress/i18n';

import { getAdminLocale } from './date';

const numberFormatCache = new Map();

const resolveFormatLocale = () => {
	try {
		return getAdminLocale() || undefined;
	} catch {
		return undefined;
	}
};

/**
 * Return a number formatter for the WordPress admin locale.
 *
 * Numbers follow the language of the admin screen (like dates) instead of the
 * browser language. Formatters are cached per locale and options because
 * table cells and charts format many values on every render.
 *
 * @param {Object} options Intl.NumberFormat options.
 * @return {Intl.NumberFormat} Shared formatter.
 */
export const getNumberFormatter = ( options = {} ) => {
	const locale = resolveFormatLocale();
	const cacheKey = `${ locale || '' }|${ JSON.stringify( options ) }`;
	let formatter = numberFormatCache.get( cacheKey );

	if ( ! formatter ) {
		try {
			formatter = new Intl.NumberFormat( locale, options );
		} catch {
			// Unsupported locale tag: use the browser locale.
			formatter = new Intl.NumberFormat( undefined, options );
		}
		numberFormatCache.set( cacheKey, formatter );
	}

	return formatter;
};

/**
 * Format a number for the WordPress admin locale.
 *
 * @param {number} value   Number to format.
 * @param {Object} options Intl.NumberFormat options.
 * @return {string} Formatted number.
 */
export const formatNumber = ( value, options = {} ) =>
	getNumberFormatter( options ).format( value );

const COMPACT_NUMBER_SUFFIXES = [
	{ divisor: 1000, suffix: 'k' },
	{ divisor: 1000000, suffix: 'M' },
	{ divisor: 1000000000, suffix: 'B' },
];

/**
 * Format an absolute value of 1,000 or more with a k, M or B suffix.
 *
 * Values below 10 units of the suffix keep one decimal (1.5k, 9.9M); a value
 * that rounds to 1,000 units moves to the next suffix (999,500 is 1M).
 *
 * @param {number} absoluteValue Value of 1,000 or more.
 * @return {string} Formatted value with its suffix, without sign.
 */
const formatCompactNumber = ( absoluteValue ) => {
	let { divisor, suffix } = COMPACT_NUMBER_SUFFIXES[ 0 ];
	COMPACT_NUMBER_SUFFIXES.forEach( ( candidate ) => {
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

	return (
		formatNumber( scaled, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		} ) + suffix
	);
};

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
		let sign = '';
		if ( safeValue > 0 ) {
			sign = '+';
		} else if ( safeValue < 0 ) {
			sign = '-';
		}

		return `${ sign }${ formatCompactNumber( absoluteValue ) }%`;
	}

	const formatter = getNumberFormatter( {
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
		return formatNumber( safeValue, {
			maximumFractionDigits: 0,
		} );
	}

	return formatCompactNumber( safeValue );
};

export const formatRatioMetricValue = ( value ) => {
	const normalizedValue = Number( value );
	const safeValue =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;

	return formatNumber( safeValue, {
		minimumFractionDigits: safeValue < 10 ? 1 : 0,
		maximumFractionDigits: safeValue < 10 ? 1 : 0,
	} );
};

export const formatDurationMetricValue = ( valueInMs ) => {
	const normalizedValue = Number( valueInMs );
	const safeValueInMs =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;
	const totalSeconds = Math.floor( safeValueInMs / 1000 );

	if ( totalSeconds < 60 ) {
		/* translators: %d: Number of seconds. */
		return sprintf( __( '%ds', 'bimbeau-privacy-analytics' ), totalSeconds );
	}

	if ( totalSeconds < 3600 ) {
		const minutes = Math.floor( totalSeconds / 60 );
		const seconds = totalSeconds % 60;
		return sprintf(
			/* translators: 1: Number of minutes, 2: Number of seconds. */
			__( '%1$dm %2$ds', 'bimbeau-privacy-analytics' ),
			minutes,
			seconds
		);
	}

	const hours = Math.floor( totalSeconds / 3600 );
	const minutes = Math.floor( ( totalSeconds % 3600 ) / 60 );

	return sprintf(
		/* translators: 1: Number of hours, 2: Number of minutes. */
		__( '%1$dh %2$dm', 'bimbeau-privacy-analytics' ),
		hours,
		minutes
	);
};

export const formatCompactDurationMetricValue = ( valueInMs ) => {
	const normalizedValue = Number( valueInMs );
	const safeValueInMs =
		Number.isFinite( normalizedValue ) && normalizedValue > 0
			? normalizedValue
			: 0;
	const totalSeconds = Math.floor( safeValueInMs / 1000 );

	if ( totalSeconds < 60 ) {
		/* translators: %d: Number of seconds. */
		return sprintf( __( '%ds', 'bimbeau-privacy-analytics' ), totalSeconds );
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
