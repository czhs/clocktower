# Game records (version 1)

Every game played on the server is saved as one **versioned JSON document** so that any future
statistic can be computed from it. Finished games and **abandoned** games (lobby closed by an admin,
everyone left, server shut the lobby down) are both recorded.

- Storage: table `match_records` (migration 3), one row per match: header columns
  (`match_id, lobby_id, version, status, started_at, ended_at, winner, player_count,
  storyteller_account_id`) + `record_json` (the document below). Repo: `packages/db/src/repos/records.ts`.
- Type: `GameRecordV1` in `apps/server/src/records/types.ts` (the source of truth; this page explains it).
- Admin API: `GET /api/admin/games?limit&before&accountId` (list) and
  `GET /api/admin/games/:id[?download=1]` (full JSON). Admin console → **Games** tab (play-by-play +
  Download JSON).
- Player-facing stats (v2.2): `GET /api/me/stats` (own account only; home screen "Your record").
  Win/loss, streaks and characters come from `matches`/`match_players` (finished games); the recent
  list joins `match_records` for abandoned games and lobby names; `match_players.avatar_id`
  (migration 5) holds the roster character. Abandoned games show only the believed character.
- **Never in a record:** voice data, chat contents, private notebooks, passphrases, session tokens,
  cookies. Display names are copied **as they were** at game start; account ids join with `accounts`.

## When and how it is written

| Event | What happens |
|---|---|
| Game start (`lobby:start`) | The GameRoom freezes `MatchMeta` (match/lobby ids, script, lobby name, Storyteller + every seat with account id, display name, lobby label, roster avatar id). The game module creates a `GameRecorder`. |
| Every committed change | `apps/server/src/game/index.ts` `commit()` calls `recorder.observe(state, now, trigger)`; trigger = the ST command / player action / clock tick / connection / visit that caused it. The recorder diffs the engine state against its shadow copy (one seam; cascades such as Scarlet Woman, star-pass, Virgin are captured without hooks inside `@ct/rules`). |
| Game finished (ST confirmed / declared the winner) | `GameRoom.recordOutcome()` writes the stats summary (`matches`/`match_players`) **and** the full record in **one SQLite transaction** (`writeFinished`): both or neither. A failed write is retried every 5 s and once more when the room is disposed. |
| Room disposed mid-game | `onDispose` writes an `abandoned` record with whatever is known (`abandon.reason`: `closed_by_admin`, `idle_timeout` = everyone left, `room_disposed` = server shutdown). The stats summary stays unfinished. |
| Pamphlet released after the record was written | Appended to `$.pamphlets` (`json_insert`); nothing else ever changes. |

Writes are idempotent: `INSERT … ON CONFLICT(match_id) DO NOTHING` — a second write is a no-op.
A recorder bug never breaks the game (every `observe` is wrapped; failures are logged and listed in
`warnings`) and never costs the summary (the room falls back to a minimal record).

## The document

```ts
interface GameRecordV1 {
  version: 1;
  matchId: string; lobbyId: string;
  status: 'finished' | 'abandoned';
  script: string;                                   // 'trouble-brewing'
  lobby: { name: string; maxPlayers: number | null };
  settings: { initial: Settings; final: Settings }; // Settings = { bedtimeSeconds, voteSeconds, doorTags, pamphlets }
  startedAt: number; endedAt: number; durationMs: number;   // epoch ms
  days: number; nights: number;                     // highest day / night number reached
  storyteller: Person | null;                       // Person = { pid, accountId, displayName, label }
  seats: SeatRecord[];
  setup: SetupRecord | null;                        // the Grimoire when the first night fell
  phases: PhaseSpan[];                              // every phase with start/end (+ via, undone)
  dayRecords: DayRecord[]; nightRecords: NightRecord[];
  nominations: NominationRecord[];
  executions: ExecutionRecord[];
  deaths: DeathRecord[];
  roleChanges: RoleChangeRecord[];
  statusChanges: StatusChangeRecord[];
  nightSteps: NightStepRecord[];
  info: InfoRecord[];                               // every piece of private info the ST gave
  prompts: PromptRecord[];                          // every question the ST asked + the answer
  visits: VisitRecord[];                            // ST entered a home at night
  storytellerCommands: CommandRecord[];             // every accepted ST command, verbatim
  playerActions: ActionRecord[];                    // every accepted nominate / vote / promptResponse / slayerShot
  connections: ConnectionRecord[];                  // disconnect / reconnect (seat null = ST)
  storytellerLog: LogRecord[];                      // the complete grimoire log (the live view keeps 80 lines)
  announcements: AnnouncementRecord[];              // public announcements, verbatim
  timeline: StoryEntry[];                           // the play-by-play (see below)
  pamphlets: Pamphlet[];                            // what the ST released to the town
  result: ResultRecord | null;                      // finished games only
  abandon: { reason; at; phase; day; night } | null;
  warnings: string[];                               // recorder problems; [] when complete
}
```

### Seats (`SeatRecord`) — one per player

| Field | Meaning |
|---|---|
| `seat`, `pid`, `accountId`, `displayName`, `label` | Seat 0..14 (= house index), room pid, account id, account name at start, lobby label (`"Ann (2)"` for duplicates). |
| `avatarId` | Roster character from `@ct/assets` `cast.ts` (`Cosmetics.preset`). |
| `startingCharacter`, `startingAlignment`, `startingBelievedCharacter` | As set up (the Drunk believes a Townsfolk). `null` if characters were never assigned. |
| `finalCharacter`, `finalAlignment`, `finalBelievedCharacter` | At the end. |
| `aliveAtEnd`, `won` | `won` is `null` for abandoned games. |
| `death` | Last effective death `{at, day, night, phase, cause}` (`null` if alive / revived). |
| `executed`, `executedDays` | |
| `ghostVoteUsed`, `ghostVote` | `{at, day, nominationId}` of the ghost vote. |
| `nominationsMade`, `nominationsReceived` | Nomination keys. |
| `votes` | Every locked vote `{nominationId, day, yes, ghost}`. |
| `connectedAtEnd` | |

### Nominations, votes, executions, deaths

- `NominationRecord`: `id` (engine id, e.g. `d2-nom1`), `key` (unique in the game; `~2` suffix if an
  undone nomination's id was reused), `day`, `at`, `nominatorSeat`, `nomineeSeat`, `createdBy`
  (`player` / `storyteller`), `status`, `voteOrder` (clockwise, nominee last), `votes`
  `[{seat, yes, ghost, at}]` (ghost = a publicly dead player's yes), `voteCount`, `threshold`
  (needed), `minVotes` (ceil(alive/2)), `talliedAt`, `result`
  (`on_the_block | tie | not_enough | cancelled | virgin | not_voted`), `nomineeExecuted`, `undone?`.
- `ExecutionRecord`: `{day, at, seat | null (= "nobody is executed"), cause: 'execution' | 'virgin',
  died, alreadyDead, forced (ST override), via}`.
- `DeathRecord`: `{seat, at, day, night, phase, cause, note?, publicAt, revivedAt?, via, undone?}`.
  `cause` ∈ `demon` (killed at night) · `execution` · `virgin` · `slayer` · `storyteller` (ST kill /
  set_alive; `note` = the ST's reason) · `starpass` (the Imp killed themself) · `unknown`.
  `publicAt` = when the town learned it (dawn for night deaths).
- `RoleChangeRecord`: `{seat, from, to, alignmentFrom, alignmentTo, believedFrom, believedTo,
  cause: 'storyteller' | 'starpass' | 'scarlet_woman' | 'other'}`.
- `StatusChangeRecord`: `{seat | null, field, from, to, via}` with `field` ∈ `poisoned` (`'poisoner' |
  'storyteller' | null`), `drunk`, `protected`, `butlerMaster`, `ghostVoteAvailable`, `abilityUsed`,
  `slayerShotTaken`, `reminder`, `believedCharacter`, `redHerring`, `demonBluffs`, `settings`,
  `bedtimeSeconds`.

### Nights (the grimoire log)

- `NightStepRecord`: `{id, night, order, kind (character / minion_info / demon_info / dusk / dawn),
  seat, status, response (the player's choice), storytellerInput (ST targets / starpassSeat /
  redirectSeat), fixed (engine picks), outcome (engine text), infoSent, player {character, actingAs,
  poisoned, drunk, protected} at resolution, resolvedAt, infoIds, promptIds, undone?}`.
- `InfoRecord`: `{id, seat, at, day, night, phase, text, seats?, characters?, number?, yes?, stepId}` —
  exactly what the player was shown.
- `PromptRecord`: `{id, seat, kind, title, body?, min/maxTargets?, characterOptions?, stepId,
  response {at, seats?, character?, yes?} | null}`.
- `setup`: `{at, method: 'random' | 'manual' | 'mixed' | 'storyline' | 'bag', storyline?, characters [{seat, character, alignment,
  believedCharacter}], demonBluffs, redHerringSeat}`. (v2.2) `storyline` = `deal_preset` (with `storyline`
  = its id, kept when the seats are then re-assigned by hand: `mixed`); `bag` = `deal_bag`.

### Result

`{winner, reason, at, detectedAt (engine detection; null if declared), via: 'confirm_result' |
'declare_winner' | 'other', confirmedBy: Person (the Storyteller)}`.

### Undo and Storyteller overrides

Every Storyteller command is in `storytellerCommands`. Commands the engine can undo are tracked; when
the ST undoes one, everything it produced (deaths, role/status changes, info, nominations, timeline
lines, log lines, phase spans) is kept but marked `undone: true`, and the timeline gets
"The Storyteller undid: …". Stats should ignore `undone` items. Overrides (force phase, force vote,
close vote, set block, set/strike vote, force execute, settings, teleports, …) get their own
timeline line.

## The play-by-play (`timeline`)

Ordered entries:

```ts
interface StoryEntry {
  t: number;            // ms since the game started
  at: number;           // epoch ms
  day: number; night: number; phase: GamePhase;   // when it happened (section headers)
  kind: 'setup' | 'phase' | 'night_step' | 'info' | 'nomination' | 'vote' | 'vote_changed' | 'execution'
      | 'death' | 'revival' | 'ability' | 'role_change' | 'status' | 'visit' | 'storyteller'
      | 'announcement' | 'result_pending' | 'result_overridden' | 'end';
  actors: { seat: number | null; pid: string }[];  // seat null = the Storyteller
  data: Record<string, unknown>;                   // structured, kind-specific
  text: string;                                    // one readable sentence
  undone?: boolean;
}
```

Examples (the UI groups them under **Night N / Day N** headers, so the text has no prefix):

- `The Storyteller woke Ada (Fortune Teller), who chose Bram and Cleo, and showed “Yes — one of them is the Demon.”.`
- `Votes on Esme (nominated by Dov): Ada, Bram and Finn (ghost vote) — 3 of 4 needed: not enough.`
- `Esme (Saint) was executed.` · `The Imp (Bram) killed Finn (Monk).` · `Dov (Empath) nominated the Virgin Esme and was executed on the spot.`
- `Ada (Slayer) claimed to be the Slayer and shot at Bram (Imp): Bram died.` · `Star-pass: Cleo (Poisoner) became the Imp.`
- `Cleo (Monk) is poisoned (by the Poisoner).` · `The Storyteller undid: kill (Finn).` · `Good wins: The Demon is dead.`

Entry text uses the **true** characters (it is the Storyteller's / admin's view). Death and
execution causes and Imp successions are read from the engine's log lines (regexes in
`recorder.ts`; the records tests fail loudly if the engine wording changes).

## The Storyteller's story and pamphlets

- **Story** (📜 button, Storyteller only, `story:get` → `story:st`): "Story of the day" (the
  previous day + the night just ended; during the night: the cycle so far), "So far" ("The whole
  game" after the end), and what was released.
- **Pamphlets** (`story:release` → `story:pamphlet` to everyone, `story:pamphlets` to list them
  again after a reconnect), stored in the record's `pamphlets`:
  - **"Pamphlet: Day N"** (mid-game) only when the Storyteller setting **Daily pamphlets**
    (`StSettings.pamphlets`, default **off**) is on. Built **only from public facts**: the
    announcements every player received and the public vote hands. Never characters, night info or
    statuses (`records.game.test.ts` checks every line against what players actually received).
  - **"The story of this game"**: the whole play-by-play + the Grimoire reveal, only after the end
    was confirmed. Optional — the Storyteller may tell it themselves.
  - The release must quote the preview's `digest`, so what the Storyteller previewed is exactly
    what is sent; they may add a headline and a line of their own.

## Versioning

`version` is 1. Additive fields may appear in version 1 documents; renaming/removing a field or
changing a meaning bumps the version (readers should switch on `version`).

## Queries

- One game: `SELECT record_json FROM match_records WHERE match_id = ?`.
- A player's games: `listRecords({ accountId })` (JSON1 over `$.seats[*].accountId` +
  `storyteller_account_id`). For thousands of games add a join table in a new migration.
- Example stat (how often each character wins):
  `SELECT json_extract(s.value,'$.finalCharacter') c, AVG(json_extract(s.value,'$.won')) FROM match_records, json_each(record_json,'$.seats') s WHERE status='finished' GROUP BY c;`
