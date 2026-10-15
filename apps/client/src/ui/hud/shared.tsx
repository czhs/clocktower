// OWNED BY rules-storyteller. Small helpers shared by the HUD and the Storyteller panel.
import { useEffect, useState } from 'preact/hooks';
import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  type CharacterId,
  type GamePhase,
  type NominationView,
  type PublicPlayerView,
} from '@ct/protocol';

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

/** Re-render periodically while a countdown is active. */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

export function Countdown({ endsAt }: { endsAt: number | null }) {
  const now = useNow(endsAt !== null);
  if (endsAt === null) return null;
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <span class={`ct-countdown${s <= 10 ? ' ct-countdown-low' : ''}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
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

export const CHARACTER_GROUPS: { label: string; ids: CharacterId[] }[] = [
  { label: 'Townsfolk', ids: CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === 'townsfolk') },
  { label: 'Outsiders', ids: CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === 'outsider') },
  { label: 'Minions', ids: CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === 'minion') },
  { label: 'Demon', ids: CHARACTER_IDS.filter((c) => CHARACTER_INFO[c].type === 'demon') },
];

export function CharacterSelect(props: {
  value: CharacterId | '';
  onChange: (c: CharacterId | '') => void;
  allowEmpty?: boolean;
  only?: CharacterId[];
  class?: string;
}) {
  return (
    <select
      class={props.class}
      value={props.value}
      onChange={(e) => props.onChange((e.currentTarget as HTMLSelectElement).value as CharacterId | '')}
    >
      {props.allowEmpty && <option value="">—</option>}
      {CHARACTER_GROUPS.map((g) => {
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
  history.pushState({ name: 'home' }, '', '/');
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
