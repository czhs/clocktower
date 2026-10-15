// OWNED BY records. Game records: a full, durable, versioned record of every game (finished or
// abandoned) for future stats, plus the Storyteller's story / pamphlets. Spec: docs/game-records.md.
//
// Seams:
//   * apps/server/src/game/index.ts creates a GameRecorder at start() and calls observe() from
//     commit() (and after world "props") with the trigger; the recorder diffs the engine state.
//   * apps/server/src/rooms/GameRoom.ts freezes MatchMeta at start, writes the record in the SAME
//     transaction as the stats summary when the game finishes (writeFinished), writes an
//     'abandoned' record when the room is disposed mid-game, and routes story:* messages.
import type { Database } from '@ct/db';
import type { Logger } from '../rooms/modules.js';
import { buildGameRecord, recordRow, type BuildOptions, type MatchMeta } from './build.js';
import { recorderOf, recordsRepo } from './registry.js';
import type { GameRecordV1 } from './types.js';

export * from './types.js';
export { GameRecorder, diffLog, type PublicItem, type RecordTrigger } from './recorder.js';
export { attachRecorder, recorderOf, recordsRepo } from './registry.js';
export { buildGameRecord, recordRow, type BuildOptions, type MatchMeta } from './build.js';
export { buildDayPamphlet, buildFinalPamphlet, handleStoryMessage, storytellerView } from './story.js';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Builds the record defensively: a recorder bug must never cost the game its summary/record. */
export function buildRecordSafely(meta: MatchMeta, game: object | null, o: BuildOptions, log: Logger): GameRecordV1 {
  try {
    return buildGameRecord(meta, recorderOf(game), o);
  } catch (e) {
    log.error('building the game record failed; saving a minimal record', { matchId: meta.matchId, err: errMsg(e) });
    const r = buildGameRecord(meta, null, o);
    r.warnings.push(`record assembly failed: ${errMsg(e)}`);
    return r;
  }
}

/**
 * A finished game: the stats summary (`writeSummary`, e.g. stats.recordMatchFinished) and the full
 * record are written in ONE SQLite transaction — both or neither (a failure leaves both unwritten,
 * so the room can retry). Returns writeSummary's result.
 */
export function writeFinished<T>(database: Database, record: GameRecordV1, writeSummary: () => T): T {
  const repo = recordsRepo(database);
  return database.sqlite.transaction(() => {
    const out = writeSummary();
    repo.saveRecord(recordRow(record));
    return out;
  })();
}

/** An abandoned game (no summary to finalise). Returns false if this match already had a record. */
export function writeAbandoned(database: Database, record: GameRecordV1): boolean {
  return recordsRepo(database).saveRecord(recordRow(record));
}
