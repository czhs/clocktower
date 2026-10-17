# User-request verifier (template)

The loop in `workflows/town-user-requests.workflow.js` runs one verifier per request, in parallel, for up to 3
rounds. A verifier checks one request, edits nothing, and returns pass/fail with evidence.

## 1. Write the request down first

Write each request as **one verifiable sentence** in the contract doc (`TOWN.md` §11, "Notes from the user"), with
the user's own words quoted, and add it to `args.requests` as `{id, text}`:

```js
{ id: 'circle-visible', text: 'The bottom house must not cover the bottom of the voting circle: at the gameplay camera centred on the dais and on the south seats, all 15 seats and anyone standing on them are fully visible.' }
```

Good request text names **where to look** (camera, focus, time of day), **what must be true on screen**, and any
**data condition** (for example "no `stats.doorMismatch`", "low tier ≤ ~400k frame tris"). Bad request text: "make it
nicer".

## 2. Verifier prompt

> You are an independent, skeptical VERIFIER (round `<n>`). Do not edit files except `shots/verify-<id>-r<n>/`.
> Check exactly this user request and nothing else: "`<request text>`"
> Render whatever proves or disproves it: the gameplay camera at the relevant spots (including `?focus=` on door
> tiles and the player's approach), overview, every time of day it could fail at, the low tier, `--bench 60`, GIF
> frames, and `cut=0` controls to show what the fix is hiding. Open every image.
> `pass=true` only if a demanding user looking at your renders would agree it is fully done. Data claims count: a
> failing stat is a failure even if the picture looks fine. Otherwise list problems, each with the owning file or piece
> (`lead` or a piece id) and a concrete fix.

## 3. Verdict schema

```json
{ "pass": false,
  "evidence": "what you rendered and saw, with paths",
  "screenshots": ["shots/verify-circle-visible-r1/sq-noon.png"],
  "problems": [{ "owner": "lead", "problem": "seats 7-8 hidden up to the chest by house-9's roof at focus 22.5,27", "fix": "move house-9 ≥ 5 m south; check ?occl=1 > 28.5" }] }
```

## 4. Rules that made the loop converge

- One request per verifier, and the verifier has no stake in the fix. Re-verify only the requests that failed.
- Group the failed problems **by owner** and run one fixer per owner in parallel. Fixers re-render in context.
- After the last round, report what still fails and say so in the gallery. Do not round a fail up to a pass.
- Critics in later runs score the §11 section too, so a fixed request stays fixed.
