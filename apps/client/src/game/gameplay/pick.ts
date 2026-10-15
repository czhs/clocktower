import { createStore } from '../../net/store';

// Storyteller "pick a point on the map" mode. A Storyteller panel sets this store; while it is
// non-null (and the viewer is the Storyteller) the next primary click on the town canvas calls
// onPick(worldX, worldY) with feet-px world coordinates and clears the store. Escape cancels
// (clears without calling onPick). While picking, the local avatar holds still.
export interface StagePick {
  /** Short hint drawn next to the crosshair, e.g. "Walk players here". */
  label: string;
  onPick(x: number, y: number): void;
}

export const stagePick = createStore<StagePick | null>(null);
