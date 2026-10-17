// Ambient library entry (owner: ambient-core). docs/AMBIENT.md.
//
//   import { createAmbient } from '../src/ambient/index.js';
//   const amb = await createAmbient(engine, {
//     systems: ['_ref-birds', { name: '_ref-fireflies', opts: { count: 24 } }],   // src/ambient/<name>.js
//     anchors: { perches: [Vector3, ...], spots: { ... } },                           // docs/TOWN.md §4 shape
//     heightAt: (x, z) => 0, tod: 'noon', seed: 1, strict: false, autoUpdate: true,
//   });
//   amb.actors.add({ id: 'walker', at: (t) => pathAt(t), height: 1.38 });        // pure f(t) -> deterministic
//   amb.actors.set('p1', pos, vel)                                                 // live game feed
//   amb.setTimeOfDay('night');  amb.stats();  amb.get('_ref-birds').api;  amb.dispose();
//
// A system that fails to import / build logs console.warn('[ambient] ...') and is skipped, so other systems keep
// working; strict: true (or strict: '<name>' | ['<name>', ...], or { name, strict: true }) throws instead (the
// system's own renders use strict).
// Integration r1 (docs/AMBIENT.md §10): ticker: { mode: 'live' } | { window: s } sets the Ticker defaults for every
// system built here (live hosts: no replay from t = 0); stats().totals sums declared calls / lights / update ms and
// names budget overruns. Worked example with all seven systems: scenes/ambient-gallery.js.
import * as THREE from 'three';
import { Actors, Ticker, todInfo, seedOf, rng, BUDGET } from './core.js';

export * from './core.js';

/** Load a system module by name (src/ambient/<name>.js) or accept a module/definition object. */
export async function loadSystem(ref) {
  if (typeof ref === 'string') {
    const m = await import(`./${ref}.js`);
    return m.default ?? m;
  }
  return ref.default ?? ref;
}

export async function createAmbient(engine, opts = {}) {
  const { systems = [], anchors = {}, heightAt = () => 0, seed = 1, strict = false, autoUpdate = true } = opts;
  const actors = opts.actors ?? new Actors();
  const root = new THREE.Group(); root.name = 'ambient';
  (opts.parent || engine.scene).add(root);
  let tod = todInfo(engine, opts.tod);
  const list = [];
  for (const entry of systems) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const isStrict = strict === true || strict === name || (Array.isArray(strict) && strict.includes(name)) || entry.strict === true;
    try {
      const def = await loadSystem(entry.module ?? name);
      const group = new THREE.Group(); group.name = `ambient-${name}`; root.add(group);
      const ctx = {
        engine, root: group, actors, anchors, heightAt, tod, name,
        seed: seedOf(name, seed), rng: (salt = 0) => rng(seedOf(name, seed) + salt * 7919),
      };
      // host-wide Ticker defaults (opts.ticker: { mode 'live', window s }) apply to Tickers built inside create()
      const saved = { ...Ticker.defaults };
      if (opts.ticker) Object.assign(Ticker.defaults, opts.ticker);
      let sys;
      try { sys = def.create(ctx, entry.opts || {}); } finally { Object.assign(Ticker.defaults, saved); }
      list.push({ name, def, sys, group, ms: 0, msMax: 0, n: 0 });
    } catch (e) {
      if (isStrict) throw e;
      console.warn(`[ambient] system '${name}' skipped: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  const amb = {
    root, actors, anchors, systems: list,
    get(name) { return list.find((s) => s.name === name)?.sys ?? null; },
    update(t, dt) {
      for (const s of list) {
        const a = performance.now();
        s.sys.update(t, dt, actors);
        const ms = performance.now() - a;
        s.ms += ms; s.n++; s.msMax = Math.max(s.msMax, ms);
      }
    },
    setTimeOfDay(name) { tod = todInfo(engine, name); for (const s of list) s.sys.setTimeOfDay(tod); },
    get tod() { return tod; },
    stats() {
      const out = { systems: list.length, budget: BUDGET.total };
      const tot = { calls: 0, lights: 0, updateMs: 0, over: [] };
      for (const s of list) {
        const st = { ...s.sys.stats(), updateMs: s.n ? +(s.ms / s.n).toFixed(3) : 0, updateMsMax: +s.msMax.toFixed(3) };
        out[s.name] = st;
        tot.calls += +st.calls || 0; tot.lights += +st.lights || 0; tot.updateMs += st.updateMs;
        const b = s.def.budget || BUDGET;
        if ((+st.calls || 0) > b.glCalls) tot.over.push(`${s.name}:calls`);
        if ((+st.lights || 0) > b.lights) tot.over.push(`${s.name}:lights`);
      }
      tot.updateMs = +tot.updateMs.toFixed(3);
      for (const k of ['glCalls', 'lights', 'updateMs']) if (tot[k === 'glCalls' ? 'calls' : k] > BUDGET.total[k]) tot.over.push(`total:${k}`);
      out.totals = tot;   // integration r1: declared calls / lights + summed mean update ms, budget overruns by name
      return out;
    },
    dispose() { for (const s of list) s.sys.dispose(); root.removeFromParent(); list.length = 0; },
  };
  for (const s of list) s.sys.setTimeOfDay(tod);
  if (autoUpdate) engine.onUpdate((t, dt) => amb.update(t, dt));
  return amb;
}
