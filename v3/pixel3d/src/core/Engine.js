// Engine: owns the renderer, the pixel camera, the sun, shared uniforms, the update loop and the
// capture contract (window.__pixel). Scenes receive an Engine and only add content + update hooks.
//
// Frame:  color pass (uPassMode=0) -> normal pass (uPassMode=1) -> low-res post chain -> upscale.
// See docs/PIPELINE.md for the full contract every module must follow.
import * as THREE from 'three';
import { PixelCamera } from './PixelCamera.js';
import { PixelPipeline } from './PixelPipeline.js';

export class Engine {
  constructor({ params = new URLSearchParams() } = {}) {
    this.params = params;
    this.capture = params.get('capture') === '1';
    // pixelScale: integer by default (~640x360 internal, t3ssel8r). ?scale=fit -> non-integer innerHeight/360
    // (exactly 360 rows at any window size; the final pass then uses t3ssel8r's AA upscale filter).
    this.fitScale = params.get('scale') === 'fit';
    this.pixelScale = this._pickScale();

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: this.capture });
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // crisp, pixel-friendly; modules may change
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = null; // pipeline clears with style.sky

    // Shared uniforms: materials attach these BY REFERENCE (never copy .value).
    this.uniforms = {
      uPassMode: { value: 0 },                    // 0 = color, 1 = normals/flags
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, // world-space, points TO the sun
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
      uShadowColor: { value: new THREE.Color(0.33, 0.36, 0.55) },      // multiplier in shadow (cool)
      uAmbient: { value: new THREE.Color(0.10, 0.10, 0.14) },          // flat add
      uBands: { value: 3 },
      uCameraPos: { value: new THREE.Vector3() },
      uCameraDir: { value: new THREE.Vector3() },
      uTexelWorld: { value: 0.1 },                // world size of one low-res pixel
    };
    // Extra uniforms merged into every toonMaterial at compile time (lighting module adds ramp colours,
    // cloud texture, etc. here during scene build, BEFORE the first render). Optional GLSL override for the
    // light ramp: engine.toonLightGLSL (defaults to TOON_LIGHT_GLSL in src/materials/toon.js).
    this.toonUniforms = {};
    this.toonLightGLSL = null;
    this.style = {
      sky: new THREE.Color(0.55, 0.75, 0.95),     // clear color (linear)
    };

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    // 4096 + biases sized to the shadow texel (lighting agent's configureShadows defaults): at 2048 a ledge
    // shadow on a wall the sun grazes shows 3-4 px sawtooth. sky.configureShadows() re-sizes per view.
    this.sun.shadow.mapSize.set(4096, 4096);
    this.shadowExtent = 30; // half-size of shadow ortho box (world units)
    this.sun.shadow.bias = -0.00002;
    this.sun.shadow.normalBias = 1.5 * (2 * this.shadowExtent) / 4096;
    this.scene.add(this.sun, this.sun.target);

    this.camera = new PixelCamera(this);
    this.pipeline = new PixelPipeline(this);

    this.stats = {};     // free-form numbers scenes/modules publish (e.g. build timings); reported by info()
    this.updaters = [];
    this.time = 0;
    this._last = null;
    this.hud = document.getElementById('hud');

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    window.__pixel.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Register fn(t, dt, engine) called before every frame. Must be deterministic in t for capture. */
  onUpdate(fn) { this.updaters.push(fn); }

  /** Set sun direction (world, towards the sun), color, intensity. */
  setSun({ dir, color, intensity = 1, shadowExtent } = {}) {
    if (dir) this.uniforms.uSunDir.value.copy(dir).normalize();
    if (color) this.uniforms.uSunColor.value.set(color);
    this.sun.intensity = intensity;
    if (shadowExtent) this.shadowExtent = shadowExtent;
  }

  _pickScale() {
    const p = this.params.get('scale');
    if (this.fitScale) return Math.max(1, window.innerHeight / 360);
    return Number(p || Math.max(1, Math.round(window.innerHeight / 360)));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.fitScale) this.pixelScale = this._pickScale();
    this.renderer.setSize(w, h, false);
    this.width = w; this.height = h;
    this.lowW = Math.ceil(w / this.pixelScale);
    this.lowH = Math.ceil(h / this.pixelScale);
    this.camera.resize(this.lowW, this.lowH);
    this.pipeline.resize(this.lowW, this.lowH);
  }

  _updateSun() {
    // Shadow camera follows the view target, snapped to shadow-map texels in light space (no shimmer).
    const ext = this.shadowExtent;
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = ext * 6;
    sc.updateProjectionMatrix();
    const dir = this.uniforms.uSunDir.value;
    const center = this.camera.target.clone();
    const texel = (2 * ext) / this.sun.shadow.mapSize.x;
    // snap in the shadow camera's own lookAt basis (z = towards the sun, x = up × z, y = z × x)
    const z = dir.clone().normalize();
    const x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
    const cx = Math.round(center.dot(x) / texel) * texel, cy = Math.round(center.dot(y) / texel) * texel;
    center.addScaledVector(x, cx - center.dot(x)).addScaledVector(y, cy - center.dot(y));
    // also quantise along the light direction (4 m steps), so light-space depths of static geometry never
    // change while the view pans (camera agent's hardening request; no effect on the image otherwise)
    const cz = center.dot(z);
    center.addScaledVector(z, Math.round(cz / 4) * 4 - cz);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(dir, ext * 3);
    this.sun.color.copy(this.uniforms.uSunColor.value);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  renderAt(t) {
    const c0 = performance.now();
    this.renderer.info.reset();
    const dt = this._last === null ? 1 / 60 : Math.max(0, Math.min(0.1, t - this._last));
    this._last = t;
    this.time = t;
    this.uniforms.uTime.value = t;
    for (const fn of this.updaters) fn(t, dt, this);
    this.camera.update();
    this._updateSun();
    this.pipeline.render();
    this.lastFrameMs = performance.now() - c0; // CPU time of the frame (GPU work is async)
  }

  start() {
    window.__pixel.renderAt = (t) => this.renderAt(t);
    // calls/tris: whole frame (shadow map + preRender + colour + normal + post + upscale);
    // stages: per-stage draw calls of the last frame (PixelPipeline); programs: compiled shader programs
    // (must stay constant from frame to frame: a growing count means a recompile every frame).
    window.__pixel.info = () => ({
      low: [this.lowW, this.lowH], scale: this.pixelScale,
      calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles,
      stages: { ...this.pipeline.stageCalls },
      programs: this.renderer.info.programs?.length ?? null,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      passes: this.pipeline.passes.filter((p) => p.enabled).map((p) => `${p.name}:${p.order}`).join(' '),
      frameMs: Math.round((this.lastFrameMs ?? 0) * 100) / 100,
      stats: this.stats,
      gpu: window.__pixel.gpu,
    });
    if (!this.capture) {
      this.camera.enableControls(this.renderer.domElement);
      const t0 = performance.now();
      let frames = 0, fpsT = t0;
      const loop = (now) => {
        this.renderAt((now - t0) / 1000);
        frames++;
        if (this.hud && now - fpsT > 500) {
          this.hud.textContent = `${this.lowW}x${this.lowH} x${this.pixelScale}  ${(frames * 1000 / (now - fpsT)).toFixed(0)} fps  ` +
            `${this.renderer.info.render.calls} calls\nWASD/drag pan · wheel zoom · Q/E rotate · 1-5 debug views`;
          frames = 0; fpsT = now;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } else {
      this.renderAt(0);
    }
    window.__pixel.ready = true;
  }
}
