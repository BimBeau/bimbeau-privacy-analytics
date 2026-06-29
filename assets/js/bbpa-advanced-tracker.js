(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root, require('./bbpa-essential-tracker'), require('./bbpa-event-registry'));
    } else {
        root.BPAAdvancedTracker = factory(root, root.BPAEssentialTracker, root.BPAEventRegistry);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, essentialTracker, eventRegistryModule) {
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

    const runtimeEventRegistryConfig = resolveRuntimeObject('BPAEventRegistryConfig');
    if (!root.BPAEventRegistryConfig && runtimeEventRegistryConfig && typeof runtimeEventRegistryConfig === 'object') {
        root.BPAEventRegistryConfig = runtimeEventRegistryConfig;
    }

    const BOOTSTRAP_EVENTS = [
        'bpa:tracker:bootstrap',
        'bpa:tracker:ready',
        'bpa:advanced-tracker:retry',
    ];

    let advancedRuntimeState = ADVANCED_TRACKER_STATE.NOT_STARTED;
    let advancedRuntimeRetryCount = 0;
    let advancedRuntimeRetryTimer = null;
    let customEventTriggersStarted = false;
    let customEventTriggersBoundCount = 0;
    let activeDurationTrackingStarted = false;
    let advancedStartupCompleted = false;
    let advancedStartupCompleting = false;
    let lastAdvancedSkipReason = null;
    let lastAdvancedStartedAt = null;
    const pageViewNavigationId = 'pvnav_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    const TRIGGER_BINDING_REGISTRY_KEY = '__bpaAdvancedTriggerBindingRegistry';

    function resolveTriggerBindingRegistry() {
        if (!root[TRIGGER_BINDING_REGISTRY_KEY] || typeof root[TRIGGER_BINDING_REGISTRY_KEY] !== 'object') {
            root[TRIGGER_BINDING_REGISTRY_KEY] = {};
        }
        return root[TRIGGER_BINDING_REGISTRY_KEY];
    }

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

    function getEventRegistry() {
        const registry = eventRegistryModule || root.BPAEventRegistry || null;
        if (!root.BPAEventRegistry && registry) {
            root.BPAEventRegistry = registry;
        }
        return registry;
    }

    function getEventDispatcher() {
        return root.BPAEventDispatcher || null;
    }

    function resolveEventsActionSignalEndpoint() {
        const trackerSettings = root.BBPATracker && typeof root.BBPATracker === 'object'
            ? root.BBPATracker
            : (root.bpaSettings && typeof root.bpaSettings === 'object' ? root.bpaSettings : {});
        const restUrl = typeof trackerSettings.restUrl === 'string' ? trackerSettings.restUrl : '';
        const restNamespace = typeof trackerSettings.restNamespace === 'string' ? trackerSettings.restNamespace : '';
        if (!restUrl || !restNamespace) {
            return '';
        }

        try {
            return new URL(restNamespace.replace(/^\/+/, '') + '/events-action-signal', restUrl).toString();
        } catch (error) {
            return '';
        }
    }

    function sendEventActionSignal(eventId, actionType, status, runId, occurrenceId, context, reason, errorMessage) {
        const endpoint = resolveEventsActionSignalEndpoint();
        if (!endpoint || typeof root.fetch !== 'function') {
            return;
        }
        const safeContext = context && typeof context === 'object' ? context : {};
        const runtimeContext = {
            page_url: safeContext.page_url || (root.location && root.location.href ? root.location.href : ''),
            page_title: safeContext.page_title || (root.document && root.document.title ? root.document.title : ''),
            href: safeContext.href || '',
            element_text: safeContext.element_text || '',
            element_id: safeContext.element_id || '',
            element_classes: safeContext.element_classes || '',
            form_id: safeContext.form_id || '',
        };
        const payload = {
            event_id: typeof eventId === 'string' ? eventId : '',
            action_type: typeof actionType === 'string' ? actionType : '',
            execution_status: typeof status === 'string' ? status : '',
            run_id: typeof runId === 'string' ? runId : '',
            occurrence_id: typeof occurrenceId === 'string' ? occurrenceId : '',
            skip_reason: typeof reason === 'string' ? reason : '',
            error_message: typeof errorMessage === 'string' ? errorMessage : '',
            page_path: safeContext.pagePath || safeContext.page_path || '',
            page_url: runtimeContext.page_url,
            page_title: runtimeContext.page_title,
            event_context: runtimeContext,
        };
        root.fetch(endpoint, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(function () { return null; });
    }


    function normalizeAction(rawAction, index) {
        const action = rawAction && typeof rawAction === 'object' ? rawAction : {};
        const type = typeof action.type === 'string' && action.type !== '' ? action.type : '';
        const key = typeof action.key === 'string' && action.key !== '' ? action.key : (type !== '' ? type : 'action_' + String(index));
        const order = Number.isFinite(Number(action.order)) ? Number(action.order) : 1000;
        const enabled = !Object.prototype.hasOwnProperty.call(action, 'enabled') || action.enabled !== false;
        const meta = action.meta && typeof action.meta === 'object' ? action.meta : {};
        if (typeof action.snippet === 'string' && action.snippet !== '') { meta.snippet = action.snippet; }
        return { key: key, type: type !== '' ? type : key, order: order, enabled: enabled, handler: typeof action.handler === 'function' ? action.handler : null, params: action.params && typeof action.params === 'object' ? action.params : {}, meta: meta };
    }

    function resolveRuntimeState() {
        const runtime = root.BBPATracker || {};
        const advancedState = root.BPAAdvancedRuntime && typeof root.BPAAdvancedRuntime === 'object' ? root.BPAAdvancedRuntime : {};
        return { eventsEnabled: runtime.eventsEnabled !== false, advancedActive: advancedState.lastSkipReason !== 'runtime_unavailable' };
    }

    function isActionRuntimeAllowed() { const runtimeState = resolveRuntimeState(); return runtimeState.eventsEnabled && runtimeState.advancedActive; }
    function resolveRuntimeBlockReason() { const runtimeState = resolveRuntimeState(); if (!runtimeState.eventsEnabled) { return 'events_disabled'; } if (!runtimeState.advancedActive) { return 'advanced_runtime_unavailable'; } return ''; }

    function resolveActions(actions) {
        const actionList = Array.isArray(actions) ? actions : [];
        return actionList.map(normalizeAction).sort(function (left, right) { if (left.order === right.order) { return left.key < right.key ? -1 : 1; } return left.order - right.order; });
    }

    function dispatchEventWithFallback(eventId, context, actions) {
        const safeActions = resolveActions(actions);
        if (!isActionRuntimeAllowed()) {
            const reason = resolveRuntimeBlockReason() || 'runtime_not_allowed';
            const safeContext = context && typeof context === 'object' ? context : {};
            const runId = typeof safeContext.runId === 'string' ? safeContext.runId : '';
            const occurrenceId = typeof safeContext.occurrenceId === 'string' ? safeContext.occurrenceId : '';
            safeActions.forEach(function (action) {
                sendEventActionSignal(eventId, action.key, 'skipped', runId, occurrenceId, safeContext, reason, '');
            });
            return Promise.resolve({ eventName: eventId, status: 'blocked', actions: [] });
        }

        const safeContext = context && typeof context === 'object' ? context : {};
        const runId = typeof safeContext.runId === 'string' ? safeContext.runId : '';
        const occurrenceId = typeof safeContext.occurrenceId === 'string' ? safeContext.occurrenceId : '';
        safeActions.forEach(function (action) {
            const actionType = action && typeof action.key === 'string' ? action.key : '';
            if (!actionType) {
                return;
            }
            const enabled = action && action.enabled !== false;
            const status = enabled ? 'matched' : 'skipped';
            const reason = enabled ? '' : 'action_disabled';
            sendEventActionSignal(eventId, actionType, status, runId, occurrenceId, safeContext, reason, '');
        });
        return Promise.resolve({ eventName: eventId, status: 'fallback', actions: [] });
    }

    function resolveRuleActions(rule) {
        if (!rule || typeof rule !== 'object') {
            return [];
        }
        if (Array.isArray(rule.actions) && rule.actions.length > 0) {
            return rule.actions;
        }

        const reservedKeys = ['event', 'id', 'enabled', 'actions', 'order', 'params'];
        return Object.keys(rule).filter(function (key) {
            return reservedKeys.indexOf(key) === -1;
        }).map(function (key) {
            const value = rule[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return Object.assign({}, value, { type: key });
            }
            return { type: key, enabled: value !== false };
        });
    }

    function resolveEventActions(settings, eventName) {
        const config = settings && Array.isArray(settings.eventsConfig) ? settings.eventsConfig : [];
        return config
            .filter(function (rule) {
                return rule && typeof rule === 'object' && rule.event === eventName;
            })
            .map(function (rule, index) {
                const actions = resolveRuleActions(rule);
                return actions.map(function (rawAction, actionIndex) {
                    const action = rawAction && typeof rawAction === 'object'
                        ? rawAction
                        : { type: rawAction };
                    const actionType = typeof action.type === 'string' ? action.type : '';
                    return {
                        key: actionType,
                        order: Number.isFinite(Number(action.order))
                            ? Number(action.order)
                            : Number(rule.order || 0) + actionIndex,
                        enabled: rule.enabled === true && action.enabled !== false,
                        meta: {
                            configIndex: index,
                            params: action && typeof action.params === 'object' && action.params !== null ? action.params : {},
                        },
                    };
                }).filter(function (action) {
                    return action.key !== '';
                });
            })
            .reduce(function (flattened, actions) {
                return flattened.concat(actions);
            }, []);
    }

    function getAllowedParamsForEvent(eventName, settings) {
        const eventRegistry = getEventRegistry();
        if (!eventRegistry || typeof eventRegistry.resolveAllowedParams !== 'function') {
            return [];
        }

        return eventRegistry.resolveAllowedParams(eventName, settings || {});
    }

    function sanitizeTriggerConfig(trigger) {
        const source = trigger && typeof trigger === 'object' ? trigger : {};
        const rawType = typeof source.type === 'string' ? source.type : 'click';
        const type = ['click', 'page_view', 'webhook', 'form_submit', 'interaction'].indexOf(rawType) >= 0 ? rawType : 'click';
        return {
            type: type,
            selector: typeof source.selector === 'string' ? source.selector.trim() : '',
            form_selector: typeof source.form_selector === 'string' ? source.form_selector.trim() : '',
            url_pattern: typeof source.url_pattern === 'string' ? source.url_pattern.trim() : '',
            once_per_page: source.once_per_page === true,
            debounce_ms: Math.max(0, Math.min(60000, Number(source.debounce_ms) || 0)),
        };
    }
    function resolveTriggerDebugMeta(eventId, trigger) {
        return {
            event_id: eventId,
            trigger_type: trigger.type,
            selector: trigger.selector || '',
            debounce_ms: trigger.debounce_ms,
            once_per_page: trigger.once_per_page === true,
        };
    }

    function buildBaseTriggerContext(eventId, triggerType, pagePath) {
        const resolvedPagePath = pagePath || (root.location && root.location.pathname ? root.location.pathname : '');
        return {
            eventName: eventId,
            triggerType: triggerType,
            trigger_type: triggerType,
            pagePath: resolvedPagePath,
            page_path: resolvedPagePath,
            page_url: root.location && root.location.href ? root.location.href : '',
            page_title: root.document && root.document.title ? root.document.title : '',
        };
    }

    function buildClickElementContext(element) {
        const safeElement = element && typeof element === 'object' ? element : null;
        const linkElement = safeElement && typeof safeElement.closest === 'function'
            ? safeElement.closest('a[href]')
            : null;

        const href = safeElement && typeof safeElement.href === 'string' && safeElement.href !== ''
            ? safeElement.href
            : (linkElement && typeof linkElement.href === 'string' ? linkElement.href : '');
        const text = safeElement ? String(safeElement.innerText || safeElement.textContent || '').trim() : '';

        return {
            href: href,
            element_text: text,
            element_id: safeElement && typeof safeElement.id === 'string' ? safeElement.id : '',
            element_classes: safeElement && safeElement.classList && typeof safeElement.classList.value === 'string'
                ? safeElement.classList.value
                : (safeElement && typeof safeElement.className === 'string' ? safeElement.className : ''),
        };
    }

    function resolveEventsTriggerSignalEndpoint() {
        const trackerSettings = root.BBPATracker && typeof root.BBPATracker === 'object'
            ? root.BBPATracker
            : (root.bpaSettings && typeof root.bpaSettings === 'object' ? root.bpaSettings : {});
        const restUrl = typeof trackerSettings.restUrl === 'string' ? trackerSettings.restUrl : '';
        const restNamespace = typeof trackerSettings.restNamespace === 'string' ? trackerSettings.restNamespace : '';
        if (!restUrl || !restNamespace) {
            return '';
        }

        try {
            return new URL(restNamespace.replace(/^\/+/, '') + '/events-trigger-signal', restUrl).toString();
        } catch (error) {
            return '';
        }
    }

    function getDedupeScopeId() {
        const trackerCore = getTrackerCore();
        const trackerSettings = root.BBPATracker && typeof root.BBPATracker === 'object'
            ? root.BBPATracker
            : {};
        const candidateVisitId = trackerCore && typeof trackerCore.resolveOrCreateEnrichedVisitId === 'function'
            ? trackerCore.resolveOrCreateEnrichedVisitId(trackerSettings)
            : '';
        const visitId = typeof candidateVisitId === 'string' ? candidateVisitId.trim() : '';
        if (visitId !== '') {
            return { visit_id: visitId, dedupe_scope_id: 'visit:' + visitId };
        }

        const storageKey = 'bbpa_trigger_session_id';
        let triggerSessionId = '';
        if (root.sessionStorage && typeof root.sessionStorage.getItem === 'function') {
            try {
                triggerSessionId = String(root.sessionStorage.getItem(storageKey) || '').trim();
                if (triggerSessionId === '') {
                    triggerSessionId = 'ts_' + Math.random().toString(36).slice(2, 12);
                    if (typeof root.sessionStorage.setItem === 'function') {
                        root.sessionStorage.setItem(storageKey, triggerSessionId);
                    }
                }
            } catch (error) {
                triggerSessionId = '';
            }
        }

        if (triggerSessionId !== '') {
            return { trigger_session_id: triggerSessionId, dedupe_scope_id: 'session:' + triggerSessionId };
        }

        return { dedupe_scope_id: '' };
    }

    function sendEventTriggerSignal(eventId, triggerType, pagePath, hasEnabledAction, occurrenceId, runId, context) {
        const endpoint = resolveEventsTriggerSignalEndpoint();
        if (!endpoint) {
            return;
        }

        const payload = {
            event_id: typeof eventId === 'string' ? eventId : '',
            trigger_type: typeof triggerType === 'string' ? triggerType : '',
            page_path: typeof pagePath === 'string' ? pagePath : '',
            has_enabled_action: hasEnabledAction === true,
            occurrence_id: typeof occurrenceId === 'string' ? occurrenceId : '',
            run_id: typeof runId === 'string' ? runId : '',
            triggered_at: new Date().toISOString(),
        };

        const safeContext = context && typeof context === 'object' ? context : {};
        const runtimeContext = {
            page_url: typeof safeContext.page_url === 'string' && safeContext.page_url !== ''
                ? safeContext.page_url
                : (root.location && root.location.href ? root.location.href : ''),
            page_title: typeof safeContext.page_title === 'string' && safeContext.page_title !== ''
                ? safeContext.page_title
                : (root.document && root.document.title ? root.document.title : ''),
            href: typeof safeContext.href === 'string' ? safeContext.href : '',
            element_text: typeof safeContext.element_text === 'string' ? safeContext.element_text : '',
            element_id: typeof safeContext.element_id === 'string' ? safeContext.element_id : '',
            element_classes: typeof safeContext.element_classes === 'string' ? safeContext.element_classes : '',
            form_id: typeof safeContext.form_id === 'string' ? safeContext.form_id : '',
        };
        payload.page_url = runtimeContext.page_url;
        payload.page_title = runtimeContext.page_title;
        payload.href = runtimeContext.href;
        payload.element_text = runtimeContext.element_text;
        payload.element_id = runtimeContext.element_id;
        payload.element_classes = runtimeContext.element_classes;
        payload.form_id = runtimeContext.form_id;
        payload.event_context = runtimeContext;
        payload.page_view_navigation_id = typeof safeContext.page_view_navigation_id === 'string' ? safeContext.page_view_navigation_id : '';
        const scopePayload = getDedupeScopeId();
        if (scopePayload.visit_id) {
            payload.visit_id = scopePayload.visit_id;
        }
        if (scopePayload.trigger_session_id) {
            payload.trigger_session_id = scopePayload.trigger_session_id;
        }
        payload.dedupe_scope_id = scopePayload.dedupe_scope_id;

        if (typeof root.navigator === 'object' && typeof root.navigator.sendBeacon === 'function') {
            try {
                const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                if (root.navigator.sendBeacon(endpoint, body)) {
                    return;
                }
            } catch (error) {
                // Fall back to fetch when sendBeacon serialization fails.
            }
        }

        if (typeof root.fetch !== 'function') {
            return;
        }

        root.fetch(endpoint, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(function () {
            return null;
        });
    }

    function resolveSelectorCandidates(selector) {
        const normalizedSelector = typeof selector === 'string' ? selector.trim() : '';
        if (!normalizedSelector) {
            return [];
        }

        const candidates = [normalizedSelector];
        if (normalizedSelector.charAt(0) === '-') {
            candidates.push('.' + normalizedSelector.slice(1));
        }
        return candidates;
    }


    function normalizeConfiguredEventId(eventItem) {
        const candidateKeys = ['id', 'event', 'event_id', 'event_name'];
        for (let index = 0; index < candidateKeys.length; index += 1) {
            const key = candidateKeys[index];
            const value = eventItem && typeof eventItem[key] === 'string' ? eventItem[key].trim() : '';
            if (value !== '') {
                return value;
            }
        }

        return '';
    }

    function describeMatchedElement(element) {
        if (!element || typeof element !== 'object') {
            return { matched_tag: '', matched_id: '', matched_classes: '' };
        }

        return {
            matched_tag: typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '',
            matched_id: typeof element.id === 'string' ? element.id : '',
            matched_classes: element.classList && typeof element.classList.value === 'string'
                ? element.classList.value
                : (typeof element.className === 'string' ? element.className : ''),
        };
    }

    function bindConfiguredEventTriggers(settings) {
        if (customEventTriggersStarted || !root.document || !root.document.addEventListener) {
            return customEventTriggersBoundCount;
        }
        const eventsConfig = settings && Array.isArray(settings.eventsConfig) ? settings.eventsConfig : [];
        if (eventsConfig.length === 0) {
            return 0;
        }
        const pageHits = {};
        const debounceMap = {};
        const bindingRegistry = resolveTriggerBindingRegistry();
        let boundCount = 0;
        eventsConfig.forEach(function (eventItem) {
            if (!eventItem || typeof eventItem !== 'object' || eventItem.enabled !== true) {
                debugLog(settings, '[LS] event_disabled', { event_id: '', trigger_type: '', selector: '' });
                return;
            }
            const eventId = normalizeConfiguredEventId(eventItem);
            if (!eventId) {
                debugLog(settings, '[LS] missing_event_id', {
                    event_id: '',
                    trigger_type: eventItem.trigger && typeof eventItem.trigger.type === 'string' ? eventItem.trigger.type : '',
                    selector: eventItem.trigger && typeof eventItem.trigger.selector === 'string' ? eventItem.trigger.selector : '',
                });
                return;
            }
            const trigger = sanitizeTriggerConfig(eventItem.trigger || {});
            const bindingKey = [eventId, trigger.type, trigger.selector || '', trigger.form_selector || '', trigger.url_pattern || ''].join('::');
            if (bindingRegistry[bindingKey] === true) {
                debugLog(settings, '[LS] trigger_binding_skipped', Object.assign({}, resolveTriggerDebugMeta(eventId, trigger), { reason: 'already_bound' }));
                return;
            }
            const actions = Array.isArray(eventItem.actions) ? eventItem.actions : resolveRuleActions(eventItem);
            debugLog(settings, '[LS] trigger_binding_config', resolveTriggerDebugMeta(eventId, trigger));
            const dispatchWithGuards = function (context) {
                const debounceKey = eventId + '::' + trigger.type;
                const now = Date.now();
                if (trigger.once_per_page && pageHits[debounceKey]) {
                    debugLog(settings, '[LS] dispatch_blocked', Object.assign({}, resolveTriggerDebugMeta(eventId, trigger), { block_reason: 'once_per_page_already_dispatched' }));
                    return;
                }
                if (trigger.debounce_ms > 0 && debounceMap[debounceKey] && (now - debounceMap[debounceKey]) < trigger.debounce_ms) {
                    debugLog(settings, '[LS] dispatch_blocked', Object.assign({}, resolveTriggerDebugMeta(eventId, trigger), { block_reason: 'debounce_window_active' }));
                    return;
                }
                pageHits[debounceKey] = true;
                debounceMap[debounceKey] = now;
                const signalContext = context && typeof context === 'object' ? context : {};
                const resolvedPagePath = typeof signalContext.pagePath === 'string'
                    ? signalContext.pagePath
                    : (root.location && root.location.pathname ? root.location.pathname : '');
                const hasEnabledAction = actions.some(function (action) {
                    return action && typeof action === 'object' && action.enabled !== false;
                });
                const runtimeRunId = settings && typeof settings.debugRunId === 'string' ? settings.debugRunId : '';
                const runId = runtimeRunId || String(now);
                const occurrenceId = [eventId, trigger.type, String(now), Math.random().toString(36).slice(2, 10)].join('::');
                const contextWithNavigation = Object.assign({}, context || {});
                if (trigger.type === 'page_view') {
                    contextWithNavigation.page_view_navigation_id = pageViewNavigationId;
                }
                debugLog(settings, '[LS] dispatch_requested', { event_id: eventId, actions_count: actions.length, occurrence_id: occurrenceId, run_id: runId });
                const activeDispatcher = getEventDispatcher();
                const hasRuntimeDispatcher = !!(activeDispatcher && typeof activeDispatcher.dispatchEvent === 'function');
                try {
                    if (hasRuntimeDispatcher) {
                        activeDispatcher.dispatchEvent(eventId, Object.assign({}, contextWithNavigation, { occurrenceId: occurrenceId, runId: runId }), actions);
                    } else {
                        dispatchEventWithFallback(eventId, Object.assign({}, contextWithNavigation, { occurrenceId: occurrenceId, runId: runId }), actions);
                    }
                    debugLog(settings, '[LS] dispatch_completed', { run_id: runId, event_id: eventId, status: 'completed' });
                } catch (error) {
                    debugLog(settings, '[LS] dispatch_failed', {
                        run_id: runId,
                        event_id: eventId,
                        status: 'failed',
                        error_message: error && error.message ? String(error.message) : '',
                    });
                }
                if (!hasRuntimeDispatcher) {
                    sendEventTriggerSignal(eventId, trigger.type, resolvedPagePath, hasEnabledAction, occurrenceId, runId, contextWithNavigation);
                }
            };

            if (trigger.type === 'webhook') {
                return;
            }
            if (trigger.type === 'page_view') {
                boundCount += 1;
                bindingRegistry[bindingKey] = true;
                const path = root.location && root.location.pathname ? root.location.pathname : '';
                if (!trigger.url_pattern || path.indexOf(trigger.url_pattern) !== -1) {
                    dispatchWithGuards(buildBaseTriggerContext(eventId, 'page_view', path));
                }
                return;
            }
            // form_submit remains for legacy runtime compatibility only.
            const eventName = trigger.type === 'form_submit' ? 'submit' : (trigger.type === 'click' ? 'click' : 'input');
            root.document.addEventListener(eventName, function (domEvent) {
                const rawTarget = domEvent && domEvent.target ? domEvent.target : null;
                const targetNode = rawTarget && typeof rawTarget.closest === 'function'
                    ? rawTarget
                    : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
                const selectorSource = trigger.type === 'form_submit' ? (trigger.form_selector || trigger.selector || '') : trigger.selector;
                let target = null;
                if (selectorSource) {
                    const selectorCandidates = resolveSelectorCandidates(selectorSource);
                    for (let index = 0; index < selectorCandidates.length; index += 1) {
                        const selectorCandidate = selectorCandidates[index];
                        if (!targetNode || typeof targetNode.closest !== 'function') {
                            break;
                        }
                        try {
                            target = targetNode.closest(selectorCandidate);
                        } catch (error) {
                            target = null;
                            continue;
                        }
                        if (target) {
                            break;
                        }
                    }
                    if (!target) {
                        debugLog(settings, '[LS] selector_no_match', { event_id: eventId, trigger_type: trigger.type, selector: selectorSource || '' });
                        return;
                    }
                    const matchedMeta = describeMatchedElement(target);
                    debugLog(settings, '[LS] trigger_matched', {
                        event_id: eventId,
                        trigger_type: trigger.type,
                        selector: selectorSource || '',
                        matched_tag: matchedMeta.matched_tag,
                        matched_id: matchedMeta.matched_id,
                        matched_classes: matchedMeta.matched_classes,
                    });
                }
                const pagePath = root.location && root.location.pathname ? root.location.pathname : '';
                const baseContext = buildBaseTriggerContext(eventId, trigger.type, pagePath);
                if (trigger.type === 'click') {
                    const clickContext = buildClickElementContext(target || targetNode || rawTarget);
                    dispatchWithGuards(Object.assign({}, baseContext, clickContext, { selector: trigger.selector || '' }));
                    return;
                }
                if (trigger.type === 'form_submit') {
                    const formElement = target || targetNode || rawTarget;
                    const formId = formElement && typeof formElement.id === 'string' ? formElement.id : '';
                    dispatchWithGuards(Object.assign({}, baseContext, { form_id: formId, selector: selectorSource || '' }));
                    return;
                }
                dispatchWithGuards(baseContext);
            }, { passive: true, capture: true });
            bindingRegistry[bindingKey] = true;
            boundCount += 1;
        });
        if (boundCount > 0) {
            customEventTriggersStarted = true;
            customEventTriggersBoundCount = boundCount;
            lastAdvancedSkipReason = null;
        } else {
            customEventTriggersStarted = false;
            customEventTriggersBoundCount = 0;
        }
        return customEventTriggersBoundCount;
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
            allowed_event_params: getAllowedParamsForEvent(eventName, settings),
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

        dispatchEventWithFallback(eventName, {
                eventName: eventName,
                bpaPayload: payload,
                params: payload.allowed_event_params,
            }, resolveEventActions(settings, eventName));

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





    function initDispatcherSignalBridge() {
        if (!root || root.BPAAdvancedSignalBridgeBound === true) {
            return;
        }
        root.BPAAdvancedSignalBridgeBound = true;

        function resolveSignalEndpoint(kind) {
            const settings = root.BBPATracker || {};
            if (typeof settings.restUrl !== 'string' || typeof settings.restNamespace !== 'string' || settings.restUrl === '' || settings.restNamespace === '') {
                return '';
            }
            try {
                return new URL(settings.restNamespace.replace(/^\/+/, '') + '/events-' + kind + '-signal', settings.restUrl).toString();
            } catch (error) {
                return '';
            }
        }

        function postSignal(kind, payload) {
            const endpoint = resolveSignalEndpoint(kind);
            if (!endpoint || typeof root.fetch !== 'function') {
                return Promise.resolve();
            }
            return root.fetch(endpoint, {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
            }).catch(function () { return null; });
        }

        const dispatcher = getEventDispatcher();
        if (!dispatcher || typeof dispatcher.dispatchEvent !== 'function') {
            return;
        }

        const originalDispatch = dispatcher.dispatchEvent.bind(dispatcher);
        dispatcher.dispatchEvent = function (eventName, context, actions) {
            const safeContext = context && typeof context === 'object' ? context : {};
            const eventId = typeof eventName === 'string' ? eventName : '';
            return originalDispatch(eventName, context, actions).then(function (status) {
                const actionRows = status && Array.isArray(status.actions) ? status.actions : [];
                const actionStatus = actionRows.some((item) => item && item.status === 'executed') ? 'executed'
                    : (actionRows.some((item) => item && item.status === 'error') ? 'error'
                        : (actionRows.some((item) => item && item.status === 'skipped') ? 'skipped' : 'no_action'));
                const executionStatus = actionStatus === 'executed' ? 'executed' : (actionStatus === 'error' ? 'failed' : (actionStatus === 'skipped' ? 'skipped' : 'matched'));
                const runtimeContext = {
                    page_url: safeContext.page_url || (root.location && root.location.href ? root.location.href : ''),
                    page_title: safeContext.page_title || (root.document && root.document.title ? root.document.title : ''),
                    href: safeContext.href || '',
                    element_text: safeContext.element_text || '',
                    element_id: safeContext.element_id || '',
                    element_classes: safeContext.element_classes || '',
                    form_id: safeContext.form_id || '',
                };
                postSignal('trigger', {
                    event_id: eventId,
                    trigger_type: safeContext.triggerType || safeContext.trigger_type || '',
                    page_path: safeContext.pagePath || safeContext.page_path || '',
                    action_status: actionStatus,
                    execution_status: executionStatus,
                    has_enabled_action: actionRows.length > 0,
                    skip_reason: actionStatus === 'skipped' && actionRows[0] && actionRows[0].reason ? actionRows[0].reason : '',
                    error_message: actionStatus === 'error' && actionRows[0] && actionRows[0].errorMessage ? actionRows[0].errorMessage : '',
                    page_url: runtimeContext.page_url,
                    page_title: runtimeContext.page_title,
                    href: runtimeContext.href,
                    element_text: runtimeContext.element_text,
                    element_id: runtimeContext.element_id,
                    element_classes: runtimeContext.element_classes,
                    form_id: runtimeContext.form_id,
                    event_context: runtimeContext,
                });
                return status;
            });
        };
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
        const eventsConfig = Array.isArray(trackerSettings.eventsConfig) ? trackerSettings.eventsConfig : [];
        root.BPARuntimeStatus = {
            essentialReady: root.BPAEssentialReady === true,
            essentialApiReady: hasEssentialPublicApi(),
            trackerConfigReady: !!(trackerSettings && trackerSettings.restUrl && trackerSettings.restNamespace),
            advancedLoaded: true,
            advancedState: advancedRuntimeState,
            advancedBlockedReason: lastAdvancedSkipReason,
            advancedRetryCount: advancedRuntimeRetryCount,
            lastAdvancedSkipReason: lastAdvancedSkipReason,
            eventsEnabled: trackerSettings.eventsEnabled === true,
            advancedStatsEnabled: trackerSettings.advanced_stats_enabled !== false,
            eventsConfigCount: eventsConfig.length,
            triggersBound: customEventTriggersStarted === true,
            triggersBoundCount: customEventTriggersBoundCount,
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
        if (advancedStartupCompleted && (settings.eventsEnabled !== true || customEventTriggersStarted === true)) {
            return;
        }
        initActiveDurationTracking(settings);
        debugLog(settings, 'Advanced triggers binding started');
        const boundCount = bindConfiguredEventTriggers(settings);
        initDispatcherSignalBridge();
        advancedStartupCompleted = true;
        if (boundCount > 0) {
            debugLog(settings, 'Advanced triggers bound: ' + String(boundCount));
        } else {
            debugLog(settings, 'Advanced no eventsConfig found');
        }
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
            const settings = root.BBPATracker || {};
            if (settings.eventsEnabled === true && customEventTriggersStarted !== true) {
                bindConfiguredEventTriggers(settings);
                updateRuntimeStatus(settings);
            }
            return;
        }
        debugLog(root.BBPATracker || {}, 'Advanced boot attempt', {
            retryCount: advancedRuntimeRetryCount,
            state: advancedRuntimeState,
        });

        if (!hasEssentialPublicApi()) {
            getEventRegistry();
            if (!root.BPAActionRegistry) {
                root.BPAActionRegistry = {
                    resolveActions: resolveActions,
                    isActionRuntimeAllowed: isActionRuntimeAllowed,
                    resolveRuntimeState: resolveRuntimeState,
                    resolveRuntimeBlockReason: resolveRuntimeBlockReason,
                };
            }
            if (!root.BPAEventDispatcher) {
                root.BPAEventDispatcher = { dispatchEvent: dispatchEventWithFallback };
            }
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
        const settings = root.BBPATracker || {};
        return advancedRuntimeState !== ADVANCED_TRACKER_STATE.STARTED
            || (settings.eventsEnabled === true && customEventTriggersStarted !== true);
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
