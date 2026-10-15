import type { PlayerGameView, StorytellerGameView } from '@ct/protocol';

// Game-event sounds derived from PUBLIC parts of the game view only:
//   - vote ticks: the clock hand filling `day.nominations[].votes` (public, like real hands);
//   - gavel: a new public 'execution' announcement;
//   - ghost: a player's public `alive` flag turning false (deaths are published at dawn/day).
// Private fields (prompts, info, storytellerVisitingYou, grimoire…) are never read here.

export type GameCue = 'tick' | 'tick-yes' | 'gavel' | 'ghost';
export interface TimedCue {
  cue: GameCue;
  /** Seconds from now. */
  delay: number;
}

type View = PlayerGameView | StorytellerGameView;

export class GameCueTracker {
  private seeded = false;
  private announcements = new Set<string>();
  private votes = new Map<string, Set<number>>();
  private alive = new Map<string, boolean>();

  /** Feed every new game view; returns the sounds to play. The first view only seeds state. */
  next(view: View | null): TimedCue[] {
    if (!view) {
      this.reset();
      return [];
    }
    const out: TimedCue[] = [];
    const seed = !this.seeded;
    this.seeded = true;

    // Vote ticks (several at once after a lag are staggered, at most 4).
    let ticks = 0;
    const live = new Set<string>();
    for (const n of view.day?.nominations ?? []) {
      live.add(n.id);
      let seen = this.votes.get(n.id);
      if (!seen) this.votes.set(n.id, (seen = new Set()));
      for (const [k, v] of Object.entries(n.votes)) {
        const seat = Number(k);
        if (seen.has(seat)) continue;
        seen.add(seat);
        if (!seed && ticks < 4) out.push({ cue: v ? 'tick-yes' : 'tick', delay: 0.12 * ticks++ });
      }
    }
    for (const id of this.votes.keys()) if (!live.has(id)) this.votes.delete(id);

    // Gavel on a public execution announcement.
    let gavel = false;
    for (const a of view.announcements) {
      if (this.announcements.has(a.id)) continue;
      this.announcements.add(a.id);
      if (!seed && a.kind === 'execution') gavel = true;
    }
    if (gavel) out.push({ cue: 'gavel', delay: 0 });

    // Ghostly sound once when anyone becomes publicly dead (after the gavel / toll).
    let died = false;
    for (const p of view.players) {
      const was = this.alive.get(p.pid);
      if (was === true && !p.alive) died = true;
      this.alive.set(p.pid, p.alive);
    }
    if (died && !seed) out.push({ cue: 'ghost', delay: gavel ? 1.6 : 1.2 });
    return out;
  }

  reset(): void {
    this.seeded = false;
    this.announcements.clear();
    this.votes.clear();
    this.alive.clear();
  }
}
