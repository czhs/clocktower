// Playwright E2E (qa-deploy). Runs ON hshi-u1 (scripts/remote.sh pnpm test:e2e).
//
// By default the config builds the app and starts a throwaway server on 127.0.0.1:3398 with a temp
// SQLite DB and random secrets (webServer below). To run against an existing deployment instead:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e      # dev service (on hshi-u1)
//   E2E_BASE_URL=https://hshi-u1.tailf28040.ts.net pnpm test:e2e   # prod via Funnel (creates accounts!)
// CT_E2E_NO_BUILD=1 skips the build step (use a dist you just built).
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3398;
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;
const dataDir = external ? '' : mkdtempSync(path.join(os.tmpdir(), 'ct-e2e-'));

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
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
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
          LOG_DIR: path.join(dataDir, 'logs'),
          CT_VERSION: 'e2e',
        },
      },
});
