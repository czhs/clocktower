// v3 WP0 stub (v3-lead) — OWNED BY WP2 (v3-avatars) from C0b: replace freely. The typed wrapper over
// pixel3d's runtime character handle (src/demo/characters.js createCharacter). Always passes an explicit
// `ground` (the handle otherwise looks it up through window.__demo) and never calls listCharacters()
// (it spawns demo NPCs). The stub renderer uses it for the local 'wanderer'.
import * as THREE from 'three';
import { createCharacter, type Pixel3dCharacterHandle } from '@pixel3d/demo/characters.js';

export type CharacterHandle = Pixel3dCharacterHandle;

export interface SpawnOptions {
  /** Feet position (m); Y is taken from the ground. */
  x: number;
  z: number;
  /** pixel3d yaw (0 = facing +Z / south). */
  face?: number;
  heightAt(x: number, z: number): number;
  /** Low tier: no FX motes, no smears. */
  lite?: boolean;
}

export async function spawnCharacter(engine: unknown, id: string, o: SpawnOptions): Promise<CharacterHandle> {
  const h = await createCharacter(engine, id, {
    position: new THREE.Vector3(o.x, o.heightAt(o.x, o.z), o.z),
    face: o.face ?? 0,
    ground: { heightAt: (x, z) => o.heightAt(x, z) },
    fx: !o.lite,
    smears: !o.lite,
  });
  return h;
}

/**
 * Drive a handle along a recorded track. The Character samples drive(t) at its own fixed simulation
 * steps (and re-samples the past on a re-simulation), so the track keeps timed samples (ENGINE time) and
 * interpolates between them; facing and the gait (walk / run / idle) follow from the velocity (the
 * vendor's LegGait): we never pick a locomotion clip.
 */
export interface Track {
  /** Record the feet position (m) at engine time t (call once per frame, t increasing). */
  push(t: number, x: number, z: number): void;
  /** Forget the past (a teleport: no slide from the old spot). */
  reset(t: number, x: number, z: number): void;
}

export function driveAlong(h: CharacterHandle, heightAt: (x: number, z: number) => number, keepS = 2): Track {
  const ts: number[] = [];
  const xs: number[] = [];
  const zs: number[] = [];
  const v = new THREE.Vector3();
  const at = (t: number) => {
    const n = ts.length;
    if (!n) return v.set(0, 0, 0);
    let x = xs[n - 1]!;
    let z = zs[n - 1]!;
    if (t <= ts[0]!) {
      x = xs[0]!;
      z = zs[0]!;
    } else
      for (let i = n - 1; i > 0; i--) {
        if (ts[i - 1]! <= t && t <= ts[i]!) {
          const k = ts[i] === ts[i - 1] ? 1 : (t - ts[i - 1]!) / (ts[i]! - ts[i - 1]!);
          x = xs[i - 1]! + (xs[i]! - xs[i - 1]!) * k;
          z = zs[i - 1]! + (zs[i]! - zs[i - 1]!) * k;
          break;
        }
      }
    return v.set(x, heightAt(x, z), z);
  };
  h.ch.drive((t) => ({ pos: at(t).clone() }));
  const track: Track = {
    push(t, x, z) {
      const n = ts.length;
      if (n && t <= ts[n - 1]!) {
        xs[n - 1] = x;
        zs[n - 1] = z;
        return;
      }
      ts.push(t);
      xs.push(x);
      zs.push(z);
      while (ts.length > 2 && ts[0]! < t - keepS) {
        ts.shift();
        xs.shift();
        zs.shift();
      }
    },
    reset(t, x, z) {
      ts.length = xs.length = zs.length = 0;
      track.push(t, x, z);
    },
  };
  return track;
}
