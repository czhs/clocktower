// (st-control) The Storyteller changes who / what a player is shown; the sentence follows.
import { describe, expect, it } from 'vitest';
import { replaceWord, swapCharacter, swapNumber, swapSeat } from '../src/ui/storyteller/infoEdit';

const names = ['Ada', 'Bram', 'Cora', 'Dov', 'Ada Jr'];
const nameOf = (seat: number) => names[seat]!;

describe('info editor', () => {
  it('swaps a player in a pair and keeps the rest of the sentence', () => {
    const d = { text: 'One of Ada or Bram is the Empath.', seats: [0, 1], characters: ['empath' as const] };
    const e = swapSeat(d, 1, 2, nameOf);
    expect(e).toEqual({ text: 'One of Ada or Cora is the Empath.', seats: [0, 2], characters: ['empath'] });
    expect(swapCharacter(e, 0, 'chef')).toMatchObject({ text: 'One of Ada or Cora is the Chef.', characters: ['chef'] });
  });

  it('replaces whole words only (a name inside another name is left alone)', () => {
    expect(replaceWord('Ada Jr and Ada', 'Ada', 'Dov')).toBe('Dov Jr and Dov');
    expect(replaceWord('Adam met Ada.', 'Ada', 'Dov')).toBe('Adam met Dov.');
    expect(replaceWord('Fortune Teller (x)', 'Fortune Teller', 'Monk')).toBe('Monk (x)');
  });

  it('changes a number (Chef, Empath) in the text and the attachment', () => {
    const d = { text: '1 pair of evil players sit next to each other.', number: 1 };
    expect(swapNumber(d, 2)).toEqual({ text: '2 pair of evil players sit next to each other.', number: 2 });
  });

  it('is a no-op for an unchanged pick', () => {
    const d = { text: 'Ada is your twin.', seats: [0] };
    expect(swapSeat(d, 0, 0, nameOf)).toBe(d);
  });
});
