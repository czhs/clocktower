import { useEffect, useState } from 'preact/hooks';
import type { AccountView, AdminStatusView } from '@ct/protocol';
import { api } from '../../net/api';
import { errorText, goTo, PHASE_LABEL } from '../lobby/finder';
import '../auth/auth.css';
import '../lobby/lobby.css';
import './admin.css';

// OWNED BY lobby-auth. Admin status (server enforces ADMIN_ACCOUNT_IDS): health, lobbies,
// voice quota, recent errors. Polls every 5 s.

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
}

export function AdminScreen({ account }: { account: AccountView }) {
  const [status, setStatus] = useState<AdminStatusView | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .adminStatus()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setError(null);
        })
        .catch((e: unknown) => alive && setError({ code: (e as { status?: number }).status ?? 0, message: errorText(e) }));
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const back = (
    <button class="ct-link" onClick={() => goTo('/')}>
      ← Back to lobbies
    </button>
  );

  if (error && !status)
    return (
      <div class="screen center">
        <div class="panel ct-admin-denied">
          <h2>Admin</h2>
          <p>{error.code === 403 ? 'This page is only available to server administrators.' : error.message}</p>
          {error.code === 403 && (
            <p class="muted ct-small">
              To grant access, add your account id <code>{account.id}</code> to <code>ADMIN_ACCOUNT_IDS</code> on the server.
            </p>
          )}
          {back}
        </div>
      </div>
    );
  if (!status) return <div class="screen center">Loading status…</div>;

  const v = status.voice;
  const pct = v.monthlyLimit > 0 ? Math.min(100, (v.participantMinutes / v.monthlyLimit) * 100) : 100;
  return (
    <div class="ct-home ct-admin">
      <header class="ct-home-header">
        <div class="ct-brand">Server status</div>
        {back}
      </header>
      {error && <p class="ct-error">Refresh failed: {error.message}</p>}
      <div class="ct-admin-grid">
        <section class="panel">
          <h3>Health</h3>
          <dl class="ct-stats">
            <Kv k="Environment" v={status.env} />
            <Kv k="Version" v={status.version} />
            <Kv k="Uptime" v={fmtUptime(status.uptimeSec)} />
            <Kv k="RSS" v={`${status.memory.rssMb} MB`} />
            <Kv k="Heap" v={`${status.memory.heapUsedMb} MB`} />
            <Kv k="Load (1m)" v={`${status.cpu.load1} / ${status.cpu.cores} cores`} />
          </dl>
        </section>

        <section class="panel">
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
            Active participants: {v.activeParticipants}
            {Object.entries(v.byEnv).map(([env, min]) => ` · ${env}: ${min} min`)}
          </p>
        </section>

        <section class="panel ct-admin-wide">
          <h3>Lobbies ({status.lobbies.length})</h3>
          {status.lobbies.length === 0 ? (
            <p class="muted">No lobbies.</p>
          ) : (
            <table class="ct-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Id</th>
                  <th>Phase</th>
                  <th>Players</th>
                  <th>Connected</th>
                </tr>
              </thead>
              <tbody>
                {status.lobbies.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>
                      <code>{l.id}</code>
                    </td>
                    <td>{PHASE_LABEL[l.phase]}</td>
                    <td>{l.players}</td>
                    <td>{l.connected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section class="panel ct-admin-wide">
          <h3>Recent errors ({status.recentErrors.length})</h3>
          {status.recentErrors.length === 0 ? (
            <p class="muted">None.</p>
          ) : (
            <ul class="ct-errors">
              {status.recentErrors
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
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div class="ct-stat">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
