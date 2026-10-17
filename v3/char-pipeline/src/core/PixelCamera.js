// Orthographic camera that snaps its position to the low-res texel grid (in camera-aligned world
// space) so static geometry never "crawls", and reports the sub-texel remainder so the upscale pass
// can shift the final image and keep motion smooth (Holland / t3ssel8r / aarthificial technique).
//
// Snap grid ("snap space", Holland): spanned by the camera's right/up axes and anchored at the WORLD
// ORIGIN. It is rebuilt (re-anchored) whenever yaw or pitch changes, from the analytic yaw/pitch basis,
// so a given (yaw, pitch, snapped position) always rasterises identically regardless of history
// (rotating 360 degrees and back gives bit-identical frames).
//
// Public API (stable):
//   camera.set({target, yaw, pitch, viewHeight, snap})
//   camera.update()                     called by Engine once per frame (after scene updaters)
//   camera.texelWorld                   world size of one low-res texel
//   camera.offset                       sub-texel remainder (texels, y-up) consumed by the upscale pass
//   camera.snapWorld(p)                 copy of world point p snapped to the texel grid (depth kept)
//   camera.snapObjectToTexel(obj, o)    keep obj (e.g. a player / bobbing cube) on the same grid
//   camera.rotateTo(yaw, duration, o)   animated 45-degree-stop rotation that hides crawl
//   camera.rotateBy(steps, duration, o) rotateTo(yaw + steps * 45deg)
//   camera.enableControls(el)           WASD/drag pan, wheel zoom ladder, Q/E 45-degree rotation
import * as THREE from 'three';

export const MARGIN = 2; // extra low-res texels rendered on each side (room for the subpixel shift + kernels)

const QUARTER = Math.PI / 4;
// Zoom ladder for interactive wheel zoom: continuous viewHeight changes crawl (texel size changes),
// so zoom jumps between clean stops instead [TECHNIQUES §1.1].
export const ZOOM_LADDER = [5, 6, 7.5, 9, 10, 12, 15, 18, 22.5, 30, 45, 60, 90];

const EASE = {
  linear: (u) => u,
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
};

export class PixelCamera {
  constructor(engine) {
    this.engine = engine;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI * 0.25;      // radians around +Y (t3ssel8r: multiples of 45deg)
    this.pitch = Math.PI / 6;       // 30deg below horizon -> clean 2:1 pixel lines
    this.viewHeight = 18;           // world units visible vertically
    this.distance = 120;
    this.snap = true;
    this.offset = new THREE.Vector2(); // sub-texel remainder, in low-res texels (y-up)
    this.lowW = 320; this.lowH = 180;
    // Upscale hints consumed by the final pass (PixelPipeline): mosaic block size (1 = off) used to
    // hide crawl during rotations.
    this.blockSize = 1;
    this.rotating = false;

    // snap space (rebuilt on yaw/pitch change)
    this._right = new THREE.Vector3(1, 0, 0);
    this._up = new THREE.Vector3(0, 1, 0);
    this._fwd = new THREE.Vector3(0, 0, -1);
    this._basisKey = null;
    this._quat = new THREE.Quaternion();
    this._rot = null;           // active rotation animation
    this._tracked = new Map();  // obj -> {logical: Vector3 | null}
    this._restore = [];         // [obj, localPosition] restored after the frame (afterRender)
  }

  set({ target, yaw, pitch, viewHeight, snap } = {}) {
    if (target) this.target.copy(target);
    if (yaw !== undefined) { this.yaw = yaw; this._rot = null; }
    if (pitch !== undefined) this.pitch = pitch;
    if (viewHeight !== undefined) this.viewHeight = viewHeight;
    if (snap !== undefined) this.snap = snap;
  }

  resize(lowW, lowH) { this.lowW = lowW; this.lowH = lowH; }

  get texelWorld() { return this.viewHeight / this.lowH; }

  /** Camera axes in world space (valid after update(); used for the snap grid). */
  get right() { return this._right; }
  get up() { return this._up; }
  get forward() { return this._fwd; }

  // Re-anchor the snap space: analytic basis from yaw/pitch (no lookAt round-off), rebuilt only when
  // the rotation actually changes.
  _rebuildBasis() {
    const key = `${this.yaw}|${this.pitch}`;
    if (key === this._basisKey) return false;
    this._basisKey = key;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._fwd.set(-cp * sy, -sp, -cp * cy);
    this._right.set(cy, 0, -sy);
    this._up.set(-sp * sy, cp, -sp * cy);                 // = right x (-fwd)
    const back = this._fwd.clone().negate();
    const m = new THREE.Matrix4().makeBasis(this._right, this._up, back);
    this._quat.setFromRotationMatrix(m);
    return true;
  }

  // Active rotation animation (deterministic: a pure function of engine.time).
  _animateRotation() {
    const r = this._rot;
    if (!r) { this.blockSize = 1; this.rotating = false; return; }
    const now = this.engine.time ?? 0;
    if (r.t0 === null) r.t0 = now;
    const u = r.duration > 0 ? Math.min(1, Math.max(0, (now - r.t0) / r.duration)) : 1;
    if (u >= 1) {
      this.yaw = r.to; this._rot = null; this.blockSize = 1; this.rotating = false;
      return;
    }
    const ease = EASE[r.ease] || EASE.inOutCubic;
    let e;
    if (r.steps > 0) {
      // 'step': the turn is shown as a few clean key poses (stop-motion, like hand-drawn rotation
      // frames). Each pose is a fully snapped frame, so nothing boils; the eye reads the jumps as
      // animation. Poses are evenly timed (duration/steps each, the first one immediately, so the
      // key press responds at once); the easing spaces their ANGLES (closer near the ends).
      const k = Math.min(r.steps, Math.floor(u * r.steps) + 1);
      e = ease(k / (r.steps + 1));
    } else {
      e = ease(u);
    }
    this.yaw = r.from + (r.to - r.from) * e;
    this.rotating = true;
    // 'mosaic': bump the displayed pixel size (2x2 blocks) while the grid is rotating, so the
    // sub-texel boiling of thin features is hidden under coarser pixels.
    this.blockSize = r.mosaic && u > r.mosaicIn && u < 1 - r.mosaicIn ? r.mosaic : 1;
  }

  /**
   * Rotate (animated) to `yaw` (radians; rounded to the nearest 45° stop unless opts.exact). The
   * transition is deterministic in engine.time. Crawl during a rotation is unavoidable, so it is
   * hidden by default as a fast eased "stop-motion" turn (opts.steps key poses).
   *   opts: { steps = 3 intermediate key poses (0 = smooth continuous turn), ease = 'inOutSine',
   *           mosaic = 0 (2 = 2x2 pixel-size bump while turning), at = start time (default: the
   *           current engine time), exact = false }
   */
  rotateTo(yaw, duration = 0.3, { steps = 3, ease = 'inOutSine', mosaic = 0, at = null, exact = false } = {}) {
    const to = exact ? yaw : Math.round(yaw / QUARTER) * QUARTER;
    const from = this.yaw; // starts from the current (possibly mid-turn) pose
    this._rot = { from, to, t0: at ?? (this.engine.time ?? 0), duration, steps, ease, mosaic, mosaicIn: 0.12 };
    if (duration <= 0) { this.yaw = to; this._rot = null; }
    return to;
  }

  /** rotateTo(targetYaw + steps·45°), chaining onto a rotation that is still running. */
  rotateBy(steps45 = 1, duration, opts) {
    const base = this._rot ? this._rot.to : Math.round(this.yaw / QUARTER) * QUARTER;
    return this.rotateTo(base + steps45 * QUARTER, duration, opts);
  }

  /** Yaw the camera is heading to (the target of a running rotation, else the current yaw). */
  get targetYaw() { return this._rot ? this._rot.to : this.yaw; }

  /** Copy of world point p snapped to the texel grid along camera right/up (depth along fwd kept). */
  snapWorld(p, out = new THREE.Vector3()) {
    this._rebuildBasis();
    const t = this.texelWorld, R = this._right, U = this._up;
    const a = p.dot(R), b = p.dot(U);
    return out.copy(p).addScaledVector(R, Math.round(a / t) * t - a).addScaledVector(U, Math.round(b / t) * t - b);
  }

  /**
   * Keep an object that moves (with the camera, or animated) on the camera's texel grid, in sync with
   * the camera snap, so it never shimmers against the static world [T, H part03].
   *   - Registered mode (default): every frame, right before rendering, the object's world position
   *     is snapped; after the frame its logical (unsnapped) position is restored, so scene code may
   *     integrate positions freely (pos += v*dt) without stalling on the rounding.
   *   - opts.once = true: snap it right now (scene code that sets the position from t every frame).
   *   - opts.enabled = false: unregister.
   * Returns obj.
   */
  snapObjectToTexel(obj, { once = false, enabled = true } = {}) {
    if (!enabled) { this._tracked.delete(obj); return obj; }
    if (once) { this._snapObject(obj, false); return obj; }
    this._tracked.set(obj, true);
    return obj;
  }

  _snapObject(obj, remember) {
    obj.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    const sp = this.snapWorld(wp);
    if (remember) this._restore.push([obj, obj.position.clone()]);
    if (obj.parent) obj.parent.worldToLocal(sp);
    obj.position.copy(sp);
    obj.updateMatrixWorld(true);
  }

  /** Called by the pipeline after the final pass: restores logical positions of tracked objects. */
  afterRender() {
    for (const [obj, p] of this._restore) { obj.position.copy(p); obj.updateMatrixWorld(true); }
    this._restore.length = 0;
  }

  update() {
    this._animateRotation();
    this._rebuildBasis();
    const t = this.texelWorld;
    const cam = this.cam;
    const halfW = (this.lowW / 2 + MARGIN) * t, halfH = (this.lowH / 2 + MARGIN) * t;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.near = 0.1; cam.far = this.distance * 2 + 100;
    cam.updateProjectionMatrix();

    const R = this._right, U = this._up, F = this._fwd;
    const pos = this.target.clone().addScaledVector(F, -this.distance);
    cam.up.copy(U);
    cam.quaternion.copy(this._quat);
    this.offset.set(0, 0);
    if (this.snap) {
      // pos·R == target·R and pos·U == target·U analytically; use the target so the camera and
      // snapObjectToTexel(target-following object) round identically ("snap in sync", T).
      const x = this.target.dot(R), y = this.target.dot(U);
      const xs = Math.round(x / t) * t, ys = Math.round(y / t) * t;
      this.offset.set((x - xs) / t, (y - ys) / t);
      pos.addScaledVector(R, xs - x).addScaledVector(U, ys - y);
    }
    cam.position.copy(pos);
    cam.updateMatrixWorld(true);

    if (this.snap) for (const obj of this._tracked.keys()) this._snapObject(obj, true);

    const u = this.engine.uniforms;
    u.uCameraPos.value.copy(cam.position);
    u.uCameraDir.value.copy(F);
    u.uTexelWorld.value = t;
  }

  enableControls(el) {
    const keys = new Set();
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      keys.add(k);
      const n = Number(e.key);
      if (n >= 1 && n <= 5) this.engine.pipeline.debug = ['final', 'raw', 'normal', 'depth', 'color'][n - 1];
      if (!e.repeat && (k === 'q' || k === 'e')) this.rotateBy(k === 'q' ? 1 : -1);
    });
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', () => { drag = null; });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / this.engine.pixelScale, dy = (e.clientY - drag.y) / this.engine.pixelScale;
      drag = { x: e.clientX, y: e.clientY };
      this._pan(-dx * this.texelWorld, dy * this.texelWorld / Math.sin(this.pitch));
    });
    let wheelAcc = 0;
    el.addEventListener('wheel', (e) => {
      // zoom ladder: one stop per wheel notch (~100 deltaY); never a continuous viewHeight change
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 60) return;
      const dir = Math.sign(wheelAcc); wheelAcc = 0;
      let i = ZOOM_LADDER.findIndex((v) => v >= this.viewHeight - 1e-6);
      if (i < 0) i = ZOOM_LADDER.length - 1;
      else if (ZOOM_LADDER[i] > this.viewHeight + 1e-6 && dir < 0) i--; // between stops: go to the lower one
      else i += dir;
      this.viewHeight = ZOOM_LADDER[Math.min(ZOOM_LADDER.length - 1, Math.max(0, i))];
    }, { passive: true });
    this.engine.onUpdate((t, dt) => {
      const s = this.viewHeight * 0.5 * dt;
      if (keys.has('w')) this._pan(0, s / Math.sin(this.pitch));
      if (keys.has('s')) this._pan(0, -s / Math.sin(this.pitch));
      if (keys.has('a')) this._pan(-s, 0);
      if (keys.has('d')) this._pan(s, 0);
    });
  }

  _pan(dx, dz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // screen-right and screen-forward projected on the ground plane
    this.target.x += dx * c - dz * s;
    this.target.z += -dx * s - dz * c;
  }
}
