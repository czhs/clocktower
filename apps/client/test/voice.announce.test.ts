// OWNED BY voice (v2.3): Storyteller announcement warning state + request clearing.
import { describe, expect, it } from 'vitest';
import { announceBar, shouldClearAnnounce } from '../src/voice/announce';

describe('announce warning bar', () => {
  it('is shown to the Storyteller while requested (starting) and while live; never to players', () => {
    expect(announceBar({ isStoryteller: true, requested: false, room: null, canPublish: false })).toBe('off');
    expect(announceBar({ isStoryteller: true, requested: true, room: null, canPublish: false })).toBe('starting');
    expect(announceBar({ isStoryteller: true, requested: true, room: 'prod-x-announce_ab12', canPublish: true })).toBe('live');
    // A live grant shows the bar even if the local request flag was lost (e.g. panel re-mounted).
    expect(announceBar({ isStoryteller: true, requested: false, room: 'prod-x-announce_ab12', canPublish: true })).toBe('live');
    expect(announceBar({ isStoryteller: false, requested: true, room: 'prod-x-announce_ab12', canPublish: false })).toBe('off');
  });

  it('drops the request once the server ended a live announcement, or when it never started', () => {
    const base = { requested: true, requestedAt: 0, now: 1000 };
    expect(shouldClearAnnounce({ ...base, wasLive: false, live: false })).toBe(false); // still starting
    expect(shouldClearAnnounce({ ...base, wasLive: false, live: true })).toBe(false);
    expect(shouldClearAnnounce({ ...base, wasLive: true, live: true })).toBe(false);
    expect(shouldClearAnnounce({ ...base, wasLive: true, live: false })).toBe(true); // server ended it
    expect(shouldClearAnnounce({ ...base, now: 20_000, wasLive: false, live: false })).toBe(true); // never granted
    expect(shouldClearAnnounce({ ...base, requested: false, wasLive: true, live: false })).toBe(false);
  });
});
