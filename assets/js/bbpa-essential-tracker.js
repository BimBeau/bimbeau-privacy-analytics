(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root);
    } else {
        root.BPAEssentialTracker = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    // Internal shared primitives formerly provided by BBPATrackerCore.
    const ENRICHED_STORAGE_KEY = 'bbpa_enriched_hit_state';
    const ENRICHED_VISIT_ID_STORAGE_KEY = 'bbpa_enriched_visit_identity';
    const VISIT_ID_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
    let enrichedVisitStorageListenerAttached = false;
    let essentialTrackerInitialized = false;
    let essentialTrackerRetryTimer = null;
    const ESSENTIAL_TRACKER_MAX_CONFIG_RETRIES = 5;
    const ESSENTIAL_TRACKER_CONFIG_RETRY_DELAY_MS = 25;

    function freezeRuntimeConfig(runtimeConfig) {
        if (runtimeConfig && typeof runtimeConfig === 'object' && typeof root.Object === 'object' && typeof root.Object.freeze === 'function' && !root.Object.isFrozen(runtimeConfig)) {
            root.Object.freeze(runtimeConfig);
        }

        return runtimeConfig;
    }

    function decodeBase64Json(encodedConfig) {
        if (typeof encodedConfig !== 'string' || encodedConfig.trim() === '') {
            return null;
        }

        try {
            let jsonString = '';
            if (typeof root.atob === 'function') {
                const binaryString = root.atob(encodedConfig);
                if (typeof root.TextDecoder === 'function' && typeof root.Uint8Array === 'function') {
                    const bytes = new root.Uint8Array(binaryString.length);
                    for (let index = 0; index < binaryString.length; index += 1) {
                        bytes[index] = binaryString.charCodeAt(index);
                    }
                    jsonString = new root.TextDecoder('utf-8').decode(bytes);
                } else {
                    jsonString = decodeURIComponent(binaryString.split('').map(function (character) {
                        return '%' + ('00' + character.charCodeAt(0).toString(16)).slice(-2);
                    }).join(''));
                }
            } else if (typeof Buffer !== 'undefined') {
                jsonString = Buffer.from(encodedConfig, 'base64').toString('utf8');
            }

            const parsedConfig = jsonString !== '' ? JSON.parse(jsonString) : null;
            return parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig) ? parsedConfig : null;
        } catch (error) {
            return null;
        }
    }

    function readRuntimeConfigFromScript(scriptElement) {
        if (!scriptElement || typeof scriptElement.getAttribute !== 'function') {
            return null;
        }

        return decodeBase64Json(scriptElement.getAttribute('data-bbpa-runtime-config'));
    }

    function persistRuntimeConfig(runtimeConfig) {
        if (!runtimeConfig || typeof runtimeConfig !== 'object') {
            return null;
        }

        if (!root.__bpaRuntimeConfig || typeof root.__bpaRuntimeConfig !== 'object') {
            root.__bpaRuntimeConfig = runtimeConfig;
        }
        if (!root.BBPATracker && runtimeConfig.BBPATracker && typeof runtimeConfig.BBPATracker === 'object') {
            root.BBPATracker = runtimeConfig.BBPATracker;
        }

        return freezeRuntimeConfig(root.__bpaRuntimeConfig);
    }

    function readRuntimeConfig() {
        if (root.__bpaRuntimeConfig && typeof root.__bpaRuntimeConfig === 'object') {
            return freezeRuntimeConfig(root.__bpaRuntimeConfig);
        }

        const currentScriptConfig = root.document && root.document.currentScript
            ? readRuntimeConfigFromScript(root.document.currentScript)
            : null;
        if (currentScriptConfig) {
            return persistRuntimeConfig(currentScriptConfig);
        }

        const taggedScriptConfig = root.document && typeof root.document.querySelector === 'function'
            ? readRuntimeConfigFromScript(root.document.querySelector('#bbpa-essential-tracker-js[data-bbpa-runtime-config]'))
            : null;
        if (taggedScriptConfig) {
            return persistRuntimeConfig(taggedScriptConfig);
        }

        return null;
    }

    function getRuntimeConfig() {
        return readRuntimeConfig();
    }

    function resolveRuntimeObject(key) {
        const runtimeConfig = readRuntimeConfig();
        if (!runtimeConfig || typeof runtimeConfig[key] !== 'object' || runtimeConfig[key] === null) {
            return null;
        }

        return runtimeConfig[key];
    }


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
        const data = settings || root.BBPATracker || resolveRuntimeObject('BBPATracker') || {};
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

        if (root.navigator && root.navigator.sendBeacon) {
            const sent = root.navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
            if (sent || options.forceBeacon) {
                return Promise.resolve({ status: 'beacon', tracked: null, reason: sent ? 'beacon_sent' : 'beacon_forced' });
            }
        }

        if (options.forceBeacon || !root.fetch) {
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
                return {
                    status: response.status,
                    tracked: Object.prototype.hasOwnProperty.call(data, 'tracked') ? !!data.tracked : null,
                    reason: data && data.reason ? String(data.reason) : null,
                };
            });
        }).catch(function () {
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

    function normalizeTrackerPath(rawPath) {
        if (typeof rawPath !== 'string' || rawPath.trim() === '') {
            return '/';
        }

        const cleanedPath = rawPath.split('?')[0].trim();
        if (cleanedPath === '') {
            return '/';
        }

        const prefixedPath = cleanedPath.charAt(0) === '/' ? cleanedPath : ('/' + cleanedPath);
        const noTrailingSlash = prefixedPath.replace(/\/+$/, '');
        return noTrailingSlash === '' ? '/' : noTrailingSlash;
    }

    function getTrackerExcludedPaths(settings) {
        const source = settings || root.BBPATracker || {};
        if (!source || !Array.isArray(source.trackerExcludedPaths)) {
            return [];
        }

        return source.trackerExcludedPaths
            .filter(function (path) {
                return typeof path === 'string' && path.trim() !== '';
            })
            .map(normalizeTrackerPath);
    }

    function isExcludedTrackerPath(rawPath, settings) {
        const normalizedPath = normalizeTrackerPath(rawPath);
        return getTrackerExcludedPaths(settings).some(function (excludedPath) {
            return normalizedPath === excludedPath || normalizedPath.indexOf(excludedPath + '/') === 0;
        });
    }

    function shouldSkipTrackingForFrontAppShell(settings) {
        const source = settings || root.BBPATracker || {};

        return isExcludedTrackerPath(resolvePagePath(source), source);
    }

    function getTimestampBucket(now, bucketSizeSeconds) {
        const size = typeof bucketSizeSeconds === 'number' && bucketSizeSeconds > 0 ? bucketSizeSeconds : 300;
        const ts = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
        return Math.floor(ts / 1000 / size) * size;
    }

    function isValidVisitId(value) {
        return typeof value === 'string' && VISIT_ID_PATTERN.test(value);
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
        return Number.isFinite(rawWindowSeconds) && rawWindowSeconds > 0 ? Math.round(rawWindowSeconds) : 1800;
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

    function createTemporaryHitId(seed) {
        const safeSeed = String(seed || '');
        let hash = 0;
        for (let i = 0; i < safeSeed.length; i += 1) {
            hash = ((hash << 5) - hash) + safeSeed.charCodeAt(i);
            hash |= 0;
        }

        return 'tmp_' + Math.abs(hash).toString(36);
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

    const BASE_ALLOWED_FIELDS = Object.freeze([
        'page_path',
        'post_id',
        'referrer_domain',
        'device_class',
        'timestamp_bucket',
        'visit_id',
        'tracker_scope',
        'event_name',
        'temporary_hit_id',
        'idempotency_key',
    ]);

    // Essential tracker only builds and sends baseline fields.
    // Enriched fields are owned by the advanced tracker runtime.
    function buildBasePayload(settings) {
        const source = settings || root.BBPATracker || {};
        const pagePath = resolvePagePath(source);
        const referrer = root.document && root.document.referrer ? root.document.referrer : '';
        const referrerDomain = referrer ? new URL(referrer, 'https://example.com').hostname : null;
        const width = Number(root.innerWidth || 0);
        const bucket = getTimestampBucket(Date.now(), 300);
        let deviceClass = 'desktop';
        if (width > 0 && width <= 640) {
            deviceClass = 'mobile';
        } else if (width > 0 && width <= 1024) {
            deviceClass = 'tablet';
        }

        const idSeed = createHitCorrelationSeed(pagePath, '', bucket);
        const idState = resolveIdempotenceState(idSeed);
        const visitId = resolveOrCreateEnrichedVisitId(source);
        const payload = {
            page_path: pagePath,
            post_id: Number(source.postId) > 0 ? Number(source.postId) : undefined,
            referrer_domain: referrerDomain || undefined,
            device_class: deviceClass,
            timestamp_bucket: bucket,
            visit_id: visitId || undefined,
            tracker_scope: 'base',
            event_name: 'page_view',
            temporary_hit_id: idState.temporary_hit_id,
            idempotency_key: incrementIdempotency(idSeed, 'page_view'),
        };

        return BASE_ALLOWED_FIELDS.reduce(function (acc, key) {
            if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
                acc[key] = payload[key];
            }
            return acc;
        }, {});
    }

    function initEssentialTracker(retryAttempt) {
        if (essentialTrackerInitialized) {
            return;
        }

        const settings = root.BBPATracker || resolveRuntimeObject('BBPATracker') || {};
        if (!root.BBPATracker && settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
            root.BBPATracker = settings;
        }

        const canRetryMissingConfig = !(typeof module !== 'undefined' && module.exports);
        if (canRetryMissingConfig && !getEndpointUrl(settings) && Number(retryAttempt || 0) < ESSENTIAL_TRACKER_MAX_CONFIG_RETRIES && typeof root.setTimeout === 'function') {
            if (essentialTrackerRetryTimer) {
                return;
            }
            essentialTrackerRetryTimer = root.setTimeout(function () {
                essentialTrackerRetryTimer = null;
                initEssentialTracker(Number(retryAttempt || 0) + 1);
            }, ESSENTIAL_TRACKER_CONFIG_RETRY_DELAY_MS);
            return;
        }

        essentialTrackerInitialized = true;
        debugLog(settings, 'Essential tracker initialization requested', {
            hasSettings: !!root.BBPATracker,
        });
        whenReady(function () {
            if (shouldSkipTrackingForFrontAppShell(settings)) {
                debugLog(settings, 'Essential tracking skipped on front app shell', {
                    pagePath: resolvePagePath(settings),
                });
                return;
            }

            const payload = buildBasePayload(settings);
            debugLog(settings, 'Essential payload built', { payload: payload });
            sendPayload(settings, payload, {});
        });
    }

    function hasEssentialPublicApi(targetRoot) {
        const candidateRoot = targetRoot && typeof targetRoot === 'object' ? targetRoot : root;
        const requiredMethods = [
            'buildBasePayload',
            'initEssentialTracker',
            'sendPayload',
            'debugLog',
            'whenReady',
            'resolvePagePath',
            'getTimestampBucket',
            'resolveOrCreateEnrichedVisitId',
            'cleanActiveMsDelta',
            'resolveIdempotenceState',
            'incrementIdempotency',
            'createHitCorrelationSeed',
        ];
        const api = candidateRoot && candidateRoot.BPAEssentialTracker && typeof candidateRoot.BPAEssentialTracker === 'object'
            ? candidateRoot.BPAEssentialTracker
            : null;

        if (!api) {
            return false;
        }

        return requiredMethods.every(function (methodName) {
            return typeof api[methodName] === 'function';
        });
    }

    function dispatchEssentialReadySignal() {
        const essentialApiReady = hasEssentialPublicApi(root);
        try {
            root.BPAEssentialReady = true;
            if (root.document && typeof root.document.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
                root.document.dispatchEvent(new root.CustomEvent('bpa:essential-ready', {
                    detail: {
                        hasTracker: !!root.BBPATracker,
                        hasEssentialApi: essentialApiReady,
                    },
                }));
            }
            debugLog(root.BBPATracker || {}, 'Essential ready dispatched', {
                hasTracker: !!root.BBPATracker,
                hasEssentialApi: essentialApiReady,
            });
        } catch (error) {}
    }

    const publicApi = {
        buildBasePayload: buildBasePayload,
        BASE_ALLOWED_FIELDS: BASE_ALLOWED_FIELDS,
        ENRICHED_VISIT_ID_STORAGE_KEY: ENRICHED_VISIT_ID_STORAGE_KEY,
        VISIT_ID_PATTERN: VISIT_ID_PATTERN,
        initEssentialTracker: initEssentialTracker,
        sendPayload: sendPayload,
        debugLog: debugLog,
        whenReady: whenReady,
        resolvePagePath: resolvePagePath,
        getTimestampBucket: getTimestampBucket,
        isValidVisitId: isValidVisitId,
        createRobustVisitId: createRobustVisitId,
        readVisitIdentityFromStorage: readVisitIdentityFromStorage,
        persistVisitIdentity: persistVisitIdentity,
        attachEnrichedVisitStorageSync: attachEnrichedVisitStorageSync,
        resolveOrCreateEnrichedVisitId: resolveOrCreateEnrichedVisitId,
        cleanActiveMsDelta: cleanActiveMsDelta,
        getRuntimeConfig: getRuntimeConfig,
        readRuntimeConfig: readRuntimeConfig,
        resolveIdempotenceState: resolveIdempotenceState,
        incrementIdempotency: incrementIdempotency,
        createHitCorrelationSeed: createHitCorrelationSeed,
        isExcludedTrackerPath: isExcludedTrackerPath,
        shouldSkipTrackingForFrontAppShell: shouldSkipTrackingForFrontAppShell,
    };

    root.BPAEssentialTracker = publicApi;
    initEssentialTracker();
    dispatchEssentialReadySignal();

    return publicApi;
});
