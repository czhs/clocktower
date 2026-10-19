// Scene "town" (owner: town foundation lead): Hollowmere composed from every piece. docs/TOWN.md §2, §7.
//   ?cam=gameplay|overview|iso   camera preset (gameplay: yaw 0, viewHeight 12, centred on the square)
//   ?focus=<piece id>|<x,z>      move the camera target (e.g. focus=house-3, focus=22.5,30)
//   ?yaw=<deg> ?vh=<viewHeight>  overrides
//   ?tod=noon|morning|golden|night
//   ?pieces=ground,house-3,...   build a subset (default all); ?life=0 drops the life piece
//   ?strict=<piece id>|all       that piece's errors fail the page (default: broken pieces become grey boxes + warning)
//   ?pan=1                       slow deterministic drift (crawl / motion checks); ?pan=x,y static whole-texel offset
//   ?lights=<n> ?vignette=<v> ?quality=high|low ?cut=auto|0|1 (camera-aware cut-away, see src/town/cutaway.js)
//   ?cutSide=eave|strip|half|full (side-row focus cut box, town.js houseBox)  ?meshes=1 (16 heaviest meshes in stats)  ?tris=1 (per-frame tris by mesh: stats.triBreak)
//   ?boxes=1                     engine.stats.screenBoxes {piece: [x0, y0, x1, y1]} in internal (640x360) texels at
//                                the build camera (pan 0) - tools/towncrawl.py attributes crawl pixels to pieces with it
import * as THREE from 'three';
import { applyCamera, focusOf } from '../src/town/api.js';
import { buildTown } from '../src/town/town.js';

/** Screen-space bounds (internal texels, y down) of every piece group at the build camera. */
function screenBoxes(engine, registry, cam) {
  const c = engine.camera, tw = c.viewHeight / 360, W = 640, H = 360, t = cam.target;
  const r = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  const f = new THREE.Vector3(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
  const u = new THREE.Vector3().crossVectors(r, f);
  const out = {}, b = new THREE.Box3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const { id, group } of registry.all()) {
    if (!group || id === 'ground' || id === 'foliage' || id === 'life') continue;
    b.setFromObject(group);
    if (b.isEmpty()) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < 8; k++) {
      p.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z);
      d.subVectors(p, t);
      const sx = W / 2 + d.dot(r) / tw, sy = H / 2 - d.dot(u) / tw;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
    out[id] = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))];
  }
  return out;
}

/** ?meshes=1: the 16 heaviest visible meshes [piece, name, tris, castShadow, transparent] (quality-tier budgeting). */
function topMeshes(registry) {
  const rows = [];
  for (const { id, group } of registry.all()) {
    group?.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry, n = g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
      const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
      rows.push([id, o.name || o.type, Math.round(n * (Number.isFinite(inst) ? inst : 1)), o.castShadow ? 1 : 0, o.material?.transparent ? 1 : 0]);
    });
  }
  return rows.sort((a, b) => b[2] - a[2]).slice(0, 16);
}

/** ?tris=1: per-frame triangles by [piece/mesh name, pass] (colour+normal via onBeforeRender, sun via onBeforeShadow). */
function triBreakdown(engine) {
  let acc = {};
  const pieceOf = (o) => { while (o && !(o.parent && o.parent.name === 'town') && o.parent) o = o.parent; return o?.name ?? '?'; };
  engine.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
    const key = `${pieceOf(o)}/${o.name || o.type}`;
    const count = () => n * (o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? Math.min(g.instanceCount, 1e9) : 1);
    const prevR = o.onBeforeRender, prevS = o.onBeforeShadow;
    o.onBeforeRender = function (...a) { (acc[key] ??= [0, 0, 0])[0] += count(); acc[key][2]++; return prevR.apply(this, a); };
    o.onBeforeShadow = function (...a) { (acc[key] ??= [0, 0, 0])[1] += count(); return prevS.apply(this, a); };
  });
  engine.onUpdate(() => {
    const rows = Object.entries(acc).map(([k, v]) => [k, Math.round(v[0]), Math.round(v[1]), v[2]]).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
    engine.stats.triBreak = rows.slice(0, 80);
    engine.stats.triTotal = rows.reduce((s, r) => [s[0] + r[1], s[1] + r[2]], [0, 0]);
    acc = {};
  });
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const cam = applyCamera(engine, P('cam', 'gameplay'), {
    focus: focusOf(P('focus', null)),
    yawDeg: params.has('yaw') ? Number(params.get('yaw')) : null,
    viewHeight: params.has('vh') ? Number(params.get('vh')) : null,
  });
  const pieces = params.has('pieces') ? P('pieces', '').split(',').filter(Boolean) : null;
  const town = await buildTown(engine, params, { pieces, strict: P('strict', null), pad: !!pieces && !pieces.includes('ground') });
  if (P('boxes', '0') === '1') engine.stats.screenBoxes = screenBoxes(engine, town.registry, cam);
  if (P('meshes', '0') === '1') engine.stats.topMeshes = topMeshes(town.registry);
  if (P('tris', '0') === '1') triBreakdown(engine);
  // pan AFTER the build: grass / tree / light sets depend on the camera at build time and must not change with it
  const pan = P('pan', null);
  if (pan) {
    const c = engine.camera, tw = c.texelWorld, base = cam.target.clone();
    const R = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)), F = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    if (pan === '1') {
      engine.onUpdate((t) => { c.target.copy(base).addScaledVector(R, 10 * t * tw).addScaledVector(F, 4 * t * tw / Math.sin(c.pitch)); });
    } else {
      const [px, py] = pan.split(',').map(Number);
      c.target.copy(base).addScaledVector(R, (px || 0) * tw).addScaledVector(F, ((py || 0) * tw) / Math.sin(c.pitch));
    }
  }
}
