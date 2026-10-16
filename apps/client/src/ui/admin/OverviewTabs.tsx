import { useEffect, useState } from 'preact/hooks';
import { errorText, PHASE_LABEL } from '../lobby/finder';
import { adminApi } from './adminApi';
import { ConfirmDialog, fmtAgo, fmtDateTime, fmtUptime, isForbidden, Kv, type ConfirmSpec, type Notify } from './shared';
import type { AdminAuditView, AdminOverview } from './types';

/** Polls /api/admin/overview every 5 s while mounted. */
export function useOverview(onForbidden: () => void) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      adminApi
        .overview()
        .then((o) => {
          if (!alive) return;
          setData(o);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          if (isForbidden(e)) onForbidden();
          setError(errorText(e));
        });
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tick]);
  return { data, error, refresh: () => setTick((t) => t + 1) };
}

export function LobbiesTab({ notify, onForbidden }: { notify: Notify; onForbidden: () => void }) {
  const { data, error, refresh } = useOverview(onForbidden);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  if (!data) return <p class="muted">{error ?? 'Loading lobbies…'}</p>;
  const v = data.voice;
  const askClose = (id: string, name: string, inGame: boolean) =>
    setConfirm({
      title: `Close “${name}”?`,
      body: (
        <p>
          Everyone in it is disconnected{inGame ? ' and the game in progress ends without results' : ''}. This cannot be undone.
        </p>
      ),
      confirmLabel: 'Close lobby',
      danger: true,
      run: async () => {
        await adminApi.closeLobby(id);
        notify(true, `Closed “${name}”.`);
        refresh();
      },
    });
  return (
    <>
      {error && <p class="ct-error ct-small">Refresh failed: {error}</p>}
      <div class="ct-adm-kpis">
        <Kv k="Lobbies" v={data.totals.lobbies} />
        <Kv k="Active games" v={data.totals.activeGames} />
        <Kv k="Voice now" v={`${v.activeParticipants} in voice`} />
        <Kv k={`Voice ${v.month}`} v={`${v.participantMinutes.toLocaleString()} min`} />
      </div>
      <section class="panel ct-adm-section" aria-labelledby="ct-adm-lobbies-h">
        <h3 id="ct-adm-lobbies-h">Lobbies</h3>
        {data.lobbies.length === 0 ? (
          <p class="muted">No lobbies are open right now.</p>
        ) : (
          <ul class="ct-adm-list">
            {data.lobbies.map((l) => {
              const inGame = l.phase !== 'waiting' && l.phase !== 'finished';
              return (
                <li key={l.id} class="ct-adm-lobby">
                  <div class="ct-adm-who">
                    <div class="ct-adm-name">
                      <strong>{l.name}</strong>
                      <span class={`ct-adm-badge ${inGame ? 'live' : ''}`}>{PHASE_LABEL[l.phase]}</span>
                    </div>
                    <code class="ct-adm-id">{l.id}</code>
                  </div>
                  <dl class="ct-adm-nums">
                    <div>
                      <dt>Players</dt>
                      <dd>
                        {l.players}
                        {l.maxPlayers ? `/${l.maxPlayers}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Online</dt>
                      <dd>{l.connected}</dd>
                    </div>
                  </dl>
                  <div class="ct-adm-dates muted ct-small">
                    <span>Storyteller: {l.storytellerName ?? 'open seat'}</span>
                    <span>Host: {l.hostName ?? '—'}</span>
                    {l.createdAt && <span title={l.createdAt}>Created {fmtAgo(l.createdAt)}</span>}
                  </div>
                  <button class="ct-danger-btn" onClick={() => askClose(l.id, l.name, inGame)}>
                    Close lobby…
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}

export function SystemTab({ onForbidden }: { onForbidden: () => void }) {
  const { data, error } = useOverview(onForbidden);
  if (!data) return <p class="muted">{error ?? 'Loading status…'}</p>;
  const s = data.system;
  const v = data.voice;
  const pct = v.monthlyLimit > 0 ? Math.min(100, (v.participantMinutes / v.monthlyLimit) * 100) : 100;
  return (
    <div class="ct-admin-grid">
      {error && <p class="ct-error ct-small ct-admin-wide">Refresh failed: {error}</p>}
      <section class="panel">
        <h3>Server</h3>
        <dl class="ct-stats">
          <Kv k="Environment" v={s.env} />
          <Kv k="Version" v={<code class="ct-adm-version">{s.version.slice(0, 12)}</code>} />
          <Kv k="Uptime" v={fmtUptime(s.uptimeSec)} />
          <Kv k="Node" v={s.node} />
          <Kv k="Memory" v={`${s.memory.rssMb} MB`} />
          <Kv k="Heap" v={`${s.memory.heapUsedMb} MB`} />
          <Kv k="Load (1m)" v={`${s.cpu.load1} / ${s.cpu.cores}`} />
          <Kv k="Started" v={fmtDateTime(s.startedAt)} />
        </dl>
      </section>
      <section class="panel">
        <h3>Community</h3>
        <dl class="ct-stats">
          <Kv k="Accounts" v={data.totals.accounts} />
          <Kv k="Signed-in sessions" v={data.totals.activeSessions} />
          <Kv k="Games started" v={data.totals.matches} />
          <Kv k="Games finished" v={data.totals.matchesCompleted} />
          <Kv k="Open lobbies" v={data.totals.lobbies} />
          <Kv k="Active games" v={data.totals.activeGames} />
        </dl>
      </section>
      <section class="panel ct-admin-wide">
        <h3>Voice quota ({v.month})</h3>
        {!v.configured && <p class="ct-error ct-small">LiveKit is not configured — voice is disabled.</p>}
        <div class={`ct-quota ct-quota-${v.level}`} role="meter" aria-valuemin={0} aria-valuemax={v.monthlyLimit} aria-valuenow={v.participantMinutes}>
          <div class="ct-quota-fill" style={{ width: `${pct}%` }} />
        </div>
        <p>
          {v.participantMinutes.toLocaleString()} / {v.monthlyLimit.toLocaleString()} participant-minutes ·{' '}
          <strong class={`ct-level-${v.level}`}>{v.level}</strong>
        </p>
        <p class="muted ct-small">
          In voice now: {v.activeParticipants}
          {Object.entries(v.byEnv).map(([env, min]) => ` · ${env}: ${min} min`)}
        </p>
      </section>
      <section class="panel ct-admin-wide">
        <h3>Recent errors ({data.recentErrors.length})</h3>
        {data.recentErrors.length === 0 ? (
          <p class="muted">None.</p>
        ) : (
          <ul class="ct-errors">
            {data.recentErrors
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <span class="muted">{new Date(e.at).toLocaleString()}</span> {e.message}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'account.rename': 'renamed',
  'account.rotate_passphrase': 'rotated the passphrase of',
  'account.signout_all': 'signed out (all devices)',
  'account.delete': 'deleted',
  'lobby.close': 'closed the lobby',
  'game.view': 'viewed the full record of game', // (v2.3 AUTH-8)
  'game.download': 'downloaded the full record of game',
};

function detailText(e: AdminAuditView): string | null {
  const d = e.detail;
  if (!d) return null;
  if (e.action === 'account.rename' && typeof d.from === 'string') return `was “${d.from}”`;
  if (typeof d.sessionsRevoked === 'number') return `${d.sessionsRevoked} session${d.sessionsRevoked === 1 ? '' : 's'} ended`;
  if (d.bulk === true) return 'bulk delete';
  return null;
}

export function AuditTab({ onForbidden }: { onForbidden: () => void }) {
  const [entries, setEntries] = useState<AdminAuditView[] | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (before?: number) => {
    setBusy(true);
    try {
      const r = await adminApi.audit(before);
      setEntries((prev) => (before && prev ? [...prev, ...r.entries] : r.entries));
      setMore(r.entries.length === 50);
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
    <section class="panel ct-adm-section" aria-labelledby="ct-adm-audit-h">
      <div class="ct-adm-sectionhead">
        <h3 id="ct-adm-audit-h">Admin actions</h3>
        <button onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </div>
      <p class="muted ct-small">Every admin change is recorded here permanently (the log cannot be edited).</p>
      {error && (
        <p class="ct-error" role="alert">
          {error}
        </p>
      )}
      {entries && entries.length === 0 && <p class="muted">No admin actions yet.</p>}
      <ol class="ct-adm-audit">
        {entries?.map((e) => {
          const extra = detailText(e);
          return (
            <li key={e.id}>
              <time class="muted ct-small" dateTime={e.at} title={e.at}>
                {fmtDateTime(e.at)}
              </time>
              <span>
                <strong>{e.adminName}</strong> {ACTION_LABEL[e.action] ?? e.action}{' '}
                <strong>{e.targetName ?? e.targetId ?? ''}</strong>
                {extra && <span class="muted"> · {extra}</span>}
              </span>
              {e.targetId && <code class="ct-adm-id">{e.targetId}</code>}
            </li>
          );
        })}
      </ol>
      {entries && more && (
        <button onClick={() => void load(entries[entries.length - 1]?.id)} disabled={busy}>
          {busy ? 'Loading…' : 'Load older'}
        </button>
      )}
    </section>
  );
}
