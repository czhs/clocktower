#!/usr/bin/env node
// perf-audit: production bundle composition report (no product code changes, no new deps).
// Builds apps/client with its own vite.config.ts into a temp dir, records per-module rendered bytes
// per chunk, then prints per-chunk raw/gzip/brotli sizes, top packages per chunk, and every asset.
//   CT_AGENT=perf-audit scripts/remote.sh node scripts/perf/bundle-report.mjs [--json out.json]
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../../apps/client');
const { build } = await import(createRequire(path.join(root, 'package.json')).resolve('vite'));
const outDir = mkdtempSync(path.join(tmpdir(), 'ct-bundle-'));
const chunks = {};
const pkgOf = (id) => {
  const m = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  const w = id.match(/(apps\/client\/src\/[^/]+(?:\/[^/]+)?|packages\/[^/]+)/);
  return w ? w[1] : id.replace(/\?.*$/, '').slice(-60);
};
await build({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, reportCompressedSize: false },
  plugins: [{
    name: 'ct-perf-modules',
    generateBundle(_o, bundle) {
      for (const [file, c] of Object.entries(bundle)) {
        if (c.type !== 'chunk') continue;
        const by = {};
        for (const [id, m] of Object.entries(c.modules)) by[pkgOf(id)] = (by[pkgOf(id)] ?? 0) + m.renderedLength;
        chunks[file] = { isEntry: c.isEntry, isDynamicEntry: c.isDynamicEntry, imports: c.imports, dynamicImports: c.dynamicImports, by };
      }
    },
  }],
});
const kb = (n) => (n / 1024).toFixed(1);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rows = [];
for (const p of walk(outDir)) {
  const buf = readFileSync(p);
  const rel = path.relative(outDir, p);
  const text = /\.(js|css|json|html|svg)$/.test(p);
  rows.push({ file: rel, raw: buf.length, gz: text ? zlib.gzipSync(buf, { level: 9 }).length : null, br: text ? zlib.brotliCompressSync(buf).length : null });
}
rows.sort((a, b) => b.raw - a.raw);
const out = { outDir, chunks, files: rows };
console.log('\n# JS/CSS chunks (KiB raw / gzip / brotli)');
for (const r of rows.filter((r) => /\.(js|css)$/.test(r.file))) {
  const c = chunks[r.file.replace(/^/, '')] ?? chunks[r.file];
  console.log(`${r.file.padEnd(40)} ${kb(r.raw).padStart(8)} ${kb(r.gz).padStart(8)} ${kb(r.br).padStart(8)}${c ? `  entry=${c.isEntry} dyn=${c.isDynamicEntry} imports=${c.imports.join(',')} dynImports=${c.dynamicImports.join(',')}` : ''}`);
  if (c) for (const [k, v] of Object.entries(c.by).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${kb(v).padStart(8)} KiB  ${k}`);
}
const groups = {};
for (const r of rows) { const g = r.file.split('/')[0] === 'assets' ? path.extname(r.file) : r.file.split('/')[0]; (groups[g] ??= { n: 0, raw: 0 }); groups[g].n++; groups[g].raw += r.raw; }
console.log('\n# totals by group (count, KiB)');
for (const [g, v] of Object.entries(groups).sort((a, b) => b[1].raw - a[1].raw)) console.log(`${g.padEnd(14)} ${String(v.n).padStart(4)} ${kb(v.raw).padStart(10)}`);
console.log('\n# largest non-code files');
for (const r of rows.filter((r) => !/\.(js|css)$/.test(r.file)).slice(0, 30)) console.log(`${r.file.padEnd(48)} ${kb(r.raw).padStart(9)} KiB${r.gz ? ` gz ${kb(r.gz)}` : ''}`);
const j = process.argv.indexOf('--json');
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
