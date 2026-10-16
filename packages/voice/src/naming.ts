import type { AcousticZoneId } from '@ct/protocol';
import { ZONE_ANNOUNCE, ZONE_SQUARE, ZONE_STREET } from './zones.js';

// LiveKit room naming: `<prefix>-<lobby>-<zoneSlug>`
//   prefix    LIVEKIT_ROOM_PREFIX (e.g. 'dev' / 'prod'), separates environments sharing a project
//   lobby     the lobby id, escaped so it never contains '-' ('_' -> '__', '-' -> '_d'),
//             which makes the name injective: lobby "ab-square" can never collide with lobby
//             "ab" + zone "square".
//   zoneSlug  'square' | 'street' | 'announce' | 'bld-<buildingId>'
//   epoch     (v2.3 VOICE-9, optional) `_<epoch>` suffix, [a-z0-9]{4,16}. The server rotates a
//             room's epoch when it empties / a member leaves a private room, so an old token (or a
//             LiveKit refresh token) names a dead room. Building ids never contain '_'.

const PREFIX_RE = /^[a-z0-9-]{1,16}$/;
const LOBBY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BUILDING_RE = /^[a-z0-9-]{1,32}$/;
const EPOCH_RE = /^[a-z0-9]{4,16}$/;

export function encodeLobbyComponent(lobbyId: string): string {
  if (!LOBBY_RE.test(lobbyId)) throw new Error('invalid lobby id for voice room');
  return lobbyId.replace(/_/g, '__').replace(/-/g, '_d');
}

export function decodeLobbyComponent(enc: string): string | null {
  let out = '';
  for (let i = 0; i < enc.length; i++) {
    const c = enc[i]!;
    if (c === '-') return null;
    if (c !== '_') {
      out += c;
      continue;
    }
    const n = enc[++i];
    if (n === '_') out += '_';
    else if (n === 'd') out += '-';
    else return null;
  }
  return out;
}

export function zoneSlug(zone: AcousticZoneId): string {
  if (zone === ZONE_SQUARE || zone === ZONE_STREET || zone === ZONE_ANNOUNCE) return zone;
  if (zone.startsWith('bld:')) {
    const id = zone.slice(4);
    if (!BUILDING_RE.test(id)) throw new Error('invalid building id for voice room');
    return `bld-${id}`;
  }
  throw new Error(`zone has no voice room: ${zone}`);
}

export function zoneFromSlug(slug: string): AcousticZoneId | null {
  if (slug === ZONE_SQUARE || slug === ZONE_STREET || slug === ZONE_ANNOUNCE) return slug;
  if (slug.startsWith('bld-') && BUILDING_RE.test(slug.slice(4))) return `bld:${slug.slice(4)}`;
  return null;
}

export function roomNameFor(prefix: string, lobbyId: string, zone: AcousticZoneId, epoch?: string): string {
  if (!PREFIX_RE.test(prefix)) throw new Error('invalid voice room prefix');
  if (epoch !== undefined && !EPOCH_RE.test(epoch)) throw new Error('invalid voice room epoch');
  return `${prefix}-${encodeLobbyComponent(lobbyId)}-${zoneSlug(zone)}${epoch !== undefined ? `_${epoch}` : ''}`;
}

/** Parse a room name produced by roomNameFor for a known prefix. */
export function parseRoomName(prefix: string, room: string): { lobbyId: string; zone: AcousticZoneId; epoch?: string } | null {
  if (!room.startsWith(`${prefix}-`)) return null;
  const rest = room.slice(prefix.length + 1);
  const dash = rest.indexOf('-');
  if (dash <= 0) return null;
  const lobbyId = decodeLobbyComponent(rest.slice(0, dash));
  let slug = rest.slice(dash + 1);
  let epoch: string | undefined;
  const us = slug.lastIndexOf('_');
  if (us >= 0) {
    epoch = slug.slice(us + 1);
    slug = slug.slice(0, us);
    if (!EPOCH_RE.test(epoch)) return null;
  }
  const zone = zoneFromSlug(slug);
  if (lobbyId === null || zone === null) return null;
  return epoch !== undefined ? { lobbyId, zone, epoch } : { lobbyId, zone };
}

/** Guard used before minting any token: the room must belong to this env + lobby. */
export function assertRoomInLobby(prefix: string, lobbyId: string, room: string): void {
  const p = parseRoomName(prefix, room);
  if (!p || p.lobbyId !== lobbyId || roomNameFor(prefix, lobbyId, p.zone, p.epoch) !== room) {
    throw new Error('voice room does not belong to this lobby');
  }
}
