// Tiny WebAudio synthesiser for world cues (bedtime bell, dawn chime, death toll, door, visit).
// The AudioContext is created on the first user gesture; earlier cues are silently skipped.
export type Cue = 'bell' | 'dawn' | 'toll' | 'door' | 'visit';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

function partial(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** Struck bell: inharmonic partials with long decay. */
function bell(base: number, at: number, strength = 1) {
  const ratios: [number, number, number][] = [
    [0.5, 0.5, 4.5],
    [1, 0.9, 3.5],
    [1.19, 0.45, 2.6],
    [1.56, 0.35, 2.2],
    [2.0, 0.3, 1.8],
    [2.74, 0.18, 1.2],
    [3.76, 0.1, 0.8],
  ];
  for (const [r, g, d] of ratios) partial(base * r, at, d * (0.7 + strength * 0.3), g * 0.25 * strength);
}

function noise(at: number, dur: number, gain: number, lp: number) {
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / n);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(at);
}

export function playCue(cue: Cue) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.02;
  switch (cue) {
    case 'bell':
      for (let i = 0; i < 3; i++) bell(392, t + i * 1.1, 1 - i * 0.15);
      break;
    case 'toll':
      bell(196, t, 1.2);
      bell(196, t + 2.2, 0.9);
      break;
    case 'dawn':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        partial(f, t + i * 0.18, 1.6, 0.12, 'triangle');
        partial(f * 2, t + i * 0.18, 0.8, 0.03);
      });
      break;
    case 'door':
      noise(t, 0.18, 0.4, 900);
      partial(90, t, 0.25, 0.25, 'triangle');
      break;
    case 'visit':
      partial(880, t, 1.2, 0.08, 'sine');
      partial(1318.5, t + 0.15, 1.2, 0.06, 'sine');
      break;
  }
}
