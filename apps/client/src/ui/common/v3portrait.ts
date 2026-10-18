// (v3 WP6, v3-ui) The v3 portrait strip as castPortrait's alternative source (docs/v3/INTEGRATION.md §5.1).
// Imported for its side effect by the lazy ./v3atlas.ts chunk, so it ships only to v3 lobbies.
//
// In a v3 lobby 'down' portraits come from v3/assets/ui/cast-portraits.* (same {dir, sheets} shape as the v2
// strip, loaded by the lazy v3atlas chunk), walking at its own cadence (meta.walkStepMs, 67 ms). The strip's
// documented skips (nicksong, brianbi) keep the v2 art; any other frame it lacks (another direction, a walk
// frame of an idle-only member, a memorial of a non-player) holds the v3 frame it has, never v2 art.
import { castSheetKey, setPortraitAlt, type CastPortraitOpts, type PortraitAlt } from './castPortrait';
import { v3AtlasNow, v3AtlasPending, v3Skin } from './v3skin';
import type { V3CastStrip } from './v3atlas';

let img: HTMLImageElement | null = null;
let imgUrl: string | null = null;
let imgLoad: Promise<HTMLImageElement | null> | null = null;

function load(strip: V3CastStrip): Promise<HTMLImageElement | null> {
  if (imgLoad && imgUrl === strip.url) return imgLoad;
  imgUrl = strip.url;
  if (typeof Image === 'undefined') return (imgLoad = Promise.resolve(null));
  return (imgLoad = new Promise((resolve) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => resolve((img = i));
    i.onerror = () => resolve(null);
    i.src = strip.url;
  }));
}

/** The strip that draws `id` now: v3 lobby, atlas loaded, not a documented skip. */
function stripFor(id: string): V3CastStrip | null {
  const s = v3AtlasNow()?.castStrip();
  return s && !s.skipped.includes(id) && s.sheets[id] ? s : null;
}

/** Which strip cell draws `id` with `opts` (pure over the manifest; tested). */
export function v3PortraitKey(s: Pick<V3CastStrip, 'sheets'>, id: string, opts: CastPortraitOpts): { key: string; f: number } {
  const key = [castSheetKey(id, opts.ghost, opts.dead), castSheetKey(id, opts.ghost), id].find((k) => s.sheets[k]) ?? id;
  const n = s.sheets[key]?.frames ?? 1;
  return { key, f: Math.min(n - 1, Math.max(0, Math.round(opts.frame ?? 0))) };
}

export const v3Portraits: PortraitAlt = {
  req(id, opts) {
    const s = stripFor(id);
    return s ? v3PortraitKey(s, id, opts) : null;
  },
  cell(key, f) {
    const s = v3AtlasNow()?.castStrip();
    const c = s?.sheets[key];
    if (!s || !c || !img || imgUrl !== s.url) return null;
    return { img, sx: c.x + f * s.frameWidth, sy: c.y, ix: c.x, iy: c.y };
  },
  load() {
    const s = v3AtlasNow()?.castStrip();
    return s ? load(s) : Promise.resolve(null);
  },
  pending: () => v3AtlasPending(),
  stepMs: (id) => stripFor(id)?.walkStepMs ?? 140,
};

setPortraitAlt(v3Portraits);
// skin on/off, look and atlas data changes repaint mounted portraits
let last = '';
v3Skin.subscribe((s) => {
  const k = `${s.on}|${s.rev}`;
  if (k === last) return;
  last = k;
  setPortraitAlt(v3Portraits);
});
