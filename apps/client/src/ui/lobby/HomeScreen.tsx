import { useEffect, useState } from 'preact/hooks';
import { DISPLAY_NAME_MAX, type AccountView } from '@ct/protocol';
import { api } from '../../net/api';
import { CharacterPicker, characterOf } from './CharacterPicker';
import { LobbyFinder } from './LobbyFinder';
import { StatsPanel } from './StatsPanel'; // (v2.2 stats)
import { AccountPanel } from './AccountPanel'; // (v2.3 AUTH-5/6)
import { HowToPlayHost, openHelp } from '../common/HowToPlay';
import { openRulebook, RulebookHost } from '../rulebook';
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
          <AccountPanel account={account} onDeleted={onSignedOut} />
        </aside>
        <main class="ct-home-main">
          <LobbyFinder onJoin={onJoin} />
          <StatsPanel />
        </main>
      </div>
      <HowToPlayHost />
      <RulebookHost />
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
        <button class="ct-link" onClick={openRulebook}>
          Rulebook
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
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  // Picking in a lobby also updates the account, so refresh it when the home screen opens.
  useEffect(() => {
    api
      .me()
      .then(onAccountChange)
      .catch(() => undefined);
  }, []);
  const pick = async (id: string) => {
    setPending(id);
    setStatus(null);
    try {
      onAccountChange(await api.updateMe({ cosmetics: { ...account.cosmetics, preset: id } }));
      setStatus({ text: 'Saved. You will be this character in your next game.', tone: 'ok' });
    } catch (err) {
      setStatus({ text: errorText(err), tone: 'error' });
    } finally {
      setPending(null);
    }
  };
  return (
    <section class="panel ct-side-panel">
      <h3>Your character</h3>
      <CharacterPicker
        value={characterOf(account.cosmetics)?.id ?? null}
        pending={pending}
        onPick={(id) => void pick(id)}
        status={status}
        compact
      />
      <p class="muted ct-small">If someone in a lobby already has your character, you get a free one there; change it in the lobby.</p>
      <p class="muted ct-small ct-account-id">
        Account id: <code>{account.id}</code>
      </p>
    </section>
  );
}
