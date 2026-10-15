// Square props + ambient FX sheet (generated/square-props.png + .json), v1 procedural pixel art.
//
// Manifest contract (consumed by the client):
//   { image: 'square-props.png',
//     frames: { <name>: {x,y,w,h} },
//     meta: { boardParchment: {x,y,w,h}   (relative to the `board` frame)
//             fps: { <anim>: n },
//             anchors: { <name>: {x,y} }  (pixel in the frame that sits on the placement point;
//                                          keyed by frame name or animation prefix)
//             houses: { <buildingId>: HouseMeta }  (exact per-cottage overlays + suggested points)
//             place: { <name>: string } }  (placement notes)
//
// Partial alpha only in glow_*, lamp_glow_*, smoke_*, poof_*, doorglow; everything else is binary
// alpha with the v1 1 px dark outline (tiny lights - firefly/ember/sparkle - and the flat door /
// window overlays have no outline).
import { townLayout } from '../../src/layout.js';
import { Img } from '../lib/img.js';
import { cats, pigeons } from './critters.js';
import { text } from './font.js';
import { drawBuildings, houseOverlays, type HouseMeta } from './houses.js';
import { doorglow, ember, firefly, glow, poof, smoke, sparkle } from './particles.js';
import { board, BOARD_PARCHMENT, boarded, boardPin, brazier, lampGlow, shutters } from './props.js';

type Rect = { x: number; y: number; w: number; h: number };

export function drawAll(): { frames: [string, Img][]; houses: Record<string, HouseMeta> } {
  const out: [string, Img][] = [];
  const add = (n: string, i: Img) => out.push([n, i]);
  add('board', board());
  add('board_pin', boardPin());
  add('boarded', boarded());
  add('shutters', shutters());
  for (let f = 0; f < 4; f++) add(`brazier_${f}`, brazier(f));
  for (let f = 0; f < 3; f++) add(`lamp_glow_${f}`, lampGlow(f));
  for (const [n, i] of cats()) add(n, i);
  for (const [n, i] of pigeons()) add(n, i);
  for (let f = 0; f < 6; f++) add(`poof_${f}`, poof(f));
  for (let f = 0; f < 5; f++) add(`smoke_${f}`, smoke(f));
  for (let f = 0; f < 4; f++) add(`firefly_${f}`, firefly(f));
  for (let f = 0; f < 4; f++) add(`ember_${f}`, ember(f));
  for (let f = 0; f < 4; f++) add(`sparkle_${f}`, sparkle(f));
  add('glow_warm', glow('warm'));
  add('glow_cool', glow('cool'));
  add('doorglow', doorglow());
  const h = houseOverlays();
  out.push(...h.frames);
  return { frames: out, houses: h.houses };
}

/** Simple shelf packer (insertion order, 1 px gutter). */
function pack(frames: [string, Img][], width: number): { img: Img; rects: Map<string, Rect> } {
  const PAD = 1;
  const rects = new Map<string, Rect>();
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const [n, i] of frames) {
    if (x + i.w + PAD > width) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    rects.set(n, { x, y, w: i.w, h: i.h });
    x += i.w + PAD;
    rowH = Math.max(rowH, i.h);
  }
  const img = new Img(width, y + rowH + PAD);
  for (const [n, i] of frames) {
    const r = rects.get(n)!;
    img.copy(i, r.x, r.y);
  }
  return { img, rects };
}

// ---------------------------------------------------------------------------------------
// Review

function scaled(src: Img, s: number): Img {
  const o = new Img(src.w * s, src.h * s);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / s), Math.floor(y / s)));
  return o;
}

/** Additive blit (how the client draws glows). */
function addBlit(dst: Img, src: Img, dx: number, dy: number) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3] === 0 || !dst.inb(dx + x, dy + y)) continue;
      const d = dst.get(dx + x, dy + y);
      const a = c[3] / 255;
      dst.set(dx + x, dy + y, [Math.min(255, d[0] + c[0] * a), Math.min(255, d[1] + c[1] * a), Math.min(255, d[2] + c[2] * a), d[3]]);
    }
}

function sheetPanel(frames: [string, Img][], bg: string, fg: string, W: number): Img {
  const S = 4;
  const cells: { n: string; i: Img; x: number; y: number }[] = [];
  let x = 12;
  let y = 12;
  let rowH = 0;
  for (const [n, i] of frames) {
    const cw = Math.max(i.w * S, n.length * 8) + 12;
    const ch = i.h * S + 18;
    if (x + cw > W) {
      x = 12;
      y += rowH;
      rowH = 0;
    }
    cells.push({ n, i, x, y });
    x += cw;
    rowH = Math.max(rowH, ch);
  }
  const img = new Img(W, y + rowH + 8);
  img.rect(0, 0, W, img.h, bg);
  for (const c of cells) {
    img.blit(scaled(c.i, S), c.x, c.y);
    text(img, c.x, c.y + c.i.h * S + 4, c.n, fg, 2);
  }
  return img;
}

function cobbles(img: Img) {
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const c = (Math.floor(x / 8) + Math.floor(y / 6)) % 2 ? '#3c3646' : '#433d4e';
      img.set(x, y, (x % 8 === 0 || y % 6 === 0) && (x + y) % 3 ? '#332d3c' : c);
    }
}

/**
 * Every cottage as the client would show it at night: even houses lived-in (doorglow, name board,
 * chimney smoke), odd houses empty (boarded_<id> + unlit_<id>). All placed from meta.houses.
 */
function townPanel(get: (n: string) => Img, houses: Record<string, HouseMeta>): Img {
  const sprites = drawBuildings();
  const CW = 112;
  const CH = 140;
  const COLS = 5;
  const list = townLayout.buildings.filter((b) => houses[b.id]);
  const img = new Img(CW * COLS, CH * Math.ceil(list.length / COLS) + 60);
  cobbles(img);
  list.forEach((b, n) => {
    const s = sprites.get(b.id)!;
    const meta = houses[b.id]!;
    const left = b.footprint.x * 16;
    const top = (b.footprint.y + b.footprint.h) * 16 - s.img.h;
    const ox = (n % COLS) * CW + Math.floor((CW - s.img.w) / 2);
    const oy = Math.floor(n / COLS) * CH + (CH - 30 - s.img.h);
    const W = (wx: number, wy: number): [number, number] => [ox + wx - left, oy + wy - top];
    img.blit(s.img, ox, oy);
    const lived = n % 2 === 0;
    if (lived) {
      if (meta.doorglow) {
        const [x, y] = W(meta.doorglow.x, meta.doorglow.y);
        addBlit(img, get('doorglow'), x - 20, y);
      }
      if (meta.smoke) {
        const [x, y] = W(meta.smoke.x, meta.smoke.y);
        img.blit(get('smoke_0'), x - 5, y - 9);
        img.blit(get('smoke_2'), x - 4, y - 17);
        img.blit(get('smoke_4'), x - 2, y - 26);
      }
      if (meta.board) {
        const [x, y] = W(meta.board.x, meta.board.y);
        img.blit(get('board'), x - 11, y - 26);
        text(img, x - 11 + BOARD_PARCHMENT.x + 1, y - 26 + BOARD_PARCHMENT.y + 2, ['ada', 'bo', 'cy', 'dee', 'eli', 'fay', 'gus', 'hal'][n >> 1]!, '#3a2418');
      }
    } else {
      for (const p of [meta.boarded, meta.unlit]) if (p) img.blit(get(p.frame), ...W(p.wx, p.wy));
    }
    text(img, (n % COLS) * CW + 4, Math.floor(n / COLS) * CH + CH - 10, `${b.id} ${lived ? 'lived' : 'empty'}`, '#c8c0d8');
  });
  // a little life on the cobbles: brazier with halo, cat, pigeons, a teleport sequence
  const gy = img.h - 14;
  img.blit(get('brazier_1'), 30 - 8, gy - 22);
  addBlit(img, get('lamp_glow_0'), 30 - 12, gy - 30);
  img.blit(get('cat_right_1'), 70, gy - 15);
  img.blit(get('cat_sleep'), 100, gy - 15);
  img.blit(get('pigeon_0'), 140, gy - 7);
  img.blit(get('pigeon_2'), 152, gy - 7);
  for (let f = 0; f < 6; f++) img.blit(get(`poof_${f}`), 200 + f * 36 - 16, gy - 38);
  img.blit(get('sparkle_2'), 440, gy - 10);
  img.blit(get('firefly_2'), 470, gy - 20);
  img.blit(get('ember_0'), 36, gy - 30);
  return img;
}

export function buildFx(): { img: Img; manifest: unknown; review: Img } {
  const { frames, houses } = drawAll();
  const { img, rects } = pack(frames, 256);
  const fobj: Record<string, Rect> = {};
  for (const [n] of frames) fobj[n] = rects.get(n)!;
  const manifest = {
    image: 'square-props.png',
    frames: fobj,
    meta: {
      boardParchment: BOARD_PARCHMENT,
      fps: { poof: 14, brazier: 8, lamp_glow: 5, smoke: 6, firefly: 4, ember: 10, sparkle: 8, cat: 6, pigeon: 4, pigeon_fly: 10 },
      anchors: {
        board: { x: 11, y: 26 },
        board_pin: { x: 2, y: 4 },
        boarded: { x: 6, y: 20 },
        shutters: { x: 6, y: 6 },
        brazier: { x: 8, y: 22 },
        lamp_glow: { x: 12, y: 12 },
        cat: { x: 8, y: 15 },
        pigeon: { x: 4, y: 7 },
        pigeon_fly: { x: 4, y: 7 },
        poof: { x: 16, y: 38 },
        smoke: { x: 5, y: 9 },
        firefly: { x: 2, y: 2 },
        ember: { x: 1, y: 2 },
        sparkle: { x: 3, y: 4 },
        glow_warm: { x: 16, y: 16 },
        glow_cool: { x: 16, y: 16 },
        doorglow: { x: 20, y: 0 },
      },
      houses,
      place: {
        houses:
          "per cottage id: boarded/unlit = exact overlays {frame, x,y,w,h (sprite coords), wx,wy (world top-left)}; draw both over an EMPTY cottage (unlit darkens every pane + the door lamp; also skip that cottage's facade window lights). doorglow/smoke/board = world points for those anchors.",
        boarded: 'generic 12x20 arched front door; anchor -> bottom-centre of the door leaf. Prefer houses[id].boarded (exact, incl. sheared side doors).',
        shutters: 'generic closed shutters for a 10x10 front window (12x12 incl. frame); anchor -> the window glow point. houses[id].unlit covers every window exactly.',
        doorglow: 'additive; anchor -> houses[id].doorglow (the threshold); the pool spreads down over the step',
        smoke: 'anchor -> houses[id].smoke (chimney top); drift each puff up ~1 px/frame with a little sideways wobble, 2-3 puffs staggered',
        board: 'anchor = foot of the post -> houses[id].board (suggested: beside the door on the hinge side; the lamp hangs on the latch side)',
        poof: 'anchor = feet; play once at 14 fps on the old and the new spot (hide the character from frame 2, show it from frame 3)',
        cat: 'cat_<down|up|left|right>_<0..2> (0 idle, 1-2 walk) + cat_sit, cat_sleep; anchor = feet',
        pigeon: 'pigeon_0..2 peck loop facing right, pigeon_fly_0..1 flap; flip horizontally for left',
      },
    },
  };
  // review: dark + light sheet panels at 4x, per-house overlays, then every cottage at 1x and 2x
  const RW = 1500;
  const isHouse = (n: string) => n.startsWith('boarded_') || n.startsWith('unlit_');
  const named = frames.filter(([n]) => !isHouse(n));
  const dark = sheetPanel(named, '#15111e', '#c8c0d8', RW);
  const light = sheetPanel(named, '#cfc6b4', '#2a2230', RW);
  const hp = sheetPanel(
    frames.filter(([n]) => isHouse(n)),
    '#15111e',
    '#c8c0d8',
    RW,
  );
  const map = new Map(frames);
  const town = townPanel((n) => map.get(n)!, houses);
  const t2 = scaled(town, 2);
  const review = new Img(RW, dark.h + light.h + hp.h + town.h + t2.h + 32);
  review.rect(0, 0, review.w, review.h, '#0c0a12');
  let y = 0;
  for (const p of [dark, light, hp]) {
    review.copy(p, 0, y);
    y += p.h;
  }
  review.copy(town, 8, y + 8);
  review.copy(t2, 8, y + town.h + 24);
  return { img, manifest, review };
}
