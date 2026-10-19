// UI group "indicators" scene (owner: indicators; docs/UI.md §3.3, rows 13–21). The mock HUD square (buildHudStage)
// with ONLY this group's elements, in several states, day + night, with the cast:
//
//   index.html?scene=ui-indicators[&state=hud|talk|bubbles|guide|offscreen|door|board][&tod=noon|golden|night][&t=<s>]
//   tools/shot.sh ui-indicators shots/ui-indicators/r1/hud-noon.png --size 1280x720 --t 1
//
//   hud        the mock-HUD slot (same module + config as scenes/ui-hud.js): labels (player / Storyteller gold / ghost),
//              talking outline + glyph, muted glyph, "you are here", two chat bubbles, compass pill, offscreen arrows
//   talk       every speaking state: talk (others, pale gold + goldLine under-ring), self on air (rose; &self=idle: your
//              open-but-silent mic = dim glyph, no outline), muted, and the ground voice ripple (no outline pass)
//   bubbles    chat-bubble timeline at 1x (v2 SPEECH timing): pops, stacking (Bram lifts above Cleo, keeps its tail + a dotted connector; 2-frame re-stack step),
//              replacement (Ada says a second line), view clamp, dissolves
//   guide      gathering, not seated: own-seat "You" marker over your empty seat + ground arrow toward it
//   offscreen  zoomed in (vh 7): edge arrows with portrait discs + names for everyone outside the view
//   door       bedtime at a real town house (src/town piece house-0, read-only import): door ring + chevron, your
//              house callout (gold), guidance arrow from you to the door, compass pill
//   board      day at the same house: owner callout + door-board occupant tokens (ghost, "+N")
import * as THREE from 'three';
import { buildHudStage, MOCK_CAST, MOCK_ST } from './ui-hud.js';
import mod from '../src/ui/indicators/hud.js';
import * as kit from '../src/ui/kit.js';

const D2R = Math.PI / 180;

/** Move a member (and its actor) to a new ground position (scene setup only, before the first frame). */
function moveTo(hud, m, pos) {
  const p = pos.clone(); p.y = hud.terrain ? hud.terrain.heightAt(p.x, p.z) : p.y;
  m.pos.copy(p);
  if (m.actor?.st) m.actor.st.base.copy(p);
  if (m.actor?.root) m.actor.root.position.copy(p);
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const state = P('state', 'hud');
  if (state === 'door' || state === 'board') return buildDoor(engine, params, state);
  if (state === 'offscreen' && !params.has('vh')) params.set('vh', '7');
  const hud = await buildHudStage(engine, params);
  // offscreen: the camera looks at the right half of the circle, so the left seats leave the view
  if (state === 'offscreen') engine.camera.set({ target: hud.place(3.6, 95).setY(0.6) });
  const by = (n) => [...hud.cast, hud.st].find((m) => m?.name === n);
  const cfg = {};
  if (state === 'talk') {
    // r2: selfIdle only ever on 'you' (Dov); &self=idle shows your open-but-silent mic (glyph only, no outline)
    const selfKind = P('self', 'on') === 'idle' ? 'selfIdle' : 'self';
    cfg.talk = [{ m: by('Cleo'), kind: 'talk' }, { m: by('Gus'), kind: 'talk' }, { m: by('Dov'), kind: selfKind },
      { m: by('Ada'), kind: 'talk' }, { m: by('Bram'), kind: 'talk', noOutline: true }];
    cfg.muted = [by('Finn'), by('Esme')];
    cfg.ripple = [by('Bram')];
    cfg.bubbles = [];
    cfg.you = { chevron: true, ring: false };
  } else if (state === 'bubbles') {
    // Bram steps next to Cleo so their bubbles collide (v2 stackBubbles); Ada speaks twice (replacement)
    moveTo(hud, by('Bram'), by('Cleo').pos.clone().add(new THREE.Vector3(-1.0, 0, 0.8)));
    cfg.bubbles = [
      { m: by('Ada'), text: 'Good morning, town! Who slept well?', at: 0.3 },
      { m: by('Cleo'), text: 'twas a cat.', at: 0.9 },
      { m: by('Bram'), text: 'I did not. Something was scratching at my door all night long and I am telling you it was not a cat.', at: 1.6 },
      { m: by('Gus'), text: 'Hmm.', at: 2.3 },
      { m: by('Ada'), text: 'Then who was it, Bram?', at: 3.6 },
      { m: by('The Storyteller'), text: 'The bell will toll soon. Gather at the circle.', at: 4.4 },
    ];
    cfg.talk = []; cfg.muted = []; cfg.offscreen = []; cfg.compass = null;
  } else if (state === 'guide') {
    const dov = by('Dov'), seat = dov.pos.clone();
    moveTo(hud, dov, hud.place(8.4, 205));
    cfg.you = { chevron: true, ring: true, seatMarker: seat, guideTo: seat };
    cfg.bubbles = []; cfg.talk = []; cfg.muted = [];
    cfg.compass = { steps: 9, home: seat, title: 'Your seat' };
  } else if (state === 'offscreen') {
    cfg.offscreen = [...hud.cast, hud.st].filter(Boolean).map((m) => ({ name: m.name, id: m.id, pos: m.pos, ghost: !!m.ghost }));
    cfg.bubbles = [];
  }
  hud.indicatorsConfig = cfg;
  engine.stats.indicators = { state };
  await mod.setup(hud);
  hud.ui.add((L) => mod.draw(hud, L), mod.z);
}

// ------------------------------------------------------------------------------------------------ door close-up
async function buildDoor(engine, params, state) {
  const P = (k, d) => params.get(k) ?? d;
  const tod = P('tod', state === 'door' ? 'night' : 'noon');
  if (!params.has('tod')) params.set('tod', tod);
  const [{ applyCamera, focusOf }, { buildTown }, { createUILayers }, cs] = await Promise.all([
    import('../src/town/api.js'), import('../src/town/town.js'), import('../src/ui/layer.js'), import('./char-stage.js')]);
  const focus = focusOf('house-0');
  const fixT = params.has('t') ? Number(P('t')) : null;
  const clock = (t) => (fixT !== null ? fixT : t);
  applyCamera(engine, 'gameplay', { focus: focus.clone().setY(0).add(new THREE.Vector3(0, 0, 3.2)), viewHeight: Number(P('vh', 12)) });
  const town = await buildTown(engine, params, { pieces: ['house-0'], strict: 'house-0', pad: true, clouds: false, cut: false });
  const piece = town.registry.get('house-0');
  const spot = piece.anchors.spots.door.clone();                       // ground in front of the door
  const pivot = piece.anchors.doors[0].pivot.getWorldPosition(new THREE.Vector3());
  const n = spot.clone().sub(focus).setY(0).normalize();               // door normal (outward: house centre → door spot)
  const doorC = spot.clone().addScaledVector(n, -0.6);                 // door centre on the ground (spot = 0.6 m out)
  const tan = new THREE.Vector3(n.z, 0, -n.x);
  const ground = { heightAt: () => 0 };
  const members = [];
  const mk = async (c, pos, faceTo) => {
    const m = { ...c, pos: pos.clone().setY(0), height: 1.3, actor: null };
    try {
      const loaded = await cs.loadCharacter(c.id, 'auto', { fx: true });
      m.height = loaded.spec.height || 1.3;
      const d = faceTo.clone().sub(pos);
      const face = Math.round(Math.atan2(d.x, d.z) / (45 * D2R)) * 45 * D2R;
      m.actor = cs.createActor(engine, loaded, { clip: c.clip || 'idle', face, pos: m.pos, move: false, at: 0.4, clock, ground, pin: false });
    } catch (e) { console.warn(`ui-indicators: ${c.id} failed: ${e.message}`); }
    m.head = () => m.pos.clone().setY(m.pos.y + m.height + 0.1);
    m.feet = () => m.pos.clone();
    members.push(m);
    return m;
  };
  const doorTop = doorC.clone().setY(2.6);
  // r2: house-0 has no door-board prop (r1's anchor floated over the shop window): the tokens are pinned ON the door
  // leaf, upper half (door ≈ 34 texels wide = exactly 2 tokens). CONTRACT-REQUEST (town): an anchors.board per house.
  const board = doorC.clone().setY(1.55).addScaledVector(n, 0.12);
  const cfg = { bubbles: [], talk: [], muted: [], offscreen: [], ripple: [] };
  if (state === 'door') {
    const dov = await mk({ ...MOCK_CAST.find((c) => c.name === 'Dov') }, spot.clone().addScaledVector(n, 3.2).addScaledVector(tan, -2.6), spot);
    cfg.you = { chevron: true, ring: false, guideTo: spot };
    cfg.doors = [{ pos: spot.clone().addScaledVector(n, 0.1), top: doorTop, owner: 'Dov', style: 'mine', ring: true }];
    cfg.compass = { steps: 4, home: spot };
    void dov;
  } else {
    await mk({ ...MOCK_CAST.find((c) => c.name === 'Cleo'), clip: 'idle' }, spot.clone().addScaledVector(n, 2.4).addScaledVector(tan, 2.2), spot);
    await mk({ ...MOCK_CAST.find((c) => c.name === 'Dov') }, spot.clone().addScaledVector(n, 3.4).addScaledVector(tan, -2.4), spot);
    cfg.you = { chevron: true, ring: true };
    cfg.doors = [{ pos: spot, top: doorTop, owner: 'Bram', style: 'player', ring: false, board,
      occupants: [{ name: 'Bram', id: 'owl' }, { name: 'Ada', id: 'frog' }, { name: 'Esme', id: 'rabbit', ghost: true }, { name: 'Gus', id: 'crow' },
        { name: 'Finn', id: 'goat' }, { name: 'Hob', id: 'snail' }] }];
    cfg.compass = null;
  }
  const ui = createUILayers(engine, { tod, timeFn: clock });
  const hud = { engine, params, P, tod, tok: kit.tokens(tod), kit, ui, terrain: null, place: null, clock,
    cast: members, st: null, you: members.find((m) => m.you) || null, indicatorsConfig: cfg };
  engine.stats.indicators = { state, door: [+spot.x.toFixed(2), +spot.z.toFixed(2)], normal: [+n.x.toFixed(2), +n.z.toFixed(2)], pivot: [+pivot.x.toFixed(2), +pivot.z.toFixed(2)] };
  await mod.setup(hud);
  ui.add((L) => mod.draw(hud, L), mod.z);
}
void MOCK_ST;
