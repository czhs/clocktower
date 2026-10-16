// OWNED BY records. Assembles the GameRecordV1 document from the room's match metadata (accounts,
// display names, avatars — known only to the GameRoom) and the game's GameRecorder.
import { CHARACTER_INFO, type Alignment, type GamePhase } from '@ct/protocol';
import type { MatchRecordInput } from '@ct/db';
import type { GameRecorder } from './recorder.js';
import {
  GAME_RECORD_VERSION,
  type AbandonReason,
  type DayRecord,
  type GameRecordV1,
  type NightRecord,
  type PersonRecord,
  type RecordStatus,
  type SeatRecord,
} from './types.js';

/** Frozen at game start by the GameRoom (no passphrases / tokens / cosmetics beyond the avatar id). */
export interface MatchMeta {
  matchId: string;
  lobbyId: string;
  script: string;
  lobbyName: string;
  maxPlayers: number | null;
  startedAt: number;
  storyteller: PersonRecord | null;
  players: (PersonRecord & { seat: number; avatarId: string | null })[];
}

export interface BuildOptions {
  status: RecordStatus;
  endedAt: number;
  abandonReason?: AbandonReason;
  /** Fallback when no recorder exists (fake game modules in tests): the summary outcome. */
  outcome?: { winner: Alignment; reason: string } | null;
}

const ABANDON_TEXT: Record<AbandonReason, string> = {
  closed_by_admin: 'the lobby was closed by an administrator',
  idle_timeout: 'everyone left',
  room_disposed: 'the server shut the lobby down',
  aborted_by_host: 'the host ended the game', // (auto-st)
};

const DAYISH: GamePhase[] = ['day', 'bedtime'];
const NIGHTISH: GamePhase[] = ['first_night', 'night', 'dawn'];

export function buildGameRecord(meta: MatchMeta, rec: GameRecorder | null, o: BuildOptions): GameRecordV1 {
  const warnings: string[] = rec ? [...rec.warnings] : ['no game recorder: only the summary is available'];
  const s = rec?.state ?? null;
  const live = <T extends { undone?: boolean }>(xs: Iterable<T>) => [...xs].filter((x) => !x.undone);
  const noms = rec ? live(rec.nominations) : [];
  const execs = rec ? live(rec.executions) : [];
  const result =
    rec?.result ??
    (o.status === 'finished' && o.outcome ? { winner: o.outcome.winner, reason: o.outcome.reason, at: o.endedAt, detectedAt: null, via: 'other' as const, confirmedBy: null } : null);
  if (result && result.via !== 'other' && meta.storyteller) result.confirmedBy = { ...meta.storyteller };
  const winner = o.status === 'finished' ? (result?.winner ?? null) : null;

  const seats: SeatRecord[] = meta.players
    .map((m) => {
      const p = s?.players.find((x) => x.seat === m.seat);
      const assigned = !!s?.assigned;
      const setupChar = rec?.setup?.characters.find((c) => c.seat === m.seat);
      const startingCharacter = assigned && p ? p.startingCharacter : null;
      const deaths = rec ? live(rec.deaths).filter((d) => d.seat === m.seat) : [];
      const lastDeath = deaths.at(-1);
      const votes = noms.flatMap((n) => n.votes.filter((v) => v.seat === m.seat).map((v) => ({ nominationId: n.key, day: n.day, yes: v.yes, ghost: v.ghost })));
      const ghost = noms.flatMap((n) => n.votes.filter((v) => v.seat === m.seat && v.yes && v.ghost).map((v) => ({ at: v.at, day: n.day, nominationId: n.key })))[0] ?? null;
      const seat: SeatRecord = {
        pid: m.pid,
        accountId: m.accountId,
        displayName: m.displayName,
        label: m.label,
        seat: m.seat,
        avatarId: m.avatarId,
        startingCharacter,
        startingAlignment: setupChar?.alignment ?? (startingCharacter ? CHARACTER_INFO[startingCharacter].alignment : null),
        startingBelievedCharacter: setupChar?.believedCharacter ?? null,
        finalCharacter: assigned && p ? p.character : null,
        finalAlignment: assigned && p ? p.alignment : null,
        finalBelievedCharacter: assigned && p ? p.believedCharacter : null,
        aliveAtEnd: p ? p.alive : true,
        won: winner && assigned && p ? p.alignment === winner : null,
        death: p && !p.alive && lastDeath && lastDeath.revivedAt === undefined ? { at: lastDeath.at, day: lastDeath.day, night: lastDeath.night, phase: lastDeath.phase, cause: lastDeath.cause } : null,
        executed: p?.executed ?? false,
        executedDays: execs.filter((e) => e.seat === m.seat).map((e) => e.day),
        ghostVoteUsed: p?.ghostVoteUsed ?? false,
        ghostVote: ghost,
        nominationsMade: noms.filter((n) => n.nominatorSeat === m.seat).map((n) => n.key),
        nominationsReceived: noms.filter((n) => n.nomineeSeat === m.seat).map((n) => n.key),
        votes,
        connectedAtEnd: p?.connected ?? false,
      };
      return seat;
    })
    .sort((a, b) => a.seat - b.seat);

  const spans = rec ? live(rec.phases) : [];
  const dayRecords: DayRecord[] = [];
  const nightRecords: NightRecord[] = [];
  for (const sp of spans) {
    if (DAYISH.includes(sp.phase) && sp.day >= 1) {
      let d = dayRecords.find((x) => x.day === sp.day);
      if (!d) dayRecords.push((d = { day: sp.day, startedAt: sp.startedAt, endedAt: sp.endedAt, nominations: [], executions: [] }));
      d.endedAt = sp.endedAt;
    } else if (NIGHTISH.includes(sp.phase) && sp.night >= 1) {
      let n = nightRecords.find((x) => x.night === sp.night);
      if (!n) nightRecords.push((n = { night: sp.night, startedAt: sp.startedAt, endedAt: sp.endedAt, steps: [], visited: [] }));
      n.endedAt = sp.endedAt;
    }
  }
  for (const d of dayRecords) {
    d.nominations = noms.filter((n) => n.day === d.day).map((n) => n.key);
    d.executions = execs.filter((e) => e.day === d.day).map((e) => e.seat);
  }
  const steps = rec ? live(rec.nightSteps.values()).sort((a, b) => a.night - b.night || a.order - b.order) : [];
  for (const n of nightRecords) {
    n.steps = steps.filter((x) => x.night === n.night).map((x) => x.id);
    n.visited = (rec?.visits ?? []).filter((v) => v.night === n.night).map((v) => v.seat);
  }
  const fin = s && rec ? rec.settingsOf(s) : null;
  const init = rec?.initialSettings ?? { bedtimeSeconds: 0, voteSeconds: 0, doorTags: true, pamphlets: false };

  return {
    version: GAME_RECORD_VERSION,
    matchId: meta.matchId,
    lobbyId: meta.lobbyId,
    status: o.status,
    script: meta.script,
    lobby: { name: meta.lobbyName, maxPlayers: meta.maxPlayers },
    settings: { initial: init, final: fin ?? init },
    startedAt: meta.startedAt,
    endedAt: o.endedAt,
    durationMs: Math.max(0, o.endedAt - meta.startedAt),
    days: s?.dayNumber ?? 0,
    nights: s?.nightNumber ?? 0,
    storyteller: meta.storyteller ? { ...meta.storyteller } : null,
    seats,
    setup: rec?.setup ?? null,
    phases: rec ? [...rec.phases] : [],
    dayRecords,
    nightRecords,
    nominations: rec ? [...rec.nominations] : [],
    executions: rec ? [...rec.executions] : [],
    deaths: rec ? [...rec.deaths] : [],
    roleChanges: rec ? [...rec.roleChanges] : [],
    statusChanges: rec ? [...rec.statusChanges] : [],
    nightSteps: rec ? [...rec.nightSteps.values()] : [],
    info: rec ? [...rec.info] : [],
    prompts: rec ? [...rec.prompts.values()] : [],
    visits: rec ? [...rec.visits] : [],
    storytellerCommands: rec ? [...rec.commands] : [],
    playerActions: rec ? [...rec.actions] : [],
    connections: rec ? [...rec.connections] : [],
    storytellerLog: rec ? [...rec.log] : [],
    announcements: rec ? [...rec.announcements] : [],
    timeline: [
      ...(rec ? rec.timeline : []),
      ...(o.status === 'abandoned'
        ? [
            {
              t: Math.max(0, o.endedAt - (rec?.startedAt ?? meta.startedAt)),
              at: o.endedAt,
              day: s?.dayNumber ?? 0,
              night: s?.nightNumber ?? 0,
              phase: s?.phase ?? ('setup' as GamePhase),
              kind: 'end' as const,
              actors: [],
              data: { abandoned: true, reason: o.abandonReason ?? 'room_disposed' },
              text: `The game was abandoned (${ABANDON_TEXT[o.abandonReason ?? 'room_disposed']}).`,
            },
          ]
        : []),
    ],
    pamphlets: rec ? [...rec.pamphlets] : [],
    result: o.status === 'finished' ? result : null,
    abandon:
      o.status === 'abandoned'
        ? { reason: o.abandonReason ?? 'room_disposed', at: o.endedAt, phase: s?.phase ?? null, day: s?.dayNumber ?? 0, night: s?.nightNumber ?? 0 }
        : null,
    warnings,
  };
}

/** The repo row for a record. */
export function recordRow(r: GameRecordV1): MatchRecordInput {
  return {
    matchId: r.matchId,
    lobbyId: r.lobbyId,
    version: r.version,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    winner: r.result?.winner ?? null,
    playerCount: r.seats.length,
    storytellerAccountId: r.storyteller?.accountId ?? null,
    record: r,
  };
}
