import { TILE_SIZE } from '@ct/protocol';
import { VOICE_DEFAULTS } from './constants.js';

// Street distance attenuation, shared by the client (gains) and the server (chat audience
// radius) so text chat and voice reach exactly the same people.

export interface AttenuationOptions {
  tileSize?: number;
  fullVolumeTiles?: number;
  silentTiles?: number;
  falloffExponent?: number;
}

export function audibleRadiusPx(opts: AttenuationOptions = {}): number {
  return (opts.silentTiles ?? VOICE_DEFAULTS.silentTiles) * (opts.tileSize ?? TILE_SIZE);
}

export function distancePx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Gain in [0,1] for a speaker `distPx` away: 1 within fullVolumeTiles, raised-cosine falloff
 * (zero slope at both ends -> no audible kink) raised to `falloffExponent`, exactly 0 at silentTiles.
 */
export function attenuationGain(distPx: number, opts: AttenuationOptions = {}): number {
  const ts = opts.tileSize ?? TILE_SIZE;
  const full = (opts.fullVolumeTiles ?? VOICE_DEFAULTS.fullVolumeTiles) * ts;
  const silent = (opts.silentTiles ?? VOICE_DEFAULTS.silentTiles) * ts;
  if (!Number.isFinite(distPx)) return 0;
  if (distPx <= full) return 1;
  if (distPx >= silent) return 0;
  const t = (distPx - full) / (silent - full);
  return Math.pow(0.5 * (1 + Math.cos(Math.PI * t)), opts.falloffExponent ?? VOICE_DEFAULTS.falloffExponent);
}

/**
 * One step of exponential smoothing towards `target` (frame-rate independent).
 * Prevents popping when a speaker crosses thresholds or positions jitter.
 */
export function smoothGain(current: number, target: number, dtMs: number, tauMs: number = VOICE_DEFAULTS.gainSmoothingMs): number {
  if (!Number.isFinite(current)) return target;
  if (tauMs <= 0 || dtMs <= 0) return dtMs <= 0 ? current : target;
  const k = 1 - Math.exp(-dtMs / tauMs);
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 1e-3 ? target : next;
}
