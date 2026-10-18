// v3.3 sprites prototype (branch v33-sprites, behind ct.debug.v3sprites=1). The vendor pieces a baked character
// sprite needs: the character look material (look.js characterMaterial: the SAME toon + look shader the rigs use, so
// a sprite is lit by the same code) and the rig's palette table. Only game3d/vendor/** imports '@pixel3d/*'.
import type * as THREE from 'three';
import * as lookMod from '@pixel3d/chars/look.js';
import * as rigMod from '@pixel3d/chars/rig.js';

const characterMaterialFn = lookMod.characterMaterial as (engine: unknown, opts: Record<string, unknown>) => THREE.MeshLambertMaterial;
const partTableFn = lookMod.partTable as (g: THREE.BufferGeometry) => { pal: number[][]; m: number; unique: boolean } | null;
const ghostOptsFn = rigMod.ghostOpts as (g: unknown) => Record<string, unknown> | null;

/** look.js part-id quantum (2^-11) and modulus: the normal pass writes FLAG_CHAR + id * PART_STEP. */
export const PART_STEP = Number(lookMod.PART_STEP ?? '0.00048828125');

export interface SpriteLookSource {
  /** The vendor spec (spec.material, spec.ghost). */
  spec: { material?: Record<string, unknown>; ghost?: unknown };
  /** The rig's live top (ghost height), metres. */
  liveTop: number;
}

/**
 * A character look material with the rig's own options (spec.material + the shared ghost), for a non-skinned quad.
 * The sprite material (avatars/sprites/material.ts) patches its shader to read the per-pixel inputs from the atlas.
 */
export function spriteCharacterMaterial(engine: unknown, src: SpriteLookSource): THREE.MeshLambertMaterial {
  const G = src.spec.ghost ? ghostOptsFn(src.spec.ghost) : null;
  const opts: Record<string, unknown> = G ? { ...(src.spec.material ?? {}), ghost: G, ghostHaloBone: -1, ghostHeight: src.liveTop } : { ...(src.spec.material ?? {}) };
  return characterMaterialFn(engine, opts);
}

/** The palette (distinct mid tones, linear) of a rig geometry, in look.js slot order. */
export function paletteOf(geo: THREE.BufferGeometry): number[][] {
  return partTableFn(geo)?.pal ?? [];
}
