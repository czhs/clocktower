import { useEffect, useState } from 'preact/hooks';
import { errorText } from '../lobby/finder';
import { adminApi } from './adminApi';
import { ConfirmDialog, fmtAgo, fmtDateTime, isForbidden, type ConfirmSpec, type Notify } from './shared';
import type { AdminAccountView, AdminIpBlockView, AdminOpsView, AdminReportView } from './types';

// (v2.3 OPS-1/2/6, sec-ops) Admin console: panic switches, network blocks, player reports and the
// per-account suspend / block-network actions. The server enforces everything; values that come
// from the server's env (OPS_* keys) are shown as locked.

const MODE_LABEL = { open: 'Open: anyone can create an account', code: 'Invite code: new accounts need the code', closed: 'Closed: no new accounts' } as const;

function useOps(onForbidden: () => void) {
  const [ops, setOps] = useState<AdminOpsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setOps(await adminApi.ops());
      setError(null);
    } catch (e) {
      if (isForbidden(e)) onForbidden();
      else setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return { ops, setOps, error, reload: load };
}

const days = (v: string): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 3650) : null;
};

export function SafetyTab({ notify, onForbidden }: { notify: Notify; onForbidden: () => void }) {
  const { ops, setOps, error, reload } = useOps(onForbidden);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ops) return <p class="muted">{error ?? 'Loading…'}</p>;
  const apply = async (patch: Parameters<typeof adminApi.setOps>[0], ok: string) => {
    setBusy(true);
    try {
      setOps(await adminApi.setOps(patch));
      notify(true, ok);
    } catch (e) {
      notify(false, errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const b = ops.lastBackup;
  return (
    <div class="ct-admin-grid">
      <section class="panel" aria-labelledby="ct-adm-signups-h">
        <h3 id="ct-adm-signups-h">New accounts</h3>
        {ops.signups.fromEnv && <p class="muted ct-small">Locked by the server's OPS_SIGNUP_MODE setting.</p>}
        <div class="ct-adm-radio" role="radiogroup" aria-label="Sign-up mode">
          {(['open', 'code', 'closed'] as const).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="signup"
                checked={ops.signups.mode === m}
                disabled={busy || ops.signups.fromEnv || (m === 'code' && !ops.signups.codeSet && !code.trim())}
                onChange={() => void apply(m === 'code' && code.trim() ? { signupMode: m, signupCode: code.trim() } : { signupMode: m }, `Sign-ups: ${m}.`)}
              />{' '}
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
        <form
          class="ct-adm-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 6) void apply({ signupCode: code.trim() }, 'Invite code saved.').then(() => setCode(''));
          }}
        >
          <input placeholder={ops.signups.codeSet ? 'Invite code is set (type to replace)' : 'Invite code (6+ characters)'} value={code} minLength={6} maxLength={128} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
          <button type="submit" disabled={busy || code.trim().length < 6}>
            Save code
          </button>
        </form>
      </section>

      <section class="panel" aria-labelledby="ct-adm-maint-h">
        <h3 id="ct-adm-maint-h">Maintenance</h3>
        {ops.maintenance.fromEnv && <p class="muted ct-small">Locked by the server's OPS_MAINTENANCE setting.</p>}
        <p class="ct-small">
          {ops.maintenance.on ? <strong class="ct-adm-warn">ON</strong> : 'Off'} · Players see: “{ops.maintenance.message}”
        </p>
        <p class="muted ct-small">While on, nobody can open lobbies, join or list them. Games already running keep going. Admins can still sign in.</p>
        <form
          class="ct-adm-inline"
          onSubmit={(e) => {
            e.preventDefault();
            void apply({ maintenance: !ops.maintenance.on, ...(msg.trim() ? { maintenanceMessage: msg.trim() } : {}) }, ops.maintenance.on ? 'Maintenance off.' : 'Maintenance on.');
          }}
        >
          <input placeholder="Message (optional)" maxLength={200} value={msg} onInput={(e) => setMsg((e.target as HTMLInputElement).value)} />
          <button type="submit" class={ops.maintenance.on ? 'primary' : 'ct-danger-btn'} disabled={busy || ops.maintenance.fromEnv}>
            {ops.maintenance.on ? 'Turn off' : 'Turn on'}
          </button>
        </form>
      </section>

      <section class="panel" aria-labelledby="ct-adm-panic-h">
        <h3 id="ct-adm-panic-h">Emergency</h3>
        <div class="ct-adm-actions">
          <button
            class={ops.voice.on ? 'ct-danger-btn' : 'primary'}
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: ops.voice.on ? 'Turn voice off for everyone?' : 'Turn voice back on?',
                body: <p>{ops.voice.on ? 'Every voice connection ends and no new ones are allowed until you turn it back on. Text chat keeps working.' : 'Players can connect to voice again.'}</p>,
                confirmLabel: ops.voice.on ? 'Voice off' : 'Voice on',
                danger: ops.voice.on,
                run: async () => {
                  setOps(await adminApi.setOps({ voice: !ops.voice.on }));
                  notify(true, ops.voice.on ? 'Voice is off.' : 'Voice is on.');
                },
              })
            }
          >
            {ops.voice.on ? 'Voice off…' : 'Voice on…'}
          </button>
          <button
            class="ct-danger-btn"
            onClick={() =>
              setConfirm({
                title: 'Close every lobby?',
                body: <p>Everyone is disconnected and every running game ends (recorded as abandoned).</p>,
                acknowledge: 'Yes, close all lobbies now',
                confirmLabel: 'Close all',
                danger: true,
                run: async () => {
                  const r = await adminApi.closeAllLobbies();
                  notify(true, `Closed ${r.closed} lobb${r.closed === 1 ? 'y' : 'ies'}.`);
                },
              })
            }
          >
            Close all lobbies…
          </button>
          <button
            class="ct-danger-btn"
            onClick={() =>
              setConfirm({
                title: 'Sign everyone out?',
                body: <p>Every session on every device ends (yours in this browser stays). Players sign in again with their passphrase.</p>,
                acknowledge: 'Yes, sign everyone out',
                confirmLabel: 'Sign everyone out',
                danger: true,
                run: async () => {
                  const r = await adminApi.revokeAllSessions();
                  notify(true, `Signed out ${r.accounts} account${r.accounts === 1 ? '' : 's'}.`);
                },
              })
            }
          >
            Sign everyone out…
          </button>
        </div>
        <p class="ct-small">
          Last database backup:{' '}
          {b ? (
            <span class={b.ok ? '' : 'ct-adm-warn'} title={b.detail}>
              {b.ok ? 'ok' : 'FAILED'} · {fmtAgo(b.at)}
            </span>
          ) : (
            <span class="muted">no marker yet</span>
          )}
        </p>
        <button class="ct-link" onClick={() => void reload()}>
          Refresh
        </button>
      </section>

      <IpBlocks notify={notify} />
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function IpBlocks({ notify }: { notify: Notify }) {
  const [blocks, setBlocks] = useState<AdminIpBlockView[] | null>(null);
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [d, setD] = useState('');
  const load = async () => setBlocks((await adminApi.ipBlocks().catch(() => ({ blocks: [] }))).blocks);
  useEffect(() => {
    void load();
  }, []);
  return (
    <section class="panel ct-admin-wide" aria-labelledby="ct-adm-ip-h">
      <h3 id="ct-adm-ip-h">Blocked networks</h3>
      <p class="muted ct-small">Blocks sign-up, sign-in, creating and joining lobbies from an address (IPv6: its whole /64). For a determined attacker, also add a Cloudflare WAF rule.</p>
      <form
        class="ct-adm-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await adminApi.blockIp(ip.trim(), reason.trim(), days(d));
            setIp('');
            setReason('');
            notify(true, 'Network blocked.');
            void load();
          } catch (err) {
            notify(false, errorText(err));
          }
        }}
      >
        <input placeholder="IP address" value={ip} maxLength={64} onInput={(e) => setIp((e.target as HTMLInputElement).value)} />
        <input placeholder="Reason" value={reason} maxLength={200} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
        <input placeholder="Days (empty = until removed)" inputMode="numeric" value={d} onInput={(e) => setD((e.target as HTMLInputElement).value)} />
        <button type="submit" disabled={!ip.trim() || reason.trim().length < 3}>
          Block
        </button>
      </form>
      {blocks && blocks.length === 0 && <p class="muted">No blocks.</p>}
      <ul class="ct-adm-list">
        {(blocks ?? []).map((b) => (
          <li key={b.key} class="ct-adm-lobby">
            <code>{b.key}</code>
            <span class="ct-small">{b.reason}</span>
            <span class="muted ct-small">{b.until ? `until ${fmtDateTime(b.until)}` : 'until removed'}</span>
            <button
              class="ct-link"
              onClick={async () => {
                await adminApi.unblockIp(b.key).catch((e) => notify(false, errorText(e)));
                void load();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReportsTab({ notify, onForbidden }: { notify: Notify; onForbidden: () => void }) {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [list, setList] = useState<AdminReportView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const load = async () => {
    try {
      setList((await adminApi.reports(status)).reports);
      setError(null);
    } catch (e) {
      if (isForbidden(e)) onForbidden();
      else setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, [status]);
  const resolve = async (r: AdminReportView, action: 'dismissed' | 'warned' | 'suspended') => {
    try {
      await adminApi.resolveReport(r.id, action);
      notify(true, `Report #${r.id} marked ${action}.`);
      void load();
    } catch (e) {
      notify(false, errorText(e));
    }
  };
  const suspendAndResolve = (r: AdminReportView) =>
    setConfirm({
      title: `Suspend ${r.target.name ?? 'this account'}?`,
      body: <p>They are signed out everywhere and cannot sign in for 30 days. Reason recorded: report #{r.id} ({r.reason}).</p>,
      confirmLabel: 'Suspend 30 days',
      danger: true,
      run: async () => {
        await adminApi.suspend(r.target.accountId, `Report #${r.id}: ${r.reason}`, 30);
        await adminApi.resolveReport(r.id, 'suspended');
        notify(true, 'Suspended and resolved.');
        void load();
      },
    });
  return (
    <section>
      <div class="ct-adm-inline">
        <button class={status === 'open' ? 'primary' : ''} onClick={() => setStatus('open')}>
          Open
        </button>
        <button class={status === 'resolved' ? 'primary' : ''} onClick={() => setStatus('resolved')}>
          Resolved (kept 90 days)
        </button>
      </div>
      {error && <p class="ct-error ct-small">{error}</p>}
      {list && list.length === 0 && <p class="muted">No {status} reports.</p>}
      <ul class="ct-adm-list">
        {(list ?? []).map((r) => (
          <li key={r.id} class="panel ct-adm-report">
            <div>
              <strong>#{r.id}</strong> · {r.reason} · <span class="muted ct-small">{r.at ? fmtDateTime(r.at) : ''}</span>
            </div>
            <div class="ct-small">
              <strong>{r.reporter.name ?? 'deleted'}</strong> reported <strong>{r.target.name ?? 'deleted'}</strong>
              {r.target.suspended && <span class="ct-adm-badge">suspended</span>} in “{r.context?.lobby?.name ?? r.lobbyId}” ({r.context?.lobby?.phase ?? '?'})
            </div>
            {r.note && <p class="ct-small">“{r.note}”</p>}
            {(r.context?.lines ?? []).length > 0 && (
              <ul class="ct-adm-lines ct-small">
                {r.context!.lines!.map((l) => (
                  <li key={l.id}>
                    <strong>{l.fromName}:</strong> {l.text}
                  </li>
                ))}
              </ul>
            )}
            {r.status === 'open' ? (
              <div class="ct-adm-actions">
                <button onClick={() => void resolve(r, 'dismissed')}>Dismiss</button>
                <button onClick={() => void resolve(r, 'warned')}>Mark warned</button>
                <button class="ct-danger-btn" onClick={() => suspendAndResolve(r)} disabled={r.target.suspended}>
                  Suspend 30 days…
                </button>
              </div>
            ) : (
              <p class="muted ct-small">Resolved: {r.resolution}</p>
            )}
          </li>
        ))}
      </ul>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

/** Account "Manage" panel extras: suspend / unsuspend and block the account's network. */
export function AccountSafety({ a }: { a: AdminAccountView }) {
  const [reason, setReason] = useState('');
  const [d, setD] = useState('7');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [suspended, setSuspended] = useState(a.suspended ?? null);
  if (a.isYou || a.isAdmin) return null;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setState({ ok: true, text: ok });
    } catch (e) {
      setState({ ok: false, text: errorText(e) });
    }
  };
  return (
    <div class="ct-adm-safety">
      {suspended ? (
        <p class="ct-small">
          <strong class="ct-adm-warn">Suspended</strong> {suspended.until ? `until ${fmtDateTime(suspended.until)}` : 'until lifted'} · {suspended.reason}{' '}
          <button class="ct-link" onClick={() => void run(async () => (await adminApi.unsuspend(a.id), setSuspended(null)), 'Suspension lifted.')}>
            Lift
          </button>
        </p>
      ) : null}
      <div class="ct-adm-inline">
        <input placeholder="Reason (shown to them when they sign in)" value={reason} maxLength={200} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
        <input aria-label="Days" placeholder="Days" inputMode="numeric" value={d} onInput={(e) => setD((e.target as HTMLInputElement).value)} />
        <button
          class="ct-danger-btn"
          disabled={reason.trim().length < 3}
          onClick={() =>
            void run(async () => {
              const r = (await adminApi.suspend(a.id, reason.trim(), days(d))) as { suspended?: AdminAccountView['suspended'] };
              setSuspended(r.suspended ?? { reason: reason.trim(), until: null, at: new Date().toISOString() });
            }, 'Suspended and signed out everywhere.')
          }
        >
          Suspend
        </button>
        <button
          class="ct-danger-btn"
          disabled={reason.trim().length < 3 || !a.networkKnown}
          title={a.networkKnown ? 'Blocks the network they last used (IPv6: its /64)' : 'No network known for this account yet'}
          onClick={() => void run(() => adminApi.blockNetwork(a.id, reason.trim(), days(d)), 'Their network is blocked.')}
        >
          Block network
        </button>
      </div>
      {state && <p class={`${state.ok ? 'ct-ok' : 'ct-error'} ct-small`}>{state.text}</p>}
    </div>
  );
}
