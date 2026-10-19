# Remote-only integration patch for the audio Playwright check (the real hook is relayed to the
# GameScreen owner): GameScreen calls attachSound(conn); playwright port -> 3391.
import re
p = 'apps/client/src/game/GameScreen.tsx'
s = open(p).read()
s = s.replace("import { unlockAudio } from './audio';", "import { attachSound, unlockAudio } from './audio';")
s = s.replace("    applyAmbientVolume();\n", "    applyAmbientVolume();\n    const detachSound = attachSound(props.conn);\n", 1)
s = s.replace("      game?.destroy();\n", "      game?.destroy();\n      detachSound();\n", 1)
assert s.count('attachSound') == 2 and 'detachSound();' in s, 'patch failed'
open(p, 'w').write(s)
c = 'tests/e2e/playwright.config.ts'
t = open(c).read().replace('process.env.E2E_PORT ?? 3398', 'process.env.E2E_PORT ?? 3391')
open(c, 'w').write(t)
print('patched')
