// OWNED BY notebook. Binds the pure notebook reducer (model.ts) to a RoomConnection: listens for
// 'notebook:data' / 'notebook:unavailable', asks for the notebook on mount and after every
// reconnect, and autosaves (debounced, one save in flight, paused while offline, resumes by
// itself). One controller per connection, created on first use and kept for the connection's
// lifetime, so closing the drawer never loses an edit.
import type { C2SPayload, C2SType, NotebookDataMsg, NotebookUnavailableMsg } from '@ct/protocol';
import { createStore, type Store } from '../../net/store';
import { initialNotebook, nextSave, reduce, type NotebookAction, type NotebookEdit, type NotebookState } from './model';

/** Save this long after the last keystroke… */
export const SAVE_DEBOUNCE_MS = 900;
/** …but at least this often while someone types without pausing. */
export const SAVE_MAX_WAIT_MS = 4000;

/** What the controller needs from a RoomConnection (a fake in tests). */
export interface NotebookConn {
  events: {
    on(type: 'notebook:data', fn: (m: NotebookDataMsg) => void): () => void;
    on(type: 'notebook:unavailable', fn: (m: NotebookUnavailableMsg) => void): () => void;
  };
  status: Store<'connecting' | 'open' | 'reconnecting' | 'closed'>;
  send<T extends C2SType>(type: T, payload: C2SPayload<T>): void;
}

export interface NotebookController {
  state: Store<NotebookState>;
  edit(e: NotebookEdit): void;
  keepMine(): void;
  dismissNotice(): void;
  /** Ask the server for the notebook (no-op while offline). */
  load(): void;
  /** Save now if anything is pending (e.g. when the drawer closes / the page hides). */
  flush(): void;
  /** No game any more (lobby back to waiting): forget the old match's notebook. */
  reset(): void;
  dispose(): void;
}

export interface ControllerTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realTimers: ControllerTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createNotebookController(conn: NotebookConn, timers: ControllerTimers = realTimers): NotebookController {
  const state = createStore<NotebookState>(initialNotebook());
  let timer: unknown = null;
  let firstDirtyAt = 0;
  let loadRetry: unknown = null;

  const dispatch = (a: NotebookAction) => {
    const next = reduce(state.get(), a);
    if (next !== state.get()) state.set(next);
  };

  const trySave = () => {
    timer = null;
    const s = state.get();
    if (conn.status.get() !== 'open') return; // never let the room queue a stale 20 KB save
    const save = nextSave(s, timers.now());
    if (!save) {
      if (s.dirty && !s.inflight && s.retryAt > timers.now()) schedule(s.retryAt - timers.now());
      return;
    }
    firstDirtyAt = 0;
    dispatch({ type: 'sent', rev: save.rev, json: save.json });
    conn.send('notebook:save', { matchId: save.matchId, rev: save.rev, data: save.data });
  };

  const schedule = (ms: number) => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(trySave, Math.max(0, ms));
  };

  /** Debounce after an edit, capped by SAVE_MAX_WAIT_MS since the first unsaved edit. */
  const scheduleAfterEdit = () => {
    const now = timers.now();
    if (!firstDirtyAt) firstDirtyAt = now;
    schedule(Math.min(SAVE_DEBOUNCE_MS, firstDirtyAt + SAVE_MAX_WAIT_MS - now));
  };

  const load = () => {
    if (conn.status.get() === 'open') conn.send('notebook:load', {});
  };

  const offs = [
    conn.events.on('notebook:data', (msg) => {
      if (loadRetry !== null) timers.clearTimeout(loadRetry);
      loadRetry = null;
      dispatch({ type: 'server', msg });
      // Our ack may have arrived after more typing: keep going.
      const s = state.get();
      if (s.dirty && !s.inflight) scheduleAfterEdit();
    }),
    conn.events.on('notebook:unavailable', (msg) => {
      dispatch({ type: 'unavailable', msg, now: timers.now() });
      if (msg.reason === 'no_game') return;
      const wait = Math.max(1000, msg.retryInMs ?? 3000);
      if (!state.get().loaded) {
        if (loadRetry !== null) timers.clearTimeout(loadRetry);
        loadRetry = timers.setTimeout(() => ((loadRetry = null), load()), wait);
      } else schedule(wait);
    }),
    conn.status.subscribe((st) => {
      const online = st === 'open';
      if (online === state.get().online) return;
      dispatch({ type: 'online', online });
      if (online) {
        load(); // the server also pushes it on reattach; the reducer copes with both
        if (state.get().dirty) schedule(SAVE_DEBOUNCE_MS);
      }
    }),
  ];
  if (conn.status.get() !== 'open') dispatch({ type: 'online', online: false });

  const flushHidden = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') trySave();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', flushHidden);

  return {
    state,
    edit(e) {
      const before = state.get();
      dispatch({ type: 'edit', edit: e });
      if (state.get() !== before) scheduleAfterEdit();
    },
    keepMine() {
      dispatch({ type: 'keepMine' });
      schedule(0);
    },
    dismissNotice: () => dispatch({ type: 'dismissNotice' }),
    load,
    flush: () => trySave(),
    reset: () => dispatch({ type: 'noGame' }),
    dispose() {
      for (const off of offs) off();
      if (timer !== null) timers.clearTimeout(timer);
      if (loadRetry !== null) timers.clearTimeout(loadRetry);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', flushHidden);
    },
  };
}

/** One controller per connection, shared by every mount of the notebook UI. */
const controllers = new WeakMap<object, NotebookController>();
export function notebookFor(conn: NotebookConn): NotebookController {
  let c = controllers.get(conn);
  if (!c) {
    c = createNotebookController(conn);
    controllers.set(conn, c);
  }
  return c;
}
