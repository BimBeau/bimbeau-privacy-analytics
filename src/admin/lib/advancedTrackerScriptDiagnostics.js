const DEFAULT_SCRIPT_MATCHERS = [
  /bbpa-advanced-tracker(?:\.min)?\.js(?:$|[?#])/i,
  /bbpa-advanced-tracker$/i,
];

const DEFAULT_CMP_PATTERNS = [
  {
    id: "type_text_plain",
    description: 'Script type is "text/plain".',
    predicate: (scriptNode) =>
      (scriptNode.getAttribute("type") || "").toLowerCase() === "text/plain",
  },
  {
    id: "cookiebot",
    description: "Cookiebot consent attribute is present.",
    predicate: (scriptNode) => scriptNode.hasAttribute("data-cookieconsent"),
  },
  {
    id: "tarteaucitron",
    description: "tarteaucitron service marker is present.",
    predicate: (scriptNode) => scriptNode.hasAttribute("data-tac-service"),
  },
  {
    id: "complianz",
    description: "Complianz consent marker is present.",
    predicate: (scriptNode) => scriptNode.hasAttribute("data-cmplz-consent"),
  },
];

const getScriptNodes = (documentRef) => Array.from(documentRef.querySelectorAll("script"));

const normalizeScriptMatch = (scriptNode) => ({
  src: scriptNode.getAttribute("src") || "",
  id: scriptNode.getAttribute("id") || "",
  type: scriptNode.getAttribute("type") || "",
});

const isAdvancedTrackerScript = (scriptNode, scriptMatchers) => {
  const scriptSrc = scriptNode.getAttribute("src") || "";
  const scriptId = scriptNode.getAttribute("id") || "";
  return scriptMatchers.some((matcher) => matcher.test(scriptSrc) || matcher.test(scriptId));
};

const detectRuntimeState = (windowRef = window) => {
  const runtime = windowRef.BPAAdvancedRuntime;
  return {
    started: !!(runtime && runtime.startedAt),
    payloadSent: !!(runtime && runtime.lastPayloadAt),
    startedAt: runtime?.startedAt || null,
    lastPayloadAt: runtime?.lastPayloadAt || null,
    lastResponseStatus: runtime?.lastResponseStatus ?? null,
    lastSkipReason: runtime?.lastSkipReason ?? null,
    lastTracked: Object.prototype.hasOwnProperty.call(runtime || {}, 'lastTracked') ? runtime.lastTracked : null,
  };
};

export const diagnoseAdvancedTrackerScripts = (options = {}) => {
  const documentRef = options.documentRef || window.document;
  const scriptMatchers = options.scriptMatchers || DEFAULT_SCRIPT_MATCHERS;
  const cmpPatterns = options.cmpPatterns || DEFAULT_CMP_PATTERNS;
  const runtimeState = Object.prototype.hasOwnProperty.call(options, "runtimeState")
    ? options.runtimeState
    : detectRuntimeState(options.windowRef || window);

  const matchedScriptNodes = getScriptNodes(documentRef).filter((scriptNode) =>
    isAdvancedTrackerScript(scriptNode, scriptMatchers),
  );

  const cmpMarkers = [];
  matchedScriptNodes.forEach((scriptNode) => {
    cmpPatterns.forEach((pattern) => {
      if (pattern.predicate(scriptNode)) {
        cmpMarkers.push({
          id: pattern.id,
          description: pattern.description || "",
          scriptSrc: scriptNode.getAttribute("src") || "",
        });
      }
    });
  });

  if (matchedScriptNodes.length === 0) {
    return {
      status: "missing_enriched_script",
      reason: "Enriched tracker script is missing from the tested page.",
      evidence: { matchedScripts: [], cmpMarkers, runtimeState },
    };
  }

  if (!runtimeState || typeof runtimeState.started === "undefined") {
    return {
      status: "enriched_script_detected",
      reason: "Enriched tracker script is detected in DOM. DOM presence is not proof of runtime execution.",
      evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState: runtimeState || null },
    };
  }

  if (!runtimeState.started) {
    return {
      status: "enriched_script_detected_but_not_executed",
      reason: "Enriched tracker script is detected in DOM, but runtime execution is not detected. DOM presence does not prove script execution.",
      evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState },
    };
  }

  if (!runtimeState.payloadSent) {
    return {
      status: "enriched_runtime_executed",
      reason: "Enriched runtime executed, but no enriched payload send is detected yet. DOM presence alone is only a structural signal.",
      evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState },
    };
  }

  const runtimeHasUnknownResponse = runtimeState.payloadSent && runtimeState.lastResponseStatus === null;
  const runtimeSentWithBeacon = runtimeState.payloadSent && runtimeState.lastResponseStatus === 'beacon';
  const payloadSkipped = runtimeState.lastTracked === false;

  if (runtimeHasUnknownResponse || runtimeSentWithBeacon) {
    return {
      status: 'enriched_runtime_executed_without_observable_response',
      reason: 'Enriched runtime executed and payload send is detected, but the HTTP response is not observable for this transport.',
      evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState },
    };
  }

  if (payloadSkipped) {
    return {
      status: 'enriched_payload_skipped',
      reason: 'Enriched runtime executed and payload was ignored by the server.',
      evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState },
    };
  }

  return {
    status: 'enriched_payload_accepted',
    reason: 'Enriched runtime executed and payload was accepted by the server.',
    evidence: { matchedScripts: matchedScriptNodes.map(normalizeScriptMatch), cmpMarkers, runtimeState },
  };
};

export const diagnoseAdvancedTrackerScriptsFromUrl = async ({ frontUrl, fetchImpl = window.fetch } = {}) => {
  if (!frontUrl) {
    return { status: "diagnostic_error", reason: "frontUrl is required.", evidence: { matchedScripts: [], cmpMarkers: [] } };
  }

  try {
    const response = await fetchImpl(frontUrl, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const parser = new window.DOMParser();
    const documentRef = parser.parseFromString(html, "text/html");
    const diagnostic = diagnoseAdvancedTrackerScripts({ documentRef });
    return { ...diagnostic, meta: { source: "source_html" } };
  } catch (error) {
    return {
      status: "diagnostic_error",
      reason: error?.message || "Unable to run diagnostics.",
      evidence: { matchedScripts: [], cmpMarkers: [] },
    };
  }
};
