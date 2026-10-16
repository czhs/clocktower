"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var failover_exports = {};
__export(failover_exports, {
  FAILOVER_BACKOFF_BASE_MS: () => FAILOVER_BACKOFF_BASE_MS,
  FAILOVER_MAX_ATTEMPTS: () => FAILOVER_MAX_ATTEMPTS,
  MIN_FAILOVER_TIMEOUT_SECONDS: () => MIN_FAILOVER_TIMEOUT_SECONDS,
  failoverAttempts: () => failoverAttempts,
  hostKey: () => hostKey,
  parseMaxAge: () => parseMaxAge,
  pickNext: () => pickNext,
  regionOrigins: () => regionOrigins,
  sleep: () => sleep
});
module.exports = __toCommonJS(failover_exports);
const FAILOVER_MAX_ATTEMPTS = 3;
const FAILOVER_BACKOFF_BASE_MS = 200;
const MIN_FAILOVER_TIMEOUT_SECONDS = 5;
function failoverAttempts(enabled, hostname, force = false, timeoutSeconds = 0) {
  if (!enabled || !(force || isCloud(hostname))) {
    return 1;
  }
  if (timeoutSeconds > 0 && timeoutSeconds < MIN_FAILOVER_TIMEOUT_SECONDS) {
    return 1;
  }
  return FAILOVER_MAX_ATTEMPTS;
}
function isCloud(hostname) {
  return hostname.endsWith(".livekit.cloud");
}
function toHttp(url) {
  return url.startsWith("ws") ? `http${url.slice(2)}` : url;
}
function hostKey(url) {
  return url.host.toLowerCase();
}
function pickNext(regionOrigins2, attempted) {
  for (const origin of regionOrigins2) {
    try {
      if (!attempted.has(hostKey(new URL(origin)))) {
        return origin;
      }
    } catch {
    }
  }
  return void 0;
}
function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
const regionCache = /* @__PURE__ */ new Map();
const inflight = /* @__PURE__ */ new Map();
async function regionOrigins(origin, headers) {
  const key = hostKey(origin);
  const cached = regionCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
    return cached.origins;
  }
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const request = (async () => {
    try {
      const { origins, ttl } = await fetchRegions(origin, headers);
      if (ttl > 0) {
        regionCache.set(key, { origins, fetchedAt: Date.now(), ttl });
      }
      return origins;
    } catch {
      return (cached == null ? void 0 : cached.origins) ?? [];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}
async function fetchRegions(origin, headers) {
  const fetchHeaders = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() === "content-type" || k.toLowerCase() === "content-length") continue;
    fetchHeaders[k] = v;
  }
  const response = await fetch(new URL("/settings/regions", origin.origin), {
    method: "GET",
    headers: fetchHeaders,
    // Short timeout so a slow/unreachable discovery endpoint doesn't stall the
    // failover path.
    signal: AbortSignal.timeout(2e3)
  });
  if (!response.ok) {
    throw new Error(`region discovery failed: ${response.status}`);
  }
  const ttl = parseMaxAge(response.headers.get("cache-control"));
  const body = await response.json();
  const origins = (body.regions ?? []).filter((r) => !!r.url).map((r) => new URL(toHttp(r.url)).origin);
  return { origins, ttl };
}
function parseMaxAge(cacheControl) {
  if (!cacheControl) return 0;
  for (const directive of cacheControl.split(",")) {
    const trimmed = directive.trim().toLowerCase();
    if (trimmed.startsWith("max-age=")) {
      const secs = parseInt(trimmed.slice("max-age=".length), 10);
      return Number.isFinite(secs) && secs > 0 ? secs * 1e3 : 0;
    }
  }
  return 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FAILOVER_BACKOFF_BASE_MS,
  FAILOVER_MAX_ATTEMPTS,
  MIN_FAILOVER_TIMEOUT_SECONDS,
  failoverAttempts,
  hostKey,
  parseMaxAge,
  pickNext,
  regionOrigins,
  sleep
});
//# sourceMappingURL=failover.cjs.map