import { useEffect, useMemo, useState } from 'preact/hooks';
import { SCRIPTS, type LobbySummary } from '@ct/protocol';
import { api, subscribeDirectory } from '../../net/api';
import { lazyComponent, whenIdle } from '../common/lazy';
import { modeOf } from '../clock/logic';
import { ModeBadge, WorldBadge } from './ModeSettings';
import { applyDirectoryEvent, DEFAULT_FILTERS, errorText, filterLobbies, PHASE_LABEL, SCRIPT_LABEL, sortLobbies, type FinderFilters } from './finder';

// (v3 WP6, perf) The create dialog is its own lazy chunk (fetched on idle, so the click stays instant): the
// lobby-name word list, the Town / mode choices and their long copy stay out of the entry chunk.
const CreateLobbyModal = lazyComponent(
  () => import('./CreateLobbyModal').then((m) => m.CreateLobbyModal),
  (failed) =>
    failed ? (
      <div class="ct-modal-backdrop">
        <div class="panel ct-modal" role="alert">
          <p>The lobby form could not be loaded (the site was probably just updated).</p>
          <div class="ct-row">
            <button class="primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    ) : null,
);

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
  useEffect(() => whenIdle(() => void CreateLobbyModal.preload()), []);

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
          <WorldBadge world={l.world} />
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
