#!/usr/bin/env node
// v3 perf recon (front "classic"): load-path report for the v2 Classic client + entry + lobby on a v3 tree.
// Reads one or more bundle reports (scripts/perf/bundle-report.mjs --json) and prints, per tree, the numbers the
// v2.4 budgets and INTEGRATION.md §7 talk about, plus what budgets.mjs cannot see:
//   * entry JS = the entry file (budgets.mjs entryJsBrKiB) AND its static-import closure (every chunk the HTML
//     modulepreloads before sign-in; a vendor split would hide bytes from the single-file number);
//   * entry CSS = sum of assets/index-*.css (index-base + theme; budgets.mjs takes the same sum since v2.4);
//   * LobbyRoute file and its static closure minus the entry closure (what the lobby really adds);
//   * TownGame (Phaser), townParts, layoutV3, v3atlas, town3d and any chunk that contains three / pixel3d;
//   * leaks: game3d / three / pixel3d / hollowmere modules reachable statically from the entry or the lobby.
// And the atlas inventory of packages/assets/generated: WebP bytes + decoded size (RGBA8 GPU MiB) for the v2
// runtime atlases and the Classic-in-v3 ones (terrain-v3, objects-v3; square-props is shared).
//
//   node scripts/perf/classic-bundle.mjs --report v24=/tmp/a.json --report head=/tmp/b.json [--atlases packages/assets/generated] [--out x.json]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const reports = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--report') reports.push(argv[++i]);
const arg = (n, d = null) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const KiB = 1024;
const k = (n) => (n == null ? '—' : (n / KiB).toFixed(1));

function analyse(file) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const chunks = r.chunks ?? {};
  const files = new Map((r.files ?? []).map((f) => [f.file, f]));
  const br = (f) => files.get(f)?.br ?? 0;
  const closure = (start) => {
    const seen = new Set();
    const st = [...start];
    while (st.length) {
      const c = st.pop();
      if (seen.has(c)) continue;
      seen.add(c);
      for (const i of chunks[c]?.imports ?? []) st.push(i);
    }
    return seen;
  };
  const entry = Object.keys(chunks).find((c) => chunks[c].isEntry);
  const entryClosure = closure([entry]);
  const byName = (re) => Object.keys(chunks).filter((c) => re.test(c));
  const lobby = byName(/^assets\/LobbyRoute-[^/]+\.js$/)[0];
  const lobbyClosure = lobby ? [...closure([lobby])].filter((c) => !entryClosure.has(c)) : [];
  const sum = (list) => list.reduce((a, c) => a + br(c), 0);
  const cssEntry = (r.files ?? []).filter((f) => /^assets\/index-[^/]+\.css$/.test(f.file));
  const pkgs = (list) => {
    const by = {};
    for (const c of list) for (const [p, n] of Object.entries(chunks[c]?.by ?? {})) by[p] = (by[p] ?? 0) + n;
    return by;
  };
  const leakRe = /game3d|(^|\/)three$|three\/|pixel3d|hollowmere|v3\//;
  const leaks = (list) => Object.keys(pkgs(list)).filter((p) => leakRe.test(p));
  const one = (re) => {
    const l = (r.files ?? []).map((f) => f.file).filter((f) => re.test(f)); // JS and CSS files
    return l.length ? { files: l.map((f) => path.basename(f)), br: sum(l) } : null;
  };
  const threeChunks = Object.keys(chunks).filter((c) => Object.keys(chunks[c].by ?? {}).some((p) => p === 'three' || /pixel3d/.test(p)));
  return {
    file,
    entry: { file: entry, br: br(entry), closure: [...entryClosure].map((c) => path.basename(c)), closureBr: sum([...entryClosure]), leaks: leaks([...entryClosure]) },
    entryCss: { files: cssEntry.map((f) => path.basename(f.file)), br: cssEntry.reduce((a, f) => a + f.br, 0) },
    lobby: lobby ? { file: lobby, br: br(lobby), addedClosure: lobbyClosure.map((c) => path.basename(c)), addedClosureBr: sum(lobbyClosure), leaks: leaks(lobbyClosure) } : null,
    lobbyCss: one(/^assets\/LobbyRoute-[^/]+\.css$/),
    townGame: one(/^assets\/TownGame-[^/]+\.js$/),
    townGameCss: one(/^assets\/TownGame-[^/]+\.css$/),
    townParts: one(/^assets\/townParts-[^/]+\.js$/),
    layoutV3: one(/^assets\/layoutV3-[^/]+\.js$/),
    v3atlas: one(/^assets\/v3atlas-[^/]+\.js$/),
    runtimeV3: one(/^assets\/runtimeV3-[^/]+\.js$/),
    town3d: one(/^assets\/town3d-[^/]+\.js$/),
    threeOrPixel3dChunks: { n: threeChunks.length, br: sum(threeChunks) },
    jsTotalBr: (r.files ?? []).filter((f) => /\.js$/.test(f.file)).reduce((a, f) => a + (f.br ?? 0), 0),
    topEntryModules: Object.entries(pkgs([entry])).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([p, n]) => `${(n / KiB).toFixed(1)} KiB raw ${p}`),
    topLobbyModules: lobby ? Object.entries(pkgs([lobby])).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([p, n]) => `${(n / KiB).toFixed(1)} KiB raw ${p}`) : [],
  };
}

/** Width/height of a WebP (VP8 / VP8L / VP8X). */
function webpDims(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8L') {
    const b = buf.subarray(21, 25);
    return { w: 1 + (((b[1] & 0x3f) << 8) | b[0]), h: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
  }
  if (fourcc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fourcc === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  return null;
}

function atlases(dir) {
  if (!existsSync(dir)) return null;
  const rows = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.webp')).sort()) {
    const p = path.join(dir, f);
    const d = webpDims(readFileSync(p));
    rows.push({ name: f.replace(/\.webp$/, ''), kib: Math.round((statSync(p).size / KiB) * 10) / 10, dims: d ? `${d.w}x${d.h}` : '?', gpuMiB: d ? Math.round(((d.w * d.h * 4) / 1048576) * 10) / 10 : null });
  }
  // what TownScene preloads (v2.4: HD and ghosts on demand). v3 Classic swaps terrain/objects for the -v3 files.
  const V2 = ['cast', 'terrain', 'objects', 'decor', 'lights', 'square-props', 'social'];
  const V3 = ['cast', 'terrain-v3', 'objects', 'objects-v3', 'decor', 'lights', 'square-props', 'social'];
  const tot = (names) => {
    const sel = rows.filter((r) => names.includes(r.name));
    return { names: sel.map((r) => r.name), kib: Math.round(sel.reduce((a, r) => a + r.kib, 0) * 10) / 10, gpuMiB: Math.round(sel.reduce((a, r) => a + (r.gpuMiB ?? 0), 0) * 10) / 10 };
  };
  return { rows, v2Town: tot(V2), v3ClassicTown: tot(V3) };
}

const out = { at: new Date().toISOString(), trees: {} };
for (const spec of reports) {
  const [label, file] = spec.includes('=') ? spec.split('=') : [path.basename(spec), spec];
  out.trees[label] = analyse(file);
}
out.atlases = atlases(arg('atlases', 'packages/assets/generated'));

const labels = Object.keys(out.trees);
const row = (name, get) => console.log(`${name.padEnd(34)} ${labels.map((l) => k(get(out.trees[l])).padStart(10)).join(' ')}`);
console.log(`${'KiB brotli'.padEnd(34)} ${labels.map((l) => l.padStart(10)).join(' ')}`);
row('entry JS file (entryJsBrKiB)', (t) => t.entry.br);
row('entry JS static closure', (t) => t.entry.closureBr);
row('entry CSS sum (entryCssBrKiB)', (t) => t.entryCss.br);
row('LobbyRoute file (lobbyChunkBrKiB)', (t) => t.lobby?.br);
row('LobbyRoute added static closure', (t) => t.lobby?.addedClosureBr);
row('LobbyRoute CSS', (t) => t.lobbyCss?.br);
row('TownGame (townChunkBrKiB)', (t) => t.townGame?.br);
row('TownGame CSS', (t) => t.townGameCss?.br);
row('townParts', (t) => t.townParts?.br);
row('layoutV3', (t) => t.layoutV3?.br);
row('v3atlas', (t) => t.v3atlas?.br);
row('runtimeV3', (t) => t.runtimeV3?.br);
row('town3d', (t) => t.town3d?.br);
row('chunks with three/pixel3d (sum)', (t) => t.threeOrPixel3dChunks.br);
row('all JS (sum)', (t) => t.jsTotalBr);
for (const l of labels) {
  const t = out.trees[l];
  console.log(`\n[${l}] entry closure: ${t.entry.closure.join(', ')}`);
  console.log(`[${l}] entry css: ${t.entryCss.files.join(', ')}`);
  if (t.lobby) console.log(`[${l}] lobby adds: ${t.lobby.addedClosure.join(', ')}`);
  if (t.entry.leaks.length || t.lobby?.leaks.length) console.log(`[${l}] LEAK into entry/lobby: ${[...t.entry.leaks, ...(t.lobby?.leaks ?? [])].join(', ')}`);
  console.log(`[${l}] top entry modules:\n    ${t.topEntryModules.join('\n    ')}`);
  console.log(`[${l}] top lobby modules:\n    ${t.topLobbyModules.join('\n    ')}`);
}
if (out.atlases) {
  console.log('\n# atlases (generated/*.webp): KiB / dims / RGBA8 GPU MiB');
  for (const r of out.atlases.rows) console.log(`${r.name.padEnd(28)} ${String(r.kib).padStart(8)} ${r.dims.padStart(11)} ${String(r.gpuMiB).padStart(6)}`);
  for (const [n, t] of [['v2 Classic town', out.atlases.v2Town], ['v3 Classic town', out.atlases.v3ClassicTown]]) console.log(`${n}: ${t.kib} KiB, ${t.gpuMiB} GPU MiB (${t.names.join(', ')})`);
}
const o = arg('out');
if (o) writeFileSync(o, JSON.stringify(out, null, 1));
