import { __ } from "@wordpress/i18n";

export const ADMIN_CONFIG = window.BBPAAdmin || null;

export const DEFAULT_PANELS = [
  { name: "dashboard", title: __("Dashboard", "bimbeau-privacy-analytics") },
  { name: "realtime", title: __("Real-time", "bimbeau-privacy-analytics") },
  { name: "top-pages", title: __("Pages", "bimbeau-privacy-analytics") },
  {
    name: "acquisition",
    title: __("Acquisition", "bimbeau-privacy-analytics"),
  },
  {
    name: "referrers",
    title: __("Referring sites", "bimbeau-privacy-analytics"),
  },
  {
    name: "search-terms",
    title: __("Internal searches", "bimbeau-privacy-analytics"),
  },
  {
    name: "geolocation",
    title: __("Geolocation", "bimbeau-privacy-analytics"),
  },
  { name: "visitors", title: __("Visitors", "bimbeau-privacy-analytics") },
  { name: "devices", title: __("Devices", "bimbeau-privacy-analytics") },
  { name: "settings", title: __("Settings", "bimbeau-privacy-analytics") },
];

export const DEFAULT_SETTINGS = {
  advanced_stats_enabled: false,
  referrer_favicons_enabled: false,
  respect_dnt_gpc: true,
  url_strip_query: true,
  url_query_allowlist: [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "gclid",
    "gbraid",
    "wbraid",
    "msclkid",
  ],
  raw_logs_retention_days: 1,
  aggregated_data_retention_days: 365,
  overview_totals_retention_days: 730,
  aggregated_retention_frequency_days: 30,
  excluded_roles: [],
  stats_access_roles: [],
  settings_access_roles: [],
  contact_access_roles: [],
  excluded_paths: [],
  debug_enabled: false,
  geo_aggregation_enabled: true,
  geoip_lookup_mode: "local_database",
  geoip_update_frequency: "disabled",
  maxmind_account_id: "",
  maxmind_license_key: "",
  visit_identifier_window_seconds: 1800,
  delete_data_on_uninstall: false,
  
};

export const getDisabledPanels = () => [];

export const isPanelEnabled = () => true;

export const ADVANCED_STATS_DEPENDENT_PANELS = [
  "geolocation",
  "visitors",
  "devices",
  "realtime",
];

export const normalizeBooleanSetting = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["0", "false", "off", "no"].includes(normalized)) return false;
    if (["1", "true", "on", "yes"].includes(normalized)) return true;
  }

  return Boolean(value);
};

export const isAdvancedStatsEnabled = (settings = ADMIN_CONFIG?.settings) =>
  normalizeBooleanSetting(settings?.advanced_stats_enabled, true);

export const DEFAULT_RANGE_PRESET = "30d";
export const RANGE_PRESET_OPTIONS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "6m",
  "12m",
  "24m",
];
export const RANGE_PRESET_STORAGE_PREFIX = "bbpa_range_preset";
export const PERIOD_PRESET_OPTIONS = [
  {
    labelShort: __("Today", "bimbeau-privacy-analytics"),
    labelLong: __("Today", "bimbeau-privacy-analytics"),
    value: "today",
  },
  {
    labelShort: __("Yesterday", "bimbeau-privacy-analytics"),
    labelLong: __("Yesterday", "bimbeau-privacy-analytics"),
    value: "yesterday",
  },
  {
    labelShort: __("7d", "bimbeau-privacy-analytics"),
    labelLong: __("7 days", "bimbeau-privacy-analytics"),
    value: "7d",
  },
  {
    labelShort: __("30d", "bimbeau-privacy-analytics"),
    labelLong: __("30 days", "bimbeau-privacy-analytics"),
    value: "30d",
  },
  {
    labelShort: __("90d", "bimbeau-privacy-analytics"),
    labelLong: __("90 days", "bimbeau-privacy-analytics"),
    value: "90d",
  },
  {
    labelShort: __("6m", "bimbeau-privacy-analytics"),
    labelLong: __("6 months", "bimbeau-privacy-analytics"),
    value: "6m",
  },
  {
    labelShort: __("12m", "bimbeau-privacy-analytics"),
    labelLong: __("12 months", "bimbeau-privacy-analytics"),
    value: "12m",
  },
  {
    labelShort: __("24m", "bimbeau-privacy-analytics"),
    labelLong: __("24 months", "bimbeau-privacy-analytics"),
    value: "24m",
  },
];

export const PAGE_LABEL_DISPLAY_OPTIONS = ["url", "title"];
export const DEFAULT_PAGE_LABEL_DISPLAY = "url";
export const PAGE_LABEL_DISPLAY_STORAGE_PREFIX = "bbpa_page_label_display";
export const ADVANCED_CONSENT_LAST_TEST_STORAGE_PREFIX =
  "bbpa_advanced_consent_last_test";
export const ADVANCED_CONSENT_LAST_DIAGNOSTIC_STORAGE_PREFIX =
  "bbpa_advanced_consent_last_diagnostic";
