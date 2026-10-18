// (v3.2 perf, lever 5) Build-time brotli / gzip siblings (apps/client/build/precompress.mjs) served by
// apps/server/src/precompressed.ts in front of express.static: negotiation with q-values, headers
// (Content-Encoding / Vary / Content-Type / Cache-Control / Content-Length / ETag), HEAD, conditional
// GET, Range -> identity, fallbacks and no traversal. Runs the real app.ts stack on 127.0.0.1:3377.
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAppServer, type RunningServer } from '../src/app.js';
import { negotiateEncoding } from '../src/precompressed.js';
import { captureLogger, fakeModules, testConfig } from '../src/rooms/testkit.js';
// @ts-expect-error -- plain .mjs build script (no declarations)
import { precompress } from '../../client/build/precompress.mjs';

const PORT = 3377; // perf-wp6 range 3376-3377
const IMMUTABLE = 'public, max-age=31536000, immutable';
const BROWSER_NAV = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const JS = `export const town = ${JSON.stringify('lantern '.repeat(600))};\n`; // > 1 KiB, compresses well
const CSS = `body{color:#123}\n${'.a{margin:0 auto;padding:1px}\n'.repeat(80)}`;
const ATLAS = JSON.stringify({ frames: Array.from({ length: 80 }, (_, i) => ({ name: `f${i}`, x: i, y: 2 * i, w: 16, h: 16 })) });
const MANIFEST = JSON.stringify({ generatedAt: '2026-10-18', clips: Array.from({ length: 200 }, (_, i) => `clip-${i}`) });

let srv: RunningServer;
let dist: string;

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}
function req(url: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: url, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end();
  });
}

beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'ct-dist-br-'));
  const put = (rel: string, body: string | Buffer) => {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), body);
  };
  put('index.html', `<!doctype html><title>Clocktower Town</title>${'<!-- pad -->'.repeat(200)}<div id="app"></div>`);
  put('assets/town3d-AbC123de.js', JS);
  put('assets/index-AbC123de.css', CSS);
  put('assets/events-night-Zz9Yx8Wv.json', ATLAS);
  put('assets/tiny-AbC123de.js', 'export const t = 1;'); // < 1 KiB: no siblings
  put('assets/cast-AbC123de.png', Buffer.alloc(4096, 7)); // image: never compressed
  put('assets/onlygz-AbC123de.js', JS.replace('town', 'gzonly'));
  put('tutorial/manifest.json', MANIFEST);
  put('landing/logo.png', 'png');
  const results = await precompress(dist);
  // the gzip-only fixture: drop its .br to test "missing .br falls back to .gz / identity"
  const { rmSync } = await import('node:fs');
  rmSync(path.join(dist, 'assets/onlygz-AbC123de.js.br'));
  expect(results.length).toBeGreaterThan(0);
  srv = await startAppServer(testConfig(PORT), captureLogger(), { clientDist: dist, scryptN: 1 << 12, moduleFactories: fakeModules().factories });
});
afterAll(async () => {
  await srv?.close();
});

describe('build step (precompress.mjs)', () => {
  it('writes .br / .gz for text >= 1 KiB only, never for images or HTML, and they round-trip', () => {
    const has = (rel: string) => {
      try {
        readFileSync(path.join(dist, rel));
        return true;
      } catch {
        return false;
      }
    };
    expect(has('assets/town3d-AbC123de.js.br')).toBe(true);
    expect(has('assets/town3d-AbC123de.js.gz')).toBe(true);
    expect(has('assets/events-night-Zz9Yx8Wv.json.br')).toBe(true);
    expect(has('assets/tiny-AbC123de.js.br')).toBe(false);
    expect(has('assets/cast-AbC123de.png.br')).toBe(false);
    expect(has('index.html.br')).toBe(false);
    expect(zlib.brotliDecompressSync(readFileSync(path.join(dist, 'assets/town3d-AbC123de.js.br'))).toString()).toBe(JS);
    expect(zlib.gunzipSync(readFileSync(path.join(dist, 'assets/town3d-AbC123de.js.gz'))).toString()).toBe(JS);
  });
});

describe('negotiateEncoding', () => {
  const both = ['br', 'gzip'] as const;
  it.each([
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip, deflate', 'gzip'],
    ['br;q=0, gzip', 'gzip'],
    ['br;q=0', null],
    ['br;q=0.5, gzip;q=0.8', 'gzip'],
    ['gzip;q=0.5, br;q=0.5', 'br'],
    ['identity', null],
    ['*', 'br'],
    ['*;q=0', null],
    ['gzip;q=0, *', 'br'],
    ['BR', 'br'],
    ['x-gzip', 'gzip'],
    ['', null],
  ])('%j -> %s', (header, want) => {
    expect(negotiateEncoding(header, both)).toBe(want);
  });
  it('only picks codings that exist on disk', () => {
    expect(negotiateEncoding('br, gzip', ['gzip'])).toBe('gzip');
    expect(negotiateEncoding('br', ['gzip'])).toBe(null);
    expect(negotiateEncoding(undefined, both)).toBe(null);
  });
});

describe('serving precompressed siblings', () => {
  const town = '/assets/town3d-AbC123de.js';

  it('serves br when offered, with the original type, immutable caching, Vary and the encoded length', async () => {
    const id = await req(town);
    const r = await req(town, { 'Accept-Encoding': 'gzip, deflate, br, zstd' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('br');
    expect(r.headers['content-type']).toBe(id.headers['content-type']);
    expect(r.headers['content-type']).toMatch(/javascript/);
    expect(r.headers['cache-control']).toBe(IMMUTABLE);
    expect(r.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(JS.length / 5);
    expect(zlib.brotliDecompressSync(r.body).toString()).toBe(JS);
    expect(r.headers['etag']).toMatch(/-br"$/);
    expect(r.headers['etag']).not.toBe(id.headers['etag']);
    // global security headers still apply
    expect(r.headers['content-security-policy']).toBe(id.headers['content-security-policy']);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves gzip when only gzip is offered', async () => {
    const r = await req(town, { 'Accept-Encoding': 'gzip, deflate' });
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(r.headers['etag']).toMatch(/-gz"$/);
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(zlib.gunzipSync(r.body).toString()).toBe(JS);
  });

  it('serves identity (with Vary) when nothing, identity or br;q=0 is offered', async () => {
    for (const ae of [undefined, 'identity', 'br;q=0', 'br;q=0, gzip;q=0']) {
      const r = await req(town, ae === undefined ? {} : { 'Accept-Encoding': ae });
      expect(r.status, ae).toBe(200);
      expect(r.headers['content-encoding'], ae).toBeUndefined();
      expect(r.headers['vary'], ae).toMatch(/Accept-Encoding/i);
      expect(r.headers['cache-control'], ae).toBe(IMMUTABLE);
      expect(r.body.toString(), ae).toBe(JS);
    }
  });

  it('css and the hashed JSON atlases are compressed too; JSON keeps application/json and immutable', async () => {
    const css = await req('/assets/index-AbC123de.css', { 'Accept-Encoding': 'br' });
    expect(css.headers['content-encoding']).toBe('br');
    expect(css.headers['content-type']).toMatch(/^text\/css/);
    const json = await req('/assets/events-night-Zz9Yx8Wv.json', { 'Accept-Encoding': 'br' });
    expect(json.headers['content-encoding']).toBe('br');
    expect(json.headers['content-type']).toMatch(/^application\/json/);
    expect(json.headers['cache-control']).toBe(IMMUTABLE);
    expect(zlib.brotliDecompressSync(json.body).toString()).toBe(ATLAS);
  });

  it('unhashed public JSON keeps its revalidate policy when compressed', async () => {
    const r = await req('/tutorial/manifest.json', { 'Accept-Encoding': 'br' });
    expect(r.headers['content-encoding']).toBe('br');
    expect(r.headers['cache-control']).toBe('no-cache');
  });

  it('HEAD sends the encoded headers and no body', async () => {
    const r = await req(town, { 'Accept-Encoding': 'br' }, 'HEAD');
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('br');
    expect(Number(r.headers['content-length'])).toBe(readFileSync(path.join(dist, 'assets/town3d-AbC123de.js.br')).length);
    expect(r.body.length).toBe(0);
  });

  it('answers 304 to If-None-Match with the encoded ETag (and 200 for the other variant)', async () => {
    const first = await req(town, { 'Accept-Encoding': 'br' });
    const etag = first.headers['etag'] as string;
    const again = await req(town, { 'Accept-Encoding': 'br', 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    expect(again.headers['etag']).toBe(etag);
    expect(again.headers['vary']).toMatch(/Accept-Encoding/i);
    const gz = await req(town, { 'Accept-Encoding': 'gzip', 'If-None-Match': etag });
    expect(gz.status).toBe(200);
    expect(gz.headers['content-encoding']).toBe('gzip');
  });

  it('serves Range requests identity (ranges of the identity file)', async () => {
    const r = await req(town, { 'Accept-Encoding': 'br', Range: 'bytes=0-9' });
    expect(r.status).toBe(206);
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.toString()).toBe(JS.slice(0, 10));
  });

  it('falls back when a sibling is missing: gzip, else identity; small files and images stay identity', async () => {
    const g = await req('/assets/onlygz-AbC123de.js', { 'Accept-Encoding': 'br, gzip' });
    expect(g.headers['content-encoding']).toBe('gzip');
    const b = await req('/assets/onlygz-AbC123de.js', { 'Accept-Encoding': 'br' });
    expect(b.headers['content-encoding']).toBeUndefined();
    expect(b.status).toBe(200);
    const tiny = await req('/assets/tiny-AbC123de.js', { 'Accept-Encoding': 'br' });
    expect(tiny.headers['content-encoding']).toBeUndefined();
    expect(tiny.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(tiny.body.toString()).toBe('export const t = 1;');
    const png = await req('/assets/cast-AbC123de.png', { 'Accept-Encoding': 'br' });
    expect(png.headers['content-encoding']).toBeUndefined();
    expect(png.headers['vary']).toBeUndefined();
  });

  it('never serves a sibling under its own URL', async () => {
    for (const u of ['/assets/town3d-AbC123de.js.br', '/assets/town3d-AbC123de.js.gz']) {
      const r = await req(u, { 'Accept-Encoding': 'br' });
      expect(r.status, u).toBe(404);
      expect(r.headers['cache-control'], u).toBe('no-store');
      expect(r.headers['content-encoding'], u).toBeUndefined();
    }
  });

  it('missing files are still the uncacheable 404', async () => {
    const r = await req('/assets/town3d-Gone9999.js', { 'Accept-Encoding': 'br' });
    expect(r.status).toBe(404);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-encoding']).toBeUndefined();
  });

  it('does not traverse out of the dist', async () => {
    const outside = path.join(path.dirname(dist), 'ct-outside-secret.js');
    writeFileSync(outside, JS);
    writeFileSync(`${outside}.br`, zlib.brotliCompressSync(JS));
    for (const u of [`/assets/..%2f..%2f${path.basename(outside)}`, `/..%2f${path.basename(outside)}`, `/assets/%2e%2e/%2e%2e/${path.basename(outside)}`, '/assets/%00.js', '/assets/%E0%A4%A.js']) {
      const r = await req(u, { 'Accept-Encoding': 'br' });
      expect(r.status, u).not.toBe(200);
      expect(r.headers['content-encoding'], u).toBeUndefined();
    }
  });

  it('index.html and the SPA fallback are unchanged (never encoded)', async () => {
    const nav = await req('/lobby/AbCd1234', { Accept: BROWSER_NAV, 'Accept-Encoding': 'br, gzip' });
    expect(nav.status).toBe(200);
    expect(nav.headers['content-encoding']).toBeUndefined();
    expect(nav.headers['cache-control']).toBe('no-cache');
    expect(nav.body.toString()).toContain('<div id="app"></div>');
    const root = await req('/', { Accept: BROWSER_NAV, 'Accept-Encoding': 'br' });
    expect(root.headers['content-encoding']).toBeUndefined();
    expect(root.headers['content-type']).toMatch(/text\/html/);
  });
});
