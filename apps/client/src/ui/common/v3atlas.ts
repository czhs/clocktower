// (v3 WP6, v3-ui) The v3 UI atlases and skin (LAZY chunk: only `import('./v3atlas')` from ./v3skin.ts, gated
// on a v3 lobby). docs/v3/INTEGRATION.md §5 items 1-4.
//
// Sources: the baked pixel3d UI library in v3/assets/ui (read-only vendor; `@v3assets/` alias), described by
// v3/pixel3d/docs/UI.md. PNG, JSON and the panel stylesheet are imported with `?url` and fetched on use, so no
// atlas manifest is inlined into any chunk:
//   emotes      emote_* (point, pins, pops)            no -night variant: the day sheet serves both
//   portraits   icon_<cast>, avatar_<cast> (+ /ghost, /ghost-spent, /dead)  + portraits-night
//   markers     pin_<color>, point_<dir>_<n>, ping_<n>  + markers-night
//   indicators  label_*, talk_*, bubble_nine/tail, you_*, guide_* (WP4's labels and bubbles) + indicators-night
//   kit.json    meta.tokens (day/golden/night colour tokens), meta.nineSlice (frame insets)
//   cast-portraits  the 'down' portrait strip that replaces packages/assets/generated/cast-portraits.* (§5.1)
//   panels.css  the vendor DOM panel skin for the v2 classes (.panel, .ct-modal, inputs, …; data: URIs only)
// `frame(name)` looks a frame up over emotes → portraits → markers → indicators (first wins; the names do not
// collide). Documented skips (no v3 art, by the vendor's decision): `nick_face`, `icon_nicksong`,
// `icon_brianbi` and the nicksong / brianbi portraits: callers keep the v2 art for exactly those.
//
// Skin: `skin(look)` maps the kit tokens onto the theme.css variables (`--bg`, `--panel`, … plus every token as
// `--v3-<token>`) through CSSOM on <html> (allowed by `style-src 'self'`; no new stylesheet in the cascade, so
// apps/client/build/cssOrder.ts is unchanged), sets the integer UI scale `--px`, and links panels.css.
// `unskin()` removes all of it.
import emotesPng from '@v3assets/emotes.png?url';
import emotesJson from '@v3assets/emotes.json?url';
import portraitsPng from '@v3assets/portraits.png?url';
import portraitsJson from '@v3assets/portraits.json?url';
import portraitsNightPng from '@v3assets/portraits-night.png?url';
import portraitsNightJson from '@v3assets/portraits-night.json?url';
import markersPng from '@v3assets/markers.png?url';
import markersJson from '@v3assets/markers.json?url';
import markersNightPng from '@v3assets/markers-night.png?url';
import markersNightJson from '@v3assets/markers-night.json?url';
import indicatorsPng from '@v3assets/indicators.png?url';
import indicatorsJson from '@v3assets/indicators.json?url';
import indicatorsNightPng from '@v3assets/indicators-night.png?url';
import indicatorsNightJson from '@v3assets/indicators-night.json?url';
import kitJson from '@v3assets/kit.json?url';
import castPortraitsPng from '@v3assets/cast-portraits.png?url';
import castPortraitsJson from '@v3assets/cast-portraits.json?url';
import type { SkinLook } from './v3skin';
import './v3portrait'; // installs the v3 portrait strip as castPortrait's source (this chunk only)

// The vendor panel skin is emitted as a raw asset (`new URL`), not through Vite's CSS pipeline: it is linked as-is
// in v3 lobbies only, and the published file has a stray `}` on its last line that postcss rejects (browsers
// ignore it). CONTRACT-REQUEST(pixel3d): drop the extra `}` after the reduced-motion block in panels.css.
// (`vite` dev transforms linked .css requests, so the panel skin does not apply under the dev server until then.)
const panelsCss = new URL('../../../../../v3/assets/ui/panels.css', import.meta.url).href;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AtlasJson {
  image?: string;
  width?: number;
  height?: number;
  frames: Record<string, Rect>;
  meta?: Record<string, unknown>;
}
/** One frame, ready for a CSS sprite (`background-position: -x -y; background-size: sheetW sheetH`). */
export interface AtlasFrame extends Rect {
  url: string;
  sheetW: number;
  sheetH: number;
  /** Which atlas it came from ('emotes', 'portraits-night', …). */
  atlas: string;
}
export interface AtlasSource {
  name: string;
  png: string;
  json: AtlasJson;
}

/** The v3 portrait strip (same shape as packages/assets/generated/cast-portraits.json, plus its meta). */
export interface V3CastStrip {
  url: string;
  frameWidth: number;
  frameHeight: number;
  dir: string;
  sheets: Record<string, { x: number; y: number; frames: number }>;
  /** ms per walk drawing (meta.walkStepMs, 67 = one game-speed cycle at 15 fps). */
  walkStepMs: number;
  /** Cast ids the strip deliberately lacks (meta.skipped: nicksong, brianbi): they keep the v2 portrait. */
  skipped: readonly string[];
}

export type Tokens = Record<string, string>;
export interface Inset {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Frame names with no v3 art by the vendor's decision (v3/pixel3d/docs/UI.md §5): callers keep the v2 art for
 * exactly these (the documented v2/v3 mixing). Mirrored by ui/social/PieMenu.tsx SKIPPED (a test keeps them equal). */
export const V3_SKIPPED_FRAMES: readonly string[] = ['nick_face', 'icon_nicksong', 'icon_brianbi'];
/** Lookup priority (day names; '-night' variants replace their day sheet when the night set is wanted). */
export const ATLAS_ORDER = ['emotes', 'portraits', 'markers', 'indicators'] as const;
export type AtlasName = (typeof ATLAS_ORDER)[number];
/** Atlases that ship a '-night' bake (emotes has none: its day sheet is used at night too). */
export const NIGHT_ATLASES: readonly AtlasName[] = ['portraits', 'markers', 'indicators'];

const sheetSize = (j: AtlasJson): { w: number; h: number } => {
  const fr = Object.values(j.frames);
  return {
    w: j.width ?? Math.max(1, ...fr.map((r) => r.x + r.w)),
    h: j.height ?? Math.max(1, ...fr.map((r) => r.y + r.h)),
  };
};

/** Name → frame over `sources` in order (the first atlas that has a name wins). Pure. */
export function buildIndex(sources: readonly AtlasSource[]): Map<string, AtlasFrame> {
  const out = new Map<string, AtlasFrame>();
  for (const s of sources) {
    const { w, h } = sheetSize(s.json);
    for (const [name, r] of Object.entries(s.json.frames)) {
      if (out.has(name)) continue;
      out.set(name, { x: r.x, y: r.y, w: r.w, h: r.h, url: s.png, sheetW: w, sheetH: h, atlas: s.name });
    }
  }
  return out;
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
function cssColor(v: unknown): string | null {
  if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) return v.toLowerCase();
  if (Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    const [r, g, b, a = 255] = v as number[];
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 1000) / 1000})`;
  }
  return null;
}

/** theme.css variable ← kit token (docs/v3/INTEGRATION.md §5.3; UI.md §2.7 "tokens map 1:1"). */
export const THEME_TOKEN_MAP: Readonly<Record<string, string>> = {
  '--bg': 'shadow',
  '--panel-solid': 'ink',
  '--panel-raised': 'inkRaised',
  '--panel-sunk': 'inkSunk',
  '--border': 'ironSh',
  '--border-strong': 'iron',
  '--text': 'text',
  '--muted': 'textDim',
  '--ink': 'textInk',
  '--parchment': 'parchment',
  '--accent': 'gold',
  '--accent-deep': 'goldLine',
  '--good': 'good',
  '--evil': 'evil',
  '--danger': 'danger',
  '--ok': 'ok',
};

/** The CSS custom properties for one token set: the theme.css variables plus `--v3-<token>` for every token. Pure. */
export function themeVars(tokens: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens)) {
    const c = cssColor(v);
    if (c) out[`--v3-${kebab(k)}`] = c;
  }
  for (const [cssVar, tok] of Object.entries(THEME_TOKEN_MAP)) {
    const c = cssColor(tokens[tok]);
    if (c) out[cssVar] = c;
  }
  // theme.css --panel is the ink at 96 % (#rrggbbf5)
  const ink = cssColor(tokens.ink);
  if (ink && /^#[0-9a-f]{6}$/.test(ink)) out['--panel'] = `${ink}f5`;
  return out;
}

/** Integer UI scale for the panel skin: 2 at 720p, 3 at 1080p (UI.md). */
export const uiScale = (cssHeight: number): number => (cssHeight >= 1000 ? 3 : 2);

// ------------------------------------------------------------------------------------ loading

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`v3 atlas ${r.status}`);
  return (await r.json()) as T;
}

const DAY: Record<AtlasName, { png: string; json: string }> = {
  emotes: { png: emotesPng, json: emotesJson },
  portraits: { png: portraitsPng, json: portraitsJson },
  markers: { png: markersPng, json: markersJson },
  indicators: { png: indicatorsPng, json: indicatorsJson },
};
const NIGHT: Partial<Record<AtlasName, { png: string; json: string }>> = {
  portraits: { png: portraitsNightPng, json: portraitsNightJson },
  markers: { png: markersNightPng, json: markersNightJson },
  indicators: { png: indicatorsNightPng, json: indicatorsNightJson },
};

export interface KitJson {
  meta?: { tokens?: Partial<Record<SkinLook, Record<string, unknown>>>; nineSlice?: Record<string, Partial<Inset>> };
}
interface CastStripJson {
  frameWidth?: number;
  frameHeight?: number;
  dir?: string;
  sheets?: V3CastStrip['sheets'];
  meta?: { walkStepMs?: number; skipped?: string[] };
}

/** The loaded state behind the `v3atlas` facade (exported for tests that feed it fixture JSON). */
export class AtlasStore {
  private day: Map<string, AtlasFrame> | null = null;
  private night: Map<string, AtlasFrame> | null = null;
  private kit: KitJson | null = null;
  private strip: V3CastStrip | null = null;
  private loading = new Map<'day' | 'night', Promise<boolean>>();

  /** Feed loaded data directly (tests; `load` uses it too). */
  setDay(sources: readonly AtlasSource[], kit: KitJson, strip: V3CastStrip | null): void {
    this.day = buildIndex(sources);
    this.kit = kit;
    this.strip = strip;
  }
  setNight(sources: readonly AtlasSource[]): void {
    this.night = buildIndex(sources);
  }
  dayReady(): boolean {
    return this.day !== null;
  }
  nightReady(): boolean {
    return this.night !== null;
  }

  /** Load the day set (and the night set when `night`); resolves true when this call added data. */
  ready(night = false): Promise<boolean> {
    const day = this.loadSet('day');
    return night ? Promise.all([day, day.then(() => this.loadSet('night'))]).then(([a, b]) => a || b) : day;
  }

  private loadSet(which: 'day' | 'night'): Promise<boolean> {
    if (which === 'day' ? this.day : this.night) return Promise.resolve(false);
    const hit = this.loading.get(which);
    if (hit) return hit.then(() => false);
    const p = (which === 'day' ? this.fetchDay() : this.fetchNight()).then(
      () => true,
      (e: unknown) => {
        console.warn(`[v3 skin] ${which} atlases failed`, e);
        this.loading.delete(which); // a later look change retries
        return false;
      },
    );
    this.loading.set(which, p);
    return p;
  }

  private async fetchDay(): Promise<void> {
    const [sheets, kit, strip] = await Promise.all([
      Promise.all(ATLAS_ORDER.map(async (name) => ({ name, png: DAY[name].png, json: await getJson<AtlasJson>(DAY[name].json) }))),
      getJson<KitJson>(kitJson),
      getJson<CastStripJson>(castPortraitsJson).then(
        (j) => stripFrom(j, castPortraitsPng),
        () => null, // portraits stay v2 rather than blank
      ),
    ]);
    this.setDay(sheets, kit, strip);
  }

  private async fetchNight(): Promise<void> {
    const sheets = await Promise.all(
      ATLAS_ORDER.map(async (name) => {
        const n = NIGHT[name];
        // emotes ships no night bake: its day sheet stands in, at the same lookup position
        if (!n) return { name, png: DAY[name].png, json: await getJson<AtlasJson>(DAY[name].json) };
        return { name: `${name}-night`, png: n.png, json: await getJson<AtlasJson>(n.json) };
      }),
    );
    this.setNight(sheets);
  }

  /** A frame by name (night: the -night bake when loaded, else the day one); null when no v3 atlas has it. */
  frame(name: string, night = false): AtlasFrame | null {
    return (night ? this.night?.get(name) : undefined) ?? this.day?.get(name) ?? null;
  }
  has(name: string): boolean {
    return this.frame(name) !== null;
  }
  /** Every frame name (day set). */
  names(): string[] {
    return this.day ? [...this.day.keys()] : [];
  }
  /** kit.json meta.tokens[look] (empty until loaded). */
  tokens(look: SkinLook): Tokens {
    const t = this.kit?.meta?.tokens?.[look] ?? this.kit?.meta?.tokens?.day ?? {};
    const out: Tokens = {};
    for (const [k, v] of Object.entries(t)) {
      const c = cssColor(v);
      if (c) out[k] = c;
    }
    return out;
  }
  /** kit.json meta.nineSlice[name] (e.g. 'frame_bubble' → 3/3/3/4). */
  inset(name: string): Inset | null {
    const n = this.kit?.meta?.nineSlice?.[name];
    return n && [n.l, n.t, n.r, n.b].every((v) => typeof v === 'number') ? { l: n.l!, t: n.t!, r: n.r!, b: n.b! } : null;
  }
  castStrip(): V3CastStrip | null {
    return this.strip;
  }
}

/** The portrait strip manifest from cast-portraits.json. Pure. */
export function stripFrom(j: CastStripJson, url: string): V3CastStrip | null {
  if (!j.sheets) return null;
  return {
    url,
    frameWidth: j.frameWidth ?? 32,
    frameHeight: j.frameHeight ?? 40,
    dir: j.dir ?? 'down',
    sheets: j.sheets,
    walkStepMs: typeof j.meta?.walkStepMs === 'number' && j.meta.walkStepMs > 0 ? j.meta.walkStepMs : 67,
    skipped: Array.isArray(j.meta?.skipped) ? j.meta.skipped.filter((s): s is string => typeof s === 'string') : [],
  };
}

// ------------------------------------------------------------------------------------ 9-slices (§5.4)

/** Indicator frames drawn as 9-slices, and the kit inset that describes them. */
const NINE_OF: Record<string, string> = { bubble_nine: 'frame_bubble' };
const sliceCache = new Map<string, Promise<string | null>>();

function cropToDataUrl(f: AtlasFrame): Promise<string | null> {
  const key = `${f.url}#${f.x},${f.y},${f.w},${f.h}`;
  const hit = sliceCache.get(key);
  if (hit) return hit;
  const p = new Promise<string | null>((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = f.w;
        c.height = f.h;
        const g = c.getContext('2d');
        if (!g) return resolve(null);
        g.imageSmoothingEnabled = false;
        g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = f.url;
  });
  sliceCache.set(key, p);
  return p;
}

/** CSSOM properties for an element framed by a 9-slice frame (e.g. 'bubble_nine') at UI scale `px`. */
export interface NineSliceStyle {
  borderStyle: 'solid';
  borderColor: 'transparent';
  borderWidth: string;
  borderImageSource: string;
  borderImageSlice: string;
  borderImageWidth: string;
  borderImageRepeat: 'stretch';
  imageRendering: 'pixelated';
}

// ------------------------------------------------------------------------------------ facade

const store = new AtlasStore();
let skinned: { vars: string[]; link: HTMLLinkElement | null; onResize: () => void } | null = null;

function panelsWanted(): boolean {
  try {
    return localStorage.getItem('ct.debug.v3panels') !== '0';
  } catch {
    return true;
  }
}

export const v3atlas = {
  ready: (night = false) => store.ready(night),
  /** The day set is loaded (frames, tokens, portrait strip). */
  loaded: () => store.dayReady(),
  frame: (name: string, night = false) => store.frame(name, night),
  has: (name: string) => store.has(name),
  names: () => store.names(),
  tokens: (look: SkinLook) => store.tokens(look),
  inset: (name: string) => store.inset(name),
  castStrip: () => store.castStrip(),

  /** A 9-slice frame as CSSOM properties (§5.4: bubble_nine with kit frame_bubble insets 3/3/3/4). */
  async nineSlice(name: string, px: number, night = false): Promise<NineSliceStyle | null> {
    await store.ready(night);
    const f = store.frame(name, night);
    const ins = store.inset(NINE_OF[name] ?? name) ?? store.inset('frame_panel');
    if (!f || !ins) return null;
    const url = await cropToDataUrl(f);
    if (!url) return null;
    const k = Math.max(1, Math.round(px));
    const w = `${ins.t * k}px ${ins.r * k}px ${ins.b * k}px ${ins.l * k}px`;
    return {
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderWidth: w,
      borderImageSource: `url("${url}")`,
      borderImageSlice: `${ins.t} ${ins.r} ${ins.b} ${ins.l} fill`,
      borderImageWidth: w,
      borderImageRepeat: 'stretch',
      imageRendering: 'pixelated',
    };
  },

  /** Apply the v3 skin for `look` (tokens → theme variables, --px, the panel skin). Idempotent. */
  skin(look: SkinLook): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const vars = themeVars(store.tokens(look));
    for (const v of skinned?.vars ?? []) if (!(v in vars)) root.style.removeProperty(v);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    if (!skinned) {
      const onResize = () => root.style.setProperty('--px', String(uiScale(window.innerHeight)));
      window.addEventListener('resize', onResize);
      let link: HTMLLinkElement | null = null;
      if (panelsWanted()) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = panelsCss;
        link.dataset.ctCss = 'v3-panels';
        document.head.appendChild(link); // after the theme: the vendor skin restyles the v2 classes
      }
      skinned = { vars: [], link, onResize };
      onResize();
    }
    skinned.vars = Object.keys(vars);
  },

  /** Remove everything `skin` added (leaving a v3 lobby). */
  unskin(): void {
    if (!skinned || typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const v of skinned.vars) root.style.removeProperty(v);
    root.style.removeProperty('--px');
    window.removeEventListener('resize', skinned.onResize);
    skinned.link?.remove();
    skinned = null;
  },
};

export type V3Atlas = typeof v3atlas;
