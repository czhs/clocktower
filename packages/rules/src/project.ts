// Per-client projections. Built by explicit WHITELISTING: every field is copied by name from the
// server-only state; internal objects are never spread or passed through, so adding a secret field
// to GameState can never leak by accident.
import type {
  AnnouncementView,
  DayView,
  EvilTeamView,
  GameResult,
  GrimoireEntry,
  InfoView,
  NominationView,
  PlayerGameView,
  PromptView,
  PublicPlayerView,
  SpyGrimoireView,
  StorytellerGameView,
} from '@ct/protocol';
import { stepView } from './night.js';
import { setupCounts } from './setup.js';
import type { GameState, NominationState, PlayerState, PromptState } from './types.js';
import { isDrunk, isNightPhase, isPoisoned, typeOf } from './util.js';
import { minVotes } from './day.js';

function publicPlayer(p: PlayerState): PublicPlayerView {
  return {
    pid: p.pid,
    seat: p.seat,
    name: p.name,
    alive: p.publicAlive,
    ghostVoteAvailable: p.ghostVoteAvailable,
    nominatedToday: p.nominatedToday,
    wasNominatedToday: p.wasNominatedToday,
    connected: p.connected,
  };
}

function nominationView(s: GameState, n: NominationState): NominationView {
  const v = s.day?.vote && s.day.vote.nominationId === n.id ? s.day.vote : null;
  const votes: Record<number, boolean> = {};
  for (const [seat, val] of Object.entries(n.votes)) votes[Number(seat)] = val === true;
  const view: NominationView = {
    id: n.id,
    nominatorSeat: n.nominatorSeat,
    nomineeSeat: n.nomineeSeat,
    status: n.status,
    votes,
    currentVoterSeat: v ? (v.order[v.index] ?? null) : null,
    voteCount: n.voteCount,
    threshold: n.status === 'pending' && s.day ? Math.max(minVotes(s), s.day.highWater + 1) : n.threshold,
  };
  if (v) {
    view.handsRaised = [...v.hands].sort((a, b) => a - b);
    view.stepMs = s.voteStepMs;
    if (v.pausedRemainingMs != null) view.clockPaused = true;
  } else if (n.status === 'pending') {
    // Hands may go up as soon as the nomination exists (public, like real hands).
    view.handsRaised = [...(n.hands ?? [])].sort((a, b) => a - b);
    view.stepMs = s.voteStepMs;
  }
  return view;
}

function dayView(s: GameState): DayView | null {
  const d = s.day;
  if (!d || (s.phase !== 'day' && s.phase !== 'bedtime' && s.phase !== 'finished')) return null;
  return {
    nominationsOpen: d.nominationsOpen,
    nominations: d.nominations.map((n) => nominationView(s, n)),
    onTheBlock: d.block ? { seat: d.block.seat, votes: d.block.votes } : null,
    executedSeat: d.executedSeat,
  };
}

function announcementViews(s: GameState): AnnouncementView[] {
  return s.announcements.map((a) => ({ id: a.id, at: a.at, kind: a.kind, text: a.text }));
}

function resultView(s: GameState): GameResult | null {
  if (s.phase !== 'finished' || !s.result) return null;
  return {
    winner: s.result.winner,
    reason: s.result.reason,
    reveal: s.result.reveal.map((r) => ({
      seat: r.seat,
      pid: r.pid,
      name: r.name,
      character: r.character,
      alignment: r.alignment,
      alive: r.alive,
    })),
  };
}

function promptView(q: PromptState): PromptView {
  const v: PromptView = { id: q.id, kind: q.kind, title: q.title };
  if (q.body !== undefined) v.body = q.body;
  if (q.minTargets !== undefined) v.minTargets = q.minTargets;
  if (q.maxTargets !== undefined) v.maxTargets = q.maxTargets;
  if (q.allowSelf !== undefined) v.allowSelf = q.allowSelf;
  if (q.allowDead !== undefined) v.allowDead = q.allowDead;
  if (q.characterOptions) v.characterOptions = [...q.characterOptions];
  return v;
}

function infoView(i: InfoView): InfoView {
  const v: InfoView = { id: i.id, day: i.day, phase: i.phase, text: i.text };
  if (i.seats) v.seats = [...i.seats];
  if (i.characters) v.characters = [...i.characters];
  if (i.number !== undefined) v.number = i.number;
  if (i.yes !== undefined) v.yes = i.yes;
  return v;
}

function evilTeamView(e: EvilTeamView | null): EvilTeamView | null {
  if (!e) return null;
  return { demonSeats: [...e.demonSeats], minionSeats: [...e.minionSeats], bluffs: [...e.bluffs] };
}

function spyView(g: SpyGrimoireView | null): SpyGrimoireView | null {
  if (!g) return null;
  return {
    night: g.night,
    entries: g.entries.map((e) => ({
      seat: e.seat,
      name: e.name,
      character: e.character,
      alignment: e.alignment,
      alive: e.alive,
      poisoned: e.poisoned,
      drunk: e.drunk,
      reminders: [...e.reminders],
    })),
  };
}

/** What one seated player may see. Throws for an unknown seat. */
export function projectForPlayer(s: GameState, seat: number): PlayerGameView {
  const me = s.players.find((p) => p.seat === seat);
  if (!me) throw new Error(`no player in seat ${seat}`);
  const finished = s.phase === 'finished';
  const view: PlayerGameView = {
    kind: 'player',
    phase: s.phase,
    dayNumber: s.dayNumber,
    phaseEndsAt: s.phaseEndsAt,
    players: s.players.map(publicPlayer),
    you: {
      pid: me.pid,
      seat: me.seat,
      alive: me.publicAlive,
      ghostVoteAvailable: me.ghostVoteAvailable,
      canNominate: s.phase === 'day' && me.publicAlive && !me.nominatedToday,
      role: s.rolesRevealed
        ? {
            character: me.believedCharacter,
            characterType: typeOf(me.believedCharacter),
            alignment: me.believedAlignment,
          }
        : null,
      evilTeam: evilTeamView(me.evilTeam),
      butlerMasterSeat: me.believedCharacter === 'butler' ? me.butlerMasterSeat : null,
      canSlayerShot: s.phase === 'day' && me.publicAlive && !me.slayerShotTaken,
    },
    day: dayView(s),
    prompts: finished ? [] : me.prompts.map(promptView),
    info: me.info.map(infoView),
    announcements: announcementViews(s),
    storytellerVisitingYou: isNightPhase(s) && s.visitingSeat === me.seat,
    result: resultView(s),
    spyGrimoire: spyView(me.spyGrimoire),
    gathering: s.gathering,
    bedtimeOvertime: s.phase === 'bedtime' && s.bedtimeOvertime,
  };
  return view;
}

function grimoireEntry(s: GameState, p: PlayerState): GrimoireEntry {
  return {
    seat: p.seat,
    pid: p.pid,
    name: p.name,
    character: p.character,
    believedCharacter: p.believedCharacter,
    alignment: p.alignment,
    alive: p.alive,
    ghostVoteAvailable: p.ghostVoteAvailable,
    poisoned: isPoisoned(p),
    drunk: isDrunk(p),
    protectedTonight: p.protectedTonight,
    reminders: [...p.reminders],
    publicAlive: p.publicAlive,
    isRedHerring: s.redHerringSeat === p.seat,
    isButlerMaster: s.players.some((b) => b.character === 'butler' && b.butlerMasterSeat === p.seat),
    abilityUsed: p.abilityUsed,
    openPrompts: p.prompts.map(promptView),
    sentPrompts: (p.promptHistory ?? []).map((q) => ({ id: q.id, title: q.title, open: p.prompts.some((o) => o.id === q.id) })),
    info: p.info.slice(-20).map(infoView),
  };
}

/** Full Storyteller view (Grimoire, night queue, alerts). Only for the seated Storyteller. */
export function projectForStoryteller(s: GameState): StorytellerGameView {
  // Standard distribution for this player count; Baron-adjusted once a Baron is assigned.
  const counts = setupCounts(s.players.length, s.assigned && s.players.some((p) => p.startingCharacter === 'baron'));
  const ready = isNightPhase(s) || s.phase === 'setup';
  return {
    kind: 'storyteller',
    phase: s.phase,
    dayNumber: s.dayNumber,
    phaseEndsAt: s.phaseEndsAt,
    players: s.players.map(publicPlayer),
    grimoire: s.assigned ? s.players.map((p) => grimoireEntry(s, p)) : [],
    demonBluffs: [...s.demonBluffs],
    nightQueue: ready || s.phase === 'day' ? s.nightQueue.map((st) => stepView(s, st)) : [],
    day: dayView(s),
    announcements: announcementViews(s),
    visitingSeat: s.visitingSeat,
    travelSpeedMult: s.travelSpeedMult,
    alerts: [...s.alerts],
    log: s.log.slice(-80).map((l) => ({ at: l.at, text: l.text })),
    result: resultView(s),
    bedtimeSeconds: s.bedtimeSeconds,
    pendingDeaths: s.players.filter((p) => p.publicAlive && !p.alive).map((p) => p.seat),
    canUndo: s.history.length > 0 && s.phase !== 'finished',
    setupCounts: { townsfolk: counts.townsfolk, outsiders: counts.outsiders, minions: counts.minions, demons: counts.demons },
    charactersAssigned: s.assigned,
    timerPaused: s.bedtimePausedRemainingMs !== null,
    pendingResult: s.resultPending && s.result ? { winner: s.result.winner, reason: s.result.reason } : null,
    gathering: s.gathering,
    bedtimeOvertime: s.phase === 'bedtime' && s.bedtimeOvertime,
    timerHeld: s.bedtimeHeld,
    bedtimeRemainingMs: s.bedtimePausedRemainingMs,
    bedtimeFirstNight: s.phase === 'bedtime' && s.bedtimeFirst,
    stage: null,
    settings: { ...s.settings },
  };
}
