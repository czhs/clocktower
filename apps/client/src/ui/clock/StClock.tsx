// OWNED BY clock-client (v2.1). Compact town-clock control for the Storyteller's script panel (human
// games): what the tower shows right now, pause / resume, +1 min, clear, and "set N min for
// Discussion / Nominations / Bedtime" (StCommand 'day_clock'). The clock is only a prop: it never
// moves the phases in a human game.
import { useEffect, useState } from 'preact/hooks';
import type { C2SPayload, ClockStage, DayClockView, StorytellerGameView } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import { clockLine, clockRemainingMs } from './logic';
import './clock.css';

const STAGE_LABEL: Record<ClockStage, string> = { discussion: 'Discussion', nominations: 'Nominations', bedtime: 'Bedtime' };
const MINUTE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30];

export function StClockControl({
  view,
  send,
  stages,
  defaultMinutes = 5,
}: {
  view: StorytellerGameView;
  send: (c: C2SPayload<'st:command'>) => void;
  stages: ClockStage[];
  defaultMinutes?: number;
}) {
  const c = view.clock ?? null;
  const [minutes, setMinutes] = useState(defaultMinutes);
  // (v2.2 perf) only <StClockNow> ticks; "is a countdown set" does not depend on the time
  const isSet = !!c && clockRemainingMs(c, 0) !== null;
  const onTheBlock = !!view.day?.onTheBlock && view.day.executedSeat === null;
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? MINUTE_STEPS.find((m) => m > minutes) : [...MINUTE_STEPS].reverse().find((m) => m < minutes);
    if (next !== undefined) setMinutes(next);
  };
  const cmd = (action: 'set' | 'pause' | 'resume' | 'add' | 'clear', extra: { stage?: ClockStage; minutes?: number } = {}) => send({ type: 'day_clock', action, ...extra });
  return (
    <div class="cts-timer ctc-stctl" aria-label="Town clock">
      <div class="ctc-stctl-row">
        <span class="cts-timer-label">Town clock:</span>
        {isSet ? (
          <StClockNow c={c!} onTheBlock={onTheBlock} />
        ) : (
          <span class="muted">not set</span>
        )}
        <span class="cts-spacer" />
        {isSet && (
          <>
            {c!.paused ? (
              <button onClick={() => cmd('resume')} title="Start the clock again">
                ▶ Resume
              </button>
            ) : (
              <button onClick={() => cmd('pause')} title="Freeze the clock (players see it paused)">
                ❚❚ Pause
              </button>
            )}
            <button onClick={() => cmd('add', { minutes: 1 })} title="One more minute">
              +1m
            </button>
            <button onClick={() => cmd('clear')} title="Take the clock off the tower" aria-label="Clear the town clock">
              ✕
            </button>
          </>
        )}
      </div>
      <div class="ctc-stctl-row">
        <span class="muted">Set</span>
        <span class="ctc-stctl-step">
          <button onClick={() => step(-1)} disabled={minutes <= MINUTE_STEPS[0]!} aria-label="Fewer minutes">
            −
          </button>
          <b>{minutes} min</b>
          <button onClick={() => step(1)} disabled={minutes >= MINUTE_STEPS[MINUTE_STEPS.length - 1]!} aria-label="More minutes">
            +
          </button>
        </span>
        <span class="muted">for</span>
        {stages.map((s) => (
          <button
            key={s}
            class={c?.stage === s && isSet ? 'on' : ''}
            onClick={() => cmd('set', { stage: s, minutes })}
            title={`Show ${minutes} min ${s === 'discussion' ? 'until nominations open' : s === 'nominations' ? 'until the execution' : 'until night falls'} on the tower (everyone sees it)`}
          >
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the tower shows right now: the only part of the control that changes every tick (2 Hz). */
function StClockNow({ c, onTheBlock }: { c: DayClockView; onTheBlock: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (c.paused || c.endsAt === null) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [c]);
  const line = clockLine(c, serverNow(), { onTheBlock });
  if (!line) return null;
  return (
    <span class={`ctc-stctl-now ctc-${line.tone}${line.urgent ? ' ctc-urgent-text' : ''}`} title={line.title}>
      {line.label}
      {line.time && <b> {line.time}</b>}
    </span>
  );
}
