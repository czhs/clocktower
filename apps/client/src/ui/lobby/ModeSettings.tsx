// (v2.1, clock-client) Lobby mode UI: "Storyteller: a player runs the game" vs "Automatic (no
// Storyteller)", the automatic timings steppers, and the finder's mode badge. Used by the create
// dialog (LobbyFinder), the waiting room and the lobby rows. Pure helpers live in ui/clock/logic.ts.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AutoTimings, LobbySummary, StorytellerMode } from '@ct/protocol';
import { canStep, formatTiming, MODE_COPY, modeOf, stepTiming, TIMING_FIELDS, timingsSummary, type TimingKey } from '../clock/logic';

/** Two big, plain choices with one line each (radio semantics). */
export function ModeChoice({ value, onChange, disabled, name = 'ct-mode' }: { value: StorytellerMode; onChange: (m: StorytellerMode) => void; disabled?: boolean; name?: string }) {
  return (
    <div class="ct-modes" role="radiogroup" aria-label="Who runs the game">
      {(['human', 'auto'] as const).map((m) => (
        <label key={m} class={`ct-mode-opt${value === m ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
          <input type="radio" name={name} value={m} checked={value === m} disabled={disabled} onChange={() => onChange(m)} />
          <span class="ct-mode-title">{m === 'human' ? 'Storyteller' : 'Automatic'}</span>
          <span class="ct-mode-sub">{m === 'human' ? 'A player runs the game' : 'No Storyteller needed'}</span>
          <span class="ct-mode-line">{MODE_COPY[m].line}</span>
        </label>
      ))}
    </div>
  );
}

/** The automatic timings as four small steppers (sensible steps, not every number). */
export function AutoTimingsEditor({ value, onStep, disabled }: { value: AutoTimings; onStep: (key: TimingKey, dir: 1 | -1) => void; disabled?: boolean }) {
  return (
    <div class="ct-timings" role="group" aria-label="Automatic timings">
      {TIMING_FIELDS.map((f) => (
        <div class="ct-timing" key={f.key}>
          <span class="ct-timing-label" title={f.hint}>
            {f.label}
            <small>{f.hint}</small>
          </span>
          <span class="ct-timing-step">
            <button type="button" disabled={disabled || !canStep(value, f.key, -1)} aria-label={`Shorter ${f.label.toLowerCase()}`} onClick={() => onStep(f.key, -1)}>
              −
            </button>
            <b aria-live="polite">{formatTiming(f.key, value[f.key])}</b>
            <button type="button" disabled={disabled || !canStep(value, f.key, 1)} aria-label={`Longer ${f.label.toLowerCase()}`} onClick={() => onStep(f.key, 1)}>
              +
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Host editing of the timings in the waiting room: optimistic local values, sent as one
 * lobby:settings after a short pause (rapid stepping is a single message); follows the server's
 * value once it confirms.
 */
export function useTimingsDraft(server: AutoTimings, send: (patch: Partial<AutoTimings>) => void) {
  const [draft, setDraft] = useState<AutoTimings | null>(null);
  const changed = useRef<Partial<AutoTimings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverKey = JSON.stringify(server);
  useEffect(() => {
    // the server confirmed (or someone else changed it): drop the draft unless edits are in flight
    if (!timer.current) setDraft(null);
  }, [serverKey]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const value = draft ?? server;
  const step = (key: TimingKey, dir: 1 | -1) => {
    const next = stepTiming(value, key, dir);
    if (next === value) return;
    setDraft(next);
    changed.current = { ...changed.current, [key]: next[key] };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      send(changed.current);
      changed.current = {};
      // fall back to the server's value if it never confirms
      setTimeout(() => !timer.current && setDraft(null), 4000);
    }, 450);
  };
  return { value, step };
}

/** Small badge for lobby rows: which mode this lobby plays. */
export function ModeBadge({ lobby }: { lobby: LobbySummary }) {
  const m = modeOf(lobby);
  return (
    <span class={`ct-mode-badge ct-mode-badge-${m}`} title={MODE_COPY[m].line}>
      {MODE_COPY[m].badge}
    </span>
  );
}

export { timingsSummary };
