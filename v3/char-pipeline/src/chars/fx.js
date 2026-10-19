// Character FX (owner: fx): footstep dust, landing puffs, slash sparks, hit flash, and (round 5) the shared cast
// emotes: speech bubble (talk), vote sparkle, death dust + soul wisp, wing-flap feathers, emote glyphs.
// docs/CHARACTERS.md §5, docs/CHARACTER_LEARNINGS.md §Smears and FX.
//
//   const fx = attachFx(engine, ch, {
//     ground,                 // optional {heightAt(x,z)} (terrain) for dust height; default: opts.groundY (0)
//     dust: ['#E4D6B4', '#C2AE8A', '#8E7E74'],   // [light, mid, shade] sRGB (pick the ground's dusty tones)
//     spark: ['#FFF6D8', '#F2C66A'],             // [core, tips] — light tones only (no dark cells)
//     flash: ['#F4EEE2', '#E9C6B6'],             // hit flash tones, one per drawing (2 grid frames each, on twos)
//     weapon: { socket: 'weapon', length: 0.6, blade: [0,0,1] },  // where 'hit' sparks spawn (blade tip)
//     sockets: { kickR: { length: 0.6 } },      // other spark sockets, addressed as event 'hit@kickR'
//     scale,                  // mote/size scale; default from the character height: clamp(H / 1.5, 0.45, 1.3)
//     stepClips: ['run'],     // gait footsteps ({name:'step'}) puff only in these clips; stepEvery: 1 (every n-th)
//     speech: { node: 'head', up, ink, fill }, vote: { node: 'handR' }, soul: { node: 'chest' },
//     feather: ['#FBF8F0', '#A8987E'],          // [vane, quill] for wing-flap feathers (pass the plumage)
//     map: { ... },           // event name -> fx kind, see EVENT_MAP (regexes tried in order)
//   });
//   -> { dust(pos, o), spark(pos, o), speech(o), sparkle(pos, o), wisp(pos, o), death(pos, o), feathers(pos, o),
//        glyph(name, pos, o), flash(t), reset(), dispose(), points, flashMesh, scale }
//
// Driven by ch.on('event', {t, clip, name}). Event names (case-insensitive; `<name>@<node>` = at that socket/bone):
//   step* / foot* / contact* (+L|R)  → small dust puff behind that foot. Gait footsteps {name:'step', side, pos, clip}
//                                     puff only for opts.stepClips (default ['run']) and every opts.stepEvery-th step
//   land                             → landing ring (dust motes outward)
//   hit / strike / impact            → slash spark at the weapon tip ('hit@<socket>': at that socket's tip)
//   hurt / damage / flash            → hit flash on this character
//   speak / talk / say               → speech bubble beside the head, dots typing in, ~0.4 s (talk loops: one per cycle)
//   vote / raise / sparkle           → 3 staggered 4-point sparkles at the raised hand/wing/paw (default node handR)
//   die / death / collapse           → dust ring at the feet + a soul wisp rising from the chest 0.2 s later
//   soul / wisp                      → only the wisp
//   flap / feather / wing            → 2 feathers tumbling down from the node (default: root + 0.6 H)
//   puff / poof                      → small dust burst at the node (hop take-off, landing on a lily pad, a sneeze)
//   emote:<glyph>                    → glyph above the head: heart note exclaim question zzz anger drop star skull spiral
//
// Look: everything is pixel-sized and stepped. All FX are THREE.Points on LAYERS.COLOR_ONLY (no normal pass → no
// outlines), centres snapped to the low-res texel grid in the vertex shader (+ whole-texel screen offsets), sizes in
// whole texels, flat tones, opaque (alpha 1, NoBlending + discard), depth tested, no depth write. Hold-safe: every
// kind steps at 15 fps (one drawing per 2 grid frames, in phase with its birth on the 30 Hz grid; the old dust stepped
// at 10 fps = against the pose's twos), lives a whole number of drawings and then disappears — nothing settles or
// redraws inside a held pose once the FX has played (a held vote pose: 3 sparkles, then 0 changes). Kind 0 (dust at
// 10 fps) only with opts.dustFps = 10 (A/B). The hit flash is a second SkinnedMesh sharing the character's geometry
// and skeleton, visible only for the flash frames. Time = the Character's clock (uFxTime set from engine.onUpdate's
// t — a frozen stage frame freezes the FX too). Pure functions of t: every spawn stores its birth t; if events go back
// in time everything is dropped and rebuilt from the re-emitted events. No Math.random (seedHash).
// scenes/char-stage.js fxSignature reads aInfo (birth, kind, -, life) with fps = kind < 0.5 ? 10 : 15 — keep that.
import * as THREE from 'three';
import { LAYERS } from '../core/PixelPipeline.js';
import { clipInfo } from './anim.js';

export const EVENT_MAP = [
  [/^(step|foot|contact)/i, 'step'],
  [/land/i, 'land'],
  [/hit|strike|impact/i, 'spark'],
  [/hurt|damage|flash/i, 'flash'],
  [/^(speak|talk|say)/i, 'speech'],
  [/^(vote|raise|sparkle)/i, 'sparkle'],
  [/^(die|death|collapse)/i, 'death'],
  [/^(soul|wisp)/i, 'wisp'],
  [/^(flap|feather|wing)/i, 'feathers'],
  [/^(puff|poof)/i, 'poof'],
  [/^emote/i, 'glyph'],
];

export const FX_KINDS = { dust10: 0, spark: 1, dust: 2, speech: 3, sparkle: 4, wisp: 5, feather: 6, glyph: 7 };
// 5×5 glyph bitmaps (bit y*5+x, y down) + fill colour; the rim (8-neighbours) is drawn in the light rim tone
export const FX_GLYPHS = {
  heart: [4685802, '#E8505A'], note: [7574172, '#6A58A8'], exclaim: [4198532, '#E9A82A'],
  question: [4206862, '#4C98DC'], zzz: [493711, '#6E9BE0'], anger: [11371370, '#D8404A'], drop: [15728068, '#5AA6E8'],
  star: [10976708, '#EDBE2E'], skull: [11524078, '#6C6478'], spiral: [32552239, '#8A62C0'],
};

const VERT = /* glsl */`
uniform int uPassMode;
uniform float uFxTime;
uniform vec2 uLowSize;
uniform vec3 uCameraDir;
attribute vec3 aVel;          // dust/spark/sparkle/feather: m/s; speech/glyph: (screen dx, dy texels, rise m/s); wisp: (sway, -, rise)
attribute vec4 aInfo;         // x birth t, y kind (FX_KINDS), z size0 (texels), w life (s)
attribute vec2 aSeed;         // per-mote seeds; speech: y = side (+1 right / -1 left); glyph: x = bitmap, y = colour index
varying float vKind, vFrame, vTone, vSize, vFlip;
varying vec2 vSeed;
void main() {
  vKind = aInfo.y; vFrame = 0.0; vTone = 0.0; vSize = 0.0; vFlip = 1.0; vSeed = aSeed;
  float fps = aInfo.y < 0.5 ? 10.0 : 15.0;
  float age = floor((uFxTime - aInfo.x) * fps + 0.01) / fps;     // stepped
  if (uPassMode == 1 || aInfo.w <= 0.0 || age < 0.0 || age >= aInfo.w) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
  }
  int kind = int(aInfo.y + 0.5);
  float k = age / aInfo.w;                                       // 0..1
  float f = floor(age * fps + 0.5);                              // drawing index
  vFrame = f;
  // speech bubble with a chained (longer) life: full with 3 dots until its last drawing, which pops out (6-drawing
  // bubbles: unchanged, f 0..5)
  if (kind == 3) {
    if (aSeed.x > 0.0 && uFxTime >= aSeed.x - 1e-4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vFrame = f >= floor(aInfo.w * fps + 0.5) - 1.0 ? max(f, 5.0) : min(f, 4.0);
  }
  vec3 p = position;
  vec2 scr = vec2(0.0);                                          // whole-texel screen offset (x right, y up)
  float size = aInfo.z;
  vec3 cd = normalize(uCameraDir);
  if (kind == 0 || kind == 2) {
    // dust: decelerating spread, slow rise; puff grows then shrinks; light -> mid -> shade
    p += vec3(aVel.x, 0.0, aVel.z) * aInfo.w * (1.0 - (1.0 - k) * (1.0 - k)) * 0.5;
    p.y += aVel.y * age;
    float sz = k < 0.2 ? 0.75 : (k < 0.6 ? 1.0 : (k < 0.8 ? 0.75 : 0.5));
    size = max(1.0, floor(aInfo.z * sz + 0.5));
    vTone = k < 0.5 ? 0.0 : (k < 0.85 ? 1.0 : 2.0);     // mostly light: dark motes read as pebbles
    // a sprite's depth is constant over the point; at 30 deg pitch the ground under its lower half is ~0.05 m per
    // texel nearer to the camera, so a mote sitting on the ground loses its bottom rows. Pull it toward the camera.
    p -= cd * 0.25;
    if (aSeed.x > 0.75 && vTone < 0.5) vTone += 1.0;           // some motes one tone darker (cloud volume)
  } else if (kind == 1) {
    p -= cd * 0.45;                                              // never buried in the smear
  } else if (kind == 3) {
    scr = aVel.xy; vFlip = aSeed.y;
    p -= cd * 0.6;                                               // in front of the head
  } else if (kind == 4) {
    p.y += aVel.y * age;
    p -= cd * 0.45;
  } else if (kind == 5) {
    p.y += aVel.z * age;
    scr.x = floor(sin(f * 0.9 + aSeed.x * 6.283) * 1.5 + 0.5);  // stepped sway, ±1 texel
    p -= cd * 0.3;
  } else if (kind == 6) {
    // feather: thrown out, then drifts down at a slow terminal speed with a zig-zag
    float ko = 1.0 - (1.0 - min(k * 2.5, 1.0)) * (1.0 - min(k * 2.5, 1.0));
    p += vec3(aVel.x, 0.0, aVel.z) * 0.25 * ko;
    p.y += aVel.y * 0.18 * ko - 0.32 * max(age - 0.12, 0.0);
    scr.x = floor(sin(f * 1.3 + aSeed.x * 6.283) * 1.5 + 0.5);
    p -= cd * 0.3;
  } else {
    scr = aVel.xy;
    p.y += aVel.z * age;
    scr.y += mod(floor(f / 2.0), 2.0);                           // 1-texel bob every 2 drawings
    p -= cd * 0.6;
  }
  vSize = size;
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);      // ortho: w = 1
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  px = (mod(size, 2.0) < 0.5) ? floor(px + 0.5) : floor(px) + 0.5;
  px += scr;
  clip.xy = (px / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = size;
}`;

const FRAG = /* glsl */`
uniform int uPassMode;
uniform vec3 uD0, uD1, uD2, uS0, uS1, uB0, uB1, uB2, uK0, uK1, uW0, uW1, uF0, uF1, uGR;
uniform vec3 uGlyph[10];
varying float vKind, vFrame, vTone, vSize, vFlip;
varying vec2 vSeed;
bool bit(int bits, int x, int y) {
  if (x < 0 || y < 0 || x > 4 || y > 4) return false;
  return ((bits >> (y * 5 + x)) & 1) == 1;
}
void main() {
  if (uPassMode == 1 || vSize < 0.5) discard;
  int n = int(vSize + 0.5);
  ivec2 c = ivec2(floor(gl_PointCoord * vSize));                 // y down
  int ctr = n / 2;
  int kind = int(vKind + 0.5);
  int f = int(vFrame + 0.5);
  int dx = c.x - ctr, dy = c.y - ctr;
  vec3 col;
  if (kind == 0 || kind == 2) {
    // square mote with clipped corners from 3 texels up (a round-ish pixel blob), top row lighter
    if (n >= 3 && (c.x == 0 || c.x == n - 1) && (c.y == 0 || c.y == n - 1)) discard;
    int t = int(vTone + 0.5);
    col = t == 0 ? uD0 : (t == 1 ? uD1 : uD2);
    if (c.y == 0 && t > 0 && n >= 2) col = t == 1 ? uD0 : uD1;
  } else if (kind == 1) {
    // slash spark, light tones only: solid plus with a core, then a continuous 1-texel burst ring (r1: sparse dots on a
    // dark paw read as a checker clod)
    bool on = false, core = false;
    if (f == 0) {
      on = (abs(dx) <= 1 && abs(dy) <= 1 && abs(dx) + abs(dy) <= 1) || (dx == 0 && abs(dy) <= 3) || (dy == 0 && abs(dx) <= 3);
      core = abs(dx) + abs(dy) <= 1;
    } else {
      on = max(abs(dx), abs(dy)) == 2 && !(abs(dx) == 2 && abs(dy) == 2);   // continuous rounded ring (no checker)
      core = true;
    }
    if (!on) discard;
    col = core ? uS0 : uS1;
  } else if (kind == 3) {
    // speech bubble (11x11 cell): rounded 9x6 body + 2-texel tail toward the speaker, dots typing in
    int x = vFlip < 0.0 ? (n - 1 - c.x) : c.x, y = c.y;
    bool body = false, tail = false, dot = false;
    if (f == 0 || f >= 5) {                                      // pop-in / pop-out: small bubble near the tail
      body = x >= 1 && x <= 5 && y >= 4 && y <= 7 && !((x == 1 || x == 5) && (y == 4 || y == 7));
      tail = (x == 2 && y == 8);
      if (f >= 5) { body = x >= 2 && x <= 7 && y >= 3 && y <= 7 && !((x == 2 || x == 7) && (y == 3 || y == 7)); tail = x == 2 && y == 8; }
    } else {
      body = x >= 1 && x <= 9 && y >= 1 && y <= 7 && !((x == 1 || x == 9) && (y == 1 || y == 7));
      tail = (y == 8 && (x == 2 || x == 3)) || (y == 9 && x == 1);
      int dots = f >= 3 ? 3 : f;                                 // 1, 2, 3, 3 dots
      dot = y == 4 && (x == 3 || x == 5 || x == 7) && (x - 1) / 2 <= dots;
    }
    if (!body && !tail) discard;
    col = dot ? uB1 : ((y == 7 && body) || tail ? uB2 : uB0);    // bottom row + tail one tone down (volume)
  } else if (kind == 4) {
    // 4-point sparkle twinkle (9x9): dot, small plus, long plus with a fat core, longest, plus, dot
    int L = f == 0 ? 0 : (f == 1 ? 1 : (f == 2 ? 3 : (f == 3 ? 4 : (f == 4 ? 2 : 0))));
    bool on = (dx == 0 && abs(dy) <= L) || (dy == 0 && abs(dx) <= L);
    if ((f == 2 || f == 3) && abs(dx) == 1 && abs(dy) == 1) on = true;   // fat centre on the big drawings
    if (!on) discard;
    col = (abs(dx) + abs(dy) <= (f == 2 || f == 3 ? 1 : 0) || (abs(dx) == 1 && abs(dy) == 1)) ? uK0 : uK1;
    if (f >= 5) col = uK1;
  } else if (kind == 5) {
    // soul wisp (7x7): rounded teardrop flame (widths 1,3,5,5,5,3,1), white core, the tip flickers left/right;
    // shrinks to a 3x3 and then a dot at the end of its life
    int tipx = (f % 2 == 0) ? 0 : (vSeed.y > 0.5 ? 1 : -1);
    int ax = abs(dx);
    bool on, core;
    if (f < 14) {
      int w = dy == -3 || dy == 3 ? 0 : (dy == -2 || dy == 2 ? 1 : 2);
      on = (dy == -3) ? dx == tipx : ax <= w;
      core = (ax <= 1 && dy >= -1 && dy <= 1) || (dx == 0 && dy == -2);
    } else if (f < 16) {
      on = (dy == -2 && dx == tipx) || (ax <= 1 && dy >= -1 && dy <= 1 && !(ax == 1 && dy != 0)); core = ax == 0 && dy == 0;
    } else {
      on = dx == 0 && dy == 0; core = false;
    }
    if (!on) discard;
    col = core ? uW0 : uW1;
  } else if (kind == 6) {
    // feather (5x5): 3-texel vane + 1-texel quill, tumbling through / - \\ |
    int o = int(mod(float(f) + floor(vSeed.y * 4.0), 4.0));
    bool vane, quill;
    if (o == 0) { vane = dx == -dy && abs(dx) <= 1; quill = dx == -2 && dy == 2; }
    else if (o == 1) { vane = dy == 0 && abs(dx) <= 1; quill = dy == 0 && dx == -2; }
    else if (o == 2) { vane = dx == dy && abs(dx) <= 1; quill = dx == -2 && dy == -2; }
    else { vane = dx == 0 && abs(dy) <= 1; quill = dx == 0 && dy == 2; }
    if (!vane && !quill) discard;
    col = vane ? uF0 : uF1;
  } else {
    // emote glyph (7x7): 5x5 bitmap in its colour + a light rim, at full size from its first drawing.
    // (lead, cast wave 2) the old pop-in stage (f == 0: a 3x3 rim dot) read as a stray hollow speck before the glyph
    // (mole ring, honk exclaim, critics r1) and delayed the punchline by a drawing; removed.
    int bits = int(vSeed.x + 0.5);
    int gi = int(vSeed.y + 0.5);
    vec3 fill = uGlyph[0];
    for (int i = 1; i < 10; i++) if (i == gi) fill = uGlyph[i];
    int bx = c.x - 1, by = c.y - 1;
    bool in0 = bit(bits, bx, by);
    bool rim = false;
    for (int ox = -1; ox <= 1; ox++) for (int oy = -1; oy <= 1; oy++) if (bit(bits, bx + ox, by + oy)) rim = true;
    if (!in0 && !rim) discard;
    col = in0 ? fill : uGR;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const lin = (c) => (c?.isColor ? c.clone() : new THREE.Color(c));
const GLYPH_NAMES = Object.keys(FX_GLYPHS);

function seedHash(a, b) {                       // deterministic [0,1)
  let h = (Math.imul((a * 1000003) | 0, 2654435761) ^ Math.imul((b + 17) | 0, 1597334677)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function attachFx(engine, ch, opts = {}) {
  const rig = ch.rig ?? ch;
  const N = opts.capacity ?? 256;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), info = new Float32Array(N * 4), sd = new Float32Array(N * 2);
  const geo = new THREE.BufferGeometry();
  const attr = {
    position: new THREE.BufferAttribute(pos, 3), aVel: new THREE.BufferAttribute(vel, 3),
    aInfo: new THREE.BufferAttribute(info, 4), aSeed: new THREE.BufferAttribute(sd, 2),
  };
  for (const [k, a] of Object.entries(attr)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
  const H = rig.height ?? rig.spec?.height ?? ch.spec?.height ?? 1.5;
  const scale = opts.scale ?? Math.min(1.3, Math.max(0.45, H / 1.5));
  const dust = (opts.dust ?? ['#E4D6B4', '#C2AE8A', '#8E7E74']).map(lin);
  const sparkC = (opts.spark ?? ['#FFF6D8', '#F2C66A']).map(lin);
  const sp = opts.speech ?? {};
  const bub = [sp.fill ?? '#FBF7EE', sp.ink ?? '#6E7DA0', sp.shade ?? '#D6D2E2'].map(lin);
  const kl = (opts.sparkle ?? ['#FFFDF0', '#FFD86A']).map(lin);
  const wl = (opts.wisp ?? ['#F4FCFF', '#7FBDEB']).map(lin);
  const fl = (opts.feather ?? ['#FBF8F0', '#A8987E']).map(lin);   // pass the plumage tones (vane light, quill darker)
  const U = {
    uPassMode: engine.uniforms.uPassMode, uFxTime: { value: 0 }, uCameraDir: engine.uniforms.uCameraDir,
    uLowSize: engine.pipeline.common.uLowSize,
    uD0: { value: dust[0] }, uD1: { value: dust[1] }, uD2: { value: dust[2] ?? dust[1] },
    uS0: { value: sparkC[0] }, uS1: { value: sparkC[1] ?? sparkC[0] },
    uB0: { value: bub[0] }, uB1: { value: bub[1] }, uB2: { value: bub[2] },
    uK0: { value: kl[0] }, uK1: { value: kl[1] ?? kl[0] },
    uW0: { value: wl[0] }, uW1: { value: wl[1] ?? wl[0] },
    uF0: { value: fl[0] }, uF1: { value: fl[1] ?? fl[0] },
    uGR: { value: lin(opts.glyphRim ?? '#FFF8EC') },
    uGlyph: { value: GLYPH_NAMES.map((g) => lin(FX_GLYPHS[g][1])) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, blending: THREE.NoBlending, depthTest: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, material);
  points.layers.set(LAYERS.COLOR_ONLY);
  points.frustumCulled = false;
  points.renderOrder = opts.renderOrder ?? 10;
  points.name = 'char-fx';
  engine.scene.add(points);

  const DRAW = 1 / 15;                          // one drawing (2 grid frames)
  const life = (n) => (n - 0.5) * DRAW;         // lives are whole drawings (half a drawing of float margin)
  const dustKind = opts.dustFps === 10 ? 0 : 2;
  let head = 0, lastEvT = -Infinity, lastT = -Infinity, spawned = 0, steps = 0;
  let liveUntil = -Infinity;   // (lead) points hidden when no mote is alive: 0 extra draw calls while idle
  function emit(p, v, birth, kind, size, lifeS, s0, s1) {
    const i = head; head = (head + 1) % N;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3);
    info.set([birth, kind, size, lifeS], i * 4); sd.set([s0, s1], i * 2);
    liveUntil = Math.max(liveUntil, birth + lifeS + 0.1);
    for (const a of Object.values(attr)) a.needsUpdate = true;
    return i;
  }
  let lastSpeech = null;   // (module fix, fx row) {i, birth, t} of the bubble on screen (talk-loop chaining)
  function clear() {
    info.fill(0); head = 0; spawned = 0; steps = 0; attr.aInfo.needsUpdate = true; liveUntil = -Infinity; lastSpeech = null;
    flashT = -Infinity;
  }

  // ground height under p: terrain if given, else opts.groundY (0). Not the root's y: crouch/jump offsets move it.
  const groundY = (p) => (opts.ground?.heightAt ? opts.ground.heightAt(p.x, p.z) : (opts.groundY ?? 0));
  const texel = () => engine.camera?.texelWorld || 0.0278;
  const rootObj = () => ch.root ?? rig.root;
  const findNode = (names) => {
    for (const n of names) { if (!n) continue; const o = rig.sockets?.[n] ?? rig.bones?.[n]; if (o) return o; }
    return null;
  };
  const nodePos = (names, upFrac = 0) => {
    const o = findNode(names);
    const p = new THREE.Vector3();
    if (o) o.getWorldPosition(p); else { rootObj().getWorldPosition(p); p.y += H * 0.6; }
    p.y += upFrac * H;
    return p;
  };
  /** screen side of the facing: +1 if the character faces screen-right, -1 if left (camera right = (cos yaw, 0, -sin yaw)) */
  const facingSide = () => {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootObj().getWorldQuaternion(new THREE.Quaternion()));
    const yaw = engine.camera?.yaw ?? Math.PI / 4;
    const x = fwd.x * Math.cos(yaw) - fwd.z * Math.sin(yaw);
    return x < -0.2 ? -1 : 1;
  };

  /** Dust puff at world position p (on the ground). o: {t, n (motes), ring, size, speed, life, dir, y} */
  function dustAt(p, o = {}) {
    const t = o.t ?? engine.time;
    const n = o.n ?? (o.ring ? 10 : 4);
    const id = spawned++;
    const y = (o.y ?? groundY(p)) + 0.03;
    for (let k = 0; k < n; k++) {
      const r0 = seedHash(id, k * 3), r1 = seedHash(id, k * 3 + 1), r2 = seedHash(id, k * 3 + 2);
      // (module fix, fx row) rings: seeded jitter over the whole sector (was +-0.25 rad: a symmetric grid of motes)
      const a = o.ring ? ((k + 0.9 * (r0 - 0.5)) / n) * Math.PI * 2 : (o.dir ?? 0) + (r0 - 0.5) * Math.PI * 1.6 + (k % 2 ? Math.PI : 0);
      const spd = (o.speed ?? (o.ring ? 1.6 : 0.6)) * (0.6 + 0.6 * r1) * scale;
      const off = o.radius ?? (o.ring ? 0.16 : 0.05) * scale;   // (module fix) o.radius (m): spawn ring radius
      const size = Math.max(1, Math.round(((o.size ?? (o.ring ? 5 : 4)) - (r2 > 0.6 ? 1 : 0)) * scale));
      emit(new THREE.Vector3(p.x + Math.cos(a) * off, y, p.z + Math.sin(a) * off),
        new THREE.Vector3(Math.cos(a) * spd, (0.12 + 0.2 * r2) * scale, Math.sin(a) * spd),
        t, dustKind, size, o.life ?? (dustKind === 0 ? 0.5 : life(o.ring ? 3 : 5)), r1, r2);   // (module fix) rings end within 6 grid frames (was 14)
    }
  }
  /** Slash spark (2 drawings: solid plus, then a light burst ring) centred at world position p. */
  function sparkAt(p, o = {}) {
    emit(p, new THREE.Vector3(), o.t ?? engine.time, 1, 7, life(2), 0, 0);
    spawned++;
  }
  /** Speech bubble beside the head (typing dots), o: {t, node, side} */
  function speech(o = {}) {
    const t = o.t ?? engine.time;
    const p = nodePos([o.node, sp.node, 'head', 'neck', 'chest'], sp.up ?? 0.12);
    const side = o.side ?? facingSide();
    const headTex = Math.round((0.10 * H) / texel());
    const v = new THREE.Vector3(side * (headTex + 5), 4 + Math.round(headTex * 0.4), 0);
    // (module fix, fx row) talk loops re-trigger the bubble every beat: it used to pop in (small), type, pop out (small)
    // and vanish on EVERY beat. A beat within speech.chain s (default 1.2) of the previous one keeps ONE full bubble on
    // screen: the old one is cut at t, the new one starts full (3 dots) and lasts until the next beat would come; only
    // the last bubble of the talk pops out. Single speak events are unchanged.
    const prev = lastSpeech, chain = sp.chain ?? 1.2;
    // (lead, wave 3) look ahead: when the clip itself has another speak beat within `chain`, the bubble stays full
    // until that beat (which cuts it). The first bubble of a talk loop used to pop out after 6 drawings and leave a
    // 0.4 s gap before the 2nd beat (clarabelle, requin, progress, preservation, opal).
    const ahead = nextBeat(o.clip, o.frame);
    const hold = ahead !== null && ahead <= chain ? ahead : 0;
    if (prev && t - prev.t > 1e-6 && t - prev.t <= chain && info[prev.i * 4 + 1] === 3) {
      sd[prev.i * 2] = t; attr.aSeed.needsUpdate = true;     // speech seed.x = cut time (hidden from t on)
      const i = emit(p, v, t - 3 * DRAW, 3, 11, life(6) + Math.max(t - prev.t, hold), 0, side);
      lastSpeech = { i, t };
    } else lastSpeech = { i: emit(p, v, t, 3, 11, life(6) + hold, 0, side), t };
    spawned++;
  }
  /** seconds from frame `f` of clip `name` to its next speech event (loops wrap), or null */
  function nextBeat(name, f) {
    const clip = name && ch.spec?.clips?.[name];
    if (!clip || !clip.events || !Number.isFinite(f)) return null;
    const ci = clipInfo(clip);
    for (let d = 1; d <= ci.length; d++) {
      let g = f + d;
      if (ci.loop) g %= ci.length; else if (g >= ci.length) break;
      const names = ci.events.get(g) || [];
      if (names.some((n) => map.find(([re]) => re.test(n))?.[1] === 'speech')) return d / ci.fps;
    }
    return null;
  }
  /** Vote sparkle: 3 staggered 4-point stars around p (the raised hand), o: {t} */
  function sparkle(p, o = {}) {
    const t = o.t ?? engine.time;
    const id = spawned++;
    const offs = [[0, 0.06, 0], [0.09, -0.02, 0.03], [-0.07, 0.11, -0.03]];
    offs.forEach((d, k) => {
      const r = seedHash(id, k);
      emit(new THREE.Vector3(p.x + d[0] * scale, p.y + d[1] * scale, p.z + d[2] * scale), new THREE.Vector3(0, 0.12 * scale, 0),
        t + k * 2 * DRAW, 4, 9, life(6), r, 0);
    });
  }
  /** Soul wisp rising from p, o: {t, delay} */
  function wisp(p, o = {}) {
    const t = (o.t ?? engine.time) + (o.delay ?? 0);
    const id = spawned++;
    emit(p, new THREE.Vector3(0, 0, 0.75 * Math.max(scale, 0.6)), t, 5, 7, life(18), seedHash(id, 1), seedHash(id, 2));
  }
  /** Death: dust ring at the feet + a soul wisp from the chest 0.2 s (3 drawings) later */
  function death(p, o = {}) {
    const t = o.t ?? engine.time;
    const feet = new THREE.Vector3(); rootObj().getWorldPosition(feet);
    dustAt(feet, { t, ring: true, n: 10 });
    wisp(p ?? nodePos([o.node, opts.soul?.node, 'chest', 'spine', 'body', 'hips'], 0.05), { t, delay: 3 * DRAW });
  }
  /** Wing-flap feathers tumbling from p, o: {t, n} */
  function feathers(p, o = {}) {
    const t = o.t ?? engine.time;
    const id = spawned++;
    const n = o.n ?? 2;
    for (let k = 0; k < n; k++) {
      const r0 = seedHash(id, k * 2), r1 = seedHash(id, k * 2 + 1);
      const a = (k / n) * Math.PI * 2 + r0 * 1.5;
      emit(p, new THREE.Vector3(Math.cos(a) * scale, (0.5 + r1) * scale, Math.sin(a) * scale), t + (k % 2) * DRAW, 6, 5, life(12), r0, r1);
    }
  }
  /** Emote glyph above the head, o: {t, node} */
  function glyph(name, p, o = {}) {
    const t = o.t ?? engine.time;
    const gi = Math.max(0, GLYPH_NAMES.indexOf(name));
    const at = p ?? nodePos([o.node, 'head', 'neck', 'chest'], 0.14);
    emit(at, new THREE.Vector3(0, 5, 0.12 * scale), t, 7, 7, life(15), FX_GLYPHS[GLYPH_NAMES[gi]][0], gi);
    spawned++;
  }

  // ---- hit flash: overlay SkinnedMesh sharing geometry + skeleton --------------------------------------------
  const flashTones = (opts.flash ?? ['#F4EEE2', '#E9C6B6']).map(lin);
  let flashMesh = null, flashMat = null, flashT = -Infinity;
  const src = rig.mesh;
  if (src) {
    flashMat = new THREE.MeshBasicMaterial({ color: flashTones[0].clone(), depthFunc: THREE.LessEqualDepth, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    flashMesh = src.isSkinnedMesh ? new THREE.SkinnedMesh(src.geometry, flashMat) : new THREE.Mesh(src.geometry, flashMat);
    if (src.isSkinnedMesh) { flashMesh.bindMode = src.bindMode; flashMesh.bind(src.skeleton, src.bindMatrix); }
    flashMesh.position.copy(src.position); flashMesh.quaternion.copy(src.quaternion); flashMesh.scale.copy(src.scale);
    flashMesh.frustumCulled = false; flashMesh.castShadow = false; flashMesh.receiveShadow = false;
    flashMesh.layers.set(LAYERS.COLOR_ONLY);
    flashMesh.renderOrder = (src.renderOrder ?? 0) + 1;
    flashMesh.visible = false;
    flashMesh.name = 'hit-flash';
    src.parent.add(flashMesh);
  }
  let clockT = 0;
  let flashN = 2;
  function flash(t = clockT, n = flashTones.length) { flashT = t; flashN = Math.min(n, flashTones.length); updateFlash(clockT); }
  function updateFlash(t) {
    if (!flashMesh) return;
    const k = Math.floor((t - flashT) * 15 + 0.01);   // one tone per DRAWING (2 grid frames): 1-frame tones strobed (3 consecutive changes)
    const on = k >= 0 && k < flashN;
    flashMesh.visible = on;
    if (on) flashMat.color.copy(flashTones[k]);
  }

  // ---- event wiring --------------------------------------------------------------------------------------------
  const map = opts.map ? Object.entries(opts.map).map(([k, v]) => [new RegExp(k, 'i'), v]) : EVENT_MAP;
  const weapon = { socket: 'weapon', length: 0.6, blade: [0, 0, 1], tip: 0.85, ...(opts.weapon ?? {}) };
  function onEvent(e) {
    const t = e.t ?? engine.time;
    if (t < lastEvT - 1e-6) clear();
    lastEvT = t;
    const kind = map.find(([re]) => re.test(e.name))?.[1];
    if (!kind) return;
    const [base, at] = e.name.split('@');           // '<name>[:arg]@<node>'
    const arg = base.includes(':') ? base.split(':')[1] : null;
    // (module fix, fx row) a hurt flash inside the DIE clip is one drawing (2 grid frames), not the full sequence
    if (kind === 'flash') flash(t, e.clip === 'die' ? 1 : flashTones.length);
    else if (kind === 'spark') {
      // 'hit' → weapon tip; 'hit@kickR' → tip of socket kickR (length from opts.sockets.kickR or the weapon's)
      const sock = at ?? weapon.socket;
      const cfg = { ...weapon, ...(opts.sockets?.[sock] ?? {}) };
      const s = rig.sockets?.[sock];
      if (!s) return;
      s.updateWorldMatrix(true, false);
      const p = new THREE.Vector3(...cfg.blade).multiplyScalar(cfg.length * cfg.tip).applyMatrix4(s.matrixWorld);
      sparkAt(p, { t });
    } else if (kind === 'speech') speech({ t, node: at, clip: e.clip, frame: e.frame });
    else if (kind === 'sparkle') sparkle(nodePos([at, opts.vote?.node, 'handR', 'wingR', 'pawR', 'hand', 'head'], 0.03), { t });
    else if (kind === 'death') death(at ? nodePos([at]) : null, { t });
    else if (kind === 'wisp') wisp(nodePos([at, opts.soul?.node, 'chest', 'spine', 'body', 'hips'], 0.05), { t });
    else if (kind === 'feathers') feathers(nodePos([at, 'chest', 'body', 'spine'], 0), { t });
    else if (kind === 'glyph') glyph(arg ?? 'exclaim', null, { t, node: at });
    else if (kind === 'poof') {
      const p = at ? nodePos([at]) : rootObj().getWorldPosition(new THREE.Vector3());
      // (module fix, fx row) opts.poof { n, speed, radius (m) }: wide bodies spawn the ring outside their silhouette
      dustAt(p, { t, ring: true, n: 6, speed: 0.9, y: at ? p.y - 0.03 : undefined, ...(opts.poof || {}) });
    } else if (kind === 'step' || kind === 'land') {
      // Character gait footsteps arrive as {name: 'step', side, pos, clip: 'run'|'walk'|'idle'}: dust only for the
      // clips in opts.stepClips (default: run contacts), every opts.stepEvery-th. Clip events ('stepL', 'land') always puff.
      if (e.name === 'step' && e.clip && !(opts.stepClips ?? ['run']).includes(e.clip)) return;
      if (e.name === 'step' && (steps++ % Math.max(1, opts.stepEvery ?? 1)) !== 0) return;
      const side = e.side ?? (/L$/.test(base) ? 'L' : /R$/.test(base) ? 'R' : '');
      const node = side && !e.pos ? findNode([`foot${side}`, `ankle${side}`, `toe${side}`, `shin${side}`, `lowerLeg${side}`, `leg${side}`]) : null;
      const p = new THREE.Vector3();
      if (e.pos?.isVector3) p.copy(e.pos); else if (node) node.getWorldPosition(p); else rootObj().getWorldPosition(p);
      // behind the foot, against the facing (dust kicks backwards)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootObj().getWorldQuaternion(new THREE.Quaternion()));
      dustAt(p, kind === 'land' ? { t, ring: true, ...(opts.land || {}) } : { t, dir: Math.atan2(-fwd.z, -fwd.x) });
    }
  }
  const off = ch.on?.('event', onEvent);
  const offReset = ch.on?.('reset', () => { clear(); lastEvT = -Infinity; });   // Character re-simulates from 0

  engine.onUpdate((t) => {
    if (t < lastT - 1e-6) { // time went back: drop spawns born after t (events re-emit on re-simulation)
      for (let i = 0; i < N; i++) if (info[i * 4] > t + 1e-6) info[i * 4 + 3] = 0;
      attr.aInfo.needsUpdate = true;
      if (flashT > t + 1e-6) flashT = -Infinity;
    }
    lastT = t; clockT = t;
    U.uFxTime.value = t;
    points.visible = t <= liveUntil;
    updateFlash(t);
  });

  return {
    points, material, flashMesh, scale,
    dust: dustAt, spark: sparkAt, speech, sparkle, wisp, death, feathers, glyph, flash, reset: clear,
    dispose() {
      if (typeof off === 'function') off();
      if (typeof offReset === 'function') offReset();
      points.removeFromParent(); geo.dispose(); material.dispose();
      flashMesh?.removeFromParent(); flashMat?.dispose();
    },
  };
}
