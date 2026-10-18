// (v3.2 perf, lever 5; docs/perf-v3/fullstack.md §4/§7) Build-time compression of the client dist.
// Runs after `vite build` (apps/client package.json "build"). For every text file (js/mjs/css/json/svg)
// of at least 1 KiB it writes `<file>.br` (brotli quality 11) and `<file>.gz` (gzip level 9) next to
// it, each only when it is smaller than 95 % of the original. apps/server/src/precompressed.ts serves
// them with Content-Encoding to clients that accept br / gzip; the edge used to compress at ≈ brotli q4.
// HTML is not compressed: index.html is rewritten when served (%PUBLIC_ORIGIN%). Images never.
// Deterministic (gzip writes mtime 0, no file name); node:zlib only.
//
//   node build/precompress.mjs [distDir]   (default: apps/client/dist)
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

/** Keep in sync with COMPRESSIBLE in apps/server/src/precompressed.ts. */
export const COMPRESSIBLE = /\.(js|mjs|css|json|svg)$/i;
export const MIN_BYTES = 1024;
export const MAX_RATIO = 0.95;

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

async function walk(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

/** Compress one file; returns { file, raw, br, gz } (br/gz null when not written). */
async function one(file) {
  const buf = await readFile(file);
  const out = { file, raw: buf.length, br: null, gz: null };
  if (buf.length < MIN_BYTES) return out;
  const [b, g] = await Promise.all([
    brotli(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    }),
    gzip(buf, { level: 9 }),
  ]);
  for (const [ext, data] of [['br', b], ['gz', g]]) {
    if (data.length < buf.length * MAX_RATIO) {
      await writeFile(`${file}.${ext}`, data);
      out[ext] = data.length;
    } else {
      await rm(`${file}.${ext}`, { force: true });
    }
  }
  return out;
}

export async function precompress(dist) {
  await stat(dist);
  const all = await walk(dist);
  // stale siblings from an earlier run (vite empties dist, but be safe when run twice)
  await Promise.all(all.filter((f) => /\.(br|gz)$/.test(f)).map((f) => rm(f, { force: true })));
  const files = all.filter((f) => COMPRESSIBLE.test(f) && !path.basename(f).startsWith('.')).sort();
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(4, cpus().length)) }, async () => {
    while (next < files.length) results.push(await one(files[next++]));
  });
  await Promise.all(workers);
  return results.sort((a, b) => (a.file < b.file ? -1 : 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  const t0 = Date.now();
  const r = await precompress(dist);
  const sum = (k) => r.reduce((a, x) => a + (x[k] ?? x.raw), 0);
  const kib = (n) => (n / 1024).toFixed(1);
  console.log(
    `precompress: ${r.filter((x) => x.br).length} .br / ${r.filter((x) => x.gz).length} .gz of ${r.length} text files; ` +
      `raw ${kib(sum('raw'))} KiB -> br ${kib(sum('br'))} KiB, gz ${kib(sum('gz'))} KiB (${Date.now() - t0} ms)`,
  );
}
