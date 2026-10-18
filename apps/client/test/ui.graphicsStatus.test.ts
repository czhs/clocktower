// (v3 WP6, v3-ui) The Settings "Town graphics" status line for every chooseRenderer outcome (§1.2 rows).
import { describe, expect, it } from 'vitest';
import { chooseRenderer, type ChoiceReason, type RendererChoice, type SelectEnv } from '../src/game3d/select';
import { graphicsStatus } from '../src/ui/common/graphicsStatus';

const choice = (reason: ChoiceReason, tier: 'low' | 'high' = 'low'): RendererChoice => ({ renderer: reason === 'ok' || reason === 'forced' ? 'v3' : 'classic', tier, row: 0, reason, gpu: null });

describe('graphicsStatus', () => {
  it('outside a lobby / in a v2 lobby', () => {
    expect(graphicsStatus(null, null).text).toMatch(/Hollowmere/);
    expect(graphicsStatus('v2', choice('world-v2')).text).toBe('This lobby uses the classic town.');
  });
  it('offers "Try v3 again" after a perf fallback and "Try v3" after a crash loop', () => {
    expect(graphicsStatus('v3', choice('auto-fallback'))).toEqual({ text: 'Auto (Classic: too slow on this device)', action: 'auto-fallback' });
    expect(graphicsStatus('v3', choice('boot-guard')).action).toBe('boot-guard');
  });
  it('has a line for every reason, and an action only for the two recoverable ones', () => {
    const all: ChoiceReason[] = ['world-v2', 'forced', 'forced-no-webgl2', 'pref-classic', 'boot-guard', 'no-webgl2', 'software-gl', 'auto-fallback', 'phone', 'ok'];
    for (const r of all) {
      const s = graphicsStatus('v3', choice(r));
      expect(s.text.length, r).toBeGreaterThan(10);
      expect(!!s.action, r).toBe(r === 'auto-fallback' || r === 'boot-guard');
    }
    expect(graphicsStatus('v3', choice('ok', 'high')).text).toMatch(/full detail/);
    expect(graphicsStatus('v3', choice('ok', 'low')).text).toMatch(/light detail/);
  });
  it('matches the real decision table (memo row 7)', () => {
    const env: SelectEnv = {
      world: 'v3',
      pref: 'auto',
      force: false,
      probe: () => ({ renderer: 'ANGLE (NVIDIA)' }),
      bootGuard: { blocked: false, booting: false, unclean: 0 } as unknown as SelectEnv['bootGuard'],
      autoFallbackAt: new Date(1_000_000).toISOString(),
      now: 1_000_000 + 86_400_000,
      coarsePointer: false,
      shortSide: 1080,
      fxLow: false,
    };
    expect(graphicsStatus('v3', chooseRenderer(env)).action).toBe('auto-fallback');
    expect(graphicsStatus('v3', chooseRenderer({ ...env, pref: 'v3' })).text).toMatch(/3D town is on/);
    expect(graphicsStatus('v3', chooseRenderer({ ...env, pref: 'classic' })).text).toBe('Classic 2D draws this town.');
  });
});
