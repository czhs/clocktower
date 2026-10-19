// Interior kit (owner: interior-kit). docs/INTERIORS.md is the contract; src/town/interiors/index.js assembles a room.
//
// Cozy cut-away ("dollhouse") cottage rooms in the town style: the same shared kit materials as the town
// (src/town/kit.js Builder: per-vertex [hi, mid, sh] tones + 1-px world patterns + outlines) plus ONE extra material
// for things that always glow (fire, candle flames, the daylight / moonlight in a window): `interiorGlowMaterial`.
//
// ROOM FRAME (room-local metres, y up): the floor is centred on the origin, x in [-W/2, W/2] (left .. right at yaw 0),
// z in [-D/2, D/2] (back wall .. front wall). +z = toward the yaw-0 camera. The door is a gap in the FRONT wall at x 0.
// Walls stand OUTSIDE the floor rectangle (thickness T). The game's room grid maps onto it with room.tile(dx, dy)
// (layout.ts furnishHouse: floor tiles dx 1..9, rows dy 2..7; row 1 = things hung on the back wall).
//
//   const room = new Room(engine, { id: 'house-0', index: 0, w: 9, d: 6, h: 2.9, wall: 'timber', pal: 0 });
//   room.shell({ windows: [{ x: -2.5 }, { x: 2.5 }] });       // floor + 4 walls (+ low variants) + beams
//   FURNITURE.bed(room, { x: -3.5, z: -2, wide: false, quilt: 'blue' });
//   room.light({ pos: [0, 0.6, -2.6], color: TOWN_PALETTE.fireGlow, r: 4.5, kind: 'fire' });
//   const built = room.finish();                              // {group, walls, colliders, lights, spots, glowMat}
//
// Every FURNITURE.<name>(room, opts) takes `x, z` (room-local floor position of the piece's footprint centre) and
// `ry` (radians; the piece's local +z = its front, default facing the camera / into the room), adds its geometry to
// room.b (solid + soft layers) / room.g (glow), registers a collision rect (room.solid) unless `collide: false`, and
// returns {rect, top, lights?, spot?}. Wall pieces (`WALL` table: fireplace, window decor, shelves, charts, clocks)
// take `wall: 'back'|'left'|'right'` and `x` along that wall (+ `y` height) and go into that wall's builders so they hide
// with the wall when the camera turns (Room.setYaw).
import * as THREE from 'three';
import { Builder, M, toTones, kitMaterial } from '../kit.js';
import { toonMaterial } from '../../materials/toon.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** Builder.cylinder that also honours rx / rz (the kit's cylinder only turns about y). */
function cyl(b, r0, r1, h, o = {}) {
  if (!o.rx && !o.rz) return b.cylinder(r0, r1, h, o);
  const seg = o.segments ?? 8;
  b.push(M({ at: o.at ?? [0, 0, 0], rx: o.rx ?? 0, rz: o.rz ?? 0, ry: o.ry ?? 0 }));
  b.cylinder(r0, r1, h, { ...o, at: [0, 0, 0], ry: Math.PI / seg, rx: 0, rz: 0 });
  b.pop();
  return b;
}

// ------------------------------------------------------------------------------------------------ palette
/** v1 interior palettes (pipgws scripts/ground.ts IPALS: wallpaper ground / motif, limewash, painted boards), lifted to
 *  the noon range with paintRamp (an allowed palette derivative, docs/TOWN.md §3). Index = layout style.interior. */
const IPAL_V1 = [
  { paper: '#4b3953', motif: '#6e5676', wash: '#7a7078', paint: '#523c56' },
  { paper: '#30464b', motif: '#557074', wash: '#717c78', paint: '#365254' },
  { paper: '#574530', motif: '#84704c', wash: '#867a64', paint: '#6e5232' },
  { paper: '#384834', motif: '#5c7254', wash: '#78806c', paint: '#405432' },
  { paper: '#583436', motif: '#845454', wash: '#86746e', paint: '#623236' },
];
export const INTERIOR_PALETTES = IPAL_V1.map((p) => ({
  paper: paintRamp(p.paper, { lightness: 0.46 }),
  motif: paintRamp(p.motif, { lightness: 0.56 }),
  wash: paintRamp(p.wash, { lightness: 0.7 }),
  paint: paintRamp(p.paint, { lightness: 0.4 }),
  v1: p,
}));
/** Cloth ramps (v1 props.ts CLOTH red / blue / green / purple / gold via the town banner accents). */
export const CLOTH = {
  red: paintRamp(TOWN_PALETTE.bannerRed, { lightness: 0.46 }),
  blue: paintRamp(TOWN_PALETTE.bannerBlue, { lightness: 0.44 }),
  green: paintRamp(TOWN_PALETTE.bannerGreen, { lightness: 0.42 }),
  purple: paintRamp(TOWN_PALETTE.plum[1], { lightness: 0.44 }),
  gold: paintRamp(TOWN_PALETTE.bannerGold, { lightness: 0.56 }),
  linen: TOWN_PALETTE.cream,
  night: paintRamp('#1e3a5a', { lightness: 0.3 }),
};
/** Book spines (v1 bookshelf bookCols, lifted). */
const BOOKS = ['#7a2a2a', '#2a4a6a', '#3a5a2a', '#7a5e2a', '#4a2a5a', '#8a6a4a', '#5a3a2a'].map((h) => paintRamp(h, { lightness: 0.42 }));
/** Potion glass (house-5's glowing bottle hues, v1). */
export const POTIONS = ['#3a8a5a', '#8a3a6a', '#3a5a9a', '#b08a2a', '#9a3a3a', '#5a9a9a'].map((h) => paintRamp(h, { lightness: 0.5 }));

export const GLOW = {
  fire: TOWN_PALETTE.fireGlow, flame: TOWN_PALETTE.glow[0], candle: TOWN_PALETTE.lampGlow, ember: TOWN_PALETTE.glow[2],
  holy: TOWN_PALETTE.holyGlow,
};
/** Window "sky" colours (the light outside, multiplied into every window pane, kind 3) per town time of day. */
export const WINDOW_SKY = {
  morning: '#CFE6EC', noon: '#BFE0EA', afternoon: '#E8D2A8', golden: '#E8C9A0', night: '#24305A',
};

// ------------------------------------------------------------------------------------------------ glow material
const GLOW_STATE = new WeakMap();
/**
 * The always-glowing interior material (shared per engine, ONE extra shader program for every interior): geometry built
 * in a Builder's 'glass' layer with `glow: hex, glowKind: k` is emissive day and night (rtScene.a = 0, the PIPELINE
 * emissive rule) - k 1 steady (embers, star dots), 2 flame flicker (fire, candles; stepped 8 fps), 3 window light: the
 * glow colour times uIntWin (setWindowSky). k 0 = toon-lit dark glass (bottles, mirrors).
 */
export function interiorGlowMaterial(engine) {
  let st = GLOW_STATE.get(engine);
  if (st) return st.mat;
  const uIntWin = { value: new THREE.Color(WINDOW_SKY.noon) };
  const mat = toonMaterial(engine, {
    color: 0xffffff, vertexColors: true, toneAttributes: true, flatShading: true, outline: 'none',
    vertexHead: 'attribute vec4 aGlow; varying vec4 vIntGlow;',
    vertex: 'vIntGlow = aGlow;',
    fragmentHead: /* glsl */`
      uniform vec3 uIntWin;
      varying vec4 vIntGlow;
      float intFlicker(vec3 p) {
        float k = floor(uTime * 8.0) + floor(hash12(floor(p.xz * 3.0)) * 50.0);
        float h = fract(sin(k * 12.9898) * 43758.5453);
        return h < 0.25 ? 0.8 : (h < 0.5 ? 0.9 : (h < 0.75 ? 0.96 : 1.0));
      }`,
    uniforms: { uIntWin },
    tones: /* glsl */`
      {
        float gk = vIntGlow.a;
        if (gk > 0.5) {
          vec3 gc = vIntGlow.rgb;
          if (gk > 2.5) gc *= uIntWin; else if (gk > 1.5) gc *= intFlicker(vToonWorld);
          totalEmissiveRadiance = gc;
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
          diffuseColor.a = 0.0;
        } else diffuseColor.a = 1.0;
      }`,
  });
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.ZeroFactor;
  mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  mat.name = 'interior-glow';
  GLOW_STATE.set(engine, (st = { mat, uIntWin }));
  return mat;
}
/** The light outside every interior window: a WINDOW_SKY key, a hex, or a THREE.Color. */
export function setWindowSky(engine, sky = 'noon') {
  interiorGlowMaterial(engine);
  const st = GLOW_STATE.get(engine);
  st.uIntWin.value.set(WINDOW_SKY[sky] ?? sky);
}

/** Builder.build() + swap the 'glass' layer of a glow builder to the interior glow material. */
function buildGlow(engine, g, name) {
  const grp = g.build({ name, castShadow: false });
  grp.traverse((o) => { if (o.isMesh) { o.material = interiorGlowMaterial(engine); o.castShadow = false; } });
  return grp;
}

// ------------------------------------------------------------------------------------------------ the Room
const WALL_NAMES = ['back', 'left', 'right', 'front'];
/** Outward-into-the-room normal of each wall (the wall's local +z), and the yaw that turns local +z onto it. */
export const WALL_FRAME = {
  back: { n: [0, 1], ry: 0 }, front: { n: [0, -1], ry: Math.PI }, left: { n: [1, 0], ry: Math.PI / 2 }, right: { n: [-1, 0], ry: -Math.PI / 2 },
};

export class Room {
  /**
   * @param engine
   * @param o {id, index, w 9, d 6, h 2.9 (wall height), t 0.3 (wall thickness), wall 'timber'|'plaster'|'stone'|'brick'|'planks',
   *           pal 0..4 (INTERIOR_PALETTES), floor 'boards'|'flags', seed, doorW 1.1}
   */
  constructor(engine, o = {}) {
    this.engine = engine;
    this.id = o.id ?? 'room'; this.index = o.index ?? 0;
    this.W = o.w ?? 9; this.D = o.d ?? 6; this.H = o.h ?? 2.9; this.T = o.t ?? 0.3;
    this.wallKind = o.wall ?? 'plaster';
    this.pal = INTERIOR_PALETTES[(o.pal ?? this.index) % INTERIOR_PALETTES.length];
    this.floorKind = o.floor ?? (this.wallKind === 'stone' ? 'flags' : 'boards');
    this.seed = o.seed ?? (1013 + this.index * 7919);
    this.rng = rng(this.seed);
    this.doorW = o.doorW ?? 1.1;
    this.b = new Builder(engine, { name: `${this.id}-int` });         // free-standing furniture (solid + soft)
    this.g = new Builder(engine, { name: `${this.id}-int-glow` });    // always-glowing parts of that furniture
    this.walls = {};
    for (const w of WALL_NAMES) {
      this.walls[w] = { full: new Builder(engine, { name: `${this.id}-wall-${w}` }), low: new Builder(engine, { name: `${this.id}-wall-${w}-low` }),
        glow: new Builder(engine, { name: `${this.id}-wall-${w}-glow` }), openings: [] };
    }
    this.colliders = [];       // [{x0, z0, x1, z1, kind}] room-local
    this.lightList = [];       // [{pos: [x, y, z], color, r, kind, intensity}]
    this.spots = {};           // name -> {x, z, face}
    this.updaters = [];
  }

  // ---- coordinates
  /** Game furnishHouse tile (dx 0..10, dy 0..8 of the 11 x 9 room) -> room-local centre {x, z} (mirror: odd houses). */
  tile(dx, dy, { mirror = false, wTiles = 1, hTiles = 1 } = {}) {
    const sx = this.W / 9, sz = this.D / 6;                 // 9 floor tiles across, 6 rows deep
    const cx = (mirror ? 10 - dx - (wTiles - 1) : dx) + (wTiles - 1) / 2;
    return { x: (cx - 5) * sx, z: (dy - 4.5 - (hTiles - 1) / 2) * sz };
  }
  /** Inner face position of a wall (+ distance into the room). */
  wallZ(off = 0) { return -this.D / 2 + off; }

  // ---- registration
  solid(x0, z0, x1, z1, kind = 'furniture') { this.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), kind }); }
  /** Collision rect of a w x d footprint centred at (x, z), turned by ry (axis-aligned bounds). */
  solidAt(x, z, w, d, ry = 0, kind) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    this.solid(x - hw, z - hd, x + hw, z + hd, kind);
    return { x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd };
  }
  light({ pos, color = GLOW.candle, r = 2.5, kind = 'lantern', intensity = 1.4, flicker } = {}) {
    const l = { pos: [...pos], color, r, kind, intensity, flicker };
    this.lightList.push(l);
    return l;
  }
  spot(name, x, z, face = Math.PI) { this.spots[name] = { x, z, face }; }
  onUpdate(fn) { this.updaters.push(fn); }

  /** Builders of a wall ('back' | 'left' | 'right' | 'front'), pushed into that wall's frame: local x along the wall
   *  (left -> right as seen from inside the room), local y up, local z = 0 on the inner face, +z into the room. */
  wallFrame(name, fn) {
    const W = this.walls[name], f = WALL_FRAME[name];
    const len = name === 'back' || name === 'front' ? this.W : this.D;
    const at = name === 'back' ? [0, 0, -this.D / 2] : name === 'front' ? [0, 0, this.D / 2] : name === 'left' ? [-this.W / 2, 0, 0] : [this.W / 2, 0, 0];
    const m = M({ at, ry: f.ry });
    W.full.push(m); W.glow.push(m); W.low.push(m);
    try { fn({ full: W.full, glow: W.glow, low: W.low, len, wall: name }); } finally { W.full.pop(); W.glow.pop(); W.low.pop(); }
  }
  /** Room-local point of a wall-frame point (wall, u along the wall, y, out = distance into the room). */
  wallPoint(name, u, y, out = 0) {
    const f = WALL_FRAME[name];
    const at = name === 'back' ? [0, -this.D / 2] : name === 'front' ? [0, this.D / 2] : name === 'left' ? [-this.W / 2, 0] : [this.W / 2, 0];
    const c = Math.cos(f.ry), s = Math.sin(f.ry);
    return V3(at[0] + u * c + out * s, y, at[1] - u * s + out * c);
  }

  // ---- shell
  /**
   * Floor, 4 walls (full + low cut-away variant each), wall caps, a ceiling beam with joist ends along the back wall,
   * skirting, the doorway gap in the front wall (threshold + jamb posts), windows (holes + interior frames + panes that
   * glow with the light outside), and the dark void plane around the room.
   *   {windows: [{wall 'back', x, y 1.0 (sill), w 0.8, h 1.0, curtains: ramp | null, arch false}], dado 1.0,
   *    floorTones, floorPattern, wallTones: {upper, lower}, beams true, low 0.42 (cut-away height)}
   */
  shell(o = {}) {
    const { W, D, H, T } = this;
    const low = o.low ?? 0.42;
    const pal = this.pal;
    // --- floor (a thick slab so its edge reads under the cut-away front)
    const flags = this.floorKind === 'flags';
    const floorTones = o.floorTones ?? (flags ? 'ashlar' : 'plank');
    const floorPattern = o.floorPattern ?? (flags ? 'ashlar' : 'planks');
    this.b.box(W + 0.02, 0.12, D + 0.02, { at: [0, -0.12, 0], tones: floorTones, pattern: floorPattern, scale: flags ? 1.7 : 1, tint: o.floorTint ?? 1 });
    this.b.box(W + 2 * T + 0.3, 0.5, D + 2 * T + 0.3, { at: [0, -0.62, 0], tones: 'stone', pattern: 'rubble' });   // foundation lip
    // the void around the room (unlit-looking: the darkest night tone, no outline line against it)
    const vb = new Builder(this.engine, { name: `${this.id}-void` });
    vb.box(80, 0.05, 80, { at: [0, -0.7, -10], tones: [TOWN_PALETTE.nightSky, TOWN_PALETTE.nightSky, TOWN_PALETTE.nightSky] });
    this.voidGroup = vb.build({ castShadow: false, receiveShadow: false });
    this.voidGroup.traverse((m) => { if (m.isMesh) m.material = voidMaterial(this.engine); });

    // --- wall surfaces per kind
    const upper = o.wallTones?.upper ?? this._upperTones(), lower = o.wallTones?.lower ?? this._lowerTones();
    const dado = o.dado ?? (this.wallKind === 'stone' || this.wallKind === 'planks' ? 0 : 1.0);
    const windows = (o.windows ?? []).map((w) => ({ wall: 'back', y: 1.05, w: 0.8, h: 1.05, ...w }));
    for (const name of WALL_NAMES) {
      const front = name === 'front';
      const len = name === 'back' || name === 'front' ? W : D;
      const ext = name === 'back' || name === 'front' ? T : 0;           // back / front walls cover the corners
      const openings = windows.filter((w) => w.wall === name).map((w) => ({ x: w.x, y: w.y, w: w.w + 0.02, h: w.h }));
      if (front) openings.push({ x: 0, y: -0.2, w: this.doorW, h: H + 1 });
      this.walls[name].openings = openings;
      this.wallFrame(name, ({ full, low: lo }) => {
        const x0 = -len / 2 - ext, x1 = len / 2 + ext;
        // full: lower (dado) band + upper band
        if (dado > 0) {
          wallBand(full, { x0, x1, y0: 0, y1: dado, openings, tones: lower.tones, pattern: lower.pattern, scale: lower.scale });
          wallBand(full, { x0, x1, y0: dado, y1: H, openings, tones: upper.tones, pattern: upper.pattern, scale: upper.scale });
          // chair rail
          railWithGaps(full, { x0: -len / 2, x1: len / 2, y: dado, openings, h: 0.07, d: 0.06, tones: 'timber' });
        } else wallBand(full, { x0, x1, y0: 0, y1: H, openings, tones: upper.tones, pattern: upper.pattern, scale: upper.scale });
        // skirting board + wall cap (the dark beam on top, like the game's wall caps)
        railWithGaps(full, { x0: -len / 2, x1: len / 2, y: 0.0, openings, h: 0.12, d: 0.04, tones: 'timber', base: true });
        full.box(x1 - x0 + 0.04, 0.12, T + 0.06, { at: [(x0 + x1) / 2, H, -T / 2], tones: 'timber', pattern: 'none' });
        if (this.wallKind === 'timber') {
          // timber posts proud of the limewash every ~1.5 m (not across window / door holes)
          const n = Math.max(2, Math.round(len / 1.5));
          for (let i = 0; i <= n; i++) {
            const px = -len / 2 + 0.07 + (i * (len - 0.14)) / n;
            if (openings.some((q) => Math.abs(px - q.x) < q.w / 2 + 0.1)) continue;
            full.box(0.14, H - dado, 0.05, { at: [px, dado, 0.0], tones: 'timber', pattern: 'none' });
          }
        }
        // low (cut-away) variant: the wall cut at `low`, a dark section cap on top
        const lowOpen = openings.filter((q) => q.y < low);
        wallBand(lo, { x0, x1, y0: 0, y1: low, openings: lowOpen, tones: dado > 0 && low <= dado ? lower.tones : upper.tones, pattern: dado > 0 && low <= dado ? lower.pattern : upper.pattern, scale: lower.scale });
        railWithGaps(lo, { x0: -len / 2, x1: len / 2, y: 0.0, openings: lowOpen, h: 0.12, d: 0.04, tones: 'timber', base: true });
        capWithGaps(lo, { x0, x1, y: low, openings: lowOpen, thick: T });
      });
    }
    // --- windows (interior side): frame, mullions, deep sill, glowing panes, optional curtains
    for (const w of windows) this.wallFrame(w.wall, ({ full, glow }) => interiorWindow(full, glow, { ...w, T }));
    // --- doorway in the front wall: threshold + jamb posts (full) / jamb stubs (low)
    this.wallFrame('front', ({ full, low: lo }) => {
      const dw = this.doorW;
      for (const s of [-1, 1]) {
        full.box(0.14, H - 0.02, T + 0.08, { at: [s * (dw / 2 + 0.07), 0, -T / 2], tones: 'timber', pattern: 'none' });
        lo.box(0.14, low + 0.08, T + 0.08, { at: [s * (dw / 2 + 0.07), 0, -T / 2], tones: 'timber', pattern: 'none' });
      }
      full.box(dw + 0.28, 0.16, T + 0.08, { at: [0, 2.05, -T / 2], tones: 'timber', pattern: 'none' });
      full.box(dw, H - 2.21, T, { at: [0, 2.21, -T / 2], tones: upper.tones, pattern: upper.pattern, scale: upper.scale });
    });
    this.b.box(this.doorW + 0.1, 0.03, T + 0.1, { at: [0, 0, D / 2 + T / 2], tones: 'ashlar', pattern: 'none' });   // threshold stone
    // --- ceiling beam along the back wall top, joist ends poking out (reads as a ceiling without hiding the room)
    if (o.beams !== false) {
      this.wallFrame('back', ({ full }) => {
        full.box(W, 0.2, 0.2, { at: [0, H - 0.26, 0.1], tones: 'timber', pattern: 'none' });
        const n = Math.max(3, Math.round(W / 1.5));
        for (let i = 0; i <= n; i++) {
          const x = -W / 2 + 0.12 + (i * (W - 0.24)) / n;
          full.box(0.16, 0.18, 0.42, { at: [x, H - 0.1, 0.21], tones: 'timber', pattern: 'none', tint: i % 2 ? 0.96 : 1 });
        }
      });
    }
    // walls bound the walkable floor (the doorway gap is open)
    const t = 0.02;
    this.solid(-W / 2 - T, -D / 2 - T, W / 2 + T, -D / 2 + t, 'wall');
    this.solid(-W / 2 - T, -D / 2, -W / 2 + t, D / 2 + T, 'wall');
    this.solid(W / 2 - t, -D / 2, W / 2 + T, D / 2 + T, 'wall');
    this.solid(-W / 2, D / 2 - t, -this.doorW / 2, D / 2 + T, 'wall');
    this.solid(this.doorW / 2, D / 2 - t, W / 2, D / 2 + T, 'wall');
    this.windows = windows;
    return this;
  }
  _upperTones() {
    const p = this.pal;
    switch (this.wallKind) {
      case 'timber': return { tones: p.wash, pattern: 'plaster' };
      case 'stone': return { tones: 'stone', pattern: 'rubble', scale: 1.1 };
      case 'brick': return { tones: p.wash, pattern: 'plaster' };
      case 'planks': return { tones: p.paint, pattern: 'boards' };
      default: return { tones: p.paper, pattern: 'vboards', scale: 1.3 };     // plaster cottages: striped wallpaper
    }
  }
  _lowerTones() {
    const p = this.pal;
    switch (this.wallKind) {
      case 'brick': return { tones: 'brick', pattern: 'brick' };
      case 'timber': return { tones: p.paint, pattern: 'vboards', scale: 0.8 };
      default: return { tones: 'plank', pattern: 'vboards', scale: 0.8 };
    }
  }

  // ---- finish
  /** Emit meshes. Returns {group, walls: {name: {full: Group, low: Group}}, colliders, lights, spots, update(t)}. */
  finish() {
    const group = new THREE.Group(); group.name = `${this.id}-interior`;
    group.add(this.b.build({ name: `${this.id}-int` }));
    if (this.g.stats().tris) group.add(buildGlow(this.engine, this.g, `${this.id}-int-glow`));
    if (this.voidGroup) group.add(this.voidGroup);
    const walls = {};
    for (const name of WALL_NAMES) {
      const W = this.walls[name];
      const full = W.full.build({ name: `${this.id}-wall-${name}` });
      if (W.glow.stats().tris) full.add(buildGlow(this.engine, W.glow, `${this.id}-wall-${name}-glow`));
      const low = W.low.build({ name: `${this.id}-wall-${name}-low` });
      low.visible = false;
      group.add(full, low);
      walls[name] = { full, low };
    }
    return { group, walls, colliders: this.colliders, lights: this.lightList, spots: this.spots, updaters: this.updaters };
  }
}

const VOID_MATS = new WeakMap();
/** Flat dark material for the void around a room (no outline, no lighting). */
function voidMaterial(engine) {
  let m = VOID_MATS.get(engine);
  if (m) return m;
  // a toon material (uPassMode contract), flat shadow tone, no outline
  m = toonMaterial(engine, { color: TOWN_PALETTE.nightSky, outline: 'none', unlit: 'sh', ramp: { hi: [1, 1, 1], sh: [1, 1, 1] } });
  m.name = 'interior-void';
  VOID_MATS.set(engine, m);
  return m;
}

// ------------------------------------------------------------------------------------------------ wall helpers
/** A horizontal band of wall (y0..y1) on a wall frame with rectangular holes (wallWithOpenings clipped to the band). */
function wallBand(b, { x0, x1, y0, y1, openings, tones, pattern, scale = 1, thick = 0.3 }) {
  const xs = [...new Set([x0, x1, ...openings.flatMap((q) => [q.x - q.w / 2, q.x + q.w / 2]).filter((x) => x > x0 && x < x1)])].sort((a, c) => a - c);
  const o = { tones, pattern, scale };
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], c = xs[i + 1], mx = (a + c) / 2, w = c - a;
    if (w < 1e-4) continue;
    const holes = openings.filter((q) => mx > q.x - q.w / 2 && mx < q.x + q.w / 2).map((q) => [Math.max(y0, q.y), Math.min(y1, q.y + q.h)]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [h0, h1] of holes) { if (h0 - y > 1e-4) b.box(w, h0 - y, thick, { ...o, at: [mx, y, -thick / 2] }); y = Math.max(y, h1); }
    if (y1 - y > 1e-4) b.box(w, y1 - y, thick, { ...o, at: [mx, y, -thick / 2] });
  }
}
/** A rail (chair rail / skirting) along a wall face at height y, broken at openings that cross it. */
function railWithGaps(b, { x0, x1, y, openings, h = 0.07, d = 0.06, tones = 'timber', base = false }) {
  const cuts = openings.filter((q) => q.y <= y + h && q.y + q.h >= y).map((q) => [q.x - q.w / 2, q.x + q.w / 2]).sort((a, c) => a[0] - c[0]);
  let a = x0;
  const seg = (p, q) => { if (q - p > 0.02) b.box(q - p, h, d, { at: [(p + q) / 2, base ? y : y - h / 2, d / 2], tones, pattern: 'none' }); };
  for (const [c0, c1] of cuts) { seg(a, Math.min(c0, x1)); a = Math.max(a, c1); }
  seg(a, x1);
}
/** The dark section cap on top of a cut (low) wall. */
function capWithGaps(b, { x0, x1, y, openings, thick }) {
  const cuts = openings.map((q) => [q.x - q.w / 2, q.x + q.w / 2]).sort((a, c) => a[0] - c[0]);
  let a = x0;
  const seg = (p, q) => { if (q - p > 0.02) b.box(q - p, 0.07, thick + 0.04, { at: [(p + q) / 2, y, -thick / 2], tones: 'timber', pattern: 'none', tint: 0.92 }); };
  for (const [c0, c1] of cuts) { seg(a, Math.min(c0, x1)); a = Math.max(a, c1); }
  seg(a, x1);
}
/** Interior side of a window in a wall hole: deep sill, frame, mullions, glowing panes (kind 3), optional curtains + rod. */
function interiorWindow(full, glow, { x, y, w, h, T = 0.3, panes = [2, 3], curtains = null, arch = false, frame = 'timber' }) {
  const gz = -T * 0.55;                                       // glass plane inside the wall depth
  glow.box(w, h, 0.02, { at: [x, y, gz], tones: 'glass', layer: 'glass', glow: '#FFFFFF', glowKind: 3 });
  const fr = { tones: frame, pattern: 'none' };
  const bar = 0.06;
  full.box(w + 2 * bar, bar, 0.08, { ...fr, at: [x, y + h, gz] });
  full.box(w + 2 * bar, bar, 0.08, { ...fr, at: [x, y - bar, gz] });
  full.box(bar, h, 0.08, { ...fr, at: [x - w / 2 - bar / 2, y, gz] });
  full.box(bar, h, 0.08, { ...fr, at: [x + w / 2 + bar / 2, y, gz] });
  for (let i = 1; i < panes[0]; i++) full.box(0.04, h, 0.05, { ...fr, at: [x - w / 2 + (w * i) / panes[0], y, gz + 0.02] });
  for (let j = 1; j < panes[1]; j++) full.box(w, 0.04, 0.05, { ...fr, at: [x, y + (h * j) / panes[1] - 0.02, gz + 0.02] });
  // reveal (the wall depth around the hole, inside) + a deep sill board
  full.box(w + 0.16, 0.07, -gz + 0.14, { tones: 'plank', pattern: 'none', at: [x, y - 0.07, (gz + 0.14) / 2] });
  if (arch) full.prism([[-w / 2 - 0.06, 0], [w / 2 + 0.06, 0], [w / 4, w * 0.3], [-w / 4, w * 0.3]], 0.1, { ...fr, at: [x, y + h + 0.04, 0.0] });
  if (curtains) {
    const cw = 0.26;
    full.box(w + 0.8, 0.04, 0.04, { tones: 'iron', pattern: 'none', at: [x, y + h + 0.16, 0.12] });
    for (const s of [-1, 1]) {
      full.box(cw, h + 0.28, 0.06, { tones: curtains, pattern: 'vboards', scale: 0.35, at: [x + s * (w / 2 + cw / 2 + 0.04), y - 0.14, 0.1], layer: 'soft' });
      full.box(cw + 0.04, 0.06, 0.09, { tones: curtains, tint: 0.92, at: [x + s * (w / 2 + cw / 2 + 0.04), y + 0.4, 0.1], layer: 'soft' });   // tie-back
    }
  }
}

// ------------------------------------------------------------------------------------------------ placement helper
/** Run fn(b, g) in a frame at room-local (x, y, z) turned by ry, on the free-standing builders (or a wall's). */
function placed(room, { x = 0, y = 0, z = 0, ry = 0, wall = null }, fn) {
  if (wall) {
    let out;
    room.wallFrame(wall, ({ full, glow }) => {
      const m = M({ at: [x, y, 0] });
      full.push(m); glow.push(m);
      try { out = fn(full, glow); } finally { full.pop(); glow.pop(); }
    });
    return out;
  }
  const m = M({ at: [x, y, z], ry });
  room.b.push(m); room.g.push(m);
  try { return fn(room.b, room.g); } finally { room.b.pop(); room.g.pop(); }
}
/** Local point (in a placed() frame) -> room-local coordinates (for lights / spots). */
function localToRoom(room, { x = 0, y = 0, z = 0, ry = 0, wall = null }, p) {
  if (wall) { const q = room.wallPoint(wall, x + p[0], y + p[1], p[2]); return [q.x, q.y, q.z]; }
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c];
}

const WOOD = 'plank', DARK = 'timber';

// ------------------------------------------------------------------------------------------------ furniture
/** A flame (always glowing, flickering) as stacked tapered boxes. */
function flame(g, { at = [0, 0, 0], s = 1, color = GLOW.candle }) {
  const [x, y, z] = at;
  g.box(0.06 * s, 0.07 * s, 0.06 * s, { at: [x, y, z], tones: 'glass', layer: 'glass', glow: color, glowKind: 2 });
  g.box(0.035 * s, 0.06 * s, 0.035 * s, { at: [x, y + 0.07 * s, z], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
}
/** Candle on a brass dish; returns the local flame point. */
function candle(b, g, { at = [0, 0, 0], h = 0.16 }) {
  const [x, y, z] = at;
  b.cylinder(0.07, 0.07, 0.025, { at: [x, y, z], tones: 'brass', segments: 8 });
  b.box(0.05, h, 0.05, { at: [x, y + 0.025, z], tones: 'cream', pattern: 'none' });
  flame(g, { at: [x, y + 0.025 + h, z] });
  return [x, y + h + 0.1, z];
}

export const FURNITURE = {
  /** Bed: headboard at local -z (put it against a wall), {wide, quilt: CLOTH key | ramp, frame 'plank'|'timber', posts}. */
  bed(room, o = {}) {
    const wide = !!o.wide, BW = wide ? 1.55 : 1.05, BL = 2.0;
    const quilt = typeof o.quilt === 'string' ? CLOTH[o.quilt] : (o.quilt ?? CLOTH.red);
    const fr = o.frame ?? WOOD;
    placed(room, o, (b) => {
      const z0 = -BL / 2, z1 = BL / 2;
      for (const sx of [-1, 1]) {
        b.box(0.1, 1.05, 0.1, { at: [sx * (BW / 2 - 0.05), 0, z0 + 0.05], tones: fr, pattern: 'none' });         // head posts
        b.box(0.09, 0.62, 0.09, { at: [sx * (BW / 2 - 0.05), 0, z1 - 0.05], tones: fr, pattern: 'none' });       // foot posts
        b.cylinder(0.06, 0.03, 0.08, { at: [sx * (BW / 2 - 0.05), 1.05, z0 + 0.05], tones: 'brass', segments: 8 });
        b.box(0.06, 0.16, BL - 0.2, { at: [sx * (BW / 2 - 0.05), 0.2, 0], tones: fr, pattern: 'none' });       // side rails
      }
      b.box(BW - 0.16, 0.62, 0.06, { at: [0, 0.32, z0 + 0.05], tones: fr, pattern: 'vboards', scale: 0.7 });   // headboard
      b.box(BW - 0.16, 0.3, 0.06, { at: [0, 0.26, z1 - 0.05], tones: fr, pattern: 'vboards', scale: 0.7 });    // footboard
      b.box(BW - 0.12, 0.18, BL - 0.16, { at: [0, 0.3, 0], tones: 'cream', pattern: 'none', tint: 0.96 });     // mattress
      const np = wide ? 2 : 1, pw = (BW - 0.3) / np;
      for (let i = 0; i < np; i++) b.box(pw - 0.06, 0.13, 0.36, { at: [-BW / 2 + 0.15 + pw * (i + 0.5), 0.48, z0 + 0.32], tones: 'cream', layer: 'soft' });
      b.box(BW - 0.08, 0.05, 0.2, { at: [0, 0.48, z0 + 0.62], tones: 'cream', tint: 1.03, layer: 'soft' });     // folded sheet
      // patchwork quilt: 3 x 2 patches of the cloth ramp with tint steps, draping over the sides
      const qz0 = z0 + 0.72, qz1 = z1 - 0.1, cols = wide ? 3 : 2, rows = 3;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const pw2 = (BW + 0.02) / cols, pd = (qz1 - qz0) / rows;
        const tint = [1, 0.94, 1.05][(i * 2 + j) % 3];
        b.box(pw2, 0.07, pd, { at: [-(BW + 0.02) / 2 + pw2 * (i + 0.5), 0.47, qz0 + pd * (j + 0.5)], tones: quilt, tint, layer: 'soft' });
      }
      for (const sx of [-1, 1]) b.box(0.04, 0.24, qz1 - qz0, { at: [sx * (BW / 2 + 0.01), 0.3, (qz0 + qz1) / 2], tones: quilt, tint: 0.9, layer: 'soft' });
    });
    const rect = room.solidAt(o.x ?? 0, o.z ?? 0, BW, BL, o.ry ?? 0, 'bed');
    return { rect, top: 0.55, w: BW, l: BL };
  },

  nightstand(room, o = {}) {
    const lights = [];
    placed(room, o, (b, g) => {
      b.box(0.5, 0.06, 0.42, { at: [0, 0.6, 0], tones: WOOD, pattern: 'none', tint: 1.04 });
      b.box(0.44, 0.6, 0.38, { at: [0, 0, 0], tones: WOOD, pattern: 'none' });
      b.box(0.36, 0.18, 0.02, { at: [0, 0.36, 0.19], tones: WOOD, tint: 1.05 });
      b.box(0.05, 0.05, 0.04, { at: [0, 0.43, 0.21], tones: 'brass' });
      const f = candle(b, g, { at: [-0.1, 0.66, 0.02] });
      b.box(0.16, 0.05, 0.2, { at: [0.12, 0.66, 0.02], tones: BOOKS[0] });
      if (o.light !== false) lights.push(room.light({ pos: localToRoom(room, o, f), color: GLOW.candle, r: 1.8, kind: 'lantern', intensity: 1.1 }));
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.5, 0.42, o.ry ?? 0), top: 0.66, lights };
  },

  /** Table: {round, w 1.5, d 0.85, items true (candle, loaf, mug), extra(b, g, top)} */
  table(room, o = {}) {
    const round = !!o.round, w = o.w ?? (round ? 1.15 : 1.5), d = o.d ?? (round ? 1.15 : 0.85), top = 0.76;
    const lights = [];
    placed(room, o, (b, g) => {
      if (round) {
        b.cylinder(0.3, 0.3, 0.05, { at: [0, 0, 0], tones: DARK, segments: 8 });
        b.cylinder(0.07, 0.09, top - 0.06, { at: [0, 0.05, 0], tones: DARK, segments: 8 });
        b.cylinder(w / 2, w / 2, 0.07, { at: [0, top - 0.07, 0], tones: WOOD, pattern: 'planks', segments: 16 });
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, top - 0.07, 0.08, { at: [sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)], tones: DARK, pattern: 'none' });
        b.box(w - 0.12, 0.1, d - 0.12, { at: [0, top - 0.17, 0], tones: DARK, pattern: 'none' });             // apron
        b.box(w, 0.07, d, { at: [0, top - 0.07, 0], tones: WOOD, pattern: 'planks' });
      }
      if (o.items !== false) {
        const f = candle(b, g, { at: [0, top, 0] });
        b.box(0.24, 0.1, 0.14, { at: [-0.34, top, 0.08], tones: TOWN_PALETTE.thatch, layer: 'soft' });       // loaf
        b.cylinder(0.05, 0.05, 0.11, { at: [0.32, top, -0.05], tones: 'iron', segments: 8 });                   // mug
        if (o.light !== false) lights.push(room.light({ pos: localToRoom(room, o, f), color: GLOW.candle, r: 2.2, kind: 'lantern', intensity: 1.2 }));
      }
      o.extra?.(b, g, top);
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, w, d, o.ry ?? 0), top, lights };
  },

  /** Chair: local +z = the way you face when sitting (back at local -z). */
  chair(room, o = {}) {
    placed(room, o, (b) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.44, 0.06, { at: [sx * 0.17, 0, sz * 0.17], tones: DARK, pattern: 'none' });
      b.box(0.44, 0.06, 0.44, { at: [0, 0.44, 0], tones: WOOD, pattern: 'none', tint: 1.04 });
      for (const sx of [-1, 1]) b.box(0.06, 0.5, 0.06, { at: [sx * 0.17, 0.5, -0.19], tones: DARK, pattern: 'none' });
      b.box(0.42, 0.09, 0.06, { at: [0, 0.92, -0.19], tones: WOOD, pattern: 'none' });
      for (const sx of [-0.06, 0.06]) b.box(0.04, 0.38, 0.04, { at: [sx, 0.52, -0.19], tones: WOOD, pattern: 'none' });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.46, 0.46, o.ry ?? 0), top: 0.5 };
  },

  stool(room, o = {}) {
    placed(room, o, (b) => {
      for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) b.box(0.05, 0.42, 0.05, { at: [sx * 0.12, 0, sz * 0.12 - (sz > 0 ? 0 : 0)], tones: DARK, pattern: 'none' });
      b.cylinder(0.2, 0.2, 0.06, { at: [0, 0.42, 0], tones: WOOD, segments: 8 });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.36, 0.36, o.ry ?? 0), top: 0.48 };
  },

  wardrobe(room, o = {}) {
    const w = o.w ?? 1.2, h = 1.95, d = 0.55;
    placed(room, o, (b) => {
      b.box(w, h - 0.2, d, { at: [0, 0.1, 0], tones: WOOD, pattern: 'vboards', scale: 1.2 });
      b.box(w + 0.1, 0.12, d + 0.08, { at: [0, h - 0.1, 0], tones: DARK, pattern: 'none' });                 // cornice
      b.box(w + 0.04, 0.08, d + 0.04, { at: [0, 0.06, 0], tones: DARK, pattern: 'none' });
      for (const sx of [-1, 1]) b.box(0.1, 0.08, 0.1, { at: [sx * (w / 2 - 0.1), 0, d / 2 - 0.1], tones: DARK });
      for (const sx of [-1, 1]) for (const py of [0.3, 1.05]) b.box(w / 2 - 0.16, 0.6, 0.03, { at: [sx * w / 4, py, d / 2], tones: WOOD, tint: 1.06 });
      b.box(0.03, h - 0.4, 0.02, { at: [0, 0.2, d / 2 + 0.01], tones: DARK });
      for (const sx of [-1, 1]) b.box(0.05, 0.08, 0.04, { at: [sx * 0.07, 0.95, d / 2 + 0.02], tones: 'brass' });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, w, d, o.ry ?? 0), top: h };
  },

  /** Bookshelf: {w 1.2, h 1.95, shelves 4, ornaments: ['globe'|'candle'|'skull'|'jar'...], books true} */
  bookshelf(room, o = {}) {
    const w = o.w ?? 1.2, h = o.h ?? 1.95, d = 0.4, ns = o.shelves ?? 4;
    const r = rng(room.seed + Math.round((o.x ?? 0) * 100) + 31);
    placed(room, o, (b, g) => {
      for (const sx of [-1, 1]) b.box(0.07, h, d, { at: [sx * (w / 2 - 0.035), 0, 0], tones: WOOD, pattern: 'none' });
      b.box(w, 0.06, d, { at: [0, h - 0.06, 0], tones: DARK, pattern: 'none' });
      b.box(w - 0.14, h - 0.1, 0.03, { at: [0, 0.04, -d / 2 + 0.015], tones: DARK, pattern: 'vboards', tint: 0.85 });
      const orn = o.ornaments ?? ['globe'];
      for (let i = 0; i < ns; i++) {
        const y = 0.06 + (i * (h - 0.16)) / ns;
        b.box(w - 0.14, 0.04, d - 0.04, { at: [0, y, 0], tones: WOOD, pattern: 'none', tint: 1.04 });
        if (o.books === false) continue;
        let x = -w / 2 + 0.1;
        const xe = w / 2 - 0.1, maxH = (h - 0.16) / ns - 0.1;
        const ornX = i === 1 && orn[0] ? -w / 2 + 0.1 + (w - 0.2) * 0.62 : i === 2 && orn[1] ? -w / 2 + 0.16 : 99;
        while (x < xe - 0.05) {
          if (x >= ornX && x < ornX + 0.24) { ornament(b, g, orn[i === 1 ? 0 : 1], [x + 0.11, y + 0.04, 0.02]); x += 0.26; continue; }
          const bw = 0.05 + Math.floor(r() * 3) * 0.02, bh = Math.min(maxH, 0.2 + r() * 0.12);
          if (x + bw > xe) break;
          const lean = r() < 0.1;
          b.box(bw, bh, d - 0.1, { at: [x + bw / 2, y + 0.04, 0.02], tones: BOOKS[Math.floor(r() * BOOKS.length)], pattern: 'none', rz: lean ? 0.25 : 0, tint: r() < 0.3 ? 1.06 : 1 });
          x += bw + (r() < 0.15 ? 0.03 : 0.004) + (lean ? 0.06 : 0);
        }
      }
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, w, d, o.ry ?? 0), top: h };
  },

  chest(room, o = {}) {
    const w = 0.75, d = 0.45, h = 0.4;
    placed(room, o, (b) => {
      b.box(w, h, d, { at: [0, 0, 0], tones: WOOD, pattern: 'boards', scale: 0.7 });
      b.prism([[-d / 2, 0], [d / 2, 0], [d / 2 - 0.06, 0.12], [-d / 2 + 0.06, 0.12]], w, { at: [0, h, 0], ry: Math.PI / 2, tones: WOOD, tint: 1.05 });
      for (const sx of [-1, 1]) b.box(0.05, h + 0.13, d + 0.02, { at: [sx * (w / 2 - 0.12), 0, 0], tones: 'iron' });
      b.box(0.1, 0.12, 0.03, { at: [0, h - 0.1, d / 2 + 0.01], tones: 'brass' });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, w, d, o.ry ?? 0), top: h + 0.13 };
  },

  barrel(room, o = {}) {
    placed(room, o, (b) => {
      b.cylinder(0.27, 0.31, 0.42, { at: [0, 0, 0], tones: WOOD, pattern: 'vboards', scale: 0.5, segments: 8 });
      b.cylinder(0.31, 0.27, 0.42, { at: [0, 0.42, 0], tones: WOOD, pattern: 'vboards', scale: 0.5, segments: 8 });
      for (const y of [0.12, 0.42, 0.72]) b.cylinder(0.32, 0.32, 0.04, { at: [0, y, 0], tones: 'iron', segments: 8 });
      b.cylinder(0.25, 0.25, 0.02, { at: [0, 0.84, 0], tones: DARK, segments: 8 });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.62, 0.62), top: 0.86 };
  },

  plant(room, o = {}) {
    const r = rng(room.seed + 77 + Math.round((o.x ?? 0) * 10));
    placed(room, o, (b) => {
      b.cylinder(0.17, 0.22, 0.32, { at: [0, 0, 0], tones: 'brick', segments: 8 });
      b.cylinder(0.24, 0.24, 0.05, { at: [0, 0.3, 0], tones: 'brick', tint: 1.05, segments: 8 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + r() * 0.4, rr = 0.06 + r() * 0.16, hh = 0.42 + r() * 0.42;
        b.box(0.16, 0.12, 0.16, { at: [Math.cos(a) * rr, hh, Math.sin(a) * rr], tones: 'leaf', layer: 'soft', ry: a, tint: [0.95, 1, 1.05][i % 3] });
      }
      b.box(0.05, 0.5, 0.05, { at: [0, 0.32, 0], tones: 'leaf', layer: 'soft', tint: 0.9 });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.44, 0.44), top: 0.9 };
  },

  /** Flat rug: {w 2.4, d 1.6, tones CLOTH key | ramp, border ramp, oval false, pattern 'diamond'|'stripes'|'stars'} */
  rug(room, o = {}) {
    const w = o.w ?? 2.4, d = o.d ?? 1.6;
    const field = typeof o.tones === 'string' ? CLOTH[o.tones] : (o.tones ?? CLOTH.red);
    const border = typeof o.border === 'string' ? CLOTH[o.border] : (o.border ?? CLOTH.gold);
    placed(room, { ...o, y: 0.002 }, (b, g) => {
      if (o.oval) {
        b.push(M({ s: [w / 2, 1, d / 2] }));
        b.cylinder(1, 1, 0.02, { at: [0, 0, 0], tones: border, segments: 16, layer: 'soft' });
        b.cylinder(0.86, 0.86, 0.025, { at: [0, 0, 0], tones: field, segments: 16, layer: 'soft' });
        b.cylinder(0.5, 0.5, 0.03, { at: [0, 0, 0], tones: border, segments: 16, layer: 'soft', tint: 0.95 });
        b.cylinder(0.4, 0.4, 0.035, { at: [0, 0, 0], tones: field, segments: 16, layer: 'soft', tint: 1.05 });
        b.pop();
      } else {
        b.box(w, 0.02, d, { at: [0, 0, 0], tones: border, layer: 'soft' });
        b.box(w - 0.24, 0.025, d - 0.24, { at: [0, 0, 0], tones: field, layer: 'soft' });
        if ((o.pattern ?? 'diamond') === 'diamond') {
          b.box(w * 0.32, 0.03, w * 0.32, { at: [0, 0, 0], ry: Math.PI / 4, tones: border, layer: 'soft', tint: 0.95 });
          b.box(w * 0.2, 0.035, w * 0.2, { at: [0, 0, 0], ry: Math.PI / 4, tones: field, layer: 'soft', tint: 1.06 });
        } else if (o.pattern === 'stripes') {
          for (let i = -2; i <= 2; i++) b.box(0.08, 0.03, d - 0.3, { at: [i * (w - 0.4) / 5, 0, 0], tones: border, layer: 'soft', tint: 0.95 });
        }
        for (let i = 0; i < 9; i++) for (const s of [-1, 1]) b.box(0.03, 0.02, 0.08, { at: [-w / 2 + 0.2 + (i * (w - 0.4)) / 8, 0, s * (d / 2 + 0.04)], tones: 'cream', layer: 'soft' });   // fringe
      }
    });
    return { rect: null, top: 0.03 };
  },

  doormat(room, o = {}) {
    placed(room, { ...o, y: 0.002 }, (b) => {
      b.box(1.0, 0.02, 0.55, { at: [0, 0, 0], tones: 'thatch', pattern: 'thatch', scale: 0.4, layer: 'soft' });
      b.box(0.86, 0.025, 0.08, { at: [0, 0, 0.12], tones: CLOTH.red, layer: 'soft' });
    });
    return { rect: null };
  },

  /** Hanging lantern from the ceiling beam / a joist: {x, z, y 2.3 (lantern bottom)} */
  hangingLantern(room, o = {}) {
    const y = o.y ?? 2.15;
    let lp;
    placed(room, { ...o, y: 0 }, (b, g) => {
      b.box(0.02, room.H - y - 0.3, 0.02, { at: [0, y + 0.3, 0], tones: 'iron' });
      b.box(0.22, 0.04, 0.22, { at: [0, y, 0], tones: 'iron' });
      b.hexa([V3(-0.12, y + 0.24, -0.12), V3(0.12, y + 0.24, -0.12), V3(-0.03, y + 0.34, -0.03), V3(0.03, y + 0.34, -0.03),
        V3(-0.12, y + 0.24, 0.12), V3(0.12, y + 0.24, 0.12), V3(-0.03, y + 0.34, 0.03), V3(0.03, y + 0.34, 0.03)], { tones: 'iron' });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.025, 0.2, 0.025, { at: [sx * 0.09, y + 0.04, sz * 0.09], tones: 'iron' });
      g.box(0.15, 0.17, 0.15, { at: [0, y + 0.05, 0], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
      lp = localToRoom(room, { ...o, y: 0 }, [0, y - 0.1, 0]);
    });
    room.light({ pos: lp, color: GLOW.candle, r: o.r ?? 3.2, kind: 'lantern', intensity: o.intensity ?? 1.3 });
    return { rect: null };
  },

  /** Floor-standing candelabra (3 candles). */
  candelabra(room, o = {}) {
    let lp;
    placed(room, o, (b, g) => {
      b.cylinder(0.16, 0.12, 0.05, { at: [0, 0, 0], tones: 'brass', segments: 8 });
      b.cylinder(0.025, 0.025, 1.2, { at: [0, 0.05, 0], tones: 'brass', segments: 8 });
      b.box(0.5, 0.04, 0.04, { at: [0, 1.2, 0], tones: 'brass' });
      for (const sx of [-0.22, 0, 0.22]) candle(b, g, { at: [sx, sx === 0 ? 1.28 : 1.22, 0], h: 0.12 });
      lp = localToRoom(room, o, [0, 1.4, 0]);
    });
    room.light({ pos: lp, color: GLOW.candle, r: 2.8, kind: 'lantern', intensity: 1.2 });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.34, 0.34) };
  },

  /** Brass telescope on a wooden tripod, tube pitched up toward local -z (aim it at a window): {pitch 0.55, len 1.3} */
  telescope(room, o = {}) {
    const pitch = o.pitch ?? 0.55, len = o.len ?? 1.3;
    placed(room, o, (b) => {
      const top = 1.15;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6, fx = Math.cos(a) * 0.38, fz = Math.sin(a) * 0.38;
        const lenL = Math.hypot(fx, top, fz);
        // a leg from the foot (fx, 0, fz) to the head (0, top, 0)
        b.push(M({ at: [fx / 2, top / 2, fz / 2], ry: Math.atan2(-fx, -fz), rx: Math.atan2(Math.hypot(fx, fz), top) }));
        b.box(0.05, lenL, 0.05, { at: [0, -lenL / 2, 0], tones: DARK, pattern: 'none' });
        b.pop();
      }
      b.cylinder(0.07, 0.07, 0.1, { at: [0, top - 0.05, 0], tones: 'brass', segments: 8 });
      // the tube: along local -z, pitched up
      b.push(M({ at: [0, top + 0.06, 0], rx: pitch }));
      b.push(M({ rx: -Math.PI / 2 }));                         // cylinder axis y -> -z
      b.cylinder(0.035, 0.035, len * 0.16, { at: [0, -len * 0.36, 0], tones: 'brass', segments: 8, tint: 0.95 });   // drawtube + eyepiece
      b.cylinder(0.06, 0.07, len * 0.68, { at: [0, -len * 0.2, 0], tones: 'brass', segments: 8 });                   // main tube
      b.cylinder(0.088, 0.088, len * 0.24, { at: [0, len * 0.48, 0], tones: 'brass', segments: 8, tint: 1.04 });     // dew shield
      for (const t of [-0.12, 0.2]) b.cylinder(0.078, 0.078, 0.05, { at: [0, len * t, 0], tones: DARK, segments: 8 });
      b.pop(); b.pop();
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.7, 0.7) };
  },

  /** A globe / orrery on a stand (table top or floor): {y, r 0.16, kind 'globe'|'orrery'} */
  globe(room, o = {}) {
    placed(room, o, (b, g) => ornament(b, g, o.kind ?? 'globe', [0, 0, 0], o.r ?? 0.16));
    return { rect: o.y ? null : room.solidAt(o.x ?? 0, o.z ?? 0, 0.4, 0.4) };
  },

  /** Loom (the weaver's): a frame with warp threads and a half-woven cloth. */
  loom(room, o = {}) {
    const cloth = typeof o.cloth === 'string' ? CLOTH[o.cloth] : (o.cloth ?? CLOTH.blue);
    placed(room, o, (b) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, sz < 0 ? 1.7 : 0.95, 0.08, { at: [sx * 0.6, 0, sz * 0.32], tones: WOOD, pattern: 'none' });
      for (const y of [0.55, 0.95]) b.box(1.28, 0.07, 0.08, { at: [0, y, 0.32], tones: WOOD, pattern: 'none' });
      b.box(1.28, 0.08, 0.08, { at: [0, 1.62, -0.32], tones: WOOD, pattern: 'none' });
      for (const sx of [-1, 1]) b.box(0.06, 0.06, 0.7, { at: [sx * 0.6, 0.95, 0], tones: WOOD, pattern: 'none' });
      b.box(1.1, 0.03, 0.4, { at: [0, 0.97, 0.12], tones: cloth, pattern: 'vboards', scale: 0.25, layer: 'soft' });
      b.hexa([V3(-0.55, 1.0, -0.08), V3(0.55, 1.0, -0.08), V3(-0.55, 1.6, -0.3), V3(0.55, 1.6, -0.3),
        V3(-0.55, 1.0, -0.06), V3(0.55, 1.0, -0.06), V3(-0.55, 1.6, -0.28), V3(0.55, 1.6, -0.28)], { tones: 'cream', pattern: 'vboards', scale: 0.12, layer: 'soft' });
      b.box(0.8, 0.06, 0.1, { at: [0.1, 0.5, 0.5], tones: DARK, pattern: 'none' });   // bench
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 1.36, 0.9, o.ry ?? 0) };
  },

  /** Workbench (cobbler / clockmaker / lantern-maker): a heavy table with tools and a vice. */
  workbench(room, o = {}) {
    const w = o.w ?? 1.6, d = 0.7, top = 0.86;
    placed(room, o, (b, g) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, top - 0.1, 0.1, { at: [sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)], tones: DARK, pattern: 'none' });
      b.box(w - 0.1, 0.06, d - 0.1, { at: [0, 0.2, 0], tones: WOOD, pattern: 'boards' });
      b.box(w, 0.1, d, { at: [0, top - 0.1, 0], tones: WOOD, pattern: 'planks', tint: 0.96 });
      b.box(0.16, 0.14, 0.2, { at: [w / 2 - 0.2, top, d / 2 - 0.12], tones: 'iron' });
      b.box(0.3, 0.03, 0.04, { at: [-0.3, top, 0.1], tones: 'iron', ry: 0.4 });
      b.box(0.06, 0.06, 0.24, { at: [-0.1, top, -0.05], tones: DARK });
      o.extra?.(b, g, top);
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, w, d, o.ry ?? 0), top };
  },

  /** Cauldron on three feet (with a faint ember glow under it). */
  cauldron(room, o = {}) {
    placed(room, o, (b, g) => {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.box(0.05, 0.14, 0.05, { at: [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], tones: 'iron' }); }
      b.cylinder(0.22, 0.33, 0.2, { at: [0, 0.1, 0], tones: 'iron', segments: 8 });
      b.cylinder(0.33, 0.3, 0.24, { at: [0, 0.3, 0], tones: 'iron', segments: 8 });
      b.cylinder(0.3, 0.3, 0.03, { at: [0, 0.5, 0], tones: CLOTH.green, segments: 8 });
      g.box(0.18, 0.04, 0.18, { at: [0, 0.03, 0], tones: 'glass', layer: 'glass', glow: GLOW.ember, glowKind: 2 });
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.7, 0.7) };
  },

  /** Sacks (flour / wool) heap. */
  sacks(room, o = {}) {
    const n = o.n ?? 3;
    placed(room, o, (b) => {
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.36, y = 0;
        b.box(0.34, 0.42, 0.3, { at: [x, y, (i % 2) * 0.08], tones: 'thatch', layer: 'soft', tint: [1, 0.95, 1.04][i % 3] });
        b.box(0.12, 0.08, 0.1, { at: [x, 0.42, (i % 2) * 0.08], tones: 'thatch', layer: 'soft', tint: 0.9 });
      }
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, n * 0.36 + 0.1, 0.5, o.ry ?? 0) };
  },

  /** Woodpile / log basket by a hearth. */
  logs(room, o = {}) {
    placed(room, o, (b) => {
      for (let i = 0; i < 6; i++) {
        const row = i < 3 ? 0 : 1, k = i < 3 ? i : i - 3;
        cyl(b, 0.08, 0.08, 0.5, { at: [(k - (row ? 0.5 : 1)) * 0.17, 0.08 + row * 0.15, -0.25], tones: 'trunk', segments: 8, rx: Math.PI / 2 });
      }
    });
    return { rect: room.solidAt(o.x ?? 0, o.z ?? 0, 0.6, 0.55) };
  },
};

/** Small things that sit on shelves / tables: globe, orrery, candle, jar, bottle, skull, book, clock, potion. */
function ornament(b, g, kind, at, s = 0.1) {
  const [x, y, z] = at;
  switch (kind) {
    case 'globe': {
      b.cylinder(0.07, 0.05, 0.03, { at: [x, y, z], tones: 'brass', segments: 8 });
      b.box(0.02, 0.06, 0.02, { at: [x, y + 0.03, z], tones: 'brass' });
      const r = s;
      b.cylinder(r * 0.7, r, r * 0.6, { at: [x, y + 0.09, z], tones: CLOTH.blue, segments: 8 });
      b.cylinder(r, r * 0.7, r * 0.6, { at: [x, y + 0.09 + r * 0.6, z], tones: CLOTH.green, segments: 8 });
      b.box(r * 2.2, 0.02, 0.02, { at: [x, y + 0.09 + r * 0.6, z], tones: 'brass', rz: 0.4 });
      break;
    }
    case 'orrery': {
      b.cylinder(0.08, 0.06, 0.04, { at: [x, y, z], tones: 'brass', segments: 8 });
      b.box(0.02, s * 1.6, 0.02, { at: [x, y + 0.04, z], tones: 'brass' });
      g.box(0.07, 0.07, 0.07, { at: [x, y + s * 1.6, z], tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1 });
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1, rr = s * (0.8 + i * 0.5);
        b.box(rr * 2, 0.015, 0.015, { at: [x, y + s * 1.6 + 0.03, z], ry: a, tones: 'brass' });
        b.box(0.04, 0.04, 0.04, { at: [x + Math.cos(a) * rr, y + s * 1.6 + 0.02, z - Math.sin(a) * rr], tones: [CLOTH.blue, CLOTH.red, 'cream'][i] });
      }
      break;
    }
    case 'candle': candle(b, g, { at: [x, y, z], h: 0.12 }); break;
    case 'jar': b.cylinder(0.06, 0.06, 0.14, { at: [x, y, z], tones: 'glass', segments: 8 }); b.box(0.13, 0.03, 0.13, { at: [x, y + 0.14, z], tones: 'plank' }); break;
    case 'skull': b.box(0.12, 0.1, 0.12, { at: [x, y, z], tones: 'cream' }); b.box(0.09, 0.04, 0.06, { at: [x, y, z + 0.05], tones: 'cream', tint: 0.95 }); break;
    case 'clock': b.box(0.16, 0.22, 0.1, { at: [x, y, z], tones: 'timber' }); cyl(b, 0.06, 0.06, 0.02, { at: [x, y + 0.13, z + 0.05], tones: 'cream', segments: 8, rx: Math.PI / 2 }); break;
    default: {                                                // 'potion' | 'potion:N' (POTIONS hue N)
      const n = Number(String(kind).split(':')[1] ?? 0) || 0;
      b.cylinder(0.055, 0.04, 0.13, { at: [x, y, z], tones: POTIONS[n % POTIONS.length], segments: 8 });
      b.box(0.03, 0.05, 0.03, { at: [x, y + 0.13, z], tones: POTIONS[n % POTIONS.length], tint: 0.9 });
      b.box(0.04, 0.03, 0.04, { at: [x, y + 0.18, z], tones: 'plank' });
    }
  }
}
export { ornament };

// ------------------------------------------------------------------------------------------------ wall pieces
/**
 * Pieces hung on / built against a wall: {wall 'back'|'left'|'right', x (along the wall, left -> right seen from inside),
 * y (height of the piece's bottom)}. They hide with their wall in the cut-away (Room.setYaw).
 */
export const WALL = {
  /** Stone fireplace + chimney breast, mantel, logs, flickering fire, hearth slab; registers the fire light + collider. */
  fireplace(room, o = {}) {
    const w = o.w ?? 1.7, depth = 0.55, H = room.H;
    const stone = o.tones ?? 'stone';
    const lp = room.wallPoint(o.wall ?? 'back', o.x ?? 0, 0.55, 0.45);
    placed(room, { ...o, wall: o.wall ?? 'back' }, (b, g) => {
      // surround (two jambs + lintel arch) and the breast up to the ceiling
      for (const s of [-1, 1]) b.box(0.42, 1.2, depth, { at: [s * (w / 2 - 0.21), 0, depth / 2], tones: stone, pattern: 'ashlar', scale: 0.7 });
      b.box(w, 0.28, depth, { at: [0, 1.0, depth / 2], tones: stone, pattern: 'ashlar', scale: 0.7, tint: 1.03 });
      b.box(0.22, 0.24, 0.06, { at: [0, 1.0, depth + 0.02], tones: 'ashlar' });                                 // keystone
      b.box(w + 0.24, 0.1, depth + 0.16, { at: [0, 1.28, depth / 2 + 0.06], tones: DARK, pattern: 'none' });    // mantel
      b.box(w - 0.3, H - 1.38, depth - 0.12, { at: [0, 1.38, (depth - 0.12) / 2], tones: stone, pattern: 'ashlar', scale: 0.7, tint: 0.97 });
      // firebox: soot-dark back + floor
      b.box(w - 0.84, 1.0, 0.06, { at: [0, 0, 0.04], tones: 'crow' });
      b.box(w - 0.84, 0.04, depth - 0.06, { at: [0, 0, depth / 2], tones: 'crow' });
      // hearth slab
      b.box(w + 0.5, 0.06, 0.62, { at: [0, 0, depth + 0.3], tones: 'ashlar', pattern: 'ashlar', scale: 0.8 });
      // andirons + logs
      for (const s of [-1, 1]) b.box(0.04, 0.22, 0.3, { at: [s * 0.24, 0, depth * 0.5], tones: 'iron' });
      b.box(0.62, 0.11, 0.12, { at: [0, 0.06, depth * 0.45], tones: 'trunk', rz: 0.08 });
      b.box(0.56, 0.1, 0.11, { at: [0, 0.15, depth * 0.55], tones: 'trunk', rz: -0.12 });
      // fire: embers + tongues (always glowing, flicker)
      g.box(0.6, 0.04, 0.3, { at: [0, 0.04, depth * 0.5], tones: 'glass', layer: 'glass', glow: GLOW.ember, glowKind: 2 });
      for (const [fx, fh, c] of [[-0.14, 0.32, GLOW.fire], [0.02, 0.44, GLOW.fire], [0.16, 0.28, GLOW.fire], [-0.05, 0.22, GLOW.flame], [0.08, 0.26, GLOW.flame]]) {
        g.box(0.11, fh, 0.1, { at: [fx, 0.16, depth * 0.5 + (c === GLOW.flame ? 0.06 : 0)], tones: 'glass', layer: 'glass', glow: c, glowKind: 2 });
      }
      // things on the mantel
      for (const s of [-1, 1]) candle(b, g, { at: [s * (w / 2 - 0.12), 1.38, depth / 2 + 0.08], h: 0.14 });
      (o.mantel ?? ['clock', 'jar']).forEach((k, i) => ornament(b, g, k, [(i ? 0.35 : -0.3), 1.38, depth / 2 + 0.06]));
    });
    room.light({ pos: [lp.x, lp.y, lp.z], color: GLOW.fire, r: o.r ?? 4.6, kind: 'fire', intensity: 1.6 });
    const p0 = room.wallPoint(o.wall ?? 'back', (o.x ?? 0) - w / 2 - 0.25, 0, 0), p1 = room.wallPoint(o.wall ?? 'back', (o.x ?? 0) + w / 2 + 0.25, 0, depth + 0.6);
    room.solid(p0.x, p0.z, p1.x, p1.z, 'fireplace');
    return { light: lp };
  },

  /** A plank shelf on brackets with jars / bottles / books: {items: ['jar', 'potion' ...], w 1.1, y 1.45} */
  shelf(room, o = {}) {
    const w = o.w ?? 1.1;
    placed(room, { ...o, y: o.y ?? 1.45 }, (b, g) => {
      b.box(w, 0.05, 0.26, { at: [0, 0, 0.13], tones: WOOD, pattern: 'none', tint: 1.04 });
      for (const s of [-1, 1]) b.box(0.05, 0.2, 0.2, { at: [s * (w / 2 - 0.12), -0.2, 0.1], tones: DARK });
      const items = o.items ?? ['jar', 'potion', 'jar', 'book'];
      items.forEach((k, i) => {
        const x = -w / 2 + 0.12 + (i * (w - 0.24)) / Math.max(1, items.length - 1);
        if (k === 'book') b.box(0.16, 0.2, 0.18, { at: [x, 0.05, 0.12], tones: BOOKS[i % BOOKS.length] });
        else if (k === 'potion') ornament(b, g, `potion:${i}`, [x, 0.05, 0.12]);
        else ornament(b, g, k, [x, 0.05, 0.12]);
      });
    });
    return {};
  },

  /** Framed picture / chart: {w 0.6, h 0.45, y 1.5, kind 'picture'|'starchart'|'map'|'mirror', tones} */
  frame(room, o = {}) {
    const w = o.w ?? 0.6, h = o.h ?? 0.45, kind = o.kind ?? 'picture';
    const r = rng(room.seed + 911 + Math.round((o.x ?? 0) * 13));
    placed(room, { ...o, y: o.y ?? 1.45 }, (b, g) => {
      const fr = kind === 'starchart' ? 'brass' : DARK;
      b.box(w + 0.1, h + 0.1, 0.04, { at: [0, -0.05, 0.02], tones: fr, pattern: 'none' });
      if (kind === 'starchart') {
        b.box(w, h, 0.02, { at: [0, 0, 0.045], tones: CLOTH.night });
        for (let i = 0; i < 9; i++) g.box(0.03, 0.03, 0.01, { at: [(r() - 0.5) * (w - 0.08), 0.04 + r() * (h - 0.1), 0.06], tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[0], glowKind: 1 });
        cyl(b, h * 0.22, h * 0.22, 0.012, { at: [w * 0.24, h * 0.62, 0.05], tones: 'cream', segments: 16, rx: Math.PI / 2 });
      } else if (kind === 'map') {
        b.box(w, h, 0.02, { at: [0, 0, 0.045], tones: TOWN_PALETTE.thatch });
        b.box(w * 0.5, 0.02, 0.01, { at: [-0.05, h * 0.5, 0.06], tones: CLOTH.blue, rz: 0.3 });
      } else if (kind === 'mirror') {
        b.box(w, h, 0.02, { at: [0, 0, 0.045], tones: 'glass' });
      } else {
        b.box(w, h, 0.02, { at: [0, 0, 0.045], tones: o.tones ?? CLOTH.green });
        b.box(w * 0.6, h * 0.35, 0.01, { at: [0, 0.04, 0.06], tones: 'leaf' });
        cyl(b, h * 0.12, h * 0.12, 0.012, { at: [w * 0.25, h * 0.66, 0.055], tones: 'cream', segments: 8, rx: Math.PI / 2 });
      }
    });
    return {};
  },

  /** Wall clock (round face, brass rim, hands; a pendulum box under it): {y 1.7, r 0.24, pendulum true} */
  clock(room, o = {}) {
    const r = o.r ?? 0.24;
    placed(room, { ...o, y: o.y ?? 1.7 }, (b) => {
      b.push(M({ rx: Math.PI / 2 }));
      b.cylinder(r + 0.04, r + 0.04, 0.06, { at: [0, 0, 0], tones: 'brass', segments: 16 });       // rx pi/2: local y = out of the wall
      b.cylinder(r, r, 0.03, { at: [0, 0.06, 0], tones: 'cream', segments: 16 });
      b.pop();
      b.box(0.03, r * 0.7, 0.02, { at: [0, 0, 0.1], tones: 'iron' });
      b.box(r * 0.5, 0.03, 0.02, { at: [r * 0.25, 0, 0.1], tones: 'iron' });
      if (o.pendulum !== false) {
        b.box(0.24, 0.6, 0.12, { at: [0, -0.9, 0.06], tones: DARK, pattern: 'vboards', scale: 0.5 });
        cyl(b, 0.06, 0.06, 0.02, { at: [0, -0.75, 0.12], tones: 'brass', segments: 8, rx: Math.PI / 2 });
      }
    });
    return {};
  },

  /** A cluster of gears on the wall (clockworks / mill). */
  gears(room, o = {}) {
    placed(room, { ...o, y: o.y ?? 1.3 }, (b) => {
      const list = o.list ?? [[0, 0, 0.32], [0.44, 0.3, 0.2], [-0.38, 0.32, 0.16], [0.3, -0.3, 0.13]];
      list.forEach(([gx, gy, r], i) => {
        b.push(M({ at: [gx, gy, 0.05 + i * 0.012], rx: Math.PI / 2 }));
        b.cylinder(r, r, 0.04, { at: [0, 0, 0], tones: i % 2 ? 'brass' : 'copper', segments: 16 });
        b.cylinder(r * 0.3, r * 0.3, 0.06, { at: [0, -0.01, 0], tones: 'iron', segments: 8 });
        const nt = Math.max(8, Math.round(r * 40));
        for (let k = 0; k < nt; k++) { const a = (k / nt) * Math.PI * 2; b.box(0.05, 0.04, 0.05, { at: [Math.cos(a) * (r + 0.02), 0, Math.sin(a) * (r + 0.02)], ry: -a, tones: i % 2 ? 'brass' : 'copper' }); }
        b.pop();
      });
    });
    return {};
  },

  /** Crossed oars (boathouse) / tools: {kind 'oars'|'tools'} */
  oars(room, o = {}) {
    placed(room, { ...o, y: o.y ?? 0.5 }, (b) => {
      for (const s of [-1, 1]) {
        b.push(M({ at: [0, 0.9, 0.06], rz: s * 0.35 }));
        b.box(0.06, 1.9, 0.05, { at: [0, -0.95, 0], tones: WOOD, pattern: 'none' });
        b.box(0.2, 0.5, 0.04, { at: [0, 0.75, 0], tones: CLOTH.red, tint: 0.95 });
        b.pop();
      }
    });
    return {};
  },

  /** A fishing net draped on the wall with cork floats. */
  net(room, o = {}) {
    const w = o.w ?? 1.4, h = o.h ?? 1.0;
    placed(room, { ...o, y: o.y ?? 0.9 }, (b) => {
      for (let i = 0; i <= 6; i++) b.box(0.02, h, 0.02, { at: [-w / 2 + (i * w) / 6, 0, 0.04], tones: 'cream', layer: 'soft', tint: 0.9 });
      for (let j = 0; j <= 4; j++) b.box(w, 0.02, 0.02, { at: [0, (j * h) / 4, 0.04], tones: 'cream', layer: 'soft', tint: 0.9 });
      for (let i = 0; i < 4; i++) b.box(0.09, 0.09, 0.07, { at: [-w / 2 + 0.2 + i * (w - 0.4) / 3, h - 0.05, 0.07], tones: TOWN_PALETTE.pumpkin });
    });
    return {};
  },

  /** Hanging herb bundles from a peg rail. */
  herbs(room, o = {}) {
    const n = o.n ?? 4, w = o.w ?? 1.0;
    placed(room, { ...o, y: o.y ?? 2.0 }, (b) => {
      b.box(w, 0.05, 0.06, { at: [0, 0, 0.03], tones: DARK });
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.12 + (i * (w - 0.24)) / Math.max(1, n - 1);
        b.box(0.02, 0.1, 0.02, { at: [x, -0.1, 0.06], tones: TOWN_PALETTE.thatch });
        b.box(0.12, 0.26, 0.1, { at: [x, -0.36, 0.08], tones: i % 2 ? 'leaf' : 'mossTuft', layer: 'soft' });
      }
    });
    return {};
  },

  /** Lantern on a wall bracket (always lit inside). */
  sconce(room, o = {}) {
    const y = o.y ?? 1.75;
    const lp = room.wallPoint(o.wall ?? 'back', o.x ?? 0, y - 0.1, 0.3);
    placed(room, { ...o, y }, (b, g) => {
      b.box(0.05, 0.05, 0.26, { at: [0, 0.12, 0.13], tones: 'iron' });
      b.box(0.18, 0.04, 0.18, { at: [0, -0.16, 0.24], tones: 'iron' });
      g.box(0.13, 0.17, 0.13, { at: [0, -0.12, 0.24], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
      b.box(0.2, 0.05, 0.2, { at: [0, 0.06, 0.24], tones: 'iron' });
    });
    room.light({ pos: [lp.x, lp.y, lp.z], color: GLOW.candle, r: o.r ?? 2.6, kind: 'lantern', intensity: 1.2 });
    return {};
  },

  /** Ladder against a wall up to the ceiling (to a loft / the tower above). */
  ladder(room, o = {}) {
    placed(room, { ...o, y: 0 }, (b) => {
      const H = room.H, lean = 0.3;
      for (const s of [-1, 1]) b.hexa([V3(s * 0.25 - 0.03, 0, lean), V3(s * 0.25 + 0.03, 0, lean), V3(s * 0.25 - 0.03, H, 0.04), V3(s * 0.25 + 0.03, H, 0.04),
        V3(s * 0.25 - 0.03, 0, lean + 0.06), V3(s * 0.25 + 0.03, 0, lean + 0.06), V3(s * 0.25 - 0.03, H, 0.1), V3(s * 0.25 + 0.03, H, 0.1)], { tones: WOOD });
      for (let i = 1; i < 8; i++) { const y = (i * H) / 8; b.box(0.5, 0.04, 0.04, { at: [0, y, lean - (lean - 0.04) * (y / H) + 0.03], tones: WOOD, tint: 0.96 }); }
    });
    return {};
  },
};
