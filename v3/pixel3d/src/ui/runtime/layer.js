// UI layers for a LIVE game page (src/ui/runtime, additive to the asset library; first user: the Hollowmere demo,
// src/demo/gameui.js). The same contract as src/ui/layer.js createUILayers (docs/UI.md §3.2: L.world / L.ground /
// L.screen PixelImages redrawn every frame by z-sorted callbacks, L.at / L.atScreen / L.onScreen / L.add / L.remove /
// L.tok / L.t / L.enabled / L.screenEnabled / L.setTod / L.MARGIN / L.pass, the 'ui-world' composite at order 300 and
// the screen overlay after the upscale; the same shaders, so the pixels are identical), minus the optional
// depth-tested tier (use src/ui/layer.js for that). What differs is the per-frame COST:
//   - every write into a layer image goes through PixelImage.set / erase (blit, rect, text ... all do), so each image
//     tracks the box it was drawn into this frame;
//   - per band of 8 rows, only what last frame drew is cleared (not the whole ~1 MB image), and only the runs of bands
//     drawn last frame or this frame are uploaded (one texSubImage2D per run), nothing when both frames are empty.
// The mock scenes keep src/ui/layer.js (they draw all over the frame; nothing to gain there).
// Measured in the demo (render-host, 1280 x 720, labels + HUD + dock): docs/DEMO.md §4.7.
import * as THREE from 'three';
import { MARGIN } from '../../core/PixelCamera.js';
import { PixelImage, tokens } from '../kit.js';
import { attachHD } from '../hd/layers.js';

const SRGB_GLSL = /* glsl */`
vec3 uiSrgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }`;

/**
 * A PixelImage that records where it was drawn this frame, per band of BAND rows: bx0[b]..bx1[b] (inclusive; bx1 < bx0
 * = nothing in that band). set() marks its pixel; img.mark(x0, y0, x1, y1) marks a rectangle (direct writers into
 * img.data, e.g. a fast sprite blit, must call it). img.dirty = the overall box (kept for callers that read it).
 */
export const BAND = 8;
function trackedImage(w, h) {
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
  /** Clear what a snapshot marked (band rows x its extent). */
  img.clearBands = (snap) => {
    for (let b = 0; b < nb; b++) {
      const x0 = snap.bx0[b], x1 = snap.bx1[b];
      if (x1 < x0) continue;
      const row = (x1 - x0 + 1) * 4;
      for (let y = b * BAND, ye = Math.min(h, y + BAND); y < ye; y++) { const i = (y * w + x0) * 4; img.data.fill(0, i, i + row); }
    }
  };
  return img;
}

export function createUILayers(engine, { order = 300, tod = null, timeFn = null, density = null, policy = null, screenTier = null } = {}) {
  // (density round, opt-in) { density: 2 } or ?uidensity=2 attaches L.hd (src/ui/hd/layers.js, docs/UI.md "Density");
  // screenTier 'hd' (?uiscreen=hd) makes L.screen the D=2 screen view (as src/ui/layer.js; direct .data writers: use
  // view.base at HD px)
  density ??= Number(engine.params?.get?.('uidensity') || 1);
  policy ??= engine.params?.get?.('uipolicy') || 'round';
  if (/^\d+$/.test(String(policy))) policy = Number(policy);
  const hdScreen = density > 1 && (screenTier ?? engine.params?.get?.('uiscreen')) === 'hd';
  const fns = [];
  let world = null, ground = null, screen = null, texW = null, texG = null, texS = null, fresh = true;
  const prev = new Map();   // image -> last frame's box
  const stats = { uploads: 0, uploadPx: 0, frames: 0 };
  const _tmp = new THREE.Vector3();
  const L = {
    engine, MARGIN, enabled: true, screenEnabled: true, stats,
    get world() { return world; }, get ground() { return ground; }, get screen() { return hdScreen && L.hd ? L.hd.screenView : screen; },
    tok: tokens(tod || engine.style?.timeOfDay || 'noon'),
    t: 0,
    /** Integer pixel (x right, y down) of world point p in L.world (identical to src/ui/layer.js). */
    at(p) {
      const cam = engine.camera;
      cam.snapWorld(p, _tmp);
      const t = cam.texelWorld, R = cam.right, U = cam.up, T = cam.target;
      const cx = Math.round(T.dot(R) / t) * t, cy = Math.round(T.dot(U) / t) * t;
      return { x: Math.floor((p.dot(R) - cx) / t + engine.lowW / 2 + MARGIN), y: Math.floor(engine.lowH / 2 + MARGIN - (p.dot(U) - cy) / t) };
    },
    atScreen(p) {
      if (hdScreen && L.hd) { const q = L.hd.atScreen(p); return { x: Math.floor(q.x / L.hd.d), y: Math.floor(q.y / L.hd.d) }; }
      const q = L.at(p); return { x: q.x - MARGIN, y: q.y - MARGIN };
    },
    onScreen(x, y, m = 0) { const w = hdScreen && L.hd ? L.screen.w : engine.lowW, h = hdScreen && L.hd ? L.screen.h : engine.lowH; return x >= m && y >= m && x < w - m && y < h - m; },
    add(fn, z = 0) { fns.push({ fn, z }); fns.sort((a, b) => a.z - b.z); return fn; },
    remove(fn) { const i = fns.findIndex((f) => f.fn === fn); if (i >= 0) fns.splice(i, 1); },
    setTod(name) { L.tok = tokens(name); },
    useDepth() { throw new Error('runtime/layer.js: no depth-tested tier (use src/ui/layer.js)'); },
  };

  const ensure = () => {
    const W = engine.lowW + 2 * MARGIN, H = engine.lowH + 2 * MARGIN;
    if (world && world.w === W && world.h === H) return;
    world = trackedImage(W, H); ground = trackedImage(W, H); screen = trackedImage(engine.lowW, engine.lowH);
    texW?.dispose(); texG?.dispose(); texS?.dispose();
    const mk = (img) => {
      const t = new THREE.DataTexture(img.data, img.w, img.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
      t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      return t;
    };
    texW = mk(world); texG = mk(ground); texS = mk(screen);
    passU.tUIWorld.value = texW; passU.tUIGround.value = texG;
    overlayMat.uniforms.tUI.value = texS;
    overlayMat.uniforms.uSize.value.set(screen.w, screen.h);
    prev.clear(); fresh = true;
  };

  /**
   * Upload what changed: per run of consecutive bands drawn last frame or this frame, ONE texSubImage2D of the run's
   * rows x the union of their x extents (a HUD along the top and the bottom edge is two small uploads, not the frame);
   * the whole image on a fresh texture. Raw GL on purpose: renderer.copyTextureToTexture reads 5 pixel-store
   * parameters back (gl.getParameter = a synchronous round trip to the GPU process each), which cost more than the
   * upload it saves. The texture is bound through three's state cache (state.bindTexture); the unpack state is left at
   * three's defaults (ROW_LENGTH / SKIP_* 0; three sets FLIP_Y / PREMULTIPLY / ALIGNMENT itself before its uploads).
   */
  const upload = (img, tex) => {
    const a = prev.get(img);
    const snap = img.snapshot();
    prev.set(img, snap);
    const r = engine.renderer, props = r.properties.get(tex);
    if (fresh || !a || !props.__webglInit || !props.__webglTexture) { tex.needsUpdate = true; return; }
    const gl = r.getContext();
    let bound = false, b = 0;
    const nb = img.bands;
    while (b < nb) {
      const e0 = (k) => Math.min(a.bx0[k], snap.bx0[k]), e1 = (k) => Math.max(a.bx1[k], snap.bx1[k]);
      if (e1(b) < e0(b)) { b++; continue; }
      let x0 = e0(b), x1 = e1(b), end = b;
      while (end + 1 < nb && e1(end + 1) >= e0(end + 1)) { end++; x0 = Math.min(x0, e0(end)); x1 = Math.max(x1, e1(end)); }
      const y0 = b * BAND, y1 = Math.min(img.h - 1, end * BAND + BAND - 1), w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (!bound) {
        r.state.activeTexture(gl.TEXTURE0);
        r.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, img.w);
        bound = true;
      }
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
      stats.uploads++; stats.uploadPx += w * h;
      b = end + 1;
    }
    if (bound) { gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); }
  };

  const redraw = () => {
    ensure();
    for (const img of [world, ground, screen]) { const p = prev.get(img); if (p) img.clearBands(p); else img.clear(); img.resetDirty(); }
    L.t = timeFn ? timeFn(engine.time ?? 0) : engine.time ?? 0;
    L.hd?.begin();
    if (L.enabled) for (const { fn } of fns) fn(L);
    upload(world, texW); upload(ground, texG); upload(screen, texS);
    L.hd?.end();
    fresh = false;
    stats.frames++;
  };

  // --- tier A: composite pass in the low-res chain (the shader of src/ui/layer.js)
  const passU = { tUIWorld: { value: null }, tUIGround: { value: null } };
  const pass = engine.pipeline.addPass({
    name: 'ui-world', order,
    update: () => redraw(),
    material: engine.pipeline.makeLowresMaterial({
      uniforms: passU,
      fragment: /* glsl */`
        uniform sampler2D tUIWorld, tUIGround;
        ${SRGB_GLSL}
        void main() {
          vec4 s = texture2D(tColor, vUv);
          vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
          vec3 c = s.rgb;
          vec4 g = texture2D(tUIGround, uv);
          if (g.a > 0.0 && abs(flagAt(vUv) - FLAG_CHAR) >= 0.08) c = mix(c, uiSrgbToLin(g.rgb), g.a);
          vec4 u = texture2D(tUIWorld, uv);
          gl_FragColor = vec4(mix(c, uiSrgbToLin(u.rgb), u.a), s.a);
        }`,
    }),
  });

  // --- tier S: overlay after the upscale
  const overlayMat = new THREE.ShaderMaterial({
    uniforms: { tUI: { value: null }, uSize: { value: new THREE.Vector2(1, 1) }, uScale: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tUI; uniform vec2 uSize; uniform float uScale;
      void main() {
        vec2 s = floor(gl_FragCoord.xy / uScale);
        vec2 tc = vec2(s.x, uSize.y - 1.0 - s.y);
        vec4 u = texture2D(tUI, (tc + 0.5) / uSize);
        if (u.a <= 0.0) discard;
        gl_FragColor = u;
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending,
  });
  const overlayScene = new THREE.Scene();
  overlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMat));
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pipeline = engine.pipeline;
  const render0 = pipeline.render.bind(pipeline);
  pipeline.render = function renderWithUI() {
    render0();
    if (!L.enabled || !pass.enabled) return;
    const r = engine.renderer;
    L.hd?.renderWorld(r);                       // (density) A-HD over the scene + L.world, under the screen tier
    if (!L.screenEnabled || !screen) return;
    overlayMat.uniforms.uScale.value = engine.pixelScale;
    r.setRenderTarget(null);
    const ac = r.autoClear; r.autoClear = false;
    r.render(overlayScene, overlayCam);
    r.autoClear = ac;
    L.hd?.renderScreen(r);                      // (density) S-HD over the 1x screen tier
  };
  L.pass = pass;
  if (density > 1) L.hd = attachHD(L, engine, { density, policy, getWorldTex: () => texW });
  return L;
}
