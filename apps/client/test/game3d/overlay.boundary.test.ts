// v3 WP4: static guards over game3d/overlay/** (docs/v3/INTEGRATION.md §1.3 step 4, §7, CLAUDE.md "escape user
// text"): no HTML sinks (user text only through textContent), no three / @pixel3d / phaser runtime imports
// (the overlay is DOM + 2D canvas over the View3d / AvatarRegistry contracts), the gameplay / social logic is
// imported from the renderer-free core / controller (never the Phaser barrels or views), and styles are set
// through the CSSOM (no style attribute strings, which `style-src 'self'` would block).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../src/game3d/overlay/', import.meta.url));
const files = readdirSync(DIR)
  .filter((n) => n.endsWith('.ts'))
  .map((n) => ({ name: n, code: readFileSync(path.join(DIR, n), 'utf8') }));
const runtimeImports = (code: string) => {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (let m = re.exec(code); m; m = re.exec(code)) out.push(m[1]!);
  const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = dyn.exec(code); m; m = dyn.exec(code)) out.push(m[1]!);
  return out;
};
/** Code without comments (so the header prose may mention the forbidden names). */
const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('game3d/overlay boundaries', () => {
  it('has the WP4 modules', () => {
    expect(files.map((f) => f.name).sort()).toEqual(
      expect.arrayContaining(['index.ts', 'place.ts', 'anchors.ts', 'atlas.ts', 'surface.ts', 'labels.ts', 'bubbles.ts', 'socialView.ts', 'boards.ts', 'gameplayView.ts', 'types.ts']),
    );
  });

  it('never uses an HTML sink or a style attribute string', () => {
    for (const f of files) {
      const code = strip(f.code);
      expect(code, f.name).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
      expect(code, f.name).not.toMatch(/setAttribute\(\s*['"]style['"]/);
      expect(code, f.name).not.toMatch(/\.style\.cssText\s*=/);
    }
  });

  it('imports neither three, @pixel3d nor phaser at runtime, and only the renderer-free gameplay / social halves', () => {
    for (const f of files) {
      for (const s of runtimeImports(f.code)) {
        expect(s === 'three' || s.startsWith('three/') || s.startsWith('@pixel3d/') || s === 'phaser', `${f.name} -> ${s}`).toBe(false);
        expect(/game\/(gameplay|social)(\/index)?$/.test(s), `${f.name} -> ${s} (barrel pulls the Phaser views)`).toBe(false);
        expect(/phaserView$/.test(s), `${f.name} -> ${s}`).toBe(false);
        expect(/game\/(TownScene|TownGame)$/.test(s), `${f.name} -> ${s}`).toBe(false);
      }
    }
  });

  it('pure modules (place, anchors) import nothing DOM- or renderer-bound', () => {
    expect(runtimeImports(files.find((f) => f.name === 'place.ts')!.code)).toEqual([]);
    expect(runtimeImports(files.find((f) => f.name === 'anchors.ts')!.code)).toEqual(['../../game/social/speech']);
  });

  it('positions are written only as translate3d transforms (no left/top writes in the per-frame path)', () => {
    for (const f of files.filter((x) => x.name !== 'surface.ts')) {
      const code = strip(f.code);
      expect(code, f.name).not.toMatch(/\.style\.(left|top)\s*=/);
    }
  });
});
