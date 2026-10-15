// rules-audit: night order, poison timing, Imp / star-pass, Mayor bounce, Scarlet Woman at night,
// Ravenkeeper / Undertaker / Empath / Fortune Teller. Each test encodes the correct Trouble
// Brewing behaviour; failures are engine bugs listed in docs/rules-audit.md.
import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller, type GameState } from '../src/index.js';
import { act, act_night, alive, begin, finishNight, hasStep, mkGame, P, st, step, toDay, toNight } from './helpers.js';

function sv(s: GameState, id: string) {
  return projectForStoryteller(s).nightQueue.find((x) => x.id === id)!;
}

/** Setup -> night 1 (all resolved/skipped) -> day 1 -> night 2. */
function toNight2(s: GameState) {
  begin(s);
  finishNight(s);
  toDay(s);
  toNight(s);
}

describe('audit: night order', () => {
  // 13 players with every waking role class present.
  const BIG: CharacterId[] = [
    'imp', 'poisoner', 'spy', 'baron', 'monk', 'undertaker', 'ravenkeeper', 'empath', 'fortune_teller', 'chef', 'washerwoman', 'butler', 'recluse',
  ];

  it('first night: Poisoner first; no Monk, Imp, Undertaker or Ravenkeeper; Spy after the Butler', () => {
    const s = mkGame(BIG, { redHerringSeat: 12 });
    begin(s);
    expect(s.nightQueue.map((x) => x.kind)).toEqual([
      'dusk', 'minion_info', 'demon_info', 'poisoner', 'washerwoman', 'chef', 'empath', 'fortune_teller', 'butler', 'spy', 'dawn',
    ]);
  });

  it('other nights: Poisoner, Monk, Imp, Empath, FT, Butler, Spy (no Undertaker without an execution death)', () => {
    const s = mkGame(BIG, { redHerringSeat: 12 });
    toNight2(s);
    expect(s.nightQueue.map((x) => x.kind)).toEqual([
      'dusk', 'poisoner', 'monk', 'imp', 'empath', 'fortune_teller', 'butler', 'spy', 'dawn',
    ]);
  });

  it('the Ravenkeeper killed by the Imp wakes after the Imp and before the Empath', () => {
    const s = mkGame(BIG, { redHerringSeat: 12 });
    toNight2(s);
    act_night(s, 'imp', [6]);
    const kinds = s.nightQueue.map((x) => x.kind);
    expect(kinds.indexOf('ravenkeeper')).toBe(kinds.indexOf('imp') + 1);
    expect(kinds.indexOf('ravenkeeper')).toBeLessThan(kinds.indexOf('empath'));
  });
});

describe('audit: poison', () => {
  it('poisoned from the Poisoner\'s pick through the following day; cleared at the next dusk', () => {
    const s = mkGame(['imp', 'poisoner', 'empath', 'chef', 'monk', 'saint', 'butler']);
    begin(s);
    act_night(s, 'poisoner', [2]);
    expect(sv(s, step(s, 'empath').id).impaired).toBe(true);
    finishNight(s);
    toDay(s);
    expect(P(s, 2).poisonedBy).toBe('poisoner');
    toNight(s);
    expect(P(s, 2).poisonedBy).toBeNull();
    expect(sv(s, step(s, 'empath').id).impaired).toBe(false);
  });

  it('the Poisoner killed by the Imp the same night: her victim is healthy for the rest of the night', () => {
    const s = mkGame(['imp', 'poisoner', 'empath', 'chef', 'monk', 'saint', 'butler']);
    toNight2(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [1]);
    expect(P(s, 2).poisonedBy).toBeNull();
    expect(sv(s, step(s, 'empath').id).impaired).toBe(false);
  });

  it('BUG: the Poisoner becoming the Imp (star-pass) loses the Poisoner ability, so her victim is healthy', () => {
    const s = mkGame(['imp', 'poisoner', 'empath', 'chef', 'monk', 'saint', 'butler']);
    toNight2(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [0]); // star-pass: the only Minion (the Poisoner) becomes the Imp
    expect(P(s, 1).character).toBe('imp');
    expect(P(s, 2).poisonedBy).toBeNull();
    expect(sv(s, step(s, 'empath').id).impaired).toBe(false);
  });

  it('a Drunk "Monk" protects nobody', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'saint', 'butler'], { drunkBelieves: 'monk' });
    toNight2(s);
    act_night(s, 'monk', [3]);
    expect(P(s, 3).protectedTonight).toBe(false);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(false);
  });
});

describe('audit: Imp', () => {
  const G: CharacterId[] = ['imp', 'poisoner', 'spy', 'ravenkeeper', 'empath', 'monk', 'chef', 'soldier'];

  it('attacking an already-dead player does nothing (no death, no Ravenkeeper wake)', () => {
    const s = mkGame(G);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 3 }); // Ravenkeeper executed
    toNight(s);
    act_night(s, 'imp', [3]);
    expect(hasStep(s, 'ravenkeeper')).toBe(false);
    expect(projectForStoryteller(s).pendingDeaths).toEqual([]);
  });

  it('Monk-protected Imp choosing themself: no death, no star-pass', () => {
    const s = mkGame(G);
    toNight2(s);
    act_night(s, 'monk', [0]);
    act_night(s, 'imp', [0]);
    expect(alive(s, 0)).toBe(true);
    expect(P(s, 0).character).toBe('imp');
    expect(P(s, 1).character).toBe('poisoner');
  });

  it('star-pass: the new Imp does not act again tonight and their Minion step (Spy) is skipped; they kill next night', () => {
    const s = mkGame(['imp', 'spy', 'empath', 'chef', 'monk', 'saint', 'butler']);
    toNight2(s);
    act_night(s, 'imp', [0]);
    expect(P(s, 1).character).toBe('imp');
    expect(s.nightQueue.filter((x) => x.kind === 'imp')).toHaveLength(1);
    expect(step(s, 'spy').status).toBe('skipped');
    finishNight(s);
    toDay(s);
    toNight(s);
    expect(step(s, 'imp').seat).toBe(1);
    expect(hasStep(s, 'spy')).toBe(false);
  });

  it('star-pass with a poisoned Scarlet Woman (5+ alive): the ST\'s chosen Minion becomes the Imp', () => {
    const s = mkGame(['imp', 'poisoner', 'scarlet_woman', 'empath', 'chef', 'monk', 'saint', 'butler']);
    toNight2(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [0], { starpassSeat: 1 });
    expect(P(s, 1).character).toBe('imp');
    expect(P(s, 2).character).toBe('scarlet_woman');
  });

  it('star-pass with a healthy Scarlet Woman but only 4 alive: the ST may choose another Minion', () => {
    const s = mkGame(['imp', 'poisoner', 'scarlet_woman', 'empath', 'chef']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 4 });
    toNight(s);
    act_night(s, 'imp', [0], { starpassSeat: 1 });
    expect(P(s, 1).character).toBe('imp');
    expect(P(s, 2).character).toBe('scarlet_woman');
    expect(s.phase).toBe('night'); // 3 alive, Demon alive
  });

  it('star-pass leaving two players alive: evil wins', () => {
    const s = mkGame(['imp', 'poisoner', 'empath', 'chef', 'monk']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 4 });
    toNight(s);
    act_night(s, 'imp', [2]); // 3 alive: imp, poisoner, chef
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: null });
    toNight(s);
    act_night(s, 'imp', [0]);
    expect(P(s, 1).character).toBe('imp');
    expect(s.result).toMatchObject({ winner: 'evil' });
  });
});

describe('audit: Mayor bounce', () => {
  const M: CharacterId[] = ['imp', 'poisoner', 'mayor', 'soldier', 'chef', 'monk', 'empath', 'ravenkeeper'];

  it('bounce onto the Ravenkeeper: they die and wake', () => {
    const s = mkGame(M);
    toNight2(s);
    act_night(s, 'imp', [2], { redirectSeat: 7 });
    expect(alive(s, 2)).toBe(true);
    expect(alive(s, 7)).toBe(false);
    expect(step(s, 'ravenkeeper').seat).toBe(7);
  });

  it('bounce onto the Imp: the Imp dies, good wins (no Scarlet Woman)', () => {
    const s = mkGame(M);
    toNight2(s);
    act_night(s, 'imp', [2], { redirectSeat: 0 });
    expect(alive(s, 0)).toBe(false);
    expect(s.result).toMatchObject({ winner: 'good' });
  });

  it('a poisoned Mayor cannot bounce: the Mayor dies', () => {
    const s = mkGame(M);
    toNight2(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [2], { redirectSeat: 4 });
    expect(alive(s, 2)).toBe(false);
    expect(alive(s, 4)).toBe(true);
  });

  it('BUG: a bounced Demon kill onto a healthy Soldier kills nobody', () => {
    const s = mkGame(M);
    toNight2(s);
    act_night(s, 'imp', [2], { redirectSeat: 3 });
    expect(alive(s, 2)).toBe(true);
    expect(alive(s, 3)).toBe(true);
  });

  it('BUG: a bounced Demon kill onto a Monk-protected player kills nobody', () => {
    const s = mkGame(M);
    toNight2(s);
    act_night(s, 'monk', [6]);
    act_night(s, 'imp', [2], { redirectSeat: 6 });
    expect(alive(s, 2)).toBe(true);
    expect(alive(s, 6)).toBe(true);
  });
});

describe('audit: Scarlet Woman at night', () => {
  it('bounce onto the Imp with 5+ alive: a healthy Scarlet Woman becomes the Imp; she kills next night', () => {
    const s = mkGame(['imp', 'scarlet_woman', 'mayor', 'chef', 'empath', 'monk', 'saint']);
    toNight2(s);
    act_night(s, 'imp', [2], { redirectSeat: 0 });
    expect(P(s, 1).character).toBe('imp');
    expect(s.phase).toBe('night');
    finishNight(s);
    toDay(s);
    toNight(s);
    expect(step(s, 'imp').seat).toBe(1);
  });
});

describe('audit: Ravenkeeper / Undertaker / Empath / Fortune Teller', () => {
  it('the Drunk who believes they are the Ravenkeeper wakes when the Imp kills them (impaired step)', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'monk', 'saint'], { drunkBelieves: 'ravenkeeper' });
    toNight2(s);
    act_night(s, 'imp', [2]);
    const rk = step(s, 'ravenkeeper');
    expect(rk.seat).toBe(2);
    expect(sv(s, rk.id).impaired).toBe(true);
  });

  it('a poisoned Ravenkeeper still wakes (info may be false)', () => {
    const s = mkGame(['imp', 'poisoner', 'ravenkeeper', 'chef', 'empath', 'monk', 'saint']);
    toNight2(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [2]);
    const rk = step(s, 'ravenkeeper');
    expect(sv(s, rk.id).impaired).toBe(true);
  });

  it('Undertaker after a Virgin execution learns the nominator\'s character', () => {
    const s = mkGame(['imp', 'poisoner', 'virgin', 'chef', 'undertaker', 'monk', 'saint']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 3, { type: 'nominate', nomineeSeat: 2 });
    expect(alive(s, 3)).toBe(false);
    toNight(s);
    expect(sv(s, step(s, 'undertaker').id).suggestedInfo).toMatchObject({ seats: [3], characters: ['chef'] });
  });

  it('Undertaker learns "Imp" when the executed Imp was replaced by the Scarlet Woman', () => {
    const s = mkGame(['imp', 'scarlet_woman', 'undertaker', 'chef', 'empath', 'monk', 'saint']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 0 });
    expect(P(s, 1).character).toBe('imp');
    toNight(s);
    expect(sv(s, step(s, 'undertaker').id).suggestedInfo).toMatchObject({ seats: [0], characters: ['imp'] });
  });

  it('Undertaker learns "Drunk" for an executed Drunk (the true character)', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'undertaker', 'empath', 'monk', 'saint'], { drunkBelieves: 'chef' });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 2 });
    toNight(s);
    expect(sv(s, step(s, 'undertaker').id).suggestedInfo).toMatchObject({ characters: ['drunk'] });
  });

  it('Undertaker does not wake when an already-dead player was executed', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'undertaker', 'empath', 'monk', 'saint']);
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 2, announce: true });
    st(s, { type: 'execute', seat: 2 });
    toNight(s);
    expect(hasStep(s, 'undertaker')).toBe(false);
  });

  it('Empath skips a neighbour the Imp killed earlier tonight', () => {
    // seats: 0 imp, 1 chef, 2 empath, 3 poisoner ... Empath's neighbours: chef(1) and poisoner(3)
    const s = mkGame(['imp', 'chef', 'empath', 'poisoner', 'monk', 'saint', 'butler']);
    toNight2(s);
    act_night(s, 'imp', [3]);
    // poisoner dead -> next living neighbour clockwise is the monk (good)
    expect(sv(s, step(s, 'empath').id).suggestedInfo).toMatchObject({ number: 0 });
  });

  it('Fortune Teller: a dead red herring still registers as the Demon', () => {
    const s = mkGame(['imp', 'poisoner', 'fortune_teller', 'chef', 'empath', 'monk', 'saint'], { redHerringSeat: 3 });
    begin(s);
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: 3 });
    toNight(s);
    act_night(s, 'imp', [4]);
    const ft = step(s, 'fortune_teller');
    st(s, { type: 'prompt_player', seat: 2, prompt: { kind: 'choose_players', title: 'x', minTargets: 2, maxTargets: 2, stepId: ft.id } });
    act(s, 2, { type: 'promptResponse', promptId: P(s, 2).prompts.at(-1)!.id, seats: [3, 5] });
    expect(sv(s, ft.id).suggestedInfo).toMatchObject({ yes: true });
  });

  it('the Spy\'s Grimoire shows the Drunk and poison truthfully', () => {
    const s = mkGame(['imp', 'poisoner', 'spy', 'drunk', 'empath', 'monk', 'saint'], { drunkBelieves: 'chef' });
    toNight2(s);
    act_night(s, 'poisoner', [4]);
    st(s, { type: 'resolve_step', stepId: step(s, 'spy').id });
    const g = projectForPlayer(s, 2).spyGrimoire!;
    expect(g.entries.find((e) => e.seat === 3)).toMatchObject({ character: 'drunk', drunk: true });
    expect(g.entries.find((e) => e.seat === 4)).toMatchObject({ poisoned: true });
  });
});
