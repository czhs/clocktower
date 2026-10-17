// OWNED BY auto-st (st-qol). Player-facing clarity in automatic games: public lines that say what the
// automatic Storyteller is doing and why the game is waiting — and nothing secret.
import { describe, expect, it } from 'vitest';
import { autoRig } from './autoHarness.js';

describe('automatic Storyteller explains itself (public announcements)', () => {
  it('night, day plan, defence countdown and day end are announced; nothing private leaks', () => {
    const rig = autoRig(6, { seed: 21, auto: { voteDelayMs: 3_000, discussionMs: 1_000, nominationsMs: 20_000 } });
    const texts = () => rig.view(0).announcements.map((a) => a.text);
    let guard = 0;
    while (rig.game.phase() !== 'day' && guard++ < 2_000) {
      rig.step(100);
      rig.bots();
    }
    expect(rig.game.phase()).toBe('day');
    expect(texts().some((t) => /wakes players in night order/.test(t) && /answer any question at home within \d+ seconds/.test(t))).toBe(true);
    expect(texts().some((t) => /^Day 1: .* to talk, then .* of nominations\. Need more time\? Propose it on the town clock\.$/.test(t))).toBe(true);
    // Every player sees the same public lines.
    for (let i = 1; i < 6; i++) expect(rig.view(i).announcements.map((a) => a.text)).toEqual(texts());
    // Wait for nominations, then nominate: the vote waits for the defence and says so.
    guard = 0;
    while (!rig.view(0).day?.nominationsOpen && guard++ < 200) rig.step(100);
    const s = rig.state();
    const nominator = s.players.find((p) => p.alive)!;
    const nominee = s.players.find((p) => p.alive && p.seat !== nominator.seat)!;
    rig.game.handlePlayer(rig.pid(nominator.seat), 'game:nominate', { nomineeSeat: nominee.seat });
    rig.step(100);
    expect(texts().some((t) => t === `${nominee.name} may speak in their defence: the vote starts in 3 seconds.`)).toBe(true);
    // Day end.
    guard = 0;
    while (rig.game.phase() === 'day' && guard++ < 1_000) rig.step(100);
    expect(texts().some((t) => t.startsWith('The town clock strikes: the day is over.'))).toBe(true);
    // No explanation names a character or a night choice.
    const mine = texts().filter((t) => /automatic Storyteller|town clock|defence|Day \d+:|Time for bed/.test(t));
    for (const t of mine) for (const p of s.players) expect(t.toLowerCase()).not.toContain(p.character.replace('_', ' '));
  });

  it('one bedtime line (the bell carries the automatic rule); later nights and days use the short form', () => {
    const rig = autoRig(7, { seed: 5, policy: { nominate: 0, slayer: 0, propose: 0 }, auto: { discussionMs: 500, nominationsMs: 500 } });
    const all: string[] = [];
    const seen = new Set<string>();
    const collect = () => {
      for (const a of rig.view(0).announcements) if (!seen.has(a.id)) (seen.add(a.id), all.push(a.text));
    };
    let guard = 0;
    while (rig.state().dayNumber < 2 && rig.game.phase() !== 'finished' && guard++ < 6_000) {
      rig.step(100);
      rig.bots();
      collect();
    }
    expect(rig.state().dayNumber).toBe(2); // nobody executed: the Imp alone cannot end it by night 2
    const bells = all.filter((t) => t.startsWith('The bell tolls.'));
    expect(bells.length).toBe(2);
    for (const b of bells) expect(b).toMatch(/Whoever is still out is walked home; night falls at most \d+ seconds later\.$/);
    expect(all.some((t) => /Time for bed/.test(t))).toBe(false);
    expect(all.filter((t) => /wakes players in night order/.test(t)).length).toBe(1);
    expect(all).toContain('Night 2 falls.');
    expect(all.some((t) => /^Day 2: .* to talk, then .* of nominations\.$/.test(t))).toBe(true);
    expect(all.filter((t) => /Propose it on the town clock/.test(t)).length).toBe(1);
  });
});
