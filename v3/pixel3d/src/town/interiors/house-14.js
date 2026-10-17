// house-14 interior: Millrace Mill - the miller (owner: lore-10..14 builder). docs/LORE.md row 14, docs/INTERIORS.md.
// The room IS the mill floor, on TWO LEVELS: a raised timber hurst (the stone floor) in the middle carries the
// millstones under their hopper, reached by three steps; a grain loft on posts over the back-left corner holds sacks
// and shelters the miller's bed beneath it. Everything is dusted pale with flour - floured boards, whitened timber walls.
// No hearth (a mill fears fire more than anything): the light is SUNBEAMS slanting from two high windows across the
// floor, with flour drifting in them (a shadow-only roof far up the sun ray leaves only the two beams), and at night two
// lanterns. The great PIT WHEEL turns on the back wall (driven by the water wheel outside), its shaft runs out over the
// stones, the runner stone turns: the mill's rumble. At night the beams close: honey lamplight pools and the wheel
// silhouetted on the lamp-lit back wall, a thin moon spill on the flour bin where the gear glints.
// Story: ordinary hiding the key clue. Front right, in a flour bin heaped white, stands, edge-on and half buried, the brass gear the
// clock tower lost on the long night - too big and too fine for any mill - with the RED SIGIL (the eye-in-a-clock)
// scratched on its face. The miller weighs flour on his scales, tallies sacks on the wall, and has not said a word.
// Ambiance: dusty white + warm wood, sunbeams, drifting flour; the turning wheel. Calm, dusty, ordinary.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 9, d: 6, h: 3.3, wall: 'planks', pal: 2, floor: 'boards' };
/** Night look (docs/DEMO.md 4.3 nightAmbient): warm wood, lantern honey, flour haze. */
const NIGHT_AMBIENT = { lit: '#F0D8A8', sh: '#AC947C', k: 0.65, gain: 1.25, mist: 0.45, litK: 0.5 };

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
  const engine = room.engine;
  const flourWall = paintRamp('#b8a888', { lightness: 0.72 });        // flour-whitened boarding
  const flourFloor = paintRamp('#b09a78', { lightness: 0.64 });
  const flour = paintRamp('#ece4d0', { lightness: 0.9 });
  const sackT = paintRamp('#c8b48a', { lightness: 0.72 });
  const red = paintRamp('#c03030', { lightness: 0.5 });

  // ---- shell: floured boards everywhere, timber dado; two HIGH windows (the sunbeams come from them)
  const wins = [{ x: -1.55, y: 1.95, w: 0.8, h: 0.9 }, { x: 2.75, y: 1.95, w: 0.8, h: 0.9 }];
  room.shell({
    windows: wins.map((w) => ({ ...w, panes: [2, 2], curtains: null, frame: 'timber' })),
    wallTones: { upper: { tones: flourWall, pattern: 'boards', scale: 1.4 }, lower: { tones: 'plank', pattern: 'vboards', scale: 0.8 } },
    dado: 0.7, floorTones: flourFloor, floorPattern: 'planks', beams: true,
  });
  // tally marks of sacks chalked on the back wall by the right window, a pegged flour-sifter
  room.wallFrame('back', ({ full }) => {
    for (let g = 0; g < 4; g++) {
      const x0 = 3.55 + (g % 2) * 0.32, y0 = 1.2 + Math.floor(g / 2) * 0.32;
      for (let k = 0; k < 4; k++) full.box(0.02, 0.2, 0.01, { at: [x0 + k * 0.05, y0, 0.01], tones: 'cream' });
      full.box(0.26, 0.02, 0.01, { at: [x0 + 0.08, y0 + 0.1, 0.012], rz: 0.6, tones: 'cream', origin: 'center' });
    }
    full.cylinder(0.24, 0.24, 0.08, { at: [-2.85, 1.5, 0.06], tones: 'plank', segments: 12 });
  });

  // ---- the HURST: a raised timber stage in the middle carrying the stones; steps at the front
  const hx0 = -0.85, hx1 = 1.75, hz1 = 0.15, hy = 0.42;
  room.b.box(hx1 - hx0, hy, hz1 + D / 2, { at: [(hx0 + hx1) / 2, 0, (hz1 - D / 2) / 2], tones: 'plank', pattern: 'planks', tint: 1.04 });
  for (const [fx, fz, fw, fd] of [[-0.35, -0.2, 0.6, 0.4], [1.3, -0.4, 0.5, 0.6], [0.2, -2.6, 0.9, 0.3]]) room.b.box(fw, 0.006, fd, { at: [fx, hy, fz], tones: flour, layer: 'soft', tint: 0.96 });
  for (const x of [hx0 + 0.06, hx1 - 0.06]) room.b.box(0.12, hy, 0.12, { at: [x, 0, hz1 - 0.06], tones: 'timber' });
  for (let k = 0; k < 2; k++) room.b.box(0.9, hy * (2 - k) / 3, 0.28, { at: [0.45, 0, hz1 + 0.14 + k * 0.28], tones: 'plank', tint: 0.96 + k * 0.03 });
  room.solid(hx0, -D / 2, hx1, hz1, 'hurst');
  room.solid(0.0, hz1, 0.9, hz1 + 0.56, 'steps');

  // ---- the millstones on the hurst: tun, runner (turning), hopper on its horse, the meal spout into a sack
  const mx = 0.45, mz = -1.1, my = hy;
  {
    const b = room.b;
    b.cylinder(0.72, 0.72, 0.5, { at: [mx, my, mz], tones: 'plank', pattern: 'vboards', scale: 0.5, segments: 8 });
    b.cylinder(0.75, 0.75, 0.05, { at: [mx, my + 0.5, mz], tones: 'timber', segments: 8 });
    for (const y of [0.1, 0.38]) b.cylinder(0.735, 0.735, 0.04, { at: [mx, my + y, mz], tones: 'iron', segments: 8 });
    b.cylinder(0.64, 0.64, 0.04, { at: [mx, my + 0.5, mz], tones: 'stone', segments: 12 });
    for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.05, 0.62, 0.05, { at: [mx + sx2 * 0.4, my + 0.55, mz + sz2 * 0.4], tones: 'timber' });
    b.box(0.9, 0.05, 0.05, { at: [mx, my + 1.15, mz - 0.4], tones: 'timber' });
    b.box(0.9, 0.05, 0.05, { at: [mx, my + 1.15, mz + 0.4], tones: 'timber' });
    b.cylinder(0.12, 0.42, 0.42, { at: [mx, my + 1.12, mz], tones: 'plank', pattern: 'vboards', scale: 0.5, segments: 4, ry: Math.PI / 4 });
    b.cylinder(0.38, 0.38, 0.03, { at: [mx, my + 1.53, mz], tones: TP.thatch, segments: 4, ry: Math.PI / 4 });
  }
  const runner = new Builder(engine, { name: 'house-14-runner' });
  runner.cylinder(0.6, 0.6, 0.17, { at: [0, 0, 0], tones: 'ashlar', pattern: 'none', segments: 12 });
  runner.cylinder(0.62, 0.62, 0.05, { at: [0, 0.06, 0], tones: 'iron', segments: 12 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    runner.box(0.4, 0.012, 0.035, { at: [Math.cos(a) * 0.36, 0.17, -Math.sin(a) * 0.36], ry: a + 0.35, tones: 'stone' });
  }
  runner.cylinder(0.1, 0.1, 0.02, { at: [0, 0.17, 0], tones: 'crow', segments: 8 });
  runner.box(0.05, 1.2, 0.05, { at: [0, 0.17, 0], tones: 'iron' });
  runner.box(0.3, 0.06, 0.06, { at: [0, 0.2, 0], tones: 'iron' });
  const runnerG = runner.build({ name: 'house-14-runner' });
  const runnerP = new THREE.Group(); runnerP.position.set(mx, my + 0.52, mz); runnerP.add(runnerG);

  // ---- the great pit wheel on the back wall + its shaft over the stones (turning, axis along z)
  const wheel = new Builder(engine, { name: 'house-14-pitwheel' });
  const cog = (b, R, nT, z0, depth, tones, seg = 16) => {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
      b.box(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.13 * Math.max(0.6, R / 0.7), depth, { at: [(x0 + x1) / 2, (y0 + y1) / 2, z0], rz: Math.atan2(y1 - y0, x1 - x0), tones, pattern: 'none', origin: 'center' });
    }
    for (let k = 0; k < nT; k++) {
      const a = (k / nT) * Math.PI * 2;
      b.box(0.08, 0.1, 0.12, { at: [Math.cos(a) * (R + 0.09), Math.sin(a) * (R + 0.09), z0], rz: a, tones: 'plank', tint: 1.06, origin: 'center' });
    }
  };
  const R0 = 0.95, wy = 1.75;
  cog(wheel, R0, 32, 0.0, 0.14, 'timber', 20);
  for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) wheel.box(R0 * 2, 0.1, 0.1, { at: [0, 0, 0.0], rz: a, tones: 'timber', pattern: 'none', origin: 'center' });
  wheel.box(0.28, 0.28, 0.2, { at: [0, 0, 0.02], tones: 'timber', origin: 'center' });
  wheel.box(0.14, 0.14, 0.34, { at: [0, 0, 0.17], tones: 'trunk', pattern: 'none', origin: 'center' });      // the axle stub
  const wheelG = wheel.build({ name: 'house-14-pitwheel' });
  const wheelP = new THREE.Group(); wheelP.position.set(mx, wy, -D / 2 + 0.18); wheelP.add(wheelG);
  room.wallFrame('back', ({ full }) => { full.box(0.36, 0.36, 0.04, { at: [mx, wy - 0.18, 0.02], tones: 'iron' }); });

  // ---- the grain loft over the back-left corner (sacks on it), the bed underneath, a ladder up
  const lx1 = -1.45, lz1 = -1.0, ly = 2.05;
  {
    const b = room.b;
    b.box(lx1 + W / 2, 0.12, lz1 + D / 2, { at: [(lx1 - W / 2) / 2, ly - 0.12, (lz1 - D / 2) / 2], tones: 'plank', pattern: 'planks' });
    for (const x of [lx1 - 0.07, -W / 2 + 0.07]) { b.box(0.14, ly - 0.12, 0.14, { at: [x, 0, lz1 - 0.07], tones: 'timber' }); room.solidAt(x, lz1 - 0.07, 0.16, 0.16); }
    b.box(lx1 + W / 2, 0.14, 0.14, { at: [(lx1 - W / 2) / 2, ly - 0.26, lz1 - 0.07], tones: 'timber' });
    for (const [x, z, ry] of [[-3.9, -2.4, 0.1], [-3.5, -2.3, -0.2], [-3.1, -2.45, 0.3], [-2.7, -2.35, 0], [-2.3, -2.4, -0.15], [-3.7, -1.75, 0.2], [-3.3, -1.7, -0.3], [-1.95, -1.5, 0.4]]) {
      b.box(0.36, 0.44, 0.32, { at: [x, ly, z], ry, tones: sackT, layer: 'soft', tint: 0.94 + ((x * 7) % 1) * 0.1 });
      b.box(0.14, 0.08, 0.12, { at: [x, ly + 0.44, z], ry, tones: sackT, tint: 0.88, layer: 'soft' });
    }
    // ladder from the floor to the loft edge
    const lx = lx1 - 0.55;
    for (const s of [-1, 1]) b.hexa([
      new THREE.Vector3(lx + s * 0.22 - 0.03, 0, lz1 + 0.6), new THREE.Vector3(lx + s * 0.22 + 0.03, 0, lz1 + 0.6),
      new THREE.Vector3(lx + s * 0.22 - 0.03, ly + 0.4, lz1 + 0.02), new THREE.Vector3(lx + s * 0.22 + 0.03, ly + 0.4, lz1 + 0.02),
      new THREE.Vector3(lx + s * 0.22 - 0.03, 0, lz1 + 0.66), new THREE.Vector3(lx + s * 0.22 + 0.03, 0, lz1 + 0.66),
      new THREE.Vector3(lx + s * 0.22 - 0.03, ly + 0.4, lz1 + 0.08), new THREE.Vector3(lx + s * 0.22 + 0.03, ly + 0.4, lz1 + 0.08)], { tones: 'timber' });
    for (let k = 1; k < 8; k++) { const y = (k * (ly + 0.3)) / 8; b.box(0.44, 0.04, 0.04, { at: [lx, y, lz1 + 0.63 - (0.58 * y) / (ly + 0.4)], tones: 'plank' }); }
    room.solidAt(lx, lz1 + 0.4, 0.5, 0.45);
  }
  const bx = -W / 2 + 0.78, bz = -D / 2 + 1.0;
  const bed = F.bed(room, { x: bx, z: bz, wide: true, quilt: 'gold', frame: 'plank' });

  // the two hanging lanterns (the kit's shape; their flames go into the flour-mote glow mesh: one draw call fewer)
  const flames = [];
  const lantern = (x, z, y, r) => {
    const b = room.b;
    b.box(0.02, H - y - 0.3, 0.02, { at: [x, y + 0.3, z], tones: 'iron' });
    b.box(0.22, 0.04, 0.22, { at: [x, y, z], tones: 'iron' });
    b.cylinder(0.17, 0.04, 0.1, { at: [x, y + 0.24, z], tones: 'iron', segments: 4, ry: Math.PI / 4 });
    for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.025, 0.2, 0.025, { at: [x + sx2 * 0.09, y + 0.04, z + sz2 * 0.09], tones: 'iron' });
    flames.push([x, y + 0.05, z]);
    room.light({ pos: [x, y - 0.1, z], color: GLOW.candle, r: Math.min(r, 1.0), kind: 'lantern', intensity: 0.75 });   // the pool is a decal
  };

  // ---- the miller's counter with the SCALES (pans, weights), a lantern over it
  {
    const cx = -2.7, cz = 1.0;
    F.table(room, {
      x: cx, z: cz, w: 1.5, d: 0.75, items: false,
      extra: (b, g, top) => {
        b.box(0.1, 0.5, 0.1, { at: [0, top, 0], tones: 'brass' });                                     // scales post
        b.box(0.9, 0.04, 0.04, { at: [0, top + 0.5, 0], rz: 0.08, tones: 'brass', origin: 'center' });
        for (const [s, dy] of [[-1, 0.04], [1, -0.04]]) {
          b.box(0.015, 0.26, 0.015, { at: [s * 0.42, top + 0.24 + dy, 0], tones: 'brass' });
          b.cylinder(0.15, 0.13, 0.04, { at: [s * 0.42, top + 0.2 + dy, 0], tones: 'brass', segments: 8 });
        }
        b.cylinder(0.11, 0.11, 0.05, { at: [-0.42, top + 0.24 + 0.04, 0], tones: flour, segments: 8 });      // flour in the pan
        for (const [x, h] of [[0.42, 0.1], [0.5, 0.07], [0.6, 0.05]]) b.cylinder(0.04, 0.05, h, { at: [x + 0.05, top, 0.25], tones: 'iron', segments: 8 });
        b.box(0.3, 0.012, 0.22, { at: [-0.45, top, 0.22], ry: 0.2, tones: 'cream' });                     // the tally book
      },
    });
    F.stool(room, { x: cx, z: cz + 0.75 });
    lantern(cx + 0.4, cz + 0.5, 2.05, 3.2);
  }

  // ---- THE FLOUR BIN, front right: heaped white, the tower's brass gear half buried in it (red sigil on its face)
  const fbx = 2.35, fbz = 1.75;
  {
    const b = room.b;
    b.box(1.2, 0.62, 0.8, { at: [fbx, 0, fbz], tones: 'plank', pattern: 'boards' });
    for (const s of [-1, 1]) b.box(0.08, 0.66, 0.84, { at: [fbx + s * 0.6, 0, fbz], tones: 'timber' });
    b.box(1.12, 0.08, 0.72, { at: [fbx, 0.6, fbz], tones: flour });
    b.box(0.8, 0.08, 0.5, { at: [fbx - 0.08, 0.68, fbz], tones: flour, tint: 1.02 });
    b.box(0.44, 0.06, 0.3, { at: [fbx - 0.12, 0.76, fbz - 0.02], tones: flour, tint: 1.04 });
    // THE GEAR, stood up on its edge in the flour and leaning back toward the room so its face reads: a toothed rim
    // (14 teeth), 5 spokes and a hub, in a 3-tone brass ramp (bright teeth, mid rim, dark spokes + hub), and on the hub
    // the red sigil: one clean ring with a dot (the eye-in-a-clock). Its lower third is sunk in the heap.
    const gHi = paintRamp('#d8b048', { lightness: 0.66 }), gMid = paintRamp('#b88a2c', { lightness: 0.5 }), gDk = paintRamp('#7a5a22', { lightness: 0.34 });
    const R = 0.4, rimW = 0.08, gz = 0.06;
    b.push(M({ at: [fbx + 0.1, 0.62 + R * 0.82, fbz - 0.12], rx: -0.42, ry: 0.12 }));
    const segs = 16;
    for (let k = 0; k < segs; k++) {                                     // the rim
      const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2, rr = R - rimW / 2;
      const x0 = Math.cos(a0) * rr, y0 = Math.sin(a0) * rr, x1 = Math.cos(a1) * rr, y1 = Math.sin(a1) * rr;
      b.box(Math.hypot(x1 - x0, y1 - y0) + 0.012, rimW, gz, { at: [(x0 + x1) / 2, (y0 + y1) / 2, 0], rz: Math.atan2(y1 - y0, x1 - x0), tones: gMid, origin: 'center' });
    }
    for (let k = 0; k < 14; k++) {                                       // teeth
      const a = (k / 14) * Math.PI * 2;
      b.box(0.075, 0.075, gz, { at: [Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), 0], rz: a, tones: gHi, origin: 'center' });
    }
    for (let k = 0; k < 5; k++) {                                        // spokes
      const a = (k / 5) * Math.PI * 2 + 0.3, r0 = 0.12, r1 = R - rimW + 0.01;
      b.box(r1 - r0, 0.05, gz * 0.8, { at: [Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, 0], rz: a, tones: gDk, origin: 'center' });
    }
    b.push(M({ rx: Math.PI / 2 }));                                       // hub + sigil (cylinder axis -> +z, the face)
    b.cylinder(0.13, 0.13, gz + 0.02, { at: [0, -(gz + 0.02) / 2, 0], tones: gDk, segments: 12 });
    b.cylinder(0.105, 0.105, 0.012, { at: [0, (gz + 0.02) / 2, 0], tones: red, segments: 12 });            // the red ring ...
    b.cylinder(0.075, 0.075, 0.014, { at: [0, (gz + 0.02) / 2, 0], tones: gDk, segments: 12 });
    b.cylinder(0.028, 0.028, 0.02, { at: [0, (gz + 0.02) / 2, 0], tones: red, segments: 8 });              // ... and its dot
    b.pop();
    b.pop();
    // the flour heaped up round its foot (in front of it, so the bottom third is buried)
    b.box(0.95, 0.12, 0.3, { at: [fbx + 0.05, 0.62, fbz + 0.18], tones: flour, tint: 1.02 });
    b.box(0.6, 0.08, 0.22, { at: [fbx + 0.1, 0.74, fbz + 0.12], tones: flour, tint: 1.04 });
    b.box(0.08, 0.3, 0.06, { at: [fbx - 0.45, 0.62, fbz + 0.2], rz: 0.5, tones: 'plank' });           // the scoop stuck in
    room.solidAt(fbx, fbz, 1.3, 0.86);
  }

  // ---- the sack hoist from the beam (a static part of the room: the wheel and the runner carry the motion), sacks heaped by the door, flour drifts on the boards
  const hx = 3.65, hz = 0.35;
  room.b.box(W / 2 - hx + 0.35, 0.1, 0.1, { at: [(hx + W / 2) / 2 - 0.15, H - 0.2, hz], tones: 'timber' });
  F.sacks(room, { x: hx, z: hz + 0.1, n: 2 });
  const hoist = room.b;
  hoist.push(M({ at: [hx, H - 0.1, hz] }));
  hoist.box(0.12, 0.2, 0.08, { at: [0, -0.22, 0], tones: 'timber' });
  hoist.cylinder(0.08, 0.08, 0.04, { at: [0, -0.14, 0.05], tones: 'iron', segments: 8 });
  hoist.box(0.02, 1.15, 0.02, { at: [0, -1.37, 0], tones: 'cream' });
  hoist.box(0.05, 0.1, 0.03, { at: [0, -1.45, 0], tones: 'iron' });
  hoist.box(0.36, 0.44, 0.3, { at: [0, -1.92, 0], ry: 0.2, tones: sackT, layer: 'soft' });
  hoist.box(0.14, 0.08, 0.1, { at: [0, -1.5, 0], tones: sackT, tint: 0.9, layer: 'soft' });
  hoist.box(0.12, 0.12, 0.012, { at: [0.02, -1.72, 0.156], ry: 0.2, tones: CLOTH.green, tint: 1.02 });
  hoist.pop();
  F.sacks(room, { x: -W / 2 + 0.6, z: D / 2 - 0.5, n: 3, ry: 0.1 });
  for (const [fx, fz, fw, fd, ry] of [[0.45, 0.95, 0.9, 0.4, 0.1], [1.3, 1.1, 0.4, 0.3, 0.6], [2.6, 0.95, 0.5, 0.25, -0.3], [-0.6, 1.6, 0.4, 0.25, 0.4], [-1.6, 2.5, 0.3, 0.2, 0.2]]) {
    room.b.box(fw, 0.006, fd, { at: [fx, 0.001, fz], ry, tones: flour, layer: 'soft', tint: 0.96 });
  }
  lantern(1.2, 1.6, 2.25, 3.0);
  // the miller's night lamp on a nail between the pit wheel and the right window: at night it backlights the wheel
  Wl.sconce(room, { wall: 'back', x: 1.95, y: 1.5, r: 1.0 });
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });

  // ---- daylight: only two slanting beams from the high windows reach the floor
  const beam = (x, z, cx, w) => z > -2.4 && z < 2.3 && Math.abs(x - (cx + (z + 2.4) * 0.38)) < w;
  const mask = sunMask(room, { name: 'house-14-roof', cell: 0.1, open: (x, z) => beam(x, z, -1.75, 0.45) || beam(x, z, 1.2, 0.85) });

  // ---- ambiance: flour drifting in the two beams (window-kind glow: bright by day, gone at night)
  // NIGHT (same mesh): the beams close; the mill is warm wood in the honey light of its lamps - a pool round the
  // scales and the counter, another at the foot of the hurst steps, the night lamp on the back wall throwing the
  // great pit wheel into silhouette against honey-lit boards - with the day's flour still hanging in the air
  // (the motes turn a dim lantern-gold). Only one cold thing: a thin moon spill from the high right window lands on
  // the flour bin, and the buried gear's rim glints in it.
  const HONEY = ['#4a3a28', '#7a5e3a', '#b08a52', '#dcbc80'];
  const night = (b, layer) => {
    ditherPool(b, layer, { room, x: -2.35, z: 1.45, y: 0.03, r: 1.55, rv: 1.05, cols: HONEY, peak: 0.85, fall: 1.4, cell: 0.05 });
    ditherPool(b, layer, { room, x: 1.15, z: 1.75, y: 0.03, r: 1.45, rv: 0.9, cols: HONEY, peak: 0.8, fall: 1.4, cell: 0.05 });
    ditherPool(b, layer, { room, x: 0.45, z: hz1 - 0.15, y: hy + 0.01, r: 1.25, rv: 0.6, cols: HONEY.slice(0, 3), peak: 0.7, cell: 0.05,
      keep: (u, v) => -v + hz1 - 0.15 < hz1 - 0.02 });                                                // up over the hurst's front edge
    ditherPool(b, layer, { room, plane: 'back', x: 1.35, y: 1.55, r: 1.7, rv: 1.15, cols: ['#6a5a44', '#94785a', '#c09c6c'], peak: 0.85, fall: 1.3, cell: 0.05,
      keep: (u, v) => Math.abs(u - 1.4) > 0.45 || Math.abs(v - 0.85) > 0.5 });                       // honey on the boards, the wheel against it
    ditherPool(b, layer, { room, x: fbx + 0.2, z: fbz - 0.25, y: 0.84, r: 0.75, rv: 0.45, cols: ['#7a90a8', '#a8c0d4', '#d0e0ec'], peak: 0.8, cell: 0.04 });
  };
  const motes = particles(room, ctx, {
    name: 'house-14-flour', n: 26 + 1 + flames.length, night,
    nightColor: (i) => (i < 26 ? (i % 3 ? '#7A6A4E' : '#5E5444') : i === 26 ? '#F4DC80' : null),
    make: (b, i, layer) => (i === 26
      ? b.box(0.06, 0.06, 0.04, { at: [fbx - 0.12, 1.32, fbz - 0.29], tones: 'glass', layer, glow: TP.glow[0], glowKind: 2 })   // a glint on the gear's rim
      : i > 26 ? b.box(0.15, 0.17, 0.15, { at: flames[i - 27], tones: 'glass', layer, glow: GLOW.candle, glowKind: 2 })        // lantern flames
        : b.box(0.035, 0.035, 0.035, { at: [0, 0, 0], tones: 'glass', layer, glow: i % 3 ? '#F4ECD8' : '#E0D4B8', glowKind: 3 })),
    path: (i, t) => {
      if (i >= 26) return [0, 0, 0];
      const side = i % 2 ? -1.55 : 1.4, u = (t * 0.035 + i * 0.137) % 1;
      const y = 2.6 - u * 2.4, zz = -2.3 + u * 3.0 + Math.sin(t * 0.5 + i) * 0.2;
      return [side + (zz + 2.4) * 0.3 + Math.sin(t * 0.7 + i * 2.3) * 0.35, y, zz];
    },
  });

  // point lights only warm the props right by them (short, gentle: the pools are the dithered decals above)
  for (const l of room.lightList) { l.r = Math.min(l.r, 1.0); l.intensity = Math.min(l.intensity, 0.75); }

  room.spot('millstones', mx - 0.3, hz1 + 0.8, Math.PI);
  room.spot('bin', fbx - 0.2, fbz - 0.75, 0);
  room.spot('scales', -2.7, 1.75, Math.PI);
  room.spot('hoist', hx - 0.6, hz + 0.7, Math.PI / 2);

  // the pit wheel hangs on the back wall: hide it when the back wall drops to its stub (yaw ~180)
  const backCut = () => { const y = engine.camera?.targetYaw ?? engine.camera?.yaw ?? 0; return -Math.cos(y) > 0.3; };
  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx + 1.2, z: bz + 0.95, facing: -Math.PI / 2 },
    extras: [mask.group, runnerP, wheelP, motes.group],
    nightAmbient: NIGHT_AMBIENT,   // the demo's night look (time.js ROOM_NIGHT shape): warm wood, lantern honey, flour haze
    update(t) {
      mask.update(); motes.update(t);
      const k = Math.floor(t * 6) / 6;
      wheelG.rotation.z = -k * 0.32;
      runnerG.rotation.y = k * 0.55;
      wheelP.visible = !backCut();
    },
    bedRect: bed.rect,
  };
}
