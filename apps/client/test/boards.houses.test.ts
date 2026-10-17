// OWNED BY world-art. v2.2: door-board character tokens (layout, overflow, ghost style, hit test)
// and house name callouts (owner mapping from public data only, name fitting, neighbour widths).
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import { homeBuilding } from '@ct/protocol';
import { BOARD_ART, boardNudge, boardSize, boardSourcePx, boardSpans, fitBoard, boardSummary, bustRect, hitToken, inDisc, overflowText, tokenGrid, tokenLabel, tokenStyle, tokenWorldSize, TOKEN_MAX, TOKEN_MIN } from '../src/game/gameplay/boardTokens';
import { fitName, houseOwners, labelFontCss, labelShift, labelStyle, maxLabelWidths } from '../src/game/gameplay/houseNames';

describe('board tokens', () => {
  it('token size: base size when zoomed in, larger (capped) on small zooms', () => {
    expect(tokenWorldSize(3.2)).toBe(TOKEN_MIN);
    expect(tokenWorldSize(1.8)).toBe(TOKEN_MIN);
    expect(tokenWorldSize(0.94)).toBeGreaterThan(TOKEN_MIN);
    expect(tokenWorldSize(0.94)).toBeLessThanOrEqual(TOKEN_MAX);
    expect(tokenWorldSize(0.1)).toBe(TOKEN_MAX);
    expect(tokenWorldSize(NaN)).toBeGreaterThanOrEqual(TOKEN_MIN);
    // on-screen size never below ~16 CSS px at phone zoom
    expect(tokenWorldSize(0.94) * 0.94).toBeGreaterThanOrEqual(16);
  });

  it('grid: 1-2 in a row, 3-4 in two rows, centred, never more than 4 slots', () => {
    const t = 11;
    const g1 = tokenGrid(1, t, 0);
    expect(g1.slots).toEqual([{ i: 0, dx: 0, dy: 0 }]);
    expect([g1.w, g1.h]).toEqual([t, t]);
    const g2 = tokenGrid(2, t, 0);
    expect(g2.slots.map((s) => s.dy)).toEqual([0, 0]);
    expect(g2.slots[0]!.dx).toBeCloseTo(-g2.slots[1]!.dx);
    const g3 = tokenGrid(3, t, 0);
    expect(g3.slots[2]!.dx).toBe(0); // the third is centred under the first two
    expect(g3.slots[2]!.dy).toBeGreaterThan(0);
    const g4 = tokenGrid(4, t, 0);
    expect(g4.w).toBe(g4.h);
    expect(new Set(g4.slots.map((s) => `${s.dx},${s.dy}`)).size).toBe(4); // no overlap
    for (const s of g4.slots) {
      expect(Math.abs(s.dx) + t / 2).toBeLessThanOrEqual(g4.w / 2 + 1e-9);
      expect(Math.abs(s.dy) + t / 2).toBeLessThanOrEqual(g4.h / 2 + 1e-9);
    }
    expect(tokenGrid(9, t, 5).slots).toHaveLength(4);
    expect(tokenGrid(0, t, 0)).toEqual({ slots: [], w: 0, h: 0, badge: null });
  });

  it('overflow: "+N" badge at the corner only when someone does not fit', () => {
    expect(tokenGrid(4, 11, 0).badge).toBeNull();
    const g = tokenGrid(4, 11, 3);
    expect(g.badge).toEqual({ dx: g.w / 2, dy: g.h / 2, text: '+3' });
    expect(overflowText(250)).toBe('+99');
  });

  it('ghost style: ghost sheet when the roster has one, pale tint + faded; living untinted', () => {
    const sheets = { frog: {}, 'frog/ghost': {}, owl: {} };
    expect(tokenStyle('frog', false, sheets)).toMatchObject({ sheet: 'frog', tint: 0xffffff, alpha: 1 });
    const g = tokenStyle('frog', true, sheets);
    expect(g.sheet).toBe('frog/ghost');
    expect(g.alpha).toBeLessThan(1);
    expect(g.tint).not.toBe(0xffffff);
    expect(tokenStyle('owl', true, sheets).sheet).toBe('owl'); // no ghost art: living sheet, still tinted
  });

  it('names only in the tooltip / summary text, ghosts marked', () => {
    expect(tokenLabel({ name: 'Ada', ghost: false })).toBe('Ada');
    expect(tokenLabel({ name: 'Ada', ghost: true })).toBe('Ada (ghost)');
    const tags = [
      { pid: 'a', name: 'Ada', ghost: false, preset: 'frog' },
      { pid: 'b', name: 'Bram', ghost: true, preset: 'owl' },
    ];
    expect(boardSummary({ tags, shown: tags, overflow: 0 })).toBe('Inside: Ada, Bram (ghost)');
    expect(boardSummary(undefined)).toBe('');
  });

  it('bust crop and pixel disc', () => {
    const r = bustRect({ x: 8, y: 6, w: 16, h: 32 });
    expect(r.w).toBe(r.h);
    expect(r.y).toBe(5);
    expect(inDisc(11, 11, 22)).toBe(true);
    expect(inDisc(0, 0, 22)).toBe(false);
    expect(inDisc(0, 11, 22)).toBe(true);
  });

  it('hit test picks the token under the point (topmost first)', () => {
    const rects = [
      { x: 0, y: 0, r: 5 },
      { x: 8, y: 0, r: 5 },
    ];
    expect(hitToken(rects, 0, 0)).toBe(0);
    expect(hitToken(rects, 4, 0)).toBe(1); // overlap: the later (drawn on top) wins
    expect(hitToken(rects, 0, 9)).toBe(-1);
  });
});

describe('house name callouts', () => {
  const players = [
    { pid: 'p0', seat: 0, name: 'Ada', alive: true },
    { pid: 'p1', seat: 1, name: 'Bram', alive: false },
  ];

  it('owners from the public player list via homeBuilding (dead = ghost colour)', () => {
    const o = houseOwners(L, players, null);
    expect(o[homeBuilding(L, 0)!.id]).toEqual({ pid: 'p0', name: 'Ada', ghost: false });
    expect(o[homeBuilding(L, 1)!.id]).toEqual({ pid: 'p1', name: 'Bram', ghost: true });
    expect(Object.keys(o)).toHaveLength(2);
  });

  it('without a game view: only seated lobby PLAYERS; the waiting room (no seats) has no labels', () => {
    const waiting = [
      { pid: 'p0', displayName: 'Ada', role: 'player', seat: null },
      { pid: 'st', displayName: 'Teller', role: 'storyteller', seat: null },
    ];
    expect(houseOwners(L, null, waiting)).toEqual({});
    const seated = [
      { pid: 'p0', displayName: 'Ada', role: 'player', seat: 2 },
      { pid: 'st', displayName: 'Teller', role: 'storyteller', seat: 3 }, // never a home owner
    ];
    const o = houseOwners(L, null, seated);
    expect(Object.values(o).map((x) => x.name)).toEqual(['Ada']);
    expect(o[homeBuilding(L, 2)!.id]?.pid).toBe('p0');
  });

  it('uses public fields only (extra hidden fields on the input never reach the output)', () => {
    const leaky = [{ pid: 'p0', seat: 0, name: 'Ada', alive: true, character: 'imp', alignment: 'evil', location: 'bld:house-4' }];
    const o = houseOwners(L, leaky, null);
    const json = JSON.stringify(o);
    for (const secret of ['imp', 'evil', 'bld:']) expect(json).not.toContain(secret);
  });

  it('fitName: whole name when it fits, else an ellipsis prefix that fits; long names capped', () => {
    const m = (s: string) => s.length * 5; // 5 px per char
    expect(fitName('Ada', 100, m)).toBe('Ada');
    const f = fitName('Bartholomew Longname', 50, m);
    expect(f.endsWith('…')).toBe(true);
    expect(m(f)).toBeLessThanOrEqual(50);
    expect(fitName('A'.repeat(40), 10_000, m)).toHaveLength(18);
    expect(fitName('  spaced   out  ', 1000, m)).toBe('spaced out');
    expect(fitName('', 100, m)).toBe('?');
    expect(fitName('Zed', 1, m)).toBe('Z…');
  });

  it('maxLabelWidths: about the house width, never past halfway to a neighbour on the same row', () => {
    const w = maxLabelWidths([
      { id: 'a', x: 100, y: 120, houseW: 80 },
      { id: 'b', x: 160, y: 122, houseW: 80 },
      { id: 'c', x: 160, y: 300, houseW: 40 },
    ]);
    expect(w.a).toBe(56);
    expect(w.b).toBe(56);
    expect(w.c).toBe(48);
    // labels centred on their anchors cannot overlap
    expect(100 + w.a! / 2).toBeLessThanOrEqual(160 - w.b! / 2);
  });

  it('every pair of real house doors gets non-overlapping label widths', () => {
    const houses = L.buildings.filter((b) => b.kind === 'house');
    const anchors = houses.map((b) => ({ id: b.id, x: (b.door.x + 0.5) * L.tileSize, y: b.door.y * L.tileSize, houseW: b.footprint.w * L.tileSize }));
    const w = maxLabelWidths(anchors);
    for (const a of anchors)
      for (const b of anchors) if (a !== b && Math.abs(a.y - b.y) <= 24) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(w[a.id]! / 2 + w[b.id]! / 2);
  });

  it('label style: own home gold, ghost pale, dimmer at night', () => {
    expect(labelStyle(true, false, false).color).not.toBe(labelStyle(false, false, false).color);
    expect(labelStyle(false, true, false).color).not.toBe(labelStyle(false, false, false).color);
    expect(labelStyle(false, false, true).alpha).toBeLessThan(labelStyle(false, false, false).alpha);
  });
});

describe('grown door board (tokens sit on its face)', () => {
  it('the face always holds the token grid (+ margins), at least the art size; the post foot is centred', () => {
    for (const n of [1, 2, 3, 4])
      for (const t of [11, 15, 20]) {
        const g = tokenGrid(n, t, n === 4 ? 2 : 0);
        const b = boardSize(g);
        expect(b.faceW).toBeGreaterThanOrEqual(g.w + 2);
        expect(b.faceH).toBeGreaterThanOrEqual(g.h + 3);
        expect(b.faceW).toBeGreaterThanOrEqual(BOARD_ART.face.w);
        expect(b.faceH).toBeGreaterThanOrEqual(BOARD_ART.face.h);
        expect(b.w).toBe(b.faceW + 8);
        expect(Math.abs(b.foot.x - b.w / 2)).toBeLessThanOrEqual(1);
        expect(b.h - b.foot.y).toBe(BOARD_ART.h - BOARD_ART.foot.y);
      }
    // an unscaled board maps 1:1 onto the art
    const same = boardSize({ w: 0, h: 0 });
    expect([same.w, same.h]).toEqual([BOARD_ART.w, BOARD_ART.h]);
    for (const [x, y] of [[0, 0], [3, 5], [10, 10], [21, 18], [11, 26]]) expect(boardSourcePx(x!, y!, same)).not.toBeNull();
  });

  it('grown pixels: frame columns kept, face filled with parchment rows, post copied unscaled', () => {
    const b = boardSize({ w: 30, h: 30 });
    expect(boardSourcePx(0, 10, b)).toEqual({ x: 0, y: BOARD_ART.face.y + 3 });
    expect(boardSourcePx(b.w - 1, 10, b)).toEqual({ x: BOARD_ART.w - 1, y: BOARD_ART.face.y + 3 });
    const mid = boardSourcePx(Math.floor(b.w / 2), b.face.y + 5, b)!;
    expect(mid.x).toBeGreaterThanOrEqual(BOARD_ART.face.x);
    expect(mid.x).toBeLessThan(BOARD_ART.face.x + BOARD_ART.face.w);
    expect(boardSourcePx(b.foot.x, b.foot.y, b)).toEqual(BOARD_ART.foot);
    expect(boardSourcePx(0, b.h - 1, b)).toBeNull(); // nothing beside the post
  });

  it('nudge: a grown board is pushed off the doorway on its own side, never toward it', () => {
    // door 258..270; board foot right of it at 282
    expect(boardNudge(282, 22, 11, 258, 270)).toBe(0);
    const n = boardNudge(282, 34, 17, 258, 270);
    expect(n).toBeGreaterThan(0);
    expect(282 + n - 17).toBeGreaterThanOrEqual(271);
    // board left of the door
    const m = boardNudge(150, 34, 17, 162, 174);
    expect(m).toBeLessThanOrEqual(0);
    expect(150 + m - 17 + 34).toBeLessThanOrEqual(161);
  });

  it('every real house: the grown board for 4 tokens (+N) at phone size stays off its doorway when level with it', async () => {
    const fx = (await import('@ct/assets/generated/square-props.json')).default as { meta: { houses: Record<string, { board?: { x: number; y: number }; boarded?: { wx: number; wy: number; w: number; h: number } }> } };
    const houses = Object.entries(fx.meta.houses);
    expect(houses.length).toBe(15);
    for (const t of [11, 20]) {
      const b = boardSize(tokenGrid(4, t, 3));
      for (const [, h] of houses) {
        if (!h.board || !h.boarded) continue;
        const d = h.boarded;
        const top = Math.round(h.board.y) - b.foot.y;
        const level = top < d.wy + d.h && h.board.y > d.wy;
        const nudge = level ? boardNudge(h.board.x, b.w, b.foot.x, d.wx, d.wx + d.w) : 0;
        const left = Math.round(h.board.x + nudge) - b.foot.x;
        if (level) expect(left >= d.wx + d.w || left + b.w <= d.wx).toBe(true);
      }
    }
  });
});

describe('house label size + board avoidance', () => {
  it('20 % larger at desktop full-town zoom, avatar-name size on phones', () => {
    expect(labelFontCss(1.9)).toBeCloseTo(12.6);
    expect(labelFontCss(3.2)).toBeCloseTo(12.6);
    expect(labelFontCss(0.95)).toBeCloseTo(10.5);
    expect(labelFontCss(1.4)).toBeGreaterThan(10.5);
    expect(labelFontCss(1.4)).toBeLessThan(12.6);
  });
  it('shifts sideways off the board when the tail stays under the label, else above it', () => {
    const box = { x: 100, y: 100, w: 40, h: 10 };
    expect(labelShift(box, null, 15)).toEqual({ dx: 0, dy: 0 });
    expect(labelShift(box, { x: 200, y: 90, w: 30, h: 40 }, 15)).toEqual({ dx: 0, dy: 0 });
    const s = labelShift(box, { x: 135, y: 105, w: 30, h: 40 }, 15); // board right, overlapping 5 px
    expect(s).toEqual({ dx: -6, dy: 0 });
    const u = labelShift(box, { x: 110, y: 105, w: 30, h: 40 }, 15); // too much overlap: go up
    expect(u.dx).toBe(0);
    expect(box.y + box.h + u.dy).toBeLessThanOrEqual(105 - 1);
  });
});

describe('board room per house (no covering doors or each other)', () => {
  it('every real house: grown boards (1-4 tokens, desktop and phone sizes) stay off every doorway and every other board', async () => {
    const fx = (await import('@ct/assets/generated/square-props.json')).default as { meta: { houses: Record<string, { board: { x: number; y: number }; boarded: { wx: number; wy: number; w: number; h: number } }> } };
    const H = fx.meta.houses;
    const spans = boardSpans(H);
    expect(Object.keys(spans)).toHaveLength(15);
    for (const want of [11, 15, 20])
      for (const n of [1, 2, 3, 4]) {
        const rects = Object.entries(H).map(([id, h]) => {
          const f = fitBoard(n, n === 4 ? 2 : 0, want, h.board.x, spans[id]);
          expect(f.t).toBeGreaterThanOrEqual(11); // still readable
          return { id, l: f.left, r: f.left + f.size.w - 1, top: Math.round(h.board.y) - f.size.foot.y, bot: Math.round(h.board.y) };
        });
        for (const a of rects) {
          for (const [id, h] of Object.entries(H)) {
            const d = h.boarded;
            const vert = a.top < d.wy + d.h && a.bot > d.wy;
            if (vert) expect(a.r < d.wx || a.l >= d.wx + d.w, `${a.id} board vs ${id} door`).toBe(true);
          }
          for (const b of rects) if (a !== b && a.top < b.bot && b.top < a.bot) expect(a.r < b.l || b.r < a.l, `${a.id} vs ${b.id}`).toBe(true);
        }
      }
  });
  it('fitBoard shrinks tokens only when the room is too narrow', () => {
    expect(fitBoard(4, 0, 20, 100, undefined).t).toBe(20);
    const f = fitBoard(4, 0, 20, 100, { lo: 80, hi: 120 });
    expect(f.t).toBeLessThan(20);
    expect(f.size.w).toBeLessThanOrEqual(41);
    expect(f.left).toBeGreaterThanOrEqual(80);
    expect(f.left + f.size.w - 1).toBeLessThanOrEqual(120);
  });
});
