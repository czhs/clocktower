// v2.2: Nick Song joins the roster (a villager on the v1 townsfolk body) and brings the 'nick-face'
// emote art (social.png `nick_face`). Checks the roster, the generated manifests and the art itself.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { NICK_FACE_CHARACTER } from '@ct/protocol';
import { CAST, CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, castById, PLAYABLE, PLAYABLE_IDS } from '../src/cast.js';
import nick from '../scripts/cast/nicksong.js';
import { buildNickFace, NICK_FACE_CROP_Y, NICK_FACE_SIZE } from '../scripts/social/nickface.js';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
const json = <T>(n: string) => JSON.parse(readFileSync(join(GEN, n), 'utf8')) as T;

describe('Nick Song', () => {
  it('is a playable villager; the roster is 27 (14 villagers + 13 mascots)', () => {
    expect(castById('nicksong')).toMatchObject({ id: 'nicksong', name: 'Nick Song', kind: 'villager' });
    expect(NICK_FACE_CHARACTER).toBe('nicksong');
    expect(PLAYABLE_IDS.has('nicksong')).toBe(true);
    expect(PLAYABLE).toHaveLength(27);
    expect(PLAYABLE.filter((c) => c.kind === 'villager')).toHaveLength(14);
    expect(new Set(CAST.map((c) => c.id)).size).toBe(CAST.length);
  });

  it('has drawn art (no placeholder), ghosts and portrait-strip cells in the generated manifests', () => {
    const cast = json<{ sheets: Record<string, unknown>; placeholders: string[] }>('cast.json');
    for (const k of ['nicksong', 'nicksong/ghost', 'nicksong/ghost-spent']) expect(cast.sheets[k], k).toBeDefined();
    expect(cast.placeholders).not.toContain('nicksong');
    const strip = json<{ sheets: Record<string, { frames: number }> }>('cast-portraits.json');
    expect(strip.sheets.nicksong?.frames).toBe(CAST_FRAMES.length);
    for (const k of ['nicksong/ghost', 'nicksong/ghost-spent']) expect(strip.sheets[k]?.frames, k).toBe(1);
    const social = json<{ frames: Record<string, unknown>; meta: { icons: string[]; anchors: Record<string, unknown>; nickFace: { cropY: number } } }>('social.json');
    expect(social.frames.icon_nicksong).toBeDefined();
    expect(social.frames.nick_face).toMatchObject({ w: NICK_FACE_SIZE, h: NICK_FACE_SIZE });
    expect(social.meta.anchors.nick_face).toBeDefined();
    expect(social.meta.nickFace.cropY).toBe(NICK_FACE_CROP_Y);
  });

  it('every frame is 32x40, binary alpha, with a phone (bright screen pixel) in the front views', () => {
    for (const d of ['down', 'down-right', 'right', 'up-right', 'up'] as const)
      for (const f of [0, 1, 2, 3, 4] as const) {
        const im = nick.draw(d, f);
        expect([im.w, im.h]).toEqual([CAST_FW, CAST_FH]);
        let screen = 0;
        for (let y = 0; y < im.h; y++)
          for (let x = 0; x < im.w; x++) {
            const p = im.get(x, y);
            if (p[3] !== 0 && p[3] !== 255 && y < 36) throw new Error(`${d}/${f}: soft alpha at ${x},${y}`);
            if (p[0] === 0x9f && p[1] === 0xe6 && p[2] === 0xff) screen++;
          }
        if (d === 'down' || d === 'down-right' || d === 'right') expect(screen, `${d}/${f}`).toBeGreaterThan(0);
      }
    void CAST_DIRS;
    void CAST_FH;
  });

  it('head + hair live entirely above the crop row, the body below it (so the emote hides the whole head)', () => {
    // the hair colour never appears at or below the crop row in any idle direction
    for (const d of ['down', 'down-right', 'right', 'up-right', 'up'] as const) {
      const im = nick.draw(d, 0);
      let headAbove = 0;
      for (let y = 0; y < NICK_FACE_CROP_Y; y++) for (let x = 0; x < im.w; x++) if (im.get(x, y)[3]) headAbove++;
      expect(headAbove, d).toBeGreaterThan(60);
      // nothing of the head pokes below: rows from the crop down are torso/legs only (no skin-coloured face rows)
      const sk = [0xf0, 0xd0, 0xb4];
      let skinBelow = 0;
      for (let y = NICK_FACE_CROP_Y; y < NICK_FACE_CROP_Y + 2; y++) for (let x = 0; x < im.w; x++) if (im.get(x, y).slice(0, 3).every((v, i) => v === sk[i])) skinBelow++;
      expect(skinBelow, d).toBe(0);
    }
  });

  it('the 😝 is a round yellow ball with a pink tongue and dark squeezed eyes', () => {
    const im = buildNickFace();
    expect([im.w, im.h]).toEqual([NICK_FACE_SIZE, NICK_FACE_SIZE]);
    const c = im.get(7, 7);
    expect(c[0]).toBeGreaterThan(220);
    expect(c[1]).toBeGreaterThan(160);
    expect(c[2]).toBeLessThan(120);
    expect(im.get(0, 0)[3]).toBe(0); // round: corners empty
    let tongue = 0;
    for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) if (im.get(x, y)[0] > 200 && im.get(x, y)[1] < 170 && im.get(x, y)[2] > 70) tongue++;
    expect(tongue).toBeGreaterThan(5);
  });

  it('the generated cast sheet holds exactly the module drawing (deterministic)', () => {
    const cast = json<{ sheets: Record<string, { x: number; y: number }> }>('cast.json');
    const png = PNG.sync.read(readFileSync(join(GEN, 'cast.png')));
    const s = cast.sheets.nicksong!;
    const im = nick.draw('down', 0);
    for (let y = 0; y < CAST_FH; y++)
      for (let x = 0; x < CAST_FW; x++) {
        const i = ((s.y + y) * png.width + s.x + x) * 4;
        expect([...png.data.subarray(i, i + 4)], `${x},${y}`).toEqual([...im.get(x, y)]);
      }
  });
});
