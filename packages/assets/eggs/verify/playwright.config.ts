// In-game verification of the CMU easter eggs (cmu-eggs). Runs ON hshi-u1:
//   CT_AGENT=eggs scripts/remote.sh bash -c 'pnpm assets:generate && pnpm -r --if-present run build && \
//     CT_E2E_NO_BUILD=1 npx playwright test -c packages/assets/eggs/verify/playwright.config.ts'
// Starts a throwaway server on 127.0.0.1:3370 (temp SQLite, random secrets), like the qa config.
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PORT = 3370;
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ct-eggs-'));

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: path.join(root, 'test-results/eggs'),
  reporter: [['list']],
  timeout: 900_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  // hardware WebGL on hshi-u1's RTX 3060 (SwiftShader runs the town at ~1 fps under load);
  // see gpu-probe.mjs
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] } },
    },
  ],
  webServer: {
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
      DATABASE_URL: `file:${path.join(dataDir, 'eggs.db')}`,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      PASSPHRASE_PEPPER: randomBytes(32).toString('hex'),
      COOKIE_SECURE: 'false',
      LOBBY_MAX_COUNT: '8',
      LOBBY_IDLE_TIMEOUT_SEC: '120',
      LIVEKIT_ROOM_PREFIX: 'test',
      LOG_DIR: path.join(dataDir, 'logs'),
      CT_VERSION: 'eggs',
    },
  },
});
