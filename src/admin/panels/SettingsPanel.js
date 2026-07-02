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
  DISABLABLE_PANEL_OPTIONS,
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
  { value: "disabled", label: __("Disabled", "bimbeau-privacy-analytics") },
  { value: "15_days", label: __("Every 15 days", "bimbeau-privacy-analytics") },
  { value: "30_days", label: __("Every 30 days (default)", "bimbeau-privacy-analytics") },
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
  pwa_theme_color:
    typeof settings?.pwa_theme_color === "string" &&
      settings.pwa_theme_color.trim()
      ? settings.pwa_theme_color.trim()
      : DEFAULT_SETTINGS.pwa_theme_color,
  pwa_icon_attachment_id: Number.parseInt(settings?.pwa_icon_attachment_id, 10) || 0,
  pwa_icon_generation_status:
    typeof settings?.pwa_icon_generation_status === "string" &&
      settings.pwa_icon_generation_status.trim()
      ? settings.pwa_icon_generation_status.trim()
      : DEFAULT_SETTINGS.pwa_icon_generation_status,
  pwa_icon_generation_message:
    typeof settings?.pwa_icon_generation_message === "string"
      ? settings.pwa_icon_generation_message
      : DEFAULT_SETTINGS.pwa_icon_generation_message,
  disabled_panels: Array.isArray(settings?.disabled_panels)
    ? settings.disabled_panels
    : Array.isArray(settings?.hidden_panels)
      ? settings.hidden_panels
      : DEFAULT_SETTINGS.disabled_panels,
  stats_access_roles: Array.isArray(settings?.stats_access_roles)
    ? settings.stats_access_roles
    : DEFAULT_SETTINGS.stats_access_roles,
  settings_access_roles: Array.isArray(settings?.settings_access_roles)
    ? settings.settings_access_roles
    : DEFAULT_SETTINGS.settings_access_roles,
  contact_access_roles: Array.isArray(settings?.contact_access_roles)
    ? settings.contact_access_roles
    : DEFAULT_SETTINGS.contact_access_roles,
});

const SettingsPanel = () => {
  const { data, isLoading, error } = useAdminEndpoint("/admin/settings");
  const [formState, setFormState] = useState(DEFAULT_SETTINGS);
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
  const [pwaNotice, setPwaNotice] = useState(null);
  const [availableGranularities, setAvailableGranularities] = useState(
    data?.availableGranularities || [],
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
    setAvailableGranularities(data?.availableGranularities || []);
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
      return __("Disabled", "bimbeau-privacy-analytics");
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

  

  const roles = ADMIN_CONFIG?.roles || [];
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
  const postTypes = ADMIN_CONFIG?.settings?.postTypes || [];
  const isPro = Boolean(ADMIN_CONFIG?.settings?.isPro);
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
  const pwaConfig = ADMIN_CONFIG?.settings?.pwa || {};
  const pwaAppUrl = pwaConfig.appUrl || "";
  let eventsPurgeButton = null;
  let eventsPurgeModal = null;

  

  const onCopyPwaUrl = async () => {
    if (!pwaAppUrl) {
      setPwaNotice({
        status: "error",
        message: __("PWA URL is unavailable.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(pwaAppUrl);
      } else {
        const input = document.createElement("input");
        input.value = pwaAppUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setPwaNotice({
        status: "success",
        message: __("PWA URL copied.", "bimbeau-privacy-analytics"),
      });
    } catch (copyError) {
      setPwaNotice({
        status: "error",
        message:
          copyError?.message ||
          __("Unable to copy the PWA URL.", "bimbeau-privacy-analytics"),
      });
    }
  };

  const onOpenPwaUrl = () => {
    if (!pwaAppUrl) {
      setPwaNotice({
        status: "error",
        message: __("PWA URL is unavailable.", "bimbeau-privacy-analytics"),
      });
      return;
    }

    window.open(pwaAppUrl, "_blank", "noopener,noreferrer");
  };

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
        <TabPanel className="bbpa-settings-tabs" tabs={settingsTabs}>
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
                                      const isAllowed = formState[
                                        permission.key
                                      ].includes(role.key);
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
                                                  prev[permission.key],
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

                  </div>
                )}

                {}
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
