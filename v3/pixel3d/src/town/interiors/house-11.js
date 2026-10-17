// house-11 interior: Fernlea Oak - the child naturalist's den in the hollow of the oak (owner: lore-10..14 builder).
// docs/LORE.md row 11, docs/INTERIORS.md.
// A ROUND room: the hollow of the trunk. Heartwood walls curve round the back corners (stepped heartwood staves on a
// super-ellipse), the floor is the cut heart of the tree - concentric growth rings. No hearth (you do not light fires
// inside a tree): by day the oak's crown throws DAPPLED leaf-light through the open top (a shadow-only leaf canopy far up
// the sun ray), green light pours through a wide leafy window; at night FIREFLIES drift through the hollow and the
// bug jars under the loft glow.
// Story: a child lives here and collects everything - feathers, nests, beetles in jars, a butterfly frame. Pinned
// across the back wall are crayon drawings of the town: little houses, the sun, the clock tower ... and in the biggest
// one a TALL SHADOWY FIGURE with two red eyes standing among the houses. Innocence that saw something. A rope swing
// hangs from the great branch (it sways), a ladder climbs to the sleeping loft, and under a lifted floorboard by the
// door is the "secret club" tin (a red box, a crayon skull flag). The Lantern-maker's lantern hangs from the branch.
// Ambiance: light green-gold oak, round sun-flecks (none at night), leaf greens, crayon primaries; dappled light; fireflies. Playful, with a shiver.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 8, d: 6, h: 3.3, wall: 'planks', pal: 3, floor: 'boards' };

// ---------------------------------------------------------------------------------------------- local helpers
/** Animated specks: n small boxes in ONE mesh, moved per particle (stepped 8 fps, pure function of t). */
function particles(room, ctx, { name, n, make, path, glow = true }) {
  const b = new Builder(room.engine, { name });
  const layer = glow ? 'glass' : 'soft', ranges = [];
  for (let i = 0; i < n; i++) {
    const a = (b.layers[layer]?.pos.length ?? 0) / 3;
    make(b, i, layer);
    ranges.push([a, b.layers[layer].pos.length / 3]);
  }
  const grp = b.build({ name, castShadow: false, receiveShadow: false });
  const mesh = grp.children[0];
  if (glow) mesh.material = ctx.kit.interiorGlowMaterial(room.engine);
  mesh.frustumCulled = false;
  const pos = mesh.geometry.getAttribute('position'), base = pos.array.slice();
  let last = -1;
  return {
    group: grp,
    update(t) {
      const k = Math.floor(t * 8) / 8;
      if (k === last) return;
      last = k;
      for (let i = 0; i < n; i++) {
        const [ox, oy, oz] = path(i, k);
        for (let v = ranges[i][0]; v < ranges[i][1]; v++) {
          pos.array[v * 3] = base[v * 3] + ox; pos.array[v * 3 + 1] = base[v * 3 + 1] + oy; pos.array[v * 3 + 2] = base[v * 3 + 2] + oz;
        }
      }
      pos.needsUpdate = true;
    },
  };
}
/**
 * Shadow-only ceiling: a plane high up the sun ray (off screen) with holes that let sun onto the floor. The holes are
 * either grid cells where `open(x, z)` is true or `holes` (polygons [[x, z], ...], room-local, non-overlapping; smooth
 * rounded sun-flecks). At NIGHT (the sun colour turns blue, or the sun is down) the moon must not paint the day
 * patches: `night: 'lid'` closes every hole (an extra lid in the same mesh, toggled by drawRange: no extra call),
 * `night: 'off'` hides the mask (even moonlight over the open dollhouse).
 */
function sunMask(room, { open, holes, cell = 0.2, margin = 6, name, night = 'lid' }) {
  const b = new Builder(room.engine, { name });
  const x0 = -room.W / 2 - margin, z0 = -room.D / 2 - margin;
  const nx = Math.ceil((room.W + 2 * margin) / cell), nz = Math.ceil((room.D + 2 * margin) / cell);
  const X1 = x0 + nx * cell, Z1 = z0 + nz * cell;
  if (holes) {
    const V2 = (x, z) => new THREE.Vector2(x, z);
    const shape = new THREE.Shape([V2(x0, z0), V2(X1, z0), V2(X1, Z1), V2(x0, Z1)]);
    for (const pts of holes) shape.holes.push(new THREE.Path(pts.map(([x, z]) => V2(x, z))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 1 });
    b.add(g, new THREE.Matrix4().makeRotationX(Math.PI / 2), { tones: 'timber' });      // shape (x, y) -> world (x, z)
    g.dispose();
  } else {
    const rowRuns = (j) => {
      const runs = []; let s = -1;
      for (let i = 0; i <= nx; i++) {
        const closed = i < nx && !open(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
        if (closed && s < 0) s = i; else if (!closed && s >= 0) { runs.push([s, i]); s = -1; }
      }
      return runs;
    };
    let start = 0, prev = rowRuns(0), key = JSON.stringify(prev);
    const flush = (j0, j1, runs) => {
      for (const [i0, i1] of runs) b.box((i1 - i0) * cell, 0.04, (j1 - j0) * cell, { at: [x0 + (i0 + i1) / 2 * cell, 0, z0 + (j0 + j1) / 2 * cell], tones: 'timber' });
    };
    for (let j = 1; j <= nz; j++) {
      const runs = j < nz ? rowRuns(j) : null, k = runs ? JSON.stringify(runs) : null;
      if (k !== key) { flush(start, j, prev); start = j; prev = runs; key = k; }
    }
  }
  const nDay = (b.layers.solid?.pos.length ?? 0) / 3;
  if (night === 'lid') b.box(X1 - x0, 0.04, Z1 - z0, { at: [(x0 + X1) / 2, -0.08, (z0 + Z1) / 2], tones: 'timber' });
  const holder = new THREE.Group(); holder.name = name;
  const grp = b.build({ name, castShadow: true, receiveShadow: false });
  holder.add(grp);
  const geo = grp.children[0]?.geometry, nAll = geo?.getAttribute('position').count ?? 0;
  const sun = room.engine.uniforms?.uSunDir?.value, sunC = room.engine.uniforms?.uSunColor?.value;
  return {
    group: holder,
    isNight: () => !sun || sun.y < 0.08 || (sunC && sunC.b > sunC.r + 0.02),
    update() {
      const dark = this.isNight();
      if (!sun || sun.y < 0.02 || (dark && night === 'off')) { holder.visible = false; return; }
      holder.visible = true;
      geo?.setDrawRange(0, dark ? nAll : nDay);
      const h = Math.min(20, 30 * sun.y);
      holder.position.set((sun.x * h) / sun.y, h, (sun.z * h) / sun.y);
    },
  };
}

export default function build(room, ctx) {
  const { FURNITURE: F, WALL: Wl, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp, M } = ctx;
  const W = room.W, D = room.D, H = room.H;
  // green-gold oak (leaf light on young heartwood), lighter than the town's timber
  const heart = paintRamp('#aaa664', { lightness: 0.63 });
  const ringT = [paintRamp('#d0d08a', { lightness: 0.76 }), paintRamp('#b8b46c', { lightness: 0.68 })];
  const crayon = { red: '#D0503A', blue: '#3A6ED0', yellow: '#E8C030', green: '#4EA040', black: '#2A2430' };
  const leafG = 'leaf';

  // ---- shell: heartwood staves all the way up, the floor is the cut heart of the oak; a round knot-hole window
  //      (left) and a wide leafy window above the loft (right)
  const winR = { x: 2.55, y: 1.95, w: 1.35, h: 0.9 };
  room.shell({
    windows: [
      { x: -3.0, y: 1.55, w: 0.62, h: 0.62, panes: [1, 1], curtains: null, frame: 'trunk' },
      { ...winR, panes: [3, 2], curtains: null, frame: 'trunk' },
    ],
    wallTones: { upper: { tones: heart, pattern: 'vboards', scale: 1.9 }, lower: { tones: heart, pattern: 'vboards', scale: 1.9 } },
    dado: 0, floorTones: ringT[1], floorPattern: 'boards', beams: false,
  });
  // green leaf-light in the big window (a tinted pane over the kit pane: kind 3 = follows the daylight) + leaves in it
  room.wallFrame('back', ({ full, glow }) => {
    glow.box(winR.w, winR.h, 0.02, { at: [winR.x, winR.y, -0.1], tones: 'glass', layer: 'glass', glow: '#A8E070', glowKind: 3 });
    for (const [dx, dy, s] of [[-0.55, 0.72, 0.2], [0.45, 0.76, 0.22], [0.66, 0.5, 0.16]]) {
      full.box(s, s * 0.7, 0.12, { at: [winR.x + dx, winR.y + dy, -0.04], tones: leafG, ry: 0.2, tint: 1.02 });
    }
    // a bark ring round the knot-hole window
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      full.box(0.28, 0.12, 0.08, { at: [-3.0 + Math.cos(a) * 0.42, 1.86 + Math.sin(a) * 0.42, 0.04], rz: a + Math.PI / 2, tones: 'trunk', origin: 'center' });
    }
  });

  // ---- the ROUND hollow: heartwood staves fill the corners out to a super-ellipse (|x/a|^4 + |z/b|^4 = 1)
  {
    const a = W / 2, bb = D / 2, cw = 0.25, wins = [{ x: -3.0, y: 1.55, w: 0.62, h: 0.62 }, winR];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const front = sz > 0;
      for (let x = a - cw / 2; x > 0; x -= cw) {
        const zIn = bb * Math.pow(Math.max(0, 1 - Math.pow(x / a, 4)), 0.25), depth = bb - zIn;
        if (depth < 0.06) break;
        const h = front ? 0.42 : H, cz = sz * (bb - depth / 2);
        const st = { tones: heart, pattern: 'vboards', scale: 1.9, tint: 0.9 + 0.05 * ((x * 8) % 2 > 1 ? 1 : 0) };
        const win = front ? null : wins.find((q) => Math.abs(sx * x - q.x) < q.w / 2 + 0.2);
        if (win) {                                       // a stave in front of a window: open around the pane
          room.b.box(cw + 0.01, win.y - 0.1, depth, { ...st, at: [sx * x, 0, cz] });
          room.b.box(cw + 0.01, h - win.y - win.h - 0.1, depth, { ...st, at: [sx * x, win.y + win.h + 0.1, cz] });
        } else room.b.box(cw + 0.01, h, depth, { ...st, at: [sx * x, 0, cz] });
        room.solid(sx * x - cw / 2, cz - depth / 2, sx * x + cw / 2, cz + depth / 2, 'wall-curve');
      }
    }
  }
  // smooth curved wall caps over the stave tops (one polygon per corner, following the super-ellipse a little inside
  // the staves' stepped inner edge, so the top reads as one clean rounded rim, not a staircase)
  {
    const a = W / 2, bb = D / 2, cw = 0.25;
    const zIn = (x) => bb * Math.pow(Math.max(0, 1 - Math.pow(Math.min(x, a) / a, 4)), 0.25);
    let xEnd = a;                                               // the last stave's inner edge (same loop as the staves)
    for (let x = a - cw / 2; x > 0; x -= cw) { if (bb - zIn(x) < 0.06) break; xEnd = x - cw / 2; }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const front = sz > 0, pts = [[a, bb], [a, 0]];
      for (let x = a; x >= xEnd - 1e-6; x -= 0.08) pts.push([x, Math.max(0, zIn(x + cw / 2 + 0.02) - 0.04)]);
      pts.push([xEnd, Math.max(0, zIn(xEnd + cw / 2 + 0.02) - 0.04)], [xEnd, bb]);
      const y = front ? 0.42 : H, th = front ? 0.07 : 0.12;
      room.b.prism(pts.map(([x, z]) => [sx * x, sz * z]), th, { at: [0, y + th / 2, 0], rx: Math.PI / 2, tones: 'timber', tint: front ? 0.92 : 1 });
    }
  }
  // the floor: concentric growth rings of the cut heartwood
  for (let k = 0; k < 5; k++) {
    const r = 2.7 - k * 0.55;
    room.b.push(M({ at: [0, 0.002 + k * 0.003, 0.1], s: [1.32, 1, 1] }));
    room.b.cylinder(r, r, 0.004, { at: [0, 0, 0], tones: ringT[k % 2], segments: 16, layer: 'soft', tint: 1 - k * 0.015 });
    room.b.pop();
  }
  room.b.box(0.18, 0.012, 0.18, { at: [0, 0.02, 0.1], ry: Math.PI / 4, tones: 'trunk' });   // the pith

  // ---- the great branch growing through the hollow (left wall high -> right), leaves where it meets the light
  room.b.push(M({ at: [-W / 2, H - 0.62, -0.6], rz: 0.12 }));
  room.b.box(3.5, 0.24, 0.28, { at: [1.75, -0.12, 0], tones: 'trunk', pattern: 'logs', scale: 0.6 });
  room.b.pop();
  for (const [x, y, z, s] of [[-0.55, H - 0.05, -0.5, 0.24], [-0.75, H + 0.05, -0.75, 0.3], [-0.35, H - 0.15, -0.65, 0.2], [-0.9, H - 0.1, -0.45, 0.18]]) {
    room.b.box(s, s * 0.7, s, { at: [x, y - s * 0.25, z], ry: x * 3, tones: leafG, layer: 'soft' });
  }

  // ---- crayon drawings pinned across the back wall (the biggest: the tall shadowy figure among the houses)
  room.wallFrame('back', ({ full, glow }) => {
    const sheet = (x, y, w, h, ry, draw) => {
      full.push(M({ at: [x, y, 0.02], rz: ry }));
      full.box(w, h, 0.012, { at: [0, 0, 0], tones: 'cream', tint: 1.04, origin: 'center' });
      full.box(0.04, 0.04, 0.03, { at: [0, h / 2 - 0.05, 0.01], tones: '#C04040' });               // pin
      draw(full, glow, w, h);
      full.pop();
    };
    const house = (b, x, y, s, c) => {
      b.box(s, s * 0.8, 0.008, { at: [x, y, 0.01], tones: c });
      b.prism([[-s * 0.6, 0], [s * 0.6, 0], [0, s * 0.55]], 0.008, { at: [x, y + s * 0.8, 0.01], tones: crayon.red });
    };
    // 1: the town with the tall figure (big, centre)
    sheet(0.2, 1.62, 0.8, 0.62, 0.03, (b, g) => {
      b.box(0.74, 0.03, 0.008, { at: [0, -0.24, 0.01], tones: crayon.green, origin: 'center' });
      house(b, -0.27, -0.22, 0.1, crayon.blue); house(b, -0.12, -0.22, 0.08, crayon.yellow); house(b, 0.22, -0.22, 0.1, crayon.blue);
      b.box(0.05, 0.3, 0.008, { at: [0.3, -0.22, 0.012], tones: '#8A8A9A' });                          // the clock tower
      b.box(0.07, 0.42, 0.01, { at: [0.06, -0.24, 0.016], tones: crayon.black });                        // THE FIGURE
      b.box(0.1, 0.1, 0.01, { at: [0.06, 0.17, 0.016], tones: crayon.black });
      b.box(0.24, 0.025, 0.01, { at: [0.06, 0.06, 0.016], rz: -0.35, tones: crayon.black, origin: 'center' });
      for (const ex of [0.04, 0.08]) g.box(0.018, 0.018, 0.01, { at: [ex, 0.22, 0.026], tones: 'glass', layer: 'glass', glow: '#FF4030', glowKind: 1 });
      g.box(0.08, 0.08, 0.01, { at: [-0.3, 0.2, 0.014], tones: 'glass', layer: 'glass', glow: '#E8E0A0', glowKind: 1 });   // a moon
    });
    // 2: the sun over a meadow; 3: a bird; 4: a beetle; 5: the swing (the child)
    sheet(-0.55, 1.75, 0.46, 0.36, -0.08, (b) => {
      b.box(0.14, 0.14, 0.008, { at: [0.1, 0.02, 0.01], ry: 0, rz: 0.78, tones: crayon.yellow, origin: 'center' });
      b.box(0.4, 0.06, 0.008, { at: [0, -0.15, 0.01], tones: crayon.green });
    });
    sheet(0.95, 1.9, 0.4, 0.32, 0.1, (b) => {
      b.box(0.16, 0.08, 0.008, { at: [0, 0, 0.01], tones: crayon.blue, origin: 'center' });
      b.box(0.1, 0.03, 0.008, { at: [-0.08, 0.04, 0.01], rz: 0.6, tones: crayon.blue, origin: 'center' });
    });
    sheet(0.95, 1.36, 0.36, 0.3, -0.06, (b) => {
      b.box(0.12, 0.16, 0.008, { at: [0, 0, 0.01], tones: crayon.green, origin: 'center' });
      b.box(0.2, 0.02, 0.008, { at: [0, 0.02, 0.012], tones: crayon.black, origin: 'center' });
    });
    sheet(-0.55, 1.28, 0.38, 0.34, 0.05, (b) => {
      b.box(0.02, 0.22, 0.008, { at: [-0.06, -0.06, 0.01], tones: crayon.black, origin: 'center' });
      b.box(0.02, 0.22, 0.008, { at: [0.06, -0.06, 0.01], tones: crayon.black, origin: 'center' });
      b.box(0.16, 0.03, 0.008, { at: [0, -0.16, 0.01], tones: crayon.red, origin: 'center' });
    });
  });
  // a shelf of nests, feathers and a butterfly frame under the knot-hole
  room.wallFrame('back', ({ full }) => {
    full.box(1.0, 0.05, 0.3, { at: [-2.85, 1.05, 0.15], tones: 'plank' });
    for (const [x, c] of [[-3.15, 'thatch'], [-2.6, 'thatch']]) {
      full.cylinder(0.14, 0.1, 0.08, { at: [x, 1.1, 0.16], tones: c, segments: 8 });
    }
    for (const x of [-3.12, -3.18]) full.box(0.045, 0.045, 0.045, { at: [x + 0.03, 1.16, 0.16], tones: TP.blue ?? 'blue' });
    for (const [x, rz, c] of [[-2.85, 0.3, CLOTH.blue], [-2.8, -0.2, 'cream'], [-2.9, 0.1, CLOTH.red]]) full.box(0.025, 0.32, 0.02, { at: [x, 1.1, 0.24], rz, tones: c });
    full.box(0.42, 0.32, 0.03, { at: [-1.55, 0.7, 0.02], tones: 'timber' });                          // butterfly frame
    full.box(0.36, 0.26, 0.012, { at: [-1.55, 0.73, 0.04], tones: 'cream' });
    for (const s of [-1, 1]) full.box(0.1, 0.1, 0.01, { at: [-1.55 + s * 0.06, 0.82, 0.05], rz: s * 0.5, tones: crayon.blue, origin: 'center' });
  });

  // ---- the sleeping LOFT in the back-right curve: platform, rail, ladder; bug jars + a nest under it
  const lx0 = 1.25, lx1 = W / 2, lz1 = -1.15, ly = 1.6;
  {
    const b = room.b;
    b.box(lx1 - lx0, 0.12, lz1 + D / 2, { at: [(lx0 + lx1) / 2, ly - 0.12, (lz1 - D / 2) / 2], tones: 'plank', pattern: 'planks' });
    for (const x of [lx0 + 0.06]) { b.box(0.12, ly, 0.12, { at: [x, 0, lz1 - 0.06], tones: 'trunk' }); room.solidAt(x, lz1 - 0.06, 0.14, 0.14); }
    b.box(lx1 - lx0, 0.06, 0.06, { at: [(lx0 + lx1) / 2, ly + 0.5, lz1 - 0.03], tones: 'trunk' });
    for (let x = lx0 + 0.06; x < lx1; x += 0.36) b.box(0.05, 0.5, 0.05, { at: [x, ly, lz1 - 0.03], tones: 'trunk', tint: 0.95 });
    // the bed up there: a straw mattress, a patchwork of greens, a stuffed rabbit
    b.box(1.0, 0.16, 1.7, { at: [3.2, ly, -2.15], tones: 'cream', tint: 0.95, layer: 'soft' });
    for (let k = 0; k < 3; k++) b.box(1.04, 0.07, 0.42, { at: [3.2, ly + 0.15, -1.95 + k * 0.42 - 0.2], tones: [CLOTH.green, 'leaf', CLOTH.gold][k], layer: 'soft' });
    b.box(0.5, 0.12, 0.3, { at: [3.2, ly + 0.16, -2.75], tones: 'cream', layer: 'soft' });
    b.box(0.14, 0.2, 0.12, { at: [2.85, ly + 0.2, -1.4], tones: 'cream', tint: 0.92, layer: 'soft' });
    b.box(0.04, 0.12, 0.03, { at: [2.81, ly + 0.4, -1.4], tones: 'cream', tint: 0.92 }); b.box(0.04, 0.12, 0.03, { at: [2.89, ly + 0.4, -1.4], tones: 'cream', tint: 0.92 });
    // ladder from the floor to the loft edge
    for (const s of [-1, 1]) b.hexa([
      new THREE.Vector3(lx0 - 0.35 + s * 0.22 - 0.03, 0, lz1 + 0.55), new THREE.Vector3(lx0 - 0.35 + s * 0.22 + 0.03, 0, lz1 + 0.55),
      new THREE.Vector3(lx0 - 0.35 + s * 0.22 - 0.03, ly + 0.5, lz1 + 0.02), new THREE.Vector3(lx0 - 0.35 + s * 0.22 + 0.03, ly + 0.5, lz1 + 0.02),
      new THREE.Vector3(lx0 - 0.35 + s * 0.22 - 0.03, 0, lz1 + 0.61), new THREE.Vector3(lx0 - 0.35 + s * 0.22 + 0.03, 0, lz1 + 0.61),
      new THREE.Vector3(lx0 - 0.35 + s * 0.22 - 0.03, ly + 0.5, lz1 + 0.08), new THREE.Vector3(lx0 - 0.35 + s * 0.22 + 0.03, ly + 0.5, lz1 + 0.08)], { tones: 'trunk' });
    for (let k = 1; k < 7; k++) { const y = (k * (ly + 0.3)) / 7; b.box(0.44, 0.04, 0.04, { at: [lx0 - 0.35, y, lz1 + 0.58 - (0.53 * y) / (ly + 0.5)], tones: 'plank' }); }
    room.solidAt(lx0 - 0.35, lz1 + 0.35, 0.5, 0.4);
  }
  // bug jars on a crate shelf at the foot of the loft (they glow at night: fireflies and glow-beetles)
  {
    const cx = 2.75, cz = -0.75, b = room.b, g = room.g;
    b.box(1.3, 0.5, 0.36, { at: [cx, 0, cz], tones: 'plank', pattern: 'boards', tint: 0.95 });
    b.box(1.36, 0.05, 0.4, { at: [cx, 0.5, cz], tones: 'trunk' });
    [[-0.48, '#D8F070'], [-0.2, '#A0E8A0'], [0.08, '#D8F070'], [0.34, '#80D0E0'], [0.55, '#D8F070']].forEach(([dx, c], k) => {
      g.cylinder(0.08, 0.08, 0.2, { at: [cx + dx, 0.55, cz], tones: 'glass', layer: 'glass', glow: c, glowKind: 2, segments: 8 });
      b.box(0.13, 0.04, 0.13, { at: [cx + dx, 0.77, cz], tones: k % 2 ? CLOTH.red : 'cream' });
    });
    room.solidAt(cx, cz, 1.36, 0.4);
    room.light({ pos: [cx, 0.95, cz + 0.2], color: '#C8F088', r: 2.0, kind: 'lantern', intensity: 1.0 });
  }

  // ---- the naturalist's low table with a magnifier and specimens, two stumps for stools, a green oval rug
  const tx = -1.0, tz = 0.55;
  F.table(room, {
    x: tx, z: tz, round: true, w: 1.05, d: 1.05, items: false,
    extra: (b, g, top) => {
      b.cylinder(0.11, 0.11, 0.02, { at: [0.15, top + 0.02, 0.05], tones: 'brass', segments: 8 });     // magnifier
      b.box(0.04, 0.025, 0.2, { at: [0.15, top, 0.22], tones: 'timber' });
      g.cylinder(0.08, 0.08, 0.01, { at: [0.15, top + 0.035, 0.05], tones: 'glass', layer: 'glass', glow: '#C8E8F0', glowKind: 3, segments: 8 });
      b.box(0.3, 0.012, 0.22, { at: [-0.2, top, -0.05], tones: 'cream', ry: 0.2 });                      // notebook
      b.box(0.06, 0.02, 0.04, { at: [-0.2, top + 0.012, -0.05], tones: crayon.green });                  // a beetle on it
      b.cylinder(0.06, 0.06, 0.16, { at: [-0.05, top, -0.32], tones: 'glass', segments: 8 });             // feather jar
      for (const [rz, c] of [[0.3, CLOTH.blue], [-0.25, 'cream'], [0.05, CLOTH.red]]) b.box(0.025, 0.3, 0.02, { at: [-0.05, top + 0.12, -0.32], rz, tones: c });
      b.box(0.08, 0.05, 0.06, { at: [0.35, top, -0.2], tones: 'stone' });                                // a pebble
    },
  });
  for (const [dx, dz] of [[-0.85, 0.05], [0.85, -0.05]]) {
    room.b.cylinder(0.2, 0.22, 0.38, { at: [tx + dx, 0, tz + dz], tones: 'trunk', segments: 8 });
    room.b.cylinder(0.19, 0.19, 0.02, { at: [tx + dx, 0.38, tz + dz], tones: ringT[0], segments: 8 });
    room.solidAt(tx + dx, tz + dz, 0.4, 0.4);
  }

  // ---- the secret club: a lifted floorboard by the front-left curve, the red tin in the hole, a crayon skull flag
  {
    const cx = -2.4, cz = 1.75, b = room.b;
    b.box(0.5, 0.012, 0.95, { at: [cx, 0.001, cz], tones: 'crow' });
    b.box(0.22, 0.12, 0.3, { at: [cx - 0.05, 0.0, cz + 0.05], ry: 0.2, tones: CLOTH.red });
    b.box(0.08, 0.02, 0.06, { at: [cx - 0.05, 0.12, cz + 0.05], ry: 0.2, tones: 'cream' });
    b.push(M({ at: [cx + 0.3, 0.02, cz], rz: 1.1 }));
    b.box(0.5, 0.05, 0.95, { at: [0.25, 0, 0], tones: 'plank', pattern: 'boards' });
    b.pop();
    b.box(0.02, 0.5, 0.02, { at: [cx - 0.2, 0, cz - 0.38], tones: 'timber' });
    b.box(0.22, 0.15, 0.01, { at: [cx - 0.09, 0.33, cz - 0.38], tones: crayon.black });
    b.box(0.06, 0.06, 0.012, { at: [cx - 0.09, 0.4, cz - 0.375], tones: 'cream' });
  }
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });
  F.chest(room, { x: 3.0, z: 1.15, ry: -Math.PI / 2 });

  // ---- the rope swing from the branch (sways), the Lantern-maker's lantern on the branch
  const swing = new Builder(room.engine, { name: 'house-11-swing' });
  const sl = H - 0.42 - 0.55;
  for (const s of [-1, 1]) swing.box(0.025, sl, 0.025, { at: [s * 0.24, -sl, 0], tones: 'thatch' });
  swing.box(0.62, 0.05, 0.24, { at: [0, -sl - 0.02, 0], tones: 'plank' });
  const swingG = swing.build({ name: 'house-11-swing' });
  const swingPivot = new THREE.Group();
  swingPivot.position.set(-1.55, H - 0.42, -0.6);
  swingPivot.add(swingG);
  F.hangingLantern(room, { x: -2.15, z: -0.6, y: 1.75 });

  // ---- daylight: dappled leaf shade from the crown (about half the sun gets through, in blobs)
  // round sun-flecks (each a soft 10-gon), clumped where the crown is thin; none at night (the lid closes them)
  const leafy = (x, z) => Math.sin(x * 1.3 + 0.7) * Math.sin(z * 1.7 - 0.4) + 0.6 * Math.sin((x - z) * 0.9 + 2.1);
  const fr = room.rng, flecks = [];
  for (let x = -W / 2 - 1.5; x <= W / 2 + 1.5; x += 0.6) for (let z = -D / 2 - 2.5; z <= D / 2 + 0.5; z += 0.6) {
    const cx = x + (fr() - 0.5) * 0.06, cz = z + (fr() - 0.5) * 0.06, r = 0.17 + fr() * 0.1, rot = fr() * Math.PI;
    if (leafy(cx, cz) < -0.7 || fr() < 0.12) continue;
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, rr = r * (0.9 + 0.1 * Math.sin(k * 2.7 + cx * 5));
      const ex = Math.cos(a) * rr, ez = Math.sin(a) * rr * 0.85;
      pts.push([cx + ex * Math.cos(rot) - ez * Math.sin(rot), cz + ex * Math.sin(rot) + ez * Math.cos(rot)]);
    }
    flecks.push(pts);
  }
  const mask = sunMask(room, { name: 'house-11-crown', holes: flecks });

  // ---- ambiance: fireflies drifting through the hollow
  const flies = particles(room, ctx, {
    name: 'house-11-fireflies', n: 16,
    make: (b, i, layer) => b.box(0.04, 0.04, 0.04, { at: [0, 0, 0], tones: 'glass', layer, glow: i % 3 ? '#E0F070' : '#B8F080', glowKind: 2 }),
    path: (i, t) => {
      const p = i * 1.618;
      return [Math.sin(t * 0.21 + p * 2.1) * 3.0, 1.2 + Math.sin(t * 0.37 + p) * 0.7 + (i % 3) * 0.3, -0.3 + Math.cos(t * 0.17 + p * 1.7) * 1.9];
    },
  });

  room.spot('drawings', 0.2, -1.9, Math.PI);
  room.spot('table', tx, tz + 1.0, Math.PI);
  room.spot('club', -2.2, 1.2, Math.PI);
  room.spot('swing', -1.55, -0.1, Math.PI);

  return {
    bed: { x: 3.2, z: -2.6, y: ly + 0.3, facing: 0 },
    visit: { x: lx0 - 0.35, z: lz1 + 1.05, facing: Math.PI },
    extras: [mask.group, flies.group, swingPivot],
    update(t) {
      mask.update(); flies.update(t);
      const k = Math.floor(t * 8) / 8;
      swingPivot.rotation.z = Math.sin(k * 1.4) * 0.09;
    },
  };
}
