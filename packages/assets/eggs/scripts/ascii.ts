// Dev tool: ASCII view of ground + collision + objects for placement planning.
import { townLayout as L, townMap } from '../../src/index.js';
const [x0, y0, x1, y1] = process.argv.slice(2).map(Number) as [number, number, number, number];
const objAt = new Map<string, string>();
for (const o of townMap.objects) objAt.set(`${o.x},${o.y}`, o.kind === 'building' ? 'B' : o.kind[0]!.toUpperCase());
let hdr = '    ';
for (let x = x0; x <= x1; x++) hdr += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : x % 2 === 0 ? '.' : ' ';
console.log(hdr);
hdr = '    ';
for (let x = x0; x <= x1; x++) hdr += String(x % 10);
console.log(hdr);
for (let y = y0; y <= y1; y++) {
  let row = String(y).padStart(3) + ' ';
  for (let x = x0; x <= x1; x++) {
    const o = objAt.get(`${x},${y}`);
    const blocked = L.collision[y * L.widthTiles + x] === 1;
    const g = townMap.ground[y]![x]!;
    row += o ? o : blocked ? (g === '.' || g === ',' || g === '=' || g === ':' ? '#' : g === ' ' ? '@' : g) : g;
  }
  console.log(row);
}
for (const b of L.buildings) if (b.door.x >= x0 && b.door.x <= x1 && b.door.y >= y0 && b.door.y <= y1) console.log(`door ${b.id} @ ${b.door.x},${b.door.y} fp ${JSON.stringify(b.footprint)}`);
