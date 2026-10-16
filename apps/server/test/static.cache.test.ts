// v2.2 WP6: HTTP caching of the built client. Hashed /assets/* are immutable, other public files
// are cached for a day with stale-while-revalidate, index.html / the SPA fallback revalidate, a
// missing file is an uncacheable 404 (never index.html), and API/health responses are never given
// a cacheable lifetime. Runs the real app.ts stack against a fixture dist on 127.0.0.1:3376.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAppServer, type RunningServer } from '../src/app.js';
import { captureLogger, fakeModules, testConfig } from '../src/rooms/testkit.js';

const PORT = 3376; // perf-wp6 range 3376-3377
const BASE = `http://127.0.0.1:${PORT}`;
const INDEX = '<!doctype html><title>Clocktower Town</title><div id="app"></div>';
const BROWSER_NAV = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const PUBLIC_FILE = 'public, max-age=86400, stale-while-revalidate=604800';

let srv: RunningServer;

function writeDist(): string {
  const dist = mkdtempSync(path.join(tmpdir(), 'ct-dist-'));
  const put = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), body);
  };
  put('index.html', INDEX);
  put('assets/index-AbC123de.js', 'export const entry = 1;');
  put('assets/TownGame-Old12345.js', 'export const town = 1;');
  put('assets/index-AbC123de.css', 'body{}');
  put('landing/logo.png', 'png');
  put('audio/ui/click.ogg', 'ogg');
  put('tutorial/manifest.json', '{"clips":[]}');
  put('favicon.png', 'png');
  put('.own-assets', 'index-AbC123de.js\n');
  return dist;
}

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  fetch(BASE + url, { method, headers, redirect: 'manual' });

beforeAll(async () => {
  srv = await startAppServer(testConfig(PORT), captureLogger(), {
    clientDist: writeDist(),
    scryptN: 1 << 12,
    moduleFactories: fakeModules().factories,
  });
});
afterAll(async () => {
  await srv?.close();
});

describe('static caching', () => {
  it('serves content-hashed /assets/* as immutable for a year', async () => {
    for (const f of ['/assets/index-AbC123de.js', '/assets/TownGame-Old12345.js', '/assets/index-AbC123de.css']) {
      const r = await get(f);
      expect(r.status, f).toBe(200);
      expect(r.headers.get('cache-control'), f).toBe(IMMUTABLE);
    }
    const js = await get('/assets/index-AbC123de.js');
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(await js.text()).toBe('export const entry = 1;');
  });

  it('caches unhashed public files for a day with stale-while-revalidate and validators', async () => {
    for (const f of ['/landing/logo.png', '/audio/ui/click.ogg', '/favicon.png']) {
      const r = await get(f);
      expect(r.status, f).toBe(200);
      expect(r.headers.get('cache-control'), f).toBe(PUBLIC_FILE);
    }
    const first = await get('/landing/logo.png');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    // (fetch adds `Cache-Control: no-cache` to conditional requests unless one is set; browsers
    // revalidating a stale entry send max-age=0 or nothing.)
    expect((await get('/landing/logo.png', { 'If-None-Match': etag!, 'Cache-Control': 'max-age=0' })).status).toBe(304);
  });

  it('always revalidates JSON manifests and index.html', async () => {
    expect((await get('/tutorial/manifest.json')).headers.get('cache-control')).toBe('no-cache');
    const idx = await get('/index.html');
    expect(idx.status).toBe(200);
    expect(idx.headers.get('cache-control')).toBe('no-cache');
  });
});

describe('SPA fallback only for navigations', () => {
  it('answers navigations (/, /lobby/<id>, /admin) with index.html, no-cache', async () => {
    for (const [url, accept] of [
      ['/', BROWSER_NAV],
      ['/lobby/AbCd1234', BROWSER_NAV],
      ['/admin', BROWSER_NAV],
      ['/lobby/AbCd1234', '*/*'], // curl / link previews
    ] as const) {
      const r = await get(url, { Accept: accept });
      expect(r.status, url).toBe(200);
      expect(r.headers.get('content-type'), url).toMatch(/text\/html/);
      expect(r.headers.get('cache-control'), url).toBe('no-cache');
      expect(await r.text(), url).toBe(INDEX);
    }
    const head = await get('/lobby/AbCd1234', { Accept: BROWSER_NAV }, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers.get('cache-control')).toBe('no-cache');
  });

  it('returns an uncacheable 404 (never index.html) for missing files', async () => {
    for (const [url, accept] of [
      ['/assets/TownGame-Gone9999.js', '*/*'],
      ['/assets/TownGame-Gone9999.js', BROWSER_NAV],
      ['/assets/cast-Gone9999.png', 'image/avif,image/webp,*/*'],
      ['/assets/no-extension', BROWSER_NAV],
      ['/landing/missing.png', BROWSER_NAV],
      ['/missing.js', '*/*'],
      ['/lobby/AbCd1234', 'application/json'], // not a navigation
    ] as const) {
      const r = await get(url, { Accept: accept });
      expect(r.status, url).toBe(404);
      expect(r.headers.get('cache-control'), url).toBe('no-store');
      expect(r.headers.get('content-type'), url).toMatch(/text\/plain/);
      expect(await r.text(), url).not.toContain('<!doctype html>');
    }
  });

  it('does not serve dotfiles from the dist (deploy bookkeeping)', async () => {
    const r = await get('/.own-assets', { Accept: BROWSER_NAV });
    expect(await r.text()).not.toContain('index-AbC123de.js');
  });

  it('does not answer non-GET requests with the SPA shell', async () => {
    const r = await get('/lobby/AbCd1234', { Accept: BROWSER_NAV, 'Content-Type': 'application/json' }, 'POST');
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain('<!doctype html>');
  });
});

describe('never cached: API, health, internal', () => {
  it('gives /api/*, /healthz and /internal/* no cacheable lifetime and no SPA fallback', async () => {
    const health = await get('/healthz');
    expect(health.status).toBe(200);
    const apiMissing = await get('/api/nope', { Accept: BROWSER_NAV });
    expect(apiMissing.status).toBe(404);
    expect(apiMissing.headers.get('content-type')).toMatch(/json/);
    const me = await get('/api/me');
    expect(me.status).toBe(401);
    expect(me.headers.get('cache-control')).toBe('no-store');
    const internalMissing = await get('/internal/nope', { Accept: BROWSER_NAV });
    expect(internalMissing.status).toBe(404);
    expect(await internalMissing.text()).not.toContain('<!doctype html>');
    for (const r of [health, apiMissing, me, internalMissing]) {
      const cc = r.headers.get('cache-control') ?? '';
      expect(cc).not.toMatch(/max-age=[1-9]|immutable|public/);
    }
  });
});

describe('security headers unchanged on every static response', () => {
  it('sends the same CSP / nosniff / frame headers on assets, public files, the shell and 404s', async () => {
    const responses = await Promise.all([
      get('/assets/index-AbC123de.js'),
      get('/landing/logo.png'),
      get('/', { Accept: BROWSER_NAV }),
      get('/assets/TownGame-Gone9999.js'),
    ]);
    const csp = responses[0]!.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    for (const r of responses) {
      expect(r.headers.get('content-security-policy')).toBe(csp);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-frame-options')).toBe('DENY');
      expect(r.headers.get('referrer-policy')).toBe('same-origin');
      expect(r.headers.get('strict-transport-security')).toBe('max-age=31536000');
    }
  });
});
