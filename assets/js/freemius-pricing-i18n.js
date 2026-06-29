(function () {
    const config = window.BPAFreemiusPricingI18n || {};
    const strings = config.strings || {};
    const patterns = Array.isArray(config.patterns) ? config.patterns : [];
    let observer = null;
    let translated = false;

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function translateValue(value) {
        const normalized = normalize(value);
        let replacement;

        if (!normalized) {
            return value;
        }

        if (Object.prototype.hasOwnProperty.call(strings, normalized)) {
            return String(value).replace(normalized, strings[normalized]);
        }

        for (const item of patterns) {
            if (!item || !item.pattern || !item.replacement) {
                continue;
            }

            replacement = normalized.replace(new RegExp(item.pattern), item.replacement);
            if (replacement !== normalized) {
                return String(value).replace(normalized, replacement);
            }
        }

        return value;
    }

    function translateTree(root) {
        if (!root || !window.NodeFilter || !document.createTreeWalker) {
            return;
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();

        while (node) {
            const replacement = translateValue(node.nodeValue);
            if (replacement !== node.nodeValue) {
                node.nodeValue = replacement;
            }
            node = walker.nextNode();
        }
    }

    function getPricingRoot() {
        return document.getElementById('fs_pricing_app');
    }

    function isPricingRendered(root) {
        return Boolean(
            root &&
            root.querySelector(
                '.fs-section--plans-and-pricing, .fs-section--packages, [class*="plans-and-pricing"], [class*="packages"]'
            )
        );
    }

    function disconnectObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function applyTranslationsOnce() {
        const root = getPricingRoot();
        if (translated || !isPricingRendered(root)) {
            return false;
        }

        translateTree(root);
        translated = true;
        disconnectObserver();
        return true;
    }

    function observeUntilRendered() {
        const wrapper = document.getElementById('fs_pricing_wrapper');
        if (!wrapper || !window.MutationObserver || observer || translated) {
            return;
        }

        observer = new MutationObserver(applyTranslationsOnce);
        observer.observe(wrapper, {
            childList: true,
            subtree: true,
        });
    }

    function boot() {
        if (!applyTranslationsOnce()) {
            observeUntilRendered();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.setTimeout(boot, 1000);
    window.setTimeout(boot, 3000);
    window.setTimeout(disconnectObserver, 10000);
}());
