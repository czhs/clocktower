// Hollowmere town palette (owner: town foundation lead). docs/TOWN.md §3.
//
// Every colour in the town traces back to this table. Ramps are [hi, mid, sh] sRGB hex for the toon
// material (rampFromTones / kit tones): hi = sun-lit, mid = side-lit / thin cloud, sh = shadow.
// Hues come from the v1 2D art (pipgws packages/assets/scripts/{buildings,ground,props}.ts ROOFS, WALLS,
// GRASS, COBBLE, PLAZA, DIAL, KERB, BRASS ... ramps), values are lifted into pixel3d's noon range
// (t3ssel8r: hi ~ L .70-.80, mid ~ .50-.60, sh ~ .30-.40) and every shadow is pulled toward a cool
// slate / teal / violet (warm light, cool shadow) - never toward magenta and never black.
// The night look is the global night ramp of applyTimeOfDay('night') on these same tones + emissive glows.
import * as THREE from 'three';

export const TOWN_PALETTE = {
  // ---- walls
  plaster:  ['#E6DCC4', '#C4B89C', '#7C7A88'],   // limewash / daub (v1 plaster #b4ae9c..#726d62)
  daub:     ['#E0CDA4', '#BCA27A', '#78707E'],   // ochre infill of timber-frame walls (v1 'timber' wall)
  stone:    ['#B4ABB4', '#8A8190', '#565568'],   // grey-violet rubble / ashlar (v1 STONE / wall.stone)
  ashlar:   ['#D8CCB4', '#B0A28C', '#6E6A76'],   // pale dressed stone: quoins, door surrounds, steps (v1 DSTONE)
  brick:    ['#C98466', '#A65C46', '#5C4654'],   // (v1 brick #86483c..#4c2424)
  plank:    ['#A27B5A', '#7A5840', '#463A46'],   // weathered boards, log walls (v1 planks)
  timber:   ['#7E5A44', '#5A3E30', '#32283A'],   // dark structural beams, frames, door leaves (v1 BEAM)
  // ---- roofs (v1 ROOFS: slate, red, moss, thatch, blue, plum)
  slate:    ['#7D86AE', '#545C84', '#343A58'],
  red:      ['#D07C5C', '#A8503C', '#5A3848'],
  moss:     ['#8AA06A', '#5E7A50', '#34493F'],
  thatch:   ['#E2C27E', '#B8924E', '#6C5A50'],
  blue:     ['#78A6B8', '#4F7A92', '#2F4A5E'],
  plum:     ['#9E7EA8', '#6E5480', '#3E3352'],
  mossTuft: ['#B4C474', '#86A05A', '#4A6450'],   // moss clumps on roofs / stone tops
  // ---- trim & metal
  cream:    ['#F2E8D0', '#D8CCB0', '#8A8692'],   // bargeboards, window frames, bone-white trim
  iron:     ['#6E6A7E', '#46424F', '#2A2834'],   // lamp posts, hinges, cresting (v1 IRON)
  crow:     ['#46424F', '#2A2834', '#2A2834'],   // rooks / crows / ravens (iron mid, sh, sh: a near-black that is never black)
  brass:    ['#F0D080', '#C9A040', '#7A6248'],   // finials, vanes, clock hands (v1 BRASS)
  copper:   ['#8CC2A8', '#5E9A86', '#3A5E5E'],   // verdigris (Clockworks roof, still-flue)
  glass:    ['#8C9CB8', '#4E5A78', '#2C3248'],   // window glass by day (dark, cool)
  glow:     ['#FFE6A8', '#FFC46B', '#C8803C'],   // window / lantern glow at night (emissive, see kit.glowMaterial)
  // ---- ground
  grass:      ['#94B072', '#5E8452', '#30524A'],
  grassDark:  ['#88A66C', '#567B4D', '#2C4B46'],
  grassLight: ['#A0BA78', '#668C56', '#34574C'],
  forest:     ['#6E8E5C', '#4A6A48', '#2A4440'],  // forest floor at the rim
  dirt:       ['#B08A6A', '#8E6C52', '#584A4E'],  // cart road
  cobble:     ['#9A93A2', '#767080', '#4C4A5C'],  // lanes
  grout:      ['#5E5A6A', '#4C4858', '#363444'],
  plaza:      ['#A69EAC', '#827A8C', '#545264'],  // square setts (lighter, a touch warmer than the lanes)
  kerb:       ['#B2AAB4', '#8C8494', '#585668'],  // raised kerb ring of the square
  dial:       ['#C8AE92', '#A0846C', '#625660'],  // the voting-circle dial ring (warm sandstone)
  // ---- foliage
  leaf:     ['#86AA5A', '#5E8A4E', '#345A4E'],     // oak / bushes (core #24413E)
  pine:     ['#78A666', '#4E7C50', '#2E4E44'],     // spring pines (core #203A34; was #6E9A6A/#48745A/#2A4A48, too teal / dark)
  autumn:   ['#D0A050', '#A87838', '#5E4A44'],     // the one autumn oak (oak2)
  trunk:    ['#8A6E66', '#64504F', '#3E3646'],
  // ---- accents (single tones)
  flowerRed: '#D0505A', flowerViolet: '#A875D7', flowerWhite: '#EDEBDA', flowerYellow: '#E6D36A',
  berry: '#B04A5A', pumpkin: '#E08A3A', toadstool: '#C8403A', ivory: '#F0E6D0',
  bannerRed: '#B8463E', bannerGold: '#D8AE4A', bannerBlue: '#4A6E9E', bannerGreen: '#5E8A4E',
  blossomPink: '#E1BAB0',   // fruit-tree blossom: flowerRed lerped 55 % toward flowerWhite (THREE.Color.lerp = foliage PINK)
  // ---- night
  nightSky: '#141B33', lampGlow: '#FFC46B', holyGlow: '#9FB6E8', fireGlow: '#FF9A4A',
};

/**
 * Coloured glass that glows (apothecary bottles, stained / rose windows): a v1 hue mixed toward glow[1] at night.
 * mix 0.4 = house-5's bottles. Returns an sRGB hex (an allowed accent: it traces to a v1 hex + the glow ramp).
 */
export function glassGlow(v1Hex, mix = 0.4) {
  return hex(new THREE.Color(v1Hex).lerp(new THREE.Color(TOWN_PALETTE.glow[1]), mix));
}

/** Leaf/needle cores (the unlit canopy core tone) */
export const CORES = { leaf: '#24413E', pine: '#203A34', autumn: '#4A3A3A' };

const _slate = new THREE.Color('#3A3F5C');
const _cream = new THREE.Color('#FFF4DC');
const hex = (c) => '#' + c.getHexString().toUpperCase();

/** Ramp [hi, mid, sh] of a palette entry (throws on unknown names, so typos fail loudly). */
export function ramp(name) {
  const r = TOWN_PALETTE[name];
  if (!Array.isArray(r)) throw new Error(`town palette: no ramp '${name}'`);
  return r;
}

/**
 * Ramp for a v1 paint colour (door / shutter hex from layout style.shutters, e.g. '#6b2f2f'): the v1 paints
 * are night-dark, so the mid is lifted to L ~0.40, hi = mid lightened toward cream, sh = mid darkened and
 * mixed 35 % toward slate (cool, never black). Returns [hi, mid, sh] sRGB hex.
 */
export function paintRamp(hexIn, { lightness = 0.40 } = {}) {
  const c = new THREE.Color(hexIn), hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  const mid = new THREE.Color().setHSL(hsl.h, Math.min(0.62, hsl.s * 1.1 + 0.06), lightness, THREE.SRGBColorSpace);
  const hi = mid.clone().multiplyScalar(1.3).lerp(_cream, 0.18);
  const sh = mid.clone().multiplyScalar(0.62).lerp(_slate, 0.35);
  return [hex(hi), hex(mid), hex(sh)];
}

/** Linear THREE.Color triple {hi, mid, sh} for a ramp name or an explicit [hi, mid, sh] array. */
export function tonesOf(r) {
  const a = typeof r === 'string' ? ramp(r) : r;
  return { hi: new THREE.Color(a[0]), mid: new THREE.Color(a[1]), sh: new THREE.Color(a[2]) };
}
