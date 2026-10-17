// Demo follow camera (owner: player; docs/DEMO.md §4.1 / §4.6). The lead's rig (api.js createCameraRig) owns the
// modes, the keys (Q / E 45 deg turns, wheel / - / = zoom ladder, C cycles follow -> vote -> overview -> iso -> free)
// and free-pan dragging. This module replaces only its FOLLOW update with a texel-locked follow:
//
//   the camera target = the player's position + a smoothed lag that is QUANTISED to whole low-res texels in the
//   camera's snap space (right / up axes, PixelCamera.js). The PixelCamera rounds target·right and target·up to the
//   texel grid and the Character's root rounds its own world position the same way (snapObjectToTexel), so with an
//   integer-texel lag both round identically: the character never jitters +-1 texel against the screen while the
//   world glides by on the camera's sub-texel offset (the upscale shift). The lag itself changes in whole texels only
//   (a whole-texel step of the frame = no crawl), and it settles to exactly 0 when the player stands still.
//
// Lag: critically damped toward the player (time constant ~0.12 s; tight, the game camera barely trails), clamped to
// MAX_LAG; a jump beyond 4 m (teleports, character swaps, mode changes) snaps.
//
// Inside a house (demo.player.interior, interior.js) every mode gives way to the room's dollhouse preset: the room's
// camera {target, viewHeight, yaw, pitch?}, set at once behind the fade (no turn animation) at the room's yaw + the
// player's camera turn (Q / E still turn 45 deg inside, about the room's pivot; the kit cuts the wall facing the
// camera), zoom ignored; the target stays put (texel-stable) and only slides when the player walks beyond ~70 % of the view (rooms larger than the
// frame). Leaving restores the mode's yaw / pitch and the follow snaps onto the player. The lead's live cut-away is
// switched off while inside (its player box would cut the room's furniture; its circle / door boxes are town-only).
//
// Exports: installFollowCamera(demo, rig = demo.camera) -> rig (patched in place: rig.update follows the player in
//   'follow' mode and delegates every other mode to the lead's update; rig.follow = {lag: [a, b] texels, locked}).
//   createCameraRig(demo) -> the lead's rig with the follow installed (for main.js: CONTRACT-REQUEST lead).
import * as THREE from 'three';
import { createCameraRig as leadRig } from './api.js';
import { CAMERAS } from '../town/api.js';

const DEG = Math.PI / 180;
const PITCH = Math.PI / 6;

const K = 16;             // follow stiffness (1/s): exp decay of the lag (measured: ~10 texels = 0.65 m behind at walking speed)
const MAX_LAG = 1.6;      // m (running)
const SNAP_DIST = 4;      // m: beyond this the camera cuts to the player

export function installFollowCamera(demo, rig = demo.camera) {
  if (!rig || rig.__follow) return rig;
  const cam = demo.engine.camera, store = demo.store;
  const base = rig.update.bind(rig);
  const lag = new THREE.Vector3();        // smoothed (camera target - player) on the ground plane
  const info = { lag: [0, 0], locked: true, mode: 'follow' };
  let last = null;                        // last player position seen (jump detection)
  let wasFollow = false;

  function follow(t, dt) {
    const p = demo.player?.position;
    if (!p) return base(t, dt);
    cam.viewHeight = store.state.zoom;
    if (!wasFollow || !last || Math.hypot(p.x - last.x, p.z - last.z) > SNAP_DIST) {
      // entering follow / a teleport: start from where the camera looks now (clamped), or cut on a big jump
      lag.set(cam.target.x - p.x, 0, cam.target.z - p.z);
      if (!wasFollow ? lag.length() > SNAP_DIST : true) lag.set(0, 0, 0);
    } else {
      // the player moved by (p - last): the lag grows by -(p - last), then decays toward 0
      lag.x -= p.x - last.x; lag.z -= p.z - last.z;
      const k = Math.exp(-dt * K);
      lag.multiplyScalar(k);
      const L = lag.length();
      if (L > MAX_LAG) lag.multiplyScalar(MAX_LAG / L);
    }
    last = { x: p.x, z: p.z };
    // quantise the lag to whole texels of the snap space. Ground vector g = a·R + b'·F (R = camera right, F = the
    // forward direction on the ground): g·R = a, g·U = b'·sin(pitch) (U = camera up) -> a, b'·sin(pitch) in texels.
    const yaw = cam.yaw, sp = Math.sin(cam.pitch), tw = cam.viewHeight / cam.lowH;
    const Rx = Math.cos(yaw), Rz = -Math.sin(yaw), Fx = -Math.sin(yaw), Fz = -Math.cos(yaw);
    let a = Math.round((lag.x * Rx + lag.z * Rz) / tw);
    let b = Math.round(((lag.x * Fx + lag.z * Fz) * sp) / tw);
    if (cam.rotating) { a = 0; b = 0; }   // turning: the grid itself rotates, keep the player centred
    const gx = a * tw * Rx + (b * tw / sp) * Fx, gz = a * tw * Rz + (b * tw / sp) * Fz;
    cam.target.set(p.x + gx, 0, p.z + gz);
    info.lag[0] = a; info.lag[1] = b; info.locked = a === 0 && b === 0;
  }

  // ---- inside a house
  let inside = null;
  const modeYaw = () => {
    const m = store.state.camera;
    return m === 'iso' ? CAMERAS.iso.yaw : (m === 'vote' || m === 'overview') ? 0 : store.state.yaw * DEG;
  };
  function guardCut() {
    const cut = demo.cut;
    if (!cut || cut.__interiorGuard || typeof cut.update !== 'function') return;
    const u = cut.update.bind(cut);
    cut.update = (t, dt) => {            // (perf) fixed arity: no rest-array per frame
      if (demo.player?.interior) {
        if (demo.town?.cutaway) demo.town.cutaway.enabled = false;
        const ci = cut.info;
        if (ci) { ci.on = false; ci.circle = false; ci.house = null; ci.boxes = 0; }
        return undefined;
      }
      return u(t, dt);
    };
    cut.__interiorGuard = true;
  }
  const BA = { Rx: 0, Rz: 0, Fx: 0, Fz: 0 }, BB = { Rx: 0, Rz: 0, Fx: 0, Fz: 0 };   // (perf) reused bases
  const basis = (y, o) => { o.Rx = Math.cos(y); o.Rz = -Math.sin(y); o.Fx = -Math.sin(y); o.Fz = -Math.cos(y); return o; };
  function room(r) {
    const C = r.camera;
    // the room's yaw + the player's camera turn (Q / E work inside: the kit drops the wall facing the camera)
    const want = C.yaw + store.state.yaw * DEG;
    if (inside !== r.id) {
      inside = r.id; wasFollow = false;
      cam.set({ yaw: want, pitch: C.pitch ?? PITCH });
    } else if (!cam.rotating && Math.abs(Math.sin((cam.yaw - want) / 2)) > 1e-4) cam.rotateTo(want, 0.3, { steps: 3, exact: true });
    cam.viewHeight = C.viewHeight;
    // the preset target (authored for C.yaw) turned about the room's pivot with the camera
    const yaw = cam.yaw, B0 = basis(C.yaw, BA), B = basis(yaw, BB), pv = r.pivot;
    const ox = C.target.x - pv.x, oz = C.target.z - pv.z;
    const oa = ox * B0.Rx + oz * B0.Rz, ob = ox * B0.Fx + oz * B0.Fz;
    const tx = pv.x + oa * B.Rx + ob * B.Fx, tz = pv.z + oa * B.Rz + ob * B.Fz;
    // it stays put (texel-stable) and only slides when the player nears the frame edge (rooms bigger than the view)
    const p = demo.player.position, sp = Math.sin(cam.pitch);
    const halfH = C.viewHeight / 2, halfW = halfH * (cam.lowW / cam.lowH);
    const px = p.x - tx, pz = p.z - tz;
    const a = px * B.Rx + pz * B.Rz, b = px * B.Fx + pz * B.Fz;
    // limits: the feet stay 0.6 m above the bottom edge, the head (~1.6 m up = 1.6 cos(pitch) / sin(pitch) m of
    // ground) below the top edge, 0.8 m from the sides
    const halfG = halfH / sp, la = Math.max(0, halfW - 0.8);
    const bS = Math.max(0, halfG - 0.6), bN = Math.max(0, halfG - 0.6 - (1.6 * Math.cos(cam.pitch)) / sp);
    const da = a - Math.max(-la, Math.min(la, a)), db = b - Math.max(-bS, Math.min(bN, b));
    cam.target.set(tx + da * B.Rx + db * B.Fx, C.target.y ?? 0, tz + da * B.Rz + db * B.Fz);
    info.mode = 'interior'; info.lag[0] = 0; info.lag[1] = 0; info.locked = true;
  }

  rig.update = (t, dt) => {
    guardCut();
    const r = demo.player?.interior;
    if (r) { room(r); return; }
    if (inside) {
      inside = null; wasFollow = false;
      cam.set({ yaw: modeYaw(), pitch: PITCH });
      cam.target.y = 0;
    }
    const m = store.state.camera;
    info.mode = m;
    if (m === 'follow') { follow(t, dt); wasFollow = true; return; }
    wasFollow = false;
    base(t, dt);
  };
  const snapTo = rig.snapTo?.bind(rig);
  rig.snapTo = (p) => { snapTo?.(p); lag.set(0, 0, 0); last = { x: p.x, z: p.z }; if (store.state.camera === 'follow') cam.target.set(p.x, 0, p.z); };
  rig.follow = info;
  rig.__follow = true;
  return rig;
}

/** The lead's rig + this follow (drop-in for main.js's createCameraRig). */
export function createCameraRig(demo) { return installFollowCamera(demo, leadRig(demo)); }
