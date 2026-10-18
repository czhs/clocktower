// v3 C1 (integrator, for WP3 + WP1). The voting-circle camera frame (user request in flight 1, docs/v3/INTEGRATION.md
// §9.1): every seat stone with its occupant (feet .. a raised hand) and the clock tower's dial that faces the camera,
// fitted as tightly as the visible canvas allows, clear of the game HUD's corner pieces. A port of the vendor's PURE
// fit `src/demo/votecam.js voteFrame` / `contentPoints` / `facingDial` + its candidate choice (`installVoteCam`
// compute: CANDIDATES 0 / 45 / -45, a later yaw must be > 4 % tighter) at the default staging (`votestage.js
// STAGES.A`: the cast on the 15 stones, pitch 23 deg, 30 deg on portrait screens, scale 1).
//
// Why a port and not an import: votecam.js imports votemarks.js, which pulls in the demo's whole HD UI / events /
// marks chain (src/ui/hd/*, src/ui/events/*, fonts; ~5 400 lines, and the only vendor modules that create style
// elements) for three constants of the demo HUD. The game has its own HUD, so the keep-out boxes are the game's
// (`keepOuts`), passed in low-res px. CONTRACT-REQUEST(pixel3d) in §9.2: export the fit from a module without the
// HUD / marks imports, with a keep-out list parameter; then this file becomes a vendor/ wrapper.
// Pure numbers (no three, no vendor): unit tested in test/game3d/voteCam.test.ts.

const DEG = Math.PI / 180;
/** votecam.js CANDIDATES (degrees, in order of preference). */
export const VOTE_YAWS: readonly number[] = [0, 45, -45];
/** A later candidate must be this much tighter (votecam.js PREFER). */
export const PREFER = 0.04;
/** votestage.js STAGES.A: pitch 23 deg (portrait 30 deg). */
export const VOTE_PITCH = 23 * DEG;
export const VOTE_PITCH_PORTRAIT = 30 * DEG;
/** Metres of world around the content (votecam.js MARGIN) and low-res px from the canvas edges (EDGE). */
const MARGIN = 0.18;
const EDGE = 2;
/** How far the fit may zoom out past the content-only size to clear the HUD (v3.1: 1.8 -> 2.4, the HUD keep-outs are
 *  now the real panels, e.g. the Storyteller panel over a third of a laptop screen). */
const MAX_ZOOM_OUT = 2.4;
/** The seat stones' top (votecam.js SEAT_TOP), the tallest standing cast height when a seat's occupant is unknown,
 *  a raised vote hand above the head, half a figure's width (HEAD_DEFAULT, HAND, BODY_R). */
export const SEAT_TOP = 0.235;
export const HEAD_DEFAULT = 1.75;
const HAND = 0.3;
const BODY_R = 0.4;
/** The vendor seal's reach in front of the feet (votemarks.js SEAL_AHEAD 0.62 + 1.6 x SEAL_M 0.27): kept so the
 *  frame matches the vendor's even though the game draws no seals (yet). */
const SEAL_REACH = 0.62 + 1.6 * 0.27;

export interface V3 {
  x: number;
  y: number;
  z: number;
}
/** A tower dial in WORLD metres: centre, outward unit normal, surround radius, size factor (front 1, sides 0.86). */
export interface Dial {
  c: V3;
  n: V3;
  r: number;
  k: number;
}
/** A low-res px rect [x0, y0) .. [x1, y1) (y down, origin top-left of the canvas). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface VoteFrameInput {
  /** radians */
  yaw: number;
  pitch?: number;
  /** canvas in low-res texels (engine.lowW / lowH) */
  lowW: number;
  lowH: number;
  /** the 15 seat stones (world metres, y = the stone top) in stone order */
  seats: readonly V3[];
  /** standing height of each stone's occupant (m), unknown = HEAD_DEFAULT */
  heights?: readonly (number | null | undefined)[];
  dials: readonly Dial[];
  /** HUD keep-out boxes (low-res px) no seat or dial may sit under */
  keep?: readonly Box[];
  /** (v3.1) the voting circle's paving (world metres, ground): its outer edge must stay inside the canvas (it may pass
   *  under the HUD), so a HUD-dodging placement can never push half the circle off-screen */
  ring?: { cx: number; cz: number; r: number };
}
/** Paving beyond the seat radius kept in frame (m). */
export const RING_PAD = 0.9;

export interface VoteFrame {
  /** the ground point (y = 0) the camera looks at */
  target: V3;
  viewHeight: number;
  yaw: number;
  pitch: number;
  /** world metres per low-res texel */
  tw: number;
  dial: Dial | null;
  shift: [number, number];
}

interface Basis {
  R: V3;
  U: V3;
  F: V3;
}
/** The pixel camera's basis (votecam.js basis; same as world/canopy.ts cameraBasis). */
export function voteBasis(yaw: number, pitch: number): Basis {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  return { R: { x: cy, y: 0, z: -sy }, U: { x: -sp * sy, y: cp, z: -sp * cy }, F: { x: -cp * sy, y: -sp, z: -cp * cy } };
}
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** The dial the camera at `yaw` sees best (ties -> the one facing south, toward the circle). */
export function facingDial(dials: readonly Dial[], yaw: number, pitch: number): Dial | null {
  const { F } = voteBasis(yaw, pitch);
  let best: Dial | null = null;
  let bd = -Infinity;
  for (const d of dials) {
    const f = -dot(d.n, F) + d.n.z * 1e-3;
    if (f > bd) {
      bd = f;
      best = d;
    }
  }
  return best;
}

/** Snap-space sample points [u, v] (m) of the seated cast + the facing dial. */
export function contentPoints(i: Pick<VoteFrameInput, 'yaw' | 'pitch' | 'seats' | 'heights' | 'dials'>): { pts: [number, number][]; dial: Dial | null } {
  const pitch = i.pitch ?? VOTE_PITCH;
  const { R, U } = voteBasis(i.yaw, pitch);
  const pts: [number, number][] = [];
  const add = (x: number, y: number, z: number) => pts.push([x * R.x + y * R.y + z * R.z, x * U.x + y * U.y + z * U.z]);
  const sy = Math.sin(i.yaw);
  const cy = Math.cos(i.yaw);
  i.seats.forEach((s, k) => {
    const y0 = s.y;
    const top = y0 + (i.heights?.[k] ?? HEAD_DEFAULT) + HAND;
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      const x = s.x + Math.cos(a) * BODY_R;
      const z = s.z + Math.sin(a) * BODY_R;
      for (const f of [0, 0.35, 0.7, 1]) add(x, y0 + (top - y0) * f, z);
    }
    add(s.x + sy * SEAL_REACH, 0, s.z + cy * SEAL_REACH);
  });
  const dial = facingDial(i.dials, i.yaw, pitch);
  if (dial) {
    const n = dial.n;
    const tl = Math.hypot(n.z, n.x) || 1;
    const t = { x: -n.z / tl, z: n.x / tl };
    for (let q = 0; q < 24; q++) {
      const a = (q / 24) * Math.PI * 2;
      add(dial.c.x + t.x * Math.cos(a) * dial.r, dial.c.y + Math.sin(a) * dial.r, dial.c.z + t.z * Math.cos(a) * dial.r);
    }
  }
  return { pts, dial };
}

/**
 * The tightest frame at `yaw`: the smallest texel size (+ a placement) for which every content point lies inside the
 * visible rect and outside every keep-out box (votecam.js voteFrame, staging A).
 */
export function voteFrame(i: VoteFrameInput): VoteFrame {
  const pitch = i.pitch ?? VOTE_PITCH;
  const { pts, dial } = contentPoints({ ...i, pitch });
  // the ring's edge: in frame (bounds + the visible rect), not tested against the keep-outs
  const ringPts: [number, number][] = [];
  if (i.ring) {
    const { R, U } = voteBasis(i.yaw, pitch);
    const rr = i.ring.r + RING_PAD;
    for (let q = 0; q < 32; q++) {
      const a = (q / 32) * Math.PI * 2;
      const x = i.ring.cx + Math.cos(a) * rr;
      const z = i.ring.cz + Math.sin(a) * rr;
      ringPts.push([x * R.x + z * R.z, x * U.x + z * U.z]);
    }
  }
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [u, v] of ringPts.length ? [...pts, ...ringPts] : pts) {
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  u0 -= MARGIN;
  u1 += MARGIN;
  v0 -= MARGIN;
  v1 += MARGIN;
  const vis: Box = { x0: EDGE, y0: EDGE, x1: i.lowW - EDGE, y1: i.lowH - EDGE };
  const keep = i.keep ?? [];
  const visW = Math.max(1, vis.x1 - vis.x0);
  const visH = Math.max(1, vis.y1 - vis.y0);
  const vcx = (vis.x0 + vis.x1) / 2;
  const vcy = (vis.y0 + vis.y1) / 2;
  const tw0 = Math.max((u1 - u0) / visW, (v1 - v0) / visH);
  const uc0 = (u0 + u1) / 2;
  const vc0 = (v0 + v1) / 2;
  const ok = (tw: number, dx: number, dy: number) => {
    const r = MARGIN / tw;
    for (const [u, v] of pts) {
      const x = vcx + dx + (u - uc0) / tw;
      const y = vcy + dy - (v - vc0) / tw;
      if (x - r < vis.x0 || x + r > vis.x1 || y - r < vis.y0 || y + r > vis.y1) return false;
      for (const k of keep) if (x + r > k.x0 && x - r < k.x1 && y + r > k.y0 && y - r < k.y1) return false;
    }
    for (const [u, v] of ringPts) {
      const x = vcx + dx + (u - uc0) / tw;
      const y = vcy + dy - (v - vc0) / tw;
      if (x < vis.x0 || x > vis.x1 || y < vis.y0 || y > vis.y1) return false;
    }
    return true;
  };
  let best: { tw: number; dx: number; dy: number } | null = null;
  for (let tw = tw0; tw < tw0 * MAX_ZOOM_OUT && !best; tw *= 1.01) {
    const sx = Math.max(0, (visW - (u1 - u0) / tw) / 2);
    const sy = Math.max(0, (visH - (v1 - v0) / tw) / 2);
    const xs = [0];
    const ys = [0];
    for (let d = 3; d <= sx; d += 3) xs.push(d, -d);
    for (let d = 3; d <= sy; d += 3) ys.push(d, -d);
    const pairs: [number, number, number][] = [];
    for (const dy of ys) for (const dx of xs) pairs.push([dx, dy, dx * dx + dy * dy]);
    pairs.sort((p, q) => p[2] - q[2]);
    for (const [dx, dy] of pairs)
      if (ok(tw, dx, dy)) {
        best = { tw, dx, dy };
        break;
      }
  }
  best ??= { tw: tw0 * MAX_ZOOM_OUT, dx: 0, dy: 0 };
  const { tw, dx, dy } = best;
  // the screen centre in snap space, then the ground target T with T.R = uc, T.U = vc, T.y = 0
  const uc = uc0 - (vcx + dx - i.lowW / 2) * tw;
  const vc = vc0 + (vcy + dy - i.lowH / 2) * tw;
  const sy = Math.sin(i.yaw);
  const cy = Math.cos(i.yaw);
  const g = -vc / Math.sin(pitch);
  return { target: { x: cy * uc + sy * g, y: 0, z: -sy * uc + cy * g }, viewHeight: tw * i.lowH, yaw: i.yaw, pitch, tw, dial, shift: [dx, dy] };
}

/** The frame the vote camera shows: the tightest of VOTE_YAWS (a later yaw must win by > PREFER), staging A pitch. */
export function chooseVoteFrame(i: Omit<VoteFrameInput, 'yaw' | 'pitch'>): VoteFrame {
  const pitch = i.lowW < i.lowH ? VOTE_PITCH_PORTRAIT : VOTE_PITCH;
  let f: VoteFrame | null = null;
  for (const y of VOTE_YAWS) {
    const c = voteFrame({ ...i, yaw: y * DEG, pitch });
    if (!f || c.tw < f.tw * (1 - PREFER)) f = c;
  }
  return f!;
}

/**
 * The game HUD's corner pieces during a vote, in CSS px (top-left: the phase / clock chips; top-right: the toolbar;
 * bottom-left: the social dock; bottom-right: the portrait / joystick corner). Converted per canvas by `keepOuts`.
 */
export const VOTE_KEEP_CSS = {
  tl: { w: 300, h: 56 },
  tr: { w: 210, h: 52 },
  bl: { w: 220, h: 64 },
  br: { w: 120, h: 84 },
} as const;

/** VOTE_KEEP_CSS as low-res px boxes of a lowW x lowH canvas drawn at `pixelScale` (each at most 45 % of the width). */
export function keepOuts(lowW: number, lowH: number, pixelScale: number): Box[] {
  const s = pixelScale > 0 ? pixelScale : 1;
  const cap = (w: number) => Math.min(lowW * 0.45, w / s);
  const K = VOTE_KEEP_CSS;
  return [
    { x0: 0, y0: 0, x1: cap(K.tl.w), y1: K.tl.h / s },
    { x0: lowW - cap(K.tr.w), y0: 0, x1: lowW, y1: K.tr.h / s },
    { x0: 0, y0: lowH - K.bl.h / s, x1: cap(K.bl.w), y1: lowH },
    { x0: lowW - cap(K.br.w), y0: lowH - K.br.h / s, x1: lowW, y1: lowH },
  ];
}

/** Key of the inputs a vote frame depends on (recompute only when it changes). */
export function voteFrameKey(lowW: number, lowH: number, pixelScale: number, heights: readonly (number | null | undefined)[] = []): string {
  return `${lowW}x${lowH}@${pixelScale}|${heights.map((h) => (h == null ? '-' : h.toFixed(2))).join(',')}`;
}
