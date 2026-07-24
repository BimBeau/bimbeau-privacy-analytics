import { useEffect, useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { LuArrowRight, LuGlobe } from "react-icons/lu";

import { ADMIN_CONFIG, normalizeBooleanSetting } from "../../constants";
import PageTitle from "../PageTitle";
import { getCachedFavicon, normalizeReferrerHost } from "./faviconCache";

export const resolveDomainFaviconCandidates = (internalFaviconUrl = "") =>
  internalFaviconUrl ? [internalFaviconUrl] : [];

export const truncateReferrerLabel = (label, maximumLength = 100) => {
  const characters = Array.from(String(label || ""));

  return characters.length > maximumLength
    ? `${characters.slice(0, maximumLength).join("")}…`
    : characters.join("");
};

const ReferrerLabel = ({ domain, label, faviconsEnabled, favicon }) => {
  const normalizedDomain = useMemo(
    () => normalizeReferrerHost(domain),
    [domain],
  );
  const isDirect = !String(domain || "").trim();
  const enabled = normalizeBooleanSetting(
    faviconsEnabled ?? ADMIN_CONFIG?.settings?.referrer_favicons_enabled,
    false,
  );
  const resolvedFavicon = favicon || getCachedFavicon(normalizedDomain);
  const faviconUrl =
    enabled && resolvedFavicon?.status === "available"
      ? resolvedFavicon.url
      : "";
  const resolvedLabel = label || __("Direct", "bimbeau-privacy-analytics");
  const displayedLabel = truncateReferrerLabel(resolvedLabel);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    setFaviconFailed(false);
  }, [faviconUrl]);

  return (
    <span className="bbpa-referrer-label">
      {faviconUrl && !faviconFailed ? (
        <img
          className="bbpa-referrer-label__favicon"
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          onError={() => setFaviconFailed(true)}
        />
      ) : enabled &&
        normalizedDomain &&
        resolvedFavicon?.status === "loading" ? (
        <span
          className="bbpa-referrer-label__favicon-fallback"
          aria-hidden="true"
        />
      ) : (
        <span
          className={`bbpa-referrer-label__favicon-fallback${
            isDirect
              ? " bbpa-referrer-label__favicon-fallback--direct"
              : " bbpa-referrer-label__favicon-fallback--globe"
          }`}
          aria-hidden="true"
        >
          {isDirect ? <LuArrowRight size={12} /> : <LuGlobe size={12} />}
        </span>
      )}
      <PageTitle className="bbpa-referrer-label__domain" title={resolvedLabel}>
        {displayedLabel}
      </PageTitle>
    </span>
  );
};
export default ReferrerLabel;
