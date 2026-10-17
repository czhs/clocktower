// v3 WP0 (v3-lead). Import boundaries of the 3D town (docs/v3/INTEGRATION.md §1.1, §1.3 step 4, §1.4):
//   - only game3d/vendor/** imports '@pixel3d/*' (every vendor call goes through a typed wrapper);
//   - three.js and the lazy game3d modules never reach the main / lobby bundles: outside game3d/ only the
//     static, three-free modules (select, bootGuard, contract types) are imported statically, and
//     TownGame3d only through import();
//   - the pure modules (select, bootGuard, bootMark, perf, contract, coords) import neither three nor '@pixel3d/'.
//   - the three version pinned in apps/client equals the vendor's (v3/pixel3d/package.json).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const CLIENT = fileURLToPath(new URL('../../', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');
/** Static import / export-from specifiers (type-only imports excluded). */
function staticImports(code: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (let m = re.exec(code); m; m = re.exec(code)) out.push(m[1]!);
  return out;
}
function dynamicImports(code: string): string[] {
  const out: string[] = [];
  const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(code); m; m = re.exec(code)) out.push(m[1]!);
  return out;
}
const all = files(SRC).map((p) => ({ file: rel(p), code: readFileSync(p, 'utf8') }));

describe('@pixel3d boundary', () => {
  it('only game3d/vendor/** imports @pixel3d/* (statically or dynamically)', () => {
    const bad = all.filter((f) => !f.file.startsWith('game3d/vendor/') && [...staticImports(f.code), ...dynamicImports(f.code)].some((s) => s.startsWith('@pixel3d/')));
    expect(bad.map((f) => f.file)).toEqual([]);
    // and the vendor wrappers really are the importers
    expect(all.filter((f) => staticImports(f.code).some((s) => s.startsWith('@pixel3d/'))).map((f) => f.file).sort()).toEqual(
      expect.arrayContaining(['game3d/vendor/engineHost.ts', 'game3d/vendor/town.ts', 'game3d/vendor/characters.ts']),
    );
  });

  it('three is imported only inside game3d/ (never by the main / lobby code)', () => {
    const bad = all.filter((f) => !f.file.startsWith('game3d/') && staticImports(f.code).some((s) => s === 'three' || s.startsWith('three/')));
    expect(bad.map((f) => f.file)).toEqual([]);
  });

  it('the pure game3d modules import neither three nor @pixel3d (static, unit-testable)', () => {
    for (const name of ['select.ts', 'bootGuard.ts', 'bootMark.ts', 'perf.ts', 'contract.ts', 'coords.ts']) {
      const f = all.find((x) => x.file === `game3d/${name}`)!;
      expect(f, name).toBeTruthy();
      const imps = staticImports(f.code);
      expect(imps.filter((s) => s === 'three' || s.startsWith('three/') || s.startsWith('@pixel3d/')), name).toEqual([]);
      // and only each other / protocol (no lazy game3d module)
      for (const s of imps.filter((x) => x.startsWith('.'))) expect(['./bootGuard', './contract', './coords', './perf', '../game/TownScene', '../game/fx/quality'], `${name} -> ${s}`).toContain(s);
    }
    // select.ts reads FX_QUALITY_KEY from game/fx/quality.ts: that module must stay import-free (main bundle, no three)
    const q = all.find((x) => x.file === 'game/fx/quality.ts')!;
    expect(staticImports(q.code)).toEqual([]);
  });

  it('outside game3d/, game3d is imported statically only via its three-free modules; TownGame3d only via import()', () => {
    const allowed = /game3d\/(select|bootGuard|contract|coords|perf)$/;
    for (const f of all.filter((x) => !x.file.startsWith('game3d/'))) {
      for (const s of staticImports(f.code).filter((x) => x.includes('game3d/'))) expect(s, f.file).toMatch(allowed);
    }
    const dyn = all.filter((f) => dynamicImports(f.code).some((s) => s.endsWith('game3d/TownGame3d'))).map((f) => f.file);
    expect(dyn).toEqual(expect.arrayContaining(['game/GameScreen.tsx']));
  });
});

describe('three pin', () => {
  it('apps/client pins exactly the three version of v3/pixel3d/package.json', () => {
    const client = JSON.parse(readFileSync(path.join(CLIENT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const vendor = JSON.parse(readFileSync(path.join(REPO, 'v3/pixel3d/package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(client.dependencies.three).toMatch(/^\d+\.\d+\.\d+$/); // exact pin, no range
    expect(client.dependencies.three).toBe(vendor.dependencies.three);
  });
  it('Dependabot never bumps three (it must follow the vendor)', () => {
    const y = readFileSync(path.join(REPO, '.github/dependabot.yml'), 'utf8');
    expect(y).toMatch(/ignore:\s*\n\s*- dependency-name: "three"/);
  });
});
