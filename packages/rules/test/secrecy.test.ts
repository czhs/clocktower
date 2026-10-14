import type { CharacterId, PlayerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller, setVisiting, type GameState } from '../src/index.js';
import { act, act_night, begin, mkGame, nominateAndVote, P, st, step, toDay, toNight } from './helpers.js';

// 9 players incl. Spy, Drunk, Recluse, Poisoner so that every kind of hidden state exists.
const CHARS: CharacterId[] = ['imp', 'poisoner', 'spy', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'drunk', 'recluse'];
const OPTS = { drunkBelieves: 'investigator' as CharacterId, redHerringSeat: 8, bluffs: ['chef', 'mayor', 'saint'] as CharacterId[] };

const PUBLIC_PLAYER_KEYS = ['alive', 'connected', 'ghostVoteAvailable', 'name', 'nominatedToday', 'pid', 'seat', 'wasNominatedToday'];
const TOP_KEYS = [
  'announcements',
  'day',
  'dayNumber',
  'info',
  'kind',
  'phase',
  'phaseEndsAt',
  'players',
  'prompts',
  'result',
  'spyGrimoire',
  'storytellerVisitingYou',
  'you',
];
/** Keys that carry hidden information; each occurrence must be on an allowed path. */
const SENSITIVE = new Set([
  'character',
  'characters',
  'characterType',
  'alignment',
  'believedCharacter',
  'poisoned',
  'poisonedBy',
  'drunk',
  'drunkOverride',
  'reminders',
  'protectedTonight',
  'grimoire',
  'nightQueue',
  'alerts',
  'log',
  'demonBluffs',
  'bluffs',
  'visitingSeat',
  'pendingDeaths',
  'isRedHerring',
  'redHerringSeat',
  'startingCharacter',
  'evilTeam',
  'spyGrimoire',
  'entries',
  'reveal',
]);

function walk(v: unknown, path: string[], out: string[][]) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, String(i)], out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push([...path, k]);
      walk(x, [...path, k], out);
    }
}

function checkView(s: GameState, seat: number, view: PlayerGameView) {
  const me = P(s, seat);
  expect(Object.keys(view).sort()).toEqual(TOP_KEYS);
  for (const p of view.players) expect(Object.keys(p).sort()).toEqual(PUBLIC_PLAYER_KEYS);
  const paths: string[][] = [];
  walk(view, [], paths);
  for (const path of paths) {
    const key = path.at(-1)!;
    if (!SENSITIVE.has(key)) continue;
    const p = path.join('.');
    const value = path.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], view);
    if (/^you\.role\.(character|characterType|alignment)$/.test(p)) continue;
    if (/^info\.\d+\.characters$/.test(p)) continue; // info the ST delivered to this player
    if (p === 'you.evilTeam') {
      if (value !== null) expect(me.alignment, `evilTeam for good seat ${seat}`).toBe('evil');
      continue;
    }
    if (p === 'you.evilTeam.bluffs') continue;
    if (p === 'spyGrimoire') {
      if (value !== null) expect(me.startingCharacter, `spyGrimoire for seat ${seat}`).toBe('spy');
      continue;
    }
    if (p.startsWith('spyGrimoire.')) {
      expect(me.startingCharacter).toBe('spy');
      continue;
    }
    if (p === 'result.reveal' || /^result\.reveal\.\d+\.(character|alignment)$/.test(p)) {
      expect(view.phase).toBe('finished');
      continue;
    }
    throw new Error(`seat ${seat}: sensitive key at ${p}`);
  }
  // Own info/prompts only (per-seat ids).
  for (const i of view.info) expect(i.id.startsWith(`i${seat}-`)).toBe(true);
  for (const q of view.prompts) expect(q.id.startsWith(`q${seat}-`)).toBe(true);
  // The believed role, never the true one for the Drunk.
  if (view.you.role) expect(view.you.role.character).toBe(me.believedCharacter);
  if (me.character === 'drunk' && view.you.role) expect(view.you.role.character).not.toBe('drunk');
  // No other player's poison/drunk/character leaks through JSON text either (before the reveal).
  if (view.phase !== 'finished' && me.startingCharacter !== 'spy') {
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"poisoned"|"drunk"|"reminders"|Is the Drunk/);
  }
}

function checkAll(s: GameState, label: string, views: Map<number, string[]>) {
  for (const p of s.players) {
    const v = projectForPlayer(s, p.seat);
    try {
      checkView(s, p.seat, v);
    } catch (e) {
      throw new Error(`[${label}] ${(e as Error).message}`);
    }
    views.get(p.seat)!.push(JSON.stringify(v));
  }
}

describe('player projections never leak hidden state', () => {
  it('scripted full game: every projection after every action is clean', () => {
    const s = mkGame(CHARS, OPTS);
    const views = new Map(s.players.map((p) => [p.seat, [] as string[]]));
    const check = (label: string) => checkAll(s, label, views);
    check('setup');
    // setup: nobody has a role yet
    for (const p of s.players) expect(projectForPlayer(s, p.seat).you.role).toBeNull();
    begin(s);
    check('first night');
    st(s, { type: 'resolve_step', stepId: step(s, 'minion_info').id });
    st(s, { type: 'resolve_step', stepId: step(s, 'demon_info').id });
    check('evil info');
    act_night(s, 'poisoner', [4]);
    check('poison');
    for (const kind of ['washerwoman', 'investigator', 'empath'] as const) {
      const x = step(s, kind);
      setVisiting(s, x.seat);
      const info = projectForStoryteller(s).nightQueue.find((q) => q.id === x.id)!.suggestedInfo!;
      st(s, { type: 'send_info', seat: x.seat!, info });
      check(`info ${kind}`);
    }
    setVisiting(s, 5);
    check('visit ft');
    act_night(s, 'fortune_teller', [0, 3]);
    st(s, { type: 'send_info', seat: 5, info: { text: 'Yes', yes: true } });
    st(s, { type: 'resolve_step', stepId: step(s, 'spy').id });
    setVisiting(s, null);
    check('spy');
    st(s, { type: 'advance_phase', to: 'dawn' });
    toDay(s);
    check('day 1');
    nominateAndVote(s, 3, 8, [0, 1, 2, 3, 4, 5]);
    check('vote');
    st(s, { type: 'execute', seat: 8 });
    check('execute');
    st(s, { type: 'advance_phase', to: 'bedtime' });
    toNight(s);
    act_night(s, 'poisoner', [5]);
    act_night(s, 'monk', [3]);
    act_night(s, 'imp', [3]);
    st(s, { type: 'resolve_step', stepId: step(s, 'spy').id });
    check('night 2');
    toDay(s);
    check('day 2');
    expect(P(s, 3).alive).toBe(true);
    act(s, 4, { type: 'slayerShot', targetSeat: 0 });
    check('fake slayer');
    nominateAndVote(s, 4, 0, [3, 4, 5, 6, 7]);
    st(s, { type: 'execute', seat: 0 });
    expect(s.result).toMatchObject({ winner: 'good' });
    check('finished');
    for (const p of s.players) {
      const r = projectForPlayer(s, p.seat).result!;
      expect(r.reveal.map((x) => x.character)).toEqual(CHARS);
    }
    // sanity: we captured many snapshots per player
    expect(views.get(0)!.length).toBeGreaterThan(15);
  });
});

describe('differential secrecy', () => {
  function night2(): GameState {
    const s = mkGame(CHARS, OPTS);
    begin(s);
    st(s, { type: 'advance_phase', to: 'dawn' });
    toDay(s);
    toNight(s);
    return s;
  }
  /** Announcements carry wall-clock timestamps; align them after checking texts match. */
  const align = (a: GameState, b: GameState) => {
    expect(b.announcements.map((x) => x.text)).toEqual(a.announcements.map((x) => x.text));
    b.announcements = a.announcements.map((x) => ({ ...x }));
  };
  const viewsExcept = (s: GameState, except: number[]) =>
    s.players.filter((p) => !except.includes(p.seat)).map((p) => JSON.stringify(projectForPlayer(s, p.seat)));

  it('poison, drunk, reminders and secret character changes of seat 5 are invisible to everyone else', () => {
    const a = night2();
    const b = night2();
    st(b, { type: 'set_status', seat: 5, poisoned: true, drunk: true, protectedTonight: true });
    st(b, { type: 'add_reminder', seat: 5, token: 'Secret' });
    st(b, { type: 'change_character', seat: 5, character: 'slayer', notify: false });
    st(a, { type: 'announce', text: 'x' });
    st(b, { type: 'announce', text: 'x' });
    align(a, b);
    expect(viewsExcept(b, [])).toEqual(viewsExcept(a, []));
  });

  it('a night visit / prompt to seat 3 changes nothing in other players views', () => {
    const a = night2();
    const b = night2();
    setVisiting(b, 3);
    st(b, { type: 'prompt_player', seat: 3, prompt: { kind: 'yes_no', title: 'Psst' } });
    st(b, { type: 'send_info', seat: 3, info: { text: 'secret' } });
    align(a, b);
    expect(viewsExcept(b, [3])).toEqual(viewsExcept(a, [3]));
    const v3 = projectForPlayer(b, 3);
    expect(v3.storytellerVisitingYou).toBe(true);
    expect(v3.prompts).toHaveLength(1);
    expect(projectForPlayer(a, 3).storytellerVisitingYou).toBe(false);
  });

  it('who the demon killed is invisible to everyone (incl. the victim) until dawn', () => {
    const a = night2();
    const b = night2();
    act_night(a, 'imp', [3]);
    act_night(b, 'imp', [4]);
    // nobody's view differs, not even the Imp's or the victims' (no info is given for a kill)
    align(a, b);
    expect(viewsExcept(b, [])).toEqual(viewsExcept(a, []));
    toDay(a);
    toDay(b);
    expect(projectForPlayer(a, 6).players[3]!.alive).toBe(false);
    expect(projectForPlayer(b, 6).players[4]!.alive).toBe(false);
  });

  it('the Spy view contains a full grimoire, nobody else does; final reveal only when finished', () => {
    const s = night2();
    st(s, { type: 'resolve_step', stepId: step(s, 'spy').id });
    expect(projectForPlayer(s, 2).spyGrimoire!.entries).toHaveLength(9);
    for (const p of s.players) if (p.seat !== 2) expect(projectForPlayer(s, p.seat).spyGrimoire).toBeNull();
    for (const p of s.players) expect(projectForPlayer(s, p.seat).result).toBeNull();
    st(s, { type: 'declare_winner', winner: 'good', reason: 'test' });
    const r = projectForPlayer(s, 4).result!;
    expect(r.reveal.find((x) => x.seat === 7)!.character).toBe('drunk');
  });

  it('the Drunk only ever sees their believed Townsfolk', () => {
    const s = night2();
    const v = projectForPlayer(s, 7);
    expect(v.you.role).toEqual({ character: 'investigator', characterType: 'townsfolk', alignment: 'good' });
    expect(JSON.stringify(v)).not.toContain('drunk');
  });

  it('players never see unpublished night deaths through ghost/vote flags', () => {
    const s = night2();
    act_night(s, 'imp', [3]);
    for (const p of s.players) {
      const v = projectForPlayer(s, p.seat);
      expect(v.players[3]!.alive).toBe(true);
    }
  });
});
