// Shared helpers for the offline audio pipeline. Inputs are untrusted audio files; they are only
// ever passed to ffmpeg as decode inputs (never executed). Everything else is plain PCM math.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
export const FFMPEG = path.join(here, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
export const SR = 48000;

/** Decode any audio file to mono float32 @48k (optionally with an ffmpeg -af chain). */
export function decode(file, af = '') {
  const filters = ['aresample=48000'];
  const args = ['-v', 'error', '-i', file, '-af', [af, ...filters].filter(Boolean).join(','), '-ac', '1', '-f', 'f32le', '-ar', String(SR), '-'];
  const r = spawnSync(FFMPEG, args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`decode ${file}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
}

/** Mono decode for already-mono files (pan filter would fail on 1 channel otherwise: we force -ac 2 first). */
export function rmsDb(x, i0, i1) {
  let s = 0;
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-12);
}
export function peak(x) {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

// --- ITU-R BS.1770 K-weighting (48 kHz coefficients) --------------------------------------
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kweight(x) {
  const s1 = biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585);
  return biquad(s1, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
}
/** Integrated loudness (LUFS, gated) and max momentary loudness (400 ms). Mono. */
export function loudness(x) {
  const k = kweight(x);
  const win = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const blocks = [];
  if (k.length < win) {
    // Shorter than one block: treat as zero-padded to 400 ms so short clips compare consistently.
    let s = 0; for (const v of k) s += v * v;
    blocks.push(s / win);
  } else for (let i = 0; i + win <= k.length; i += hop) {
    let s = 0; for (let j = i; j < i + win; j++) s += k[j] * k[j];
    blocks.push(s / win);
  }
  const L = (ms) => -0.691 + 10 * Math.log10(ms + 1e-15);
  const abs = blocks.filter((b) => L(b) > -70);
  const mean = (a) => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((b) => L(b) > rel);
  return { integrated: L(mean(gated)), momentaryMax: Math.max(...blocks.map(L)) };
}

export function ffmpegEncode(pcm, outBase, { opusKbps, aacKbps, aacRate = 44100 }) {
  const raw = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const common = ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-map_metadata', '-1'];
  const run = (args) => {
    const r = spawnSync(FFMPEG, [...common, ...args], { input: raw, maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`encode ${outBase}: ${r.stderr}`);
  };
  run(['-c:a', 'libopus', '-b:a', `${opusKbps}k`, '-vbr', 'on', '-application', 'audio', '-frame_duration', '20', `${outBase}.ogg`]);
  run(['-c:a', 'aac', '-b:a', `${aacKbps}k`, '-ar', String(aacRate), '-movflags', '+faststart', `${outBase}.m4a`]);
}
