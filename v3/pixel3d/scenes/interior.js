// Scene "interior" (owner: interior-kit): one cottage interior in its cozy cut-away dollhouse view. docs/INTERIORS.md.
//   ?house=<0..14 | house-N>       which cottage (default 0, the Stargazer's Tower)
//   ?tod=noon|morning|afternoon|golden|night   town time of day (sky ramps + the light outside the windows)
//   ?yaw=<deg>                    camera yaw (multiples of 45; the walls facing the camera drop to their stubs)
//   ?vh=<viewHeight>              override the interior camera's view height
//   ?lights=<n>                   PointLight pool aimed at the interior's lights (default 8, 0 = none)
//   ?char=<id>                    a demo character standing in the room for scale (src/demo/characters.js; optional)
//   ?at=<x>,<z>                   where the character stands (room-local metres; default the spawn by the door)
//   ?cast=0                       no sun shadows (A/B)
//   ?town=1                       also build the whole town first (as in the demo: shared kit materials, cut-away patch)
// Errors in the house module fail the page here (strict); the demo falls back to the standard room instead.
import * as THREE from 'three';
import { buildInterior, aimLights } from '../src/town/interiors/index.js';
import { applyTownTime } from '../src/town/api.js';
import { configureShadows } from '../src/world/sky.js';
import { addGrade } from '../src/post/grade.js';

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const house = P('house', '0');
  const tod = P('tod', 'noon');
  if (P('town', '0') === '1') {
    const { buildTown } = await import('../src/town/town.js');
    const { applyCamera } = await import('../src/town/api.js');
    applyCamera(engine, 'gameplay');
    await buildTown(engine, params, {});
  }
  const it = await buildInterior(engine, house, { tod, params, strict: true });
  engine.scene.add(it.group);
  const yaw = THREE.MathUtils.degToRad(Number(P('yaw', 0)) || 0);
  const cam = it.camera;
  let target = cam.target.clone(), vh = cam.viewHeight;
  if (yaw !== 0) {
    // turned views: centre on the room box (floor + wall tops), wide enough for the diagonal
    const c = it.origin;
    target = new THREE.Vector3(c.x, 0, c.z).addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -1.6);
    vh = Math.max(vh, (Math.hypot(it.room.w, it.room.d) + 0.8) / (16 / 9) * 1.02);
  }
  if (params.has('vh')) vh = Number(params.get('vh'));
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTownTime(engine, tod, { clouds: false });
  it.setTimeOfDay(tod);
  configureShadows(engine, { extent: Math.max(14, vh * 1.8) });
  if (P('cast', '1') === '0') engine.renderer.shadowMap.enabled = false;
  // the PointLight pool (a fixed count: the demo re-aims the town's pool the same way with aimLights)
  const n = Number(P('lights', 8));
  const pool = [];
  for (let i = 0; i < n; i++) {
    const l = new THREE.PointLight(0xffc46b, 0, 3, 1.5);
    l.castShadow = false; l.name = `interior-light-${i}`;
    engine.scene.add(l); pool.push({ light: l, base: 0, anchor: { kind: 'lantern' } });
  }
  // by day only the hearth casts a pool (candle discs on sunlit walls read as stains); at night every flame
  const day = !['night', 'golden', 'afternoon'].includes(tod);
  aimLights(pool, it, day ? { kinds: ['fire'], scale: 0.85 } : {});
  engine.onUpdate((t) => {
    for (const [k, o] of pool.entries()) {
      if (!o.base) continue;
      const s = Math.floor(t * 8 + k * 3.7);
      const h = (((Math.sin(s * 12.9898) * 43758.5453) % 1) + 1) % 1;
      o.light.intensity = o.base * [0.8, 0.9, 0.96, 1.0][Math.floor(h * 4)];
    }
  });
  engine.onUpdate((t, dt) => it.update(t, dt));
  if (tod === 'night') addGrade(engine, {});
  else addGrade(engine, { saturation: 1.0, vignette: 0.08 });

  // optional character for scale
  const ch = P('char', null);
  if (ch) {
    try {
      const { createCharacter } = await import('../src/demo/characters.js');
      const at = P('at', null);
      const p = at ? (() => { const [x, z] = at.split(',').map(Number); return { x: it.origin.x + x, z: it.origin.z + z }; })() : it.spawn;
      const h = await createCharacter(engine, ch, { position: new THREE.Vector3(p.x, 0, p.z), face: at ? 0 : 0 });
      engine.scene.add(h.root);
      engine.onUpdate((t) => h.update(t));
      engine.stats.char = ch;
    } catch (e) {
      console.warn(`[interior] character '${ch}' unavailable: ${e?.message || e}`);
    }
  }
  engine.stats.interior = { id: it.id, ...it.stats, vh: +vh.toFixed(2), spawn: [+(it.spawn.x - it.origin.x).toFixed(2), +(it.spawn.z - it.origin.z).toFixed(2)], lights: it.lights.length };
  window.__interior = it;
}
