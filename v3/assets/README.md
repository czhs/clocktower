# v3 baked assets (from pixel3d `out/`)

Baked outputs of the pixel3d pipelines that `v3/pixel3d/tools/publish-v3.sh` does not publish (it skips
`out/`). Imported into the repo so every v3 asset is on GitHub. Refresh with
`scripts/v3/import-assets.sh` (copies the maintainer's local pixel3d `out/` here).

| Folder | What | Made by |
|---|---|---|
| `sprites/` | per-character sprite bakes `<id>.{png,json}` (+ `-shadow`, `-preview`): idle, walk, talk, vote, point, die, ghost, ghost-spent, emote, 8 directions | `tools/charpack.sh --bake` (docs/CHARACTER_PLAYBOOK.md) |
| `sprites-tools/` | tool/test bakes (wanderer) | same |
| `ui/` | UI atlases in the v3 style, v2 frame names kept: `kit` (panel kit + bitmap font), `emotes`, `markers`, `indicators`, `portraits`, `cast-portraits` (+ `-night` variants) | `tools/uibake.sh <group>` (docs/UI.md) |

The live game renders characters and the town in 3D from `v3/pixel3d/src` (no bake needed); these
atlases are used for the HUD/UI and 2D fallbacks.
