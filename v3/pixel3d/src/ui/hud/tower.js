// Diegetic tower clock (owner: hud group; docs/UI.md row 31, tier W). v2 TownScene.drawTownClock() painted the day clock
// over the tower's dial with Phaser graphics: a wedge = time left (stage colour, 50 % / 28 % opacity when paused), one
// dark hand at the wedge end, two pause bars, a gold hub; idle = two hands at ~11:00. Here the same reading is built as
// tier-W meshes ON the town's front dial (the town owns the tower: we only add the wedge + game hand in front of its
// ivory face, and park its own live hands while the game clock is shown):
//   wedge  a circle sector (r = 0.86 dial radius, from 12 o'clock clockwise) a few mm in front of the face, unlit stage
//          colour, ordered-dither alpha on the low-res grid (binary per texel: 8/16 running, 4/16 paused)
//   hand   iron toon box from the hub to the wedge end; pause bars; brass hub
// API (for the integration): createTowerClock(engine, {center, normal, up, radius}) -> {group, set({stage, frac, paused,
// idle}), dispose()}; the HUD mock uses setupTower(hud, S) (state=tower) which builds the town's clocktower piece.
import * as THREE from 'three';
import { toonMaterial, rampFromTones } from '../../materials/toon.js';
import { tokens } from '../kit.js';
import { stagePal, stageLabel, formatCountdown } from './art.js';

const IRON = ['#6E6A7E', '#46424F', '#2A2834'];   // the town palette's iron / brass rows (src/town/palette.js), read-only copy
const BRASS = ['#F0D080', '#C9A040', '#7A6248'];
const BAYER = /* glsl */`
float hudBayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.y * 4.0 + q.x;
  // 4x4 Bayer: 0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5
  float b = i < 1.0 ? 0.0 : i < 2.0 ? 8.0 : i < 3.0 ? 2.0 : i < 4.0 ? 10.0 : i < 5.0 ? 12.0 : i < 6.0 ? 4.0 : i < 7.0 ? 14.0 : i < 8.0 ? 6.0
          : i < 9.0 ? 3.0 : i < 10.0 ? 11.0 : i < 11.0 ? 1.0 : i < 12.0 ? 9.0 : i < 13.0 ? 15.0 : i < 14.0 ? 7.0 : i < 15.0 ? 13.0 : 5.0;
  return b;
}`;

/**
 * Game-clock overlay on a dial. center = dial centre (world, on the face), normal = face normal (world, toward the
 * viewer), up = the dial's 12 o'clock direction, radius = the ivory face radius (m).
 */
export function createTowerClock(engine, { center, normal, up = new THREE.Vector3(0, 1, 0), radius = 1.12, tod = 'noon', debug = false } = {}) {
  const group = new THREE.Group();
  group.name = 'hud-tower-clock';
  const n = normal.clone().normalize(), u = up.clone().normalize(), r = new THREE.Vector3().crossVectors(u, n).normalize();
  group.matrix.makeBasis(r, u, n).setPosition(center);
  group.matrixAutoUpdate = false;
  const T = tokens(tod);
  const uCol = { value: new THREE.Color(T.gold) }, uK = { value: 8 }, uOff = { value: new THREE.Vector2() };
  const wedgeMat = toonMaterial(engine, {
    color: 0xffffff, outline: 'none', side: THREE.DoubleSide,
    uniforms: { uHudWedgeCol: uCol, uHudWedgeK: uK, uHudOff: uOff },
    fragmentHead: `uniform vec3 uHudWedgeCol; uniform float uHudWedgeK; uniform vec2 uHudOff;\n${BAYER}`,
    // the stipple is anchored to the WORLD: screen texel + the camera's whole-texel position (a whole-texel pan keeps every
    // wedge texel identical: no crawl), refreshed every frame below
    outgoing: 'if (hudBayer4(gl_FragCoord.xy + uHudOff) >= uHudWedgeK) discard; outgoingLight = uHudWedgeCol;',
  });
  const wedge = new THREE.Mesh(new THREE.BufferGeometry(), debug ? new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide }) : wedgeMat);
  wedge.position.z = 0.026;            // face + 8.8 cm: over the ivory face and the hour marks (v2 painted the wedge over the dial), behind the hand
  wedge.castShadow = false; wedge.receiveShadow = false;
  group.add(wedge);
  const ironM = toonMaterial(engine, { ...rampFromTones(...IRON), outline: 'none' });
  const brassM = toonMaterial(engine, { ...rampFromTones(...BRASS), outline: 'none' });
  const R = radius * 0.86;
  const handPivot = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, R, 0.03), ironM);
  hand.position.set(0, R / 2 - 0.05, 0.05);
  handPivot.add(hand);
  const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, R * 0.62, 0.03), ironM);   // idle: the short hand
  hand2.position.set(0, R * 0.31 - 0.05, 0.045);
  const idlePivot = new THREE.Group(); idlePivot.add(hand2);
  const bars = new THREE.Group();
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 0.03), ironM); b.position.set(sx * 0.2, 0, 0.05); bars.add(b); }
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.05), brassM);
  hub.position.z = 0.07;
  for (const o of [handPivot, idlePivot, bars, hub]) group.add(o);
  for (const o of [hand, hand2, hub, ...bars.children]) { o.castShadow = false; o.receiveShadow = false; }
  engine.scene.add(group);
  wedge.onBeforeRender = () => { const c = engine.camera, t = c.texelWorld; uOff.value.set(Math.round(c.target.dot(c.right) / t), Math.round(c.target.dot(c.up) / t)); };
  let key = '';
  const set = ({ stage = 'discussion', frac = 1, paused = false, idle = false } = {}) => {
    // rebuild the sector only when its rim moves by about a texel (1/128 turn)
    const q = idle ? -1 : Math.round(Math.max(0, Math.min(1, frac)) * 128);
    const k = `${stage}|${paused}|${q}`;
    if (k !== key) {
      key = k;
      wedge.geometry.dispose();
      const L = (q / 128) * Math.PI * 2;
      wedge.geometry = q > 0 ? new THREE.CircleGeometry(R, Math.max(3, Math.ceil(q / 2)), Math.PI / 2 - L, L) : new THREE.BufferGeometry();
      // gold mid on the ivory face is too close in value at half stipple: discussion uses the gold shadow tone
      uCol.value.set(stage === 'discussion' ? T.goldSh : stagePal(stage, T).wedge);
      uK.value = paused ? 4 : 8;   // v2 50 % / 28 % fill -> 8/16 / 4/16 texels
    }
    wedge.visible = !idle && q > 0;
    handPivot.visible = !idle && !paused;
    bars.visible = !idle && paused;
    idlePivot.visible = idle;
    handPivot.rotation.z = idle ? 0 : -(q / 128) * Math.PI * 2;
    if (idle) { handPivot.visible = true; handPivot.rotation.z = Math.PI / 6; idlePivot.rotation.z = Math.PI / 72; }   // v2 idle: 11:00-ish
  };
  set();
  return { group, set, dispose() { engine.scene.remove(group); wedge.geometry.dispose(); } };
}

/** Timeline of the tower state: a 30 s stage set by the Storyteller, then due, then the next stage (1x real time). */
export function towerTimeline(t, P) {
  const stage = P('towerStage', null);
  if (stage) {   // fixed state (stills): ?towerStage=&towerFrac=&towerPaused=1
    const frac = Number(P('towerFrac', 0.62)), paused = P('towerPaused', '0') === '1', total = 300, left = frac * total;
    return { stage, frac, paused, left, total };
  }
  const u = ((t % 12) + 12) % 12;
  if (u < 7) return { stage: 'discussion', frac: (7 - u) / 30, left: 7 - u, total: 30, paused: false };
  if (u < 8) return { stage: 'discussion', frac: 0, left: 0, total: 30, paused: false };
  return { stage: 'nominations', frac: (60 - (u - 8)) / 60, left: 60 - (u - 8), total: 60, paused: u >= 10.5 };
}

/** state=tower: build the town's clocktower piece next to the mock square, point the camera at its front dial. */
export async function setupTower(hud, S) {
  const { engine, params, P } = hud;
  const { buildTown } = await import('../../town/town.js');
  // ground: the mock square's terrain ends at x = 28 m, right beside the tower (22.5, 7). In this state the town's own
  // ground pad (y 0, 90 m, town grass) replaces it: the square's terrain is hidden (its flattened cobble paving at y 0
  // stays, so the square still reads in the wide view), no seam, no z-fighting.
  if (hud.terrain?.mesh) hud.terrain.mesh.visible = false;
  const town = await buildTown(engine, params, { pieces: ['clocktower'], pad: true, padCenter: new THREE.Vector3(14, 0, 4), clouds: false, cut: false });
  const piece = town.registry.get('clocktower');
  const spot = piece.anchors.spots.dial.clone();
  piece.group.updateWorldMatrix(true, true);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(piece.group.matrixWorld);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(piece.group.matrixWorld);
  const center = spot.clone().addScaledVector(normal, -0.25 + 0.062);      // spots.dial = face + 0.25 m; ivory front = face + 0.06
  // park the town's own live hands while the game clock is shown (the town keeps the mesh; we only hide it)
  piece.group.traverse((o) => { if (o.name === 'clocktower-hands') o.visible = false; });
  const clock = createTowerClock(engine, { center, normal, up, radius: 1.12, tod: hud.tod, debug: P('towerDebug', '0') === '1' });
  const vh = Number(P('towerVh', 9));
  const target = center.clone().addScaledVector(up, -0.4);
  engine.camera.set({ target, viewHeight: vh });
  // towerPan=<dx>,<dy>: whole-texel camera pan per 60 Hz step (crawl check of the wedge stipple; the mock pan= targets the square)
  if (params.has("towerPan")) {
    const [px, py] = P("towerPan").split(",").map(Number);
    engine.onUpdate((t) => { const k = Math.floor(t * 60 + 0.01), c = engine.camera, tx = c.texelWorld; c.set({ target: target.clone().addScaledVector(c.right, k * (px || 0) * tx).addScaledVector(c.up, k * (py || 0) * tx) }); });
  }
  S.tower = { clock, center };
  S.towerState = (t) => {
    const s = towerTimeline(t, P);
    clock.set({ stage: s.stage, frac: s.frac, paused: s.paused });
    const due = s.left <= 0 && !s.paused;
    return { stage: s.stage, paused: s.paused, due, plus: null, label: stageLabel(s.stage, { due, paused: s.paused }), time: due ? null : formatCountdown(s.left * 1000),
      frac: due ? 0 : s.frac, urgent: !s.paused && !due && s.left <= 30, reduced: S.reduced };
  };
  engine.onUpdate((t) => S.towerState(hud.clock(t)));
  engine.stats.ui.tower = { center: center.toArray().map((v) => +v.toFixed(2)), normal: normal.toArray().map((v) => +v.toFixed(2)), vh };
}
