// Scripted Storyteller-run games for tests (qa-deploy): lobby -> ready -> start -> random setup ->
// first night -> day, plus helpers to nominate/vote/execute/declare a winner — all through the real
// C2S protocol as a client would send it.
import type { GrimoireEntry, PlayerGameView, StorytellerGameView } from '../../packages/protocol/src/index.js';
import { Bot, makeBots, type BotOptions } from './bot.js';

export interface Game {
  lobbyId: string;
  st: Bot;
  players: Bot[];
  seatOf: Map<Bot, number>;
  grimoire: GrimoireEntry[];
  stView: () => StorytellerGameView | undefined;
  cmd: (c: unknown) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => T | undefined | null | false, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timeout (${timeoutMs}ms): ${what}`);
    await sleep(50);
  }
}

export interface GameOptions extends BotOptions {
  players?: number;
  prefix?: string;
  /** stop after the lobby is full and ready (do not start). */
  noStart?: boolean;
  /** stop after start (setup phase). */
  stopAtSetup?: boolean;
  /** advance to day after the first night (default true). */
  toDay?: boolean;
  /** let bots answer prompts / cast random votes on their own (default false: scripted tests decide) */
  autoRespond?: boolean;
  /** lobby seats (default max(5, players)) */
  maxPlayers?: number;
  /** reuse existing bots: [st, ...players] */
  bots?: Bot[];
}

export async function setupGame(baseUrl: string, wsUrl: string, opts: GameOptions = {}): Promise<Game | null> {
  const n = opts.players ?? 7;
  const bots = opts.bots ?? (await makeBots(n + 1, opts.prefix ?? `g${Math.random().toString(36).slice(2, 6)}-`, baseUrl, wsUrl, opts));
  const [st, ...players] = bots as [Bot, ...Bot[]];
  for (const b of bots) b.autoRespondEnabled = opts.autoRespond ?? false;
  const lobbyId = await st.createLobby(`Game ${Math.random().toString(36).slice(2, 6)}`, opts.maxPlayers ?? Math.max(5, n), true);
  await st.join(lobbyId, 'storyteller');
  for (const p of players) await p.join(lobbyId);
  await until(() => st.lobbyView?.members.length === n + 1, 8000, `${n + 1} members`);
  for (const p of players) p.send('lobby:ready', { ready: true });
  await until(() => st.lobbyView?.canStart, 8000, 'canStart').catch((e) => {
    const v = st.lobbyView;
    const detail = {
      startBlockers: v?.startBlockers,
      members: v?.members.map((m) => `${m.displayName}:${m.role}:${m.ready ? 'R' : '-'}:${m.connected ? 'c' : 'x'}`),
      bots: players.map((p) => ({ n: p.name, room: !!p.room, close: p.lastCloseCode, errs: p.recorder.ofType('error'), ownView: p.lobbyView?.members.find((m) => m.pid === p.pid)?.ready })),
    };
    throw new Error(`${(e as Error).message} :: ${JSON.stringify(detail)}`);
  });
  const stView = () => st.gameView as StorytellerGameView | undefined;
  const cmd = (c: unknown) => st.send('st:command', c);
  const g: Game = { lobbyId, st, players, seatOf: new Map(), grimoire: [], stView, cmd };
  if (opts.noStart) return g;
  st.send('lobby:start', {});
  try {
    await st.waitFor<any>('game:view', (v) => v?.kind === 'storyteller', 6000);
  } catch {
    return null;
  }
  if (opts.stopAtSetup) return g;
  cmd({ type: 'random_setup' });
  await until(() => (stView()?.grimoire?.length ?? 0) === n, 6000, 'grimoire');
  g.grimoire = stView()!.grimoire;
  cmd({ type: 'begin_first_night' });
  await until(() => stView()?.phase === 'first_night', 6000, 'first_night');
  await until(() => players.every((p) => (p.gameView as PlayerGameView | undefined)?.you?.role), 6000, 'roles delivered');
  for (const p of players) g.seatOf.set(p, (p.gameView as PlayerGameView).you.seat);
  if (opts.toDay !== false) await toDay(g);
  return g;
}

export async function toDay(g: Game) {
  overridePendingResult(g);
  for (const step of g.stView()?.nightQueue ?? []) if (step.status !== 'resolved' && step.status !== 'skipped') g.cmd({ type: 'skip_step', stepId: step.id });
  g.cmd({ type: 'advance_phase', to: 'day' });
  await until(() => g.stView()?.phase === 'day', 6000, 'day');
}

/** If the engine proposed a game end mid-script, keep playing (the ST may override it). */
export function overridePendingResult(g: Game) {
  if ((g.stView() as any)?.pendingResult) g.cmd({ type: 'override_result' });
}

export async function toNight(g: Game) {
  overridePendingResult(g);
  g.cmd({ type: 'advance_phase', to: 'night' });
  await until(() => g.stView()?.phase === 'night', 6000, 'night');
}

/** Nominate + vote (given voters raise hands) + finish; returns the tallied nomination. */
export async function nominateAndVote(g: Game, nominator: Bot, nomineeSeat: number, voters: Bot[]) {
  const t0 = Date.now();
  g.cmd({ type: 'set_nominations_open', open: true });
  await until(() => (nominator.gameView as PlayerGameView)?.day?.nominationsOpen, 5000, 'nominations open').catch((e) => {
    const stErrors = g.st.recorder.messages.filter((m) => m.type === 'error' && m.at >= t0).map((m) => m.payload);
    throw new Error(`${(e as Error).message} :: ST errors ${JSON.stringify(stErrors)}; ST day ${JSON.stringify({ phase: g.stView()?.phase, open: g.stView()?.day?.nominationsOpen, noms: g.stView()?.day?.nominations.map((n) => n.status), block: g.stView()?.day?.onTheBlock, executed: g.stView()?.day?.executedSeat })}; nominator alive ${(nominator.gameView as PlayerGameView)?.you.alive}`);
  });
  const before = g.stView()?.day?.nominations.length ?? 0;
  nominator.send('game:nominate', { nomineeSeat });
  const nom = await until(() => g.stView()?.day?.nominations[before], 5000, 'nomination');
  if (nom.status === 'cancelled') return nom; // e.g. Virgin
  g.cmd({ type: 'start_vote', nominationId: nom.id });
  await until(() => (voters[0]?.gameView as PlayerGameView | undefined)?.day?.nominations.find((n) => n.id === nom.id)?.status === 'voting' || !voters.length, 5000, 'voting');
  for (const v of voters) v.send('game:vote', { nominationId: nom.id, vote: true });
  return until(() => g.stView()?.day?.nominations.find((n) => n.id === nom.id && n.status === 'tallied'), 40_000, 'tally');
}

/** A good, ability-free-of-triggers nominee (not Virgin/Saint/Imp) and someone else to nominate. */
export function safeNominee(g: Game): { nominee: Bot; nominator: Bot; entry: GrimoireEntry } {
  const entry =
    g.grimoire.find((e) => e.alignment === 'good' && !['virgin', 'saint', 'mayor'].includes(e.character)) ??
    g.grimoire.find((e) => !['virgin', 'saint', 'imp'].includes(e.character)) ??
    g.grimoire[0]!;
  const nominee = g.players.find((p) => g.seatOf.get(p) === entry.seat)!;
  const nominator = g.players.find((p) => p !== nominee)!;
  return { nominee, nominator, entry };
}

/** Run a full game: day 1 nomination+vote+execution, night 2 with an ST visit + kill, day 2, winner. */
export async function playFullGame(g: Game, opts: { winner?: 'good' | 'evil'; declare?: boolean } = {}) {
  const { nominee, nominator, entry } = safeNominee(g);
  const voters = g.players.filter((p) => p !== nominee);
  await nominateAndVote(g, nominator, entry.seat, voters);
  g.cmd({ type: 'execute', seat: entry.seat });
  await until(() => g.stView()?.grimoire.find((x) => x.seat === entry.seat)?.alive === false, 5000, 'executed');
  await toNight(g);
  const victim = g.grimoire.find((e) => e.alive && e.alignment === 'good' && e.seat !== entry.seat && e.character !== 'soldier');
  if (victim) {
    g.cmd({ type: 'visit_home', seat: victim.seat });
    await sleep(800);
    g.cmd({ type: 'set_status', seat: victim.seat, poisoned: true });
    g.cmd({ type: 'send_info', seat: victim.seat, info: { text: 'You feel unwell.', number: 0 } });
    g.cmd({ type: 'leave_home' });
    g.cmd({ type: 'kill', seat: victim.seat, announce: false });
  }
  await toDay(g);
  if (opts.declare === false) return;
  await finishGame(g, opts.winner ?? 'good');
}

/** End the game: if the engine already proposed a result (pendingResult: e.g. the Demon died, or two
 * players are left) the Storyteller confirms it, as they would in the UI; otherwise declare a winner. */
export async function finishGame(g: Game, winner: 'good' | 'evil' = 'good') {
  if ((g.stView() as any)?.pendingResult) g.cmd({ type: 'confirm_result' });
  else g.cmd({ type: 'declare_winner', winner, reason: 'scripted test game' });
  await until(() => g.stView()?.phase === 'finished', 5000, 'finished');
}

export { Bot };
