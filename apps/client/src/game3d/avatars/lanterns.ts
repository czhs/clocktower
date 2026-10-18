// v3 WP2 (v3-avatars). Carried lanterns (docs/v3/INTEGRATION.md §3 "Carried lanterns"): the lantern cast (moth)
// and the Storyteller carry a light at night. The light is never added: it is BORROWED from the town's constant
// light pool (WP3, `borrowLight`), re-aimed at the lantern every frame, so the light count and the programs
// never change. The prop itself is the rig's own lantern (storyteller / moth model one) or a small box on the
// hand of a stand-in (rigBody.ts).
//
// The pool contract (WP3, world/lights.ts + world/stage.ts `borrowLight`; structurally the same shape):
//   borrowLight(anchor, opts?) -> lease | null   null = every reserve light is lent out (the lantern stays dark;
//                                                 retried on later frames)
//   anchor() -> {x, y, z} | null                  the light position (world m) this frame; null = parked / dark
//   lease.release()                               the light goes back to the reserve
export interface LightLease {
  release(): void;
}
export type LightAnchorFn = () => { x: number; y: number; z: number } | null;
export interface LightPool {
  borrowLight(anchor: LightAnchorFn, opts?: { color?: number | string; intensity?: number; distance?: number; always?: boolean }): LightLease | null;
}

/** The town is dark for lanterns (§5 night rule): hour ≥ 19:45 or < 06:15. */
export function lanternHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 19.75 || h < 6.25;
}

/** One avatar's lease, held only while it should shine. */
export interface LanternSlot {
  lease: LightLease | null;
}

/**
 * Hold or drop a lease: shine = night && the avatar carries one && it is drawn in the viewer's location. A
 * refused borrow (pool exhausted) is retried on later frames.
 */
export function syncLantern(slot: LanternSlot, pool: LightPool | null | undefined, shine: boolean, anchor: LightAnchorFn): void {
  if (!shine || !pool) {
    if (slot.lease) {
      slot.lease.release();
      slot.lease = null;
    }
    return;
  }
  if (!slot.lease) slot.lease = pool.borrowLight(anchor);
}
