// v3 perf (cpu). The 'cpu' quality tier: the 3D town on software GL (SwiftShader / llvmpipe / a blocklisted GPU) or
// on a device too slow for 'low' (docs/perf-v3/cpu.md). SwiftShader is geometry-bound (docs/perf-v3/recon-frame.md
// §2.3: the normal pass is a second full scene render, ~45 % of a frame), so the levers cut scene renders first and
// pixels second. Everything here acts on the live Engine from outside (the vendor tree is read-only):
//
//   resolution   internal rows ≈ CPU_ROWS (pixelScale max(2, round(h / CPU_ROWS))) — engineHost's resize
//   frame cap    CPU_FPS_CAP (the rAF loop skips frames; ct.debug.fps still wins) — engineHost
//   shadows      renderer.shadowMap off + the sun casts none (no shadow pass, no shadow compare in any program)
//   normal pass  skipped (the pipeline already cleared rtNormal to a flat normal, no outline flags); the passes that
//                only read it (outline, contact) are off
//   post         the per-body water passes are off by default; grade + vignette stay (the look's colour)
//   point lights kept out of the render with a camera-invisible layer: the game's light pool (borrow / aim / dim, the
//                carried lanterns) runs unchanged, every program compiles with 0 point lights, day and night
//   grass        the grass / reed / flower tuft sprites hidden (vendor world/grass.js meshes named 'grass'): 40-80 k
//                instanced alpha-cut 12×12-texel sprites whose fragment count does not shrink with the resolution;
//                −47 % of a cpu-tier frame on SwiftShader. The ground underneath keeps the same toon colours.
//   materials    the toon lighting without the per-fragment cloud-shadow FBM and the normal noise: SwiftShader runs
//                both sides of a branch (masked SIMD), so a uniform that switches them off saves nothing (measured);
//                they are compiled out with two macros (CPU_TOON_MACROS) appended to a fragment chunk three includes
//                after the vendor's shader head and before main()
//   twins (v3.1) the town kit walls / roofs (town-kit-solid / -glass) and the ground drawn with a MeshBasicMaterial
//                "toon twin" that re-hosts the vendor's own hooks (patterns, tones, the cut-away) with the same toon
//                band per pixel, without the MeshLambertMaterial program around it: see "toon twin" below
//                (the per-vertex "cheap kit" is kept as a diagnostic: it does not carry the cut-away)
//   rewrites     the final program text through named rewrites (the ground's intro-flight branches -> constant 0)
//
// ct.debug.cpuShade (localStorage) overrides the v3.1 set for A/B runs: 'none' = the v3.0 cpu tier, or a comma list.
//
// Pure helpers are exported for unit tests; installCpuTier() is called by engineHost for tier 'cpu' only, so the GPU
// tiers ('high', 'low') are untouched.
import * as THREE from 'three';
import type { Tier } from '../contract';

/** Target internal rows of the low-res target at the cpu tier (960×540 -> pixelScale 3 -> 320×180). */
export const CPU_ROWS = 180;
/** rAF frames per second at the cpu tier (every 2nd frame of a 60 Hz display; 24 would land on every 3rd = 20 fps):
 *  steady pacing, and a cheap view (indoors) leaves the CPU to the rest of the page. */
export const CPU_FPS_CAP = 30;
/** Camera-invisible layer that keeps point lights out of the render (three only gathers lights the camera sees). */
export const CPU_LIGHT_LAYER = 31;
/** Post passes the cpu tier switches off. The outline / contact passes read the skipped normal pass. */
export const CPU_PASSES_OFF = /^(outline|contact|river|water-)/;
/**
 * Compiled into every lit fragment shader of a cpu-tier renderer (vendor materials/toon.js names): no cloud shadows
 * (`cloudAtten(p)` = clear sky), no lighting-normal noise (the `uNormalNoise > 0.0` block folds away).
 */
export const CPU_TOON_MACROS = '\n#define cloudAtten(p) 1.0\n#define uNormalNoise 0.0\n';
/** The three chunk that carries the macros (fragment only; included after the toon head, right before main()). */
export const CPU_TOON_CHUNK = 'clipping_planes_pars_fragment';
/** Meshes hidden at the cpu tier (by mesh name): the vendor's tuft sprite fields (createGrass names them 'grass'). */
export const CPU_HIDDEN_MESH = /^grass$/;
/** Light re-scan period (frames): lights created after the warm-up (none today) leave the render within this. */
const RESCAN_FRAMES = 60;

// ------------------------------------------------------------------------------------------ program rewrites (v3.1)
// The cpu tier can rewrite the FINAL program text (gl.shaderSource of the cpu renderer's own context, so no material,
// cache key or other renderer is touched) with named rewrites: a compile-time constant, or a vendor function renamed
// to <name>Full with a cheap one inserted under its name (swapFn). A rewrite whose anchor is missing (a vendor
// re-publish changed the text) leaves the program as it is (the anchor test in cpuTier.test.ts shows it).
// Measured (docs/perf-v3/cpu.md §7): per-pixel arithmetic is NOT where a SwiftShader frame goes — the ground and kit
// patterns and the whole toon lighting block dead-code-eliminated together save 9 %; so only the free, pixel-identical
// rewrite ships, the rest are diagnostics for the perf probes (ct.debug.cpuShade / engine.__ctCpuShade).

/** A named rewrite of the final program text; `apply` returns the text unchanged when its anchor is missing. */
export interface CpuRewrite {
  name: string;
  /** What it costs the look (for the doc / __ctCamera.v3()). */
  look: string;
  /** Diagnostic only (perf probes via ct.debug.cpuShade / engine.__ctCpuShade): never in the default set. */
  diag?: boolean;
  apply(src: string): string;
}

/**
 * Rename the function whose definition starts with `sig` (text up to and incl. its '{') to `<name>Full` and insert
 * `body` (the cheap definition under the vendor's name) right after its closing brace, so every later caller (main or
 * another function) binds to the cheap one. Unchanged when `sig` is missing or its braces do not close.
 */
export function swapFn(src: string, name: string, sig: string, body: string): string {
  const at = src.indexOf(sig);
  if (at < 0 || !sig.endsWith('{')) return src;
  let depth = 0;
  let end = -1;
  for (let i = at + sig.length - 1; i < src.length; i++) {
    const ch = src.charCodeAt(i);
    if (ch === 123) depth++;
    else if (ch === 125 && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return src;
  return src.slice(0, at) + sig.replace(`${name}(`, `${name}Full(`) + src.slice(at + sig.length, end) + '\n' + body + src.slice(end);
}

export const CPU_REWRITES: readonly CpuRewrite[] = [
  {
    // the ground's intro-flight branches (uCamFlight, only src/demo/intro.js sets it; the game never does): constant 0
    name: 'flight',
    look: 'none (pixel-identical: the game never flies the camera)',
    apply(src) {
      const decl = 'uniform float uCamFlight;';
      const at = src.indexOf(decl);
      if (at < 0 || src.includes('#define uCamFlight')) return src;
      return src.slice(0, at + decl.length) + '\n#define uCamFlight 0.0\n' + src.slice(at + decl.length);
    },
  },
  // ---- diagnostics (never default; perf probes only): what a family's shading costs, by dead-code elimination
  {
    name: 'xKitFlat',
    look: 'diagnostic: no kit patterns',
    diag: true,
    apply: (src) => swapFn(src, 'kitPattern', 'float kitPattern(vec3 p, vec3 n, float kind, float sc) {', 'float kitPattern(vec3 p, vec3 n, float kind, float sc) { return 1.0; }'),
  },
  {
    name: 'xGroundFlat',
    look: 'diagnostic: the ground in its lawn tone only',
    diag: true,
    apply: (src) => src.replace('toonHi = uGT[k * 3]; toonMid = uGT[k * 3 + 1]; toonSh = uGT[k * 3 + 2];', 'toonHi = uGT[0]; toonMid = uGT[1]; toonSh = uGT[2];'),
  },
  {
    name: 'xToonMid',
    look: 'diagnostic: every toon pixel in its mid tone (the lighting block dead)',
    diag: true,
    apply: (src) => src.replace(/\n(\s*)outgoingLight \+= totalEmissiveRadiance;/, '\n$1outgoingLight = toonMid;\n$1outgoingLight += totalEmissiveRadiance;'),
  },
];

/** What the cpu tier applies by default: the shipping rewrites + the kit swap (ct.debug.cpuShade overrides: 'none' or
 *  a comma list). Measured and left out (v3.1, docs/perf-v3/cpu.md §7): grid lane setts instead of the voronoi, cheap kit
 *  patterns, hard toon bands — all within noise (< 5 %), because per-pixel arithmetic is not where the frame goes. */
// The twins ('kitBasic', 'groundTwin') are opt-in: once they carry the vendor cut-away (as they must: the game uses
// it) they measure within noise of the toon materials (190 vs 191 ms), because the cut-away's per-pixel test is the
// expensive part (docs/perf-v3/cpu.md §7). Default = the pixel-identical rewrite only.
export const CPU_SHADE_DEFAULT: readonly string[] = CPU_REWRITES.filter((r) => !r.diag).map((r) => r.name);
const SHADE_NAMES = new Set([...CPU_REWRITES.map((r) => r.name), 'kitBasic', 'kitPat', 'kitVtx', 'kitTwin', 'groundTwin']);

/** The rewrite set from a ct.debug.cpuShade value: null / '' = the default; 'none' = no rewrites; else a comma list. */
export function cpuShadeFrom(v: string | null | undefined): Set<string> {
  if (!v) return new Set(CPU_SHADE_DEFAULT);
  if (v === 'none') return new Set();
  return new Set(v.split(',').map((x) => x.trim()).filter((x) => SHADE_NAMES.has(x)));
}

/** Apply the named rewrites (in CPU_REWRITES order) to one program's final text. */
export function rewriteCpuShader(src: string, shade: ReadonlySet<string>): string {
  let s = src;
  for (const r of CPU_REWRITES) if (shade.has(r.name)) s = r.apply(s);
  return s;
}

/** The slice of a GL context the rewrite hook touches. */
export interface ShaderSourceGl {
  shaderSource(shader: unknown, source: string): void;
}

/**
 * Route this context's shaderSource through rewriteCpuShader (the live `shade` set is read per program). Returns the
 * restore function and a counter of programs whose text changed.
 */
export function hookShaderSource(gl: ShaderSourceGl, shade: ReadonlySet<string>): { restore(): void; changed(): number } {
  const own = Object.prototype.hasOwnProperty.call(gl, 'shaderSource');
  const prev = gl.shaderSource;
  let changed = 0;
  const hooked = function (this: unknown, sh: unknown, src: string) {
    const out = shade.size ? rewriteCpuShader(src, shade) : src;
    if (out !== src) changed++;
    return prev.call(this, sh, out);
  };
  gl.shaderSource = hooked;
  return {
    restore() {
      if (gl.shaderSource !== hooked) return;
      if (own) gl.shaderSource = prev;
      else delete (gl as Partial<ShaderSourceGl>).shaderSource;
    },
    changed: () => changed,
  };
}

function debugShade(): string | null {
  try {
    return globalThis.localStorage?.getItem('ct.debug.cpuShade') ?? null;
  } catch {
    return null;
  }
}

/** pixelScale for a canvas height at a tier; the GPU tiers keep coords.ts pixelScaleFor. */
export function cpuPixelScale(heightCss: number): number {
  return Math.max(2, Math.round(heightCss / CPU_ROWS));
}

/** The frame cap a tier runs at: an explicit ct.debug.fps (> 0) wins; the cpu tier caps at CPU_FPS_CAP. */
export function tierFpsLimit(tier: Tier, debugFps: number | undefined): number {
  if (debugFps && debugFps > 0) return debugFps;
  return tier === 'cpu' ? CPU_FPS_CAP : 0;
}

/** Is this post pass off at the cpu tier? */
export function cpuPassOff(name: string | undefined): boolean {
  return !!name && CPU_PASSES_OFF.test(name);
}

/** The slice of a pixel3d Engine the cpu tier touches (structural, for tests). */
export interface CpuEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun?: THREE.DirectionalLight | null;
  pipeline: { rtNormal?: unknown; passes: { name?: string; enabled?: boolean }[] };
}

export interface CpuTier {
  /** Before every pipeline render (engineHost's pipe.render wrapper): re-asserts the levers the vendor may flip back. */
  beforeRender(): void;
  /** Stats for __ctCamera.v3() / the perf doc. */
  info(): { lightsHidden: number; meshesHidden: number; normalSkipped: number; passesOff: number; shade: string[]; shadersRewritten: number; kitSwapped: number };
  dispose(): void;
}

/** Move every point / spot light to the camera-invisible layer. Returns how many were moved this time. */
export function hideLights(scene: THREE.Object3D, hidden: Set<THREE.Light>): number {
  let n = 0;
  scene.traverse((o) => {
    const l = o as THREE.PointLight & THREE.SpotLight;
    if ((l.isPointLight || l.isSpotLight) && !hidden.has(l)) {
      l.layers.set(CPU_LIGHT_LAYER);
      hidden.add(l);
      n++;
    }
  });
  return n;
}

/** Add the cheap-toon macros to a chunk store (idempotent); returns the restore function. */
export function cheapenToonChunks(chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>): () => void {
  const was = chunks[CPU_TOON_CHUNK] ?? '';
  if (was.includes(CPU_TOON_MACROS)) return () => undefined;
  const now = was + CPU_TOON_MACROS;
  chunks[CPU_TOON_CHUNK] = now;
  return () => {
    // only while it is still ours (a newer cpu engine re-applies its own)
    if (chunks[CPU_TOON_CHUNK] === now) chunks[CPU_TOON_CHUNK] = was;
  };
}

/** Find the meshes the cpu tier hides (CPU_HIDDEN_MESH) that are not in `out` yet; returns how many were added. */
export function findHiddenMeshes(scene: THREE.Object3D, out: Set<THREE.Object3D>): number {
  let n = 0;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && CPU_HIDDEN_MESH.test(o.name) && !out.has(o)) {
      out.add(o);
      n++;
    }
  });
  return n;
}

// ------------------------------------------------------------------------------------------ cheap kit (v3.1)
// SwiftShader is geometry-bound: per pixel the toon shading is cheap (the dead-code diagnostics above: −9 %), but the
// toon programs carry ~8 varyings per vertex (world pos, light pos, cut, tone hi/sh, kit pattern, kit normal, view
// pos, colour) through clipping, triangle setup and interpolation. A MeshBasicMaterial for the town kit walls / roofs
// (most of the town's triangles) costs a third of that. The swap keeps the palette exactly where the vendor's toon
// is per-face anyway: the kit geometry is non-indexed with one normal per face and a directional sun, so the toon
// band (hi / mid / shadow tone, with the material's ramps, shadow definition and hemispheric term) is evaluated per
// VERTEX here and handed to the fragment as one colour multiplier. What it drops: the world-anchored kit patterns
// (block joints, boards, thatch streaks), the lantern-flicker steps of lit windows, and nothing else at the cpu tier
// (no shadows, clouds, point lights or normal pass there). The 'soft' kit layer stays toon (the canopy fade patches
// it, world/canopy.ts).

/** Kit materials (vendor town/kit.js kitMaterial names) the cpu tier swaps for CPU_KIT_SWAP. */
export const CPU_KIT_SWAP = /^town-kit-(solid|glass)$/;
/** The shade-set name that turns the kit swap on (default on; ct.debug.cpuShade without it = toon kit). */
export const CPU_KIT_SHADE = 'kitBasic';
/** The shade-set name that keeps the vendor's kit patterns (block joints, boards, thatch) on the swapped kit. */
export const CPU_KIT_PAT_SHADE = 'kitPat';
/** The shade-set name that draws the kit with the generic per-pixel toon twin instead (see "toon twin"). */
export const CPU_TWIN_KIT_SHADE = 'kitTwin';
/** The shade-set name that draws the ground with the generic toon twin. */
export const CPU_GROUND_SHADE = 'groundTwin';
/** The vendor ground mesh (town/pieces/ground.js: the drawn 20 m tiles share this name and the material). */
export const CPU_GROUND_MESH = /^ground-terrain$/;

type U = { value: unknown };
/** The uniform objects a vendor toon material binds (captured by running its onBeforeCompile on an empty shader). */
export function toonUniformsOf(m: THREE.Material): Record<string, U> {
  const fake = { uniforms: {} as Record<string, U>, vertexShader: '', fragmentShader: '', defines: {} };
  try {
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(fake, null);
  } catch {
    /* a hook that needs the real text: no uniforms */
  }
  return fake.uniforms;
}

/**
 * The fragment head a vendor toon material inserts after three's <common> (flags, toon uniforms, noise, the kit
 * patterns), captured by running its onBeforeCompile on a marker shader; null when it carries no kitPattern().
 */
export function kitFragmentHeadOf(m: THREE.Material): string | null {
  const END = '//ct-head-end';
  const fake = { uniforms: {} as Record<string, U>, vertexShader: '#include <common>', fragmentShader: `#include <common>\n${END}\n`, defines: {} };
  try {
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(fake, null);
  } catch {
    return null;
  }
  const f = fake.fragmentShader;
  const a = f.indexOf('#include <common>') + '#include <common>'.length;
  const b = f.indexOf(END);
  const head = b > a ? f.slice(a, b) : '';
  return head.includes('float kitPattern(') ? head : null;
}

const KIT_VERT_HEAD = /* glsl */ `
uniform vec3 uSunDir, uRampHi, uRampMid, uRampSh, uHemiSky, uHemiGround; uniform vec2 uBandThr; uniform float uAmbShading;
uniform vec4 uToneShape;
attribute vec3 toneHi; attribute vec3 toneSh;
varying vec3 vCtK;
#ifdef CT_KIT_GLASS
  attribute vec4 aGlow; varying vec4 vCtGlow;
#endif
#ifdef CT_KIT_PAT
  attribute vec2 aPat; varying vec2 vKitPat; varying vec3 vKitWN; varying vec3 vToonWorld;
#endif
`;
const KIT_VERT = /* glsl */ `
{
  vec3 ctN = normal;
  #ifdef USE_INSTANCING
    ctN = mat3(instanceMatrix) * ctN;
  #endif
  ctN = normalize(mat3(modelMatrix) * ctN);
  float ctNdl = dot(ctN, normalize(uSunDir));
  float ctL = max(ctNdl, 0.0);
  if (ctN.y > 0.55 && ctNdl > 0.0) ctL = max(ctL, uToneShape.z);
  float ctHi = step(uBandThr.y, ctL), ctMid = step(uBandThr.x, ctL);
  vec3 ctW = vec3(1.0 - ctMid, ctMid - ctHi, ctHi);
  vec3 ctHemi = ctN.y > 0.55 ? uHemiSky : (ctN.y < -0.35 ? uHemiGround : mix(uHemiSky, uHemiGround, 0.25));
  float ctDef = ctNdl > -0.45 ? 1.0 : 1.0 - uAmbShading;
  #ifdef USE_COLOR
    vec3 ctM = max(color.rgb, vec3(1e-4));
  #else
    vec3 ctM = vec3(1.0);
  #endif
  vCtK = ctW.z * (toneHi / ctM) * uRampHi + ctW.y * uRampMid + ctW.x * (toneSh / ctM) * uRampSh * ctDef * ctHemi;
  #ifdef CT_KIT_GLASS
    vCtGlow = aGlow;
  #endif
  #ifdef CT_KIT_PAT
    vKitPat = aPat; vKitWN = ctN;
    vec4 ctTw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      ctTw = instanceMatrix * ctTw;
    #endif
    vToonWorld = (modelMatrix * ctTw).xyz;
  #endif
}
`;
const KIT_FRAG_HEAD = /* glsl */ `
uniform vec4 uToneShape;
varying vec3 vCtK;
#ifdef CT_KIT_GLASS
  uniform float uKitGlow; varying vec4 vCtGlow;
#endif
`;
/** With the captured vendor head (it declares uToneShape, uKitGlow and the pattern varyings itself). */
const KIT_FRAG_HEAD_PAT = /* glsl */ `
varying vec3 vCtK;
#ifdef CT_KIT_GLASS
  varying vec4 vCtGlow;
#endif
`;
const KIT_FRAG = /* glsl */ `
diffuseColor.rgb *= vCtK;
#ifdef CT_KIT_PAT
  diffuseColor.rgb *= kitPattern(vToonWorld, normalize(vKitWN), vKitPat.x, vKitPat.y);
#endif
{
  float ctS = uToneShape.x <= 0.0 ? 1.0 : uToneShape.x;
  diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, ctS), 0.0);
}
vec3 ctEmit = vec3(0.0);
#ifdef CT_KIT_GLASS
  if (vCtGlow.a > 0.5 && uKitGlow > 0.5) { ctEmit = vCtGlow.rgb; diffuseColor.rgb = vec3(0.0); diffuseColor.a = 0.0; }
  else diffuseColor.a = 1.0;
#endif
`;

/** The cheap twin of a vendor kit material (see above). Shares the source's live uniform objects (sky, night glow). */
export function cheapKitMaterial(src: THREE.Material, patterns = false, uniforms: Record<string, U> = toonUniformsOf(src)): THREE.MeshBasicMaterial {
  const s = src as THREE.MeshLambertMaterial;
  const glass = /glass/.test(src.name);
  const head = patterns ? kitFragmentHeadOf(src) : null;
  const m = new THREE.MeshBasicMaterial({ color: s.color, vertexColors: s.vertexColors, side: s.side, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, depthWrite: s.depthWrite, depthTest: s.depthTest });
  m.blending = s.blending;
  m.blendEquation = s.blendEquation;
  m.blendSrc = s.blendSrc;
  m.blendDst = s.blendDst;
  m.blendEquationAlpha = s.blendEquationAlpha;
  m.blendSrcAlpha = s.blendSrcAlpha;
  m.blendDstAlpha = s.blendDstAlpha;
  m.name = `${src.name}-cpu`;
  m.defines = { ...(glass ? { CT_KIT_GLASS: '' } : {}), ...(head ? { CT_KIT_PAT: '' } : {}) };
  const pick = ['uSunDir', 'uRampHi', 'uRampMid', 'uRampSh', 'uHemiSky', 'uHemiGround', 'uBandThr', 'uAmbShading', 'uToneShape', ...(glass ? ['uKitGlow'] : [])];
  const bound: Record<string, U> = {};
  for (const k of pick) bound[k] = uniforms[k] ?? { value: k === 'uKitGlow' || k === 'uAmbShading' ? 0 : k === 'uBandThr' ? new THREE.Vector2(0.1, 0.5) : k === 'uToneShape' ? new THREE.Vector4(1, 0, 0, 0) : new THREE.Color(1, 1, 1) };
  if (!uniforms.uSunDir) bound.uSunDir = { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() };
  m.onBeforeCompile = (sh) => {
    // with the vendor head every uniform it declares is bound (uTime for the window flicker, ...)
    Object.assign(sh.uniforms, head ? uniforms : {}, bound);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${KIT_VERT_HEAD}`).replace('#include <project_vertex>', `#include <project_vertex>\n${KIT_VERT}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${head ? head + KIT_FRAG_HEAD_PAT : KIT_FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${KIT_FRAG}`)
      .replace('#include <opaque_fragment>', 'outgoingLight += ctEmit;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `ct-cpu-kit-${glass ? 'glass' : 'solid'}${head ? '-pat' : ''}`;
  m.userData.ctCpuSource = src;
  m.userData.ctCpuPat = !!head;
  return m;
}

// ------------------------------------------------------------------------------------------ toon twin (v3.1)
// The generic twin: the vendor toon material's OWN shader hooks (vertex head / normal / begin / project hooks, the
// fragment head and the albedo + tone block after <color_fragment>), captured by running its onBeforeCompile on a
// marker shader, re-hosted on a MeshBasicMaterial with the toon band evaluated per PIXEL from the world normal (the
// vendor's bandWeights / shadowDefinition / hemiTerm / toneSat / rampFor from that head). At the cpu tier (no
// shadows, clouds, point lights, normal pass) it draws the same pixels as the vendor's lighting block, without the
// MeshLambertMaterial program around it. Only for materials without lightMod / cloud / lightNormal / outgoing hooks
// (the ground and the kit; never characters or canopy-patched materials).

export interface ToonHooks {
  vHead: string;
  vNormal: string;
  vBegin: string;
  vProject: string;
  fHead: string;
  fColor: string;
  /** What wrappers (the vendor cut-away, town/cutaway.js) insert before / at the start of main() and at the output. */
  vPre: string;
  vMain: string;
  fPre: string;
  fMain: string;
  fOpaque: string;
}
const between = (s: string, a: string, b: string): string | null => {
  const i = s.indexOf(a);
  const j = i < 0 ? -1 : s.indexOf(b, i + a.length);
  return i < 0 || j < 0 ? null : s.slice(i + a.length, j);
};
/** The vendor toon hooks of a material (null when its onBeforeCompile does not fill the marker shader as expected). */
export function toonHooksOf(m: THREE.Material): ToonHooks | null {
  const fake = {
    uniforms: {} as Record<string, U>,
    vertexShader: '#include <common>\n//@A\nvoid main() {\n//@M\n#include <beginnormal_vertex>\n//@B\n#include <begin_vertex>\n//@C\n#include <project_vertex>\n//@D\n',
    fragmentShader: '#include <common>\n//@F\nvoid main() {\n//@N\n#include <color_fragment>\n//@G\n#include <opaque_fragment>\n//@H\n',
    defines: {},
  };
  try {
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(fake, null);
  } catch {
    return null;
  }
  const v = fake.vertexShader;
  const f = fake.fragmentShader;
  const h = {
    vHead: between(v, '#include <common>', '//@A'),
    vNormal: between(v, '#include <beginnormal_vertex>', '//@B'),
    vBegin: between(v, '#include <begin_vertex>', '//@C'),
    vProject: between(v, '#include <project_vertex>', '//@D'),
    fHead: between(f, '#include <common>', '//@F'),
    fColor: between(f, '#include <color_fragment>', '//@G'),
    vPre: between(v, '//@A', 'void main() {'),
    vMain: between(v, 'void main() {', '//@M'),
    fPre: between(f, '//@F', 'void main() {'),
    fMain: between(f, 'void main() {', '//@N'),
    fOpaque: between(f, '//@G', '//@H'),
  };
  if (Object.values(h).some((x) => x === null)) return null;
  if (!h.fOpaque!.includes('#include <opaque_fragment>')) return null;
  if (!h.vProject!.includes('vToonWorld') || !h.fHead!.includes('vec3 bandWeights(') || !h.fColor!.includes('vec3 toonMid')) return null;
  return h as ToonHooks;
}

const TWIN_BAND = /* glsl */ `
{
  vec3 toonN = normalize(vCtWN);
  float toonNdotL = dot(toonN, normalize(uSunDir));
  float toonUpY = toonN.y;
  float toonLit = max(toonNdotL, 0.0);
  if (toonUpY > 0.55 && toonNdotL > 0.0) toonLit = max(toonLit, uToneShape.z);
  vec3 toonW = bandWeights(toonLit, vToonCut);
  float toonDef = shadowDefinition(toonNdotL);
  toonHi = toneSat(toonHi); toonMid = toneSat(toonMid); toonSh = toneSat(toonSh);
  vec3 toonShTone = toonSh * rampFor(uRampSh, toonSh) * toonDef * hemiTerm(toonUpY);
  vec3 ctOut = toonW.z * toonHi * rampFor(uRampHi, toonHi) + toonW.y * toonMid * rampFor(uRampMid, toonMid) + toonW.x * toonShTone;
  #ifdef TOON_UNLIT_SH
    ctOut = toonSh * rampFor(uRampSh, toonSh);
  #endif
  diffuseColor.rgb = ctOut + totalEmissiveRadiance;
}
`;

/** The generic toon twin of a vendor toon material (null when its hooks cannot be captured). */
export function cheapToonMaterial(src: THREE.Material, hooks: ToonHooks | null = toonHooksOf(src), uniforms: Record<string, U> = toonUniformsOf(src)): THREE.MeshBasicMaterial | null {
  if (!hooks) return null;
  const s = src as THREE.MeshLambertMaterial;
  const m = new THREE.MeshBasicMaterial({ color: s.color, map: s.map, vertexColors: s.vertexColors, side: s.side, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, depthWrite: s.depthWrite, depthTest: s.depthTest });
  m.blending = s.blending;
  m.blendEquation = s.blendEquation;
  m.blendSrc = s.blendSrc;
  m.blendDst = s.blendDst;
  m.blendEquationAlpha = s.blendEquationAlpha;
  m.blendSrcAlpha = s.blendSrcAlpha;
  m.blendDstAlpha = s.blendDstAlpha;
  m.name = `${src.name || 'toon'}-cpu`;
  m.defines = { ...(s.defines ?? {}) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${hooks.vHead}\nvarying vec3 vCtWN;`)
      .replace(
        '#include <begin_vertex>',
        `#if !defined( USE_ENVMAP ) && !defined( USE_SKINNING )
  vec3 objectNormal = vec3( normal );
#endif
${hooks.vNormal}
{
  vec3 ctOn = objectNormal;
  #ifdef USE_INSTANCING
    ctOn = mat3(instanceMatrix) * ctOn;
  #endif
  vCtWN = normalize(mat3(modelMatrix) * ctOn);
}
#include <begin_vertex>
${hooks.vBegin}`,
      )
      .replace('#include <project_vertex>', `#include <project_vertex>\n${hooks.vProject}`)
      .replace('void main() {', `${hooks.vPre}\nvoid main() {\n${hooks.vMain}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${hooks.fHead}\nvarying vec3 vCtWN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nvec3 totalEmissiveRadiance = vec3(0.0);\n${hooks.fColor}\n${TWIN_BAND}`)
      .replace('#include <opaque_fragment>', hooks.fOpaque)
      .replace('void main() {', `${hooks.fPre}\nvoid main() {\n${hooks.fMain}`);
  };
  const key = `ct-cpu-twin-${src.uuid}`;
  m.customProgramCacheKey = () => key;
  m.userData.ctCpuSource = src;
  return m;
}

/** Which twin a mesh's material gets at the cpu tier: 'kit' / 'kitPat' (per-vertex kit), 'twin' (generic), or null. */
export type TwinPick = (mesh: THREE.Mesh, mat: THREE.Material) => string | null;

/** The cpu tier's pick from the shade set: the kit layers by material name, the ground by mesh name. */
export function twinPick(shade: ReadonlySet<string>): TwinPick {
  // the per-vertex kit ('kit' / 'kitPat') does not carry the vendor cut-away: diagnostics only (kitPat / kitVtx names)
  const kit = shade.has(CPU_KIT_SHADE) ? (shade.has('kitVtx') ? (shade.has(CPU_KIT_PAT_SHADE) ? 'kitPat' : 'kit') : 'twin') : null;
  const ground = shade.has(CPU_GROUND_SHADE) ? 'twin' : null;
  return (mesh, mat) => (CPU_KIT_SWAP.test(mat.name) ? kit : CPU_GROUND_MESH.test(mesh.name) ? ground : null);
}

function makeTwin(src: THREE.Material, key: string): THREE.Material | null {
  const m = key === 'twin' ? cheapToonMaterial(src) : cheapKitMaterial(src, key === 'kitPat');
  if (m) m.userData.ctCpuKey = key;
  return m;
}

/**
 * Swap every toon material under `root` that `pick` names for its cpu twin (cached per source + kind), or restore
 * them all (on = false). `swapped` remembers mesh -> source. Returns how many meshes changed.
 */
export function swapTwins(root: THREE.Object3D, on: boolean, swapped: Map<THREE.Mesh, THREE.Material>, cache: Map<THREE.Material, THREE.Material>, pick: TwinPick): number {
  let n = 0;
  if (!on) {
    for (const [mesh, src] of swapped) {
      if ((mesh.material as THREE.Material)?.userData?.ctCpuSource === src) mesh.material = src;
      n++;
    }
    swapped.clear();
    return n;
  }
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mesh.isMesh || !mat || Array.isArray(mat) || !(mat.userData as { toon?: unknown }).toon) return;
    const key = pick(mesh, mat);
    if (!key) return;
    let cheap = cache.get(mat);
    if (cheap && cheap.userData.ctCpuKey !== key) {
      cheap.dispose();
      cache.delete(mat);
      cheap = undefined;
    }
    if (!cheap) {
      const made = makeTwin(mat, key);
      if (!made) return;
      cache.set(mat, (cheap = made));
    }
    mesh.material = cheap;
    swapped.set(mesh, mat);
    n++;
  });
  return n;
}

/** The kit swap alone (per-vertex kit twin; tests / probes). */
export function swapKit(root: THREE.Object3D, on: boolean, swapped: Map<THREE.Mesh, THREE.Material>, cache: Map<THREE.Material, THREE.Material>, patterns = false): number {
  return swapTwins(root, on, swapped, cache, (_m, mat) => (CPU_KIT_SWAP.test(mat.name) ? (patterns ? 'kitPat' : 'kit') : null));
}

export function installCpuTier(engine: CpuEngine): CpuTier {
  const r = engine.renderer;
  // before the town build compiles anything: three resolves #include chunks when it builds a program
  const restoreChunks = cheapenToonChunks();
  // the live rewrite set (perf probes may change it on engine.__ctCpuShade and force a recompile)
  const shade = cpuShadeFrom(debugShade());
  (engine as CpuEngine & { __ctCpuShade?: Set<string> }).__ctCpuShade = shade;
  const gl = (r as Partial<THREE.WebGLRenderer>).getContext?.() as unknown as ShaderSourceGl | undefined;
  const srcHook = gl && typeof gl.shaderSource === 'function' ? hookShaderSource(gl, shade) : null;
  const pipe = engine.pipeline;
  const hidden = new Set<THREE.Light>();
  const hiddenMeshes = new Set<THREE.Object3D>();
  let frames = 0;
  let normalSkipped = 0;
  let passesOff = 0;
  const offShadows = () => {
    if (r.shadowMap.enabled) r.shadowMap.enabled = false;
    if (engine.sun?.castShadow) engine.sun.castShadow = false;
  };
  // the normal pass: the pipeline binds rtNormal, clears it (flat normal, no flags) and renders the scene into it
  const prevRender = r.render;
  r.render = function (this: THREE.WebGLRenderer, scene: THREE.Object3D, cam: THREE.Camera) {
    if (pipe.rtNormal && r.getRenderTarget() === pipe.rtNormal) {
      normalSkipped++;
      return;
    }
    return prevRender.call(this, scene, cam);
  } as typeof r.render;
  offShadows();
  hideLights(engine.scene, hidden);
  const twinSwapped = new Map<THREE.Mesh, THREE.Material>();
  const twinCache = new Map<THREE.Material, THREE.Material>();
  let twinSig: string | null = null;
  return {
    beforeRender() {
      offShadows();
      // water vis() updaters re-enable their pass every frame they are on screen
      let off = 0;
      for (const p of pipe.passes)
        if (cpuPassOff(p.name)) {
          p.enabled = false;
          off++;
        }
      passesOff = off;
      const rescan = ++frames % RESCAN_FRAMES === 1;
      if (rescan) {
        hideLights(engine.scene, hidden);
        findHiddenMeshes(engine.scene, hiddenMeshes);
      }
      // the twins follow the shade set (a probe may change it); pieces built later are picked up by the re-scan
      const sig = [...shade].sort().join(',');
      if (sig !== twinSig) {
        swapTwins(engine.scene, false, twinSwapped, twinCache, twinPick(shade));
        twinSig = sig;
        swapTwins(engine.scene, true, twinSwapped, twinCache, twinPick(shade));
      } else if (rescan) swapTwins(engine.scene, true, twinSwapped, twinCache, twinPick(shade));
      for (const m of hiddenMeshes) m.visible = false;
    },
    info: () => ({ lightsHidden: hidden.size, meshesHidden: hiddenMeshes.size, normalSkipped, passesOff, shade: [...shade], shadersRewritten: srcHook?.changed() ?? 0, kitSwapped: twinSwapped.size }),
    dispose() {
      // the sources go back into the scene first: disposeEngine frees what the scene holds
      swapTwins(engine.scene, false, twinSwapped, twinCache, () => null);
      for (const m of twinCache.values()) m.dispose();
      twinCache.clear();
      if (r.render !== prevRender) r.render = prevRender;
      restoreChunks();
      srcHook?.restore();
      hidden.clear();
      hiddenMeshes.clear();
    },
  };
}
