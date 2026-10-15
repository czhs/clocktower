// Tunables shared by the server VoiceCoordinator and the client VoiceClient.
// Distances are expressed in tiles and converted with the layout's tileSize.

export const VOICE_DEFAULTS = {
  /** Square hysteresis: enter at r, leave only beyond r + margin (px). */
  squareMarginPx: 24,
  /** square <-> street changes must be stable this long before they are committed. */
  zoneDebounceMs: 600,
  /** Street attenuation: full volume closer than this many tiles… */
  fullVolumeTiles: 2,
  /** …smooth falloff to silence at this many tiles (also the street "audible radius"). */
  silentTiles: 10,
  /**
   * Falloff shape: gain = raisedCosine(t) ^ exponent. 2 (tuned 2026-10-15 from live measurements)
   * gives ~-12 dB at 6 tiles and ~-33 dB at 8 tiles, so a group 6+ tiles away is background murmur
   * and groups 8+ tiles apart are effectively separate conversations; 1 was -4 dB at 6 tiles.
   */
  falloffExponent: 2,
  /** Client gain smoothing time constant (ms). */
  gainSmoothingMs: 150,
  /** LiveKit join-token lifetime (seconds). Only gates the initial connect. */
  tokenTtlSec: 600,
  /** Server re-issues a grant this long before its token expires. */
  refreshBeforeMs: 120_000,
  /** Client heartbeat cadence (voice:status). */
  heartbeatMs: 30_000,
  /** Upper bound credited for one heartbeat interval (prevents usage inflation / huge gaps). */
  maxHeartbeatCreditMs: 45_000,
  /** Announcement auto-ends if the Storyteller does not re-assert it within this window. */
  announceIdleMs: 90_000,
} as const;

export const QUOTA_THRESHOLDS = { warn: 0.7, critical: 0.9, exhausted: 1 } as const;
