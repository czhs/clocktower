// life folk (owner: life agent): the townsfolk on the voting circle's seat stones during the ceremony demo.
//
// The 15 seats are filled by cheap INSTANCED seated villagers (one tiny merged pose geometry per costume x pose, kit
// solid material: outlines, rims and toon bands like every other figure), not by full Characters: 3 costumes in the
// villager ramps (red / slate / plaster cloth) + a grey "ghost" (the dead keep their seat, drained to stone), 2 poses
// (hands in lap, right hand raised for the vote). <= 7 draw calls for the whole ring.
//   sit-down: each figure appears at its seat time one frame (1/8 s) 4 texels high, then drops onto the stone (a held
//   2-drawing "plonk", no fade); vote: the hand goes up as the brass hand reaches the seat and stays up to the tally.
// Seats owned by a walking Character (the villagers who walk in) are skipped.
import * as THREE from 'three';
import { Builder, M } from '../kit.js';
import { TOWN_PALETTE as PAL } from '../palette.js';
import { poseSet } from './critters.js';
import { snapLocal } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKIN = ['#F8D8B6', '#E0A982', '#9C6E78'];          // the mannequin's skin ramp (characters/mannequin.js)
const COSTUMES = {
  red: { cloth: PAL.red, dark: PAL.timber, hair: PAL.thatch, skin: SKIN },
  slate: { cloth: PAL.slate, dark: PAL.plank, hair: PAL.timber, skin: SKIN },
  plaster: { cloth: PAL.plaster, dark: PAL.slate, hair: PAL.plank, skin: SKIN },
  ghost: { cloth: 'stone', dark: 'stone', hair: 'stone', skin: 'stone' },
};

function seated(b, c, hand, S = 0.235, pose = 'sit') {
  // S = seat top above the ground (feet reach the floor): 0.235 the dais seat stones, 0.44 the square's benches
  // local: facing +z, seat surface y 0
  for (const sx of [-1, 1]) {
    b.box(0.12, S - 0.05, 0.12, { tones: c.dark, at: [sx * 0.08, -S + 0.05, 0.2] });            // shins
    b.box(0.13, 0.06, 0.18, { tones: c.dark, tint: 0.9, at: [sx * 0.08, -S, 0.24] });            // boots
  }
  b.box(0.32, 0.12, 0.3, { tones: c.dark, at: [0, 0, 0.1] });                                    // lap
  b.box(0.36, 0.36, 0.24, { tones: c.cloth, at: [0, 0.1, -0.03] });                              // torso
  b.box(0.38, 0.06, 0.26, { tones: c.dark, tint: 0.95, at: [0, 0.1, -0.03] });                   // belt
  b.box(0.1, 0.27, 0.11, { tones: c.cloth, tint: 0.96, at: [-0.23, 0.17, 0.02] });               // left arm, hand in lap
  b.box(0.1, 0.08, 0.1, { tones: c.skin, at: [-0.2, 0.12, 0.13] });
  if (pose === 'chin') {                                                                          // elbow on the knee, chin in hand
    b.box(0.1, 0.12, 0.24, { tones: c.cloth, tint: 0.96, at: [0.2, 0.1, 0.1] });
    b.box(0.1, 0.24, 0.1, { tones: c.cloth, tint: 0.96, at: [0.16, 0.16, 0.2] });
    b.box(0.1, 0.1, 0.1, { tones: c.skin, at: [0.12, 0.38, 0.18] });
  } else if (pose === 'pipe') {                                                                   // hand up at the mouth (a pipe)
    b.box(0.1, 0.22, 0.11, { tones: c.cloth, tint: 0.96, at: [0.23, 0.2, 0.06] });
    b.box(0.1, 0.1, 0.1, { tones: c.skin, at: [0.15, 0.42, 0.17] });
    b.box(0.05, 0.05, 0.16, { tones: PAL.timber, at: [0.06, 0.45, 0.2] });
  } else if (hand) {                                                                              // right hand up: vote
    // the arm goes up beside the head and clears it by a whole hand (reads from the back and the side)
    b.box(0.11, 0.6, 0.12, { tones: c.cloth, tint: 0.96, at: [0.24, 0.4, 0.0] });
    b.box(0.13, 0.14, 0.13, { tones: c.skin, at: [0.24, 1.0, 0.0] });
  } else {
    b.box(0.1, 0.27, 0.11, { tones: c.cloth, tint: 0.96, at: [0.23, 0.17, 0.02] });
    b.box(0.1, 0.08, 0.1, { tones: c.skin, at: [0.2, 0.12, 0.13] });
  }
  const hy = pose === 'chin' ? 0.44 : 0.46, hz = pose === 'chin' ? 0.03 : 0.0;                   // chin pose: head a touch forward
  b.push(M({ at: [0, hy - 0.46, hz] }));
  b.box(0.3, 0.28, 0.27, { tones: c.skin, at: [0, 0.46, 0.0] });                                 // head
  b.box(0.33, 0.12, 0.3, { tones: c.hair, at: [0, 0.68, -0.01] });                               // hair cap
  b.box(0.33, 0.22, 0.08, { tones: c.hair, tint: 0.95, at: [0, 0.48, -0.12] });                  // back of the hair
  if (c.skin !== 'stone') for (const sx of [-1, 1]) b.box(0.05, 0.07, 0.02, { tones: PAL.iron, at: [sx * 0.07, 0.55, 0.135] });   // eyes
  if (c.hat) b.box(0.4, 0.05, 0.38, { tones: c.hat, at: [0, 0.74, -0.01] }), b.box(0.28, 0.12, 0.27, { tones: c.hat, tint: 0.94, at: [0, 0.79, -0.01] });
  b.pop();
}

/**
 * seats: [Vector3] (dais seat-top anchors), centre {cx, cz}. plan(i, t) -> null (empty) | {costume, hand, since}
 * (since = life time the figure sat down). Returns {update(t, rootOffset, warm), set}.
 */
export function createFolk(engine, group, seats, centre, plan, { nudge = [0, 0, 0] } = {}) {
  const geoms = {};
  for (const [name, c] of Object.entries(COSTUMES)) for (const hand of name === 'ghost' ? [false] : [false, true]) {
    const b = new Builder(engine, { name: `folk-${name}-${hand ? 'hand' : 'sit'}` });
    seated(b, c, hand);
    geoms[`${name}-${hand ? 'hand' : 'sit'}`] = b.build().children[0].geometry;
  }
  const set = poseSet(engine, group, geoms, seats.length, 'folk', 1);
  for (const m of Object.values(set.meshes)) m.castShadow = false;
  // facing the dais exactly (static figures: no stepped turning). Crawl A/B (whole-texel pan, life on vs folk off):
  // 45-degree stops were WORSE (diagonal box edges tie on the grid diagonals), extra sub-texel nudges were worse, and
  // the figures' CAST shadows from the rotated boxes added 12 px - so the visible figures receive but do not cast, and
  // the shadow comes from an INVISIBLE axis-aligned proxy per figure (colorWrite / depthWrite off: nothing in the colour
  // or normal pass; three's shadow depth material still renders it), placed on the texel grid with yaw 0: a body
  // column (torso + head), the shins below the knees (offset toward the dais) and, for a vote, the raised arm column
  // (offset to the figure's right). Translations only, every part snapped: no rotated edges in the shadow map.
  const yaw = seats.map((s) => Math.atan2(centre.cx - s.x, centre.cz - s.z));
  const proxy = createFolkProxy(engine, group, seats.length);
  const tmp = new THREE.Vector3(), snapped = new THREE.Vector3(), part = new THREE.Vector3();
  const local = (i, x, z, out) => {                                     // figure-local (x right, z forward) -> layout offset
    const c = Math.cos(yaw[i]), s = Math.sin(yaw[i]);
    return out.set(x * c + z * s, 0, -x * s + z * c);
  };
  return {
    set,
    proxy,
    update(t, rootOffset, warm = false) {
      set.begin(); proxy.begin();
      seats.forEach((s, i) => {
        const p = plan(i, t);
        if (!p) return;
        tmp.copy(s);
        if (t - p.since < 0.125) tmp.y += 0.13;                         // the drop onto the stone (held drawing)
        snapLocal(engine, rootOffset, tmp, snapped); snapped.x += nudge[0]; snapped.y += nudge[1]; snapped.z += nudge[2];
        const hand = p.hand && p.costume !== 'ghost';
        set.put(`${p.costume}-${hand ? 'hand' : 'sit'}`, snapped, yaw[i]);
        // shadow proxy parts (positions in layout space, each snapped on its own; yaw 0)
        part.copy(tmp).add(local(i, 0, -0.02, snapped)); proxy.put('body', snapLocal(engine, rootOffset, part, snapped));
        part.copy(tmp).add(local(i, 0, 0.2, snapped)); proxy.put('legs', snapLocal(engine, rootOffset, part, snapped));
        if (hand) { part.copy(tmp).add(local(i, 0.24, 0, snapped)); proxy.put('arm', snapLocal(engine, rootOffset, part, snapped)); }
      });
      set.end(warm); proxy.end(warm);
    },
  };
}

// The seated figure's shadow stand-in: 3 instanced, axis-aligned box geometries (origin = the seat top), drawn only
// into the sun's shadow map. Sizes: the figure's own extents (torso 0.36 w, head + hair cap up to 0.74; shins 0.12
// apart x 2 down to the ground at the dais seat height 0.235; the raised arm 0.11 x 0.6 + the hand up to 1.07).
function createFolkProxy(engine, group, max, S = 0.235) {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const geoms = {
    body: mergeGeometries([box(0.34, 0.5, 0.26, 0, 0.17, -0.0), box(0.3, 0.32, 0.28, 0, 0.58, 0)]),
    legs: mergeGeometries([box(0.3, 0.1, 0.24, 0, 0, 0), box(0.28, S - 0.05, 0.12, 0, -S / 2 - 0.025, 0.04)]),
    arm: mergeGeometries([box(0.11, 0.6, 0.12, 0, 0.4, 0), box(0.13, 0.14, 0.13, 0, 1.0, 0)]),
  };
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const meshes = {};
  for (const [k, g] of Object.entries(geoms)) {
    const m = new THREE.InstancedMesh(g, mat, max);
    m.name = `folk-shadow-${k}`;
    m.count = 0; m.visible = false; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    group.add(m);
    meshes[k] = m;
  }
  const _m = new THREE.Matrix4();
  return {
    meshes,
    begin() { for (const m of Object.values(meshes)) m.count = 0; },
    put(k, pos) { const m = meshes[k]; if (m.count < max) m.setMatrixAt(m.count++, _m.makeTranslation(pos.x, pos.y, pos.z)); },
    end(warm = false) {
      for (const m of Object.values(meshes)) {
        if (warm && m.count === 0) m.setMatrixAt(m.count++, _m.makeTranslation(0, -200, 0));
        m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/**
 * Bench sitters (art-director round: nobody sat on the square's benches by day). seats: [{pos: Vector3 (seat top),
 * costume, poses: [a, b], beat}] (layout space, facing +z = the bench front). Each sitter alternates two drawings on a
 * slow held clock (hands in lap <-> chin in hand / pipe), axis-aligned (no 45-degree box ties), and CASTS a shadow
 * (static figure, yaw 0: no crawl from rotated boxes). Returns {update(t, rootOffset, warm), set}.
 */
export const BENCH_COSTUMES = {
  granny: { cloth: PAL.plum, dark: PAL.slate, hair: PAL.cream, skin: SKIN },
  farmer: { cloth: PAL.moss, dark: PAL.plank, hair: PAL.timber, skin: SKIN, hat: PAL.thatch },
};
export function createBenchFolk(engine, group, sitters) {
  const geoms = {};
  for (const s of sitters) for (const pose of s.poses) {
    const key = `${s.costume}-${pose}`;
    if (geoms[key]) continue;
    const b = new Builder(engine, { name: `bench-${key}` });
    seated(b, BENCH_COSTUMES[s.costume], false, s.pos.y, pose);
    geoms[key] = b.build().children[0].geometry;
  }
  const set = poseSet(engine, group, geoms, 2, 'benchfolk');
  const snapped = new THREE.Vector3();
  return {
    set,
    update(t, rootOffset, warm = false) {
      set.begin();
      sitters.forEach((s, i) => {
        // long held drawings: ~3-6 s each, seeded per sitter
        const k = Math.floor((t + i * 2.3) / s.beat);
        const pose = s.poses[(k % 3 === 2) ? 1 : 0];
        snapLocal(engine, rootOffset, s.pos, snapped);
        set.put(`${s.costume}-${pose}`, snapped, 0);
      });
      set.end(warm);
    },
  };
}
