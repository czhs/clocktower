// Ambient system "props" (owner: props; contract docs/AMBIENT.md): proximity-reactive town props — a hanging shop
// sign, a garden gate, hanging street lamps (+ the lamplighter hook), wind chimes, a well bucket, a bell gallows, a
// fountain and a scarecrow. Each idles on its own stepped clock and gives a small, readable reaction when a walker
// comes by, then recovers.
//
// UNIQUE-TO-ME SHEET
//  - extra animated parts: sign BOARD (7 swing drawings, 11° stops), gate LEAF (opening angle stops + a 1-texel
//    'lift' rattle drawing), lamp HEAD (dark / lit glass x 5 sway stops) + an emissive flame sprite + a PointLight,
//    chime TUBES (rest / sway A,B / splay A,B), well BUCKET on its rope (7 stops), BELL + plumb clapper (7 stops, the
//    clapper touches the lip on the extremes = the strike), fountain WATER (jet, 4 falling streams, ripples, splash
//    drops: sprites), scarecrow BODY (idle / lean L,R / head L,R / startle / flap A,B) + straw bits.
//  - own gait / motion: each part on its own ambient clock: sign + bucket swing k=2 (7.5 fps, period 16 / 14 ticks),
//    the heavy bell k=3 (5 fps, period 27 ticks), gate k=2 (rattle on k=1), chimes k=2 (splay = 7.5 fps clatter),
//    lamp flame k=2 (4-level flicker), sway k=3, fountain streams k=2 / ripples k=3 / splash travel k=1 (<= 0.6 s),
//    scarecrow k=2. Swings are damped pendulums evaluated at the stepped clock time and quantised to the drawing
//    stops: no in-betweens, the amplitude drops by whole stops (3 -> 2 -> 1 -> rest).
//  - expressions in this style: a reaction is a SILHOUETTE change of >= 2 texels (the board kicks a whole 11° stop,
//    the gate leaf lifts 2 texels then jumps 15°/35°/60°/85°, the scarecrow's arms jerk up 24° and the hat pops 3
//    texels), flicker is a 4-level step, the bell's strike is the clapper drawing + 1-texel ring ticks for 2 steps.
//  - readability at game speed: triggers use the effective distance d - approach * 0.35 s (the walker's bow wave), so
//    the first visible beat (board / lamp kick, gate rattle, chime splay, head snap) lands >= 0.3 s before a 5.5 m/s
//    walker reaches the prop (firstFlee logged for ambientpack's reaction_lead); the big beat (full swing, startle,
//    splash) follows when the walker is close.
//
// RENDER: ONE pose batch for every moving part of every prop (colour + normal + shadow = 3 GL calls), ONE merged toon
// mesh for all static fixtures (3 calls; opts.fixtures = false for hosts with their own posts/basins), TWO sprite
// batches (fx: water / dust / straw / glints, solid; glow: lamp flames, emissive) = 8 GL calls. PointLights: 2
// (always in the scene, off = 0), on the two lamps listed in opts.lights.
//
// opts: {
//   props: [{ id, kind: 'sign'|'gate'|'lamp'|'chimes'|'well'|'bell'|'fountain'|'scarecrow', pos: Vector3 (ground),
//             yaw (rad; local +X = arm / fence / beam axis, +Z = front) }]   (default: the ambient-stage layout)
//   fixtures = true, lights = ['lampA', 'lampC'] (lamp ids owning the <= 2 PointLights),
//   lamps: 'auto' (dark tod -> lit from t = 0) | 'lamplighter' (lamps start unlit; an actor of kind 'lamplighter'
//          reaches each one it passes within 2.6 m with its pole, the flame catches 4 ticks later; or api.light /
//          api.dusk does)
// }
// api: { ids, light(id, t), douse(id, t), dusk(t0, gap = 0.6) (light every lamp in turn), setLamps(mode),
//        events (reaction log), stateOf(id, t), onLight(fn) / lightEvents() (the lamplighter's pole beat) }
//        — schedules are sorted lists: the image stays a pure f(t).
//
// r3 (art director 17/24): palette water + goblet fountain on one shared k=2 phase with 2-texel jet / streams and a
// real-distance splash; lamps in verdigris with mid-slate day glass, an amber fill + pale core when lit and a light
// hung low enough to throw a 3-band pool; chimes on a T-post birdhouse with pale vertical tubes that splay by whole
// texels; bucket 12° stops on a longer rope with 2-px drips into the water; gate opens 25/45/65/85 with a braceless
// one-band-lifted swing drawing; bell ring ticks step outward and its far swing stops short of the beam; first beats
// capped at a real distance (maxD); layout pulls the fountain / scarecrow to the trail and puts the well behind it.
import * as THREE from 'three';
import { defineSystem, Ticker, GRID_HZ, gridTime, clockIndex, clockTime, hash, clamp, mergePose, createPoseBatch,
  createSpriteBatch, flickerLevel } from './core.js';
import { BUILDERS, place, SPRITE, SIGN_STOPS, BUCKET_STOPS, BELL_STOPS, LAMP_STOPS, CHIME_DX, TX } from './props/drawings.js';
import { toonMaterial } from '../materials/toon.js';

const TAU = Math.PI * 2;
const STEP = 1 / GRID_HZ;

// ------------------------------------------------------------------------------------------------ tuning
// trig: effective distance (m) of the first beat; big: real distance of the big beat; look: lookahead (s).
// maxD (r3): the first beat also needs the walker REALLY within maxD m — the lookahead alone let a 5.8 m/s runner
// trigger props from 4-6 m (the next street, in a town).
const TUNE = {
  sign: { trig: 2.1, maxD: 3.0, big: 1.25, look: 0.35, k: 2, T: 16, tau: 1.7, kick: 1.2, amp: 3.3, gust: 0.55 },
  bucket: { trig: 2.0, maxD: 2.8, big: 1.95, look: 0.35, k: 2, T: 14, tau: 1.5, kick: 2.2, amp: 3.0, gust: 0.25 },
  bell: { trig: 1.8, maxD: 3.0, big: 1.4, look: 0.35, k: 3, T: 27, tau: 3.2, kick: 2.2, amp: 3.4, gust: 0 },
  lamp: { trig: 1.6, maxD: 2.8, big: 1.2, look: 0.35, k: 3, T: 15, tau: 1.3, kick: 1.1, amp: 2.2, gust: 0.35 },
  gate: { trig: 3.0, calm: 2.4, calmTime: 0.8, look: 0.35 },
  chimes: { trig: 2.2, maxD: 2.8, look: 0.35 },
  fountain: { near: 2.0, pass: 2.4 },        // splash on the real distance: < near, or < pass at the closest pass
  scarecrow: { alert: 2.8, alertMax: 3.4, startle: 1.9, startleMax: 2.3, look: 0.35, calm: 3.6, calmTime: 0.9 },
};
const BELL_FAR = 2;
const REACH_TICKS = 4;                       // lamplighter: pole reach -> flame (0.27 s)
const LAMP_POOL_Y = 1.0, LAMP_POOL_I = 4.0;  // pool light height (m) and intensity at flicker level 1                          // the bell's swing AWAY from the camera stops at +2 (r2: +3 rose into the beam)
const GATE_OPEN = [25, 45, 65, 85];          // r3: starts at 25° (15° sat nearly edge-on to the shaded side)
const GATE_CLOSE = [65, 45, 25, 0, 6, 0];
const CHIME_CLASH = ['splayA', 'splayB', 'splayA', 'splayB', 'swayA', 'swayB', 'swayA', 'swayB', 'swayA', 'rest', 'swayB', 'rest'];
const CHIME_GUST = ['swayA', 'rest', 'swayB', 'rest'];
const CROW_FLEE = ['startle', 'startle', 'flapA', 'flapB', 'flapA', 'flapB'];

/** Screen-right / screen-up ground directions from the camera yaw. */
function groundBasis(engine) {
  const y = engine.camera.yaw ?? Math.PI / 4;
  return { R: new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)), F: new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)), yaw: y };
}
/** The ambient-stage layout (scenes/ambient-stage.js: scr(sx, sy) = R*sx + F*2*sy around the world origin). */
function stageLayout(engine) {
  const { R, F, yaw } = groundBasis(engine);
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, 2 * sy);
  const face = yaw;                                   // local +Z -> towards the camera, +X -> screen right
  return [
    // r3 layout: lampA 1.8 m screen-left of the stage lantern (r2 stacked the two fixtures), the fountain and the
    // scarecrow pulled to ~1.7 / 2 m of the trail (r2: the walker never came closer than 2.7 / 3.5 m, so their
    // reactions fired with no visible cause), the well BEHIND the trail (r2: the walker ran behind its roof)
    { id: 'sign', kind: 'sign', pos: scr(4.85, -2.3), yaw: face - Math.PI / 4 },     // arm reaches screen down-right over the trail
    { id: 'fountain', kind: 'fountain', pos: scr(0.9, -2.55), yaw: face },
    { id: 'chimes', kind: 'chimes', pos: scr(-0.9, -1.75), yaw: face },
    { id: 'lampA', kind: 'lamp', pos: scr(0.6, -1.05), yaw: face },
    { id: 'lampB', kind: 'lamp', pos: scr(-4.1, 0.85), yaw: face },
    { id: 'lampC', kind: 'lamp', pos: scr(1.0, 3.3), yaw: face },
    { id: 'gate', kind: 'gate', pos: scr(-6.63, 1.7), yaw: face },
    { id: 'scarecrow', kind: 'scarecrow', pos: scr(-4.5, -1.05), yaw: face },
    { id: 'well', kind: 'well', pos: scr(-2.4, 0.1), yaw: face },
    { id: 'bell', kind: 'bell', pos: scr(5.0, 0.0), yaw: face - Math.PI / 4 },     // beam across the trail leg
  ];
}

/** Damped pendulum quantised to drawing stops: round(A e^(-a/tau) sin(2π a/T)) clamped to +-n. */
function swingStop(age, amp, dir, T, tau, n) {
  if (!(age >= 0) || amp <= 0) return 0;
  const env = amp * Math.exp(-age / tau);
  if (env < 0.5) return 0;
  const v = env * Math.sin(TAU * (age / T + 0.15));      // starts 0.15 period in: the first drawing is already a whole stop
  return clamp(Math.round(v) * dir, -n, n);
}

export default defineSystem({
  name: 'props', owner: 'props', budget: { glCalls: 8, lights: 2, instances: 32 },
  create(ctx, opts = {}) {
    const { engine, actors, heightAt } = ctx;
    const seed = ctx.seed;
    const UP = new THREE.Vector3(0, 1, 0);
    const defs = opts.props ?? stageLayout(engine);
    const cam = engine.camera;
    const camR = new THREE.Vector3(Math.cos(cam.yaw ?? Math.PI / 4), 0, -Math.sin(cam.yaw ?? Math.PI / 4));
    const toCam = new THREE.Vector3(Math.sin(cam.yaw ?? Math.PI / 4) * Math.cos(cam.pitch ?? Math.PI / 6), Math.sin(cam.pitch ?? Math.PI / 6), Math.cos(cam.yaw ?? Math.PI / 4) * Math.cos(cam.pitch ?? Math.PI / 6));

    // ---- drawings: one pose list for the whole system, static fixtures merged into one mesh
    const built = {}, poseGeos = [], poseIx = {};
    for (const kind of new Set(defs.map((d) => d.kind))) {
      const B = BUILDERS[kind];
      if (!B) throw new Error(`props: unknown kind '${kind}'`);
      const b = built[kind] = B();
      poseIx[kind] = {};
      for (const [part, m] of Object.entries(b.moving)) {
        poseIx[kind][part] = {};
        for (const [name, parts] of Object.entries(m.poses)) poseIx[kind][part][name] = poseGeos.push(mergePose(parts)) - 1;
      }
    }
    const fixtureParts = [];
    const props = defs.map((d, i) => {
      const pos = d.pos.clone(); pos.y = d.pos.y || heightAt(pos.x, pos.z) || 0;
      const yaw = d.yaw ?? 0;
      const b = built[d.kind];
      if (opts.fixtures !== false) fixtureParts.push(...place(b.parts, pos, yaw));
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      const local = (v) => new THREE.Vector3(...v).applyQuaternion(q).add(pos);
      const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(q), axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const parts = Object.fromEntries(Object.entries(b.moving).map(([k, m]) => [k, { pivot: local(m.pivot), local: m.pivot }]));
      // the point the walker is measured against (on the ground)
      const c = d.kind === 'sign' ? local([0.6, 0, 0]) : d.kind === 'lamp' ? local([0.5, 0, 0]) : d.kind === 'chimes' ? local([0.5, 0, 0]) : pos.clone();
      return { i, id: d.id ?? `${d.kind}${i}`, kind: d.kind, pos, yaw, q, axisX, axisZ, parts, c, b, ph: Math.floor(hash(i, 5, seed) * 12), local };
    });
    let fixtureMesh = null;
    if (fixtureParts.length) {
      const geo = mergePose(fixtureParts);
      const mat = toonMaterial(engine, { vertexColors: true, toneAttributes: true, flatShading: true, outline: 'full' });
      fixtureMesh = new THREE.Mesh(geo, mat);
      fixtureMesh.castShadow = true; fixtureMesh.receiveShadow = true; fixtureMesh.name = 'ambient-props-fixtures';
      ctx.root.add(fixtureMesh);
    }
    const nInst = props.reduce((n, p) => n + Object.keys(p.parts).length, 0);
    // the gate leaf's mid-swing drawing is lifted one band (cutMod on its pose index): turned towards edge-on, its
    // shaded back face otherwise merged with its outlines into a black mass (r2 critic, 15° / 35° drawings)
    const liftIx = poseIx.gate?.leaf?.swing;
    const material = liftIx !== undefined ? { cutMod: `abs(aPose - ${liftIx.toFixed(1)}) < 0.5 ? 1.0 : 0.0` } : undefined;
    const batch = createPoseBatch(engine, { poses: poseGeos, max: Math.max(1, nInst), name: 'ambient-props', parent: ctx.root, material });
    const fx = createSpriteBatch(engine, { max: 256, emissive: false, name: 'ambient-props-fx', parent: ctx.root });
    const glow = createSpriteBatch(engine, { max: 32, emissive: true, haloGain: 0.5, name: 'ambient-props-glow', parent: ctx.root });

    // ---- lamps: PointLights (<= 2, always present)
    const lamps = props.filter((p) => p.kind === 'lamp');
    const want = opts.lights ?? ['lampA', 'lampC'];
    for (const p of lamps.filter((l) => want.includes(l.id)).slice(0, 2)) {
      // r3: the toon point light has a hard reach of uPointShape.y (1.8 m at night, shared): hung at the lamp head
      // (2.0 m up) it never reached the ground. The light sits LOW under the head (1.0 m up) with distance 0 (= the
      // shared reach): a stepped 3-band pool of ~1.3 m radius on the ground under each lamp.
      const pl = new THREE.PointLight(new THREE.Color('#FFC46B'), 0, 0, 1.5);
      pl.castShadow = false; pl.name = `ambient-props-${p.id}`;
      pl.position.copy(p.parts.head.pivot); pl.position.y = p.pos.y + LAMP_POOL_Y;
      ctx.root.add(pl);
      p.light = pl;
    }
    let lampMode = opts.lamps ?? 'auto';
    let lampSched = [];                                // [{ id, t, on }] sorted
    let tod = ctx.tod;

    // ---- colours (linear), darkened at night for the solid sprites
    const C = Object.fromEntries(Object.entries(SPRITE).map(([k, v]) => [k, new THREE.Color(v)]));
    const nightTint = new THREE.Color(0.42, 0.5, 0.72);
    const tint = new THREE.Color(1, 1, 1);
    const col = new THREE.Color();
    const solid = (c, gain = 1) => col.copy(c).multiply(tint).multiplyScalar(gain);

    // ---- simulation (15 Hz replay ticker)
    const events = [];
    let firstFlee = '';
    const log = (p, t, hit, what) => {
      events.push({ id: p.id, t: +t.toFixed(3), what, d: +hit.d.toFixed(2), v: +hit.speed.toFixed(2) });
      if (!firstFlee && hit.speed > 0.05) firstFlee = `${t.toFixed(3)}s@${hit.d.toFixed(2)}m/${hit.speed.toFixed(2)}mps`;
    };
    const eff = (hit, look) => {
      if (!hit) return Infinity;
      if (hit.speed < 0.3) return hit.d * 1.35;
      return hit.d - Math.max(0, hit.approach) * look;
    };
    const reset = () => {
      events.length = 0; firstFlee = '';
      for (const p of props) {
        p.s = { t0: -99, amp: 0, dir: 1, big: -99, near: false, mode: 'idle', gdir: 1, calm: 0, from: 0, drips: [], strikes: [],
          litAt: Infinity, outAt: Infinity, gutter: -99, gutDir: 1, splash: -99, splashDir: [0, 0], ripple: -99, crow: 'idle', side: 1, straw: -99 };
      }
      // lamps: auto mode is lit from the start in the dark; scheduled events apply on top
      for (const p of lamps) {
        if (lampMode === 'auto' && tod.dark) p.s.litAt = -1;
        // scheduled times snap UP to the next grid tick: an off-grid litAt (dusk 1.1 s = tick 16.5) put the ignition
        // drawings on odd 30 Hz frames (x1 drawings in the golden holds check)
        for (const e of lampSched) if (e.id === p.id || e.id === '*') {
          const tq = Math.ceil(e.t * GRID_HZ - 1e-6) / GRID_HZ;
          if (e.on && tq < p.s.litAt && !(p.s.litAt < 0)) p.s.litAt = tq;
          if (!e.on) p.s.outAt = Math.min(p.s.outAt, tq);
        }
      }
    };
    const swingTick = (p, t, hit, P, n) => {
      const S = p.s, e = eff(hit, P.look);
      const env = S.amp * Math.exp(-(t - S.t0) / P.tau);
      const axis = p.kind === 'well' || p.kind === 'lamp' ? p.axisX : p.axisZ;
      const push = hit ? Math.sign((hit.item.vx * axis.x + hit.item.vz * axis.z) || 1) : 1;
      // sign / bell swing about local X (bottom moves along +Z for a negative angle); bucket / lamp about local Z
      const dir = axis === p.axisZ ? -push : push;
      if (hit && hit.speed > 0.3 && e < P.trig && hit.d < (P.maxD ?? Infinity) && hit.approach > 0 && env < 1.0 && !S.near) {
        S.t0 = t; S.amp = P.kick; S.dir = dir; S.near = true; log(p, t, hit, 'kick');
      }
      if (hit && hit.d < P.big && S.big < t - 1.0 && hit.speed > 0.3 && (t - S.t0) > 0.12) {
        S.t0 = t; S.amp = P.amp; S.dir = dir; S.big = t; events.push({ id: p.id, t: +t.toFixed(3), what: 'swing', d: +hit.d.toFixed(2), v: +hit.speed.toFixed(2) });
      }
      if (!hit || hit.d > P.trig + 1.5) S.near = false;
      void n;
    };
    const tickFn = (t) => {
      const snap = actors.snapshot(t);
      for (const p of props) {
        const hit = snap.nearest(p.c.x, p.c.z, 12);
        const S = p.s;
        switch (p.kind) {
          case 'sign': swingTick(p, t, hit, TUNE.sign, 3); break;
          case 'bell': swingTick(p, t, hit, TUNE.bell, 3); break;
          case 'well': swingTick(p, t, hit, TUNE.bucket, 3); break;
          case 'lamp': {
            swingTick(p, t, hit, TUNE.lamp, 2);
            // lamplighter: an actor of kind 'lamplighter' passing within 2.6 m (its pole) lights an unlit lamp in the dark
            // r3: the lamplighter's POLE BEAT: in reach at t -> 'reach' event, the lamp catches 4 ticks later (litAt), so a
            // lamplighter character can play a reach / pole pose in between (api.onLight / api.lightEvents)
            if (tod.dark && !(S.litAt <= t + REACH_TICKS * STEP + 1e-6)) {
              for (const it of snap.items) if (it.kind === 'lamplighter' && Math.hypot(it.x - p.c.x, it.z - p.c.z) < 2.6) {
                S.litAt = t + REACH_TICKS * STEP;
                events.push({ id: p.id, t: +t.toFixed(3), what: 'reach' });
                for (const fn of lightListeners) fn({ id: p.id, reach: t, lit: S.litAt, x: it.x, z: it.z, actor: it.id });
                break;
              }
            }
            const e = eff(hit, TUNE.lamp.look);
            if (hit && e < TUNE.lamp.trig && hit.approach > 0 && t - S.gutter > 1.2) { S.gutter = t; S.gutDir = Math.sign((hit.ax * p.axisX.x + hit.az * p.axisX.z) || 1); }
            break;
          }
          case 'gate': {
            const G = TUNE.gate, e = eff(hit, G.look);
            const side = hit ? Math.sign(((hit.item.x - p.pos.x) * p.axisZ.x + (hit.item.z - p.pos.z) * p.axisZ.z) || 1) : 1;
            const raw = hit ? hit.d : Infinity;
            S.calm = raw > G.calm ? S.calm + STEP : 0;
            if ((S.mode === 'idle' || S.mode === 'closing') && hit && e < G.trig && hit.approach > 0.5 && hit.speed > 0.3) {
              if (S.mode === 'idle') { S.gdir = side; S.mode = 'rattle'; S.t0 = t; log(p, t, hit, 'rattle'); }
              else { S.mode = 'opening'; S.from = Math.max(0, GATE_OPEN.findIndex((a) => a >= gateAngle(p, t))); S.t0 = t - S.from * 2 * STEP; }
            } else if (S.mode === 'rattle' && t - S.t0 >= 4 * STEP) { S.mode = 'opening'; S.t0 = t; S.from = 0; }
            else if (S.mode === 'opening' && t - S.t0 >= GATE_OPEN.length * 2 * STEP) { S.mode = 'open'; S.t0 = t; }
            else if (S.mode === 'open' && S.calm >= G.calmTime) { S.mode = 'closing'; S.t0 = t; }
            else if (S.mode === 'closing' && t - S.t0 >= GATE_CLOSE.length * 2 * STEP) { S.mode = 'idle'; S.t0 = t; }
            break;
          }
          case 'chimes': {
            const e = eff(hit, TUNE.chimes.look);
            if (hit && e < TUNE.chimes.trig && hit.d < TUNE.chimes.maxD && hit.approach > 0 && hit.speed > 0.3 && t - S.t0 > 1.0 && !S.near) { S.t0 = t; S.near = true; S.big = -99; log(p, t, hit, 'clash'); }
            // the close pass (brushed) clatters again from the top of the clash
            if (hit && hit.d < 1.3 && hit.speed > 0.3 && t - S.t0 > 0.4 && S.big < S.t0) { S.t0 = t; S.big = t; events.push({ id: p.id, t: +t.toFixed(3), what: 'brush', d: +hit.d.toFixed(2) }); }
            if (!hit || hit.d > TUNE.chimes.trig + 1.5) S.near = false;
            break;
          }
          case 'fountain': {
            // r3: the splash answers the walker's REAL closeness (r2 fired on the lookahead at 4.1 m, off-screen)
            const F = TUNE.fountain;
            if (hit && hit.speed > 0.3 && (hit.d < F.near || (hit.d < F.pass && hit.approach < 0.5)) && t - S.splash > 2.0 && !S.near) {
              S.splash = t; S.near = true; S.splashDir = [-hit.ax, -hit.az]; log(p, t, hit, 'splash');
            }
            if (!hit || hit.d > F.pass + 1.5) S.near = false;
            break;
          }
          case 'scarecrow': {
            const T = TUNE.scarecrow, e = eff(hit, T.look);
            const side = hit ? Math.sign(((hit.item.x - p.pos.x) * p.axisX.x + (hit.item.z - p.pos.z) * p.axisX.z) || 1) : S.side;
            const raw = hit ? hit.d : Infinity;
            S.calm = raw > T.calm ? S.calm + STEP : 0;
            if (S.crow === 'idle' && hit && e < T.alert && hit.d < T.alertMax && hit.speed > 0.3) { S.crow = 'alert'; S.t0 = t; S.side = side; log(p, t, hit, 'alert'); }
            if (S.crow === 'alert') {
              S.side = side;
              if (hit && e < T.startle && hit.d < T.startleMax && hit.approach > 0) { S.crow = 'flee'; S.t0 = t; S.straw = t; events.push({ id: p.id, t: +t.toFixed(3), what: 'startle', d: +hit.d.toFixed(2) }); }
              else if (S.calm >= T.calmTime && t - S.t0 > 0.6) { S.crow = 'return'; S.t0 = t; }
            } else if (S.crow === 'flee' && t - S.t0 >= CROW_FLEE.length * 2 * STEP) { S.crow = 'away'; S.t0 = t; }
            else if (S.crow === 'away') { S.side = side; if (S.calm >= T.calmTime && t - S.t0 > 0.6) { S.crow = 'return'; S.t0 = t; } }
            else if (S.crow === 'return' && t - S.t0 >= 4 * STEP) { S.crow = 'idle'; S.t0 = t; }
            break;
          }
        }
      }
    };
    const lightListeners = [];
    const ticker = new Ticker({ hz: GRID_HZ, reset, tick: tickFn });
    reset();

    // ---- per-kind drawing state at time t
    function gateAngle(p, t) {
      const S = p.s, a = Math.floor((t - S.t0) / (2 * STEP) + 1e-6);
      if (S.mode === 'opening') return GATE_OPEN[Math.min(GATE_OPEN.length - 1, a + 0)];
      if (S.mode === 'open') return GATE_OPEN[GATE_OPEN.length - 1];
      if (S.mode === 'closing') return GATE_CLOSE[Math.min(GATE_CLOSE.length - 1, a)];
      return 0;
    }
    // gusts: a pure f(t) schedule per prop (wind rocks signs, lamps, the bucket and the chimes now and then)
    const gustAt = (p, t, P) => {
      if (!P.gust) return 0;
      const slot = Math.floor((t + p.ph * 0.37) / 5.2);
      if (hash(slot, p.i, seed) > P.gust) return 0;
      const start = slot * 5.2 - p.ph * 0.37 + 0.6 + hash(slot, p.i, seed + 1) * 2.4;
      const a = clockTime(t, P.k) - start;
      if (a < 0 || a > P.T * STEP * 1.0) return 0;
      return Math.sin(TAU * a / (P.T * STEP)) * (hash(slot, p.i, seed + 2) < 0.5 ? 1 : -1);
    };
    const bellClamp = (v) => Math.min(v, BELL_FAR);
    const swingNow = (p, t, P, n) => {
      const S = p.s, ts = clockTime(t, P.k, 0);
      let v = swingStop(ts - S.t0, S.amp, S.dir, P.T * STEP, P.tau, n);
      if (p.kind === 'bell') v = bellClamp(v);
      if (v !== 0) return v;
      return clamp(Math.round(gustAt(p, t, P) * 1.0), -1, 1);
    };
    const lampLit = (p, t) => tod.dark && p.s.litAt <= t && t < p.s.outAt;

    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    const rotLocal = (p, partLocalPivot, v, axis, deg) => {
      // v (pose-local, relative to pivot) rotated about axis by deg -> world
      const e = new THREE.Euler(axis === 'x' ? deg * Math.PI / 180 : 0, 0, axis === 'z' ? deg * Math.PI / 180 : 0);
      return tmp2.set(...v).applyEuler(e).add(new THREE.Vector3(...partLocalPivot)).applyQuaternion(p.q).add(p.pos);
    };
    let nfx = 0, nglow = 0;
    const putFx = (pos, c, size = 1, shape = 0) => { if (nfx < fx.max) fx.set(nfx++, pos, c, size, shape); };
    const putGlow = (pos, c, size = 1, shape = 0) => { if (nglow < glow.max) glow.set(nglow++, pos, c, size, shape); };
    const counts = {};

    function draw(t) {
      nfx = 0; nglow = 0;
      let inst = 0;
      const tg = gridTime(t);
      for (const k in counts) counts[k] = 0;
      for (const p of props) {
        const S = p.s, I = poseIx[p.kind];
        let state = 'idle';
        switch (p.kind) {
          case 'sign': {
            const st = swingNow(p, t, TUNE.sign, 3);
            batch.set(inst++, p.parts.board.pivot, p.yaw, I.board[`s${SIGN_STOPS[st + 3]}`]);
            state = st ? 'swing' : 'idle';
            break;
          }
          case 'well': {
            const st = swingNow(p, t, TUNE.bucket, 3);
            batch.set(inst++, p.parts.bucket.pivot, p.yaw, I.bucket[`b${BUCKET_STOPS[st + 3]}`]);
            // drips: a drop falls from the bucket for 5 ticks after each extreme of a big swing
            const P = TUNE.bucket, ts = clockTime(t, P.k);
            for (let back = 0; back < 3; back++) {
              const t1 = ts - back * P.k * STEP;
              const s1 = swingStop(t1 - S.t0, S.amp, S.dir, P.T * STEP, P.tau, 3), s0 = swingStop(t1 - P.k * STEP - S.t0, S.amp, S.dir, P.T * STEP, P.tau, 3);
              const s2 = swingStop(t1 + P.k * STEP - S.t0, S.amp, S.dir, P.T * STEP, P.tau, 3);
              if (Math.abs(s1) >= 2 && Math.abs(s1) >= Math.abs(s0) && Math.abs(s1) > Math.abs(s2)) {
                // r3: 2-texel drops that land IN the visible water disc and leave a 2-dot ripple for one drawing
                const age = tg - t1;
                const bot = rotLocal(p, p.b.moving.bucket.pivot, [0, p.b.anchors.bottom, 0], 'z', BUCKET_STOPS[s1 + 3]).clone();
                const water = p.pos.y + p.b.anchors.water + 0.01, fall = bot.y - water;
                const tLand = Math.sqrt(fall / 4.9);
                if (age >= 0 && age < tLand) {
                  bot.y -= 4.9 * age * age;
                  putFx(bot, solid(C.water), 2);
                } else if (age >= tLand && age < tLand + 2 * STEP + 1e-6) {
                  bot.y = water;
                  for (const sx of [-1, 1]) putFx(tmp.copy(bot).addScaledVector(camR, sx * 2 * TX), solid(C.water), 1);
                }
              }
            }
            state = st ? 'swing' : 'idle';
            break;
          }
          case 'bell': {
            const P = TUNE.bell, st = swingNow(p, t, P, 3);
            batch.set(inst++, p.parts.bell.pivot, p.yaw, I.bell[`b${BELL_STOPS[st + 3]}`]);
            // strike: arrived at an extreme stop |s| >= 2 -> a ')' of ring ticks beside the lip on the strike drawing and the
            // next one only, stepping 1 texel OUTWARD per drawing (r2: 3 dots in a fixed column held 0.7 s = a stuck line)
            const ts = clockTime(t, P.k);
            const stopAt = (tt) => bellClamp(swingStop(tt - S.t0, S.amp, S.dir, P.T * STEP, P.tau, 3));
            for (let back = 0; back < 2; back++) {
              const t1 = ts - back * P.k * STEP;
              const s1 = stopAt(t1), s0 = stopAt(t1 - P.k * STEP);
              if (Math.abs(s1) >= 2 && Math.abs(s1) > Math.abs(s0)) {
                const sd = Math.sign(s1), lip = rotLocal(p, p.b.moving.bell.pivot, [0, -0.56, 0.27 * -sd], 'x', BELL_STOPS[s1 + 3]).clone();
                const out = (3 + 2 * back) * TX, h = (2 + back) * TX;
                // screen-sideways = the camera's right vector on the ground; the strike side follows the swing direction
                const side = Math.sign(-sd * (p.axisZ.x * camR.x + p.axisZ.z * camR.z)) || 1;
                for (const [dy, o] of [[h, 0], [0, 1], [-h, 0]]) {
                  tmp.copy(lip).addScaledVector(camR, side * (out + o * TX)); tmp.y += dy / Math.cos(cam.pitch ?? Math.PI / 6);
                  putFx(tmp, solid(C.ring), 1);
                }
                state = 'ring';
                break;
              }
            }
            if (state !== 'ring') state = st ? 'swing' : 'idle';
            break;
          }
          case 'lamp': {
            const P = TUNE.lamp, st = swingNow(p, t, P, 2);
            const lit = lampLit(p, t);
            const deg = LAMP_STOPS[st + 2];
            batch.set(inst++, p.parts.head.pivot, p.yaw, I.head[`${lit ? 'l' : 'd'}${deg}`]);
            let level = 0;
            if (lit) {
              const age = tg - S.litAt;
              // r3 lit glass: an additive amber FILL square over the pane (the toon glass alone went dull brown under the
              // night ramps) + a 1-texel pale CORE; the 4-level flicker steps the fill. Ignition: spark (core only, 2
              // ticks) -> small (core + dim fill, 3) -> flare (bright fill + 5-texel diamond, 2) -> burning. A rush-by
              // gutters it (core shifted 1 texel, fill dim, 4 ticks) then flares (2).
              const ga = tg - S.gutter;
              level = flickerLevel(t, { k: 2, levels: 4, depth: 0.3, seed: seed + p.i * 7 });
              let fill = 0.6 + 0.4 * level, core = C.flame, flare = false, dx = 0;
              if (S.litAt > 0 && age < 2 * STEP) { fill = 0; level = 0.25; }
              else if (S.litAt > 0 && age < 5 * STEP) { fill = 0.35; level = 0.5; }
              else if (S.litAt > 0 && age < 7 * STEP) { fill = 1.25; level = 1.2; flare = true; }
              else if (ga >= 0 && ga < 4 * STEP) { fill = 0.35; dx = S.gutDir; level *= 0.55; }
              else if (ga >= 4 * STEP && ga < 6 * STEP) { fill = 1.2; level = 1.15; flare = true; }
              const ctr = rotLocal(p, p.b.moving.head.pivot, [0, -0.41, 0], 'z', deg).clone().addScaledVector(toCam, 0.2);
              const nightGain = 0.55 + 0.45 * clamp((tod.night - 0.5) / 0.5);    // golden: less (the glass is lit by the sun too)
              if (fill > 0) {
                const fc = col.copy(C.flame2).multiplyScalar(0.42 * fill * nightGain);
                putGlow(tmp.copy(ctr).addScaledVector(UP, 1 * TX / Math.cos(cam.pitch ?? Math.PI / 6)), fc, 5, 0);
                putGlow(tmp.copy(ctr).addScaledVector(UP, -1 * TX / Math.cos(cam.pitch ?? Math.PI / 6)), fc, 5, 0);
              }
              if (flare) putGlow(tmp.copy(ctr).addScaledVector(toCam, 0.05), col.copy(C.flame2).multiplyScalar(0.5), 5, 2);
              putGlow(tmp.copy(ctr).addScaledVector(p.axisX, dx * TX).addScaledVector(toCam, 0.06), col.copy(core).multiplyScalar(0.9), 1, 0);
              state = ga >= 0 && ga < 6 * STEP ? 'gutter' : age < 7 * STEP && S.litAt > 0 ? 'ignite' : 'lit';
            } else state = st ? 'swing' : 'idle';
            if (p.light) p.light.intensity = lit ? LAMP_POOL_I * level : 0;
            if (st && state === 'lit') state = 'swing';
            break;
          }
          case 'gate': {
            let ang = gateAngle(p, t);
            const lift = S.mode === 'rattle' && Math.floor((t - S.t0) / STEP + 1e-6) < 2;
            const leafPose = lift ? 'lift' : ang > 0 && ang < 80 ? 'swing' : 'rest';
            batch.set(inst++, p.parts.leaf.pivot, p.yaw + S.gdir * ang * Math.PI / 180, I.leaf[leafPose]);
            // scrape dust at the leaf's foot while it swings through 35 / 60 (opening) and on the closing clack
            const a = Math.floor((t - S.t0) / (2 * STEP) + 1e-6);
            if ((S.mode === 'opening' && (a === 1 || a === 2)) || (S.mode === 'closing' && a === 3)) {
              const yy = p.yaw + S.gdir * ang * Math.PI / 180;
              const qq = new THREE.Quaternion().setFromAxisAngle(UP, yy);
              for (let j = 0; j < 3; j++) {
                tmp.set(0.55 + j * 0.22, 0.04 + hash(j, a, p.i) * 0.08, 0.06 * (j - 1)).applyQuaternion(qq).add(p.parts.leaf.pivot);
                tmp.y = p.pos.y + 0.03 + (j % 2) * 0.06;
                putFx(tmp, solid(C.dust, 1.05), j === 1 ? 2 : 1);
              }
            }
            state = S.mode;
            break;
          }
          case 'chimes': {
            const age = tg - S.t0, ci = Math.floor(age / (2 * STEP) + 1e-6);
            let pose = 'rest';
            if (age >= 0 && ci < CHIME_CLASH.length) { pose = CHIME_CLASH[ci]; state = ci < 4 ? 'clash' : 'ring'; }
            else {
              const slot = Math.floor((t + p.ph) / 4.4);
              if (hash(slot, p.i, seed + 9) < 0.5) {
                const st = slot * 4.4 - p.ph + 1 + hash(slot, p.i, seed + 10) * 2;
                const gi = Math.floor((clockTime(t, 3) - st) / (3 * STEP) + 1e-6);
                if (gi >= 0 && gi < CHIME_GUST.length) { pose = CHIME_GUST[gi]; state = 'gust'; }
              }
            }
            batch.set(inst++, p.parts.chime.pivot, p.yaw, I.chime[pose]);
            if (pose.startsWith('splay')) {
              // glints on 3 of the 5 tubes (r2: 2 dots beside the tips), on the tube itself at its drawn offset
              const tubes = p.b.anchors.tubes, dxs = CHIME_DX[pose], skip = Math.floor(hash(ci, 7, p.i + seed) * 5);
              for (let j = 0, n = 0; j < 5 && n < 3; j++) {
                const k = (skip + j * 2) % 5;
                const tb = tubes[k];
                tmp.copy(p.local([p.b.moving.chime.pivot[0] + tb[0] + dxs[k] * TX, p.b.moving.chime.pivot[1] + tb[1] + ((j % 2) ? 0.06 : -0.03), tb[2]]));
                tmp.addScaledVector(toCam, 0.15);
                putFx(tmp, solid(C.glint, 1.1), 1); n++;
              }
            }
            break;
          }
          case 'fountain': {
            // r3 water: everything on ONE shared k=2 phase (r2 phased 4 ripples on k=3 by stream + streams on k=2: the
            // fountain changed on every 15 Hz tick, a fizz); jet and streams are 2-texel columns / arcs, not dots.
            const A = p.b.anchors, ph = cycleFrameLocal(t, 4, 2, 0);
            const age = tg - S.splash;
            const surge = age >= 0 && age < 6 * 2 * STEP ? [2, 3, 3, 2, 1, 1][Math.floor(age / (2 * STEP) + 1e-6)] : 0;
            const vy = TX / Math.cos(cam.pitch ?? Math.PI / 6);           // world y of one screen texel
            // jet: a 2-texel column over the finial, its top bobbing 1 texel (taller during a surge)
            const jetN = 3 + surge + (ph % 2);
            for (let j = 0; j < jetN; j++) {
              tmp.copy(p.local([0, A.spout[1] + j * 2 * vy, 0])).addScaledVector(toCam, 0.05);
              putFx(tmp, solid(j === jetN - 1 ? C.water : C.water2), 2);
            }
            // 4 streams arcing from the goblet rim to the pool (on the 45° directions): 2-texel arcs, a pale band
            // travelling down them on the shared phase
            const drop = A.rimY - A.pool;
            for (let s = 0; s < 4; s++) {
              const a = (s / 4) * TAU + Math.PI / 4;
              const reach = 0.2 + surge * 0.04;
              const n = 11;
              for (let j = 0; j < n; j++) {
                const u = j / (n - 1);
                const r = A.rim + reach * Math.sqrt(u), y = A.rimY - drop * u * u;
                tmp.copy(p.local([Math.sin(a) * r, y, Math.cos(a) * r]));
                putFx(tmp, solid((j + 4 - ph) % 4 === 0 ? C.water : C.water3), 2);
              }
              // landing: a 2-dot ripple either side of the stream foot, on for 2 of the 4 phases (all 4 together)
              if (ph < 2) {
                tmp2.copy(p.local([Math.sin(a) * (A.rim + reach), A.pool + 0.01, Math.cos(a) * (A.rim + reach)]));
                for (const sx of [-1, 1]) putFx(tmp.copy(tmp2).addScaledVector(camR, sx * (2 + (ph % 2)) * TX), solid(C.water), 1);
              }
            }
            // splash: 2-texel drops thrown from the pool towards the walker, ballistic on the 15 Hz travel clock (<= 0.6 s)
            if (age >= 0 && age < 0.6) {
              for (let j = 0; j < 10; j++) {
                const h1 = hash(j, 1, p.i + seed), h2 = hash(j, 2, p.i + seed), h3 = hash(j, 3, p.i + seed);
                const ang = Math.atan2(S.splashDir[0], S.splashDir[1]) + (h1 - 0.5) * 1.6;
                const r0 = 0.45 + h2 * 0.3, vh = 0.8 + h3 * 0.9, vy0 = 1.8 + h2 * 1.2;
                const x = Math.sin(ang) * (r0 + vh * age), z = Math.cos(ang) * (r0 + vh * age);
                const y = A.pool + vy0 * age - 4.9 * age * age;
                tmp.set(x, y, z).applyQuaternion(p.q).add(p.pos);
                const floor = Math.hypot(x, z) < 1.05 ? A.pool : 0.0;
                if (y >= floor) putFx(tmp, solid(j % 3 === 0 ? C.water : C.water2), 2);
              }
              // a ring on the pool for 2 drawings (k=2), stepping outward
              const ri = Math.floor(age / (2 * STEP) + 1e-6);
              if (ri < 2) {
                const rr = 0.5 + ri * 0.18;
                for (let j = 0; j < 36; j++) {
                  const a = (j / 36) * TAU;
                  tmp.copy(p.local([Math.sin(a) * rr, A.pool + 0.012, Math.cos(a) * rr]));
                  putFx(tmp, solid(C.water), 1);
                }
              }
              state = 'splash';
            }
            break;
          }
          case 'scarecrow': {
            const age = tg - S.t0, ci = Math.floor(age / (2 * STEP) + 1e-6);
            let pose = 'idle';
            const head = S.side < 0 ? 'headL' : 'headR';
            if (S.crow === 'alert' || S.crow === 'away') pose = head;
            else if (S.crow === 'flee') pose = CROW_FLEE[Math.min(CROW_FLEE.length - 1, ci)];
            else if (S.crow === 'return') pose = ci < 1 ? (S.side < 0 ? 'leanR' : 'leanL') : 'idle';
            else {
              const slot = Math.floor((t + p.ph * 0.5) / 3.6);
              if (hash(slot, p.i, seed + 21) < 0.55) {
                const st = slot * 3.6 - p.ph * 0.5 + 0.4 + hash(slot, p.i, seed + 22) * 1.6;
                const gi = Math.floor((clockTime(t, 4) - st) / (4 * STEP) + 1e-6);
                if (gi >= 0 && gi < 3) pose = ['leanL', 'idle', 'leanR'][hash(slot, p.i, seed + 23) < 0.5 ? gi : 2 - gi];
              }
            }
            batch.set(inst++, p.parts.body.pivot, p.yaw, I.body[pose]);
            // straw bits shaken off the cuffs on the startle: fall + drift for 0.8 s (travel on k=1)
            const sa = tg - S.straw;
            if (sa >= 0 && sa < 0.8) {
              for (let j = 0; j < 6; j++) {
                const cuff = p.b.anchors.cuffs[j % 2];
                const h1 = hash(j, 4, p.i + seed), h2 = hash(j, 5, p.i + seed);
                const x = cuff[0] * (1 + 0.15 * sa) + (h1 - 0.5) * 0.25 + Math.sign(cuff[0]) * 0.3 * sa;
                const y = cuff[1] + 0.12 + 0.9 * sa - 2.2 * sa * sa - h2 * 0.1;
                if (y > 0.05) putFx(p.local([x, y, 0.05 + (h2 - 0.5) * 0.2]), solid(j % 3 ? C.straw : C.straw2), 1);
              }
            }
            state = S.crow === 'idle' && pose !== 'idle' ? 'gust' : S.crow;
            break;
          }
        }
        counts[state] = (counts[state] || 0) + 1;
        p.state = state;
      }
      for (let i = inst; i < batch.max; i++) batch.hide(i);
      for (let i = nfx; i < fx.max; i++) fx.hide(i);
      for (let i = nglow; i < glow.max; i++) glow.hide(i);
      batch.commit(); fx.commit(); glow.commit();
    }
    function cycleFrameLocal(t, n, k, phase) { return ((clockIndex(t, k, phase) % n) + n) % n; }

    const resim = () => { ticker.n = null; };
    const api = {
      ids: props.map((p) => p.id),
      events,
      light(id, t) { lampSched.push({ id, t, on: true }); lampSched.sort((a, b) => a.t - b.t); resim(); },
      douse(id, t) { lampSched.push({ id, t, on: false }); lampSched.sort((a, b) => a.t - b.t); resim(); },
      dusk(t0 = 0.5, gap = 0.6) { lamps.forEach((p, i) => lampSched.push({ id: p.id, t: t0 + i * gap, on: true })); lampSched.sort((a, b) => a.t - b.t); resim(); },
      setLamps(mode) { lampMode = mode; resim(); },
      stateOf(id) { return props.find((p) => p.id === id)?.state ?? null; },
      /** Lamplighter hook: fn({ id, reach, lit, x, z, actor }) when a lamplighter's pole reaches an unlit lamp (the
       *  flame catches at `lit` = reach + 4 ticks: play the reach / pole pose in between). Called from the 15 Hz
       *  Ticker, so a replay (scrubbing back) calls it again for the same lamp: key on (id, reach). Returns an off(). */
      onLight(fn) { lightListeners.push(fn); return () => { const i = lightListeners.indexOf(fn); if (i >= 0) lightListeners.splice(i, 1); }; },
      /** Pure-data view of the same: [{ id, reach, lit }] for every reach logged up to the current time. */
      lightEvents() { return events.filter((e) => e.what === 'reach').map((e) => ({ id: e.id, reach: e.t, lit: +(e.t + REACH_TICKS * STEP).toFixed(3) })); },
    };

    return {
      api,
      update(t) {
        ticker.advance(t);
        draw(t);
      },
      setTimeOfDay(next) {
        tod = next;
        tint.setRGB(1, 1, 1).lerp(nightTint, clamp((tod.night - 0.2) / 0.8));
        resim();
      },
      stats() {
        return {
          agents: props.length, instances: nInst, visible: batch.visible, sprites: fx.visible + glow.visible, poses: poseGeos.length,
          calls: (fixtureMesh ? 3 : 0) + 3 + 2, lights: lamps.filter((p) => p.light).length, tris: Math.round(batch.tris),
          fixtureTris: fixtureMesh ? fixtureMesh.geometry.attributes.position.count / 3 : 0,
          states: props.map((p) => `${p.id}:${p.state ?? '-'}`).join(' '),
          flees: events.filter((e) => e.d !== undefined).length, firstFlee,
          log: events.slice(0, 24).map((e) => `${e.id}.${e.what}@${e.t}${e.d !== undefined ? '/' + e.d + 'm' : ''}`).join(' '),
          lampMode, lit: lamps.filter((p) => p.state && p.state !== 'idle' && p.state !== 'swing').map((p) => p.id).join(','),
        };
      },
      dispose() {
        batch.dispose(); fx.dispose(); glow.dispose();
        if (fixtureMesh) { fixtureMesh.removeFromParent(); fixtureMesh.geometry.dispose(); fixtureMesh.material.dispose(); }
        for (const p of lamps) if (p.light) { p.light.removeFromParent(); p.light.dispose?.(); }
      },
    };
  },
});
