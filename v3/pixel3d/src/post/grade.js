// Colour grade + vignette/grain (owner: lighting). docs/TECHNIQUES.md §3.8.
//
//   const g = addGrade(engine, {saturation, contrast, lift, gain, palette, paletteStrength, quantize,
//                               vignette, grain});
//   g.set({...}) changes options later; g.grade / g.vignette are the two pipeline passes.
//
// Pass 'grade' (order 200), all in linear light:
//   - saturation + contrast in OKLab (hue preserving), contrast pivots around mid-grey lightness
//   - cool lift in the darks, per-channel gain
//   - optional OKLab palette snap: palette = ['#hex', ...] (<= 32) -> nearest entry (weights L x1, ab x0.5)
//   - optional OKLab posterize: quantize = n -> L, a, b each snapped to n levels (no dither, ever)
// Pass 'vignette' (order 250): 3-step BANDED corner vignette + per-texel grain refreshed at 12 fps.
//
// Any option left undefined falls back to engine.style.grade (set by applyTimeOfDay in sky.js) every frame,
// so addGrade and applyTimeOfDay can be called in either order.
import * as THREE from 'three';

const DEFAULTS = { saturation: 1.0, contrast: 1.0, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.10, grain: 0.0,
  paletteStrength: 1.0, quantize: 0 };
const MAX_PAL = 32;

// linear sRGB -> OKLab (Björn Ottosson)
function linToOklab(c) {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return new THREE.Vector3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}

const OKLAB_GLSL = /* glsl */`
vec3 linToOklab(vec3 c) {
  c = max(c, 0.0);
  vec3 lms = vec3(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
                  dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
                  dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(lms, vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
              dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}
vec3 oklabToLin(vec3 L) {
  vec3 lms = vec3(L.x + 0.3963377774 * L.y + 0.2158037573 * L.z,
                  L.x - 0.1055613458 * L.y - 0.0638541728 * L.z,
                  L.x - 0.0894841775 * L.y - 1.2914855480 * L.z);
  lms = lms * lms * lms;
  return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
              dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
              dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
}
`;

export function addGrade(engine, opts = {}) {
  const pipeline = engine.pipeline;
  let own = { ...opts };

  const gradeU = {
    uSat: { value: 1 }, uContrast: { value: 1 },
    uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uPal: { value: Array.from({ length: MAX_PAL }, () => new THREE.Vector3()) },
    uPalCount: { value: 0 }, uPalStrength: { value: 1 }, uQuant: { value: 0 },
  };
  const grade = pipeline.addPass({
    name: 'grade', order: 200,
    material: pipeline.makeLowresMaterial({
      uniforms: gradeU,
      fragment: OKLAB_GLSL + /* glsl */`
        uniform float uSat, uContrast, uPalStrength, uQuant;
        uniform vec3 uLift, uGain;
        uniform vec3 uPal[${MAX_PAL}];
        uniform int uPalCount;
        void main() {
          vec4 src = texture2D(tColor, vUv);
          vec3 c = max(src.rgb, 0.0);
          vec3 lab = linToOklab(c);
          lab.yz *= uSat;
          lab.x = 0.55 + (lab.x - 0.55) * uContrast;
          c = max(oklabToLin(lab), 0.0);
          c = c * uGain + uLift * (1.0 - clamp(luma(c) * 2.0, 0.0, 1.0));
          if (uQuant > 0.5) {
            vec3 q = linToOklab(c);
            q.x = floor(q.x * uQuant + 0.5) / uQuant;
            q.yz = floor(q.yz * uQuant * 2.5 + 0.5) / (uQuant * 2.5);
            c = max(oklabToLin(q), 0.0);
          }
          if (uPalCount > 0) {
            vec3 p = linToOklab(c);
            vec3 w = vec3(1.0, 0.5, 0.5);
            float best = 1e9; vec3 bestLab = p;
            for (int i = 0; i < ${MAX_PAL}; i++) {
              if (i >= uPalCount) break;
              vec3 d = (uPal[i] - p) * w;
              float e = dot(d, d);
              if (e < best) { best = e; bestLab = uPal[i]; }
            }
            c = mix(c, max(oklabToLin(bestLab), 0.0), uPalStrength);
          }
          gl_FragColor = vec4(c, src.a);
        }`,
    }),
  });

  const vigU = { uVignette: { value: 0.1 }, uGrain: { value: 0 }, uCamTexel: { value: new THREE.Vector2() } };
  const vignette = pipeline.addPass({
    name: 'vignette', order: 250,
    material: pipeline.makeLowresMaterial({
      uniforms: vigU,
      fragment: /* glsl */`
        uniform float uVignette, uGrain;
        uniform vec2 uCamTexel;   // camera's snapped position in whole texels (grain is glued to the world grid)
        float ghash(vec2 p) { uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
          return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0); }
        void main() {
          vec4 src = texture2D(tColor, vUv);
          vec3 c = src.rgb;
          vec2 q = (vUv - 0.5) * vec2(uLowSize.x / uLowSize.y, 1.0);
          // banded: centre untouched, 3 hard steps confined to the corners (r = 0.72 .. 1.0 of the half-diagonal),
          // so the steps never cross the meadow as soft diagonal streaks (each extra ring = one more tone)
          float r = length(q) / length(vec2(0.5 * uLowSize.x / uLowSize.y, 0.5));
          float v = floor(clamp((r - 0.72) / 0.28, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
          c *= 1.0 - uVignette * v;
          if (uGrain > 0.0) {
            float g = ghash(floor(gl_FragCoord.xy) + uCamTexel + floor(uTime * 12.0) * 61.0) - 0.5;
            c += g * uGrain * (0.5 + luma(c));
          }
          gl_FragColor = vec4(max(c, 0.0), src.a);
        }`,
    }),
  });

  const pick = (k) => own[k] ?? engine.style?.grade?.[k] ?? DEFAULTS[k];
  const vec = (v, out) => (Array.isArray(v) ? out.set(v[0], v[1], v[2]) : v?.isColor ? out.set(v.r, v.g, v.b) : out.copy(v));
  let palKey = null;
  const sync = () => {
    gradeU.uSat.value = pick('saturation');
    gradeU.uContrast.value = pick('contrast');
    vec(pick('lift'), gradeU.uLift.value);
    vec(pick('gain'), gradeU.uGain.value);
    gradeU.uQuant.value = pick('quantize') || 0;
    gradeU.uPalStrength.value = pick('paletteStrength');
    const pal = pick('palette');
    const key = pal ? pal.join(',') : '';
    if (key !== palKey) {
      palKey = key;
      const list = (pal || []).slice(0, MAX_PAL);
      list.forEach((hex, i) => gradeU.uPal.value[i].copy(linToOklab(new THREE.Color(hex))));
      gradeU.uPalCount.value = list.length;
    }
    vigU.uVignette.value = pick('vignette');
    vigU.uGrain.value = pick('grain');
  };
  grade.update = sync;
  // lead (atmosphere contract): anchor the grain to the world texel grid instead of the screen, so a whole-texel
  // pan shifts the grain with the image (no 35 % 'crawl' at night). Camera snaps target·right/up to texels.
  vignette.update = (eng) => {
    const c = eng.camera, t = c.texelWorld;
    vigU.uCamTexel.value.set(Math.round(c.target.dot(c.right) / t), Math.round(c.target.dot(c.up) / t));
  };
  sync();
  return {
    grade, vignette,
    set(o) { own = { ...own, ...o }; sync(); },
  };
}
