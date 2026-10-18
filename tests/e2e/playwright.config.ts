// Playwright E2E (qa-deploy). Runs ON the build host (scripts/remote.sh pnpm test:e2e).
//
// By default the config builds the app and starts a throwaway server on 127.0.0.1:3398 (or $E2E_PORT) with a temp
// SQLite DB and random secrets (webServer below). To run against an existing deployment instead:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e      # dev service (on the host)
//   E2E_PUBLIC=1 E2E_RESOLVE_IP=$(dig +short @1.1.1.1 clocktower.chrisshi.com A | head -1) pnpm test:e2e
//       # public endpoint: public.spec.ts only (creates 2 accounts on prod — run sparingly)
// CT_E2E_NO_BUILD=1 skips the build step (use a dist you just built).
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// E2E_PORT: v3 agents run e2e in parallel on their own ports (3450-3499, docs/v3/INTEGRATION.md §8 / D4).
const PORT = Number(process.env.E2E_PORT ?? 3398);
// Public-endpoint run (only when E2E_PUBLIC=1): runs ONLY public.spec.ts against E2E_BASE_URL
// (default https://clocktower.chrisshi.com). E2E_RESOLVE_IP pins the hostname for Chromium
// (--host-resolver-rules), for hosts whose local resolver is stale.
const PUBLIC = process.env.E2E_PUBLIC === '1';
const external = process.env.E2E_BASE_URL ?? (PUBLIC ? (process.env.CT_PUBLIC_URL ?? 'https://clocktower.chrisshi.com') : undefined);
const pinnedHost = external ? new URL(external).hostname : '';
const resolveArgs = process.env.E2E_RESOLVE_IP ? [`--host-resolver-rules=MAP ${pinnedHost} ${process.env.E2E_RESOLVE_IP}`] : [];
// (v3 WP7) the 3D town specs: file names starting with `v3-` (not classic-in-v3 / v23-*: those stay in chromium)
const V3_SPECS = /(^|[\\/])v3-[^\\/]*\.spec\.ts$/;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;
const dataDir = external ? '' : mkdtempSync(path.join(os.tmpdir(), 'ct-e2e-'));

export default defineConfig({
  testDir: '.',
  testMatch: PUBLIC ? /public\.spec\.ts/ : /.*\.spec\.ts/,
  testIgnore: PUBLIC ? [] : [/public\.spec\.ts/],
  outputDir: path.join(root, 'test-results/e2e'),
  reporter: [['list'], ['html', { outputFolder: path.join(root, 'playwright-report'), open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    actionTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    // (project testIgnore replaces the top-level one: keep public.spec.ts out here too)
    { name: 'chromium', testIgnore: [V3_SPECS, ...(PUBLIC ? [] : [/public\.spec\.ts/])], use: { ...devices['Desktop Chrome'], launchOptions: { args: resolveArgs } } },
    // (v3 WP7, docs/v3/INTEGRATION.md §6.2) the 3D town specs (tests/e2e/v3-*.spec.ts): SwiftShader (CPU) only, low tier,
    // 960x540, 15 fps (helpers.ts v3InitScript: ct.debug.v3force / fps / fxQuality / camera in every v3 context).
    // Run on the host ONLY through scripts/v3/e2e.sh (host-wide lock, nice 19, E2E_PORT from the v3-qa range), which sets
    // E2E_V3=1: without it the project does not exist, so a plain `pnpm test:e2e` (the Classic suite) never starts the
    // SwiftShader 3D specs by accident.
    ...(process.env.E2E_V3 === '1' ? [{
      name: 'v3',
      testMatch: PUBLIC ? /^$/ : V3_SPECS,
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 960, height: 540 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...resolveArgs] },
      },
    }] : []),
  ],
  webServer: external
    ? undefined
    : {
        command: `${process.env.CT_E2E_NO_BUILD ? '' : 'pnpm -r --if-present run build >&2 && '}exec node --enable-source-maps apps/server/dist/server.js`,
        cwd: root,
        url: `http://127.0.0.1:${PORT}/healthz`,
        timeout: 120_000,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        env: {
          NODE_ENV: 'test',
          APP_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(PORT),
          APP_PUBLIC_ORIGIN: `http://127.0.0.1:${PORT}`,
          DATABASE_URL: `file:${path.join(dataDir, 'e2e.db')}`,
          SESSION_SECRET: randomBytes(32).toString('hex'),
          PASSPHRASE_PEPPER: randomBytes(32).toString('hex'),
          COOKIE_SECURE: 'false',
          LOBBY_MAX_COUNT: '8',
          LOBBY_IDLE_TIMEOUT_SEC: '60',
          LIVEKIT_ROOM_PREFIX: 'test',
          // (v2 e2e) Fake LiveKit credentials so the server runs its real voice coordinator: zone
          // grants are minted locally and sent to each client (the specs assert who is in which
          // acoustic zone from the decoded voice:grant frames). Nobody connects: browsers only join
          // after "Enable voice", and the .invalid host makes the server's LiveKit API calls fail fast
          // (logged as warnings). E2E_VOICE=0 runs without voice (voice:unavailable).
          ...(process.env.E2E_VOICE === '0'
            ? {}
            : {
                LIVEKIT_URL: 'wss://e2e-fake.livekit.invalid',
                LIVEKIT_API_KEY: 'APIe2efakekey',
                LIVEKIT_API_SECRET: randomBytes(24).toString('hex'),
                // (v2.3 VOICE-4) grants without "Enable voice" so specs can keep reading zones from voice:grant frames.
                VOICE_TEST_AUTO_OPT_IN: '1',
                VOICE_MAX_CONCURRENT: '0', // parallel specs share one server: no process-wide voice cap
              }),
          LOG_DIR: path.join(dataDir, 'logs'),
          CT_VERSION: 'e2e',
        },
      },
});
