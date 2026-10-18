// (v3 WP6, v3-ui) The Settings "Town graphics" status line for every chooseRenderer outcome (§1.2 rows).
import { describe, expect, it } from 'vitest';
import { chooseRenderer, type ChoiceReason, type RendererChoice, type SelectEnv } from '../src/game3d/select';
import { currentRender, graphicsStatus, publishRender } from '../src/ui/common/graphicsStatus';

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

  it('reports a runtime fallback of this session instead of the fresh choice, with "Try v3 again" (remount)', () => {
    const err = graphicsStatus('v3', choice('ok', 'high'), { kind: 'classic', tier: 'low', fallback: 'error' });
    expect(err).toEqual({ text: 'The 3D town stopped (error), so Classic 2D draws it now.', action: 'retry' });
    // explicit 'v3' pref + perf fallback: row 7 does not apply, the fresh choice still says v3
    const perf = graphicsStatus('v3', choice('ok', 'high'), { kind: 'classic', tier: 'low', fallback: 'perf' });
    expect(perf).toEqual({ text: 'Switched to Classic 2D for speed in this session.', action: 'retry' });
    // debug force + crash: still the fallback line
    expect(graphicsStatus('v3', choice('forced'), { kind: 'classic', tier: 'low', fallback: 'error' }).action).toBe('retry');
  });
  it('agreeing renders and non-fallback renders keep the decision-table line', () => {
    // 'auto' + perf fallback: the memo (row 7) already says so and its action clears the memo
    expect(graphicsStatus('v3', choice('auto-fallback'), { kind: 'classic', tier: 'low', fallback: 'perf' }).action).toBe('auto-fallback');
    // the user picked Classic after a crash: the pref wins
    expect(graphicsStatus('v3', choice('pref-classic'), { kind: 'classic', tier: 'low', fallback: 'error' }).text).toBe('Classic 2D draws this town.');
    // the mounted 3D town reports its own (stepped-down) tier
    expect(graphicsStatus('v3', choice('ok', 'high'), { kind: 'v3', tier: 'low' }).text).toMatch(/light detail/);
    expect(graphicsStatus('v3', choice('ok', 'high'), null).text).toMatch(/full detail/);
    // a v2 lobby never shows a v3 fallback
    expect(graphicsStatus('v2', choice('world-v2'), { kind: 'classic', tier: 'low', fallback: 'error' }).text).toBe('This lobby uses the classic town.');
  });
  it('currentRender: publishRender notifies only on a change, null on unmount', () => {
    const seen: unknown[] = [];
    const off = currentRender.subscribe((v) => seen.push(v));
    publishRender({ kind: 'v3', tier: 'high' });
    publishRender({ kind: 'v3', tier: 'high' });
    publishRender({ kind: 'classic', tier: 'low', fallback: 'error' });
    publishRender(null);
    off();
    expect(seen).toEqual([{ kind: 'v3', tier: 'high' }, { kind: 'classic', tier: 'low', fallback: 'error' }, null]);
  });
});
