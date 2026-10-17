// Mock HUD scene (owner: UI lead). The Clocktower town square at the gameplay camera with cast members and one SLOT per
// UI element group (docs/UI.md §3/§4). Every group draws its slot from src/ui/<group>/hud.js when that file exists;
// until then the kit placeholder in src/ui/placeholders.js stands in (same position, kit baseline style).
//
//   index.html?scene=ui-hud[&tod=noon|golden|night][&slots=1][&groups=markers,hud][&ui=0][&grass=0][&vh=12]
//   tools/shot.sh ui-hud shots/ui-lead/hud.png --size 1280x720 --t 1.0
//
// Parameters: tod (sky.js preset, default noon) · slots=1 draws each group's slot rect + tag (owners: find your area)
//   groups=<a,b> only those groups (default all) · placeholders=0 hides kit placeholders (only real group modules)
//   ui=0 no UI at all (the bare 3D scene, for A/B) · grass=0 · vh (default 12 = the game's camera, docs/DEMO.md)
//   cast=0 no characters (fast layout iteration) · t=<sec> freeze the stage clock (characters AND UI animation)
//   screen=0 hide the screen layer (tier S) · pan=<dx>,<dy> whole-texel camera pan per 60 Hz step (crawl check)
//
// Exports buildHudStage(engine, params, opts) for the group scenes (scenes/ui-<group>.js): the same square, cast,
// camera and UI layers, so every group is judged over the same frame. Returns the `hud` context (docs/UI.md §3.3).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createUILayers } from '../src/ui/layer.js';
import * as kit from '../src/ui/kit.js';
import { PLACEHOLDERS, SLOTS, drawSlots } from '../src/ui/placeholders.js';
import { loadCharacter, createActor, sunFor } from './char-stage.js';

export const GROUPS = ['markers', 'emotes', 'indicators', 'portraits', 'hud', 'panels', 'events'];
const D2R = Math.PI / 180;

/**
 * The mock cast (stable): seat order = v2 seat numbers (1 at screen-up, clockwise). `you` = the local player.
 * Names are v2 test names; ids are characters/<id>.js (the skipped member is never used).
 */
export const MOCK_CAST = [
  { id: 'frog', name: 'Ada', seat: 1, clip: 'point', role: 'Empath' },
  { id: 'owl', name: 'Bram', seat: 2, clip: 'vote', role: 'Chef' },
  { id: 'fox', name: 'Cleo', seat: 3, clip: 'talk', role: 'Monk' },
  { id: 'mushroom', name: 'Dov', seat: 4, clip: 'idle', role: 'Undertaker', you: true },
  { id: 'rabbit', name: 'Esme', seat: 5, clip: 'idle', role: 'Imp', ghost: true },
  { id: 'goat', name: 'Finn', seat: 6, clip: 'idle', role: 'Poisoner' },
  { id: 'crow', name: 'Gus', seat: 7, clip: 'talk', role: 'Butler' },
];
export const MOCK_ST = { id: 'storyteller', name: 'The Storyteller', clip: 'idle', st: true };

export async function buildHudStage(engine, params, { cast = MOCK_CAST, storyteller = MOCK_ST, ring = 5.4 } = {}) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = P('tod', 'noon');
  const vh = Number(P('vh', 12));
  const yaw = Number(P('yaw', 0)) * D2R;
  const fixT = params.has('t') ? Number(P('t')) : null;
  const clock = (t) => (fixT !== null ? fixT : t);
  const target = new THREE.Vector3(0, 0, 0.6);
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTimeOfDay(engine, tod, { ...sunFor(tod, P), shadowExtent: 18 });
  setClouds(engine, tod === 'noon' ? { scale: 0.045, cover: 0.62 } : { scale: 0 });

  // ---- backdrop: a town-square stand-in (the real town is owned by the town session; never imported here)
  const [{ createTerrain }, { createGrass, viewArea }, props, trees, { addGrade }] = await Promise.all([
    import('../src/world/terrain.js'), import('../src/world/grass.js'), import('../src/world/props.js'),
    import('../src/world/trees.js'), import('../src/post/grade.js')]);
  const terrain = createTerrain(engine, { size: 56, seed: 5, height: 0.6, flatten: [{ x: 0, z: 0, r: 9, h: 0, falloff: 5 }],
    zones: [{ type: 'cobble', x: 0, z: 0, r: 7.6 }, { type: 'dirt', x: -9, z: -3, r: 1.8 }] });
  const placed = [];
  const add = (o) => { engine.scene.add(o); placed.push(o); return o; };
  add(props.createPaving(engine, terrain, { center: new THREE.Vector3(0, 0, 0), radius: 7.4, kind: 'cobble', seed: 4, falloff: 0.1, density: 0.97 }));
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const place = (r, ang) => new THREE.Vector3().addScaledVector(F, r * Math.cos(ang * D2R)).addScaledVector(R, r * Math.sin(ang * D2R));
  const night = tod === 'night';
  for (const a of [-50, 50, 130, -130])
    add(props.createLantern(engine, { position: place(8.8, a), terrain, seed: 3 + a, lit: night || tod === 'golden', light: night }));
  add(props.createPillar(engine, { height: 2.8, seed: 31, position: place(10.5, -28), terrain }));
  add(props.createPillar(engine, { height: 1.4, seed: 32, broken: true, position: place(9.8, 34), terrain }));
  if (P('trees', '1') !== '0') {
    for (const [r, a, s] of [[12.5, -48, 1], [12, 46, 2], [12.5, 112, 3], [12.2, -110, 4]])
      trees.createTree(engine, { position: (() => { const p = place(r, a); return p.setY(terrain.heightAt(p.x, p.z)); })(), seed: 40 + s, kind: 'round', height: 4.2, radius: 1.9, leafTexels: 4.5 });
  }
  if (P('grass', '1') !== '0') {
    const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.04)) || Math.hypot(x, z) < 7.6;
    const area = viewArea(engine, 3);
    createGrass(engine, terrain, { area, mask: (x, z) => !onStone(x, z), flowers: { fraction: 0.025 } });
  }
  if (P('grade', '1') !== '0') addGrade(engine, {});

  // ---- cast on the circle (seat 1 = screen-up, clockwise), storyteller in the centre
  const n = cast.length;
  const seatPos = (s) => place(ring, ((s - 1) / n) * 360);
  const faceTo = (from, to) => { const d = to.clone().sub(from); return Math.round(Math.atan2(d.x, d.z) / (45 * D2R)) * 45 * D2R; };
  const members = [];
  const ground = { heightAt: (x, z) => terrain.heightAt(x, z) };
  const want = P('cast', '1') !== '0';
  const mk = async (c, pos, face) => {
    const m = { ...c, pos: pos.clone().setY(terrain.heightAt(pos.x, pos.z)), height: 1.3, actor: null };
    if (want) {
      try {
        const loaded = await loadCharacter(c.id, 'auto', { fx: true });
        const clip = loaded.spec.clips?.[c.clip] ? c.clip : 'idle';
        m.height = loaded.spec.height || 1.3;
        m.actor = createActor(engine, loaded, { clip, face, pos: m.pos, move: false, at: 0.4, clock, ground, pin: false });
      } catch (e) { console.warn(`ui-hud: ${c.id} failed: ${e.message}`); }
    }
    m.head = () => m.pos.clone().setY(m.pos.y + m.height + 0.1);
    m.feet = () => m.pos.clone();
    members.push(m);
    return m;
  };
  const centre = new THREE.Vector3(0, 0, 0);
  for (const c of cast) {
    const p = seatPos(c.seat);
    let face = faceTo(p, centre);
    if (c.clip === 'point') face = faceTo(p, seatPos(cast.find((o) => o.seat === 3)?.seat ?? 3));
    await mk(c, p, face);
  }
  const st = storyteller ? await mk(storyteller, centre.clone(), faceTo(centre, place(5, 180))) : null;

  const ui = createUILayers(engine, { tod, timeFn: clock });
  if (P('screen', '1') === '0') ui.screenEnabled = false;
  // pan=<dx>,<dy>: camera target moves k·(dx, dy) whole texels (right, up) at 60 Hz step k = floor(engine t·60) (crawl checks)
  if (params.has('pan')) {
    const [px, py] = P('pan').split(',').map(Number), base = target.clone(), tx = engine.camera.texelWorld;
    engine.onUpdate((t) => {
      const k = Math.floor(t * 60 + 0.01), cam = engine.camera;
      engine.camera.set({ target: base.clone().addScaledVector(cam.right, k * (px || 0) * tx).addScaledVector(cam.up, k * (py || 0) * tx) });
    });
  }
  const hud = {
    engine, params, P, tod, tok: kit.tokens(tod), kit, ui, terrain, place, seatPos, clock,
    cast: members.filter((m) => !m.st), st, you: members.find((m) => m.you) || null,
    byId: (id) => members.find((m) => m.id === id), bySeat: (s) => members.find((m) => m.seat === s),
    slots: SLOTS, groups: GROUPS,
  };
  engine.stats.ui = { tod, cast: members.map((m) => m.id), vh };
  return hud;
}

export default async function build(engine, params) {
  const hud = await buildHudStage(engine, params);
  const P = hud.P;
  if (P('ui', '1') === '0') { hud.ui.enabled = false; return; }
  const only = P('groups', null)?.split(',').filter(Boolean);
  const showPh = P('placeholders', '1') !== '0';
  const used = {};
  for (const g of GROUPS) {
    if (only && !only.includes(g)) continue;
    let mod = null;
    try { mod = await import(`../src/ui/${g}/hud.js`); } catch (e) {
      if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e;   // a broken module must surface
    }
    if (mod?.default?.draw) {
      await mod.default.setup?.(hud);
      hud.ui.add((L) => mod.default.draw(hud, L), mod.default.z ?? 10);
      used[g] = 'module';
    } else if (showPh && PLACEHOLDERS[g]) {
      PLACEHOLDERS[g](hud);
      used[g] = 'placeholder';
    }
  }
  if (P('slots', '0') === '1') hud.ui.add((L) => drawSlots(hud, L, only), 1000);
  engine.stats.ui.groups = used;
}
