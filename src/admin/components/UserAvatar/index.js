import { useState } from '@wordpress/element';

// Background and text pairs with a contrast of at least 4.5:1, picked from the row key.
export const USER_AVATAR_TONES = 6;

/**
 * Initials of a display name: the first letter of the first and last words ("Jean Dupont" → "JD",
 * "Victor" → "V"), upper case. Other characters are skipped: "@admin" gives "A", "42" nothing.
 *
 * @param {string} name Display name.
 * @return {string} One or two letters, or an empty string.
 */
export const getInitials = ( name ) => {
	const words = String( name || '' )
		.split( /\s+/ )
		.map( ( word ) => Array.from( word ).find( ( char ) => /\p{L}/u.test( char ) ) )
		.filter( Boolean );

	if ( ! words.length ) {
		return '';
	}

	return ( words.length > 1
		? words[ 0 ] + words[ words.length - 1 ]
		: words[ 0 ]
	).toLocaleUpperCase();
};

/**
 * Tone of an avatar, stable for a given key (the user id), so an author keeps the same color
 * from one period to the next.
 *
 * @param {string|number} key Row key.
 * @return {number} Tone index, from 0 to USER_AVATAR_TONES - 1.
 */
export const getUserAvatarTone = ( key ) => {
	const text = String( key ?? '' );
	let hash = 0;
	for ( let index = 0; index < text.length; index++ ) {
		hash = ( hash * 31 + text.charCodeAt( index ) ) % 2147483647;
	}

	return hash % USER_AVATAR_TONES;
};

/**
 * Avatar of a person: the picture WordPress gives for the user (Gravatar or a local avatar plugin,
 * only while Settings > Discussion shows avatars), else the initials of the name drawn in CSS.
 * A picture that fails to load (no Gravatar: 404) falls back to the initials. Decorative: the
 * name is written next to it.
 *
 * @param {Object}        props
 * @param {string}        props.name         Display name.
 * @param {string}        props.imageUrl     Avatar URL from WordPress, or an empty string.
 * @param {string|number} props.toneKey      Key that picks the color of the initials (the user id).
 * @param {boolean}       props.isUnresolved Neutral avatar of a row without a person.
 */
const UserAvatar = ( { name = '', imageUrl = '', toneKey = '', isUnresolved = false } ) => {
	const [ failedUrl, setFailedUrl ] = useState( '' );
	const initials = isUnresolved ? '' : getInitials( name );

	if ( ! isUnresolved && imageUrl && failedUrl !== imageUrl ) {
		return (
			<img
				className="bbpa-user-avatar bbpa-user-avatar--image"
				src={ imageUrl }
				alt=""
				width={ 32 }
				height={ 32 }
				loading="lazy"
				referrerPolicy="no-referrer"
				onError={ () => setFailedUrl( imageUrl ) }
			/>
		);
	}

	const className = [
		'bbpa-user-avatar',
		initials
			? `bbpa-user-avatar--tone-${ getUserAvatarTone( toneKey || name ) }`
			: 'bbpa-user-avatar--empty',
	].join( ' ' );

	return (
		<span className={ className } aria-hidden="true">
			{ initials }
		</span>
	);
};

export default UserAvatar;
