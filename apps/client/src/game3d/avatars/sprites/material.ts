// v3.3 sprites (default at the low / cpu tiers; ct.debug.v3sprites=0|1 forces). The sprite material: the vendor character look material
// (look.js characterMaterial with the spec's own options, so the SAME toon + look GLSL lights the sprite) on a
// camera-facing quad, patched so every per-vertex input of that shader comes from the baked atlas per texel:
//   normal (view space), depth offset (gl_FragDepth: the town occludes the figure per texel; the shadow lookup and the
//   self-shadow hull use the reconstructed position), palette tones (hi / mid / sh), part id (outline flags: the
//   outline pass draws the same inner lines), bone side (the far-half shadow is re-decided live from the facing and
//   the sun), lift, ghost halo, bind height (the shared ghost's fade bands).
// Plus a shadow caster: the sprite's silhouette on a vertical plane turned toward the sun.
import * as THREE from 'three';
import { spriteCharacterMaterial } from '../../vendor/spriteLook';
import { BIND_MAX, DEPTH_LO, DEPTH_RANGE, DEPTH_STEPS } from './atlas';
import type { SpriteSheet } from './bake';

export interface SpriteUniforms {
  uSprA: { value: THREE.Texture };
  uSprB: { value: THREE.Texture };
  /** Cell origin (texels) xy, cell size zw. */
  uSprCell: { value: THREE.Vector4 };
  /** Anchor in the cell (texels) xy, texel size (m) z. */
  uSprAnchor: { value: THREE.Vector4 };
  /** Far side (atlas.ts Side as float) */
  uSprFar: { value: number };
  /** 1 = draw the ghost halo texels (shared ghost, level 1). */
  uSprHalo: { value: number };
  /** 1 / (camera far - near): depth units per metre. */
  uSprDepthK: { value: number };
  /** Unit vector toward the camera (world). */
  uSprBack: { value: THREE.Vector3 };
  /** Shadow-coordinate change per metre toward the camera (shadow.matrix * back). */
  uSprShadowD: { value: THREE.Vector4 };
  uSprHi: { value: THREE.Vector3[] };
  uSprMid: { value: THREE.Vector3[] };
  uSprSh: { value: THREE.Vector3[] };
  /** Shadow caster: plane axis (horizontal, perpendicular to the sun) xyz, 1 / cos(pitch) w. */
  uSprSunAxis: { value: THREE.Vector4 };
  /** 1 = discard everything (a render by any camera but the game camera: the water reflection, a debug view). */
  uSprHide: { value: number };
}

export interface ProxyUniforms {
  uPxBones: { value: THREE.Texture };
  /** Drawing row of the bone texture. */
  uPxDraw: { value: number };
}

const n = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

const VERT_HEAD = /* glsl */ `
uniform vec4 uSprCell; uniform vec4 uSprAnchor; varying vec2 vSprUv;`;
const VERT_QUAD = /* glsl */ `
  {
    vec2 sq = (position.xy + 0.5) * uSprCell.zw;
    vSprUv = uSprCell.xy + sq;
    transformed = vec3((sq - uSprAnchor.xy) * uSprAnchor.z, 0.0);
  }`;

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uSprA, uSprB; uniform float uSprFar, uSprHalo, uSprDepthK, uSprHide; uniform vec3 uSprBack;
uniform vec4 uSprShadowD; uniform vec3 uSprHi[16], uSprMid[16], uSprSh[16];
varying vec2 vSprUv;
float sprDz; vec3 sprN; vec3 sprHi; vec3 sprMid; vec3 sprSh;`;

const fragDecode = (custom: string[]) => /* glsl */ `
  {
    if (uSprHide > 0.5) discard;
    ivec2 sp = ivec2(floor(vSprUv));
    vec4 sA = texelFetch(uSprA, sp, 0);
    vec4 sB = texelFetch(uSprB, sp, 0);
    int bR = int(sB.r * 255.0 + 0.5), bG = int(sB.g * 255.0 + 0.5), bB = int(sB.b * 255.0 + 0.5);
    int s1 = bR & 31;
    if (s1 == 0) discard;
    int sd = (bR >> 5) & 3;
    vCharGHalo = float((bR >> 7) & 1);
    if (vCharGHalo > 0.5 && uSprHalo < 0.5) discard;
    vCharGSlot = float(s1 - 1);
    vCharPart = float(bG + ((bB & 1) << 8) - 160);
    vCharLift = float(bB >> 1) * 0.01;
    vCharHint = 0.0; vCharProp = 0.0; vCharMid = 0.0;
    vCharFar = (sd != 0 && abs(float(sd) - uSprFar) < 0.5) ? 1.0 : 0.0;
    vCharBind = vec3(0.0, sB.a * ${n(BIND_MAX)} * uCharGhost.z, 0.0);
    vec2 nxy = floor(sA.rg * 255.0 + 0.5) / 255.0 * 2.0 - 1.0;
    sprN = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    int aB = int(sA.b * 255.0 + 0.5), aA = int(sA.a * 255.0 + 0.5);
    sprDz = (float(aB * 16 + (aA >> 4)) / ${n(DEPTH_STEPS)}) * ${n(DEPTH_RANGE)} + ${n(DEPTH_LO)};
    vToonWorld = vToonWorldQ + uSprBack * sprDz;
    sprHi = uSprHi[s1 - 1]; sprMid = uSprMid[s1 - 1]; sprSh = uSprSh[s1 - 1];
    vToneHi = sprHi; vToneSh = sprSh;
    gl_FragDepth = gl_FragCoord.z - sprDz * uSprDepthK;
    ${custom.length ? `int c4 = aA & 15; ${custom.map((nm, i) => (i === 0 ? `${nm} = (c4 & 3) == 3 ? 2.0 : float(c4 & 3) * 0.5;` : `${nm} = float((c4 >> ${i + 1}) & 1);`)).join(' ')}` : ''}
  }`;

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

function must(src: string, find: string | RegExp, what: string): void {
  if (typeof find === 'string' ? !src.includes(find) : !find.test(src)) throw new Error(`sprite material: ${what} not found in the vendor shader`);
}

export function createSpriteUniforms(sheet: SpriteSheet): SpriteUniforms {
  return {
    uSprA: { value: sheet.texA },
    uSprB: { value: sheet.texB },
    uSprCell: { value: new THREE.Vector4(sheet.rects[0], sheet.rects[1], sheet.rects[2], sheet.rects[3]) },
    uSprAnchor: { value: new THREE.Vector4(sheet.rects[4], sheet.rects[5], sheet.cam.texel, 0) },
    uSprFar: { value: 0 },
    uSprHalo: { value: 0 },
    uSprDepthK: { value: 1 / 400 },
    uSprBack: { value: new THREE.Vector3(0, 0, 1) },
    uSprShadowD: { value: new THREE.Vector4() },
    uSprHi: { value: sheet.palette.hi },
    uSprMid: { value: sheet.palette.mid },
    uSprSh: { value: sheet.palette.sh },
    uSprSunAxis: { value: new THREE.Vector4(1, 0, 0, 1 / Math.cos(sheet.cam.pitch)) },
    uSprHide: { value: 0 },
  };
}

/** The sprite's colour / normal-pass material (one program per vendor look option set). */
export function createSpriteMaterial(engine: unknown, sheet: SpriteSheet, S: SpriteUniforms): THREE.MeshLambertMaterial {
  const mat = spriteCharacterMaterial(engine, { spec: sheet.spec, liveTop: sheet.liveTop });
  // per-spec look constants from the baked rig
  const LU = (mat.userData as { look: { uniforms: Record<string, { value: unknown }> } }).look.uniforms;
  for (const [k, v] of Object.entries(sheet.look)) {
    const u = LU[k];
    if (!u) continue;
    const cur = u.value as { copy?(x: unknown): unknown; set?(x: ArrayLike<number>): unknown } | number;
    if (typeof cur === 'number' || typeof v === 'number') u.value = v;
    else if (Array.isArray(cur) && Array.isArray(v)) cur.forEach((c, i) => (c as { copy(x: unknown): void }).copy(v[i]));
    else if (ArrayBuffer.isView(cur) && ArrayBuffer.isView(v)) (cur as unknown as Float32Array).set(v as unknown as Float32Array);
    else if (cur && typeof cur.copy === 'function') cur.copy(v);
  }
  const prev = mat.onBeforeCompile as Compile;
  const key0 = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, S);
    let vs = shader.vertexShader;
    must(vs, '#include <begin_vertex>', 'begin_vertex');
    vs = vs.replace('#include <common>', `#include <common>\n${VERT_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_QUAD}`);
    vs = vs.replace(/\bvToonWorld\b/g, 'vToonWorldQ');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    must(fs, 'varying vec3 vToonWorld;', 'vToonWorld varying');
    must(fs, 'vec4 sc = vDirectionalShadowCoord[0];', 'shadow coordinate') ;
    must(fs, 'void main() {', 'main');
    // the spec's own varyings (plane C): plain globals set per texel instead of interpolated vertex outputs
    for (const nm of sheet.custom) {
      const decl = new RegExp(`\\b(?:flat\\s+)?varying\\s+(?:(?:highp|mediump|lowp)\\s+)?float\\s+${nm}\\s*;`, 'g');
      must(fs, decl, `spec varying ${nm}`);
      fs = fs.replace(decl, `float ${nm};`);
    }
    fs = fs
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('varying vec3 vToonWorld;', 'varying vec3 vToonWorldQ; vec3 vToonWorld;')
      .replace(/\b(?:flat\s+)?varying\s+(float|vec3)\s+(vChar(?:Far|Mid|Part|Lift|Hint|Prop|Bind|GSlot|GHalo))\s*;/g, '$1 $2;')
      .replace(/\bvarying\s+vec3\s+(vTone(?:Hi|Sh))\s*;/g, 'vec3 $1;')
      .replace('void main() {', `void main() {\n${fragDecode(sheet.custom)}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = sprMid;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = sprN;')
      .replace('vec4 sc = vDirectionalShadowCoord[0];', 'vec4 sc = vDirectionalShadowCoord[0] + uSprShadowD * sprDz;');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `ct-sprite|${sheet.custom.join(',')}|${key0()}`;
  return mat;
}

/**
 * The shadow-only proxy's depth material (proxy.ts): rigid skinning from the baked bone matrices of the displayed
 * drawing (3 RGBA32F texels per bone), then three's depth packing. One program for every sprite.
 */
export function createProxyDepthMaterial(P: ProxyUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, P);
    must(shader.vertexShader, '#include <begin_vertex>', 'depth begin_vertex');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uPxBones; uniform float uPxDraw; attribute float aBone;').replace(
      '#include <begin_vertex>',
      `vec3 transformed;
      {
        int pb = int(aBone + 0.5) * 3; int pd = int(uPxDraw + 0.5);
        vec4 p4 = vec4(position, 1.0);
        transformed = vec3(dot(texelFetch(uPxBones, ivec2(pb, pd), 0), p4), dot(texelFetch(uPxBones, ivec2(pb + 1, pd), 0), p4), dot(texelFetch(uPxBones, ivec2(pb + 2, pd), 0), p4));
      }`,
    );
  };
  m.customProgramCacheKey = () => 'ct-sprite-proxy-depth';
  return m;
}

/** The shadow caster: the cell's silhouette on a vertical plane through the feet, facing the sun. */
export function createSpriteDepthMaterial(S: SpriteUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, S);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\nuniform vec4 uSprSunAxis;`)
      .replace(
        '#include <project_vertex>',
        `vec2 sprSq = (position.xy + 0.5) * uSprCell.zw;
        vSprUv = uSprCell.xy + sprSq;
        vec2 sprL = (sprSq - uSprAnchor.xy) * uSprAnchor.z;
        vec4 sprW = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        sprW.xyz += uSprSunAxis.xyz * sprL.x + vec3(0.0, max(sprL.y, 0.0) * uSprSunAxis.w, 0.0);
        vec4 mvPosition = viewMatrix * sprW;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSprB; varying vec2 vSprUv;')
      .replace('void main() {', 'void main() {\n if ((int(texelFetch(uSprB, ivec2(floor(vSprUv)), 0).r * 255.0 + 0.5) & 31) == 0) discard;');
  };
  m.customProgramCacheKey = () => 'ct-sprite-depth';
  return m;
}
