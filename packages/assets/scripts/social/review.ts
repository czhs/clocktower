// Review sheet for the social art (not shipped): every frame at 4x on a light and a dark ground,
// pins carrying character icons at 1x/2x/4x, and the icon roster.
import { PIN_COLORS } from '@ct/protocol';
import { CAST } from '../../src/cast.js';
import { text } from '../fx/font.js';
import { Img, type Color } from '../lib/img.js';
import { PIN_ICON } from './pins.js';

const LIGHT = '#9c9282'; // daylight cobbles
const DARK = '#1b1a2a'; // night ground
const GRASS = '#3f5d3b';

function up(src: Img, f: number): Img {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
}

export function pinWithIcon(frames: Map<string, Img>, color: string, icon: Img): Img {
  const p = frames.get(`pin_${color}`)!.clone();
  p.blit(icon, PIN_ICON.left, PIN_ICON.top);
  return p;
}

export function reviewSheet(list: [string, Img][], icons: Map<string, Img>): Img {
  const frames = new Map(list);
  const S = 4;
  const W = 1400;
  const blocks: { draw: (o: Img, y: number) => void; h: number }[] = [];
  const label = (o: Img, x: number, y: number, s: string, c: Color = '#f4ecd4') => text(o, x, y, s, c, 2);

  // 1. all frames at 4x, on light and dark rows
  for (const bg of [LIGHT, DARK]) {
    const rows: [string, Img][][] = [];
    let row: [string, Img][] = [];
    let x = 0;
    for (const [n, im] of list) {
      if (n.startsWith('icon_')) continue;
      const w = im.w * S + 12;
      if (x + w > W - 16) {
        rows.push(row);
        row = [];
        x = 0;
      }
      row.push([n, im]);
      x += w;
    }
    rows.push(row);
    for (const r of rows) {
      const h = Math.max(...r.map(([, i]) => i.h)) * S + 24;
      blocks.push({
        h,
        draw(o, y) {
          o.rect(0, y, W, h, bg);
          let xx = 8;
          for (const [n, im] of r) {
            o.blit(up(im, S), xx, y + 4);
            label(o, xx, y + h - 14, n.replace('point_', 'p_'), bg === LIGHT ? '#20182a' : '#f4ecd4');
            xx += im.w * S + 12;
          }
        },
      });
    }
  }

  // 2. pins with icons: 1x, 2x, 4x on cobble, grass and night
  const ids = CAST.map((c) => c.id);
  for (const bg of [LIGHT, GRASS, DARK])
    for (const f of [1, 2, 4]) {
      const ph = 26 * f + 8;
      blocks.push({
        h: ph,
        draw(o, y) {
          o.rect(0, y, W, ph, bg);
          let x = 8;
          PIN_COLORS.forEach((c, k) => {
            for (let r = 0; r < (f === 4 ? 1 : f === 2 ? 3 : 6); r++) {
              const id = ids[(k * 7 + r * 3) % ids.length]!;
              const sh = frames.get('pin_shadow')!;
              const tip = x + 8 * f;
              o.blit(up(sh, f), tip - 6 * f, y + 4 + 25 * f - 2 * f);
              o.blit(up(pinWithIcon(frames, c, icons.get(id)!), f), x, y + 4);
              x += (18 + 4) * f;
            }
          });
        },
      });
    }

  // 3. icon roster 4x (light + dark) and 1x/2x
  for (const bg of [LIGHT, DARK]) {
    const h = 12 * S + 26;
    blocks.push({
      h,
      draw(o, y) {
        o.rect(0, y, W, h, bg);
        CAST.forEach((c, i) => {
          o.blit(up(icons.get(c.id)!, S), 8 + i * 44, y + 4);
          label(o, 8 + i * 44, y + 12 * S + 8, c.id.slice(0, 5), bg === LIGHT ? '#20182a' : '#f4ecd4');
        });
      },
    });
  }
  for (const f of [1, 2]) {
    const h = 12 * f + 8;
    blocks.push({
      h,
      draw(o, y) {
        o.rect(0, y, W, h, DARK);
        CAST.forEach((c, i) => o.blit(up(icons.get(c.id)!, f), 8 + i * (12 * f + 4), y + 4));
      },
    });
  }

  const H = blocks.reduce((s, b) => s + b.h, 0);
  const out = new Img(W, H);
  let y = 0;
  for (const b of blocks) {
    b.draw(out, y);
    y += b.h;
  }
  return out;
}
