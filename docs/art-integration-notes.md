# Notes for the art/town overhaul session (from the lead)

The art overhaul runs in a separate session. Gameplay is layout-agnostic and must keep working when
the new town and renderer land. When you replace `apps/client/src/game/TownScene.ts` (or its
successor), please carry these over — they are committed on `main` in the pre-overhaul TownScene.

## 1. Gameplay hooks (required)

API: `apps/client/src/game/gameplay/index.ts` → `createGameplayLayer(scene, ctx)` returning
`{ update(dt), drive(dt), wantsLocalInput(), doorOverride(buildingId), destroy() }`.

1. Import + field: `import { createGameplayLayer, type GameplayLayer } from './gameplay';` and
   `private gameplay: GameplayLayer | null = null;`
2. In `create()`: `this.gameplay = createGameplayLayer(this, { conn, myPid: () => this.myPid, me: () => this.me, amStoryteller: () => this.amStoryteller() });`
   and register `this.gameplay?.destroy()` on shutdown.
3. First lines of the local-movement step: `const d = this.gameplay?.drive(dt) ?? null; if (d) { /* apply
   server pose to the local player, set lastSent, publish localPlayer; no 'move' sent */ return; }`
   (server-driven walks: bedtime escort, ST walk-to/freeze, ST pick mode).
4. Per frame after remote interpolation: `this.gameplay?.update(dt);`
5. Door lock check: after the Storyteller early-return, `const o = this.gameplay?.doorOverride(id); if (o != null) return o;`
   — in ALL phases (ST door locks are props, not night-only).

## 2. Door prompt must refresh when a door's lock changes (e2e bug B3)

Recompute `locked` every frame for the nearest door and update the prompt when it changes (not only
when the nearest door or phase changes). Daytime ST lock wording: "<Building> is locked by the
Storyteller"; night wording unchanged.

## 3. Data the art should render (no game logic in art code)

- Door tags: `doorTagsStore` in `apps/client/src/game/gameplay/doorTags.ts` (per building: pid, name,
  ghost, preset; ≤4 + overflow). Daytime only by construction (server sends none at night).
- Voice presence: `voicePresence` / `voiceActivity` in `apps/client/src/voice/VoiceClient.ts`
  (speaking rings for visible entities, own muted icon).
- Seat circle positions: `circleSpots()` in `@ct/protocol` (from `layout.square` or `layout.circle`).
- Sound: `attachSound(conn)` is called by GameScreen; remote footsteps only for snapshot entities.

## 4. Invariants (tests enforce most)

- Never render anything about the Storyteller or other houses for a player at night beyond what is
  in that player's own snapshot; ambient/visual effects depend only on time + the public phase.
- Keep the `TownLayout` contract (packages/protocol world.ts); run `packages/assets/test` nav tests and
  `apps/server/test/world*.test.ts` after any layout change.
