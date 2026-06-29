const TEMPLATE_FIELDS = {
	page_view: [ 'page_url', 'page_title' ],
	click: [ 'page_url', 'page_title', 'href', 'element_text', 'element_id', 'element_classes' ],
	webhook: [ 'form_id', 'source', 'lead_type', 'submission_id', 'webhook_request_id', 'idempotency_key' ],
};

const normalizeToString = ( value ) => {
	if ( value === null || value === undefined ) {
		return '';
	}

	if ( Array.isArray( value ) ) {
		return value
			.map( ( item ) => normalizeToString( item ) )
			.filter( ( item ) => item !== '' )
			.join( ' ' )
			.trim();
	}

	return String( value ).trim();
};

const resolvePreviewValue = ( value ) => {
	if ( value === '' ) {
		return "''";
	}

	return value;
};

const parseSerializedContext = ( rawValue ) => {
	if ( typeof rawValue !== 'string' ) {
		return null;
	}

	const trimmedValue = rawValue.trim();
	if ( ! trimmedValue ) {
		return null;
	}

	try {
		const parsedValue = JSON.parse( trimmedValue );
		return parsedValue && typeof parsedValue === 'object' ? parsedValue : null;
	} catch ( error ) {
		return null;
	}
};

const getEventContextCandidates = ( event ) => {
	const directContext = event?.context && typeof event.context === 'object' ? event.context : null;
	const eventContext = event?.event_context && typeof event.event_context === 'object' ? event.event_context : null;
	const serializedContext = parseSerializedContext( event?.context_json || event?.event_context_json || event?.context );

	return [
		{ value: directContext, source: 'context' },
		{ value: eventContext, source: 'event_context' },
		{ value: serializedContext, source: 'serialized_context' },
		{ value: event, source: 'event' },
	].filter( ( candidate ) => Boolean( candidate.value ) );
};

const resolveFieldValue = ( event, fieldName ) => {
	const aliasesByField = {
		page_url: [ 'page_url', 'pageUrl', 'page_location', 'url' ],
		page_title: [ 'page_title', 'pageTitle', 'title', 'document_title' ],
		href: [ 'href', 'link_href', 'linkHref' ],
		element_text: [ 'element_text', 'elementText', 'text' ],
		element_id: [ 'element_id', 'elementId', 'id' ],
		element_classes: [ 'element_classes', 'elementClasses', 'classes', 'className' ],
		form_id: [ 'form_id', 'formId' ],
		source: [ 'source' ],
		lead_type: [ 'lead_type', 'leadType' ],
		submission_id: [ 'submission_id', 'submissionId' ],
		webhook_request_id: [ 'webhook_request_id', 'webhookRequestId', 'request_id' ],
		idempotency_key: [ 'idempotency_key', 'idempotencyKey' ],
	};

	const aliases = aliasesByField[ fieldName ] || [ fieldName ];
	const candidates = getEventContextCandidates( event );

	for ( const candidate of candidates ) {
		for ( const alias of aliases ) {
			if ( fieldName === 'element_id' && alias === 'id' && candidate.source === 'event' ) {
				continue;
			}

			const normalizedValue = normalizeToString( candidate.value?.[ alias ] );
			if ( normalizedValue !== '' ) {
				return normalizedValue;
			}
		}
	}

	return '';
};

const buildResolvedVariables = ( event, fields ) =>
	fields.reduce( ( resolved, fieldName ) => {
		resolved[ fieldName ] = resolvePreviewValue( resolveFieldValue( event, fieldName ) );
		return resolved;
	}, {} );

const resolveWebhookTemplate = ( event ) => {
	const allowlistedParams = Array.isArray( event?.allowed_webhook_params )
		? event.allowed_webhook_params
		: Array.isArray( event?.params?.allowed_webhook_params )
			? event.params.allowed_webhook_params
			: null;
	const normalizedAllowlist = allowlistedParams
		? allowlistedParams.map( ( fieldName ) => normalizeToString( fieldName ) ).filter( Boolean )
		: [];
	const knownWebhookFields = TEMPLATE_FIELDS.webhook;
	const template = normalizedAllowlist.length
		? knownWebhookFields.filter( ( fieldName ) => normalizedAllowlist.includes( fieldName ) )
		: knownWebhookFields;

	return {
		template,
		resolvedVariables: buildResolvedVariables( event, template ),
	};
};

const resolveByType = {
	page_view: ( event ) => {
		const template = TEMPLATE_FIELDS.page_view;
		return {
			template,
			resolvedVariables: buildResolvedVariables( event, template ),
		};
	},
	click: ( event ) => {
		const template = TEMPLATE_FIELDS.click;
		return {
			template,
			resolvedVariables: buildResolvedVariables( event, template ),
		};
	},
	webhook: resolveWebhookTemplate,
};

export const resolveEventScript = ( event ) => {
	const eventType = normalizeToString( event?.trigger_type ).toLowerCase();
	const resolver = resolveByType[ eventType ];

	if ( ! resolver ) {
		return {
			eventType,
			template: [],
			resolvedVariables: {},
			previewText: '',
			unsupported: true,
		};
	}

	const { template, resolvedVariables } = resolver( event );
	const previewText = template
		.map( ( fieldName ) => `${ fieldName }: ${ resolvedVariables[ fieldName ] }` )
		.join( '\n' );

	return {
		eventType,
		template,
		resolvedVariables,
		previewText,
		unsupported: false,
	};
};
