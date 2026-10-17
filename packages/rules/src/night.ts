import type { InfoSpecInput, NightStepView } from '@ct/protocol';
import { ROLES } from './roles.js';
import { RuleError, type GameState, type NightStep, type PlayerState, type StepKind } from './types.js';
import {
  actingRole,
  charName,
  giveInfo,
  impaired,
  isDrunk,
  log,
  playerAt,
  typeOf,
  who,
  type Op,
} from './util.js';

export const MINION_INFO_ORDER = 10;
export const DEMON_INFO_ORDER = 11;
/** Minion/Demon info steps only happen with this many players or more. */
export const EVIL_INFO_MIN_PLAYERS = 7;

function newStep(s: GameState, seat: number | null, kind: StepKind, order: number): NightStep {
  return { id: `n${s.nightNumber}-${++s.stepSeq}`, seat, kind, order, status: 'pending' };
}

/** Build the ST's night checklist for the current night (call after nightNumber is set). */
export function buildNightQueue(s: GameState, first: boolean): void {
  const steps: NightStep[] = [newStep(s, null, 'dusk', 0)];
  if (first && s.players.length >= EVIL_INFO_MIN_PLAYERS) {
    steps.push(newStep(s, null, 'minion_info', MINION_INFO_ORDER));
    steps.push(newStep(s, null, 'demon_info', DEMON_INFO_ORDER));
  }
  for (const p of [...s.players].sort((a, b) => a.seat - b.seat)) {
    if (!p.alive) continue;
    const role = actingRole(p);
    const def = ROLES[role];
    const order = first ? def.firstNight : def.otherNight;
    if (order === null) continue;
    if (def.wakes && !def.wakes(s, p, first)) continue;
    const st = newStep(s, p.seat, role, order);
    const fixed = def.prepare?.(s, p, s.rng);
    if (fixed) st.fixed = fixed;
    steps.push(st);
  }
  steps.push(newStep(s, null, 'dawn', 999));
  steps.sort((a, b) => a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
  s.nightQueue = steps;
}

/** Insert a step woken mid-night (Ravenkeeper killed by the Demon). */
export function insertDynamicStep(s: GameState, seat: number, kind: 'ravenkeeper'): void {
  if (s.nightQueue.some((st) => st.seat === seat && st.kind === kind)) return;
  const order = ROLES[kind].dynamicOrder ?? 35;
  const st = newStep(s, seat, kind, order);
  let idx = s.nightQueue.findIndex((x) => x.order > order);
  if (idx < 0) idx = s.nightQueue.length;
  s.nightQueue.splice(idx, 0, st);
}

export function findStep(s: GameState, stepId: string): NightStep {
  const st = s.nightQueue.find((x) => x.id === stepId);
  if (!st) throw new RuleError('not_found', 'Unknown night step');
  return st;
}

/** First unfinished step for a seat (used to link prompts/visits to the checklist). */
export function openStepFor(s: GameState, seat: number): NightStep | undefined {
  return s.nightQueue.find(
    (st) => st.seat === seat && st.status !== 'resolved' && st.status !== 'skipped',
  );
}

function evilTeam(s: GameState) {
  const demons = s.players.filter((p) => typeOf(p.character) === 'demon');
  const minions = s.players.filter((p) => typeOf(p.character) === 'minion');
  return { demons, minions };
}

function namesOf(ps: PlayerState[]): string {
  return ps.length ? ps.map((p) => p.name).join(', ') : 'none';
}

/** Group steps: Minion info (minions learn each other and the Demon) / Demon info (+ bluffs). */
function resolveGroupStep(s: GameState, op: Op, st: NightStep): string {
  const { demons, minions } = evilTeam(s);
  const demonSeats = demons.map((p) => p.seat);
  const minionSeats = minions.map((p) => p.seat);
  if (st.kind === 'minion_info') {
    for (const m of minions) {
      m.evilTeam = { demonSeats, minionSeats, bluffs: m.evilTeam?.bluffs ?? [] };
      const others = minions.filter((x) => x !== m);
      giveInfo(s, m, {
        text: `Your Demon is ${namesOf(demons)}. Your fellow Minions: ${namesOf(others)}.`,
        seats: [...demonSeats, ...others.map((x) => x.seat)],
      });
    }
    return `Minion info given to ${namesOf(minions)}.`;
  }
  for (const d of demons) {
    d.evilTeam = { demonSeats, minionSeats, bluffs: [...s.demonBluffs] };
    giveInfo(s, d, {
      text: `Your Minions: ${namesOf(minions)}. Characters not in play: ${s.demonBluffs.map(charName).join(', ') || 'none'}.`,
      seats: minionSeats,
      characters: [...s.demonBluffs],
    });
  }
  return `Demon info given to ${namesOf(demons)}.`;
}

export function resolveStep(
  s: GameState,
  op: Op,
  st: NightStep,
  input: { seats?: number[]; starpassSeat?: number; redirectSeat?: number },
): void {
  if (st.status === 'resolved' || st.status === 'skipped') throw new RuleError('invalid', 'Step already finished');
  let outcome = '';
  if (st.kind === 'minion_info' || st.kind === 'demon_info') outcome = resolveGroupStep(s, op, st);
  else if (st.kind === 'dusk' || st.kind === 'dawn') outcome = '';
  else if (st.seat !== null) {
    const p = playerAt(s, st.seat);
    if (!p) throw new RuleError('not_found', 'Step player missing');
    const def = ROLES[st.kind];
    if (def.resolve) {
      // Drunk (or ST-drunk) players never affect state; the hooks check impairment themselves,
      // but the real Drunk acting as e.g. the Monk must also be inert.
      if (p.character === 'drunk') {
        const t = (input.seats ?? st.response?.seats)?.[0];
        outcome = `${who(p)} is the Drunk (acting as ${charName(st.kind)}): no effect${t !== undefined ? ` on seat ${t + 1}` : ''}.`;
        if (st.kind === 'butler') p.butlerMasterSeat = t ?? null;
      } else outcome = def.resolve(s, op, p, st, input);
    }
  }
  st.status = 'resolved';
  if (outcome) {
    st.outcome = outcome;
    log(s, op, outcome);
  }
}

/** ST-facing view of one step, including the engine's suggestion, ready prompt and info. */
export function stepView(s: GameState, st: NightStep): NightStepView {
  const view: NightStepView = {
    id: st.id,
    seat: st.seat,
    character: st.kind,
    status: st.status,
  };
  if (st.response) {
    view.response = {
      ...(st.response.seats ? { seats: [...st.response.seats] } : {}),
      ...(st.response.character ? { character: st.response.character } : {}),
      ...(st.response.yes !== undefined ? { yes: st.response.yes } : {}),
    };
  }
  if (st.kind === 'dusk') {
    view.suggestion = 'Night falls. Check that everyone is home.';
    return view;
  }
  if (st.kind === 'dawn') {
    view.suggestion = 'Review deaths, then advance to day to publish them.';
    return view;
  }
  if (st.kind === 'minion_info' || st.kind === 'demon_info') {
    const { demons, minions } = evilTeam(s);
    view.suggestion =
      st.kind === 'minion_info'
        ? `Minions ${namesOf(minions)} learn the Demon ${namesOf(demons)} and each other. Resolve to send.`
        : `Demon ${namesOf(demons)} learns Minions ${namesOf(minions)} and bluffs ${s.demonBluffs.map(charName).join(', ')}. Resolve to send.`;
    if (st.outcome) view.notes = [st.outcome];
    return view;
  }
  const p = st.seat === null ? undefined : playerAt(s, st.seat);
  if (!p) return view;
  const def = ROLES[st.kind];
  view.actingAs = st.kind;
  const isImpaired = impaired(p) || st.kind !== p.character;
  view.impaired = isImpaired;
  const notes: string[] = [];
  if (p.character === 'drunk') notes.push(`${who(p)} is the Drunk: their ability does nothing; give any info you like.`);
  else if (isDrunk(p)) notes.push(`${who(p)} is drunk: their ability does nothing; you may give false info.`);
  if (p.poisonedBy) notes.push(`${who(p)} is poisoned: their ability does nothing; you may give false info.`);
  const sug = def.suggest?.(s, p, st);
  if (sug) {
    view.suggestion = sug.text;
    if (sug.info) {
      const info: InfoSpecInput = { ...sug.info, stepId: st.id };
      view.suggestedInfo = info;
    }
    if (sug.notes) notes.push(...sug.notes);
  }
  if (def.prompt) view.prompt = { ...def.prompt(s, p), stepId: st.id };
  if (st.outcome) notes.unshift(`Outcome: ${st.outcome}`);
  if (notes.length) view.notes = notes;
  return view;
}
