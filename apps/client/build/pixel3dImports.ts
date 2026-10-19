// v3 WP0 (v3-lead). Build-time rewrites of the read-only pixel3d vendor tree (v3/pixel3d/src) so it bundles
// correctly, plus bundle assertions (docs/v3/INTEGRATION.md §1.3 step 3). Pattern: cssOrder() — patch a
// KNOWN snippet and FAIL THE BUILD when it is missing, so a vendor re-publish that changes it is caught
// instead of silently shipping broken behaviour. Never edit v3/pixel3d/** itself.
//
//   town/api.js buildPiece        `await import(PATHS(id))` (variable import: Vite cannot see the pieces) ->
//                                 a glob map injected INTO api.js (globs are relative to the file they are in)
//   demo/characters.js optional() `import(p)` (variable) -> a static map of the two optional modules
//   demo/characters.js sourcePrint `new URL('../../characters/${id}.js', import.meta.url)` would emit every
//                                 character source as a raw asset -> `return null` (the game has no roster cache)
//   demo/roster.js loadRoster     `fetch(new URL('./roster.json', import.meta.url))` -> a static JSON import of a
//                                 TRIMMED roster (`roster.json?ct-trim`: id, name and the offer flags of each row; the
//                                 game reads only `name`, demo/characters.js createCharacter): −9 KiB br off town3d
//   town/pieces/ground.js         `viewArea(engine, 3)` -> `engine.__ctGrassArea ?? viewArea(engine, 3)` (the grass
//                                 area; replaces the demo's stack-sniffing buildWide, which breaks once minified)
//   world/trees.js createTree     (v3.3 bake) replay of baked createTree output via globalThis.__ctTreeBake
//                                 (build/townBake.ts; createTree's source is pinned: a vendor change fails the build)
// Bundle checks (generateBundle): exactly one three/build/ directory in the bundle; no emitted asset matches
// characters/*.js; every patch target that is bundled was patched.
// CONTRACT-REQUEST(pixel3d): static imports / options for all of these (§9.2), so these rewrites can go.
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { patchTrees } from './townBake';

export interface Patch {
  /** Module path relative to v3/pixel3d/src/. */
  file: string;
  /** What it fixes (error messages). */
  what: string;
  apply(code: string): string | null;
}

const once = (code: string, find: string, replace: string): string | null => {
  const i = code.indexOf(find);
  if (i < 0 || code.indexOf(find, i + find.length) >= 0) return null;
  return code.slice(0, i) + replace + code.slice(i + find.length);
};

/** Insert `line` after the last top-level `import … from '…';` statement (or at the top). */
const afterImports = (code: string, line: string): string => {
  const re = /^import[^\n]*?from\s+['"][^'"]+['"];?[^\n]*$/gm;
  let end = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) end = m.index + m[0].length;
  return end ? `${code.slice(0, end)}\n${line}${code.slice(end)}` : `${line}\n${code}`;
};

export const PATCHES: readonly Patch[] = [
  {
    file: 'town/api.js',
    what: 'buildPiece: await import(PATHS(id)) -> static piece map',
    apply(code) {
      const out = once(code, 'const mod = await import(PATHS(id));', 'const mod = await __ctPieces[PATHS(id)]();');
      if (!out || !code.includes("const PATHS = (id) => (id === 'life' ? './life/index.js' : `./pieces/${id}.js`);")) return null;
      return afterImports(out, "const __ctPieces = import.meta.glob(['./pieces/*.js', './life/index.js']); // (clocktower town: build/pixel3dImports.ts)");
    },
  },
  {
    file: 'demo/characters.js',
    what: 'optional(p): variable import -> static map; sourcePrint -> null',
    apply(code) {
      if (!code.includes("optional('../chars/smear.js')") || !code.includes("optional('../chars/fx.js')")) return null;
      let out = once(
        code,
        'const optional = async (p) => { try { return await import(p); }',
        "const __ctOptional = { '../chars/smear.js': () => import('../chars/smear.js'), '../chars/fx.js': () => import('../chars/fx.js') }; // (clocktower town: build/pixel3dImports.ts)\nconst optional = async (p) => { try { if (!__ctOptional[p]) throw new Error(`unknown optional module ${p}`); return await __ctOptional[p](); }",
      );
      if (!out) return null;
      const head = 'async function sourcePrint(id) {';
      const i = out.indexOf(head);
      if (i < 0 || out.indexOf(head, i + 1) >= 0) return null;
      const j = out.indexOf('\n}\n', i);
      if (j < 0 || !out.slice(i, j).includes('new URL(`../../characters/${id}.js`, import.meta.url)')) return null;
      out = `${out.slice(0, i)}${head}\n  void id;\n  return null; // (clocktower town: no roster check cache; build/pixel3dImports.ts)${out.slice(j)}`;
      return out;
    },
  },
  {
    file: 'demo/roster.js',
    what: "loadRoster: fetch(new URL('./roster.json')) -> static import",
    apply(code) {
      const out = once(
        code,
        "await fetch(new URL('./roster.json', import.meta.url), { cache: 'no-cache' })",
        '({ ok: true, status: 200, json: async () => structuredClone(__ctRoster) })',
      );
      if (!out) return null;
      return `import __ctRoster from './roster.json${ROSTER_TRIM}'; // (clocktower town: build/pixel3dImports.ts)\n${out}`;
    },
  },
  {
    // (v3.1 fixes) a remount leak: V8 shares one DescriptorArray along a map transition chain, and the AllocationSite
    // boilerplate of `const stats = {…}` in life build() keeps that chain's map alive for the life of the module; the
    // `at` accessor's getter closure sat in it and held build()'s whole scope (engine, registry, door anchors, the
    // render pipeline): one full town (~80-95 MB JS heap) stayed alive after every later destroy (harness cycles:
    // tests/perf/v3-cycles-heap.ts). The getter is now module-level (no scope) and finds its per-build closure in a
    // WeakMap keyed by the stats object. CONTRACT-REQUEST(pixel3d): the same in town/life/index.js.
    file: 'town/life/index.js',
    what: "stats 'at' getter closure -> module-level getter + WeakMap",
    apply(code) {
      const out = once(
        code,
        "  Object.defineProperty(stats, 'at', { enumerable: true, configurable: true,\n    get: () => walkers.map((w) => [w.name, ...w.at(lastTl).toArray().map((v) => +v.toFixed(2))]) });",
        "  __ctLifeAt.set(stats, () => walkers.map((w) => [w.name, ...w.at(lastTl).toArray().map((v) => +v.toFixed(2))]));\n  Object.defineProperty(stats, 'at', { enumerable: true, configurable: true, get: __ctLifeAtGet });",
      );
      if (!out) return null;
      return afterImports(out, 'const __ctLifeAt = new WeakMap(); function __ctLifeAtGet() { return __ctLifeAt.get(this)?.() ?? null; } // (clocktower town: build/pixel3dImports.ts)');
    },
  },
  {
    file: 'town/pieces/ground.js',
    what: 'grass area: viewArea(engine, 3) -> engine.__ctGrassArea ?? …',
    apply(code) {
      return once(code, 'const ga = viewArea(engine, 3);', 'const ga = engine.__ctGrassArea ?? viewArea(engine, 3);');
    },
  },
  {
    // (v3.3 bake) createTree replays baked output when globalThis.__ctTreeBake has the call (build/townBake.ts)
    file: 'world/trees.js',
    what: 'createTree: baked-output replay hook (createTree source pinned in build/townBake.ts CREATE_TREE_PIN)',
    apply: patchTrees,
  },
];

const VENDOR_SRC = /[\\/]v3[\\/]pixel3d[\\/]src[\\/](.+)$/;

/** Query of the trimmed roster import (served by the plugin's load hook as JSON; Vite's JSON plugin makes the module). */
export const ROSTER_TRIM = '?ct-trim';
/** Roster row fields kept: what demo/roster.js (offer rules) and demo/characters.js createCharacter (name) read. */
const ROSTER_ROW_KEYS = ['id', 'name', 'status', 'shipped', 'finished', 'playable', 'offered', 'complete', 'wipOffered'] as const;

/** The roster manifest without the per-character build / critic notes (JSON text). */
export function trimRoster(json: string): string {
  const m = JSON.parse(json) as { version?: unknown; generated?: unknown; generator?: unknown; characters?: Record<string, unknown>[] };
  const characters = (Array.isArray(m.characters) ? m.characters : []).map((c) => {
    const row: Record<string, unknown> = {};
    for (const k of ROSTER_ROW_KEYS) if (c[k] !== undefined) row[k] = c[k];
    return row;
  });
  return JSON.stringify({ version: m.version, generated: m.generated, generator: m.generator, characters });
}

/** The vendor path (relative to v3/pixel3d/src) of a module id, or null. */
export function vendorPath(id: string): string | null {
  const m = VENDOR_SRC.exec(id.split('?')[0]!);
  return m ? m[1]!.replace(/\\/g, '/') : null;
}

/** Apply the patch for a vendor module. null = not a patch target; throws when the snippet is missing. */
export function patchVendor(id: string, code: string): string | null {
  const rel = vendorPath(id);
  if (!rel) return null;
  const p = PATCHES.find((x) => x.file === rel);
  if (!p) return null;
  const out = p.apply(code);
  if (out === null) throw new Error(`pixel3d-imports: v3/pixel3d/src/${p.file} changed (${p.what}): the known snippet is missing; update apps/client/build/pixel3dImports.ts`);
  return out;
}

/** Directories of every bundled three/build/ module (more than one = two copies of three). */
export function threeBuildDirs(moduleIds: Iterable<string>): string[] {
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const m = /^(.*[\\/]three[\\/]build)[\\/][^\\/]+$/.exec(id.split('?')[0]!);
    if (m) dirs.add(m[1]!);
  }
  return [...dirs];
}

/**
 * Emitted ASSETS (not chunks) that are .js files: a `new URL('…/x.js', import.meta.url)` (e.g. sourcePrint's
 * characters/<id>.js) is emitted as a raw asset, which is never what the game wants.
 */
export function rawJsAssets(assetFileNames: Iterable<string>): string[] {
  return [...assetFileNames].filter((f) => /\.m?js$/.test(f));
}

export function pixel3dImports(): Plugin {
  const patched = new Set<string>();
  return {
    name: 'ct-pixel3d-imports',
    enforce: 'pre',
    load(id) {
      // demo/roster.js imports './roster.json?ct-trim' (the patch above): hand Vite the trimmed JSON text
      if (!id.endsWith(`roster.json${ROSTER_TRIM}`) || vendorPath(id.slice(0, -ROSTER_TRIM.length)) !== 'demo/roster.json') return null;
      const file = id.slice(0, -ROSTER_TRIM.length);
      this.addWatchFile(file);
      return trimRoster(readFileSync(file, 'utf8'));
    },
    transform(code, id) {
      let out: string | null;
      try {
        out = patchVendor(id, code);
      } catch (e) {
        this.error((e as Error).message);
      }
      if (out === null) return null;
      patched.add(vendorPath(id)!);
      return { code: out, map: null };
    },
    generateBundle(_o, bundle) {
      const errors: string[] = [];
      const ids = new Set<string>();
      for (const c of Object.values(bundle)) if (c.type === 'chunk') for (const m of c.moduleIds) ids.add(m);
      const dirs = threeBuildDirs(ids);
      if (dirs.length > 1) errors.push(`more than one copy of three in the bundle: ${dirs.join(', ')}`);
      const bundledVendor = new Set([...ids].map(vendorPath).filter((p): p is string => !!p));
      for (const p of PATCHES) if (bundledVendor.has(p.file) && !patched.has(p.file)) errors.push(`v3/pixel3d/src/${p.file} was bundled without its patch (${p.what})`);
      const raw = rawJsAssets(Object.values(bundle).filter((a) => a.type === 'asset').map((a) => a.fileName));
      if (raw.length) errors.push(`raw .js assets emitted (character sources?): ${raw.join(', ')}`);
      if (errors.length) this.error(`ct-pixel3d-imports:\n  ${errors.join('\n  ')}`);
    },
  };
}
