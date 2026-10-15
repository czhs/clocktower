// Print a coarse loudness envelope of each file (dB RMS per step) to pick segments.
import { decode, rmsDb, SR, loudness } from './lib.mjs';
const step = Number(process.env.STEP ?? 0.25);
for (const f of process.argv.slice(2)) {
  const x = decode(f);
  const n = Math.round(step * SR);
  const env = [];
  for (let i = 0; i + n <= x.length; i += n) env.push(rmsDb(x, i, i + n));
  const L = loudness(x);
  console.log(`## ${f.split('/').pop()} dur=${(x.length / SR).toFixed(2)}s I=${L.integrated.toFixed(1)} Mmax=${L.momentaryMax.toFixed(1)}`);
  const chars = ' .:-=+*#%@';
  let line = '';
  env.forEach((d, i) => {
    if (i % 80 === 0) { if (line) console.log(line); line = `${(i * step).toFixed(1).padStart(6)} `; }
    line += chars[Math.max(0, Math.min(9, Math.round((d + 60) / 6)))];
  });
  console.log(line);
}
