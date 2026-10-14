# Test results (executed commands only)

All commands run on **hshi-u1** via `scripts/remote.sh` unless stated otherwise.

## 2026-10-14 — M0 (lead)

| Command | Result |
|---|---|
| `ssh hshi-u1 'uname -a; cat /etc/os-release; …'` | ✅ Ubuntu 22.04.5 x86_64, Tailscale 1.102.2, no Node |
| Node v24.22.0 tarball install (sha256 verified) + `npm i -g pnpm@10` | ✅ node v24.22.0, pnpm 10.34.7 |
| `scripts/remote.sh node -e …` (first install incl. better-sqlite3 native build) | ✅ `node v24.22.0 on hshi-u1` |
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ❌ first run: ` ` literal broke regex in protocol/text.ts; ❌ Emitter generic constraint → fixed; ✅ all 7 packages pass |
| `pnpm --filter @ct/client build` | ✅ vite build 147 kB js |
| `pnpm --filter @ct/server build` | ✅ esbuild bundle |
| `node apps/server/dist/server.js` on :3399 + `curl /healthz`, `curl /lobby/abcdef` | ✅ `{"ok":true,"env":"test"}`, SPA index served for deep link |
| `scripts/remote.sh pnpm vitest run packages/protocol` | ❌ first run: wrong expectation in my collision test (wall row math) → fixed test; ✅ 9/9 passed |

## 2026-10-14 — integration after voice + lobby-auth (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ✅ 7/7 packages |
| `pnpm vitest run packages apps` | ✅ 14 files, 202 tests passed (rules work-in-progress included) |
| `pnpm --filter @ct/client build` / `@ct/server build` | ✅ (client bundle 898 kB, Phaser included) |
| `node apps/server/dist/server.js` on :3301, `curl /healthz`, `POST /api/auth/create` | ✅ after adding `livekit-server-sdk` to @ct/server deps (bundle previously failed to start — reported by lobby-auth) |
