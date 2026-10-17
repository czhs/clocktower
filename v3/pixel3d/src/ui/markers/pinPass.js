// Depth-tested place pins (owner: markers group; docs/UI.md row 1 "W or Ag+A (place)", critic r1 issue 2).
//
// v2 y-sorted place pins on the ground, so a character standing nearer the camera hid the pin. On L.world (tier A) a
// pin is always on top of everything. This is the "tier W pin" as a pixel-exact billboard: the baked pin_<c> sprites
// are painted into an own padded low-res image (same frame as L.world) together with a per-texel VIEW DEPTH (the depth
// of the pin's ground spot; a pin stands upright, so all its texels share that depth). A low-res pass composites it
// at order 301, right AFTER the UI world layer (300): ground decals of L.ground (seat rings, pings) stay under the
// upright pin, and wherever L.world has a texel (labels, bubbles, the finger, person pins) that texel wins, so v2's
// order (labels over place pins) holds. After grade/vignette, so pin colours are exact like every UI token. The scene
// texel is kept wherever the scene is nearer than the pin by more than DEPTH_EPS: characters, props and walls in front
// hide the pin, things behind do not. Among pins the nearer one wins (z-buffer), so the paint order does not matter.
// (r2 first try at order 299, before the UI layer: the "you" seat ring on L.ground printed over a pin.)
//
//   const pins = createPinPass(engine, L, { timeFn: hud.clock });
//   pins.add((P) => { P.blitD(F.get('pin_teal'), x - 8, y - 25, P.depthOf(worldSpot)); });   // P.t / P.tok / P.at
//
// Ground marks of a place pin (pin_shadow, pin_drop) go through the same pass at the pin's depth + 0.02 (painted under
// the body), so a character in front hides them with the pin.
// Cost: one fullscreen low-res pass + RGBA8 (pins), R32F (depth) and RGBA8 (a second view of L.world's buffer, for the
// mask) uploads per frame (~0.9 MB each at 640x360).
// CONTRACT-REQUEST (lead): a generic depth-tested tier in layer.js (L.depthWorld + L.putDepth) would replace this file.
import * as THREE from 'three';
import { MARGIN } from '../../core/PixelCamera.js';
import { PixelImage, dissolve } from '../kit.js';

/** Scene texels nearer than the pin by more than this (m) hide it (2 cobble rows below the tip are ~0.12 m nearer). */
export const DEPTH_EPS = 0.25;
const FAR = 1e9;

export function createPinPass(engine, L, { order = 301, timeFn = null } = {}) {
  const fns = [];
  let img = null, depth = null, texC = null, texD = null, texW = null, wsrc = null, any = false;
  const v = new THREE.Vector3();
  const U = { tPins: { value: null }, tPinDepth: { value: null }, tUIW: { value: null }, uEps: { value: DEPTH_EPS }, uAny: { value: 0 }, uMask: { value: 0 } };

  const P = {
    engine, phase: 'pins', t: 0, enabled: true,
    get img() { return img; },
    get tok() { return L.tok; },
    at: (p) => L.at(p),
    /** View depth (m along the camera axis) of a world point: the same quantity as linDepth() in the low-res passes. */
    depthOf(p) {
      const cam = engine.camera.cam;
      cam.updateMatrixWorld();
      v.copy(p).applyMatrix4(cam.matrixWorldInverse);
      return -v.z;
    },
    /** Paint src at integer (dx, dy) with depth d (nearer wins per texel); k > 0 = Bayer dissolve on the layer grid. */
    blitD(src, dx, dy, d, k = 0) {
      dx = Math.round(dx); dy = Math.round(dy);
      if (k > 0) { src = src.clone(); dissolve(src, k, dx, dy); }
      const W = img.w, H = img.h, s = src.data, o = img.data;
      for (let y = 0; y < src.h; y++) {
        const ty = dy + y;
        if (ty < 0 || ty >= H) continue;
        for (let x = 0; x < src.w; x++) {
          const tx = dx + x, si = (y * src.w + x) * 4;
          if (tx < 0 || tx >= W || !s[si + 3]) continue;
          const ti = ty * W + tx;
          if (!(d < depth[ti])) continue;
          depth[ti] = d;
          o[ti * 4] = s[si]; o[ti * 4 + 1] = s[si + 1]; o[ti * 4 + 2] = s[si + 2]; o[ti * 4 + 3] = 255;
          any = true;
        }
      }
    },
    add(fn, z = 0) { fns.push({ fn, z }); fns.sort((a, b) => a.z - b.z); return fn; },
    remove(fn) { const i = fns.findIndex((f) => f.fn === fn); if (i >= 0) fns.splice(i, 1); },
  };

  const ensure = () => {
    const W = engine.lowW + 2 * MARGIN, H = engine.lowH + 2 * MARGIN;
    if (img && img.w === W && img.h === H) return;
    img = new PixelImage(W, H);
    depth = new Float32Array(W * H);
    texC?.dispose(); texD?.dispose();
    const prep = (t) => { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true; return t; };
    texC = prep(new THREE.DataTexture(img.data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType));
    texC.colorSpace = THREE.NoColorSpace;
    texD = prep(new THREE.DataTexture(depth, W, H, THREE.RedFormat, THREE.FloatType));
    U.tPins.value = texC; U.tPinDepth.value = texD;
  };
  const prepW = () => {           // L.world is current here (its pass, order 300, redrew it this frame)
    const w = L.world;
    if (!w) { U.uMask.value = 0; return; }
    if (w !== wsrc) {
      texW?.dispose();
      texW = new THREE.DataTexture(w.data, w.w, w.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      texW.magFilter = texW.minFilter = THREE.NearestFilter; texW.generateMipmaps = false; texW.flipY = false;
      texW.colorSpace = THREE.NoColorSpace; wsrc = w; U.tUIW.value = texW;
    }
    texW.needsUpdate = true; U.uMask.value = 1;
  };

  const redraw = () => {
    ensure();
    img.clear(); depth.fill(FAR); any = false;
    P.t = timeFn ? timeFn(engine.time ?? 0) : engine.time ?? 0;    // same clock as the UI layer (L.t)
    engine.camera.snapWorld(new THREE.Vector3(), v);                  // camera basis current (as layer.js L.at)
    if (P.enabled && L.enabled) for (const { fn } of fns) fn(P);
    U.uAny.value = any ? 1 : 0;
    if (any) { texC.needsUpdate = true; texD.needsUpdate = true; prepW(); }
  };

  const pass = engine.pipeline.addPass({
    name: 'ui-markers-pins', order,
    update: () => redraw(),
    material: engine.pipeline.makeLowresMaterial({
      uniforms: U,
      fragment: /* glsl */`
        uniform sampler2D tPins, tPinDepth, tUIW;
        uniform float uEps, uAny, uMask;
        vec3 pinSrgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
        void main() {
          vec4 s = texture2D(tColor, vUv);
          vec3 c = s.rgb;
          if (uAny > 0.5) {
            vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
            vec4 p = texture2D(tPins, uv);
            bool ui = uMask > 0.5 && texture2D(tUIW, uv).a > 0.0;      // labels / bubbles / finger stay on top
            if (p.a > 0.0 && !ui && linDepth(vUv) >= texture2D(tPinDepth, uv).r - uEps) c = pinSrgbToLin(p.rgb);
          }
          gl_FragColor = vec4(c, s.a);
        }`,
    }),
  });
  P.pass = pass;
  return P;
}
