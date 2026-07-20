import { useCallback, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import {
  BaseControl,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxControl,
  Flex,
  FlexItem,
  Icon,
  Modal,
  Snackbar,
  ExternalLink,
  TabPanel,
  SelectControl,
  TextControl,
  TextareaControl,
  ToggleControl,
} from "@wordpress/components";
import Notice from "../components/BrandNotice";

import {
  chartBar,
  cloud,
  comment,
  desktop,
  pages,
} from "@wordpress/icons";
import {
  LuBug,
  LuClock,
  LuGauge,
  LuHardDrive,
  LuListFilter,
  LuMapPinCheck,
  LuPanelLeft,
  LuBookmark,
  LuClipboardCheck,
  LuRuler,
  LuShieldCheck,
  LuRoute,
  LuTrash2,
  LuUserCog,
  LuWrench,
} from "react-icons/lu";

import useAdminEndpoint, {
  buildRestUrl,
  fetchAdminJson,
} from "../api/useAdminEndpoint";
import DataState from "../components/DataState";
import BpaCard from "../components/BpaCard";


import {
  ADMIN_CONFIG,
  getDisablablePanelOptions,
  DEFAULT_SETTINGS,
  ADVANCED_STATS_DEPENDENT_PANELS,
} from "../constants";
import { createLogger, createTraceId } from "../logger";

const DEBUG_FLAG = Boolean(
  window.BBPA_DEBUG ?? ADMIN_CONFIG?.settings?.debugEnabled,
);

const AGGREGATED_RETENTION_PRESETS = [
  30, 60, 90, 180, 365, 730, 1095, 1825, 3650,
];
const OVERVIEW_TOTALS_RETENTION_PRESETS = [365, 730, 1095, 1825, 3650];
const AGGREGATED_RETENTION_FREQUENCY_PRESETS = [1, 7, 15, 30, 45, 60, 90];
const GEOIP_UPDATE_FREQUENCY_OPTIONS = [
  { value: "disabled", label: __("Manual updates only", "bimbeau-privacy-analytics") },
  { value: "15_days", label: __("Every 15 days", "bimbeau-privacy-analytics") },
  { value: "30_days", label: __("Every 30 days", "bimbeau-privacy-analytics") },
  { value: "45_days", label: __("Every 45 days", "bimbeau-privacy-analytics") },
  { value: "60_days", label: __("Every 60 days", "bimbeau-privacy-analytics") },
  { value: "3_months", label: __("Every 3 months", "bimbeau-privacy-analytics") },
  { value: "6_months", label: __("Every 6 months", "bimbeau-privacy-analytics") },
  { value: "1_year", label: __("Every year", "bimbeau-privacy-analytics") },
  { value: "2_years", label: __("Every 2 years", "bimbeau-privacy-analytics") },
];
const formatAggregatedRetentionOptionLabel = (days) => {
  if (days < 365) {
    return __("Keep report details for %(days)s days", "bimbeau-privacy-analytics").replace(
      "%(days)s",
      String(days),
    );
  }

  const years = Math.round(days / 365);
  if (years === 1) {
    return __("Keep report details for 1 year", "bimbeau-privacy-analytics");
  }

  return __("Keep report details for %(years)s years", "bimbeau-privacy-analytics").replace(
    "%(years)s",
    String(years),
  );
};

const formatOverviewTotalsRetentionOptionLabel = (days) => {
  const years = Math.round(days / 365);
  if (years === 1) {
    return __("Keep totals for 1 year", "bimbeau-privacy-analytics");
  }

  return __("Keep totals for %(years)s years", "bimbeau-privacy-analytics").replace(
    "%(years)s",
    String(years),
  );
};

const formatAggregatedRetentionFrequencyOptionLabel = (days) => {
  if (days === 1) {
    return __("Run every day", "bimbeau-privacy-analytics");
  }

  return __("Run every %(days)s days", "bimbeau-privacy-analytics").replace(
    "%(days)s",
    String(days),
  );
};

const SettingsSectionTitle = ({ icon: IconComponent, children }) => (
  <h3 className="bbpa-settings-section__title">
    <span className="bbpa-settings-section__title-icon-wrap">
      <IconComponent size={16} aria-hidden="true" />
      <span>{children}</span>
    </span>
  </h3>
);

const DATA_FEATURE_ICONS = {
  "Page views": pages,
  "Device type": desktop,
  "Reliable counting": chartBar,
  "Visit journey": LuRoute,
  "Engagement time": LuClock,
  "Display format": LuRuler,
  Interactions: comment,
  Location: LuMapPinCheck,
};

const DataFeatureGrid = ({ items = [] }) => (
  <div className="bbpa-settings-data-feature-grid" role="list" aria-label={__("Data scope list", "bimbeau-privacy-analytics")}>
    {items.map((item) => (
      <Card key={item} className="bbpa-settings-data-chip" size="small" role="listitem">
        <CardBody>
          <Flex gap={2} align="center" justify="flex-start">
            {(() => {
              const FeatureIcon = DATA_FEATURE_ICONS[item];

              if (typeof FeatureIcon === "function") {
                return <FeatureIcon size={18} aria-hidden="true" />;
              }

              if (FeatureIcon && typeof FeatureIcon !== "string") {
                return <Icon icon={FeatureIcon} size={18} />;
              }

              return <Icon icon={cloud} size={18} />;
            })()}
            <span className="bbpa-settings-data-chip__label">{__(item, "bimbeau-privacy-analytics")}</span>
          </Flex>
        </CardBody>
      </Card>
    ))}
  </div>
);

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeSettings = (settings) => ({
  ...DEFAULT_SETTINGS,
  ...(settings || {}),
  raw_logs_retention_days: Number.parseInt(
    settings?.raw_logs_retention_days,
    10,
  ) || DEFAULT_SETTINGS.raw_logs_retention_days,
  aggregated_data_retention_days: Number.parseInt(
    settings?.aggregated_data_retention_days,
    10,
  ) || DEFAULT_SETTINGS.aggregated_data_retention_days,
  overview_totals_retention_days: Number.parseInt(
    settings?.overview_totals_retention_days,
    10,
  ) || DEFAULT_SETTINGS.overview_totals_retention_days,
  aggregated_retention_frequency_days: Number.parseInt(
    settings?.aggregated_retention_frequency_days,
    10,
  ) || DEFAULT_SETTINGS.aggregated_retention_frequency_days,
  visit_identifier_window_seconds: Number.parseInt(
    settings?.visit_identifier_window_seconds,
    10,
  ) || DEFAULT_SETTINGS.visit_identifier_window_seconds,
  debug_enabled: Boolean(settings?.debug_enabled),
  geoip_update_frequency:
    typeof settings?.geoip_update_frequency === "string" &&
      settings.geoip_update_frequency
      ? settings.geoip_update_frequency
      : DEFAULT_SETTINGS.geoip_update_frequency,
  
  disabled_panels: Array.isArray(settings?.disabled_panels)
    ? settings.disabled_panels
    : Array.isArray(settings?.hidden_panels)
      ? settings.hidden_panels
      : normalizeArray(DEFAULT_SETTINGS.disabled_panels),
  stats_access_roles: Array.isArray(settings?.stats_access_roles)
    ? settings.stats_access_roles
    : normalizeArray(DEFAULT_SETTINGS.stats_access_roles),
  settings_access_roles: Array.isArray(settings?.settings_access_roles)
    ? settings.settings_access_roles
    : normalizeArray(DEFAULT_SETTINGS.settings_access_roles),
  contact_access_roles: Array.isArray(settings?.contact_access_roles)
    ? settings.contact_access_roles
    : normalizeArray(DEFAULT_SETTINGS.contact_access_roles),
  excluded_roles: Array.isArray(settings?.excluded_roles)
    ? settings.excluded_roles
    : normalizeArray(DEFAULT_SETTINGS.excluded_roles),
  excluded_paths: Array.isArray(settings?.excluded_paths)
    ? settings.excluded_paths
    : normalizeArray(DEFAULT_SETTINGS.excluded_paths),
  url_query_allowlist: Array.isArray(settings?.url_query_allowlist)
    ? settings.url_query_allowlist
    : normalizeArray(DEFAULT_SETTINGS.url_query_allowlist),
  
});

const SettingsPanel = () => {
  const { data, isLoading, error } = useAdminEndpoint("/admin/settings");
  const [formState, setFormState] = useState(() =>
    normalizeSettings(DEFAULT_SETTINGS),
  );
  const [adminCacheVersion, setAdminCacheVersion] = useState(
    Number(ADMIN_CONFIG?.settings?.adminCacheVersion || 1),
  );
  const [allowlistInput, setAllowlistInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [saveToast, setSaveToast] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isPurgeConfirmed, setIsPurgeConfirmed] = useState(false);
  const [isAggregatedPurgeOpen, setIsAggregatedPurgeOpen] = useState(false);
  const [isAggregatedPurging, setIsAggregatedPurging] = useState(false);
  const [isAggregatedPurgeConfirmed, setIsAggregatedPurgeConfirmed] =
    useState(false);
  
  const [purgeNotice, setPurgeNotice] = useState(null);
  const [isTestingMaxMind, setIsTestingMaxMind] = useState(false);
  const [maxMindTestNotice, setMaxMindTestNotice] = useState(null);
  const [isUpdatingGeoIpDb, setIsUpdatingGeoIpDb] = useState(false);
  const [geoIpDbNotice, setGeoIpDbNotice] = useState(null);
  const [geoIpDbStatus, setGeoIpDbStatus] = useState(null);

  const [availableGranularities, setAvailableGranularities] = useState(
    Array.isArray(data?.availableGranularities)
      ? data.availableGranularities
      : [],
  );
  const [showCmpHelp, setShowCmpHelp] = useState(false);
  const formStateRef = useRef(formState);

  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);

  useEffect(() => {
    if (!saveToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveToast(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [saveToast]);
  const aggregatedRetentionOptions = useMemo(() => {
    const current = Number.parseInt(
      formState.aggregated_data_retention_days,
      10,
    );
    const values = new Set(AGGREGATED_RETENTION_PRESETS);
    if (!Number.isNaN(current) && current >= 30 && current <= 3650) {
      values.add(current);
    }

    return Array.from(values)
      .sort((a, b) => a - b)
      .map((days) => ({
        label: formatAggregatedRetentionOptionLabel(days),
        value: String(days),
      }));
  }, [formState.aggregated_data_retention_days]);
  const overviewTotalsRetentionOptions = useMemo(() => {
    const current = Number.parseInt(formState.overview_totals_retention_days, 10);
    const values = new Set(OVERVIEW_TOTALS_RETENTION_PRESETS);
    if (!Number.isNaN(current) && current >= 365 && current <= 3650) {
      values.add(current);
    }

    return Array.from(values)
      .sort((a, b) => a - b)
      .map((days) => ({
        label: formatOverviewTotalsRetentionOptionLabel(days),
        value: String(days),
      }));
  }, [formState.overview_totals_retention_days]);
  const logger = useMemo(() => createLogger({ debugEnabled: DEBUG_FLAG }), []);
  const aggregatedRetentionFrequencyOptions = useMemo(() => {
    const current = Number.parseInt(
      formState.aggregated_retention_frequency_days,
      10,
    );
    const values = new Set(AGGREGATED_RETENTION_FREQUENCY_PRESETS);
    if (!Number.isNaN(current) && current >= 1 && current <= 365) {
      values.add(current);
    }

    return Array.from(values)
      .sort((a, b) => a - b)
      .map((days) => ({
        label: formatAggregatedRetentionFrequencyOptionLabel(days),
        value: String(days),
      }));
  }, [formState.aggregated_retention_frequency_days]);
  const geoIpDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );
  const validateMaxMindFields = (nextState, options = {}) => {
    const { requireFilled = false } = options;
    const errors = {};
    const lookupMode = nextState.geoip_lookup_mode || "local_database";
    const accountId = String(nextState.maxmind_account_id || "").trim();
    const licenseKey = String(nextState.maxmind_license_key || "").trim();
    const shouldValidate =
      lookupMode === "maxmind_api" || (requireFilled && (accountId || licenseKey));

    if (!shouldValidate) {
      return errors;
    }

    if (!accountId) {
      errors.maxmind_account_id = __(
        "MaxMind Account ID is required.",
        "bimbeau-privacy-analytics",
      );
    } else if (!/^\d+$/.test(accountId)) {
      errors.maxmind_account_id = __(
        "MaxMind Account ID must be numeric.",
        "bimbeau-privacy-analytics",
      );
    }

    if (!licenseKey) {
      errors.maxmind_license_key = __(
        "MaxMind License Key is required.",
        "bimbeau-privacy-analytics",
      );
    }

    return errors;
  };

  useEffect(() => {
    if (data?.settings) {
      const normalized = normalizeSettings(data.settings);
      setFormState(normalized);
      setAllowlistInput(normalized.url_query_allowlist.join(", "));
      window.BBPA_DEBUG = Boolean(normalized.debug_enabled);
      setValidationErrors({});
    }
    setAvailableGranularities(
      Array.isArray(data?.availableGranularities)
        ? data.availableGranularities
        : [],
    );
  }, [data]);

  const refreshGeoIpDbStatus = async () => {
    try {
      const payload = await fetchAdminJson("/admin/geoip-database/status");
      setGeoIpDbStatus(payload?.database || null);
    } catch (statusError) {
      setGeoIpDbStatus(null);
      setGeoIpDbNotice({
        status: "error",
        message:
          statusError?.message ||
          __("Unable to load the GeoIP database status.", "bimbeau-privacy-analytics"),
      });
    }
  };

  useEffect(() => {
    refreshGeoIpDbStatus();
  }, []);

  const persistSettings = async (nextState, options = {}) => {
    if (!ADMIN_CONFIG?.restNonce || !ADMIN_CONFIG?.restUrl) {
      setSaveNotice({
        status: "error",
        message: __("Missing REST configuration.", "bimbeau-privacy-analytics"),
      });
      return { ok: false, message: __("Missing REST configuration.", "bimbeau-privacy-analytics") };
    }

    const {
      skipValidation = false,
      successMessage = __("Settings saved.", "bimbeau-privacy-analytics"),
      showToast = true,
    } = options;
    if (!skipValidation) {
      const errors = validateMaxMindFields(nextState, { requireFilled: false });
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        setSaveNotice({
          status: "error",
          message: Object.values(errors).join(" "),
        });
        return { ok: false, message: Object.values(errors).join(" ") };
      }
    }

    setIsSaving(true);
    setSaveNotice(null);
    const traceId = createTraceId();
    logger.info("Saving settings", {
      action: "settings.save",
      traceId,
    });

    try {
      const response = await fetch(buildRestUrl("/admin/settings"), {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": ADMIN_CONFIG.restNonce,
        },
        body: JSON.stringify(nextState),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (payload?.data?.field_errors) {
          setValidationErrors(payload.data.field_errors);
        }
        throw new Error(
          payload?.message ||
          `${__("API error", "bimbeau-privacy-analytics")} (${response.status})`,
        );
      }

      const nextAdminCacheVersion = Number(
        payload?.cacheVersion || adminCacheVersion + 1,
      );
      let normalizedPayload = payload;
      if (!normalizedPayload?.settings) {
        normalizedPayload = await fetchAdminJson("/admin/settings", {
          params: {},
          urlOptions: {
            volatileParams: {
              _bbpa_cv: nextAdminCacheVersion,
              _bbpa_ts: Date.now(),
            },
          },
        });
      }

      if (normalizedPayload?.settings) {
        const normalized = normalizeSettings(normalizedPayload.settings);
        setFormState(normalized);
        setAllowlistInput(normalized.url_query_allowlist.join(", "));
        window.BBPA_DEBUG = Boolean(normalized.debug_enabled);
        setValidationErrors({});
        setAdminCacheVersion(nextAdminCacheVersion);
        setAvailableGranularities(normalizedPayload?.availableGranularities || []);
        if (ADMIN_CONFIG?.settings) {
          ADMIN_CONFIG.settings.adminCacheVersion = nextAdminCacheVersion;
        }
      }

      setSaveNotice({
        status: "success",
        message: successMessage,
      });
      if (showToast) {
        setSaveToast({
          status: "success",
          message: successMessage,
        });
      }
      logger.info("Settings saved", {
        action: "settings.save.success",
        traceId,
      });
      return { ok: true };
    } catch (saveError) {
      const errorMessage =
        saveError.message || __("Error while saving.", "bimbeau-privacy-analytics");
      setSaveNotice({
        status: "error",
        message: errorMessage,
      });
      setSaveToast({
        status: "error",
        message: errorMessage,
      });
      logger.error("Settings save error", {
        action: "settings.save.error",
        traceId,
        error: saveError?.message,
      });
      return { ok: false, message: errorMessage };
    } finally {
      setIsSaving(false);
    }
  };

  

  const onSave = async () => {
    await persistSettings(formState);
  };

  const onTestMaxMindConnection = async () => {
    if (!ADMIN_CONFIG?.restNonce || !ADMIN_CONFIG?.restUrl) {
      setMaxMindTestNotice({
        status: "error",
        message: __("Missing REST configuration.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    const errors = validateMaxMindFields(formState, { requireFilled: true });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setMaxMindTestNotice({
        status: "error",
        message: Object.values(errors).join(" "),
      });
      return;
    }

    setIsTestingMaxMind(true);
    setMaxMindTestNotice(null);

    try {
      const response = await fetch(buildRestUrl("/admin/maxmind-test"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": ADMIN_CONFIG.restNonce,
        },
        body: JSON.stringify({
          maxmind_account_id: formState.maxmind_account_id,
          maxmind_license_key: formState.maxmind_license_key,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (payload?.data?.field_errors) {
          setValidationErrors(payload.data.field_errors);
        }
        throw new Error(
          payload?.message ||
          `${__("API error", "bimbeau-privacy-analytics")} (${response.status})`,
        );
      }

      setMaxMindTestNotice({
        status: "success",
        message:
          payload?.message ||
          __("MaxMind connection succeeded.", "bimbeau-privacy-analytics"),
      });
    } catch (testError) {
      setMaxMindTestNotice({
        status: "error",
        message:
          testError.message ||
          __("Unable to connect to MaxMind.", "bimbeau-privacy-analytics"),
      });
    } finally {
      setIsTestingMaxMind(false);
    }
  };

  const onUpdateGeoIpDatabase = async () => {
    if (!ADMIN_CONFIG?.restNonce || !ADMIN_CONFIG?.restUrl) {
      setGeoIpDbNotice({
        status: "error",
        message: __("Missing REST configuration.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    setIsUpdatingGeoIpDb(true);
    setGeoIpDbNotice(null);

    try {
      const payload = await fetchAdminJson("/admin/geoip-database/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      setGeoIpDbNotice({
        status: payload?.status || "success",
        message:
          payload?.message ||
          __("GeoIP database updated successfully.", "bimbeau-privacy-analytics"),
      });
    } catch (updateError) {
      setGeoIpDbNotice({
        status: "error",
        message:
          updateError?.message ||
          __("Unable to update the GeoIP database.", "bimbeau-privacy-analytics"),
      });
    } finally {
      await refreshGeoIpDbStatus();
      setIsUpdatingGeoIpDb(false);
    }
  };

  const geoIpLastUpdated = useMemo(() => {
    const timestamp = Number(geoIpDbStatus?.last_updated || 0);
    if (!timestamp) {
      return "—";
    }

    return geoIpDateFormatter.format(new Date(timestamp * 1000));
  }, [geoIpDateFormatter, geoIpDbStatus?.last_updated]);

  const geoIpNextRun = useMemo(() => {
    if (formState.geoip_update_frequency === "disabled") {
      return __("No automatic update scheduled", "bimbeau-privacy-analytics");
    }

    const timestamp = Number(geoIpDbStatus?.next_scheduled || 0);
    if (!timestamp) {
      return __("Pending schedule", "bimbeau-privacy-analytics");
    }

    return geoIpDateFormatter.format(new Date(timestamp * 1000));
  }, [
    formState.geoip_update_frequency,
    geoIpDateFormatter,
    geoIpDbStatus?.next_scheduled,
  ]);

  const geoIpSizeMb = useMemo(() => {
    const size = Number(geoIpDbStatus?.file_size || 0);
    if (!size) {
      return "0.00 MB";
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }, [geoIpDbStatus?.file_size]);

  const geoIpLastAttempt = useMemo(() => {
    const timestamp = Number(geoIpDbStatus?.last_attempt_at || 0);
    if (!timestamp) {
      return "—";
    }

    return geoIpDateFormatter.format(new Date(timestamp * 1000));
  }, [geoIpDateFormatter, geoIpDbStatus?.last_attempt_at]);

  const geoIpUiStatus = useMemo(() => {
    const status = String(geoIpDbStatus?.status || "").toLowerCase();
    if (status === "success" || geoIpDbStatus?.operational) {
      return __("ok", "bimbeau-privacy-analytics");
    }

    if (status === "error") {
      return __("error", "bimbeau-privacy-analytics");
    }

    return __("pending", "bimbeau-privacy-analytics");
  }, [geoIpDbStatus?.operational, geoIpDbStatus?.status]);

  const geoIpDatabaseMode = useMemo(() => {
    const isOperational = geoIpDbStatus?.operational === true;
    const lastSuccessAt = Number(geoIpDbStatus?.last_success_at || 0);

    if (isOperational) {
      return "operational";
    }

    return lastSuccessAt > 0 ? "unavailable" : "missing";
  }, [geoIpDbStatus?.last_success_at, geoIpDbStatus?.operational]);

  const geoIpManualButtonLabel = useMemo(() => {
    if (geoIpDatabaseMode === "operational") {
      return __("Update GeoIP database", "bimbeau-privacy-analytics");
    }

    if (geoIpDatabaseMode === "unavailable") {
      return __("Download GeoIP database", "bimbeau-privacy-analytics");
    }

    return __("Download GeoIP database", "bimbeau-privacy-analytics");
  }, [geoIpDatabaseMode]);

  const geoIpMissingDatabaseCard = useMemo(() => {
    if (geoIpDatabaseMode === "operational") {
      return null;
    }

    if (geoIpDatabaseMode === "unavailable") {
      return {
        title: __("Local GeoIP database unavailable", "bimbeau-privacy-analytics"),
        body: __("The local GeoIP database seems to be missing or unreadable. Country and city reports may be incomplete until it is reinstalled.", "bimbeau-privacy-analytics"),
      };
    }

    return {
      title: __("GeoIP database not installed", "bimbeau-privacy-analytics"),
      body: __("Visitor origin cannot be displayed until the local GeoIP database has been downloaded. To install it, click “Download GeoIP database”. This action will contact an external service and store the database in the WordPress uploads directory.", "bimbeau-privacy-analytics"),
    };
  }, [geoIpDatabaseMode]);

  const onPurge = async () => {
    if (!ADMIN_CONFIG?.restNonce || !ADMIN_CONFIG?.restUrl) {
      setPurgeNotice({
        status: "error",
        message: __("Missing REST configuration.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    setIsPurging(true);
    setPurgeNotice(null);
    const traceId = createTraceId();
    logger.info("Purging analytics data", {
      action: "settings.purge",
      traceId,
    });

    try {
      const response = await fetch(buildRestUrl("/admin/purge-data"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": ADMIN_CONFIG.restNonce,
        },
      });

      if (!response.ok) {
        throw new Error(
          `${__("API error", "bimbeau-privacy-analytics")} (${response.status})`,
        );
      }

      await response.json();
      setPurgeNotice({
        status: "success",
        message: __("Analytics data purged.", "bimbeau-privacy-analytics"),
      });
      logger.info("Analytics data purged", {
        action: "settings.purge.success",
        traceId,
      });
    } catch (purgeError) {
      setPurgeNotice({
        status: "error",
        message: purgeError.message || __("Error while purging.", "bimbeau-privacy-analytics"),
      });
      logger.error("Purge error", {
        action: "settings.purge.error",
        traceId,
        error: purgeError?.message,
      });
    } finally {
      setIsPurging(false);
      setIsPurgeOpen(false);
      setIsPurgeConfirmed(false);
    }
  };

  const onPurgeAggregatedData = async () => {
    if (!ADMIN_CONFIG?.restNonce || !ADMIN_CONFIG?.restUrl) {
      setPurgeNotice({
        status: "error",
        message: __("Missing REST configuration.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    setIsAggregatedPurging(true);
    setPurgeNotice(null);
    const traceId = createTraceId();
    logger.info("Purging aggregated analytics data", {
      action: "settings.purge.aggregated",
      traceId,
    });

    try {
      const response = await fetch(buildRestUrl("/admin/purge-aggregated-data"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": ADMIN_CONFIG.restNonce,
        },
      });

      if (!response.ok) {
        throw new Error(
          `${__("API error", "bimbeau-privacy-analytics")} (${response.status})`,
        );
      }

      await response.json();
      setPurgeNotice({
        status: "success",
        message: __("Aggregated analytics data purged.", "bimbeau-privacy-analytics"),
      });
      logger.info("Aggregated analytics data purged", {
        action: "settings.purge.aggregated.success",
        traceId,
      });
    } catch (purgeError) {
      setPurgeNotice({
        status: "error",
        message: purgeError.message || __("Error while purging.", "bimbeau-privacy-analytics"),
      });
      logger.error("Aggregated purge error", {
        action: "settings.purge.aggregated.error",
        traceId,
        error: purgeError?.message,
      });
    } finally {
      setIsAggregatedPurging(false);
      setIsAggregatedPurgeOpen(false);
      setIsAggregatedPurgeConfirmed(false);
    }
  };

  

  const roles = normalizeArray(ADMIN_CONFIG?.roles);
  const accessRoles = roles.filter(
    (role) => role.key !== "administrator" && Boolean(role.canDelegateAccess),
  );
  const permissionGroups = [
    {
      key: "stats_access_roles",
      title: __("Stats", "bimbeau-privacy-analytics"),
      description: __(
        "Access to dashboards, KPI cards, and analytics reports.",
        "bimbeau-privacy-analytics",
      ),
    },
    {
      key: "settings_access_roles",
      title: __("Settings", "bimbeau-privacy-analytics"),
      description: __(
        "Access to plugin configuration and administration options.",
        "bimbeau-privacy-analytics",
      ),
    },
    {
      key: "contact_access_roles",
      title: __("Contact", "bimbeau-privacy-analytics"),
      description: __("Access to the plugin Contact page.", "bimbeau-privacy-analytics"),
    },
  ];
  const postTypes = normalizeArray(ADMIN_CONFIG?.settings?.postTypes);
  
  const settingsTabs = [
    {
      name: "general",
      title: __("General", "bimbeau-privacy-analytics"),
    },
    {
      name: "tracking",
      title: __("Tracking & privacy", "bimbeau-privacy-analytics"),
    },
    {
      name: "geolocation",
      title: __("Geolocation", "bimbeau-privacy-analytics"),
    },
    
    {
      name: "maintenance",
      title: __("Maintenance", "bimbeau-privacy-analytics"),
    },
  ];
  const isApiLookupMode = formState.geoip_lookup_mode === "maxmind_api";
  const isAdvancedStatsDisabled = !formState.advanced_stats_enabled;
  const disablablePanelOptions = useMemo(
    () => getDisablablePanelOptions(ADMIN_CONFIG?.disablablePanels),
    [],
  );
  
  let eventsPurgeButton = null;
  let eventsPurgeModal = null;

  


  const initialSettingsTabName = useMemo(() => {
    const params = new URLSearchParams(window.location.search || "");
    const requestedTab = params.get("bbpa_settings_tab") || "general";
    return settingsTabs.some((tab) => tab.name === requestedTab) ? requestedTab : "general";
  }, [settingsTabs]);


  return (
    <BpaCard title={__("Settings", "bimbeau-privacy-analytics")}>
      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={false}
        emptyLabel=""
        loadingLabel={__("Loading settings…", "bimbeau-privacy-analytics")}
        skeletonRows={6}
      />
      {!isLoading && !error && (
        <TabPanel className="bbpa-settings-tabs" tabs={settingsTabs} initialTabName={initialSettingsTabName}>
          {(tab) => {
            const activeTab = tab?.name || "general";
            return (
              <div className="bbpa-settings-form">
                {saveNotice && (
                  <Notice status={saveNotice.status} isDismissible={false}>
                    {saveNotice.message}
                  </Notice>
                )}
                {purgeNotice && (
                  <Notice status={purgeNotice.status} isDismissible={false}>
                    {purgeNotice.message}
                  </Notice>
                )}
                {activeTab === "general" && (
                  <div className="bbpa-general-settings">
                    <Card className="bbpa-general-settings__card">
                      <CardHeader>
                        <div>
                          <SettingsSectionTitle icon={LuUserCog}>
                            {__("Role access", "bimbeau-privacy-analytics")}
                          </SettingsSectionTitle>
                          <p className="bbpa-general-settings__helper">
                            {__(
                              "Administrators keep full access. Select additional roles that can open analytics pages, plugin settings, or the Contact page.",
                              "bimbeau-privacy-analytics",
                            )}
                          </p>
                        </div>
                      </CardHeader>
                      <CardBody>
                        {accessRoles.length === 0 && (
                          <p>{__("No additional roles available.", "bimbeau-privacy-analytics")}</p>
                        )}
                        {accessRoles.length > 0 && (
                          <div className="bbpa-general-settings__access-grid">
                            {permissionGroups.map((permission) => (
                              <Card
                                key={permission.key}
                                className="bbpa-general-settings__access-card"
                              >
                                <CardHeader>
                                  <div>
                                    <h4 className="bbpa-general-settings__access-title">
                                      {permission.title}
                                    </h4>
                                    <p className="bbpa-general-settings__helper">
                                      {permission.description}
                                    </p>
                                  </div>
                                </CardHeader>
                                <CardBody>
                                  <div className="bbpa-settings-roles__list">
                                    {accessRoles.map((role) => {
                                      const isAllowed = normalizeArray(
                                        formState[permission.key],
                                      ).includes(role.key);
                                      return (
                                        <div
                                          key={`${permission.key}-${role.key}`}
                                          className="bbpa-general-settings__role-row"
                                        >
                                          <CheckboxControl
                                            label={role.label}
                                            checked={isAllowed}
                                            onChange={(isChecked) => {
                                              setFormState((prev) => {
                                                const nextRoles = new Set(
                                                  normalizeArray(prev[permission.key]),
                                                );
                                                if (isChecked) {
                                                  nextRoles.add(role.key);
                                                } else {
                                                  nextRoles.delete(role.key);
                                                }

                                                return {
                                                  ...prev,
                                                  [permission.key]: Array.from(nextRoles),
                                                };
                                              });
                                            }}
                                          />
                                          <span
                                            className={`bbpa-general-settings__status-pill ${isAllowed
                                              ? "bbpa-general-settings__status-pill--visible"
                                              : "bbpa-general-settings__status-pill--hidden"
                                              }`}
                                          >
                                            {isAllowed
                                              ? __("Allowed", "bimbeau-privacy-analytics")
                                              : __("Hidden", "bimbeau-privacy-analytics")}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CardBody>
                              </Card>
                            ))}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                    {}

                    <Card className="bbpa-general-settings__card">
                      <CardHeader>
                        <Flex gap={2} align="center">
                          <SettingsSectionTitle icon={LuPanelLeft}>
                            {__("Enabled panels", "bimbeau-privacy-analytics")}
                          </SettingsSectionTitle>
                        </Flex>
                      </CardHeader>
                      <CardBody>
                        <fieldset className="bbpa-general-settings__fieldset">
                          <div className="bbpa-general-settings__panel-grid">
                            {disablablePanelOptions.map((panel) => {
                              const isForcedHidden =
                                isAdvancedStatsDisabled &&
                                ADVANCED_STATS_DEPENDENT_PANELS.includes(panel.key);
                              const isVisibleByUserChoice = !normalizeArray(
                                formState.disabled_panels,
                              ).includes(panel.key);
                              const isVisible = isVisibleByUserChoice && !isForcedHidden;
                              return (
                                <Card
                                  key={`disabled-panel-${panel.key}`}
                                  className="bbpa-general-settings__panel-card"
                                >
                                  <CardBody>
                                    <CheckboxControl
                                      label={panel.label}
                                      checked={isVisibleByUserChoice}
                                      disabled={isForcedHidden}
                                      onChange={(isChecked) => {
                                        setFormState((prev) => {
                                          const nextDisabled = new Set(
                                            normalizeArray(prev.disabled_panels),
                                          );
                                          if (isChecked) {
                                            nextDisabled.delete(panel.key);
                                          } else {
                                            nextDisabled.add(panel.key);
                                          }

                                          return {
                                            ...prev,
                                            disabled_panels: Array.from(nextDisabled),
                                          };
                                        });
                                      }}
                                    />
                                    <span
                                      className={`bbpa-general-settings__status-pill ${isVisible
                                        ? "bbpa-general-settings__status-pill--visible"
                                        : "bbpa-general-settings__status-pill--hidden"
                                        }`}
                                    >
                                      {isVisible
                                        ? __("Visible", "bimbeau-privacy-analytics")
                                        : __("Hidden", "bimbeau-privacy-analytics")}
                                    </span>
                                    {isForcedHidden && (
                                      <p className="bbpa-general-settings__helper">
                                        {__(
                                          'Hidden while "Enable advanced stats after consent" is disabled.',
                                          "bimbeau-privacy-analytics",
                                        )}
                                      </p>
                                    )}
                                  </CardBody>
                                </Card>
                              );
                            })}
                          </div>
                        </fieldset>
                      </CardBody>
                    </Card>

                  </div>
                )}

                {}
                {activeTab === "geolocation" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuShieldCheck}>
                        {__("Geolocation", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Choose how BimBeau Privacy Analytics resolves geolocation: local GeoLite database or MaxMind API.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <SelectControl
                        label={__("Geolocation source", "bimbeau-privacy-analytics")}
                        value={formState.geoip_lookup_mode || "local_database"}
                        options={[
                          {
                            label: __(
                              "Local GeoLite database (default)",
                              "bimbeau-privacy-analytics",
                            ),
                            value: "local_database",
                          },
                          {
                            label: __("MaxMind API credentials", "bimbeau-privacy-analytics"),
                            value: "maxmind_api",
                          },
                        ]}
                        onChange={(value) =>
                          setFormState((prev) => ({
                            ...prev,
                            geoip_lookup_mode: value,
                          }))
                        }
                        help={__(
                          "Local database mode downloads the GeoLite MMDB file through the official BimBeau GeoIP Database Service manifest. API mode uses live MaxMind requests.",
                          "bimbeau-privacy-analytics",
                        )}
                      />
                      {isApiLookupMode && (
                        <>
                          <TextControl
                            label={__("MaxMind Account ID", "bimbeau-privacy-analytics")}
                            type="text"
                            help={
                              validationErrors.maxmind_account_id ||
                              __(
                                "Numeric Account ID used for MaxMind API requests.",
                                "bimbeau-privacy-analytics",
                              )
                            }
                            value={formState.maxmind_account_id}
                            onChange={(value) => {
                              setFormState((prev) => ({
                                ...prev,
                                maxmind_account_id: value,
                              }));
                              if (validationErrors.maxmind_account_id) {
                                setValidationErrors((prev) => ({
                                  ...prev,
                                  maxmind_account_id: null,
                                }));
                              }
                            }}
                            isInvalid={Boolean(validationErrors.maxmind_account_id)}
                          />
                          <TextControl
                            label={__("MaxMind License Key", "bimbeau-privacy-analytics")}
                            type="password"
                            help={
                              validationErrors.maxmind_license_key ||
                              __(
                                "License Key used for MaxMind API requests.",
                                "bimbeau-privacy-analytics",
                              )
                            }
                            value={formState.maxmind_license_key}
                            onChange={(value) => {
                              setFormState((prev) => ({
                                ...prev,
                                maxmind_license_key: value,
                              }));
                              if (validationErrors.maxmind_license_key) {
                                setValidationErrors((prev) => ({
                                  ...prev,
                                  maxmind_license_key: null,
                                }));
                              }
                            }}
                            isInvalid={Boolean(validationErrors.maxmind_license_key)}
                          />
                        </>
                      )}
                      {maxMindTestNotice && (
                        <Notice
                          status={maxMindTestNotice.status}
                          isDismissible={false}
                        >
                          {maxMindTestNotice.message}
                        </Notice>
                      )}
                      {geoIpDbNotice && (
                        <Notice status={geoIpDbNotice.status} isDismissible={false}>
                          {geoIpDbNotice.message}
                        </Notice>
                      )}
                      {isApiLookupMode ? (
                        <Button
                          variant="secondary"
                          isBusy={isTestingMaxMind}
                          onClick={onTestMaxMindConnection}
                        >
                          {__("Test MaxMind connection", "bimbeau-privacy-analytics")}
                        </Button>
                      ) : (
                        <>
                          <SelectControl
                            label={__("Automatic GeoIP database updates", "bimbeau-privacy-analytics")}
                            value={formState.geoip_update_frequency}
                            options={GEOIP_UPDATE_FREQUENCY_OPTIONS}
                            help={__(
                              "Choose whether the local GeoIP database should be updated automatically. In “manual updates only” mode, no external server is contacted automatically. You can still download or update the database manually with the button below.",
                              "bimbeau-privacy-analytics",
                            )}
                            onChange={(value) =>
                              setFormState((prev) => ({
                                ...prev,
                                geoip_update_frequency: value,
                              }))
                            }
                          />
                          <Notice status="warning" isDismissible={false}>
                            <strong>{__("Manual GeoIP database download", "bimbeau-privacy-analytics")}</strong>
                            <p>
                              {__(
                                "This manual download will contact an external service to download the local GeoIP database and store it in the WordPress uploads directory.",
                                "bimbeau-privacy-analytics",
                              )}
                            </p>
                          </Notice>
                          {geoIpMissingDatabaseCard && (
                            <Notice status="info" isDismissible={false}>
                              <strong>{geoIpMissingDatabaseCard.title}</strong>
                              <p>{geoIpMissingDatabaseCard.body}</p>
                              <Button
                                variant="secondary"
                                isBusy={isUpdatingGeoIpDb}
                                onClick={onUpdateGeoIpDatabase}
                              >
                                {geoIpManualButtonLabel}
                              </Button>
                            </Notice>
                          )}
                          {!geoIpMissingDatabaseCard && (
                            <Button
                              variant="secondary"
                              isBusy={isUpdatingGeoIpDb}
                              onClick={onUpdateGeoIpDatabase}
                            >
                              {geoIpManualButtonLabel}
                            </Button>
                          )}
                          <p>{`${__("Current state", "bimbeau-privacy-analytics")}: ${geoIpUiStatus}`}</p>
                          <p>{`${__("Last attempt", "bimbeau-privacy-analytics")}: ${geoIpLastAttempt}`}</p>
                          <p>{`${__("Next scheduled GeoIP update", "bimbeau-privacy-analytics")}: ${geoIpNextRun}`}</p>
                          <p>{`${__("Last successful update", "bimbeau-privacy-analytics")}: ${geoIpLastUpdated}`}</p>
                          <p>{`${__("Database size", "bimbeau-privacy-analytics")}: ${geoIpSizeMb}`}</p>
                          {geoIpDbStatus?.last_error_code && (
                            <p>{`${__("Last error code", "bimbeau-privacy-analytics")}: ${geoIpDbStatus.last_error_code}`}</p>
                          )}
                          <p>{`${__("Retry count", "bimbeau-privacy-analytics")}: ${Number(geoIpDbStatus?.retry_count || 0)}`}</p>
                          <p>
                            {__(
                              "Behavior: plugin activation completes quickly, and temporary local database unavailability does not block the rest of BimBeau Privacy Analytics.",
                              "bimbeau-privacy-analytics",
                            )}
                          </p>
                        </>
                      )}
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section bbpa-settings-privacy-card">
                    <CardHeader className="bbpa-settings-privacy-card__header">
                      <Flex justify="space-between" align="center">
                        <FlexItem>
                          <Flex gap={2} align="center">
                            <SettingsSectionTitle icon={LuShieldCheck}>
                              {__("Privacy", "bimbeau-privacy-analytics")}
                            </SettingsSectionTitle>
                          </Flex>
                        </FlexItem>
                        <FlexItem>
                          <span className={`bbpa-privacy-pill ${formState.advanced_stats_enabled ? "bbpa-privacy-pill--warning" : "bbpa-privacy-pill--success"}`}>
                            {formState.advanced_stats_enabled
                              ? __("Advanced stats require consent", "bimbeau-privacy-analytics")
                              : __("Essential stats only", "bimbeau-privacy-analytics")}
                          </span>
                        </FlexItem>
                      </Flex>
                    </CardHeader>
                    <CardBody>
                      <p>{__("Essential stats run without consent. Advanced stats run only after Statistics / Analytics consent.", "bimbeau-privacy-analytics")}</p>
                      <Card className="bbpa-settings-advanced-consent-note">
                        <CardBody>
                          <Flex gap={3} align="center">
                            <strong>{__("Essential stats", "bimbeau-privacy-analytics")}</strong>
                            <span className="bbpa-privacy-pill bbpa-privacy-pill--success">{__("No consent required", "bimbeau-privacy-analytics")}</span>
                          </Flex>
                          <p>
                            {__(
                              "Limited audience stats only. No ads, no cross-site tracking, no third-party reuse.",
                              "bimbeau-privacy-analytics",
                            )}
                          </p>
                          <p><strong>{__("Essential data", "bimbeau-privacy-analytics")}</strong></p>
                          <DataFeatureGrid
                            items={[
                              "Page views",
                              "Device type",
                              "Reliable counting",
                            ]}
                          />
                          <p>
                            {__("Script:", "bimbeau-privacy-analytics")} <code>bbpa-essential-tracker.js</code>
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="bbpa-settings-advanced-consent-note">
                        <CardBody>
                          <Flex gap={3} align="center">
                            <strong>{__("Advanced stats", "bimbeau-privacy-analytics")}</strong>
                            <span className="bbpa-privacy-pill bbpa-privacy-pill--warning">{__("Requires consent", "bimbeau-privacy-analytics")}</span>
                          </Flex>
                          <p>{__("Adds detailed visit insights after consent.", "bimbeau-privacy-analytics")}</p>
                          <ToggleControl
                            className="bbpa-settings-privacy__advanced-toggle"
                            label={__("Enable advanced stats after consent", "bimbeau-privacy-analytics")}
                            help={__(
                              "Your CMP must block it until Statistics / Analytics consent is given.",
                              "bimbeau-privacy-analytics",
                            )}
                            checked={formState.advanced_stats_enabled}
                            onChange={(value) =>
                              setFormState((prev) => ({
                                ...prev,
                                advanced_stats_enabled: value,
                              }))
                            }
                          />
                          {formState.advanced_stats_enabled ? (
                            <>
                              <p><strong>{__("Advanced data", "bimbeau-privacy-analytics")}</strong></p>
                              <DataFeatureGrid
                                items={[
                                  "Visit journey",
                                  "Engagement time",
                                  "Display format",
                                  "Interactions",
                                  "Location",
                                ]}
                              />
                              <p><strong>{__("CMP setup", "bimbeau-privacy-analytics")}</strong></p>
                              <p>{__("Block the advanced stats script until Statistics / Analytics consent is given.", "bimbeau-privacy-analytics")}</p>
                              <p>
                                {__("Script to block:", "bimbeau-privacy-analytics")} <code>assets/js/bbpa-advanced-tracker.js</code>
                              </p>
                              <p>
                                {__("Alternative selectors:", "bimbeau-privacy-analytics")}
                              </p>
                              <p>
                                {__("Script ID:", "bimbeau-privacy-analytics")} <code>bbpa-advanced-tracker-js</code>
                              </p>
                              <p>
                                {__("WordPress handle:", "bimbeau-privacy-analytics")} <code>bbpa-advanced-tracker</code>
                              </p>
                              <Button
                                variant="link"
                                onClick={() => setShowCmpHelp((prev) => !prev)}
                              >
                                {__("What is a CMP?", "bimbeau-privacy-analytics")}
                              </Button>
                              {showCmpHelp && (
                                <Card size="small">
                                  <CardBody>
                                    <p>
                                      {__(
                                        "A CMP manages cookie consent on your website. It shows the cookie banner, stores visitor choices, and allows or blocks analytics scripts based on consent.",
                                        "bimbeau-privacy-analytics",
                                      )}
                                    </p>
                                    <p>
                                      {__("Examples:", "bimbeau-privacy-analytics")} {" "}
                                      <ExternalLink href="https://www.didomi.io/">Didomi</ExternalLink>,{" "}
                                      <ExternalLink href="https://www.axeptio.eu/">Axeptio</ExternalLink>,{" "}
                                      <ExternalLink href="https://www.cookiebot.com/">Cookiebot</ExternalLink>,{" "}
                                      <ExternalLink href="https://www.cookieyes.com/">CookieYes</ExternalLink>,{" "}
                                      <ExternalLink href="https://usercentrics.com/">Usercentrics</ExternalLink>,{" "}
                                      <ExternalLink href="https://www.onetrust.com/">OneTrust</ExternalLink>.
                                    </p>
                                    <p>
                                      {__(
                                        "In your CMP, block the BimBeau Privacy Analytics advanced stats script until the Statistics or Analytics purpose is accepted.",
                                        "bimbeau-privacy-analytics",
                                      )}
                                    </p>
                                  </CardBody>
                                </Card>
                              )}
                            </>
                          ) : (
                            <p>{__("Advanced stats are disabled. BimBeau Privacy Analytics will only use essential stats.", "bimbeau-privacy-analytics")}</p>
                          )}
                        </CardBody>
                      </Card>
                      <div className="bbpa-settings-privacy__toggle">
                        <ToggleControl
                          label={__("Respect DNT / GPC", "bimbeau-privacy-analytics")}
                          help={__(
                            "Stop measurement when the visitor’s browser sends a Do Not Track or Global Privacy Control signal.",
                            "bimbeau-privacy-analytics",
                          )}
                          checked={formState.respect_dnt_gpc}
                          onChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              respect_dnt_gpc: value,
                            }))
                          }
                        />
                      </div>
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuGauge}>
                        {__("Visit measurement", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Defines how long visitor activity can remain grouped under the same visitor row before a new row is started after inactivity.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <TextControl
                        label={__("Visitor activity window", "bimbeau-privacy-analytics")}
                        type="number"
                        min={300}
                        max={86400}
                        step={60}
                        value={String(formState.visit_identifier_window_seconds)}
                        help={__(
                          "Defines how long activity from the same visitor can remain grouped into one visitor row. After this period of inactivity, BimBeau Privacy Analytics starts a new visitor row. Range: 300 to 86400 seconds (5 minutes to 24 hours).",
                          "bimbeau-privacy-analytics",
                        )}
                        onChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          setFormState((prev) => ({
                            ...prev,
                            visit_identifier_window_seconds: Number.isNaN(next)
                              ? prev.visit_identifier_window_seconds
                              : next,
                          }));
                        }}
                      />
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuListFilter}>
                        {__("URLs & campaigns", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Control URL cleanup behavior and keep only campaign query parameters that should remain available for attribution.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <ToggleControl
                        label={__("Clean URL query parameters", "bimbeau-privacy-analytics")}
                        help={__(
                          "Remove query parameters from tracked URLs.",
                          "bimbeau-privacy-analytics",
                        )}
                        checked={formState.url_strip_query}
                        onChange={(value) =>
                          setFormState((prev) => ({
                            ...prev,
                            url_strip_query: value,
                          }))
                        }
                      />
                      <TextControl
                        className="bbpa-settings-url-allowlist-control"
                        label={__("Allowed query parameters", "bimbeau-privacy-analytics")}
                        help={__(
                          "Comma-separated list of allowed query keys (used for URL tracking and UTM aggregation).",
                          "bimbeau-privacy-analytics",
                        )}
                        value={allowlistInput}
                        onChange={(value) => {
                          setAllowlistInput(value);
                          const parsed = value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean);
                          setFormState((prev) => ({
                            ...prev,
                            url_query_allowlist: parsed,
                          }));
                        }}
                      />
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuHardDrive}>
                        {__("Data retention", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Choose how long to keep temporary detailed events, report details, and long-term totals, then how often cleanup runs.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <TextControl
                        label={__("Temporary detailed events retention (days)", "bimbeau-privacy-analytics")}
                        type="number"
                        min={1}
                        max={365}
                        value={String(formState.raw_logs_retention_days)}
                        help={__(
                          "Used mainly for real-time and diagnostics. Not related to Debug mode.",
                          "bimbeau-privacy-analytics",
                        )}
                        onChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          setFormState((prev) => ({
                            ...prev,
                            raw_logs_retention_days: Number.isNaN(next)
                              ? prev.raw_logs_retention_days
                              : next,
                          }));
                        }}
                      />
                      <SelectControl
                        label={__("Report details retention", "bimbeau-privacy-analytics")}
                        value={String(formState.aggregated_data_retention_days)}
                        options={aggregatedRetentionOptions}
                        help={__(
                          "Keeps detailed report dimensions such as pages, referrers, countries, devices, and visitor details.",
                          "bimbeau-privacy-analytics",
                        )}
                        onChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          if (Number.isNaN(next)) {
                            return;
                          }

                          setFormState((prev) => ({
                            ...prev,
                            aggregated_data_retention_days: next,
                          }));
                        }}
                      />
                      <SelectControl
                        label={__("Long-term totals retention", "bimbeau-privacy-analytics")}
                        value={String(formState.overview_totals_retention_days)}
                        options={overviewTotalsRetentionOptions}
                        help={__(
                          "Keeps anonymous daily totals for dashboard KPIs and the page views/visitors chart after report details expire.",
                          "bimbeau-privacy-analytics",
                        )}
                        onChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          if (Number.isNaN(next)) {
                            return;
                          }

                          setFormState((prev) => ({
                            ...prev,
                            overview_totals_retention_days: next,
                          }));
                        }}
                      />
                      <p>
                        {__(
                          "Cleanup permanently removes expired details, while long-term totals remain available until their own retention window ends.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <SelectControl
                        label={__("Automatic cleanup frequency", "bimbeau-privacy-analytics")}
                        value={String(
                          formState.aggregated_retention_frequency_days,
                        )}
                        options={aggregatedRetentionFrequencyOptions}
                        help={__(
                          "Defines how often WordPress checks for expired analytics data.",
                          "bimbeau-privacy-analytics",
                        )}
                        onChange={(value) => {
                          const next = Number.parseInt(value, 10);
                          if (Number.isNaN(next)) {
                            return;
                          }

                          setFormState((prev) => ({
                            ...prev,
                            aggregated_retention_frequency_days: next,
                          }));
                        }}
                      />
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuListFilter}>
                        {__("Exclusions", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Select roles to exclude from tracking. Select all roles to ignore all logged-in users.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <div>
                        <div className="bbpa-settings-roles__list">
                          {roles.length === 0 && (
                            <p>{__("No roles available.", "bimbeau-privacy-analytics")}</p>
                          )}
                          {roles.map((role) => (
                            <CheckboxControl
                              key={role.key}
                              label={role.label}
                              checked={normalizeArray(formState.excluded_roles).includes(
                                role.key,
                              )}
                              onChange={(isChecked) => {
                                setFormState((prev) => {
                                  const nextRoles = new Set(
                                    normalizeArray(prev.excluded_roles),
                                  );
                                  if (isChecked) {
                                    nextRoles.add(role.key);
                                  } else {
                                    nextRoles.delete(role.key);
                                  }
                                  return {
                                    ...prev,
                                    excluded_roles: Array.from(nextRoles),
                                  };
                                });
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )}
                {activeTab === "tracking" && (
                  <Card className="bbpa-settings-section">
                    <CardBody>
                      <SettingsSectionTitle icon={LuBug}>
                        {__("Debug", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                      <p>
                        {__(
                          "Enable diagnostic output for troubleshooting tracking events, realtime visitor detection, and REST payloads in the browser console and wp-content/debug.log.",
                          "bimbeau-privacy-analytics",
                        )}
                      </p>
                      <ToggleControl
                        label={__("Debug mode", "bimbeau-privacy-analytics")}
                        help={__(
                          "Writes detailed diagnostic logs to the console and to wp-content/debug.log when WordPress debug logging is enabled.",
                          "bimbeau-privacy-analytics",
                        )}
                        checked={formState.debug_enabled}
                        onChange={(value) =>
                          setFormState((prev) => ({
                            ...prev,
                            debug_enabled: value,
                          }))
                        }
                      />
                    </CardBody>
                  </Card>
                )}
                {activeTab === "maintenance" && (
                  <>
                    <Card className="bbpa-settings-section">
                      <CardBody>
                        <SettingsSectionTitle icon={LuWrench}>
                          {__("Maintenance", "bimbeau-privacy-analytics")}
                        </SettingsSectionTitle>
                        <p className="bbpa-settings-roles__title">
                          {__("Cleanup actions", "bimbeau-privacy-analytics")}
                        </p>
                        <p>
                          {__(
                            "Run retention cleanup immediately to remove only data older than the configured retention window.",
                            "bimbeau-privacy-analytics",
                          )}
                        </p>
                        <Button
                          variant="secondary"
                          style={{ marginBottom: "16px" }}
                          onClick={() => {
                            setIsAggregatedPurgeConfirmed(false);
                            setIsAggregatedPurgeOpen(true);
                          }}
                        >
                          {__("Run cleanup now", "bimbeau-privacy-analytics")}
                        </Button>
                        <ToggleControl
                          label={__("Delete plugin tables on uninstall", "bimbeau-privacy-analytics")}
                          help={__(
                            "When enabled, uninstalling BimBeau Privacy Analytics drops all plugin analytics tables from the WordPress database.",
                            "bimbeau-privacy-analytics",
                          )}
                          checked={Boolean(formState.delete_data_on_uninstall)}
                          onChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              delete_data_on_uninstall: value,
                            }))
                          }
                        />
                      </CardBody>
                    </Card>
                    <Card className="bbpa-settings-section">
                      <CardBody>
                        <SettingsSectionTitle icon={LuTrash2}>
                          {__("Sensitive actions", "bimbeau-privacy-analytics")}
                        </SettingsSectionTitle>
                        <p>
                          {__(
                            "Remove all aggregate KPI analytics, visitor-detail analytics, and raw log entries.",
                            "bimbeau-privacy-analytics",
                          )}
                        </p>
                        <Flex gap={2} wrap={true} justify="flex-start">
                          <Button
                            variant="secondary"
                            isDestructive
                            onClick={() => {
                              setIsPurgeConfirmed(false);
                              setIsPurgeOpen(true);
                            }}
                          >
                            {__("Delete all analytics data", "bimbeau-privacy-analytics")}
                          </Button>
                          {eventsPurgeButton}
                        </Flex>
                      </CardBody>
                    </Card>
                  </>
                )}
                {}
                {activeTab === "general" && (
                  <Card className="bbpa-settings-section">
                    <CardHeader>
                      <SettingsSectionTitle icon={LuBookmark}>
                        {__("Referring site icons", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                    </CardHeader>
                    <CardBody>
                      <ToggleControl
                        label={__("Display referring site favicons", "bimbeau-privacy-analytics")}
                        help={formState.referrer_favicons_enabled
                          ? __("Allows BimBeau Privacy Analytics to retrieve referring site favicons, validate them on the server, and display locally cached copies in reports.", "bimbeau-privacy-analytics")
                          : __("When disabled, a local generic icon is displayed and no referrer domain is contacted for favicons.", "bimbeau-privacy-analytics")}
                        checked={Boolean(formState.referrer_favicons_enabled)}
                        onChange={(value) => setFormState((prev) => ({ ...prev, referrer_favicons_enabled: Boolean(value) }))}
                      />
                    </CardBody>
                  </Card>
                )}
                {activeTab === "general" && (
                  <Card className="bbpa-settings-section bbpa-settings-section--setup-wizard">
                    <CardHeader>
                      <SettingsSectionTitle icon={LuClipboardCheck}>
                        {__("Configuration assistant", "bimbeau-privacy-analytics")}
                      </SettingsSectionTitle>
                    </CardHeader>
                    <CardBody>
                      <p>{__("Restart the assistant from the first step to review the plugin's main settings. Your current settings are preserved and can be changed during the different steps.", "bimbeau-privacy-analytics")}</p>
                      <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent("bbpa-open-setup-wizard", { detail: { reset: true } }))}>
                        {__("Restart the assistant", "bimbeau-privacy-analytics")}
                      </Button>
                    </CardBody>
                  </Card>
                )}
                <Button
                  variant="primary"
                  isBusy={isSaving}
                  onClick={onSave}
                  aria-label={__("Save settings", "bimbeau-privacy-analytics")}
                >
                  {__("Save", "bimbeau-privacy-analytics")}
                </Button>
                {isPurgeOpen && (
                  <Modal
                    title={__("Confirm data purge", "bimbeau-privacy-analytics")}
                    onRequestClose={() => setIsPurgeOpen(false)}
                  >
                    <p>
                      {__(
                        "This action permanently removes all stored analytics and raw logs. Settings remain unchanged.",
                        "bimbeau-privacy-analytics",
                      )}
                    </p>
                    <CheckboxControl
                      label={__(
                        "I confirm that I want to permanently purge all analytics data.",
                        "bimbeau-privacy-analytics",
                      )}
                      checked={isPurgeConfirmed}
                      onChange={(value) => setIsPurgeConfirmed(Boolean(value))}
                    />
                    <div className="bbpa-settings-modal__actions">
                      <Button
                        variant="tertiary"
                        className="bbpa-settings-modal__cancel"
                        onClick={() => {
                          setIsPurgeConfirmed(false);
                          setIsPurgeOpen(false);
                        }}
                      >
                        {__("Cancel", "bimbeau-privacy-analytics")}
                      </Button>
                      <Button
                        variant="primary"
                        isDestructive
                        isBusy={isPurging}
                        disabled={!isPurgeConfirmed}
                        onClick={onPurge}
                      >
                        {__("Purge now", "bimbeau-privacy-analytics")}
                      </Button>
                    </div>
                  </Modal>
                )}
                {isAggregatedPurgeOpen && (
                  <Modal
                    title={__("Confirm aggregated data purge", "bimbeau-privacy-analytics")}
                    onRequestClose={() => setIsAggregatedPurgeOpen(false)}
                  >
                    <p>
                      {__(
                        "This action runs retention cleanup immediately and removes only rows older than the configured window.",
                        "bimbeau-privacy-analytics",
                      )}
                    </p>
                    <CheckboxControl
                      label={__(
                        "I confirm that I want to purge only data older than the configured retention window.",
                        "bimbeau-privacy-analytics",
                      )}
                      checked={isAggregatedPurgeConfirmed}
                      onChange={(value) =>
                        setIsAggregatedPurgeConfirmed(Boolean(value))
                      }
                    />
                    <div className="bbpa-settings-modal__actions">
                      <Button
                        variant="tertiary"
                        className="bbpa-settings-modal__cancel"
                        onClick={() => {
                          setIsAggregatedPurgeConfirmed(false);
                          setIsAggregatedPurgeOpen(false);
                        }}
                      >
                        {__("Cancel", "bimbeau-privacy-analytics")}
                      </Button>
                      <Button
                        variant="primary"
                        isDestructive
                        isBusy={isAggregatedPurging}
                        disabled={!isAggregatedPurgeConfirmed}
                        onClick={onPurgeAggregatedData}
                      >
                        {__("Purge now", "bimbeau-privacy-analytics")}
                      </Button>
                    </div>
                  </Modal>
                )}
                {eventsPurgeModal}
              </div>
            );
          }}
        </TabPanel>
      )}
      {saveToast ? (
        <Snackbar
          className={`bbpa-settings-toast bbpa-settings-toast--${saveToast.status}`}
          onRemove={() => setSaveToast(null)}
        >
          <span className="bbpa-settings-toast__icon" aria-hidden="true">
            {saveToast.status === "success" ? "✓" : "✕"}
          </span>
          <span className="bbpa-settings-toast__message">{saveToast.message}</span>
        </Snackbar>
      ) : null}
    </BpaCard>
  );
};

export default SettingsPanel;
