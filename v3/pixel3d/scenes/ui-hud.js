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
//   book=big (notebook: the big book in front of the reader; default held) · pointer=v2 (markers: the v2-size finger;
//   default new) — live: hud.setUiOptions({bookStyle, pointerScale}) (docs/UI.md §6 variants)
//   cast=0 no characters (fast layout iteration) · t=<sec> freeze the stage clock (characters AND UI animation)
//   screen=0 hide the screen layer (tier S) · pan=<dx>,<dy> whole-texel camera pan per 60 Hz step (crawl check)
//   strict=1 a group module that fails to import / set up / draw fails the page (default: a red error tag in its slot,
//   the other groups keep rendering, engine.stats.ui.groups[g] = 'error: …') · heads=1 debug ticks at head anchors
//   game=1   the MOCK GAME SCREEN (docs/UI_GALLERY.md): every group live at once (as the default) PLUS a game-event FX
//            moment on the events loop (9.6 s): the Storyteller poofs out of the circle centre (u 1.0), reappears
//            in front of the centre between you and Esme (u 1.8), poofs out again (u 6.4) and back into the centre (u 7.2) = events poof_0..5 (tier A) +
//            the Storyteller's own 'appear' clip. moment=none turns the moment off. game=1 also times every group's
//            draw callbacks: engine.stats.ui.perf = mean ms per UI frame per group (measurement only).
//            One mock clock + state drives every slot (scenes/ui-game.js: hud.game.hudAt); always on: folded chat
//            dock + voice pill. Variants: view=st (Storyteller screen: clock control, host toolbar, pick crosshair)
//            · phase=1 (game-start banner / night falls / dawn on the 9.6 s loop; the vote is off).
//            tod is lighting only: the game state is the same at noon / golden / night.
//
// Shared context for the groups (module fix 2026-10-17, docs/UI.md §3.3):
//   m.top           visual top of member m in metres above the feet (VISUAL_TOP_M per id, else spec.height): the head
//                   anchor m.head() = feet + m.top + 0.1 (spec.height can be a held prop: staff finial, raised tool)
//   hud.stack       shared above-the-name stack (v2 order label < bubble < pins < pop): hud.stack.top(m, L, kind)
//                   returns the row to put the BOTTOM of a `kind` element on: above the label (+ ghost lift + "You"
//                   chevron), then above what is already drawn over the name at a lower z (bubbles z 20, then bells z 25 /
//                   person pins z 30). hud.indicators.stackTop is routed through it, so it includes chat bubbles.
//   hud.keepOut(L)  screen rects of the HUD slots (placeholders.js keepOutRects) for world UI that must avoid them
//   hud.game        one mock game state (MOCK_GAME) for every group's mock content
//
// Exports buildHudStage(engine, params, opts) for the group scenes (scenes/ui-<group>.js): the same square, cast,
// camera and UI layers, so every group is judged over the same frame. Returns the `hud` context (docs/UI.md §3.3).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createUILayers } from '../src/ui/layer.js';
import * as kit from '../src/ui/kit.js';
import { PLACEHOLDERS, SLOTS, drawSlots, keepOutRects } from '../src/ui/placeholders.js';
import { registerGroupFonts } from '../src/ui/fonts.js';
import { loadCharacter, createActor, sunFor } from './char-stage.js';

export const GROUPS = ['markers', 'emotes', 'indicators', 'portraits', 'hud', 'panels', 'events', 'notebook'];
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
  { id: 'rabbit', name: 'Esme', seat: 5, clip: 'ghost', role: 'Imp', ghost: true },   // ghost clip (rabbit's ghost look is a clip)
  { id: 'goat', name: 'Finn', seat: 6, clip: 'idle', role: 'Poisoner' },
  { id: 'crow', name: 'Gus', seat: 7, clip: 'talk', role: 'Butler' },
];
export const MOCK_ST = { id: 'storyteller', name: 'The Storyteller', clip: 'idle', st: true };
/** One mock game state for every group (module fix): day 2, nominations, Cleo nominated by Ada, Bram's vote counting. */
export const MOCK_GAME = { day: 2, phase: 'day', stage: 'nominations', nominator: 'Ada', nominee: 'Cleo', voter: 'Bram',
  votes: 0, needed: 3, youSeat: 4, deadSeats: [5], clock: { label: 'Nominations open in', leftS: 358 } };
/**
 * Visual top (m above the feet) where spec.height is NOT the top of the head + hat/ears: a held prop or a staff finial
 * makes spec.height too tall, so labels floated 10-15 texels above the head. Measured at the game camera (vh 12,
 * docs/UI.md §2.3) from the character flag buffer of the mock pose (?debug=flags); ids not listed use spec.height.
 */
export const VISUAL_TOP_M = { storyteller: 1.55 };

export async function buildHudStage(engine, params, { cast = MOCK_CAST, storyteller = MOCK_ST, ring = 5.4 } = {}) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = P('tod', 'noon');
  const vh = Number(P('vh', 12));
  const yaw = Number(P('yaw', 0)) * D2R;
  const fixT = params.has('t') ? Number(P('t')) : null;
  await registerGroupFonts();                 // kit FONTS.display = the hud group's display face (src/ui/fonts.js)
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
    const m = { ...c, pos: pos.clone().setY(terrain.heightAt(pos.x, pos.z)), height: 1.3, top: 1.3, actor: null };
    if (want) {
      try {
        const loaded = await loadCharacter(c.id, 'auto', { fx: true });
        const clip = loaded.spec.clips?.[c.clip] ? c.clip : 'idle';
        m.height = loaded.spec.height || 1.3;
        m.top = Math.min(VISUAL_TOP_M[c.id] ?? m.height, m.height);
        m.actor = createActor(engine, loaded, { clip, face, pos: m.pos, move: false, at: 0.4, clock, ground, pin: false });
      } catch (e) { console.warn(`ui-hud: ${c.id} failed: ${e.message}`); }
    }
    m.head = () => m.pos.clone().setY(m.pos.y + m.top + 0.1);       // visual top + 0.1 m (docs/UI.md §2.3)
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
  // module fix: every scene built on the stage honours ui=0 (A/B): the layers AND every group post pass named 'ui-*'
  // (talk outline 290, markers pins 301, notebook book 302, ui-depth 303) are off, so the frame is the bare 3D scene
  if (P('ui', '1') === '0') {
    ui.enabled = false;
    engine.onUpdate(() => { for (const p of engine.pipeline.passes) if (p.name?.startsWith('ui-')) p.enabled = false; });
  }
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
    slots: SLOTS, groups: GROUPS, game: MOCK_GAME,
    keepOut: (L, opts = {}) => keepOutRects(L.screen.w, L.screen.h, { margin: L.MARGIN, ...opts }),
  };
  installStack(hud);
  // variant options (notebook / markers variants task, additive; docs/UI.md §6): ?book=held|big ?pointer=new|v2. Groups
  // read hud.uiOptions every frame, so a demo toggle flips them live: hud.setUiOptions({ bookStyle: 'big' }).
  hud.uiOptions = { bookStyle: P('book', 'held') === 'big' ? 'big' : 'held', pointerScale: P('pointer', 'new') === 'v2' ? 'v2' : 'new' };
  hud.setUiOptions = (o = {}) => Object.assign(hud.uiOptions, o);
  if (P('heads', '0') === '1') ui.add((L) => { for (const m of members) { const h = L.at(m.head()), f = L.at(m.feet()); L.world.hline(h.x - 3, h.y, 7, '#FF00FF'); L.world.hline(f.x - 3, f.y, 7, '#00FFFF'); } }, 999);
  // projected anchors (screen px of the 640x360 frame) for tools / measurements
  const anchors = Object.fromEntries(members.map((m) => [m.id, { head: ui.atScreen(m.head()), feet: ui.atScreen(m.feet()), height: m.height, top: m.top }]));
  engine.stats.ui = { tod, cast: members.map((m) => m.id), vh, anchors, options: hud.uiOptions };
  return hud;
}

/**
 * hud.stack (module fix: shared above-the-name stack, docs/UI.md §3.3). v2 order: label < chat bubble < person pins <
 * emote pop. top(m, L, kind) = the row on which the BOTTOM of a `kind` element sits (L.world px):
 *   'label' / 'bubble'  1 px above the name label (+ ghost lift + "You" chevron) = the indicators' own stackTop
 *   'pins'              also above the chat bubble: scan L.world upward from there in the head column (x ± 2; the
 *                       bubble tail and a lifted bubble's dotted connector sit there; gaps <= 3 rows are bridged)
 *   'pop' / any other   also above what sits on top of that (person pins, bells): a wider scan (x ± 10: a fan of 2-3
 *                       pins has its tips at ±6..11), 1-row gaps only, at most 30 rows (one pin + bob), so it rarely
 *                       chains into a neighbour's bubble or label right above.
 * The scan sees what is drawn at a LOWER z: bubbles z 20, bells z 25, person pins z 30 — draw at a higher z than what
 * you stack on. Without the indicators group: label top = head anchor - 11 (the placeholder label).
 * The indicators module's hud.indicators.stackTop is routed through top(m, L, 'pins') (so markers' person pins and
 * events' bells clear chat bubbles); its label-only original stays as hud.indicators.labelStackTop.
 */
export const STACK = { bubbleBand: 2, bubbleGap: 3, band: 10, gap: 1, climb: 30 };
function installStack(hud) {
  let ind = null;
  const scan = (img, x, y0, band, climb, maxGap) => {
    let top = null, gap = 0;
    for (let y = y0; y > y0 - climb && y >= 0; y--) {
      let occ = false;
      for (let dx = -band; dx <= band && !occ; dx++) occ = img.alpha(x + dx, y) > 0;
      if (occ) { top = y; gap = 0; } else if (++gap > maxGap) break;
    }
    return top === null ? y0 : top - 1;
  };
  const stack = {
    order: ['label', 'bubble', 'pins', 'pop'],
    /** Row above the label (+ chevron), no bubbles. */
    base: (m, L) => (ind?.labelStackTop ? ind.labelStackTop(m, L) : L.at(m.head()).y - 12),
    top(m, L, kind = 'pins') {
      const y0 = stack.base(m, L);
      if (kind === 'label' || kind === 'bubble' || !L.world) return y0;   // (layer views without .world, e.g. pin passes)
      const x = L.at(m.head()).x;
      const y1 = scan(L.world, x, y0, STACK.bubbleBand, 120, STACK.bubbleGap);
      return kind === 'pins' ? y1 : scan(L.world, x, y1, STACK.band, STACK.climb, STACK.gap);
    },
  };
  hud.stack = stack;
  Object.defineProperty(hud, 'indicators', {
    configurable: true, enumerable: true,
    get: () => ind,
    set: (v) => {
      if (!v) { ind = v; return; }
      const labelStackTop = v.labelStackTop || v.stackTop;
      ind = { ...v, labelStackTop, stackTop: labelStackTop ? (m, L) => stack.top(m, L, 'pins') : undefined };
    },
  });
}

export default async function build(engine, params) {
  const hud = await buildHudStage(engine, params);
  const P = hud.P;
  if (P('ui', '1') === '0') return;
  const only = P('groups', null)?.split(',').filter(Boolean);
  const showPh = P('placeholders', '1') !== '0';
  const strict = P('strict', '0') === '1';
  const used = {};
  const errors = [];
  const game = P('game', '0') === '1';
  // UI integration r2: the game screen's one mock clock + state, extras and variants live in scenes/ui-game.js
  // (?view=st, ?phase=1; chat dock + voice pill always on). preGame runs before the groups (bubble copy, skips).
  const gameMod = game ? await import('./ui-game.js') : null;
  const gameSkip = gameMod ? (await gameMod.preGame(hud)).skip : [];
  if (game && P('moment', P('phase', '0') === '1' ? 'none' : 'poof') === 'poof') await installPoofMoment(hud);
  // game=1: per-group draw cost. Every callback a group registers (its slot draw AND the layer callbacks it adds in
  // setup) is wrapped while that group is set up; engine.stats.ui.perf[g] = mean ms per UI frame (all layer frames).
  const perf = { frames: 0, ms: {} };
  const realAdd = hud.ui.add.bind(hud.ui);
  let current = null;
  if (game) {
    realAdd(() => { perf.frames++; }, -1e9);
    hud.ui.add = (fn, z) => {
      if (!current) return realAdd(fn, z);
      const g = current;
      return realAdd((L) => { const a = performance.now(); fn(L); perf.ms[g] = (perf.ms[g] || 0) + performance.now() - a; }, z);
    };
    engine.stats.ui.perf = perf;
    Object.defineProperty(perf, 'meanMs', { enumerable: true, get: () => Object.fromEntries(Object.entries(perf.ms).map(([g, v]) => [g, +(v / Math.max(1, perf.frames)).toFixed(3)])) });
  }
  // module fix: a group whose hud.js exists but fails (syntax error mid-edit, setup/draw throws) no longer blanks the
  // whole mock HUD: it gets a red error tag (and a console error), the other groups render. ?strict=1 = fail the page.
  const fail = (g, stage, e) => {
    const msg = `${stage}: ${String(e?.message || e).split('\n')[0].slice(0, 90)}`;
    console.error(`ui-hud: group '${g}' ${msg}`);
    if (strict) throw e;
    used[g] = `error (${msg})`;
    errors.push([g, msg]);
  };
  for (const g of GROUPS) {
    if (only && !only.includes(g)) continue;
    if (gameSkip.includes(g)) continue;
    const url = `../src/ui/${g}/hud.js`;
    let exists = false;
    try { exists = (await fetch(new URL(url, import.meta.url), { method: 'HEAD' })).ok; } catch (e) { exists = false; }
    let mod = null;
    if (exists) { try { mod = await import(url); } catch (e) { fail(g, 'import', e); continue; } }
    current = g;
    if (mod?.default?.draw) {
      try { await mod.default.setup?.(hud); } catch (e) { current = null; fail(g, 'setup', e); continue; }
      let broken = false;
      hud.ui.add((L) => {
        if (broken) return;
        try { mod.default.draw(hud, L); } catch (e) { broken = true; fail(g, 'draw', e); }
      }, mod.default.z ?? 10);
      used[g] = 'module';
    } else if (showPh && PLACEHOLDERS[g]) {
      PLACEHOLDERS[g](hud);
      used[g] = 'placeholder';
    }
    current = null;
  }
  if (game) hud.ui.add = realAdd;
  if (gameMod) await gameMod.postGame(hud);
  if (P('slots', '0') === '1') hud.ui.add((L) => drawSlots(hud, L, only), 1000);
  hud.ui.add((L) => errors.forEach(([g, msg], i) => {      // error tags, top-left under the role chip
    const s = `${g} ${msg}`, y = 40 + i * 12;
    kit.drawBox(L.screen, 2, y - 2, kit.textWidth(s) + 4, 11, 'danger', L.tok);
    kit.drawText(L.screen, 4, y, s, { color: L.tok.danger });
  }), 1001);
  engine.stats.ui.groups = used;
}

/**
 * game=1 FX moment (UI lead, docs/UI_GALLERY.md): the Storyteller teleports out of the circle and back on the events
 * group's 9.6 s loop, with the events group's poof_0..5 (15 fps, hide at drawing 2, show at drawing 3: events
 * TIMING.poof) and the Storyteller's own 'appear' clip scheduled at each show time (Character re-simulates scheduled
 * plays, so stills and GIF frames agree). hud.st.pos stays at the circle centre on purpose: the events vote clock hand
 * starts there (v2 draws it from the circle centre, not from the Storyteller); the label, the emote pop and the stack
 * follow hud.st.feet()/head(), which return the live spot (y + 1000 m while hidden: indicators skips a member whose feet
 * project above the frame, so the label leaves with the Storyteller).
 */
export const POOF_MOMENT = { loop: 9.6, hops: [{ out: 1.0, in: 1.8, to: 'away' }, { out: 6.4, in: 7.2, to: 'home' }], away: { r: 2.4, ang: 180 } };   // 180 = in front of the centre, between you (seat 4) and Esme: off the vote hand's path while he is away (seats 5-2)
async function installPoofMoment(hud) {
  const s = hud.st;
  if (!s) return;
  const D = await import('../src/ui/events/draw.js');
  const PF = D.TIMING.poof, M = POOF_MOMENT;
  const home = s.pos.clone(), away = hud.place(M.away.r, M.away.ang);
  away.y = hud.terrain.heightAt(away.x, away.z);
  const spot = { home, away };
  const from = { away: home, home: away };
  const hideF = PF.hideAt * PF.hold, showF = (PF.hideAt + 1) * PF.hold;      // grid frames after out / in
  /** state at stage time t: where the Storyteller stands and whether it is visible (grid-frame compares only). */
  const at = (t) => {
    const base = Math.floor(t / M.loop) * M.loop, u = t - base;
    let where = 'home', vis = true;
    for (const h of M.hops) {
      const kO = D.gridK(u - h.out), kI = D.gridK(u - h.in);
      if (kO < 0) break;
      if (kO >= hideF && kI < showF) vis = false;
      where = kI >= 0 ? h.to : from[h.to] === home ? 'home' : 'away';
    }
    return { base, u, vis, p: spot[where] };
  };
  const ch = s.actor?.ch;
  if (ch?.play && s.actor.spec.clips?.appear) {
    const t0 = (ch.engine?.time ?? 0) + 1e-3;
    for (let i = 0; i < 40; i++) for (const h of M.hops) ch.play('appear', { at: Math.max(t0, i * M.loop + h.in + showF / 30) });
  }
  const hidden = new THREE.Vector3(0, 1000, 0);
  s.feet = () => { const st = at(hud.ui.t); return st.vis ? st.p.clone() : st.p.clone().add(hidden); };
  s.head = () => s.feet().setY(s.feet().y + s.top + 0.1);
  // the teleport lives in the Character's drive (stage time t): moving st.base from an onUpdate lagged one frame and
  // re-simulation fired the 'appear' clip's own poof FX at the OLD spot (debris + a warm glow left at the centre)
  if (ch?.drive) ch.drive((t) => ({ pos: at(t).p.clone(), face: s.actor.st.face }));
  hud.engine.onUpdate((tE) => {
    const st = at(hud.clock(tE));
    if (s.actor) { s.actor.root.visible = st.vis; s.actor.st.base.copy(st.p); }
  });
  hud.ui.add((L) => {
    const F = D.framesFor(L.tok), u = at(L.t).u;
    for (const h of M.hops) {
      D.drawPoof(L, F, L.at(from[h.to]), D.gridK(u - h.out), { appear: false });
      D.drawPoof(L, F, L.at(spot[h.to]), D.gridK(u - h.in), { appear: true });
    }
  }, 26);
  hud.moment = { kind: 'poof', at, spot };
}
