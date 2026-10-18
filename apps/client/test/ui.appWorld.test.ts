// (v3 URL paths, user decision 2026-10-18; docs/v3/INTEGRATION.md §11, §8 WP8) `/` = the v3 app, `/v2/` = the v2
// app: the path → world module (ui/common/appWorld.ts), the router keeping the prefix (ui/common/route.ts), the
// per-world lobby list (finder.ts lobbiesOfWorld), share links and the in-place move of a lobby opened under the
// other world's path. Node, no DOM: `location` / `history` are small stubs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LobbySummary } from '@ct/protocol';
import { appPath, appWorld, moveToWorld, pathInWorld, stripWorldPrefix, syncWorldPath, worldOfPath } from '../src/ui/common/appWorld';
import { navigate, parseRoute } from '../src/ui/common/route';
import { goTo, lobbiesOfWorld, shareUrl } from '../src/ui/lobby/finder';

type Loc = { pathname: string; search: string; hash: string; origin: string };
const g = globalThis as unknown as { location?: Loc; history?: unknown; window?: unknown; CustomEvent?: unknown };
let saved: { location?: unknown; history?: unknown; window?: unknown; CustomEvent?: unknown };
let pushes: { how: 'push' | 'replace'; url: string; state: unknown }[];
let events: unknown[];

function at(url: string) {
  const u = new URL(url, 'https://town.example.test');
  g.location = { pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin };
}
const apply = (how: 'push' | 'replace') => (state: unknown, _t: string, url: string) => {
  pushes.push({ how, url, state });
  at(url);
};

beforeEach(() => {
  saved = { location: g.location, history: g.history, window: g.window, CustomEvent: g.CustomEvent };
  pushes = [];
  events = [];
  g.history = { state: { name: 'lobby' }, pushState: apply('push'), replaceState: apply('replace') };
  g.window = { dispatchEvent: (e: unknown) => (events.push(e), true) };
  g.CustomEvent = class {
    constructor(
      public type: string,
      public init: { detail: unknown },
    ) {}
  };
  at('/');
});
afterEach(() => {
  Object.assign(g, saved);
});

describe('path → world', () => {
  it('/v2 and /v2/… are the v2 app, everything else (the default link) is v3', () => {
    for (const p of ['/v2', '/v2/', '/v2/lobby/AbCd1234', '/v2/admin']) expect(worldOfPath(p), p).toBe('v2');
    for (const p of ['/', '', '/lobby/AbCd1234', '/admin', '/v2x', '/v20/', '/V2/', '/lobby/v2', '/v3-art-demo/']) expect(worldOfPath(p), p).toBe('v3');
  });

  it('strips and adds the prefix symmetrically', () => {
    expect(stripWorldPrefix('/v2')).toBe('/');
    expect(stripWorldPrefix('/v2/')).toBe('/');
    expect(stripWorldPrefix('/v2/lobby/AbCd1234')).toBe('/lobby/AbCd1234');
    expect(stripWorldPrefix('/lobby/AbCd1234')).toBe('/lobby/AbCd1234');
    expect(stripWorldPrefix('/v2x/lobby')).toBe('/v2x/lobby');
    expect(pathInWorld('v2', '/')).toBe('/v2/');
    expect(pathInWorld('v2', '/lobby/x1y2')).toBe('/v2/lobby/x1y2');
    expect(pathInWorld('v2', 'admin#lobbies')).toBe('/v2/admin#lobbies');
    expect(pathInWorld('v3', '/lobby/x1y2')).toBe('/lobby/x1y2');
    for (const p of ['/', '/lobby/x1y2', '/admin'])
      for (const w of ['v2', 'v3'] as const) {
        expect(stripWorldPrefix(pathInWorld(w, p))).toBe(p);
        expect(worldOfPath(pathInWorld(w, p))).toBe(w);
      }
    expect(moveToWorld('/lobby/x1y2', 'v2')).toBe('/v2/lobby/x1y2');
    expect(moveToWorld('/v2/lobby/x1y2', 'v3')).toBe('/lobby/x1y2');
    expect(moveToWorld('/v2/lobby/x1y2', 'v2')).toBe('/v2/lobby/x1y2');
  });

  it('reads the page world from the address bar', () => {
    at('/v2/lobby/AbCd1234');
    expect(appWorld()).toBe('v2');
    expect(appPath('/')).toBe('/v2/');
    at('/');
    expect(appWorld()).toBe('v3');
    expect(appPath('/admin')).toBe('/admin');
  });
});

describe('router keeps the app prefix', () => {
  it('parses the same routes under /v2', () => {
    for (const [url, want] of [
      ['/', { name: 'home' }],
      ['/v2', { name: 'home' }],
      ['/v2/', { name: 'home' }],
      ['/lobby/AbCd1234', { name: 'lobby', id: 'AbCd1234', intent: 'player' }],
      ['/v2/lobby/AbCd1234/', { name: 'lobby', id: 'AbCd1234', intent: 'player' }],
      ['/admin', { name: 'admin' }],
      ['/v2/admin', { name: 'admin' }],
      ['/v2x/lobby/AbCd1234', { name: 'home' }],
    ] as const) {
      at(url);
      expect(parseRoute(), url).toEqual(want);
    }
  });

  it('pushes inside the current app: the v2 app never drops into the v3 one', () => {
    at('/v2/');
    navigate({ name: 'lobby', id: 'AbCd1234', intent: 'player' });
    expect(location.pathname).toBe('/v2/lobby/AbCd1234');
    navigate({ name: 'home' });
    expect(location.pathname).toBe('/v2/');
    goTo('/admin');
    expect(location.pathname).toBe('/v2/admin');
    goTo('/');
    expect(location.pathname).toBe('/v2/');
    at('/');
    navigate({ name: 'lobby', id: 'AbCd1234', intent: 'player' });
    expect(location.pathname).toBe('/lobby/AbCd1234');
    goTo('/');
    expect(location.pathname).toBe('/');
    expect(pushes.every((p) => p.how === 'push')).toBe(true);
    expect(events).toHaveLength(6); // every push tells the shell (ct:navigate)
  });
});

describe('a lobby opened under the other world\'s path moves in place', () => {
  it('an old v2 share link at /lobby/x becomes /v2/lobby/x (replaceState: same entry, no reload, query + hash kept)', () => {
    at('/lobby/AbCd1234?x=1#chat');
    expect(syncWorldPath('v2')).toBe(true);
    expect(pushes).toEqual([{ how: 'replace', url: '/v2/lobby/AbCd1234?x=1#chat', state: { name: 'lobby' } }]);
    expect(parseRoute()).toEqual({ name: 'lobby', id: 'AbCd1234', intent: 'player' }); // the same route: no re-join
    expect(syncWorldPath('v2')).toBe(false); // idempotent
    expect(pushes).toHaveLength(1);
  });

  it('a v3 lobby opened under /v2/ moves to /', () => {
    at('/v2/lobby/AbCd1234');
    expect(syncWorldPath('v3')).toBe(true);
    expect(location.pathname).toBe('/lobby/AbCd1234');
    expect(syncWorldPath('v3')).toBe(false);
  });

  it('is wired where the lobby world becomes known: the join preview and the connection-lifetime skin hook', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = (f: string) => readFileSync(path.resolve(import.meta.dirname, '../src', f), 'utf8');
    expect(src('ui/lobby/JoinPreview.tsx')).toMatch(/syncWorldPath\(worldOfLobby\(l\)\)/);
    expect(src('ui/common/v3skinLobby.ts')).toMatch(/if \(view\) syncWorldPath\(worldOfLobby\(view\)\)/);
    // every in-app history write goes through the prefix helpers
    for (const f of ['ui/common/route.ts', 'ui/lobby/finder.ts', 'ui/hud/shared.tsx', 'ui/admin/AdminScreen.tsx'])
      for (const m of src(f).matchAll(/history\.(?:push|replace)State\([^;]*\);/g)) expect(m[0], f).toMatch(/appPath\(/);
  });
});

describe('lobby list per world', () => {
  const lobby = (id: string, world?: 'v2' | 'v3') => ({ id, ...(world ? { world } : {}) }) as LobbySummary;
  it('lists only the page world; a lobby without a world is a classic (v2) one', () => {
    const all = [lobby('a', 'v3'), lobby('b', 'v2'), lobby('c'), lobby('d', 'v3')];
    expect(lobbiesOfWorld(all, 'v3').map((l) => l.id)).toEqual(['a', 'd']);
    expect(lobbiesOfWorld(all, 'v2').map((l) => l.id)).toEqual(['b', 'c']);
    expect(lobbiesOfWorld(new Map(all.map((l) => [l.id, l])).values(), 'v2')).toHaveLength(2);
    expect(lobbiesOfWorld([], 'v3')).toEqual([]);
  });

  it('the finder filters by the page world (the count too); rows carry no world badge', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const finder = readFileSync(path.resolve(import.meta.dirname, '../src/ui/lobby/LobbyFinder.tsx'), 'utf8');
    expect(finder).toMatch(/lobbiesOfWorld\(lobbies\.values\(\), world\)/);
    expect(finder).toMatch(/filterLobbies\(mine, filters\)/);
    expect(finder).toMatch(/\{mine\.length\} \{mine\.length === 1/);
    expect(finder).not.toMatch(/WorldBadge/);
  });
});

describe('share links', () => {
  it('point into the lobby\'s own app (default: this page\'s)', () => {
    at('/lobby/AbCd1234');
    expect(shareUrl('AbCd1234')).toBe('https://town.example.test/lobby/AbCd1234');
    expect(shareUrl('AbCd1234', 'v2')).toBe('https://town.example.test/v2/lobby/AbCd1234');
    at('/v2/lobby/AbCd1234');
    expect(shareUrl('AbCd1234')).toBe('https://town.example.test/v2/lobby/AbCd1234');
    expect(shareUrl('AbCd1234', 'v3')).toBe('https://town.example.test/lobby/AbCd1234');
    expect(shareUrl('a b/c', 'v2')).toBe('https://town.example.test/v2/lobby/a%20b%2Fc');
  });
});
