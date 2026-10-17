import { useEffect, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import { goTo } from '../lobby/finder';
import { AccountsTab } from './AccountsTab';
import { AuditTab, LobbiesTab, SystemTab } from './OverviewTabs';
import { GamesTab } from './GamesTab'; // (records)
import { ReportsTab, SafetyTab } from './SafetyTab'; // (v2.3 OPS)
import { SettingsTab } from './SettingsTab'; // (v2.3 settings registry)
import '../auth/auth.css';
import '../lobby/lobby.css';
import './admin.css';

// Admin console at /admin. The server enforces ADMIN_ACCOUNT_IDS on every /api/admin/* route;
// this page only hides itself from non-admins (friendly message, no API calls).

type Tab = 'system' | 'accounts' | 'lobbies' | 'games' | 'reports' | 'settings' | 'panic' | 'audit';
// (v2.3) Layout: day-to-day first (overview, people, lobbies, games, reports), then the server's
// knobs ("Security & limits") and the emergency switches ("Panic"), then the audit trail.
const TABS: { id: Tab; label: string }[] = [
  { id: 'system', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'lobbies', label: 'Lobbies' },
  { id: 'games', label: 'Games' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Security & limits' },
  { id: 'panic', label: 'Panic' },
  { id: 'audit', label: 'Audit log' },
];

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? (h === 'safety' ? 'panic' : 'system')) as Tab;
}

export function AdminScreen({ account }: { account: AccountView }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; at: number } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const back = (
    <button class="ct-link" onClick={() => goTo('/')}>
      ← Back to lobbies
    </button>
  );

  if (!account.isAdmin || denied) {
    return (
      <div class="screen center">
        <div class="panel ct-admin-denied">
          <h2>Admins only</h2>
          <p>This page is for the people who run this server. Everything you need to play is back in the town square.</p>
          {back}
          <details class="ct-adm-hint">
            <summary class="muted ct-small">Running this server?</summary>
            <p class="muted ct-small">
              Add your account id <code>{account.id}</code> to <code>ADMIN_ACCOUNT_IDS</code> and restart.
            </p>
          </details>
        </div>
      </div>
    );
  }

  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(history.state, '', `/admin#${t}`);
  };
  const notify = (ok: boolean, text: string) => setNotice({ ok, text, at: Date.now() });
  const onForbidden = () => setDenied(true);

  return (
    <div class="ct-home ct-admin">
      <header class="ct-home-header">
        <div>
          <div class="ct-brand">Admin console</div>
          <div class="muted ct-small">Signed in as {account.displayName}</div>
        </div>
        {back}
      </header>
      <nav class="ct-adm-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`ct-adm-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="ct-adm-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === tab);
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
                pick(next.id);
                document.getElementById(`ct-adm-tab-${next.id}`)?.focus();
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {notice && (
        <p class={`${notice.ok ? 'ct-ok' : 'ct-error'} ct-admin-msg ct-adm-notice`} role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}
      <div id="ct-adm-panel" role="tabpanel" aria-labelledby={`ct-adm-tab-${tab}`} class="ct-adm-panel">
        {tab === 'accounts' && <AccountsTab notify={notify} onForbidden={onForbidden} />}
        {tab === 'lobbies' && <LobbiesTab notify={notify} onForbidden={onForbidden} />}
        {tab === 'games' && <GamesTab onForbidden={onForbidden} />}
        {tab === 'system' && <SystemTab onForbidden={onForbidden} />}
        {tab === 'audit' && <AuditTab onForbidden={onForbidden} />}
        {tab === 'settings' && <SettingsTab notify={notify} onForbidden={onForbidden} />}
        {tab === 'panic' && <SafetyTab notify={notify} onForbidden={onForbidden} />}
        {tab === 'reports' && <ReportsTab notify={notify} onForbidden={onForbidden} />}
      </div>
    </div>
  );
}
