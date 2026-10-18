#!/usr/bin/env node
// (v3 perf recon, front "net") Static asset caching / compression audit. READ-ONLY: GET / HEAD only.
//
//   Live mode (default base = the dev service on the host): walks index.html -> its scripts / styles / preloads ->
//   every assets/* URL referenced from the fetched JS/CSS (transitively), and for each file records status,
//   Content-Type, Cache-Control, Content-Encoding (with Accept-Encoding: br, gzip), bytes on the wire, and the
//   brotli-11 / gzip-9 size the edge could ship (computed locally). Also probes a missing hashed chunk (must be a
//   404 no-store, not the SPA shell) and /healthz.
//     CT_AGENT=v3-perf-net scripts/remote.sh node scripts/perf/net-static.mjs --base http://127.0.0.1:3001 --out /tmp/ct-v3net/static-dev.json
//   Dist mode (offline, a built apps/client/dist): sizes raw / gz / br per file type, the largest files, PNGs that
//   would be smaller as WebP candidates, harness leakage (v3-harness*), and whether hashed names are used.
//     CT_AGENT=v3-perf-net scripts/remote.sh node scripts/perf/net-static.mjs --dist apps/client/dist --out /tmp/ct-v3net/static-dist.json
//
// Never point it at the production port (3000): refused. No request bodies, no cookies, no auth.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const KiB = 1024;
const r1 = (v) => Math.round(v * 10) / 10;
const TEXT = /\.(js|mjs|css|json|svg|html|txt|map)$/i;
const HASHED = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
const br = (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }).length;
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'ct-net-static/1 (read-only audit)', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(20_000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const decode = (r) => {
  const enc = r.headers['content-encoding'];
  if (enc === 'br') return zlib.brotliDecompressSync(r.body);
  if (enc === 'gzip') return zlib.gunzipSync(r.body);
  return r.body;
};

async function live(base) {
  const u = new URL(base);
  if (u.port === '3000') throw new Error('refusing to audit the production port (3000)');
  const out = { base, at: new Date().toISOString(), files: [], checks: {} };
  const hz = await get(new URL('/healthz', base).href).catch((e) => ({ status: String(e.message) }));
  out.healthz = hz.status === 200 ? JSON.parse(hz.body.toString()) : hz.status;
  const idx = await get(new URL('/', base).href, { Accept: 'text/html', 'Accept-Encoding': 'br, gzip' });
  const html = decode(idx).toString('utf8');
  out.index = { status: idx.status, cacheControl: idx.headers['cache-control'] ?? null, contentEncoding: idx.headers['content-encoding'] ?? null, wireB: idx.body.length, rawB: Buffer.byteLength(html) };
  const queue = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) queue.add(m[1]);
  const seen = new Set();
  const list = [...queue];
  while (list.length && seen.size < 600) {
    const p = list.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    let r;
    try {
      r = await get(new URL(p, base).href, { 'Accept-Encoding': 'br, gzip' });
    } catch (e) {
      out.files.push({ path: p, error: e.message });
      continue;
    }
    const body = decode(r);
    const text = TEXT.test(p);
    const f = {
      path: p,
      status: r.status,
      type: r.headers['content-type'] ?? null,
      cacheControl: r.headers['cache-control'] ?? null,
      contentEncoding: r.headers['content-encoding'] ?? null,
      etag: !!r.headers.etag,
      wireB: r.body.length,
      rawB: body.length,
      brB: text && r.status === 200 ? br(body) : null,
      gzB: text && r.status === 200 ? gz(body) : null,
      hashed: HASHED.test(p),
    };
    out.files.push(f);
    if (r.status === 200 && /\.(js|mjs|css)$/.test(p)) {
      const s = body.toString('utf8');
      for (const m of s.matchAll(/(?:\/|\.\/|")((?:assets|landing|audio|art|tutorial)\/[A-Za-z0-9_.@-]+\.(?:json|js|css|webp|png|woff2|woff|mp3|ogg|opus|svg|wasm))(?=["'`?#)\s,])/g)) {
        const q = `/${m[1]}`;
        if (!seen.has(q)) list.push(q);
      }
    }
  }
  const miss = await get(new URL('/assets/ct-net-static-missing-AbCdEf12.js', base).href);
  out.checks.missingChunk = { status: miss.status, type: miss.headers['content-type'] ?? null, cacheControl: miss.headers['cache-control'] ?? null, ok: miss.status === 404 && /no-store/.test(miss.headers['cache-control'] ?? '') };
  const assets = out.files.filter((f) => f.path.startsWith('/assets/') && f.status === 200);
  out.checks.assets = assets.length;
  out.checks.assetsNotImmutable = assets.filter((f) => !/immutable/.test(f.cacheControl ?? '') || !/max-age=31536000/.test(f.cacheControl ?? '')).map((f) => f.path);
  out.checks.assetsNotHashed = assets.filter((f) => !f.hashed).map((f) => f.path);
  out.checks.indexNoCache = /no-cache/.test(out.index.cacheControl ?? '');
  out.checks.originCompressesText = out.files.some((f) => f.contentEncoding);
  out.checks.non200 = out.files.filter((f) => f.status !== 200).map((f) => `${f.status} ${f.path}`);
  out.summary = summarise(out.files.filter((f) => f.status === 200).map((f) => ({ path: f.path, raw: f.rawB, br: f.brB, gz: f.gzB })));
  return out;
}

function walk(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push(path.relative(base, p));
  }
  return acc;
}

function dist(dir) {
  if (!existsSync(dir)) throw new Error(`no dist at ${dir}`);
  const files = walk(dir).map((rel) => {
    const b = readFileSync(path.join(dir, rel));
    const text = TEXT.test(rel);
    return { path: `/${rel}`, raw: b.length, br: text ? br(b) : null, gz: text ? gz(b) : null };
  });
  const out = { dist: dir, at: new Date().toISOString(), files: files.length, summary: summarise(files) };
  out.checks = {
    harnessInDist: files.filter((f) => /v3-harness|\/harness\//.test(f.path)).map((f) => f.path),
    assetsNotHashed: files.filter((f) => f.path.startsWith('/assets/') && !HASHED.test(f.path)).map((f) => f.path),
    threeCopies: files.filter((f) => f.path.endsWith('.js') && /REVISION\s*=\s*["']170["']|"170"\s*,\s*REVISION/.test(readFileSync(path.join(dir, f.path)).toString('utf8'))).map((f) => f.path),
  };
  return out;
}

function summarise(files) {
  const byType = {};
  for (const f of files) {
    const ext = (f.path.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'other').toLowerCase();
    const t = (byType[ext] ??= { n: 0, rawKiB: 0, brKiB: 0, gzKiB: 0 });
    t.n++;
    t.rawKiB += f.raw / KiB;
    t.brKiB += (f.br ?? f.raw) / KiB;
    t.gzKiB += (f.gz ?? f.raw) / KiB;
  }
  for (const t of Object.values(byType)) for (const k of ['rawKiB', 'brKiB', 'gzKiB']) t[k] = r1(t[k]);
  const pngs = files.filter((f) => f.path.endsWith('.png'));
  return {
    byType,
    totalRawKiB: r1(files.reduce((a, f) => a + f.raw, 0) / KiB),
    totalEdgeKiB: r1(files.reduce((a, f) => a + (f.br ?? f.raw), 0) / KiB),
    largest: [...files].sort((a, b) => b.raw - a.raw).slice(0, 25).map((f) => ({ path: f.path, rawKiB: r1(f.raw / KiB), brKiB: f.br == null ? null : r1(f.br / KiB) })),
    pngKiB: r1(pngs.reduce((a, f) => a + f.raw, 0) / KiB),
    pngOver20KiB: pngs.filter((f) => f.raw > 20 * KiB).map((f) => `${f.path} ${r1(f.raw / KiB)} KiB`),
  };
}

const distDir = arg('dist');
const res = distDir ? dist(path.resolve(distDir)) : await live(arg('base', 'http://127.0.0.1:3001'));
const out = arg('out');
if (out) {
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(res, null, 1));
}
const { files: _f, ...head } = res;
console.log(JSON.stringify(head, null, 1));
if (out) console.log(`wrote ${out}`);
