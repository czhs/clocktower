// v3 WP2 (v3-avatars). Which 3D body draws a v2 cast id (docs/v3/INTEGRATION.md §4 "Mapping", "Ghosts").
// Pure: no three, no '@pixel3d/' (unit tested in apps/client/test/game3d/avatars.castMap.test.ts, which also
// imports every vendor spec and checks the probe below against GHOST_BASELINE).
//
//   castMap(id, caps?) -> { spec, fallback, ghost }
//     spec      the pixel3d spec id to build (v3/pixel3d/characters/<spec>.js), null = no rig
//     fallback  'billboard' (a flat v2-sprite quad), 'standin' (the `wanderer` rig, tinted), or null
//     ghost     how a dead player of this cast looks (see GhostMode); from the spec's capability probe
//               (`caps`, read after loadSpec) when known, else the vendor-baseline table
//
// Ghost modes (probe = specCaps(spec)):
//   'shared'  spec.ghost present: the vendor's shared ghost look (Character.ghost = 1 | 2), walking and idle
//   'clips'   own `ghost` / `ghost-spent` loop clips but no spec.ghost: loop clips replace idle only, so a
//             walking ghost would look alive -> hold the clip and slide in that pose (+ tint at 50 %)
//   'tint'    neither: our material wrapper (ghostTint.ts: pale ramp, dithered alpha 0.6, 0.15 m hover)
import { CAST } from '@ct/assets';

export type GhostMode = 'shared' | 'clips' | 'tint';
export type BodyFallback = 'billboard' | 'standin';

export interface CastBody {
  spec: string | null;
  fallback: BodyFallback | null;
  ghost: GhostMode;
}

/** What WP2 reads from a loaded pixel3d spec (vendor/characters.ts specCapsOf). */
export interface SpecCaps {
  /** spec.ghost (the shared ghost block) is present. */
  ghost: boolean;
  /** spec.ghost.hover (m): the shared ghost's lift while standing (0 without spec.ghost). */
  ghostHover?: number;
  /** The shared ghost's halo lift above the head at level 1 (m; rig.js ghostOpts default 0.12; 0 = no halo). */
  ghostHalo?: number;
  /** Names of spec.clips. */
  clips: readonly string[];
  /** spec.height (m), when set. */
  height?: number;
  /** spec.lights count (each one is a PointLight the vendor Character would add: we suppress them). */
  lights: number;
}

/** The stand-in rig for unknown ids and failed builds. */
export const STANDIN_SPEC = 'wanderer';

/**
 * v2 cast ids drawn as flat v2-sprite billboards (Q3 lead default: keep them, still pickable).
 * nicksong: the 3D spec is a user-skipped WIP; brianbi: photo-real v2 HD import, no 3D spec at all.
 */
export const BILLBOARD_IDS: ReadonlySet<string> = new Set(['nicksong', 'brianbi']);

/**
 * pixel3d spec modules present in v3/pixel3d/characters (vendor baseline, 2026-10-17): the 32 cast specs
 * other than brianbi, plus wanderer, keeper, hound, duelist, mannequin. The castMap test asserts this list
 * equals the directory.
 */
export const SPEC_IDS: ReadonlySet<string> = new Set([
  'chonk', 'cilantro', 'clarabelle', 'crow', 'duelist', 'fox', 'frog', 'goat', 'green-hood', 'greenting', 'honk', 'hound',
  'keeper', 'mannequin', 'maxflow', 'mincut', 'mole', 'moth', 'mushroom', 'nicksong', 'npc-elder', 'npc-porter',
  'npc-sweeper', 'npc-vendor', 'opal', 'owl', 'polly', 'preservation', 'progress', 'rabbit', 'requin', 'skeleton-chef',
  'snail', 'storyteller', 'theo-rem', 'toad', 'wanderer',
]);

/**
 * The ghost probe of every spec at the vendor baseline (measured by importing each spec, 2026-10-17). Used
 * before a spec has loaded; the runtime always prefers the live probe. The contract's original table (§4,
 * revision 2) predates the vendor's wave-3 ghost work; this is the measured state (decision log, §11).
 */
export const GHOST_BASELINE: Readonly<Record<string, GhostMode>> = {
  // spec.ghost (shared)
  cilantro: 'shared', clarabelle: 'shared', greenting: 'shared', maxflow: 'shared', mincut: 'shared', opal: 'shared',
  preservation: 'shared', progress: 'shared', requin: 'shared', 'theo-rem': 'shared',
  'npc-elder': 'shared', 'npc-porter': 'shared', 'npc-sweeper': 'shared', 'npc-vendor': 'shared',
  // own ghost / ghost-spent loop clips, no spec.ghost
  chonk: 'clips', crow: 'clips', fox: 'clips', frog: 'clips', goat: 'clips', 'green-hood': 'clips', honk: 'clips',
  mole: 'clips', moth: 'clips', mushroom: 'clips', owl: 'clips', polly: 'clips', rabbit: 'clips',
  'skeleton-chef': 'clips', snail: 'clips', toad: 'clips',
  // neither
  storyteller: 'tint', wanderer: 'tint', nicksong: 'tint', keeper: 'tint', hound: 'tint', duelist: 'tint', mannequin: 'tint',
};

/** The capability probe: how a dead player of this spec is drawn. */
export function ghostModeOf(caps: Pick<SpecCaps, 'ghost' | 'clips'>): GhostMode {
  if (caps.ghost) return 'shared';
  if (caps.clips.includes('ghost')) return 'clips';
  return 'tint';
}

/** Every v2 cast id (packages/assets/src/cast.ts, 33 entries). */
export const CAST_IDS: readonly string[] = CAST.map((c) => c.id);
const CAST_SET: ReadonlySet<string> = new Set(CAST_IDS);

/** v2 cast id -> 3D body. `caps` = the probe of the loaded spec (castMap(id).spec), when known. */
export function castMap(id: string, caps?: Pick<SpecCaps, 'ghost' | 'clips'> | null): CastBody {
  if (BILLBOARD_IDS.has(id)) return { spec: null, fallback: 'billboard', ghost: 'tint' };
  if (CAST_SET.has(id) && SPEC_IDS.has(id)) return { spec: id, fallback: null, ghost: caps ? ghostModeOf(caps) : (GHOST_BASELINE[id] ?? 'tint') };
  // unknown id (or a cast id whose spec vanished in a re-publish): the tinted stand-in
  return { spec: null, fallback: 'standin', ghost: caps ? ghostModeOf(caps) : (GHOST_BASELINE[STANDIN_SPEC] ?? 'tint') };
}

/** Carries a lantern (v2 CastMember.lantern: moth; the Storyteller always). */
export function carriesLantern(id: string): boolean {
  return id === 'storyteller' || !!CAST.find((c) => c.id === id)?.lantern;
}

/** The pin colours (packages/protocol PIN_COLORS order) as fill hex, for the stand-in tint. */
const PIN_FILLS = ['#e2b13c', '#c8343f', '#8a5ad0', '#2fa6a0', '#5aa83c', '#e57a2a', '#e8e4dc', '#2c2834'] as const;

/**
 * A member's stand-in tint: the pin colour the member is most likely to use. The member's own pin colour is a
 * per-device preference that never reaches other clients, so this is a stable hash of the pid over the pin
 * palette (game/social/logic.ts PIN_HEX fills; the same colour on every client).
 */
export function standinTint(pid: string): string {
  let h = 0;
  for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PIN_FILLS[h % PIN_FILLS.length]!;
}

/** The v2 rule for unknown / legacy presets (game/rules/cast.ts castIdentity): a stable playable id per pid. */
export function fallbackCastId(pid: string): string {
  const playable = CAST.filter((c) => c.kind === 'villager' || c.kind === 'mascot');
  let h = 0;
  for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return playable[h % playable.length]!.id;
}
