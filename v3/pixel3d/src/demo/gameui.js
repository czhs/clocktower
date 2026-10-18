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
import { PixelImage, drawBox, drawText, textWidth, toCanvas, loadImage, frameAt, dissolve, withAlpha, GRID_HZ, tokens as kitTokens, hdPiece, PIN_COLORS, PIN_HEX } from '../ui/kit.js';
import { registerGroupFonts } from '../ui/fonts.js';
import { LABEL as HUD_LABEL } from '../ui/hud/font.js';
// UI density D=2 (docs/UI.md §2.10, docs/DEMO.md §4.7 "Density"): the whole screen tier on L.hd.screen in one logical
// coordinate system, labels / person pins on L.hd.world, place pins on the HD depth tier; ?uidensity=1 = the 1x A/B
import { toolButtonHD, ANCHORS_HD, pinWithIconHD, swatchHD, gloveHD, pinGlyphHD } from '../ui/hd/art.js';   // (OH) + pinGlyphHD
// (wave 2, docs/UI-HD-WAVE2.md) hud / events / emotes / panels at D=2
import { prepareWave2HD, worldLayerHD, drawExecutionFxHD } from '../ui/hd/wave2.js';
import { POP_HD, epx, shadeGrid } from '../ui/hd/emotes.js';
// (emoji reactions, docs/UI-EMOJI.md: the pie / dock reactions, the pin colour moved out of the way)
import * as EJ from '../ui/emotes/emoji.js';
import { prepareEmojiHD, EMOJI_POP_HD } from '../ui/hd/emoji.js';
import { installPanelsHD } from '../ui/hd/panels.js';
// (wave 1, UI.md §2.10.3) the markers / indicators / portraits HD art
import * as IH from '../ui/indicators/hd.js';
import { markerFramesHD, drawPointHD, putGroundHD } from '../ui/markers/hd.js';
import { drawPlacePinHD, drawPersonPinsHD, labelHD, up2 } from '../ui/hd/draw.js';
import { installHDCss } from '../ui/hd/css.js';
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
import { loadPortraits, goldFrame, goldFrameHD } from '../ui/portraits/atlas.js';
import * as EV from '../ui/events/draw.js';
import { formatClock } from './api.js';
import { sealVoteAt, VOTE_PER } from './sealvote.js';
import * as AB from './actionbar.js';
import { createNotebook } from './notebook.js';
import { createOverhead } from './overhead.js';   // (OH) one overhead stack per character (docs/DEMO.md §4.7 "Overhead stack")

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
  const offsHD = [];
  await registerGroupFonts();
  const canvas = engine.renderer.domElement;
  const todOf = (p) => (p === 'night' ? 'night' : p === 'golden' || p === 'dusk' || p === 'dawn' ? 'golden' : 'noon');
  const presetName = () => { const p = demo.time?.preset; return (p && (p.name ?? p)) || demo.town?.tod || 'noon'; };
  // (density) D=2 by default; ?uidensity=1 = today's 1x UI (the A/B); ?uipolicy= floor | ceil | <n> (1080p: 'round')
  const L = createUILayers(engine, { tod: todOf(presetName()), timeFn: (t) => t, density: Math.max(1, Number(params.get('uidensity') ?? 2) || 2) });
  if (L.hd) L.hd.useDepth();
  /** The HD tiers are in use (L.hd with art density 2: pixelScale >= 2; a pixelScale-1 window / phone keeps the 1x path). */
  const hdOn = () => !!(L.hd && L.hd.d > 1);
  const setHdPx = () => document.documentElement.style.setProperty('--hdpx', String(L.hd?.scale ?? 1));
  if (L.hd) { installHDCss(document); setHdPx(); addEventListener('resize', setHdPx); offsHD.push(() => removeEventListener('resize', setHdPx)); }
  // (wave 2, docs/UI-HD-WAVE2.md step 16) the DOM skin's 9-slices at --hdpx (panels, buttons, tabs, inputs ...) for the
  // control panel, the keys overlay and the notebook: scoped by .ctp-hd on #demo-ui; re-installed on day / night
  // Only at an EXACT density (L.hd.k === 2: 720p, 4K): at 1080p 'round' (k 1.5) the HD 9-slices are 4/3 of the 1x skin's
  // insets and the control panel's buttons truncated ("6…", "GO…"): there the DOM keeps the 1x skin (the page and the
  // notebook's text stay in the HD face)
  const skinHD = () => { if (!hdOn() || Math.abs(L.hd.k - 2) > 1e-6) return; try { installPanelsHD(document, L.tok); (document.getElementById('demo-ui') ?? document.documentElement).classList.add('ctp-hd'); } catch (e) { console.warn('[demo] gameui: no HD panel skin', e?.message || e); } };
  skinHD();
  // the context the library's runtime modules read (the subset of scenes/ui-hud.js buildHudStage they use)
  const hud = {
    engine, ui: L, P: (k, d) => params.get(k) ?? d, clock: (t) => t,
    get tod() { return todOf(presetName()); }, get tok() { return L.tok; },
    uiOptions: { bookStyle: store.state.bookStyle, pointerScale: store.state.pointerScale },
    setUiOptions(o = {}) { Object.assign(hud.uiOptions, o); },
  };
  const offs = [];
  offs.push(events.on('tod', (e) => { L.setTod(todOf(e?.preset?.name ?? e?.preset ?? presetName())); skinHD(); }));
  offs.push(store.on('bookStyle', ({ value }) => hud.setUiOptions({ bookStyle: value })));
  offs.push(store.on('pointerScale', ({ value }) => hud.setUiOptions({ pointerScale: value })));
  // a touch screen (coarse pointer; ?touch=1 / 0 forces it): touch wording in the dock, the armed pill and the tip
  const touchUI = params.get('touch') === '1' || (params.get('touch') !== '0' && coarsePointer());
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('rm') === '1'; } catch { return false; } })();

  // ---- portraits (out/ui/portraits.*: 12x12 icons for pins, 24x24 avatars for the dock button and the notebook)
  let PORT = null;
  // (critic P1-1) module-relative: the live demo serves the modules under v/<hash>/ next to a root index.html, so a
  // document-relative 'out/ui/' 404'd there (tools/demo-bundle.sh verify serves that staged layout now)
  // (a FILE url: tools/demo-bundle.sh resolves every new URL(..., import.meta.url) to a shipped file)
  // (density, UI.md §2.10.3 wave 1) { hd }: the HD atlas out/ui/portraits-hd.* from the SAME base: every icon / avatar
  // crop carries .hd (24-px icon / 48-px avatar re-rendered at 2x the texel density) + iconHD / avatarHD for the four
  // ids without a 1x portrait (wanderer, keeper, hound, duelist)
  const UI_BASE = new URL('../../out/ui/portraits.json', import.meta.url).href.replace(/portraits\.json$/, '');
  const portraitsReady = loadPortraits(UI_BASE, 'noon', { hd: !!L.hd }).then((p) => { PORT = p; return p; }).catch((e) => { console.warn('[demo] gameui: no portraits atlas', e?.message || e); return null; });
  const thumbs = new Map();                 // id -> PixelImage 24x24 from the roster thumbs (characters without atlas art)
  const avatarImg = (id) => PORT?.avatar(id) ?? thumbs.get(id) ?? null;
  const avatarHD = (id) => PORT?.avatarHD?.(id) ?? null, iconHD = (id) => PORT?.iconHD?.(id) ?? null;
  const urlCache = new Map();
  // (the notebook rows / panel tiles keep the 24-px 1x avatar: their CSS box is 24 px at 720p, a 48-px image there
  // would be halved, not sharper)
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
    // (density) the four without a 1x icon: their HD icon (24 px, used 1:1 by the HD pins)
    if (hdOn() && iconHD(id)) return { icon: iconHD(id), iconKey: `h:${id}` };
    // no icon_<id> in the atlas (the shipped four): the roster thumb (the same portrait the dock button shows), fitted
    // into 12x12; the initial only while the thumb has not loaded / for a character without one
    const th = thumbs.get(id);
    if (th) { const tk = `t:${id}`; if (!iconCache.has(tk)) iconCache.set(tk, thumbIcon(th)); return { icon: iconCache.get(tk), iconKey: tk }; }
    const k = `${String(name || id)[0].toUpperCase()}|${L.tok.textInk}`;
    if (!iconCache.has(k)) iconCache.set(k, initialIcon(k[0], L.tok));
    return { icon: iconCache.get(k), iconKey: `i:${k}` };
  };
  /** (density) the icon of YOUR pins at D=2 (wave 1): the atlas icon with its 24-px HD twin (.hd: the head fitted to the
   *  socket, the clear "who pinned" mark), the HD icon of the four, else the 24-px roster thumb 1:1, else the initial. */
  const pinIcon = () => {
    const i = iconOf(you.id, you.name);
    if (i.icon?.hd || i.iconKey.startsWith('h:')) return { icon: i.icon, key: `${i.iconKey}${i.icon.hd ? '+hd' : ''}` };
    const th = you.id ? thumbs.get(you.id) : null;
    if (th) return { icon: th, key: `ta:${you.id}` };
    return { icon: i.icon, key: i.iconKey };
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
  // (lift: a ghost's name stands over its HALO: the shared spec.ghost draws a gold halo above the head; the label sat on it)
  const mkMember = () => ({ id: '', name: '', pos: new THREE.Vector3(), height: 1.3, top: 1.3, face: 0, you: false, ghost: false, slot: -1, clip: 'idle', handle: null, lift: 0,
    head() { return this.pos.clone().setY(this.pos.y + this.top + 0.1 + this.lift); }, feet() { return this.pos.clone(); } });
  /** metres a ghost's label rises over the halo: spec.ghost.halo.lift (+ its hover) or ~0.3, + 0.1 (0 when not a ghost) */
  // (vote-fix6) + the bigger halo SPRITE (halos.js): the label's head point stands over the sprite's top + its glow
  // (last frame's), whatever the character (Chonk's own halo has no spec.ghost.halo.lift)
  const haloLift = (h, ghost, pos = null, top = 0) => {
    const ty = pos ? demo.passB?.halos?.topY?.(h) : null;
    const spriteLift = ty != null ? ty + 0.04 - (pos.y + top + 0.1) : 0;
    if (!ghost) return Math.max(0, spriteLift);
    const g = h?.spec?.ghost, hl = g?.halo?.lift;
    return Math.max(spriteLift, (hl != null ? hl + (g.hover ?? 0) : 0.3) + 0.18);   // (+0.1 still touched the halo on the walk's bob)
  };
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
      you.lift = haloLift(h, you.ghost || you.clip === 'ghost', you.pos, you.top);
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
      if (n.scale && n.scale !== 1) { m.height *= n.scale; m.top *= n.scale; }     // (B) the vote staging's cast scale
      m.pos.set(n.spot.x, groundY(n.spot.x, n.spot.z), n.spot.z); m.face = n.face; m.clip = n.handle.ch?.state?.clip ?? 'idle';
      m.lift = Math.max(haloLift(n.handle, !!m.clip?.startsWith?.('ghost')) * (n.scale || 1), haloLift(n.handle, false, m.pos, m.top));
      members.push(m);
    }
  };
  const npcOf = (slot) => members.find((m) => !m.you && m.slot === slot) ?? null;
  /** (seal vote) the vote camera is up with the cast on the seat stones (stage A, the default) */
  const vcRing = () => store.state.camera === 'vote' && !!demo.passB?.votecam && !staged() && !demo.player?.interior;
  const RING_C = new THREE.Vector3(demo.layout?.CIRCLE?.cx ?? 22.5, 0.2, demo.layout?.CIRCLE?.cz ?? 19.75);
  /** (vote-fix5, critic-4 P1-1) logical-px keep-outs of the vote for the HUD's tooltips / popovers: every seat's seal
   *  box (votemarks.js sealBoxOf: drawn or not) and the nominee's ring (+ its icon), padded */
  const voteKeepOuts = () => {
    const mk = demo.passB?.marks, out = [];
    if (!mk) return out;
    const f = t2l(), M = L.MARGIN ?? 0;
    const add = (b, p) => { if (b) out.push({ x0: (b.x0 - M) * f - p, x1: (b.x1 - M) * f + p, y0: (b.y0 - M) * f - p, y1: (b.y1 - M) * f + p }); };
    for (let i = 0; i < 15; i++) add(mk.sealBoxOf?.(i), 2);
    add(mk.nomineeBox?.(), 3);
    return out;
  };
  /** (B) the vote staging is up: the seated cast stand in the tower court (votestage.js) */
  const staged = () => { const st = demo.passB?.stage; return !!st && !st.onStones && !!st.active; };
  /** (B) art px reserved between a seated voter's head and name for its vote mark while the court is staged (else 0) */
  // (seal vote) 0: the vote's marks lie on the ground now (seals at the feet); nothing stands between head and name
  const MARK_SLOT = 0;
  const markSlotOf = (m) => (!m.you && m.slot >= 1000 && staged() && demo.passB?.marks && (store.state.phase === 'vote' || store.state.phase === 'nomination') ? MARK_SLOT : 0);
  /** (B) a seated cast member's label in the staged court: a titled name's last word when the full name is long */
  const labDebug = (demo.params ?? new URLSearchParams()).get('labDebug') === '1';   // (vote-fix4) window.__labDbg: the ring names' slots
  const courtName = (m) => {
    if (m.slot < 1000 && !m.you) return m.name;
    if (!(staged() || vcRing())) return m.name;
    // (vote-fix4) a NARROW screen (a phone: the ring is width-bound, ~half the names had no room) in the vote camera:
    // SHORT names - up to 8 letters as is; a longer titled name its last word when that is <= 8 letters, else its
    // initials ("Sir Croaksworth" -> "S.C."); a longer single word its first 5 letters + "." ("Clarabelle" -> "Clara.");
    // YOURS reads "You" (under the gold chevron)
    const nm = String(m.name), w = nm.split(' ');
    if (vcRing() && (W() - (cover.right || 0)) < 400) {
      if (m.you) return 'You';
      if (nm.length <= 8) return nm;
      if (w.length > 1) return w[w.length - 1].length <= 8 ? w[w.length - 1] : w.map((s) => s[0]).join('.') + '.';
      return nm.slice(0, 5) + '.';
    }
    if (m.you) return nm;
    return w.length > 1 && textWidth(nm) > 40 ? w[w.length - 1] : nm;
  };
  /** (critic P3-16) the ghost label's little sheet ghost at D=2 (the 1x 5x5 grid EPX'd + re-lit, 14 x 14; was 2x2 blocks) */
  const ghostWispHD = (T) => cached(`wispHD${T.ghost}${T.ghostSh}`, () => shadeGrid(epx(['.###.', '#####', '#-#-#', '#####', '#.#.#']),
    { '#': { hi: IA.rampOf(T.ghost).hi, mid: T.ghost, sh: T.ghostSh, line: IA.labelLineOf('ghost', T) }, '-': { flat: IA.labelLineOf('ghost', T), line: IA.labelLineOf('ghost', T) } }, { pad: 2, prefer: ['#'] }));

  // ---- screen helpers
  // ONE logical coordinate system for the screen tier (docs/UI.md §2.10.1 step 3): with D=2 the logical px = an HD px x
  // d (= 1 texel at even pixel scales; 4 device px at 1080p 'round': the logical screen is 480 x 270 there); every hit
  // rect R.*, the cover bands, the pie and info() are in logical px. Without D=2: logical px = the 1x screen texel.
  /** HD px per logical px (1 on the 1x path). */
  const dd = () => (hdOn() ? L.hd.d : 1);
  /** The logical screen image (the density view of L.hd.screen, or L.screen) and the image behind it (pieces blit there). */
  const SV = () => (hdOn() ? L.hd.screenView : L.screen), SB = () => (hdOn() ? L.hd.screen : L.screen);
  /** Device px per logical px. */
  const unitDev = () => (hdOn() ? L.hd.scale * L.hd.d : engine.pixelScale || 1);
  /** Texels -> logical px factor (1 on the 1x path and at even pixel scales; 0.75 at 1080p 'round'). */
  const t2l = () => (hdOn() ? L.hd.k / L.hd.d : 1);
  /** Logical screen px of a world point (L.atScreen on the 1x path). */
  const atS = (p) => { if (!hdOn()) return L.atScreen(p); const q = L.hd.atScreen(p), d = L.hd.d; return { x: Math.floor(q.x / d), y: Math.floor(q.y / d) }; };
  const W = () => SV()?.w ?? engine.lowW, H = () => SV()?.h ?? engine.lowH;
  /** client px -> logical screen px (the overlay maps the canvas bottom-up in whole squares). */
  const toScreen = (cx, cy) => {
    if (hdOn()) return L.hd.logical(cx, cy);
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
    const c = canvas.getBoundingClientRect(), k = (engine.width / Math.max(1, c.width)) / unitDev();
    let right = 0, left = 0, top = 0, leftBottom = 0;
    const panel = document.querySelector('#demo-ui > .dui-panel');
    if (panel && store.state.ui && panel.style.display !== 'none' && !panel.classList.contains('dui-away')) {
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
    if (st && store.state.ui && st.style.display !== 'none' && !st.classList.contains('dui-away')) {
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
  let tipFly = null;         // { t0, im, x, y, w, h, path } the dismissed tip on its way into the bulb
  let lastFly = null;        // the last flight's drawn centres (info)
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
    // (critic P1-1) the fly needs the plate's size: without w / h its centre was NaN and it drew at the top-left corner
    if (tipRect?.im && !reduced) { tipFly = { t0: L.t, im: tipRect.im, x: tipRect.x, y: tipRect.y, w: tipRect.w, h: tipRect.h, path: [] }; bulbGlow = L.t + FLY_F / GRID_HZ; }
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
  const pops = [];           // { who: 'you' | slot, kind, color (an emoji pop: its key), t0 }
  // (emoji, docs/UI-EMOJI.md "Pin colour: where it lives") the pin colour is AUTOMATIC per player by default
  // (EJ.autoPinColor of the player's identity: in the demo the character id, recomputed when you swap while auto is
  // on); a manual pick (the dock's colour button -> the AUTO + 8-dot picker, or the panel's "Pin colour" row) is saved
  // in localStorage 'ct-pin-color' (try / catch: no storage = this visit only). The pie never changes the colour.
  const PIN_KEY = 'ct-pin-color';
  const savedPin = lsGet(PIN_KEY);
  let colorAuto = !(savedPin && E.PIN_LABEL[savedPin]), pinSaved = null;
  // (critic-3 P2) never black (it read as no colour on the dark HUD): black counts as taken
  const autoColor = () => EJ.autoPinColor(demo.player?.handle?.id ?? store.state.character ?? 'you', { taken: new Set(['black']) });
  let color = colorAuto ? autoColor() : savedPin;
  /** 'auto' | a pin colour: the player's choice (save: localStorage; the test hook `gameui.color = c` does not save). */
  function setPinColor(c, { save = true } = {}) {
    if (c === 'auto') { colorAuto = true; color = autoColor(); if (save) pinSaved = lsSet(PIN_KEY, null); }
    else if (E.PIN_LABEL[c]) { colorAuto = false; color = c; if (save) pinSaved = lsSet(PIN_KEY, c); }
    else return false;
    events.emit('gameui:pincolor', { color, auto: colorAuto, saved: pinSaved });
    return true;
  }
  offs.push(events.on('player:character', () => { if (colorAuto) { const c = autoColor(); if (c !== color) { color = c; events.emit('gameui:pincolor', { color, auto: true, saved: pinSaved }); } } }));
  const livePins = () => pins.filter((p) => p.removeAt == null);
  // a new pop from the same person replaces theirs (one pop per head, as v2's bubbles)
  const pop = (who, kind, c = 'gold') => { for (let i = pops.length - 1; i >= 0; i--) if (pops[i].who === who) pops.splice(i, 1); pops.push({ who, kind, color: c, t0: L.t }); if (pops.length > 24) pops.shift(); };
  // ---- reactions (emoji over the head): yours by the pie / the dock / 1-7 while the dock is open, with a cooldown;
  // the townsfolk's (the NPCs + the seated cast) from the game's moments, scheduled on the demo clock (deterministic)
  let lastReact = -1e9, lastReactKey = null;
  const reactions = { you: 0, cast: 0, byKey: {} };
  function react(key, target = null) {
    if (!EJ.emojiInfo(key) || !demo.player) return false;
    if (L.t - lastReact < EJ.EMOJI_TIMING.COOLDOWN_MS / 1000) return false;
    lastReact = L.t; lastReactKey = key;
    if (target?.member || target?.ground) {
      const p = target.member ? target.member.pos : target.ground;
      demo.player.faceTo?.(p.x, p.z);
    }
    pop('you', 'emoji', key);
    reactions.you++; reactions.byKey[key] = (reactions.byKey[key] ?? 0) + 1;
    events.emit('gameui:emoji', { key, target: target?.member?.slot ?? null });
    return true;
  }
  const reactQueue = [];     // { who (slot), key, at (L.t) }: townsfolk reactions waiting for their moment
  /** A townsperson (NPC slot / seated cast 1000 + seat) reacts with `key` in `delay` s (one pop per head). */
  function npcReact(who, key, delay = 0) { if (EJ.emojiInfo(key)) reactQueue.push({ who, key, at: L.t + delay }); }
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
    else if (target.ground) {
      pins.push({ kind: 'place', p: target.ground.clone(), color: c, t0: L.t, removeAt: null, behind: target.piece ?? null });
      // (critic P3-12) behind a roof: say so (the HD tier also draws its x-ray outline over whatever hides it)
      if (target.piece) {
        const nm = target.piece === 'clocktower' ? 'the clock tower' : demo.layout?.houses?.find((q) => q.id === target.piece)?.name ?? 'a cottage';
        toast(`Pin dropped behind ${nm}${hdOn() ? ' (shown as an outline)' : ''}`, { ms: 2800 });
      }
    } else return false;
    closePopovers();
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
      // (the pin body in logical px: 18 x 26 art px at either density: the HD pin is 36 x 52 HD px = 18 x 26 logical)
      const q = atS(p.p);
      if (s.x >= q.x - 9 && s.x <= q.x + 9 && s.y >= q.y - 26 && s.y <= q.y + 1) return p;
    }
    return null;
  };
  // a townsperson under a screen point (their projected body box)
  const memberAt = (s) => {
    let best = null, bd = Infinity;
    const k = t2l();
    for (const m of members) {
      const f = atS(m.pos), hd = atS(m.head());
      if (s.x < f.x - 9 * k || s.x > f.x + 9 * k || s.y < hd.y - 3 * k || s.y > f.y + 2 * k) continue;
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
    let ground = null, piece = null;
    try {
      const pk = demo.player?.pickAt?.(clientX, clientY), g = pk?.ground;
      if (g) ground = new THREE.Vector3(g.x, demo.player?.interior ? demo.player.interior.floorY ?? 0 : groundY(g.x, g.z), g.z);
      // (critic P3-12) the ray met a cottage / the tower first: a place pin lands on the ground BEHIND it (depth-hidden)
      piece = pk?.piece && pk.piece !== 'dais' ? pk.piece : null;
    } catch { ground = null; }
    // (the pie's "Remove my pin" also when the press is on a townsperson who carries your pin)
    const own = ownPin ?? (member && !member.you ? personPinOf(member) : null);
    return { s, member: member && !member.you ? member : null, onYou: member?.you ?? false, ownPin: own, ground, piece };
  }

  // ---- the radial pie (emotes art; screen tier, at the press point)
  let rpress = null;         // { cx, cy, t0 (ms), target, touch: pointerId | undefined (a finger: the long press) }
  let pie = null;            // { cx, cy, press: {dx, dy}, items, off, target, tOpen0, hot, sticky, stickyAt, commit: {i, t0}, cancel: t0 }
  const pieG = (p) => E.PIE[p?.input === 'touch' ? 'touch' : 'mouse'];   // wedge geometry of the pie size (touch: bigger)
  function openPie() {
    if (!rpress) return;
    const input = rpress.touch != null ? 'touch' : 'mouse', t = rpress.target, R = E.PIE[input].R;
    const cx = Math.max(R + 4, Math.min(W() - R - 4, t.s.x)), cy = Math.max(R + 4 + 20 + cover.top, Math.min(H() - R - 4, t.s.y));
    // (emoji) Point · agree · trust · laugh · gasp · [Remove my pin] · question · suspicious · disagree · Pin (ONE
    // wedge in your current colour); pressed on yourself the reactions read "... yourself"
    const items = EJ.pieItemsEmoji({ name: t.member?.name ?? (t.onYou ? you.name : null), self: !t.member && !!t.onYou, removable: t.ownPin ? { mine: true } : null, color });
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
    else if (it.kind === 'pin') dropPin(t, it.color);          // (emoji) the pie never changes the colour
    else if (it.kind === 'emoji') react(it.emoji, t);
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
    // (B) where the seat's cast member stands NOW (the vote staging moves them off the stones)
    const at = demo.passB?.seats?.spotOf?.(i);
    if (at) m.pos.copy(at.pos); else m.pos.copy(P);
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
    const sw = demo.time?.sweep ?? { from: nom, t0: engine.time, per: VOTE_PER };
    const N = s.seats.length, per = EV.TIMING.vote.perVoterF / GRID_HZ;
    const order = [], reach = [], ghosts = [], dead = [];
    for (let k = 1; k <= N; k++) {
      const i = (sw.from + k) % N, st = s.seats[i];
      if (!(st.occupied || st.dead)) continue;
      if (st.dead) { dead.push(i + 1); if (st.ghostVote) ghosts.push(i + 1); }
      // (seal vote) who votes is the seals' log (sealvote.js, time.seals): a seal lying at a seat when the clock hand
      // reaches it counts; the events vote only keeps the order + the clock (raise unused)
      order.push(i + 1); reach.push(sw.t0 + (k - 1) * sw.per);
    }
    if (!order.length) { vote = null; return; }
    const alive = order.length - dead.length;
    vote = { v: EV.makeVote({ nominee: nom + 1, order, raise: {}, ghosts, dead, t0: 0, needed: Math.max(1, Math.ceil(alive / 2)) }), reach, per, t0: L.t, result: false };
    evInfo.votes++;
    // (critic-3 P1-3) the caption names the nominee (their seat's character): up for the whole sweep in the staged
    // court; on the stones (stage A) for 4.5 s (the tally plaque names the nominee for the whole vote, and a caption up
    // for the whole sweep sat over the tower dial)
    setCaption(`${isAre(seatName(nom))} nominated. Slap a seal to vote.`, 'hand', staged() ? (reach[reach.length - 1] - L.t) + per + 0.2 : 4.5);
  }
  const isAre = (n) => (n === 'You' ? 'You are' : `${n} is`);
  /** (critic-3 P1-3) the display name of the cast member on seat i (0-based): "You" on your own seat */
  function seatName(i) {
    if (i == null || i < 0) return 'Nobody';
    if (demo.passB?.seats?.yours === i) return 'You';
    const m = (demo.npcs?.members ?? []).find((n) => n && n.slot === 1000 + i);
    return m?.handle?.name ?? m?.id ?? `Seat ${i + 1}`;
  }
  /** the seal vote's state now (sealvote.js), or null */
  const sealState = (t = L.t) => (vote ? sealVoteAt({ v: vote.v, clock: voteClock(t), reach: vote.reach, per: vote.per }, t, demo.time?.seals?.log ?? new Map()) : null);
  // (seal vote) the threshold (votemarks.js: the tally reached the votes needed): the caption switches to the block
  offs.push(events.on('vote:threshold', ({ nominee } = {}) => {
    if (!vote) return;
    const left = staged() ? Math.max(1.5, (vote.reach[vote.reach.length - 1] - L.t) + vote.per + 2.5) : 3.5;
    setCaption(`${isAre(seatName(nominee ?? vote.v.nominee - 1))} on the block!`, 'bell', left);
  }));
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
    else if (value === 'execution' && nom != null) { exec = { t0: L.t, seat: nom }; evInfo.executions++; setCaption(`The bell tolls for ${seatName(nom) === 'You' ? 'you' : seatName(nom)}.`, 'bell', EV.TIMING.execution.captionF / GRID_HZ); }
    else if (value === 'day') setCaption('A new day in Hollowmere.', 'sun', 3);
  }));
  offs.push(store.on('nominee', () => { if (store.state.phase === 'vote') startVote(); }));
  // ---- (emoji) the townsfolk react to the game's moments (docs/UI-EMOJI.md step 6; deterministic picks: hashes of the
  // seat / the nominee, delays on the demo clock). Seated cast = slot 1000 + seat (seatcast.js), idle NPCs = slot 0..5.
  const hashK = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const livingSeats = (except = -1) => store.state.seats.map((st, i) => (st.occupied && !st.dead && i !== except ? i : -1)).filter((i) => i >= 0);
  const npcSlots = () => (demo.npcs?.members ?? []).filter((n) => n && n.slot < 1000).map((n) => n.slot);
  offs.push(store.on('phase', ({ value }) => {
    const s = store.state, nom = s.nominee ?? s.seats.findIndex((x) => x.nominated);
    if (value === 'nomination' && nom >= 0) {
      // a nomination: one or two of the circle eye the nominee (suspicious)
      const alive = livingSeats(nom);
      if (alive.length) {
        const a = alive[Math.floor(hashK(nom + 1) * alive.length)], b = alive[Math.floor(hashK(nom + 9) * alive.length)];
        npcReact(1000 + a, 'suspicious', 0.7);
        if (b !== a) npcReact(1000 + b, 'suspicious', 1.5);
      }
      const n = npcSlots();
      if (n.length) npcReact(n[Math.floor(hashK(nom + 4) * n.length)], 'suspicious', 1.1);
    } else if (value === 'execution' && nom >= 0) {
      // the execution: the nominee's neighbours gasp; an idle townsperson too
      let k = 0;
      for (const d of [1, -1, 2, -2]) { const j = (nom + d + 15) % 15, st = s.seats[j]; if (st?.occupied && !st.dead) npcReact(1000 + j, 'shocked', 0.5 + 0.35 * k++); }
      for (const sl of npcSlots()) npcReact(sl, 'shocked', 0.9 + 0.3 * sl);
    }
  }));
  // a death outside the execution (a night kill, the panel's dead toggle): the neighbours gasp
  offs.push(store.on('seats', ({ value, prev }) => {
    if (!prev || store.state.phase === 'execution') return;
    value.forEach((st, i) => {
      if (!st.dead || prev[i]?.dead) return;
      for (const [d, dl] of [[1, 0.4], [-1, 0.8]]) { const j = (i + d + 15) % 15; if (value[j]?.occupied && !value[j].dead) npcReact(1000 + j, 'shocked', dl); }
    });
  }));
  /** The vote's result (once per vote, from the events vote at its end): the counted voters agree, a few of those who
   *  kept their hands down disagree, the nominee gasps when the vote put them on the block. */
  function reactToVote() {
    if (!vote || vote.reacted) return;
    const VS = sealState(L.t);
    if (!VS.done) return;
    vote.reacted = true;
    let ky = 0, kn = 0;
    for (const seat of vote.v.order) {
      const d = VS.seats?.[seat], i = seat - 1;
      if (!d || seat === vote.v.nominee || store.state.seats[i]?.dead) continue;
      if (d.yes && ky < 6) npcReact(1000 + i, 'agree', 0.25 + 0.16 * ky++);
      else if (d.no && kn < 3 && hashK(seat + vote.v.nominee) < 0.6) npcReact(1000 + i, 'disagree', 0.45 + 0.22 * kn++);
    }
    if (VS.passed) npcReact(1000 + vote.v.nominee - 1, 'shocked', 0.2);
  }
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
    // (wave 2, docs/UI-HD-WAVE2.md steps 7-9) HD: the bell / wisp / reveal / poof on the HD world tier (worldLayerHD:
    // HD logical px), the tolls on the 1x ground; the execution dim stays on the 1x layer (z 2)
    const LW = hdOn() ? worldLayerHD(LL) : LL;
    if (exec) { if (hdOn()) drawExecutionFxHD(evHud, LL, F, seatMember(exec.seat), exec.t0, { t, still: reduced }); else EV.drawExecution(evHud, LL, F, seatMember(exec.seat), exec.t0, { t, still: reduced, layer: 'fx', Tn }); }
    if (ghostFx && you.id) {
      const k = EV.gridK(t - ghostFx.t0);
      if (k > 30) ghostFx = null;
      else {
        const feet = LW.at(you.feet()), lt0 = LL.at(you.head()).y + IA.LABEL_DY, lt = hdOn() ? Math.round(lt0 * L.hd.k / L.hd.d) : lt0;
        EV.drawWisp(LW, F, Math.floor(k / 3), feet.x, feet.y - EV.WISP_LIFT, lt);
        const rd = Math.floor((k - 12) / 2);
        if (k >= 12 && rd < 4 && !reduced) EV.put(LW.world, F, `reveal_${rd}`, feet.x, feet.y - 6, 'reveal');
      }
    }
    if (poof) { const k = EV.gridK(t - poof.t0); if (k >= EV.TIMING.poof.frames * EV.TIMING.poof.hold) poof = null; else EV.drawPoof(LW, F, LW.at(poof.pos), k, { appear: true }); }
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
  let pickerOpen = false;                             // (emoji) the dock's pin-colour picker (AUTO + 8 dots)
  const R = {};                                       // hit rects (screen texels) from the last frame
  let cursor = null;                                  // last pointer {clientX, clientY, s} over the canvas
  const consumeUp = new Set();

  // ---- the notebook (DOM) + the readers
  // (critic P2-5) where the notebook's avatar box is HD-sized (--hdpx >= 2: 1080p and up) it shows the 48-px HD portrait
  // 1:1 (the atlas crop's .hd, or the HD-only four); at 720p the 24-px 1x one in its 24-px box
  const hdURL = new Map();
  const nbAvatarURL = (id) => {
    if (!(hdOn() && (L.hd?.scale ?? 1) >= 2)) return avatarURL(id);
    if (hdURL.has(id)) return hdURL.get(id);
    const a = PORT?.avatar(id)?.hd ?? avatarHD(id);
    if (!a) return avatarURL(id);
    const u = toCanvas(a).toDataURL('image/png');
    hdURL.set(id, u);
    return u;
  };
  const nb = createNotebook(demo, {
    avatarURL: nbAvatarURL,
    // (density) the D=2 pixel face on the page + the notebook's own text (src/ui/hd/css.js; --hdpx = L.hd.scale)
    hd: hdOn(), hdpx: () => L.hd?.scale ?? 1,
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
  // (density) every cache key carries the art density: a window that changes pixel scale redraws its pieces
  const cached = (k, fn) => { k = `${dd()}|${k}`; let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 500) cache.delete(cache.keys().next().value); } return v; };
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
  // ---- (density) the screen tier's pieces: drawn ONCE through a density view (kit hdPiece: every kit / group drawer
  // works unchanged: D=2 text and frames, HD sprites where they exist, 2x2 blocks elsewhere) and blitted into
  // L.hd.screen at logical x d; on the 1x path a plain PixelImage into L.screen. Sizes / rects stay in logical px.
  /** A screen piece: fn(img) draws into a w x h logical image (a view when HD); returns the backing image (.r = fn's result, .view). */
  const mkImg = (w, h, fn) => {
    if (hdOn()) return hdPiece(w, h, fn, L.hd.d);
    const im = new PixelImage(w, h); im.view = im; im.r = fn(im) ?? null; return im;
  };
  /** Logical width of a piece. */
  const lw = (im) => Math.ceil(im.w / dd());
  /** Blit a piece at logical (x, y) into the screen tier. */
  const putS = (im, x, y) => fastBlit(SB(), im, Math.round(x * dd()), Math.round(y * dd()));
  /** A centred / cropped screen piece (the prompt): cropped to what it drew, the crop start aligned to logical px. */
  const pieceS = (key, w, h, fn) => cached(`S${key}`, () => {
    const D = dd(), im = mkImg(w, h, fn), bb = im.bbox();
    if (!bb) return { im: new PixelImage(1, 1), dx: 0, dy: 0, r: im.r };
    const x0 = Math.floor(bb.x / D) * D, y0 = Math.floor(bb.y / D) * D;
    return { im: im.crop(x0, y0, bb.x + bb.w - x0, bb.y + bb.h - y0), dx: x0 / D, dy: y0 / D, r: im.r };
  });
  const bubbleEnv = (t, born, until) => {
    if (t < born || t >= until) return null;
    const a = gfr(t - born), out = until - IA.SPEECH.fadeOutMs / 1000;
    if (t < out) return { dissolve: 0, pop: a < 2 };
    const b = Math.min(2, Math.floor(gfr(t - out) / 6));
    return { dissolve: [0.25, 0.5, 0.75][b], pop: false };
  };

  // tier A + Ag: labels, glyphs, chevron, ring, bubbles, pops (z 20 / 35); the point + person pins (z 15 trail / 30)
  // (B) labels that would print over each other (the vote staging's tight row of seated cast) step up one label row:
  // drawn lowest first, a label that overlaps one already placed this frame moves up 11 texels (at most twice); the
  // test is in texels for both densities (HD: the same step x L.hd.k)
  const placedLabels = [];
  const byHead = [];
  // (OH) ---- the overhead stacks (overhead.js): from the head up halo zone | name + talk glyph | chevron or your pins
  // | pop | bubble, resolved across neighbours in screen space. Here: this frame's units (HD world px at D=2, texels on
  // the 1x path), the visible area and the HUD keep-outs (logical px), the halo / seal / nominee boxes (units).
  const OH = createOverhead(), ohPop = new Map();
  const ohK = () => (hdOn() ? L.hd.k : 1);
  const ohPins = (m) => { if (m.you) return 0; let n = 0; for (const p of pins) if (p.kind === 'person' && p.slot === m.slot && p.id === m.id) n++; return n; };
  const ohMark = (m) => { const mt = m.slot >= 1000 ? demo.passB?.marks?.topOf?.(m.slot - 1000) : null; return mt == null ? null : mt * ohK(); };
  const ohFrame = (LL, figs) => {
    const HD = hdOn(), u = ohK(), d = dd();
    let lo = { x: LL.MARGIN, y: LL.MARGIN };
    if (HD) { const P = members[0]?.pos ?? RING_C, a = L.hd.at(P), s = L.hd.atScreen(P); lo = { x: a.x - s.x * 1, y: a.y - s.y }; }
    const keep = [];
    if (R.topRow) for (const [a, b] of R.topRow.spans) keep.push({ x: a, y: 0, w: b - a, h: R.topRow.y1 });
    for (const r of [...Object.values(R.toolbar ?? {}), ...(R.bar ?? []), R.dock, R.dockBtn, R.tip, R.vote]) if (r) keep.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    for (const c of R.clients ?? []) for (const r of c.rects) keep.push(r);
    for (const o of offscreen) keep.push({ x: o.at[0] - 22, y: o.at[1] - 22, w: 44, h: 44 });
    const obstacles = [];
    for (const b of demo.passB?.halos?.boxes?.() ?? []) {
      const own = members.find((m) => { const p = LL.at(m.head()); return p.x >= b.x0 && p.x <= b.x1 && b.y1 >= p.y - 2 && b.y0 <= LL.at(m.pos).y; });
      obstacles.push({ x0: b.x0 * u, y0: b.y0 * u, x1: b.x1 * u, y1: b.y1 * u, who: own ? keyOf(own) : null, kind: own ? 'halo' : 'mark' });
    }
    for (const b of figs) if (b.slot === -1) obstacles.push({ x0: b.x0 * u, y0: b.y0 * u, x1: b.x1 * u, y1: b.y1 * u, who: null, kind: 'mark' });
    return { hd: HD, u, d, lu: d, lo, t: LL.t, keep, obstacles,
      vis: { x0: (cover.left || 0) + 2, y0: (cover.top || 0) + 2, x1: W() - (cover.right || 0) - 2, y1: H() - 2 } };
  };
  L.add((LL) => {
    const T = LL.tok, t = LL.t;
    placedLabels.length = 0;
    byHead.length = 0;
    for (const m of members) { m._hy = LL.at(m.head()).y; byHead.push(m); }
    byHead.sort((a, b) => b._hy - a._hy);
    // (seal vote, critic-3 P1-1) the vote camera on the stones (stage A): every seated figure's box (texels) is a
    // keep-out for the OTHER seats' names, so no name ever sits over another seat
    const ring = vcRing(), figs = [];
    const mine = demo.passB?.seats?.yours ?? -1;
    if (ring) for (const m of members) {
      const slot = m.you ? (mine >= 0 ? 1000 + mine : -2) : m.slot;
      if (slot < 1000) continue;
      const f = LL.at(m.pos), h = LL.at(m.head()), bw = Math.max(4, Math.round((0.3 * (m.scale ?? 1)) / engine.camera.texelWorld));
      figs.push({ slot: m.you ? -3 : m.slot, x0: f.x - bw, x1: f.x + bw, y0: h.y - 2, y1: f.y + 1 });
      // (and every seat's wax seal spot, its own too: a name never covers a seal - votemarks.js sealBoxOf)
      const sb = demo.passB?.marks?.sealBoxOf?.(slot - 1000);
      if (sb) figs.push({ slot: -1, ...sb });
    }
    // (vote-fix5) the nominee's ring + the stocks: no name over them either
    { const nb = ring ? demo.passB?.marks?.nomineeBox?.() : null; if (nb) figs.push({ slot: -1, ...nb }); }
    // (vote-fix6) the ghost halo sprites (halos.js): no name over a halo either
    if (ring) for (const b of demo.passB?.halos?.boxes?.() ?? []) figs.push({ slot: -1, ...b });
    OH.begin(ohFrame(LL, figs)); ohPop.clear();   // (OH)
    for (const m of byHead) {
      m._shown = false;
      // whole character above the view: no label (the indicators' rule); labels near the top edge clamp inward
      if (!visible(m) || LL.at(m.pos).y < LL.MARGIN) continue;
      // (seal vote, critic-3 P3) the idle townsfolk are not part of the vote: no names in the vote camera
      if (ring && !m.you && m.slot < 1000) continue;
      const p = LL.at(m.head());
      // (B) in the staged court a seated voter's vote mark (hand / seal / snuffer, votemarks.js) has its own slot between
      // the head and the name (MARK_SLOT art px): over the name it landed on the stepped-up label of the row above
      const slotA = markSlotOf(m), slotT = Math.round(slotA * (hdOn() ? L.hd.d / L.hd.k : 1));
      let top = Math.max(LL.MARGIN + 2 + (m.you ? 8 : 0), p.y + IA.LABEL_DY - slotT);
      // (P3.9) a label the DOM covers (the control panel's band, the folded panel's top band, the open notebook) is
      // not drawn at all (it peeked out above the panel's top edge), nor its stack (bubble, pins, pops)
      // (in logical screen px: the cover bands and the HUD rects are)
      const f2 = t2l(), sx = (p.x - LL.MARGIN) * f2, sy = (top - LL.MARGIN) * f2, hw = 40;
      if ((cover.right && sx + hw > W() - cover.right) || (cover.left && sx - hw < cover.left) || (cover.top && sy < cover.top + 2)) continue;
      // nor under the HUD's own top row (the clock / phase chips, the toolbar: a label clamped at the top edge sat
      // under the clock chip): last frame's rects
      if (sy < (R.topRow?.y1 ?? 0) && R.topRow.spans.some(([a, b]) => sx + 30 > a && sx - 30 < b)) continue;
      m._shown = true;
      // the "you are here" ring, except while your big 3D book stands in front of you (it would print over the pages:
      // L.ground keeps only CHARACTER texels, the book is a prop). (wave 1) HD: a ground decal on the HD depth tier
      // (putGroundHD: per-row ground depth, hidden under characters like L.ground)
      if (m.you && !(hud.uiOptions.bookStyle === 'big' && readers.some((r) => r.who === 'you'))) {
        const f = LL.at(m.pos), k = reduced ? 0 : frameAt(t, 2.5, 4);
        if (hdOn()) { const F2 = L.hd.at(m.pos); putGroundHD(L.hd, IH.youRingHD(k, T), F2.x - 32, F2.y - 16, m.pos, { anchorRow: 16 }); }
        else fastBlit(LL.ground, cached(`ring${k}${T.gold}`, () => IA.youRing(k, T)), f.x - 16, f.y - 8);
      }
      // the name label (indicators art), drawn once per name + token set: drawText at (cx, top) = this crop at (cx + dx, top - 1 + dy)
      // a ghost (your ghost STATE: player.ghost, walking too; or a ghost clip): the indicators' ghost label variant
      // (ghost ink + the little sheet ghost)
      const ghostly = !!m.clip?.startsWith?.('ghost') || (m.you && m.ghost);
      // (B) in the staged vote court a titled cast name shows its short form ("Archivist Hoot" -> "Hoot"): 15 names in
      // one crescent did not fit side by side
      const nm = courtName(m);
      // (critic P3-15) general label de-collision: the overlap step-up (texels; the label box = the name + its 1-px
      // ring, + the wisp for a ghost) and the label clamped inside the view's left / right edges ("eeper")
      // (in texels: an HD label is d / k texels per art px: 4/3 of the 1x size at 1080p 'round')
      const uS = hdOn() ? L.hd.d / L.hd.k : 1, rowT = 11 * uS;
      const lwT = Math.ceil((textWidth(nm) + 4 + (ghostly ? 7 : 0)) * uS), WW = LL.world?.w ?? engine.lowW;
      let cxT = Math.max(LL.MARGIN + 2 + (lwT >> 1) + (ghostly ? 7 : 0), Math.min(WW - LL.MARGIN - 2 - (lwT >> 1), p.x));
      // (seal vote, critic-3 P1-1) the vote camera on the stones: a seat's name stays CLOSE to its own figure - beside
      // it, outward, for the ring's left / right seats (their neighbours stand above / below them on screen), tight over
      // the head for the far / near arcs; at most a half-row nudge, never over another seat (else it is left out: the
      // seal, the spotlight and the figure still show the seat)
      let side = 0;
      // (vote-fix5, critic-4 P3) YOUR name too: on your stone it takes the same close slots (it stepped up two rows over
      // the ring's names at 1080p, ~100 px above your figure)
      const ringLab = ring && (m.slot >= 1000 || (m.you && mine >= 0));
      const selfSlot = m.you ? -3 : m.slot, seatOf = m.you ? mine : m.slot - 1000;
      let lx0 = cxT - (lwT >> 1);
      let steps = 0;
      const maxSteps = ringLab ? 1 : staged() ? 3 : 2, stepT = ringLab ? Math.round(rowT / 2) : rowT;
      // (a 2-texel gap counts as touching: long back-row names in the court ran into each other)
      const hits = () => placedLabels.some((r) => lx0 < r.x1 + 2 && lx0 + lwT > r.x0 - 2 && Math.abs(top - r.top) < rowT)
        || (ringLab && figs.some((b) => b.slot !== selfSlot && lx0 < b.x1 && lx0 + lwT > b.x0 && top < b.y1 && top + rowT - 2 > b.y0));
      const clampCx = (x) => Math.max(LL.MARGIN + 2 + (lwT >> 1) + (ghostly ? 7 : 0), Math.min(WW - LL.MARGIN - 2 - (lwT >> 1), x));
      if (ringLab) {
        // (vote-fix4) the slots tried in order, the first one clear of every other name, figure and seal wins: beside the
        // figure outward (the ring's left / right seats) + a half-row up, over the head + a half-row up, UNDER THE FEET
        // (below its own seal: the phone's ring had no room left for half the names), beside it inward (over the dais)
        const c = LL.at(RING_C), f = LL.at(m.pos), ax = f.x - c.x, ay = (f.y - c.y) / Math.max(0.3, Math.sin(engine.camera.pitch));
        const cs = ax / Math.max(1e-3, Math.hypot(ax, ay));
        const bw = Math.max(4, Math.round((0.3 * (m.scale ?? 1)) / engine.camera.texelWorld));
        const sideOf = Math.abs(cs) > 0.6 ? Math.sign(cs) : 0;
        const sideCx = (sg) => (sg > 0 ? f.x + bw + 2 + (lwT >> 1) : f.x - bw - 2 - (lwT >> 1));
        const sideTop = Math.round(p.y + (f.y - p.y) * 0.28), headTop = Math.round(p.y + IA.LABEL_DY + 2);
        const sb = demo.passB?.marks?.sealBoxOf?.(seatOf);
        const footTop = Math.round(Math.max(f.y + 2, sb && Math.abs((sb.x0 + sb.x1) / 2 - f.x) < lwT ? sb.y1 + 1 : f.y + 2));
        const cands = [];
        if (sideOf) cands.push([sideOf, sideCx(sideOf), sideTop, 0], [sideOf, sideCx(sideOf), sideTop - stepT, 1]);
        cands.push([0, p.x, headTop, 0], [0, p.x, headTop - stepT, 1], [2, f.x, footTop, 0]);
        // (inward: past its own seal, which lies on that side of the feet)
        const inCx = !sideOf ? 0 : sideOf > 0 ? Math.min(sideCx(-1), sb ? sb.x0 - 2 - (lwT >> 1) : Infinity) : Math.max(sideCx(1), sb ? sb.x1 + 2 + (lwT >> 1) : -Infinity);
        // (first hugging the figure just above its own seal, then past the seal)
        if (sideOf && sb) cands.push([-sideOf, sideCx(-sideOf), Math.min(sideTop, sb.y0 - rowT + 1), 0]);
        if (sideOf) for (const y of [sideTop, sideTop - stepT, sideTop + stepT, headTop, footTop]) cands.push([-sideOf, inCx, y, 0]);
        cands.push([2, f.x, footTop + stepT, 0]);
        let pick = null;
        const dbg = labDebug ? [] : null;
        for (const [sg, x, y, st] of cands) {
          cxT = clampCx(x); lx0 = cxT - (lwT >> 1); top = y;
          if (!hits()) { pick = [sg, x, y, st]; break; }
          if (dbg) dbg.push(`${sg}@${lx0},${top}:${placedLabels.filter((r) => lx0 < r.x1 + 2 && lx0 + lwT > r.x0 - 2 && Math.abs(top - r.top) < rowT).map((r) => 'L' + (r.who.slot - 1000)).join('')}${figs.filter((b) => b.slot !== m.slot && lx0 < b.x1 && lx0 + lwT > b.x0 && top < b.y1 && top + rowT - 2 > b.y0).map((b) => (b.slot === -1 ? 'S' : 'F' + (b.slot - 1000))).join('')}`);
        }
        if (dbg) (window.__labDbg ??= {})[seatOf] ={ f: [f.x, f.y], w: lwT, pick: pick ? pick.slice(0, 3) : null, miss: dbg };
        pick ??= cands[0];
        side = pick[0]; cxT = clampCx(pick[1]); lx0 = cxT - (lwT >> 1); top = pick[2]; steps = pick[3];
      } else if (!ring && !staged()) {
        // (OH) a TOWN name slides a little (it still spans its head) or steps up whole rows until its whole core (name +
        // talk glyph + chevron / pins fan) clears the cores already placed (overhead.js labelSteps: hysteresis; the
        // predicted row in the tier's units)
        const HDp = hdOn(), kU = ohK(), dU = dd(), q0 = HDp ? L.hd.at(m.head()) : p;
        const y0 = HDp ? Math.max(Math.round((LL.MARGIN + 2 + (m.you ? 8 : 0)) * kU), q0.y + (IA.LABEL_DY - slotA) * dU) - dU : top - 1;
        const ls = OH.labelSteps(keyOf(m), { x0: HDp ? q0.x + Math.round((cxT - p.x) * kU) - Math.round((lwT * kU) / 2) : lx0, y0, w: Math.round(lwT * kU), h: 11 * dU, step: HDp ? 11 * dU : stepT },
          { hx: q0.x, glyph: !!talk.get(keyOf(m))?.on, wisp: ghostly, chev: m.you, pins: ohPins(m) });
        steps = ls.steps; top -= steps * stepT; cxT += ls.dx / kU; lx0 = cxT - (lwT >> 1);
      } else while (steps < maxSteps && hits()) { top -= stepT; steps++; }
      // in the staged court a name that still collides after the steps is left out (a narrow phone frame): unreadable
      // overprinted names were worse than a missing one (its vote mark, pops and talk glyph still show)
      if ((staged() || ringLab) && !m.you && hits()) {
        m._labelTop = Math.round(p.y + IA.LABEL_DY - slotT); m._stack = m._labelTop - 1; m._noLabel = true;
        OH.core(keyOf(m), { hx: hdOn() ? L.hd.at(m.head()).x : p.x, top: Math.round(m._labelTop * ohK()), pins: ohPins(m), mark: ohMark(m) });   // (OH) no name: the stack starts there
        continue;
      }
      m._noLabel = false;
      top = Math.round(top);
      placedLabels.push({ x0: lx0, x1: lx0 + lwT, top, h: rowT, who: m });
      if (hdOn()) {
        // (density) the label on L.hd.world (body@2 in a 2-HD-px ring; ghost: the ghost ink + the HD wisp), the talk
        // glyph and your chevron in their wave-1 HD art; the stack above it is kept in texels (bubbles / pins convert
        // with k)
        const k = L.hd.k, d = L.hd.d, q = L.hd.at(m.head());
        const lb = labelHD(LL, m.head(), nm, ghostly ? 'ghost' : 'player', T, { x: q.x + Math.round((cxT - p.x) * k), top: ringLab ? Math.round(top * k) : Math.max(Math.round((LL.MARGIN + 2 + (m.you ? 8 : 0)) * k), q.y + (IA.LABEL_DY - slotA) * d) - steps * 11 * d });
        if (ghostly) fastBlit(L.hd.world, ghostWispHD(T), lb.x - 7 * d, lb.y + 2 * d);
        const tk = talk.get(keyOf(m));
        if (tk?.on) {
          const step = reduced ? 0 : IA.talkStep(t), kind = m.you ? 'self' : 'talk';
          fastBlit(L.hd.world, IH.talkGlyphHD(step, kind, T), lb.x + lb.w + d, lb.y);
        }
        const chevY = lb.top - (8 + (reduced ? 0 : frameAt(t, 2, 2))) * d;
        if (m.you) fastBlit(L.hd.world, IH.youChevronHD(T), q.x - 4 * d, chevY);
        m._labelTop = Math.floor((m.you ? lb.top - 8 * d : lb.top) / k);
        m._stack = side ? Math.floor(p.y) - 2 : m._labelTop - 1;
        { // (OH) the core as drawn: name (+ wisp, talk glyph), chevron (its bob reserved); the pins stand on it
          const wi = ghostly ? ghostWispHD(T) : null, gi = tk?.on ? IH.talkGlyphHD(0, m.you ? 'self' : 'talk', T) : null, ci = m.you ? IH.youChevronHD(T) : null;
          OH.core(keyOf(m), { label: lb, wisp: wi && { x: lb.x - 7 * d, y: lb.y + 2 * d, w: wi.w, h: wi.h }, glyph: gi && { x: lb.x + lb.w + d, y: lb.y, w: gi.w, h: gi.h },
            chev: ci && { x: q.x - 4 * d, y: lb.top - 9 * d, w: ci.w, h: ci.h + d }, hx: q.x, top: side ? Math.round((Math.floor(p.y) - 1) * k) : lb.y, pins: ohPins(m), mark: ohMark(m) });
        }
        continue;
      }
      const lab = ghostly
        ? piece(`labg${nm}${T.ghost}`, 160, 12, (im) => { const g = IA.labelImage(nm, 'ghost', T); im.blit(g, 80 - (g.w >> 1), 0); })
        : piece(`lab${nm}${T.labelText}${T.labelLine}`, 160, 12, (im) => IA.label(im, 80, 1, nm, 'player', T));
      const lx = cxT - 80 + lab.dx, ly = top - 1 + lab.dy;   // (top: after the overlap step-up above; x clamped)
      fastBlit(LL.world, lab.im, lx, ly);
      const tk = talk.get(keyOf(m));
      if (tk?.on) {
        const step = reduced ? 0 : IA.talkStep(t), kind = m.you ? 'self' : 'talk';
        fastBlit(LL.world, cached(`g${kind}${step}${T.labelLine}`, () => IA.talkGlyph(step, kind, T)), lx + lab.im.w + 1, top - 1);
      }
      if (m.you) fastBlit(LL.world, cached(`chev${T.gold}`, () => IA.youChevron(T)), p.x - 4, top - 8 - (reduced ? 0 : frameAt(t, 2, 2)));
      m._labelTop = top - (m.you ? 8 : 0);
      m._stack = side ? Math.floor(p.y) - 2 : m._labelTop - 1;
      OH.core(keyOf(m), { label: { x: lx, y: ly, w: lab.im.w, h: lab.im.h }, glyph: tk?.on ? { x: lx + lab.im.w + 1, y: top - 1, w: 9, h: 9 } : null,   // (OH) the core as drawn
        chev: m.you ? { x: p.x - 4, y: top - 9, w: 9, h: 7 } : null, hx: p.x, top: side ? Math.floor(p.y) - 1 : ly, pins: ohPins(m), mark: ohMark(m) });
    }
    // (OH) the transients, front to back (overhead.js place): each member's pop (emoji / emote / system: one per head,
    // the newest) over its core, then its speech bubble on top; slid sideways or stacked higher off every other stack,
    // the HUD and the view's edges. The bubble is drawn here, the pop in the pins / pops pass (z 30) at its slot.
    // Speech bubbles (NPC talk lines): (B) not while the vote court is staged (a chatter bubble from the nomination
    // covered the back row's names; the talk glyph still shows who speaks), nor in the vote camera on the stones
    const noBubbles = staged() || store.state.camera === 'vote';
    // every pop first (yours first, then front to back), then the bubbles: the chatter yields to the reactions
    const ohOrder = [...byHead].sort((a, b) => Number(b.you) - Number(a.you));
    for (const pass of [0, 1]) for (const m of ohOrder) {
      if (!m._shown) continue;
      const key = keyOf(m), D = dd(), HDp = hdOn();
      if (pass === 0) for (let i = pops.length - 1; i >= 0; i--) {
        const q = pops[i];
        if (!(q.who === 'you' ? m.you : !m.you && q.who === m.slot)) continue;
        const isE = q.kind === 'emoji', ps = isE ? EJ.emojiPopState(t, q.t0, { reduced }) : E.popState(t, q.t0, { reduced });
        if (ps.f < 0) break;
        const fr = (f) => { const im = isE ? EJ.emojiPopFrame(q.color, f, T) : E.popFrame(q.kind, f, T, q.color || 'gold'); return HDp ? im.hd : im; };
        const A = HDp ? (isE ? EMOJI_POP_HD.anchor : POP_HD.anchor) : (isE ? EJ.EMOJI_POP.anchor : E.POP.anchor);
        const rel = OH.popRel(`${D}|${HDp}|${isE}|${q.kind}|${q.color}`, (isE ? [0, 1, 2, 3] : [0, 1]).map(fr), A, D);
        if (rel) { const s = OH.place(key, 'pop', rel); if (s) ohPop.set(q, s); }
        break;
      }
      if (pass === 0) continue;
      const tk = talk.get(key);
      if (!tk?.line || noBubbles) continue;
      const env = bubbleEnv(t, tk.bubbleAt, tk.bubbleUntil);
      if (!env) continue;
      const lines = cached(`lines${tk.line}`, () => IA.bubbleLines(tk.line)), sz = IA.bubbleSize(lines), hw = Math.floor(sz.w / 2);
      // the box ((w + 1) x (h + 3) art px with its tail + shadow), centred on the head; it slides only as far as its
      // tail still reaches over the head
      const S = OH.place(key, 'bubble', { x0: -hw * D, y0: -(sz.h + IA.BUBBLE_TAIL_H + 1) * D, x1: (sz.w + 1 - hw) * D, y1: 0 }, { slide: [Math.max(0, hw - 6) * D, Math.max(0, (hw - 6) >> 1) * D] });
      if (!S) continue;
      const tailX = Math.max(5, Math.min(sz.w - 5, Math.round((S.hx - S.x0) / D)));
      if (HDp) {
        // (wave 1) the HD bubble (D=2 frame + body@2 text + a stepped HD tail)
        let bi = cached(`bubhd${tk.line}${tailX}${env.pop}${T.bubble}`, () => IH.bubbleHD(lines, tailX, T, { pop: env.pop }));
        if (env.dissolve > 0) bi = dissolve(bi.clone(), env.dissolve, S.x0 & 3, S.y0 & 3);
        fastBlit(L.hd.world, bi, S.x0, S.y0);
        continue;
      }
      let im = env.pop ? IA.bubblePop(lines, tailX, T) : cached(`bub${tk.line}${tailX}${T.bubble}`, () => IA.bubble(lines, tailX, T));
      if (env.dissolve > 0) im = dissolve(im.clone(), env.dissolve, S.x0 & 3, S.y0 & 3);
      fastBlit(LL.world, im, S.x0, S.y0);
    }
  }, 20);
  // the point emote (finger + trail + ping) and person pins: markers draw.js in its phases (trail z 15, main z 30)
  const pointDraw = (LL) => {
    const F = framesNow(), t = LL.t;
    if (point) {
      const age = t - point.t0;
      if (age >= MT.EMOTE_POINT_MS / 1000) point = null;
      else if (you.id && visible(you) && hdOn()) {
        // (wave 1) the HD finger + bead trail (L.hd.world) and the HD ping (a ground decal on the depth tier); the
        // phases as drawPoint (LL.phase: trail z 15 under the labels, main z 30)
        const FH = markerFramesHD(LL.tok, hud.uiOptions.pointerScale === 'v2' ? 'v2' : 'new'), H = L.hd;
        const head = H.at(you.pos.clone().setY(you.pos.y + you.height * 0.72));
        if (point.target.kind === 'person') {
          const m = npcOf(point.target.slot);
          if (m && m.id === point.target.id) drawPointHD(LL, FH, { head, aim: H.at(m.pos.clone().setY(m.pos.y + m.height * 0.4)), spot: H.at(m.pos), spotP: m.pos, person: true, age, still: reduced });
        } else { const s = H.at(point.target.p); drawPointHD(LL, FH, { head, aim: s, spot: s, spotP: point.target.p, person: false, age, still: reduced }); }
      } else if (you.id && visible(you)) {
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
      const st = OH.status(keyOf(m));   // (OH) the status row over the name (overhead.js core: units, the fan's bottom)
      const icon = iconOf(you.id, you.name), cx = LL.at(m.head()).x, labelTop = st ? st.bottom : m._stack + 1;
      const hv = hover?.kind === 'pin' ? list.indexOf(hover.pin) : -1;
      if (st?.compact) {
        // (OH) a crowded name (overhead.js labelSteps): your pins as small pin glyphs at its left end; hit rects as below
        const HDp = hdOn(), d = dd(), head = m.head(), q = HDp ? L.hd.at(head) : null, s0 = HDp ? L.hd.atScreen(head) : null;
        list.filter((p) => p.removeAt == null).forEach((p, i) => {
          const x = st.x - (i + 1) * st.step + d, y = st.y;
          fastBlit(HDp ? L.hd.world : LL.world, HDp ? pinGlyphHD(p.color, LL.tok) : E.pinIconSmall(p.color, LL.tok), x, y);
          const lx = HDp ? (x + s0.x - q.x) / d : x - LL.MARGIN, ly = HDp ? (y + s0.y - q.y) / d : y - LL.MARGIN;
          personPinRects.push({ pin: p, x: Math.floor(lx) - 3, y: Math.floor(ly) - 3, w: 13, h: 15, hw: { x, y } });
        });
        continue;
      }
      if (hdOn()) {
        // (density) HD pins on L.hd.world with YOUR 24-px portrait 1:1 in the socket (the clear "who pinned" icon)
        const H = L.hd, k = H.k, d = H.d, head = m.head(), q = H.at(head), labelTopHD = st ? st.bottom : Math.round(labelTop * k);   // (OH)
        const pi = pinIcon();
        drawPersonPinsHD(LL, { cx: q.x, labelTopHD, t, still: reduced, hover: hv,
          pins: list.map((p) => ({ color: p.color, icon: pi.icon, iconKey: pi.key, age: t - p.t0, removeAt: p.removeAt })) });
        // hit rects (logical screen px, generous): the HD world box -> HD screen (this frame's offset) -> logical
        const s0 = H.atScreen(head), ox = s0.x - q.x, oy = s0.y - q.y;
        const n = list.length, mid = (n - 1) / 2, spread = Math.min(0.62, 2.4 / Math.max(1, n));
        list.forEach((p, i) => {
          const kk = i - mid, dx = n > 1 ? Math.round(kk * 18 * spread) : 0, dy = n > 1 ? Math.round(Math.abs(kk) * 1.5) : 0;
          const hx = q.x + dx * d - ANCHORS_HD.pin.x, hy = labelTopHD - d + dy * d - ANCHORS_HD.pin.y;
          personPinRects.push({ pin: p, x: Math.floor((hx + ox) / d) - 3, y: Math.floor((hy + oy) / d) - 3, w: Math.ceil(36 / d) + 6, h: Math.ceil(52 / d) + 6, hw: { x: hx, y: hy } });
        });
        m._stack -= Math.ceil(52 / k) + 2;
        continue;
      }
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
    // (OH) emote / emoji pops at their overhead slots (overhead.js place, in the label pass: over the name, the pins,
    // a seated voter's vote mark; in the vote ring off every other seat's name as before). (emoji) a reaction pop: the
    // emoji emotes' bubble + glyph (burst, hold 2.7 s, dissolve); (wave 2) the HD pop (.hd) on L.hd.world
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i], isE = q.kind === 'emoji';
      const ps = isE ? EJ.emojiPopState(t, q.t0, { reduced }) : E.popState(t, q.t0, { reduced });
      if (ps.f < 0) { if (t > q.t0 + 1) pops.splice(i, 1); continue; }
      const s = ohPop.get(q);
      if (!s) continue;
      const pf = isE ? EJ.emojiPopFrame(q.color, ps.f, LL.tok) : E.popFrame(q.kind, ps.f, LL.tok, q.color || 'gold');
      const A1 = isE ? EJ.EMOJI_POP.anchor : E.POP.anchor, AH = isE ? EMOJI_POP_HD.anchor : POP_HD.anchor;
      if (hdOn()) { if (pf.hd) fastBlit(L.hd.world, pf.hd, s.ax - AH.x, s.ay - AH.y - ps.bob * L.hd.d); }
      else fastBlit(LL.world, pf, s.ax - A1.x, s.ay - A1.y - ps.bob);
    }
  };
  L.add((LL) => pointDraw(Object.assign(Object.create(LL), { phase: 'trail' })), 15);
  L.add((LL) => pointDraw(Object.assign(Object.create(LL), { phase: 'main' })), 30);
  // place pins: depth-tested (markers pinPass, order 301): whoever stands in front hides them
  const pinPass = createPinPass(engine, L, { timeFn: (t) => t });
  pinPass.add((P) => {
    if (hdOn()) return;                    // (density) the HD depth tier draws them (below)
    const F = framesNow(), t = P.t;
    const icon = iconOf(you.id, you.name);
    for (const p of pins) {
      if (p.kind !== 'place') continue;
      const q = P.at(p.p);
      drawPlacePin(P, F, { spot: { x: q.x, y: q.y, d: P.depthOf(p.p) }, color: p.color, ...icon, age: t - p.t0, removeAt: p.removeAt,
        hover: hover?.kind === 'pin' && hover.pin === p, still: reduced });
    }
  });
  // (density) place pins on the HD depth tier (L.hd.putDepth: whoever stands in front hides them, labels stay on top),
  // 36 x 52 HD px with your portrait 1:1; a pin dropped behind a roof (critic P3-12) gets its x-ray: a dotted outline
  // of its silhouette on L.hd.world (not depth tested), so it reads through whatever hides it
  const xrayOf = (color, T) => cached(`xray${color}${T.parchmentHi}`, () => {
    const src = pinWithIconHD(color, null, T, ''), o = new PixelImage(src.w + 2, src.h + 2);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (src.alpha(x - 1, y - 1) || (x + y) & 1) continue;
      if (src.alpha(x - 2, y - 1) || src.alpha(x, y - 1) || src.alpha(x - 1, y - 2) || src.alpha(x - 1, y)) o.set(x, y, T.parchmentHi);
    }
    return o;
  });
  L.add((LL) => {
    if (!hdOn()) return;
    const t = LL.t, pi = pinIcon();
    for (const p of pins) {
      if (p.kind !== 'place') continue;
      const age = t - p.t0;
      const on = drawPlacePinHD(LL, { p: p.p, color: p.color, icon: pi.icon, iconKey: pi.key, age, removeAt: p.removeAt, hover: hover?.kind === 'pin' && hover.pin === p, still: reduced });
      if (on && p.behind && p.removeAt == null && age > MT.DROP_MS / 1000) { const q = L.hd.at(p.p); fastBlit(L.hd.world, xrayOf(p.color, LL.tok), q.x - ANCHORS_HD.pin.x - 1, q.y - ANCHORS_HD.pin.y - 1); }
    }
  }, 31);
  // the hovered own pin's tooltip (emotes art) above everything anchored
  L.add((LL) => {
    if (hover?.kind !== 'pin' || hover.pin.removeAt != null) return;
    if (hdOn()) {   // (density) through the HD world view (D=2 text + frame), at logical = HD / d
      const V = L.hd.worldView, d = L.hd.d;
      if (hover.pin.kind === 'person') {
        const r = personPinRects.find((x) => x.pin === hover.pin);
        if (r) E.drawPinTip(V, Math.round((r.hw.x + 18) / d), Math.floor(r.hw.y / d), `Your pin on ${hover.pin.name ?? 'them'} · click to remove`, LL.tok, { removable: true });
        return;
      }
      const q = L.hd.at(hover.pin.p);
      E.drawPinTip(V, Math.round(q.x / d), Math.floor(q.y / d) - 28, 'Your pin · click to remove', LL.tok, { removable: true });
      return;
    }
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
  // (wave 1) the HD disc icons: 24x24 with the HD swatch (the clear centre dot) / the HD glove centred (-> 36x36 discs)
  const pinDiscIconHD = (c, T) => cached(`pdih${c}${T.ink}`, () => { const im = new PixelImage(24, 24), g = swatchHD(c, T, { icon: 'dot' }); im.blit(g, (24 - g.w) >> 1, (24 - g.h) >> 1); return im; });
  const pointDiscIconHD = (T) => cached(`ptdih${T.ink}`, () => { const im = new PixelImage(24, 24), g = gloveHD(T); im.blit(g, (24 - g.w) >> 1, (24 - g.h) >> 1); return im; });
  L.add((LL) => {
    offscreen.length = 0;
    const img = SV(), T = LL.tok, HD = hdOn(), d = dd();
    if (!img || !LL.screen) return;
    const ax0 = 4 + cover.left, ax1 = img.w - 4 - cover.right, ay0 = cover.top + 26, ay1 = img.h - 30;
    if (ax1 - ax0 < 60 || ay1 - ay0 < 40) return;
    const list = [];
    const seen = new Set();
    const want = (key, pos, icon, name, label, hi = null) => { if (seen.has(key) || list.length >= 6) return; seen.add(key); list.push({ key, pos, icon, name, label, hi }); };
    // (HD: a person's 48-px HD avatar: the atlas crop's .hd, or avatarHD for the four)
    const avHD = (id) => avatarImg(id)?.hd ?? avatarHD(id) ?? null;
    if (point && LL.t - point.t0 < MT.EMOTE_POINT_MS / 1000) {
      if (point.target.kind === 'person') { const m = npcOf(point.target.slot); if (m) want(`m${m.slot}`, m.pos, avatarImg(m.id), m.name, 'point', HD ? avHD(m.id) : null); }
      else want('pt', point.target.p, pointDiscIcon(T), 'here', 'point', HD ? pointDiscIconHD(T) : null);
    }
    for (const p of pins) {
      if (p.removeAt != null) continue;
      if (p.kind === 'person') { const m = npcOf(p.slot); if (m && m.id === p.id) want(`m${m.slot}`, m.pos, avatarImg(m.id), m.name, 'pin', HD ? avHD(m.id) : null); }
      else want(`p${pins.indexOf(p)}`, p.p, pinDiscIcon(p.color, T), 'your pin', 'pin', HD ? pinDiscIconHD(p.color, T) : null);
    }
    const cxs = (ax0 + ax1) / 2, cys = (ay0 + ay1) / 2;
    for (const o of list) {
      const f = atS(o.pos);
      if (f.x >= ax0 && f.x < ax1 && f.y >= ay0 && f.y < ay1) continue;
      const dx = f.x - cxs, dy = f.y - cys, d8 = IA.dir8Of(dx, dy);
      // HD: the wave-1 disc (indicators/hd.js) straight onto L.hd.screen; 1x: the indicators' disc on L.screen
      const ic = HD ? (o.hi ?? o.icon) : o.icon;
      const dp = cached(`edisc${HD}${o.key}${ic ? ic.w : 0}${o.name}${d8}${T.ink}`, () => (HD ? IH.edgeDiscPointerHD(IH.edgeDiscHD(ic, T, o.name), d8, T) : IA.edgeDiscPointer(IA.edgeDisc(ic, T, o.name), d8, T)));
      const r = (dp.img.w / 2 - dp.pad) / d, m = r + IA.EDGE_TAIL + 3;
      const k = Math.min(((ax1 - ax0) / 2 - m) / Math.max(1e-6, Math.abs(dx)), ((ay1 - ay0) / 2 - m) / Math.max(1e-6, Math.abs(dy)));
      const x = Math.round(cxs + dx * k), y = Math.round(cys + dy * k);
      fastBlit(SB(), dp.img, x * d - (dp.img.w >> 1), y * d - (dp.img.h >> 1));
      offscreen.push({ key: o.key, kind: o.label, d8, at: [x, y] });
    }
  }, 57);

  // tier S: the HUD. (density) Everything here is in LOGICAL px and lands on L.hd.screen through its density view
  // (img = SV()): cached pieces (mkImg / putS) for what is drawn once per state, direct view calls for the per-frame
  // parts (pie, armed pill, vote clock). The night veil stays on the 1x L.screen (under this tier).
  const shot = { chip: null, chipKey: '', phase: null, phaseKey: '' };
  const STAGE = { day: 'discussion', nomination: 'nominations', vote: 'nominations', execution: 'nominations', night: 'bedtime' };
  const LABEL = { nomination: 'Nominations', vote: 'The vote', execution: 'Execution', night: 'Night' };
  // (critic P3-11) the chips follow the HOUR and say it in plain words: the day phase after 20:00 / before 06:00 is
  // "NIGHT 1" with the moon (it read "DAY 1 ☼" at 23:00) and its clock chip switches to the night stage + "NIGHT" at the
  // veil (it read GOLDEN at 20:00); the execution is "EXECUTION" with the bell (it read the v2 jargon "BEDTIME 1")
  const nightHours = (h) => h >= 20 || h < 6;
  const phaseChipOf = (phase, h) => (phase === 'nomination' ? ['Nominations', 'ring'] : phase === 'vote' ? ['The vote', 'ring'] : phase === 'execution' ? ['Execution', 'bell']
    : phase === 'night' || nightHours(h) ? ['Night 1', 'moon'] : ['Day 1', 'sun']);
  const dayWord = (h) => (nightHours(h) ? 'Night' : h < 11 ? 'Morning' : h < 14 ? 'Midday' : h < 17 ? 'Afternoon' : 'Evening');
  const SHORT_WORD = { Morning: 'Morn', Midday: 'Noon', Afternoon: 'Day', Evening: 'Eve' };
  /** The phase chip (hud art drawPhaseChip's look: an iron pill, LABEL caps, the icon) with our own wording. */
  const phaseChip = (img, rx, y, T, label, icon) => {
    const s = label.toUpperCase(), w = 6 + textWidth(s, HUD_LABEL) + 4 + icon.w + 6, h = 11, x = rx - w;
    drawBox(img, x, y, w, h, { line: 'outline', edge: 'iron', fill: 'ink', hi: 'inkRaised', sh: null, corner: 2, shadow: false }, T);
    drawText(img, x + 6, y + 3, s, { color: T.text, font: HUD_LABEL });
    img.blit(icon, x + 6 + textWidth(s, HUD_LABEL) + 4, y + 2);
    return { x, w, h };
  };
  const toolbar = [{ k: 'tip', g: (T, lit) => AB.bulb(T, lit), title: 'the controls tip' }, { k: 'notebook', g: (T) => HA.GLYPH.notebook(T), title: 'Notebook (J)' }, { k: 'panel', g: (T) => HA.GLYPH.gear(T), title: 'controls (`)' }, { k: 'help', g: (T) => HA.GLYPH.help(T), title: 'keys (H)' }];
  const TOOL_HD = { tip: 'tip', notebook: 'notebook', panel: 'gear', help: 'help' };
  // the action bar's popovers: the emote palette, the tray with every other key (critic P2-5: one popover at a time:
  // the palette, the tray and the social dock close each other)
  let emotePal = false, trayOpen = false, tapTip = null;
  function closePopovers() { emotePal = trayOpen = false; }
  // (seal vote) YOUR SEAL: while you sit in the vote (seatcast.js yours) the bar leads with the seal button (X): slap
  // your seal down / take it back; it shows LIT while your seal lies on the ground
  const roomSeen = { room: null, t: 0 }, ROOM_LINE_S = 3.5;
  const SEAL_BTN = { k: 'seal', tip: 'Vote: slap your seal down / take it back', hint: 'X', glyph: 'seal' };
  const sealBtnOn = () => (demo.passB?.seats?.yours ?? -1) >= 0 && (store.state.phase === 'vote' || store.state.phase === 'nomination');
  // (vote-fix5, critic-4 P2-3) the COMPACT bar while the vote camera is up on the stones: your seal, the emotes, the
  // reactions dock, more - parked BOTTOM LEFT (votecam.js KEEP.bar), so the ring's near tip can sit at the bottom centre
  const COMPACT = new Set(['emote', 'dock', 'more']);
  // (vote-fix5, critic-4 P2-7) the one-row reaction strip of a narrow vote camera: cells (logical px) + the widest
  // visible area that uses it (votecam.js KEEP.strip mirrors its box: 7 x 15 + 6 = 111 x 23)
  const STRIP = { cw: 15, ch: 17 }, STRIP_MAX_W = 300;
  const compactBar = () => vcRing();
  const barList = () => { const b = compactBar() ? AB.BAR.filter((x) => COMPACT.has(x.k)) : AB.BAR; return sealBtnOn() ? [SEAL_BTN, ...b] : b; };
  // (vote-fix5, critic-4 P1-1) after a click on a bar button in the vote camera its tooltip stays hidden until the
  // pointer leaves that button (it covered the nominee and the near seats for the whole vote)
  let barQuiet = null;
  const VOTE_TIPS = { seal: 'Vote', emote: 'Emotes', dock: 'React', more: 'More' };
  // (vote-fix5, critic-4 P2-5) your seal's state for the bar's tag: 'vote' (open, no seal down: pulsing), 'voted' (down,
  // the hand not there yet), 'counted' / 'novote' (the hand passed you), null (no tag)
  const mySealTag = (t) => {
    if (!sealBtnOn() || store.state.phase !== 'vote') return null;
    const y = demo.passB.seats.yours, d = sealState(t)?.seats?.[y + 1];
    if (!d) return null;
    if (d.yes) return 'counted';
    if (d.no) return 'novote';
    return demo.time?.seals?.downAt?.(y, t) ? 'voted' : 'vote';
  };
  const TAG_TEXT = { vote: 'VOTE', voted: 'VOTED', counted: 'COUNTED', novote: 'NO VOTE' };
  const tagImg = (kind, T) => cached(`sealtag|${kind}|${T.ink}`, () => {
    const s = TAG_TEXT[kind], w = 6 + textWidth(s, HUD_LABEL) + 6, h = 11;
    return mkImg(w + 1, h + 1, (v) => {
      const gold = kind === 'counted' || kind === 'vote';
      drawBox(v, 0, 0, w, h, gold ? 'gold' : { line: 'outline', edge: kind === 'voted' ? 'gold' : 'iron', fill: 'ink', hi: 'inkRaised', sh: null, corner: 2, shadow: false }, T);
      drawText(v, 6, 3, s, { color: gold ? T.textInk : kind === 'voted' ? T.goldHi : T.textDim, font: HUD_LABEL });
    });
  });
  const sealHalo = (T, on) => cached(`sealhalo|${on}|${T.ink}`, () => mkImg(AB.BTN + 8, AB.BTN + 8, (h) => {
    for (let yy = 4; yy < AB.BTN + 4; yy++) for (let xx = 4; xx < AB.BTN + 4; xx++) h.set(xx, yy, T.goldHi);
    h.outline(T.goldHi, {}); if (on) h.outline(withAlpha(T.goldHi, 120), {}); h.outline(withAlpha(T.gold, on ? 90 : 60), {});
    for (let yy = 4; yy < AB.BTN + 4; yy++) for (let xx = 4; xx < AB.BTN + 4; xx++) h.erase(xx, yy);
  }));
  const barW = (n) => n * (AB.BTN + AB.GAP) - AB.GAP;
  const btnImg = (key, o) => cached(`btn|${key}|${o.state}|${o.hint}|${touchUI}|${L.tok.ink}`, () => mkImg(AB.BTN + 2, AB.BTN + 2, (v) => AB.buttonInto(v, L.tok, { ...o, showHint: !touchUI })));
  /** A 1x sprite as a screen piece (through the view: blocks, or its .hd). */
  const wrap1x = (g) => (hdOn() ? mkImg(g.w, g.h, (v) => v.blit(g, 0, 0)) : g);
  const hoverIs = (kind, k) => hover?.kind === kind && hover.k === k;
  /** Nearest-neighbour down-scale (the tip flying into the bulb). */
  const shrink = (im, f) => {
    const w = Math.max(1, Math.round(im.w * f)), h = Math.max(1, Math.round(im.h * f)), o = new PixelImage(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = im.get(Math.min(im.w - 1, Math.floor(x / f)), Math.min(im.h - 1, Math.floor(y / f))); if (c[3]) o.set(x, y, c); }
    return o;
  };
  const hasEmote = (k) => { const h = demo.player?.handle; if (!h) return false; if (k === 'point') return true; if (k === 'ghost' && h.id === 'storyteller') return false; const c = h.emotes?.[k]; return !!(c && h.spec?.clips?.[c]); };
  /** (critic P3-9) why a palette emote is greyed: the tooltip and the toast on a click. */
  const emoteWhy = (k) => {
    const h = demo.player?.handle, nm = h?.name ?? h?.id ?? 'This character';
    if (k === 'ghost' && h?.id === 'storyteller') return 'The Storyteller never becomes a ghost';
    return `${nm} has no ${k === 'signature' ? 'signature' : k} emote`;
  };
  /** The tip plate + its "never show again" row, drawn once per state ({im, close, never} rects relative to im). */
  const tipImage = (mw, T) => cached(`tipimg|${mw}|${tipNever}|${hoverIs('tip', 'never')}|${hoverIs('tip', 'close')}|${T.ink}|${JSON.stringify(tipTokensNow)}`, () => {
    const tmp = mkImg(mw + 40, 80, (v) => HA.drawKeyHint(v, (mw + 40) >> 1, 0, T, { tokens: tipTokensNow, maxW: mw })), r = tmp.r;
    const w = r.w, h = r.h;
    const im = mkImg(w + 1, h + 14, (v) => {
      v.blit(tmp.view, -r.x, 0);
      // (critic P3-10) the x always in cream (the plate's own x is textDim: low contrast), a hover box behind it
      if (hoverIs('tip', 'close')) drawBox(v, w - 12, 2, 9, 9, 'hover', T);
      v.blit(HA.GLYPH.close(T, T.text), w - 10, 4);
      drawBox(v, 0, h - 1, w, 14, { line: 'outline', edge: 'goldSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true }, T);
      drawBox(v, 6, h + 2, 8, 8, hoverIs('tip', 'never') ? 'hover' : 'sunk', T);
      if (tipNever) for (const [x, y] of [[8, h + 5], [9, h + 6], [10, h + 5], [11, h + 4]]) v.set(x, y, T.goldHi), v.set(x, y + 1, T.gold);
      v.blit(textImg('Never show again', hoverIs('tip', 'never') ? T.text : T.textDim).view, 18, h + 3);
    });
    // (P3-10: the close target is 16 x 15 logical px in the plate's top-right corner)
    return { im, w: w + 1, h: h + 14, close: { x: w - 16, y: 0, w: 17, h: 15 }, never: { x: 2, y: h, w: w - 4, h: 12 } };
  });
  const textImg = (str, color) => cached(`txt|${str}|${color}`, () => mkImg(Math.max(1, textWidth(str) + 2), 10, (v) => drawText(v, 0, 0, str, { color })));
  // the events group draws through a layer whose .screen is the logical view (the vote clock straight into it = HD;
  // the caption ribbon builds its own image = 2x2 blocks until the events group's HD wave)
  const LS = Object.create(L, { screen: { get: () => SV() } });
  // (pass B and other HUD clients: their pieces on this tier, their rects in our hit tests; see api.hudHost)
  const hudClients = [];
  /** client px of a logical screen px (its top-left). */
  const toClient = (lx, ly) => {
    const c = canvas.getBoundingClientRect(), u = unitDev(), sx = c.width / Math.max(1, engine.width), sy = c.height / Math.max(1, engine.height);
    return { x: c.left + lx * u * sx, y: c.top + (engine.height - (H() - ly) * u) * sy };
  };
  // (wave 2, docs/UI-HD-WAVE2.md step 1) every HD path of the library on for this token set, BEFORE any callback draws
  // or caches a sprite (z -1): the density round's swatches / glove / toolbar glyphs + hud / events / emotes HD hooks
  L.add((LL) => { if (hdOn()) { prepareWave2HD(LL.tok, { swatchIcon: 'dot' }); prepareEmojiHD(LL.tok); } }, -1);
  L.add((LL) => {
    const img = SV(), T = LL.tok, t = LL.t, s = store.state;
    if (!img || !LL.screen) return;
    // (the library's HD sprites are attached by the z -1 prepare: prepareWave2HD)
    const x0 = 4 + cover.left, x1 = img.w - 4 - cover.right, cx = Math.floor((x0 + x1) / 2), y0 = cover.top;
    // clock chip: the town clock (time + stage of the day / the ceremony) and the phase chip beside it
    const hours = Number.isFinite(demo.time?.hours) ? demo.time.hours : s.timeOfDay;
    const day = hours >= 6 && hours < 20, len = day ? 14 : 10, into = day ? hours - 6 : (hours - 20 + 24) % 24;
    // (critic-3 P2) the clock chip is the TOWN CLOCK only: the hour word + the time in the day / night tone (the phase
    // chip beside it names the phase; the red 'nominations' tone made the time read like a countdown)
    const stage = nightHours(hours) ? 'bedtime' : 'discussion';
    const o = { stage, label: dayWord(hours), time: formatClock(hours), frac: Math.max(0, Math.min(1, 1 - into / len)),
      paused: s.paused || !s.timeSpeed, plus: null, reduced };
    // a narrow screen (a phone): the chips must end left of the toolbar; first the short hour word, then the phase chip
    // on a second row under the clock chip
    const [plab, pic] = phaseChipOf(s.phase, hours);
    const tbx = x1 - toolbar.length * 17, phW = 6 + textWidth(plab.toUpperCase(), HUD_LABEL) + 4 + 7 + 6 + 1;
    const fits = (oo) => x0 + HA.clockChipWidth(oo) + 2 + phW <= tbx - 2;
    if (!fits(o)) o.label = SHORT_WORD[o.label] ?? o.label;
    const row2 = !fits(o);
    const ck = `${o.stage}|${o.label}|${o.time}|${o.frac.toFixed(2)}|${o.paused}|${T.ink}|${dd()}`;
    if (ck !== shot.chipKey) {
      const w = HA.clockChipWidth(o);
      shot.chip = mkImg(w + 4, 19, (v) => HA.drawClockChip(v, 2, 2, T, { ...o, t })); shot.chipKey = ck;   // (wave 2: through the view = the HD chip: HD dial, dashes, glow)
    }
    putS(shot.chip, x0 - 2, y0 + 2);
    const pk = `${plab}|${pic}|${T.ink}|${dd()}`;
    if (pk !== shot.phaseKey) {
      const D = dd(), tmp = mkImg(120, 13, (v) => phaseChip(v, 118, 1, T, plab, HA.GLYPH[pic](T))), r = tmp.r;
      shot.phase = tmp.crop(r.x * D, 0, (r.w + 1) * D, 13 * D); shot.phaseKey = pk;
    }
    const phX = row2 ? x0 + 16 : x0 + lw(shot.chip) - 2, phY = row2 ? y0 + 20 : y0 + 4 + 1;
    putS(shot.phase, phX, phY);
    R.topRow = { y1: row2 ? y0 + 34 : y0 + 22, spans: [[x0 - 2, Math.max(x0 + lw(shot.chip) - 2, phX + lw(shot.phase))], [tbx, x1]] };
    R.chips = { clock: o.label, time: o.time, stage: o.stage, phase: plab, icon: pic, row2 };
    // toolbar (right of the visible area): the tip's lightbulb / notebook / control panel / keys; each button drawn
    // once per state (D=2: the library's toolButtonHD, 16-px glyphs). The bulb is ALWAYS there; after a dismissed tip
    // has flown into it, it glows GLOW_S s (a gold frame + the lit glass with rays throughout, the 2-ring halo pulsing:
    // on 2 drawings of 3 at 7.5 fps)
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
        if (hdOn()) return toolButtonHD(TOOL_HD[b.k], st, T, { lit });
        const im = new PixelImage(w, 15);
        drawBox(im, 0, 0, w, 15, lit && !on ? 'gold' : st, T);
        const g = b.g(T, lit), q = st === 'pressed' ? 1 : 0;
        im.blit(g, Math.floor((w - g.w) / 2) + q, Math.floor((15 - g.h) / 2) + q);
        return im;
      });
      putS(btn, bx, y0 + 4);
      // the glow: a 1-px gold halo ring round the bulb button, pulsing with it (light FX: <= 2 alpha steps; through the
      // view = 2x2 blocks, the HD halo is a follow-up)
      if (b.k === 'tip' && glowing && (reduced || frameAt(t - bulbGlow, 7.5, 3) !== 2)) {
        putS(cached(`bulbhalo${T.ink}`, () => mkImg(w + 6, 21, (h) => {
          for (let yy = 3; yy < 18; yy++) for (let xx = 3; xx < w + 3; xx++) h.set(xx, yy, T.goldHi);
          h.outline(T.goldHi, {}); h.outline(withAlpha(T.goldHi, 110), {});
          for (let yy = 3; yy < 18; yy++) for (let xx = 3; xx < w + 3; xx++) h.erase(xx, yy);
        })), bx - 3, y0 + 1);
      }
      R.toolbar[b.k] = { x: bx, y: y0 + 4, w, h: 15 };
      bx -= 2;
    }
    // toasts (newest on top), right-aligned under the toolbar (below the phase caption ribbon while one shows)
    let ty = y0 + 24 + (caption ? 18 : 0);
    // and below a HUD client's second row (the timer chip dropped under the chips: a toast slid under it)
    if (R.row2Y) ty = Math.max(ty, R.row2Y + 4);
    const tw = Math.min(150, x1 - x0 - 8);
    for (const it of toasts) {
      const age = HA.sgf(t - it.at), endF = Math.round(it.ms / 1000 * GRID_HZ), left = age - endF;
      if (it.gone || left >= 6) continue;
      const hh = HA.toastHeight(it.text, tw, it.kind), bw = HA.toastWidth(it.text, tw, it.kind), tx = x1 - bw;
      const full = cached(`toast${it.kind}${bw}${T.ink}${it.text}`, () => mkImg(bw + 8, hh + 9, (v) => HA.drawToast(v, 4, 4, bw, T, { text: it.text, kind: it.kind, close: false })));
      if (age >= 1 && left < 0) putS(full, tx - 4, ty - 4);                   // steady: the cached drawing
      else {                                                                   // pop / dissolve frames (docs/UI.md §2.8)
        const D = dd(), r = HA.envelopeFx(full.clone(), age, left >= 0 ? left : null, { reduced, ox: (tx - 4) * D, oy: (ty - 4) * D });
        if (r) putS(r.img, tx - 4, ty - 4 + r.dy);
      }
      ty += hh + 3;
    }
    for (let i = toasts.length - 1; i >= 0; i--) { const it = toasts[i]; if (it.gone || HA.sgf(t - it.at) - Math.round(it.ms / 1000 * GRID_HZ) >= 6) toasts.splice(i, 1); }
    // the events: the phase caption (under the chips, centred on the visible area) and the vote clock (left)
    const EF = EV.framesFor(T);
    if (caption) {
      const k = EV.gridK(t - caption.t0);
      if (k > caption.durF + 8) caption = null;
      // (critic P2-9) below a HUD client's second row too (the timer chip under the chips on a narrow screen): last frame's
      else EV.drawCaption(LS, EF, { text: caption.text, glyph: caption.glyph, k, durF: caption.durF, cx, y: Math.max(R.topRow.y1, R.row2Y ?? 0) + 4, still: reduced });
    }
    // (seal vote; the user: "[the vote-dial card] ideally don't have this panel") NO vote clock card on any screen: the
    // seals in the world, the clock hand and the ONE tally plaque (votemarks.js) show the vote; its state drives the
    // result caption
    R.vote = null;
    if (vote) {
      const S = sealState(t);
      R.vote = { tally: S.tally, needed: S.needed, done: S.done, passed: S.passed, current: S.current, card: false };
      if (S.done && !vote.result) { vote.result = true; if (!S.passed) setCaption(`Not enough votes: ${isAre(seatName(vote.v.nominee - 1))} safe.`, 'bell', 3.2); }
    }
    // bottom: dock button (your portrait in the gold ring) + the dock / armed pill above it
    const by = img.h - 4 - 24, bxr = x1 - 24;
    const av = you.id ? avatarImg(you.id) : null;
    // (wave 1) the gold frame round your 48-px HD avatar (goldFrame carries its HD twin; the four: goldFrameHD)
    const avH = hdOn() && !av?.hd ? avatarHD(you.id) : null;
    if (avH) putS(cached(`goldh${you.id}${T.goldLine}`, () => goldFrameHD(avH, T)), bxr, by);
    else if (av) putS(cached(`gold${you.id}${PORT?.avatar(you.id) ? 'p' : 't'}${av.hd ? 'h' : ''}${T.goldLine}`, () => wrap1x(goldFrame(av, T))), bxr, by);
    else drawBox(img, bxr, by, 24, 24, 'sunk', T);
    const dbs = dockOpen ? 'open' : hover?.kind === 'dockbtn' ? 'hover' : 'normal';
    putS(cached(`dockbtn${dbs}${color}${T.ink}`, () => wrap1x(E.dockButton(T, { state: dbs, color }))), bxr - 1, by - 1);
    R.dockBtn = { x: bxr - 1, y: by - 1, w: 26, h: 26 };
    // ---- the ACTION BAR (the user's request: every key action as a clickable / tappable button, its key as a hint):
    // on the bottom row between the status line (bottom left, DOM) and the dock button, centred on the visible area
    // when it fits; on a narrow screen (a phone: the status line spans the bottom) it stands on top of the status line.
    // (D=2: AB.buttonInto through the view: the D=2 frame, the HD glyph (actionbar-hd.js), the tiny@2 key plate)
    const BT = AB.BTN, BG = AB.GAP, rightLim = bxr - 1 - 4;
    // (the open notebook is a left band only down to its own bottom: the bar on the bottom row does not move for it)
    const bx0 = cover.left && cover.leftBottom > img.h - 4 - BT - 3 ? x0 : 4;
    let leftLim = bx0;
    if (cover.status && cover.status.y0 < img.h - 2) leftLim = Math.max(leftLim, cover.status.x1 + 3);
    let barX, barY = img.h - 4 - BT;
    const bcx = Math.floor((bx0 + x1) / 2);
    const BAR = barList(), BARW = barW(BAR.length);
    if (compactBar() && rightLim - leftLim >= BARW) barX = leftLim;          // (vote-fix5) bottom left in the vote camera
    else if (rightLim - leftLim >= BARW) barX = Math.max(leftLim, Math.min(rightLim - BARW, bcx - (BARW >> 1)));
    else { barX = bx0; barY = (cover.status ? cover.status.y0 : img.h - 4) - 3 - BT; }
    R.bar = [];
    const mySeal = sealBtnOn() && !!demo.time?.seals?.downAt?.(demo.passB.seats.yours, t);
    // (vote-fix5, critic-4 P2-5) your seal slot: a pulsing gold halo while the vote waits for your seal (2 drawings of 3
    // at 3.75 fps), steady while it lies down; a tag over it says VOTE / VOTED / COUNTED / NO VOTE
    const sTag = mySealTag(t);
    R.sealTag = null;
    if (sTag && BAR[0]?.k === 'seal') {
      if (sTag === 'vote' || sTag === 'voted') {
        const pulse = sTag === 'voted' || reduced || frameAt(t, 3.75, 3) !== 2;
        if (pulse) putS(sealHalo(T, sTag === 'vote' && frameAt(t, 3.75, 3) === 0), barX - 4, barY - 4);
      }
      const ti = tagImg(sTag, T), tw2 = lw(ti), tx2 = Math.max(x0 - 2, barX + (BT >> 1) - (tw2 >> 1)), ty2 = barY - 4 - 12;
      putS(ti, tx2, ty2);
      R.sealTag = { kind: sTag, text: TAG_TEXT[sTag], x: tx2, y: ty2, w: tw2, h: 11 };
    }
    for (let i = 0; i < BAR.length; i++) {
      const b = BAR[i], x = barX + i * (BT + BG);
      const on = (b.k === 'emote' && emotePal) || (b.k === 'point' && armed === 'point') || (b.k === 'pin' && armed === 'pin') || (b.k === 'dock' && dockOpen) || (b.k === 'notebook' && nb.isOpen) || (b.k === 'more' && trayOpen);
      // (the emote button is lit while you are a ghost: the state shows without opening the palette)
      const state = on ? 'pressed' : (b.k === 'emote' && demo.player?.ghost) || (b.k === 'seal' && mySeal) ? 'lit' : hoverIs('bar', b.k) ? 'hover' : 'raised';
      const g = AB.glyph(b.glyph, T, { color });
      putS(btnImg(`bar${b.k}${b.k === 'pin' ? color : ''}`, { state, glyph: g, hint: b.hint }), x, barY);
      R.bar.push({ k: b.k, x, y: barY, w: BT, h: BT });
    }
    const barRect = { x: barX, y: barY, w: BARW, h: BT };
    R.barRect = barRect;
    // the popovers above the bar: the emote palette (the 6 game emotes; greyed when your character has no such clip,
    // except point: P2.8's pop fallback) and the tray (every other key, two rows + pass B's timer row)
    R.pal = null; R.tray = null;
    const popover = (rows, anchorX, kind) => {
      const n = Math.max(...rows.map((r) => r.length)), pw = n * (BT + BG) - BG + 6, ph = rows.length * (BT + BG) - BG + 6;
      const px = Math.max(x0, Math.min(x1 - pw, anchorX - (pw >> 1))), py = barY - 3 - ph;
      putS(cached(`pop${pw}x${ph}${T.ink}`, () => mkImg(pw, ph + 2, (v) => drawBox(v, 0, 0, pw, ph, 'panel', T))), px, py);
      const out = [];
      rows.forEach((row, j) => row.forEach((it, i) => {
        const x = px + 3 + i * (BT + BG), y = py + 3 + j * (BT + BG), dis = kind === 'pal' && !hasEmote(it.k);
        const id = it.k ?? it.code;
        const paused = it.code === 'KeyT' && (s.paused || !s.timeSpeed);
        // the ghost button is lit while you are a ghost (a toggle: player.ghost)
        const lit = kind === 'pal' && it.k === 'ghost' && !!demo.player?.ghost;
        const state = dis ? 'disabled' : lit ? 'lit' : hoverIs(kind, id) ? 'hover' : 'raised';
        putS(btnImg(`${kind}${id}${paused}`, { state, glyph: AB.glyph(it.glyph, T, { paused }), hint: it.hint }), x, y);
        out.push({ k: id, code: it.code, x, y, w: BT, h: BT, off: dis, tip: it.tip, hint: it.hint });
      }));
      return { x: px, y: py, w: pw, h: ph, items: out };
    };
    // (critic P2-5) the dock / armed pill stand above the dock button; where that would cover the bar (a narrow
    // screen), above the bar instead
    const overBar = (x, y, w, h) => x < barRect.x + barRect.w && x + w > barRect.x && y + h > barRect.y - 2 && y < barRect.y + barRect.h;
    R.dock = null; R.armedCancel = null; R.picker = null;
    if (dockOpen && vcRing() && x1 - x0 < STRIP_MAX_W) {
      // (vote-fix5, critic-4 P2-7) a narrow screen (a phone) in the vote camera: the open dock covered the ring's near
      // arc - a COMPACT one-row reaction strip instead (the 7 reactions; point / pin stay on the pie), right-aligned
      // over the bar row (votecam.js keeps that band clear on narrow screens)
      const pq = demo.passB?.marks?.plaque, yTop = pq?.spot === 'bottom' ? Math.min(pq.y, barY - 16) : barY - 16;
      const n = EJ.EMOJI.length, SW = n * STRIP.cw + 6, SH = STRIP.ch + 6, sx = x1 - SW, sy = yTop - 3 - SH;
      const hk = hover?.kind === 'dock' ? hover.k : null, act = lastReactKey && t - lastReact < 0.3 ? lastReactKey : null;
      const im = cached(`estrip${hk}${act}${T.ink}`, () => mkImg(SW + 1, SH + 1, (v) => {
        drawBox(v, 0, 0, SW, SH, 'panel', T);
        EJ.EMOJI.forEach((e, i) => {
          const ex = 3 + i * STRIP.cw, k = `emoji:${e.key}`;
          if (act === e.key || hk === k) drawBox(v, ex, 3, STRIP.cw, STRIP.ch, { line: 'outline', edge: act === e.key ? 'goldHi' : 'ironHi', fill: 'inkRaised', hi: null, sh: null, corner: 1, shadow: false }, T);
          v.blit(EJ.emojiIcon(e.key, T), ex + 1, 5);
        });
      }));
      putS(im, sx, sy);
      const parts = {};
      EJ.EMOJI.forEach((e, i) => { parts[`emoji:${e.key}`] = { x: sx + 3 + i * STRIP.cw, y: sy + 3, w: STRIP.cw, h: STRIP.ch }; });
      R.dock = { x: sx, y: sy, w: SW, h: SH, parts, strip: true };
    } else if (dockOpen) {
      // (emoji, docs/UI-EMOJI.md "Dock layout") the REACTIONS dock: Point / Pin (+ the small colour button), the 7
      // reactions over their number keys, Clear my pins, the key hints; no swatch row. The colour button opens the
      // AUTO + 8-dot picker above it (the only place, with the panel's row, that changes the pin colour)
      const DK = EJ.EMOTE_DOCK, dx = x1 - DK.w;
      let dy = by - 3 - DK.h;
      if (overBar(dx, dy, DK.w, DK.h)) dy = barY - 3 - DK.h;
      const hk = hover?.kind === 'dock' ? hover.k : null, mine = livePins().length;
      const active = lastReactKey && t - lastReact < 0.3 ? lastReactKey : null;
      const dk = cached(`edock${armed}${color}${mine}${hk}${active}${pickerOpen}${touchUI}${T.ink}`, () => { const im = mkImg(DK.w + 2, DK.h + 2, (v) => EJ.drawEmoteDock(v, 0, 0, T, { mode: armed ?? 'idle', color, mine, hover: hk, active, picker: pickerOpen, touch: touchUI })); return { im, r: im.r }; });
      putS(dk.im, dx, dy);
      const parts = {};
      for (const [k, r] of Object.entries(dk.r)) parts[k] = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
      R.dock = { x: dx, y: dy, w: DK.w, h: DK.h, parts };
      if (pickerOpen && dk.r.pinColor) {
        const pk = EJ.pinPickerAt(dx, dy, parts), ph = hover?.kind === 'picker' ? hover.k : null, ac = autoColor();
        const pz = EJ.pinPickerSize();
        const pi = cached(`picker${color}${colorAuto}${ac}${ph}${pk.tailX - pk.x}${T.ink}`, () => { const im = mkImg(pz.w + 2, pz.h + 6, (v) => EJ.drawPinPicker(v, 0, 0, T, { color, auto: colorAuto, autoColor: ac, hover: ph, tailX: pk.tailX - pk.x })); return { im, r: im.r }; });
        putS(pi.im, pk.x, pk.y);
        const pp = {};
        for (const [k, r] of Object.entries(pi.r)) if (r && typeof r === 'object') pp[k] = { x: r.x + pk.x, y: r.y + pk.y, w: r.w, h: r.h };
        R.picker = { x: pk.x, y: pk.y, w: pz.w, h: pz.h, parts: pp };
      }
    } else if (armed) {
      const z = E.armedSize(T, { mode: armed, touch: touchUI });
      let ay = by - 3 - z.h;
      if (overBar(x1 - z.w, ay, z.w, z.h)) ay = barY - 3 - z.h;
      const r = E.drawArmed(img, x1 - z.w, ay, T, { mode: armed, touch: touchUI, hover: hover?.kind === 'armedCancel' });
      R.armedCancel = r.cancel;
    }
    // bottom centre: the door prompt, else the tip (both kept above the action bar and the dock button row)
    const P = demo.player, d = P?.nearDoor, room = P?.interior;
    const promptY = Math.min(img.h - 4 - 15 - 26, barY - 4 - 15);
    // (centred pieces: drawn once per text at x 320 of a 640-wide image, then placed by their offset from that centre)
    const prompt = (text, locked = false, py = promptY) => {
      const pc = pieceS(`prompt${text}${locked}${T.ink}`, 640, 17, (v) => HA.drawPrompt(v, 320, 0, T, { text, locked }));
      putS(pc.im, cx - 320 + pc.dx, py + pc.dy);
    };
    R.tip = null;
    if (tipState && t >= tipState.until) closeTip('timeout');
    // (critic P2-7) inside, the room's line stands at the TOP (under the chips / the caption): at the bottom it covered
    // the player standing at the door after walking in
    // (critic-3 P3) in the clock tower the line covered the dial's back (top centre): there it shows for the first
    // ROOM_LINE_S s after walking in, then gets out of the way
    if (room !== roomSeen.room) { roomSeen.room = room; roomSeen.t = t; }
    const roomLine = room && (room.id !== 'clocktower' || t - roomSeen.t < ROOM_LINE_S);
    if (roomLine) prompt(`${room.name ?? 'Inside'} · walk out the door to leave`, false, Math.max(R.topRow.y1, R.row2Y ?? 0) + 4 + (caption ? 22 : 0));
    // (critic P3-15) no "Walk in" prompt in the vote camera (it sat among the cast's labels during the ceremony)
    else if (d && !room && s.camera !== 'vote' && !staged()) {
      const house = demo.layout?.houses?.find((q) => q.id === d.id);
      if (d.id === 'clocktower' && !demo.passB?.interior) prompt('The clock tower is locked', true);   // (B) enterable with pass B's interior
      else prompt(`Walk in: ${house?.name ?? (d.id === 'clocktower' ? 'The Clocktower' : d.id)}`);
    }
    if (tipState && !(d || room)) {
      // (it keeps left of an open dock / armed pill: it was drawn over the palette)
      // (a narrow screen with the dock open: the full width, ABOVE the dock)
      const beside = R.dock && R.dock.x - 4 - x0 - 4 >= 160, above = R.dock && !beside;
      const tx1 = beside ? Math.min(x1, R.dock.x - 4) : x1;
      const mw = Math.min(300, tx1 - x0 - 4), ti = tipImage(mw, T);
      const tx = Math.max(x0, Math.min(tx1 - ti.w, cx - (ti.w >> 1)));
      const tyy = Math.max(y0 + 24, Math.min(promptY + 8 - ti.h, by - 3 - ti.h, barY - 4 - ti.h, above ? R.dock.y - 4 - ti.h : 1e9));
      putS(ti.im, tx, tyy);
      tipRect = { x: tx, y: tyy, w: ti.w, h: ti.h, im: ti.im };
      R.tip = { x: tx, y: tyy, w: ti.w, h: ti.h, close: { x: tx + ti.close.x, y: tyy + ti.close.y, w: ti.close.w, h: ti.close.h }, never: { x: tx + ti.never.x, y: tyy + ti.never.y, w: ti.never.w, h: ti.never.h } };
    }
    // the dismissed tip flies into the bulb: 8 drawings (15 fps), shrinking 1 -> 0.15 toward the bulb's centre (eased
    // out: it leaves fast and settles in), the last two half / three-quarter dissolved; then the bulb glows (above).
    // (D=2: the HD plate shrinks at HD px and moves in HD px: a finer flight)
    if (tipFly) {
      const k = EV.gridK(t - tipFly.t0), dr = Math.floor(k / 2);
      const tb = R.toolbar.tip;
      if (dr >= FLY_F / 2 || !tb) tipFly = null;
      else {
        const D = dd(), u = (dr + 1) / (FLY_F / 2), e = 1 - (1 - u) * (1 - u), f = 1 - 0.85 * u;
        const nD = FLY_F / 2, im0 = cached(`fly${dr}${tipFly.im.w}x${tipFly.im.h}${tipNever}${tipFly.t0}`, () => { const m = shrink(tipFly.im, f); return dr >= nD - 2 ? dissolve(m, dr === nD - 2 ? 0.5 : 0.75) : m; });
        const sx = tipFly.x + tipFly.w / 2, sy = tipFly.y + tipFly.h / 2, ex = tb.x + tb.w / 2, ey = tb.y + tb.h / 2;
        const fx = sx + (ex - sx) * e, fy = sy + (ey - sy) * e;
        fastBlit(SB(), im0, Math.round(fx * D - im0.w / 2), Math.round(fy * D - im0.h / 2));
        // (the drawn centres, logical px: the playtest checks the flight goes from the tip toward the bulb)
        if (tipFly.path.at(-1)?.[2] !== dr) tipFly.path.push([Math.round(fx), Math.round(fy), dr]);
        lastFly = { from: [Math.round(sx), Math.round(sy)], to: [Math.round(ex), Math.round(ey)], path: tipFly.path.map((p) => [p[0], p[1]]) };
      }
    }
    // HUD clients (pass B's tower-timer chip + the Storyteller's town clock): drawn here, on this tier, in these
    // coordinates; their rects join the hit tests and the top row
    R.clients = [];
    let clientRow2 = 0;
    if (hudClients.length) {
      const G = { T, t, d: dd(), hd: hdOn(), x0, x1, y0, W: img.w, H: img.h, mk: mkImg, put: putS, cached, lw, toClient,
        chipsEnd: R.topRow.spans[0][1], toolbarX: R.topRow.spans[1][0], topY: R.topRow.y1, bar: barRect, status: cover.status ?? null, coverTop: cover.top,
        hover: hover?.kind === 'client' ? hover.k : null };
      for (const c of hudClients) {
        let out = null;
        try { out = c.draw(G) ?? null; } catch (e) { console.warn('[demo] gameui: HUD client failed', e); }
        if (!out) continue;
        R.clients.push({ c, rects: out.rects ?? [] });
        if (out.top) R.topRow.spans.push([out.top.x, out.top.x + out.top.w]);
        if (out.row2) clientRow2 = Math.max(clientRow2, out.row2.y1);
      }
    }
    R.row2Y = clientRow2;
    // the popovers last (over the tip / prompt)
    if (emotePal) R.pal = popover([AB.EMOTES], R.bar[0].x + (BT >> 1), 'pal');
    if (trayOpen) R.tray = popover(AB.TRAY, R.bar[R.bar.length - 1].x + (BT >> 1), 'tray');
    // a tooltip over the hovered bar / palette / tray button (mouse; none for a bar button whose popover is open: it
    // would cover the popover). (critic P2-6) a finger has no hover: the last-tapped palette / tray button shows its
    // name 1.6 s instead. (critic P3-9) a greyed emote says why.
    const tipOf0 = touchUI ? (tapTip && t < tapTip.until ? tapTip : null) : keyQuiet ? null : hover;
    // (vote-fix5, critic-4 P1-1) quiet after a click in the vote camera until the pointer leaves the button
    const tipOf = tipOf0 && barQuiet && tipOf0.kind === 'bar' && tipOf0.k === barQuiet ? null : tipOf0;
    R.tooltip = null;
    if (tipOf && (tipOf.kind === 'pal' || tipOf.kind === 'tray' || (tipOf.kind === 'bar' && !(tipOf.k === 'emote' && emotePal) && !(tipOf.k === 'more' && trayOpen)))) {
      const list = tipOf.kind === 'bar' ? R.bar.map((r) => ({ ...r, ...[SEAL_BTN, ...AB.BAR].find((b) => b.k === r.k) })) : (tipOf.kind === 'pal' ? R.pal : R.tray)?.items ?? [];
      const it = list.find((r) => r.k === tipOf.k);
      if (it) {
        // (vote-fix5, critic-4 P1-1) SHORT tips on the compact vote bar (a long one could not avoid the ring's seals)
        const tip0 = tipOf.kind === 'bar' && vcRing() ? VOTE_TIPS[it.k] ?? it.tip : it.tip;
        const label = it.off ? emoteWhy(it.k) : it.hint ? `${tip0} (${AB.keyWord(it.hint)})` : tip0;
        const sz = AB.tooltipSize(label);
        const tt = cached(`tt|${label}|${T.ink}`, () => mkImg(sz.w, sz.h, (v) => AB.tooltipInto(v, label, T)));
        // (above the whole popover for a palette / tray button: over the row above it hid those buttons)
        const box = tipOf.kind === 'pal' ? R.pal : tipOf.kind === 'tray' ? R.tray : null;
        const above = (box ? box.y : it.y) - 3 - sz.h;
        const clampX = (x) => Math.max(x0, Math.min(x1 - sz.w, x));
        // (vote-fix5, critic-4 P1-1) in the vote camera never over a seal or the nominee's ring: above the button, then
        // beside the bar on its own row, then above the tag; none clear = no tooltip
        const cands = [[clampX(it.x + (it.w >> 1) - (sz.w >> 1)), above]];
        let pos = cands[0];
        if (vcRing()) {
          const avoid = voteKeepOuts();
          const overTag = (R.sealTag ? Math.min(above, R.sealTag.y - 3 - sz.h) : above);
          cands.push([clampX(it.x), overTag], [clampX(x0), overTag], [clampX(barRect.x + barRect.w + 4), barRect.y + ((BT - sz.h) >> 1)],
            [clampX(it.x), overTag - 16], [clampX(x0), overTag - 16], [clampX(x0), overTag - 32]);
          const hitsAny = ([x, y]) => avoid.some((b) => x < b.x1 && x + sz.w > b.x0 && y < b.y1 && y + sz.h > b.y0) || (R.sealTag && x < R.sealTag.x + R.sealTag.w && x + sz.w > R.sealTag.x && y < R.sealTag.y + R.sealTag.h && y + sz.h > R.sealTag.y);
          pos = cands.find((c) => !hitsAny(c)) ?? null;
          R.tooltipTried = cands.length;
        }
        if (pos) { putS(tt, pos[0], pos[1]); R.tooltip = { k: it.k, x: pos[0], y: pos[1], w: sz.w, h: sz.h, text: label }; }
        else R.tooltip = { k: it.k, blocked: true, text: label };
      }
    }
    // the pie (above the HUD)
    if (pie) {
      const st = { size: pie.input, input: pie.input, items: pie.items, hot: pie.hot, color, off: pie.off, sticky: pie.sticky, title: pie.target.member ? `${pie.target.member.name}` : EJ.PIE_TITLE,
        tOpen: t - pie.tOpen0, press: pie.press, reduced };
      if (pie.commit) st.commit = { i: pie.commit.i, t: t - pie.commit.t0 };
      if (pie.cancel != null) st.cancel = t - pie.cancel;
      // (vote-fix5, critic-4 P3) the pie's hint plate sat ABOVE the pie = over the target's name label: drawn here
      // (the art's own caption off) - below the pie when the target's label is above it, else above (art.js rules)
      const drawn = E.drawPie(img, pie.cx, pie.cy, T, { ...st, noCaption: true });
      if (drawn) pieCaption(img, T, st);
      if (!drawn || (pie.cancel != null && t - pie.cancel > 0.3) || (pie.commit && t - pie.commit.t0 > 0.4)) pie = null;
      else if (pie.sticky && !pie.commit && pie.cancel == null && t - pie.stickyAt > E.TIMING.PIE_STICKY_MS / 1000) cancelPie();
    }
  }, 60);

  /** (vote-fix5, critic-4 P3) the pie's hint plate (art.js drawCaption's text + plate), BELOW the pie when the target's
   *  name label stands above it (the plate covered the name), else above as before */
  function pieCaption(img, T, st) {
    const kOpen = st.reduced ? 99 : E.gridK(st.tOpen ?? 99);
    if ((st.commit && E.gridK(st.commit.t, 2) >= 2) || st.cancel != null || kOpen < 1) return;
    const G = E.PIE[st.size === 'touch' ? 'touch' : 'mouse'], touch = st.input === 'touch';
    const items = st.items ?? [], hot = st.hot != null ? items[st.hot] : st.commit ? items[st.commit.i] : null;
    const title = st.title || 'Point or pin';
    const cap = hot ? hot.label : st.sticky ? `${title} — ${touch ? 'tap' : 'click'} one` : `${title} — ${touch ? 'slide' : 'drag'} to choose`;
    const m = pie.target?.member ?? (pie.target?.onYou ? you : null), CH = 13;
    let below = false;
    if (m && m._labelTop != null && !m._noLabel) {
      const ly = (m._labelTop - (L.MARGIN ?? 0)) * t2l();
      below = ly < pie.cy + 4 && ly > pie.cy - G.R - 6 - CH - 14 && pie.cy + G.R + 6 + CH < img.h - 2;
    }
    E.drawCaption(img, pie.cx, below ? pie.cy + 2 * G.R + 12 + CH : pie.cy, G.R, cap, T);
    R.pieCap = { below, text: cap };
  }

  // ------------------------------------------------------------------------------------------------ input
  const hasControl =() => !!window.__demo?.ready && (!demo.intro || demo.intro.phase === 'done') && !document.body.classList.contains('ct-intro');
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
    if (R.picker && inRect(s, R.picker)) {
      for (const [k, r] of Object.entries(R.picker.parts ?? {})) if (inRect(s, r)) return { kind: 'picker', k };
      return { kind: 'picker', k: null };
    }
    if (R.dock && inRect(s, R.dock)) {
      for (const [k, r] of Object.entries(R.dock.parts ?? {})) if (inRect(s, r)) return { kind: 'dock', k };
      return { kind: 'dock', k: null };
    }
    if (R.armedCancel && inRect(s, R.armedCancel)) return { kind: 'armedCancel' };
    for (const [k, r] of Object.entries(R.toolbar ?? {})) if (inRect(s, r)) return { kind: 'tool', k };
    for (const cl of R.clients ?? []) for (const r of cl.rects) if (inRect(s, r)) return { kind: 'client', k: r.k, c: cl.c, inert: !!r.inert };
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
      closePopovers();                         // (critic P3-8) a right-press on the town closes the palette / tray
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
    // (emoji) the colour picker closes on any click outside it (and its button)
    if (pickerOpen && hit?.kind !== 'picker' && !(hit?.kind === 'dock' && hit.k === 'pinColor')) pickerOpen = false;
    if (hit) { eat(e); consumeUp.add(0); uiClick(hit); return; }
    // a click / tap elsewhere closes an open popover (and does nothing else) - (critic P3-8) except on your own pin: the
    // click goes through (it removes the pin) and closes the popover too
    if (emotePal || trayOpen) {
      eat(e); consumeUp.add(0); closePopovers();
      const own0 = pinAt(s);
      if (own0) removePin(own0);
      return;
    }
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
    // (critic P2-5) one popover at a time: the palette / the tray close the social dock and each other
    if (k === 'emote') { emotePal = !emotePal; trayOpen = false; if (emotePal) { dockOpen = false; armed = null; } }
    else if (k === 'more') { trayOpen = !trayOpen; emotePal = false; if (trayOpen) { dockOpen = false; armed = null; } }
    else if (k === 'point' || k === 'pin') { emotePal = trayOpen = false; armed = armed === k ? null : k; if (k === 'pin' && livePins().length >= MAX_PINS) { armed = null; toast(`You have ${MAX_PINS} pins: remove one first`, { kind: 'error', ms: 2600 }); } }
    else if (k === 'dock') { emotePal = trayOpen = false; input.has?.('KeyG') ? input.press('KeyG') : (dockOpen = !dockOpen); }
    else if (k === 'notebook') { emotePal = trayOpen = false; input.has?.('KeyJ') ? input.press('KeyJ') : nb.toggle(); }
    else if (k === 'seal') { emotePal = trayOpen = false; input.press('KeyX'); }
  }
  function uiClick(hit) {
    if (hit.kind === 'tip') {
      if (hit.k === 'close') closeTip('close');
      else if (hit.k === 'never') { setTipNever(!tipNever); if (tipNever) closeTip('never'); }
    } else if (hit.kind === 'bar') { if (vcRing()) barQuiet = hit.k; barAction(hit.k); }
    else if (hit.kind === 'pal') {
      if (hit.code && !hit.off) { input.press(hit.code); emotePal = false; }
      else if (hit.off && hit.k) toast(emoteWhy(hit.k), { ms: 2400 });   // (critic P3-9) a greyed emote says why
    } else if (hit.kind === 'tray') { if (hit.code) input.press(hit.code); }
    else if (hit.kind === 'dockbtn') toggleDock();
    else if (hit.kind === 'client') { if (!hit.inert) hit.c.click?.(hit.k); }
    else if (hit.kind === 'armedCancel') armed = null;
    else if (hit.kind === 'tool') {
      if (hit.k === 'notebook') nb.toggle();
      else if (hit.k === 'tip') { if (tipState) closeTip('bulb'); else tip(null, 0, { auto: false }); }
      else if (hit.k === 'panel') store.set({ ui: !store.state.ui }, 'ui');
      else if (hit.k === 'help') demo.ui?.help?.();
    } else if (hit.kind === 'dock' && hit.k) {
      if (hit.k === 'point' || hit.k === 'pin') { pickerOpen = false; armed = armed === hit.k ? null : hit.k; if (hit.k === 'pin' && livePins().length >= MAX_PINS) armed = null; }
      else if (hit.k.startsWith('emoji:')) react(hit.k.slice(6), null);
      else if (hit.k === 'pinColor') pickerOpen = !pickerOpen;
      else if (hit.k === 'clear') { const n = clearPins(); if (n) toast(`Removed ${n} pin${n === 1 ? '' : 's'}`); }
    } else if (hit.kind === 'picker' && hit.k) {
      // (emoji) the pin colour, out of the way: AUTO (the automatic colour) or one of the 8; a pick closes the picker
      if (hit.k.startsWith('color:')) { setPinColor(hit.k.slice(6)); pickerOpen = false; }
    }
    // (critic P2-6) a finger has no hover: the tapped palette / tray button's name shows 1.6 s
    if (touchUI && (hit.kind === 'pal' || hit.kind === 'tray') && hit.k) tapTip = { kind: hit.kind, k: hit.k, until: L.t + 1.6 };
    events.emit('gameui:click', { kind: hit.kind, k: hit.k ?? null, code: hit.code ?? null, off: hit.off ?? false });
  }
  /** G / the dock button: the social dock (critic P2-5: it closes the palette / tray). */
  function toggleDock() { dockOpen = !dockOpen; pickerOpen = false; if (!dockOpen) armed = null; else closePopovers(); }
  let keyQuiet = false;
  function onMove(e) {
    keyQuiet = false;
    if (e.target === canvas) cursor = { x: e.clientX, y: e.clientY };
    else if (!rpress && !pie) { cursor = null; hover = null; barQuiet = null; setCursor(false); return; }
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
    if (barQuiet && !(hit?.kind === 'bar' && hit.k === barQuiet)) barQuiet = null;   // (vote-fix5) left the button
    if (hit) { hover = hit; setCursor(!hit.off && !hit.inert); return; }
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
  // (critic P3-8) a key action closes the palette / tray (they stayed open through Q, F, walking ...); Space toggles the
  // palette itself, Esc closes it (its binding), keys typed into a form field never reach the game
  const onKey = (e) => {
    keyQuiet = true;           // (critic P3-16) a key press hides the hover tooltip until the mouse moves again
    const tg = e.target;
    const typing = !!tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName ?? ''));
    // (emoji) the number keys 1-7: with the pie open = that reaction's wedge; with the reactions dock open (G) = react
    // (eaten here, in the capture phase, before the player's emote bindings); otherwise the character emotes as before
    const ek = !typing && !e.ctrlKey && !e.metaKey && !e.altKey ? EJ.emojiForCode(e.code) : null;
    if (ek && hasControl()) {
      if (pie && !pie.commit && pie.cancel == null) {
        const i = pie.items.findIndex((x) => x.kind === 'emoji' && x.emoji === ek);
        if (i >= 0 && !pie.off.has(i)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) commitPie(i); return; }
      } else if (dockOpen) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) react(ek, null); return; }
    }
    if (!(emotePal || trayOpen) || e.code === 'Space' || e.code === 'Escape' || /^(Shift|Control|Alt|Meta|OS)/.test(e.code)) return;
    if (typing) return;
    closePopovers();
  };
  addEventListener('keydown', onKey, true);
  offs.push(() => removeEventListener('keydown', onKey, true));
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
    input.bind('KeyG', () => toggleDock(), { desc: 'reactions dock: react (then 1-7), point, pin, pin colour', group: 'emote' }),
    // (critic P1-2) Space opens / closes the emote palette (it was the signature emote: most characters had none);
    // the signature is 6 and the palette's star
    input.bind('Space', () => barAction('emote'), { desc: 'emote palette (1-6 play the emotes, 6 = signature)', group: 'emote' }),
    input.bind('KeyF', () => {
      if (!cursor) { toast('Point the mouse at a spot, then F drops a pin'); return; }
      dropPin(targetAt(cursor.x, cursor.y));
    }, { desc: 'drop a pin at the cursor', group: 'emote' }),
  );
  // Esc is bound after the panel's own Esc (on 'ready'), so the help overlay keeps its place in input.bindings()
  offs.push(events.on('ready', () => offs.push(input.bind('Escape', () => { if (pie) cancelPie(); armed = null; pickerOpen = false; emotePal = trayOpen = false; if (tipState) closeTip('esc'); if (nb.isOpen) nb.close(); }, { desc: 'close the pie / notebook / tip / palettes', group: 'ui' }))));

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
    get dockOpen() { return dockOpen; }, set dockOpen(v) { dockOpen = !!v; if (!dockOpen) pickerOpen = false; },
    // (emoji) reactions: yours (the same path as the pie / dock / keys, with the cooldown) and a townsperson's
    react, npcReact, setPinColor,
    /** the 8 pin colours + their hex (the panel's "Pin colour" row) */
    pinColors: PIN_COLORS, pinHex: PIN_HEX,
    /** scene texels per logical HUD px (1 at 720p; 4/3 at 1080p 'round': the HD HUD is 4/3 of the 1x size there) */
    get texPerLogical() { return 1 / t2l(); },
    /** the action bar's rect as drawn last frame (logical px), or null (votemarks.js puts its tally plaque above it) */
    get barRect() { return R.barRect ? { ...R.barRect } : null; },
    /** (vote-fix5) the bar row's top incl. the room kept for your seal's tag (the compact vote bar), and whether the
     *  bar is the compact one (bottom left): votemarks.js stacks its bottom plaque on it */
    get barTop() { return R.barRect ? R.barRect.y - (compactBar() ? 16 : 0) : null; },
    get compactBar() { return compactBar(); },
    /** (vote-fix4) the top row as drawn last frame (logical px): { x0 (the clock chip's left), y1 (its bottom), chipsEnd,
     *  row2 } or null (votemarks.js puts its tally plaque under the chips on a wide screen) */
    get topRow() { return R.topRow ? { x0: R.topRow.spans[0][0] + 2, y1: R.topRow.y1, chipsEnd: R.topRow.spans[0][1], row2: !!R.chips?.row2 } : null; },
    /** the events vote clock card's rect as drawn last frame (logical px), or null (none: no vote / the staged court) */
    /** the toolbar's box as drawn last frame (logical px), or null */
    get toolbarRect() { const v = Object.values(R.toolbar ?? {}); if (!v.length) return null; const x0 = Math.min(...v.map((r) => r.x)), x1 = Math.max(...v.map((r) => r.x + r.w)); return { x: x0, y: v[0].y, w: x1 - x0, h: v[0].h }; },
    get voteCardRect() { return R.vote?.card ? { x: R.vote.x, y: R.vote.y, w: R.vote.w, h: R.vote.h } : null; },
    get pinColor() { return { color, auto: colorAuto, autoColor: autoColor(), saved: pinSaved }; },
    /**
     * HUD clients (pass B's timer-ui.js): add({ id, draw(G) -> { rects: [{k, x, y, w, h, inert?}], top: {x, w}? } | null,
     * click(k) }) -> remove(). draw runs inside the HUD pass, on THIS tier (D=2 when on) in its LOGICAL px: G = { T, t,
     * d, hd, x0, x1, y0, W, H, mk(w, h, fn) (a piece drawn through a view; cache it), put(piece, x, y), cached(key, fn),
     * lw(piece), toClient(x, y), chipsEnd, toolbarX, bar {x, y, w, h}, status, coverTop, hover (k | null) }. Its rects
     * join the hit tests (mouse + touch: click(k)), the hover (G.hover) and the hand cursor; 'top' joins the top row.
     */
    hudHost: { add(c) { hudClients.push(c); return () => { const i = hudClients.indexOf(c); if (i >= 0) hudClients.splice(i, 1); }; }, toClient, get unit() { return unitDev(); }, get density() { return dd(); } },
    closePopovers,
    // (B) for pass B's vote marks (votemarks.js): the UI layers (draw with L.add; L.hd = the D=2 tiers) and the running
    // vote of the events group: { v (EV.makeVote), clock (the vote clock at demo time t), reach [demo time the brass
    // hand reaches each voter] }
    layers: L,
    /** the top row (L.world texels) of a member's name label as drawn this frame (after the overlap step-up), or null */
    labelTopOf(slot) { const m = members.find((x) => x.slot === slot); return m?._shown ? m._labelTop : null; },
    /** art px reserved between that member's head and its name for the vote mark (the staged court), else 0 */
    markSlotOf(slot) { const m = members.find((x) => x.slot === slot); return m ? markSlotOf(m) : 0; },
    voteOf(t = L.t) { return vote ? { v: vote.v, clock: voteClock(t), reach: vote.reach, per: vote.per, t0: vote.t0 } : null; },
    get color() { return color; }, set color(c) { setPinColor(c, { save: false }); },
    info() {
      const t = L.t;
      return {
        enabled: L.enabled, screen: [W(), H()], cover, touch: touchUI, pressing: rpress ? (rpress.touch != null ? 'touch' : 'right') : null, options: { ...hud.uiOptions },
        // (density) every screen rect / point here is in LOGICAL px: unit = CSS px per logical px (client = rect x unit
        // from the canvas's top-left), unitDev = device px per logical px, density = the art density (2 | 1)
        unit: unitDev() * (canvas.getBoundingClientRect().width / Math.max(1, engine.width)), unitDev: unitDev(), density: dd(),
        hd: L.hd ? { d: L.hd.d, scale: L.hd.scale, k: +L.hd.k.toFixed(3), policy: L.hd.policy, stats: { ...L.hd.stats } } : null,
        members: members.map((m) => { const k = talk.get(keyOf(m)); return { id: m.id, name: m.name, you: m.you, slot: m.slot, clip: m.clip, talking: !!k?.on, bubble: k?.line && t < k.bubbleUntil ? k.line : null, screen: atS(m.pos), shown: !!m._shown, label: m._shown && !m._noLabel ? courtName(m) : null, ghostLabel: !!m.clip?.startsWith?.('ghost') || (m.you && m.ghost) }; }),
        hover: hover ? { kind: hover.kind, k: hover.k ?? null } : null,
        point: point ? { kind: point.target.kind, age: +(t - point.t0).toFixed(2), scale: hud.uiOptions.pointerScale, frameSize: framesNow().point?.size ?? 20 } : null,
        pie: pie ? { open: !pie.commit && pie.cancel == null, input: pie.input, sticky: pie.sticky, hot: pie.hot, items: pie.items.map((x) => x.key), off: [...pie.off], at: [pie.cx, pie.cy] } : null,
        pins: pins.map((p) => ({ kind: p.kind, color: p.color, removing: p.removeAt != null, at: p.kind === 'place' ? [+p.p.x.toFixed(2), +p.p.z.toFixed(2)] : null, slot: p.slot ?? null, screen: p.kind === 'place' ? atS(p.p) : null, behind: p.behind ?? null })),
        pops: pops.map((p) => ({ who: p.who, kind: p.kind, color: p.kind === 'emoji' ? null : p.color, emoji: p.kind === 'emoji' ? p.color : null, age: +(t - p.t0).toFixed(2) })),
        dock: { open: dockOpen, armed, color, rects: R.dock?.parts ?? null, button: R.dockBtn ?? null, picker: R.picker ? { x: R.picker.x, y: R.picker.y, w: R.picker.w, h: R.picker.h, rects: R.picker.parts } : null }, toolbar: R.toolbar ?? null,
        pinColor: { color, auto: colorAuto, autoColor: autoColor(), saved: pinSaved },
        reactions: { ...reactions, byKey: { ...reactions.byKey }, queued: reactQueue.length, last: lastReactKey },
        toasts: toasts.map((x) => x.text), tip: tipState && t < tipState.until,
        notebook: nb.info(), readers: readers.map((r) => ({ ...r })),
        books3d: N.book3d ? [...N.book3d.books.values()].filter((e) => e.book.root.visible).length : 0, mergedBooks: !!N.book3d?.merged,
        youIcon: you.id ? { p: 'atlas', t: 'thumb', i: 'initial', h: 'hd' }[iconOf(you.id, you.name).iconKey[0]] : null,
        bar: R.bar ? R.bar.map((r) => ({ k: r.k, x: r.x, y: r.y, w: r.w, h: r.h })) : null,
        // (vote-fix5) your seal's tag, the drawn tooltip, the pie's plate side, the vote keep-outs (logical px)
        sealTag: R.sealTag ? { ...R.sealTag } : null, tooltip: R.tooltip ? { ...R.tooltip } : null, pieCap: R.pieCap ?? null, barQuiet,
        dockStrip: !!R.dock?.strip, voteKeep: vcRing() ? voteKeepOuts().map((b) => [b.x0, b.y0, b.x1, b.y1].map(Math.round)) : null,
        palette: R.pal ? { open: true, items: R.pal.items.map((r) => ({ k: r.k, code: r.code, off: r.off, x: r.x, y: r.y, w: r.w, h: r.h })) } : { open: emotePal },
        tray: R.tray ? { open: true, items: R.tray.items.map((r) => ({ k: r.k, code: r.code, x: r.x, y: r.y, w: r.w, h: r.h })) } : { open: trayOpen },
        tipState: { shown: !!tipState, auto: tipState?.auto ?? null, rect: R.tip ? { x: R.tip.x, y: R.tip.y, w: R.tip.w, h: R.tip.h, close: R.tip.close, never: R.tip.never } : null,
          flying: !!tipFly, fly: lastFly, glowing: t >= bulbGlow && t < bulbGlow + GLOW_S, never: tipNever, neverSaved: tipNeverSaved, shownCount: tipShown, dismissed: [...tipDismissed] },
        events: { ...evInfo, captions: [...evInfo.captions], caption: caption?.text ?? null, veil: !!veil, dawn: !!dawn, vote: R.vote ? { ...R.vote } : null, exec: !!exec, ghost: !!ghostFx, poof: !!poof },
        offscreen: offscreen.map((o) => ({ ...o })),
        /** (OH) the overhead stacks as laid out last frame (overhead.js info: rects in logical px, clashes, dropped) */
        overhead: OH.info(),
        /** your person pins' hit rects (logical screen px, generous) as drawn last frame */
        personPins: personPinRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, color: r.pin.color, slot: r.pin.slot, removing: r.pin.removeAt != null })),
        chips: R.chips ?? null,
        cursor: canvas.style.cursor || 'default', tapTip: tapTip && L.t < tapTip.until ? { kind: tapTip.kind, k: tapTip.k } : null,
        clients: (R.clients ?? []).map((x) => ({ id: x.c.id ?? null, rects: x.rects.map((r) => ({ k: r.k, x: r.x, y: r.y, w: r.w, h: r.h })) })),
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
      if (pinPass.pass) pinPass.pass.enabled = warm > 0 || (!hdOn() && pins.some((p) => p.kind === 'place'));   // (density: the HD depth tier draws them)
      if (N.pass?.pass) N.pass.pass.enabled = warm > 0 || (style === 'held' && (reading || npcReading));
      if (talkPass) talkPass.enabled = warm > 0 || talkers.length > 0;
      // right press held without moving: the pie
      if (rpress && !pie && performance.now() - rpress.t0 > (rpress.touch != null ? E.TIMING.LONG_PRESS_MS : E.TIMING.RIGHT_HOLD_MS)) openPie();
      // (emoji) the townsfolk's reactions: the vote's result, then whatever is due (only over someone in the scene)
      reactToVote();
      for (let i = 0; i < reactQueue.length; i++) {
        const q = reactQueue[i];
        if (L.t < q.at) continue;
        reactQueue.splice(i--, 1);
        if (L.t - q.at < 2 && members.some((m) => !m.you && m.slot === q.who)) { pop(q.who, 'emoji', q.key); reactions.cast++; reactions.byKey[q.key] = (reactions.byKey[q.key] ?? 0) + 1; }
      }
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
            // (emoji) idle chat: now and then a neighbour reacts to the line (a laugh, a nod, a doubt); not in the
            // staged vote court (its reactions are the vote's own)
            if (!m.you && !staged() && hashK(m.slot * 13 + st.count) < 0.4) {
              const nb2 = m.slot >= 1000 ? (() => { const sts = store.state.seats; for (const d of [1, -1, 2]) { const j = (m.slot - 1000 + d + 15) % 15; if (sts[j]?.occupied && !sts[j].dead) return 1000 + j; } return null; })()
                : npcSlots().find((sl) => sl !== m.slot) ?? null;
              const h2 = hashK(m.slot + st.count * 3.1);
              if (nb2 !== null) npcReact(nb2, h2 < 0.55 ? 'laugh' : h2 < 0.8 ? 'agree' : 'question', 1.1);
            }
          } else if (!m.you && POP_OF[m.clip] && m.clip !== 'idle' && !(m.clip === 'vote' && m.slot >= 1000 && demo.passB?.marks)) pop(m.slot, POP_OF[m.clip]);   // (B) a seated voter's hand: votemarks.js draws the vote states
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
      for (const o of [...offs, ...offsHD]) { try { o?.(); } catch { /* gone */ } }
      nb.dispose();
      L.enabled = false;
    },
  };
  return api;
}
