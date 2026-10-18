// (B, vote-fix4) The dais DRESSED FOR THE VOTE (docs/DEMO.md §4.9 "the dais' candle stakes"): while the vote camera is up
// the dais' own per-seat CANDLE STAKES (src/town/pieces/dais.js: an iron post + cup + ivory candle 0.75 m along the ring
// from each seat stone, its flame, the ghost-light wisp on a dead seat's stake, the wisp's cool pool and the night
// candle halo on the ring round the stake's foot, the block pennant hung from the stake) are taken out of the picture -
// the user: the candles were "visually messy"; the seal at a voter's feet is the only vote mark. The central dais
// braziers, the stones, the hands, the sweep and the seat stones' own warm tops stay.
//
// HOW (the town piece is read-only; this is the demo side): the piece is ONE merged kit mesh per layer, so there are no
// stake objects to hide by name. Found through the town registry (registry.get('dais').group) by mesh name:
//   'dais-solid'         triangles of the stakes, picked by geometry: every vertex on the seat ring (|r - 6.25| < 0.2
//                        m from the circle centre), > 0.5 m from every seat stone's centre (the stones / bosses are
//                        within 0.43), and the triangle reaching above y 0.12 (the foot plate, the ring blocks, the
//                        brass hour bars and the XII diamond all stay below)
//   'dais-fx'            triangles by their FX slot (aFx.x; dais.js S_WISP 30.., S_CANDLE 45.., S_WISPOOL 85.., S_HALO
//                        160..: 15 slots each) - the flames, the wisps, their pools, the candle halos
//   'dais-states-solid'  the block pennants: triangles > 0.6 m from every seat centre (the dead seats' crack + moss lie
//                        within 0.45 of their stone)
// Each picked triangle is collapsed (all three corners onto its first: zero area, never rasterised, no shadow) and
// restored from a saved copy when the vote camera goes. Two buffer uploads per switch; no new programs.
//   createDaisDress(demo) -> { update(), info, hidden }   ?daisStakes=1 keeps the stakes in the vote
import * as THREE from 'three';

const SEAT_R = 6.25, RING_W = 0.2, STONE_CLEAR = 0.5, STAKE_Y = 0.12, PENNANT_CLEAR = 0.6;
const FX_SLOTS = [[30, 45], [45, 60], [85, 100], [160, 175]];       // wisp, candle, wisp pool, candle halo (dais.js)

export function createDaisDress(demo) {
  const params = demo.params ?? new URLSearchParams();
  if (params.get('daisStakes') === '1') return null;
  const piece = demo.town?.registry?.get?.('dais');
  const group = piece?.group;
  if (!group) return null;
  const C = demo.layout?.CIRCLE ?? { cx: 22.5, cz: 19.75 };
  const seats = Array.from({ length: 15 }, (_, i) => demo.layout.seatPos(i, 15));
  const nearSeat = (x, z) => { let d = Infinity; for (const s of seats) d = Math.min(d, Math.hypot(x - s.x, z - s.z)); return d; };
  const meshes = {};
  const NAMES = new Set(['dais-solid', 'dais-fx', 'dais-states-solid']);
  group.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && NAMES.has(o.name) && !meshes[o.name]) meshes[o.name] = o; });

  /** the triangles to collapse in a mesh: [first-vertex indices of each triangle as stored (index or position order)] */
  const V = new THREE.Vector3();
  function pick(mesh, test) {
    const g = mesh.geometry, P = g.attributes.position, idx = g.index, n = idx ? idx.count : P.count, out = [];
    mesh.updateMatrixWorld(true);
    const at = (k) => V.fromBufferAttribute(P, idx ? idx.getX(k) : k).applyMatrix4(mesh.matrixWorld).clone();
    for (let t = 0; t + 2 < n; t += 3) if (test([at(t), at(t + 1), at(t + 2)], t)) out.push(t);
    return out;
  }
  const plans = [];
  const solid = meshes['dais-solid'];
  if (solid) plans.push({ mesh: solid, tris: pick(solid, (p) => p.every((v) => Math.abs(Math.hypot(v.x - C.cx, v.z - C.cz) - SEAT_R) < RING_W && nearSeat(v.x, v.z) > STONE_CLEAR) && p.some((v) => v.y > STAKE_Y)) });
  const fx = meshes['dais-fx'];
  if (fx?.geometry.attributes.aFx) {
    const A = fx.geometry.attributes.aFx, idx = fx.geometry.index;
    plans.push({ mesh: fx, tris: pick(fx, (_, t) => { const s = Math.round(A.getX(idx ? idx.getX(t) : t)); return FX_SLOTS.some(([a, b]) => s >= a && s < b); }) });
  }
  const states = meshes['dais-states-solid'];
  if (states) plans.push({ mesh: states, tris: pick(states, (p) => p.every((v) => nearSeat(v.x, v.z) > PENNANT_CLEAR)) });

  // the saved copies (the index, or the positions of the picked corners) and the collapse
  for (const pl of plans) {
    const g = pl.mesh.geometry;
    if (g.index) pl.save = Uint32Array.from(pl.tris.flatMap((t) => [g.index.getX(t + 1), g.index.getX(t + 2)]));
    else { const P = g.attributes.position; pl.save = Float32Array.from(pl.tris.flatMap((t) => [P.getX(t + 1), P.getY(t + 1), P.getZ(t + 1), P.getX(t + 2), P.getY(t + 2), P.getZ(t + 2)])); }
  }
  function apply(hide) {
    for (const pl of plans) {
      const g = pl.mesh.geometry;
      if (g.index) {
        const I = g.index;
        pl.tris.forEach((t, j) => { const a = I.getX(t); I.setX(t + 1, hide ? a : pl.save[2 * j]); I.setX(t + 2, hide ? a : pl.save[2 * j + 1]); });
        I.needsUpdate = true;
      } else {
        const P = g.attributes.position;
        pl.tris.forEach((t, j) => {
          const s = pl.save, o = 6 * j;
          if (hide) { const x = P.getX(t), y = P.getY(t), z = P.getZ(t); P.setXYZ(t + 1, x, y, z); P.setXYZ(t + 2, x, y, z); }
          else { P.setXYZ(t + 1, s[o], s[o + 1], s[o + 2]); P.setXYZ(t + 2, s[o + 3], s[o + 4], s[o + 5]); }
        });
        P.needsUpdate = true;
      }
    }
  }
  const info = { hidden: false, tris: Object.fromEntries(plans.map((p) => [p.mesh.name, p.tris.length])), switches: 0 };
  return {
    info,
    get hidden() { return info.hidden; },
    update() {
      const want = !!demo.passB?.votecam?.info?.active && demo.store.state.camera === 'vote';
      if (want === info.hidden) return;
      apply(want); info.hidden = want; info.switches++;
    },
    dispose() { if (info.hidden) apply(false); info.hidden = false; },
  };
}
