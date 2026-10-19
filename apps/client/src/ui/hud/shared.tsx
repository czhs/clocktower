// OWNED BY rules-storyteller. Small helpers shared by the HUD and the Storyteller panel.
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  charactersOfScript,
  type CharacterId,
  type GamePhase,
  type NominationView,
  type PublicPlayerView,
  type ScriptId,
} from '@ct/protocol';
import { appPath } from '../common/appWorld';
import { countdownSeconds, countdownText, msToNextSecond } from './logic';

/**
 * The script the current lobby is running. Provided once near the top of the Storyteller panel and
 * the notebook; `CharacterSelect` reads it so every character picker lists THIS script's
 * characters first instead of all ~90 across every script.
 *
 * Off-script characters stay reachable in a trailing group: an official script should be the
 * default, not a cage — the engine only warns about off-script characters, so the UI should too.
 */
export const ScriptCtx = createContext<ScriptId | undefined>(undefined);

export const PHASE_LABEL: Record<GamePhase, string> = {
  setup: 'Setting up',
  first_night: 'First night',
  day: 'Day',
  bedtime: 'Bedtime',
  night: 'Night',
  dawn: 'Dawn',
  finished: 'Game over',
};

export function phaseTitle(phase: GamePhase, day: number): string {
  // Bedtime rung from setup (day 0) leads into the first night.
  if (phase === 'bedtime' && day === 0) return 'Bedtime — first night';
  if (phase === 'day' || phase === 'bedtime') return `${PHASE_LABEL[phase]} ${day}`;
  return PHASE_LABEL[phase];
}

/**
 * A countdown's "m:ss" text that re-renders only when the shown second changes (v3.1: the old 250 ms interval
 * re-rendered 4x/s and the split number text nodes were rewritten each time, ~5 DOM writes/s per countdown).
 * The timer lands just after each whole second before `endsAt`; an equal string is a Preact setState no-op.
 */
export function useCountdownText(endsAt: number | null): { text: string; seconds: number } | null {
  const [, setText] = useState('');
  useEffect(() => {
    if (endsAt === null) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = Date.now();
      setText(countdownText(endsAt, now));
      const d = msToNextSecond(endsAt, now);
      if (d !== null) t = setTimeout(tick, d);
    };
    tick();
    return () => clearTimeout(t);
  }, [endsAt]);
  if (endsAt === null) return null;
  const now = Date.now();
  return { text: countdownText(endsAt, now), seconds: countdownSeconds(endsAt, now) };
}

export function Countdown({ endsAt }: { endsAt: number | null }) {
  const c = useCountdownText(endsAt);
  if (!c) return null;
  return <span class={`ct-countdown${c.seconds <= 10 ? ' ct-countdown-low' : ''}`}>{c.text}</span>;
}

export function charName(c: CharacterId): string {
  return CHARACTER_INFO[c].name;
}

export function seatLabel(players: PublicPlayerView[], seat: number): string {
  const p = players.find((x) => x.seat === seat);
  return p ? `${seat + 1}. ${p.name}` : `Seat ${seat + 1}`;
}

export function nameOf(players: PublicPlayerView[], seat: number): string {
  return players.find((x) => x.seat === seat)?.name ?? `Seat ${seat + 1}`;
}

const TYPE_GROUPS = [
  { label: 'Townsfolk', type: 'townsfolk' },
  { label: 'Outsiders', type: 'outsider' },
  { label: 'Minions', type: 'minion' },
  { label: 'Demon', type: 'demon' },
  { label: 'Travellers', type: 'traveller' },
  { label: 'Fabled', type: 'fabled' },
] as const;

/** Every character, grouped by type (the whole catalogue; used when no script is known). */
export const CHARACTER_GROUPS: { label: string; ids: CharacterId[] }[] = TYPE_GROUPS.map((g) => ({
  label: g.label,
  ids: CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === g.type),
})).filter((g) => g.ids.length > 0);

/**
 * Character groups for a picker: the script's own characters by type, then everything else in one
 * trailing group so nothing is unreachable. 'custom' (and an unknown script) shows the full
 * catalogue, since a custom script may mix anything.
 */
/**
 * The flat list of characters a picker should offer for `script`: its own pool, or the whole
 * catalogue for a custom/unknown script.
 */
export function scriptPool(script?: ScriptId): CharacterId[] {
  if (!script || script === 'custom') return [...CHARACTER_IDS];
  return [...charactersOfScript(script)];
}

export function characterGroups(script?: ScriptId): { label: string; ids: CharacterId[] }[] {
  if (!script || script === 'custom') return CHARACTER_GROUPS;
  const pool = charactersOfScript(script);
  const onScript = TYPE_GROUPS.map((g) => ({
    label: g.label,
    ids: pool.filter((c) => CHARACTER_INFO[c].type === g.type),
  })).filter((g) => g.ids.length > 0);
  const rest = CHARACTER_IDS.filter((c) => !pool.includes(c));
  return rest.length ? [...onScript, { label: 'Other scripts', ids: [...rest] }] : onScript;
}

export function CharacterSelect(props: {
  value: CharacterId | '';
  onChange: (c: CharacterId | '') => void;
  allowEmpty?: boolean;
  only?: CharacterId[];
  /** Override the script from context (rarely needed). */
  script?: ScriptId;
  class?: string;
}) {
  const ctxScript = useContext(ScriptCtx);
  const groups = characterGroups(props.script ?? ctxScript);
  return (
    <select
      class={props.class}
      value={props.value}
      onChange={(e) => props.onChange((e.currentTarget as HTMLSelectElement).value as CharacterId | '')}
    >
      {props.allowEmpty && <option value="">—</option>}
      {groups.map((g) => {
        const ids = props.only ? g.ids.filter((c) => props.only!.includes(c)) : g.ids;
        if (!ids.length) return null;
        return (
          <optgroup label={g.label} key={g.label}>
            {ids.map((c) => (
              <option value={c} key={c}>
                {charName(c)}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

/**
 * Clock-hand vote indicator: seats around a circle, the hand points at the seat whose vote is being
 * collected. Locked yes = gold, locked no = dim, raised (not yet locked) = pulsing, nominee = red ring.
 */
export function VoteClock({ nom, players, size = 150 }: { nom: NominationView; players: PublicPlayerView[]; size?: number }) {
  const seats = [...players].sort((a, b) => a.seat - b.seat);
  const n = seats.length;
  const c = size / 2;
  const r = size / 2 - 16;
  const pos = (i: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const handIdx = nom.currentVoterSeat === null ? -1 : seats.findIndex((p) => p.seat === nom.currentVoterSeat);
  const raised = new Set(nom.handsRaised ?? []);
  return (
    <svg class="ct-voteclock" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Voting clock">
      <circle cx={c} cy={c} r={r} class="ct-vc-ring" />
      {handIdx >= 0 && (
        <line x1={c} y1={c} x2={pos(handIdx).x} y2={pos(handIdx).y} class="ct-vc-hand" />
      )}
      <circle cx={c} cy={c} r={4} class="ct-vc-hub" />
      {seats.map((p, i) => {
        const { x, y } = pos(i);
        const v = nom.votes[p.seat];
        const cls = [
          'ct-vc-seat',
          v === true ? 'yes' : v === false ? 'no' : raised.has(p.seat) ? 'raised' : '',
          p.seat === nom.nomineeSeat ? 'nominee' : '',
          !p.alive ? 'dead' : '',
        ].join(' ');
        return (
          <g key={p.seat}>
            <circle cx={x} cy={y} r={10} class={cls} />
            <text x={x} y={y + 4} class="ct-vc-label">
              {p.seat + 1}
            </text>
            <title>{p.name}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function goHome() {
  history.pushState({ name: 'home' }, '', appPath('/')); // (v3 URL paths) stay in this app (/ or /v2/)
  window.dispatchEvent(new CustomEvent('ct:navigate', { detail: { name: 'home' } }));
}

/**
 * Friendlier wording for common server rejections (unknown messages pass through unchanged).
 * `st` = shown to the Storyteller, who can always override with the Stage / force controls.
 */
export function friendlyError(msg: string, st = false): string {
  const m = msg.trim();
  const table: [RegExp, string, string?][] = [
    [/^Nominations are not open/i, "Nominations aren't open yet: the Storyteller opens them.", 'Nominations are closed: open them in the Day tab, or create the nomination from the Stage.'],
    [/^Another nomination is in progress|^Wait for the vote to finish/i, 'Hold on: another nomination is being decided.'],
    [/already been nominated today/i, "They've already been nominated today."],
    [/^You have already nominated today/i, "You've already nominated someone today."],
    [/^Dead players cannot nominate/i, "The dead can't nominate, but you can still talk and use your ghost vote."],
    [/^Dead players cannot shoot/i, "The dead can't use the Slayer's shot."],
    [/ghost vote is already spent/i, 'Your ghost vote is already used.'],
    [/^Your vote is already locked/i, 'The clock hand has passed you: your vote is locked in.'],
    [/^No vote (is )?running|^No vote in progress/i, 'That vote has already ended.', 'No vote is running.'],
    [/^You have already taken your shot/i, "You've already taken your shot."],
    [/^Only during the day/i, "That's only possible during the day.", 'Only during the day (normal flow): use Force phase to jump anyway.'],
    [/^Not allowed during (\w+)/i, "That isn't possible right now.", 'The normal flow does not allow that now: use the Stage / Force phase to override.'],
    [/^Cannot go from (\w+) to (\w+)/i, "That isn't possible right now.", 'The normal flow cannot go there from here: use Force phase to jump anyway.'],
    [/^A vote is (still|already) running/i, 'A vote is running.', 'A vote is running: close it first (Stage → Close vote), or use Force.'],
    [/already executed today|^Only one execution per day/i, 'Someone was already executed today.', 'Someone was already executed today: use Execute in the Stage to force another.'],
    [/^A game end is pending/i, 'Please wait for the Storyteller.', 'A game end is waiting for you: Confirm or Override it first.'],
    [/^Please wait for the Storyteller/i, 'Please wait for the Storyteller.'],
    [/^The game is over/i, 'The game is over.'],
  ];
  for (const [re, player, storyteller] of table) if (re.test(m)) return st ? (storyteller ?? player) : player;
  return m;
}
