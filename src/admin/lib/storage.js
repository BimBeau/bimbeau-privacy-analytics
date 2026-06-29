import {
  ADMIN_CONFIG,
  ADVANCED_CONSENT_LAST_DIAGNOSTIC_STORAGE_PREFIX,
  ADVANCED_CONSENT_LAST_TEST_STORAGE_PREFIX,
  PAGE_LABEL_DISPLAY_OPTIONS,
  PAGE_LABEL_DISPLAY_STORAGE_PREFIX,
  RANGE_PRESET_OPTIONS,
  RANGE_PRESET_STORAGE_PREFIX,
} from "../constants";
import { isRangeWithinMaxDays, isValidDateString } from "./date";

const normalizeRangeSelection = (selection) => {
  if (!selection) {
    return null;
  }

  if (typeof selection === "string") {
    if (RANGE_PRESET_OPTIONS.includes(selection)) {
      return { type: "preset", preset: selection };
    }

    try {
      return normalizeRangeSelection(JSON.parse(selection));
    } catch (error) {
      return null;
    }
  }

  if (typeof selection !== "object") {
    return null;
  }

  if (selection.type === "preset") {
    return RANGE_PRESET_OPTIONS.includes(selection.preset)
      ? { type: "preset", preset: selection.preset }
      : null;
  }

  if (selection.type === "custom") {
    if (
      isValidDateString(selection.start) &&
      isValidDateString(selection.end) &&
      isRangeWithinMaxDays(selection.start, selection.end)
    ) {
      return {
        type: "custom",
        start: selection.start,
        end: selection.end,
      };
    }
  }

  return null;
};

export const normalizePageLabelDisplay = (mode) =>
  PAGE_LABEL_DISPLAY_OPTIONS.includes(mode) ? mode : null;

export const getRangePresetStorageKey = () => {
  const userId = ADMIN_CONFIG?.currentUserId
    ? String(ADMIN_CONFIG.currentUserId)
    : "default";
  return `${RANGE_PRESET_STORAGE_PREFIX}:${userId}`;
};

export const getRangeSelectionFromUrl = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return normalizeRangeSelection(params.get("period") || params.get("range"));
};

export const getStoredRangeSelection = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    return normalizeRangeSelection(
      window.localStorage.getItem(getRangePresetStorageKey()),
    );
  } catch (error) {
    return null;
  }
};

export const storeRangeSelection = (selection) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    if (selection?.type === "preset") {
      window.localStorage.setItem(getRangePresetStorageKey(), selection.preset);
      return;
    }

    if (selection?.type === "custom") {
      window.localStorage.setItem(
        getRangePresetStorageKey(),
        JSON.stringify({
          type: "custom",
          start: selection.start,
          end: selection.end,
        }),
      );
    }
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const isValidRangeSelection = (selection) =>
  Boolean(normalizeRangeSelection(selection));

export const getPageLabelDisplayStorageKey = () => {
  const userId = ADMIN_CONFIG?.currentUserId
    ? String(ADMIN_CONFIG.currentUserId)
    : "default";
  return `${PAGE_LABEL_DISPLAY_STORAGE_PREFIX}:${userId}`;
};

export const getStoredPageLabelDisplay = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    return normalizePageLabelDisplay(
      window.localStorage.getItem(getPageLabelDisplayStorageKey()),
    );
  } catch (error) {
    return null;
  }
};

export const storePageLabelDisplay = (mode) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(getPageLabelDisplayStorageKey(), mode);
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const isValidPageLabelDisplay = (mode) =>
  Boolean(normalizePageLabelDisplay(mode));

export const getAdvancedConsentLastTestStorageKey = () => {
  const userId = ADMIN_CONFIG?.currentUserId
    ? String(ADMIN_CONFIG.currentUserId)
    : "default";
  return `${ADVANCED_CONSENT_LAST_TEST_STORAGE_PREFIX}:${userId}`;
};

export const getStoredAdvancedConsentLastTestAt = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      getAdvancedConsentLastTestStorageKey(),
    );
    const timestamp = Number(rawValue);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }

    const parsedDate = new Date(timestamp);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  } catch (error) {
    return null;
  }
};

export const storeAdvancedConsentLastTestAt = (value) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const timestamp = Number(value instanceof Date ? value.getTime() : value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return;
  }

  try {
    window.localStorage.setItem(
      getAdvancedConsentLastTestStorageKey(),
      String(timestamp),
    );
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const getAdvancedConsentLastDiagnosticStorageKey = () => {
  const userId = ADMIN_CONFIG?.currentUserId
    ? String(ADMIN_CONFIG.currentUserId)
    : "default";
  return `${ADVANCED_CONSENT_LAST_DIAGNOSTIC_STORAGE_PREFIX}:${userId}`;
};

const normalizeStoredAdvancedConsentDiagnostic = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const status = typeof value.status === "string" ? value.status : "unknown";
  const reason = typeof value.reason === "string" ? value.reason : "";
  const evidence = value.evidence && typeof value.evidence === "object"
    ? value.evidence
    : {};
  const meta = value.meta && typeof value.meta === "object" ? value.meta : {};

  return {
    status,
    reason,
    evidence: {
      matchedScripts: Array.isArray(evidence.matchedScripts)
        ? evidence.matchedScripts
        : [],
      cmpMarkers: Array.isArray(evidence.cmpMarkers) ? evidence.cmpMarkers : [],
      consentSignals: Array.isArray(evidence.consentSignals)
        ? evidence.consentSignals
        : [],
      runtimeSignals: Array.isArray(evidence.runtimeSignals)
        ? evidence.runtimeSignals
        : [],
    },
    meta: {
      source: typeof meta.source === "string" ? meta.source : "unknown",
      observedDurationMs: Number.isFinite(Number(meta.observedDurationMs))
        ? Number(meta.observedDurationMs)
        : 0,
    },
  };
};

export const getStoredAdvancedConsentLastDiagnostic = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      getAdvancedConsentLastDiagnosticStorageKey(),
    );
    if (!rawValue) {
      return null;
    }

    return normalizeStoredAdvancedConsentDiagnostic(JSON.parse(rawValue));
  } catch (error) {
    return null;
  }
};

export const storeAdvancedConsentLastDiagnostic = (value) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const normalizedDiagnostic = normalizeStoredAdvancedConsentDiagnostic(value);
  if (!normalizedDiagnostic) {
    return;
  }

  try {
    window.localStorage.setItem(
      getAdvancedConsentLastDiagnosticStorageKey(),
      JSON.stringify(normalizedDiagnostic),
    );
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};
