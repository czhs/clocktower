// OWNED BY notebook. Private per-game notebook (HUD). Mounted by GameScreen with {conn, touch}.
//
// A small book button sits at the left end of the top-right toolbar (N toggles it, except while
// typing). It opens a compact drawer over the right edge of the town (a bottom sheet on phones):
// every seat with their name + character portrait, a one-line note, a quick trust marker
// (★ / ? / ✗) and a role guess; below that a free-text page. Everything autosaves (no save
// button) to the server, which only ever sends it back to you. Nothing notifies, nothing is unread.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  NOTEBOOK_NOTE_MAX,
  NOTEBOOK_TEXT_MAX,
  type CharacterId,
  type CharacterType,
  type NotebookMark,
  type PublicPlayerView,
} from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { CastPortrait } from '../common/castPortrait';
import { RoleIcon } from '../common/RoleIcon';
import { reducedMotion } from '../../game/fx/motion';
import { notebookFor } from './controller';
import { saveStatus, seatNote, usage, type SaveStatus } from './model';
import './notebook.css';

const MARKS: { id: NotebookMark; glyph: string; label: string }[] = [
  { id: 'trust', glyph: '★', label: 'Trust' },
  { id: 'unsure', glyph: '?', label: 'Unsure' },
  { id: 'distrust', glyph: '✗', label: 'Suspect' },
];

const GROUPS: { type: CharacterType; label: string }[] = [
  { type: 'townsfolk', label: 'Townsfolk' },
  { type: 'outsider', label: 'Outsiders' },
  { type: 'minion', label: 'Minions' },
  { type: 'demon', label: 'Demon' },
];

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: 'Opening…',
  saved: 'Saved',
  unsaved: 'Saving…',
  saving: 'Saving…',
  retrying: 'Saving soon…',
  offline: 'Offline — saves when you reconnect',
  closed: '',
};

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  const tag = n.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
}

export function Notebook({ conn, touch }: { conn: RoomConnection; touch: boolean }) {
  const game = useStore(conn.gameView);
  const lobby = useStore(conn.lobbyView);
  const ctl = useMemo(() => notebookFor(conn), [conn]);
  const nb = useStore(ctl.state);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasGame = !!game && !!nb.matchId;

  // Ask for the notebook once mounted (it may have been pushed before this UI existed).
  useEffect(() => {
    if (game && !nb.loaded) ctl.load();
  }, [ctl, !!game, nb.loaded]);
  // Back in the waiting room (rematch): close; the next game brings a fresh notebook.
  useEffect(() => {
    if (!game) setOpen(false);
  }, [!!game]);

  const close = () => {
    setOpen(false);
    ctl.flush();
    // Hand the keyboard back to the town (Enter = chat, WASD = walk).
    const a = document.activeElement as HTMLElement | null;
    if (a && drawerRef.current?.contains(a)) a.blur();
  };

  // N toggles (never while typing / with modifiers / under a modal); Escape closes.
  useEffect(() => {
    if (!hasGame) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && open) {
        const inside = drawerRef.current?.contains(document.activeElement);
        if (!inside && isTypingTarget(document.activeElement)) return; // e.g. the chat box owns Escape
        e.preventDefault();
        e.stopImmediatePropagation(); // don't also "leave the building"
        close();
        return;
      }
      if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      if (open) close();
      else setOpen(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasGame, open]);

  // Opening moves focus into the drawer (not into a field: walking keys keep working).
  useEffect(() => {
    if (open) drawerRef.current?.focus({ preventScroll: true });
  }, [open]);

  useToolbarDock(btnRef, hasGame);
  useVoiceClearance(drawerRef, open && !touch);

  if (!hasGame) return null;
  const players = [...(game.players ?? [])].sort((a, b) => a.seat - b.seat);
  const mySeat = game.kind === 'player' ? game.you.seat : null;
  const presetOf = (pid: string) => lobby?.members.find((m) => m.pid === pid)?.cosmetics.preset ?? null;
  const status = saveStatus(nb, Date.now());
  const full = usage(nb.data);
  const isSt = game.kind === 'storyteller';

  return (
    <>
      <button
        ref={btnRef}
        class={`ctn-book${open ? ' on' : ''}`}
        aria-label={open ? 'Close your notebook' : 'Open your private notebook'}
        aria-expanded={open}
        aria-controls="ctn-drawer"
        title={touch ? 'Notebook (private)' : 'Notebook (private) · N'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <BookGlyph />
      </button>
      {open && (
        <aside
          id="ctn-drawer"
          ref={drawerRef}
          class={`ctn${touch ? ' ctn-touch' : ''}${reducedMotion() ? ' ctn-still' : ''}`}
          tabIndex={-1}
          role="complementary"
          aria-label="Your private notebook"
        >
          <header class="ctn-head">
            <span class="ctn-title">Notebook</span>
            <span class={`ctn-status ctn-status-${status}`} role="status" aria-live="polite">
              {status === 'saved' && <span aria-hidden="true">✓ </span>}
              {STATUS_TEXT[status]}
            </span>
            <button class="ctn-close" onClick={close} aria-label="Close notebook" title={touch ? 'Close' : 'Close · N or Esc'}>
              ✕
            </button>
          </header>
          <p class="ctn-private">
            <span aria-hidden="true">🔒</span> {isSt ? 'Your scratchpad — players never see it.' : 'Only you can see this — not even the Storyteller.'}
          </p>
          {nb.notice && (
            <div class="ctn-notice" role="alert">
              <span>Newer notes from your other device were loaded.</span>
              <span class="ctn-notice-actions">
                <button onClick={() => ctl.keepMine()}>Keep this device's</button>
                <button class="primary" onClick={() => ctl.dismissNotice()}>
                  OK
                </button>
              </span>
            </div>
          )}
          {!nb.loaded ? (
            <div class="ctn-loading">
              <span class="ct-spinner" aria-hidden="true" /> Opening your notebook…
            </div>
          ) : (
            <div class="ctn-body">
              <ul class="ctn-seats" aria-label="Players">
                {players.map((p) => (
                  <SeatRow key={p.seat} player={p} preset={presetOf(p.pid)} me={p.seat === mySeat} note={seatNote(nb.data, p.seat)} ctl={ctl} />
                ))}
              </ul>
              <label class="ctn-page">
                <span class="ctn-page-label">Notes</span>
                <textarea
                  class="ctn-text"
                  value={nb.data.text}
                  maxLength={NOTEBOOK_TEXT_MAX}
                  placeholder="Anything — who claimed what, how people voted, your theory…"
                  spellcheck={false}
                  onInput={(e) => ctl.edit({ kind: 'text', text: (e.currentTarget as HTMLTextAreaElement).value })}
                />
              </label>
              {full > 0.8 && <p class="ctn-full">Notebook {Math.min(100, Math.round(full * 100))}% full</p>}
            </div>
          )}
        </aside>
      )}
    </>
  );
}

function SeatRow({
  player,
  preset,
  me,
  note,
  ctl,
}: {
  player: PublicPlayerView;
  preset: string | null;
  me: boolean;
  note: { note: string; guess?: CharacterId | null; mark?: NotebookMark | null };
  ctl: ReturnType<typeof notebookFor>;
}) {
  const seat = player.seat;
  const ghost = player.alive ? undefined : player.ghostVoteAvailable ? true : ('spent' as const);
  const guess = note.guess ?? null;
  return (
    <li class={`ctn-seat${player.alive ? '' : ' dead'}${me ? ' me' : ''}${note.mark ? ` mark-${note.mark}` : ''}`}>
      <span class="ctn-portrait">
        {preset ? <CastPortrait id={preset} size={36} crop="bust" ghost={ghost} /> : <span class="ctn-portrait-empty" aria-hidden="true" />}
      </span>
      <span class="ctn-who">
        <span class="ctn-name" title={player.name}>
          {player.name}
          {me && <small> (you)</small>}
        </span>
        <small class="ctn-seatno">
          Seat {seat + 1}
          {!player.alive && ' · dead'}
        </small>
      </span>
      <span class="ctn-marks" role="group" aria-label={`Trust marker for ${player.name}`}>
        {MARKS.map((m) => (
          <button
            key={m.id}
            class={`ctn-mark ctn-mark-${m.id}`}
            aria-pressed={note.mark === m.id}
            aria-label={m.label}
            title={m.label}
            onClick={() => ctl.edit({ kind: 'mark', seat, mark: note.mark === m.id ? null : m.id })}
          >
            {m.glyph}
          </button>
        ))}
      </span>
      <span class="ctn-guess">
        {guess && <RoleIcon id={guess} size={20} label={false} />}
        <select
          aria-label={`Role guess for ${player.name}`}
          value={guess ?? ''}
          class={guess ? 'set' : ''}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            ctl.edit({ kind: 'guess', seat, guess: v ? (v as CharacterId) : null });
          }}
        >
          <option value="">Role?</option>
          {GROUPS.map((g) => (
            <optgroup key={g.type} label={g.label}>
              {CHARACTER_IDS.filter((id) => CHARACTER_INFO[id].type === g.type).map((id) => (
                <option key={id} value={id}>
                  {CHARACTER_INFO[id].name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </span>
      <input
        class="ctn-note"
        type="text"
        value={note.note}
        maxLength={NOTEBOOK_NOTE_MAX}
        placeholder={me ? 'What you told people…' : 'Claims, votes, suspicions…'}
        aria-label={`Note about ${player.name}`}
        enterKeyHint="next"
        spellcheck={false}
        onInput={(e) => ctl.edit({ kind: 'note', seat, note: (e.currentTarget as HTMLInputElement).value })}
        onKeyDown={(e) => {
          // Enter = next note (a one-line field never submits anything).
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const all = [...((e.currentTarget as HTMLElement).closest('.ctn-body')?.querySelectorAll<HTMLInputElement>('.ctn-note, .ctn-text') ?? [])];
          all[all.indexOf(e.currentTarget as HTMLInputElement) + 1]?.focus();
        }}
      />
    </li>
  );
}

function BookGlyph(): JSX.Element {
  // A tiny pixel-ish closed book with a clasp (inherits the toolbar's accent colour).
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" shape-rendering="crispEdges">
      <path d="M3 2h10l2 2v12H5l-2-2z" fill="currentColor" opacity="0.25" />
      <path d="M3 2h10v12H3z M3 14l2 2h10V4l-2-2" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M6 5h5M6 7.5h5" stroke="currentColor" stroke-width="1.2" />
      <rect x="12" y="7" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

/**
 * Sit at the left end of the top-right toolbar row (.ct-toolbar: Play again / settings / help /
 * leave), whatever its width. Falls back to the CSS position if there is no toolbar.
 */
function useToolbarDock(ref: { current: HTMLElement | null }, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = document.querySelector<HTMLElement>('.ct-toolbar');
    if (!active || !el || !bar) return;
    const place = () => {
      const r = bar.getBoundingClientRect();
      if (!r.width) return;
      el.style.right = `${Math.max(8, Math.round(window.innerWidth - r.left + 6))}px`;
      el.style.top = `${Math.round(r.top + (r.height - el.offsetHeight) / 2)}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(bar);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [active]);
}

/** Desktop: stop the drawer above the voice panel (bottom-right) so "am I muted" stays visible. */
function useVoiceClearance(ref: { current: HTMLElement | null }, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let ro: ResizeObserver | null = null;
    let watched: Element | null = null;
    const place = () => {
      const v = document.querySelector<HTMLElement>('.ctv');
      if (v !== watched) {
        ro?.disconnect();
        ro = v ? new ResizeObserver(place) : null;
        if (v) ro!.observe(v);
        watched = v;
      }
      const r = v?.getBoundingClientRect();
      const onRight = r && r.width > 0 && r.left > window.innerWidth / 2;
      const gap = onRight ? Math.max(12, Math.round(window.innerHeight - r.top + 8)) : 12;
      // Never squeeze the drawer below ~280px: then it may overlap a tall, expanded voice panel.
      const maxGap = Math.max(12, window.innerHeight - el.getBoundingClientRect().top - 280);
      el.style.bottom = `${Math.min(gap, maxGap)}px`;
    };
    place();
    const t = setInterval(place, 1000); // the voice panel mounts/unmounts on its own
    window.addEventListener('resize', place);
    return () => {
      clearInterval(t);
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [active]);
}
