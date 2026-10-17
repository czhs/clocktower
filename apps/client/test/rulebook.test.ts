// Rulebook Grimoire content (src/ui/rulebook/content.ts): every character is reachable in exactly
// one book, the default book follows the lobby's script, night order comes from the engine, and
// search spans every book.
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, CHARACTER_INFO, charactersOfScript } from '@ct/protocol';
import { firstNightOrder } from '@ct/rules';
import {
  BOOK_IDS,
  BOOKS,
  bookForScript,
  bookOfCharacter,
  factsOf,
  groupsOf,
  nightOrderOf,
  searchCharacters,
  setupRows,
  wakeSummary,
} from '../src/ui/rulebook/content';

describe('rulebook books', () => {
  it('lists every character in exactly one book, the one bookOfCharacter names', () => {
    const seen = new Map<string, string>();
    for (const id of BOOK_IDS)
      for (const c of BOOKS[id].characters) {
        expect(seen.has(c), `${c} in ${id} and ${seen.get(c)}`).toBe(false);
        seen.set(c, id);
        expect(bookOfCharacter(c)).toBe(id);
      }
    expect([...seen.keys()].sort()).toEqual([...CHARACTER_IDS].sort());
  });

  it('opens on the lobby script (custom → homebrew, unknown → Trouble Brewing)', () => {
    expect(bookForScript('trouble-brewing')).toBe('trouble-brewing');
    expect(bookForScript('bad-moon-rising')).toBe('bad-moon-rising');
    expect(bookForScript('sects-and-violets')).toBe('sects-and-violets');
    expect(bookForScript('custom')).toBe('homebrew');
    expect(bookForScript(undefined)).toBe('trouble-brewing');
  });

  it('script books hold exactly the script pool, grouped in type order', () => {
    for (const s of ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets'] as const) {
      expect([...BOOKS[s].characters].sort()).toEqual([...charactersOfScript(s)].sort());
      const types = groupsOf(BOOKS[s]).map((g) => g.type);
      expect(types).toEqual(['townsfolk', 'outsider', 'minion', 'demon']);
    }
    expect(groupsOf(BOOKS.travellers).map((g) => g.type)).toEqual(['traveller']);
    expect(groupsOf(BOOKS.rules)).toEqual([]);
  });

  it('night order is the engine order, only for playable scripts, and stays on-script', () => {
    const tb = nightOrderOf(BOOKS['trouble-brewing'])!;
    expect(tb.first).toEqual(firstNightOrder('trouble-brewing'));
    expect(tb.first.length).toBeGreaterThan(0);
    for (const c of [...tb.first, ...tb.other]) expect(charactersOfScript('trouble-brewing')).toContain(c);
    expect(nightOrderOf(BOOKS.fabled)).toBeNull();
    expect(nightOrderOf(BOOKS.rules)).toBeNull();
  });

  it('every book has rules text', () => {
    for (const id of BOOK_IDS) expect(BOOKS[id].rules.length, id).toBeGreaterThan(0);
  });
});

describe('rulebook facts and search', () => {
  it('derives facts from the catalogue and the role table', () => {
    const drunk = factsOf('drunk');
    expect(drunk.ability).toBe(CHARACTER_INFO.drunk.ability);
    expect(drunk.believesOther).toBe('townsfolk');
    expect(factsOf('imp').wakesOtherNights).toBe(true);
    expect(wakeSummary(factsOf('imp'))).toMatch(/after the first/);
    expect(wakeSummary(factsOf('soldier'))).toBe('Does not wake at night.');
    expect(wakeSummary(factsOf(BOOKS.fabled.characters[0]!))).toMatch(/Never wakes/);
    expect(factsOf('slayer').dayAbility).toBeTruthy();
  });

  it('searches names first, then type and ability, across every book', () => {
    expect(searchCharacters('imp')[0]).toBe('imp');
    expect(searchCharacters('  ')).toEqual([]);
    expect(searchCharacters('zzzz-no-such')).toEqual([]);
    const travellers = searchCharacters('traveller', 100);
    for (const c of BOOKS.travellers.characters) expect(travellers).toContain(c);
    // ability text is searchable too
    expect(searchCharacters('ghost vote', 100).length + searchCharacters('executed', 100).length).toBeGreaterThan(0);
    // case and accents do not matter
    expect(searchCharacters('FORTUNE')[0]).toBe('fortune_teller');
  });

  it('setup table covers 5-15 players and each row adds up', () => {
    const rows = setupRows();
    expect(rows.map((r) => r.players)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const r of rows) expect(r.townsfolk + r.outsiders + r.minions + r.demons).toBe(r.players);
  });
});
