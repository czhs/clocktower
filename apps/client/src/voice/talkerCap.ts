// v2.4 perf (P1, design for the voice owner — NOT wired into VoiceEngine yet; needs a human test with
// real LiveKit). Pure "decode only the N most relevant talkers" policy for big rooms (the square, a
// crowded street), on top of the WP5 proximity cull in policy.ts (cullStep).
//
// Why: every subscribed microphone is one Opus decoder + one WebAudio chain on the phone and up to
// 24 kbps downlink while it talks. With 15 people in the square and several talking at once, a phone
// decodes them all although nobody can follow more than a handful of simultaneous voices.
//
// How it is meant to be wired (voice owner, VoiceEngine.tickGains, ~10 Hz):
//   - candidates = remote participants of the zone room with a microphone publication that the
//     WP5 cull has NOT culled (in proximity mode), with
//       speaking     = p.isSpeaking (LiveKit's server-side active-speaker signal — it keeps arriving
//                      for participants we are NOT subscribed to; this is the assumption the human
//                      test must confirm, see below),
//       lastSpokeMs  = engine-kept timestamp of the last tick with speaking = true,
//       distPx       = distance as for the gains (Infinity when unknown),
//       pinned       = the Storyteller (always decoded).
//   - state = capStep(state, candidates, now); then for each candidate:
//       not in state.on and pub.isDesired  -> pub.setSubscribed(false), remember "capped by us";
//       in state.on and capped by us        -> pub.setSubscribed(true).
//     Exactly like the cull: only tracks this client dropped are ever resubscribed (never anything
//     the server's grant does not allow), and leaving the room / mode change restores them.
//   - The VoicePanel / talking outline should keep using the active-speaker flag (it still shows
//     who talks even when we do not decode them).
//
// Hysteresis: a slot holder keeps its slot while it is "active" (talking, spoke within holdMs, or
// subscribed for less than minOnMs), so two groups talking at once do not flap subscriptions; a
// newcomer who starts talking takes the slot of the holder who has been silent the longest once
// that holder is inactive. Free slots are pre-filled with the most recent / nearest silent people
// so the common case (≤ N people) never resubscribes at all.
//
// Human test needed (real LiveKit, ≥ 8 browsers, e.g. tests/e2e/voice-live.spec.ts extended):
//   1. isSpeaking / audioLevel of an UNSUBSCRIBED remote participant still update (SpeakersChanged).
//   2. Resubscribe latency (setSubscribed(true) -> audible): the first ~100–300 ms of a newcomer
//      are lost; check it is acceptable or lower holdMs / pre-fill more.
//   3. Phone CPU / downlink with 10 simultaneous talkers, cap 6 vs off.

export interface TalkerInfo {
  pid: string;
  /** Talking now (LiveKit active-speaker signal). */
  speaking: boolean;
  /** Last time (ms) they were seen talking, null = never. */
  lastSpokeMs: number | null;
  /** Distance to us (px); Infinity when unknown. Square rooms: still used as a tie-breaker. */
  distPx: number;
  /** Always decoded (the Storyteller). */
  pinned?: boolean;
}

export interface TalkerCapState {
  /** Subscribed (decoded) participants -> since when (ms). */
  on: ReadonlyMap<string, number>;
}

export interface TalkerCapOptions {
  /** Max decoded talkers (pinned ones count too). */
  max?: number;
  /** A holder stays "active" this long after they last talked. */
  holdMs?: number;
  /** A fresh subscription is kept at least this long (no flapping). */
  minOnMs?: number;
}

export const TALKER_CAP_DEFAULTS = { max: 6, holdMs: 4000, minOnMs: 3000 } as const;
export const TALKER_CAP_INITIAL: TalkerCapState = { on: new Map() };

/** One step of the cap: which candidates should be subscribed now. Unknown pids are dropped. */
export function capStep(prev: TalkerCapState, talkers: readonly TalkerInfo[], nowMs: number, opts: TalkerCapOptions = {}): TalkerCapState {
  const max = Math.max(1, Math.floor(opts.max ?? TALKER_CAP_DEFAULTS.max));
  const holdMs = opts.holdMs ?? TALKER_CAP_DEFAULTS.holdMs;
  const minOnMs = opts.minOnMs ?? TALKER_CAP_DEFAULTS.minOnMs;
  const since = (t: TalkerInfo) => prev.on.get(t.pid);
  if (talkers.length <= max) {
    // everyone fits: keep the "since" of holders, start the others now
    const on = new Map<string, number>();
    for (const t of talkers) on.set(t.pid, since(t) ?? nowMs);
    return sameOn(prev.on, on) ? prev : { on };
  }
  const recent = (t: TalkerInfo) => t.speaking || (t.lastSpokeMs !== null && nowMs - t.lastSpokeMs < holdMs);
  const tier = (t: TalkerInfo): number => {
    const s = since(t);
    const holder = s !== undefined;
    if (t.pinned) return 0;
    if (holder && (recent(t) || nowMs - s < minOnMs)) return 1; // active holder: keeps its slot
    if (t.speaking) return 2; // newcomer talking: takes a free / inactive slot
    if (holder) return 3; // inactive holder: kept while there is room
    if (recent(t)) return 4; // just stopped talking, not decoded
    return 5; // silent: pre-fill by recency, then distance
  };
  const ranked = talkers
    .map((t) => ({ t, k: tier(t) }))
    .sort((a, b) => a.k - b.k || (b.t.lastSpokeMs ?? -Infinity) - (a.t.lastSpokeMs ?? -Infinity) || a.t.distPx - b.t.distPx || (a.t.pid < b.t.pid ? -1 : a.t.pid > b.t.pid ? 1 : 0));
  const on = new Map<string, number>();
  for (const { t } of ranked.slice(0, max)) on.set(t.pid, since(t) ?? nowMs);
  return sameOn(prev.on, on) ? prev : { on };
}

function sameOn(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}
