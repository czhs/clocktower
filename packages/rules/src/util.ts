import { CHARACTER_INFO, type AnnouncementView, type CharacterId, type CharacterType } from '@ct/protocol';
import { RuleError, type Effect, type GameState, type PlayerState, type Rng, type SoundCue } from './types.js';

/** Mutable operation context: current time + effects accumulated for the host. */
export interface Op {
  now: number;
  effects: Effect[];
}

// ---------------------------------------------------------------------------------------- rng

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ----------------------------------------------------------------------------------- lookups

export function typeOf(c: CharacterId): CharacterType {
  return CHARACTER_INFO[c].type;
}

export function charName(c: CharacterId): string {
  return CHARACTER_INFO[c].name;
}

export function playerAt(s: GameState, seat: number): PlayerState | undefined {
  return s.players.find((p) => p.seat === seat);
}

export function mustPlayer(s: GameState, seat: number): PlayerState {
  const p = playerAt(s, seat);
  if (!p) throw new RuleError('not_found', `No player in seat ${seat + 1}`);
  return p;
}

export function who(p: PlayerState): string {
  return `${p.name} (seat ${p.seat + 1})`;
}

export function isDrunk(p: PlayerState): boolean {
  return p.character === 'drunk' || p.drunkOverride;
}

export function isPoisoned(p: PlayerState): boolean {
  return p.poisonedBy !== null;
}

/** Drunk or poisoned: the character's ability does not work. */
export function impaired(p: PlayerState): boolean {
  return isDrunk(p) || isPoisoned(p);
}

/** The character a player wakes and acts as (the Drunk acts as their believed Townsfolk). */
export function actingRole(p: PlayerState): CharacterId {
  return p.character === 'drunk' ? p.believedCharacter : p.character;
}

export function inPlay(s: GameState, c: CharacterId): boolean {
  return s.players.some((p) => p.character === c);
}

export function aliveCount(s: GameState): number {
  return s.players.filter((p) => p.alive).length;
}

export function publicAliveCount(s: GameState): number {
  return s.players.filter((p) => p.publicAlive).length;
}

export function isNightPhase(s: GameState): boolean {
  return s.phase === 'first_night' || s.phase === 'night' || s.phase === 'dawn';
}

/** Seats in clockwise order (ascending seat number, wrapping). */
export function seatsClockwiseFrom(s: GameState, seat: number): number[] {
  const seats = s.players.map((p) => p.seat).sort((a, b) => a - b);
  const idx = seats.indexOf(seat);
  return [...seats.slice(idx + 1), ...seats.slice(0, idx + 1)];
}

/** The closest living neighbours on each side (excluding the player). */
export function livingNeighbours(s: GameState, seat: number): PlayerState[] {
  const order = seatsClockwiseFrom(s, seat).filter((x) => x !== seat);
  const right = order.map((x) => playerAt(s, x)!).find((p) => p.alive);
  const left = [...order].reverse().map((x) => playerAt(s, x)!).find((p) => p.alive);
  const out: PlayerState[] = [];
  if (right) out.push(right);
  if (left && left !== right) out.push(left);
  return out;
}

/** Spy/Recluse registration notes for the ST ("may register as ..."). */
export function registrationNotes(s: GameState, among?: PlayerState[]): string[] {
  const pool = among ?? s.players;
  const notes: string[] = [];
  for (const p of pool) {
    if (p.character === 'spy' && !isPoisoned(p))
      notes.push(`Spy ${who(p)} may register as good, or as a Townsfolk or Outsider.`);
    if (p.character === 'recluse' && !isPoisoned(p))
      notes.push(`Recluse ${who(p)} may register as evil, or as a Minion or the Demon.`);
  }
  return notes;
}

// ------------------------------------------------------------------------------ logging/output

export function log(s: GameState, op: Op, text: string): void {
  s.log.push({ at: op.now, text });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export function alert(s: GameState, op: Op, text: string): void {
  s.alerts.push(text);
  if (s.alerts.length > 20) s.alerts.splice(0, s.alerts.length - 20);
  log(s, op, `ALERT: ${text}`);
}

export function announce(s: GameState, op: Op, kind: AnnouncementView['kind'], text: string): void {
  const a: AnnouncementView = { id: `a${++s.annSeq}`, at: op.now, kind, text };
  s.announcements.push(a);
  if (s.announcements.length > 60) s.announcements.splice(0, s.announcements.length - 60);
  op.effects.push({ type: 'announcement', announcement: a });
}

export function sound(op: Op, cue: SoundCue, seats: number[] | 'all' = 'all'): void {
  op.effects.push({ type: 'sound', cue, seats });
}

/** Private info for one player (ids are per-seat so counters never leak cross-player activity). */
export function giveInfo(
  s: GameState,
  p: PlayerState,
  info: { text: string; seats?: number[]; characters?: CharacterId[]; number?: number; yes?: boolean },
): void {
  p.infoSeq += 1;
  p.info.push({
    id: `i${p.seat}-${p.infoSeq}`,
    day: s.dayNumber,
    phase: s.phase,
    text: info.text,
    ...(info.seats ? { seats: [...info.seats] } : {}),
    ...(info.characters ? { characters: [...info.characters] } : {}),
    ...(info.number !== undefined ? { number: info.number } : {}),
    ...(info.yes !== undefined ? { yes: info.yes } : {}),
  });
  if (p.info.length > 100) p.info.splice(0, p.info.length - 100);
}

export function addReminder(p: PlayerState, token: string): void {
  if (!p.reminders.includes(token)) p.reminders.push(token);
}

export function removeReminder(p: PlayerState, token: string): void {
  p.reminders = p.reminders.filter((r) => r !== token);
}
