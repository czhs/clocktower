// voice (v2.2 WP5): pure client decisions — street subscription culling hysteresis, change-only
// participant patches (gain in 0.05 steps) and the uplink-loss window that switches RED on
// (apps/client/src/voice/policy.ts).
import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@ct/protocol';
import { VOICE_DEFAULTS } from '@ct/voice/shared';
import {
  CULL_INITIAL,
  cullStep,
  LOSS_MIN_PACKETS,
  LOSS_WINDOW_EMPTY,
  lossStep,
  RED_LOSS_THRESHOLD,
  roundGain,
  sameParticipants,
  type CullState,
  type ParticipantLike,
} from '../src/voice/policy';

const T = TILE_SIZE;
const SILENT = VOICE_DEFAULTS.silentTiles * T;
const FAR = (VOICE_DEFAULTS.silentTiles + VOICE_DEFAULTS.cullMarginTiles) * T;

/** Run a sequence of [distancePx, atMs] samples through the state machine. */
function run(samples: [number, number][], start: CullState = CULL_INITIAL): CullState[] {
  const out: CullState[] = [];
  let s = start;
  for (const [d, t] of samples) out.push((s = cullStep(s, d, t)));
  return out;
}

describe('cullStep (street subscription culling)', () => {
  it('uses the shared defaults: silentTiles + 2 tiles, longer than 2 s', () => {
    expect(VOICE_DEFAULTS.cullMarginTiles).toBe(2);
    expect(VOICE_DEFAULTS.cullDelayMs).toBe(2000);
  });

  it('never culls anyone within silentTiles + margin, however long', () => {
    const s = run([0, SILENT - 1, SILENT, SILENT + T, FAR].map((d, i) => [d, i * 10_000] as [number, number]));
    expect(s.every((x) => !x.culled && x.farSince === null)).toBe(true);
  });

  it('culls only after being beyond the margin for MORE than the delay', () => {
    const s = run([
      [FAR + 1, 1000],
      [FAR + 50, 2000],
      [FAR + 50, 3000], // exactly 2 s: not yet
      [FAR + 50, 3001],
    ]);
    expect(s.map((x) => x.culled)).toEqual([false, false, false, true]);
    expect(s[0]!.farSince).toBe(1000);
    expect(s[2]!.farSince).toBe(1000);
  });

  it('coming back inside the margin before the delay resets the timer', () => {
    const s = run([
      [FAR + 1, 0],
      [FAR + 1, 1900],
      [FAR - 1, 1950], // back within silent + 2 tiles
      [FAR + 1, 2100],
      [FAR + 1, 4000],
      [FAR + 1, 4101],
    ]);
    expect(s.map((x) => x.culled)).toEqual([false, false, false, false, false, true]);
    expect(s[2]).toEqual(CULL_INITIAL);
    expect(s[3]!.farSince).toBe(2100);
  });

  it('hysteresis: a culled talker stays culled in the band [silentTiles, silentTiles + margin]', () => {
    const culled = run([
      [FAR + 1, 0],
      [FAR + 1, 2500],
    ]).at(-1)!;
    expect(culled.culled).toBe(true);
    const s = run(
      [
        [FAR, 3000],
        [SILENT + T, 4000],
        [SILENT, 5000], // exactly at the audible radius: gain is 0 there, still culled
      ],
      culled,
    );
    expect(s.every((x) => x.culled)).toBe(true);
  });

  it('resubscribes as soon as the talker is within silentTiles (gain still ~0 there)', () => {
    const culled: CullState = { culled: true, farSince: 0 };
    expect(cullStep(culled, SILENT - 0.5, 10_000)).toEqual(CULL_INITIAL);
    expect(cullStep(culled, 0, 10_000)).toEqual(CULL_INITIAL);
  });

  it('unknown position / not outdoors (Infinity or NaN) counts as far', () => {
    const s = run([
      [Infinity, 0],
      [Number.NaN, 1000],
      [Infinity, 2001],
    ]);
    expect(s.map((x) => x.culled)).toEqual([false, false, true]);
    // ...and a culled talker whose position is unknown stays culled
    expect(cullStep(s[2]!, Number.NaN, 9000).culled).toBe(true);
  });

  it('returns the same object when nothing changes (no map churn)', () => {
    expect(cullStep(CULL_INITIAL, 0, 0)).toBe(CULL_INITIAL);
    const c: CullState = { culled: true, farSince: 5 };
    expect(cullStep(c, FAR * 3, 99_999)).toBe(c);
  });

  it('honours custom options', () => {
    const o = { tileSize: 10, silentTiles: 5, marginTiles: 1, delayMs: 100 };
    let s = cullStep(CULL_INITIAL, 61, 0, o);
    expect(s.farSince).toBe(0);
    s = cullStep(s, 61, 101, o);
    expect(s.culled).toBe(true);
    expect(cullStep(s, 50, 200, o).culled).toBe(true);
    expect(cullStep(s, 49, 200, o).culled).toBe(false);
  });
});

const P = (o: Partial<ParticipantLike> = {}): ParticipantLike => ({ pid: 'a', speaking: false, gain: 1, volume: 1, micMuted: false, announce: false, ...o });

describe('sameParticipants / roundGain (change-only panel patches)', () => {
  it('rounds gains to 0.05 steps', () => {
    expect(roundGain(0)).toBe(0);
    expect(roundGain(0.024)).toBe(0);
    expect(roundGain(0.026)).toBe(0.05);
    expect(roundGain(0.51)).toBe(0.5);
    expect(roundGain(1)).toBe(1);
  });

  it('identical lists (and the same array) are equal', () => {
    const a = [P(), P({ pid: 'b', gain: 0.3 })];
    expect(sameParticipants(a, a)).toBe(true);
    expect(sameParticipants(a, [P(), P({ pid: 'b', gain: 0.3 })])).toBe(true);
    expect(sameParticipants([], [])).toBe(true);
  });

  it('gain jitter below a 0.05 step is not a change; crossing a step is', () => {
    expect(sameParticipants([P({ gain: 0.4 })], [P({ gain: 0.42 })])).toBe(true);
    expect(sameParticipants([P({ gain: 0.42 })], [P({ gain: 0.48 })])).toBe(false);
    expect(sameParticipants([P({ gain: 0 })], [P({ gain: 0.02 })])).toBe(true);
  });

  it('every other field, order and length are changes', () => {
    const base = [P(), P({ pid: 'b' })];
    expect(sameParticipants(base, [P({ speaking: true }), P({ pid: 'b' })])).toBe(false);
    expect(sameParticipants(base, [P({ volume: 0.5 }), P({ pid: 'b' })])).toBe(false);
    expect(sameParticipants(base, [P({ micMuted: true }), P({ pid: 'b' })])).toBe(false);
    expect(sameParticipants(base, [P({ announce: true }), P({ pid: 'b' })])).toBe(false);
    expect(sameParticipants(base, [P({ pid: 'b' }), P()])).toBe(false);
    expect(sameParticipants(base, [P()])).toBe(false);
  });
});

describe('lossStep (uplink loss -> RED)', () => {
  it('needs a previous sample and ignores counter resets', () => {
    expect(lossStep(LOSS_WINDOW_EMPTY, null, { packetsSent: 500, packetsLost: 50 })).toEqual({ win: LOSS_WINDOW_EMPTY, loss: null });
    expect(lossStep(LOSS_WINDOW_EMPTY, { packetsSent: 900 }, { packetsSent: 10 }).loss).toBeNull();
    expect(lossStep(LOSS_WINDOW_EMPTY, { packetsSent: 1 }, {}).loss).toBeNull();
  });

  it('accumulates until enough packets were sent (DTX / push-to-talk send few)', () => {
    let win = LOSS_WINDOW_EMPTY;
    let prev = { packetsSent: 0, packetsLost: 0 };
    const verdicts: (number | null)[] = [];
    for (let i = 1; i <= 6; i++) {
      const cur = { packetsSent: i * 50, packetsLost: i * 5 }; // 10 % loss, 50 packets per sample
      const r = lossStep(win, prev, cur);
      win = r.win;
      prev = cur;
      verdicts.push(r.loss);
    }
    expect(LOSS_MIN_PACKETS).toBe(250);
    expect(verdicts.slice(0, 4)).toEqual([null, null, null, null]);
    expect(verdicts[4]).toBeCloseTo(0.1);
    expect(win).toEqual({ sent: 50, lost: 5 }); // window restarted after the verdict
  });

  it('threshold is 2 %: 1 % keeps RED off, 3 % turns it on', () => {
    const low = lossStep(LOSS_WINDOW_EMPTY, { packetsSent: 0, packetsLost: 0 }, { packetsSent: 300, packetsLost: 3 });
    const high = lossStep(LOSS_WINDOW_EMPTY, { packetsSent: 0, packetsLost: 0 }, { packetsSent: 300, packetsLost: 9 });
    expect(low.loss! <= RED_LOSS_THRESHOLD).toBe(true);
    expect(high.loss! > RED_LOSS_THRESHOLD).toBe(true);
  });
});
