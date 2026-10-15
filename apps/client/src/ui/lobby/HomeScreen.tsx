import { useEffect, useState } from 'preact/hooks';
import { DISPLAY_NAME_MAX, type AccountView, type Cosmetics, type StatsView } from '@ct/protocol';
import { api } from '../../net/api';
import { CosmeticEditor } from './CosmeticEditor';
import { LobbyFinder } from './LobbyFinder';
import { HowToPlayHost, openHelp } from '../common/HowToPlay';
import { signOutAll } from '../common/http';
import { errorText, goTo } from './finder';
import '../auth/auth.css';
import './lobby.css';

// Account home: account header (display name edit), cosmetic editor,
// stats, live Lobby Finder and the Create Lobby modal (no password field).
export function HomeScreen({
  account,
  onAccountChange,
  onSignedOut,
  onJoin,
}: {
  account: AccountView;
  onAccountChange: (a: AccountView) => void;
  onSignedOut: () => void;
  onJoin: (lobbyId: string, intent: 'player' | 'storyteller') => void;
}) {
  return (
    <div class="ct-home">
      <AccountHeader account={account} onAccountChange={onAccountChange} onSignedOut={onSignedOut} />
      <div class="ct-home-grid">
        <aside class="ct-home-side">
          <AppearancePanel account={account} onAccountChange={onAccountChange} />
          <StatsPanel />
        </aside>
        <main class="ct-home-main">
          <LobbyFinder onJoin={onJoin} />
        </main>
      </div>
      <HowToPlayHost />
    </div>
  );
}

function AccountHeader({
  account,
  onAccountChange,
  onSignedOut,
}: {
  account: AccountView;
  onAccountChange: (a: AccountView) => void;
  onSignedOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.displayName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name cannot be empty');
    setBusy(true);
    try {
      onAccountChange(await api.updateMe({ displayName: name.trim() }));
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.signOut();
    } finally {
      onSignedOut();
    }
  };
  const signOutEverywhere = async () => {
    if (!confirm('Sign out on every device and browser where this account is signed in? You will need your passphrase to sign back in.')) return;
    setBusy(true);
    try {
      await signOutAll();
      onSignedOut();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <header class="ct-home-header">
      <div class="ct-brand">Clocktower Town</div>
      <div class="ct-account">
        {editing ? (
          <form class="ct-row" onSubmit={save}>
            <input value={name} maxLength={DISPLAY_NAME_MAX} autoFocus aria-label="Display name" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
            <button type="submit" class="primary" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(account.displayName);
                setError(null);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span class="ct-account-name">{account.displayName}</span>
            <button class="ct-link" onClick={() => setEditing(true)}>
              Rename
            </button>
          </>
        )}
        <button class="ct-link" onClick={openHelp}>
          How to play
        </button>
        {account.isAdmin && (
          <button class="ct-link" onClick={() => goTo('/admin')}>
            Admin
          </button>
        )}
        <button onClick={signOut}>Sign out</button>
        <button class="ct-link ct-small" onClick={signOutEverywhere} disabled={busy} title="Ends every session of this account">
          Sign out on all devices
        </button>
      </div>
      {error && <p class="ct-error ct-header-error">{error}</p>}
    </header>
  );
}

function AppearancePanel({ account, onAccountChange }: { account: AccountView; onAccountChange: (a: AccountView) => void }) {
  const [draft, setDraft] = useState<Cosmetics>(account.cosmetics);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(account.cosmetics);
  const save = async () => {
    setStatus('Saving…');
    try {
      onAccountChange(await api.updateMe({ cosmetics: draft }));
      setStatus('Saved');
    } catch (err) {
      setStatus(errorText(err));
    }
  };
  return (
    <section class="panel ct-side-panel">
      <h3>Your villager</h3>
      <CosmeticEditor value={draft} onChange={(c) => (setDraft(c), setStatus(null))} />
      <div class="ct-row">
        {status && <span class="muted ct-small">{status}</span>}
        <button class="primary" disabled={!dirty} onClick={save}>
          Save character
        </button>
      </div>
      <p class="muted ct-small ct-account-id">
        Account id: <code>{account.id}</code>
      </p>
    </section>
  );
}

function StatsPanel() {
  const [stats, setStats] = useState<StatsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <section class="panel ct-side-panel">
      <h3>Record</h3>
      {error && <p class="ct-error">{error}</p>}
      {!stats && !error && <p class="muted">Loading…</p>}
      {stats && (
        <>
          <dl class="ct-stats">
            <Stat label="Games played" value={stats.matchesPlayed} />
            <Stat label="Completed" value={stats.matchesCompleted} />
            <Stat label="Wins" value={stats.wins} />
            <Stat label="Losses" value={stats.losses} />
            <Stat label="Good wins" value={stats.goodWins} />
            <Stat label="Evil wins" value={stats.evilWins} />
            <Stat label="Executed" value={stats.timesExecuted} />
            <Stat label="Died" value={stats.timesDied} />
            <Stat label="Nominations" value={stats.nominationsMade} />
            <Stat label="Ghost votes" value={stats.ghostVotesUsed} />
            <Stat label="Storytold" value={stats.gamesStorytold} />
          </dl>
          {stats.roleHistory.length > 0 && (
            <>
              <h4>Recent characters</h4>
              <ul class="ct-history">
                {stats.roleHistory.slice(0, 8).map((r) => (
                  <li key={r.matchId}>
                    <span class={r.alignment === 'good' ? 'ct-good' : 'ct-evil'}>{r.character.replace(/_/g, ' ')}</span>
                    <span class={r.won ? 'ct-ok' : 'muted'}>{r.won ? 'won' : 'lost'}</span>
                    <span class="muted">{new Date(r.endedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div class="ct-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
