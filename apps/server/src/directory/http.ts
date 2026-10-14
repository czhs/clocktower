import express from 'express';
import { CreateLobbyRequest, JoinTicketRequest, type DirectoryEvent } from '@ct/protocol';
import type { Services } from '../services.js';
import { currentAccount, handler, HttpError, parseBody, rateLimit, requireAccount } from '../auth/http.js';
import { DirectoryError } from './service.js';

export const SSE_HEARTBEAT_MS = 20_000;
const LOBBY_ID_RE = /^[A-Za-z0-9_-]{4,32}$/;

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

  r.get('/lobbies', auth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ lobbies: dir.list() });
  });

  r.get('/lobbies/stream', auth, (req, res) => {
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
    };
    req.on('close', close);
    res.on('close', close);
  });

  r.post(
    '/lobbies',
    auth,
    rateLimit(services.limits.createLobby, (_req, res) => currentAccount(res).id),
    handler(async (req, res) => {
      const body = parseBody(CreateLobbyRequest, req.body);
      const lobby = await dir.create(currentAccount(res), body).catch(rethrow);
      res.status(201).json({ lobby });
    }),
  );

  r.get('/lobbies/:id', auth, (req, res) => {
    const id = String(req.params.id);
    const lobby = LOBBY_ID_RE.test(id) ? dir.get(id) : null;
    if (!lobby) throw new HttpError(404, 'not_found', 'Lobby not found');
    res.json({ lobby });
  });

  r.post(
    '/lobbies/:id/ticket',
    auth,
    rateLimit(services.limits.ticket, (_req, res) => currentAccount(res).id),
    handler((req, res) => {
      const id = String(req.params.id);
      if (!LOBBY_ID_RE.test(id)) throw new HttpError(404, 'not_found', 'Lobby not found');
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
