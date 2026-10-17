// house-1 interior: Wychwood Cottage (owner: interiors builder, houses 0-4; lore pass 2026-10-16). docs/INTERIORS.md,
// docs/LORE.md row 1.
// The hedge-witch: maybe the town's protector... or not. An L-SHAPED, low, crooked cottage (the front-left corner is
// outside: the room wraps round it), stained teal-grey plaster on a fieldstone footing with leaning timbers, an
// uneven flagstone floor, two crooked beams across the room hung thick with drying herbs. No fireplace: the witch's
// fire is the CAULDRON itself, on a ring of stones under a brick smoke-hood in the back-left nook. Story props:
//   - the cauldron: green brew bubbling, steam curling up into the hood (animated), a ladle
//   - the round table: a crystal ball and a TAROT spread with ONE card face-down (the purple back), a black candle
//   - on the leaded window's sill: a straw POPPET with its head missing (the head lies on the floor below)
//   - the black cat asleep in its wicker basket by the nook; a torn grimoire page pinned to the wall: a sketch of the
//     clock tower with its hands at the top
//   - grimoires + potion shelves, a besom, the jack-o'-lantern by the door, the Lantern-maker's lantern on the beam
// Ambiance: green-gold - gold firelight under the cauldron, a green key light off the brew, a violet glint from the
// crystal ball; cluttered and warm; mischievous.
import * as THREE from 'three';
import { glassGlow } from '../palette.js';
import { bareShell, polyWalls, polyFloor, blockOutside, inPoly, onSeg, segPoint, motes, at, glowGroup } from './house-0.js';
import { Builder } from '../kit.js';

/** Room size / walls (index.js reads ROOM before build): low and wide; the L leaves the front-left corner outside. */
export const ROOM = { w: 8.6, d: 6.2, h: 2.7, wall: 'plaster', pal: 1, floor: 'flags' };

export default function build(room, ctx) {
  const { FURNITURE: F, WALL: Wl, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, T = room.T;
  const X = W / 2, Z = D / 2, IX = -1.4, IZ = 0.6;           // the L's inner corner
  const PURPLE = paintRamp('#4a2a5e', { lightness: 0.38 });
  const WASH = paintRamp('#5e7a70', { lightness: 0.58 });     // stained teal-grey plaster
  const BREW = glassGlow(TP.mossTuft[0], 0.12);
  const STEAM = paintRamp('#b8d4a6', { lightness: 0.78 });
  const LAVENDER = paintRamp(TP.flowerViolet, { lightness: 0.5 });
  bareShell(room);

  // ---- the L: back wall (leaded window + porthole), right wall, front (door), the inner corner, the nook's front, left
  const V = [
    [-X, -Z, { windows: [{ u: 1.15, y: 1.05, w: 0.9, h: 0.95, panes: [3, 4], curtains: PURPLE, frame: 'timber' }, { u: 3.3, y: 1.35, w: 0.42, h: 0.42, panes: [2, 2], frame: 'timber' }] }],
    [X, -Z], [X, Z], [IX, Z, { ext: [T, 0] }], [IX, IZ, { ext: [0, T] }], [-X, IZ],
  ];
  const poly = V.map((p) => [p[0], p[1]]);
  const lean = (i, k) => [0.035, -0.03, 0.025, -0.04, 0.03, -0.02][(i * 3 + k) % 6];
  const segs = polyWalls(room, V, {
    dado: 0.8, upper: { tones: WASH, pattern: 'plaster' }, lower: { tones: 'stone', pattern: 'rubble', scale: 0.9 },
    posts: 1.7, postLean: lean, windowGlow: '#F4F0D8',
  });
  polyFloor(room, poly, { tones: 'stone', pattern: 'rubble', scale: 1.35, tint: 0.98, lip: [[-X - T, -Z - T], [X + T, -Z - T], [X + T, Z + T], [IX - T, Z + T], [IX - T, IZ + T], [-X - T, IZ + T]], lipH: 0.3, lipTones: paintRamp('#2a2630', { lightness: 0.18 }) });   // a dark footing, flush with the walls' outer faces
  blockOutside(room, (x, z) => inPoly(poly, x, z));
  const back = segs[0];

  // damp stains + the porthole's ring of dressed stones on the back wall
  onSeg(room, back, 0, 0, (b) => {
    for (const [sx, sy, sw, sh] of [[-0.35, 1.6, 0.5, 0.42], [2.4, 1.0, 0.4, 0.3], [-3.9, 1.95, 0.32, 0.26], [0.2, 0.95, 0.3, 0.2]]) {
      b.box(sw, sh, 0.01, { at: [sx, sy, 0.005], tones: WASH, pattern: 'plaster', tint: 0.94 });
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.box(0.14, 0.09, 0.06, { at: [3.3 + Math.cos(a) * 0.34, 1.52 + Math.sin(a) * 0.34, 0.03], rz: a + Math.PI / 2, tones: 'ashlar', origin: 'center', tint: k % 2 ? 0.96 : 1.02 });
    }
  });

  // ---- THE CAULDRON on its open fire under a brick smoke-hood (back-left nook)
  const cx = -2.85, cz = -2.05;
  at(room, { x: cx, z: cz }, (b, g) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.box(0.2, 0.14, 0.17, { at: [Math.cos(a) * 0.56, 0, Math.sin(a) * 0.56], ry: -a, tones: 'stone', tint: [1, 0.95, 1.04][k % 3] });
    }
    b.box(0.9, 0.02, 0.9, { at: [0, 0, 0], ry: Math.PI / 8, tones: 'crow' });
    g.box(0.5, 0.05, 0.5, { at: [0, 0.01, 0], ry: 0.3, tones: 'glass', layer: 'glass', glow: GLOW.ember, glowKind: 2 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4, h = [0.22, 0.15, 0.26, 0.17, 0.21, 0.13][k];
      g.box(0.08, h, 0.08, { at: [Math.cos(a) * 0.34, 0.03, Math.sin(a) * 0.34], tones: 'glass', layer: 'glass', glow: k % 2 ? GLOW.flame : GLOW.fire, glowKind: 2 });
    }
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; b.box(0.06, 0.2, 0.06, { at: [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], tones: 'iron' }); }
    b.cylinder(0.28, 0.45, 0.27, { at: [0, 0.16, 0], tones: 'iron', segments: 12 });
    b.cylinder(0.45, 0.4, 0.3, { at: [0, 0.43, 0], tones: 'iron', segments: 12 });
    b.cylinder(0.44, 0.44, 0.05, { at: [0, 0.73, 0], tones: 'iron', tint: 1.05, segments: 12 });
    g.cylinder(0.38, 0.38, 0.02, { at: [0, 0.775, 0], tones: 'glass', layer: 'glass', glow: BREW, glowKind: 2, segments: 12 });
    for (const s of [-1, 1]) b.box(0.05, 0.12, 0.05, { at: [s * 0.46, 0.63, 0], tones: 'iron' });
    b.box(0.05, 0.05, 0.66, { at: [0.14, 0.88, 0.02], rx: -0.75, tones: 'plank', origin: 'center' });
  });
  room.solidAt(cx, cz, 1.2, 1.2, 0, 'cauldron');
  // the smoke-hood: a brick funnel from the back wall over the pot, a chain and pot-hook
  onSeg(room, back, cx, 0, (b) => {
    b.hexa([new THREE.Vector3(-0.95, 1.7, 0), new THREE.Vector3(0.95, 1.7, 0), new THREE.Vector3(-0.42, H, 0), new THREE.Vector3(0.42, H, 0),
      new THREE.Vector3(-0.95, 1.7, 1.3), new THREE.Vector3(0.95, 1.7, 1.3), new THREE.Vector3(-0.42, H, 0.55), new THREE.Vector3(0.42, H, 0.55)], { tones: 'brick', pattern: 'brick' });
    b.box(2.0, 0.1, 1.38, { at: [0, 1.62, 0.66], tones: 'timber', pattern: 'none' });                  // the hood's lintel beam
    b.box(0.03, 0.7, 0.03, { at: [0, 0.92, 1.05], tones: 'iron' });
    // charms on the lintel: bundles, a horseshoe, little bottles
    for (const [hx, kind] of [[-0.75, 'h'], [-0.35, 'b'], [0.3, 'b'], [0.7, 'h']]) {
      if (kind === 'h') { b.box(0.03, 0.1, 0.03, { at: [hx, 1.52, 1.34], tones: TP.thatch }); b.box(0.12, 0.24, 0.1, { at: [hx, 1.28, 1.34], tones: hx < 0 ? 'leaf' : 'mossTuft', layer: 'soft' }); }
      else { b.cylinder(0.05, 0.04, 0.12, { at: [hx, 1.72, 1.24], tones: hx < 0 ? 'copper' : CLOTH.purple, segments: 8 }); }
    }
    b.box(0.2, 0.03, 0.03, { at: [0.0, 1.55, 1.36], tones: 'iron' });                                  // horseshoe-ish
    for (const s of [-1, 1]) b.box(0.03, 0.14, 0.03, { at: [s * 0.09, 1.42, 1.36], tones: 'iron' });
  });
  // green-gold, not orange: an orange pool under the blue night wash reads salmon-pink
  room.light({ pos: [cx, 0.45, cz + 0.3], color: '#E8C850', r: 3.2, kind: 'fire', intensity: 1.3 });
  room.light({ pos: [cx + 0.3, 1.0, cz + 0.7], color: '#B0E060', r: 2.8, kind: 'fire', intensity: 1.15 });
  // bubbles (glow) + steam (lit puffs curling up into the hood)
  const bub = new Builder(room.engine, { name: 'house-1-bubbles' });
  for (const [x, z, s] of [[0.12, 0.05, 0.09], [-0.15, 0.1, 0.07], [0.02, -0.18, 0.08], [-0.08, -0.05, 0.05], [0.2, -0.12, 0.05]]) {
    bub.box(s, s * 0.8, s, { at: [x, 0, z], tones: 'glass', layer: 'glass', glow: glassGlow(TP.mossTuft[0], 0.45), glowKind: 1 });
  }
  const bubG = glowGroup(room, bub, 'house-1-bubbles');
  const bubPivot = new THREE.Group();
  bubPivot.position.set(cx, 0.78, cz);
  bubPivot.add(bubG);
  const steam = motes(room, { n: 14, seed: 11, sources: [[cx, cz + 0.05], [cx + 0.15, cz - 0.1], [cx - 0.15, cz]], jitter: 0.2, box: { y0: 0.82, y1: 1.85 }, size: 0.12, glow: false, tones: STEAM, layer: 'soft', mode: 'steam', speed: 0.32, sway: 0.1, grow: 1.4, name: 'steam' });

  // ---- the black cat asleep in a wicker basket in the nook
  at(room, { x: -3.55, z: -0.15, ry: 0.35 }, (b, g) => {
    b.cylinder(0.36, 0.4, 0.2, { at: [0, 0, 0], tones: 'thatch', pattern: 'thatch', scale: 0.5, segments: 12 });
    b.cylinder(0.4, 0.4, 0.05, { at: [0, 0.2, 0], tones: 'thatch', tint: 0.94, segments: 12 });
    b.cylinder(0.32, 0.32, 0.04, { at: [0, 0.17, 0], tones: CLOTH.red, layer: 'soft', segments: 12 });
    b.box(0.36, 0.15, 0.25, { at: [0, 0.2, -0.02], tones: 'crow' });
    b.box(0.3, 0.06, 0.2, { at: [0, 0.34, -0.03], tones: 'crow', tint: 1.05 });
    b.box(0.15, 0.13, 0.14, { at: [0.2, 0.22, 0.06], tones: 'crow', tint: 1.06 });
    for (const s of [-1, 1]) b.prism([[-0.03, 0], [0.03, 0], [0, 0.06]], 0.025, { at: [0.2 + s * 0.04, 0.35, 0.06], tones: 'crow' });
    b.box(0.32, 0.05, 0.06, { at: [-0.02, 0.2, 0.13], ry: 0.15, tones: 'crow', tint: 0.96 });
    for (const s of [-1, 1]) g.box(0.025, 0.014, 0.01, { at: [0.2 + s * 0.035, 0.29, 0.135], tones: 'glass', layer: 'glass', glow: TP.glow[1], glowKind: 1 });
  });
  room.solidAt(-3.55, -0.15, 0.8, 0.8);
  // a besom against the nook wall, a pile of grimoires on the floor
  at(room, { x: -X + 0.25, z: -1.2, rz: 0.18 }, (b) => {
    b.box(0.05, 1.5, 0.05, { at: [0, 0.4, 0], tones: 'plank' });
    b.cylinder(0.08, 0.2, 0.44, { at: [0, 0, 0], tones: 'thatch', segments: 8, layer: 'soft' });
    b.cylinder(0.085, 0.085, 0.05, { at: [0, 0.38, 0], tones: CLOTH.red, segments: 8 });
  });
  room.solidAt(-X + 0.25, -1.2, 0.45, 0.45);

  // ---- back wall right of the nook: potion shelves, the grimoire page, herbs; the bookcase of grimoires
  Wl.shelf(room, { wall: 'back', x: -0.55, y: 1.15, w: 1.0, items: ['potion:0', 'jar', 'potion:4', 'skull'] });
  Wl.shelf(room, { wall: 'back', x: -0.55, y: 1.68, w: 1.0, items: ['potion:2', 'book', 'potion:5', 'potion:1'] });
  onSeg(room, back, 0, 0, (b) => {
    // the torn grimoire page: a cream leaf with an ink sketch of the clock tower, hands straight up
    const px = 2.25, py = 1.55;
    b.prism([[-0.2, 0], [0.22, 0.02], [0.2, 0.5], [0.05, 0.47], [-0.02, 0.52], [-0.21, 0.49]], 0.012, { at: [px, py, 0.012], tones: 'cream', pattern: 'none' });
    b.box(0.1, 0.24, 0.01, { at: [px, py + 0.08, 0.022], tones: 'timber', pattern: 'none' });
    b.box(0.14, 0.04, 0.01, { at: [px, py + 0.32, 0.022], tones: 'timber', pattern: 'none' });
    b.box(0.012, 0.06, 0.01, { at: [px, py + 0.2, 0.028], tones: CLOTH.purple, pattern: 'none' });
    b.box(0.03, 0.03, 0.03, { at: [px + 0.15, py + 0.43, 0.02], tones: 'iron' });                    // the pin
  });
  F.bookshelf(room, { x: 0.25 + 0.0, z: -Z + 0.22, w: 0.75, h: 1.9, shelves: 4, ornaments: ['skull', 'candle'] });

  // ---- two crooked beams across the room, hung with drying herbs, garlic and a lantern
  const beamY = 2.45;
  const beams = [];
  for (const [hx, n, w] of [[-0.55, 5, 1.2], [2.25, 4, 0.9], [3.95, 3, 0.6]]) Wl.herbs(room, { wall: 'back', x: hx, y: 2.58, n, w });
  const hr = (k) => (k * 7919) % 13 / 13;
  for (const [bz, x0, x1, rz] of beams) {
    room.b.box(x1 - x0, 0.2, 0.22, { at: [(x0 + x1) / 2, beamY, bz], rz, tones: 'timber', pattern: 'none', origin: 'center' });
    let k = 0;
    for (let x = x0 + 0.35; x < x1 - 0.25; x += 0.42, k++) {
      const len = 0.18 + hr(k + bz * 10) * 0.25, kind = k % 4;
      room.b.box(0.02, 0.12, 0.02, { at: [x, beamY - 0.22, bz], tones: TP.thatch });
      if (kind === 3) {      // a garlic string
        for (let q = 0; q < 4; q++) room.b.box(0.07, 0.07, 0.07, { at: [x, beamY - 0.3 - q * 0.08, bz], tones: 'cream', ry: q, layer: 'soft' });
      } else room.b.box(0.13, len, 0.1, { at: [x, beamY - 0.12 - len, bz], tones: kind === 1 ? 'mossTuft' : kind === 2 ? LAVENDER : 'leaf', layer: 'soft', tint: [1, 0.94, 1.05][k % 3] });
    }
  }
  F.hangingLantern(room, { x: 2.55, z: 1.45, y: 1.6, r: 3.0, intensity: 1.2 });

  // ---- the bed in the back-right corner under a green patchwork, the nightstand under the porthole
  const bx = X - 0.6, bz = -Z + 1.05;
  const bed = F.bed(room, { x: bx, z: bz, quilt: 'green', frame: 'timber' });
  F.nightstand(room, { x: 2.75, z: -Z + 0.24, light: false });

  // ---- the leaded window's sill: the straw poppet with no head (its head on the floor beneath)
  onSeg(room, back, 1.15, 1.05, (b) => {
    b.box(0.12, 0.16, 0.08, { at: [0.15, 0.0, 0.12], tones: 'thatch', layer: 'soft' });            // body
    b.box(0.26, 0.04, 0.05, { at: [0.15, 0.11, 0.12], tones: 'thatch', layer: 'soft', tint: 0.95 }); // arms
    for (const s of [-1, 1]) b.box(0.04, 0.1, 0.05, { at: [0.15 + s * 0.035, -0.06, 0.15], tones: 'thatch', tint: 0.94 });
    b.box(0.12, 0.02, 0.085, { at: [0.15, 0.07, 0.125], tones: CLOTH.red });                         // red thread
    b.box(0.03, 0.03, 0.03, { at: [0.15, 0.16, 0.12], tones: 'thatch', tint: 0.9 });                  // the torn neck
    b.cylinder(0.05, 0.05, 0.12, { at: [-0.25, 0.0, 0.12], tones: 'copper', segments: 8 });            // a little bottle
  });
  room.b.box(0.09, 0.09, 0.09, { at: [1.45, 0, -Z + 0.35], ry: 0.6, tones: 'thatch', layer: 'soft' }); // the head
  room.b.box(0.03, 0.03, 0.02, { at: [1.45, 0.055, -Z + 0.4], tones: 'crow' });

  // ---- the round table: crystal ball, the tarot spread with ONE card face-down, a black candle; a violet rug
  const tx = 1.15, tz = 0.35;
  F.rug(room, { x: tx, z: tz + 0.05, w: 2.6, d: 2.0, oval: true, tones: PURPLE, border: 'gold' });
  F.table(room, {
    x: tx, z: tz, round: true, items: false,
    extra: (b, g, top) => {
      b.cylinder(0.52, 0.52, 0.012, { at: [0, top, 0], tones: PURPLE, segments: 16, layer: 'soft' });
      b.cylinder(0.09, 0.07, 0.05, { at: [-0.12, top + 0.012, -0.16], tones: 'brass', segments: 8 });
      g.cylinder(0.1, 0.14, 0.1, { at: [-0.12, top + 0.06, -0.16], tones: 'glass', layer: 'glass', glow: TP.flowerViolet, glowKind: 2, segments: 8 });
      g.cylinder(0.14, 0.09, 0.1, { at: [-0.12, top + 0.16, -0.16], tones: 'glass', layer: 'glass', glow: TP.holyGlow, glowKind: 2, segments: 8 });
      // the spread: five big cards in a cross; the centre one lies face-down (purple back, gold eye-less star)
      const cards = [[0, 0.15, 0, true], [-0.2, 0.15, 0], [0.2, 0.15, 0], [0, -0.07, 0], [0, 0.37, 0], [0.38, 0.0, 0.5]];
      for (const [x, z, r, down] of cards) {
        b.box(0.14, 0.008, 0.2, { at: [x + 0.08, top + 0.014, z], ry: r ?? 0, tones: down ? CLOTH.purple : 'cream', pattern: 'none' });
        if (down) b.box(0.06, 0.004, 0.06, { at: [x + 0.08, top + 0.022, z], ry: Math.PI / 4, tones: CLOTH.gold });
        else b.box(0.08, 0.004, 0.11, { at: [x + 0.08, top + 0.022, z], ry: r ?? 0, tones: [CLOTH.red, CLOTH.blue, CLOTH.green, CLOTH.gold, CLOTH.red][Math.round((x + z) * 10 + 9) % 5] });
      }
      b.cylinder(0.06, 0.06, 0.02, { at: [-0.36, top + 0.012, 0.18], tones: 'brass', segments: 8 });
      b.box(0.05, 0.2, 0.05, { at: [-0.36, top + 0.03, 0.18], tones: 'crow' });
      g.box(0.05, 0.06, 0.05, { at: [-0.36, top + 0.23, 0.18], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    },
  });
  room.light({ pos: [tx - 0.12, 1.15, tz - 0.16], color: '#B49CE8', r: 2.0, kind: 'lantern', intensity: 1.0 });
  F.chair(room, { x: tx - 0.95, z: tz, ry: Math.PI / 2 });
  F.stool(room, { x: tx + 0.9, z: tz + 0.25 });

  // ---- clutter: a jar crate, stacked grimoires, a mortar, toadstools; the jack-o'-lantern + pumpkins by the door
  at(room, { x: -0.95, z: -1.95 }, (b) => {
    b.box(0.5, 0.3, 0.36, { at: [0, 0, 0], tones: 'plank', pattern: 'boards', scale: 0.6 });
    for (const [x, z, k] of [[-0.14, -0.06, 0], [0.0, 0.07, 3], [0.14, -0.05, 5], [0.08, -0.1, 1]]) b.cylinder(0.055, 0.055, 0.16, { at: [x, 0.3, z], tones: ctx.POTIONS[k], segments: 8 });
    for (let k = 0; k < 4; k++) b.box(0.3, 0.07, 0.22, { at: [0.55, k * 0.07, 0.05], ry: (k % 2 ? 0.2 : -0.15), tones: [CLOTH.red, CLOTH.purple, CLOTH.green, 'timber'][k] });
  });
  room.solidAt(-0.75, -1.95, 1.0, 0.5);
  const pumpkin = (b, x, z, r) => {
    b.cylinder(r * 0.8, r, r * 0.55, { at: [x, 0, z], tones: TP.pumpkin, segments: 8 });
    b.cylinder(r, r * 0.75, r * 0.5, { at: [x, r * 0.55, z], tones: TP.pumpkin, tint: 1.04, segments: 8 });
    b.box(0.04, 0.09, 0.04, { at: [x, r * 1.05, z], rz: 0.25, tones: 'leaf' });
  };
  at(room, { x: 3.4, z: 2.4 }, (b, g) => {
    pumpkin(b, 0, 0, 0.27);
    for (const s of [-1, 1]) g.prism([[-0.045, 0], [0.045, 0], [0, 0.06]], 0.02, { at: [s * 0.1, 0.24, 0.265], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    g.box(0.22, 0.05, 0.02, { at: [0, 0.12, 0.265], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    pumpkin(b, 0.5, -0.1, 0.16);
  });
  room.solidAt(3.6, 2.35, 1.0, 0.65);
  at(room, { x: X - 0.35, z: 0.9 }, (b) => {
    b.cylinder(0.17, 0.21, 0.3, { at: [0, 0, 0], tones: 'brick', segments: 8 });
    b.cylinder(0.2, 0.2, 0.04, { at: [0, 0.28, 0], tones: 'dirt', segments: 8 });
    for (const [x, z, h, r] of [[0, 0, 0.26, 0.13], [0.09, 0.07, 0.17, 0.09], [-0.09, -0.04, 0.14, 0.07]]) {
      b.box(0.035, h, 0.035, { at: [x, 0.3, z], tones: TP.ivory });
      b.cylinder(r, r * 0.4, r * 0.7, { at: [x, 0.3 + h, z], tones: TP.toadstool, segments: 8 });
    }
  });
  room.solidAt(X - 0.35, 0.9, 0.44, 0.44);
  F.chest(room, { x: X - 0.3, z: -0.2, ry: -Math.PI / 2 });
  F.doormat(room, { x: 0, z: Z - 0.4 });

  room.spot('cauldron', cx + 1.0, cz + 0.9, -Math.PI * 0.7);
  room.spot('table', tx, tz + 1.0, Math.PI);
  room.spot('cat', -3.0, 0.35, -Math.PI * 0.6);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx - 0.95, z: bz + 0.55, facing: Math.PI / 2 },
    extras: [bubPivot, steam.group],
    update(t) {
      const k = Math.floor(t * 4);                               // stepped 4 fps
      bubPivot.rotation.y = k * 1.3;
      bubPivot.position.y = 0.78 + (k % 3) * 0.012;
      bubPivot.scale.setScalar(1 + (k % 2) * 0.15);
      steam.update(t);
    },
    bedRect: bed.rect,
  };
}
