// OWNED BY auto-st. Many complete automatic games (no Storyteller) with bot players across seeds and
// player counts 5..15: no hangs, always a winner, legal states only, decisions recorded, secrecy.
import { CHARACTER_IDS, CHARACTER_INFO, type PlayerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { recorderOf } from '../src/records/index.js';
import { autoRig, legalState, playOut, type AutoRig } from './autoHarness.js';

const INFO_ROLES = new Set(['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker', 'ravenkeeper']);

/** Secrecy: what one player's view may contain. */
function checkSecrecy(rig: AutoRig) {
  const s = rig.state();
  if (s.phase === 'finished') return;
  const clocks = new Set<string>();
  for (const p of s.players) {
    const v = rig.view(p.seat);
    clocks.add(JSON.stringify(v.clock ?? null));
    expect(v.storytellerMode).toBe('auto');
    // info / prompts are this player's own (per-seat ids)
    for (const i of v.info) expect(i.id.startsWith(`i${p.seat}-`)).toBe(true);
    for (const q of v.prompts) expect(q.id.startsWith(`q${p.seat}-`)).toBe(true);
    // a good non-info character never receives info (except being told a new character)
    const believed = v.you.role?.character;
    if (believed && v.you.role!.alignment === 'good' && !INFO_ROLES.has(believed)) for (const i of v.info) expect(i.text).toMatch(/^You are now/);
    // Nothing outside the player's own role / info / evil-team / spy sections names a character.
    const stripped: Partial<PlayerGameView> = { ...v, info: [], prompts: [], spyGrimoire: null, you: { ...v.you, role: null, evilTeam: null } };
    const json = JSON.stringify(stripped);
    expect(json).not.toMatch(/"character"|"alignment"|believed|registers as|Fate /);
    for (const c of CHARACTER_IDS) expect(json.includes(`"${c}"`)).toBe(false);
  }
  expect(clocks.size).toBe(1); // the town clock is public and identical for everyone
}

function finishedOk(rig: AutoRig) {
  const s = rig.state();
  expect(s.phase).toBe('finished');
  const r = s.result!;
  expect(['good', 'evil']).toContain(r.winner);
  const livingDemon = s.players.some((p) => p.alive && CHARACTER_INFO[p.character].type === 'demon');
  const alive = s.players.filter((p) => p.alive).length;
  if (r.winner === 'good') expect(!livingDemon || /Mayor/.test(r.reason)).toBe(true);
  else expect(alive <= 2 || /Saint/.test(r.reason)).toBe(true);
  const out = rig.game.outcome()!;
  expect(out.winner).toBe(r.winner);
  // the record: seeds, no human Storyteller wording, auto decisions present
  const rec = recorderOf(rig.game)!;
  const texts = rec.timeline.map((e) => e.text);
  expect(rec.timeline.find((e) => e.data.decision === 'seeds')!.data).toMatchObject({ engineSeed: expect.any(Number), fateSeed: expect.any(Number) });
  expect(texts.some((t) => t.startsWith('Fate dealt the characters'))).toBe(true);
  expect(texts.some((t) => t.startsWith('The town clock'))).toBe(true);
  expect(texts.filter((t) => /\bStoryteller\b/.test(t) && !/automatic Storyteller/.test(t))).toEqual([]);
  expect(rec.timeline.some((e) => e.kind === 'end' || e.data.decision === 'confirm_result')).toBe(true);
  return r;
}

const SEEDS = 10;
/** Fate decisions seen across the bulk games (coverage check at the end). */
const decisions = new Map<string, number>();
const reasons = new Map<string, number>();

describe('automatic games: many full games with bots', () => {
  for (let n = 5; n <= 15; n++) {
    it(`N=${n}: ${SEEDS} seeds play to completion with a legal winner`, () => {
      const winners: string[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const rig = autoRig(n, { seed: seed * 101 + n, botSeed: seed * 7 + n });
        let k = 0;
        const res = playOut(rig, 6 * 3600_000, (r) => {
          const bad = legalState(r.state());
          if (bad.length) throw new Error(`illegal state (n=${n} seed=${seed}): ${bad.join('; ')}`);
          if (++k % 25 === 0) checkSecrecy(r);
        });
        expect(res.finished, `n=${n} seed=${seed} did not finish`).toBe(true);
        const r = finishedOk(rig);
        winners.push(r.winner);
        reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
        for (const e of recorderOf(rig.game)!.timeline) {
          const d = e.data.decision as string | undefined;
          if (d) decisions.set(d, (decisions.get(d) ?? 0) + 1);
        }
      }
      expect(winners).toHaveLength(SEEDS);
    }, 300_000);
  }

  it('the bulk games exercised the chance decisions and every kind of ending', () => {
    console.log('fate decisions:', JSON.stringify(Object.fromEntries(decisions)), 'endings:', JSON.stringify(Object.fromEntries(reasons)));
    for (const d of ['seeds', 'setup', 'false_info', 'registration', 'starpass', 'mayor_bounce', 'confirm_result', 'skip_dead']) expect(decisions.get(d) ?? 0, d).toBeGreaterThan(0);
    expect(reasons.get('The Demon is dead.') ?? 0).toBeGreaterThan(0);
    expect(reasons.get('Only two players remain alive.') ?? 0).toBeGreaterThan(0);
  });
});

describe('automatic games: robustness', () => {
  it('nobody ever answers a prompt: every night choice is made by fate at the deadline; games still finish', { timeout: 300_000 }, () => {
    for (const n of [5, 9, 13]) {
      const rig = autoRig(n, { seed: 5000 + n, policy: { answer: 0 } });
      const res = playOut(rig);
      expect(res.finished).toBe(true);
      finishedOk(rig);
      const rec = recorderOf(rig.game)!;
      expect(rec.timeline.filter((e) => e.data.decision === 'timeout_answer').length).toBeGreaterThan(0);
      for (const e of rec.timeline.filter((x) => x.data.decision === 'timeout_answer')) expect(e.data.ok).toBe(true);
    }
  });

  it('disconnected players: their prompts time out to random legal choices; the game finishes', { timeout: 300_000 }, () => {
    const rig = autoRig(8, { seed: 77, botSeed: 3 });
    // seats 2 and 5 drop before the first night and never come back
    rig.step(100);
    rig.setConnected(2, false);
    rig.setConnected(5, false);
    const res = playOut(rig);
    expect(res.finished).toBe(true);
    finishedOk(rig);
    const rec = recorderOf(rig.game)!;
    const prompted = rec.timeline.filter((e) => e.data.decision === 'timeout_answer').map((e) => e.data.seat);
    const s = rig.state();
    // whichever of the two had a night choice was answered by fate
    for (const seat of [2, 5]) {
      const p = s.players.find((x) => x.seat === seat)!;
      const hasPrompt = p.promptHistory.length > 0;
      if (hasPrompt) expect(prompted).toContain(seat);
    }
    expect(rig.view(2).players.find((p) => p.seat === 2)!.connected).toBe(false);
  });

  it('everyone leaves: the game holds (no auto-finish), and resumes when someone is back', { timeout: 300_000 }, () => {
    const rig = autoRig(6, { seed: 9 });
    for (let i = 0; i < 40; i++) rig.step(100); // setup beat -> bedtime
    expect(rig.game.phase()).toBe('bedtime');
    // play into the first day
    playUntil(rig, () => rig.game.phase() === 'day');
    const day = rig.state().dayNumber;
    const clock0 = rig.view(0).clock!;
    expect(clock0.stage).toBe('discussion');
    for (let i = 0; i < 6; i++) rig.setConnected(i, false);
    for (let i = 0; i < 3000; i++) rig.step(100); // 5 simulated minutes, nobody here
    expect(rig.game.phase()).toBe('day');
    expect(rig.state().dayNumber).toBe(day);
    const held = rig.view(0).clock!;
    expect(held.paused).toBe(true);
    const rec = recorderOf(rig.game)!;
    expect(rec.timeline.some((e) => e.text.startsWith('The town clock stops'))).toBe(true);
    rig.setConnected(3, true);
    rig.step(100);
    expect(rig.view(3).clock!.paused).toBe(false);
    rig.setConnected(0, true);
    for (let i = 0; i < 6; i++) rig.setConnected(i, true);
    expect(playOut(rig).finished).toBe(true);
    finishedOk(rig);
  });

  it('with the real world module: bedtime walks everyone home (escort) and the night falls without a forced teleport', { timeout: 300_000 }, () => {
    for (const n of [5, 10]) {
      const rig = autoRig(n, { seed: 900 + n, world: true, auto: { stragglerMs: 600_000 } });
      let nights = 0;
      let last = rig.game.phase();
      const res = playOut(rig, 4 * 3600_000, (r) => {
        const ph = r.game.phase();
        if (ph !== last && (ph === 'night' || ph === 'first_night')) {
          nights++;
          // night falls only once every living or dead player is inside their own home
          for (let i = 0; i < n; i++) expect(r.host.world.isHome(`p${i}`), `p${i} home at nightfall`).toBe(true);
        }
        last = ph;
      });
      expect(res.finished).toBe(true);
      finishedOk(rig);
      expect(nights).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const tps = (rig.host.sent.get(`p${i}`) ?? []).filter((m) => m.type === 'world:teleport').map((m) => (m.payload as { reason: string }).reason);
        expect(tps).not.toContain('night'); // nobody had to be teleported home
      }
    }
  });

  it('reproducible: the same seeds and the same player inputs give the same game and record', { timeout: 300_000 }, () => {
    const run = () => {
      const rig = autoRig(10, { seed: 4242, fateSeed: 99, botSeed: 5 });
      playOut(rig);
      const rec = recorderOf(rig.game)!;
      return { winner: rig.state().result!.winner, texts: rec.timeline.map((e) => `${e.t}|${e.text}`) };
    };
    const a = run();
    const b = run();
    expect(b).toEqual(a);
  });

  it('fate decisions are recorded but never reach a player', { timeout: 300_000 }, () => {
    let seen = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const rig = autoRig(12, { seed: 300 + seed, policy: { answer: 0.2 } });
      playOut(rig);
      const rec = recorderOf(rig.game)!;
      const fateLines = rec.timeline.filter((e) => e.data.auto === 'fate' && e.data.decision !== 'seeds' && e.data.decision !== 'setup');
      seen += fateLines.length;
      for (const [pid, msgs] of rig.host.sent) {
        const dump = JSON.stringify(msgs);
        expect(dump, pid).not.toMatch(/Fate |registers as|drunk or poisoned/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

function playUntil(rig: AutoRig, cond: () => boolean, maxTicks = 20_000) {
  for (let i = 0; i < maxTicks && !cond(); i++) {
    rig.bots();
    rig.step(100);
  }
  expect(cond()).toBe(true);
}
