// UI DENSITY tiers (owner: UI lead; docs/UI.md "Density"). Opt-in: createUILayers(engine, { density: 2 }) (both
// src/ui/layer.js and src/ui/runtime/layer.js) or ?uidensity=2 on any page, attaches L.hd. Nothing else changes:
// L.world / L.ground / L.screen keep 1 UI px = 1 scene texel, every existing draw keeps its size and place.
//
// L.hd adds images whose pixels are SMALLER than a scene texel, composited after the upscale:
//   L.hd.screen  tier S-HD: the canvas in HD px (ceil(canvas / L.hd.scale)), drawn over L.screen.
//   L.hd.world   tier A-HD: the padded low-res frame in HD px, anchored to the scene exactly like L.world (it rides
//                the camera's sub-texel offset in whole device px), drawn over the scene + L.world, under L.screen.
//   L.hd.useDepth() / L.hd.putDepth(src, x, y, d[, k])   tier A-HD depth-tested (upright world sprites: place pins):
//                hidden where the scene is nearer than d - L.hd.depthEps, under L.hd.world and under every L.world
//                texel (labels stay on top, as markers/pinPass.js).
// Views (kit densityView): L.hd.screenView / L.hd.worldView draw any 1x art function at the same on-screen size with
// the D=2 faces / frames / HD sprites (kit DensityView). Logical view px = HD px / L.hd.d.
//
// Scale rule (device px per HD px): L.hd.scale = max(1, round(pixelScale / D)) (policy 'round', default; 'floor' |
// 'ceil' | a number). Art density L.hd.d = D when pixelScale / scale >= 1.5, else 1 (pixelScale 1: phones / small
// windows draw the 1x art, the HD tiers are 1x-sized). L.hd.k = pixelScale / scale = HD px per scene texel.
//   pixelScale 2 (720p): scale 1, k 2 -> exact: 1 HD px = 1 device px, logical px = 1 texel.
//   pixelScale 3 (1080p): 'round' -> scale 2, k 1.5: HD art is 4/3 the size of the 1x art (logical px = 4 device px vs
//   a 3-px texel); 'floor' -> scale 1, k 3: 2/3 the size (logical px = 2 device px). Both stay integer and crisp.
//   pixelScale 4: scale 2, k 2 (exact). 5: scale 3 (k 1.67) / floor 2 (k 2.5).
// Coordinates: L.hd.at(p) = HD world px of world point p (the scene texel's top-left, so HD anchors step with the 1x
// world); L.hd.atScreen(p) = HD screen px; L.hd.from1x(x, y) / to1x(hx, hy) = 1x screen <-> HD screen; fromClient(cx, cy)
// = HD screen px under a pointer (same bottom-left anchoring as the 1x overlay); logical(cx, cy) = view px.
// Cost: the HD images are dirty-band tracked (runtime/dirty.js): only drawn bands are cleared and uploaded. Two extra
// device-res overlay draws (fullscreen quads, discard where empty), one more with the depth tier.
import * as THREE from 'three';
import { MARGIN } from '../../core/PixelCamera.js';
import { DensityView, dissolve as dissolveImg } from '../kit.js';
import { trackedImage, makeUploader } from '../runtime/dirty.js';

/** Device px per HD px for a pixel scale and density (see the header). */
export function hdScaleFor(pixelScale, D = 2, policy = 'round') {
  if (typeof policy === 'number') return Math.max(1, policy | 0);
  const r = pixelScale / D;
  return Math.max(1, policy === 'floor' ? Math.floor(r) : policy === 'ceil' ? Math.ceil(r) : Math.floor(r + 0.5));
}

const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * Attach the D=2 tiers to a layer object L (called by createUILayers when density > 1). opts: density (2), policy
 * ('round'), world (true: L.hd.world), getWorldTex (() => L.world's texture, for the depth tier's label mask).
 * Returns L.hd; the layer calls L.hd.begin() before its draw callbacks, L.hd.end() after, and L.hd.renderWorld(r) /
 * L.hd.renderScreen(r) around its own screen overlay.
 */
export function attachHD(L, engine, { density = 2, policy = 'round', world = true, getWorldTex = null } = {}) {
  const stats = { uploads: 0, uploadPx: 0, frames: 0 };
  const upload = makeUploader(engine, stats);
  const _p = new THREE.Vector3(), _v = new THREE.Vector3();
  let screen = null, wimg = null, texS = null, texW = null, fresh = true, screenView = null, worldView = null;
  let dimg = null, ddepth = null, texDC = null, texDD = null, dany = false, depthOn = false;
  const H = {
    D: density, d: density, scale: 1, k: 1, policy, stats, enabled: true, screenEnabled: true, worldEnabled: true,
    depthEps: 0.25,
    get screen() { return screen; }, get world() { return wimg; }, get depthWorld() { return dimg; },
    get screenView() { return screenView; }, get worldView() { return worldView; },
    /** A density view onto any HD image (pieces you cache): kit densityView(img, L.hd.d). */
    view: (img, ox = 0, oy = 0) => new DensityView(img, H.d, ox, oy),
    /** HD world px of world point p: the top-left of its scene texel (steps with the 1x world). */
    at(p) { const q = L.at(p); return { x: Math.floor(q.x * engine.pixelScale / H.scale), y: Math.floor(q.y * engine.pixelScale / H.scale) }; },
    /** HD world px of p without the texel snap (finer anchoring; moves in HD steps against a texel-stepped sprite). */
    atFine(p) {
      const cam = engine.camera; cam.snapWorld(p, _v);
      const t = cam.texelWorld, R = cam.right, U = cam.up, T = cam.target;
      const cx = Math.round(T.dot(R) / t) * t, cy = Math.round(T.dot(U) / t) * t, s = engine.pixelScale / H.scale;
      return { x: Math.floor(((p.dot(R) - cx) / t + engine.lowW / 2 + MARGIN) * s), y: Math.floor((engine.lowH / 2 + MARGIN - (p.dot(U) - cy) / t) * s) };
    },
    /** HD screen px of world point p (with this frame's device sub-texel offset). */
    atScreen(p) {
      const q = L.at(p), s = engine.pixelScale, off = offDev();
      const X = q.x * s - MARGIN * s - off.x;
      const Hdev = (engine.lowH + 2 * MARGIN) * s, uy = Hdev - 1 - q.y * s, Yb = uy - MARGIN * s - off.y;
      return { x: Math.floor(X / H.scale), y: (screen?.h ?? 0) - 1 - Math.floor(Yb / H.scale) };
    },
    /** 1x screen texel (top-left) -> HD screen px. */
    from1x(x, y) {
      const s = engine.pixelScale, yb = engine.lowH - 1 - y, hh = screen?.h ?? Math.ceil(engine.height / H.scale);
      return { x: Math.floor(x * s / H.scale), y: hh - 1 - Math.floor((yb * s + s - 1) / H.scale) };
    },
    /** HD screen px -> the 1x screen texel under its top-left device px. */
    to1x(hx, hy) {
      const s = engine.pixelScale, hh = screen?.h ?? Math.ceil(engine.height / H.scale), hb = hh - 1 - hy;
      return { x: Math.floor(hx * H.scale / s), y: engine.lowH - 1 - Math.floor((hb * H.scale + H.scale - 1) / s) };
    },
    /** HD screen px under a client point (the 1x overlay's anchoring: bottom-left of the canvas). */
    fromClient(cx, cy) {
      const c = engine.renderer.domElement, r = c.getBoundingClientRect();
      const dx = (cx - r.left) * (engine.width / Math.max(1, r.width)), dy = (cy - r.top) * (engine.height / Math.max(1, r.height));
      const hh = screen?.h ?? Math.ceil(engine.height / H.scale);
      return { x: Math.floor(dx / H.scale), y: hh - 1 - Math.floor((engine.height - dy - 0.5) / H.scale) };
    },
    /** View (logical) px under a client point = fromClient / d. */
    logical(cx, cy) { const p = H.fromClient(cx, cy); return { x: Math.floor(p.x / H.d), y: Math.floor(p.y / H.d) }; },
    /** Enable the depth-tested HD tier (call once in setup). */
    useDepth({ eps = 0.25 } = {}) { depthOn = true; H.depthEps = eps; return H; },
    /** View depth (m) of a world point (= linDepth in the low-res passes). */
    depthOf(p) { const cam = engine.camera.cam; cam.updateMatrixWorld(); return -_p.copy(p).applyMatrix4(cam.matrixWorldInverse).z; },
    /** Paint src at integer HD (x, y) into L.hd.depthWorld at depth d (nearer wins per px); k > 0 = Bayer dissolve. */
    putDepth(src, x, y, d, k = 0) {
      if (!dimg) { if (!depthOn) throw new Error('hd: putDepth before L.hd.useDepth()'); return H; }
      x = Math.round(x); y = Math.round(y);
      if (k > 0) { src = src.clone(); dissolveImg(src, k, x, y); }
      const W = dimg.w, Hh = dimg.h, sd = src.data, o = dimg.data;
      let x0 = W, x1 = -1, y0 = Hh, y1 = -1;
      for (let j = 0; j < src.h; j++) {
        const ty = y + j;
        if (ty < 0 || ty >= Hh) continue;
        for (let i = 0; i < src.w; i++) {
          const tx = x + i, si = (j * src.w + i) * 4;
          if (tx < 0 || tx >= W || !sd[si + 3]) continue;
          const ti = ty * W + tx;
          if (!(d < ddepth[ti])) continue;
          ddepth[ti] = d;
          o[ti * 4] = sd[si]; o[ti * 4 + 1] = sd[si + 1]; o[ti * 4 + 2] = sd[si + 2]; o[ti * 4 + 3] = 255;
          if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
        }
      }
      if (x1 >= x0) { dimg.mark(x0, y0, x1, y1); dany = true; }
      return H;
    },
  };
  const offDev = () => {
    const o = engine.camera.offset ?? { x: 0, y: 0 }, s = engine.pixelScale;
    return { x: Math.floor(o.x * s + 0.5), y: Math.floor(o.y * s + 0.5) };
  };
  const mkTex = (data, w, h, format = THREE.RGBAFormat, type = THREE.UnsignedByteType) => {
    const t = new THREE.DataTexture(data, w, h, format, type);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
    t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };

  const ensure = () => {
    const ps = engine.pixelScale;
    H.scale = hdScaleFor(ps, density, policy);
    H.k = ps / H.scale;
    H.d = H.k >= 1.5 ? density : 1;
    const sw = Math.ceil(engine.width / H.scale), sh = Math.ceil(engine.height / H.scale);
    const ww = Math.ceil((engine.lowW + 2 * MARGIN) * ps / H.scale), wh = Math.ceil((engine.lowH + 2 * MARGIN) * ps / H.scale);
    let changed = false;
    if (!screen || screen.w !== sw || screen.h !== sh) {
      screen = trackedImage(sw, sh); texS?.dispose(); texS = mkTex(screen.data, sw, sh);
      sU.tHS.value = texS; sU.uHSSize.value.set(sw, sh); changed = true;
    }
    if (world && (!wimg || wimg.w !== ww || wimg.h !== wh)) {
      wimg = trackedImage(ww, wh); texW?.dispose(); texW = mkTex(wimg.data, ww, wh);
      wU.tHW.value = texW; wU.uHWSize.value.set(ww, wh); changed = true;
    }
    if (depthOn && (!dimg || dimg.w !== ww || dimg.h !== wh)) {
      dimg = trackedImage(ww, wh); ddepth = new Float32Array(ww * wh).fill(1e9);
      texDC?.dispose(); texDD?.dispose();
      texDC = mkTex(dimg.data, ww, wh); texDD = mkTex(ddepth, ww, wh, THREE.RedFormat, THREE.FloatType);
      wU.tHDC.value = texDC; wU.tHDD.value = texDD; changed = true;
    }
    if (changed) {
      upload.prev.clear(); fresh = true;
      screenView = new DensityView(screen, H.d); worldView = wimg ? new DensityView(wimg, H.d) : null;
    }
  };

  /** Clear what the last frame drew (called by the layer before its callbacks). */
  H.begin = () => {
    ensure();
    for (const img of [screen, wimg]) { if (!img) continue; const p = upload.prev.get(img); if (p && !fresh) img.clearBands(p); else img.clear(); img.resetDirty(); }
    if (dimg) { const p = upload.prev.get(dimg); if (p && !fresh) dimg.clearBands(p, [[ddepth, 1e9]]); else { dimg.clear(); ddepth.fill(1e9); } dimg.resetDirty(); dany = false; }
  };
  /** Upload what changed (called by the layer after its callbacks). */
  H.end = () => {
    upload(screen, texS, fresh);
    if (wimg) upload(wimg, texW, fresh);
    if (dimg) upload(dimg, texDC, fresh, [{ tex: texDD, data: ddepth }]);
    fresh = false;
    stats.frames++;
  };

  // ---- overlays (device resolution, after the upscale). sRGB bytes straight to the canvas, like the 1x screen overlay.
  const sU = { tHS: { value: null }, uHSSize: { value: new THREE.Vector2(1, 1) }, uHScale: { value: 1 } };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: sU, vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tHS; uniform vec2 uHSSize; uniform float uHScale;
      void main() {
        vec2 s = floor(gl_FragCoord.xy / uHScale);
        vec4 u = texture2D(tHS, (vec2(s.x, uHSSize.y - 1.0 - s.y) + 0.5) / uHSSize);
        if (u.a <= 0.0) discard;
        gl_FragColor = u;
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending,
  });
  const wU = {
    tHW: { value: null }, tHDC: { value: null }, tHDD: { value: null }, tUIW: { value: null }, tSD: { value: null },
    uHWSize: { value: new THREE.Vector2(1, 1) }, uLow: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2() },
    uScale: { value: 1 }, uHScale: { value: 1 }, uMargin: { value: MARGIN }, uNear: { value: 0.1 }, uFar: { value: 400 },
    uEps: { value: 0.25 }, uDepth: { value: 0 }, uWorld: { value: 0 }, uMask: { value: 0 },
  };
  const worldMat = new THREE.ShaderMaterial({
    uniforms: wU, vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tHW, tHDC, tHDD, tUIW, tSD;
      uniform vec2 uHWSize, uLow, uOff; uniform float uScale, uHScale, uMargin, uNear, uFar, uEps, uDepth, uWorld, uMask;
      void main() {
        vec2 u = floor(gl_FragCoord.xy) + uMargin * uScale + uOff;           // device px in the padded frame, bottom-up
        float hdev = uLow.y * uScale;
        vec2 hp = vec2(floor(u.x / uHScale), floor((hdev - 1.0 - u.y) / uHScale));   // HD px, top-down
        vec2 huv = (hp + 0.5) / uHWSize;
        vec4 o = vec4(0.0);
        if (uDepth > 0.5) {
          vec4 p = texture2D(tHDC, huv);
          if (p.a > 0.0) {
            vec2 suv = (floor(u / uScale) + 0.5) / uLow;                      // the scene texel under this device px
            bool ui = uMask > 0.5 && texture2D(tUIW, vec2(suv.x, 1.0 - suv.y)).a > 0.0;   // 1x labels stay on top
            float sd = uNear + texture2D(tSD, suv).x * (uFar - uNear);
            if (!ui && sd >= texture2D(tHDD, huv).r - uEps) o = vec4(p.rgb, 1.0);
          }
        }
        if (uWorld > 0.5) {
          vec4 w = texture2D(tHW, huv);
          if (w.a > 0.0) o = o.a > 0.0 ? vec4(mix(o.rgb, w.rgb, w.a), 1.0) : w;
        }
        if (o.a <= 0.0) discard;
        gl_FragColor = o;
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending,
  });
  const quad = (mat) => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)); return s; };
  const sScene = quad(screenMat), wScene = quad(worldMat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const draw = (r, scene) => { r.setRenderTarget(null); const ac = r.autoClear; r.autoClear = false; r.render(scene, cam); r.autoClear = ac; };
  /** Composite L.hd.world (+ the depth tier) — the layer calls it right after the scene, before its 1x screen overlay. */
  H.renderWorld = (r) => {
    if (!H.enabled || !H.worldEnabled || !wimg) return;
    const anyW = wimg.dirty.x1 >= 0, anyD = !!dimg && dany;
    if (!anyW && !anyD) return;
    const ps = engine.pixelScale, off = offDev(), cc = engine.camera.cam;
    wU.uScale.value = ps; wU.uHScale.value = H.scale; wU.uLow.value.set(engine.lowW + 2 * MARGIN, engine.lowH + 2 * MARGIN);
    wU.uOff.value.set(off.x, off.y); wU.uNear.value = cc.near; wU.uFar.value = cc.far; wU.uEps.value = H.depthEps;
    wU.uWorld.value = anyW ? 1 : 0; wU.uDepth.value = anyD ? 1 : 0;
    wU.tSD.value = engine.pipeline.rtScene?.depthTexture ?? null;
    const wt = getWorldTex?.();
    wU.tUIW.value = wt ?? null; wU.uMask.value = wt ? 1 : 0;
    if (anyD && !wU.tSD.value) wU.uDepth.value = 0;
    draw(r, wScene);
  };
  /** Composite L.hd.screen — the layer calls it after its own 1x screen overlay. */
  H.renderScreen = (r) => {
    if (!H.enabled || !H.screenEnabled || !screen || screen.dirty.x1 < 0) return;
    sU.uHScale.value = H.scale;
    draw(r, sScene);
  };
  ensure();
  return H;
}
