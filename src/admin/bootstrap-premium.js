/**
 * Premium admin bootstrap for BimBeau Privacy Analytics.
 */

import { ADMIN_CONFIG } from './constants';

const pwaConfig = ADMIN_CONFIG?.settings?.pwa || null;
const eventConfigDropStylesId = 'bbpa-event-config-drop-placeholder-styles';

const resolveServiceWorkerScope = () => {
	const fallbackScope = '/bbpa/';

	if ( ! pwaConfig?.serviceWorkerUrl || typeof window.URL !== 'function' ) {
		return fallbackScope;
	}

	try {
		const serviceWorkerUrl = new window.URL(
			pwaConfig.serviceWorkerUrl,
			window.location.origin
		);
		const serviceWorkerPath = serviceWorkerUrl.pathname || '';
		const lastSlashIndex = serviceWorkerPath.lastIndexOf( '/' );

		if ( lastSlashIndex < 0 ) {
			return fallbackScope;
		}

		const scopePath = serviceWorkerPath.slice( 0, lastSlashIndex + 1 );
		return scopePath !== '' ? scopePath : fallbackScope;
	} catch ( error ) {
		return fallbackScope;
	}
};

export const registerBPAServiceWorker = async () => {
	if (
		! window.isSecureContext ||
		! ( 'serviceWorker' in window.navigator ) ||
		! pwaConfig?.serviceWorkerUrl
	) {
		return;
	}

	try {
		const registration = await window.navigator.serviceWorker.register(
			pwaConfig.serviceWorkerUrl,
			{
				scope: resolveServiceWorkerScope(),
			}
		);

		if ( registration.waiting ) {
			registration.waiting.postMessage( {
				type: 'BBPA_SW_SKIP_WAITING',
			} );
		}
	} catch ( error ) {
		// Service worker support is progressive; startup remains functional without it.
	}
};

const injectEventConfigDropStyles = () => {
	if ( document.getElementById( eventConfigDropStylesId ) ) {
		return;
	}

	const styleElement = document.createElement( 'style' );
	styleElement.id = eventConfigDropStylesId;
	styleElement.textContent = `
		body.bbpa-events-panel--reordering .bbpa-events-panel__drag-handle {
			cursor: grabbing;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--dragging {
			opacity: 0.56;
			transition: opacity 120ms ease;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-before,
		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-after {
			position: relative;
			overflow: visible !important;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-before {
			margin-top: 54px !important;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-after {
			margin-bottom: 66px !important;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-before::before,
		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-after::after {
			content: "";
			position: absolute;
			left: 0;
			right: 0;
			height: 42px;
			border: 1px dashed var(--bbpa-color-accent, var(--wp-admin-theme-color, #3858e9));
			border-radius: 8px;
			background: var(--bbpa-color-accent-soft, rgba(56, 88, 233, 0.08));
			box-shadow: inset 0 0 0 1px rgba(56, 88, 233, 0.08);
			pointer-events: none;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-before::before {
			top: -54px;
		}

		.bbpa-events-panel .components-card.bbpa-events-panel__event-card--drop-after::after {
			bottom: -54px;
		}
	`;
	document.head.appendChild( styleElement );
};

export const setupEventConfigDropPlaceholder = () => {
	injectEventConfigDropStyles();

	let sourceCard = null;
	let targetCard = null;
	const targetClasses = [
		'bbpa-events-panel__event-card--drop-before',
		'bbpa-events-panel__event-card--drop-after',
	];

	const findEventCard = ( element ) => {
		const card = element?.closest?.( '.bbpa-events-panel .components-card' );

		if ( ! card || ! card.querySelector( '.bbpa-events-panel__event-header' ) ) {
			return null;
		}

		return card;
	};

	const getEventPanel = ( element ) => element?.closest?.( '.bbpa-events-panel' ) || sourceCard?.closest?.( '.bbpa-events-panel' ) || null;

	const getEventCards = ( panel ) => Array.from( panel?.querySelectorAll?.( '.components-card' ) || [] )
		.filter( ( card ) => card.querySelector( '.bbpa-events-panel__event-header' ) );

	const isPointInsideElement = ( element, clientX, clientY ) => {
		if ( ! element || ! Number.isFinite( clientX ) || ! Number.isFinite( clientY ) ) {
			return false;
		}

		const rect = element.getBoundingClientRect();
		return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
	};

	const findEventCardFromPointer = ( panel, clientY ) => {
		const cards = getEventCards( panel ).filter( ( card ) => card !== sourceCard );

		if ( ! cards.length || ! Number.isFinite( clientY ) ) {
			return null;
		}

		return cards.reduce( ( closestCard, card ) => {
			const rect = card.getBoundingClientRect();
			const centerY = rect.top + rect.height / 2;
			const distance = Math.abs( clientY - centerY );
			const closestRect = closestCard.getBoundingClientRect();
			const closestCenterY = closestRect.top + closestRect.height / 2;
			const closestDistance = Math.abs( clientY - closestCenterY );

			return distance < closestDistance ? card : closestCard;
		}, cards[ 0 ] );
	};

	const clearTargetCard = () => {
		if ( targetCard ) {
			targetCard.classList.remove( ...targetClasses );
			targetCard = null;
		}
	};

	const clearDragState = () => {
		clearTargetCard();
		if ( sourceCard ) {
			sourceCard.classList.remove( 'bbpa-events-panel__event-card--dragging' );
			sourceCard = null;
		}
		document.body.classList.remove( 'bbpa-events-panel--reordering' );
	};

	const getDropPlacement = ( candidateCard ) => {
		if ( ! sourceCard || ! candidateCard || sourceCard === candidateCard ) {
			return '';
		}

		const cards = getEventCards( candidateCard.closest( '.bbpa-events-panel' ) );
		const sourceIndex = cards.indexOf( sourceCard );
		const targetIndex = cards.indexOf( candidateCard );

		if ( sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex ) {
			return '';
		}

		return sourceIndex < targetIndex ? 'after' : 'before';
	};

	const setTargetCard = ( nextTargetCard, placement ) => {
		if ( ! placement ) {
			clearTargetCard();
			return;
		}

		if ( targetCard !== nextTargetCard ) {
			clearTargetCard();
			targetCard = nextTargetCard;
		} else {
			targetCard.classList.remove( ...targetClasses );
		}

		targetCard.classList.add( `bbpa-events-panel__event-card--drop-${ placement }` );
	};

	document.addEventListener( 'dragstart', ( event ) => {
		const dragHandle = event.target?.closest?.( '.bbpa-events-panel__drag-handle' );

		if ( ! dragHandle ) {
			return;
		}

		sourceCard = findEventCard( dragHandle );
		if ( ! sourceCard ) {
			return;
		}

		sourceCard.classList.add( 'bbpa-events-panel__event-card--dragging' );
		document.body.classList.add( 'bbpa-events-panel--reordering' );
	}, true );

	document.addEventListener( 'dragover', ( event ) => {
		if ( ! sourceCard ) {
			return;
		}

		const panel = getEventPanel( event.target );

		if ( ! panel || ! isPointInsideElement( panel, event.clientX, event.clientY ) ) {
			clearTargetCard();
			return;
		}

		const candidateCard = findEventCard( event.target ) || findEventCardFromPointer( panel, event.clientY );
		const placement = getDropPlacement( candidateCard );

		if ( ! candidateCard || ! placement ) {
			clearTargetCard();
			return;
		}

		event.preventDefault();
		if ( event.dataTransfer ) {
			event.dataTransfer.dropEffect = 'move';
		}
		setTargetCard( candidateCard, placement );
	}, true );

	document.addEventListener( 'drop', () => {
		window.setTimeout( clearDragState, 0 );
	}, true );

	document.addEventListener( 'dragend', clearDragState, true );
};

