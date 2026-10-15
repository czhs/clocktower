// List energy onsets (rise >= RISE dB within 60 ms over the previous 120 ms) to find strokes/calls.
import { decode, rmsDb, SR } from './lib.mjs';
const rise = Number(process.env.RISE ?? 5);
for (const f of process.argv.slice(2)) {
  const x = decode(f, 'highpass=f=150');
  const h = Math.round(0.02 * SR);
  const env = [];
  for (let i = 0; i + h <= x.length; i += h) env.push(rmsDb(x, i, i + h));
  const out = [];
  let last = -1;
  for (let i = 6; i + 3 < env.length; i++) {
    const before = Math.max(...env.slice(i - 6, i));
    const after = Math.max(...env.slice(i, i + 3));
    if (after - before >= rise && after > -45 && i - last > 10) { out.push(`${(i * 0.02).toFixed(2)}(${after.toFixed(0)})`); last = i; }
  }
  console.log(f.split('/').pop(), out.join(' '));
}
