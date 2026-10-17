// OWNED BY rules-storyteller. (v2.2) Pure helpers for dealing characters (no Preact): storyline
// options for a player count, the live standard-count check of a hand-picked bag, and the PRACTICE
// Storyteller view built locally in the waiting room (a fake deal from the lobby members' public
// names; never sent to anyone, never stored). Unit-tested in apps/client/test/deal.logic.test.ts.
import {
  CHARACTER_INFO,
  charactersOfScript,
  DEFAULT_ST_SETTINGS,
  MAX_PLAYERS,
  STORYLINES,
  buildStorylineBag,
  formatCounts,
  storylineById,
  storylinePlayerCounts,
  storylineProblem,
  tbCounts,
  type CharacterId,
  type CharacterType,
  type ScriptId,
  type SeatedType,
  type GrimoireEntry,
  type NightStepView,
  type PublicPlayerView,
  type StCommand,
  type StorylineDef,
  type StorylineId,
  type StorytellerGameView,
  type TbCounts,
} from '@ct/protocol';

// ------------------------------------------------------------------------------- storylines

export interface StorylineOption {
  def: StorylineDef;
  /** "5-15", "6, 8-15". */
  counts: string;
  /** Dealable for this player count. */
  supported: boolean;
  /** Why not (unsupported only). */
  problem: string | null;
}

export function storylineOptions(n: number): StorylineOption[] {
  return STORYLINES.map((def) => {
    const problem = storylineProblem(def, n, CHARACTER_INFO);
    return { def, counts: formatCounts(storylinePlayerCounts(def, CHARACTER_INFO)), supported: problem === null, problem };
  });
}

export function storylineTitle(id: string | null | undefined): string | null {
  return id ? (storylineById(id)?.title ?? null) : null;
}

/** "Always: Poisoner, Imp" (the fixed core, Demon last). */
export function coreLine(def: StorylineDef): string {
  const core = [...def.core].sort((a, b) => (a === 'imp' ? 1 : b === 'imp' ? -1 : 0));
  return core.map((c) => CHARACTER_INFO[c].name).join(', ');
}

// ------------------------------------------------------------------------------ bag builder

export const TYPE_ORDER: SeatedType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

/** Characters of type `t` on `script` (a custom script may use any character). */
export function charactersOf(t: CharacterType, script: ScriptId = 'trouble-brewing'): CharacterId[] {
  const pool = script === 'custom' ? (Object.keys(CHARACTER_INFO) as CharacterId[]) : charactersOfScript(script);
  return pool.filter((c) => CHARACTER_INFO[c].type === t);
}

/** Does this storyline name the Drunk? Then the Storyteller says who the Drunk is (the server asks). */
export function storylineNamesDrunk(id: StorylineId): boolean {
  const def = storylineById(id);
  return !!def && [...def.core, ...def.prefer].includes('drunk');
}

/** Deal modes a script supports: storylines are Trouble Brewing setups; a custom script has no random pool. */
export function scriptDeals(script: ScriptId | undefined): { random: boolean; storyline: boolean } {
  const s = script ?? 'trouble-brewing';
  return { random: s !== 'custom', storyline: s === 'trouble-brewing' };
}

export interface BagCheck {
  counts: TbCounts;
  /** Standard counts for n (Baron-adjusted when the bag holds the Baron); null outside 5-15. */
  want: TbCounts | null;
  /** Exactly the standard distribution. */
  standard: boolean;
  /** Blocking problems (the server would refuse the deal). */
  problems: string[];
  /** The bag is complete and dealable (maybe with "Allow a nonstandard distribution"). */
  ready: boolean;
}

export function checkBag(bag: readonly CharacterId[], n: number): BagCheck {
  const counts: TbCounts = { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 };
  for (const c of bag) {
    const t = CHARACTER_INFO[c].type;
    if (t === 'townsfolk') counts.townsfolk++;
    else if (t === 'outsider') counts.outsiders++;
    else if (t === 'minion') counts.minions++;
    else counts.demons++;
  }
  const want = tbCounts(n, bag.includes('baron'));
  const problems: string[] = [];
  if (!want) problems.push(`Trouble Brewing needs 5-15 players (there are ${n})`);
  if (bag.length !== n) problems.push(`Pick ${n} characters (${bag.length} so far)`);
  if (counts.demons !== 1) problems.push('Exactly one Demon');
  if (new Set(bag).size !== bag.length) problems.push('A character is in the bag twice');
  const standard = !!want && want.townsfolk === counts.townsfolk && want.outsiders === counts.outsiders && want.minions === counts.minions && want.demons === counts.demons;
  return { counts, want, standard, problems, ready: problems.length === 0 };
}

export function countsLine(c: TbCounts): string {
  return `${c.townsfolk} Townsfolk · ${c.outsiders} Outsider${c.outsiders === 1 ? '' : 's'} · ${c.minions} Minion${c.minions === 1 ? '' : 's'} · ${c.demons} Demon`;
}

// --------------------------------------------------------------------------------- practice

/** Same generator as the server's (mulberry32): a practice deal is reproducible from its seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** "Random" is the storyline with nothing preferred: the whole script. */
const RANDOM_DEF: StorylineDef = { id: 'classic-night', title: 'Random', blurb: '', level: 'standard', core: ['imp'], prefer: [], avoid: [] };

export interface PracticeDeal {
  storyline: StorylineId | null;
  /** Character per seat (seat = index). */
  bySeat: CharacterId[];
  drunkBelieves: CharacterId | null;
  redHerringSeat: number | null;
  bluffs: CharacterId[];
}

/**
 * A local fake deal for `n` seats (n clamped to 5-15 by the caller). Pure: same seed, same deal.
 * Like the server, chance never picks the Drunk: it is dealt only to `drunkSeat` (when the deal
 * has an Outsider for it), and a deal that does not name the Drunk leaves it out.
 */
export function practiceDeal(n: number, storyline: StorylineId | null, seed: number, drunkSeat?: number): PracticeDeal {
  const rng = seededRng(seed);
  const named = (storyline && storylineById(storyline)) || RANDOM_DEF;
  const ok = storylineProblem(named, n, CHARACTER_INFO) === null;
  const picked = ok ? named : RANDOM_DEF;
  const wantsDrunk = drunkSeat !== undefined && drunkSeat >= 0 && drunkSeat < n;
  const namesDrunk = [...picked.core, ...picked.prefer].includes('drunk');
  const withDrunk: StorylineDef = wantsDrunk && !namesDrunk ? { ...picked, prefer: ['drunk', ...picked.prefer] } : picked;
  const noDrunk: StorylineDef = { ...picked, avoid: [...picked.avoid, 'drunk'] };
  const def = wantsDrunk ? withDrunk : !namesDrunk && storylineProblem(noDrunk, n, CHARACTER_INFO) === null ? noDrunk : picked;
  const bag = buildStorylineBag(def, n, rng, CHARACTER_INFO);
  const bySeat = shuffled(rng, bag);
  // The Storyteller's Drunk sits where they chose (swap with whoever was dealt that seat).
  const at = bySeat.indexOf('drunk');
  if (wantsDrunk && at >= 0 && at !== drunkSeat) [bySeat[at], bySeat[drunkSeat]] = [bySeat[drunkSeat]!, 'drunk'];
  const notInPlay = (c: CharacterId) => !bag.includes(c);
  const drunkBelieves = bag.includes('drunk')
    ? ((def.drunkBelieves ?? []).find((c) => notInPlay(c)) ?? shuffled(rng, charactersOf('townsfolk').filter(notInPlay))[0]!)
    : null;
  const good = bySeat.map((c, seat) => ({ c, seat })).filter((x) => CHARACTER_INFO[x.c].alignment === 'good');
  const hasFt = bag.includes('fortune_teller') || drunkBelieves === 'fortune_teller';
  const redHerringSeat = hasFt && good.length ? good[Math.floor(rng() * good.length) % good.length]!.seat : null;
  const bluffs = shuffled(rng, [...charactersOf('townsfolk'), ...charactersOf('outsider')].filter((c) => c !== 'drunk' && notInPlay(c) && c !== drunkBelieves)).slice(0, 3);
  return { storyline: ok && storyline ? storyline : null, bySeat, drunkBelieves, redHerringSeat, bluffs };
}

/** Trouble Brewing night order (mirrors @ct/rules ROLES; a client test keeps them in sync). */
export const PRACTICE_FIRST_NIGHT: CharacterId[] = ['poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'butler', 'spy'];
export const PRACTICE_OTHER_NIGHT: CharacterId[] = ['poisoner', 'monk', 'imp', 'ravenkeeper', 'empath', 'fortune_teller', 'undertaker', 'butler', 'spy'];
const EVIL_INFO_MIN_PLAYERS = 7;

/** Sample townsfolk filling empty seats in practice (a small lobby still practises with 7 seats). */
const SAMPLE_NAMES = ['Agnes', 'Bartholomew', 'Constance', 'Dorian', 'Eliza', 'Fenwick', 'Gideon'];

export function practiceNames(lobbyNames: readonly string[]): string[] {
  const names = lobbyNames.slice(0, MAX_PLAYERS);
  for (const s of SAMPLE_NAMES) {
    if (names.length >= 7) break;
    if (!names.includes(s)) names.push(s);
  }
  return names;
}

export type PracticePhase = 'setup' | 'first_night' | 'day';

export interface PracticeState {
  phase: PracticePhase;
  deal: PracticeDeal | null;
  /** Night steps already ticked off (by id). */
  done: Record<string, 'resolved' | 'skipped'>;
  visitingSeat: number | null;
  /** What the last click would have done in a real game (shown in the banner). */
  note: string | null;
  seed: number;
  log: string[];
}

export function practiceStart(seed = 1): PracticeState {
  return { phase: 'setup', deal: null, done: {}, visitingSeat: null, note: null, seed, log: [] };
}

function nightSteps(deal: PracticeDeal, first: boolean): NightStepView[] {
  const steps: NightStepView[] = [{ id: 'p-dusk', seat: null, character: 'dusk', status: 'pending' }];
  if (first && deal.bySeat.length >= EVIL_INFO_MIN_PLAYERS) {
    steps.push({ id: 'p-minion', seat: null, character: 'minion_info', status: 'pending' }, { id: 'p-demon', seat: null, character: 'demon_info', status: 'pending' });
  }
  const order = first ? PRACTICE_FIRST_NIGHT : PRACTICE_OTHER_NIGHT;
  const seats = deal.bySeat
    .map((c, seat) => ({ seat, acting: c === 'drunk' ? deal.drunkBelieves! : c, impaired: c === 'drunk' }))
    .filter((x) => order.includes(x.acting) && (first || x.acting !== 'ravenkeeper'))
    .sort((a, b) => order.indexOf(a.acting) - order.indexOf(b.acting));
  for (const x of seats)
    steps.push({
      id: `p-${x.seat}`,
      seat: x.seat,
      character: x.acting,
      actingAs: x.acting,
      status: 'pending',
      ...(x.impaired ? { impaired: true } : {}),
      suggestion: 'Practice: in a real game the engine suggests what to show this player here.',
    });
  steps.push({ id: 'p-dawn', seat: null, character: 'dawn', status: 'pending' });
  return steps;
}

/** The fake Storyteller view the real panel renders in practice mode (public names + the local deal). */
export function practiceView(names: readonly string[], ps: PracticeState): StorytellerGameView {
  const players: PublicPlayerView[] = names.map((name, seat) => ({
    pid: `practice-${seat}`,
    seat,
    name,
    alive: true,
    ghostVoteAvailable: true,
    nominatedToday: false,
    wasNominatedToday: false,
    connected: true,
  }));
  const d = ps.deal;
  const grimoire: GrimoireEntry[] = d
    ? d.bySeat.map((c, seat) => ({
        seat,
        pid: `practice-${seat}`,
        name: names[seat] ?? `Seat ${seat + 1}`,
        character: c,
        believedCharacter: c === 'drunk' ? d.drunkBelieves! : c,
        alignment: CHARACTER_INFO[c].alignment,
        alive: true,
        ghostVoteAvailable: true,
        poisoned: false,
        drunk: c === 'drunk',
        protectedTonight: false,
        reminders: c === 'drunk' ? ['Is the Drunk'] : [],
        publicAlive: true,
        isRedHerring: d.redHerringSeat === seat,
      }))
    : [];
  const queue = d && ps.phase === 'first_night' ? nightSteps(d, true).map((s) => (ps.done[s.id] ? { ...s, status: ps.done[s.id]! } : s.seat !== null && s.seat === ps.visitingSeat ? { ...s, status: 'visiting' as const } : s)) : [];
  const counts = tbCounts(names.length, !!d && d.bySeat.includes('baron')) ?? { townsfolk: 0, outsiders: 0, minions: 0, demons: 1 };
  return {
    kind: 'storyteller',
    storytellerMode: 'human',
    clock: null,
    phase: ps.phase,
    dayNumber: ps.phase === 'day' ? 1 : 0,
    phaseEndsAt: null,
    players,
    grimoire,
    demonBluffs: d ? [...d.bluffs] : [],
    nightQueue: queue,
    day: ps.phase === 'day' ? { nominationsOpen: false, nominations: [], onTheBlock: null, executedSeat: null } : null,
    announcements: [],
    visitingSeat: ps.visitingSeat,
    travelSpeedMult: 1,
    alerts: [],
    log: ps.log.map((text, i) => ({ at: i, text })),
    result: null,
    bedtimeSeconds: 45,
    pendingDeaths: [],
    canUndo: false,
    undoLabel: null,
    setupCounts: counts,
    charactersAssigned: !!d,
    timerPaused: false,
    pendingResult: null,
    gathering: false,
    bedtimeOvertime: false,
    timerHeld: false,
    bedtimeRemainingMs: null,
    bedtimeFirstNight: false,
    stage: null,
    settings: { ...DEFAULT_ST_SETTINGS },
    deal: d ? (d.storyline ? { method: 'storyline', storyline: d.storyline } : { method: 'random' }) : null,
  };
}

const PRACTICE_NOTE = (what: string) => `Practice — in a real game this would ${what}. Nothing was sent.`;

/**
 * Apply a Storyteller command to the practice state (locally). Deals and phase changes are simulated;
 * every other command only explains what it would do. Never sends anything.
 */
export function practiceReduce(ps: PracticeState, names: readonly string[], cmd: StCommand): PracticeState {
  const n = names.length;
  const next: PracticeState = { ...ps, note: null };
  const say = (what: string) => ({ ...next, note: PRACTICE_NOTE(what) });
  const deal = (storyline: StorylineId | null, how: string, drunkSeat?: number): PracticeState => {
    if (ps.phase !== 'setup') return say('be refused: characters are dealt during setup');
    if (n < 5 || n > 15) return { ...next, note: `Practice needs 5-15 seats (there are ${n}).` };
    const seed = ps.seed + 1;
    const d = practiceDeal(n, storyline, seed, drunkSeat);
    return { ...next, seed, deal: d, log: [...ps.log, how], note: 'Practice deal — the players were told nothing.' };
  };
  switch (cmd.type) {
    case 'random_setup':
      return deal(null, 'Random characters assigned (practice)', cmd.drunkSeat);
    case 'deal_preset':
      return deal(cmd.storyline, `Storyline "${storylineTitle(cmd.storyline)}" dealt at random (practice)`, cmd.drunkSeat);
    case 'deal_bag':
    case 'assign_characters':
      return say('deal your own characters (the server shuffles a bag; "by hand" fixes every seat)');
    case 'begin_first_night':
    case 'advance_phase':
    case 'force_phase': {
      const to = cmd.type === 'begin_first_night' ? 'first_night' : cmd.to;
      if (!ps.deal) return say('be refused: deal the characters first');
      const phase: PracticePhase | null = to === 'first_night' || to === 'night' || to === 'bedtime' ? 'first_night' : to === 'day' || to === 'dawn' || to === 'gather' ? 'day' : to === 'setup' ? 'setup' : null;
      if (!phase) return say(`move the game to ${to}`);
      return { ...next, phase, visitingSeat: null, note: phase === 'first_night' && to === 'bedtime' ? PRACTICE_NOTE('ring the bell; everyone walks home and the first night falls') : null, log: [...ps.log, `Phase: ${phase.replace('_', ' ')} (practice)`] };
    }
    case 'resolve_step':
    case 'skip_step':
      return { ...next, done: { ...ps.done, [cmd.stepId]: cmd.type === 'resolve_step' ? 'resolved' : 'skipped' } };
    case 'visit_home':
      return { ...next, visitingSeat: cmd.seat, note: PRACTICE_NOTE(`take you into ${names[cmd.seat] ?? 'their'}'s home`) };
    case 'teleport_self':
      return { ...next, note: PRACTICE_NOTE('move you there (night: into the house, which counts as a visit)') };
    case 'leave_home':
      return { ...next, visitingSeat: null };
    case 'prompt_player':
      return say(`ask ${names[cmd.seat] ?? 'the player'}: "${cmd.prompt.title}"`);
    case 'send_info':
      return say(`tell ${names[cmd.seat] ?? 'the player'}: "${cmd.info.text}"`);
    default:
      return say(`send "${cmd.type.replace(/_/g, ' ')}"`);
  }
}
