(function () {
    const config = window.BPAFreemiusPricingI18n || {};
    const strings = config.strings || {};
    const patterns = compilePatterns(Array.isArray(config.patterns) ? config.patterns : []);
    let observer = null;
    let initialTranslationDone = false;

    function compilePatterns(items) {
        const compiled = [];

        items.forEach(function (item) {
            if (!item || !item.pattern || !item.replacement) {
                return;
            }

            try {
                compiled.push({
                    regex: new RegExp(item.pattern),
                    replacement: item.replacement,
                });
            } catch (error) {
                // Ignore invalid patterns instead of breaking the whole adapter.
            }
        });

        return compiled;
    }

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    // Replace the whole meaningful text while keeping the original surrounding whitespace,
    // so text nodes containing line breaks or repeated spaces are translated too.
    function withOriginalSpacing(value, translatedText) {
        const original = String(value);
        const leading = original.match(/^\s*/)[0];
        const trailing = original.match(/\s*$/)[0];

        return leading + translatedText + trailing;
    }

    function translateValue(value) {
        const normalized = normalize(value);
        let replacement;

        if (!normalized) {
            return value;
        }

        if (Object.prototype.hasOwnProperty.call(strings, normalized)) {
            return withOriginalSpacing(value, strings[normalized]);
        }

        for (const item of patterns) {
            replacement = normalized.replace(item.regex, item.replacement);
            if (replacement !== normalized) {
                return withOriginalSpacing(value, replacement);
            }
        }

        return value;
    }

    function translateTextNode(node) {
        const replacement = translateValue(node.nodeValue);
        if (replacement !== node.nodeValue) {
            node.nodeValue = replacement;
        }
    }

    function translateTree(root) {
        if (!root || !window.NodeFilter || !document.createTreeWalker) {
            return;
        }

        const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();

        while (node) {
            translateTextNode(node);
            node = walker.nextNode();
        }
    }

    function translateNode(node, pricingRoot) {
        if (!node || !pricingRoot || !pricingRoot.contains(node)) {
            return;
        }

        if (node.nodeType === 3) {
            translateTextNode(node);
            return;
        }

        if (node.nodeType === 1) {
            translateTree(node);
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

    function applyInitialTranslations() {
        const root = getPricingRoot();
        if (initialTranslationDone || !isPricingRendered(root)) {
            return initialTranslationDone;
        }

        translateTree(root);
        initialTranslationDone = true;
        return true;
    }

    // The Freemius pricing app re-renders its texts on every interaction (billing cycle,
    // licenses, plan selection), so the observer stays connected and translates the text
    // nodes it adds or updates.
    function handleMutations(records) {
        if (!initialTranslationDone) {
            applyInitialTranslations();
        } else {
            const root = getPricingRoot();
            records.forEach(function (record) {
                if (record.type === 'characterData') {
                    translateNode(record.target, root);
                    return;
                }

                Array.prototype.forEach.call(record.addedNodes || [], function (node) {
                    translateNode(node, root);
                });
            });
        }

        // Drop the records produced by the translations written above.
        if (observer) {
            observer.takeRecords();
        }
    }

    function observePricingApp() {
        const wrapper = document.getElementById('fs_pricing_wrapper');
        if (!wrapper || !window.MutationObserver || observer) {
            return;
        }

        observer = new window.MutationObserver(handleMutations);
        observer.observe(wrapper, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    function boot() {
        applyInitialTranslations();
        observePricingApp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.setTimeout(boot, 1000);
    window.setTimeout(boot, 3000);
}());
