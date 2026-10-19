// Sprite-bake stage (owner: tools). Renders EVERY (clip, direction) of a character at once, each copy in its own
// fixed cell on the key-colour background, so one page load + `--times` = the whole sprite sheet. Driven by
// tools/bake.py (which picks the window size, the frame times and packs out/sprites/<name>.png + .json).
//
//   index.html?scene=char-bake&scale=1&char=<name>&clips=idle,walk&dirs=8&ppm=36&yaw=0&pitch=30&cell=96
//
// Parameters
//   char, runtime, key, tod, az, elev   as scenes/char-stage.js (sun is relative to the camera, so every facing is
//                                       lit the same way on screen — what a 2D game expects)
//   clips=a,b,…   rows (default: all spec clips, or idle)   dirs=8|4|1 columns (8: S SE E NE N NW W SW; 4: S E N W)
//   ppm=<px/m>    pixels per metre (default 36 = the in-game reference zoom, viewHeight 10 at 360 rows)
//   yaw=<deg>     camera yaw (default 0: classic 3/4 RPG view; 45 = isometric-style)   pitch=<deg> (default 30)
//   speed=<m/s>   travel speed of the (pinned) walk/run rows; walkSpeed= / runSpeed= per clip (gait cadence follows)
//   cell=<px>     square cell (even; default ceil(height·ppm·1.5) rounded up to even)   pad=<px> feet above the cell bottom
// Window must be (cols·cell) x (rows·cell) at scale=1 (bake.py passes --size accordingly).
// Clocks: every copy starts its clip at t = 0 (actions too); walk/run are played in place (root pinned).
// Contact shadow: not rendered (no ground, no world shadow); bake.py draws the blob as a separate layer.
// Debug (info().stats.char, as char-stage): cells[{x,y,dir,clip}] = feet anchor of each copy in pixel-edge coords.
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import {
  loadCharacter, createActor, attachDebug, setKeyBackground, parseCommon, sunFor, clipMeta, screenToGround, LOCOMOTION, specMeta,
} from './char-stage.js';

const D2R = Math.PI / 180;
const DIR8 = [0, 1, 2, 3, 4, 5, 6, 7], DIR4 = [0, 2, 4, 6];

export default async function build(engine, params) {
  const C = parseCommon(params);
  const { P } = C;
  const ppm = Number(P('ppm', 36));
  // (module fix T21) fx=0 bakes the figure without smears/FX (was ignored here: the documented '--q fx=0' baked FX)
  const loaded = await loadCharacter(C.name, C.runtime, { testClips: P('testclips', '0') === '1', fx: P('fx', '1') !== '0' });
  const { spec } = loaded;
  const height = spec.height || 1.4;
  const yaw = Number(P('yaw', 0)) * D2R, pitch = Number(P('pitch', 30)) * D2R;
  const vh = engine.lowH / ppm; // exactly ppm pixels per metre at scale 1
  engine.camera.set({ target: new THREE.Vector3(0, 0, 0), yaw, pitch, viewHeight: vh });
  const texel = engine.camera.texelWorld;

  const clips = (P('clips', null)?.split(',') || Object.keys(clipMeta(spec, loaded.mods.anim, loaded.runtime))).filter(Boolean);
  if (!clips.length) clips.push('idle');
  const dirs = { 8: DIR8, 4: DIR4, 1: [0] }[P('dirs', '8')] || DIR8;
  let cell = Number(P('cell', Math.ceil(height * ppm * 1.5)));
  cell += cell % 2;
  const pad = Number(P('pad', Math.round(cell * 0.14)));
  const cols = dirs.length, rows = clips.length;

  const sunOpts = sunFor(C.tod, P);
  applyTimeOfDay(engine, C.tod, { ...sunOpts, yaw, shadowExtent: Math.max(8, Math.max(cols, rows) * cell * texel * 0.75) });
  setClouds(engine, { scale: 0 });
  setKeyBackground(engine, C.key);

  const ground = { heightAt: () => 0 };
  const clock = (t) => t;
  const slots = [];
  clips.forEach((clip, r) => dirs.forEach((d, c) => {
    // feet anchor in px from the screen centre (integers: cell is even)
    const dx = (c - cols / 2) * cell + cell / 2, dy = (r - rows / 2) * cell + cell - pad;
    slots.push({ clip, dir: d, dx, dy, world: screenToGround(engine, dx, dy), face: yaw + d * 45 * D2R });
  }));
  const actors = slots.map((s) => createActor(engine, loaded, {
    clip: s.clip, face: s.face, pos: s.world, move: LOCOMOTION.has(s.clip), at: 0, clock, ground, pin: LOCOMOTION.has(s.clip),
    // speed=<m/s> (all travelling rows) or <clip>Speed=<m/s> (e.g. walkSpeed=6.0: the game-speed gait, tools/bake.py --game)
    ...(P(s.clip + 'Speed', P('speed', null)) !== null && LOCOMOTION.has(s.clip) ? { speed: Number(P(s.clip + 'Speed', P('speed', null))) } : {}),
  }));
  attachDebug(engine, actors, {
    name: spec.name || C.name, runtime: loaded.runtime, height, texel: +texel.toFixed(6), ppm, vh,
    low: [engine.lowW, engine.lowH], bg: 'key', grid: 'bake', yaw: yaw / D2R, pitch: pitch / D2R,
    clips: clipMeta(spec, loaded.mods.anim, loaded.runtime), clipList: clips, dirs, palette: spec.palette || {}, cell, pad, cols, rows, ...specMeta(spec),
    cells: slots.map((s) => ({ x: engine.lowW / 2 + s.dx, y: engine.lowH / 2 + s.dy, dir: s.dir, clip: s.clip })),
  });
}
