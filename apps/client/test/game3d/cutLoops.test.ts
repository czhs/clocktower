// v3.5 shaders: the build-time rewrite of the vendor cut-away GLSL (build/pixel3dImports.ts patchCutLoops).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUT_DISCARD, CUT_LOOPS, CUT_RIM, patchCutLoops } from '../../build/pixel3dImports';

const V = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../v3/pixel3d/src/town/cutaway.js');
const SRC = readFileSync(V, 'utf8');

/** Evaluate the GLSL template literals of (patched) cutaway.js with the switch on or off. */
function glsl(code: string, on: boolean): Record<'CUT_GLSL' | 'PART_GLSL' | 'RIM_GLSL', string> {
  const grab = (name: string) => {
    const head = `const ${name} = /* glsl */\``;
    const i = code.indexOf(head);
    const j = code.indexOf('\n`;', i);
    expect(i).toBeGreaterThanOrEqual(0);
    return code.slice(i, j + 3);
  };
  const body = ['const MAX_BOXES = 3;', 'const MAX_LIFTS = 4;', `const __ctCutLoops = ${on};`, grab('CUT_GLSL'), grab('PART_GLSL'), grab('RIM_GLSL'), 'return { CUT_GLSL, PART_GLSL, RIM_GLSL };'].join('\n');
  return new Function(body)() as Record<'CUT_GLSL' | 'PART_GLSL' | 'RIM_GLSL', string>;
}

describe('cut-away loop rewrite (v3.5 shaders)', () => {
  const out = patchCutLoops(SRC);

  it('patches the current vendor file and keeps an A/B switch', () => {
    expect(out).not.toBeNull();
    expect(out!).toContain("getItem('ct.debug.v3cutloop') !== '0'");
    for (const l of CUT_LOOPS) expect(out!.split(`__ctCutLoops ? '${l.bound}' : ${l.max}`).length - 1).toBe(l.n);
  });

  it('switch on: no constant-bounded cut loop, one townCut call in the rim and one in townDiscard', () => {
    const g = glsl(out!, true);
    const all = g.CUT_GLSL + g.PART_GLSL + g.RIM_GLSL;
    expect(all).not.toMatch(/i < [34];/);
    expect(all.match(/i < int\(uCutLiftN\);/g)).toHaveLength(4);
    expect(all.match(/i < int\(uCutBoxN\);/g)).toHaveLength(2);
    expect(g.RIM_GLSL.match(/townCut\(/g)).toHaveLength(1);
    expect(g.RIM_GLSL).toContain('k < 4 + int(min(uCutOn, 0.0))');
    // townDiscard: one townCut (centroid of a small part, else the fragment) instead of two
    expect(g.PART_GLSL.match(/townCut\(/g)).toHaveLength(1);
    expect(glsl(SRC, false).PART_GLSL.match(/townCut\(/g)).toHaveLength(2);
    // every loop keeps its early break on the uniform count (the same iterations as before)
    expect(all.match(/if \(float\(i\) >= uCut(Lift|Box)N\) break;/g)).toHaveLength(6);
  });

  it('switch off: byte-identical to the vendor GLSL', () => {
    expect(glsl(out!, false)).toEqual(glsl(SRC, false));
    expect(glsl(out!, false).RIM_GLSL).toContain(CUT_RIM);
  });

  it('a vendor change (a loop more or less, a different rim) fails the patch', () => {
    expect(patchCutLoops(SRC.replace(CUT_LOOPS[0].find, 'for (int i = 0; i < 4; i++) {'))).toBeNull();
    expect(patchCutLoops(SRC.replace(CUT_RIM, 'return 0.0;'))).toBeNull();
    expect(patchCutLoops(SRC.replace(CUT_DISCARD, '  return false;'))).toBeNull();
    expect(patchCutLoops(SRC.replace('const MAX_LIFTS = 4;', 'const MAX_LIFTS = 6;'))).toBeNull();
  });
});
