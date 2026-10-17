// house-10 interior: The Old Boot - the cobbler (owner: lore-10..14 builder). docs/LORE.md row 10, docs/INTERIORS.md.
// You are INSIDE the boot: a LOW, narrow room (2.5 m) under the boot's laces - big cream laces criss-cross overhead
// between brass eyelets on the wall tops, the walls are stitched leather panels, the only daylight is one round
// EYELET window (a brass ring) that throws a single warm patch on the floor; the rest of the room stays dim (a
// shadow-only "boot leather" mask high above the room keeps the sun out). No hearth: a little pot-bellied iron stove
// in the front-left corner with a kettle that steams.
// Story: the whole back wall is a rack of SHOES FOR EVERY VILLAGER, a pair per name tag (15). One pair - middle row -
// has grey ASH on its soles, and a trail of ashy footprints comes in from the door and stops at the rack: someone
// walks the lanes at night and puts the shoes back before dawn. The cobbler's bench (centre right) under a three-globe
// cobbler's lamp (the key light: a pool of amber on the bench at any hour, leather dust drifting in it); on the bench a
// half-made boot on its last, and a pocket watch left for repair, stopped at 11:55. A box-bed with red curtains in the
// back-left corner, the Lantern-maker's lantern by the door, a cowhide on the floor, hides in a barrel, shoe boxes.
// Ambiance: warm leather browns, one amber lamp pool, leather dust motes, kettle steam. Homely, with one wrong note.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 8, d: 5.4, h: 2.5, wall: 'plaster', pal: 0, floor: 'boards' };
/** Night look (docs/DEMO.md 4.3 nightAmbient): warm leather browns, one amber lamp. */
const NIGHT_AMBIENT = { lit: '#ECB888', sh: '#A47E64', k: 0.7, gain: 1.2, mist: 0.25 };

/** Side profiles (x = toe direction, y up), metres for size 1. */
const LAST = [[0, 0], [0.82, 0], [0.97, 0.05], [1, 0.12], [0.86, 0.2], [0.55, 0.28], [0.34, 0.5], [0.3, 0.62], [0.02, 0.62], [-0.03, 0.3]];
const BOOT = [[0, 0], [0.8, 0], [0.98, 0.06], [1, 0.16], [0.82, 0.26], [0.52, 0.32], [0.4, 0.95], [0.04, 0.95], [0.02, 0.3], [-0.04, 0.12]];
const SHOE = [[0, 0], [0.85, 0], [1, 0.08], [0.9, 0.2], [0.5, 0.26], [0.3, 0.42], [0.02, 0.42], [-0.03, 0.15]];
const scaleP = (pts, s, sy = s) => pts.map(([x, y]) => [x * s, y * sy]);

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
  const leather = paintRamp('#7a4430', { lightness: 0.5 });
  const leatherDk = paintRamp('#5a3c2c', { lightness: 0.3 });
  const tan = paintRamp('#a07850', { lightness: 0.56 });
  const sole = paintRamp('#3c3034', { lightness: 0.26 });
  const ash = paintRamp('#8a8690', { lightness: 0.76 });
  const floorT = paintRamp('#4a3226', { lightness: 0.34 });
  const shoeCols = [leatherDk, CLOTH.red, tan, CLOTH.blue, CLOTH.green, sole, CLOTH.purple, paintRamp('#2f6a5a', { lightness: 0.4 })];

  // ---- shell: stitched leather panels over a dark tan wainscot, dark worn boards; one round eyelet window
  const winX = 2.95, winY = 1.25, winS = 0.62;
  room.shell({
    windows: [{ x: winX, y: winY, w: winS, h: winS, panes: [2, 2], curtains: null, frame: 'brass' }],
    wallTones: { upper: { tones: leather, pattern: 'boards', scale: 1.7 }, lower: { tones: tan, pattern: 'vboards', scale: 0.7 } },
    dado: 0.7, floorTones: floorT, floorPattern: 'planks', beams: false,
  });
  // the eyelet: a fat brass ring round the square window (8 boxes), stitch rows on every wall
  room.wallFrame('back', ({ full }) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, r = winS * 0.62;
      full.box(0.3, 0.13, 0.08, { at: [winX + Math.cos(a) * r, winY + winS / 2 + Math.sin(a) * r, 0.04], rz: a + Math.PI / 2, tones: 'brass', origin: 'center' });
    }
  });
  for (const wall of ['back', 'left', 'right']) {
    room.wallFrame(wall, ({ full, len }) => {
      // (flat quads 2 cm off the wall: the 12-tri boxes cost ~900 tris for 1-px dashes)
      const q = [];
      for (let x = -len / 2 + 0.15; x <= len / 2 - 0.15; x += 0.2) q.push(x - 0.05, H - 0.28, 0.022, x + 0.05, H - 0.28, 0.022, x + 0.05, H - 0.255, 0.022, x - 0.05, H - 0.28, 0.022, x + 0.05, H - 0.255, 0.022, x - 0.05, H - 0.255, 0.022);
      full.tris(q, { tones: 'cream' });
    });
  }

  // ---- the boot's LACING across the top of the back wall: big brass eyelets + fat criss-cross cream laces
  room.wallFrame('back', ({ full }) => {
    const y0 = 1.98, y1 = 2.32, n = 9, xa = -2.0, xb = 2.6, dx = (xb - xa) / (n - 1);
    for (let k = 0; k < n; k++) for (const y of [y0, y1]) full.cylinder(0.06, 0.06, 0.05, { at: [xa + k * dx, y, 0.0], tones: 'brass', segments: 8 });
    for (let k = 0; k < n - 1; k++) {
      const len = Math.hypot(dx, y1 - y0) + 0.04, a = Math.atan2(y1 - y0, dx);
      full.box(len, 0.045, 0.03, { at: [xa + (k + 0.5) * dx, (y0 + y1) / 2, 0.05], rz: a, tones: 'cream', origin: 'center' });
      full.box(len, 0.045, 0.03, { at: [xa + (k + 0.5) * dx, (y0 + y1) / 2, 0.08], rz: -a, tones: 'cream', tint: 0.94, origin: 'center' });
    }
    // the lace ends dangle down past the rack, a bow on the right
    for (const [x, l] of [[xb + 0.1, 0.55], [xb + 0.22, 0.4]]) full.box(0.04, l, 0.03, { at: [x, y1 - l + 0.02, 0.06], tones: 'cream' });
  });

  // ---- the box-bed in the back-left corner (red curtains half drawn)
  const bx = -W / 2 + 0.62, bz = -D / 2 + 1.02;
  const bed = F.bed(room, { x: bx, z: bz, quilt: 'red', frame: 'timber' });
  {
    const b = room.b, px = -W / 2 + 1.28;
    b.box(0.08, 2.0, 2.1, { at: [px, 0, -D / 2 + 1.05], tones: 'timber', pattern: 'vboards', scale: 0.6 });
    // the canopy: a boarded top in the leather-shop tan (not a black hole in the corner), framed by a beam rim, with
    // the cobbler's spare stock up there - two shoe boxes and a coil of leather
    b.box(1.36, 0.1, 2.2, { at: [-W / 2 + 0.64, 2.0, -D / 2 + 1.1], tones: tan, pattern: 'boards', scale: 0.8, tint: 0.92 });
    for (const z of [-D / 2 + 0.04, -D / 2 + 2.16]) b.box(1.36, 0.06, 0.08, { at: [-W / 2 + 0.64, 2.1, z], tones: 'timber' });
    b.box(0.08, 0.06, 2.2, { at: [px - 0.0, 2.1, -D / 2 + 1.1], tones: 'timber' });
    b.box(0.5, 0.22, 0.34, { at: [-W / 2 + 0.5, 2.1, -D / 2 + 0.55], ry: 0.1, tones: leather, tint: 0.95 });
    b.box(0.46, 0.04, 0.3, { at: [-W / 2 + 0.5, 2.32, -D / 2 + 0.55], ry: 0.1, tones: 'cream', tint: 0.9 });
    b.box(0.44, 0.18, 0.3, { at: [-W / 2 + 0.62, 2.1, -D / 2 + 1.15], ry: -0.15, tones: leatherDk });
    b.cylinder(0.2, 0.2, 0.1, { at: [-W / 2 + 0.6, 2.1, -D / 2 + 1.75], tones: leather, segments: 8 });
    b.box(1.36, 0.16, 0.08, { at: [-W / 2 + 0.64, 1.86, -D / 2 + 2.16], tones: 'timber' });
    b.box(0.34, 1.62, 0.07, { at: [-W / 2 + 0.24, 0.26, -D / 2 + 2.1], tones: CLOTH.red, pattern: 'vboards', scale: 0.35, layer: 'soft' });
    b.box(0.22, 1.62, 0.07, { at: [px - 0.14, 0.26, -D / 2 + 2.1], tones: CLOTH.red, pattern: 'vboards', scale: 0.35, tint: 0.94, layer: 'soft' });
  }
  F.nightstand(room, { x: -W / 2 + 1.7, z: -D / 2 + 0.26 });

  // ---- THE SHOE WALL: three shelves, five pairs each (one per villager), brass name tags; pair 7 has ashy soles
  const rx0 = -1.75, rx1 = 2.3, shelfY = [0.42, 0.98, 1.54], ASH = 7;
  const rackShoes = [];                                       // [x, y, z, prof, s, sy, col ramp, pair 0 back | 1 front, i] (wall-local)
  room.wallFrame('back', ({ full }) => {
    full.box(rx1 - rx0 + 0.2, 1.62, 0.04, { at: [(rx0 + rx1) / 2, 0.12, 0.02], tones: 'timber', pattern: 'vboards', scale: 0.6, tint: 0.9 });
    for (const s of [-1, 1]) full.box(0.08, 1.78, 0.36, { at: [s < 0 ? rx0 - 0.06 : rx1 + 0.06, 0, 0.18], tones: 'plank' });
        shelfY.forEach((y, row) => {
      full.box(rx1 - rx0 + 0.1, 0.05, 0.34, { at: [(rx0 + rx1) / 2, y - 0.05, 0.17], tones: 'plank', tint: 1.04 });
      for (let k = 0; k < 5; k++) {
        const i = row * 5 + k, x = rx0 + 0.2 + k * ((rx1 - rx0 - 0.4) / 4), col = shoeCols[i % shoeCols.length];
        const prof = i % 3 === 0 ? BOOT : i % 3 === 1 ? SHOE : LAST, s = 0.36 + ((i * 7) % 3) * 0.025;
        const sy = s * 0.6;
        for (const p of [0, 1]) {
          full.prism(scaleP(prof, s, sy), 0.075, { at: [x - 0.16 + p * 0.03, y, 0.12 + p * 0.12], tones: col, tint: p ? 0.94 : 1 });
          rackShoes.push([x - 0.16 + p * 0.03, y, 0.12 + p * 0.12, prof, s, sy, col, p, i]);
        }
        // one sole slab under the pair (the gap between the two shoes is never seen at the 30 deg camera; half the tris)
        full.box(s * 0.92 + 0.03, 0.035, 0.205, { at: [x - 0.16 + 0.015 + s * 0.46, y, 0.18], tones: i === ASH ? ash : sole, tint: i === ASH ? 1.04 : 1 });
        full.box(0.1, 0.06, 0.02, { at: [x, y - 0.08, 0.35], tones: 'brass' });                               // name tag
        if (i === ASH) for (const [ax, az] of [[-0.1, 0.32], [0.16, 0.36], [0.05, 0.3]]) full.box(0.07, 0.015, 0.05, { at: [x + ax, y, az], tones: ash });
      }
    });
  });
  // the ash trail: footprints from the doormat to the rack (pairs of soles, fading toward the door)
  const ashSteps = [];
  {
    const pts = [[0.2, 1.95], [0.45, 1.35], [0.7, 0.72], [0.8, 0.1], [0.62, -0.5], [0.42, -1.05], [0.35, -1.55]];
    pts.forEach(([x, z], k) => {
      const nx = pts[Math.min(k + 1, pts.length - 1)][0] - x, nz = pts[Math.min(k + 1, pts.length - 1)][1] - z;
      const ry = Math.atan2(nx, nz) + Math.PI / 2, side = k % 2 ? 0.09 : -0.09;
      room.b.box(0.28, 0.014, 0.11, { at: [x + side * Math.cos(ry), 0.004, z - side * Math.sin(ry)], ry, tones: ash, tint: 0.9 + 0.1 * (k / pts.length) });
      ashSteps.push([x + side * Math.cos(ry), z - side * Math.sin(ry), ry]);
    });
  }

  // ---- the cobbler's bench (centre right), three-globe lamp = the key light
  const wbx = 1.85, wbz = 0.35;
  F.rug(room, { x: wbx - 0.3, z: wbz + 0.15, w: 2.2, d: 1.6, tones: 'cream', border: tan, pattern: 'stripes' });
  const bench = F.workbench(room, {
    x: wbx, z: wbz, w: 1.5,
    extra: (b, g, top) => {
      b.prism(scaleP(LAST, 0.3), 0.1, { at: [-0.6, top, -0.08], tones: 'thatch' });
      b.prism(scaleP(BOOT, 0.3, 0.17), 0.12, { at: [-0.61, top + 0.005, -0.08], tones: leather });
      b.box(0.22, 0.012, 0.16, { at: [-0.18, top, 0.18], tones: tan, ry: 0.3 });
      b.box(0.14, 0.012, 0.1, { at: [0.05, top, 0.22], tones: CLOTH.red, ry: -0.5 });
      b.box(0.02, 0.02, 0.2, { at: [0.2, top, -0.05], tones: 'timber', ry: 0.6 });
      b.box(0.09, 0.05, 0.04, { at: [0.26, top, 0.03], tones: 'iron', ry: 0.6 });
      // the pocket watch left for repair, lid open, hands at 11:55 (hour hand nearly up, minute hand a tick left)
      b.cylinder(0.075, 0.075, 0.025, { at: [0.48, top, 0.2], tones: 'brass', segments: 8 });
      b.cylinder(0.06, 0.06, 0.03, { at: [0.48, top, 0.2], tones: 'cream', segments: 8 });
      b.box(0.012, 0.012, 0.045, { at: [0.48, top + 0.03, 0.18], tones: 'iron' });
      b.box(0.012, 0.012, 0.06, { at: [0.475, top + 0.03, 0.172], ry: 0.52, tones: 'iron' });
      b.box(0.1, 0.012, 0.02, { at: [0.48, top + 0.005, 0.27], tones: 'brass' });                       // the chain
      // the lamp: a candle in the middle of three water globes on a brass ring stand
      const gx = -0.05, gz = -0.12;
      b.cylinder(0.1, 0.12, 0.03, { at: [gx, top, gz], tones: 'brass', segments: 8 });
      b.box(0.03, 0.42, 0.03, { at: [gx, top + 0.03, gz], tones: 'brass' });
      g.box(0.06, 0.08, 0.06, { at: [gx, top + 0.45, gz], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5, px = gx + Math.cos(a) * 0.2, pz = gz + Math.sin(a) * 0.2;
        b.box(0.2, 0.02, 0.02, { at: [(gx + px) / 2, top + 0.38, (gz + pz) / 2], ry: -a, tones: 'brass' });
        g.cylinder(0.09, 0.09, 0.15, { at: [px, top + 0.33, pz], tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 2, segments: 8 });
      }
    },
  });
  room.light({ pos: [wbx - 0.05, 1.3, wbz + 0.1], color: GLOW.candle, r: 3.0, kind: 'fire', intensity: 1.5 });
  F.stool(room, { x: wbx - 0.2, z: wbz - 0.7 });

  // ---- pot-bellied stove in the front-left corner, kettle on top (steam), pipe up through the laces
  const sx = -W / 2 + 0.62, sz = D / 2 - 1.15;
  {
    const b = room.b, g = room.g;
    b.box(0.7, 0.05, 0.7, { at: [sx, 0, sz], tones: 'ashlar' });
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(0.05, 0.14, 0.05, { at: [sx + dx, 0.05, sz + dz], tones: 'iron' });
    b.cylinder(0.26, 0.3, 0.55, { at: [sx, 0.19, sz], tones: 'iron', segments: 8 });
    b.cylinder(0.24, 0.2, 0.1, { at: [sx, 0.74, sz], tones: 'iron', segments: 8 });
    b.cylinder(0.07, 0.07, H - 0.84, { at: [sx, 0.84, sz], tones: 'iron', segments: 8 });
    g.box(0.2, 0.16, 0.04, { at: [sx + 0.08, 0.3, sz + 0.28], ry: 0.4, tones: 'glass', layer: 'glass', glow: GLOW.fire, glowKind: 2 });
    b.cylinder(0.11, 0.08, 0.13, { at: [sx, 0.84, sz + 0.1], tones: 'copper', segments: 8 });                // kettle
    b.box(0.13, 0.03, 0.03, { at: [sx + 0.12, 0.92, sz + 0.1], rz: 0.6, tones: 'copper' });
    room.solidAt(sx, sz, 0.75, 0.75);
    room.light({ pos: [sx + 0.2, 0.4, sz + 0.35], color: GLOW.fire, r: 2.4, kind: 'fire', intensity: 1.2 });
  }
  // a small tea table + chair by the stove
  F.table(room, { x: -1.95, z: 0.9, round: true, w: 0.8, d: 0.8, items: false, extra: (b) => {
    b.cylinder(0.05, 0.05, 0.09, { at: [0.12, 0.76, 0.05], tones: CLOTH.blue, segments: 8 });
    b.box(0.22, 0.04, 0.16, { at: [-0.12, 0.76, -0.05], tones: 'cream', ry: 0.3 });
  } });
  F.chair(room, { x: -2.75, z: 0.75, ry: Math.PI / 2 });

  // ---- the Lantern-maker's lantern by the door (every house has one), hides in a barrel, shoe boxes, boots hung up
  F.hangingLantern(room, { x: 1.0, z: D / 2 - 0.75, y: 1.95 });
  F.barrel(room, { x: W / 2 - 0.45, z: D / 2 - 0.55 });
  for (const [dx, dz, ry, c] of [[-0.1, 0.02, 0.3, tan], [0.1, -0.06, -0.4, leather], [0.02, 0.12, 1.1, leatherDk]]) {
    room.b.cylinder(0.07, 0.07, 0.42, { at: [W / 2 - 0.45 + dx, 0.78, D / 2 - 0.55 + dz], ry, tones: c, segments: 8 });
  }
  {
    const x = W / 2 - 0.42, z = 0.75;
    [[0.6, 0.2, 0.4, CLOTH.blue], [0.54, 0.2, 0.36, tan], [0.48, 0.18, 0.32, CLOTH.red]].reduce((y, [w, h, d, lid], k) => {
      room.b.box(d, h, w, { at: [x, y, z], ry: k * 0.12, tones: 'thatch', tint: 0.96 });
      room.b.box(d + 0.03, 0.05, w + 0.03, { at: [x, y + h - 0.03, z], ry: k * 0.12, tones: lid });
      return y + h + 0.02;
    }, 0);
    room.solidAt(x, z, 0.5, 0.66);
  }
  const hungBoots = [[-0.9, -0.2, leather], [-0.55, -0.35, leatherDk]];
  for (const [hx, hz, col] of hungBoots) {          // boots hung by their laces
    room.b.box(0.015, 0.4, 0.015, { at: [hx + 0.05, H - 0.5, hz], tones: 'cream' });
    for (const p of [0, 1]) room.b.prism(scaleP(BOOT, 0.3, 0.32).map(([x, y]) => [x, -y]), 0.08, { at: [hx - 0.04 + p * 0.09, H - 0.48, hz + p * 0.05], tones: col, tint: p ? 0.95 : 1 });
  }
  F.doormat(room, { x: 0, z: D / 2 - 0.4 });

  Wl.sconce(room, { wall: 'back', x: -2.05, y: 1.55, r: 2.6 });            // lights the rack at night

  // ---- daylight: only the eyelet window's warm patch reaches the floor (a soft ellipse in front of the window)
  const mask = sunMask(room, { name: 'house-10-leather-sky', open: (x, z) => ((x - winX + 0.1) / 0.75) ** 2 + ((z + 1.45) / 0.6) ** 2 < 1 });

  // ---- ambiance: leather dust drifting in the lamp pool, steam curling off the kettle
  // NIGHT (same mesh, drawn only in the dark): the room's own light is warm leather-amber, in soft dithered pools -
  // the cobbler's lamp pours amber over the bench and the rug, the stove breathes a flickering orange corner, the
  // sconce warms the left end of the shoe rack, the door lantern a small pool on the boards. And the wrong note: the
  // ashy footprints and the ash-soled pair keep a faint cold pallor in the dark.
  const AMBER = ['#4a2c1e', '#7a4826', '#a8682e', '#d89a4a'];
  // NIGHT SHOE WALL (fix 2026-10-16, the critic's "flat brown band with ragged holes, muddy boots"): the rack reads as a
  // warm lamp-lit cabinet - each bay's backing in three soft steps (warm where the pairs stand, shadowed up under the
  // next shelf), every shelf with a bright amber lip and a lit front strip, brass name tags that glint, and every
  // shoe re-painted in its own colour (lifted, warmed) with a pale rim along its top edges; the back shoe of each
  // pair shows as a darker band above its partner. The ash-soled pair keeps its cold pale soles. Flat decals in the
  // dust mesh (night-only drawRange): no extra mesh, no extra light.
  const nightTone = (ramp, L, warm = 0.18) => {
    const c = new THREE.Color(ramp[1]), hsl = {};
    c.getHSL(hsl, THREE.SRGBColorSpace);
    c.setHSL(hsl.h, Math.min(0.6, hsl.s * 1.05 + 0.04), L(hsl.l), THREE.SRGBColorSpace);
    return '#' + c.lerp(new THREE.Color('#e0904c'), warm).getHexString();
  };
  /**
   * Night paint for a profile prism (pts [[x, y]] room-local, extruded `depth` along z, centred on zc): its front face
   * as one flat `body` decal, and every top face (outward normal pointing up) as a lifted `top` quad - lit tops over a
   * mid body instead of a dark unlit lump. Winding-safe for flipped profiles.
   */
  const paintPrism = (b, layer, pts, zc, depth, body, top) => {
    const o = { tones: 'glass', layer, glowKind: 1 }, n = pts.length;
    let area = 0;
    for (let e = 0; e < n; e++) area += pts[e][0] * pts[(e + 1) % n][1] - pts[(e + 1) % n][0] * pts[e][1];
    const sg = area > 0 ? 1 : -1, zf = zc + depth / 2 + 0.003, z0 = zc - depth / 2, z1 = zf;
    const pos = [];
    for (const [a, c, d] of THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
      const [A, C, E] = [pts[a], pts[c], pts[d]], ccw = (C[0] - A[0]) * (E[1] - A[1]) - (C[1] - A[1]) * (E[0] - A[0]) > 0;
      for (const q of ccw ? [A, C, E] : [A, E, C]) pos.push(q[0], q[1], zf);
    }
    b.tris(pos, { ...o, glow: body });
    const tp = [];
    for (let e = 0; e < n; e++) {
      const [ax0, ay0] = pts[e], [bx0, by0] = pts[(e + 1) % n], dx = bx0 - ax0, dy = by0 - ay0, L = Math.hypot(dx, dy);
      const nx = (sg * dy) / L, ny = (-sg * dx) / L;
      if (ny < 0.5) continue;
      const ex = (dx / L) * 0.008, ey = (dy / L) * 0.008;             // a little overlap: no dark wedge at the joints
      let ax = ax0 - ex + nx * 0.003, ay = ay0 - ey + ny * 0.003, bx = bx0 + ex + nx * 0.003, by = by0 + ey + ny * 0.003;
      if (dx > 0) [ax, ay, bx, by] = [bx, by, ax, ay];                 // walk right-to-left so the quad faces up
      tp.push(ax, ay, z1, bx, by, z0, bx, by, z1, ax, ay, z1, ax, ay, z0, bx, by, z0);
    }
    if (tp.length) b.tris(tp, { ...o, glow: top });
  };
  const rackNight = (b, layer) => {
    const Z = -D / 2, o = (hex) => ({ tones: 'glass', layer, glow: hex, glowKind: 1 });
    const wallQ = (x0, y0, x1, y1, z, hex) => b.tris([x0, y0, Z + z, x1, y0, Z + z, x1, y1, Z + z, x0, y0, Z + z, x1, y1, Z + z, x0, y1, Z + z], o(hex));
    const topQ = (x0, x1, z0, z1, y, hex) => b.tris([x0, y, Z + z1, x1, y, Z + z1, x1, y, Z + z0, x0, y, Z + z1, x1, y, Z + z0, x0, y, Z + z0], o(hex));
    const X0 = rx0 - 0.1, X1 = rx1 + 0.1;
    // the backing, bay by bay (in front of the board, behind the shoes)
    shelfY.forEach((y, k) => {
      const yt = k < 2 ? shelfY[k + 1] - 0.05 : 1.74, h = yt - y;
      wallQ(X0, y, X1, y + h * 0.42, 0.045, '#4e301f');
      wallQ(X0, y + h * 0.42, X1, y + h * 0.74, 0.045, '#3f271a');
      wallQ(X0, y + h * 0.74, X1, yt, 0.045, '#2e1c15');
    });
    // the shelves: a warm top (brighter toward the front edge), a lit front strip with a hot amber lip
    for (const y of shelfY) {
      topQ(X0 + 0.05, X1 - 0.05, 0.0, 0.22, y + 0.003, '#4a2e1e');
      topQ(X0 + 0.05, X1 - 0.05, 0.22, 0.34, y + 0.003, '#6e4628');
      wallQ(X0 + 0.05, y - 0.05, X1 - 0.05, y - 0.018, 0.343, '#7a4c2a');
      wallQ(X0 + 0.05, y - 0.018, X1 - 0.05, y, 0.343, '#d4a05a');
    }
    // the side uprights: a lit inner edge
    for (const x of [rx0 - 0.06 + 0.02, rx1 + 0.06 - 0.02]) wallQ(x - 0.02, 0.0, x + 0.02, 1.78, 0.363, '#7a5032');
    // the shoes: front shoe of each pair in its lifted colour, the back one darker above it, lit tops on both
    for (const [X, y, z, prof, s, sy, col, p, i] of rackShoes) {
      const pts = scaleP(prof, s, sy).map(([px, py]) => [X + px, y + py]);
      if (p === 1) {
        paintPrism(b, layer, pts, Z + z, 0.075, nightTone(col, (l) => Math.max(0.3, Math.min(0.46, l * 1.1))), nightTone(col, (l) => Math.max(0.58, Math.min(0.72, l * 1.1 + 0.26)), 0.25));
        if (i === ASH) wallQ(X - 0.03, y, X + s * 0.92, y + 0.035, z + 0.0425 + 0.004, '#8e8c98');      // the ashy soles, cold and pale
      } else paintPrism(b, layer, pts, Z + z, 0.075, nightTone(col, (l) => Math.max(0.22, Math.min(0.34, l * 0.9)), 0.12), nightTone(col, (l) => Math.max(0.4, Math.min(0.54, l + 0.12)), 0.2));
    }
    // the two pairs hung by their laces in front of the rack: dim leather, lit along their soles
    for (const [hx, hz, col] of hungBoots) for (const p of [0, 1]) {
      const pts = scaleP(BOOT, 0.3, 0.32).map(([x, y]) => [hx - 0.04 + p * 0.09 + x, H - 0.48 - y]);
      paintPrism(b, layer, pts, hz + p * 0.05, 0.08, nightTone(col, (l) => Math.max(0.2, Math.min(0.3, l)), 0.15), nightTone(col, (l) => Math.max(0.38, Math.min(0.48, l + 0.12)), 0.2));
    }
    // brass name tags glint; the spilt ash on the ash pair's shelf
    shelfY.forEach((y, row) => {
      for (let k = 0; k < 5; k++) {
        const x = rx0 + 0.2 + k * ((rx1 - rx0 - 0.4) / 4);
        wallQ(x - 0.05, y - 0.08, x + 0.05, y - 0.02, 0.362, '#c8964c');
        if (row * 5 + k === ASH) for (const [ax, az] of [[-0.1, 0.32], [0.16, 0.36], [0.05, 0.3]]) topQ(x + ax - 0.035, x + ax + 0.035, az - 0.025, az + 0.025, y + 0.017, '#6c6a76');
      }
    });
  };
  const night = (b, layer) => {
    const underBench = (u, v) => !(Math.abs(u + 0.1) < 0.72 && Math.abs(-v + 0.2 - 0.05) < 0.3);     // the bench's own shadow
    ditherPool(b, layer, { room, x: wbx - 0.1, z: wbz + 0.2, y: 0.04, r: 1.95, rv: 1.4, cols: AMBER, peak: 0.82, fall: 1.3, cell: 0.05, keep: underBench });
    ditherPool(b, layer, { room, x: sx + 0.55, z: sz + 0.2, r: 1.1, rv: 0.8, cols: ['#4e2416', '#8a3c1c', '#c86428'], peak: 0.85, kind: 2, cell: 0.05 });
    ditherPool(b, layer, { room, plane: 'back', x: -2.05, y: 1.6, r: 0.75, rv: 0.85, cols: ['#4a2c22', '#6e4430', '#94603a'], peak: 0.85, cell: 0.05 });
    rackNight(b, layer);
    ditherPool(b, layer, { room, x: 1.0, z: D / 2 - 0.85, r: 0.8, rv: 0.55, cols: ['#4a3022', '#7a5230'], peak: 0.85, cell: 0.05 });
    for (const [x, z, ry] of ashSteps) {                       // (one flat quad per print: the 12-tri boxes cost the rack's budget)
      const c = Math.cos(ry), sn = Math.sin(ry), P = (u, w) => [x + u * c + w * sn, 0.02, z - u * sn + w * c];
      b.tris([...P(-0.1, 0.035), ...P(0.1, 0.035), ...P(0.1, -0.035), ...P(-0.1, 0.035), ...P(0.1, -0.035), ...P(-0.1, -0.035)], { tones: 'glass', layer, glow: '#5c5a68', glowKind: 1 });
    }
  };
  const dust = particles(room, ctx, {
    name: 'house-10-dust', n: 14, night,
    make: (b, i, layer) => b.box(0.03, 0.03, 0.03, { at: [0, 0, 0], tones: 'glass', layer, glow: TP.glow[i % 2 ? 0 : 1], glowKind: 1 }),
    path: (i, t) => {
      const ph = i * 2.39, y = 0.9 + ((t * 0.05 + i * 0.071) % 1) * 1.1;
      return [wbx - 0.05 + Math.sin(t * 0.4 + ph) * (0.35 + (i % 4) * 0.12), y, wbz + Math.cos(t * 0.33 + ph * 1.3) * 0.4];
    },
  });
  const steam = particles(room, ctx, {
    name: 'house-10-steam', n: 6,
    make: (b, i, layer) => b.box(0.07, 0.07, 0.07, { at: [0, 0, 0], tones: 'glass', layer, glow: '#C8C0B4', glowKind: 1 }),
    path: (i, t) => {
      const u = (t * 0.35 + i / 6) % 1;
      return [sx + 0.2 + u * 0.25 + Math.sin(t * 2 + i) * 0.04, 0.98 + u * 0.75, sz + 0.1 + Math.sin(u * 5 + i) * 0.06];
    },
  });

  // point lights only warm the props right by them (short reach, gentle: the floor pools are the dithered decals
  // above, so no hard-edged coloured disc lands on the boards or the leather walls)
  for (const l of room.lightList) {
    if (l.kind === 'fire') { l.r = Math.min(l.r, 1.5); l.intensity = Math.min(l.intensity, 1.0); }
    else { l.r = Math.min(l.r, 0.8); l.intensity = Math.min(l.intensity, 0.6); }
  }

  room.spot('bench', wbx, wbz + 0.8, Math.PI);
  room.spot('shoes', 0.3, -1.55, Math.PI);
  room.spot('stove', sx + 0.75, sz, -Math.PI / 2);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx, z: bz + 1.35, facing: Math.PI },
    extras: [mask.group, dust.group, steam.group],
    // the demo's night look for this room (time.js ROOM_NIGHT shape): warm leather browns
    nightAmbient: NIGHT_AMBIENT,
    update(t) { mask.update(); dust.update(t); steam.update(t); },
    bedRect: bed.rect, benchRect: bench.rect,
  };
}
