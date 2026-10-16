import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/**
 * scrypt cost for NEW verifiers. (v2.3 AUTH-2) N=2^12, r=8, p=1 ≈ 4 MiB / ~8-10 ms per hash (was
 * 2^15 ≈ 32 MiB / 60-100 ms). Passphrases are 6 CSPRNG words (≈77.5 bits) and the lookup is a
 * peppered HMAC, so slow hashing buys nothing against offline guessing (2^77 hashes even at GPU
 * speed is out of reach), while the 8x cheaper hash makes sign-in floods far less effective.
 * Older `scrypt$32768$…` verifiers still verify (the format is self-describing) and are re-hashed
 * at this cost on the next successful sign-in.
 */
export const DEFAULT_SCRYPT_N = 1 << 12;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

/** Deterministic lookup key: HMAC-SHA256(pepper, normalized passphrase), hex. */
export function passphraseLookup(pepper: string, normalized: string): string {
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

/** Returns a fresh per-account salt and a self-describing verifier `scrypt$N$r$p$<hex>`. */
export async function makeVerifier(normalized: string, n = DEFAULT_SCRYPT_N): Promise<{ salt: string; verifier: string }> {
  const salt = randomBytes(16);
  const key = await scrypt(normalized, salt, KEYLEN, { N: n, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * n * SCRYPT_R });
  return { salt: salt.toString('hex'), verifier: `scrypt$${n}$${SCRYPT_R}$${SCRYPT_P}$${key.toString('hex')}` };
}

/** Constant-time verification against a stored verifier. Malformed verifiers never match. */
export async function checkVerifier(normalized: string, saltHex: string, verifier: string): Promise<boolean> {
  const parts = verifier.split('$');
  if (parts.length !== 5 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const expected = Buffer.from(parts[4]!, 'hex');
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length !== KEYLEN) return false;
  const key = await scrypt(normalized, Buffer.from(saltHex, 'hex'), KEYLEN, { N: n, r, p, maxmem: 256 * n * r });
  return timingSafeEqual(key, expected);
}

/** The scrypt N of a stored verifier (null if malformed). */
export function verifierCost(verifier: string): number | null {
  const parts = verifier.split('$');
  const n = Number(parts[1]);
  return parts.length === 5 && parts[0] === 'scrypt' && Number.isInteger(n) ? n : null;
}

/** 32 random bytes, base64url. Only its SHA-256 is persisted. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** URL-safe random id of exactly `len` chars from [A-Za-z0-9_-]. */
export function randomId(len: number): string {
  let s = '';
  while (s.length < len) s += randomBytes(len).toString('base64url');
  return s.slice(0, len);
}
