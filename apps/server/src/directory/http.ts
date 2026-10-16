import express from 'express';
import { cleanText, CreateLobbyRequest, JoinTicketRequest, LOBBY_ID_RE, wordLobbyName, type DirectoryEvent } from '@ct/protocol';
import type { Services } from '../services.js';
import { clientIp, currentAccount, handler, HttpError, parseBody, rateLimit, requireAccount, sendError } from '../auth/http.js';
import { DirectoryError } from './service.js';

export const SSE_HEARTBEAT_MS = 20_000;
/** SR-6: open lobby streams per account (more tabs fall back to the 30 s list refresh) and in total. */
export const SSE_MAX_PER_ACCOUNT = 3;
export const SSE_MAX_TOTAL = 200;

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
  const streamsByAccount = new Map<string, number>();
  let streamsTotal = 0;

  r.get('/lobbies', auth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ lobbies: dir.list() });
  });

  r.get('/lobbies/stream', auth, (req, res) => {
    const accountId = currentAccount(res).id;
    const mine = streamsByAccount.get(accountId) ?? 0;
    if (mine >= SSE_MAX_PER_ACCOUNT) return sendError(res, 429, 'rate_limited', 'Too many open lobby streams for this account');
    if (streamsTotal >= SSE_MAX_TOTAL) return sendError(res, 503, 'internal', 'The server is busy, please try again shortly');
    streamsByAccount.set(accountId, mine + 1);
    streamsTotal++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      streamsTotal--;
      const n = (streamsByAccount.get(accountId) ?? 1) - 1;
      if (n > 0) streamsByAccount.set(accountId, n);
      else streamsByAccount.delete(accountId);
    };
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);
    const write = (e: DirectoryEvent) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    res.write('retry: 3000\n\n');
    write({ type: 'snapshot', lobbies: dir.list() });
    const unsubscribe = dir.subscribe(write);
    const hb = setInterval(() => write({ type: 'heartbeat', at: Date.now() }), heartbeatMs);
    const close = () => {
      clearInterval(hb);
      unsubscribe();
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
      try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(dir.issueTicket(currentAccount(res), id, body.intent));
      } catch (e) {
        rethrow(e);
      }
    }),
  );

  return r;
}
