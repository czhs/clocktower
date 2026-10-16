// Local preview entry point, for Docker or Node 24. Credentials persist beside the LOCAL DB so
// rebuilding/restarting does not invalidate saved passphrases. Never reads deployment env files.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const dataDir = path.resolve('data/local');
mkdirSync(dataDir, { recursive: true });
const secretFile = path.join(dataDir, 'secrets.json');
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, JSON.stringify({
    sessionSecret: randomBytes(32).toString('hex'),
    passphrasePepper: randomBytes(32).toString('hex'),
  }), { mode: 0o600, flag: 'wx' });
}
const secrets = JSON.parse(readFileSync(secretFile, 'utf8'));
const env = process.env;
env.APP_ENV ??= 'development';
env.HOST ??= '127.0.0.1';
env.PORT ??= '3002';
env.APP_PUBLIC_ORIGIN ??= `http://localhost:${env.PORT}`;
env.COOKIE_SECURE ??= 'false';
env.DATABASE_URL ??= `file:${path.join(dataDir, 'clocktower.db')}`;
env.SESSION_SECRET ??= secrets.sessionSecret;
env.PASSPHRASE_PEPPER ??= secrets.passphrasePepper;
env.LIVEKIT_ROOM_PREFIX ??= 'local';
env.CT_VERSION ??= 'local-preview';

await import('../apps/server/dist/server.js');
