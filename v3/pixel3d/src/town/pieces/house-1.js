// house-1 "Wychwood Cottage" (owner: house-1 agent). docs/TOWN.md §4 piece API, §6 scale rules.
//
// DESIGN NOTE (from pipgws packages/assets/scripts/houses/house-1.ts, the identity source of truth)
//   The crooked witch's cottage. SIGNATURE SHAPE: a huge sagging WITCH-HAT roof - a flared skirt of patched,
//   mossy shingle courses rising into a narrow crown whose TIP CURLS OVER TO THE LEFT and droops, with a little
//   brass star charm dangling from it; a ZIG-ZAG BRICK CHIMNEY climbs beside the hat on the right. Nothing else
//   in town has a curled cone: read at 640x360 it must be "the witch's hat house" at a squint.
//   Body: skewed walls (the whole box leans right: a shear x += 0.03 y) of stained plaster on a fieldstone base,
//   crooked dark timbers; left a skewed DIAMOND-LEADED window with potion bottles on the sill, right a stone
//   PORTHOLE; centre an arched PURPLE door with a glowing CRESCENT-MOON cut-out in an ashlar arch; wall lantern
//   on the left post; a round-windowed dormer on the left slope.
//   Yard (inside the footprint's 0.7 m front strip; the row in front, z 9, is the cobble lane): bubbling
//   CAULDRON on a fire (left), BESOM broom against the wall, three PUMPKINS (the big one carved, right),
//   toadstools; hanging bottle charms under the right eave, herb bundles under the left (persona: herbs),
//   woodpile against the left wall (persona: woodpile; side apron, x 13).
//   Palette rows (docs/TOWN.md §3): roof copper (verdigris teal = v1 WITCH_ROOF hue) with moss / mossTuft / plum /
//   red patches (v1 PURPLE_SLATE / RED_TILE patches), walls plaster + stone (rubble), beams timber, arch + step
//   ashlar, chimney brick + stone cap + red pots, door paintRamp('#4a2a5e') (the v1 door paint), iron, brass,
//   glass / glow, accents pumpkin, toadstool, ivory, flowerViolet, bannerBlue, bannerGold, leaf, thatch, daub.
//   Chimney side: the layout hint says 'left', but the v1 art (and the game) has the zig-zag stack on the RIGHT
//   slope, balancing the tip that curls left; the v1 house file is the identity, so it stays right.
//   Animation: the cauldron bubbles (3 stepped frames at 4 fps, its own tiny mesh); the door swings via api.setDoor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../core/noise.js';
import { createTree } from '../../world/trees.js';
import { Builder, M, frameOf, gableRoof, setGlowLit } from '../kit.js';
import { TOWN_PALETTE as PAL, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function hexMix(a, b, f) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((A >> sh) & 255) * (1 - f) + ((B >> sh) & 255) * f);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
const SHEAR = 0.03;                          // the whole cottage leans right: x += SHEAR * y
const shearM = () => new THREE.Matrix4().set(1, SHEAR, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

// walls (local frame: +z = south = door side, origin = footprint centre)
const WX = 2.3, ZF = 1.3, ZB = -1.75, WT = 0.22, EAVE_WALL = 2.5, BASE = 0.6;
const DOOR = { w: 0.96, spring: 1.62 };      // arched opening: rectangle to `spring`, semicircle above
const DR = DOOR.w / 2;
const PAINT_DOOR = ((t) => [t[0], t[1], hexMix(t[2], t[1], 0.45)])(paintRamp('#4a2a5e'));   // lifted shadow: reads at night

// the hat
const HAT = { y0: 2.46, y1: 5.72, hx0: 2.74, hz0: 1.98, r1: 0.3, cz: (ZF + ZB) / 2, lift: 0.05, N: 24, sag: 0.13 };
// moss: clumps of leaf-sprite cushions (createTree 'bush', research foliage technique) sitting in the shingle
// courses: [angle (th convention: 0 = +x right, PI/2 = front), height s (0 eave .. 1 crown), count, spread (rad)]
const MOSS = [[Math.PI * 0.93, 0.03, 7, 0.17], [Math.PI * 0.3, 0.04, 5, 0.09], [Math.PI * 0.7, 0.46, 4, 0.13],
  [Math.PI * 0.52, 0.18, 3, 0.05], [-Math.PI * 0.35, 0.06, 5, 0.14], [-Math.PI * 0.8, 0.28, 4, 0.1], [Math.PI * 0.1, 0.3, 3, 0.07]];
function hatRing(s) {                         // s: 0 eave .. 1 crown
  const t = 1 - s, f = Math.pow(t, 1.6);
  return {
    y: HAT.y0 + (HAT.y1 - HAT.y0) * s,
    hx: HAT.r1 + (HAT.hx0 - HAT.r1) * f, hz: HAT.r1 + (HAT.hz0 - HAT.r1) * f,
    cx: SHEAR * EAVE_WALL * t - 0.3 * s * s, cz: HAT.cz - 0.06 * s, p: 2 + 3.2 * t,
  };
}
const sePt = (th, hx, hz, p) => {
  const c = Math.cos(th), s = Math.sin(th);
  return [hx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), hz * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)];
};
// ---- hand-painted roof shading (docs/TOWN_LEARNINGS.md house-1): the gameplay sun (TOWN_TOD noon relAz 150,
// elev 50 at yaw 0) with a lowered elevation so the flanks separate; VIEW = towards the gameplay camera.
// Both follow the camera yaw at BUILD time (the town sun is camera-relative, so the paint matches at every
// static 45 deg stop; house-1 faces south, so its local frame is the world frame).
const PAINT_L = new THREE.Vector3(), VIEW = new THREE.Vector3();
function setPaintYaw(yaw) {
  const R = [Math.cos(yaw), -Math.sin(yaw)], B = [Math.sin(yaw), Math.cos(yaw)];   // camera right / toward camera (x, z)
  PAINT_L.set(-0.8 * R[0] + 0.42 * B[0], 0.42, -0.8 * R[1] + 0.42 * B[1]).normalize();
  VIEW.set(0.866 * B[0], 0.5, 0.866 * B[1]);
}
const hexLerp = hexMix;
const _painted = new Map();
/** Ramp `name` shifted down 0 / 1 / 2 steps by how much `nrm` faces the painted light. */
function painted(name, nrm) {
  const d = nrm.dot(PAINT_L);
  const step = d > 0.66 ? 0 : d > 0.14 ? 1 : 2;
  const key = name + step;
  if (!_painted.has(key)) {
    const [hi, mid, sh] = PAL[name];
    const deep = hexLerp(sh, '#2A3446', 0.35);
    _painted.set(key, step === 0 ? [hi, mid, sh] : step === 1 ? [hexLerp(hi, mid, 0.6), hexLerp(mid, sh, 0.45), sh] : [hexLerp(mid, sh, 0.6), sh, deep]);
  }
  return _painted.get(key);
}
/** front surface z of the hat at local (x, y) (for the dormer). */
function hatFrontZ(x, y) {
  const s = Math.max(0, Math.min(1, (y - HAT.y0) / (HAT.y1 - HAT.y0)));
  const R = hatRing(s), u = Math.min(1, Math.abs(x - R.cx) / R.hx);
  return R.cz + R.hz * Math.pow(1 - Math.pow(u, R.p), 1 / R.p);
}

export default function build(engine, ctx) {
  const rec = ctx.record, fr = frameOf(rec);
  setPaintYaw(engine.camera?.yaw ?? 0);
  const r = rng(ctx.seed * 13 + 1);
  const b = new Builder(engine, { name: rec.id });
  const glassMark = () => (b.layers.glass ? b.layers.glass.pos.length / 3 : 0);
  const litRanges = [];                       // glass vertex ranges that go dark with setLit(false)
  const lit = (fn) => { const a = glassMark(); const out = fn(); litRanges.push([a, glassMark()]); return out; };
  const box3 = (x0, x1, y0, y1, z0, z1, o) => b.box(x1 - x0, y1 - y0, z1 - z0, { ...o, at: [(x0 + x1) / 2, y0, (z0 + z1) / 2] });

  // ================================================================================== body (sheared frame)
  b.push(shearM());
  const plaster = { tones: 'plaster', pattern: 'plaster' };
  const rubble = { tones: 'stone', pattern: 'rubble' };
  // plinth of fieldstone, 1 texel proud of the plaster all round (split at the door)
  const P = 0.04, BY = -0.08;
  box3(-WX - P, -DR - 0.14, BY, BASE, ZF - WT, ZF + P, rubble);
  box3(DR + 0.14, WX + P, BY, BASE, ZF - WT, ZF + P, rubble);
  box3(-WX - P, WX + P, BY, BASE, ZB - P, ZB + WT, rubble);
  box3(-WX - P, -WX + WT, BY, BASE, ZB + WT, ZF - WT, rubble);
  box3(WX - WT, WX + P, BY, BASE, ZB + WT, ZF - WT, rubble);
  // plaster walls (front split around the arched door)
  box3(-WX, -DR, 0.3, EAVE_WALL, ZF - WT, ZF, plaster);
  box3(DR, WX, 0.3, EAVE_WALL, ZF - WT, ZF, plaster);
  const archTop = DOOR.spring + DR + 0.02;
  box3(-DR, DR, archTop, EAVE_WALL, ZF - WT, ZF, plaster);
  const ARC = 8;
  for (let i = 0; i < ARC; i++) {             // spandrels between the semicircle and the flat wall above
    const a0 = (Math.PI * i) / ARC, a1 = (Math.PI * (i + 1)) / ARC;
    const p0 = [DR * Math.cos(a0), DOOR.spring + DR * Math.sin(a0)], p1 = [DR * Math.cos(a1), DOOR.spring + DR * Math.sin(a1)];
    b.hexa([V3(p0[0], p0[1], ZF - WT), V3(p1[0], p1[1], ZF - WT), V3(p0[0], archTop, ZF - WT), V3(p1[0], archTop, ZF - WT),
      V3(p0[0], p0[1], ZF), V3(p1[0], p1[1], ZF), V3(p0[0], archTop, ZF), V3(p1[0], archTop, ZF)], plaster);
  }
  box3(-WX, WX, 0.3, EAVE_WALL, ZB, ZB + WT, plaster);
  box3(-WX, -WX + WT, 0.3, EAVE_WALL, ZB + WT, ZF - WT, plaster);
  box3(WX - WT, WX, 0.3, EAVE_WALL, ZB + WT, ZF - WT, plaster);
  // dark interior seen through the open door (glows like a hearth at night)
  lit(() => b.box(1.3, 2.3, 0.02, { at: [0, 0, -0.2], tones: '#2A1A20', layer: 'glass', glow: PAL.fireGlow, glowKind: 2 }));
  box3(-0.65, 0.65, 0, 0.03, -0.2, ZF - WT, { tones: 'timber', tint: 0.94 });

  // ashlar arch + jambs around the door, 2 texels proud
  const ash = (i) => ({ tones: 'ashlar', pattern: 'none', tint: i % 2 ? 0.96 : 1.03 });
  const AZ0 = ZF - 0.02, AZ1 = ZF + 0.06, RO = DR + 0.14;
  const VOUS = 7;
  for (let i = 0; i < VOUS; i++) {
    const a0 = (Math.PI * i) / VOUS, a1 = (Math.PI * (i + 1)) / VOUS;
    const pin = (a) => [DR * Math.cos(a), DOOR.spring + DR * Math.sin(a)], pout = (a) => [RO * Math.cos(a), DOOR.spring + RO * Math.sin(a)];
    const c = [pin(a0), pin(a1), pout(a0), pout(a1)];
    b.hexa([V3(c[0][0], c[0][1], AZ0), V3(c[1][0], c[1][1], AZ0), V3(c[2][0], c[2][1], AZ0), V3(c[3][0], c[3][1], AZ0),
      V3(c[0][0], c[0][1], AZ1), V3(c[1][0], c[1][1], AZ1), V3(c[2][0], c[2][1], AZ1), V3(c[3][0], c[3][1], AZ1)], ash(i));
  }
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
    const y0 = (DOOR.spring * j) / 3, y1 = (DOOR.spring * (j + 1)) / 3;
    const wj = j % 2 ? 0.14 : 0.18;
    box3(s < 0 ? -DR - wj : DR, s < 0 ? -DR : DR + wj, y0, y1, AZ0, AZ1, ash(j + (s > 0 ? 1 : 0)));
  }

  // crooked timbers (front): corner + bay posts, sill rail on the plinth, wall plate, knee braces
  const TB = { tones: 'timber', pattern: 'none' };
  const TZ0 = ZF - 0.02, TZ1 = ZF + 0.05;
  for (const px of [-WX + 0.06, -0.78, 0.78, WX - 0.06]) box3(px - 0.065, px + 0.065, BASE, EAVE_WALL, TZ0, TZ1, TB);
  box3(-WX, -DR - 0.12, BASE - 0.02, BASE + 0.1, TZ0, TZ1 - 0.02, TB);
  box3(DR + 0.12, WX, BASE - 0.02, BASE + 0.1, TZ0, TZ1 - 0.02, TB);
  box3(-WX, WX, EAVE_WALL - 0.16, EAVE_WALL, TZ0, TZ1 + 0.01, TB);
  const brace = (ax, ay, cx, cy) => {
    const len = Math.hypot(cx - ax, cy - ay), ang = Math.atan2(cy - ay, cx - ax);
    b.box(len, 0.1, TZ1 - TZ0 - 0.03, { ...TB, origin: 'center', at: [(ax + cx) / 2, (ay + cy) / 2, (TZ0 + TZ1 - 0.03) / 2], rz: ang });
  };
  brace(-WX + 0.12, 1.9, -WX + 0.58, 2.36);
  brace(WX - 0.12, 1.9, WX - 0.58, 2.36);
  // timbers on the back wall
  b.push(M({ ry: Math.PI }));
  for (const px of [-WX + 0.06, -0.8, 0.8, WX - 0.06]) box3(px - 0.065, px + 0.065, BASE, EAVE_WALL, -ZB - 0.02, -ZB + 0.05, TB);
  box3(-WX, WX, EAVE_WALL - 0.16, EAVE_WALL, -ZB - 0.02, -ZB + 0.06, TB);
  box3(-WX, WX, BASE - 0.02, BASE + 0.1, -ZB - 0.02, -ZB + 0.03, TB);
  b.pop();
  // timbers on the side walls: in the ry(+-90) frame the wall face is at local z = WX, local x runs along the depth
  for (const s of [-1, 1]) {
    b.push(M({ ry: s * Math.PI / 2 }));
    const zc = -s * (ZF + ZB) / 2, hd = (ZF - ZB) / 2;
    for (const px of [zc - hd + 0.06, zc, zc + hd - 0.06]) box3(px - 0.065, px + 0.065, BASE, EAVE_WALL, WX - 0.02, WX + 0.05, TB);
    box3(zc - hd, zc + hd, EAVE_WALL - 0.16, EAVE_WALL, WX - 0.02, WX + 0.06, TB);
    box3(zc - hd, zc + hd, BASE - 0.02, BASE + 0.1, WX - 0.02, WX + 0.03, TB);
    b.pop();
  }

  // ---- diamond-leaded window (left bay) + potion bottles on the sill
  const windows = [];
  {
    const cx = -1.48, sill = 1.0, w = 0.78, h = 0.72, z = ZF;
    lit(() => b.box(w, h, 0.02, { at: [cx, sill, z + 0.005], tones: 'glass', layer: 'glass', glow: PAL.glow[1], glowKind: 1 }));
    const FR = { tones: 'timber', pattern: 'none', tint: 0.94 };
    box3(cx - w / 2 - 0.07, cx + w / 2 + 0.07, sill + h, sill + h + 0.07, z - 0.01, z + 0.06, FR);
    box3(cx - w / 2 - 0.07, cx - w / 2, sill, sill + h, z - 0.01, z + 0.06, FR);
    box3(cx + w / 2, cx + w / 2 + 0.07, sill, sill + h, z - 0.01, z + 0.06, FR);
    box3(cx - w / 2 - 0.12, cx + w / 2 + 0.12, sill - 0.07, sill, z - 0.01, z + 0.14, { tones: 'stone', pattern: 'none', tint: 1.04 });
    // leading: 45 deg cames clipped to the pane
    const dS = 0.2, lw = 0.04;
    for (const dir of [1, -1]) {
      for (let c = -1.187; c <= 1.2; c += dS) {
        const pts = [];
        const yAt = (x) => dir * x + c, xAt = (y) => (y - c) * dir;
        for (const x of [-w / 2, w / 2]) { const y = yAt(x); if (y >= 0 && y <= h) pts.push([x, y]); }
        for (const y of [0, h]) { const x = xAt(y); if (x > -w / 2 && x < w / 2) pts.push([x, y]); }
        if (pts.length < 2) continue;
        const [p0, p1] = pts;
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (len < 0.06) continue;
        b.box(len, lw, 0.02, { tones: 'iron', pattern: 'none', layer: 'soft', origin: 'center', at: [cx + (p0[0] + p1[0]) / 2, sill + (p0[1] + p1[1]) / 2, z + 0.025], rz: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) });
      }
    }
    const bc = ['#5E9A86', PAL.flowerViolet, PAL.bannerBlue, PAL.bannerGold];
    for (let k = 0; k < 4; k++) {
      const bx = cx - 0.27 + k * 0.18, bh = [0.16, 0.12, 0.18, 0.11][k];
      b.box(0.08, bh, 0.08, { tones: bc[k], at: [bx, sill, z + 0.08] });
      b.box(0.04, 0.05, 0.04, { tones: 'cream', at: [bx, sill + bh, z + 0.08] });
    }
    windows.push({ id: 'diamond', pos: V3(cx + SHEAR * (sill + h / 2), sill + h / 2, z + 0.3) });
  }
  // ---- round window: ring, glass disc, cross bar (on a +z wall of the current frame)
  const roundWin = (cx, cy, z, rg, ro, ringTones, segs = 16) => {
    b.push(M({ at: [cx, cy, z - 0.02], rx: Math.PI / 2 }));
    b.cylinder(ro, ro, 0.08, { segments: segs, tones: ringTones, pattern: 'none', ry: Math.PI / segs });
    b.pop();
    lit(() => {
      b.push(M({ at: [cx, cy, z + 0.055], rx: Math.PI / 2 }));
      b.cylinder(rg, rg, 0.02, { segments: segs, tones: 'glass', layer: 'glass', glow: PAL.glow[1], glowKind: 1, ry: Math.PI / segs });
      b.pop();
    });
    b.box(rg * 2, 0.04, 0.03, { tones: 'timber', at: [cx, cy - 0.02, z + 0.075] });
    b.box(0.04, rg * 2, 0.03, { tones: 'timber', at: [cx, cy - rg, z + 0.075] });
  };
  roundWin(1.48, 1.45, ZF, 0.25, 0.36, 'stone');
  windows.push({ id: 'porthole', pos: V3(1.48 + SHEAR * 1.45, 1.45, ZF + 0.3) });

  // ---- side + back windows (small, for the turntables / iso)
  b.push(M({ ry: -Math.PI / 2 }));             // left wall (-x)
  roundWin((ZF + ZB) / 2, 1.5, WX, 0.2, 0.3, 'stone');
  b.pop();
  b.push(M({ ry: Math.PI }));
  lit(() => b.box(0.5, 0.6, 0.02, { at: [0.9, 1.1, -ZB + 0.005], tones: 'glass', layer: 'glass', glow: PAL.glow[1] }));
  box3(0.6, 1.2, 1.7, 1.77, -ZB - 0.01, -ZB + 0.06, TB);
  box3(0.6, 1.2, 1.03, 1.1, -ZB - 0.01, -ZB + 0.12, { tones: 'stone', pattern: 'none' });
  b.pop();

  // ---- wall lantern on the left door post (+ light anchor)
  // (own lantern, not kit.lantern: amber panes that read by day, a brass cap + finial, a bigger warm pool)
  const lan = (() => {
    const x = -0.78, y = 1.94, z = ZF + 0.05;
    b.box(0.05, 0.05, 0.28, { tones: 'iron', at: [x, y + 0.14, z + 0.14] });                       // bracket arm
    b.box(0.04, 0.12, 0.04, { tones: 'iron', at: [x, y + 0.04, z + 0.27] });                       // hanger
    b.box(0.2, 0.04, 0.2, { tones: 'brass', tint: 0.9, at: [x, y - 0.2, z + 0.27] });              // drip plate
    lit(() => b.box(0.14, 0.2, 0.14, { tones: ['#F4D890', '#D8A850', '#8A6A4A'], layer: 'glass', glow: PAL.lampGlow, glowKind: 2, at: [x, y - 0.16, z + 0.27] }));
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.03, 0.2, 0.03, { tones: 'iron', at: [x + cx * 0.075, y - 0.16, z + 0.27 + cz * 0.075] });
    b.hexa([V3(x - 0.13, y + 0.04, z + 0.14), V3(x + 0.13, y + 0.04, z + 0.14), V3(x - 0.03, y + 0.14, z + 0.24), V3(x + 0.03, y + 0.14, z + 0.24),
      V3(x - 0.13, y + 0.04, z + 0.4), V3(x + 0.13, y + 0.04, z + 0.4), V3(x - 0.03, y + 0.14, z + 0.3), V3(x + 0.03, y + 0.14, z + 0.3)], { tones: 'brass', tint: 0.92 });
    b.box(0.05, 0.05, 0.05, { tones: 'cream', at: [x, y + 0.14, z + 0.27] });                     // finial: daytime highlight
    return { pos: V3(x + SHEAR * y, y - 0.2, z + 0.45), color: PAL.lampGlow, r: 3.8, kind: 'lantern' };
  })();

  // ---- herb bundles (left eave) and bottle charms (right eave)
  for (const [hx, len] of [[-2.0, 0.3], [-1.82, 0.24]]) {
    b.box(0.035, 0.08, 0.035, { tones: 'thatch', at: [hx, EAVE_WALL - 0.24, ZF + 0.12] });
    b.box(0.1, len, 0.08, { tones: 'leaf', layer: 'soft', at: [hx, EAVE_WALL - 0.24 - len, ZF + 0.12] });
  }
  const charms = [['#5E9A86', 0.2], [PAL.flowerViolet, 0.3], [PAL.bannerBlue, 0.24]];
  charms.forEach(([col, len], k) => {
    const hx = 1.86 + k * 0.17;
    b.box(0.035, len, 0.035, { tones: 'iron', at: [hx, EAVE_WALL - 0.16 - len, ZF + 0.1] });
    b.box(0.08, 0.11, 0.08, { tones: col, at: [hx, EAVE_WALL - 0.16 - len - 0.11, ZF + 0.1] });
  });
  b.pop();                                      // ---- end of the sheared frame

  // ================================================================================== the witch-hat roof
  const hat = buildHat(b, r, b);
  // dormer on the left slope with a round window
  let dormerPerch;
  {
    const dx = -1.05, y0 = 3.2, y1 = 3.78, w = 0.66;
    const zf = hatFrontZ(dx - w / 2, y0) + 0.08;
    box3(dx - w / 2, dx + w / 2, y0, y1, HAT.cz, zf, plaster);
    gableRoof(b, { x: dx, z: (zf + HAT.cz) / 2 + 0.06, w: zf - HAT.cz + 0.12, d: w, eave: y1, ridge: y1 + 0.36, axis: 'z', overhang: 0.1,
      gableOverhang: 0.07, tones: 'copper', pattern: 'none', gable: 'plaster', seed: ctx.seed + 3 });
    roundWin(dx, (y0 + y1) / 2 - 0.02, zf, 0.13, 0.2, 'timber', 8);
    windows.push({ id: 'dormer', pos: V3(dx, (y0 + y1) / 2, zf + 0.3) });
    dormerPerch = V3(dx, y1 + 0.42, zf);
  }

  // ================================================================================== zig-zag brick chimney (right)
  const chimneys = [];
  let chimTop;
  {
    const zc = -0.55, w = 0.42;
    const segs = [[1.42, 2.4, 4.25], [1.56, 4.25, 4.8], [1.76, 4.8, 5.32], [1.6, 5.32, 5.84]];
    segs.forEach(([x, y0, y1], i) => {
      b.box(w, y1 - y0, w, { tones: 'brick', pattern: 'brick', at: [x, y0, zc] });
      if (i > 0) b.box(w + 0.08, 0.05, w + 0.08, { tones: 'iron', pattern: 'none', at: [x, y0 - 0.01, zc] });   // soot ledge
    });
    const [tx, , ty] = segs[segs.length - 1];
    b.box(w + 0.14, 0.12, w + 0.14, { tones: 'stone', pattern: 'none', tint: 1.04, at: [tx, ty, zc] });
    b.cylinder(0.08, 0.07, 0.22, { at: [tx - 0.08, ty + 0.12, zc], tones: 'red' });
    b.cylinder(0.07, 0.06, 0.16, { at: [tx + 0.1, ty + 0.12, zc + 0.04], tones: 'red', tint: 0.96 });
    chimneys.push(V3(tx - 0.08, ty + 0.36, zc), V3(tx + 0.1, ty + 0.3, zc + 0.04));
    chimTop = V3(tx + 0.18, ty + 0.14, zc);
  }

  // ================================================================================== yard (front strip z 1.34..1.98)
  // step stone in front of the door + path flag + doormat on the door tile (<= 0.4 m deep, flat)
  box3(-0.56, 0.56, -0.04, 0.1, ZF, ZF + 0.42, { tones: 'ashlar', pattern: 'none', tint: 0.98 });
  box3(-0.5, 0.5, -0.04, 0.05, ZF + 0.42, 1.97, { tones: 'stone', pattern: 'none', tint: 1.02 });
  box3(-0.42, 0.42, 0, 0.03, 2.03, 2.36, { tones: 'thatch', pattern: 'none', layer: 'soft', tint: 0.96 });
  // cauldron on a fire (left)
  const caul = { x: -1.55, z: 1.66 };
  {
    const { x, z } = caul;
    const L = 0.2;                                           // legs lift the pot so the fire shows under it
    for (const [lx, lz] of [[-0.17, -0.1], [0.17, -0.1], [0, 0.19]]) b.box(0.05, L + 0.04, 0.05, { tones: 'iron', at: [x + lx, 0, z + lz] });
    b.box(0.5, 0.07, 0.09, { tones: 'trunk', at: [x, 0, z], ry: 0.55 });
    b.box(0.5, 0.07, 0.09, { tones: 'trunk', at: [x, 0, z], ry: -0.55 });
    const fire = { tones: PAL.pumpkin, layer: 'glass', glow: PAL.fireGlow, glowKind: 2 };
    b.box(0.2, 0.1, 0.12, { ...fire, at: [x, 0.05, z + 0.02] });
    b.box(0.07, 0.1, 0.07, { ...fire, at: [x - 0.06, 0.12, z + 0.08] });
    b.box(0.06, 0.08, 0.06, { ...fire, at: [x + 0.07, 0.12, z + 0.06], tint: 1.04 });
    b.cylinder(0.17, 0.28, 0.15, { segments: 8, at: [x, L, z], tones: 'iron' });
    b.cylinder(0.28, 0.25, 0.15, { segments: 8, at: [x, L + 0.15, z], tones: 'iron' });
    b.cylinder(0.28, 0.28, 0.03, { segments: 8, at: [x, L + 0.3, z], tones: 'iron', tint: 1.05 });
    b.cylinder(0.22, 0.22, 0.035, { segments: 8, at: [x, L + 0.32, z], tones: 'mossTuft' });   // brew, brim-full
  }
  // besom broom leaning on the wall right of the door
  {
    b.push(M({ at: [0.72, 0.02, ZF + 0.18], rz: -0.17 }));
    b.box(0.07, 1.5, 0.07, { tones: 'plank', at: [0, 0.3, 0] });
    b.box(0.1, 0.07, 0.1, { tones: 'iron', at: [0, 0.4, 0] });
    b.hexa([V3(-0.2, 0, -0.08), V3(0.2, 0, -0.08), V3(-0.06, 0.44, -0.05), V3(0.06, 0.44, -0.05),
      V3(-0.2, 0, 0.08), V3(0.2, 0, 0.08), V3(-0.06, 0.44, 0.05), V3(0.06, 0.44, 0.05)], { tones: 'thatch', layer: 'soft', pattern: 'thatch' });
    b.pop();
  }
  // pumpkins (right; the big one carved, glowing at night)
  const pumpkin = (x, z, rr, h, carved) => {
    const pk = { segments: 8, tones: PAL.pumpkin, pattern: 'vboards', scale: 0.5 };
    b.cylinder(rr * 0.6, rr, h * 0.3, { ...pk, at: [x, 0, z] });
    b.cylinder(rr, rr, h * 0.4, { ...pk, at: [x, h * 0.3, z] });
    b.cylinder(rr, rr * 0.55, h * 0.3, { ...pk, at: [x, h * 0.7, z] });
    b.box(0.04, 0.07, 0.04, { tones: 'leaf', at: [x, h, z] });
    if (carved) {
      const fz = z + rr * 0.92 + 0.012;
      const face = { tones: ['#32283A', '#32283A', '#2A2834'], layer: 'glass', glow: PAL.fireGlow, glowKind: 2 };
      lit(() => {
        b.box(0.08, 0.07, 0.02, { ...face, at: [x - 0.08, h * 0.52, fz] });
        b.box(0.08, 0.07, 0.02, { ...face, at: [x + 0.08, h * 0.52, fz] });
        b.box(0.22, 0.06, 0.02, { ...face, at: [x, h * 0.22, fz] });
      });
    }
  };
  pumpkin(1.24, 1.66, 0.25, 0.36, true);
  pumpkin(1.68, 1.72, 0.14, 0.2, false);
  pumpkin(2.02, 1.62, 0.12, 0.17, false);
  // toadstools
  for (const [mx, mz, s] of [[-2.25, 1.75, 1], [2.32, 1.78, 0.8], [-0.95, 1.8, 0.7]]) {
    b.box(0.05 * s + 0.02, 0.1 * s, 0.05 * s + 0.02, { tones: PAL.ivory, at: [mx, 0, mz] });
    b.box(0.16 * s, 0.06, 0.16 * s, { tones: PAL.toadstool, at: [mx, 0.1 * s, mz] });
    b.box(0.04, 0.025, 0.04, { tones: PAL.ivory, at: [mx - 0.03, 0.1 * s + 0.06, mz + 0.03] });
  }
  // woodpile in the back half of the left side apron (x 13): short rounds stacked 3 rows with their cut ends
  // toward the camera (logs along z read as vertical pipes from the 30 deg camera), under a lean-to board.
  {
    const zF = -0.62, D = 0.4, R = 0.1;                       // front face of the stack, log length, radius
    const oct = (rr) => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return [rr * Math.cos(a), rr * Math.sin(a)]; });
    const rows = [[-3.17, -2.95, -2.73, -2.51], [-3.06, -2.84, -2.62], [-2.95, -2.73]];
    const wr = rng(ctx.seed + 51);
    rows.forEach((row, ri) => row.forEach((lx) => {
      const ly = R + ri * 0.18, dz = (wr() - 0.5) * 0.06;
      b.prism(oct(R), D, { tones: 'trunk', at: [lx, ly, zF - D / 2 + dz] });
      b.prism(oct(R * 0.72), 0.02, { tones: 'daub', tint: wr() < 0.5 ? 1.03 : 0.97, at: [lx, ly, zF + dz + 0.005] });
    }));
    // lean-to: two posts + a sloping plank board from the wall plate down over the stack
    for (const pz of [zF - D + 0.02, zF - 0.02]) b.box(0.06, 0.72, 0.06, { tones: 'timber', at: [-3.3, 0, pz] });
    const yA = 0.98, yB = 0.72, xA = -WX - 0.02, xB = -3.38;
    b.hexa([V3(xB, yB, zF - D - 0.06), V3(xA, yA, zF - D - 0.06), V3(xB, yB + 0.05, zF - D - 0.06), V3(xA, yA + 0.05, zF - D - 0.06),
      V3(xB, yB, zF + 0.1), V3(xA, yA, zF + 0.1), V3(xB, yB + 0.05, zF + 0.1), V3(xA, yA + 0.05, zF + 0.1)], { tones: 'plank', pattern: 'boards' });
    b.box(0.25, 0.04, 0.05, { tones: 'iron', at: [-2.85, 0.58, zF + 0.04] });                    // hatchet head
    b.box(0.04, 0.04, 0.28, { tones: 'plank', at: [-2.78, 0.58, zF - 0.05] });
  }

  const group = b.build();
  const glassMesh = group.children.find((o) => o.userData.layer === 'glass');

  // ================================================================================== moss clumps on the hat
  // leaf-sprite cushions (createTree 'bush', the research foliage look) in clusters, sunk into the courses; the
  // cluster centres keep their blob core (casts a little shadow onto the shingles; the small end cushions are
  // sprites only, to keep the tri count down), the leaves are 1 merged sprite mesh (2 draw calls)
  {
    const mr = rng(ctx.seed * 7 + 5);
    const pal = { hi: PAL.mossTuft[0], mid: PAL.mossTuft[1], sh: PAL.moss[1], core: PAL.moss[2], tip: PAL.mossTuft[0] };
    const specs = [];
    let seed = 1101;
    for (const [ang, s0, count, spread] of MOSS) {
      for (let c = 0; c < count; c++) {
        const th = ang + (count > 1 ? (c / (count - 1) - 0.5) * 2 * spread : 0) + (mr() - 0.5) * spread * 0.5;
        // the middle of a cluster is biggest and sits lowest (toward the eave); the ends are small and climb a course
        const mid = count > 1 ? 1 - Math.abs(c / (count - 1) - 0.5) * 2 : 1;
        const s = Math.min(0.9, s0 + (1 - mid) * 0.05 + mr() * 0.04);
        const R = hatRing(s), [px, pz] = sePt(th, R.hx + 0.06, R.hz + 0.06, R.p);
        const rad = (0.075 + 0.06 * mid + mr() * 0.03) * (1 - 0.4 * s);
        // half-buried: the blob centre (rad * 0.55 above `at`) ends up just above the shingles = a low cushion
        specs.push({ kind: 'bush', seed: seed++, radius: rad, jitter: 0.04, noCore: mid < 0.5, at: V3(R.cx + px, R.y - rad * 0.5 + 0.03, R.cz + pz) });
      }
    }
    const lb = new THREE.Box3(V3(-HAT.hx0 - 0.5, HAT.y0 - 0.5, HAT.cz - HAT.hz0 - 0.5), V3(HAT.hx0 + 0.5, HAT.y1 + 0.5, HAT.cz + HAT.hz0 + 0.5));
    for (const m of leafClumps(engine, specs, pal)) {
      m.name = `${rec.id}-moss-${m.name}`; group.add(m);
      if (m.geometry.isInstancedBufferGeometry) { m.geometry.boundingBox = lb.clone(); m.geometry.boundingSphere = lb.getBoundingSphere(new THREE.Sphere()); }
    }
  }

  // ================================================================================== the door (own meshes)
  const doorB = new Builder(engine, { name: `${rec.id}-door` });
  doorB.push(shearM());
  {
    // leaf in pivot space: hinge (right) at x = 0, leaf spans x -w..0
    const pts = [[-DOOR.w, 0], [0, 0], [0, DOOR.spring]];
    for (let i = 1; i < 8; i++) { const a = (Math.PI * i) / 8; pts.push([-DR + DR * Math.cos(a), DOOR.spring + DR * Math.sin(a)]); }
    pts.push([-DOOR.w, DOOR.spring]);
    doorB.prism(pts, 0.06, { tones: PAINT_DOOR, pattern: 'vboards', scale: 0.6 });
    for (const hy of [0.4, 1.35]) doorB.box(0.62, 0.06, 0.03, { tones: 'iron', at: [-0.3, hy, 0.04] });          // strap hinges
    doorB.box(0.07, 0.07, 0.05, { tones: 'brass', at: [-DOOR.w + 0.16, 0.95, 0.05] });                           // ring handle
    // the crescent-moon cut-out (glows at night)
    const mx = -DR, my = 1.62, moon = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * 0.5 + (Math.PI * i) / 6; moon.push([mx + 0.13 * Math.cos(a), my + 0.13 * Math.sin(a)]); }
    for (let i = 6; i >= 0; i--) { const a = Math.PI * 0.5 + (Math.PI * i) / 6; moon.push([mx + 0.05 + 0.1 * Math.cos(a), my + 0.11 * Math.sin(a)]); }
    doorB.prism(moon, 0.03, { tones: 'glass', layer: 'glass', glow: PAL.glow[0], glowKind: 1, at: [0, 0, 0.025] });
  }
  doorB.pop();
  const leaf = doorB.build({ name: `${rec.id}-door` });
  const pivot = new THREE.Group(); pivot.name = `${rec.id}-door-pivot`;
  pivot.add(leaf);
  pivot.position.set(DR, 0.0, ZF - 0.09);
  group.add(pivot);
  const openDoor = (f) => { pivot.rotation.y = -Math.max(0, Math.min(1, f)) * 1.75; };
  const doorGlass = leaf.children.find((o) => o.userData.layer === 'glass');

  // ================================================================================== bubbles (animated, 3 frames)
  const bub = new Builder(engine, { name: `${rec.id}-bubbles` });
  const frames = [];
  {
    const br = rng(ctx.seed + 77);
    for (let f = 0; f < 3; f++) {
      const a = bub._layer('solid').pos.length / 3;
      for (let k = 0; k < 3; k++) {
        const ang = br() * Math.PI * 2, rad = br() * 0.13, s = 0.05 + br() * 0.04;
        bub.box(s, s, s, { tones: 'mossTuft', tint: 1.05, at: [caul.x + Math.cos(ang) * rad, 0.545, caul.z + Math.sin(ang) * rad] });
      }
      frames.push([a, bub._layer('solid').pos.length / 3 - a]);
    }
  }
  const bubbles = bub.build({ castShadow: false });
  const bubMesh = bubbles.children[0];
  group.add(bubbles);
  const setFrame = (f) => { const [s, c] = frames[f]; bubMesh.geometry.setDrawRange(s, c); };
  setFrame(0);

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);

  const setLit = (on) => {
    const a = glassMesh?.geometry?.getAttribute('aGlow');
    if (a) {
      const keep = (glassMesh.userData.glowKinds ??= Float32Array.from({ length: a.count }, (_, i) => a.getW(i)));
      for (const [s, e] of litRanges) for (let i = s; i < e; i++) a.setW(i, on ? keep[i] : 0);
      a.needsUpdate = true;
    }
    if (doorGlass) setGlowLit(doorGlass, on);
  };

  const tip = hat.tipEnd;
  return {
    group,
    update(t) { setFrame(Math.floor(t * 4) % 3); },
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot, open: openDoor }],
      chimneys: chimneys.map(W3),
      windows: windows.map((w) => ({ id: w.id, mesh: glassMesh, pos: W3(w.pos) })),
      lights: [
        { ...lan, pos: W3(lan.pos), kind: 'lantern' },
        { pos: W3(V3(caul.x, 0.25, caul.z + 0.3)), color: PAL.fireGlow, r: 1.6, kind: 'fire', flicker: true },
        ...windows.slice(0, 2).map((w) => ({ pos: W3(w.pos), color: PAL.glow[1], r: 1.6, kind: 'window' })),
      ],
      perches: [W3(V3(tip.x, tip.y + 0.1, tip.z)), W3(chimTop), W3(dormerPerch)],
      spots: { doorstep: W3(V3(0, 0, 2.2)), cauldron: W3(V3(caul.x, 0.54, caul.z)), broom: W3(V3(0.68, 0, ZF + 0.16)) },
    },
    api: { setDoor: openDoor, setLit, setBubbles: setFrame },
    stats: { hatTris: hat.tris },
  };
}

// ---------------------------------------------------------------------------------------------- moss sprites
// (same technique as house-4's turf: createTree bushes, cores merged into one mesh, leaf sprites merged into one
// instanced mesh that re-sorts far -> near when the camera turns)
function mergeInstanced(engine, parts, { k = 1, name = 'sprites', renderOrder = 1 } = {}) {
  parts = parts.filter((p) => p.mesh);
  if (!parts.length) return null;
  const g0 = parts[0].mesh.geometry;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = g0.index;
  for (const a of ['position', 'uv', 'normal']) if (g0.attributes[a]) geo.setAttribute(a, g0.attributes[a]);
  const names = Object.keys(g0.attributes).filter((a) => g0.attributes[a].isInstancedBufferAttribute);
  const N = parts.reduce((s, p) => s + p.mesh.geometry.instanceCount, 0);
  const src = {};
  for (const a of names) {
    const sz = g0.attributes[a].itemSize, arr = new Float32Array(N * sz);
    let o = 0;
    for (const p of parts) {
      const g = p.mesh.geometry, n = g.instanceCount, A = g.attributes[a];
      arr.set(A.array.subarray(0, n * sz), o);
      if (a === 'aBase' && p.offset) for (let i = 0; i < n; i++) { arr[o + i * 3] += p.offset.x; arr[o + i * 3 + 1] += p.offset.y; arr[o + i * 3 + 2] += p.offset.z; }
      o += n * sz;
    }
    src[a] = arr;
    geo.setAttribute(a, new THREE.InstancedBufferAttribute(arr.slice(), sz));
  }
  geo.instanceCount = N;
  let last = '', mesh = null;
  const inv = new THREE.Matrix4(), f = new THREE.Vector3();
  const sort = () => {
    const c = engine.camera;
    if (mesh) mesh.updateWorldMatrix(true, false);
    const e = mesh ? mesh.matrixWorld.elements : null;
    const key = `${c.yaw.toFixed(4)},${c.pitch.toFixed(4)}` + (e ? `,${e[0].toFixed(4)},${e[2].toFixed(4)},${e[8].toFixed(4)}` : '');
    if (key === last) return;
    last = key;
    f.set(-Math.cos(c.pitch) * Math.sin(c.yaw), -Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw));
    if (mesh) f.transformDirection(inv.copy(mesh.matrixWorld).invert());
    const B = src.aBase, W = src.aVar, wsz = geo.attributes.aVar.itemSize;
    const d = new Float32Array(N), idx = Array.from({ length: N }, (_, i) => i);
    for (let i = 0; i < N; i++) d[i] = B[i * 3] * f.x + B[i * 3 + 1] * f.y + B[i * 3 + 2] * f.z - k * W[i * wsz + 3];
    idx.sort((a, b2) => d[b2] - d[a]);
    for (const a of names) {
      const sz = geo.attributes[a].itemSize, dst = geo.attributes[a].array, S = src[a];
      idx.forEach((from, to) => { for (let c2 = 0; c2 < sz; c2++) dst[to * sz + c2] = S[from * sz + c2]; });
      geo.attributes[a].needsUpdate = true;
    }
  };
  sort();
  engine.onUpdate(sort);
  mesh = new THREE.Mesh(geo, parts[0].mesh.material);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.renderOrder = renderOrder; mesh.name = name;
  return mesh;
}

function leafClumps(engine, specs, pal) {
  const cores = [], leaves = [];
  let coreMat = null;
  for (const sp of specs) {
    const before = engine._treeSorters ? engine._treeSorters.length : 0;
    const t = createTree(engine, { kind: sp.kind, seed: sp.seed, height: sp.height, radius: sp.radius, add: false, palette: pal, leafJitter: sp.jitter });
    if (engine._treeSorters) engine._treeSorters.length = before;          // the merged mesh sorts itself
    const core = t.getObjectByName('core'), lv = t.getObjectByName('leaves');
    if (core && !sp.noCore) {
      const g = core.geometry.clone();
      g.translate(sp.at.x, sp.at.y, sp.at.z);
      const lp = g.attributes.aLeafPos;
      if (lp) for (let i = 0; i < lp.count; i++) lp.setXYZ(i, lp.getX(i) + sp.at.x, lp.getY(i) + sp.at.y, lp.getZ(i) + sp.at.z);
      cores.push(g); coreMat = core.material;
    }
    if (lv) leaves.push({ mesh: lv, offset: sp.at });
  }
  const out = [];
  if (cores.length) {
    const cm = new THREE.Mesh(mergeGeometries(cores.map((g) => (g.index ? g.toNonIndexed() : g))), coreMat);
    cm.castShadow = true; cm.receiveShadow = true; cm.name = 'clump-core';
    out.push(cm);
  }
  const lm = mergeInstanced(engine, leaves, { k: 0.1, name: 'clump-leaves', renderOrder: 1 });
  if (lm) out.push(lm);
  return out;
}

// ---------------------------------------------------------------------------------------------- hat geometry
/** quad (a b c d in order around) as 2 tris, wound so the normal points along `out`. */
function quad(b, a, bb, c, d, out, opts) {
  const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a));
  const q = n.dot(out) >= 0 ? [a, bb, c, d] : [a, d, c, bb];
  const arr = [];
  for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) for (const p of [q[i], q[j], q[k]]) arr.push(p.x, p.y, p.z);
  b.tris(arr, opts);
}

/**
 * Patched shingles: 1-2 small replacement shingles per course (on the half that faces the gameplay camera, plus
 * one round the back for the turntables), each a thin plate lifted ~1 texel off its course along the profile
 * normal, spanning 55-75 % of the course height, 0.14-0.3 m wide (ragged: the two upper corners are pulled in by
 * different amounts), with a 1-texel deep-shadow strip under its lower edge so it reads as a slipped-in shingle.
 * Deterministic (own rng). Returns the triangle count.
 */
function hatPatches(b, courses, kMax) {
  const pr = rng(4241);
  const DEEP = hexLerp(PAL.copper[2], '#2A3446', 0.45);
  const SHADOW = [DEEP, DEEP, DEEP];
  const KINDS = [['plum', 1], ['copper', 1.22], ['copper', 0.72], ['plum', 0.9], ['red', 0.86], ['copper', 1.18], ['copper', 0.74], ['plum', 1.04]];
  let tris = 0, kind = 0;
  for (const C of courses) {
    if (C.k < 1 || C.k >= kMax) continue;
    const N = C.low.length, P = C.per[N];
    // point on the course at arc length u (lower edge) and height fraction v, lifted `lift` along the profile normal
    const at = (u, v, lift) => {
      u = ((u % P) + P) % P;
      let i = 0; while (i < N - 1 && C.per[i + 1] < u) i++;
      const j = (i + 1) % N, f = (u - C.per[i]) / (C.per[i + 1] - C.per[i]);
      const lo = C.low[i].clone().lerp(C.low[j], f), hi = C.top[i].clone().lerp(C.top[j], f);
      const p = lo.lerp(hi, v);
      const rad = V3(p.x - C.c0.x, 0, p.z - C.c0.z).normalize();
      return p.addScaledVector(rad, lift * Math.sin(C.al)).add(V3(0, lift * Math.cos(C.al), 0));
    };
    const segAt = (u) => { u = ((u % P) + P) % P; let i = 0; while (i < N - 1 && C.per[i + 1] < u) i++; return i; };
    // the course height (slant) for converting 1 texel into a v fraction
    const slant = C.low[0].distanceTo(C.top[0]) || 0.2;
    // arc length of the lower-edge point nearest to polar angle `ang` (around the course centre)
    const uOfAng = (ang) => {
      let best = 0, bd = 1e9;
      for (let i = 0; i < N; i++) {
        let d = Math.abs(Math.atan2(C.low[i].z - C.c0.z, C.low[i].x - C.c0.x) - ang) % (2 * Math.PI); d = Math.min(d, 2 * Math.PI - d);
        if (d < bd) { bd = d; best = C.per[i] + 0.5 * (C.per[i + 1] - C.per[i]); }
      }
      return best;
    };
    // 1-2 on the camera half (one per quarter, alternating which quarter gets the single one), 0-1 round the back
    const front = 1 + (pr() < 0.6 ? 1 : 0);
    const angs = [];
    // golden-ratio walk per course so consecutive courses never stack their patches into a column
    const g = (C.k * 0.618034 + 0.13) % 1, g2 = (g + 0.38 + 0.24 * pr()) % 1;
    angs.push(Math.PI * (0.1 + 0.8 * g));
    if (front === 2) angs.push(Math.PI * (0.1 + 0.8 * g2));
    if (pr() < 0.5) angs.push(-Math.PI * (0.1 + 0.8 * pr()));
    const used = [];
    for (const ang of angs) {
      const w = Math.min(0.2 + 0.16 * pr(), P / 9);
      const u0 = uOfAng(ang) + (pr() - 0.5) * 0.2, u1 = u0 + w;
      if (used.some((uu) => Math.abs(uu - u0) < 0.6)) continue;
      used.push(u0);
      const vb = 0.22 + 0.08 * pr(), vt = Math.min(0.96, vb + 0.55 + 0.2 * pr());
      const inL = 0.015 + 0.03 * pr(), inR = 0.015 + 0.03 * pr();     // ragged top corners
      const sh = Math.min(vb - 0.02, 1.6 * 0.034 / slant);         // ~1 texel of shadow below the patch
      const [base, tint] = KINDS[kind++ % KINDS.length];
      // split the patch at every facet boundary so each piece stays planar
      const cuts = [u0];
      for (let i = 0; i < N; i++) for (const wrap of [-P, 0, P]) { const c = C.per[i] + wrap; if (c > u0 + 1e-4 && c < u1 - 1e-4) cuts.push(c); }
      cuts.sort((x, y) => x - y); cuts.push(u1);
      for (let c = 0; c + 1 < cuts.length; c++) {
        const ua = cuts[c], ub = cuts[c + 1], fa = (ua - u0) / w, fb = (ub - u0) / w;
        const i = segAt((ua + ub) / 2);
        const nrm = new THREE.Vector3().subVectors(C.low[(i + 1) % N], C.low[i]).cross(new THREE.Vector3().subVectors(C.top[i], C.low[i])).normalize();
        const out = V3(C.low[i].x - C.c0.x, 0.5, C.low[i].z - C.c0.z);
        if (nrm.dot(out) < 0) nrm.negate();
        // shadow strip: course surface (lifted a hair) from vb - sh to vb, slightly wider than the patch on the right
        quad(b, at(ua, vb - sh, 0.012), at(ub + (c + 2 === cuts.length ? 0.02 : 0), vb - sh, 0.012),
          at(ub + (c + 2 === cuts.length ? 0.02 : 0), vb, 0.012), at(ua, vb, 0.012), out, { tones: SHADOW, pattern: 'none' });
        // the patch plate: top edge pulled in at the corners (lerp the inset across the patch)
        const ta = u0 + inL * (1 - fa) * 1 - inR * fa * 1 + (ua - u0), tb = u0 + inL * (1 - fb) - inR * fb + (ub - u0);
        const vtA = vt - 0.12 * Math.abs(fa - 0.4), vtB = vt - 0.12 * Math.abs(fb - 0.4);
        quad(b, at(ua, vb, 0.03), at(ub, vb, 0.03), at(tb, vtB, 0.03), at(ta, vtA, 0.03), out, { tones: painted(base, nrm), tint, pattern: 'none' });
        tris += 4;
      }
    }
  }
  return tris;
}

function buildHat(b, r, tb) {
  const N = HAT.N;
  // course boundaries at equal arc length along the front profile
  const S = 240, cum = [0];
  let prev = hatRing(0);
  for (let i = 1; i <= S; i++) {
    const q = hatRing(i / S);
    cum.push(cum[i - 1] + Math.hypot(q.hz + q.cz - prev.hz - prev.cz, q.y - prev.y));
    prev = q;
  }
  const total = cum[S], n = Math.max(6, Math.round(total / 0.27));
  const sAt = (len) => { let i = 1; while (i < S && cum[i] < len) i++; const f = (len - cum[i - 1]) / (cum[i] - cum[i - 1]); return (i - 1 + f) / S; };
  const ss = []; for (let k = 0; k <= n; k++) ss.push(k === n ? 1 : sAt((total * k) / n));
  const th = (i) => ((i + 0.5) * 2 * Math.PI) / N;
  const ringPts = (R, extra) => Array.from({ length: N }, (_, i) => { const [px, pz] = sePt(th(i), R.hx + extra, R.hz + extra, R.p); return V3(R.cx + px, R.y, R.cz + pz); });
  // Shingle cells are laid out by ARC LENGTH along each course and staggered half a shingle on odd courses, so
  // no cell boundary (or tone) lines up radially into "umbrella spokes". Every cell is copper with a small tint
  // jitter; the PATCHES (smaller replacement shingles, 1-2 per visible course, each with a 1-texel shadow under its
  // lower edge) and the MOSS (leaf-sprite cushions, see build) are separate geometry on top of the courses, so
  // nothing reads as big flat tone rectangles any more.
  // Tone per cell is PAINTED from its lit normal (hand-shaded like v1: upper-left flank = full ramp, front =
  // one step down, right flank = shadow tones) because the shallow cone otherwise sits in the hi band all round.
  // Per-cell variation fades out where the cell is seen edge-on (N.V small) so grazing flanks do not barcode.
  const cellTone = (k, u, s, nrm) => {
    const h = r();
    const nv = Math.abs(nrm.dot(VIEW));
    return { base: 'copper', tint: nv > 0.35 ? (h < 0.3 ? 0.97 : h > 0.82 ? 1.03 : 1) : 1 };
  };
  const courses = [];
  let tris = 0;
  let prevTop = null;
  const NOLEDGE = 3;                             // the top courses carry no ledge (it broke into dashes)
  for (let k = 0; k < n; k++) {
    const R0 = hatRing(ss[k]), R1 = hatRing(ss[k + 1]);
    // each course's lower edge stands off the course below along the profile normal (t3ssel8r stepped courses:
    // one dark line + one cream rim per course); shallow skirt courses lift mostly UP, steep crown courses OUT
    const Rd = hatRing(Math.min(1, ss[k] + 0.01)), al = Math.atan2(Rd.y - R0.y, Math.max(1e-4, (R0.hz - Rd.hz) + (R0.cz - Rd.cz)));
    const L = k === 0 ? 0.02 : k >= n - NOLEDGE ? 0 : HAT.lift + 0.03 * ss[k];
    const lift = L * Math.sin(al), up = k === 0 ? 0 : L * Math.cos(al);
    const low = ringPts(R0, lift).map((p) => {
      p.y += up;
      // the brim sags between the corners (v1: 'sagging witch-hat roof'), most at the front and back middles
      if (k === 0) { const u = (p.x - R0.cx) / (R0.hx + lift); p.y -= HAT.sag * (1 - u * u); }
      return p;
    });
    const lam = Math.min(R1.hx / (R0.hx + lift), R1.hz / (R0.hz + lift));
    const c0 = V3(R0.cx, R0.y, R0.cz), c1 = V3(R1.cx, R1.y, R1.cz);
    const top = low.map((p) => p.clone().sub(c0).multiplyScalar(lam).add(c1).setY(R1.y));
    // perimeter (arc length) of this course's lower edge
    const per = [0];
    for (let i = 0; i < N; i++) per.push(per[i] + low[i].distanceTo(low[(i + 1) % N]));
    const P = per[N], nc = Math.max(6, Math.round(P / 0.36)), cw = P / nc, off = (k % 2) * 0.5 * cw;
    const tonesOfCell = new Map();
    const cellOf = (u, nrm) => {
      const id = ((Math.floor((u - off) / cw) % nc) + nc) % nc;
      if (!tonesOfCell.has(id)) tonesOfCell.set(id, cellTone(k, (id + 0.5) * cw + off, ss[k], nrm));
      return tonesOfCell.get(id);
    };
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const out = V3(Math.cos(th(i + 0.5)), 0.4, Math.sin(th(i + 0.5)));
      const segL = per[i + 1] - per[i];
      // split the segment at every cell boundary inside it
      const cuts = [per[i]];
      for (let m = Math.ceil((per[i] - off) / cw); off + m * cw < per[i + 1]; m++) { const c = off + m * cw; if (c > per[i] + 1e-4) cuts.push(c); }
      cuts.push(per[i + 1]);
      for (let c = 0; c + 1 < cuts.length; c++) {
        const f0 = (cuts[c] - per[i]) / segL, f1 = (cuts[c + 1] - per[i]) / segL;
        if (f1 - f0 < 1e-4) continue;
        const A = low[i].clone().lerp(low[j], f0), B = low[i].clone().lerp(low[j], f1);
        const C = top[i].clone().lerp(top[j], f1), D = top[i].clone().lerp(top[j], f0);
        const nrm = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(D, A)).normalize();
        if (nrm.dot(out) < 0) nrm.negate();
        const ct = cellOf((cuts[c] + cuts[c + 1]) / 2, nrm);
        quad(b, A, B, C, D, out, { tones: painted(ct.base, nrm), tint: ct.tint, pattern: 'none' });
        tris += 2;
      }
      // underside lip from this course's lifted lower edge in to the course below (or the eave fascia)
      if (k === 0) {
        const a2 = low[i].clone().setY(low[i].y - 0.08), b2 = low[j].clone().setY(low[j].y - 0.08);
        quad(b, a2, b2, low[j], low[i], V3(out.x, 0, out.z), { tones: painted('copper', V3(out.x, 0, out.z).normalize()), tint: 0.95 });
        const ia = V3(c0.x, 0, c0.z);
        const inA = low[i].clone().sub(ia).multiplyScalar(0.94).add(ia).setY(a2.y);
        const inB = low[j].clone().sub(ia).multiplyScalar(0.94).add(ia).setY(b2.y);
        quad(b, a2, b2, inB, inA, V3(0, -1, 0), { tones: 'timber' });
        tris += 4;
      } else if (prevTop && L > 0) {
        quad(b, prevTop[i], prevTop[j], low[j], low[i], V3(0, -1, 0), { tones: 'copper', tint: 0.92 });
        tris += 2;
      }
    }
    courses.push({ k, low, top, per, c0, al, L });
    prevTop = top;
  }
  tris += hatPatches(b, courses, n - NOLEDGE);
  // ---- the curled tip: rings perpendicular to a path that rises then flops over to the left
  const R1 = hatRing(1);
  const C1 = V3(R1.cx, R1.y, R1.cz);
  const M2 = 12, T2 = 12;
  const path = (q) => V3(C1.x + 0.08 * q - 1.25 * Math.pow(q, 2.0), C1.y + 0.95 * Math.sin(0.6 * Math.PI * q) - 0.75 * Math.pow(q, 3.2), C1.z);
  const rad = (q) => (HAT.r1 + HAT.lift) * Math.pow(1 - q, 0.7) + 0.05;
  const az = V3(0, 0, 1);
  const rings = [];
  for (let m = 0; m <= M2; m++) {
    const q = m / M2, C = path(q);
    const T = m === 0 ? V3(0, 1, 0) : path(Math.min(1, q + 0.01)).sub(path(Math.max(0, q - 0.01))).normalize();
    const bx = new THREE.Vector3().crossVectors(T, az).normalize();
    // keep the tube radius under the bend radius (else the inner side of the curl self-intersects: z-fight crawl)
    const e = 0.02, Pm = path(Math.max(0, q - e)), Pp = path(Math.min(1, q + e)), P0 = path(q);
    const k2 = Pp.clone().add(Pm).sub(P0.clone().multiplyScalar(2)).length() / (e * e);
    const v2 = Pp.distanceTo(Pm) / (2 * e), kap = k2 / Math.max(1e-4, v2 * v2);
    const rr = Math.min(rad(q), 0.7 / Math.max(kap, 1e-3));
    rings.push({ C, T, pts: Array.from({ length: T2 }, (_, i) => { const a = ((i + 0.5) * 2 * Math.PI) / T2; return C.clone().addScaledVector(bx, rr * Math.cos(a)).addScaledVector(az, rr * Math.sin(a)); }) });
  }
  for (let m = 0; m < M2; m++) {
    const A = rings[m], B = rings[m + 1];
    for (let i = 0; i < T2; i++) {
      const j = (i + 1) % T2;
      const out = A.pts[i].clone().add(A.pts[j]).add(B.pts[i]).add(B.pts[j]).multiplyScalar(0.25).sub(A.C.clone().add(B.C).multiplyScalar(0.5));
      const h = r();
      const base = h < 0.04 ? 'plum' : 'copper';
      quad(tb, A.pts[i], A.pts[j], B.pts[j], B.pts[i], out, { tones: painted(base, out.clone().normalize()) });
      tris += 2;
    }
  }
  // end cap: a little cone
  const E = rings[M2], tipP = E.C.clone().addScaledVector(E.T, 0.08);
  for (let i = 0; i < T2; i++) {
    const j = (i + 1) % T2;
    const arr = [E.pts[i], E.pts[j], tipP];
    const n2 = new THREE.Vector3().subVectors(arr[1], arr[0]).cross(new THREE.Vector3().subVectors(arr[2], arr[0]));
    const tri = n2.dot(arr[0].clone().sub(E.C)) >= 0 ? arr : [arr[0], arr[2], arr[1]];
    tb.tris(tri.flatMap((p) => [p.x, p.y, p.z]), { tones: painted('copper', E.T.clone()) });
    tris++;
  }
  // the dangling star charm
  const sy = tipP.y - 0.34;
  tb.box(0.035, 0.3, 0.035, { tones: 'iron', at: [tipP.x, sy, C1.z] });
  tb.box(0.22, 0.07, 0.06, { tones: 'brass', at: [tipP.x, sy - 0.15, C1.z] });
  tb.box(0.07, 0.22, 0.06, { tones: 'brass', at: [tipP.x, sy - 0.23, C1.z] });
  return { tris, tipEnd: tipP };
}
