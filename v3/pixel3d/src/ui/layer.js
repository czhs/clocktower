// UI layers over the 3D pixel frame (owner: UI lead; docs/UI.md §2.2 tiers, §3 contract).
//
//   import { createUILayers } from '../src/ui/layer.js';
//   const ui = createUILayers(engine);                 // once, after the camera is set
//   ui.add((L) => { const p = L.at(worldPos); drawText(L.world, p.x, p.y - 8, 'Ada', {...}); }, 10);
//   ui.add((L) => drawBox(L.screen, 4, 4, 80, 13, 'chip', L.tok), 50);
//   ui.add((L) => { const p = L.at(feet); L.ground.ring(p.x, p.y, 6, 3, L.tok.gold); }, 5);   // under the character
//
// Two RGBA PixelImages are redrawn every frame by the registered draw functions (sorted by z):
//   L.world  tier A "anchored": the PADDED low-res frame ((lowW + 2·MARGIN) x (lowH + 2·MARGIN)). Composited into the
//            low-res chain as pass 'ui-world' (order 300, after grade/vignette, so the grade never tints UI), i.e. it
//            rides the camera's sub-texel offset exactly like the scene: anchored labels / bubbles / markers never
//            swim against the world. L.at(p) = integer pixel of world point p in this image.
//   L.ground tier A-ground: same frame as L.world, composited UNDER characters (texels whose outline flag is FLAG_CHAR keep
//            the scene): ground-contact marks (ping rings, seat discs, pin shadows, "you are here") that a character
//            standing on them must hide. Props still do not occlude it (use tier W meshes when that matters).
//   L.screen tier S "screen": lowW x lowH, drawn AFTER the upscale (pipeline.render is wrapped) with the same
//            integer scale, fixed to the canvas (never moves with the camera): HUD, panels, menus, captions.
//   L.depthWorld  (optional, module fix) tier "A, depth-tested": same padded frame as L.world plus a per-texel view depth.
//            Enable once in setup with L.useDepth(); then draw with L.putDepth(src, x, y, d[, k]) where d = L.depthOf(p)
//            (view depth, m). Composited by pass 'ui-depth' (order 303, after 'ui-world' and the group pin passes 301/302): the scene texel is kept where
//            the scene is nearer than d - L.depthEps (characters / props in front hide it), and every L.world texel
//            (labels, bubbles, finger) stays on top. Nearer texels win among depth sprites (z-buffer). Use it for upright
//            world sprites that stand on the ground: place pins, door tokens, seat signs (markers/pinPass.js is the
//            group-private original of this tier).
// Tier W "world" = real 3D meshes in engine.scene (toon materials, outlines); not handled here.
//
// Colour: both images hold sRGB bytes. 'ui-world' converts to linear before the pipeline's final sRGB encode (the
// round trip is exact for 8-bit values); the screen overlay writes the bytes straight to the canvas. Alpha: binary
// for art; partial alpha only for the scrim token and banded glows (docs/UI.md §2.3).
// Cost: two texture uploads per frame (~0.9 MB + 0.9 MB at 640x360) + one fullscreen pass + one overlay quad.
// CONTRACT-REQUEST (lead): a pipeline.postRender[] hook would replace the render() wrapper below.
import * as THREE from 'three';
import { MARGIN } from '../core/PixelCamera.js';
import { PixelImage, tokens, dissolve as dissolveImg } from './kit.js';

const SRGB_GLSL = /* glsl */`
vec3 uiSrgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }`;

export function createUILayers(engine, { order = 300, tod = null, timeFn = null } = {}) {
  const fns = [];
  let world = null, ground = null, screen = null, texW = null, texG = null, texS = null;
  const L = {
    engine, MARGIN, enabled: true, screenEnabled: true,
    get world() { return world; }, get ground() { return ground; }, get screen() { return screen; },
    tok: tokens(tod || engine.style?.timeOfDay || 'noon'),
    t: 0,
    /** Integer pixel (x right, y down) of world point p in L.world. */
    at(p) {
      const cam = engine.camera;
      cam.snapWorld(p, _tmp);                 // ensures the camera basis is current
      const t = cam.texelWorld, R = cam.right, U = cam.up, T = cam.target;
      const cx = Math.round(T.dot(R) / t) * t, cy = Math.round(T.dot(U) / t) * t;
      return { x: Math.floor((p.dot(R) - cx) / t + engine.lowW / 2 + MARGIN), y: Math.floor(engine.lowH / 2 + MARGIN - (p.dot(U) - cy) / t) };
    },
    /** Same point in L.screen coordinates (sub-texel offset ignored: < 1 px). */
    atScreen(p) { const q = L.at(p); return { x: q.x - MARGIN, y: q.y - MARGIN }; },
    /** Is a screen-layer point inside the visible frame (with a margin)? */
    onScreen(x, y, m = 0) { return x >= m && y >= m && x < engine.lowW - m && y < engine.lowH - m; },
    add(fn, z = 0) { fns.push({ fn, z }); fns.sort((a, b) => a.z - b.z); return fn; },
    remove(fn) { const i = fns.findIndex((f) => f.fn === fn); if (i >= 0) fns.splice(i, 1); },
    setTod(name) { L.tok = tokens(name); },
    // ---- depth-tested tier (lazy; see header)
    get depthWorld() { return dimg; },
    depthEps: 0.25,
    /** Enable the depth-tested tier (call once, in setup). Returns L. */
    useDepth({ order: dOrder = 303, eps = 0.25 } = {}) { if (!dpass) makeDepthPass(dOrder); L.depthEps = eps; return L; },
    /** View depth (m along the camera axis) of a world point: the quantity linDepth() returns in low-res passes. */
    depthOf(p) {
      const cam = engine.camera.cam;
      cam.updateMatrixWorld();
      return -_tmp2.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
    },
    /** Paint src at integer (x, y) into L.depthWorld at depth d (nearer wins per texel); k > 0 = Bayer dissolve. */
    putDepth(src, x, y, d, k = 0) {
      if (!dimg) throw new Error('layer: L.putDepth before L.useDepth()');
      x = Math.round(x); y = Math.round(y);
      if (k > 0) { src = src.clone(); dissolveImg(src, k, x, y); }
      const W = dimg.w, H = dimg.h, sd = src.data, o = dimg.data;
      for (let j = 0; j < src.h; j++) {
        const ty = y + j;
        if (ty < 0 || ty >= H) continue;
        for (let i = 0; i < src.w; i++) {
          const tx = x + i, si = (j * src.w + i) * 4;
          if (tx < 0 || tx >= W || !sd[si + 3]) continue;
          const ti = ty * W + tx;
          if (!(d < ddepth[ti])) continue;
          ddepth[ti] = d;
          o[ti * 4] = sd[si]; o[ti * 4 + 1] = sd[si + 1]; o[ti * 4 + 2] = sd[si + 2]; o[ti * 4 + 3] = 255;
          dany = true;
        }
      }
      return L;
    },
  };
  const _tmp2 = new THREE.Vector3();
  let dimg = null, ddepth = null, dtexC = null, dtexD = null, dpass = null, dany = false;
  const dU = { tDC: { value: null }, tDD: { value: null }, tDW: { value: null }, uEps: { value: 0.25 }, uAny: { value: 0 } };
  const ensureDepth = () => {
    if (!dpass || !world) return;
    if (dimg && dimg.w === world.w && dimg.h === world.h) return;
    dimg = new PixelImage(world.w, world.h);
    ddepth = new Float32Array(world.w * world.h);
    dtexC?.dispose(); dtexD?.dispose();
    const prep = (t) => { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true; return t; };
    dtexC = prep(new THREE.DataTexture(dimg.data, dimg.w, dimg.h, THREE.RGBAFormat, THREE.UnsignedByteType));
    dtexC.colorSpace = THREE.NoColorSpace;
    dtexD = prep(new THREE.DataTexture(ddepth, dimg.w, dimg.h, THREE.RedFormat, THREE.FloatType));
    dU.tDC.value = dtexC; dU.tDD.value = dtexD;
  };
  function makeDepthPass(dOrder) {
    dpass = engine.pipeline.addPass({
      name: 'ui-depth', order: dOrder,
      update: () => {                         // L.world / L.depthWorld were redrawn by 'ui-world' this frame
        dU.uAny.value = dany && L.enabled ? 1 : 0; dU.uEps.value = L.depthEps; dU.tDW.value = texW;
        if (dany) { dtexC.needsUpdate = true; dtexD.needsUpdate = true; }
      },
      material: engine.pipeline.makeLowresMaterial({
        uniforms: dU,
        fragment: /* glsl */`
          uniform sampler2D tDC, tDD, tDW;
          uniform float uEps, uAny;
          ${SRGB_GLSL}
          void main() {
            vec4 s = texture2D(tColor, vUv);
            vec3 c = s.rgb;
            if (uAny > 0.5) {
              vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
              vec4 p = texture2D(tDC, uv);
              if (p.a > 0.0 && texture2D(tDW, uv).a <= 0.0 && linDepth(vUv) >= texture2D(tDD, uv).r - uEps) c = uiSrgbToLin(p.rgb);
            }
            gl_FragColor = vec4(c, s.a);
          }`,
      }),
    });
    ensureDepth();
  }
  const _tmp = new THREE.Vector3();

  const ensure = () => {
    const W = engine.lowW + 2 * MARGIN, H = engine.lowH + 2 * MARGIN;
    if (world && world.w === W && world.h === H) return;
    world = new PixelImage(W, H);
    ground = new PixelImage(W, H);
    screen = new PixelImage(engine.lowW, engine.lowH);
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
  };

  const redraw = () => {
    ensure();
    world.clear(); ground.clear(); screen.clear();
    ensureDepth();
    if (dimg) { dimg.clear(); ddepth.fill(1e9); dany = false; engine.camera.snapWorld(_tmp2.set(0, 0, 0), _tmp); }
    L.t = timeFn ? timeFn(engine.time ?? 0) : engine.time ?? 0;   // UI clock (a frozen stage clock freezes UI too)
    if (L.enabled) for (const { fn } of fns) fn(L);
    texW.needsUpdate = true; texG.needsUpdate = true; texS.needsUpdate = true;
  };

  // --- tier A: composite pass in the low-res chain
  const passU = { tUIWorld: { value: null }, tUIGround: { value: null } };
  const pass = engine.pipeline.addPass({
    name: 'ui-world', order,
    update: () => redraw(),                    // runs after camera.update(): projections match this frame
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
          if (g.a > 0.0 && abs(flagAt(vUv) - FLAG_CHAR) >= 0.08) c = mix(c, uiSrgbToLin(g.rgb), g.a);   // under characters
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
        vec2 s = floor(gl_FragCoord.xy / uScale);                  // bottom-up texel, same anchoring as the scene
        vec2 tc = vec2(s.x, uSize.y - 1.0 - s.y);
        vec4 u = texture2D(tUI, (tc + 0.5) / uSize);
        if (u.a <= 0.0) discard;
        gl_FragColor = u;                                          // sRGB bytes straight to the canvas
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
    if (!L.enabled || !L.screenEnabled || !pass.enabled || !screen) return;
    const r = engine.renderer;
    overlayMat.uniforms.uScale.value = engine.pixelScale;
    r.setRenderTarget(null);
    const ac = r.autoClear; r.autoClear = false;
    r.render(overlayScene, overlayCam);
    r.autoClear = ac;
  };
  L.pass = pass;
  return L;
}
