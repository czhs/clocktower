// OWNED BY gameplay. Storyteller "props": every phase transition can be forced, votes / block /
// executions can be overridden, bedtime is walk-home (tick with everyoneHome), prompts / info can
// be re-sent. The engine advises (alerts) and never gates these on readiness.
import type { CharacterId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller, tick } from '../src/index.js';
import { act, clock, mkGame, st, stErr } from './helpers.js';

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'saint', 'monk', 'chef'];

function toDay() {
  const s = mkGame(CHARS);
  st(s, { type: 'begin_first_night' });
  st(s, { type: 'advance_phase', to: 'day' });
  return s;
}

describe('force_phase', () => {
  it('jumps in any direction, skipping readiness checks; gather = day + circle', () => {
    const s = mkGame(CHARS);
    st(s, { type: 'force_phase', to: 'day' });
    expect(s.phase).toBe('day');
    st(s, { type: 'force_phase', to: 'dawn' });
    expect(s.phase).toBe('dawn');
    st(s, { type: 'force_phase', to: 'gather' });
    expect(s.phase).toBe('day');
    expect(s.gathering).toBe(true);
    expect(projectForPlayer(s, 2).gathering).toBe(true);
    st(s, { type: 'force_phase', to: 'night' });
    expect(s.phase).toBe('first_night'); // no night has happened yet: this is the first
    expect(s.gathering).toBe(false);
    st(s, { type: 'force_phase', to: 'setup' });
    expect(s.phase).toBe('setup');
    st(s, { type: 'force_phase', to: 'first_night' });
    expect(s.phase).toBe('first_night');
    st(s, { type: 'force_phase', to: 'bedtime' });
    expect(s.phase).toBe('bedtime');
    expect(s.bedtimeFirst).toBe(false);
  });

  it('forcing night with someone on the block does NOT execute them (alert only); a running vote is dropped', () => {
    const s = toDay();
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 3 });
    const id = s.day!.nominations[0]!.id;
    st(s, { type: 'start_vote', nominationId: id });
    st(s, { type: 'set_block', seat: 4, votes: 4 });
    st(s, { type: 'force_phase', to: 'night' });
    expect(s.phase).toBe('night');
    expect(s.players[4]!.alive).toBe(true); // the Saint was NOT executed
    expect(s.alerts.join('\n')).toMatch(/NOT executed/);
    expect(s.alerts.join('\n')).toMatch(/vote was dropped/);
  });

  it('refuses only what would be meaningless: the first night before characters exist, anything after the end', () => {
    const s = mkGame(CHARS);
    st(s, { type: 'declare_winner', winner: 'good', reason: 'x' });
    expect(stErr(s, { type: 'force_phase', to: 'day' })).toMatch(/over/);
  });
});

describe('walk-home bedtime (tick with everyoneHome)', () => {
  it('countdown expiry starts the overtime (no night); night falls once everyone is home', () => {
    const s = toDay();
    st(s, { type: 'advance_phase', to: 'bedtime' });
    const end = s.phaseEndsAt!;
    expect(tick(s, end - 1, { everyoneHome: false }).changed).toBe(false);
    const r = tick(s, end, { everyoneHome: false });
    expect(r.changed).toBe(true);
    expect(s.phase).toBe('bedtime');
    expect(s.bedtimeOvertime).toBe(true);
    expect(projectForPlayer(s, 0).bedtimeOvertime).toBe(true);
    expect(tick(s, end + 1000, { everyoneHome: false }).changed).toBe(false);
    tick(s, end + 2000, { everyoneHome: true });
    expect(s.phase).toBe('night');
    expect(s.bedtimeOvertime).toBe(false);
  });

  it('everyone home early: night falls before the countdown; held by the ST: it waits', () => {
    const s = toDay();
    st(s, { type: 'advance_phase', to: 'bedtime' });
    st(s, { type: 'bedtime_timer', action: 'pause' });
    expect(projectForStoryteller(s).timerHeld).toBe(true);
    tick(s, clock.now + 1, { everyoneHome: true });
    expect(s.phase).toBe('bedtime');
    tick(s, clock.now + 999_999, { everyoneHome: false });
    expect(s.bedtimeOvertime).toBe(false); // the clock is held
    st(s, { type: 'bedtime_timer', action: 'resume' });
    expect(s.phaseEndsAt).not.toBeNull();
    tick(s, clock.now + 1, { everyoneHome: true });
    expect(s.phase).toBe('night');
  });

  it('extend / restart: more time, and the overtime (escort) is cancelled', () => {
    const s = toDay();
    st(s, { type: 'advance_phase', to: 'bedtime' });
    const end = s.phaseEndsAt!;
    st(s, { type: 'bedtime_timer', action: 'extend', seconds: 30 });
    expect(s.phaseEndsAt).toBe(end + 30_000);
    tick(s, s.phaseEndsAt!, { everyoneHome: false });
    expect(s.bedtimeOvertime).toBe(true);
    st(s, { type: 'bedtime_timer', action: 'restart', seconds: 20 });
    expect(s.bedtimeOvertime).toBe(false);
    expect(s.phaseEndsAt).toBe(clock.now + 20_000);
  });

  it('a bedtime rung from setup leads into the FIRST night', () => {
    const s = mkGame(CHARS);
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(projectForStoryteller(s).bedtimeFirstNight).toBe(true);
    tick(s, clock.now + 1, { everyoneHome: true });
    expect(s.phase).toBe('first_night');
    expect(s.nightQueue.some((x) => x.kind === 'minion_info')).toBe(true);
  });

  it('engine-only use (no world): the countdown starts the night directly, as before', () => {
    const s = toDay();
    st(s, { type: 'advance_phase', to: 'bedtime' });
    tick(s, s.phaseEndsAt!);
    expect(s.phase).toBe('night');
  });
});

describe('vote / block / execution overrides', () => {
  function nominated() {
    const s = toDay();
    st(s, { type: 'set_nominations_open', open: true });
    act(s, 2, { type: 'nominate', nomineeSeat: 3 });
    return { s, id: s.day!.nominations[0]!.id };
  }

  it('force_vote re-runs a tallied nomination and replaces a running vote', () => {
    const { s, id } = nominated();
    st(s, { type: 'start_vote', nominationId: id });
    st(s, { type: 'close_vote', mode: 'tally' });
    expect(s.day!.nominations[0]!.status).toBe('tallied');
    st(s, { type: 'force_vote', nominationId: id });
    expect(s.day!.nominations[0]!.status).toBe('voting');
    expect(s.day!.nominations[0]!.voteCount).toBe(0);
    const n2 = st(s, { type: 'create_nomination', nominatorSeat: 5, nomineeSeat: 6, startVote: true });
    void n2;
    expect(s.day!.nominations[0]!.status).toBe('pending'); // stopped, pending again
    expect(s.day!.vote!.nominationId).toBe(s.day!.nominations[1]!.id);
  });

  it('create_nomination ignores the rules (dead nominator, already nominated, nominations closed)', () => {
    const s = toDay();
    st(s, { type: 'kill', seat: 6, announce: true });
    st(s, { type: 'create_nomination', nominatorSeat: 6, nomineeSeat: 3 });
    st(s, { type: 'create_nomination', nominatorSeat: 6, nomineeSeat: 3 });
    expect(s.day!.nominations).toHaveLength(2);
  });

  it('close_vote cancel stops the vote and refunds ghost votes; set_vote edits a tally and the block follows', () => {
    const { s, id } = nominated();
    st(s, { type: 'kill', seat: 6, announce: true });
    st(s, { type: 'start_vote', nominationId: id });
    act(s, 6, { type: 'vote', nominationId: id, vote: true });
    act(s, 1, { type: 'vote', nominationId: id, vote: true });
    st(s, { type: 'close_vote', mode: 'tally' });
    expect(s.players[6]!.ghostVoteAvailable).toBe(false);
    st(s, { type: 'force_vote', nominationId: id }); // re-vote refunds the ghost vote
    expect(s.players[6]!.ghostVoteAvailable).toBe(true);
    st(s, { type: 'close_vote', mode: 'cancel' });
    expect(s.day!.vote).toBeNull();
    expect(s.day!.nominations[0]!.status).toBe('pending');
    st(s, { type: 'force_vote', nominationId: id });
    st(s, { type: 'close_vote', mode: 'tally' });
    for (const seat of [0, 1, 2, 4]) st(s, { type: 'set_vote', nominationId: id, seat, vote: true });
    expect(s.day!.nominations[0]!.voteCount).toBe(4);
    expect(s.day!.block).toEqual({ seat: 3, votes: 4 });
    st(s, { type: 'set_vote', nominationId: id, seat: 0, vote: false });
    expect(s.day!.block).toEqual({ seat: 3, votes: 3 }); // still >= ceil(6 alive / 2)
    st(s, { type: 'set_vote', nominationId: id, seat: 1, vote: false });
    expect(s.day!.block).toBeNull(); // 2 < 3
  });

  it('set_block / force_execute: on the block with any count, a second execution, no execution', () => {
    const s = toDay();
    st(s, { type: 'set_block', seat: 3, votes: 2 });
    expect(projectForPlayer(s, 0).day!.onTheBlock).toEqual({ seat: 3, votes: 2 });
    st(s, { type: 'set_block', seat: null });
    expect(s.day!.block).toBeNull();
    st(s, { type: 'force_execute', seat: 3 });
    expect(s.players[3]!.alive).toBe(false);
    st(s, { type: 'force_execute', seat: 5 }); // a second execution today: allowed, alerted
    expect(s.players[5]!.alive).toBe(false);
    expect(s.alerts.join('\n')).toMatch(/second execution/);
    st(s, { type: 'force_execute', seat: null });
    expect(s.day!.nominationsOpen).toBe(false);
  });

  it('force_execute outside the day still executes (public)', () => {
    const s = toDay();
    st(s, { type: 'advance_phase', to: 'night' });
    st(s, { type: 'force_execute', seat: 6 });
    expect(s.players[6]!.alive).toBe(false);
    expect(s.players[6]!.publicAlive).toBe(false);
  });
});

describe('re-send prompts and info', () => {
  it('resend_info duplicates with a fresh id; resend_prompt re-issues an answered prompt', () => {
    const s = toDay();
    st(s, { type: 'send_info', seat: 2, info: { text: 'Hello there' } });
    const i1 = s.players[2]!.info.at(-1)!.id;
    st(s, { type: 'resend_info', seat: 2, infoId: i1 });
    expect(s.players[2]!.info.map((x) => x.text)).toEqual(['Hello there', 'Hello there']);
    expect(s.players[2]!.info.at(-1)!.id).not.toBe(i1);
    st(s, { type: 'prompt_player', seat: 2, prompt: { kind: 'yes_no', title: 'Ready?' } });
    const q = s.players[2]!.prompts[0]!.id;
    act(s, 2, { type: 'promptResponse', promptId: q, yes: true });
    expect(s.players[2]!.prompts).toEqual([]);
    expect(projectForStoryteller(s).grimoire[2]!.sentPrompts).toEqual([{ id: q, title: 'Ready?', open: false }]);
    st(s, { type: 'resend_prompt', seat: 2, promptId: q });
    expect(s.players[2]!.prompts.map((x) => x.title)).toEqual(['Ready?']);
    expect(s.players[2]!.prompts[0]!.id).not.toBe(q);
    expect(stErr(s, { type: 'resend_prompt', seat: 2, promptId: 'nope' })).toMatch(/Unknown/);
  });
});

describe('gather and undo', () => {
  it('gather is undoable and cleared by the next phase', () => {
    const s = toDay();
    st(s, { type: 'gather', on: true });
    expect(s.gathering).toBe(true);
    st(s, { type: 'undo_last' });
    expect(s.gathering).toBe(false);
    st(s, { type: 'gather', on: true });
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(s.gathering).toBe(false);
    expect(stErr(s, { type: 'gather', on: true })).toMatch(/gather/);
  });
});
