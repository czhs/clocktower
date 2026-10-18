// OWNED BY v3-world (WP5b, acting for world-art). Door boards of Classic 2D in a v3 world: TownScene hands the
// v3 per-house anchors (generated/square-props-v3.json) to the board-token layer, whose slots (boardSpans) must
// then come from the v3 neighbours, not the v2 town's.
import { describe, expect, it } from 'vitest';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import fxV2 from '@ct/assets/generated/square-props.json';
import fxV3 from '@ct/assets/generated/square-props-v3.json';
import { boardSpans, fitBoard, tokenWorldSize } from '../src/game/gameplay/boardTokens';

type HouseFx = { board?: { x: number; y: number }; boarded?: { wx: number; wy: number; w: number; h: number } };
const v2 = (fxV2 as unknown as { meta: { houses: Record<string, HouseFx> } }).meta.houses;
const v3 = (fxV3 as unknown as { meta: { houses: Record<string, HouseFx> } }).meta.houses;

describe('v3 door boards', () => {
  it('every v3 cottage has a board anchor and its post foot lies inside its own slot', () => {
    const spans = boardSpans(v3);
    for (const b of townLayoutV3.buildings) {
      const h = v3[b.id];
      expect(h?.board, b.id).toBeDefined();
      const s = spans[b.id]!;
      expect(s.lo, b.id).toBeLessThanOrEqual(h!.board!.x);
      expect(s.hi, b.id).toBeGreaterThanOrEqual(h!.board!.x);
    }
  });

  it('the slots differ from the v2 slots wherever a house moved (they are per world)', () => {
    const s2 = boardSpans(v2);
    const s3 = boardSpans(v3);
    const moved = townLayoutV3.buildings.filter((b) => v2[b.id]!.board!.x !== v3[b.id]!.board!.x);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.some((b) => JSON.stringify(s2[b.id]) !== JSON.stringify(s3[b.id]))).toBe(true);
  });

  it('a full board (4 tokens) fits its v3 slot at the phone and desktop zooms', () => {
    const spans = boardSpans(v3);
    for (const b of townLayoutV3.buildings)
      for (const zoom of [0.94, 1.8]) {
        const span = spans[b.id]!;
        const fit = fitBoard(4, 0, tokenWorldSize(zoom), v3[b.id]!.board!.x, span);
        expect(fit.size.w, `${b.id} @${zoom}`).toBeLessThanOrEqual(span.hi - span.lo + 1);
        expect(fit.left, `${b.id} @${zoom}`).toBeGreaterThanOrEqual(span.lo);
      }
  });
});
