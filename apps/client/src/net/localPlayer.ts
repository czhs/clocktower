import type { LocationId } from '@ct/protocol';
import { createStore } from './store';

// LEAD-OWNED shared client state: the locally predicted player position. Written by the Phaser
// scene (world-art) every frame it changes; read by voice (distance attenuation) and HUD.
export interface LocalPlayerState {
  pid: string | null;
  x: number;
  y: number;
  location: LocationId;
}
export const localPlayer = createStore<LocalPlayerState>({ pid: null, x: 0, y: 0, location: 'outdoors' });

/** Latest known positions of other visible entities (pid -> state), written by the Phaser scene. */
export const remoteEntities = new Map<string, { x: number; y: number; location: LocationId }>();
