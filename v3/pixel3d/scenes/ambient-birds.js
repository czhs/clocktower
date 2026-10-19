// Scene "ambient-birds" (owner: birds): the ambient stage (scenes/ambient-stage.js, scripted walker at game speed)
// with the production "birds" system (src/ambient/birds.js) built with its full options: pigeons on the flock
// spot, sparrows on a second spot the walker passes first, crows on the pillar tops and the wall ridge (sideways
// hops along the wall), crows on the ground at dusk, no birds at night.
//
// The stage builds the world + walker + any OTHER systems; this scene builds "birds" itself on the stage's own
// actors and anchors (so it gets options the stage does not pass) and merges its stats into info().stats.ambient.
//   ?systems=birds[,other]  (default birds; without "birds" this is the plain stage)   ?tod=noon|morning|golden|night
//   ?sheet=1&sheetSpecies=pigeon|sparrow|crow&sheetYaw=<deg>  look-dev: every drawing of a species in a row
//   (sheet=1 renders with grass=0 unless ?grass= is given: a drawing sheet shows the drawings, not grass over them)
//   ?pan=dx,dy  shift the view by whole texels along screen right / up (crawl check: diff against pan=0,0)
//   ?pigeons= ?sparrows= ?crows= ?groundCrows=   all other stage params (walker, speed, shot, vh, still, ...) pass through
// tools/ambientpack.sh birds --scene ambient-birds [--tod golden]
import * as THREE from 'three';
import stage from './ambient-stage.js';
import { createAmbient } from '../src/ambient/index.js';

const YAW = Math.PI / 4, PITCH = Math.PI / 6;   // = ambient-stage (its scr() layout helper)

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const want = P('systems', 'birds').split(',').map((s) => s.trim()).filter(Boolean);
  const others = want.filter((s) => s !== 'birds');
  const p2 = new URLSearchParams(params.toString());
  p2.set('systems', others.join(','));
  if (want.includes('birds')) p2.set('strict', others[0] ?? '0');
  if (P('sheet', '0') === '1' && !params.has('grass')) p2.set('grass', '0');
  await stage(engine, p2);
  const base = window.__pixel.ambient;
  const SR = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW)), SF = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  // ?pan=dx,dy: whole-texel camera shift (screen right / screen up); same convention as scenes/_test-water.js
  if (params.get('pan')) {
    const [px, py = 0] = params.get('pan').split(',').map(Number);
    const tw = engine.camera.texelWorld ?? Number(P('vh', 10)) / 360;
    engine.camera.set({ target: engine.camera.target.clone().addScaledVector(SR, px * tw).addScaledVector(SF, (py * tw) / Math.sin(PITCH)) });
  }
  if (!want.includes('birds')) return;

  // ground height: ray down onto the stage's terrain mesh (cached on a 2 cm grid; deterministic)
  const terrain = engine.scene.getObjectByName('terrain');
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), cache = new Map();
  const heightAt = (x, z) => {
    const key = `${Math.round(x * 50)},${Math.round(z * 50)}`;
    let h = cache.get(key);
    if (h === undefined) {
      ray.set(o.set(x, 60, z), down);
      const hit = terrain ? ray.intersectObject(terrain, false)[0] : null;
      h = hit ? hit.point.y : 0;
      if (cache.size > 20000) cache.clear();
      cache.set(key, h);
    }
    return h;
  };
  const R = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const F = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy / Math.sin(PITCH));
  const anchors = base.anchors;
  const flock = anchors.spots.flock.clone();
  // sparrows sit on the trail the walker comes down first: they flush ahead of the pigeons. r3: moved from
  // scr(1.5, -1.7) (2.0 m from the stage's 3 s stop, so the 'alert then settle' beat could never play: they flushed
  // on every loop) to the trail just before the flock's patch, ~3.9 m from the stop and 2.2 m from the pigeons.
  const sparrows = scr(-0.95, -1.27); sparrows.y = heightAt(sparrows.x, sparrows.z);
  // stage perches: [pillar A top, pillar B top, wall left, wall centre, wall right]: wall slots hop along screen-right.
  // Wall anchors are snapped onto the real top course (raycast down onto the wall's stones): the stage's wall-left
  // anchor sat past the end of the top row (a crow floating 6 texels over the lower step). Each wall perch also gets
  // the hop slots (-1, 0, +1) x 0.13 m that are still on stone at the same height (a hop never leaves the course).
  const stones = [];
  engine.scene.updateMatrixWorld(true);
  engine.scene.getObjectByName('wall')?.traverse((m) => { if (m.isMesh) stones.push(m); });
  const topAt = (x, z, y0) => {
    ray.set(o.set(x, y0 + 1.2, z), down); ray.far = 2.0;
    const hit = ray.intersectObjects(stones, false).find((h) => h.point.y > y0 - 0.7);
    ray.far = Infinity;
    return hit ? hit.point.y : null;
  };
  const perches = anchors.perches.map((p) => p.clone());
  const perchSlots = perches.map(() => null);
  for (let k = 2; k < perches.length; k++) {
    const p = perches[k];
    let best = null;
    for (let s = -8; s <= 8; s++) {      // +-0.4 m along the wall: the highest course nearest the anchor
      const q = p.clone().addScaledVector(R, s * 0.05), y = topAt(q.x, q.z, p.y);
      if (y === null) continue;
      if (!best || y > best.y + 0.04 || (Math.abs(y - best.y) <= 0.04 && Math.abs(s) < Math.abs(best.s))) best = { s, y, q };
    }
    if (!best) continue;
    perches[k] = best.q.setY(best.y);
    perchSlots[k] = [-1, 0, 1].filter((j) => {
      for (const f of [0.5, 1, 1.25]) {   // the slot and the stone up to 1/4 slot beyond it (feet + tail)
        const q = perches[k].clone().addScaledVector(R, j * 0.13 * f), y = topAt(q.x, q.z, best.y);
        if (y === null || Math.abs(y - best.y) > 0.03) return false;
      }
      return true;
    });
  }
  const perchDirs = perches.map((p, k) => (k >= 2 ? R.clone() : null));
  // ground homes only where the stage keeps grass off (the flock's dirt patch r 1.75, the dirt trail ~0.45 m half
  // width): birds standing in grass get blades drawn through their 8-13 texel bodies
  const trail = anchors.spots.trail || [];
  const segD = (x, z, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    return Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
  };
  const groundOk = (x, z) => Math.hypot(x - flock.x, z - flock.z) < 1.5
    || trail.some((a, k) => segD(x, z, a, trail[(k + 1) % trail.length]) < 0.3);
  const opts = {
    center: flock, sparrows, perches, perchDirs, perchSlots, groundOk, trace: P('trace', '0') === '1',
    frame: { target: engine.camera.target.clone(), halfW: (engine.camera.viewHeight ?? Number(P('vh', 10))) * 8 / 9, halfH: (engine.camera.viewHeight ?? Number(P('vh', 10))) / 2 }, pitch: PITCH,
    pigeons: Number(P('pigeons', 7)), sparrowCount: Number(P('sparrows', 6)), crowsDay: Number(P('crows', 3)), crowsDusk: 5,
    groundCrows: Number(P('groundCrows', 4)),
    sheet: P('sheet', '0') === '1', sheetSpecies: P('sheetSpecies', 'pigeon'), sheetYaw: Number(P('sheetYaw', 0)) * Math.PI / 180,
  };
  const amb = await createAmbient(engine, {
    systems: [{ name: 'birds', opts }], anchors: { ...anchors, spots: { ...anchors.spots, sparrows } }, actors: base.actors,
    heightAt, tod: base.tod?.name, seed: Number(P('seed', 1)), strict: true,
  });
  engine.onUpdate(() => { engine.stats.ambient = { ...base.stats(), ...amb.stats(), systems: base.systems.length + 1 }; });
  window.__pixel.birds = amb;
  engine.stats.birdPerches = { perches: perches.map((p) => p.toArray().map((v) => +v.toFixed(2))), slots: perchSlots };
}
