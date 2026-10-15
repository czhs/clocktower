// Offline pipeline: source audio (CC0, see CREDITS.md) -> trimmed, loudness-normalised, mono,
// seamless-loop-baked .ogg (Opus) + .m4a (AAC) files under OUT. Run on hshi-u1:
//   node tools/build.mjs <srcRoot> <outDir>
// Sources are only decoded by ffmpeg; nothing from them is executed.
import fs from 'node:fs';
import path from 'node:path';
import { decode, loudness, peak, ffmpegEncode, SR } from './lib.mjs';

const [, , SRC, OUT] = process.argv;
const K = (p) => path.join(SRC, 'kenney', p);
const F = (id) => path.join(SRC, 'fs', `fs-${id}.mp3`);
const LOOP_PAD = 0.1; // s of wrap-around audio on both ends (engine: loopStart = pad, loopEnd = pad + period)

/** kind: loop | shot. lufs: target (integrated for loops, max momentary for shots). */
const ITEMS = [
  // --- ambience loops ---------------------------------------------------------------------
  { out: 'amb/wind', src: F(444921), kind: 'loop', period: 24, xf: 2, af: 'highpass=f=60,lowpass=f=9000', lufs: -26, opus: 20, aac: 32, aacRate: 32000 },
  { out: 'amb/crows', src: F(400395), kind: 'loop', period: 20, xf: 1.5, af: 'highpass=f=180', lufs: -26, opus: 22, aac: 36, aacRate: 32000 },
  { out: 'amb/fountain', src: F(676173), kind: 'loop', period: 7, xf: 1, af: 'highpass=f=120', lufs: -26, opus: 24, aac: 40, aacRate: 32000 },
  { out: 'amb/tavern', src: F(455732), kind: 'loop', period: 20, xf: 1.5, af: 'highpass=f=100,lowpass=f=7000', lufs: -26, opus: 20, aac: 32, aacRate: 32000 },
  { out: 'amb/river', src: F(450628), kind: 'loop', period: 16, xf: 1.5, af: 'highpass=f=80', lufs: -26, opus: 22, aac: 36, aacRate: 32000 },
  { out: 'amb/crickets', src: F(522299), kind: 'loop', period: 16, xf: 1.5, af: 'highpass=f=1500', lufs: -26, opus: 22, aac: 36, aacRate: 32000 },
  // --- sporadic ambience calls (night) ----------------------------------------------------
  { out: 'amb/owl-1', src: F(655380), kind: 'shot', start: 0.15, dur: 1.5, fadeOut: 0.4, af: 'highpass=f=200', lufs: -24, opus: 28, aac: 40 },
  { out: 'amb/owl-2', src: F(655380), kind: 'shot', start: 4.55, dur: 2.1, fadeOut: 0.5, af: 'highpass=f=200', lufs: -24, opus: 28, aac: 40 },
  { out: 'amb/owl-3', src: F(465697), kind: 'shot', start: 0.1, dur: 4.2, fadeOut: 0.5, af: 'highpass=f=200', lufs: -24, opus: 28, aac: 40 },
  // --- footsteps (Kenney Impact Sounds) ---------------------------------------------------
  ...[0, 1, 2, 3].flatMap((i) => [
    { out: `step/cobble-${i + 1}`, src: K(`impact-sounds/x/Audio/footstep_concrete_00${i}.ogg`), kind: 'shot', dur: 0.2, fadeOut: 0.05, lufs: -27, opus: 32, aac: 48 },
    { out: `step/grass-${i + 1}`, src: K(`impact-sounds/x/Audio/footstep_grass_00${i}.ogg`), kind: 'shot', dur: 0.32, fadeOut: 0.12, lufs: -29, opus: 32, aac: 48 },
    { out: `step/wood-${i + 1}`, src: K(`impact-sounds/x/Audio/footstep_wood_00${i}.ogg`), kind: 'shot', dur: 0.25, fadeOut: 0.06, lufs: -27, opus: 32, aac: 48 },
    { out: `step/gravel-${i + 1}`, src: K(`impact-sounds/x/Audio/footstep_snow_00${i}.ogg`), kind: 'shot', dur: 0.3, fadeOut: 0.08, lufs: -29, opus: 32, aac: 48 },
  ]),
  // --- doors (Kenney RPG Audio): open, then close 0.5 s later ------------------------------
  { out: 'sfx/door', mix: [[K('rpg-audio/x/Audio/doorOpen_1.ogg'), 0, 1], [K('rpg-audio/x/Audio/doorClose_1.ogg'), 0.5, 0.9]], kind: 'shot', dur: 1.25, fadeOut: 0.15, lufs: -22, opus: 32, aac: 48 },
  // --- public cues -------------------------------------------------------------------------
  { out: 'cue/bell', src: F(454855), kind: 'shot', start: 3.55, dur: 5.4, fadeOut: 1.8, af: 'highpass=f=90', lufs: -20, opus: 28, aac: 40 },
  { out: 'cue/toll', src: F(474266), kind: 'shot', start: 0.0, dur: 5.6, fadeOut: 1.6, af: 'highpass=f=70', lufs: -21, opus: 28, aac: 40 },
  { out: 'cue/dawn', src: F(398496), kind: 'shot', start: 0.0, dur: 4.0, fadeOut: 1.2, af: 'highpass=f=300', lufs: -22, opus: 28, aac: 40 },
  { out: 'cue/visit', src: F(616335), kind: 'shot', start: 0.0, dur: 3.6, fadeOut: 2.0, fadeIn: 0.06, af: 'lowpass=f=5000', lufs: -27, opus: 28, aac: 40 },
  // --- game events -------------------------------------------------------------------------
  { out: 'sfx/gavel', src: F(618138), kind: 'shot', start: 0.0, dur: 1.7, fadeOut: 0.3, lufs: -19, opus: 32, aac: 48 },
  { out: 'sfx/ghost', src: F(462089), kind: 'shot', start: 0.0, dur: 4.6, fadeOut: 1.5, af: 'highpass=f=120', lufs: -23, opus: 28, aac: 40 },
  { out: 'sfx/tick', src: K('interface-sounds/x/Audio/tick_004.ogg'), kind: 'shot', dur: 0.12, fadeOut: 0.02, lufs: -27, opus: 32, aac: 48 },
  { out: 'sfx/tick-yes', src: K('impact-sounds/x/Audio/impactBell_heavy_004.ogg'), kind: 'shot', dur: 0.3, fadeOut: 0.1, lufs: -26, opus: 32, aac: 48 },
  // --- UI ----------------------------------------------------------------------------------
  { out: 'ui/click', src: K('interface-sounds/x/Audio/click_001.ogg'), kind: 'shot', dur: 0.1, fadeOut: 0.02, lufs: -32, opus: 32, aac: 48 },
];

const BUDGET = { loop: 250 * 1024, shot: 30 * 1024 };

function trimLead(x, relDb = -45) {
  const p = peak(x);
  const th = p * 10 ** (relDb / 20);
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < th) i++;
  return x.subarray(Math.max(0, i - Math.round(0.004 * SR)));
}
function fade(x, inS, outS) {
  const ni = Math.round(inS * SR), no = Math.round(outS * SR);
  for (let i = 0; i < ni && i < x.length; i++) x[i] *= i / ni;
  for (let i = 0; i < no && i < x.length; i++) x[x.length - 1 - i] *= Math.sin((Math.PI / 2) * (i / no));
  return x;
}
/** Steadiest window (lowest spread of 1 s RMS) of length len samples, avoiding the first/last 0.5 s. */
function steadiest(x, len) {
  const w = SR, step = SR / 2;
  const db = [];
  for (let i = 0; i + w <= x.length; i += step) {
    let s = 0;
    for (let j = i; j < i + w; j++) s += x[j] * x[j];
    db.push(10 * Math.log10(s / w + 1e-12));
  }
  const nb = Math.ceil(len / step);
  let best = 1, bestScore = Infinity;
  for (let b = 1; b + nb < db.length - 1; b++) {
    const seg = db.slice(b, b + nb);
    const mean = seg.reduce((p, c) => p + c, 0) / seg.length;
    const sd = Math.sqrt(seg.reduce((p, c) => p + (c - mean) ** 2, 0) / seg.length);
    const spike = Math.max(...seg) - mean;
    const score = sd + 0.5 * Math.max(0, spike - 4);
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return { start: best * step, score: bestScore };
}
function makeLoop(x, it) {
  const P = Math.round(it.period * SR), X = Math.round(it.xf * SR), pad = Math.round(LOOP_PAD * SR);
  if (x.length < P + X + SR) throw new Error(`${it.out}: source too short (${(x.length / SR).toFixed(1)} s)`);
  const { start, score } = steadiest(x, P + X);
  const A = x.subarray(start, start + P + X);
  const L = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    if (i < X) {
      const t = i / X;
      L[i] = A[i] * Math.sin((Math.PI / 2) * t) + A[P + i] * Math.cos((Math.PI / 2) * t);
    } else L[i] = A[i];
  }
  const out = new Float32Array(P + 2 * pad);
  out.set(L.subarray(P - pad), 0);
  out.set(L, pad);
  out.set(L.subarray(0, pad), pad + P);
  return { pcm: out, note: `segment ${(start / SR).toFixed(2)}-${((start + P + X) / SR).toFixed(2)} s (steadiness ${score.toFixed(2)})`, measure: L };
}

const manifest = [];
fs.mkdirSync(OUT, { recursive: true });
for (const it of ITEMS) {
  let pcm, note = '', measure;
  if (it.kind === 'loop') {
    const x = decode(it.src, it.af);
    ({ pcm, note, measure } = makeLoop(x, it));
  } else {
    let x;
    if (it.mix) {
      const parts = it.mix.map(([f, at, g]) => ({ x: trimLead(decode(f, it.af)), at: Math.round(at * SR), g }));
      x = new Float32Array(Math.max(...parts.map((p) => p.at + p.x.length)));
      for (const p of parts) for (let i = 0; i < p.x.length; i++) x[p.at + i] += p.x[i] * p.g;
    } else {
      x = decode(it.src, it.af);
      if (it.start !== undefined) x = x.subarray(Math.round(it.start * SR));
      x = trimLead(x);
    }
    x = Float32Array.from(x.subarray(0, Math.min(x.length, Math.round(it.dur * SR))));
    pcm = fade(x, it.fadeIn ?? 0.003, it.fadeOut ?? 0.02);
    measure = pcm;
  }
  const L = loudness(measure);
  const cur = it.kind === 'loop' ? L.integrated : L.momentaryMax;
  let gain = 10 ** ((it.lufs - cur) / 20);
  const pk = peak(pcm) * gain;
  const ceiling = 10 ** (-1.5 / 20);
  if (pk > ceiling) gain *= ceiling / pk; // peak-safe: never clip; such items end up a bit quieter
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  const final = loudness(it.kind === 'loop' ? pcm.subarray(Math.round(LOOP_PAD * SR), pcm.length - Math.round(LOOP_PAD * SR)) : pcm);
  const base = path.join(OUT, it.out);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  ffmpegEncode(pcm, base, { opusKbps: it.opus, aacKbps: it.aac, aacRate: it.aacRate ?? 44100 });
  const sizes = { ogg: fs.statSync(`${base}.ogg`).size, m4a: fs.statSync(`${base}.m4a`).size };
  const limit = BUDGET[it.kind];
  const over = Object.entries(sizes).filter(([, s]) => s > limit);
  const row = {
    id: it.out, kind: it.kind, seconds: +(pcm.length / SR).toFixed(3), period: it.period ?? null, pad: it.kind === 'loop' ? LOOP_PAD : null,
    lufs: +(it.kind === 'loop' ? final.integrated : final.momentaryMax).toFixed(1), peakDb: +(20 * Math.log10(peak(pcm))).toFixed(1), sizes, note,
  };
  manifest.push(row);
  console.log(`${it.out.padEnd(18)} ${row.seconds.toFixed(2).padStart(6)}s ${String(row.lufs).padStart(6)} LU pk ${String(row.peakDb).padStart(5)} ogg ${String(sizes.ogg).padStart(6)} m4a ${String(sizes.m4a).padStart(6)} ${over.length ? 'OVER BUDGET ' + over.map((o) => o[0]).join(',') : ''} ${note}`);
  if (over.length) process.exitCode = 1;
}
const total = manifest.reduce((p, r) => p + r.sizes.ogg + r.sizes.m4a, 0);
console.log(`TOTAL ${(total / 1024).toFixed(1)} KB in ${manifest.length * 2} files`);
fs.writeFileSync(path.join(OUT, '..', 'manifest.json'), JSON.stringify(manifest, null, 1));
