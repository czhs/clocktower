# Critic prompt + TOWN RUBRIC (template)

Use this for an art-director critic of one piece, or of the whole town. The critic is a separate agent that **edits
nothing** except `shots/critic-<id>/`, renders everything itself, and returns a score plus issues routed to owners.
This is the rubric from `../pixel3d/docs/TOWN.md` §10. If you fork it for a new town, change it there too: the
critics and the authors must read the same table.

---

## Prompt

> You are a demanding ART DIRECTOR for a t3ssel8r-style 3D pixel-art town (`<+ the charm of the source 2D art>`).
> Do not edit files except `shots/critic-<id>/`. Critique `<piece id | the whole town, lens: <lens>>`.
> Brief: `<the author's brief>`. Author's report: `<summary + screenshot paths>`.
> Render it yourself: `tools/townpiece.sh <id> shots/critic-<id>`, plus a whole-texel pan crawl
> (`tools/towncrawl.sh shots/critic-<id>/crawl --q 'focus=<id>' --pieces <id>`), 1x crops, night, the gameplay camera in
> context (`focus=` on the door tile too), and frames or a GIF for anything animated. For the whole town, also run
> `tools/townshots.sh shots/critic-town --set integration`, the quality tiers, and `scenes/town-life.js` GIFs.
> Compare against `<refs / the source art>`. Score every criterion below 0-2 with concrete notes. **For every score below
> 2, give the crop location (x, y in 1280x720) and the owning piece.** List every issue with a concrete fix: owner
> `<id>` for the piece, another piece id or `lead` for problems elsewhere. Also score `TOWN.md` §11 (user notes) where it
> applies.

Lenses that worked for whole-town critics:
- **architecture**: the buildings as a set (identity, distinctness, cohesion, scale, silhouettes and doors from the
  gameplay camera, occlusion between pieces).
- **environment-life**: ground, foliage, props, light, time of day, night, atmosphere, animation, crawl, performance.

## TOWN RUBRIC (12 criteria × 0-2; **ship bar ≥ 19/24 with no zero on 2, 3, 4 or 7**)

Score from the 1280x720 captures (`sheet.png`, `ctx-*.png`, `crop-x3.png`, zoomed turntables), per piece and for the
composed town.

| # | criterion | how to check | 2 = |
|---|---|---|---|
| 1 | **Silhouette & identity** | squint / 25 % size; compare with the source design + `record.brief` | instantly recognisable as that building (the boot is a boot); distinct from both neighbours; the source charm survives |
| 2 | **Faithful layout / footprints** | turntable + ctx vs the layout table | footprint, facing, door position, door tile clear, chimney side, overhang limits all as specified |
| 3 | **Palette discipline** | sample colours | every colour traces to the palette ramps / derivatives; ≤ 3 tones per material + line + rim; warm light, cool shadow; no pure black/white, no new hues |
| 4 | **Pixel-art cleanliness** | crop-x3, `outlineDebug=1`, crawl check | 1-px outlines, no doubled or dashed lines on straight edges, no speckle noise, no shimmer; 0 changed interior pixels on a whole-texel pan |
| 5 | **Lighting / shading** | noon turntable, `debug=raw` | clean 3-tone bands (left hi, front mid, right shadow at noon), correct line sides, cream rims only on convex top edges, shadows read |
| 6 | **Detail density for 640x360** | crop-1x at true size | every feature ≥ 2-3 px at the gameplay camera, no sub-texel clutter; patterns fade cleanly at the overview |
| 7 | **Readability at the gameplay camera** | ctx-noon | the building reads as one object, its door is obvious (side doors too), the square / seated heads stay visible (occlusion rule) |
| 8 | **Cohesion with the neighbours / town** | ctx + overview + iso | consistent scale, roof pitches, materials and light; sits on the ground; the street reads as one village |
| 9 | **Night look** | ctx-night | windows glow (emissive), lanterns warm the ground, silhouettes readable against the night, nothing blown out |
| 10 | **Animation quality** | `--times` frames / GIF | stepped 3-8 fps, pure f(t), nothing glides sub-pixel; static solids identical between frames (pieces without animation: 2 if they offer anchors that life uses well) |
| 11 | **Performance** | report.txt, `--bench 60` | within the budget, programs constant, build time within budget |
| 12 | **Charm / storytelling** | look | cozy-gothic lived-in details that tell the building's story without clutter |

## Output schema (what the workflows enforce)

```json
{ "score": 0, "max": 24,
  "per_criterion": [{ "criterion": "1 Silhouette & identity", "score": 2, "note": "…" }],
  "issues": [{ "owner": "house-7", "severity": "high|medium|low", "problem": "… at (612, 344)", "fix": "…" }],
  "verdict": "…", "screenshots": ["shots/critic-house-7/ctx-noon.png"] }
```

Scoring notes that kept critics honest:
- A covered voting-circle seat is a 0 on criterion 7.
- Crawl: report the magnitude (max |dc|) next to the count. 1-3/255 grade or derivative noise is not a geometry fault.
- Overview-only problems (two roofs of the same hue merging at viewHeight 32) still count under 8.
