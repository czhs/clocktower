# Application security review

_Security-review teammate, 2026-10-15. Scope: application code and repo (the host configuration is
reviewed separately by the lead). Tree reviewed: `main` @ `4602091` plus the uncommitted working
tree at the time of review. Nothing here was committed._

Probes ran only against throwaway servers on hshi-u1 `127.0.0.1:3360-3369` (temp DB, random secrets).
The only requests sent to production were three plain reads: `GET https://…/`, `GET https://…/healthz`
and `GET http://…/` to check the redirect. No attack traffic was sent to prod or dev.

**How each finding was established:** **P** = demonstrated by a probe/test that I ran ·
**R** = established by reading the code (and, where noted, the dependency source on hshi-u1).

## Findings (prioritised)

| # | Sev | Where | Issue | Fix | Owner | How |
|---|---|---|---|---|---|---|
| SR-1 | **High** | `apps/server/src/app.ts:64-67` → `@colyseus/core` `Server.handleMatchMakeRequest` (`build/Server.mjs:195`) | Colyseus intercepts every request whose URL **contains** `/matchmake` *before Express* and buffers the whole body into memory with no limit (`req.on('data', c => data.push(c))`, then `Buffer.concat` + `toString` + `JSON.parse`). No auth is needed. A 96 MiB body raised server peak RSS from 286 to 629 MiB (+343 MiB, ~3.5x the body). Cloudflare forwards bodies of up to 100 MB on the Free plan, and the prod unit has `MemoryMax=1536M` with no swap, so 3-4 concurrent uploads should get prod OOM-killed. That would wipe every in-memory lobby and game in progress. The 32 kB `express.json` limit never sees these requests. | In `app.ts`, after `new Server(...)`, wrap the `request` listeners that Colyseus installed. Reject with 413 any `/matchmake` POST that has no `Content-Length` or one over 4 KiB, and destroy the socket (snippet A below). In the same change, apply SR-4 and SR-5. | lead | P (`review-probes` SR-1) + R |
| SR-2 | **Medium** (high impact on game night if anyone targets it) | `apps/server/src/directory/service.ts:8,97-104`; `services.ts:36-38`; prod `LOBBY_MAX_COUNT=4` | Anyone on the internet can create accounts (5 per IP, then 1 per 2 min). Each account can hold 2 lobbies. So **two free accounts fill all 4 prod lobby slots** and every real host gets `409 lobby_limit`. Empty lobbies only dispose after `LOBBY_IDLE_TIMEOUT_SEC` (600 s), and the squatter can re-create them or keep one socket connected. There is no admin "close lobby" action, and `ADMIN_ACCOUNT_IDS` is empty in prod, so the only remedy is restarting the service. The domain is discoverable through Certificate Transparency logs. | (a) An optional `SIGNUP_CODE` env checked by `POST /api/auth/create`, shared with friends. This also stops account spam (SR-3). (b) An admin `POST /api/admin/lobbies/:id/close`, with `ADMIN_ACCOUNT_IDS` set in prod. (c) Dispose a lobby that no member has joined within ~2 min. (d) A per-IP lobby cap. | lobby-auth (this phase: playtest) | P (`review-probes` SR-2: with `LOBBY_MAX_COUNT=8`, 4 accounts filled it and the next host got 409) |
| SR-3 | **Medium** | `apps/server/src/auth/http.ts:120` (`clientIp`), used by `:161`, `:172` | Per-IP buckets are keyed on the full address. An IPv6 client has at least a /64 (2^64 addresses), so it can rotate addresses and get unlimited sign-ups and sign-in attempts. Each attempt costs one scrypt (N=2^15, 32 MiB, ~60-100 ms) on libuv's 4-thread pool, which `express.static`/`send` also use. That is a CPU and threadpool DoS, plus unbounded account/DB growth, and it amplifies SR-2. Online passphrase guessing stays infeasible (77.5-bit passphrases). | Key IPv6 buckets by /64 (snippet B). Optionally add a small global token bucket for `/auth/create` and `/auth/signin` (e.g. 30/min) so scrypt can't saturate the pool. | lobby-auth (this phase: playtest) | P (`review-probes` SR-3: 14 sign-ins from 14 addresses in one /64, no 429) |
| SR-4 | **Medium** | `@colyseus/core` `Debug.mjs` `debugAndPrintError`; `ws-transport` `onConnection`; `rooms/GameRoom.ts:203` | Anonymous requests write log output, mostly multi-line stack traces: a WebSocket upgrade to any path (`seat reservation expired.`), `POST /matchmake/create/game` (the `ZodError` stack from `GameRoom.onCreate`), and `POST /matchmake/joinOrCreate/game` with any 10+ char ticket (`ticket rejected`). **60 anonymous requests produced 860 log lines.** journald's per-unit rate limit will then drop real errors during an attack. Real errors are what an operator needs; `recentErrors` on the admin page gets flushed. | Pass `new Server({ logger })` a wrapper that collapses stacks to one line and rate-limits `error`. Set `matchMaker.controller.exposedMethods = ['joinById','reconnect']`; the client uses only these (`apps/client/src/net/room.ts:43,50`). Give `WebSocketTransport` a `verifyClient` that rejects upgrades with no reserved seat (snippet A). Downgrade or rate-limit the `ticket rejected` log. | lead (app.ts); lobby-auth/playtest (GameRoom.ts:203) | P (`review-probes` SR-4) + R |
| SR-5 | **Low** | `@colyseus/core` `matchmaker/controller.mjs:6-35` | The matchmaker answers every Origin with `Access-Control-Allow-Origin: <that origin>` + `Allow-Credentials: true`. Today this has no impact: matchmaking is authorised by the HMAC ticket in the body, not by cookies, and `/api` has no CORS. But it is a latent cross-origin read primitive if cookie auth is ever added there. | `matchMaker.controller.getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': config.publicOrigin })` and drop `Allow-Credentials` from `DEFAULT_CORS_HEADERS`. | lead | P (`review-probes` SR-5) |
| SR-6 | **Low/Medium** | `apps/server/src/directory/http.ts:27-49` | There is no cap on SSE streams per account, per IP or in total. One account held 40 concurrent `/api/lobbies/stream` connections. Each one is an open socket, a 20 s interval timer and a fan-out subscriber. Combined with SR-3 (free accounts) this can exhaust FDs and memory. | Cap streams per account (e.g. 4; close the oldest) and globally (e.g. 500 → 503). | lobby-auth (this phase: playtest) | P (`review-probes` SR-6) |
| SR-7 | **Low** (defence in depth) | `apps/server/src/app.ts:39-44` | There is no `Content-Security-Policy` and no `Strict-Transport-Security`; the prod response headers I read confirmed both are missing. I found no XSS sink, so this is hardening only. | Add the CSP below to every response (or at least to `index.html`) and add `Strict-Transport-Security: max-age=31536000` when `publicOrigin` is https (or turn on HSTS in Cloudflare). | lead | P (`review-csp` test: built client + this CSP → sign-up, lobby, town, WS, zero CSP violations apart from guarded eval feature-detection) |
| SR-8 | **Low** | `apps/server/src/auth/http.ts:56-60`, `config.ts:54` | The session cookie has no `__Host-` prefix. A page on any sibling `*.chrisshi.com` host could set a `ct_session` cookie for `.chrisshi.com` ("cookie tossing" or login-CSRF: the victim ends up signed in as the attacker). This needs control of another chrisshi.com subdomain. | Name the prod cookie `__Host-ct_session` (it already has `Secure` + `Path=/` and no `Domain`). | lead (config.ts) + lobby-auth | R |
| SR-9 | **Low** | `apps/server/src/auth/http.ts:133-145` | `GET /api/lobbies/%ZZ` (no auth needed) returns **500** and writes an `error` log line (`Failed to decode param '%ZZ'`). Express 5 sets `err.status = 400`, but `errorMiddleware` ignores it. Each request pushes one entry into the admin `recentErrors` buffer. | In `errorMiddleware`, map any `err.status` (or `statusCode`) in 400-499 to that status with a generic `bad_request`, and don't log it at error level. | lobby-auth (this phase: playtest) | P (`review-probes` SR-9) |
| SR-10 | Info | `apps/server/src/app.ts:46-48` | `/healthz` is public and returns `env` plus the full git SHA (prod: `0d725691…`). The repo is private, so the impact is negligible. | Optionally return only `{ok:true}` publicly and the version only on the admin route. | lead | P (prod header read) |
| SR-11 | Info | `apps/server/src/rooms/GameRoom.ts:277-325`, `packages/protocol/src/text.ts` | Display names are not unique within a lobby, and names like "Storyteller" are allowed. In a social-deduction game a player can impersonate another player in zone chat. Message `scope` is set server-side, so a real ST message is distinguishable. | Show a per-lobby suffix on duplicate names and reserve "Storyteller"/"System". | lobby-auth / ux | R |
| SR-12 | Info | `apps/server/src/auth/service.ts` | A passphrase can't be rotated, and there is no "sign out everywhere", even though the repo method `sessions.deleteForAccount` exists. A leaked passphrase is permanent. Existing WS/SSE connections also survive sign-out (tickets are only checked at join). | Add "regenerate passphrase" (new lookup + verifier, delete all sessions) and "sign out all devices". | lobby-auth | R |
| SR-13 | Info | `packages/rules/src/util.ts:172` | The ST can add an unbounded number of distinct reminder tokens (≤40 chars each, 10 msg/s). This only affects the ST's own lobby (memory and view size). | Cap reminders per player (e.g. 20). | rules-storyteller (this phase: playtest) | R |
| SR-14 | Info | `pnpm audit --prod` | There are 4 advisories, all for `nanoid@2.1.11` via `@colyseus/core`: 3 high (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w) and 1 moderate (GHSA-mwcw-c2x4-8c55). All concern caller-supplied size/alphabet values. Colyseus only calls `nanoid(9)` with a constant (`build/utils/Utils.mjs:7-8`), so none of them is reachable. | Nothing to do now; bump when Colyseus updates. | lead | P (audit) + R |

### Snippet A — matchmaker/WS hardening (`apps/server/src/app.ts`, after `new Server(...)`)

```ts
import { matchMaker } from '@colyseus/core';

matchMaker.controller.exposedMethods = ['joinById', 'reconnect'];          // SR-4: no anonymous create/joinOrCreate
matchMaker.controller.DEFAULT_CORS_HEADERS = { ...matchMaker.controller.DEFAULT_CORS_HEADERS };
delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Credentials'];
matchMaker.controller.getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': config.publicOrigin }); // SR-5

// SR-1: Colyseus buffers /matchmake bodies without a limit; refuse anything large before it does.
const inner = server.listeners('request').slice();
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url?.includes('/matchmake') && req.method === 'POST') {
    const len = Number(req.headers['content-length']);
    if (!(len >= 0 && len <= 4096)) {
      res.writeHead(413, { Connection: 'close', 'Content-Type': 'application/json' }).end('{"error":"too large"}');
      req.destroy();
      return;
    }
  }
  for (const l of inner) (l as http.RequestListener).call(server, req, res);
});
```

Also pass `logger` to `new Server({ ... })` (a wrapper around `log.ts` that keeps the first stack
line and drops repeats above ~10 lines/min). Pass `verifyClient` to
`new WebSocketTransport({ server, verifyClient })`. It parses `/<process>/<roomId>?sessionId=…`
and calls `cb(!!matchMaker.getLocalRoomById(roomId)?.hasReservedSeat(sessionId, reconnectionToken))`.
That rejects junk upgrades with a 401 before Colyseus logs a stack. Optionally it also requires
`info.origin` to be `config.publicOrigin` when an Origin is present.

### Snippet B — IPv6 /64 rate-limit key (`apps/server/src/auth/http.ts:120`)

```ts
export const clientIp = (req: Request): string => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip;              // IPv4 / v4-mapped
  const [head = '', tail = ''] = ip.split('%')[0]!.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${full.slice(0, 4).map((x) => x.padStart(4, '0')).join(':')}::/64`;
};
```

### Recommended CSP (SR-7) — verified against the built client

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```

- Verified (`tests/security/review-csp.test.ts`): sign-up, lobby finder, `/lobby/<id>`, then the Phaser
  town canvas and the Colyseus WS all work. The only violations reported are two `script-src eval`
  reports from guarded feature-detection (`try { new Function('') } catch {}` in msgpackr and zod).
  Both libraries fall back to their interpreters, so **`'unsafe-eval'` is not needed**. Expect
  those two reports if a `report-to` endpoint is ever added.
- **Not verified:** LiveKit (no credentials in tests). `connect-src` includes `wss://*.livekit.cloud`
  (signalling) and `https://*.livekit.cloud` (region discovery). Re-run a real-mic voice session
  with the header enabled before shipping. If a non-Cloud LiveKit URL is used, list that host
  explicitly. ICE/TURN traffic is not governed by CSP.
- `'self'` covers same-origin `wss:` in current browsers (CSP3). For very old Safari, add
  `wss://clocktower.chrisshi.com`.

## Verified OK (no finding)

| Area | Result | How |
|---|---|---|
| Path traversal | 23 raw-path probes (`..%2f`, `%2e%2e`, `%5c`, raw `\`, double-encoded, overlong UTF-8, `%00`, `/api/../`, `//etc/passwd`, dotfiles, `/assets/../.env`) never returned a file outside `dist`, a dotfile or `/etc/passwd`. `express.static` (send@1.2.1) rejects them and falls through to the SPA fallback, which always sends the fixed `dist/index.html` (`app.ts:53-58`). Dotfiles are ignored. No request data reaches any other fs path: the DB path, `LOG_DIR`, `VACUUM INTO` dest and backup paths come from env/CLI only, and backup tags are validated `^[a-z0-9-]{1,32}$`. | P + R |
| Command/code execution | No `child_process`/`eval`/`new Function`/`vm`/dynamic `import()` in server or client source (only in tests/scripts, which use `execFileSync` with fixed args). All DB access goes through Drizzle or prepared statements with bound parameters. The only `sql\`` templates interpolate column objects and numbers. `new RegExp` appears only in tests. | R |
| XSS | No `innerHTML`/`dangerouslySetInnerHTML`/`insertAdjacentHTML`/`document.write` anywhere in the client. User text renders through Preact or Phaser canvas text. The only dynamic URLs are `encodeURIComponent(lobbyId)` API paths and a route regex `^[A-Za-z0-9_-]{4,32}$`. Text is NFC-normalised with control and bidi characters stripped server-side (`protocol/src/text.ts`). Cosmetics are enums; the preset id is regex-validated plus an allow-list. | R (+ existing `xss-text` tests) |
| Passphrases | 6 words from EFF large (7776) ≈ 77.5 bits, `crypto.randomInt`. Storage: HMAC-SHA256 lookup with a pepper plus scrypt N=2^15 with a per-account salt. `timingSafeEqual`, and a dummy scrypt on unknown passphrases (equal timing). | R |
| Sessions | 32 random bytes, only the SHA-256 is stored, `HttpOnly; SameSite=Lax; Path=/`, and `Secure` in prod (`APP_PUBLIC_ORIGIN=https://clocktower.chrisshi.com`). A fresh token is issued on every sign-in, so there is no fixation. Sign-out deletes the server-side session. | R + existing `auth-api` tests (run) |
| CSRF | Every non-GET `/api` request must be `application/json` (so not a simple request) and carry `Origin` ∈ {publicOrigin, own origin} when present, plus SameSite=Lax. No state-changing GETs. | R |
| Join tickets | HMAC-SHA256 with a domain-separated key, bound to account + lobby + intent, 60 s TTL, single-use nonce, `timingSafeEqual`. Matchmaker `create`/`joinOrCreate`/`join` can't make a room: `onCreate` requires `directory.takeInit`. No public room listing (`GET /matchmake/*` → 404). | P (existing `tickets` tests + `review-probes` SR-MM) + R |
| Client IP behind cloudflared | `trust proxy = 'loopback'`, so Express takes the **rightmost** non-loopback XFF entry. Cloudflare appends the real client IP after any client-supplied XFF, so spoofed left-hand entries don't change the bucket. **Assumption:** the zone has no Transform Rule removing `X-Forwarded-For`. If it did, everyone would share one `127.0.0.1` bucket and one attacker could lock all users out of sign-in. Worth a one-off check. Any local process on hshi-u1 can spoof XFF (host scope). | P (`review-probes` SR-XFF) + R |
| WebSocket limits | `maxPayload` defaults to **4 KiB** in `@colyseus/ws-transport` (`WebSocketTransport.mjs:16-17`). There are per-pid token buckets per message type (`GameRoom.ts:71-77`). Every C2S message is Zod-validated against the `C2S` map, and unknown types are dropped. Error replies are rate-limited and invalid input is not logged. Authorisation (host/ST/player/phase) uses the server-side seat, never payload fields, so you can't vote for others or impersonate the ST. | R + existing `messages` tests (run) |
| Secrets in repo/history | `git log --all -p` (all commits) shows no real keys, tokens, `.env*` (only `.env.example`), cloudflared credentials or LiveKit URLs. `.gitignore` covers `.env*`, `*.db*`, `data/`, `logs/`. Untracked `packages/assets/ai/staging/**/codex.log` (git-ignored) contains no credentials. | R |
| Client bundle | `apps/client/dist` (built on hshi-u1) contains none of `LIVEKIT_API_SECRET`, `SESSION_SECRET`, `PASSPHRASE_PEPPER`, `apiSecret`, `livekit-server-sdk`, `AccessToken`, `scrypt`, `createHmac`, and no source maps. The client imports only `@ct/voice/shared`. | P |
| Error leakage | In production mode, malformed URIs, malformed JSON, oversized bodies and unknown routes return generic JSON or HTML with no stack or path (SR-9 is the one 500). `config.ts` never prints values. `log.ts` redacts secret-like keys. | P |

## Commands run

All on hshi-u1 via `scripts/remote.sh` (sandbox `~/clocktower/work/security`), except the local greps.

| Command | Result |
|---|---|
| `CT_AGENT=security scripts/remote.sh pnpm vitest run tests/security` | All 8 files passed: host-exposure 3, xss-text 3, auth-api 24, messages 5, leakage 3, tickets 7, review-probes 16 (8 pass + 8 "expected fail" = the open issues above), review-csp 1 |
| `CT_AGENT=security scripts/remote.sh --no-sync pnpm vitest run tests/security/review-probes.test.ts tests/security/review-csp.test.ts` | 2 files passed; 9 passed, 8 expected-fail |
| `CT_AGENT=security scripts/remote.sh --no-sync pnpm audit --prod` | 4 advisories (3 high, 1 moderate), all `nanoid@2` via `@colyseus/core`, not reachable (SR-14) |
| `CT_AGENT=security scripts/remote.sh --no-sync pnpm -r --if-present run build` + greps over `apps/client/dist/assets/*.js` | Build OK; no secrets or server code in the bundle |
| Read of Colyseus 0.16.26 / ws-transport 0.16.5 source on hshi-u1 | Basis for SR-1, SR-4, SR-5 and the WS `maxPayload` check |
| `curl -sI https://clocktower.chrisshi.com/`, `curl https://clocktower.chrisshi.com/healthz`, `curl -sI http://clocktower.chrisshi.com/` | No CSP/HSTS; healthz shows env + SHA; http → 301 |
| `git log --all -p | grep …` (secret patterns), `grep -rn` over apps/packages (sinks, exec, SQL) | See "Verified OK" |

Earlier runs while writing the tests (iterations, not separate results): the first `review-probes` run
failed because SR-9's 500 was asserted inside a general test; it was split into its own expected-fail
test. The first `review-csp` runs failed because of test-harness issues: SSE was buffered by
`route.fetch`, then Chromium's Local Network Access blocked the WS after `route.fulfill`. Both were fixed
in the test, not the app.

## Tests added

- `tests/security/review-probes.test.ts` starts its own `NODE_ENV=production` server with a throwaway
  `CLIENT_DIST` on 127.0.0.1:3360-3369. It covers traversal, prod error responses, headers, XFF
  spoofing, the matchmaker (bypass, CORS, unbounded body), anonymous log amplification, SSE
  per-account count, and lobby-slot squatting. Each open issue is an `it.fails(...)` that asserts the
  secure behaviour. When an issue is fixed, vitest reports it, so flip it to `it(...)`.
- `tests/security/review-csp.test.ts` runs the recommended CSP against the built client in headless
  Chromium. It is skipped when `apps/client/dist` is missing.
