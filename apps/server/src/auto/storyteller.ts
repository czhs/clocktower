// OWNED BY auto-st. The AutoStoryteller: runs a whole Trouble Brewing game with NO human Storyteller
// (lobby storytellerMode 'auto'), driving the @ct/rules engine through ordinary Storyteller commands
// (random_setup, prompt_player, send_info, resolve_step, advance_phase, set_nominations_open,
// start_vote, confirm_result, …) via the game module's AutoPort (apps/server/src/game/index.ts).
// Every judgement call is made by ./fate.ts with a seeded RNG; every decision is written to the game
// record's timeline ("Fate …" / "The town clock …"). Design + decision table: docs/auto-storyteller.md.
//
// Flow (server-authoritative; each step is a normal engine command, so the engine's rules apply):
//   setup     random legal setup, then (after a short beat) the bell: bedtime → first night.
//   bedtime   the engine's countdown (timings.bedtimeSec) + the world's escort; if stragglers are not
//             home STRAGGLER_MS after the countdown, the night is forced (they are put to bed).
//   night     at nightfall every step that needs a choice prompts its player at once (their usual
//             prompt UI, at home) and the evil team learns each other. Everything else waits for ONE
//             fixed release time (nightfall + promptTimeoutMs, when every prompt is answered or
//             defaulted): then the steps resolve in night order in one go, so all info arrives at the
//             same moment whatever anyone answered and whoever is in play (SEC-1: per-step delivery
//             leaked e.g. "no Poisoner" to the Chef). A prompt created after the release (the
//             Ravenkeeper) never holds up the steps behind it and is due by the night's minimum
//             length. An unanswered prompt gets a random legal answer at its deadline. Info is
//             computed by fate (truthful with Spy/Recluse registration, or false when drunk/poisoned).
//             The night lasts timings.nightSec (so its length reveals nothing).
//   dawn      straight to day: deaths are announced by the engine.
//   day       clock 'discussion' (discussionMin) → nominations open, clock 'nominations'
//             (nominationsMin). A nomination's vote starts VOTE_DELAY_MS later (accusation +
//             defence). When the clock ends: nominations close, a pending vote still runs, then the
//             player on the block (if any) is executed by the engine and bedtime rings.
//   end       any detected game end is confirmed at once (no Storyteller to wait for).
// Hold: while no seated player is connected nothing advances (prompt deadlines and the clock are
// frozen), so an emptied lobby is disposed by the room and recorded as abandoned, not auto-finished.
import type { ClockStage, DayClockView, PromptSpecInput, StCommand, AutoTimings, PromptView } from '@ct/protocol';
import { AUTO_DEFAULTS, CHARACTER_INFO, storylineById, storylineProblem, type StorylineId } from '@ct/protocol';
import { mulberry32, ROLES, type CommandResult, type GameState, type NightStep, type PlayerAction, type PlayerState, type Rng } from '@ct/rules';
import { DayClock } from './clock.js';
import { EXTENSION_RULES, ExtensionBallot } from './extensions.js';
import { decideImp, decideInfo, isInfoRole, randomAnswer, recluseDiesToSlayer, spyTriggersVirgin } from './fate.js';

/** Fine-grained timings (ms). Defaults derive from AutoTimings; tests override them. */
export interface AutoClockOptions {
  discussionMs: number;
  nominationsMs: number;
  bedtimeSec: number;
  /** Minimum night length. */
  nightMinMs: number;
  /** Per-prompt answer time. */
  promptTimeoutMs: number;
  /** Beat between the start and the first bell. */
  setupBeatMs: number;
  /** Nomination → vote (accusation + defence). */
  voteDelayMs: number;
  /** Bedtime overtime after which the night is forced. */
  stragglerMs: number;
  /** After an execution mid-nominations (Virgin), the day ends at most this much later. */
  afterExecutionMs: number;
  /** Extension voting rules. */
  extension: typeof EXTENSION_RULES;
  /** Length of one proposed "minute" (60 000; tests shrink it with the other timings). */
  extensionMinuteMs: number;
  /** (v2.2) The storyline fate deals (host's lobby setting); null/absent = an ordinary random setup. */
  storyline?: StorylineId | null;
}

export function autoClockOptions(t: AutoTimings = AUTO_DEFAULTS, over: Partial<AutoClockOptions> = {}): AutoClockOptions {
  const nightMs = t.nightSec * 1000;
  return {
    discussionMs: Math.round(t.discussionMin * 60_000),
    nominationsMs: Math.round(t.nominationsMin * 60_000),
    bedtimeSec: t.bedtimeSec,
    nightMinMs: nightMs,
    promptTimeoutMs: Math.min(90_000, Math.max(15_000, Math.round((nightMs * 2) / 3))),
    setupBeatMs: 5_000,
    voteDelayMs: 20_000,
    stragglerMs: 30_000,
    afterExecutionMs: 60_000,
    extension: EXTENSION_RULES,
    extensionMinuteMs: 60_000,
    ...over,
  };
}

/** What the AutoStoryteller may do to the game (implemented by the game module). */
export interface AutoPort {
  state(): GameState;
  now(): number;
  /** Apply a Storyteller command as the automatic Storyteller (engine + commit + record). */
  command(cmd: StCommand): CommandResult;
  /** A player's action on their behalf (an unanswered prompt). */
  act(seat: number, action: PlayerAction): CommandResult;
  /** A record/timeline line for an automatic decision (server-only; never sent to players). */
  note(kind: 'fate' | 'clock', text: string, data: Record<string, unknown>, seats?: number[]): void;
  /** pids of seated players who are connected right now. */
  connectedPids(): string[];
  seatOf(pid: string): number | undefined;
  pidOf(seat: number): string | undefined;
  error(pid: string, forType: string, code: 'invalid' | 'forbidden' | 'phase' | 'rate_limited' | 'not_found', message: string): void;
  dirty(): void;
}

export interface AutoStoryteller {
  readonly fateSeed: number;
  readonly options: AutoClockOptions;
  /** Called once right after the engine state exists (phase 'setup'). */
  start(): void;
  /** Called every server tick BEFORE the engine's own timers. */
  tick(now: number): void;
  /** Clock proposals / votes (C2S 'clock:propose' / 'clock:vote'). */
  handleClock(pid: string, type: 'clock:propose' | 'clock:vote', payload: unknown): void;
  /** Public clock view (identical for everyone). */
  clockView(): DayClockView | null;
  /** Flush decision notes queued while the engine ran (adjudicator rulings). */
  flushNotes(): void;
}

interface NightRun {
  number: number;
  startAt: number;
  deadlines: Map<string, number>;
  /** (SEC-1) Steps whose prompt was created after the release time (the Ravenkeeper): never blocking. */
  late: Set<string>;
}

/** (SEC-1) Steps resolved at nightfall: the evil team's own info (identical timing for every evil player). */
const AT_NIGHTFALL: ReadonlySet<NightStep['kind']> = new Set(['dusk', 'minion_info', 'demon_info']);
/** (SEC-1) A prompt created after the release time gets at least this long to answer. */
export const LATE_PROMPT_MIN_MS = 5_000;

interface DayRun {
  number: number;
  stage: 'discussion' | 'nominations' | 'closing';
  pendingId: string | null;
  pendingSince: number;
  capped: boolean;
}

const name = (p: PlayerState | undefined) => p?.name ?? 'nobody';

export function createAutoStoryteller(port: AutoPort, opts: AutoClockOptions, fateSeed: number): AutoStoryteller {
  const rng: Rng = mulberry32(fateSeed);
  const clock = new DayClock();
  const ballot = new ExtensionBallot(opts.extension);
  let startedAt = 0;
  let night: NightRun | null = null;
  let day: DayRun | null = null;
  let overtimeSince: number | null = null;
  let heldAt: number | null = null;
  let finished = false;
  const queued: { kind: 'fate' | 'clock'; text: string; data: Record<string, unknown>; seats: number[] }[] = [];

  const st = () => port.state();
  const player = (seat: number) => st().players.find((p) => p.seat === seat);
  const fate = (text: string, data: Record<string, unknown> = {}, seats: number[] = []) => port.note('fate', text, data, seats);
  const clockNote = (text: string, data: Record<string, unknown> = {}, seats: number[] = []) => port.note('clock', text, data, seats);
  /**
   * (st-qol) A PUBLIC line telling everyone what the automatic Storyteller is doing and why the game
   * is waiting (players otherwise only see a clock). Only public facts: never roles, targets or
   * which steps exist tonight.
   */
  const explain = (text: string) => {
    port.command({ type: 'announce', text: text.slice(0, 300) });
  };

  /** Run an engine command; an unexpected refusal is recorded (never thrown into the room). */
  function cmd(c: StCommand): boolean {
    const r = port.command(c);
    if (!r.ok) fate(`(could not apply ${c.type}: ${r.error})`, { command: c.type, error: r.error, code: r.code });
    return r.ok;
  }

  // Engine rulings (packages/rules Adjudicator): decided by fate, noted after the commit.
  function installAdjudicator() {
    st().adjudicator = {
      enforceButler: true,
      spyRegistersAsTownsfolk(spy, virgin) {
        const yes = spyTriggersVirgin(rng);
        queued.push({
          kind: 'fate',
          text: yes ? `Fate decided the Spy ${spy.name} registers as a Townsfolk: the Virgin ${virgin.name} executes them.` : `Fate decided the Spy ${spy.name} does not register as a Townsfolk: nothing happens.`,
          data: { decision: 'spy_virgin', spySeat: spy.seat, virginSeat: virgin.seat, registersAsTownsfolk: yes },
          seats: [spy.seat, virgin.seat],
        });
        return yes;
      },
      recluseRegistersAsDemon(recluse, slayer) {
        const yes = recluseDiesToSlayer(rng);
        queued.push({
          kind: 'fate',
          text: yes ? `Fate decided the Recluse ${recluse.name} registers as the Demon: the Slayer ${slayer.name}'s shot kills them.` : `Fate decided the Recluse ${recluse.name} does not register as the Demon.`,
          data: { decision: 'slayer_recluse', recluseSeat: recluse.seat, slayerSeat: slayer.seat, registersAsDemon: yes },
          seats: [recluse.seat, slayer.seat],
        });
        return yes;
      },
    };
  }

  function flushNotes() {
    while (queued.length) {
      const n = queued.shift()!;
      port.note(n.kind, n.text, n.data, n.seats);
    }
  }

  // --------------------------------------------------------------------------- hold (nobody here)

  function hold(now: number): boolean {
    const anyone = port.connectedPids().length > 0;
    if (!anyone) {
      if (heldAt === null) {
        heldAt = now;
        clock.pause(now);
        clockNote('The town clock stops: nobody is connected.', { hold: true });
        port.dirty();
      }
      return true;
    }
    if (heldAt !== null) {
      const d = now - heldAt;
      heldAt = null;
      startedAt += d;
      if (night) {
        night.startAt += d;
        for (const [k, v] of night.deadlines) night.deadlines.set(k, v + d);
      }
      if (day) day.pendingSince += d;
      if (overtimeSince !== null) overtimeSince += d;
      ballot.shift(d);
      clock.resume(now);
      clockNote('The town clock runs again.', { hold: false, heldMs: d });
      port.dirty();
    }
    return false;
  }

  // --------------------------------------------------------------------------- night

  function promptFor(s: GameState, step: NightStep): PromptSpecInput | null {
    if (step.seat === null || step.kind === 'dusk' || step.kind === 'dawn' || step.kind === 'minion_info' || step.kind === 'demon_info') return null;
    const p = player(step.seat);
    const def = ROLES[step.kind];
    if (!p || !def.prompt) return null;
    const spec = def.prompt(s, p);
    const secs = Math.round(opts.promptTimeoutMs / 1000);
    const hint = `Answer within ${secs} s, or fate chooses for you.`;
    return { ...spec, body: spec.body ? `${spec.body} ${hint}` : hint, stepId: step.id };
  }

  function sendPrompt(step: NightStep, now: number) {
    const spec = promptFor(st(), step);
    if (!spec || step.seat === null) return;
    if (!cmd({ type: 'prompt_player', seat: step.seat, prompt: spec })) return;
    if (now < releaseAt()) night!.deadlines.set(step.id, now + opts.promptTimeoutMs);
    else {
      // (SEC-1) Created after the release (the Ravenkeeper): due by the night's minimum length, so
      // neither the info of the steps behind it nor the length of the night depends on it.
      night!.late.add(step.id);
      night!.deadlines.set(step.id, Math.max(night!.startAt + opts.nightMinMs, now + LATE_PROMPT_MIN_MS));
    }
  }

  /** (SEC-1) The one moment tonight's steps (and so every piece of info) are resolved. */
  function releaseAt(): number {
    return night!.startAt + opts.promptTimeoutMs;
  }

  function beginNight(now: number) {
    const s = st();
    night = { number: s.nightNumber, startAt: now, deadlines: new Map(), late: new Set() };
    day = null;
    clock.clear();
    ballot.cancel();
    // Explained in full on the first night only; later nights have just the engine's "Night N falls."
    if (s.phase === 'first_night')
      explain(`The automatic Storyteller wakes players in night order: answer any question at home within ${Math.round(opts.promptTimeoutMs / 1000)} seconds. Dawn comes after at least ${minutes(opts.nightMinMs)}.`);
    // Everyone who will make a choice tonight is asked at once (answers resolve in night order).
    for (const step of s.nightQueue) {
      if (step.status !== 'pending' || step.seat === null) continue;
      const p = player(step.seat);
      if (!p?.alive) continue;
      sendPrompt(step, now);
    }
  }

  const open = (x: NightStep) => x.status !== 'resolved' && x.status !== 'skipped';

  /**
   * Process night steps in order as far as possible. (SEC-1) Before the release time only the evil
   * team's nightfall info resolves; at the release everything else resolves in one go (a late prompt,
   * i.e. the Ravenkeeper, is stepped over while it waits).
   */
  function runNight(now: number) {
    const s = st();
    if (!night || night.number !== s.nightNumber) beginNight(now);
    for (let guard = 0; guard < 64; guard++) {
      if (s.resultPending || s.phase === 'finished') return;
      const queue = st().nightQueue.filter(open);
      if (!queue.length) {
        if (now >= night!.startAt + opts.nightMinMs && cmd({ type: 'advance_phase', to: 'day' }) && st().phase === 'day') beginDay(now);
        return;
      }
      let progressed = false;
      for (const step of queue) {
        if (now < releaseAt() && !AT_NIGHTFALL.has(step.kind)) return;
        if (processStep(step, now)) {
          progressed = true;
          break; // the state changed: rescan from the top
        }
        if (!night!.late.has(step.id)) return; // waiting for an answer
      }
      if (!progressed) return;
    }
  }

  /** Returns true when the step is finished (continue with the next one). */
  function processStep(step: NightStep, now: number): boolean {
    const s = st();
    if (step.kind === 'dusk' || step.kind === 'dawn' || step.kind === 'minion_info' || step.kind === 'demon_info' || step.seat === null) {
      return cmd({ type: 'resolve_step', stepId: step.id }) || skip(step);
    }
    const p = player(step.seat);
    if (!p) return skip(step);
    // A player who died earlier tonight no longer wakes (except the Ravenkeeper's own death step).
    if (!p.alive && step.kind !== 'ravenkeeper') {
      fate(`${p.name} died before waking tonight: their ${step.kind.replace('_', ' ')} step is skipped.`, { decision: 'skip_dead', seat: p.seat, step: step.kind }, [p.seat]);
      return skip(step);
    }
    const def = ROLES[step.kind];
    if (def.prompt) {
      if (step.status === 'pending' || step.status === 'visiting') {
        sendPrompt(step, now);
        if (!night!.deadlines.has(step.id)) return skip(step);
        return false;
      }
      if (step.status === 'prompted') {
        const deadline = night!.deadlines.get(step.id) ?? now;
        if (now < deadline) return false;
        answerForThem(s, p, step);
        if ((step.status as NightStep['status']) !== 'answered') return skip(step);
      }
    }
    return finishStep(step, p);
  }

  function skip(step: NightStep): boolean {
    const r = port.command({ type: 'skip_step', stepId: step.id });
    return r.ok;
  }

  function answerForThem(s: GameState, p: PlayerState, step: NightStep) {
    const q = p.prompts.find((x) => x.stepId === step.id);
    if (!q) return;
    const view: PromptView = { id: q.id, kind: q.kind, title: q.title };
    if (q.minTargets !== undefined) view.minTargets = q.minTargets;
    if (q.maxTargets !== undefined) view.maxTargets = q.maxTargets;
    if (q.allowSelf !== undefined) view.allowSelf = q.allowSelf;
    if (q.allowDead !== undefined) view.allowDead = q.allowDead;
    if (q.characterOptions) view.characterOptions = [...q.characterOptions];
    const a = randomAnswer(s, rng, p, view);
    const r = port.act(p.seat, { type: 'promptResponse', promptId: q.id, ...a });
    const chose = a.seats ? a.seats.map((x) => name(player(x))).join(' and ') : a.character ?? (a.yes === undefined ? 'ok' : a.yes ? 'yes' : 'no');
    fate(`${p.name} did not answer “${q.title}” in time: fate chose ${chose}.`, { decision: 'timeout_answer', seat: p.seat, step: step.kind, promptId: q.id, answer: a, ok: r.ok }, [p.seat]);
  }

  function finishStep(step: NightStep, p: PlayerState): boolean {
    const s = st();
    const kind = step.kind as Exclude<NightStep['kind'], 'dusk' | 'dawn' | 'minion_info' | 'demon_info'>;
    if (isInfoRole(kind)) {
      const d = decideInfo(s, rng, p, kind, step.response?.seats ?? []);
      if (d.falseInfo || d.misregistered.length) {
        const how = d.falseInfo ? `${p.name} is drunk or poisoned: fate gave false info` : 'fate decided a registration';
        fate(`${how} — “${d.info.text}” (${d.why}).`, { decision: d.falseInfo ? 'false_info' : 'registration', seat: p.seat, step: kind, info: d.info, misregistered: d.misregistered }, [p.seat, ...d.misregistered]);
      }
      return cmd({ type: 'send_info', seat: p.seat, info: { ...d.info, stepId: step.id } }) || skip(step);
    }
    if (kind === 'imp') {
      const d = decideImp(s, rng, p, step);
      if (d.why) fate(`${d.why}.`, { decision: d.starpassSeat !== undefined ? 'starpass' : 'mayor_bounce', impSeat: p.seat, starpassSeat: d.starpassSeat ?? null, redirectSeat: d.redirectSeat ?? null }, [p.seat]);
      const c: StCommand = { type: 'resolve_step', stepId: step.id };
      if (d.starpassSeat !== undefined) c.starpassSeat = d.starpassSeat;
      if (d.redirectSeat !== undefined) c.redirectSeat = d.redirectSeat;
      return cmd(c) || skip(step);
    }
    return cmd({ type: 'resolve_step', stepId: step.id }) || skip(step);
  }

  // --------------------------------------------------------------------------- day

  function beginDay(now: number) {
    const s = st();
    night = null;
    day = { number: s.dayNumber, stage: 'discussion', pendingId: null, pendingSince: now, capped: false };
    ballot.resetDay(s.dayNumber);
    clock.set('discussion', opts.discussionMs, now);
    clockNote(`The town clock: ${minutes(opts.discussionMs)} of discussion before nominations open.`, { stage: 'discussion', ms: opts.discussionMs });
    explain(`Day ${s.dayNumber}: ${minutes(opts.discussionMs)} to talk, then ${minutes(opts.nominationsMs)} of nominations.${s.dayNumber <= 1 ? ' Need more time? Propose it on the town clock.' : ''}`);
  }

  function minutes(ms: number) {
    const m = ms / 60_000;
    return m >= 1 && Number.isInteger(m) ? `${m} minute${m === 1 ? '' : 's'}` : `${Math.round(ms / 1000)} seconds`;
  }

  function decideBallot(now: number) {
    const d = ballot.evaluate(now, port.connectedPids());
    if (!d) return;
    const who = name(player(port.seatOf(d.proposal.by) ?? -1));
    const tally = `${d.yes} yes, ${d.no} no of ${d.eligible}`;
    if (d.outcome === 'passed') {
      clock.add(d.proposal.minutes * opts.extensionMinuteMs, now);
      cmd({ type: 'announce', text: `The town votes to extend the clock by ${d.proposal.minutes} minute${d.proposal.minutes === 1 ? '' : 's'} (${tally}).` });
    } else {
      cmd({ type: 'announce', text: `The town keeps the clock as it is (${tally}).` });
    }
    clockNote(`The town clock: ${who}'s proposal (+${d.proposal.minutes} min) ${d.outcome} — ${d.why} (${tally}).`, {
      proposalId: d.proposal.id,
      by: d.proposal.by,
      minutes: d.proposal.minutes,
      outcome: d.outcome,
      yes: [...d.proposal.yes],
      no: [...d.proposal.no],
      eligible: d.eligible,
    });
    port.dirty();
  }

  function runDay(now: number) {
    const s = st();
    if (!day || day.number !== s.dayNumber) beginDay(now);
    const d = s.day!;
    const run = day!;
    decideBallot(now);
    if (s.resultPending || s.phase !== 'day') return;
    // An execution mid-nominations (Virgin): nothing more can be voted on today.
    if (d.executionOccurred && run.stage !== 'closing' && !run.capped) {
      run.capped = true;
      if (clock.capRemaining(opts.afterExecutionMs, now)) {
        clockNote(`The town clock: someone was executed, the day ends within ${minutes(opts.afterExecutionMs)}.`, { capMs: opts.afterExecutionMs });
        port.dirty();
      }
    }
    if (clock.expired(now) && !ballot.proposal) {
      if (run.stage === 'discussion' && !d.executionOccurred) {
        run.stage = 'nominations';
        cmd({ type: 'set_nominations_open', open: true });
        clock.set('nominations', opts.nominationsMs, now);
        clockNote(`The town clock: nominations are open for ${minutes(opts.nominationsMs)}.`, { stage: 'nominations', ms: opts.nominationsMs });
      } else if (run.stage !== 'closing') {
        run.stage = 'closing';
        if (d.nominationsOpen) cmd({ type: 'set_nominations_open', open: false });
        clockNote('The town clock strikes: the day is over.', { stage: 'closing' });
        const last = !!s.day?.vote || !!s.day?.nominations.some((n) => n.status === 'pending');
        explain(`The town clock strikes: the day is over.${last ? ' The last vote still runs, then the town goes to bed.' : ''}`);
      }
      port.dirty();
    }
    // Votes: a pending nomination is voted on after the accusation + defence (at once when closing).
    const pending = s.day?.nominations.find((n) => n.status === 'pending');
    if (pending && !s.day!.vote) {
      if (run.pendingId !== pending.id) {
        run.pendingId = pending.id;
        run.pendingSince = now;
        if (run.stage !== 'closing' && opts.voteDelayMs >= 1000)
          explain(`${name(player(pending.nomineeSeat))} may speak in their defence: the vote starts in ${minutes(opts.voteDelayMs)}.`);
      }
      if (run.stage === 'closing' || now >= run.pendingSince + opts.voteDelayMs) cmd({ type: 'start_vote', nominationId: pending.id });
    }
    if (run.stage === 'closing' && s.phase === 'day' && !s.day?.vote && !s.day?.nominations.some((n) => n.status === 'pending')) {
      const block = s.day?.block;
      if (block && !s.day!.executionOccurred) clockNote(`The town clock: ${name(player(block.seat))} is on the block with ${block.votes} votes and will be executed.`, { blockSeat: block.seat, votes: block.votes }, [block.seat]);
      else if (!s.day!.executionOccurred) clockNote('The town clock: nobody is on the block, nobody is executed today.', { blockSeat: null });
      cmd({ type: 'advance_phase', to: 'bedtime' });
    }
  }

  // --------------------------------------------------------------------------- tick

  function tick(now: number) {
    const s = st();
    if (finished) return;
    if (s.phase === 'finished') {
      finished = true;
      clock.clear();
      ballot.cancel();
      return;
    }
    if (hold(now)) return;
    if (s.resultPending && s.result) {
      fate(`The game is over: ${s.result.winner} wins (${s.result.reason}) — confirmed automatically.`, { decision: 'confirm_result', winner: s.result.winner, reason: s.result.reason });
      cmd({ type: 'confirm_result' });
      return;
    }
    switch (s.phase) {
      case 'setup':
        if (now >= startedAt + opts.setupBeatMs) cmd({ type: 'advance_phase', to: 'bedtime' });
        return;
      case 'bedtime':
        if (day) {
          day = null;
          clock.clear();
          ballot.cancel();
        }
        if (s.bedtimeOvertime) {
          overtimeSince ??= now; // (the bell's own line already says what happens: GameState.bedtimeNote)
          if (now - overtimeSince >= opts.stragglerMs) {
            const who = s.players.filter((p) => !p.connected).map((p) => p.seat);
            clockNote('The town clock strikes night: whoever is still outside is put to bed.', { forcedNight: true }, who);
            cmd({ type: 'advance_phase', to: 'night' });
          }
        } else overtimeSince = null;
        return;
      case 'first_night':
      case 'night':
        overtimeSince = null;
        runNight(now);
        return;
      case 'dawn':
        if (cmd({ type: 'advance_phase', to: 'day' }) && st().phase === 'day') beginDay(now);
        return;
      case 'day':
        runDay(now);
        return;
    }
  }

  // --------------------------------------------------------------------------- clock messages

  function handleClock(pid: string, type: 'clock:propose' | 'clock:vote', payload: unknown) {
    const s = st();
    const now = port.now();
    const seat = port.seatOf(pid);
    if (seat === undefined) return port.error(pid, type, 'forbidden', 'Only seated players can do that');
    const stage: ClockStage | null = clock.stage;
    const running = s.phase === 'day' && day !== null && day.stage !== 'closing' && (stage === 'discussion' || stage === 'nominations') && !clock.expired(now);
    if (type === 'clock:propose') {
      const { minutes: m } = payload as { minutes: number };
      if (!running) return port.error(pid, type, 'phase', 'The clock can only be extended during the discussion or the nominations');
      const err = ballot.propose(pid, m, now);
      if (err) return port.error(pid, type, err.code, err.message);
      const p = ballot.proposal!;
      cmd({ type: 'announce', text: `${name(player(seat))} proposes adding ${m} minute${m === 1 ? '' : 's'} to the clock. Vote now!` });
      clockNote(`The town clock: ${name(player(seat))} proposes +${m} min.`, { proposalId: p.id, by: pid, minutes: m, closesAt: p.closesAt }, [seat]);
    } else {
      const { id, yes } = payload as { id: string; yes: boolean };
      const err = ballot.vote(pid, id, yes);
      if (err) return port.error(pid, type, 'invalid', err);
    }
    decideBallot(now);
    port.dirty();
  }

  function clockView(): DayClockView | null {
    const v = clock.view();
    if (!v) return null;
    v.proposal = ballot.view(port.connectedPids());
    return v;
  }

  return {
    fateSeed,
    options: opts,
    start() {
      startedAt = port.now();
      installAdjudicator();
      // One bedtime line instead of two: the engine's bell announcement carries the automatic rule.
      st().bedtimeNote = `Whoever is still out is walked home; night falls at most ${minutes(opts.stragglerMs)} later.`;
      cmd({ type: 'set_bedtime_seconds', seconds: Math.max(10, Math.min(300, Math.round(opts.bedtimeSec))) });
      // (v2.2) the host's storyline (dealt at random onto the seats); falls back to a random setup
      // when it does not fit this player count.
      const story = opts.storyline ? storylineById(opts.storyline) : undefined;
      const dealt = story && storylineProblem(story, st().players.length, CHARACTER_INFO) === null ? cmd({ type: 'deal_preset', storyline: story.id }) : false;
      if (!dealt) cmd({ type: 'random_setup' });
      const s = st();
      const how = dealt ? `the storyline "${story!.title}"` : story ? `the characters at random ("${story.title}" does not fit ${s.players.length} players)` : 'the characters at random';
      fate(`Fate dealt ${how} (a legal Trouble Brewing setup).`, {
        decision: 'setup',
        storyline: dealt ? story!.id : null,
        characters: s.players.map((p) => ({ seat: p.seat, character: p.character, believed: p.believedCharacter })),
        redHerringSeat: s.redHerringSeat,
        demonBluffs: [...s.demonBluffs],
      });
    },
    tick,
    handleClock,
    clockView,
    flushNotes,
  };
}
