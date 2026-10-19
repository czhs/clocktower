// v3.3 sprites (default at the low / cpu tiers; ct.debug.v3sprites=0|1 forces). The vendor pieces a baked character
// sprite needs: the character look material (look.js characterMaterial: the SAME toon + look shader the rigs use, so
// a sprite is lit by the same code) and the rig's palette table. Only game3d/vendor/** imports '@pixel3d/*'.
import type * as THREE from 'three';
import * as lookMod from '@pixel3d/chars/look.js';
import * as rigMod from '@pixel3d/chars/rig.js';
import * as charMod from '@pixel3d/chars/character.js';
import * as roster from '@pixel3d/demo/roster.js';

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

const loadSpecFn = roster.loadSpec as (id: string) => Promise<{ spec: unknown }>;

/** The vendor spec object of a cast id (the vendor caches the module): a cached sheet needs spec.material / ghost. */
export async function loadSpecObject(id: string): Promise<{ material?: Record<string, unknown>; ghost?: unknown; clips?: Record<string, unknown> }> {
  return (await loadSpecFn(id)).spec as { material?: Record<string, unknown>; ghost?: unknown };
}

let vendorSrc: string | null = null;
/**
 * The vendor code a baked sheet depends on, as one string (the bake's persistent cache key hashes it with the spec):
 * the look material, the rig builder, the Character (poses, gait, IK), all module exports' sources. A vendor refresh
 * changes it, so stale cached sheets are never used (they age out of the bounded cache).
 */
export function vendorSource(): string {
  if (vendorSrc !== null) return vendorSrc;
  const parts: string[] = [];
  for (const mod of [lookMod, rigMod, charMod] as Record<string, unknown>[]) {
    for (const k of Object.keys(mod).sort()) {
      const v = mod[k];
      parts.push(k, typeof v === 'function' ? Function.prototype.toString.call(v) : String(v));
    }
  }
  vendorSrc = parts.join('\n');
  return vendorSrc;
}

/** A stable string of a spec for the cache key (functions by source; cycles / non-plain values skipped). */
export function specSource(spec: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(spec, (_k, v: unknown) => {
      if (typeof v === 'function') return Function.prototype.toString.call(v);
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[cycle]';
        seen.add(v);
        if ((v as { isObject3D?: boolean }).isObject3D || (v as { isMaterial?: boolean }).isMaterial || (v as { isTexture?: boolean }).isTexture) return '[three]';
      }
      return v;
    });
  } catch {
    return '';
  }
}
