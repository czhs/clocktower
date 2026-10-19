// Cast line-up (owner: character pipeline lead). Every listed character side by side in ONE scene, same camera, same
// light, same scale (36 px/m at vh 10), all at one facing — the family read and the 25 % silhouette line-up
// (docs/CAST_GALLERY.md). Driven by shots/cast-gallery/lineup.py.
//
//   index.html?scene=cast-lineup&chars=frog,fox,owl&dir=1&bg=plain&tod=noon&clip=idle&t=1&gap=46
//
// Parameters (all optional; the rest as scenes/char-stage.js parseCommon: vh, yaw, pitch, tod, key, runtime)
//   chars=a,b,…   characters/<name>.js in line order (default: a few)   dir=<0-7> facing (default 1 = SE, the pack facing)
//   clip=<name>   clip every copy plays (default idle; loop clips only make sense)   t=<sec> frozen stage time (default 1)
//   gap=<px>      whole-pixel spacing between feet (default 46)   bg=plain|key   fx=0 (default 0: no FX in a line-up)
// Debug: info().stats.lineup = [{ name, x, y, height }] feet anchor of each copy in low-res pixel-edge coordinates.
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { loadCharacter, createActor, setKeyBackground, parseCommon, sunFor, screenToGround } from './char-stage.js';

const D2R = Math.PI / 180;

export default async function build(engine, params) {
  const C = parseCommon(params);
  const { P } = C;
  const names = P('chars', 'wanderer,fox,owl').split(',').filter(Boolean);
  const dir = Number(P('dir', 1));
  const clip = P('clip', 'idle');
  const fixT = Number(P('t', 1));
  const gap = Math.round(Number(P('gap', 46)));
  const bg = P('bg', 'plain');
  const fx = P('fx', '0') !== '0';

  engine.camera.set({ target: new THREE.Vector3(0, 0, 0), yaw: C.yaw, pitch: C.pitch, viewHeight: C.vh });
  const sunOpts = sunFor(C.tod, P);
  applyTimeOfDay(engine, C.tod, { ...sunOpts, shadowExtent: Math.max(12, names.length * gap * engine.camera.texelWorld * 0.6) });
  setClouds(engine, { scale: 0 });
  if (bg === 'key') setKeyBackground(engine, C.key);
  else {
    const { color, ramp } = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
    engine.scene.add(toonMesh(engine, new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), { color, ramp }, { receiveShadow: true, castShadow: false }));
  }

  const clock = () => fixT;
  const ground = { heightAt: () => 0 };
  const dy = Math.round(Number(P('dy', engine.lowH * 0.3)));   // feet line below the screen centre
  const cells = [];
  for (let i = 0; i < names.length; i++) {
    const loaded = await loadCharacter(names[i], C.runtime, { fx });
    const dx = Math.round((i - (names.length - 1) / 2) * gap);
    const pos = screenToGround(engine, dx, dy);
    createActor(engine, loaded, { clip, face: C.yaw + dir * 45 * D2R, pos, move: false, at: 0, clock, ground, pin: false });
    cells.push({ name: names[i], x: engine.lowW / 2 + dx, y: engine.lowH / 2 + dy, height: loaded.spec.height || 1.4 });
  }
  engine.stats.lineup = cells;
}
