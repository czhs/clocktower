import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_COSMETICS, DISPLAY_NAME_MAX, type AccountView, type Cosmetics } from '@ct/protocol';
import { api } from '../../net/api';
import { copyText, errorText } from '../lobby/finder';
import { HowToPlayHost, openHelp } from '../common/HowToPlay';
import { CosmeticEditor, randomPreset } from '../lobby/CosmeticEditor';
import { Hero } from './Hero';
import { TourHost, useIntro, type IntroReason } from './Tour';
import './auth.css';
import './landing.css';

// Passphrase-only accounts: Create Account (generated passphrase shown exactly once) / Sign In
// (passphrase only — there is no username). Opened from a shared /lobby/<id> link, it says so; the
// app returns to that lobby after sign-in (main.tsx keeps the route).

const TAGLINE = 'Lanterns are lit, doors are locked, and one of your friends is lying.';
/** Intrinsic size of /landing/logo.(webp|png), so the header never jumps while it loads. */
const LOGO_W = 640;
const LOGO_H = 374;

type Mode = { m: 'choose' } | { m: 'create' } | { m: 'reveal'; account: AccountView; passphrase: string; cosmetics: Cosmetics } | { m: 'signin' };

export function AuthScreen({ onSignedIn }: { onSignedIn: (a: AccountView) => void }) {
  const [mode, setMode] = useState<Mode>({ m: 'choose' });
  const invited = /^\/lobby\/[A-Za-z0-9_-]{4,32}\/?$/.test(location.pathname);
  const intro = useIntro();
  const onTour = (r: IntroReason) => {
    // "Join" from the tour, or skipping it when invited, goes straight to account creation.
    if (r === 'join' || r === 'finish' || (invited && r === 'skip')) setMode((m) => (m.m === 'choose' ? { m: 'create' } : m));
  };
  return (
    <div class={`screen ct-landing ct-landing-${mode.m}${invited ? ' is-invited' : ''}`}>
      <Hero />
      <div class="ct-landing-scroll">
        <main class="ct-landing-main">
          <header class="ct-landing-head">
            <h1 class="ct-logo">
              <picture>
                <source type="image/webp" srcset="/landing/logo.webp" />
                <img src="/landing/logo.png" alt="Clocktower Town" width={LOGO_W} height={LOGO_H} decoding="async" draggable={false} />
              </picture>
            </h1>
            {mode.m === 'choose' && <p class="ct-tagline">{TAGLINE}</p>}
          </header>
          <div class="ct-card-wrap">
          {mode.m === 'choose' && (
            <>
              <img class="ct-peek ct-peek-a" src="/landing/villager-1.png" alt="" width={70} height={112} aria-hidden="true" draggable={false} />
              <img class="ct-peek ct-peek-b" src="/landing/villager-5.png" alt="" width={65} height={112} aria-hidden="true" draggable={false} />
            </>
          )}
          <section class="ct-card" aria-labelledby="ct-card-title">
            <CardClock />
            <i class="ct-card-lantern" aria-hidden="true" />
            {mode.m === 'choose' && invited && (
              <div class="ct-card-body ct-invite">
                <img class="ct-invite-art" src="/landing/window-2.png" alt="" width={160} height={186} aria-hidden="true" draggable={false} />
                <h2 id="ct-card-title" class="ct-card-title">You've been invited</h2>
                <p class="ct-card-lede">Your friends are gathering in the town square. Pick a villager and you'll walk straight in.</p>
                <div class="ct-actions">
                  <button class="ct-btn ct-btn-primary ct-btn-big" onClick={() => setMode({ m: 'create' })}>
                    Join the game
                  </button>
                  <button class="ct-btn ct-btn-secondary" onClick={() => setMode({ m: 'signin' })}>
                    Sign in with passphrase
                  </button>
                </div>
                <p class="ct-card-note">New here? Joining makes you an account in seconds: no email, no username.</p>
              </div>
            )}
            {mode.m === 'choose' && !invited && (
              <div class="ct-card-body">
                <h2 id="ct-card-title" class="ct-card-title">Welcome, traveller</h2>
                <div class="ct-actions">
                  <button class="ct-btn ct-btn-primary ct-btn-big" onClick={() => setMode({ m: 'create' })}>
                    Create account
                  </button>
                  <button class="ct-btn ct-btn-secondary" onClick={() => setMode({ m: 'signin' })}>
                    Sign in with passphrase
                  </button>
                </div>
                <p class="ct-card-note">No email or username — your account is a secret passphrase we generate for you.</p>
              </div>
            )}
            {mode.m === 'create' && (
              <div class="ct-card-body">
                <h2 id="ct-card-title" class="ct-card-title">{invited ? 'Join the game' : 'A new villager'}</h2>
                <CreateForm onBack={() => setMode({ m: 'choose' })} onCreated={(account, passphrase, cosmetics) => setMode({ m: 'reveal', account, passphrase, cosmetics })} />
              </div>
            )}
            {mode.m === 'reveal' && (
              <div class="ct-card-body">
                <h2 id="ct-card-title" class="ct-card-title">Your secret passphrase</h2>
                <Reveal passphrase={mode.passphrase} onDone={() => enterAsNew(mode.account, mode.cosmetics, onSignedIn)} />
              </div>
            )}
            {mode.m === 'signin' && (
              <div class="ct-card-body">
                <h2 id="ct-card-title" class="ct-card-title">Welcome back</h2>
                <SignInForm onBack={() => setMode({ m: 'choose' })} onSignedIn={onSignedIn} />
              </div>
            )}
          </section>
          </div>
          {mode.m !== 'reveal' && (
            <nav class="ct-landing-links" aria-label="Learn about the game">
              {intro && (
                <button class="ct-tour-link" onClick={() => intro.openIntro()}>
                  <span class="ct-tour-play" aria-hidden="true">▶</span> Watch the tour
                </button>
              )}
              <button class="ct-landing-link" onClick={openHelp}>
                How to play
              </button>
            </nav>
          )}
        </main>
      </div>
      <TourHost mod={intro} invited={invited} onAction={onTour} />
      <HowToPlayHost />
    </div>
  );
}

/** Clock medallion on the card: the visitor's local time; the minute hand steps each minute. */
function CardClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const m = now.getMinutes();
  const h = (now.getHours() % 12) + m / 60;
  return (
    <div class="ct-card-clock" aria-hidden="true">
      <img class="ct-clock-face" src="/landing/clock-face.png" alt="" width={176} height={174} draggable={false} />
      <img class="ct-clock-hour" src="/landing/clock-hour.png" alt="" draggable={false} style={{ transform: `rotate(${h * 30}deg)` }} />
      <img class="ct-clock-min" src="/landing/clock-minute.png" alt="" draggable={false} style={{ transform: `rotate(${m * 6}deg)` }} />
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
      <p class="ct-reveal-lede">
        <strong>Save this now: it is your only way back in.</strong> No username, email or recovery, and it is shown{' '}
        <strong>only once</strong>. A password manager or paper both work.
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
