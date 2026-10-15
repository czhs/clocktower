// First-visit flag + a global "open the tour" event for the pre-sign-in tour (tutorial teammate).
// No game state, no account data: a single localStorage flag.

const SEEN_KEY = 'ct.intro.seen.v1';
/** Automation (navigator.webdriver) never gets the auto-show, so it cannot cover the sign-up form in
 * other teams' e2e specs. A spec that WANTS the first-visit behaviour sets this key (tutorial-intro.spec.ts). */
const AUTOMATION_OPT_IN = 'ct.intro.autotest';
export const INTRO_EVENT = 'ct:intro';

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True on the very first visit (the tour opens by itself once). Blocked storage: never auto-show. */
export function shouldAutoShowIntro(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return false;
  } catch {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver && get(AUTOMATION_OPT_IN) !== '1') return false;
  return true;
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

/** Open the tour from anywhere an IntroHost is mounted. */
export function openIntro(): void {
  window.dispatchEvent(new CustomEvent(INTRO_EVENT));
}
