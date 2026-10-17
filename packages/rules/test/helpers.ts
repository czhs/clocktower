import type { CharacterId, ScriptId, StCommand } from '@ct/protocol';
import { expect } from 'vitest';
import {
  applyPlayerAction,
  applyStCommand,
  createGame,
  finishVoteNow,
  mulberry32,
  type GameState,
  type NightStep,
  type PlayerAction,
} from '../src/index.js';

export const clock = { now: 1_000_000 };

export function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ pid: `pid${i}`, seat: i, name: `P${i + 1}` }));
}

export function newGame(n: number, seed = 1, script?: ScriptId): GameState {
  return createGame({ players: players(n), rng: mulberry32(seed), now: clock.now, ...(script ? { script } : {}) });
}

/** Game with characters assigned in seat order. */
export function mkGame(
  chars: CharacterId[],
  opts: {
    drunkBelieves?: CharacterId;
    redHerringSeat?: number;
    bluffs?: CharacterId[];
    seed?: number;
    /** Script to run (default Trouble Brewing). Off-script characters only warn, so any mix works. */
    script?: ScriptId;
  } = {},
): GameState {
  const s = newGame(chars.length, opts.seed ?? 1, opts.script);
  st(s, {
    type: 'assign_characters',
    assignments: chars.map((character, seat) => ({ seat, character })),
    ...(opts.drunkBelieves ? { drunkBelievesSeatCharacter: opts.drunkBelieves } : {}),
    ...(opts.redHerringSeat !== undefined ? { redHerringSeat: opts.redHerringSeat } : {}),
    demonBluffs: opts.bluffs ?? [],
    allowNonstandard: true,
  });
  return s;
}

export function st(s: GameState, cmd: StCommand) {
  clock.now += 100;
  const r = applyStCommand(s, cmd, { now: clock.now });
  if (!r.ok) throw new Error(`st ${cmd.type} failed: ${r.error}`);
  return r.effects;
}

export function stErr(s: GameState, cmd: StCommand) {
  clock.now += 100;
  const r = applyStCommand(s, cmd, { now: clock.now });
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}

export function act(s: GameState, seat: number, a: PlayerAction) {
  clock.now += 100;
  const r = applyPlayerAction(s, seat, a, { now: clock.now });
  if (!r.ok) throw new Error(`player ${seat} ${a.type} failed: ${r.error}`);
  return r.effects;
}

export function actErr(s: GameState, seat: number, a: PlayerAction): string {
  clock.now += 100;
  const r = applyPlayerAction(s, seat, a, { now: clock.now });
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}

export function step(s: GameState, kind: NightStep['kind'], seat?: number): NightStep {
  const x = s.nightQueue.find((q) => q.kind === kind && (seat === undefined || q.seat === seat));
  if (!x) throw new Error(`no ${kind} step`);
  return x;
}

export function hasStep(s: GameState, kind: NightStep['kind'], seat?: number): boolean {
  return s.nightQueue.some((q) => q.kind === kind && (seat === undefined || q.seat === seat));
}

/** Prompt the step's player with a choose_players prompt, answer with `seats`, then resolve. */
export function act_night(s: GameState, kind: NightStep['kind'], seats: number[], extra: Partial<Extract<StCommand, { type: 'resolve_step' }>> = {}, seat?: number) {
  const x = step(s, kind, seat);
  st(s, {
    type: 'prompt_player',
    seat: x.seat!,
    prompt: { kind: 'choose_players', title: 'Choose', minTargets: seats.length, maxTargets: seats.length, stepId: x.id },
  });
  const p = s.players.find((q) => q.seat === x.seat)!;
  const prompt = p.prompts.at(-1)!;
  act(s, x.seat!, { type: 'promptResponse', promptId: prompt.id, seats });
  st(s, { type: 'resolve_step', stepId: x.id, ...extra });
  return x;
}

/** Resolve every pending step in the queue (no answers), skipping ones that need targets. */
export function finishNight(s: GameState) {
  for (const x of s.nightQueue) {
    if (x.status === 'resolved' || x.status === 'skipped') continue;
    clock.now += 100;
    const r = applyStCommand(s, { type: 'resolve_step', stepId: x.id }, { now: clock.now });
    if (!r.ok) st(s, { type: 'skip_step', stepId: x.id });
  }
}

export function toDay(s: GameState) {
  st(s, { type: 'advance_phase', to: 'day' });
}

export function toNight(s: GameState) {
  st(s, { type: 'advance_phase', to: 'night' });
}

export function begin(s: GameState) {
  st(s, { type: 'begin_first_night' });
}

/** Nominate + vote: `yes` seats raise hands; returns the nomination. */
export function nominateAndVote(s: GameState, nominator: number, nominee: number, yes: number[]) {
  if (!s.day!.nominationsOpen) st(s, { type: 'set_nominations_open', open: true });
  act(s, nominator, { type: 'nominate', nomineeSeat: nominee });
  const n = s.day!.nominations.at(-1)!;
  if (n.status !== 'pending') return n;
  st(s, { type: 'start_vote', nominationId: n.id });
  for (const y of yes) act(s, y, { type: 'vote', nominationId: n.id, vote: true });
  finishVoteNow(s, { now: clock.now, effects: [] });
  return n;
}

export const alive = (s: GameState, seat: number) => s.players.find((p) => p.seat === seat)!.alive;
export const P = (s: GameState, seat: number) => s.players.find((p) => p.seat === seat)!;
