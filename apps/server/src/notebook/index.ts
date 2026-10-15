// OWNED BY notebook. Private per-game notebooks: one per (matchId, accountId), for every member of
// the running/finished game — each player and the Storyteller (a scratchpad next to the Grimoire).
//
// Privacy (the point of this module):
//   * the ONLY outbound path is `send(owner pid, ...)` to the member whose account owns the
//     notebook; nothing is broadcast, put in a view/snapshot, a match record, stats or admin API;
//   * the key is the member's ACCOUNT id taken from the server-side seat (never from the payload),
//     so the notebook follows the person across refresh / reconnect / device switch, and nobody can
//     read or write someone else's;
//   * log lines carry only pid / rev / byte size / reason — never notebook content (and never
//     account ids, per the logging rules).
//
// Lifecycle: the GameRoom passes its current matchId (null while waiting). A save or load for any
// other match is refused with 'notebook:unavailable' {reason:'no_game'}; a new game is a new
// matchId, so every new game starts with a fresh, empty notebook while old ones stay stored.
//
// Concurrency: "newer rev wins" (see packages/protocol/src/notebook.ts). The newest-connection-wins
// device policy means at most one live connection per account, so a conflict is the case of an
// older device coming back with edits based on an outdated rev: it gets cause 'newer' + the stored copy.
import {
  EMPTY_NOTEBOOK,
  NotebookData,
  notebookBytes,
  type C2SParsed,
  type NotebookDataMsg,
  type NotebookUnavailableMsg,
} from '@ct/protocol';
import { createNotebooksRepo, type Database, type NotebooksRepo } from '@ct/db';
import { RateLimiter, type BucketSpec } from '../auth/rateLimit.js';
import type { Logger } from '../rooms/modules.js';

/** Saves: burst 10, then one every 2 s (the client debounces ~1 s and keeps one save in flight). */
export const NOTEBOOK_SAVE_LIMIT: BucketSpec = { capacity: 10, refillPerSec: 0.5 };
/** Loads: burst 6, then one every 5 s. */
export const NOTEBOOK_LOAD_LIMIT: BucketSpec = { capacity: 6, refillPerSec: 0.2 };
/** Retry hint after a storage failure. */
const BUSY_RETRY_MS = 5000;

/** The member fields this module needs (a subset of RoomMember, taken from the server-side seat). */
export interface NotebookOwner {
  pid: string;
  accountId: string;
}

export type NotebookStore = Pick<NotebooksRepo, 'get' | 'putIfNewer'>;

export interface NotebookServiceOptions {
  store: NotebookStore;
  log: Logger;
  /** Deliver to ONE member (the owner). The GameRoom's per-seat send. */
  send<T extends 'notebook:data' | 'notebook:unavailable'>(pid: string, type: T, payload: T extends 'notebook:data' ? NotebookDataMsg : NotebookUnavailableMsg): void;
  now?: () => number;
  limits?: { save?: BucketSpec; load?: BucketSpec };
}

export type NotebookService = ReturnType<typeof createNotebookService>;

export function createNotebookService(opts: NotebookServiceOptions) {
  const now = opts.now ?? Date.now;
  const saveLimit = new RateLimiter(opts.limits?.save ?? NOTEBOOK_SAVE_LIMIT, 2000);
  const loadLimit = new RateLimiter(opts.limits?.load ?? NOTEBOOK_LOAD_LIMIT, 2000);

  const unavailable = (pid: string, reason: NotebookUnavailableMsg['reason'], retryInMs: number | null) =>
    opts.send(pid, 'notebook:unavailable', { reason, retryInMs });

  /** The owner's stored notebook for this match (validated), or a fresh empty one. */
  const read = (matchId: string, owner: NotebookOwner): { rev: number; data: NotebookData; savedAt: number | null } => {
    const row = opts.store.get(matchId, owner.accountId);
    if (!row) return { rev: 0, data: EMPTY_NOTEBOOK, savedAt: null };
    const parsed = NotebookData.safeParse(row.data);
    if (!parsed.success) opts.log.warn('notebook: stored copy failed validation; serving empty', { pid: owner.pid, rev: row.rev });
    return { rev: row.rev, data: parsed.success ? parsed.data : EMPTY_NOTEBOOK, savedAt: row.updatedAt };
  };

  const deliver = (owner: NotebookOwner, matchId: string, cause: NotebookDataMsg['cause']) => {
    let nb: ReturnType<typeof read>;
    try {
      nb = read(matchId, owner);
    } catch (e) {
      opts.log.error('notebook: load failed', { pid: owner.pid, err: errMsg(e) });
      return unavailable(owner.pid, 'busy', BUSY_RETRY_MS);
    }
    opts.send(owner.pid, 'notebook:data', { matchId, rev: nb.rev, data: nb.data, savedAt: nb.savedAt, cause });
  };

  const retryIn = (limiter: RateLimiter, key: string) => Math.max(1000, limiter.retryAfterSec(key, now()) * 1000);

  return {
    /**
     * Push the owner's notebook (join / reconnect). No-op without a game. `fresh` = the game just
     * started: the notebook is necessarily empty (new matchId), so no storage read is needed.
     */
    deliver(owner: NotebookOwner, matchId: string | null, fresh = false) {
      if (!matchId) return;
      if (fresh) return opts.send(owner.pid, 'notebook:data', { matchId, rev: 0, data: EMPTY_NOTEBOOK, savedAt: null, cause: 'load' });
      deliver(owner, matchId, 'load');
    },

    /** C2S 'notebook:load' / 'notebook:save' from `owner` (already schema-validated by the room). */
    handle(owner: NotebookOwner, currentMatchId: string | null, type: 'notebook:load' | 'notebook:save', msg: C2SParsed<'notebook:load'> | C2SParsed<'notebook:save'>) {
      if (type === 'notebook:load') {
        if (!loadLimit.take(owner.accountId, now())) return unavailable(owner.pid, 'rate_limited', retryIn(loadLimit, owner.accountId));
        if (!currentMatchId) return unavailable(owner.pid, 'no_game', null);
        return deliver(owner, currentMatchId, 'load');
      }
      const save = msg as C2SParsed<'notebook:save'>;
      if (!currentMatchId || save.matchId !== currentMatchId) return unavailable(owner.pid, 'no_game', null);
      if (!saveLimit.take(owner.accountId, now())) return unavailable(owner.pid, 'rate_limited', retryIn(saveLimit, owner.accountId));
      const at = now();
      let result: ReturnType<NotebookStore['putIfNewer']>;
      try {
        result = opts.store.putIfNewer(currentMatchId, owner.accountId, save.rev, save.data, at);
      } catch (e) {
        opts.log.error('notebook: save failed', { pid: owner.pid, rev: save.rev, bytes: notebookBytes(save.data), err: errMsg(e) });
        return unavailable(owner.pid, 'busy', BUSY_RETRY_MS);
      }
      if (result.ok) {
        opts.send(owner.pid, 'notebook:data', { matchId: currentMatchId, rev: save.rev, data: save.data, savedAt: at, cause: 'saved' });
        return;
      }
      opts.log.info('notebook: stale save refused (newer copy stored)', { pid: owner.pid, rev: save.rev, storedRev: result.current.rev });
      deliver(owner, currentMatchId, 'newer');
    },

    /** Forget a member's rate-limit buckets (optional housekeeping). */
    forget(owner: NotebookOwner) {
      saveLimit.delete(owner.accountId);
      loadLimit.delete(owner.accountId);
    },
  };
}

/** Repositories are cheap but hold prepared statements: one per Database. */
const repos = new WeakMap<Database, NotebooksRepo>();
export function notebookStoreFor(database: Database): NotebooksRepo {
  let r = repos.get(database);
  if (!r) repos.set(database, (r = createNotebooksRepo(database)));
  return r;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
