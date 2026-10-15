// Every sound file the client can play. Files live in apps/client/public/audio/** (served from our
// own origin, so the CSP allows them) as <path>.ogg (Opus) and <path>.m4a (AAC); sources and
// licences are listed in public/audio/CREDITS.md. Loudness is normalised per category by the
// offline pipeline (docs/audio.md), so the `gain` values here are mix decisions only.

export type BusName = 'sfx' | 'amb' | 'ui';

export interface ClipDef {
  /** Path under /audio/, without extension. With `variants`, files are `<path>-1 … <path>-N`. */
  path: string;
  bus: BusName;
  /** Linear mix gain (before bus volume). */
  gain: number;
  variants?: number;
  /**
   * Seamless loop baked by the pipeline: the file holds `pad` seconds of wrap-around audio on both
   * ends, so looping [pad, pad + period] is gapless whatever encoder delay the decoder adds.
   */
  loop?: { period: number; pad: number };
  /** Fetched as soon as audio unlocks (small one-shots). Loops are always lazy. */
  preload?: boolean;
  /** Max simultaneous voices of this clip; the oldest is cut first. */
  maxVoices?: number;
}

export const CLIPS = {
  // --- ambience loops (lazy: fetched only when the player is near the area) -----------------
  wind: { path: 'amb/wind', bus: 'amb', gain: 0.9, loop: { period: 24, pad: 0.1 } },
  crows: { path: 'amb/crows', bus: 'amb', gain: 0.55, loop: { period: 20, pad: 0.1 } },
  fountain: { path: 'amb/fountain', bus: 'amb', gain: 0.8, loop: { period: 7, pad: 0.1 } },
  tavern: { path: 'amb/tavern', bus: 'amb', gain: 0.75, loop: { period: 20, pad: 0.1 } },
  river: { path: 'amb/river', bus: 'amb', gain: 0.8, loop: { period: 16, pad: 0.1 } },
  crickets: { path: 'amb/crickets', bus: 'amb', gain: 0.6, loop: { period: 16, pad: 0.1 } },
  // --- sporadic night calls (ambience bus) --------------------------------------------------
  owl: { path: 'amb/owl', bus: 'amb', gain: 0.5, variants: 3, maxVoices: 1 },
  // --- footsteps ----------------------------------------------------------------------------
  'step-cobble': { path: 'step/cobble', bus: 'sfx', gain: 0.32, variants: 4, preload: true, maxVoices: 4 },
  'step-grass': { path: 'step/grass', bus: 'sfx', gain: 0.38, variants: 4, preload: true, maxVoices: 4 },
  'step-wood': { path: 'step/wood', bus: 'sfx', gain: 0.32, variants: 4, preload: true, maxVoices: 4 },
  'step-gravel': { path: 'step/gravel', bus: 'sfx', gain: 0.36, variants: 4, preload: true, maxVoices: 4 },
  // --- world / game ---------------------------------------------------------------------------
  door: { path: 'sfx/door', bus: 'sfx', gain: 0.6, preload: true, maxVoices: 2 },
  bell: { path: 'cue/bell', bus: 'sfx', gain: 0.75, preload: true, maxVoices: 1 },
  toll: { path: 'cue/toll', bus: 'sfx', gain: 0.75, preload: true, maxVoices: 1 },
  dawn: { path: 'cue/dawn', bus: 'sfx', gain: 0.7, preload: true, maxVoices: 1 },
  /** Soft: only ever played on the server's private `visit` cue (sent to the visited player only). */
  visit: { path: 'cue/visit', bus: 'sfx', gain: 0.55, preload: true, maxVoices: 1 },
  gavel: { path: 'sfx/gavel', bus: 'sfx', gain: 0.7, preload: true, maxVoices: 1 },
  ghost: { path: 'sfx/ghost', bus: 'sfx', gain: 0.6, preload: true, maxVoices: 1 },
  tick: { path: 'sfx/tick', bus: 'sfx', gain: 0.5, preload: true, maxVoices: 3 },
  'tick-yes': { path: 'sfx/tick-yes', bus: 'sfx', gain: 0.45, preload: true, maxVoices: 3 },
  // --- UI -------------------------------------------------------------------------------------
  click: { path: 'ui/click', bus: 'ui', gain: 0.5, preload: true, maxVoices: 2 },
} as const satisfies Record<string, ClipDef>;

export type ClipId = keyof typeof CLIPS;
export type LoopId = { [K in ClipId]: (typeof CLIPS)[K] extends { loop: object } ? K : never }[ClipId];
export const LOOP_IDS = (Object.keys(CLIPS) as ClipId[]).filter((k) => 'loop' in CLIPS[k]) as LoopId[];

export function clipDef(id: ClipId): ClipDef {
  return CLIPS[id];
}

/** File path (no extension) of one variant (1-based) of a clip. */
export function clipFile(id: ClipId, variant = 1): string {
  const d = clipDef(id);
  return d.variants ? `${d.path}-${Math.min(d.variants, Math.max(1, variant))}` : d.path;
}
