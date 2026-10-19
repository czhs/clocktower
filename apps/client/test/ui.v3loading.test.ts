// (v3 WP8) The v3 app's loading scene (ui/common/v3loading.tsx) and its real progress (ui/common/townLoad.ts):
// the copied vendor frame rects equal v3/assets/ui/*.json, the 15-seat ring, the progress model over the real
// chunk names the build emits (layoutV3 / town3d / TownGame / the 21 town pieces = vendor BUILD_ORDER), the text is
// rendered as text (escaped), it stays light (no three / game3d / canvas / WebGL, no inline <style>), and it is wired
// only into the v3 app (`/`). Node, no DOM: components are called as functions and their vnode trees inspected.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VNode } from 'preact';
import { CAST_SHEET, EVENT_FRAMES, EVENTS_SHEET, litSeats, PARADE, SEATS, V3Loading } from '../src/ui/common/v3loading';
import { foldResources, loadProgress, PIECE_RE, TOWN_PIECES, type LoadSeen } from '../src/ui/common/townLoad';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const json = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'v3/assets/ui', f), 'utf8')) as Record<string, unknown>;
const src = (f: string) => readFileSync(path.join(ROOT, 'apps/client/src', f), 'utf8');

type Node = VNode<Record<string, unknown>>;
const kids = (n: Node): Node[] => {
  const c = (n.props as { children?: unknown }).children;
  return (Array.isArray(c) ? c.flat(Infinity) : [c]).filter((x): x is Node => !!x && typeof x === 'object' && 'props' in (x as object));
};
const all = (n: Node): Node[] => [n, ...kids(n).flatMap(all)];
const text = (n: Node): string => {
  const c = (n.props as { children?: unknown }).children;
  return (Array.isArray(c) ? c.flat(Infinity) : [c]).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : x && typeof x === 'object' && 'props' in x ? text(x as Node) : '')).join('');
};

describe('vendor art (baked pixel3d UI sheets)', () => {
  it('the events-night frames match v3/assets/ui/events-night.json', () => {
    const j = json('events-night.json') as { width: number; height: number; frames: Record<string, { x: number; y: number; w: number; h: number }> };
    expect([j.width, j.height]).toEqual([EVENTS_SHEET.w, EVENTS_SHEET.h]);
    for (const [name, [x, y, w, h]] of Object.entries(EVENT_FRAMES)) expect(j.frames[name], name).toEqual({ x, y, w, h });
    // the candle flicker strip: candle_1 / candle_2 sit at +8 / +16, same size
    const c0 = j.frames.candle_0!;
    expect(j.frames.candle_1).toEqual({ ...c0, x: c0.x + 8 });
    expect(j.frames.candle_2).toEqual({ ...c0, x: c0.x + 16 });
  });

  it('the parade cells match v3/assets/ui/cast-portraits.json (idle + 4 walk drawings each)', () => {
    const j = json('cast-portraits.json') as { frameWidth: number; frameHeight: number; sheets: Record<string, { x: number; y: number; frames: number }>; meta: { frames: string[] } };
    expect([j.frameWidth, j.frameHeight]).toEqual([CAST_SHEET.cellW, CAST_SHEET.cellH]);
    expect(j.meta.frames).toEqual(['idle', 'walk1', 'walk2', 'walk3', 'walk4']);
    for (const [id, [x, y]] of Object.entries(PARADE)) expect(j.sheets[id], id).toEqual({ x, y, frames: 5 });
    // sheet size used by the CSS background-size (lobby.css .ct-v3load-walker)
    const png = readFileSync(path.join(ROOT, 'v3/assets/ui/cast-portraits.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([CAST_SHEET.w, CAST_SHEET.h]);
    const css = src('ui/lobby/lobby.css');
    expect(css).toContain(`calc(${CAST_SHEET.w}px * var(--s)) calc(${CAST_SHEET.h}px * var(--s))`);
    expect(css).toContain(`calc(${EVENTS_SHEET.w}px * var(--s)) calc(${EVENTS_SHEET.h}px * var(--s))`);
  });

  it('the kit night tokens used by the CSS are the kit.json values', () => {
    const night = ((json('kit.json').meta as { tokens: { night: Record<string, string> } }).tokens.night);
    const css = src('ui/lobby/lobby.css').toLowerCase();
    for (const t of ['shadow', 'outline', 'inkSunk', 'ink', 'inkRaised', 'iron', 'ironSh', 'text', 'textDim', 'gold', 'goldHi', 'goldSh']) expect(css, t).toContain(night[t]!.toLowerCase());
  });
});

describe('the vote-clock ring', () => {
  it('15 seats on integer art px around the face, evenly spaced, seat 0 at the top, inside the 86 px box', () => {
    expect(SEATS).toHaveLength(15);
    expect(SEATS[0]).toEqual([37, 0]);
    for (const [x, y] of SEATS) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x >= 0 && y >= 0 && x + 11 <= 86 && y + 11 <= 86).toBe(true);
      expect(Math.abs(Math.hypot(x + 5.5 - 42.5, y + 5.5 - 42.5) - 37)).toBeLessThan(0.75);
    }
    expect(new Set(SEATS.map((s) => s.join())).size).toBe(15);
  });

  it('lights seats in proportion to progress (clamped, NaN-safe)', () => {
    expect([0, 0.06, 1 / 15, 0.5, 14.99 / 15, 1, 2, -1, NaN].map(litSeats)).toEqual([0, 0, 1, 7, 14, 15, 15, 0, 0]);
  });
});

describe('real progress (Resource Timing over the built chunk names)', () => {
  const none: LoadSeen = { layout: false, town3d: false, classic: false, pieces: 0 };
  // names as `vite build` emits them (assets/<chunk>-<8-char hash>.js; a house has a piece and an interior chunk)
  const pieces = ['ground-BcRXl33S', 'props-BIAwO4-s', ...Array.from({ length: 15 }, (_, i) => `house-${i}-BS2-oPH${i % 10}`), 'clocktower-2J38citA', 'dais-BX8MQxvM', 'foliage--qNYwsTs', 'life-BZUyc8RY'].map((n) => `https://town.example.test/assets/${n}.js`);

  it('TOWN_PIECES = the vendor BUILD_ORDER (pieces/*.js + life)', () => {
    const files = readdirSync(path.join(ROOT, 'v3/pixel3d/src/town/pieces')).filter((f) => f.endsWith('.js'));
    expect(files.length + 1).toBe(TOWN_PIECES);
    for (const f of files) expect(PIECE_RE.test(`/assets/${f.replace(/\.js$/, '')}-AbCd1234.js`), f).toBe(true);
    expect(PIECE_RE.test('/assets/life-AbCd1234.js')).toBe(true);
    const town = readFileSync(path.join(ROOT, 'v3/pixel3d/src/town/town.js'), 'utf8');
    expect(town).toMatch(/BUILD_ORDER = \['ground', 'props', \.\.\.PIECE_IDS\.filter\(\(id\) => id\.startsWith\('house-'\)\), 'clocktower', 'dais', 'foliage', 'life'\]/);
  });

  it('folds chunk URLs into steps; pieces count distinct ids (piece + interior chunk of a house = one)', () => {
    const set = new Set<string>();
    let s = foldResources(none, ['https://town.example.test/assets/index-AbC123de.js', 'https://town.example.test/assets/house-chunk.png'], set);
    expect(s).toBe(none); // unrelated files change nothing (same object: no re-render)
    s = foldResources(s, ['https://town.example.test/assets/layoutV3-B0tF8LtZ.js'], set);
    expect(s).toMatchObject({ layout: true, town3d: false });
    s = foldResources(s, ['/assets/town3d-BNgJ9OJc.js', '/assets/TownGame-DlKbAnId.js'], set);
    expect(s).toMatchObject({ town3d: true, classic: true, pieces: 0 });
    s = foldResources(s, pieces.slice(0, 5), set);
    expect(s.pieces).toBe(5);
    s = foldResources(s, ['/assets/house-0-DXQRxoM2.js', '/assets/house-1--MgZZZ5d.js'], set); // the interiors of houses 0-1
    expect(s.pieces).toBe(5);
    s = foldResources(s, pieces, set);
    expect(s.pieces).toBe(TOWN_PIECES);
  });

  it('progress rises step by step and within the piece build; Classic (no WebGL) has its own short path', () => {
    const at = (step: 'boot' | 'join' | 'town', seen: Partial<LoadSeen>, r: 'v3' | 'classic' = 'v3') => loadProgress(step, { ...none, ...seen }, r);
    const seq = [
      at('boot', {}),
      at('join', {}),
      at('join', { layout: true }),
      at('town', { layout: true }),
      at('town', { town3d: true }),
      ...Array.from({ length: TOWN_PIECES - 1 }, (_, i) => at('town', { town3d: true, pieces: i + 1 })),
      at('town', { town3d: true, pieces: TOWN_PIECES }),
    ];
    for (let i = 1; i < seq.length; i++) expect(seq[i]!.frac, `${i}: ${seq[i]!.label}`).toBeGreaterThan(seq[i - 1]!.frac);
    expect(seq.at(-1)).toEqual({ frac: 0.93, label: 'Lighting the lamps…', detail: null });
    expect(at('town', { town3d: true, pieces: 7 })).toMatchObject({ label: 'Raising the cottages…', detail: `7 / ${TOWN_PIECES}` });
    expect(at('town', {}, 'classic').frac).toBeLessThan(at('town', { classic: true }, 'classic').frac);
    expect(at('town', { classic: true }, 'classic').label).toBe('Drawing the town…');
    for (const p of seq) expect(p.frac > 0 && p.frac < 1).toBe(true);
  });
});

describe('the scene', () => {
  it('renders the label and detail as text (escaped by Preact), a progressbar and the 15 seats', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const tree = V3Loading({ frac: 0.5, label: `Joining ${evil}…`, detail: '3 / 21' }) as Node;
    expect(tree.props.role).toBe('status');
    const nodes = all(tree);
    expect(nodes.some((n) => n.props.dangerouslySetInnerHTML)).toBe(false);
    expect(text(nodes.find((n) => n.props.class === 'ct-v3load-label')!)).toBe(`Joining ${evil}…`);
    expect(text(nodes.find((n) => n.props.class === 'ct-v3load-detail')!)).toBe('3 / 21');
    const bar = nodes.find((n) => n.props.role === 'progressbar')!;
    expect(bar.props['aria-valuenow']).toBe(50);
    const seats = nodes.filter((n) => n.type === 'i' && typeof n.props.style === 'object' && (n.props.style as Record<string, number>)['--fw'] === 11);
    expect(seats).toHaveLength(15);
    const yes = EVENT_FRAMES.vc_seat_yes[0];
    expect(seats.filter((n) => (n.props.style as Record<string, number>)['--fx'] === yes)).toHaveLength(litSeats(0.5));
    expect(nodes.filter((n) => n.props.class === 'ct-v3load-walker')).toHaveLength(Object.keys(PARADE).length);
    const boot = all(V3Loading({ frac: 0.03, label: 'x', parade: false }) as Node);
    expect(boot.filter((n) => n.props.class === 'ct-v3load-walker')).toHaveLength(0);
  });

  it('stays light: DOM + CSS only, no three / game3d / canvas / WebGL, no inline <style>, two vendor sheets', () => {
    for (const f of ['ui/common/v3loading.tsx', 'ui/common/townLoad.ts', 'ui/common/townLoading.tsx']) {
      const code = src(f).replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/from 'three'|game3d|@pixel3d|getContext|<canvas|<style|innerHTML|import\(/);
    }
    const imports = [...src('ui/common/v3loading.tsx').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['@v3assets/events-night.png?url', '@v3assets/cast-portraits.png?url']);
  });

  it('is the v3 app\'s screen only: boot + join at `/` (main.tsx, JoinPreview), the v2 app keeps the plain line', () => {
    const main = src('main.tsx');
    expect(main).toMatch(/appWorld\(\) === 'v3' \? \(\s*<V3Loading /);
    expect(main).toMatch(/<LoadingScreen text=\{v2Text\} \/>/);
    expect(main).toMatch(/booting\('Loading…', false\)/);
    expect(main).toMatch(/booting\('Joining lobby…', true\)/);
    const join = src('ui/lobby/JoinPreview.tsx');
    expect(join).toMatch(/if \(appWorld\(\) === 'v3'\) return <V3LoadingStep step="join"/);
    expect(join).toMatch(/return <JoinPreviewView lobby=\{lobby\} \/>;/);
    // the town build: GameScreen shows the scene in a v3 lobby only, v2 lobbies keep "Lighting the lamps…"
    const game = src('game/GameScreen.tsx');
    expect(game).toMatch(/world === 'v3' \? \([\s\S]{0,200}<TownLoading renderer=\{render\.kind\} \/>/);
    expect(game).toMatch(/Lighting the lamps…/);
  });
});

describe('laptop-first note (WP8, user 2026-10-18: phones not supported in v3.0)', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const withScreen = (coarse: boolean, w: number, h: number, fn: () => void) => {
    const saved = { matchMedia: g.matchMedia, innerWidth: g.innerWidth, innerHeight: g.innerHeight };
    g.matchMedia = (q: string) => ({ matches: q.includes('coarse') ? coarse : false });
    g.innerWidth = w;
    g.innerHeight = h;
    try {
      fn();
    } finally {
      Object.assign(g, saved);
    }
  };
  it('only a coarse pointer AND a small viewport counts as a phone; no matchMedia = not a phone', async () => {
    const { isPhoneLike } = await import('../src/ui/common/v3loading');
    withScreen(true, 390, 844, () => expect(isPhoneLike()).toBe(true));
    withScreen(true, 844, 390, () => expect(isPhoneLike()).toBe(true));
    withScreen(true, 1366, 768, () => expect(isPhoneLike()).toBe(false)); // touch laptop / tablet in a big window
    withScreen(false, 390, 844, () => expect(isPhoneLike()).toBe(false)); // a narrow desktop window
    expect(isPhoneLike()).toBe(false);
  });
  it('the note is a non-blocking text line (role note), shown in the scene and the v3 finder', async () => {
    const { PhoneNote, PHONE_NOTE } = await import('../src/ui/common/v3loading');
    withScreen(true, 390, 844, () => {
      const n = PhoneNote({}) as unknown as Node;
      expect(n.type).toBe('p');
      expect((n.props as { role?: string }).role).toBe('note');
      expect(text(n)).toBe(PHONE_NOTE);
    });
    withScreen(false, 1920, 1080, () => expect(PhoneNote({})).toBeNull());
    expect(PHONE_NOTE).toMatch(/laptops and desktops/);
    expect(src('ui/lobby/LobbyFinder.tsx')).toMatch(/world === 'v3' && <PhoneNote \/>/);
    expect(src('ui/common/v3loading.tsx')).toMatch(/<PhoneNote class="ct-v3load-note" \/>/);
  });
});
