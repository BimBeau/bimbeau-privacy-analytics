import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { getRangeFromSelection } from '../lib/date';
import { formatWpDateTime } from '../lib/date';
import { getWpDateTimeTimestamp } from '../lib/date';
import { normalizeUnixTimestampSeconds } from '../lib/date';
import { LuBookOpenCheck, LuChevronDown, LuChevronRight, LuGripVertical, LuMousePointerClick, LuWebhook, LuZap } from 'react-icons/lu';
import { __ } from '@wordpress/i18n';
import {
	Button,
	Card,
	CardBody,
	CardHeader,
	ComboboxControl,
	Flex,
	FlexItem,
	FormTokenField,
	SelectControl,
	TextControl,
	TextareaControl,
	ToggleControl,
	Tooltip,
	Modal,
} from '@wordpress/components';
import Notice from '../components/BrandNotice';
import { ProBadgeText } from '../components/ProBadge';

import DataState from '../components/DataState';
import EventScriptModal from '../components/EventScriptModal';
import ReportExportAction from '../components/ReportExportAction';
import useAdminEndpoint from '../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../constants';
import { getCountryFlagClass, getCountryLabel, isUnknownCountryCode, resolveCountryCode } from '../lib/countryNames';
import BrandIcon from '../components/icons/BrandIcon';
import { getChannelLabel } from '../lib/channelLabels';

const EMPTY_EVENT_CONFIG = [];
const SNIPPET_PLACEHOLDER = `gtag('event', 'conversion', {
  send_to: 'AW-XXXXXXX/YYYYYYY',
  value: 1.0,
  currency: 'EUR',
  page_location: {{page_url}}
});`;
const TRIGGER_ALLOWED_VARIABLES = {
	page_view: [ 'page_url', 'page_title' ],
	click: [ 'page_url', 'page_title', 'href', 'element_text', 'element_id', 'element_classes' ],
	webhook: [ 'form_id', 'source', 'lead_type', 'submission_id', 'webhook_request_id', 'idempotency_key' ],
};

const ALL_ALLOWED_VARIABLES = Array.from( new Set( Object.values( TRIGGER_ALLOWED_VARIABLES ).flat() ) );

const NO_AVAILABLE_LABEL = __( 'No available', 'bimbeau-privacy-analytics' );

const WEBHOOK_PUBLIC_CONTEXT_KEYS = [ 'form_id', 'source', 'lead_type', 'submission_id', 'webhook_request_id', 'idempotency_key' ];

const generateWebhookToken = () => {
	if ( typeof globalThis.crypto?.randomUUID === 'function' ) {
		return globalThis.crypto.randomUUID().replace( /-/g, '' );
	}
	const randomPart = `${ Math.random().toString( 36 ).slice( 2 ) }${ Date.now().toString( 36 ) }`;
	return randomPart.padEnd( 40, 'x' );
};

const buildWebhookRelativePath = ( token ) => `/wp-json/bbpa/v1/events/webhook/${ encodeURIComponent( String( token || '' ).trim() ) }`;

const buildWebhookUrl = ( token ) => {
	const relativePath = buildWebhookRelativePath( token );
	if ( ! String( token || '' ).trim() ) {
		return relativePath;
	}
	if ( typeof window?.location?.origin === 'string' && window.location.origin ) {
		return `${ window.location.origin }${ relativePath }`;
	}
	return relativePath;
};


const renderMaybeUnavailableLabel = ( label ) => label === NO_AVAILABLE_LABEL ? <span className="bbpa-label--unavailable">{ label }</span> : label;


const getFlagAssetUrl = ( countryCode ) => {
	const normalizedCode = String( countryCode || '' ).trim().toLowerCase();
	if ( ! normalizedCode ) {
		return '';
	}
	const flagAssets = window?.BBPAAdmin?.settings?.flagAssets || {};
	const baseUrl = String( flagAssets.baseUrl || '' ).trim();
	if ( ! baseUrl ) {
		return '';
	}
	const fileMap = flagAssets.map || {};
	const fileName = String( fileMap[ normalizedCode ] || `${ normalizedCode }.svg` ).trim();
	if ( ! fileName ) {
		return '';
	}
	return `${ baseUrl }${ fileName }`;
};

const getCountryFlagInlineStyle = ( countryCode ) => {
	const flagUrl = getFlagAssetUrl( countryCode );
	if ( ! flagUrl ) {
		return undefined;
	}
	return {
		backgroundImage: `url("${ flagUrl }")`,
		backgroundSize: 'contain',
		backgroundPosition: '50%',
		backgroundRepeat: 'no-repeat',
	};
};

const DEVICE_CLASS_LABELS = {
	desktop: __( 'Desktop', 'bimbeau-privacy-analytics' ),
	mobile: __( 'Mobile', 'bimbeau-privacy-analytics' ),
	tablet: __( 'Tablet', 'bimbeau-privacy-analytics' ),
	bot: __( 'Bot', 'bimbeau-privacy-analytics' ),
	unknown: __( 'Unknown', 'bimbeau-privacy-analytics' ),
};

const formatDeviceClassLabel = ( value ) => {
	const normalizedValue = String( value || '' ).trim().toLowerCase();
	if ( ! normalizedValue ) {
		return NO_AVAILABLE_LABEL;
	}

	return DEVICE_CLASS_LABELS[ normalizedValue ] || normalizedValue;
};

const MIN_KPI_SLOT = 2;
const DEFAULT_KPI_SLOT_FALLBACK = MIN_KPI_SLOT;
const EVENT_DRAG_DATA_TYPE = 'text/plain';
const EVENT_MOBILE_CONTROLS_QUERY = '(max-width: 782px)';
const MAX_GENERATED_KPI_SLOTS = Number.isInteger( Number( ADMIN_CONFIG?.eventsKpiSlotLimit ) ) && Number( ADMIN_CONFIG?.eventsKpiSlotLimit ) >= MIN_KPI_SLOT
	? Number( ADMIN_CONFIG?.eventsKpiSlotLimit )
	: 0;
const parseKpiSlotValue = ( rawValue ) => {
	if ( Number.isInteger( rawValue ) ) {
		return rawValue;
	}
	if ( typeof rawValue === 'string' && /^\d+$/.test( rawValue.trim() ) ) {
		return Number.parseInt( rawValue, 10 );
	}
	return NaN;
};
const normalizeKpiSlotForSave = ( rawValue, fallbackSlot = DEFAULT_KPI_SLOT_FALLBACK ) => {
	const parsedSlot = parseKpiSlotValue( rawValue );
	if ( Number.isInteger( parsedSlot ) && parsedSlot >= MIN_KPI_SLOT ) {
		if ( MAX_GENERATED_KPI_SLOTS > 0 && parsedSlot > MAX_GENERATED_KPI_SLOTS ) {
			return fallbackSlot;
		}
		return parsedSlot;
	}
	return fallbackSlot;
};

const buildKpiSlotOptions = ( events ) => {
	const maxAssignedSlot = events.reduce( ( maxSlot, eventItem ) => {
		const slot = parseKpiSlotValue( eventItem?.kpi_slot );
		return Number.isInteger( slot ) && slot >= MIN_KPI_SLOT ? Math.max( maxSlot, slot ) : maxSlot;
	}, MIN_KPI_SLOT - 1 );
	const suggestedMaxSlot = Math.max( MIN_KPI_SLOT, maxAssignedSlot, MIN_KPI_SLOT + events.length );
	const upperBound = MAX_GENERATED_KPI_SLOTS > 0 ? Math.max( MIN_KPI_SLOT, MAX_GENERATED_KPI_SLOTS ) : suggestedMaxSlot;
	const options = [];
	for ( let slot = MIN_KPI_SLOT; slot <= upperBound; slot += 1 ) {
		options.push( { label: __( 'Slot', 'bimbeau-privacy-analytics' ) + ` ${ slot }`, value: String( slot ) } );
	}
	return options;
};

const getAvailableKpiSlotOptions = ( events, eventId ) => {
	const occupiedSlots = new Set();
	events.forEach( ( eventItem ) => {
		if ( ! eventItem?.kpi_enabled || eventItem?.enabled === false || eventItem?.id === eventId ) {
			return;
		}
		const slot = parseKpiSlotValue( eventItem?.kpi_slot );
		if ( Number.isInteger( slot ) && slot >= MIN_KPI_SLOT ) {
			occupiedSlots.add( String( slot ) );
		}
	} );

	return buildKpiSlotOptions( events ).filter( ( option ) => ! occupiedSlots.has( option.value ) );
};

const getDefaultKpiSlotForEvent = ( events, eventId ) => {
	const availableOptions = getAvailableKpiSlotOptions( events, eventId );
	if ( availableOptions.length ) {
		return normalizeKpiSlotForSave( availableOptions[ 0 ].value, DEFAULT_KPI_SLOT_FALLBACK );
	}
	return DEFAULT_KPI_SLOT_FALLBACK;
};

const formatPageOptionLabel = ( item ) => {
	const fallbackValue = String( item?.url || '' ).trim();
	if ( ! fallbackValue ) {
		return '';
	}
	const title = String( item?.title || '' ).trim() || fallbackValue;
	const type = String( item?.type || '' ).trim();
	return type ? `${ title } (${ type })` : title;
};

const normalizePageValueKey = ( rawValue ) => {
	const value = String( rawValue || '' ).trim();
	if ( ! value ) {
		return '';
	}
	try {
		if ( /^https?:\/\//i.test( value ) ) {
			const parsedUrl = new URL( value );
			return parsedUrl.pathname || '/';
		}
	} catch ( error ) {
		// Ignore parse errors and fallback to raw values.
	}
	return value;
};


const getActiveKpiSlotCollisions = ( eventsConfig ) => {
	if ( ! Array.isArray( eventsConfig ) ) {
		return [];
	}

	const eventIdsBySlot = new Map();
	eventsConfig.forEach( ( eventItem, eventIndex ) => {
		if ( ! eventItem?.kpi_enabled || eventItem?.enabled === false ) {
			return;
		}
		const slot = parseKpiSlotValue( eventItem?.kpi_slot );
		if ( ! Number.isInteger( slot ) || slot < MIN_KPI_SLOT ) {
			return;
		}
		const eventId = typeof eventItem?.id === 'string' && eventItem.id.trim() ? eventItem.id : `event_${ eventIndex + 1 }`;
		const ids = eventIdsBySlot.get( slot ) || [];
		ids.push( eventId );
		eventIdsBySlot.set( slot, ids );
	} );

	return Array.from( eventIdsBySlot.entries() )
		.filter( ( [ , ids ] ) => ids.length > 1 )
		.map( ( [ slot, ids ] ) => ( { slot, ids } ) );
};

const normalizeEventsConfig = ( eventsConfig ) => {
	if ( ! Array.isArray( eventsConfig ) ) {
		return { events: EMPTY_EVENT_CONFIG, invalidKpiSlotWarnings: [] };
	}
	const invalidKpiSlotWarnings = [];
	const events = eventsConfig.map( ( eventItem, eventIndex ) => {
		const normalizedId = typeof eventItem?.id === 'string' && eventItem.id.trim()
			? eventItem.id
			: `event_${ eventIndex + 1 }`;
		const normalizedTrigger = eventItem?.trigger && typeof eventItem.trigger === 'object'
			? eventItem.trigger
			: {};
		const rawActions = Array.isArray( eventItem?.actions ) ? eventItem.actions : [];
		const primaryAction = rawActions[ 0 ];
		const normalizedActions = [ primaryAction ? {
				id: typeof primaryAction?.id === 'string' && primaryAction.id.trim()
					? primaryAction.id
					: `a${ eventIndex + 1 }_1`,
				enabled: primaryAction?.enabled !== false,
				order: 1,
				type: 'tracking_snippet',
				label: '',
				snippet: typeof primaryAction?.snippet === 'string' ? primaryAction.snippet : '',
			} : {
				id: `a${ eventIndex + 1 }_1`,
				enabled: true,
				order: 1,
				type: 'tracking_snippet',
				label: '',
				snippet: '',
			} ];

		const parsedKpiSlot = parseKpiSlotValue( eventItem?.kpi_slot );
		const normalizedKpiSlot = Number.isInteger( parsedKpiSlot ) && parsedKpiSlot >= MIN_KPI_SLOT
			? parsedKpiSlot
			: MIN_KPI_SLOT + eventIndex;
		if ( eventItem?.kpi_enabled && ( ! Number.isInteger( parsedKpiSlot ) || parsedKpiSlot < MIN_KPI_SLOT ) ) {
			invalidKpiSlotWarnings.push( eventItem?.kpi_slot_validation_error || __( 'KPI slot is invalid and must be an integer greater than or equal to 2.', 'bimbeau-privacy-analytics' ) );
		}

		return {
			id: normalizedId,
			label: typeof eventItem?.label === 'string' ? eventItem.label : '',
			short_label: typeof eventItem?.short_label === 'string' ? eventItem.short_label : '',
			enabled: eventItem?.enabled !== false,
			trigger: {
				type: [ 'click', 'page_view' ].includes( normalizedTrigger.type ) ? normalizedTrigger.type : 'click',
				selector: typeof normalizedTrigger.selector === 'string' ? normalizedTrigger.selector : '',
				url_pattern: typeof normalizedTrigger.url_pattern === 'string' ? normalizedTrigger.url_pattern : '',
				once_per_page: Boolean( normalizedTrigger.once_per_page ),
				debounce_ms: Math.max( 0, Math.min( 60000, Number( normalizedTrigger.debounce_ms ) || 0 ) ),
				form_selector: typeof normalizedTrigger.form_selector === 'string' ? normalizedTrigger.form_selector : '',
				webhook_token: typeof normalizedTrigger.webhook_token === 'string' ? normalizedTrigger.webhook_token : '',
				webhook_method: typeof normalizedTrigger.webhook_method === 'string' ? normalizedTrigger.webhook_method : 'POST',
			},
			actions: normalizedActions,
			params: eventItem?.params && typeof eventItem.params === 'object' ? eventItem.params : {},
			kpi_enabled: Boolean( eventItem?.kpi_enabled ),
			kpi_slot: normalizedKpiSlot >= MIN_KPI_SLOT ? normalizedKpiSlot : DEFAULT_KPI_SLOT_FALLBACK,
		};
	} );
	return { events, invalidKpiSlotWarnings };
};



const syncKpiSlotsWithVisualOrder = ( events = [] ) => {
	let kpiSlot = MIN_KPI_SLOT;

	return events.map( ( eventItem ) => {
		if ( ! eventItem?.kpi_enabled || eventItem?.enabled === false ) {
			return eventItem;
		}

		const nextEvent = {
			...eventItem,
			kpi_slot: kpiSlot,
		};

		kpiSlot += 1;

		return nextEvent;
	} );
};

const syncEventOrderWithVisualOrder = ( events = [] ) =>
	events.map( ( eventItem, index ) => ( {
		...eventItem,
		order: index + 1,
	} ) );

const syncEventsForPersistence = ( events = [] ) =>
	syncKpiSlotsWithVisualOrder(
		syncEventOrderWithVisualOrder( events )
	);

const VIEWABLE_EVENT_TRIGGER_TYPES = new Set( [ 'page_view', 'click' ] );

const isViewActionEligible = ( triggerType ) => VIEWABLE_EVENT_TRIGGER_TYPES.has( String( triggerType || '' ).trim().toLowerCase() );


const EventKpiIcon = ( { triggerType = 'click' } ) => {
	if ( triggerType === 'page_view' ) {
		return <LuBookOpenCheck size={ 24 } className="bbpa-kpi-card__icon" aria-hidden="true" />;
	}
	if ( triggerType === 'webhook' ) {
		return <LuWebhook size={ 24 } className="bbpa-kpi-card__icon" aria-hidden="true" />;
	}
	return <LuMousePointerClick size={ 24 } className="bbpa-kpi-card__icon" aria-hidden="true" />;
};


const formatEventOccurrenceDateTime = ( value ) => {
	if ( ! value ) {
		return __( 'Unknown', 'bimbeau-privacy-analytics' );
	}

	const normalizedValue = String( value ).trim();
	return formatWpDateTime( normalizedValue, __( 'Unknown', 'bimbeau-privacy-analytics' ) );
};

const formatEventDay = ( dayBucket ) => {
	if ( ! dayBucket ) {
		return __( 'Unknown', 'bimbeau-privacy-analytics' );
	}

	const normalizedDayBucket = String( dayBucket ).trim();
	const dayMatch = normalizedDayBucket.match( /^(\d{4})-(\d{2})-(\d{2})/ );
	if ( ! dayMatch ) {
		return normalizedDayBucket;
	}

	const parsedDate = new Date(
		Number( dayMatch[ 1 ] ),
		Number( dayMatch[ 2 ] ) - 1,
		Number( dayMatch[ 3 ] )
	);
	if ( Number.isNaN( parsedDate.getTime() ) ) {
		return normalizedDayBucket;
	}
	return parsedDate.toLocaleDateString();
};

const getEventStatsField = ( row, fieldNames ) => {
	for ( const fieldName of fieldNames ) {
		const value = row?.[ fieldName ];
		if ( typeof value === 'string' && value.trim() !== '' ) {
			return value;
		}
	}

	return '';
};

const buildEventStatsOccurrences = ( statsRows ) => {
	if ( ! Array.isArray( statsRows ) || ! statsRows.length ) {
		return [];
	}

	return statsRows.map( ( row ) => {
		const occurrenceDate = row?.last_triggered_at || '';
		const occurrenceDay = row?.last_day || row?.first_day || row?.day_bucket || '';
		return {
			...row,
			occurrence_date: occurrenceDate,
			occurrence_day: occurrenceDay,
			occurrence_index: 0,
		};
	} );
};

const getEventOccurrenceTimestamp = ( row ) => {
	const occurrenceSource = row?.occurrence_date || row?.occurrence_day || '';
	if ( ! occurrenceSource ) {
		return 0;
	}

	const normalizedDateTimeTimestamp = getWpDateTimeTimestamp( occurrenceSource );
	if ( normalizedDateTimeTimestamp !== null ) {
		return normalizedDateTimeTimestamp;
	}

	const normalizedOccurrenceSource = String( occurrenceSource ).trim();
	if ( /^\d+(?:\.\d+)?$/.test( normalizedOccurrenceSource ) ) {
		const normalizedUnixSeconds = normalizeUnixTimestampSeconds( normalizedOccurrenceSource );
		if ( normalizedUnixSeconds !== null ) {
			return normalizedUnixSeconds * 1000;
		}
	}

	const parsedTimestamp = Date.parse( normalizedOccurrenceSource );
	if ( ! Number.isNaN( parsedTimestamp ) ) {
		return parsedTimestamp;
	}

	const dayMatch = normalizedOccurrenceSource.match( /^(\d{4})-(\d{2})-(\d{2})/ );
	if ( dayMatch ) {
		const fallbackDate = new Date(
			Number( dayMatch[ 1 ] ),
			Number( dayMatch[ 2 ] ) - 1,
			Number( dayMatch[ 3 ] )
		);
		return Number.isNaN( fallbackDate.getTime() ) ? 0 : fallbackDate.getTime();
	}

	return 0;
};

const normalizeSelectorToken = ( token ) => {
	if ( typeof token === 'string' ) {
		return token.trim();
	}

	if ( token && typeof token === 'object' ) {
		const candidate = token.value ?? token.label ?? token.title ?? '';
		return String( candidate ).trim();
	}

	return String( token || '' ).trim();
};

const parseSelectorTokens = ( selectorValue ) => String( selectorValue || '' )
	.split( /[\n,]/ )
	.map( normalizeSelectorToken )
	.filter( Boolean );

const formatSelectorTokens = ( tokens ) => {
	const normalizedTokens = Array.isArray( tokens )
		? tokens
		: typeof tokens === 'string'
			? tokens.split( /[\n,]/ )
			: [];

	return [ ...new Set( normalizedTokens
		.map( normalizeSelectorToken )
		.filter( Boolean ) ) ].join( ', ' );
};

const getSnippetVariables = ( snippet ) => ( snippet.match( /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g ) || [] )
	.map( ( token ) => token.replace( /[{}\s]/g, '' ) );

const validateSnippetSyntax = ( snippet, triggerType = 'click' ) => {
	if ( ! snippet || ! snippet.trim() ) {
		return { status: 'error', message: __( 'Snippet cannot be empty.', 'bimbeau-privacy-analytics' ) };
	}

	const allowedVariables = TRIGGER_ALLOWED_VARIABLES[ triggerType ] || [];
	const usedVariables = getSnippetVariables( snippet );
	const unknownVariable = usedVariables.find( ( variableName ) => ! ALL_ALLOWED_VARIABLES.includes( variableName ) );
	if ( unknownVariable ) {
		return { status: 'error', message: __( `Unknown variable: {{${ unknownVariable }}}. Available variables: {{page_url}}, {{page_title}}, {{href}}, {{element_text}}, {{element_id}}, {{element_classes}}, {{form_id}}.`, 'bimbeau-privacy-analytics' ) };
	}

	const disallowedVariables = Array.from( new Set( usedVariables.filter( ( variableName ) => ! allowedVariables.includes( variableName ) ) ) );
	if ( disallowedVariables.length > 0 ) {
		return { status: 'warning', message: __( `The selected trigger type does not provide: ${ disallowedVariables.map( ( variableName ) => `{{${ variableName }}}` ).join( ', ' ) }. Runtime fallback replaces them with ''.`, 'bimbeau-privacy-analytics' ) };
	}
	const syntaxCheckSamples = {
		page_url: 'https://example.test/page',
		page_title: 'Example page',
		href: 'https://example.test/link',
		element_text: 'Example CTA',
		element_id: 'example-id',
		element_classes: 'btn primary',
		form_id: 'contact-form',
	};
	const snippetForSyntaxCheck = snippet.replace( /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, ( token, variableName ) => {
		if ( Object.prototype.hasOwnProperty.call( syntaxCheckSamples, variableName ) ) {
			return JSON.stringify( syntaxCheckSamples[ variableName ] );
		}
		return token;
	} );
	try {
		new Function( snippetForSyntaxCheck );
		return { status: 'success', message: __( 'Snippet syntax looks valid.', 'bimbeau-privacy-analytics' ) };
	} catch ( syntaxError ) {
		return { status: 'error', message: __( `Syntax error: ${ syntaxError?.message || 'Invalid JavaScript.' }`, 'bimbeau-privacy-analytics' ) };
	}
};

const EventsPanel = ( { mode = 'stats', initialEvents = null, onEventsChange = null, rangeSelection = null } ) => {
 const isPro = Boolean( ADMIN_CONFIG?.settings?.isPro );
 const { data, isLoading, error } = useAdminEndpoint( '/admin/events-config', null, { enabled: isPro } );
 const activeRange = useMemo( () => getRangeFromSelection( rangeSelection ), [ rangeSelection ] );
 const [ statsWarmupRetry, setStatsWarmupRetry ] = useState( 0 );
 const [ pageSearch, setPageSearch ] = useState( '' );
 const { data: eventsPagesData } = useAdminEndpoint( `/admin/events-pages${ pageSearch ? `?search=${ encodeURIComponent( pageSearch ) }` : '' }`, null, { enabled: isPro && mode === 'config' } );
 const [ knownPageLabels, setKnownPageLabels ] = useState( {} );
 const [ events, setEvents ] = useState( () => normalizeEventsConfig( initialEvents ).events );
 const [ invalidKpiSlotWarnings, setInvalidKpiSlotWarnings ] = useState( [] );
 const [ expandedEvents, setExpandedEvents ] = useState( {} );
 const [ expandedActions, setExpandedActions ] = useState( {} );
 const [ syntaxChecks, setSyntaxChecks ] = useState( {} );
 const [ eventPendingRemoval, setEventPendingRemoval ] = useState( null );
 const kpiCollisions = useMemo( () => getActiveKpiSlotCollisions( events ), [ events ] );
 const lastEmittedEventsSnapshot = useRef( '' );
 useEffect( () => {
	if ( Array.isArray( initialEvents ) ) {
		const nextNormalized = normalizeEventsConfig( initialEvents );
		const nextEvents = nextNormalized.events;
		setInvalidKpiSlotWarnings( nextNormalized.invalidKpiSlotWarnings );
		setEvents( ( prev ) => {
			const previousSnapshot = JSON.stringify( normalizeEventsConfig( prev ).events );
			const nextSnapshot = JSON.stringify( nextEvents );
			return previousSnapshot === nextSnapshot ? prev : nextEvents;
		} );
		return;
	}
	if ( isPro && data?.eventsConfig ) {
		const nextNormalized = normalizeEventsConfig( data.eventsConfig );
		setInvalidKpiSlotWarnings( nextNormalized.invalidKpiSlotWarnings );
		setEvents( nextNormalized.events );
	}
 }, [ data, initialEvents, isPro ] );
 useEffect( () => {
	if ( typeof onEventsChange !== 'function' || mode !== 'config' ) {
		return;
	}

	const nextEvents = syncEventsForPersistence( events ).map( ( eventItem ) => ( {
		...eventItem,
		kpi_slot: normalizeKpiSlotForSave(
			eventItem?.kpi_slot,
			DEFAULT_KPI_SLOT_FALLBACK
		),
	} ) );

	const nextSnapshot = JSON.stringify( nextEvents );

	if ( nextSnapshot === lastEmittedEventsSnapshot.current ) {
		return;
	}

	lastEmittedEventsSnapshot.current = nextSnapshot;
	onEventsChange( nextEvents );
 }, [ events, mode, onEventsChange ] );
 useEffect( () => {
	if ( ! Array.isArray( eventsPagesData?.items ) || ! eventsPagesData.items.length ) {
		return;
	}

	setKnownPageLabels( ( previous ) => {
		const next = { ...previous };
		let hasChanges = false;

		eventsPagesData.items.forEach( ( item ) => {
			const rawValue = String( item?.url || '' ).trim();
			const normalizedValue = normalizePageValueKey( rawValue );
			if ( ! rawValue && ! normalizedValue ) {
				return;
			}
			const label = formatPageOptionLabel( item );
			if ( ! label ) {
				return;
			}
			[ rawValue, normalizedValue ].forEach( ( key ) => {
				if ( ! key || next[ key ] === label ) {
					return;
				}
				next[ key ] = label;
				hasChanges = true;
			} );
		} );

		return hasChanges ? next : previous;
	} );
 }, [ eventsPagesData ] );

 const pageOptions = useMemo( () => {
	const optionsByNormalizedValue = new Map();

	( Array.isArray( eventsPagesData?.items ) ? eventsPagesData.items : [] ).forEach( ( item ) => {
		const value = String( item?.url || '' ).trim();
		const normalizedValue = normalizePageValueKey( value );
		if ( ! value && ! normalizedValue ) {
			return;
		}
		const optionKey = normalizedValue || value;
		if ( ! optionKey || optionsByNormalizedValue.has( optionKey ) ) {
			return;
		}
		optionsByNormalizedValue.set( optionKey, {
			label: formatPageOptionLabel( item ),
			value: normalizedValue || value,
		} );
	} );

	events.forEach( ( eventItem ) => {
		const value = String( eventItem?.trigger?.url_pattern || '' ).trim();
		if ( ! value ) {
			return;
		}
		const normalizedValue = normalizePageValueKey( value );
		const optionKey = normalizedValue || value;
		if ( ! optionKey || optionsByNormalizedValue.has( optionKey ) ) {
			return;
		}
		optionsByNormalizedValue.set( optionKey, {
			label: knownPageLabels[ value ] || knownPageLabels[ optionKey ] || value,
			value,
		} );
	} );

	return Array.from( optionsByNormalizedValue.values() );
 }, [ events, eventsPagesData, knownPageLabels ] );

 const moveEvent = ( sourceEventId, targetEventId ) => {
	const sourceId = String( sourceEventId || '' ).trim();
	const targetId = String( targetEventId || '' ).trim();
	if ( ! sourceId || ! targetId || sourceId === targetId ) {
		return;
	}

	setEvents( ( previous ) => {
		const sourceIndex = previous.findIndex( ( eventItem ) => eventItem.id === sourceId );
		const targetIndex = previous.findIndex( ( eventItem ) => eventItem.id === targetId );
		if ( sourceIndex < 0 || targetIndex < 0 ) {
			return previous;
		}

		const next = [ ...previous ];
		const [ movedEvent ] = next.splice( sourceIndex, 1 );
		next.splice( targetIndex, 0, movedEvent );

		return syncEventsForPersistence( next );
	} );
 };

 const updateEvent = ( eventId, updater ) => setEvents( ( prev ) =>
	syncEventsForPersistence(
		prev.map( ( eventItem ) =>
			eventItem.id === eventId ? updater( eventItem ) : eventItem
		)
	)
 );
 const addEvent = () => setEvents( ( prev ) => {
	const timestamp = Date.now();
	const nextEvent = {
		id: `event_${ timestamp }`,
		label: '',
		short_label: '',
		enabled: true,
		order: prev.length + 1,
		trigger: {
			type: 'click',
			selector: '',
			once_per_page: false,
			debounce_ms: 0,
		},
		actions: [
			{
				id: `a${ timestamp }`,
				enabled: true,
				order: 1,
				type: 'tracking_snippet',
				label: '',
				snippet: '',
			},
		],
		kpi_enabled: false,
		kpi_slot: DEFAULT_KPI_SLOT_FALLBACK,
		params: {},
	};

	return syncEventsForPersistence( [ ...prev, nextEvent ] );
 } );
 const eventLabels = useMemo( () => new Map( events.map( ( eventItem ) => [ eventItem.id, ( eventItem.label || '' ).trim() ] ) ), [ events ] );
 const [ statsPerPage, setStatsPerPage ] = useState( 10 );
 const [ statsCurrentPage, setStatsCurrentPage ] = useState( 1 );
 const [ statsSearch, setStatsSearch ] = useState( '' );
 const [ statsEventFilter, setStatsEventFilter ] = useState( '' );
 const [ statsStatusFilter, setStatsStatusFilter ] = useState( '' );
 const [ apiHasPaginatedOccurrences, setApiHasPaginatedOccurrences ] = useState( false );
 const statsRequestParams = useMemo(
	() => ( {
		...activeRange,
		page: statsCurrentPage,
		per_page: statsPerPage,
		event_id: apiHasPaginatedOccurrences ? statsEventFilter || undefined : undefined,
		search: apiHasPaginatedOccurrences ? statsSearch.trim() || undefined : undefined,
		status: apiHasPaginatedOccurrences ? statsStatusFilter || undefined : undefined,
	} ),
	[ activeRange, apiHasPaginatedOccurrences, statsCurrentPage, statsEventFilter, statsPerPage, statsSearch, statsStatusFilter ]
 );
 const { data: statsData, isLoading: isStatsLoading } = useAdminEndpoint( '/admin/events-stats', statsRequestParams, { enabled: isPro, urlOptions: statsWarmupRetry > 0 ? { volatileParams: { _ls_warmup_retry: statsWarmupRetry } } : undefined } );
 const statsRows = useMemo(
	() => Array.isArray( statsData?.series ) ? statsData.series : [],
	[ statsData ]
 );
 useEffect( () => {
	setApiHasPaginatedOccurrences( Number( statsData?.pagination?.total_pages || 0 ) > 0 );
 }, [ statsData ] );
 const [ selectedEventForScriptModal, setSelectedEventForScriptModal ] = useState( null );
 const [ usesMobileEventControls, setUsesMobileEventControls ] = useState( () => {
	if ( typeof window === 'undefined' || typeof window.matchMedia !== 'function' ) {
		return false;
	}
	return window.matchMedia( EVENT_MOBILE_CONTROLS_QUERY ).matches;
 } );
 useEffect( () => {
	if ( typeof window === 'undefined' || typeof window.matchMedia !== 'function' ) {
		return undefined;
	}
	const mediaQueryList = window.matchMedia( EVENT_MOBILE_CONTROLS_QUERY );
	const updateMobileEventControls = () => setUsesMobileEventControls( mediaQueryList.matches );
	updateMobileEventControls();
	if ( typeof mediaQueryList.addEventListener === 'function' ) {
		mediaQueryList.addEventListener( 'change', updateMobileEventControls );
		return () => mediaQueryList.removeEventListener( 'change', updateMobileEventControls );
	}
	if ( typeof mediaQueryList.addListener === 'function' ) {
		mediaQueryList.addListener( updateMobileEventControls );
		return () => mediaQueryList.removeListener( updateMobileEventControls );
	}
	return undefined;
 }, [] );
 const occurrenceRows = useMemo(
	() => apiHasPaginatedOccurrences && Array.isArray( statsData?.occurrences ) ? statsData.occurrences : statsRows,
	[ apiHasPaginatedOccurrences, statsData, statsRows ]
 );
 useEffect( () => {
	if ( ! isPro || isStatsLoading || statsWarmupRetry > 0 ) {
		return;
	}

	const hasOccurrences = Array.isArray( statsData?.occurrences ) && statsData.occurrences.length > 0;
	const hasSeries = Array.isArray( statsData?.series ) && statsData.series.length > 0;
	const totalVolume = Number( statsData?.total_volume || 0 );

	if ( totalVolume === 0 && ! hasOccurrences && ! hasSeries ) {
		return;
	}
 }, [ isPro, isStatsLoading, statsData, statsWarmupRetry ] );

 const expandedStatsRows = useMemo(
	() => buildEventStatsOccurrences( occurrenceRows ),
	[ occurrenceRows ]
 );
 const statsEventOptions = useMemo( () => {
	const labelsById = new Map();
	expandedStatsRows.forEach( ( row ) => {
		const eventId = row?.event_id || '';
		if ( ! eventId || labelsById.has( eventId ) ) {
			return;
		}
		const eventLabel = ( row?.event_label || '' ).trim() || eventLabels.get( eventId ) || eventId;
		labelsById.set( eventId, eventLabel );
	} );

	return [
		{ label: __( 'All events', 'bimbeau-privacy-analytics' ), value: '' },
		...Array.from( labelsById.entries() )
			.sort( ( [ , labelA ], [ , labelB ] ) => String( labelA ).localeCompare( String( labelB ) ) )
			.map( ( [ eventId, eventLabel ] ) => ( {
				label: eventLabel,
				value: eventId,
			} ) ),
	];
 }, [ eventLabels, expandedStatsRows ] );
 const getEventCountryCode = ( row ) => {
	const countryCodeValue = String( row?.country_code || row?.countryCode || '' ).trim();
	if ( countryCodeValue && /^[A-Za-z]{2}$/.test( countryCodeValue ) ) {
		return countryCodeValue.toUpperCase();
	}

	const countryFlag = String( row?.country_flag || '' ).trim();
	if ( countryFlag ) {
		if ( /^[A-Za-z]{2}$/.test( countryFlag ) ) {
			return countryFlag.toUpperCase();
		}

		const regionalIndicators = Array.from( countryFlag ).filter( ( symbol ) => /[\u{1F1E6}-\u{1F1FF}]/u.test( symbol ) );
		if ( regionalIndicators.length >= 2 ) {
			const asciiCode = regionalIndicators.slice( 0, 2 ).map( ( symbol ) => String.fromCharCode( symbol.codePointAt( 0 ) - 0x1F1E6 + 65 ) ).join( '' );
			if ( /^[A-Z]{2}$/.test( asciiCode ) ) {
				return asciiCode;
			}
		}
	}

	const countryCode = resolveCountryCode( row?.country );
	if ( countryCode ) {
		return countryCode;
	}

	return '';
 };

 const getEventLocationLabel = ( row ) => {
	const countryCode = getEventCountryCode( row );
	const countryLabel = String( row?.country || '' ).trim() || ( countryCode ? getCountryLabel( countryCode ) : NO_AVAILABLE_LABEL );
	return row?.location_label
		|| [ row?.city, countryLabel !== NO_AVAILABLE_LABEL ? countryLabel : '' ]
			.filter( ( value ) => typeof value === 'string' && value.trim() !== '' )
			.join( ', ' )
		|| NO_AVAILABLE_LABEL;
 };

 const filteredStatsRows = useMemo( () => {
	const normalizedSearch = statsSearch.trim().toLowerCase();

	return expandedStatsRows.filter( ( row ) => {
		if ( ! apiHasPaginatedOccurrences && statsEventFilter && row?.event_id !== statsEventFilter ) {
			return false;
		}
		if ( ! apiHasPaginatedOccurrences && statsStatusFilter && String( row?.execution_status || row?.status || '' ) !== statsStatusFilter ) {
			return false;
		}

		if ( ! normalizedSearch ) {
			return true;
		}
		const eventLabel = ( row?.event_label || '' ).trim() || eventLabels.get( row?.event_id ) || row?.event_id || '';
		const triggerPage = row?.page_path || '';
		const triggerType = row?.trigger_type || '';
		const locationLabel = getEventLocationLabel( row );
		const operatingSystem = getEventStatsField( row, [ 'operating_system', 'operatingSystem', 'os' ] );
		const browser = getEventStatsField( row, [ 'browser', 'browser_name', 'browserName' ] );
		const deviceClass = getEventStatsField( row, [ 'device_class', 'deviceClass', 'device' ] );
		return [ eventLabel, triggerPage, triggerType, locationLabel, operatingSystem, browser, deviceClass ].some( ( candidate ) =>
			String( candidate ).toLowerCase().includes( normalizedSearch )
		);
	} );
 }, [ apiHasPaginatedOccurrences, eventLabels, expandedStatsRows, statsEventFilter, statsStatusFilter, statsSearch ] );
 const statsTotalPages = useMemo( () => {
	const apiTotalPages = Number( statsData?.pagination?.total_pages || 0 );
	if ( apiTotalPages > 0 ) {
		return apiTotalPages;
	}
	return Math.max( 1, Math.ceil( filteredStatsRows.length / statsPerPage ) );
 }, [ filteredStatsRows.length, statsData, statsPerPage ] );
 useEffect( () => {
	setStatsCurrentPage( 1 );
 }, [ statsEventFilter, statsPerPage, statsSearch, statsStatusFilter ] );
 useEffect( () => {
	setStatsCurrentPage( ( currentPage ) => Math.min( currentPage, statsTotalPages ) );
 }, [ statsTotalPages ] );
 const sortedStatsRows = useMemo(
	() => [ ...filteredStatsRows ].sort( ( rowA, rowB ) => {
		const timestampDifference = getEventOccurrenceTimestamp( rowB ) - getEventOccurrenceTimestamp( rowA );
		if ( timestampDifference !== 0 ) {
			return timestampDifference;
		}

		const eventLabelA = ( rowA?.event_label || '' ).trim() || rowA?.event_id || '';
		const eventLabelB = ( rowB?.event_label || '' ).trim() || rowB?.event_id || '';
		return String( eventLabelA ).localeCompare( String( eventLabelB ) );
	} ),
	[ filteredStatsRows ]
 );
 const visibleStatsRows = useMemo( () => {
	if ( apiHasPaginatedOccurrences ) {
		return sortedStatsRows;
	}
	const startIndex = ( statsCurrentPage - 1 ) * statsPerPage;
	return sortedStatsRows.slice( startIndex, startIndex + statsPerPage );
 }, [ apiHasPaginatedOccurrences, sortedStatsRows, statsCurrentPage, statsPerPage ] );
 const kpiSlots = useMemo( () => {
	const collisionsBySlot = new Map( kpiCollisions.map( ( collision ) => [ collision.slot, collision.ids ] ) );
	const slots = new Map();
	events.forEach( ( eventItem ) => {
		if ( ! eventItem?.kpi_enabled || eventItem?.enabled === false ) {
			return;
		}
		const slot = parseKpiSlotValue( eventItem?.kpi_slot );
		if ( ! Number.isInteger( slot ) || slot < MIN_KPI_SLOT || collisionsBySlot.has( slot ) ) {
			return;
		}
		slots.set( slot, eventItem );
 } );
 return slots;
 }, [ events, kpiCollisions ] );
 const activeKpiEvents = useMemo( () =>
	Array.from( new Set( [
		...Array.from( { length: 4 }, ( _, index ) => MIN_KPI_SLOT + index ),
		...Array.from( kpiSlots.keys() ),
	] ) )
		.sort( ( left, right ) => left - right )
		.map( ( slot ) => {
			const eventItem = kpiSlots.get( slot ) || null;
			if ( ! eventItem ) {
				return null;
			}
			return { slot, eventItem };
		} )
		.filter( Boolean ),
 [ kpiSlots ] );
 const eventVolumeById = useMemo( () => {
	const volumes = new Map();
	statsRows.forEach( ( row ) => {
		const eventId = String( row?.event_id || '' ).trim();
		if ( ! eventId ) {
			return;
		}
		const count = Number( row?.count || 0 );
		volumes.set( eventId, ( volumes.get( eventId ) || 0 ) + count );
	} );
	return volumes;
 }, [ statsRows ] );
 const displayedEventVolumeById = eventVolumeById;
 const displayedTotalVolume = Array.from( displayedEventVolumeById.values() ).reduce( ( total, value ) => total + Number( value || 0 ), 0 );
 if ( isPro && ( isLoading || error ) ) return <DataState isLoading={ isLoading } error={ error } loadingLabel={ __( 'Loading events configuration…', 'bimbeau-privacy-analytics' ) } />;
 const showConfiguration = mode === 'config'; const showStats = mode === 'stats';
 return <div className="bbpa-events-panel">{ showConfiguration && ! isPro ? <Notice status="warning" isDismissible={ false }><p><ProBadgeText text={ __( 'Events configuration is locked in the Free tier. Upgrade to Pro to save and run actions.', 'bimbeau-privacy-analytics' ) } /></p></Notice> : null }
 { showConfiguration && invalidKpiSlotWarnings.length ? <Notice status="warning" isDismissible={ false }>{ __( 'Some saved KPI slot values are invalid. Use only numeric slots greater than or equal to 2.', 'bimbeau-privacy-analytics' ) }</Notice> : null }
 { showConfiguration && kpiCollisions.length ? <Notice status="error" isDismissible={ false }><p>{ __( 'KPI slot conflicts detected. Each active KPI slot must be unique before saving.', 'bimbeau-privacy-analytics' ) }</p><ul>{ kpiCollisions.map( ( collision ) => <li key={ `kpi-collision-${ collision.slot }` }>{ `Slot ${ collision.slot }: ${ collision.ids.join( ', ' ) }` }</li> ) }</ul></Notice> : null }
 { showConfiguration ? events.map( ( eventItem ) => <Card key={ eventItem.id } style={ { marginBottom:'12px' } } onDragOver={ ( event ) => event.preventDefault() } onDrop={ ( event ) => { event.preventDefault(); event.stopPropagation(); const sourceEventId = event.dataTransfer?.getData( EVENT_DRAG_DATA_TYPE ) || ''; moveEvent( sourceEventId, eventItem.id ); } }><CardHeader><Flex className="bbpa-events-panel__event-header-layout" justify="space-between" align="center"><FlexItem style={ { flex: 1 } }><div className="bbpa-events-panel__event-header" data-testid={ `event-header-${ eventItem.id }` } role="button" tabIndex={0} style={ { width: '100%' } } onClick={ ()=> setExpandedEvents((p)=>({...p,[eventItem.id]:!p[eventItem.id]})) }><Flex justify="flex-start" align="center" gap={ 2 }><button type="button" className="bbpa-events-panel__drag-handle" draggable={ isPro } onDragStart={ ( event ) => { event.stopPropagation(); if ( ! isPro ) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData( EVENT_DRAG_DATA_TYPE, eventItem.id ); } } onDragEnd={ ( event ) => event.stopPropagation() } onClick={ ( event ) => event.stopPropagation() } aria-label={ __( 'Reorder KPI event', 'bimbeau-privacy-analytics' ) }><LuGripVertical size={ 16 } aria-hidden="true" /></button><span style={ { display: 'flex', alignItems: 'center' } }>{ expandedEvents[ eventItem.id ] ? <LuChevronDown /> : <LuChevronRight /> }</span><strong>{ ( eventItem.label || '' ).trim() || eventItem.id }</strong></Flex></div></FlexItem><FlexItem className="bbpa-events-panel__header-toggle-item"><ToggleControl className="bbpa-events-panel__header-toggle" label={ __( 'Include in KPI', 'bimbeau-privacy-analytics' ) } checked={ !! eventItem.kpi_enabled } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => value ? { ...current, kpi_enabled: true, kpi_slot: getDefaultKpiSlotForEvent( events, current.id ) } : { ...current, kpi_enabled: false } ) } disabled={ ! isPro } onClick={ ( event ) => event.stopPropagation() } onMouseDown={ ( event ) => event.stopPropagation() } onKeyDown={ ( event ) => event.stopPropagation() } /></FlexItem><FlexItem className="bbpa-events-panel__header-toggle-item"><ToggleControl className="bbpa-events-panel__header-toggle" label={ __( 'Enable event', 'bimbeau-privacy-analytics' ) } checked={ eventItem.enabled !== false } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, enabled: value } ) ) } disabled={ ! isPro } onClick={ ( event ) => event.stopPropagation() } onMouseDown={ ( event ) => event.stopPropagation() } onKeyDown={ ( event ) => event.stopPropagation() } /></FlexItem></Flex></CardHeader>
 { expandedEvents[ eventItem.id ] ? <CardBody>{ usesMobileEventControls ? <div className="bbpa-events-panel__mobile-toggle-row"><ToggleControl className="bbpa-events-panel__header-toggle" label={ __( 'Include in KPI', 'bimbeau-privacy-analytics' ) } checked={ !! eventItem.kpi_enabled } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => value ? { ...current, kpi_enabled: true, kpi_slot: getDefaultKpiSlotForEvent( events, current.id ) } : { ...current, kpi_enabled: false } ) } disabled={ ! isPro } /><ToggleControl className="bbpa-events-panel__header-toggle" label={ __( 'Enable event', 'bimbeau-privacy-analytics' ) } checked={ eventItem.enabled !== false } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, enabled: value } ) ) } disabled={ ! isPro } /></div> : null }<div className="bbpa-events-panel__event-row"><TextControl label={ __( 'Event ID', 'bimbeau-privacy-analytics' ) } value={ eventItem.id || '' } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, id: value.replace( /[^a-zA-Z0-9_-]/g, '_' ) } ) ) } disabled={ ! isPro } __next40pxDefaultSize /><TextControl label={ __( 'Label (max 25 characters)', 'bimbeau-privacy-analytics' ) } value={ eventItem.label || '' } maxLength={ 25 } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, label: ( value || '' ).slice( 0, 25 ) } ) ) } disabled={ ! isPro } __next40pxDefaultSize /></div>
 <SelectControl label={ __( 'Trigger type', 'bimbeau-privacy-analytics' ) } value={ eventItem.trigger?.type || 'click' } options={ [ { label: __( 'Click', 'bimbeau-privacy-analytics' ), value: 'click' }, { label: __( 'Page view', 'bimbeau-privacy-analytics' ), value: 'page_view' } ] } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, trigger: { ...current.trigger, type: value } } ) ) } disabled={ ! isPro } __next40pxDefaultSize />
 { ( eventItem.trigger?.type || 'click' ) === 'click' ? <FormTokenField label={ __( 'CSS selectors', 'bimbeau-privacy-analytics' ) } value={ parseSelectorTokens( eventItem.trigger?.selector ) } onChange={ ( tokens ) => updateEvent( eventItem.id, ( current ) => ( { ...current, trigger: { ...current.trigger, selector: formatSelectorTokens( tokens ) } } ) ) } help={ __( 'Add one or more CSS selectors as tags to target clickable elements, for example .cta-button or #signup.', 'bimbeau-privacy-analytics' ) } disabled={ ! isPro } __experimentalExpandOnFocus /> : null }
 { ( eventItem.trigger?.type || 'click' ) === 'page_view' ? <ComboboxControl label={ __( 'Target page', 'bimbeau-privacy-analytics' ) } value={ eventItem.trigger?.url_pattern || '' } options={ pageOptions } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, trigger: { ...current.trigger, url_pattern: normalizePageValueKey( value ) || '' } } ) ) } onFilterValueChange={ ( value ) => setPageSearch( value || '' ) } help={ __( 'Search by title across published posts, pages, and public custom post types.', 'bimbeau-privacy-analytics' ) } disabled={ ! isPro } __next40pxDefaultSize /> : null }
 { ( eventItem.trigger?.type || 'click' ) === 'webhook' ? <>
 <Notice status="info" isDismissible={ false }>{ __( 'Webhook triggers are server-side. Browser JavaScript snippets are not executed for this trigger.', 'bimbeau-privacy-analytics' ) }</Notice>
 <TextControl label={ __( 'Webhook URL', 'bimbeau-privacy-analytics' ) } value={ buildWebhookUrl( eventItem.trigger?.webhook_token ) } readOnly />
 <Flex gap={ 2 }>
 <Button variant="secondary" onClick={ () => { const webhookUrl = buildWebhookUrl( eventItem.trigger?.webhook_token ); if ( webhookUrl && typeof globalThis.navigator?.clipboard?.writeText === 'function' ) { globalThis.navigator.clipboard.writeText( webhookUrl ); } } } disabled={ ! eventItem.trigger?.webhook_token }>{ __( 'Copy URL', 'bimbeau-privacy-analytics' ) }</Button>
 <Button variant="secondary" onClick={ () => updateEvent( eventItem.id, ( current ) => ( { ...current, trigger: { ...current.trigger, webhook_token: generateWebhookToken() } } ) ) } disabled={ ! isPro }>{ eventItem.trigger?.webhook_token ? __( 'Regenerate token', 'bimbeau-privacy-analytics' ) : __( 'Generate token', 'bimbeau-privacy-analytics' ) }</Button>
 </Flex>
 <TextControl label={ __( 'Allowed webhook params', 'bimbeau-privacy-analytics' ) } value={ ( eventItem.params?.allowed_webhook_params || [] ).join( ', ' ) } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, params: { ...( current.params || {} ), allowed_webhook_params: String( value || '' ).split(',').map( ( item ) => item.trim() ).filter( Boolean ) } } ) ) } help={ __( 'Comma-separated allowlist for incoming webhook payload keys. Only allowlisted variables are stored and shown in event context.', 'bimbeau-privacy-analytics' ) } disabled={ ! isPro } __next40pxDefaultSize />
 </> : null }
 { [ 'click', 'page_view' ].includes( eventItem.trigger?.type || 'click' ) ? <div className="bbpa-events-panel__actions-list">{eventItem.actions.map((action)=>{ const actionKey=`${ eventItem.id }:${ action.id }`; return <div key={action.id} className="bbpa-events-panel__action-card"><div className="bbpa-events-panel__action-header" role="button" tabIndex={0} onClick={ ( event ) => { if ( event.target.closest('.bbpa-events-panel__header-toggle') ) { return; } setExpandedActions( ( p ) => ( { ...p, [ actionKey ]: ! p[ actionKey ] } ) ); } }><Flex justify="space-between" align="center"><FlexItem><Flex align="center" gap={ 2 }><span style={ { display: 'flex', alignItems: 'center' } }>{ expandedActions[actionKey] ? <LuChevronDown /> : <LuChevronRight /> }</span><strong>{__('Action','bimbeau-privacy-analytics')}</strong></Flex></FlexItem></Flex></div>
 {expandedActions[actionKey] ? <div className="bbpa-events-panel__action-body">
 <>
 <TextareaControl label={ ( eventItem.trigger?.type || 'click' ) === 'webhook' ? __( 'Server action template', 'bimbeau-privacy-analytics' ) : __( 'JavaScript snippet', 'bimbeau-privacy-analytics' ) } value={ action.snippet || '' } rows={ 8 } placeholder={ SNIPPET_PLACEHOLDER } onChange={ ( value ) => updateEvent( eventItem.id, ( current ) => ( { ...current, actions: current.actions.map( ( row ) => row.id === action.id ? { ...row, snippet: value } : row ) } ) ) } disabled={ ! isPro } help={ ( eventItem.trigger?.type || 'click' ) === 'webhook' ? __( 'Configure a server-side action payload template for incoming webhook events. Browser JavaScript APIs are not available for this trigger.', 'bimbeau-privacy-analytics' ) : __( 'Paste JavaScript code (without <script> tags) to run when this event is triggered. Available placeholders depend on trigger type. Do not wrap placeholders such as {{page_url}} in quotes. They are injected as escaped JavaScript values.', 'bimbeau-privacy-analytics' ) } />
 <Notice status="info" isDismissible={ false }><p>{ __( 'Available variables for this trigger type:', 'bimbeau-privacy-analytics' ) }</p><p>{ ( TRIGGER_ALLOWED_VARIABLES[ eventItem.trigger?.type || 'click' ] || [] ).map( ( variableName, index, values ) => <span key={ variableName }><code>{ '{' }{ '{' }{ variableName }{ '}' }{ '}' }</code>{ index < values.length - 1 ? ', ' : '' }</span> ) }</p></Notice>
 { ( eventItem.trigger?.type || 'click' ) !== 'webhook' ? <div style={ { marginTop: '12px' } }><Button variant="secondary" onClick={ ()=> setSyntaxChecks((prev)=>({ ...prev, [actionKey]: validateSnippetSyntax(action.snippet||'', eventItem.trigger?.type || 'click') })) } disabled={ ! isPro }>{ __( 'Check syntax', 'bimbeau-privacy-analytics' ) }</Button></div> : <Notice status="info" isDismissible={ false }>{ __( 'Syntax checks are available for browser JavaScript snippets only.', 'bimbeau-privacy-analytics' ) }</Notice> }
 </>
 { syntaxChecks[actionKey] ? <Notice status={ syntaxChecks[actionKey].status } isDismissible={ false }>{ syntaxChecks[actionKey].message }</Notice> : null }
 </div>:null}</div>;})}</div> : null }
 <div className="bbpa-events-panel__event-actions"><Button variant="tertiary" onClick={ ()=>setEventPendingRemoval(eventItem.id) } disabled={ ! isPro }>{ __( 'Remove event', 'bimbeau-privacy-analytics' ) }</Button></div></CardBody> : null }</Card>) : null }
 { showConfiguration ? <Flex><Button variant="secondary" onClick={ addEvent } disabled={ ! isPro }>{ __( 'Add event', 'bimbeau-privacy-analytics' ) }</Button></Flex> : null }
 { showStats && isPro ? <Card><CardHeader><Flex justify="space-between" align="center"><FlexItem><span className="bbpa-report-table__metric-header"><strong>{ __( 'Triggered events', 'bimbeau-privacy-analytics' ) }</strong><Tooltip text={ __( 'Triggered events captured by the advanced tracker are listed.', 'bimbeau-privacy-analytics' ) }><span className="dashicons dashicons-editor-help" aria-label={ __( 'Triggered events captured by the advanced tracker are listed.', 'bimbeau-privacy-analytics' ) } /></Tooltip></span></FlexItem><FlexItem><ReportExportAction report="events" params={ { ...activeRange, event_id: statsEventFilter || undefined, search: statsSearch.trim() || undefined, status: statsStatusFilter || undefined } } totalItems={ Number( apiHasPaginatedOccurrences ? statsData?.pagination?.total_items || 0 : filteredStatsRows.length ) } /></FlexItem></Flex></CardHeader><CardBody><div className="bbpa-events-panel__stats-kpi-grid"><Card className="bbpa-events-panel__stats-kpi"><CardBody className="bbpa-kpi-card__body"><div className="bbpa-kpi-card__content"><p className="bbpa-kpi-card__label">{ __( 'Total events', 'bimbeau-privacy-analytics' ) }</p><p className="bbpa-kpi-card__value-row"><span className="bbpa-kpi-card__value">{ displayedTotalVolume }</span></p></div><LuZap size={ 24 } className="bbpa-kpi-card__icon" aria-hidden="true" /></CardBody></Card>{ activeKpiEvents.map( ( { slot, eventItem } ) => { const eventId = eventItem?.id || ''; const value = Number( displayedEventVolumeById.get( eventId ) || 0 ); const label = ( eventItem?.label || '' ).trim() || eventId; const triggerType = eventItem?.trigger?.type || 'click'; return <Card key={ `kpi-slot-${ slot }` } className="bbpa-events-panel__stats-kpi"><CardBody className="bbpa-kpi-card__body"><div className="bbpa-kpi-card__content"><p className="bbpa-kpi-card__label">{ label }</p><p className="bbpa-kpi-card__value-row"><span className="bbpa-kpi-card__value">{ value }</span></p></div><EventKpiIcon triggerType={ triggerType } /></CardBody></Card>; } ) }</div><div className="bbpa-table-controls"><div className="bbpa-table-controls__group"><SelectControl className="bbpa-table-controls__rows-control" label={ __( 'Rows', 'bimbeau-privacy-analytics' ) } value={ String( statsPerPage ) } options={ [ { label: '5', value: '5' }, { label: '10', value: '10' }, { label: '20', value: '20' } ] } onChange={ ( value ) => { setStatsPerPage( Number( value ) ); setStatsCurrentPage( 1 ); } } __next40pxDefaultSize __nextHasNoMarginBottom /></div><div className="bbpa-table-controls__group"><SelectControl label={ __( 'Event', 'bimbeau-privacy-analytics' ) } value={ statsEventFilter } options={ statsEventOptions } onChange={ ( value ) => { setStatsEventFilter( value ); setStatsCurrentPage( 1 ); } } __next40pxDefaultSize __nextHasNoMarginBottom /></div><div className="bbpa-table-controls__search"><TextControl label={ __( 'Search', 'bimbeau-privacy-analytics' ) } value={ statsSearch } onChange={ ( value ) => { setStatsSearch( value ); setStatsCurrentPage( 1 ); } } placeholder={ __( 'Search…', 'bimbeau-privacy-analytics' ) } __next40pxDefaultSize __nextHasNoMarginBottom /></div></div><div className="bbpa-table-scroll"><table className="widefat striped bbpa-report-table bbpa-report-table--visitors"><thead><tr><th>{ __( 'Label', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Event time', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Type', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Triggered page', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Channel', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Country', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'City', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Operating system', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Browser', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Device', 'bimbeau-privacy-analytics' ) }</th><th>{ __( 'Details', 'bimbeau-privacy-analytics' ) }</th></tr></thead><tbody>{ visibleStatsRows.length ? visibleStatsRows.map( ( row, index ) => { const eventLabel = ( row.event_label || '' ).trim() || eventLabels.get( row.event_id ) || row.event_id; const triggerPage = row.page_path || __( 'All pages', 'bimbeau-privacy-analytics' ); const countryCode = getEventCountryCode( row ); const countryLabel = String( row.country || '' ).trim() || ( countryCode ? getCountryLabel( countryCode ) : NO_AVAILABLE_LABEL ); const locationLabel = getEventLocationLabel( row ); const countryFlag = row.country_flag || ''; const flagAndCountryLabel = [ countryFlag, countryLabel ].filter( ( value ) => typeof value === 'string' && value.trim() !== '' ).join( ' ' ) || __( 'No available', 'bimbeau-privacy-analytics' ); const cityLabel = row.city || NO_AVAILABLE_LABEL; const channelLabel = row.source_category ? getChannelLabel( row.source_category ) : NO_AVAILABLE_LABEL; const operatingSystemLabel = getEventStatsField( row, [ 'operating_system', 'operatingSystem', 'os' ] ) || NO_AVAILABLE_LABEL; const browserLabel = getEventStatsField( row, [ 'browser', 'browser_name', 'browserName' ] ) || NO_AVAILABLE_LABEL; const deviceLabel = formatDeviceClassLabel( getEventStatsField( row, [ 'device_class', 'deviceClass', 'device' ] ) ); const occurrenceLabel = row.occurrence_date
				? formatEventOccurrenceDateTime( row.occurrence_date )
				: formatEventDay( row.occurrence_day ); const flagClass = getCountryFlagClass( countryCode ); const hasCountryFlag = countryCode !== '' && flagClass; const countryFlagStyle = hasCountryFlag ? getCountryFlagInlineStyle( countryCode ) : undefined; const countryFlagValue = String( countryFlag || '' ).trim(); const countryEmojiFallback = /[\u{1F1E6}-\u{1F1FF}]/u.test( countryFlagValue ) ? countryFlagValue : ''; return <tr key={ `${ row.event_id }-${ row.trigger_type }-${ row.status }-${ row.page_path || 'all-pages' }-${ row.occurrence_index || index }` }><td>{ eventLabel || row.event_id }</td><td>{ occurrenceLabel }</td><td>{ row.trigger_type || '—' }</td><td>{ triggerPage || '—' }</td><td>{ renderMaybeUnavailableLabel( channelLabel ) }</td><td title={ locationLabel }><span className="bbpa-country-label">{ hasCountryFlag ? <span className={ `bbpa-country-flag ${ flagClass }` } style={ countryFlagStyle } role="img" aria-label={ countryLabel } title={ countryLabel } /> : <span className="bbpa-country-flag bbpa-country-flag--unknown" role="img" aria-label={ __( 'Unknown country', 'bimbeau-privacy-analytics' ) } title={ __( 'Unknown country', 'bimbeau-privacy-analytics' ) } /> }{ ! hasCountryFlag && countryEmojiFallback ? <span className="bbpa-country-flag-fallback" aria-hidden="true">{ countryEmojiFallback }</span> : null }<span>{ renderMaybeUnavailableLabel( countryLabel ) }</span></span></td><td>{ renderMaybeUnavailableLabel( cityLabel ) }</td><td><span className="bbpa-brand-label"><BrandIcon kind="os" value={ operatingSystemLabel } className="bbpa-brand-icon" /><span>{ renderMaybeUnavailableLabel( operatingSystemLabel ) }</span></span></td><td><span className="bbpa-brand-label"><BrandIcon kind="browser" value={ browserLabel } className="bbpa-brand-icon" /><span>{ renderMaybeUnavailableLabel( browserLabel ) }</span></span></td><td><span className="bbpa-brand-label"><BrandIcon kind="device" value={ deviceLabel } className="bbpa-brand-icon" /><span>{ renderMaybeUnavailableLabel( deviceLabel ) }</span></span></td><td>{ isViewActionEligible( row.trigger_type ) ? <Button variant="secondary" size="small" data-testid={ `event-view-action-${ String( row.trigger_type || '' ).trim().toLowerCase() || 'unknown' }` } onClick={ () => setSelectedEventForScriptModal( row ) }>{ __( 'View', 'bimbeau-privacy-analytics' ) }</Button> : '—' }</td></tr>; } ) : <tr><td colSpan={ 11 }>{ __( 'No triggered events found.', 'bimbeau-privacy-analytics' ) }</td></tr> }</tbody></table></div><Flex justify="space-between" align="center" className="bbpa-table-pagination"><FlexItem><Flex gap={ 2 }><Button variant="secondary" onClick={ () => setStatsCurrentPage( ( currentPage ) => Math.max( 1, currentPage - 1 ) ) } disabled={ statsCurrentPage <= 1 }>{ __( 'Previous page', 'bimbeau-privacy-analytics' ) }</Button><Button variant="secondary" onClick={ () => setStatsCurrentPage( ( currentPage ) => Math.min( statsTotalPages, currentPage + 1 ) ) } disabled={ statsCurrentPage >= statsTotalPages }>{ __( 'Next page', 'bimbeau-privacy-analytics' ) }</Button></Flex></FlexItem><FlexItem className="bbpa-table-pagination__meta">{ `${ __( 'Page', 'bimbeau-privacy-analytics' ) } ${ statsCurrentPage } / ${ statsTotalPages }` }</FlexItem><FlexItem className="bbpa-table-pagination__meta">{ `${ Number( apiHasPaginatedOccurrences ? statsData?.pagination?.total_items || 0 : filteredStatsRows.length ) } ${ __( 'results', 'bimbeau-privacy-analytics' ) }` }</FlexItem></Flex></CardBody></Card> : null }
 { selectedEventForScriptModal ? <EventScriptModal selectedEvent={ selectedEventForScriptModal } onClose={ () => setSelectedEventForScriptModal( null ) } /> : null }
 { eventPendingRemoval ? <Modal title={ __( 'Confirm event removal', 'bimbeau-privacy-analytics' ) } onRequestClose={ () => setEventPendingRemoval( null ) }><p>{ __( 'Do you want to remove this event?', 'bimbeau-privacy-analytics' ) }</p><Flex justify="flex-end" gap={ 2 }><Button variant="tertiary" onClick={ () => setEventPendingRemoval( null ) }>{ __( 'Cancel', 'bimbeau-privacy-analytics' ) }</Button><Button variant="primary" onClick={ () => { setEvents( ( prev ) => prev.filter( ( row ) => row.id !== eventPendingRemoval ) ); setEventPendingRemoval( null ); } }>{ __( 'Remove event', 'bimbeau-privacy-analytics' ) }</Button></Flex></Modal> : null }
 </div>;
};

export { normalizeEventsConfig, getActiveKpiSlotCollisions };

export default EventsPanel;
