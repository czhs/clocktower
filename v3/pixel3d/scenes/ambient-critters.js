// Scene "ambient-critters" (owner: critters): the ambient stage (scenes/ambient-stage.js: same gameplay camera,
// meadow clearing, dirt trail loop, pillars, wall, lantern, rocks and the SAME scripted walker route at game speed)
// plus the places the critters need: a small pond (frogs, ducks), a ruined stone stair (the ginger cat's doorstep),
// two fallen slabs + the rock pile (mouse hides). The slate cat loafs on the wall ridge, the dog lies by the lantern.
// docs/AMBIENT.md. Params as the stage: systems (default 'critters'), walker, speed, tod, still, shot, vh, follow,
// strict, grass, grade, seed; sheet=1 [&sheetFilter=cat-ginger&sheetYaw=deg] (every critter drawing in rows).
//
//   tools/ambientpack.sh critters --scene ambient-critters [--tod night]
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { createRocks } from '../src/world/rocks.js';
import { createWater } from '../src/world/water.js';
import { createPillar, createWall, createLantern, createSteps, createSlab } from '../src/world/props.js';
import { createAmbient, createFlickerLight, gameSpeed } from '../src/ambient/index.js';
import { makePath } from './ambient-stage.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;
const SHOTS = { wide: [0, 0.3, 10], pond: [1.4, -2.9, 5], flock: [-3.4, -0.8, 5], cat: [-4.4, 1.6, 4], wall: [4.2, 3.0, 4], mice: [-4.4, -2.0, 4], dog: [1.6, -0.4, 4], hens: [-2.6, -0.6, 4] };

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = ['noon', 'morning', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'noon';
  const still = P('still', '0') === '1';
  const stats = engine.stats;
  const shot = SHOTS[P('shot', 'wide')] ?? SHOTS.wide;

  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH));
  const target = scr(shot[0], shot[1]);
  // pan=dx,dy (texels, camera right / up): whole-texel crawl test (r3)
  const pan = P('pan', '').split(',').map(Number);
  const camTarget = target.clone();
  if (pan.length === 2 && pan.every(Number.isFinite)) {
    const tw = Number(P('vh', shot[2])) / 360, s = Math.sin(YAW), c = Math.cos(YAW), sp = Math.sin(PITCH), cp = Math.cos(PITCH);
    camTarget.addScaledVector(R, pan[0] * tw).add(new THREE.Vector3(-s * sp, cp, -c * sp).multiplyScalar(pan[1] * tw));
  }
  engine.camera.set({ target: camTarget, yaw: YAW, pitch: PITCH, viewHeight: Number(P('vh', shot[2])) });
  applyTimeOfDay(engine, tod);
  const cover = still ? 0 : Number(P('cover', tod === 'noon' || tod === 'morning' ? 0.45 : 0));
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });

  // ---- layout (screen metres; the wide frame is +-8.9 x +-5). Stage items keep their stage positions.
  const S = {
    flock: scr(-2.6, -0.6), fireflies: scr(3.8, -0.1), lantern: scr(2.4, 0.9),
    pillarA: scr(-5.4, 2.4), pillarB: scr(-0.6, 3.3), wall: scr(3.6, 3.1),
    pond: scr(0.9, -3.35), pondB: scr(-0.8, -3.9), stair: scr(-4.3, 1.45), slabA: scr(-4.55, -1.45), slabB: scr(-3.55, -2.45), dog: scr(1.45, -0.3),
  };
  const route = [
    [7.6, -3.6, 1.2], [-2.5, -0.7, 0], [-7.0, 0.9, 0], [-5.6, 3.9, 0], [5.6, 4.0, 3.0],
    [6.6, 0.8, 0], [3.0, -1.0, 3.0], [4.6, -3.2, 0],
  ];
  const trail = route.map(([x, y]) => scr(x, y));
  const POND = { rx: 2.3, rz: 1.6, depth: 0.95, level: -0.28 };
  const terrain = createTerrain(engine, {
    size: 44, seed: 5, height: 0.5, frequency: 0.05,
    flatten: [{ x: target.x, z: target.z, r: 9, h: 0, falloff: 6 }],
    basins: [{ x: S.pond.x, z: S.pond.z, rx: POND.rx, rz: POND.rz, rot: YAW, depth: POND.depth, edge: 0.5 },
      { x: S.pondB.x, z: S.pondB.z, rx: 1.3, rz: 1.0, rot: YAW + 0.5, depth: POND.depth, edge: 0.55 }],
    water: { level: POND.level, shoreBand: 0.12, wetBand: 0.05, shore: 'sand', bounds: { x: S.pond.x, z: S.pond.z, r: 3.0 } },
    paths: [{ points: [...trail, trail[0]].map((p) => [p.x, p.z]), width: 0.9, kind: 'dirt', noise: 0.6 }],
    zones: [{ type: 'dirt', x: S.flock.x, z: S.flock.z, r: 1.7 }],
  });
  const heightAt = (x, z) => terrain.heightAt(x, z);
  for (const v of Object.values(S)) v.y = heightAt(v.x, v.z);

  // r3: mouse pause spots: bare worn spots (grass masked r 0.3) in the sunlit meadow band above the hides
  const MPAUSE = [scr(-5.0, -0.45), scr(-4.5, -0.4), scr(-5.5, -0.55)];
  const placed = [];
  const add = (o) => { engine.scene.add(o); placed.push(o); return o; };
  const pA = add(createPillar(engine, { height: 2.0, seed: 41, position: S.pillarA, terrain, debris: false }));
  const pB = add(createPillar(engine, { height: 1.5, seed: 17, broken: true, position: S.pillarB, terrain, debris: false }));
  const wall = add(createWall(engine, { length: 3.2, height: 1.1, seed: 4, position: S.wall, terrain, yaw: YAW, rubble: false }));
  const dark = tod === 'golden' || tod === 'night';
  const lantern = add(createLantern(engine, { position: S.lantern, terrain, seed: 3, lit: dark, flicker: false, light: false }));
  // r3: the ginger cat's doorstep is ONE wide low step (the 2-step stair with no cheeks read as three crates / a
  // little fence; a ruined wall stub behind it read as a crate stack too, so it is gone).
  const STAIR = { count: 1, rise: 0.15, run: 0.46, width: 1.35 };
  // one wide doorstep SLAB (createSteps splits a step into 2-3 outlined stones: still three crates at x1)
  const stair = add(createSlab(engine, { seed: 9, position: S.stair.clone().addScaledVector(F, -STAIR.run / 2), terrain, yaw: YAW, w: STAIR.width, d: STAIR.run, h: STAIR.rise }));
  add(createSlab(engine, { seed: 33, position: S.slabA, terrain, yaw: YAW, w: 0.9, d: 0.7, h: 0.16 }));
  add(createSlab(engine, { seed: 35, position: S.slabB, terrain, yaw: YAW + Math.PI / 4, w: 0.7, d: 0.55, h: 0.14 }));
  const rockAvoid = [];
  const addRocks = (r) => { engine.scene.add(r.group); return r.avoid ?? []; };
  rockAvoid.push(...addRocks(createRocks(engine, terrain, { count: 5, seed: 8, size: [0.35, 0.7], area: { x: scr(-6.2, -2.8).x, z: scr(-6.2, -2.8).z, r: 1.6 }, pebbles: 10 })));
  rockAvoid.push(...addRocks(createRocks(engine, terrain, { count: 3, seed: 12, size: [0.3, 0.55], area: { x: scr(6.8, 2.6).x, z: scr(6.8, 2.6).z, r: 1.0 }, pebbles: 6 })));

  const top = (g, y) => new THREE.Vector3(g.position.x, g.position.y + y, g.position.z);
  const perches = [top(pA, pA.userData.height ?? 2.0), top(pB, pB.userData.height ?? 1.0)];
  const wallH = (wall.userData.height ?? 1.1) * 0.82;
  for (const s of [-0.9, 0, 0.9]) perches.push(new THREE.Vector3(S.wall.x, S.wall.y + wallH, S.wall.z).addScaledVector(R, s));
  stats.perches = perches.map((p) => p.toArray().map((v) => +v.toFixed(2)));

  const glowY = (lantern.userData.top ?? 1.5) - 0.42;
  const flicker = createFlickerLight(engine, { position: S.lantern.clone().setY(S.lantern.y + glowY), color: '#FF8A3A', intensity: 1.5, distance: 3.2, k: 2, levels: 4, depth: 0.3, seed: 5 });
  const glowMat = lantern.userData.glow?.material, glowCol = new THREE.Color('#FFC46B');
  engine.onUpdate((t) => {
    const f = flicker.update(t, dark);
    if (glowMat && dark) glowMat.emissive.copy(glowCol).multiplyScalar(0.9 * f);
  });

  // ---- pond: water on the ambient grid (wobble / waves / sparkles 7.5 fps, foam 3 fps: every change on an even
  // 30 Hz frame, so the cadence check sees only the critters)
  createWater(engine, terrain, { ...(P('reflect', '1') === '0' ? { reflection: false } : {}), level: POND.level, seed: [S.pond.x, S.pond.z], reflect: 0.35, waveCell: 1.2, spriteShore: 'none',
    wobbleFps: 7.5, waveFps: 7.5, sparkleFps: 7.5 });
  const wet = (x, z) => heightAt(x, z) < POND.level + 0.02;

  if (P('grass', '1') !== '0') {
    const area = viewArea(engine, 3);
    const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.05));
    createGrass(engine, terrain, {
      area, avoid: rockAvoid, wind: still ? { strength: 0 } : {}, flowers: { fraction: 0.03 },
      mask: (x, z) => !onStone(x, z) && !wet(x, z) && Math.hypot(x - S.flock.x, z - S.flock.z) > 1.75 && MPAUSE.every((m) => Math.hypot(x - m.x, z - m.z) > 0.3),
    });
  }
  if (P('grade', '1') !== '0') { const { addGrade } = await import('../src/post/grade.js'); addGrade(engine, {}); }

  // ---- walker (the stage's route, game speed)
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

  // ---- critter places
  const bank = (angDeg, k) => {
    // a point on the pond ellipse (screen-local angle: 0 = screen-right, 90 = screen-up) scaled by k, then pushed
    // outwards until it is dry ground at least 4 cm above the water
    const a = THREE.MathUtils.degToRad(angDeg);
    const dir = new THREE.Vector3().addScaledVector(R, Math.cos(a) * POND.rx).addScaledVector(F, Math.sin(a) * POND.rz);
    const p = S.pond.clone().addScaledVector(dir, k);
    for (let i = 0; i < 40 && heightAt(p.x, p.z) < POND.level + 0.04; i++) p.addScaledVector(dir, 0.03);
    p.y = heightAt(p.x, p.z);
    return p;
  };
  const stairTop = stair.position.clone();
  stairTop.y = stair.position.y + STAIR.rise;
  const edge = (c, toward, d) => c.clone().addScaledVector(toward.clone().sub(c).setY(0).normalize(), d);
  const critOpts = {
    cats: [
      { pos: perches[3].clone(), yaw: YAW + Math.PI / 2, perched: true, coat: 'tux', alts: [perches[2].clone(), perches[4].clone()] },
      { pos: stairTop, yaw: YAW + Math.PI / 2, coat: 'ginger', safe: perches[0].clone(), lift: stairTop.y - heightAt(stairTop.x, stairTop.z) },
    ],
    hens: { center: S.flock, count: 3, spread: 0.75 },
    water: { x: S.pond.x, z: S.pond.z, level: POND.level },
    ducks: { homes: [bank(8, 1.2), bank(-24, 1.18)] },
    frogs: { homes: [bank(122, 1.02), bank(86, 1.0), bank(52, 1.02)] },
    // r3: pauses on open ground with value contrast (the grassless, sunlit dirt of the flock patch:
    // tall meadow blades hid them in the light band)
    mice: { hides: [edge(S.slabA, scr(-4.0, -1.9), 0.42), edge(scr(-5.6, -2.5), scr(-4.6, -2.0), 0.1), edge(S.slabB, scr(-4.2, -2.0), 0.36)], count: 3, pauses: MPAUSE },
    dog: { home: S.dog, yaw: YAW + Math.PI / 2 },   // r3: lies in profile (curled), not 3/4 from behind
    sheet: P('sheet', '0') === '1', sheetYaw: Number(P('sheetYaw', 45)) * Math.PI / 180, sheetFilter: P('sheetFilter', ''), sheetCenter: target.clone(),
  };
  stats.places = { stairTop: stairTop.toArray().map((v) => +v.toFixed(2)), ducks: critOpts.ducks.homes.map((p) => p.toArray().map((v) => +v.toFixed(2))) };

  const list = P('systems', 'critters').split(',').map((s) => s.trim()).filter(Boolean);
  const strictP = P('strict', list[0] ?? '');
  const sysOpts = {
    critters: critOpts,
    '_ref-birds': { center: S.flock, count: Number(P('birds', 9)) },
    '_ref-fireflies': { center: S.fireflies, radius: 2.0 },
  };
  const amb = await createAmbient(engine, {
    systems: list.map((name) => ({ name, opts: sysOpts[name] ?? { center: S.flock } })),
    anchors: { perches, spots: { ...S, trail: trail.map((p) => p.clone()) }, lights: [{ pos: flicker.light.position.clone(), color: '#FF8A3A', r: 3.2, kind: 'lantern' }] },
    heightAt, tod, seed: Number(P('seed', 1)), strict: strictP === '1' ? true : strictP,
  });
  if (wname !== 'none') amb.actors.add({ id: 'walker', at: posAt, height: H, kind: 'walker' });

  if (P('follow', '0') === '1') engine.onUpdate((t) => { engine.camera.target.copy(engine.camera.snapWorld(posAt(t))); });
  engine.onUpdate((t) => {
    stats.ambient = amb.stats();
    const p = posAt(t), q = posAt(Math.max(0, t - 1 / 30));
    stats.walker = { name: wname, x: +p.x.toFixed(3), z: +p.z.toFixed(3), speed: +(Math.hypot(p.x - q.x, p.z - q.z) * 30).toFixed(2), clip: ch?.state?.clip ?? null, h: +H.toFixed(2) };
  });
  window.__pixel.ambient = amb;
}
