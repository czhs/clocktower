import { useState } from 'preact/hooks';
import { DEFAULT_COSMETICS, DISPLAY_NAME_MAX, type AccountView, type Cosmetics } from '@ct/protocol';
import { api } from '../../net/api';
import { copyText, errorText } from '../lobby/finder';
import { HowToPlayHost, openHelp } from '../common/HowToPlay';
import { CosmeticEditor, randomPreset } from '../lobby/CosmeticEditor';
import './auth.css';

// Passphrase-only accounts: Create Account (generated passphrase shown exactly once) / Sign In
// (passphrase only — there is no username). Opened from a shared /lobby/<id> link, it says so; the
// app returns to that lobby after sign-in (main.tsx keeps the route).

type Mode = { m: 'choose' } | { m: 'create' } | { m: 'reveal'; account: AccountView; passphrase: string; cosmetics: Cosmetics } | { m: 'signin' };

export function AuthScreen({ onSignedIn }: { onSignedIn: (a: AccountView) => void }) {
  const [mode, setMode] = useState<Mode>({ m: 'choose' });
  const invited = /^\/lobby\/[A-Za-z0-9_-]{4,32}\/?$/.test(location.pathname);
  return (
    <div class="screen center ct-auth">
      <div class="panel ct-auth-panel">
        <h1 class="ct-auth-title">Clocktower Town</h1>
        <p class="muted ct-auth-sub">A gothic town of whispers, nominations and night visits.</p>
        {invited && mode.m !== 'reveal' && (
          <p class="ct-auth-invite" role="status">
            You've been invited to a lobby. Create an account or sign in and you'll be taken straight there.
          </p>
        )}
        {mode.m === 'choose' && (
          <div class="ct-auth-choose">
            <button class="primary" onClick={() => setMode({ m: 'create' })}>
              Create account
            </button>
            <button onClick={() => setMode({ m: 'signin' })}>Sign in with passphrase</button>
            <p class="muted ct-small ct-auth-note">
              No email or username — your account is a secret passphrase we generate for you.{' '}
              <button class="ct-link" onClick={openHelp}>
                How to play
              </button>
            </p>
          </div>
        )}
        {mode.m === 'create' && (
          <CreateForm onBack={() => setMode({ m: 'choose' })} onCreated={(account, passphrase, cosmetics) => setMode({ m: 'reveal', account, passphrase, cosmetics })} />
        )}
        {mode.m === 'reveal' && <Reveal passphrase={mode.passphrase} onDone={() => enterAsNew(mode.account, mode.cosmetics, onSignedIn)} />}
        {mode.m === 'signin' && <SignInForm onBack={() => setMode({ m: 'choose' })} onSignedIn={onSignedIn} />}
      </div>
      <HowToPlayHost />
    </div>
  );
}

/** Apply the villager picked during sign-up (a random premade one unless they chose). Failure is
 * harmless: they keep the default look and can change it on the home screen. */
async function enterAsNew(account: AccountView, cosmetics: Cosmetics, onSignedIn: (a: AccountView) => void) {
  if (account.cosmetics.preset === cosmetics.preset && !cosmetics.preset) return onSignedIn(account);
  try {
    onSignedIn(await api.updateMe({ cosmetics }));
  } catch {
    onSignedIn(account);
  }
}

function CreateForm({ onBack, onCreated }: { onBack: () => void; onCreated: (a: AccountView, passphrase: string, cosmetics: Cosmetics) => void }) {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Cosmetics>(() => ({ ...DEFAULT_COSMETICS, preset: randomPreset() }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return setError('Choose a display name');
    setBusy(true);
    setError(null);
    try {
      const r = await api.createAccount(name.trim());
      onCreated(r.account, r.passphrase, { ...r.account.cosmetics, preset: look.preset ?? null });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <form class="ct-auth-form" onSubmit={submit}>
      <label class="ct-field">
        <span>Display name</span>
        <input
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          autoComplete="nickname"
          placeholder="How the town will know you"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
        <small class="muted">Shown to other players; it does not need to be unique and you can change it later.</small>
      </label>
      <div class="ct-field">
        <span>Pick your villager</span>
        <CosmeticEditor value={look} onChange={setLook} compact simple />
      </div>
      {error && <p class="ct-error" role="alert">{error}</p>}
      <div class="ct-row">
        <button type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

function Reveal({ passphrase, onDone }: { passphrase: string; onDone: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <div class="ct-auth-form">
      <p>
        <strong>This passphrase is your only way to sign in.</strong> There is no username, email or recovery.
        It is shown <strong>only once</strong> — store it in a password manager or write it down now.
      </p>
      <div class="ct-passphrase" aria-label="Your passphrase">
        {passphrase}
      </div>
      {/* Lets password managers offer to save it (no username exists). */}
      <form class="ct-hidden-form" onSubmit={(e) => e.preventDefault()} aria-hidden="true">
        <input type="password" autoComplete="new-password" value={passphrase} readOnly tabIndex={-1} />
      </form>
      <div class="ct-row">
        <button onClick={async () => setCopied(await copyText(passphrase))}>Copy passphrase</button>
        {copied === true && <span class="ct-ok">Copied</span>}
        {copied === false && <span class="ct-error">Copy failed — select and copy it manually.</span>}
      </div>
      <label class="ct-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved((e.currentTarget as HTMLInputElement).checked)} />
        <span>I have saved my passphrase somewhere safe</span>
      </label>
      <div class="ct-row">
        <button class="primary" disabled={!saved} onClick={onDone}>
          Enter the town
        </button>
      </div>
    </div>
  );
}

function SignInForm({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (a: AccountView) => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (passphrase.trim().length < 10) return setError('Enter your full passphrase');
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.signIn(passphrase));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <form class="ct-auth-form" onSubmit={submit}>
      <label class="ct-field">
        <span>Passphrase</span>
        <input
          type={show ? 'text' : 'password'}
          value={passphrase}
          autoFocus
          autoComplete="current-password"
          spellcheck={false}
          autoCapitalize="none"
          placeholder="six words separated by spaces"
          onInput={(e) => setPassphrase((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="ct-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow((e.currentTarget as HTMLInputElement).checked)} />
        <span>Show passphrase</span>
      </label>
      {error && <p class="ct-error" role="alert">{error}</p>}
      <div class="ct-row">
        <button type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
