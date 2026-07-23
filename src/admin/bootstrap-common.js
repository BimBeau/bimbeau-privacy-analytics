/**
 * Shared admin bootstrap for BimBeau Privacy Analytics.
 */

import { createRoot, render } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import AdminErrorBoundary from './components/AdminErrorBoundary';
import AdminApp from './AdminApp';
import { ADMIN_CONFIG } from './constants';

const rootId = ADMIN_CONFIG?.rootId || 'bbpa-admin';
const realtimeMapSnackbarStylesId = 'bbpa-realtime-map-snackbar-styles';
const realtimeMapSnackbarContainerClassName = 'bbpa-realtime-map-snackbars';
const realtimeMapSnackbarClassName = 'bbpa-realtime-map-snackbar';
const realtimeMapSnackbarDurationMs = 6500;
const realtimeMapSnackbarMaxItems = 3;
const realtimeMapSnackbarLabelKeys = [
	'newVisitor',
	'pageViewed',
	'visitorInactive',
	'unknownPage',
	'unknownVisitor',
	'dismissNotification',
];
const realtimeMapSnackbarDefaultLabels = {
	newVisitor: __( 'New visitor', 'bimbeau-privacy-analytics' ),
	pageViewed: __( 'Page viewed', 'bimbeau-privacy-analytics' ),
	visitorInactive: __( 'Visitor inactive', 'bimbeau-privacy-analytics' ),
	unknownPage: __( 'Unknown page', 'bimbeau-privacy-analytics' ),
	unknownVisitor: __( 'Unknown visitor', 'bimbeau-privacy-analytics' ),
	dismissNotification: __( 'Dismiss notification', 'bimbeau-privacy-analytics' ),
};
const createRealtimeMapSnackbarLabels = ( labels ) => Object.fromEntries(
	realtimeMapSnackbarLabelKeys.map( ( labelKey, index ) => [
		labelKey,
		labels[ index ] || realtimeMapSnackbarDefaultLabels[ labelKey ] || '',
	] )
);
const realtimeMapSnackbarLabelsByLocale = Object.fromEntries( [
	[ 'en_US', realtimeMapSnackbarLabelKeys.map( ( labelKey ) => realtimeMapSnackbarDefaultLabels[ labelKey ] ) ],
	[ 'fr_FR', [ 'Nouveau visiteur', 'Page consult\u00e9e', 'Visiteur inactif', 'Page inconnue', 'Visiteur inconnu', 'Fermer la notification' ] ],
	[ 'de_DE', [ 'Neuer Besucher', 'Seite angesehen', 'Besucher inaktiv', 'Unbekannte Seite', 'Unbekannter Besucher', 'Benachrichtigung schlie\u00dfen' ] ],
	[ 'es_ES', [ 'Nuevo visitante', 'P\u00e1gina vista', 'Visitante inactivo', 'P\u00e1gina desconocida', 'Visitante desconocido', 'Cerrar notificaci\u00f3n' ] ],
	[ 'pt_PT', [ 'Novo visitante', 'P\u00e1gina visualizada', 'Visitante inativo', 'P\u00e1gina desconhecida', 'Visitante desconhecido', 'Fechar notifica\u00e7\u00e3o' ] ],
	[ 'it_IT', [ 'Nuovo visitatore', 'Pagina visualizzata', 'Visitatore inattivo', 'Pagina sconosciuta', 'Visitatore sconosciuto', 'Chiudi notifica' ] ],
	[ 'tr_TR', [ 'Yeni ziyaret\u00e7i', 'Sayfa g\u00f6r\u00fcnt\u00fclendi', 'Ziyaret\u00e7i etkin de\u011fil', 'Bilinmeyen sayfa', 'Bilinmeyen ziyaret\u00e7i', 'Bildirimi kapat' ] ],
	[ 'nl_NL', [ 'Nieuwe bezoeker', 'Pagina bekeken', 'Bezoeker inactief', 'Onbekende pagina', 'Onbekende bezoeker', 'Melding sluiten' ] ],
	[ 'sv_SE', [ 'Ny bes\u00f6kare', 'Sida visad', 'Bes\u00f6kare inaktiv', 'Ok\u00e4nd sida', 'Ok\u00e4nd bes\u00f6kare', 'St\u00e4ng avisering' ] ],
	[ 'da_DK', [ 'Ny bes\u00f8gende', 'Side vist', 'Bes\u00f8gende inaktiv', 'Ukendt side', 'Ukendt bes\u00f8gende', 'Luk notifikation' ] ],
	[ 'el_GR', [ '\u039d\u03ad\u03bf\u03c2 \u03b5\u03c0\u03b9\u03c3\u03ba\u03ad\u03c0\u03c4\u03b7\u03c2', '\u03a0\u03c1\u03bf\u03b2\u03bf\u03bb\u03ae \u03c3\u03b5\u03bb\u03af\u03b4\u03b1\u03c2', '\u0391\u03bd\u03b5\u03bd\u03b5\u03c1\u03b3\u03cc\u03c2 \u03b5\u03c0\u03b9\u03c3\u03ba\u03ad\u03c0\u03c4\u03b7\u03c2', '\u0386\u03b3\u03bd\u03c9\u03c3\u03c4\u03b7 \u03c3\u03b5\u03bb\u03af\u03b4\u03b1', '\u0386\u03b3\u03bd\u03c9\u03c3\u03c4\u03bf\u03c2 \u03b5\u03c0\u03b9\u03c3\u03ba\u03ad\u03c0\u03c4\u03b7\u03c2', '\u039a\u03bb\u03b5\u03af\u03c3\u03b9\u03bc\u03bf \u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03af\u03b7\u03c3\u03b7\u03c2' ] ],
	[ 'zh_CN', [ '\u65b0\u8bbf\u5ba2', '\u9875\u9762\u5df2\u6d4f\u89c8', '\u8bbf\u5ba2\u4e0d\u6d3b\u8dc3', '\u672a\u77e5\u9875\u9762', '\u672a\u77e5\u8bbf\u5ba2', '\u5173\u95ed\u901a\u77e5' ] ],
].map( ( [ locale, labels ] ) => [ locale, createRealtimeMapSnackbarLabels( labels ) ] ) );

const normalizeRealtimeMapSnackbarLocale = ( value ) => {
	if ( typeof value !== 'string' || value.trim() === '' ) {
		return '';
	}

	return value.trim().replace( '-', '_' );
};

const getRealtimeMapSnackbarLocaleKey = () => {
	const localeKeys = Object.keys( realtimeMapSnackbarLabelsByLocale );
	const documentLang = typeof document !== 'undefined'
		? document.documentElement?.getAttribute?.( 'lang' )
		: '';
	const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : '';
	const localeCandidates = [
		ADMIN_CONFIG?.settings?.locale,
		ADMIN_CONFIG?.locale,
		documentLang,
		browserLanguage,
	].map( normalizeRealtimeMapSnackbarLocale ).filter( Boolean );

	for ( const localeCandidate of localeCandidates ) {
		const normalizedCandidate = localeCandidate.toLowerCase();
		const exactMatch = localeKeys.find(
			( localeKey ) => localeKey.toLowerCase() === normalizedCandidate
		);

		if ( exactMatch ) {
			return exactMatch;
		}

		const languageCode = normalizedCandidate.split( '_' )[ 0 ];
		const languageMatch = localeKeys.find( ( localeKey ) =>
			localeKey.toLowerCase().startsWith( `${ languageCode }_` )
		);

		if ( languageMatch ) {
			return languageMatch;
		}
	}

	return 'en_US';
};

const getRealtimeMapSnackbarLabel = ( labelKey ) => {
	const localeKey = getRealtimeMapSnackbarLocaleKey();
	const localeLabels = realtimeMapSnackbarLabelsByLocale[ localeKey ] || {};

	return localeLabels[ labelKey ] || realtimeMapSnackbarDefaultLabels[ labelKey ] || '';
};

const injectRealtimeMapSnackbarStyles = () => {
	if ( document.getElementById( realtimeMapSnackbarStylesId ) ) {
		return;
	}

	const styleElement = document.createElement( 'style' );
	styleElement.id = realtimeMapSnackbarStylesId;
	styleElement.textContent = `
		.bbpa-world-map .${ realtimeMapSnackbarContainerClassName } {
			position: absolute;
			right: var(--bbpa-gap-md, 16px);
			bottom: var(--bbpa-gap-md, 16px);
			z-index: 4;
			display: grid;
			gap: 8px;
			width: min(360px, calc(100% - 32px));
			pointer-events: none;
		}

		.bbpa-realtime-panel__card[data-fullscreen-active="true"] .${ realtimeMapSnackbarContainerClassName } {
			right: 24px;
			bottom: 24px;
		}

		.${ realtimeMapSnackbarClassName } {
			display: grid;
			grid-template-columns: 20px minmax(0, 1fr) 22px;
			align-items: start;
			gap: 10px;
			padding: 10px 12px;
			border: 1px solid rgba(15, 23, 42, 0.12);
			border-radius: 10px;
			background: var(--bbpa-surface, #ffffff);
			color: var(--color-1, #1d2327);
			box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
			pointer-events: auto;
			animation: lsRealtimeMapSnackbarIn 180ms ease-out both;
		}

		.${ realtimeMapSnackbarClassName }--leaving {
			animation: lsRealtimeMapSnackbarOut 180ms ease-in both;
		}

		.${ realtimeMapSnackbarClassName }__icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 20px;
			height: 20px;
			color: var(--color-3, #3858e9);
		}

		.${ realtimeMapSnackbarClassName }__icon svg {
			display: block;
			width: 18px;
			height: 18px;
			stroke: currentColor;
		}

		.${ realtimeMapSnackbarClassName }__content {
			display: grid;
			gap: 2px;
			min-width: 0;
		}

		.${ realtimeMapSnackbarClassName }__title {
			font-size: 13px;
			font-weight: 600;
			line-height: 1.35;
			color: var(--color-1, #1d2327);
		}

		.${ realtimeMapSnackbarClassName }__meta {
			font-size: 12px;
			line-height: 1.35;
			color: var(--color-2, #50575e);
			overflow-wrap: anywhere;
		}

		.${ realtimeMapSnackbarClassName }__dismiss {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			margin: -3px -5px 0 0;
			padding: 0;
			border: 0;
			border-radius: 999px;
			background: transparent;
			color: var(--color-2, #50575e);
			cursor: pointer;
			font-size: 18px;
			line-height: 1;
		}

		.${ realtimeMapSnackbarClassName }__dismiss:hover,
		.${ realtimeMapSnackbarClassName }__dismiss:focus-visible {
			background: rgba(15, 23, 42, 0.08);
			color: var(--color-1, #1d2327);
			outline: none;
		}

		@keyframes lsRealtimeMapSnackbarIn {
			from {
				opacity: 0;
				transform: translateY(10px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		@keyframes lsRealtimeMapSnackbarOut {
			from {
				opacity: 1;
				transform: translateY(0);
			}
			to {
				opacity: 0;
				transform: translateY(10px);
			}
		}

		@media (max-width: 600px) {
			.bbpa-world-map .${ realtimeMapSnackbarContainerClassName } {
				right: 12px;
				bottom: 12px;
				left: 12px;
				width: auto;
			}
		}

		@media (prefers-reduced-motion: reduce) {
			.${ realtimeMapSnackbarClassName },
			.${ realtimeMapSnackbarClassName }--leaving {
				animation: none;
			}
		}
	`;
	document.head.appendChild( styleElement );
};

const normalizeRealtimeMapSnackbarText = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	return value.replace( /\s+/g, ' ' ).trim();
};

const getRealtimeMapSnackbarIconPath = ( type ) => {
	if ( type === 'pageView' ) {
		return '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>';
	}

	if ( type === 'visitorLeft' ) {
		return '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>';
	}

	return '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>';
};

const getRealtimeMapSnackbarTitle = ( type ) => {
	if ( type === 'pageView' ) {
		return getRealtimeMapSnackbarLabel( 'pageViewed' );
	}

	if ( type === 'visitorLeft' ) {
		return getRealtimeMapSnackbarLabel( 'visitorInactive' );
	}

	return getRealtimeMapSnackbarLabel( 'newVisitor' );
};

const setupRealtimeMapSnackbars = ( rootElement ) => {
	if ( ! rootElement ) {
		return;
	}

	injectRealtimeMapSnackbarStyles();

	let previousVisits = new Map();
	let hasInitializedVisits = false;
	let scanFrame = 0;
	let snackbarContainer = null;

	const getSnackbarHost = () => document.querySelector( '.bbpa-realtime-panel .bbpa-world-map' );

	const ensureSnackbarContainer = () => {
		const host = getSnackbarHost();
		if ( ! host ) {
			snackbarContainer = null;
			return null;
		}

		if (
			snackbarContainer?.isConnected &&
			snackbarContainer.parentElement === host
		) {
			return snackbarContainer;
		}

		snackbarContainer = Array.from( host.children ).find( ( child ) =>
			child.classList?.contains( realtimeMapSnackbarContainerClassName )
		) || null;

		if ( ! snackbarContainer ) {
			snackbarContainer = document.createElement( 'div' );
			snackbarContainer.className = realtimeMapSnackbarContainerClassName;
			snackbarContainer.setAttribute( 'aria-live', 'polite' );
			snackbarContainer.setAttribute( 'aria-atomic', 'false' );
			host.appendChild( snackbarContainer );
		}

		return snackbarContainer;
	};

	const getCellText = ( cells, index ) => normalizeRealtimeMapSnackbarText(
		cells[ index ]?.textContent || ''
	);

	const getRealtimeVisitsFromDom = () => {
		const panel = document.querySelector( '.bbpa-realtime-panel' );
		if ( ! panel ) {
			return null;
		}

		const visitsContainer = panel.querySelector( '.bbpa-realtime-panel__visits' );
		if ( ! visitsContainer ) {
			return null;
		}

		const rows = Array.from( visitsContainer.querySelectorAll( 'tbody tr' ) );
		const visits = new Map();

		rows.forEach( ( row, index ) => {
			const cells = Array.from( row.querySelectorAll( 'td' ) );
			const visitorIdCandidate = normalizeRealtimeMapSnackbarText(
				cells[ 0 ]?.querySelector( 'code' )?.textContent ||
				cells[ 0 ]?.textContent ||
				''
			);
			const city = getCellText( cells, 2 );
			const currentPage = getCellText( cells, 4 );
			const hasVisitorId = visitorIdCandidate && visitorIdCandidate !== '\u2014';
			const id = hasVisitorId
				? visitorIdCandidate
				: `anonymous-${ index }-${ city }-${ currentPage }`;

			if ( ! id ) {
				return;
			}

			visits.set( id, {
				id,
				visitorLabel: hasVisitorId ? visitorIdCandidate : '',
				location: city,
				currentPage,
			} );
		} );

		return visits;
	};

	const removeSnackbar = ( snackbar, immediate = false ) => {
		if ( ! snackbar || ! snackbar.isConnected ) {
			return;
		}

		if ( immediate ) {
			snackbar.remove();
			return;
		}

		if ( snackbar.dataset.removing === 'true' ) {
			return;
		}

		snackbar.dataset.removing = 'true';
		snackbar.classList.add( `${ realtimeMapSnackbarClassName }--leaving` );
		window.setTimeout( () => snackbar.remove(), 180 );
	};

	const scheduleSnackbarRemoval = ( snackbar ) => {
		let timeoutId = 0;
		const startTimer = ( delay = realtimeMapSnackbarDurationMs ) => {
			window.clearTimeout( timeoutId );
			timeoutId = window.setTimeout(
				() => removeSnackbar( snackbar ),
				delay
			);
		};
		const pauseTimer = () => window.clearTimeout( timeoutId );

		snackbar.addEventListener( 'mouseenter', pauseTimer );
		snackbar.addEventListener( 'mouseleave', () => startTimer( 1800 ) );
		snackbar.addEventListener( 'focusin', pauseTimer );
		snackbar.addEventListener( 'focusout', () => startTimer( 1800 ) );
		startTimer();
	};

	const renderSnackbar = ( type, visit ) => {
		const container = ensureSnackbarContainer();
		if ( ! container ) {
			return;
		}

		while ( container.children.length >= realtimeMapSnackbarMaxItems ) {
			removeSnackbar( container.firstElementChild, true );
		}

		const snackbar = document.createElement( 'article' );
		snackbar.className = `${ realtimeMapSnackbarClassName } ${ realtimeMapSnackbarClassName }--${ type }`;
		snackbar.setAttribute( 'role', 'status' );

		const icon = document.createElement( 'span' );
		icon.className = `${ realtimeMapSnackbarClassName }__icon`;
		icon.setAttribute( 'aria-hidden', 'true' );
		icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ getRealtimeMapSnackbarIconPath( type ) }</svg>`;

		const content = document.createElement( 'span' );
		content.className = `${ realtimeMapSnackbarClassName }__content`;

		const title = document.createElement( 'strong' );
		title.className = `${ realtimeMapSnackbarClassName }__title`;
		title.textContent = getRealtimeMapSnackbarTitle( type );

		const meta = document.createElement( 'span' );
		meta.className = `${ realtimeMapSnackbarClassName }__meta`;
		meta.textContent = type === 'pageView'
			? visit.currentPage || visit.location || visit.visitorLabel || getRealtimeMapSnackbarLabel( 'unknownPage' )
			: visit.location || visit.currentPage || visit.visitorLabel || getRealtimeMapSnackbarLabel( 'unknownVisitor' );

		const dismiss = document.createElement( 'button' );
		dismiss.type = 'button';
		dismiss.className = `${ realtimeMapSnackbarClassName }__dismiss`;
		dismiss.setAttribute(
			'aria-label',
			getRealtimeMapSnackbarLabel( 'dismissNotification' )
		);
		dismiss.textContent = '\u00d7';
		dismiss.addEventListener( 'click', () => removeSnackbar( snackbar ) );

		content.append( title, meta );
		snackbar.append( icon, content, dismiss );
		container.appendChild( snackbar );
		scheduleSnackbarRemoval( snackbar );
	};

	const scanRealtimeVisits = () => {
		ensureSnackbarContainer();

		const currentVisits = getRealtimeVisitsFromDom();
		if ( currentVisits === null ) {
			previousVisits = new Map();
			hasInitializedVisits = false;
			return;
		}

		if ( ! hasInitializedVisits ) {
			previousVisits = currentVisits;
			hasInitializedVisits = true;
			return;
		}

		const events = [];

		currentVisits.forEach( ( visit, id ) => {
			const previousVisit = previousVisits.get( id );
			if ( ! previousVisit ) {
				events.push( { type: 'newVisitor', visit } );
				return;
			}

			if (
				visit.currentPage &&
				previousVisit.currentPage &&
				visit.currentPage !== previousVisit.currentPage
			) {
				events.push( { type: 'pageView', visit } );
			}
		} );

		previousVisits.forEach( ( visit, id ) => {
			if ( ! currentVisits.has( id ) ) {
				events.push( { type: 'visitorLeft', visit } );
			}
		} );

		previousVisits = currentVisits;
		events.slice( -realtimeMapSnackbarMaxItems ).forEach( ( event ) => {
			renderSnackbar( event.type, event.visit );
		} );
	};

	const scheduleScan = () => {
		if ( scanFrame ) {
			return;
		}

		scanFrame = window.requestAnimationFrame( () => {
			scanFrame = 0;
			scanRealtimeVisits();
		} );
	};

	if ( typeof window.MutationObserver === 'function' ) {
		const observer = new window.MutationObserver( scheduleScan );
		observer.observe( rootElement, {
			childList: true,
			subtree: true,
			characterData: true,
		} );
	} else {
		window.setInterval( scanRealtimeVisits, 1000 );
	}

	scheduleScan();
	window.setTimeout( scheduleScan, 1200 );
};

export const bootstrapAdmin = ( {
	beforeRender = [],
	afterRender = [],
	PremiumPwaNavigation = null,
} = {} ) => {
	const root = document.getElementById( rootId );

	if ( ! root ) {
		const pwaRoot = document.getElementById( 'bbpa-app' );
		if ( pwaRoot?.dataset?.bbpaLoading === '1' ) {
			pwaRoot.removeAttribute( 'data-bbpa-loading' );
			pwaRoot.classList.remove( 'bbpa-front-app-loading' );
			pwaRoot.innerHTML = '';
			throw new Error(
				`BimBeau Privacy Analytics could not mount: #${ rootId } is missing from the Premium PWA document.`
			);
		}
		return;
	}

	beforeRender.forEach( ( initialize ) => {
		if ( typeof initialize === 'function' ) {
			initialize( root );
		}
	} );

	setupRealtimeMapSnackbars( root );

	if ( root.dataset.bbpaLoading === '1' ) {
		root.removeAttribute( 'data-bbpa-loading' );
		root.classList.remove( 'bbpa-front-app-loading' );
		root.innerHTML = '';
	}

	const appElement = (
		<AdminErrorBoundary>
			<AdminApp PremiumPwaNavigation={ PremiumPwaNavigation } />
		</AdminErrorBoundary>
	);

	if ( typeof createRoot === 'function' ) {
		createRoot( root ).render( appElement );
	} else {
		render( appElement, root );
	}

	afterRender.forEach( ( initialize ) => {
		if ( typeof initialize === 'function' ) {
			initialize( root );
		}
	} );
};
