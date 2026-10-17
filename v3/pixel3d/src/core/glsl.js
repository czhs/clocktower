// Shared GLSL for low-res fullscreen passes (prepended by PixelPipeline.makeLowresMaterial).
export const FLAGS_GLSL = /* glsl */`
// Outline flags live in rtNormal.a (written by materials in uPassMode == 1).
#define FLAG_BG 0.0           // background / sky (cleared)
#define FLAG_NONE 0.25        // geometry that neither draws nor causes outlines (grass, particles)
#define FLAG_DEPTH_ONLY 0.5   // depth outline only, no normal edge highlights
#define FLAG_CHAR 0.625       // characters (look owner, docs/CHARACTERS.md): depth lines only where a character
                              // pixel is in front of another FLAG_CHAR pixel (inner lines); never a line against
                              // the world/background, no edge highlights; world pixels treat it as a depth-only neighbour
                              // + part id: a = FLAG_CHAR + id * 2^-11 (|id| <= 78, look.js), compare with abs(f - FLAG_CHAR) < 0.05
#define FLAG_EDGES_ONLY 0.75  // normal edge highlights only, no depth outline
#define FLAG_FULL 1.0         // everything (default)
`;

export const LOWRES_COMMON = /* glsl */`
uniform sampler2D tColor;   // output of the previous pass (or the scene color)
uniform sampler2D tScene;   // raw scene color
uniform sampler2D tDepth;   // scene depth (ortho: linear in view z)
uniform sampler2D tNormal;  // rgb = view normal*.5+.5, a = outline flag
uniform vec2 uLowSize;      // render-target size in texels (including margins)
uniform mat4 uInvProj, uCamWorld, uViewMat;
uniform float uNear, uFar, uTime, uTexelWorld;
uniform vec3 uSunDir, uSunColor, uCameraDir;
varying vec2 vUv;
${FLAGS_GLSL}
vec2 texel() { return 1.0 / uLowSize; }
float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
// distance from the camera plane in world units (ortho)
float linDepth(vec2 uv) { return uNear + rawDepth(uv) * (uFar - uNear); }
vec3 viewNormal(vec2 uv) { return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
float flagAt(vec2 uv) { return texture2D(tNormal, uv).a; }
bool isBackground(vec2 uv) { return texture2D(tNormal, uv).a < 0.1; }
vec3 viewPos(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, rawDepth(uv) * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
vec3 worldPos(vec2 uv) { return (uCamWorld * vec4(viewPos(uv), 1.0)).xyz; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
