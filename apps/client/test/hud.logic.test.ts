// (qol) Player HUD helpers: vote marks in the Town list, prompt choice line, own endgame outcome
// and the single-key shortcut gate (apps/client/src/ui/hud/logic.ts).
import { describe, expect, it } from 'vitest';
import type { GameResult, NominationView } from '@ct/protocol';
import { chooseLine, isTypingElement, ownOutcome, shortcutAllowed, voteMark } from '../src/ui/hud/logic';

const nom = (over: Partial<NominationView> = {}): NominationView => ({
  id: 'n1',
  nominatorSeat: 0,
  nomineeSeat: 1,
  status: 'voting',
  votes: {},
  currentVoterSeat: 2,
  voteCount: 0,
  threshold: 3,
  handsRaised: [],
  ...over,
});

describe('voteMark', () => {
  it('is empty without an active nomination', () => {
    expect(voteMark(undefined, 0)).toBeNull();
    expect(voteMark(nom({ status: 'tallied', votes: { 0: true } }), 0)).toBeNull();
    expect(voteMark(nom({ status: 'cancelled', handsRaised: [0] }), 0)).toBeNull();
  });
  it('shows locked votes before raised hands', () => {
    const n = nom({ votes: { 2: true, 3: false }, handsRaised: [4, 2] });
    expect(voteMark(n, 2)).toBe('yes');
    expect(voteMark(n, 3)).toBe('no');
    expect(voteMark(n, 4)).toBe('raised');
    expect(voteMark(n, 5)).toBeNull();
  });
  it('shows raised hands while the nomination is still pending', () => {
    expect(voteMark(nom({ status: 'pending', currentVoterSeat: null, handsRaised: [3] }), 3)).toBe('raised');
    expect(voteMark(nom({ status: 'pending', handsRaised: undefined }), 3)).toBeNull();
  });
});

describe('chooseLine', () => {
  it('counts the choices', () => {
    expect(chooseLine(1, 1, 0)).toBe('Choose 1 player.');
    expect(chooseLine(2, 2, 0)).toBe('Choose 2 players.');
    expect(chooseLine(2, 2, 1)).toBe('Choose 2 players · 1 chosen');
    expect(chooseLine(1, 3, 2)).toBe('Choose 1–3 players · 2 chosen');
  });
});

describe('ownOutcome', () => {
  const result: GameResult = {
    winner: 'evil',
    reason: 'Two players remain.',
    reveal: [
      { seat: 0, pid: 'a', name: 'A', character: 'imp', alignment: 'evil', alive: true },
      { seat: 1, pid: 'b', name: 'B', character: 'chef', alignment: 'good', alive: true },
    ],
  };
  it('reads the final alignment of the own seat', () => {
    expect(ownOutcome(result, 0)).toEqual({ won: true, alignment: 'evil' });
    expect(ownOutcome(result, 1)).toEqual({ won: false, alignment: 'good' });
  });
  it('is null for the Storyteller or an unknown seat', () => {
    expect(ownOutcome(result, null)).toBeNull();
    expect(ownOutcome(result, 7)).toBeNull();
  });
});

describe('shortcutAllowed', () => {
  const k = (code: string, over: Record<string, unknown> = {}) => ({ key: code.slice(3).toLowerCase(), code, ...over });
  const free = { modalOpen: false, pttCode: 'KeyV' };
  it('fires on a plain key press over the town', () => {
    expect(shortcutAllowed(k('KeyC'), null, free)).toBe(true);
    expect(shortcutAllowed(k('KeyC'), { tagName: 'BUTTON' }, free)).toBe(true);
    expect(shortcutAllowed(k('KeyC'), { tagName: 'CANVAS' }, free)).toBe(true);
  });
  it('never fires while typing, with modifiers, on repeat or under a modal', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(shortcutAllowed(k('KeyC'), { tagName: tag }, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC'), { tagName: 'DIV', isContentEditable: true }, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC', { ctrlKey: true }), null, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC', { metaKey: true }), null, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC', { altKey: true }), null, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC', { repeat: true }), null, free)).toBe(false);
    expect(shortcutAllowed(k('KeyC'), null, { ...free, modalOpen: true })).toBe(false);
  });
  it('leaves the push-to-talk key alone', () => {
    expect(shortcutAllowed(k('KeyH'), null, { modalOpen: false, pttCode: 'KeyH' })).toBe(false);
    expect(shortcutAllowed(k('KeyH'), null, { modalOpen: false, pttCode: null })).toBe(true);
  });
  it('isTypingElement', () => {
    expect(isTypingElement(null)).toBe(false);
    expect(isTypingElement({})).toBe(false);
    expect(isTypingElement({ tagName: 'INPUT' })).toBe(true);
  });
});
