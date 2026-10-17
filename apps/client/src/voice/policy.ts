// OWNED BY voice. Pure voice-client decisions (no LiveKit, no DOM) so they can be unit-tested:
// proximity subscription culling with hysteresis, change-only participant patches, and the
// packet-loss check that turns RED (redundant audio) on.

import { TILE_SIZE } from '@ct/protocol';
import { VOICE_DEFAULTS } from '@ct/voice/shared';

// ---------------------------------------------------------------------------------------------
// Proximity subscription culling (street rooms only).
//
// A far talker is inaudible (gain 0 beyond silentTiles) but its Opus stream would still be
// downloaded and decoded. Once someone has been beyond silentTiles + margin for longer than the
// delay we stop receiving them; we receive them again as soon as they come within silentTiles
// (where their gain is still ~0, so the fade-in sounds exactly as before). Culling only ever
// drops subscriptions the server's grant allows: resubscribing is limited to tracks we culled.

export interface CullState {
  /** We unsubscribed this participant's audio. */
  culled: boolean;
  /** Since when (ms) the participant has been continuously beyond the cull distance. */
  farSince: number | null;
}

export interface CullOptions {
  tileSize?: number;
  silentTiles?: number;
  marginTiles?: number;
  delayMs?: number;
}

export const CULL_INITIAL: CullState = { culled: false, farSince: null };

/**
 * One step of the cull state machine. `distPx` is the distance to the talker, `Infinity` when
 * their position is unknown or they are not outdoors with us (gain target 0 either way).
 */
export function cullStep(prev: CullState, distPx: number, nowMs: number, opts: CullOptions = {}): CullState {
  const ts = opts.tileSize ?? TILE_SIZE;
  const silent = (opts.silentTiles ?? VOICE_DEFAULTS.silentTiles) * ts;
  const far = silent + (opts.marginTiles ?? VOICE_DEFAULTS.cullMarginTiles) * ts;
  const delay = opts.delayMs ?? VOICE_DEFAULTS.cullDelayMs;
  const d = Number.isNaN(distPx) ? Infinity : distPx;
  if (prev.culled) return d < silent ? CULL_INITIAL : prev;
  if (d <= far) return prev.farSince === null ? prev : CULL_INITIAL;
  const farSince = prev.farSince ?? nowMs;
  return { culled: nowMs - farSince > delay, farSince };
}

// ---------------------------------------------------------------------------------------------
// Participant list patches: the panel re-renders only when something visible changed.

export interface ParticipantLike {
  pid: string;
  speaking: boolean;
  gain: number;
  volume: number;
  micMuted: boolean;
  announce: boolean;
}

/** Gains are shown/compared in 0.05 steps (the panel only uses them for the "faint" style). */
export function roundGain(g: number): number {
  return Math.round(g * 20) / 20;
}

export function sameParticipants(a: readonly ParticipantLike[], b: readonly ParticipantLike[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.pid !== y.pid || x.speaking !== y.speaking || x.volume !== y.volume || x.micMuted !== y.micMuted || x.announce !== y.announce) return false;
    if (roundGain(x.gain) !== roundGain(y.gain)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Uplink packet loss -> RED. RED (redundant audio) roughly doubles the bytes per audio packet, so
// it is only worth it on lossy links. Losses are accumulated over sender-stats samples until
// enough packets were sent (DTX + push-to-talk send almost nothing while silent).

export interface SenderSample {
  packetsSent?: number;
  packetsLost?: number;
}

export interface LossWindow {
  sent: number;
  lost: number;
}

export const LOSS_WINDOW_EMPTY: LossWindow = { sent: 0, lost: 0 };
/** Packets (20 ms each) needed before a verdict: ~5 s of talking. */
export const LOSS_MIN_PACKETS = 250;
/** Enable RED above this uplink loss fraction. */
export const RED_LOSS_THRESHOLD = 0.02;

/**
 * Feed one sample; returns the new window and, once the window holds enough packets, the loss
 * fraction over it (the window then restarts). Counter resets (new sender) are ignored.
 */
export function lossStep(win: LossWindow, prev: SenderSample | null, cur: SenderSample): { win: LossWindow; loss: number | null } {
  if (!prev || prev.packetsSent === undefined || cur.packetsSent === undefined) return { win, loss: null };
  const sent = cur.packetsSent - prev.packetsSent;
  const lost = (cur.packetsLost ?? 0) - (prev.packetsLost ?? 0);
  if (sent < 0 || lost < 0) return { win, loss: null };
  const next = { sent: win.sent + sent, lost: win.lost + lost };
  if (next.sent < LOSS_MIN_PACKETS) return { win: next, loss: null };
  return { win: LOSS_WINDOW_EMPTY, loss: next.lost / next.sent };
}
