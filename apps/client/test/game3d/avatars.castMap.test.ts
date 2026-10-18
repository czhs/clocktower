// v3 WP2: castMap covers every v2 cast id, and its ghost-mode baseline matches the live capability probe of the
// vendor specs (docs/v3/INTEGRATION.md §4, §6.2 "castMap covers all 33 CAST ids and the ghost-mode table"; §10
// "castMap ghost probe" after a vendor refresh). Imports every v3/pixel3d/characters/*.js (plain JS + three).
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { CAST } from '@ct/assets';
import { describe, expect, it } from 'vitest';
import {
  BILLBOARD_IDS,
  CAST_IDS,
  carriesLantern,
  castMap,
  fallbackCastId,
  GHOST_BASELINE,
  ghostModeOf,
  SPEC_IDS,
  STANDIN_SPEC,
  standinTint,
} from '../../src/game3d/avatars/castMap';
import { specCapsOf } from '../../src/game3d/vendor/characters';
import { hasBillboardArt } from '../../src/game3d/avatars/billboard';

const CHARS = fileURLToPath(new URL('../../../../v3/pixel3d/characters/', import.meta.url));
const vendorIds = readdirSync(CHARS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3))
  .sort();

describe('castMap', () => {
  it('knows all 33 v2 cast ids', () => {
    expect(CAST_IDS).toHaveLength(33);
    expect(CAST_IDS).toEqual(CAST.map((c) => c.id));
  });

  it('maps every cast id to a 3D spec or a billboard (never nothing)', () => {
    for (const id of CAST_IDS) {
      const m = castMap(id);
      if (BILLBOARD_IDS.has(id)) {
        expect(m, id).toEqual({ spec: null, fallback: 'billboard', ghost: 'tint' });
        expect(hasBillboardArt(id), `${id} has v2 sprite art`).toBe(true);
      } else {
        expect(m.spec, id).toBe(id);
        expect(m.fallback, id).toBeNull();
        expect(SPEC_IDS.has(id), `${id} has a vendor spec`).toBe(true);
      }
    }
    // the two billboards: brianbi has no spec at all, nicksong's is a user-skipped WIP
    expect([...BILLBOARD_IDS].sort()).toEqual(['brianbi', 'nicksong']);
    expect(vendorIds).not.toContain('brianbi');
  });

  it('every cast id also has v2 sprite art (the last-resort billboard)', () => {
    for (const id of CAST_IDS) expect(hasBillboardArt(id), id).toBe(true);
  });

  it('unknown ids get the tinted stand-in', () => {
    expect(castMap('no-such-cast')).toEqual({ spec: null, fallback: 'standin', ghost: GHOST_BASELINE[STANDIN_SPEC] });
    expect(castMap('wanderer').fallback).toBe('standin'); // a vendor-only spec is not a cast id
    expect(SPEC_IDS.has(STANDIN_SPEC)).toBe(true);
  });

  it('SPEC_IDS equals the vendor characters/ directory (re-run after a vendor refresh)', () => {
    expect([...SPEC_IDS].sort()).toEqual(vendorIds);
  });

  it('the ghost-mode baseline equals the live probe of every vendor spec', async () => {
    const probed: Record<string, string> = {};
    for (const id of vendorIds) {
      const mod = (await import(pathToFileURL(path.join(CHARS, `${id}.js`)).href)) as { default: Record<string, unknown> };
      probed[id] = ghostModeOf(specCapsOf(mod.default));
    }
    expect(probed).toEqual(Object.fromEntries(vendorIds.map((id) => [id, GHOST_BASELINE[id]])));
    // castMap prefers the live probe over the table
    expect(castMap('frog', { ghost: true, clips: [] }).ghost).toBe('shared');
    expect(castMap('frog', { ghost: false, clips: ['ghost'] }).ghost).toBe('clips');
    expect(castMap('frog', { ghost: false, clips: ['idle'] }).ghost).toBe('tint');
  });

  it('ghost modes: shared > clips > tint', () => {
    expect(ghostModeOf({ ghost: true, clips: ['ghost'] })).toBe('shared');
    expect(ghostModeOf({ ghost: false, clips: ['ghost', 'ghost-spent'] })).toBe('clips');
    expect(ghostModeOf({ ghost: false, clips: ['ghost-spent'] })).toBe('tint');
    expect(ghostModeOf({ ghost: false, clips: [] })).toBe('tint');
  });

  it('every cast id has a ghost look (shared / clips / tint)', () => {
    for (const id of CAST_IDS) expect(['shared', 'clips', 'tint'], id).toContain(castMap(id).ghost);
  });

  it('lantern carriers: moth and the Storyteller', () => {
    expect(CAST_IDS.filter(carriesLantern).sort()).toEqual(['moth', 'storyteller']);
  });

  it('stand-in tint and fallback cast id are stable per pid', () => {
    expect(standinTint('abc')).toBe(standinTint('abc'));
    expect(standinTint('abc')).toMatch(/^#[0-9a-f]{6}$/);
    const ids = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map(standinTint));
    expect(ids.size).toBeGreaterThan(2);
    const f = fallbackCastId('pid-1');
    expect(f).toBe(fallbackCastId('pid-1'));
    expect(CAST.find((c) => c.id === f)?.kind).toMatch(/villager|mascot/);
  });
});
