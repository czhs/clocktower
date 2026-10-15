// Tiny synthesised fallbacks for the five server cues, used only while (or if) the real recording
// is not decoded yet, so a bell is never silently lost on a slow first load.

export type SynthCue = 'bell' | 'dawn' | 'toll' | 'door' | 'visit';

export function synthCue(ctx: AudioContext, out: AudioNode, cue: SynthCue, at: number): void {
  const partial = (freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  };
  const bell = (base: number, t: number, strength = 1) => {
    const ratios: [number, number, number][] = [
      [0.5, 0.5, 4.5],
      [1, 0.9, 3.5],
      [1.19, 0.45, 2.6],
      [1.56, 0.35, 2.2],
      [2.0, 0.3, 1.8],
      [2.74, 0.18, 1.2],
    ];
    for (const [r, g, d] of ratios) partial(base * r, t, d * (0.7 + strength * 0.3), g * 0.25 * strength);
  };
  switch (cue) {
    case 'bell':
      for (let i = 0; i < 3; i++) bell(392, at + i * 1.1, 1 - i * 0.15);
      break;
    case 'toll':
      bell(196, at, 1.2);
      bell(196, at + 2.2, 0.9);
      break;
    case 'dawn':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => partial(f, at + i * 0.18, 1.6, 0.12, 'triangle'));
      break;
    case 'door':
      partial(90, at, 0.25, 0.25, 'triangle');
      break;
    case 'visit':
      partial(880, at, 1.2, 0.05);
      partial(1318.5, at + 0.15, 1.2, 0.04);
      break;
  }
}
