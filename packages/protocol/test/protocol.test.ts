import { describe, expect, it } from 'vitest';
import {
  C2S,
  CHARACTER_IDS,
  CreateLobbyRequest,
  DisplayName,
  LobbyName,
  StCommand,
  cleanText,
  inSquare,
  isBlockedPx,
  locationAt,
  type TownLayout,
} from '../src/index.js';

describe('text cleaning', () => {
  it('strips control, bidi and zero-width characters and collapses whitespace', () => {
    expect(cleanText('  a‮b​c\n\td  ')).toBe('a b c d');
    expect(cleanText('x y')).toBe('x y');
  });
  it('enforces display name / lobby name limits after cleaning', () => {
    expect(DisplayName.safeParse('​​').success).toBe(false);
    expect(DisplayName.safeParse('a'.repeat(25)).success).toBe(false);
    expect(DisplayName.parse('  Elder   Rowan ')).toBe('Elder Rowan');
    expect(LobbyName.safeParse('ab').success).toBe(false);
  });
  it('keeps HTML-looking names as plain text (UI escapes on render)', () => {
    expect(DisplayName.parse('<img src=x>')).toBe('<img src=x>');
  });
});

describe('lobby schemas', () => {
  it('bounds maxPlayers to 5..15 and has no password field', () => {
    expect(CreateLobbyRequest.safeParse({ name: 'Ravens', maxPlayers: 4 }).success).toBe(false);
    expect(CreateLobbyRequest.safeParse({ name: 'Ravens', maxPlayers: 16 }).success).toBe(false);
    const ok = CreateLobbyRequest.parse({ name: 'Ravens', maxPlayers: 15, password: 'x' });
    expect(ok).toEqual({ name: 'Ravens', description: '', maxPlayers: 15, script: 'trouble-brewing', takeStoryteller: false });
  });
});

describe('message map', () => {
  it('has 22 Trouble Brewing characters', () => {
    expect(CHARACTER_IDS).toHaveLength(22);
    expect(new Set(CHARACTER_IDS).size).toBe(22);
  });
  it('validates storyteller commands strictly', () => {
    expect(StCommand.safeParse({ type: 'kill', seat: 3, announce: true }).success).toBe(true);
    expect(StCommand.safeParse({ type: 'kill', seat: 15, announce: true }).success).toBe(false);
    expect(StCommand.safeParse({ type: 'reveal_grimoire' }).success).toBe(false);
  });
  it('rejects non-finite movement', () => {
    expect(C2S.move.safeParse({ seq: 1, x: Infinity, y: 0, facing: 'up', moving: true }).success).toBe(false);
    expect(C2S.move.safeParse({ seq: 1, x: 10, y: 10, facing: 'up', moving: true }).success).toBe(true);
  });
});

describe('layout helpers', () => {
  const W = 10;
  const H = 10;
  const collision = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) collision[x] = 1; // top wall
  const layout: TownLayout = {
    version: 1,
    widthTiles: W,
    heightTiles: H,
    tileSize: 16,
    townBounds: { x: 0, y: 0, w: 6, h: 10 },
    square: { cx: 48, cy: 80, r: 20 },
    buildings: [
      {
        id: 'house-0',
        kind: 'house',
        name: 'Cottage',
        houseIndex: 0,
        footprint: { x: 1, y: 2, w: 2, h: 2 },
        door: { x: 2, y: 4 },
        interior: { x: 7, y: 2, w: 3, h: 3 },
        interiorDoor: { x: 8, y: 4 },
      },
    ],
    collision,
    playerSpawn: { x: 3, y: 6 },
    storytellerSpawn: { x: 3, y: 7 },
    streetlights: [],
  };
  it('detects collisions with the body box', () => {
    expect(isBlockedPx(layout, 40, 20)).toBe(true); // body box (y 14..19) overlaps wall row 0
    expect(isBlockedPx(layout, 40, 23)).toBe(false); // body box (y 17..22) is clear
    expect(isBlockedPx(layout, 40, 40)).toBe(false);
    expect(isBlockedPx(layout, -1, 40)).toBe(true);
  });
  it('maps interiors and the square', () => {
    expect(locationAt(layout, 8 * 16 + 4, 3 * 16 + 4)).toBe('bld:house-0');
    expect(locationAt(layout, 20, 100)).toBe('outdoors');
    expect(inSquare(layout, 50, 85)).toBe(true);
    expect(inSquare(layout, 10, 10)).toBe(false);
  });
});
