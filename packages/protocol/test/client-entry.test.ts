// (v2.2 perf WP3) Guard rails for the schema-free browser entry `@ct/protocol/client`
// (src/client.ts): it must expose exactly the non-schema runtime values of the full protocol, with
// identical values / function source, and must never load zod.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as full from '../src/index.js';
import * as client from '../src/client.js';
import { townLayout } from '../../assets/src/layout.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const isSchema = (v: unknown): boolean => !!v && typeof v === 'object' && '_zod' in (v as object);
/** A zod schema, or a map of schemas (C2S). */
const schemaBearing = (v: unknown): boolean =>
  isSchema(v) || (!!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).length > 0 && Object.values(v as object).every(isSchema));

describe('@ct/protocol/client', () => {
  const fullValues = Object.keys(full).filter((k) => !schemaBearing((full as Record<string, unknown>)[k]));

  it('exports every non-schema runtime value of the full protocol, and nothing else', () => {
    expect(Object.keys(client).sort()).toEqual(fullValues.sort());
  });

  it('mirrors each value exactly (deep-equal data, identical function source)', () => {
    for (const k of fullValues) {
      const a = (full as Record<string, unknown>)[k];
      const b = (client as Record<string, unknown>)[k];
      if (typeof a === 'function') expect(String(b), k).toBe(String(a));
      else expect(b, k).toEqual(a);
    }
    expect(Object.isFrozen(client.EMPTY_NOTEBOOK)).toBe(Object.isFrozen(full.EMPTY_NOTEBOOK));
  });

  it('world helpers behave identically on the real town layout', () => {
    const L = townLayout;
    for (let y = 0; y < L.heightTiles * L.tileSize; y += 7)
      for (let x = 0; x < L.widthTiles * L.tileSize; x += 7) {
        expect(client.isBlockedPx(L, x, y)).toBe(full.isBlockedPx(L, x, y));
        expect(client.locationAt(L, x, y)).toBe(full.locationAt(L, x, y));
        expect(client.inSquare(L, x, y)).toBe(full.inSquare(L, x, y));
      }
    for (let n = 1; n <= 15; n++) {
      const seats = Array.from({ length: n }, (_, i) => i);
      expect(client.circleSpots(L, seats)).toEqual(full.circleSpots(L, seats));
    }
    for (const b of L.buildings) {
      expect(client.tileCenterPx(L, b.door)).toEqual(full.tileCenterPx(L, b.door));
      expect(client.seatOfBuilding(L, b.id)).toBe(full.seatOfBuilding(L, b.id));
    }
    for (let s = -1; s < 16; s++) expect(client.homeBuilding(L, s)).toBe(full.homeBuilding(L, s));
    for (const s of ['', 'abc', 'é€😀', '\u{10FFFF}x\uD800']) expect(client.utf8Length(s)).toBe(full.utf8Length(s));
  });

  it('never loads zod at runtime (only type-only re-exports of the schema modules)', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      // value imports / re-exports (type-only ones are erased by the compiler)
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)) {
        const spec = m[1]!;
        expect(spec, `${path.basename(file)} imports ${spec}`).not.toBe('zod');
        expect(spec.startsWith('.'), `${path.basename(file)} imports package ${spec}`).toBe(true);
        visit(path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts')));
      }
    };
    visit(path.join(SRC, 'client.ts'));
    // every module the entry loads at runtime is zod-free by construction (checked above)
    expect([...seen].map((f) => path.basename(f))).toContain('constants.ts');
  });

  it('exports every value the browser code imports from @ct/protocol', () => {
    const roots = ['apps/client/src', 'packages/voice/src', 'packages/assets/src'].map((r) => path.join(REPO, r));
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    roots.forEach(walk);
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@ct\/protocol(?:\/client)?'/g)) {
        if (m[1]) continue;
        for (const raw of m[2]!.split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
          if (!name || name.startsWith('type ')) continue;
          if (!(name in client)) missing.push(`${path.relative(REPO, f)}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
