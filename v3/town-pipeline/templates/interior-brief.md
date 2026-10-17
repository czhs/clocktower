# Interior brief (template)

One brief per room, or one per builder covering 3-5 rooms. Fill it in from `docs/LORE.md` (skeleton:
`lore-skeleton.md`). Read `../pixel3d/docs/INTERIORS.md` and the reference room `src/town/interiors/house-0.js` first.

---

**You own ONLY** `src/town/interiors/house-<i>.js` (+ `shots/lore-<i>/`). The kit (`interiors/kit.js`, `index.js`) is
read-only. Build custom geometry in your own file with `room.b` / `room.g` Builders.

**The house.** `<name>`, exterior style `<wall / roof>`. Inhabitant: `<who, one line>`. Story hook: `<the secret this
room hints at>`.

**Story props** (2-4, readable at the interior camera ≈ 55 px/m; make them bigger and simpler than you think):
1. `<prop>`: what it hints at: `<…>`
2. `<prop>`: …
3. *(optional)* `<prop>`

Small details for close lookers (1-3): `<…>`

**Shared motifs carried here** (from the lore doc; each motif appears in 2-4 houses, never all in one room; the "rare"
motif in exactly the houses the doc names): `<motif>`, placed as `<object / position>`.

**Distinctness. Vary the ROOM ITSELF, not just the props.**

| axis | this room | must differ from |
|---|---|---|
| shape | `<rect / L-shape / round tower / loft or mezzanine / low cabin / workshop / boat hull>` | `<houses with the same>` |
| fireplace | `<back-left / side / corner / none / stove / forge>` | |
| windows | `<placement + count>` | |
| floor | `<boards / flags / rubble / earth / rugs>` | |
| walls | `<limewash / wallpaper / rubble / brick dado / boards>` | |
| ceiling / beams | `<…>` | |
| clutter density | `<sparse / medium / packed>` | |

**Lighting recipe.**
- Day: key light `<colour / temperature / source>` and the window sky.
- Night: glow sources `<hearth / candles / lanterns / bioluminescence / moonbeam>`, and the target mood
  `<candle-warm / gold / roaring orange / teal river / …>`.
- Lights are `room.light({pos, color, r, kind})` anchors only. **Never create a PointLight**, because a changed light
  count recompiles every shader. Keep pools soft: wall-hugging lights get short reach, and emissive glow props carry
  the mood. No hard coloured discs on plaster.
- Optional per-room `nightAmbient` (`DEMO.md` §4.3).

**Animated ambiance element** (at least one, cheap, stepped, pure f(t), returned in `extras` and driven by
`update(t)`): `<motes in a sunbeam / steam / sparks / firefly specks / ripples on the walls / pendulum / swinging lantern /
drifting flour>`.

**Contract to keep working:** `spawn`, `exit` (the doorway gap at x 0 stays free), `collision` (`room.solid(...)`
for custom furniture), `camera`, `bed` + `visit` (night visits), `lights`, `spots`. Budget is about 16 meshes and 10k
tris.

**Check.**
- `tools/shot.sh interior shots/lore-<i>/n.png --q "house=<i>&tod=night"`, and the same with `tod=noon` and `yaw=45`.
- `char=wanderer` for scale, and `town=1` once.
- A **25 % line-up** of all rooms at noon AND at night (`tools/remote.sh --no-sync python3 tools/sheet.py sheet
  shots/lore-<i>/lineup.png "shots/lore-*/n.png" --cols 5 --scale 0.25`). Your room must be identifiable by layout,
  palette and light alone.
