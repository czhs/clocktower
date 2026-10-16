declare const FAILOVER_MAX_ATTEMPTS = 3;
declare const FAILOVER_BACKOFF_BASE_MS = 200;
declare const MIN_FAILOVER_TIMEOUT_SECONDS = 5;
/**
 * Total request attempts for a host; 1 means no failover. Failover only engages
 * when enabled, the host is a LiveKit Cloud domain, and the request timeout is
 * long enough to retry. `force` bypasses the cloud-host check (test-only).
 */
declare function failoverAttempts(enabled: boolean, hostname: string, force?: boolean, timeoutSeconds?: number): number;
/** A stable key identifying a host (including port) for dedup across attempts. */
declare function hostKey(url: URL): string;
/** Returns the first region origin whose host has not yet been attempted. */
declare function pickNext(regionOrigins: string[], attempted: Set<string>): string | undefined;
declare function sleep(ms: number): Promise<void>;
/**
 * Returns alternative region origins for `origin`, fetching /settings/regions
 * if the cache is stale. Best-effort: on a fetch failure it serves a stale
 * cached list when available, otherwise an empty list. Forwards `headers` so a
 * valid token — and any test directives — reach the discovery endpoint.
 */
declare function regionOrigins(origin: URL, headers: unknown): Promise<string[]>;
/**
 * Returns the `max-age` from a Cache-Control header in milliseconds, or 0 when
 * absent, non-positive, or unparseable (meaning "do not cache"). Only `max-age`
 * is honored; other directives (including `s-maxage`, which targets shared
 * proxies) are ignored.
 */
declare function parseMaxAge(cacheControl: string | null): number;

export { FAILOVER_BACKOFF_BASE_MS, FAILOVER_MAX_ATTEMPTS, MIN_FAILOVER_TIMEOUT_SECONDS, failoverAttempts, hostKey, parseMaxAge, pickNext, regionOrigins, sleep };
