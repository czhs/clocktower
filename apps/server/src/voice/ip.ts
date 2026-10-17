// OWNED BY voice (v2.3 sec-voice, VOICE-4). Client IP of each lobby member, for the per-IP voice
// cap. Never sent to clients or logged. The GameRoom notes it at join (one hook line).
import type http from 'node:http';
import { ipKey } from '../auth/http.js';

const byMember = new Map<string, string>(); // `${lobbyId}\u0000${pid}` -> ip key (IPv6: /64)

const key = (lobbyId: string, pid: string) => `${lobbyId}\u0000${pid}`;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * IP key of a WebSocket join (Colyseus AuthContext). Same trust model as Express
 * `trust proxy = 'loopback'`: when the socket comes from a loopback proxy (cloudflared), the
 * rightmost X-Forwarded-For entry (appended by Cloudflare) is the client; otherwise the socket peer.
 */
export function ipKeyFromJoin(context: { headers?: http.IncomingHttpHeaders; req?: http.IncomingMessage } | undefined): string | null {
  if (!context) return null;
  const remote = context.req?.socket?.remoteAddress ?? null;
  const xff = context.headers?.['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  let ip: string | null = remote;
  if ((remote === null || LOOPBACK.has(remote)) && list.length) ip = list[list.length - 1]!;
  // A loopback client without a forwarding proxy (local tools / test harnesses) is not capped per IP:
  // if the tunnel ever stopped sending X-Forwarded-For, everyone would share one key.
  if (!ip || LOOPBACK.has(ip)) return null;
  return ipKey(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
}

export function noteVoiceMemberIp(lobbyId: string, pid: string, ip: string | null | undefined): void {
  if (ip) byMember.set(key(lobbyId, pid), ip);
}

export function voiceMemberIp(lobbyId: string, pid: string): string | null {
  return byMember.get(key(lobbyId, pid)) ?? null;
}

export function forgetVoiceMemberIp(lobbyId: string, pid: string): void {
  byMember.delete(key(lobbyId, pid));
}

export function forgetVoiceLobbyIps(lobbyId: string): void {
  const p = `${lobbyId}\u0000`;
  for (const k of byMember.keys()) if (k.startsWith(p)) byMember.delete(k);
}

/** (v2.4 P3) Diagnostics / leak tests: remembered member IPs in this process. */
export function voiceMemberIpCount(): number {
  return byMember.size;
}
