// (B) The VOTE SPOTLIGHTS (docs/DEMO.md §4.9 "the seal vote"): the user, 2026-10-18: "when vote is locked, how about a
// spotlight on the character". When the clock hand locks a seat's seal (a counted vote, sealvote.js) a warm beam drops
// onto that voter from above and a pool of light spreads at their feet; both stay while the vote stands (up to 15 at
// once), readable by day and by night.
//
// NO REAL LIGHTS (a light count change recompiles every lit material): ONE mesh, ONE ShaderMaterial (one program,
// compiled in the shader warm-up: the mesh is always drawn, an off seat collapses its vertices out of the clip volume),
// one draw call for all 15 seats. Drawn in the colour pass only (LAYERS.COLOR_ONLY: no normals / outline), additive,
// depth-tested (whatever stands in front of a beam hides it), no depth write.
//   per seat: a BEAM = an open cone (16 sides, front faces) from 3.2 m x scale above the feet (r 0.2) down to the feet
//             (r 0.62); its lower end DROPS from the top to the feet (drop 0..1, stepped by the caller); brightness in
//             3 hard bands across the cone (from its silhouette to its middle) x a fade toward the top, the band edges
//             ordered-dithered (Bayer 4 x 4 in screen texels: the town's pool look);
//             a POOL = an inner disc on the stone's top (r 0.43) + an outer ring on the ground (to r 0.95), 3 bands.
//   createSpotlights(engine, {count, extra}) -> { mesh, set(i, {x, y, z, ground, scale, drop, pool, on, ghost, tint}), off(i),
//                                         gain(day01, night01), info(), dispose() }
// The caller (votemarks.js) sets every seat every frame from the vote's state (pure: a function of the demo clock).
import * as THREE from 'three';
import { LAYERS } from '../core/PixelPipeline.js';

const SIDES = 16, RINGS = 24;
const TOP = 3.4, R_TOP = 0.14, R_BOT = 0.62, R_IN = 0.43, R_OUT = 0.95;

export function createSpotlights(engine, { count: seats = 15, extra = 0 } = {}) {
  // (vote-fix5) `extra` slots after the seats' (votemarks.js: slot 15 = the nominee's crimson beam from the threshold)
  const count = seats + extra;
  const pos = [], seat = [], kind = [], uv = [];
  const push = (p, s, k, u, v) => { pos.push(...p); seat.push(s); kind.push(k); uv.push(u, v); };
  for (let s = 0; s < count; s++) {
    // the beam: a cone side (u = around 0..1, v = 0 at the feet .. 1 at the top); local unit coordinates (x, z = the
    // ring direction, y = 0 / 1), placed + sized in the vertex shader
    for (let k = 0; k < SIDES; k++) {
      const a0 = (k / SIDES) * Math.PI * 2, a1 = ((k + 1) / SIDES) * Math.PI * 2;
      const c0 = [Math.sin(a0), Math.cos(a0)], c1 = [Math.sin(a1), Math.cos(a1)];
      push([c0[0], 0, c0[1]], s, 0, k / SIDES, 0); push([c1[0], 0, c1[1]], s, 0, (k + 1) / SIDES, 0); push([c1[0], 1, c1[1]], s, 0, (k + 1) / SIDES, 1);
      push([c0[0], 0, c0[1]], s, 0, k / SIDES, 0); push([c1[0], 1, c1[1]], s, 0, (k + 1) / SIDES, 1); push([c0[0], 1, c0[1]], s, 0, k / SIDES, 1);
    }
    // the pool: inner disc (kind 1, on the feet's height) + outer ring (kind 2, on the ground)
    for (let k = 0; k < RINGS; k++) {
      const a0 = (k / RINGS) * Math.PI * 2, a1 = ((k + 1) / RINGS) * Math.PI * 2;
      const c0 = [Math.sin(a0), Math.cos(a0)], c1 = [Math.sin(a1), Math.cos(a1)];
      push([0, 0, 0], s, 1, 0, 0); push([c0[0], 0, c0[1]], s, 1, 1, 0); push([c1[0], 0, c1[1]], s, 1, 1, 0);
      const ri = R_IN / R_OUT;
      push([c0[0] * ri, 0, c0[1] * ri], s, 2, ri, 0); push([c0[0], 0, c0[1]], s, 2, 1, 0); push([c1[0], 0, c1[1]], s, 2, 1, 0);
      push([c0[0] * ri, 0, c0[1] * ri], s, 2, ri, 0); push([c1[0], 0, c1[1]], s, 2, 1, 0); push([c1[0] * ri, 0, c1[1] * ri], s, 2, ri, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeat', new THREE.Float32BufferAttribute(seat, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  const uAt = { value: Array.from({ length: count }, () => new THREE.Vector4(0, 0, 0, 1)) };     // x, feet y, z, scale
  const uSt = { value: Array.from({ length: count }, () => new THREE.Vector4(0, 0, 0, 0)) };     // on, drop, ground y, ghost
  const uPool = { value: new Float32Array(count) };
  const uGain = { value: new THREE.Vector2(0.3, 0.42) };                                          // beam, pool
  const mat = new THREE.ShaderMaterial({
    name: 'vote-spotlights',
    uniforms: { uPassMode: engine.uniforms?.uPassMode ?? { value: 0 }, uAt, uSt, uPool, uGain },
    vertexShader: /* glsl */`
      #define N ${count}
      uniform vec4 uAt[N]; uniform vec4 uSt[N]; uniform float uPool[N];
      attribute float aSeat, aKind; attribute vec2 aUv;
      varying vec2 vUv; varying float vKind, vOn, vGhost, vFace;
      void main() {
        int i = int(aSeat + 0.5);
        vec4 A = uAt[i], S = uSt[i];
        vUv = aUv; vKind = aKind; vOn = S.x; vGhost = S.w; vFace = 0.0;
        float sc = A.w;
        vec3 w;
        if (aKind < 0.5) {
          // the beam: its lower end drops from the top (drop 0) to the feet (drop 1)
          float top = A.y + ${TOP.toFixed(2)} * sc, bot = top - (top - A.y) * S.y;
          float y = mix(bot, top, position.y);
          float r = mix(${R_BOT.toFixed(2)}, ${R_TOP.toFixed(2)}, (y - A.y) / max(1e-3, top - A.y)) * sc;
          w = vec3(A.x + position.x * r, y, A.z + position.z * r);
          vUv.y = (y - A.y) / max(1e-3, top - A.y);
          // how squarely this side faces the camera: 1 in the middle of the beam, 0 at its silhouette
          vec3 nW = normalize(vec3(position.x, 0.0, position.z));
          vec3 toCam = normalize(cameraPosition - w);
          vFace = clamp(dot(nW, normalize(vec3(toCam.x, 0.0, toCam.z))), 0.0, 1.0);
          if (S.y <= 0.0) vOn = 0.0;
        } else {
          float r = ${R_OUT.toFixed(2)} * sc;
          float y = aKind < 1.5 ? A.y + 0.012 : S.z + 0.03;
          w = vec3(A.x + position.x * r, y, A.z + position.z * r);
          vOn = S.x * uPool[i];
        }
        gl_Position = vOn <= 0.001 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform int uPassMode; uniform vec2 uGain;
      varying vec2 vUv; varying float vKind, vOn, vGhost, vFace;
      float bayer4(vec2 p) {
        ivec2 q = ivec2(mod(floor(p), 4.0));
        int i = q.x + q.y * 4;
        int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
        return (float(m[i]) + 0.5) / 16.0;
      }
      void main() {
        if (uPassMode == 1 || vOn <= 0.001) discard;
        float b = bayer4(gl_FragCoord.xy);
        // tint: 0 warm (a counted vote), 1 pale (a ghost's vote), 2 CRIMSON (vote-fix5: the nominee on the block)
        vec3 warm = vGhost < 0.5 ? vec3(1.0, 0.80, 0.46) : vGhost < 1.5 ? vec3(0.78, 0.9, 1.0) : vec3(1.0, 0.22, 0.26);
        float lv;
        if (vKind < 0.5) {
          // 3 bands across the beam: its EDGES bright (the cone's silhouette), its middle - where the figure stands -
          // faint, so the voter stays readable inside it; along it: faint over the figure (v < 0.42), full above the
          // head, fading out toward the top in 2 dithered steps
          float f = vFace + (b - 0.5) * 0.22;
          lv = f < 0.28 ? 1.0 : f < 0.55 ? 0.42 : 0.16;
          float v = vUv.y + (b - 0.5) * 0.14;
          lv *= v < 0.42 ? 0.45 : v < 0.8 ? 1.0 : v < 0.9 ? 0.5 : v < 0.96 ? 0.22 : 0.0;
          lv *= uGain.x;
        } else {
          float d = vUv.x + (b - 0.5) * 0.16;
          lv = vKind < 1.5 ? (d < 0.3 ? 1.0 : 0.8) : (d < 0.66 ? 0.6 : d < 0.86 ? 0.32 : 0.15 * step(b, 0.5));
          lv *= uGain.y;
        }
        lv *= vOn;
        if (lv <= 0.002) discard;
        gl_FragColor = vec4(warm * lv, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'vote-spotlights';
  mesh.layers.set(LAYERS.COLOR_ONLY);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  engine.scene.add(mesh);
  const lit = new Set();
  return {
    mesh,
    /** seat i: feet (x, y, z), ground y (the outer pool ring), scale, drop 0..1 (the beam's lower end), pool 0..1, on 0..1 */
    set(i, { x, y, z, ground = 0.03, scale = 1, drop = 1, pool = 1, on = 1, ghost = false, tint = null }) {
      uAt.value[i].set(x, y, z, scale); uSt.value[i].set(on, drop, ground, tint ?? (ghost ? 1 : 0)); uPool.value[i] = pool;
      if (on > 0) lit.add(i); else lit.delete(i);
    },
    off(i) { uSt.value[i].x = 0; uPool.value[i] = 0; lit.delete(i); },
    allOff() { for (let i = 0; i < count; i++) { uSt.value[i].x = 0; uPool.value[i] = 0; } lit.clear(); },
    /** brightness of the beams / pools (day ~0.3 / 0.42, night brighter: the dark town takes more light) */
    gain(beam, pool) { uGain.value.set(beam, pool); },
    info: () => ({ lit: [...lit].filter((i) => i < seats).sort((a, b) => a - b), extra: [...lit].filter((i) => i >= seats).map((i) => i - seats), gain: [+uGain.value.x.toFixed(2), +uGain.value.y.toFixed(2)] }),
    dispose() { mesh.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}
