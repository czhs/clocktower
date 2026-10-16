import type { ComponentType } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { IntroTourProps } from '../intro/IntroTour';
import { shortcutAllowed, storedPttCode } from '../hud/logic';
import { pttLabel } from '../../voice/ptt';
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
  // (tutorial) "Watch the tour": the video tour, loaded on demand (its own chunk + CSS).
  const [Tour, setTour] = useState<ComponentType<IntroTourProps> | null>(null);
  useEffect(() => {
    const on = () => setOpen(true);
    // (qol) "?" opens this guide from anywhere (not while typing or under another dialog).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      // (Shift is part of "?" on most layouts, so only Ctrl/Cmd/Alt rule it out)
      if (!shortcutAllowed({ key: e.key, code: e.code, repeat: e.repeat }, document.activeElement as HTMLElement | null, { modalOpen, pttCode: null })) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('ct:help', on);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ct:help', on);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const watchTour = () => {
    markSeen();
    setOpen(false);
    void import('../intro/IntroTour').then((m) => setTour(() => m.IntroTour)).catch(() => setOpen(true));
  };
  if (Tour)
    return (
      <Tour
        open
        onClose={() => {
          void import('../intro/state').then((m) => m.markIntroSeen());
          setTour(null);
        }}
      />
    );
  if (!open) return null;
  return (
    <HowToPlay
      touch={touch}
      onTour={watchTour}
      onClose={() => {
        markSeen();
        setOpen(false);
      }}
    />
  );
}

const TABS = ['Basics', 'Day & votes', 'Night', 'Voice', 'Keys'] as const;
type Tab = (typeof TABS)[number];


export function HowToPlay({ onClose, touch, onTour }: { onClose: () => void; touch?: boolean; onTour?: () => void }) {
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
  const move = touch ? 'Tap the floor, or drag the joystick' : 'WASD, arrow keys, or click the floor';
  const use = 'walk in, or tap the cottage';
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
          {TABS.filter((t) => !(touch && t === 'Keys')).map((t) => (
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
              <li>Inside, you can walk around the furniture. Walk into the doorway, use Leave, or press Escape to exit.</li>
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
              <li>
                <b>Telling the story?</b> In the waiting room, <span class="ct-help-chip">☾ Storyteller tools</span> lets you choose how to deal the
                characters (at random, a preset storyline, your own pick of characters, or seat by seat), set the timers, and practise the
                Storyteller panel on a pretend deal. Players see none of it.
              </li>
            </ul>
          )}
          {tab === 'Day & votes' && (
            <ul>
              <li>Gather in the town square, compare stories, whisper in houses — anything goes.</li>
              <li>
                When the Storyteller opens nominations, press <b>Nominate</b> next to a name in your Town list (top-left card), then <b>Confirm</b>. Each player may nominate once
                and be nominated once per day.
              </li>
              <li>
                During a vote the clock hand sweeps round the circle: press <b>Raise hand</b> before it reaches you to vote yes. Your Town list shows whose hands are up (✋) and who voted (✓).
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
              <li>At night you can walk around your home, but its door is locked. You cannot see the town or who the Storyteller visits.</li>
              <li>
                If your character acts at night the Storyteller will walk into your home and show you a prompt — choose, then wait for them to
                leave.
              </li>
              <li>At dawn deaths are announced and the day begins again.</li>
            </ul>
          )}
          {tab === 'Keys' && (
            <table class="ct-help-keys">
              <tbody>
                <tr>
                  <td>
                    <kbd>W</kbd>
                    <kbd>A</kbd>
                    <kbd>S</kbd>
                    <kbd>D</kbd> / arrows
                  </td>
                  <td>Walk (or click a place)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>E</kbd> / <kbd>Space</kbd>
                  </td>
                  <td>Use a door</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Esc</kbd>
                  </td>
                  <td>Leave a building · close a panel</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Enter</kbd>
                  </td>
                  <td>Chat</td>
                </tr>
                <tr>
                  <td>
                    <kbd>{pttLabel(storedPttCode() ?? 'KeyV')}</kbd> (hold)
                  </td>
                  <td>Push-to-talk (change it in the Voice panel)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>C</kbd>
                  </td>
                  <td>Your character card, Town list and notes</td>
                </tr>
                <tr>
                  <td>
                    <kbd>H</kbd>
                  </td>
                  <td>Raise / lower your hand during a vote</td>
                </tr>
                <tr>
                  <td>
                    <kbd>N</kbd>
                  </td>
                  <td>Your private notebook</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Q</kbd> (hold) / right-click
                  </td>
                  <td>Point at someone or something</td>
                </tr>
                <tr>
                  <td>
                    <kbd>F</kbd>
                  </td>
                  <td>Drop a pin under the cursor</td>
                </tr>
                <tr>
                  <td>
                    <kbd>?</kbd>
                  </td>
                  <td>This guide</td>
                </tr>
              </tbody>
            </table>
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
          <span class="muted ct-small">
            Reopen any time with the ? button{touch ? '' : ' or the ? key'}.
            {onTour && (
              <>
                {' '}
                <button class="ct-link ct-help-tour" onClick={onTour}>
                  ▶ Watch the tour
                </button>
              </>
            )}
          </span>
          <button class="primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
