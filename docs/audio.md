# Audio

Owner: audio teammate. Code: `apps/client/src/game/audio.ts` (public API) and
`apps/client/src/game/sound/**`. Files: `apps/client/public/audio/**`. Credits and licences:
**[apps/client/public/audio/CREDITS.md](../apps/client/public/audio/CREDITS.md)** (everything is
CC0 1.0). Tests: `apps/client/test/sound*.test.ts`.

## What plays

| Sound | When | Bus |
|---|---|---|
| Wind bed | Outdoors always. Stronger near woods and the graveyard, lighter in the square. Muffled indoors. | amb |
| Crows | By day, near the graveyard (and faintly at forest edges) | amb |
| Fountain | Near the walled-garden fountain | amb |
| River | Near the river, waterfall and pond | amb |
| Tavern murmur | Inside the tavern by day. Outside, muffled near its door. | amb |
| Crickets | Night (plus some at bedtime and dawn): outdoors, and muffled inside homes | amb |
| Owls | Sporadic night calls, more near woods and graves, muffled indoors | amb |
| Footsteps | Local player, plus visible entities in **your own location**. Uses the ground under the feet: cobble/plaza/stone floor, grass/dirt/soil/forest, wood floor/bridge, gravel/sand. Distance attenuation and pan. | sfx |
| Door | Your own door teleport. Also a visible person entering or leaving through a door near you. | sfx |
| Bedtime bell, dawn chime, death toll | Server `sound` cues `bell` / `dawn` / `toll` (public) | sfx |
| Visit | Server `visit` cue, sent **only to the visited player**. Soft singing-bowl hit. | sfx |
| Vote ticks | Each new entry in the public `day.nominations[].votes` (the clock hand). A raised hand gets a brighter tick. | sfx |
| Gavel | A new public `execution` announcement | sfx |
| Ghost | A player's public `alive` turns false. Plays once per update, after the gavel/toll. | sfx |
| UI click | Clicks on `button.primary` or `[data-sfx="click"]`. Opt out with `data-sfx="off"`. | ui |

Mix: `master ← sfx`, `master ← ui` (60% of the SFX volume), `master ← duck ← amb` (70% of the
ambient volume). The ambient slider defaults to **0.25**, which sits well under voice. While
anyone the player can hear is speaking (`voiceActivity`), ambience dips by 4.5–7 dB. It ducks fast
(τ 80 ms), holds 0.5 s and recovers slowly (τ 600 ms).

## API (stable: `apps/client/src/game/audio.ts`)

```ts
unlockAudio(): void                       // inside any user gesture (GameScreen already calls it)
playCue(cue: 'bell'|'dawn'|'toll'|'door'|'visit'): void   // TownScene already calls it; 300 ms de-dup
setAmbientVolume(v: number): void         // 0..1, persisted localStorage 'ct.ambientVolume' (default 0.25)
getAmbientVolume(): number
setSfxVolume(v: number): void             // 0..1, persisted localStorage 'ct.sfxVolume' (default 0.7)
getSfxVolume(): number
attachSound(conn: SoundConn /* RoomConnection fits */, opts?): () => void   // once per game screen
installUiSounds(root?: Document): () => void   // lobby/home: unlock on first gesture + UI clicks (idempotent)
setVoiceActivitySource(store | null): void     // optional override; by default attachSound finds `voiceActivity`
```

### Integration hooks

- **GameScreen** (`apps/client/src/game/GameScreen.tsx`, world-art), in the existing `useEffect`:
  ```ts
  import { attachSound, unlockAudio } from './audio';
  …
  applyAmbientVolume();
  const detachSound = attachSound(props.conn);
  …
  return () => { …; game?.destroy(); detachSound(); };
  ```
  `attachSound` drives everything itself:
  - it runs a requestAnimationFrame loop that reads `localPlayer` and `remoteEntities` (`net/localPlayer.ts`, which TownScene already writes every frame);
  - it subscribes to `conn.gameView` for the public phase, votes, executions and deaths;
  - it subscribes to `conn.events` `sound` and `world:teleport` (door);
  - it picks up `voiceActivity` from `voice/VoiceClient.ts` for ducking.

  TownScene needs **no per-frame call**. Its existing `playCue(s.cue)` and `playCue('door')` calls
  may stay (de-duplicated) or be removed.
- **TownScene invariant** (art director): `remoteEntities` must keep holding only snapshot entities
  with their real `location`. Remote footsteps and doors are heard only for entries whose `location`
  equals the local player's.
- **main.tsx** (lead, optional): call `installUiSounds()` once at startup so lobby and home buttons
  click too. Inside the town, `attachSound` installs it.
- **Settings** (ux): the ambient slider already calls `setAmbientVolume`. An SFX slider can call
  `setSfxVolume(v)` and read `getSfxVolume()`.

## Night-leak rules (docs/world-audit.md §4)

No sound may hint at the Storyteller's movements at night.

- **Ambience and owls** are a pure function of the local player's own position/location, the
  static map (`sound/areas.ts`) and the **public** phase. Owl timing uses its own random stream,
  advanced only by time.
- **Remote footsteps and doors** come only from snapshot entities in the listener's own location,
  the same rule TownScene uses for visibility (`sound/world.ts`, `remoteSteps`). A non-visited
  player can't hear the ST, even when a leaky input puts the ST at coordinates next to their bed
  in another room.
- **Visit** is only ever played from the server's private cue. `storytellerVisitingYou` and any
  other private view field are never read (`sound/cues.ts`).
- **Death sounds** follow the public `alive` flag, which flips only when deaths are published.

`apps/client/test/sound.nightleak.test.ts` simulates evening → night → morning with a fake
AudioContext. For non-visited players (house 5 and house 1), a night with ST visits to houses 3
and 7 must produce a byte-identical log compared with a quiet night: fetched files, every node,
connection, parameter automation and source start. The busy night also feeds:
- the ST and other occupants inside other homes;
- the ST walking outdoors;
- the ST at coordinates right next to the listener but in another location;
- identical game views sent again.

A control run shows the visited player does hear the visit and the ST's steps. Mutation check:
with the location gate removed, two of the three tests fail.

## Loading, budget, performance

- Each clip ships as `.ogg` (Opus) and `.m4a` (AAC-LC), both mono. `canPlayType` picks the format:
  Opus only if the browser answers "probably", otherwise AAC (Safari). If a decode fails, the
  other format is tried.
- On the first gesture, about 150 KB of one-shots preload: footsteps, door, cues, ticks, click.
  **Loops are lazy.** A loop is fetched when the player is near its area (`warm` radius) or when
  its level rises above 0. It is stopped after 6 s of silence, and its buffer is released after
  30 s out of range. In Chromium at spawn, only `amb/wind.ogg` is fetched (Playwright check).
- Limits: 14 one-shot voices in total, per-clip caps (4 per footstep surface), and the 4 nearest
  remote walkers.
- Sizes: one-shots are ≤ 30 KB each (largest: `cue/toll.m4a`, 29.5 KiB). Loops are
  ≤ 250 KB each (largest: `amb/wind.m4a`, 102 KB). **Total: 1,079,004 bytes (1.03 MiB) for 70
  files.**
- Seamless loops: the pipeline bakes an equal-power crossfade at the loop point and pads each file
  with 0.1 s of wrap-around audio on both ends. The engine loops `[pad, pad + period]`, so encoder
  priming or padding in AAC/Opus never causes a gap.
- Loudness, per category: loops are normalised to −26 LUFS integrated; footsteps to −27…−29;
  cues and SFX to −19…−23; the visit to −27; ticks and clicks to −26…−32 (max momentary, 400 ms).
  Peaks stay ≤ −1.5 dBFS.

## Rebuilding the files

The pipeline lives in `apps/client/src/game/sound/pipeline/`. It is not part of the bundle and
runs on hshi-u1 only.

- `fs_search.py` and `fs_page.py` parse saved Freesound HTML: they list candidates and read the
  licence, author and HQ preview URL.
- `analyze.mjs` and `onsets.mjs` show envelopes and onsets, used to pick segments.
- `build.mjs` (with `lib.mjs`) decodes, trims, mixes to mono, normalises, bakes loops and encodes.
  It fails if any file breaks its size budget.

ffmpeg came from the npm registry package `@ffmpeg-installer/linux-x64@4.1.0` (a static build;
installed with `--ignore-scripts` into a scratch dir outside the repo, not as a project
dependency). hshi-u1 has no system ffmpeg or sox. To use a system ffmpeg instead:
`sudo apt-get install ffmpeg`.

```
# on hshi-u1, in a scratch dir holding tools/ (scripts + node_modules) and src/{fs,kenney}/ (downloads)
node tools/build.mjs src out/audio
```

`audio-e2e.spec.txt` is the Playwright check (proposed `tests/e2e/audio.spec.ts`, qa-deploy).
`e2e-remote-patch.py` adds the GameScreen hook to a remote-only copy so the check can run before
the hook lands.
