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
  /** 'announce_end' (voice, 2026-10-14): the Storyteller's announcement overlay ended. */
  reason: 'zone_change' | 'left' | 'phase' | 'quota' | 'kicked' | 'announce_end';
}

export interface VoiceUnavailable {
  reason: 'not_configured' | 'quota_exhausted' | 'provider_error';
  message: string;
}

/** Client heartbeat (every ~30s and on change) used for quota accounting + debug overlay. */
export const VoiceStatusMsg = z.object({
  connected: z.boolean(),
  publishing: z.boolean(),
  room: z.string().max(200).optional(),
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
}
