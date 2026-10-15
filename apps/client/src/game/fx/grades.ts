// Colour grades per PUBLIC phase (OWNED BY world-art / assets-fx). The multiply lighting in
// TownScene sets the base exposure/hue; these grades add the film look on top: warm golden day,
// pink-gold dawn, amber dusk (bedtime), cold moonlit night that keeps its warm pools (split tone:
// shadows go blue, highlights stay warm), plus bloom/DOF/vignette amounts.
export type V3 = [number, number, number];
export interface Grade {
  lift: V3;
  gamma: V3;
  gain: V3;
  sat: number;
  contrast: number;
  shadow: V3;
  hi: V3;
  split: number;
  /** 0..1 desaturation of blue-dominant pixels (night: calmer, less uniform blue) */
  coolDesat: number;
  vig: number;
  vigColor: V3;
  bloom: number;
  threshold: number;
  dof: number;
}

const DAY: Grade = {
  lift: [0.012, 0.006, 0.0],
  gamma: [1.02, 1.0, 0.97],
  gain: [1.05, 1.01, 0.92],
  sat: 1.1,
  contrast: 1.06,
  shadow: [0.94, 0.95, 1.08],
  hi: [1.06, 1.01, 0.9],
  split: 0.55,
  coolDesat: 0,
  vig: 0.32,
  vigColor: [0.08, 0.05, 0.06],
  bloom: 0.25,
  threshold: 0.86,
  dof: 0.85,
};

const DAWN: Grade = {
  lift: [0.03, 0.012, 0.03],
  gamma: [1.04, 0.98, 1.0],
  gain: [1.1, 1.0, 0.93],
  sat: 1.06,
  contrast: 1.05,
  shadow: [1.0, 0.9, 1.04],
  hi: [1.12, 1.02, 0.84],
  split: 0.75,
  coolDesat: 0.15,
  vig: 0.36,
  vigColor: [0.1, 0.04, 0.08],
  bloom: 0.27,
  threshold: 0.72,
  dof: 0.95,
};

const DUSK: Grade = {
  lift: [0.02, 0.006, 0.02],
  gamma: [1.06, 0.98, 0.94],
  gain: [1.12, 0.98, 0.84],
  sat: 1.12,
  contrast: 1.08,
  shadow: [0.92, 0.86, 1.14],
  hi: [1.12, 0.98, 0.78],
  split: 0.8,
  coolDesat: 0.2,
  vig: 0.38,
  vigColor: [0.08, 0.03, 0.06],
  bloom: 0.27,
  threshold: 0.72,
  dof: 1.0,
};

const NIGHT: Grade = {
  lift: [0.0, 0.0, 0.008],
  gamma: [1.0, 1.02, 1.03],
  gain: [1.04, 1.04, 1.02],
  sat: 1.0,
  contrast: 1.1,
  shadow: [0.95, 0.98, 1.06],
  hi: [1.12, 1.01, 0.84],
  split: 0.7,
  coolDesat: 0.45,
  vig: 0.3,
  vigColor: [0.01, 0.015, 0.04],
  bloom: 0.32,
  threshold: 0.62,
  dof: 1.0,
};

// lobby: late golden afternoon
const LOBBY: Grade = { ...DAY, gain: [1.08, 1.0, 0.88], hi: [1.1, 1.0, 0.84], split: 0.65, bloom: 0.38, vig: 0.38 };

export const GRADES: Record<string, Grade> = {
  waiting: LOBBY,
  setup: DAY,
  day: DAY,
  bedtime: DUSK,
  first_night: NIGHT,
  night: NIGHT,
  dawn: DAWN,
  finished: DAY,
};

/** Interiors: warmer, a bit more vignette, bloom from the hearth. */
export function interiorGrade(g: Grade, night: boolean): Grade {
  return {
    ...g,
    hi: [g.hi[0] * 1.03, g.hi[1], g.hi[2] * 0.96],
    vig: Math.max(g.vig, 0.4),
    bloom: Math.max(g.bloom, night ? 0.34 : 0.3),
    threshold: Math.min(g.threshold, night ? 0.55 : 0.62),
    dof: g.dof * 0.6,
  };
}

export function cloneGrade(g: Grade): Grade {
  return { ...g, lift: [...g.lift], gamma: [...g.gamma], gain: [...g.gain], shadow: [...g.shadow], hi: [...g.hi], vigColor: [...g.vigColor] };
}

/** Exponential ease of every channel of `cur` toward `to`. */
export function easeGrade(cur: Grade, to: Grade, k: number) {
  const v = (a: V3, b: V3) => {
    a[0] += (b[0] - a[0]) * k;
    a[1] += (b[1] - a[1]) * k;
    a[2] += (b[2] - a[2]) * k;
  };
  v(cur.lift, to.lift);
  v(cur.gamma, to.gamma);
  v(cur.gain, to.gain);
  v(cur.shadow, to.shadow);
  v(cur.hi, to.hi);
  v(cur.vigColor, to.vigColor);
  cur.sat += (to.sat - cur.sat) * k;
  cur.contrast += (to.contrast - cur.contrast) * k;
  cur.split += (to.split - cur.split) * k;
  cur.coolDesat += (to.coolDesat - cur.coolDesat) * k;
  cur.vig += (to.vig - cur.vig) * k;
  cur.bloom += (to.bloom - cur.bloom) * k;
  cur.threshold += (to.threshold - cur.threshold) * k;
  cur.dof += (to.dof - cur.dof) * k;
}
