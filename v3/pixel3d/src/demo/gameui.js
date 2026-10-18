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
import { PixelImage, drawBox, drawText, textWidth, toCanvas, loadImage, frameAt, dissolve, withAlpha, GRID_HZ, tokens as kitTokens } from '../ui/kit.js';
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
import * as EV from '../ui/events/draw.js';
import { formatClock } from './api.js';
import * as AB from './actionbar.js';
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
      you.face = P.facing; you.clip = h.ch?.state?.clip ?? 'idle'; you.ghost = !!P.ghost;
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
    let right = 0, left = 0, top = 0, leftBottom = 0;
    const panel = document.querySelector('#demo-ui > .dui-panel');
    if (panel && store.state.ui && panel.style.display !== 'none') {
      const p = panel.getBoundingClientRect();
      if (p.width > 0 && p.height > 0 && p.left < c.right && p.top < c.bottom) {
        if (p.left > c.left + c.width / 2) right = Math.ceil((c.right - p.left) * k);
        else if (p.bottom - c.top < c.height * 0.4) top = Math.max(0, Math.ceil((p.bottom - c.top) * k) + 1);
      }
    }
    if (nb?.isOpen) { const p = nb.el.getBoundingClientRect(); if (p.width > 0 && p.right < c.left + c.width / 2) { left = Math.ceil((p.right - c.left) * k) + 2; leftBottom = Math.ceil((p.bottom - c.top) * k); } }
    // the DOM status line (bottom left, ui.js): the action bar keeps clear of it (beside it, or above it on a phone)
    let status = null;
    const st = document.querySelector('#demo-ui > .dui-status');
    if (st && store.state.ui && st.style.display !== 'none') {
      const p = st.getBoundingClientRect();
      if (p.width > 0 && p.height > 0 && p.top < c.bottom) status = { x1: Math.ceil((p.right - c.left) * k) + 1, y0: Math.max(0, Math.floor((p.top - c.top) * k) - 1) };
    }
    cover = { left, leftBottom, right: Math.min(right, Math.floor(W() * 0.6)), top: Math.min(top, Math.floor(H() * 0.4)), status };
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
  // ---- the controls tip + the lightbulb (the user's request): the tip shows once on a visit (ui.js decides when: after
  // the player gets control, 9 s of rendered time), then stays hidden; the toolbar's LIGHTBULB (always there) brings it
  // back. Dismissing it (its x, the bulb, Esc, the 9 s, "never show again") plays the tip SHRINKING and FLYING into
  // the bulb (5 drawings at 15 fps), then the bulb glows and pulses ~1.6 s, so players learn where it went. "Never
  // show again" (the tick box under the tip) is saved in localStorage (try / catch: no storage = this visit only) and
  // stops the automatic tip on later visits; the bulb stays.
  const TIP_NEVER_KEY = 'hollowmere-tip:never';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
  let tipNever = lsGet(TIP_NEVER_KEY) === '1', tipNeverSaved = null;
  let tipTokensNow = AB.tipTokens(touchUI);
  let tipState = null;       // { tokens, at, until (Infinity: opened by the bulb), auto }
  let tipFly = null;         // { t0, im, x, y } the dismissed tip on its way into the bulb
  let bulbGlow = -1e9;       // L.t when the bulb's glow starts (after the fly)
  let tipRect = null, tipShown = 0, tipDismissed = [];
  const FLY_F = 16, GLOW_S = 1.8;          // fly = 16 grid frames (8 drawings at 15 fps, ~0.53 s); glow after it
  function tip(tokens = null, secs = 9, { auto = true } = {}) {
    if (tokens) tipTokensNow = tokens;
    const st = { tokens: tipTokensNow, at: L.t, until: secs ? L.t + secs : Infinity, auto };
    tipState = st; tipFly = null; tipShown++;
    events.emit('gameui:tip', { open: true, auto });
    return { get isConnected() { return tipState === st; }, classList: { add() {}, contains: () => false }, dismiss() { if (tipState === st) closeTip('dismiss'); }, remove() { if (tipState === st) closeTip('remove'); } };
  }
  function closeTip(reason = 'close') {
    if (!tipState) return false;
    tipState = null;
    if (tipRect?.im && !reduced) { tipFly = { t0: L.t, im: tipRect.im, x: tipRect.x, y: tipRect.y }; bulbGlow = L.t + FLY_F / GRID_HZ; }
    else { tipFly = null; bulbGlow = L.t; }
    tipDismissed.push(reason);
    events.emit('gameui:tip', { open: false, reason });
    return true;
  }
  function setTipNever(v) {
    tipNever = !!v;
    tipNeverSaved = lsSet(TIP_NEVER_KEY, tipNever ? '1' : null);
    events.emit('gameui:tip', { never: tipNever, saved: tipNeverSaved });
  }

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
    // (P2.8) a character without a 'point' clip (the shipped four: wanderer / keeper / hound / duelist) shows the
    // emotes group's point pop over its head instead (the finger + trail are drawn either way)
    const clip = !!(h?.emotes?.point && h.spec?.clips?.[h.emotes.point]);
    if (clip) h.play(h.emotes.point); else pop('you', 'point');
    events.emit('gameui:point', { kind: point.target.kind, at: [+p.x.toFixed(2), +p.z.toFixed(2)], clip });
    return true;
  }
  function dropPin(target, c = color) {
    if (!target) return false;
    // (the user's bug: five pins stacked over the Hound) ONE pin of yours per townsperson: F / the Pin button / a pie
    // swatch on someone who already carries your pin REPLACES it: the same colour removes it (a toggle), another
    // colour recolours it (dropped again in the new colour)
    if (target.member && !target.member.you) {
      const had = personPinOf(target.member);
      if (had) {
        if (had.color === c) { removePin(had); return true; }
        had.color = c; had.t0 = L.t;
        pop('you', 'pin', c);
        events.emit('gameui:pin', { color: c, kind: 'person', recolour: true });
        return true;
      }
    }
    if (livePins().length >= MAX_PINS) { toast(`You have ${MAX_PINS} pins: remove one first`, { kind: 'error', ms: 2600 }); return false; }
    if (target.member && !target.member.you) pins.push({ kind: 'person', slot: target.member.slot, id: target.member.id, name: target.member.name, color: c, t0: L.t, removeAt: null });
    else if (target.ground) pins.push({ kind: 'place', p: target.ground.clone(), color: c, t0: L.t, removeAt: null });
    else return false;
    pop('you', 'pin', c);
    events.emit('gameui:pin', { color: c, kind: pins[pins.length - 1].kind });
    return true;
  }
  /** Your live person pin on a townsperson (member), or null. */
  const personPinOf = (m) => { for (let i = pins.length - 1; i >= 0; i--) { const p = pins[i]; if (p.kind === 'person' && p.removeAt == null && p.slot === m.slot && p.id === m.id) return p; } return null; };
  const removePin = (pin) => { if (pin && pin.removeAt == null) { pin.removeAt = L.t - pin.t0; events.emit('gameui:unpin', { color: pin.color }); return true; } return false; };
  const clearPins = () => { let n = 0; for (const p of pins) if (removePin(p)) n++; return n; };
  // a pin of mine under a screen point: a person pin over a name (its drawn body + 3 px all round, last frame's rects:
  // generous, they are small and they bob), else a place pin (the pin body: 18 x 26 above its spot)
  const personPinRects = [];  // [{ pin, x, y, w, h }] screen texels, filled by the person-pin drawing
  const pinAt = (s) => {
    for (let i = personPinRects.length - 1; i >= 0; i--) { const r = personPinRects[i]; if (r.pin.removeAt == null && inRect(s, r)) return r.pin; }
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
    const ownPin = pinAt(s);
    // a press on your person pin = on its townsperson (the pie names them; F / a swatch toggles / recolours the pin)
    let member = memberAt(s);
    if (!member && ownPin?.kind === 'person') { const m = npcOf(ownPin.slot); if (m && m.id === ownPin.id) member = m; }
    let ground = null;
    try {
      const g = demo.player?.pickAt?.(clientX, clientY)?.ground;
      if (g) ground = new THREE.Vector3(g.x, demo.player?.interior ? demo.player.interior.floorY ?? 0 : groundY(g.x, g.z), g.z);
    } catch { ground = null; }
    // (the pie's "Remove my pin" also when the press is on a townsperson who carries your pin)
    const own = ownPin ?? (member && !member.you ? personPinOf(member) : null);
    return { s, member: member && !member.you ? member : null, onYou: member?.you ?? false, ownPin: own, ground };
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

  // ---- the EVENTS group (src/ui/events, docs/UI.md §3.3), driven by the demo's store / clock / player:
  //   phase captions (the caption ribbon under the chips) on every 'phase' change; night falls (the veil) when the phase
  //   turns to night or the running clock crosses 20:00, dawn (the light pulling back) on night -> day or 06:00
  //   (natural crossings only: a running clock <= 120 game min / s, no jumps, at most one per 20 s); the vote clock +
  //   tally (HUD, left) in the vote phase, its hand in step with the dais' brass hand (time.sweep); the execution
  //   (dim, tolls, bell, wisp, reveal) on the nominee's seat; the ghost reveal (wisp + burst + the ghost label) on your
  //   ghost emote; the Storyteller poof when you swap to / from the Storyteller.
  const Tn = kitTokens('night');
  let caption = null;        // { text, glyph, t0, durF }
  let veil = null, dawn = null, ghostFx = null, poof = null, exec = null, vote = null;
  let lastVeil = -1e9, prevHours = null, prevChar = store.state.character;
  const evInfo = { captions: [], veils: 0, dawns: 0, ghosts: 0, poofs: 0, executions: 0, votes: 0 };
  const daisSeats = () => (demo.town?.registry?.anchors?.('seats') ?? []).filter((a) => a.piece === 'dais').map((a) => a.pos);
  const seatMembers = new Map();      // seat (1-based) -> member-like record for the events drawing
  const seatMember = (i) => {
    const P = daisSeats()[i];
    if (!P) return null;
    let m = seatMembers.get(i + 1);
    if (!m) { m = { seat: i + 1, name: `Seat ${i + 1}`, pos: P.clone(), ghost: false, you: false, height: 1.15, head() { return this.pos.clone().setY(this.pos.y + this.height); }, feet() { return this.pos.clone(); } }; seatMembers.set(i + 1, m); }
    m.ghost = !!store.state.seats[i]?.dead;
    return m;
  };
  const evHud = {
    terrain: { heightAt: (x, z) => groundY(x, z) },
    place(r, deg) {
      const yaw = engine.camera.yaw ?? 0, a = (deg * Math.PI) / 180;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);                 // into the screen, on the ground
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      return engine.camera.target.clone().add(new THREE.Vector3(dx * r, 0, dz * r));
    },
    get cast() { return store.state.seats.map((st, i) => (st.occupied || st.dead ? seatMember(i) : null)).filter(Boolean); },
    bySeat(n) { return seatMember(n - 1); },
  };
  const setCaption = (text, glyph, secs = 4.2) => { caption = { text, glyph, t0: L.t, durF: Math.round(secs * GRID_HZ) }; evInfo.captions.push(text); if (evInfo.captions.length > 12) evInfo.captions.shift(); };
  const nightFalls = (text) => { veil = { t0: L.t }; lastVeil = L.t; evInfo.veils++; setCaption(text, 'moon', EV.TIMING.caption.nightF / GRID_HZ); };
  const dawnBreaks = (text) => { dawn = { t0: L.t }; lastVeil = L.t; evInfo.dawns++; setCaption(text, 'sun', EV.TIMING.caption.dawnF / GRID_HZ); };
  /** The vote of the vote phase: the occupied seats clockwise after the nominee (nominee last), each voter's slot of
   *  the events clock (1.2 s) mapped onto the dais sweep (time.sweep: seat offset k reached at t0 + (k - 1) per). */
  function startVote() {
    const s = store.state, nom = s.nominee ?? s.seats.findIndex((x) => x.nominated);
    if (nom == null || nom < 0 || !daisSeats().length) { vote = null; return; }
    const sw = demo.time?.sweep ?? { from: nom, t0: engine.time, per: 0.55 };
    const votes = demo.time?.votes ?? new Set(), N = s.seats.length, per = EV.TIMING.vote.perVoterF / GRID_HZ;
    const order = [], reach = [], raise = {}, ghosts = [], dead = [];
    for (let k = 1; k <= N; k++) {
      const i = (sw.from + k) % N, st = s.seats[i];
      if (!(st.occupied || st.dead)) continue;
      if (st.dead) { dead.push(i + 1); if (st.ghostVote) ghosts.push(i + 1); }
      if (votes.has(i) && (!st.dead || st.ghostVote)) raise[i + 1] = order.length * per + 0.1;
      order.push(i + 1); reach.push(sw.t0 + (k - 1) * sw.per);
    }
    if (!order.length) { vote = null; return; }
    const alive = order.length - dead.length;
    vote = { v: EV.makeVote({ nominee: nom + 1, order, raise, ghosts, dead, t0: 0, needed: Math.max(1, Math.ceil(alive / 2)) }), reach, per, t0: L.t, result: false };
    evInfo.votes++;
    setCaption(`Seat ${nom + 1} is nominated. Raise a hand to vote.`, 'hand', (reach[reach.length - 1] - L.t) + per + 0.2);
  }
  /** Real (demo) time -> the vote's clock: piecewise linear between the dais' reach times of the voters. */
  const voteClock = (t) => {
    const { reach, per } = vote, n = reach.length;
    if (t < reach[0]) return t - reach[0];
    for (let i = 0; i < n - 1; i++) if (t < reach[i + 1]) return i * per + ((t - reach[i]) / Math.max(1e-3, reach[i + 1] - reach[i])) * per;
    return (n - 1) * per + (t - reach[n - 1]);
  };
  offs.push(store.on('phase', ({ value, prev }) => {
    if (value === 'vote') startVote(); else if (prev === 'vote') vote = null;
    const s = store.state, nom = s.nominee;
    if (value === 'night') { if (L.t - lastVeil > 1) nightFalls('Night falls. You are alone in your home…'); }
    else if (value === 'day' && prev === 'night') dawnBreaks('Dawn breaks over Hollowmere.');
    else if (value === 'nomination') setCaption('Nominations are open. Who will you name?', 'hand');
    else if (value === 'execution' && nom != null) { exec = { t0: L.t, seat: nom }; evInfo.executions++; setCaption(`The bell tolls for Seat ${nom + 1}.`, 'bell', EV.TIMING.execution.captionF / GRID_HZ); }
    else if (value === 'day') setCaption('A new day in Hollowmere.', 'sun', 3);
  }));
  offs.push(store.on('nominee', () => { if (store.state.phase === 'vote') startVote(); }));
  // the ghost reveal when you BECOME a ghost (the ghost emote is a toggle, player.js setGhost; not on the way back)
  offs.push(events.on('player:emote', (e) => { if (e?.clip === 'ghost' && !e.fallback && !e.off) { ghostFx = { t0: L.t }; evInfo.ghosts++; } }));
  offs.push(events.on('player:character', ({ id } = {}) => {
    if ((id === 'storyteller' || prevChar === 'storyteller') && demo.player?.position) { poof = { t0: L.t, pos: demo.player.position.clone() }; evInfo.poofs++; }
    ghostFx = null;
    prevChar = id ?? prevChar;
  }));
  // world tier: the execution's dim (under the labels, z 2) and dawn's light (z 3); its tolls / bell / wisp, your
  // ghost reveal and the poof (z 26, over the labels)
  L.add((LL) => {
    const t = LL.t;
    if (exec) {
      const m = seatMember(exec.seat), r = EV.drawExecution(evHud, LL, EV.framesFor(LL.tok), m, exec.t0, { t, still: reduced, layer: 'dim', Tn });
      LL.world.mark?.(0, 0, LL.world.w - 1, LL.world.h - 1);   // drawDim writes the bytes directly: tell the layer's dirty bands
      if (r.k > EV.TIMING.execution.dimOutAtF + 12) exec = null;
    }
    if (dawn) {
      const k = EV.gridK(t - dawn.t0);
      if (k >= EV.TIMING.dawn.f) dawn = null;
      else { EV.drawDawn(LL, reduced ? Math.min(k, 1) : k, LL.tok); LL.world.mark?.(0, 0, LL.world.w - 1, LL.world.h - 1); }
    }
  }, 2);
  L.add((LL) => {
    const t = LL.t, F = EV.framesFor(LL.tok);
    if (exec) EV.drawExecution(evHud, LL, F, seatMember(exec.seat), exec.t0, { t, still: reduced, layer: 'fx', Tn });
    if (ghostFx && you.id) {
      const k = EV.gridK(t - ghostFx.t0);
      if (k > 30) ghostFx = null;
      else {
        const feet = LL.at(you.feet()), lt = LL.at(you.head()).y + IA.LABEL_DY;
        EV.drawWisp(LL, F, Math.floor(k / 3), feet.x, feet.y - EV.WISP_LIFT, lt);
        const rd = Math.floor((k - 12) / 2);
        if (k >= 12 && rd < 4 && !reduced) EV.put(LL.world, F, `reveal_${rd}`, feet.x, feet.y - 6, 'reveal');
      }
    }
    if (poof) { const k = EV.gridK(t - poof.t0); if (k >= EV.TIMING.poof.frames * EV.TIMING.poof.hold) poof = null; else EV.drawPoof(LL, F, LL.at(poof.pos), k, { appear: true }); }
  }, 26);
  // screen tier: the night veil (under the HUD: the chips, the toolbar, the captions stay readable over it)
  L.add((LL) => {
    if (!veil || !LL.screen) return;
    const k = EV.gridK(LL.t - veil.t0);
    const ph = EV.drawNightVeil(LL, reduced ? (k < EV.TIMING.night.outF ? -1 : 999) : k, Tn);
    if (ph) LL.screen.mark?.(0, 0, LL.screen.w - 1, LL.screen.h - 1);   // direct byte writes: mark the whole layer dirty
    if (!ph && k > EV.TIMING.night.outF) veil = null;
  }, 55);

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
      const p = LL.at(m.head()), top = Math.max(LL.MARGIN + 2 + (m.you ? 8 : 0), p.y + IA.LABEL_DY);
      // (P3.9) a label the DOM covers (the control panel's band, the folded panel's top band, the open notebook) is
      // not drawn at all (it peeked out above the panel's top edge), nor its stack (bubble, pins, pops)
      const sx = p.x - LL.MARGIN, sy = top - LL.MARGIN, hw = 40;
      if ((cover.right && sx + hw > W() - cover.right) || (cover.left && sx - hw < cover.left) || (cover.top && sy < cover.top + 2)) continue;
      // nor under the HUD's own top row (the clock / phase chips, the toolbar: a label clamped at the top edge sat
      // under the clock chip): last frame's rects
      if (sy < (R.topRow?.y1 ?? 0) && R.topRow.spans.some(([a, b]) => sx + 30 > a && sx - 30 < b)) continue;
      m._shown = true;
      // the "you are here" ring, except while your big 3D book stands in front of you (it would print over the pages:
      // L.ground keeps only CHARACTER texels, the book is a prop)
      if (m.you && !(hud.uiOptions.bookStyle === 'big' && readers.some((r) => r.who === 'you'))) {
        const f = LL.at(m.pos), k = reduced ? 0 : frameAt(t, 2.5, 4);
        fastBlit(LL.ground, cached(`ring${k}${T.gold}`, () => IA.youRing(k, T)), f.x - 16, f.y - 8);
      }
      // the name label (indicators art), drawn once per name + token set: drawText at (cx, top) = this crop at (cx + dx, top - 1 + dy)
      // a ghost (your ghost STATE: player.ghost, walking too; or a ghost clip): the indicators' ghost label variant
      // (ghost ink + the little sheet ghost)
      const ghostly = m.clip === 'ghost' || (m.you && m.ghost);
      const lab = ghostly
        ? piece(`labg${m.name}${T.ghost}`, 160, 12, (im) => { const g = IA.labelImage(m.name, 'ghost', T); im.blit(g, 80 - (g.w >> 1), 0); })
        : piece(`lab${m.name}${T.labelText}${T.labelLine}`, 160, 12, (im) => IA.label(im, 80, 1, m.name, 'player', T));
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
    // person pins over their names (mine), fanned; their screen rects for the click-to-remove / hover (pinAt)
    personPinRects.length = 0;
    for (const m of members) {
      if (m.you || !m._shown) continue;
      const list = pins.filter((p) => p.kind === 'person' && p.slot === m.slot && p.id === m.id);
      if (!list.length) continue;
      const icon = iconOf(you.id, you.name), cx = LL.at(m.head()).x, labelTop = m._stack + 1;
      const hv = hover?.kind === 'pin' ? list.indexOf(hover.pin) : -1;
      drawPersonPins(LL, F, { cx, labelTop, t, still: reduced, hover: hv,
        pins: list.map((p) => ({ color: p.color, ...icon, age: t - p.t0, removeAt: p.removeAt })) });
      // (drawPersonPins' fan: dx / dy per index, the pin's anchor 8, 25: body x - 8 .. x + 10, y - 25 .. y + 1)
      const n = list.length, mid = (n - 1) / 2, spread = Math.min(0.62, 2.4 / Math.max(1, n));
      list.forEach((p, i) => {
        const kk = i - mid, dx = n > 1 ? Math.round(kk * 18 * spread) : 0, dy = n > 1 ? Math.round(Math.abs(kk) * 1.5) : 0;
        const x = cx + dx - LL.MARGIN, y = labelTop - 1 + dy - LL.MARGIN;
        personPinRects.push({ pin: p, x: x - 8 - 3, y: y - 25 - 3, w: 19 + 6, h: 27 + 6 });
      });
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
    if (hover.pin.kind === 'person') {
      const r = personPinRects.find((x) => x.pin === hover.pin);
      if (r) E.drawPinTip(LL.world, r.x + 11 + LL.MARGIN, r.y + LL.MARGIN, `Your pin on ${hover.pin.name ?? 'them'} · click to remove`, LL.tok, { removable: true });
      return;
    }
    const q = LL.at(hover.pin.p);
    E.drawPinTip(LL.world, q.x, q.y - 28, 'Your pin · click to remove', LL.tok, { removable: true });
  }, 36);

  // (P2.7) off-screen arrows (indicators edgeDisc + edgeDiscPointer): your point target, the townsfolk you pinned and
  // your place pins, when they are outside the VISIBLE area (the canvas minus the panel / notebook / folded-panel
  // bands, below the chips, above the bottom row): a disc on that area's edge toward them, the person's portrait (or
  // your pin / the pointing glove in it), its tail pointing the way, at most 6
  const offscreen = [];
  const pinDiscIcon = (c, T) => cached(`pdi${c}${T.ink}`, () => { const im = new PixelImage(12, 12), g = E.pinIcon(c, T); im.blit(g, (12 - g.w) >> 1, (12 - g.h) >> 1); return im; });
  const pointDiscIcon = (T) => cached(`ptdi${T.ink}`, () => { const im = new PixelImage(12, 12), g = E.emotePointSmall(T); im.blit(g, (12 - g.w) >> 1, (12 - g.h) >> 1); return im; });
  L.add((LL) => {
    offscreen.length = 0;
    const img = LL.screen, T = LL.tok;
    if (!img) return;
    const ax0 = 4 + cover.left, ax1 = img.w - 4 - cover.right, ay0 = cover.top + 26, ay1 = img.h - 30;
    if (ax1 - ax0 < 60 || ay1 - ay0 < 40) return;
    const list = [];
    const seen = new Set();
    const want = (key, pos, icon, name, label) => { if (seen.has(key) || list.length >= 6) return; seen.add(key); list.push({ key, pos, icon, name, label }); };
    if (point && LL.t - point.t0 < MT.EMOTE_POINT_MS / 1000) {
      if (point.target.kind === 'person') { const m = npcOf(point.target.slot); if (m) want(`m${m.slot}`, m.pos, avatarImg(m.id), m.name, 'point'); }
      else want('pt', point.target.p, pointDiscIcon(T), 'here', 'point');
    }
    for (const p of pins) {
      if (p.removeAt != null) continue;
      if (p.kind === 'person') { const m = npcOf(p.slot); if (m && m.id === p.id) want(`m${m.slot}`, m.pos, avatarImg(m.id), m.name, 'pin'); }
      else want(`p${pins.indexOf(p)}`, p.p, pinDiscIcon(p.color, T), 'your pin', 'pin');
    }
    const cxs = (ax0 + ax1) / 2, cys = (ay0 + ay1) / 2;
    for (const o of list) {
      const f = LL.atScreen(o.pos);
      if (f.x >= ax0 && f.x < ax1 && f.y >= ay0 && f.y < ay1) continue;
      const dx = f.x - cxs, dy = f.y - cys, d8 = IA.dir8Of(dx, dy);
      const dp = cached(`edisc${o.key}${o.icon ? o.icon.w : 0}${o.name}${d8}${T.ink}`, () => IA.edgeDiscPointer(IA.edgeDisc(o.icon, T, o.name), d8, T));
      const r = (dp.img.w >> 1) - dp.pad, m = r + IA.EDGE_TAIL + 3;
      const k = Math.min(((ax1 - ax0) / 2 - m) / Math.max(1e-6, Math.abs(dx)), ((ay1 - ay0) / 2 - m) / Math.max(1e-6, Math.abs(dy)));
      const x = Math.round(cxs + dx * k), y = Math.round(cys + dy * k);
      fastBlit(img, dp.img, x - (dp.img.w >> 1), y - (dp.img.h >> 1));
      offscreen.push({ key: o.key, kind: o.label, d8, at: [x, y] });
    }
  }, 57);

  // tier S: the HUD
  const shot = { chip: null, chipKey: '', phase: null, phaseKey: '' };
  const STAGE = { day: 'discussion', nomination: 'nominations', vote: 'nominations', execution: 'nominations', night: 'bedtime' };
  const LABEL = { nomination: 'Nominations', vote: 'The vote', execution: 'Execution', night: 'Night' };
  const PHASE = { day: ['day', false], nomination: ['day', true], vote: ['day', true], execution: ['bedtime', false], night: ['night', false] };
  const probe = (w, h, fn) => { const im = new PixelImage(w, h); const r = fn(im); return { im, r }; };
  const toolbar = [{ k: 'tip', g: (T, lit) => AB.bulb(T, lit), title: 'the controls tip' }, { k: 'notebook', g: (T) => HA.GLYPH.notebook(T), title: 'Notebook (J)' }, { k: 'panel', g: (T) => HA.GLYPH.gear(T), title: 'controls (`)' }, { k: 'help', g: (T) => HA.GLYPH.help(T), title: 'keys (H)' }];
  // the action bar's popovers: the emote palette, the tray with every other key
  let emotePal = false, trayOpen = false;
  const BARW = AB.BAR.length * (AB.BTN + AB.GAP) - AB.GAP;
  const btnImg = (key, o) => cached(`btn|${key}|${o.state}|${o.hint}|${touchUI}|${L.tok.ink}`, () => AB.button(L.tok, { ...o, showHint: !touchUI }));
  const hoverIs = (kind, k) => hover?.kind === kind && hover.k === k;
  /** Nearest-neighbour down-scale (the tip flying into the bulb). */
  const shrink = (im, f) => {
    const w = Math.max(1, Math.round(im.w * f)), h = Math.max(1, Math.round(im.h * f)), o = new PixelImage(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = im.get(Math.min(im.w - 1, Math.floor(x / f)), Math.min(im.h - 1, Math.floor(y / f))); if (c[3]) o.set(x, y, c); }
    return o;
  };
  const hasEmote = (k) => { const h = demo.player?.handle; if (!h) return false; if (k === 'point') return true; const c = h.emotes?.[k]; return !!(c && h.spec?.clips?.[c]); };
  /** The tip plate + its "never show again" row, drawn once per state ({im, close, never} rects relative to im). */
  const tipImage = (mw, T) => cached(`tipimg|${mw}|${tipNever}|${hoverIs('tip', 'never')}|${hoverIs('tip', 'close')}|${T.ink}|${JSON.stringify(tipTokensNow)}`, () => {
    const tmp = new PixelImage(mw + 40, 80), r = HA.drawKeyHint(tmp, (mw + 40) >> 1, 0, T, { tokens: tipTokensNow, maxW: mw });
    const w = r.w, h = r.h, im = new PixelImage(w + 1, h + 14);
    im.blit(tmp, -r.x, 0);
    if (hoverIs('tip', 'close')) drawBox(im, w - 12, 2, 9, 9, 'hover', T), im.blit(HA.GLYPH.close(T, T.text), w - 10, 4);
    drawBox(im, 0, h - 1, w, 14, { line: 'outline', edge: 'goldSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true }, T);
    drawBox(im, 6, h + 2, 8, 8, hoverIs('tip', 'never') ? 'hover' : 'sunk', T);
    if (tipNever) for (const [x, y] of [[8, h + 5], [9, h + 6], [10, h + 5], [11, h + 4]]) im.set(x, y, T.goldHi), im.set(x, y + 1, T.gold);
    im.blit(textImg('Never show again', hoverIs('tip', 'never') ? T.text : T.textDim), 18, h + 3);
    return { im, close: { x: w - 13, y: 1, w: 11, h: 11 }, never: { x: 2, y: h, w: w - 4, h: 12 } };
  });
  const textImg = (str, color) => cached(`txt|${str}|${color}`, () => { const im = new PixelImage(Math.max(1, textWidth(str) + 2), 10); drawText(im, 0, 0, str, { color }); return im; });
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
    R.topRow = { y1: y0 + 22, spans: [[x0 - 2, x0 + shot.chip.w - 2 + shot.phase.w], [x1 - toolbar.length * 17, x1]] };
    // toolbar (right of the visible area): the tip's lightbulb / notebook / control panel / keys; each button drawn
    // once per state. The bulb is ALWAYS there; after a dismissed tip has flown into it, it glows GLOW_S s (a gold
    // frame + the lit glass with rays throughout, the 2-ring halo pulsing: on 2 drawings of 3 at 7.5 fps)
    let bx = x1;
    R.toolbar = {};
    const glowing = t >= bulbGlow && t < bulbGlow + GLOW_S;
    for (let i = toolbar.length - 1; i >= 0; i--) {
      const b = toolbar[i], w = 15;
      bx -= w;
      const on = (b.k === 'notebook' && nb.isOpen) || (b.k === 'panel' && s.ui) || (b.k === 'tip' && !!tipState);
      // (the glass stays lit through the whole glow; the halo ring pulses: 2 drawings of 3 at 7.5 fps)
      const lit = b.k === 'tip' && (!!tipState || glowing);
      const st = on ? 'pressed' : hover?.kind === 'tool' && hover.k === b.k ? 'hover' : 'raised';
      const btn = cached(`tool${b.k}${st}${lit}${T.ink}`, () => {
        const im = new PixelImage(w, 15);
        drawBox(im, 0, 0, w, 15, lit && !on ? 'gold' : st, T);
        const g = b.g(T, lit), q = st === 'pressed' ? 1 : 0;
        im.blit(g, Math.floor((w - g.w) / 2) + q, Math.floor((15 - g.h) / 2) + q);
        return im;
      });
      fastBlit(img, btn, bx, y0 + 4);
      // the glow: a 1-px gold halo ring round the bulb button, pulsing with it (light FX: <= 2 alpha steps)
      if (b.k === 'tip' && glowing && (reduced || frameAt(t - bulbGlow, 7.5, 3) !== 2)) {
        fastBlit(img, cached(`bulbhalo${T.ink}`, () => {
          const h = new PixelImage(w + 6, 21);
          for (let yy = 3; yy < 18; yy++) for (let xx = 3; xx < w + 3; xx++) h.set(xx, yy, T.goldHi);
          h.outline(T.goldHi, {}); h.outline(withAlpha(T.goldHi, 110), {});
          for (let yy = 3; yy < 18; yy++) for (let xx = 3; xx < w + 3; xx++) h.erase(xx, yy);
          return h;
        }), bx - 3, y0 + 1);
      }
      R.toolbar[b.k] = { x: bx, y: y0 + 4, w, h: 15 };
      bx -= 2;
    }
    // toasts (newest on top), right-aligned under the toolbar (below the phase caption ribbon while one shows)
    let ty = y0 + 24 + (caption ? 18 : 0);
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
    // the events: the phase caption (under the chips, centred on the visible area) and the vote clock (left)
    const EF = EV.framesFor(T);
    if (caption) {
      const k = EV.gridK(t - caption.t0);
      if (k > caption.durF + 8) caption = null;
      else EV.drawCaption(LL, EF, { text: caption.text, glyph: caption.glyph, k, durF: caption.durF, cx, y: y0 + 26, still: reduced });
    }
    R.vote = null;
    if (vote) {
      const tv = voteClock(t), rect = { x: x0, y: y0 + 44, w: 69, h: 90 };
      if (rect.y + rect.h < img.h - 30) {
        const S = EV.drawVoteHud(evHud, LL, EF, vote.v, rect, { t: tv, still: reduced });
        R.vote = { ...rect, tally: S.tally, done: S.done, passed: S.passed, current: S.current };
        if (S.done && !vote.result) { vote.result = true; setCaption(S.passed ? `Seat ${vote.v.nominee} is on the block (${S.tally} votes).` : 'Not enough votes.', 'bell', 3.2); }
      }
    }
    // bottom: dock button (your portrait in the gold ring) + the dock / armed pill above it
    const by = img.h - 4 - 24, bxr = x1 - 24;
    const av = you.id ? avatarImg(you.id) : null;
    if (av) fastBlit(img, cached(`gold${you.id}${T.goldLine}`, () => goldFrame(av, T)), bxr, by);
    else drawBox(img, bxr, by, 24, 24, 'sunk', T);
    const dbs = dockOpen ? 'open' : hover?.kind === 'dockbtn' ? 'hover' : 'normal';
    fastBlit(img, cached(`dockbtn${dbs}${color}${T.ink}`, () => E.dockButton(T, { state: dbs, color })), bxr - 1, by - 1);
    R.dockBtn = { x: bxr - 1, y: by - 1, w: 26, h: 26 };
    // ---- the ACTION BAR (the user's request: every key action as a clickable / tappable button, its key as a hint):
    // on the bottom row between the status line (bottom left, DOM) and the dock button, centred on the visible area
    // when it fits; on a narrow screen (a phone: the status line spans the bottom) it stands on top of the status line
    const BT = AB.BTN, BG = AB.GAP, rightLim = bxr - 1 - 4;
    // (the open notebook is a left band only down to its own bottom: the bar on the bottom row does not move for it)
    const bx0 = cover.left && cover.leftBottom > img.h - 4 - BT - 3 ? x0 : 4;
    let leftLim = bx0;
    if (cover.status && cover.status.y0 < img.h - 2) leftLim = Math.max(leftLim, cover.status.x1 + 3);
    let barX, barY = img.h - 4 - BT;
    const bcx = Math.floor((bx0 + x1) / 2);
    if (rightLim - leftLim >= BARW) barX = Math.max(leftLim, Math.min(rightLim - BARW, bcx - (BARW >> 1)));
    else { barX = bx0; barY = (cover.status ? cover.status.y0 : img.h - 4) - 3 - BT; }
    R.bar = [];
    for (let i = 0; i < AB.BAR.length; i++) {
      const b = AB.BAR[i], x = barX + i * (BT + BG);
      const on = (b.k === 'emote' && emotePal) || (b.k === 'point' && armed === 'point') || (b.k === 'pin' && armed === 'pin') || (b.k === 'dock' && dockOpen) || (b.k === 'notebook' && nb.isOpen) || (b.k === 'more' && trayOpen);
      // (the emote button is lit while you are a ghost: the state shows without opening the palette)
      const state = on ? 'pressed' : b.k === 'emote' && demo.player?.ghost ? 'lit' : hoverIs('bar', b.k) ? 'hover' : 'raised';
      const g = AB.glyph(b.glyph, T, { color });
      fastBlit(img, btnImg(`bar${b.k}${b.k === 'pin' ? color : ''}`, { state, glyph: g, hint: b.hint }), x, barY);
      R.bar.push({ k: b.k, x, y: barY, w: BT, h: BT });
    }
    // the popovers above the bar: the emote palette (the 6 game emotes; greyed when your character has no such clip,
    // except point: P2.8's pop fallback) and the tray (every other key, two rows)
    R.pal = null; R.tray = null;
    const popover = (rows, anchorX, kind) => {
      const n = Math.max(...rows.map((r) => r.length)), pw = n * (BT + BG) - BG + 6, ph = rows.length * (BT + BG) - BG + 6;
      const px = Math.max(x0, Math.min(x1 - pw, anchorX - (pw >> 1))), py = barY - 3 - ph;
      drawBox(img, px, py, pw, ph, 'panel', T);
      const out = [];
      rows.forEach((row, j) => row.forEach((it, i) => {
        const x = px + 3 + i * (BT + BG), y = py + 3 + j * (BT + BG), dis = kind === 'pal' && !hasEmote(it.k);
        const id = it.k ?? it.code;
        const paused = it.code === 'KeyT' && (s.paused || !s.timeSpeed);
        // the ghost button is lit while you are a ghost (a toggle: player.ghost)
        const lit = kind === 'pal' && it.k === 'ghost' && !!demo.player?.ghost;
        const state = dis ? 'disabled' : lit ? 'lit' : hoverIs(kind, id) ? 'hover' : 'raised';
        fastBlit(img, btnImg(`${kind}${id}${paused}`, { state, glyph: AB.glyph(it.glyph, T, { paused }), hint: it.hint }), x, y);
        out.push({ k: id, code: it.code, x, y, w: BT, h: BT, off: dis, tip: it.tip, hint: it.hint });
      }));
      return { x: px, y: py, w: pw, h: ph, items: out };
    };
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
    // bottom centre: the door prompt, else the tip (both kept above the action bar and the dock button row)
    const P = demo.player, d = P?.nearDoor, room = P?.interior;
    const promptY = Math.min(img.h - 4 - 15 - 26, barY - 4 - 15);
    // (centred pieces: drawn once per text at x 320 of a 640-wide image, then placed by their offset from that centre)
    const prompt = (text, locked = false) => {
      const pc = piece(`prompt${text}${locked}${T.ink}`, 640, 17, (im) => HA.drawPrompt(im, 320, 0, T, { text, locked }));
      fastBlit(img, pc.im, cx - 320 + pc.dx, promptY + pc.dy);
    };
    R.tip = null;
    if (tipState && t >= tipState.until) closeTip('timeout');
    if (room) prompt(`${room.name ?? 'Inside'} · walk out the door to leave`);
    else if (d) {
      const house = demo.layout?.houses?.find((q) => q.id === d.id);
      if (d.id === 'clocktower') prompt('The clock tower is locked', true);
      else prompt(`Walk in: ${house?.name ?? d.id}`);
    }
    if (tipState && !(d || room)) {
      const mw = Math.min(300, x1 - x0 - 4), ti = tipImage(mw, T);
      const tx = Math.max(x0, Math.min(x1 - ti.im.w, cx - (ti.im.w >> 1)));
      const tyy = Math.max(y0 + 24, Math.min(promptY + 8 - ti.im.h, by - 3 - ti.im.h, barY - 4 - ti.im.h));
      fastBlit(img, ti.im, tx, tyy);
      tipRect = { x: tx, y: tyy, w: ti.im.w, h: ti.im.h, im: ti.im };
      R.tip = { x: tx, y: tyy, w: ti.im.w, h: ti.im.h, close: { x: tx + ti.close.x, y: tyy + ti.close.y, w: ti.close.w, h: ti.close.h }, never: { x: tx + ti.never.x, y: tyy + ti.never.y, w: ti.never.w, h: ti.never.h } };
    }
    // the dismissed tip flies into the bulb: 8 drawings (15 fps), shrinking 1 -> 0.15 toward the bulb's centre (eased
    // out: it leaves fast and settles in), the last two half / three-quarter dissolved; then the bulb glows (above)
    if (tipFly) {
      const k = EV.gridK(t - tipFly.t0), dr = Math.floor(k / 2);
      const tb = R.toolbar.tip;
      if (dr >= FLY_F / 2 || !tb) tipFly = null;
      else {
        const u = (dr + 1) / (FLY_F / 2), e = 1 - (1 - u) * (1 - u), f = 1 - 0.85 * u;
        const nD = FLY_F / 2, im0 = cached(`fly${dr}${tipFly.im.w}x${tipFly.im.h}${tipNever}${tipFly.t0}`, () => { const m = shrink(tipFly.im, f); return dr >= nD - 2 ? dissolve(m, dr === nD - 2 ? 0.5 : 0.75) : m; });
        const sx = tipFly.x + tipFly.im.w / 2, sy = tipFly.y + tipFly.im.h / 2, ex = tb.x + tb.w / 2, ey = tb.y + tb.h / 2;
        fastBlit(img, im0, Math.round(sx + (ex - sx) * e - im0.w / 2), Math.round(sy + (ey - sy) * e - im0.h / 2));
      }
    }
    // the popovers last (over the tip / prompt)
    if (emotePal) R.pal = popover([AB.EMOTES], R.bar[0].x + (BT >> 1), 'pal');
    if (trayOpen) R.tray = popover(AB.TRAY, R.bar[R.bar.length - 1].x + (BT >> 1), 'tray');
    // a tooltip over the hovered bar / palette / tray button (mouse only: a finger has no hover; none for a bar button
    // whose popover is open: it would cover the popover)
    if (!touchUI && hover && (hover.kind === 'pal' || hover.kind === 'tray' || (hover.kind === 'bar' && !(hover.k === 'emote' && emotePal) && !(hover.k === 'more' && trayOpen)))) {
      const list = hover.kind === 'bar' ? R.bar.map((r) => ({ ...r, ...AB.BAR.find((b) => b.k === r.k) })) : (hover.kind === 'pal' ? R.pal : R.tray)?.items ?? [];
      const it = list.find((r) => r.k === hover.k);
      if (it) {
        const label = it.hint ? `${it.tip} (${it.hint === 'SPC' ? 'Space' : it.hint === 'RMB' ? 'right-click' : it.hint})` : it.tip;
        const tt = cached(`tt|${label}|${T.ink}`, () => AB.tooltipImage(label, T));
        // (above the whole popover for a palette / tray button: over the row above it hid those buttons)
        const box = hover.kind === 'pal' ? R.pal : hover.kind === 'tray' ? R.tray : null;
        fastBlit(img, tt, Math.max(x0, Math.min(x1 - tt.w, it.x + (it.w >> 1) - (tt.w >> 1))), (box ? box.y : it.y) - 3 - tt.h);
      }
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
    // the tip's close / never-show row, the popovers, the bar first (they are drawn over the town and the dock)
    for (const [kind, box] of [['pal', R.pal], ['tray', R.tray]]) {
      if (!box || !inRect(s, box)) continue;
      const it = box.items.find((r) => inRect(s, r));
      return { kind, k: it?.k ?? null, code: it?.code ?? null, off: !!it?.off };
    }
    if (R.tip && inRect(s, R.tip)) return { kind: 'tip', k: inRect(s, R.tip.close) ? 'close' : inRect(s, R.tip.never) ? 'never' : null };
    for (const r of R.bar ?? []) if (inRect(s, r)) return { kind: 'bar', k: r.k };
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
      if (screenHit(s)) return;                // a right-click on a button / the tip: nothing (no pie over the HUD)
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
    // a click / tap elsewhere closes an open popover (and does nothing else)
    if (emotePal || trayOpen) { eat(e); consumeUp.add(0); emotePal = trayOpen = false; return; }
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
  function barAction(k) {
    if (k === 'emote') { emotePal = !emotePal; trayOpen = false; }
    else if (k === 'more') { trayOpen = !trayOpen; emotePal = false; }
    else if (k === 'point' || k === 'pin') { emotePal = trayOpen = false; armed = armed === k ? null : k; if (k === 'pin' && livePins().length >= MAX_PINS) { armed = null; toast(`You have ${MAX_PINS} pins: remove one first`, { kind: 'error', ms: 2600 }); } }
    else if (k === 'dock') { emotePal = trayOpen = false; input.has?.('KeyG') ? input.press('KeyG') : (dockOpen = !dockOpen); }
    else if (k === 'notebook') { emotePal = trayOpen = false; input.has?.('KeyJ') ? input.press('KeyJ') : nb.toggle(); }
  }
  function uiClick(hit) {
    if (hit.kind === 'tip') {
      if (hit.k === 'close') closeTip('close');
      else if (hit.k === 'never') { setTipNever(!tipNever); if (tipNever) closeTip('never'); }
    } else if (hit.kind === 'bar') barAction(hit.k);
    else if (hit.kind === 'pal') { if (hit.code && !hit.off) { input.press(hit.code); emotePal = false; } }
    else if (hit.kind === 'tray') { if (hit.code) input.press(hit.code); }
    else if (hit.kind === 'dockbtn') { dockOpen = !dockOpen; if (!dockOpen) armed = null; }
    else if (hit.kind === 'armedCancel') armed = null;
    else if (hit.kind === 'tool') {
      if (hit.k === 'notebook') nb.toggle();
      else if (hit.k === 'tip') { if (tipState) closeTip('bulb'); else tip(null, 0, { auto: false }); }
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
    else if (!rpress && !pie) { cursor = null; hover = null; setCursor(false); return; }
    const s = toScreen(e.clientX, e.clientY);
    if (rpress && !pie && Math.hypot(e.clientX - rpress.cx, e.clientY - rpress.cy) > (rpress.touch != null ? TOUCH_SLOP_PX : E.TIMING.RIGHT_DRAG_PX)) {
      if (rpress.touch != null) { if (e.pointerId === rpress.touch) rpress = null; }   // the finger moved first: a pan, not a press
      else openPie();
    }
    if (pie && !pie.commit && pie.cancel == null) {
      if (rpress?.touch != null) { if (e.pointerId !== rpress.touch) return; eat(e); }   // the finger slides over the wedges (no pan)
      pie.hot = wedgeAt(s); hover = null; return;
    }
    if (!hasControl()) { hover = null; setCursor(false); return; }
    const hit = screenHit(s);
    if (hit) { hover = hit; setCursor(!hit.off); return; }
    const own = pinAt(s);
    hover = own ? { kind: 'pin', pin: own } : null;
    setCursor(!!own);
  }
  // a hand cursor over what a click uses (your pins, the buttons): your pins are discoverable as removable
  let cursorOn = false;
  const setCursor = (on) => { if (on !== cursorOn) { cursorOn = on; canvas.style.cursor = on ? 'pointer' : ''; } };
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
  offs.push(events.on('ready', () => offs.push(input.bind('Escape', () => { if (pie) cancelPie(); armed = null; emotePal = trayOpen = false; if (tipState) closeTip('esc'); if (nb.isOpen) nb.close(); }, { desc: 'close the pie / notebook / tip / palettes', group: 'ui' }))));

  // ------------------------------------------------------------------------------------------------ per frame
  const api = {
    L, hud, notebook: nb, N,
    get options() { return { ...hud.uiOptions }; },
    portraits: portraitsReady,
    avatarURL,
    toast, tip, closeTip, setTipNever,
    /** the controls tip's tokens (mouse / touch wording) and its "never show again" choice (localStorage) */
    get tipTokens() { return tipTokensNow; }, get tipNever() { return tipNever; },
    /** (P2.8) an emote the character has no clip for: 'point' = the point pop over you. true = handled (no toast). */
    emoteFallback(clip) { if (clip === 'point' && you.id) { pop('you', 'point'); return true; } return false; },
    /** the action bar's buttons by key (the same path as a click: tests) + its tables (bar / emote palette / tray) */
    barAction, actions: { bar: AB.BAR, emotes: AB.EMOTES, tray: AB.TRAY },
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
        members: members.map((m) => { const k = talk.get(keyOf(m)); return { id: m.id, name: m.name, you: m.you, slot: m.slot, clip: m.clip, talking: !!k?.on, bubble: k?.line && t < k.bubbleUntil ? k.line : null, screen: L.atScreen(m.pos), shown: !!m._shown, ghostLabel: m.clip === 'ghost' || (m.you && m.ghost) }; }),
        hover: hover ? { kind: hover.kind, k: hover.k ?? null } : null,
        point: point ? { kind: point.target.kind, age: +(t - point.t0).toFixed(2), scale: hud.uiOptions.pointerScale, frameSize: framesNow().point?.size ?? 20 } : null,
        pie: pie ? { open: !pie.commit && pie.cancel == null, input: pie.input, sticky: pie.sticky, hot: pie.hot, items: pie.items.map((x) => x.key), off: [...pie.off], at: [pie.cx, pie.cy] } : null,
        pins: pins.map((p) => ({ kind: p.kind, color: p.color, removing: p.removeAt != null, at: p.kind === 'place' ? [+p.p.x.toFixed(2), +p.p.z.toFixed(2)] : null, slot: p.slot ?? null, screen: p.kind === 'place' ? L.atScreen(p.p) : null })),
        pops: pops.map((p) => ({ who: p.who, kind: p.kind, color: p.color, age: +(t - p.t0).toFixed(2) })),
        dock: { open: dockOpen, armed, color, rects: R.dock?.parts ?? null, button: R.dockBtn ?? null }, toolbar: R.toolbar ?? null,
        toasts: toasts.map((x) => x.text), tip: tipState && t < tipState.until,
        notebook: nb.info(), readers: readers.map((r) => ({ ...r })),
        books3d: N.book3d ? [...N.book3d.books.values()].filter((e) => e.book.root.visible).length : 0, mergedBooks: !!N.book3d?.merged,
        youIcon: you.id ? { p: 'atlas', t: 'thumb', i: 'initial' }[iconOf(you.id, you.name).iconKey[0]] : null,
        bar: R.bar ? R.bar.map((r) => ({ k: r.k, x: r.x, y: r.y, w: r.w, h: r.h })) : null,
        palette: R.pal ? { open: true, items: R.pal.items.map((r) => ({ k: r.k, code: r.code, off: r.off, x: r.x, y: r.y, w: r.w, h: r.h })) } : { open: emotePal },
        tray: R.tray ? { open: true, items: R.tray.items.map((r) => ({ k: r.k, code: r.code, x: r.x, y: r.y, w: r.w, h: r.h })) } : { open: trayOpen },
        tipState: { shown: !!tipState, auto: tipState?.auto ?? null, rect: R.tip ? { x: R.tip.x, y: R.tip.y, w: R.tip.w, h: R.tip.h, close: R.tip.close, never: R.tip.never } : null,
          flying: !!tipFly, glowing: t >= bulbGlow && t < bulbGlow + GLOW_S, never: tipNever, neverSaved: tipNeverSaved, shownCount: tipShown, dismissed: [...tipDismissed] },
        events: { ...evInfo, captions: [...evInfo.captions], caption: caption?.text ?? null, veil: !!veil, dawn: !!dawn, vote: R.vote ? { ...R.vote } : null, exec: !!exec, ghost: !!ghostFx, poof: !!poof },
        offscreen: offscreen.map((o) => ({ ...o })),
        /** your person pins' hit rects (screen texels, generous) as drawn last frame */
        personPins: personPinRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, color: r.pin.color, slot: r.pin.slot, removing: r.pin.removeAt != null })),
        cursor: canvas.style.cursor || 'default',
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
      // night falls / dawn breaks when the RUNNING clock crosses 20:00 / 06:00 (no jumps, <= 120 game min / s, at
      // most one veil / dawn per 20 s)
      const hNow = demo.time?.hours;
      if (Number.isFinite(hNow)) {
        if (prevHours !== null && hasControl()) {
          const sp = store.state.paused ? 0 : store.state.timeSpeed, dh = (hNow - prevHours + 24) % 24;
          const crossed = (b) => (prevHours < b && prevHours + dh >= b) || (prevHours < b + 24 && prevHours + dh >= b + 24) || (prevHours - 24 < b && prevHours - 24 + dh >= b);
          if (sp > 0 && sp <= 120 && dh > 0 && dh < 0.5 && t - lastVeil > 20) {
            if (crossed(20)) nightFalls('Night falls over Hollowmere.');
            else if (crossed(6)) dawnBreaks('Dawn breaks over Hollowmere.');
          }
        }
        prevHours = hNow;
      }
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
