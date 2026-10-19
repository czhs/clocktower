// v3 WP4: the real overlay atlas loader (overlay/atlas.ts) over a fake fetch / Image / canvas: frames are null
// until both the sheet JSON and its PNG decoded, url() crops a frame once into a data: URL (cached), and a later
// decode (notify) drops the frame cache so the next url() crops again from the newest art.
import { afterAll, describe, expect, it, vi } from 'vitest';

const FRAMES = { bubble_nine: { x: 49, y: 33, w: 12, h: 13 }, bubble_tail: { x: 62, y: 33, w: 7, h: 5 } };

/** Fake images by src; onload is fired by the test. */
const images: FakeImage[] = [];
class FakeImage {
  decoding = '';
  onload: (() => void) | null = null;
  src = '';
  constructor() {
    images.push(this);
  }
}
const draws: unknown[][] = [];
let exports = 0;
const fakeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({ clearRect: () => undefined, drawImage: (...a: unknown[]) => void draws.push(a) }),
  toDataURL: () => `data:image/png;base64,CROP${++exports}`,
});
vi.stubGlobal('Image', FakeImage);
vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? fakeCanvas() : {}) });
vi.stubGlobal(
  'fetch',
  vi.fn(async (u: string) => ({ ok: true, json: async () => (String(u).includes('kit') ? { meta: {} } : { frames: FRAMES, meta: {} }) })),
);
afterAll(() => vi.unstubAllGlobals());

const { createAtlas } = await import('../../src/game3d/overlay/atlas');
const settle = () => new Promise((r) => setTimeout(r, 0));
const decode = (sheetPng: RegExp) => {
  const img = images.find((i) => sheetPng.test(i.src));
  expect(img, String(sheetPng)).toBeTruthy();
  img!.onload?.();
  return img!;
};

describe('overlay atlas: url() crops', () => {
  it('null before decode; one crop per frame (cached); re-crop after a later decode', async () => {
    const atlas = createAtlas();
    let changes = 0;
    atlas.onChange(() => void changes++);
    expect(atlas.url('indicators', 'bubble_nine')).toBeNull(); // nothing fetched yet
    await settle(); // JSONs arrive, no PNG decoded yet
    expect(atlas.url('indicators', 'bubble_nine')).toBeNull();
    const day = decode(/indicators\.png/);
    expect(changes).toBeGreaterThan(0);
    const u = atlas.url('indicators', 'bubble_nine');
    expect(u).toBe('data:image/png;base64,CROP1');
    // cropped from the frame rect of the decoded sheet image, at 1:1
    expect(draws.at(-1)).toEqual([day, 49, 33, 12, 13, 0, 0, 12, 13]);
    expect(atlas.url('indicators', 'bubble_nine')).toBe(u); // cached: no second export
    expect(exports).toBe(1);
    expect(atlas.url('indicators', 'nope')).toBeNull();
    // night before its own sheet decoded: the day frame (and its crop) stands in
    expect(atlas.url('indicators', 'bubble_nine', true)).toBe('data:image/png;base64,CROP2');
    // the night sheet decodes: caches drop, the night art is cropped from the night image
    const night = decode(/indicators-night\.png/);
    const n = atlas.url('indicators', 'bubble_nine', true);
    expect(n).toBe('data:image/png;base64,CROP3');
    expect(draws.at(-1)![0]).toBe(night);
    // and the day frame is re-cropped once (new Frame object after the notify), then cached again
    atlas.url('indicators', 'bubble_nine');
    atlas.url('indicators', 'bubble_nine');
    expect(exports).toBe(4);
    atlas.destroy();
    expect(atlas.url('indicators', 'bubble_nine')).toBeNull();
  });
});
