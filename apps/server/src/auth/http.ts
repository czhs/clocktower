import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { CreateAccountRequest, nameSkeleton, SignInRequest, UpdateProfileRequest, type ApiErrorCode } from '@ct/protocol';
import { isAllowedPreset } from './presets.js';
import type { AccountRecord } from '@ct/db';
import type { Services } from '../services.js';
import { signupBudget } from '../guard/signupBudget.js';
import { getHostLimits } from '../guard/hostLimits.js';
import { RateLimiter } from './rateLimit.js';
import { ipRangeKeys, ipRangeOf, TieredLimiter } from './limits.js';

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

function setSession(res: Response, services: Services, token: string, maxAgeSec = services.config.sessionTtlDays * 86400): void {
  res.append('Set-Cookie', sessionCookie(services, token, maxAgeSec));
}

function clearSession(res: Response, services: Services): void {
  res.append('Set-Cookie', sessionCookie(services, '', 0));
}

export function sessionToken(req: Request, services: Services): string | undefined {
  return parseCookies(req.headers.cookie)[services.config.cookieName];
}

/** Attaches `res.locals.account` or answers 401. Re-issues the cookie on sliding refresh. */
export function requireAccount(services: Services): RequestHandler {
  return (req, res, next) => {
    const token = sessionToken(req, services);
    const auth = services.auth.authenticate(token);
    if (!auth) return sendError(res, 401, 'unauthenticated', 'Sign in required');
    const susp = services.moderation.suspension(auth.account.id); // (v2.3 OPS-1)
    if (susp) {
      const e = services.moderation.suspendedError(susp);
      return sendError(res, e.status, e.code, e.message);
    }
    if (auth.refreshed && token) setSession(res, services, token, auth.maxAgeSec);
    res.locals.account = auth.account;
    res.locals.sid = auth.sid; // (v2.3 AUTH-1) bound into join tickets / SSE streams
    res.locals.sessionCreatedAt = auth.sessionCreatedAt; // (v2.3 AUTH-8) step-up: recent sign-in
    next();
  };
}

export function currentAccount(res: Response): AccountRecord {
  return res.locals.account as AccountRecord;
}

/** (v2.3 AUTH-1) Non-secret id of the request's session (set by requireAccount). */
export function currentSid(res: Response): string | undefined {
  return res.locals.sid as string | undefined;
}

/**
 * (v2.3 AUTH-3) Like rateLimit, but keyed by every range of the client address ([exact] for IPv4,
 * [/64, /56, /48] for IPv6): all tiers must have a token, and either all or none are consumed.
 */
export function rateLimitRanges(base: RateLimiter): RequestHandler {
  const tiered = new TieredLimiter(base);
  return (req, res, next) => {
    const r = tiered.take(ipRangeKeys(req.ip ?? req.socket.remoteAddress ?? 'unknown'));
    if (r.ok) return next();
    res.setHeader('Retry-After', String(r.retryAfterSec));
    sendError(res, 429, 'rate_limited', 'Too many attempts, please wait a moment');
  };
}

/** (v2.3 AUTH-2) The widest range of the client address (unit of the scrypt gate's per-range cap). */
export const clientRange = (req: Request): string => ipRangeOf(req.ip ?? req.socket.remoteAddress ?? 'unknown');

/** (v2.3 AUTH-10) The raw session token the request carries, if any. */
export function requestSessionToken(req: Request, services: Services): string | undefined {
  return sessionToken(req, services);
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

/**
 * Rate-limit key for the client. IPv6 clients control at least a /64, so they are keyed by their
 * /64 prefix (SR-3); IPv4 and v4-mapped addresses are keyed exactly.
 */
export const clientIp = (req: Request): string => ipKey(req.ip ?? req.socket.remoteAddress ?? 'unknown');

export function ipKey(ip: string): string {
  if (!ip.includes(':') || ip.startsWith('::ffff:') || ip === '::1') return ip;
  const [head = '', tail = ''] = ip.split('%')[0]!.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${full
    .slice(0, 4)
    .map((x) => x.toLowerCase().padStart(4, '0'))
    .join(':')}::/64`;
}

/** Display names that would let a player impersonate the game itself in chat (SR-11). */
// (v2.3 WEB-7) compared by look-alike skeleton, so 'Ѕtoryteller' (Cyrillic S), 'Narrat0r' or 'SYSTEM (2)'-style
// spellings that fold to the same letters are reserved too.
const RESERVED_NAMES = new Set(['storyteller', 'thestoryteller', 'system', 'narrator', 'thenarrator', 'server', 'admin'].map(nameSkeleton));
export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(nameSkeleton(name));
}

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
    const e = err as { type?: string; status?: number; statusCode?: number };
    if (e?.type === 'entity.parse.failed') return sendError(res, 400, 'bad_request', 'Malformed JSON');
    if (e?.type === 'entity.too.large') return sendError(res, 413, 'bad_request', 'Request too large');
    // Other client errors raised by Express/body parsers (e.g. a malformed %-escape in a path
    // param): the client's fault, not ours — no error log line, generic message (SR-9).
    const status = e?.status ?? e?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) return sendError(res, status, 'bad_request', 'Bad request');
    services.log.error('http handler failed', { path: req.path, err: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'internal', 'Internal error');
  };
}

// ---------------------------------------------------------------------------------------
// /api/auth/* and /api/me*

export function authRouter(services: Services): express.Router {
  const r = express.Router();
  const scrypt = services.scryptGate; // (v2.3 AUTH-2) shared with step-up checks
  const auth = requireAccount(services);
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  r.use(noStore);

  r.post(
    '/auth/create',
    rateLimitRanges(services.limits.createAccount), // (v2.3 AUTH-3) /64 + /56 + /48
    // v2.3 HOST-04 (guard/signupBudget.ts): live setting; env HOST_SIGNUP_PER_HOUR is the per-process default.
    signupBudget(() => {
      const v = getHostLimits().signupPerHour;
      return v >= 0 ? v : services.config.signupPerHour;
    }),
    handler(async (req, res) => {
      const body = parseBody(CreateAccountRequest, req.body);
      if (isReservedName(body.displayName)) throw new HttpError(400, 'bad_request', 'That name is reserved, please pick another');
      const created = await scrypt.run(clientRange(req), () => services.auth.createAccount(body.displayName));
      const previous = sessionToken(req, services); // AUTH-10: this browser's old session ends here
      if (previous) services.auth.signOut(previous);
      setSession(res, services, created.token, created.maxAgeSec);
      services.moderation.noteIp(created.account.id, clientIp(req)); // (v2.3 OPS-1) for "block this account's network"
      res.status(201).json({ account: services.auth.view(created.account), passphrase: created.passphrase });
    }),
  );

  r.post(
    '/auth/signin',
    rateLimitRanges(services.limits.signIn), // (v2.3 AUTH-3) /64 + /56 + /48
    handler(async (req, res) => {
      const body = parseBody(SignInRequest, req.body);
      const result = await scrypt.run(clientRange(req), () => services.auth.signIn(body.passphrase));
      if (!result) throw new HttpError(401, 'unauthenticated', 'That passphrase does not match any account');
      const susp = services.moderation.suspension(result.account.id); // (v2.3 OPS-1)
      if (susp) {
        services.auth.signOut(result.token);
        const e = services.moderation.suspendedError(susp);
        throw new HttpError(e.status, e.code, e.message);
      }
      services.moderation.noteIp(result.account.id, clientIp(req));
      const previous = sessionToken(req, services); // AUTH-10: this browser's old session ends here
      if (previous) services.auth.signOut(previous);
      setSession(res, services, result.token, result.maxAgeSec);
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

  /** SR-12: sign out every device of this account (all sessions are deleted). */
  r.post(
    '/auth/signout-all',
    auth,
    handler((_req, res) => {
      services.auth.revokeAll(currentAccount(res).id); // AUTH-1: also closes live rooms / streams
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
      if (body.cosmetics && !isAllowedPreset(body.cosmetics.preset)) throw new HttpError(400, 'bad_request', 'Pick one of the characters');
      if (body.displayName !== undefined && isReservedName(body.displayName)) throw new HttpError(400, 'bad_request', 'That name is reserved, please pick another');
      const updated = services.accounts.updateProfile(currentAccount(res).id, body);
      if (!updated) throw new HttpError(404, 'not_found', 'Account not found');
      res.json(services.auth.view(updated));
    }),
  );

  // (v2.2 stats) The signed-in account's own record only (the id comes from the session, never
  // from the request). Light per-account limit: the home screen fetches it on open/return.
  const statsLimiter = new RateLimiter({ capacity: 20, refillPerSec: 0.5 });
  r.get('/me/stats', auth, rateLimit(statsLimiter, (_req, res) => currentAccount(res).id), (_req, res) => {
    res.json(services.stats.statsFor(currentAccount(res).id));
  });

  return r;
}
