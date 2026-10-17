// Security v2.3, area 5 (web client + content) — docs/security-v2.3/05-web-client.md (WEB-*).
// Server-side checks against a throwaway CLIENT_DIST (production mode), static scans of the client
// source and, when apps/client/dist exists, of the built bundle, plus unit tests of the v2.2 chat
// speech-bubble text path. No browser (see web-render.test.ts). Server: 127.0.0.1:3386 (web-render uses 3387).
//
// `it.fails(...)` = a KNOWN OPEN finding: the body asserts the secure behaviour. Flip to `it(...)`
// when the fix lands. Phase B (v2.3): WEB-1/3/4/6/7 fixed and flipped; WEB-5 belongs to sec-host.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanText, cleanMultiline, DisplayName, LobbyName, nameSkeleton, StCommand } from '../../packages/protocol/src/index.js';
import { contentSecurityPolicy, livekitOrigins } from '../../apps/server/src/securityHeaders.js';
import { isReservedName } from '../../apps/server/src/auth/http.js';
import { displayLabels } from '../../apps/server/src/rooms/memberUtil.js';
import { bubbleScope, bubbleText, SpeechBook, wrapLines } from '../../apps/client/src/game/social/speech.js';
import { pickPort, REPO_ROOT, startServer, type TestServer } from '../support/server.js';

const SPA_MARKER = 'WEB-SPA-INDEX-5d2e';
let server: TestServer;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ct-web-'));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  mkdirSync(path.join(dist, 'art'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), `<!doctype html><title>${SPA_MARKER}</title>`);
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(dist, 'art', 'manifest.json'), '{}');
  writeFileSync(path.join(dist, 'favicon.png'), 'png');
  writeFileSync(path.join(dist, 'og-image.jpg'), 'jpg');
  server = await startServer({ port: await pickPort(3386, 3386), env: { NODE_ENV: 'production', CLIENT_DIST: dist, LIVEKIT_URL: 'wss://web-fake.livekit.invalid' } });
}, 60_000);

afterAll(async () => {
  await server?.stop();
  rmSync(root, { recursive: true, force: true });
});

function get(p: string, headers: Record<string, string> = { accept: 'text/html' }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, method: 'GET', path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

const RESPONSE_CLASSES = ['/', '/lobby/brave-owl-lamp', '/admin', '/assets/index-abc123.js', '/favicon.png', '/api/me', '/healthz', '/assets/missing-1.js', '/nope.js'];

describe('WEB-HDR: security headers on every response class', () => {
  it('CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS-ready on all responses', async () => {
    for (const p of RESPONSE_CLASSES) {
      const h = (await get(p)).headers;
      const csp = String(h['content-security-policy'] ?? '');
      expect(csp, p).toContain("frame-ancestors 'none'");
      expect(csp, p).toContain("object-src 'none'");
      expect(csp, p).toContain("base-uri 'none'");
      expect(csp, p).toMatch(/script-src 'self'(;|$)/); // no unsafe-inline / unsafe-eval / hosts
      expect(csp, p).not.toContain('unsafe-inline');
      expect(csp, p).not.toContain('unsafe-eval');
      expect(csp, p).toContain("require-trusted-types-for 'script'; trusted-types 'none'"); // WEB-2
      expect(h['x-frame-options'], p).toBe('DENY');
      expect(h['x-content-type-options'], p).toBe('nosniff');
      expect(h['referrer-policy'], p).toBe('same-origin');
      expect(String(h['permissions-policy']), p).toMatch(/camera=\(\)/);
      expect(String(h['permissions-policy']), p).toMatch(/microphone=\(self\)/);
      expect(h['x-powered-by'], p).toBeUndefined();
    }
  });

  it('WEB-3: Cross-Origin-Opener-Policy same-origin and CORP same-origin are sent', async () => {
    for (const p of ['/', '/lobby/brave-owl-lamp', '/assets/index-abc123.js', '/api/me', '/art/manifest.json', '/nope.js']) {
      const h = (await get(p)).headers;
      expect(h['cross-origin-opener-policy'], p).toBe('same-origin');
      expect(h['cross-origin-resource-policy'], p).toBe('same-origin');
      expect(h['cross-origin-embedder-policy'], p).toBeUndefined(); // would break LiveKit / fonts
    }
  });

  it('WEB-3: link-preview images stay embeddable cross-origin (og:image, favicon, emblems)', async () => {
    for (const p of ['/og-image.jpg', '/favicon.png']) {
      const r = await get(p, {});
      expect(r.status, p).toBe(200);
      expect(r.headers['cross-origin-resource-policy'], p).toBe('cross-origin');
    }
    // the exemption is exact: no prefix / traversal tricks
    for (const p of ['/og-image.jpg.map', '/og-image.jpgx', '/assets/og-image.jpg', '/api/og-image.jpg']) expect((await get(p, {})).headers['cross-origin-resource-policy'], p).toBe('same-origin');
  });

  it('WEB-3: Permissions-Policy also denies the remaining powerful features', async () => {
    const pp = String((await get('/')).headers['permissions-policy']);
    for (const f of ['usb', 'serial', 'hid', 'bluetooth', 'display-capture', 'publickey-credentials-get', 'browsing-topics']) expect(pp).toContain(`${f}=()`);
  });

  it('WEB-4: connect-src is pinned to the configured LiveKit host, not every *.livekit.cloud project', async () => {
    const csp = String((await get('/')).headers['content-security-policy']);
    expect(csp).not.toContain('*');
    expect(csp).toContain("connect-src 'self' wss://web-fake.livekit.invalid https://web-fake.livekit.invalid;");
  });

  it('WEB-4: LiveKit origins are derived safely from LIVEKIT_URL', () => {
    // LiveKit Cloud: exact project host + the regional fail-over zone (never all of *.livekit.cloud)
    const REGIONAL = ['wss://*.production.livekit.cloud', 'https://*.production.livekit.cloud'];
    expect(livekitOrigins('wss://proj-abc.livekit.cloud')).toEqual(['wss://proj-abc.livekit.cloud', 'https://proj-abc.livekit.cloud', ...REGIONAL]);
    expect(livekitOrigins('https://proj.livekit.cloud/some/path?x=1')).toEqual(['wss://proj.livekit.cloud', 'https://proj.livekit.cloud', ...REGIONAL]);
    const cloudCsp = contentSecurityPolicy({ publicOrigin: 'https://x', livekitUrl: 'wss://proj.livekit.cloud' });
    expect(cloudCsp).not.toMatch(/\*\.livekit\.cloud/);
    expect(cloudCsp).toContain("connect-src 'self' wss://proj.livekit.cloud https://proj.livekit.cloud wss://*.production.livekit.cloud https://*.production.livekit.cloud;");
    // non-cloud and insecure URLs: exact host only (no regional zone)
    expect(livekitOrigins('wss://lk.example.org')).toEqual(['wss://lk.example.org', 'https://lk.example.org']);
    expect(livekitOrigins('ws://evil.livekit.cloud.example.org')).toEqual(['ws://evil.livekit.cloud.example.org', 'http://evil.livekit.cloud.example.org']);
    expect(livekitOrigins('ws://127.0.0.1:7880')).toEqual(['ws://127.0.0.1:7880', 'http://127.0.0.1:7880']);
    for (const bad of ['', 'not a url', 'javascript:alert(1)', 'ftp://x.example', "wss://a.example;script-src 'unsafe-inline'"]) expect(livekitOrigins(bad), bad).toEqual([]);
    expect(contentSecurityPolicy({ publicOrigin: 'http://localhost:3002', livekitUrl: '' })).toContain("connect-src 'self';");
    expect(contentSecurityPolicy({ publicOrigin: 'x', livekitUrl: '', trustedTypes: true })).toContain("require-trusted-types-for 'script'");
  });

  it('local http origins (Docker preview / dev) get no HSTS and no upgrade-insecure-requests', async () => {
    const h = (await get('/')).headers; // test server: APP_PUBLIC_ORIGIN is http://127.0.0.1:<port>
    expect(h['strict-transport-security']).toBeUndefined();
    expect(String(h['content-security-policy'])).not.toContain('upgrade-insecure-requests');
  });

  it('WEB-5 / HOST-07: public /healthz does not reveal the deployed git commit', async () => {
    const body = JSON.parse((await get('/healthz')).body) as Record<string, unknown>;
    expect(body.version).toBeUndefined();
  });
});

describe('WEB-CACHE: cache policy and SPA fallback', () => {
  it('index/deep links revalidate, hashed assets are immutable, API is no-store', async () => {
    expect((await get('/')).headers['cache-control']).toBe('no-cache');
    const deep = await get('/lobby/brave-owl-lamp');
    expect(deep.body).toContain(SPA_MARKER);
    expect(deep.headers['cache-control']).toBe('no-cache');
    expect((await get('/assets/index-abc123.js')).headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await get('/art/manifest.json')).headers['cache-control']).toBe('no-cache');
    expect((await get('/api/me', {})).headers['cache-control']).toBe('no-store');
  });

  it('a missing script/source map is a real uncacheable 404, never the HTML shell', async () => {
    for (const p of ['/assets/missing-1.js', '/assets/index-abc123.js.map', '/nope.js', '/assets/x']) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
      expect(r.body, p).not.toContain(SPA_MARKER);
      expect(r.headers['cache-control'], p).toBe('no-store');
    }
  });

  it('the SPA shell never reflects the path or query (no server-side templating)', async () => {
    const r = await get('/lobby/%3Cimg%20src%3Dx%3E?next=javascript:alert(1)&q=%3Cscript%3E');
    expect(r.body).not.toMatch(/<img src=x|javascript:|<script>/);
    const r2 = await get('/%3Csvg%20onload%3Dalert(1)%3E');
    expect(r2.body).not.toContain('onload');
  });
});

// ------------------------------------------------------------------------------------------------
// Static scans of the client source (regression guard for the "no HTML sinks" property).

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const CLIENT_SRC = path.join(REPO_ROOT, 'apps/client/src');

describe('WEB-SRC: client source has no HTML/code-eval sinks', () => {
  it('no innerHTML / dangerouslySetInnerHTML / insertAdjacentHTML / document.write / eval / Function / Phaser DOM', () => {
    const SINK = /\.innerHTML\s*=|\.outerHTML\s*=|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(|setTimeout\(\s*['"`]|setInterval\(\s*['"`]|\.add\.dom\(|createFromHTML|srcdoc|createContextualFragment|DOMParser/;
    const hits: string[] = [];
    for (const f of walk(CLIENT_SRC)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (SINK.test(line)) hits.push(`${path.relative(REPO_ROOT, f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('no message listeners, window.open, or javascript:-capable dynamic hrefs from data', () => {
    const hits: string[] = [];
    for (const f of walk(CLIENT_SRC)) {
      const src = readFileSync(f, 'utf8');
      if (/addEventListener\(\s*['"]message['"]|onmessage\s*=\s*\(?\s*\w*\s*\)?\s*=>[^\n]*postMessage|window\.open\(/.test(src)) hits.push(path.relative(REPO_ROOT, f));
    }
    expect(hits).toEqual([]);
  });

  it('client code reads only DEV/BASE_URL from import.meta.env (no baked-in env)', () => {
    const keys = new Set<string>();
    for (const f of walk(CLIENT_SRC)) for (const m of readFileSync(f, 'utf8').matchAll(/import\.meta\.env\??\.(\w+)/g)) keys.add(m[1]!);
    expect([...keys].filter((k) => k !== 'DEV' && k !== 'BASE_URL')).toEqual([]);
  });
});

const DIST = path.join(REPO_ROOT, 'apps/client/dist');
describe.skipIf(!existsSync(path.join(DIST, 'index.html')))('WEB-BUNDLE: built client contents', () => {
  const files = () => {
    const out: string[] = [];
    const rec = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = path.join(d, e);
        if (statSync(p).isDirectory()) rec(p);
        else out.push(p);
      }
    };
    rec(DIST);
    return out;
  };

  it('no source maps, no server secrets / server-only code, no hardcoded hosts', () => {
    const all = files();
    expect(all.filter((f) => f.endsWith('.map'))).toEqual([]);
    const BAD = [
      'sourceMappingURL=',
      'LIVEKIT_API_SECRET',
      'SESSION_SECRET',
      'PASSPHRASE_PEPPER',
      'livekit-server-sdk',
      'better-sqlite3',
      'createHmac',
      '/srv/clocktower',
      // host name and home directory of the build machine, taken at runtime (no real path in the repo)
      /^(localhost|ubuntu|debian)$/i.test(os.hostname()) || os.hostname().length < 5 ? '' : os.hostname(),
      os.homedir(),
      // (colyseus.js carries a 'ws://127.0.0.1:2567' default it never uses: the client passes window.location)
      '127.0.0.1:300',
      'localhost:300',
    ];
    const hits: string[] = [];
    for (const f of all.filter((x) => /\.(js|html|css|json)$/.test(x))) {
      const s = readFileSync(f, 'utf8');
      for (const b of BAD) if (b && s.includes(b)) hits.push(`${path.relative(DIST, f)}: ${b}`);
      for (const re of [/\/home\/[a-z][\w.-]*\//, /\/Users\/[a-z][\w.-]*\//, /\/root\//]) if (re.test(s)) hits.push(`${path.relative(DIST, f)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it('dev-only hooks (__town, __voiceClient, __ctForceTimeout) are stripped from the prod build', () => {
    const js = files()
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(js).not.toContain('__voiceClient');
    expect(js).not.toContain('__town');
    expect(js).not.toContain('__ctForceTimeout');
  });

  it('the shipped HTML shell has no inline script/style or event-handler attributes', () => {
    const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});

// ------------------------------------------------------------------------------------------------
// v2.2 in-town speech bubbles: Phaser canvas text (no HTML), but the text path must still neutralise
// control/bidi/zero-width characters and keep private scopes out.

describe('WEB-BUBBLE: chat speech-bubble text path', () => {
  const HOSTILE = '<img src=x onerror=alert(1)>\u202eevil\u202c\u200b\u0000\u001b[31m';

  it('markup is kept as literal text; controls, bidi overrides and zero-width chars are stripped', () => {
    const t = bubbleText(HOSTILE);
    expect(t).toContain('<img src=x onerror=alert(1)>'); // literal: canvas fillText, never parsed
    expect(t).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/);
  });

  it('length and line count are capped (no bubble flooding the screen)', () => {
    const t = bubbleText('x'.repeat(10_000));
    expect(Array.from(t).length).toBeLessThanOrEqual(80);
    expect(wrapLines('word '.repeat(500)).length).toBeLessThanOrEqual(4);
    expect(wrapLines('y'.repeat(500)).every((l) => Array.from(l).length <= 29)).toBe(true);
  });

  it('storyteller/system (private or narrator) messages never become bubbles', () => {
    for (const scope of ['storyteller', 'system'] as const) expect(bubbleScope({ scope, fromPid: 'p1' })).toBe(false);
    expect(bubbleScope({ scope: 'zone', fromPid: '' })).toBe(false);
    const book = new SpeechBook();
    expect(book.add({ id: 'm1', fromPid: 'p1', text: 'psst', scope: 'storyteller' }, 0, () => true)).toBeNull();
    expect(book.add({ id: 'm2', fromPid: 'p2', text: 'hi', scope: 'zone' }, 0, () => false)).toBeNull(); // avatar not rendered
    expect(book.list).toEqual([]);
  });

  it('WEB-6: stacked combining marks (Zalgo) are capped in user text', () => {
    const zalgo = 'a' + '\u0301'.repeat(20);
    // either the server cleaner or the bubble cleaner must cap combining marks per base character
    expect(Array.from(cleanText(zalgo)).length).toBeLessThanOrEqual(4);
  });
});

// ------------------------------------------------------------------------------------------------
// WEB-7: in-lobby name impersonation (social-deduction integrity: "who said / who claimed what").

describe('WEB-NAME: display-name impersonation inside a lobby', () => {
  const labels = (names: string[]) => [...displayLabels(names.map((displayName, i) => ({ pid: `p${i}`, displayName, joinedAt: i }))).values()];

  it('exact duplicates (case/width-insensitive) are disambiguated', () => {
    expect(new Set(labels(['Ann', 'ann'])).size).toBe(2);
    expect(new Set(labels(['Ann', 'Ａｎｎ'])).size).toBe(2);
  });

  it('WEB-7: a Cyrillic look-alike gets the same disambiguation as an exact duplicate', () => {
    // 'Аnn' starts with U+0410 CYRILLIC CAPITAL A: renders identically to 'Ann' but is not suffixed
    expect(labels(['Ann', '\u0410nn'])[1]).toMatch(/\(\d+\)$/);
  });

  it('WEB-7: a name cannot forge the "(2)" disambiguation suffix', () => {
    // two "Ann"s get "Ann" and "Ann (2)"; a third player calling themselves "Ann (2)" must not collide
    const l = labels(['Ann', 'Ann', 'Ann (2)']);
    expect(new Set(l).size).toBe(3);
  });

  it('WEB-7: invisible-letter names (Hangul filler, Braille blank) are rejected', () => {
    for (const blank of ['\u3164', '\u2800', '\u115f\u1160']) expect(DisplayName.safeParse(blank).success, JSON.stringify(blank)).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------
// WEB-1: Storyteller free text reaches every player's toasts/log/prompt cards uncleaned.

describe('WEB-STTEXT: Storyteller free text', () => {
  it('WEB-1: announce / kill cause are cleaned of bidi, zero-width and control characters', () => {
    const BAD = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
    const a = StCommand.parse({ type: 'announce', text: 'Night 2 falls.\u202e\u200b\u0007 exe.txt' }) as { text: string };
    expect(a.text).not.toMatch(BAD);
    const k = StCommand.parse({ type: 'kill', seat: 0, cause: '\u202eesoon', announce: true }) as { cause?: string };
    expect(k.cause ?? '').not.toMatch(BAD);
  });
});

describe('WEB-TEXT: regression cases for the v2.3 text fixes', () => {
  it('ordinary names, accents and scripts are kept', () => {
    for (const n of ['Ann', 'José', 'Zoë', 'Nguyễn', 'Олег', 'Αλέξης', '李雷', 'हिन्दी', 'שָׁלוֹם']) expect(cleanText(n), n).toBe(n.normalize('NFC'));
    expect(cleanText('  two   words ')).toBe('two words');
  });

  it('look-alike skeletons collide only for look-alikes', () => {
    expect(nameSkeleton('Ann')).toBe(nameSkeleton('\u0410nn'));
    expect(nameSkeleton('Bill')).toBe(nameSkeleton('BiII'));
    expect(nameSkeleton('Ann (2)')).toBe(nameSkeleton('Ann'));
    expect(nameSkeleton('Ann')).not.toBe(nameSkeleton('Anne'));
    expect(nameSkeleton('Mia')).not.toBe(nameSkeleton('Max'));
    const l = [...displayLabels([{ pid: 'a', displayName: 'Ann', joinedAt: 1 }, { pid: 'b', displayName: 'Bob', joinedAt: 2 }]).values()];
    expect(l).toEqual(['Ann', 'Bob']);
  });

  it('reserved names cannot be spelled with look-alikes', () => {
    for (const n of ['Storyteller', '\u0405toryteller', 'NARRAT0R', 'System (2)', 'the  storyteller', 'Αdmin']) expect(isReservedName(n), n).toBe(true);
    for (const n of ['Story', 'Teller', 'Adam', 'Sid']) expect(isReservedName(n), n).toBe(false);
  });

  it('invisible-only lobby names are rejected; real ones pass', () => {
    expect(LobbyName.safeParse('\u3164\u3164\u3164').success).toBe(false);
    expect(LobbyName.safeParse('Owl Lamp').success).toBe(true);
  });

  it('Storyteller multi-line text keeps line breaks but nothing else invisible', () => {
    expect(cleanMultiline('Line one\r\n\r\n\r\n\r\nLine\u202e two\u2028three  ')).toBe('Line one\n\nLine two\nthree');
    const p = StCommand.parse({ type: 'announce', text: '  Dawn breaks.\nNobody died.\u200b ' }) as { text: string };
    expect(p.text).toBe('Dawn breaks.\nNobody died.');
    expect(StCommand.safeParse({ type: 'announce', text: '\u200b\u3164' }).success).toBe(false); // empty after cleaning
    expect((StCommand.parse({ type: 'add_reminder', seat: 1, token: 'poisoned' }) as { token: string }).token).toBe('poisoned');
  });
});
