# Writing a homebrew character

For someone who knows Blood on the Clocktower but not this codebase.

The system-level reference is **[docs/scripts-and-characters.md](scripts-and-characters.md)** — the
hook table, the night-order bands and the secrecy rules live there. This page is the practical
"how do I add my character" guide, with templates.

## The short version

Two files, no engine changes:

1. **`packages/protocol/src/characters/homebrew.ts`** — the id, name, type, alignment and ability text.
2. **`packages/rules/src/scripts/homebrew.ts`** — the night order and the hooks.

Then build a `custom` script that includes it (below), and deal.

There is a deliberate escape hatch: a character that exists in step 1 but has **no** entry in step 2
still works. It gets an inert definition — never wakes, never does anything mechanical — which is
the correct implementation for a character whose ability is pure Storyteller judgement. You lose
nothing by starting there and adding hooks later.

## Step 1 — the catalogue entry

```ts
// packages/protocol/src/characters/homebrew.ts
export const HOMEBREW_CHARACTER_IDS = [
  'wizard',
  'plague_doctor',
  'my_character',        // <- add the id (snake_case, globally unique)
] as const;

export const HOMEBREW_CHARACTER_INFO: Record<HomebrewCharacterId, CharacterInfo> = {
  // ...
  my_character: {
    name: 'My Character',
    type: 'townsfolk',          // townsfolk | outsider | minion | demon | traveller | fabled
    alignment: 'good',
    ability: 'Each night, pick a player: you learn whether they are evil.',
    setupHint: '[+1 Outsider]', // optional, shown on the setup sheet
  },
};
```

`ability` is shown to the player in their HUD. Write it in second person, present tense, one or two
sentences — and in **your own words**: never paste rulebook text.

## Step 2 — the definition

```ts
// packages/rules/src/scripts/homebrew.ts
export const HOMEBREW_ROLES: ScriptRoleDefs = {
  // ...
  my_character: {
    firstNight: null,
    otherNight: 46,
    prompt: () => choose('Choose a player', 1, false, false, 'You learn whether they are evil.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the choice.' };
      const evil = t.alignment === 'evil';
      const text = evil ? 'They are evil.' : 'They are not evil.';
      return {
        text: `My Character on ${who(t)}: ${evil ? 'EVIL' : 'not evil'}`,  // Storyteller-only
        info: { text, yes: evil, seats: [t.seat] },                        // what the player may be sent
        notes: registrationNotes(s, [t]),
      };
    },
    infoOnly: true,
  },
};
```

### Templates by shape

**Information role** — compute the truth, let the Storyteller send it.

```ts
my_info_role: {
  firstNight: 45, otherNight: 45,
  prompt: () => choose('Choose a player', 1, false, false),
  suggest: (s, _p, step) => {
    const [t] = chosen(s, step);
    if (!t) return { text: 'Waiting for the choice.' };
    const n = /* compute the number/yes-no */ 0;
    return { text: `Number: ${n}`, info: { text: `You see ${n}.`, number: n } };
  },
  infoOnly: true,   // the step completes when the Storyteller sends the info
},
```

**Night choice that changes state** — always check `impaired`.

```ts
my_poisoner: {
  firstNight: 20, otherNight: 20,
  prompt: () => choose('Choose a player to poison', 1, true, false),
  resolve: (s, op, p, step, input) => {
    const t = target(s, input, step);
    if (impaired(p)) return `${who(p)} is drunk/poisoned: no effect.`;   // <- mandatory
    t.poisonedBy = 'storyteller';
    addReminder(t, 'Poisoned by My Poisoner');
    log(s, op, `My Poisoner poisons ${who(t)}`);
    return `${who(t)} is poisoned.`;
  },
  reminders: ['Poisoned by My Poisoner'],
},
```

**Protection** — a reason string, not a boolean.

```ts
my_soldier: {
  firstNight: null, otherNight: null,
  preventsKill: (_s, p, cause, opts) => {
    if (impaired(p) || cause !== 'demon') return null;
    // A once-per-game save must not be consumed during a preview:
    if (!opts.preview) addReminder(p, 'Ability used');
    return { reason: `${who(p)} cannot be killed by the Demon.` };
  },
},
```

**Public day ability** — reached through the same path as the Slayer's shot.

```ts
my_slayer: {
  firstNight: null, otherNight: null,
  dayAbility: {
    label: 'Take the shot',
    resolve: (s, op, shooter, t) => {
      if (shooter.abilityUsed) return 'Nothing happens.';
      shooter.abilityUsed = true;
      if (impaired(shooter)) return 'Nothing happens.';
      if (typeOf(t.character) === 'demon') { killPlayer(s, op, t, 'slayer'); return `${t.name} is dead.`; }
      return 'Nothing happens.';
    },
  },
},
```

Note: each player gets **one** public claim per game (the gate that stops Slayer-bluff spam), so a
`dayAbility` is attempted at most once per player regardless of your own book-keeping.

**Death trigger**

```ts
my_ravenkeeper: {
  firstNight: null, otherNight: null, dynamicOrder: 35,
  onDeath: (s, op, p, cause) => {
    if (cause !== 'demon' || !isNightPhase(s)) return;
    insertDynamicStep(s, p.seat, 'ravenkeeper');     // or just alert() and wake them yourself
    alert(s, op, `${who(p)} died: wake them.`);
  },
},
```

**Setup modifier**

```ts
my_baron: {
  firstNight: null, otherNight: null,
  setupNote: 'Two extra Outsiders, two fewer Townsfolk.',
  setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk - 2, outsiders: c.outsiders + 2 }),
},
```

The engine clamps the result so the distribution always seats exactly the player count, so you
cannot break a deal with an aggressive modifier — but keep the arithmetic balanced anyway.

**Pure Storyteller judgement** — a complete implementation, not a stub.

```ts
my_tinker: {
  firstNight: null, otherNight: null,
  nightNote: 'This player may die at any time, at your discretion. Use "kill" when you want it.',
  reminders: ['Marked'],
},
```

## Rules you must follow

**Check `impaired`.** Every `resolve` must start by checking `impaired(p)` and return a "no effect"
string instead of mutating. A drunk or poisoned player's ability does nothing. `suggest` should
still compute the truth and note the impairment — the Storyteller decides what to actually say.

**Never leak.** `suggest().text`, `suggest().notes` and `resolve()`'s return value are
**Storyteller-only**. The only things that reach a player are `suggest().info` (and only when the
Storyteller presses send) and `giveInfo()`. Never put another player's character, alignment or
status into any string that could reach a player.

**Don't add fields to `PlayerState`.** Use the `reminders: string[]` array for durable per-player
state: `addReminder(p, 'Charged')`, `removeReminder(p, 'Charged')`,
`p.reminders.includes('Charged')`. The Storyteller sees reminders in the Grimoire, so this is where
state belongs anyway. Declare the tokens you use in `reminders` so they are offered in the UI.

**Don't end the game.** Call `proposeResult` at most; the Storyteller confirms or overrides. Never
call `finish` from a character.

**Pick a night-order number in the right band** (see
[scripts-and-characters.md](scripts-and-characters.md#night-order-numbers)): 12–19 early
drunkenness, 20–24 poisoning and blocking, 25–29 protection, 30–34 Demon kills, 35–39 death
triggers, 40–49 information, 50–59 tomorrow-only effects, 60–69 evil information.

## Building a custom script

A custom script is just a list of character ids. `packages/rules/src/customScript.ts`:

```ts
import { buildCustomScript, validateCustomScript } from '@ct/rules';

const list = ['imp', 'poisoner', 'baron', 'chef', 'empath', 'monk', 'soldier', 'my_character', 'recluse'];

const { errors, warnings } = validateCustomScript(list);
// errors block: unknown id, duplicate id, no Demon, a believesOther character with nothing to
//   believe in.
// warnings are judgement calls: no Minion, too few Townsfolk, a list that cannot fill any player
//   count, Travellers/Fabled put in the main pool.

const script = buildCustomScript(list);
script.counts            // { townsfolk, outsiders, minions, demons }
script.firstNight        // night order for these characters, ascending
script.otherNight
script.setupModifiers    // which characters change the distribution, and why
script.setupDecisions    // red herrings, believed characters — what you must choose before dealing
script.jinxes            // advisory notes for awkward pairs
script.playerCounts      // which of 5..15 this list can actually be dealt for
```

The lobby stores `script: 'custom'` in its settings; `'custom'` has no fixed pool, so
`validateAssignment` accepts any mix without the off-script warning.

## Testing

Package tests live in `packages/rules/test/`. Use the helpers in `test/helpers.ts` —
`mkGame(chars, { script: 'custom' })`, `begin`, `finishNight`, `toDay`, `toNight`,
`act_night(s, 'my_character', [seat])`, `P(s, seat)`, `alive(s, seat)`, `stepView`.

```
docker run --rm -v "$PWD":/app -w /app ct-dev sh -c 'pnpm exec vitest run packages/rules'
docker run --rm -v "$PWD":/app -w /app ct-dev sh -c 'pnpm --filter @ct/rules run typecheck'
```

(On `hshi-u1` use `scripts/remote.sh` instead, per `CLAUDE.md`. The `ct-dev` image is
`node:24-bookworm-slim` + `python3 make g++ git` + `pnpm@10.34.7`.)

Assert four things per character:

1. it is in the night queue at the right position, and only when it should be;
2. `suggest` tells the Storyteller the truth for a known state;
3. `resolve` applies the effect;
4. `resolve` does nothing when the player is `impaired`.

`packages/rules/test/homebrew.test.ts` is a working example of all four, plus the custom-script
builder.

## What still needs a code change

Honest list, as of 2026-10-16:

- **Writing the character itself.** There is no in-app script editor: a new character means editing
  the two files above and redeploying. `buildCustomScript` is the data layer such an editor would
  sit on, but the UI does not exist.
- **New kinds of prompt.** `PromptKind` is `choose_players | choose_character | yes_no |
  acknowledge`. A prompt that needs a player *and* a character in one step is not expressible — the
  Gambler works around it by having the player pick the seat and the Storyteller record the guessed
  character on `resolve_step`.
- **Hooks that do not exist yet.** There is no hook for "when this player is chosen by another
  player's ability" (which is why Bad Moon Rising's Goon is Storyteller-run), and none for
  modifying a vote's weight (the Bureaucrat and Thief leave reminder tokens instead).
- **Alignment changes mid-game** are possible via `change_character`, but no hook fires on them.
