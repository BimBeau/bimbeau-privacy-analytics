(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root, require('./bbpa-action-registry'));
    } else {
        root.BPAEventDispatcher = factory(root, root.BPAActionRegistry);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, actionRegistryModule) {
    const DATA_LAYER_ACTION_KEY = 'datalayer_push';

    const GTAG_EVENT_ACTION_KEY = 'gtag_event';

    const WEBHOOK_ACTION_KEY = 'webhook';
    const CUSTOM_CALLBACK_ACTION_KEY = 'custom_callback';

    const TRACKING_SNIPPET_ACTION_KEY = 'tracking_snippet';
    const ACTION_RUNTIME_DEBUG_PREFIX = '[BimBeau Privacy Analytics][ActionRuntime]';
    const ACTION_STATUS_CANONICAL = {
        no_action: 'no_action',
        skipped: 'skipped',
        executed: 'executed',
        error: 'error',
    };
    const ACTION_STATUS_LEGACY_TO_CANONICAL = {
        success: ACTION_STATUS_CANONICAL.executed,
        failed: ACTION_STATUS_CANONICAL.error,
    };


    const TRIGGER_ALLOWED_VARIABLES = {
        page_view: ['page_url', 'page_title'],
        click: ['page_url', 'page_title', 'href', 'element_text', 'element_id', 'element_classes'],
        form_submit: ['page_url', 'page_title', 'form_id'],
    };

    function getTriggerType(context, actionMeta) {
        const safeContext = context && typeof context === 'object' ? context : {};
        const safeActionMeta = actionMeta && typeof actionMeta === 'object' ? actionMeta : {};

        if (typeof safeContext.trigger_type === 'string' && safeContext.trigger_type !== '') {
            return safeContext.trigger_type;
        }

        if (typeof safeContext.triggerType === 'string' && safeContext.triggerType !== '') {
            return safeContext.triggerType;
        }

        return typeof safeActionMeta.triggerType === 'string' ? safeActionMeta.triggerType : '';
    }

    function shouldUseStrictTriggerValidation(context, actionMeta) {
        const safeContext = context && typeof context === 'object' ? context : {};
        const safeActionMeta = actionMeta && typeof actionMeta === 'object' ? actionMeta : {};
        const debugMode = safeContext.debug === true || safeContext.debugMode === true;

        if (typeof safeActionMeta.strictTriggerValidation === 'boolean') {
            return safeActionMeta.strictTriggerValidation;
        }

        if (typeof safeContext.strictTriggerValidation === 'boolean') {
            return safeContext.strictTriggerValidation;
        }

        return debugMode;
    }

    function firstPresentString() {
        for (let index = 0; index < arguments.length; index += 1) {
            const value = arguments[index];
            if (value === null || typeof value === 'undefined') {
                continue;
            }
            const normalized = String(value);
            if (normalized.trim() !== '') {
                return normalized;
            }
        }
        return '';
    }

    function getCurrentPageUrl() {
        return root.location && typeof root.location.href === 'string'
            ? root.location.href
            : '';
    }

    function getCurrentPageTitle() {
        return root.document && typeof root.document.title === 'string'
            ? root.document.title
            : '';
    }

    function collectVariablesFromContext(context) {
        const safeContext = context && typeof context === 'object' ? context : {};

        return {
            page_url: firstPresentString(safeContext.page_url, safeContext.pageUrl, safeContext.url, getCurrentPageUrl()),
            page_title: firstPresentString(safeContext.page_title, safeContext.pageTitle, safeContext.title, getCurrentPageTitle()),
            href: firstPresentString(safeContext.href, safeContext.element_href, safeContext.elementHref),
            element_text: firstPresentString(safeContext.element_text, safeContext.elementText, safeContext.text),
            element_id: firstPresentString(safeContext.element_id, safeContext.elementId),
            element_classes: firstPresentString(safeContext.element_classes, safeContext.elementClasses, safeContext.classes),
            form_id: firstPresentString(safeContext.form_id, safeContext.formId),
        };
    }

    function isPresentValue(value) {
        if (value === null || typeof value === 'undefined') {
            return false;
        }

        return String(value).trim() !== '';
    }

    function normalizeSnippetSource(snippet) {
        if (typeof snippet !== 'string' || snippet === '') {
            return '';
        }

        return snippet
            .replace(/\r\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t');
    }

    function interpolateSnippet(snippet, context, triggerConfig) {
        if (typeof snippet !== 'string' || snippet === '') {
            return { snippet: '', unresolvedPlaceholders: [] };
        }

        const config = triggerConfig && typeof triggerConfig === 'object' ? triggerConfig : {};
        const variables = collectVariablesFromContext(context);
        const allowedVariables = Array.isArray(config.allowedVariables) ? config.allowedVariables : [];
        const strictValidation = config.strictValidation === true;
        const unresolvedPlaceholders = [];
        const disallowedPlaceholders = [];
        const missingVariables = [];

        const interpolatedSnippet = snippet.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (match, variableName) {
            if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
                unresolvedPlaceholders.push(variableName);
                return '';
            }

            if (allowedVariables.indexOf(variableName) === -1) {
                disallowedPlaceholders.push(variableName);
                return JSON.stringify('');
            }

            const value = variables[variableName];
            if (!isPresentValue(value)) {
                missingVariables.push(variableName);
                return JSON.stringify('');
            }

            return JSON.stringify(String(value));
        });

        return {
            snippet: interpolatedSnippet,
            unresolvedPlaceholders: unresolvedPlaceholders,
            disallowedPlaceholders: disallowedPlaceholders,
            missingVariables: missingVariables,
            resolvedVariables: variables,
        };
    }
    const HTTPS_PROTOCOL = 'https:';
    const SAFE_CALLBACK_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;

    function sanitizeObjectParams(rawParams, allowedParams) {
        if (!rawParams || typeof rawParams !== 'object') {
            return {};
        }

        const allowlist = Array.isArray(allowedParams) ? allowedParams : [];

        if (allowlist.length === 0) {
            return {};
        }

        return allowlist.reduce(function (accumulator, paramKey) {
            if (typeof paramKey !== 'string' || paramKey === '') {
                return accumulator;
            }

            if (!Object.prototype.hasOwnProperty.call(rawParams, paramKey)) {
                return accumulator;
            }

            accumulator[paramKey] = rawParams[paramKey];
            return accumulator;
        }, {});
    }


    function buildWebhookPayload(context, actionMeta) {
        const safeContext = context && typeof context === 'object' ? context : {};
        const params = sanitizeObjectParams(
            safeContext.params,
            Array.isArray(actionMeta.allowedParams) ? actionMeta.allowedParams : []
        );

        return {
            event_name: typeof safeContext.eventName === 'string' ? safeContext.eventName : '',
            source: 'advanced_runtime',
            action_key: actionMeta && typeof actionMeta.actionKey === 'string' ? actionMeta.actionKey : '',
            params: params,
        };
    }

    function createTimeoutController(timeoutMs) {
        if (typeof root.AbortController !== 'function') {
            return { controller: null, timerId: null };
        }

        const controller = new root.AbortController();
        const timerId = Number.isFinite(timeoutMs) && timeoutMs > 0
            ? root.setTimeout(function () {
                controller.abort();
            }, timeoutMs)
            : null;

        return { controller: controller, timerId: timerId };
    }

    function isValidHttpsUrl(candidateUrl) {
        if (typeof candidateUrl !== 'string' || candidateUrl === '') {
            return false;
        }

        try {
            return new URL(candidateUrl, root.location && root.location.href ? root.location.href : undefined).protocol === HTTPS_PROTOCOL;
        } catch (error) {
            return false;
        }
    }

    function getActionRegistry() {
        return actionRegistryModule || root.BPAActionRegistry || null;
    }

    
    function resolveActionSignalEndpoint() {
        const trackerSettings = root.BBPATracker && typeof root.BBPATracker === 'object'
            ? root.BBPATracker
            : (root.bpaSettings && typeof root.bpaSettings === 'object' ? root.bpaSettings : {});
        const restUrl = typeof trackerSettings.restUrl === 'string' ? trackerSettings.restUrl : '';
        const restNamespace = typeof trackerSettings.restNamespace === 'string' ? trackerSettings.restNamespace : '';

        if (!restUrl || !restNamespace) {
            const legacyRestUrl = root.bpaSettings && typeof root.bpaSettings.restUrl === 'string'
                ? root.bpaSettings.restUrl
                : '';
            if (!legacyRestUrl) {
                return '';
            }
            return legacyRestUrl.replace(/\/+$/, '') + '/events-action-signal';
        }

        try {
            return new URL(restNamespace.replace(/^\/+/, '') + '/events-action-signal', restUrl).toString();
        } catch (error) {
            return '';
        }
    }

    function ensureDataLayer() {
        root.dataLayer = Array.isArray(root.dataLayer) ? root.dataLayer : [];
        return root.dataLayer;
    }

    function buildBPADataLayerPayload(context, actionMeta) {
        const safeContext = context && typeof context === 'object' ? context : {};
        const bpaPayload = safeContext.bpaPayload && typeof safeContext.bpaPayload === 'object'
            ? safeContext.bpaPayload
            : {};

        return {
            event: 'bbpa_event',
            bpa: {
                event_name: typeof safeContext.eventName === 'string' ? safeContext.eventName : '',
                source: 'advanced_runtime',
                action_key: actionMeta && typeof actionMeta.actionKey === 'string' ? actionMeta.actionKey : '',
                params: safeContext.params && typeof safeContext.params === 'object' ? safeContext.params : {},
                payload: bpaPayload,
            },
        };
    }


    function resolveNamedCallbackHandler(action) {
        const actionMeta = action && action.meta && typeof action.meta === 'object' ? action.meta : {};
        const callbackName = typeof actionMeta.callback === 'string' ? actionMeta.callback : '';

        if (callbackName === '' || !SAFE_CALLBACK_NAME_PATTERN.test(callbackName)) {
            return null;
        }

        const callbackRegistry = root.BPAEventCallbacks && typeof root.BPAEventCallbacks === 'object'
            ? root.BPAEventCallbacks
            : null;

        if (!callbackRegistry || !Object.prototype.hasOwnProperty.call(callbackRegistry, callbackName)) {
            return null;
        }

        const callbackHandler = callbackRegistry[callbackName];

        if (typeof callbackHandler !== 'function') {
            return null;
        }

        return callbackHandler;
    }

    function resolveActionHandler(action) {
        if (typeof action.handler === 'function') {
            return action.handler;
        }

        const namedCallbackHandler = resolveNamedCallbackHandler(action);

        if (typeof namedCallbackHandler === 'function') {
            return namedCallbackHandler;
        }

        if (action.key === DATA_LAYER_ACTION_KEY) {
            return function (context, actionMeta) {
                const payload = buildBPADataLayerPayload(context, actionMeta);
                ensureDataLayer().push(payload);
                return {
                    pushed: true,
                    target: 'window.dataLayer',
                    event: payload.event,
                };
            };
        }


        if (action.key === WEBHOOK_ACTION_KEY) {
            return function (context) {
                const safeContext = context && typeof context === 'object' ? context : {};
                const actionMeta = action && action.meta && typeof action.meta === 'object' ? action.meta : {};
                const webhookUrl = typeof actionMeta.webhookUrl === 'string' ? actionMeta.webhookUrl : '';
                const isHttpsWebhook = isValidHttpsUrl(webhookUrl);

                if (webhookUrl === '' || !isHttpsWebhook || typeof root.fetch !== 'function') {
                    return {
                        pushed: false,
                        target: webhookUrl,
                        status: 'skipped',
                        reason: webhookUrl === ''
                            ? 'missing_webhook_url'
                            : (!isHttpsWebhook ? 'https_required' : 'fetch_unavailable'),
                    };
                }

                const timeoutMs = Number.isFinite(Number(actionMeta.timeoutMs)) ? Number(actionMeta.timeoutMs) : 5000;
                const timeoutControl = createTimeoutController(timeoutMs);
                const payload = buildWebhookPayload(safeContext, {
                    actionKey: action.key,
                    allowedParams: Array.isArray(actionMeta.allowedParams) ? actionMeta.allowedParams : [],
                });

                return root.fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: timeoutControl.controller ? timeoutControl.controller.signal : undefined,
                }).then(function (response) {
                    if (timeoutControl.timerId !== null) {
                        root.clearTimeout(timeoutControl.timerId);
                    }

                    if (!response || response.ok !== true) {
                        return {
                            pushed: false,
                            target: webhookUrl,
                            status: 'error',
                            reason: 'http_error',
                            httpStatus: response && Number.isFinite(response.status) ? response.status : null,
                        };
                    }

                    return {
                        pushed: true,
                        target: webhookUrl,
                        status: 'success',
                        httpStatus: response.status,
                    };
                }).catch(function (error) {
                    if (timeoutControl.timerId !== null) {
                        root.clearTimeout(timeoutControl.timerId);
                    }

                    const isTimeout = error && (error.name === 'AbortError' || error.code === 20);

                    return {
                        pushed: false,
                        target: webhookUrl,
                        status: 'error',
                        reason: isTimeout ? 'timeout' : 'network_error',
                        errorMessage: error && error.message ? String(error.message) : 'Unknown webhook error',
                    };
                });
            };
        }



        if (action.key === CUSTOM_CALLBACK_ACTION_KEY) {
            return function (context, actionMeta) {
                const callbackName = actionMeta && typeof actionMeta.callback === 'string' ? actionMeta.callback : '';
                const namedCallbackHandler = resolveNamedCallbackHandler(action);

                if (typeof namedCallbackHandler !== 'function') {
                    return {
                        pushed: false,
                        status: 'skipped_missing_callback',
                        reason: 'missing_callback',
                        callback: callbackName,
                    };
                }

                return namedCallbackHandler(context, actionMeta);
            };
        }


        if (action.key === TRACKING_SNIPPET_ACTION_KEY) {
            return function (context) {
                const actionMeta = action && action.meta && typeof action.meta === 'object' ? action.meta : {};
                const snippet = typeof actionMeta.snippet === 'string' ? actionMeta.snippet : '';

                if (snippet.trim() === '') {
                    return {
                        pushed: false,
                        status: 'skipped',
                        reason: 'empty_snippet',
                        skip_reason: 'empty_snippet',
                    };
                }

                const triggerType = getTriggerType(context, actionMeta);
                const allowedVariables = Object.prototype.hasOwnProperty.call(TRIGGER_ALLOWED_VARIABLES, triggerType)
                    ? TRIGGER_ALLOWED_VARIABLES[triggerType]
                    : [];
                const strictValidation = shouldUseStrictTriggerValidation(context, actionMeta);
                const normalizedSnippet = normalizeSnippetSource(snippet);
                const interpolationResult = interpolateSnippet(normalizedSnippet, context, {
                    allowedVariables: allowedVariables,
                    strictValidation: strictValidation,
                });
                const executableSnippet = interpolationResult.snippet;
                const missingVariables = allowedVariables.filter(function (variableName) {
                    return !isPresentValue(interpolationResult.resolvedVariables[variableName]);
                });
                const telemetry = {
                    event_id: typeof (context && context.eventName) === 'string' ? context.eventName : '',
                    action_id: action && typeof action.key === 'string' ? action.key : '',
                    trigger_type: triggerType,
                    resolved_variables: interpolationResult.resolvedVariables,
                    missing_variables: missingVariables,
                    skip_reason: null,
                    fallback_variables: interpolationResult.disallowedPlaceholders,
                };

                if (interpolationResult.unresolvedPlaceholders.length > 0) {
                    telemetry.skip_reason = 'unresolved_placeholder';
                    return {
                        pushed: false,
                        status: 'skipped',
                        reason: 'unresolved_placeholder',
                        skip_reason: 'unresolved_placeholder',
                        placeholders: interpolationResult.unresolvedPlaceholders,
                        telemetry: telemetry,
                    };
                }

                if (strictValidation && missingVariables.length > 0) {
                    telemetry.skip_reason = 'missing_trigger_context';
                    return {
                        pushed: false,
                        status: 'skipped',
                        reason: 'missing_trigger_context',
                        skip_reason: 'missing_trigger_context',
                        missing_variables: missingVariables,
                        telemetry: telemetry,
                    };
                }

                try {
                    const executeSnippet = new Function(executableSnippet);
                    executeSnippet.call(root);
                } catch (error) {
                    if (root.console && typeof root.console.error === 'function') {
                        root.console.error('[BimBeau Privacy Analytics][Events] Tracking snippet execution failed.', {
                            actionKey: action.key,
                            snippet: snippet,
                            error: error && error.message ? String(error.message) : 'Unknown snippet error',
                        });
                    }

                    return {
                        pushed: false,
                        status: 'error',
                        reason: 'snippet_execution_failed',
                        verification_level: 'local',
                        error_category: 'execution',
                        error_message: error && error.message ? String(error.message) : 'Unknown snippet error',
                        retryable: false,
                        errorMessage: error && error.message ? String(error.message) : 'Unknown snippet error',
                        telemetry: telemetry,
                    };
                }

                return {
                    pushed: true,
                    status: 'executed',
                    action: 'tracking_snippet',
                    verification_level: 'local',
                    telemetry: telemetry,
                };
            };
        }

        if (action.key === GTAG_EVENT_ACTION_KEY) {
            return function (context) {
                const safeContext = context && typeof context === 'object' ? context : {};
                const actionMeta = action && action.meta && typeof action.meta === 'object' ? action.meta : {};
                const params = sanitizeObjectParams(
                    safeContext.params,
                    Array.isArray(actionMeta.allowedParams) ? actionMeta.allowedParams : []
                );

                if (typeof root.gtag === 'function') {
                    root.gtag('event', safeContext.eventName || '', params);
                    return {
                        pushed: true,
                        target: 'window.gtag',
                        event: safeContext.eventName || '',
                        params: params,
                    };
                }

                return {
                    pushed: false,
                    target: 'window.gtag',
                    status: 'skipped_unavailable',
                    reason: 'gtag_unavailable',
                };
            };
        }

        return null;
    }

    function buildBaseStatus(eventName) {
        return {
            eventName: typeof eventName === 'string' ? eventName : '',
            runtimeAllowed: false,
            runtimeBlockReason: '',
            runtimeState: {},
            startedAt: Date.now(),
            finishedAt: null,
            totalActions: 0,
            attemptedActions: 0,
            successfulActions: 0,
            failedActions: 0,
            skippedActions: 0,
            actions: [],
        };
    }
    function normalizeSignalErrorMessage(error) {
        if (!error) {
            return 'unknown_error';
        }

        if (typeof error.message === 'string' && error.message.trim() !== '') {
            return error.message.trim();
        }

        if (typeof error === 'string' && error.trim() !== '') {
            return error.trim();
        }

        return 'unknown_error';
    }


    function debugRuntimeMapping(meta) {
        const tracker = root.BBPATracker && typeof root.BBPATracker === 'object' ? root.BBPATracker : {};
        if (tracker.debugEnabled !== true || !root.console || typeof root.console.debug !== 'function') {
            return;
        }

        root.console.debug('[LS] event_received', meta || {});
    }

    function isActionRuntimeDebugEnabled() {
        const tracker = root.BBPATracker && typeof root.BBPATracker === 'object' ? root.BBPATracker : {};
        return tracker.actionRuntimeDebugEnabled === true || tracker.action_runtime_debug_enabled === true;
    }

    function actionRuntimeLog(message, meta, level) {
        if (!isActionRuntimeDebugEnabled() || !root.console) {
            return;
        }
        const method = level === 'error' ? 'error' : 'info';
        if (typeof root.console[method] !== 'function') {
            return;
        }
        root.console[method](ACTION_RUNTIME_DEBUG_PREFIX + ' ' + String(message), meta && typeof meta === 'object' ? meta : {});
    }

    function sendActionSignal(signalPayload, signalCache) {
        if (typeof root.fetch !== 'function') {
            return;
        }

        const payload = signalPayload && typeof signalPayload === 'object' ? signalPayload : {};
        const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
        const actionId = typeof payload.action_id === 'string' ? payload.action_id : '';
        const status = typeof payload.status === 'string' ? payload.status : ACTION_STATUS_CANONICAL.executed;
        const occurrenceId = typeof payload.occurrence_id === 'string' ? payload.occurrence_id : '';
        const dedupeKey = [eventId, actionId, occurrenceId, status].join('::');

        if (signalCache && typeof signalCache.has === 'function' && signalCache.has(dedupeKey)) {
            return;
        }

        if (signalCache && typeof signalCache.add === 'function') {
            signalCache.add(dedupeKey);
        }

        const endpoint = resolveActionSignalEndpoint();
        if (!endpoint) {
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

    function normalizeActionResultStatus(result, wasAttempted) {
        const rawStatus = result && typeof result.status === 'string' ? result.status : '';
        if (Object.prototype.hasOwnProperty.call(ACTION_STATUS_CANONICAL, rawStatus)) {
            return ACTION_STATUS_CANONICAL[rawStatus];
        }
        if (Object.prototype.hasOwnProperty.call(ACTION_STATUS_LEGACY_TO_CANONICAL, rawStatus)) {
            return ACTION_STATUS_LEGACY_TO_CANONICAL[rawStatus];
        }
        return wasAttempted ? ACTION_STATUS_CANONICAL.executed : ACTION_STATUS_CANONICAL.no_action;
    }

    function dispatchEvent(eventName, context, actions) {
        const registry = getActionRegistry();
        const status = buildBaseStatus(eventName);
        const signalCache = new Set();

        if (!registry || typeof registry.isActionRuntimeAllowed !== 'function' || typeof registry.resolveActions !== 'function') {
            status.finishedAt = Date.now();
            return Promise.resolve(status);
        }

        status.runtimeAllowed = registry.isActionRuntimeAllowed();
        if (typeof registry.resolveRuntimeState === 'function') {
            status.runtimeState = registry.resolveRuntimeState();
        }
        if (typeof registry.resolveRuntimeBlockReason === 'function') {
            status.runtimeBlockReason = registry.resolveRuntimeBlockReason();
        }

        if (!status.runtimeAllowed) {
            status.finishedAt = Date.now();
            return Promise.resolve(status);
        }

        const resolvedActions = registry.resolveActions(actions);
        actionRuntimeLog('Action registry resolved for event.', {
            event_id: status.eventName,
            actions_count: resolvedActions.length,
        });
        status.totalActions = resolvedActions.length;
        const matchedActionIds = resolvedActions
            .filter(function (action) { return action && action.enabled === true; })
            .map(function (action) { return typeof action.key === 'string' ? action.key : ''; })
            .filter(function (actionId) { return actionId !== ''; });
        debugRuntimeMapping({
            event_received: status.eventName,
            mapped_actions_count: resolvedActions.length,
            matched_action_ids: matchedActionIds,
        });

        return resolvedActions.reduce(function (chain, action) {
            return chain.then(function () {
                if (action.enabled !== true) {
                    actionRuntimeLog('Action found but disabled (condition not valid).', {
                        event_id: status.eventName,
                        action_id: action.key,
                        order: action.order,
                    });
                    status.skippedActions += 1;
                    status.actions.push({
                        key: action.key,
                        order: action.order,
                        enabled: false,
                        status: 'skipped',
                        reason: 'disabled',
                    });
                    sendActionSignal({
                        event_id: status.eventName,
                        action_id: action.key,
                        occurrence_id: status.startedAt + ':' + action.order,
                        status: 'skipped',
                        reason: 'disabled',
                    }, signalCache);
                    return null;
                }

                const actionHandler = resolveActionHandler(action);

                if (typeof actionHandler !== 'function') {
                    status.skippedActions += 1;
                    status.actions.push({
                        key: action.key,
                        order: action.order,
                        enabled: true,
                        status: 'skipped',
                        reason: 'missing_handler',
                    });
                    sendActionSignal({
                        event_id: status.eventName,
                        action_id: action.key,
                        occurrence_id: status.startedAt + ':' + action.order,
                        status: 'skipped',
                        reason: 'missing_handler',
                    }, signalCache);
                    return null;
                }

                status.attemptedActions += 1;
                const actionStartedAt = Date.now();
                actionRuntimeLog('Action found and condition validated.', {
                    event_id: status.eventName,
                    action_id: action.key,
                    order: action.order,
                });

                let actionResult;
                const safeContext = context && typeof context === 'object' ? context : {};
                const actionMeta = action && action.meta && typeof action.meta === 'object' ? action.meta : {};
                const occurrenceId = status.startedAt + ':' + action.order;

                if (action.key === TRACKING_SNIPPET_ACTION_KEY) {
                    const triggerType = getTriggerType(safeContext, actionMeta);
                    const normalizedSnippet = normalizeSnippetSource(typeof actionMeta.snippet === 'string' ? actionMeta.snippet : '');
                    const interpolation = interpolateSnippet(normalizedSnippet, safeContext, {
                        allowedVariables: Object.prototype.hasOwnProperty.call(TRIGGER_ALLOWED_VARIABLES, triggerType) ? TRIGGER_ALLOWED_VARIABLES[triggerType] : [],
                        strictValidation: shouldUseStrictTriggerValidation(safeContext, actionMeta),
                    });

                    sendActionSignal({
                        event_id: status.eventName,
                        action_id: action.key,
                        trigger_type: triggerType,
                        resolved_variables: interpolation.resolvedVariables,
                        fallback_variables: interpolation.disallowedPlaceholders,
                        occurrence_id: occurrenceId,
                        status: 'action_started',
                    }, signalCache);
                }

                try {
                    actionRuntimeLog('Action execution started.', {
                        event_id: status.eventName,
                        action_id: action.key,
                        order: action.order,
                    });
                    actionResult = actionHandler(safeContext, {
                        eventName: status.eventName,
                        actionKey: action.key,
                        order: action.order,
                        meta: action.meta,
                    });
                } catch (error) {
                    actionResult = Promise.reject(error);
                }

                return Promise.resolve(actionResult).then(function (result) {
                    const actionStatus = normalizeActionResultStatus(result, true);

                    if (actionStatus === 'error') {
                        status.failedActions += 1;
                    } else if (actionStatus === 'skipped') {
                        status.skippedActions += 1;
                    } else {
                        status.successfulActions += 1;
                    }

                    status.actions.push({
                        key: action.key,
                        order: action.order,
                        enabled: true,
                        status: actionStatus,
                        startedAt: actionStartedAt,
                        finishedAt: Date.now(),
                        result: result,
                    });
                    sendActionSignal({
                        event_id: status.eventName,
                        action_id: action.key,
                        occurrence_id: occurrenceId,
                        status: actionStatus,
                        status_legacy_raw: result && typeof result.status === 'string' ? result.status : '',
                        error_message: actionStatus === 'error' ? normalizeSignalErrorMessage(result && result.errorMessage ? { message: result.errorMessage } : null) : undefined,
                    }, signalCache);
                    actionRuntimeLog('Action execution finished.', {
                        event_id: status.eventName,
                        action_id: action.key,
                        order: action.order,
                        status: actionStatus,
                        duration_ms: Date.now() - actionStartedAt,
                    });
                    return null;
                }).catch(function (error) {
                    status.failedActions += 1;
                    status.actions.push({
                        key: action.key,
                        order: action.order,
                        enabled: true,
                        status: 'error',
                        startedAt: actionStartedAt,
                        finishedAt: Date.now(),
                        errorMessage: error && error.message ? String(error.message) : 'Unknown action error',
                    });
                    sendActionSignal({
                        event_id: status.eventName,
                        action_id: action.key,
                        occurrence_id: occurrenceId,
                        status: ACTION_STATUS_CANONICAL.error,
                        error_message: normalizeSignalErrorMessage(error),
                    }, signalCache);
                    actionRuntimeLog('Action execution error caught.', {
                        event_id: status.eventName,
                        action_id: action.key,
                        order: action.order,
                        duration_ms: Date.now() - actionStartedAt,
                        error_message: normalizeSignalErrorMessage(error),
                    }, 'error');
                    return null;
                });
            });
        }, Promise.resolve()).then(function () {
            status.finishedAt = Date.now();
            return status;
        });
    }

    return {
        dispatchEvent: dispatchEvent,
    };
});
