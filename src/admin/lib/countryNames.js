import { __ } from "@wordpress/i18n";

import countryNamesFr from "../data/country-names-fr.json";

const UNKNOWN_CODES = new Set(["", "XX", "ZZ", "UNKNOWN"]);

const normalizeCountryCode = (code) => {
  if (typeof code !== "string") {
    return "";
  }

  return code.trim().toUpperCase();
};

export const isUnknownCountryCode = (code) => {
  const normalized = normalizeCountryCode(code);
  return !normalized || UNKNOWN_CODES.has(normalized);
};

export const getCountryFlagClass = (code) => {
  const normalized = normalizeCountryCode(code);
  if (isUnknownCountryCode(normalized)) {
    return "";
  }

  return `fi fi-${normalized.toLowerCase()}`;
};


const normalizedCountryNameKey = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const regionNameToCodeCache = new Map();

const getRegionNameToCodeMap = () => {
  if (regionNameToCodeCache.size > 0) {
    return regionNameToCodeCache;
  }

  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return regionNameToCodeCache;
  }

  let regionCodes = [];
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      regionCodes = Intl.supportedValuesOf("region");
    } catch (error) {
      regionCodes = [];
    }
  }

  if (!regionCodes.length) {
    regionCodes = Object.keys(countryNamesFr).filter((code) => /^[A-Z]{2}$/.test(code));
  }

  if (!regionCodes.length) {
    return regionNameToCodeCache;
  }

  const locales = ["en", "fr", getAdminLocale()];
  locales.forEach((locale) => {
    const displayNames = getDisplayNames(locale);
    if (!displayNames) {
      return;
    }

    regionCodes.forEach((code) => {
      try {
        const label = displayNames.of(code);
        const key = normalizedCountryNameKey(label);
        if (key && !regionNameToCodeCache.has(key)) {
          regionNameToCodeCache.set(key, code);
        }
      } catch (error) {
        // Ignore invalid region-code labels.
      }
    });
  });

  return regionNameToCodeCache;
};

export const resolveCountryCode = (value) => {
  const normalizedCode = normalizeCountryCode(value);
  if (/^[A-Z]{2}$/.test(normalizedCode) && !isUnknownCountryCode(normalizedCode)) {
    return normalizedCode;
  }

  const nameKey = normalizedCountryNameKey(value);
  if (!nameKey) {
    return "";
  }

  const byIntlName = getRegionNameToCodeMap().get(nameKey);
  if (byIntlName && !isUnknownCountryCode(byIntlName)) {
    return byIntlName;
  }

  const frEntry = Object.entries(countryNamesFr).find(
    ([, label]) => normalizedCountryNameKey(label) === nameKey
  );
  if (frEntry && !isUnknownCountryCode(frEntry[0])) {
    return frEntry[0];
  }

  return "";
};

const getAdminLocale = () => {
  if (typeof document !== "undefined" && document.documentElement?.lang) {
    return document.documentElement.lang;
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "en";
};

const getDisplayNames = (locale) => {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return null;
  }

  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch (error) {
    return null;
  }
};

export const getCountryLabel = (code) => {
  const normalized = normalizeCountryCode(code);
  if (isUnknownCountryCode(normalized)) {
    return __("Unknown country", "bimbeau-privacy-analytics");
  }

  const locale = getAdminLocale();
  const displayNames = getDisplayNames(locale);
  if (displayNames) {
    try {
      const label = displayNames.of(normalized);
      if (label && label !== normalized) {
        return label;
      }
    } catch (error) {
      // Ignore invalid region codes and fall back to static labels.
    }
  }

  if (locale.toLowerCase().startsWith("fr")) {
    return countryNamesFr[normalized] || __("Unknown country", "bimbeau-privacy-analytics");
  }

  return normalized;
};
