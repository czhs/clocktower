// OWNED BY records. Unit tests: the records repo (write-once, listing, pamphlet append), the
// summary+record transaction (both or neither), the engine-log diff, and the GameRecorder driven
// directly by the rules engine (undo, Scarlet Woman, star-pass, Storyteller kill causes).
import { createStatsRepo, openDatabase } from '@ct/db';
import type { CharacterId, StCommand } from '@ct/protocol';
import { applyStCommand, createGame, mulberry32, type GameState } from '@ct/rules';
import { describe, expect, it } from 'vitest';
import { buildGameRecord, diffLog, GameRecorder, recordsRepo, writeFinished, type GameRecordV1, type MatchMeta } from '../src/records/index.js';

const row = (matchId: string, endedAt: number, extra: Partial<{ accountId: string; st: string }> = {}) => ({
  matchId,
  lobbyId: 'lob1',
  version: 1,
  status: 'finished' as const,
  startedAt: endedAt - 1000,
  endedAt,
  winner: 'good' as const,
  playerCount: 1,
  storytellerAccountId: extra.st ?? 'st-acc',
  record: { matchId, storyteller: { displayName: 'Sto' }, lobby: { name: 'L' }, result: { reason: 'r' }, script: 'trouble-brewing', seats: [{ accountId: extra.accountId ?? 'acc-a' }], pamphlets: [] },
});

describe('records repo', () => {
  it('writes once, lists newest first (paging + account filter), appends pamphlets', () => {
    const db = openDatabase(':memory:');
    const repo = recordsRepo(db);
    expect(recordsRepo(db)).toBe(repo); // cached per database
    expect(repo.saveRecord(row('m1', 1000))).toBe(true);
    expect(repo.saveRecord({ ...row('m1', 5000), status: 'abandoned' })).toBe(false); // idempotent: first write wins
    expect(repo.getSummary('m1')).toMatchObject({ status: 'finished', endedAt: 1000, storytellerName: 'Sto', lobbyName: 'L', reason: 'r', script: 'trouble-brewing' });
    repo.saveRecord(row('m2', 2000, { accountId: 'acc-b' }));
    repo.saveRecord(row('m3', 3000, { st: 'acc-b' }));
    expect(repo.listRecords().map((r) => r.matchId)).toEqual(['m3', 'm2', 'm1']);
    expect(repo.listRecords({ limit: 1 }).map((r) => r.matchId)).toEqual(['m3']);
    expect(repo.listRecords({ before: 3000 }).map((r) => r.matchId)).toEqual(['m2', 'm1']);
    expect(repo.listRecords({ accountId: 'acc-b' }).map((r) => r.matchId)).toEqual(['m3', 'm2']);
    expect(repo.listRecords({ accountId: "x' OR 1=1 --" })).toEqual([]);
    expect(repo.appendPamphlet('m1', { id: 'p1' })).toBe(true);
    expect(repo.appendPamphlet('nope', { id: 'p1' })).toBe(false);
    expect((repo.getRecord('m1') as { pamphlets: unknown[] }).pamphlets).toEqual([{ id: 'p1' }]);
    expect(repo.getRecord('nope')).toBeNull();
    expect(repo.count()).toBe(3);
    db.close();
  });

  it('the stats summary and the record are written in one transaction (both or neither)', () => {
    const db = openDatabase(':memory:');
    const stats = createStatsRepo(db);
    const start = { matchId: 'mx', lobbyId: 'l', script: 'trouble-brewing', startedAt: 1, storytellerAccountId: null, players: [] };
    stats.recordMatchStarted(start);
    const summary = () => stats.recordMatchFinished({ ...start, endedAt: 2, winner: 'good', reason: 'r', players: [] });
    const good = { matchId: 'mx', lobbyId: 'l', version: 1, status: 'finished', startedAt: 1, endedAt: 2, result: { winner: 'good' }, seats: [], storyteller: null } as unknown as GameRecordV1;
    const broken = { ...good, bad: BigInt(1) } as unknown as GameRecordV1; // JSON.stringify throws mid-transaction
    expect(() => writeFinished(db, broken, summary)).toThrow();
    expect(db.sqlite.prepare('SELECT ended_at FROM matches WHERE id = ?').get('mx')).toEqual({ ended_at: null }); // rolled back
    expect(recordsRepo(db).getRecord('mx')).toBeNull();
    expect(writeFinished(db, good, summary)).toBe(true); // the retry writes both
    expect(db.sqlite.prepare('SELECT ended_at FROM matches WHERE id = ?').get('mx')).toEqual({ ended_at: 2 });
    expect(recordsRepo(db).getSummary('mx')).toMatchObject({ winner: 'good', status: 'finished' });
    expect(writeFinished(db, good, summary)).toBe(false); // idempotent
    db.close();
  });
});

describe('diffLog', () => {
  const L = (...xs: string[]) => xs.map((text, i) => ({ at: i, text }));
  it('handles appends, front trimming and undo truncation', () => {
    expect(diffLog(L('a', 'b'), L('a', 'b', 'c'))).toEqual({ added: [{ at: 2, text: 'c' }], removedTail: 0 });
    expect(diffLog(L('a', 'b', 'c'), L('a', 'b', 'c').slice(1).concat({ at: 9, text: 'd' }))).toEqual({ added: [{ at: 9, text: 'd' }], removedTail: 0 });
    expect(diffLog(L('a', 'b', 'c'), [...L('a'), { at: 7, text: 'undid' }])).toEqual({ added: [{ at: 7, text: 'undid' }], removedTail: 2 });
    expect(diffLog(L('a'), [{ at: 5, text: 'z' }])).toEqual({ added: [{ at: 5, text: 'z' }], removedTail: 0 });
  });
});

describe('GameRecorder (engine-driven)', () => {
  function setup(chars: CharacterId[]) {
    let now = 1_000;
    const s: GameState = createGame({ players: chars.map((_, seat) => ({ pid: `p${seat}`, seat, name: `P${seat + 1}` })), rng: mulberry32(7), now });
    const rec = new GameRecorder(s, now, 'st');
    const run = (cmd: StCommand) => {
      now += 1000;
      const r = applyStCommand(s, cmd, { now });
      if (!r.ok) throw new Error(`${cmd.type}: ${r.error}`);
      rec.observe(s, now, { kind: 'st', cmd });
    };
    run({ type: 'assign_characters', assignments: chars.map((character, seat) => ({ seat, character })), demonBluffs: [], allowNonstandard: true });
    run({ type: 'begin_first_night' });
    return { s, rec, run };
  }
  const meta = (n: number): MatchMeta => ({
    matchId: 'm',
    lobbyId: 'l',
    script: 'trouble-brewing',
    lobbyName: 'L',
    maxPlayers: 15,
    startedAt: 1000,
    storyteller: { pid: 'st', accountId: 'acc-st', displayName: 'Sto', label: 'Sto' },
    players: Array.from({ length: n }, (_, seat) => ({ pid: `p${seat}`, accountId: `acc-${seat}`, displayName: `P${seat + 1}`, label: `P${seat + 1}`, seat, avatarId: null })),
  });

  it('undo marks what the undone command produced (death, timeline) and says what was undone', () => {
    const { s, rec, run } = setup(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    run({ type: 'kill', seat: 2, cause: 'struck by lightning', announce: false });
    expect(rec.deaths).toMatchObject([{ seat: 2, cause: 'storyteller', note: 'struck by lightning', night: 1 }]);
    expect(rec.timeline.at(-1)!.text).toBe('The Storyteller killed P3 (Chef): struck by lightning.');
    run({ type: 'undo_last' });
    expect(s.players[2]!.alive).toBe(true);
    expect(rec.deaths[0]!.undone).toBe(true);
    expect(rec.timeline.find((e) => e.kind === 'death')!.undone).toBe(true);
    expect(rec.timeline.at(-1)!.text).toBe('The Storyteller undid: kill (P3).');
    expect(rec.timeline.some((e) => e.kind === 'revival')).toBe(false); // the undo is not a revival
    expect(rec.log.some((l) => l.undone && /died: storyteller/.test(l.text))).toBe(true);
    const r = buildGameRecord(meta(7), rec, { status: 'abandoned', endedAt: 99_000, abandonReason: 'idle_timeout' });
    expect(r.seats[2]).toMatchObject({ aliveAtEnd: true, death: null, won: null });
    expect(r.abandon).toMatchObject({ reason: 'idle_timeout', phase: 'first_night' });
  });

  it('Scarlet Woman and star-pass successions are attributed', () => {
    const { s, rec, run } = setup(['imp', 'scarlet_woman', 'poisoner', 'chef', 'empath', 'monk', 'soldier']);
    run({ type: 'advance_phase', to: 'day' });
    run({ type: 'execute', seat: 0 });
    expect(rec.roleChanges).toMatchObject([{ seat: 1, from: 'scarlet_woman', to: 'imp', cause: 'scarlet_woman' }]);
    expect(rec.timeline.map((e) => e.text)).toEqual(
      expect.arrayContaining(['P1 (Imp) was executed.', 'The Demon died: P2 (Scarlet Woman) became the Imp.']),
    );
    run({ type: 'advance_phase', to: 'night' });
    const imp = s.nightQueue.find((x) => x.kind === 'imp')!;
    run({ type: 'resolve_step', stepId: imp.id, seats: [1], starpassSeat: 2 });
    expect(rec.deaths.map((d) => [d.seat, d.cause])).toEqual([
      [0, 'execution'],
      [1, 'starpass'],
    ]);
    expect(rec.roleChanges.at(-1)).toMatchObject({ seat: 2, from: 'poisoner', to: 'imp', cause: 'starpass' });
    expect(rec.nightSteps.get(imp.id)).toMatchObject({ status: 'resolved', storytellerInput: { seats: [1], starpassSeat: 2 } });
    const texts = rec.timeline.map((e) => e.text);
    expect(texts).toContain('P2 (Imp) killed themself (star-pass).');
    expect(texts).toContain('Star-pass: P3 (Poisoner) became the Imp.');
    const r = buildGameRecord(meta(7), rec, { status: 'abandoned', endedAt: 99_000 });
    expect(r.seats[2]).toMatchObject({ startingCharacter: 'poisoner', finalCharacter: 'imp', finalAlignment: 'evil' });
    expect(r.seats[1]!.death).toMatchObject({ cause: 'starpass', night: 2 });
    expect(r.nightRecords.map((n) => n.night)).toEqual([1, 2]);
  });
});
