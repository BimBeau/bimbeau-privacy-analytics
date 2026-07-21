import { useEffect, useMemo, useState } from "@wordpress/element";

import { fetchAdminJson } from "../../api/useAdminEndpoint";

const cache = new Map();
const pendingBatches = new Map();

export const normalizeReferrerHost = (domain) => {
  if (typeof domain !== "string") {
    return "";
  }
  const value = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/, 1)[0];
  try {
    return new URL(`https://${value}`).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    return "";
  }
};

export const getCachedFavicon = (domain) =>
  cache.get(normalizeReferrerHost(domain));

export const useReferrerFavicons = (domains, enabled) => {
  const domainKey = domains.join("\n");
  // The serialized list keeps the host set stable when report rows are recreated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hosts = useMemo(
    () => [...new Set(domains.map(normalizeReferrerHost).filter(Boolean))],
    [domainKey],
  );
  const hostKey = hosts.join(",");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const missing = hosts.filter((host) => !cache.has(host));
    if (!missing.length) {
      return undefined;
    }
    missing.forEach((host) => cache.set(host, { status: "loading", url: "" }));
    const key = missing.slice().sort().join(",");
    let request = pendingBatches.get(key);
    if (!request) {
      request = fetchAdminJson("/admin/favicons", {
        params: { domains: missing.join(",") },
      }).finally(() => pendingBatches.delete(key));
      pendingBatches.set(key, request);
    }
    let active = true;
    request
      .then((payload) => {
        missing.forEach((host) => {
          const item = payload?.favicons?.[host];
          cache.set(host, {
            status: item?.is_local && item?.url ? "available" : "unavailable",
            url: item?.is_local ? item.url || "" : "",
          });
        });
      })
      .catch(() =>
        missing.forEach((host) =>
          cache.set(host, { status: "unavailable", url: "" }),
        ),
      )
      .finally(() => active && setRevision((value) => value + 1));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hostKey]);

  return useMemo(() => {
    const result = new Map();
    hosts.forEach((host) => result.set(host, cache.get(host)));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostKey, revision]);
};

export const clearFaviconMemoryCache = () => {
  cache.clear();
  pendingBatches.clear();
};
