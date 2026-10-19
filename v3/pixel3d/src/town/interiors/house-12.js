// house-12 interior: Rookery House - the town gossip, scribe of "The Hollowmere Crier" (owner: lore-10..14 builder).
// docs/LORE.md row 12, docs/INTERIORS.md.
// A TALL, NARROW, crooked room (6.4 x 5 m, 3.6 m high): inky dark wallpaper papered over with yellowing old front pages
// (they climb the walls at a lean, like the house), worn ink-stained floorboards littered with paper scraps, one tall leaning window with a
// spyglass on its sill (pointed at the neighbours). No hearth - the only warmth is a green-shaded desk lamp.
// Story: the back wall is the SUSPICION BOARD - fifteen notes pinned in a ring (the fifteen seats of the voting circle),
// red string criss-crossing between them, two notes struck through with a black X, most of the strings converging on
// one note with a black rook feather pinned to it; beside it a calendar with one date CIRCLED in red. A hand printing
// press on the left with bundles of the Crier tied with string, fresh sheets pegged on lines across the room to dry
// (they flutter, scraps drift down), a rook in a hanging cage, a cot buried in newspapers, an overflowing waste basket.
// Ambiance: inky blacks + newsprint cream + red string; a cold green lamp pool; paper scraps. Paranoid, nosy.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 6.4, d: 5.0, h: 3.6, wall: 'plaster', pal: 0, floor: 'boards' };
/** Night look (docs/DEMO.md 4.3 nightAmbient): inky black + newsprint cream. */
// the window's sun patch (sunPanes): its noon tone, its late-sun tone (honey: warm, and LIGHTER, never redder), and the
// faint tone it fades through as the sun drops - still a shade lighter and warmer than the shaded boards (#5a5048 in
// the demo), so the panes always read as sunlight, never as a rug or bricks (critic polish3: at 16:00 / 19:00 the old
// sun-colour multiply turned it a flat salmon-brick block)
const PANE_SUN = new THREE.Color('#94745f'), PANE_LATE = new THREE.Color('#a8885e'), PANE_FADE = new THREE.Color('#766652');
const NIGHT_AMBIENT = { lit: '#ECE0C4', sh: '#9A9490', k: 0.65, gain: 1.2, mist: 0.3, litK: 0.6 };

// ---------------------------------------------------------------------------------------------- local helpers
/**
 * Animated specks: n small boxes in ONE mesh, moved per particle (stepped 8 fps, pure function of t). `night(b, layer)`
 * adds STATIC night-only geometry to the same mesh (soft light pools, glow decals): it is drawn only while the room is
 * dark (drawRange, no extra draw call). dayParticles false: the specks themselves only show in the dark too.
 * nightColor(i) -> hex | null: in the dark speck i glows steadily in that colour (e.g. window-kind ripples that would
 * otherwise go black at night), restored by day.
 * day(b, layer): STATIC day-only geometry (the window's sun patch), drawn only while the room is NOT dark.
 * Vertex order: [day][particles][night] -> by day drawRange(0, ..particles), in the dark drawRange(particles.., end).
 * dayGlow(c: THREE.Color) -> bool: (glow only) recolours the day geometry each frame it changes (c = the colour to
 * use, set in place); false hides it (e.g. the sun too low to reach the floor).
 */
function particles(room, ctx, { name, n, make, path, glow = true, night = null, day = null, dayGlow = null, dayParticles = true, nightColor = null }) {
  const b = new Builder(room.engine, { name });
  const layer = glow ? 'glass' : 'soft', ranges = [];
  if (day) day(b, layer);
  const nDayOnly = (b.layers[layer]?.pos.length ?? 0) / 3;
  for (let i = 0; i < n; i++) {
    const a = (b.layers[layer]?.pos.length ?? 0) / 3;
    make(b, i, layer);
    ranges.push([a, b.layers[layer].pos.length / 3]);
  }
  const nDay = (b.layers[layer]?.pos.length ?? 0) / 3;
  if (night) night(b, layer);
  const grp = b.build({ name, castShadow: false, receiveShadow: false });
  const mesh = grp.children[0];
  if (glow) mesh.material = ctx.kit.interiorGlowMaterial(room.engine);
  mesh.frustumCulled = false;
  const pos = mesh.geometry.getAttribute('position'), base = pos.array.slice(), nAll = pos.count;
  const ga = glow && nightColor ? mesh.geometry.getAttribute('aGlow') : null, gDay = ga?.array.slice();
  const recolor = (dark) => {
    if (!ga) return;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const hex = dark ? nightColor(i) : null;
      if (hex) c.set(hex);
      for (let v = ranges[i][0]; v < ranges[i][1]; v++) {
        if (hex) { ga.array[v * 4] = c.r; ga.array[v * 4 + 1] = c.g; ga.array[v * 4 + 2] = c.b; ga.array[v * 4 + 3] = 1; }
        else for (let q = 0; q < 4; q++) ga.array[v * 4 + q] = gDay[v * 4 + q];
      }
    }
    ga.needsUpdate = true;
  };
  const gd = glow && day && dayGlow ? mesh.geometry.getAttribute('aGlow') : null, tint = new THREE.Color();
  let last = -1, lastDark = null, lastTint = '';
  const dayRange = (show) => mesh.geometry.setDrawRange(show ? 0 : nDayOnly, (dayParticles ? nDay : nDayOnly) - (show ? 0 : nDayOnly));
  return {
    group: grp,
    update(t) {
      if (night || day || ga || !dayParticles) {
        const dark = isDark(room);
        if (dark !== lastDark) {
          if (dark) mesh.geometry.setDrawRange(nDayOnly, nAll - nDayOnly);
          else dayRange(true);
          recolor(dark); lastDark = dark; lastTint = '';
        }
        if (gd && !dark) {
          const show = dayGlow(tint), key = show ? tint.getHexString() : 'off';
          if (key !== lastTint) {
            dayRange(show);
            if (show) { for (let v = 0; v < nDayOnly; v++) { gd.array[v * 4] = tint.r; gd.array[v * 4 + 1] = tint.g; gd.array[v * 4 + 2] = tint.b; } gd.needsUpdate = true; }
            lastTint = key;
          }
        }
      }
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
/** The room is dark: the sun is down or the town light has turned to moonlight (the same test as sunMask's lid). */
function isDark(room) {
  const sun = room.engine.uniforms?.uSunDir?.value, sunC = room.engine.uniforms?.uSunColor?.value;
  return !sun || sun.y < 0.08 || (sunC && sunC.b > sunC.r + 0.02);
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/**
 * A soft light pool as an ordered-dither glow decal (night-only geometry for particles({night})): concentric bands of
 * `cols` (dim -> bright) that dissolve into the surface through a 4x4 Bayer pattern instead of ending in a hard disc.
 * plane 'floor' (y up) or 'back' | 'left' | 'right' (the wall's inner face); (x, y, z) = the centre, r / rv the radii
 * along the plane's u (x, or z on side walls) and v (z on the floor, y on walls). peak 0..1 scales the brightness,
 * fall the falloff exponent, cell the dither cell (u metres; v is stretched for the 30 deg camera). keep(u, v) clips;
 * fade(u, v) -> 0..1 scales the brightness (a soft edge where a hard clip would show); off: the wall decal's distance
 * from the wall face (in front of wall-mounted boards).
 * stipple: a hashed (random-looking) threshold instead of the Bayer matrix - mist and haze, not light.
 */
function ditherPool(b, layer, { x = 0, y = 0.006, z = 0, r, rv = r, cols, peak = 1, fall = 1.6, cell = 0.036, plane = 'floor', kind = 1, keep = null, fade = null, off = 0.012, stipple = false, room }) {
  const cu = cell, cv = plane === 'floor' ? cell * 2 : cell * 1.15;
  const U = plane === 'floor' ? [1, 0, 0] : plane === 'back' ? [1, 0, 0] : plane === 'left' ? [0, 0, -1] : [0, 0, 1];
  const V = plane === 'floor' ? [0, 0, -1] : [0, 1, 0];
  const o = plane === 'floor' ? [x, y, z] : plane === 'back' ? [x, y, -room.D / 2 + off] : plane === 'left' ? [-room.W / 2 + off, y, z] : [room.W / 2 - off, y, z];
  const n = cols.length, ni = Math.ceil(r / cu), nj = Math.ceil(rv / cv);
  const P = (u, v) => [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v, o[2] + U[2] * u + V[2] * v];
  const quad = (u0, u1, v0, v1, lvl) => b.tris([...P(u0, v0), ...P(u1, v0), ...P(u1, v1), ...P(u0, v0), ...P(u1, v1), ...P(u0, v1)],
    { tones: 'glass', layer, glow: cols[lvl], glowKind: kind });
  for (let j = -nj; j < nj; j++) {
    let run = -1, runLvl = -1;
    for (let i = -ni; i <= ni; i++) {
      let lvl = -1;
      if (i < ni) {
        const u = (i + 0.5) * cu, v = (j + 0.5) * cv, d2 = (u / r) ** 2 + (v / rv) ** 2;
        const f = d2 < 1 && fade ? Math.max(0, Math.min(1, fade(u, v))) : 1;
        if (d2 < 1 && f > 0 && (!keep || keep(u, v))) {
          const I = peak * f * Math.pow(1 - d2, fall) * n, lo = Math.floor(I);
          const th = stipple ? (((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1) + 1) % 1 : (BAYER4[((j & 3) << 2) | (i & 3)] + 0.5) / 16;
          lvl = Math.min(n, lo + (I - lo > th ? 1 : 0)) - 1;
        }
      }
      if (lvl !== runLvl) {
        if (runLvl >= 0) quad(run * cu, i * cu, j * cv, (j + 1) * cv, runLvl);
        run = i; runLvl = lvl;
      }
    }
  }
}
/**
 * The window's sun patch on the floor as a flat decal (day-only geometry for particles({day})): rows x cols panes
 * (x = the patch centre, z0 = its back edge, w = its width; pane length pl along z, mullion bar `bar`), each pane a
 * flat sunlit-board tone with crisp edges (pixel-art window light: no shadow-map notches, no stair steps).
 */
function sunPanes(b, layer, { x, z0, w, rows = 4, cols = 2, pl = 0.3, bar = 0.06, tone = '#94745f' }) {
  const pw = (w - (cols - 1) * bar) / cols, y = 0.006;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = x - w / 2 + c * (pw + bar), x1 = x0 + pw, za = z0 + r * (pl + bar), zb = za + pl;
    b.tris([x0, y, za, x1, y, zb, x1, y, za, x0, y, za, x0, y, zb, x1, y, zb], { tones: 'glass', layer, glow: tone, glowKind: 1 });
  }
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
  const ink = paintRamp('#2a2838', { lightness: 0.26 });
  const inkPaper = paintRamp('#33304a', { lightness: 0.3 });
  const news = paintRamp('#d8ccaa', { lightness: 0.8 });
  const newsOld = paintRamp('#c0ae84', { lightness: 0.7 });
  const cork = paintRamp('#a0724a', { lightness: 0.52 });
  const red = paintRamp('#c03030', { lightness: 0.5 });
  const lampGreen = paintRamp('#2e6a4a', { lightness: 0.42 });
  const boardsT = paintRamp('#6a5a52', { lightness: 0.42 });             // worn, ink-stained floorboards
  const capNight = paintRamp('#7a7a98', { lightness: 0.5 });
  const lean = 0.07;                                                   // the house's shear: things lean right

  // ---- shell: inky wallpaper over a black dado, one tall window right of the board
  const win = { x: 2.25, y: 0.95, w: 0.62, h: 1.75 };
  room.shell({
    windows: [{ ...win, panes: [2, 5], curtains: null, frame: 'timber' }],
    wallTones: { upper: { tones: inkPaper, pattern: 'vboards', scale: 1.3 }, lower: { tones: ink, pattern: 'vboards', scale: 0.7 } },
    dado: 0.8, floorTones: boardsT, floorPattern: 'planks', beams: false,
  });
  // the floor: worn boards, blotted with spilt ink (round the press and the desk) and littered with paper scraps
  {
    const fr = room.rng;
    for (const [cx, cz, n, sp] of [[-W / 2 + 1.1, 1.0, 5, 0.55], [W / 2 - 1.1, -0.2, 4, 0.4], [-0.2, 0.3, 2, 0.25], [0.9, -1.6, 2, 0.2]]) {
      for (let k = 0; k < n; k++) {
        const r = 0.08 + fr() * 0.14;
        room.b.cylinder(r, r, 0.004, { at: [cx + (fr() - 0.5) * sp * 2, 0.001 + k * 0.0005, cz + (fr() - 0.5) * sp * 2], tones: ink, segments: 8, layer: 'soft', tint: 0.94 + fr() * 0.1 });
      }
    }
    for (let k = 0; k < 16; k++) {
      const x = -W / 2 + 0.5 + fr() * (W - 1), z = -D / 2 + 1.5 + fr() * (D - 2);
      if (Math.abs(x) < 0.7 && z > D / 2 - 1.1) continue;                // keep the doorway clean
      room.b.box(0.14 + fr() * 0.12, 0.006, 0.1 + fr() * 0.1, { at: [x, 0.004, z], ry: fr() * Math.PI, tones: k % 3 ? news : newsOld, layer: 'soft' });
    }
  }
  // wall caps catch the moonlight: a pale trim along the top of every wall (the room's outline never sinks into the void)
  for (const wall of ['back', 'left', 'right']) room.wallFrame(wall, ({ full, len }) => {
    const ext = wall === 'back' ? room.T : 0;
    full.box(len + 2 * ext + 0.04, 0.03, room.T + 0.07, { at: [0, H + 0.12, -room.T / 2], tones: capNight });
  });
  room.wallFrame('front', ({ low, len }) => {
    for (const s of [-1, 1]) low.box((len - room.doorW) / 2 + room.T, 0.03, room.T + 0.07, { at: [s * ((len - room.doorW) / 4 + room.doorW / 2 + room.T / 2), 0.42 + 0.06, -room.T / 2], tones: capNight });
  });
  // old front pages pasted up the walls at a lean (back wall top band, and a run down each side wall)
  const pr = room.rng;
  const page = (b, x, y, w, h, rz, tones = news) => {
    b.push(M({ at: [x, y, 0.015], rz }));
    b.box(w, h, 0.01, { at: [0, 0, 0], tones, origin: 'center' });
    b.box(w * 0.8, h * 0.13, 0.008, { at: [0, h * 0.33, 0.008], tones: ink, origin: 'center' });             // the masthead
    for (let k = 0; k < 2; k++) b.box(w * 0.36, h * 0.4, 0.006, { at: [(k ? 1 : -1) * w * 0.2, -h * 0.1, 0.008], tones: newsOld, origin: 'center' });
    b.pop();
  };
  room.wallFrame('back', ({ full }) => {
    for (let k = 0; k < 9; k++) {
      const x = -W / 2 + 0.45 + k * 0.7 + (pr() - 0.5) * 0.15;
      if (Math.abs(x - win.x) < 0.5) continue;
      page(full, x, H - 0.55 + (pr() - 0.5) * 0.2, 0.5, 0.62, -lean * 2 + (pr() - 0.5) * 0.12, k % 3 ? news : newsOld);
    }
  });
  for (const wall of ['left', 'right']) room.wallFrame(wall, ({ full, len }) => {
    for (let k = 0; k < 6; k++) page(full, -len / 2 + 0.5 + k * 0.78, 1.5 + (k % 2) * 0.75, 0.5, 0.62, -lean * 2 + (pr() - 0.5) * 0.1, k % 2 ? news : newsOld);
  });

  // ---- THE SUSPICION BOARD: fifteen notes in a ring (the voting circle), red string, two struck out, one with a feather
  const bx = -0.35, by = 1.65, bw = 2.7, bh = 1.6;
  room.wallFrame('back', ({ full }) => {
    full.box(bw + 0.12, bh + 0.12, 0.05, { at: [bx, by - bh / 2 - 0.06, 0.025], tones: 'timber' });
    full.box(bw, bh, 0.03, { at: [bx, by - bh / 2, 0.05], tones: cork, pattern: 'plaster', scale: 0.4 });
    const P = [];
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2 + 0.2;
      P.push([bx + Math.cos(a) * 1.05, by + Math.sin(a) * 0.58]);
    }
    const suspect = 6;                                                   // most strings lead here
    const strings = [[0, 6], [3, 6], [9, 6], [12, 6], [14, 6], [1, 8], [4, 11], [2, 13], [10, 5], [7, 6]];
    for (const [a, c] of strings) {
      const [x0, y0] = P[a], [x1, y1] = P[c], l = Math.hypot(x1 - x0, y1 - y0);
      full.box(l, 0.025, 0.012, { at: [(x0 + x1) / 2, (y0 + y1) / 2, 0.075], rz: Math.atan2(y1 - y0, x1 - x0), tones: red, origin: 'center' });
    }
    P.forEach(([x, y], i) => {
      const big = i === suspect;
      const w = big ? 0.3 : 0.22, h = big ? 0.26 : 0.18;
      full.box(w, h, 0.012, { at: [x, y, 0.07], rz: (pr() - 0.5) * 0.2, tones: i % 4 ? news : newsOld, origin: 'center' });
      full.box(w * 0.6, 0.025, 0.006, { at: [x, y + 0.02, 0.08], tones: ink, origin: 'center' });
      full.box(0.04, 0.04, 0.02, { at: [x, y + h / 2 - 0.03, 0.085], tones: red, origin: 'center' });       // pin
      if (i === 2 || i === 11) for (const s of [-1, 1]) full.box(w * 1.1, 0.025, 0.006, { at: [x, y, 0.088], rz: s * 0.6, tones: ink, origin: 'center' });
      if (big) {                                                         // a black rook feather pinned to it
        full.box(0.06, 0.34, 0.01, { at: [x + 0.04, y - 0.06, 0.095], rz: -0.5, tones: 'crow', origin: 'center' });
        full.box(0.012, 0.36, 0.008, { at: [x + 0.04, y - 0.06, 0.1], rz: -0.5, tones: 'iron', origin: 'center' });
      }
    });
    // centre: a sketch of the dais and the grimoire
    full.box(0.36, 0.28, 0.012, { at: [bx, by, 0.07], tones: news, origin: 'center' });
    full.box(0.18, 0.12, 0.008, { at: [bx, by - 0.02, 0.08], tones: red, tint: 0.7, origin: 'center' });
    full.box(0.012, 0.12, 0.008, { at: [bx, by - 0.02, 0.086], tones: newsOld, origin: 'center' });
    // the calendar, one date circled in red
    const cx = -2.35, cy = 1.55;
    full.box(0.5, 0.62, 0.012, { at: [cx, cy, 0.02], tones: news, origin: 'center' });
    full.box(0.5, 0.12, 0.014, { at: [cx, cy + 0.25, 0.025], tones: red, tint: 0.8, origin: 'center' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) full.box(0.05, 0.04, 0.006, { at: [cx - 0.18 + c * 0.09, cy + 0.1 - r * 0.1, 0.03], tones: ink, tint: 1.4, origin: 'center' });
    for (let k = 0; k < 8; k++) {                                        // the red ring round the 3rd row, 4th day
      const a = (k / 8) * Math.PI * 2;
      full.box(0.05, 0.022, 0.006, { at: [cx - 0.18 + 3 * 0.09 + Math.cos(a) * 0.055, cy + 0.1 - 2 * 0.1 + Math.sin(a) * 0.045, 0.036], rz: a + Math.PI / 2, tones: red, origin: 'center' });
    }
  });
  // the spyglass on the window sill, aimed out at the lane
  room.wallFrame('back', ({ full }) => {
    full.push(M({ at: [win.x, win.y + 0.02, 0.1], ry: 0.5, rx: -0.25 }));
    full.cylinder(0.035, 0.05, 0.42, { at: [0, 0, 0], tones: 'brass', segments: 8 });
    full.pop();
  });

  // ---- the cot in the back-left corner, buried in newspapers; a candle on a crate
  const bedX = -W / 2 + 0.6, bedZ = -D / 2 + 1.02;
  const bed = F.bed(room, { x: bedX, z: bedZ, quilt: 'night', frame: 'timber' });
  for (const [dx, dz, ry] of [[-0.1, 0.2, 0.3], [0.15, 0.55, -0.2], [0, -0.2, 0.9], [-0.15, 0.75, 0.5]]) room.b.box(0.42, 0.02, 0.32, { at: [bedX + dx, 0.55, bedZ + dz], ry, tones: news, layer: 'soft' });
  room.b.box(0.42, 0.45, 0.42, { at: [bedX + 0.85, 0, -D / 2 + 0.3], tones: 'plank', pattern: 'boards' });
  room.solidAt(bedX + 0.85, -D / 2 + 0.3, 0.42, 0.42);
  room.b.cylinder(0.06, 0.06, 0.02, { at: [bedX + 0.85, 0.45, -D / 2 + 0.3], tones: 'brass', segments: 8 });
  room.b.box(0.05, 0.12, 0.05, { at: [bedX + 0.85, 0.47, -D / 2 + 0.3], tones: 'cream' });
  room.g.box(0.05, 0.07, 0.05, { at: [bedX + 0.85, 0.6, -D / 2 + 0.3], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
  room.light({ pos: [bedX + 0.85, 0.75, -D / 2 + 0.45], color: GLOW.candle, r: 1.8, kind: 'lantern', intensity: 1.0 });

  // ---- the desk along the right wall: clippings, scissors, paste pot, quill; the green-shaded lamp = the key light
  const dx = W / 2 - 0.5, dz = -0.15;
  let deskTop = 0.76;
  F.table(room, {
    x: dx, z: dz, w: 0.8, d: 1.5, items: false,
    extra: (b, g, top) => {
      deskTop = top;
      for (const [x, z, ry] of [[-0.1, 0.3, 0.3], [0.05, -0.1, -0.2], [-0.15, -0.45, 0.6], [0.12, 0.55, 1.2]]) b.box(0.24, 0.008, 0.3, { at: [x, top + 0.004, z], ry, tones: news });
      b.cylinder(0.06, 0.06, 0.08, { at: [-0.2, top, 0.05], tones: 'cream', segments: 8 });             // paste pot
      b.box(0.16, 0.012, 0.02, { at: [0.05, top + 0.01, 0.15], ry: 0.7, tones: 'iron' });                 // scissors
      b.box(0.16, 0.012, 0.02, { at: [0.05, top + 0.01, 0.15], ry: -0.1, tones: 'iron' });
      b.cylinder(0.04, 0.04, 0.06, { at: [0.2, top, -0.25], tones: ink, segments: 8 });                   // inkwell + quill
      b.box(0.015, 0.3, 0.015, { at: [0.2, top + 0.05, -0.25], rz: 0.4, tones: 'cream' });
      // the lamp: brass stem, a green glass shade glowing over a bright bulb
      b.cylinder(0.08, 0.1, 0.03, { at: [0.1, top, -0.55], tones: 'brass', segments: 8 });
      b.box(0.03, 0.34, 0.03, { at: [0.1, top + 0.03, -0.55], tones: 'brass' });
      g.box(0.2, 0.09, 0.42, { at: [0.0, top + 0.36, -0.5], tones: 'glass', layer: 'glass', glow: '#5AB880', glowKind: 1 });
      g.box(0.12, 0.04, 0.32, { at: [0.0, top + 0.32, -0.5], tones: 'glass', layer: 'glass', glow: '#F0F4D8', glowKind: 1 });
    },
  });
  room.light({ pos: [dx - 0.25, 1.25, dz - 0.5], color: '#C8F0C0', r: 2.6, kind: 'fire', intensity: 1.35 });
  F.chair(room, { x: dx - 0.75, z: dz, ry: Math.PI / 2 });

  // ---- the printing press (front-left): iron frame, the great screw + bar, platen, bed, ink slab; Crier bundles
  const px = -W / 2 + 0.9, pz = 1.0;
  {
    const b = room.b;
    for (const s of [-1, 1]) b.box(0.14, 1.75, 0.14, { at: [px + s * 0.42, 0, pz], tones: 'iron' });
    b.box(1.0, 0.18, 0.2, { at: [px, 1.6, pz], tones: 'iron' });
    b.box(1.0, 0.16, 0.2, { at: [px, 0.52, pz], tones: 'iron' });
    b.box(0.95, 0.08, 0.9, { at: [px, 0.66, pz + 0.05], tones: 'timber' });                            // the bed (type forme)
    b.box(0.6, 0.03, 0.5, { at: [px, 0.74, pz + 0.05], tones: ink });
    b.cylinder(0.06, 0.06, 0.5, { at: [px, 1.1, pz], tones: 'brass', segments: 8 });                   // the screw
    b.box(0.6, 0.08, 0.5, { at: [px, 1.02, pz], tones: 'iron', tint: 1.05 });                          // platen
    b.box(0.9, 0.05, 0.05, { at: [px + 0.35, 1.38, pz + 0.15], ry: -0.6, tones: 'iron' });             // the bar
    b.cylinder(0.04, 0.04, 0.12, { at: [px + 0.74, 1.33, pz + 0.48], tones: 'timber', segments: 8 });
    b.box(0.3, 0.02, 0.4, { at: [px + 0.05, 0.78, pz + 0.75], tones: news });                         // a fresh sheet
    room.solidAt(px, pz + 0.05, 1.05, 1.0);
    // bundles of the Crier tied with string
    for (const [x, z, y, ry] of [[-W / 2 + 0.45, 2.1, 0, 0.1], [-W / 2 + 0.45, 2.1, 0.22, -0.15], [-W / 2 + 1.05, 2.15, 0, 0.3], [-W / 2 + 0.45, 2.1, 0.44, 0.2]]) {
      b.box(0.5, 0.22, 0.36, { at: [x, y, z], ry, tones: news, pattern: 'boards', scale: 0.4 });
      b.box(0.52, 0.23, 0.03, { at: [x, y, z], ry, tones: 'thatch' });
    }
    room.solidAt(-W / 2 + 0.75, 2.12, 1.0, 0.5);
  }
  // waste basket overflowing with crumpled drafts
  {
    const wx = W / 2 - 0.55, wz = 1.25, b = room.b;
    b.cylinder(0.2, 0.17, 0.38, { at: [wx, 0, wz], tones: 'thatch', pattern: 'thatch', scale: 0.4, segments: 8 });
    for (const [x, z, y] of [[0, 0, 0.36], [0.08, 0.06, 0.42], [-0.08, 0.04, 0.4], [0.3, 0.2, 0], [0.28, -0.12, 0], [-0.3, 0.25, 0]]) b.box(0.1, 0.09, 0.1, { at: [wx + x, y, wz + z], ry: x * 9, tones: news, layer: 'soft' });
    room.solidAt(wx, wz, 0.42, 0.42);
  }
  // the rook in a hanging iron cage by the window
  {
    const cx = -1.75, cz = -0.45, cy = 2.05, b = room.b;
    b.box(0.02, H - cy - 0.5, 0.02, { at: [cx, cy + 0.5, cz], tones: 'iron' });
    b.cylinder(0.26, 0.26, 0.04, { at: [cx, cy - 0.02, cz], tones: 'iron', segments: 8 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box(0.02, 0.48, 0.02, { at: [cx + Math.cos(a) * 0.24, cy, cz + Math.sin(a) * 0.24], tones: 'iron' }); }
    b.cylinder(0.26, 0.05, 0.14, { at: [cx, cy + 0.48, cz], tones: 'iron', segments: 8 });
    b.box(0.32, 0.02, 0.02, { at: [cx, cy + 0.14, cz], tones: 'timber' });
    b.box(0.14, 0.13, 0.22, { at: [cx, cy + 0.16, cz], ry: 0.6, tones: 'crow' });                     // the rook
    b.box(0.09, 0.09, 0.09, { at: [cx + 0.06, cy + 0.27, cz + 0.08], ry: 0.6, tones: 'crow' });
    b.box(0.05, 0.03, 0.08, { at: [cx + 0.1, cy + 0.29, cz + 0.15], ry: 0.6, tones: TP.cream });
  }
  // the Lantern-maker's lantern hangs in the gap between the pegged sheets (at 0.95 / 2.2 m a drying sheet hid it, and
  // its floor pool had no visible source)
  const lanX = 0.72, lanZ = 0.35;
  F.hangingLantern(room, { x: lanX, z: lanZ, y: 2.0 });
  Wl.sconce(room, { wall: 'back', x: 1.32, y: 2.0, r: 2.8 });                // lights the board at night
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });

  // ---- drying lines of fresh Crier sheets across the room (they flutter), scraps drifting down
  const lines = [{ z: 1.05, y: 3.0 }, { z: 1.75, y: 3.1 }];
  for (const { z, y } of lines) room.b.box(W, 0.02, 0.02, { at: [0, y, z], tones: 'cream', tint: 0.9 });
  const sheetsAt = [];
  lines.forEach(({ z, y }, li) => { for (let k = 0; k < 5; k++) sheetsAt.push([-2.4 + k * 1.15 + li * 0.5, y, z]); });
  // sheets + scraps share ONE mesh (indices 0..NS-1 the pegged sheets, then the scraps)
  const NS = sheetsAt.length, NC = 7;
  const paper = particles(room, ctx, {
    name: 'house-12-paper', n: NS + NC, glow: false,
    make: (b, i, layer) => {
      if (i >= NS) return b.box(0.09, 0.012, 0.07, { at: [0, 0, 0], ry: i - NS, tones: (i - NS) % 2 ? news : newsOld, layer });
      const [x, y, z] = sheetsAt[i];
      b.box(0.36, 0.46, 0.012, { at: [x, y - 0.47, z], tones: news, layer });
      b.box(0.3, 0.06, 0.016, { at: [x, y - 0.12, z], tones: ink, layer });
      b.box(0.04, 0.06, 0.03, { at: [x - 0.12, y - 0.04, z], tones: 'timber', layer });              // pegs
      b.box(0.04, 0.06, 0.03, { at: [x + 0.12, y - 0.04, z], tones: 'timber', layer });
    },
    path: (i, t) => {
      if (i < NS) return [0, 0, Math.sin(t * 1.3 + i * 1.7) * 0.03];
      const j = i - NS, u = (t * 0.06 + j / NC) % 1, x0 = -2.3 + ((j * 1.37) % 1) * 4.6;
      return [x0 + Math.sin(t * 0.9 + j) * 0.25, 2.6 * (1 - u), (j % 2 ? 1.05 : 1.75) + Math.cos(t * 0.7 + j) * 0.2 + u * 0.4];
    },
  });
  // ---- NIGHT: ink-dark, with newsprint-cream light in pools. The green-shaded desk lamp throws a hard-working cream
  //      pool over the desk top and the boards before it (a green cast at its heart); one sconce keeps the
  //      SUSPICION BOARD lit in the dark - amber on the cork, a warm halo round the frame - and the hanging lantern
  //      is a lone flame between the drying sheets (its point light warms the boards under it).
  //      Paranoid: the board is the warmest thing in the house at midnight.
  const nightGlow = particles(room, ctx, {
    name: 'house-12-night', n: 0, dayParticles: false, make: () => {}, path: () => [0, 0, 0],
    day: (b, layer) => sunPanes(b, layer, { x: win.x - 0.65, z0: -D / 2 + 0.06, w: win.w - 0.06, tone: PANE_SUN }),
    // the patch follows the sun: noon newsprint-tan, warmer honey as the sun yellows (its hue stays a light sunlit
    // yellow-tan: the sun colour only picks the blend, it is never multiplied in), and from mid-afternoon it fades
    // toward a faint warm tone as the sun drops, then is gone (before the window turns to dusk)
    dayGlow: (c) => {
      const U = room.engine.uniforms, sd = U?.uSunDir?.value, sc = U?.uSunColor?.value;
      const k = sd ? Math.max(0, Math.min(1, (sd.y - 0.24) / 0.22)) : 1;
      if (k <= 0.3) return false;
      const warm = sc ? Math.max(0, Math.min(1, (0.745 - sc.b) / 0.5)) : 0;
      c.copy(PANE_SUN).lerp(PANE_LATE, warm);
      c.lerp(PANE_FADE, 1 - k);
      c.setRGB(Math.round(c.r * 64) / 64, Math.round(c.g * 64) / 64, Math.round(c.b * 64) / 64);   // steps, not a per-frame upload
      return true;
    },
    night: (b, layer) => {
      // the lamp lights its own desk top (inside the top's rect: the papers sit on it, the dark under the desk stays dark)
      const dtx = dx, dtz = dz - 0.3;
      ditherPool(b, layer, { room, x: dtx, z: dtz, y: deskTop + 0.002, r: 0.62, rv: 1.0, cols: ['#8a8c6c', '#bcbc94', '#e4e2c0'], peak: 1.0, fall: 1.1, cell: 0.05,
        keep: (u, v) => Math.abs(dtx + u - dx) < 0.38 && Math.abs(dtz - v - dz) < 0.73 });
      // ... and spills onto the boards in front of it, dimming out before the desk's edge (no straight cut at the desk)
      ditherPool(b, layer, { room, x: dx - 0.95, z: dz - 0.25, r: 1.25, rv: 0.95, cols: ['#6a7058', '#9a9c78', '#c8c69c', '#ecead0'], peak: 0.9, fall: 1.4, cell: 0.05,
        fade: (u) => (dx - 0.42 - (dx - 0.95 + u)) / 0.5 });
      // the SUSPICION BOARD: a warm halo round the frame, and the sconce's amber poured over the cork itself (a decal
      // just in front of the cork, under the notes and the string), brightest on the sconce's side
      ditherPool(b, layer, { room, plane: 'back', x: bx + 0.25, y: by - 0.05, r: 1.9, rv: 1.25, cols: ['#6e5440', '#9c7a52', '#c89c64'], peak: 0.8, fall: 1.2, cell: 0.05 });
      ditherPool(b, layer, { room, plane: 'back', off: 0.066, x: bx, y: by, r: 1.75, rv: 1.05, cols: ['#6a4a30', '#92683e', '#b8884c'], peak: 1.15, fall: 0.9, cell: 0.055,
        keep: (u, v) => Math.abs(u) < bw / 2 - 0.02 && Math.abs(v) < bh / 2 - 0.02, fade: (u) => 0.72 + 0.28 * (u / (bw / 2)) });
      // the fifteen pinned notes catch that light too: a pale paper glow on each (just in front of the note, under its
      // ink line, its pin and its black X), so the ring of suspects reads as paper on the lit cork
      const zN = -D / 2 + 0.0765, paperQuad = (x, y, w, h, hex) => b.tris([x - w / 2, y - h / 2, zN, x + w / 2, y - h / 2, zN, x + w / 2, y + h / 2, zN,
        x - w / 2, y - h / 2, zN, x + w / 2, y + h / 2, zN, x - w / 2, y + h / 2, zN], { tones: 'glass', layer, glow: hex, glowKind: 1 });
      for (let i = 0; i < 16; i++) {                                   // 15 notes + the sketch of the dais in the middle
        const a = (i / 15) * Math.PI * 2 + 0.2, mid = i === 15, big = i === 6;
        const x = mid ? bx : bx + Math.cos(a) * 1.05, y = mid ? by : by + Math.sin(a) * 0.58;
        const w = (mid ? 0.36 : big ? 0.3 : 0.22) * 0.82, h = (mid ? 0.28 : big ? 0.26 : 0.18) * 0.78, lit = 0.8 + 0.2 * ((x - bx) / (bw / 2));
        paperQuad(x, y, w, h, '#' + new THREE.Color('#9a8a6c').multiplyScalar(lit).getHexString());
      }
    },
  });
  // point lights only warm what is right by them (short, gentle: the pools are the dithered decals)
  for (const l of room.lightList) {
    if (l.kind === 'fire') { l.r = Math.min(l.r, 1.3); l.intensity = Math.min(l.intensity, 0.85); }
    else { l.r = Math.min(l.r, 0.9); l.intensity = Math.min(l.intensity, 0.6); }
  }

  // ---- daylight: the room stays in shade (a closed shadow-only lid over the open dollhouse; the moon is shut out too);
  //      the tall window's sun patch is a DAY-ONLY decal in the night-glow mesh (below): its 2 x 5 panes laid on the
  //      boards just in front of the window, split by the mullion bars, with a dithered rim. It used to be a hole in
  //      this lid (a leaning shaft cut from 8 cm cells): the sun shadow map drew it as a hard stair-stepped tan blob in
  //      mid-floor with 1 px notches along every edge (critic, demo noon).
  const mask = sunMask(room, { name: 'house-12-shade', cell: 0.5, night: 'lid', open: () => false });

  room.spot('board', bx, -D / 2 + 0.9, Math.PI);
  room.spot('desk', dx - 0.75, dz + 0.6, Math.PI / 2);
  room.spot('press', px + 0.2, pz + 0.95, Math.PI);

  return {
    bed: { x: bedX, z: bedZ - 0.6, y: 0.55, facing: 0 },
    visit: { x: bedX + 0.9, z: bedZ + 0.4, facing: -Math.PI / 2 },
    extras: [mask.group, paper.group, nightGlow.group],
    update(t) { mask.update(); paper.update(t); nightGlow.update(t); },
    nightAmbient: NIGHT_AMBIENT,   // the demo's night look (time.js ROOM_NIGHT shape): ink + newsprint cream
    bedRect: bed.rect,
  };
}
