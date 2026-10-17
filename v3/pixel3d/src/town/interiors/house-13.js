// house-13 interior: Riverbend Boathouse - the ferryman (owner: lore-10..14 builder). docs/LORE.md row 13, docs/INTERIORS.md.
// A real BOATHOUSE: the middle of the room is not floor but a WATER SLIP that runs out through a great arched water-door
// in the back wall to the river; a plank walkway goes round it (the ferryman lives on the two sides). His rowboat is
// moored in the slip and bobs. No hearth: the cold key light is the river itself - blue-grey light through the water-door
// that ripples across the back wall and glints on the water; by day only thin stripes of sun come through the slatted
// boards overhead; at night one candle on the ledger and the moonlit river.
// Story: the crossings LEDGER lies open on his desk - long columns of crossings, one line marked in red (a boat that
// never came back). On the right, nets hang to dry with a LOCKET tangled in them (a gold glint). By the water-door an
// iron hook hangs EMPTY over a pale unweathered square of board: the ferry lantern (every house has one) is gone. River
// reeds grow up through the floorboards at the water's edge, One chair. Lonely.
// Through the water-door: the river and the Gloamwood's jagged pine treeline on the far bank.
// Ambiance: blue-grey + tarred black + driftwood; water ripples on the walls, glints on the slip; damp and quiet.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 9, d: 6.2, h: 3.2, wall: 'planks', pal: 1, floor: 'boards' };
/** Night look (docs/DEMO.md 4.3 nightAmbient): blue-grey river light, teal moon, mist. */
const NIGHT_AMBIENT = { lit: '#A8D8CC', sh: '#78A8A0', k: 0.6, gain: 1.3, mist: 0.75, litK: 0.6 };

// ---------------------------------------------------------------------------------------------- local helpers
/**
 * Animated specks: n small boxes in ONE mesh, moved per particle (stepped 8 fps, pure function of t). `night(b, layer)`
 * adds STATIC night-only geometry to the same mesh (soft light pools, glow decals): it is drawn only while the room is
 * dark (drawRange, no extra draw call). dayParticles false: the specks themselves only show in the dark too.
 * nightColor(i) -> hex | null: in the dark speck i glows steadily in that colour (e.g. window-kind ripples that would
 * otherwise go black at night), restored by day.
 */
function particles(room, ctx, { name, n, make, path, glow = true, night = null, dayParticles = true, nightColor = null }) {
  const b = new Builder(room.engine, { name });
  const layer = glow ? 'glass' : 'soft', ranges = [];
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
  let last = -1, lastDark = null;
  return {
    group: grp,
    update(t) {
      if (night || ga || !dayParticles) {
        const dark = isDark(room);
        if (dark !== lastDark) { mesh.geometry.setDrawRange(0, dark ? nAll : dayParticles ? nDay : 0); recolor(dark); lastDark = dark; }
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
 * fall the falloff exponent, cell the dither cell (u metres; v is stretched for the 30 deg camera). keep(u, v) clips.
 * stipple: a hashed (random-looking) threshold instead of the Bayer matrix - mist and haze, not light.
 */
function ditherPool(b, layer, { x = 0, y = 0.006, z = 0, r, rv = r, cols, peak = 1, fall = 1.6, cell = 0.036, plane = 'floor', kind = 1, keep = null, stipple = false, room }) {
  const cu = cell, cv = plane === 'floor' ? cell * 2 : cell * 1.15;
  const U = plane === 'floor' ? [1, 0, 0] : plane === 'back' ? [1, 0, 0] : plane === 'left' ? [0, 0, -1] : [0, 0, 1];
  const V = plane === 'floor' ? [0, 0, -1] : [0, 1, 0];
  const o = plane === 'floor' ? [x, y, z] : plane === 'back' ? [x, y, -room.D / 2 + 0.012] : plane === 'left' ? [-room.W / 2 + 0.012, y, z] : [room.W / 2 - 0.012, y, z];
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
        if (d2 < 1 && (!keep || keep(u, v))) {
          const I = peak * Math.pow(1 - d2, fall) * n, lo = Math.floor(I);
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
  const boards = paintRamp('#5e6e7c', { lightness: 0.48 });          // weathered blue-grey boarding
  const tar = paintRamp('#283038', { lightness: 0.22 });
  const wet = paintRamp('#4a4440', { lightness: 0.34 });             // damp dark floor planks
  const water = paintRamp('#3e6a82', { lightness: 0.44 });
  const drift = paintRamp('#8a7a68', { lightness: 0.56 });
  const reed = paintRamp('#7a8a4a', { lightness: 0.5 });
  const net = paintRamp('#8a7a5a', { lightness: 0.6 });
  const hull = paintRamp('#9a4a32', { lightness: 0.42 });

  // ---- the slip: water from the back wall to z sx1, walkways round it
  const sx = 1.55, sz1 = 0.35;
  const door = { x: 0, y: 0.0, w: 2.7, h: 2.35 };
  room.shell({
    windows: [{ ...door, wall: 'back', panes: [1, 1], curtains: null, frame: 'timber' }],
    wallTones: { upper: { tones: boards, pattern: 'boards', scale: 1.3 }, lower: { tones: tar, pattern: 'vboards', scale: 0.8 } },
    dado: 0.55, floorTones: wet, floorPattern: 'planks', beams: false,
  });
  // the water surface (sunk 6 cm), the walkway edge beams + mooring posts round the slip
  room.b.box(2 * sx, 0.02, sz1 + D / 2 + 0.3, { at: [0, 0.004, (sz1 - D / 2 - 0.3) / 2], tones: water, pattern: 'none' });
  for (const s of [-1, 1]) {
    room.b.box(0.16, 0.12, sz1 + D / 2, { at: [s * (sx + 0.08), -0.08, (sz1 - D / 2) / 2], tones: 'timber' });
    for (const z of [-2.2, -0.9, sz1 - 0.08]) room.b.cylinder(0.09, 0.09, 0.55, { at: [s * (sx + 0.1), 0, z], tones: 'timber', segments: 8 });
  }
  room.b.box(2 * sx + 0.32, 0.12, 0.16, { at: [0, -0.08, sz1 + 0.08], tones: 'timber' });
  room.solid(-sx, -D / 2, sx, sz1 + 0.02, 'water');
  for (const s of [-1, 1]) for (const z of [-2.2, -0.9, sz1 - 0.08]) room.solidAt(s * (sx + 0.1), z, 0.2, 0.2);

  // ---- the water-door: an arch over the opening, the river outside (glowing river + sky + a dark far bank)
  room.wallFrame('back', ({ full, glow }) => {
    const { w, h } = door;
    full.prism([[-w / 2 - 0.2, 0], [w / 2 + 0.2, 0], [w / 2 + 0.2, 0.55], [0, 0.75], [-w / 2 - 0.2, 0.55], [-w / 2 + 0.25, 0.32], [0, 0.42], [w / 2 - 0.25, 0.32]].slice(0, 5), 0.12,
      { at: [0, h - 0.05, 0.06], tones: 'timber' });
    for (const s of [-1, 1]) full.box(0.2, h, 0.2, { at: [s * (w / 2 + 0.1), 0, 0.06], tones: 'timber' });
    // outside: the river and the sky (kind 3: follow the daylight), and the GLOAMWOOD on the far bank - a jagged
    // conifer treeline in two depth tones. Both are window-kind glow too, so they stay darker than the sky at every
    // hour: blue-grey pines on a pale sky by day, near-black pines on the deep-blue night sky.
    glow.box(w, 0.75, 0.02, { at: [0, 0, -0.1], tones: 'glass', layer: 'glass', glow: '#7FA0B8', glowKind: 3 });
    glow.box(w, h - 0.75, 0.02, { at: [0, 0.75, -0.11], tones: 'glass', layer: 'glass', glow: '#D8E4EC', glowKind: 3 });
    const tr = room.rng;
    const treeline = (z, base, band, col, hMin, hMax, step) => {
      const o = { tones: 'glass', layer: 'glass', glow: col, glowKind: 3 };
      glow.box(w, band, 0.01, { ...o, at: [0, base, z] });
      for (let x = -w / 2 + step * 0.4; x < w / 2; x += step * (0.7 + tr() * 0.6)) {
        const th = hMin + tr() * (hMax - hMin), hw = Math.min(0.07 + th * 0.2, w / 2 - Math.abs(x) + 0.02);
        if (hw < 0.05) continue;
        // a tiered pine: three stacked triangles, each tier narrower (the jagged silhouette)
        for (let k = 0; k < 3; k++) {
          const y0 = base + band - 0.02 + k * th * 0.28, ww = hw * (1 - k * 0.24), hh = th * (0.5 - k * 0.06);
          glow.prism([[-ww, 0], [ww, 0], [0, hh]], 0.01, { ...o, at: [x, y0, z] });
        }
      }
    };
    treeline(-0.095, 0.74, 0.12, '#7C9AA0', 0.32, 0.62, 0.17);       // far ridge: hazier, taller
    treeline(-0.085, 0.74, 0.06, '#405650', 0.2, 0.42, 0.21);        // near bank: darker, lower
    // the EMPTY lantern hook right of the door over a pale unweathered square
    const hx = w / 2 + 0.55;
    full.box(0.34, 0.42, 0.012, { at: [hx, 1.55, 0.006], tones: drift, tint: 1.06 });
    full.box(0.04, 0.04, 0.3, { at: [hx, 1.95, 0.15], tones: 'iron' });
    full.box(0.03, 0.12, 0.03, { at: [hx, 1.84, 0.29], tones: 'iron' });
    full.box(0.07, 0.03, 0.03, { at: [hx - 0.02, 1.84, 0.29], tones: 'iron' });
    // oars crossed on the wall left of the door
  });
  Wl.oars(room, { wall: 'back', x: -2.15, y: 0.55 });

  // ---- the rowboat moored in the slip (bobs)
  const boat = new Builder(room.engine, { name: 'house-13-boat' });
  {
    const L = 2.7, Bw = 1.0;
    // hull: tapered planks (two hexa halves: bow at -z), gunwale, thwarts, oars in it
    const hullPts = (y, w, l) => [[-w / 2, y, l / 2], [w / 2, y, l / 2], [-w * 0.18, y, -l / 2], [w * 0.18, y, -l / 2]];
    const lo = hullPts(0, Bw * 0.6, L * 0.86), hi = hullPts(0.42, Bw, L);
    const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
    boat.hexa([V(lo[2]), V(lo[3]), V(hi[2]), V(hi[3]), V(lo[0]), V(lo[1]), V(hi[0]), V(hi[1])], { tones: hull });
    boat.hexa([V([-Bw * 0.44, 0.12, L * 0.44]), V([Bw * 0.44, 0.12, L * 0.44]), V([-Bw * 0.44, 0.44, L * 0.47]), V([Bw * 0.44, 0.44, L * 0.47]),
      V([-Bw * 0.4, 0.12, L * 0.36]), V([Bw * 0.4, 0.12, L * 0.36]), V([-Bw * 0.4, 0.44, L * 0.4]), V([Bw * 0.4, 0.44, L * 0.4])], { tones: drift });   // transom
    boat.box(Bw * 0.78, 0.04, L * 0.7, { at: [0, 0.3, 0.1], tones: 'plank', pattern: 'boards' });                               // floor boards
    boat.box(Bw * 0.9, 0.05, 0.22, { at: [0, 0.38, -0.25], tones: 'plank' });
    boat.box(Bw * 0.9, 0.05, 0.22, { at: [0, 0.38, 0.65], tones: 'plank' });
    for (const s of [-1, 1]) boat.box(0.05, 0.04, L * 0.9, { at: [s * Bw * 0.4, 0.42, 0.05], ry: s * 0.12, tones: 'cream' });  // gunwale stripe
    boat.box(0.06, 0.04, 1.9, { at: [0.15, 0.42, 0.2], ry: 0.05, tones: 'plank' });                                             // an oar
    boat.box(0.14, 0.03, 0.4, { at: [0.2, 0.42, -0.7], ry: 0.05, tones: CLOTH.red });
    boat.box(0.4, 0.14, 0.3, { at: [-0.15, 0.32, 0.9], tones: net });                                           // a heap of net
  }
  const boatG = boat.build({ name: 'house-13-boat' });
  const boatPivot = new THREE.Group();
  boatPivot.position.set(0.05, -0.18, -1.35);
  boatPivot.rotation.y = 0.06;
  boatPivot.add(boatG);
  room.b.box(0.02, 0.02, 0.9, { at: [0.6, 0.2, -0.05], ry: 0.5, tones: 'thatch' });                                      // mooring rope

  // ---- left walkway: the bed against the back wall, the ledger desk with its one candle, one chair
  const bx = -W / 2 + 0.62, bz = -D / 2 + 1.05;
  const bed = F.bed(room, { x: bx, z: bz, quilt: paintRamp('#4a5a6a', { lightness: 0.42 }), frame: 'plank' });
  Wl.frame(room, { wall: 'back', x: bx + 0.95, y: 1.55, w: 0.4, h: 0.5, kind: 'picture', tones: paintRamp('#6a8aa0', { lightness: 0.6 }) });   // a portrait (a face long gone)
  const lx = -W / 2 + 1.25, lz = 1.25;
  let candleY = 0.75;
  F.table(room, {
    x: lx, z: lz, w: 1.2, d: 0.75, items: false,
    extra: (b, g, top) => {
      // the open crossings ledger: two cream pages, ruled columns, one line in red
      b.box(0.82, 0.05, 0.56, { at: [0.02, top, 0], tones: 'timber' });
      for (const s of [-1, 1]) b.box(0.38, 0.03, 0.5, { at: [s * 0.2 + 0.02, top + 0.05, 0], rz: s * -0.04, tones: 'cream' });
      for (let r = 0; r < 7; r++) for (const s of [-1, 1]) b.box(0.3, 0.008, 0.018, { at: [s * 0.2 + 0.02, top + 0.082, -0.19 + r * 0.06], tones: r === 4 && s > 0 ? CLOTH.red : 'iron', tint: r === 4 && s > 0 ? 1 : 1.5 });
      b.cylinder(0.04, 0.04, 0.06, { at: [-0.48, top, 0.2], tones: 'iron', segments: 8 });                                 // inkwell
      b.cylinder(0.06, 0.05, 0.1, { at: [0.5, top, -0.15], tones: 'iron', segments: 8 });                                   // one mug
      b.cylinder(0.07, 0.07, 0.025, { at: [-0.45, top, -0.2], tones: 'brass', segments: 8 });                               // the candle
      b.box(0.05, 0.12, 0.05, { at: [-0.45, top + 0.025, -0.2], tones: 'cream' });
      candleY = top;                                                                                       // its flame is in the river-light mesh
    },
  });
  room.light({ pos: [lx - 0.45, 1.1, lz - 0.1], color: GLOW.candle, r: 1.0, kind: 'lantern', intensity: 0.75 });
  F.chair(room, { x: lx + 0.95, z: lz, ry: -Math.PI / 2 });
  F.chest(room, { x: -W / 2 + 0.32, z: 2.45, ry: Math.PI / 2 });

  // ---- right walkway: nets drying on the back wall with the tangled locket, a lobster pot, coiled rope, a barrel
  Wl.net(room, { wall: 'back', x: 3.05, y: 0.75, w: 1.7, h: 1.45 });
  room.wallFrame('back', ({ full, glow }) => {
    // the locket caught in the mesh: a little chain + a gold oval that glints
    for (let k = 0; k < 5; k++) full.box(0.025, 0.025, 0.02, { at: [2.75 + k * 0.03, 1.55 - k * 0.05, 0.07], tones: 'brass' });
    glow.box(0.08, 0.1, 0.025, { at: [2.92, 1.32, 0.075], tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 2 });
    full.box(0.1, 0.12, 0.02, { at: [2.92, 1.31, 0.06], tones: 'brass' });
  });
  {
    const px = W / 2 - 0.6, pz = -0.5, b = room.b;                                                   // lobster pot
    b.box(0.7, 0.06, 0.5, { at: [px, 0, pz], tones: 'plank' });
    for (let k = 0; k < 5; k++) b.box(0.03, 0.4, 0.5, { at: [px - 0.3 + k * 0.15, 0.06, pz], tones: 'thatch', tint: 0.9 });
    b.box(0.7, 0.04, 0.04, { at: [px, 0.44, pz], tones: 'plank' });
    room.solidAt(px, pz, 0.75, 0.55);
    b.cylinder(0.32, 0.32, 0.12, { at: [2.3, 0, 1.0], tones: 'thatch', segments: 12 });                 // coiled rope
    b.cylinder(0.14, 0.14, 0.14, { at: [2.3, 0, 1.0], tones: wet, segments: 8 });
  }
  F.barrel(room, { x: W / 2 - 0.45, z: 1.6 });
  // river reeds pushing up through the floorboards at the water's edge, and in a bucket by the door
  {
    const rr = room.rng;
    for (const [cx, cz, n] of [[sx + 0.35, -2.6, 6], [-sx - 0.35, -2.75, 5], [sx + 0.3, 0.1, 4], [-sx - 0.3, -0.35, 3], [1.0, 2.4, 4]]) {
      for (let k = 0; k < n; k++) {
        const h = 0.5 + rr() * 0.6;
        room.b.box(0.035, h, 0.035, { at: [cx + (rr() - 0.5) * 0.3, 0, cz + (rr() - 0.5) * 0.3], rz: (rr() - 0.5) * 0.3, tones: reed, layer: 'soft' });
      }
    }
    room.b.cylinder(0.16, 0.13, 0.3, { at: [1.0, 0, 2.4], tones: 'iron', segments: 8 });
    room.solidAt(1.0, 2.4, 0.34, 0.34);
  }
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });

  // the river light: a cool window-kind anchor at the water-door (follows the daylight in the demo)
  room.light({ pos: [0, 0.7, -D / 2 + 1.4], color: '#9CC4D0', r: 1.6, kind: 'window', intensity: 0.7, hug: false });

  // ---- daylight: thin stripes of sun through the slatted boards overhead
  const mask = sunMask(room, { name: 'house-13-slats', cell: 0.1, open: (x, z) => ((z + 20) % 0.8) < 0.14 });

  // ---- ambiance (ONE glow mesh): the ledger candle (static), ripples of river light on the back wall's inner face
  //      (kept 0.45 m inside the side walls so none can reach a wall top), glints drifting down the slip
  // NIGHT (same mesh): the moonlit river is the room's key light - the ripples on the back wall and the glints on the
  // slip turn pale moon-teal (by day they follow the daylight), a moon hangs over the Gloamwood in the water-door with
  // its broken path on the river, river MIST lies low and dithered over the slip and the walkways, and the ledger
  // candle is the one small warm pool in a cold, lonely house.
  const doorW = door.w;
  const night = (b, layer) => {
    const zDoor = -D / 2 - 0.05;                                   // just in front of the river / sky panes
    const o = (hex) => ({ tones: 'glass', layer, glow: hex, glowKind: 1 });
    b.push(M({ at: [0.72, 1.86, zDoor], rx: Math.PI / 2 }));                                                          // the moon + halo
    b.cylinder(0.13, 0.13, 0.01, { ...o('#D8E4E0'), at: [0, 0, 0], segments: 8 });
    b.cylinder(0.18, 0.18, 0.01, { ...o('#5A7488'), at: [0, -0.012, 0], segments: 8 });
    b.pop();
    for (let k = 0; k < 7; k++) {                                                                                       // moon path
      const y = 0.68 - k * 0.095, w = 0.1 + k * 0.05 + (k % 2) * 0.04;
      b.box(w, 0.03, 0.01, { ...o(k % 2 ? '#7A98A8' : '#A8C4CC'), at: [0.72 + ((k * 0.37) % 1 - 0.5) * 0.12, y, zDoor] });
    }
    // the moon's sheen on the slip, then two low banks of mist lying on the water (sparse, pale stipple)
    ditherPool(b, layer, { room, x: 0, z: -1.1, y: 0.012, r: 1.45, rv: 2.0, cols: ['#4a6e7c', '#78a0a8'], peak: 0.6, fall: 1.0, cell: 0.06 });
    for (const [mx, mz, my, mr] of [[-0.3, -2.0, 0.22, 2.2], [0.4, -0.5, 0.3, 2.4]]) {
      ditherPool(b, layer, { room, x: mx, z: mz, y: my, r: mr, rv: 0.85, cols: ['#6a8494'], peak: 0.22, fall: 1.4, cell: 0.04, stipple: true,
        keep: (u) => Math.abs(mx + u) < sx + 0.25 });                                                 // over the water only
    }
    ditherPool(b, layer, { room, x: lx - 0.35, z: lz - 0.05, y: 0.006, r: 0.95, rv: 0.6, cols: ['#4a3424', '#7a5634', '#a8763e'], peak: 0.8, cell: 0.05 });
  };
  const NR = 16, NG = 12;
  const fx = particles(room, ctx, {
    name: 'house-13-river-light', n: 1 + NR + NG, night,
    nightColor: (i) => (i === 0 ? null : i <= NR ? (i % 2 ? '#5E8494' : '#86AEB8') : '#A8C8D0'),
    make: (b, i, layer) => {
      if (i === 0) return b.box(0.05, 0.07, 0.05, { at: [lx - 0.45, candleY + 0.15, lz - 0.2], tones: 'glass', layer, glow: GLOW.candle, glowKind: 2 });
      if (i <= NR) return b.box(0.16 + (i % 3) * 0.08, 0.025, 0.01, { at: [0, 0, 0], tones: 'glass', layer, glow: i % 2 ? '#6C88A0' : '#8AA6BC', glowKind: 3 });
      return b.box(0.14, 0.01, 0.03, { at: [0, 0, 0], tones: 'glass', layer, glow: '#A8C4D8', glowKind: 3 });
    },
    path: (i, t) => {
      if (i === 0) return [0, 0, 0];
      if (i <= NR) {
        const sxw = i % 2 ? 1 : -1, x0 = sxw * (1.75 + ((i * 0.37) % 1) * 2.0), y0 = 0.6 + ((i * 0.61) % 1) * 1.7;
        return [x0 + Math.sin(t * 0.9 + i * 1.3) * 0.15, y0 + Math.sin(t * 1.3 + i) * 0.05, -D / 2 + 0.015];
      }
      const j = i - NR - 1, u = (t * 0.05 + j / NG) % 1;
      return [-1.2 + ((j * 0.53) % 1) * 2.4 + Math.sin(t + j) * 0.1, 0.03, -D / 2 + 0.2 + u * (sz1 + D / 2 - 0.4)];
    },
  });
  room.spot('ledger', lx, lz + 0.8, Math.PI);
  room.spot('nets', 3.05, -D / 2 + 0.8, Math.PI);
  room.spot('slip', sx + 0.4, -1.3, -Math.PI / 2);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx + 0.95, z: bz + 0.55, facing: -Math.PI / 2 },
    extras: [mask.group, boatPivot, fx.group],
    nightAmbient: NIGHT_AMBIENT,   // the demo's night look (time.js ROOM_NIGHT shape): moonlit teal river, mist
    update(t) {
      mask.update(); fx.update(t);
      const k = Math.floor(t * 6) / 6;
      boatPivot.position.y = -0.18 + Math.sin(k * 1.1) * 0.02;
      boatPivot.rotation.z = Math.sin(k * 0.8 + 1) * 0.025;
    },
    bedRect: bed.rect,
  };
}
