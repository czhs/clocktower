// v3 perf (classic): view culling for the map's static sprites.
//
// Phaser 3 does not cull Images: every visible display-list entry is transformed and pushed into the
// sprite batch on every rendered frame, on screen or not. The v3 Hollowmere map is 2000 x 688 px with
// ~440 static props / buildings (v2: ~250 on 1712 x 592), while the camera shows a fraction of it
// (a portrait phone at zoom ~1 sees ~390 px of its width). The static sprites are bucketed into a
// coarse grid of world chunks; when the camera view (plus a margin) moves into other chunks, only the
// sprites of chunks that entered or left are re-tested, and an off-screen sprite is hidden (so the
// renderer skips it at willRender). Nothing on screen changes: a sprite is hidden only when its whole
// box is outside the view grown by `margin` px.

export interface Cullable {
  visible: boolean;
  setVisible(v: boolean): unknown;
}

interface Item {
  o: Cullable;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class StaticCuller {
  private items: Item[] = [];
  private chunks = new Map<number, Item[]>();
  private cx0 = 1;
  private cy0 = 1;
  private cx1 = 0;
  private cy1 = 0;
  private vx0 = 0;
  private vy0 = 0;
  private vx1 = 0;
  private vy1 = 0;
  private dirty = true;
  constructor(
    private readonly chunk = 256,
    private readonly margin = 64,
  ) {}

  get size(): number {
    return this.items.length;
  }

  /** Register a static sprite with its world box (it must not move or be shown / hidden by anyone else). */
  add(o: Cullable, x: number, y: number, w: number, h: number): void {
    const it: Item = { o, x0: x, y0: y, x1: x + w, y1: y + h };
    this.items.push(it);
    const c = this.chunk;
    for (let cy = Math.floor(it.y0 / c); cy <= Math.floor(it.y1 / c); cy++)
      for (let cx = Math.floor(it.x0 / c); cx <= Math.floor(it.x1 / c); cx++) {
        const k = key(cx, cy);
        const list = this.chunks.get(k);
        if (list) list.push(it);
        else this.chunks.set(k, [it]);
      }
    this.dirty = true;
  }

  /** Camera view in world px (x, y, width, height). Cheap when the view stays inside the same chunks. */
  update(x: number, y: number, w: number, h: number): void {
    const m = this.margin;
    this.vx0 = x - m;
    this.vy0 = y - m;
    this.vx1 = x + w + m;
    this.vy1 = y + h + m;
    const c = this.chunk;
    const cx0 = Math.floor(this.vx0 / c);
    const cy0 = Math.floor(this.vy0 / c);
    const cx1 = Math.floor(this.vx1 / c);
    const cy1 = Math.floor(this.vy1 / c);
    if (this.dirty) {
      this.dirty = false;
      this.cx0 = cx0;
      this.cy0 = cy0;
      this.cx1 = cx1;
      this.cy1 = cy1;
      for (const it of this.items) this.test(it);
      return;
    }
    // Inside the same chunk rectangle, only the sprites of its border chunks can change state.
    const same = cx0 === this.cx0 && cy0 === this.cy0 && cx1 === this.cx1 && cy1 === this.cy1;
    const ox0 = this.cx0;
    const oy0 = this.cy0;
    const ox1 = this.cx1;
    const oy1 = this.cy1;
    this.cx0 = cx0;
    this.cy0 = cy0;
    this.cx1 = cx1;
    this.cy1 = cy1;
    const lo = (a: number, b: number) => Math.min(a, b);
    const hi = (a: number, b: number) => Math.max(a, b);
    for (let cy = lo(cy0, oy0); cy <= hi(cy1, oy1); cy++)
      for (let cx = lo(cx0, ox0); cx <= hi(cx1, ox1); cx++) {
        const inNew = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
        const inOld = cx >= ox0 && cx <= ox1 && cy >= oy0 && cy <= oy1;
        if (!inNew && !inOld) continue;
        const border = cx === cx0 || cx === cx1 || cy === cy0 || cy === cy1;
        // interior chunks of an unchanged rectangle are wholly inside the view: nothing to do
        if (same && !border) continue;
        const list = this.chunks.get(key(cx, cy));
        if (list) for (const it of list) this.test(it);
      }
  }

  /** Show everything again (e.g. before a context restore re-bake or a teardown). */
  showAll(): void {
    for (const it of this.items) if (!it.o.visible) it.o.setVisible(true);
    this.dirty = true;
  }

  private test(it: Item) {
    const v = it.x1 >= this.vx0 && it.x0 <= this.vx1 && it.y1 >= this.vy0 && it.y0 <= this.vy1;
    if (v !== it.o.visible) it.o.setVisible(v);
  }
}

const key = (cx: number, cy: number) => (cy + 512) * 4096 + (cx + 2048);
