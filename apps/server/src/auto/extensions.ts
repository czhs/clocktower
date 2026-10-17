// OWNED BY auto-st. Town-clock extension proposals (automatic games only). Pure logic, no I/O.
//
// RULE (documented in docs/auto-storyteller.md):
//   * Any seated player (alive or dead) may propose +1..+10 minutes while a 'discussion' or
//     'nominations' clock runs. One open proposal at a time. The proposer votes yes automatically.
//   * Limits per player: one proposal per 60 s and at most 3 per day. Per day the town may add at
//     most +20 minutes in total (a proposal that would exceed what is left is refused).
//   * Every seated player (alive or dead) may vote once (a vote can be changed while it is open).
//     Eligible voters = seated players who are connected, plus anyone who already voted.
//   * It PASSES at once when yes > half of the eligible voters ("needed" in the view). It FAILS at
//     once when it can no longer pass (no ≥ half of the eligible voters). After 30 s it is decided
//     on the votes cast: it passes if at least half of the eligible voters voted and yes > no;
//     otherwise it fails (silence is not consent, a tie fails).
//   * A passed proposal adds its minutes to the CURRENT stage. While a proposal is open, a stage that
//     reaches zero waits for it (≤ 30 s).
import type { ClockProposalView } from '@ct/protocol';

export const EXTENSION_RULES = {
  windowMs: 30_000,
  perPlayerCooldownMs: 60_000,
  perPlayerPerDay: 3,
  maxMinutesPerDay: 20,
} as const;

export interface Proposal {
  id: string;
  by: string;
  minutes: number;
  openedAt: number;
  closesAt: number;
  yes: Set<string>;
  no: Set<string>;
}

export interface ProposeError {
  code: 'invalid' | 'rate_limited';
  message: string;
}

export type Decision = { outcome: 'passed' | 'failed'; proposal: Proposal; yes: number; no: number; eligible: number; why: string };

/** Strict majority of `n`. */
export const majorityOf = (n: number) => Math.floor(n / 2) + 1;

export class ExtensionBallot {
  proposal: Proposal | null = null;
  day = -1;
  /** Minutes added today by passed proposals. */
  addedToday = 0;
  private seq = 0;
  private perPlayer = new Map<string, { count: number; lastAt: number }>();

  constructor(private rules: { windowMs: number; perPlayerCooldownMs: number; perPlayerPerDay: number; maxMinutesPerDay: number } = EXTENSION_RULES) {}

  resetDay(day: number): void {
    this.day = day;
    this.addedToday = 0;
    this.proposal = null;
    this.perPlayer.clear();
  }

  /** Close the open proposal without a decision (the stage / day ended). */
  cancel(): Proposal | null {
    const p = this.proposal;
    this.proposal = null;
    return p;
  }

  /** Returns an error, or null (proposal opened). */
  propose(pid: string, minutes: number, now: number): ProposeError | null {
    if (this.proposal) return { code: 'invalid', message: 'Another extension vote is already open' };
    const left = this.rules.maxMinutesPerDay - this.addedToday;
    if (left <= 0) return { code: 'invalid', message: `The clock has already been extended by ${this.rules.maxMinutesPerDay} minutes today` };
    if (minutes > left) return { code: 'invalid', message: `At most ${left} more minute${left === 1 ? '' : 's'} can be added today` };
    const mine = this.perPlayer.get(pid) ?? { count: 0, lastAt: -Infinity };
    if (mine.count >= this.rules.perPlayerPerDay) return { code: 'rate_limited', message: `You can propose at most ${this.rules.perPlayerPerDay} extensions per day` };
    const wait = mine.lastAt + this.rules.perPlayerCooldownMs - now;
    if (wait > 0) return { code: 'rate_limited', message: `Wait ${Math.ceil(wait / 1000)} s before proposing again` };
    this.perPlayer.set(pid, { count: mine.count + 1, lastAt: now });
    this.seq += 1;
    this.proposal = {
      id: `x${this.day}-${this.seq}`,
      by: pid,
      minutes,
      openedAt: now,
      closesAt: now + this.rules.windowMs,
      yes: new Set([pid]),
      no: new Set(),
    };
    return null;
  }

  /** Returns an error message, or null. */
  vote(pid: string, id: string, yes: boolean): string | null {
    const p = this.proposal;
    if (!p || p.id !== id) return 'That extension vote is closed';
    p.yes.delete(pid);
    p.no.delete(pid);
    (yes ? p.yes : p.no).add(pid);
    return null;
  }

  /** Eligible voter count: connected seated players ∪ anyone who already voted. */
  eligibleCount(connected: Iterable<string>): number {
    const all = new Set(connected);
    if (this.proposal) for (const v of [...this.proposal.yes, ...this.proposal.no]) all.add(v);
    return all.size;
  }

  /** Decide the open proposal if the rule allows it now (passed / failed), else null. */
  evaluate(now: number, connected: Iterable<string>): Decision | null {
    const p = this.proposal;
    if (!p) return null;
    const e = this.eligibleCount(connected);
    const yes = p.yes.size;
    const no = p.no.size;
    const need = majorityOf(e);
    let d: Decision | null = null;
    if (yes >= need) d = { outcome: 'passed', proposal: p, yes, no, eligible: e, why: 'a majority of the town voted yes' };
    else if (no * 2 >= e) d = { outcome: 'failed', proposal: p, yes, no, eligible: e, why: 'half of the town voted no' };
    else if (now >= p.closesAt) {
      const quorum = (yes + no) * 2 >= e;
      d = quorum && yes > no
        ? { outcome: 'passed', proposal: p, yes, no, eligible: e, why: 'more yes than no votes' }
        : { outcome: 'failed', proposal: p, yes, no, eligible: e, why: quorum ? 'not more yes than no votes' : 'too few votes' };
    }
    if (!d) return null;
    this.proposal = null;
    if (d.outcome === 'passed') this.addedToday += p.minutes;
    return d;
  }

  /** Push every running deadline later (the game was on hold). */
  shift(ms: number): void {
    if (this.proposal) this.proposal.closesAt += ms;
    for (const v of this.perPlayer.values()) v.lastAt += ms;
  }

  view(connected: Iterable<string>): ClockProposalView | null {
    const p = this.proposal;
    if (!p) return null;
    return {
      id: p.id,
      by: p.by,
      minutes: p.minutes,
      closesAt: p.closesAt,
      yes: [...p.yes].sort(),
      no: [...p.no].sort(),
      needed: majorityOf(this.eligibleCount(connected)),
    };
  }
}
