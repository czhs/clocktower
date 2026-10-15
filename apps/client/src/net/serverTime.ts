// LEAD-OWNED. Server clock estimate (for countdowns that use server ms, e.g. the town clock's
// endsAt). Fed from every world snapshot (`t` = server ms when sent); smoothed, never jumps backward
// by more than a little, and ignores samples delayed by stalls (keeps the most advanced estimate).
let offset: number | null = null;

export function noteServerTime(serverMs: number): void {
  const est = serverMs - Date.now();
  if (offset === null) offset = est;
  // a late sample (network stall) underestimates the server time: only follow upward quickly
  else offset = est > offset ? offset + (est - offset) * 0.5 : offset + (est - offset) * 0.05;
}

/** Best estimate of the server's Date.now(). */
export function serverNow(): number {
  return Date.now() + (offset ?? 0);
}
