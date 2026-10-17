// Character stage (owner: tools). Shows ONE character (or a grid of copies) for look-dev, critique and the
// automated checks in tools/charcheck.py. Also exports the loader/actor helpers used by scenes/char-bake.js.
//
//   index.html?scene=char-stage&char=<name>[&clip=idle][&dir=1][&tod=noon][&vh=10][&bg=meadow][&grid=…]
//   tools/shot.sh char-stage shots/tools/x.png --size 640x360 --q "scale=1&char=mannequin&clip=walk&bg=key" --times 0.1,0.2
//
// URL parameters (all optional)
//   char=<name>        characters/<name>.js (default export = spec, docs/CHARACTERS.md §3); 'spike' = the lead's spike
//   runtime=auto|character|rig|spike   auto: Character (src/chars/character.js) if it loads, else the static rig
//                      (src/chars/rig.js buildCharacter + clip sampling: anim.js if it exports a sampler, else ours),
//                      else the spike builder. The chosen runtime is printed in info().stats.char.runtime.
//   clip=<name>        clip to play (default idle; 'rest' = bind pose; 'turn' = Character runtime only: idle, then a
//                      180° turn at `at` and a 90° turn 1 s later — the stop-motion facing check, rubric #11). Actions start at `at` (default 0.25 s; before
//                      that the idle clip plays) so a 60 Hz strip sees the lead-in.
//   frame=<i>          freeze the clip at key-grid frame i (pose of grid frame i, i.e. clip time (i+0.5)/fps)
//   t=<sec>            freeze the stage clock at this time (any --t/--times then renders the same image)
//   at=<sec>           action start time, snapped to the clip key grid (default 0.25 → 8/30 s; 0 = first frame)
//   dir=<0-7>          facing relative to the camera, counter-clockwise on screen in 45° steps:
//                      0 S (towards the camera) 1 SE (screen down-right) 2 E (right) 3 NE 4 N (away) 5 NW 6 W 7 SW
//   face=<deg>         exact facing in degrees instead of dir (same origin/sense as dir·45)
//   move=auto|0|1      walk/run: 1 = travel along the facing at the clip speed with the camera following the
//                      character (feet planted in world space: foot-slide check); 0 = in place (root pinned:
//                      treadmill, as in a sprite sheet). auto = 1 for walk/run in single mode, 0 in grids.
//   speed=<m/s>        travel speed override for move=1
//   tod=noon|golden|night|morning   time of day (sun relative to the camera, as scenes/_test-all.js)
//   az=<deg>&elev=<deg>  override the sun (relAz, elevation; sky.sunDirFor)
//   vh=<viewHeight>    default 10 (36 px/m at 640x360; the character reference zoom); ppm=<px per m> alternative
//   yaw=<deg>          camera yaw (default 45); pitch=<deg> (default 30)
//   bg=meadow|plain|key   meadow: terrain + grass + pillar + cloud shadows + grade (+ lantern at night)
//                      plain: flat grass-coloured ground with shadows, no post grade
//                      key:   no ground, flat key-colour background (key=<hex>, default #00FF00) for masks/bakes
//   key=<hex>          key colour (pure primaries/secondaries survive the sRGB round trip bit-exactly)
//   shadow=1           (meadow/plain) adds a 2nd copy of the character standing in a pillar's cast shadow
//   grid=turnaround    8 copies, dir 0..7 left→right (one page load = whole turnaround), playing `clip`
//   grid=clips         one copy per clip (clips=a,b,… default: all spec clips), all at `dir`, in place
//   cols=<n>           grid columns (default: as many as fit)   cell=<px> grid cell size (default from height)
//   cover=<0..1>       cloud cover for meadow (default 0.55; 0 = off)   grass=0  grade=0  fog=1  lantern=0|1
//   testclips=1        add the tools' TEST_CLIPS (tpunch: step action, twave: eased loop) to the spec (pipeline tests)
//   clear=<m>          meadow: keep grass this far from the character origin (default 0)
//   legIK=frame|pose   override the Character's leg IK mode (A/B; default spec.character.legIK, else 'frame')
//   fx=0               do not attach the spec's smears (spec.smears) and FX (spec.fx); default: attached (lead)
//   mark=<part|slot>,… recolour those parts (part name, mirrored L/R copies included, or palette slot) pure magenta:
//                      charcheck's per-part masks (signature parts, accents) from the same layout (tools round 05)
//                      '@<bone>' marks every part on that bone and below (one side of a mirrored part: @footL); solo=1 keeps only
//                      the marked parts, hide=1 drops them (the body without them: charcheck sig_outside) — module fix wave 3
//   cover=<part|slot>,… with solo=1: these parts are KEPT in their own colours as occluders (module fix wave 5, T32:
//                      the face slot + its hair / hood cover → the face px a hair cap or hood rim hides BY DESIGN)
//   pan=<dx>,<dy>      camera pan: target moves k·(dx,dy) whole texels (right, up) at 60 Hz step k = floor(t·60)
//                      (engine time; works with a frozen t=…). panPeriod=<n> repeats. charcheck 'pan' row.
//
// Debug data for tools/charcheck.py (shot.mjs prints it in the `info:` line; also window.__pixel.charDebug):
//   info().stats.char = { name, runtime, height, texel, low:[w,h], clips:{name:{fps,loop,frames}}, cells:[{x,y,dir,clip}],
//                         bones:{head,feet:[L,R]}, log:[{t, p:[poseId per actor], f:[[x,y,z],[x,y,z]] feet world (actor 0),
//                         s:{r:[x,y], h:[x,y], f:[[x,y],[x,y]]} screen px of root/head joint/feet (actor 0),
//                         d: drawing id (actor 0: '<clip>:<frame>#<draws>' + '|fx<state>' while an FX object is visible),
//                         x: FX state ('s…' smear, 'p…' motes, 'f…' flash; only when visible), hs: head px per copy (grids)}],
//                         fa: [[x,y,z]…] every foot of bones.all (spec.feet; quadrupeds: hind + front paws),
//                         pan, signature, faceSlot, bodyPlan, heightPx, game, sigList:[{name, kind}], emote, length }
//   Screen px are in low-res pixel-edge coordinates (x right, y down; 0,0 = top-left corner of the image).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds, sunDirFor } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';

const D2R = Math.PI / 180;
export const DIR_NAMES = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
export const LOCOMOTION = new Set(['walk', 'run']);

// ------------------------------------------------------------------------------------------------ loading
async function tryImport(path) {
  try { return await import(path); } catch (e) {
    // a missing module (not landed yet) → null; a broken module → surface the error
    if (e instanceof SyntaxError || e instanceof ReferenceError || e instanceof TypeError && !/fetch|import/i.test(e.message)) throw e;
    console.warn(`char-stage: ${path} not available (${String(e.message || e).slice(0, 120)})`);
    return null;
  }
}

/** Load modules + spec. Returns { spec, runtime, mods }. */
export async function loadCharacter(name, runtime = 'auto', opts = {}) {
  const mods = {};
  let spec = null;
  if (name === 'spike' || runtime === 'spike') {
    mods.spike = await import('../src/chars/spike.js');
    return { spec: spikeSpec(mods.spike), runtime: 'spike', mods };
  }
  const m = await import(`../characters/${name}.js`);
  spec = m.default;
  if (opts.testClips) spec = { ...spec, clips: { ...TEST_CLIPS, ...(spec.clips || {}) } };
  mods.anim = await tryImport('../src/chars/anim.js');
  if (runtime === 'auto' || runtime === 'character') {
    mods.character = await tryImport('../src/chars/character.js');
    if (mods.character?.Character) {
      // spec.smears / spec.fx (docs/CHARACTERS.md §3): the stage attaches the character's smears and FX (lead)
      if (spec.smears && opts.fx !== false) mods.smear = await tryImport('../src/chars/smear.js');
      if (spec.fx && opts.fx !== false) mods.fx = await tryImport('../src/chars/fx.js');
      return { spec, runtime: 'character', mods };
    }
    if (runtime === 'character') throw new Error('char-stage: src/chars/character.js has no Character export');
  }
  mods.rig = await import('../src/chars/rig.js');
  mods.look = await tryImport('../src/chars/look.js');
  return { spec, runtime: 'rig', mods };
}

// ------------------------------------------------------------------------------------------------ clips
// Tool-test clips (?testclips=1): exercise actions/loops on a spec that has none yet (e.g. the bare mannequin).
// Biped bone names (rig.biped). Not a style reference — characters author their own clips.
export const TEST_CLIPS = {
  tpunch: {
    fps: 30, loop: false, interp: 'step',
    keys: [
      { f: 0, pose: { chest: [0, -30, 0], spine: [-5, -10, 0], upperArmR: [-30, 0, 25], forearmR: [70, 0, 0], thighL: [15, 0, 0], shinL: [-20, 0, 0] } },
      { f: 7, pose: { chest: [8, 35, 0], spine: [8, 15, 0], upperArmR: [80, 0, 15], forearmR: [5, 0, 0], upperArmL: [-25, 0, 10], thighL: [25, 0, 0], shinL: [-10, 0, 0], thighR: [-15, 0, 0] }, smear: 'weapon' },
      { f: 9, pose: { chest: [6, 30, 0], spine: [6, 12, 0], upperArmR: [70, 0, 15], forearmR: [15, 0, 0], upperArmL: [-20, 0, 10], thighL: [22, 0, 0], shinL: [-10, 0, 0], thighR: [-12, 0, 0] } },
      { f: 17, pose: { chest: [0, 10, 0], upperArmR: [20, 0, 10], forearmR: [40, 0, 0] } },
      { f: 23, pose: {} },
    ],
    events: { 7: 'hit' },
  },
  twave: {
    fps: 30, loop: true, interp: 'ease', twos: 2,
    keys: [
      { f: 0, pose: { upperArmL: [0, 0, 150], forearmL: [30, 0, 0], head: [0, 10, 0] } },
      { f: 8, pose: { upperArmL: [0, 0, 120], forearmL: [70, 0, 0], head: [0, 10, 5] } },
    ],
  },
};

/** Clip length in key-grid frames (cycle length for loops). */
export function clipFrames(clip) {
  if (!clip) return 1;
  if (clip.length) return clip.length;
  if (clip.frames) return clip.frames;
  const keys = clip.keys || [];
  if (!keys.length) return clip.loop ? 30 : 1;
  const last = keys[keys.length - 1].f;
  if (!clip.loop) return last + 1;
  const gap = keys.length > 1 ? Math.round(last / (keys.length - 1)) : 8;
  return last + Math.max(1, gap);
}

export function clipMeta(spec, anim = null, runtime = null) {
  const out = {};
  if (runtime === 'character') {  // procedural clips the Character provides when the spec has none
    if (!spec.clips?.idle) out.idle = { fps: 30, loop: true, frames: 84, interp: 'step', twos: 1, procedural: true };
    if (spec.locomotion) for (const n of ['walk', 'run']) if (!spec.clips?.[n]) out[n] = { fps: 30, loop: true, frames: 30, interp: 'gait', twos: 2, procedural: true };
  }
  for (const [n, c] of Object.entries(spec.clips || {})) {
    if (anim?.clipInfo) { const i = anim.clipInfo(c); out[n] = { fps: i.fps, loop: i.loop, frames: i.length, interp: i.interp, twos: i.twos }; continue; }
    out[n] = { fps: c.fps || 30, loop: !!c.loop, frames: clipFrames(c), interp: c.interp || (c.loop ? 'ease' : 'step'), twos: c.twos || (c.loop ? 2 : 1) };
  }
  return out;
}

const smooth = (u) => u * u * (3 - 2 * u);
function lerpPose(a, b, u, names) {
  const out = {};
  for (const n of names) {
    const x = a[n], y = b[n];
    if (!x && !y) continue;
    const A = x || [0, 0, 0], B = y || [0, 0, 0];
    out[n] = A.map((v, i) => v + ((B[i] ?? 0) - v) * u);
  }
  return out;
}

/** Fallback sampler (used only when anim.js has no sampler): returns { pose, frame, id }. */
export function sampleClip(clip, tc) {
  const fps = clip.fps || 30, len = clipFrames(clip), keys = clip.keys || [];
  let g = Math.floor(Math.max(0, tc) * fps + 1e-6);
  g = clip.loop ? ((g % len) + len) % len : Math.min(g, len - 1);
  if (!keys.length) return { pose: {}, frame: 0, id: 0 };
  const interp = clip.interp || (clip.loop ? 'ease' : 'step');
  if (interp === 'step') {
    let k = 0; for (let i = 0; i < keys.length; i++) if (keys[i].f <= g) k = i;
    return { pose: keys[k].pose || {}, frame: keys[k].f, id: k };
  }
  const twos = clip.twos || 2;
  const s = Math.floor(g / twos) * twos;
  let k = 0; for (let i = 0; i < keys.length; i++) if (keys[i].f <= s) k = i;
  const a = keys[k];
  const b = k + 1 < keys.length ? keys[k + 1] : (clip.loop ? { ...keys[0], f: len } : a);
  const u = b.f > a.f ? smooth((s - a.f) / (b.f - a.f)) : 0;
  const names = new Set([...Object.keys(a.pose || {}), ...Object.keys(b.pose || {})]);
  return { pose: lerpPose(a.pose || {}, b.pose || {}, u, names), frame: s, id: s };
}

function animSampler(anim) {
  if (!anim) return null;
  if (typeof anim.evaluateClip === 'function') {  // motion owner's evaluator: {poseMap, frame, cycle, …}
    return { name: 'evaluateClip', fn: (clip, tc) => { const r = anim.evaluateClip(clip, tc); return { pose: r.poseMap, id: `${r.cycle}.${r.frame}`, frame: r.frame }; } };
  }
  for (const k of ['sampleClip', 'samplePose', 'evalClip', 'clipPoseAt', 'poseAt']) {
    if (typeof anim[k] === 'function') return { name: k, fn: anim[k] };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ actors
/**
 * One displayed character. Common surface over the three runtimes:
 *   actor.root, actor.bones (name → Object3D), actor.poseId (last displayed pose id), actor.height
 *   actor.set({clip, face, pos, move, speed, at, pin}) before the first frame; the actor updates itself.
 * `clock(t)` maps engine time to stage time (frozen frame / time).
 */
export function createActor(engine, loaded, opts) {
  const { spec, runtime, mods } = loaded;
  const st = {
    clip: opts.clip || 'idle', face: opts.face ?? 0, base: opts.pos ? opts.pos.clone() : new THREE.Vector3(),
    move: !!opts.move,
    speed: opts.speed ?? (opts.clip === 'run' ? spec.locomotion?.runSpeed ?? 3.4 : spec.locomotion?.walkSpeed ?? 1.4), at: opts.at ?? 0.25, pin: !!opts.pin, clock: opts.clock || ((t) => t),
    frameFix: opts.frameFix ?? null, ground: opts.ground || null,
  };
  const clipSpec = spec.clips?.[st.clip];
  const isLoco = LOCOMOTION.has(st.clip);
  const isAction = !!clipSpec && !clipSpec.loop && !isLoco;
  const holdClip = isAction && !!(clipSpec.hold ?? ['vote', 'die'].includes(st.clip));   // Character clip.hold default
  const dirVec = new THREE.Vector3(Math.sin(st.face), 0, Math.cos(st.face));
  const posAt = (t) => st.base.clone().addScaledVector(dirVec, st.move ? st.speed * Math.max(0, t) : 0);
  const actor = { runtime, spec, poseId: 'init', root: null, bones: {}, height: spec.height || 1.4, posAt, st };

  if (runtime === 'character') {
    const { Character } = mods.character;
    // proxy engine: the Character's update hooks see the stage clock (frozen frames / times)
    const proxy = Object.create(engine);
    proxy.onUpdate = (fn) => engine.onUpdate((t, dt, e) => fn(st.clock(t), dt, e));
    const ch = new Character(proxy, spec, { ground: st.ground || undefined, facingSteps: 8, snap: true, face: st.face, position: st.base.clone(),
      ...(engine.params?.get?.('legIK') ? { legIK: engine.params.get('legIK') } : {}), ...(opts.charOpts || {}) });
    actor.ch = ch; actor.root = ch.root; actor.bones = ch.rig?.bones || {};
    ch.on?.('pose', (e) => { actor.poseId = `${e.clip}:${e.frame ?? e.keyIndex ?? e.key}`; actor.draws = (actor.draws || 0) + 1; });
    // FX activity fallback (only for FX modules that expose no visible objects, see fxSignature): ~1 s after a clip
    // event that maps to an FX kind (fx.js EVENT_MAP / spec.fx.map). Never for unmapped events (gait 'step' with no
    // dust for that clip, 'clip' markers) and never without FX modules: with fx=0 nothing extends it (critic fix)
    ch.on?.('event', (e) => { if (fxKindOf(mods, spec, e)) actor.fxUntil = Math.max(actor.fxUntil ?? -1, (e.t ?? 0) + 1.0); });
    ch.on?.('reset', () => { actor.fxUntil = -1; actor.draws = 0; });
    ch.drive((t) => {
      // pseudo-clip 'turn' (lead): idle, then at `at` the wanted facing flips 180° (+ another 90° 1 s later) →
      // the Character's stop-motion turn (one 45° step per turnHold grid frames + idle recovery steps)
      const turn = st.clip === 'turn' ? (t >= st.at ? Math.PI : 0) + (t >= st.at + 1 ? Math.PI / 2 : 0) : 0;
      const out = { pos: posAt(t), face: st.face + turn };
      // held one-shots (clip.hold, default for vote/die: Character holds the last key while the drive keeps returning
      // the name) keep the name from `at` on — lead r6: the old 0.05 s pulse released the hold, so die/vote sprang back
      if (isAction) out.action = t >= st.at && (holdClip || t < st.at + 0.05) ? st.clip : null;
      return out;
    });
    if (!isAction && !isLoco && st.clip !== 'idle' && clipSpec && ch.play) ch.play(st.clip, { restart: true });
    // the character's own smears + FX (spec.smears = { <socket>: attachSmears socket opts }, spec.fx = attachFx opts)
    if (mods.smear?.attachSmears && spec.smears) actor.smears = mods.smear.attachSmears(proxy, ch, { sockets: spec.smears });
    // not on pinned (treadmill) walk/run copies: their gait feet travel in the world while the root is held, so
    // footstep dust would land in other cells (grids, bakes)
    if (mods.fx?.attachFx && spec.fx && !st.pin) actor.fx = mods.fx.attachFx(proxy, ch, { ground: st.ground || undefined, ...spec.fx });
    if (st.pin) engine.onUpdate(() => { ch.root.position.copy(st.base); ch.root.updateMatrixWorld(true); });
    engine.scene.add(ch.root);
    return actor;
  }

  // static rig / spike: we drive the pose ourselves
  let rig;
  if (runtime === 'spike') {
    rig = mods.spike.buildSpikeCharacter(engine, spec.spike);
    rig.applyPose = (p) => rig.setPose(p);
  } else {
    rig = mods.rig.buildCharacter(engine, spec);
  }
  actor.rig = rig; actor.root = rig.root; actor.bones = rig.bones || {};
  rig.root.position.copy(st.base);
  rig.root.rotation.y = st.face;
  engine.scene.add(rig.root);
  engine.camera.snapObjectToTexel(rig.root);
  const sampler = runtime === 'rig' ? animSampler(mods.anim) : null;
  const sample = (clip, tc) => {
    if (runtime === 'spike') return spec.spikeSample(clip, tc);
    if (sampler) {
      const r = sampler.fn(clip, tc);
      if (r && r.pose) return { pose: r.pose, id: r.id ?? r.frame ?? r.keyIndex ?? JSON.stringify(r.pose).length, frame: r.frame };
      if (r) return { pose: r, id: JSON.stringify(r) };
    }
    return sampleClip(clip, tc);
  };
  const idle = spec.clips?.idle;
  engine.onUpdate((tEngine) => {
    const t = st.clock(tEngine);
    let clipName = st.clip, tc = t;
    if (st.frameFix !== null) tc = (st.frameFix + 0.5) / ((clipSpec?.fps) || 30);
    else if (isAction) { tc = t - st.at; if (tc < 0) { clipName = idle ? 'idle' : 'rest'; tc = t; } }
    const c = clipName === 'rest' ? null : (runtime === 'spike' ? clipName : spec.clips?.[clipName]);
    const s = c ? sample(c, tc) : { pose: {}, id: 0 };
    if (runtime === 'spike') rig.applyPose(s.pose); else { rig.restPose?.(); rig.applyPose(s.pose); }
    rig.root.position.copy(st.pin ? st.base : posAt(t));
    rig.root.rotation.y = st.face;
    rig.root.updateMatrixWorld(true);
    mods.look?.updateLook?.(engine, rig);
    actor.poseId = `${clipName}:${s.id}`;
  });
  return actor;
}

// ------------------------------------------------------------------------------------------------ spike
// Prototype character until characters/mannequin.js lands: the lead's spike spec, Euler-degree poses.
function spikeSpec(spike) {
  const B = (w, h, d, c) => spike.chamferBox(w, h, d, c);
  const s = {
    palette: {
      cloak: ['#E5C98F', '#B98A5A', '#6E5A6E'], skin: ['#F2D2B0', '#D9A982', '#8C6A78'],
      dark: ['#6C6A86', '#4A4862', '#34334A'], steel: ['#E8ECEF', '#A9B4BE', '#5F6A82'],
    },
    bones: [
      { name: 'hips', pos: [0, 0.55, 0] }, { name: 'chest', parent: 'hips', pos: [0, 0.22, 0] },
      { name: 'head', parent: 'chest', pos: [0, 0.3, 0] },
      { name: 'armL', parent: 'chest', pos: [0.2, 0.22, 0] }, { name: 'foreL', parent: 'armL', pos: [0, -0.2, 0] },
      { name: 'armR', parent: 'chest', pos: [-0.2, 0.22, 0] }, { name: 'foreR', parent: 'armR', pos: [0, -0.2, 0] },
      { name: 'legL', parent: 'hips', pos: [0.09, -0.04, 0] }, { name: 'shinL', parent: 'legL', pos: [0, -0.25, 0] },
      { name: 'legR', parent: 'hips', pos: [-0.09, -0.04, 0] }, { name: 'shinR', parent: 'legR', pos: [0, -0.25, 0] },
    ],
    parts: [
      { bone: 'hips', geo: B(0.32, 0.18, 0.22), at: [0, 0.04, 0], color: 'cloak' },
      { bone: 'chest', geo: B(0.36, 0.3, 0.24), at: [0, 0.1, 0], color: 'cloak' },
      { bone: 'head', geo: B(0.34, 0.3, 0.3, 0.4), at: [0, 0.14, 0], color: 'skin' },
      { bone: 'head', geo: B(0.38, 0.12, 0.34, 0.4), at: [0, 0.28, -0.01], color: 'dark' },
      { bone: 'armL', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
      { bone: 'foreL', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
      { bone: 'armR', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
      { bone: 'foreR', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
      { bone: 'foreR', geo: B(0.05, 0.6, 0.02, 0), at: [0, -0.45, 0.06], color: 'steel' },
      { bone: 'legL', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
      { bone: 'shinL', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
      { bone: 'legR', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
      { bone: 'shinR', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
    ],
  };
  const walk = (tc, rate) => {
    const ph = Math.floor(tc * rate) / rate * Math.PI * 2 * 0.75, k = Math.sin(ph);
    return {
      legL: [30 * k, 0, 0], shinL: [-25 * Math.max(0, -k), 0, 0], legR: [-30 * k, 0, 0], shinR: [-25 * Math.max(0, k), 0, 0],
      armL: [-25 * k, 0, 8], armR: [25 * k, 0, -8], foreR: [-30, 0, 0], foreL: [-20, 0, 0], chest: [4, 8 * k, 0], head: [0, -6 * k, 0],
    };
  };
  return {
    name: 'spike', height: 1.4, palette: s.palette, spike: s,
    clips: { idle: { fps: 30, loop: true, length: 40 }, walk: { fps: 30, loop: true, length: 40 }, attack: { fps: 30, loop: false, length: 24 } },
    locomotion: { walkSpeed: 1.2, runSpeed: 3 },
    spikeSample(clip, tc) {
      const g = Math.floor(Math.max(0, tc) * 30 + 1e-6);
      if (clip === 'walk') { const k = Math.floor(g / 4); return { pose: walk(k * 4 / 30, 7.5), id: k % 10 }; }
      if (clip === 'attack') {
        const k = g < 6 ? 0 : g < 8 ? 1 : g < 16 ? 2 : 3;
        const P = [{ chest: [0, -25, 0], armR: [-40, 0, -30], foreR: [-40, 0, 0] }, { chest: [0, 35, 0], armR: [-90, 0, -10], foreR: [0, 0, 0] },
          { chest: [0, 30, 0], armR: [-80, 0, 0], foreR: [-10, 0, 0] }, { foreR: [-30, 0, 0] }][k];
        return { pose: P, id: k };
      }
      const k = Math.floor(g / 20) % 2; // idle: 2 held poses
      return { pose: { chest: [k ? 3 : 0, 0, 0], head: [k ? -3 : 0, 0, 0], foreR: [-30, 0, 0], foreL: [-20, 0, 0] }, id: k };
    },
  };
}

// ------------------------------------------------------------------------------------------------ helpers
/** FX kind a Character event triggers ('step' | 'land' | 'spark' | 'flash'), or null (no FX attached / unmapped /
 *  gait footstep of a clip that does not puff). Mirrors fx.js onEvent. */
export function fxKindOf(mods, spec, e) {
  if (!mods.fx?.attachFx || !spec.fx || !e?.name) return null;
  const map = spec.fx.map ? Object.entries(spec.fx.map).map(([k, v]) => [new RegExp(k, 'i'), v]) : (mods.fx.EVENT_MAP || []);
  const kind = map.find(([re]) => re.test(e.name))?.[1] ?? null;
  if (kind === 'step' && e.name === 'step' && e.clip && !(spec.fx.stepClips ?? ['run']).includes(e.clip)) return null;
  return kind;
}

/**
 * What the actor's FX currently show, as a short string that changes exactly when the FX image changes ('' = no FX
 * visible): visible smear meshes (birth + stage mode), live dust/spark motes (count + stepped ages, as the fx.js
 * vertex shader steps them: dust 10 fps, sparks 15 fps) and the hit-flash tone. `tE` = engine time (uTime).
 * Returns null when an attached FX module exposes nothing to inspect (caller falls back to fxUntil).
 */
export function fxSignature(actor, tE) {
  const parts = [];
  let opaque = false;
  if (actor.smears) {
    if (!Array.isArray(actor.smears.pool)) opaque = true;
    else for (const m of actor.smears.pool) {
      if (!m.visible) continue;
      const r = m.userData?.smear;
      parts.push(`s${r ? Math.round(r.birth * 600) : '?'}.${m.material?.uniforms?.uMode?.value ?? '?'}`);
    }
  }
  const fx = actor.fx;
  if (fx) {
    if (!fx.points && !fx.flashMesh) opaque = true;
    const a = fx.points?.visible ? fx.points.geometry?.attributes?.aInfo : null;
    if (a) {
      let n = 0, h = 0;
      for (let i = 0; i < a.count; i++) {
        const birth = a.array[i * 4], kind = a.array[i * 4 + 1], life = a.array[i * 4 + 3];
        if (life <= 0) continue;
        const fps = kind < 0.5 ? 10 : 15;
        const age = Math.floor((tE - birth) * fps + 0.01) / fps;
        if (age < 0 || age >= life) continue;
        n++; h = (h * 31 + Math.round(age * fps) * 7 + i + 1) % 1000003;
      }
      if (n) parts.push(`p${n}.${h}`);
    }
    if (fx.flashMesh?.visible) parts.push(`f${fx.flashMesh.material?.color?.getHexString?.() ?? 1}`);
  }
  if (opaque && !parts.length) return null;
  return parts.join(',');
}

/** Camera basis helpers. Screen px (pixel-edge coords) of a world point given the camera state. */
export function projector(engine) {
  const cam = engine.camera;
  return (p) => {
    cam.snapWorld(p); // ensures the basis is current
    const t = cam.texelWorld, R = cam.right, U = cam.up, T = cam.target;
    const cx = Math.round(T.dot(R) / t) * t, cy = Math.round(T.dot(U) / t) * t;
    return [+((p.dot(R) - cx) / t + engine.lowW / 2).toFixed(2), +(engine.lowH / 2 - (p.dot(U) - cy) / t).toFixed(2)];
  };
}

/** World position whose projection is (dx, dy) px from the camera target (dy down), on the ground plane y = y0. */
export function screenToGround(engine, dx, dy, y0 = 0) {
  const cam = engine.camera, t = cam.texelWorld, yaw = cam.yaw, pitch = cam.pitch;
  const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), Fh = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  return cam.target.clone().setY(y0).addScaledVector(R, dx * t).addScaledVector(Fh, -dy * t / Math.sin(pitch));
}

export function findBones(bones) {
  const pick = (re) => Object.keys(bones).find((n) => re.test(n));
  const foot = (s) => pick(new RegExp(`^(foot|ankle)${s}$`)) || pick(new RegExp(`^(shin|lowerLeg|calf|knee)${s}$`)) || pick(new RegExp(`^(toe)${s}$`));
  return { head: pick(/^head$/) || pick(/^neck$/), feet: [foot('L'), foot('R')] };
}

const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];

// ---- tools round 05 (additive; no pixel change unless ?mark= is given) --------------------------------------------
/** spec.signature normalised to a list: '<slot>' | ['<slot>'|'<part name>', …] | { slot } | { slots:[…], parts:[…] }. */
export function signatureList(spec) {
  const s = spec.signature, pal = spec.palette || {};
  const items = [];
  const add = (x, kind) => { if (x && !items.some((i) => i.name === x)) items.push({ name: x, kind: kind || (x in pal ? 'slot' : 'part') }); };
  if (typeof s === 'string') add(s);
  else if (Array.isArray(s)) s.forEach((x) => add(typeof x === 'string' ? x : x?.part || x?.slot, x?.part ? 'part' : x?.slot ? 'slot' : undefined));
  else if (s && typeof s === 'object') { if (s.slot) add(s.slot, 'slot'); (s.slots || []).forEach((x) => add(x, 'slot')); (s.parts || []).forEach((x) => add(x, 'part')); }
  return items;
}

/** Foot bones the checks follow: spec.feet (any count: 4 paws, 1 snail foot, …), else foot/ankle L/R, plus the front
 *  paws (hand/forefoot L/R) when spec.bodyPlan is 'quadruped'. */
export function footList(spec, bones) {
  if (Array.isArray(spec.feet)) return spec.feet.filter((n) => bones[n]);
  const fb = findBones(bones).feet.filter(Boolean);
  if (/quad/.test(spec.bodyPlan || '')) for (const n of ['handL', 'handR', 'forefootL', 'forefootR', 'pawFL', 'pawFR']) if (bones[n] && !fb.includes(n)) fb.push(n);
  return fb;
}

/** Spec fields charcheck needs (body plan targets, game speed, signature parts, emote, required clips). */
export function specMeta(spec) {
  return {
    bodyPlan: spec.bodyPlan ?? null, heightPx: spec.heightPx ?? null, locoPlan: spec.locomotion?.plan ?? null,
    presence: spec.presence ?? null,   // (module fix T13) [lo, hi] share of the mannequin area (charcheck presence row)
    // game speed: spec.game.speed (tools name) or spec.gameSpeed.v (CHARACTERS.md §3 cast field) — lead r6: one source
    game: spec.game ?? (spec.gameSpeed?.v ? { speed: spec.gameSpeed.v } : null),
    sigList: signatureList(spec), emote: spec.emote ?? spec.cast?.emote ?? null, length: spec.length ?? null,
    partNames: [...new Set((spec.parts || []).map((p) => p.name).filter(Boolean))],
    partSlots: Object.fromEntries((spec.parts || []).filter((p) => p.name && typeof p.color === 'string').map((p) => [p.name, p.color])),
    // (module fix, wave 3: T25) held props for prop_area (spec.props: part names; default: named parts on bones BELOW a
    // hand bone) and the eye slot for face_shimmer (spec.eyeSlot; default the palette slot named eye/eyes/pupil/lens)
    props: spec.props ?? propParts(spec),
    eyeSlot: spec.eyeSlot ?? Object.keys(spec.palette || {}).find((n) => /^(eyes?|pupils?|lens)$/i.test(n)) ?? null,
    // (module fix, wave 5: T32) parts that cover the face area by design (face_visible exempts the face px they hide)
    faceCover: spec.faceCover ?? faceCoverParts(spec),
  };
}
// default face cover: named parts on the head bone (or below it) whose part name or palette slot reads as hair / hood
// (hair cap, fringe, bun, hood, hood rim, cowl, wig), never the face slot itself. A hat BRIM is not exempt (T4's case).
function faceCoverParts(spec) {
  const skel = Array.isArray(spec.skeleton) ? spec.skeleton : [];
  const par = new Map(skel.map((b) => [b.name, b.parent]));
  const head = skel.find((b) => /^head$/.test(b.name))?.name ?? skel.find((b) => /^neck$/.test(b.name))?.name;
  if (!head) return [];
  const under = (b) => { for (let x = b, n = 0; x && n < 64; x = par.get(x), n++) if (x === head) return true; return false; };
  const pal = spec.palette || {};
  const face = spec.faceSlot && spec.faceSlot in pal ? spec.faceSlot : Object.keys(pal).find((n) => /skin|face/i.test(n));
  const RX = /hair|hood|fringe|bangs?$|wig|cowl|^bun/i;
  return [...new Set((spec.parts || []).filter((p) => p.name && under(p.bone) && p.color !== face &&
    (RX.test(p.name) || (typeof p.color === 'string' && RX.test(p.color)))).map((p) => String(p.name).replace(/[LR]\d*$/, '')))];
}
function propParts(spec) {
  const skel = Array.isArray(spec.skeleton) ? spec.skeleton : [];
  const par = new Map(skel.map((b) => [b.name, b.parent]));
  const belowHand = (b) => { for (let x = par.get(b), n = 0; x && n < 64; x = par.get(x), n++) if (/hand|grip|wrist/i.test(x)) return true; return false; };
  return [...new Set((spec.parts || []).filter((p) => p.name && belowHand(p.bone) && !/^[a-z]_|ghost|halo/i.test(p.name)).map((p) => String(p.name).replace(/[LR]\d*$/, '')))];
}

/** ?mark=<part|slot>,… → a spec copy whose matching parts (by part name — a mirrored part matches with or without its
 *  L/R suffix — or by palette slot) are pure magenta (all three tones #FF00FF): charcheck finds each part's VISIBLE
 *  pixels per facing from the same layout render (hue mask). Line ids change for marked parts; masks only. */
export function markSpec(spec, names, { solo = false, hide = false, cover = [] } = {}) {   // (module fix T4) solo: only the marked parts are kept (unoccluded px)
  const want = new Set(names.filter(Boolean));
  const strip = (n) => String(n || '').replace(/[LR]\d*$/, '');
  // (module fix, wave 3: T16/T25) '@<bone>' marks every part on that bone or below it (a mirrored part counts for the
  // bone it is emitted on: '@footL' = the left foot only); hide=1 drops the marked parts instead (the body without them)
  const skel = spec.skeleton || spec.bones || [];
  const par = new Map(Array.isArray(skel) ? skel.map((b) => [b.name, b.parent]) : []);
  const under = (b, root) => { for (let x = b, n = 0; x && n < 64; x = par.get(x), n++) if (x === root) return true; return false; };
  const swap = (n) => String(n).replace(/([LR])(\d*)$/, (_, s, d) => (s === 'L' ? 'R' : 'L') + d);
  const boneHits = [...want].filter((w) => w.startsWith('@')).map((w) => w.slice(1));
  const onBone = (b) => boneHits.some((r) => under(b, r));
  const hit = (p) => want.has(p.name) || want.has(strip(p.name)) || (typeof p.color === 'string' && want.has(p.color)) ||
    (boneHits.length > 0 && onBone(p.bone));
  const parts = [];
  for (const p of spec.parts || []) {
    // a mirrored part on '@<bone>': split into the two emitted copies so only the matching side is marked
    if (boneHits.length && p.mirror && onBone(p.bone) !== onBone(swap(p.bone))) {
      const a = { ...p, mirror: false }, b = { ...p, mirror: false, bone: swap(p.bone), at: p.at ? [-p.at[0], p.at[1], p.at[2]] : p.at,
        rot: p.rot ? [p.rot[0], -p.rot[1], -p.rot[2]] : p.rot, shape: p.shape ? mirrorShape(p.shape) : p.shape, geo: undefined };
      parts.push(a, b);
      continue;
    }
    parts.push(p);
  }
  // (module fix, wave 5: T32) cover: kept unmarked in solo renders (occluders that belong there by design)
  const cov = new Set(cover.filter(Boolean));
  const covHit = (p) => cov.size > 0 && !hit(p) && (cov.has(p.name) || cov.has(strip(p.name)) || (typeof p.color === 'string' && cov.has(p.color)));
  const keep = (p) => (hide ? !hit(p) : !solo || hit(p) || covHit(p));
  return {
    ...spec,
    palette: { ...(spec.palette || {}), __mark: ['#FF00FF', '#FF00FF', '#FF00FF'] },
    parts: parts.filter(keep).map((p) => (!hide && (hit(p) || (boneHits.length && onBone(p.bone))) ? { ...p, color: '__mark' } : p)),
  };
}
// x-mirrored copy of a part geometry (markSpec splits mirrored parts by side; the rig mirrors the same way)
function mirrorShape(g) {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const ix = m.index;
  if (ix) { const a = ix.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { const P = m.attributes.position; for (let i = 0; i < P.count; i += 3) for (const at of Object.values(m.attributes)) { const s = at.itemSize; for (let k = 0; k < s; k++) { const t = at.array[(i + 1) * s + k]; at.array[(i + 1) * s + k] = at.array[(i + 2) * s + k]; at.array[(i + 2) * s + k] = t; } } }
  m.computeVertexNormals?.();
  return m;
}

/** Per-frame debug log (engine.stats.char.log + window.__pixel.charDebug). Register AFTER the actors. */
export function attachDebug(engine, actors, meta) {
  const proj = projector(engine);
  const gp = actors.find((a) => a.ch?.gait?.p?.poses)?.ch.gait.p.poses;
  if (gp) meta.gait = { walk: gp[0], run: gp[1] }; // drawings per gait cycle (Character pose ids 'walk:<n>' count up)
  const bn = actors[0] ? findBones(actors[0].bones) : { feet: [] };
  const fa = actors[0] ? footList(actors[0].spec || {}, actors[0].bones) : [];
  const dbg = { ...meta, bones: { ...bn, all: fa }, log: [] };
  engine.stats.char = dbg;
  window.__pixel.charDebug = dbg;
  const wp = new THREE.Vector3();
  engine.onUpdate((t) => {
    const a0 = actors[0];
    const e = { t: +t.toFixed(4), p: actors.map((a) => a.poseId) };
    // drawing id: pose id + displayed-pose counter (dynamics-only redraws keep the clip frame) + the FX state while an
    // FX object is actually VISIBLE (smear stage, live motes' stepped ages, flash tone; fxSignature) — charcheck's
    // flicker check uses it, so FX may change the image only when their own state changes, and a 30 Hz body pop
    // inside a 15 Hz hold is still caught (tools fix after the critic: the old tag added the grid frame for ~1 s
    // after ANY clip event, gait footsteps included, which blinded the check for walk/run)
    const a0d = actors[0];
    if (a0d && a0d.draws !== undefined) {
      const tc = a0d.st.clock(t);
      // FX age on the Character/stage clock (fx.js uFxTime = the proxy's st.clock(t)), not engine uTime — lead r6;
      // identical unless the stage clock is frozen
      const tE = tc;
      let sig = fxSignature(a0d, tE);
      if (sig === null) sig = tc <= (a0d.fxUntil ?? -1) ? `g${Math.floor(tc * 30 + 0.01)}` : '';
      e.d = `${a0d.poseId}#${a0d.draws}` + (sig ? `|fx${sig}` : '');
      if (sig) e.x = sig;   // 's…' = smear visible (charcheck: smear contact keys may be held 1 grid frame)
    }
    if (a0) {
      a0.root.updateMatrixWorld(true);
      // shift by the root's texel snap (applied later in camera.update) so screen px match the image
      const snapOf = (a) => { const rp = new THREE.Vector3().setFromMatrixPosition(a.root.matrixWorld); return engine.camera.snapWorld(rp.clone()).sub(rp); };
      const snapD = snapOf(a0);
      const S = (o, d = snapD) => { wp.setFromMatrixPosition(o.matrixWorld); return proj(wp.clone().add(d)); };
      e.s = { r: S(a0.root) };
      // grids: every copy's head joint (charcheck face_lit / per-facing head boxes)
      if (actors.length > 1 && bn.head) e.hs = actors.map((a) => (a.bones[bn.head] ? (a.root.updateMatrixWorld(true), S(a.bones[bn.head], snapOf(a))) : null));
      if (bn.head && a0.bones[bn.head]) e.s.h = S(a0.bones[bn.head]);
      if (bn.feet[0] && bn.feet[1] && a0.bones[bn.feet[0]] && a0.bones[bn.feet[1]]) {
        e.f = bn.feet.map((n) => r3(wp.setFromMatrixPosition(a0.bones[n].matrixWorld)));
        e.s.f = bn.feet.map((n) => S(a0.bones[n]));
      }
      // every foot (spec.feet) where it is DRAWN (bone world + any stage-side texel snap); sd = the drawn root minus the
      // driven (unsnapped) root position, i.e. the total texel snap of the figure (the Character snaps its own root):
      // fa − sd = the foot in the continuous world (charcheck: stance + true slide), fa = what the viewer sees
      if (fa.length) {
        e.fa = fa.map((n) => r3(wp.setFromMatrixPosition(a0.bones[n].matrixWorld).add(snapD)));
        const drawnRoot = new THREE.Vector3().setFromMatrixPosition(a0.root.matrixWorld).add(snapD);
        const driven = a0.st.pin ? a0.st.base.clone() : a0.posAt(a0.st.clock(t));
        e.sd = r3(drawnRoot.sub(driven).setY(0));
        // fp: the gait's own "shown planted" flag per foot of fa (Character.feet() of the displayed drawing; leg key →
        // its end bone). charcheck uses it as the stance test when present (a hop/skim foot low over the ground is not
        // planted; tools r05). Absent for runtimes without feet().
        const ft = a0.ch?.feet?.(), legs = a0.ch?.gait?.legs;
        if (ft && legs) {
          const byBone = {};
          for (const l of legs) { const end = Array.isArray(l.bones) ? l.bones[l.bones.length - 1] : null; if (end && ft[l.key]) byBone[end] = ft[l.key].planted ? 1 : 0; }
          if (fa.some((n) => n in byBone)) e.fp = fa.map((n) => (n in byBone ? byBone[n] : -1));
        }
      }
    }
    dbg.log.push(e);
  });
  return dbg;
}

/** Key colour background: no ground, no post grade; sky = key colour. */
export function setKeyBackground(engine, hex) {
  engine.style.sky.set(hex); // THREE.Color(hex) → linear; the pipeline outputs sRGB → bit-exact for 0/255 channels
}

export function parseCommon(params) {
  const P = (k, d) => params.get(k) ?? d;
  const vh = params.has('ppm') ? 360 / Number(P('ppm')) : Number(P('vh', 10));
  return {
    P, vh, name: P('char', 'mannequin'), runtime: P('runtime', 'auto'),
    yaw: Number(P('yaw', 45)) * D2R, pitch: Number(P('pitch', 30)) * D2R,
    tod: P('tod', 'noon'), key: '#' + String(P('key', '00FF00')).replace('#', ''),
  };
}

export function sunFor(tod, P) {
  const o = tod === 'night' ? { relAz: 140, elev: 45 } : tod === 'golden' ? { relAz: -140, elev: 26 } : tod === 'morning' ? {} : { relAz: 155, elev: 50 };
  if (P('az', null) !== null) o.relAz = Number(P('az'));
  if (P('elev', null) !== null) o.elev = Number(P('elev'));
  return o;
}

// ------------------------------------------------------------------------------------------------ scene
export default async function build(engine, params) {
  const C = parseCommon(params);
  const { P } = C;
  const loaded = await loadCharacter(C.name, C.runtime, { testClips: P('testclips', '0') === '1', fx: P('fx', '1') !== '0' });
  if (params.has('mark')) loaded.spec = markSpec(loaded.spec, P('mark').split(','), { solo: P('solo', '0') === '1', hide: P('hide', '0') === '1', cover: P('cover', '').split(',') });
  const { spec } = loaded;
  const height = spec.height || 1.4;
  const bg = P('bg', 'meadow');
  const grid = P('grid', null);
  const clipName = P('clip', 'idle');
  const fps = spec.clips?.[clipName]?.fps || 30;
  // action start snapped to the clip's key grid (a start between grid frames shifts every pose change off-grid)
  const at = Math.round(Number(P('at', 0.25)) * fps) / fps;

  // stage clock: frozen time / frame, else engine time
  const fixT = params.has('t') ? Number(P('t')) : null;
  const frameFix = params.has('frame') ? Number(P('frame')) : null;
  // (module fix T1) LOOP clips (idle, talk, ghost …) start at t = 0, not at `at`: frame=<i> on a loop clip used to
  // render key-grid frame i + at·fps (talk frame=0 → talk:6, idle 54 → idle:62). One-shots still start at `at`.
  const loopFrame = clipName === 'idle' || (!!spec.clips?.[clipName]?.loop && !LOCOMOTION.has(clipName));
  let fixLoco = null;   // (module fix T9) walk/run + frame=k: the stage time at which the gait shows drawing k (set below)
  const clock = (t) => (frameFix !== null ? (fixLoco ?? (frameFix + 0.5) / fps + (loopFrame ? 0 : at)) : fixT !== null ? fixT : t);

  const target = new THREE.Vector3(0, 0, 0);
  engine.camera.set({ target, yaw: C.yaw, pitch: C.pitch, viewHeight: C.vh });
  const texel = engine.camera.texelWorld;

  // ---- layout: list of {pos, face, clip, dir}
  const dirAngle = (d) => C.yaw + d * 45 * D2R;
  const dir = Number(P('dir', 1));
  const face0 = params.has('face') ? C.yaw + Number(P('face')) * D2R : dirAngle(dir);
  const cellPx = Number(P('cell', Math.ceil(height / texel * 1.3)));
  let slots = [];
  if (grid === 'turnaround') {
    slots = [...Array(8).keys()].map((d) => ({ face: dirAngle(d), clip: clipName, dir: d }));
  } else if (grid === 'clips') {
    let list = (P('clips', null)?.split(',') || Object.keys(clipMeta(spec, loaded.mods.anim, loaded.runtime))).filter(Boolean);
    if (!list.length) list = ['idle'];
    slots = list.map((c) => ({ face: face0, clip: c, dir }));
  } else {
    slots = [{ face: face0, clip: clipName, dir }];
  }
  if (slots.length > 1) {
    const cols = Number(P('cols', Math.max(1, Math.min(slots.length, Math.floor((engine.lowW - 8) / cellPx)))));
    const rows = Math.ceil(slots.length / cols);
    slots.forEach((s, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      // whole-pixel offsets → every copy rasterises identically relative to its root
      s.dx = Math.round((c - (cols - 1) / 2) * cellPx);
      s.dy = Math.round((r - (rows - 1) / 2) * cellPx + cellPx * 0.4);
    });
  }

  // ---- time of day / background
  const sunOpts = sunFor(C.tod, P);
  const shadowExtent = Math.max(8, C.vh * 1.2);
  applyTimeOfDay(engine, C.tod, { ...sunOpts, shadowExtent });
  const sunDir = sunDirFor(C.yaw, sunOpts.relAz ?? 60, sunOpts.elev ?? 35);
  let ground = { heightAt: () => 0 };
  const extras = [];

  // in-shadow companion: a 2nd copy standing in a pillar's cast shadow
  const wantShadow = P('shadow', '0') === '1' && bg !== 'key' && slots.length === 1;
  if (wantShadow) {
    slots[0].dx = slots[0].dy = undefined;
    const sh = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
    let perp = new THREE.Vector3(sh.z, 0, -sh.x);
    const R = new THREE.Vector3(Math.cos(C.yaw), 0, -Math.sin(C.yaw));
    if (perp.dot(R) < 0) perp.negate();
    slots[0].world = perp.clone().multiplyScalar(1.1);
    slots.push({ face: face0, clip: clipName, dir, world: perp.clone().multiplyScalar(-1.1), shade: true });
    const elev = Math.asin(Math.min(1, sunDir.y));
    const d = 1.5; // far enough to the side that the pillar never hides the shaded copy
    extras.push({ kind: 'pillar', pos: slots[1].world.clone().addScaledVector(sh, d), height: Math.min(4.5, height * 1.25 + (d + 0.4) * Math.tan(elev) + 0.3) });
  }
  // camera target: grids keep the target at the origin (whole-pixel cells); a single actor stands at the origin
  // with the target whole texels above it along U (camera and root snap in sync); the shadow pair is centred.
  const U = new THREE.Vector3(-Math.sin(C.pitch) * Math.sin(C.yaw), Math.cos(C.pitch), -Math.sin(C.pitch) * Math.cos(C.yaw));
  const upOff = Math.round(height * 0.45 / texel) * texel;
  if (wantShadow) target.copy(slots[0].world).add(slots[1].world).multiplyScalar(0.5).addScaledVector(U, upOff);
  else if (slots.length === 1) { slots[0].world = new THREE.Vector3(); target.set(0, 0, 0).addScaledVector(U, upOff); }
  engine.camera.set({ target });
  for (const s of slots) if (!s.world) s.world = screenToGround(engine, s.dx, s.dy);

  if (bg !== 'meadow') setClouds(engine, { scale: 0 }); // no drifting cloud shadow on mask/bake renders
  if (bg === 'key') {
    setKeyBackground(engine, C.key);
  } else if (bg === 'plain') {
    const { color, ramp } = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
    const plane = toonMesh(engine, new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), { color, ramp }, { receiveShadow: true, castShadow: false });
    engine.scene.add(plane);
  } else {
    ground = await buildMeadow(engine, { P, C, slots, target, extras, height });
  }
  if (bg !== 'meadow') {
    for (const x of extras) if (x.kind === 'pillar') {
      const { createPillar } = await import('../src/world/props.js');
      engine.scene.add(createPillar(engine, { height: x.height, seed: 7, position: x.pos }));
    }
  }

  // ---- actors. walk/run always TRAVEL (the Character's gait is distance-phased); pinned copies are drawn in place
  // (treadmill: root held at its slot after the update), the single travelling copy is followed by the camera.
  const moveP = P('move', 'auto');
  const actors = slots.map((s) => {
    const isLoco = LOCOMOTION.has(s.clip);
    const pin = isLoco && (moveP === '0' || (moveP === 'auto' && (slots.length > 1 || wantShadow)));
    const loco = spec.locomotion || {};
    const speed = Number(P('speed', s.clip === 'run' ? loco.runSpeed ?? 3.4 : loco.walkSpeed ?? 1.4));
    return createActor(engine, loaded, {
      clip: s.clip, face: s.face, pos: s.world, move: isLoco, speed, at, clock, frameFix, pin, ground,
    });
  });
  // (module fix T9) frame=<k> on walk/run: freeze at the first time (after one full cycle) the gait shows drawing k of its
  // cycle at this speed (procedural ids <gait>:<k>:<cycle>, authored <gait>:k<n>:<clip frame>:<cycle>), so
  // grid=turnaround&clip=walk&frame=k gives 8-facing contact stills. No such drawing → the old frame time.
  if (frameFix !== null && LOCOMOTION.has(clipName) && actors[0]?.ch?.state) {
    const ch0 = actors[0].ch;
    for (let n = 6; n < 360 && fixLoco === null; n++) {
      const tt = (n + 0.5) / 60; ch0.update(tt);
      const parts = String(ch0.state.frame ?? '').split(':');
      if (parts.length < 3 || !LOCOMOTION.has(parts[0])) continue;
      const k = Number(parts[1].startsWith('k') ? parts[2] : parts[1]), cyc = Number(parts[parts.length - 1]);
      if (cyc >= 1 && k === frameFix) fixLoco = tt;
    }
    if (fixLoco !== null) engine.stats.locoFrame = { frame: frameFix, t: fixLoco };
  }
  // camera pan (charcheck 'pan' row): pan=<dx>,<dy> moves the camera target by k·(dx, dy) WHOLE texels along the
  // camera's right / up axes at 60 Hz step k = floor(engine t · 60) (engine time, so it also pans with a frozen
  // t=…); panPeriod=<n> repeats the pattern every n steps. A static figure must re-rasterise identically, only shifted.
  const panP = P('pan', null);
  const panXY = panP ? panP.split(',').map(Number) : null;
  const panPeriod = Number(P('panPeriod', 1e9));
  const Rcam = new THREE.Vector3(Math.cos(C.yaw), 0, -Math.sin(C.yaw));
  const panOff = (t) => {
    if (!panXY) return new THREE.Vector3();
    const k = Math.floor(t * 60 + 0.01) % panPeriod;
    return Rcam.clone().multiplyScalar(k * (panXY[0] || 0) * texel).addScaledVector(U, k * (panXY[1] || 0) * texel);
  };
  const baseTarget = target.clone();
  // camera follows a travelling single actor (offset is whole texels along U → snaps in sync)
  if (actors.length === 1 && actors[0].st.move && !actors[0].st.pin) {
    const a = actors[0];
    // follow the SNAPPED position (lead): a continuous target leaves a sub-texel camera offset that the integer
    // upscale rounds to a whole-pixel shift of the whole image every few frames (the figure jumped 1 px vs the frame)
    engine.onUpdate((t) => { engine.camera.set({ target: engine.camera.snapWorld(a.posAt(clock(t))).addScaledVector(U, upOff).add(panOff(t)) }); });
  } else if (panXY) {
    engine.onUpdate((t) => { engine.camera.set({ target: baseTarget.clone().add(panOff(t)) }); });
  }

  const proj = projector(engine);
  const meta = {
    name: spec.name || C.name, runtime: loaded.runtime, height, texel: +texel.toFixed(5), vh: C.vh,
    low: [engine.lowW, engine.lowH], bg, grid, clip: clipName, dir, yaw: +(C.yaw / D2R).toFixed(2), pitch: +(C.pitch / D2R).toFixed(2),
    clips: clipMeta(spec, loaded.mods.anim, loaded.runtime), palette: spec.palette || {}, cell: cellPx, pan: panXY,
    // signature palette slot (spec.signature: '<slot>' | { slot }; charcheck isolated_px), face slot (face_lit)
    signature: typeof spec.signature === 'string' ? spec.signature : spec.signature?.slot ?? null, faceSlot: spec.faceSlot ?? null,
    ...specMeta(spec),
    cells: slots.map((s) => { const [x, y] = proj(engine.camera.snapWorld(s.world)); return { x: Math.round(x), y: Math.round(y), dir: s.dir, clip: s.clip, shade: !!s.shade }; }),
  };
  if (actors[0]?.rig?.mesh) meta.mesh = { tris: Math.round((actors[0].rig.mesh.geometry.index?.count ?? actors[0].rig.mesh.geometry.attributes.position.count) / 3) };
  attachDebug(engine, actors, meta);
}

async function buildMeadow(engine, { P, C, slots, target, extras, height }) {
  const [{ createTerrain }, { createGrass, viewArea }, props] = await Promise.all([
    import('../src/world/terrain.js'), import('../src/world/grass.js'), import('../src/world/props.js'),
  ]);
  const cover = Number(P('cover', C.tod === 'noon' || C.tod === 'morning' ? 0.55 : 0));
  setClouds(engine, cover > 0 ? { scale: 0.045, cover } : { scale: 0 });
  const terrain = createTerrain(engine, {
    size: 48, seed: 11, height: 0.9, flatten: [{ x: target.x, z: target.z, r: 5, h: 0, falloff: 4 }],
    zones: [{ type: 'dirt', x: target.x - 3.5, z: target.z + 2.5, r: 1.6 }],
  });
  const placed = [];
  const add = (o) => { engine.scene.add(o); placed.push(o); return o; };
  // the meadow's own pillar (back left), plus any shadow-casting pillar requested by the stage
  const R = new THREE.Vector3(Math.cos(C.yaw), 0, -Math.sin(C.yaw)), Fh = new THREE.Vector3(-Math.sin(C.yaw), 0, -Math.cos(C.yaw));
  if (!extras.length) add(props.createPillar(engine, { height: 2.6, seed: 31, position: target.clone().setY(0).addScaledVector(R, -3.2).addScaledVector(Fh, 2.2), terrain }));
  for (const x of extras) if (x.kind === 'pillar') add(props.createPillar(engine, { height: x.height, seed: 7, position: x.pos.clone(), terrain, debris: false }));
  if (C.tod === 'night' && P('lantern', '1') !== '0') {
    add(props.createLantern(engine, { position: target.clone().setY(0).addScaledVector(R, 1.6).addScaledVector(Fh, -0.6), terrain, seed: 3, lit: true, light: true }));
  }
  if (P('grass', '1') !== '0') {
    const clear = Number(P('clear', 0));
    const onStone = (x, z) => placed.some((g) => g.userData.covers?.(x, z, 0.04));
    const area = viewArea(engine, 3);
    // travelling actors: extend the grass area along the path (4 s at the clip speed)
    createGrass(engine, terrain, {
      area: { x0: area.x0 - 6, z0: area.z0 - 6, x1: area.x1 + 6, z1: area.z1 + 6 },
      mask: (x, z) => !onStone(x, z) && !(clear > 0 && slots.some((s) => Math.hypot(x - s.world.x, z - s.world.z) < clear)),
      flowers: { fraction: 0.03 },
    });
  }
  if (P('grade', '1') !== '0') { const { addGrade } = await import('../src/post/grade.js'); addGrade(engine, {}); }
  if (P('fog', '0') === '1') { const { addFog } = await import('../src/post/fog.js'); addFog(engine, { mistAmount: 0.25, fogAmount: 0.25 }); }
  return terrain;
}
