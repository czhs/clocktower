// One real server per test file, started at collection time so `describe.skipIf(...)` can use
// probed features. Usage (top level of a *.test.ts):
//   const { server, features } = await suiteServer();
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect } from 'vitest';
import { probeFeatures, type Features } from './features.js';
import { REPO_ROOT, startServer, type StartOptions, type TestServer } from './server.js';

export async function suiteServer(opts: StartOptions = {}): Promise<{ server: TestServer; features: Features }> {
  const server = await startServer(opts);
  const file = path.basename(expect.getState().testPath ?? `suite-${server.port}`);
  afterAll(async () => {
    await server.stop();
    // Keep the server output for post-mortems (test-results/ is git- and rsync-ignored).
    const dir = path.join(REPO_ROOT, 'test-results', 'server-logs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${file}.log`), server.logs());
  });
  const features = await probeFeatures(server);
  const missing = Object.entries(features.reasons);
  if (missing.length) console.warn(`[features @ :${server.port}] pending: ${missing.map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
  return { server, features };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll fn until it returns a truthy value (or throw after timeout). */
export async function eventually<T>(fn: () => Promise<T> | T, timeoutMs = 5000, everyMs = 100, label = ''): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e;
    }
    if (Date.now() > deadline) throw new Error(`eventually${label ? ` [${label}]` : ''}: timed out after ${timeoutMs}ms (last: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
    await sleep(everyMs);
  }
}

export function uniq(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}
