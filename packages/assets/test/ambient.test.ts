// OWNED BY world-audit. Night-leak guard rail for ambient life (packages/assets/src/ambient.ts,
// authored by the assets teammate). Ambient effects must look identical for every viewer whatever
// the Storyteller does, so the data must be static, public, outdoor-only and independent of any
// entity / game state. (The client must also drive them only from time + the public phase; see
// docs/world-audit.md.)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { locationAt } from '@ct/protocol';
import { AMBIENT, townLayout as L } from '../src/index.js';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ambient.ts'), 'utf8');

function walk(v: unknown, path: string, out: string[]) {
  if (typeof v === 'function') out.push(`${path} is a function`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
}

describe('ambient life cannot leak night information', () => {
  it('is plain static data (no functions / getters that could read live state)', () => {
    const bad: string[] = [];
    walk(AMBIENT, 'AMBIENT', bad);
    expect(bad).toEqual([]);
    expect(JSON.parse(JSON.stringify(AMBIENT))).toEqual(AMBIENT);
  });

  it('source depends only on the public map (no game / world / voice state, no viewer, no storyteller)', () => {
    const imports = [...SRC.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) expect(['./layout.js', '@ct/protocol']).toContain(i);
    const code = SRC.replace(/\/\/.*$/gm, '');
    for (const w of ['storyteller', 'visit', 'snapshot', 'entity', 'entities', 'pid', 'seat', 'Math.random', 'Date.now', 'performance'])
      expect(code.toLowerCase().includes(w.toLowerCase()), `ambient.ts mentions ${w}`).toBe(false);
  });

  it('every ambient element is outdoors (never inside a home, where it would be per-room)', () => {
    const pts: { what: string; x: number; y: number }[] = [];
    for (const c of AMBIENT.critters) pts.push({ what: `critter ${c.kind}`, x: c.x, y: c.y - 1 });
    for (const f of AMBIENT.fireflies) pts.push({ what: 'fireflies', x: f.area.x, y: f.area.y }, { what: 'fireflies', x: f.area.x + f.area.w - 1, y: f.area.y + f.area.h - 1 });
    pts.push({ what: 'pond', x: AMBIENT.pond.cx, y: AMBIENT.pond.cy }, { what: 'bats', x: AMBIENT.bats.cx, y: Math.max(0, AMBIENT.bats.cy) });
    for (const w of AMBIENT.water) pts.push({ what: 'water', x: w.x * L.tileSize, y: w.y * L.tileSize });
    const townW = L.townBounds.w * L.tileSize;
    for (const p of pts) {
      expect(p.x < townW, `${p.what} at ${p.x},${p.y} outside the town`).toBe(true);
      expect(locationAt(L, p.x, p.y), `${p.what} at ${p.x},${p.y}`).toBe('outdoors');
    }
    expect(AMBIENT.fog.area.x + AMBIENT.fog.area.w).toBeLessThanOrEqual(townW);
  });
});
