// Notebook variant "bookStyle: 'big'" as a REAL 3D BOOK (owner: notebook group; docs/UI.md §6 "3D big book").
// User brief (2026-10-17, after the flat big book): "The book should be a 3d sprite like the hand." The book is a
// three.js model drawn by the pixel3d pipeline (toon ramp, 1-texel outlines + cream edge highlights, texel snapping),
// so it is shaded, has thickness and perspective and turns with the reader's facing, like the pointing hand.
//
//   Live (pixel3d scenes): book3dContext(hud) keeps one 3D book per reader in engine.scene; drawReader3d(view, m, opts)
//     poses it from the same inputs as the held book (openAt / closeAt / typing / seed / still). Real light, shadow and
//     outline. Never hidden by its own reader: each book carries a per-book VIEW-SPACE depth bias (uBookBias, toward the
//     camera; the orthographic projection keeps its screen position) that puts the whole book just in front of its
//     reader's nearest point; other people standing nearer still hide it. Under labels / bubbles / the finger (the UI
//     layers composite after the scene).
//   Port (2D v2 game): bake3d.js renders the same model from the gameplay camera (yaw 0, pitch 30°, vh 12 = 30 texels/m)
//     for 8 facings x every drawing -> bookbig_<dir>_<phase>_<f> (+ ghost bookbigghost_*) in out/ui/notebook{,-night}.*;
//     anchor = the READER'S FEET (per dir, meta.bigBook.anchors), so the game draws it at feet - anchor, depth = avatar
//     depth + epsilon (over its own reader, under labels).
//
// Model (metres; local frame: X across the spread = the reader's right, Y = page normal, Z along the spine, +Z = the far
// end = away from the reader; spine axis = the local Z axis through the origin):
//   two boards (leather, 1 texel thick, overhanging the pages) each with a page block whose top dips into the gutter,
//   a rounded spine (an arc band that wraps the hinge as the book closes), gold corner caps, a gold clasp + a gold
//   diamond on the front cover, printed lines (ink strips), a red ribbon hanging off the near edge, loose leaves that fan
//   at the gutter and turn, and a quill (cream feather, gold shaft, dark nib) for the writing variant.
//   The right half is static; the left half (front cover + its pages) hinges on the spine: phi 180° = closed (lying on
//   the right half, front cover up, spine on the reader's left), 0° = open flat. A leaf at angle a lies on the right
//   page at 0°, stands at 90°, lies on the left page at 180°.
// Drawings (stepped poses, 30 Hz grid):
//   open_0..5   15 fps: pop (half size, low), closed + rise, cover lifts, cover past upright + leaves trail, cover falls
//               + leaves fan, open (leaves fanned at the gutter)
//   hold_0..4   10 fps, HOLD_SEQ_3D (3 s loop seeded per reader): open, a right page corner lifts, the page stands,
//               passes upright, lands on the left
//   close_0..3  15 fps: cover rises, cover nearly shut, closed, pop away (sinks + shrinks)
//   write_0..3  10 fps: open, the quill writes along the near line of the right page, the ink grows behind the nib
//   ghost (dead readers): the same drawings in the cast ghost ramp (pale blue), no cast shadow.
// Placement (PLACE3D, per facing, relative to the camera): centre = feet + up (y + ghost lift) + facing x fwd + toward
// the camera x cam (+ the camera-side hip x side when facing away), spine along the facing, tilted toward the reader
// (flat when the reader faces the camera, 22° sideways, 32° facing away) so the camera always sees the pages.
import * as THREE from 'three';
import { toonMaterial, rampFromTones } from '../../materials/toon.js';
import { box, extrude, merge, xf, mirrorX } from '../../chars/kit.js';
import { GRID_HZ, VARIANT_RAMPS, tokens, ramp, steps } from '../kit.js';
import { DIRS } from './art.js';

export const DIRS3D = DIRS;
/** Facing angle (rad, Character convention: 0 = +z = toward the yaw-0 camera) of each v2 dir name. */
export const DIR_FACE = { down: 0, 'down-right': 1, right: 2, 'up-right': 3, up: 4, 'up-left': 5, left: 6, 'down-left': 7 };
export const faceOfDir = (dir) => DIR_FACE[dir] * Math.PI / 4;

export const BOOK_DIM = { PW: 0.36, PL: 0.5, over: 0.025, BT: 0.03, PT: 0.05 };
const { PW, PL, over: OV, BT, PT } = BOOK_DIM;
const R0 = BT + PT;                  // hinge radius: board bottom at y = -R0 when open
export const BIG3D_PHASES = { open: 6, hold: 5, close: 4, write: 4 };
export const BIG3D_FPS = { open: 15, hold: 10, close: 15, write: 10 };
export const BIG3D_TIMING = { OPEN_FRAMES: 12, CLOSE_FRAMES: 8, HOLD_LOOP_S: 3.0, WRITE_HOLD_MS: 1500 };
/** Hold drawing per 10 fps step: open 0.9 s, then the page turn (lift, stand, upright, land), open 1.7 s (3 s loop). */
// r2 (critic): the turn now comes 0.9 s into the loop (was 2.4 s: longer than a typical 2-3 s read, so the flutter never
// showed in the state=close loop); readers are offset by HOLD_SEED_STEP steps so two never turn in unison
export const HOLD_SEQ_3D = [...Array(9).fill(0), 1, 2, 3, 4, ...Array(17).fill(0)];
export const HOLD_SEED_STEP = 11;
export const PLACE3D = {
  // r2 (critic: at 0.40 it read as lying on the ground, shadow right under it, seat-ring dashes over the pages): waist
  // height, still under the face / label of the 1.05-1.44 m cast; fixed so the port anchor stays the feet
  y: 0.6,
  fwd: 0.3,          // m along the facing
  cam: 0.3,          // m toward the camera (keeps the book on the viewer's side)
  side: 0.42,        // m to the side x (how much the reader faces away): beside the hip, not over the back; the side
                     // nearer the camera (up-left readers hold it on their left, up / up-right on their right)
  ghostLift: 0.2,    // ghosts hover ~0.2 m (cast ghost clips)
  // r2 (critic): readers facing the camera hold it beside the camera-side hip too, so a finger drawn from the head down
  // the screen leaves part of the spread clear (m x how much the reader faces the camera)
  sideFront: 0.34,
  // r2 (critic: the straight up / down spread was a flat face-on rectangle): near the screen axis the book turns off it by
  // up to yawEnd degrees (full at |d| = 1, none at the diagonals), so the fore-edge thickness + gull-wing curve show
  yawEnd: 18,
  tilt: { front: -8, side: 22, away: 14 },  // degrees, far end raised toward the reader (front: lowered a little, so the
                                            // pages show; away: gentle, so the spread does not stand up like a sign)
  // depth bias (live): the book's far point is put this far in front of the reader's nearest point
  bookR: 0.45, readerR: 0.65, gap: 0.05,   // readerR covers held props (staffs, tools) in front of the body
  scale: 1,
};

/** r2 (critic, optional brief item): bookStyle 'held3d' = this model at held size in the hands (the held book's grip
 * point, draw.js gripPoint) instead of the small billboard; evaluated in docs/UI.md §6. */
export const HELD3D = { scale: 0.55 };

// ------------------------------------------------------------------------------------------------ materials
/** Albedo tones (sRGB hex hi / mid / sh) per part; the scene light does day / night. ghost = the cast ghost ramp. */
export function bookTones(ghost = false) {
  if (ghost) {
    // dim: the cast ghost ramp (VARIANT_RAMPS.ghost ends) in 7 steps, the pages one step below the ghost body's lightest
    const g = steps(VARIANT_RAMPS.ghost[0], VARIANT_RAMPS.ghost[4], 7);
    return {
      leather: { hi: g[3], mid: g[2], sh: g[1] }, page: { hi: g[5], mid: g[4], sh: g[2] }, gold: { hi: g[6], mid: g[5], sh: g[3] },
      ribbon: { hi: g[3], mid: g[2], sh: g[1] }, ink: { hi: g[2], mid: g[2], sh: g[1] }, print: { hi: g[3], mid: g[2], sh: g[2] },
      quill: { hi: g[3], mid: g[2], sh: g[1] },
      nib: { hi: g[1], mid: g[1], sh: g[0] },
    };
  }
  const T = tokens('noon'), rib = ramp(T.danger);
  return {
    // oxblood leather: darker than the cobbles and the brown cast, so the cream page block carries the read
    leather: { hi: '#A0623A', mid: '#7A432F', sh: '#4E2C34' },
    page: { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh },
    gold: { hi: T.goldHi, mid: T.gold, sh: T.goldSh },
    ribbon: { hi: rib.hi, mid: rib.mid, sh: rib.sh },
    ink: { hi: '#5A4A5E', mid: '#4A3B50', sh: '#3A2E42' },
    // r2 (critic: heavy near-black dashes read as bars / a barcode in side views): the printed lines use a warm brown ink,
    // lighter than the crease, broken into words
    print: { hi: '#9A7458', mid: '#835F48', sh: '#6C4C3C' },
    // r2 (critic: a cream feather on a cream page was a faint grey stick): a brown goose quill, clearly below the page
    quill: { hi: '#8E6E52', mid: '#6E523E', sh: '#4E3A30' },
    nib: { hi: T.inkRaised, mid: T.ink, sh: T.outline },
  };
}

/**
 * One material set. bias = a shared {value} uniform (m, view space toward the camera) or null (bake: no bias). Every
 * book material shares ONE GL program (same shader text; tones / bias are per-material uniforms).
 */
/** Night page glow (linear emissive): the reader's own lamp light on the paper, so a night reader still reads from across
 * the square (the scene light alone leaves the pages a dim blue-grey next to the ungraded UI). */
// r2 (critic: the oxblood cover went near-black at night, the gold lost): the leather gets a faint warm lift (about one
// ramp step) and the gold a stronger one, so the shut book still reads as leather with gold
export const NIGHT_GLOW = { page: [0.26, 0.21, 0.13], print: [0.07, 0.045, 0.025], quill: [0.06, 0.045, 0.03], gold: [0.3, 0.2, 0.05], leather: [0.09, 0.035, 0.03], ribbon: [0.08, 0.02, 0.02], ghost: [0.1, 0.13, 0.2] };
export function bookMaterials(engine, { ghost = false, bias = null, night = engine?.style?.timeOfDay === 'night' } = {}) {
  const tones = bookTones(ghost), out = { ghost, night, bias: bias ?? { value: 0 } };
  for (const [k, t] of Object.entries(tones)) {
    const { color, ramp: rp } = rampFromTones(t.hi, t.mid, t.sh);
    const m = toonMaterial(engine, {
      color, ramp: rp, outline: 'full',
      vertexHead: 'uniform float uBookBias;', viewVertex: 'mvPosition.z += uBookBias;', uniforms: { uBookBias: out.bias },
    });
    m.customProgramCacheKey = () => 'pixel3d-ui-book3d-v1';
    m.name = `book3d-${k}${ghost ? '-ghost' : ''}`;
    const glow = night && (ghost ? (k === 'page' || k === 'quill') && NIGHT_GLOW.ghost : NIGHT_GLOW[k]);
    if (glow) m.emissive.setRGB(...glow);
    out[k] = m;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ geometry
/** Extruded polygon (x-y) along z, kept at the polygon's own coordinates (kit extrude centres). */
function extrudeAt(poly, depth, z = 0) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return xf(extrude(poly, depth), { at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, z] });
}
const boxAt = (w, h, d, x, y, z, rot) => xf(box(w, h, d), { at: [x, y, z], rot: rot || [0, 0, 0] });

/** Page block top (x = distance from the spine): the open-book "gull wing", dipping into the gutter, a hump a third of
 * the way out, falling to the fore-edge. */
export const PAGE_HUMP = 0.035;
export const pageTop = (x) => {
  const u = Math.min(1, Math.max(0, (x - 0.012) / (PW - 0.012)));
  return u < 0.3 ? -0.03 + (PAGE_HUMP + 0.03) * Math.sin((u / 0.3) * Math.PI / 2) : PAGE_HUMP * (1 - ((u - 0.3) / 0.7) ** 1.6);
};
/** Word lengths (m) of a printed line, cycled; WORD_GAP between words (r2: words, not a solid dash). */
export const WORDS = [0.11, 0.075, 0.13, 0.085], WORD_GAP = 0.036;
/** A line of printed words along x at row z, riding on the page top (one box per word, at most len long). */
function lineGeo(x0, len, z, k0 = 0) {
  const parts = [];
  for (let x = x0, k = k0; x < x0 + len - 0.02; k++) {
    const b = Math.min(x0 + len, x + WORDS[k % WORDS.length]);
    parts.push(boxAt(b - x, 0.006, 0.034, (x + b) / 2, pageTop((x + b) / 2) + 0.002, z));
    x = b + WORD_GAP;
  }
  return merge(...parts);
}
export const LINES = [[0.13, 0.22], [0, 0.24], [-0.13, 0.17]];   // [z, length] of the printed lines (right page)
export const WRITE_LINE = { z: -0.13, x0: 0.09, step: 0.05 };    // the quill writes along the near line

let _geo = null;
function staticGeo() {
  if (_geo) return _geo;
  const yb = -R0 + BT;
  const board = boxAt(PW + OV - 0.008, BT, PL + 2 * OV, (0.008 + PW + OV) / 2, -R0 + BT / 2, 0);
  const prof = [[0.012, yb], [PW, yb]];
  for (let i = 0; i <= 10; i++) { const x = PW - (PW - 0.012) * i / 10; prof.push([x, pageTop(x)]); }
  const block = extrudeAt(prof, PL);
  const cz = PL / 2 + OV - 0.022, cx = PW + OV - 0.022;
  const corners = merge(boxAt(0.05, BT + 0.012, 0.05, cx, -R0 + BT / 2, cz), boxAt(0.05, BT + 0.012, 0.05, cx, -R0 + BT / 2, -cz));
  const lines = merge(...LINES.map(([z, len], i) => lineGeo(0.09, len, z, i)));
  const linesR = merge(...LINES.filter(([z]) => z !== WRITE_LINE.z).map(([z, len], i) => lineGeo(0.09, len, z, i)));
  // the ribbon lies on the right page beside the gutter and hangs off the near (reader's) edge
  const ribbon = merge(boxAt(0.035, 0.008, 0.16, 0.045, pageTop(0.045) + 0.003, -PL / 2 + 0.08), boxAt(0.035, 0.17, 0.008, 0.045, -0.08, -PL / 2 - 0.006));
  // the gutter crease: a dark strip down the spine between the two page blocks
  const crease = boxAt(0.026, 0.01, PL - 0.01, 0, -0.035, 0);
  const clasp = boxAt(0.05, BT + 0.02, 0.09, -(PW + OV + 0.012), -R0 + BT / 2, 0);
  const emblem = boxAt(0.085, 0.01, 0.085, -(PW + OV) / 2, -R0 - 0.004, 0, [0, 45, 0]);
  _geo = {
    boardR: board, blockR: block, cornersR: corners, linesR: lines, linesRwrite: linesR, ribbon, crease,
    boardL: mirrorX(board), blockL: mirrorX(block), cornersL: mirrorX(corners), linesL: mirrorX(lines), clasp, emblem,
  };
  return _geo;
}

const _leaf = new Map();
const LEAF_LINES = [[0.12, 0.2], [0, 0.22], [-0.12, 0.15]];      // [z, length] printed on both faces of a loose leaf
/** A loose leaf hinged at the spine, lying along +x; curl lifts (+) or drops (-) its free edge (bend grows as x²).
 * Returns { sheet, print }: the paper and its printed lines (both faces, so a leaf turned over still shows text). */
function leafGeo(curl) {
  const k = Math.round(curl * 100) / 100;
  if (_leaf.has(k)) return _leaf.get(k);
  const n = 6, L = PW - 0.022, top = [], bot = [];
  const yAt = (x) => k * L * ((x - 0.012) / L) ** 2;
  for (let i = 0; i <= n; i++) { const u = i / n, x = 0.012 + L * u, y = k * L * u * u; top.push([x, y]); bot.push([x, y - 0.012]); }
  const sheet = extrudeAt([...bot, ...top.reverse()], PL - 0.02);
  const parts = [];
  LEAF_LINES.forEach(([z, len], li) => {
    for (let a = 0.09, k = li + 1; a < 0.09 + len - 0.02; k++) {
      const b = Math.min(0.09 + len, a + WORDS[k % WORDS.length]), x = (a + b) / 2, y = yAt(x);
      parts.push(boxAt(b - a, 0.004, 0.034, x, y + 0.002, z), boxAt(b - a, 0.004, 0.034, x, y - 0.014, z));
      a = b + WORD_GAP;
    }
  });
  const g = { sheet, print: merge(...parts) };
  _leaf.set(k, g);
  return g;
}
const _spine = new Map();
/** The rounded spine: an arc band (radius R0 - BT .. R0) from the right board (-90°) around the outside to the left one. */
function spineGeo(phi) {
  const k = Math.round(phi);
  if (_spine.has(k)) return _spine.get(k);
  let g = null;
  if (k > 6) {
    const n = Math.max(2, Math.ceil(k / 30)), a0 = -Math.PI / 2, a1 = -Math.PI / 2 - k * Math.PI / 180, outer = [], inner = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; outer.push([Math.cos(a) * R0, Math.sin(a) * R0]); inner.push([Math.cos(a) * (R0 - BT), Math.sin(a) * (R0 - BT)]); }
    g = extrudeAt([...outer, ...inner.reverse()], PL + 2 * OV - 0.01);
  }
  _spine.set(k, g);
  return g;
}
let _quill = null;
function quillGeo() {
  if (_quill) return _quill;
  // r2: the vane 1.6x wider (>= 2 texels seen from the game camera) and 0.022 thick
  const feather = extrudeAt([[0, 0.05], [0.04, 0.1], [0.055, 0.18], [0.034, 0.26], [0, 0.3], [-0.026, 0.25], [-0.034, 0.15], [-0.014, 0.08]].map(([x, y]) => [x * 1.6, y]), 0.022);
  _quill = { feather, shaft: boxAt(0.016, 0.12, 0.016, 0, 0.07, 0), nib: boxAt(0.02, 0.03, 0.02, 0, 0.012, 0) };
  return _quill;
}

// ------------------------------------------------------------------------------------------------ poses
// fanned loose leaves at rest: two on each side, draped over the hump (right: curl -, left: curl +, see leafGeo)
const REST_LEAVES = [[13, -0.16], [21, -0.22], [159, 0.22], [167, 0.16]];
const CLOSED = { s: 1, lift: 0.05, phi: 180, leaves: [] };
const TURN = [null, [22, 0.35], [72, -0.3], [118, -0.4], [166, -0.22]];
/** The pose of one drawing: { s (scale), lift (m), phi (deg), leaves [[a deg, curl]], quill (step) | null }. */
export function bookPose(phase, f) {
  const rest = { s: 1, lift: 0, phi: 4, leaves: REST_LEAVES, quill: null };
  if (phase === 'open') return [
    { ...CLOSED, s: 0.5, lift: -0.1 },
    { ...CLOSED },
    { s: 1, lift: 0.05, phi: 128, leaves: [] },
    { s: 1, lift: 0.04, phi: 80, leaves: [[62, -0.2], [30, 0.1]] },
    { s: 1, lift: 0.02, phi: 28, leaves: [[124, -0.3], [84, -0.2], [32, 0.1]] },
    rest,
  ][f];
  if (phase === 'hold') return f === 0 ? rest : { ...rest, leaves: [...REST_LEAVES, TURN[f]] };
  if (phase === 'close') return [
    { s: 1, lift: 0.02, phi: 72, leaves: [[104, -0.25], [4, 0.1], [10, 0.14]] },
    { s: 1, lift: 0.04, phi: 146, leaves: [] },
    { ...CLOSED },
    { ...CLOSED, s: 0.5, lift: -0.12 },
  ][f];
  if (phase === 'write') return { ...rest, leaves: REST_LEAVES.filter(([a]) => a > 90), quill: f };
  return rest;
}

// ------------------------------------------------------------------------------------------------ the book object
/**
 * One 3D book. mats = bookMaterials(...) (own per book in live mode: its bias uniform). Returns
 * { root, mats, setPose(pose), place({pos, yaw, tilt}, lift) }. root is added by the caller.
 */
export function createBook3D(engine, { mats = null, ghost = false, scale = PLACE3D.scale } = {}) {
  const M = mats || bookMaterials(engine, { ghost });
  const G = staticGeo(), Q = quillGeo();
  const cast = !M.ghost;
  // casts a real shadow on the ground; does not RECEIVE shadows: the reader's own body and staff (sun from the upper left,
  // the book often lower right of its reader) striped and darkened the pages (shots/ui-book3d/dbg/finn.png), and the
  // port bake has no reader, so live and port now light the book the same way
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = false; return o; };
  const root = new THREE.Group(); root.name = 'book3d';
  const tilt = new THREE.Group(); root.add(tilt);
  const body = new THREE.Group(); tilt.add(body);                         // scale / lift (pop) around the spine
  const right = [mesh(G.boardR, M.leather), mesh(G.blockR, M.page), mesh(G.cornersR, M.gold), mesh(G.ribbon, M.ribbon), mesh(G.crease, M.ink)];
  const linesR = mesh(G.linesR, M.print), linesRw = mesh(G.linesRwrite, M.print);
  body.add(...right, linesR, linesRw);
  const left = new THREE.Group(); body.add(left);
  left.add(mesh(G.boardL, M.leather), mesh(G.blockL, M.page), mesh(G.cornersL, M.gold), mesh(G.linesL, M.print), mesh(G.clasp, M.gold), mesh(G.emblem, M.gold));
  const spine = mesh(spineGeo(180), M.leather); body.add(spine);
  const leaves = Array.from({ length: 5 }, () => {
    const l = new THREE.Group(), g = leafGeo(0), o = mesh(g.sheet, M.page), p = mesh(g.print, M.print);
    l.add(o, p); body.add(l); l.userData.m = o; l.userData.p = p; return l;
  });
  const quill = new THREE.Group(); body.add(quill);
  quill.add(mesh(Q.feather, M.quill), mesh(Q.shaft, M.gold), mesh(Q.nib, M.nib));
  // the quill leans up, back toward the reader and out to the right (a right-handed writer); its feather plane holds the
  // book's X axis, so the flat of the feather faces up (seen from the high camera at every facing)
  {
    const Y = new THREE.Vector3(0.42, 0.82, -0.38).normalize(), Z = new THREE.Vector3(1, 0, 0).cross(Y).normalize(), X = Y.clone().cross(Z);
    quill.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }
  const ink = mesh(boxAt(1, 0.006, 0.034, 0.5, 0.002, 0), M.print); body.add(ink);
  const book = {
    root, mats: M, pose: null, k: scale,       // k = model scale (held3d sets HELD3D.scale per frame)
    setPose(p) {
      book.pose = p;
      body.scale.setScalar(p.s * book.k);
      body.position.set(0, p.lift, 0);
      left.rotation.set(0, 0, -p.phi * Math.PI / 180);
      const sg = spineGeo(p.phi); spine.visible = !!sg; if (sg) spine.geometry = sg;
      leaves.forEach((l, i) => {
        const v = p.leaves[i];
        l.visible = !!v;
        if (!v) return;
        l.rotation.set(0, 0, v[0] * Math.PI / 180);
        const g = leafGeo(v[1]); l.userData.m.geometry = g.sheet; l.userData.p.geometry = g.print;
      });
      const writing = p.quill !== null && p.quill !== undefined;
      linesR.visible = !writing; linesRw.visible = writing; quill.visible = writing; ink.visible = writing;
      if (writing) {
        const nx = WRITE_LINE.x0 + WRITE_LINE.step * (p.quill + 1);
        quill.position.set(nx, pageTop(nx) + 0.004, WRITE_LINE.z);
        ink.scale.set(nx - WRITE_LINE.x0 - 0.01, 1, 1); ink.position.set(WRITE_LINE.x0, pageTop((nx + WRITE_LINE.x0) / 2), WRITE_LINE.z);
      }
      return book;
    },
    /** Put the book at a placement ({pos, yaw, tilt} from placeBook3D). */
    place(pl) {
      root.position.copy(pl.pos);
      root.rotation.set(0, pl.yaw, 0, 'YXZ');
      tilt.rotation.set(-pl.tilt, 0, 0);
      return book;
    },
  };
  book.setPose(bookPose('hold', 0));
  return book;
}

// ------------------------------------------------------------------------------------------------ placement + state
/**
 * Where a reader's book goes. feet (Vector3), face (rad, 0 = +z), camYaw (rad), ghost. Returns { pos, yaw, tilt, d }:
 * d = dot(facing, toward-camera) (1 = facing the viewer, -1 = facing away).
 */
export function placeBook3D(feet, face, camYaw = 0, { ghost = false } = {}) {
  const P = PLACE3D;
  const f = new THREE.Vector3(Math.sin(face), 0, Math.cos(face)), c = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const r = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
  const d = Math.round(f.dot(c) * 1e6) / 1e6;
  // facing away: beside the hip on the side nearer the camera (the reader's right when facing straight away)
  const rs = r.dot(c) < -1e-3 ? -1 : 1;
  const pos = feet.clone().addScaledVector(f, P.fwd).addScaledVector(c, P.cam)
    .addScaledVector(r, rs * (P.side * Math.max(0, -d) + P.sideFront * Math.max(0, d)));
  pos.y += P.y + (ghost ? P.ghostLift : 0);
  const tdeg = d >= 0 ? P.tilt.side * (1 - d) + P.tilt.front * d : P.tilt.side * (1 + d) + P.tilt.away * -d;
  // off the screen axis near |d| = 1 (0 at the diagonals |d| = 0.707), signed by the hip side, so the fore-edge shows
  const u = Math.min(1, Math.max(0, (Math.abs(d) - 0.75) / 0.25)), yo = rs * Math.sign(d) * P.yawEnd * u * Math.PI / 180;
  return { pos, yaw: face + yo, tilt: tdeg * Math.PI / 180, d };
}

const gf = (s) => Math.floor(s * GRID_HZ + 0.01);
/**
 * Which drawing a reader shows at time t (same inputs as draw.js bookState). { phase, f } or null. A close that starts
 * before the cover passed upright (open drawing 3) skips close_0. Reduced motion (still): no open / close drawings,
 * no page turn, the quill holds its first drawing.
 */
export function book3dState(t, { openAt, closeAt = Infinity, typing = false, seed = 0, still = false }) {
  if (openAt === undefined || openAt === null || t < openAt) return null;
  if (t >= closeAt) {
    if (still) return null;
    const c = gf(t - closeAt), reached = gf(closeAt - openAt);
    const k = (reached >= 6 ? 0 : 1) + (c >> 1);
    return k < BIG3D_PHASES.close ? { phase: 'close', f: k } : null;
  }
  const g = gf(t - openAt);
  if (!still && g < BIG3D_TIMING.OPEN_FRAMES) return { phase: 'open', f: g >> 1 };
  if (typing) return { phase: 'write', f: still ? 0 : Math.floor((gf(t) + seed * 2) / 3) % BIG3D_PHASES.write };
  if (still) return { phase: 'hold', f: 0 };
  const k = Math.floor((g - BIG3D_TIMING.OPEN_FRAMES) / 3) + seed * HOLD_SEED_STEP, n = HOLD_SEQ_3D.length;
  return { phase: 'hold', f: HOLD_SEQ_3D[((k % n) + n) % n] };
}
/** Atlas frame name of a drawing (port mode). */
export const big3dFrameName = (dir, s, ghost = false) => `${ghost ? 'bookbigghost' : 'bookbig'}_${dir}_${s.phase}_${s.f}`;
/** Every drawing in atlas order: [[phase, f], ...]. */
export const BIG3D_DRAWINGS = Object.entries(BIG3D_PHASES).flatMap(([ph, n]) => Array.from({ length: n }, (_, f) => [ph, f]));

// ------------------------------------------------------------------------------------------------ live context
/**
 * Live 3D books for a hud (pixel3d scenes with a pipeline): { add(fn), drawReader3d(view, m, opts), books }. fn is
 * called before every scene render with a view { book3d: true, t, tok } (the same callbacks the held pass runs), so the
 * 3D pose is current in the very frame (stills with ?t= included). A reader's book that no callback drew this frame
 * is hidden.
 */
export function book3dContext(hud, { yaw, visualH = {}, still = false } = {}) {
  if (hud._book3d) return hud._book3d;
  const engine = hud.engine;
  if (!engine?.pipeline) return null;
  const fns = [], books = new Map();
  let frame = 0;
  const view = { book3d: true, t: 0, get tok() { return hud.tok; } };
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  const dbgBias = Number(hud.P?.('b3bias', '0') ?? 0) || 0;     // debug: ?b3bias=<m> adds to every book's bias (negative: none)
  const depth = (p) => tmp.copy(p).dot(fwd);       // view depth up to a constant (only differences are used)
  const ctx = {
    books, view,
    add(fn) { fns.push(fn); return fn; },
    drawReader3d(V, m, opts = {}) {
      const s = book3dState(V.t, opts);
      if (!s || !m) return null;
      const ghost = !!(opts.ghost ?? m.ghost);
      let e = books.get(m);
      if (e && e.ghost !== ghost) { engine.scene.remove(e.book.root); e = null; }
      if (!e) {
        const bias = { value: 0 };
        e = { ghost, bias, book: createBook3D(engine, { mats: bookMaterials(engine, { ghost, bias }) }), frame: 0 };
        engine.scene.add(e.book.root);
        books.set(m, e);
      }
      const face = opts.face ?? m.face ?? m.actor?.st?.face ?? 0, cy = yaw ? yaw() : 0;
      const pl = placeBook3D(m.pos, face, cy, { ghost });
      if (opts.at) pl.pos = opts.at.clone();            // held3d: at the held book's grip point (draw.js)
      e.book.k = opts.scale ?? PLACE3D.scale;
      e.book.setPose(bookPose(s.phase, s.f)).place(pl);
      e.book.root.visible = true;
      engine.camera.snapObjectToTexel(e.book.root, { once: true });
      // depth bias: the whole book in front of the whole reader (never hidden by its own body, hat or cap)
      engine.camera.cam.getWorldDirection(fwd);
      const H = visualH[m.id] ?? m.height ?? 1.3;
      const centre = m.pos.clone(); centre.y += H * 0.5 + (ghost ? PLACE3D.ghostLift : 0);
      const P = PLACE3D;
      e.bias.value = Math.max(0, depth(e.book.root.position) + P.bookR * e.book.k - (depth(centre) - P.readerR) + P.gap) + dbgBias;
      e.frame = frame;
      return { ...s, style: opts.at ? 'held3d' : 'big', dir: dirName(face - cy), pl };
    },
  };
  engine.onUpdate((tE) => {
    frame++;
    view.t = hud.clock ? hud.clock(tE) : tE;
    for (const fn of fns) fn(view);
    for (const e of books.values()) if (e.frame !== frame) e.book.root.visible = false;
  });
  void still;
  hud._book3d = ctx;
  return ctx;
}
const dirName = (rel) => ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'][((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
