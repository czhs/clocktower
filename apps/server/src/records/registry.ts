// OWNED BY records. Process-local lookups: the recorder of a GameModule instance (without changing
// the lead-owned GameModule interface) and one RecordsRepo per open database.
import { createRecordsRepo, type Database, type RecordsRepo } from '@ct/db';
import type { GameRecorder } from './recorder.js';

const recorders = new WeakMap<object, GameRecorder>();
const repos = new WeakMap<Database, RecordsRepo>();

/** Called by the game module when a game starts (a rematch creates a new module + recorder). */
export function attachRecorder(game: object, recorder: GameRecorder): void {
  recorders.set(game, recorder);
}

export function recorderOf(game: object | null | undefined): GameRecorder | null {
  return game ? (recorders.get(game) ?? null) : null;
}

export function recordsRepo(database: Database): RecordsRepo {
  let r = repos.get(database);
  if (!r) {
    r = createRecordsRepo(database);
    repos.set(database, r);
  }
  return r;
}
