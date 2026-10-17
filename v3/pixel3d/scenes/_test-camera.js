// Camera test scene: static primitives + a grid of thin posts that reveal crawl (texel snapping,
// sub-texel offset sign, rotation re-anchoring, snapped moving objects).
//
// URL params (all optional):
//   camdx, camdy   static camera offset along camera right / up, in texels      (crawl test)
//   pan, panv      camera speed along right / up in texels per second of t      (slow pan via --times)
//   yaw            camera yaw in degrees (default 45)
//   vh             viewHeight (default 10 -> 36 px/m at 640x360)
//   snap=0         disable texel snapping (negative control)
//   rot=1          rotation demo: rotateBy(rotdir=+1) at t=rotAt (default 0.1); rotsteps, rotdur, rotmosaic
//   spin=1         continuous free yaw rotation (worst-case crawl, for comparison GIFs)
//   bob=0          disable the bobbing of the cube (stepped 2 fps sine, ±2 texels)
//   drift=<m/s>    cube drifts along world +X (moving-object test); cubesnap=0 disables its texel snap
//   freeze=<t>     render every frame with world time <t> (clouds etc. identical); default 1.0
//   outline=0      disable the outline pass
//   shadows=0      disable the sun shadow map
//   sunfix=1       pin the shadow camera along the light dir (proposed Engine fix, see below)
import * as THREE from 'three';
import { toonMesh, ensureToonUniforms } from '../src/materials/toon.js';
import { noise2 } from '../src/core/noise.js';

export default async function build(engine, params = engine.params) {
  const P = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  const { scene } = engine;
  const T = ensureToonUniforms(engine);
  T.uCloud.value.x = 0; // no cloud shadows: the test isolates camera behaviour

  // --- ground: flat-shaded low-amplitude terrain (faceted, so every facet edge is a crawl probe) ---
  const g = new THREE.PlaneGeometry(48, 48, 48, 48).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const h = (noise2(x * 0.18, z * 0.18, 7) - 0.5) * 0.9 * Math.min(1, Math.max(0, (r - 5) / 4));
    pos.setY(i, h);
  }
  g.computeVertexNormals();
  scene.add(toonMesh(engine, g.toNonIndexed(), { color: '#6f9a4e', flatShading: true }, { castShadow: false }));

  const stone = '#a39a86', dark = '#7d7a72', wood = '#6b4a35', red = '#b0574a', cyan = '#59c7d6';
  const add = (geo, color, x, y, z, ry = 0, opts = {}) => {
    const m = toonMesh(engine, geo, { color, flatShading: true, ...opts });
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
  };

  // stacked-block pillar (staircase edges must stay identical while panning)
  let y = 0;
  for (let k = 0; k < 6; k++) {
    const h = 0.42 + 0.06 * ((k * 7) % 3), w = 0.9 - 0.04 * (k % 2);
    add(new THREE.BoxGeometry(w, h, w), k % 2 ? stone : dark, -2.2, y + h / 2, -0.6, (k % 3 - 1) * 0.04);
    y += h;
  }
  // 45-degree box, axis box, rock, sphere, ramp
  add(new THREE.BoxGeometry(1.4, 1.0, 1.4), red, 1.8, 0.5, -1.4, Math.PI / 4);
  add(new THREE.BoxGeometry(1.2, 0.6, 2.0), stone, 2.6, 0.3, 1.6);
  add(new THREE.DodecahedronGeometry(0.75, 0), dark, -0.4, 0.45, 2.2, 0.3);
  add(new THREE.IcosahedronGeometry(0.6, 1), '#c9b98f', 0.3, 0.6, -2.8);
  const ramp = new THREE.CylinderGeometry(0.0, 1.1, 1.3, 4, 1);
  add(ramp, '#8f6b54', -3.6, 0.65, 2.6, Math.PI / 4);

  // grid of thin posts: widths 1, 2 and 3 texels (t = vh/360), the classic crawl revealers
  const vh = P('vh', 10), tex = vh / 360;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const w = tex * (1 + ((i + j) % 3)) * 1.02;
      const h = 0.9 + 0.35 * ((i * 3 + j) % 4);
      add(new THREE.BoxGeometry(w, h, w), (i + j) % 2 ? wood : '#d8cfb4', -5.4 + i * 1.1 + j * 0.2, h / 2, -4.4 + j * 0.9, 0, { outline: 'none' });
    }
  }
  // thin rails (horizontal 1-texel-high lines at 2:1 slope)
  for (let k = 0; k < 3; k++) {
    add(new THREE.BoxGeometry(3.2, tex * (1 + k) * 1.02, tex * 1.02), '#d8cfb4', 4.6, 0.35 + k * 0.3, -2.8 + k * 0.5, 0, { outline: 'none' });
  }

  // bobbing cube kept on the texel grid (stepped 2 fps sine, ±2 texels), registered with the camera
  const cube = add(new THREE.BoxGeometry(0.35, 0.35, 0.35), cyan, 0, 1.7, 0, 0, { outline: 'depth' });
  const bob = P('bob', 1) > 0;
  if (P('cubesnap', 1) > 0) engine.camera.snapObjectToTexel(cube);
  const drift = P('drift', 0); // cube drift along world +X in metres per second of t (moving-object test)

  // --- camera ---
  const yaw = THREE.MathUtils.degToRad(P('yaw', 45));
  const base = new THREE.Vector3(0, 0.5, 0);
  engine.camera.set({ target: base, yaw, pitch: Math.PI / 6, viewHeight: vh, snap: P('snap', 1) > 0 });
  // put the base target exactly on the texel grid so expected screen shifts are exactly camdx*scale
  engine.camera.update();
  base.copy(engine.camera.snapWorld(base));
  if (P('shadows', 1) === 0) engine.sun.castShadow = false;
  if (P('sunfix', 0) > 0) {
    // Experiment for a CONTRACT-REQUEST to the lead (Engine._updateSun): also pin the shadow camera
    // along the light direction (center·dir quantised to 4 m steps) so light-space depths of static
    // geometry never change while the view target pans; x/y are already snapped to whole shadow texels.
    const orig = engine._updateSun.bind(engine);
    engine._updateSun = () => {
      orig();
      const dir = engine.uniforms.uSunDir.value.clone().normalize();
      const c = engine.sun.target.position;
      const k = c.dot(dir);
      c.addScaledVector(dir, Math.round(k / 4) * 4 - k);
      engine.sun.position.copy(c).addScaledVector(dir, engine.shadowExtent * 3);
      engine.sun.target.updateMatrixWorld();
      engine.sun.updateMatrixWorld();
    };
  }
  if (P('outline', 1) === 0) { const o = engine.pipeline.getPass('outline'); if (o) o.enabled = false; }

  window.__pixel.camera = engine.camera; // for tools/crawl.mjs (interactive-controls smoke test)
  const camdx = P('camdx', 0), camdy = P('camdy', 0), pan = P('pan', 0), panv = P('panv', 0);
  const freeze = P('freeze', 1.0);
  const driveCam = ['camdx', 'camdy', 'pan', 'panv'].some((k) => params.has(k)); // else: interactive controls own it
  const rotOn = P('rot', 0) > 0, rotAt = P('rotAt', 0.1), spin = P('spin', 0);
  let rotated = false;
  engine.onUpdate((t) => {
    engine.uniforms.uTime.value = freeze; // world animation frozen; only the camera moves with t
    const cam = engine.camera, tw = cam.texelWorld;
    const dx = (camdx + pan * t) * tw, dy = (camdy + panv * t) * tw;
    if (driveCam) cam.target.copy(base).addScaledVector(cam.right, dx).addScaledVector(cam.up, dy);
    if (rotOn && !rotated && t >= rotAt) {
      rotated = true;
      const o = { at: rotAt };
      if (params.has('rotsteps')) o.steps = P('rotsteps', 3);
      if (params.has('rotmosaic')) o.mosaic = P('rotmosaic', 0);
      cam.rotateBy(P('rotdir', 1), params.has('rotdur') ? P('rotdur', 0.3) : undefined, o);
    }
    if (spin) cam.set({ yaw: yaw + spin * t });
    const b = bob ? Math.sin(Math.floor(t * 2) / 2 * Math.PI) * 2 * tw : 0;
    cube.position.set(drift * t, 1.7 + b, 0);
  });
}
