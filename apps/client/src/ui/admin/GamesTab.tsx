// (records) Admin "Games" tab: every saved game record (finished or abandoned), newest first, with
// a readable play-by-play (day/night headers) and a "Download JSON" link per game.
import { useEffect, useState } from 'preact/hooks';
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { errorText } from '../lobby/finder';
import { groupTimeline, StorySections } from '../story/StoryParts';
import { adminApi } from './adminApi';
import { fmtDateTime, isForbidden } from './shared';
import type { AdminGameRecord, AdminGameView } from './types';

const charName = (c: CharacterId | null) => (c ? (CHARACTER_INFO[c]?.name ?? c) : '—');
const fmtDur = (sec: number) => `${Math.floor(sec / 3600) ? `${Math.floor(sec / 3600)}h ` : ''}${Math.round((sec % 3600) / 60)}m`;

export function GamesTab({ onForbidden }: { onForbidden: () => void }) {
  const [games, setGames] = useState<AdminGameView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = async (before?: number) => {
    setBusy(true);
    try {
      const r = await adminApi.games(before);
      setGames((prev) => (before && prev ? [...prev, ...r.games] : r.games));
      setTotal(r.total);
      setMore(r.games.length === 50);
      setError(null);
    } catch (e) {
      if (isForbidden(e)) onForbidden();
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <section class="panel ct-adm-section" aria-labelledby="ct-adm-games-h">
      <div class="ct-adm-sectionhead">
        <h3 id="ct-adm-games-h">Games{games ? ` (${total})` : ''}</h3>
        <button onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </div>
      <p class="muted ct-small">Every game is saved when it ends (abandoned games too). Open one for the play-by-play, or download the full record.</p>
      {error && (
        <p class="ct-error" role="alert">
          {error}
        </p>
      )}
      {games && games.length === 0 && <p class="muted">No games saved yet.</p>}
      <ul class="ct-adm-list">
        {games?.map((g) => (
          <li key={g.matchId} class="ct-adm-lobby ct-adm-game">
            <div class="ct-adm-who">
              <div class="ct-adm-name">
                <strong>{g.lobbyName ?? g.lobbyId}</strong>
                {g.status === 'abandoned' ? (
                  <span class="ct-adm-badge">abandoned</span>
                ) : (
                  <span class={`ct-adm-badge ${g.winner === 'good' ? 'admin' : 'you'}`}>{g.winner === 'good' ? 'Good won' : 'Evil won'}</span>
                )}
              </div>
              <div class="muted ct-small">
                <time dateTime={g.endedAt}>{fmtDateTime(g.endedAt)}</time> · {fmtDur(g.durationSec)} · {g.playerCount} players · Storyteller {g.storytellerName ?? '—'}
              </div>
            </div>
            <div class="ct-adm-game-actions">
              <button onClick={() => setOpenId(openId === g.matchId ? null : g.matchId)} aria-expanded={openId === g.matchId}>
                {openId === g.matchId ? 'Hide' : 'Play-by-play'}
              </button>
              <a class="ct-link" href={adminApi.gameDownloadUrl(g.matchId)} download={`clocktower-game-${g.matchId}.json`}>
                Download JSON
              </a>
            </div>
            {openId === g.matchId && <GameDetail matchId={g.matchId} onForbidden={onForbidden} />}
          </li>
        ))}
      </ul>
      {games && more && (
        <button onClick={() => void load(Date.parse(games[games.length - 1]!.endedAt))} disabled={busy}>
          {busy ? 'Loading…' : 'Load older'}
        </button>
      )}
    </section>
  );
}

function GameDetail({ matchId, onForbidden }: { matchId: string; onForbidden: () => void }) {
  const [rec, setRec] = useState<AdminGameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminApi
      .game(matchId)
      .then(setRec)
      .catch((e) => {
        if (isForbidden(e)) onForbidden();
        setError(errorText(e));
      });
  }, [matchId]);
  if (error)
    return (
      <p class="ct-error ct-adm-game-detail" role="alert">
        {error}
      </p>
    );
  if (!rec) return <p class="muted ct-adm-game-detail">Loading…</p>;
  return (
    <div class="ct-adm-game-detail">
      <p class="ct-small">
        {rec.result ? (
          <strong>
            {rec.result.winner === 'good' ? 'Good' : 'Evil'} won — {rec.result.reason}
          </strong>
        ) : (
          <strong>Abandoned ({rec.abandon?.reason ?? 'unknown'})</strong>
        )}{' '}
        · Storyteller {rec.storyteller?.label ?? '—'} · record v{rec.version}
      </p>
      <table class="ct-adm-seats">
        <thead>
          <tr>
            <th>Seat</th>
            <th>Player</th>
            <th>Character</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {rec.seats.map((s) => (
            <tr key={s.seat} class={s.finalAlignment ?? ''}>
              <td>{s.seat + 1}</td>
              <td>{s.label}</td>
              <td>
                {charName(s.finalCharacter)}
                {s.startingCharacter && s.startingCharacter !== s.finalCharacter && <span class="muted"> (was {charName(s.startingCharacter)})</span>}
              </td>
              <td>
                {s.aliveAtEnd ? 'alive' : s.death ? `died (${s.death.cause})` : 'dead'}
                {s.won === true ? ' · won' : s.won === false ? ' · lost' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <StorySections sections={groupTimeline(rec.timeline)} showTime />
    </div>
  );
}
