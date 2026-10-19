// v3 WP4 (v3-overlay). The baked v3 UI atlases the overlay draws from (v3/assets/ui, read-only vendor output):
//
//   indicators(-night)  labels, talk glyph / ring, bubble 9-slice + tail, own-seat / guide / door markers,
//                       board tokens, off-screen markers
//   markers(-night)     pins, pin shadow + drop, pointing hands, ping, trail dots
//   events(-night)      poof, seat markers, raised / locked vote hands
//   portraits(-night)   icon_<castId>[/ghost] (pin and board-token faces)
//   kit.json            meta.tokens day / golden / night colours
//
// Loading follows §5: the PNGs and JSONs are referenced with `?url` and fetched at mount, so no JSON is
// inlined into any chunk (this module only lives in the lazy town3d chunk anyway). Until an image has
// decoded, frame() returns null and the callers draw nothing (or a plain fallback); `onReady` re-renders.
//
// CONTRACT-REQUEST(WP6): when ui/common/v3atlas.ts lands, this loader can delegate to it (same sheets and
// night variants); it is kept local so WP4 does not depend on an in-flight package.
import indicatorsPng from '@v3assets/indicators.png?url';
import indicatorsJson from '@v3assets/indicators.json?url';
import indicatorsNightPng from '@v3assets/indicators-night.png?url';
import indicatorsNightJson from '@v3assets/indicators-night.json?url';
import markersPng from '@v3assets/markers.png?url';
import markersJson from '@v3assets/markers.json?url';
import markersNightPng from '@v3assets/markers-night.png?url';
import markersNightJson from '@v3assets/markers-night.json?url';
import eventsPng from '@v3assets/events.png?url';
import eventsJson from '@v3assets/events.json?url';
import eventsNightPng from '@v3assets/events-night.png?url';
import eventsNightJson from '@v3assets/events-night.json?url';
import portraitsPng from '@v3assets/portraits.png?url';
import portraitsJson from '@v3assets/portraits.json?url';
import portraitsNightPng from '@v3assets/portraits-night.png?url';
import portraitsNightJson from '@v3assets/portraits-night.json?url';
import kitJson from '@v3assets/kit.json?url';

export type SheetName = 'indicators' | 'markers' | 'events' | 'portraits';
export type Tod = 'day' | 'golden' | 'night';

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Frame extends FrameRect {
  img: CanvasImageSource;
}
interface SheetJson {
  frames: Record<string, FrameRect>;
  meta?: Record<string, unknown>;
}
interface Sheet {
  json: SheetJson | null;
  img: HTMLImageElement | null;
}

const SOURCES: Record<SheetName, { day: [string, string]; night: [string, string] }> = {
  indicators: { day: [indicatorsPng, indicatorsJson], night: [indicatorsNightPng, indicatorsNightJson] },
  markers: { day: [markersPng, markersJson], night: [markersNightPng, markersNightJson] },
  events: { day: [eventsPng, eventsJson], night: [eventsNightPng, eventsNightJson] },
  portraits: { day: [portraitsPng, portraitsJson], night: [portraitsNightPng, portraitsNightJson] },
};

/** §5 hour rule (same as the tokens): night from 19:45 until 06:15. */
export const isNightHour = (hour: number): boolean => hour >= 19.75 || hour < 6.25;
/** §5 item 3: day < 16:00, golden < 19:45, else night (and night until 06:15). */
export function todOf(hour: number): Tod {
  if (isNightHour(hour)) return 'night';
  return hour < 16 ? 'day' : 'golden';
}

/** The kit colour tokens the overlay uses (kit.json meta.tokens), with the v2 palette as the fallback. */
export interface Tokens {
  labelText: string;
  labelLine: string;
  st: string;
  ghost: string;
  ghostSh: string;
  text: string;
  textDim: string;
  ink: string;
  outline: string;
  bubble: string;
  bubbleEdge: string;
  bubbleHi: string;
  shadow: string;
  gold: string;
  goldLine: string;
  parchment: string;
  parchmentLine: string;
  textInk: string;
  talk: string;
  self: string;
}
export const FALLBACK_TOKENS: Tokens = {
  labelText: '#efe6cf',
  labelLine: '#0b0812',
  st: '#e8c76a',
  ghost: '#cfe6ee',
  ghostSh: '#7fa6b8',
  text: '#e4d8ba',
  textDim: '#b9aebf',
  ink: '#211f2c',
  outline: '#1a1524',
  bubble: '#211f2c',
  bubbleEdge: '#8a7448',
  bubbleHi: '#343042',
  shadow: '#0b0812',
  gold: '#d5b56a',
  goldLine: '#5e4220',
  parchment: '#e4d8ba',
  parchmentLine: '#7c6546',
  textInk: '#2e2838',
  talk: '#ffe7a3',
  self: '#ff8f8a',
};

export interface Atlas {
  /** A frame of a sheet (the night variant when `night`), or null while loading / unknown. */
  frame(sheet: SheetName, name: string, night?: boolean): Frame | null;
  /**
   * A frame cropped into its own image, as a `data:` URL (CSP `img-src 'self' data: blob:`), for CSS
   * `border-image` / `background-image` (the DOM chat bubbles, D2). Made once per decoded frame (cached),
   * null while loading or where a 2D canvas cannot export (then the caller uses plain token colours).
   */
  url(sheet: SheetName, name: string, night?: boolean): string | null;
  /** A sheet's JSON `meta` (day variant), or null while loading. */
  meta(sheet: SheetName): Record<string, unknown> | null;
  tokens(tod: Tod): Tokens;
  /** All day sheets are decoded. */
  ready(): boolean;
  /** Called (once per decoded sheet) when more art became available. */
  onChange(fn: () => void): () => void;
  destroy(): void;
}

export function createAtlas(): Atlas {
  const sheets = new Map<string, Sheet>();
  const listeners = new Set<() => void>();
  let tokenSets: Partial<Record<Tod, Partial<Tokens>>> = {};
  let destroyed = false;
  /** Decoded frames per (sheet, night) and name: frame() hands out the same object every call. */
  const frameCache = new Map<string, Map<string, Frame>>();
  const notify = () => {
    frameCache.clear(); // a newly decoded sheet can replace a day fallback with its night frame
    if (destroyed) return;
    for (const fn of [...listeners]) fn();
  };

  const load = (key: string, png: string, json: string) => {
    const s: Sheet = { json: null, img: null };
    sheets.set(key, s);
    if (typeof fetch !== 'function' || typeof Image === 'undefined') return;
    fetch(json)
      .then((r) => (r.ok ? (r.json() as Promise<SheetJson>) : null))
      .then((j) => {
        if (!j || destroyed) return;
        s.json = j;
        if (s.img) notify();
      })
      .catch(() => undefined);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (destroyed) return;
      s.img = img;
      if (s.json) notify();
    };
    img.src = png;
  };
  for (const [name, src] of Object.entries(SOURCES) as [SheetName, (typeof SOURCES)[SheetName]][]) {
    load(name, ...src.day);
    load(`${name}-night`, ...src.night);
  }
  if (typeof fetch === 'function')
    fetch(kitJson)
      .then((r) => (r.ok ? (r.json() as Promise<{ meta?: { tokens?: Partial<Record<Tod, Partial<Tokens>>> } }>) : null))
      .then((j) => {
        if (!j?.meta?.tokens || destroyed) return;
        tokenSets = j.meta.tokens;
        tokenCache.clear();
        notify();
      })
      .catch(() => undefined);

  const tokenCache = new Map<Tod, Tokens>();
  /** Cropped frame images (data: URLs) by decoded Frame object (frame() hands out one object per frame). */
  const urls = new WeakMap<Frame, string | null>();
  let scratch: HTMLCanvasElement | null = null;
  const crop = (f: Frame): string | null => {
    if (typeof document === 'undefined') return null;
    scratch ??= document.createElement('canvas');
    if (typeof scratch.toDataURL !== 'function') return null;
    scratch.width = f.w;
    scratch.height = f.h;
    const ctx = scratch.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, f.w, f.h);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    try {
      return scratch.toDataURL('image/png');
    } catch {
      return null; // a tainted canvas (never for our same-origin sheets)
    }
  };
  const api: Atlas = {
    url(sheet, name, night = false) {
      const f = api.frame(sheet, name, night);
      if (!f) return null;
      let u = urls.get(f);
      if (u === undefined) {
        u = crop(f);
        urls.set(f, u);
      }
      return u;
    },
    frame(sheet, name, night = false) {
      const ck = night ? `${sheet}-night` : sheet;
      let byName = frameCache.get(ck);
      const hit = byName?.get(name);
      if (hit) return hit;
      const s = (night ? sheets.get(`${sheet}-night`) : null) ?? sheets.get(sheet);
      let f = s?.img && s.json ? s.json.frames[name] : undefined;
      let src = s;
      if (!f && night) {
        // a frame only the day sheet has
        src = sheets.get(sheet);
        f = src?.img && src.json ? src.json.frames[name] : undefined;
      }
      if (!f || !src?.img) return null;
      const out: Frame = { img: src.img, x: f.x, y: f.y, w: f.w, h: f.h };
      if (!byName) frameCache.set(ck, (byName = new Map()));
      byName.set(name, out);
      return out;
    },
    meta(sheet) {
      return sheets.get(sheet)?.json?.meta ?? null;
    },
    tokens(tod) {
      let t = tokenCache.get(tod);
      if (!t) {
        t = { ...FALLBACK_TOKENS, ...(tokenSets[tod] ?? {}) };
        tokenCache.set(tod, t);
      }
      return t;
    },
    ready() {
      for (const name of Object.keys(SOURCES)) {
        const s = sheets.get(name);
        if (!s?.img || !s.json) return false;
      }
      return true;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      frameCache.clear();
      for (const s of sheets.values()) {
        if (s.img) s.img.onload = null;
        s.img = null;
      }
      sheets.clear();
      scratch = null;
    },
  };
  return api;
}
