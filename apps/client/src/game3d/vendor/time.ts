// v3 WP3 (v3-stage). The time-of-day look through pixel3d's own interpolator (src/demo/time.js createTime),
// fed by a facade `demo` object instead of the demo page (docs/v3/INTEGRATION.md §3.1 "Time facade").
// One of the only modules allowed to import '@pixel3d/*' (game3d/vendor/**).
//
// createTime gives us, for one continuous hour 0..24: the sun, ramps, fog / night mist, the lights switching
// on in order, the global window glow, the lamp / brazier pools, the dais night switch, the clock tower's
// hands (its api is gated so only createTime's own calls pass: life's scripted clock and bell are muted) and
// a CONSTANT PointLight pool (topped up to `lights` before the warm-up, re-aimed at the lit anchors nearest
// the player, or at the room's anchors while `player.interior` is set). Only uniforms change, so the
// program count stays constant across day -> night.
//
// The facade: `store` (world/store.ts: the clock is paused at speed 0; phase / nominee / seats frozen, the
// game drives the dais itself), `input` (no global keys), `events` ('ready' after the warm-up enables the
// fog pass; 'tod' / 'bell' come back out), `player` (own avatar position in metres, the shown interior),
// `params` (`folk=0`: no seated demo townsfolk; `lights`: the pool size), `reload` (a tier rebuild request,
// never a page reload). setHour() writes the store with source 'game' (each write is a jump: no auto-bell).
// CONTRACT-REQUEST(pixel3d): an exported look interpolator with an external clock (§9.2), so the facade can go.
import * as timeNS from '@pixel3d/demo/time.js';
import * as demoApiNS from '@pixel3d/demo/api.js';
import * as layout from '@pixel3d/town/layout.js';
import type { BuiltTown } from './town';
import { createFacadeEvents, createFacadeStore, NO_INPUT, type FacadeStore } from '../world/store';

export interface TownTimeOptions {
  engine: unknown;
  town: BuiltTown;
  quality: 'high' | 'low';
  /** Size of the town's PointLight pool (the tier budget minus the carried-light reserve). */
  lights: number;
  /** Starting hour. */
  hour: number;
  /** Own avatar position (m) for the light-pool aim; null = the camera target. */
  position(): { x: number; y: number; z: number } | null;
  /** The interior that is shown (the pool re-aims at its anchors), or null outdoors. */
  interior(): unknown;
  /** A tier rebuild was requested by the vendor (quality change). */
  onReload?(): void;
}

export interface TownTime {
  /** Move the clock (hours). Writes only when it moved by >= 1 game minute. */
  setHour(h: number): void;
  readonly hours: number;
  /** Town preset of the current hour (night | morning | noon | afternoon | golden). */
  readonly preset: string;
  /** Strike the tower bell (phase changes). */
  ringBell(): void;
  /** Per frame, from an engine updater (after the pieces). */
  update(t: number, dt: number): void;
  /** After the warm-up: lets createTime switch the fog pass by the darkness. */
  ready(): void;
  on(name: 'tod' | 'bell', fn: (payload: unknown) => void): () => void;
  info(): Record<string, unknown>;
  readonly store: FacadeStore;
  dispose(): void;
}

interface VendorTime {
  update(t: number, dt: number): void;
  ringBell(): void;
  readonly hours: number;
  readonly preset: string;
  readonly period: string;
  info: Record<string, unknown>;
  dispose(): void;
}

/** The vendor's tod preset of an hour (the town is built with the preset of its starting hour). */
export function presetForHour(h: number): 'night' | 'morning' | 'noon' | 'afternoon' | 'golden' {
  return vendorPresetForHour(h) as 'night' | 'morning' | 'noon' | 'afternoon' | 'golden';
}

const MINUTE = 1 / 60;
const createTime = (timeNS as unknown as { createTime(demo: unknown): unknown }).createTime;
const vendorPresetForHour = (demoApiNS as unknown as { presetForHour(h: number): string }).presetForHour;

export function createTownTime(o: TownTimeOptions): TownTime {
  const store = createFacadeStore({ timeOfDay: o.hour, quality: o.quality });
  const events = createFacadeEvents();
  const params = new URLSearchParams({ folk: '0', lights: String(Math.max(1, Math.floor(o.lights))) });
  let pos: { x: number; y: number; z: number } | null = null;
  const facade = {
    engine: o.engine,
    town: o.town,
    layout,
    params,
    store,
    input: NO_INPUT,
    events,
    player: {
      get position() {
        pos = o.position();
        return pos;
      },
      get interior() {
        return o.interior() ?? null;
      },
    },
    reload: () => o.onReload?.(),
  };
  const vt = createTime(facade) as VendorTime;
  let written = store.state.timeOfDay;
  let disposed = false;
  return {
    store,
    get hours() {
      return vt.hours;
    },
    get preset() {
      return vt.preset;
    },
    setHour(h) {
      const x = ((h % 24) + 24) % 24;
      const d = Math.abs(x - written);
      if (Math.min(d, 24 - d) < MINUTE) return;
      written = x;
      store.set({ timeOfDay: x }, 'game');
    },
    ringBell() {
      if (!disposed) vt.ringBell();
    },
    update(t, dt) {
      if (!disposed) vt.update(t, dt);
    },
    ready() {
      events.emit('ready', {});
    },
    on(name, fn) {
      return events.on(name, fn);
    },
    info() {
      return { ...vt.info, hours: vt.hours, preset: vt.preset, period: vt.period, dropped: store.dropped };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      vt.dispose();
    },
  };
}
