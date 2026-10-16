// (v2.2) simple-word lobby ids / names.
import { describe, expect, it } from 'vitest';
import {
  CreateLobbyRequest,
  LOBBY_ADJECTIVES,
  LOBBY_ID_RE,
  LOBBY_NOUNS,
  normalizeLobbyId,
  WORD_LOBBY_ID_RE,
  wordLobbyId,
  wordLobbyName,
} from '../src/index.js';

const ROUTE_RE = /^\/lobby\/([A-Za-z0-9_-]{4,32})\/?$/; // apps/client/src/ui/common/route.ts
const ADMIN_LOBBY_ID_RE = /^[A-Za-z0-9_-]{4,32}$/; // apps/server/src/admin/schemas.ts
const VOICE_LOBBY_RE = /^[A-Za-z0-9_-]{1,64}$/; // packages/voice/src/naming.ts

describe('lobby word lists', () => {
  it('are short, lowercase, unique and disjoint', () => {
    const all = [...LOBBY_ADJECTIVES, ...LOBBY_NOUNS];
    for (const w of all) expect(w).toMatch(/^[a-z]{3,7}$/);
    expect(new Set(LOBBY_ADJECTIVES).size).toBe(LOBBY_ADJECTIVES.length);
    expect(new Set(LOBBY_NOUNS).size).toBe(LOBBY_NOUNS.length);
    expect(new Set(all).size).toBe(all.length);
    // enough combinations that a live collision (<= a few dozen lobbies) is a non-event
    expect(LOBBY_ADJECTIVES.length * LOBBY_NOUNS.length * (LOBBY_NOUNS.length - 1)).toBeGreaterThan(1_000_000);
  });

  it('avoid well-known homophones / confusables', () => {
    const banned = ['bear', 'bare', 'knight', 'night', 'sail', 'sale', 'blue', 'red', 'sun', 'son', 'sea', 'see', 'pear', 'pair', 'deer', 'dear', 'tail', 'tale', 'hare', 'hair', 'flower', 'whale', 'rose', 'plain', 'plane', 'horse', 'llama', 'pigeon', 'cellar', 'toad', 'grey', 'gray'];
    const all: readonly string[] = [...LOBBY_ADJECTIVES, ...LOBBY_NOUNS];
    for (const w of banned) expect(all, w).not.toContain(w);
  });
});

describe('wordLobbyId', () => {
  it('is adjective-noun-noun, lowercase, two different nouns, accepted by every id regex', () => {
    for (let i = 0; i < 2000; i++) {
      const id = wordLobbyId();
      expect(id).toMatch(WORD_LOBBY_ID_RE);
      const [a, n1, n2] = id.split('-') as [string, string, string];
      expect(LOBBY_ADJECTIVES).toContain(a);
      expect(LOBBY_NOUNS).toContain(n1);
      expect(LOBBY_NOUNS).toContain(n2);
      expect(n1).not.toBe(n2);
      expect(id.length).toBeLessThanOrEqual(23);
      expect(id).toMatch(LOBBY_ID_RE);
      expect(id).toMatch(ADMIN_LOBBY_ID_RE);
      expect(id).toMatch(VOICE_LOBBY_RE);
      expect(`/lobby/${id}`).toMatch(ROUTE_RE);
      expect(normalizeLobbyId(id)).toBe(id);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });

  it('is random (few repeats over many draws)', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => wordLobbyId()));
    expect(seen.size).toBeGreaterThan(4950);
  });

  it('never repeats a noun even with a degenerate random source', () => {
    expect(wordLobbyId(() => 0)).toBe(`${LOBBY_ADJECTIVES[0]}-${LOBBY_NOUNS[0]}-${LOBBY_NOUNS[1]}`);
    const seq = [3, 5, 5, 5, 9];
    expect(wordLobbyId(() => seq.shift()!)).toBe(`${LOBBY_ADJECTIVES[3]}-${LOBBY_NOUNS[5]}-${LOBBY_NOUNS[9]}`);
  });
});

describe('wordLobbyName', () => {
  it('is "Adjective Noun" and passes the lobby name schema', () => {
    for (let i = 0; i < 500; i++) {
      const name = wordLobbyName();
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(CreateLobbyRequest.parse({ name, maxPlayers: 8 }).name).toBe(name);
    }
    expect(wordLobbyName(() => 0)).toBe(`${LOBBY_ADJECTIVES[0][0]!.toUpperCase()}${LOBBY_ADJECTIVES[0].slice(1)} ${LOBBY_NOUNS[0][0]!.toUpperCase()}${LOBBY_NOUNS[0].slice(1)}`);
  });
});

describe('ids: old and new formats', () => {
  it('old random ids are still accepted and keep their case', () => {
    for (const old of ['JLB7GxxaZK', '1cfV95aQuK', 'abcd1234', 'AbCdEf1234', 'a_b-C_d-9']) {
      expect(old).toMatch(LOBBY_ID_RE);
      expect(`/lobby/${old}`).toMatch(ROUTE_RE);
      expect(old).not.toMatch(WORD_LOBBY_ID_RE);
      expect(normalizeLobbyId(old)).toBe(old);
    }
  });

  it('word ids are case-insensitive; junk is left for the regex to reject', () => {
    expect(normalizeLobbyId('Amber-Fox-LANTERN')).toBe('amber-fox-lantern');
    expect(normalizeLobbyId('amber-fox')).toBe('amber-fox');
    expect(normalizeLobbyId('amber-fox-lantern-x')).toBe('amber-fox-lantern-x');
    expect(normalizeLobbyId('bad$id')).toBe('bad$id');
    expect('bad$id').not.toMatch(LOBBY_ID_RE);
  });
});
