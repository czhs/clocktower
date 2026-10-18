// (v3 WP6, v3-ui) "No v2/v3 art mixing" at the consumers (docs/v3/INTEGRATION.md §5, §8 WP6 Accept):
//  - castPortrait under the installed sources: the pending source draws the silhouette (never a v2 flash) until
//    the v3 atlas lands, then the v3 strip; the documented skips (nicksong, brianbi) stay v2; v2 art returns
//    when the skin turns off.
//  - the social dock / pie lookup (PieMenu socialArtFor): v2 sheet when off, nothing while the atlas loads,
//    v2 only for the skip list.
// Node, no DOM: a stub canvas records what is drawn, a stub Image "decodes" on the next microtask, and the
// skin state (ui/common/v3skin.ts) is mocked so the test controls on/off, the loaded atlas and the pending load.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const V3_URL = 'v3/cast-portraits.png';
const strip = {
  url: V3_URL,
  frameWidth: 32,
  frameHeight: 40,
  dir: 'down',
  sheets: { frog: { x: 0, y: 0, frames: 5 }, 'frog/ghost': { x: 160, y: 0, frames: 1 }, 'frog/dead': { x: 192, y: 0, frames: 1 } } as Record<string, { x: number; y: number; frames: number }>,
  walkStepMs: 67,
  skipped: ['nicksong', 'brianbi'],
};
const st = vi.hoisted(() => ({ atlas: null as unknown, pending: null as Promise<void> | null }));
vi.mock('../src/ui/common/v3skin', async () => {
  const { createStore: cs } = await import('../src/net/store');
  return {
    v3Skin: cs({ on: false, look: 'day', night: false, hour: 10, rev: 0 }),
    v3AtlasNow: () => st.atlas,
    v3AtlasPending: () => st.pending,
    loadV3Atlas: () => Promise.resolve(null),
    v3AtlasRef: () => null,
  };
});

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  width = 1024;
  height = 1024;
  private s = '';
  get src(): string {
    return this.s;
  }
  set src(v: string) {
    this.s = v;
    queueMicrotask(() => this.onload?.());
  }
}
const g0 = globalThis as unknown as { Image?: unknown };
const prevImage = g0.Image;
beforeAll(() => void (g0.Image = StubImage));
afterAll(() => void (g0.Image = prevImage));

interface Drawn {
  silhouettes: number;
  images: string[];
}
function stubCanvas(): { canvas: HTMLCanvasElement; drawn: Drawn } {
  const drawn: Drawn = { silhouettes: 0, images: [] };
  const g = new Proxy(
    {
      ellipse: () => void drawn.silhouettes++,
      drawImage: (img: { src: string }) => void drawn.images.push(img.src),
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: () => true },
  );
  return { canvas: { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement, drawn };
}

const { drawCastPortrait, setPortraitAlt } = await import('../src/ui/common/castPortrait');
const { v3Skin } = await import('../src/ui/common/v3skin');
const { PENDING_PORTRAITS } = await import('../src/ui/common/v3skinLobby');
const { v3Portraits } = await import('../src/ui/common/v3portrait'); // installs itself as the source
const { socialArtFor, SKIPPED } = await import('../src/ui/social/PieMenu');

const fakeAtlas = { castStrip: () => strip, frame: (n: string, night?: boolean) => ({ url: night ? 'n.png' : 'd.png', x: 0, y: 0, w: 8, h: 8, sheetW: 64, sheetH: 64, name: n }) };
const skinOn = (on: boolean) => v3Skin.set((s) => ({ ...s, on }));

describe('cast portraits in a v3 lobby (castPortrait + its installed source)', () => {
  it('pending atlas: the silhouette only (no v2 flash), then the v3 strip', async () => {
    skinOn(true);
    setPortraitAlt(PENDING_PORTRAITS); // what v3skinLobby installs before the atlas chunk lands
    let release!: () => void;
    st.atlas = null;
    st.pending = new Promise<void>((r) => (release = r));
    const { canvas, drawn } = stubCanvas();
    const done = drawCastPortrait(canvas, 'frog', { size: 48 });
    await new Promise((r) => setTimeout(r, 20));
    expect(drawn.silhouettes).toBeGreaterThan(0);
    expect(drawn.images).toEqual([]); // nothing painted from any sheet while v3 is pending
    // the chunk lands: it installs the v3 strip, the atlas is loaded
    setPortraitAlt(v3Portraits);
    st.atlas = fakeAtlas;
    st.pending = null;
    release();
    expect(await done).toBe(true);
    expect(drawn.images).toEqual([V3_URL]);
  });

  it('draws the v3 strip for players, ghosts and memorials', async () => {
    for (const opts of [{}, { ghost: true as const }, { dead: true }]) {
      const { canvas, drawn } = stubCanvas();
      expect(await drawCastPortrait(canvas, 'frog', { size: 48, ...opts })).toBe(true);
      expect(drawn.images, JSON.stringify(opts)).toEqual([V3_URL]);
    }
  });

  it('keeps the v2 art for the documented skips (nicksong, brianbi)', async () => {
    expect(v3Portraits.req('nicksong', {})).toBeNull();
    expect(v3Portraits.req('brianbi', {})).toBeNull();
    const { canvas, drawn } = stubCanvas();
    await drawCastPortrait(canvas, 'nicksong', { size: 48 });
    expect(drawn.images.length).toBeGreaterThan(0);
    expect(drawn.images.every((u) => u !== V3_URL)).toBe(true);
  });

  it('v2 art returns when the skin turns off', async () => {
    skinOn(false);
    st.atlas = null; // v3AtlasNow() is null whenever the skin is off
    expect(v3Portraits.req('frog', {})).toBeNull();
    const { canvas, drawn } = stubCanvas();
    expect(await drawCastPortrait(canvas, 'frog', { size: 48 })).toBe(true);
    expect(drawn.images.length).toBeGreaterThan(0);
    expect(drawn.images.every((u) => u !== V3_URL)).toBe(true);
  });

  it('the pending source falls back to v2 art only if the atlas chunk never arrives', async () => {
    skinOn(true);
    setPortraitAlt(PENDING_PORTRAITS);
    st.atlas = null;
    st.pending = Promise.resolve(); // loadV3Atlas gave up (null): nothing is pending any more
    const { canvas, drawn } = stubCanvas();
    await drawCastPortrait(canvas, 'frog', { size: 48 });
    expect(drawn.silhouettes).toBeGreaterThan(0); // the silhouette came first
    expect(drawn.images.every((u) => u !== V3_URL)).toBe(true);
    st.pending = null;
    setPortraitAlt(v3Portraits);
  });
});

describe('social dock / pie art lookup (socialArtFor)', () => {
  const v2 = (n: string) => ({ url: 'v2.png', x: 0, y: 0, w: 4, h: 4, sheetW: 8, sheetH: 8, n });
  const names = ['emote_point', 'pin_red', 'icon_frog', 'nick_face', 'icon_nicksong', 'icon_brianbi'];
  it('v2 lobby: the v2 social sheet for everything', () => {
    const art = socialArtFor({ on: false, night: false }, fakeAtlas, v2);
    for (const n of names) expect(art(n)?.url, n).toBe('v2.png');
  });
  it('v3 lobby while the atlas loads: nothing (the emoji / dot fallbacks), v2 only for the skips', () => {
    const art = socialArtFor({ on: true, night: false }, null, v2);
    for (const n of names) expect(art(n)?.url ?? null, n).toBe(SKIPPED.includes(n) ? 'v2.png' : null);
  });
  it('v3 lobby: the v3 atlas (day / night), v2 only for the skips', () => {
    for (const night of [false, true]) {
      const art = socialArtFor({ on: true, night }, fakeAtlas, v2);
      for (const n of names) expect(art(n)?.url, n).toBe(SKIPPED.includes(n) ? 'v2.png' : night ? 'n.png' : 'd.png');
    }
  });
});
