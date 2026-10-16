# The town clock and automatic games (v2.1)

Owner: auto-st. Code: `apps/server/src/auto/**` and small hooks in `apps/server/src/game/index.ts`,
`apps/server/src/rooms/GameRoom.ts`, `apps/server/src/directory/service.ts`,
`packages/rules/src/{types,engine,day}.ts`. Contract: `packages/protocol/src/clock.ts`.
Tests: `apps/server/test/auto.*.test.ts`.

## 1. The town clock (every game)

`PlayerGameView.clock` / `StorytellerGameView.clock` is a `DayClockView`. It is public and the same
for every viewer.

| Phase | What the clock shows |
|---|---|
| `bedtime` | The engine's bedtime countdown, in human and automatic games alike. `stage` is `'bedtime'`. A held countdown shows `paused`. In overtime `remainingMs` is 0. `totalMs` is the bedtime length, or a longer extension. It is memoised, so views stay byte-identical between ticks. |
| `day` | **Human games:** the Storyteller's `day_clock` prop (`discussion` or `nominations`), if they set one. Otherwise `null`. **Automatic games:** the AutoStoryteller's clock, plus the open extension `proposal`. |
| other | `null`. A human Storyteller's day clock stays set through the night until the day ends. |

`StCommand 'day_clock'` (human games, seated Storyteller only) supports these actions:

- `set {stage: discussion|nominations, minutes}`
- `pause`
- `resume`
- `add {minutes}`
- `clear`

The clock is a **prop**. Reaching zero does nothing, and it never moves a phase. It is cleared when the day ends. It is not on the engine's undo history: `undo_last` never touches it, and the recorder lists `day_clock` as not undoable. Errors:

- `set` without a stage or length: `invalid`
- `stage: 'bedtime'`: `invalid` ("use the bedtime timer")
- `set` during bedtime: `phase`
- `pause` / `resume` / `add` with no clock: `invalid`

No automatic behaviour runs in human games. None is opted in by default, and there is no setting for it yet.

## 2. Automatic games (`storytellerMode: 'auto'`)

### Lobby
- Create a lobby with `CreateLobbyRequest.storytellerMode: 'auto'`. The host can also switch modes
  with `lobby:settings {storytellerMode}`, but only while the lobby is waiting. Switching to auto
  moves a seated Storyteller to a player seat. If no seat is free, the switch is refused with
  "raise the player limit first". The limit can be raised in the same message.
- `autoTimings` (host only, while waiting) are merged into the defaults, `AUTO_DEFAULTS` = 5 / 4 min, 45 / 60 s.
- An automatic lobby has no Storyteller seat:
  - `storytellerSeatOpen` is false.
  - A `storyteller` ticket or join intent joins as a player.
  - `lobby:claimStoryteller` and `lobby:transferStoryteller` are refused.
- `LobbySummary.storytellerMode` is always present. `autoTimings` is present in auto mode.
- **Start:** the host sends `lobby:start` once 5 or more players are ready and connected. `canStart` is true only for the host.
- **Abort:** the host sends `lobby:abort` while an automatic game is running. The game is recorded
  as `abandoned` with `abandon.reason = 'aborted_by_host'`. Everyone gets a `game_over`
  announcement, and the lobby goes back to the waiting room with the same members. Human games
  refuse `lobby:abort` with `forbidden`.

### The flow (`apps/server/src/auto/storyteller.ts`)
Every step is an ordinary engine command (`random_setup`, `prompt_player`, `send_info`,
`resolve_step`, `advance_phase`, `set_nominations_open`, `start_vote`, `confirm_result`, `announce`).
That means every Trouble Brewing rule is enforced by `@ct/rules` exactly as in a human game.

| Phase | What happens |
|---|---|
| setup | `random_setup` (a legal setup), then the bell after 5 s. The game goes bedtime → first night. Roles are revealed at nightfall. |
| bedtime | The engine's countdown runs for `bedtimeSec`, then the world walks stragglers home. Night falls once everyone is home. If someone is still out 30 s into overtime, the night is forced and they are put to bed. |
| night | At nightfall, every step that needs a choice prompts its player at once, using their usual prompt UI at home. The prompt reads "Answer within N s, or fate chooses for you". N is ⅔ of `nightSec`, clamped to 15–90 s. Steps then resolve **strictly in night order**. A player who died earlier that night is skipped, except the Ravenkeeper, who is woken when killed. An unanswered prompt gets a random legal answer at its deadline. Minion and Demon info, including bluffs, are given in games of 7 or more players, as Trouble Brewing requires. The night lasts **at least** `nightSec`, so its length reveals nothing. It lasts at most `nightSec` plus the prompt timeouts. |
| dawn → day | The engine announces the deaths. |
| day | The clock runs `discussion` for `discussionMin`. Nominations then open, and the clock runs `nominations` for `nominationsMin`. A nomination's vote starts 20 s after it is made (accusation and defence), using the usual clock-hand vote. When the clock ends, nominations close and a pending vote still runs. The player on the block is then executed by the engine: the most votes, at least half the living, ties mean nobody. Bedtime follows. If an execution happens mid-nominations (the Virgin), the day ends within 60 s. |
| end | A detected game end is confirmed at once (`confirm_result`). |

**Hold:** while no seated player is connected, nothing advances. The clock pauses and the prompt deadlines and stage timers are pushed back. When everyone has left, the room's idle timeout disposes the lobby and records the game as **abandoned** instead of letting the server play it to the end.

### Decision points ("fate"). Seeded, random and legal (`apps/server/src/auto/fate.ts`)

Each game has two seeds:
- `engineSeed`: the existing engine RNG. It drives the setup and the engine's own picks.
- `fateSeed`: by default derived from `engineSeed`. It drives every Storyteller judgement call.

Both seeds are written to the record's timeline as the first `storyteller` entry, with `data.decision = 'seeds'` and the timings. With the same seeds and the same player inputs, the game replays identically (tested).

| Decision | Rule |
|---|---|
| Setup, red herring, Drunk's belief, Demon bluffs | Engine `random_setup`: a standard distribution, Baron-adjusted. |
| Spy / Recluse registration | For each ability use and each player, there is a `REGISTRATION_CHANCE` (0.5) that a healthy Spy registers as good and as a Townsfolk or Outsider (a character not in play), or that a healthy Recluse registers as evil and as a Minion (¾) or the Imp (¼). This applies to the Washerwoman, Librarian, Investigator, Chef, Empath, Fortune Teller, Undertaker and Ravenkeeper. |
| Healthy info | The truth under those registrations. Pair roles show one real or registered holder plus a random decoy. "None in play" is shown only when nobody registers as that type. |
| Drunk or poisoned info (including the Drunk acting as an info role) | Plausible **false** info that differs from the truth whenever the range allows. Numbers come from a plausible range. The Fortune Teller's answer is inverted. Characters are of the right type, and for pair roles, neither shown player has that character. |
| Unanswered prompt | A random legal answer. It prefers living players other than the chooser, so a sleepy Imp kills a random living player. |
| Imp picks themself | The star-pass goes to a random living Minion. The engine still gives a healthy Scarlet Woman priority when 5 or more players are alive. |
| Imp attacks a healthy Mayor (unprotected) | `MAYOR_BOUNCE_CHANCE` (0.5) to redirect the kill to a random living player who is neither the Mayor nor the Demon. The engine then applies Monk and Soldier protection to the redirected kill. |
| Spy (healthy) nominates a healthy Virgin | `REGISTRATION_CHANCE` that the Spy registers as a Townsfolk and is executed on the spot. This uses the engine's `Adjudicator.spyRegistersAsTownsfolk`. |
| Real healthy Slayer shoots a healthy Recluse | `REGISTRATION_CHANCE` that the Recluse registers as the Demon and dies (`Adjudicator.recluseRegistersAsDemon`). |
| Butler votes without their master | A healthy, living Butler's raised hand is counted as "no" unless their master votes too (`Adjudicator.enforceButler`). |
| Impaired Spy | Still shown the Grimoire, which the Storyteller may do. |
| Scarlet Woman, Saint, Mayor win, Soldier, Monk | Handled by the engine as usual. |

Every decision that shaped hidden information appears in the record's timeline as a `storyteller`
entry with `data.auto = 'fate'` and a `data.decision` from this list:

- `seeds`
- `setup`
- `false_info`
- `registration`
- `timeout_answer`
- `starpass`
- `mayor_bounce`
- `spy_virgin`
- `slayer_recluse`
- `skip_dead`
- `confirm_result`

Clock events are entries with `data.auto = 'clock'` ("The town clock …"). The recorder's own lines are relabelled "the automatic Storyteller". The record has `storyteller: null`, and the stats row has `storytellerAccountId: null`. These lines are **server-only**: players never receive them (tested). They are visible only in the final story or the admin record.

### Extensions (`apps/server/src/auto/extensions.ts`)
- **Proposing:** `clock:propose {minutes 1..10}`. Any seated player can propose, alive or dead, while a `discussion` or `nominations` clock runs. Only one proposal can be open at a time, and the proposer automatically votes yes.
- **Limits per player:** one proposal per 60 s and three per day. **Limit per day:** at most +20 minutes in total. A proposal that would exceed this is refused, and the error says how much is left.
- **Voting:** `clock:vote {id, yes}`. Every seated player may vote and may change their vote while the proposal is open. The eligible voters are the connected seated players, plus anyone who has already voted.
- **The rule:** the proposal passes at once when yes is more than half of the eligible voters (`proposal.needed`). It fails at once when half the eligible voters say no. Otherwise, after 30 s it is decided on the votes cast. It passes only if at least half the eligible voters voted and yes is more than no. Silence is not consent, and a tie fails.
- **Effect:** a passed proposal adds its minutes to the current stage. If a stage reaches zero while a proposal is open, the stage waits up to 30 s for the result. Opening, passing and failing are public announcements. The `proposal` in the clock view lists the `yes` and `no` pids.
- **Errors:**
  - `phase`: outside a running discussion or nominations clock
  - `rate_limited`: cooldown or the per-day count
  - `invalid`: another proposal is open, the daily cap is reached, or the id is stale
  - `forbidden`: a human game or an unseated sender
