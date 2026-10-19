// v3 WP2: clip rules (docs/v3/INTEGRATION.md §4 "Emotes and clips", "Deaths"; §3.2 raised hands).
import type { NominationView, PlayerGameView, PublicPlayerView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { clipTransition, DIE_HOLD_S, ghostLevel, ghostLoop, newDeathState, NO_CLIPS, raisedHands, resolveEmote, stepDeath, wantClips, type ClipInputs } from '../../src/game3d/avatars/clips';

const full = { emotes: { talk: 'talk', vote: 'vote', point: 'point', die: 'die', ghost: 'ghost', signature: 'oath' }, emoteClips: ['talk', 'vote', 'point', 'die', 'oath', 'ghost', 'ghost-spent'] };
const noPoint = { emotes: { talk: 'talk', vote: 'vote', point: null, die: 'die', ghost: null, signature: null }, emoteClips: ['talk', 'vote', 'die', 'pleased'] };
const bare = { emotes: { talk: null, vote: null, point: null, die: null, ghost: null, signature: null }, emoteClips: [] };

describe('resolveEmote (fallback chain point -> talk -> idle)', () => {
  it('plays the emote the spec has', () => {
    expect(resolveEmote(full, 'point')).toBe('point');
    expect(resolveEmote(full, 'vote')).toBe('vote');
    expect(resolveEmote(full, 'signature')).toBe('oath');
  });
  it('point falls back to talk, then idle', () => {
    expect(resolveEmote(noPoint, 'point')).toBe('talk');
    expect(resolveEmote(bare, 'point')).toBe('idle');
    expect(resolveEmote(bare, 'talk')).toBe('idle');
    expect(resolveEmote(noPoint, 'signature')).toBe('idle');
  });
  it('other names only when they are safe emote clips (no combat / locomotion)', () => {
    expect(resolveEmote(noPoint, 'pleased')).toBe('pleased');
    expect(resolveEmote(noPoint, 'attack')).toBe('idle');
    expect(resolveEmote(full, 'walk')).toBe('idle');
  });
});

describe('ghost clips', () => {
  it('ghost-spent once the ghost vote is used, when the spec has it', () => {
    expect(ghostLoop(['ghost', 'ghost-spent'], true)).toBe('ghost');
    expect(ghostLoop(['ghost', 'ghost-spent'], false)).toBe('ghost-spent');
    expect(ghostLoop(['ghost'], false)).toBe('ghost');
    expect(ghostLoop([], true)).toBeNull();
    expect(ghostLevel(true)).toBe(1);
    expect(ghostLevel(false)).toBe(2);
  });
});

const inputs = (o: Partial<ClipInputs>): ClipInputs => ({
  dying: false,
  handUp: false,
  dead: false,
  ghostMode: 'clips',
  ghostVoteAvailable: true,
  talking: false,
  clips: ['idle', 'talk', 'vote', 'die', 'ghost', 'ghost-spent'],
  emotes: full.emotes,
  ...o,
});

describe('wantClips', () => {
  it('collapse beats the hand, the hand is a held vote', () => {
    expect(wantClips(inputs({ dying: true, handUp: true, dead: true }))).toEqual({ action: 'die', loop: null });
    expect(wantClips(inputs({ handUp: true }))).toEqual({ action: 'vote', loop: null });
  });
  it("a dead 'clips' ghost holds its ghost loop (spent when the vote is used)", () => {
    expect(wantClips(inputs({ dead: true }))).toEqual({ action: null, loop: 'ghost' });
    expect(wantClips(inputs({ dead: true, ghostVoteAvailable: false }))).toEqual({ action: null, loop: 'ghost-spent' });
    expect(wantClips(inputs({ dead: true, handUp: true }))).toEqual({ action: 'vote', loop: 'ghost' }); // ghost vote
  });
  it("'shared' / 'tint' ghosts need no loop clip", () => {
    expect(wantClips(inputs({ dead: true, ghostMode: 'shared' }))).toEqual(NO_CLIPS);
    expect(wantClips(inputs({ dead: true, ghostMode: 'tint' }))).toEqual(NO_CLIPS);
  });
  it('talking holds the talk loop for the living only; a spec without clips plays nothing', () => {
    expect(wantClips(inputs({ talking: true }))).toEqual({ action: null, loop: 'talk' });
    expect(wantClips(inputs({ talking: true, dead: true, ghostMode: 'tint' }))).toEqual(NO_CLIPS);
    expect(wantClips(inputs({ talking: true, handUp: true, dying: false, emotes: bare.emotes }))).toEqual(NO_CLIPS);
  });
});

describe('clipTransition (vendor play semantics)', () => {
  it('no change, no calls', () => {
    expect(clipTransition(NO_CLIPS, NO_CLIPS)).toEqual([]);
    expect(clipTransition({ action: 'vote', loop: 'ghost' }, { action: 'vote', loop: 'ghost' })).toEqual([]);
  });
  it('raising / lowering the hand', () => {
    expect(clipTransition(NO_CLIPS, { action: 'vote', loop: null })).toEqual(['vote']);
    expect(clipTransition({ action: 'vote', loop: null }, NO_CLIPS)).toEqual(['idle']);
  });
  it('lowering the hand of a ghost re-applies the ghost loop (idle clears both)', () => {
    expect(clipTransition({ action: 'vote', loop: 'ghost' }, { action: null, loop: 'ghost' })).toEqual(['idle', 'ghost']);
  });
  it('a loop change under a held action does not release the hold', () => {
    expect(clipTransition({ action: 'vote', loop: 'ghost' }, { action: 'vote', loop: 'ghost-spent' })).toEqual(['ghost-spent']);
    expect(clipTransition({ action: 'vote', loop: 'talk' }, { action: 'vote', loop: null })).toEqual(['idle', 'vote']);
  });
  it('collapse -> ghost loop', () => {
    expect(clipTransition({ action: 'die', loop: null }, { action: null, loop: 'ghost' })).toEqual(['idle', 'ghost']);
    expect(clipTransition({ action: 'vote', loop: null }, { action: 'die', loop: null })).toEqual(['idle', 'die']);
  });
});

describe('stepDeath', () => {
  it('a death seen in view collapses for 1.5 s, then the ghost look', () => {
    const s = newDeathState();
    expect(stepDeath(s, false, true, true, 10)).toBe(false);
    expect(stepDeath(s, true, true, true, 11)).toBe(true);
    expect(stepDeath(s, true, true, true, 11 + DIE_HOLD_S - 0.01)).toBe(true);
    expect(stepDeath(s, true, true, true, 11 + DIE_HOLD_S)).toBe(false);
    expect(stepDeath(s, true, true, true, 20)).toBe(false);
  });
  it('dead on first sight, out of view, or without a die clip: straight to the ghost', () => {
    const a = newDeathState();
    expect(stepDeath(a, true, true, true, 1)).toBe(false);
    const b = newDeathState();
    stepDeath(b, false, false, true, 1);
    expect(stepDeath(b, true, false, true, 2)).toBe(false);
    const c = newDeathState();
    stepDeath(c, false, true, false, 1);
    expect(stepDeath(c, true, true, false, 2)).toBe(false);
  });
  it('revival clears a running collapse', () => {
    const s = newDeathState();
    stepDeath(s, false, true, true, 0);
    stepDeath(s, true, true, true, 1);
    expect(stepDeath(s, false, true, true, 1.2)).toBe(false);
    expect(s.dyingUntil).toBeNull();
  });
});

const player = (seat: number, alive = true): PublicPlayerView => ({ pid: `p${seat}`, seat, name: `P${seat}`, alive, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true });
const nom = (o: Partial<NominationView>): NominationView => ({ id: 'n1', nominatorSeat: 0, nomineeSeat: 1, status: 'voting', votes: {}, currentVoterSeat: 2, voteCount: 0, threshold: 3, ...o });
const view = (phase: PlayerGameView['phase'], noms: NominationView[]): PlayerGameView =>
  ({ kind: 'player', phase, dayNumber: 1, phaseEndsAt: null, players: [0, 1, 2, 3, 4].map((s) => player(s)), you: { pid: 'p0', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null }, day: { nominationsOpen: true, nominations: noms, onTheBlock: null, executedSeat: null }, prompts: [], info: [], announcements: [], storytellerVisitingYou: false, result: null }) as PlayerGameView;

describe('raisedHands', () => {
  it('counted yes votes and raised, not yet counted hands of the voting nomination', () => {
    const v = view('day', [nom({ status: 'tallied', votes: { 0: true } }), nom({ id: 'n2', votes: { 2: true, 3: false }, handsRaised: [4] })]);
    expect([...raisedHands(v)].sort()).toEqual(['p2', 'p4']);
  });
  it('none without a voting nomination or at night', () => {
    expect(raisedHands(view('day', [nom({ status: 'pending', handsRaised: [1] })])).size).toBe(0);
    expect(raisedHands(view('night', [nom({ handsRaised: [1] })])).size).toBe(0);
    expect(raisedHands(null).size).toBe(0);
  });
});
