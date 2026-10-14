import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { CreateAccountRequest, SignInRequest, UpdateProfileRequest, type ApiErrorCode } from '@ct/protocol';
import type { AccountRecord } from '@ct/db';
import type { Services } from '../services.js';
import type { RateLimiter } from './rateLimit.js';

// ---------------------------------------------------------------------------------------
// Shared HTTP helpers (used by auth, directory and admin routers).

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

export function sendError(res: Response, status: number, code: ApiErrorCode, message: string): void {
  res.status(status).json({ error: code, message });
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw new HttpError(400, 'bad_request', `${where}${first?.message ?? 'invalid request'}`);
  }
  return r.data;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function sessionCookie(services: Services, token: string, maxAgeSec: number): string {
  const { cookieName, cookieSecure } = services.config;
  const parts = [`${cookieName}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function setSession(res: Response, services: Services, token: string): void {
  res.append('Set-Cookie', sessionCookie(services, token, services.config.sessionTtlDays * 86400));
}

function clearSession(res: Response, services: Services): void {
  res.append('Set-Cookie', sessionCookie(services, '', 0));
}

function sessionToken(req: Request, services: Services): string | undefined {
  return parseCookies(req.headers.cookie)[services.config.cookieName];
}

/** Attaches `res.locals.account` or answers 401. Re-issues the cookie on sliding refresh. */
export function requireAccount(services: Services): RequestHandler {
  return (req, res, next) => {
    const token = sessionToken(req, services);
    const auth = services.auth.authenticate(token);
    if (!auth) return sendError(res, 401, 'unauthenticated', 'Sign in required');
    if (auth.refreshed && token) setSession(res, services, token);
    res.locals.account = auth.account;
    next();
  };
}

export function currentAccount(res: Response): AccountRecord {
  return res.locals.account as AccountRecord;
}

/**
 * CSRF / content hardening for every state-changing request: JSON content type only, and an
 * Origin header (when sent) must be our public origin or this request's own origin (SSH-forwarded
 * dev on http://localhost:3001). SameSite=Lax cookies complete the picture.
 */
export function mutationGuard(services: Services): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!req.is('application/json')) return sendError(res, 415, 'bad_request', 'Content-Type must be application/json');
    const origin = req.headers.origin;
    if (origin !== undefined) {
      const own = `${req.protocol}://${req.get('host') ?? ''}`;
      if (origin !== services.config.publicOrigin && origin !== own) {
        return sendError(res, 403, 'forbidden', 'Cross-origin request rejected');
      }
    }
    next();
  };
}

export function rateLimit(limiter: RateLimiter, keyOf: (req: Request, res: Response) => string): RequestHandler {
  return (req, res, next) => {
    const key = keyOf(req, res);
    if (limiter.take(key)) return next();
    res.setHeader('Retry-After', String(Math.max(1, limiter.retryAfterSec(key))));
    sendError(res, 429, 'rate_limited', 'Too many attempts, please wait a moment');
  };
}

export const clientIp = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/** Wraps async handlers so thrown HttpErrors become JSON errors (Express 5 also forwards rejections). */
export function handler(fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
}

export function errorMiddleware(services: Services) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) {
      if (err.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec));
      return sendError(res, err.status, err.code, err.message);
    }
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') return sendError(res, 400, 'bad_request', 'Malformed JSON');
    if (e?.type === 'entity.too.large') return sendError(res, 413, 'bad_request', 'Request too large');
    services.log.error('http handler failed', { path: req.path, err: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'internal', 'Internal error');
  };
}

// ---------------------------------------------------------------------------------------
// /api/auth/* and /api/me*

export function authRouter(services: Services): express.Router {
  const r = express.Router();
  const auth = requireAccount(services);
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  r.use(noStore);

  r.post(
    '/auth/create',
    rateLimit(services.limits.createAccount, (req) => clientIp(req)),
    handler(async (req, res) => {
      const body = parseBody(CreateAccountRequest, req.body);
      const created = await services.auth.createAccount(body.displayName);
      setSession(res, services, created.token);
      res.status(201).json({ account: services.auth.view(created.account), passphrase: created.passphrase });
    }),
  );

  r.post(
    '/auth/signin',
    rateLimit(services.limits.signIn, (req) => clientIp(req)),
    handler(async (req, res) => {
      const body = parseBody(SignInRequest, req.body);
      const result = await services.auth.signIn(body.passphrase);
      if (!result) throw new HttpError(401, 'unauthenticated', 'That passphrase does not match any account');
      setSession(res, services, result.token);
      res.json(services.auth.view(result.account));
    }),
  );

  r.post(
    '/auth/signout',
    handler((req, res) => {
      const token = sessionToken(req, services);
      if (token) services.auth.signOut(token);
      clearSession(res, services);
      res.json({ ok: true });
    }),
  );

  r.get('/me', auth, (_req, res) => {
    res.json(services.auth.view(currentAccount(res)));
  });

  r.patch(
    '/me',
    auth,
    handler((req, res) => {
      const body = parseBody(UpdateProfileRequest, req.body);
      const updated = services.accounts.updateProfile(currentAccount(res).id, body);
      if (!updated) throw new HttpError(404, 'not_found', 'Account not found');
      res.json(services.auth.view(updated));
    }),
  );

  r.get('/me/stats', auth, (_req, res) => {
    res.json(services.stats.statsFor(currentAccount(res).id));
  });

  return r;
}
