// Reduced motion (comfort): localStorage['ct.reducedMotion'] = '1' | 'true' | 'on' forces it on,
// '0' | 'false' | 'off' forces it off; when unset the OS `prefers-reduced-motion` setting decides.
// With reduced motion the town keeps its lighting and colour but drops drift and flicker: no
// particle drift (embers, motes, sparks, drizzle), static haze / ground fog / clouds, no light
// breathing, still flames, no idle bounce, no swinging bells, static voice rings.
export const REDUCED_MOTION_KEY = 'ct.reducedMotion';

let cached = false;
let nextPoll = 0;

function read(): boolean {
  try {
    const v = window.localStorage.getItem(REDUCED_MOTION_KEY);
    if (v === '1' || v === 'true' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'off') return false;
  } catch {
    /* storage blocked: fall through to the OS preference */
  }
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Current reduced-motion state (re-read about once a second). */
export function reducedMotion(): boolean {
  const now = performance.now();
  if (now >= nextPoll) {
    nextPoll = now + 1000;
    cached = read();
  }
  return cached;
}
