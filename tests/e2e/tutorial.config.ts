// Playwright config for the pre-sign-in tour (tutorial teammate). Runs ON hshi-u1:
//
//   CT_AGENT=tutorial scripts/remote.sh pnpm capture:tutorial     # re-record the tour footage
//   CT_AGENT=tutorial scripts/pull.sh apps/client/public/tutorial # bring the clips back
//   CT_AGENT=tutorial scripts/remote.sh pnpm exec playwright test -c tests/e2e/tutorial.config.ts --project intro
//
// Starts its own throwaway server on the first free port of 127.0.0.1:3350-3359 (or CT_TUTORIAL_PORT) with a temp SQLite DB
// and random secrets: never the dev (3001) or production (3000) service. Chromium renders WebGL on
// the RTX 3060 through ANGLE/Vulkan (SwiftShader manages ~1 fps for the town under load); the capture
// spec checks the renderer string and refuses to record on a software renderer.
// CT_E2E_NO_BUILD=1 skips the build (use a dist you just built).
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const free = (port: number) =>
  new Promise<boolean>((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
/** First free port in 3350-3359 (other suites' throwaway servers also use this range). The config
 * is evaluated in the runner and in each worker: the runner's choice is passed on via the env. */
async function pickPort(): Promise<number> {
  if (process.env.CT_TUTORIAL_PORT) return Number(process.env.CT_TUTORIAL_PORT);
  for (let p = 3350; p <= 3359; p++) if (await free(p)) return p;
  throw new Error('no free port in 3350-3359');
}
const PORT = await pickPort();
process.env.CT_TUTORIAL_PORT = String(PORT);
if (PORT < 3350 || PORT > 3359) throw new Error('CT_TUTORIAL_PORT must be in 3350-3359');
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ct-tutorial-'));
export const GPU_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: '.',
  outputDir: path.join(root, 'test-results/tutorial'),
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [
    {
      name: 'capture',
      testMatch: /(^|\/)capture-tutorial\.spec\.ts$/,
      timeout: 1_800_000,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
    },
    {
      name: 'intro',
      testMatch: /(^|\/)tutorial-[^/]*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
    },
  ],
  webServer: {
    command: `${process.env.CT_E2E_NO_BUILD ? '' : 'pnpm -r --if-present run build >&2 && '}exec node --enable-source-maps apps/server/dist/server.js`,
    cwd: root,
    url: `http://127.0.0.1:${PORT}/healthz`,
    timeout: 240_000,
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
      DATABASE_URL: `file:${path.join(dataDir, 'tutorial.db')}`,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      PASSPHRASE_PEPPER: randomBytes(32).toString('hex'),
      COOKIE_SECURE: 'false',
      LOBBY_MAX_COUNT: '4',
      LOBBY_IDLE_TIMEOUT_SEC: '300',
      RECONNECT_GRACE_SEC: '60',
      LIVEKIT_URL: '',
      LIVEKIT_API_KEY: '',
      LIVEKIT_API_SECRET: '',
      LIVEKIT_ROOM_PREFIX: 'test',
      LOG_DIR: path.join(dataDir, 'logs'),
      CT_VERSION: 'tutorial',
    },
  },
});
