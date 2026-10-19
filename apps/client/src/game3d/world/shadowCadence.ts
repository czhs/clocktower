// v3 perf(stage). Sun shadow-map refresh cadence per tier (docs/perf-v3/stage.md). Pure: no three, no vendor.
//
// The pipeline renders the sun's shadow map once per frame (PixelPipeline shadowOnce: `renderer.shadowMap.autoUpdate`
// true -> one render in the first scene render of the frame). At `low` the stage refreshes it every 2nd frame
// instead: three keeps the light's shadow matrix of the frame the map was rendered in, so a skipped frame samples a
// map that is consistent with itself (moving casters' shadows update at 30 Hz at 60 fps). Never skipped:
//   - before the stage is ready (warm-up, first frames),
//   - the frame the drawn location changes (town <-> a room 200 m east: a stale map would be the other place's),
//   - a camera cut (target moved more than CUT_M, or the view height changed by more than 2 %): the shadow
//     camera follows the view, and a stale map would leave the newly shown area unshadowed for a frame.
// `ct.debug.v3shadowEvery` = 1 / 2 / 3 overrides the tier default (an A/B switch for perf runs; read once per build).

export type ShadowTier = 'high' | 'low';

/** Refresh every Nth frame per tier (1 = every frame, the vendor default). */
export const SHADOW_EVERY: Readonly<Record<ShadowTier, number>> = { high: 1, low: 2 };
/** A camera target jump larger than this (m) in one frame is a cut. */
export const CUT_M = 1.5;

export interface ShadowCadenceInput {
  ready: boolean;
  /** The drawn location ('outdoors' or a room id). */
  location: string;
  /** Camera target (m) and view height this frame. */
  x: number;
  z: number;
  viewHeight: number;
}

export interface ShadowCadence {
  /** Per frame, before the render: true = render the shadow map this frame. */
  step(i: ShadowCadenceInput): boolean;
  readonly every: number;
  readonly rendered: number;
  readonly skipped: number;
}

/**
 * The cadence for a tier (any other tier name, e.g. a future software-GL 'cpu' tier, renders every frame until it is
 * listed in SHADOW_EVERY), or the debug override (1..4).
 */
export function shadowEveryFor(tier: string, override?: string | null): number {
  const n = Number(override);
  if (override != null && override !== '' && Number.isInteger(n) && n >= 1 && n <= 4) return n;
  return (SHADOW_EVERY as Readonly<Record<string, number>>)[tier] ?? 1;
}

export function createShadowCadence(every: number): ShadowCadence {
  const n = Math.max(1, Math.floor(every) || 1);
  let k = 0;
  let loc: string | null = null;
  let px = NaN;
  let pz = NaN;
  let pvh = NaN;
  let rendered = 0;
  let skipped = 0;
  return {
    every: n,
    get rendered() {
      return rendered;
    },
    get skipped() {
      return skipped;
    },
    step(i) {
      const cut = !(Math.abs(i.x - px) + Math.abs(i.z - pz) <= CUT_M) || !(Math.abs(i.viewHeight - pvh) <= 0.02 * Math.max(1e-6, Math.abs(pvh)));
      const force = n === 1 || !i.ready || i.location !== loc || cut;
      loc = i.location;
      px = i.x;
      pz = i.z;
      pvh = i.viewHeight;
      const on = force || k % n === 0;
      k = on ? 1 : k + 1;
      if (on) rendered++;
      else skipped++;
      return on;
    },
  };
}
