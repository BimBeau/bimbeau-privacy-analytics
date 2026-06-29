const normalizeHandlerName = (value) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	const normalized = value.trim().toLowerCase().replace( /[^a-z0-9_]/g, '_' );
	return normalized.replace( /_+/g, '_' ).replace( /^_+|_+$/g, '' );
};

const resolveCustomCallback = (callbackName, callbackRegistry = {}) => {
	const safeName = normalizeHandlerName( callbackName );
	if ( ! safeName || typeof callbackRegistry !== 'object' || callbackRegistry === null ) {
		return null;
	}

	const candidate = callbackRegistry?.[ safeName ];
	return typeof candidate === 'function' ? candidate : null;
};

const sendWebhookEvent = async (webhookUrl, payload, fetchImpl = globalThis?.fetch) => {
	if ( typeof webhookUrl !== 'string' || ! webhookUrl.trim() ) {
		return false;
	}

	const parsedUrl = new URL( webhookUrl );
	if ( parsedUrl.protocol !== 'https:' || typeof fetchImpl !== 'function' ) {
		return false;
	}

	await fetchImpl( parsedUrl.toString(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify( payload ?? {} ),
	} );

	return true;
};

const pushToDataLayer = (payload, dataLayer = globalThis?.dataLayer) => {
	if ( ! Array.isArray( dataLayer ) ) {
		return false;
	}

	dataLayer.push( payload ?? {} );
	return true;
};

const emitGtagEvent = (eventName, eventParams = {}, gtagImpl = globalThis?.gtag) => {
	if ( typeof gtagImpl !== 'function' || typeof eventName !== 'string' || ! eventName.trim() ) {
		return false;
	}

	gtagImpl( 'event', eventName, eventParams );
	return true;
};

export {
	emitGtagEvent,
	normalizeHandlerName,
	pushToDataLayer,
	resolveCustomCallback,
	sendWebhookEvent,
};
