import type { BuildingDef, TileRect, TownLayout } from '@ct/protocol';

// STUB LAYOUT (lead, M0) — a procedurally placed but contract-complete town so the server,
// voice and client can integrate immediately. world-art replaces this with the handcrafted
// town (same TownLayout contract; keep building ids 'house-0'..'house-14', 'tavern', 'chapel').

const TOWN_W = 96;
const TOWN_H = 96;
const INTERIOR_X = 100; // interior area starts here (outside townBounds)
const ROOM_W = 10;
const ROOM_H = 8;
const W = INTERIOR_X + 4 * (ROOM_W + 2) + 2;
const H = TOWN_H;
const TS = 16;

function buildStub(): TownLayout {
  const collision = new Array<number>(W * H).fill(1);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) collision[y * W + x] = v;
  };
  const fill = (r: TileRect, v: number) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, v);
  };
  // Open town with a 1-tile wall border.
  fill({ x: 1, y: 1, w: TOWN_W - 2, h: TOWN_H - 2 }, 0);

  const buildings: BuildingDef[] = [];
  let roomIdx = 0;
  const addBuilding = (id: string, kind: BuildingDef['kind'], name: string, houseIndex: number | null, fp: TileRect) => {
    fill(fp, 1);
    const door = { x: fp.x + Math.floor(fp.w / 2), y: fp.y + fp.h };
    const col = roomIdx % 4;
    const row = Math.floor(roomIdx / 4);
    roomIdx++;
    const interior = { x: INTERIOR_X + col * (ROOM_W + 2) + 1, y: 2 + row * (ROOM_H + 2), w: ROOM_W, h: ROOM_H };
    fill(interior, 0);
    const interiorDoor = { x: interior.x + Math.floor(ROOM_W / 2), y: interior.y + ROOM_H - 1 };
    buildings.push({
      id,
      kind,
      name,
      houseIndex,
      footprint: fp,
      door,
      interior,
      interiorDoor,
      ...(kind === 'house'
        ? { bed: { x: interior.x + 2, y: interior.y + 2 }, visitPoint: { x: interior.x + 4, y: interior.y + 3 } }
        : {}),
    });
  };

  // 15 cottages on a ring around the square.
  const cx = 48;
  const cy = 48;
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 - Math.PI / 2;
    const hx = Math.round(cx + Math.cos(a) * 34) - 3;
    const hy = Math.round(cy + Math.sin(a) * 34) - 3;
    addBuilding(`house-${i}`, 'house', `Cottage ${i + 1}`, i, { x: hx, y: hy, w: 6, h: 4 });
  }
  addBuilding('tavern', 'tavern', 'The Lantern Tavern', null, { x: 20, y: 30, w: 8, h: 5 });
  addBuilding('chapel', 'chapel', 'Chapel', null, { x: 68, y: 30, w: 8, h: 5 });
  // Clock tower in the middle of the square (solid, no interior door used in stub).
  fill({ x: cx - 2, y: cy - 2, w: 4, h: 4 }, 1);

  return {
    version: 0,
    widthTiles: W,
    heightTiles: H,
    tileSize: TS,
    townBounds: { x: 0, y: 0, w: TOWN_W, h: TOWN_H },
    square: { cx: cx * TS, cy: cy * TS, r: 12 * TS },
    buildings,
    collision,
    playerSpawn: { x: cx, y: cy + 6 },
    storytellerSpawn: { x: cx, y: cy - 6 },
    streetlights: [],
  };
}

export const townLayout: TownLayout = buildStub();
