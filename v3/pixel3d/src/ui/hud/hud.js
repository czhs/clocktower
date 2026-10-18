// HUD slot module for the mock HUD (owner: hud group; docs/UI.md §3.3, rows 22 + 26–38). scenes/ui-hud.js calls
// setup(hud) once and draw(hud, L) every frame (tier S: everything goes to L.screen, 640x360, inside SLOTS.hud).
//
//   index.html?scene=ui-hud&groups=hud&state=<state>[&tod=noon|night][&rm=1][&t=<s>]
//   state = showcase (default: the mock HUD; day = discussion clock, night = bedtime) | anim (scripted 18 s loop:
//           countdown -> urgent -> due -> nominations, + time tray, vote card, result, toasts, hint -> pill)
//           | clock (every chip state) | vote | st (Storyteller view + clock control) | card | dead | toasts
//           | hints | voice | touch | conn | tower (the town clock tower dial with the game wedge, tier W: ./tower.js)
//   rm=1 reduced motion (no pulse / blink / pop / dissolve / spinner motion; state changes still show).
// (scenes/ui-hud.js is the mock HUD itself, so this group has no separate scene file: the states above are the group
// scene. docs/UI.md §3.1 names `scenes/ui-<g>.js`, which for g = hud is the lead's mock HUD.)
//
// Exposes hud.hudGroup = { art, font, layout } so other groups (panels: the ST panel embeds drawStClock) can reuse it.
import * as A from './art.js';
import * as F from './font.js';
import { SLOTS, rect } from '../placeholders.js';
import * as KIT from '../kit.js';
import { PixelImage, GRID_HZ, drawText, textWidth } from '../kit.js';

const slot = (i, L) => rect(SLOTS.hud[i], L.screen.w, L.screen.h);
const gf = A.gf;
// The role chip may run to A.ROLE_CHIP_MAX (180) before the house name is cut (CONTRACT-REQUEST: SLOTS.hud[0].w 150 -> 180;
// the clock chip starts at x >= 220, so 4..184 is free).
const ROLE_W = (rr) => Math.max(rr.w, A.ROLE_CHIP_MAX);

/** Draw fn(img) into a temp image, apply the appear/disappear envelope (grid frames), blit at (x, y). */
function withFx(L, x, y, w, h, age, left, reduced, fn) {
  const tmp = new PixelImage(w + 8, h + 8);
  fn(tmp, 4, 4);
  const r = A.envelopeFx(tmp, age, left, { reduced, ox: x, oy: y });
  if (r) L.screen.blit(r.img, x - 4, y - 4 + r.dy);
}

// ------------------------------------------------------------------------------------------------ toasts stack
/**
 * v2 cth-toasts: a column, push order; each toast lives toastMs(kind, text). Items: {text, kind, at (s), ms?}.
 * A dissolving toast keeps its place; when it is gone, the rest close the gap with one halfway drawing (2 grid frames).
 */
function drawToasts(L, T, items, t, { x, y, w, reduced }) {
  let cy = y;
  for (const it of items) {
    const ms = it.ms ?? A.TIMING.toastMs(it.kind || 'info', it.text);
    const age = A.sgf(t - it.at), endF = Math.round(ms / 1000 * GRID_HZ), left = age - endF;
    const h = A.toastHeight(it.text, w, it.kind), bw = A.toastWidth(it.text, w, it.kind), bx = x + w - bw;   // 'block' fits its text, right-aligned
    if (age < 0) continue;
    if (left >= 6 || (reduced && left >= 0)) { const g = left - 6; if (!reduced && g < 2) cy += Math.ceil((h + 2) / 2); continue; }
    withFx(L, bx, cy, bw, h + 1, age, left >= 0 ? left : null, reduced, (img, ox, oy) => A.drawToast(img, ox, oy, bw, T, it));
    cy += h + 3;
  }
}

// ------------------------------------------------------------------------------------------------ hint lifecycle
/** v2 MoveHint: pop in, full for HINT_MS; non-sticky -> dissolve (v2 fade 88-100 % of 6.6 s); sticky -> shrink to pill. */
function hintAt(t, at, { sticky = false, reduced = false } = {}) {
  const age = A.sgf(t - at);
  if (age < 0) return null;
  const full = Math.round(A.TIMING.HINT_MS / 1000 * GRID_HZ);
  if (sticky) return { age, left: null, mode: age < full ? 'full' : age < full + 2 && !reduced ? 'mid' : 'pill' };
  const out = Math.round(A.TIMING.HINT_ANIM_MS * 0.88 / 1000 * GRID_HZ);
  return { age, left: age >= out ? age - out : null, mode: 'full' };
}
function drawHintAt(L, T, cx, y, st, opts, reduced) {
  if (!st) return;
  const probe = new PixelImage(L.screen.w, 20);
  const r = A.drawHint(probe, cx, 2, T, { ...opts, mode: st.mode, t: L.t, reduced });
  withFx(L, r.x, y + (13 - r.h), r.w, r.h + 1, st.age, st.left, reduced, (img, ox, oy) => A.drawHint(img, ox + Math.floor(r.w / 2), oy, T, { ...opts, mode: st.mode, t: L.t, reduced }));
}

// ------------------------------------------------------------------------------------------------ the clock chip in a slot
function clockChipAt(L, T, o, y = null) {
  const r = slot(1, L), w = A.clockChipWidth(o);
  const x = r.x + Math.floor((r.w - w) / 2);
  A.drawClockChip(L.screen, x, y ?? r.y, T, { ...o, t: L.t });
  return { x, w, cx: x + Math.floor(w / 2), bottom: (y ?? r.y) + 15 };
}
const chipState = (stage, leftS, totalS, { paused = false, plus = 'normal', onTheBlock = true, reduced = false } = {}) => {
  const due = leftS <= 0 && !paused;
  return {
    stage, paused, due, reduced, plus,
    label: A.stageLabel(stage, { onTheBlock, due, paused }),
    time: due ? null : A.formatCountdown(leftS * 1000),
    frac: due ? 0 : Math.max(0, Math.min(1, leftS / totalS)),
    urgent: !paused && !due && leftS * 1000 <= A.TIMING.URGENT_MS,
  };
};

// ------------------------------------------------------------------------------------------------ states
/**
 * UI integration r2 (whole-screen critic: the mock contradicted itself, BEDTIME over 'Raise a hand to vote', VOTES 2/3
 * beside 'Cleo: 4 votes'): on the mock game screen (scenes/ui-hud.js ?game=1) the lead's ONE mock clock + state
 * (hud.game.hudAt(t) -> G) drives this group's chips, toasts and hint, so every slot tells the same moment.
 * G = { view: 'player'|'st', chip: {stage, leftS, totalS, onTheBlock, plus}, phase: {phase, day, gathered}, toasts: [...]
 * (absolute stage times), hint: {parts, short, at} | null }.
 */
function gameShowcase(hud, L, T, S, G) {
  const img = L.screen, W = img.w, t = L.t, st = G.view === 'st';
  const rr = slot(0, L);
  if (!st) A.drawRoleChip(img, rr.x, rr.y, T, { role: S.you.role, team: S.you.team, house: 'Ravenscroft', badge: 1, maxW: ROLE_W(rr) });
  const c = G.chip;
  clockChipAt(L, T, chipState(c.stage, c.leftS, c.totalS, { onTheBlock: c.onTheBlock, plus: st ? null : c.plus ?? 'normal', reduced: S.reduced }));
  A.drawToolbar(img, W - 4, slot(2, L).y, T, st ? { host: true } : {});
  A.drawPhaseChip(img, W - 4, slot(3, L).y, T, { ...G.phase, t });
  if (st) {
    // the Storyteller's clock control, where the panels group's Storyteller panel embeds it (left column)
    A.drawStClock(img, 4, 24, 168, T, { stage: c.stage, time: A.formatCountdown(Math.max(0, c.leftS) * 1000), urgent: c.leftS <= 30, minutes: 5, onTheBlock: c.onTheBlock });
  }
  const to = slot(4, L);
  drawToasts(L, T, G.toasts || [], t, { x: to.x, y: to.y, w: to.w, reduced: S.reduced });
  if (G.hint) {
    const hr = slot(5, L);
    drawHintAt(L, T, hr.x + Math.floor(hr.w / 2), hr.y, hintAt(t, G.hint.at, { sticky: true, reduced: S.reduced }), G.hint, S.reduced);
  }
}

const STATES = {
  showcase(hud, L, T, S) {
    const G = hud.game?.hudAt?.(L.t);
    if (G) return gameShowcase(hud, L, T, S, G);
    const night = hud.tod === 'night', t = L.t;
    const W = L.screen.w, img = L.screen;
    // role chip (you = Dov, the Undertaker)
    const rr = slot(0, L);
    A.drawRoleChip(img, rr.x, rr.y, T, { role: S.you.role, team: S.you.team, house: 'Ravenscroft', badge: 1, maxW: ROLE_W(rr) });
    // clock chip: day = discussion counting down from 5:58 (loops every 6 min), night = bedtime 0:42 -> urgent pulse
    if (night) clockChipAt(L, T, chipState('bedtime', 42 - (t % 40), 120, { plus: null, reduced: S.reduced }));
    else clockChipAt(L, T, chipState('discussion', 358 - (t % 300), 360, { reduced: S.reduced }));
    // toolbar + phase chip
    const tb = slot(2, L);
    A.drawToolbar(img, W - 4, tb.y, T, {});
    const ph = slot(3, L);
    A.drawPhaseChip(img, W - 4, ph.y, T, night ? { phase: 'bedtime', day: 1, t } : { phase: 'day', day: 1, t });
    // toasts (loop 12 s)
    const to = slot(4, L), c = Math.floor(t / 12) * 12;
    const items = night
      ? [{ text: 'The bell tolls: bedtime.', kind: 'info', at: c + 0.2 }, { text: 'Gus was executed.', kind: 'execution', at: c + 1.4 }]
      : [{ text: 'Ada nominates Cleo.', kind: 'info', at: c + 0.2 }, { text: 'Cleo: 4 votes (needed 3) · ✓ your vote counted', kind: 'vote', name: 'Cleo', at: c + 1.4 },
        { text: 'Cleo is on the block (4)', kind: 'block', name: 'Cleo', at: c + 1.5 }];
    drawToasts(L, T, items, t, { x: to.x, y: to.y, w: to.w, reduced: S.reduced });
    // hint pill (sticky: full for 6 s, then the pill)
    const hr = slot(5, L);
    // v2 hints.tsx sticky hints (they shrink to the short label): gathering = take your seat, bedtime = walk home + countdown
    const hint = night ? { parts: [{ s: 'Night is falling: walk home.' }, { countdown: 42 - (t % 40) }], short: A.HINT_SHORT.walkHome(), tone: '' }
      : { parts: 'Take your seat in the circle (seat 4).', short: A.HINT_SHORT.seat(4), tone: '' };
    drawHintAt(L, T, hr.x + Math.floor(hr.w / 2), hr.y, hintAt(t, Math.floor(t / 12) * 12 + 0.4, { sticky: true, reduced: S.reduced }), hint, S.reduced);
  },

  anim(hud, L, T, S) {
    const P = 18, u = ((L.t % P) + P) % P, c = L.t - u, img = L.screen, W = img.w, red = S.reduced;
    const rr = slot(0, L);
    A.drawRoleChip(img, rr.x, rr.y, T, { role: S.you.role, team: S.you.team, house: 'Ravenscroft', badge: u > 8 ? 1 : 0, maxW: ROLE_W(rr) });
    A.drawToolbar(img, W - 4, slot(2, L).y, T, {});
    A.drawPhaseChip(img, W - 4, slot(3, L).y, T, { phase: 'day', day: 2, gathered: u >= 8, t: L.t });
    // clock: discussion 0:07 -> due at 7.0 s ("Nominations open", 1 s) -> nominations from 5:00
    const plus = u >= 9 && u < 10.2 ? 'on' : u >= 10.2 && u < 14 ? 'disabled' : 'normal';
    const chip = u < 8 ? chipState('discussion', Math.max(0, 7 - u), 360, { plus, reduced: red }) : chipState('nominations', 300 - (u - 8), 300, { plus, reduced: red });
    const cc = clockChipAt(L, T, chip);
    const below = cc.bottom + 3;
    // tray (open 9.0 .. 10.2), asking (10.3 .. 10.8), vote card (10.8 .. 14.0), result (14.0 .. 16.8 = RESULT_MS)
    const fx = (from, to, fn, w, h, x) => { const age = A.sgf(u - from), left = u >= to ? gf(u - to) : null; if (age >= 0) withFx(L, x, below, w, h, age, left, red, fn); };
    if (u >= 9 && u < 10.6) { const probe = new PixelImage(W, 24); const r = A.drawTray(probe, cc.cx, 0, T, { hover: u > 9.5 ? 1 : null }); fx(9, 10.2, (im, ox, oy) => A.drawTray(im, ox + Math.floor(r.w / 2), oy, T, { hover: u > 9.5 ? 1 : null }), r.w, r.h + 1, r.x); }
    if (u >= 10.2 && u < 11.0) { const probe = new PixelImage(W, 24); const r = A.drawClockResult(probe, cc.cx, 0, T, { text: 'Asking the town for +2 min…', kind: 'asking' }); fx(10.3, 10.8, (im, ox, oy) => A.drawClockResult(im, ox + Math.floor(r.w / 2), oy, T, { text: 'Asking the town for +2 min…', kind: 'asking' }), r.w, r.h + 1, r.x); }
    if (u >= 10.8 && u < 14.4) {
      const secs = Math.max(0, Math.ceil(30 - (u - 10.8))), frac = Math.max(0, (30 - (u - 10.8)) / 30);
      const yes = u < 12.0 ? 1 : u < 12.6 ? 2 : u < 13.4 ? 2 : 3, my = u >= 12.0 ? 'yes' : null;
      const vw = 140, vx = cc.cx - vw / 2;
      fx(10.8, 14.0, (im, ox, oy) => A.drawVoteCard(im, ox, oy, vw, T, { title: 'You propose +2 min', yes, needed: 3, secs, frac, my, passing: yes >= 3, hover: u > 11.6 && u < 12 ? 'yes' : null }), vw, 41, vx);
    }
    if (u >= 14.25) { const probe = new PixelImage(W, 24); const r = A.drawClockResult(probe, cc.cx, 0, T, { text: '+2 min added', kind: 'ok' }); fx(14.25, 14.25 + A.TIMING.RESULT_MS / 1000, (im, ox, oy) => A.drawClockResult(im, ox + Math.floor(r.w / 2), oy, T, { text: '+2 min added', kind: 'ok' }), r.w, r.h + 1, r.x); }
    // toasts
    const to = slot(4, L);
    drawToasts(L, T, [
      { text: 'Nominations are open.', kind: 'info', at: c + 8.1 },
      { text: 'You propose adding 2 minutes to the clock. Vote now!', kind: 'info', at: c + 10.8, ms: 7000 },
      { text: 'Bram is dead.', kind: 'death', at: c + 0.4, ms: 6000 },
    ].sort((a, b) => a.at - b.at), L.t, { x: to.x, y: to.y, w: to.w, reduced: red });
    // hints: non-sticky "Seated" (0.5 .. ~6.3), sticky vote hint 8.0 -> pill at 14.0
    const hr = slot(5, L), hx = hr.x + Math.floor(hr.w / 2);
    if (u < 8) drawHintAt(L, T, hx, hr.y, hintAt(u, 0.5, { reduced: red }), { parts: 'Seated (seat 4).', tone: 'ok' }, red);
    else drawHintAt(L, T, hx, hr.y, hintAt(u, 8.0, { sticky: true, reduced: red }), { parts: 'Vote now: raise your hand before the clock reaches you.', short: A.HINT_SHORT.vote(), tone: 'vote' }, red);
  },

  clock(hud, L, T, S) {
    // every chip state, stacked down the centre (+ the Storyteller chip without "+ time")
    const img = L.screen, cx = Math.floor(img.w / 2), t = L.t, red = S.reduced;
    const rows = [
      ['discussion', chipState('discussion', 358 - (t % 60), 360, { reduced: red })],
      ['urgent', chipState('nominations', 28 - (t % 20), 300, { reduced: red })],
      ['bedtime', chipState('bedtime', 95 - (t % 60), 120, { plus: 'disabled', reduced: red })],
      ['paused', chipState('discussion', 192, 360, { paused: true, plus: null })],
      ['due', chipState('nominations', 0, 300, { plus: null, onTheBlock: false })],
      ['st', chipState('bedtime', 25 - (t % 20), 120, { plus: null, reduced: red })],
      ['plus on', chipState('discussion', 122, 360, { plus: 'on' })],
    ];
    rows.forEach(([tag, o], i) => {
      const w = A.clockChipWidth(o), x = cx - Math.floor(w / 2), y = 30 + i * 24;
      A.drawClockChip(img, x, y, T, { ...o, t });
      img.blit(tagImg(tag, T), x - 8 - tagImg(tag, T).w, y + 3);
    });
    // dial close-ups: 8 fractions per stage (the hand steps whole pixels)
    const fr = [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0.04, 0];
    ['discussion', 'nominations', 'bedtime'].forEach((s, j) => fr.forEach((f, i) => img.blit(A.dial(T, { stage: s, frac: f }), 470 + i * 17, 40 + j * 20)));
    fr.forEach((f, i) => img.blit(A.dial(T, { stage: 'discussion', frac: f, paused: true }), 470 + i * 17, 100));
  },

  vote(hud, L, T, S) {
    const img = L.screen, cx = Math.floor(img.w / 2);
    const cc = clockChipAt(L, T, chipState('nominations', 240 - (L.t % 60), 300, { plus: 'disabled' }));
    const secs = Math.max(0, 29 - Math.floor(L.t % 30));
    A.drawVoteCard(img, cx - 70, cc.bottom + 3, 140, T, { title: 'Ada proposes +2 min', yes: 1, needed: 3, secs, frac: (30 - (L.t % 30)) / 30 });
    A.drawVoteCard(img, 40, 90, 140, T, { title: 'Ada proposes +2 min', yes: 2, needed: 3, secs: 18, frac: 0.6, my: 'yes' });
    A.drawVoteCard(img, 190, 90, 140, T, { title: 'Ada proposes +2 min', yes: 3, needed: 3, secs: 11, frac: 0.37, my: 'yes', passing: true });
    A.drawVoteCard(img, 340, 90, 140, T, { title: 'You propose +5 min', yes: 1, needed: 4, secs: 9, frac: 0.3, my: 'no' });
    A.drawVoteCard(img, 490, 90, 140, T, { title: 'Ada proposes +1 min', yes: 1, needed: 3, secs: 0, frac: 0 });
    A.drawTray(img, 160, 150, T, { hover: 0 });
    A.drawClockResult(img, 320, 154, T, { text: '+2 min added', kind: 'ok' });
    A.drawClockResult(img, 460, 154, T, { text: 'Not extended', kind: 'no' });
    A.drawClockResult(img, 220, 178, T, { text: 'Asking the town for +2 min…', kind: 'asking' });
    A.drawClockResult(img, 440, 178, T, { text: 'You already asked twice today.', kind: 'note' });
  },

  st(hud, L, T, S) {
    const img = L.screen, W = img.w, t = L.t;
    clockChipAt(L, T, chipState('nominations', 252 - (t % 200), 300, { plus: null, reduced: S.reduced }));
    A.drawToolbar(img, W - 4, slot(2, L).y, T, { host: true, hover: 'abort' });
    A.drawPhaseChip(img, W - 4, slot(3, L).y, T, { phase: 'day', day: 2, gathered: true, t });
    // the clock control as the panels group's Storyteller panel embeds it (left column)
    const left = 252 - (t % 200);
    A.drawStClock(img, 4, 24, 160, T, { stage: 'nominations', time: A.formatCountdown(left * 1000), urgent: left <= 30, minutes: 5, hover: 'pause' });
    A.drawStClock(img, 4, 88, 160, T, { stage: 'discussion', time: '3:00', paused: true, minutes: 8 });
    A.drawStClock(img, 4, 152, 160, T, { isSet: false, minutes: 1 });
    const to = slot(4, L);
    drawToasts(L, T, [{ text: 'You set 5 min for Nominations.', kind: 'info', at: -1, ms: 1e9 }], t, { x: to.x, y: to.y, w: to.w, reduced: S.reduced });
  },

  card(hud, L, T, S) {
    const img = L.screen;
    A.drawRoleCard(img, 4, 4, 178, T, { role: 'Undertaker', type: 'townsfolk', team: 'good' });
    A.drawRoleCard(img, 190, 4, 178, T, { role: 'Imp', type: 'demon', team: 'evil', house: 'Mossgate', ability: 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.',
      pills: [['Dead', 'dead'], ['Seat 5', ''], ['Ghost vote spent', '']], tab: 'notes', badge: 2, rows: [[1, 'Ada'], [4, 'Dov']] });
    clockChipAt(L, T, chipState('discussion', 300 - (L.t % 60), 360, { reduced: S.reduced }), 186);
  },

  dead(hud, L, T, S) {
    const img = L.screen, W = img.w, t = L.t;
    const rr = slot(0, L);
    A.drawRoleChip(img, rr.x, rr.y, T, { role: 'Imp', team: 'evil', house: null, dead: 'vote', badge: 2, maxW: 999 });
    A.drawRoleChip(img, rr.x, rr.y + 18, T, { role: 'Empath', team: 'good', house: 'Ravenscroft', dead: 'spent', maxW: 999 });
    A.drawRoleChip(img, rr.x, rr.y + 36, T, { role: 'Empath', team: 'good', house: 'Ravenscroft', badge: 1, hover: true, maxW: 999 });
    // long roles at the 180 cap: display role + full house -> LABEL role + full house -> LABEL role + house…
    A.drawRoleChip(img, rr.x, rr.y + 54, T, { role: 'Undertaker', team: 'good', house: 'Ravenscroft', badge: 1 });
    A.drawRoleChip(img, rr.x, rr.y + 72, T, { role: 'Fortune Teller', team: 'good', house: 'Ravenscroft', badge: 1 });
    A.drawRoleChip(img, rr.x, rr.y + 90, T, { role: 'Scarlet Woman', team: 'evil', house: "Stargazer's Tower", badge: 2 });
    A.drawRoleChip(img, rr.x, rr.y + 108, T, { role: 'Fortune Teller', team: 'good', house: 'The Old Apothecary Cottage', dead: 'vote', badge: 1 });
    clockChipAt(L, T, chipState('discussion', 210 - (t % 60), 360, { reduced: S.reduced }));
    A.drawToolbar(img, W - 4, slot(2, L).y, T, { hover: 'notebook' });
    A.drawPhaseChip(img, W - 4, slot(3, L).y, T, { phase: 'day', day: 3, t });
    const hr = slot(5, L);
    A.drawHint(img, hr.x + Math.floor(hr.w / 2), hr.y, T, { parts: 'You are dead, but you can still talk and vote once.', tone: 'dead' });
  },

  toasts(hud, L, T, S) {
    const img = L.screen, x = img.w - 4 - 170;
    let y = 38;
    for (const it of [
      { text: 'Ada nominates Cleo.', kind: 'info' }, { text: 'Bram: 4 votes (needed 3) · ✓ your vote counted', kind: 'vote', name: 'Bram' },
      { text: 'Bram is on the block (4)', kind: 'block', name: 'Bram' }, { text: 'Cora: 2 votes (needed 3) · your hand was down: not counted', kind: 'vote', name: 'Cora' },
      { text: 'Esme died in the night.', kind: 'death' }, { text: 'Gus was executed.', kind: 'execution' },
      { text: 'You can only nominate once per day.', kind: 'error' }, { text: 'Good wins', kind: 'game_over' },
    ]) { const bw = A.toastWidth(it.text, 170, it.kind); y += A.drawToast(img, x + 170 - bw, y, 170, T, it).h + 3; }
    // phase pills (all phases) down the left
    const phases = [['setup', 0], ['first_night', 0], ['day', 1, true], ['day', 2], ['bedtime', 0], ['bedtime', 2], ['night', 2], ['dawn', 3], ['finished', 3]];
    phases.forEach(([p, d, g], i) => A.drawPhaseChip(img, 150, 38 + i * 15, T, { phase: p, day: d, gathered: g, t: L.t, countdown: p === 'bedtime' && d === 2 ? 23 - (L.t % 20) : null, visit: p === 'night' }));
    // countdowns
    // countdowns (ct-countdown / -low) on small chips: body, label, display figures
    [[95, 'body'], [42, F.LABEL], [9 - (L.t % 9), 'body'], [9 - (L.t % 9), F.DISPLAY]].forEach(([s, f], i) => {
      const y = 38 + i * 17, h = f === F.DISPLAY ? 15 : 11;
      KIT.drawBox(img, 170, y, 40, h, { line: 'outline', edge: 'iron', fill: 'ink', hi: 'inkRaised', corner: 2 }, T);
      A.drawCountdown(img, 190, y + (f === F.DISPLAY ? 2 : f === F.LABEL ? 3 : 2), s, T, { font: f, t: L.t, reduced: S.reduced, align: 'center' });
    });
    A.drawToolbar(img, img.w - 4, 4, T, { host: true, hover: 'settings' });
  },

  hints(hud, L, T, S) {
    const img = L.screen, cx = Math.floor(img.w / 2);
    const tones = [['Seated (seat 5).', 'ok'], ['Walk to your seat in the circle.', ''], ['The Storyteller moves you.', 'auto'], ['The Storyteller has paused your movement.', 'frozen'],
      ['The Storyteller is visiting you: private.', 'private'], [[{ s: 'Vote now!' }, { countdown: 8 - (L.t % 8) }], 'vote'], ['Sleep tight. Night has fallen.', 'night'], ['You are dead, but still part of the town.', 'dead']];
    tones.forEach(([p, tone], i) => A.drawHint(img, 165 + (i % 2) * 310, 30 + Math.floor(i / 2) * 18, T, { parts: p, tone, t: L.t, reduced: S.reduced, mode: 'full' }));
    ['full', 'mid', 'pill'].forEach((m, i) => A.drawHint(img, [130, 300, 420][i], 102, T, { parts: 'Take your seat in the circle (seat 5).', short: A.HINT_SHORT.seat(5), tone: '', mode: m }));
    // v2 short labels in pill mode (+ the bedtime countdown kept beside "Walk home")
    const shorts = [[A.HINT_SHORT.seat(5), ''], [A.HINT_SHORT.walkHome(), '', 42], [A.HINT_SHORT.vote(), 'vote'], [A.HINT_SHORT.paused(), 'frozen'],
      [A.HINT_SHORT.privateVisit(), 'private'], [A.HINT_SHORT.handUp(), 'ok'], [A.HINT_SHORT.notYourHouse(), '']];
    let px = 60;
    for (const [sh, tone, cd] of shorts) {
      const probe = new PixelImage(img.w, 14), r = A.drawHint(probe, 320, 0, T, { parts: cd ? [{ s: 'x' }, { countdown: cd }] : 'x', short: sh, tone, mode: 'pill' });
      A.drawHint(img, px + Math.floor(r.w / 2), 120, T, { parts: cd ? [{ s: 'x' }, { countdown: cd - (L.t % 30) }] : 'x', short: sh, tone, mode: 'pill', t: L.t, reduced: S.reduced });
      px += r.w + 6;
    }
    A.drawPrompt(img, cx - 140, 132, T, { text: 'Walk in: Ravenscroft' });
    A.drawPrompt(img, cx + 40, 132, T, { text: 'Walk in: Ravenscroft', key: 'E' });
    A.drawPrompt(img, cx - 110, 152, T, { text: 'Nobody lives here', locked: true });
    A.drawPrompt(img, cx + 110, 152, T, { text: 'Mossgate is locked by the Storyteller', locked: true });
    A.drawKeyHint(img, cx, 178, T, {});
    A.drawKeyHint(img, cx, 214, T, { tokens: A.KEY_HINT_TOUCH });
  },

  voice(hud, L, T, S) {
    const img = L.screen, W = img.w, t = L.t, red = S.reduced;
    const rx = W - 4 - 24 - 4;
    A.drawVoicePill(img, rx, img.h - 4 - 15, T, { link: 'ok', mic: 'live', talkers: ['Cleo', 'Gus'], t, reduced: red });
    const rows = [{ link: 'ok', mic: 'idle', talkers: [] }, { link: 'live', mic: 'live', talkers: ['Dov'] }, { link: 'wait', mic: 'idle', talkers: ['Ada'] },
      { link: 'bad', mic: 'muted', talkers: [] }, { link: 'idle', mic: 'muted', talkers: ['Bram', 'Cleo', 'Gus'] }];
    rows.forEach((o, i) => A.drawVoicePill(img, rx, 150 + i * 19, T, { ...o, t, reduced: red }));
    ['ok', 'live', 'wait', 'bad', 'idle'].forEach((s, i) => img.blit(A.voiceDot(s, T, t, red), 300 + i * 14, 150));
    for (let k = 0; k < 4; k++) img.blit(A.wave(T, k), 300 + k * 12, 166);
    img.blit(A.wave(T, red ? 0 : Math.floor(gf(t) / 4)), 360, 166);
    ['idle', 'live', 'muted'].forEach((m, i) => A.drawMicChip(img, 300 + i * 48, 180, T, { state: m }));
  },

  touch(hud, L, T, S) {
    const img = L.screen, t = L.t, k = gf(t);
    const a = (k / 30) * Math.PI;   // the drag: a slow circle, the knob follows in whole texels every grid frame
    const drag = Math.floor(t / 4) % 2 === 1;
    A.drawJoystick(img, 9, img.h - 12 - 64, T, drag ? { active: true, kx: Math.round(Math.cos(a) * 20), ky: Math.round(Math.sin(a) * 20) } : {});
    // v2 .ct-touch-use: bottom right above the dock button (the locked variant shown beside it for comparison)
    A.drawUseButton(img, img.w - 8 - 62, img.h - 32 - 24, T, { label: 'Walk in', pressed: drag && k % 60 < 6 });
    A.drawUseButton(img, img.w - 8 - 62 - 66, img.h - 32 - 24, T, { label: 'Locked', locked: true });
    const hr = slot(5, L);
    A.drawKeyHint(img, hr.x + Math.floor(hr.w / 2), hr.y - 14, T, { tokens: A.KEY_HINT_TOUCH, maxW: 300 });
  },

  conn(hud, L, T, S) {
    const img = L.screen, cx = Math.floor(img.w / 2), t = L.t;
    A.drawConn(img, cx, 26, T, { t, reduced: S.reduced });
    A.drawConn(img, cx, 48, T, { lost: true });
    A.drawLoading(img, cx - 90, 120, T, { t, reduced: S.reduced });
    A.drawLoading(img, cx + 90, 120, T, { failed: true });
    for (let k = 0; k < 8; k++) img.blit(A.spinner(T, k), cx - 36 + k * 10, 150);
  },

  tower(hud, L, T, S) {
    // tier W wedge on the town's clock tower (./tower.js) + the HUD chip that mirrors it
    const o = S.towerState(L.t);
    clockChipAt(L, T, o);
  },
};
const _tags = new Map();
/** Small outlined LABEL tag (state sheets). */
function tagImg(s, T) {
  const u = s.toUpperCase(), key = u + T.outline;
  if (_tags.has(key)) return _tags.get(key);
  const im = new PixelImage(textWidth(u, F.LABEL) + 4, 9);
  drawText(im, 2, 2, u, { font: F.LABEL, color: T.textDim });
  im.outline(T.outline, { diag: true });
  _tags.set(key, im);
  return im;
}

export default {
  z: 60,
  async setup(hud) {
    const P = hud.P;
    const S = hud.hudGroup = {
      art: A, font: F, state: P('state', 'showcase'), reduced: P('rm', '0') === '1',
      you: { role: hud.you?.role || 'Undertaker', team: /imp|poisoner|spy|baron|scarlet/i.test(hud.you?.role || '') ? 'evil' : 'good' },
    };
    if (S.state === 'tower') {
      const { setupTower } = await import('./tower.js');
      await setupTower(hud, S);
    }
  },
  draw(hud, L) {
    const S = hud.hudGroup, T = L.tok;
    (STATES[S.state] || STATES.showcase)(hud, L, T, S);
  },
};
