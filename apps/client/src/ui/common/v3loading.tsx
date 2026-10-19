// LEAD-OWNED (v3 WP8, "v3 loading screen + URL paths"; docs/v3/INTEGRATION.md §8). The v3 app's loading scene
// (only at `/`; the v2 app at /v2/ keeps the plain LoadingScreen): night over Hollowmere, the vote clock's face with
// its 15 seats lighting one by one as the town loads, two candles, a little procession of the cast walking in place,
// and a kit-styled caption with the step and a progress bar.
//
// Light by design (entry chunk; docs/v3 §7 budgets): DOM + CSS only (no canvas, no WebGL, no three.js: works on a
// CPU-only machine), two baked vendor sheets fetched only while it shows (`events-night.png` 17 KB, the same file
// the 3D overlay uses later; `cast-portraits.png`, the same file the v3 skin uses), frame rects copied from their
// JSON as constants (apps/client/test/ui.v3loading.test.ts keeps them equal to v3/assets/ui/*.json), the kit night
// tokens as CSS in ui/lobby/lobby.css (`.ct-v3load`). Text is rendered by Preact (escaped). Positions are set
// through CSSOM custom properties (allowed by `style-src 'self'`). The progress itself (`frac`, `label`) comes from
// the caller: main.tsx (boot), ui/lobby/JoinPreview.tsx (joining) and ui/common/townLoading.tsx (the town build,
// real progress from ./townLoad.ts).
import eventsPng from '@v3assets/events-night.png?url';
import castPng from '@v3assets/cast-portraits.png?url';

type Rect = readonly [x: number, y: number, w: number, h: number];

/** Frames of v3/assets/ui/events-night.json used here (x, y, w, h; sheet 256 × 274). */
export const EVENTS_SHEET = { w: 256, h: 274 } as const;
export const EVENT_FRAMES = {
  vc_face: [21, 95, 61, 61],
  vc_seat_idle: [83, 95, 11, 11],
  vc_seat_yes: [95, 95, 11, 11],
  vc_seat_current: [167, 95, 11, 11],
  emblem_start: [147, 239, 21, 21],
  candle_0: [69, 239, 7, 13], // candle_1 / candle_2 follow at +8 / +16 px (the flicker strip)
} as const satisfies Record<string, Rect>;
/** v3/assets/ui/cast-portraits.json: 648 × 452, 32 × 40 cells, idle + walk1..4 left to right from the sheet's x/y. */
export const CAST_SHEET = { w: 648, h: 452, cellW: 32, cellH: 40 } as const;
export const PARADE = {
  frog: [1, 1],
  fox: [323, 1],
  owl: [484, 1],
  mushroom: [162, 1],
  rabbit: [1, 83],
} as const satisfies Record<string, readonly [number, number]>;

/** The vote clock's 15 seats around the face (art px, top-left of each 11 × 11 seat; face centre 42.5, radius 37). */
export const SEATS: readonly (readonly [number, number])[] = Array.from({ length: 15 }, (_, k) => {
  const a = ((-90 + k * 24) * Math.PI) / 180;
  return [Math.round(42.5 + 37 * Math.cos(a) - 5.5), Math.round(42.5 + 37 * Math.sin(a) - 5.5)] as const;
});

/** Lit seats for a progress fraction (0..15; the next one is drawn as "current"). Pure. */
export const litSeats = (frac: number): number => Math.max(0, Math.min(15, Math.floor((Number.isFinite(frac) ? frac : 0) * 15 + 1e-9)));

/**
 * (WP8, user 2026-10-18: laptops first, phones not supported in v3.0) A phone / touch-first device: a coarse primary
 * pointer AND a small viewport (shorter side < 600 CSS px, so a touch laptop or a tablet in a big window is not
 * one). Only used to show PHONE_NOTE; nothing is blocked (phones may still play, or use /v2/).
 */
export function isPhoneLike(): boolean {
  try {
    return matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 600;
  } catch {
    return false;
  }
}
export const PHONE_NOTE = 'Hollowmere is built for laptops and desktops — phone support is coming in a later update.';

/** The small, non-blocking laptop-first note (null on a laptop / desktop). */
export function PhoneNote({ class: cls = '' }: { class?: string }) {
  if (!isPhoneLike()) return null;
  return (
    <p class={`ct-phone-note ${cls}`.trim()} role="note">
      {PHONE_NOTE}
    </p>
  );
}

type Css = Record<string, string | number>;
const frame = (r: Rect, x?: number, y?: number): Css => ({ '--fx': r[0], '--fy': r[1], '--fw': r[2], '--fh': r[3], ...(x === undefined ? {} : { '--x': x, '--y': y ?? 0 }) });

export interface V3LoadingProps {
  /** 0..1, real progress of what is loading. */
  frac: number;
  /** One line: what happens now ("Raising the cottages…"). */
  label: string;
  /** Optional second line (counts, the lobby's name). */
  detail?: string | null;
  /** The cast procession (off on the very first boot screen: one sheet less to fetch before sign-in). */
  parade?: boolean;
}

export function V3Loading({ frac, label, detail = null, parade = true }: V3LoadingProps) {
  const lit = litSeats(frac);
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <div class="ct-v3load" role="status" aria-live="polite" aria-busy="true" style={{ '--sheet': `url(${eventsPng})`, '--cast': `url(${castPng})` }}>
      <div class="ct-v3load-town" aria-hidden="true">
        <i class="ct-v3load-roof r1" />
        <i class="ct-v3load-roof r2" />
        <i class="ct-v3load-tower" />
        <i class="ct-v3load-roof r3" />
        <i class="ct-v3load-roof r4" />
      </div>
      <div class="ct-v3load-clock" aria-hidden="true">
        <i class="ct-v3s" style={frame(EVENT_FRAMES.vc_face, 12, 12)} />
        <i class="ct-v3s" style={frame(EVENT_FRAMES.emblem_start, 32, 32)} />
        {SEATS.map(([x, y], k) => (
          <i key={k} class={`ct-v3s${k === lit ? ' ct-v3load-next' : ''}`} style={frame(k < lit ? EVENT_FRAMES.vc_seat_yes : k === lit ? EVENT_FRAMES.vc_seat_current : EVENT_FRAMES.vc_seat_idle, x, y)} />
        ))}
        <i class="ct-v3s ct-v3load-candle" style={frame(EVENT_FRAMES.candle_0, -14, 66)} />
        <i class="ct-v3s ct-v3load-candle" style={frame(EVENT_FRAMES.candle_0, 93, 66)} />
      </div>
      {parade && (
        <div class="ct-v3load-parade" aria-hidden="true">
          {Object.entries(PARADE).map(([id, [x, y]]) => (
            <i key={id} class="ct-v3load-walker">
              <i style={{ '--fx': x, '--fy': y }} />
            </i>
          ))}
        </div>
      )}
      <div class="ct-v3load-caption">
        <span class="ct-v3load-title">Hollowmere</span>
        <span class="ct-v3load-label">{label}</span>
        {detail && <span class="ct-v3load-detail">{detail}</span>}
        <span class="ct-v3load-bar" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
      <PhoneNote class="ct-v3load-note" />
    </div>
  );
}
