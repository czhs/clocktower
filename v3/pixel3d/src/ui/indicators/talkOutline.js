// Talking silhouette outline (owner: indicators; docs/UI.md row 15, v2 apps/client/src/game/fx/talking.ts).
//
// v2 dilates the speaking sprite's alpha by one pixel and draws that ring in pale gold (#ffe7a3; yourself on air: rose).
// pixel3d characters are 3D, so the ring is a low-res post pass over the outline flags: inside each talker's screen
// rect, a texel that is NOT a character texel but has a 4-neighbour that IS one (FLAG_CHAR, at the talker's depth ±
// 0.9 m, so a neighbour standing behind never gets ringed) becomes the talk colour. "behind" mode (v2's default): the
// ring texel itself must not be nearer than the talker (a prop / wall in front hides the ring like the body).
// 4-neighbour = a clean 1-px line with no doubled corner pixels (ART_DIRECTION rubric #3). r2: a SECOND 1-px ring one
// texel further out in m.line (talk → goldLine, self → ramp(danger).line): the pale ring alone vanished on noon cobbles.
//
// Pass order 290: after grade (200) and vignette (250), so the token colour lands exactly (no grade tint), before the
// UI world layer (300) so labels / glyphs / bubbles stay on top.
//
//   const o = createTalkOutline(engine, () => [{ pos: Vector3 (feet), height: m, color: "#FFE7A3", line: "#5E4220" }, ...]);
//   o.pass.enabled = false;  // off
import * as THREE from 'three';
import { MARGIN } from '../../core/PixelCamera.js';
import { rgba } from '../kit.js';

export const MAX_TALKERS = 8;

export function createTalkOutline(engine, listFn, { order = 290 } = {}) {
  const rects = Array.from({ length: MAX_TALKERS }, () => new THREE.Vector4());
  const cols = Array.from({ length: MAX_TALKERS }, () => new THREE.Vector3());
  const lines = Array.from({ length: MAX_TALKERS }, () => new THREE.Vector3());
  const depths = new Array(MAX_TALKERS).fill(0);
  const U = { uRects: { value: rects }, uCols: { value: cols }, uLines: { value: lines }, uDepths: { value: depths }, uCount: { value: 0 } };
  const v = new THREE.Vector3();
  const s2l = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };

  // integer pixel (x right, y DOWN from the top) of a world point in the padded low-res frame (same as layer.js L.at)
  const at = (p) => {
    const cam = engine.camera, t = cam.texelWorld, R = cam.right, Up = cam.up, T = cam.target;
    const cx = Math.round(T.dot(R) / t) * t, cy = Math.round(T.dot(Up) / t) * t;
    return { x: Math.floor((p.dot(R) - cx) / t + engine.lowW / 2 + MARGIN), y: Math.floor(engine.lowH / 2 + MARGIN - (p.dot(Up) - cy) / t) };
  };
  const depthOf = (p) => {
    const cam = engine.camera.cam;
    cam.updateMatrixWorld();
    v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    return -v.z;
  };

  const pass = engine.pipeline.addPass({
    name: 'ui-talk-outline', order,
    update: () => {
      engine.camera.snapWorld(new THREE.Vector3(), v);    // camera basis current
      const list = (listFn() || []).slice(0, MAX_TALKERS);
      const H = engine.lowH + 2 * MARGIN;
      list.forEach((m, i) => {
        const f = at(m.pos), h = at(m.pos.clone().setY(m.pos.y + m.height + 0.35));
        const half = Math.ceil((f.y - h.y) * 1.0) + 3;      // wide hats / props / tails
        // rect in shader texel coords (x right, y UP from the bottom), inclusive bounds
        rects[i].set(f.x - half, H - 1 - (f.y + 4), f.x + half, H - 1 - (h.y - 3));
        const c = rgba(m.color);
        cols[i].set(s2l(c[0]), s2l(c[1]), s2l(c[2]));
        const ln = rgba(m.line || m.color);
        lines[i].set(s2l(ln[0]), s2l(ln[1]), s2l(ln[2]));
        depths[i] = depthOf(m.pos.clone().setY(m.pos.y + m.height * 0.5));
      });
      U.uCount.value = list.length;
    },
    material: engine.pipeline.makeLowresMaterial({
      uniforms: U,
      defines: { MAX_T: MAX_TALKERS },
      fragment: /* glsl */`
        uniform vec4 uRects[MAX_T];
        uniform vec3 uCols[MAX_T];
        uniform float uDepths[MAX_T];
        uniform int uCount;
        uniform vec3 uLines[MAX_T];
        bool anyChar(vec2 uv) { return abs(flagAt(uv) - FLAG_CHAR) < 0.08; }
        bool isChar(vec2 uv, float d) {
          return anyChar(uv) && abs(linDepth(uv) - d) < 0.9;
        }
        // first ring: a non-character texel with a 4-neighbour character texel at the talker's depth
        bool ring1(vec2 uv, float d, vec2 tx) {
          if (anyChar(uv)) return false;
          return isChar(uv + vec2(tx.x, 0.0), d) || isChar(uv - vec2(tx.x, 0.0), d) ||
                 isChar(uv + vec2(0.0, tx.y), d) || isChar(uv - vec2(0.0, tx.y), d);
        }
        void main() {
          vec4 s = texture2D(tColor, vUv);
          vec2 px = floor(vUv * uLowSize);
          vec2 tx = texel();
          gl_FragColor = s;
          if (uCount == 0 || anyChar(vUv)) return;
          for (int i = 0; i < MAX_T; i++) {
            if (i >= uCount) break;
            vec4 r = uRects[i];
            if (px.x < r.x || px.x > r.z || px.y < r.y || px.y > r.w) continue;
            float d = uDepths[i];
            if (!isBackground(vUv) && linDepth(vUv) < d - 0.35) continue;      // something in front: hidden (v2 'behind')
            if (ring1(vUv, d, tx)) { gl_FragColor = vec4(uCols[i], s.a); return; }
            // second ring (r2): 1 texel further out, the dark own-colour line (pale gold alone vanished on noon cobbles)
            if (ring1(vUv + vec2(tx.x, 0.0), d, tx) || ring1(vUv - vec2(tx.x, 0.0), d, tx) ||
                ring1(vUv + vec2(0.0, tx.y), d, tx) || ring1(vUv - vec2(0.0, tx.y), d, tx)) {
              gl_FragColor = vec4(uLines[i], s.a);
              return;
            }
          }
        }`,
    }),
  });
  return { pass, uniforms: U };
}
