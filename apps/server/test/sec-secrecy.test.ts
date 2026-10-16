// (v2.3 security, sec-secrecy) Regression tests for docs/security-v2.3/04-game-secrecy.md:
//   SEC-1 automatic games deliver all night info at one fixed time (never depends on who answered when)
//   SEC-2 a pending (unconfirmed) game end cannot be probed with player actions
//   SEC-7 per-connection protocol-violation score
// (SEC-3 / SEC-8 live in social.test.ts; the black-box versions of all of them in
// tests/security/hostile-client.test.ts.)
import { describe, expect, it } from 'vitest';
import { applyPlayerAction, applyStCommand, createGame, mulberry32, type GameState, type PlayerAction } from '@ct/rules';
import { CHARACTER_INFO } from '@ct/protocol';
import { autoRig, FAST } from './autoHarness.js';
import { createViolationTracker, DEFAULT_VIOLATION_SPEC, ViolationMeter } from '../src/guard/violations.js';

const good = (c: string) => CHARACTER_INFO[c as keyof typeof CHARACTER_INFO]?.alignment === 'good';

/** ms after nightfall at which each GOOD seat first sees info in the first night (null = none). */
function firstNightInfoTimes(seed: number, n: number, answer: number): Map<number, number | null> {
  const rig = autoRig(n, { seed, fateSeed: seed + 1, botSeed: seed + 2, policy: { answer, nominate: 0, vote: 0, slayer: 0, propose: 0 } });
  let nightAt: number | null = null;
  const out = new Map<number, number | null>();
  for (let i = 0; i < 1000; i++) {
    rig.step(50);
    rig.bots();
    const s = rig.state();
    if (s.phase === 'first_night' && nightAt === null) {
      nightAt = rig.host.clock.now;
      for (const p of s.players) if (good(p.character)) out.set(p.seat, null);
    }
    if (nightAt === null) continue;
    for (const seat of out.keys()) if (out.get(seat) === null && rig.view(seat).info.length) out.set(seat, rig.host.clock.now - nightAt);
    if (s.phase !== 'first_night') break;
  }
  return out;
}

describe('SEC-1: automatic games release night info at one fixed time', () => {
  it('first-night info arrives at nightfall + promptTimeout for every good player, whether choices are answered at once or never', () => {
    let informed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const n of [7, 10]) {
        const fast = firstNightInfoTimes(seed, n, 1); // everyone answers on the first tick
        const never = firstNightInfoTimes(seed, n, 0); // nobody answers: fate at the deadline
        expect([...fast.entries()], `seed ${seed} n ${n}`).toEqual([...never.entries()]);
        for (const t of fast.values()) {
          if (t === null) continue;
          informed++;
          expect(t).toBeGreaterThanOrEqual(FAST.promptTimeoutMs!);
          expect(t).toBeLessThanOrEqual(FAST.promptTimeoutMs! + 100);
        }
      }
    }
    expect(informed).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------

function nightGameWithPending(): { s: GameState; survivor: number; promptId: string; now: number } {
  let now = 1_000_000;
  const s = createGame({ players: Array.from({ length: 5 }, (_, i) => ({ pid: `p${i}`, seat: i, name: `P${i}` })), rng: mulberry32(11), now });
  const st = (c: Parameters<typeof applyStCommand>[1]) => {
    const r = applyStCommand(s, c, { now: (now += 10) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  };
  st({ type: 'random_setup' });
  st({ type: 'begin_first_night' });
  const imp = s.players.find((p) => p.character === 'imp')!;
  const others = s.players.filter((p) => p !== imp);
  const survivor = others[0]!.seat;
  st({ type: 'prompt_player', seat: survivor, prompt: { kind: 'yes_no', title: 'Probe?' } });
  const promptId = s.players.find((p) => p.seat === survivor)!.prompts.at(-1)!.id;
  return { s, survivor, promptId, now: (now += 10) };
}

describe('SEC-2: a pending game end is not observable through player-action errors', () => {
  const probes: PlayerAction[] = [
    { type: 'promptResponse', promptId: 'q-probe' },
    { type: 'nominate', nomineeSeat: 1 },
    { type: 'vote', nominationId: 'd1-nom1', vote: true },
    { type: 'slayerShot', targetSeat: 1 },
  ];

  it('invalid actions get the same error with and without a pending result; a prompt answer is still recorded', () => {
    const g = nightGameWithPending();
    const before = probes.map((a) => applyPlayerAction(g.s, g.survivor, a, { now: g.now }));
    // Silent kills leave two alive: "evil wins" is proposed and waits for the Storyteller.
    for (const p of g.s.players.filter((x) => x.character !== 'imp' && x.seat !== g.survivor)) {
      expect(applyStCommand(g.s, { type: 'kill', seat: p.seat, announce: false }, { now: g.now }).ok).toBe(true);
    }
    expect(g.s.resultPending).toBe(true);
    const during = probes.map((a) => applyPlayerAction(g.s, g.survivor, a, { now: g.now }));
    expect(during).toEqual(before);
    const r = applyPlayerAction(g.s, g.survivor, { type: 'promptResponse', promptId: g.promptId, yes: true }, { now: g.now });
    expect(r.ok).toBe(true);
    expect(g.s.resultPending).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe('SEC-7: protocol-violation score', () => {
  it('an honest burst passes, a probing loop trips, the budget refills', () => {
    const m = new ViolationMeter({ burst: 5, refillPerSec: 1 }, 0);
    for (let i = 0; i < 5; i++) expect(m.hit(0)).toBe(true);
    expect(m.hit(0)).toBe(false);
    expect(new ViolationMeter({ burst: 5, refillPerSec: 1 }, 0).hit(10_000)).toBe(true);
    const m2 = new ViolationMeter({ burst: 2, refillPerSec: 1 }, 0);
    m2.hit(0);
    m2.hit(0);
    expect(m2.hit(2000)).toBe(true); // refilled
  });

  it('per connection; rate-limited moves never count', () => {
    let t = 0;
    const tr = createViolationTracker({ burst: 3, refillPerSec: 0 }, () => t);
    const a = {};
    const b = {};
    for (let i = 0; i < 100; i++) expect(tr.record(a, 'move', 'rate_limited')).toBe(false);
    expect([1, 2, 3].map(() => tr.record(a, 'social:emote', 'rate_limited'))).toEqual([false, false, false]); // (v2.3) chat:send rate limits are exempt like move
    expect(tr.record(a, 'zz', 'unknown_type')).toBe(true);
    expect(tr.record(b, 'zz', 'invalid_payload')).toBe(false);
    t += 1;
    expect(DEFAULT_VIOLATION_SPEC.burst).toBeGreaterThanOrEqual(100);
  });
});
