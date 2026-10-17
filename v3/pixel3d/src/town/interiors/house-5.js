// house-5 interior: Elderhollow Apothecary (owner: interiors 5-9 builder; LORE pass 2026-10-16). docs/INTERIORS.md, docs/LORE.md.
// The apothecary, and one poison bottle is missing. Precise, secretive.
//   ROOM: an L-shaped SHOP. The back-right quarter is a walled-off, locked dispensary: its plastered face steps forward
//   into the room and carries the glass-fronted POISON CABINET (dark bottles silhouetted on a sickly violet back panel;
//   one slot is empty, a pale dust ring where the bottle stood) and an iron-strapped door with a green-lit grille. A long
//   shop counter splits the shop: customers in front, the apothecary behind it with a floor-to-ceiling wall of little
//   labelled drawers and jewel-toned bottles (a rolling ladder against it). Teal panelling over walnut, a cream and
//   teal harlequin stone floor, no hearth.
//   STORY: the poison cabinet's empty slot; the sales ledger open on the counter (one entry in red ink, a red ribbon);
//   mortar & pestle and brass scales; foxgloves potted by the door; and for close lookers, on the nightstand behind
//   the curtain, a small bottle sealed with RED WAX bearing a pale eye (the sigil; one of its three houses).
//   LIGHT: a teal show-globe and an amber show-globe in the window (the old apothecary's sign) are the key (teal by
//   day and night), an amber oil lamp on the counter, a blue spirit-burner flame under the alembic, the green grille of
//   the locked room, the Lantern-maker's lantern over the shop floor.
//   AMBIANCE: coloured vapour curling up from the alembic (violet / teal motes, stepped 8 fps); bottle glints flicker.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 9, d: 6, h: 3.1, wall: 'plaster', pal: 1, floor: 'flags' };

/** A cylinder from p to q (room-local [x, y, z]). */
function tube(b, p, q, r, opts, seg = 8) {
  const a = new THREE.Vector3(...p), c = new THREE.Vector3(...q), d = c.clone().sub(a), len = d.length();
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  b.push(m);
  b.cylinder(r, r, len, { segments: seg, ...opts, at: [0, -len / 2, 0] });
  b.pop();
}

/** One mesh of n tiny glowing boxes whose centres follow pos(k, t) -> [x, y, z, scale] (room-local), stepped 8 fps. */
function motes(room, ctx, name, n, colorOf, size, pos) {
  const pb = new Builder(room.engine, { name });
  for (let k = 0; k < n; k++) pb.box(size, size, size, { at: [0, 0, 0], origin: 'center', tones: 'glass', layer: 'glass', glow: colorOf(k), glowKind: 1 });
  const grp = pb.build({ name, castShadow: false });
  const mesh = grp.children[0];
  mesh.material = ctx.kit.interiorGlowMaterial(room.engine);
  mesh.castShadow = false; mesh.frustumCulled = false;
  const pa = mesh.geometry.getAttribute('position'), base = Float32Array.from(pa.array), per = pa.count / n;
  let last = -1;
  const update = (t) => {
    const tq = Math.floor(t * 8) / 8;
    if (tq === last) return;
    last = tq;
    for (let k = 0; k < n; k++) {
      const [x, y, z, s = 1] = pos(k, tq);
      for (let v = k * per; v < (k + 1) * per; v++) {
        pa.array[v * 3] = base[v * 3] * s + x; pa.array[v * 3 + 1] = base[v * 3 + 1] * s + y; pa.array[v * 3 + 2] = base[v * 3 + 2] * s + z;
      }
    }
    pa.needsUpdate = true;
  };
  update(0);
  return { group: grp, update };
}

export default function build(room, ctx) {
  const { FURNITURE: F, WALL: Wl, CLOTH, GLOW, POTIONS, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, BZ = -D / 2;
  const b = room.b, g = room.g;
  const TEAL = paintRamp('#2e5e5c', { lightness: 0.42 });           // painted panelling
  const TEAL_DK = paintRamp('#1d3a3c', { lightness: 0.28 });
  const TILE_DK = paintRamp('#24484a', { lightness: 0.34 });        // the dark squares of the floor
  const EBONY = paintRamp('#2a1f2c', { lightness: 0.24 });          // the poison cabinet
  const GLINT = ['#7CE8C8', '#F07CB8', '#86A8FF', '#FFC860', '#C890FF', '#7CE8E0'];
  const glow = (bb, w, h, d, at, color, kind = 1, extra = {}) => bb.box(w, h, d, { at, tones: 'glass', layer: 'glass', glow: color, glowKind: kind, ...extra });

  // ---- shell: one arched window back-left (the show globes); teal-painted plaster over a walnut dado; cream stone floor
  const WINX = -2.7;
  room.shell({
    windows: [{ x: WINX, y: 0.95, w: 1.0, h: 1.3, panes: [2, 4], arch: true, curtains: null }],
    wallTones: { upper: { tones: TEAL, pattern: 'plaster' }, lower: { tones: 'timber', pattern: 'vboards', scale: 0.8 } },
    dado: 1.0, floorTones: 'ashlar', floorPattern: 'none',
  });
  // the harlequin floor: dark teal diamonds on the cream stone (0.6 m squares turned 45 deg), not under the dispensary
  const S = 0.6, DG = S * Math.SQRT2;
  for (let i = -8; i <= 8; i++) for (let j = -6; j <= 6; j++) {
    const x = i * DG, z = j * DG;          // diamonds tip to tip: the cream diamonds are the gaps
    if (Math.abs(x) > W / 2 - DG / 2 + 0.02 || Math.abs(z) > D / 2 - DG / 2 + 0.02) continue;
    if (x > 1.7 - DG / 2 && z < -1.3 + DG / 2) continue;
    b.box(S, 0.012, S, { at: [x, 0, z], ry: Math.PI / 4, tones: TILE_DK, pattern: 'none' });
  }
  // ---- the L: the locked dispensary walls off the back-right quarter (its face steps forward to z -1.3)
  const LX0 = 1.7, LX1 = W / 2 + 0.3, LZ1 = -1.3, LW = LX1 - LX0, LCX = (LX0 + LX1) / 2, LD = LZ1 - (BZ - 0.3), LCZ = (LZ1 + BZ - 0.3) / 2;
  b.box(LW, 1.0, LD, { at: [LCX, 0, LCZ], tones: 'timber', pattern: 'vboards', scale: 0.8 });
  b.box(LW, H - 1.0, LD, { at: [LCX, 1.0, LCZ], tones: TEAL, pattern: 'plaster' });
  b.box(LW + 0.04, 0.12, LD + 0.06, { at: [LCX, H, LCZ], tones: 'timber', pattern: 'none' });            // wall cap
  b.box(LW, 0.07, 0.06, { at: [LCX, 0.965, LZ1 + 0.03], tones: 'timber', pattern: 'none' });            // chair rail
  b.box(LW, 0.12, 0.04, { at: [LCX, 0, LZ1 + 0.02], tones: 'timber', pattern: 'none' });                // skirting
  b.box(0.06, 0.07, LD, { at: [LX0 - 0.03, 0.965, LCZ], tones: 'timber', pattern: 'none' });
  room.solid(LX0, BZ - 0.3, LX1, LZ1, 'wall');
  // the poison cabinet set into the face: ebony, a glowing violet back, 3 shelves of dark bottles, ONE slot empty
  const PX = 2.42, PW = 1.12, PY = 0.95, PH = 1.38, PD = 0.3, PZ = LZ1;
  for (const s of [-1, 1]) b.box(0.07, PH, PD, { at: [PX + s * (PW / 2 - 0.035), PY, PZ + PD / 2], tones: EBONY, pattern: 'none' });
  b.box(PW, 0.08, PD, { at: [PX, PY, PZ + PD / 2], tones: EBONY, pattern: 'none' });
  b.box(PW + 0.1, 0.1, PD + 0.06, { at: [PX, PY + PH, PZ + PD / 2 + 0.01], tones: EBONY, pattern: 'none' });
  b.prism([[-PW / 2, 0], [PW / 2, 0], [0, 0.22]], 0.06, { at: [PX, PY + PH + 0.1, PZ + PD - 0.02], tones: EBONY });   // pediment
  ctx.kit.ornament(b, g, 'skull', [PX, PY + PH + 0.1, PZ + PD / 2 - 0.04]);
  glow(g, PW - 0.14, PH - 0.1, 0.02, [PX, PY + 0.08, PZ + 0.02], '#4E3470', 1);
  const BOT = [paintRamp('#1c3328', { lightness: 0.22 }), 'crow', paintRamp('#2c1c34', { lightness: 0.22 })];
  for (let r = 0; r < 3; r++) {
    const y = PY + 0.08 + r * 0.44;
    b.box(PW - 0.14, 0.03, PD - 0.04, { at: [PX, y, PZ + PD / 2], tones: EBONY, pattern: 'none', tint: 1.06 });
    for (let c = 0; c < 4; c++) {
      const x = PX - 0.36 + c * 0.24, z = PZ + PD / 2 + 0.02;
      if (r === 1 && c === 2) {                                   // the empty slot: a pale ring in the dust
        for (const [dx, dz, w, d] of [[0, -0.05, 0.1, 0.02], [0, 0.05, 0.1, 0.02], [-0.05, 0, 0.02, 0.1], [0.05, 0, 0.02, 0.1]]) {
          b.box(w, 0.006, d, { at: [x + dx, y + 0.03, z + dz], tones: 'cream', pattern: 'none' });
        }
        continue;
      }
      const tall = (r + c) % 2 === 0;
      b.box(0.1, tall ? 0.24 : 0.19, 0.1, { at: [x, y + 0.03, z], tones: BOT[(r * 4 + c) % 3], pattern: 'none' });
      b.box(0.04, 0.06, 0.04, { at: [x, y + 0.03 + (tall ? 0.24 : 0.19), z], tones: BOT[(r * 4 + c) % 3], pattern: 'none' });
      b.box(0.07, 0.06, 0.01, { at: [x, y + 0.1, z + 0.055], tones: 'cream', pattern: 'none' });          // label
      b.box(0.025, 0.025, 0.01, { at: [x, y + 0.115, z + 0.062], tones: 'crow', pattern: 'none' });       // the mark
    }
  }
  b.box(0.04, PH - 0.1, 0.03, { at: [PX, PY + 0.08, PZ + PD + 0.01], tones: 'brass', pattern: 'none' });    // glazing bars
  b.box(0.1, 0.12, 0.05, { at: [PX - 0.02, PY + 0.36, PZ + PD + 0.03], tones: 'brass' });                  // the padlock
  b.box(0.07, 0.06, 0.02, { at: [PX - 0.02, PY + 0.48, PZ + PD + 0.03], tones: 'iron' });
  room.solid(PX - PW / 2, PZ, PX + PW / 2, PZ + PD + 0.05);
  // the locked door to the dispensary: iron straps, a green-lit grille, a heavy hasp
  const DXc = 3.85, DWd = 0.84;
  for (const s of [-1, 1]) b.box(0.1, 2.08, 0.08, { at: [DXc + s * (DWd / 2 + 0.05), 0, LZ1 + 0.04], tones: 'timber', pattern: 'none' });
  b.box(DWd + 0.2, 0.12, 0.09, { at: [DXc, 2.06, LZ1 + 0.045], tones: 'timber', pattern: 'none' });
  b.box(DWd, 2.04, 0.05, { at: [DXc, 0.02, LZ1 + 0.025], tones: TEAL_DK, pattern: 'vboards', scale: 0.6 });
  for (const y of [0.3, 1.05, 1.8]) b.box(DWd + 0.02, 0.06, 0.02, { at: [DXc, y, LZ1 + 0.055], tones: 'iron' });
  glow(g, 0.3, 0.26, 0.02, [DXc, 1.38, LZ1 + 0.052], '#7CDCA0', 1);
  for (const s of [-1, 0, 1]) b.box(0.025, 0.3, 0.03, { at: [DXc + s * 0.08, 1.36, LZ1 + 0.07], tones: 'iron' });
  b.box(0.12, 0.16, 0.05, { at: [DXc - 0.28, 0.9, LZ1 + 0.08], tones: 'iron' });
  room.light({ pos: [DXc, 1.45, LZ1 + 0.35], color: '#8CF0A8', r: 1.6, kind: 'lantern', intensity: 0.75, hug: false });

  // ---- the back wall: the window with its two show globes (teal + amber: the key light)
  room.wallFrame('back', ({ full, glow: wg }) => {
    for (const [dx, col] of [[-0.27, '#4FE0C8'], [0.27, '#FFB848']]) {
      const x = WINX + dx;
      full.cylinder(0.09, 0.11, 0.03, { at: [x, 0.95, 0.04], tones: 'brass', segments: 8 });
      wg.cylinder(0.1, 0.18, 0.15, { at: [x, 0.98, 0.04], tones: 'glass', layer: 'glass', glow: col, glowKind: 1, segments: 8 });
      wg.cylinder(0.18, 0.08, 0.17, { at: [x, 1.13, 0.04], tones: 'glass', layer: 'glass', glow: col, glowKind: 1, segments: 8 });
      wg.box(0.07, 0.14, 0.07, { at: [x, 1.3, 0.04], tones: 'glass', layer: 'glass', glow: col, glowKind: 1 });
      full.cylinder(0.06, 0.04, 0.07, { at: [x, 1.44, 0.04], tones: 'brass', segments: 8 });
    }
  });
  room.light({ pos: [WINX - 0.1, 1.25, BZ + 0.5], color: '#58DCC8', r: 4.2, kind: 'fire', intensity: 1.7 });

  // ---- the wall of drawers + jewel bottles behind the counter (x -2.05 .. 1.7), a rolling ladder
  const DX0 = -2.05, DX1 = LX0, DW = DX1 - DX0, DC = (DX0 + DX1) / 2, DD = 0.42;
  b.box(DW, 1.22, DD, { at: [DC, 0, BZ + DD / 2], tones: TEAL, pattern: 'none' });
  b.box(DW + 0.06, 0.05, DD + 0.05, { at: [DC, 1.22, BZ + DD / 2 + 0.01], tones: 'plank', pattern: 'none', tint: 1.04 });
  const NC = 9, NR = 4, cw = (DW - 0.1) / NC, rh = 1.12 / NR;
  for (let i = 0; i < NC; i++) for (let j = 0; j < NR; j++) {
    const x = DX0 + 0.05 + cw * (i + 0.5), y = 0.06 + rh * j;
    b.box(cw - 0.045, rh - 0.045, 0.025, { at: [x, y, BZ + DD + 0.012], tones: TEAL, tint: (i + j) % 2 ? 0.94 : 1.05, pattern: 'none' });
    b.box(0.12, 0.05, 0.012, { at: [x, y + rh * 0.55, BZ + DD + 0.03], tones: 'cream', pattern: 'none' });
    b.box(0.04, 0.04, 0.04, { at: [x, y + rh * 0.25, BZ + DD + 0.035], tones: 'brass', pattern: 'none' });
  }
  const UD = 0.28;
  b.box(DW - 0.06, 1.58, 0.03, { at: [DC, 1.27, BZ + 0.015], tones: TEAL_DK, pattern: 'vboards', scale: 1.2 });
  for (const s of [-1, 1]) b.box(0.07, 1.6, UD, { at: [DC + s * (DW / 2 - 0.035), 1.27, BZ + UD / 2], tones: TEAL, pattern: 'none' });
  b.box(DW + 0.08, 0.1, UD + 0.08, { at: [DC, 2.86, BZ + UD / 2], tones: TEAL, pattern: 'none', tint: 1.05 });
  let bk = 0;
  for (const [si, y] of [[0, 1.27], [1, 1.79], [2, 2.31]]) {
    if (si) b.box(DW - 0.12, 0.035, UD - 0.02, { at: [DC, y, BZ + UD / 2], tones: 'plank', pattern: 'none' });
    let x = DX0 + 0.16;
    while (x < DX1 - 0.14) {
      const k = bk++, hue = k % POTIONS.length, h = [0.22, 0.17, 0.26, 0.19][k % 4], w = [0.1, 0.12, 0.08, 0.11][(k * 3) % 4];
      const lit = (k * 7) % 3 === 0, y0 = y + 0.035;
      if (lit) glow(g, w, h, w, [x, y0, BZ + 0.15], GLINT[hue], 2);
      else b.box(w, h, w, { at: [x, y0, BZ + 0.15], tones: POTIONS[hue], pattern: 'none' });
      b.box(0.035, 0.05, 0.035, { at: [x, y0 + h, BZ + 0.15], tones: POTIONS[hue], tint: 0.94, pattern: 'none' });
      b.box(w * 0.75, 0.05, 0.01, { at: [x, y0 + h * 0.35, BZ + 0.15 + w / 2 + 0.005], tones: 'cream', pattern: 'none' });
      x += w + 0.075 + (k % 5 === 4 ? 0.06 : 0);
    }
  }
  room.solid(DX0, BZ, DX1, BZ + DD + 0.04);
  // the rolling ladder
  const LAX = 1.05;
  for (const s of [-1, 1]) {
    b.hexa([new THREE.Vector3(LAX + s * 0.22 - 0.03, 0, BZ + DD + 0.55), new THREE.Vector3(LAX + s * 0.22 + 0.03, 0, BZ + DD + 0.55),
      new THREE.Vector3(LAX + s * 0.22 - 0.03, 2.9, BZ + 0.32), new THREE.Vector3(LAX + s * 0.22 + 0.03, 2.9, BZ + 0.32),
      new THREE.Vector3(LAX + s * 0.22 - 0.03, 0, BZ + DD + 0.6), new THREE.Vector3(LAX + s * 0.22 + 0.03, 0, BZ + DD + 0.6),
      new THREE.Vector3(LAX + s * 0.22 - 0.03, 2.9, BZ + 0.37), new THREE.Vector3(LAX + s * 0.22 + 0.03, 2.9, BZ + 0.37)], { tones: 'timber' });
  }
  for (let i = 1; i < 9; i++) { const f = i / 9; b.box(0.44, 0.035, 0.04, { at: [LAX, f * 2.9, BZ + DD + 0.57 - f * 0.65], tones: 'plank', pattern: 'none' }); }
  b.box(DW, 0.035, 0.035, { at: [DC, 2.8, BZ + UD + 0.06], tones: 'brass', pattern: 'none' });           // the ladder rail
  room.solid(LAX - 0.27, BZ + DD, LAX + 0.27, BZ + DD + 0.62);

  // ---- the bed nook back-left behind a half-drawn curtain; the nightstand with the RED-SEALED bottle
  const BX = -W / 2 + 0.55, BZc = BZ + 1.05;
  const bed = F.bed(room, { x: BX, z: BZc, quilt: CLOTH.purple, frame: 'timber' });
  b.box(0.04, 0.04, 1.6, { at: [-3.32, H - 0.35, BZ + 0.8], tones: 'brass', pattern: 'none' });
  b.box(0.05, H - 0.65, 0.75, { at: [-3.32, 0.28, BZ + 0.42], tones: CLOTH.purple, pattern: 'vboards', scale: 0.3, tint: 0.94 });
  F.nightstand(room, { x: -2.9, z: BZ + 0.25 });
  const NX = -2.76, NY = 0.66, NZ = BZ + 0.3;                    // the sigil bottle (the nightstand top is 0.66)
  b.box(0.07, 0.13, 0.07, { at: [NX, NY, NZ], tones: 'crow', pattern: 'none' });
  b.box(0.03, 0.04, 0.03, { at: [NX, NY + 0.13, NZ], tones: 'crow', pattern: 'none' });
  b.box(0.06, 0.04, 0.06, { at: [NX, NY + 0.165, NZ], tones: TP.bannerRed, pattern: 'none' });              // red wax
  b.box(0.035, 0.05, 0.02, { at: [NX + 0.01, NY + 0.12, NZ + 0.035], tones: TP.bannerRed, pattern: 'none' }); // the drip
  b.box(0.018, 0.018, 0.01, { at: [NX, NY + 0.175, NZ + 0.032], tones: 'cream', pattern: 'none' });          // the eye

  // ---- the shop counter: scales, mortar & pestle, the sales ledger (one entry in red), the amber oil lamp, a bell
  const KX0 = -2.9, KX1 = 0.7, KW = KX1 - KX0, KX = (KX0 + KX1) / 2, KZ = -0.55, KD = 0.6, KH = 1.0;
  b.box(KW, KH - 0.07, KD, { at: [KX, 0, KZ], tones: TEAL, pattern: 'vboards', scale: 0.9 });
  for (let i = 0; i < 4; i++) b.box(KW / 4 - 0.16, 0.55, 0.02, { at: [KX0 + KW / 8 + (i * KW) / 4, 0.2, KZ + KD / 2 + 0.01], tones: TEAL, tint: 1.06, pattern: 'none' });
  b.box(KW + 0.1, 0.07, KD + 0.1, { at: [KX, KH - 0.07, KZ], tones: 'plank', pattern: 'planks', tint: 1.05 });
  b.box(KW - 0.1, 0.04, 0.04, { at: [KX, 0.1, KZ + KD / 2 + 0.06], tones: 'brass', pattern: 'none' });
  room.solid(KX0 - 0.05, KZ - KD / 2 - 0.05, KX1 + 0.05, KZ + KD / 2 + 0.08);
  const T = KH;
  // brass scales
  b.box(0.2, 0.03, 0.12, { at: [-2.45, T, KZ - 0.08], tones: 'timber' });
  b.box(0.03, 0.36, 0.03, { at: [-2.45, T + 0.03, KZ - 0.08], tones: 'brass' });
  b.box(0.46, 0.025, 0.025, { at: [-2.45, T + 0.38, KZ - 0.08], tones: 'brass', rz: 0.1 });
  for (const s of [-1, 1]) b.cylinder(0.08, 0.06, 0.03, { at: [-2.45 + s * 0.21, T + 0.2 - s * 0.02, KZ - 0.08], tones: 'brass', segments: 8 });
  for (let i = 0; i < 4; i++) b.cylinder(0.025 + i * 0.008, 0.025 + i * 0.008, 0.04 + i * 0.012, { at: [-2.15 + i * 0.07, T, KZ + 0.12], tones: 'brass', segments: 8 });
  // mortar & pestle
  b.cylinder(0.12, 0.14, 0.13, { at: [-1.82, T, KZ - 0.02], tones: 'ashlar', segments: 8 });
  b.cylinder(0.1, 0.1, 0.02, { at: [-1.82, T + 0.125, KZ - 0.02], tones: 'leaf', segments: 8 });
  b.box(0.045, 0.28, 0.045, { at: [-1.76, T + 0.07, KZ - 0.02], tones: 'ashlar', rz: -0.5 });
  // the sales ledger: open, ruled, the last entry in red ink, a red ribbon over the edge, ink and quill
  const LGX = -1.05, LGZ = KZ + 0.02;
  b.box(0.68, 0.03, 0.44, { at: [LGX, T, LGZ], tones: TEAL_DK, pattern: 'none' });
  for (const s of [-1, 1]) b.box(0.3, 0.025, 0.38, { at: [LGX + s * 0.155, T + 0.03, LGZ], tones: 'cream', pattern: 'none', rz: s * -0.04 });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const red = s > 0 && i === 3;
    b.box(red ? 0.2 : 0.22, 0.006, red ? 0.022 : 0.014, { at: [LGX + s * 0.155, T + 0.058 + (s > 0 ? 0 : 0), LGZ - 0.13 + i * 0.065], tones: red ? TP.bannerRed : 'iron', pattern: 'none' });
  }
  b.box(0.03, 0.006, 0.22, { at: [LGX + 0.02, T + 0.06, LGZ + 0.14], tones: TP.bannerRed, pattern: 'none' });
  b.box(0.03, 0.16, 0.012, { at: [LGX + 0.02, T - 0.15, KZ + KD / 2 + 0.056], tones: TP.bannerRed, pattern: 'none' });   // the ribbon tail
  b.cylinder(0.045, 0.05, 0.06, { at: [-0.6, T, KZ - 0.05], tones: 'crow', segments: 8 });
  b.box(0.015, 0.26, 0.015, { at: [-0.6, T + 0.05, KZ - 0.05], tones: 'cream', rz: 0.35 });
  b.box(0.06, 0.14, 0.012, { at: [-0.64, T + 0.2, KZ - 0.05], tones: 'cream', rz: 0.35 });
  // the amber oil lamp
  const AX = -0.18;
  b.cylinder(0.09, 0.11, 0.05, { at: [AX, T, KZ], tones: 'brass', segments: 8 });
  b.cylinder(0.06, 0.09, 0.08, { at: [AX, T + 0.05, KZ], tones: 'brass', segments: 8 });
  glow(g, 0.09, 0.2, 0.09, [AX, T + 0.13, KZ], '#FFC060', 2);
  b.cylinder(0.06, 0.04, 0.03, { at: [AX, T + 0.33, KZ], tones: 'brass', segments: 8 });
  room.light({ pos: [AX, T + 0.4, KZ + 0.2], color: '#FFB050', r: 3.0, kind: 'fire', intensity: 1.35 });
  b.cylinder(0.06, 0.035, 0.07, { at: [0.45, T, KZ + 0.1], tones: 'brass', segments: 8 });                 // the shop bell
  b.box(0.02, 0.04, 0.02, { at: [0.45, T + 0.07, KZ + 0.1], tones: 'brass' });
  // drying herbs on a rack over the counter (lavender, nightshade, sage)
  for (const s of [-2.45, 0.25]) b.box(0.02, H - 2.45, 0.02, { at: [s, 2.45, KZ], tones: 'iron' });
  b.box(2.95, 0.04, 0.04, { at: [-1.1, 2.43, KZ], tones: 'iron' });
  for (let i = 0; i < 7; i++) {
    const x = -2.4 + i * 0.44, tones = [TP.flowerViolet, 'leaf', 'mossTuft', TP.berry][i % 4];
    b.box(0.015, 0.1, 0.015, { at: [x, 2.33, KZ], tones: TP.thatch });
    b.box(0.12, 0.26, 0.1, { at: [x, 2.08, KZ], tones, pattern: 'none', tint: i % 2 ? 0.96 : 1.04 });
  }

  // ---- the alembic on its table in the front-right corner of the L: blue spirit flame, a violet-glowing flask, a teal
  // receiver, test tubes
  const TX = 3.1, TZ = 0.3;
  F.table(room, {
    x: TX, z: TZ, w: 1.5, d: 0.72, items: false,
    extra: (bb, gg, top) => {
      bb.cylinder(0.07, 0.07, 0.06, { at: [-0.35, top, 0], tones: 'brass', segments: 8 });
      gg.box(0.05, 0.1, 0.05, { at: [-0.35, top + 0.06, 0], tones: 'glass', layer: 'glass', glow: '#8CC0FF', glowKind: 2 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) bb.box(0.02, 0.24, 0.02, { at: [-0.35 + sx * 0.1, top, sz * 0.09], tones: 'iron' });
      bb.box(0.24, 0.02, 0.24, { at: [-0.35, top + 0.23, 0], tones: 'iron' });
      gg.cylinder(0.08, 0.14, 0.12, { at: [-0.35, top + 0.25, 0], tones: 'glass', layer: 'glass', glow: '#A880F0', glowKind: 1, segments: 8 });
      gg.cylinder(0.14, 0.06, 0.12, { at: [-0.35, top + 0.37, 0], tones: 'glass', layer: 'glass', glow: '#A880F0', glowKind: 1, segments: 8 });
      bb.cylinder(0.035, 0.03, 0.22, { at: [-0.35, top + 0.49, 0], tones: 'glass', segments: 8 });
      tube(bb, [-0.35, top + 0.7, 0], [0.2, top + 0.52, 0], 0.022, { tones: 'copper' });
      tube(bb, [0.2, top + 0.52, 0], [0.36, top + 0.22, 0], 0.02, { tones: 'copper', tint: 1.05 });
      gg.cylinder(0.05, 0.1, 0.1, { at: [0.38, top, 0], tones: 'glass', layer: 'glass', glow: '#58DCC8', glowKind: 1, segments: 8 });
      gg.cylinder(0.1, 0.04, 0.1, { at: [0.38, top + 0.1, 0], tones: 'glass', layer: 'glass', glow: '#58DCC8', glowKind: 1, segments: 8 });
      bb.box(0.34, 0.08, 0.1, { at: [0.0, top, -0.22], tones: 'timber' });                                   // test-tube rack
      [GLINT[1], GLINT[3], GLINT[2], GLINT[0]].forEach((c, i) => gg.box(0.035, 0.16, 0.035, { at: [-0.12 + i * 0.08, top + 0.04, -0.22], tones: 'glass', layer: 'glass', glow: c, glowKind: 1 }));
      bb.box(0.2, 0.02, 0.26, { at: [0.0, top, 0.18], tones: 'cream', ry: 0.3 });                           // a recipe slip
    },
  });
  room.light({ pos: [TX - 0.35, 1.1, TZ + 0.25], color: '#8CB4FF', r: 1.9, kind: 'lantern', intensity: 0.95 });
  F.stool(room, { x: TX - 1.05, z: TZ + 0.35 });

  // ---- the shop floor: the customers' bench along the left wall, potted foxgloves by the door, a cloak on its peg
  const BNX = -W / 2 + 0.28;
  b.box(0.42, 0.06, 1.4, { at: [BNX, 0.42, 1.35], tones: 'plank', pattern: 'planks' });
  for (const z of [0.75, 1.95]) b.box(0.36, 0.42, 0.06, { at: [BNX, 0, z], tones: 'timber', pattern: 'none' });
  room.solid(BNX - 0.25, 0.6, BNX + 0.22, 2.1);
  for (const sx of [-1, 1]) {
    const x = sx * 1.05, z = D / 2 - 0.35;
    b.cylinder(0.15, 0.19, 0.3, { at: [x, 0, z], tones: 'brick', segments: 8 });
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.08, hh = 0.5 + (k % 2) * 0.18;
      b.box(0.03, hh, 0.03, { at: [x + ox, 0.3, z], tones: 'leaf' });
      for (let j = 0; j < 4; j++) b.box(0.06, 0.06, 0.06, { at: [x + ox + (j % 2 ? 0.03 : -0.03), 0.3 + hh * (0.45 + j * 0.13), z + 0.02], tones: [TP.flowerViolet, TP.flowerViolet, TP.flowerViolet], pattern: 'none' });
    }
    b.box(0.3, 0.08, 0.3, { at: [x, 0.3, z], tones: 'leaf', pattern: 'none' });
    room.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  }
  // the apothecary's dark cloak and broad hat on a wall peg in the front-left corner (left wall, past the bench end:
  // nothing stands in front of the counter)
  const PGX = -W / 2, PGZ = D / 2 - 0.42;
  b.box(0.16, 0.05, 0.05, { at: [PGX + 0.08, 1.62, PGZ], tones: 'timber' });
  b.box(0.16, 0.95, 0.34, { at: [PGX + 0.1, 0.62, PGZ], tones: EBONY, pattern: 'vboards', scale: 0.3, tint: 1.04 });
  b.cylinder(0.22, 0.22, 0.02, { at: [PGX + 0.24, 1.66, PGZ], tones: EBONY, segments: 8 });
  b.cylinder(0.1, 0.09, 0.11, { at: [PGX + 0.24, 1.68, PGZ], tones: EBONY, segments: 8 });
  room.solid(PGX, PGZ - 0.2, PGX + 0.25, PGZ + 0.2);
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });
  // the Lantern-maker's lantern over the shop floor
  F.hangingLantern(room, { x: -1.15, z: 0.85, y: 2.2, r: 3.0, intensity: 1.15 });
  // side walls (read at yaw 45): a jar shelf on the left, a framed botanical of foxglove on the right
  Wl.shelf(room, { wall: 'left', x: -0.6, y: 1.55, w: 1.1, items: ['jar', 'potion', 'jar', 'potion'] });
  Wl.frame(room, { wall: 'right', x: 1.6, y: 1.5, w: 0.5, h: 0.65, tones: CLOTH.linen });

  // ---- vapour curling up from the alembic (violet / teal motes, stepped 8 fps)
  const VC = ['#9A80D8', '#62C8B4', '#C8B8F0'];
  const vap = motes(room, ctx, 'house-5-vapour', 14, (k) => VC[k % 3], 0.055, (k, t) => {
    const L = 2.6, u = (((t + (k / 14) * L) % L) + L) % L / L;
    const sp = 0.05 + u * 0.22;
    return [TX - 0.35 + Math.sin(u * 5.5 + k * 2.1) * sp, 1.5 + u * 1.25, TZ + Math.cos(u * 4.3 + k * 1.3) * sp * 0.7, Math.min(1, u * 5) * (1 - u * 0.75)];
  });

  room.spot('counter', -1.1, 0.25, Math.PI);
  room.spot('alembic', TX, TZ + 0.85, Math.PI);
  room.spot('cabinet', PX, -0.55, Math.PI);

  return {
    bed: { x: BX, z: BZc - 0.6, y: 0.55, facing: 0 },
    visit: { x: -2.95, z: -1.45, facing: -Math.PI / 2 },
    extras: [vap.group],
    update(t) { vap.update(t); },
    bedRect: bed.rect,
  };
}
