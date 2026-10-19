# Building piece brief (template)

Copy this into the agent prompt for one piece owner, and paste the filled-in design note at the top of the piece file.
Replace every `<...>`. The Hollowmere values in brackets are examples.

---

**Context.** You are the owner of piece `<piece id>` [house-7] in `../pixel3d/`. Read first:
`docs/PIPELINE.md`, `docs/TOWN.md` (§1 coordinates, §2 cameras, §3 palette, §4 piece API, §5 kit, §6 scale / occlusion /
budget, §7 how to render, §10 rubric, §11 user notes, §12 the integration notes that mention your piece), and the
`TOWN_LEARNINGS.md` sections for similar pieces [house-1 for curved roofs, house-13 for lofted shells].

**You own ONLY:** `src/town/pieces/<id>.js` (+ `src/town/pieces/<id>/*.js`), `shots/town-<id>/`, and append-only
`docs/TOWN_LEARNINGS.md`. Everything else is read-only. Cross-owner needs go in `CONTRACT-REQUEST:` lines.

**Identity.**
- Name: `<name>` [Toadstool Hollow]
- One-line read at 640x360: `<what a player must instantly see>` [a giant red toadstool with a stalk door]
- Source of truth: `<v1 file / sketch / brief>` [`../../packages/assets/scripts/houses/house-7.ts`]
- Signature shape: `<silhouette words>`. Must differ from both neighbours: `<neighbour ids + their shapes>`
- Inhabitant / story details (2-3, no clutter): `<...>`

**Layout record** (from `layout.js`, `ctx.record`): footprint `<x,z w×d>`, facing `<south|east|west|corner>`, door tile
`<x,z>`, chimney side `<left|right|none>`, style hint `<roof / wall / roof type>`, placement delta `<rotation / dx dz,
or none>`. Build in the GAME frame. The composer places you.

**Camera reality check (do this before you design).** Render `tools/townpiece.sh <id> shots/town-<id>/r0` and open
`ctx-noon.png`.
- Who stands south of you, between your front and the yaw-0 camera? A point at height h on your front at z0 clears a
  neighbour of height H at z1 only if h > H − 0.577·(z1 − z0).
- If your door is in an east or west wall, that wall is edge-on at yaw 0. Use a 45° chamfer, a south-facing porch or
  vestibule, a hood whose roof faces the camera, or a sign on an arm perpendicular to the wall.
- Lower-ring pieces in front of the square: respect the occlusion rule `h ≤ 0.577·z − 13.6`. Plan the heights per
  local z.

**Palette rows used** (`TOWN.md` §3): walls `<ramp>`, roof `<ramp>`, trim `<ramp>`, accents `<accent>`, door paint
`paintRamp(<v1 hex>)`. At most 3 tones per material plus line and rim. No new hues.

**Height plan** (local z → max y): back eave `<…>`, ridge `<…>`, chimney pot `<…>`, finial `<…>`. Limits: doors
2.0 m, ground-floor sills 0.9-1.1 m, eaves 2.4-3.0 m (one storey), ridge ≤ `<limit>` m.

**Required API and anchors.** `api.setDoor(f)`, `api.setLit(bool)`. Anchors: `doors [{id, pivot, open(f), point?, normal?}]`,
`chimneys [Vector3]`, `windows [{pos}]`, `lights [{pos, color, r, kind}]` (wall windows only; never roof or dormer windows),
`perches [Vector3]`. Everything in WORLD space, through `toRoot` / the frame matrix.

**Budget.** ≤ 8 draw calls (+1 per animated part), ≤ 15k tris, build ≤ 300 ms, programs constant. At
`ctx.quality === 'low'`: decimate patterns that are built as geometry.

**Process.**
1. Write the design note (this brief, filled in) at the top of your file.
2. Blockout with the kit, then render and look (isolation + ctx).
3. Model, materials and details. Iterate render → look → fix at least 4 times. Each time check `ctx-noon`,
   `crop-x3`, true 1x, `ctx-night`, `doors=1&tod=night&vh=5`, and `tools/towncrawl.sh shots/town-<id>/crawl --q
   'focus=<id>' --pieces <id>`.
4. `tools/shot.sh town shots/town-<id>/b.png --bench 60 --q "focus=<id>"`, and read report.txt.
5. Final `tools/townpiece.sh <id> shots/town-<id>`. Append lessons to TOWN_LEARNINGS.md.

**Known traps** (from TOWN_LEARNINGS):
- 1-texel course lifts make dashed lines: use 0.06-0.085 m.
- 1-px patterns on stepped courses make dotted lines.
- Coplanar faces flicker: offset by about 0.013 m.
- Parts under 0.05 m flip under a pan.
- Lanterns under a side eave are invisible at yaw 0.
- A PointLight at chest height paints a hard disc on the door.
- Inward doors disappear behind the interior plate.
- A body box behind an opening fills the doorway.

**Report:** `summary, files, screenshots (looked at), commands_run, contract_requests, learnings`, plus an honest
self-score against the TOWN rubric.
