#!/usr/bin/env node
// v3.3 perf (v33-bake), docs/perf-v3/bake.md. BUILD-TIME TOWN BAKE: runs the pixel3d town build headless in Node
// (stub engine, the exporter's technique: scripts/v3/export-hollowmere.mjs) with the createTree replay patch
// (apps/client/build/townBake.ts) in RECORD mode, and writes every createTree call's output data, keyed by its
// options + the build texel size, into one binary (gzip) the client replays at join (vendor/townBake.ts).
//
//   node scripts/v3/bake-town.mjs --out <dir>             write <dir>/town-bake.bin.gz + town-bake.json
//   node scripts/v3/bake-town.mjs --verify                bake, then replay EVERY key through the patched createTree
//                                                         and compare it with the live output (bit-exact): exit 1 on drift
//   --lowH=360,300   build texel sizes (camera lowH at viewHeight 12) to bake; --quality=high,low; --tod=noon,...
//
// Plain Node 24 (type stripping: the .ts helpers are imported directly). Never run from the client bundle.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VENDOR = path.join(ROOT, 'v3/pixel3d');
const THREE_DIR = path.join(ROOT, 'apps/client/node_modules/three');
const SELF = 'scripts/v3/bake-town.mjs';
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const VERIFY = process.argv.includes('--verify');
const OUT = arg('out', null) ?? (process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null);
const LOWH = arg('lowH', '360,300').split(',').map(Number);
const QUALITIES = arg('quality', 'high,low').split(',');
const TODS = arg('tod', 'noon,morning,golden,afternoon,night').split(',');

let patchTrees = null; // apps/client/build/townBake.ts (imported once the hooks below are registered)
const vendorFiles = new Set();
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: pathToFileURL(path.join(THREE_DIR, 'build/three.module.js')).href, shortCircuit: true };
    const m = /^three\/addons\/(.*)$/.exec(spec);
    if (m) return { url: pathToFileURL(path.join(THREE_DIR, 'examples/jsm', m[1])).href, shortCircuit: true };
    // the .ts helpers import each other without an extension (bundler resolution)
    if (spec.startsWith('.') && !path.extname(spec) && ctx.parentURL?.endsWith('.ts')) return next(`${spec}.ts`, ctx);
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    const r = next(url, ctx);
    if (!url.startsWith('file:')) return r;
    const p = fileURLToPath(url);
    if (!p.startsWith(VENDOR + path.sep)) return r;
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    vendorFiles.add(rel);
    if (rel !== 'v3/pixel3d/src/world/trees.js') return r;
    const out = patchTrees(String(r.source));
    if (out === null) throw new Error('bake-town: v3/pixel3d/src/world/trees.js createTree changed (pinned in apps/client/build/townBake.ts): re-verify __ctAssembleTree, then re-pin');
    return { ...r, source: out };
  },
});
({ patchTrees } = await import(pathToFileURL(path.join(ROOT, 'apps/client/build/townBake.ts')).href));
const fmt = await import(pathToFileURL(path.join(ROOT, 'apps/client/src/game3d/vendor/bakeFormat.ts')).href);
// the client's own recorder + replay (vendor/townBake.ts): --verify checks the code the game runs
const client = await import(pathToFileURL(path.join(ROOT, 'apps/client/src/game3d/vendor/townBake.ts')).href);
const THREE = await import('three');
const V = (p) => import(pathToFileURL(path.join(VENDOR, 'src', p)).href);
const api = await V('town/api.js');
const town = await V('town/town.js');
const layout = await V('town/layout.js');
const { PixelCamera } = await V('core/PixelCamera.js');
await V('world/trees.js');
const threeVersion = JSON.parse(readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version;

// ------------------------------------------------------------------------------------------------ stub engine
/** A headless engine the town pieces accept (geometry only, no WebGL): the game's camera preset at the square. */
function stubEngine(lowH) {
  const uniforms = new Proxy({}, { get: (t, k) => (t[k] ??= { value: k === 'uSunDir' ? new THREE.Vector3(0, 1, 0) : /^uCamera|Dir$|Pos$/.test(k) ? new THREE.Vector3() : 0 }) });
  const lowW = Math.ceil((lowH * 16) / 9);
  const engine = {
    toonUniforms: {}, uniforms, params: new URLSearchParams(), scene: new THREE.Scene(), stats: {}, updaters: [], lowW, lowH,
    onUpdate(fn) { this.updaters.push(fn); },
    pipeline: { preRender: [], passes: [], size: new THREE.Vector2(lowW, lowH), makeLowresMaterial: (o) => new THREE.ShaderMaterial({ uniforms: o.uniforms }), getPass: () => null, addPass: (p) => ({ enabled: true, ...p }) },
  };
  engine.camera = new PixelCamera(engine);
  engine.camera.resize(lowW, lowH);
  // = vendor/town.ts buildHollowmere: the gameplay preset focused on the plaza, the demo's grass area
  api.applyCamera(engine, 'gameplay', { focus: new THREE.Vector3(layout.PLAZA.cx, 0, layout.PLAZA.cz) });
  engine.__ctGrassArea = { x0: -2, x1: 47, z0: 3, z1: 41.5 };
  return engine;
}

async function buildAll(engine, quality, tod) {
  const params = new URLSearchParams({ tod, quality, life: '1', demo: 'day' });
  const registry = new api.Registry();
  for (const id of town.BUILD_ORDER) {
    if (id === 'life') continue;
    const ctx = api.makeCtx(engine, id, { registry, tod, params });
    registry.add(id, await api.buildPiece(engine, id, ctx, { strict: true }));
  }
  return registry;
}

// ------------------------------------------------------------------------------------------------ record
const rec = new client.TreeRecorder();
const live = new Map(); // key -> { engine, opts } of its first call (verify)
let calls = 0;
globalThis.__ctTreeBake = {
  get: () => null,
  put(engine, opts, g) {
    calls++;
    const key = fmt.treeKey(opts, engine.camera.texelWorld);
    const had = !!rec.keys[key];
    rec.put(engine, opts, g);
    if (!rec.keys[key]) throw new Error(`bake-town: the recorder skipped a tree (${key.slice(0, 100)})`);
    if (VERIFY && !had) live.set(key, { engine, opts: { ...opts } });
  },
};
const keys = rec.keys;

const t0 = performance.now();
const combos = [];
for (const lowH of LOWH)
  for (const quality of QUALITIES)
    for (const tod of TODS) {
      const before = Object.keys(keys).length, c0 = calls, a = performance.now();
      await buildAll(stubEngine(lowH), quality, tod);
      combos.push({ lowH, quality, tod, calls: calls - c0, newKeys: Object.keys(keys).length - before, ms: Math.round(performance.now() - a) });
    }
const bakeMs = Math.round(performance.now() - t0);

// ------------------------------------------------------------------------------------------------ vendor hash
// every vendor file the town build loaded + the patch / format / this script + three: a change in any of them
// changes the hash (vite plugin: rebuild the bake; client: refuse a bake built from another tree)
const hashFiles = [...vendorFiles].sort();
const own = ['apps/client/build/townBake.ts', 'apps/client/src/game3d/vendor/bakeFormat.ts', SELF];
const h = createHash('sha256');
for (const f of [...hashFiles, ...own]) h.update(`${f}\n`).update(readFileSync(path.join(ROOT, f))).update('\n');
h.update(`three@${threeVersion}\n`);
const vendorHash = h.digest('hex').slice(0, 32);
const header = { v: 1, vendorHash, generator: SELF, three: threeVersion, keys };
const bin = fmt.encodeBake(header, rec.body.bytes());
const gz = gzipSync(bin, { level: 9 });
const leafTotal = Object.values(keys).reduce((a, k) => a + k.leaves.n, 0);
const summary = { vendorHash, keys: Object.keys(keys).length, calls, leaves: leafTotal, rawBytes: bin.byteLength, gzBytes: gz.byteLength, bakeMs, lowH: LOWH, qualities: QUALITIES, tods: TODS, combos };

// ------------------------------------------------------------------------------------------------ bench
// --bench: the whole town build (all pieces but life) live vs with every createTree replayed, per combo
if (process.argv.includes('--bench')) {
  const dec = fmt.decodeBake(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const replay = client.replayFrom(dec);
  const rows = [];
  for (const lowH of LOWH) for (const quality of QUALITIES) {
    const tod = TODS[0];
    const run = async (hook) => { globalThis.__ctTreeBake = hook; const a = performance.now(); await buildAll(stubEngine(lowH), quality, tod); globalThis.__ctTreeBake = null; return Math.round(performance.now() - a); };
    await run(null); // warm the JIT
    const liveMs = await run(null);
    let hits = 0;
    const repMs = await run({ get: (e, o) => { const r = replay(e, o); if (r) hits++; return r; } });
    rows.push({ lowH, quality, liveMs, replayMs: repMs, hits });
  }
  summary.bench = rows;
}

// ------------------------------------------------------------------------------------------------ verify
if (VERIFY) {
  const dec = fmt.decodeBake(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const { createTree } = await V('world/trees.js');
  const replay = client.replayFrom(dec);
  let bad = 0;
  const diff = (a, b, where) => {
    if (bad > 20) return;
    const msg = compareGroups(a, b);
    if (msg) { bad++; console.error(`DRIFT ${where}: ${msg}`); }
  };
  const fwd45 = new THREE.Vector3(-Math.cos(Math.PI / 6) * Math.sin(Math.PI / 4), -Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4));
  for (const [key, { engine, opts }] of live) {
    const s0 = engine._treeSorters?.length ?? 0;
    globalThis.__ctTreeBake = null;
    const g = createTree(engine, opts); // live (sorter s0)
    globalThis.__ctTreeBake = { get: (e, o) => replay(e, o) };
    const r = createTree(engine, opts); // replayed (sorter s0 + 1)
    globalThis.__ctTreeBake = null;
    diff(g, r, key.slice(0, 120));
    // the replayed sorter re-sorts like the live one (the vote camera's 45-degree yaw)
    const [ls, rs] = [engine._treeSorters[s0], engine._treeSorters[s0 + 1]];
    if (!ls || !rs) { bad++; console.error(`DRIFT ${key.slice(0, 80)}: sorter not registered`); continue; }
    ls(fwd45); rs(fwd45);
    diff(g, r, `${key.slice(0, 80)} (re-sorted, yaw 45)`);
    engine._treeSorters.length = s0;
  }
  summary.verified = live.size;
  summary.drift = bad;
  console.log(JSON.stringify(summary, null, 1));
  process.exit(bad ? 1 : 0);
}

if (OUT) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'town-bake.bin.gz'), gz);
  writeFileSync(path.join(OUT, 'town-bake.json'), JSON.stringify({ vendorHash, vendorFiles: [...hashFiles, ...own], three: threeVersion, keys: summary.keys, rawBytes: bin.byteLength, gzBytes: gz.byteLength }, null, 1) + '\n');
}
console.log(JSON.stringify(summary));

// ------------------------------------------------------------------------------------------------ helpers (verify)
function compareGroups(a, b) {
  if (a.name !== b.name) return `name ${a.name} / ${b.name}`;
  if (!a.position.equals(b.position)) return 'position';
  if (a.children.length !== b.children.length) return `children ${a.children.map((c) => c.name)} / ${b.children.map((c) => c.name)}`;
  if (JSON.stringify(a.userData.tree) !== JSON.stringify(b.userData.tree)) return 'userData.tree';
  for (let i = 0; i < a.children.length; i++) {
    const x = a.children[i], y = b.children[i];
    for (const k of ['name', 'castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled', 'visible']) if (x[k] !== y[k]) return `${x.name}.${k}`;
    if (x.material !== y.material) return `${x.name}.material (not the shared cached material)`;
    const gx = x.geometry, gy = y.geometry;
    if (gx.isInstancedBufferGeometry !== gy.isInstancedBufferGeometry || gx.instanceCount !== gy.instanceCount) return `${x.name} instancing`;
    const ka = Object.keys(gx.attributes), kb = Object.keys(gy.attributes);
    if (ka.join() !== kb.join()) return `${x.name} attributes ${ka} / ${kb}`;
    for (const k of ka) {
      const p = gx.attributes[k], q = gy.attributes[k];
      if (p.itemSize !== q.itemSize || !!p.normalized !== !!q.normalized || p.constructor !== q.constructor || p.array.constructor !== q.array.constructor) return `${x.name}.${k} type`;
      if (!bytesEqual(p.array, q.array)) return `${x.name}.${k} data`;
    }
    if (!!gx.index !== !!gy.index || (gx.index && !bytesEqual(gx.index.array, gy.index.array))) return `${x.name} index`;
    if (JSON.stringify(gx.boundingSphere) !== JSON.stringify(gy.boundingSphere) || JSON.stringify(gx.boundingBox) !== JSON.stringify(gy.boundingBox)) return `${x.name} bounds`;
    if (JSON.stringify(gx.drawRange) !== JSON.stringify(gy.drawRange) || gx.groups.length !== gy.groups.length) return `${x.name} drawRange / groups`;
  }
  return null;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
