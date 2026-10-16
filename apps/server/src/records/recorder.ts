// OWNED BY records. GameRecorder: observes the rules engine's GameState after every committed
// change (apps/server/src/game/index.ts calls observe() from commit(), with the trigger: the ST
// command / player action / tick that caused it) and accumulates the full game record + the
// play-by-play timeline. It never mutates the GameState and never throws into the game (the game
// module wraps every call).
//
// Why a state diff instead of hooks inside @ct/rules: the engine is pure and owned by
// rules-storyteller; diffing the state after each commit captures every change (including
// cascades like Scarlet Woman / star-pass / Virgin) at one seam. Death/execution causes and Imp
// successions are read from the engine's ST log lines (see LOG_* regexes; covered by
// apps/server/test/records.test.ts so a wording change in the engine fails loudly).
// CONTRACT-REQUEST (rules-storyteller): a structured `lastDeathCause` / `becameImpBecause` on
// PlayerState would let us drop the log parsing.
import { CHARACTER_INFO, type CharacterId, type GamePhase, type StCommand, type StoryActor, type StoryEntry, type StoryEntryKind } from '@ct/protocol';
import type { GameState, PlayerAction, PlayerState } from '@ct/rules';
import type {
  ActionRecord,
  AnnouncementRecord,
  CommandRecord,
  ConnectionRecord,
  Ctx,
  DeathCause,
  DeathRecord,
  ExecutionRecord,
  InfoRecord,
  LogRecord,
  NightStepRecord,
  NominationRecord,
  PhaseSpan,
  PromptRecord,
  ResultRecord,
  RoleChangeRecord,
  SetupRecord,
  StatusChangeRecord,
  StatusField,
  Via,
  VisitRecord,
} from './types.js';
import type { Pamphlet } from '@ct/protocol';

export type RecordTrigger =
  | { kind: 'st'; cmd: StCommand }
  | { kind: 'player'; seat: number; action: PlayerAction }
  | { kind: 'tick' }
  | { kind: 'connection' }
  | { kind: 'visit' }
  | { kind: 'start' }
  | { kind: 'other' };

/** A public line for mid-game pamphlets: ONLY announcements every player received + public votes. */
export interface PublicItem {
  t: number;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  source: 'announcement' | 'vote';
  /** Announcement kind (for tones). */
  kind: string;
  text: string;
  undone?: boolean;
}

/** Engine log formats (packages/rules: deaths.ts killPlayer / becomeImp, day.ts executeNow). */
const LOG_DIED = /\(seat (\d+)\) \(([a-z_]+)\) died: ([a-z]+)$/;
const LOG_EXECUTED = /\(seat (\d+)\) executed \((execution|virgin)\)$/;
const LOG_BECAME_IMP = /\(seat (\d+)\) became the Imp: (.*)$/;

/** ST commands the engine does NOT push onto its undo history (engine.ts applyStCommand + world props). */
const NOT_UNDOABLE = new Set<string>([
  'undo_last',
  'visit_home',
  'leave_home',
  'set_travel_speed',
  'confirm_result',
  'declare_winner',
  'teleport',
  'walk_to',
  'freeze',
  'door_lock',
  'teleport_self',
  'day_clock', // (auto-st) the town clock prop is not on the engine's undo history
]);
const ENGINE_HISTORY_LIMIT = 30;
const NIGHTISH: GamePhase[] = ['first_night', 'night', 'dawn'];

interface PShadow {
  character: CharacterId;
  alignment: 'good' | 'evil';
  believed: CharacterId;
  alive: boolean;
  publicAlive: boolean;
  poisonedBy: string | null;
  drunkOverride: boolean;
  protectedTonight: boolean;
  ghostVoteAvailable: boolean;
  ghostVoteUsed: boolean;
  abilityUsed: boolean;
  slayerShotTaken: boolean;
  butlerMasterSeat: number | null;
  reminders: string[];
  executed: boolean;
  connected: boolean;
}

interface Shadow {
  phase: GamePhase;
  day: number;
  night: number;
  players: Map<number, PShadow>;
  visitingSeat: number | null;
  redHerringSeat: number | null;
  demonBluffs: string;
  settings: string;
  bedtimeSeconds: number;
  resultPending: boolean;
  rolesRevealed: boolean;
  storytellerConnected: boolean;
  log: { at: number; text: string }[];
  steps: Map<string, string>;
}

type Undoable = { undone?: boolean };

const cname = (c: string) => (c in CHARACTER_INFO ? CHARACTER_INFO[c as CharacterId].name : c);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

function shadowPlayer(p: PlayerState): PShadow {
  return {
    character: p.character,
    alignment: p.alignment,
    believed: p.believedCharacter,
    alive: p.alive,
    publicAlive: p.publicAlive,
    poisonedBy: p.poisonedBy,
    drunkOverride: p.drunkOverride,
    protectedTonight: p.protectedTonight,
    ghostVoteAvailable: p.ghostVoteAvailable,
    ghostVoteUsed: p.ghostVoteUsed,
    abilityUsed: p.abilityUsed,
    slayerShotTaken: p.slayerShotTaken,
    butlerMasterSeat: p.butlerMasterSeat,
    reminders: [...p.reminders],
    executed: p.executed,
    connected: p.connected,
  };
}

function shadowOf(s: GameState): Shadow {
  return {
    phase: s.phase,
    day: s.dayNumber,
    night: s.nightNumber,
    players: new Map(s.players.map((p) => [p.seat, shadowPlayer(p)])),
    visitingSeat: s.visitingSeat,
    redHerringSeat: s.redHerringSeat,
    demonBluffs: JSON.stringify(s.demonBluffs),
    settings: JSON.stringify(s.settings),
    bedtimeSeconds: s.bedtimeSeconds,
    resultPending: s.resultPending,
    rolesRevealed: s.rolesRevealed,
    storytellerConnected: s.storytellerConnected,
    log: s.log.map((l) => ({ at: l.at, text: l.text })),
    steps: new Map(s.nightQueue.map((x) => [x.id, x.status])),
  };
}

/** New engine log lines since `prev` (the engine trims from the front; undo/rollback truncates the tail). */
export function diffLog(prev: { at: number; text: string }[], cur: { at: number; text: string }[]): { added: { at: number; text: string }[]; removedTail: number } {
  const eq = (a: { at: number; text: string }, b: { at: number; text: string }) => a.at === b.at && a.text === b.text;
  if (!cur.length) return { added: [], removedTail: prev.length };
  const k = prev.findIndex((x) => eq(x, cur[0]!));
  if (k < 0) return { added: cur.slice(), removedTail: 0 };
  let j = 0;
  while (k + j < prev.length && j < cur.length && eq(prev[k + j]!, cur[j]!)) j++;
  return { added: cur.slice(j), removedTail: prev.length - (k + j) };
}

export class GameRecorder {
  readonly startedAt: number;
  readonly initialSettings: { bedtimeSeconds: number; voteSeconds: number; doorTags: boolean; pamphlets: boolean };
  /** The live engine state (same object for the whole game; read-only here). */
  state: GameState;
  stPid: string | null;
  rev = 1;

  readonly timeline: StoryEntry[] = [];
  readonly publicItems: PublicItem[] = [];
  readonly phases: PhaseSpan[] = [];
  readonly nominations: NominationRecord[] = [];
  readonly executions: ExecutionRecord[] = [];
  readonly deaths: DeathRecord[] = [];
  readonly roleChanges: RoleChangeRecord[] = [];
  readonly statusChanges: StatusChangeRecord[] = [];
  readonly nightSteps = new Map<string, NightStepRecord>();
  readonly info: InfoRecord[] = [];
  readonly prompts = new Map<string, PromptRecord>();
  readonly visits: VisitRecord[] = [];
  readonly commands: CommandRecord[] = [];
  readonly actions: ActionRecord[] = [];
  readonly connections: ConnectionRecord[] = [];
  readonly log: LogRecord[] = [];
  readonly announcements: AnnouncementRecord[] = [];
  readonly pamphlets: Pamphlet[] = [];
  readonly warnings: string[] = [];
  setup: SetupRecord | null = null;
  result: ResultRecord | null = null;
  /** When the engine detected the (latest) pending result. */
  private detectedAt: number | null = null;
  setupMethod: SetupRecord['method'] | null = null;

  private shadow: Shadow;
  private activeNoms = new Map<string, NominationRecord>();
  private seenInfo = new Set<string>();
  private seenAnn = new Set<string>();
  private undoStack: { seq: number; desc: string }[] = [];
  private byCmd = new Map<number, Undoable[]>();
  private cmdSeq = 0;
  private sig = '';

  constructor(state: GameState, now: number, stPid: string | null) {
    this.state = state;
    this.stPid = stPid;
    this.startedAt = state.startedAt || now;
    this.initialSettings = this.settingsOf(state);
    this.shadow = shadowOf(state);
    this.phases.push({ phase: state.phase, day: state.dayNumber, night: state.nightNumber, startedAt: now, endedAt: null, via: 'start' });
    this.push(this.ctxOf(state, now), 'phase', [], { phase: state.phase }, 'The Storyteller sets up the game.');
    for (const a of state.announcements) this.seenAnn.add(a.id);
  }

  settingsOf(s: GameState) {
    return {
      bedtimeSeconds: s.bedtimeSeconds,
      voteSeconds: s.settings.voteSeconds,
      doorTags: s.settings.doorTags,
      pamphlets: s.settings.pamphlets === true,
    };
  }

  ctxOf(s: GameState, at: number): Ctx {
    return { at, t: Math.max(0, at - this.startedAt), day: s.dayNumber, night: s.nightNumber, phase: s.phase };
  }

  private shadowCtx(at: number): Ctx {
    return { at, t: Math.max(0, at - this.startedAt), day: this.shadow.day, night: this.shadow.night, phase: this.shadow.phase };
  }

  // ------------------------------------------------------------------------------ naming

  private player(seat: number): PlayerState | undefined {
    return this.state.players.find((p) => p.seat === seat);
  }
  name(seat: number | null | undefined): string {
    if (seat === null || seat === undefined) return 'nobody';
    return this.player(seat)?.name ?? `seat ${seat + 1}`;
  }
  /** "Ada (Fortune Teller)" with the TRUE character (ST-side text). */
  who(seat: number, character?: string): string {
    const c = character ?? this.player(seat)?.character;
    return c && this.state.assigned ? `${this.name(seat)} (${cname(c)})` : this.name(seat);
  }
  private actor(seat: number | null): StoryActor {
    if (seat === null) return { seat: null, pid: this.stPid ?? '' };
    return { seat, pid: this.player(seat)?.pid ?? '' };
  }

  // ------------------------------------------------------------------------------ output helpers

  private tag<T extends Undoable>(x: T, seq: number | null): T {
    if (seq !== null) {
      const arr = this.byCmd.get(seq) ?? [];
      arr.push(x);
      this.byCmd.set(seq, arr);
    }
    return x;
  }

  private curSeq: number | null = null;

  private push(ctx: Ctx, kind: StoryEntryKind, seats: (number | null)[], data: Record<string, unknown>, text: string): StoryEntry {
    const e: StoryEntry = {
      t: ctx.t,
      at: ctx.at,
      day: ctx.day,
      night: ctx.night,
      phase: ctx.phase,
      kind,
      actors: seats.map((x) => this.actor(x)),
      data,
      text,
    };
    this.timeline.push(this.tag(e, this.curSeq));
    return e;
  }

  // ------------------------------------------------------------------------------ observe

  /** Call after every committed change to the GameState. */
  observe(s: GameState, now: number, trigger: RecordTrigger): void {
    this.state = s;
    const prev = this.shadow;
    const before = this.shadowCtx(now);
    const after = this.ctxOf(s, now);
    const via = viaOf(trigger);
    const isUndo = trigger.kind === 'st' && trigger.cmd.type === 'undo_last';
    this.curSeq = null;

    // 1. the command / action itself
    if (trigger.kind === 'st') {
      this.commands.push({ at: now, day: before.day, night: before.night, phase: before.phase, cmd: { ...(trigger.cmd as { type: string } & Record<string, unknown>) } });
      if (!NOT_UNDOABLE.has(trigger.cmd.type)) {
        const seq = ++this.cmdSeq;
        this.curSeq = seq;
        this.undoStack.push({ seq, desc: this.describe(trigger.cmd) });
        if (this.undoStack.length > ENGINE_HISTORY_LIMIT) this.undoStack.splice(0, this.undoStack.length - ENGINE_HISTORY_LIMIT);
      }
      if (trigger.cmd.type === 'random_setup') this.setupMethod = this.setupMethod === 'manual' ? 'mixed' : 'random';
      if (trigger.cmd.type === 'assign_characters') this.setupMethod = this.setupMethod === 'random' ? 'mixed' : 'manual';
    } else if (trigger.kind === 'player') {
      this.actions.push({ at: now, day: before.day, night: before.night, phase: before.phase, seat: trigger.seat, action: { ...(trigger.action as { type: string } & Record<string, unknown>) } });
    }

    // 2. undo: everything the undone command produced is marked undone
    let undoneDesc: string | null = null;
    if (isUndo) {
      const top = this.undoStack.pop();
      undoneDesc = top?.desc ?? 'the last action';
      if (top) for (const x of this.byCmd.get(top.seq) ?? []) x.undone = true;
    }

    // 3. engine log (the Storyteller's grimoire log) + causes found in it
    const { added, removedTail } = diffLog(prev.log, s.log);
    if (removedTail > 0) {
      let n = removedTail;
      for (let i = this.log.length - 1; i >= 0 && n > 0; i--) {
        if (this.log[i]!.undone) continue;
        this.log[i]!.undone = true;
        n--;
      }
    }
    const diedCause = new Map<number, DeathCause>();
    const execCause = new Map<number, 'execution' | 'virgin'>();
    const impWhy = new Map<number, string>();
    for (const l of added) {
      this.log.push(this.tag<LogRecord>({ at: l.at, text: l.text }, this.curSeq));
      let m = LOG_DIED.exec(l.text);
      if (m) diedCause.set(Number(m[1]) - 1, m[3] as DeathCause);
      m = LOG_EXECUTED.exec(l.text);
      if (m) execCause.set(Number(m[1]) - 1, m[2] as 'execution' | 'virgin');
      m = LOG_BECAME_IMP.exec(l.text);
      if (m) impWhy.set(Number(m[1]) - 1, m[2]!);
    }

    if (undoneDesc !== null) this.push(before, 'storyteller', [null], { command: 'undo_last', undid: undoneDesc }, `The Storyteller undid: ${undoneDesc}.`);
    else if (trigger.kind === 'st') this.overrideEntry(trigger.cmd, before, prev);

    // 4. public announcements (verbatim). Entries before the batch's first phase announcement keep
    // the previous phase/day header; the phase announcement and everything after use the new one.
    let annCtx = before;
    for (const a of s.announcements) {
      if (this.seenAnn.has(a.id)) continue;
      this.seenAnn.add(a.id);
      if (a.kind === 'phase') annCtx = after;
      const rec = this.tag<AnnouncementRecord>({ id: a.id, at: a.at, day: annCtx.day, night: annCtx.night, phase: annCtx.phase, kind: a.kind, text: a.text }, this.curSeq);
      this.announcements.push(rec);
      this.publicItems.push(this.tag<PublicItem>({ ...this.pubCtx(annCtx), source: 'announcement', kind: a.kind, text: a.text }, this.curSeq));
      if (a.kind === 'storyteller' && trigger.kind === 'st' && trigger.cmd.type === 'announce')
        this.push(before, 'announcement', [null], { announcementId: a.id }, `The Storyteller announced: “${a.text}”`);
    }
    if (isUndo) {
      // Announcements the undo removed (ids are never reused: a missing id above the highest present one).
      const present = new Set(s.announcements.map((a) => a.id));
      const maxSeq = Math.max(0, ...s.announcements.map((a) => Number(a.id.slice(1)) || 0));
      for (const a of this.announcements) if (!present.has(a.id) && (Number(a.id.slice(1)) || 0) > maxSeq) a.undone = true;
      for (const p of this.publicItems)
        if (p.source === 'announcement') {
          const rec = this.announcements.find((x) => x.text === p.text && x.at === p.at);
          if (rec?.undone) p.undone = true;
        }
    }

    // 5. prompts + info (before night steps: info sent for a step is folded into the step's entry)
    this.observePrompts(s, before, trigger);
    const looseInfo = this.observeInfo(s, before, trigger);

    // 6. nominations / votes
    this.observeNominations(s, before, trigger, isUndo, execCause);

    // 7. night steps
    this.observeSteps(s, prev, before, trigger, isUndo);
    for (const i of looseInfo) {
      const st = i.stepId ? this.nightSteps.get(i.stepId) : undefined;
      if (st && st.resolvedAt === null) continue; // folded into the step entry when it resolves
      if (st && st.infoIds.length && st.resolvedAt !== null && st.resolvedAt === now) continue; // resolved in this batch
      this.push(before, 'info', [null, i.seat], { infoId: i.id, seat: i.seat, text: i.text, ...infoData(i) }, `The Storyteller told ${this.who(i.seat)}: “${i.text}”`);
    }

    // 8. players
    if (!isUndo) this.observePlayers(s, prev, before, after, trigger, via, diedCause, execCause, impWhy);
    else for (const p of s.players) this.observeConnection(prev.players.get(p.seat), p, now);

    // 9. game-wide values
    if (!isUndo && s.phase !== 'setup' && prev.phase !== 'setup') this.observeGlobals(s, prev, before, via);
    if (s.storytellerConnected !== prev.storytellerConnected) this.connections.push({ at: now, seat: null, connected: s.storytellerConnected });

    // 10. visits
    if (s.visitingSeat !== prev.visitingSeat) {
      const open = this.visits.at(-1);
      if (open && open.endedAt === null) open.endedAt = now;
      if (s.visitingSeat !== null) this.visits.push({ seat: s.visitingSeat, night: s.nightNumber, startedAt: now, endedAt: null });
    }

    // 11. setup (when the roles are revealed: the first night falls)
    if (s.rolesRevealed && !prev.rolesRevealed) this.recordSetup(s, before);

    // 12. result
    if (s.resultPending && !prev.resultPending && s.result) {
      this.detectedAt = now;
      this.push(before, 'result_pending', [null], { winner: s.result.winner, reason: s.result.reason }, `Game end detected: ${cap(s.result.winner)} would win (${s.result.reason}) — waiting for the Storyteller.`);
    } else if (!s.resultPending && prev.resultPending && s.phase !== 'finished' && !isUndo) {
      this.push(before, 'result_overridden', [null], {}, 'The Storyteller overrode the game end: the game continues.');
    }
    if (s.phase === 'finished' && prev.phase !== 'finished' && s.result) {
      const v = trigger.kind === 'st' && (trigger.cmd.type === 'confirm_result' || trigger.cmd.type === 'declare_winner') ? trigger.cmd.type : 'other';
      this.result = { winner: s.result.winner, reason: s.result.reason, at: s.endedAt ?? now, detectedAt: v === 'declare_winner' ? null : this.detectedAt, via: v, confirmedBy: null };
      this.push(
        before,
        'end',
        [null],
        { winner: s.result.winner, reason: s.result.reason, via: v },
        `${cap(s.result.winner)} wins: ${s.result.reason}${v === 'declare_winner' ? ' (declared by the Storyteller)' : ''}`,
      );
    }

    // 13. phase
    if (s.phase !== prev.phase || s.dayNumber !== prev.day || s.nightNumber !== prev.night) this.phaseChange(s, prev, after, via, isUndo);

    this.shadow = shadowOf(s);
    const sig = `${this.timeline.length}:${this.publicItems.length}:${this.cmdSeq}:${this.undoStack.length}:${this.pamphlets.length}:${s.phase}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.rev++;
    }
    this.curSeq = null;
  }

  private pubCtx(c: Ctx) {
    return { t: c.t, at: c.at, day: c.day, night: c.night, phase: c.phase };
  }

  // ------------------------------------------------------------------------------ pieces

  private observePrompts(s: GameState, ctx: Ctx, trigger: RecordTrigger) {
    for (const p of s.players) {
      for (const q of [...p.promptHistory, ...p.prompts]) {
        if (this.prompts.has(q.id)) continue;
        const rec: PromptRecord = {
          id: q.id,
          seat: p.seat,
          at: ctx.at,
          day: ctx.day,
          night: ctx.night,
          phase: ctx.phase,
          kind: q.kind,
          title: q.title,
          ...(q.body !== undefined ? { body: q.body } : {}),
          ...(q.minTargets !== undefined ? { minTargets: q.minTargets } : {}),
          ...(q.maxTargets !== undefined ? { maxTargets: q.maxTargets } : {}),
          ...(q.characterOptions ? { characterOptions: [...q.characterOptions] } : {}),
          stepId: q.stepId,
          response: null,
        };
        this.prompts.set(q.id, this.tag(rec, this.curSeq));
        if (q.stepId) this.nightSteps.get(q.stepId)?.promptIds.push(q.id);
        else this.push(ctx, 'info', [null, p.seat], { promptId: q.id, title: q.title, kind: q.kind }, `The Storyteller asked ${this.who(p.seat)}: “${q.title}”`);
      }
    }
    if (trigger.kind === 'player' && trigger.action.type === 'promptResponse') {
      const a = trigger.action;
      const rec = this.prompts.get(a.promptId);
      if (rec && rec.response === null) {
        rec.response = { at: ctx.at, ...(a.seats ? { seats: [...a.seats] } : {}), ...(a.character ? { character: a.character } : {}), ...(a.yes !== undefined ? { yes: a.yes } : {}) };
        if (!rec.stepId)
          this.push(ctx, 'info', [trigger.seat], { promptId: rec.id, response: rec.response }, `${this.who(trigger.seat)} answered “${rec.title}”: ${this.answerText(rec.response)}.`);
      }
    }
  }

  answerText(r: { seats?: number[]; character?: string; yes?: boolean } | undefined | null): string {
    if (!r) return 'ok';
    const parts: string[] = [];
    if (r.seats?.length) parts.push(list(r.seats.map((x) => this.name(x))));
    if (r.character) parts.push(cname(r.character));
    if (r.yes !== undefined) parts.push(r.yes ? 'yes' : 'no');
    return parts.join(', ') || 'ok';
  }

  private observeInfo(s: GameState, ctx: Ctx, trigger: RecordTrigger): InfoRecord[] {
    const out: InfoRecord[] = [];
    const cmdStep = trigger.kind === 'st' && trigger.cmd.type === 'send_info' ? (trigger.cmd.info.stepId ?? null) : null;
    for (const p of s.players) {
      for (const i of p.info) {
        if (this.seenInfo.has(i.id)) continue;
        this.seenInfo.add(i.id);
        let stepId = cmdStep && trigger.kind === 'st' && trigger.cmd.type === 'send_info' && trigger.cmd.seat === p.seat ? cmdStep : null;
        if (!stepId && trigger.kind === 'st' && trigger.cmd.type === 'resolve_step') {
          // Info produced by resolving a step (Minion / Demon info, an Imp succession) belongs to it.
          const id = trigger.cmd.stepId;
          if (s.nightQueue.some((x) => x.id === id)) stepId = id;
        }
        if (!stepId && NIGHTISH.includes(s.phase)) {
          // Info given while that player's night step is open belongs to the step (engine openStepFor).
          stepId = s.nightQueue.find((st) => st.seat === p.seat && st.status !== 'resolved' && st.status !== 'skipped')?.id ?? null;
        }
        const rec: InfoRecord = {
          id: i.id,
          seat: p.seat,
          at: ctx.at,
          day: ctx.day,
          night: ctx.night,
          phase: ctx.phase,
          text: i.text,
          ...(i.seats ? { seats: [...i.seats] } : {}),
          ...(i.characters ? { characters: [...i.characters] } : {}),
          ...(i.number !== undefined ? { number: i.number } : {}),
          ...(i.yes !== undefined ? { yes: i.yes } : {}),
          stepId,
        };
        this.info.push(this.tag(rec, this.curSeq));
        if (stepId) {
          const st = this.nightSteps.get(stepId) ?? this.ensureStep(s, stepId, ctx);
          st?.infoIds.push(i.id);
        }
        out.push(rec);
      }
    }
    return out;
  }

  private ensureStep(s: GameState, id: string, ctx: Ctx): NightStepRecord | undefined {
    const st = s.nightQueue.find((x) => x.id === id);
    if (!st) return undefined;
    const rec: NightStepRecord = {
      id: st.id,
      night: s.nightNumber,
      order: st.order,
      kind: st.kind,
      seat: st.seat,
      status: st.status,
      infoSent: !!st.infoSent,
      resolvedAt: null,
      infoIds: [],
      promptIds: [],
    };
    void ctx;
    this.nightSteps.set(st.id, rec);
    return rec;
  }

  private observeNominations(s: GameState, ctx: Ctx, trigger: RecordTrigger, isUndo: boolean, execCause: Map<number, 'execution' | 'virgin'>) {
    const d = s.day;
    const present = new Set<string>();
    for (const n of d?.nominations ?? []) {
      present.add(n.id);
      let rec = this.activeNoms.get(n.id);
      if (!rec) {
        const dup = this.nominations.filter((x) => x.id === n.id).length;
        const byST = trigger.kind === 'st' && trigger.cmd.type === 'create_nomination';
        rec = this.tag<NominationRecord>(
          {
            id: n.id,
            key: dup ? `${n.id}~${dup + 1}` : n.id,
            day: s.dayNumber,
            at: ctx.at,
            nominatorSeat: n.nominatorSeat,
            nomineeSeat: n.nomineeSeat,
            createdBy: byST ? 'storyteller' : 'player',
            status: n.status,
            voteOrder: null,
            votes: [],
            voteCount: 0,
            threshold: n.threshold,
            minVotes: null,
            talliedAt: null,
            result: 'not_voted',
            nomineeExecuted: false,
          },
          this.curSeq,
        );
        this.nominations.push(rec);
        this.activeNoms.set(n.id, rec);
        const virgin = execCause.get(n.nominatorSeat) === 'virgin';
        this.push(
          ctx,
          'nomination',
          [n.nominatorSeat, n.nomineeSeat],
          { nominationId: rec.key, nominatorSeat: n.nominatorSeat, nomineeSeat: n.nomineeSeat, createdBy: rec.createdBy, virgin },
          `${this.name(n.nominatorSeat)} nominated ${this.name(n.nomineeSeat)}${byST ? ' (recorded by the Storyteller)' : ''}.`,
        );
        if (virgin) rec.result = 'virgin';
      }
      const was = rec.status;
      rec.status = n.status;
      rec.threshold = n.threshold;
      rec.voteCount = n.voteCount;
      rec.minVotes = n.minVotes ?? rec.minVotes;
      if (d?.vote?.nominationId === n.id) rec.voteOrder = [...d.vote.order];
      // votes (locked as the clock hand passes; ST may strike/set later; a re-vote resets them)
      const votes = n.votes as Record<number, boolean>;
      rec.votes = rec.votes.filter((v) => String(v.seat) in votes);
      for (const [k, yes] of Object.entries(votes)) {
        const seat = Number(k);
        const v = rec.votes.find((x) => x.seat === seat);
        const ghost = yes && !(this.player(seat)?.publicAlive ?? true);
        if (!v) rec.votes.push({ seat, yes, ghost, at: ctx.at });
        else if (v.yes !== yes) {
          v.yes = yes;
          v.ghost = ghost;
        }
      }
      if (n.status === 'tallied' && was !== 'tallied' && !isUndo) {
        rec.talliedAt = ctx.at;
        const block = d?.block;
        rec.result =
          block && block.seat === n.nomineeSeat && block.votes === n.voteCount
            ? 'on_the_block'
            : n.voteCount >= (n.minVotes ?? Infinity) && n.voteCount === d?.highWater
              ? 'tie'
              : 'not_enough';
        this.voteEntry(rec, ctx);
      }
      if (n.status === 'cancelled' && rec.result !== 'virgin') rec.result = 'cancelled';
    }
    // Nominations that vanished: undone (the day itself, or the nomination) — otherwise the day is over.
    for (const [id, rec] of this.activeNoms) {
      if (present.has(id)) continue;
      if (s.dayNumber < rec.day || (d && s.phase === 'day' && s.dayNumber === rec.day)) {
        rec.undone = true;
        this.activeNoms.delete(id);
      }
    }
  }

  private voteEntry(rec: NominationRecord, ctx: Ctx) {
    const order = rec.voteOrder ?? rec.votes.map((v) => v.seat);
    const yes = [...rec.votes].filter((v) => v.yes).sort((a, b) => order.indexOf(a.seat) - order.indexOf(b.seat));
    const names = yes.map((v) => `${this.name(v.seat)}${v.ghost ? ' (ghost vote)' : ''}`);
    const outcome = rec.result === 'on_the_block' ? 'on the block' : rec.result === 'tie' ? 'a tie: nobody is on the block' : 'not enough';
    const text = `Votes on ${this.name(rec.nomineeSeat)} (nominated by ${this.name(rec.nominatorSeat)}): ${names.length ? list(names) : 'none'} — ${rec.voteCount} of ${rec.threshold} needed: ${outcome}.`;
    this.push(
      ctx,
      'vote',
      [rec.nominatorSeat, rec.nomineeSeat, ...yes.map((v) => v.seat)],
      { nominationId: rec.key, nomineeSeat: rec.nomineeSeat, nominatorSeat: rec.nominatorSeat, votes: rec.votes.map((v) => ({ seat: v.seat, yes: v.yes, ghost: v.ghost })), voteCount: rec.voteCount, threshold: rec.threshold, minVotes: rec.minVotes, result: rec.result },
      text,
    );
    // Public line (names + hands only: votes are public in every player's day view).
    const hands = names.length ? `Hands raised for ${this.name(rec.nomineeSeat)}: ${list(names)}.` : `No hands were raised for ${this.name(rec.nomineeSeat)}.`;
    this.publicItems.push(this.tag<PublicItem>({ ...this.pubCtx(ctx), source: 'vote', kind: 'vote', text: hands }, this.curSeq));
  }

  private observeSteps(s: GameState, prev: Shadow, ctx: Ctx, trigger: RecordTrigger, isUndo: boolean) {
    const inQueue = new Set<string>();
    for (const st of s.nightQueue) {
      inQueue.add(st.id);
      const rec = this.nightSteps.get(st.id) ?? this.ensureStep(s, st.id, ctx)!;
      rec.status = st.status;
      rec.infoSent = !!st.infoSent;
      if (st.response) rec.response = { ...st.response, ...(st.response.seats ? { seats: [...st.response.seats] } : {}) };
      if (st.fixed) rec.fixed = { ...st.fixed, ...(st.fixed.seats ? { seats: [...st.fixed.seats] } : {}) };
      if (st.outcome) rec.outcome = st.outcome;
      if (trigger.kind === 'st' && trigger.cmd.type === 'resolve_step' && trigger.cmd.stepId === st.id) {
        const c = trigger.cmd;
        const input = { ...(c.seats ? { seats: [...c.seats] } : {}), ...(c.starpassSeat !== undefined ? { starpassSeat: c.starpassSeat } : {}), ...(c.redirectSeat !== undefined ? { redirectSeat: c.redirectSeat } : {}) };
        if (Object.keys(input).length) rec.storytellerInput = input;
      }
      const wasFinal = ['resolved', 'skipped'].includes(prev.steps.get(st.id) ?? 'pending');
      const isFinal = st.status === 'resolved' || st.status === 'skipped';
      if (isFinal && !wasFinal) {
        rec.resolvedAt = ctx.at;
        rec.undone = undefined;
        const p = st.seat === null ? undefined : this.player(st.seat);
        if (p) {
          rec.player = {
            character: p.character,
            actingAs: st.kind,
            poisoned: p.poisonedBy !== null,
            drunk: p.character === 'drunk' || p.drunkOverride,
            protected: p.protectedTonight,
          };
        }
        if (!isUndo && st.kind !== 'dusk' && st.kind !== 'dawn') this.stepEntry(rec, ctx);
      } else if (!isFinal && wasFinal) {
        rec.resolvedAt = null; // undone: the step is open again
      }
    }
    for (const rec of this.nightSteps.values()) if (!inQueue.has(rec.id) && rec.night > s.nightNumber) rec.undone = true;
  }

  private stepEntry(rec: NightStepRecord, ctx: Ctx) {
    const infos = rec.infoIds.map((id) => this.info.find((i) => i.id === id)).filter((i): i is InfoRecord => !!i && !i.undone);
    // The sentence shows what the woken player was shown (group steps: what everyone was shown).
    const shown = infos.filter((i) => rec.seat === null || i.seat === rec.seat).map((i) => `“${i.text}”`);
    const data: Record<string, unknown> = { stepId: rec.id, kind: rec.kind, seat: rec.seat, status: rec.status };
    if (rec.response) data.response = rec.response;
    if (rec.storytellerInput) data.storytellerInput = rec.storytellerInput;
    if (rec.fixed) data.fixed = rec.fixed;
    if (rec.outcome) data.outcome = rec.outcome;
    if (rec.player) data.player = rec.player;
    if (infos.length) data.info = infos.map((i) => ({ id: i.id, seat: i.seat, text: i.text, ...infoData(i) }));
    let text: string;
    if (rec.kind === 'minion_info') text = rec.status === 'skipped' ? 'The Storyteller skipped the Minion info.' : 'The Minions learned who their Demon is and each other.';
    else if (rec.kind === 'demon_info') {
      const bluffs = this.state.demonBluffs.map(cname);
      text = rec.status === 'skipped' ? 'The Storyteller skipped the Demon info.' : `The Demon learned their Minions${bluffs.length ? ` and the bluffs ${list(bluffs)}` : ''}.`;
    } else if (rec.seat !== null) {
      const p = rec.player;
      const impaired = p && (p.poisoned || p.drunk || p.character !== rec.kind) ? ` — ${p.character === 'drunk' ? 'the Drunk' : p.poisoned ? 'poisoned' : 'drunk'}` : '';
      const actingAs = p && p.character !== rec.kind ? `${this.name(rec.seat)} (${cname(rec.kind)}${p.character === 'drunk' ? ', really the Drunk' : ''})` : this.who(rec.seat, rec.kind);
      if (rec.status === 'skipped') text = `The Storyteller skipped ${actingAs}.`;
      else {
        const chose = rec.response && (rec.response.seats?.length || rec.response.character || rec.response.yes !== undefined) ? `, who chose ${this.answerText(rec.response)}` : '';
        const st = rec.storytellerInput?.seats?.length ? ` (the Storyteller ruled: ${list(rec.storytellerInput.seats.map((x) => this.name(x)))})` : '';
        const show = shown.length ? `${chose ? ',' : ''} and showed ${list(shown)}` : '';
        const out = rec.outcome && !rec.outcome.startsWith('Info sent:') ? ` ${rec.outcome}` : '';
        text = `The Storyteller woke ${actingAs}${impaired}${chose}${st}${show}.${out}`;
      }
    } else text = `${cap(rec.kind)} step ${rec.status}.`;
    this.push(ctx, 'night_step', [null, ...(rec.seat !== null ? [rec.seat] : [])], data, text);
  }

  private observeConnection(prev: PShadow | undefined, p: PlayerState, at: number) {
    if (prev && prev.connected !== p.connected) this.connections.push({ at, seat: p.seat, connected: p.connected });
  }

  private status(ctx: Ctx, seat: number | null, field: StatusField, from: unknown, to: unknown, via: Via, text: string | null) {
    this.statusChanges.push(this.tag<StatusChangeRecord>({ at: ctx.at, day: ctx.day, night: ctx.night, phase: ctx.phase, seat, field, from, to, via }, this.curSeq));
    if (text) this.push(ctx, 'status', seat === null ? [null] : [seat], { field, from, to, seat }, text);
  }

  private observePlayers(
    s: GameState,
    prev: Shadow,
    ctx: Ctx,
    after: Ctx,
    trigger: RecordTrigger,
    via: Via,
    diedCause: Map<number, DeathCause>,
    execCause: Map<number, 'execution' | 'virgin'>,
    impWhy: Map<number, string>,
  ) {
    const phaseChanged = s.phase !== prev.phase;
    const inSetup = s.phase === 'setup' || prev.phase === 'setup';
    const cmd = trigger.kind === 'st' ? trigger.cmd : null;
    const action = trigger.kind === 'player' ? trigger.action : null;

    // Slayer shot (public claim; the real Slayer's ability is spent)
    if (action?.type === 'slayerShot' && trigger.kind === 'player') {
      const shooter = this.player(trigger.seat)!;
      const target = this.player(action.targetSeat);
      const killed = !!target && !target.alive && (prev.players.get(action.targetSeat)?.alive ?? false);
      const real = shooter.character === 'slayer' && !(prev.players.get(trigger.seat)?.abilityUsed ?? true);
      this.push(
        ctx,
        'ability',
        [trigger.seat, action.targetSeat],
        { ability: 'slayer', shooterSeat: trigger.seat, targetSeat: action.targetSeat, realSlayer: real, killed },
        `${this.who(trigger.seat)} claimed to be the Slayer and shot at ${this.who(action.targetSeat)}: ${killed ? `${this.name(action.targetSeat)} died` : 'nothing happened'}.`,
      );
    }

    const executedNow = new Set<number>();
    for (const p of s.players) {
      const o = prev.players.get(p.seat);
      if (!o) continue;
      this.observeConnection(o, p, ctx.at);
      if (inSetup) continue;
      if (p.executed && !o.executed) executedNow.add(p.seat);
    }
    if (cmd && (cmd.type === 'execute' || cmd.type === 'force_execute')) {
      if (cmd.seat === null) {
        this.executions.push(this.tag<ExecutionRecord>({ day: ctx.day, at: ctx.at, seat: null, cause: null, died: false, alreadyDead: false, forced: cmd.type === 'force_execute', via }, this.curSeq));
        this.push(ctx, 'execution', [null], { seat: null, forced: cmd.type === 'force_execute' }, 'Nobody was executed today.');
      } else executedNow.add(cmd.seat);
    }
    for (const seat of executedNow) {
      const p = this.player(seat)!;
      const o = prev.players.get(seat)!;
      const cause = execCause.get(seat) ?? 'execution';
      const died = o.alive && !p.alive;
      const forced = cmd?.type === 'force_execute';
      this.executions.push(this.tag<ExecutionRecord>({ day: ctx.day, at: ctx.at, seat, cause, died, alreadyDead: !o.alive, forced, via }, this.curSeq));
      for (const n of this.nominations) if (!n.undone && n.day === ctx.day && n.nomineeSeat === seat) n.nomineeExecuted = true;
      let text: string;
      if (cause === 'virgin') {
        const nom = [...this.nominations].reverse().find((n) => !n.undone && n.nominatorSeat === seat && n.day === ctx.day);
        text = `${this.who(seat)} nominated the Virgin${nom ? ` ${this.name(nom.nomineeSeat)}` : ''} and was executed on the spot.`;
      } else if (!o.alive) text = `${this.who(seat)} was executed, but was already dead.`;
      else text = `${this.who(seat)} was executed${died ? '' : ' but did not die'}.`;
      if (forced) text = `${text.slice(0, -1)} (Storyteller override).`;
      this.push(ctx, 'execution', [seat], { seat, cause, died, alreadyDead: !o.alive, forced }, text);
    }

    const diedInNight: string[] = [];
    for (const p of s.players) {
      const o = prev.players.get(p.seat);
      if (!o || inSetup) continue;
      // deaths / revivals
      if (o.alive && !p.alive) {
        let cause: DeathCause = diedCause.get(p.seat) ?? 'unknown';
        if (cause === 'unknown') {
          if (executedNow.has(p.seat)) cause = execCause.get(p.seat) ?? 'execution';
          else if (action?.type === 'slayerShot') cause = 'slayer';
          else if (cmd?.type === 'kill' || cmd?.type === 'set_alive') cause = 'storyteller';
          else if (cmd?.type === 'resolve_step') cause = 'demon';
        }
        const note = cmd?.type === 'kill' && cmd.cause ? cmd.cause : undefined;
        const rec = this.tag<DeathRecord>(
          { seat: p.seat, at: ctx.at, day: ctx.day, night: ctx.night, phase: ctx.phase, cause, ...(note ? { note } : {}), publicAt: p.publicAlive ? null : ctx.at, via },
          this.curSeq,
        );
        this.deaths.push(rec);
        if (cause !== 'execution' && cause !== 'virgin') this.push(ctx, 'death', [p.seat], { seat: p.seat, cause, character: o.character, ...(note ? { note } : {}) }, this.deathText(p.seat, o.character, cause, note));
      } else if (!o.alive && p.alive) {
        const d = [...this.deaths].reverse().find((x) => x.seat === p.seat && !x.undone && x.revivedAt === undefined);
        if (d) d.revivedAt = ctx.at;
        this.push(ctx, 'revival', [p.seat], { seat: p.seat }, `${this.who(p.seat)} was brought back to life by the Storyteller.`);
      }
      if (o.publicAlive && !p.publicAlive) {
        const d = [...this.deaths].reverse().find((x) => x.seat === p.seat && !x.undone);
        if (d && d.publicAt === null) d.publicAt = ctx.at;
        if (phaseChanged && s.phase === 'day') diedInNight.push(p.name);
      }

      // characters / alignment
      if (o.character !== p.character || o.alignment !== p.alignment) {
        const why = impWhy.get(p.seat);
        const cause: RoleChangeRecord['cause'] = why?.includes('Scarlet Woman') ? 'scarlet_woman' : why?.includes('passed the role') ? 'starpass' : cmd?.type === 'change_character' ? 'storyteller' : 'other';
        this.roleChanges.push(
          this.tag<RoleChangeRecord>(
            { seat: p.seat, at: ctx.at, day: ctx.day, night: ctx.night, phase: ctx.phase, from: o.character, to: p.character, alignmentFrom: o.alignment, alignmentTo: p.alignment, believedFrom: o.believed, believedTo: p.believedCharacter, cause, via },
            this.curSeq,
          ),
        );
        const text =
          cause === 'scarlet_woman'
            ? `The Demon died: ${this.who(p.seat, o.character)} became the ${cname(p.character)}.`
            : cause === 'starpass'
              ? `Star-pass: ${this.who(p.seat, o.character)} became the ${cname(p.character)}.`
              : cause === 'storyteller'
                ? `The Storyteller changed ${this.name(p.seat)} from ${cname(o.character)} (${o.alignment}) to ${cname(p.character)} (${p.alignment}).`
                : `${this.name(p.seat)} is now the ${cname(p.character)} (${p.alignment}).`;
        this.push(ctx, cause === 'scarlet_woman' || cause === 'starpass' ? 'ability' : 'role_change', [p.seat], { seat: p.seat, from: o.character, to: p.character, alignmentFrom: o.alignment, alignmentTo: p.alignment, cause }, text);
      } else if (o.believed !== p.believedCharacter) {
        this.status(ctx, p.seat, 'believedCharacter', o.believed, p.believedCharacter, via, `${this.who(p.seat)} now believes they are the ${cname(p.believedCharacter)}.`);
      }

      // statuses (clears caused by a phase change are recorded without a timeline line)
      const quiet = (on: boolean) => phaseChanged && !on;
      if (o.poisonedBy !== p.poisonedBy) {
        const on = p.poisonedBy !== null;
        const t = on ? `${this.who(p.seat)} is poisoned${p.poisonedBy === 'poisoner' ? ' (by the Poisoner)' : ' (by the Storyteller)'}.` : `${this.who(p.seat)} is no longer poisoned.`;
        this.status(ctx, p.seat, 'poisoned', o.poisonedBy, p.poisonedBy, via, quiet(on) ? null : t);
      }
      if (o.drunkOverride !== p.drunkOverride)
        this.status(ctx, p.seat, 'drunk', o.drunkOverride, p.drunkOverride, via, quiet(p.drunkOverride) ? null : `${this.who(p.seat)} is ${p.drunkOverride ? 'now drunk' : 'no longer drunk'}.`);
      if (o.protectedTonight !== p.protectedTonight)
        this.status(ctx, p.seat, 'protected', o.protectedTonight, p.protectedTonight, via, quiet(p.protectedTonight) ? null : `${this.who(p.seat)} is ${p.protectedTonight ? 'protected tonight' : 'no longer protected'}.`);
      if (o.butlerMasterSeat !== p.butlerMasterSeat)
        this.status(ctx, p.seat, 'butlerMaster', o.butlerMasterSeat, p.butlerMasterSeat, via, p.butlerMasterSeat === null ? null : `${this.who(p.seat)} chose ${this.name(p.butlerMasterSeat)} as their master.`);
      if (o.ghostVoteAvailable !== p.ghostVoteAvailable && !(p.ghostVoteUsed && !o.ghostVoteUsed) && !(o.ghostVoteUsed && !p.ghostVoteUsed && action === null && cmd?.type !== 'set_ghost_vote' && cmd?.type !== 'set_alive'))
        this.status(ctx, p.seat, 'ghostVoteAvailable', o.ghostVoteAvailable, p.ghostVoteAvailable, via, `${this.name(p.seat)}'s ghost vote was ${p.ghostVoteAvailable ? 'given back' : 'taken away'} by the Storyteller.`);
      else if (o.ghostVoteAvailable !== p.ghostVoteAvailable) this.status(ctx, p.seat, 'ghostVoteAvailable', o.ghostVoteAvailable, p.ghostVoteAvailable, via, null);
      if (o.abilityUsed !== p.abilityUsed) {
        let t: string | null = null;
        if (p.abilityUsed && p.character === 'virgin') {
          const fired = [...execCause.values()].includes('virgin');
          t = `${this.who(p.seat)} was nominated for the first time: the Virgin's ability is spent${fired ? '' : ' with no effect'}.`;
        }
        this.status(ctx, p.seat, 'abilityUsed', o.abilityUsed, p.abilityUsed, via, null);
        if (t) this.push(ctx, 'ability', [p.seat], { ability: 'virgin', seat: p.seat, triggered: [...execCause.values()].includes('virgin') }, t);
      }
      if (o.slayerShotTaken !== p.slayerShotTaken) this.status(ctx, p.seat, 'slayerShotTaken', o.slayerShotTaken, p.slayerShotTaken, via, null);
      const addedR = p.reminders.filter((r) => !o.reminders.includes(r));
      const removedR = o.reminders.filter((r) => !p.reminders.includes(r));
      for (const r of addedR) this.status(ctx, p.seat, 'reminder', null, r, via, cmd?.type === 'add_reminder' ? `Reminder on ${this.who(p.seat)}: “${r}”.` : null);
      for (const r of removedR) this.status(ctx, p.seat, 'reminder', r, null, via, null);
    }
    void after;
    this.pendingDawnDeaths = diedInNight;
  }

  private pendingDawnDeaths: string[] = [];

  deathText(seat: number, character: string, cause: DeathCause, note?: string): string {
    const v = this.who(seat, character);
    switch (cause) {
      case 'demon': {
        const demon = this.state.players.find((p) => CHARACTER_INFO[p.character].type === 'demon');
        return `${demon ? `The ${cname(demon.character)} (${this.name(demon.seat)})` : 'The Demon'} killed ${v}.`;
      }
      case 'slayer':
        return `${v} was slain by the Slayer.`;
      case 'starpass':
        return `${v} killed themself (star-pass).`;
      case 'storyteller':
        return `The Storyteller killed ${v}${note ? `: ${note}` : ''}.`;
      default:
        return `${v} died.`;
    }
  }

  private observeGlobals(s: GameState, prev: Shadow, ctx: Ctx, via: Via) {
    if (s.redHerringSeat !== prev.redHerringSeat)
      this.status(ctx, null, 'redHerring', prev.redHerringSeat, s.redHerringSeat, via, s.redHerringSeat === null ? 'The red herring was cleared.' : `The red herring is now ${this.name(s.redHerringSeat)}.`);
    const bluffs = JSON.stringify(s.demonBluffs);
    if (bluffs !== prev.demonBluffs) this.status(ctx, null, 'demonBluffs', JSON.parse(prev.demonBluffs), [...s.demonBluffs], via, `Demon bluffs: ${list(s.demonBluffs.map(cname))}.`);
    const settings = JSON.stringify(s.settings);
    if (settings !== prev.settings) this.status(ctx, null, 'settings', JSON.parse(prev.settings), { ...s.settings }, via, null);
    if (s.bedtimeSeconds !== prev.bedtimeSeconds) this.status(ctx, null, 'bedtimeSeconds', prev.bedtimeSeconds, s.bedtimeSeconds, via, null);
  }

  private recordSetup(s: GameState, ctx: Ctx) {
    this.setup = {
      at: ctx.at,
      method: this.setupMethod ?? 'manual',
      characters: s.players.map((p) => ({ seat: p.seat, character: p.character, alignment: p.alignment, believedCharacter: p.believedCharacter })),
      demonBluffs: [...s.demonBluffs],
      redHerringSeat: s.redHerringSeat,
    };
    const roles = s.players.map((p) => `${p.name} — ${cname(p.character)}${p.character === 'drunk' ? ` (believes ${cname(p.believedCharacter)})` : ''}`);
    const extras = [
      s.demonBluffs.length ? `Demon bluffs: ${list(s.demonBluffs.map(cname))}.` : '',
      s.redHerringSeat !== null ? `Red herring: ${this.name(s.redHerringSeat)}.` : '',
    ].filter(Boolean);
    this.push(ctx, 'setup', s.players.map((p) => p.seat), { ...this.setup }, `The Grimoire: ${roles.join('; ')}.${extras.length ? ` ${extras.join(' ')}` : ''}`);
  }

  private phaseChange(s: GameState, prev: Shadow, ctx: Ctx, via: Via, isUndo: boolean) {
    const cur = this.phases.at(-1);
    if (cur && cur.endedAt === null) cur.endedAt = ctx.at;
    if (isUndo && cur?.undone) {
      const back = [...this.phases].reverse().find((x) => !x.undone && x !== cur && x.phase === s.phase && x.day === s.dayNumber && x.night === s.nightNumber);
      if (back && this.phases.at(-2) === back) {
        back.endedAt = null;
        return;
      }
    }
    this.phases.push(this.tag<PhaseSpan>({ phase: s.phase, day: s.dayNumber, night: s.nightNumber, startedAt: ctx.at, endedAt: null, via }, this.curSeq));
    if (isUndo || s.phase === 'finished') return;
    const forced = via === 'st:force_phase';
    let text: string;
    switch (s.phase) {
      case 'first_night':
        text = 'The first night falls.';
        break;
      case 'night':
        text = `Night ${s.nightNumber} falls.`;
        break;
      case 'dawn':
        text = 'Dawn: the Storyteller reviews the night.';
        break;
      case 'day': {
        const died = this.pendingDawnDeaths;
        text = `Day ${s.dayNumber} begins.${prev.phase === 'day' ? '' : died.length ? ` Died in the night: ${list(died)}.` : ' Nobody died in the night.'}`;
        break;
      }
      case 'bedtime':
        text = 'The bell tolls: everyone walks home for the night.';
        break;
      case 'setup':
        text = 'The Storyteller returned the town to setup.';
        break;
      default:
        text = `Phase: ${s.phase}.`;
    }
    this.push(ctx, 'phase', [], { phase: s.phase, from: prev.phase, forced, ...(s.phase === 'day' ? { diedInTheNight: [...this.pendingDawnDeaths] } : {}) }, forced ? `${text} (forced by the Storyteller)` : text);
  }

  /** Timeline lines for Storyteller overrides that the state diff would not explain on its own. */
  private overrideEntry(cmd: StCommand, ctx: Ctx, prev: Shadow) {
    const say = (data: Record<string, unknown>, text: string, seats: (number | null)[] = [null]) => this.push(ctx, 'storyteller', seats, { command: cmd.type, ...data }, text);
    switch (cmd.type) {
      case 'force_phase':
        if (cmd.to === 'gather' && prev.phase === 'day') say({ to: cmd.to }, 'The Storyteller gathered the town in the circle.');
        return;
      case 'gather':
        if (cmd.on) say({ on: true }, 'The Storyteller gathered the town in the circle.');
        return;
      case 'force_vote':
        say({ nominationId: cmd.nominationId }, `The Storyteller called a vote (nomination ${cmd.nominationId}).`);
        return;
      case 'close_vote':
        say({ mode: cmd.mode }, cmd.mode === 'tally' ? 'The Storyteller closed the vote early.' : 'The Storyteller stopped the vote.');
        return;
      case 'set_block':
        say({ seat: cmd.seat, votes: cmd.votes ?? null }, cmd.seat === null ? 'The Storyteller cleared the block.' : `The Storyteller put ${this.name(cmd.seat)} on the block.`, cmd.seat === null ? [null] : [null, cmd.seat]);
        return;
      case 'cancel_nomination':
        say({ nominationId: cmd.nominationId }, `The Storyteller withdrew a nomination (${cmd.nominationId}).`);
        return;
      case 'strike_vote':
        this.push(ctx, 'vote_changed', [null, cmd.seat], { command: cmd.type, nominationId: cmd.nominationId, seat: cmd.seat, vote: false }, `The Storyteller struck ${this.name(cmd.seat)}'s vote.`);
        return;
      case 'set_vote':
        this.push(ctx, 'vote_changed', [null, cmd.seat], { command: cmd.type, nominationId: cmd.nominationId, seat: cmd.seat, vote: cmd.vote }, `The Storyteller recorded ${this.name(cmd.seat)}'s vote as ${cmd.vote ? 'yes' : 'no'}.`);
        return;
      case 'set_setting':
        say({ settings: cmd.settings }, `The Storyteller changed settings: ${Object.entries(cmd.settings).map(([k, v]) => `${k} = ${String(v)}`).join(', ')}.`);
        return;
      case 'set_bedtime_seconds':
        say({ seconds: cmd.seconds }, `The Storyteller set bedtime to ${cmd.seconds} seconds.`);
        return;
      case 'bedtime_timer':
        if (cmd.action === 'extend' || cmd.action === 'restart') say({ action: cmd.action, seconds: cmd.seconds ?? null }, `The Storyteller ${cmd.action === 'extend' ? 'extended' : 'restarted'} the bedtime countdown.`);
        return;
      case 'teleport':
      case 'walk_to':
      case 'freeze': {
        const who = cmd.who === 'all' ? 'everyone' : list(cmd.who.map((x) => this.name(x)));
        const what =
          cmd.type === 'teleport' ? `teleported ${who} (${cmd.to.kind})` : cmd.type === 'walk_to' ? (cmd.to ? `walked ${who} to ${cmd.to.kind}` : `stopped walking ${who}`) : `${cmd.frozen ? 'froze' : 'unfroze'} ${who}`;
        say({ who: cmd.who }, `The Storyteller ${what}.`, cmd.who === 'all' ? [null] : [null, ...cmd.who]);
        return;
      }
      case 'door_lock':
        say({ buildingId: cmd.buildingId, lock: cmd.lock }, `The Storyteller set the door of ${cmd.buildingId} to ${cmd.lock}.`);
        return;
      default:
        return;
    }
  }

  /** Short description of a command (for "The Storyteller undid: ..."). */
  describe(cmd: StCommand): string {
    const c = cmd as { type: string; seat?: number | null; to?: unknown };
    const label = c.type.replace(/_/g, ' ');
    if (typeof c.seat === 'number') return `${label} (${this.name(c.seat)})`;
    if (typeof c.to === 'string') return `${label} → ${c.to}`;
    if (c.type === 'resolve_step') {
      const st = this.nightSteps.get((cmd as { stepId: string }).stepId);
      if (st) return `resolve ${cname(st.kind)}${st.seat !== null ? ` (${this.name(st.seat)})` : ''}`;
    }
    return label;
  }

  addPamphlet(p: Pamphlet) {
    this.pamphlets.push(p);
    this.rev++;
  }
}

function viaOf(t: RecordTrigger): Via {
  switch (t.kind) {
    case 'st':
      return `st:${t.cmd.type}`;
    case 'player':
      return `player:${t.action.type}`;
    default:
      return t.kind;
  }
}

function infoData(i: InfoRecord): Record<string, unknown> {
  return {
    ...(i.seats ? { seats: i.seats } : {}),
    ...(i.characters ? { characters: i.characters } : {}),
    ...(i.number !== undefined ? { number: i.number } : {}),
    ...(i.yes !== undefined ? { yes: i.yes } : {}),
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
