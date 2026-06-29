(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root);
    } else {
        factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    const ENRICHED_STORAGE_KEY = 'bbpa_enriched_hit_state';
    const ENRICHED_VISIT_ID_STORAGE_KEY = 'bbpa_enriched_visit_identity';
    const VISIT_ID_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
    let enrichedVisitStorageListenerAttached = false;

    function whenReady(callback) {
        if (!root.document || typeof callback !== 'function') {
            return;
        }

        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }

        callback();
    }

    function getEndpointUrl(settings) {
        const data = settings || root.BBPATracker || {};
        if (!data.restUrl || !data.restNamespace) {
            return null;
        }

        return new URL(data.restNamespace.replace(/^\/+/, '') + '/hits', data.restUrl).toString();
    }

    function isDebugEnabled(settings) {
        const source = settings || root.BBPATracker || {};
        return !!(
            source.debugEnabled
            || source.debug_enabled
            || root.BBPA_DEBUG
            || (root.BBPATracker && root.BBPATracker.debugEnabled)
        );
    }



    function debugLog(settings, message, meta) {
        if (!isDebugEnabled(settings) || !root.console || typeof root.console.info !== 'function') {
            return;
        }

        if (meta && typeof meta === 'object') {
            root.console.info('[BimBeau Privacy Analytics][Debug] ' + String(message), meta);
            return;
        }

        root.console.info('[BimBeau Privacy Analytics][Debug] ' + String(message));
    }

    function sendPayload(settings, payload, transportOptions) {
        const endpoint = getEndpointUrl(settings);
        if (!endpoint) {
            debugLog(settings, 'Payload skipped: endpoint is missing', { payload: payload || null });
            return Promise.resolve({ status: null, tracked: null, reason: 'missing_endpoint' });
        }

        const body = JSON.stringify(payload || {});
        const options = transportOptions || {};

        debugLog(settings, 'Dispatching tracker payload', {
            endpoint: endpoint,
            transportOptions: options,
            payload: payload || null,
        });

        if (root.navigator && root.navigator.sendBeacon) {
            const sent = root.navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
            debugLog(settings, 'Beacon transport attempt finished', { sent: sent });
            if (sent || options.forceBeacon) {
                return Promise.resolve({ status: 'beacon', tracked: null, reason: sent ? 'beacon_sent' : 'beacon_forced' });
            }
        }

        if (options.forceBeacon || !root.fetch) {
            debugLog(settings, 'Payload skipped: transport unavailable', { forceBeacon: !!options.forceBeacon, hasFetch: !!root.fetch });
            return Promise.resolve({ status: null, tracked: null, reason: 'transport_unavailable' });
        }

        return root.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            keepalive: true,
            credentials: 'omit',
        }).then(function (response) {
            if (!response) {
                return { status: null, tracked: null, reason: 'empty_response' };
            }

            return response.clone().json().catch(function () {
                return {};
            }).then(function (data) {
                const tracked = Object.prototype.hasOwnProperty.call(data, 'tracked') ? !!data.tracked : null;
                const reason = data && data.reason ? String(data.reason) : null;

                debugLog(settings, 'Payload response received', { status: response.status, tracked: tracked, reason: reason });

                if (isDebugEnabled(settings) && root.console && typeof root.console.info === 'function' && tracked === false) {
                    root.console.info('[BimBeau Privacy Analytics] Hit ignored (' + String(response.status) + '): ' + String(reason || 'unknown'));
                }

                return {
                    status: response.status,
                    tracked: tracked,
                    reason: reason,
                };
            });
        }).catch(function () {
            debugLog(settings, 'Payload request failed before response');
            return { status: null, tracked: null, reason: 'request_failed' };
        });
    }

    function resolvePagePath(settings) {
        const source = settings || root.BBPATracker || {};
        if (typeof source.pagePathOverride === 'string' && source.pagePathOverride.trim() !== '') {
            return source.pagePathOverride.trim();
        }

        if (!root.location) {
            return '/';
        }

        const pathname = typeof root.location.pathname === 'string' && root.location.pathname !== ''
            ? root.location.pathname
            : '/';
        const search = typeof root.location.search === 'string' ? root.location.search : '';
        return pathname + search;
    }

    function getTimestampBucket(now, bucketSizeSeconds) {
        const size = typeof bucketSizeSeconds === 'number' && bucketSizeSeconds > 0 ? bucketSizeSeconds : 300;
        const ts = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
        return Math.floor(ts / 1000 / size) * size;
    }

    function resolveVisitId(explicitVisitId, settings) {
        if (typeof explicitVisitId === 'string' && explicitVisitId !== '') {
            return explicitVisitId;
        }

        const source = settings || root.BBPATracker || {};
        return typeof source.visitId === 'string' ? source.visitId : '';
    }

    function isValidVisitId(value) {
        return typeof value === 'string' && VISIT_ID_PATTERN.test(value);
    }


    function normalizeVisitIdentity(parsedIdentity, nowSeconds) {
        const storedVisitId = parsedIdentity && typeof parsedIdentity.visitId === 'string'
            ? parsedIdentity.visitId
            : '';
        const storedCreatedAt = parsedIdentity && Number.isFinite(Number(parsedIdentity.createdAt))
            ? Number(parsedIdentity.createdAt)
            : null;
        const storedLastSeenAt = parsedIdentity && Number.isFinite(Number(parsedIdentity.lastSeenAt))
            ? Number(parsedIdentity.lastSeenAt)
            : storedCreatedAt;

        if (
            !isValidVisitId(storedVisitId)
            || typeof storedCreatedAt !== 'number'
            || storedCreatedAt <= 0
            || storedCreatedAt > nowSeconds
            || typeof storedLastSeenAt !== 'number'
            || storedLastSeenAt <= 0
            || storedLastSeenAt > nowSeconds
        ) {
            return null;
        }

        return {
            visitId: storedVisitId,
            createdAt: storedCreatedAt,
            lastSeenAt: storedLastSeenAt,
        };
    }

    function removeVisitIdentityFromStorage(storageArea) {
        if (!storageArea || typeof storageArea.removeItem !== 'function') {
            return;
        }

        try {
            storageArea.removeItem(ENRICHED_VISIT_ID_STORAGE_KEY);
        } catch (error) {
            // Ignore storage cleanup failures and continue with a fresh identity.
        }
    }

    function readVisitIdentityFromStorage(storageArea, windowSeconds, nowSeconds) {
        if (!storageArea || typeof storageArea.getItem !== 'function') {
            return null;
        }

        try {
            const rawStoredIdentity = storageArea.getItem(ENRICHED_VISIT_ID_STORAGE_KEY);
            if (!rawStoredIdentity) {
                return null;
            }

            const identity = normalizeVisitIdentity(JSON.parse(rawStoredIdentity), nowSeconds);

            if (identity && (nowSeconds - identity.lastSeenAt) < windowSeconds) {
                return identity;
            }

            removeVisitIdentityFromStorage(storageArea);
        } catch (error) {
            removeVisitIdentityFromStorage(storageArea);
        }

        return null;
    }

    function persistVisitIdentity(storageArea, visitId, createdAt, lastSeenAt) {
        if (!storageArea || typeof storageArea.setItem !== 'function') {
            return false;
        }

        try {
            storageArea.setItem(ENRICHED_VISIT_ID_STORAGE_KEY, JSON.stringify({
                visitId: visitId,
                createdAt: createdAt,
                lastSeenAt: lastSeenAt,
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function attachEnrichedVisitStorageSync(windowSeconds) {
        if (enrichedVisitStorageListenerAttached || !root.addEventListener || !root.sessionStorage) {
            return;
        }

        enrichedVisitStorageListenerAttached = true;
        root.addEventListener('storage', function (event) {
            if (!event || event.key !== ENRICHED_VISIT_ID_STORAGE_KEY || !event.newValue) {
                return;
            }

            try {
                const nowSeconds = Math.floor(Date.now() / 1000);
                const identity = normalizeVisitIdentity(JSON.parse(event.newValue), nowSeconds);

                if (identity && (nowSeconds - identity.lastSeenAt) < windowSeconds) {
                    persistVisitIdentity(root.sessionStorage, identity.visitId, identity.createdAt, identity.lastSeenAt);
                }
            } catch (error) {
                return;
            }
        });
    }

    function createRobustVisitId() {
        const randomBytesLength = 24;

        if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(randomBytesLength);
            root.crypto.getRandomValues(bytes);
            let encoded = '';
            for (let i = 0; i < bytes.length; i += 1) {
                encoded += bytes[i].toString(16).padStart(2, '0');
            }

            return encoded;
        }

        let fallback = '';
        for (let i = 0; i < randomBytesLength; i += 1) {
            fallback += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        }

        return fallback + Date.now().toString(16);
    }

    function getVisitIdentifierWindowSeconds(settings) {
        const source = settings || root.BBPATracker || {};
        const rawWindowSeconds = Number(source.visitIdentifierWindowSeconds);
        return Number.isFinite(rawWindowSeconds) && rawWindowSeconds > 0
            ? Math.round(rawWindowSeconds)
            : 1800;
    }

    function resolveOrCreateEnrichedVisitId(settings) {
        const source = settings || root.BBPATracker || {};
        if (isValidVisitId(source.visitId)) {
            return source.visitId;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const windowSeconds = getVisitIdentifierWindowSeconds(source);

        const preferredStorage = root.localStorage || null;
        const fallbackStorage = root.sessionStorage || null;
        const storageCandidates = [preferredStorage, fallbackStorage].filter(Boolean);

        attachEnrichedVisitStorageSync(windowSeconds);

        for (let index = 0; index < storageCandidates.length; index += 1) {
            const identity = readVisitIdentityFromStorage(storageCandidates[index], windowSeconds, nowSeconds);
            if (identity && identity.visitId) {
                persistVisitIdentity(storageCandidates[index], identity.visitId, identity.createdAt, nowSeconds);
                return identity.visitId;
            }
        }

        const nextVisitId = createRobustVisitId();
        const persistedToPreferredStorage = persistVisitIdentity(preferredStorage, nextVisitId, nowSeconds, nowSeconds);

        if (!persistedToPreferredStorage) {
            persistVisitIdentity(fallbackStorage, nextVisitId, nowSeconds, nowSeconds);
        }

        return nextVisitId;
    }

    function cleanActiveMsDelta(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return 0;
        }

        return Math.max(0, Math.round(parsed));
    }

    function removeEnrichedState() {
        if (!root.sessionStorage || typeof root.sessionStorage.removeItem !== 'function') {
            return;
        }

        try {
            root.sessionStorage.removeItem(ENRICHED_STORAGE_KEY);
        } catch (error) {
            // Ignore storage cleanup failures and keep tracking statelessly.
        }
    }

    function readEnrichedState() {
        if (!root.sessionStorage) {
            return null;
        }

        try {
            const raw = root.sessionStorage.getItem(ENRICHED_STORAGE_KEY);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            removeEnrichedState();
        }

        return null;
    }

    function writeEnrichedState(state) {
        if (!root.sessionStorage) {
            return;
        }

        try {
            root.sessionStorage.setItem(ENRICHED_STORAGE_KEY, JSON.stringify(state || {}));
        } catch (error) {
            return;
        }
    }

    function getVisitIdFromCorrelationSeed(seed) {
        const parts = String(seed || '').split('|');
        return parts.length >= 3 ? parts[parts.length - 1] : '';
    }

    function cleanupEnrichedState(state, currentSeed, windowSeconds, nowSeconds) {
        const cleanedState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
        const activeSeed = String(currentSeed || 'default');
        const activeVisitId = getVisitIdFromCorrelationSeed(activeSeed);
        let changed = false;

        Object.keys(cleanedState).forEach(function (stateKey) {
            const entry = cleanedState[stateKey];
            const updatedAt = entry && Number.isFinite(Number(entry.updated_at)) ? Number(entry.updated_at) : null;
            const entryVisitId = getVisitIdFromCorrelationSeed(stateKey);
            const isCurrentSeed = stateKey === activeSeed;
            const isValidEntry = entry
                && typeof entry === 'object'
                && typeof entry.temporary_hit_id === 'string'
                && entry.temporary_hit_id !== ''
                && Number.isFinite(Number(entry.idempotency_counter));
            const isExpired = !isCurrentSeed
                && typeof updatedAt === 'number'
                && updatedAt > 0
                && (nowSeconds - updatedAt) >= windowSeconds;
            const belongsToDifferentVisit = !isCurrentSeed
                && activeVisitId !== ''
                && entryVisitId !== ''
                && entryVisitId !== activeVisitId;

            if (!isValidEntry || isExpired || belongsToDifferentVisit) {
                delete cleanedState[stateKey];
                changed = true;
            }
        });

        return { state: cleanedState, changed: changed };
    }

    function createTemporaryHitId(seed) {
        const safeSeed = String(seed || '');
        let hash = 0;
        for (let i = 0; i < safeSeed.length; i += 1) {
            hash = ((hash << 5) - hash) + safeSeed.charCodeAt(i);
            hash |= 0;
        }

        return 'tmp_' + Math.abs(hash).toString(36);
    }

    function resolveIdempotenceState(seed) {
        const normalizedSeed = String(seed || 'default');
        const nowSeconds = Math.floor(Date.now() / 1000);
        const windowSeconds = getVisitIdentifierWindowSeconds(root.BBPATracker || {});
        const cleanup = cleanupEnrichedState(readEnrichedState() || {}, normalizedSeed, windowSeconds, nowSeconds);
        const state = cleanup.state;
        const existing = state[normalizedSeed];

        if (existing && typeof existing.temporary_hit_id === 'string' && existing.temporary_hit_id !== '') {
            if (cleanup.changed) {
                writeEnrichedState(state);
            }
            return existing;
        }

        const next = {
            temporary_hit_id: createTemporaryHitId(normalizedSeed + '|' + Date.now()),
            idempotency_counter: 0,
            updated_at: nowSeconds,
        };

        state[normalizedSeed] = next;
        writeEnrichedState(state);
        return next;
    }

    function incrementIdempotency(seed, suffix) {
        const key = String(seed || 'default');
        const current = resolveIdempotenceState(key);
        const state = readEnrichedState() || {};
        const counter = Number(current.idempotency_counter || 0) + 1;

        state[key] = {
            temporary_hit_id: current.temporary_hit_id,
            idempotency_counter: counter,
            updated_at: Math.floor(Date.now() / 1000),
        };
        writeEnrichedState(state);

        return current.temporary_hit_id + '|' + String(suffix || 'event') + '|' + String(counter);
    }

    function createHitCorrelationSeed(pagePath, visitId, bucket) {
        return String(pagePath || '/') + '|' + String(bucket || '') + '|' + String(visitId || '');
    }

    return {
        isDebugEnabled: isDebugEnabled,
        sendPayload: sendPayload,
        whenReady: whenReady,
        getEndpointUrl: getEndpointUrl,
        getTimestampBucket: getTimestampBucket,
        resolveVisitId: resolveVisitId,
        resolveOrCreateEnrichedVisitId: resolveOrCreateEnrichedVisitId,
        isValidVisitId: isValidVisitId,
        cleanActiveMsDelta: cleanActiveMsDelta,
        readEnrichedState: readEnrichedState,
        writeEnrichedState: writeEnrichedState,
        debugLog: debugLog,
        resolveIdempotenceState: resolveIdempotenceState,
        incrementIdempotency: incrementIdempotency,
        createHitCorrelationSeed: createHitCorrelationSeed,
        resolvePagePath: resolvePagePath,
    };
});
