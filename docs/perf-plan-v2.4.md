# v2.4 performance sweep — plan (lead, 2026-10-16)

Baseline: v2.3 (`28a9d6e`, prod `689b3f6`) measured with the v2.2 scripts on hshi-u1:
`tests/perf/results/2026-10-16-v2.3.json` vs `tests/perf/results/2026-10-15-v2.2.json`.

| Budget | v2.2 | v2.3 | Limit |
|---|---|---|---|
| entry JS br | 36.5 KiB | 42.7 | 45 |
| entry CSS br | 22.1 KiB | 24.9 | 27 (target ≤ 15) |
| LobbyRoute br | 68.2 KiB | 83.4 | 85 |
| TownGame br | 284.5 KiB | 293.7 | 300 |
| town atlases | ≈ 770 KiB | 835 | 950 |
| S2C / client | 1487 B/s | 1455 | 2000 |
| server CPU, 16 walking | 4.9 % | **7.7 %** | 10 |
| desktop walk main / phone walk main | 7.5 / 13.9 % | 4.2 / 6.7 % (**suspect: walk may not move**) | 10 / 17 |
| phone walk DOM mutations | 18.4 /s | 0 (**suspect**) | 25 (target ≤ 5) |
| town network-idle, Slow 4G (local) | 16.7 s | **21.5 s ❌** | 21 |

Findings so far: `cast-hd.webp` (740 KB, Brianbi's HD sheet) is downloaded by every client on town
load; server CPU +57 % since v2.2; LobbyRoute at 98 % of budget; walking windows look idle.

Work packages (agents; disjoint files):
- **P1 measurement + town runtime** (tests/perf/**, scripts/perf/**, apps/client/src/game/** runtime
  except assets loading): prove the perf walk moves; re-measure; profile bubbles / talking outline /
  board tokens / house names / interiors / NPC avoidance / HD avatars; HUD churn ≤ 5/s; LiveKit "N
  loudest" downlink design (voice-owned, implement only the client policy if safe).
- **P2 load path** (packages/assets/**, apps/client/src/ui/** chunking, vite config, main.tsx,
  castPortrait): HD cast only when an HD character is in the lobby; LobbyRoute split (chat moderation
  / report / settings / admin-ish pieces lazily); entry CSS ≤ 15 KiB br (move non-landing CSS into the
  chunks without breaking cascade order); cast sheet GPU ≤ 8 MiB (split NPC/ghost blocks or trim);
  town network-idle back under 17 s.
- **P3 server CPU** (apps/server/**): profile the 16-client walk (V8 profile via server-profile.ts),
  attribute the +57 % (socket budget, violation score, voice reconciler, settings registry getters,
  chat filter, moderation gate, snapshot path), fix hot spots without weakening protections.
Budgets: tighten `scripts/perf/budgets.mjs` to the v2.4 results + 20 % slack at the end.
