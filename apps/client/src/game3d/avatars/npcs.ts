// v3 WP2 (v3-avatars). Cosmetic townsfolk in the 3D town (docs/v3/INTEGRATION.md §3 "NPCs"): the v2 roamer
// (game/npcRoaming.ts createNpcRoamer / stepNpcRoamer, INCLUDING its Brianbi avoidance) on the world's NPC homes
// (v3: @ct/assets/hollowmere npcHomesV3, re-checked against the Hollowmere collision by the exporter). Pure: no
// three (avatars.npcs.test.ts); the layer draws each one with its `npc-*` spec.
//
// Rules (v2 TownScene stepAmbience, plus the user request of 2026-10-17 "no NPCs in the voting circle"):
//   - daytime only (waiting / setup / day / finished), outdoors only, never collide, no names;
//   - they react only to Brianbi avatars drawn outdoors for this viewer (hidden / indoor / night players can never
//     move an NPC or reveal themselves);
//   - v3 worlds: no NPC ever stands or walks inside the town square (`inSquare`, the voting circle and its ring);
//   - low tier: only the first LOW_TIER_AMBIENCE.townsfolk of them.
import { inSquare, isBlockedPx, locationAt, type TilePoint, type TownLayout, type WorldId } from '@ct/protocol';
import { createNpcRoamer, stepNpcRoamer, type NpcPoint, type NpcRoamer } from '../../game/npcRoaming';
import { nearestFree, segmentClear } from '../../game/path';

/** v2 homes (TownScene.ts createAmbience `homes`, tiles). */
export const NPC_HOMES_V2: Readonly<Record<string, TilePoint>> = {
  'npc-sweeper': { x: 16, y: 12 },
  'npc-vendor': { x: 10, y: 17 },
  'npc-elder': { x: 10, y: 21 },
  'npc-porter': { x: 22, y: 34 },
};

/** Phases with daytime life on the square (TownScene DAYLIKE). */
export const DAYLIKE: ReadonlySet<string> = new Set(['waiting', 'setup', 'day', 'finished']);

export interface Npc extends NpcRoamer {
  id: string;
  /** Last step's displacement (px), for the facing / walk. */
  dx: number;
  dy: number;
}

export interface NpcFolk {
  readonly list: readonly Npc[];
  /** Advance every active NPC (the first `active`); returns nothing, NPCs move in place. */
  step(dt: number, nowMs: number, brianbis: readonly NpcPoint[], active: number): void;
}

/** The tile feet point of a home (v2 TownScene T(x, y) = (x·TS + 8, y·TS + 14)). */
function homePx(layout: TownLayout, t: TilePoint): NpcPoint {
  return { x: t.x * layout.tileSize + 8, y: t.y * layout.tileSize + 14 };
}

/** Where an NPC may step: outdoors, an unblocked straight segment, and (v3) never into the town square. */
export function npcClear(layout: TownLayout, world: WorldId): (from: NpcPoint, to: NpcPoint) => boolean {
  const noSquare = world === 'v3';
  return (from, to) => locationAt(layout, to.x, to.y) === 'outdoors' && segmentClear(layout, from.x, from.y, to.x, to.y) && !(noSquare && inSquare(layout, to.x, to.y));
}

/** Build the folk on `homes` (ids sorted for a stable order; homes without a free outdoor spot are skipped). */
export function createNpcFolk(layout: TownLayout, world: WorldId, homes: Readonly<Record<string, TilePoint>>): NpcFolk {
  const clear = npcClear(layout, world);
  const okSpot = (x: number, y: number) => locationAt(layout, x, y) === 'outdoors' && !isBlockedPx(layout, x, y) && !(world === 'v3' && inSquare(layout, x, y));
  const list: Npc[] = [];
  for (const id of Object.keys(homes).sort()) {
    const p = nearestFree(layout, homePx(layout, homes[id]!), 40, okSpot);
    if (!p) continue;
    list.push({ id, ...createNpcRoamer(p, list.length), dx: 0, dy: 0 });
  }
  const delta: NpcPoint = { x: 0, y: 0 };
  return {
    list,
    step(dt, nowMs, brianbis, active) {
      for (let i = 0; i < list.length; i++) {
        const n = list[i]!;
        if (i >= active) {
          n.dx = n.dy = 0;
          continue;
        }
        stepNpcRoamer(n, dt, nowMs, brianbis, clear, delta);
        n.dx = delta.x;
        n.dy = delta.y;
      }
    },
  };
}

/** The world's NPC homes: v3 = the exported Hollowmere homes (lazy chunk, already loaded before mount), v2 = TownScene's. */
export async function npcHomesFor(world: WorldId): Promise<Readonly<Record<string, TilePoint>>> {
  if (world !== 'v3') return NPC_HOMES_V2;
  const m = await import('@ct/assets/hollowmere');
  return m.npcHomesV3;
}
