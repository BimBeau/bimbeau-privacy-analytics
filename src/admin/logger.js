/**
 * BimBeau Privacy Analytics admin logger utilities.
 */

const DEFAULT_PREFIX = '[BPA][Admin]';
const TRACE_PREFIX = 'ls';


const EXTENSION_ASYNC_RESPONSE_CLOSED_MESSAGE = 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';

const resolveErrorMessage = (value) => {
    if (typeof value === 'string') {
        return value;
    }

    if (value && typeof value.message === 'string') {
        return value.message;
    }

    return '';
};

const isKnownExtensionAsyncMessageError = (reason) => {
    const message = resolveErrorMessage(reason);
    return message.includes(EXTENSION_ASYNC_RESPONSE_CLOSED_MESSAGE);
};

const safeNow = () => {
    if (typeof performance !== 'undefined' && performance.now) {
        return Number(performance.now().toFixed(2));
    }
    return Date.now();
};

const safeUserAgent = () => {
    if (typeof navigator === 'undefined') {
        return '';
    }
    return navigator.userAgent || '';
};

const safeLocationPath = () => {
    if (typeof window === 'undefined' || !window.location) {
        return '';
    }
    return window.location.pathname || '';
};

export const createTraceId = () => {
    const random = Math.random().toString(36).slice(2, 8);
    const time = Date.now().toString(36).slice(-4);
    return `${TRACE_PREFIX}-${random}${time}`;
};

export const getRuntimeDiagnostics = () => {
    const hasChromeRuntime = Boolean(window?.chrome && window.chrome.runtime);

    return {
        userAgent: safeUserAgent(),
        hasChromeRuntime,
        suggestion: 'Test in private browsing to isolate extensions.',
    };
};

export const createLogger = ({ debugEnabled = false, prefix = DEFAULT_PREFIX } = {}) => {
    const resolveDebugEnabled = () => (typeof debugEnabled === 'function' ? debugEnabled() : debugEnabled);
    const baseMeta = () => ({
        time: safeNow(),
        page: safeLocationPath(),
    });

    const logGroup = (method, message, meta) => {
        const title = `${prefix} ${message}`;
        if (console && console.groupCollapsed) {
            console.groupCollapsed(title);
            console[method](meta);
            console.groupEnd();
        } else {
            console[method](title, meta);
        }
    };

    const log = (method, message, meta, force = false) => {
        if (!force && !resolveDebugEnabled()) {
            return;
        }
        const payload = {
            ...baseMeta(),
            ...meta,
        };
        logGroup(method, message, payload);
    };

    const error = (message, meta = {}) => {
        if (!resolveDebugEnabled()) {
            if (console && console.error) {
                console.error(`${prefix} ${message}`);
            }
            return;
        }
        log('error', message, meta, true);
    };

    return {
        debug: (message, meta = {}) => log('debug', message, meta),
        info: (message, meta = {}) => log('info', message, meta),
        warn: (message, meta = {}) => log('warn', message, meta),
        error,
        isDebugEnabled: () => debugEnabled,
    };
};

export const setupGlobalErrorHandlers = (logger) => {
    if (!window || !window.addEventListener) {
        return;
    }

    window.addEventListener('error', (event) => {
        logger.error('Global error captured', {
            action: 'window.error',
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? event.error.toString() : undefined,
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (isKnownExtensionAsyncMessageError(event.reason)) {
            event.preventDefault();
            logger.warn('Ignored browser-extension async message rejection', {
                action: 'window.unhandledrejection.ignored_extension_async_response',
                reason: resolveErrorMessage(event.reason),
            });
            return;
        }

        logger.error('Unhandled promise rejection', {
            action: 'window.unhandledrejection',
            reason: event.reason ? event.reason.toString() : undefined,
        });
    });
};
