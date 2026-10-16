// OWNED BY clock-client (v2.1). The town clock as a small, always-readable HUD chip (top centre):
// "Nominations open in 3:12" / "Execution in 1:05" / "Bedtime 0:32" / "Paused", counting down
// against the server clock (serverNow). It complements the diegetic dial on the clock tower.
// Automatic games add, on the chip itself:
//   * "+ time" → an inline row of +1 / +2 / +5 (no modal); one tap proposes (clock:propose);
//   * the open proposal as a compact inline vote card for everyone (one tap Yes / No, live tally,
//     seconds left), which turns into a brief result line ("+2 min added" / "Not extended").
// Mount (lead, GameScreen children): <ClockChip conn={conn} />. Renders nothing without a clock.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DayClockView, PlayerGameView, StorytellerGameView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { serverNow } from '../../net/serverTime';
import { useStore } from '../../net/store';
import { clockLine, proposalCard, proposalOutcome, proposeState, type ClockLine, type LocalExtensionLog, type ProposalOutcome } from './logic';
import './clock.css';

type View = PlayerGameView | StorytellerGameView;

/** Re-render every `ms` while active (server-time countdowns). */
function useTick(active: boolean, ms = 250): number {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return serverNow();
}

const RESULT_MS = 2800;

export function ClockChip({ conn }: { conn: RoomConnection }) {
  const view = useStore(conn.gameView) as View | null;
  const clock = view?.clock ?? null;
  const phaseOk = !!view && (view.phase === 'day' || view.phase === 'bedtime') && !view.result;
  const running = !!clock && (!clock.paused || !!clock.proposal);
  const now = useTick(phaseOk && !!clock && (running || !!clock.proposal));

  const [trayOpen, setTrayOpen] = useState(false);
  const [asking, setAsking] = useState<number | null>(null);
  const [pendingVote, setPendingVote] = useState<{ id: string; yes: boolean } | null>(null);
  const [result, setResult] = useState<ProposalOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const prevClock = useRef<DayClockView | null>(null);
  // what this client saw today (my proposals, minutes added) so "+ time" can say "wait" up front
  const log = useRef<LocalExtensionLog & { day: number; seen: Set<string> }>({ day: -1, seen: new Set() });
  const day = view?.dayNumber ?? -1;
  if (log.current.day !== day) log.current = { day, seen: new Set() };
  const myPidNow = view?.kind === 'player' ? view.you.pid : null;

  // a proposal opened / closed: note mine, say how it went, briefly
  useEffect(() => {
    const out = proposalOutcome(prevClock.current, clock);
    prevClock.current = clock;
    const p = clock?.proposal;
    if (p) setAsking(null);
    if (p && !log.current.seen.has(p.id)) {
      log.current.seen.add(p.id);
      if (p.by === myPidNow) {
        log.current.myCount = (log.current.myCount ?? 0) + 1;
        log.current.myLastAt = serverNow();
      }
    }
    if (out?.passed) log.current.added = (log.current.added ?? 0) + out.minutes;
    if (!out) return;
    setPendingVote(null);
    setResult(out);
  }, [clock]);
  // (its own effect: every new view replaces `clock`, which must not cancel the fade)
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(t);
  }, [result]);

  // "Asking the town…" gives up if the server never opened the vote (a rejection shows as a note)
  useEffect(() => {
    if (asking === null) return;
    const t = setTimeout(() => setAsking(null), 4000);
    return () => clearTimeout(t);
  }, [asking]);

  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (!e.for?.startsWith('clock:')) return;
        setAsking(null);
        setPendingVote(null);
        setNote(e.message);
      }),
    [conn],
  );
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4500);
    return () => clearTimeout(t);
  }, [note]);

  // the tray closes on Escape or a click elsewhere
  useEffect(() => {
    if (!trayOpen) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setTrayOpen(false);
    const down = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setTrayOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [trayOpen]);

  const ps = view ? proposeState(view, now, log.current) : null;
  // the tray folds away as soon as proposing is no longer possible (a vote opened, time ran out…)
  useEffect(() => {
    if (trayOpen && !ps?.allowed) setTrayOpen(false);
  }, [trayOpen, ps?.allowed]);

  if (!view || !clock || !phaseOk || !ps) return null;
  const line = clockLine(clock, now, { onTheBlock: !!view.day?.onTheBlock && view.day.executedSeat === null });
  if (!line) return null;
  const myPid = view.kind === 'player' ? view.you.pid : null;
  const nameOf = (pid: string) => view.players.find((p) => p.pid === pid)?.name ?? 'Someone';
  const card = clock.proposal && view.kind === 'player' ? proposalCard(clock.proposal, { myPid, nameOf, now, pending: pendingVote }) : null;

  const propose = (minutes: number) => {
    conn.send('clock:propose', { minutes });
    setTrayOpen(false);
    setAsking(minutes);
    setNote(null);
  };
  const vote = (yes: boolean) => {
    if (!card || card.secondsLeft <= 0) return;
    if (card.my === (yes ? 'yes' : 'no')) return;
    setPendingVote({ id: card.id, yes });
    conn.send('clock:vote', { id: card.id, yes });
  };

  return (
    <div class={`ctc${view.kind === 'storyteller' ? ' ctc-st' : ''}`} ref={root}>
      <div class={`ctc-chip ctc-${line.tone}${line.urgent ? ' ctc-urgent' : ''}${line.due ? ' ctc-due' : ''}`} role="timer" aria-live="off" title={line.title}>
        <MiniDial line={line} paused={clock.paused} />
        <span class="ctc-label">{line.label}</span>
        {line.time && <span class="ctc-time">{line.time}</span>}
        {ps.show && (
          <button
            class={`ctc-plus${trayOpen ? ' on' : ''}`}
            aria-expanded={trayOpen}
            aria-disabled={!ps.allowed}
            aria-label={ps.allowed ? 'Ask the town for more time' : `More time: ${ps.reason}`}
            title={ps.allowed ? 'Ask the town for more time' : ps.reason}
            onClick={() => {
              if (!ps.allowed) return setNote(ps.reason ?? null);
              setTrayOpen((o) => !o);
            }}
          >
            + time
          </button>
        )}
      </div>
      {/* accessible announcement of the stage (not every second) */}
      <span class="ctc-sr" aria-live="polite">
        {line.due ? line.label : clock.paused ? 'Town clock paused' : line.label}
      </span>

      {trayOpen && ps.allowed && (
        <div class="ctc-tray" role="group" aria-label="Propose more time">
          <span class="ctc-tray-q">Ask for</span>
          {ps.options.map((o) => (
            <button key={o.minutes} disabled={!o.ok} title={o.ok ? `Propose +${o.minutes} min: the town votes` : 'More than the town allows today'} onClick={() => propose(o.minutes)}>
              +{o.minutes} min
            </button>
          ))}
        </div>
      )}

      {card ? (
        <div class={`ctc-vote${card.passing ? ' passing' : ''}`} role="group" aria-label={`${card.title}: vote`}>
          <div class="ctc-vote-title">{card.title}</div>
          <div class="ctc-vote-row">
            <button class={`ctc-yes${card.my === 'yes' ? ' on' : ''}`} aria-pressed={card.my === 'yes'} disabled={card.secondsLeft <= 0} onClick={() => vote(true)}>
              Yes
            </button>
            <button class={`ctc-no${card.my === 'no' ? ' on' : ''}`} aria-pressed={card.my === 'no'} disabled={card.secondsLeft <= 0} onClick={() => vote(false)}>
              No
            </button>
            <span class="ctc-vote-meta">
              <b>{card.tally}</b> · {card.secondsLeft} s
            </span>
          </div>
          <div class="ctc-drain" aria-hidden="true">
            <i style={{ transform: `scaleX(${card.fraction})` }} />
          </div>
        </div>
      ) : result ? (
        <div class={`ctc-result ${result.passed ? 'ok' : 'no'}`} role="status">
          {result.passed ? `✓ ${result.text}` : result.text}
        </div>
      ) : asking !== null ? (
        <div class="ctc-result" role="status">
          Asking the town for +{asking} min…
        </div>
      ) : null}
      {note && (
        <div class="ctc-note" role="status">
          {note}
        </div>
      )}
    </div>
  );
}

/** A tiny tower dial: the wedge is the time left (gold / red for nominations / blue for bedtime). */
function MiniDial({ line, paused }: { line: ClockLine; paused: boolean }) {
  const f = line.fraction;
  const a = -Math.PI / 2 + f * Math.PI * 2;
  const r = 6.5;
  const x = 8 + Math.cos(a) * r;
  const y = 8 + Math.sin(a) * r;
  const wedge = f >= 0.999 ? <circle class="ctc-wedge" cx="8" cy="8" r={r} /> : f > 0.002 ? <path class="ctc-wedge" d={`M8 8 L8 ${8 - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} /> : null;
  return (
    <svg class="ctc-dial" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle class="ctc-face" cx="8" cy="8" r="7.3" />
      {wedge}
      {paused ? (
        <>
          <rect class="ctc-bars" x="5.2" y="5" width="2" height="6" />
          <rect class="ctc-bars" x="8.8" y="5" width="2" height="6" />
        </>
      ) : (
        <line class="ctc-hand" x1="8" y1="8" x2={x.toFixed(2)} y2={y.toFixed(2)} />
      )}
    </svg>
  );
}
