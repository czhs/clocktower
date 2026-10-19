import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { pixel3dImports } from './build/pixel3dImports';
import { vendorTreeHash } from './build/townBake';
import { BASE_CHUNK, baseBeforeTheme, baseChunkFor, lazyIndexName, renamedCss, checkCssChunks, CSS_ORDER, markThemeLink, patchPreloadHelper, srcCss, type ChunkCss } from './build/cssOrder';

// (v2.3, Trusted Types) msgpackr (via colyseus) probes `new Function('')` at load to decide whether it
// may compile inline record readers. Under our CSP + Trusted Types that probe is refused (and caught),
// but the browser still logs a violation in every player's console. msgpackr documents replacing the
// probe for no-eval builds; we make the probe fail without calling Function, so msgpackr goes straight
// to its interpreter (inlineObjectReadThreshold = Infinity) and never evaluates strings.
function msgpackrNoEval(): Plugin {
  const probe = /try\s*\{\s*new Function\(''\)\s*\}\s*catch\s*\(error\)\s*\{/;
  return {
    name: 'ct-msgpackr-no-eval',
    enforce: 'pre',
    transform(code, id) {
      if (!/msgpackr[\\/]unpack\.js$/.test(id.split('?')[0]!) || !probe.test(code)) return null;
      return { code: code.replace(probe, 'try { throw 0 } catch (error) {'), map: null };
    },
  };
}

// (v2.4 perf P2) Lazy chunks carry their own stylesheets; this keeps the single-bundle cascade order
// (theme.css wins ties against feature sheets) — see build/cssOrder.ts and src/ui/common/cssOrder.ts.
// Build-time only: patches Vite's preload helper to place chunk <link>s via window.__ctPlaceCss, marks
// the theme <link> in index.html, and fails the build if a stylesheet lands outside the scheme.
function cssOrder(): Plugin {
  const chunks = new Map<string, ChunkCss>();
  let patched = false;
  return {
    name: 'ct-css-order',
    apply: 'build',
    transform(code, id) {
      if (id !== '\0vite/preload-helper.js') return null;
      const out = patchPreloadHelper(code);
      if (!out) this.error('ct-css-order: unexpected Vite preload helper (document.head.appendChild(link) not found once); update build/cssOrder.ts');
      patched = true;
      return { code: out, map: null };
    },
    renderChunk(_code, chunk) {
      const sheets = chunk.moduleIds.map(srcCss).filter((s): s is string => !!s);
      if (sheets.length) chunks.set(chunk.fileName, { name: chunk.name, isEntry: chunk.isEntry, sheets });
      return null;
    },
    generateBundle(_o, bundle) {
      // A renamed lazy index chunk (chunkFileNames) still gets Vite's CSS asset name index-*.css: rename
      // it after the chunk and fix the references (preload dependency lists, importedCss).
      const out = Object.values(bundle);
      for (const c of out) {
        if (c.type !== 'chunk' || c.isEntry) continue;
        const dir = lazyIndexName(c);
        if (!dir) continue;
        for (const css of [...(c.viteMetadata?.importedCss ?? [])]) {
          const to = renamedCss(css, dir);
          const asset = bundle[css];
          if (to === css || !asset || bundle[to]) continue;
          delete bundle[css];
          asset.fileName = to;
          bundle[to] = asset;
          for (const o of out) {
            if (o.type !== 'chunk') continue;
            if (o.code.includes(css)) o.code = o.code.split(css).join(to);
            const imported = o.viteMetadata?.importedCss;
            if (imported?.delete(css)) imported.add(to);
          }
        }
      }
      const errors = checkCssChunks([...chunks.values()]);
      const lazyCss = Object.values(bundle).some((c) => c.type === 'chunk' && c.isDynamicEntry && (c.viteMetadata?.importedCss.size ?? 0) > 0);
      if (lazyCss && !patched) errors.push('lazy chunks have CSS but the preload helper was not patched');
      if (errors.length) this.error(`ct-css-order:\n  ${errors.join('\n  ')}`);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // (the pure-CSS index-base chunk's sheet is listed with the entry's own)
        const own = [...(ctx.chunk?.viteMetadata?.importedCss ?? [])].filter((f) => !f.includes(`/${BASE_CHUNK}-`));
        if (own.length !== 1) throw new Error(`ct-css-order: the entry should have exactly one own stylesheet (the theme), found ${own.join(', ') || 'none'}`);
        const marked = markThemeLink(html, own[0]!);
        if (!marked) throw new Error(`ct-css-order: theme <link> for ${own[0]} not found in index.html`);
        // Vite lists the merged pure-CSS chunk after the entry's own sheet: the base goes first.
        const out = baseBeforeTheme(marked);
        if (!out) throw new Error(`ct-css-order: no ${BASE_CHUNK} stylesheet in index.html: ${marked.match(/<link rel="stylesheet"[^>]*>/g)?.join(' ')}`);
        return out;
      },
    },
  };
}

// (v3 WP0) The pixel3d vendor tree (v3/pixel3d/src, read-only) is not a workspace package and has no
// node_modules: its bare `three` / `three/addons/*` imports would never reach apps/client/node_modules
// (pnpm does not hoist). Resolve them explicitly to the ONE three@0.170.0 of this package (exact pin =
// v3/pixel3d/package.json), and expose the vendor as '@pixel3d/' and the baked UI atlases as
// '@v3assets/'. Only apps/client/src/game3d/vendor/** may import '@pixel3d/*' (boundary test).
export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
function packageDir(name: string): string {
  let d = path.dirname(createRequire(import.meta.url).resolve(name));
  while (!existsSync(path.join(d, 'package.json'))) d = path.dirname(d);
  return d;
}
export const threeDir = packageDir('three');
// (v3 perf, net front; docs/perf-v3/net.md) the vendor UI atlases are PNG only; packages/assets/scripts/v3/ui-webp.ts
// writes lossless WebP twins (bit-identical RGBA, ≈ 70 % smaller; test/v3ui-webp.test.ts). Every
// `@v3assets/<name>.png?url` with a twin resolves to it (v3atlas.ts and game3d/overlay/atlas.ts unchanged); a sheet
// without one keeps the PNG.
const v3UiWebpDir = path.join(repoRoot, 'packages/assets/generated/v3ui');
const v3UiWebp = existsSync(v3UiWebpDir) ? readdirSync(v3UiWebpDir).filter((f) => /^[a-z0-9-]+\.webp$/.test(f)).map((f) => f.slice(0, -5)) : [];
export const v3Aliases = [
  { find: /^three$/, replacement: path.join(threeDir, 'build/three.module.js') },
  { find: /^three\/addons\/(.*)$/, replacement: path.join(threeDir, 'examples/jsm/$1') },
  { find: /^@pixel3d\//, replacement: path.join(repoRoot, 'v3/pixel3d/src/') },
  ...(v3UiWebp.length ? [{ find: new RegExp(`^@v3assets/(${v3UiWebp.join('|')})\\.png\\?url$`), replacement: `${path.join(v3UiWebpDir, '$1')}.webp?url` }] : []),
  { find: /^@v3assets\//, replacement: path.join(repoRoot, 'v3/assets/ui/') },
];

// The production server (apps/server) serves dist/ on the same origin as the API and
// WebSockets. In dev, `pnpm --filter @ct/client dev` proxies API/WS to the dev server on 3001.
//
// (v2.2 perf WP3) The browser never validates messages (the server does), so the bundle resolves
// the bare `@ct/protocol` to its schema-free entry `@ct/protocol/client`: the same types and runtime
// values without zod. Client code (and @ct/voice/shared, @ct/assets) keeps importing '@ct/protocol'
// and typechecks against the full protocol; importing a schema at runtime fails this build
// ("… is not exported by …/client.ts").
export default defineConfig({
  plugins: [msgpackrNoEval(), pixel3dImports(), cssOrder()],
  // (v3.3 bake) the tree cache's vendor key (vendor/townBake.ts): a vendor / patch / three change invalidates every record
  define: { __CT_CSS_ORDER__: JSON.stringify(CSS_ORDER), __CT_VENDOR_HASH__: JSON.stringify(vendorTreeHash(repoRoot, JSON.parse(readFileSync(path.join(threeDir, 'package.json'), 'utf8')).version)) },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: [{ find: /^@ct\/protocol$/, replacement: '@ct/protocol/client' }, ...v3Aliases], dedupe: ['three'] },
  // (v3) pre-bundle the three addons the vendor imports, so the dev server does not reload the page mid-boot
  optimizeDeps: { include: ['three', 'three/addons/utils/BufferGeometryUtils.js', 'three/addons/geometries/ConvexGeometry.js'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/healthz': 'http://127.0.0.1:3001',
      '/matchmake': 'http://127.0.0.1:3001',
      '^/[a-zA-Z0-9]{9}/[a-zA-Z0-9_-]+': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: baseChunkFor,
        // (v2.4 P2) lazy chunks entered at a directory's index.tsx are named after the directory (their
        // CSS asset is renamed to match in cssOrder's generateBundle)
        // (v3 WP0) the 3D town's entry chunk is "town3d" (budget key town3dChunkBrKiB, docs/v3/INTEGRATION.md §7)
        // (facadeModuleId is null for that chunk: match its module list)
        chunkFileNames: (c) => `assets/${c.moduleIds.some((id) => /[\\/]game3d[\\/]TownGame3d\.ts$/.test(id)) ? 'town3d' : (lazyIndexName(c) ?? '[name]')}-[hash].js`,
      },
    },
  },
});
