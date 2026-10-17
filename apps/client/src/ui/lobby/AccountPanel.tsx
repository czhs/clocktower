// (v2.3 AUTH-5 / AUTH-6) Home-screen "Account" section: download your data, delete your account.
// Deleting asks for the passphrase again (a stolen cookie alone cannot delete an account).
import { useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import { ApiFailure } from '../../net/api';
import { postJson } from '../common/http';
import { errorText } from './finder';

async function downloadExport(account: AccountView): Promise<void> {
  const res = await fetch('/api/me/export', { credentials: 'same-origin' });
  if (!res.ok) {
    let body: unknown = {};
    try {
      body = await res.json();
    } catch {
      body = { error: 'internal', message: `Export failed (${res.status})` };
    }
    throw new ApiFailure(res.status, body as ConstructorParameters<typeof ApiFailure>[1]);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clocktower-account-${account.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function AccountPanel({ account, onDeleted }: { account: AccountView; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [sure, setSure] = useState(false);

  const exportData = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await downloadExport(account);
      setStatus({ text: 'Your data was downloaded as a JSON file.', tone: 'ok' });
    } catch (e) {
      setStatus({ text: errorText(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await postJson('/api/me/delete', { passphrase, confirm: 'delete' });
      onDeleted();
    } catch (err) {
      setStatus({ text: errorText(err), tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <section class="panel ct-side-panel ct-account-panel">
      <h3>Account</h3>
      <div class="ct-row">
        <button type="button" onClick={() => void exportData()} disabled={busy}>
          Export my data
        </button>
        {!deleting && (
          <button type="button" class="ct-link ct-small" onClick={() => setDeleting(true)} disabled={busy}>
            Delete account…
          </button>
        )}
      </div>
      {deleting && (
        <form class="ct-account-delete" onSubmit={(e) => void deleteAccount(e)}>
          <p class="ct-small">
            Deleting <strong>{account.displayName}</strong> is permanent. You are signed out everywhere, your private notebooks are
            deleted, and your past games stay in the history as an anonymous “Deleted player”.
          </p>
          <label class="ct-small">
            Your passphrase
            <input
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onInput={(e) => setPassphrase((e.currentTarget as HTMLInputElement).value)}
              disabled={busy}
            />
          </label>
          <label class="ct-small">
            <input type="checkbox" checked={sure} onChange={(e) => setSure((e.currentTarget as HTMLInputElement).checked)} disabled={busy} /> Yes, delete my
            account permanently
          </label>
          <div class="ct-row">
            <button type="submit" class="ct-danger-btn" disabled={busy || !sure || passphrase.trim().length < 10}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleting(false);
                setPassphrase('');
                setSure(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {status && <p class={status.tone === 'error' ? 'ct-error ct-small' : 'muted ct-small'}>{status.text}</p>}
    </section>
  );
}
