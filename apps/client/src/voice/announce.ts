// OWNED BY voice (v2.3). Storyteller "announce to the whole town" — pure state logic (unit-tested).
// The server is the authority: it ends an announcement by itself (90 s without the Storyteller
// talking, a hard cap of a few minutes, nightfall, a home visit). The client sends
// voice:announce {active:true} ONCE (no keep-alive) and clears its own request as soon as the
// server's announce grant goes away, so a forgotten announcement can never restart by itself.

export type AnnounceBar = 'off' | 'starting' | 'live';

/** What the Storyteller's warning bar shows. */
export function announceBar(o: { isStoryteller: boolean; requested: boolean; room: string | null; canPublish: boolean }): AnnounceBar {
  if (!o.isStoryteller) return 'off';
  if (o.room && o.canPublish) return 'live'; // the server granted the ST a publishing announce room
  return o.requested ? 'starting' : 'off';
}

/**
 * Should the client drop its announce request? Yes once the announcement was live and the server
 * ended it (grant revoked), or when the request has waited too long without a grant.
 */
export function shouldClearAnnounce(o: { requested: boolean; wasLive: boolean; live: boolean; requestedAt: number; now: number; startTimeoutMs?: number }): boolean {
  if (!o.requested) return false;
  if (o.wasLive && !o.live) return true;
  return !o.live && !o.wasLive && o.now - o.requestedAt > (o.startTimeoutMs ?? 15_000);
}
