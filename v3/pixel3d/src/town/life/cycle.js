// life day cycle (owner: life agent): "the town lights up in order". A helper that switches every light source of
// the town on or off one by one - cottage windows (house api.setLit), the street lamps (their emissive glass and
// their PointLight), the clocktower - as a pure function of t, for a phase of the day:
//   'day'   everything dark        'night' everything lit
//   'dusk'  dark -> lit in order (the tower first, then the cottages in a fixed hashed order, lamps when the
//           lamplighter reaches them or on their own slot)            'dawn'  lit -> dark, the reverse order
// The page's time of day (scenes/town.js ?tod=) still sets the sky / ramps; use 'dusk' on a golden page and 'dawn' on
// a morning page (lights there exist only where the composer installed PointLights: golden / night).
//
// Switching on is a stepped flicker (a wick catching): off / on / off / on over 4 frames at 8 fps, then steady.
// PointLights: the composer's 'town-lights' group is found at the first update (it is created after the pieces) and
// each light's `intensity` gets a gain (a property wrapper, so the composer's own flicker keeps working on top).
// Lamp glass: the props piece has no per-lamp API, so the glass-layer vertices near each lamp (aGlow.w) are switched.
import * as THREE from 'three';
import { hash } from './util.js';

const FLICK = [1, 0, 1, 0, 1];          // frames at 8 fps after the switch time: lit, out, lit, out, steady lit
export function litAt(tOn, t) {
  if (tOn === null || tOn === undefined || t < tOn) return 0;
  const k = Math.floor((t - tOn) * 8);
  return k < FLICK.length ? FLICK[k] : 1;
}

export function createCycle(engine, registry, { mode = 'night', t0 = 0, spacing = 0.9, lampEvents = [], order = null } = {}) {
  const houses = registry.all().filter((p) => p.id.startsWith('house-') || p.id === 'clocktower');
  // order: the clocktower first, then cottages in a fixed hashed order (or the caller's)
  const ids = order ?? ['clocktower', ...houses.filter((p) => p.id !== 'clocktower').map((p) => p.id).sort((a, b) => hash(a.length * 31 + a.charCodeAt(a.length - 1), 5) - hash(b.length * 31 + b.charCodeAt(b.length - 1), 5))];
  // lamps: props light anchors of kind 'lamp'
  const lamps = registry.anchors('lights').filter((l) => l.piece === 'props' && l.kind === 'lamp');
  const lampEv = new Map();
  for (const e of lampEvents) {
    let best = null, bd = 1e9;
    for (const l of lamps) { const d = l.pos.distanceTo(e.light.pos); if (d < bd) { bd = d; best = l; } }
    if (best && bd < 0.5) lampEv.set(best, e.t);
  }
  // switch times
  const n = ids.length;
  const onTime = new Map();
  ids.forEach((id, k) => {
    const slot = t0 + (k + hash(k, 77) * 0.6) * spacing;
    onTime.set(id, mode === 'dusk' ? slot : mode === 'dawn' ? t0 + (n - k + hash(k, 78) * 0.6) * spacing : null);
  });
  lamps.forEach((l, k) => {
    const own = lampEv.get(l);
    const slot = own ?? (t0 + (k * 1.7 + 2 + hash(k, 79)) * spacing);
    onTime.set(l, mode === 'dusk' ? slot : mode === 'dawn' ? t0 + (n * 0.5 + k) * spacing : null);
  });
  const stateOf = (key, t) => {
    if (mode === 'night') return 1;
    if (mode === 'day') return 0;
    const ts = onTime.get(key);
    if (mode === 'dusk') return litAt(ts, t);
    return 1 - litAt(ts, t);                                              // dawn: lit until its slot, then out
  };

  // lamp glass: glass-layer vertices of the props group within 0.7 m (xz) of each lamp, above 1.5 m
  const props = registry.get('props');
  const glassRanges = new Map();
  if (props?.group) {
    props.group.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    const town = props.group.parent;
    const inv = town ? new THREE.Matrix4().copy(town.matrixWorld).invert() : new THREE.Matrix4();
    props.group.traverse((o) => {
      const a = o.isMesh && o.geometry?.getAttribute('aGlow');
      if (!a) return;
      const p = o.geometry.getAttribute('position');
      const m = o.matrixWorld.clone().premultiply(inv);
      const orig = Float32Array.from({ length: a.count }, (_, i) => a.getW(i));
      for (const l of lamps) {
        const idx = [];
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m);
          if (Math.hypot(v.x - l.pos.x, v.z - l.pos.z) < 0.7 && v.y > 1.2 && orig[i] > 0.5) idx.push(i);
        }
        if (idx.length) glassRanges.set(l, { attr: a, idx, orig });
      }
    });
  }
  // composer PointLights (created after the pieces): wrap their intensity with a gain
  let lights = null;
  const anchorsAll = registry.anchors('lights');
  function hookLights() {
    const grp = engine.scene.getObjectByName('town-lights');
    lights = [];
    if (!grp) return;
    for (const pl of grp.children) {
      if (!pl.isPointLight) continue;
      let anchor = null;
      for (const a of anchorsAll) if (a.pos.distanceToSquared(pl.position) < 1e-6) { anchor = a; break; }
      let raw = pl.intensity, gain = 1;
      Object.defineProperty(pl, 'intensity', { configurable: true, get: () => raw * gain, set: (x) => { raw = x; } });
      lights.push({ pl, anchor, setGain: (g) => { gain = g; } });
    }
  }
  const lastLit = new Map();
  const setHouse = (id, on) => {
    if (lastLit.get(id) === on) return;
    lastLit.set(id, on);
    registry.get(id)?.api?.setLit?.(!!on);
  };
  const setLamp = (l, on) => {
    if (lastLit.get(l) === on) return;
    lastLit.set(l, on);
    const g = glassRanges.get(l);
    if (!g) return;
    for (const i of g.idx) g.attr.setW(i, on ? g.orig[i] : 0);
    g.attr.needsUpdate = true;
  };
  return {
    mode, onTime, ids, lamps,
    /** 0..1 lit state of a house id / lamp anchor at t. */
    stateOf,
    update(t) {
      if (mode === 'day' || mode === 'night') return;        // static phases: the composer's state is already right
      if (lights === null) hookLights();
      for (const id of ids) setHouse(id, stateOf(id, t) > 0.5);
      for (const l of lamps) setLamp(l, stateOf(l, t) > 0.5);
      for (const L of lights) {
        const a = L.anchor;
        if (!a) continue;
        let s = 1;
        if (a.piece === 'props' && a.kind === 'lamp') s = stateOf(lamps.find((q) => q.pos === a.pos) ?? a, t);
        else if (onTime.has(a.piece)) s = stateOf(a.piece, t);
        L.setGain(s);
      }
    },
  };
}
