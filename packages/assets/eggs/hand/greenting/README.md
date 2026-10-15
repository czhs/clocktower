# Greenting (UCT) — hand-kept original style

Greenting is deliberately OUT OF PLACE: it keeps its original flat doodle style (smooth shapes, flat
green fill, dark outline) instead of the town's pixel-art style. User decision, 2026-10-15.

- `greenting_{0,1}_512.png` / `_128.png`: frame 0 (upright) and frame 1 (tilted wobble), transparent.
  Recreated by Codex `gpt-6-astra` from the user's reference (packages/assets/eggs/refs/user-greenting.png,
  gitignored), then colour-unified to the reference fill (75,168,116) with a dark outline (24,24,24),
  preserving anti-aliased edges.
- The 16x16 in-game frames `generated/eggs/egg_greenting_{0,1}.png` were downscaled (Lanczos, smooth)
  from these.

Pipeline note for the eggs/asset build: prefer these files over the procedural `greenting()` blockout
in eggs/scripts/mascots.ts, never pixel-quantise or palette-remap them, and exclude Greenting from
night tint / lighting so it stays flat and bright like a sticker. At the double-detail art size, use
the 128 px source scaled with smoothing.
