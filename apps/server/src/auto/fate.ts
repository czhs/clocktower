// OWNED BY auto-st. "Fate": every Storyteller judgement call of an automatic game, decided RANDOMLY
// but LEGALLY with the game's seeded fate RNG (mulberry32; the seed is in the game record). Pure
// functions of (state, rng): no I/O, never mutate the state. The AutoStoryteller applies the result
// through ordinary engine commands (send_info / resolve_step / execute / kill / set_vote).
//
// Decision points (docs/auto-storyteller.md has the full table):
//   registration   healthy Spy may register as good / a Townsfolk / an Outsider; healthy Recluse may
//                  register as evil / a Minion / the Demon. Each ability use rolls REGISTRATION_CHANCE
//                  independently per player.
//   false info     a drunk or poisoned info character (incl. the Drunk) gets plausible info that
//                  differs from the truth whenever possible.
//   prompt answer  a prompt not answered in time gets a sensible random legal answer.
//   star-pass      the Imp chose themself: a random living Minion (engine: Scarlet Woman priority).
//   Mayor bounce   a healthy Mayor attacked by the Demon: MAYOR_BOUNCE_CHANCE that another random
//                  living player (not the Mayor, not the Demon) is attacked instead.
//   Virgin + Spy   a healthy Spy nominating a healthy Virgin registers as a Townsfolk with
//                  REGISTRATION_CHANCE (executed on the spot).
//   Slayer+Recluse a real healthy Slayer shooting a healthy Recluse: REGISTRATION_CHANCE they register
//                  as the Demon and die.
// Red herring, Drunk belief and demon bluffs are random at setup (engine random_setup, engine RNG).
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type CharacterType, type InfoSpecInput, type PromptView } from '@ct/protocol';
import type { GameState, NightStep, PlayerState, Rng } from '@ct/rules';

export const REGISTRATION_CHANCE = 0.5;
export const MAYOR_BOUNCE_CHANCE = 0.5;

const typeOf = (c: CharacterId): CharacterType => CHARACTER_INFO[c].type;
const nameOf = (c: CharacterId) => CHARACTER_INFO[c].name;
const isDrunk = (p: PlayerState) => p.character === 'drunk' || p.drunkOverride;
export const impaired = (p: PlayerState) => isDrunk(p) || p.poisonedBy !== null;
const healthy = (p: PlayerState) => !impaired(p);

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  if (!xs.length) throw new Error('pick from empty list');
  return xs[Math.floor(rng() * xs.length) % xs.length]!;
}

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const chance = (rng: Rng, p: number) => rng() < p;

function inPlay(s: GameState): Set<CharacterId> {
  return new Set(s.players.map((p) => p.character));
}

function charsOfType(t: CharacterType): CharacterId[] {
  return CHARACTER_IDS.filter((c) => typeOf(c) === t);
}

/** A character of type `t` for a misregistration: preferably one not in play (never the Drunk). */
function registrationChar(s: GameState, rng: Rng, t: CharacterType): CharacterId {
  const all = charsOfType(t).filter((c) => c !== 'drunk');
  const used = inPlay(s);
  const free = all.filter((c) => !used.has(c));
  return pick(rng, free.length ? free : all);
}

// ------------------------------------------------------------------------------- registration

/** How one player registers for ONE ability use (sampled once per info computation). */
export interface Registration {
  evil: boolean;
  type: CharacterType;
  character: CharacterId;
  /** Spy/Recluse registered differently from the truth. */
  mis: boolean;
}

export function registerAs(s: GameState, rng: Rng, p: PlayerState): Registration {
  const truth: Registration = { evil: p.alignment === 'evil', type: typeOf(p.character), character: p.character, mis: false };
  if (p.character === 'spy' && healthy(p) && chance(rng, REGISTRATION_CHANCE)) {
    const t: CharacterType = chance(rng, 0.5) ? 'townsfolk' : 'outsider';
    return { evil: false, type: t, character: registrationChar(s, rng, t), mis: true };
  }
  if (p.character === 'recluse' && healthy(p) && chance(rng, REGISTRATION_CHANCE)) {
    const t: CharacterType = chance(rng, 0.25) ? 'demon' : 'minion';
    return { evil: true, type: t, character: t === 'demon' ? 'imp' : registrationChar(s, rng, 'minion'), mis: true };
  }
  return truth;
}

function registrations(s: GameState, rng: Rng): Map<number, Registration> {
  return new Map(s.players.map((p) => [p.seat, registerAs(s, rng, p)]));
}

// ------------------------------------------------------------------------------- night info

const INFO_ROLES = new Set<CharacterId>(['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker', 'ravenkeeper']);
export const isInfoRole = (c: string): boolean => INFO_ROLES.has(c as CharacterId);

export interface InfoDecision {
  info: Omit<InfoSpecInput, 'stepId'>;
  /** Server-side explanation for the record (never sent to players). */
  why: string;
  /** False info for an impaired player. */
  falseInfo: boolean;
  /** Spy/Recluse misregistrations that shaped this info (seats). */
  misregistered: number[];
}

function sortedSeats(s: GameState): PlayerState[] {
  return [...s.players].sort((a, b) => a.seat - b.seat);
}

function livingNeighbours(s: GameState, p: PlayerState): PlayerState[] {
  const ring = sortedSeats(s);
  const i = ring.indexOf(p);
  const n = ring.length;
  let right: PlayerState | undefined;
  let left: PlayerState | undefined;
  for (let k = 1; k < n; k++) {
    const q = ring[(i + k) % n]!;
    if (q.alive) {
      right = q;
      break;
    }
  }
  for (let k = 1; k < n; k++) {
    const q = ring[(i - k + n) % n]!;
    if (q.alive) {
      left = q;
      break;
    }
  }
  const out: PlayerState[] = [];
  if (right) out.push(right);
  if (left && left !== right) out.push(left);
  return out;
}

const PAIR_TYPE: Partial<Record<CharacterId, CharacterType>> = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };
const NONE_TEXT: Partial<Record<CharacterId, string>> = {
  washerwoman: 'There are no other Townsfolk in play.',
  librarian: 'There are no Outsiders in play.',
  investigator: 'There are no Minions in play.',
};

const pairText = (a: PlayerState, b: PlayerState, c: CharacterId) => `One of ${a.name} or ${b.name} is the ${nameOf(c)}.`;
const chefText = (n: number) => `${n} pair${n === 1 ? '' : 's'} of evil players sit next to each other.`;
const empathText = (n: number) => `${n} of your living neighbours ${n === 1 ? 'is' : 'are'} evil.`;
const ftText = (yes: boolean) => (yes ? 'Yes — one of them is the Demon.' : 'No — neither of them is the Demon.');

/** Pick a number in [lo, hi] different from `truth` when the range allows it. */
function otherNumber(rng: Rng, lo: number, hi: number, truth: number): number {
  const opts: number[] = [];
  for (let x = lo; x <= hi; x++) if (x !== truth) opts.push(x);
  return opts.length ? pick(rng, opts) : truth;
}

function otherChar(rng: Rng, not: CharacterId[], pool: readonly CharacterId[] = CHARACTER_IDS): CharacterId {
  const opts = pool.filter((c) => !not.includes(c));
  return pick(rng, opts.length ? opts : pool);
}

/**
 * The info an info character receives tonight (`kind` = the character they act as; the Drunk acts
 * as their believed Townsfolk). `chosen` = their prompt answer (Fortune Teller / Ravenkeeper).
 */
export function decideInfo(s: GameState, rng: Rng, p: PlayerState, kind: CharacterId, chosen: number[] = []): InfoDecision {
  const bad = impaired(p) || kind !== p.character;
  const others = s.players.filter((q) => q !== p);
  const at = (seat: number) => s.players.find((q) => q.seat === seat);
  const pairType = PAIR_TYPE[kind];

  if (pairType) {
    if (bad) {
      // Two random other players + a character of the right type that neither of them is.
      const [a, b] = shuffle(rng, others).slice(0, 2) as [PlayerState, PlayerState];
      const c = otherChar(rng, [a.character, b.character], charsOfType(pairType).filter((x) => x !== 'drunk' || pairType !== 'townsfolk'));
      return { info: { text: pairText(a, b, c), seats: [a.seat, b.seat], characters: [c] }, why: `impaired: false pair ${a.name}/${b.name} as ${nameOf(c)}`, falseInfo: true, misregistered: [] };
    }
    const reg = registrations(s, rng);
    const holders = others.filter((q) => reg.get(q.seat)!.type === pairType);
    if (!holders.length) return { info: { text: NONE_TEXT[kind]!, number: 0 }, why: 'nobody registers as that type', falseInfo: false, misregistered: [] };
    const real = pick(rng, holders);
    const decoy = pick(rng, others.filter((q) => q !== real));
    const c = reg.get(real.seat)!.character;
    const [a, b] = shuffle(rng, [real, decoy]) as [PlayerState, PlayerState];
    const mis = reg.get(real.seat)!.mis ? [real.seat] : [];
    return { info: { text: pairText(a, b, c), seats: [a.seat, b.seat], characters: [c] }, why: `${real.name} registers as the ${nameOf(c)}; decoy ${decoy.name}`, falseInfo: false, misregistered: mis };
  }

  switch (kind) {
    case 'chef': {
      const ring = sortedSeats(s);
      const count = (evil: (q: PlayerState) => boolean) => {
        let n = 0;
        for (let i = 0; i < ring.length; i++) if (evil(ring[i]!) && evil(ring[(i + 1) % ring.length]!)) n++;
        return n;
      };
      const truth = count((q) => q.alignment === 'evil');
      if (bad) {
        const evilCount = s.players.filter((q) => q.alignment === 'evil').length;
        const n = otherNumber(rng, 0, Math.max(1, evilCount - 1), truth);
        return { info: { text: chefText(n), number: n }, why: `impaired: false number (truth ${truth})`, falseInfo: true, misregistered: [] };
      }
      const reg = registrations(s, rng);
      const n = count((q) => reg.get(q.seat)!.evil);
      const mis = s.players.filter((q) => reg.get(q.seat)!.mis).map((q) => q.seat);
      return { info: { text: chefText(n), number: n }, why: `${n} registered evil pair(s)`, falseInfo: false, misregistered: n === truth ? [] : mis };
    }
    case 'empath': {
      const nb = livingNeighbours(s, p);
      const truth = nb.filter((q) => q.alignment === 'evil').length;
      if (bad) {
        const n = otherNumber(rng, 0, nb.length, truth);
        return { info: { text: empathText(n), number: n }, why: `impaired: false number (truth ${truth})`, falseInfo: true, misregistered: [] };
      }
      const regs = nb.map((q) => registerAs(s, rng, q));
      const n = regs.filter((r) => r.evil).length;
      const mis = nb.filter((_, i) => regs[i]!.mis).map((q) => q.seat);
      return { info: { text: empathText(n), number: n }, why: `neighbours ${nb.map((q) => q.name).join(', ') || 'none'}`, falseInfo: false, misregistered: mis };
    }
    case 'fortune_teller': {
      const picks = chosen.map(at).filter((q): q is PlayerState => !!q);
      const truth = picks.some((q) => typeOf(q.character) === 'demon' || q.seat === s.redHerringSeat);
      if (bad) return { info: { text: ftText(!truth), yes: !truth, seats: picks.map((q) => q.seat) }, why: `impaired: false answer (truth ${truth ? 'yes' : 'no'})`, falseInfo: true, misregistered: [] };
      const regs = picks.map((q) => registerAs(s, rng, q));
      const yes = picks.some((q, i) => regs[i]!.type === 'demon' || q.seat === s.redHerringSeat);
      const mis = picks.filter((_, i) => regs[i]!.mis && regs[i]!.type === 'demon').map((q) => q.seat);
      const herring = picks.some((q) => q.seat === s.redHerringSeat);
      return { info: { text: ftText(yes), yes, seats: picks.map((q) => q.seat) }, why: `${yes ? 'yes' : 'no'}${herring ? ' (red herring)' : ''}`, falseInfo: false, misregistered: mis };
    }
    case 'undertaker':
    case 'ravenkeeper': {
      const target = kind === 'undertaker' ? (s.lastExecutedDiedSeat === null ? undefined : at(s.lastExecutedDiedSeat)) : picks0(chosen, at);
      if (!target) return { info: { text: kind === 'undertaker' ? 'Nobody died by execution today.' : 'You learn nothing.' }, why: 'no target', falseInfo: false, misregistered: [] };
      const text = (c: CharacterId) => (kind === 'undertaker' ? `The player executed today was the ${nameOf(c)}.` : `${target.name} is the ${nameOf(c)}.`);
      if (bad) {
        const c = otherChar(rng, [target.character]);
        return { info: { text: text(c), seats: [target.seat], characters: [c] }, why: `impaired: false character (truth ${nameOf(target.character)})`, falseInfo: true, misregistered: [] };
      }
      const r = registerAs(s, rng, target);
      return { info: { text: text(r.character), seats: [target.seat], characters: [r.character] }, why: `${target.name} registers as the ${nameOf(r.character)}`, falseInfo: false, misregistered: r.mis ? [target.seat] : [] };
    }
    default:
      return { info: { text: 'You learn nothing tonight.' }, why: `no info rule for ${kind}`, falseInfo: false, misregistered: [] };
  }
}

function picks0(chosen: number[], at: (seat: number) => PlayerState | undefined): PlayerState | undefined {
  return chosen.length ? at(chosen[0]!) : undefined;
}

// ------------------------------------------------------------------------------- prompt answers

/**
 * A sensible random LEGAL answer to an unanswered prompt. Within the prompt's limits it prefers
 * living players other than the chooser (a sleepy Imp kills a random living player, not themself).
 */
export function randomAnswer(s: GameState, rng: Rng, p: PlayerState, q: PromptView): { seats?: number[]; character?: CharacterId; yes?: boolean } {
  if (q.kind === 'choose_players') {
    const min = q.minTargets ?? 1;
    const max = q.maxTargets ?? min;
    const legal = s.players.filter((t) => (q.allowSelf !== false || t !== p) && (q.allowDead !== false || t.publicAlive));
    const preferred = legal.filter((t) => t !== p && t.publicAlive);
    const n = Math.max(min, Math.min(max, 1));
    const pool = preferred.length >= n ? preferred : legal;
    return { seats: shuffle(rng, pool).slice(0, n).map((t) => t.seat) };
  }
  if (q.kind === 'choose_character') return { character: pick(rng, q.characterOptions?.length ? q.characterOptions : CHARACTER_IDS) };
  if (q.kind === 'yes_no') return { yes: chance(rng, 0.5) };
  return {};
}

// ------------------------------------------------------------------------------- Demon

export interface ImpDecision {
  starpassSeat?: number;
  redirectSeat?: number;
  why: string | null;
}

/** Star-pass target / Mayor bounce for the Imp's step (given the answered target seat). */
export function decideImp(s: GameState, rng: Rng, imp: PlayerState, step: NightStep, input?: number[]): ImpDecision {
  const seat = (input ?? step.response?.seats)?.[0];
  const t = seat === undefined ? undefined : s.players.find((q) => q.seat === seat);
  if (!t || impaired(imp)) return { why: null };
  if (t === imp) {
    const minions = s.players.filter((q) => q.alive && typeOf(q.character) === 'minion');
    if (!minions.length) return { why: 'star-pass with no living Minion' };
    const m = pick(rng, minions);
    return { starpassSeat: m.seat, why: `star-pass: ${m.name} chosen among the living Minions (a healthy Scarlet Woman still has priority)` };
  }
  if (t.character === 'mayor' && healthy(t) && t.alive && !t.protectedTonight && chance(rng, MAYOR_BOUNCE_CHANCE)) {
    const pool = s.players.filter((q) => q.alive && q !== t && typeOf(q.character) !== 'demon');
    if (!pool.length) return { why: 'Mayor: nobody to bounce to' };
    const r = pick(rng, pool);
    return { redirectSeat: r.seat, why: `Mayor bounce: the kill goes to ${r.name}` };
  }
  if (t.character === 'mayor' && healthy(t) && t.alive && !t.protectedTonight) return { why: 'Mayor bounce: not this time' };
  return { why: null };
}

// ------------------------------------------------------------------------------- day

/** A healthy Spy nominated a healthy Virgin: does the Spy register as a Townsfolk (executed)? */
export function spyTriggersVirgin(rng: Rng): boolean {
  return chance(rng, REGISTRATION_CHANCE);
}

/** A real healthy Slayer shot a healthy Recluse: does the Recluse register as the Demon (dies)? */
export function recluseDiesToSlayer(rng: Rng): boolean {
  return chance(rng, REGISTRATION_CHANCE);
}
