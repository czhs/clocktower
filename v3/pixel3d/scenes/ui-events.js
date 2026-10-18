// Events group scene (owner: events group; docs/UI.md §3.3, §4 "events"). The mock town square of scenes/ui-hud.js
// (game camera vh 12, the mock cast) with the events group's game-event FX over it. Labels come from the indicators
// module (bubbles off) so hands / bells stack on real labels. Esme plays her ghost clip here (she is dead).
//
//   index.html?scene=ui-events[&state=live|all|vote|execution|nightfall|dawn|poof|banner][&banner=start|good|evil|all]
//             [&tod=noon|golden|night][&still=1][&others=1][&t=<s>]
//   tools/shot.sh ui-events shots/ui-events/r1/all.png --size 1280x720 --t 1 --q "state=all"
//
// States (timelines start near t = 0; GIFs are captured at 1x, 30 fps)
//   live       the HUD slot (src/ui/events/hud.js): plaques, nominee ring, clock hand, hands, HUD vote clock, caption
//   all        every element at once: plaques (stone / you / dead / nominee), the vote mid-count with raised / locked /
//              ghost hands (Esme's ghost vote counted: ghost-spent, no halo), a bell + toll over Finn, Bram's memorial candle, poof + wisp beside the Storyteller, a ghost
//              reveal burst over Esme, HUD vote clock, caption and the "Good wins" banner
//   vote       a full nomination vote (7 voters x 1.2 s), 9.5 s                                   -> 1x GIF
//   execution  Cleo is executed: dim, bell, three tolls, the die clip, wisp, ghost revealed, 6 s   -> 1x GIF
//   nightfall  golden -> night: the veil falls (650 ms), the preset swaps under it, it dissolves (1600 ms) + caption
//   dawn       night -> noon: the dawn wash (900 ms) + caption; Bram died in the night: wisp, ghost, candle
//   poof       the Storyteller vanishes from the centre and reappears near seat 3 (poof + appear clip), 2.6 s
//   banner     game start / good wins / evil wins (banner=all: one after the other, 12.6 s)
// still=1 = reduced motion (no pops, pulses, bobs; state changes still show).
import * as THREE from 'three';
import { buildHudStage, MOCK_CAST, MOCK_ST, GROUPS } from './ui-hud.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { loadCharacter, createActor, sunFor } from './char-stage.js';
import { tokens } from '../src/ui/kit.js';
import * as D from '../src/ui/events/draw.js';
import { drawLive, mockVote, VOTE_RECT } from '../src/ui/events/hud.js';

const D2R = Math.PI / 180;

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const state = P('state', 'live'), still = P('still', '0') === '1';
  const startTod = { nightfall: 'golden', dawn: 'night' }[state];
  if (startTod && !params.has('tod')) params.set('tod', startTod);
  const cast = MOCK_CAST.map((c) => {
    if (c.seat === 5) return { ...c, clip: 'ghost' };                                   // Esme is a ghost (vote unspent: halo)
    if (state === 'execution' && c.seat === 3) return { ...c, clip: 'die' };              // Cleo, executed
    if (state === 'dawn' && c.seat === 2) return { ...c, clip: 'ghost' };                 // Bram, died in the night
    if (state === 'vote' || state === 'live' || state === 'all') return c.seat === 2 ? { ...c, clip: 'vote' } : c.clip === 'talk' || c.clip === 'point' ? { ...c, clip: 'idle' } : c;
    return c.clip === 'talk' || c.clip === 'point' || c.clip === 'vote' ? { ...c, clip: 'idle' } : c;
  });
  const st = state === 'poof' ? { ...MOCK_ST, clip: 'appear' } : MOCK_ST;
  const hud = await buildHudStage(engine, params, { cast, storyteller: st });
  const tod = hud.tod;
  const clock = hud.clock;

  // context: other groups (others=1) or just the indicators labels (bubbles, talk, offscreen arrows off)
  hud.indicatorsConfig = { bubbles: [], offscreen: [], muted: [], talk: [] };
  const want = P('others', '0') === '1' ? GROUPS.filter((g) => g !== 'events') : ['indicators'];
  for (const g of want) {
    let mod = null;
    try { mod = (await import(`../src/ui/${g}/hud.js`)).default; } catch (e) { if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e; }
    if (mod?.draw) { await mod.setup?.(hud); hud.ui.add((L) => mod.draw(hud, L), mod.z ?? 10); }
    else PLACEHOLDERS[g]?.(hud);
  }

  const ground = { heightAt: (x, z) => hud.terrain.heightAt(x, z) };
  const faceToCentre = (p) => { const d = new THREE.Vector3().sub(p); return Math.round(Math.atan2(d.x, d.z) / (45 * D2R)) * 45 * D2R; };
  /** a second actor of a member (its ghost) at the same spot, hidden until shown */
  const twin = async (m, clip) => {
    if (!m?.actor) return null;
    const loaded = await loadCharacter(m.id, 'auto', { fx: true });
    const a = createActor(engine, loaded, { clip, face: faceToCentre(m.pos), pos: m.pos, move: false, at: 0.4, clock, ground, pin: false });
    a.root.visible = false;
    return a;
  };
  const Tn = tokens('night');
  const swapTod = (() => {
    let cur = tod;
    return (name) => {
      if (cur === name) return;
      cur = name;
      applyTimeOfDay(engine, name, { ...sunFor(name, P), shadowExtent: 18 });
      setClouds(engine, name === 'noon' ? { scale: 0.045, cover: 0.62 } : { scale: 0 });
      hud.ui.setTod(name);
      hud.tod = name; hud.tok = tokens(name);
    };
  })();
  const sec = (f) => f / 30;
  engine.stats.events = { state, still, tod };

  const draws = {
    live: async () => { const vote = mockVote(hud); D.scheduleGhostSpent(hud, vote, { loop: 9.6 }); return (L) => drawLive(hud, L, { vote, still, loop: 9.6 }); },

    vote: async () => {
      const vote = D.makeVote({ nominee: 3, order: [4, 5, 6, 7, 1, 2, 3], raise: { 2: -1, 5: 0.6, 7: 3.0, 1: 4.6, 6: 6.4 }, ghosts: [5], dead: [5], t0: 0.4, needed: 3 });
      D.scheduleGhostSpent(hud, vote);                 // Esme's halo goes when her ghost vote is counted
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t;
        D.drawSeats(hud, L, f, { states: { 3: 'nominee' }, t, still });
        const S = D.drawVoteWorld(hud, L, f, vote, { t, still });
        D.drawVoteHud(hud, L, f, vote, VOTE_RECT, { t, still });
        const k = D.gridK(t - 0.4);
        if (!S.done) D.drawCaption(L, f, { text: 'Cleo is nominated. Raise a hand to vote.', glyph: 'hand', k, durF: 7 * 36 - 4, still });
        else D.drawCaption(L, f, { text: S.passed ? `Cleo is on the block (${S.tally} votes).` : 'Not enough votes.', glyph: 'bell', k: k - 7 * 36, durF: 90, still });
      };
    },

    execution: async () => {
      const cleo = hud.bySeat(3), t0 = 0.3, X = D.TIMING.execution;
      if (cleo?.actor) cleo.actor.st.at = t0 + sec(X.dieAtF);
      const ghost = await twin(cleo, 'ghost');
      engine.onUpdate((tE) => {
        const on = D.gridK(clock(tE) - t0) >= X.ghostAtF;
        if (ghost) ghost.root.visible = on;
        if (cleo?.actor) cleo.actor.root.visible = !on;
        if (cleo) cleo.ghost = on;
      });
      hud.ui.add((L) => D.drawExecution(hud, L, D.framesFor(L.tok), cleo, t0, { t: L.t, still, layer: 'dim', Tn }), 2);   // under labels
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t;
        D.drawSeats(hud, L, f, { t, still });
        D.drawExecution(hud, L, f, cleo, t0, { t, still, layer: 'fx' });
        D.drawCaption(L, f, { text: 'The bell tolls for Cleo.', glyph: 'bell', k: D.gridK(t - t0), durF: X.captionF, still });
      };
    },

    nightfall: async () => {
      const t0 = 0.4, N = D.TIMING.night;
      engine.onUpdate((tE) => swapTod(D.gridK(clock(tE) - t0) >= N.outF - N.outHold ? 'night' : tod));
      // one rule for screen-tier HUD (r3): the veil goes UNDER every HUD element (pill, chips, caption): z 1 on L.screen
      hud.ui.add((L) => { const k = D.gridK(L.t - t0); D.drawNightVeil(L, still ? (k < N.outF ? -1 : N.outF + N.inF) : k, Tn); }, 1);
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t, k = D.gridK(t - t0);
        D.drawSeats(hud, L, f, { t, still });
        D.drawCaption(L, f, { text: 'Night falls. You are alone in your home…', glyph: 'moon', k, durF: D.TIMING.caption.nightF, still });
      };
    },

    dawn: async () => {
      const t0 = 0.4, bram = hud.bySeat(2), revealAt = t0 + 1.0, y0 = bram?.pos.y ?? 0, feet0 = bram?.pos.clone();
      engine.onUpdate((tE) => {
        const t = clock(tE);
        swapTod(D.gridK(t - t0) >= 1 ? 'noon' : tod);          // under the dawn's cover light (frames 0-1)
        const on = D.gridK(t - revealAt) >= 12;
        if (bram?.actor) bram.actor.root.visible = on;
        if (bram) { bram.ghost = on; bram.pos.y = on ? y0 : 1000; }   // no floating name before the ghost appears
      });
      // the dawn light goes into L.world UNDER the labels / hands / pins (z 2): they keep their colours (r3)
      hud.ui.add((L) => { const k = D.gridK(L.t - t0); if (still) { if (k >= 0 && k < 2) D.drawDawn(L, k, L.tok); } else D.drawDawn(L, k, L.tok); }, 2);
      const bramAt = bram && { ...bram, pos: feet0, ghost: true, feet: () => feet0.clone(), head: () => feet0.clone().setY(feet0.y + bram.height + 0.1) };
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t, k = D.gridK(t - t0);
        D.drawSeats(hud, L, f, { t, still });
        D.drawNightDeath(hud, L, f, bramAt, D.gridK(t - revealAt), { t, still });
        const capF = D.TIMING.caption.dawnF;
        if (k < capF + 6) D.drawCaption(L, f, { text: 'Dawn breaks over Hollowmere.', glyph: 'sun', k, durF: capF, still });
        else D.drawCaption(L, f, { text: 'Bram did not wake.', glyph: 'candle', k: k - capF - 6, durF: 105, still });
      };
    },

    poof: async () => {
      const s = hud.st, A0 = s.pos.clone(), B0 = hud.place(2.4, 62);
      B0.y = hud.terrain.heightAt(B0.x, B0.z);
      const tOut = 0.4, tIn = 1.4, PF = D.TIMING.poof;
      const hideT = tOut + sec(PF.hideAt * PF.hold), showT = tIn + sec((PF.hideAt + 1) * PF.hold);
      if (s.actor) s.actor.st.at = showT;
      engine.onUpdate((tE) => {
        // grid-frame compare (r3: a float compare at exactly the hide time kept the Storyteller one frame too long)
        const t = clock(tE), kO = D.gridK(t - tOut), kI = D.gridK(t - tIn);
        const vis = kO < PF.hideAt * PF.hold || kI >= (PF.hideAt + 1) * PF.hold, at = kI < 0 ? A0 : B0;
        if (s.actor) { s.actor.root.visible = vis; s.actor.st.base.copy(at); }
        s.pos.copy(at); if (!vis) s.pos.y = 1000;          // the label leaves with the Storyteller (indicators skips it)
      });
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t;
        D.drawSeats(hud, L, f, { t, still });
        D.drawPoof(L, f, L.at(A0), D.gridK(t - tOut), { appear: false });
        D.drawPoof(L, f, L.at(B0), D.gridK(t - tIn), { appear: true });
      };
    },

    banner: async () => {
      const which = P('banner', 'all');
      const list = which === 'all' ? ['start', 'good', 'evil'] : [which];
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t;
        D.drawSeats(hud, L, f, { t, still });
        list.forEach((b, i) => D.drawBanner(L, f, b, D.gridK(t - 0.2 - i * 4.2), { still }));
      };
    },

    all: async () => {
      const vote = D.makeVote({ nominee: 3, order: [4, 5, 6, 7, 1, 2, 3], raise: { 2: -9, 5: -9, 7: -9, 1: -9 }, ghosts: [5], dead: [5], t0: -3.0, needed: 3 });
      D.scheduleGhostSpent(hud, vote);                 // counted before t 0: ghost-spent, no halo
      return (L) => {
        const f = D.framesFor(L.tok), t = L.t, vt = 1.0 + (t % 0.6);       // the hand stays on Gus (seat 7)
        D.drawSeats(hud, L, f, { states: { 3: 'nominee' }, t, still });
        D.drawVoteWorld(hud, L, f, vote, { t: vt, still });
        const esme = hud.bySeat(5), bram = hud.bySeat(2), finn = hud.bySeat(6);
        if (finn) {
          const x = L.at(finn.head()).x, y = D.stackTopOf(hud, L, finn) - 1;
          L.world.blit(f[`bell_${still ? 1 : [0, 1, 2, 1][Math.floor(t * 7.5) % 4]}`], x - 6, y - 12);
          const p = L.at(finn.feet()); D.put(L.ground, f, 'toll_2', p.x, p.y, 'toll');
        }
        if (bram) { const p = L.at(D.plaqueOf(hud, bram)); D.put(L.world, f, `candle_${Math.floor(t * 7.5) % 3}`, p.x + 12, p.y + 2, 'candle'); }
        if (esme) { const p = L.at(esme.feet()); D.put(L.world, f, 'reveal_1', p.x, p.y - 6, 'reveal'); }
        if (hud.st) { const p = L.at(hud.st.pos); D.put(L.world, f, 'poof_3', p.x - 34, p.y, 'poof'); D.put(L.world, f, 'wisp_3', p.x + 36, p.y, 'wisp'); }
        D.drawVoteHud(hud, L, f, vote, VOTE_RECT, { t: vt, still });
        D.drawCaption(L, f, { text: 'The bell tolls. Walk home before dark.', glyph: 'bell', k: 10, durF: 999, still });
        D.drawBanner(L, f, 'good', 40, { still });
      };
    },
  };
  const make = draws[state];
  if (!make) throw new Error(`ui-events: unknown state '${state}'`);
  hud.ui.add(await make(), 25);
}
