import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller, type GameState } from '../src/index.js';
import { act, act_night, alive, begin, finishNight, hasStep, mkGame, P, st, step, stErr, toDay, toNight } from './helpers.js';

// Standard 8-player script: imp, poisoner, washerwoman, empath, fortune_teller, monk, butler, ravenkeeper
const G8: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper'];

function sv(s: GameState, id: string) {
  return projectForStoryteller(s).nightQueue.find((x) => x.id === id)!;
}

function toNight2(s: GameState) {
  begin(s);
  finishNight(s);
  toDay(s);
  toNight(s);
}

describe('first night', () => {
  it('orders the queue: dusk, minion info, demon info, poisoner, info roles, butler, dawn', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    expect(s.nightQueue.map((x) => x.kind)).toEqual([
      'dusk',
      'minion_info',
      'demon_info',
      'poisoner',
      'washerwoman',
      'empath',
      'fortune_teller',
      'butler',
      'dawn',
    ]);
  });

  it('skips minion/demon info with fewer than 7 players', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk']);
    begin(s);
    expect(hasStep(s, 'minion_info')).toBe(false);
    expect(hasStep(s, 'demon_info')).toBe(false);
    expect(s.nightQueue.map((x) => x.kind)).toEqual(['dusk', 'poisoner', 'chef', 'empath', 'dawn']);
  });

  it('minion info and demon info (with 3 bluffs) reach only the evil team', () => {
    const s = mkGame(G8, { bluffs: ['chef', 'mayor', 'saint'] });
    begin(s);
    st(s, { type: 'resolve_step', stepId: step(s, 'minion_info').id });
    st(s, { type: 'resolve_step', stepId: step(s, 'demon_info').id });
    const imp = projectForPlayer(s, 0);
    const poi = projectForPlayer(s, 1);
    expect(imp.you.evilTeam).toEqual({ demonSeats: [0], minionSeats: [1], bluffs: ['chef', 'mayor', 'saint'] });
    expect(poi.you.evilTeam).toEqual({ demonSeats: [0], minionSeats: [1], bluffs: [] });
    expect(imp.info.at(-1)!.characters).toEqual(['chef', 'mayor', 'saint']);
    for (let seat = 2; seat < 8; seat++) {
      const v = projectForPlayer(s, seat);
      expect(v.you.evilTeam).toBeNull();
      expect(v.info).toEqual([]);
    }
  });

  it('washerwoman/investigator/librarian suggestions include a true holder', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = mkGame(['imp', 'poisoner', 'washerwoman', 'investigator', 'librarian', 'monk', 'saint', 'chef'], { seed });
      begin(s);
      for (const [kind, type] of [
        ['washerwoman', 'townsfolk'],
        ['investigator', 'minion'],
        ['librarian', 'outsider'],
      ] as const) {
        const x = step(s, kind);
        const v = sv(s, x.id);
        const [c] = v.suggestedInfo!.characters!;
        const seats = v.suggestedInfo!.seats!;
        expect(seats).toHaveLength(2);
        expect(seats).not.toContain(x.seat);
        expect(seats.some((q) => P(s, q).character === c)).toBe(true);
        expect(['townsfolk', 'minion', 'outsider']).toContain(type);
      }
    }
  });

  it('librarian with no outsiders learns zero', () => {
    const s = mkGame(['imp', 'poisoner', 'librarian', 'empath', 'monk']);
    begin(s);
    const v = sv(s, step(s, 'librarian').id);
    expect(v.suggestedInfo).toMatchObject({ number: 0 });
  });

  it('chef counts adjacent evil pairs (with wrap-around)', () => {
    const s = mkGame(['imp', 'chef', 'empath', 'monk', 'saint', 'soldier', 'poisoner']);
    begin(s);
    expect(sv(s, step(s, 'chef').id).suggestedInfo!.number).toBe(1);
    const s2 = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk', 'spy', 'scarlet_woman']);
    begin(s2);
    // pairs: (0,1) (5,6) (6,0)
    expect(sv(s2, step(s2, 'chef').id).suggestedInfo!.number).toBe(3);
    expect(sv(s2, step(s2, 'chef').id).notes!.join()).toMatch(/Spy .* may register as good/);
  });

  it('empath counts closest living neighbours, skipping the dead', () => {
    const s = mkGame(['imp', 'empath', 'poisoner', 'monk', 'chef']);
    begin(s);
    expect(sv(s, step(s, 'empath').id).suggestedInfo!.number).toBe(2);
    finishNight(s);
    toDay(s);
    st(s, { type: 'kill', seat: 2, announce: true });
    toNight(s);
    // neighbours now imp (0) and monk (3)
    expect(sv(s, step(s, 'empath').id).suggestedInfo!.number).toBe(1);
  });

  it('fortune teller: demon or red herring -> yes', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    const ft = step(s, 'fortune_teller');
    const ask = (seats: number[]) => {
      st(s, { type: 'prompt_player', seat: 4, prompt: { kind: 'choose_players', title: 'Choose', minTargets: 2, maxTargets: 2, stepId: ft.id } });
      act(s, 4, { type: 'promptResponse', promptId: P(s, 4).prompts.at(-1)!.id, seats });
      return sv(s, ft.id).suggestedInfo!.yes;
    };
    expect(ask([3, 5])).toBe(false);
    expect(ask([0, 3])).toBe(true);
    expect(ask([2, 3])).toBe(true);
    expect(sv(s, ft.id).suggestion).toMatch(/red herring/);
  });

  it('send_info with stepId completes an info step and delivers only to that player', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    const ww = step(s, 'washerwoman');
    const info = sv(s, ww.id).suggestedInfo!;
    st(s, { type: 'send_info', seat: 2, info: { ...info, text: info.text } });
    expect(ww.status).toBe('resolved');
    expect(projectForPlayer(s, 2).info.at(-1)!.text).toBe(info.text);
    expect(projectForPlayer(s, 3).info).toEqual([]);
  });

  it('the Drunk wakes as their believed Townsfolk and the step is flagged', () => {
    const s = mkGame(['imp', 'poisoner', 'drunk', 'empath', 'chef'], { drunkBelieves: 'monk' });
    begin(s);
    finishNight(s);
    toDay(s);
    toNight(s);
    const monk = step(s, 'monk');
    expect(monk.seat).toBe(2);
    const v = sv(s, monk.id);
    expect(v.impaired).toBe(true);
    expect(v.notes!.join()).toMatch(/Drunk/);
    expect(projectForPlayer(s, 2).you.role).toEqual({ character: 'monk', characterType: 'townsfolk', alignment: 'good' });
    act_night(s, 'monk', [3]);
    expect(P(s, 3).protectedTonight).toBe(false);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(false);
  });

  it('poisoned info roles are flagged so the ST may lie', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    act_night(s, 'poisoner', [3]);
    const v = sv(s, step(s, 'empath').id);
    expect(v.impaired).toBe(true);
    expect(v.notes!.join()).toMatch(/poisoned/);
  });

  it('Spy/Recluse registration: suggestions stay truthful and list what they may register as', () => {
    const s = mkGame(['imp', 'spy', 'investigator', 'washerwoman', 'fortune_teller', 'recluse', 'chef'], { redHerringSeat: 2 });
    begin(s);
    // Investigator's truthful pick is the real Minion (the Spy); the Recluse is a registration option.
    const inv = sv(s, step(s, 'investigator').id);
    expect(inv.suggestedInfo!.characters).toEqual(['spy']);
    expect(inv.notes!.join('\n')).toMatch(/Recluse P6 \(seat 6\) may register as evil, or as a Minion or the Demon/);
    expect(inv.notes!.join('\n')).toMatch(/Spy P2 \(seat 2\) may register as good, or as a Townsfolk or Outsider/);
    // Fortune Teller choosing the Recluse: truthful NO, with the Recluse note for the ST to decide.
    act_night(s, 'fortune_teller', [5, 6]);
    const ft = sv(s, step(s, 'fortune_teller').id);
    expect(ft.suggestedInfo!.yes).toBe(false);
    expect(ft.notes!.join()).toMatch(/Recluse/);
    expect(ft.notes!.join()).not.toMatch(/Spy/);
    // A poisoned Spy/Recluse loses the ability to misregister: no note.
    st(s, { type: 'set_status', seat: 5, poisoned: true });
    expect(sv(s, step(s, 'investigator').id).notes!.join()).not.toMatch(/Recluse/);
  });

  it('spy sees a grimoire snapshot', () => {
    const s = mkGame(['imp', 'spy', 'chef', 'empath', 'monk', 'recluse', 'virgin']);
    begin(s);
    st(s, { type: 'resolve_step', stepId: step(s, 'spy').id });
    const v = projectForPlayer(s, 1);
    expect(v.spyGrimoire!.entries.map((e) => e.character)).toEqual(['imp', 'spy', 'chef', 'empath', 'monk', 'recluse', 'virgin']);
    expect(projectForPlayer(s, 2).spyGrimoire).toBeNull();
  });
});

describe('other nights', () => {
  it('orders poisoner, monk, imp, (ravenkeeper), empath, fortune teller, butler', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    expect(s.nightQueue.map((x) => x.kind)).toEqual(['dusk', 'poisoner', 'monk', 'imp', 'empath', 'fortune_teller', 'butler', 'dawn']);
  });

  it('imp kill is secret until dawn', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(false);
    expect(projectForPlayer(s, 3).you.alive).toBe(true);
    expect(projectForPlayer(s, 4).players[3]!.alive).toBe(true);
    expect(projectForStoryteller(s).pendingDeaths).toEqual([3]);
    toDay(s);
    expect(projectForPlayer(s, 4).players[3]!.alive).toBe(false);
    expect(s.announcements.map((a) => a.text).join('\n')).toMatch(/P4 is dead/);
  });

  it('monk protection stops the demon; poisoned monk does not', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'monk', [3]);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(true);
    toDay(s);
    toNight(s);
    act_night(s, 'poisoner', [5]);
    act_night(s, 'monk', [3]);
    expect(P(s, 3).protectedTonight).toBe(false);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(false);
  });

  it('monk cannot protect themself', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    expect(stErr(s, { type: 'resolve_step', stepId: step(s, 'monk').id, seats: [5] })).toMatch(/themself/);
  });

  it('a healthy soldier survives the demon; a poisoned one dies', () => {
    const s = mkGame(['imp', 'poisoner', 'soldier', 'empath', 'chef']);
    toNight2(s);
    act_night(s, 'imp', [2]);
    expect(alive(s, 2)).toBe(true);
    toDay(s);
    toNight(s);
    act_night(s, 'poisoner', [2]);
    act_night(s, 'imp', [2]);
    expect(alive(s, 2)).toBe(false);
  });

  it('poisoned imp kills nobody; poison wears off the next night', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'poisoner', [0]);
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(true);
    toDay(s);
    expect(P(s, 0).poisonedBy).toBe('poisoner');
    toNight(s);
    expect(P(s, 0).poisonedBy).toBeNull();
    act_night(s, 'imp', [3]);
    expect(alive(s, 3)).toBe(false);
  });

  it('poison ends when the poisoner dies', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'poisoner', [5]);
    toDay(s);
    st(s, { type: 'set_nominations_open', open: true });
    st(s, { type: 'execute', seat: 1 });
    expect(P(s, 5).poisonedBy).toBeNull();
  });

  it('imp self-kill passes the demon to a minion', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'imp', [0]);
    expect(alive(s, 0)).toBe(false);
    expect(P(s, 1).character).toBe('imp');
    expect(P(s, 1).alignment).toBe('evil');
    const v = projectForPlayer(s, 1);
    expect(v.you.role!.character).toBe('imp');
    expect(v.info.at(-1)!.text).toMatch(/now the Imp/);
    expect(s.phase).toBe('night');
  });

  it('imp self-kill: Scarlet Woman has priority with 5+ alive, else ST choice', () => {
    const chars: CharacterId[] = ['imp', 'poisoner', 'scarlet_woman', 'empath', 'chef', 'monk', 'saint', 'butler'];
    const s = mkGame(chars);
    toNight2(s);
    act_night(s, 'imp', [0], { starpassSeat: 1 });
    expect(P(s, 2).character).toBe('imp');
    expect(P(s, 1).character).toBe('poisoner');

    const s2 = mkGame(['imp', 'poisoner', 'baron', 'empath', 'chef', 'monk', 'saint', 'butler']);
    toNight2(s2);
    act_night(s2, 'imp', [0], { starpassSeat: 2 });
    expect(P(s2, 2).character).toBe('imp');
  });

  it('imp self-kill with no minion alive ends the game for good', () => {
    const s = mkGame(['imp', 'poisoner', 'chef', 'empath', 'monk']);
    toNight2(s);
    toDay(s);
    st(s, { type: 'execute', seat: 1 });
    toNight(s);
    act_night(s, 'imp', [0]);
    expect(s.phase).toBe('finished');
    expect(s.result!.winner).toBe('good');
  });

  it('ravenkeeper wakes when killed by the demon', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'imp', [7]);
    const rk = step(s, 'ravenkeeper');
    expect(rk.seat).toBe(7);
    const kinds = s.nightQueue.map((x) => x.kind);
    expect(kinds.indexOf('ravenkeeper')).toBe(kinds.indexOf('imp') + 1);
    // dead player may still answer the ST's prompt
    st(s, { type: 'prompt_player', seat: 7, prompt: { kind: 'choose_players', title: 'Choose', minTargets: 1, maxTargets: 1, stepId: rk.id } });
    act(s, 7, { type: 'promptResponse', promptId: P(s, 7).prompts.at(-1)!.id, seats: [0] });
    expect(sv(s, rk.id).suggestedInfo).toMatchObject({ characters: ['imp'], seats: [0] });
  });

  it('ravenkeeper killed by the ST (not the demon) does not wake', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    st(s, { type: 'kill', seat: 7, announce: false });
    expect(hasStep(s, 'ravenkeeper')).toBe(false);
  });

  it('dead players do not wake; later steps of a killed player are skipped', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    toNight2(s);
    act_night(s, 'imp', [3]);
    expect(step(s, 'empath').status).toBe('skipped');
    toDay(s);
    toNight(s);
    expect(hasStep(s, 'empath')).toBe(false);
  });

  it('mayor: kill may bounce to another player', () => {
    const s = mkGame(['imp', 'poisoner', 'mayor', 'empath', 'chef', 'monk', 'saint']);
    toNight2(s);
    const imp = step(s, 'imp');
    st(s, { type: 'prompt_player', seat: 0, prompt: { kind: 'choose_players', title: 'Kill', minTargets: 1, maxTargets: 1, stepId: imp.id } });
    act(s, 0, { type: 'promptResponse', promptId: P(s, 0).prompts.at(-1)!.id, seats: [2] });
    expect(sv(s, imp.id).notes!.join()).toMatch(/redirectSeat/);
    st(s, { type: 'resolve_step', stepId: imp.id, redirectSeat: 4 });
    expect(alive(s, 2)).toBe(true);
    expect(alive(s, 4)).toBe(false);
    toDay(s);
    toNight(s);
    act_night(s, 'imp', [2]);
    expect(alive(s, 2)).toBe(false);
  });

  it('undertaker learns the executed character only after an execution death', () => {
    const s = mkGame(['imp', 'poisoner', 'undertaker', 'empath', 'chef', 'monk', 'saint']);
    toNight2(s);
    expect(hasStep(s, 'undertaker')).toBe(false);
    toDay(s);
    st(s, { type: 'execute', seat: 4 });
    toNight(s);
    const u = step(s, 'undertaker');
    expect(sv(s, u.id).suggestedInfo).toMatchObject({ characters: ['chef'], seats: [4] });
    finishNight(s);
    toDay(s);
    st(s, { type: 'execute', seat: null });
    toNight(s);
    expect(hasStep(s, 'undertaker')).toBe(false);
  });

  it('butler master is recorded and shown only to the butler', () => {
    const s = mkGame(G8, { redHerringSeat: 2 });
    begin(s);
    act_night(s, 'butler', [3]);
    expect(projectForPlayer(s, 6).you.butlerMasterSeat).toBe(3);
    expect(projectForPlayer(s, 3).you.butlerMasterSeat).toBeNull();
    expect(projectForStoryteller(s).grimoire[3]!.isButlerMaster).toBe(true);
  });
});
