// Indicators atlas (owner: indicators group): out/ui/indicators.{png,json} — `tools/uibake.sh indicators` (day/noon
// tokens; the night token set is `tools/uibake.sh indicators:indicators-night` → out/ui/indicators-night.*).
//
// v2 had no atlas for this group (Phaser Text + graphics + canvas textures), so there are no v2 frame names to keep:
// every frame is new-style (meta.newStyle lists them with the v2 code each one replaces) and the v2 constants that
// drive them are carried verbatim in meta.v2 (SPEECH, talking WAVE / PULSE_MS, label colours, token geometry).
// Text (labels, bubble lines, callout names) is dynamic: draw it with the kit bitmap font (out/ui/kit.json
// meta.bitmapFont) using meta.label / meta.bubble; the atlas carries the static parts + labelled samples.
import * as A from './art.js';

export function framesFor(T, kit) {
  const out = [];
  const add = (n, im) => out.push([n, im]);
  // name labels (samples; the font is dynamic)
  add('label_player', A.labelImage('Ada', 'player', T));
  add('label_storyteller', A.labelImage('The Storyteller', 'st', T));
  add('label_ghost', A.labelImage('Esme', 'ghost', T));
  add('label_ghost_wisp', A.ghostWisp(T));
  // speaking: 3-bar glyph (4 pulse steps), self on air, self idle, muted
  for (let k = 0; k < 4; k++) add(`talk_${k}`, A.talkGlyph(k, 'talk', T));
  for (let k = 0; k < 4; k++) add(`talk_self_${k}`, A.talkGlyph(k, 'self', T));
  add('talk_self_idle', A.talkGlyph(0, 'selfIdle', T));
  add('talk_muted', A.talkGlyph(0, 'muted', T));
  for (let k = 0; k < 3; k++) add(`talk_ring_${k}`, A.talkRing(k, 'talk', T));
  for (let k = 0; k < 3; k++) add(`talk_ring_self_${k}`, A.talkRing(k, 'self', T));
  // speech bubbles: 9-slice body + tail + samples
  add('bubble_nine', A.bubbleNine(T));
  add('bubble_tail', A.bubbleTail(T));
  const l1 = A.bubbleLines('Who slept well?'), l4 = A.bubbleLines('did not. Something was scratching at my door all night long and I am telling you it was not a cat.');
  add('bubble_sample_1', A.bubble(l1, A.bubbleSize(l1).w >> 1, T));
  add('bubble_sample_4', A.bubble(l4, 20, T));
  { const ll = A.bubbleLines('Good morning, town!'); add('bubble_sample_lifted', A.bubble(ll, A.bubbleSize(ll).w >> 1, T)); }
  add('bubble_pop', A.bubblePop(l1, A.bubbleSize(l1).w >> 1, T));
  // you are here
  add('you_chevron', A.youChevron(T));
  for (let k = 0; k < 4; k++) add(`you_ring_${k}`, A.youRing(k, T));
  for (let k = 0; k < 2; k++) add(`you_seat_${k}`, A.youSeat(k, T));
  // guidance arrow (ground decal, 16 headings) + bedtime door marker
  A.DIR8.forEach((d, i) => add(`guide_${d}`, A.guideArrow(i, T)));
  add('guide_dot', A.guideDot(false, T));
  add('guide_dot_lit', A.guideDot(true, T));
  for (let k = 0; k < 4; k++) add(`door_ring_${k}`, A.doorRing(k, T));
  add('door_chevron', A.doorChevron(T));
  // home compass
  A.DIR8.forEach((d, i) => add(`compass_${d}`, A.compassDisc(i, T)));
  { const im = new kit.PixelImage(133, 16); A.compassPill(im, 0, 0, 132, { steps: 22, dir8: 0 }, T); add('compass_pill_sample', im); }
  // house-name callouts
  add('callout_player', A.callout('Cordelia', 'player', T));
  add('callout_mine', A.callout('Dov', 'mine', T));
  add('callout_ghost', A.callout('Esme', 'ghost', T));
  // door-board occupant tokens
  add('token_ring', A.token(new kit.PixelImage(12, 12), false, T));
  add('token_ring_ghost', A.token(new kit.PixelImage(12, 12), true, T));
  add('token_sample', A.token(null, false, T, 'Ada'));
  add('token_sample_ghost', A.token(null, true, T, 'Esme'));
  for (const n of [2, 9]) add(`token_plus_${n}`, A.tokenPlus(n, T));
  // offscreen-player arrows
  // r2: disc + attached tail pointer per direction (empty well: blit avatar_<id> 24x24 at (pad + 2, pad + 2) = (11, 11))
  A.DIR8.forEach((d, i) => add(`offscreen_${d}`, A.edgeDiscPointer(A.edgeDisc(new kit.PixelImage(24, 24), T), i, T).img));
  add('offscreen_disc', A.edgeDisc(new kit.PixelImage(24, 24), T));
  add('offscreen_disc_ghost', A.edgeDisc(new kit.PixelImage(24, 24), T, '?', true));
  add('offscreen_sample', A.edgeDisc(null, T, 'Hob'));
  return out;
}

export function metaFor(T) {
  const seq = (p, n) => Array.from({ length: n }, (_, k) => `${p}${k}`);
  return {
    anchors: {
      label: 'text centred on the head anchor x; cap top = head.y - 11 (outline box 10 px, 1 px above the anchor)',
      talk_: { x: 0, y: 1, note: 'left edge 1 px right of the label box, y = label cap top - 1' },
      talk_ring_: { x: 23, y: 8, note: 'feet; only the front ~60 % of each ellipse (beside + below the feet)' }, talk_ring_self_: { x: 23, y: 8 },
      label_ghost_wisp: { x: 6, y: -1, note: 'right edge 6 px left of the label box left edge (shares its outline column), y = cap top + 1' },
      bubble_tail: { x: 2, y: 4, note: 'tip; rows 0..1 overlap the box edge + line rows' },
      you_chevron: { x: 4, y: 5, note: 'tip; 1 px above the label box, bob 1 px at 2 fps' },
      you_ring_: { x: 16, y: 8 }, you_seat_: { x: 'w/2', y: 'h', note: 'over the own seat spot (+1.25 m)' },
      guide_: { x: 'w>>1', y: 'h>>1', note: 'centre, 0.85 m (+0.12 m bob) from the feet toward the target, on L.ground; 8 SCREEN headings (projected ground direction); stepped 18 px sideways when it would hide behind the body' },
      guide_dot: { x: 2, y: 2, note: '3 trail dots beyond the tip along the screen heading, 6 px apart; the lit one marches at 2.5 fps; stop 0.3 m short of the target' },
      door_ring_: { x: 15, y: 7 }, door_chevron: { x: 5, y: 6 },
      compass_: { x: 7, y: 7 }, callout_: { x: 'floor((w-1)/2)', y: 'h-1', note: 'tail tip' },
      token_: { x: 8, y: 9, note: 'disc centre; pin head at (7..8, 0..1); 12x12 icon at (2, 3) clipped to r 5' },
      offscreen_: { x: 'w>>1', y: 'h>>1', note: 'disc centre; the tail tip reaches 7 px past the disc ring (pad 9); avatar at (11, 11)' },
      offscreen_disc: { x: 14, y: 14, note: '24x24 avatar_<id> at (2, 2) clipped to r 12 (18x18 with a 12x12 icon)' },
    },
    fps: {
      talk: +(30 / 7).toFixed(3), talk_holdGridFrames: 7, talk_ring: 7.5, you_ring: 2.5, door_ring: 2.5, bob: 2, guide_dot: 2.5,
      sequences: { talk: seq('talk_', 4), you_ring: seq('you_ring_', 4), door_ring: seq('door_ring_', 4), talk_ring: seq('talk_ring_', 3) },
    },
    label: {
      font: 'body (out/ui/kit.json meta.bitmapFont)', outline: 'labelLine, 8-neighbour 1 px', maxW: A.LABEL_MAX_W,
      colors: { player: T.labelText, storyteller: T.st, ghost: T.ghost }, line: T.labelLine, ghostLiftM: A.GHOST_LIFT_M,
    },
    bubble: {
      frame: 'kit FRAMES.bubble (nine: l3 t3 r3 b4 incl. 1-px shadow)', textW: A.BUBBLE_TEXT_W, padX: 5, textTop: 3, lineAdvance: 9,
      size: 'w = max line width + 10, h = 9 * lines + 5 (+ 2 tail rows + 1 shadow row)', text: T.text,
      appear: '2-grid-frame pop (bubble_pop: same text, box 2 px in per side + 1 px lower top), then a 3-step Bayer dissolve with 6-grid-frame holds over the last 600 ms (v2 fadeOutMs)',
      stacking: 'v2 stackBubbles (gap 2 px); r2: a lifted bubble KEEPS its tail over the speaker + a 1-px dotted connector (bubbleEdge dot + outline px, even rows) down to 1 px above the label, drawn under all bubbles; a lift change shows 1 halfway drawing for 2 grid frames',
    },
    talkOutline: 'post pass src/ui/indicators/talkOutline.js (order 290): 1-px 4-neighbour ring around the talker\'s FLAG_CHAR texels in talk / self + a second 1-px ring 1 texel further out in the line colour; selfIdle = glyph only (no outline)',
    colors: { talk: T.talk, talkLine: A.talkLineOf('talk', T), self: T.self, selfLine: A.talkLineOf('self', T), selfIdleGlyph: A.rampOf(T.self).sh, ghostLabelLine: A.labelLineOf('ghost', T) },
    headTop: { note: 'labels anchor at feet + visual top + 0.1 m; spec.height except these ids (m)', ...{ storyteller: 1.55 } },
    v2: {
      SPEECH: A.SPEECH, WAVE: A.WAVE, PULSE_MS: A.PULSE_MS,
      labelColors: { player: '#efe6cf', storyteller: '#e8c76a', ghost: '#cfe6ee', stroke: '#0b0812' },
      talking: { COLOR_TALK: '#ffe7a3', COLOR_SELF: '#ff8f8a' }, bubble: { panel: '#211f2c', edge: '#8a7448', hi: '#343042', shadow: '#0b0812', text: '#e4d8ba' },
      tokens: { TOKEN_TEX: 22, TOKEN_MIN: 11, TOKEN_MAX: 20, maxIcons: 4, overflow: '+N (≤ +99)' },
      houseNames: { mine: '#f2cf7a', ghost: '#b9d3dc', other: '#e4d8ba', nightAlpha: 0.8 },
    },
    newStyle: {
      label_: 'v2 TownScene Avatar.label (Phaser Text, Alegreya Sans 700)',
      talk_: 'v2 fx/talking.ts 3-bar glyph (7x7 at 0.85 alpha) → 9x9 plate; talk_self_* rose on air, talk_self_idle, talk_muted (new)',
      talk_ring_: 'new: ground voice ripple for renderers without the outline pass',
      bubble_: 'v2 social/bubbles.ts drawBox (graphics) → kit bubble frame + stepped tail',
      you_: 'v2 gameplay own-seat "You" marker; you_ring_* + you_chevron new ("you are here")',
      guide_: 'v2 gameplay hints arrow() (gold triangle, any angle) → 8 authored ground-decal headings + marching trail dots',
      door_: 'v2 bedtime door ellipse + bobbing chevron',
      compass_: 'v2 ui/common/help.css .ct-compass pill',
      callout_: 'v2 gameplay/houseNames.ts label + tail',
      token_: 'v2 gameplay/boardTokens.ts canvas tokens + "+N"',
      offscreen_: 'new: offscreen-player edge discs with an attached tail pointer (docs/UI.md row 21)',
      label_ghost_wisp: 'new: wisp glyph left of a ghost name (variant not colour-only)',
    },
  };
}

/** Palette audit (docs/UI.md §2.3): every opaque colour of every frame must be a token or a ramp() tone of a token. */
export function paletteAudit(T, kit) {
  const allowed = new Set();
  for (const v of Object.values(T)) {
    if (typeof v !== 'string') continue;
    allowed.add(kit.hex(v));
    const r = A.rampOf(v);
    for (const k of ['hi', 'sh', 'line']) allowed.add(kit.hex(r[k]));
  }
  const bad = {};
  let n = 0;
  for (const [name, im] of framesFor(T, kit)) {
    const off = [...im.colors()].filter((c) => !allowed.has(c));
    n += im.colors().size;
    if (off.length) bad[name] = off;
  }
  return { framesChecked: framesFor(T, kit).length, offPalette: bad, ok: !Object.keys(bad).length };
}

export default {
  image: 'indicators.png',
  width: 256,
  async frames(env) { return framesFor(env.T, env.kit); },
  meta(env) { return { ...metaFor(env.T), tokenSet: env.tod === 'night' ? 'night' : 'day', paletteAudit: paletteAudit(env.T, env.kit) }; },
};
