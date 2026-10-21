# Scripts and characters

How a character is added to Clocktower Town. Read this before touching any character table.

Owner: rules-storyteller. Contract: `packages/rules/src/rolekit.ts`.

## The shape of the system

A character is **data plus optional hooks**. Nothing in the engine branches on a character id —
`day.ts`, `deaths.ts`, `night.ts` and `setup.ts` only call hooks. That is what makes a new script
(or a homebrew character) purely additive.

```
packages/protocol/src/characters/
  types.ts        CharacterType, Alignment, CharacterInfo, SCRIPT_IDS, ScriptInfo
  tb.ts           Trouble Brewing: 22 ids + CHARACTER_INFO entries
  bmr.ts          Bad Moon Rising
  snv.ts          Sects & Violets
  travellers.ts   Travellers (every script may add them)
  fabled.ts       Fabled (Storyteller-facing, no seat)
  homebrew.ts     custom characters
  index.ts        merges everything -> CHARACTER_IDS, CHARACTER_INFO, SCRIPT_INFO

packages/rules/src/
  rolekit.ts      the RoleDef contract + helpers (choose, target, chosen, pairPick, ...)
  roles.ts        merges every script's table -> ROLES; night-order helpers
  scripts/tb.ts   Trouble Brewing definitions
  scripts/bmr.ts  ... etc, one module per pool
```

Two files per script: **the protocol table** (name / type / alignment / ability text) and **the
rules table** (night order + hooks). Ids must be globally unique across every script.

## Adding a character

### 1. Protocol entry

```ts
// packages/protocol/src/characters/bmr.ts
export const BMR_CHARACTER_IDS = ['grandmother', 'sailor', /* ... */] as const;

export const BMR_CHARACTER_INFO: Record<BmrCharacterId, CharacterInfo> = {
  grandmother: {
    name: 'Grandmother',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'First night: you learn a good player and their character. If the Demon kills them, you die too.',
  },
  // ...
};
```

`ability` must be an **original short paraphrase**, never rulebook text.

### 2. Rules definition

```ts
// packages/rules/src/scripts/bmr.ts
export const BMR_ROLES: ScriptRoleDefs = {
  sailor: {
    firstNight: 12,
    otherNight: 12,
    prompt: () => choose('Choose a player to drink with', 1, false, true),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `${who(t)} drinks with the Sailor: one of them is drunk tonight.` : 'Waiting…' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Sailor ${who(p)} is drunk/poisoned: no effect.`;
      // ... mutate state, log, return the ST-facing outcome
      return `${who(t)} is drunk tonight.`;
    },
  },
};
```

### Night order numbers

One shared number line; lower acts earlier. Keep new characters inside these bands so scripts
interleave sensibly when a custom script mixes them:

| Band | What belongs there |
|---|---|
| 0 | `dusk` |
| 10-11 | Minion info, Demon info (first night only) |
| 12-19 | Drunkenness and poisoning that must land before anything else (Sailor, Philosopher) |
| 20-24 | Poisoners and ability-blockers |
| 25-29 | Protection (Monk, Innkeeper, Devil's Advocate) |
| 30-34 | Demon kills |
| 35-39 | Death-triggered wakes (`dynamicOrder`: Ravenkeeper, Sage, Farmer) |
| 40-49 | Information roles |
| 50-59 | Choices that only matter tomorrow (Butler, Juggler counting) |
| 60-69 | Evil information (Spy, Widow) |
| 999 | `dawn` |

`firstNight: null` / `otherNight: null` means the character does not wake then.
`dynamicOrder` is for characters only woken by an event.

## The hooks

Every field is optional. A character whose ability is pure Storyteller judgement needs only an
order number and usually a `prompt` — that is a complete, correct implementation, not a stub,
because **the engine advises and never gates** (`docs/vision.md`, principle 2).

| Hook | Called when | Use for |
|---|---|---|
| `wakes(s, p, firstNight)` | building the night queue | conditional wakes (Undertaker needs an execution) |
| `prompt(s, p)` | the ST opens the step | what the player is asked |
| `prepare(s, p, rng)` | the night queue is built | stable random picks (Washerwoman's pair) |
| `suggest(s, p, step)` | the ST views the step | the truthful answer + ready-to-send info |
| `resolve(s, op, p, step, input)` | the ST resolves the step | apply the state change; return ST-facing text |
| `infoOnly: true` | — | the step completes when the ST sends info (no state change) |
| `setupModifier(counts, n)` | drawing characters | change the distribution (Baron: +2 Outsiders) |
| `wantsRedHerring: true` | setup | needs a good player who registers falsely |
| `believesOther: type` | setup | the player is told they are a different character of that type |
| `preventsKill(s, p, cause)` | a kill targets this player | Soldier-style safety; return `{ reason }` |
| `onDeath(s, op, p, cause)` | this player died | dynamic wakes, death-triggered state |
| `onNominated(s, op, p, nom)` | this player was nominated | Virgin; return `'cancelled'` to stop the vote |
| `onExecuted(s, op, p, cause)` | execution, before the kill | Saint; return `'handled'` if you killed them |
| `onEndOfDay(s, op, p)` | day ends with no execution | Mayor-style win; return `true` if the game ended |
| `onDemonDeath(s, op, p, aliveBefore)` | no Demon is alive | succession; return `true` if you took over |
| `dayAbility` | a public daytime claim | Slayer-style shots |
| `reminders` | — | tokens offered in the Grimoire |
| `jinxes` | — | advisory text when another character is in play |
| `setupNote` / `nightNote` | — | extra lines in the ST's panels |

### Impairment is your responsibility

`impaired(p)` is true when the player is drunk or poisoned. Every `resolve` must check it and
return a "no effect" string rather than mutating state. `suggest` should still compute the truthful
answer and note the impairment, because the Storyteller decides what to actually tell the player.

The real Drunk never reaches `resolve` with an effect: `night.ts` short-circuits
`p.character === 'drunk'`. Characters with `believesOther` get the same treatment.

### Secrecy

Never put another player's character, alignment or status into a string that can reach a player.
`suggest().text` and `resolve()`'s return value are **Storyteller-only**. Only `suggest().info` and
`giveInfo()` reach a player, and only when the ST presses send.

## Testing

Package tests live in `packages/rules/test/`. Use the existing helpers in `test/helpers.ts`.

```
docker run --rm -v "$PWD":/app -w /app ct-dev sh -c 'pnpm exec vitest run packages/rules'
docker run --rm -v "$PWD":/app -w /app ct-dev sh -c 'pnpm --filter @ct/rules run typecheck'
```

(The `ct-dev` image is `node:24-bookworm-slim` + `python3 make g++ git` + `pnpm@10.34.7`. On
hshi-u1 use `scripts/remote.sh` instead, per `CLAUDE.md`.)

At minimum, assert for each character:

1. it appears in the night queue at the right position, and only when it should;
2. `suggest` returns the truthful answer for a known state;
3. `resolve` applies the effect, and does nothing when the player is `impaired`;
4. nothing private leaks into `projectForPlayer` for other seats (`test/secrecy.test.ts` pattern).

## Scripts

`SCRIPT_INFO` in `packages/protocol/src/characters/index.ts` lists the pool per script. The lobby's
`LobbySettings.script` selects it; `GameState.script` carries it into the engine; `randomAssignment`
and `validateAssignment` are scoped by it. `'custom'` has no fixed pool and accepts any mix.

The setup distribution table (`SETUP_TABLE` in `setup.ts`) is shared by all three official scripts —
only `setupModifier` hooks change it.
