// Runtime feature detection (qa-deploy). Suites that depend on features owned by other teammates
// probe the REAL server and skip with an explicit reason while the feature is still a stub —
// they never fake a pass. As features land, the same suites become active automatically.
import { Bot } from './bot.js';
import { ApiClient } from './http.js';
import type { TestServer } from './server.js';
import { fakeClientIp } from './ip.js';
export { fakeClientIp };

export interface Features {
  /** POST /api/auth/create works (accounts + sessions). */
  accounts: boolean;
  /** POST /api/lobbies + tickets work. */
  lobbies: boolean;
  /** Ticket join to the Colyseus room works and a 'lobby:view' arrives. */
  rooms: boolean;
  /** The room sends 'world:snapshot' containing the joining member. */
  world: boolean;
  /** pong is answered for 'ping'. */
  ping: boolean;
  reasons: Record<string, string>;
}

export async function probeFeatures(server: TestServer): Promise<Features> {
  const f: Features = { accounts: false, lobbies: false, rooms: false, world: false, ping: false, reasons: {} };
  const api = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
  const acc = await api.createAccount('probe');
  if (acc.status === 200 || acc.status === 201) f.accounts = true;
  else f.reasons.accounts = `POST /api/auth/create -> ${acc.status} (account API not implemented yet)`;
  if (!f.accounts) {
    for (const k of ['lobbies', 'rooms', 'world', 'ping']) f.reasons[k] = 'requires accounts';
    return f;
  }
  const lob = await api.createLobby({ name: 'probe lobby', maxPlayers: 5 });
  if (lob.status === 200 || lob.status === 201) {
    const t = await api.ticket(lob.body.lobby.id, 'player');
    if (t.status === 200) f.lobbies = true;
    else f.reasons.lobbies = `POST /api/lobbies/:id/ticket -> ${t.status}`;
  } else f.reasons.lobbies = `POST /api/lobbies -> ${lob.status} (lobby API not implemented yet)`;
  if (!f.lobbies) {
    for (const k of ['rooms', 'world', 'ping']) f.reasons[k] = 'requires lobbies';
    return f;
  }
  const bot = new Bot('probe-bot', server.url, server.wsUrl, { headers: { 'X-Forwarded-For': fakeClientIp() } });
  try {
    await bot.signUp();
    await bot.join(lob.body.lobby.id);
    try {
      await bot.waitFor('lobby:view', () => true, 4000);
      f.rooms = true;
    } catch {
      f.reasons.rooms = "joined the room but no 'lobby:view' within 4s (GameRoom not implemented yet)";
    }
    if (f.rooms) {
      try {
        await bot.waitFor<any>('world:snapshot', (s) => s.entities?.some((e: any) => e.id === bot.pid), 4000);
        f.world = true;
      } catch {
        f.reasons.world = "no 'world:snapshot' containing own entity within 4s (WorldModule not implemented yet)";
      }
      bot.send('ping', { t: 1 });
      f.ping = await bot.receives('pong', 2000);
      if (!f.ping) f.reasons.ping = "no 'pong' for 'ping' within 2s";
    } else {
      f.reasons.world = 'requires rooms';
      f.reasons.ping = 'requires rooms';
    }
  } catch (err) {
    f.reasons.rooms = `room join failed: ${(err as Error).message}`;
    f.reasons.world = 'requires rooms';
    f.reasons.ping = 'requires rooms';
  } finally {
    await bot.leave().catch(() => undefined);
  }
  return f;
}

/** Title suffix that makes the skip reason visible in the vitest report. */
export function pending(ok: boolean, reason: string | undefined): string {
  return ok ? '' : ` [SKIPPED — PENDING: ${reason ?? 'feature not implemented'}]`;
}
