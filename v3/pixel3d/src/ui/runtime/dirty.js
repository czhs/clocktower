// Dirty-band images + uploads (src/ui/runtime; density round: moved here unchanged from runtime/layer.js so the D=2
// tiers of src/ui/hd/layers.js share them). A trackedImage records, per band of BAND rows, the x extent it was drawn
// into this frame; makeUploader uploads only the runs of bands drawn last frame or this frame (texSubImage2D), and
// clearBands clears only what the last frame drew.
import { PixelImage } from '../kit.js';

/**
 * A PixelImage that records where it was drawn this frame, per band of BAND rows: bx0[b]..bx1[b] (inclusive; bx1 < bx0
 * = nothing in that band). set() marks its pixel; img.mark(x0, y0, x1, y1) marks a rectangle (direct writers into
 * img.data, e.g. a fast sprite blit, must call it). img.dirty = the overall box (kept for callers that read it).
 */
export const BAND = 8;
export function trackedImage(w, h) {
  const img = new PixelImage(w, h);
  const nb = Math.ceil(h / BAND);
  const bx0 = new Int16Array(nb).fill(w), bx1 = new Int16Array(nb).fill(-1);
  const d = { x0: w, y0: h, x1: -1, y1: -1 };
  const set = PixelImage.prototype.set;
  img.dirty = d; img.bx0 = bx0; img.bx1 = bx1; img.bands = nb;
  img.mark = (x0, y0, x1, y1) => {
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= w) x1 = w - 1; if (y1 >= h) y1 = h - 1;
    if (x1 < x0 || y1 < y0) return;
    for (let b = y0 >> 3, e = y1 >> 3; b <= e; b++) { if (x0 < bx0[b]) bx0[b] = x0; if (x1 > bx1[b]) bx1[b] = x1; }
    if (x0 < d.x0) d.x0 = x0; if (x1 > d.x1) d.x1 = x1; if (y0 < d.y0) d.y0 = y0; if (y1 > d.y1) d.y1 = y1;
  };
  img.set = function (x, y, c) {
    x |= 0; y |= 0;
    if (x >= 0 && y >= 0 && x < w && y < h) {
      const b = y >> 3;
      if (x < bx0[b]) bx0[b] = x; if (x > bx1[b]) bx1[b] = x;
      if (x < d.x0) d.x0 = x; if (x > d.x1) d.x1 = x; if (y < d.y0) d.y0 = y; if (y > d.y1) d.y1 = y;
    }
    return set.call(this, x, y, c);
  };
  /** Snapshot of this frame's bands (the next frame clears + re-uploads them). */
  img.snapshot = () => ({ bx0: bx0.slice(), bx1: bx1.slice() });
  img.resetDirty = () => { bx0.fill(w); bx1.fill(-1); d.x0 = w; d.y0 = h; d.x1 = -1; d.y1 = -1; };
  /** Clear what a snapshot marked (band rows x its extent). extra = parallel arrays to clear too ([array, value, ch]). */
  img.clearBands = (snap, extra = null) => {
    for (let b = 0; b < nb; b++) {
      const x0 = snap.bx0[b], x1 = snap.bx1[b];
      if (x1 < x0) continue;
      const row = (x1 - x0 + 1) * 4;
      for (let y = b * BAND, ye = Math.min(h, y + BAND); y < ye; y++) {
        const i = (y * w + x0) * 4; img.data.fill(0, i, i + row);
        if (extra) for (const [arr, v] of extra) arr.fill(v, y * w + x0, y * w + x1 + 1);
      }
    }
  };
  return img;
}

/**
 * The band uploader of one (renderer, stats): upload(img, tex, fresh, extra?) uploads, per run of consecutive bands
 * drawn last frame or this frame, ONE texSubImage2D of the run's rows x the union of their x extents (the whole image
 * when the texture is fresh). Raw GL on purpose: renderer.copyTextureToTexture reads 5 pixel-store parameters back
 * (gl.getParameter = a synchronous round trip to the GPU process each), which cost more than the upload it saves. The
 * texture is bound through three's state cache (state.bindTexture); the unpack state is left at three's defaults
 * (ROW_LENGTH / SKIP_* 0; three sets FLIP_Y / PREMULTIPLY / ALIGNMENT itself before its uploads).
 * extra = [{tex, data (Float32Array w*h), format: gl.RED, type: gl.FLOAT}] = parallel single-channel textures of the same
 * size uploaded over the same rects (the D=2 depth tier).
 */
export function makeUploader(engine, stats = { uploads: 0, uploadPx: 0 }) {
  const prev = new Map();   // image -> last frame's band snapshot
  const upload = (img, tex, fresh = false, extra = null) => {
    const a = prev.get(img);
    const snap = img.snapshot();
    prev.set(img, snap);
    const r = engine.renderer, props = r.properties.get(tex);
    const exProps = extra?.map((e) => r.properties.get(e.tex)) ?? [];
    if (fresh || !a || !props.__webglInit || !props.__webglTexture || exProps.some((p) => !p.__webglTexture)) {
      tex.needsUpdate = true;
      if (extra) for (const e of extra) e.tex.needsUpdate = true;
      return;
    }
    const gl = r.getContext();
    let bound = false, b = 0;
    const nb = img.bands;
    const rects = [];
    while (b < nb) {
      const e0 = (k) => Math.min(a.bx0[k], snap.bx0[k]), e1 = (k) => Math.max(a.bx1[k], snap.bx1[k]);
      if (e1(b) < e0(b)) { b++; continue; }
      let x0 = e0(b), x1 = e1(b), end = b;
      while (end + 1 < nb && e1(end + 1) >= e0(end + 1)) { end++; x0 = Math.min(x0, e0(end)); x1 = Math.max(x1, e1(end)); }
      const y0 = b * BAND, y1 = Math.min(img.h - 1, end * BAND + BAND - 1);
      rects.push([x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
      b = end + 1;
    }
    const send = (texture, data, format, type, align) => {
      r.state.activeTexture(gl.TEXTURE0);
      r.state.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, align);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, img.w);
      for (const [x0, y0, w, h] of rects) {
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, format, type, data);
        stats.uploads++; stats.uploadPx += w * h;
      }
      bound = true;
    };
    if (rects.length) {
      send(props.__webglTexture, img.data, gl.RGBA, gl.UNSIGNED_BYTE, 4);
      if (extra) extra.forEach((e, i) => send(exProps[i].__webglTexture, e.data, e.format ?? gl.RED, e.type ?? gl.FLOAT, 4));
    }
    if (bound) { gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); }
  };
  upload.prev = prev;
  return upload;
}
