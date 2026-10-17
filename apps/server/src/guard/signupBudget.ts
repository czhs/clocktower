// (v2.3 security, sec-host — HOST-04) Server-wide sign-up budget.
//
// Per-IP buckets (5 burst, 1 per 2 min) do not bound the TOTAL: many addresses can create accounts
// without limit (DB growth on the shared root filesystem, SSE/lobby slot squatting). This is one
// global token bucket: burst = `perHour`, refilled at `perHour` per hour. Over budget → 503 with
// Retry-After, before any scrypt work. `perHour = 0` disables it (tests, or the operator's choice).
// `perHour` may be a getter (live settings): a changed value starts a fresh bucket.
import type { RequestHandler } from 'express';
import { RateLimiter } from '../auth/rateLimit.js';

export function signupBudget(perHour: number | (() => number)): RequestHandler {
  const get = typeof perHour === 'function' ? perHour : () => perHour;
  let limiter: RateLimiter | null = null;
  let forValue = -1;
  return (_req, res, next) => {
    const value = get();
    if (!value) return next();
    if (!limiter || forValue !== value) {
      limiter = new RateLimiter({ capacity: value, refillPerSec: value / 3600 }, 1);
      forValue = value;
    }
    if (limiter.take('global')) return next();
    res.setHeader('Retry-After', String(Math.max(60, limiter.retryAfterSec('global'))));
    res.status(503).json({ error: 'rate_limited', message: 'Too many new accounts right now, please try again later' });
  };
}
