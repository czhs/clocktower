import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  LOBBY_DESCRIPTION_MAX,
  LOBBY_NAME_MAX,
  LOBBY_NAME_MIN,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCRIPTS,
  type LobbySummary,
  type ScriptId,
  type StorytellerMode,
} from '@ct/protocol';
import { api, subscribeDirectory } from '../../net/api';
import { modeOf } from '../clock/logic';
import { ModeBadge, ModeChoice } from './ModeSettings';
import { applyDirectoryEvent, DEFAULT_FILTERS, errorText, filterLobbies, PHASE_LABEL, SCRIPT_LABEL, sortLobbies, type FinderFilters } from './finder';

const FILTER_KEY = 'ct.finder.filters';

function loadFilters(): FinderFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<FinderFilters>) };
  } catch {
    // storage unavailable
  }
  return DEFAULT_FILTERS;
}

/** Approximate round-trip to this game server (all lobbies are hosted here). */
function usePing(): number | null {
  const [ping, setPing] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const measure = async () => {
      const t0 = performance.now();
      try {
        await fetch('/healthz', { cache: 'no-store' });
        if (alive) setPing(Math.round(performance.now() - t0));
      } catch {
        if (alive) setPing(null);
      }
    };
    void measure();
    const id = setInterval(measure, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return ping;
}

export function LobbyFinder({ onJoin }: { onJoin: (lobbyId: string, intent: 'player' | 'storyteller') => void }) {
  const [lobbies, setLobbies] = useState<Map<string, LobbySummary>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<FinderFilters>(loadFilters);
  const [creating, setCreating] = useState(false);
  const ping = usePing();

  useEffect(() => {
    let alive = true;
    api
      .listLobbies()
      .then(({ lobbies: l }) => {
        if (!alive) return;
        setLobbies((prev) => (prev.size ? prev : new Map(l.map((x) => [x.id, x]))));
        setLoaded(true);
        setLoadError(null);
      })
      .catch((e: unknown) => alive && setLoadError(errorText(e)));
    const off = subscribeDirectory((e) => {
      if (!alive) return;
      setLobbies((prev) => applyDirectoryEvent(prev, e));
      if (e.type === 'snapshot') {
        setLoaded(true);
        setLoadError(null);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [attempt]);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ ...filters, search: '' }));
    } catch {
      // ignore
    }
  }, [filters]);

  const shown = useMemo(() => sortLobbies(filterLobbies(lobbies.values(), filters)), [lobbies, filters]);
  const set = <K extends keyof FinderFilters>(k: K, v: FinderFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <section class="panel ct-finder">
      <header class="ct-finder-head">
        <div>
          <h2>Lobby finder</h2>
          <span class="muted ct-live">
            <span class="ct-dot" /> live · {lobbies.size} {lobbies.size === 1 ? 'lobby' : 'lobbies'}
            {ping !== null && ` · ~${ping} ms`}
          </span>
        </div>
        <button class="primary" onClick={() => setCreating(true)}>
          Create lobby
        </button>
      </header>

      <div class="ct-finder-filters">
        <input
          type="search"
          placeholder="Search by name"
          value={filters.search}
          maxLength={60}
          onInput={(e) => set('search', (e.currentTarget as HTMLInputElement).value)}
          aria-label="Search lobbies by name"
        />
        <select value={filters.status} onChange={(e) => set('status', (e.currentTarget as HTMLSelectElement).value as FinderFilters['status'])} aria-label="Status">
          <option value="waiting">Waiting</option>
          <option value="all">All</option>
        </select>
        <select value={filters.size} onChange={(e) => set('size', (e.currentTarget as HTMLSelectElement).value as FinderFilters['size'])} aria-label="Lobby size">
          <option value="any">Any size</option>
          <option value="small">5–8 seats</option>
          <option value="medium">9–12 seats</option>
          <option value="large">13–15 seats</option>
        </select>
        <select
          value={String(filters.minPlayers)}
          onChange={(e) => set('minPlayers', Number((e.currentTarget as HTMLSelectElement).value))}
          aria-label="Minimum players"
        >
          <option value="0">Any players</option>
          <option value="1">1+ players</option>
          <option value="3">3+ players</option>
          <option value="5">5+ players</option>
          <option value="10">10+ players</option>
        </select>
        <select value={filters.script} onChange={(e) => set('script', (e.currentTarget as HTMLSelectElement).value as FinderFilters['script'])} aria-label="Script">
          <option value="any">Any script</option>
          {SCRIPTS.map((s) => (
            <option key={s} value={s}>
              {SCRIPT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div class="ct-lobby-list" role="list">
        {!loaded && !loadError && (
          <p class="muted ct-empty" role="status">
            <span class="ct-spinner" aria-hidden="true" />
            Loading lobbies…
          </p>
        )}
        {loadError && (
          <div class="ct-empty ct-load-error" role="alert">
            <p class="ct-error">Couldn't load lobbies: {loadError}</p>
            <button onClick={() => (setLoadError(null), setAttempt((a) => a + 1))}>Try again</button>
          </div>
        )}
        {loaded && shown.length === 0 && (
          <p class="muted ct-empty">
            {lobbies.size === 0 ? (
              <>
                No lobbies yet. <button class="ct-link" onClick={() => setCreating(true)}>Create the first one</button> and share its link.
              </>
            ) : (
              <>
                No lobbies match these filters.{' '}
                <button class="ct-link" onClick={() => setFilters({ ...DEFAULT_FILTERS, status: 'all' })}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        )}
        {shown.map((l) => (
          <LobbyRow key={l.id} lobby={l} onJoin={onJoin} />
        ))}
      </div>

      {creating && (
        <CreateLobbyModal
          onClose={() => setCreating(false)}
          onCreated={(l, takeSt) => {
            setCreating(false);
            onJoin(l.id, takeSt ? 'storyteller' : 'player');
          }}
        />
      )}
    </section>
  );
}

function LobbyRow({ lobby: l, onJoin }: { lobby: LobbySummary; onJoin: (id: string, intent: 'player' | 'storyteller') => void }) {
  const waiting = l.phase === 'waiting';
  const auto = modeOf(l) === 'auto';
  return (
    <div class={`ct-lobby ${l.joinable ? '' : 'ct-lobby-closed'}`} role="listitem">
      <div class="ct-lobby-main">
        <div class="ct-lobby-name">
          {l.name}
          <span class={`ct-phase ct-phase-${l.phase}`}>{PHASE_LABEL[l.phase]}</span>
          <ModeBadge lobby={l} />
        </div>
        {l.description && <div class="ct-lobby-desc muted">{l.description}</div>}
        <div class="ct-lobby-meta muted">
          <span title="Players seated / seats">
            {l.playerCount}/{l.maxPlayers} players
          </span>
          <span>{auto ? 'No Storyteller: runs itself' : l.storytellerName ? `Storyteller: ${l.storytellerName}` : 'Storyteller seat open'}</span>
          <span>{SCRIPT_LABEL[l.script] ?? l.script}</span>
          <span>Host: {l.hostName}</span>
        </div>
      </div>
      <div class="ct-lobby-actions">
        {waiting ? (
          <>
            <button class="primary" disabled={!l.joinable} onClick={() => onJoin(l.id, 'player')}>
              {l.joinable ? 'Join' : 'Full'}
            </button>
            {l.storytellerSeatOpen && !auto && <button onClick={() => onJoin(l.id, 'storyteller')}>Join as Storyteller</button>}
          </>
        ) : (
          <button title="Only players seated in this game can return" onClick={() => onJoin(l.id, 'player')}>
            Rejoin my seat
          </button>
        )}
      </div>
    </div>
  );
}

export function CreateLobbyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: LobbySummary, takeStoryteller: boolean) => void }) {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [script, setScript] = useState<ScriptId>('trouble-brewing');
  const [description, setDescription] = useState('');
  const [takeSt, setTakeSt] = useState(true);
  const [mode, setMode] = useState<StorytellerMode>('human');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (name.trim().length < LOBBY_NAME_MIN) return setError(`Name must be at least ${LOBBY_NAME_MIN} characters`);
    setBusy(true);
    setError(null);
    try {
      const st = mode === 'human' && takeSt;
      const { lobby } = await api.createLobby({ name: name.trim(), maxPlayers, script, description: description.trim(), takeStoryteller: st, ...(mode === 'auto' ? { storytellerMode: 'auto' as const } : {}) });
      onCreated(lobby, st);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div class="ct-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form class="panel ct-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ct-create-title">
        <h2 id="ct-create-title">Create lobby</h2>
        <label class="ct-field">
          <span>Lobby name</span>
          <input value={name} maxLength={LOBBY_NAME_MAX} autoFocus onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="ct-modal-grid">
          <label class="ct-field">
            <span>Player seats ({MIN_PLAYERS}–{MAX_PLAYERS})</span>
            <select value={String(maxPlayers)} onChange={(e) => setMaxPlayers(Number((e.currentTarget as HTMLSelectElement).value))}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
                <option key={n} value={n}>
                  {n} players
                </option>
              ))}
            </select>
          </label>
          <label class="ct-field">
            <span>Script</span>
            <select value={script} onChange={(e) => setScript((e.currentTarget as HTMLSelectElement).value as ScriptId)}>
              {SCRIPTS.map((s) => (
                <option key={s} value={s}>
                  {SCRIPT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label class="ct-field">
          <span>Description (optional)</span>
          <textarea
            rows={3}
            value={description}
            maxLength={LOBBY_DESCRIPTION_MAX}
            onInput={(e) => setDescription((e.currentTarget as HTMLTextAreaElement).value)}
          />
        </label>
        <div class="ct-field">
          <span>Who runs the game?</span>
          <ModeChoice value={mode} onChange={setMode} name="ct-create-mode" />
        </div>
        {mode === 'human' ? (
          <label class="ct-check">
            <input type="checkbox" checked={takeSt} onChange={(e) => setTakeSt((e.currentTarget as HTMLInputElement).checked)} />
            <span>Take the Storyteller seat (not counted as a player)</span>
          </label>
        ) : (
          <p class="muted ct-small">You play too. Adjust the day and night timings in the waiting room.</p>
        )}
        <p class="muted ct-small">Lobbies are public on this server — anyone signed in can see and join. No password needed.</p>
        {error && <p class="ct-error" role="alert">{error}</p>}
        <div class="ct-row">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
