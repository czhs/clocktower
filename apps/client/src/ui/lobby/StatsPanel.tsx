// (v2.2 stats) "Your record" on the home screen, under the Lobby finder: the signed-in account's own
// stats from GET /api/me/stats (StatsView). Nothing here is about anyone else. The home screen is
// remounted when you come back from a game, and the panel also refreshes when the tab becomes
// visible again, so a finished game shows up without a reload. Styles: lobby.css (`.ct-rec*`).
import { useEffect, useState } from 'preact/hooks';
import { CHARACTER_INFO, type CharacterId, type RecentGame, type StatsView } from '@ct/protocol';
import { api } from '../../net/api';
import { RoleIcon } from '../common/RoleIcon';
import { CastPortrait, castName } from '../common/castPortrait';
import { errorText } from './finder';

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; stats: StatsView };

const roleName = (id: string | null): string =>
  id ? ((CHARACTER_INFO as Record<string, { name: string } | undefined>)[id]?.name ?? id.replace(/_/g, ' ')) : 'Unknown';
const asRole = (id: string | null): CharacterId | 'unknown' =>
  id && id in CHARACTER_INFO ? (id as CharacterId) : 'unknown';
const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function StatsPanel() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const fetchStats = (quiet = false) => {
    if (!quiet) setLoad({ kind: 'loading' });
    api
      .stats()
      .then((stats) => setLoad({ kind: 'ready', stats }))
      .catch((e) => {
        if (!quiet) setLoad({ kind: 'error', message: errorText(e) });
      });
  };
  useEffect(() => {
    fetchStats();
    const onVisible = () => document.visibilityState === 'visible' && fetchStats(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <section class="panel ct-rec" aria-labelledby="ct-rec-title" aria-busy={load.kind === 'loading'}>
      <div class="ct-rec-head">
        <h2 id="ct-rec-title">Your record</h2>
        {load.kind === 'ready' && load.stats.currentWinStreak >= 2 && (
          <span class="ct-rec-badge" title="Consecutive wins">
            {load.stats.currentWinStreak} wins in a row
          </span>
        )}
      </div>
      {load.kind === 'loading' && <Skeleton />}
      {load.kind === 'error' && (
        <div class="ct-rec-error" role="alert">
          <p class="ct-error">Could not load your record: {load.message}</p>
          <button onClick={() => fetchStats()}>Try again</button>
        </div>
      )}
      {load.kind === 'ready' && <Record stats={load.stats} />}
    </section>
  );
}

function Skeleton() {
  return (
    <div class="ct-rec-skeleton" aria-hidden="true">
      <div class="ct-rec-tiles">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} class="ct-rec-tile ct-rec-shimmer" />
        ))}
      </div>
      <div class="ct-rec-line ct-rec-shimmer" />
      <div class="ct-rec-line ct-rec-shimmer" />
      <span class="ct-sr-only">Loading your record…</span>
    </div>
  );
}

function Record({ stats: s }: { stats: StatsView }) {
  const finished = s.wins + s.losses;
  if (s.matchesPlayed === 0 && s.gamesStorytold === 0 && s.recentGames.length === 0)
    return (
      <div class="ct-rec-empty">
        <RoleIcon id="unknown" size={32} label={false} />
        <div>
          <p>Play your first game to start your record.</p>
          <p class="muted ct-small">Wins, streaks, your favourite characters and recent games will appear here.</p>
        </div>
      </div>
    );
  return (
    <>
      <dl class="ct-rec-tiles">
        <Tile label="Games" value={String(finished)} sub={s.gamesAbandoned ? `${s.gamesAbandoned} abandoned` : 'finished'} />
        <Tile label="Won · Lost" value={`${s.wins} · ${s.losses}`} sub={finished ? `${pct(s.winRate)} win rate` : 'no results yet'} meter={s.winRate} />
        <Tile label="Win streak" value={String(s.currentWinStreak)} sub={`best ${s.bestWinStreak}`} />
        <Tile label="Storyteller" value={String(s.gamesStorytold)} sub={s.gamesStorytold === 1 ? 'game told' : 'games told'} />
      </dl>

      <div class="ct-rec-row">
        <Teams stats={s} />
        <div class="ct-rec-block">
          <h3>Favourites</h3>
          <div class="ct-rec-favs">
            {s.favouriteAvatar && (
              <div class="ct-rec-fav" title={`${castName(s.favouriteAvatar.avatarId)}: ${plural(s.favouriteAvatar.games, 'game')}`}>
                <CastPortrait id={s.favouriteAvatar.avatarId} size={40} crop="bust" label={castName(s.favouriteAvatar.avatarId)} />
                <span>
                  {castName(s.favouriteAvatar.avatarId)}
                  <small class="muted">{plural(s.favouriteAvatar.games, 'game')}</small>
                </span>
              </div>
            )}
            {s.topCharacters.map((c) => (
              <div key={c.character} class="ct-rec-fav" title={`${roleName(c.character)}: ${plural(c.games, 'game')}, ${plural(c.wins, 'win')}`}>
                <RoleIcon id={asRole(c.character)} size={32} label={false} />
                <span>
                  {roleName(c.character)}
                  <small class="muted">
                    {plural(c.games, 'game')} · {plural(c.wins, 'win')}
                  </small>
                </span>
              </div>
            ))}
            {!s.favouriteAvatar && s.topCharacters.length === 0 && <p class="muted ct-small">Finish a game to see your favourites.</p>}
          </div>
        </div>
      </div>

      {s.recentGames.length > 0 && (
        <div class="ct-rec-block">
          <h3>Recent games</h3>
          <ul class="ct-rec-recent">
            {s.recentGames.map((g) => (
              <RecentRow key={g.matchId} g={g} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub, meter }: { label: string; value: string; sub: string; meter?: number | null }) {
  return (
    <div class="ct-rec-tile">
      <dt>{label}</dt>
      <dd>
        <span class="ct-rec-value">{value}</span>
        <span class="ct-rec-sub">{sub}</span>
        {meter !== undefined && meter !== null && (
          <span class="ct-rec-meter" aria-hidden="true">
            <span style={{ width: `${Math.round(meter * 100)}%` }} />
          </span>
        )}
      </dd>
    </div>
  );
}

function Teams({ stats: s }: { stats: StatsView }) {
  const total = s.goodGames + s.evilGames;
  return (
    <div class="ct-rec-block">
      <h3>Good &amp; evil</h3>
      {total === 0 ? (
        <p class="muted ct-small">No finished games yet.</p>
      ) : (
        <>
          <div class="ct-rec-split" role="img" aria-label={`${plural(s.goodGames, 'game')} as good, ${plural(s.evilGames, 'game')} as evil`}>
            {s.goodGames > 0 && <span class="ct-rec-split-good" style={{ flexGrow: s.goodGames }} />}
            {s.evilGames > 0 && <span class="ct-rec-split-evil" style={{ flexGrow: s.evilGames }} />}
          </div>
          <div class="ct-rec-teams">
            <span class="ct-good">
              Good <strong>{s.goodWins}</strong>/{s.goodGames} won
            </span>
            <span class="ct-evil">
              Evil <strong>{s.evilWins}</strong>/{s.evilGames} won
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const RESULT_LABEL: Record<RecentGame['result'], string> = { won: 'Won', lost: 'Lost', told: 'Told', abandoned: 'Abandoned' };

function RecentRow({ g }: { g: RecentGame }) {
  const st = g.as === 'storyteller';
  const role = st ? 'Storyteller' : g.character ? roleName(g.character) : 'No character yet';
  const team = !st && g.alignment ? g.alignment : null;
  const detail = st
    ? g.winner
      ? `${g.winner === 'good' ? 'Good' : 'Evil'} won`
      : 'Not finished'
    : g.status === 'abandoned'
      ? 'Not finished'
      : team
        ? `${team === 'good' ? 'Good' : 'Evil'} team`
        : '';
  return (
    <li class={`ct-rec-game ct-rec-game--${g.result}`}>
      <span class="ct-rec-game-icon">
        {st ? <span class="ct-rec-st" aria-hidden="true">✶</span> : <RoleIcon id={g.character ? asRole(g.character) : 'unknown'} size={32} label={false} />}
      </span>
      <span class="ct-rec-game-main">
        <span class={`ct-rec-game-role${team ? ` ct-${team}` : ''}`}>{role}</span>
        <span class="ct-rec-game-meta muted">
          {g.lobbyName ?? 'Unnamed lobby'}
          {detail && ` · ${detail}`}
        </span>
      </span>
      <span class="ct-rec-game-end">
        <span class={`ct-rec-pill ct-rec-pill--${g.result}`}>{RESULT_LABEL[g.result]}</span>
        <time class="muted" dateTime={g.endedAt} title={new Date(g.endedAt).toLocaleString()}>
          {when(g.endedAt)}
        </time>
      </span>
    </li>
  );
}
