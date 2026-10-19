// Contact darkening (owner: town foundation lead). docs/TOWN.md §12.7.
//
// A cheap screen-space contact term, quantised to two toon steps: a FLOOR texel (world y < 0.08, up-facing) whose
// neighbourhood (a fixed set of ~22 texel offsets: sideways and up the screen, where a solid standing on or behind
// it is drawn) contains solid geometry rising from the ground within 0.2 m horizontally is darkened one step
// (x 0.84) or, within 0.08 m, two steps (x 0.70); the bottom texel row of a wall / post / barrel (world y < 0.07,
// not up-facing) gets the inner step too. Pure function of the per-texel world positions (G-buffer depth + normal),
// so it is texel-stable on whole-texel pans (crawl-free) and costs one low-res pass. No new hues: a ramp step is
// darkened by 0.70..0.84 (ART_DIRECTION: patterns may darken a ramp by a step).
//
//   addContact(engine, {inner 0.70, outer 0.84, reach 0.2, core 0.08, enabled}) -> {pass, uniforms, set}
import * as THREE from 'three';

// texel offsets (x right, y up the screen): the base of anything standing next to / behind a floor texel
const TAPS = [];
for (const dx of [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6]) TAPS.push([dx, 0]);
for (const dy of [1, 2, 3, 4, 5]) for (const dx of dy <= 2 ? [-2, 0, 2] : [-1, 1]) TAPS.push([dx, dy]);

export function addContact(engine, opts = {}) {
  const pipeline = engine.pipeline;
  const U = {
    uContact: { value: new THREE.Vector4(opts.inner ?? 0.70, opts.outer ?? 0.84, opts.reach ?? 0.2, opts.core ?? 0.08) },
  };
  const taps = TAPS.map(([x, y]) => `  tap(P, vec2(${x.toFixed(1)}, ${y.toFixed(1)}), dmin);`).join('\n');
  const material = pipeline.makeLowresMaterial({
    uniforms: U,
    fragment: /* glsl */`
      uniform vec4 uContact;   // inner factor, outer factor, reach (m), core (m)
      float upOf(vec2 uv) { return dot(viewNormal(uv), uViewMat[1].xyz); }   // world N.y of the texel
      void tap(vec3 P, vec2 o, inout float dmin) {
        vec2 uv = vUv + o * texel();
        if (isBackground(uv)) return;
        vec3 Q = worldPos(uv);
        if (Q.y < P.y + 0.1 || Q.y > 1.6) return;               // a solid rising from the floor (not a far roof)
        dmin = min(dmin, length(Q.xz - P.xz));
      }
      void main() {
        vec4 src = texture2D(tColor, vUv);
        gl_FragColor = src;
        if (src.a < 0.1 || isBackground(vUv)) return;           // emissive texels, sky
        vec3 P = worldPos(vUv);
        if (P.y > 0.08 || P.y < -0.12) return;
        float up = upOf(vUv);
        // floor: an up-facing texel, or (grass / flower sprites write their own normals) a texel whose neighbour up the
        // screen is still on the floor plane (a wall rises ~4 cm per texel)
        vec2 uvUp = vUv + vec2(0.0, texel().y);
        bool floorT = up > 0.85 || (!isBackground(uvUp) && worldPos(uvUp).y < P.y + 0.02);
        float f = 1.0;
        if (floorT) {
          float dmin = 1e3;
${taps}
          f = dmin < uContact.w ? uContact.x : (dmin < uContact.z ? uContact.y : 1.0);
        } else if (up < 0.5 && P.y < 0.07 && P.y > -0.05) {
          // bottom row of a wall / post: the texel below it on screen is floor
          vec2 uv = vUv - vec2(0.0, texel().y);
          if (!isBackground(uv) && upOf(uv) > 0.85 && worldPos(uv).y < 0.08) f = uContact.y;
        }
        gl_FragColor = vec4(src.rgb * f, src.a);
      }`,
  });
  // the stock uniforms carry uViewMat (world -> view); it is refreshed by the pipeline every frame
  const pass = pipeline.addPass({ name: 'contact', order: 45, material, enabled: opts.enabled ?? true });
  return {
    pass, uniforms: U,
    set(o = {}) {
      const c = U.uContact.value;
      if (o.inner !== undefined) c.x = o.inner;
      if (o.outer !== undefined) c.y = o.outer;
      if (o.reach !== undefined) c.z = o.reach;
      if (o.core !== undefined) c.w = o.core;
      if (o.enabled !== undefined) pass.enabled = o.enabled;
    },
  };
}
