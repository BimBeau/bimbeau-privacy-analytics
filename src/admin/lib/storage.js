import {
  ADMIN_CONFIG,
  ADVANCED_CONSENT_LAST_DIAGNOSTIC_STORAGE_PREFIX,
  ADVANCED_CONSENT_LAST_TEST_STORAGE_PREFIX,
  LIST_DENSITY_OPTIONS,
  LIST_DENSITY_STORAGE_PREFIX,
  PAGE_LABEL_DISPLAY_OPTIONS,
  PAGE_LABEL_DISPLAY_STORAGE_PREFIX,
  RANGE_PRESET_OPTIONS,
  RANGE_PRESET_STORAGE_PREFIX,
  VISITORS_HIDE_PRIVATE_STORAGE_PREFIX,
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

/**
 * Return window.localStorage, or null when the browser blocks it.
 *
 * Reading the property itself throws a SecurityError when site data is
 * blocked (browser privacy settings, sandboxed frames), so it is read inside
 * try/catch: the admin then works without remembered preferences.
 *
 * @return {Storage|null} Local storage or null.
 */
const getLocalStorage = () => {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
};

/**
 * Build a browser storage key for the current WordPress user.
 *
 * @param {string} prefix Storage key prefix.
 * @return {string} `{prefix}:{userId}`, or `{prefix}:default` without user.
 */
export const getUserScopedStorageKey = (prefix) => {
  const userId = ADMIN_CONFIG?.currentUserId
    ? String(ADMIN_CONFIG.currentUserId)
    : "default";
  return `${prefix}:${userId}`;
};

export const normalizePageLabelDisplay = (mode) =>
  PAGE_LABEL_DISPLAY_OPTIONS.includes(mode) ? mode : null;

export const getRangePresetStorageKey = () =>
  getUserScopedStorageKey(RANGE_PRESET_STORAGE_PREFIX);

export const getRangeSelectionFromUrl = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return normalizeRangeSelection(params.get("period") || params.get("range"));
};

export const getStoredRangeSelection = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return normalizeRangeSelection(
      storage.getItem(getRangePresetStorageKey()),
    );
  } catch (error) {
    return null;
  }
};

export const storeRangeSelection = (selection) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    if (selection?.type === "preset") {
      storage.setItem(getRangePresetStorageKey(), selection.preset);
      return;
    }

    if (selection?.type === "custom") {
      storage.setItem(
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

export const getPageLabelDisplayStorageKey = () =>
  getUserScopedStorageKey(PAGE_LABEL_DISPLAY_STORAGE_PREFIX);

export const getStoredPageLabelDisplay = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return normalizePageLabelDisplay(
      storage.getItem(getPageLabelDisplayStorageKey()),
    );
  } catch (error) {
    return null;
  }
};

export const storePageLabelDisplay = (mode) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(getPageLabelDisplayStorageKey(), mode);
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const isValidPageLabelDisplay = (mode) =>
  Boolean(normalizePageLabelDisplay(mode));

export const normalizeListDensity = (density) =>
  LIST_DENSITY_OPTIONS.includes(density) ? density : null;

export const getListDensityStorageKey = () =>
  getUserScopedStorageKey(LIST_DENSITY_STORAGE_PREFIX);

export const getStoredListDensity = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return normalizeListDensity(storage.getItem(getListDensityStorageKey()));
  } catch (error) {
    return null;
  }
};

export const storeListDensity = (density) => {
  const storage = getLocalStorage();
  if (!storage || !normalizeListDensity(density)) {
    return;
  }

  try {
    storage.setItem(getListDensityStorageKey(), density);
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const getVisitorsHidePrivateStorageKey = () =>
  getUserScopedStorageKey(VISITORS_HIDE_PRIVATE_STORAGE_PREFIX);

/**
 * Read the "Hide private visitors" preference of the current user.
 *
 * @return {boolean|null} Stored preference, or null when none is stored.
 */
export const getStoredVisitorsHidePrivate = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(getVisitorsHidePrivateStorageKey());
    if (rawValue === "1") {
      return true;
    }

    return rawValue === "0" ? false : null;
  } catch (error) {
    return null;
  }
};

export const storeVisitorsHidePrivate = (hidePrivate) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(getVisitorsHidePrivateStorageKey(), hidePrivate ? "1" : "0");
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const getAdvancedConsentLastTestStorageKey = () =>
  getUserScopedStorageKey(ADVANCED_CONSENT_LAST_TEST_STORAGE_PREFIX);

export const getStoredAdvancedConsentLastTestAt = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(
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
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const timestamp = Number(value instanceof Date ? value.getTime() : value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return;
  }

  try {
    storage.setItem(
      getAdvancedConsentLastTestStorageKey(),
      String(timestamp),
    );
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};

export const getAdvancedConsentLastDiagnosticStorageKey = () =>
  getUserScopedStorageKey(ADVANCED_CONSENT_LAST_DIAGNOSTIC_STORAGE_PREFIX);

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
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(
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
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const normalizedDiagnostic = normalizeStoredAdvancedConsentDiagnostic(value);
  if (!normalizedDiagnostic) {
    return;
  }

  try {
    storage.setItem(
      getAdvancedConsentLastDiagnosticStorageKey(),
      JSON.stringify(normalizedDiagnostic),
    );
  } catch (error) {
    // Ignore storage failures (e.g. privacy mode).
  }
};
