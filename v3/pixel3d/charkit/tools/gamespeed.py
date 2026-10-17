#!/usr/bin/env python3
"""Game-speed calculator: turn YOUR game's sprite numbers into the game-profile.json "game" block.

  python3 tools/gamespeed.py --sprite-px 38 --speed-px 150 --drawings 4 --fps 12.5 [--height-m 1.4]

  --sprite-px   on-screen character height in your game, px (or any unit; same unit as --speed-px)
  --speed-px    travel speed in the same unit per second (e.g. px/s)
  --drawings    drawings per walk cycle (two steps), usually 4-8
  --fps         walk animation playback rate (drawings per second)
  --height-m    optional: the pixel3d character height in metres (prints m/s for spec.gameSpeed.v / walkSpeed)
The renderer keys poses on a 30 Hz grid; a drawing held h grid frames = h/30 s. Prints the numbers and a JSON block.
"""
import argparse, json

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--sprite-px', type=float, required=True)
ap.add_argument('--speed-px', type=float, required=True)
ap.add_argument('--drawings', type=int, default=4)
ap.add_argument('--fps', type=float, default=12.5)
ap.add_argument('--height-m', type=float)
a = ap.parse_args()

hps = a.speed_px / a.sprite_px                  # body heights per second
cycle = a.drawings / a.fps                       # seconds per walk cycle
hpc = hps * cycle                                # body heights travelled per cycle
hold = 30.0 / a.fps                              # grid frames per drawing at 30 Hz
lo, hi = max(1, int(hold)), int(hold + 0.999) + 1
block = {
    'heightsPerSecond': round(hps, 3), 'walkDrawings': a.drawings, 'walkFps': a.fps,
    'cycleSeconds': [round(cycle * 0.62, 2), round(cycle * 1.55, 2)],
    'heightsPerCycle': [round(hpc * 0.64, 2), round(hpc * 1.43, 2)],
    'holdGridFrames': [lo, hi],
    'source': f'{a.speed_px:g}/s over a {a.sprite_px:g} tall sprite, {a.drawings}-drawing walk at {a.fps:g} fps',
}
print(f'travel      {hps:.2f} body-heights per second')
print(f'walk cycle  {cycle:.3f} s ({a.drawings} drawings, each {1000 / a.fps:.0f} ms = {hold:.1f} grid frames at 30 Hz)')
print(f'stride      {hpc:.2f} body-heights per cycle, one step {hpc / 2:.2f} H')
if a.height_m:
    v = hps * a.height_m
    print(f'for H = {a.height_m} m: spec gameSpeed.v / locomotion.walkSpeed = {v:.2f} m/s (on screen at vh 10: {v * 36:.0f} px/s)')
if hold < 2:
    print('note: drawings shorter than 2 grid frames read as boiling at 30 Hz; pixel3d gaits hold >= 2 (use fewer drawings or a lower fps)')
print('\n"game": ' + json.dumps(block, indent=2))
