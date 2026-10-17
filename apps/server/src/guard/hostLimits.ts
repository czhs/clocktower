// (v2.3 security, sec-host) Every host-safety knob in one place, read through getters at use time so
// the admin settings registry (sec-ops, apps/server/src/settings/) can change them live.
//
//   getHostLimits()            current values (a frozen snapshot)
//   setHostLimits(partial)     validate + apply; returns the new snapshot; notifies listeners
//   onHostLimitsChange(fn)     e.g. app.ts re-applies the HTTP server limits
//   HOST_LIMIT_KNOBS           metadata for the settings UI (label, unit, range, live/restart)
//
// Values are per process (prod and dev are separate processes) and reset to the defaults (+ env
// seeds, e.g. HOST_SIGNUP_PER_HOUR) on restart unless the registry persists and re-applies them.
export interface HostLimits {
  /** HOST-11 per-socket pre-decode budget. */
  socketFrameBurst: number;
  socketFramesPerSec: number;
  socketByteBurst: number;
  socketBytesPerSec: number;
  /** HOST-04 lobby-directory SSE streams. */
  sseMaxPerAccount: number;
  sseMaxPerIp: number;
  sseMaxTotal: number;
  /** HOST-04 server-wide sign-ups per hour (also the burst). 0 = unlimited; -1 = the env default
   *  (HOST_SIGNUP_PER_HOUR, else 100; unlimited when APP_ENV=test). */
  signupPerHour: number;
  /** HOST-04 game records. */
  recordListMax: number;
  recordMaxBytes: number;
  /** HOST-09 HTTP server (apply to new connections; existing ones keep their timers). */
  httpHeadersTimeoutMs: number;
  httpRequestTimeoutMs: number;
  httpMaxConnections: number;
  /** HOST-05 process guard. */
  uncaughtMaxBurst: number;
  uncaughtWindowMs: number;
  consoleLinesPerMin: number;
}

export const DEFAULT_HOST_LIMITS: Readonly<HostLimits> = Object.freeze({
  // Sized for a 60 s mobile TCP-stall flush (≈900 small frames); measured max legit burst across the
  // integration + playtest suites: 250 frames / 24 KB (docs/security-v2.3/02-host-safety.md, HOST-11).
  socketFrameBurst: 2000,
  socketFramesPerSec: 200,
  socketByteBurst: 512 * 1024,
  socketBytesPerSec: 96 * 1024,
  sseMaxPerAccount: 3,
  sseMaxPerIp: 6,
  sseMaxTotal: 200,
  signupPerHour: -1,
  recordListMax: 5000,
  recordMaxBytes: 8 * 1024 * 1024,
  httpHeadersTimeoutMs: 15_000,
  httpRequestTimeoutMs: 30_000,
  httpMaxConnections: 2000,
  uncaughtMaxBurst: 3,
  uncaughtWindowMs: 60_000,
  consoleLinesPerMin: 30,
});

export interface HostLimitKnob {
  key: keyof HostLimits;
  label: string;
  unit: 'count' | 'per_sec' | 'bytes' | 'bytes_per_sec' | 'per_hour' | 'ms' | 'per_min';
  min: number;
  max: number;
  /** 'live' = takes effect immediately (new sockets/requests); 'new_connections' = HTTP server limits. */
  applies: 'live' | 'new_connections';
  finding: string;
}

export const HOST_LIMIT_KNOBS: readonly HostLimitKnob[] = [
  { key: 'socketFrameBurst', label: 'WebSocket frame burst per connection', unit: 'count', min: 100, max: 100_000, applies: 'live', finding: 'HOST-11' },
  { key: 'socketFramesPerSec', label: 'WebSocket frames per second per connection (sustained)', unit: 'per_sec', min: 20, max: 10_000, applies: 'live', finding: 'HOST-11' },
  { key: 'socketByteBurst', label: 'WebSocket byte burst per connection', unit: 'bytes', min: 64 * 1024, max: 64 * 1024 * 1024, applies: 'live', finding: 'HOST-11' },
  { key: 'socketBytesPerSec', label: 'WebSocket bytes per second per connection (sustained)', unit: 'bytes_per_sec', min: 16 * 1024, max: 64 * 1024 * 1024, applies: 'live', finding: 'HOST-11' },
  { key: 'sseMaxPerAccount', label: 'Lobby-list streams per account', unit: 'count', min: 1, max: 50, applies: 'live', finding: 'HOST-04' },
  { key: 'sseMaxPerIp', label: 'Lobby-list streams per address', unit: 'count', min: 1, max: 500, applies: 'live', finding: 'HOST-04' },
  { key: 'sseMaxTotal', label: 'Lobby-list streams in total', unit: 'count', min: 10, max: 5000, applies: 'live', finding: 'HOST-04' },
  { key: 'signupPerHour', label: 'New accounts per hour, server-wide (0 = unlimited, -1 = env default)', unit: 'per_hour', min: -1, max: 100_000, applies: 'live', finding: 'HOST-04' },
  { key: 'recordListMax', label: 'Game record: entries per list', unit: 'count', min: 500, max: 1_000_000, applies: 'live', finding: 'HOST-04' },
  { key: 'recordMaxBytes', label: 'Game record: max size when saved', unit: 'bytes', min: 256 * 1024, max: 256 * 1024 * 1024, applies: 'live', finding: 'HOST-04' },
  { key: 'httpHeadersTimeoutMs', label: 'HTTP headers timeout', unit: 'ms', min: 2000, max: 300_000, applies: 'new_connections', finding: 'HOST-09' },
  { key: 'httpRequestTimeoutMs', label: 'HTTP request timeout', unit: 'ms', min: 5000, max: 600_000, applies: 'new_connections', finding: 'HOST-09' },
  { key: 'httpMaxConnections', label: 'HTTP max open connections', unit: 'count', min: 100, max: 100_000, applies: 'live', finding: 'HOST-09' },
  { key: 'uncaughtMaxBurst', label: 'Uncaught errors tolerated per window before a clean restart', unit: 'count', min: 0, max: 1000, applies: 'live', finding: 'HOST-05' },
  { key: 'uncaughtWindowMs', label: 'Uncaught-error window', unit: 'ms', min: 1000, max: 3_600_000, applies: 'live', finding: 'HOST-05' },
  { key: 'consoleLinesPerMin', label: 'console.error/warn lines per minute', unit: 'per_min', min: 0, max: 100_000, applies: 'live', finding: 'HOST-05' },
];

let current: Readonly<HostLimits> = DEFAULT_HOST_LIMITS;
const listeners = new Set<(l: Readonly<HostLimits>) => void>();

export function getHostLimits(): Readonly<HostLimits> {
  return current;
}

/** Validates against HOST_LIMIT_KNOBS ranges (integers); throws RangeError on a bad value. */
export function setHostLimits(patch: Partial<HostLimits>): Readonly<HostLimits> {
  const next: HostLimits = { ...current };
  for (const [k, v] of Object.entries(patch) as [keyof HostLimits, number][]) {
    const knob = HOST_LIMIT_KNOBS.find((x) => x.key === k);
    if (!knob) throw new RangeError(`unknown host limit '${String(k)}'`);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < knob.min || v > knob.max) throw new RangeError(`${k} must be an integer in [${knob.min}, ${knob.max}]`);
    next[k] = v;
  }
  current = Object.freeze(next);
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* a listener must not break the setter */
    }
  }
  return current;
}

export function onHostLimitsChange(fn: (l: Readonly<HostLimits>) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test helper. */
export function resetHostLimits(): void {
  current = DEFAULT_HOST_LIMITS;
}
