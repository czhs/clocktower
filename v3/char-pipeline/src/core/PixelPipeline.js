// Low-res render pipeline.
//   1. preRender hooks (e.g. water reflection/refraction cameras)
//   2. color pass   -> rtScene  (HalfFloat linear color + DepthTexture), uPassMode = 0
//   3. normal pass  -> rtNormal (rgb = view normal * .5 + .5, a = outline flag), uPassMode = 1
//   4. low-res post chain (ping-pong rtA/rtB), passes sorted by .order
//   5. upscale to the canvas with the camera's sub-texel offset: exact nearest at integer scale
//      (offset rounded to screen pixels), t3ssel8r AA filter at non-integer scales (pipeline.upscale)
import * as THREE from 'three';
import { MARGIN } from './PixelCamera.js';
import { LOWRES_COMMON } from './glsl.js';
import { createOutlinePass } from '../post/outline.js';

export const LAYERS = { DEFAULT: 0, COLOR_ONLY: 1 }; // COLOR_ONLY objects skip the normal pass

const FULLSCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function makeRT(w, h, { depthTexture = false, filter = THREE.NearestFilter } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, minFilter: filter, magFilter: filter, generateMipmaps: false, depthBuffer: true,
  });
  if (depthTexture) {
    rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  }
  return rt;
}

export class PixelPipeline {
  constructor(engine) {
    this.engine = engine;
    this.debug = engine.params.get('debug') || 'final'; // final | raw | normal | depth | flags
    this.passes = [];
    this.preRender = [];  // fn(engine) — runs before the color pass
    this.shadowOnce = engine.params.get('shadowOnce') !== '0'; // one sun shadow-map render per frame (A/B: ?shadowOnce=0)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Shared uniforms for every low-res pass (by reference).
    this.common = {
      tScene: { value: null }, tDepth: { value: null }, tNormal: { value: null }, tColor: { value: null },
      uLowSize: { value: new THREE.Vector2(1, 1) },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uViewMat: { value: new THREE.Matrix4() },
      uNear: { value: 0.1 }, uFar: { value: 400 },
      uTime: engine.uniforms.uTime, uSunDir: engine.uniforms.uSunDir, uSunColor: engine.uniforms.uSunColor,
      uCameraDir: engine.uniforms.uCameraDir, uTexelWorld: engine.uniforms.uTexelWorld,
    };

    // Upscale (final) pass options. snapScreen: 'auto' = round the sub-texel offset to whole screen
    // pixels when pixelScale is an integer (output == nearest neighbour: crisp, palette-pure; motion
    // glides in 1-screen-pixel steps); true/false force it. URL: ?snapScreen=0|1. Non-integer scales
    // always use t3ssel8r's AA ramp with the exact (unrounded) offset.
    const ss = engine.params.get('snapScreen');
    this.upscale = { snapScreen: ss === null ? 'auto' : ss !== '0' };

    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tFinal: { value: null }, tRaw: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uLowSize: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2() },
        uScale: { value: 4 }, uMargin: { value: MARGIN }, uMode: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 400 },
        uSnapScreen: { value: 1 }, uBlock: { value: 1 }, uView: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tFinal, tRaw, tNormal, tDepth;
        uniform vec2 uLowSize, uOffset, uView; uniform float uScale, uMargin, uNear, uFar, uSnapScreen, uBlock; uniform int uMode;
        varying vec2 vUv;
        void main() {
          // Camera sub-texel remainder (texels, y-up). Camera moved +e texels right of its snapped
          // position -> sample +e -> the image slides left on screen.
          vec2 off = uOffset;
          if (uSnapScreen > 0.5) off = floor(off * uScale + 0.5) / uScale;   // whole screen pixels
          vec2 s = gl_FragCoord.xy / uScale;                                  // visible low-res coords
          if (uBlock > 1.5) {
            // pixel-size bump (rotation crawl hider): blocks of uBlock texels centred on the view
            vec2 c = 0.5 * uView;
            s = c + (floor((s - c) / uBlock) + 0.5) * uBlock;
          }
          vec2 p = s + uMargin + off;                                          // texel coords in the padded RT
          vec2 uvN = (floor(p) + 0.5) / uLowSize;                              // nearest
          vec4 c;
          if (uMode == 0) {
            if (uSnapScreen > 0.5 || uBlock > 1.5) {
              // integer scale + pixel-aligned offset: t3ssel8r's filter lands outside every ramp and
              // reduces exactly to nearest neighbour; do that lookup directly (bit-exact, no blur).
              c = texture2D(tFinal, uvN);
            } else {
              // t3ssel8r's AA upscale (exact): box = this pixel's footprint in texels, a quadratic-window
              // smoothstep ramp blends exactly one screen pixel across each texel edge. Requires a
              // LinearFilter source (rtA/rtB).
              vec2 box = clamp(fwidth(p), 1e-5, 1.0);
              vec2 tx = p - 0.5 * box;
              vec2 o = smoothstep(vec2(1.0) - box, vec2(1.0), fract(tx));
              vec2 uv = (floor(tx) + 0.5 + o) / uLowSize;
              c = textureGrad(tFinal, uv, dFdx(p / uLowSize), dFdy(p / uLowSize));
            }
          }
          else if (uMode == 1) c = texture2D(tRaw, uvN);
          else if (uMode == 2) c = vec4(texture2D(tNormal, uvN).rgb, 1.0);
          else if (uMode == 3) { float z = texture2D(tDepth, uvN).x; c = vec4(vec3(fract(z * 40.0)), 1.0); }
          else c = vec4(vec3(texture2D(tNormal, uvN).a), 1.0);
          gl_FragColor = vec4(c.rgb, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });

    this.addPass(createOutlinePass(this));
  }

  /**
   * Add a low-res fullscreen pass. pass = { name, order, enabled, material } where material comes from
   * makeLowresMaterial(). Lower order runs first. Outline = 100. Suggested: lighting/fog 50,
   * godrays 150, color grade/palette 200, vignette/grain 250.
   */
  addPass(pass) {
    pass.enabled ??= true;
    this.passes = this.passes.filter((p) => p.name !== pass.name);
    this.passes.push(pass);
    this.passes.sort((a, b) => a.order - b.order);
    return pass;
  }

  getPass(name) { return this.passes.find((p) => p.name === name); }

  /** ShaderMaterial for a low-res pass. fragment: GLSL with main(); LOWRES_COMMON is prepended. */
  makeLowresMaterial({ fragment, uniforms = {}, defines = {} }) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.common, ...uniforms },
      defines,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: LOWRES_COMMON + fragment,
      depthTest: false, depthWrite: false,
    });
  }

  resize(lowW, lowH) {
    const w = lowW + 2 * MARGIN, h = lowH + 2 * MARGIN;
    for (const rt of [this.rtScene, this.rtNormal, this.rtA, this.rtB]) rt?.dispose();
    this.rtScene = makeRT(w, h, { depthTexture: true });
    this.rtNormal = makeRT(w, h);
    this.rtA = makeRT(w, h, { filter: THREE.LinearFilter });
    this.rtB = makeRT(w, h, { filter: THREE.LinearFilter });
    this.size = new THREE.Vector2(w, h);
    this.common.uLowSize.value.set(w, h);
    this.finalMat.uniforms.uLowSize.value.set(w, h);
  }

  render() {
    const { renderer, scene, uniforms, style } = this.engine;
    const cam = this.engine.camera.cam;
    renderer.autoClear = false;
    const info = renderer.info.render, sc = this.stageCalls ??= {};
    let mark = info.calls;
    const stage = (k) => { sc[k] = info.calls - mark; mark = info.calls; };

    // The sun's shadow map is rendered ONCE per frame, by the first renderer.render() of the frame (a
    // preRender reflection camera or the colour pass); every later render this frame reuses it. Without this,
    // each preRender scene render re-rendered the full shadow map (2-3x shadow cost with water).
    const sm = renderer.shadowMap;
    const smAuto = sm.autoUpdate;
    if (smAuto && this.shadowOnce) { sm.autoUpdate = false; sm.needsUpdate = true; }

    for (const fn of this.preRender) fn(this.engine);
    stage('preRender');

    // 2. color
    uniforms.uPassMode.value = 0;
    cam.layers.enable(LAYERS.COLOR_ONLY);
    renderer.setRenderTarget(this.rtScene);
    renderer.setClearColor(style.sky, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    stage('color');

    // 3. normals + outline flags (shadow map reused from the color pass)
    uniforms.uPassMode.value = 1;
    cam.layers.disable(LAYERS.COLOR_ONLY);
    sm.autoUpdate = false;
    renderer.setRenderTarget(this.rtNormal);
    renderer.setClearColor(this._normalClear ??= new THREE.Color(0.5, 0.5, 1.0), 0);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    sm.autoUpdate = smAuto;
    stage('normal');
    uniforms.uPassMode.value = 0;
    cam.layers.enable(LAYERS.COLOR_ONLY);

    // 4. low-res post chain
    const c = this.common;
    c.tScene.value = this.rtScene.texture;
    c.tDepth.value = this.rtScene.depthTexture;
    c.tNormal.value = this.rtNormal.texture;
    c.uInvProj.value.copy(cam.projectionMatrixInverse);
    c.uCamWorld.value.copy(cam.matrixWorld);
    c.uViewMat.value.copy(cam.matrixWorldInverse);
    c.uNear.value = cam.near; c.uFar.value = cam.far;
    let src = this.rtScene.texture;
    let dst = this.rtA, other = this.rtB;
    for (const pass of this.passes) {
      if (!pass.enabled) continue;
      pass.update?.(this.engine);
      c.tColor.value = src;
      this.quad.material = pass.material;
      renderer.setRenderTarget(dst);
      renderer.render(this.quadScene, this.quadCam);
      src = dst.texture;
      [dst, other] = [other, dst];
    }
    stage('post');

    // 5. upscale
    const f = this.finalMat.uniforms;
    const pcam = this.engine.camera;
    const scale = this.engine.pixelScale;
    const integer = Math.abs(scale - Math.round(scale)) < 1e-6;
    const snapScreen = this.upscale.snapScreen === 'auto' ? integer : !!this.upscale.snapScreen;
    f.tFinal.value = src;
    f.tRaw.value = this.rtScene.texture;
    f.tNormal.value = this.rtNormal.texture;
    f.tDepth.value = this.rtScene.depthTexture;
    f.uOffset.value.copy(pcam.offset);
    f.uScale.value = scale;
    f.uSnapScreen.value = snapScreen ? 1 : 0;
    f.uBlock.value = pcam.blockSize || 1;
    f.uView.value.set(this.engine.width / scale, this.engine.height / scale);
    f.uMode.value = { final: 0, raw: 1, color: 1, normal: 2, depth: 3, flags: 4 }[this.debug] ?? 0;
    this.quad.material = this.finalMat;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
    pcam.afterRender?.(); // restore logical positions of objects snapped via camera.snapObjectToTexel
  }
}
