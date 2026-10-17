// Scene "ambient-gallery" (owner: ambient integration lead; docs/AMBIENT.md §12 "Using the library"): a small cozy
// plaza where EVERY ambient system runs at once, and three Clocktower cast members walk scripted loops at GAME SPEED
// (4 body heights per second) that set the reactions off one after another:
//   frog       (plaza loop)   runs through the pigeons on the setts (birds scatter), on through the tall grass west of
//                             the plaza (grass parts; at night the firefly swarm over it parts), past the yard campfire
//                             (flare) and the hens, along the laundry (a wave runs down the line), by the pond (ducks /
//                             frogs) and under the shop sign (it swings)
//   storyteller (back lane)   glides along the ruined wall (torch flare, the perched cat hops away along the ridge),
//                             walks up to the doorstep (the ginger cat bolts and leaps onto the pillar), stands, then
//                             comes back by the brazier, the lamps and the market awning (lantern light at dusk / night)
//   mincut     (east loop)    comes in through the garden gate (it swings open), past the chimes and the bushes
// Systems: birds, fire, fireflies, critters, foliage, air, props (src/ambient/*). Everything is a pure f(t).
//
//   ?tod=noon|morning|golden|night   ?cast=frog,storyteller,mincut (characters/<id>.js) ?walker=ghost|none (checks:
//   bodiless actors on the same paths | no actors)   ?systems=<list> (default all seven; '' = none)
//   ?shot=wide|plaza|cat|sign|grass|pond|wall|yard|gate|laundry   ?vh=   ?still=1 (no clouds / wind / grain: cadence checks)
//   ?grade=0  ?pan=dx,dy (whole texels, after the build: crawl test)  ?paths=1 (debug: path markers)  ?seed=
//   ?strict=<system>|1   ?speed=game|<m/s>   ?window=<s> ?ticker=live (createAmbient opts.ticker)
//   ?tdebug=1 (info().stats.tickers: mode/window:ticks of the last advance per Ticker)
// Ambientpack: tools/ambientpack.sh birds,fire,fireflies,critters,foliage,air,props --scene ambient-gallery
//              --out shots/ambient-gallery/pack-<tod> --tod <tod>
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import { createWater } from '../src/world/water.js';
import { createPillar, createWall, createSlab } from '../src/world/props.js';
import { createAmbient, gameSpeed, polylineDistance } from '../src/ambient/index.js';
import { makePath } from './ambient-stage.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;
const ALL = ['birds', 'fire', 'fireflies', 'critters', 'foliage', 'air', 'props'];
// [screen x, screen y, view height]
const SHOTS = { wide: [0, 0, 10], plaza: [-1.4, -0.8, 5], cat: [-4.8, 2.4, 5], sign: [4.5, -0.9, 5], grass: [-6.0, -0.1, 5],
  pond: [5.6, -3.2, 5], wall: [4.0, 3.6, 5], yard: [-4.6, -2.6, 5], gate: [6.9, 0.7, 5], laundry: [0.4, -2.6, 5] };

// ---- the plaza, in SCREEN metres (sx right, sy up of the wide frame's centre; the wide frame is +-8.9 x +-5)
const L = {
  plaza: [0.2, -0.4], fountain: [0.9, 0.45], pigeons: [-1.6, -1.2], sparrows: [3.75, -2.35],
  wall: [4.3, 3.4], pillarA: [-6.3, 3.1], pillarB: [-1.5, 3.95], doorstep: [-4.8, 2.0],
  chimney: [-8.1, -3.75], yard: [-4.6, -2.8], campfire: [-4.0, -2.35], hens: [-5.4, -3.1], brazier: [-2.65, 0.95],
  pond: [6.1, -3.75], dog: [2.35, -2.05], rocks: [-6.9, -4.3],
  sign: [4.65, -1.5], lampA: [-2.0, 1.75], lampB: [-0.3, -0.95], lampC: [6.5, 2.55], chimes: [7.35, 0.95], gate: [8.0, -0.15],
  awning: [5.7, 1.35], laundryA: [-1.3, -3.55], laundryB: [1.75, -3.0], puddleA: [-0.5, -2.3], puddleB: [5.3, -1.8],
  tall: [-5.9, -0.3], fireflies: [-6.0, -0.15], flowersA: [1.8, -4.35], flowersB: [-3.1, 3.55], flowersC: [7.9, -1.6],
  bushA: [-0.1, 4.35], bushB: [7.7, 3.6], bushC: [-8.2, 2.1], treeA: [-8.7, 4.6], treeB: [8.9, 4.9],
  beam: [-3.6, 4.3],
};
// walker loops: [sx, sy, dwell s]; the first point is where each one stands at t = 0
const ROUTES = {
  frog: [[4.8, 0.35, 1.4], [-1.0, -1.25, 0], [-3.4, -0.9, 0], [-5.9, -0.3, 0], [-7.7, 0.75, 1.2], [-4.8, -2.0, 0],
    [-2.2, -2.75, 0], [0.4, -2.85, 0], [3.0, -2.45, 0], [4.7, -2.05, 0], [5.6, -1.35, 0]],
  storyteller: [[9.8, 3.2, 2.2], [5.6, 2.75, 0], [2.6, 2.75, 0], [-1.0, 2.45, 0], [-3.4, 2.2, 2.6], [-2.2, 0.95, 0],
    [-0.4, 1.5, 0], [2.7, 1.1, 0], [5.0, 0.85, 0], [6.9, 1.75, 0]],
  mincut: [[8.8, 1.2, 3.6], [8.0, 0.25, 0], [7.6, -0.9, 0], [6.4, -0.3, 0], [7.0, 1.8, 0], [7.7, 2.9, 1.6], [8.6, 2.0, 0]],
};

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = ['noon', 'morning', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'noon';
  const still = P('still', '0') === '1';
  const dark = tod === 'golden' || tod === 'night';
  const stats = engine.stats;
  const shot = SHOTS[P('shot', 'wide')] ?? SHOTS.wide;

  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH));
  const S = Object.fromEntries(Object.entries(L).map(([k, [x, y]]) => [k, scr(x, y)]));
  const target = scr(shot[0], shot[1]);
  engine.camera.set({ target: target.clone(), yaw: YAW, pitch: PITCH, viewHeight: Number(P('vh', shot[2])) });
  applyTimeOfDay(engine, tod);
  const cover = still ? 0 : Number(P('cover', tod === 'noon' || tod === 'morning' ? 0.5 : 0));
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });
  if (engine.toonUniforms?.uCloudShape) engine.toonUniforms.uCloudShape.value.z = 7.5;   // cloud drift on the 15 Hz grid

  // ---- terrain: flat plaza of setts, dirt lanes along the walker loops, a dirt yard, a pond
  const routes = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, r.map(([x, y]) => scr(x, y))]));
  const POND = { rx: 1.9, rz: 1.25, depth: 0.9, level: -0.26 };
  const lane = (pts, closed = true) => ({ points: (closed ? [...pts, pts[0]] : pts).map((p) => [p.x, p.z]), width: 0.85, kind: 'dirt', noise: 0.55 });
  // the frog's meadow legs (plaza -> tall grass -> turn -> back to the yard) stay GRASS: that is where the grass parts
  const frogLane = [...routes.frog.slice(5), ...routes.frog.slice(0, 3)];
  const terrain = createTerrain(engine, {
    size: 52, seed: 11, height: 0.45, frequency: 0.05,
    flatten: [{ x: S.plaza.x, z: S.plaza.z, r: 16, h: 0, falloff: 6 }],
    basins: [{ x: S.pond.x, z: S.pond.z, rx: POND.rx, rz: POND.rz, rot: YAW, depth: POND.depth, edge: 0.5 }],
    water: { level: POND.level, shoreBand: 0.12, wetBand: 0.05, shore: 'sand', bounds: { x: S.pond.x, z: S.pond.z, r: 2.8 } },
    paths: [lane(frogLane, false), lane(routes.storyteller)],
    zones: [{ type: 'cobble', x: S.plaza.x, z: S.plaza.z, r: 2.7, noise: 0.3 }, { type: 'dirt', x: S.yard.x, z: S.yard.z, r: 1.55 },
      { type: 'dirt', x: S.doorstep.x, z: S.doorstep.z, r: 0.9 }],
  });
  const heightAt = (x, z) => terrain.heightAt(x, z);
  for (const v of Object.values(S)) v.y = heightAt(v.x, v.z);
  const wet = (x, z) => heightAt(x, z) < POND.level + 0.02;

  // ---- solid props (perches, the doorstep, the chimney stack, mouse rocks)
  const placed = [];
  const add = (o) => { engine.scene.add(o); placed.push(o); return o; };
  const pA = add(createPillar(engine, { height: 2.0, seed: 41, position: S.pillarA, terrain, debris: false }));
  const pB = add(createPillar(engine, { height: 1.5, seed: 17, broken: true, position: S.pillarB, terrain, debris: false }));
  const wall = add(createWall(engine, { length: 3.2, height: 1.1, seed: 4, position: S.wall, terrain, yaw: YAW, rubble: false }));
  const STEP = { rise: 0.15, run: 0.46, width: 1.35 };
  const slab = add(createSlab(engine, { seed: 9, position: S.doorstep.clone().addScaledVector(F, -STEP.run / 2), terrain, yaw: YAW, w: STEP.width, d: STEP.run, h: STEP.rise }));
  const chim = add(createPillar(engine, { height: 2.1, seed: 29, width: 0.6, position: S.chimney, terrain, debris: false }));
  const chimTop = S.chimney.clone().setY(S.chimney.y + (chim.userData.height ?? 2.1));
  const rockAvoid = [];
  const rocks = createRocks(engine, terrain, { count: 4, seed: 8, size: [0.35, 0.6], area: { x: S.rocks.x, z: S.rocks.z, r: 1.0 }, pebbles: 8 });
  engine.scene.add(rocks.group); rockAvoid.push(...(rocks.avoid ?? []));

  const top = (g, y) => new THREE.Vector3(g.position.x, g.position.y + y, g.position.z);
  const perches = [top(pA, pA.userData.height ?? 2.0), top(pB, pB.userData.height ?? 1.0)];
  const wallH = (wall.userData.height ?? 1.1) * 0.82;
  for (const s of [-0.9, 0, 0.9]) perches.push(new THREE.Vector3(S.wall.x, S.wall.y + wallH, S.wall.z).addScaledVector(R, s));
  // snap the wall perches onto the real top course (birds scene recipe: a crow must not float over a lower step)
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  const stones = [];
  engine.scene.updateMatrixWorld(true);
  wall.traverse((m) => { if (m.isMesh) stones.push(m); });
  const topAt = (x, z, y0) => {
    ray.set(o.set(x, y0 + 1.2, z), down); ray.far = 2.0;
    const hit = ray.intersectObjects(stones, false).find((h) => h.point.y > y0 - 0.7);
    ray.far = Infinity;
    return hit ? hit.point.y : null;
  };
  const perchSlots = perches.map(() => null);
  for (let k = 2; k < perches.length; k++) {
    let best = null;
    for (let s = -8; s <= 8; s++) {
      const q = perches[k].clone().addScaledVector(R, s * 0.05), y = topAt(q.x, q.z, perches[k].y);
      if (y === null) continue;
      if (!best || y > best.y + 0.04 || (Math.abs(y - best.y) <= 0.04 && Math.abs(s) < Math.abs(best.s))) best = { s, y, q };
    }
    if (!best) continue;
    perches[k] = best.q.setY(best.y);
    perchSlots[k] = [-1, 0, 1].filter((j) => [0.5, 1, 1.25].every((f) => {
      const q = perches[k].clone().addScaledVector(R, j * 0.13 * f), y = topAt(q.x, q.z, best.y);
      return y !== null && Math.abs(y - best.y) <= 0.03;
    }));
  }
  stats.perches = perches.map((p) => p.toArray().map((v) => +v.toFixed(2)));

  // ---- pond water on the ambient grid
  createWater(engine, terrain, { ...(P('reflect', '1') === '0' ? { reflection: false } : {}), level: POND.level, seed: [S.pond.x, S.pond.z], reflect: 0.35, waveCell: 1.2, spriteShore: 'none',
    wobbleFps: 7.5, waveFps: 7.5, sparkleFps: 7.5, ...(still ? { waves: false, sparkles: false, wobble: 0, foam: 0 } : {}) });

  // ---- trees (leaf sources), wind on the grid (3.75 fps), still = no sway
  const sources = [];
  {
    const { createTree, treeUniforms } = await import('../src/world/trees.js');
    const tu = treeUniforms(engine).uWind.value;
    tu.z = 3.75;
    if (still) { tu.x = 0; tu.w = 9; }
    for (const [k, sd, h, r] of [['treeA', 21, 4.2, 1.7], ['treeB', 9, 4.4, 1.8]]) {
      const pos = S[k].clone();
      const tr = createTree(engine, { position: pos, seed: sd, height: h, radius: r, kind: 'round' });
      for (const c of tr.userData.tree.crowns.slice(0, 3)) sources.push({ x: pos.x + c.c.x, y: pos.y + c.c.y - c.r * 0.6, z: pos.z + c.c.z, r: c.r * 0.8 });
      placed.push(tr);
    }
  }
  if (P('grade', '1') !== '0') { const { addGrade } = await import('../src/post/grade.js'); addGrade(engine, still ? { grain: 0 } : {}); }

  // ---- cast: Clocktower characters (or bodiless actors) on closed loops at game speed
  const walkerMode = ['ghost', 'none'].includes(P('walker')) ? P('walker') : 'cast';   // cast (default; any other value) | ghost | none
  const castIds = P('cast', 'frog,storyteller,mincut').split(',').map((s) => s.trim()).filter((s) => ROUTES[s]);
  const walkers = [];
  const { Character } = walkerMode === 'cast' ? await import('../src/chars/character.js') : {};
  for (const id of castIds) {
    if (walkerMode === 'none') break;
    const pts = routes[id];
    let ch = null, H = { frog: 1.0, storyteller: 1.6, mincut: 1.1 }[id] ?? 1.3;
    if (walkerMode === 'cast') {
      const spec = (await import(`../characters/${id}.js`)).default;
      ch = new Character(engine, spec, { ground: terrain, facingSteps: 8, snap: true, position: pts[0].clone(), face: Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z) });
      H = ch.rig?.height ?? spec.height ?? H;
    }
    const sp = P('speed', 'game');
    const speed = sp === 'game' ? gameSpeed(Math.min(H, 1.45)) : Number(sp);   // staff / ears do not make anyone faster
    const path = makePath(ROUTES[id].map(([, , dwell], i) => ({ p: pts[i].clone().setY(0), dwell })), speed);
    const posAt = (t) => { const p = path.at(t); p.y = heightAt(p.x, p.z); return p; };
    if (ch) { ch.drive((t) => ({ pos: posAt(t) })); engine.scene.add(ch.root); }
    walkers.push({ id, ch, H, speed, path, posAt });
  }
  stats.cast = walkers.map((w) => ({ id: w.id, H: +w.H.toFixed(2), speed: +w.speed.toFixed(2), period: +w.path.period.toFixed(2), legs: w.path.legs.map((l) => +l.t1.toFixed(2)) }));

  // ---- keep-out tests shared by the systems
  const laneD = (x, z) => Math.min(polylineDistance(x, z, frogLane, false), polylineDistance(x, z, routes.storyteller), polylineDistance(x, z, routes.mincut));
  const inPlaza = (x, z) => Math.hypot(x - S.plaza.x, z - S.plaza.z) < 2.6;
  const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.05));
  const offRocks = (x, z) => !rockAvoid.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r);
  const lampGlass = (k) => S[k].clone().addScaledVector(R, 0.5).setY(S[k].y + 1.76);

  // ---- system options (every position from the table L)
  const face = YAW;   // props / fire: local +Z towards the camera, +X screen right
  const bank = (angDeg, k) => {   // a dry point on the pond's bank (screen-local angle), as in scenes/ambient-critters.js
    const a = THREE.MathUtils.degToRad(angDeg);
    const dir = new THREE.Vector3().addScaledVector(R, Math.cos(a) * POND.rx).addScaledVector(F, Math.sin(a) * POND.rz);
    const p = S.pond.clone().addScaledVector(dir, k);
    for (let i = 0; i < 40 && heightAt(p.x, p.z) < POND.level + 0.04; i++) p.addScaledVector(dir, 0.03);
    p.y = heightAt(p.x, p.z);
    return p;
  };
  const doorTop = slab.position.clone(); doorTop.y = slab.position.y + STEP.rise;
  const vh = Number(P('vh', shot[2]));
  const OPTS = {
    birds: {
      center: S.pigeons, sparrows: S.sparrows, perches, perchSlots, perchDirs: perches.map((p, k) => (k >= 2 ? R.clone() : null)),
      groundOk: (x, z) => inPlaza(x, z) || laneD(x, z) < 0.3, pigeons: 7, sparrowCount: 5, crowsDay: 3, crowsDusk: 5, groundCrows: 3,
      frame: { target: engine.camera.target.clone(), halfW: vh * 8 / 9, halfH: vh / 2 }, pitch: PITCH,
    },
    fire: {
      fires: [
        { id: 'campfire', kind: 'campfire', pos: S.campfire, yaw: face },
        { id: 'brazier', kind: 'brazier', pos: S.brazier, yaw: face },
        { id: 'torch', kind: 'torch', pos: S.wall.clone().addScaledVector(R, -0.9).addScaledVector(F, -0.27).setY(0), yaw: face, mount: 0.62 },
      ],
      lights: ['campfire'],
    },
    fireflies: {
      swarms: [{ c: S.fireflies, r: 1.7, n: 24 }, { c: scr(2.4, 3.3), r: 1.0, n: 8 }],
      gardens: [{ c: S.flowersA, r: 0.9, n: 6 }, { c: S.flowersB, r: 0.8, n: 5 }],
      glow: [{ c: S.wall.clone().addScaledVector(F, -0.5), r: 0.15, n: 8, along: 1.4 }, { c: S.pillarA.clone().addScaledVector(F, -0.45), r: 0.3, n: 4 }],
      water: [S.pond], lamps: [lampGlass('lampA'), lampGlass('lampB')], mothsPerLamp: 3,
      avoid: (x, z) => inPlaza(x, z) || laneD(x, z) < 0.9 || wet(x, z),
    },
    critters: {
      cats: [
        { pos: perches[3].clone(), yaw: YAW + Math.PI / 2, perched: true, coat: 'tux', alts: [perches[2].clone(), perches[4].clone()] },
        { pos: doorTop, yaw: YAW + Math.PI / 2, coat: 'ginger', safe: perches[0].clone(), lift: doorTop.y - heightAt(doorTop.x, doorTop.z) },
      ],
      hens: { center: S.hens, count: 3, spread: 0.6 },
      water: { x: S.pond.x, z: S.pond.z, level: POND.level },
      ducks: { homes: [bank(160, 1.15), bank(120, 1.12)] },
      frogs: { homes: [bank(200, 1.0), bank(235, 1.02)] },
      mice: { hides: rockAvoid.slice(0, 3).map((a) => new THREE.Vector3(a.x, heightAt(a.x, a.z), a.z).addScaledVector(F, -0.15)), count: 2 },
      dog: { home: S.dog, yaw: YAW + Math.PI / 2 },
    },
    foliage: {
      terrain, mask: (x, z) => !onStone(x, z) && offRocks(x, z),
      tall: [{ x: S.tall.x, z: S.tall.z, r: 1.3 }],
      flowers: [{ x: S.flowersA.x, z: S.flowersA.z, r: 0.6, tints: ['#CA91E3', '#A875D7', '#DC9EFF'] },
        { x: S.flowersB.x, z: S.flowersB.z, r: 0.55, tints: ['#E6D36A', '#EDEBDA'] }, { x: S.flowersC.x, z: S.flowersC.z, r: 0.5, tints: ['#EDEBDA', '#CA91E3'] }],
      reeds: [{ ...xz(bank(20, 1.0)), r: 0.45 }, { ...xz(bank(-60, 1.0)), r: 0.4 }],
      bushes: [{ ...xz(S.bushA), r: 0.6, h: 0.8, seed: 3 }, { ...xz(S.bushB), r: 0.6, h: 0.8, seed: 5 }, { ...xz(S.bushC), r: 0.62, h: 0.85, seed: 8 }],
      leafSources: sources, leaves: 14, wind: { strength: 0.5, gust: 1 }, still,
    },
    air: {
      wind: { dir: R.clone().addScaledVector(F, 0.22).normalize(), strength: 0.4, every: 5.4, first: 1.3, center: scr(0, 0),
        spots: [scr(-2.6, -3.0), scr(-6.0, 1.2), scr(4.2, 2.2)].map((p, i) => p.setY([1.3, 1.0, 1.2][i])) },
      laundry: [{ a: S.laundryA.clone().setY(1.7), b: S.laundryB.clone().setY(1.7), sag: 0.14, items: [
        { u: 0.14, w: 0.56, h: 0.78, tones: 'linen', band: 'blue' }, { u: 0.34, w: 0.4, h: 0.52, tones: 'blue' },
        { u: 0.5, w: 0.15, h: 0.3, tones: 'ochre', mass: 0.7 }, { u: 0.66, w: 0.66, h: 0.86, tones: 'linen', band: 'red', mass: 1.2 },
        { u: 0.86, w: 0.38, h: 0.55, tones: 'sage', taper: 0.8 }] }],
      awnings: [{ pos: S.awning, yaw: YAW - 0.5, w: 1.8, d: 1.0, hBack: 2.15, hFront: 1.6, flaps: 6, flapH: 0.28, tones: ['linen', 'red'] }],
      bunting: [{ a: lampGlass('lampA').setY(2.3), b: lampGlass('lampB').setY(2.3), sag: 0.3, n: 7, size: 0.3, tones: ['red', 'ochre', 'linen', 'blue'] }],
      chimneys: [chimTop],
      puddles: [{ pos: S.puddleA, r: 0.42 }, { pos: S.puddleB, r: 0.45 }],
      beams: [{ pos: S.beam, r: 0.6, h: 1.8, count: 26, sun: new THREE.Vector3(-0.9, 1, -0.1), tods: ['noon', 'morning'] }],
      dustAt: (x, z) => laneD(x, z) < 0.6 || Math.hypot(x - S.yard.x, z - S.yard.z) < 1.5,
    },
    props: {
      props: [
        { id: 'sign', kind: 'sign', pos: S.sign, yaw: face - Math.PI / 4 },
        { id: 'fountain', kind: 'fountain', pos: S.fountain, yaw: face },
        { id: 'lampA', kind: 'lamp', pos: S.lampA, yaw: face },
        { id: 'lampB', kind: 'lamp', pos: S.lampB, yaw: face },
        { id: 'lampC', kind: 'lamp', pos: S.lampC, yaw: face },
        { id: 'chimes', kind: 'chimes', pos: S.chimes, yaw: face },
        { id: 'gate', kind: 'gate', pos: S.gate, yaw: face },
      ],
      lights: ['lampB'],
    },
  };
  function xz(p) { return { x: p.x, z: p.z }; }

  const sp = P('systems', ALL.join(','));
  const list = sp.split(',').map((s) => s.trim()).filter(Boolean);
  const strictP = P('strict', '1');
  const lights = [{ pos: lampGlass('lampA'), color: '#FFC46B', r: 1.8, kind: 'lamp' }, { pos: lampGlass('lampB'), color: '#FFC46B', r: 1.8, kind: 'lamp' },
    { pos: S.campfire.clone().setY(0.5), color: '#FF6836', r: 1.6, kind: 'fire' }];
  if (P('tdebug') === '1') {   // debug: count Ticker ticks / modes (catch-up cost checks)
    const { Ticker } = await import('../src/ambient/core.js');
    const adv = Ticker.prototype.advance, all = [];
    Ticker.prototype.advance = function (t) { if (!all.includes(this)) all.push(this); const a = this.ticks; const r = adv.call(this, t); this._last = this.ticks - a; return r; };
    engine.onUpdate(() => { stats.tickers = all.map((k) => `${k.mode}/${k.window}:${k._last}`).join(' '); });
  }
  const amb = await createAmbient(engine, {
    systems: list.map((name) => ({ name, opts: OPTS[name] ?? {} })),
    anchors: { perches, chimneys: [chimTop], lights, seats: [], doors: [],
      spots: { ...S, flock: S.pigeons, water: S.pond, trail: frogLane.map((p) => p.clone()) } },
    heightAt, tod, seed: Number(P('seed', 1)), strict: strictP === '1' ? true : strictP,
    ...(P('window') || P('ticker') ? { ticker: { ...(P('window') ? { window: Number(P('window')) } : {}), ...(P('ticker') === 'live' ? { mode: 'live' } : {}) } } : {}),   // docs/AMBIENT.md §10.4
  });
  for (const w of walkers) amb.actors.add({ id: w.id, at: w.posAt, height: w.H, kind: w.id === 'storyteller' ? 'storyteller' : 'walker' });

  // debug: path markers (one 2-texel sphere every 0.5 m)
  if (P('paths', '0') === '1') {
    const m = new THREE.MeshBasicMaterial({ color: '#ff00ff' }), g = new THREE.SphereGeometry(0.06, 6, 4);
    for (const w of walkers) for (let t = 0; t < w.path.period; t += 0.5 / w.speed) { const s = new THREE.Mesh(g, m); s.position.copy(w.posAt(t)).setY(0.05); engine.scene.add(s); }
  }
  const pan = P('pan', '');
  if (pan) {
    const [dx, dy] = pan.split(',').map(Number);
    const cam = engine.camera;
    cam.update();
    const tw = cam.texelWorld;
    cam.target.addScaledVector(cam.right, dx * tw).addScaledVector(cam.up, dy * tw);
  }
  engine.onUpdate((t) => {
    stats.ambient = amb.stats();
    stats.walkers = walkers.map((w) => { const p = w.posAt(t); return `${w.id}:${p.x.toFixed(2)},${p.z.toFixed(2)}:${w.ch?.state?.clip ?? '-'}`; }).join(' ');
  });
  // ambientpack reads stats.walker / stats.path (its INFO row) — the frog is the lead walker
  if (walkers[0]) stats.path = { period: +walkers[0].path.period.toFixed(3), speed: +walkers[0].speed.toFixed(2), H: +walkers[0].H.toFixed(2) };
  window.__pixel.ambient = amb;
}
