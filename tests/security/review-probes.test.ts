// Security review probes (security-review teammate; findings in docs/security-review.md).
//
// Spawns its own production-mode server on 127.0.0.1:3360-3369 (NODE_ENV=production, so error
// pages behave like prod) with a throwaway CLIENT_DIST, and probes:
//   SR-PATH  path traversal against express.static + the SPA fallback
//   SR-ERR   error responses do not leak stack traces / paths in production mode
//   SR-XFF   X-Forwarded-For handling behind cloudflared (trust proxy = loopback)
//   SR-MM    /matchmake/* (Colyseus HTTP matchmaker): CORS, unauthenticated create, body size
//   SR-LOG   unauthenticated requests that each produce server log output
//   SR-SSE   SSE connections per account
//   SR-LOBBY global lobby slots vs. free accounts
//
// `it.fails(...)` marks a KNOWN OPEN ISSUE: the body asserts the secure behaviour, which currently
// does not hold. When the issue is fixed vitest reports "expected to fail" — flip it to `it(...)`.
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../support/http.js';
import { pickPort, startServer, type TestServer } from '../support/server.js';

const SPA_MARKER = 'SPA-INDEX-MARKER-7c1f';
const SECRET_MARKER = 'OUTSIDE-DIST-SECRET-91ab';
const PASSWD_MARKER = 'root:x:0:0';

let server: TestServer;
let root: string;
let dist: string;
let ipSeq = 0;
const ip = () => `198.51.100.${(++ipSeq % 250) + 1}`;

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ct-review-'));
  dist = path.join(root, 'site', 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), `<!doctype html><title>${SPA_MARKER}</title>`);
  writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(path.join(dist, '.env'), `DOTFILE ${SECRET_MARKER}`);
  writeFileSync(path.join(root, 'site', 'secret.txt'), SECRET_MARKER);
  writeFileSync(path.join(root, 'secret.txt'), SECRET_MARKER);
  server = await startServer({
    port: await pickPort(3360, 3369),
    env: { NODE_ENV: 'production', CLIENT_DIST: dist },
  });
}, 60_000);

afterAll(async () => {
  await server?.stop();
  rmSync(root, { recursive: true, force: true });
});

/** Raw request: the path is sent byte-for-byte (fetch/WHATWG URL would normalise `..`/%2e). */
function raw(method: string, rawPath: string, opts: { headers?: Record<string, string>; body?: string | Buffer } = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, method, path: rawPath, headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('timeout')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function rssKb(pid: number, field: 'VmRSS' | 'VmHWM'): number {
  const m = new RegExp(`${field}:\\s+(\\d+) kB`).exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
  return m ? Number(m[1]) : 0;
}

const logLines = () => server.logs().split('\n').filter(Boolean).length;

describe('SR-PATH: static files / SPA fallback', () => {
  const probes = [
    '/..%2fsecret.txt',
    '/..%2f..%2fsecret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/..%5csecret.txt',
    '/..%5c..%5csecret.txt',
    '/..\\..\\secret.txt',
    '/%252e%252e/secret.txt',
    '/..%c0%afsecret.txt',
    '/..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd',
    '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    '//etc/passwd',
    '/api/../secret.txt',
    '/api/..%2f..%2fsecret.txt',
    '/secret.txt%00.js',
    '/assets/app.js%00',
    '/index.html%00.txt',
    '/.env',
    '/assets/../.env',
    '/%2eenv',
  ];
  it('no probe returns a file outside dist, a dotfile, or /etc/passwd', async () => {
    const seen: string[] = [];
    for (const p of probes) {
      const r = await raw('GET', p);
      seen.push(`${p} -> ${r.status}`);
      expect(r.body, p).not.toContain(SECRET_MARKER);
      expect(r.body, p).not.toContain(PASSWD_MARKER);
      expect([200, 400, 403, 404], p).toContain(r.status);
      // 200 is only ever the SPA index (fallback), never another file
      if (r.status === 200 && !p.startsWith('/assets/app.js')) expect(r.body, p).toContain(SPA_MARKER);
    }
    console.info('[SR-PATH]', seen.join(' | '));
  });

  it('legitimate assets and deep links still work', async () => {
    expect((await raw('GET', '/assets/app.js')).body).toBe('console.log(1)');
    expect((await raw('GET', '/lobby/abcdEFGH12')).body).toContain(SPA_MARKER);
  });
});

describe('SR-ERR: production error responses', () => {
  it('malformed URI / JSON / unknown routes do not leak stacks or file paths', async () => {
    const json = { 'Content-Type': 'application/json' };
    const cases: [string, string, { headers?: Record<string, string>; body?: string }?][] = [
      ['GET', '/%E0%A4%A'],
      ['GET', '/assets/%'],
      ['POST', '/nope', { headers: json, body: '{}' }],
      ['POST', '/api/auth/signin', { headers: json, body: '{"passphrase":' }],
      ['POST', '/api/auth/signin', { headers: json, body: 'x'.repeat(40_000) }],
      ['GET', '/api/lobbies/%ZZ'],
      ['POST', '/api/lobbies/%ZZ/ticket', { headers: json, body: '{}' }],
    ];
    const seen: string[] = [];
    for (const [m, p, o] of cases) {
      const r = await raw(m, p, o);
      seen.push(`${m} ${p} -> ${r.status} ${r.body.slice(0, 80).replace(/\s+/g, ' ')}`);
      expect(r.body, p).not.toMatch(/\bat .*\(.*:\d+:\d+\)|node_modules|\/home\/|\.ts:\d+/);
    }
    console.info('[SR-ERR]', seen.join(' | '));
  });

  it.fails('KNOWN ISSUE SR-9: a malformed percent-escape in an API path param is a logged 500, not a 400', async () => {
    const before = logLines();
    const r = await raw('GET', '/api/lobbies/%ZZ');
    await new Promise((res) => setTimeout(res, 100));
    console.info(`[SR-9] status=${r.status} body=${r.body} log=${server.logs().split('\n').filter(Boolean).slice(before).join(' / ').slice(0, 300)}`);
    expect(r.status).toBe(400);
    expect(logLines()).toBe(before);
  });

  it('/healthz exposes only ok/env/version', async () => {
    const r = await raw('GET', '/healthz');
    expect(Object.keys(JSON.parse(r.body)).sort()).toEqual(['env', 'ok', 'version']);
  });

  it('security headers present on SPA and API responses', async () => {
    for (const p of ['/', '/api/me']) {
      const h = (await raw('GET', p)).headers;
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['x-frame-options']).toBe('DENY');
      expect(h['x-powered-by']).toBeUndefined();
    }
  });

  it('FIXED SR-7: the SPA carries a strict Content-Security-Policy', async () => {
    expect((await raw('GET', '/')).headers['content-security-policy']).toBeTruthy();
  });
});

describe('SR-XFF: client IP behind cloudflared (trust proxy = loopback)', () => {
  // cloudflared connects from 127.0.0.1; Cloudflare's edge APPENDS the real client IP to any
  // client-supplied X-Forwarded-For, so the rightmost entry is the true client.
  it('spoofed left-hand XFF entries do not evade the per-IP sign-in limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const c = new ApiClient(server.url, { 'X-Forwarded-For': `10.0.${i}.${i + 1}, 203.0.113.77` });
      statuses.push((await c.signIn(`wrong passphrase attempt ${i} xx`)).status);
    }
    expect(statuses).toContain(429);
  });

  it.fails('KNOWN ISSUE SR-3: IPv6 clients can rotate addresses inside their /64 to evade per-IP limits', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const c = new ApiClient(server.url, { 'X-Forwarded-For': `2001:db8:abcd:12::${(i + 1).toString(16)}` });
      statuses.push((await c.signIn(`wrong passphrase attempt v6 ${i} xx`)).status);
    }
    expect(statuses).toContain(429); // secure behaviour: bucket by /64
  });
});

describe('SR-MM: Colyseus HTTP matchmaker', () => {
  it('only joinById/reconnect with a valid ticket can produce a seat (create/joinOrCreate fail)', async () => {
    for (const m of ['create', 'joinOrCreate', 'join']) {
      const r = await raw('POST', `/matchmake/${m}/game`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lobbyId: 'evil-lobby-1' }) });
      const body = JSON.parse(r.body) as { error?: string; room?: unknown; sessionId?: unknown };
      expect(body.error, m).toBeTruthy();
      expect(body.sessionId, m).toBeUndefined();
    }
    expect((await raw('GET', '/matchmake/game')).status).toBe(404); // no public room listing
  });

  it('FIXED SR-5: matchmaker CORS is pinned to the public origin without credentials', async () => {
    const r = await raw('OPTIONS', '/matchmake/joinById/x', { headers: { Origin: 'https://evil.example' } });
    expect(r.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it(
    'FIXED SR-1: oversized unauthenticated matchmake bodies are refused before buffering',
    async () => {
      const before = rssKb(server.pid, 'VmHWM');
      const size = 96 * 1024 * 1024;
      const chunk = Buffer.alloc(1024 * 1024, 0x61);
      const status = await new Promise<number>((resolve) => {
        const req = http.request(
          { host: '127.0.0.1', port: server.port, method: 'POST', path: '/matchmake/joinById/xxxxxxxx', headers: { 'Content-Type': 'application/json', 'Content-Length': String(size + 2) } },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
          },
        );
        req.on('error', () => resolve(-1)); // a server that cuts us off early is the secure outcome
        req.write('"');
        let sent = 0;
        const pump = () => {
          while (sent < size) {
            sent += chunk.length;
            if (!req.write(chunk)) return void req.once('drain', pump);
          }
          req.end('"');
        };
        pump();
      });
      const after = rssKb(server.pid, 'VmHWM');
      console.info(`[SR-1] 96 MiB matchmake body: status=${status}, peak RSS ${Math.round(before / 1024)} -> ${Math.round(after / 1024)} MiB`);
      // secure behaviour: rejected early (413 / reset) and peak RSS grows by far less than the body
      expect(after - before).toBeLessThan(32 * 1024);
    },
    60_000,
  );

  it('the same body against the JSON API is capped by express.json (32 kB)', async () => {
    const r = await raw('POST', '/api/auth/signin', { headers: { 'Content-Type': 'application/json' }, body: `{"passphrase":"${'a'.repeat(200_000)}"}` });
    expect(r.status).toBe(413);
  });
});

describe('SR-LOG: unauthenticated log amplification', () => {
  it('FIXED SR-4: anonymous matchmake/WS probes are refused without stack-trace log spam', async () => {
    const before = logLines();
    for (let i = 0; i < 20; i++) {
      await raw('POST', '/matchmake/create/game', { headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await raw('POST', '/matchmake/joinOrCreate/game', { headers: { 'Content-Type': 'application/json' }, body: '{"ticket":"aaaaaaaaaaaa"}' });
    }
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket(`${server.wsUrl}/abcdefghi/room${i}?sessionId=nope`);
          const done = () => resolve();
          ws.onclose = done;
          ws.onerror = done;
          setTimeout(done, 3000);
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 300));
    const added = logLines() - before;
    console.info(`[SR-4] 60 anonymous requests added ${added} server log lines`);
    expect(added).toBeLessThan(10); // secure behaviour: anonymous junk is not logged per request
  });
});

describe('SR-SSE: lobby stream connections', () => {
  it.fails('KNOWN ISSUE SR-6: one account can hold an unbounded number of SSE streams', async () => {
    const c = new ApiClient(server.url, { 'X-Forwarded-For': ip() });
    expect((await c.createAccount('SSE Probe')).status).toBe(201);
    const ctrls: AbortController[] = [];
    const statuses: number[] = [];
    try {
      for (let i = 0; i < 40; i++) {
        const ctrl = new AbortController();
        ctrls.push(ctrl);
        const res = await fetch(`${server.url}/api/lobbies/stream`, { headers: { Cookie: c.cookieHeader() }, signal: ctrl.signal });
        statuses.push(res.status);
      }
    } finally {
      for (const c2 of ctrls) c2.abort();
    }
    console.info(`[SR-6] 40 concurrent SSE streams for one account -> ${statuses.filter((s) => s === 200).length} accepted`);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(10); // secure: small per-account cap
  });
});

describe('SR-LOBBY: global lobby slots', () => {
  // The test server runs with LOBBY_MAX_COUNT=8 (prod: 4) and PER_ACCOUNT_LOBBY_LIMIT=2, so
  // LOBBY_MAX_COUNT/2 free accounts occupy every slot; nobody else can host until they idle out
  // (LOBBY_IDLE_TIMEOUT_SEC, 600 s in prod) — and the squatter simply re-creates them.
  it.fails('KNOWN ISSUE SR-2: a handful of free accounts can occupy every lobby slot', async () => {
    const statuses: number[] = [];
    for (let a = 0; a < 5; a++) {
      const c = new ApiClient(server.url, { 'X-Forwarded-For': ip() });
      expect((await c.createAccount(`Squatter ${a}`)).status).toBe(201);
      for (let l = 0; l < 2; l++) statuses.push((await c.createLobby({ name: `Squat ${a}-${l}`, maxPlayers: 5 })).status);
    }
    const victim = new ApiClient(server.url, { 'X-Forwarded-For': ip() });
    await victim.createAccount('Friend');
    const r = await victim.createLobby({ name: 'Game night', maxPlayers: 10 });
    console.info(`[SR-2] squatter lobby creates: ${statuses.join(',')} ; victim -> ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.status).toBe(201); // secure behaviour: legitimate hosts are not locked out
  });
});
