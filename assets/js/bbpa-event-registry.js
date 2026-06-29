(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root);
    } else {
        root.BPAEventRegistry = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    const DEFAULT_EVENT_REGISTRY = {
        page_view: {
            description: 'Essential page view event collected by the base tracker runtime.',
            allowedParams: ['page_path', 'post_id']
        },
        enrichment_update: {
            description: 'Advanced tracker enrichment payload sent when runtime starts.',
            allowedParams: ['active_ms_delta', 'screen_resolution', 'referrer_domain', 'device_class']
        },
        heartbeat: {
            description: 'Advanced tracker heartbeat payload sent while user stays active.',
            allowedParams: ['active_ms_delta', 'screen_resolution', 'referrer_domain', 'device_class']
        }
    };

    function cloneRegistry(registry) {
        return JSON.parse(JSON.stringify(registry));
    }

    function resolveRegistry(settings) {
        const baseRegistry = cloneRegistry(DEFAULT_EVENT_REGISTRY);
        const runtimeConfig = root.BPAEventRegistryConfig || {};
        const configuredRegistry = runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig.eventRegistry : null;

        if (configuredRegistry && typeof configuredRegistry === 'object') {
            return configuredRegistry;
        }

        const globalExtender = root.BPAEventRegistryExtender;

        if (typeof globalExtender === 'function') {
            const nextRegistry = globalExtender(baseRegistry, settings || {});
            if (nextRegistry && typeof nextRegistry === 'object') {
                return nextRegistry;
            }
        }

        return baseRegistry;
    }

    function resolveAllowedParams(eventName, settings) {
        if (typeof eventName !== 'string' || eventName === '') {
            return [];
        }

        const registry = resolveRegistry(settings);
        const definition = registry[eventName];

        if (!definition || !Array.isArray(definition.allowedParams)) {
            return [];
        }

        return definition.allowedParams.slice();
    }

    return {
        DEFAULT_EVENT_REGISTRY: cloneRegistry(DEFAULT_EVENT_REGISTRY),
        resolveRegistry: resolveRegistry,
        resolveAllowedParams: resolveAllowedParams,
    };
});
