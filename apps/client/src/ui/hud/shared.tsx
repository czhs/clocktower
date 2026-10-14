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
