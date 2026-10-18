// v3 WP2 (v3-avatars). Which clip an avatar shows, as pure rules (docs/v3/INTEGRATION.md §4 "Emotes and
// clips", "Deaths", §3.2 "Raised hands"). No three, no '@pixel3d/' (unit tested in avatars.clips.test.ts).
//
// The vendor handle (src/demo/characters.js createCharacter) only plays clips the spec has: `emotes` maps the
// game emotes talk|vote|point|die|ghost (+ signature) to a clip name or null, `emoteClips` lists every clip
// that is safe to play (no combat / hurt, no locomotion). Locomotion is never chosen here: it follows from the
// drive velocity (LegGait). Holds: 'vote' and 'die' stay on their last key until play('idle'); loop clips
// (idle, talk, ghost, ghost-spent) replace idle until play('idle').
import type { GameView } from '../../game/gameplay/core';
import type { GhostMode } from './castMap';

export type GameEmote = 'talk' | 'vote' | 'point' | 'die' | 'ghost' | 'signature';
export const GAME_EMOTES: readonly GameEmote[] = ['talk', 'vote', 'point', 'die', 'ghost', 'signature'];

/** What a body can play (from the vendor handle). */
export interface ClipSet {
  emotes: Readonly<Record<string, string | null | undefined>>;
  emoteClips: readonly string[];
}

/** Fallback chain per game emote (§4: point -> talk -> idle). The last entry is always 'idle'. */
const CHAIN: Readonly<Record<string, readonly string[]>> = {
  point: ['point', 'talk', 'idle'],
  talk: ['talk', 'idle'],
  vote: ['vote', 'idle'],
  die: ['die', 'idle'],
  ghost: ['ghost', 'idle'],
  signature: ['signature', 'idle'],
};

/**
 * The clip to play for an emote request: a game emote resolves through handle.emotes along its fallback
 * chain; any other name only when it is one of the safe emoteClips. 'idle' = nothing to play.
 */
export function resolveEmote(set: ClipSet, name: string): string {
  const chain = CHAIN[name];
  if (chain) {
    for (const step of chain) {
      if (step === 'idle') return 'idle';
      const clip = set.emotes[step];
      if (clip) return clip;
    }
    return 'idle';
  }
  return set.emoteClips.includes(name) ? name : 'idle';
}

/** The ghost loop clip for a 'clips'-mode spec: ghost-spent when the ghost vote is used and the clip exists. */
export function ghostLoop(clips: readonly string[], ghostVoteAvailable: boolean): string | null {
  if (!ghostVoteAvailable && clips.includes('ghost-spent')) return 'ghost-spent';
  return clips.includes('ghost') ? 'ghost' : null;
}

/** Vendor shared ghost level: 1 = ghost (vote still available, halo), 2 = spent. */
export function ghostLevel(ghostVoteAvailable: boolean): 1 | 2 {
  return ghostVoteAvailable ? 1 : 2;
}

// ------------------------------------------------------------------------------------ desired clips

/** The held action + loop clip a body should show. */
export interface ClipWant {
  /** A held one-shot ('die' while collapsing, 'vote' with the hand up), or null. */
  action: string | null;
  /** A loop clip replacing idle ('ghost' / 'ghost-spent' for 'clips' ghosts, 'talk' while talking), or null. */
  loop: string | null;
}
export const NO_CLIPS: ClipWant = Object.freeze({ action: null, loop: null });

export interface ClipInputs {
  /** Inside the 1.5 s death collapse. */
  dying: boolean;
  /** Hand raised in the current vote (held 'vote'). */
  handUp: boolean;
  /** Publicly dead (after the collapse). */
  dead: boolean;
  ghostMode: GhostMode;
  ghostVoteAvailable: boolean;
  talking: boolean;
  clips: readonly string[];
  emotes: ClipSet['emotes'];
}

export function wantClips(i: ClipInputs): ClipWant {
  let action: string | null = null;
  if (i.dying && i.emotes.die) action = i.emotes.die;
  else if (i.handUp && i.emotes.vote) action = i.emotes.vote;
  let loop: string | null = null;
  if (i.dead && !i.dying && i.ghostMode === 'clips') loop = ghostLoop(i.clips, i.ghostVoteAvailable);
  else if (i.talking && !i.dead && i.emotes.talk) loop = i.emotes.talk;
  return { action, loop };
}

/**
 * The play() calls that move a body from `prev` to `next` (vendor semantics: play(held one-shot) starts it,
 * play(loop clip) replaces idle WITHOUT releasing a hold, play('idle') releases a hold AND clears the loop).
 */
export function clipTransition(prev: ClipWant, next: ClipWant): string[] {
  if (prev.action === next.action && prev.loop === next.loop) return [];
  const out: string[] = [];
  const loopCleared = prev.loop !== null && next.loop === null;
  const actionCleared = prev.action !== null && next.action !== prev.action;
  if (loopCleared || actionCleared) {
    // the only release there is: idle drops both, then re-apply what stays
    out.push('idle');
    if (next.loop) out.push(next.loop);
    if (next.action) out.push(next.action);
    return out;
  }
  if (next.loop !== prev.loop && next.loop) out.push(next.loop);
  if (next.action !== prev.action && next.action) out.push(next.action);
  return out;
}

// ------------------------------------------------------------------------------------ deaths

/** The client-side collapse length (§4 "Deaths": play('die') held 1.5 s, then the ghost look). */
export const DIE_HOLD_S = 1.5;

/** Per-avatar death bookkeeping, advanced once per frame. */
export interface DeathState {
  /** Last frame's public death flag (null = not yet seen). */
  wasDead: boolean | null;
  /** Engine time the collapse ends (dying while t < until), or null. */
  dyingUntil: number | null;
}
export const newDeathState = (): DeathState => ({ wasDead: null, dyingUntil: null });

/**
 * Advance the death bookkeeping. A live -> dead change seen while the avatar is in view (and its body can
 * play 'die') starts the collapse; a death first seen on join, while out of view, or without a 'die' clip
 * goes straight to the ghost look. Returns whether the collapse is running now.
 */
export function stepDeath(s: DeathState, dead: boolean, inView: boolean, canDie: boolean, t: number): boolean {
  if (s.wasDead === false && dead && inView && canDie) s.dyingUntil = t + DIE_HOLD_S;
  if (!dead) s.dyingUntil = null;
  s.wasDead = dead;
  if (s.dyingUntil !== null && t >= s.dyingUntil) s.dyingUntil = null;
  return s.dyingUntil !== null;
}

// ------------------------------------------------------------------------------------ raised hands

/**
 * pids whose hand is up in the vote now (§3.2): during a 'voting' nomination, a counted yes or a raised hand the
 * clock hand has not reached (NominationView.handsRaised); none at night. Same rule as gameplay/core.ts frame().
 */
export function raisedHands(view: GameView | null | undefined, out: Set<string> = new Set()): Set<string> {
  out.clear();
  if (!view || view.phase === 'night' || view.phase === 'first_night') return out;
  const noms = view.day?.nominations ?? [];
  const nom = [...noms].reverse().find((n) => n.status === 'voting');
  if (!nom) return out;
  const up = new Set<number>(nom.handsRaised ?? []);
  for (const [seat, v] of Object.entries(nom.votes)) if (v === true) up.add(Number(seat));
  for (const p of view.players) if (up.has(p.seat)) out.add(p.pid);
  return out;
}
