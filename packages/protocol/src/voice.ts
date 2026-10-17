import { z } from 'zod';

// ---------------------------------------------------------------------------------------
// Voice contracts. Co-owned by voice teammate (additive changes; log in docs/architecture.md).
//
// Privacy model: the SERVER decides which acoustic zone each member is in and issues a
// LiveKit token for exactly one zone room (`<prefix>-<lobbyId>-<zone>`), revoking the previous
// one via the LiveKit server API. Private zones (building interiors, homes at night, ST visits)
// are separate LiveKit rooms, so a modified client cannot subscribe to them. The outdoor
// 'street' room uses client-side distance attenuation (documented limitation).

/** 'square' | 'street' | `bld:<buildingId>` | 'announce' | 'none' */
export type AcousticZoneId = string;

export type VoiceMode = 'broadcast' | 'proximity' | 'private';

export interface VoiceGrant {
  provider: 'livekit';
  url: string;
  token: string;
  room: string;
  zone: AcousticZoneId;
  mode: VoiceMode;
  /** 'zone' = the member's single acoustic room; 'announce' = ST announcement overlay (listen-only for players). */
  purpose: 'zone' | 'announce';
  canPublish: boolean;
  expiresAt: number;
}

export interface VoiceRevoke {
  purpose: 'zone' | 'announce';
  room: string;
  /**
   * 'announce_end' (voice, 2026-10-14): the Storyteller's announcement overlay ended.
   * (v2.3 sec-voice, additive) 'disabled': the host switched voice off (kill switch);
   * 'idle': voice was switched off after a long time without activity (VOICE-7).
   */
  reason: 'zone_change' | 'left' | 'phase' | 'quota' | 'kicked' | 'announce_end' | 'disabled' | 'idle';
}

export interface VoiceUnavailable {
  /**
   * (v2.3 sec-voice, additive) 'disabled': voice switched off by the host (kill switch, grants come
   * back by themselves when it is switched on again); 'busy': a voice capacity limit is reached
   * (retried automatically); 'idle': voice was turned off after a long time without activity —
   * the client turns its voice off and the player presses "Enable voice" again.
   */
  reason: 'not_configured' | 'quota_exhausted' | 'provider_error' | 'disabled' | 'busy' | 'idle';
  message: string;
}

/**
 * Client heartbeat (every ~30s and on change): debug overlay, idle tracking and (fallback) quota
 * accounting. (v2.3 sec-voice, additive) `wanted`: the player switched voice on (true) / off
 * (false). The server mints LiveKit tokens only for members that want voice (VOICE-4); a status
 * without `wanted` (pre-v2.3 client) counts as wanted.
 */
export const VoiceStatusMsg = z.object({
  connected: z.boolean(),
  publishing: z.boolean(),
  room: z.string().max(200).optional(),
  wanted: z.boolean().optional(),
});
export type VoiceStatusMsg = z.infer<typeof VoiceStatusMsg>;

/** Storyteller push-to-announce to the whole lobby. */
export const VoiceAnnounceMsg = z.object({ active: z.boolean() });

export interface VoiceUsageView {
  configured: boolean;
  month: string; // YYYY-MM (UTC)
  participantMinutes: number;
  monthlyLimit: number;
  level: 'ok' | 'warn' | 'critical' | 'exhausted';
  activeParticipants: number;
  byEnv: Record<string, number>;
  // (v2.3 sec-voice, additive)
  /** Participants LiveKit itself reports as connected in this env's rooms (null: not measured yet / LiveKit unreachable). */
  liveParticipants?: number | null;
  /** Usage is measured from LiveKit room listings (true) or estimated from client heartbeats (false). */
  measured?: boolean;
  /** Voice kill switch state. */
  disabled?: boolean;
  disabledBy?: 'env' | 'admin' | 'unknown' | null;
  disabledReason?: string | null;
  disabledAt?: number | null;
  /** Hard caps (participants). */
  caps?: { concurrent: number; perLobby: number; perIp: number; idleMinutes: number; waitingMaxMinutes: number };
}
