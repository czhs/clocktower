// v3 WP7 (v3-qa). Build of the mock-world harness page (apps/client/v3-harness.html → src/game3d/harness/main.ts,
// docs/v3/INTEGRATION.md §6.3). A SEPARATE build: own input, own outDir (dist-harness/), invoked only by
// scripts/v3/render-check.sh; `pnpm build` (vite.config.ts) never sees the harness.
//
// It reuses the app config (aliases for three / @pixel3d / @v3assets / @ct/protocol, the vendor import rewrites, the
// msgpackr no-eval patch, the CSS order define) minus the css-order plugin, whose index.html checks are specific to
// the app entry. `vite preview -c vite.harness.config.ts` serves dist-harness/ on 127.0.0.1:3460 (v3-qa harness port)
// with the PRODUCTION Content-Security-Policy (apps/server/src/securityHeaders.ts, Trusted Types on), and no proxy:
// the harness never talks to a server.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';
import app from './vite.config';
import { contentSecurityPolicy } from '../server/src/securityHeaders';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = app as UserConfig;
const PORT = Number(process.env.HARNESS_PORT ?? 3460);
const csp = contentSecurityPolicy({ publicOrigin: `http://127.0.0.1:${PORT}`, livekitUrl: '', trustedTypes: true });
const plugins = ((base.plugins ?? []) as PluginOption[]).flat().filter((p) => !(p && typeof p === 'object' && 'name' in p && p.name === 'ct-css-order'));

export default defineConfig({
  ...base,
  plugins,
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: base.server?.fs, proxy: {} },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true, headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } },
  build: {
    target: 'es2022',
    outDir: path.join(here, 'dist-harness'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: { input: { 'v3-harness': path.join(here, 'v3-harness.html') } },
  },
});
