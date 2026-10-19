// (v3 WP6, v3-ui) The v3 UI atlases (apps/client/src/ui/common/v3atlas.ts) over the real baked files in
// v3/assets/ui: every frame the social dock (SocialPalette) and the pie (PieMenu) ask for resolves by day and
// at night, the only v2 art left in a v3 lobby is the documented skip list, the kit tokens map onto the
// theme.css variables, and the portrait strip is the drop-in the contract describes (docs/v3/INTEGRATION.md §5).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIN_COLORS } from '@ct/protocol';
import { CAST, PLAYABLE } from '../../../packages/assets/src/cast';
import { castSheetKey } from '../src/ui/common/castPortrait';
import { v3PortraitKey } from '../src/ui/common/v3portrait';
import {
  ATLAS_ORDER,
  AtlasStore,
  buildIndex,
  NIGHT_ATLASES,
  stripFrom,
  THEME_TOKEN_MAP,
  themeVars,
  uiScale,
  V3_SKIPPED_FRAMES,
  type AtlasJson,
  type AtlasSource,
  type KitJson,
} from '../src/ui/common/v3atlas';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const UI = path.join(ROOT, 'v3/assets/ui');
const json = <T>(f: string): T => JSON.parse(readFileSync(path.join(UI, f), 'utf8')) as T;

const day: AtlasSource[] = ATLAS_ORDER.map((name) => ({ name, png: `${name}.png`, json: json<AtlasJson>(`${name}.json`) }));
const night: AtlasSource[] = ATLAS_ORDER.map((name) =>
  NIGHT_ATLASES.includes(name) ? { name: `${name}-night`, png: `${name}-night.png`, json: json<AtlasJson>(`${name}-night.json`) } : day.find((d) => d.name === name)!,
);
const kit = json<KitJson & { meta: { tokens: Record<'day' | 'golden' | 'night', Record<string, unknown>> } }>('kit.json');
const strip = stripFrom(json('cast-portraits.json'), 'cast-portraits.png')!;

function loaded(): AtlasStore {
  const s = new AtlasStore();
  s.setDay(day, kit, strip);
  s.setNight(night);
  return s;
}

/** Every frame SocialPalette / PieMenu request (src/ui/social/*.tsx: emote_point, pin_<colour>, icon_<who>, nick_face). */
function socialFrames(): string[] {
  // the dock shows the viewer's own character: any playable cast member, or the Storyteller
  const who = [...PLAYABLE.map((c) => c.id), 'storyteller'];
  return ['emote_point', 'nick_face', ...PIN_COLORS.map((c) => `pin_${c}`), ...who.map((id) => `icon_${id}`)];
}

describe('v3atlas lookup', () => {
  const a = loaded();
  it('resolves every social frame by day and at night, except the documented skips', () => {
    const missing: string[] = [];
    for (const f of socialFrames())
      for (const n of [false, true]) {
        const hit = a.frame(f, n);
        if (V3_SKIPPED_FRAMES.includes(f)) expect(hit, `${f} is a documented skip`).toBeNull();
        else if (!hit) missing.push(`${f}${n ? ' (night)' : ''}`);
        else {
          expect(hit.w).toBeGreaterThan(0);
          expect(hit.x + hit.w).toBeLessThanOrEqual(hit.sheetW);
          expect(hit.y + hit.h).toBeLessThanOrEqual(hit.sheetH);
        }
      }
    expect(missing).toEqual([]);
  });

  it('the social dock / pie use the same skip list (PieMenu.tsx SKIPPED mirrors V3_SKIPPED_FRAMES)', () => {
    const pie = readFileSync(path.join(ROOT, 'apps/client/src/ui/social/PieMenu.tsx'), 'utf8');
    const m = /export const SKIPPED: readonly string\[\] = \[([^\]]*)\]/.exec(pie);
    expect(m, 'SKIPPED in PieMenu.tsx').not.toBeNull();
    expect([...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1])).toEqual([...V3_SKIPPED_FRAMES]);
  });

  it('documented skips are exactly the frames the v2 social sheet still provides', () => {
    const v2 = JSON.parse(readFileSync(path.join(ROOT, 'packages/assets/generated/social.json'), 'utf8')) as AtlasJson;
    for (const f of V3_SKIPPED_FRAMES) expect(v2.frames[f], f).toBeDefined();
    // and only nicksong / brianbi (UI.md §5) are skipped among the cast
    expect(V3_SKIPPED_FRAMES.filter((f) => f.startsWith('icon_')).sort()).toEqual(['icon_brianbi', 'icon_nicksong']);
    expect([...strip.skipped].sort()).toEqual(['brianbi', 'nicksong']);
  });

  it('takes each family from its atlas, and the -night bake at night', () => {
    expect(a.frame('emote_point')!.atlas).toBe('emotes');
    expect(a.frame('emote_point', true)!.atlas).toBe('emotes'); // emotes ships no night bake
    expect(a.frame('pin_gold')!.atlas).toBe('markers');
    expect(a.frame('pin_gold', true)!.atlas).toBe('markers-night');
    expect(a.frame('icon_frog')!.atlas).toBe('portraits');
    expect(a.frame('icon_frog', true)!.atlas).toBe('portraits-night');
    expect(a.frame('bubble_nine')!.atlas).toBe('indicators');
    expect(a.frame('bubble_nine', true)!.atlas).toBe('indicators-night');
    expect(a.frame('pin_gold', true)!.url).toBe('markers-night.png');
  });

  it('night falls back to the day set until the night atlases are loaded', () => {
    const s = new AtlasStore();
    s.setDay(day, kit, strip);
    expect(s.nightReady()).toBe(false);
    expect(s.frame('pin_gold', true)!.atlas).toBe('markers');
  });

  it('buildIndex keeps the first atlas for a duplicated name', () => {
    const one: AtlasSource = { name: 'a', png: 'a.png', json: { frames: { x: { x: 0, y: 0, w: 2, h: 2 } } } };
    const two: AtlasSource = { name: 'b', png: 'b.png', json: { width: 8, height: 8, frames: { x: { x: 4, y: 4, w: 2, h: 2 }, y: { x: 1, y: 1, w: 1, h: 1 } } } };
    const idx = buildIndex([one, two]);
    expect(idx.get('x')).toMatchObject({ atlas: 'a', sheetW: 2, sheetH: 2 });
    expect(idx.get('y')).toMatchObject({ atlas: 'b', sheetW: 8, sheetH: 8 });
  });

  it('reads the 9-slice insets from kit.json (bubble 3/3/3/4)', () => {
    expect(a.inset('frame_bubble')).toEqual({ l: 3, t: 3, r: 3, b: 4 });
    expect(a.inset('nope')).toBeNull();
  });
});

describe('v3 tokens → theme.css variables', () => {
  const theme = readFileSync(path.join(ROOT, 'apps/client/src/ui/common/theme.css'), 'utf8');
  for (const look of ['day', 'golden', 'night'] as const)
    it(`${look}: every mapped theme variable gets a colour`, () => {
      const v = themeVars(kit.meta.tokens[look]);
      for (const cssVar of [...Object.keys(THEME_TOKEN_MAP), '--panel']) {
        expect(theme, `${cssVar} exists in theme.css`).toContain(`${cssVar}:`);
        expect(v[cssVar], cssVar).toMatch(/^#[0-9a-f]{6}(f5)?$/);
      }
      expect(v['--panel']).toBe(`${String(kit.meta.tokens[look].ink).toLowerCase()}f5`);
      expect(v['--accent']).toBe(String(kit.meta.tokens[look].gold).toLowerCase());
      // every token is also exposed as --v3-<token>, the scrim as rgba()
      expect(v['--v3-ink-raised']).toBe(String(kit.meta.tokens[look].inkRaised).toLowerCase());
      expect(v['--v3-scrim']).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    });
  it('night is a different token set from day', () => {
    expect(themeVars(kit.meta.tokens.night)['--bg']).not.toBe(themeVars(kit.meta.tokens.day)['--bg']);
  });
  it('store.tokens normalises and falls back to day', () => {
    const a = loaded();
    expect(a.tokens('night').gold).toBe(String(kit.meta.tokens.night.gold).toLowerCase());
    const bare = new AtlasStore();
    expect(bare.tokens('day')).toEqual({});
  });
  it('ignores malformed token values', () => {
    expect(themeVars({ ink: 'red', gold: '#ABCDEF', iron: 12, scrim: [1, 2] })).toEqual({ '--accent': '#abcdef', '--v3-gold': '#abcdef' });
  });
  it('picks the integer UI scale', () => {
    expect(uiScale(720)).toBe(2);
    expect(uiScale(800)).toBe(2);
    expect(uiScale(1080)).toBe(3);
  });
});

describe('v3 portrait strip (§5.1)', () => {
  it('has the v2 strip shape and the vendor cadence', () => {
    expect(strip.dir).toBe('down');
    expect([strip.frameWidth, strip.frameHeight]).toEqual([32, 40]);
    expect(strip.walkStepMs).toBe(67);
  });
  it('covers every cast member except the skips, with ghost and memorial keys for players', () => {
    for (const c of CAST) {
      if (strip.skipped.includes(c.id)) {
        expect(strip.sheets[c.id], c.id).toBeUndefined();
        continue;
      }
      expect(strip.sheets[c.id], c.id).toBeDefined();
      if (c.kind === 'villager' || c.kind === 'mascot') {
        expect(strip.sheets[c.id]!.frames, `${c.id} walk frames`).toBe(5);
        for (const k of [castSheetKey(c.id, true), castSheetKey(c.id, 'spent'), castSheetKey(c.id, false, true)]) expect(strip.sheets[k], k).toBeDefined();
      }
    }
  });
  it('castSheetKey: dead wins over ghost; v2 keys unchanged', () => {
    expect(castSheetKey('frog')).toBe('frog');
    expect(castSheetKey('frog', true)).toBe('frog/ghost');
    expect(castSheetKey('frog', 'spent')).toBe('frog/ghost-spent');
    expect(castSheetKey('frog', true, true)).toBe('frog/dead');
  });
  it('v3PortraitKey: memorial → ghost → living, frames clamped to what the strip has', () => {
    expect(v3PortraitKey(strip, 'frog', { frame: 3 })).toEqual({ key: 'frog', f: 3 });
    expect(v3PortraitKey(strip, 'frog', { ghost: true, frame: 3 })).toEqual({ key: 'frog/ghost', f: 0 });
    expect(v3PortraitKey(strip, 'frog', { ghost: 'spent', dead: true })).toEqual({ key: 'frog/dead', f: 0 });
    expect(v3PortraitKey(strip, 'storyteller', { frame: 2 })).toEqual({ key: 'storyteller', f: 0 }); // idle only: holds the v3 idle
    expect(v3PortraitKey(strip, 'storyteller', { dead: true })).toEqual({ key: 'storyteller', f: 0 }); // no memorial: living
  });
  it('stripFrom defaults a malformed manifest', () => {
    expect(stripFrom({}, 'x.png')).toBeNull();
    expect(stripFrom({ sheets: {}, meta: { walkStepMs: -1, skipped: ['a', 3 as unknown as string] } }, 'x.png')).toMatchObject({ walkStepMs: 67, skipped: ['a'], dir: 'down' });
  });
});

describe('vendor stylesheet loaded by the skin', () => {
  // panels.css is linked as-is in v3 lobbies (read-only vendor): it may only carry inline data: images, so it can
  // never make the page fetch anything (the CSP would block it anyway: img-src 'self' data: blob:)
  const css = readFileSync(path.join(UI, 'panels.css'), 'utf8');
  it('has no @import and no non-data url()', () => {
    expect(css).not.toMatch(/@import/i);
    const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]!);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => !u.startsWith('data:image/'))).toEqual([]);
    expect(css).not.toMatch(/expression\(|javascript:/i);
  });
});
