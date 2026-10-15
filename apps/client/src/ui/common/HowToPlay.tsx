import { useEffect, useRef, useState } from 'preact/hooks';
import './help.css';

// "How to play": a short, dismissible guide reachable from the home header, the waiting room and
// the in-game toolbar (any code can open it with `openHelp()`). It never opens by itself (it would
// cover controls); instead `helpSeen()` lets the waiting room highlight it for first-timers.

const SEEN_KEY = 'ct.help.seen.v1';

export function openHelp() {
  window.dispatchEvent(new CustomEvent('ct:help'));
}

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

/** Mount once per screen. `autoOpen` shows it on the very first visit. */
export function HowToPlayHost({ autoOpen = false, touch = false }: { autoOpen?: boolean; touch?: boolean }) {
  const [open, setOpen] = useState(() => autoOpen && !helpSeen());
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('ct:help', on);
    return () => window.removeEventListener('ct:help', on);
  }, []);
  if (!open) return null;
  return (
    <HowToPlay
      touch={touch}
      onClose={() => {
        markSeen();
        setOpen(false);
      }}
    />
  );
}

const TABS = ['Basics', 'Day & votes', 'Night', 'Voice'] as const;
type Tab = (typeof TABS)[number];

export function HowToPlay({ onClose, touch }: { onClose: () => void; touch?: boolean }) {
  const [tab, setTab] = useState<Tab>('Basics');
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useEffect(() => {
    prevFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  const move = touch ? 'Drag the joystick (bottom-left)' : 'WASD or the arrow keys';
  const use = touch ? 'tap the door button' : 'press E or Space';
  return (
    <div class="ct-help-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="ct-help panel" role="dialog" aria-modal="true" aria-labelledby="ct-help-title">
        <header class="ct-help-head">
          <h2 id="ct-help-title">How to play</h2>
          <button ref={closeRef} class="ct-help-close" onClick={onClose} aria-label="Close how to play">
            ✕
          </button>
        </header>
        <nav class="ct-help-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div class="ct-help-body" role="tabpanel">
          {tab === 'Basics' && (
            <ul>
              <li>
                <b>Move:</b> {move}. <b>Doors:</b> walk up to one and {use}.
              </li>
              <li>
                <b>Your home:</b> once the game starts you get a cottage. The <span class="ct-help-chip">⌂ Home</span> compass at the bottom of the
                screen points the way.
              </li>
              <li>
                <b>Your character</b> is secret and shown only to you in the card at the top-left. Good must find and execute the Demon; Evil wins
                when only two players remain alive.
              </li>
              <li>
                <b>Chat:</b> press Enter to type. Only people who can hear you (same room or nearby) see it.
              </li>
              <li>
                <b>The Storyteller</b> (hooded figure) runs the game: they know every character, wake you at night and announce deaths at dawn.
              </li>
            </ul>
          )}
          {tab === 'Day & votes' && (
            <ul>
              <li>Gather in the town square, compare stories, whisper in houses — anything goes.</li>
              <li>
                When the Storyteller opens nominations, press <b>Nominate</b> next to a name in your Town list. Each player may nominate once and be
                nominated once per day.
              </li>
              <li>
                During a vote the clock hand sweeps round the circle: press <b>Raise hand</b> before it reaches you to vote yes.
              </li>
              <li>The player with the most votes (at least half the living) is executed at the end of the day.</li>
              <li>
                <b>Dead players</b> become ghosts: they still talk, cannot nominate, and have <b>one ghost vote</b> for the rest of the game.
              </li>
            </ul>
          )}
          {tab === 'Night' && (
            <ul>
              <li>When the bell tolls, walk home before the countdown ends (you are carried home if late).</li>
              <li>At night everyone is locked inside. You cannot see the town or who the Storyteller visits.</li>
              <li>
                If your character acts at night the Storyteller will walk into your home and show you a prompt — choose, then wait for them to
                leave.
              </li>
              <li>At dawn deaths are announced and the day begins again.</li>
            </ul>
          )}
          {tab === 'Voice' && (
            <ul>
              <li>
                Press <b>Enable voice</b> in the Voice panel (bottom-right) and allow the microphone. Text chat works without it.
              </li>
              <li>
                <b>Push-to-talk:</b> hold <kbd>V</kbd> (changeable), or switch to <b>Open mic</b>.
              </li>
              <li>In the town square everyone hears everyone. On the streets voices fade with distance. Indoors, only the same room can hear you.</li>
              <li>At night only the Storyteller and the player being visited can hear each other.</li>
            </ul>
          )}
        </div>
        <footer class="ct-help-foot">
          <span class="muted ct-small">Reopen any time with the ? button.</span>
          <button class="primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
