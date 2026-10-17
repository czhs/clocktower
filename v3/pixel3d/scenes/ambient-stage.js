// Scene "ambient-stage" (owner: ambient-core): the test stage every ambient system is dropped into (docs/AMBIENT.md).
// A small meadow clearing (dirt trail, a pecking spot, two pillars + a ruined wall as perches, a lantern, rocks)
// framed at the GAMEPLAY camera (yaw 45°, pitch 30°, vh 10 at 640x360 scale 1), and a SCRIPTED WALKER that runs a
// closed loop through it at GAME SPEED (4 body heights per second, docs/AMBIENT.md §Game speed): it bursts through
// the flock, runs past the far side, rests far away (the flock returns), comes back and STOPS 3 m from the flock
// (they alert, then settle), then leaves and closes the loop. Everything is a pure function of t.
//
//   ?systems=_ref-birds,_ref-fireflies   systems to load (src/ambient/<name>.js; '' = none). Every system gets the
//                         stage anchors: { perches, spots: { flock, fireflies, lantern, trail0.. } } + heightAt.
//   ?walker=wanderer      characters/<name>.js driven along the path | ghost (an actor with no body: hold / cadence
//                         checks) | none (no actor at all)
//   ?speed=game|walk|run|<m/s>   game (default) = 4 x the walker's height per second (wanderer 1.38 m -> 5.5 m/s)
//   ?tod=noon|morning|golden|night   (default noon)        ?still=1  no cloud shadows, no grass wind (checks)
//   ?shot=wide|flock|lamp  camera framing (wide = gameplay view of the whole stage); ?vh= overrides the view height
//   ?follow=1             camera follows the walker (snapped to the texel grid)
//   ?strict=<system>|1    a failing system fails the page (default: the first listed system)
//   ?grass=0 ?grade=0 ?seed=<n>  ?sheet=1&sheetYaw=<deg>  _ref-birds look-dev: every drawing in a row
// Debug (info().stats): ambient = per-system stats (+ updateMs), walker = { x, z, speed, clip, h }, path = { period }
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { createRocks } from '../src/world/rocks.js';
import { createPillar, createWall, createLantern } from '../src/world/props.js';
import { createAmbient, createFlickerLight, gameSpeed } from '../src/ambient/index.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;
const SHOTS = { wide: [0, 0.3, 10], flock: [-2.6, -0.6, 5], lamp: [3.6, 0.6, 6] };

/** Closed polyline path with dwells, as a pure function of t. pts: [{p: Vector3, dwell}] (last returns to first). */
export function makePath(pts, speed) {
  const legs = [];
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a.dwell) { legs.push({ t0: t, t1: t + a.dwell, a: a.p, b: a.p }); t += a.dwell; }
    const len = a.p.distanceTo(b.p);
    legs.push({ t0: t, t1: t + len / speed, a: a.p, b: b.p }); t += len / speed;
  }
  const period = t;
  const at = (time, out = new THREE.Vector3()) => {
    const u = ((time % period) + period) % period;
    const L = legs.find((l) => u < l.t1) ?? legs[legs.length - 1];
    const f = L.t1 > L.t0 ? (u - L.t0) / (L.t1 - L.t0) : 0;
    return out.lerpVectors(L.a, L.b, Math.min(1, Math.max(0, f)));
  };
  return { at, period, legs };
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = ['noon', 'morning', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'noon';
  const still = P('still', '0') === '1';
  const stats = engine.stats;
  const shot = SHOTS[P('shot', 'wide')] ?? SHOTS.wide;

  // ---- camera: authored in SCREEN metres (scr(sx, sy) = ground point that projects sx right, sy up of centre)
  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH));
  const target = scr(shot[0], shot[1]);
  engine.camera.set({ target: target.clone(), yaw: YAW, pitch: PITCH, viewHeight: Number(P('vh', shot[2])) });
  applyTimeOfDay(engine, tod);
  const cover = still ? 0 : Number(P('cover', tod === 'noon' || tod === 'morning' ? 0.45 : 0));
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });

  // ---- layout (screen metres; the wide frame is +-8.9 x +-5)
  const S = {
    flock: scr(-2.6, -0.6), fireflies: scr(3.8, -0.1), lantern: scr(2.4, 0.9),
    pillarA: scr(-5.4, 2.4), pillarB: scr(-0.6, 3.3), wall: scr(3.6, 3.1),
  };
  const route = [
    [7.6, -3.6, 1.2], [-2.5, -0.7, 0], [-7.0, 0.9, 0], [-5.6, 3.9, 0], [5.6, 4.0, 3.0],
    [6.6, 0.8, 0], [3.0, -1.0, 3.0], [4.6, -3.2, 0],
  ];
  const trail = route.map(([x, y]) => scr(x, y));
  const terrain = createTerrain(engine, {
    size: 44, seed: 5, height: 0.5, frequency: 0.05,
    flatten: [{ x: target.x, z: target.z, r: 9, h: 0, falloff: 6 }],
    paths: [{ points: [...trail, trail[0]].map((p) => [p.x, p.z]), width: 0.9, kind: 'dirt', noise: 0.6 }],
    zones: [{ type: 'dirt', x: S.flock.x, z: S.flock.z, r: 1.7 }],
  });
  const heightAt = (x, z) => terrain.heightAt(x, z);
  for (const v of Object.values(S)) v.y = heightAt(v.x, v.z);

  // props (perch sources)
  const placed = [];
  const add = (o) => { engine.scene.add(o); placed.push(o); return o; };
  const pA = add(createPillar(engine, { height: 2.0, seed: 41, position: S.pillarA, terrain, debris: false }));
  const pB = add(createPillar(engine, { height: 1.5, seed: 17, broken: true, position: S.pillarB, terrain, debris: false }));
  const wall = add(createWall(engine, { length: 3.2, height: 1.1, seed: 4, position: S.wall, terrain, yaw: YAW, rubble: false }));
  const dark = tod === 'golden' || tod === 'night';
  const lantern = add(createLantern(engine, { position: S.lantern, terrain, seed: 3, lit: dark, flicker: false, light: false }));
  const rockAvoid = [];
  const addRocks = (r) => { engine.scene.add(r.group); return r.avoid ?? []; };
  rockAvoid.push(...addRocks(createRocks(engine, terrain, { count: 5, seed: 8, size: [0.35, 0.7], area: { x: scr(-6.2, -2.8).x, z: scr(-6.2, -2.8).z, r: 1.6 }, pebbles: 10 })));
  rockAvoid.push(...addRocks(createRocks(engine, terrain, { count: 3, seed: 12, size: [0.3, 0.55], area: { x: scr(6.8, 2.6).x, z: scr(6.8, 2.6).z, r: 1.0 }, pebbles: 6 })));

  // perches: pillar tops (a stage of 3 slots each), the wall's top ridge
  const top = (g, y) => new THREE.Vector3(g.position.x, g.position.y + y, g.position.z);
  const perches = [top(pA, pA.userData.height ?? 2.0), top(pB, pB.userData.height ?? 1.0)];
  const wallH = (wall.userData.height ?? 1.1) * 0.82;
  for (const s of [-0.9, 0, 0.9]) perches.push(new THREE.Vector3(S.wall.x, S.wall.y + wallH, S.wall.z).addScaledVector(R, s));
  stats.perches = perches.map((p) => p.toArray().map((v) => +v.toFixed(2)));

  // lantern light: one flickering PointLight on the ambient grid, the glow synced to it (golden / night only).
  // The PointLight always exists (adding one later recompiles every material); by day it is at 0.
  const glowY = (lantern.userData.top ?? 1.5) - 0.42;
  const flicker = createFlickerLight(engine, { position: S.lantern.clone().setY(S.lantern.y + glowY), color: '#FF8A3A', intensity: 1.5, distance: 3.2, k: 2, levels: 4, depth: 0.3, seed: 5 });
  const glowMat = lantern.userData.glow?.material, glowCol = new THREE.Color('#FFC46B');
  engine.onUpdate((t) => {
    const f = flicker.update(t, dark);
    if (glowMat && dark) glowMat.emissive.copy(glowCol).multiplyScalar(0.9 * f);
  });

  if (P('grass', '1') !== '0') {
    const area = viewArea(engine, 3);
    const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.05));
    createGrass(engine, terrain, {
      area, avoid: rockAvoid, wind: still ? { strength: 0 } : {}, flowers: { fraction: 0.03 },
      mask: (x, z) => !onStone(x, z) && Math.hypot(x - S.flock.x, z - S.flock.z) > 1.75,
    });
  }
  if (P('grade', '1') !== '0') { const { addGrade } = await import('../src/post/grade.js'); addGrade(engine, {}); }

  // ---- walker
  const wname = P('walker', 'wanderer');
  let ch = null, H = 1.38, walkSpec = null;
  if (wname !== 'ghost' && wname !== 'none') {
    const [{ Character }, spec] = await Promise.all([import('../src/chars/character.js'), import(`../characters/${wname}.js`).then((m) => m.default)]);
    ch = new Character(engine, spec, { ground: terrain, facingSteps: 8, snap: true, position: trail[0].clone(), face: Math.atan2(trail[1].x - trail[0].x, trail[1].z - trail[0].z) });
    H = ch.rig?.height ?? spec.height ?? H;
    walkSpec = spec;
  }
  const sp = P('speed', 'game');
  const speed = sp === 'game' ? gameSpeed(H) : sp === 'walk' ? walkSpec?.locomotion?.walkSpeed ?? 1.3 : sp === 'run' ? walkSpec?.locomotion?.runSpeed ?? 3.2 : Number(sp);
  const path = makePath(route.map(([, , dwell], i) => ({ p: trail[i].clone().setY(0), dwell })), speed);
  const posAt = (t) => { const p = path.at(t); p.y = heightAt(p.x, p.z); return p; };
  if (ch) { ch.drive((t) => ({ pos: posAt(t) })); engine.scene.add(ch.root); }
  stats.path = { period: +path.period.toFixed(3), speed: +speed.toFixed(2), H: +H.toFixed(2), bodyHeightsPerSec: +(speed / H).toFixed(2),
    legs: path.legs.map((l) => +l.t1.toFixed(2)) };

  // ---- ambient systems
  const list = P('systems', '_ref-birds,_ref-fireflies').split(',').map((s) => s.trim()).filter(Boolean);
  const strictP = P('strict', list[0] ?? '');
  const sysOpts = {
    '_ref-birds': { center: S.flock, count: Number(P('birds', 9)), sheet: P('sheet', '0') === '1', sheetYaw: Number(P('sheetYaw', 0)) * Math.PI / 180 },
    '_ref-fireflies': { center: S.fireflies, radius: 2.0 },
  };
  const amb = await createAmbient(engine, {
    systems: list.map((name) => ({ name, opts: sysOpts[name] ?? { center: S.flock } })),
    anchors: { perches, spots: { ...S, trail: trail.map((p) => p.clone()) }, lights: [{ pos: flicker.light.position.clone(), color: '#FF8A3A', r: 3.2, kind: 'lantern' }] },
    heightAt, tod, seed: Number(P('seed', 1)), strict: strictP === '1' ? true : strictP,
  });
  if (wname !== 'none') amb.actors.add({ id: 'walker', at: posAt, height: H, kind: 'walker' });

  if (P('follow', '0') === '1') {
    engine.onUpdate((t) => { engine.camera.target.copy(engine.camera.snapWorld(posAt(t))); });
  }
  // stats for the tools (shot.mjs prints info(): JSON)
  engine.onUpdate((t) => {
    stats.ambient = amb.stats();
    const p = posAt(t), q = posAt(Math.max(0, t - 1 / 30));
    stats.walker = { name: wname, x: +p.x.toFixed(3), z: +p.z.toFixed(3), speed: +(Math.hypot(p.x - q.x, p.z - q.z) * 30).toFixed(2), clip: ch?.state?.clip ?? null, h: +H.toFixed(2) };
  });
  window.__pixel.ambient = amb;
}
