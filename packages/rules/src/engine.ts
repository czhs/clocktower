import { CHARACTER_INFO, DEFAULT_BEDTIME_SECONDS, DEFAULT_ST_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, type CharacterId, type ForcePhase, type StCommand } from '@ct/protocol';
import { checkVictory, endPoisonerPoison, finish, killPlayer, publish } from './deaths.js';
import {
  cancelNomination,
  closeVote,
  createNomination,
  execute,
  forceExecute,
  forceVote,
  pauseVoteClock,
  setBlock,
  setVote,
  executeOnBlock,
  MAYOR_WIN_REASON,
  mayorCheck,
  newDay,
  nominate,
  setHand,
  slayerShot,
  startVote,
  strikeVote,
  tickVote,
} from './day.js';
import { buildNightQueue, findStep, openStepFor, resolveStep } from './night.js';
import { ROLES } from './roles.js';
import {
  applyAssignment,
  completeAssignment,
  randomAssignment,
  validateAssignment,
  type Assignment,
} from './setup.js';
import {
  RuleError,
  type CommandResult,
  type Ctx,
  type Effect,
  type GameState,
  type HistoryEntry,
  type PlayerState,
  type PromptState,
  type Rng,
} from './types.js';
import {
  addReminder,
  aliveCount,
  alert,
  announce,
  charName,
  giveInfo,
  isNightPhase,
  log,
  mustPlayer,
  removeReminder,
  sound,
  typeOf,
  who,
  type Op,
} from './util.js';

export const DEFAULT_VOTE_STEP_MS = 3000;
/** SR-13: bounded reminder tokens per player (view size / memory). */
export const MAX_REMINDERS_PER_PLAYER = 20;
const HISTORY_LIMIT = 30;

export interface CreateGameOptions {
  players: { pid: string; seat: number; name: string }[];
  rng: Rng;
  now?: number;
  bedtimeSeconds?: number;
  /** Time the clock hand spends on each seat while voting. */
  voteStepMs?: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const n = opts.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new RuleError('invalid', `Trouble Brewing needs 5-15 players (got ${n})`);
  const seats = new Set(opts.players.map((p) => p.seat));
  if (seats.size !== n) throw new RuleError('invalid', 'Duplicate seats');
  for (const p of opts.players)
    if (!Number.isInteger(p.seat) || p.seat < 0 || p.seat > 14) throw new RuleError('invalid', `Bad seat ${p.seat}`);
  const players: PlayerState[] = [...opts.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      seat: p.seat,
      pid: p.pid,
      name: p.name,
      // Placeholder until the ST assigns characters (never shown: rolesRevealed is false).
      character: 'washerwoman',
      believedCharacter: 'washerwoman',
      alignment: 'good',
      believedAlignment: 'good',
      startingCharacter: 'washerwoman',
      alive: true,
      publicAlive: true,
      ghostVoteAvailable: true,
      ghostVoteUsed: false,
      poisonedBy: null,
      drunkOverride: false,
      protectedTonight: false,
      reminders: [],
      executed: false,
      died: false,
      nominationsMade: 0,
      nominatedToday: false,
      wasNominatedToday: false,
      abilityUsed: false,
      slayerShotTaken: false,
      butlerMasterSeat: null,
      connected: true,
      info: [],
      prompts: [],
      promptHistory: [],
      promptSeq: 0,
      infoSeq: 0,
      evilTeam: null,
      spyGrimoire: null,
    }));
  return {
    version: 1,
    players,
    phase: 'setup',
    dayNumber: 0,
    nightNumber: 0,
    phaseEndsAt: null,
    bedtimeSeconds: opts.bedtimeSeconds ?? DEFAULT_BEDTIME_SECONDS,
    bedtimePausedRemainingMs: null,
    bedtimeHeld: false,
    bedtimeOvertime: false,
    bedtimeFirst: false,
    gathering: false,
    settings: { ...DEFAULT_ST_SETTINGS, voteSeconds: (opts.voteStepMs ?? DEFAULT_VOTE_STEP_MS) / 1000 },
    storytellerConnected: true,
    assigned: false,
    rolesRevealed: false,
    demonBluffs: [],
    redHerringSeat: null,
    nightQueue: [],
    stepSeq: 0,
    day: null,
    lastExecutedDiedSeat: null,
    visitingSeat: null,
    travelSpeedMult: 1,
    announcements: [],
    annSeq: 0,
    alerts: [],
    log: [],
    result: null,
    resultPending: false,
    startedAt: opts.now ?? 0,
    endedAt: null,
    voteStepMs: opts.voteStepMs ?? DEFAULT_VOTE_STEP_MS,
    rng: opts.rng,
    history: [],
  };
}

// ------------------------------------------------------------------------------------- undo

function serializeCore(s: GameState): string {
  return JSON.stringify(s, function (this: unknown, key: string, value: unknown) {
    if (this === s && (key === 'rng' || key === 'history')) return undefined;
    return value;
  });
}

function pushHistory(s: GameState, snap: string): void {
  s.history.push({ snap, replay: [] });
  if (s.history.length > HISTORY_LIMIT) s.history.splice(0, s.history.length - HISTORY_LIMIT);
}

/**
 * Undo the Storyteller's last command: restore the state before it, then replay the player
 * actions that happened since (so a nomination, answer or vote made after the ST's mistake
 * survives). Replayed actions that are no longer legal are dropped; their effects are not
 * re-broadcast (the restored views carry the state).
 */
function undo(s: GameState, op: Op): void {
  const entry = s.history.pop();
  if (!entry) throw new RuleError('invalid', 'Nothing to undo');
  const snap = entry.snap;
  // Keep live presence facts (they mirror the world/connection, not rules decisions).
  const visiting = s.visitingSeat;
  const stConnected = s.storytellerConnected;
  const connected = new Map(s.players.map((p) => [p.seat, p.connected]));
  // Id counters never go backwards: ids handed to clients (prompts, info, announcements, night
  // steps, nominations) must never be reused, or a stale/replayed answer to an undone prompt
  // could apply to a new one.
  const seqs = { annSeq: s.annSeq, stepSeq: s.stepSeq, nomSeq: s.day?.nomSeq ?? 0 };
  const playerSeqs = new Map(s.players.map((p) => [p.seat, { promptSeq: p.promptSeq, infoSeq: p.infoSeq }]));
  const core = JSON.parse(snap) as Omit<GameState, 'rng' | 'history'>;
  const { rng, history } = s;
  Object.assign(s, core, { rng, history });
  s.storytellerConnected = stConnected;
  s.annSeq = Math.max(s.annSeq, seqs.annSeq);
  s.stepSeq = Math.max(s.stepSeq, seqs.stepSeq);
  if (s.day) s.day.nomSeq = Math.max(s.day.nomSeq, seqs.nomSeq);
  for (const p of s.players) {
    p.connected = connected.get(p.seat) ?? p.connected;
    const q = playerSeqs.get(p.seat);
    if (q) {
      p.promptSeq = Math.max(p.promptSeq, q.promptSeq);
      p.infoSeq = Math.max(p.infoSeq, q.infoSeq);
    }
  }
  if (!isNightPhase(s)) s.visitingSeat = null;
  else s.visitingSeat = visiting;
  log(s, op, 'Storyteller undid the last action');
  const kept: HistoryEntry['replay'] = [];
  for (const r of entry.replay) {
    const scratch: Op = { now: r.now, effects: [] };
    const before = serializeCore(s);
    try {
      playerAction(s, scratch, r.seat, r.action);
      kept.push(r);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      restoreKeepingHistory(s, before);
    }
  }
  // Player actions replayed on top of the previous ST command stay attached to it.
  s.history.at(-1)?.replay.push(...kept);
}

// ----------------------------------------------------------------------------------- phases

function clearStepPrompts(s: GameState): void {
  for (const p of s.players) p.prompts = p.prompts.filter((q) => q.stepId === null);
}

/** Leave the bedtime/circle sub-states (any phase change). */
function clearStage(s: GameState): void {
  s.bedtimePausedRemainingMs = null;
  s.bedtimeHeld = false;
  s.bedtimeOvertime = false;
  s.bedtimeFirst = false;
  s.gathering = false;
}

function startNight(s: GameState, op: Op, first: boolean, reason: 'bedtime' | 'night'): void {
  s.phase = first ? 'first_night' : 'night';
  s.nightNumber += 1;
  s.phaseEndsAt = null;
  clearStage(s);
  s.day = null;
  for (const p of s.players) {
    if (p.poisonedBy === 'poisoner') p.poisonedBy = null;
    p.protectedTonight = false;
  }
  clearStepPrompts(s);
  if (first) s.rolesRevealed = true;
  buildNightQueue(s, first);
  op.effects.push({ type: 'send_home', reason });
  announce(s, op, 'phase', first ? 'The first night falls. Everyone is in their home.' : `Night ${s.nightNumber} falls.`);
  log(s, op, `Night ${s.nightNumber} begins`);
}

function startDay(s: GameState, op: Op): void {
  s.phase = 'day';
  s.dayNumber += 1;
  s.phaseEndsAt = null;
  clearStage(s);
  s.visitingSeat = null;
  s.day = newDay();
  s.lastExecutedDiedSeat = null;
  clearStepPrompts(s);
  for (const p of s.players) {
    p.protectedTonight = false;
    p.nominatedToday = false;
    p.wasNominatedToday = false;
  }
  for (const st of s.nightQueue) if (st.status === 'visiting') st.status = st.preVisitStatus ?? 'pending';
  const died = s.players.filter((p) => p.publicAlive && !p.alive);
  announce(
    s,
    op,
    'phase',
    `Dawn breaks on day ${s.dayNumber}.${died.length ? '' : ' Nobody died in the night.'}`,
  );
  sound(op, 'dawn');
  for (const p of died) publish(s, op, p, 'night');
  // Night revivals (ST corrections) also publish now.
  for (const p of s.players) if (!p.publicAlive && p.alive) publish(s, op, p, 'night');
  log(s, op, `Day ${s.dayNumber} begins`);
}

function startBedtime(s: GameState, op: Op, first = false): void {
  s.phase = 'bedtime';
  clearStage(s);
  s.bedtimeFirst = first;
  const ms = s.bedtimeSeconds * 1000;
  if (s.storytellerConnected) {
    s.phaseEndsAt = op.now + ms;
    s.bedtimePausedRemainingMs = null;
  } else {
    s.phaseEndsAt = null;
    s.bedtimePausedRemainingMs = ms;
  }
  sound(op, 'bell');
  announce(s, op, 'phase', `The bell tolls. Return to your homes within ${s.bedtimeSeconds} seconds.`);
}

function advance(s: GameState, op: Op, to: 'day' | 'bedtime' | 'night' | 'dawn'): void {
  const from = s.phase;
  const ok: Record<typeof to, string[]> = {
    day: ['first_night', 'night', 'dawn'],
    dawn: ['first_night', 'night'],
    bedtime: ['day', 'setup'],
    night: ['day', 'bedtime'],
  };
  if (!ok[to].includes(from)) throw new RuleError('phase', `Cannot go from ${from} to ${to}`);
  if (from === 'setup' && !s.assigned) throw new RuleError('invalid', 'Assign characters first');
  if (from === 'day') {
    const d = s.day!;
    if (d.vote) throw new RuleError('phase', 'A vote is still running');
    // Nominations never voted on lapse when the day ends.
    for (const n of d.nominations) if (n.status === 'pending') n.status = 'cancelled';
    // Whoever is on the block when the day ends is executed (Saint / Demon / two-alive checks
    // apply as for any execution; a detected game end waits for the ST before night falls).
    if (d.block && !d.executionOccurred) {
      executeOnBlock(s, op, d.block.seat);
      if (s.resultPending || s.phase !== 'day') return;
    }
    if (mayorCheck(s, op)) return;
  }
  if (to === 'day') startDay(s, op);
  else if (to === 'dawn') {
    s.phase = 'dawn';
    s.phaseEndsAt = null;
    log(s, op, 'Dawn: reviewing the night');
  } else if (to === 'bedtime') startBedtime(s, op, from === 'setup');
  else startNight(s, op, from === 'bedtime' && s.bedtimeFirst, 'night');
}

/**
 * (gameplay) Storyteller "props": jump to any phase, skipping the engine's readiness checks (a
 * running vote is dropped, the block is NOT executed, no Mayor check). Advisory alerts only.
 */
function forcePhase(s: GameState, op: Op, to: ForcePhase): void {
  const from = s.phase;
  if (from === 'finished') throw new RuleError('phase', 'The game is over');
  const d = s.day;
  if (d && from === 'day' && to !== 'gather' && to !== 'day') {
    if (d.vote) {
      const n = d.nominations.find((x) => x.id === d.vote!.nominationId);
      if (n) n.status = 'cancelled';
      d.vote = null;
      alert(s, op, 'Forced phase change: the running vote was dropped.');
    }
    if (d.block && !d.executionOccurred)
      alert(s, op, `Forced phase change: seat ${d.block.seat + 1} was on the block and was NOT executed.`);
  }
  if (s.resultPending) alert(s, op, 'A game end is still pending: confirm or override it.');
  const night0 = s.nightNumber === 0;
  switch (to) {
    case 'setup':
      s.phase = 'setup';
      s.phaseEndsAt = null;
      clearStage(s);
      s.day = null;
      s.visitingSeat = null;
      s.nightQueue = [];
      clearStepPrompts(s);
      announce(s, op, 'phase', 'The Storyteller returns the town to setup.');
      break;
    case 'first_night':
      if (!s.assigned) throw new RuleError('invalid', 'Assign characters first');
      startNight(s, op, true, 'night');
      break;
    case 'night':
      if (night0 && !s.assigned) throw new RuleError('invalid', 'Assign characters first');
      startNight(s, op, night0, 'night');
      break;
    case 'day':
    case 'gather':
      if (from !== 'day') startDay(s, op);
      if (to === 'gather') setGathering(s, op, true);
      break;
    case 'bedtime':
      if (night0 && !s.assigned) alert(s, op, 'Characters are not assigned yet: assign them before the first night falls.');
      startBedtime(s, op, night0);
      break;
    case 'dawn':
      s.phase = 'dawn';
      s.phaseEndsAt = null;
      clearStage(s);
      if (from === 'day' || from === 'bedtime') s.day = null;
      break;
  }
  log(s, op, `Storyteller forced the phase: ${from} -> ${to}`);
}

function setGathering(s: GameState, op: Op, on: boolean): void {
  if (on && s.phase !== 'day' && s.phase !== 'setup')
    throw new RuleError('phase', 'The circle gathers by day (use force phase "gather")');
  if (s.gathering === on) return;
  s.gathering = on;
  if (on) announce(s, op, 'storyteller', 'The Storyteller calls everyone to the circle around the clock tower.');
  log(s, op, on ? 'Circle gathered' : 'Circle dissolved');
}

/** (gameplay) Bedtime countdown controls: pause (hold), resume, extend, restart. */
function bedtimeTimer(s: GameState, op: Op, action: 'pause' | 'resume' | 'extend' | 'restart', seconds?: number): void {
  requirePhase(s, 'bedtime');
  const now = op.now;
  switch (action) {
    case 'pause':
      if (s.phaseEndsAt !== null) {
        s.bedtimePausedRemainingMs = Math.max(0, s.phaseEndsAt - now);
        s.phaseEndsAt = null;
      }
      s.bedtimeHeld = true;
      log(s, op, 'Bedtime countdown held');
      return;
    case 'resume':
      s.bedtimeHeld = false;
      if (s.bedtimePausedRemainingMs !== null && s.storytellerConnected) {
        s.phaseEndsAt = now + s.bedtimePausedRemainingMs;
        s.bedtimePausedRemainingMs = null;
      }
      log(s, op, 'Bedtime countdown resumed');
      return;
    case 'extend':
    case 'restart': {
      const ms = (seconds ?? (action === 'extend' ? 15 : s.bedtimeSeconds)) * 1000;
      const running = !s.bedtimeHeld && s.storytellerConnected;
      let remaining: number;
      if (action === 'restart' || s.bedtimeOvertime) remaining = ms;
      else remaining = (s.phaseEndsAt !== null ? Math.max(0, s.phaseEndsAt - now) : (s.bedtimePausedRemainingMs ?? 0)) + ms;
      s.bedtimeOvertime = false;
      if (running) {
        s.phaseEndsAt = now + remaining;
        s.bedtimePausedRemainingMs = null;
      } else {
        s.phaseEndsAt = null;
        s.bedtimePausedRemainingMs = remaining;
      }
      announce(s, op, 'phase', `The Storyteller grants more time: ${Math.round(remaining / 1000)} seconds until dark.`);
      return;
    }
  }
}

function findPromptForResend(p: PlayerState, id: string): PromptState {
  const q = p.prompts.find((x) => x.id === id) ?? p.promptHistory.find((x) => x.id === id);
  if (!q) throw new RuleError('not_found', 'Unknown prompt');
  return q;
}

// ------------------------------------------------------------------------------ ST commands

function requirePhase(s: GameState, ...phases: GameState['phase'][]): void {
  if (!phases.includes(s.phase)) throw new RuleError('phase', `Not allowed during ${s.phase}`);
}

function notSetupOrFinished(s: GameState): void {
  if (s.phase === 'setup' || s.phase === 'finished') throw new RuleError('phase', `Not allowed during ${s.phase}`);
}

function addPrompt(s: GameState, op: Op, p: PlayerState, spec: Extract<StCommand, { type: 'prompt_player' }>['prompt']): void {
  if (spec.kind === 'choose_players') {
    const min = spec.minTargets ?? 1;
    const max = spec.maxTargets ?? min;
    if (min > max || max < 1) throw new RuleError('invalid', 'Bad target counts');
  }
  if (spec.kind === 'choose_character' && spec.characterOptions && spec.characterOptions.length === 0)
    throw new RuleError('invalid', 'No character options');
  let stepId: string | null = null;
  if (spec.stepId) {
    const st = findStep(s, spec.stepId);
    if (st.seat !== p.seat) throw new RuleError('invalid', 'Step belongs to another seat');
    stepId = st.id;
  } else if (isNightPhase(s)) {
    stepId = openStepFor(s, p.seat)?.id ?? null;
  }
  if (stepId) {
    const st = findStep(s, stepId);
    if (st.status === 'resolved' || st.status === 'skipped') throw new RuleError('invalid', 'Step already finished');
    st.status = 'prompted';
    delete st.response;
    st.preVisitStatus = 'prompted';
    p.prompts = p.prompts.filter((q) => q.stepId !== stepId);
  }
  p.promptSeq += 1;
  const prompt: PromptState = {
    id: `q${p.seat}-${p.promptSeq}`,
    kind: spec.kind,
    title: spec.title,
    stepId,
  };
  if (spec.body !== undefined) prompt.body = spec.body;
  if (spec.kind === 'choose_players') {
    prompt.minTargets = spec.minTargets ?? 1;
    prompt.maxTargets = spec.maxTargets ?? prompt.minTargets;
    prompt.allowSelf = spec.allowSelf ?? true;
    prompt.allowDead = spec.allowDead ?? true;
  }
  if (spec.characterOptions) prompt.characterOptions = [...spec.characterOptions];
  p.prompts.push(prompt);
  if (p.prompts.length > 10) p.prompts.splice(0, p.prompts.length - 10);
  p.promptHistory = [...(p.promptHistory ?? []), { ...prompt, ...(prompt.characterOptions ? { characterOptions: [...prompt.characterOptions] } : {}) }].slice(-10);
  log(s, op, `Prompt to ${who(p)}: ${spec.title}`);
}

function assign(s: GameState, op: Op, cmd: Extract<StCommand, { type: 'assign_characters' }>): void {
  const bySeat = new Map<number, CharacterId>();
  for (const a of cmd.assignments) {
    if (bySeat.has(a.seat)) throw new RuleError('invalid', `Seat ${a.seat + 1} assigned twice`);
    bySeat.set(a.seat, a.character);
  }
  const draft: Assignment = {
    bySeat,
    drunkBelieves: cmd.drunkBelievesSeatCharacter ?? null,
    redHerringSeat: cmd.redHerringSeat ?? null,
    demonBluffs: [...cmd.demonBluffs],
  };
  const full = completeAssignment(draft, s.rng);
  const seats = s.players.map((p) => p.seat);
  const v = validateAssignment(seats, full);
  if (v.errors.length) throw new RuleError('invalid', v.errors.join('; '));
  if (v.warnings.length && !cmd.allowNonstandard) throw new RuleError('invalid', `${v.warnings.join('; ')} (set allowNonstandard to accept)`);
  for (const w of v.warnings) alert(s, op, w);
  applyAssignment(s, full);
  log(s, op, 'Characters assigned manually');
}

/** While a detected game end awaits the ST, nothing may move the game forward. */
const BLOCKED_WHILE_PENDING: ReadonlySet<StCommand['type']> = new Set([
  'advance_phase',
  'begin_first_night',
  'set_nominations_open',
  'start_vote',
  'execute',
  'resolve_step',
  'prompt_player',
]);

function stCommand(s: GameState, op: Op, cmd: StCommand): void {
  if (s.resultPending && BLOCKED_WHILE_PENDING.has(cmd.type))
    throw new RuleError('phase', 'A game end is pending: confirm it or override it first');
  if ((cmd.type === 'confirm_result' || cmd.type === 'override_result') && !s.resultPending)
    throw new RuleError('invalid', 'No game end is pending');
  if (s.phase === 'finished') {
    // The result is final once declared: it has been revealed to everyone and recorded in the
    // stats (idempotently, exactly once), so neither the winner nor the history may change.
    const allowed: StCommand['type'][] = ['announce', 'set_travel_speed', 'visit_home', 'leave_home', 'set_setting'];
    if (!allowed.includes(cmd.type)) throw new RuleError('phase', 'The game is over');
  }
  switch (cmd.type) {
    case 'random_setup': {
      requirePhase(s, 'setup');
      applyAssignment(s, randomAssignment(s.players.map((p) => p.seat), s.rng));
      log(s, op, 'Random characters assigned');
      return;
    }
    case 'assign_characters':
      requirePhase(s, 'setup');
      assign(s, op, cmd);
      return;
    case 'begin_first_night':
      requirePhase(s, 'setup');
      if (!s.assigned) throw new RuleError('invalid', 'Assign characters first');
      startNight(s, op, true, 'night');
      return;
    case 'advance_phase':
      advance(s, op, cmd.to);
      return;
    case 'set_bedtime_seconds':
      s.bedtimeSeconds = cmd.seconds;
      return;
    case 'set_nominations_open': {
      requirePhase(s, 'day');
      const d = s.day!;
      if (cmd.open && d.executionOccurred) throw new RuleError('phase', 'Someone was already executed today');
      d.nominationsOpen = cmd.open;
      announce(s, op, 'nomination', cmd.open ? 'Nominations are open.' : 'Nominations are closed.');
      return;
    }
    case 'start_vote':
      startVote(s, op, cmd.nominationId);
      return;
    case 'cancel_nomination':
      cancelNomination(s, op, cmd.nominationId);
      return;
    case 'execute':
      execute(s, op, cmd.seat);
      return;
    case 'kill': {
      notSetupOrFinished(s);
      const p = mustPlayer(s, cmd.seat);
      if (!p.alive) throw new RuleError('invalid', 'That player is already dead');
      log(s, op, `Storyteller kills ${who(p)}${cmd.cause ? `: ${cmd.cause}` : ''}`);
      killPlayer(s, op, p, 'storyteller', { announce: cmd.announce });
      return;
    }
    case 'set_alive': {
      const p = mustPlayer(s, cmd.seat);
      if (p.alive === cmd.alive) return;
      if (!cmd.alive) killPlayer(s, op, p, 'storyteller', { raw: true });
      else {
        p.alive = true;
        if (cmd.restoreGhostVote) {
          p.ghostVoteAvailable = true;
          p.ghostVoteUsed = false;
        }
        if (!isNightPhase(s)) publish(s, op, p, 'storyteller');
        log(s, op, `Storyteller revived ${who(p)}`);
      }
      victoryHint(s, op);
      return;
    }
    case 'set_status': {
      const p = mustPlayer(s, cmd.seat);
      if (cmd.poisoned !== undefined) p.poisonedBy = cmd.poisoned ? (p.poisonedBy ?? 'storyteller') : null;
      if (cmd.drunk !== undefined) {
        if (p.character === 'drunk' && !cmd.drunk)
          throw new RuleError('invalid', 'The Drunk is always drunk; change their character instead');
        if (p.character !== 'drunk') p.drunkOverride = cmd.drunk;
      }
      if (cmd.protectedTonight !== undefined) p.protectedTonight = cmd.protectedTonight;
      log(s, op, `Status of ${who(p)} changed`);
      return;
    }
    case 'set_ghost_vote': {
      const p = mustPlayer(s, cmd.seat);
      p.ghostVoteAvailable = cmd.available;
      return;
    }
    case 'change_character': {
      if (!s.assigned) throw new RuleError('invalid', 'Assign characters first');
      const p = mustPlayer(s, cmd.seat);
      const prev = p.character;
      if (prev === 'poisoner' && cmd.character !== 'poisoner') endPoisonerPoison(s);
      p.character = cmd.character;
      p.alignment = cmd.alignment ?? CHARACTER_INFO[cmd.character].alignment;
      if (s.phase === 'setup') p.startingCharacter = cmd.character;
      if (cmd.character === 'drunk' && prev !== 'drunk') {
        // The new Drunk keeps believing their previous Townsfolk if possible.
        if (typeOf(p.believedCharacter) !== 'townsfolk') alert(s, op, `${who(p)} is now the Drunk but believes a non-Townsfolk.`);
      } else if (cmd.notify || s.phase === 'setup') {
        p.believedCharacter = cmd.character;
      }
      if (cmd.notify || s.phase === 'setup') p.believedAlignment = p.alignment;
      if (cmd.notify && s.rolesRevealed && cmd.character !== 'drunk')
        giveInfo(s, p, {
          text: `You are now the ${charName(cmd.character)} (${p.alignment}).`,
          characters: [cmd.character],
        });
      log(s, op, `${who(p)}: ${prev} -> ${cmd.character} (${p.alignment})`);
      if (s.phase !== 'setup' && !s.players.some((q) => q.alive && typeOf(q.character) === 'demon'))
        alert(s, op, 'No living Demon in play: declare a winner or assign a Demon.');
      return;
    }
    case 'add_reminder': {
      const p = mustPlayer(s, cmd.seat);
      if (!p.reminders.includes(cmd.token) && p.reminders.length >= MAX_REMINDERS_PER_PLAYER)
        throw new RuleError('invalid', `At most ${MAX_REMINDERS_PER_PLAYER} reminders per player`);
      addReminder(p, cmd.token);
      return;
    }
    case 'remove_reminder':
      removeReminder(mustPlayer(s, cmd.seat), cmd.token);
      return;
    case 'prompt_player':
      addPrompt(s, op, mustPlayer(s, cmd.seat), cmd.prompt);
      return;
    case 'send_info': {
      const p = mustPlayer(s, cmd.seat);
      const { stepId, ...info } = cmd.info;
      if (stepId) {
        const st = findStep(s, stepId);
        if (st.seat !== p.seat) throw new RuleError('invalid', 'Step belongs to another seat');
        st.infoSent = true;
        if (st.kind !== 'minion_info' && st.kind !== 'demon_info' && st.kind !== 'dusk' && st.kind !== 'dawn') {
          if (ROLES[st.kind].infoOnly && st.status !== 'resolved' && st.status !== 'skipped') {
            st.status = 'resolved';
            st.outcome = `Info sent: ${info.text}`;
            p.prompts = p.prompts.filter((q) => q.stepId !== st.id);
          }
        }
      }
      giveInfo(s, p, info);
      log(s, op, `Info to ${who(p)}: ${info.text}`);
      return;
    }
    case 'resolve_step': {
      notSetupOrFinished(s);
      const st = findStep(s, cmd.stepId);
      const input: { seats?: number[]; starpassSeat?: number; redirectSeat?: number } = {};
      if (cmd.seats) input.seats = cmd.seats;
      if (cmd.starpassSeat !== undefined) input.starpassSeat = cmd.starpassSeat;
      if (cmd.redirectSeat !== undefined) input.redirectSeat = cmd.redirectSeat;
      resolveStep(s, op, st, input);
      for (const p of s.players) p.prompts = p.prompts.filter((q) => q.stepId !== st.id);
      return;
    }
    case 'skip_step': {
      const st = findStep(s, cmd.stepId);
      if (st.status === 'resolved') throw new RuleError('invalid', 'Step already resolved');
      st.status = 'skipped';
      for (const p of s.players) p.prompts = p.prompts.filter((q) => q.stepId !== st.id);
      return;
    }
    case 'visit_home':
      mustPlayer(s, cmd.seat);
      op.effects.push({ type: 'visit_home', seat: cmd.seat });
      return;
    case 'leave_home':
      setVisiting(s, null);
      op.effects.push({ type: 'leave_home' });
      return;
    case 'announce':
      announce(s, op, 'storyteller', cmd.text);
      return;
    case 'set_travel_speed':
      s.travelSpeedMult = cmd.mult;
      op.effects.push({ type: 'travel_speed', mult: cmd.mult });
      return;
    case 'declare_winner':
      if (!s.assigned) throw new RuleError('invalid', 'Assign characters first');
      finish(s, op, cmd.winner, cmd.reason || 'Declared by the Storyteller.');
      return;
    case 'undo_last':
      undo(s, op);
      return;
    case 'confirm_result': {
      const r = s.result!;
      finish(s, op, r.winner, r.reason);
      return;
    }
    case 'override_result': {
      const r = s.result!;
      s.result = null;
      s.resultPending = false;
      if (r.reason === MAYOR_WIN_REASON && s.day) s.day.mayorOverridden = true;
      alert(s, op, `Storyteller overrode the game end (${r.reason}); the game continues.`);
      return;
    }
    case 'strike_vote':
      strikeVote(s, op, cmd.nominationId, cmd.seat);
      return;
    case 'set_red_herring': {
      if (!s.assigned) throw new RuleError('invalid', 'Assign characters first');
      if (cmd.seat !== null && mustPlayer(s, cmd.seat).alignment !== 'good') throw new RuleError('invalid', 'The red herring must be a good player');
      s.redHerringSeat = cmd.seat;
      log(s, op, cmd.seat === null ? 'Red herring cleared' : `Red herring is now ${who(mustPlayer(s, cmd.seat))}`);
      return;
    }
    // ---- (gameplay) props
    case 'set_setting': {
      const changed: string[] = [];
      const patch = cmd.settings;
      if (patch.doorTags !== undefined && patch.doorTags !== s.settings.doorTags) {
        s.settings.doorTags = patch.doorTags;
        changed.push(`doorTags=${patch.doorTags}`);
      }
      if (patch.voteSeconds !== undefined && patch.voteSeconds !== s.settings.voteSeconds) {
        s.settings.voteSeconds = patch.voteSeconds;
        s.voteStepMs = Math.round(patch.voteSeconds * 1000);
        changed.push(`voteSeconds=${patch.voteSeconds}`);
      }
      if (changed.length) log(s, op, `Settings: ${changed.join(', ')}`);
      return;
    }
    case 'force_phase':
      forcePhase(s, op, cmd.to);
      return;
    case 'gather':
      setGathering(s, op, cmd.on);
      return;
    case 'force_vote':
      forceVote(s, op, cmd.nominationId);
      return;
    case 'vote_clock':
      pauseVoteClock(s, op, cmd.action === 'pause');
      return;
    case 'create_nomination':
      createNomination(s, op, cmd.nominatorSeat, cmd.nomineeSeat, cmd.startVote ?? false);
      return;
    case 'close_vote':
      closeVote(s, op, cmd.mode);
      return;
    case 'set_block':
      setBlock(s, op, cmd.seat, cmd.votes);
      return;
    case 'set_vote':
      setVote(s, op, cmd.nominationId, cmd.seat, cmd.vote);
      return;
    case 'force_execute':
      forceExecute(s, op, cmd.seat);
      return;
    case 'bedtime_timer':
      bedtimeTimer(s, op, cmd.action, cmd.seconds);
      return;
    case 'resend_prompt': {
      const p = mustPlayer(s, cmd.seat);
      const q = findPromptForResend(p, cmd.promptId);
      const step = q.stepId ? s.nightQueue.find((x) => x.id === q.stepId) : undefined;
      const stepOpen = !!step && step.status !== 'resolved' && step.status !== 'skipped';
      // Re-sending an open prompt replaces it (fresh id, back on top).
      p.prompts = p.prompts.filter((x) => x.id !== q.id);
      addPrompt(s, op, p, {
        kind: q.kind,
        title: q.title,
        ...(q.body !== undefined ? { body: q.body } : {}),
        ...(q.minTargets !== undefined ? { minTargets: q.minTargets } : {}),
        ...(q.maxTargets !== undefined ? { maxTargets: q.maxTargets } : {}),
        ...(q.allowSelf !== undefined ? { allowSelf: q.allowSelf } : {}),
        ...(q.allowDead !== undefined ? { allowDead: q.allowDead } : {}),
        ...(q.characterOptions ? { characterOptions: [...q.characterOptions] } : {}),
        ...(stepOpen ? { stepId: q.stepId! } : {}),
      });
      return;
    }
    case 'resend_info': {
      const p = mustPlayer(s, cmd.seat);
      const i = p.info.find((x) => x.id === cmd.infoId);
      if (!i) throw new RuleError('not_found', 'Unknown info');
      giveInfo(s, p, {
        text: i.text,
        ...(i.seats ? { seats: i.seats } : {}),
        ...(i.characters ? { characters: i.characters } : {}),
        ...(i.number !== undefined ? { number: i.number } : {}),
        ...(i.yes !== undefined ? { yes: i.yes } : {}),
      });
      log(s, op, `Re-sent info to ${who(p)}: ${i.text}`);
      return;
    }
    case 'teleport':
    case 'walk_to':
    case 'freeze':
    case 'door_lock':
      // Physical "props" are handled by the world module (apps/server/src/game routes them there).
      throw new RuleError('invalid', 'Handled by the world module');
    case 'set_drunk_belief': {
      const p = mustPlayer(s, cmd.seat);
      if (p.character !== 'drunk') throw new RuleError('invalid', 'That player is not the Drunk');
      if (typeOf(cmd.character) !== 'townsfolk') throw new RuleError('invalid', 'The Drunk must believe they are a Townsfolk');
      if (s.players.some((q) => q !== p && q.character === cmd.character)) alert(s, op, `${charName(cmd.character)} is in play: the Drunk may be exposed.`);
      p.believedCharacter = cmd.character;
      if (s.rolesRevealed) giveInfo(s, p, { text: `You are the ${charName(cmd.character)}.`, characters: [cmd.character] });
      log(s, op, `${who(p)} (the Drunk) now believes they are the ${charName(cmd.character)}`);
      return;
    }
  }
}

function victoryHint(s: GameState, op: Op): void {
  if (!s.assigned || s.phase === 'setup' || s.phase === 'finished') return;
  if (!s.players.some((p) => p.alive && typeOf(p.character) === 'demon'))
    alert(s, op, 'No living Demon: good would win. Use declare_winner if appropriate.');
  else if (aliveCount(s) <= 2) alert(s, op, 'Only two players alive: evil would win. Use declare_winner if appropriate.');
}

/**
 * Run one command atomically (rolled back on error). `history`: 'push' = undoable ST command,
 * 'none' = not recorded (undo itself, presence-only commands, player actions; player actions are
 * recorded for replay by applyPlayerAction instead).
 */
function run(s: GameState, now: number, fn: (op: Op) => void, history: 'push' | 'none', rollback = true): CommandResult {
  const op: Op = { now, effects: [] };
  const snap = rollback || history === 'push' ? serializeCore(s) : null;
  try {
    fn(op);
  } catch (e) {
    if (e instanceof RuleError) {
      // Roll back partial mutations.
      if (snap) restoreKeepingHistory(s, snap);
      return { ok: false, code: e.code, error: e.message };
    }
    if (snap) restoreKeepingHistory(s, snap);
    throw e;
  }
  if (snap && history === 'push') pushHistory(s, snap);
  return { ok: true, effects: op.effects };
}

function restoreKeepingHistory(s: GameState, snap: string): void {
  const core = JSON.parse(snap) as Omit<GameState, 'rng' | 'history'>;
  const { rng, history } = s;
  Object.assign(s, core, { rng, history });
}

/** Apply a Storyteller command (caller has verified the sender is the seated ST). */
export function applyStCommand(s: GameState, cmd: StCommand, ctx: Ctx): CommandResult {
  const isUndo = cmd.type === 'undo_last';
  const presenceOnly = cmd.type === 'visit_home' || cmd.type === 'leave_home' || cmd.type === 'set_travel_speed';
  // Confirming a game end is final (the game finishes), so it is not undoable either.
  const final = cmd.type === 'confirm_result' || cmd.type === 'declare_winner';
  return run(s, ctx.now, (op) => stCommand(s, op, cmd), isUndo || presenceOnly || final ? 'none' : 'push', !isUndo);
}

// --------------------------------------------------------------------------- player actions

export type PlayerAction =
  | { type: 'nominate'; nomineeSeat: number }
  | { type: 'vote'; nominationId: string; vote: boolean }
  | { type: 'promptResponse'; promptId: string; seats?: number[]; character?: CharacterId; yes?: boolean }
  | { type: 'slayerShot'; targetSeat: number };

function promptResponse(s: GameState, op: Op, p: PlayerState, a: Extract<PlayerAction, { type: 'promptResponse' }>): void {
  if (s.phase === 'finished' || s.phase === 'setup') throw new RuleError('phase', 'No prompts now');
  const prompt = p.prompts.find((q) => q.id === a.promptId);
  if (!prompt) throw new RuleError('not_found', 'Unknown prompt');
  const response: { seats?: number[]; character?: CharacterId; yes?: boolean } = {};
  if (prompt.kind === 'choose_players') {
    const seats = a.seats ?? [];
    const min = prompt.minTargets ?? 1;
    const max = prompt.maxTargets ?? min;
    if (seats.length < min || seats.length > max) throw new RuleError('invalid', `Choose ${min === max ? min : `${min}-${max}`} player(s)`);
    if (new Set(seats).size !== seats.length) throw new RuleError('invalid', 'Duplicate choice');
    for (const x of seats) {
      const t = mustPlayer(s, x);
      if (!prompt.allowSelf && t === p) throw new RuleError('invalid', 'You cannot choose yourself');
      if (!prompt.allowDead && !t.publicAlive) throw new RuleError('invalid', 'You cannot choose a dead player');
    }
    response.seats = [...seats];
  } else if (prompt.kind === 'choose_character') {
    if (!a.character) throw new RuleError('invalid', 'Choose a character');
    if (prompt.characterOptions && !prompt.characterOptions.includes(a.character))
      throw new RuleError('invalid', 'Not one of the options');
    response.character = a.character;
  } else if (prompt.kind === 'yes_no') {
    if (a.yes === undefined) throw new RuleError('invalid', 'Answer yes or no');
    response.yes = a.yes;
  }
  p.prompts = p.prompts.filter((q) => q !== prompt);
  if (prompt.stepId) {
    const st = s.nightQueue.find((x) => x.id === prompt.stepId);
    if (st && st.status !== 'resolved' && st.status !== 'skipped') {
      st.response = response;
      st.status = 'answered';
      st.preVisitStatus = 'answered';
    }
  }
  const parts: string[] = [];
  if (response.seats) parts.push(`seats ${response.seats.map((x) => x + 1).join(', ')}`);
  if (response.character) parts.push(charName(response.character));
  if (response.yes !== undefined) parts.push(response.yes ? 'yes' : 'no');
  log(s, op, `${who(p)} answered "${prompt.title}": ${parts.join(' ') || 'ok'}`);
}

/** Apply a player action from `seat` (caller maps pid -> seat). */
export function applyPlayerAction(s: GameState, seat: number, a: PlayerAction, ctx: Ctx): CommandResult {
  const r = run(s, ctx.now, (op) => playerAction(s, op, seat, a), 'none', a.type !== 'vote');
  // Recorded against the ST's last undoable command so undo_last can replay it.
  if (r.ok) s.history.at(-1)?.replay.push({ seat, action: a, now: ctx.now });
  return r;
}

function playerAction(s: GameState, op: Op, seat: number, a: PlayerAction): void {
  const p = mustPlayer(s, seat);
  if (s.resultPending) throw new RuleError('phase', 'Please wait for the Storyteller.');
  switch (a.type) {
    case 'nominate':
      nominate(s, op, seat, a.nomineeSeat);
      return;
    case 'vote':
      setHand(s, op, seat, a.nominationId, a.vote);
      return;
    case 'promptResponse':
      promptResponse(s, op, p, a);
      return;
    case 'slayerShot':
      slayerShot(s, op, seat, a.targetSeat);
      return;
  }
}

// ------------------------------------------------------------------------- timers/presence

export interface TickOptions {
  /**
   * (gameplay) Whether every seated player is inside their own home (from the world module).
   * When given, bedtime works as "walk home": the countdown expiring only starts the overtime
   * (stragglers are walked home) and the night falls once everyone is home (unless the ST holds
   * the countdown or is disconnected). When omitted (engine-only use), the countdown expiring
   * starts the night directly.
   */
  everyoneHome?: boolean;
}

/** Advance timers: bedtime countdown / nightfall and the voting clock hand. */
export function tick(s: GameState, now: number, opts: TickOptions = {}): { changed: boolean; effects: Effect[] } {
  const op: Op = { now, effects: [] };
  let changed = false;
  if (s.phase === 'bedtime' && !s.resultPending) {
    const expired = s.phaseEndsAt !== null && now >= s.phaseEndsAt;
    if (opts.everyoneHome === undefined) {
      if (expired) {
        startNight(s, op, s.bedtimeFirst, 'bedtime');
        changed = true;
      }
    } else if (opts.everyoneHome && s.storytellerConnected && !s.bedtimeHeld) {
      startNight(s, op, s.bedtimeFirst, 'bedtime');
      changed = true;
    } else if (expired && !s.bedtimeOvertime) {
      s.bedtimeOvertime = true;
      s.phaseEndsAt = null;
      log(s, op, 'Bedtime is over: stragglers are walked home');
      changed = true;
    }
  }
  if (tickVote(s, op)) changed = true;
  return { changed, effects: op.effects };
}

/** ST connection changes pause/resume the bedtime countdown. */
export function setStorytellerConnected(s: GameState, connected: boolean, now: number): boolean {
  if (s.storytellerConnected === connected) return false;
  s.storytellerConnected = connected;
  if (s.phase !== 'bedtime') return true;
  if (!connected && s.phaseEndsAt !== null) {
    s.bedtimePausedRemainingMs = Math.max(0, s.phaseEndsAt - now);
    s.phaseEndsAt = null;
  } else if (connected && s.bedtimePausedRemainingMs !== null && !s.bedtimeHeld) {
    s.phaseEndsAt = now + s.bedtimePausedRemainingMs;
    s.bedtimePausedRemainingMs = null;
  }
  return true;
}

export function setPlayerConnected(s: GameState, seat: number, connected: boolean): boolean {
  const p = s.players.find((x) => x.seat === seat);
  if (!p || p.connected === connected) return false;
  p.connected = connected;
  return true;
}

/** The ST entered (seat) or left (null) a home. Only meaningful at night. */
/** (gameplay) Append a Storyteller log line for world-side "props" (teleport, freeze, doors). */
export function noteStoryteller(s: GameState, now: number, text: string): void {
  log(s, { now, effects: [] }, text);
}

export function setVisiting(s: GameState, seat: number | null): boolean {
  if (seat === s.visitingSeat) return false;
  if (s.visitingSeat !== null) {
    for (const st of s.nightQueue)
      if (st.seat === s.visitingSeat && st.status === 'visiting') st.status = st.preVisitStatus ?? 'pending';
  }
  s.visitingSeat = seat;
  if (seat !== null) {
    const st = openStepFor(s, seat);
    if (st && st.status === 'pending') {
      st.preVisitStatus = 'pending';
      st.status = 'visiting';
    }
  }
  return true;
}

export { checkVictory };
