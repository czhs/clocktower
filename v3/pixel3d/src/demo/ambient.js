// The demo's AMBIENT layer (owner: ui / demo; docs/DEMO.md §4.8; the library: docs/AMBIENT.md, src/ambient/**, read
// only here): the interactive ambient systems wired to the demo's REAL actors (the player + the idle NPCs), its clock
// and its life switch. Everything the town's own life piece (src/town/life) already draws is left to it, so nothing is
// doubled:
//   birds      pigeons on the west cobble lane south of the square + sparrows on the south dirt road; they ALERT and
//              SCATTER when you walk at them and resettle when you leave (day only). No crows: life owns the crows
//              (pinnacles, roofs, the square's setts, the bell / execution scares).
//   fireflies  night fireflies over the greens (the swarm parts round you), moths at the street lamps / stall lanterns
//              (they bonk off and scatter as you pass), day butterflies + bees on the system's own little blooms in
//              three garden corners. The town's own non-reactive moths + fireflies are switched off at the build
//              (main.js adds life's own `lifeOff=bugs` while this layer is on: ONE set of bugs, the reactive one).
//   fire       the fire under house-1's cauldron (Wychwood Cottage): stepped flame drawings, coals, embers, smoke, a
//              flare when you pass. Sprites only: fixtures: false (the cottage has its own logs), lights: [] (the time
//              module's constant pool owns every PointLight). The dais braziers are the dais piece's own flames: skipped.
//   props      things the town does not have: a hanging shop sign by the red market stall, wind chimes by the
//              boathouse bench, a scarecrow in the pumpkin patch by the gold stall: each swings / clashes / startles
//              as you pass. lights: [] (no lamps).
// Budget (measured, docs/DEMO.md §4.8): ~14 draw calls (birds 3, fireflies 2, fire 2, props 3 + 3 fixtures + 2 sprite
// batches, minus whatever has nothing to draw), NO PointLight (the light count, and so every program, stays
// constant), CPU < 0.3 ms per frame for the set. Shaders: the warm-up frames (behind the loading screen) show every
// batch once (night + day drawings), so no program compiles in play.
// Life switch: store.life false = the layer is hidden (root.visible; no light inside it) and not updated.
// ?ambient=0: off (A/B; life keeps its own bugs then). Deterministic: the systems run on the demo clock in the
// library's live mode (`ticker: { mode: 'live', window: 5 }`: forward-only, a jump simulates at most the last 5 s).
//
//   createAmbientLayer(demo) -> { amb, update(t, dt), info(), dispose() } | null
import * as THREE from 'three';
import { createAmbient } from '../ambient/index.js';

/** The demo's ambient spots (town metres; tiles from src/town/layout.js: tile (x, z) = metres [x, x + 1)). */
export const AMB_SPOTS = {
  pigeons: [17.0, 30.5],          // the west cobble lane south of the square ('=' tiles x 15-18, z 25-33)
  sparrows: [28.5, 35.0],         // the south dirt road (':' rows 34-35)
  // firefly swarms over the greens life used for its own (now switched off) fireflies; the south bay (z > 29) is
  // left out: house-9's roof hides it from the game camera
  swarms: [[7.0, 16.5, 2.4, 22], [39.0, 22.5, 2.2, 20], [13.2, 25.6, 1.4, 12], [31.7, 25.6, 1.4, 12], [22.5, 3.8, 2.5, 14]],
  gardens: [[9.6, 23.4, 0.9, 6], [24.3, 29.0, 0.8, 5], [34.6, 24.6, 0.9, 6]],      // blooms + butterflies + bees by day
  props: [
    { id: 'sign', kind: 'sign', at: [12.1, 15.9], yaw: -Math.PI / 4 },      // the red stall's shop sign, arm over the lane
    { id: 'chimes', kind: 'chimes', at: [10.9, 23.9], yaw: 0 },             // by the boathouse bench / flower barrel
    { id: 'scarecrow', kind: 'scarecrow', at: [34.8, 23.1], yaw: 0 },        // the pumpkin patch by the gold stall
  ],
};

export async function createAmbientLayer(demo) {
  const { engine, store, events, params, town, layout } = demo;
  if (params.get('ambient') === '0' || !town?.registry) return null;
  const reg = town.registry;
  const groundApi = reg.get?.('ground')?.api;
  const heightAt = (x, z) => (typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0);
  const V = (x, z, y = null) => new THREE.Vector3(x, y ?? heightAt(x, z), z);
  const tileOf = (x, z) => layout.groundAt?.(Math.floor(x), Math.floor(z)) ?? '.';
  const paved = (x, z) => '=o:O'.includes(tileOf(x, z));
  const grassy = (x, z) => '.,'.includes(tileOf(x, z)) && !layout.blocked?.(Math.floor(x), Math.floor(z));
  const lights = reg.anchors('lights');
  // moth lamps: the street lamps' glass + the market stalls' lanterns (life drew its moths on the same set)
  const lamps = lights.filter((l) => l.piece === 'props' && (l.kind === 'lamp' || l.kind === 'lantern')).map((l) => l.pos.clone());
  // house-1's cauldron fire (its 'fire' light anchor sits 0.3 m in front of the pot): a torch-sized flame under the pot
  // (the torch drawing is 0.36 m; a campfire's 0.78 m would cover the pot), emitter = pos + (0, 0.32, 0.26)
  const caul = lights.find((l) => l.piece === 'house-1' && l.kind === 'fire');
  const fires = caul ? [{ id: 'cauldron', kind: 'torch', pos: new THREE.Vector3(caul.pos.x, heightAt(caul.pos.x, caul.pos.z - 0.3) - 0.22, caul.pos.z - 0.3 - 0.26), yaw: 0 }] : [];
  const tod0 = demo.time?.preset?.name ?? demo.time?.preset ?? town.tod ?? 'noon';
  const systems = [
    { name: 'birds', opts: { center: V(...AMB_SPOTS.pigeons), sparrows: V(...AMB_SPOTS.sparrows), perches: [], crowsDay: 0, crowsDusk: 0, groundCrows: 0, pigeons: 7, sparrowCount: 5, groundOk: paved } },
    { name: 'fireflies', opts: {
      swarms: AMB_SPOTS.swarms.map(([x, z, r, n]) => ({ c: V(x, z), r, n })),
      gardens: AMB_SPOTS.gardens.map(([x, z, r, n]) => ({ c: V(x, z), r, n })),
      glow: [], water: [], lamps, mothsPerLamp: 3, butterflies: 5, bees: 5, avoid: (x, z) => !grassy(x, z),
    } },
    ...(fires.length ? [{ name: 'fire', opts: { fires, fixtures: false, lights: [] } }] : []),
    { name: 'props', opts: { props: AMB_SPOTS.props.map((p) => ({ id: p.id, kind: p.kind, pos: V(p.at[0], p.at[1]), yaw: p.yaw })), lights: [], lamps: 'auto' } },
  ];
  const amb = await createAmbient(engine, {
    systems, anchors: { perches: [], lights: [], spots: {} }, heightAt, tod: tod0, seed: 7, strict: false,
    autoUpdate: false, ticker: { mode: 'live', window: 5 },
  });
  amb.root.name = 'demo-ambient';

  // ---- actors: you (live, with your velocity) + the idle NPCs (standing)
  const last = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastT = null;
  const npcIds = new Set();
  function feedActors(t, dt) {
    const P = demo.player;
    if (P?.position && !P.interior) {
      tmp.set(P.position.x, heightAt(P.position.x, P.position.z), P.position.z);
      if (lastT !== null && dt > 0) vel.subVectors(tmp, last).multiplyScalar(1 / Math.max(dt, 1 / 120)); else vel.set(0, 0, 0);
      if (vel.lengthSq() > 400) vel.set(0, 0, 0);            // a teleport is not a sprint
      last.copy(tmp); lastT = t;
      amb.actors.set('you', tmp, vel, { height: P.handle?.height ?? 1.4, kind: 'walker' });
    } else if (lastT !== null) { amb.actors.remove('you'); lastT = null; }
    const seen = new Set();
    for (const n of demo.npcs?.members ?? []) {
      if (!n?.handle || !n.spot) continue;
      const id = `npc${n.slot}`;
      seen.add(id);
      amb.actors.set(id, V(n.spot.x, n.spot.z), null, { height: n.handle.height ?? 1.4, kind: 'walker' });
    }
    for (const id of npcIds) if (!seen.has(id)) amb.actors.remove(id);
    npcIds.clear(); for (const id of seen) npcIds.add(id);
  }

  // ---- time of day + life switch
  const todName = (e) => e?.preset?.name ?? e?.preset ?? demo.time?.preset?.name ?? demo.time?.preset ?? 'noon';
  let tod = String(tod0);
  const offs = [events.on('tod', (e) => { const n = String(todName(e)); if (n !== tod) { tod = n; if (ready) amb.setTimeOfDay(tod); } })];
  const visible = () => !!store.state.life && !demo.player?.interior;
  // ---- warm-up (behind the loading screen): the warm-up frames alternate night (fireflies' glow batch, moths) and day
  // (birds, butterflies, blooms), so every batch's program compiles there; then the real time of day. (The props' /
  // fire's fx sprites share the sprite programs: measured, nothing compiles when they first react.)
  let ready = !!window.__demo?.ready, frame = 0;
  offs.push(events.on('ready', () => { ready = true; amb.setTimeOfDay(tod); }));
  const stats = { frames: 0, ms: 0, msMax: 0 };
  return {
    amb,
    get visible() { return amb.root.visible; },
    update(t, dt) {
      const on = visible() || !ready;
      amb.root.visible = on;
      if (!on) return;
      const a = performance.now();
      if (!ready) amb.setTimeOfDay(frame++ % 2 === 0 ? 'night' : 'noon');
      feedActors(t, dt);
      amb.update(t, dt);
      const ms = performance.now() - a;
      stats.frames++; stats.ms += ms; stats.msMax = Math.max(stats.msMax, ms);
    },
    info() {
      const s = amb.stats();
      const per = {};
      for (const sys of amb.systems) per[sys.name] = s[sys.name];
      return {
        on: amb.root.visible, tod: amb.tod?.name, systems: amb.systems.map((x) => x.name), calls: s.totals.calls, lights: s.totals.lights,
        over: s.totals.over, updateMs: stats.frames ? +(stats.ms / stats.frames).toFixed(3) : 0, updateMsMax: +stats.msMax.toFixed(2),
        actors: amb.actors.list.map((x) => x.id), per,
        birds: amb.get('birds')?.api?.birds?.map?.((b) => ({ sp: b.sp, state: b.rec?.state ?? null, active: !!b.active })) ?? null,
        flees: (amb.get('birds')?.api?.events ?? []).length,
        events: Object.fromEntries(amb.systems.map((x) => [x.name, (x.sys.api?.events ?? []).length])),
      };
    },
    dispose() { for (const o of offs) o?.(); amb.dispose(); },
  };
}
