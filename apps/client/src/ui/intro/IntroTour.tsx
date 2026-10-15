import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CARDS, INVITED_CARDS, type TourCard } from './cards';
import { clipUrl, loadManifest, type TourManifest } from './manifest';
import './intro.css';

// The pre-sign-in tour (tutorial teammate): 4-7 cards, each a short looping, muted clip of real
// gameplay with a one-line caption. Skippable at every step; ←/→/Esc; swipe on touch. Only the
// current clip (and the next one's metadata + poster) are loaded. Under reduced motion clips never
// autoplay: the poster shows, with a Play button. All text is rendered by Preact (escaped).

export type IntroCloseReason = 'skip' | 'finish' | 'join';

export interface IntroTourProps {
  open: boolean;
  onClose: (reason: IntroCloseReason) => void;
  /** Opened from a /lobby/<id> invite: a shorter tour with "Join the game" as the main action. */
  invited?: boolean;
}

export function IntroTour({ open, onClose, invited = false }: IntroTourProps) {
  if (!open || typeof document === 'undefined') return null;
  // Portalled to <body>: above every screen's stacking context and outside screen-scoped button skins.
  return createPortal(<Tour onClose={onClose} invited={invited} />, document.body);
}

function useReducedMotion(): boolean {
  const q = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

function Tour({ onClose, invited }: { onClose: (r: IntroCloseReason) => void; invited: boolean }) {
  const cards = invited ? CARDS.filter((c) => INVITED_CARDS.includes(c.id)) : CARDS;
  const [i, setI] = useState(0);
  const [manifest, setManifest] = useState<TourManifest | null | undefined>(undefined);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const card = cards[i]!;
  const next = cards[i + 1];
  const last = i === cards.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(cards.length - 1, n)));

  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);

  // Focus + keyboard. Keys never reach the game behind the tour (capture phase on window).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current('skip');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setI((n) => Math.min(cards.length - 1, n + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      } else if (e.key === 'Tab') {
        // keep focus inside the dialog
        const els = [...(rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], video[controls]') ?? [])];
        if (!els.length) return;
        const at = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && at <= 0) (e.preventDefault(), els.at(-1)!.focus());
        else if (!e.shiftKey && (at === -1 || at === els.length - 1)) (e.preventDefault(), els[0]!.focus());
      }
    };
    const stop = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', stop, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', stop, true);
      prev?.focus?.();
    };
  }, [cards.length]);

  // Swipe (touch / pen / mouse drag) on the clip.
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) go(i + (dx < 0 ? 1 : -1));
  };

  const primary = invited
    ? { label: 'Join the game', act: () => onClose('join') }
    : last
      ? { label: 'Start playing', act: () => onClose('finish') }
      : { label: 'Next', act: () => go(i + 1) };

  return (
    <div class="ct-intro" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="ct-intro-title" aria-describedby="ct-intro-lines">
      <div class="ct-intro-frame">
        <header class="ct-intro-head">
          <span class="ct-intro-eyebrow">{invited ? 'You’re invited · a quick look' : 'Clocktower Town · a one-minute tour'}</span>
          <button class="ct-intro-skip" onClick={() => onClose('skip')}>
            {invited ? 'Skip tour' : 'Skip — create account / sign in'}
          </button>
        </header>

        <div class="ct-intro-stage" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)}>
          <Media key={card.id} card={card} manifest={manifest} reduced={reduced} />
          {next && manifest && <Prefetch card={next} manifest={manifest} reduced={reduced} />}
        </div>

        <div class="ct-intro-text" key={`t-${card.id}`} aria-live="polite">
          <h2 id="ct-intro-title">{card.title}</h2>
          <div id="ct-intro-lines">
            {card.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>

        <footer class="ct-intro-foot">
          <button class="ct-intro-back" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous card">
            ‹ Back
          </button>
          <div class="ct-intro-dots" role="group" aria-label="Tour cards">
            {cards.map((c, n) => (
              <button
                key={c.id}
                class={`ct-intro-dot${n === i ? ' on' : ''}`}
                aria-label={`Card ${n + 1} of ${cards.length}: ${c.title}`}
                aria-current={n === i ? 'step' : undefined}
                onClick={() => go(n)}
              />
            ))}
          </div>
          {invited && !last && (
            <button class="ct-intro-next" onClick={() => go(i + 1)}>
              Next ›
            </button>
          )}
          <button ref={primaryRef} class="primary ct-intro-primary" onClick={primary.act}>
            {primary.label}
            {!invited && !last ? ' ›' : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Media({ card, manifest, reduced }: { card: TourCard; manifest: TourManifest | null | undefined; reduced: boolean }) {
  const clip = manifest?.clips?.[card.clip];
  const [play, setPlay] = useState(!reduced);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => setPlay(!reduced), [reduced]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !play) return;
    v.muted = true;
    void v.play().catch(() => undefined);
  }, [play, clip]);
  if (manifest === undefined) return <div class="ct-intro-media ct-intro-loading" aria-hidden="true" />;
  const poster = clip && manifest ? clipUrl(manifest, clip.poster) : null;
  const webm = clip && manifest ? clipUrl(manifest, clip.webm) : null;
  const mp4 = clip && manifest ? clipUrl(manifest, clip.mp4) : null;
  if (!clip || !poster || (!webm && !mp4))
    return (
      <div class="ct-intro-media ct-intro-ph" aria-hidden="true">
        <span>{card.glyph}</span>
      </div>
    );
  if (failed)
    return (
      <div class="ct-intro-media">
        <img class="ct-intro-poster" src={poster} alt={`Gameplay still: ${card.title}`} width={clip.width} height={clip.height} decoding="async" />
      </div>
    );
  if (!play)
    return (
      <button type="button" class="ct-intro-media ct-intro-posterbtn" onClick={() => setPlay(true)} aria-label={`Play the clip: ${card.title}`}>
        <img class="ct-intro-poster" src={poster} alt="" width={clip.width} height={clip.height} decoding="async" />
        <span class="ct-intro-play" aria-hidden="true">
          ▶
        </span>
      </button>
    );
  return (
    <video
      ref={ref}
      class="ct-intro-media"
      poster={poster}
      width={clip.width}
      height={clip.height}
      muted
      loop
      autoplay
      playsInline
      preload="metadata"
      aria-label={`Gameplay clip: ${card.title}`}
      onError={() => setFailed(true)}
    >
      {webm && <source src={webm} type='video/webm; codecs="vp9"' />}
      {mp4 && <source src={mp4} type="video/mp4" onError={() => setFailed(true)} />}
    </video>
  );
}

/** The next card: its poster and video metadata only, so "Next" starts instantly. */
function Prefetch({ card, manifest, reduced }: { card: TourCard; manifest: TourManifest; reduced: boolean }) {
  const clip = manifest.clips?.[card.clip];
  if (!clip) return null;
  const poster = clipUrl(manifest, clip.poster);
  const webm = clipUrl(manifest, clip.webm);
  const mp4 = clipUrl(manifest, clip.mp4);
  return (
    <div class="ct-intro-prefetch" aria-hidden="true">
      {poster && <img src={poster} alt="" decoding="async" />}
      {!reduced && (
        <video muted playsInline preload="metadata" tabIndex={-1}>
          {webm && <source src={webm} type='video/webm; codecs="vp9"' />}
          {mp4 && <source src={mp4} type="video/mp4" />}
        </video>
      )}
    </div>
  );
}
