// Demo player (owner: player; docs/DEMO.md §4.1). Walks the chosen character around Hollowmere.
//
//   createPlayer(demo) -> Promise<player>
//   player = { position: Vector3 (logical ground position, y 0), facing (rad, 0 = +z = toward the yaw-0 camera),
//              handle (characters.js handle) | null, nearDoor: { id, pos, normal } | null, moving, running,
//              path ([{x, z}] waypoints left of a click-to-move) | null, collision (collision.js),
//              update(t, dt), setCharacter(id) -> Promise, teleport(x, z, face?, {exact}) -> {x, z},
//              walkTo(x, z, {run, face}) -> bool, goTo(spot, {walk, run}) -> bool, spots() -> {name: {x, z, face}},
//              speeds() -> {walk, run}, emote(clip) -> bool, clickAt(clientX, clientY, run), dispose() }
//   spots: spawn, dais, house-0 .. house-14 + clocktower (in front of the real door, facing it), well, fountain,
//          seat-0 .. seat-14 (the voting-circle stones). The UI's "go to house N" = player.goTo('house-N').
//   events on demo.events: 'player:door' {id, near}, 'player:character' {id, handle}, 'player:teleport' {x, z},
//              'toast' {text} (missing clip / unreachable spot), 'player:location' {location, prev, room}
//
// Houses (interior.js, like the game's v2): walking INTO a cottage's door (pushing toward it at the doorstep; the door
// has swung open on the approach) fades to that house's interior: a room far from the town with its own collision,
// the camera's dollhouse preset (camera.js), spawn just inside the door. Inside you walk / click around; stepping onto
// the exit spot (after leaving it once) or pushing toward the door on it (held 0.18 s) fades back out to the doorstep,
// facing out. Clicking a cottage walks to its door and goes in. The clocktower door opens but is never entered.
//   player.location ('town' | house id; also store.state.location when the store has that key), player.interior
//   (the room record: name, camera, bed, visitPoint, lights, floor, exit ...) | null, player.transition (fade running),
//   player.enter(id, {instant}) -> Promise<bool>, player.leave({instant}) -> Promise<bool>; ?in=house-N starts inside.
//   teleport() / goTo() to a town spot from inside leaves the house at once (no fade).
//
// Controls (bound through demo.input): W A S D / arrows walk in 8 directions relative to the camera (W = screen up),
// Shift runs; click / tap the ground to walk there along an A* path (click a cottage = walk to its door, the dais =
// to its foot; Shift+click runs); [ / ] previous / next complete character; 1-6 emotes (talk, vote, point, die,
// ghost, the signature; critic P1-2: Space is the game UI's, it opens the emote palette). ?collide=1 draws the collision shapes and door normals (red);
// ?at=x,z spawn.
//
// Speed: the game's ONE speed, 4 body heights per second (CHARACTERS.md / locomotion.js gameSpeed, the cast's
// spec.gameSpeed.v): brisk. Shift = run at 1.75x (the Storyteller's fast travel is 2x).
// Collision: collision.js (SDF of the placed cottages minus their door corridors, the tower, the dais, props, the
// blocking ground; gradient sliding, no tunnelling).
// Doors: the REAL door of every cottage (+ the tower): the piece's door anchor point when it has one (house-14's
// recessed mill door: layout.js is 0.9 m off, stats.doorMismatch), driven with the life layer's door curves
// (life/doors.js: latch rattle, outward swing, overshoot; close = slam) while the player stands in front of it.
// Camera: camera.js installs the texel-locked follow on the lead's rig (first update).
// Characters: characters.js handles run on their own local clock (handle.update(t) takes demo time, ch.drive(fn) gets
// demo time); the drive interpolates the positions recorded each frame. A teleport RE-CREATES the character at the
// new spot (a fresh simulation: a jump fed to the running one reads as a one-frame sprint, and re-driving it would
// re-simulate from its creation).
import * as THREE from 'three';
import { cameraAxes, SPAWN } from './api.js';
import { createCharacter } from './characters.js';
import { createCollision } from './collision.js';
import { createInteriors, createFade } from './interior.js';
import { installFollowCamera } from './camera.js';
import { makeDoorDriver, doorF } from '../town/life/doors.js';
import { gameSpeed } from '../chars/locomotion.js';

const RUN_FACTOR = 1.75;
const DOOR_NEAR = 1.6, DOOR_LEAVE = 2.1;     // m from the door's centre (in front of it)
const EMOTE_KEYS = ['talk', 'vote', 'point', 'die', 'ghost', null];   // Digit1..6 (null = the signature)
const EMOTE_LOOP_S = 4;   // (critic P2-4) a looping emote (talk) plays this long, then the idle (or the ghost idle) returns
const HIST = 24;
const AXES = { fwd: new THREE.Vector3(), right: new THREE.Vector3() };   // (perf) cameraAxes' reused output
const NPC_R = 0.3;
// entering: within ENTER_S of the door plane (along its normal; the corridor lets the centre reach ~R), within ENTER_LAT
// of its axis, pushing inward (cos >= ENTER_COS: within ~32 deg, so of the 8 key directions only the one nearest the
// door's inward direction counts, never the 45 deg neighbours; the turned side rows' doors are 12 / 33 deg off a key)
// for ENTER_HOLD s; leaving: on the exit spot, or pushing out within EXIT_PUSH_R of it
const ENTER_S = 0.75, ENTER_LAT = 0.55, ENTER_COS = 0.85, ENTER_HOLD = 0.15, ENTER_COOLDOWN = 0.7;
const EXIT_PUSH_R = 0.55, EXIT_HOLD = 0.18, EXIT_COS = 0.6;

export async function createPlayer(demo) {
  const { engine, store, input, events, layout } = demo;
  const townCollision = createCollision(demo);
  let collision = townCollision;          // the CURRENT walkable area: the town, or the room we are in
  const interiors = createInteriors(demo, { radius: townCollision.R });
  const fade = createFade(demo);
  let location = 'town', room = null, transition = null, pending = null, enterPush = 0, enterDoor = null, cooldownUntil = -1, exitArmed = false, exitPush = 0, lastMv = [0, 0], viaKeys = false;
  const hasStoreLocation = () => 'location' in (store.state ?? {});
  const todName = () => demo.time?.preset?.name ?? demo.time?.preset ?? demo.town?.tod ?? 'noon';
  events.on('tod', (e) => { if (room) room.setTimeOfDay(e?.preset?.name ?? e?.preset ?? todName()); });
  // the feet's ground: the town terrain (ground piece heightAt), or the room's flat floor (the terrain far out at the
  // rooms' origins is not flat: the character floated 5.9 m up at x 200)
  const groundApi = demo.town?.registry?.get?.('ground')?.api;
  const ground = { heightAt: (x, z) => (room ? (room.raw?.heightAt?.(x, z) ?? room.floorY) : typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0) };   // (B) raw.heightAt: the tower room's stairs / landing
  // (B) the clock tower is enterable once pass B registered its interior (tower-interior.js); otherwise a landmark
  const enterable = (id) => id !== 'clocktower' || (!!demo.passB?.interior && !!interiors.has?.('clocktower'));
  const at = demo.params.get('at')?.split(',').map(Number);
  const position = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  if (at && at.length === 2 && at.every(Number.isFinite)) position.set(at[0], 0, at[1]);
  { const f = collision.nearestReachable(position.x, position.z) ?? collision.nearestFree(position.x, position.z); if (f) position.set(f.x, 0, f.z); }
  const hist = [];          // [t, x, z] of recent frames (global demo t): the Character's drive samples them
  // (perf) the oldest triple is recycled instead of allocating one per frame
  const pushHist = (t) => {
    const e = hist.length >= HIST ? hist.shift() : [0, 0, 0];
    e[0] = t; e[1] = position.x; e[2] = position.z;
    hist.push(e);
    while (hist.length > HIST) hist.shift();
  };
  let facing = 0, handle = null, loading = null, nearDoor = null, lastT = 0, moving = false, running = false;
  let path = null;          // { pts: [{x, z}], run, face, stuck }
  let emoting = null;       // clip name of a looping / held emote (released when walking)
  let emoteUntil = null;    // (critic P2-4) when a looping emote (talk) ends by itself (engine.time)
  // the GHOST STATE (a dead player who keeps walking, Clocktower rules; the user's bug "after ghost-emoting, walking
  // turns me back"): the ghost emote (5 / its button) is a TOGGLE. On: the character's idle loop is its 'ghost' clip and
  // ch.ghost = 1 (the character library's walking-ghost override, src/chars/character.js _ghostLevel), so walking, the
  // other emotes and standing all stay ghost-shaded; off: ch.ghost = null + the normal idle. It survives a character
  // swap / a teleport (re-applied to the new character when it can be a ghost: a 'ghost' clip; the Storyteller never
  // ghosts, nor a character without one: the state is cleared with a toast).
  let ghosted = false;

  // ------------------------------------------------------------------------------------------------ character
  const speeds = () => {
    const s = handle?.spec, H = handle?.height ?? s?.height ?? 1.4;
    const walk = s?.gameSpeed?.v ?? s?.game?.speed ?? gameSpeed(H);
    return { walk, run: walk * RUN_FACTOR };
  };
  function attachDrive(h) {
    h.ch.drive((T) => {
      // T = demo time (characters.js adds its clock offset); linear interpolation of the recorded frame positions
      if (!hist.length) return { pos: position.clone(), face: facing };
      let i = hist.length - 1;
      while (i > 0 && hist[i - 1][0] >= T) i--;
      const b = hist[i], a = hist[Math.max(0, i - 1)];
      const u = b[0] > a[0] ? THREE.MathUtils.clamp((T - a[0]) / (b[0] - a[0]), 0, 1) : 1;
      return { pos: new THREE.Vector3(a[1] + (b[1] - a[1]) * u, 0, a[2] + (b[2] - a[2]) * u), face: facing };
    });
  }
  async function setCharacter(id, { silent = false } = {}) {
    const prev = handle;
    const p = (loading = createCharacter(engine, id, { position: position.clone(), face: facing, ground }));
    let h;
    try { h = await p; } catch (e) {
      console.warn(`[demo] character '${id}' failed:`, e);
      events.emit('toast', { text: `character '${id}' failed to load` });
      if (prev && store.state.character !== prev.id) store.set({ character: prev.id }, 'player');
      throw e;
    }
    if (loading !== p) { h.dispose(); return null; }   // a newer request won
    hist.length = 0; hist.push([lastT, position.x, position.z]);
    attachDrive(h);
    engine.scene.add(h.root);
    if (prev) prev.dispose();
    handle = h; emoting = null;
    if (ghosted && !applyGhost(true)) {
      ghosted = false;
      events.emit('player:ghost', { on: false, reason: 'character' });
      if (!silent) events.emit('toast', { text: `${h.name ?? h.id} cannot be a ghost: the ghost state is cleared` });
    }
    if (store.state.character !== id) store.set({ character: id }, 'player');
    if (!silent) events.emit('player:character', { id, handle: h });
    return h;
  }
  /** The character's ghost clip name, or null (no clip; the Storyteller never ghosts). */
  const ghostClip = (h = handle) => {
    if (!h || h.id === 'storyteller') return null;
    const n = h.emotes ? h.emotes.ghost : 'ghost';
    return n && h.spec.clips?.[n] ? n : null;
  };
  /** Put the current character into (on) / out of (off) the ghost state. Returns false when it cannot be a ghost. */
  function applyGhost(on) {
    if (!handle?.ch) return false;
    const clip = on ? ghostClip() : null;
    if (on && !clip) return false;
    handle.ch.ghost = on ? 1 : null;
    play(on ? clip : 'idle');
    return true;
  }
  /** Ghost on / off (the ghost emote's toggle). Returns the new state, or null when this character cannot ghost. */
  function setGhost(on) {
    on = !!on;
    if (on === ghosted) return ghosted;
    if (on && !ghostClip()) return null;
    path = null; emoting = null;
    ghosted = on;
    applyGhost(on);
    events.emit('player:ghost', { on });
    events.emit('player:emote', { clip: 'ghost', name: on ? ghostClip() : null, off: !on });
    return ghosted;
  }
  store.on('character', ({ value, source }) => { if (source !== 'player' && value !== handle?.id) setCharacter(value).catch(() => {}); });
  const complete = () => (demo.characters ?? []).filter((c) => c.complete).map((c) => c.id);
  const cycle = (dir) => {
    const ids = complete();
    if (!ids.length) return;
    const i = ids.indexOf(handle?.id ?? store.state.character);
    store.set({ character: ids[(i + dir + ids.length) % ids.length] }, 'key');
  };
  const play = (name) => (handle?.play ? handle.play(name) : handle?.ch.play(name));
  function emote(clip) {
    if (!handle) return false;
    if (clip === 'ghost') {
      if (ghosted) { setGhost(false); return true; }
      if (handle.id === 'storyteller') { events.emit('toast', { text: 'The Storyteller never becomes a ghost' }); return false; }
      if (ghostClip()) { setGhost(true); return true; }
    }
    // game emotes: characters.js maps them to the spec's clips (handle.emotes; combat clips are never offered)
    const name = handle.emotes ? handle.emotes[clip ?? 'signature'] ?? null : clip ?? handle.spec.emote ?? null;
    if (!name || !handle.spec.clips?.[name]) {
      // the game UI draws a fallback for some emotes (P2.8: the point pop glyph over a character without a point clip)
      if (demo.gameui?.emoteFallback?.(clip)) { events.emit('player:emote', { clip, name: null, fallback: true }); return true; }
      events.emit('toast', { text: `${handle.name ?? handle.id} has no ${clip ? `'${clip}'` : 'signature'} emote` });
      return false;
    }
    path = null;
    const c = handle.spec.clips[name];
    // (critic P2-4) a one-shot played over a looping emote (talk) returns to the IDLE (or the ghost idle when
    // ghosted), not to the loop: release the loop first
    if (emoting && !(c.loop || c.hold)) { play(ghosted ? ghostClip() ?? 'idle' : 'idle'); emoting = null; }
    play(name);
    events.emit('player:emote', { clip: clip ?? 'signature', name });
    emoting = c.loop || c.hold || name === 'vote' || name === 'die' ? name : null;
    // a LOOPING emote (talk) is time-boxed: EMOTE_LOOP_S, then back to the idle (it never ended while standing still)
    emoteUntil = c.loop && !c.hold && name !== 'vote' && name !== 'die' ? (lastT ?? engine.time ?? 0) + EMOTE_LOOP_S : null;
    return true;
  }

  // ------------------------------------------------------------------------------------------------ doors
  const doors = townCollision.doors.map((d) => ({ ...d, drv: null, evs: [], near: false }));
  let flip = 0;
  function doorDriver(d) {
    if (d.drv === null) {
      try { d.drv = d.anchor?.open ? makeDoorDriver(d.anchor, demo.town.registry.get(d.id)?.group) : false; } catch (e) { console.warn('[demo] door', d.id, e); d.drv = false; }
    }
    return d.drv;
  }
  function updateDoors(t) {
    let best = null, bd = Infinity;
    for (const d of doors) {
      const dx = position.x - d.pos.x, dz = position.z - d.pos.z, dist = Math.hypot(dx, dz), s = dx * d.normal[0] + dz * d.normal[1];
      const near = d.near ? dist < DOOR_LEAVE && s > -0.4 : dist < DOOR_NEAR && s > -0.2;
      if (near !== d.near) {
        d.near = near;
        if (doorDriver(d)) {
          const last = d.evs[d.evs.length - 1];
          if (!last || last.kind !== (near ? 'open' : 'close')) d.evs.push({ t, kind: near ? 'open' : 'close' });
          if (d.evs.length > 8) d.evs.splice(0, d.evs.length - 8);
        }
        events.emit('player:door', { id: d.id, near });
      }
      if (near && dist < bd) { bd = dist; best = d; }
      // drive the leaf while the player is there or its last swing is still settling (life's walkers own it after);
      // the +-1e-6 defeats the driver's same-value cache, so a walker's visit cannot leave it half shut under us
      const last = d.evs[d.evs.length - 1];
      if (d.drv && last && (d.near || t - last.t < 2)) d.drv.set(doorF(d.evs, t) + (flip ? 1e-6 : 0));
    }
    flip ^= 1;
    if ((best?.id ?? null) !== (nearDoor?.id ?? null)) {
      nearDoor = best ? { id: best.id, pos: best.pos, normal: best.normal, anchor: best.anchor, mismatch: best.mismatch } : null;
      if (best && enterable(best.id)) interiors.prefetch(best.id);    // build the room while the door swings ((B) the tower too)
    }
  }

  // ------------------------------------------------------------------------------------------------ spots / teleport
  const doorFront = (d, k = 0.75) => ({ x: d.pos.x + d.normal[0] * k, z: d.pos.z + d.normal[1] * k, face: Math.atan2(-d.normal[0], -d.normal[1]) });
  function spots() {
    const out = { spawn: { x: SPAWN.x, z: SPAWN.z, face: 0 } };
    out.dais = { x: layout.CIRCLE.cx, z: layout.CIRCLE.cz + 2.9, face: Math.PI };   // the stage's south foot
    for (const d of doors) out[d.id] = doorFront(d);
    for (const o of layout.objects) if (o.kind === 'well' || o.kind === 'fountain') {
      const p = townCollision.nearestFree(o.center.x, o.center.z + 1.6);
      if (p) out[o.kind] = { ...p, face: Math.PI };
    }
    for (let i = 0; i < 15; i++) { const s = layout.seatPos(i); out[`seat-${i}`] = { x: s.x, z: s.z, face: Math.atan2(layout.CIRCLE.cx - s.x, layout.CIRCLE.cz - s.z) }; }
    return out;
  }
  function teleport(x, z, face, { exact = false, location: loc, internal = false } = {}) {
    // a teleport asked for while the screen fades (enter / leave) runs when the fade is over (the last request wins)
    if (transition && !internal) { pending = { kind: 'teleport', args: [x, z, face, { exact, location: loc }] }; return { x, z }; }
    // from inside a house, a point outside the room means the town: leave at once (no fade)
    if (loc === undefined && location !== 'town' && room) {
      const f = room.floor;
      if (!(x > f.x0 - 2 && x < f.x1 + 2 && z > f.z0 - 2 && z < f.z1 + 2)) loc = 'town';
    }
    if (loc === 'town' && location !== 'town') setLocation('town', null);
    let p = { x, z };
    if (!exact) {
      // never into a pocket cut off from the streets (behind the north row: the player could only shuffle ~1 m):
      // the nearest free point of the main walkable region
      p = collision.nearestReachable?.(x, z) ?? collision.nearestFree(x, z) ?? p;
      if (Math.hypot(p.x - x, p.z - z) > 1.5) events.emit('toast', { text: 'no way there: moved to the nearest open ground' });
    }
    position.set(p.x, 0, p.z);
    if (face !== undefined && face !== null) facing = face;
    path = null; emoting = null;
    hist.length = 0; hist.push([lastT, position.x, position.z]);
    // a fresh character at the new spot (the running one would read the jump as a sprint); it keeps drawing at the
    // new spot until the new one is ready (specs are cached: a few ms)
    if (handle) setCharacter(handle.id, { silent: true }).catch(() => {});
    demo.camera?.snapTo?.(position);
    events.emit('player:teleport', { x: position.x, z: position.z });
    return { x: position.x, z: position.z };
  }
  function walkTo(x, z, { run = false, face = null, enter: enterId = null } = {}) {
    if (transition) return false;
    const pts = collision.findPath(position, { x, z });
    if (!pts) { events.emit('toast', { text: 'no way there' }); path = null; return false; }
    path = { pts, run, face, stuck: 0, enter: enterId };
    return true;
  }
  function goTo(name, { walk = false, run = false } = {}) {
    const s = spots()[name];
    if (!s) return false;
    if (walk && location !== 'town') return false;     // town spots are walked to from the town
    if (walk) return walkTo(s.x, s.z, { run, face: s.face });
    teleport(s.x, s.z, s.face, { location: 'town' });
    return true;
  }

  // ------------------------------------------------------------------------------------------------ houses (interior.js)
  const outwardFace = (d) => Math.atan2(d.normal[0], d.normal[1]);
  function setLocation(loc, r) {
    const prev = location;
    if (room && room !== r) room.show(false);
    location = loc; room = r ?? null;
    if (room) { room.show(true); room.setTimeOfDay(todName()); }
    collision = room ? room.collision : townCollision;
    cooldownUntil = lastT + ENTER_COOLDOWN; exitArmed = false; exitPush = 0; enterPush = 0; enterDoor = null; path = null;
    if (hasStoreLocation() && store.state.location !== loc) store.set({ location: loc }, 'player');
    if (prev !== loc) events.emit('player:location', { location: loc, prev, room: room ? { id: room.id, name: room.name } : null });
  }
  function placeInside(r) {
    setLocation(r.id, r);
    teleport(r.spawn.x, r.spawn.z, r.spawn.facing, { exact: true, location: r.id, internal: true });
  }
  function placeOutside(id) {
    const d = doors.find((q) => q.id === id);
    setLocation('town', null);
    const f = d ? doorFront(d, 0.8) : { x: SPAWN.x, z: SPAWN.z };
    teleport(f.x, f.z, d ? outwardFace(d) : 0, { location: 'town', internal: true });
  }
  /** Go into house `id` (fade, or `instant`). Resolves true once inside (false: refused). */
  async function enter(id, { instant = false } = {}) {
    if (!enterable(id)) return false;   // (B) was: the clocktower is never entered
    if (transition) { if (doors.some((q) => q.id === id)) pending = { kind: 'location', value: id }; return false; }
    if (location === id) return false;
    const d = doors.find((q) => q.id === id);
    if (!d) return false;
    if (location !== 'town') placeOutside(location);
    const rp = interiors.get(id);
    path = null;
    if (instant) { placeInside(await rp); return true; }
    const name = layout.houses.find((h) => h.id === id)?.name ?? (id === 'clocktower' ? 'The Clocktower' : id);   // (B)
    return new Promise((resolve) => {
      transition = { kind: 'enter', id, d, t0: lastT };
      fade.run(lastT, { label: name, onBlack: async () => { try { placeInside(await rp); resolve(true); } catch (e) { console.error('[demo] enter', id, e); endTransition(); resolve(false); } } });
    });
  }
  /** Leave the house we are in, back to its doorstep facing out (fade, or `instant`). */
  async function leave({ instant = false } = {}) {
    if (transition) { pending = { kind: 'location', value: 'town' }; return false; }
    if (location === 'town') return false;
    const id = location;
    if (instant) { placeOutside(id); return true; }
    return new Promise((resolve) => {
      transition = { kind: 'leave', id, t0: lastT };
      fade.run(lastT, { label: '', inn: 0.4, onBlack: () => { placeOutside(id); resolve(true); } });
    });
  }
  /** Town: pushing into a door at its doorstep goes in. */
  function checkEnter(t, dt) {
    let hit = null;
    if (viaKeys && moving && t >= cooldownUntil) for (const d of doors) {
      if (!d.near || !enterable(d.id)) continue;   // (B)
      const dx = position.x - d.pos.x, dz = position.z - d.pos.z;
      const s = dx * d.normal[0] + dz * d.normal[1], lat = Math.abs(dx * d.normal[1] - dz * d.normal[0]);
      const inward = -(lastMv[0] * d.normal[0] + lastMv[1] * d.normal[1]);
      if (s > -0.3 && s < ENTER_S && lat < ENTER_LAT && inward >= ENTER_COS) { hit = d; break; }
    }
    // a deliberate push: held ENTER_HOLD s at the same door (reset by any frame that does not count, like EXIT_HOLD)
    if (!hit) { enterPush = 0; enterDoor = null; return; }
    enterPush = enterDoor === hit.id ? enterPush + dt : dt;
    enterDoor = hit.id;
    if (enterPush >= ENTER_HOLD) { enterPush = 0; enterDoor = null; enter(hit.id); }
  }
  /** The fade is over: clear it, then run the request that came in during it (the last one wins). */
  function endTransition() {
    transition = null;
    const q = pending;
    pending = null;
    if (!q) return;
    if (q.kind === 'teleport') teleport(...q.args);
    else if (q.value !== location) { if (q.value === 'town') leave(); else enter(q.value); }
    else if (hasStoreLocation() && store.state.location !== location) store.set({ location }, 'player');
  }
  /** Inside: the exit spot (once left) or a held push out on it leaves. */
  function checkExit(t, dt) {
    if (!room) return;
    const e = room.exit, dist = Math.hypot(position.x - e.x, position.z - e.z);
    if (dist > e.r + 0.1) exitArmed = true;
    const out = viaKeys && moving && lastMv[0] * room.out[0] + lastMv[1] * room.out[1] >= EXIT_COS && dist < e.r + EXIT_PUSH_R;
    exitPush = out ? exitPush + dt : 0;
    if (t >= cooldownUntil && ((exitArmed && dist < e.r) || exitPush >= EXIT_HOLD)) leave();
  }

  // ------------------------------------------------------------------------------------------------ click / tap to move
  const el = engine.renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** Screen point -> pick ray: the canvas shows the padded low-res target shifted by MARGIN + the sub-texel offset
   *  (PixelPipeline upscale: p = fragCoord / scale + margin + offset). */
  function pick(clientX, clientY) {
    const r = el.getBoundingClientRect(), cam = engine.camera, M = 2;
    const sx = (clientX - r.left) * (engine.width / r.width), sy = (clientY - r.top) * (engine.height / r.height);
    const W = cam.lowW + 2 * M, H = cam.lowH + 2 * M;
    const px = sx / engine.pixelScale + M + cam.offset.x, py = (engine.height - sy) / engine.pixelScale + M + cam.offset.y;
    ndc.set((px / W) * 2 - 1, (py / H) * 2 - 1);
    cam.cam.updateMatrixWorld();
    ray.setFromCamera(ndc, cam.cam);
    // cottages / tower / dais first (click a cottage = go to its door)
    const groups = [], ids = [];
    for (const id of [...layout.houses.map((h) => h.id), 'clocktower', 'dais']) {
      const g = demo.town.registry.get(id)?.group;
      if (g && g.visible) { groups.push(g); ids.push(id); }
    }
    let hit = null;
    try { hit = ray.intersectObjects(groups, true).find((h) => h.object.visible !== false && h.object.isMesh) ?? null; } catch { hit = null; }
    let piece = null;
    if (hit) for (let o = hit.object; o && !piece; o = o.parent) { const k = groups.indexOf(o); if (k >= 0) piece = ids[k]; }
    // the ground plane
    const o = ray.ray.origin, dv = ray.ray.direction;
    const tg = Math.abs(dv.y) > 1e-6 ? -o.y / dv.y : null;
    const ground = tg !== null ? { x: o.x + dv.x * tg, z: o.z + dv.z * tg } : null;
    return { piece, ground };
  }
  let down = null;
  el.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', (e) => {
    if (!down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dur = performance.now() - down.t;
    down = null;
    if (moved > 6 || dur > 600) return;    // a drag (free-camera pan), not a click
    clickTo(e.clientX, e.clientY, e.shiftKey);
  });
  function clickTo(clientX, clientY, run = false) {
    if (transition) return false;
    const { piece, ground } = pick(clientX, clientY);
    if (location !== 'town') return ground ? walkTo(ground.x, ground.z, { run }) : false;
    if (piece && piece !== 'dais') {
      const d = doors.find((q) => q.id === piece);
      if (d) { const f = doorFront(d); return walkTo(f.x, f.z, { run, face: f.face, enter: enterable(d.id) ? d.id : null }); }   // (B)
    }
    // (critic P3-12) a tap IN an open doorway or on its doorstep (the ray passes the door opening and meets the ground
    // at the threshold: no piece) counts as a tap on that door: walk to it and in, in one tap (the tower took two)
    if (!piece && ground) {
      let best = null, bd = 1.4;
      for (const q of doors) {
        // in the opening: at / behind the threshold (along the door's outward normal), within its width
        const dx = ground.x - q.pos.x, dz = ground.z - q.pos.z, s = dx * q.normal[0] + dz * q.normal[1], lat = Math.abs(dx * q.normal[1] - dz * q.normal[0]);
        const dd = Math.hypot(dx, dz);
        if (s < 1.0 && s > -1.5 && lat < 0.9 && dd < bd && enterable(q.id)) { bd = dd; best = q; }   // (the doorstep counts)
      }
      if (best) { const f = doorFront(best); return walkTo(f.x, f.z, { run, face: f.face, enter: best.id }); }
    }
    if (piece === 'dais' && ground) {
      const c = layout.CIRCLE, a = Math.atan2(ground.x - c.cx, ground.z - c.cz);
      return walkTo(c.cx + Math.sin(a) * 2.9, c.cz + Math.cos(a) * 2.9, { run, face: a + Math.PI });
    }
    if (ground) return walkTo(ground.x, ground.z, { run });
    return false;
  }

  // ------------------------------------------------------------------------------------------------ keys
  const unbind = [
    input.bind('BracketLeft', () => cycle(-1), { desc: 'previous character', group: 'player' }),
    input.bind('BracketRight', () => cycle(1), { desc: 'next character', group: 'player' }),
    ...EMOTE_KEYS.map((c, i) => input.bind(`Digit${i + 1}`, () => emote(c), { desc: `emote: ${c ?? 'signature'}`, group: 'player' })),
    // (critic P1-2) Space no longer plays the signature (most characters' first press was "<name> has no signature
    // emote"): gameui.js binds it to the emote palette; the signature is 6 and the palette's star
  ];

  // ------------------------------------------------------------------------------------------------ overlay
  let overlay = null;
  if (demo.params.get('collide') === '1') { overlay = collision.overlay(); engine.scene.add(overlay); }

  // ------------------------------------------------------------------------------------------------ per frame
  const mv = new THREE.Vector3();
  /** The idle NPCs on the square (characters.js createNPCs) are solid too: circles, pushed out, then the town again. */
  function pushNPCs() {
    const list = demo.npcs?.list;
    if (!list?.length) return;
    for (const n of list) {
      const dx = position.x - n.pos[0], dz = position.z - n.pos[1], d = Math.hypot(dx, dz), r = NPC_R + collision.R;
      if (d < r && d > 1e-6) { position.x = n.pos[0] + (dx / d) * r; position.z = n.pos[1] + (dz / d) * r; collision.resolve(position); }
    }
  }
  const player = {
    position,
    /** The CURRENT walkable area (the town's collision, or the room's inside a house); townCollision always the town. */
    get collision() { return collision; },
    townCollision, interiors, fade,
    get location() { return location; },
    /** The room we are in (interior.js record: id, name, camera, floor, exit, spawn, bed, visitPoint, lights) | null. */
    get interior() { return room; },
    get transition() { return transition ? { kind: transition.kind, id: transition.id } : null; },
    /** The request queued during the running fade (runs when it ends) | null. */
    get pending() { return pending ? { ...pending } : null; },
    enter, leave,
    get facing() { return facing; },
    get handle() { return handle; },
    get nearDoor() { return nearDoor; },
    get moving() { return moving; },
    get running() { return running; },
    get path() { return path?.pts ?? null; },
    setCharacter, teleport, walkTo, goTo, spots, speeds, emote,
    /** The ghost state (the ghost emote's toggle): get / set (setGhost(on) -> new state | null = cannot ghost). */
    get ghost() { return ghosted; },
    setGhost,
    /** The ghost level the character's material shows now (rig.ghostLevel 0 | 1 | 2; 0 for a spec without spec.ghost,
     *  whose ghost clip carries its own look): tests. */
    get ghostLevel() { return handle?.ch?.rig?.ghostLevel ?? 0; },
    /** Test hook: click / tap at a screen point (the same code path as a real click). */
    clickAt: (x, y, run) => clickTo(x, y, run),
    /** What a screen point shows: { piece (house / tower / dais id under it) | null, ground: {x, z} on the y 0 plane | null }
     *  (the click-to-move pick; the game UI's point / pin targets, src/demo/gameui.js). */
    pickAt: (x, y) => pick(x, y),
    /** Turn toward a world point (the point emote faces its target); ignored while walking. Returns the new facing. */
    faceTo(x, z) {
      if (moving || transition) return facing;
      const dx = x - position.x, dz = z - position.z;
      if (Math.hypot(dx, dz) > 0.05) { facing = Math.atan2(dx, dz); path = null; }
      return facing;
    },
    update(t, dt) {
      lastT = t;
      if (demo.camera && !demo.camera.__follow) installFollowCamera(demo, demo.camera);
      dt = Math.min(dt, 0.1);
      fade.update(t);
      if (transition && !fade.active) endTransition();
      if (transition) {
        // the screen is fading: no input; entering, the character steps on into the doorway
        moving = false; running = false; path = null;
        const d = transition.d;
        if (transition.kind === 'enter' && location === 'town' && d) {
          const s = (position.x - d.pos.x) * d.normal[0] + (position.z - d.pos.z) * d.normal[1];
          if (s > 0.1) {
            const step = Math.min(s - 0.1, speeds().walk * 0.8 * dt);
            position.x -= d.normal[0] * step; position.z -= d.normal[1] * step;
            facing = Math.atan2(-d.normal[0], -d.normal[1]); moving = true;
          }
        }
        position.y = 0;
        pushHist(t);
        updateDoors(t);
        room?.update(t, dt);
        if (handle) handle.update(t);
        return;
      }
      const { fwd, right } = cameraAxes(engine.camera.targetYaw ?? engine.camera.yaw, AXES);
      mv.set(0, 0, 0);
      if (input.any('KeyW', 'ArrowUp')) mv.add(fwd);
      if (input.any('KeyS', 'ArrowDown')) mv.sub(fwd);
      if (input.any('KeyD', 'ArrowRight')) mv.add(right);
      if (input.any('KeyA', 'ArrowLeft')) mv.sub(right);
      const shift = input.any('ShiftLeft', 'ShiftRight');
      const sp = speeds();
      let want = 0;
      viaKeys = mv.lengthSq() > 1e-6;
      if (viaKeys) { path = null; mv.normalize(); running = shift; want = shift ? sp.run : sp.walk; }
      else if (path) {
        // follow the click path
        let target = path.pts[0];
        let dx = target.x - position.x, dz = target.z - position.z, d = Math.hypot(dx, dz);
        while (d < 0.04 && path.pts.length > 1) { path.pts.shift(); target = path.pts[0]; dx = target.x - position.x; dz = target.z - position.z; d = Math.hypot(dx, dz); }
        running = path.run || shift;
        want = running ? sp.run : sp.walk;
        if (d < 0.04) {
          if (path.face !== null) facing = path.face;
          const en = path.enter;
          path = null; want = 0;
          if (en && location === 'town') enter(en);
        }
        else { mv.set(dx / d, 0, dz / d); want = Math.min(want, d / Math.max(dt, 1e-3)); }
      }
      moving = want > 0;
      if (emoting && emoteUntil !== null && t >= emoteUntil && !moving) { play(ghosted ? ghostClip() ?? 'idle' : 'idle'); emoting = null; emoteUntil = null; }
      if (moving) {
        // (a ghost's held / looping emote returns to the ghost loop; ch.ghost = 1 keeps the walk ghost-shaded)
        if (emoting) { play(ghosted ? ghostClip() ?? 'idle' : 'idle'); emoting = null; }
        const step = want * dt;
        const got = collision.move(position, mv.x * step, mv.z * step);
        if (location === 'town') pushNPCs();
        facing = Math.atan2(mv.x, mv.z);
        if (path) { path.stuck = got < step * 0.2 ? path.stuck + dt : 0; if (path.stuck > 0.4) path = null; }
      } else running = false;
      lastMv[0] = mv.x; lastMv[1] = mv.z;
      position.y = 0;
      pushHist(t);
      updateDoors(t);
      if (location === 'town') checkEnter(t, dt); else checkExit(t, dt);
      room?.update(t, dt);
      if (handle) handle.update(t);
    },
    dispose() {
      for (const u of unbind) u();
      overlay?.removeFromParent();
      handle?.dispose(); handle = null;
      fade.dispose(); interiors.dispose();
    },
  };
  await setCharacter(store.state.character).catch(async () => {
    if (store.state.character !== 'wanderer') { store.set({ character: 'wanderer' }, 'player'); await setCharacter('wanderer'); }
  });
  // the shared state's `location` (when the lead's store has the key): other writers (ui, tests) move the player
  store.on?.('location', ({ value, source }) => {
    if (source === 'player') return;
    const v = value || 'town';
    // during a fade: remember it (enter / leave queue it), it runs when the fade is over; the last request wins
    if (transition) { if (v === 'town') leave(); else enter(v); return; }
    if (v === location) return;
    if (v === 'town') leave(); else enter(v);
  });
  // ?in=house-N: start inside
  const startIn = demo.params.get('in') ?? (hasStoreLocation() && store.state.location !== 'town' ? store.state.location : null);
  if (startIn && doors.some((d) => d.id === startIn && d.id !== 'clocktower')) {
    try { await enter(startIn, { instant: true }); } catch (e) { console.warn('[demo] ?in=', startIn, e); }
  }
  return player;
}
