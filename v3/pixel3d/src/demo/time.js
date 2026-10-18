// Town states for the Hollowmere demo (owner: time / town states; docs/DEMO.md §4.3).
//   createTime(demo) -> { update(t, dt), hours, preset, period, ringBell(), jumpTo(nameOrHours), nextPreset(dir),
//                         playCeremony(), stopCeremony(), setVote(i, on), votes, presets, schedule, info, dispose() }
//
// THE CLOCK. A continuous 0..24 h clock (store.timeOfDay, timeSpeed = game minutes per real second, paused). The town's
// look is INTERPOLATED (smoothstep per segment) between keyframes built from the town's own presets (src/town/api.js
// TOWN_TOD over src/world/sky.js TIME_PRESETS) plus two composed ones (dawn, dusk):
//   00:00 night - 05:00 night - 06:15 dawn - 08:00 morning - 12:30 noon - 16:00 afternoon - 18:30 golden
//   - 19:45 dusk - 21:00 night
// Interpolated: sun direction (world-fixed: relAz / elev at camera yaw 0 = the game's view; stepped to 0.5 deg so the
// shadows move in whole steps), sun colour, ramps, band thresholds, hemisphere, tone shape, penumbra, point-light
// gain / reach / warmth, shadow colour, ambient, sky, outline line / rim tint, grade (saturation, contrast, lift, gain,
// vignette, grain), fog colour + night-mist amount, cloud cover / strength, foliage veg ramps, lamp / brazier pool
// tones. Only uniforms change (no material / light-count changes: renderer.info.programs stays constant) and the
// per-frame path allocates nothing.
//
// LIGHTS ("the town lights up in order"): windows (house api.setLit), the clocktower, the street-lamp glass (per lamp:
// its glass vertices, the life/cycle.js technique) and the lamp pools switch ON one by one between 18:36 and 19:54
// (tower first, then the cottages in a hashed order, lamps interleaved) and OFF in the reverse order 05:54-06:54; the
// global window glow (kit.setNightGlow) fades in 18:18-18:36 and out 06:54-07:12; fires (braziers) burn 16:54-07:36.
// PointLights: the town builds them only for golden / night (§4.3). This module tops the set up to the tier's max
// (12 high / 8 low, ?lights=) BEFORE the shader warm-up, so the light COUNT never changes; by day they sit at
// intensity 0. They are re-aimed (position / colour / reach) at the lit anchors nearest the player as the player walks
// (one per piece in view first, like installLights); the dais' brazier light stays pinned (dais.js recolours it).
//
// TOWER: clocktower api.setTime follows the clock (minute hand stepped so the hands rebuild <= ~8x per real second);
// reaching the hour rings the bell (the piece does it; skipped above 120 min/s and on jumps). Life's own scripted
// clock (life/index.js sets the tower time and rings on ITS hours) is muted by gating the tower api: only this
// module's calls get through (CONTRACT-REQUEST life: an external-clock mode). B rings on demand.
//
// GAME STATE -> DAIS: phase / nominee / seats -> dais.setSeat / setPhase / setNight (night = the time of day is dark:
// candle halos, the hand's glow line); the vote sweep starts when the vote phase (or its nominee) is set. Seated
// townsfolk (life/folk.js figures) sit on occupied seats, ghosts on dead ones; voters (setVote / the ceremony) raise
// a hand as the brass hand reaches them. P plays the scripted ceremony (life/ceremony.js timings) THROUGH THE STORE.
//
// LIFE on/off: hides the life group AND skips its update (the composer's updater calls registry piece.update by
// name every frame). QUALITY: a reload (demo.reload): the town is built per tier; clock, state and player position
// survive through the URL.
import * as THREE from 'three';
import { TOWN_TOD } from '../town/api.js';
import { TOWN_PALETTE } from '../town/palette.js';
import { cutUniforms } from '../town/cutaway.js';
import * as kit from '../town/kit.js';
import { createFolk } from '../town/life/folk.js';
import { CEREMONY } from '../town/life/ceremony.js';
import { TIME_PRESETS } from '../world/sky.js';
import { ensureToonUniforms } from '../materials/toon.js';
import { addFog } from '../post/fog.js';
import { PHASES, SEAT_COUNT, presetForHour } from './api.js';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
/** 0 -> 1 over [a, b] clock hours (smoothstep). */
const ramp = (h, a, b) => smooth((h - a) / (b - a));
const NOOP = () => {};

// ------------------------------------------------------------------------------------------------ schedule (hours)
export const SCHEDULE = {
  duskOn: [18.6, 19.9],     // lights switch on one by one (tower first)
  dawnOff: [5.9, 6.9],      // ... and off in the reverse order
  glowUp: [18.3, 18.6], glowDown: [6.9, 7.2],      // global window glow (kit uGlow)
  fireUp: [16.9, 17.5], fireDown: [7.0, 7.6],      // braziers / forges (anchor kind 'fire')
  darkUp: [19.0, 20.5], darkDown: [5.0, 6.5],      // "it is night": pool tones, mist, dais candle halos, ground night
};
/** Named stops of the clock (jumpTo / N). The five TOWN_TOD presets keep api.js TOD_HOURS' anchors. */
export const CLOCK_PRESETS = { night: 0, dawn: 6.25, morning: 8, noon: 12.5, afternoon: 16, golden: 18.5, dusk: 19.75 };

// ------------------------------------------------------------------------------------------------ looks
const IDENT_VEG = { hi: [1, 1, 1], mid: [1, 1, 1], sh: [1, 1, 1], lift: [0, 0, 0] };
const C = (x) => new THREE.Color(x);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// lamp / brazier pool tones (props.js lampPools, dais.js brazierPool): build-time daylight ('soft') vs night values
const POOL = { day: { warm: [0.18, 0.1, 0.035], keep: 0.15 }, night: { warm: [0.6, 0.35, 0.1], keep: 0.56 } };
const DPOOL = { day: { warm: [0.2, 0.11, 0.035], keep: 0.15 }, night: { warm: [0.42, 0.22, 0.07], keep: 0.45 } };

/** A town preset as a flat record of interpolatable values (own objects: never sky.js' shared Colors). */
function lookOf(name) {
  const T = TOWN_TOD[name], S = TIME_PRESETS[T.sky ?? name];
  const pt = { gain: 0.6, radius: 1.8, levels: 3, warmth: 0.6, ...S.point };
  const V = T.veg ?? IDENT_VEG, cl = T.clouds;
  // buildTown's post chain: day builds grade with {saturation 1, vignette 0.08} over the preset, night uses the preset
  const g = name === 'night' ? S.grade : { ...S.grade, saturation: 1.0, vignette: 0.08 };
  return {
    relAz: T.relAz, elev: T.elev, sun: C(S.sun),
    rampHi: S.rampHi.clone(), rampMid: S.rampMid.clone(), rampSh: S.rampSh.clone(),
    bandLo: S.bandThr[0], bandHi: S.bandThr[1], ambShading: S.ambShading,
    hemiSky: S.hemiSky.clone(), hemiGround: S.hemiGround.clone(),
    toneSat: S.toneSat ?? 1, coolAccents: S.coolAccents ?? 0, groundLift: S.groundLift ?? 0, penumbra: S.penumbra ?? 0,
    pGain: pt.gain, pReach: T.pointReach ?? pt.radius, pWarmth: pt.warmth, cloudSoft: S.cloudSoft ?? 0.003,
    shadowColor: S.shadowColor.clone(), ambient: S.ambient.clone(), sky: C(S.sky), fog: C(S.fog.color),
    line: S.outline.line.clone(), rim: S.outline.rim.clone(), rimStrength: S.outline.rimStrength ?? 1,
    sat: g.saturation, contrast: g.contrast, lift: V3(g.lift), gain: V3(g.gain), vignette: g.vignette, grain: g.grain ?? 0,
    // clouds fade by raising the cover threshold (the blobs shrink away); >= 0.86 = none left
    cloudCover: cl ? cl.cover : 0.9, cloudStrength: cl?.strength ?? 0.9,
    vegHi: V3(V.hi), vegMid: V3(V.mid), vegSh: V3(V.sh), vegLift: V3(V.lift ?? [0, 0, 0]),
  };
}
const SCALARS = ['bandLo', 'bandHi', 'ambShading', 'toneSat', 'coolAccents', 'groundLift', 'penumbra', 'pGain', 'pReach', 'pWarmth',
  'cloudSoft', 'rimStrength', 'sat', 'contrast', 'vignette', 'grain', 'cloudCover', 'cloudStrength'];
const VECS = ['sun', 'rampHi', 'rampMid', 'rampSh', 'hemiSky', 'hemiGround', 'shadowColor', 'ambient', 'sky', 'fog', 'line', 'rim',
  'lift', 'gain', 'vegHi', 'vegMid', 'vegSh', 'vegLift'];
function cloneLook(L) { const o = { ...L }; for (const k of VECS) o[k] = L[k].clone(); return o; }
/** out = mix(a, b, f) in place (Colors / Vector3s component-wise, the sun azimuth along the shortest way). */
function mixLook(out, a, b, f) {
  for (const k of SCALARS) out[k] = a[k] + (b[k] - a[k]) * f;
  for (const k of VECS) {
    const o = out[k], p = a[k], q = b[k];
    if (o.isColor) o.setRGB(p.r + (q.r - p.r) * f, p.g + (q.g - p.g) * f, p.b + (q.b - p.b) * f);
    else o.set(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, p.z + (q.z - p.z) * f);
  }
  const d = Math.atan2(Math.sin((b.relAz - a.relAz) * DEG), Math.cos((b.relAz - a.relAz) * DEG)) / DEG;
  out.relAz = a.relAz + d * f;
  out.elev = a.elev + (b.elev - a.elev) * f;
  return out;
}
function buildKeys() {
  const L = Object.fromEntries(Object.keys(TOWN_TOD).map((k) => [k, lookOf(k)]));
  // dawn: half-way night -> morning, a low sun in the east-south-east, rose sky, warm pale light
  const dawn = mixLook(cloneLook(L.night), L.night, L.morning, 0.55);
  Object.assign(dawn, { relAz: 70, elev: 11, vignette: 0.16, grain: 0.012 });
  dawn.sun.set('#FFB88C'); dawn.sky.set('#D9A9A2'); dawn.fog.set('#B9A0A8');
  dawn.rampHi.lerp(new THREE.Color(0.95, 0.72, 0.62), 0.35);
  // dusk: half-way golden -> night, the sun just down in the north-west, violet sky
  const dusk = mixLook(cloneLook(L.golden), L.golden, L.night, 0.5);
  Object.assign(dusk, { relAz: -112, elev: 9 });
  dusk.sun.set('#E8907A'); dusk.sky.set('#5E4A78'); dusk.fog.set('#4A3F63');
  return [[0, L.night], [5, L.night], [6.25, dawn], [8, L.morning], [12.5, L.noon], [16, L.afternoon], [18.5, L.golden],
    [19.75, dusk], [21, L.night], [24, L.night]];
}
/** Day period label (UI): night / dawn / day / dusk. */
export function periodOf(h) {
  if (h >= 21 || h < 5) return 'night';
  if (h < 8) return 'dawn';
  if (h < 18.5) return 'day';
  return 'dusk';
}

// ------------------------------------------------------------------------------------------------ light anchors
const KIND_BONUS = { lamp: 2.0, holy: 1.5, fire: 1.5, lantern: 1.5, window: -2.0 };
/** installLights' wall hugging (src/town/api.js hugWall, not exported): lanterns / windows a few cm in front of their
 *  building's door wall sit 6 cm in front of it (no hard disc painted on the facade). */
function hugged(l, layout) {
  const p0 = l.pos.clone();
  if (l.hug === false || !(l.kind === 'lantern' || l.kind === 'window')) return p0;
  const rec = layout.houses.find((h) => h.id === l.piece) ?? (l.piece === 'clocktower' ? layout.clocktower : null);
  if (!rec) return p0;
  const [nx, nz] = rec.doorNormal, p = rec.doorPoint;
  const s = (l.pos.x - p.x) * nx + (l.pos.z - p.z) * nz;
  const lat = Math.abs(-(l.pos.x - p.x) * nz + (l.pos.z - p.z) * nx);
  const g = rec.game ?? rec;
  const half = g.facing === 'south' ? g.footprint.w / 2 + 0.6 : g.footprint.d + 0.6;
  if (s <= 0.06 || s > 0.45 || lat > half) return p0;
  return p0.add(new THREE.Vector3(-nx * (s - 0.06), 0, -nz * (s - 0.06)));
}
// ------------------------------------------------------------------------------------------------ cottage night looks
// Inside a cottage the town's night look (blue moon ramps, blue hemisphere fill, the town mist) washed every room into
// the same blue-grey (critic r6: 3, 6, 8, 10, 12, 13, 14 told apart only by layout; 12-14's wall caps lost in the
// void). Per room, at night (x the darkness), the LIT ramps (rampHi / rampMid: the moonlit faces), the moon colour and
// the hemisphere fill (the shadow band of every lit surface) are pulled toward the room's own palette (docs/LORE.md
// ambiance column): `lit` tints the ramps + moon (LIT_SHARE of k), `sh` the hemisphere fill, `k` how far (0..1), `gain` a luminance
// lift of the fill (caps / beams read against the void), `mist` scales the night mist inside (1 = the town's).
// rampSh is NOT touched: the room's void (interior-void, unlit 'sh') keeps the night-sky tone, so the walls' caps
// separate from it. A kit room may carry its own `nightAmbient` ({lit, sh, k, gain, mist} or {color, strength}:
// CONTRACT-REQUEST interior-kit, ROOM export) which wins over this table.
const ROOM_NIGHT = {
  'house-0':  { lit: '#9AA8E8', sh: '#8090D0', k: 0.15, gain: 1.1, mist: 0.5 },    // cold blue moonlight, indigo + brass
  'house-1':  { lit: '#D8CC78', sh: '#9AAA70', k: 0.5, gain: 1.15, mist: 0.35 },  // green-gold firelight
  'house-2':  { lit: '#E0D4C0', sh: '#A8A4B0', k: 0.35, gain: 1.15, mist: 0.35 }, // soft, watchful
  'house-3':  { lit: '#E8A878', sh: '#B08890', k: 0.7, gain: 1.1, mist: 0.3 },    // candlelit near-dark, violet stone
  'house-4':  { lit: '#C8D890', sh: '#86A47C', k: 0.5, gain: 1.15, mist: 0.35 },  // green through ivy, earthy
  'house-5':  { lit: '#E8B878', sh: '#70A8A8', k: 0.5, gain: 1.15, mist: 0.35 },  // teal + amber
  'house-6':  { lit: '#F4C460', sh: '#B89468', k: 0.75, gain: 1.3, mist: 0.25 },  // warm gold, dozens of lanterns
  'house-7':  { lit: '#ECDCC4', sh: '#A88C9C', k: 0.45, gain: 1.15, mist: 0.4 },  // mushroom glow, reds + cream
  'house-8':  { lit: '#F49858', sh: '#946454', k: 0.7, gain: 1.05, mist: 0.25 },  // roaring orange firelight
  'house-9':  { lit: '#D8E4D8', sh: '#7AA8A0', k: 0.35, gain: 1.1, mist: 0.35 },  // cool workshop, verdigris
  'house-10': { lit: '#ECB888', sh: '#A47E64', k: 0.65, gain: 1.2, mist: 0.3 },   // warm leather browns
  'house-11': { lit: '#D4E4A0', sh: '#7EAA84', k: 0.45, gain: 1.15, mist: 0.35 }, // green leaf light, fireflies
  'house-12': { lit: '#ECE0C4', sh: '#9A9490', k: 0.65, gain: 1.2, mist: 0.3, litK: 0.6 },   // inky black + newsprint cream
  'house-13': { lit: '#A8D8CC', sh: '#78A8A0', k: 0.6, gain: 1.3, mist: 0.75, litK: 0.6 }, // blue-grey river light, mist
  'house-14': { lit: '#F0D8A8', sh: '#AC947C', k: 0.65, gain: 1.25, mist: 0.45, litK: 0.5 }, // warm wood, flour haze
};
const LIT_SHARE = 0.3;   // the lit ramps / moon take this share of k by default (`litK`; the hemisphere fill takes all of k)
const ROOM_NIGHT_DEFAULT = { lit: '#E8C8A0', sh: '#A09088', k: 0.5, gain: 1.15, mist: 0.35 };
function roomNightOf(room) {
  const own = room?.raw?.nightAmbient ?? room?.raw?.room?.nightAmbient ?? room?.nightAmbient ?? null;
  const base = ROOM_NIGHT[room?.id] ?? ROOM_NIGHT_DEFAULT;
  const o = own ? { ...base, ...own } : base;
  const lit = new THREE.Color(o.lit ?? o.color ?? base.lit), sh = new THREE.Color(o.sh ?? o.color ?? base.sh);
  return { lit, sh, k: clamp01(o.k ?? o.strength ?? base.k), litK: clamp01(o.litK ?? LIT_SHARE), gain: o.gain ?? base.gain, mist: o.mist ?? base.mist, own: !!own };
}
const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** c -> mix(c, tint scaled to c's luminance x gain, f), in place. */
function tintTo(c, tint, f, gain = 1) {
  const lt = Math.max(1e-4, lumOf(tint)), s = (lumOf(c) * gain) / lt;
  c.setRGB(c.r + (tint.r * s - c.r) * f, c.g + (tint.g * s - c.g) * f, c.b + (tint.b * s - c.b) * f);
}
// room point lights (critic r6: hard-edged coloured discs on walls / floors, the 'stain' INTERIORS.md §2 warns about):
// a light within WALL_NEAR m of a back / side wall reaches at most WALL_R m (fire WALL_R_FIRE) at WALL_GAIN of its
// intensity, and the pool bands are finer inside (uPointLevels ROOM_LEVELS: the dithered steps are a third as tall)
const WALL_NEAR = 0.5, WALL_R = 1.3, WALL_R_FIRE = 2.2, WALL_GAIN = 0.7, ROOM_LEVELS = 6;

const NOFLICK = Object.freeze({ flicker: false, kind: 'demo-time' });   // neutralises installLights' own flicker loop
const FLICK_ON = [1, 0, 1, 0, 1];                                       // a wick catching (life/cycle.js), 8 fps

// ------------------------------------------------------------------------------------------------ the module
export function createTime(demo) {
  const { engine, store, input, events, town, layout } = demo;
  const reg = town.registry;
  const params = demo.params ?? new URLSearchParams();
  const quality = town.quality ?? store.state.quality;
  const towerPiece = reg.get('clocktower'), tower = towerPiece?.api;
  const daisPiece = reg.get('dais'), dais = daisPiece?.api;
  const lifePiece = reg.get('life'), propsApi = reg.get('props')?.api;
  const T = ensureToonUniforms(engine), U = engine.uniforms, CU = cutUniforms(engine);
  const KEYS = buildKeys();
  const cur = cloneLook(KEYS[0][1]);
  const offs = [];
  const info = { lights: 0, lit: 0, aims: 0, handSteps: 0, strikes: 0, lastStrike: null, fog: false, folk: false, glass: 0 };
  const clouds = quality === 'high' && params.get('clouds') !== '0';

  let hours = ((Number(store.state.timeOfDay) % 24) + 24) % 24;
  let preset = presetForHour(hours), period = periodOf(hours);
  let applied = -1, lastWriteT = -1, lastWriteMin = -1, ready = false, firstUpdate = true, jumpedAt = -1;
  let fogK = 0, fireGain = 0, daisNight = null;

  // ---- engine.style: own objects (applyTimeOfDay shares sky.js' Colors in style.outline: never mutate those)
  engine.style.outline = { line: new THREE.Color(), rim: new THREE.Color(), rimStrength: 1 };
  engine.style.grade = { saturation: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.1, grain: 0 };
  engine.style.fog = { color: new THREE.Color() };
  engine.style.sunColor = new THREE.Color();
  if (clouds) { T.uCloudWind.value.set(0.03, 0.011); T.uCloud.value.w = 10; }

  // ---- post: the grade pass follows the current look (buildTown's grade options are fixed per build)
  const gradePass = engine.pipeline.getPass('grade'), vigPass = engine.pipeline.getPass('vignette');
  if (gradePass) {
    const u = gradePass.material.uniforms, vu = vigPass?.material.uniforms;
    gradePass.update = () => {
      u.uSat.value = cur.sat; u.uContrast.value = cur.contrast;
      u.uLift.value.copy(cur.lift); u.uGain.value.copy(cur.gain);
      if (vu) { vu.uVignette.value = cur.vignette; vu.uGrain.value = cur.grain; }
    };
  }
  // night mist: high tier only (as buildTown). A day build has no fog pass: it is added here (its program compiles in
  // the warm-up), its amounts follow the darkness, and it is switched off in daylight once the page is ready.
  const FOG = { mistAmount: 0.22, mistDepth: 0.6, mistScale: 0.08, mistCover: 0.5, fogAmount: 0.15 };
  let fogPass = engine.pipeline.getPass('fog');
  if (!fogPass && quality === 'high' && params.get('fog') !== '0') fogPass = addFog(engine, FOG).pass;
  if (fogPass) {
    info.fog = true;
    const fu = fogPass.material.uniforms, base = fogPass.update;
    fogPass.update = (eng) => {
      base?.(eng);
      const fk = fogK * (roomLook ? roomLook.mist : 1);   // inside a cottage: the room's own mist (ROOM_NIGHT)
      fu.uMistP.value.z = FOG.mistAmount * fk;
      fu.uFogP.value.z = FOG.fogAmount * fk;
      fu.uMistQ.value.x = Math.max(1, Math.min(3, Math.floor((FOG.mistAmount * fk) / 0.06)));
    };
  }

  // ---- pools (build-time tone per tod: interpolated here) and the ground's night switch (uGMisc2.x)
  const lampPoolMat = engine.scene.getObjectByName('props-lamp-pools')?.material;
  const daisPoolMat = engine.scene.getObjectByName('dais-brazier-pool')?.material;
  let groundU = null;
  reg.get('ground')?.group?.traverse((o) => { const u = o.material?.uniforms?.uGMisc2; if (u && !groundU) groundU = u; });

  // ---- light keys: houses (+ tower) and the props street lamps, each with a slot in the dusk order
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const houseIds = reg.all().filter((p) => (p.id.startsWith('house-') || p.id === 'clocktower') && p.api?.setLit).map((p) => p.id)
    .sort((a, b) => (a === 'clocktower' ? -1 : b === 'clocktower' ? 1 : hash(a) - hash(b)));
  const slot = new Map();
  houseIds.forEach((id, k) => slot.set(id, (k + 0.15 + 0.5 * hash(id + '#')) / (houseIds.length + 0.5)));
  const lampAnchors = reg.anchors('lights').filter((l) => l.piece === 'props' && l.kind === 'lamp');
  lampAnchors.forEach((l, k) => slot.set(l.pos, Math.min(0.98, (k + 0.6 + 0.4 * hash('lamp' + k)) / (lampAnchors.length + 0.6))));
  const GENERIC = 0.45;
  const S = SCHEDULE;
  const onAt = (s, h) => h >= S.duskOn[0] + s * (S.duskOn[1] - S.duskOn[0]) || h < S.dawnOff[0] + (1 - s) * (S.dawnOff[1] - S.dawnOff[0]);
  const lit = new Map();          // key (house id | lamp anchor pos) -> bool
  let litVersion = 0;

  // per-lamp glass: glass vertices of the props group within 0.7 m of each lamp, above 1.2 m (life/cycle.js)
  const glass = new Map();
  {
    const props = reg.get('props');
    if (props?.group) {
      props.group.updateWorldMatrix(true, true);
      const v = new THREE.Vector3(), root = props.group.parent;
      const inv = root ? new THREE.Matrix4().copy(root.matrixWorld).invert() : new THREE.Matrix4();
      props.group.traverse((o) => {
        const a = o.isMesh && o.geometry?.getAttribute('aGlow');
        if (!a) return;
        const p = o.geometry.getAttribute('position');
        const m = o.matrixWorld.clone().premultiply(inv);
        const orig = Float32Array.from({ length: a.count }, (_, i) => a.getW(i));
        for (const l of lampAnchors) {
          const idx = [];
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(m);
            if (Math.hypot(v.x - l.pos.x, v.z - l.pos.z) < 0.7 && v.y > 1.2 && orig[i] > 0.5) idx.push(i);
          }
          if (idx.length) { (glass.get(l.pos) ?? glass.set(l.pos, []).get(l.pos)).push({ attr: a, idx: Int32Array.from(idx), orig }); info.glass++; }
        }
      });
    }
  }
  // lamp pool index (props api.lamps order) -> its lamp anchor
  const poolKeys = (propsApi?.lamps ?? []).map((L) => {
    const p = L.pos ?? L.base;
    let best = null, bd = 0.5;
    if (p) for (const a of lampAnchors) { const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z); if (d < bd) { bd = d; best = a.pos; } }
    return best;
  });
  const applyPools = () => { if (propsApi?.setLampPool) for (let i = 0; i < poolKeys.length; i++) propsApi.setLampPool(i, poolKeys[i] && lit.get(poolKeys[i]) ? 1 : 0); };

  // ---- PointLights: a constant set of `max` lights (adopt the composer's, top up with ours), re-aimed live
  const max = Math.max(1, Number(params.get('lights') ?? (quality === 'low' ? 8 : 12)) || 12);
  let n = 0;
  const anchors = reg.anchors('lights').map((a) => ({
    piece: a.piece, kind: a.kind, pos: hugged(a, layout), color: new THREE.Color(a.color ?? TOWN_PALETTE.lampGlow),
    r: a.r ?? 3.5, base: Number.isFinite(a.intensity) ? a.intensity : 1.4, i: n, ph: (n++ * 7.31) % 13,
    flicker: a.flicker === false ? false : !!(a.flicker || a.kind === 'lantern' || a.kind === 'fire'),
    key: a.piece === 'props' && a.kind === 'lamp' ? a.pos : slot.has(a.piece) ? a.piece : null,
    score: 0, d: 0,
  }));
  const fireAnchor = daisPiece ? anchors.find((a) => a.piece === 'dais' && a.kind === 'fire') ?? null : null;
  const lightGroup = new THREE.Group(); lightGroup.name = 'demo-time-lights';
  engine.scene.add(lightGroup);
  const recs = [];
  for (const o of town.lights ?? []) { o.anchor = NOFLICK; recs.push({ light: o.light, a: null, tOn: -1e9, wasOn: false }); }
  while (recs.length < max) {
    const pl = new THREE.PointLight(0xffc46b, 0, 3.5, 1.5);
    pl.castShadow = false; pl.name = 'demo-time-light';
    lightGroup.add(pl);
    recs.push({ light: pl, a: null, tOn: -1e9, wasOn: false });
  }
  info.lights = recs.length;
  const assign = (rec, a) => {
    rec.a = a; rec.wasOn = false; rec.tOn = -1e9;
    if (!a) { rec.light.intensity = 0; rec.light.position.set(0, -50, 0); return; }
    rec.light.position.copy(a.pos); rec.light.color.copy(a.color); rec.light.distance = a.r;
  };
  // the dais' brazier light is pinned (dais.js finds it by position at its first live frame and recolours it)
  const pinned = fireAnchor ? recs[0] : null;
  if (pinned) assign(pinned, fireAnchor);
  // (P1.3) a CARRIED light: the player's character holds a light (spec.lights, e.g. the Storyteller's lantern; the
  // Character is built without it, characters.js lightless): the LAST light of the pool follows its socket every frame
  // (world position, colour, reach, decay; intensity [day, dusk, night] by the toon ramp's daylight level x the spec's
  // stepped flicker on the character's own clock, the formula of src/chars/character.js). The light count never
  // changes, so swapping to the Storyteller compiles no program. While it is carried the town / room aim uses one slot less.
  const carryRec = recs.length > (pinned ? 2 : 1) ? recs[recs.length - 1] : null;
  let carry = null;          // { h (handle), L, node, decay0 }
  const isSlot = (r) => r !== pinned && !(carry && r === carryRec);
  const carriedOf = () => { const h = demo.player?.handle; return h?.lights?.length ? h : null; };
  const wpos = new THREE.Vector3();
  function syncCarry() {
    const h = carriedOf();
    if ((carry?.h ?? null) === h) return;
    if (carry) { carryRec.light.decay = carry.decay0; assign(carryRec, null); }
    carry = h && carryRec ? { h, L: h.lights[0].L, node: h.lights[0].node, decay0: carryRec.light.decay } : null;
    if (carry) {
      assign(carryRec, null);
      carryRec.light.color.set(carry.L.color ?? '#FFB060'); carryRec.light.distance = carry.L.distance ?? 2.4; carryRec.light.decay = carry.L.decay ?? 1.5;
    }
    info.carried = carry ? { id: h.id, socket: carry.L.socket ?? carry.L.bone } : null;
    // re-distribute the other slots (one more / one less)
    if (inRoom) aimRoom(inRoom); else { aimX = aimZ = 1e9; aimT = -1; }
  }
  function lightCarry() {
    if (!carry) return;
    const { L, node, h } = carry;
    node.updateWorldMatrix(true, false);
    node.getWorldPosition(wpos);
    carryRec.light.position.copy(wpos);
    const c = engine.toonUniforms?.uRampHi?.value;
    const l = c ? 0.299 * c.r + 0.587 * c.g + 0.114 * c.b : 1;
    const u = Math.min(1, Math.max(0, (l - 0.35) / 0.25)), night = 1 - u * u * (3 - 2 * u);
    const lvl = l < 0.45 ? 2 : l < 0.85 ? 1 : 0;
    let I = Array.isArray(L.intensity) ? L.intensity[lvl] : (L.intensity ?? 2.6) * (L.nightOnly === false ? 1 : night);
    const F = L.flicker === false ? null : { fps: 7.5, levels: [0.62, 0.78, 0.9, 1.0], seed: 17, ...(L.flicker || {}) };
    if (F) {
      const step = Math.floor(Math.max(0, h.clock) * F.fps + 0.001);
      const qx = Math.imul(step | 0, 1597334673) >>> 0, qy = Math.imul(F.seed, 3812015801 | 0) >>> 0;
      const hh = (Math.imul((qx ^ qy) >>> 0, 1597334673) >>> 0) / 4294967295;
      I *= F.levels[Math.min(F.levels.length - 1, Math.floor(hh * F.levels.length))];
    }
    carryRec.light.intensity = I;
    info.carried.intensity = +I.toFixed(2);
  }
  const gainOf = (a, h) => (a.room ? roomGain(a) : a.kind === 'fire' ? fireGain : a.key !== null ? (lit.get(a.key) ? 1 : 0) : onAt(GENERIC, h) ? 1 : 0);
  // ---- inside a cottage (interior.js / src/town/interiors: room.lights = [{pos, color, r, kind, intensity}], world):
  // the hearth always burns, candles / lanterns are lit by day too but brighter at night, the window light follows the
  // daylight (the kit's window panes show the sky through room.setTimeOfDay, called by the player on 'tod').
  // The point-light reach is capped while inside (night reach 4 m paints flat candle pools across a 9 x 6 m room).
  const ROOM_REACH = 3;
  let inRoom = null, roomLook = null, townLevels = null;
  const roomAB = params.get('roomLook') !== '0';   // ?roomLook=0: the town's night look + plain pools inside (A/B review)
  const roomGain = (a) => (a.kind === 'fire' ? 1 : a.kind === 'window' ? 0.75 * (1 - fireGain) : 0.45 + 0.55 * fireGain);
  // distance (m) from a world point to the room's back / side walls (the floor rect's edges; the front wall is the
  // cut-away stub with the doorway)
  const wallDist = (room, p) => {
    const f = room.floor;
    if (!f) return Infinity;
    return Math.min(p.x - f.x0, f.x1 - p.x, p.z - f.z0);
  };
  function aimRoom(room) {
    inRoom = room;
    const slots = recs.filter(isSlot);
    if (!room) {
      for (const r of slots) assign(r, null);
      roomLook = null;
      if (townLevels !== null && T.uPointLevels) T.uPointLevels.value = townLevels;
      townLevels = null;
      applyHours(hours);                    // the town's point-light shape + look back
      aimX = aimZ = 1e9; aimT = -1;         // re-aim at the player on the next frame
      info.room = null;
      return;
    }
    const ORDER = { fire: 0, lantern: 1, candle: 1, window: 2 };
    const list = (room.lights ?? []).filter((l) => l?.pos).slice()
      .sort((x, y) => (ORDER[x.kind] ?? 3) - (ORDER[y.kind] ?? 3));
    let nearWall = 0;
    const anchorsIn = list.slice(0, slots.length).map((l, k) => {
      const kind = l.kind ?? 'lantern', pos = new THREE.Vector3(l.pos.x, l.pos.y ?? 1, l.pos.z);
      let r = l.r ?? 2.5, base = Number.isFinite(l.intensity) ? l.intensity : 1.4;
      if (roomAB && kind !== 'window' && wallDist(room, pos) < WALL_NEAR) {
        r = Math.min(r, kind === 'fire' ? WALL_R_FIRE : WALL_R); base *= WALL_GAIN; nearWall++;
      }
      return {
        room: true, piece: room.id, kind, pos, color: new THREE.Color(l.color ?? TOWN_PALETTE.lampGlow), r, base,
        i: 1000 + k, ph: (k * 5.17) % 13, flicker: kind === 'fire' || kind === 'lantern' || kind === 'candle', key: null, score: 0, d: 0,
      };
    });
    slots.forEach((r, k) => assign(r, anchorsIn[k] ?? null));
    if (roomAB && T.uPointLevels) { if (townLevels === null) townLevels = T.uPointLevels.value; T.uPointLevels.value = ROOM_LEVELS; }
    roomLook = roomAB ? roomNightOf(room) : null;
    applyHours(hours);                      // the room's night look
    info.room = { id: room.id, lights: anchorsIn.length, of: list.length, nearWall, look: roomLook ? { k: roomLook.k, own: roomLook.own } : null };
  }
  let aimX = 1e9, aimZ = 1e9, aimVersion = -1, aimT = -1;
  const pool = [];
  function aim(cx, cz) {
    const near = engine.camera.viewHeight * 1.6;
    pool.length = 0;
    for (const a of anchors) {
      if (a === fireAnchor) continue;
      a.d = Math.hypot(a.pos.x - cx, a.pos.z - cz);
      a.score = a.d - (KIND_BONUS[a.kind] ?? 0) + (gainOf(a, hours) > 0 ? 0 : 1000);
      pool.push(a);
    }
    pool.sort((x, y) => x.score - y.score || x.i - y.i);
    const want = new Set(), pieces = new Set(), slots = recs.filter(isSlot).length;
    for (const a of pool) if (want.size < slots && a.d < near && a.score < 900 && !pieces.has(a.piece)) { pieces.add(a.piece); want.add(a); }
    for (const a of pool) if (want.size < slots) want.add(a);
    const free = [];
    for (const r of recs) { if (!isSlot(r)) continue; if (r.a && want.has(r.a)) want.delete(r.a); else free.push(r); }
    for (const a of want) assign(free.shift(), a);
    for (const r of free) assign(r, null);
    aimX = cx; aimZ = cz; aimVersion = litVersion; info.aims++;
  }

  // ---- the clock tower: gate its api so only this module drives the hands / the bell (life's own clock is muted)
  let mine = false;
  const towerSet = tower?.setTime, towerRing = tower?.ring;
  if (tower && towerSet) {
    tower.setTime = (h, m) => { if (mine) towerSet(h, m); };
    tower.ring = (t0) => { if (mine) towerRing?.(t0); };
  }
  let shownMin = null;
  const STEPS = [1, 2, 5, 10, 15, 30, 60];
  function showTime(h, jumped) {
    if (!towerSet) return;
    const sp = store.state.paused ? 0 : store.state.timeSpeed;
    let step = 60;
    for (const s of STEPS) if (s >= sp / 8) { step = s; break; }
    let total = Math.floor((h * 60) / step) * step;
    // a strike only when the RUNNING clock crosses the hour (not on jumps / while paused / above 120 min/s): any other
    // ':00' is shown as ':01', because the piece rings by itself whenever setTime lands on the hour
    const natural = sp > 0 && sp <= 120 && !jumped && shownMin !== null && Math.floor(shownMin / 60) !== Math.floor(total / 60);
    if (total % 60 === 0 && !natural) total += 1;
    if (total === shownMin) return;
    const strike = natural && total % 60 === 0;
    shownMin = total;
    mine = true; try { towerSet(0, total % 1440); } finally { mine = false; }
    info.handSteps++;
    if (strike) { info.strikes++; info.lastStrike = Math.floor(total / 60) % 24; events.emit('bell', { t: engine.time, hour: info.lastStrike }); }
  }
  const ringBell = () => {
    if (towerRing) { mine = true; try { towerRing(engine.time); } finally { mine = false; } }
    events.emit('bell', { t: engine.time });
  };

  // ---- applying the clock
  function lookAt(h) {
    let k = 0;
    while (k < KEYS.length - 2 && h >= KEYS[k + 1][0]) k++;
    const h0 = KEYS[k][0], h1 = KEYS[k + 1][0];
    return mixLook(cur, KEYS[k][1], KEYS[k + 1][1], smooth((h - h0) / (h1 - h0)));
  }
  const q5 = (x) => Math.round(x * 2) / 2;
  const m3 = [0, 0, 0];
  const mix3 = (a, b, f) => { m3[0] = a[0] + (b[0] - a[0]) * f; m3[1] = a[1] + (b[1] - a[1]) * f; m3[2] = a[2] + (b[2] - a[2]) * f; return m3; };
  function applyHours(h) {
    const L = lookAt(h);
    if (roomLook) {
      // inside a cottage at night: the room's own palette (ROOM_NIGHT above); L is `cur` (re-derived every call)
      const R = roomLook, dkR = h < 12 ? 1 - ramp(h, S.darkDown[0], S.darkDown[1]) : ramp(h, S.darkUp[0], S.darkUp[1]);
      const f = R.k * dkR, g = 1 + (R.gain - 1) * dkR;
      if (dkR > 0) {
        // the moon patches through the windows stay mostly moonlight (a full tint turned them into tan blobs)
        const fl = f * R.litK;
        tintTo(L.rampHi, R.lit, fl); tintTo(L.rampMid, R.lit, fl); tintTo(L.sun, R.lit, fl);
        tintTo(L.hemiSky, R.sh, f, g); tintTo(L.hemiGround, R.sh, f, g);
        L.sat += (Math.max(L.sat, 1) - L.sat) * f;       // the town's night desaturation, eased inside
      }
    }
    // sun: world-fixed (camera yaw 0 = the game's view: R = +x, B = +z), stepped to 0.5 deg
    const az = q5(L.relAz) * DEG, el = q5(L.elev) * DEG;
    U.uSunDir.value.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    U.uSunColor.value.copy(L.sun);
    engine.style.sunColor.copy(L.sun);
    T.uRampHi.value.copy(L.rampHi); T.uRampMid.value.copy(L.rampMid); T.uRampSh.value.copy(L.rampSh);
    T.uBandThr.value.set(L.bandLo, L.bandHi);
    T.uAmbShading.value = L.ambShading;
    T.uHemiSky.value.copy(L.hemiSky); T.uHemiGround.value.copy(L.hemiGround);
    T.uToneShape.value.set(L.toneSat, L.coolAccents, L.groundLift, 0);
    T.uPenumbra.value.x = L.penumbra;
    T.uPointShape.value.set(L.pGain, L.pReach, L.pWarmth);
    U.uShadowColor.value.copy(L.shadowColor); U.uAmbient.value.copy(L.ambient);
    engine.style.sky.copy(L.sky);
    engine.style.fog.color.copy(L.fog);
    const o = engine.style.outline; o.line.copy(L.line); o.rim.copy(L.rim); o.rimStrength = L.rimStrength;
    CU.uVegHi.value.copy(L.vegHi); CU.uVegMid.value.copy(L.vegMid); CU.uVegSh.value.copy(L.vegSh); CU.uVegLift.value.copy(L.vegLift);
    // clouds (high tier only, as applyTownTime): fixed scale, the cover threshold fades them in / out
    if (clouds && L.cloudCover < 0.86) { T.uCloud.value.set(0.06, L.cloudCover, L.cloudSoft, 10); T.uCloudShape.value.y = L.cloudStrength; }
    else { T.uCloud.value.x = 0; T.uCloud.value.z = L.cloudSoft; }

    // lights in order, glow, fires, darkness
    let changed = false;
    for (const id of houseIds) {
      const on = onAt(slot.get(id), h);
      if (lit.get(id) !== on) { lit.set(id, on); reg.get(id)?.api?.setLit?.(on); changed = true; }
    }
    for (const l of lampAnchors) {
      const on = onAt(slot.get(l.pos), h);
      if (lit.get(l.pos) === on) continue;
      lit.set(l.pos, on); changed = true;
      for (const g of glass.get(l.pos) ?? []) { for (const i of g.idx) g.attr.setW(i, on ? g.orig[i] : 0); g.attr.needsUpdate = true; }
    }
    if (changed) { litVersion++; applyPools(); }
    kit.setNightGlow(engine, h < 12 ? 1 - ramp(h, S.glowDown[0], S.glowDown[1]) : ramp(h, S.glowUp[0], S.glowUp[1]));
    fireGain = h < 12 ? 1 - ramp(h, S.fireDown[0], S.fireDown[1]) : ramp(h, S.fireUp[0], S.fireUp[1]);
    const dk = h < 12 ? 1 - ramp(h, S.darkDown[0], S.darkDown[1]) : ramp(h, S.darkUp[0], S.darkUp[1]);
    fogK = dk;
    if (fogPass && ready) fogPass.enabled = dk > 0.01;
    if (lampPoolMat) { lampPoolMat.uniforms.uWarm.value.fromArray(mix3(POOL.day.warm, POOL.night.warm, dk)); lampPoolMat.uniforms.uKeep.value = POOL.day.keep + (POOL.night.keep - POOL.day.keep) * dk; }
    if (daisPoolMat) { daisPoolMat.uniforms.uWarm.value.fromArray(mix3(DPOOL.day.warm, DPOOL.night.warm, dk)); daisPoolMat.uniforms.uKeep.value = DPOOL.day.keep + (DPOOL.night.keep - DPOOL.day.keep) * dk; }
    if (groundU) groundU.value.x = dk > 0.5 ? 1 : 0;
    if (dais?.setNight && (dk > 0.5) !== daisNight) { daisNight = dk > 0.5; dais.setNight(daisNight); }

    const p = presetForHour(h), per = periodOf(h);
    if (p !== preset || per !== period || applied < 0) {
      preset = p; period = per; engine.style.timeOfDay = TOWN_TOD[p]?.sky ?? p;
      events.emit('tod', { preset: p, period: per, hours: h, sunAz: L.relAz, sunElev: L.elev });
    }
  }

  // ---- game state -> dais (+ seated folk)
  const votes = new Set();
  const seatSince = new Float32Array(SEAT_COUNT).fill(-1e9);
  let vote = { from: 0, t0: 0, per: 0.55 };
  const seatOn = (st) => st.occupied || st.dead;
  const nomineeOf = (s) => { if (s.nominee !== null && s.nominee !== undefined) return s.nominee; const i = s.seats.findIndex((x) => x.nominated); return i >= 0 ? i : null; };
  function applyPhase(restart = true) {
    const s = store.state;
    if (!dais) return;
    if (s.phase === 'vote') {
      if (restart) vote = { from: nomineeOf(s) ?? 0, t0: engine.time + 0.4, per: 0.55 };
      dais.setPhase('vote', { from: vote.from, t0: vote.t0, perSeat: vote.per });
    } else dais.setPhase(s.phase);
  }
  function applySeats() {
    const s = store.state;
    if (!dais) return;
    const nom = s.nominee, active = s.phase === 'nomination' || s.phase === 'vote' || s.phase === 'execution';
    s.seats.forEach((st, i) => {
      if (!seatOn(st)) { dais.setSeat(i, 'empty'); return; }
      dais.setSeat(i, {
        dead: !!st.dead, ghostVote: !!st.ghostVote,
        nominated: !st.dead && (!!st.nominated || (active && i === nom)),
        onBlock: !!st.onBlock || (s.phase === 'execution' && i === nom),
        voteHand: votes.has(i) && (!st.dead || !!st.ghostVote),
      });
    });
  }
  offs.push(store.on('seats', ({ value, prev }) => {
    value.forEach((st, i) => { if (seatOn(st) && !(prev?.[i] && seatOn(prev[i]))) seatSince[i] = engine.time; });
    applySeats();
  }));

  const COST = ['red', 'slate', 'plaster'];
  const plans = Array.from({ length: SEAT_COUNT }, () => ({ costume: 'red', hand: false, since: 0 }));
  let folk = null;
  const folkGroup = new THREE.Group(); folkGroup.name = 'demo-time-folk';
  const folkRoot = town.root ?? engine.scene;
  if (daisPiece?.anchors?.seats?.length === SEAT_COUNT && params.get('folk') !== '0') {
    try {
      folkRoot.add(folkGroup);
      folk = createFolk(engine, folkGroup, daisPiece.anchors.seats, layout.CIRCLE, (i, t) => {
        const s = store.state, st = s.seats[i];
        if (!seatOn(st)) return null;
        const p = plans[i];
        p.since = seatSince[i];
        if (st.dead) { p.costume = 'ghost'; p.hand = false; return p; }
        p.costume = COST[(i * 7) % 3];
        // the hand goes up as the brass hand reaches the seat (dais sweep: seat offset k is reached at t0 + (k - 1) * per)
        const off = ((i - vote.from + SEAT_COUNT) % SEAT_COUNT) || SEAT_COUNT;
        p.hand = votes.has(i) && s.phase === 'vote' && t >= vote.t0 + (off - 1) * vote.per - 0.25;
        return p;
      });
      info.folk = true;
    } catch (e) { console.warn('[demo time] seated folk unavailable:', e); folk = null; folkGroup.removeFromParent(); }
  }
  const rootOff = folkRoot.position;

  // ---- the ceremony demo (life/ceremony.js timings, compressed at the start) written THROUGH the store
  let cer = null;
  function playCeremony() {
    const K = CEREMONY;
    votes.clear();
    const seats = Array.from({ length: SEAT_COUNT }, () => ({ occupied: false, dead: false, ghostVote: true, nominated: false, onBlock: false }));
    store.set({ phase: 'day', nominee: null, seats }, 'time');
    const steps = [];
    const at = (dt, fn) => steps.push([dt, fn]);
    K.order.forEach((i, k) => at(0.2 + k * 0.32, () => store.setSeat(i, K.dead.includes(i) ? { occupied: true, dead: true, ghostVote: !!K.ghost[i] } : { occupied: true }, 'time')));
    at(K.nominate - 2, () => store.set({ phase: 'nomination', nominee: K.nominee }, 'time'));
    at(K.vote - 2, () => { for (const v of K.voters) votes.add(v); store.set({ phase: 'vote' }, 'time'); });
    at(K.execute - 2, () => { store.set({ phase: 'execution' }, 'time'); ringBell(); });
    at(K.die - 2, () => store.setSeat(K.nominee, { dead: true, ghostVote: true, nominated: false }, 'time'));
    at(K.night - 2, () => { votes.clear(); cer = null; store.set({ phase: 'night', nominee: null }, 'time'); });
    cer = { t0: engine.time, k: 0, steps };
    events.emit('ceremony', { start: true, t0: engine.time });
    if (store.state.camera === 'follow') store.set({ camera: 'vote' }, 'time');
    events.emit('toast', { text: 'the voting ceremony' });
  }
  const stopCeremony = () => { cer = null; };

  // ---- life on / off: hide + skip its update (the composer's updater calls registry piece.update by name)
  // NOT group.visible = false: life holds PointLights (the keeper's lantern, characters/keeper.js) and hiding a light
  // changes the scene's light count = every lit material recompiles (measured: 39 -> 58 programs, a 200 ms hitch).
  // Instead every branch WITHOUT a light is hidden and the lights stay visible at intensity 0 (held every frame).
  const lifeUpdate = lifePiece?.update;
  const lifeLights = [], lifeHidden = [];
  let lifeOn = true;
  if (lifePiece?.group) lifePiece.group.traverse((o) => { if (o.isLight) lifeLights.push({ light: o, i: o.intensity }); });
  function applyLife() {
    if (!lifePiece) return;
    const on = !!store.state.life;
    if (on === lifeOn) return;
    lifeOn = on;
    lifePiece.update = on ? lifeUpdate : NOOP;
    const g = lifePiece.group;
    if (!g) return;
    if (!lifeLights.length) { g.visible = on; return; }
    if (!on) {
      const keep = new Set();
      for (const { light } of lifeLights) for (let o = light; o && o !== g.parent; o = o.parent) keep.add(o);
      const hide = (node) => { for (const c of node.children) { if (keep.has(c)) hide(c); else if (!c.isLight && c.visible) { c.visible = false; lifeHidden.push(c); } } };
      hide(g);
      for (const L of lifeLights) { L.i = L.light.intensity; L.light.intensity = 0; }
    } else {
      for (const o of lifeHidden) o.visible = true;
      lifeHidden.length = 0;
      for (const L of lifeLights) L.light.intensity = L.i;
    }
  }

  // ---- store wiring + keys
  offs.push(
    store.on('phase', ({ source, value, prev }) => {
      if (source !== 'time') cer = null;
      if (source !== 'time' && prev === 'vote' && value !== 'execution') votes.clear();
      applyPhase(); applySeats();
    }),
    store.on('nominee', () => { applyPhase(store.state.phase === 'vote'); applySeats(); }),
    store.on('life', applyLife),
    store.on('timeOfDay', ({ value, source }) => { if (source !== 'time') { hours = value; jumpedAt = engine.time; } }),
    store.on('quality', ({ source }) => {
      if (source === 'reload' || source === 'url') return;
      store.set({ timeOfDay: hours }, 'time');
      demo.reload({});
    }),
    input.bind('KeyB', () => ringBell(), { desc: 'ring the bell', group: 'town' }),
    input.bind('KeyT', () => store.set({ paused: !store.state.paused }, 'key'), { desc: 'pause / run the clock', group: 'time' }),
    input.bind('Period', () => store.set({ timeSpeed: Math.min(3600, (store.state.timeSpeed || 0.5) * 2) }, 'key'), { desc: 'clock faster (x2)', group: 'time' }),
    input.bind('Comma', () => store.set({ timeSpeed: store.state.timeSpeed <= 0.5 ? 0 : store.state.timeSpeed / 2 }, 'key'), { desc: 'clock slower (x1/2)', group: 'time' }),
    input.bind('KeyN', () => nextPreset(1), { desc: 'jump to the next time of day', group: 'time' }),
    input.bind('KeyV', () => store.set({ phase: PHASES[(PHASES.indexOf(store.state.phase) + 1) % PHASES.length] }, 'key'), { desc: 'next phase', group: 'town' }),
    input.bind('KeyP', () => (cer ? stopCeremony() : playCeremony()), { desc: 'play / stop the voting ceremony', group: 'town' }),
    input.bind('KeyL', () => store.set({ life: !store.state.life }, 'key'), { desc: 'life on / off', group: 'town' }),
  );

  function jumpTo(x) {
    const h = typeof x === 'string' ? CLOCK_PRESETS[x] : Number(x);
    if (!Number.isFinite(h)) return false;
    hours = ((h % 24) + 24) % 24; jumpedAt = engine.time;
    store.set({ timeOfDay: hours }, 'time');
    return true;
  }
  function nextPreset(dir = 1) {
    const list = Object.entries(CLOCK_PRESETS).sort((a, b) => a[1] - b[1]);
    let pick = dir > 0 ? list.find(([, h]) => h > hours + 1e-3) ?? list[0] : [...list].reverse().find(([, h]) => h < hours - 1e-3) ?? list[list.length - 1];
    jumpTo(pick[1]);
    events.emit('toast', { text: pick[0] });
  }

  // the initial state, BEFORE the warm-up (every light / pass / folk program compiles there)
  applyLife();
  applyPhase(); applySeats();
  applyHours(hours); applied = hours;
  { const p = demo.player?.position ?? engine.camera.target; aim(p.x, p.z); }
  showTime(hours, true);
  offs.push(events.on('ready', () => { ready = true; if (fogPass) fogPass.enabled = fogK > 0.01; }));

  return {
    get hours() { return hours; },
    get preset() { return preset; },
    get period() { return period; },
    get votes() { return votes; },
    /** the dais' vote sweep of the current / last vote phase: { from (seat), t0 (engine s), per (s per seat) } */
    get sweep() { return { ...vote }; },
    get ceremony() { return cer ? { t: engine.time - cer.t0, step: cer.k, of: cer.steps.length } : null; },
    presets: CLOCK_PRESETS, schedule: SCHEDULE, info,
    ringBell, jumpTo, nextPreset, playCeremony, stopCeremony,
    setVote(i, on) { if (on) votes.add(i); else votes.delete(i); applySeats(); },
    update(t, dt) {
      const s = store.state;
      if (!s.paused && s.timeSpeed > 0) hours = (hours + (s.timeSpeed / 60) * dt) % 24;
      // (perf) the look is re-derived when the clock moved >= 15 game seconds (or jumped): at 1 game min / s that is
      // every 15 real seconds instead of every frame (ramps change < 0.3 % in that time; the sun is stepped to 0.5 deg)
      if (hours !== applied && (Math.abs(hours - applied) >= 1 / 240 || t - jumpedAt < 0.05 || s.paused || s.timeSpeed === 0)) { applyHours(hours); applied = hours; }
      showTime(hours, t - jumpedAt < 0.05);
      // store write-back: every game minute, at most 10x per real second (high speeds)
      const min = Math.floor(hours * 60);
      if (min !== lastWriteMin && t - lastWriteT >= 0.1) { lastWriteMin = min; lastWriteT = t; store.set({ timeOfDay: hours }, 'time'); }

      // lights: re-aim at the player (moved > 2.5 m or the lit set changed; <= 4x / s), gains + flicker every frame.
      // Inside a cottage (demo.player.interior) the SAME pool is aimed at the room's light spots instead (no new lights:
      // the count never changes), and the town aim resumes on leaving.
      const room = demo.player?.interior ?? null;
      if (room !== inRoom) aimRoom(room);
      syncCarry();
      const p = (s.camera === 'follow' && demo.player?.position) || engine.camera.target;
      if (!inRoom && (Math.abs(p.x - aimX) + Math.abs(p.z - aimZ) > 2.5 || aimVersion !== litVersion) && t - aimT > 0.25) { aimT = t; aim(p.x, p.z); }
      if (inRoom) T.uPointShape.value.y = Math.min(T.uPointShape.value.y, ROOM_REACH);
      let nLit = 0;
      for (const r of recs) {
        const a = r.a;
        if (!a) continue;
        const g = gainOf(a, hours), on = g > 0;
        if (on && !r.wasOn) r.tOn = t;
        r.wasOn = on;
        let f = 1;
        if (on) {
          const k = Math.floor((t - r.tOn) * 8);
          if (k < FLICK_ON.length && a.kind !== 'fire') f = FLICK_ON[k];
          else if (a.flicker) {       // installLights' stepped 8 fps flicker
            const kk = Math.floor(t * 8 + a.ph);
            const hh = (((Math.sin(kk * 12.9898) * 43758.5453) % 1) + 1) % 1;
            f = hh < 0.25 ? 0.8 : hh < 0.5 ? 0.9 : hh < 0.75 ? 0.96 : 1.0;
          }
          nLit++;
        }
        r.light.intensity = a.base * g * f;
      }
      info.lit = nLit;
      lightCarry();

      if (!lifeOn) for (const L of lifeLights) L.light.intensity = 0;
      if (cer) { const ct = t - cer.t0; while (cer && cer.k < cer.steps.length && ct >= cer.steps[cer.k][0]) cer.steps[cer.k++][1](); }
      if (folk) folk.update(t, rootOff, firstUpdate);
      firstUpdate = false;
    },
    dispose() {
      for (const o of offs) o?.();
      if (tower && towerSet) { tower.setTime = towerSet; tower.ring = towerRing; }
      if (lifePiece && !lifeOn) { store.set({ life: true }, 'time'); applyLife(); }
      folkGroup.removeFromParent();
    },
  };
}
