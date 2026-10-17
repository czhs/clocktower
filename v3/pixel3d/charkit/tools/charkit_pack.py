#!/usr/bin/env python3
"""charkit launcher: applies game-profile.json to the upstream pack/check tools, then runs them.

  python3 tools/charkit_pack.py <id> [tools/charpack.py options]        # normally via tools/charpack.sh
  python3 tools/charkit_pack.py --bake <id> [tools/bake.py options]     # normally via tools/charpack.sh --bake

What the profile changes (nothing is forked: the upstream modules are imported and their tables replaced):
  charcheck.GAME          h_per_s / cycle / h_per_cycle / hold  ← profile.game (game-speed walk + `game.readable` row)
  charcheck.CAST_CLIPS    the required clips of the `cast_clips` row                ← profile.clips (minus "$emote")
  charpack.CAST           the clip list of --preset profile|cast (required + optional) ← profile.clips + optionalClips
  --preset profile        = --preset cast with the lists above (the spec's `emote` clip is always appended)
The profile file: $CHARKIT_PROFILE, else game-profile.json at the kit root. Run from anywhere; it chdirs to the kit root.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)
sys.path.insert(0, HERE)

try:
    import numpy  # noqa: F401
    from PIL import Image  # noqa: F401
except ImportError as e:
    sys.exit(f'charkit: missing Python package ({e}). Install: python3 -m pip install -r requirements.txt')

import charcheck  # noqa: E402

PROFILE = os.environ.get('CHARKIT_PROFILE') or os.path.join(ROOT, 'game-profile.json')


def load_profile(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


prof = load_profile(PROFILE)
g = prof.get('game') or {}
G = charcheck.GAME
if 'heightsPerSecond' in g:
    G['h_per_s'] = float(g['heightsPerSecond'])
if 'cycleSeconds' in g:
    G['cycle'] = tuple(float(x) for x in g['cycleSeconds'])
if 'heightsPerCycle' in g:
    G['h_per_cycle'] = tuple(float(x) for x in g['heightsPerCycle'])
if 'holdGridFrames' in g:
    G['hold'] = tuple(int(x) for x in g['holdGridFrames'])
required = [c for c in (prof.get('clips') or list(charcheck.CAST_CLIPS)) if not c.startswith('$')]
optional = [c for c in (prof.get('optionalClips') or []) if c not in required and c != 'turn']
charcheck.CAST_CLIPS = tuple(required)

import charpack  # noqa: E402
charpack.CAST = required + optional


def preset_to_cast(args):
    """--preset profile → --preset cast (charpack resolves the spec's emote + turn itself)."""
    out = list(args)
    for i, a in enumerate(out[:-1]):
        if a == '--preset' and out[i + 1] in ('profile', 'cast'):
            out[i + 1] = 'cast'
    return out


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        print(f'profile: {PROFILE} ({"found" if prof else "missing: upstream defaults"})  game={G}  clips={charpack.CAST}')
        sys.exit(2)
    if args[0] == '--bake':
        args = args[1:]
        import bake
        if '--preset' in args and '--clips' not in args:
            i = args.index('--preset')
            if args[i + 1] in ('profile', 'cast'):
                # bake.py's own cast list is fixed: resolve the profile list against the spec's clips (one quick load)
                name = args[0]
                raw = os.path.join('out', 'charkit-meta')
                os.makedirs(raw, exist_ok=True)
                q = {'scale': 1, 'char': name, 'bg': 'key', 'grid': 'clips', 'clip': 'idle'}
                m = charpack.shot({'name': 'meta-' + name.replace('/', '_'), 'q': q, 'times': [1.0]}, raw)
                ci = charcheck.char_info(m)
                if not ci:
                    sys.exit(f'charkit: meta render of {name} failed: {m.get("errors")}')
                have = list(ci['clips'].keys())
                clips = [c for c in charpack.CAST if c in have]
                if ci.get('emote') in have and ci['emote'] not in clips:
                    clips.append(ci['emote'])
                missing = [c for c in required if c not in have]
                if missing:
                    print('profile preset: spec lacks', missing, file=sys.stderr)
                del args[i:i + 2]
                args += ['--clips', ','.join(clips)]
        sys.argv = ['bake.py'] + args
        bake.main()
        return
    sys.argv = ['charpack.py'] + preset_to_cast(args)
    charpack.main()


if __name__ == '__main__':
    main()
