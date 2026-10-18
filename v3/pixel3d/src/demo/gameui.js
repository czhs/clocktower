// The demo's GAME UI from the pixel3d UI asset library (owner: ui; docs/DEMO.md §4.7; the library: docs/UI.md,
// src/ui/<group>/**). Driven by the demo's REAL interactions (the player, the NPCs, the store, the clock), not by the
// mock-HUD scripts (scenes/ui-hud.js drives the same groups with canned moments; it is not imported here).
//
//   createGameUI(demo) -> gameui = { L, toast(text, {kind, ms}), tip(text, secs), info(), update(t, dt), dispose(), ... }
//
// Tiers (docs/UI.md §2.2) through ONE src/ui/layer.js createUILayers (pass 'ui-world' 300 + the screen overlay):
//   A   name labels (you: gold chevron), talk glyph + speech bubbles (NPC talk emotes), emote pops, the pointing finger
//       + its marching trail, person pins over a name (markers / indicators / emotes art)
//   Ag  the ping under a pointed-at character, the "you are here" ring
//   W-ish depth-tested: place pins (markers pinPass, order 301), the held reading book (notebook draw.js pass 302); the
//       'big' style is a REAL 3D book in the scene (notebook book3d.js), as the mock HUD's bookStyle 'big'
//   talk outline (indicators talkOutline.js pass 290) round whoever is talking
//   S   the HUD (hud art): clock chip (town clock + phase), phase chip, toolbar (notebook / panel / keys), toasts,
//       door prompts, the key tip; the social dock + portrait button + armed pill + radial pie (emotes art); avatars
//       from the portraits atlas (out/ui/portraits.*)
// Interactions (pointer listeners in the CAPTURE phase on window, so a click the UI uses never reaches the player's
// click-to-walk on the canvas; v2 social controls, src/ui/emotes/art.js TIMING):
//   right-click (press + release < RIGHT_HOLD_MS, < RIGHT_DRAG_PX)  point at what is under the cursor: a townsperson
//        (finger + trail at them, ping at their feet) or a spot (ping + mark); the player's character turns to it and
//        plays its 'point' clip; 3.5 s (EMOTE_POINT_MS)
//   right-drag / hold   the radial pie at the press point: Point, 8 pin colours, Remove my pin (over your own pin);
//        release on a wedge commits, release in the dead zone keeps it open (sticky, 8 s, click a wedge)
//   F                   drop a pin of the current colour at the cursor (a person: on their name; else on the ground)
//   dock (bottom right: your portrait in the gold ring; G)  the social palette: Point / Pin (arm, then click), the 8
//        swatches, Clear my pins; left-click your own place pin to remove it
//   J / the toolbar's book   the notebook (notebook.js): while it is open the player's character shows the reading
//        book to the town (the quill while typing); a few NPCs read now and then on a fixed schedule
//   touch               a finger held still LONG_PRESS_MS on the town = the touch pie under it (slide + lift, or lift = sticky
//        + tap); a quick tap still walks; touch wording in the dock / armed pill / tip (coarse pointer or ?touch=1)
// The 3D big books are src/ui/runtime/book3d.js merged books (one mesh per material) at BIG_SCALE; ?bookmerge=0 = A/B.
// Live options (store, panel toggles, ?book= ?pointer=): bookStyle 'held' | 'big', pointerScale 'new' | 'v2'.
// ?gameui=0 turns the whole module off (A/B). Deterministic: every animation is a function of the demo clock.
import * as THREE from 'three';
import { createUILayers } from '../ui/runtime/layer.js';   // the library's layers with dirty-box clears / uploads
import { PixelImage, drawBox, toCanvas, loadImage, frameAt, dissolve, GRID_HZ } from '../ui/kit.js';
import { registerGroupFonts } from '../ui/fonts.js';
import * as IA from '../ui/indicators/art.js';
import { createTalkOutline } from '../ui/indicators/talkOutline.js';
import * as HA from '../ui/hud/art.js';
import * as E from '../ui/emotes/art.js';
import { markerFrames } from '../ui/markers/art.js';
import { markerFramesV2size } from '../ui/markers/v2size.js';
import { drawPoint, drawPlacePin, drawPersonPins, initialIcon, TIMING as MT } from '../ui/markers/draw.js';
import { createPinPass } from '../ui/markers/pinPass.js';
import { notebookContext, PLACE as BOOK_PLACE } from '../ui/notebook/draw.js';
import { installMergedBooks } from '../ui/runtime/book3d.js';   // the 3D big book in <= 8 draws per reader
import { loadPortraits, goldFrame } from '../ui/portraits/atlas.js';
import { formatClock } from './api.js';
import { createNotebook } from './notebook.js';

// the library's DOM skins (docs/UI.md §5; literal URLs: tools/demo-bundle.sh checks they ship)
const UI_CSS = () => [new URL('../../out/ui/panels.css', import.meta.url).href, new URL('../../out/ui/notebook.css', import.meta.url).href];
const TALK_CLIPS = new Set(['talk', 'whisper']);
const POP_OF = { raise: 'alert', bark: 'alert', wave: 'alert', sniff: 'question', vote: 'alert' };
// NPC chatter while they play a talk clip (speech bubbles; deterministic: slot + how many times it talked)
const LINES = ['Did you hear the bell?', 'Who was out after dark?', 'Keep your door latched tonight.', 'I saw a light in the mill.',
  'The clock struck thirteen again.', 'Vote with your head.', 'Someone left the well open.', 'The crows are restless.'];
// NPC readers: slot k reads for READ_S seconds every READ_EVERY seconds, from READ_AT + k * READ_STEP (demo time)
const READ_EVERY = 31, READ_S = 7, READ_AT = 6, READ_STEP = 11;
const VISUAL_TOP = { storyteller: 1.55 };
// the 3D big book's model scale (book3d.js PLACE3D.scale 1 = about a third of a reader's height; critic: "only
// moderately big" next to the brief's "a big book that unfolds up front"): 1.3x
const BIG_SCALE = 1.3;
const MAX_PINS = E.TIMING.MAX_PINS_PER_MEMBER;
const gfr = (s) => Math.floor(s * GRID_HZ + 0.01);
// touch: a long press on the town opens the pie (emotes art TIMING.LONG_PRESS_MS, the v2 touch timing); a finger that
// moves further than TOUCH_SLOP_PX first is a pan / a tap, not a press
const TOUCH_SLOP_PX = 10;
const coarsePointer = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };

/** A 12x12 pin-socket icon from a 24x24 roster thumb (a whole-body portrait): the figure's bounding square box-filtered
 *  down to 12 px, alpha cut at 40 % so the edges stay hard (pixel art). Deterministic. */
export function thumbIcon(th) {
  const out = new PixelImage(12, 12), bb = th.bbox?.();
  if (!bb) return out;
  let s = Math.max(bb.w, bb.h); s += s & 1;
  const ox = bb.x + Math.floor(bb.w / 2) - s / 2, oy = bb.y + Math.floor(bb.h / 2) - s / 2, k = s / 12;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(y * k); sy < Math.ceil((y + 1) * k); sy++) for (let sx = Math.floor(x * k); sx < Math.ceil((x + 1) * k); sx++) {
      const c = th.get(ox + sx, oy + sy); n++;
      if (!c[3]) continue;
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    if (!n || a / n < 0.4 * 255) continue;
    out.set(x, y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), 255]);
  }
  return out;
}

function ensureCss() {
  for (const href of UI_CSS()) {
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.gameui = '1';
    // the demo's own sheet keeps the last word (its overrides scope the library skin to the demo's panels)
    const own = [...document.querySelectorAll('link[rel=stylesheet]')].find((x) => /\/src\/demo\/ui\.css/.test(x.href));
    if (own) own.before(l); else document.head.append(l);
  }
}

export async function createGameUI(demo) {
  const { engine, store, events, input, params } = demo;
  if (params.get('gameui') === '0') return null;
  ensureCss();
  // the DOM skins' integer UI scale = the render's pixel scale (1 texel = --px CSS px; panels.css / notebook.css)
  const setPx = () => document.documentElement.style.setProperty('--px', String(Math.max(1, Math.round(engine.pixelScale || 2))));
  setPx();
  addEventListener('resize', setPx);
  await registerGroupFonts();
  const canvas = engine.renderer.domElement;
  const todOf = (p) => (p === 'night' ? 'night' : p === 'golden' || p === 'dusk' || p === 'dawn' ? 'golden' : 'noon');
  const presetName = () => { const p = demo.time?.preset; return (p && (p.name ?? p)) || demo.town?.tod || 'noon'; };
  const L = createUILayers(engine, { tod: todOf(presetName()), timeFn: (t) => t });
  // the context the library's runtime modules read (the subset of scenes/ui-hud.js buildHudStage they use)
  const hud = {
    engine, ui: L, P: (k, d) => params.get(k) ?? d, clock: (t) => t,
    get tod() { return todOf(presetName()); }, get tok() { return L.tok; },
    uiOptions: { bookStyle: store.state.bookStyle, pointerScale: store.state.pointerScale },
    setUiOptions(o = {}) { Object.assign(hud.uiOptions, o); },
  };
  const offs = [];
  offs.push(events.on('tod', (e) => L.setTod(todOf(e?.preset?.name ?? e?.preset ?? presetName()))));
  offs.push(store.on('bookStyle', ({ value }) => hud.setUiOptions({ bookStyle: value })));
  offs.push(store.on('pointerScale', ({ value }) => hud.setUiOptions({ pointerScale: value })));
  // a touch screen (coarse pointer; ?touch=1 / 0 forces it): touch wording in the dock, the armed pill and the tip
  const touchUI = params.get('touch') === '1' || (params.get('touch') !== '0' && coarsePointer());
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('rm') === '1'; } catch { return false; } })();

  // ---- portraits (out/ui/portraits.*: 12x12 icons for pins, 24x24 avatars for the dock button and the notebook)
  let PORT = null;
  const portraitsReady = loadPortraits('out/ui/').then((p) => { PORT = p; return p; }).catch((e) => { console.warn('[demo] gameui: no portraits atlas', e?.message || e); return null; });
  const thumbs = new Map();                 // id -> PixelImage 24x24 from the roster thumbs (characters without atlas art)
  const avatarImg = (id) => PORT?.avatar(id) ?? thumbs.get(id) ?? null;
  const urlCache = new Map();
  const avatarURL = (id) => {
    if (urlCache.has(id)) return urlCache.get(id);
    const a = PORT?.avatar(id);
    const u = a ? toCanvas(a).toDataURL('image/png') : (demo.characters ?? []).find((c) => c.id === id)?.thumb ?? null;
    if (a) urlCache.set(id, u);
    return u;
  };
  const iconCache = new Map();
  const iconOf = (id, name) => {
    const ic = PORT?.icon(id);
    if (ic) return { icon: ic, iconKey: `p:${id}` };
    // no icon_<id> in the atlas (the shipped four): the roster thumb (the same portrait the dock button shows), fitted
    // into 12x12; the initial only while the thumb has not loaded / for a character without one
    const th = thumbs.get(id);
    if (th) { const tk = `t:${id}`; if (!iconCache.has(tk)) iconCache.set(tk, thumbIcon(th)); return { icon: iconCache.get(tk), iconKey: tk }; }
    const k = `${String(name || id)[0].toUpperCase()}|${L.tok.textInk}`;
    if (!iconCache.has(k)) iconCache.set(k, initialIcon(k[0], L.tok));
    return { icon: iconCache.get(k), iconKey: `i:${k}` };
  };
  (async () => {   // roster thumbs as 24x24 PixelImages (the shipped four have no atlas portrait yet)
    for (const c of demo.characters ?? []) {
      if (!c?.thumb || thumbs.has(c.id)) continue;
      try { const im = await loadImage(c.thumb); thumbs.set(c.id, im.w === 24 && im.h === 24 ? im : null); } catch { /* none */ }
    }
  })();

  // ---- members: you + the NPCs, rebuilt every frame from the live modules (no allocation beyond the vectors)
  const groundApi = demo.town?.registry?.get?.('ground')?.api;
  const groundY = (x, z) => (typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0);
  const mkMember = () => ({ id: '', name: '', pos: new THREE.Vector3(), height: 1.3, top: 1.3, face: 0, you: false, ghost: false, slot: -1, clip: 'idle', handle: null,
    head() { return this.pos.clone().setY(this.pos.y + this.top + 0.1); }, feet() { return this.pos.clone(); } });
  const you = Object.assign(mkMember(), { you: true });
  const npcMembers = [];
  let members = [];
  const syncMembers = () => {
    const P = demo.player, h = P?.handle;
    members = [];
    if (P && h) {
      const room = P.interior;
      you.id = h.id; you.name = h.name ?? h.id; you.handle = h; you.height = h.height ?? 1.3;
      you.top = Math.min(VISUAL_TOP[h.id] ?? you.height, you.height);
      you.pos.set(P.position.x, room ? room.floorY ?? 0 : groundY(P.position.x, P.position.z), P.position.z);
      you.face = P.facing; you.clip = h.ch?.state?.clip ?? 'idle';
      members.push(you);
    }
    const list = demo.npcs?.members;
    if (!list || P?.interior) return;
    let i = 0;
    for (const n of list) {
      if (!n?.handle) continue;
      const m = npcMembers[i] ?? (npcMembers[i] = mkMember());
      i++;
      m.id = n.id; m.name = n.handle.name ?? n.id; m.slot = n.slot; m.handle = n.handle; m.height = n.handle.height ?? 1.3;
      m.top = Math.min(VISUAL_TOP[n.id] ?? m.height, m.height);
      m.pos.set(n.spot.x, groundY(n.spot.x, n.spot.z), n.spot.z); m.face = n.face; m.clip = n.handle.ch?.state?.clip ?? 'idle';
      members.push(m);
    }
  };
  const npcOf = (slot) => members.find((m) => !m.you && m.slot === slot) ?? null;

  // ---- screen helpers
  const W = () => L.screen?.w ?? engine.lowW, H = () => L.screen?.h ?? engine.lowH;
  /** client px -> screen-tier texel (the overlay maps the canvas bottom-up in whole pixelScale squares). */
  const toScreen = (cx, cy) => {
    const r = canvas.getBoundingClientRect(), s = engine.pixelScale || 1;
    const dx = (cx - r.left) * (engine.width / Math.max(1, r.width)), dy = (cy - r.top) * (engine.height / Math.max(1, r.height));
    return { x: Math.floor(dx / s), y: H() - 1 - Math.floor((engine.height - dy - 0.5) / s) };
  };
  const inRect = (p, r) => r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
  // what the DOM covers of the canvas (screen texels): the panel on the right half = a right band (the HUD's visible
  // area ends there); a panel spanning the left half too but short (the auto-folded panel header on a phone, < 40 % of
  // the height) = a TOP band: the clock / phase chips, the toolbar and the toasts drop below it, so they stay visible
  // and a tap on them reaches the canvas, not the panel; the open notebook on the left half = a left band
  let cover = { left: 0, right: 0, top: 0 }, nextCover = 0;
  const measureCover = () => {
    const c = canvas.getBoundingClientRect(), k = (engine.width / Math.max(1, c.width)) / (engine.pixelScale || 1);
    let right = 0, left = 0, top = 0;
    const panel = document.querySelector('#demo-ui > .dui-panel');
    if (panel && store.state.ui && panel.style.display !== 'none') {
      const p = panel.getBoundingClientRect();
      if (p.width > 0 && p.height > 0 && p.left < c.right && p.top < c.bottom) {
        if (p.left > c.left + c.width / 2) right = Math.ceil((c.right - p.left) * k);
        else if (p.bottom - c.top < c.height * 0.4) top = Math.max(0, Math.ceil((p.bottom - c.top) * k) + 1);
      }
    }
    if (nb?.isOpen) { const p = nb.el.getBoundingClientRect(); if (p.width > 0 && p.right < c.left + c.width / 2) left = Math.ceil((p.right - c.left) * k) + 2; }
    cover = { left, right: Math.min(right, Math.floor(W() * 0.6)), top: Math.min(top, Math.floor(H() * 0.4)) };
  };

  // ---- labels + the stack above a name (v2 order: label < bubble < pins < pop)
  const labelTopOf = (m) => L.at(m.head()).y + IA.LABEL_DY;            // the label box top (cap top - 1)
  const visible = (m) => { const f = L.at(m.pos); return f.x > -40 && f.y > -20 && f.x < (L.world?.w ?? engine.lowW) + 40 && f.y < (L.world?.h ?? engine.lowH) + 60; };

  // ---- toasts (hud art, the v2 toast column; kinds info / death / error / game_over), hints
  const toasts = [];
  let toastId = 0;
  const toast = (text, { kind = 'info', ms = null } = {}) => {
    const it = { id: ++toastId, text: String(text), kind, at: L.t, ms: ms ?? Math.min(HA.TIMING.toastMs(kind, String(text)), 6000), gone: false };
    toasts.unshift(it);
    while (toasts.length > 5) toasts.pop();
    return { id: it.id, get isConnected() { return !it.gone && toasts.includes(it); }, classList: { add() {}, contains: () => false }, dismiss() { it.ms = Math.max(0, (L.t - it.at) * 1000); }, remove() { it.gone = true; } };
  };
  let tipState = null;   // { text tokens, at, until }
  const tip = (tokens, secs = 9) => {
    const st = { tokens, at: L.t, until: L.t + secs };
    tipState = st;
    return { get isConnected() { return tipState === st && L.t < st.until; }, classList: { add() {}, contains: () => false }, dismiss() { st.until = Math.min(st.until, L.t); }, remove() { st.until = L.t; } };
  };

  // ---- point (markers), pins, pops
  let point = null;          // { t0, target: {kind:'person', slot, id} | {kind:'place', p: Vector3} }
  const pins = [];           // mine: { kind:'place', p, color, t0, removeAt } | { kind:'person', slot, id, color, t0, removeAt }
  const pops = [];           // { who: 'you' | slot, kind, color, t0 }
  let color = 'crimson';
  const livePins = () => pins.filter((p) => p.removeAt == null);
  // a new pop from the same person replaces theirs (one pop per head, as v2's bubbles)
  const pop = (who, kind, c = 'gold') => { for (let i = pops.length - 1; i >= 0; i--) if (pops[i].who === who) pops.splice(i, 1); pops.push({ who, kind, color: c, t0: L.t }); if (pops.length > 12) pops.shift(); };
  const framesNow = () => (hud.uiOptions.pointerScale === 'v2' ? markerFramesV2size(L.tok) : markerFrames(L.tok));
  const youPointing = () => point && L.t - point.t0 < MT.EMOTE_POINT_MS / 1000;
  function doPoint(target) {
    if (!target || !demo.player) return false;
    const p = target.member ? target.member.pos : target.ground;
    if (!p) return false;
    point = { t0: L.t, target: target.member ? { kind: 'person', slot: target.member.slot, id: target.member.id } : { kind: 'place', p: p.clone() } };
    demo.player.faceTo?.(p.x, p.z);
    const h = demo.player.handle;
    if (h?.emotes?.point && h.spec?.clips?.[h.emotes.point]) h.play(h.emotes.point);
    events.emit('gameui:point', { kind: point.target.kind, at: [+p.x.toFixed(2), +p.z.toFixed(2)] });
    return true;
  }
  function dropPin(target, c = color) {
    if (!target) return false;
    if (livePins().length >= MAX_PINS) { toast(`You have ${MAX_PINS} pins: remove one first`, { kind: 'error', ms: 2600 }); return false; }
    if (target.member && !target.member.you) pins.push({ kind: 'person', slot: target.member.slot, id: target.member.id, color: c, t0: L.t, removeAt: null });
    else if (target.ground) pins.push({ kind: 'place', p: target.ground.clone(), color: c, t0: L.t, removeAt: null });
    else return false;
    pop('you', 'pin', c);
    events.emit('gameui:pin', { color: c, kind: pins[pins.length - 1].kind });
    return true;
  }
  const removePin = (pin) => { if (pin && pin.removeAt == null) { pin.removeAt = L.t - pin.t0; events.emit('gameui:unpin', { color: pin.color }); return true; } return false; };
  const clearPins = () => { let n = 0; for (const p of pins) if (removePin(p)) n++; return n; };
  // a place pin of mine under a screen point (the pin body: 18 x 26 above its spot)
  const pinAt = (s) => {
    for (let i = pins.length - 1; i >= 0; i--) {
      const p = pins[i];
      if (p.kind !== 'place' || p.removeAt != null) continue;
      const q = L.atScreen(p.p);
      if (s.x >= q.x - 9 && s.x <= q.x + 9 && s.y >= q.y - 26 && s.y <= q.y + 1) return p;
    }
    return null;
  };
  // a townsperson under a screen point (their projected body box)
  const memberAt = (s) => {
    let best = null, bd = Infinity;
    for (const m of members) {
      const f = L.atScreen(m.pos), hd = L.atScreen(m.head());
      if (s.x < f.x - 9 || s.x > f.x + 9 || s.y < hd.y - 3 || s.y > f.y + 2) continue;
      const d = Math.abs(s.x - f.x) + (m.you ? 4 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };
  /** What is under the cursor: { s (screen texel), member, ownPin, ground (Vector3) }. */
  function targetAt(clientX, clientY) {
    const s = toScreen(clientX, clientY);
    const member = memberAt(s), ownPin = pinAt(s);
    let ground = null;
    try {
      const g = demo.player?.pickAt?.(clientX, clientY)?.ground;
      if (g) ground = new THREE.Vector3(g.x, demo.player?.interior ? demo.player.interior.floorY ?? 0 : groundY(g.x, g.z), g.z);
    } catch { ground = null; }
    return { s, member: member && !member.you ? member : null, onYou: member?.you ?? false, ownPin, ground };
  }

  // ---- the radial pie (emotes art; screen tier, at the press point)
  let rpress = null;         // { cx, cy, t0 (ms), target, touch: pointerId | undefined (a finger: the long press) }
  let pie = null;            // { cx, cy, press: {dx, dy}, items, off, target, tOpen0, hot, sticky, stickyAt, commit: {i, t0}, cancel: t0 }
  const pieG = (p) => E.PIE[p?.input === 'touch' ? 'touch' : 'mouse'];   // wedge geometry of the pie size (touch: bigger)
  function openPie() {
    if (!rpress) return;
    const input = rpress.touch != null ? 'touch' : 'mouse', t = rpress.target, R = E.PIE[input].R;
    const cx = Math.max(R + 4, Math.min(W() - R - 4, t.s.x)), cy = Math.max(R + 4 + 20 + cover.top, Math.min(H() - R - 4, t.s.y));
    const items = E.pieItems({ name: t.member?.name ?? null, removable: t.ownPin ? { mine: true } : null });
    const full = livePins().length >= MAX_PINS;
    const off = new Set(full ? items.map((it, i) => (it.kind === 'pin' ? i : -1)).filter((i) => i >= 0) : []);
    pie = { cx, cy, input, press: { dx: t.s.x - cx, dy: t.s.y - cy }, items, off, target: t, tOpen0: L.t, hot: null, sticky: false, stickyAt: null, commit: null, cancel: null };
    events.emit('gameui:pie', { open: true, input, items: items.map((x) => x.key) });
  }
  const wedgeAt = (s) => {
    if (!pie) return null;
    const G = pieG(pie), dx = s.x - pie.cx, dy = s.y - pie.cy, d = Math.hypot(dx, dy), n = pie.items.length;
    if (d < G.dead || d > G.R + 26) return null;
    let rel = Math.atan2(dy, dx) + Math.PI / 2;
    rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const i = Math.round(rel / ((2 * Math.PI) / n)) % n;
    return pie.off.has(i) ? null : i;
  };
  function commitPie(i) {
    if (!pie || pie.commit) return;
    const it = pie.items[i];
    pie.commit = { i, t0: L.t }; pie.hot = i;
    const t = pie.target;
    if (it.kind === 'point') doPoint(t);
    else if (it.kind === 'pin') { color = it.color; dropPin(t, it.color); }
    else if (it.kind === 'unpin') removePin(t.ownPin);
    events.emit('gameui:pie', { open: false, commit: it.key });
  }
  const cancelPie = () => { if (pie && !pie.commit && pie.cancel == null) { pie.cancel = L.t; events.emit('gameui:pie', { open: false, cancel: true }); } };

  // ---- dock (social palette), toolbar, armed mode
  let dockOpen = false, armed = null, hover = null;   // armed: 'point' | 'pin'
  const R = {};                                       // hit rects (screen texels) from the last frame
  let cursor = null;                                  // last pointer {clientX, clientY, s} over the canvas
  const consumeUp = new Set();

  // ---- the notebook (DOM) + the readers
  const nb = createNotebook(demo, {
    avatarURL,
    people: () => members.map((m) => ({ key: m.you ? 'you' : `npc${m.slot}`, id: m.id, name: m.name, you: m.you })),
  });
  // the 3D books as one mesh per material (src/ui/runtime/book3d.js; book3d.js draws ~25 meshes x 3 passes per open book)
  // (?bookmerge=0: the library's own per-part books, for A/B)
  if (params.get('bookmerge') !== '0') installMergedBooks(hud, { yaw: () => Math.atan2(-engine.camera.right.z, engine.camera.right.x), visualH: BOOK_PLACE.visualH });
  const N = notebookContext(hud);
  const npcRead = (slot, t) => {
    const off = READ_AT + slot * READ_STEP, k = Math.floor((t - off) / READ_EVERY);
    if (k < 0) return null;
    const openAt = off + k * READ_EVERY;
    return { openAt, closeAt: openAt + READ_S, seed: 3 + slot * 5 };
  };
  let warm = 3;              // the first frames (the boot warm-up) compile the 3D book's program behind the loading screen
  let merged = false;        // every 3D book drawing merged (once, in the warm-up)
  const readers = [];        // last frame's readers (info)
  N.add((P) => {
    if (!L.enabled && !warm) return;
    const t = P.t;
    if (warm > 0 && you.id) {
      if (!merged && P.book3d) { merged = true; N.book3d?.prewarm?.(BIG_SCALE); }
      // warm-up: the big 3D book and the held book once (the 3D book's materials stay cached and the held frames are
      // built, so the first real open compiles / builds nothing)
      N.drawReader(P, you, { openAt: t - 5, bookStyle: P.book3d ? 'big' : 'held', scale: BIG_SCALE });
      if (P.book3d) for (const m of members) if (!m.you) N.drawReader(P, m, { openAt: t - 5, bookStyle: 'big', scale: BIG_SCALE });   // the NPC readers' books too
      return;
    }
    // the view that draws the current style records the readers (info)
    const rec = !P.bigOnly && (N.styleOf() === 'big') === !!P.book3d;
    if (rec) readers.length = 0;
    if (you.id && nb.openAt !== null) {
      const closeAt = nb.isOpen ? Infinity : nb.closeAt;
      const s = N.drawReader(P, you, { openAt: nb.openAt, closeAt, typing: nb.isOpen && nb.typing(t), seed: 0, still: reduced, scale: BIG_SCALE });
      if (s && rec) readers.push({ who: 'you', phase: s.phase, f: s.f, style: N.styleOf() });
    }
    for (const m of members) {
      if (m.you) continue;
      const r = npcRead(m.slot, t);
      if (!r || t >= r.closeAt + 1) continue;
      const s = N.drawReader(P, m, { ...r, still: reduced, scale: BIG_SCALE });
      if (s && rec) readers.push({ who: m.slot, phase: s.phase, f: s.f, style: N.styleOf() });
    }
  });

  // ---- talk outline (indicators) + talk / bubble state per member
  const talk = new Map();    // key -> { clip, since, count, line, bubbleAt }
  const keyOf = (m) => (m.you ? 'you' : `npc${m.slot}`);
  const talkers = [];
  const talkPass = createTalkOutline(engine, () => (L.enabled ? talkers : [])).pass;
  const T0 = () => L.tok;

  // ------------------------------------------------------------------------------------------------ drawing
  const cache = new Map();
  const cached = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 400) cache.delete(cache.keys().next().value); } return v; };
  /** (perf) blit a cached sprite straight into the layer's bytes (PixelImage.blit allocates per pixel); opaque texels
   *  replace, partial alpha (glows) composites through set(); grows the runtime layer's dirty box. */
  const fastBlit = (dst, src, x, y) => {
    x |= 0; y |= 0;
    const W = dst.w, H = dst.h, sw = src.w, sd = src.data, dd = dst.data;
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(H, y + src.h);
    if (x1 <= x0 || y1 <= y0) return;
    for (let yy = y0; yy < y1; yy++) {
      let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
      for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
        const a = sd[si + 3];
        if (!a) continue;
        if (a === 255 || !dd[di + 3]) { dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = a; }
        else dst.set(xx, yy, [sd[si], sd[si + 1], sd[si + 2], a]);
      }
    }
    dst.mark?.(x0, y0, x1 - 1, y1 - 1);
  };
  /** A HUD piece drawn once per key: fn(img, ox, oy) into a w x h image; cropped to what it drew ({im, dx, dy}). */
  const piece = (key, w, h, fn) => cached(key, () => {
    const im = new PixelImage(w, h), r = fn(im) ?? null, bb = im.bbox();
    return bb ? { im: im.crop(bb.x, bb.y, bb.w, bb.h), dx: bb.x, dy: bb.y, r } : { im: new PixelImage(1, 1), dx: 0, dy: 0, r };
  });
  const bubbleEnv = (t, born, until) => {
    if (t < born || t >= until) return null;
    const a = gfr(t - born), out = until - IA.SPEECH.fadeOutMs / 1000;
    if (t < out) return { dissolve: 0, pop: a < 2 };
    const b = Math.min(2, Math.floor(gfr(t - out) / 6));
    return { dissolve: [0.25, 0.5, 0.75][b], pop: false };
  };

  // tier A + Ag: labels, glyphs, chevron, ring, bubbles, pops (z 20 / 35); the point + person pins (z 15 trail / 30)
  L.add((LL) => {
    const T = LL.tok, t = LL.t;
    for (const m of members) {
      m._shown = false;
      // whole character above the view: no label (the indicators' rule); labels near the top edge clamp inward
      if (!visible(m) || LL.at(m.pos).y < LL.MARGIN) continue;
      m._shown = true;
      const p = LL.at(m.head()), top = Math.max(LL.MARGIN + 2 + (m.you ? 8 : 0), p.y + IA.LABEL_DY);
      // the "you are here" ring, except while your big 3D book stands in front of you (it would print over the pages:
      // L.ground keeps only CHARACTER texels, the book is a prop)
      if (m.you && !(hud.uiOptions.bookStyle === 'big' && readers.some((r) => r.who === 'you'))) {
        const f = LL.at(m.pos), k = reduced ? 0 : frameAt(t, 2.5, 4);
        fastBlit(LL.ground, cached(`ring${k}${T.gold}`, () => IA.youRing(k, T)), f.x - 16, f.y - 8);
      }
      // the name label (indicators art), drawn once per name + token set: drawText at (cx, top) = this crop at (cx + dx, top - 1 + dy)
      const lab = piece(`lab${m.name}${T.labelText}${T.labelLine}`, 160, 12, (im) => IA.label(im, 80, 1, m.name, 'player', T));
      const lx = p.x - 80 + lab.dx, ly = top - 1 + lab.dy;
      fastBlit(LL.world, lab.im, lx, ly);
      const tk = talk.get(keyOf(m));
      if (tk?.on) {
        const step = reduced ? 0 : IA.talkStep(t), kind = m.you ? 'self' : 'talk';
        fastBlit(LL.world, cached(`g${kind}${step}${T.labelLine}`, () => IA.talkGlyph(step, kind, T)), lx + lab.im.w + 1, top - 1);
      }
      if (m.you) fastBlit(LL.world, cached(`chev${T.gold}`, () => IA.youChevron(T)), p.x - 4, top - 8 - (reduced ? 0 : frameAt(t, 2, 2)));
      m._labelTop = top - (m.you ? 8 : 0);
      m._stack = m._labelTop - 1;
    }
    // speech bubbles (NPC talk lines), tail tip 1 px above the label
    for (const m of members) {
      const tk = talk.get(keyOf(m));
      if (!tk?.line || !m._shown) continue;
      const env = bubbleEnv(t, tk.bubbleAt, tk.bubbleUntil);
      if (!env) continue;
      const lines = cached(`lines${tk.line}`, () => IA.bubbleLines(tk.line)), sz = IA.bubbleSize(lines);
      const x = LL.at(m.head()).x, bottom = m._stack - 1;
      let left = x - Math.floor(sz.w / 2);
      left = Math.max(LL.MARGIN + 2, Math.min(LL.world.w - LL.MARGIN - 2 - sz.w, left));
      const tailX = Math.max(5, Math.min(sz.w - 5, x - left));
      let im = env.pop ? IA.bubblePop(lines, tailX, T) : cached(`bub${tk.line}${tailX}${T.bubble}`, () => IA.bubble(lines, tailX, T));
      const topY = Math.max(LL.MARGIN + 1, bottom - sz.h - IA.BUBBLE_TAIL_H);   // near the top edge: kept in view
      if (env.dissolve > 0) im = dissolve(im.clone(), env.dissolve, left & 3, topY & 3);
      fastBlit(LL.world, im, left, topY);
      m._stack = topY - 1;
    }
  }, 20);
  // the point emote (finger + trail + ping) and person pins: markers draw.js in its phases (trail z 15, main z 30)
  const pointDraw = (LL) => {
    const F = framesNow(), t = LL.t;
    if (point) {
      const age = t - point.t0;
      if (age >= MT.EMOTE_POINT_MS / 1000) point = null;
      else if (you.id && visible(you)) {
        const head = LL.at(you.pos.clone().setY(you.pos.y + you.height * 0.72));
        if (point.target.kind === 'person') {
          const m = npcOf(point.target.slot);
          if (m && m.id === point.target.id) drawPoint(LL, F, { head, aim: LL.at(m.pos.clone().setY(m.pos.y + m.height * 0.4)), spot: LL.at(m.pos), person: true, age, still: reduced });
        } else drawPoint(LL, F, { head, aim: LL.at(point.target.p), spot: LL.at(point.target.p), person: false, age, still: reduced });
      }
    }
    if (LL.phase !== 'main') return;
    // person pins over their names (mine), fanned
    for (const m of members) {
      if (m.you || !m._shown) continue;
      const list = pins.filter((p) => p.kind === 'person' && p.slot === m.slot && p.id === m.id);
      if (!list.length) continue;
      const icon = iconOf(you.id, you.name);
      drawPersonPins(LL, F, { cx: LL.at(m.head()).x, labelTop: m._stack + 1, t, still: reduced,
        pins: list.map((p) => ({ color: p.color, ...icon, age: t - p.t0, removeAt: p.removeAt })) });
      m._stack -= 28;
    }
    // emote pops (stacked over the name / bubble / pins)
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i], ps = E.popState(t, q.t0, { reduced });
      if (ps.f < 0) { if (t > q.t0 + 1) pops.splice(i, 1); continue; }
      const m = q.who === 'you' ? (you.id ? you : null) : npcOf(q.who);
      if (!m || !m._shown) continue;
      const x = LL.at(m.pos).x, top = m._stack ?? (LL.at(m.head()).y - 12);
      fastBlit(LL.world, E.popFrame(q.kind, ps.f, LL.tok, q.color || 'gold'), x - E.POP.anchor.x, top - 1 - E.POP.anchor.y - ps.bob);
    }
  };
  L.add((LL) => pointDraw(Object.assign(Object.create(LL), { phase: 'trail' })), 15);
  L.add((LL) => pointDraw(Object.assign(Object.create(LL), { phase: 'main' })), 30);
  // place pins: depth-tested (markers pinPass, order 301): whoever stands in front hides them
  const pinPass = createPinPass(engine, L, { timeFn: (t) => t });
  pinPass.add((P) => {
    const F = framesNow(), t = P.t;
    const icon = iconOf(you.id, you.name);
    for (const p of pins) {
      if (p.kind !== 'place') continue;
      const q = P.at(p.p);
      drawPlacePin(P, F, { spot: { x: q.x, y: q.y, d: P.depthOf(p.p) }, color: p.color, ...icon, age: t - p.t0, removeAt: p.removeAt,
        hover: hover?.kind === 'pin' && hover.pin === p, still: reduced });
    }
  });
  // the hovered own pin's tooltip (emotes art) above everything anchored
  L.add((LL) => {
    if (hover?.kind !== 'pin' || hover.pin.removeAt != null) return;
    const q = LL.at(hover.pin.p);
    E.drawPinTip(LL.world, q.x, q.y - 28, 'Your pin · click to remove', LL.tok, { removable: true });
  }, 36);

  // tier S: the HUD
  const shot = { chip: null, chipKey: '', phase: null, phaseKey: '' };
  const STAGE = { day: 'discussion', nomination: 'nominations', vote: 'nominations', execution: 'nominations', night: 'bedtime' };
  const LABEL = { nomination: 'Nominations', vote: 'The vote', execution: 'Execution', night: 'Night' };
  const PHASE = { day: ['day', false], nomination: ['day', true], vote: ['day', true], execution: ['bedtime', false], night: ['night', false] };
  const probe = (w, h, fn) => { const im = new PixelImage(w, h); const r = fn(im); return { im, r }; };
  const toolbar = [{ k: 'notebook', g: (T) => HA.GLYPH.notebook(T), title: 'Notebook (J)' }, { k: 'panel', g: (T) => HA.GLYPH.gear(T), title: 'controls (`)' }, { k: 'help', g: (T) => HA.GLYPH.help(T), title: 'keys (H)' }];
  L.add((LL) => {
    const img = LL.screen, T = LL.tok, t = LL.t, s = store.state;
    if (!img) return;
    const x0 = 4 + cover.left, x1 = img.w - 4 - cover.right, cx = Math.floor((x0 + x1) / 2), y0 = cover.top;
    // clock chip: the town clock (time + stage of the day / the ceremony) and the phase chip beside it
    const hours = Number.isFinite(demo.time?.hours) ? demo.time.hours : s.timeOfDay;
    const day = hours >= 6 && hours < 20, len = day ? 14 : 10, into = day ? hours - 6 : (hours - 20 + 24) % 24;
    const o = { stage: STAGE[s.phase] ?? 'discussion', label: LABEL[s.phase] ?? presetName(), time: formatClock(hours), frac: Math.max(0, Math.min(1, 1 - into / len)),
      paused: s.paused || !s.timeSpeed, plus: null, reduced };
    const ck = `${o.stage}|${o.label}|${o.time}|${o.frac.toFixed(2)}|${o.paused}|${T.ink}`;
    if (ck !== shot.chipKey) {
      const w = HA.clockChipWidth(o);
      shot.chip = probe(w + 4, 19, (im) => HA.drawClockChip(im, 2, 2, T, { ...o, t })).im; shot.chipKey = ck;
    }
    fastBlit(img, shot.chip, x0 - 2, y0 + 2);
    const [ph, gathered] = PHASE[s.phase] ?? ['day', false];
    const pk = `${ph}|${gathered}|${T.ink}`;
    if (pk !== shot.phaseKey) {
      const tmp = new PixelImage(120, 13), r = HA.drawPhaseChip(tmp, 118, 1, T, { phase: ph, day: 1, gathered, t });
      shot.phase = tmp.crop(r.x, 0, r.w + 1, 13); shot.phaseKey = pk;
    }
    fastBlit(img, shot.phase, x0 + shot.chip.w - 2, y0 + 4 + 1);
    // toolbar (right of the visible area): notebook / control panel / keys; each button drawn once per state
    let bx = x1;
    R.toolbar = {};
    for (let i = toolbar.length - 1; i >= 0; i--) {
      const b = toolbar[i], w = 15;
      bx -= w;
      const on = (b.k === 'notebook' && nb.isOpen) || (b.k === 'panel' && s.ui);
      const st = on ? 'pressed' : hover?.kind === 'tool' && hover.k === b.k ? 'hover' : 'raised';
      const btn = cached(`tool${b.k}${st}${T.ink}`, () => {
        const im = new PixelImage(w, 15);
        drawBox(im, 0, 0, w, 15, st, T);
        const g = b.g(T), q = st === 'pressed' ? 1 : 0;
        im.blit(g, Math.floor((w - g.w) / 2) + q, Math.floor((15 - g.h) / 2) + q);
        return im;
      });
      fastBlit(img, btn, bx, y0 + 4);
      R.toolbar[b.k] = { x: bx, y: y0 + 4, w, h: 15 };
      bx -= 2;
    }
    // toasts (newest on top), right-aligned under the toolbar
    let ty = y0 + 24;
    const tw = Math.min(150, x1 - x0 - 8);
    for (const it of toasts) {
      const age = HA.sgf(t - it.at), endF = Math.round(it.ms / 1000 * GRID_HZ), left = age - endF;
      if (it.gone || left >= 6) continue;
      const hh = HA.toastHeight(it.text, tw, it.kind), bw = HA.toastWidth(it.text, tw, it.kind), tx = x1 - bw;
      const full = cached(`toast${it.kind}${bw}${T.ink}${it.text}`, () => { const im = new PixelImage(bw + 8, hh + 9); HA.drawToast(im, 4, 4, bw, T, { text: it.text, kind: it.kind, close: false }); return im; });
      if (age >= 1 && left < 0) fastBlit(img, full, tx - 4, ty - 4);             // steady: the cached drawing
      else {                                                                   // pop / dissolve frames (docs/UI.md §2.8)
        const r = HA.envelopeFx(full.clone(), age, left >= 0 ? left : null, { reduced, ox: tx - 4, oy: ty - 4 });
        if (r) fastBlit(img, r.img, tx - 4, ty - 4 + r.dy);
      }
      ty += hh + 3;
    }
    for (let i = toasts.length - 1; i >= 0; i--) { const it = toasts[i]; if (it.gone || HA.sgf(t - it.at) - Math.round(it.ms / 1000 * GRID_HZ) >= 6) toasts.splice(i, 1); }
    // bottom: dock button (your portrait in the gold ring) + the dock / armed pill above it
    const by = img.h - 4 - 24, bxr = x1 - 24;
    const av = you.id ? avatarImg(you.id) : null;
    if (av) fastBlit(img, cached(`gold${you.id}${T.goldLine}`, () => goldFrame(av, T)), bxr, by);
    else drawBox(img, bxr, by, 24, 24, 'sunk', T);
    const dbs = dockOpen ? 'open' : hover?.kind === 'dockbtn' ? 'hover' : 'normal';
    fastBlit(img, cached(`dockbtn${dbs}${color}${T.ink}`, () => E.dockButton(T, { state: dbs, color })), bxr - 1, by - 1);
    R.dockBtn = { x: bxr - 1, y: by - 1, w: 26, h: 26 };
    R.dock = null; R.armedCancel = null;
    if (dockOpen) {
      const dx = x1 - E.DOCK.w, dy = by - 3 - E.DOCK.h;
      const hk = hover?.kind === 'dock' ? hover.k : null, mine = livePins().length;
      const dk = cached(`dock${armed}${color}${mine}${hk}${touchUI}${T.ink}`, () => { const im = new PixelImage(E.DOCK.w + 2, E.DOCK.h + 2); const r = E.drawDock(im, 0, 0, T, { mode: armed ?? 'idle', color, mine, hover: hk, touch: touchUI }); return { im, r }; });
      fastBlit(img, dk.im, dx, dy);
      const parts = {};
      for (const [k, r] of Object.entries(dk.r)) parts[k] = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
      R.dock = { x: dx, y: dy, w: E.DOCK.w, h: E.DOCK.h, parts };
    } else if (armed) {
      const z = E.armedSize(T, { mode: armed, touch: touchUI });
      const r = E.drawArmed(img, x1 - z.w, by - 3 - z.h, T, { mode: armed, touch: touchUI, hover: hover?.kind === 'armedCancel' });
      R.armedCancel = r.cancel;
    }
    // bottom centre: the door prompt, else the tip
    const P = demo.player, d = P?.nearDoor, room = P?.interior;
    const promptY = img.h - 4 - 15 - 26;   // clear of the status line (bottom left) and the dock button
    // (centred pieces: drawn once per text at x 320 of a 640-wide image, then placed by their offset from that centre)
    const prompt = (text, locked = false) => {
      const pc = piece(`prompt${text}${locked}${T.ink}`, 640, 17, (im) => HA.drawPrompt(im, 320, 0, T, { text, locked }));
      fastBlit(img, pc.im, cx - 320 + pc.dx, promptY + pc.dy);
    };
    if (room) prompt(`${room.name ?? 'Inside'} · walk out the door to leave`);
    else if (d) {
      const house = demo.layout?.houses?.find((q) => q.id === d.id);
      if (d.id === 'clocktower') prompt('The clock tower is locked', true);
      else prompt(`Walk in: ${house?.name ?? d.id}`);
    } else if (tipState && t < tipState.until) {
      const mw = Math.min(300, x1 - x0);
      const pc = piece(`tip${mw}${T.ink}${JSON.stringify(tipState.tokens)}`, 640, 60, (im) => HA.drawKeyHint(im, 320, 0, T, { tokens: tipState.tokens, maxW: mw }));
      // its bottom kept above the dock button row (a wrapped tip on a phone ran over the dock and the status line)
      fastBlit(img, pc.im, cx - 320 + pc.dx, Math.min(promptY - 6 + pc.dy, by - 3 - pc.im.h));
    }
    // the pie (above the HUD)
    if (pie) {
      const st = { size: pie.input, input: pie.input, items: pie.items, hot: pie.hot, color, off: pie.off, sticky: pie.sticky, title: pie.target.member ? `${pie.target.member.name}` : 'Point or pin',
        tOpen: t - pie.tOpen0, press: pie.press, reduced };
      if (pie.commit) st.commit = { i: pie.commit.i, t: t - pie.commit.t0 };
      if (pie.cancel != null) st.cancel = t - pie.cancel;
      const drawn = E.drawPie(img, pie.cx, pie.cy, T, st);
      if (!drawn || (pie.cancel != null && t - pie.cancel > 0.3) || (pie.commit && t - pie.commit.t0 > 0.4)) pie = null;
      else if (pie.sticky && !pie.commit && pie.cancel == null && t - pie.stickyAt > E.TIMING.PIE_STICKY_MS / 1000) cancelPie();
    }
  }, 60);

  // ------------------------------------------------------------------------------------------------ input
  const hasControl = () => !!window.__demo?.ready && (!demo.intro || demo.intro.phase === 'done') && !document.body.classList.contains('ct-intro');
  const screenHit = (s) => {
    if (inRect(s, R.dockBtn)) return { kind: 'dockbtn' };
    if (R.dock && inRect(s, R.dock)) {
      for (const [k, r] of Object.entries(R.dock.parts ?? {})) if (inRect(s, r)) return { kind: 'dock', k };
      return { kind: 'dock', k: null };
    }
    if (R.armedCancel && inRect(s, R.armedCancel)) return { kind: 'armedCancel' };
    for (const [k, r] of Object.entries(R.toolbar ?? {})) if (inRect(s, r)) return { kind: 'tool', k };
    return null;
  };
  const eat = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  function onDown(e) {
    if (e.target !== canvas || !hasControl()) return;
    if (document.activeElement && nb.el.contains(document.activeElement)) document.activeElement.blur();
    const s = toScreen(e.clientX, e.clientY);
    if (e.button === 2) {
      eat(e); consumeUp.add(2);
      if (pie && pie.sticky && !pie.commit) { const i = wedgeAt(s); if (i !== null) commitPie(i); else cancelPie(); return; }
      rpress = { cx: e.clientX, cy: e.clientY, t0: performance.now(), target: targetAt(e.clientX, e.clientY) };
      return;
    }
    if (e.button !== 0) return;
    if (pie && !pie.commit && pie.cancel == null) {
      eat(e); consumeUp.add(0);
      const i = wedgeAt(s);
      if (i !== null) commitPie(i); else cancelPie();
      return;
    }
    const hit = screenHit(s);
    if (hit) { eat(e); consumeUp.add(0); uiClick(hit); return; }
    if (armed) {
      eat(e); consumeUp.add(0);
      const tgt = targetAt(e.clientX, e.clientY);
      if (armed === 'point') doPoint(tgt); else dropPin(tgt);
      armed = null;
      return;
    }
    const own = pinAt(s);
    if (own) { eat(e); consumeUp.add(0); removePin(own); return; }
    // a finger on the town: a long press (held still LONG_PRESS_MS, update()) opens the pie under it; the down is NOT
    // eaten (a quick tap still walks there, a drag still pans: player.js / camera.js)
    if (e.pointerType === 'touch' && !rpress) rpress = { cx: e.clientX, cy: e.clientY, t0: performance.now(), target: targetAt(e.clientX, e.clientY), touch: e.pointerId };
  }
  function uiClick(hit) {
    if (hit.kind === 'dockbtn') { dockOpen = !dockOpen; if (!dockOpen) armed = null; }
    else if (hit.kind === 'armedCancel') armed = null;
    else if (hit.kind === 'tool') {
      if (hit.k === 'notebook') nb.toggle();
      else if (hit.k === 'panel') store.set({ ui: !store.state.ui }, 'ui');
      else if (hit.k === 'help') demo.ui?.help?.();
    } else if (hit.kind === 'dock' && hit.k) {
      if (hit.k === 'point' || hit.k === 'pin') { armed = armed === hit.k ? null : hit.k; if (hit.k === 'pin' && livePins().length >= MAX_PINS) armed = null; }
      else if (hit.k.startsWith('swatch:')) color = hit.k.slice(7);
      else if (hit.k === 'clear') { const n = clearPins(); if (n) toast(`Removed ${n} pin${n === 1 ? '' : 's'}`); }
    }
    events.emit('gameui:click', hit);
  }
  function onMove(e) {
    if (e.target === canvas) cursor = { x: e.clientX, y: e.clientY };
    else if (!rpress && !pie) { cursor = null; hover = null; return; }
    const s = toScreen(e.clientX, e.clientY);
    if (rpress && !pie && Math.hypot(e.clientX - rpress.cx, e.clientY - rpress.cy) > (rpress.touch != null ? TOUCH_SLOP_PX : E.TIMING.RIGHT_DRAG_PX)) {
      if (rpress.touch != null) { if (e.pointerId === rpress.touch) rpress = null; }   // the finger moved first: a pan, not a press
      else openPie();
    }
    if (pie && !pie.commit && pie.cancel == null) {
      if (rpress?.touch != null) { if (e.pointerId !== rpress.touch) return; eat(e); }   // the finger slides over the wedges (no pan)
      pie.hot = wedgeAt(s); hover = null; return;
    }
    if (!hasControl()) { hover = null; return; }
    const hit = screenHit(s);
    if (hit) { hover = hit; return; }
    const own = pinAt(s);
    hover = own ? { kind: 'pin', pin: own } : null;
  }
  function onUp(e) {
    if (consumeUp.has(e.button)) { consumeUp.delete(e.button); eat(e); }
    const finger = rpress?.touch != null && e.pointerId === rpress.touch;
    if (!rpress || (e.button !== 2 && !finger)) return;
    const r = rpress;
    rpress = null;
    if (pie && !pie.commit && pie.cancel == null) {
      if (finger) eat(e);   // the lift that ends a long press is not a tap-to-walk
      const i = wedgeAt(toScreen(e.clientX, e.clientY));
      if (i !== null) commitPie(i);
      else { pie.sticky = true; pie.stickyAt = L.t; }
      return;
    }
    if (finger) return;     // a short tap: the player's tap-to-walk
    if (!pie) doPoint(r.target);
  }
  // the browser took the touch over (a system gesture): an open pie stays, sticky (tap a wedge)
  function onCancel(e) {
    if (rpress?.touch == null || e.pointerId !== rpress.touch) return;
    rpress = null;
    if (pie && !pie.commit && pie.cancel == null && !pie.sticky) { pie.sticky = true; pie.stickyAt = L.t; }
  }
  const noMenu = (e) => { if (e.target === canvas) e.preventDefault(); };
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onCancel, true);
  addEventListener('contextmenu', noMenu, true);
  // the canvas keeps every touch gesture for the game (the long press + slide; no browser pan / pinch / callout)
  canvas.style.touchAction = 'none'; canvas.style.webkitTouchCallout = 'none'; canvas.style.webkitUserSelect = 'none';
  offs.push(() => { removeEventListener('pointercancel', onCancel, true); removeEventListener('pointerdown', onDown, true); removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('contextmenu', noMenu, true); });
  offs.push(
    input.bind('KeyJ', () => nb.toggle(), { desc: 'notebook (Seats / Notes)', group: 'ui' }),
    input.bind('KeyG', () => { dockOpen = !dockOpen; if (!dockOpen) armed = null; }, { desc: 'social dock: point / pins', group: 'emote' }),
    input.bind('KeyF', () => {
      if (!cursor) { toast('Point the mouse at a spot, then F drops a pin'); return; }
      dropPin(targetAt(cursor.x, cursor.y));
    }, { desc: 'drop a pin at the cursor', group: 'emote' }),
  );
  // Esc is bound after the panel's own Esc (on 'ready'), so the help overlay keeps its place in input.bindings()
  offs.push(events.on('ready', () => offs.push(input.bind('Escape', () => { if (pie) cancelPie(); armed = null; if (nb.isOpen) nb.close(); }, { desc: 'close the pie / notebook', group: 'ui' }))));

  // ------------------------------------------------------------------------------------------------ per frame
  const api = {
    L, hud, notebook: nb, N,
    get options() { return { ...hud.uiOptions }; },
    portraits: portraitsReady,
    avatarURL,
    toast, tip,
    /** A touch screen (coarse pointer or ?touch=1): ui.js words its tip for fingers. */
    touch: touchUI,
    // automation + the playtest (tools/demo-play.mjs): the same code paths as the pointer / keys
    doPoint, dropPin, removePin, clearPins, targetAt, openPieAt(clientX, clientY) { rpress = { cx: clientX, cy: clientY, t0: performance.now() - 1e4, target: targetAt(clientX, clientY) }; openPie(); rpress = null; return !!pie; },
    get dockOpen() { return dockOpen; }, set dockOpen(v) { dockOpen = !!v; },
    get color() { return color; }, set color(c) { if (E.PIN_LABEL[c]) color = c; },
    info() {
      const t = L.t;
      return {
        enabled: L.enabled, screen: [W(), H()], cover, touch: touchUI, pressing: rpress ? (rpress.touch != null ? 'touch' : 'right') : null, options: { ...hud.uiOptions },
        members: members.map((m) => { const k = talk.get(keyOf(m)); return { id: m.id, name: m.name, you: m.you, slot: m.slot, clip: m.clip, talking: !!k?.on, bubble: k?.line && t < k.bubbleUntil ? k.line : null, screen: L.atScreen(m.pos) }; }),
        point: point ? { kind: point.target.kind, age: +(t - point.t0).toFixed(2), scale: hud.uiOptions.pointerScale, frameSize: framesNow().point?.size ?? 20 } : null,
        pie: pie ? { open: !pie.commit && pie.cancel == null, input: pie.input, sticky: pie.sticky, hot: pie.hot, items: pie.items.map((x) => x.key), off: [...pie.off], at: [pie.cx, pie.cy] } : null,
        pins: pins.map((p) => ({ kind: p.kind, color: p.color, removing: p.removeAt != null, at: p.kind === 'place' ? [+p.p.x.toFixed(2), +p.p.z.toFixed(2)] : null, slot: p.slot ?? null, screen: p.kind === 'place' ? L.atScreen(p.p) : null })),
        pops: pops.map((p) => ({ who: p.who, kind: p.kind, color: p.color, age: +(t - p.t0).toFixed(2) })),
        dock: { open: dockOpen, armed, color, rects: R.dock?.parts ?? null, button: R.dockBtn ?? null }, toolbar: R.toolbar ?? null,
        toasts: toasts.map((x) => x.text), tip: tipState && t < tipState.until,
        notebook: nb.info(), readers: readers.map((r) => ({ ...r })),
        books3d: N.book3d ? [...N.book3d.books.values()].filter((e) => e.book.root.visible).length : 0, mergedBooks: !!N.book3d?.merged,
        youIcon: you.id ? { p: 'atlas', t: 'thumb', i: 'initial' }[iconOf(you.id, you.name).iconKey[0]] : null,
      };
    },
    update(t, dt) {
      syncMembers();
      // during the intro / loading screen: no UI (the cinematic shows the bare town)
      const on = hasControl() || !window.__demo?.ready;
      L.enabled = on || warm > 0;
      L.screenEnabled = hasControl();
      if (warm > 0) warm--;
      if (t >= nextCover) { nextCover = t + 0.25; measureCover(); }
      for (let i = pins.length - 1; i >= 0; i--) { const p = pins[i]; if (p.removeAt != null && L.t - p.t0 - p.removeAt > 0.5) pins.splice(i, 1); }
      // (perf) the depth-tested pin / book passes and the talk outline only run while they have something to draw
      // (each is a full low-res pass + texture uploads); all on during the warm-up frames, so their programs compile there
      const style = hud.uiOptions.bookStyle;
      const reading = nb.openAt !== null && (nb.isOpen || t < nb.closeAt + 0.5);
      const npcReading = members.some((m) => !m.you && (() => { const r = npcRead(m.slot, t); return r && t < r.closeAt + 0.5; })());
      if (pinPass.pass) pinPass.pass.enabled = warm > 0 || pins.some((p) => p.kind === 'place');
      if (N.pass?.pass) N.pass.pass.enabled = warm > 0 || (style === 'held' && (reading || npcReading));
      if (talkPass) talkPass.enabled = warm > 0 || talkers.length > 0;
      // right press held without moving: the pie
      if (rpress && !pie && performance.now() - rpress.t0 > (rpress.touch != null ? E.TIMING.LONG_PRESS_MS : E.TIMING.RIGHT_HOLD_MS)) openPie();
      // talk state per member (clip edges): glyph + outline while talking; NPCs get a line in a bubble; other emotes pop
      talkers.length = 0;
      for (const m of members) {
        const k = keyOf(m);
        let st = talk.get(k);
        if (!st) { st = { clip: m.clip, on: false, count: 0, line: null, bubbleAt: -1, bubbleUntil: -1, id: m.id }; talk.set(k, st); }
        if (st.id !== m.id) { st.id = m.id; st.line = null; }
        if (m.clip !== st.clip) {
          if (TALK_CLIPS.has(m.clip)) {
            st.count++;
            if (!m.you) { st.line = LINES[(m.slot * 3 + st.count) % LINES.length]; st.bubbleAt = L.t; st.bubbleUntil = L.t + IA.bubbleDurationMs(st.line) / 1000; }
          } else if (!m.you && POP_OF[m.clip] && m.clip !== 'idle') pop(m.slot, POP_OF[m.clip]);
          else if (!m.you && m.clip !== 'idle' && m.clip !== 'walk' && m.handle?.emotes?.signature === m.clip) pop(m.slot, 'question');
          st.clip = m.clip;
        }
        st.on = TALK_CLIPS.has(m.clip);
        if (st.on && visible(m) && talkers.length < 8) talkers.push({ pos: m.pos, height: m.height, color: m.you ? L.tok.self : L.tok.talk, line: IA.talkLineOf(m.you ? 'self' : 'talk', L.tok) });
      }
      void dt;
    },
    dispose() {
      removeEventListener('resize', setPx);
      for (const o of offs) { try { o?.(); } catch { /* gone */ } }
      nb.dispose();
      L.enabled = false;
    },
  };
  return api;
}
