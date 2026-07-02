<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Premium front event runtime for BimBeau Privacy Analytics.
 */

/**
 * Add the consolidated front event action runtime to the advanced tracker handle.
 *
 * The public DOM stays intentionally small: only the essential and advanced
 * tracker handles are loaded. The inline runtime binds configured triggers once,
 * executes tracking snippets, and suppresses legacy fallback signals that would
 * otherwise be incomplete or duplicated.
 */
function bbpa_enqueue_event_runtime_patch(): void
{
    $handle = 'bbpa-advanced-tracker';

    if (!wp_script_is($handle, 'registered') && !wp_script_is($handle, 'enqueued')) {
        return;
    }

    $before_script = <<<'JS'
(function (root) {
    if (!root) {
        return;
    }

    root.BPAAdvancedSignalBridgeBound = true;

    function getSettings() {
        return root.BBPATracker && typeof root.BBPATracker === 'object' ? root.BBPATracker : {};
    }

    function isConfiguredEvent(eventId) {
        const settings = getSettings();
        const config = Array.isArray(settings.eventsConfig) ? settings.eventsConfig : [];
        return config.some(function (eventItem) {
            if (!eventItem || typeof eventItem !== 'object') {
                return false;
            }
            const candidate = String(eventItem.id || eventItem.event || eventItem.event_id || eventItem.event_name || '').trim();
            return candidate !== '' && candidate === eventId;
        });
    }

    function emptySignalResponse() {
        return Promise.resolve({
            ok: true,
            status: 202,
            json: function () { return Promise.resolve({ recorded: false, suppressed: true }); },
            text: function () { return Promise.resolve(''); },
        });
    }

    if (root.__BPAAdvancedEventPatchFetchBound !== true && typeof root.fetch === 'function') {
        root.__BPAAdvancedEventPatchFetchBound = true;
        const originalFetch = root.fetch;
        root.fetch = function (input, init) {
            let nextInit = init;

            try {
                const url = typeof input === 'string'
                    ? input
                    : (input && typeof input.url === 'string' ? input.url : '');

                if (typeof url !== 'string' || url.indexOf('/events-') === -1 || !nextInit || typeof nextInit.body !== 'string') {
                    return originalFetch.call(this, input, nextInit);
                }

                const payload = JSON.parse(nextInit.body);
                if (!payload || payload.bbpa_runtime_patch === true) {
                    return originalFetch.call(this, input, nextInit);
                }

                const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
                if (isConfiguredEvent(eventId) && url.indexOf('/events-trigger-signal') !== -1) {
                    return emptySignalResponse();
                }

                if (isConfiguredEvent(eventId) && url.indexOf('/events-action-signal') !== -1) {
                    if (!payload.status && payload.execution_status === 'matched') {
                        return emptySignalResponse();
                    }
                    if (!payload.status && typeof payload.execution_status === 'string' && payload.execution_status !== '') {
                        payload.status = payload.execution_status === 'failed' ? 'error' : payload.execution_status;
                        nextInit = Object.assign({}, nextInit, { body: JSON.stringify(payload) });
                    }
                }
            } catch (error) {
                // Let the original request continue when the compatibility guard cannot inspect it.
            }

            return originalFetch.call(this, input, nextInit);
        };
    }

    if (root.navigator && typeof root.navigator.sendBeacon === 'function' && root.__BPAAdvancedEventPatchBeaconBound !== true) {
        root.__BPAAdvancedEventPatchBeaconBound = true;
        const originalSendBeacon = root.navigator.sendBeacon.bind(root.navigator);
        root.navigator.sendBeacon = function (url, data) {
            if (typeof url === 'string' && url.indexOf('/events-trigger-signal') !== -1) {
                return true;
            }
            return originalSendBeacon(url, data);
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
JS;

    $after_script = <<<'JS'
(function (root) {
    if (!root || root.__BPAAdvancedEventRuntimePatchBound === true) {
        return;
    }
    root.__BPAAdvancedEventRuntimePatchBound = true;

    const TRACKING_SNIPPET_ACTION_KEY = 'tracking_snippet';
    const TRIGGER_ALLOWED_VARIABLES = {
        page_view: ['page_url', 'page_title'],
        click: ['page_url', 'page_title', 'href', 'element_text', 'element_id', 'element_classes'],
        form_submit: ['page_url', 'page_title', 'form_id'],
    };

    function getSettings() {
        return root.BBPATracker && typeof root.BBPATracker === 'object' ? root.BBPATracker : {};
    }

    function getEventsConfig() {
        const settings = getSettings();
        return Array.isArray(settings.eventsConfig) ? settings.eventsConfig : [];
    }

    function getTrackerCore() {
        return root.BPAEssentialTracker && typeof root.BPAEssentialTracker === 'object'
            ? root.BPAEssentialTracker
            : null;
    }

    function getEventId(eventItem) {
        const keys = ['id', 'event', 'event_id', 'event_name'];
        for (let index = 0; index < keys.length; index += 1) {
            const value = eventItem && typeof eventItem[keys[index]] === 'string' ? eventItem[keys[index]].trim() : '';
            if (value !== '') {
                return value;
            }
        }
        return '';
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

    function sanitizeTrigger(trigger) {
        const source = trigger && typeof trigger === 'object' ? trigger : {};
        const rawType = typeof source.type === 'string' ? source.type : 'click';
        const type = ['click', 'page_view', 'form_submit', 'interaction'].indexOf(rawType) >= 0 ? rawType : 'click';
        return {
            type: type,
            selector: typeof source.selector === 'string' ? source.selector.trim() : '',
            form_selector: typeof source.form_selector === 'string' ? source.form_selector.trim() : '',
            url_pattern: typeof source.url_pattern === 'string' ? source.url_pattern.trim() : '',
            once_per_page: source.once_per_page === true,
            debounce_ms: Math.max(0, Math.min(60000, Number(source.debounce_ms) || 0)),
        };
    }

    function normalizeAction(rawAction, index) {
        const action = rawAction && typeof rawAction === 'object' ? rawAction : {};
        const type = typeof action.type === 'string' && action.type !== '' ? action.type : '';
        const id = firstPresentString(action.id, action.action_id);
        const key = typeof action.key === 'string' && action.key !== '' ? action.key : (type !== '' ? type : (id !== '' ? id : 'action_' + String(index)));
        const meta = action.meta && typeof action.meta === 'object' ? Object.assign({}, action.meta) : {};
        if (typeof action.snippet === 'string' && action.snippet !== '') {
            meta.snippet = action.snippet;
        }
        return {
            id: id !== '' ? id : key,
            key: key,
            type: type !== '' ? type : key,
            order: Number.isFinite(Number(action.order)) ? Number(action.order) : 1000,
            enabled: !Object.prototype.hasOwnProperty.call(action, 'enabled') || action.enabled !== false,
            handler: typeof action.handler === 'function' ? action.handler : null,
            meta: meta,
        };
    }

    function resolveActions(eventItem) {
        if (eventItem && Array.isArray(eventItem.actions) && eventItem.actions.length > 0) {
            return eventItem.actions.map(normalizeAction).sort(function (left, right) {
                if (left.order === right.order) {
                    return left.key < right.key ? -1 : 1;
                }
                return left.order - right.order;
            });
        }

        const reservedKeys = ['event', 'id', 'event_id', 'event_name', 'label', 'short_label', 'enabled', 'actions', 'order', 'params', 'trigger'];
        return Object.keys(eventItem || {}).filter(function (key) {
            return reservedKeys.indexOf(key) === -1;
        }).map(function (key, index) {
            const value = eventItem[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return normalizeAction(Object.assign({}, value, { type: key }), index);
            }
            return normalizeAction({ type: key, enabled: value !== false }, index);
        });
    }

    function resolveEndpoint(kind) {
        const settings = getSettings();
        const restUrl = typeof settings.restUrl === 'string' ? settings.restUrl : '';
        const restNamespace = typeof settings.restNamespace === 'string' ? settings.restNamespace : '';
        if (!restUrl || !restNamespace) {
            return '';
        }
        try {
            return new URL(restNamespace.replace(/^\/+/, '') + '/events-' + kind + '-signal', restUrl).toString();
        } catch (error) {
            return '';
        }
    }

    function postSignal(kind, payload) {
        const endpoint = resolveEndpoint(kind);
        if (!endpoint || typeof root.fetch !== 'function') {
            return;
        }
        const body = Object.assign({}, payload || {}, { bbpa_runtime_patch: true });
        root.fetch(endpoint, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(function () { return null; });
    }

    function collectVariables(context) {
        const safeContext = context && typeof context === 'object' ? context : {};
        return {
            page_url: firstPresentString(safeContext.page_url, safeContext.pageUrl, safeContext.url, root.location && root.location.href ? root.location.href : ''),
            page_title: firstPresentString(safeContext.page_title, safeContext.pageTitle, safeContext.title, root.document && root.document.title ? root.document.title : ''),
            href: firstPresentString(safeContext.href, safeContext.element_href, safeContext.elementHref),
            element_text: firstPresentString(safeContext.element_text, safeContext.elementText, safeContext.text),
            element_id: firstPresentString(safeContext.element_id, safeContext.elementId),
            element_classes: firstPresentString(safeContext.element_classes, safeContext.elementClasses, safeContext.classes),
            form_id: firstPresentString(safeContext.form_id, safeContext.formId),
        };
    }

    function normalizeSnippet(snippet) {
        if (typeof snippet !== 'string' || snippet === '') {
            return '';
        }
        return snippet.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    }

    function interpolateSnippet(snippet, context, triggerType) {
        const variables = collectVariables(context);
        const allowedVariables = Object.prototype.hasOwnProperty.call(TRIGGER_ALLOWED_VARIABLES, triggerType)
            ? TRIGGER_ALLOWED_VARIABLES[triggerType]
            : [];
        const unresolved = [];
        const executable = normalizeSnippet(snippet).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (match, variableName) {
            if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
                unresolved.push(variableName);
                return '';
            }
            if (allowedVariables.indexOf(variableName) === -1) {
                return JSON.stringify('');
            }
            return JSON.stringify(String(variables[variableName] || ''));
        });
        return { executable: executable, unresolved: unresolved, variables: variables };
    }

    function executeAction(action, context, triggerType) {
        if (!action || action.enabled !== true) {
            return { id: action && action.id ? action.id : '', type: action && action.type ? action.type : '', status: 'skipped', reason: 'disabled' };
        }
        if (action.type !== TRACKING_SNIPPET_ACTION_KEY && action.key !== TRACKING_SNIPPET_ACTION_KEY) {
            return { id: action.id, type: action.type, status: 'skipped', reason: 'missing_handler' };
        }
        const snippet = action.meta && typeof action.meta.snippet === 'string' ? action.meta.snippet : '';
        if (snippet.trim() === '') {
            return { id: action.id, type: action.type, status: 'skipped', reason: 'empty_snippet' };
        }
        const interpolation = interpolateSnippet(snippet, context, triggerType);
        if (interpolation.unresolved.length > 0) {
            return { id: action.id, type: action.type, status: 'skipped', reason: 'unresolved_placeholder' };
        }
        try {
            const executeSnippet = new Function(interpolation.executable);
            executeSnippet.call(root);
            return { id: action.id, type: action.type, status: 'executed', reason: '', resolved_variables: interpolation.variables };
        } catch (error) {
            if (root.console && typeof root.console.error === 'function') {
                root.console.error('[BimBeau Privacy Analytics][Events] Tracking snippet execution failed.', {
                    actionKey: action.key,
                    error: error && error.message ? String(error.message) : 'Unknown snippet error',
                });
            }
            return {
                id: action.id,
                type: action.type,
                status: 'error',
                reason: 'snippet_execution_failed',
                error_message: error && error.message ? String(error.message) : 'Unknown snippet error',
            };
        }
    }

    function resolveActionStatus(results) {
        if (results.some(function (item) { return item.status === 'executed'; })) {
            return 'executed';
        }
        if (results.some(function (item) { return item.status === 'error'; })) {
            return 'error';
        }
        if (results.some(function (item) { return item.status === 'skipped'; })) {
            return 'skipped';
        }
        return 'no_action';
    }

    function resolveDedupeScope() {
        const trackerCore = getTrackerCore();
        const settings = getSettings();
        if (trackerCore && typeof trackerCore.resolveOrCreateEnrichedVisitId === 'function') {
            try {
                const visitId = String(trackerCore.resolveOrCreateEnrichedVisitId(settings) || '').trim();
                if (visitId !== '') {
                    return { visit_id: visitId, dedupe_scope_id: 'visit:' + visitId };
                }
            } catch (error) {
                // Fall through to session scope.
            }
        }

        const storageKey = 'bbpa_trigger_session_id';
        let triggerSessionId = '';
        try {
            if (root.sessionStorage && typeof root.sessionStorage.getItem === 'function') {
                triggerSessionId = String(root.sessionStorage.getItem(storageKey) || '').trim();
                if (triggerSessionId === '') {
                    triggerSessionId = 'ts_' + Math.random().toString(36).slice(2, 12);
                    root.sessionStorage.setItem(storageKey, triggerSessionId);
                }
            }
        } catch (error) {
            triggerSessionId = '';
        }

        if (triggerSessionId !== '') {
            return { trigger_session_id: triggerSessionId, dedupe_scope_id: 'session:' + triggerSessionId };
        }
        return { dedupe_scope_id: '' };
    }

    function buildBaseContext(eventId, triggerType, pagePath) {
        const path = typeof pagePath === 'string' && pagePath !== '' ? pagePath : (root.location && root.location.pathname ? root.location.pathname : '');
        return {
            eventName: eventId,
            triggerType: triggerType,
            trigger_type: triggerType,
            pagePath: path,
            page_path: path,
            page_url: root.location && root.location.href ? root.location.href : '',
            page_title: root.document && root.document.title ? root.document.title : '',
        };
    }

    function buildClickContext(element) {
        const safeElement = element && typeof element === 'object' ? element : null;
        const linkElement = safeElement && typeof safeElement.closest === 'function' ? safeElement.closest('a[href]') : null;
        const href = safeElement && typeof safeElement.href === 'string' && safeElement.href !== ''
            ? safeElement.href
            : (linkElement && typeof linkElement.href === 'string' ? linkElement.href : '');
        return {
            href: href,
            element_text: safeElement ? String(safeElement.innerText || safeElement.textContent || '').trim() : '',
            element_id: safeElement && typeof safeElement.id === 'string' ? safeElement.id : '',
            element_classes: safeElement && safeElement.classList && typeof safeElement.classList.value === 'string'
                ? safeElement.classList.value
                : (safeElement && typeof safeElement.className === 'string' ? safeElement.className : ''),
        };
    }

    function dispatchConfiguredEvent(eventItem, trigger, context) {
        const eventId = getEventId(eventItem);
        if (!eventId) {
            return;
        }
        const now = Date.now();
        const runId = String(now);
        const occurrenceId = [eventId, trigger.type, String(now), Math.random().toString(36).slice(2, 10)].join('::');
        const actions = resolveActions(eventItem).filter(function (action) { return action && action.key !== ''; });
        const runtimeContext = collectVariables(context);
        const actionResults = actions.map(function (action) {
            const result = executeAction(action, context, trigger.type);
            const actionStatus = result.status === 'error' ? 'error' : (result.status === 'executed' ? 'executed' : 'skipped');
            postSignal('action', {
                event_id: eventId,
                action_id: action.id || action.key,
                action_type: action.type || action.key,
                status: actionStatus,
                execution_status: actionStatus,
                occurrence_id: occurrenceId,
                run_id: runId,
                skip_reason: actionStatus === 'skipped' ? (result.reason || '') : '',
                error_message: actionStatus === 'error' ? (result.error_message || result.reason || '') : '',
                page_path: context.pagePath || context.page_path || '',
                page_url: runtimeContext.page_url,
                page_title: runtimeContext.page_title,
                event_context: runtimeContext,
            });
            return result;
        });

        const actionStatus = resolveActionStatus(actionResults);
        const firstProblem = actionResults.find(function (item) { return item.status === 'error' || item.status === 'skipped'; }) || {};
        const dedupeScope = resolveDedupeScope();
        postSignal('trigger', Object.assign({
            event_id: eventId,
            trigger_type: trigger.type,
            page_path: context.pagePath || context.page_path || '',
            action_status: actionStatus,
            execution_status: actionStatus === 'error' ? 'failed' : (actionStatus === 'no_action' ? 'matched' : actionStatus),
            has_enabled_action: actions.some(function (action) { return action && action.enabled === true; }),
            occurrence_id: occurrenceId,
            run_id: runId,
            triggered_at: new Date(now).toISOString(),
            skip_reason: firstProblem.status === 'skipped' ? (firstProblem.reason || '') : '',
            error_message: firstProblem.status === 'error' ? (firstProblem.error_message || firstProblem.reason || '') : '',
            page_url: runtimeContext.page_url,
            page_title: runtimeContext.page_title,
            href: runtimeContext.href,
            element_text: runtimeContext.element_text,
            element_id: runtimeContext.element_id,
            element_classes: runtimeContext.element_classes,
            form_id: runtimeContext.form_id,
            event_context: runtimeContext,
        }, dedupeScope));
    }

    function isAdvancedRuntimeAllowed() {
        const status = root.BPARuntimeStatus && typeof root.BPARuntimeStatus === 'object' ? root.BPARuntimeStatus : {};
        return status.advancedState === 'started' && status.lastAdvancedSkipReason !== 'external_cmp_blocked';
    }

    function bindConfiguredEvents() {
        if (!isAdvancedRuntimeAllowed()) {
            return;
        }
        if (!root.document || typeof root.document.addEventListener !== 'function') {
            return;
        }
        const registryKey = '__BPAAdvancedEventRuntimePatchBindings';
        const registry = root[registryKey] && typeof root[registryKey] === 'object' ? root[registryKey] : {};
        root[registryKey] = registry;
        const pageHits = root.__BPAAdvancedEventRuntimePatchPageHits || {};
        const debounceMap = root.__BPAAdvancedEventRuntimePatchDebounce || {};
        root.__BPAAdvancedEventRuntimePatchPageHits = pageHits;
        root.__BPAAdvancedEventRuntimePatchDebounce = debounceMap;

        getEventsConfig().forEach(function (eventItem) {
            if (!eventItem || typeof eventItem !== 'object' || eventItem.enabled !== true) {
                return;
            }
            const eventId = getEventId(eventItem);
            const trigger = sanitizeTrigger(eventItem.trigger || {});
            const bindingKey = [eventId, trigger.type, trigger.selector || '', trigger.form_selector || '', trigger.url_pattern || ''].join('::');
            if (!eventId || registry[bindingKey] === true) {
                return;
            }

            function guardedDispatch(context) {
                const debounceKey = eventId + '::' + trigger.type;
                const now = Date.now();
                if (trigger.once_per_page && pageHits[debounceKey]) {
                    return;
                }
                if (trigger.debounce_ms > 0 && debounceMap[debounceKey] && (now - debounceMap[debounceKey]) < trigger.debounce_ms) {
                    return;
                }
                pageHits[debounceKey] = true;
                debounceMap[debounceKey] = now;
                dispatchConfiguredEvent(eventItem, trigger, context);
            }

            if (trigger.type === 'page_view') {
                registry[bindingKey] = true;
                const path = root.location && root.location.pathname ? root.location.pathname : '';
                if (!trigger.url_pattern || path.indexOf(trigger.url_pattern) !== -1) {
                    guardedDispatch(buildBaseContext(eventId, 'page_view', path));
                }
                return;
            }

            const domEventName = trigger.type === 'form_submit' ? 'submit' : (trigger.type === 'click' ? 'click' : 'input');
            root.document.addEventListener(domEventName, function (domEvent) {
                const rawTarget = domEvent && domEvent.target ? domEvent.target : null;
                const targetNode = rawTarget && typeof rawTarget.closest === 'function'
                    ? rawTarget
                    : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
                const selectorSource = trigger.type === 'form_submit' ? (trigger.form_selector || trigger.selector || '') : trigger.selector;
                let target = null;
                if (selectorSource) {
                    try {
                        target = targetNode && typeof targetNode.closest === 'function' ? targetNode.closest(selectorSource) : null;
                    } catch (error) {
                        target = null;
                    }
                    if (!target) {
                        return;
                    }
                }
                const pagePath = root.location && root.location.pathname ? root.location.pathname : '';
                const baseContext = buildBaseContext(eventId, trigger.type, pagePath);
                if (trigger.type === 'click') {
                    guardedDispatch(Object.assign({}, baseContext, buildClickContext(target || targetNode || rawTarget)));
                    return;
                }
                if (trigger.type === 'form_submit') {
                    const formElement = target || targetNode || rawTarget;
                    guardedDispatch(Object.assign({}, baseContext, { form_id: formElement && typeof formElement.id === 'string' ? formElement.id : '' }));
                    return;
                }
                guardedDispatch(baseContext);
            }, { passive: true, capture: true });
            registry[bindingKey] = true;
        });
    }

    root.BPAEventDispatcher = {
        dispatchEvent: function (eventName, context, actions) {
            return Promise.resolve({
                eventName: typeof eventName === 'string' ? eventName : '',
                status: 'delegated_to_patch_binding',
                actions: [],
            });
        },
    };

    if (isAdvancedRuntimeAllowed()) {
        bindConfiguredEvents();
    }
    if (root.document && root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', bindConfiguredEvents);
    }
    if (typeof root.addEventListener === 'function') {
        root.addEventListener('load', bindConfiguredEvents);
        root.document && root.document.addEventListener('bpa:tracker:ready', bindConfiguredEvents);
        root.document && root.document.addEventListener('bpa:essential-ready', bindConfiguredEvents);
        root.document && root.document.addEventListener('bpa:advanced-tracker:started', bindConfiguredEvents);
        root.document && root.document.addEventListener('bpa:advanced-tracker:retry', bindConfiguredEvents);
    }
})(typeof window !== 'undefined' ? window : globalThis);
JS;

    wp_add_inline_script($handle, $before_script, 'before');
    wp_add_inline_script($handle, $after_script, 'after');
}

add_action('wp_enqueue_scripts', 'bbpa_enqueue_event_runtime_patch', 21);
