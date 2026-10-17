// Indicators slot for the mock HUD (owner: indicators group; docs/UI.md §3.3, rows 13–21).
// scenes/ui-hud.js calls setup(hud) once and draw(hud, L) every frame; scenes/ui-indicators.js reuses the same module
// with other configs (hud.indicatorsConfig, see defaultConfig) and the door close-up.
//
// Tiers: labels, talk glyphs, chevrons, bubbles, callouts, tokens → L.world (A); "you are here" ring, guidance arrow,
// door ring, voice ripple → L.ground (Ag: hidden under characters); compass pill + offscreen arrows → L.screen (S);
// the talking silhouette outline → a low-res post pass (talkOutline.js, order 290).
//
// Exposes hud.indicators = { labelTop(m), stackTop(m) } so other groups can stack above the label / bubble (v2 order:
// pins > bubble > label).
import { tokens, dissolve, frameAt, textWidth, drawText, PixelImage, loadImage } from '../kit.js';
import * as A from './art.js';
import { createTalkOutline } from './talkOutline.js';
import { SLOTS, rect } from '../placeholders.js';

/** Default config = the mock HUD (scenes/ui-hud.js). Every key can be overridden by hud.indicatorsConfig. */
export function defaultConfig(hud) {
  const byName = (n) => [...hud.cast, hud.st].find((m) => m && m.name === n);
  return {
    talk: hud.cast.filter((m) => m.clip === 'talk').map((m) => ({ m, kind: 'talk' })),   // voice talkers
    muted: [byName('Finn')].filter(Boolean),
    you: { chevron: true, ring: true, seatMarker: null, guideTo: null },
    // chat bubbles: {m, text, at (s), period (s, repeats)}; v2 lifetime = bubbleDurationMs(text)
    bubbles: [
      { m: byName('Cleo'), text: 'Something was scratching at my door all night.', at: 0, period: 9 },
      { m: byName('Bram'), text: 'Who slept well?', at: 0.4, period: 9 },
    ].filter((b) => b.m),
    compass: { steps: 22, home: hud.place ? hud.place(17, 150) : null },
    offscreen: hud.place ? [
      { name: 'Hob', id: 'snail', pos: hud.place(15.5, 82) },
      { name: 'Wren', id: 'moth', pos: hud.place(16, -158), ghost: true },
    ] : [],
    doors: [],                       // [{pos (ground), top (callout anchor, world), owner, style, ring, occupants: [{name, id, ghost}]}]
    ripple: [],                      // members with the ground voice ripple (renderers without the outline pass)
    outline: true,
  };
}

let ICONS = null;   // {castId | castId/ghost: PixelImage 12x12, 'avatar:' + id: 24x24} from out/ui/portraits.* (portraits group)
async function loadIcons() {
  if (ICONS) return ICONS;
  ICONS = {};
  try {
    const r = await fetch('out/ui/portraits.json');
    if (!r.ok) return ICONS;
    const j = await r.json();
    const img = await loadImage(`out/ui/${j.image || 'portraits.png'}`);
    for (const [n, f] of Object.entries(j.frames || {})) {
      if (n.startsWith('icon_') && f.w === 12 && f.h === 12) ICONS[n.slice(5)] = img.crop(f.x, f.y, 12, 12);
      else if (n.startsWith('avatar_') && f.w === 24 && f.h === 24) ICONS['avatar:' + n.slice(7)] = img.crop(f.x, f.y, 24, 24);
    }
  } catch (e) { /* portraits not baked yet: initials */ }
  return ICONS;
}
/** icon for a cast id (+ ghost variant from the portraits atlas when present): {img, ghostReady} */
function iconOf(id, ghost, avatar = false) {
  const k = (avatar ? 'avatar:' : '') + id;
  if (ghost && ICONS?.[k + '/ghost']) return { img: ICONS[k + '/ghost'], ghostReady: true };
  return { img: ICONS?.[k] || (avatar ? ICONS?.[id] : null) || null, ghostReady: false };
}

const _cache = new Map();
const cached = (key, fn) => { let v = _cache.get(key); if (!v) { v = fn(); _cache.set(key, v); } return v; };

export default {
  z: 20,
  async setup(hud) {
    const C = { ...defaultConfig(hud), ...(hud.indicatorsConfig || {}) };
    hud._ind = C;
    await loadIcons();
    const T0 = hud.tok || tokens(hud.tod);
    // r2: selfIdle (your mic open, silent) is glyph-only: the silhouette outline always means "talking right now"
    const colorOf = (k) => (k === 'self' ? T0.self : T0.talk);
    if (C.outline && hud.engine?.pipeline) {
      createTalkOutline(hud.engine, () => C.talk.filter((x) => x.m && (x.kind === 'talk' || x.kind === 'self') && !x.noOutline)
        .map((x) => ({ pos: x.m.feet(), height: x.m.height + (x.m.ghost ? A.GHOST_LIFT_M : 0), color: colorOf(x.kind), line: A.talkLineOf(x.kind, T0) })));
    }
    hud.indicators = {
      labelTop: (m, L) => labelTop(L, m),
      stackTop: (m, L) => labelTop(L, m) - (C.you?.chevron && m.you ? 8 : 1),
    };
  },
  draw(hud, L) { drawAll(hud, L, hud._ind); },
};

// ------------------------------------------------------------------------------------------------ drawing
/**
 * Visual top (m above the feet) for characters whose spec.height is NOT the head: the Storyteller's H 1.91 is the staff
 * finial of its rig, but the idle silhouette tops out at the hood tip (≈ 1.55, characters/storyteller.js), so r1's label
 * floated ~15 texels above the hood. Labels anchor to feet + top + 0.1 m like everyone else (hood tip + ~3 texels).
 */
export const VISUAL_TOP_M = { storyteller: 1.55 };
const headOf = (m) => {
  const top = VISUAL_TOP_M[m.id];
  const h = top !== undefined ? m.feet().clone().setY(m.feet().y + Math.min(top, m.height) + 0.1) : m.head();
  if (m.ghost) h.y += A.GHOST_LIFT_M;
  return h;
};
function labelTop(L, m) { return L.at(headOf(m)).y + A.LABEL_DY; }

function drawAll(hud, L, C) {
  const T = L.tok, t = L.t;
  const members = [...hud.cast, hud.st].filter(Boolean);
  const talkOf = new Map(C.talk.map((x) => [x.m, x.kind]));
  for (const m of C.muted) talkOf.set(m, 'muted');

  // ---- tier Ag: ground marks (under characters)
  const you = hud.you;
  if (you && C.you?.ring) {
    const k = frameAt(t, 2.5, 4);
    const f = L.at(you.feet());
    L.ground.blit(cached(`ring${k}${T.gold}`, () => A.youRing(k, T)), f.x - 16, f.y - 8);
  }
  for (const m of C.ripple) {
    const k = frameAt(t, 7.5, 3), f = L.at(m.feet());
    L.ground.blit(cached(`rip${k}${T.talk}`, () => A.talkRing(k, 'talk', T)), f.x - 23, f.y - 8);
  }
  if (you && C.you?.guideTo) drawGuide(L, you.feet(), C.you.guideTo, t);
  for (const d of C.doors) if (d.ring) {
    const k = frameAt(t, 2.5, 4), p = L.at(d.pos);
    L.ground.blit(cached(`door${k}${T.gold}`, () => A.doorRing(k, T)), p.x - 15, p.y - 7);
  }

  // ---- tier A: labels + glyphs + chevrons
  for (const m of members) {
    const p = L.at(headOf(m));
    if (L.at(m.feet()).y < L.MARGIN) continue;                  // whole character above the view: offscreen arrow instead
    const top = Math.max(L.MARGIN + 2 + (m.you && C.you?.chevron ? 8 : 0), p.y + A.LABEL_DY);   // clamp inward at the top edge
    const variant = m.st ? 'st' : m.ghost ? 'ghost' : 'player';
    const box = A.label(L.world, p.x, top, m.name, variant, T);
    if (variant === 'ghost') L.world.blit(cached(`wisp${T.ghost}`, () => A.ghostWisp(T)), box.x - 6, top + 1);   // shares the label's outline column
    const kind = talkOf.get(m);
    if (kind) {
      const step = kind === 'muted' || kind === 'selfIdle' ? 0 : A.talkStep(t);
      L.world.blit(cached(`g${kind}${step}${T.labelLine}`, () => A.talkGlyph(step, kind, T)), box.x + box.w + 1, top - 1);
    }
    if (m.you && C.you?.chevron) {
      const bob = frameAt(t, 2, 2);
      L.world.blit(cached(`chev${T.gold}`, () => A.youChevron(T)), p.x - 4, top - 8 - bob);
    }
  }
  if (you && C.you?.seatMarker) {
    const k = frameAt(t, 2, 2), p = L.at(C.you.seatMarker.clone().setY(C.you.seatMarker.y + 1.25));
    const im = cached(`seat${k}${T.gold}`, () => A.youSeat(k, T));
    L.world.blit(im, p.x - Math.floor(im.w / 2), p.y - im.h);
  }

  // ---- doors: chevron (bedtime), callout, occupant tokens
  for (const d of C.doors) drawDoor(L, d, t);

  // ---- bubbles (over everything anchored)
  drawBubbles(hud, L, C, t);

  // ---- tier S
  if (C.compass && L.screen) {
    const s = rect(SLOTS.indicators[0], L.screen.w, L.screen.h);
    let dir8 = 2;
    if (you && C.compass.home) { const a = L.at(you.feet()), b = L.at(C.compass.home); dir8 = A.dir8Of(b.x - a.x, b.y - a.y); }
    A.compassPill(L.screen, s.x, s.y - 1, s.w, { steps: C.compass.steps, dir8, title: C.compass.title || 'Your home' }, T);
  }
  if (C.offscreen?.length && L.screen) drawOffscreen(L, C.offscreen, T);
}

function drawGuide(L, from, to, t) {
  const T = L.tok;
  const d = to.clone().sub(from); d.y = 0;
  if (d.length() < 0.6) return;
  const dist = d.length();
  d.normalize();
  // screen heading of the ground direction (projected), 8 clean authored headings (r2)
  const f = L.at(from), g = L.at(from.clone().addScaledVector(d, 2));
  const sx = g.x - f.x, sy = g.y - f.y, sl = Math.hypot(sx, sy) || 1, ux = sx / sl, uy = sy / sl;
  const k = A.dir8Of(sx, sy);
  const bob = frameAt(t, 2, 2) * 0.12;                         // v2 sin(t·6)·1.5 px → 2 drawings, 0.12 m apart
  const p = L.at(from.clone().addScaledVector(d, 0.85 + bob));
  // heading up-screen: the decal would sit behind the body (ground layer hides under characters) → step it beside the feet
  if (p.y < f.y - 2 && Math.abs(p.x - f.x) < 18) p.x = f.x + (p.x >= f.x ? 1 : -1) * 18;
  const im = cached(`guide${k}${T.gold}`, () => A.guideArrow(k, T));
  L.ground.blit(im, p.x - (im.w >> 1), p.y - (im.h >> 1));
  // marching trail: 3 dots beyond the arrow tip along the screen heading (so the direction reads even after the
  // sideways step); the lit dot marches outward at 2.5 fps. Dots stop short of the target.
  const reach = (im.w >> 1) + 3, lit = frameAt(t, 2.5, 3);
  const pxPerM = sl / 2;
  for (let i = 0; i < 3; i++) {
    const off = reach + i * 6;
    if (off / Math.max(1e-6, pxPerM) + 0.85 > dist - 0.3) break;
    const x = Math.round(p.x + ux * off), y = Math.round(p.y + uy * off);
    L.ground.blit(cached(`gdot${i === lit}${T.gold}`, () => A.guideDot(i === lit, T)), x - 2, y - 2);
  }
}

function drawDoor(L, d, t) {
  const T = L.tok;
  const top = L.at(d.top);
  let y = top.y;
  if (d.ring) {
    const bob = frameAt(t, 2, 2);
    L.world.blit(cached(`dchev${T.gold}`, () => A.doorChevron(T)), top.x - 5, y - 7 - bob);
    y -= 9;
  }
  if (d.owner) {
    const im = cached(`call${d.owner}${d.style}${T.ink}`, () => A.callout(d.owner, d.style || 'player', T));
    L.world.blit(im, top.x - Math.floor((im.w - 1) / 2), y - im.h + 1);
  }
  if (d.occupants?.length) {
    const b = L.at(d.board);
    const shown = d.occupants.slice(0, 4), over = d.occupants.length - shown.length;
    const g = A.tokenGrid(shown.length, 16, 1);
    shown.forEach((o, i) => {
      const s = g.slots[i];
      const im = cached(`tok${o.id}${o.ghost}${T.ink}`, () => { const ic = iconOf(o.id, !!o.ghost); return A.token(ic.img, !!o.ghost, T, o.name, ic.ghostReady); });
      L.world.blit(im, b.x + s.dx, b.y + s.dy);
    });
    if (over > 0) {
      const im = cached(`plus${over}${T.ink}`, () => A.tokenPlus(over, T));
      L.world.blit(im, b.x + Math.floor(g.w / 2) + 2, b.y + Math.floor(g.h / 2) - 10);   // right of the grid, bottom-aligned
    }
  }
}

/** Bubbles live at time t, stacked (v2 SpeechBook + stackBubbles). Returns boxes oldest first. */
function bubbleLayout(L, C, t) {
  const live = [];
  for (const b of C.bubbles) {
    if (!b.m) continue;
    const dur = A.bubbleDurationMs(b.text) / 1000;
    const k = b.period ? Math.floor((t - b.at) / b.period) : 0;
    const born = b.at + (b.period ? Math.max(0, k) * b.period : 0);
    if (t < born || t >= born + dur) continue;
    live.push({ ...b, born, until: born + dur, key: `${b.m.name}|${b.text}|${born}` });
  }
  live.sort((a, b) => a.born - b.born);                       // oldest first (v2 SpeechBook order)
  // v2 SpeechBook.add: a new line from the same speaker REPLACES their bubble (and moves it to the newest slot)
  const newest = new Map();
  for (const b of live) newest.set(b.m, b);
  const shown = live.filter((b) => newest.get(b.m) === b).slice(-A.SPEECH.maxBubbles);
  const boxes = shown.map((b) => {
    const lines = cached(`lines${b.text}`, () => A.bubbleLines(b.text));
    const sz = A.bubbleSize(lines);
    const p = L.at(headOf(b.m));
    const extra = b.m.you && C.you?.chevron ? 7 : 0;
    const bottom = p.y + A.LABEL_DY - 2 - extra;                // tail tip 1 px above the label's outline box
    return { b, lines, x: p.x, y: bottom, w: sz.w, h: sz.h + A.BUBBLE_TAIL_H, lift: 0, bw: sz.w, bh: sz.h };
  });
  return A.stackBubbles(boxes, 2, 120);
}

/**
 * v2 fadeOutMs 600 kept (r2): pop for 2 grid frames, then a 3-step Bayer dissolve with holds of 6 grid frames
 * (5 fps) over the last 600 ms of the lifetime. (kit envelope() dissolves in 200 ms; this group keeps v2's timing.)
 */
export const BUBBLE_OUT_S = A.SPEECH.fadeOutMs / 1000;
function bubbleEnv(t, born, until) {
  if (t < born || t >= until) return { visible: false };
  const a = Math.floor((t - born) * 30 + 1e-6), out = until - BUBBLE_OUT_S;
  if (t < out) return { visible: true, dissolve: 0, pop: a < 2 };
  const b = Math.min(2, Math.floor((t - out) * 30 / 6 + 1e-6));
  return { visible: true, dissolve: [0.25, 0.5, 0.75][b], pop: false };
}

/** Re-stack step (r2): when a bubble's lift changes, 1 drawing halfway for 2 grid frames instead of a 1-frame snap. */
export const RESTACK_S = 2 / 30;

function drawBubbles(hud, L, C, t) {
  const T = L.tok;
  const boxes = bubbleLayout(L, C, t);
  const before = new Map(bubbleLayout(L, C, t - RESTACK_S).map((bx) => [bx.b.key, bx.lift]));
  const W = L.world.w, M = L.MARGIN;
  const draws = [];
  for (const bx of boxes) {
    const { b, lines } = bx;
    const env = bubbleEnv(t, b.born, b.until);
    if (!env.visible) continue;
    let lift = bx.lift;
    const prev = before.get(b.key);
    if (prev !== undefined && prev !== lift) lift = Math.round((prev + lift) / 2);
    const lifted = lift > 0;
    let left = bx.x - Math.floor(bx.bw / 2);
    left = Math.max(M + 2, Math.min(W - M - 2 - bx.bw, left));  // clamped into the view; the tail still points at the speaker
    const top = bx.y - lift - bx.h;
    // r2: a lifted bubble KEEPS its stepped tail over the speaker + a dotted connector down to the label (v2 dropped it)
    const tailX = Math.max(5, Math.min(bx.bw - 5, bx.x - left));
    let im = env.pop ? A.bubblePop(lines, tailX, T) : cached(`bub${b.text}${tailX}${T.bubble}`, () => A.bubble(lines, tailX, T));
    if (env.dissolve > 0) im = dissolve(im.clone(), env.dissolve, left & 3, top & 3);
    draws.push({ im, left, top, lifted, cx: left + tailX, y0: top + bx.bh + A.BUBBLE_TAIL_H + 1, y1: bx.y - 1, dissolve: env.dissolve });
  }
  // connectors first (under every bubble: an older bubble the line passes behind hides it), then the bubbles
  for (const d of draws) if (d.lifted && d.dissolve < 0.5) A.bubbleConnector(L.world, d.cx - 1, d.y0, d.y1, T);
  for (const d of draws) L.world.blit(d.im, d.left, d.top);
}

function drawOffscreen(L, list, T) {
  const W = L.screen.w, H = L.screen.h, cx = W / 2, cy = H / 2;
  for (const o of list) {
    const f = L.atScreen(o.pos);                                // feet: on screen → the character is visible, no arrow
    if (f.x >= 4 && f.y >= 4 && f.x < W - 4 && f.y < H - 4) continue;
    const p = L.atScreen(o.pos.clone().setY(o.pos.y + 0.7));
    const dx = p.x - cx, dy = p.y - cy;
    const d8 = A.dir8Of(dx, dy);
    // r2: disc + attached tail pointer in one image (the pointer no longer floats off the disc)
    const dp = cached(`edisc${o.id}${o.ghost}${d8}${T.ink}`, () => {
      const ic = iconOf(o.id, !!o.ghost, true);
      return A.edgeDiscPointer(A.edgeDisc(ic.img, T, o.name, !!o.ghost, ic.ghostReady), d8, T);
    });
    const r = (dp.img.w >> 1) - dp.pad, m = r + A.EDGE_TAIL + 3;
    const s = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), (H / 2 - m - 8) / Math.max(1e-6, Math.abs(dy)));
    const x = Math.round(cx + dx * s), y = Math.round(cy + dy * s);
    L.screen.blit(dp.img, x - (dp.img.w >> 1), y - (dp.img.h >> 1));
    const uy = Math.round(Math.sin((d8 * Math.PI) / 4));
    // UI integration r2 (whole-screen critic: Wren's name sat above its disc, Hob's below): ONE rule = the name goes on
    // the side away from the pointer's vertical component, and ABOVE for sideways pointers (left / right). The extra
    // 8-px top margin in s keeps an above-name inside the frame for every heading.
    const ty = uy < 0 ? y + r + 3 : y - r - 11;
    drawText(L.screen, x, ty, A.fitName(o.name, 48), { color: o.ghost ? T.ghost : T.labelText, outline: o.ghost ? A.labelLineOf('ghost', T) : T.labelLine, align: 'center' });
  }
}
