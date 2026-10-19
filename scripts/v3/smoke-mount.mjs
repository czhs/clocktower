#!/usr/bin/env node
// v3 mount/destroy smoke — taken over by WP7 (v3-qa) from the WP0 C0 version (docs/v3/INTEGRATION.md §1.3 "Leak test",
// §8 WP0 "Accept"). It is now the mock-world harness's `cycles` check: apps/client/src/game3d/harness/main.ts
// `?mode=cycles` mounts the REAL createTownGame3d on a fake connection 5x (low tier), then 2 tier rebuilds (a new
// Engine at high, then low), then 1 cycle with an injected frame-loop throw, and checks: every mount ready with one
// canvas, the own avatar moves on ArrowRight, no fallback, __ctCamera / __pixel / canvases / the boot mark gone after
// each destroy, the crash requests exactly one fallback('error'), JS heap growth < 10 MB (Chromium --expose-gc).
// The production-like harness build replaces the old Vite dev server run (no /api proxy to the dev service at all).
//
// Run ON THE HOST, from the repo root (it takes the heavy + browser locks itself):
//   CT_AGENT=v3-qa scripts/remote.sh node scripts/v3/smoke-mount.mjs
// or from the editing machine: HARNESS_SCENARIOS=cycles scripts/v3/render-check.sh
// Env: HARNESS_PORT (default 3460). Exit 0 = all checks ok.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const r = spawnSync('bash', [path.join(root, 'scripts/v3/render-check.sh'), '--on-host'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HARNESS_SCENARIOS: 'cycles', HARNESS_PORT: process.env.HARNESS_PORT ?? '3460' },
});
process.exit(r.status ?? 1);
