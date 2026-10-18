// (v3 URL paths, user decision 2026-10-18; docs/v3/INTEGRATION.md §11, §8 WP8) `/` = the v3 app, `/v2/` = the v2
// app: ONE client build and ONE server. The /v2 navigations get the same SPA shell (same index.html, CSP, security
// headers, caching) as `/`; static files stay at their absolute /assets, /landing … URLs (a /v2/assets/* request is a
// real 404, never HTML); every API / SSE / health route and the /v3-art-demo/ static demo are unchanged; lobbies of
// both worlds come from the same API. Runs the real app.ts stack against a fixture dist on 127.0.0.1:3452 (v3-lead
// range, docs/v3 §8).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAppServer, type RunningServer } from '../src/app.js';
import { captureLogger, fakeModules, testConfig } from '../src/rooms/testkit.js';

const PORT = 3452;
const BASE = `http://127.0.0.1:${PORT}`;
const INDEX = '<!doctype html><title>Clocktower Town</title><meta property="og:image" content="%PUBLIC_ORIGIN%/og-image.jpg" /><div id="app"></div>';
const BROWSER_NAV = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

let srv: RunningServer;

function writeTree(): { dist: string; demos: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'ct-paths-'));
  const put = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  };
  put('dist/index.html', INDEX);
  put('dist/assets/index-AbC123de.js', 'export const entry = 1;');
  put('dist/landing/logo.png', 'png');
  put('demos/v3-art-demo/index.html', '<!doctype html><title>demo</title>');
  return { dist: path.join(root, 'dist'), demos: path.join(root, 'demos') };
}

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') => fetch(BASE + url, { method, headers, redirect: 'manual' });

beforeAll(async () => {
  const { dist, demos } = writeTree();
  srv = await startAppServer(testConfig(PORT, { DEMOS_DIR: demos }), captureLogger(), {
    clientDist: dist,
    scryptN: 1 << 12,
    moduleFactories: fakeModules().factories,
  });
});
afterAll(async () => {
  await srv?.close();
});

describe('the v2 app at /v2', () => {
  it('serves the same SPA shell, headers and caching for /v2 navigations as for /', async () => {
    const root = await get('/', { Accept: BROWSER_NAV });
    expect(root.status).toBe(200);
    const shell = await root.text();
    const same = ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'cross-origin-opener-policy', 'permissions-policy'];
    for (const url of ['/v2', '/v2/', '/v2/lobby/AbCd1234', '/v2/lobby/AbCd1234/', '/v2/admin', '/lobby/AbCd1234']) {
      const r = await get(url, { Accept: BROWSER_NAV });
      expect(r.status, url).toBe(200);
      expect(await r.text(), url).toBe(shell);
      for (const h of same) expect(r.headers.get(h), `${url} ${h}`).toBe(root.headers.get(h));
    }
    expect(shell).not.toContain('%PUBLIC_ORIGIN%');
    expect(root.headers.get('cache-control')).toBe('no-cache');
    expect(root.headers.get('content-security-policy')).toContain("script-src 'self'");
    const head = await get('/v2/lobby/AbCd1234', { Accept: BROWSER_NAV }, 'HEAD');
    expect(head.status).toBe(200);
  });

  it('keeps static files at their absolute URLs: /v2/assets/* and /v2/<file> are uncacheable 404s, never HTML', async () => {
    expect((await get('/assets/index-AbC123de.js')).status).toBe(200);
    for (const url of ['/v2/assets/index-AbC123de.js', '/v2/landing/logo.png', '/v2/missing.js']) {
      const r = await get(url, { Accept: BROWSER_NAV });
      expect(r.status, url).toBe(404);
      expect(r.headers.get('cache-control'), url).toBe('no-store');
      expect(await r.text(), url).not.toContain('<!doctype html>');
    }
    // a non-GET to a /v2 path is not answered with the shell
    const post = await get('/v2/lobby/AbCd1234', { Accept: BROWSER_NAV, 'Content-Type': 'application/json' }, 'POST');
    expect(post.status).toBe(404);
  });
});

describe('unchanged routes', () => {
  it('API, health and the lobby stream are not SPA routes; /v2/api/* is not an API', async () => {
    expect((await get('/healthz')).status).toBe(200);
    const me = await get('/api/me');
    expect(me.status).toBe(401);
    expect(me.headers.get('content-type')).toMatch(/json/);
    const missing = await get('/api/nope', { Accept: BROWSER_NAV });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toMatch(/json/);
    // the v2 app calls the same absolute /api: a prefixed API path is only a (navigation) shell or a 404, never data
    const v2api = await get('/v2/api/lobbies', { Accept: 'application/json' });
    expect(v2api.status).toBe(404);
    expect(v2api.headers.get('content-type')).not.toMatch(/json/);
  });

  it('serves /v3-art-demo/ from DEMOS_DIR with its own CSP, not the SPA shell', async () => {
    const r = await get('/v3-art-demo/', { Accept: BROWSER_NAV });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>demo</title>');
    expect(r.headers.get('content-security-policy')).toContain("style-src 'self' 'unsafe-inline'");
    expect(r.headers.get('cache-control')).toBe('no-cache');
  });

  it('one server for both apps: a v3 lobby is created and listed (with its world) by the same API the v2 app uses; the client filters per path', async () => {
    const acct = await fetch(`${BASE}/api/auth/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Paths' }) });
    expect(acct.status).toBeLessThan(300);
    const cookie = acct.headers.get('set-cookie')!.split(';')[0]!;
    const make = async (body: Record<string, unknown>) => {
      const r = await fetch(`${BASE}/api/lobbies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ maxPlayers: 5, ...body }) });
      expect(r.status, await r.clone().text()).toBeLessThan(300);
      return ((await r.json()) as { lobby: { id: string; world?: string } }).lobby;
    };
    const v3 = await make({ name: 'Hollow Lane', world: 'v3' });
    expect(v3.world).toBe('v3');
    const list = (await (await fetch(`${BASE}/api/lobbies`, { headers: { Cookie: cookie } })).json()) as { lobbies: { id: string; world?: string }[] };
    expect(list.lobbies.find((l) => l.id === v3.id)?.world).toBe('v3');
    const one = (await (await fetch(`${BASE}/api/lobbies/${v3.id}`, { headers: { Cookie: cookie } })).json()) as { lobby: { world?: string } };
    expect(one.lobby.world).toBe('v3'); // the join preview reads the world from here to pick the path
  });
});
