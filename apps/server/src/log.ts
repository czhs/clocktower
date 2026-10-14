import type { Logger } from './rooms/modules.js';

// LEAD-OWNED. JSON-lines logger to stdout (journald captures it per service). Redacts keys that
// look secret. Never pass passphrases, tokens or whole hidden-state objects to the logger.

const REDACT = /pass|secret|token|ticket|cookie|authorization|grimoire/i;
const recentErrors: { at: number; message: string }[] = [];

function scrub(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = REDACT.test(k) ? '[redacted]' : v;
  return out;
}

export function createLogger(scope: string): Logger {
  const write = (level: string, msg: string, data?: Record<string, unknown>) => {
    if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...scrub(data) });
    if (level === 'error') {
      recentErrors.push({ at: Date.now(), message: `${scope}: ${msg}` });
      if (recentErrors.length > 50) recentErrors.shift();
      process.stderr.write(line + '\n');
    } else process.stdout.write(line + '\n');
  };
  return {
    debug: (m, d) => write('debug', m, d),
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}

export function getRecentErrors() {
  return recentErrors.slice();
}
