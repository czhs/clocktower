// v3 WP7 (v3-qa). Playwright config for the mock-world harness stills + checks (docs/v3/INTEGRATION.md §6.3), run ONLY
// by scripts/v3/render-check.sh on the host (under the heavy + browser locks). Serves the harness build
// (apps/client/dist-harness, `vite build -c vite.harness.config.ts` first) with `vite preview` on 127.0.0.1:$HARNESS_PORT
// (default 3460, the v3-qa harness port) and the production CSP; Chromium on SwiftShader only (CPU; never GPU flags).
// Stills: tests/v3/shots/<UTC date>/<shot>.png (gitignored) + summary.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.HARNESS_PORT ?? 3460);

export default defineConfig({
  testDir: '.',
  testMatch: /render-check\.spec\.ts$/,
  outputDir: path.join(root, 'test-results/v3-harness'),
  reporter: [['list']],
  timeout: 600_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] },
  },
  webServer: {
    command: `pnpm --filter @ct/client exec vite preview -c vite.harness.config.ts --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: root,
    url: `http://127.0.0.1:${PORT}/v3-harness.html`,
    timeout: 60_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { HARNESS_PORT: String(PORT) },
  },
});
