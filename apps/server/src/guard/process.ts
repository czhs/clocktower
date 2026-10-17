// (v2.3 security, sec-host — HOST-05) Process-level error policy for the dev/prod services.
//
// @colyseus/core registers `process.on('uncaughtException', err => gracefullyShutdown(true, err))`:
// ONE stray exception anywhere (a timer, a third-party listener) disposed every room and exited, and
// games live only in memory. Policy here: log every uncaught exception / unhandled rejection, keep
// serving, and only shut down (gracefully, so systemd restarts us) when they come in a burst
// (> `maxBurst` within `windowMs`) — a sign the process state is really broken.
//
// Also rate-limits console.error / console.warn: some dependencies (e.g. @colyseus/schema's
// `decode.utf8Read(): Invalid byte …`) print one line per malformed client frame, bypassing our own
// rate-limited logger and flooding journald. Our logger writes to process.stdout/stderr directly and
// is unaffected.
import type { Logger } from '../rooms/modules.js';
import { getHostLimits } from './hostLimits.js';

export interface ProcessGuardOptions {
  log: Logger;
  /** Graceful shutdown + exit (systemd restarts the unit). */
  shutdown: (err: unknown) => void;
  maxBurst?: number;
  windowMs?: number;
  /** console.error/warn lines allowed per minute before suppression. */
  consoleLinesPerMin?: number;
}

export interface ProcessGuard {
  /** Exposed for tests / the admin overview. */
  readonly stats: { uncaught: number; rejections: number; consoleSuppressed: number };
  dispose(): void;
}

const errInfo = (e: unknown) => (e instanceof Error ? { err: e.message, stack: (e.stack ?? '').split('\n').slice(0, 4).join(' | ') } : { err: String(e) });

export function installProcessGuard(opts: ProcessGuardOptions): ProcessGuard {
  const { log, shutdown } = opts;
  // Live settings (guard/hostLimits.ts) unless fixed by the caller.
  const maxBurst = () => opts.maxBurst ?? getHostLimits().uncaughtMaxBurst;
  const windowMs = () => opts.windowMs ?? getHostLimits().uncaughtWindowMs;
  const stats = { uncaught: 0, rejections: 0, consoleSuppressed: 0 };
  const recent: number[] = [];
  let shuttingDown = false;

  const onError = (kind: 'uncaughtException' | 'unhandledRejection') => (e: unknown) => {
    if (kind === 'uncaughtException') stats.uncaught++;
    else stats.rejections++;
    log.error(`process ${kind} (kept running)`, errInfo(e));
    const now = Date.now();
    recent.push(now);
    while (recent.length && recent[0]! < now - windowMs()) recent.shift();
    if (recent.length > maxBurst() && !shuttingDown) {
      shuttingDown = true;
      log.error('too many uncaught errors in a short time: shutting down for a clean restart', { count: recent.length, windowMs: windowMs() });
      shutdown(e);
    }
  };
  // Replace Colyseus' "any error = exit" handler (and any other) with this policy.
  const previous = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  const onUncaught = onError('uncaughtException');
  const onRejection = onError('unhandledRejection');
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);

  // console.error / console.warn limiter.
  const perMin = () => opts.consoleLinesPerMin ?? getHostLimits().consoleLinesPerMin;
  const orig = { error: console.error, warn: console.warn };
  let windowStart = Date.now();
  let count = 0;
  const limited =
    (fn: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const now = Date.now();
      if (now - windowStart > 60_000) {
        if (count > perMin()) orig.warn(`[console] ${count - perMin()} console lines suppressed in the last minute`);
        windowStart = now;
        count = 0;
      }
      if (++count > perMin()) {
        stats.consoleSuppressed++;
        return;
      }
      fn(...args.map((a) => (typeof a === 'string' && a.length > 500 ? a.slice(0, 500) + '…' : a)));
    };
  console.error = limited(orig.error);
  console.warn = limited(orig.warn);

  return {
    stats,
    dispose() {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onRejection);
      for (const l of previous) process.on('uncaughtException', l);
      console.error = orig.error;
      console.warn = orig.warn;
    },
  };
}
