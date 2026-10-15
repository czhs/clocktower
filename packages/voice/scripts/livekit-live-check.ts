// LIVE CHECK against a real LiveKit project (run once credentials exist; never in CI without them).
//
//   LIVEKIT_URL=wss://<project>.livekit.cloud LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… \
//   LIVEKIT_ROOM_PREFIX=dev pnpm exec tsx packages/voice/scripts/livekit-live-check.ts
//   (on hshi-u1: `set -a; . ~/clocktower/env/dev.env; set +a` first, then the command above)
//
// Verifies with the real LiveKit API that our tokens admit a participant to exactly its own room:
//   1. a minted token validates (signature + grant accepted by the server);
//   2. the same token with its room claim edited to another room is rejected (signature);
//   3. a token signed with a wrong secret is rejected;
//   4. a signalling connection with token A shows up in room A and NOT in room B;
//   5. RoomServiceClient.removeParticipant() disconnects it (revocation works);
//   6. room names carry the env prefix (dev/prod separation).
// Uses ~1 participant-minute at most. Tokens and secrets are never printed.
import { randomBytes } from 'node:crypto';
import { livekitHttpUrl, mintVoiceToken, RoomServiceClient, roomNameFor } from '../src/index.js';

const url = process.env.LIVEKIT_URL ?? '';
const apiKey = process.env.LIVEKIT_API_KEY ?? '';
const apiSecret = process.env.LIVEKIT_API_SECRET ?? '';
const prefix = process.env.LIVEKIT_ROOM_PREFIX || 'dev';

let failures = 0;
function check(ok: boolean, what: string, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
}

async function validate(token: string): Promise<number> {
  const base = livekitHttpUrl(url);
  // '/rtc/validate' first: on current LiveKit Cloud '/rtc/v1/validate' authenticates the token
  // but then answers a valid one with 400 "join_request is required" (verified 2026-10-15).
  for (const path of ['/rtc/validate', '/rtc/v1/validate']) {
    const res = await fetch(`${base}${path}?access_token=${encodeURIComponent(token)}`);
    if (res.status !== 404) return res.status;
  }
  return 404;
}

function forgeRoom(token: string, room: string): string {
  const [h, p, s] = token.split('.') as [string, string, string];
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { video: { room: string } };
  payload.video.room = room;
  return `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
}

type WS = {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((e: unknown) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  close(): void;
};

async function openSignal(token: string): Promise<{ ws: WS; joined: boolean; closed: Promise<number> }> {
  const Ctor = (globalThis as unknown as { WebSocket?: new (u: string) => WS }).WebSocket;
  if (!Ctor) throw new Error('global WebSocket missing (Node >= 22 required)');
  const wsUrl = url.replace(/\/$/, '');
  const ws = new Ctor(`${wsUrl}/rtc?access_token=${encodeURIComponent(token)}&auto_subscribe=1&sdk=js&version=2.22.4&protocol=16&adaptive_stream=0`);
  ws.binaryType = 'arraybuffer';
  let resolveClosed!: (c: number) => void;
  const closed = new Promise<number>((r) => (resolveClosed = r));
  ws.onclose = (e) => resolveClosed(e.code);
  const joined = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    ws.onmessage = () => {
      clearTimeout(t);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(t);
      resolve(false);
    };
  });
  return { ws, joined, closed };
}

async function identities(svc: RoomServiceClient, room: string): Promise<string[]> {
  try {
    return (await svc.listParticipants(room)).map((p) => p.identity);
  } catch {
    return []; // room does not exist
  }
}

async function main() {
  if (!url || !apiKey || !apiSecret) {
    console.log('SKIP  LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — nothing to check.');
    return;
  }
  const lobby = `lc${randomBytes(4).toString('hex')}`;
  const roomA = roomNameFor(prefix, lobby, 'bld:house-0');
  const roomB = roomNameFor(prefix, lobby, 'bld:house-1');
  console.log(`live check against ${new URL(livekitHttpUrl(url)).host}, rooms ${roomA} / ${roomB}`);
  check(roomA.startsWith(`${prefix}-`) && roomB.startsWith(`${prefix}-`), 'room names carry the env prefix');

  const svc = new RoomServiceClient(livekitHttpUrl(url), apiKey, apiSecret);
  const tokenA = await mintVoiceToken({ apiKey, apiSecret, identity: 'lc-a', name: 'Live check A', room: roomA, canPublish: true, ttlSec: 120 });

  check((await validate(tokenA)) === 200, 'token for room A is accepted');
  const forged = await validate(forgeRoom(tokenA, roomB));
  check(forged === 401 || forged === 403, 'token A edited to room B is rejected', `HTTP ${forged}`);
  const wrong = await mintVoiceToken({ apiKey, apiSecret: `${apiSecret}x`, identity: 'lc-x', name: 'x', room: roomA, canPublish: true, ttlSec: 120 });
  const wrongStatus = await validate(wrong);
  check(wrongStatus === 401 || wrongStatus === 403, 'token signed with a wrong secret is rejected', `HTTP ${wrongStatus}`);

  let sig: Awaited<ReturnType<typeof openSignal>> | null = null;
  try {
    sig = await openSignal(tokenA);
    check(sig.joined, 'signalling join with token A succeeds');
    await new Promise((r) => setTimeout(r, 1500));
    const inA = await identities(svc, roomA);
    const inB = await identities(svc, roomB);
    check(inA.includes('lc-a'), 'participant is listed in room A', `A=[${inA.join(',')}]`);
    check(!inB.includes('lc-a'), 'participant is NOT in room B', `B=[${inB.join(',')}]`);
    await svc.removeParticipant(roomA, 'lc-a');
    const code = await Promise.race([sig.closed, new Promise<number>((r) => setTimeout(() => r(-1), 8000))]);
    const after = await identities(svc, roomA);
    check(!after.includes('lc-a'), 'removeParticipant revokes the participant', `ws close ${code}`);
  } catch (e) {
    check(false, 'signalling / room service checks', (e as Error).message);
  } finally {
    sig?.ws.close();
    for (const r of [roomA, roomB]) await svc.deleteRoom(r).catch(() => undefined);
  }
  console.log(failures ? `${failures} check(s) FAILED` : 'all live checks passed');
  process.exitCode = failures ? 1 : 0;
}

void main();
