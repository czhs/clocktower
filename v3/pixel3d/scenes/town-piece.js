// Scene "town-piece" (owner: town foundation lead): one town piece in isolation on a neutral ground pad, for
// turntables (tools/townpiece.sh). docs/TOWN.md §7.
//   ?piece=<id>              required (house-0..14, clocktower, dais, foliage, ground, props, life)
//   ?yaw=<deg>               camera yaw (0 = the game's view, looking north; 45 = iso from the south-east)
//   ?tod=noon|morning|golden|night   ?vh=<viewHeight> (default per piece: houses 9, clocktower 22, dais 13, else 12)
//   ?focus=<piece id>|<x,z>  camera target (default: the piece's footprint centre / the square)
//   ?with=<ids>|all          extra context pieces (life defaults to all; ground replaces the pad)
//   ?fit=1|0                 (default 1 for houses / clocktower without ?vh / ?focus) after the build, re-centre the
//                            camera on the piece's bounding box (ridge, chimneys, finials, perches) and widen the view
//                            if the box does not fit with a 6 % margin, so tall tops are never cut off at any yaw
// The piece is built exactly as in the town (world coordinates, same ctx), with strict errors, no cloud shadows.
import * as THREE from 'three';
import { applyCamera, focusOf, PIECE_VIEW, PIECE_IDS } from '../src/town/api.js';
import { buildTown } from '../src/town/town.js';

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const id = P('piece', 'house-0');
  if (!PIECE_IDS.includes(id)) throw new Error(`town-piece: unknown piece '${id}' (one of ${PIECE_IDS.join(', ')})`);
  const vh = params.has('vh') ? Number(params.get('vh')) : PIECE_VIEW[id.startsWith('house-') ? 'house' : id];
  applyCamera(engine, 'gameplay', {
    focus: focusOf(P('focus', id)),
    yawDeg: Number(P('yaw', 0)),
    viewHeight: vh,
  });
  const w = P('with', id === 'life' ? 'all' : '');
  const extra = w === 'all' ? PIECE_IDS : w.split(',').filter(Boolean);
  const pieces = [...new Set([id, ...extra])];
  const town = await buildTown(engine, params, { pieces, strict: id, pad: !pieces.includes('ground'), clouds: false, cut: false });
  const fit = P('fit', (id.startsWith('house-') || id === 'clocktower') && !params.has('vh') && !params.has('focus') ? '1' : '0') === '1';
  if (fit) fitCamera(engine, town.registry.get(id)?.group);
}

/** Centre the camera on an object's bounds (screen space at the current yaw / pitch) and grow viewHeight to fit. */
function fitCamera(engine, obj) {
  if (!obj) return;
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const c = engine.camera;
  const r = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  const f = new THREE.Vector3(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
  const u = new THREE.Vector3().crossVectors(r, f);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const p = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    p.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
    const sx = p.dot(r), sy = p.dot(u);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const aspect = 16 / 9, vh = Math.max(c.viewHeight, (y1 - y0) * 1.12, ((x1 - x0) * 1.12) / aspect);
  // new target: the ground point (y 0) whose screen position is the box centre
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const t = c.target.clone();
  t.addScaledVector(r, cx - t.dot(r));
  t.addScaledVector(u, cy - t.dot(u));
  // slide along the view ray back to the ground plane (same screen point)
  t.addScaledVector(f, -t.y / f.y);
  c.set({ target: t, viewHeight: vh });
  engine.stats.fit = { vh: +vh.toFixed(2), target: t.toArray().map((v) => +v.toFixed(2)), box: [...box.min.toArray(), ...box.max.toArray()].map((v) => +v.toFixed(2)) };
}
