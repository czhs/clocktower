// Scene "town-life" (owner: life agent): the showcase of the town's life layer (src/town/life/*), the whole town
// composed with the life piece strict (its errors fail the page).
//   ?demo=day (default) | dusk | night | ceremony     a scripted, deterministic timeline (src/town/life/index.js)
//   ?t=<s>      life-clock offset (scrub: the timeline starts at t), ?hold=1 freezes it there (interactive viewer)
//   ?shot=<name> a framed camera for the demo: wide (the square, gameplay zoom), doors (north lane), tower (the
//               clocktower + crows), dais (close on the ceremony), lamps (the lamplighter's west side), cat, fountain,
//               belfry (the tower top for the hour strike: bell swing, glints, the crow scatter)
//   + every scenes/town.js param (cam, focus, yaw, vh, tod, lifeOff, pieces, pan, clouds, vignette ...)
// Each demo picks a time of day unless ?tod= is given: day/ceremony noon, dusk golden, night night.
import * as THREE from 'three';
import { applyCamera, focusOf } from '../src/town/api.js';
import { buildTown } from '../src/town/town.js';

const DEMO_TOD = { day: 'noon', ceremony: 'noon', dusk: 'golden', night: 'night' };
// [focus x, z, viewHeight]
const SHOTS = {
  wide: [22.5, 19.5, 12], doors: [22.5, 13.2, 12], tower: [22.5, 12.0, 12], dais: [22.5, 19.2, 8], lamps: [14.5, 19.5, 12],
  cat: [12.5, 25.5, 6], fountain: [33.5, 15.0, 8], crows: [21.0, 15.5, 9],
  // belfry: the tower top (bell, dial, pinnacle crows) - a raised focus [x, z, vh, y]; with no ?t= the timeline
  // starts 1 s before the hour (the clock reads 11:59 at t 0, the bell strikes 12 at t 1, crows scatter)
  belfry: [22.5, 7.6, 10, 8.4],
};
const SHOT_T = { belfry: 1 };
const DEMO_SHOT = { day: 'doors', dusk: 'lamps', night: 'wide', ceremony: 'wide' };

export default async function build(engine, params) {
  const q = new URLSearchParams(params);
  const demo = q.get('demo') ?? 'day';
  if (!q.has('tod')) q.set('tod', DEMO_TOD[demo] ?? 'noon');
  const P = (k, d) => q.get(k) ?? d;
  const shotName = P('shot', DEMO_SHOT[demo] ?? 'wide');
  const shot = SHOTS[shotName] ?? SHOTS.wide;
  if (SHOT_T[shotName] !== undefined && !q.has('t')) q.set('t', String(SHOT_T[shotName]));
  const cam = P('cam', 'gameplay');
  const focus = q.has('focus') ? focusOf(q.get('focus')) : cam === 'gameplay' ? new THREE.Vector3(shot[0], shot[3] ?? 0, shot[1]) : null;
  const camInfo = applyCamera(engine, cam, {
    focus,
    yawDeg: q.has('yaw') ? Number(q.get('yaw')) : null,
    viewHeight: q.has('vh') ? Number(q.get('vh')) : cam === 'gameplay' ? shot[2] : null,
  });
  const pieces = q.has('pieces') ? q.get('pieces').split(',').filter(Boolean) : null;
  await buildTown(engine, q, { strict: 'life', pieces, pad: !!pieces && !pieces.includes('ground') });
  // ?pan= exactly as scenes/town.js (after the build): 1 = slow drift, x,y = a static whole-texel offset
  const pan = q.get('pan');
  if (pan) {
    const c = engine.camera, tw = c.texelWorld, base = camInfo.target.clone(), yaw = camInfo.yaw;
    const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (pan === '1') engine.onUpdate((t) => { c.target.copy(base).addScaledVector(R, 10 * t * tw).addScaledVector(F, 4 * t * tw / Math.sin(c.pitch)); });
    else {
      const [px, py] = pan.split(',').map(Number);
      c.target.copy(base).addScaledVector(R, (px || 0) * tw).addScaledVector(F, ((py || 0) * tw) / Math.sin(c.pitch));
    }
  }
}
