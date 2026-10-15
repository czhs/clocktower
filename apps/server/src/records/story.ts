// OWNED BY records. "The story": the Storyteller's play-by-play (story:get -> story:st, seated
// Storyteller ONLY) and the pamphlets they may release to the town (story:release ->
// story:pamphlet to everyone; story:pamphlets lists them again, e.g. after a reconnect).
//
// Secrecy: a mid-game pamphlet (kind 'day', only when StSettings.pamphlets is on) is built ONLY from
// PublicItems = announcements every player already received + public vote hands (names only). It
// never reads the private timeline. The final pamphlet (full story + grimoire reveal) requires the
// game to be finished (the end was confirmed by the Storyteller).
import { createHash } from 'node:crypto';
import {
  type C2SParsed,
  type GamePhase,
  type Pamphlet,
  type PamphletKind,
  type PamphletLine,
  type StoryEntry,
  type StorySection,
  type StoryStView,
} from '@ct/protocol';
import type { Database } from '@ct/db';
import type { RoomHost } from '../rooms/modules.js';
import type { GameRecorder, PublicItem } from './recorder.js';
import { recorderOf, recordsRepo } from './registry.js';

const NIGHTISH: GamePhase[] = ['first_night', 'night', 'dawn'];

function header(e: { kind?: string; phase: GamePhase; day: number; night: number }): string {
  if (e.kind === 'end' || e.phase === 'finished') return 'The end';
  if (e.phase === 'setup') return 'Setup';
  if (NIGHTISH.includes(e.phase)) return e.night <= 1 ? 'The first night' : `Night ${e.night}`;
  // the bedtime before the first night belongs to setup ("Day 0" would read oddly)
  if (e.day < 1) return 'Before the first night';
  return `Day ${e.day}`;
}

/** Consecutive entries under Night / Day headers. */
export function sections(entries: StoryEntry[], withData = true): StorySection[] {
  const out: StorySection[] = [];
  for (const e of entries) {
    const title = header(e);
    let sec = out.at(-1);
    if (!sec || sec.title !== title) {
      sec = { title, day: e.day, night: e.night, entries: [] };
      out.push(sec);
    }
    sec.entries.push(withData ? e : { ...e, data: {} });
  }
  return out;
}

/** The time window of "the story of the day": the previous day + the night after it (or the cycle in progress). */
function dayWindow(rec: GameRecorder): { from: number; to: number; anchor: number } | null {
  const s = rec.state;
  if (s.nightNumber === 0 && s.dayNumber === 0) return null;
  const dayStart = (d: number) => [...rec.timeline].reverse().find((e) => !e.undone && e.kind === 'phase' && e.data.phase === 'day' && e.day === d)?.t ?? null;
  const anchor = s.phase === 'day' ? s.dayNumber - 1 : s.dayNumber;
  const from = anchor >= 1 ? (dayStart(anchor) ?? 0) : 0;
  const to = s.phase === 'day' ? (dayStart(s.dayNumber) ?? Infinity) : Infinity;
  return { from, to, anchor };
}

const digestOf = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

function withDigest(p: Omit<Pamphlet, 'digest'>): Pamphlet {
  const { headline: _h, flavour: _f, releasedAt: _r, id: _i, ...content } = p;
  return { ...p, digest: digestOf(content) };
}

const TONE: Record<string, PamphletLine['tone']> = {
  death: 'death',
  execution: 'execution',
  nomination: 'vote',
  vote: 'vote',
  storyteller: 'storyteller',
  game_over: 'end',
};

/** PUBLIC-ONLY pamphlet of the story of the day. Reads nothing but PublicItems. */
export function buildDayPamphlet(rec: GameRecorder): Pamphlet | null {
  const w = dayWindow(rec);
  if (!w) return null;
  const items = rec.publicItems.filter((p: PublicItem) => !p.undone && p.t >= w.from && p.t <= w.to);
  const secs: Pamphlet['sections'] = [];
  for (const p of items) {
    const title = header(p);
    let sec = secs.at(-1);
    if (!sec || sec.title !== title) {
      sec = { title, lines: [] };
      secs.push(sec);
    }
    const tone = TONE[p.kind];
    sec.lines.push(tone ? { text: p.text, tone } : { text: p.text });
  }
  return withDigest({ id: '', kind: 'day', title: `Pamphlet: Day ${w.anchor + 1}`, day: w.anchor + 1, sections: secs });
}

const ENTRY_TONE: Partial<Record<StoryEntry['kind'], PamphletLine['tone']>> = {
  death: 'death',
  execution: 'execution',
  vote: 'vote',
  nomination: 'vote',
  storyteller: 'storyteller',
  end: 'end',
};

/** The full story with the grimoire reveal: only once the game is finished. */
export function buildFinalPamphlet(rec: GameRecorder): Pamphlet | null {
  const s = rec.state;
  if (s.phase !== 'finished' || !s.result) return null;
  const secs = sections(rec.timeline.filter((e) => !e.undone)).map((sec) => ({
    title: sec.title,
    lines: sec.entries.map((e) => {
      const tone = ENTRY_TONE[e.kind];
      return tone ? { text: e.text, tone } : { text: e.text };
    }),
  }));
  return withDigest({
    id: '',
    kind: 'final',
    title: 'The story of this game',
    day: s.dayNumber,
    sections: secs,
    reveal: s.players.map((p) => ({ seat: p.seat, name: p.name, character: p.character, startingCharacter: p.startingCharacter, alignment: p.alignment, alive: p.alive })),
    winner: s.result.winner,
    reason: s.result.reason,
  });
}

export function storytellerView(rec: GameRecorder): StoryStView {
  const s = rec.state;
  const entries = rec.timeline.filter((e) => !e.undone);
  const w = dayWindow(rec);
  const enabled = s.settings.pamphlets === true;
  const previews: Record<PamphletKind, Pamphlet | null> = {
    day: enabled && w ? buildDayPamphlet(rec) : null,
    final: buildFinalPamphlet(rec),
  };
  return {
    rev: rec.rev,
    phase: s.phase,
    finished: s.phase === 'finished',
    soFar: sections(entries, false),
    ofTheDay: w
      ? {
          title: w.anchor < 1 ? 'Setup and the first night' : `Day ${w.anchor} and Night ${w.anchor + 1}`,
          sections: sections(
            entries.filter((e) => e.t >= w.from && e.t <= w.to),
            false,
          ),
        }
      : null,
    pamphletsEnabled: enabled,
    previews,
    released: [...rec.pamphlets],
  };
}

type StoryMsgType = 'story:get' | 'story:release' | 'story:pamphlets';

/**
 * GameRoom dispatch for the story:* messages. `opts.database` + `opts.matchId` let a pamphlet
 * released after the record was written be appended to it.
 */
export function handleStoryMessage(
  host: RoomHost,
  pid: string,
  type: StoryMsgType,
  msg: C2SParsed<'story:get'> | C2SParsed<'story:release'> | C2SParsed<'story:pamphlets'>,
  opts: { database?: Database; matchId?: string | null } = {},
): void {
  const rec = recorderOf(host.game);
  const err = (code: 'forbidden' | 'phase' | 'invalid', message: string) => host.send(pid, 'error', { code, message, for: type });
  if (type === 'story:pamphlets') {
    host.send(pid, 'story:pamphlets', { pamphlets: rec ? [...rec.pamphlets] : [] });
    return;
  }
  if (pid !== host.storytellerPid()) return err('forbidden', 'Only the Storyteller can do that');
  if (!rec) return err('phase', 'No game in progress');
  if (type === 'story:get') {
    const m = msg as C2SParsed<'story:get'>;
    if (m.rev !== undefined && m.rev === rec.rev) return;
    host.send(pid, 'story:st', storytellerView(rec));
    return;
  }
  const m = msg as C2SParsed<'story:release'>;
  if (m.kind === 'day' && rec.state.settings.pamphlets !== true) return err('phase', 'Pamphlets are turned off in your settings');
  const built = m.kind === 'day' ? buildDayPamphlet(rec) : buildFinalPamphlet(rec);
  if (!built) return err('phase', m.kind === 'final' ? 'The story of this game can be shared once the game is over' : 'Nothing to tell yet');
  if (built.digest !== m.digest) {
    host.send(pid, 'story:st', storytellerView(rec));
    return err('invalid', 'The story changed since your preview — check it and release again');
  }
  const p: Pamphlet = {
    ...built,
    id: `p${rec.pamphlets.length + 1}`,
    releasedAt: host.now(),
    ...(m.headline ? { headline: m.headline } : {}),
    ...(m.flavour ? { flavour: m.flavour } : {}),
  };
  rec.addPamphlet(p);
  for (const member of host.members()) host.send(member.pid, 'story:pamphlet', p);
  host.send(pid, 'story:st', storytellerView(rec));
  host.log.info('story pamphlet released', { lobbyId: host.lobbyId, kind: p.kind, id: p.id });
  if (opts.database && opts.matchId) {
    try {
      recordsRepo(opts.database).appendPamphlet(opts.matchId, p);
    } catch (e) {
      host.log.error('appending pamphlet to the match record failed', { err: e instanceof Error ? e.message : String(e) });
    }
  }
}
