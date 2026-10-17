// Scene "ambient-foliage" (owner: foliage): the ambient stage (scenes/ambient-stage.js: same camera, same
// closed walker route at GAME SPEED, same pillars / wall / lantern / rocks) re-planted for the foliage system:
// the walker leaves the dirt trail for the meadow on its first two legs and crosses two tall-grass patches,
// a lilac flower clump and the flock clearing's grass; skirts a reed pond; brushes two bushes on the top leg and
// one on the right; stands 3 s beside a yellow flower clump. Two trees in the corners shed leaves down the wind.
// The foliage field (every short tuft reacts) replaces the world grass in view. Pure function of t.
//
//   ?systems=foliage   (default; other ambient systems can be listed too)   ?walker=wanderer|hound|ghost|none
//   ?speed=game|walk|run|<m/s>   ?tod=noon|morning|golden|night   ?still=1 (no clouds, still trees, still water)
//   ?fwind=0           foliage wind off (reactions only)     ?gust=<gain>  ?wind=<strength>
//   ?shot=wide|tall|bush|pond|flowers   ?vh=   ?follow=1   ?strict=   ?grade=0   ?seed=   ?trees=0   ?pond=0
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createRocks } from '../src/world/rocks.js';
import { createPillar, createWall, createLantern } from '../src/world/props.js';
import { createAmbient, createFlickerLight, gameSpeed } from '../src/ambient/index.js';
import { makePath } from './ambient-stage.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;
const SHOTS = { wide: [0, 0.3, 10], tall: [-3.2, -0.4, 5], bush: [1.0, 3.2, 5], pond: [-6.6, 2.2, 5], flowers: [3.4, -1.8, 5] };

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = ['noon', 'morning', 'golden', 'night'].includes(P('tod')) ? P('tod') : 'noon';
  const still = P('still', '0') === '1';
  const stats = engine.stats;
  const shot = SHOTS[P('shot', 'wide')] ?? SHOTS.wide;

  // ---- camera (stage framing: screen metres; the wide frame is +-8.9 x +-5)
  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH));
  const center = scr(0, 0.3);
  const target = scr(shot[0], shot[1]);
  engine.camera.set({ target: target.clone(), yaw: YAW, pitch: PITCH, viewHeight: Number(P('vh', shot[2])) });
  applyTimeOfDay(engine, tod);
  const cover = still ? 0 : Number(P('cover', tod === 'noon' || tod === 'morning' ? 0.45 : 0));
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });
  // every animated layer on the 15 Hz ambient grid: cloud drift 7.5 fps (k = 2), tree wind 3.75 fps (k = 4)
  if (engine.toonUniforms.uCloudShape) engine.toonUniforms.uCloudShape.value.z = 7.5;

  // ---- layout (stage positions; the route is the stage's)
  const S = {
    flock: scr(-2.6, -0.6), fireflies: scr(3.8, -0.1), lantern: scr(2.4, 0.9),
    pillarA: scr(-5.4, 2.4), pillarB: scr(-0.6, 3.3), wall: scr(3.6, 3.1), pond: scr(-7.9, 2.5),
  };
  const route = [
    [7.6, -3.6, 1.2], [-2.5, -0.7, 0], [-7.0, 0.9, 0], [-5.6, 3.9, 0], [5.6, 4.0, 3.0],
    [6.6, 0.8, 0], [3.0, -1.0, 3.0], [4.6, -3.2, 0],
  ];
  const trail = route.map(([x, y]) => scr(x, y));
  const usePond = P('pond', '1') !== '0';
  const pondR = 1.25, level = -0.14;
  // the dirt trail only on the far legs (P3 -> P0); the first legs cross the meadow
  const dirt = [3, 4, 5, 6, 7, 0].map((i) => [trail[i].x, trail[i].z]);
  const terrain = createTerrain(engine, {
    size: 44, seed: 5, height: 0.5, frequency: 0.05,
    flatten: [{ x: center.x, z: center.z, r: 9, h: 0, falloff: 6 }],
    basins: usePond ? [{ x: S.pond.x, z: S.pond.z, rx: pondR + 0.35, depth: 0.55, edge: 0.35 }] : [],
    water: usePond ? { level, shoreBand: 0.12, wetBand: 0.06, shore: 'mud', bounds: { x: S.pond.x, z: S.pond.z, r: pondR + 0.8 } } : undefined,
    paths: [{ points: dirt, width: 0.9, kind: 'dirt', noise: 0.6 }],
  });
  const heightAt = (x, z) => terrain.heightAt(x, z);
  for (const v of Object.values(S)) v.y = heightAt(v.x, v.z);

  // props
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
  const top = (g, y) => new THREE.Vector3(g.position.x, g.position.y + y, g.position.z);
  const perches = [top(pA, pA.userData.height ?? 2.0), top(pB, pB.userData.height ?? 1.0)];
  const wallH = (wall.userData.height ?? 1.1) * 0.82;
  for (const s of [-0.9, 0, 0.9]) perches.push(new THREE.Vector3(S.wall.x, S.wall.y + wallH, S.wall.z).addScaledVector(R, s));

  const glowY = (lantern.userData.top ?? 1.5) - 0.42;
  const flicker = createFlickerLight(engine, { position: S.lantern.clone().setY(S.lantern.y + glowY), color: '#FF8A3A', intensity: 1.5, distance: 3.2, k: 2, levels: 4, depth: 0.3, seed: 5 });
  const glowMat = lantern.userData.glow?.material, glowCol = new THREE.Color('#FFC46B');
  engine.onUpdate((t) => {
    const f = flicker.update(t, dark);
    if (glowMat && dark) glowMat.emissive.copy(glowCol).multiplyScalar(0.9 * f);
  });

  // trees in two corners (leaf sources). Tree wind on the ambient grid (3.75 fps); still = no sway, no swaps
  const sources = [];
  if (P('trees', '1') !== '0') {
    const { createTree, treeUniforms } = await import('../src/world/trees.js');
    const tu = treeUniforms(engine).uWind.value;
    tu.z = 3.75;
    if (still) { tu.x = 0; tu.w = 9; }
    for (const [sx, sy, sd, h, r] of [[-8.3, -4.3, 21, 4.2, 1.7], [8.6, 4.2, 9, 4.6, 1.9]]) {
      const pos = scr(sx, sy); pos.y = heightAt(pos.x, pos.z);
      const tr = createTree(engine, { position: pos, seed: sd, height: h, radius: r, kind: 'round' });
      for (const c of tr.userData.tree.crowns.slice(0, 3)) sources.push({ x: pos.x + c.c.x, y: pos.y + c.c.y - c.r * 0.6, z: pos.z + c.c.z, r: c.r * 0.8 });
      placed.push(tr);
    }
  }
  if (usePond) {
    const { createWater } = await import('../src/world/water.js');
    createWater(engine, terrain, { level, shape: { kind: 'circle', center: [S.pond.x, S.pond.z], radius: pondR + 0.3 }, depthMax: 0.4,
      wobbleFps: 7.5, waveFps: 7.5, sparkleFps: 7.5, ...(still ? { waves: false, sparkles: false, wobble: 0, foam: 0 } : {}) });
  }
  if (P('grade', '1') !== '0') { const { addGrade } = await import('../src/post/grade.js'); addGrade(engine, still ? { grain: 0 } : {}); }   // night grain refreshes at 12 fps: off in the still (cadence) check

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

  // ---- foliage layout (world positions from screen metres)
  const w = (sx, sy, extra = {}) => { const p = scr(sx, sy); return { x: p.x, z: p.z, ...extra }; };
  const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.05));
  const offRocks = (x, z) => !rockAvoid.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r);
  const foliageOpts = {
    terrain,
    mask: (x, z) => !onStone(x, z) && offRocks(x, z),
    tall: [w(-4.9, 0.15, { r: 1.5 }), w(1.2, -1.75, { r: 1.15 }), w(-2.3, 2.0, { r: 0.9 })],
    flowers: [
      w(4.6, -2.75, { r: 0.75, tints: ['#CA91E3', '#A875D7', '#DC9EFF'] }),
      w(2.55, -0.45, { r: 0.6, tints: ['#E6D36A', '#EDEBDA'] }),
      w(-0.9, 4.4, { r: 0.55, tints: ['#EDEBDA', '#CA91E3'] }),
      w(-7.2, -0.5, { r: 0.55, tints: ['#A875D7', '#CA91E3'] }),
    ],
    reeds: usePond ? [w(-6.85, 2.15, { r: 0.6 }), w(-8.5, 3.15, { r: 0.55 }), w(-8.9, 1.9, { r: 0.4 })] : [],
    bushes: [w(-2.6, 3.45, { r: 0.6, h: 0.8, seed: 3 }), w(1.3, 3.55, { r: 0.55, h: 0.75, seed: 5 }), w(5.5, 1.9, { r: 0.62, h: 0.85, seed: 8 }), w(8.2, -2.4, { r: 0.7, h: 0.9, seed: 11 })],
    leafSources: sources, leaves: Number(P('leaves', 16)),
    wind: { strength: Number(P('wind', 0.55)), gust: Number(P('gust', 1)) },
    still: P('fwind', '1') === '0', debug: P('fdebug', ''),
  };
  // pond water: no grass in it (terrain.isGrass handles the water); reeds sit on the rim
  const list = P('systems', 'foliage').split(',').map((s) => s.trim()).filter(Boolean);
  const strictP = P('strict', list[0] ?? '');
  const sysOpts = {
    foliage: foliageOpts,
    '_ref-birds': { center: S.flock, count: Number(P('birds', 9)) },
    '_ref-fireflies': { center: S.fireflies, radius: 2.0 },
  };
  const amb = await createAmbient(engine, {
    systems: list.map((name) => ({ name, opts: sysOpts[name] ?? { center: S.flock } })),
    anchors: { perches, spots: { ...S, trail: trail.map((p) => p.clone()) }, lights: [{ pos: flicker.light.position.clone(), color: '#FF8A3A', r: 3.2, kind: 'lantern' }] },
    heightAt, tod, seed: Number(P('seed', 1)), strict: strictP === '1' ? true : strictP,
  });
  if (wname !== 'none') amb.actors.add({ id: 'walker', at: posAt, height: H, kind: 'walker' });
  // without the foliage system the meadow still needs grass (A/B 'none' bench): plain world grass
  if (!amb.get('foliage')) {
    const { createGrass, viewArea } = await import('../src/world/grass.js');
    createGrass(engine, terrain, { area: viewArea(engine, 3), avoid: rockAvoid, wind: still ? { strength: 0 } : { fps: 3.75 }, flowers: { fraction: 0.03 }, mask: (x, z) => !onStone(x, z) });
  }

  if (P('follow', '0') === '1') engine.onUpdate((t) => { engine.camera.target.copy(engine.camera.snapWorld(posAt(t))); });
  engine.onUpdate((t) => {
    stats.ambient = amb.stats();
    const p = posAt(t), q = posAt(Math.max(0, t - 1 / 30));
    stats.walker = { name: wname, x: +p.x.toFixed(3), z: +p.z.toFixed(3), speed: +(Math.hypot(p.x - q.x, p.z - q.z) * 30).toFixed(2), clip: ch?.state?.clip ?? null, h: +H.toFixed(2) };
  });
  window.__pixel.ambient = amb;
}
