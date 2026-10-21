import { randomInt } from 'node:crypto';
import { MIN_PLAYERS, nameSkeleton, type MemberView } from '@ct/protocol';
import type { RoomMember } from './modules.js';

/** Fisher–Yates with a CSPRNG (seat order must not be predictable or join-order-derived). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface StartCheckInput {
  waiting: boolean;
  maxPlayers: number;
  storyteller: { connected: boolean } | null;
  players: { connected: boolean; ready: boolean }[];
  /** (multi-script) an automatic game on a custom script: nothing to deal at random. */
  autoCustomScript?: boolean;
}

/**
 * Start rule (documented decision): the seated Storyteller starts the game when there are
 * MIN_PLAYERS..maxPlayers players, everyone is connected, and every player has pressed Ready.
 */
export function startBlockers(s: StartCheckInput): string[] {
  const out: string[] = [];
  if (!s.waiting) return ['The game is already in progress'];
  if (!s.storyteller) out.push('No Storyteller is seated');
  else if (!s.storyteller.connected) out.push('The Storyteller is disconnected');
  const n = s.players.length;
  if (n < MIN_PLAYERS) out.push(`Need at least ${MIN_PLAYERS} players (have ${n})`);
  if (n > s.maxPlayers) out.push(`Too many players (max ${s.maxPlayers})`);
  const away = s.players.filter((p) => !p.connected).length;
  if (away) out.push(`${away} player${away === 1 ? ' is' : 's are'} disconnected`);
  const notReady = s.players.filter((p) => p.connected && !p.ready).length;
  if (notReady) out.push(`${notReady} player${notReady === 1 ? ' is' : 's are'} not ready`);
  if (s.autoCustomScript) out.push('Automatic games need an official script (a custom script is dealt by hand)');
  return out;
}

/**
 * Per-lobby display labels (SR-11): display names are not unique, so later joiners with the same
 * name (case-insensitive) get a suffix: "Ann", "Ann (2)", ... Stable while both are present.
 */
export function displayLabels(members: readonly { pid: string; displayName: string; joinedAt: number }[]): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const m of [...members].sort((a, b) => a.joinedAt - b.joinedAt)) {
    const key = nameSkeleton(m.displayName); // (v2.3 WEB-7) look-alikes and forged "(n)" collide too
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.set(m.pid, n === 1 ? m.displayName : `${m.displayName} (${n})`);
  }
  return out;
}

export function memberView(m: RoomMember, ready: boolean, label = m.displayName): MemberView {
  // Whitelist: never include accountId.
  return {
    pid: m.pid,
    displayName: label,
    role: m.role,
    seat: m.seat,
    ready,
    connected: m.connected,
    isHost: m.isHost,
    cosmetics: m.cosmetics,
  };
}
