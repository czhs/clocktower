// OWNED BY world-art. v2.2 walkable interiors: client helpers (tap targets, walking out, routes).
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import { isBlockedPx, locationAt, tileCenterPx } from '@ct/protocol';
import { EXIT_HOLD_MS, ExitGate, insideReserveCss, interiorRoute, interiorTapTarget, pushesOut, roomArea } from '../src/game/interior';

const houses = L.buildings.filter((b) => b.kind === 'house');
const TS = L.tileSize;

describe('interior helpers', () => {
  it('pushing DOWN on the door spot walks out; sideways, up or elsewhere in the room does not', () => {
    for (const b of houses) {
      const door = tileCenterPx(L, b.interiorDoor);
      expect(pushesOut(L, b, door, 0, 1)).toBe(true);
      expect(pushesOut(L, b, door, 0.5, 1)).toBe(true);
      expect(pushesOut(L, b, door, 1, 0)).toBe(false);
      expect(pushesOut(L, b, door, 0, -1)).toBe(false);
      expect(pushesOut(L, b, door, 0, 0)).toBe(false);
      expect(pushesOut(L, b, tileCenterPx(L, b.bed!), 0, 1)).toBe(false);
    }
  });

  it('a tap on the doorway = walk to the door spot and out; on the floor = a walkable spot with a route; outside the room = nothing', () => {
    for (const b of houses) {
      const door = tileCenterPx(L, b.interiorDoor);
      const dw = { x: (b.interiorDoor.x + 0.5) * TS, y: (b.interiorDoor.y + 1.5) * TS };
      expect(interiorTapTarget(L, b, dw.x, dw.y)).toEqual({ ...door, exit: true });
      // every floor tile (furniture included: nearest free spot) gives a reachable, walkable target in this room
      const r = b.interior;
      for (let ty = r.y + 2; ty < r.y + r.h - 1; ty++)
        for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
          const t = interiorTapTarget(L, b, (tx + 0.5) * TS, (ty + 0.3) * TS);
          expect(t, `${b.id} ${tx},${ty}`).not.toBeNull();
          expect(isBlockedPx(L, t!.x, t!.y)).toBe(false);
          expect(locationAt(L, t!.x, t!.y)).toBe(`bld:${b.id}`);
        }
      const bed = tileCenterPx(L, b.bed!);
      expect(interiorRoute(L, b, door, bed)).not.toBeNull();
      const a = roomArea(L, b);
      expect(interiorTapTarget(L, b, a.x - 4, a.y + 10)).toBeNull();
    }
  });

  it('the exit gate needs a held push, then tries once, retries slowly while held, and starts over after a release', () => {
    const g = new ExitGate();
    expect(g.try(0)).toBe(false);
    expect(g.try(EXIT_HOLD_MS - 1)).toBe(false);
    expect(g.try(EXIT_HOLD_MS)).toBe(true);
    expect(g.try(EXIT_HOLD_MS + 100)).toBe(false);
    expect(g.try(EXIT_HOLD_MS + 1300)).toBe(true);
    g.reset();
    expect(g.try(5000)).toBe(false); // a brush right after a release does not leave
    expect(g.try(5000 + EXIT_HOLD_MS)).toBe(true);
  });

  it('reserves more room under the camera on touch (panel beside the joystick)', () => {
    expect(insideReserveCss(800, true)).toBeGreaterThan(insideReserveCss(800, false));
    expect(insideReserveCss(400, false)).toBeLessThan(insideReserveCss(800, false));
  });
});
