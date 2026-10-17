// OWNED BY rules-storyteller. (v2.2) Dealing modes through the game module: deal_preset / deal_bag
// (auth = seated Storyteller only, validation, shuffles across seeds, record + timeline entry,
// nothing reaches players), the waiting-room 'prepare' command (applied at game start) and an
// automatic game dealing the host's storyline.
import type { CharacterId, PlayerGameView, StCommand, StorytellerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { createGameModule } from '../src/game/index.js';
import { recorderOf } from '../src/records/index.js';
import type { AutoCapableGame } from '../src/auto/index.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

let lobbySeq = 0;

function rig(n = 7, opts: { seed?: number; start?: boolean; lobbyId?: string } = {}) {
  const host: FakeHost = createFakeHost(opts.lobbyId ?? `deal-${++lobbySeq}`);
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < n; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `Player${i + 1}` });
  const game = createGameModule(host, { seed: opts.seed ?? 42, voteStepMs: 100, bedtimeSeconds: 30, nightfallGraceMs: 0, auto: { setupBeatMs: 10 } }) as AutoCapableGame;
  host.setModules({ game });
  const start = () => game.start(Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, seat: i, name: `Player${i + 1}` })), 'st');
  if (opts.start !== false) start();
  const errors = (pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'error').map((m) => m.payload as { code: string; message: string });
  return {
    host,
    game,
    start,
    errors,
    send(pid: string, cmd: StCommand) {
      host.clock.now += 50;
      game.handleStoryteller(pid, cmd);
    },
    st(cmd: StCommand) {
      const before = errors('st').length;
      host.clock.now += 50;
      game.handleStoryteller('st', cmd);
      const e = errors('st').slice(before);
      if (e.length) throw new Error(`st ${cmd.type}: ${JSON.stringify(e[0])}`);
    },
    stView: () => game.viewFor('st') as StorytellerGameView,
    view: (seat: number) => game.viewFor(`p${seat}`) as PlayerGameView,
    chars: () => (game.viewFor('st') as StorytellerGameView).grimoire.map((g) => g.character),
  };
}

/** Everything any player received (views + messages) must not name the storyline or the deal. */
function expectNoLeak(r: ReturnType<typeof rig>, n: number, words: RegExp) {
  for (let i = 0; i < n; i++) {
    expect(JSON.stringify(r.view(i)), `view p${i}`).not.toMatch(words);
    expect(JSON.stringify(r.view(i))).not.toMatch(/"deal"|"grimoire"/);
    expect(JSON.stringify(r.host.sent.get(`p${i}`) ?? []), `messages p${i}`).not.toMatch(words);
  }
}

describe('deal_preset / deal_bag through the game module', () => {
  it('only the seated Storyteller may deal', () => {
    const r = rig();
    r.send('p0', { type: 'deal_preset', storyline: 'classic-night' });
    r.send('p1', { type: 'deal_bag', characters: ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'slayer'] });
    r.send('nobody', { type: 'deal_preset', storyline: 'classic-night' });
    expect(r.errors('p0')).toEqual([expect.objectContaining({ code: 'forbidden' })]);
    expect(r.errors('p1')).toEqual([expect.objectContaining({ code: 'forbidden' })]);
    expect(r.stView().charactersAssigned).toBe(false);
  });

  it('deal_preset: legal setup in the grimoire, deal info + log for the ST, timeline entry, setup record; players see nothing', () => {
    const r = rig(9);
    // The storyline names the Drunk: the Storyteller must say who it is (never left to chance).
    r.send('st', { type: 'deal_preset', storyline: 'outsiders-gate' });
    expect(r.errors('st').at(-1)?.message).toMatch(/choose which player is the Drunk/);
    r.st({ type: 'deal_preset', storyline: 'outsiders-gate', drunkSeat: 3 });
    const v = r.stView();
    expect(v.grimoire.filter((g) => g.character === 'drunk').map((g) => g.seat)).toEqual([3]);
    expect(v.charactersAssigned).toBe(true);
    expect(v.deal).toEqual({ method: 'storyline', storyline: 'outsiders-gate' });
    expect(r.chars()).toContain('baron');
    expect(v.setupCounts).toEqual({ townsfolk: 3, outsiders: 4, minions: 1, demons: 1 }); // 9 players + Baron
    const rec = recorderOf(r.game)!;
    const entry = rec.timeline.find((e) => e.kind === 'storyteller' && (e.data as { command?: string }).command === 'deal_preset');
    expect(entry?.text).toBe('The Storyteller dealt the storyline "Outsiders at the Gate" at random.');
    expectNoLeak(r, 9, /Outsiders at the Gate|outsiders-gate|storyline/i);
    // the ST can still re-assign by hand afterwards (method 'mixed'); the record keeps the storyline
    const drunk = v.grimoire.find((x) => x.character === 'drunk');
    r.st({
      type: 'assign_characters',
      assignments: v.grimoire.map((x) => ({ seat: x.seat, character: x.character })),
      demonBluffs: [...v.demonBluffs],
      ...(drunk ? { drunkBelievesSeatCharacter: drunk.believedCharacter } : {}),
    });
    expect(r.stView().deal).toEqual({ method: 'manual' });
    r.st({ type: 'begin_first_night' });
    expect(rec.setup?.method).toBe('mixed');
    expect(rec.setup?.storyline).toBe('outsiders-gate');
  });

  it('deal_preset validates the storyline against the player count (unsupported -> error, nothing dealt)', () => {
    const r = rig(7);
    r.send('st', { type: 'deal_preset', storyline: 'town-of-liars' });
    expect(r.errors('st').at(-1)).toMatchObject({ code: 'invalid', message: expect.stringMatching(/Town of Liars/) });
    expect(r.stView().charactersAssigned).toBe(false);
  });

  it('deal_bag: the server shuffles the bag (different seats across seeds), validates size and distribution', () => {
    const bag: CharacterId[] = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'slayer'];
    const impSeats = new Set<number>();
    for (let seed = 1; seed <= 25; seed++) {
      const r = rig(7, { seed });
      r.st({ type: 'deal_bag', characters: bag });
      expect([...r.chars()].sort()).toEqual([...bag].sort());
      impSeats.add(r.stView().grimoire.find((g) => g.character === 'imp')!.seat);
    }
    expect(impSeats.size).toBeGreaterThanOrEqual(5);
    const r = rig(7);
    r.send('st', { type: 'deal_bag', characters: bag.slice(0, 6) });
    expect(r.errors('st').at(-1)?.message).toMatch(/6 characters for 7 players/);
    r.send('st', { type: 'deal_bag', characters: ['imp', 'poisoner', 'saint', 'empath', 'monk', 'mayor', 'slayer'] });
    expect(r.errors('st').at(-1)?.message).toMatch(/allowNonstandard/);
    r.st({ type: 'deal_bag', characters: ['imp', 'poisoner', 'saint', 'empath', 'monk', 'mayor', 'slayer'], allowNonstandard: true });
    expect(r.stView().deal).toEqual({ method: 'bag' });
    const rec = recorderOf(r.game)!;
    expect(rec.timeline.some((e) => e.text.startsWith('The Storyteller dealt their own bag of 7 characters at random'))).toBe(true);
    expectNoLeak(r, 7, /own bag|deal_bag/);
  });
});

describe("the Storyteller's pre-game settings ('prepare')", () => {
  it('waiting room: ST only, validated; applied at game start (settings + the storyline dealt automatically)', () => {
    const r = rig(8, { start: false });
    expect(r.game.prepareView!()).toMatchObject({ deal: 'manual', storyline: null, bedtimeSeconds: 30 });
    r.send('p0', { type: 'prepare', prepare: { deal: 'random' } });
    expect(r.errors('p0')).toEqual([expect.objectContaining({ code: 'forbidden' })]);
    r.send('st', { type: 'prepare', prepare: { deal: 'storyline' } });
    expect(r.errors('st').at(-1)?.message).toMatch(/Pick a storyline/);
    r.st({ type: 'prepare', prepare: { deal: 'storyline', storyline: 'poisoned-well', bedtimeSeconds: 90, settings: { doorTags: false, voteSeconds: 2, pamphlets: true } } });
    expect(r.game.prepareView!()).toEqual({ deal: 'storyline', storyline: 'poisoned-well', bedtimeSeconds: 90, settings: { doorTags: false, voteSeconds: 2, pamphlets: true } });
    expect(r.game.viewFor('p0')).toBeNull(); // no game yet; nothing for players
    r.start();
    const v = r.stView();
    expect(v.charactersAssigned).toBe(true);
    expect(v.deal).toEqual({ method: 'storyline', storyline: 'poisoned-well' });
    expect(r.chars()).toContain('poisoner');
    expect(v.bedtimeSeconds).toBe(90);
    expect(v.settings).toEqual({ doorTags: false, voteSeconds: 2, pamphlets: true });
    expect(v.canUndo).toBe(true); // the automatic deal is an ordinary, undoable deal
    expectNoLeak(r, 8, /poisoned-well|Poisoned Well|storyline/i);
    // during the game 'prepare' is refused
    r.send('st', { type: 'prepare', prepare: { deal: 'random' } });
    expect(r.errors('st').at(-1)).toMatchObject({ code: 'phase' });
  });

  it('prepared settings are lobby-scoped (a rematch module keeps them); manual = no deal at start; an unfitting storyline is not dealt', () => {
    const a = rig(7, { start: false, lobbyId: 'prep-scope' });
    a.st({ type: 'prepare', prepare: { deal: 'storyline', storyline: 'town-of-liars' } });
    a.start();
    expect(a.stView().charactersAssigned).toBe(false); // 7 players: A Town of Liars does not fit
    expect(a.stView().log.some((l) => /Prepared storyline not dealt/.test(l.text))).toBe(true);
    const b = rig(7, { start: false, lobbyId: 'prep-scope' }); // the rematch: a fresh module, same lobby
    expect(b.game.prepareView!()).toMatchObject({ deal: 'storyline', storyline: 'town-of-liars' });
    b.st({ type: 'prepare', prepare: { deal: 'manual' } });
    b.start();
    expect(b.stView().charactersAssigned).toBe(false);
    const c = rig(7, { start: false, lobbyId: 'prep-scope' });
    c.st({ type: 'prepare', prepare: { deal: 'random' } });
    c.start();
    expect(c.stView().deal).toEqual({ method: 'random' });
  });
});

describe('automatic games deal the host storyline', () => {
  it("fate deals the configured storyline (recorded as fate's decision); an unfitting one falls back to random", () => {
    const r = rig(6, { start: false });
    r.game.configureMode('auto', { discussionMin: 1, nominationsMin: 1, bedtimeSec: 15, nightSec: 20 }, { storyline: 'saints-gambit' });
    r.start();
    const rec = recorderOf(r.game)!;
    const setup = rec.timeline.find((e) => (e.data as { decision?: string }).decision === 'setup')!;
    expect(setup.text).toMatch(/Fate dealt the storyline "The Saint's Gambit"/);
    expect((setup.data as { storyline?: string }).storyline).toBe('saints-gambit');
    expect(rec.setup === null || rec.setup.method === 'storyline').toBe(true);
    expectNoLeak(r, 6, /Saint's Gambit|saints-gambit/);

    const r2 = rig(7, { start: false });
    r2.game.configureMode('auto', { discussionMin: 1, nominationsMin: 1, bedtimeSec: 15, nightSec: 20 }, { storyline: 'town-of-liars' });
    r2.start();
    const setup2 = recorderOf(r2.game)!.timeline.find((e) => (e.data as { decision?: string }).decision === 'setup')!;
    expect(setup2.text).toMatch(/at random \("A Town of Liars" does not fit 7 players\)/);
  });
});
