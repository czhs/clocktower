# Rules audit — Trouble Brewing engine (`@ct/rules`)

Auditor: rules-audit, 2026-10-14. Scope: `packages/rules/src/**`, checked against the official
Trouble Brewing rules (worded here in my own words), plus the Storyteller panel
(`apps/client/src/ui/storyteller/index.tsx`) for the cases the engine leaves to the ST.

Tests added (audit files only; no engine source was edited):

| File | Tests | Pass | Fail |
|---|---|---|---|
| `packages/rules/test/audit-setup.test.ts` | 8 | 8 | 0 |
| `packages/rules/test/audit-night.test.ts` | 28 | 25 | 3 |
| `packages/rules/test/audit-day.test.ts` | 24 | 18 | 6 |
| `packages/rules/test/audit-st.test.ts` | 12 | 11 | 1 |
| **Audit total** | **72** | **62** | **10** |

Whole rules suite after adding them: 148 tests, 138 pass, 10 fail. All 10 failures are the
findings below. The 76 existing tests still pass. `@ct/rules` typecheck is clean.

Commands run on hshi-u1:

```
CT_AGENT=rules-audit scripts/remote.sh pnpm vitest run packages/rules        # baseline: 4 files, 76/76 passed
CT_AGENT=rules-audit scripts/remote.sh pnpm vitest run packages/rules        # with audit files: 148 tests, 138 passed, 10 failed
CT_AGENT=rules-audit scripts/remote.sh pnpm vitest run packages/rules        # re-run, same result (10 failed | 138 passed)
CT_AGENT=rules-audit scripts/remote.sh --no-sync pnpm --filter @ct/rules run typecheck   # clean
```

---

## Findings

### F1 — HIGH: a dead Virgin still triggers
- **Rule:** when a character dies, its ability stops working. A dead Virgin can be nominated, but nothing happens.
- **Expected:** a Townsfolk who nominates a dead Virgin is not executed, and the nomination goes ahead normally.
- **Actual:** `nominate()` (`day.ts`) checks `nominee.character === 'virgin' && !nominee.abilityUsed` but never checks `nominee.alive`. The Townsfolk nominator is executed on the spot. That uses up the day's execution and can end the game (two alive means evil wins).
- **Fix hint:** add `nominee.alive &&` to the Virgin condition.
- **Test:** `audit-day › audit: Virgin › BUG: a dead Virgin has no ability: a Townsfolk nominating them is not executed`

### F2 — HIGH: the player on the block survives the end of the day (and can cause a false Mayor win)
- **Rule:** if someone is on the block when the day ends, they are executed. A day only counts as "no execution" for the Mayor if nobody was executed.
- **Expected:** `advance_phase` out of `day` while `day.block` is set either executes the player on the block or is refused.
- **Actual:** `advance()` (`engine.ts`) cancels pending nominations and runs `mayorCheck()`. The block is dropped silently. With 3 alive and a healthy Mayor, the engine declares a good win ("nobody was executed"), even though the votes had put someone (possibly the Imp) on the block. The game is then final and cannot be undone. In the UI, the "Ring bedtime bell" and "Night now" buttons give no warning when someone is on the block.
- **Tests:**
  - `audit-day › audit: voting › BUG: the player on the block at the end of the day is executed (or the day cannot end while someone is on the block)`
  - `audit-day › audit: voting › BUG (Mayor variant): someone on the block at 3 alive is not a "no execution" day for the Mayor`

### F3 — MEDIUM: a Poisoner who becomes the Imp keeps poisoning
- **Rule:** a Minion who becomes the Imp loses their Minion ability at once. The Poisoner's current victim becomes healthy straight away, just as when the Poisoner dies.
- **Expected:** after a star-pass to the Poisoner, nobody has `poisonedBy === 'poisoner'`.
- **Actual:** `becomeImp()` (`deaths.ts`) skips the Minion's pending steps, but it does not clear the Poisoner's poison. (`killPlayer` does clear it.) The Poisoner wakes before the Imp, so this happens whenever the Poisoner poisons someone and the Imp then star-passes to her. The victim stays poisoned for the rest of that night and through the next day:
  - The Empath, Fortune Teller and Spy steps are shown to the ST as "impaired".
  - The next day, a Slayer, Virgin, Saint or Mayor victim loses their ability. For example, executing the Saint would not lose the game for good.
- The same thing happens when the ST uses `change_character` on a living Poisoner. That is an ST correction, and the ST has a "Poisoned" toggle to fix it.
- **Fix hint:** in `becomeImp`, if the old character was `poisoner`, clear every `poisonedBy === 'poisoner'`. Do the same in `change_character` when `prev === 'poisoner'`.
- **Test:** `audit-night › audit: poison › BUG: the Poisoner becoming the Imp (star-pass) loses the Poisoner ability, so her victim is healthy`

### F4 — MEDIUM: the ST's "Undo" can undo a player's action instead of the ST's
- **Expected:** "Undo the last action" in the ST panel reverts the Storyteller's own last command.
- **Actual:** `applyPlayerAction` pushes snapshots onto the same `history` stack as ST commands. Nominations, Slayer shots and prompt answers all add a snapshot; votes do not. Example: the ST kills someone by mistake, a player then nominates, and the ST presses Undo. The nomination is reverted and the kill stays. Players' actions can be reverted without anyone seeing it. They also count towards the 30-entry limit, which pushes older ST snapshots out.
- **Fix hint:** only snapshot ST commands, or tag each snapshot with its author and have `undo_last` pop back to the ST's last one.
- **Test:** `audit-st › audit: undo › MEDIUM: the ST's undo reverts the ST's own last command, not a later player action`

### F5 — LOW: a bounced Mayor kill ignores the Soldier and Monk protection
- **Rule:** when the Mayor is attacked at night, the ST may make someone else die instead. That death is still a Demon kill: the engine already wakes a Ravenkeeper who dies this way. So a healthy Soldier, or a player the Monk protects, does not die from it. Bouncing onto one of them means nobody dies.
- **Actual:** in the `imp.resolve` hook (`roles.ts`), the redirected victim is passed straight to `killPlayer` without the protection and Soldier checks.
- **Impact:** this only happens if the ST picks that target. The ST can avoid it by choosing "no Mayor bounce" or another player. The "bounce →" list in the ST panel includes Soldiers and protected players.
- **Tests:**
  - `audit-night › audit: Mayor bounce › BUG: a bounced Demon kill onto a healthy Soldier kills nobody`
  - `audit-night › audit: Mayor bounce › BUG: a bounced Demon kill onto a Monk-protected player kills nobody`

### F6 — LOW (alerts only): misleading ST alerts
These alerts change no game state. They only show wrong advice in the ST panel.
- **Dead Butler.** A dead Butler has no ability and may use their ghost vote freely. `lockVote` still raises "Butler voted although their master …" because it checks `!impaired(p)` but not `p.alive`.
  - Test: `audit-day › audit: voting › LOW: a dead Butler has no ability: their ghost vote raises no "Butler voted without master" alert`
- **Poisoned Spy nominating the Virgin.** A poisoned Spy cannot register as a Townsfolk, but the engine still says "the Spy may register as a Townsfolk".
  - Test: `audit-day › audit: Virgin › LOW: a poisoned Spy cannot register as a Townsfolk, so no "Spy may trigger the Virgin" alert`
- **Poisoned Recluse shot by the Slayer.** A poisoned Recluse cannot register as the Demon, but the engine still says "the Recluse may register as the Demon". Note that `registrationNotes()` in `util.ts` already skips poisoned Spies and Recluses; these two alerts are out of step with it.
  - Test: `audit-day › audit: Slayer › LOW: a poisoned Recluse cannot register as the Demon, so no "Recluse may register" alert`

### F7 — MEDIUM (design / UX risk, no test): game endings the ST cannot undo
These actions can end the game permanently, and the ST panel asks for no confirmation:
- Executing a healthy Saint, using either "Execute" button.
- The Mayor win when the day ends ("Ring bedtime bell" / "Night now").
- The two-alive check after a night kill.

Once the game is finished, `undo_last` is refused on purpose (an existing test asserts this). So a single misclick, or F2 above, decides the game for good. By contrast, "Kill" and "Declare winner" do ask for confirmation. Suggestion: ask for confirmation on Execute when the target is a healthy Saint or the Demon, and on ending the day when that would trigger the Mayor win or execute nobody while someone is on the block.

---

## Verified correct (all passing; no change needed)

**Setup**
- The distribution is right for every player count 5–15, and the Baron gives +2 Outsiders / −2 Townsfolk at every count. There are never more than the 4 TB Outsiders.
- A manual Baron setup is accepted as standard.
- Demon bluffs are never the Drunk, never in play and never the Drunk's believed Townsfolk.
- The red herring may be the Drunk, the Recluse or the Fortune Teller themself; an evil red herring is rejected.
- The Drunk only ever sees their believed Townsfolk.

**Minion / Demon info**
- Skipped at 6 players, present at 7.
- With 3 Minions, each learns the Demon and the other Minions; only the Demon gets bluffs.

**Night order**
- First night: Poisoner first; then Washerwoman / Chef / Empath / Fortune Teller; then the Butler, then the Spy. No Monk, Imp, Undertaker or Ravenkeeper.
- Other nights: Poisoner, Monk, Imp, Ravenkeeper (inserted right after the Imp), Empath, Fortune Teller, Undertaker (only after an execution death), Butler, Spy.

**Poison**
- Lasts from the Poisoner's pick through the next day and is cleared at dusk.
- Ends when the Poisoner dies, including when the Imp kills her the same night.
- A Drunk "Monk" protects nobody.

**Imp**
- Attacking a dead player does nothing; the Ravenkeeper does not wake.
- A Monk-protected Imp who picks themself does not star-pass.
- Star-pass: the new Imp does not act again that night, their Minion step (e.g. the Spy) is skipped, and they kill from the next night.
- A poisoned Scarlet Woman, or a Scarlet Woman with only 4 alive, has no priority; the ST's choice of Minion is used.
- A star-pass that leaves 2 alive means evil wins. With no Minions alive, good wins (existing test).

**Mayor**
- A bounce onto the Ravenkeeper wakes them.
- A bounce onto the Imp kills the Imp. Good wins, or the Scarlet Woman takes over with 5+ alive.
- A poisoned Mayor cannot bounce.
- A poisoned Mayor, or the Drunk who believes they are the Mayor, gets no 3-alive win.

**Scarlet Woman**
- Triggers on execution, on a Slayer kill (at exactly 5 alive the day continues and nominations stay open) and on a Mayor bounce onto the Imp.
- Does not trigger at 3–4 alive.
- A Scarlet Woman who became the Imp and is then executed with no successor means good wins.

**Ravenkeeper / Undertaker / Empath / Fortune Teller / Spy**
- A Drunk or poisoned Ravenkeeper still wakes, with the step flagged as impaired.
- The Undertaker learns the nominator after a Virgin execution, "Imp" after a Scarlet Woman takeover and "Drunk" for an executed Drunk. They do not wake after executing an already-dead player.
- The Empath skips a neighbour killed earlier the same night.
- A dead red herring still reads "yes".
- The Spy's Grimoire shows the Drunk and poison truthfully.

**Voting**
- The threshold counts only living players.
- A tie clears the block; a strictly higher count is then needed.
- A ghost vote is spent only by a "yes" vote.
- Dead players may be nominated.
- A poisoned Butler may vote freely.

**Virgin**
- The Drunk who believes they are the Virgin does nothing.
- The ability is spent by the first nomination, even one by an Outsider.
- A Virgin execution counts as the day's execution, closes nominations and blocks the Mayor win.

**Slayer**
- Killing the Imp at 3 alive means good wins: the Demon's death takes priority over the two-alive rule.
- A Drunk "Slayer" does nothing.
- A shot wasted while poisoned cannot be retried.

**Saint**
- A Saint marked drunk, or already dead, does not lose the game when executed.

**Undo and overrides**
- Undo after a star-pass or a Scarlet Woman catch restores everything, including the player's view and private info.
- `change_character` to the Imp (with notify) wakes them as the Imp from the next night.
- A revived player can nominate and vote, and the ST can restore their ghost vote.
- A player killed and revived in the same night produces no dawn announcement.

**Secrecy**
- A star-pass changes nothing in good players' views until dawn, and then only the death is public.
- The new Imp is told at once.
- Poison, and a Drunk "Monk" choosing someone, leave no trace in the affected player's view.
- The final reveal shows the true characters (the Drunk, both Imps), while the Drunk's own role card still shows their believed character.
- Other Minions are not told about the new Imp.

---

## Storyteller judgment areas and how the ST handles them in the UI

| Situation | Engine behaviour | ST control in the panel |
|---|---|---|
| Spy may register as good / Townsfolk / Outsider (Washerwoman, Librarian, Investigator, Chef, Empath, Undertaker, Ravenkeeper, Virgin) | Suggestions stay truthful and add a "may register as …" note. A Spy nominating the Virgin raises an alert. | Night step "Edit info…" composer to send whatever info the ST rules. For the Virgin: Day tab "execute someone else…" → the Spy's seat. The announcement says "executed", not "executed on the spot" (cosmetic). |
| Recluse may register as evil / Minion / Demon (Fortune Teller, Empath, Chef, Investigator, Undertaker, Ravenkeeper, Slayer) | Notes on the info steps. A Slayer shot at the Recluse raises an alert. | "Edit info…" for info roles. For the Slayer: Grimoire "Kill" (announced by day). The announcement reads "is dead", not "slain" (cosmetic). |
| Drunk / poisoned info roles | Step flagged `impaired` with notes; the suggested info is still the truth. | "Edit info…" composer (any text, seats, characters, number, yes/no). |
| Mayor attacked at night | The kill lands unless the ST picks a bounce target. | Imp step "bounce → seat" select (see F5 for Soldier and protected targets). |
| Star-pass successor | A healthy Scarlet Woman with 5+ alive is forced (correct). Otherwise the ST's pick, otherwise random. | Imp step "star-pass: → seat" select (lists living Minions). Use Change… on the Grimoire afterwards to override. |
| Demon bluffs for a star-passed / Scarlet Woman Imp | Not sent automatically (the rules do not require it). | Info composer, if the ST wants to share bluffs. |
| Telling other Minions who the new Imp is | Not done (correct: they are not told). | Info composer if desired. |
| Butler votes without the master | Counted, plus an alert (see F6 for dead Butlers). No way to strike a single vote. | Cancel the nomination and re-run the vote, "execute someone else…", or "No execution". |
| Red herring | Chosen at setup (Setup tab, or random). No command to change it later. If an FT is created mid-game with `change_character`, there is no red herring. | Setup tab only. Acceptable: the rules fix the red herring for the whole game. |
| Drunk's believed Townsfolk | Chosen at setup. `change_character` to the Drunk keeps the player's previous belief and alerts if that is not a Townsfolk. No control to set the belief mid-game. | Setup tab. Mid-game, use "Change…" with "tell them" to give the player a new character card. The Drunk's believed character cannot be set on its own. |
| Changing a character to or from the Imp mid-game | No re-wiring of evil-team info and no Scarlet Woman or win processing. Alert "No living Demon …". | Info composer to tell the team, "Declare winner" if appropriate. Poisoner → other: clear the poison with the "Poisoned" toggle (see F3). |
| Revival | `set_alive true` publishes "returned to life" (by day, or at dawn). It does not restore a spent ghost vote or reset the Undertaker / `died` flags. | "Revive" button, plus the "Ghost vote" toggle. Night steps that were skipped stay skipped; prompt the player manually. |
| Executing someone other than the block / overriding the vote | Allowed (an ST power). | Day tab "execute someone else…" / "No execution". |
| Player on the block at day's end | **Not** executed automatically (F2). | Until fixed: the ST must press "Execute" before ringing the bell. |
| Accidental decisive execution / auto win | Final, cannot be undone (F7). | None after the fact. Only "Kill" and "Declare winner" ask for confirmation. |
| Poison set by the ST | Never wears off by itself (only the Poisoner's poison clears at dusk). | "Poisoned" toggle. |
| Undo | One snapshot per click; includes player actions (F4); refused once the game is finished. | Header undo button. |
