// HUD atlas (owner: hud group; docs/UI.md §3.4): out/ui/hud.{png,json}   —   tools/uibake.sh hud
// (night token set: tools/uibake.sh hud:hud-night -> out/ui/hud-night.*; the font atlas: tools/uibake.sh hud:hud-font)
//
// v2 drew the whole HUD as DOM + CSS + one inline SVG (apps/client/src/ui/{hud,clock,voice}, game.css, help.css), so
// there are no v2 atlas frame names for this group: frames are named after the v2 CSS classes they replace
// (`ctc-chip_nominations` = .ctc-chip.ctc-nominations, `cth-toast_death` = .cth-toast-death, ...), so a DOM port can
// map class -> frame 1:1 and a canvas port can draw them. Dynamic text uses the bitmap fonts (kit body / hud display +
// label: out/ui/kit.json, out/ui/hud-font.json); `*_sample*` frames are fully composed references with v2 strings.
// meta.nineSlice gives the insets of every stretchable frame; meta.v2Class maps frame prefixes to the v2 selectors.
import * as A from './art.js';
import { DISPLAY } from './font.js';
import { PixelImage, drawBox, ramp, hex } from '../kit.js';

const crop = (im) => { const b = im.bbox(); return b ? im.crop(b.x, b.y, b.w, b.h) : im; };
/** Render with a drawer into a big scratch image and crop to the drawn pixels. */
function grab(w, h, fn) { const im = new PixelImage(w, h); fn(im); return crop(im); }
const STG = ['discussion', 'nominations', 'bedtime'];

export function framesFor(T) {
  const out = [];
  const add = (n, im) => out.push([n, im]);
  // ---------------------------------------------------------------------------------------------- clock (ctc-*)
  for (const s of STG) for (let k = 0; k <= 8; k++) add(`ctc-dial_${s}_${k}`, A.dial(T, { stage: s, frac: k / 8 }));
  for (const s of STG) for (let k = 0; k <= 8; k++) add(`ctc-dial_paused_${s}_${k}`, A.dial(T, { stage: s, frac: k / 8, paused: true }));
  // chip body 9-slices (24x15, insets 3/3/3/3): stage keylines, urgent, paused (dashed)
  for (const s of [...STG, 'paused', 'urgent']) {
    const im = new PixelImage(24, 15), P = A.stagePal(s === 'urgent' ? 'nominations' : s, T);
    drawBox(im, 0, 0, 24, 15, { line: 'outline', edge: s === 'urgent' ? T.danger : P.edge, fill: 'ink', hi: 'inkRaised', corner: 2 }, T);
    if (s === 'paused') for (let i = 3; i < 21; i++) if (((i - 3) >> 1) & 1) { im.set(i, 1, T.ink); im.set(i, 13, T.ink); }
    add(`ctc-chip_${s}`, im);
  }
  // urgent pulse glow rings (alpha bands) around a 24x15 chip: 1 band / 2 bands
  for (const n of [1, 2]) add(`ctc-urgent_glow_${n}`, A.urgentGlow(24, 15, n, T));   // alpha bands around the 24x15 9-slice
  for (const [n, st] of [['ctc-plus', 'normal'], ['ctc-plus_on', 'on'], ['ctc-plus_disabled', 'disabled']]) add(n, grab(60, 12, (im) => A.drawPlus(im, 0, 0, st, T)));
  const chipSamples = [
    ['ctc-chip_sample_discussion', { stage: 'discussion', label: 'Nominations open in', time: '5:58', frac: 0.99, plus: 'normal' }],
    ['ctc-chip_sample_nominations', { stage: 'nominations', label: 'Execution in', time: '1:05', frac: 0.22, plus: 'normal' }],
    ['ctc-chip_sample_urgent', { stage: 'nominations', label: 'Execution in', time: '0:25', frac: 0.08, plus: 'disabled', urgent: true, t: 0.7 }],
    ['ctc-chip_sample_bedtime', { stage: 'bedtime', label: 'Bedtime', time: '0:32', frac: 0.27, plus: null }],
    ['ctc-chip_sample_paused', { stage: 'discussion', label: 'Paused', time: '3:12', frac: 0.53, paused: true, plus: null }],
    ['ctc-chip_sample_due', { stage: 'discussion', label: 'Nominations open', time: null, frac: 0, due: true, plus: null }],
  ];
  for (const [n, o] of chipSamples) add(n, grab(200, 24, (im) => A.drawClockChip(im, 2, 4, T, o)));
  add('ctc-tray_sample', grab(200, 30, (im) => A.drawTray(im, 100, 2, T, {})));
  add('ctc-vote_sample', grab(150, 46, (im) => A.drawVoteCard(im, 1, 1, 140, T, { title: 'Ada proposes +2 min', yes: 1, needed: 3, secs: 29, frac: 29 / 30 })));
  add('ctc-vote_sample_yes', grab(150, 46, (im) => A.drawVoteCard(im, 1, 1, 140, T, { title: 'Ada proposes +2 min', yes: 2, needed: 3, secs: 18, frac: 0.6, my: 'yes' })));
  add('ctc-vote_sample_passing', grab(150, 46, (im) => A.drawVoteCard(im, 1, 1, 140, T, { title: 'Ada proposes +2 min', yes: 3, needed: 3, secs: 11, frac: 0.37, my: 'yes', passing: true })));
  add('ctc-vote_sample_no', grab(150, 46, (im) => A.drawVoteCard(im, 1, 1, 140, T, { title: 'You propose +5 min', yes: 1, needed: 4, secs: 9, frac: 0.3, my: 'no' })));
  add('ctc-vote_sample_closed', grab(150, 46, (im) => A.drawVoteCard(im, 1, 1, 140, T, { title: 'Ada proposes +1 min', yes: 1, needed: 3, secs: 0, frac: 0 })));
  add('ctc-result_ok', grab(160, 20, (im) => A.drawClockResult(im, 80, 1, T, { text: '+2 min added', kind: 'ok' })));
  add('ctc-result_no', grab(160, 20, (im) => A.drawClockResult(im, 80, 1, T, { text: 'Not extended', kind: 'no' })));
  add('ctc-result_asking', grab(200, 20, (im) => A.drawClockResult(im, 100, 1, T, { text: 'Asking the town for +2 min…', kind: 'asking' })));
  add('ctc-note', grab(200, 20, (im) => A.drawClockResult(im, 100, 1, T, { text: 'You already asked twice today.', kind: 'note' })));
  add('ctc-stctl_sample', grab(170, 64, (im) => A.drawStClock(im, 1, 1, 160, T, { stage: 'nominations', time: '4:12', minutes: 5 })));
  add('ctc-stctl_sample_paused', grab(170, 64, (im) => A.drawStClock(im, 1, 1, 160, T, { stage: 'discussion', time: '3:00', paused: true, minutes: 8 })));
  add('ctc-stctl_sample_unset', grab(170, 64, (im) => A.drawStClock(im, 1, 1, 160, T, { isSet: false, minutes: 1 })));
  // ---------------------------------------------------------------------------------------------- role chip / card (cth-*)
  add('cth-card-closed_sample', grab(220, 16, (im) => A.drawRoleChip(im, 1, 1, T, { role: 'Empath', team: 'good', house: 'Ravenscroft', badge: 1 })));
  add('cth-card-closed_sample_evil', grab(220, 16, (im) => A.drawRoleChip(im, 1, 1, T, { role: 'Imp', team: 'evil', house: 'Mossgate' })));
  add('cth-card-closed_sample_dead', grab(220, 16, (im) => A.drawRoleChip(im, 1, 1, T, { role: 'Undertaker', team: 'good', house: null, dead: 'vote', badge: 2 })));
  add('cth-card-closed_sample_long', grab(220, 16, (im) => A.drawRoleChip(im, 1, 1, T, { role: 'Fortune Teller', team: 'good', house: "Stargazer's Tower", badge: 1 })));
  add('cth-card-head_9s', box9(24, 13, { line: 'outline', edge: 'iron', fill: 'ink', hi: 'inkRaised', corner: 2 }, T));
  add('cth-card-head_9s_hover', box9(24, 13, { line: 'outline', edge: 'ironHi', fill: 'ink', hi: 'inkRaised', corner: 2 }, T));
  for (let n = 1; n <= 9; n++) add(`cth-badge_${n}`, A.badgeImg(n, T));
  add('cth-house_sample', grab(100, 12, (im) => A.drawHousePill(im, 0, 0, 'Ravenscroft', T)));
  add('cth-house_bare_sample', grab(100, 12, (im) => A.drawHouseBare(im, 0, 0, 'Ravenscroft', T)));
  for (const [n, s, tone] of [['cth-chip_ok', 'Alive', 'ok'], ['cth-chip', 'Seat 1', ''], ['cth-chip_dead', 'Dead', 'dead']]) {
    add(n + '_sample', grab(80, 14, (im) => A.drawPill(im, 0, 0, s, tone, T)));
    add(n + '_9s', box9(16, 11, { line: 'outline', edge: tone === 'ok' ? ramp(T.ok).sh : tone === 'dead' ? ramp(T.danger).sh : T.iron, fill: 'ink', corner: 2 }, T));
  }
  add('cth-rolecard_sample', grab(190, 190, (im) => A.drawRoleCard(im, 1, 1, 178, T, {})));
  add('cth-rolecard_sample_evil', grab(190, 190, (im) => A.drawRoleCard(im, 1, 1, 178, T, { role: 'Imp', type: 'demon', team: 'evil', house: 'Mossgate', ability: 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.', pills: [['Dead', 'dead'], ['Seat 5', ''], ['Ghost vote spent', '']], tab: 'notes', badge: 2, rows: [[1, 'Ada'], [4, 'Dov']] })));
  // ---------------------------------------------------------------------------------------------- toolbar + phase
  for (const k of ['notebook', 'gear', 'help', 'leave', 'abort']) add(`ct-tb-glyph_${k === 'gear' ? 'settings' : k}`, A.GLYPH[k](T));
  for (const st of ['normal', 'hover', 'pressed']) add(`ct-tb-btn_9s${st === 'normal' ? '' : '_' + st}`, box9(15, 15, btnStyle(st), T));
  add('ct-toolbar_sample', grab(200, 16, (im) => A.drawToolbar(im, 199, 0, T, {})));
  add('ct-toolbar_sample_host', grab(260, 16, (im) => A.drawToolbar(im, 259, 0, T, { host: true })));
  for (const k of ['sun', 'moon', 'bell', 'dawn', 'ring', 'star', 'candle']) add(`cth-phase-icon_${k}`, A.GLYPH[k](T));
  for (const [p, d, g] of [['day', 1], ['day', 2, true], ['first_night', 0], ['night', 2], ['bedtime', 1], ['dawn', 3], ['finished', 3], ['setup', 0]])
    add(`cth-phase_sample_${p}${g ? '_gathered' : ''}`, grab(120, 12, (im) => A.drawPhaseChip(im, 119, 0, T, { phase: p, day: d, gathered: g })));
  add('cth-phase_sample_countdown', grab(140, 12, (im) => A.drawPhaseChip(im, 139, 0, T, { phase: 'bedtime', day: 2, countdown: 23 })));
  add('cth-phase_sample_visit', grab(120, 12, (im) => A.drawPhaseChip(im, 119, 0, T, { phase: 'night', day: 2, visit: true })));
  // ---------------------------------------------------------------------------------------------- toasts
  for (const [k, s] of [['info', 'Ada nominates Cleo.'], ['death', 'Esme died in the night.'], ['execution', 'Gus was executed.'], ['error', 'You can only nominate once per day.'], ['game_over', 'Good wins']]) {
    add(`cth-toast_${k}_9s`, A.toastFrame9(k, T));
    add(`cth-toast_${k}_sample`, grab(176, 40, (im) => A.drawToast(im, 1, 1, 170, T, { text: s, kind: k })));
  }
  // v2 .cth-vote-pill (vote result) and .cth-block (on the block): round, ⚖ glyph
  add('cth-toast_vote_9s', A.toastFrame9('vote', T));
  add('cth-toast_vote_sample', grab(176, 40, (im) => A.drawToast(im, 1, 1, 170, T, { text: 'Cora: 4 votes (needed 3) · ✓ your vote counted', kind: 'vote', name: 'Cora' })));
  add('cth-toast_vote_sample_down', grab(176, 40, (im) => A.drawToast(im, 1, 1, 170, T, { text: 'Cora: 2 votes (needed 3) · your hand was down: not counted', kind: 'vote', name: 'Cora' })));
  add('cth-block_9s', A.toastFrame9('block', T));
  add('cth-block_sample', grab(176, 20, (im) => A.drawToast(im, 1, 1, 170, T, { text: 'Cora is on the block (4)', kind: 'block', name: 'Cora' })));
  add('cth-toast-x', A.GLYPH.close(T));
  // ---------------------------------------------------------------------------------------------- hints / prompts / keys
  for (const tone of HINT_TONES) {
    const P = A.hintTone(tone === 'default' ? '' : tone, T);
    add(`cth-hint_${tone}_9s`, box9(16, 13, { line: 'outline', edge: P.edge, fill: P.fill || 'ink', hi: P.fill ? null : 'inkRaised', corner: 2 }, T));
    add(`cth-hint_${tone}_sample`, grab(240, 16, (im) => A.drawHint(im, 120, 1, T, { parts: 'Take your seat in the circle (seat 5).', tone: tone === 'default' ? '' : tone })));
  }
  for (const tone of HINT_TONES) { const P = A.hintTone(tone === 'default' ? '' : tone, T); add(`cth-hint_pill_${tone}_9s`, box9(16, 11, { line: 'outline', edge: P.edge, fill: P.fill || 'ink', hi: null, corner: 2 }, T)); }
  // v2 hints.tsx short labels (pill mode): glyph + 1-2 words (+ the bedtime countdown)
  for (const [n, short, tone, cd] of [['seat', A.HINT_SHORT.seat(5), ''], ['walk-home', A.HINT_SHORT.walkHome(), '', 42], ['not-your-house', A.HINT_SHORT.notYourHouse(), ''],
    ['vote', A.HINT_SHORT.vote(), 'vote'], ['paused', A.HINT_SHORT.paused(), 'frozen'], ['private', A.HINT_SHORT.privateVisit(), 'private'], ['hand-up', A.HINT_SHORT.handUp(), 'ok']])
    add(`cth-hint_pill_${n}`, grab(160, 14, (im) => A.drawHint(im, 80, 1, T, { parts: cd ? [{ s: 'x' }, { countdown: cd }] : 'x', short, tone, mode: 'pill' })));
  add('cth-hint_mid_sample', grab(240, 16, (im) => A.drawHint(im, 120, 1, T, { parts: 'Take your seat in the circle (seat 5).', short: A.HINT_SHORT.seat(5), tone: '', mode: 'mid' })));
  add('ct-game-prompt_9s', box9(16, 15, { line: 'outline', edge: 'iron', fill: 'ink', hi: 'inkRaised', sh: null, corner: 1, shadow: true }, T, 16));
  add('ct-game-prompt_sample', grab(200, 18, (im) => A.drawPrompt(im, 100, 1, T, { text: 'Walk in: Ravenscroft' })));
  add('ct-game-prompt_key_sample', grab(200, 18, (im) => A.drawPrompt(im, 100, 1, T, { text: 'Walk in: Ravenscroft', key: 'E' })));
  add('ct-game-prompt_locked_sample', grab(260, 18, (im) => A.drawPrompt(im, 130, 1, T, { text: 'Mossgate is locked by the Storyteller', locked: true })));
  add('ct-hint_sample', grab(300, 40, (im) => A.drawKeyHint(im, 150, 1, T, {})));
  add('ct-hint_sample_touch', grab(320, 30, (im) => A.drawKeyHint(im, 160, 1, T, { tokens: A.KEY_HINT_TOUCH, maxW: 320 })));
  for (const k of ['W', 'A', 'S', 'D', 'E', 'Enter', '?']) add(`kbd_${k === '?' ? 'help' : k.toLowerCase()}`, grab(40, 10, (im) => A.drawKbd(im, 0, 0, k, T)));
  // ---------------------------------------------------------------------------------------------- countdown
  add('ct-countdown_sample', grab(40, 10, (im) => A.drawCountdown(im, 1, 1, 95, T, {})));
  add('ct-countdown-low_0', grab(40, 10, (im) => A.drawCountdown(im, 1, 1, 9, T, { t: 0 })));
  add('ct-countdown-low_1', grab(40, 10, (im) => A.drawCountdown(im, 1, 1, 9, T, { t: 0.5 })));
  add('ct-countdown_display', grab(40, 12, (im) => A.drawCountdown(im, 1, 0, 358, T, { font: DISPLAY })));
  // ---------------------------------------------------------------------------------------------- voice (ctv-*)
  add('ctv-dot-ok', A.voiceDot('ok', T)); add('ctv-dot-live', A.voiceDot('live', T)); add('ctv-dot-wait_0', A.voiceDot('wait', T, 0)); add('ctv-dot-wait_1', A.voiceDot('wait', T, 0.5));
  add('ctv-dot-bad', A.voiceDot('bad', T)); add('ctv-dot', A.voiceDot('idle', T));
  for (let k = 0; k < 4; k++) add(`ctv-wave_${k}`, A.wave(T, k));
  add('ctv-micicon', A.GLYPH.mic(T)); add('ctv-micicon_off', A.GLYPH.mic(T, ramp(T.danger).hi, true));
  for (const m of ['idle', 'live', 'muted']) add(`ctv-mic-${m}`, grab(60, 12, (im) => A.drawMicChip(im, 0, 0, T, { state: m })));
  add('ctv-pill_sample', grab(200, 16, (im) => A.drawVoicePill(im, 199, 0, T, { link: 'ok', mic: 'live', talkers: ['Cleo', 'Gus'] })));
  add('ctv-pill_sample_muted', grab(200, 16, (im) => A.drawVoicePill(im, 199, 0, T, { link: 'bad', mic: 'muted', talkers: [] })));
  // ---------------------------------------------------------------------------------------------- touch
  add('ct-touch-stick', grab(64, 64, (im) => { A.drawJoystick(im, 0, 0, T, {}); eraseKnob(im); }));
  add('ct-touch-stick_active', grab(64, 64, (im) => { A.drawJoystick(im, 0, 0, T, { active: true }); eraseKnob(im); }));
  add('ct-touch-knob', A.knob(T));
  add('ct-touch-use', grab(80, 26, (im) => A.drawUseButton(im, 0, 0, T, { label: 'Walk in' })));
  add('ct-touch-use_pressed', grab(80, 26, (im) => A.drawUseButton(im, 0, 0, T, { label: 'Walk in', pressed: true })));
  add('ct-touch-use_locked', grab(80, 26, (im) => A.drawUseButton(im, 0, 0, T, { label: 'Locked', locked: true })));
  // ---------------------------------------------------------------------------------------------- connection / loading
  for (let k = 0; k < 8; k++) add(`ct-spinner_${k}`, A.spinner(T, k));
  add('ct-conn_sample', grab(300, 18, (im) => A.drawConn(im, 150, 1, T, {})));
  add('ct-conn-lost_sample', grab(260, 22, (im) => A.drawConn(im, 130, 1, T, { lost: true })));
  add('ct-game-loading_sample', grab(140, 20, (im) => A.drawLoading(im, 70, 10, T, {})));
  add('ct-game-failed_sample', grab(140, 40, (im) => A.drawLoading(im, 70, 20, T, { failed: true })));
  // ---------------------------------------------------------------------------------------------- inline glyphs
  for (const k of ['house', 'ghost', 'skull', 'lock', 'door', 'close', 'pause', 'play', 'minus', 'plus', 'caretUp', 'caretDown', 'scales', 'hand', 'snow']) add(`glyph-${k.replace(/[A-Z]/, (c) => '-' + c.toLowerCase())}`, A.GLYPH[k](T));
  return out;
}
const HINT_TONES = ['default', 'ok', 'auto', 'frozen', 'private', 'vote', 'night', 'dead'];
/** An empty stretchable box (drawBox style) of w x h (+1 row when the style has a drop shadow). */
function box9(w, h, style, T, H = null) { const im = new PixelImage(w, H ?? h); drawBox(im, 0, 0, w, h, style, T); return im; }
const btnStyle = (st) => (st === 'pressed' ? { line: 'outline', edge: 'iron', fill: 'inkSunk', hi: 'ironSh', corner: 1, press: 1 }
  : st === 'hover' ? { line: 'outline', edge: 'ironHi', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1 } : { line: 'outline', edge: 'iron', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1 });
function eraseKnob(im) { for (let y = 18; y < 46; y++) for (let x = 18; x < 46; x++) { const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32); if (d <= 13.5) im.erase(x, y); } }

/** Palette audit (docs/UI.md §2.3): every opaque colour must be a token or a ramp tone of a token. */
export function audit(frames, T) {
  const r = [ramp(T.danger), ramp(T.ok), ramp(T.good), ramp(T.warn), ramp(T.stViolet), ramp(T.evil)];
  const allowed = new Set([...Object.values(T).filter((v) => typeof v === 'string').map((v) => hex(v)), ...r.flatMap((q) => Object.values(q).map((v) => hex(v))),
    hex(ramp(T.danger, { line: 0.4 }).line), hex(ramp(T.ok, { line: 0.42 }).line), hex(T.scrim)]);
  const used = new Map(); for (const [n, im] of frames) for (const c of im.colors()) { if (!used.has(c)) used.set(c, []); used.get(c).push(n); }
  const untraced = [...used.keys()].filter((c) => !allowed.has(c));
  return { colours: used.size, untraced, where: Object.fromEntries(untraced.map((c) => [c, used.get(c).slice(0, 4)])) };
}

export default {
  image: 'hud.png',
  width: 512,
  async frames({ T }) {
    const f = framesFor(T);
    this._audit = audit(f, T);
    return f;
  },
  meta({ T }) {
    return {
      fps: { 'ct-spinner': A.TIMING.SPINNER_FPS, 'ctv-wave': A.TIMING.WAVE_FPS, 'ctv-dot-wait': 2, 'ct-countdown-low': 2, 'ctc-urgent_glow': 'bands 0,1,2,1,0 over 1.6 s (art.pulseBands)' },
      timing: { ...A.TIMING, toastMs: 'error 9000; else clamp(3500 + 60 * text.length, 6000, 14000)' },
      nineSlice: {
        ...Object.fromEntries([...STG, 'paused', 'urgent'].map((s) => [`ctc-chip_${s}`, { l: 3, t: 3, r: 3, b: 3, dashed: s === 'paused' }])),
        ...Object.fromEntries(['info', 'death', 'execution', 'error', 'game_over'].map((k) => [`cth-toast_${k}_9s`, { l: 3, t: 2, r: 2, b: 3, shadow: 1, note: 'left 3 = outline + the 2-px kind rule; text at x 7, y 3, line 9; x at w-9' }])),
        'cth-toast_vote_9s': { l: 3, t: 3, r: 3, b: 4, shadow: 1, note: 'round (corner 2); ⚖ glyph-scales at (5, 2); text right-aligned, column x 17 .. w-14' },
        'cth-block_9s': { l: 3, t: 3, r: 3, b: 4, shadow: 1, note: 'round (corner 2), width fits the text: 17 + text + 7' },
        ...Object.fromEntries(HINT_TONES.map((t) => [`cth-hint_${t}_9s`, { l: 3, t: 3, r: 3, b: 3, note: '13 tall, padding 7' }])),
        ...Object.fromEntries(HINT_TONES.map((t) => [`cth-hint_pill_${t}_9s`, { l: 3, t: 2, r: 3, b: 3, note: '11 tall, padding 4, short label (cth-hint_pill_<short>)' }])),
        'ct-game-prompt_9s': { l: 2, t: 3, r: 2, b: 3, shadow: 1, note: '15 tall + 1 shadow row; text at x 7, y 4' },
        'cth-card-head_9s': { l: 3, t: 3, r: 3, b: 3, note: 'closed role chip, 13 tall' }, 'cth-card-head_9s_hover': { l: 3, t: 3, r: 3, b: 3 },
        ...Object.fromEntries(['cth-chip_ok_9s', 'cth-chip_9s', 'cth-chip_dead_9s'].map((n) => [n, { l: 3, t: 3, r: 3, b: 3, note: '11 tall, text at x 5, y 3' }])),
        'ct-tb-btn_9s': { l: 3, t: 3, r: 3, b: 3 }, 'ct-tb-btn_9s_hover': { l: 3, t: 3, r: 3, b: 3 }, 'ct-tb-btn_9s_pressed': { l: 3, t: 3, r: 3, b: 3, note: 'content 1 px down/right' },
      },
      samples: 'frames named *_sample* carry v2 example text: references only; the *_9s frames are the DOM border-image skins',
      dial: { size: 15, frames: 'ctc-dial_<stage>_<k>, k = 0..8 = frac k/8 (time left); ctc-dial_paused_<stage>_<k>; draw any frac with art.dial()', medallion: 'set into the chip left end: chip box starts at the dial centre (x + 7)' },
      stages: Object.fromEntries([...STG, 'paused'].map((s) => [s, A.stagePal(s, T)])),
      v2Class: {
        'ctc-chip_*': '.ctc-chip.ctc-<tone> (+ .ctc-urgent)', 'ctc-dial_*': '.ctc-dial (MiniDial svg)', 'ctc-plus*': '.ctc-plus (+ .on / [aria-disabled])', 'ctc-tray*': '.ctc-tray',
        'ctc-vote*': '.ctc-vote (+ .passing) / .ctc-yes.on / .ctc-no.on / .ctc-drain', 'ctc-result*': '.ctc-result (.ok / .no)', 'ctc-note': '.ctc-note', 'ctc-stctl*': '.ctc-stctl (StClock.tsx)',
        'cth-card-closed*': '.cth-card.cth-card-closed .cth-card-head', 'cth-badge_<n>': '.cth-badge', 'cth-house*': '.cth-chip.cth-house', 'cth-chip*': '.cth-chip (.ok / .dead)', 'cth-rolecard*': '.cth-card (expanded)',
        'ct-tb-*': '.ct-toolbar button / .ct-tb-glyph', 'cth-phase*': '.cth-phase / .cth-phase-icon', 'cth-toast*': '.cth-toast(-death|-execution|-error|-game_over), .cth-toast-x', 'cth-toast_vote*': '.cth-vote-pill (vote result)', 'cth-block*': '.cth-block (on the block)', 'cth-card-head*': '.cth-card-closed .cth-card-head (9-slice)', 'cth-hint_pill_*': '.cth-hint.pill (short label: hints.tsx short)', 'cth-hint*': '.cth-hint (.ok .auto .frozen .private .vote .night .dead, .pill)',
        'ct-game-prompt*': '.ct-game-prompt (.locked, kbd)', 'ct-hint*': '.ct-hint (first-run keys)', 'kbd_*': 'kbd', 'ct-countdown*': '.ct-countdown(-low)', 'ctv-*': 'voice.css .ctv-dot-*, .ctv-wave, .ctv-mic-*, .ctv-pill', 'ct-touch-*': '.ct-touch-stick/-knob/-use',
        'ct-spinner_*': '.ct-spinner', 'ct-conn*': '.ct-conn(-lost)', 'ct-game-loading*': '.ct-game-loading(.ct-game-failed)', 'glyph-*': 'inline text glyphs (⌂ 👻 ☠ 🔒 ✕ ❚❚ ▶ − + ▲ ▼ ⚖ ✋ ❄)',
      },
      text: { body: 'kit body (out/ui/kit.json meta.bitmapFont.body)', display: 'out/ui/hud-font.json meta.bitmapFont.display', label: 'out/ui/hud-font.json meta.bitmapFont.label' },
      towerClock: { tier: 'W', module: 'src/ui/hud/tower.js createTowerClock(engine, {center, normal, up, radius}).set({stage, frac, paused, idle})', wedge: 'sector r = 0.86 dial radius from 12 clockwise, unlit stage colour, Bayer stipple 8/16 (paused 4/16)', hand: 'iron box to the wedge end; pause bars; brass hub' },
      newStyle: { note: 'every frame is new-style (v2 had no HUD atlas); names = v2 CSS classes', display: 'titling small caps (font atlas hud-font)', medallion: 'mini dial as a brass medallion set into the chip', italic: 'pixel shear for v2 italic text (ability, locked prompt, loading)' },
      paletteAudit: this._audit,
    };
  },
};
