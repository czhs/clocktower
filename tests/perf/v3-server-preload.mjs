// (v3 perf recon, front "server") Preload for a TEST server process: in-process runtime metrics that /proc cannot
// give (event-loop utilisation, event-loop delay, GC pauses by kind, V8 heap). Loaded only by the perf driver
// (tests/perf/v3-server-load.ts) through NODE_OPTIONS="--import <abs path to this file>" on its own test server;
// the server code is not touched and nothing here runs in prod/dev.
//
// Every CT_PERF_PRELOAD_MS (default 1000) it appends ONE JSON line of cumulative counters to CT_PERF_PRELOAD_OUT:
//   { t, pid, eldRes, elu: {idle, active}, eld: {min, mean, p50, p99, max, n} (window since last line, ms),
//     gc: {<kind>: {n, ms, max}} (cumulative), heap: {used, total, ext, ab}, rss }
// The driver diffs two lines to get any window. Cost: one PerformanceObserver + one histogram + one appendFileSync/s.
import { appendFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance, PerformanceObserver, constants } from 'node:perf_hooks';
import { isMainThread } from 'node:worker_threads';

// NODE_OPTIONS is inherited by worker threads and child processes: only the server's MAIN thread reports, and every
// line carries the pid so the driver can keep only the server process.
const out = process.env.CT_PERF_PRELOAD_OUT;
if (out && isMainThread) {
  const every = Number(process.env.CT_PERF_PRELOAD_MS) || 1000;
  const KIND = {
    [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
    [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
    [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
    [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
  };
  /** kind -> {n, ms, max}; plus a pause histogram (all kinds) in 0.25 ms buckets up to 50 ms. */
  const gc = {};
  const pauseBuckets = new Array(201).fill(0);
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const k = KIND[e.detail?.kind ?? e.kind] ?? 'other';
      const s = (gc[k] ??= { n: 0, ms: 0, max: 0 });
      s.n++;
      s.ms += e.duration;
      if (e.duration > s.max) s.max = e.duration;
      pauseBuckets[Math.min(200, Math.floor(e.duration * 4))]++;
    }
  });
  obs.observe({ entryTypes: ['gc'] });
  // The histogram's samples include the sampling interval itself: the driver subtracts `eldRes` (ms).
  const RES = Number(process.env.CT_PERF_ELD_RES_MS) || 10;
  const h = monitorEventLoopDelay({ resolution: RES });
  h.enable();
  const ns = (v) => Math.round((v / 1e6) * 1000) / 1000;
  const write = () => {
    const elu = performance.eventLoopUtilization();
    const m = process.memoryUsage();
    const line = {
      t: Date.now(),
      pid: process.pid,
      eldRes: RES,
      elu: { idle: Math.round(elu.idle), active: Math.round(elu.active) },
      eld: h.count ? { min: ns(h.min), mean: ns(h.mean), p50: ns(h.percentile(50)), p99: ns(h.percentile(99)), max: ns(h.max), n: h.count } : null,
      gc,
      gcPauseBuckets025ms: pauseBuckets,
      heap: { used: m.heapUsed, total: m.heapTotal, ext: m.external, ab: m.arrayBuffers },
      rss: m.rss,
    };
    h.reset();
    try {
      appendFileSync(out, JSON.stringify(line) + '\n');
    } catch {
      /* the driver may have removed its dir at teardown */
    }
  };
  const timer = setInterval(write, every);
  timer.unref();
  process.once('beforeExit', write);
}
