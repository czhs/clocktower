import express from 'express';
import { cleanText, CreateLobbyRequest, JoinTicketRequest, LOBBY_ID_RE, wordLobbyName, type DirectoryEvent } from '@ct/protocol';
import type { Services } from '../services.js';
import { clientIp, currentAccount, currentSid, handler, HttpError, parseBody, rateLimit, requireAccount, sendError } from '../auth/http.js';
import { DirectoryError } from './service.js';
import { StreamSlots } from '../guard/streamSlots.js';
import { getHostLimits } from '../guard/hostLimits.js';

export const SSE_HEARTBEAT_MS = 20_000;
/** SR-6: open lobby streams per account (more tabs fall back to the 30 s list refresh) and in total. */
export const SSE_MAX_PER_ACCOUNT = 3;
export const SSE_MAX_TOTAL = 200;
/** v2.3 HOST-04: streams per client address (IPv4 / IPv6 /64); loopback (local tooling) is exempt. */
export const SSE_MAX_PER_IP = 6;

/**
 * (v3 perf, net) The directory hands the SAME event object to every open stream: serialise it once
 * per event, not once per subscriber (60 streams = 60 JSON.stringify of one summary before).
 */
const sseLines = new WeakMap<DirectoryEvent, string>();
export function sseLine(e: DirectoryEvent): string {
  let line = sseLines.get(e);
  if (line === undefined) sseLines.set(e, (line = `data: ${JSON.stringify(e)}\n\n`));
  return line;
}

/** (v2.2) A blank / missing lobby name becomes a friendly simple-words name (`Amber Lantern`). */
function withDefaultName(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const name = (body as { name?: unknown }).name;
  if (name === undefined || name === null || (typeof name === 'string' && cleanText(name) === '')) return { ...body, name: wordLobbyName() };
  return body;
}

function rethrow(e: unknown): never {
  if (e instanceof DirectoryError) throw new HttpError(e.status, e.code, e.message);
  throw e;
}

/** /api/lobbies* — every route requires a signed-in session (public lobby != anonymous access). */
export function lobbiesRouter(services: Services, opts: { heartbeatMs?: number } = {}): express.Router {
  const r = express.Router();
  const auth = requireAccount(services);
  const dir = services.directory;
  const heartbeatMs = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;
  // v2.3 HOST-04: per-account + per-IP caps and fair eviction when the pool is full (guard/streamSlots.ts).
  const slots = new StreamSlots(() => {
    const l = getHostLimits(); // live settings (defaults = SSE_MAX_* below)
    return { perAccount: l.sseMaxPerAccount, perIp: l.sseMaxPerIp, total: l.sseMaxTotal };
  });

  r.get('/lobbies', auth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ lobbies: dir.list() });
  });

  r.get('/lobbies/stream', auth, (req, res) => {
    const accountId = currentAccount(res).id;
    const slot = slots.acquire(accountId, clientIp(req), () => res.end());
    if (!slot.ok) return sendError(res, slot.status, slot.status === 429 ? 'rate_limited' : 'internal', slot.message);
    const release = slot.release;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);
    const write = (e: DirectoryEvent) => {
      res.write(sseLine(e));
    };
    res.write('retry: 3000\n\n');
    write({ type: 'snapshot', lobbies: dir.list() });
    const unsubscribe = dir.subscribe(write);
    const hb = setInterval(() => write({ type: 'heartbeat', at: Date.now() }), heartbeatMs);
    // (v2.3 AUTH-1) A revoked session (or all of the account's) ends its open stream too.
    const sid = currentSid(res);
    const unRevoke = services.revocations.subscribe((revoked, revokedSid) => {
      if (revoked === accountId && (!revokedSid || revokedSid === sid)) res.end();
    });
    const close = () => {
      clearInterval(hb);
      unsubscribe();
      unRevoke();
      release();
    };
    req.on('close', close);
    res.on('close', close);
  });

  r.post(
    '/lobbies',
    auth,
    rateLimit(services.limits.createLobby, (_req, res) => currentAccount(res).id),
    handler(async (req, res) => {
      const body = parseBody(CreateLobbyRequest, withDefaultName(req.body));
      const lobby = await dir.create(currentAccount(res), body, clientIp(req)).catch(rethrow);
      res.status(201).json({ lobby });
    }),
  );

  r.get('/lobbies/:id', auth, (req, res) => {
    const raw = String(req.params.id);
    const lobby = LOBBY_ID_RE.test(raw) ? dir.get(dir.resolveId(raw)) : null;
    if (!lobby) throw new HttpError(404, 'not_found', 'Lobby not found');
    res.json({ lobby });
  });

  r.post(
    '/lobbies/:id/ticket',
    auth,
    rateLimit(services.limits.ticket, (_req, res) => currentAccount(res).id),
    handler((req, res) => {
      const raw = String(req.params.id);
      if (!LOBBY_ID_RE.test(raw)) throw new HttpError(404, 'not_found', 'Lobby not found');
      const id = dir.resolveId(raw);
      const body = parseBody(JoinTicketRequest, req.body);
      // (v2.3 OPS-6) the network this join comes from: lobby removals ban the account AND its network.
      services.moderation.noteIp(currentAccount(res).id, clientIp(req));
      try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(dir.issueTicket(currentAccount(res), id, body.intent, currentSid(res))); // (v2.3 AUTH-1) session-bound
      } catch (e) {
        rethrow(e);
      }
    }),
  );

  return r;
}
