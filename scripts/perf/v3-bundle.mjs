#!/usr/bin/env node
// v3 perf recon (front "load", v3-perf-load). The v3 LOAD PATH as the bundle sees it: what a v3 lobby join downloads
// on top of the lobby, in which chunks, and how much of three.js survives tree-shaking. No product code changes; it
// builds apps/client with its own vite.config.ts into a temp (or --out-dir) directory, like bundle-report.mjs, and
// records per-module rendered bytes per chunk.
//
//   CT_AGENT=v3-perf-load scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock node scripts/perf/v3-bundle.mjs --json /tmp/v3b.json'
//     --json <file>     machine-readable result (budgets: see the `budgets` block printed at the end)
//     --out-dir <dir>   keep the build there (tests/perf/v3-load.ts can serve it via --dist)
//     --three-src       resolve `three` to three/src/Three.js (per-file attribution of what three keeps; the
//                       production build uses build/three.module.js, sizes differ by a few %)
//     --no-minify       readable chunks (module names in profiles)
//     --rtt <ms> --kbps <kbit/s>   network model for the fetch-waterfall estimate (default 150 ms, 1600 = Slow 4G)
//
// Sizes are brotli (zlib default quality 11, as bundle-report.mjs / budgets.mjs). Per-module numbers are the module's
// share of its chunk's rendered (pre-minify) length, scaled to the chunk's brotli size: an ESTIMATE for attribution.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d = null) => (argv.includes(`--${n}`) && argv[argv.indexOf(`--${n}`) + 1] !== undefined ? argv[argv.indexOf(`--${n}`) + 1] : d);
const repo = path.resolve(import.meta.dirname, '../..');
const root = path.join(repo, 'apps/client');
const RTT = Number(arg('rtt', '150'));
const KBPS = Number(arg('kbps', '1600'));
const THREE_SRC = flag('three-src');
const req = createRequire(path.join(root, 'package.json'));
const { build } = await import(req.resolve('vite'));
const threePkg = (() => { let d = path.dirname(req.resolve('three')); while (!existsSync(path.join(d, 'package.json'))) d = path.dirname(d); return d; })();
const outDir = arg('out-dir') ? path.resolve(arg('out-dir')) : mkdtempSync(path.join(tmpdir(), 'ct-v3-bundle-'));
mkdirSync(outDir, { recursive: true });

const chunks = {};
const assets = {};
const t0 = Date.now();
await build({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, reportCompressedSize: false, ...(flag('no-minify') ? { minify: false } : {}) },
  plugins: [
    THREE_SRC && {
      // the config aliases bare `three` to build/three.module.js; re-point that file at the source tree
      name: 'ct-v3-three-src',
      enforce: 'pre',
      async resolveId(source, importer, opts) {
        if (!/[\\/]three[\\/]build[\\/]three\.module\.js$/.test(source)) return null;
        return this.resolve(path.join(threePkg, 'src/Three.js'), importer, { ...opts, skipSelf: true });
      },
    },
    {
      name: 'ct-v3-perf-modules',
      generateBundle(_o, bundle) {
        for (const [file, c] of Object.entries(bundle)) {
          if (c.type === 'asset') {
            assets[file] = { from: (c.originalFileNames ?? []).map((f) => path.relative(repo, path.resolve(root, f))), size: typeof c.source === 'string' ? Buffer.byteLength(c.source) : c.source.length };
            continue;
          }
          const mods = {};
          for (const [id, m] of Object.entries(c.modules)) mods[id] = { r: m.renderedLength, o: m.originalLength };
          chunks[file] = {
            name: c.name,
            isEntry: c.isEntry,
            isDynamicEntry: c.isDynamicEntry,
            facade: c.facadeModuleId ? path.relative(repo, c.facadeModuleId.split('?')[0]) : null,
            imports: c.imports,
            dynamicImports: c.dynamicImports,
            importedAssets: [...(c.viteMetadata?.importedAssets ?? [])],
            importedCss: [...(c.viteMetadata?.importedCss ?? [])],
            modules: mods,
          };
        }
      },
    },
  ].filter(Boolean),
});
const buildMs = Date.now() - t0;

// ------------------------------------------------------------------ sizes
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = {};
for (const p of walk(outDir)) {
  const rel = path.relative(outDir, p).split(path.sep).join('/');
  const buf = readFileSync(p);
  const text = /\.(js|css|json|html|svg|mjs)$/.test(p);
  files[rel] = { raw: buf.length, br: text ? zlib.brotliCompressSync(buf).length : buf.length, text };
}
const KiB = 1024;
const k = (n) => Math.round((n / KiB) * 100) / 100;
const brOf = (f) => files[f]?.br ?? 0;
const rawOf = (f) => files[f]?.raw ?? 0;

// ------------------------------------------------------------------ graph
const closure = (start, seen = new Set()) => {
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !chunks[f]) continue;
    seen.add(f);
    stack.push(...chunks[f].imports);
  }
  return seen;
};
const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));
const sumBr = (set) => [...set].reduce((a, f) => a + brOf(f) + (chunks[f]?.importedCss ?? []).reduce((s, c) => s + brOf(c), 0), 0);
const byModule = (pred) => Object.keys(chunks).find((f) => Object.keys(chunks[f].modules).some(pred)) ?? null;
const rel = (id) => path.relative(repo, id.split('?')[0]).split(path.sep).join('/');

const entry = Object.keys(chunks).find((f) => chunks[f].isEntry) ?? null;
const lobby = Object.keys(chunks).find((f) => /^assets\/LobbyRoute-[^/]+\.js$/.test(f)) ?? null;
const town3d = Object.keys(chunks).find((f) => /^assets\/town3d-[^/]+\.js$/.test(f)) ?? null;
const layoutV3 = byModule((id) => /packages[\\/]assets[\\/]src[\\/]hollowmere[\\/]/.test(id) && !/generated\.json/.test(id)) ?? byModule((id) => /hollowmere/.test(id));
const v3atlas = byModule((id) => /ui[\\/]common[\\/]v3atlas\.ts$/.test(id));
const classic = Object.keys(chunks).find((f) => /^assets\/TownGame-[^/]+\.js$/.test(f)) ?? null;

const L0 = entry ? closure(entry) : new Set();
const L1 = lobby ? closure(lobby, new Set(L0)) : new Set(L0);
const mount = town3d ? minus(closure(town3d), L1) : new Set();
const loadedAtMount = new Set([...L1, ...mount]);

// dynamic chunks reachable from the mount closure (transitively through further dynamic imports)
const dyn = new Map(); // file -> { kind, id }
const kindOf = (facade) => {
  if (!facade) return { kind: 'shared', id: '?' };
  let m;
  if ((m = /v3\/pixel3d\/src\/town\/pieces\/([^/]+)\.js$/.exec(facade))) return { kind: 'piece', id: m[1] };
  if (/v3\/pixel3d\/src\/town\/life\/index\.js$/.test(facade)) return { kind: 'piece', id: 'life' };
  if ((m = /v3\/pixel3d\/src\/town\/interiors\/(house-\d+)\.js$/.exec(facade))) return { kind: 'interior', id: m[1] };
  if ((m = /v3\/pixel3d\/characters\/([^/]+)\.js$/.exec(facade))) return { kind: 'character', id: m[1] };
  if ((m = /v3\/pixel3d\/src\/ambient\/(.+)\.js$/.exec(facade))) return { kind: 'ambient', id: m[1] };
  if ((m = /v3\/pixel3d\/src\/chars\/(.+)\.js$/.exec(facade))) return { kind: 'chars-optional', id: m[1] };
  if (/hollowmere/.test(facade)) return { kind: 'layoutV3', id: 'hollowmere' };
  if (/game3d\//.test(facade)) return { kind: 'game3d', id: facade.replace(/^.*game3d\//, '') };
  if (/v3atlas/.test(facade)) return { kind: 'v3atlas', id: 'v3atlas' };
  return { kind: 'other', id: facade };
};
{
  const queue = [...mount];
  const seen = new Set(queue);
  while (queue.length) {
    const f = queue.shift();
    for (const d of chunks[f]?.dynamicImports ?? []) {
      if (seen.has(d) || L1.has(d)) continue;
      seen.add(d);
      dyn.set(d, kindOf(chunks[d]?.facade));
      for (const s of closure(d)) if (!seen.has(s) && !loadedAtMount.has(s)) { seen.add(s); queue.push(s); if (s !== d && !dyn.has(s)) dyn.set(s, { kind: 'shared', id: s }); }
      queue.push(d);
    }
  }
}
const group = (kind) => [...dyn].filter(([, v]) => v.kind === kind).map(([f, v]) => ({ file: f, id: v.id, br: brOf(f), raw: rawOf(f), sharedBr: sumBr(minus(closure(f), new Set([...loadedAtMount, f]))) }));
const pieces = group('piece').sort((a, b) => b.br - a.br);
const interiors = group('interior').sort((a, b) => b.br - a.br);
const characters = group('character').sort((a, b) => b.br - a.br);
const ambient = group('ambient');
const charsOpt = group('chars-optional');
const sharedLazy = group('shared');
const other = [...group('other'), ...group('game3d')];
const tot = (xs) => xs.reduce((a, x) => a + x.br, 0);

// ------------------------------------------------------------------ attribution
const category = (id) => {
  const r = rel(id);
  let m;
  if ((m = /three\/src\/([^/]+)(?:\/([^/]+))?/.exec(r))) return `three/src/${m[1]}${m[2] && !m[2].endsWith('.js') ? '/' + m[2] : ''}`;
  if (/three\/build\//.test(r)) return 'three (build/three.module.js)';
  if ((m = /three\/examples\/jsm\/(.+)$/.exec(r))) return `three/addons/${m[1]}`;
  if ((m = /v3\/pixel3d\/src\/([^/]+)(?:\/([^/]+))?/.exec(r))) return `pixel3d/${m[1]}${m[2] && !m[2].endsWith('.js') ? '/' + m[2] : ''}`;
  if (/v3\/pixel3d\/characters\//.test(r)) return 'pixel3d/characters';
  if ((m = /apps\/client\/src\/game3d\/([^/]+)/.exec(r))) return `game3d/${m[1].endsWith('.ts') ? '(root)' : m[1]}`;
  if ((m = /apps\/client\/src\/([^/]+\/[^/]+)/.exec(r))) return `client/${m[1]}`;
  if ((m = /packages\/([^/]+)/.exec(r))) return `packages/${m[1]}`;
  if ((m = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(r))) return m[1];
  return r.slice(-60);
};
const attribute = (set) => {
  const out = {};
  const mods = {};
  for (const f of set) {
    const c = chunks[f];
    if (!c) continue;
    const sum = Object.values(c.modules).reduce((a, m) => a + m.r, 0) || 1;
    for (const [id, m] of Object.entries(c.modules)) {
      const est = (brOf(f) * m.r) / sum;
      const cat = category(id);
      out[cat] = (out[cat] ?? 0) + est;
      mods[rel(id)] = { br: est, rendered: m.r, original: m.o };
    }
  }
  return { cats: Object.entries(out).sort((a, b) => b[1] - a[1]), mods };
};
const mountAttr = attribute(mount);
const piecesAttr = attribute(new Set([...dyn].filter(([, v]) => v.kind === 'piece' || v.kind === 'shared').map(([f]) => f)));

// three: how much of the library survives
const threeMods = Object.entries({ ...mountAttr.mods, ...piecesAttr.mods }).filter(([id]) => /node_modules\/.*three\//.test(id) || /\/three\/(src|build|examples)\//.test(id));
const threeSummary = {
  mode: THREE_SRC ? 'src' : 'build',
  modules: threeMods.length,
  renderedKiB: k(threeMods.reduce((a, [, m]) => a + m.rendered, 0)),
  originalKiB: k(threeMods.reduce((a, [, m]) => a + m.original, 0)),
  estBrKiB: k(threeMods.reduce((a, [, m]) => a + m.br, 0)),
  addons: threeMods.filter(([id]) => /examples\/jsm/.test(id)).map(([id, m]) => ({ id: id.replace(/^.*examples\/jsm\//, ''), estBrKiB: k(m.br) })),
};
// three/src mode: which top-level areas are pulled in (the tree-shaking question)
const threeAreas = {};
for (const [id, m] of threeMods) {
  const mm = /three\/src\/([^/]+\/?[^/]*)/.exec(id);
  const area = mm ? mm[1].replace(/\/[^/]+\.js$/, '').replace(/\.js$/, '') : /examples\/jsm/.test(id) ? 'addons' : 'build';
  (threeAreas[area] ??= { n: 0, br: 0, rendered: 0 });
  threeAreas[area].n++;
  threeAreas[area].br += m.br;
  threeAreas[area].rendered += m.rendered;
}

// ------------------------------------------------------------------ assets
const v3Assets = Object.entries(assets).filter(([, a]) => a.from.some((f) => /^v3\//.test(f))).map(([f, a]) => ({ file: f, from: a.from[0], raw: rawOf(f), br: files[f]?.text ? brOf(f) : null }));
const mountAssets = new Set([...mount, ...dyn.keys(), ...(layoutV3 ? closure(layoutV3) : []), ...(v3atlas ? closure(v3atlas) : [])].flatMap((f) => chunks[f]?.importedAssets ?? []));
const rawCharacterJs = Object.keys(assets).filter((f) => /\.m?js$/.test(f));
const harness = Object.keys(files).filter((f) => /v3-harness|(^|\/)harness\//.test(f));
const threeCopies = new Set(Object.values(chunks).flatMap((c) => Object.keys(c.modules)).map((id) => /^(.*[\\/]three)[\\/](build|src)[\\/]/.exec(id)?.[1]).filter(Boolean));
const leaks = {};
for (const [name, f] of [['entry', entry], ['LobbyRoute', lobby]]) {
  if (!f) continue;
  const bad = [...closure(f)].flatMap((x) => Object.keys(chunks[x].modules)).map(rel).filter((id) => /three\/|v3\/pixel3d|game3d\/(?!select\.ts|bootGuard\.ts)/.test(id));
  leaks[name] = bad;
}

// ------------------------------------------------------------------ fetch waterfall model
// GameScreen imports town3d (Vite preloads its static deps in parallel); buildTown then imports each BUILD_ORDER piece
// one after another (`for … await buildPiece`): every piece chunk is a serial round trip unless prefetched.
const bw = (KBPS * 1000) / 8; // bytes/s
const xfer = (b) => (b / bw) * 1000;
const mountBytes = sumBr(mount);
const pieceBytes = pieces.map((p) => p.br + p.sharedBr);
const model = {
  rttMs: RTT,
  kbps: KBPS,
  mountMs: Math.round(RTT + xfer(mountBytes)),
  piecesSerialMs: Math.round(pieceBytes.reduce((a, b) => a + RTT + xfer(b), 0)),
  piecesParallelMs: Math.round(RTT + xfer(pieceBytes.reduce((a, b) => a + b, 0))),
  layoutMs: layoutV3 ? Math.round(RTT + xfer(sumBr(minus(closure(layoutV3), L1)))) : null,
};

const summary = {
  tree: { root: repo, buildMs, threeMode: THREE_SRC ? 'src' : 'build', minify: !flag('no-minify') },
  entryBrKiB: entry ? k(brOf(entry)) : null,
  lobbyChunkBrKiB: lobby ? k(brOf(lobby)) : null,
  classicTownBrKiB: classic ? k(brOf(classic)) : null,
  town3dChunkBrKiB: town3d ? k(brOf(town3d)) : null,
  town3dMountBrKiB: k(mountBytes),
  town3dMountChunks: [...mount].map((f) => ({ file: f, brKiB: k(brOf(f)) })),
  v3LayoutBrKiB: layoutV3 ? k(sumBr(minus(closure(layoutV3), L1))) : null,
  v3atlasBrKiB: v3atlas ? k(sumBr(minus(closure(v3atlas), L1))) : null,
  piecesBrKiB: k(tot(pieces)),
  piecesCount: pieces.length,
  interiorsBrKiB: k(tot(interiors)),
  interiorsCount: interiors.length,
  maxInteriorBrKiB: interiors.length ? k(interiors[0].br) : null,
  charactersBrKiB: k(tot(characters)),
  charactersCount: characters.length,
  maxCharacterBrKiB: characters.length ? k(characters[0].br) : null,
  maxCharacterId: characters[0]?.id ?? null,
  ambientBrKiB: k(tot(ambient)),
  charsOptionalBrKiB: k(tot(charsOpt)),
  sharedLazyBrKiB: k(tot(sharedLazy)),
  otherLazy: other.map((x) => ({ id: x.id, brKiB: k(x.br) })),
  lazyTownTotalBrKiB: k(tot(pieces) + tot(interiors) + tot(ambient) + tot(sharedLazy) + tot(charsOpt)),
  v3Assets: { count: v3Assets.length, rawKiB: k(v3Assets.reduce((a, x) => a + x.raw, 0)), referencedByV3Chunks: mountAssets.size, files: v3Assets.sort((a, b) => b.raw - a.raw).map((x) => ({ ...x, rawKiB: k(x.raw), brKiB: x.br == null ? null : k(x.br) })) },
  checks: { rawJsAssets: rawCharacterJs, threeCopies: [...threeCopies].map(rel), harnessFiles: harness, leaks },
  three: { ...threeSummary, areas: Object.entries(threeAreas).sort((a, b) => b[1].br - a[1].br).map(([a, v]) => ({ area: a, modules: v.n, estBrKiB: k(v.br), renderedKiB: k(v.rendered) })) },
  mountAttribution: mountAttr.cats.map(([c, v]) => ({ cat: c, estBrKiB: k(v) })),
  piecesAttribution: piecesAttr.cats.slice(0, 30).map(([c, v]) => ({ cat: c, estBrKiB: k(v) })),
  pieces: pieces.map((p) => ({ id: p.id, brKiB: k(p.br), sharedBrKiB: k(p.sharedBr) })),
  interiors: interiors.map((p) => ({ id: p.id, brKiB: k(p.br) })),
  characters: characters.map((p) => ({ id: p.id, brKiB: k(p.br) })),
  sharedLazy: sharedLazy.map((p) => ({ file: p.file, brKiB: k(p.br) })),
  model,
  topMountModules: Object.entries(mountAttr.mods).sort((a, b) => b[1].br - a[1].br).slice(0, 40).map(([id, m]) => ({ id, estBrKiB: k(m.br), renderedKiB: k(m.rendered) })),
};

// ------------------------------------------------------------------ print
const pad = (s, n) => String(s).padEnd(n);
const num = (v) => (v == null ? '—' : String(v)).padStart(9);
console.log(`\n# v3 load path (brotli KiB) — ${repo} — build ${buildMs} ms, three=${summary.tree.threeMode}${summary.tree.minify ? '' : ', unminified'}`);
for (const key of ['entryBrKiB', 'lobbyChunkBrKiB', 'classicTownBrKiB', 'town3dChunkBrKiB', 'town3dMountBrKiB', 'v3LayoutBrKiB', 'v3atlasBrKiB', 'piecesBrKiB', 'piecesCount', 'interiorsBrKiB', 'interiorsCount', 'maxInteriorBrKiB', 'charactersBrKiB', 'charactersCount', 'maxCharacterBrKiB', 'ambientBrKiB', 'charsOptionalBrKiB', 'sharedLazyBrKiB', 'lazyTownTotalBrKiB'])
  console.log(`${pad(key, 22)} ${num(summary[key])}`);
console.log(`largest character: ${summary.maxCharacterId}`);
console.log('\n# mount closure (town3d + new static deps)');
for (const c of summary.town3dMountChunks) console.log(`  ${pad(c.file, 44)} ${num(c.brKiB)}`);
console.log('\n# mount attribution (est. br KiB)');
for (const c of summary.mountAttribution.slice(0, 30)) console.log(`  ${num(c.estBrKiB)}  ${c.cat}`);
console.log(`\n# three (${threeSummary.mode}): ${threeSummary.modules} module(s), rendered ${threeSummary.renderedKiB} of ${threeSummary.originalKiB} KiB original, est ${threeSummary.estBrKiB} KiB br`);
for (const a of summary.three.areas.slice(0, 40)) console.log(`  ${num(a.estBrKiB)}  ${pad(a.area, 34)} ${String(a.modules).padStart(4)} mod  ${a.renderedKiB} KiB rendered`);
for (const a of threeSummary.addons) console.log(`  addon ${a.id} ${a.estBrKiB}`);
console.log('\n# pieces (BUILD_ORDER, all loaded before the first frame)');
for (const p of summary.pieces) console.log(`  ${pad(p.id, 14)} ${num(p.brKiB)}  +shared ${p.sharedBrKiB}`);
console.log('\n# lazy shared chunks');
for (const p of summary.sharedLazy) console.log(`  ${pad(p.file, 44)} ${num(p.brKiB)}`);
console.log('\n# interiors / characters (top 5)');
for (const p of summary.interiors.slice(0, 5)) console.log(`  ${pad(p.id, 14)} ${num(p.brKiB)}`);
for (const p of summary.characters.slice(0, 5)) console.log(`  ${pad(p.id, 14)} ${num(p.brKiB)}`);
console.log(`\n# v3 assets: ${summary.v3Assets.count} files, ${summary.v3Assets.rawKiB} KiB raw`);
for (const a of summary.v3Assets.files.slice(0, 20)) console.log(`  ${pad(a.file, 48)} ${num(a.rawKiB)} raw ${a.brKiB == null ? '' : `${a.brKiB} br`}  <- ${a.from}`);
console.log('\n# checks');
console.log(`  raw .js assets: ${rawCharacterJs.length}  three copies: ${threeCopies.size}  harness files: ${harness.length}`);
for (const [n, l] of Object.entries(leaks)) console.log(`  ${n} closure v3 modules: ${l.length ? l.join(', ') : 'none'}`);
console.log(`\n# fetch model (RTT ${RTT} ms, ${KBPS} kbit/s): mount ${model.mountMs} ms; pieces serial ${model.piecesSerialMs} ms vs parallel ${model.piecesParallelMs} ms; layout ${model.layoutMs} ms`);
console.log('\n# top mount modules (est br KiB)');
for (const m of summary.topMountModules.slice(0, 25)) console.log(`  ${num(m.estBrKiB)}  ${m.id}`);
const j = arg('json');
if (j) {
  mkdirSync(path.dirname(path.resolve(j)), { recursive: true });
  writeFileSync(j, JSON.stringify({ at: new Date().toISOString(), outDir, summary, chunks: Object.fromEntries(Object.entries(chunks).map(([f, c]) => [f, { ...c, modules: Object.keys(c.modules).length, br: brOf(f), raw: rawOf(f) }])) }, null, 1));
  console.log(`\nwrote ${j}`);
}
console.log(`dist: ${outDir}`);
