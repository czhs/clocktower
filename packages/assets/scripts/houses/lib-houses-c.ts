// Shared helpers for houses-c (house-10..14). NOTE: buildings.ts imports the house registry, so
// nothing from ../buildings.js may be touched at module top level here (import cycle) — only
// inside functions.
import { cutDoor, doorAssembly, DSTONE, type BuildingSprite, type DoorKind, type DoorOut, type DoorSpec, type Tf } from '../buildings.js';
import { type Color, dpick, Img } from '../lib/img.js';

export type Pt = { x: number; y: number };

/** Oblique side wall: rises 1 px for every 2 px it recedes. */
export const rise = (k: number) => Math.floor((k + 1) / 2);

/** Ground line of a side wall that starts at x0 (sprite bottom row = H - 1). */
export const groundLine = (H: number, x0: number) => (x: number) => H - 1 - rise(x - x0);

/** Copy a local (upright) image onto an oblique side wall: column i lands at x0+i, row j at base(x)-lift-(h-1-j). */
export function shearPlace(dst: Img, local: Img, x0: number, base: (x: number) => number, lift: number) {
  for (let j = 0; j < local.h; j++)
    for (let i = 0; i < local.w; i++) {
      const c = local.get(i, j);
      if (c[3] === 0) continue;
      const x = x0 + i;
      dst.set(x, base(x) - lift - (local.h - 1 - j), c);
    }
}

/** Shear transform for door assemblies on a side wall. */
export const shearT =
  (x0: number, base: (x: number) => number, lift: number, h: number): Tf =>
  (i, j) => {
    const x = x0 + i;
    return [x, base(x) - lift - (h - 1 - j)];
  };

export interface SideDoorOpts {
  x0: number;
  base: (x: number) => number;
  lift?: number;
  w?: number;
  h?: number;
  arched?: boolean;
  kind?: DoorKind;
  paint: string;
  seed: number;
  jamb?: number;
  wreath?: boolean;
  /** Draw a pale stone step under the door. */
  step?: boolean;
}

/** Door in an oblique side wall (hinged on the far/right edge), with an optional stone step. */
export function sideDoor(img: Img, o: SideDoorOpts): { d: DoorOut; T: Tf; spec: DoorSpec } {
  const w = o.w ?? 8;
  const h = o.h ?? 20;
  const lift = o.lift ?? 4;
  const spec: DoorSpec = { w, h, arched: o.arched ?? true, kind: o.kind ?? 'planks', hinge: 'right', paint: o.paint, wreath: !!o.wreath, seed: o.seed };
  const T = shearT(o.x0, o.base, lift, h);
  const d = doorAssembly(img, T, spec, o.jamb ?? 1, o.seed);
  if (o.step !== false) {
    for (let i = -1; i <= w; i++) {
      const x = o.x0 + i;
      const y = o.base(x) - lift + 1;
      img.set(x, y, dpick(DSTONE, 0.9, x, y));
      for (let k = 1; k < lift; k++) img.set(x, y + k, dpick(DSTONE, k === 1 ? 0.62 : 0.3, x, y + k));
    }
  }
  return { d, T, spec };
}

/** Outline the sprite and cut the door leaf / doorway. */
export function finish(img: Img, d: DoorOut, windows: Pt[], chimney: Pt | null, hinge: 'left' | 'right' = 'right'): BuildingSprite {
  img.outline({ darken: 0.72 });
  const cut = cutDoor(img, d, hinge);
  return { img, windows, chimney, ...cut };
}

/** Round porthole / oculus window with a frame ring; returns its glow point. */
export function roundWindow(img: Img, cx: number, cy: number, r: number, frame: readonly Color[], glass: readonly Color[], cross = true): Pt {
  img.ellipse(cx, cy, r + 1.2, r + 1.2, (x, y, nx, ny) => dpick(frame, 0.75 - nx * 0.35 - ny * 0.35, x, y));
  img.ellipse(cx, cy, r, r, (x, y, nx, ny) => dpick(glass, 0.85 - ny * 0.3 - Math.abs(nx) * 0.15, x, y));
  if (cross && r >= 2.5) {
    img.vline(Math.floor(cx), Math.ceil(cy - r), Math.floor(cy + r - 0.5), frame[0]!);
    img.hline(Math.ceil(cx - r), Math.floor(cx + r - 0.5), Math.floor(cy), frame[0]!);
  }
  return { x: Math.floor(cx), y: Math.floor(cy) };
}

/** Lit glass rectangle (no frame) - for odd-shaped windows. */
export function glassRect(img: Img, x: number, y: number, w: number, h: number, glass: readonly Color[]) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, dpick(glass, 0.88 - j / (h * 1.7) - Math.abs(i + 0.5 - w / 2) / (w * 2.4), x + i, y + j));
}

/** Tiny hanging lantern (on a chain) with a warm pane, bottom at (x, y). Returns the glow point. */
export function hangLantern(img: Img, x: number, y: number, chain: number, iron: readonly Color[], glass: readonly Color[]): Pt {
  img.vline(x, y - 5 - chain, y - 6, iron[2]!);
  img.rect(x - 1, y - 6, 3, 1, iron[1]!);
  img.rect(x - 1, y - 5, 3, 3, glass[3]!);
  img.set(x, y - 4, glass[4]!);
  img.set(x + 1, y - 3, glass[2]!);
  img.rect(x - 1, y - 2, 3, 1, iron[1]!);
  img.set(x, y - 1, iron[1]!);
  return { x, y: y - 4 };
}

