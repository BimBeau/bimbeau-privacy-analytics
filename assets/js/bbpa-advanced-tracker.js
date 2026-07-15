(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root, require('./bbpa-essential-tracker'));
    } else {
        root.BPAAdvancedTracker = factory(root, root.BPAEssentialTracker);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, essentialTracker) {
    const HEARTBEAT_INTERVAL_MS = 12000;
    const ACTIVITY_WINDOW_MS = 30000;
    const ADVANCED_TRACKER_STATE = {
        NOT_STARTED: 'not_started',
        WAITING: 'waiting_for_external_cmp',
        STARTING: 'starting',
        STARTED: 'started',
    };
    const RETRY_DELAY_MS = 250;
    const MAX_START_RETRIES = 20;


    function readRuntimeConfig() {
        if (root.__bpaRuntimeConfig && typeof root.__bpaRuntimeConfig === 'object') {
            return root.__bpaRuntimeConfig;
        }

        return null;
    }

    function resolveRuntimeObject(key) {
        const runtimeConfig = readRuntimeConfig();
        if (!runtimeConfig || typeof runtimeConfig[key] !== 'object' || runtimeConfig[key] === null) {
            return null;
        }

        return runtimeConfig[key];
    }

    const BOOTSTRAP_EVENTS = [
        'bpa:tracker:bootstrap',
        'bpa:tracker:ready',
        'bpa:advanced-tracker:retry',
    ];

    let advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
    let advancedRuntimeRetryCount = 0;
    let advancedRuntimeRetryTimer = null;
    let activeDurationTrackingStarted = false;
    let advancedStartupCompleted = false;
    let advancedStartupCompleting = false;
    let lastAdvancedSkipReason = null;
    let lastAdvancedStartedAt = null;

    function getTrackerCore() {
        return essentialTracker || root.BPAEssentialTracker || null;
    }

    function resolveMissingEssentialPublicApiMethods() {
        const trackerCore = getTrackerCore();
        const requiredMethods = [
            'sendPayload',
            'debugLog',
            'whenReady',
            'resolvePagePath',
            'getTimestampBucket',
            'resolveOrCreateEnrichedVisitId',
            'cleanActiveMsDelta',
            'createHitCorrelationSeed',
            'resolveIdempotenceState',
            'incrementIdempotency',
        ];

        if (!trackerCore || typeof trackerCore !== 'object') {
            return requiredMethods.slice();
        }

        return requiredMethods.filter(function (methodName) {
            return typeof trackerCore[methodName] !== 'function';
        });
    }

    function hasEssentialPublicApi() {
        return resolveMissingEssentialPublicApiMethods().length === 0;
    }

    function debugLog(settings, message, meta) {
        const trackerCore = getTrackerCore();
        if (!trackerCore || typeof trackerCore.debugLog !== 'function') {
            return;
        }

        trackerCore.debugLog(settings || root.BBPATracker || {}, message, meta);
    }

    function ensureRuntimeState() {
        const runtimeState = root.BPAAdvancedRuntime || {};
        if (!runtimeState.startedAt) {
            runtimeState.startedAt = Date.now();
        }
        if (!Object.prototype.hasOwnProperty.call(runtimeState, 'lastPayloadAt')) { runtimeState.lastPayloadAt = null; }
        if (!Object.prototype.hasOwnProperty.call(runtimeState, 'lastResponseStatus')) { runtimeState.lastResponseStatus = null; }
        if (!Object.prototype.hasOwnProperty.call(runtimeState, 'lastSkipReason')) { runtimeState.lastSkipReason = null; }
        if (!Object.prototype.hasOwnProperty.call(runtimeState, 'lastTracked')) { runtimeState.lastTracked = null; }
        root.BPAAdvancedRuntime = runtimeState;
        return runtimeState;
    }

    // Advanced tracker has its own payload builder and does not reuse base filtering.
    function buildEnrichedPayload(settings, visitId, activeMsDelta, eventName) {
        const trackerCore = getTrackerCore();
        if (!trackerCore) {
            return null;
        }

        const viewportWidth = Number(root.innerWidth || 0);
        const viewportHeight = Number(root.innerHeight || 0);
        const screenResolution = viewportWidth > 0 && viewportHeight > 0
            ? String(viewportWidth) + 'x' + String(viewportHeight)
            : '';
        const pagePath = trackerCore.resolvePagePath(settings || {});
        const postId = Number(settings && settings.postId ? settings.postId : 0);
        const referrerSource = root.document && typeof root.document.referrer === 'string' ? root.document.referrer : '';
        const referrerDomain = referrerSource ? (function () {
            try {
                return new URL(referrerSource, root.location && root.location.href ? root.location.href : undefined).hostname || '';
            } catch (error) {
                return '';
            }
        })() : '';
        const bucket = trackerCore.getTimestampBucket(Date.now(), 300);
        const userAgent = root.navigator && root.navigator.userAgent ? String(root.navigator.userAgent) : '';
        const deviceClass = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? 'mobile' : 'desktop';
        const correlationVisitId = (eventName === 'page_view' || eventName === 'enrichment_update') ? '' : visitId;
        const idSeed = trackerCore.createHitCorrelationSeed(pagePath, correlationVisitId, bucket);
        const idState = trackerCore.resolveIdempotenceState(idSeed);

        // Keep enrichment_update correlated with the base page_view idempotence seed.
        // This reuses the same temporary_hit_id whenever the base page_view already created it.
        const trackerScope = 'enriched';

        return {
            page_path: pagePath,
            post_id: postId,
            referrer_domain: referrerDomain,
            device_class: deviceClass,
            timestamp_bucket: bucket,
            tracker_scope: trackerScope === 'enriched_alias' ? 'enriched' : trackerScope,
            event_name: eventName,
            visit_id: visitId,
            active_ms_delta: trackerCore.cleanActiveMsDelta(activeMsDelta),
            screen_resolution: screenResolution,
            temporary_hit_id: idState.temporary_hit_id,
            idempotency_key: trackerCore.incrementIdempotency(idSeed, eventName),
            granularity_enrichment: true,
            allowed_event_params: [],
        };
    }

    function sendAdvancedPayload(settings, visitId, activeMsDelta, eventName, transportOptions) {
        const runtimeState = ensureRuntimeState();
        const externalCmpExecutionState = resolveExternalCmpExecutionState();
        if (!externalCmpExecutionState.allowed) {
            const reason = markAdvancedWaitingForExternalCmp(externalCmpExecutionState);
            return Promise.resolve({ status: null, tracked: false, reason: reason });
        }

        const activationDecision = canActivateAdvancedTracking(settings);
        debugLog(settings, 'Advanced payload dispatch requested', {
            eventName: eventName,
            activeMsDelta: activeMsDelta,
            transportOptions: transportOptions || {},
            activationDecision: activationDecision,
        });
        if (!activationDecision.allowed) {
            debugLog(settings, 'Advanced tracker activation blocked', activationDecision);
            runtimeState.lastSkipReason = activationDecision.reason;
            runtimeState.lastTracked = false;
            return Promise.resolve({ status: null, tracked: false, reason: activationDecision.reason });
        }

        const payload = buildEnrichedPayload(settings, visitId, activeMsDelta, eventName);
        debugLog(settings, 'Advanced payload build result', {
            hasPayload: !!payload,
            visitId: visitId,
            eventName: eventName,
        });
        if (!payload) {
            runtimeState.lastSkipReason = 'missing_dependencies';
            runtimeState.lastTracked = false;
            return Promise.resolve({ status: null, tracked: false, reason: 'missing_dependencies' });
        }

        const trackerCore = getTrackerCore();
        if (!trackerCore) {
            runtimeState.lastSkipReason = 'missing_dependencies';
            runtimeState.lastTracked = false;
            return Promise.resolve({ status: null, tracked: false, reason: 'missing_dependencies' });
        }
        runtimeState.lastPayloadAt = Date.now();


        return Promise.resolve(trackerCore.sendPayload(settings, payload, transportOptions || {})).then(function (result) {
            if (result && Object.prototype.hasOwnProperty.call(result, 'status')) {
                runtimeState.lastResponseStatus = result.status;
                runtimeState.lastSkipReason = result.reason || null;
                runtimeState.lastTracked = Object.prototype.hasOwnProperty.call(result, 'tracked') ? result.tracked : null;
            }

            debugLog(settings, 'Advanced payload dispatch completed', { result: result || null });
            return result;
        });
    }





    function clearStartRetryTimer() {
        if (advancedRuntimeRetryTimer) {
            root.clearTimeout(advancedRuntimeRetryTimer);
            advancedRuntimeRetryTimer = null;
        }
    }


    function getCanonicalAdvancedScriptTag() {
        if (!root.document || typeof root.document.getElementById !== 'function') {
            return null;
        }
        return root.document.getElementById('bbpa-advanced-tracker-js');
    }

    function isExecutableScriptType(type) {
        const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
        return normalizedType === ''
            || normalizedType === 'text/javascript'
            || normalizedType === 'application/javascript'
            || normalizedType === 'application/ecmascript'
            || normalizedType === 'text/ecmascript'
            || normalizedType === 'module';
    }

    function resolveExternalCmpExecutionState() {
        const scriptTag = getCanonicalAdvancedScriptTag();
        if (!scriptTag || typeof scriptTag.getAttribute !== 'function') {
            return { allowed: true, reason: null };
        }

        const scriptType = scriptTag.getAttribute('type') || '';
        if (!isExecutableScriptType(scriptType)) {
            return {
                allowed: false,
                reason: 'external_cmp_blocked',
                scriptType: scriptType,
            };
        }

        return { allowed: true, reason: null };
    }

    function markAdvancedWaitingForExternalCmp(externalCmpExecutionState) {
        const runtimeState = ensureRuntimeState();
        advancedRuntimeState = ADVANCED_TRACKER_STATE.WAITING;
        lastAdvancedSkipReason = (externalCmpExecutionState && externalCmpExecutionState.reason) || 'external_cmp_blocked';
        runtimeState.lastSkipReason = lastAdvancedSkipReason;
        runtimeState.lastTracked = false;
        debugLog(root.BBPATracker || {}, 'Advanced waiting for external CMP', externalCmpExecutionState || {});
        updateRuntimeStatus(root.BBPATracker || {});
        return lastAdvancedSkipReason;
    }

    function updateRuntimeStatus(settings) {
        const trackerSettings = settings && typeof settings === 'object' ? settings : (root.BBPATracker || {});
        root.BPARuntimeStatus = {
            essentialReady: root.BPAEssentialReady === true,
            essentialApiReady: hasEssentialPublicApi(),
            trackerConfigReady: !!(trackerSettings && trackerSettings.restUrl && trackerSettings.restNamespace),
            advancedLoaded: true,
            advancedState: advancedRuntimeState,
            advancedBlockedReason: lastAdvancedSkipReason,
            advancedRetryCount: advancedRuntimeRetryCount,
            lastAdvancedSkipReason: lastAdvancedSkipReason,
            advancedStatsEnabled: trackerSettings.advanced_stats_enabled !== false,
            triggersBound: false,
            triggersBoundCount: 0,
            lastAdvancedStartedAt: lastAdvancedStartedAt,
        };
    }

    function scheduleStartRetry() {
        if (advancedRuntimeState === ADVANCED_TRACKER_STATE.STARTED || advancedRuntimeRetryTimer) {
            return;
        }

        if (advancedRuntimeRetryCount >= MAX_START_RETRIES) {
            return;
        }

        advancedRuntimeRetryCount += 1;
        debugLog(root.BBPATracker || {}, 'Advanced retry scheduled', {
            retryCount: advancedRuntimeRetryCount,
            maxRetries: MAX_START_RETRIES,
            retryDelayMs: RETRY_DELAY_MS,
        });
        updateRuntimeStatus(root.BBPATracker || {});
        advancedRuntimeRetryTimer = root.setTimeout(function () {
            advancedRuntimeRetryTimer = null;
            initAdvancedTracker();
        }, RETRY_DELAY_MS);
    }

    function hasActiveDntOrGpc() {
        const nav = root.navigator || {};
        const dntRaw = nav.doNotTrack || root.doNotTrack || (root.document && root.document.doNotTrack) || null;
        const dnt = dntRaw === '1' || dntRaw === 'yes' || dntRaw === 1;
        const gpc = nav.globalPrivacyControl === true;

        return { dnt: !!dnt, gpc: !!gpc };
    }

    function canActivateAdvancedTracking(settings) {
        if (settings && settings.isUserExcludedByRole === true) {
            return { allowed: false, reason: 'excluded_role' };
        }

        if (settings && settings.respectDntGpc === true) {
            const privacySignals = hasActiveDntOrGpc();
            if (privacySignals.dnt) {
                return { allowed: false, reason: 'dnt_enabled', privacySignals: privacySignals };
            }
            if (privacySignals.gpc) {
                return { allowed: false, reason: 'gpc_enabled', privacySignals: privacySignals };
            }
        }

        if (!getTrackerCore() || !root.BBPATracker) {
            return { allowed: false, reason: 'missing_dependencies' };
        }

        return { allowed: true, reason: null };
    }

    function isDocumentVisible() {
        return !root.document || root.document.visibilityState === 'visible';
    }

    function initActiveDurationTracking(settings) {
        if (activeDurationTrackingStarted) {
            return;
        }
        activeDurationTrackingStarted = true;
        let lastInteractionAt = Date.now();
        let lastActiveSentAt = Date.now();

        function markInteraction() {
            lastInteractionAt = Date.now();
        }

        function isUserActive() {
            return Date.now() - lastInteractionAt <= ACTIVITY_WINDOW_MS;
        }

        function sendActivePing(forceBeacon) {
            if (!isDocumentVisible() || !isUserActive()) {
                return;
            }

            const externalCmpExecutionState = resolveExternalCmpExecutionState();
            if (!externalCmpExecutionState.allowed) {
                markAdvancedWaitingForExternalCmp(externalCmpExecutionState);
                return;
            }

            const now = Date.now();
            const trackerCore = getTrackerCore();
            if (!trackerCore) {
                return;
            }

            const delta = trackerCore.cleanActiveMsDelta(now - lastActiveSentAt);
            lastActiveSentAt = now;
            if (delta <= 0) {
                return;
            }

            const visitId = trackerCore.resolveOrCreateEnrichedVisitId(settings);
            sendAdvancedPayload(settings, visitId, delta, 'heartbeat', { forceBeacon: !!forceBeacon });
        }

        ['scroll', 'click', 'mousemove', 'keydown', 'touchstart'].forEach(function (eventName) {
            root.document.addEventListener(eventName, markInteraction, { passive: true });
        });

        root.document.addEventListener('visibilitychange', function () {
            if (!isDocumentVisible()) {
                sendActivePing(true);
            } else {
                markInteraction();
            }
        });
        root.addEventListener('pagehide', function () {
            sendActivePing(true);
        });

        root.setInterval(function () {
            sendActivePing(false);
        }, HEARTBEAT_INTERVAL_MS);
    }

    function finishAdvancedStartup(settings) {
        if (advancedStartupCompleted) {
            return;
        }
        initActiveDurationTracking(settings);
        advancedStartupCompleted = true;
        updateRuntimeStatus(settings);
        if (root.document && typeof root.document.dispatchEvent === 'function') {
            let startedEvent;
            if (typeof root.CustomEvent === 'function') {
                startedEvent = new root.CustomEvent('bpa:advanced-tracker:started', { detail: root.BPARuntimeStatus || {} });
            } else if (typeof root.Event === 'function') {
                startedEvent = new root.Event('bpa:advanced-tracker:started');
            }
            if (startedEvent) {
                root.document.dispatchEvent(startedEvent);
            }
        }
    }

    function initAdvancedTracker() {
        if (advancedRuntimeState === ADVANCED_TRACKER_STATE.STARTING) {
            return;
        }

        const externalCmpExecutionState = resolveExternalCmpExecutionState();
        if (!externalCmpExecutionState.allowed) {
            markAdvancedWaitingForExternalCmp(externalCmpExecutionState);
            return;
        }
        if (advancedRuntimeState === ADVANCED_TRACKER_STATE.WAITING) {
            advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
        }
        if (advancedRuntimeState === ADVANCED_TRACKER_STATE.STARTED) {
            return;
        }
        debugLog(root.BBPATracker || {}, 'Advanced boot attempt', {
            retryCount: advancedRuntimeRetryCount,
            state: advancedRuntimeState,
        });

        if (!hasEssentialPublicApi()) {
            advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
            lastAdvancedSkipReason = 'missing_essential_api';
            const runtimeState = ensureRuntimeState();
            runtimeState.lastSkipReason = 'missing_dependencies';
            runtimeState.lastTracked = false;
            const missingMethods = resolveMissingEssentialPublicApiMethods();
            debugLog(root.BBPATracker || {}, 'Advanced blocked: missing essential API', { missingMethods: missingMethods });
            debugLog(root.BBPATracker || {}, 'Advanced waiting for essential', { retryCount: advancedRuntimeRetryCount });
            scheduleStartRetry();
            updateRuntimeStatus(root.BBPATracker || {});
            return;
        }

        advancedRuntimeState = ADVANCED_TRACKER_STATE.STARTING;

        const runtimeState = ensureRuntimeState();
        const settings = root.BBPATracker;
        const activationDecision = canActivateAdvancedTracking(settings);

        if (!activationDecision.allowed) {
            debugLog(settings, 'Advanced tracker activation blocked', activationDecision);
            runtimeState.lastSkipReason = activationDecision.reason;
            runtimeState.lastTracked = false;
            lastAdvancedSkipReason = activationDecision.reason;

            if (activationDecision.reason === 'missing_dependencies') {
                debugLog(settings, 'Advanced blocked: missing BBPATracker config', activationDecision);
                advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
                scheduleStartRetry();
                updateRuntimeStatus(settings);
                return;
            }

            if (activationDecision.reason === 'dnt_enabled' || activationDecision.reason === 'gpc_enabled') {
                debugLog(settings, 'Advanced blocked: DNT/GPC', activationDecision);
            }

            advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
            updateRuntimeStatus(settings);
            return;
        }

        clearStartRetryTimer();
        advancedRuntimeState = ADVANCED_TRACKER_STATE.STARTED;
        lastAdvancedSkipReason = null;
        runtimeState.lastSkipReason = null;
        lastAdvancedStartedAt = new Date().toISOString();
        updateRuntimeStatus(settings);

        const trackerCore = getTrackerCore();
        if (!trackerCore) {
            advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
            scheduleStartRetry();
            return;
        }

        debugLog(settings, 'Advanced tracker started', {
            bootstrapRetries: advancedRuntimeRetryCount,
        });
        debugLog(settings, 'Advanced started', { advancedStartedAt: lastAdvancedStartedAt });

        // This runtime starts strictly when the script executes.
        // Consent decisions are external and must happen before script execution.
        if (!Object.prototype.hasOwnProperty.call(runtimeState, 'initialEnrichmentSent')) { runtimeState.initialEnrichmentSent = false; }

        trackerCore.whenReady(function () {
            const readyCore = getTrackerCore();
            if (!readyCore) {
                advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
                scheduleStartRetry();
                return;
            }

            if (!runtimeState.initialEnrichmentSent) {
                const readyExternalCmpExecutionState = resolveExternalCmpExecutionState();
                if (!readyExternalCmpExecutionState.allowed) {
                    markAdvancedWaitingForExternalCmp(readyExternalCmpExecutionState);
                    return;
                }
                runtimeState.initialEnrichmentSent = true;
                advancedStartupCompleting = true;
                sendAdvancedPayload(settings, readyCore.resolveOrCreateEnrichedVisitId(settings), 0, 'enrichment_update', {}).then(function (result) {
                    if (result && result.tracked === false && result.reason === 'external_cmp_blocked') {
                        runtimeState.initialEnrichmentSent = false;
                        advancedStartupCompleting = false;
                        markAdvancedWaitingForExternalCmp({ allowed: false, reason: 'external_cmp_blocked' });
                        return;
                    }
                    advancedStartupCompleting = false;
                    finishAdvancedStartup(settings);
                });
                return;
            }
            if (advancedStartupCompleting) {
                return;
            }
            finishAdvancedStartup(settings);
        });
    }


    function shouldAttemptAdvancedBootstrap() {
        return advancedRuntimeState !== ADVANCED_TRACKER_STATE.STARTED;
    }

    function attemptAdvancedBootstrapAsync() {
        if (!shouldAttemptAdvancedBootstrap()) {
            return;
        }
        const schedule = root.Promise && typeof root.Promise.resolve === 'function'
            ? root.Promise.resolve()
            : null;
        if (schedule && typeof schedule.then === 'function') {
            schedule.then(function () {
                if (shouldAttemptAdvancedBootstrap()) {
                    initAdvancedTracker();
                }
            });
            return;
        }
        root.setTimeout(function () {
            if (shouldAttemptAdvancedBootstrap()) {
                initAdvancedTracker();
            }
        }, 0);
    }

    if (root.document && root.document.addEventListener) {
        BOOTSTRAP_EVENTS.forEach(function (eventName) {
            root.document.addEventListener(eventName, function () {
                attemptAdvancedBootstrapAsync();
            });
        });
        root.document.addEventListener('bpa:essential-ready', function () {
            attemptAdvancedBootstrapAsync();
        });
        root.document.addEventListener('DOMContentLoaded', function () {
            attemptAdvancedBootstrapAsync();
        });
    }
    if (root.addEventListener) {
        root.addEventListener('load', function () {
            attemptAdvancedBootstrapAsync();
        });
    }

    if (root.MutationObserver && root.document && typeof root.document.addEventListener === 'function') {
        const observeCanonicalAdvancedScript = function () {
            const scriptTag = getCanonicalAdvancedScriptTag();
            if (!scriptTag || scriptTag.__bpaAdvancedCmpObserverBound === true) {
                return;
            }
            scriptTag.__bpaAdvancedCmpObserverBound = true;
            const observer = new root.MutationObserver(function () {
                if (shouldAttemptAdvancedBootstrap()) {
                    initAdvancedTracker();
                }
            });
            observer.observe(scriptTag, { attributes: true, attributeFilter: ['type', 'src', 'data-cmp-src'] });
        };
        observeCanonicalAdvancedScript();
        root.document.addEventListener('DOMContentLoaded', observeCanonicalAdvancedScript);
        root.document.addEventListener('bpa:advanced-tracker:retry', observeCanonicalAdvancedScript);
    }

    updateRuntimeStatus(root.BBPATracker || {});
    if (!root.document || root.document.readyState !== 'loading') {
        attemptAdvancedBootstrapAsync();
    }

    return {
        buildEnrichedPayload: buildEnrichedPayload,
        initAdvancedTracker: initAdvancedTracker,
        initActiveDurationTracking: initActiveDurationTracking,
        hasActiveDntOrGpc: hasActiveDntOrGpc,
        canActivateAdvancedTracking: canActivateAdvancedTracking,
        resolveExternalCmpExecutionState: resolveExternalCmpExecutionState,
        getRuntimeState: function () { return advancedRuntimeState; },
    };
});
