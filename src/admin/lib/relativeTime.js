import { getAdminLocale } from './date';

const formatterCache = new Map();

const getRelativeTimeFormatter = ( locale ) => {
	const key = locale || 'default';
	if ( ! formatterCache.has( key ) ) {
		try {
			formatterCache.set(
				key,
				new Intl.RelativeTimeFormat( locale, { numeric: 'auto', style: 'short' } )
			);
		} catch {
			formatterCache.set(
				key,
				new Intl.RelativeTimeFormat( undefined, { numeric: 'auto', style: 'short' } )
			);
		}
	}
	return formatterCache.get( key );
};

/**
 * Converts a Unix timestamp in seconds or milliseconds to seconds.
 *
 * @param {number|string} value Timestamp.
 * @return {number|null} Seconds, or null when the value is not a positive number.
 */
export const toUnixSeconds = ( value ) => {
	const timestamp = Number( value );
	if ( ! Number.isFinite( timestamp ) || timestamp <= 0 ) {
		return null;
	}
	return timestamp > 1e12 ? timestamp / 1000 : timestamp;
};

/**
 * Formats the time elapsed since a timestamp in the admin locale ("now", "40 sec. ago",
 * "2 min. ago", "1 hr. ago"), with Intl.RelativeTimeFormat so no translation is needed.
 *
 * @param {number|string} timestamp  Unix timestamp in seconds or milliseconds.
 * @param {number}        nowSeconds Current time in seconds.
 * @param {string}        locale     BCP 47 locale, the admin locale by default.
 * @return {string} Relative time, or an empty string when the timestamp is invalid.
 */
export const formatTimeSince = ( timestamp, nowSeconds = Date.now() / 1000, locale = getAdminLocale() ) => {
	const seconds = toUnixSeconds( timestamp );
	if ( seconds === null ) {
		return '';
	}

	const elapsed = Math.max( 0, Math.round( nowSeconds - seconds ) );
	const formatter = getRelativeTimeFormatter( locale );

	if ( elapsed < 10 ) {
		return formatter.format( 0, 'second' );
	}
	if ( elapsed < 60 ) {
		return formatter.format( -elapsed, 'second' );
	}
	if ( elapsed < 3600 ) {
		return formatter.format( -Math.round( elapsed / 60 ), 'minute' );
	}
	return formatter.format( -Math.round( elapsed / 3600 ), 'hour' );
};
