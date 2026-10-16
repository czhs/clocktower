import { randomUUID } from "./crypto/uuid.js";
import {
  FAILOVER_BACKOFF_BASE_MS,
  failoverAttempts,
  hostKey,
  pickNext,
  regionOrigins,
  sleep
} from "./failover.js";
import { SDK_VERSION } from "./version.js";
const USER_AGENT = `livekit-server-sdk-node/${SDK_VERSION}`;
const REQUEST_ID_HEADER = "X-Livekit-Request-Id";
const defaultPrefix = "/twirp";
const defaultTimeoutSeconds = 10;
const livekitPackage = "livekit";
class ServerError extends Error {
  constructor(name, message, status, code, metadata) {
    super(message);
    this.name = name;
    this.status = status;
    this.code = code;
    this.metadata = metadata;
  }
}
const TwirpError = ServerError;
class SipCallError extends ServerError {
  constructor(name, message, status, code, metadata) {
    super(name, SipCallError.describe(message, code, metadata), status, code, metadata);
    this.name = "SipCallError";
  }
  /** The SIP response code of the failed call, e.g. 486 (Busy Here). */
  get sipStatusCode() {
    var _a;
    const raw = (_a = this.metadata) == null ? void 0 : _a.sip_status_code;
    return raw !== void 0 ? Number(raw) : void 0;
  }
  /** The SIP reason phrase of the failed call, e.g. "Busy Here". */
  get sipStatus() {
    var _a;
    return (_a = this.metadata) == null ? void 0 : _a.sip_status;
  }
  /** Builds a SipCallError from a ServerError, preserving its code and metadata. */
  static fromServerError(err) {
    return new SipCallError(err.name, err.message, err.status, err.code, err.metadata);
  }
  // describe renders a clear message: the SIP status, the error code, and any
  // other metadata the server attached. Falls back to the raw message when the
  // error carries no SIP status.
  static describe(fallback, code, metadata) {
    const sipCode = metadata == null ? void 0 : metadata.sip_status_code;
    if (!sipCode) {
      return fallback;
    }
    const reason = metadata == null ? void 0 : metadata.sip_status;
    let msg = `SIP call failed: ${sipCode}${reason ? ` ${reason}` : ""}`;
    if (code) {
      msg += ` (${code})`;
    }
    const extra = Object.entries(metadata ?? {}).filter(([k]) => k !== "sip_status_code" && k !== "sip_status" && k !== "error_details").map(([k, v]) => `${k}=${v}`);
    if (extra.length) {
      msg += ` [${extra.join(", ")}]`;
    }
    return msg;
  }
}
class TwirpRpc {
  constructor(host, pkg, options) {
    if (host.startsWith("ws")) {
      host = host.replace("ws", "http");
    }
    this.host = host;
    this.pkg = pkg;
    this.requestTimeout = (options == null ? void 0 : options.requestTimeout) ?? defaultTimeoutSeconds;
    this.prefix = (options == null ? void 0 : options.prefix) || defaultPrefix;
    this.failover = (options == null ? void 0 : options.failover) ?? true;
    this.failoverForce = (options == null ? void 0 : options.failoverForce) ?? false;
    this.failoverBackoffMs = (options == null ? void 0 : options.failoverBackoffMs) ?? FAILOVER_BACKOFF_BASE_MS;
  }
  /**
   * Issues a Twirp request, failing over to alternative regions on retryable
   * errors. On any transport error or HTTP 5xx it discovers regions via
   * /settings/regions and replays the request — body and headers intact —
   * against the next untried region, with exponential backoff. A 4xx is
   * returned immediately.
   */
  async request(service, method, data, headers, timeout = this.requestTimeout) {
    const path = `${this.prefix}/${this.pkg}.${service}/${method}`;
    const body = JSON.stringify(data);
    const requestHeaders = {
      "Content-Type": "application/json;charset=UTF-8",
      "User-Agent": USER_AGENT,
      ...headers
    };
    requestHeaders[REQUEST_ID_HEADER] = await randomUUID();
    const origin = new URL(this.host);
    const maxAttempts = failoverAttempts(
      this.failover,
      origin.hostname,
      this.failoverForce,
      timeout
    );
    const attempted = /* @__PURE__ */ new Set([hostKey(origin)]);
    let regions;
    let current = this.host;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const isLast = attempt + 1 >= maxAttempts;
      const init = { method: "POST", headers: requestHeaders, body };
      if (timeout) {
        init.signal = AbortSignal.timeout(timeout * 1e3);
      }
      let response;
      let transportError;
      try {
        response = await fetch(new URL(path, current), init);
      } catch (e) {
        transportError = e;
      }
      if (response == null ? void 0 : response.ok) {
        return await response.json();
      }
      const retryable = transportError !== void 0 || !!response && response.status >= 500;
      let next;
      if (retryable && !isLast) {
        if (!regions) {
          regions = await regionOrigins(origin, headers);
        }
        next = pickNext(regions, attempted);
      }
      if (!retryable || next === void 0) {
        if (response) {
          throw await toTwirpError(response);
        }
        throw transportError;
      }
      const reason = response ? `status ${response.status}` : transportError;
      console.warn(
        `livekit API request to ${new URL(current).host} failed (${reason}), retrying with fallback url ${next}`
      );
      await sleep(this.failoverBackoffMs * 2 ** attempt);
      attempted.add(hostKey(new URL(next)));
      current = next;
    }
    throw new Error("failover loop exited without returning");
  }
}
async function toTwirpError(response) {
  const isJson = response.headers.get("content-type") === "application/json";
  let errorMessage = "Unknown internal error";
  let errorCode = void 0;
  let metadata = void 0;
  try {
    if (isJson) {
      const parsedError = await response.json();
      if ("msg" in parsedError) {
        errorMessage = parsedError.msg;
      }
      if ("code" in parsedError) {
        errorCode = parsedError.code;
      }
      if ("meta" in parsedError) {
        metadata = parsedError.meta;
      }
    } else {
      errorMessage = await response.text();
    }
  } catch (e) {
    console.debug(`Error when trying to parse error message, using defaults`, e);
  }
  return new TwirpError(response.statusText, errorMessage, response.status, errorCode, metadata);
}
export {
  REQUEST_ID_HEADER,
  ServerError,
  SipCallError,
  TwirpError,
  TwirpRpc,
  livekitPackage
};
//# sourceMappingURL=TwirpRPC.js.map