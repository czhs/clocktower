import { CHARACTER_INFO, DEFAULT_BEDTIME_SECONDS, MAX_PLAYERS, MIN_PLAYERS, type CharacterId, type StCommand } from '@ct/protocol';
import { checkVictory, finish, killPlayer, publish } from './deaths.js';
import {
  cancelNomination,
  execute,
  mayorCheck,
  newDay,
  nominate,
  setHand,
  slayerShot,
  startVote,
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

export const DEFAULT_VOTE_STEP_MS = 1500;
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
  s.history.push(snap);
  if (s.history.length > HISTORY_LIMIT) s.history.splice(0, s.history.length - HISTORY_LIMIT);
}

function undo(s: GameState, op: Op): void {
  const snap = s.history.pop();
  if (!snap) throw new RuleError('invalid', 'Nothing to undo');
  // Keep live presence facts (they mirror the world/connection, not rules decisions).
  const visiting = s.visitingSeat;
  const stConnected = s.storytellerConnected;
  const connected = new Map(s.players.map((p) => [p.seat, p.connected]));
  const core = JSON.parse(snap) as Omit<GameState, 'rng' | 'history'>;
  const { rng, history } = s;
  Object.assign(s, core, { rng, history });
  s.storytellerConnected = stConnected;
  for (const p of s.players) p.connected = connected.get(p.seat) ?? p.connected;
  if (!isNightPhase(s)) s.visitingSeat = null;
  else s.visitingSeat = visiting;
  log(s, op, 'Storyteller undid the last action');
}

// ----------------------------------------------------------------------------------- phases

function clearStepPrompts(s: GameState): void {
  for (const p of s.players) p.prompts = p.prompts.filter((q) => q.stepId === null);
}

function startNight(s: GameState, op: Op, first: boolean, reason: 'bedtime' | 'night'): void {
  s.phase = first ? 'first_night' : 'night';
  s.nightNumber += 1;
  s.phaseEndsAt = null;
  s.bedtimePausedRemainingMs = null;
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

function startBedtime(s: GameState, op: Op): void {
  s.phase = 'bedtime';
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
    bedtime: ['day'],
    night: ['day', 'bedtime'],
  };
  if (!ok[to].includes(from)) throw new RuleError('phase', `Cannot go from ${from} to ${to}`);
  if (from === 'day') {
    if (s.day?.vote) throw new RuleError('phase', 'A vote is still running');
    if (mayorCheck(s, op)) return;
  }
  if (to === 'day') startDay(s, op);
  else if (to === 'dawn') {
    s.phase = 'dawn';
    s.phaseEndsAt = null;
    log(s, op, 'Dawn: reviewing the night');
  } else if (to === 'bedtime') startBedtime(s, op);
  else startNight(s, op, false, 'night');
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

function stCommand(s: GameState, op: Op, cmd: StCommand): void {
  if (s.phase === 'finished') {
    const allowed: StCommand['type'][] = ['declare_winner', 'undo_last', 'announce', 'set_travel_speed', 'visit_home', 'leave_home'];
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
    case 'add_reminder':
      addReminder(mustPlayer(s, cmd.seat), cmd.token);
      return;
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
  }
}

function victoryHint(s: GameState, op: Op): void {
  if (!s.assigned || s.phase === 'setup' || s.phase === 'finished') return;
  if (!s.players.some((p) => p.alive && typeOf(p.character) === 'demon'))
    alert(s, op, 'No living Demon: good would win. Use declare_winner if appropriate.');
  else if (aliveCount(s) <= 2) alert(s, op, 'Only two players alive: evil would win. Use declare_winner if appropriate.');
}

function run(s: GameState, now: number, fn: (op: Op) => void, undoable: boolean): CommandResult {
  const op: Op = { now, effects: [] };
  const snap = undoable ? serializeCore(s) : null;
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
  if (snap) pushHistory(s, snap);
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
  return run(s, ctx.now, (op) => stCommand(s, op, cmd), !isUndo && !presenceOnly);
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
  return run(
    s,
    ctx.now,
    (op) => {
      const p = mustPlayer(s, seat);
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
    },
    a.type !== 'vote',
  );
}

// ------------------------------------------------------------------------- timers/presence

/** Advance timers: bedtime countdown and the voting clock hand. */
export function tick(s: GameState, now: number): { changed: boolean; effects: Effect[] } {
  const op: Op = { now, effects: [] };
  let changed = false;
  if (s.phase === 'bedtime' && s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
    startNight(s, op, false, 'bedtime');
    changed = true;
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
  } else if (connected && s.bedtimePausedRemainingMs !== null) {
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
