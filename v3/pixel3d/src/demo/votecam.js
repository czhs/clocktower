// (B) The voting-circle camera (pass B; docs/DEMO.md §4.9). Replaces the lead rig's fixed `vote` preset (town/api.js
// CAMERAS.vote: yaw 0, viewHeight 19, the circle centred, the tower's dial cut by the top edge) with a frame COMPUTED
// from the real geometry: every seat with its occupant (feet .. a raised hand) + the tower's clock face, projected into
// the camera's snap space and cropped as TIGHTLY as the visible part of the canvas allows: the control panel's right
// band is left out, and the HUD's corners (the clock / phase chips + the timer chip + the vote clock top left, the toolbar top right,
// the action bar bottom centre, the dock button bottom right) are keep-out boxes no seat or dial may sit under.
//
// THE GEOMETRY (pitch 30 deg; yaw 0 = looking north: screen u = x, v = 0.866 y - 0.5 z). The tower stands NORTH of
// the circle (front dial centre (22.5, 5.45, 8.4) on its south face, circle centre (22.5, 19.75), r 6.25; four dials,
// the side / back ones 0.86 x). At yaw 0 the dial sits ~10.4 m ABOVE the circle centre on screen and the ring is a flat
// ellipse (r x 0.5 tall): ~15.3 m of frame height for ~13.7 m of width, so a 16:9 frame wastes half its width.
//   yaw  0: the dial top-centre, the ring below           content 13.7 x 15.3 m  -> viewHeight ~16.8 (1280 x 720)
//   yaw 45 / -45: the tower beside the ring (two dials)   content 16.1 x 13.8 m  -> viewHeight ~15.1 (+11 % size)
//   yaw 90 / -90: the tower level with the ring           content 21.1 x  9.1 m  -> viewHeight ~12.0 (+40 %), BUT
//       the side dial is half hidden behind the cottage roofs east / west of the tower (the cut-away keeps the ring
//       clear, not the dial) and with the panel open the width binds (~16.6): not offered by default.
// The camera picks, among CANDIDATES (?voteYaw= forces one; Q / E in the vote mode step through every 45 deg stop),
// the yaw with the tightest frame for the current visible area (a later candidate must win by > PREFER to replace an
// earlier one), so the seated cast is as large as the pixel camera allows: viewHeight is whatever fits (not a ladder
// stop: the ladder avoids the crawl of CONTINUOUS zoom changes; this frame only changes in stepped key poses).
//
// TRANSITIONS (deterministic: functions of engine.time since the switch): into / out of the vote mode, and on a
// reframe (panel opened / folded, resize), the camera moves through TRANS_STEPS fully snapped key poses (target,
// viewHeight and yaw eased together, inOutSine spacing, the first pose immediately) over TRANS_S: the PixelCamera's own
// stop-motion rule for turns (rotateTo steps) applied to the whole pose. Out of the vote mode it steps back to the
// follow camera's pose (the player, the zoom, the store's yaw). The ceremony (P, time.js) switches follow -> vote
// itself; this module returns the camera to follow 3 s after a ceremony it started reaches night.
//
// API: installVoteCam(demo) -> votecam { info, frame, frameFor({yaw, cover}), check(), refresh() }
//   info = { active, yaw, viewHeight, target [x, z], fit {w, h} (content m), cover, candidates [{yaw, vh}],
//            px {seat13 (screen px of a 1.3 m figure), dial (screen px of the dial's diameter), perM, scale},
//            trans 0..1 | null, inFrame {seats (of 15 inside the visible area, none under a keep-out), dial} }
import * as THREE from 'three';
import { seatPos } from '../town/layout.js';

const DEG = Math.PI / 180;
const PITCH = Math.PI / 6;
export const CANDIDATES = [0, 45, -45];   // degrees, in order of preference
const PREFER = 0.04;                      // a later candidate must be > 4 % tighter
const TRANS_S = 0.75, TRANS_STEPS = 4;
const MARGIN = 0.18;                      // m of world around the content (outline + a breath)
const EDGE = 2;                           // low-res px from the canvas edges
const SEAT_TOP = 0.235;                   // the seat stones' top (dais.js seatTop 0.2 + the boss)
const HEAD_DEFAULT = 1.75;                // tallest cast standing height used when a seat's occupant is unknown (m)
const HAND = 0.3;                         // a raised vote hand above the head
const BODY_R = 0.4;                       // half width of a figure
const LABEL_M = 0.3;                      // (staged) room above a raised hand for the name label + its vote mark (m)

// the HUD's keep-out boxes in low-res px (gameui.js layout at 640 x 360; generous): [x0, y0, x1, y1] relative to the
// visible area's corners
const KEEP = {
  tl: { w: 78, h: 140, chips: 36 },   // clock + phase chips (y 0..24; a second row on a phone) and the vote clock + tally under them (to ~136)
  tr: { w: 72, h: 22 },       // the toolbar (4 x 17 px)
  bar: { w: 130, h: 26 },     // the action bar, centred on the visible area
  br: { w: 30, h: 30 },       // the dock button (your portrait)
  tc: { x: 156, w: 150, h: 22 },   // the tower timer's chip (timer-ui.js): the top row, right of the game UI's chips
  cap: { y: 24, w: 232, h: 20 },   // the phase caption ribbon (gameui: centred on the visible area, y0 + 26; up for the whole vote)
  tally: { w: 120, h: 30 },        // (B) the vote tally plaque (votemarks.js): bottom, centred, above the action bar (staged)
  trPlaque: { w: 132, h: 32 },     // (B) on the stones (A): the plaque under the toolbar, top right
};

// the tower's dials: the piece's own api.dials (the pass-B town hook, docs/TOWN.md) or the clocktower.js constants
// (footprint centre (22.5, 0, 7), body centre z -0.2, clock stage half sizes 1.75 x 1.6, dial y 5.45, surround 1.42)
export function towerDials(demo) {
  const api = demo.town?.registry?.get('clocktower')?.api;
  if (Array.isArray(api?.dials) && api.dials.length) return api.dials.map((d) => ({ c: d.center.clone(), n: d.normal.clone(), r: d.surround, k: d.k }));
  const cx = 22.5, cz = 7 - 0.2, y = 5.45;
  return [
    { c: new THREE.Vector3(cx, y, cz + 1.6), n: new THREE.Vector3(0, 0, 1), r: 1.42, k: 1 },
    { c: new THREE.Vector3(cx + 1.75, y, cz), n: new THREE.Vector3(1, 0, 0), r: 1.42 * 0.86, k: 0.86 },
    { c: new THREE.Vector3(cx, y, cz - 1.6), n: new THREE.Vector3(0, 0, -1), r: 1.42 * 0.86, k: 0.86 },
    { c: new THREE.Vector3(cx - 1.75, y, cz), n: new THREE.Vector3(-1, 0, 0), r: 1.42 * 0.86, k: 0.86 },
  ];
}

const basis = (yaw, pitch = PITCH) => {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  return { R: new THREE.Vector3(cy, 0, -sy), U: new THREE.Vector3(-sp * sy, cp, -sp * cy), F: new THREE.Vector3(-cp * sy, -sp, -cp * cy) };
};

/** The dial the camera at `yaw` sees best (ties -> the one facing the circle, south). */
export function facingDial(dials, yaw, pitch = PITCH) {
  const { F } = basis(yaw, pitch);
  let best = null, bd = -Infinity;
  for (const d of dials) { const f = -d.n.dot(F) + d.n.z * 1e-3; if (f > bd) { bd = f; best = d; } }
  return best;
}

/** where seat i stands in the frame being fitted: the stage's vote spot (staged) or its stone */
const spotFor = (stage, i) => {
  if (stage && !stage.onStones) return stage.spots[i];
  const s = seatPos(i, 15);
  return { x: s.x, z: s.z, y: SEAT_TOP };
};
/** content sample points (snap-space metres [u, v]) of the cast + the dial at `yaw` (the stage's spots, scale, pitch
 *  and dial when a stage is given) */
function contentPoints(yaw, heights, dials, stage = null) {
  const pitch = stage?.pitch ?? PITCH, sc = stage?.scale ?? 1;
  const { R, U } = basis(yaw, pitch);
  const pts = [];
  const p = new THREE.Vector3();
  const add = (x, y, z) => { p.set(x, y, z); pts.push([p.dot(R), p.dot(U)]); };
  for (let i = 0; i < 15; i++) {
    // (staged: + the name label and the vote mark over it, LABEL_M, so neither tucks under the HUD's corner pieces)
    const s = spotFor(stage, i), y0 = s.y ?? SEAT_TOP, top = y0 + ((heights[i] ?? HEAD_DEFAULT) + HAND) * sc + (stage && !stage.onStones ? LABEL_M : 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = s.x + Math.cos(a) * BODY_R * sc, z = s.z + Math.sin(a) * BODY_R * sc;
      for (const f of [0, 0.35, 0.7, 1]) add(x, y0 + (top - y0) * f, z);
    }
    // staged: the seat's vote candle (votemarks.js) stands 1 m x the scale in front of the feet, toward the camera
    if (stage && !stage.onStones) add(s.x + Math.sin(yaw) * (1.0 * sc + 0.25), y0, s.z + Math.cos(yaw) * (1.0 * sc + 0.25));
  }
  const dial = stage?.twin ?? facingDial(dials, yaw, pitch);
  if (dial) {
    const n = dial.n, t = new THREE.Vector3(-n.z, 0, n.x).normalize();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      add(dial.c.x + t.x * Math.cos(a) * dial.r, dial.c.y + Math.sin(a) * dial.r, dial.c.z + t.z * Math.cos(a) * dial.r);
    }
  }
  return { pts, dial };
}

/** the visible rect + keep-out boxes (low-res px) for a frame of lowW x lowH with `right` px under the panel */
export function screenAreas(lowW, lowH, { right = 0, hud = true, staged = false, ui = 1 } = {}) {
  const vis = { x0: EDGE, y0: EDGE, x1: lowW - right - EDGE, y1: lowH - EDGE };
  const keep = [];
  if (hud) {
    const cx = (vis.x0 + vis.x1) / 2;
    // (D=2) the HUD is laid out in logical px: `ui` scene texels per logical px (4/3 at 1080p 'round'); the boxes grow
    const K = ui === 1 ? KEEP : Object.fromEntries(Object.entries(KEEP).map(([k, b]) => [k, Object.fromEntries(Object.entries(b).map(([q, v]) => [q, v * ui]))]));
    // (staged: gameui draws no vote clock card in the court - the marks + the plaque show the vote - so the top-left
    // keep-out is the chips' row only: the crescent's west end may rise into it)
    keep.push({ x0: 0, y0: 0, x1: K.tl.w, y1: staged ? K.tl.chips : K.tl.h });
    keep.push({ x0: vis.x1 - K.tr.w, y0: 0, x1: vis.x1 + EDGE, y1: K.tr.h });
    keep.push({ x0: cx - K.bar.w / 2, y0: lowH - K.bar.h, x1: cx + K.bar.w / 2, y1: lowH });
    keep.push({ x0: vis.x1 - K.br.w, y0: lowH - K.br.h, x1: vis.x1 + EDGE, y1: lowH });
    keep.push({ x0: K.tc.x - 2, y0: 0, x1: K.tc.x + K.tc.w, y1: K.tc.h });
    // the phase caption ribbon (top centre, up for the whole vote) and the vote marks' tally plaque (bottom centre)
    // stand in every vote frame now (the stones too: stage A, the default)
    {
      if (staged) keep.push({ x0: cx - K.cap.w / 2, y0: K.cap.y, x1: cx + K.cap.w / 2, y1: K.cap.y + K.cap.h });
      // staged (the court: no vote clock card): bottom centre above the bar; on the stones (A: the card stands top left)
      // the plaque hangs UNDER the card (votemarks.js), inside the top-left column: the cheapest place for the fit
      if (staged || lowW / ui < 400) keep.push({ x0: cx - K.tally.w / 2, y0: lowH - K.bar.h - K.tally.h, x1: cx + K.tally.w / 2, y1: lowH - K.bar.h });
      else keep.push({ x0: vis.x1 - K.trPlaque.w, y0: K.tr.h, x1: vis.x1 + EDGE, y1: K.tr.h + K.trPlaque.h });
    }
  }
  return { vis, keep };
}

/**
 * The tightest frame at `yaw`: the smallest texel size (+ a placement) for which every content point lies inside the
 * visible rect and outside every keep-out box. -> { target (ground Vector3), viewHeight, yaw, tw, box, dial, shift }
 */
export function voteFrame({ yaw, lowW, lowH, right = 0, hud = true, heights = [], dials, stage = null, ui = 1 }) {
  const { pts, dial } = contentPoints(yaw, heights, dials, stage);
  const pitch = stage?.pitch ?? PITCH, staged = !!stage && !stage.onStones;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of pts) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  u0 -= MARGIN; u1 += MARGIN; v0 -= MARGIN; v1 += MARGIN;
  const { vis, keep } = screenAreas(lowW, lowH, { right, hud, staged, ui });
  const visW = vis.x1 - vis.x0, visH = vis.y1 - vis.y0;
  const vcx = (vis.x0 + vis.x1) / 2, vcy = (vis.y0 + vis.y1) / 2;
  const tw0 = Math.max((u1 - u0) / visW, (v1 - v0) / visH);
  const m = MARGIN;
  const ok = (tw, dx, dy) => {
    // box centre -> (vcx + dx, vcy + dy); px x = vcx + dx + (u - uc) / tw, y = vcy + dy - (v - vc) / tw
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    for (const [u, v] of pts) {
      const x = vcx + dx + (u - uc) / tw, y = vcy + dy - (v - vc) / tw, r = m / tw;
      if (x - r < vis.x0 || x + r > vis.x1 || y - r < vis.y0 || y + r > vis.y1) return false;
      for (const k of keep) if (x + r > k.x0 && x - r < k.x1 && y + r > k.y0 && y - r < k.y1) return false;
    }
    return true;
  };
  let best = null;
  for (let tw = tw0; tw < tw0 * 1.8 && !best; tw *= 1.01) {
    const sx = Math.max(0, (visW - (u1 - u0) / tw) / 2), sy = Math.max(0, (visH - (v1 - v0) / tw) / 2);
    const xs = [0], ys = [0];
    for (let d = 3; d <= sx; d += 3) xs.push(d, -d);
    for (let d = 3; d <= sy; d += 3) ys.push(d, -d);
    search: for (const dy of ys) for (const dx of xs) if (ok(tw, dx, dy)) { best = { tw, dx, dy }; break search; }
  }
  best ??= { tw: tw0 * 1.8, dx: 0, dy: 0 };
  const { tw, dx, dy } = best;
  // the screen centre (lowW / 2, lowH / 2) in snap space: the box centre shifted by the placement
  const uc = (u0 + u1) / 2 - (vcx + dx - lowW / 2) * tw, vc = (v0 + v1) / 2 + (vcy + dy - lowH / 2) * tw;
  // ground target T with T.R = uc, T.U = vc (T.y = 0): sy tx + cy tz = -vc / sin(pitch)
  const sy = Math.sin(yaw), cy = Math.cos(yaw), g = -vc / Math.sin(pitch);
  const target = new THREE.Vector3(cy * uc + sy * g, 0, -sy * uc + cy * g);
  return { target, viewHeight: tw * lowH, yaw, pitch, tw, box: { u0, u1, v0, v1 }, dial, shift: [dx, dy], staged };
}

const easeInOutSine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function installVoteCam(demo) {
  const { engine, store } = demo;
  const rig = demo.camera, cam = engine.camera, canvas = engine.renderer.domElement;
  if (!rig?.update || rig.__voteCam) return null;
  const params = demo.params ?? new URLSearchParams();
  const forced = params.get('voteYaw') !== null && Number.isFinite(Number(params.get('voteYaw'))) ? Math.round(Number(params.get('voteYaw')) / 45) * 45 : null;
  let manual = forced;                      // a yaw chosen with Q / E in the vote mode (or ?voteYaw=), else automatic
  const dials = towerDials(demo);
  const info = { active: false, yaw: null, viewHeight: 0, target: [0, 0], fit: null, cover: null, candidates: [], px: null, trans: null, inFrame: null, manual };
  let frame = null, frameKey = '', trans = null, ceremonyCam = false, nightAt = null;

  // the control panel's right band (CSS px), as main.js installViewInset measures it
  let panelEl = null;
  const panelPx = () => {
    panelEl ??= document.querySelector('#demo-ui > .dui-panel');
    // (the user: "in game there won't be the side panel, so you can use the whole screen": ui.js slides the panel out
    // while the vote camera is up - .dui-away - so the fit uses the whole canvas from the first frame)
    if (!panelEl || !store.state.ui || panelEl.classList.contains('collapsed') || panelEl.classList.contains('dui-away') || document.body.classList.contains('ct-intro')) return 0;
    const p = panelEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    if (p.width < 1 || p.height < c.height / 3 || p.left < c.left + c.width / 2 || p.left >= c.right) return 0;
    return Math.max(0, c.right - p.left);
  };
  const heights = () => { const sc = demo.passB?.seats; return Array.from({ length: 15 }, (_, i) => sc?.heightOf?.(i) ?? null); };
  const hud = () => !!demo.gameui;
  /** scene texels per logical HUD px (gameui at D=2: 4/3 at 1080p 'round'), so the keep-outs cover the HD HUD */
  const uiScale = () => { const u = demo.gameui?.texPerLogical; return Number.isFinite(u) && u > 0 ? +u.toFixed(4) : 1; };
  // (B) the vote staging (votestage.js): the frame holds the cast on their VOTE spots (scaled), at the stage's pitch,
  // with the stage's dial (the tower's, or the ceremonial twin); its yaw unless Q / E (or ?voteYaw=) chose one
  const stage = () => demo.passB?.stage ?? null;
  info.stage = stage()?.letter ?? null;
  function compute() {
    const S = engine.pixelScale || 1, right = Math.ceil(panelPx() / S), H = heights(), st = stage();
    const opts = { lowW: cam.lowW, lowH: cam.lowH, right, hud: hud(), heights: H, dials, stage: st, ui: uiScale() };
    let f;
    info.candidates = [];
    const fixed = manual ?? (st && st.yaw !== null && st.yaw !== undefined ? st.yaw : null);
    if (fixed !== null) f = voteFrame({ ...opts, yaw: fixed * DEG });
    else {
      for (const y of CANDIDATES) {
        const c = voteFrame({ ...opts, yaw: y * DEG });
        info.candidates.push({ yaw: y, vh: +c.viewHeight.toFixed(2) });
        if (!f || c.tw < f.tw * (1 - PREFER)) f = c;
      }
    }
    f.cover = { right, hud: opts.hud, staged: f.staged, ui: opts.ui };
    return f;
  }
  // recomputed only when its inputs change (panel band, canvas size, the occupants, a manual yaw): a fixed pose otherwise
  const keyOf = () => `${Math.ceil(panelPx())}|${cam.lowW}x${cam.lowH}|${demo.passB?.seats?.version ?? 0}|${manual}|${hud()}|${uiScale()}`;
  function current() {
    const k = keyOf();
    if (k !== frameKey || !frame) {
      const prev = frame;
      frame = compute(); frameKey = k;
      // a reframe while shown (the panel folded / opened, a resize, Q / E): step to it like a transition
      if (prev && info.active && !trans) trans = { t0: engine.time, from: snapshot(), to: 'vote' };
      measure();
    }
    return frame;
  }
  function measure() {
    const f = frame, S = engine.pixelScale || 1, ppm = cam.lowH / f.viewHeight;
    info.yaw = Math.round(f.yaw / DEG); info.manual = manual;
    info.viewHeight = +f.viewHeight.toFixed(3); info.target = [+f.target.x.toFixed(3), +f.target.z.toFixed(3)];
    info.fit = { w: +(f.box.u1 - f.box.u0).toFixed(2), h: +(f.box.v1 - f.box.v0).toFixed(2) };
    info.cover = f.cover;
    const sc = stage()?.scale ?? 1, cp = Math.cos(f.pitch ?? PITCH);
    info.pitch = Math.round((f.pitch ?? PITCH) / DEG);
    // seat13 = a 1.3 m figure as STAGED (x the cast scale); dial = the clock face's diameter (the vertical extent)
    info.px = { seat13: +(1.3 * sc * cp * ppm * S).toFixed(1), dial: f.dial ? +(2 * 1.12 * (f.dial.k ?? 1) * cp * ppm * S).toFixed(1) : 0, perM: +(ppm * S).toFixed(2), scale: S, cast: sc };
  }

  /** every seat (feet + head) and the dial's top / bottom inside the visible rect and clear of the keep-outs, with
   *  the camera's CURRENT pose (the playtest's framing check) */
  const proj = new THREE.Vector3();
  function inFrame() {
    if (!frame) return null;
    const S = engine.pixelScale || 1, w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const { vis, keep } = screenAreas(cam.lowW, cam.lowH, frame.cover);
    const at = (x, y, z) => { proj.set(x, y, z).project(cam.cam); return [((proj.x * 0.5 + 0.5) * w) / S, ((-proj.y * 0.5 + 0.5) * h) / S]; };
    const clear = ([x, y]) => x >= vis.x0 - 1 && x <= vis.x1 + 1 && y >= vis.y0 - 1 && y <= vis.y1 + 1 && !keep.some((k) => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1);
    let seats = 0;
    const H = heights(), bad = [], st = frame.staged ? stage() : null, sc = st?.scale ?? 1;
    for (let i = 0; i < 15; i++) {
      const s = spotFor(st, i), y0 = s.y ?? SEAT_TOP, top = y0 + (H[i] ?? HEAD_DEFAULT) * sc;
      if (clear(at(s.x, y0, s.z)) && clear(at(s.x, top, s.z))) seats++; else bad.push(i);
    }
    const d = frame.dial;
    const dial = !!d && clear(at(d.c.x, d.c.y + d.r, d.c.z)) && clear(at(d.c.x, d.c.y - d.r, d.c.z));
    const dialPx = d ? at(d.c.x, d.c.y, d.c.z).map((x) => Math.round(x * S)) : null;
    return { seats, bad, dial, dialPx };
  }

  // ---- the follow pose (what camera.js shows): the player, the zoom, the store's yaw
  const followPose = () => {
    const p = demo.player?.position ?? cam.target;
    return { target: new THREE.Vector3(p.x, 0, p.z), vh: store.state.zoom, yaw: (store.state.yaw || 0) * DEG, pitch: PITCH };
  };
  const poseOf = (f) => ({ target: f.target.clone(), vh: f.viewHeight, yaw: f.yaw, pitch: f.pitch ?? PITCH });
  const setPose = (P) => cam.set({ target: P.target, yaw: P.yaw, pitch: P.pitch ?? PITCH, viewHeight: P.vh });
  const snapshot = () => ({ target: cam.target.clone(), vh: cam.viewHeight, yaw: cam.yaw, pitch: cam.pitch });
  function stepPose(tr, to) {
    const u = Math.min(1, Math.max(0, (engine.time - tr.t0) / TRANS_S));
    const k = Math.min(TRANS_STEPS, Math.floor(u * TRANS_STEPS) + 1);
    const e = u >= 1 ? 1 : easeInOutSine(k / (TRANS_STEPS + 1));
    const A = tr.from, dy = wrapPi(to.yaw - A.yaw), p0 = A.pitch ?? PITCH, p1 = to.pitch ?? PITCH;
    // the target in the GROUND plane moves with the pitch (a lower camera's centre lies further out): lerp the screen
    // centre's ground point, the pitch on the same eased key spacing
    setPose({ target: A.target.clone().lerp(to.target, e), vh: A.vh + (to.vh - A.vh) * e, yaw: u >= 1 ? to.yaw : A.yaw + dy * e, pitch: u >= 1 ? p1 : p0 + (p1 - p0) * e });
    info.trans = +u.toFixed(3);
    return u >= 1;
  }

  const offs = [];
  offs.push(store.on('camera', ({ value, prev, source }) => {
    if (value === 'vote') { ceremonyCam = source === 'time'; trans = { t0: engine.time, from: snapshot(), to: 'vote' }; }
    else if (prev === 'vote') {
      ceremonyCam = false; nightAt = null;
      trans = value === 'follow' && !demo.player?.interior ? { t0: engine.time, from: snapshot(), to: 'follow' } : null;
    }
  }));
  // Q / E in the vote mode: the vote camera steps to the next 45 deg stop (its own tight frame there)
  offs.push(store.on('yaw', ({ value, prev }) => {
    if (store.state.camera !== 'vote' || !Number.isFinite(prev)) return;
    const d = Math.round((value - prev) / 45) * 45;
    if (!d) return;
    const cur = manual ?? (frame ? Math.round(frame.yaw / DEG) : 0);
    manual = ((((cur + d) % 360) + 540) % 360) - 180;
  }));
  // the ceremony (time.js playCeremony) switched follow -> vote: back to follow 3 s after it reaches night
  offs.push(store.on('phase', ({ value, source }) => { if (ceremonyCam && source === 'time' && value === 'night') nightAt = engine.time; }));

  const base = rig.update.bind(rig);
  rig.update = (t, dt) => {
    base(t, dt);
    if (demo.player?.interior || (demo.intro?.phase && demo.intro.phase !== 'done')) { info.active = false; return; }
    if (nightAt !== null && engine.time - nightAt > 3) { nightAt = null; if (ceremonyCam && store.state.camera === 'vote') store.set({ camera: 'follow' }, 'votecam'); }
    const m = store.state.camera;
    if (m === 'vote') {
      const f = current();
      info.active = true;
      if (trans && trans.to === 'vote') { if (stepPose(trans, poseOf(f))) { trans = null; info.trans = null; } }
      else { setPose(poseOf(f)); info.trans = null; }
      return;
    }
    info.active = false;
    if (trans && trans.to === 'follow' && m === 'follow') { if (stepPose(trans, followPose())) { trans = null; info.trans = null; } }
  };
  rig.__voteCam = true;

  return {
    info,
    get frame() { return frame; },
    /** the frame for any yaw / panel band (tests) */
    frameFor: (o = {}) => voteFrame({ yaw: (o.yaw ?? 0) * DEG, lowW: o.lowW ?? cam.lowW, lowH: o.lowH ?? cam.lowH, right: o.right ?? 0, hud: o.hud ?? hud(), heights: heights(), dials, stage: o.stage === undefined ? stage() : o.stage, ui: o.ui ?? uiScale() }),
    /** automatic yaw again (after Q / E) */
    auto() { manual = forced; frameKey = ''; },
    refresh() { frameKey = ''; },
    check() { info.inFrame = inFrame(); return JSON.parse(JSON.stringify(info)); },
    dispose() { for (const o of offs) o?.(); },
  };
}
