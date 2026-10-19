// Motion test (motion owner): the mannequin walking / stopping / turning / running / attacking on a meadow, driven by
// src/chars/character.js (gait, planted feet, stepped poses, quantised facing, snapped root, chains, actions).
//
//   index.html?scene=_test-motion[&path=tour|figure8|square|line|turn|idle][&gait=walk|run][&speed=1.3][&run=3.2]
//     [&char=_plan&plan=quadruped|bird|moth|hopper|limbless|blob|upright|biped (LegGait body plans)][&game=1 (speed 4H/s)]
//     [&loco={json} (locomotion overrides)][&legIK=plant (default)|pose|frame]
//     [&follow=0|1][&vh=10][&yaw=45][&tod=noon|golden][&bg=meadow|plain][&grass=1][&legIK=frame|pose][&facing=8]
//     [&char=mannequin][&cape=1 (test-only 3-link cape chain)][&attack=1 (test-only attack clip)][&stride=<m>]
//     [&dir=45 (line direction, deg; 45 = screen right at yaw 45)]
//   tools/shot.sh _test-motion shots/motion/x.png --size 640x360 --q "scale=1&path=figure8" --times 5,5.0167,…
//   GIF at the reference zoom: --size 960x540 --q "scale=3&follow=1&vh=5" (180 rows → 36 px/m like vh 10 at 360).
//
// path=tour (default, ≈ 29 s; segment start times in info().stats.motionPath.segs): idle 1 s → walk a figure-8
//   (accelerate, cruise 1.3 m/s, decelerate, stop) → stand → turn 180° on the spot (stop-motion 45° steps + recovery
//   steps) → turn 90° → run a rounded square at 3.2 m/s → stop → attack (one-shot clip: windup hold, contact, follow-
//   through, recovery; events 'windup'/'hit'; smooth lunge root offset). Other paths loop one shape at constant speed.
// Stats (engine.stats.motion, printed in shot.sh's info line): per rendered frame {t, ik stretch [L,R], pose (count),
//   id (clip:frame), fac (facing index rel. camera), mode, root [x,y] (low-res px of the snapped root), fL/fR [x,y]
//   (ankle bone px), pL/pR (displayed foot planted)}, slide = max displacement (texels, fractional) of a planted
//   ankle within one stance, slidePx = the same in whole pixels; motionEvents = last clip/footstep events.
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { Character } from '../src/chars/character.js';

const D2R = Math.PI / 180;
// rig body-plan template → LegGait plan
const PLAN_OF = { biped: 'biped', upright: 'biped', quadruped: 'quadruped', longneck: 'quadruped', bird: 'bird', moth: 'fly', hopper: 'hop', limbless: 'glide', blob: 'glide' };

// ---- closed / open polyline paths, arclength-parametrised (deterministic tables) ----
function tablePath(fn, n = 4000, closed = true) {
  const pts = [], cum = [0];
  for (let i = 0; i <= n; i++) pts.push(fn(i / n));
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n];
  return {
    length: L,
    at(s) {
      if (closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
      let lo = 0, hi = n;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const u = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
      return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u];
    },
  };
}
const figure8 = (R) => tablePath((u) => { const a = u * Math.PI * 2; return [R * 1.25 * Math.sin(a), R * 0.62 * Math.sin(2 * a)]; });
function roundedSquare(side, r, x0, z0) {
  // starts at (x0, z0) heading +x, counter-clockwise seen from above (turning towards -z)
  const h = side / 2, segs = [];
  const P = [[x0, z0]];
  const corner = (cx, cz, a0) => { for (let i = 1; i <= 12; i++) { const a = a0 + (i / 12) * (Math.PI / 2); P.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  // square centred at (x0, z0 - h): edges at z = z0 (front), x = x0 + h, z = z0 - side, x = x0 - h
  P.push([x0 + h - r, z0]); corner(x0 + h - r, z0 - r, Math.PI / 2);
  P.push([x0 + h, z0 - side + r]); corner(x0 + h - r, z0 - side + r, 0);
  P.push([x0 - h + r, z0 - side]); corner(x0 - h + r, z0 - side + r, -Math.PI / 2);
  P.push([x0 - h, z0 - r]); corner(x0 - h + r, z0 - r, Math.PI);
  P.push([x0, z0]);
  void segs;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  return { length: L, at(s) {
    s = ((s % L) + L) % L;
    let i = 1; while (i < P.length - 1 && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u];
  } };
}
const line = (len, dir) => tablePath((u) => [Math.cos(dir) * len * (u - 0.5), -Math.sin(dir) * len * (u - 0.5)], 2, false);

// ---- test-only variants: a 3-link cape (exercises spec.chains) and an attack clip (one-shot, events, lunge) ----
async function capeVariant(spec, mod) {
  const K = await import('../src/chars/kit.js');
  const skel = mod.mannequinSkeleton({ chains: { cape: { n: 3, parent: 'chest', at: [0, 0.2, -0.12], dir: 'down', len: 0.48 } } });
  const parts = mod.mannequinParts(skel);
  const seg = 0.48 / 3;
  for (let i = 0; i < 3; i++) {
    const w = 0.34 + i * 0.05;
    parts.push({ bone: `cape${i}`, shape: K.box(w, seg + 0.03, 0.05), at: [0, -seg / 2, -0.005 * i], color: 'cape', name: `cape${i}` });
  }
  parts.push({ bone: 'chest', shape: K.box(0.36, 0.07, 0.25), at: [0, 0.2, -0.01], color: 'cape', name: 'capeCollar' });
  return { ...spec, skeleton: skel, parts, palette: { ...spec.palette, cape: ['#9DB4D6', '#5E7DAE', '#3D4874'] },
    chains: [{ name: 'cape', f: 3.2, zeta: 0.45, r: 0.5, gravity: 1, drag: 1, limit: 75, noForward: true }] };
}
async function attackClip() {
  const { PRESET_POSES: PP } = await import('../src/chars/rig.js');
  const follow = { ...PP.strike, chest: [10, -45, 0], spine: [16, -35, 0], upperArmR: [60, 0, 25], forearmR: [10, 0, 0] };
  return { fps: 30, loop: false, interp: 'step',
    keys: [{ f: 0, pose: PP.windup }, { f: 8, pose: PP.strike, smear: 'weapon' }, { f: 10, pose: follow }, { f: 20, pose: { pos: [0, -0.03, 0], thighL: [12, 0, 4], shinL: [-12, 0, 0], thighR: [-6, 0, 4], shinR: [-8, 0, 0] } }, { f: 26, pose: {} }],
    events: { 8: 'hit', 0: 'windup' }, root: { 8: [0, 0, 0.1], 20: [0, 0, 0.1] } };
}

// ---- speed profile: list of {dur, v0, v1, face?}; s(t) integrates analytically ----
function profile(segs) {
  let t0 = 0, s0 = 0;
  const S = segs.map((g) => { const o = { ...g, t0, s0 }; t0 += g.dur; s0 += (g.v0 + g.v1) / 2 * g.dur; return o; });
  const total = t0;
  return {
    total, segs: S,
    at(t) {
      let g = S[S.length - 1];
      for (const x of S) if (t < x.t0 + x.dur) { g = x; break; }
      const tau = Math.max(0, Math.min(g.dur, t - g.t0));
      const s = g.s0 + g.v0 * tau + (g.v1 - g.v0) * tau * tau / (2 * g.dur);
      return { s: t >= total ? S[S.length - 1].s0 + (g.v0 + g.v1) / 2 * g.dur : s, seg: g, tau };
    },
  };
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const vh = Number(P('vh', 10));
  const yaw = Number(P('yaw', 45)) * D2R;
  const pathKind = P('path', 'tour');
  const follow = P('follow', '0') === '1';
  const target = new THREE.Vector3(0, 0.7, -0.6);
  engine.camera.set({ target: target.clone(), yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTimeOfDay(engine, P('tod', 'noon'), { shadowExtent: 14 });

  // ---- character. char=_plan&plan=<rig body plan> builds characters/mannequin.js makePlan(plan) (rig owner's blockout
  // of the template) and drives it with the matching LegGait plan (motion r5); &loco={json} merges into locomotion.
  const charName = P('char', 'mannequin');
  const mod = await import(`../characters/${charName === '_plan' ? 'mannequin' : charName}.js`);
  let spec = mod.default;
  if (charName === '_plan') {
    const rp = P('plan', 'quadruped');
    spec = mod.makePlan(rp, { face: P('face', '1') === '1' });
    spec = { ...spec, locomotion: { plan: PLAN_OF[rp] ?? rp, ...JSON.parse(P('loco', '{}')) } };
  } else {
    if (P('cape', '1') === '1' && mod.mannequinSkeleton) spec = await capeVariant(spec, mod);
    if (P('attack', '1') === '1') spec = { ...spec, clips: { ...spec.clips, attack: await attackClip() } };
    if (P('plan')) spec = { ...spec, locomotion: { ...spec.locomotion, plan: P('plan'), ...JSON.parse(P('loco', '{}')) } };
  }
  if (P('stride')) spec = { ...spec, locomotion: { ...spec.locomotion, stride: Number(P('stride')) } };
  const H = spec.height ?? spec.skeleton?.meta?.H ?? 1.4;

  // ---- paths. game=1: walk at the Clocktower game speed (4 body heights / s), run at 6.5 H/s
  const game = P('game', '0') === '1';
  const vWalk = Number(P('speed', game ? 4 * H : 1.3)), vRun = Number(P('run', game ? 6.5 * H : 3.2));
  const camFace = yaw;                         // facing the camera
  let pathAt, prof, faceAt = () => undefined, actionAt = () => null;
  if (pathKind === 'tour') {
    const f8 = figure8(2.3), sq = roundedSquare(3.6, 0.45, 0, 0);
    const ramp = 0.6, ramp2 = 0.8;
    const cruise = (f8.length - vWalk * ramp / 2 - vWalk * ramp / 2) / vWalk;
    const cruise2 = (sq.length - vRun * ramp2 / 2 - vRun * 0.7 / 2) / vRun;
    prof = profile([
      { dur: 1.0, v0: 0, v1: 0, name: 'idle' },
      { dur: ramp, v0: 0, v1: vWalk, name: 'walk' }, { dur: cruise, v0: vWalk, v1: vWalk, name: 'walk' }, { dur: ramp, v0: vWalk, v1: 0, name: 'walk' },
      { dur: 0.8, v0: 0, v1: 0, name: 'stand' }, { dur: 1.6, v0: 0, v1: 0, name: 'turn', face: camFace + 180 * D2R },
      { dur: 1.0, v0: 0, v1: 0, name: 'stand2', face: camFace + 90 * D2R },
      { dur: ramp2, v0: 0, v1: vRun, name: 'run' }, { dur: cruise2, v0: vRun, v1: vRun, name: 'run' }, { dur: 0.7, v0: vRun, v1: 0, name: 'run' },
      { dur: 1.2, v0: 0, v1: 0, name: 'end' }, { dur: 3, v0: 0, v1: 0, name: 'attack', action: 'attack' },
    ]);
    const L8 = f8.length;
    pathAt = (s) => (s <= L8 ? f8.at(s) : sq.at(s - L8));
    faceAt = (t) => prof.at(t).seg.face;
    const atk = prof.segs.find((g) => g.name === 'attack');
    actionAt = (t) => (t >= atk.t0 && t < atk.t0 + 0.05 ? 'attack' : null);
  } else {
    const shape = pathKind === 'square' ? roundedSquare(3.6, 0.45, 0, 1.2) : pathKind === 'line' ? line(Number(P('len', 9)), Number(P('dir', 45)) * D2R)
      : pathKind === 'idle' || pathKind === 'turn' ? line(0.001, 0) : figure8(2.3);
    const v = pathKind === 'idle' || pathKind === 'turn' ? 0 : P('gait', 'walk') === 'run' ? vRun : vWalk;
    prof = profile([{ dur: 0.5, v0: 0, v1: v }, { dur: 1e6, v0: v, v1: v }]);
    pathAt = (s) => shape.at(s);
    if (pathKind === 'line') { const len = Number(P('len', 9)); prof = profile([{ dur: 0.5, v0: 0, v1: v }, { dur: (len - v * 0.5) / v - 0.5, v0: v, v1: v }, { dur: 1.0, v0: v, v1: 0 }, { dur: 1e6, v0: 0, v1: 0 }]); }
    if (pathKind === 'turn') faceAt = (t) => camFace + Math.floor(t / 1.5) * 135 * D2R;
    if (pathKind === 'line') pathAt = (s) => shape.at(s);
  }
  const posAt = (t) => { const s = prof.at(Math.max(0, t)).s; const [x, z] = pathAt(s); return new THREE.Vector3(x, 0, z); };

  // ---- ground
  let ground = null;
  if (P('bg', 'meadow') === 'meadow') {
    const [{ createTerrain }, { createGrass }] = await Promise.all([import('../src/world/terrain.js'), import('../src/world/grass.js')]);
    setClouds(engine, { scale: 0 });
    const terrain = createTerrain(engine, { size: 40, seed: 5, height: 0.6, flatten: [{ x: 0, z: -0.5, r: 7, h: 0, falloff: 4 }],
      zones: [{ type: 'dirt', x: -3.6, z: 2.2, r: 1.2 }] });
    ground = terrain;
    if (P('grass', '1') !== '0') {
      // keep a trodden strip clear along the paths so the boots stay readable
      createGrass(engine, terrain, { area: { x0: -11, z0: -12, x1: 11, z1: 10 }, flowers: { fraction: 0.025 },
        mask: (x, z) => !(Number(P('clear', 0.0)) > 0 && Math.hypot(x, z) < Number(P('clear', 0))) });
    }
    const rock = (x, z, r, seed) => {
      const g0 = new THREE.IcosahedronGeometry(r, 0), g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals();
      const m = toonMesh(engine, g, rampFromTones('#9A93A8', '#6E6984', '#4A4766'));
      m.position.set(x, ground.heightAt(x, z) + r * 0.25, z); m.rotation.y = seed; m.scale.y = 0.7; engine.scene.add(m);
    };
    rock(4.6, -3.2, 0.55, 1); rock(-4.2, -3.6, 0.4, 2); rock(3.8, 2.8, 0.3, 3);
  } else {
    const { color, ramp } = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
    engine.scene.add(toonMesh(engine, new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), { color, ramp, normalNoise: 0.12 }, { receiveShadow: true, castShadow: false }));
  }

  const ch = new Character(engine, spec, { ground, ...(P('legIK') ? { legIK: P('legIK') } : {}), facingSteps: Number(P('facing', 8)) });
  ch.drive((t) => ({ pos: posAt(t), face: faceAt(t), action: actionAt(t) }));
  ch.on('event', (e) => { (engine.stats.motionEvents ||= []).push(`${e.t.toFixed(3)}:${e.clip}:${e.name}${e.side || ''}`); if (engine.stats.motionEvents.length > 40) engine.stats.motionEvents.shift(); });
  engine.scene.add(ch.root);
  if (follow) engine.onUpdate((t) => { const p = posAt(t); engine.camera.set({ target: new THREE.Vector3(p.x, 0.7, p.z) }); });

  // ---- stats: root + ankle texel positions per rendered frame, stance slide (every gait leg: 2 for bipeds, 4 paws)
  //   slide     max world drift (texels) of a DISPLAYED-planted ankle within one stance, every rendered frame
  //   slidePose the same measured only on pose (drawing) frames — the sprite-sheet / game read
  //   plantDrawings  histogram: in how many consecutive drawings each stance was shown planted (want ≥ 2)
  const cam = engine.camera;
  const proj = (p) => { cam.snapWorld(p); const t = cam.texelWorld; return [p.dot(cam.right) / t, -p.dot(cam.up) / t]; };
  const projW = (p) => { const t = cam.texelWorld; return [p.dot(cam.right) / t, -p.dot(cam.up) / t]; };
  const log = [];
  const legs = (ch.gait?.legs || []).map((l) => ({ key: l.key, foot: l.bones[2] }));
  const stance = {}, stanceP = {}, hist = {};
  let ikMax = 0, slide = 0, slidePx = 0, slidePose = 0, poseId = 0, lastPose = '', poseFrame = false;
  ch.on('pose', (e) => { poseId++; lastPose = `${e.clip}:${e.frame}`; poseFrame = true; });
  engine.stats.motion = { log, slide: 0 };
  engine.onUpdate((t) => {
    const B = ch.rig.bones, st = ch.state;
    const r = proj(ch.root.position.clone());
    const row = { t: +t.toFixed(4), ik: ch.ikInfo ? { ...ch.ikInfo } : null, pose: poseId, id: lastPose, fac: st.facing, mode: st.mode, root: r.map((v) => +v.toFixed(2)) };
    const feet = ch.feet() || {};
    for (const { key, foot } of legs) {
      const fb = B[foot]; fb.updateWorldMatrix(true, false);
      const w = new THREE.Vector3().setFromMatrixPosition(fb.matrixWorld);
      const px = projW(w);
      row['f' + key] = px.map((v) => +v.toFixed(2));
      const g = feet[key];
      const planted = !!g?.planted;
      const k = planted ? g.pos.toArray().map((v) => v.toFixed(4)).join(',') : null;
      if (planted) {
        if (!stance[key] || stance[key].key !== k) stance[key] = { key: k, px, rpx: px.map(Math.round) };
        else {
          slide = Math.max(slide, Math.hypot(px[0] - stance[key].px[0], px[1] - stance[key].px[1]));
          slidePx = Math.max(slidePx, Math.abs(Math.round(px[0]) - stance[key].rpx[0]), Math.abs(Math.round(px[1]) - stance[key].rpx[1]));
        }
        if (poseFrame && st.mode === 'move' && ch.ikInfo?.[key] !== undefined) ikMax = Math.max(ikMax, ch.ikInfo[key]);
        if (poseFrame && st.mode === 'move') {
          if (!stanceP[key] || stanceP[key].key !== k) { if (stanceP[key]) hist[stanceP[key].n] = (hist[stanceP[key].n] || 0) + 1; stanceP[key] = { key: k, px, n: 1 }; }
          else {
            stanceP[key].n++;
            const dd = Math.hypot(px[0] - stanceP[key].px[0], px[1] - stanceP[key].px[1]);
            if (dd > 0.05) (engine.stats.motion.slideLog ||= []).push(`${t.toFixed(3)} ${key} ${dd.toFixed(2)} ik${ch.ikInfo?.[key]} disp ${g.pos.toArray().map((v) => v.toFixed(3))} st ${ch.gait.feet[key].state}`);
            slidePose = Math.max(slidePose, dd);
          }
        }
      } else {
        stance[key] = null;
        if (poseFrame && stanceP[key]) { hist[stanceP[key].n] = (hist[stanceP[key].n] || 0) + 1; stanceP[key] = null; }
      }
      row['p' + key] = planted ? 1 : 0;
    }
    poseFrame = false;
    log.push(row); if (log.length > 400) log.shift();
    engine.stats.motion.slide = +slide.toFixed(3);
    engine.stats.motion.slidePx = slidePx;
    engine.stats.motion.slidePose = +slidePose.toFixed(3);
    engine.stats.motion.ikMaxPlanted = +ikMax.toFixed(3);
    engine.stats.motion.plantDrawings = { ...hist };
    engine.stats.motion.poses = poseId;
    engine.stats.motion.state = { ...st, phase: +(st.phase ?? 0).toFixed(3), speed: +(st.speed ?? 0).toFixed(3) };
    engine.stats.motion.gait = ch.gait?.debug();
    engine.stats.motion.H = H;
  });
  engine.stats.motionPath = { kind: pathKind, total: +prof.total.toFixed(2), segs: prof.segs.filter((g) => g.dur < 1e5).map((g) => `${g.name || ''}@${g.t0.toFixed(2)}`).join(' ') };
  { engine.camera.snapWorld(new THREE.Vector3()); const t = engine.camera.texelWorld, T = engine.camera.target; engine.stats.motionTarget = [+(T.dot(engine.camera.right) / t).toFixed(4), +(-T.dot(engine.camera.up) / t).toFixed(4)]; }
}
