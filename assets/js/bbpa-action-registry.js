(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root);
    } else {
        root.BPAActionRegistry = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    function normalizeAction(rawAction, index) {
        const action = rawAction && typeof rawAction === 'object' ? rawAction : {};
        const type = typeof action.type === 'string' && action.type !== '' ? action.type : '';
        const key = typeof action.key === 'string' && action.key !== ''
            ? action.key
            : (type !== '' ? type : 'action_' + String(index));
        const order = Number.isFinite(Number(action.order)) ? Number(action.order) : 1000;
        const enabled = !Object.prototype.hasOwnProperty.call(action, 'enabled') || action.enabled !== false;

        const meta = action.meta && typeof action.meta === 'object' ? action.meta : {};

        if (typeof action.snippet === 'string' && action.snippet !== '') {
            meta.snippet = action.snippet;
        }

        return {
            key: key,
            type: type !== '' ? type : key,
            order: order,
            enabled: enabled,
            handler: typeof action.handler === 'function' ? action.handler : null,
            params: action.params && typeof action.params === 'object' ? action.params : {},
            meta: meta,
        };
    }

    function resolveRuntimeState() {
        const runtime = root.BBPATracker || {};
        const advancedState = root.BPAAdvancedRuntime && typeof root.BPAAdvancedRuntime === 'object'
            ? root.BPAAdvancedRuntime
            : {};
        const eventsEnabled = runtime.eventsEnabled !== false;

        return {
            eventsEnabled: eventsEnabled,
            advancedActive: advancedState.lastSkipReason !== 'runtime_unavailable',
        };
    }

    function isActionRuntimeAllowed() {
        const runtimeState = resolveRuntimeState();
        return runtimeState.eventsEnabled && runtimeState.advancedActive;
    }

    function resolveRuntimeBlockReason() {
        const runtimeState = resolveRuntimeState();
        if (!runtimeState.eventsEnabled) {
            return 'events_disabled';
        }
        if (!runtimeState.advancedActive) {
            return 'advanced_runtime_unavailable';
        }
        return '';
    }

    function resolveActions(actions) {
        const actionList = Array.isArray(actions) ? actions : [];
        return actionList
            .map(normalizeAction)
            .sort(function (left, right) {
                if (left.order === right.order) {
                    return left.key < right.key ? -1 : 1;
                }
                return left.order - right.order;
            });
    }

    return {
        resolveActions: resolveActions,
        isActionRuntimeAllowed: isActionRuntimeAllowed,
        resolveRuntimeState: resolveRuntimeState,
        resolveRuntimeBlockReason: resolveRuntimeBlockReason,
    };
});
