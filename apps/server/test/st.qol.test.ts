// OWNED BY rules-storyteller (st-qol). Storyteller quality-of-life helpers in the game module:
// the ready-made false info for drunk / poisoned info characters (Storyteller view only) and the
// Undo label.
import type { CharacterId, StCommand, StorytellerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { createGameModule } from '../src/game/index.js';
import { createFakeHost } from './helpers/fakeHost.js';

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'chef', 'monk', 'butler', 'soldier'];

function rig() {
  const host = createFakeHost('qol');
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < CHARS.length; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `Player${i + 1}` });
  const game = createGameModule(host, { seed: 7, voteStepMs: 100, bedtimeSeconds: 30, nightfallGraceMs: 0 });
  host.setModules({ game });
  game.start(
    CHARS.map((_, i) => ({ pid: `p${i}`, seat: i, name: `Player${i + 1}` })),
    'st',
  );
  const st = (cmd: StCommand) => {
    host.clock.now += 50;
    const before = (host.sent.get('st') ?? []).length;
    game.handleStoryteller('st', cmd);
    const errs = (host.sent.get('st') ?? []).slice(before).filter((m) => m.type === 'error');
    if (errs.length) throw new Error(`st ${cmd.type}: ${JSON.stringify(errs[0]!.payload)}`);
  };
  st({ type: 'assign_characters', assignments: CHARS.map((character, seat) => ({ seat, character })), demonBluffs: [], redHerringSeat: 2 });
  st({ type: 'begin_first_night' });
  return { host, game, st, stView: () => game.viewFor('st') as StorytellerGameView };
}

describe('false info suggestion (drunk / poisoned info characters)', () => {
  it('only impaired info steps get one; it differs from the truth; it is stable; players never see it', () => {
    const r = rig();
    const empath = () => r.stView().nightQueue.find((s) => s.character === 'empath')!;
    const washer = () => r.stView().nightQueue.find((s) => s.character === 'washerwoman')!;
    expect(empath().suggestedInfo).toBeTruthy();
    expect(empath().falseInfo).toBeUndefined(); // healthy: the truth only
    r.st({ type: 'set_status', seat: 3, poisoned: true });
    const e = empath();
    expect(e.impaired).toBe(true);
    expect(e.falseInfo).toBeTruthy();
    expect(e.falseInfo!.stepId).toBe(e.id);
    expect(e.suggestedInfo!.number).toBe(0); // neighbours: Washerwoman + Chef
    expect([1, 2]).toContain(e.falseInfo!.number);
    expect(e.falseInfo!.text).not.toBe(e.suggestedInfo!.text);
    // Stable between views (no flicker in the Storyteller's text box).
    expect(empath().falseInfo).toEqual(e.falseInfo);
    expect(washer().falseInfo).toBeUndefined();
    // Players' projections carry no night queue at all, let alone this.
    for (let i = 0; i < CHARS.length; i++) expect(JSON.stringify(r.game.viewFor(`p${i}`))).not.toContain('falseInfo');
    // The Storyteller can send it like any info (it completes the step).
    r.st({ type: 'send_info', seat: 3, info: e.falseInfo! });
    expect(empath().status).toBe('resolved');
    expect(empath().falseInfo).toBeUndefined();
  });

  it('the Undo label travels in the Storyteller view', () => {
    const r = rig();
    r.st({ type: 'set_status', seat: 3, poisoned: true });
    expect(r.stView().undoLabel).toBe("Player4's status");
    expect(JSON.stringify(r.game.viewFor('p0'))).not.toContain('undoLabel');
  });
});
