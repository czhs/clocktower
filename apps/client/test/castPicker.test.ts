// lobby-ui: v2 roster picker helpers + cast portrait drawing (node, no DOM: canvases are stubs and
// there is no Image, so drawCastPortrait takes its fallback path).
import { describe, expect, it } from 'vitest';
import { DEFAULT_COSMETICS, type MemberView } from '@ct/protocol';
import { PLAYABLE, PLAYABLE_IDS } from '../../../packages/assets/src/cast';
import { castScale, castSheetKey, drawCastPortrait } from '../src/ui/common/castPortrait';
import { characterOf, randomCharacter, takenBy } from '../src/ui/lobby/CharacterPicker';

const member = (pid: string, displayName: string, preset: string | null): MemberView => ({
  pid,
  displayName,
  role: 'player',
  seat: null,
  ready: false,
  connected: true,
  isHost: false,
  cosmetics: { ...DEFAULT_COSMETICS, preset },
});

function stubCanvas() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, k) => (typeof k === 'string' && !['fillStyle', 'globalAlpha', 'imageSmoothingEnabled'].includes(k) ? (..._a: unknown[]) => void calls.push(k) : undefined),
      set: () => true,
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe('roster picker helpers', () => {
  it('the roster is 13 villagers + 13 course mascots, mascots carry a course', () => {
    expect(PLAYABLE.filter((c) => c.kind === 'villager')).toHaveLength(13);
    const mascots = PLAYABLE.filter((c) => c.kind === 'mascot');
    expect(mascots).toHaveLength(13);
    for (const m of mascots) expect(m.course).toBeTruthy();
  });

  it('randomCharacter returns a playable id and avoids taken ones while any are free', () => {
    const taken = new Set(PLAYABLE.slice(1).map((c) => c.id));
    for (let i = 0; i < 50; i++) expect(randomCharacter(taken)).toBe(PLAYABLE[0]!.id);
    for (let i = 0; i < 50; i++) expect(PLAYABLE_IDS.has(randomCharacter())).toBe(true);
    // everything taken: still returns someone (the server will resolve it)
    expect(PLAYABLE_IDS.has(randomCharacter(new Set(PLAYABLE.map((c) => c.id))))).toBe(true);
  });

  it('takenBy maps other members’ roster characters to their names, never your own', () => {
    const m = takenBy(
      [member('me', 'Ada', 'frog'), member('b', 'Bea', 'fox'), member('c', 'Cy', 'honk'), member('d', 'Old', 'lamplighter'), member('e', 'None', null)],
      'me',
    );
    expect([...m]).toEqual([
      ['fox', 'Bea'],
      ['honk', 'Cy'],
    ]);
  });

  it('characterOf ignores legacy / unknown presets and non-playable cast', () => {
    expect(characterOf({ ...DEFAULT_COSMETICS, preset: 'polly' })?.name).toBe('Polly');
    expect(characterOf({ ...DEFAULT_COSMETICS, preset: 'lamplighter' })).toBeUndefined();
    expect(characterOf({ ...DEFAULT_COSMETICS, preset: 'storyteller' })).toBeUndefined();
    expect(characterOf({ ...DEFAULT_COSMETICS, preset: null })).toBeUndefined();
  });
});

describe('cast portraits', () => {
  it('scales: exact below 2x, half steps to 3x, whole numbers above', () => {
    expect(castScale(0.8)).toBe(0.8);
    expect(castScale(1.45)).toBe(1.45);
    expect(castScale(2.3)).toBe(2);
    expect(castScale(2.8)).toBe(2.5);
    expect(castScale(3.9)).toBe(3);
    expect(castScale(4.2)).toBe(4);
  });

  it('sheet keys for the living and both ghost states', () => {
    expect(castSheetKey('frog')).toBe('frog');
    expect(castSheetKey('frog', true)).toBe('frog/ghost');
    expect(castSheetKey('frog', 'spent')).toBe('frog/ghost-spent');
  });

  it('without a loaded sheet it draws the fallback silhouette, sized to the box x dpr', async () => {
    const { canvas, calls } = stubCanvas();
    const real = await drawCastPortrait(canvas, 'frog', { size: 48, dpr: 2 });
    expect(real).toBe(false);
    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(96);
    expect(calls.filter((c) => c === 'ellipse')).toHaveLength(2);
  });

  it('without a size the canvas is the crop at 1x', async () => {
    const { canvas } = stubCanvas();
    await drawCastPortrait(canvas, 'frog', { crop: 'frame' });
    expect([canvas.width, canvas.height]).toEqual([32, 40]);
  });
});
