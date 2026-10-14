import { AccessToken, RoomServiceClient, TokenVerifier, TrackSource, type VideoGrant } from 'livekit-server-sdk';
import { VOICE_DEFAULTS } from './constants.js';

// SERVER-ONLY (Node): LiveKit join tokens. Never import from the client bundle (use
// '@ct/voice/shared'). Tokens and API secrets must never be logged.

export { RoomServiceClient, TokenVerifier };

/**
 * Join grant restricted to exactly one room: roomJoin for `room` only, subscribe allowed,
 * publish only the microphone when allowed, no data channel, no metadata updates, no admin.
 */
export function buildVoiceGrant(room: string, canPublish: boolean): VideoGrant {
  const g: VideoGrant = {
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  };
  if (canPublish) g.canPublishSources = [TrackSource.MICROPHONE];
  return g;
}

export interface MintOptions {
  apiKey: string;
  apiSecret: string;
  /** LiveKit identity = per-lobby pid (never the account id). */
  identity: string;
  /** Display name shown to the other participants of that room. */
  name: string;
  room: string;
  canPublish: boolean;
  ttlSec?: number;
}

export async function mintVoiceToken(o: MintOptions): Promise<string> {
  if (!o.apiKey || !o.apiSecret) throw new Error('LiveKit credentials missing');
  if (!o.identity || !o.room) throw new Error('identity and room are required');
  const at = new AccessToken(o.apiKey, o.apiSecret, {
    identity: o.identity,
    name: o.name,
    ttl: o.ttlSec ?? VOICE_DEFAULTS.tokenTtlSec,
  });
  at.addGrant(buildVoiceGrant(o.room, o.canPublish));
  return at.toJwt();
}

/** 'wss://x.livekit.cloud' -> 'https://x.livekit.cloud' (RoomServiceClient / validate endpoint). */
export function livekitHttpUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
}

/** Decode (NOT verify) a JWT payload — tests / debugging only. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('not a JWT');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}
