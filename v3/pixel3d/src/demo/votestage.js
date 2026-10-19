// (B) The vote STAGING (pass B; docs/DEMO.md §4.9 "vote staging"): while the vote camera is up the scene may be staged
// differently from the day town (the user: "the voting circle can exaggerate things compared to the day - can take
// artistic licenses"; "focus on the players + the clock of the clocktower, as closely cropped as possible to maximise
// the detail on the characters"). A STAGE says where the 15 seated cast stand during the vote (their vote spots), how
// big they are, how the camera looks (yaw / pitch) and which clock face shares the frame (the tower's own dial, or a
// ceremonial twin dial), and optionally moves / shrinks the dais.
//   ?voteStage=<letter> picks a stage (default DEFAULT_STAGE); STAGES below = the options of the staging study
//   (shots/vote-options/contact-sheet.png).
//
//   createVoteStage(demo) -> stage { letter, def, spots [15 {x, y, z, face}], scale, pitch (rad), yaw (deg | null),
//        onStones, twin, active, gather {t0, dir}, gathered(i, t) (seat i stands on its vote spot), poofOf(i, t),
//        spotOf(i, t), update(t), info, dispose() }
// The default is A (the user's pick): the 15 seat stones round the dais, the vote camera's own fit (yaw 45), 1.0x.
// N (?voteStage=N, the staging study's pick) = the TOWER COURT CRESCENT - 15 in one open arc before the great door,
// every face to the camera, the cast at 1.35x, yaw 0 / pitch 22.5, the tower's clock face top-centre.
//
// THE GATHER (deterministic, a function of engine.time since the switch): when the vote camera comes up (store
// camera -> 'vote') each seat in turn (clockwise from XII, GATHER_STAGGER s apart) vanishes from its stone in the
// Storyteller's puff (the events group's poof frames, drawn by votemarks.js) and appears on its vote spot in a second
// puff at the same grid frame (poof showAt); leaving the vote camera runs the same sequence back. The camera steps
// through its own 4 key poses in the same 0.75 s (votecam.js). Nothing glides: every pose is a whole drawing.
import * as THREE from 'three';
import { seatPos, CIRCLE } from '../town/layout.js';
import { Builder, M } from '../town/kit.js';
import { TOWN_PALETTE as PAL } from '../town/palette.js';

const N = 15;
const DEG = Math.PI / 180;
export const GATHER_STAGGER = 0.035;      // s between seats (15 seats: 0.5 s round the ring)
export const POOF_SWAP = 3 / 15;          // the poof hides / shows the figure at drawing 3 (events TIMING.poof, 15 fps)
// (the user, 2026-10-17: "I like option A the best for the voting layout, remember in game there won't be the side
// panel, so you can use the whole screen") the default is A: the cast on the 15 seat stones, no gather; B..N stay
// reachable with ?voteStage=
export const DEFAULT_STAGE = 'A';

// ------------------------------------------------------------------------------------------------ layouts
/** the 15 seats in clock order (seat 0 at XII, clockwise) on a full ring centred (cx, cz), radius r, facing the centre */
function ring(cx, cz, r) {
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2, x = cx + Math.sin(a) * r, z = cz - Math.cos(a) * r;
    return { x, z, face: Math.atan2(cx - x, cz - z) };
  });
}
/** A HORSESHOE (a U open toward the camera, +z): the ring's clock order kept (seat 0 at XII = the back of the U,
 *  clockwise down the east arm to seat 7 at the east tip, seat 8 at the west tip back up to seat 14), seats evenly on
 *  an ellipse (rx across, rz deep) between -span .. +span degrees from XII; each faces `focus` (default: the U's mouth,
 *  so the back row looks at the camera and the arms turn inward 3/4). */
function horseshoe(cx, cz, rx, rz, spanDeg, focus = null) {
  const span = spanDeg * DEG, step = span / 7;
  const fx = focus?.[0] ?? cx, fz = focus?.[1] ?? cz + rz * 0.9;
  return Array.from({ length: N }, (_, i) => {
    const a = (i <= 7 ? i : i - N) * step, x = cx + Math.sin(a) * rx, z = cz - Math.cos(a) * rz;
    return { x, z, face: Math.atan2(fx - x, fz - z) };
  });
}
/** A CRESCENT (one row, an arc open toward the camera): seat 0 at the middle of the back, clockwise to the east end
 *  (seat 7), the west end (seat 8) back to seat 14; `s` m apart across the screen, the ends curving toward the camera
 *  (z = zb + c u^2); everyone faces `focus` (default: 7 m south of the middle, i.e. roughly the camera). */
function crescent(cx, zb, s, c, { zig = 0, focus = null } = {}) {
  const fx = focus?.[0] ?? cx, fz = focus?.[1] ?? zb + 7;
  return Array.from({ length: N }, (_, i) => {
    // zig: every other seat (seat 0 and its every-second neighbours stay on the arc) steps `zig` m toward the camera,
    // so neighbouring name labels sit at two heights instead of running into each other
    const k = i <= 7 ? i : i - N, u = k * s, x = cx + u, z = zb + c * u * u + (Math.abs(k) % 2 ? zig : 0);
    return { x, z, face: Math.atan2(fx - x, fz - z) };
  });
}
/** A CHOIR (two staggered rows, all facing the camera): back row = seats 12 13 14 0 1 2 3 (west -> east), front row =
 *  seats 4 .. 11 (east -> west), so the clock order runs round the pair of rows like a flattened ring. */
function choir(cx, zb, s, D, c = 0.04) {
  const out = new Array(N);
  const back = [12, 13, 14, 0, 1, 2, 3], front = [11, 10, 9, 8, 7, 6, 5, 4];
  back.forEach((seat, k) => { const u = (k - 3) * s; out[seat] = { x: cx + u, z: zb + c * u * u }; });
  front.forEach((seat, k) => { const u = (k - 3.5) * s; out[seat] = { x: cx + u, z: zb + D + c * u * u }; });
  for (const o of out) o.face = Math.atan2(cx - o.x, zb + 9 - o.z);
  return out;
}
const seats = () => Array.from({ length: N }, (_, i) => { const s = seatPos(i, N); return { x: s.x, z: s.z, face: Math.atan2(CIRCLE.cx - s.x, CIRCLE.cz - s.z) }; });

// ------------------------------------------------------------------------------------------------ the options
// yaw: degrees, or null = the vote camera's automatic choice (votecam CANDIDATES); pitch: degrees (30 = every preset);
// dial: 'tower' (the tower's own face) | 'twin' (a ceremonial twin of the tower dial, `twin` = {x, y, z, r, ry});
// dais: null | {scale, x, z} (the dais piece moved / shrunk while staged); onStones: the cast stay on the seat stones.
const TC = { cx: 22.5, cz: 12.35 };       // the TOWER COURT: the paving between the tower's plinth (z 9.0) and the ring
export const STAGES = {
  // (vote-fix4) A at pitch 23 (was 30): the ring's depth shrinks (r sin p) while the figures stand taller (h cos p),
  // so the same frame holds them ~15 % larger (1280x720: 56 -> 64 px with the plaque top left); ?votePitch= overrides
  A: { name: 'Pass B (now)', desc: 'the 15 seat stones (r 6.25), yaw 45 auto, pitch 23 (portrait 30)', spots: seats, onStones: true, yaw: null, pitch: 23, pitchPortrait: 30, scale: 1, dial: 'tower' },
  B: { name: 'Inner ring', desc: 'inner ring r 4.1 on the setts round the dais, yaw 45 auto', spots: () => ring(CIRCLE.cx, CIRCLE.cz, 4.1), yaw: null, pitch: 30, scale: 1, dial: 'tower' },
  C: { name: 'Inner ring, low cam', desc: 'inner ring r 4.1, yaw 0 toward the tower, pitch 20', spots: () => ring(CIRCLE.cx, CIRCLE.cz, 4.1), yaw: 0, pitch: 20, scale: 1, dial: 'tower' },
  D: { name: 'Tower court', desc: 'a horseshoe before the tower door (open to the camera), yaw 0, pitch 30', spots: () => horseshoe(TC.cx, TC.cz, 4.3, 2.75, 128), yaw: 0, pitch: 30, scale: 1, dial: 'tower' },
  E: { name: 'Tower court x1.35', desc: 'D with the cast at 1.35x (the tower stays): yaw 0, pitch 30', spots: () => horseshoe(TC.cx, TC.cz, 4.85, 2.9, 128), yaw: 0, pitch: 30, scale: 1.35, dial: 'tower' },
  F: { name: 'Tower court, low cam', desc: 'E (x1.3) with a lower camera: pitch 20', spots: () => horseshoe(TC.cx, TC.cz + 0.2, 4.75, 2.9, 128), yaw: 0, pitch: 20, scale: 1.3, dial: 'tower' },
  G: { name: 'Small dais at the tower', desc: 'the dais shrunk to 0.6 and moved before the tower, the cast (x1.2) on its stones, yaw 0', spots: () => ring(22.5, 13.25, 6.25 * 0.6), yaw: 0, pitch: 30, scale: 1.2, dial: 'tower', dais: { scale: 0.6, x: 22.5, z: 13.25 } },
  H: { name: 'Twin dial at the dais', desc: 'inner ring r 4.1 + a ceremonial twin of the tower dial north of the ring, the tower out of frame, yaw 0', spots: () => ring(CIRCLE.cx, CIRCLE.cz, 4.1), yaw: 0, pitch: 30, scale: 1, dial: 'twin', twin: { x: CIRCLE.cx, y: 1.55, z: CIRCLE.cz - 7.3, r: 1.12 } },
  I: { name: 'Twin dial x1.3', desc: 'H with the cast at 1.3x (ring r 4.6) and a larger twin dial', spots: () => ring(CIRCLE.cx, CIRCLE.cz, 4.6), yaw: 0, pitch: 30, scale: 1.3, dial: 'twin', twin: { x: CIRCLE.cx, y: 2.05, z: CIRCLE.cz - 7.6, r: 1.3 } },
  J: { name: 'Court ring x1.25', desc: 'a small full ring (r 3.2) before the tower door, the cast x1.25, yaw 0', spots: () => ring(TC.cx, 13.0, 3.2), yaw: 0, pitch: 30, scale: 1.25, dial: 'tower' },
  K: { name: 'Court choir x1.35', desc: 'two staggered rows before the tower, all facing the camera, x1.35', spots: () => choir(22.5, 9.95, 1.15, 2.6), yaw: 0, pitch: 30, scale: 1.35, dial: 'tower' },
  L: { name: 'Court crescent x1.5', desc: 'one row on an arc before the tower, open to the camera, x1.5', spots: () => crescent(22.5, 9.95, 1.05, 0.06), yaw: 0, pitch: 30, scale: 1.5, dial: 'tower' },
  M: { name: 'Court crescent x1.35', desc: 'one row on an arc before the tower (every other seat a step forward), open to the camera, x1.35', spots: () => crescent(22.5, 9.85, 0.97, 0.058, { zig: 0.6 }), yaw: 0, pitch: 30, scale: 1.35, dial: 'tower' },
  N: { name: 'Court crescent, low cam', desc: 'M with a lower camera (pitch 22.5)', spots: () => crescent(22.5, 9.85, 0.97, 0.058, { zig: 0.6 }), yaw: 0, pitch: 22.5, scale: 1.35, dial: 'tower' },
};

export function stageOf(letter) {
  const L = String(letter ?? DEFAULT_STAGE).toUpperCase();
  return STAGES[L] ? L : DEFAULT_STAGE;
}

/** Stepped gather progress of seat i at time t for a gather that started at t0 (dir 1 = in, 0 = out):
 *  -> { on (the seat stands on its vote spot), poof (0..1 of the poof timeline or null) } */
export function seatGather(i, t, g) {
  if (!g) return { on: false, poofK: null };
  const order = i;                                    // clockwise from XII
  const ts = g.t0 + order * GATHER_STAGGER, dt = t - ts;
  const swapped = dt >= POOF_SWAP;
  const on = g.dir === 1 ? swapped : !swapped;
  return { on, poofK: dt >= 0 && dt < 0.8 ? Math.floor(dt * 15) : null };
}

export function createVoteStage(demo) {
  const { engine, store } = demo;
  const params = demo.params ?? new URLSearchParams();
  const letter = stageOf(params.get('voteStage'));
  const def = STAGES[letter];
  // (vote-fix4) ?votePitch=15..35 (degrees): the stage's camera pitch for a comparison
  const pq = Number(params.get('votePitch')), pitchQ = params.get('votePitch') !== null && Number.isFinite(pq) && pq >= 15 && pq <= 35 ? pq : null;
  const spots = def.spots();
  const dais = demo.town?.registry?.get('dais');
  const groundApi = demo.town?.registry?.get('ground')?.api;
  const groundY = (x, z) => (typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0);
  for (const s of spots) s.y = def.onStones ? 0.235 : groundY(s.x, s.z);

  // the gather timeline: { t0, dir } of the last switch (null = never staged)
  let g = null, active = false, court = false;
  const want = () => store.state.camera === 'vote' && !demo.player?.interior;
  const info = { letter, name: def.name, active: false, gathered: 0, dais: null };

  // ---- the dais while staged (G): moved + shrunk round its own centre, swapped with the cast's poofs
  const daisG = dais?.group ?? null;
  const daisHome = daisG ? { p: daisG.position.clone(), s: daisG.scale.x } : null;
  let fireLight = null, fireHome = null;
  if (def.dais && daisG) {
    const anchor = new THREE.Vector3(CIRCLE.cx, 1.2, CIRCLE.cz);
    engine.scene.traverse((o) => { if (!fireLight && o.isPointLight && o.getWorldPosition(new THREE.Vector3()).distanceTo(anchor) < 0.05) fireLight = o; });
    if (fireLight) fireHome = fireLight.position.clone();
  }
  let daisStaged = false;
  function stageDais(on) {
    if (!def.dais || !daisG || on === daisStaged) return;
    daisStaged = on;
    const root = daisG.parent;
    if (on) {
      const p = new THREE.Vector3(def.dais.x, 0, def.dais.z);
      if (root) root.worldToLocal(p);
      daisG.position.set(p.x, daisHome.p.y, p.z); daisG.scale.setScalar(daisHome.s * def.dais.scale);
      if (fireLight) fireLight.position.copy(fireHome).add(new THREE.Vector3(def.dais.x - CIRCLE.cx, 0, def.dais.z - CIRCLE.cz));
    } else {
      daisG.position.copy(daisHome.p); daisG.scale.setScalar(daisHome.s);
      if (fireLight) fireLight.position.copy(fireHome);
    }
    daisG.updateMatrixWorld(true);
    info.dais = on ? { ...def.dais } : null;
  }

  // ---- the ceremonial twin dial (H / I): a copy of the tower's face (stone surround, brass bezel, glowing ivory face,
  // iron marks, the tower's time on its hands) on an ashlar pier north of the ring, facing the square. Kit solid +
  // glass: the town's own programs, nothing new to compile. Shown only while staged.
  let twin = null, twinHands = null, twinShown = -1;
  if (def.dial === 'twin' && def.twin) {
    const T = def.twin, R = T.r, Rs = R * 1.27, Rb = R * 1.125, TAU = Math.PI * 2;
    twin = { c: new THREE.Vector3(T.x, T.y, T.z + 0.32), n: new THREE.Vector3(0, 0, 1), r: Rs, face: R, k: R / 1.12, group: new THREE.Group() };
    twin.group.name = 'vote-twin-dial';
    const b = new Builder(engine, { name: 'vote-twin-dial' });
    b.box(Rs * 2 + 0.5, 0.16, 1.0, { tones: 'ashlar', pattern: 'none' });
    b.box(Rs * 2 + 0.3, 0.12, 0.85, { tones: 'ashlar', pattern: 'none', tint: 0.96, at: [0, 0.16, 0] });
    b.box(Rs * 1.5, Math.max(0.1, T.y - 0.28), 0.56, { tones: 'stone', pattern: 'ashlar', at: [0, 0.28, 0] });
    const disc = (r, z0, h, o) => { b.push(M({ at: [0, 0, z0], rx: Math.PI / 2 })); b.cylinder(r, r, h, { segments: 24, ...o }); b.pop(); };
    b.push(M({ at: [0, T.y, 0] }));
    disc(Rs, 0.0, 0.3, { tones: 'ashlar', pattern: 'none', tint: 0.98 });
    disc(Rb, 0.28, 0.1, { tones: 'brass', pattern: 'none' });
    disc(R, 0.33, 0.08, { tones: 'cream', layer: 'glass', glow: PAL.glow[0], glowKind: 1 });
    for (let i = 0; i < 12; i++) {
      const q = i % 3 === 0;
      b.push(M({ at: [0, 0, 0.42], rz: -(i / 12) * TAU }));
      b.box((q ? 0.12 : 0.075) * twin.k, (q ? 0.3 : 0.17) * twin.k, 0.025, { tones: 'iron', pattern: 'none', at: [0, (q ? 0.74 : 0.86) * twin.k, 0] });
      b.pop();
    }
    b.pop();
    for (const o of [...b.build({ name: 'vote-twin-dial' }).children]) twin.group.add(o);
    twinHands = new THREE.Group(); twinHands.name = 'vote-twin-hands';
    twin.group.add(twinHands);
    twin.group.position.set(T.x, 0, T.z);
    twin.group.visible = false;
    engine.scene.add(twin.group);
  }
  const HOUR = [[-0.055, -0.14], [0.055, -0.14], [0.06, 0.4], [0.12, 0.47], [0, 0.62], [-0.12, 0.47], [-0.06, 0.4]];
  const MIN = [[-0.04, -0.26], [0.04, -0.26], [0.04, 0.84], [0.075, 0.88], [0, 1.0], [-0.075, 0.88], [-0.04, 0.84]];
  function twinTime() {
    const tw = demo.town?.registry?.get('clocktower')?.api?.time ?? 0;
    if (tw === twinShown || !twinHands) return;
    twinShown = tw;
    for (const o of [...twinHands.children]) { twinHands.remove(o); o.geometry?.dispose(); }
    const hb = new Builder(engine, { name: 'vote-twin-hands' }), k = twin.k, TAU = Math.PI * 2;
    hb.push(M({ at: [0, def.twin.y, 0] }));
    hb.push(M({ at: [0, 0, 0.45], rz: -(tw / 720) * TAU, s: k })); hb.prism(HOUR, 0.03, { tones: 'iron', pattern: 'none' }); hb.pop();
    hb.push(M({ at: [0, 0, 0.48], rz: -((tw % 60) / 60) * TAU, s: k })); hb.prism(MIN, 0.025, { tones: 'iron', pattern: 'none' }); hb.pop();
    hb.push(M({ at: [0, 0, 0.47], rx: Math.PI / 2 })); hb.cylinder(0.075 * k, 0.075 * k, 0.05, { segments: 8, tones: 'brass' }); hb.pop();
    for (const o of [...hb.build({ castShadow: false, name: 'vote-twin-hands' }).children]) twinHands.add(o);
  }

  const api = {
    letter, def, spots, twin, info,
    get scale() { return def.scale ?? 1; },
    // (vote-fix4) a PORTRAIT screen (a phone) is width-bound: a higher pitch (pitchPortrait) costs the figures nothing
    // in size and spreads the ring's stacked left / right seats apart for their names
    get pitch() { const c = engine.camera, portrait = c.lowW > 0 && c.lowW < c.lowH; return (pitchQ ?? (portrait ? def.pitchPortrait : null) ?? def.pitch ?? 30) * DEG; },
    get yaw() { return def.yaw; },
    get onStones() { return !!def.onStones; },
    get active() { return active; },
    get gather() { return g; },
    /** the court is staged: the middle seat has puffed over (the dais parked, the court lit; time.js reads it) */
    get court() { return court; },
    /** seat i stands on its vote spot at time t */
    gathered(i, t = engine.time) { return !def.onStones && seatGather(i, t, g).on; },
    poofOf(i, t = engine.time) { return def.onStones ? null : seatGather(i, t, g).poofK; },
    /** where seat i stands now (world x, z + feet y + facing) */
    spotOf(i, t = engine.time) {
      if (api.gathered(i, t)) return spots[i];
      const s = seatPos(i, N);
      return { x: s.x, z: s.z, y: 0.235, face: Math.atan2(CIRCLE.cx - s.x, CIRCLE.cz - s.z) };
    },
    /** the stage applies (the vote camera) - start the gather when it changes */
    update(t) {
      const w = want();
      if (w !== active) {
        active = w;
        // a switch mid-gather reverses from where each seat is: restart the stagger (a few seats may poof twice)
        g = { t0: t, dir: w ? 1 : 0 };
      }
      // the dais / the twin dial swap with the middle of the gather (seat 7's swap)
      const mid = !!g && seatGather(7, t, g).on;
      if (def.dais) stageDais(mid);
      if (twin) { twin.group.visible = mid; if (mid) twinTime(); }
      // the COURT is up (the cast left the stones): time.js parks the dais (empty stones, no sweep, its brass hand
      // pointing at the court) and re-aims its light pool at the court (warm at night); undone as they go back
      const c = mid && !def.onStones;
      if (c !== court) { court = c; info.court = c; try { demo.time?.restage?.(); } catch (e) { console.warn('[passB] restage failed:', e); } }
      let n = 0;
      for (let i = 0; i < N; i++) if (api.gathered(i, t)) n++;
      info.active = active; info.gathered = n;
    },
    dispose() { stageDais(false); if (court) { court = false; try { demo.time?.restage?.(); } catch { /* gone */ } } },
  };
  return api;
}
