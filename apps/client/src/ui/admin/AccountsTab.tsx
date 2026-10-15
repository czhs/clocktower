import { useEffect, useMemo, useState } from 'preact/hooks';
import { copyText, errorText } from '../lobby/finder';
import { adminApi, type AccountQuery } from './adminApi';
import { ConfirmDialog, Dialog, fmtAgo, fmtDate, isForbidden, type ConfirmSpec, type Notify } from './shared';
import type { AdminAccountView, AdminAccountsPage, AdminBulkDeleteResponse } from './types';

const PAGE = 50;
/** One-click filters for cleaning up accounts made by test runs. */
const TEST_PREFIXES = ['verify-', 'Rdy', 'x'];

type Reveal = { name: string; passphrase: string; self: boolean };

export function AccountsTab({ notify, onForbidden }: { notify: Notify; onForbidden: () => void }) {
  const [query, setQuery] = useState<AccountQuery>({ q: '', match: 'contains', sort: 'created', dir: 'desc', limit: PAGE, offset: 0 });
  const [text, setText] = useState('');
  const [page, setPage] = useState<AdminAccountsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [bulkResult, setBulkResult] = useState<AdminBulkDeleteResponse | null>(null);

  // Debounced free-text search.
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === text.trim() ? q : { ...q, q: text.trim(), offset: 0 })), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminApi
      .accounts(query)
      .then((p) => {
        if (!alive) return;
        setPage(p);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (isForbidden(e)) onForbidden();
        setLoadError(errorText(e));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query, reload]);

  const refresh = () => setReload((n) => n + 1);
  const selectable = (a: AdminAccountView) => !a.isYou && !a.isAdmin;
  const pageSelectable = useMemo(() => (page?.accounts ?? []).filter(selectable), [page]);
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every((a) => selected.has(a.id));

  const toggle = (a: AdminAccountView, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(a.id, a.displayName);
      else next.delete(a.id);
      return next;
    });
  const togglePage = (on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const a of pageSelectable) on ? next.set(a.id, a.displayName) : next.delete(a.id);
      return next;
    });

  const applyPrefix = (p: string) => {
    setText(p);
    setQuery((q) => ({ ...q, q: p, match: 'prefix', offset: 0 }));
  };

  // ---- actions (each behind a confirmation dialog) --------------------------------------

  const askRotate = (a: AdminAccountView) =>
    setConfirm({
      title: a.isYou ? 'Rotate YOUR passphrase?' : `Rotate ${a.displayName}’s passphrase?`,
      body: (
        <>
          <p>
            A new passphrase is generated and shown to you <strong>once</strong>. The old one stops working immediately and{' '}
            {a.isYou ? 'you are' : `${a.displayName} is`} signed out on every device.
          </p>
          {a.isYou && <p class="ct-adm-warn">This is your own admin account — you will need the new passphrase to sign back in.</p>}
          <p class="muted ct-small">Hand it over privately (not in a public chat).</p>
        </>
      ),
      confirmLabel: 'Generate new passphrase',
      danger: a.isYou,
      run: async () => {
        const r = await adminApi.rotatePassphrase(a.id, a.isYou);
        setReveal({ name: r.account.displayName, passphrase: r.passphrase, self: a.isYou });
        refresh();
      },
    });

  const askSignOut = (a: AdminAccountView) =>
    setConfirm({
      title: a.isYou ? 'Sign YOURSELF out everywhere?' : `Sign ${a.displayName} out everywhere?`,
      body: (
        <>
          <p>
            Ends all {a.activeSessions} active session{a.activeSessions === 1 ? '' : 's'}. Their passphrase keeps working.
          </p>
          <p class="muted ct-small">A game they are connected to right now continues until they leave or refresh.</p>
          {a.isYou && <p class="ct-adm-warn">This includes this browser — you will be signed out.</p>}
        </>
      ),
      confirmLabel: 'Sign out everywhere',
      danger: a.isYou,
      run: async () => {
        await adminApi.signOutAll(a.id, a.isYou);
        if (a.isYou) {
          location.reload();
          return;
        }
        notify(true, `${a.displayName} was signed out on every device.`);
        refresh();
      },
    });

  const askDelete = (a: AdminAccountView) =>
    setConfirm({
      title: `Delete ${a.displayName}?`,
      body: (
        <>
          <p>
            Permanently deletes the account <code>{a.id}</code> and signs it out everywhere. This cannot be undone.
          </p>
          <p class="muted ct-small">
            Their {a.gamesPlayed} game{a.gamesPlayed === 1 ? '' : 's'} stay in the history as an anonymous player.
          </p>
        </>
      ),
      acknowledge: `Yes, delete “${a.displayName}” permanently`,
      confirmLabel: 'Delete permanently',
      danger: true,
      run: async () => {
        await adminApi.deleteAccount(a.id);
        setOpen(null);
        setSelected((prev) => {
          const next = new Map(prev);
          next.delete(a.id);
          return next;
        });
        notify(true, `Deleted ${a.displayName}.`);
        refresh();
      },
    });

  const askBulkDelete = () => {
    const names = [...selected.values()];
    setConfirm({
      title: `Delete ${names.length} account${names.length === 1 ? '' : 's'}?`,
      body: (
        <>
          <p>These accounts are deleted permanently and signed out everywhere:</p>
          <ul class="ct-adm-namelist">
            {names.slice(0, 12).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            {names.length > 12 && <li class="muted">…and {names.length - 12} more</li>}
          </ul>
          <p class="muted ct-small">Admins, your own account and anyone seated in a lobby are skipped automatically.</p>
        </>
      ),
      acknowledge: `Yes, delete these ${names.length} accounts permanently`,
      confirmLabel: 'Delete permanently',
      danger: true,
      run: async () => {
        const r = await adminApi.bulkDelete([...selected.keys()]);
        setSelected(new Map());
        setBulkResult(r);
        refresh();
      },
    });
  };

  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : query.offset + 1;
  const to = Math.min(total, query.offset + (page?.accounts.length ?? 0));

  return (
    <section class="panel ct-adm-section" aria-labelledby="ct-adm-accounts-h">
      <h3 id="ct-adm-accounts-h">Accounts</h3>
      <div class="ct-adm-filters">
        <label class="ct-adm-search">
          <span class="ct-sr-only">Search accounts</span>
          <input
            type="search"
            placeholder="Search name or id…"
            value={text}
            maxLength={64}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          <span class="ct-sr-only">Match</span>
          <select value={query.match} onChange={(e) => setQuery({ ...query, match: (e.target as HTMLSelectElement).value as AccountQuery['match'], offset: 0 })}>
            <option value="contains">Name contains</option>
            <option value="prefix">Name starts with</option>
          </select>
        </label>
        <label>
          <span class="ct-sr-only">Sort</span>
          <select
            value={`${query.sort}:${query.dir}`}
            onChange={(e) => {
              const [sort, dir] = (e.target as HTMLSelectElement).value.split(':') as [AccountQuery['sort'], AccountQuery['dir']];
              setQuery({ ...query, sort, dir, offset: 0 });
            }}
          >
            <option value="created:desc">Newest first</option>
            <option value="created:asc">Oldest first</option>
            <option value="lastSeen:desc">Recently seen</option>
            <option value="lastSeen:asc">Least recently seen</option>
            <option value="name:asc">Name A–Z</option>
            <option value="games:desc">Most games</option>
          </select>
        </label>
      </div>
      <div class="ct-adm-chips" aria-label="Test-account filters">
        <span class="muted ct-small">Test accounts:</span>
        {TEST_PREFIXES.map((p) => (
          <button key={p} class="ct-adm-chip" aria-pressed={query.match === 'prefix' && query.q === p} onClick={() => applyPrefix(p)}>
            starts with “{p}”
          </button>
        ))}
        {query.q && (
          <button class="ct-link" onClick={() => (setText(''), setQuery({ ...query, q: '', match: 'contains', offset: 0 }))}>
            Clear filter
          </button>
        )}
      </div>

      <div class="ct-adm-listhead">
        <label class="ct-adm-selectall">
          <input type="checkbox" checked={allOnPage} disabled={pageSelectable.length === 0} onChange={(e) => togglePage((e.target as HTMLInputElement).checked)} />
          <span>Select page</span>
        </label>
        <span class="muted ct-small" aria-live="polite">
          {loading ? 'Loading…' : `${from}–${to} of ${total}`}
        </span>
      </div>

      {loadError && (
        <p class="ct-error" role="alert">
          {loadError}{' '}
          <button class="ct-link" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      {page && page.accounts.length === 0 && !loading && <p class="muted">No accounts match.</p>}

      <ul class="ct-adm-list">
        {page?.accounts.map((a) => (
          <AccountRow
            key={a.id}
            a={a}
            checked={selected.has(a.id)}
            onCheck={(on) => toggle(a, on)}
            open={open === a.id}
            onOpen={() => setOpen(open === a.id ? null : a.id)}
            onRenamed={(next) => {
              notify(true, `Renamed to ${next.displayName}.`);
              refresh();
            }}
            onRotate={() => askRotate(a)}
            onSignOut={() => askSignOut(a)}
            onDelete={() => askDelete(a)}
          />
        ))}
      </ul>

      <div class="ct-adm-pager">
        <button disabled={query.offset === 0 || loading} onClick={() => setQuery({ ...query, offset: Math.max(0, query.offset - PAGE) })}>
          ← Previous
        </button>
        <button disabled={to >= total || loading} onClick={() => setQuery({ ...query, offset: query.offset + PAGE })}>
          Next →
        </button>
      </div>

      {selected.size > 0 && (
        <div class="ct-adm-bulkbar" role="region" aria-label="Bulk actions">
          <span>
            <strong>{selected.size}</strong> selected
          </span>
          <button class="ct-link" onClick={() => setSelected(new Map())}>
            Clear
          </button>
          <button class="ct-danger-btn" onClick={askBulkDelete}>
            Delete selected…
          </button>
        </div>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
      {reveal && <PassphraseReveal reveal={reveal} onClose={() => (reveal.self ? location.reload() : setReveal(null))} />}
      {bulkResult && <BulkResult result={bulkResult} onClose={() => setBulkResult(null)} />}
    </section>
  );
}

function AccountRow(props: {
  a: AdminAccountView;
  checked: boolean;
  onCheck: (on: boolean) => void;
  open: boolean;
  onOpen: () => void;
  onRenamed: (a: AdminAccountView) => void;
  onRotate: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const { a } = props;
  const lockReason = a.isYou ? 'This is you' : a.isAdmin ? 'Admins cannot be deleted' : null;
  return (
    <li class={`ct-adm-acct${props.open ? ' open' : ''}`}>
      <div class="ct-adm-acct-row">
        <input
          type="checkbox"
          aria-label={`Select ${a.displayName}`}
          checked={props.checked}
          disabled={!!lockReason}
          title={lockReason ?? undefined}
          onChange={(e) => props.onCheck((e.target as HTMLInputElement).checked)}
        />
        <div class="ct-adm-who">
          <div class="ct-adm-name">
            <strong>{a.displayName}</strong>
            {a.isYou && <span class="ct-adm-badge you">you</span>}
            {a.isAdmin && <span class="ct-adm-badge admin">admin</span>}
            {a.lobby && <span class="ct-adm-badge live">in “{a.lobby.name}”</span>}
          </div>
          <code class="ct-adm-id">{a.id}</code>
        </div>
        <dl class="ct-adm-nums">
          <div>
            <dt>Games</dt>
            <dd>{a.gamesPlayed}</dd>
          </div>
          <div>
            <dt>Won</dt>
            <dd>{a.gamesWon}</dd>
          </div>
          <div>
            <dt>ST</dt>
            <dd>{a.gamesStorytold}</dd>
          </div>
        </dl>
        <div class="ct-adm-dates muted ct-small">
          <span title={a.createdAt}>Joined {fmtDate(a.createdAt)}</span>
          <span title={a.lastSeenAt}>Seen {fmtAgo(a.lastSeenAt)}</span>
          <span>
            {a.activeSessions} session{a.activeSessions === 1 ? '' : 's'}
          </span>
        </div>
        <button class="ct-adm-manage" aria-expanded={props.open} onClick={props.onOpen}>
          {props.open ? 'Close' : 'Manage'}
        </button>
      </div>
      {props.open && <ManagePanel {...props} />}
    </li>
  );
}

function ManagePanel({ a, onRenamed, onRotate, onSignOut, onDelete }: Parameters<typeof AccountRow>[0]) {
  const [name, setName] = useState(a.displayName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selfConfirm, setSelfConfirm] = useState(false);
  const changed = name.trim() !== '' && name.trim() !== a.displayName;

  const save = async (e: Event) => {
    e.preventDefault();
    if (!changed) return;
    if (a.isYou && !selfConfirm) {
      setSelfConfirm(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next = await adminApi.rename(a.id, name.trim(), a.isYou);
      setSelfConfirm(false);
      onRenamed(next);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  const deleteBlocked = a.isYou
    ? 'You cannot delete your own account.'
    : a.isAdmin
      ? 'Admin accounts cannot be deleted here — remove the id from ADMIN_ACCOUNT_IDS first.'
      : a.lobby
        ? `Seated in “${a.lobby.name}” — close that lobby first.`
        : null;

  return (
    <div class="ct-adm-manage-panel">
      <form class="ct-adm-rename" onSubmit={(e) => void save(e)}>
        <label>
          <span class="ct-small muted">Display name</span>
          <input value={name} maxLength={24} onInput={(e) => (setName((e.target as HTMLInputElement).value), setSelfConfirm(false))} disabled={busy} />
        </label>
        <button type="submit" class={selfConfirm ? 'ct-danger-btn' : 'primary'} disabled={!changed || busy}>
          {busy ? 'Saving…' : selfConfirm ? 'Yes, rename me' : 'Rename'}
        </button>
      </form>
      {selfConfirm && <p class="ct-adm-warn ct-small">This is your own account. Click again to confirm.</p>}
      {a.lobby && <p class="muted ct-small">They are in a lobby; the new name shows there after they rejoin.</p>}
      {err && (
        <p class="ct-error ct-small" role="alert">
          {err}
        </p>
      )}
      <div class="ct-adm-actions">
        <button onClick={onRotate} disabled={a.isAdmin && !a.isYou} title={a.isAdmin && !a.isYou ? 'Another admin’s passphrase cannot be rotated here' : undefined}>
          Rotate passphrase…
        </button>
        <button onClick={onSignOut}>Sign out everywhere…</button>
        <button class="ct-danger-btn" onClick={onDelete} disabled={!!deleteBlocked} title={deleteBlocked ?? undefined}>
          Delete account…
        </button>
      </div>
      {deleteBlocked && <p class="muted ct-small">{deleteBlocked}</p>}
    </div>
  );
}

function PassphraseReveal({ reveal, onClose }: { reveal: Reveal; onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <Dialog title="New passphrase" onClose={onClose} labelId="ct-adm-pass-title">
      <p>
        New passphrase for <strong>{reveal.name}</strong>. It is shown <strong>only now</strong> — copy it and hand it over privately.
      </p>
      <p class="ct-adm-passphrase" aria-label="New passphrase">
        {reveal.passphrase}
      </p>
      <div class="ct-adm-dialog-actions">
        <button type="button" onClick={() => void copyText(reveal.passphrase).then(setCopied)}>
          {copied === null ? 'Copy' : copied ? 'Copied ✓' : 'Copy failed — select it manually'}
        </button>
        <button type="button" class="primary" onClick={onClose} data-autofocus>
          {reveal.self ? 'Done — sign in again' : 'Done'}
        </button>
      </div>
    </Dialog>
  );
}

function BulkResult({ result, onClose }: { result: AdminBulkDeleteResponse; onClose: () => void }) {
  return (
    <Dialog title="Bulk delete finished" onClose={onClose} labelId="ct-adm-bulk-title">
      <p>
        Deleted <strong>{result.deleted.length}</strong> account{result.deleted.length === 1 ? '' : 's'}.
        {result.skipped.length > 0 && ` Skipped ${result.skipped.length}:`}
      </p>
      {result.skipped.length > 0 && (
        <ul class="ct-adm-namelist">
          {result.skipped.map((s) => (
            <li key={s.id}>
              <strong>{s.displayName ?? s.id}</strong> — <span class="muted">{s.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="ct-adm-dialog-actions">
        <button type="button" class="primary" onClick={onClose} data-autofocus>
          OK
        </button>
      </div>
    </Dialog>
  );
}
