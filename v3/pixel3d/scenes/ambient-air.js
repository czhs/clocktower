// Scene "ambient-air" (owner: ambient-air): the ambient stage (scenes/ambient-stage.js, its walker loop at game speed)
// dressed for the "air" system: laundry line along the first run, two puddles on the trail (one in the flock patch,
// one after the stop), a stone chimney stack bottom-left, a flagpole with bunting strung to a post on its right (r3: the
// old rope crossed the stage pillar's face), a market awning and a swallow-tail banner on open dark grass by the
// right-hand run (r3: it hung in front of the violet boulder), a sunbeam of dust motes over dark grass at noon / in the
// pillar's long shadow at golden (motes need shade to read), gust-line spots upwind of the cloth and over dark grass.
// All parameters of ambient-stage apply (tod, walker, speed, still, shot, vh, follow, seed, grass, grade);
// ?systems= defaults to 'air' and is loaded HERE (the stage itself runs with no systems; same actors registry).
//   ?wind=0.4 base wind  ?every=5.4 s between gusts
import * as THREE from 'three';
import stageBuild from './ambient-stage.js';
import { createAmbient } from '../src/ambient/index.js';
import { createPillar } from '../src/world/props.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const list = P('systems', 'air').split(',').map((s) => s.trim()).filter(Boolean);
  const q = new URLSearchParams(params);
  q.set('systems', ''); q.set('strict', '');
  await stageBuild(engine, q);
  const stage = window.__pixel.ambient;
  const stats = engine.stats;
  const tod = ['noon', 'morning', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'noon';

  // screen-metre authoring, as in the stage (the wide frame is +-8.9 x +-5 around (0, 0.3))
  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy, y = 0) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH)).setY(y);
  const heightAt = () => 0;                     // the stage flattens r 9 m around its centre to h 0

  // ---- props owned by this scene: the chimney stack (a stacked-block pillar, the smoke source)
  const chimFoot = scr(-8.2, -3.3);
  const chim = createPillar(engine, { height: 2.3, seed: 29, width: 0.6, position: chimFoot, debris: false });
  engine.scene.add(chim);
  const chimTop = chimFoot.clone().setY((chim.userData.height ?? 2.3));

  // ---- cloth / air layout
  const flagFoot = scr(-3.7, 1.7);
  const trail = stage.anchors.spots.trail;
  const segD = (x, z, a, b) => {
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
    const u = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
    return Math.hypot(x - a.x - abx * u, z - a.z - abz * u);
  };
  const flock = stage.anchors.spots.flock;
  const dustAt = (x, z) => Math.hypot(x - flock.x, z - flock.z) < 1.75 || trail.some((a, i) => segD(x, z, a, trail[(i + 1) % trail.length]) < 0.6);

  const opts = {
    wind: { dir: R.clone().addScaledVector(F, 0.22).normalize(), strength: Number(P('wind', 0.4)), every: Number(P('every', 5.4)), first: 1.3, center: scr(0, 0),
      // gust-line spots (y = height): upwind of the laundry, upwind of the flag, two over dark grass
      spots: [scr(-0.1, -1.4, 1.35), scr(-4.7, 1.45, 2.55), scr(1.5, 1.6, 1.2), scr(3.3, -4.0, 0.9)] },
    flags: [{ pos: flagFoot, poleH: 3.0, w: 0.95, h: 0.58, tones: 'red' }],
    // the rope runs mostly ACROSS the screen (a rope into the screen shows its pennants edge-on as specks)
    // ... and clear of the stage pillar (r3: the old run from the left post crossed the pillar's face)
    bunting: [{ a: flagFoot.clone().setY(2.2), b: scr(-1.6, 0.9, 2.0), posts: [scr(-1.6, 0.9, 2.0)], sag: 0.24, n: 6, size: 0.34, tones: ['red', 'ochre', 'linen', 'blue', 'lilac'] }],
    laundry: [{
      a: scr(2.5, -1.55, 1.75), b: scr(-0.4, -0.72, 1.75), sag: 0.14,
      items: [
        { u: 0.12, w: 0.58, h: 0.8, tones: 'linen', band: 'blue' },
        { u: 0.31, w: 0.42, h: 0.54, tones: 'blue' },
        { u: 0.46, w: 0.14, h: 0.3, tones: 'ochre', mass: 0.7 },
        { u: 0.6, w: 0.7, h: 0.9, tones: 'linen', band: 'red', mass: 1.2 },
        { u: 0.79, w: 0.4, h: 0.58, tones: 'sage', taper: 0.8 },
        { u: 0.9, w: 0.16, h: 0.28, tones: 'red', mass: 0.7 },   // r3: was lilac, lost on the lilac flower drift
      ],
    }],
    // turned 0.5 rad off the camera so the side cheek shows the 0.6 m slope; deep valance (0.3 m)
    awnings: [{ pos: scr(4.7, 1.75), yaw: YAW - 0.5, w: 1.9, d: 1.1, hBack: 2.2, hFront: 1.6, flaps: 6, flapH: 0.3, tones: ['linen', 'red'] }],
    banners: [{ pos: scr(7.2, -0.55), postH: 2.25, w: 0.5, h: 1.0, yaw: YAW, tones: 'wine' }],   // open dark grass, off the boulder
    chimneys: [chimTop],
    puddles: [{ pos: scr(-1.55, -0.95), r: 0.42 }, { pos: scr(3.85, -2.3), r: 0.5 }],   // right puddle ON the run line (was 0.64 m off it)
    beams: [
      { pos: scr(6.4, -2.25), r: 0.75, h: 2.1, count: 34, sun: new THREE.Vector3(-0.9, 1, -0.1), tods: ['noon', 'morning'] },
      { pos: scr(-2.0, 0.42), r: 0.6, h: 1.6, count: 28, sun: new THREE.Vector3(-1.0, 0.8, 0.1), tods: ['golden'] },
    ],
    dustAt,
  };
  const amb = await createAmbient(engine, {
    systems: list.map((name) => ({ name, opts: name === 'air' ? opts : {} })),
    actors: stage.actors, anchors: { ...stage.anchors, chimneys: [chimTop] }, heightAt, tod,
    seed: Number(P('seed', 1)), strict: P('strict', '1') === '1' ? true : P('strict'),
  });
  engine.onUpdate(() => { stats.ambient = amb.stats(); });
  window.__pixel.ambient = amb;
  window.__pixel.ambientStage = stage;
}
