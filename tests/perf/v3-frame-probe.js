// v3 perf recon, front "frame" (v3-perf-frame). IN-PAGE probe for tests/perf/v3-frame.ts (plain browser JS, injected
// as an init script, so no TS transform touches it). Measures the 3D town's frame without editing game3d or the
// vendor: it only wraps methods at runtime.
//
//   window.__THREE_DEVTOOLS__  three r170 dispatches 'observe' for every WebGLRenderer / Scene it constructs
//   window.requestAnimationFrame  timed per callback (+ the microtask tail after it) while __v3f.on
//   Engine.prototype.renderAt / _updateSun, PixelCamera.prototype.update   (patched through the SAME module URL Vite
//                              served to the app, so the class is the app's class)
//   engine.updaters[i], engine.pipeline.render (the host's runtime-opts wrapper), scene.updateMatrixWorld,
//   renderer.render, renderer.shadowMap.render   (instance wrappers, installed on the first renderAt)
//
// Everything is pass-through while __v3f.on is false except two counters (renderAt calls, render() calls).
// Exposes window.__v3f = { patchVendor, mount, census, run, synced, addChars, walk, heapNow, destroy, ... }.
(() => {
  if (window.__v3f) return;
  const now = () => performance.now();
  // Vite DEV serves hundreds of modules: keep every resource entry (patchVendor finds the vendor URLs there)
  try {
    performance.setResourceTimingBufferSize(1e6);
  } catch {
    /* ignore */
  }
  const origRaf = window.requestAnimationFrame.bind(window);
  const P = {
    on: false,
    syncPasses: false,
    renderers: [],
    scenes: [],
    engine: null,
    renderAts: 0,
    cur: null, // the frame record being filled (inside a host RAF callback)
    frames: [],
    rafOther: 0,
    errors: [],
    mut: 0,
    updLabels: new Map(),
    origRaf,
  };
  window.__v3f = P;

  // ------------------------------------------------------------------ three devtools hook
  const dt = new EventTarget();
  dt.addEventListener('observe', (ev) => {
    const o = ev.detail;
    if (o?.isScene) P.scenes.push(o);
    else if (o && typeof o.render === 'function' && o.info) P.renderers.push(o);
  });
  window.__THREE_DEVTOOLS__ = dt;

  // ------------------------------------------------------------------ RAF
  window.requestAnimationFrame = (cb) =>
    origRaf((ts) => {
      if (!P.on) return cb(ts);
      const before = P.renderAts;
      const t0 = now();
      const f = { raf: 0, micro: 0, renderAt: 0, upd: 0, cam: 0, sun: 0, pipe: 0, mw: 0, shadow: 0, shadowCalls: 0, color: 0, normal: 0, pre: 0, post: 0, postN: 0, up: 0, otherR: 0, renders: 0, calls: 0, tris: 0, stages: null, programs: 0, ts, upds: null, sync: null };
      P.cur = f;
      try {
        cb(ts);
      } finally {
        const t1 = now();
        P.cur = null;
        if (P.renderAts > before) {
          f.raf = t1 - t0;
          P.frames.push(f);
          queueMicrotask(() => {
            f.micro = now() - t1;
          });
        } else P.rafOther += t1 - t0;
      }
    });

  // ------------------------------------------------------------------ vendor patches
  const wrapped = Symbol('v3f');
  const label = (fn) => {
    let l = P.updLabels.get(fn);
    if (!l) {
      const src = String(fn).replace(/\s+/g, ' ');
      l = `${fn.name || 'anon'}: ${src.slice(0, 70)}`;
      P.updLabels.set(fn, l);
    }
    return l;
  };
  const wrapUpdaters = (e) => {
    const ups = e.updaters;
    for (let i = 0; i < ups.length; i++) {
      const fn = ups[i];
      if (fn[wrapped]) continue;
      const l = label(fn);
      const w = function (...a) {
        const f = P.cur;
        if (!P.on || !f) return fn.apply(this, a);
        const t0 = now();
        try {
          return fn.apply(this, a);
        } finally {
          const d = now() - t0;
          f.upd += d;
          (f.upds ??= {})[l] = (f.upds[l] ?? 0) + d;
        }
      };
      w[wrapped] = true;
      ups[i] = w;
    }
  };
  const sync = (r) => {
    // a synchronous 1-px read of the canvas: every queued GL command (SwiftShader raster) has finished
    const gl = r.getContext();
    const rt = r.getRenderTarget();
    r.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, P.px ??= new Uint8Array(4));
    r.setRenderTarget(rt);
  };
  const instrumentEngine = (e) => {
    const r = e.renderer;
    const pipe = e.pipeline;
    // pipeline.render: the host's runtime-opts wrapper (updateMatrixWorld + the vendor render) when installed
    if (!pipe.render[wrapped]) {
      const prev = pipe.render;
      const w = function (...a) {
        const f = P.cur;
        if (!P.on || !f) return prev.apply(this, a);
        const t0 = now();
        try {
          return prev.apply(this, a);
        } finally {
          f.pipe += now() - t0;
        }
      };
      w[wrapped] = true;
      pipe.render = w;
    }
    const sc = e.scene;
    if (!sc.updateMatrixWorld[wrapped]) {
      const prev = sc.updateMatrixWorld;
      const w = function (...a) {
        const f = P.cur;
        if (!P.on || !f) return prev.apply(this, a);
        const t0 = now();
        try {
          return prev.apply(this, a);
        } finally {
          f.mw += now() - t0;
        }
      };
      w[wrapped] = true;
      sc.updateMatrixWorld = w;
    }
    const sm = r.shadowMap;
    if (!sm.render[wrapped]) {
      const prev = sm.render;
      const w = function (...a) {
        const f = P.cur;
        if (!P.on || !f) return prev.apply(this, a);
        const c0 = r.info.render.calls;
        const t0 = now();
        try {
          return prev.apply(this, a);
        } finally {
          if (P.syncPasses) sync(r);
          f.shadow += now() - t0;
          f.shadowCalls += r.info.render.calls - c0;
        }
      };
      w[wrapped] = true;
      sm.render = w;
    }
    if (!r.render[wrapped]) {
      const prev = r.render;
      const w = function (scene, cam) {
        P.renders = (P.renders ?? 0) + 1;
        const f = P.cur;
        if (!P.on || !f) return prev.call(this, scene, cam);
        const target = r.getRenderTarget();
        const sh0 = f.shadow;
        const t0 = now();
        try {
          return prev.call(this, scene, cam);
        } finally {
          if (P.syncPasses) sync(r);
          const d = now() - t0 - (f.shadow - sh0);
          f.renders++;
          if (target === pipe.rtScene) f.color += d;
          else if (target === pipe.rtNormal) f.normal += d;
          else if (target === pipe.rtA || target === pipe.rtB) {
            f.post += d;
            f.postN++;
            const mat = scene.children[0]?.material;
            const name = pipe.passes.find((x) => x.material === mat)?.name ?? '?';
            (f.postBy ??= {})[name] = (f.postBy[name] ?? 0) + d;
          } else if (target === null) f.up += d;
          else if (f.color === 0) f.pre += d;
          else f.otherR += d;
        }
      };
      w[wrapped] = true;
      r.render = w;
    }
  };

  /** Patch Engine / PixelCamera prototypes through the module URLs the app itself loaded. */
  P.patchVendor = async () => {
    await import('/src/game3d/vendor/engineHost.ts');
    const urls = performance.getEntriesByType('resource').map((x) => x.name);
    const find = (re) => urls.find((u) => re.test(u.split('?')[0]));
    const engUrl = find(/\/pixel3d\/src\/core\/Engine\.js$/);
    const camUrl = find(/\/pixel3d\/src\/core\/PixelCamera\.js$/);
    if (!engUrl) throw new Error('Engine.js URL not found among loaded resources');
    const { Engine } = await import(/* @vite-ignore */ engUrl);
    const EP = Engine.prototype;
    if (!EP.renderAt[wrapped]) {
      const orig = EP.renderAt;
      const w = function (t) {
        P.renderAts++;
        // a rebuild (tier change, context loss) makes a NEW Engine: follow it
        if (P.engine !== this && !this.__ctDisposed) {
          if (P.engine) P.engineSwaps = (P.engineSwaps ?? 0) + 1;
          P.engine = this;
        }
        const f = P.cur;
        if (!P.on || !f) return orig.call(this, t);
        try {
          instrumentEngine(this);
          wrapUpdaters(this);
        } catch (e) {
          P.errors.push(`instrument: ${e?.message ?? e}`);
        }
        const t0 = now();
        try {
          return orig.call(this, t);
        } finally {
          f.renderAt = now() - t0;
          const i = this.renderer.info;
          f.calls = i.render.calls;
          f.tris = i.render.triangles;
          f.programs = i.programs?.length ?? 0;
          f.stages = { ...(this.pipeline.stageCalls ?? {}) };
        }
      };
      w[wrapped] = true;
      EP.renderAt = w;
    }
    const timeProto = (proto, name, field) => {
      const orig = proto[name];
      if (!orig || orig[wrapped]) return;
      const w = function (...a) {
        const f = P.cur;
        if (!P.on || !f) return orig.apply(this, a);
        const t0 = now();
        try {
          return orig.apply(this, a);
        } finally {
          f[field] += now() - t0;
        }
      };
      w[wrapped] = true;
      proto[name] = w;
    };
    timeProto(EP, '_updateSun', 'sun');
    if (camUrl) {
      const { PixelCamera } = await import(/* @vite-ignore */ camUrl);
      timeProto(PixelCamera.prototype, 'update', 'cam');
    }
    return { engUrl: engUrl.replace(location.origin, ''), camUrl: camUrl?.replace(location.origin, '') ?? null };
  };

  // ------------------------------------------------------------------ mount (fake connection, like scripts/v3/smoke-mount.mjs)
  const mk = (v) => {
    let val = v;
    const subs = new Set();
    return { get: () => val, set: (x) => ((val = x), subs.forEach((f) => f(x))), subscribe: (f) => (subs.add(f), () => subs.delete(f)) };
  };
  P.mount = async ({ tier, world, players, w, h, gameView }) => {
    let layout = null;
    let worldUsed = world;
    try {
      const L = await import('/src/net/layout.ts');
      if (world === 'v3' && L.ensureLayout) await L.ensureLayout('v3');
      layout = L.currentLayout();
    } catch (e) {
      P.errors.push(`layout(${world}) failed, using v2: ${e?.message ?? e}`);
      worldUsed = 'v2';
      const L = await import('/src/net/layout.ts');
      layout = L.currentLayout();
    }
    const { createTownGame3d } = await import('/src/game3d/TownGame3d.ts');
    const subs = new Map();
    const handlers = { get: (k) => (subs.has(k) ? (x) => [...subs.get(k)].forEach((fn) => fn(x)) : undefined) };
    const pids = ['me', ...Array.from({ length: players }, (_, i) => `r${i + 1}`)];
    const members = pids.map((pid, i) => ({ pid, role: 'player', seat: i, displayName: pid === 'me' ? 'You' : `Player ${i}` }));
    const conn = {
      lobbyView: mk({ youPid: 'me', world: worldUsed, members, lobby: { phase: 'waiting', world: worldUsed } }),
      gameView: mk(gameView ?? null),
      status: mk('open'),
      // several modules subscribe to the same event (net/core + overlay/gameplayView both take world:teleport): keep all
      events: {
        on: (k, fn) => {
          let set = subs.get(k);
          if (!set) subs.set(k, (set = new Set()));
          set.add(fn);
          return () => set.delete(fn);
        },
      },
      send: () => undefined,
    };
    const fallbacks = [];
    const bridge = { conn, setPrompt() {}, setCaption() {}, setInside() {}, registerLeave() {}, requestFallback: (r) => fallbacks.push(r) };
    const el = document.createElement('div');
    el.className = 'ct-game-canvas';
    el.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px`;
    document.body.appendChild(el);
    const t0 = now();
    const hd = createTownGame3d(el, bridge, { tier });
    let readyErr = null;
    try {
      await hd.ready;
    } catch (e) {
      readyErr = String(e?.stack ?? e).slice(0, 500);
    }
    const readyMs = Math.round(now() - t0);
    const T = layout.tileSize;
    const sp = { x: layout.playerSpawn.x * T + T / 2, y: layout.playerSpawn.y * T + T - 2 };
    handlers.get('world:teleport')?.({ seq: 0, x: sp.x, y: sp.y, location: 'outdoors', reason: 'spawn' });
    // remotes: 12 Hz snapshots, each walking a small circle around the square centre (drawn by the wired v3 town)
    const sq = layout.square;
    const ents = pids.slice(1).map((id, i) => ({ id, i }));
    const pump = () => {
      const t = now() / 1000;
      const entities = ents.map(({ id, i }) => {
        const a = (i / ents.length) * Math.PI * 2 + t * 0.25;
        const r = sq.r * (0.35 + 0.25 * ((i % 3) / 2));
        return { id, x: sq.cx + Math.cos(a) * r, y: sq.cy + Math.sin(a) * r, facing: 'down', moving: true, location: 'outdoors' };
      });
      handlers.get('world:snapshot')?.({ t: Date.now(), ackSeq: 0, entities });
    };
    const timer = players > 0 ? setInterval(pump, 83) : null;
    P.m = { hd, el, conn, handlers, layout, timer, fallbacks };
    new MutationObserver((l) => {
      if (P.on) P.mut += l.length;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    return { readyMs, readyErr, world: worldUsed, spawn: sp, square: sq, fallbacks: [...fallbacks], v3: window.__ctCamera?.v3?.() ?? null, engineSeen: !!P.engine, errors: [...P.errors] };
  };

  // ------------------------------------------------------------------ walking (keys on window, like the e2e)
  let walkTimer = null;
  P.walk = (on) => {
    const codes = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    let k = 0;
    const press = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    if (walkTimer) {
      clearInterval(walkTimer);
      walkTimer = null;
      for (const c of codes) press(c, 'keyup');
    }
    if (!on) return;
    press(codes[0], 'keydown');
    walkTimer = setInterval(() => {
      press(codes[k % 4], 'keyup');
      k++;
      press(codes[k % 4], 'keydown');
    }, 1200);
  };

  // ------------------------------------------------------------------ scene census
  P.census = () => {
    const e = P.engine;
    if (!e) return { error: 'engine not captured' };
    const r = e.renderer;
    const scene = e.scene;
    const c = { nodes: 0, matrixAutoUpdate: 0, meshes: 0, instanced: 0, instances: 0, skinned: 0, casters: 0, receivers: 0, noFrustumCull: 0, colorOnly: 0, points: 0, lines: 0, sprites: 0, staticTris: 0 };
    const vis = { meshes: 0, instanced: 0, casters: 0, tris: 0 };
    const mats = new Set();
    const matTypes = {};
    const geos = new Set();
    const lights = {};
    const shadowMaps = [];
    const triOf = (m) => {
      const g = m.geometry;
      if (!g) return 0;
      const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
      const dr = g.drawRange?.count;
      const cnt = Number.isFinite(dr) ? Math.min(n, dr) : n;
      return (cnt / 3) * (m.isInstancedMesh ? m.count : 1);
    };
    scene.traverse((o) => {
      c.nodes++;
      if (o.matrixAutoUpdate) c.matrixAutoUpdate++;
      if (o.isMesh) {
        c.meshes++;
        if (o.isInstancedMesh) {
          c.instanced++;
          c.instances += o.count;
        }
        if (o.isSkinnedMesh) c.skinned++;
        if (o.castShadow) c.casters++;
        if (o.receiveShadow) c.receivers++;
        if (!o.frustumCulled) c.noFrustumCull++;
        if (o.layers.mask === 2) c.colorOnly++;
        c.staticTris += triOf(o);
        geos.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m) continue;
          mats.add(m);
        }
      }
      if (o.isPoints) c.points++;
      if (o.isLine) c.lines++;
      if (o.isSprite) c.sprites++;
      if (o.isLight) {
        const k = o.type;
        const L = (lights[k] ??= { n: 0, visible: 0, castShadow: 0, intensityPos: 0 });
        L.n++;
        let v = o.visible;
        for (let p = o.parent; p && v; p = p.parent) v = p.visible;
        if (v) L.visible++;
        if (v && o.intensity > 0) L.intensityPos++;
        if (o.castShadow) {
          L.castShadow++;
          shadowMaps.push({ type: k, mapSize: [o.shadow.mapSize.x, o.shadow.mapSize.y], allocated: !!o.shadow.map, autoUpdate: o.shadow.autoUpdate });
        }
      }
    });
    const heavy = [];
    const pieceOf = (o) => {
      let n = o.name || '';
      for (let p = o.parent; p && p !== scene; p = p.parent) if (p.name && /^(town|.*-placed)$/.test(p.name) === false) n = `${p.name}/${n}`;
      return n.slice(-80);
    };
    scene.traverseVisible((o) => {
      if (o.isMesh) {
        vis.meshes++;
        if (o.isInstancedMesh) vis.instanced++;
        if (o.castShadow) vis.casters++;
        const tr = triOf(o);
        vis.tris += tr;
        heavy.push([tr, o]);
      }
    });
    // the heaviest visible meshes (tris per pass; drawn in colour + normal (+ shadow when casting))
    heavy.sort((a, b) => b[0] - a[0]);
    const topMeshes = heavy.slice(0, 15).map(([tr, o]) => ({ name: pieceOf(o), tris: Math.round(tr), cast: !!o.castShadow, colorOnly: o.layers.mask === 2, culled: o.frustumCulled !== false, mat: (Array.isArray(o.material) ? o.material[0] : o.material)?.type ?? null }));
    for (const m of mats) matTypes[m.type] = (matTypes[m.type] ?? 0) + 1;
    const pipe = e.pipeline;
    const rtDesc = (rt) => (rt ? { w: rt.width, h: rt.height, type: rt.texture.type, depthTex: rt.depthTexture ? rt.depthTexture.type : null } : null);
    const programs = {};
    for (const p of r.info.programs ?? []) programs[p.name] = (programs[p.name] ?? 0) + 1;
    const numStats = {};
    for (const [k, v] of Object.entries(e.stats ?? {})) {
      if (typeof v === 'number') numStats[k] = Math.round(v * 100) / 100;
      else if (Array.isArray(v)) numStats[`${k}.length`] = v.length;
    }
    const gl = r.getContext();
    return {
      canvas: { w: r.domElement.width, h: r.domElement.height },
      pixelScale: e.pixelScale,
      low: { w: e.lowW, h: e.lowH },
      rts: { scene: rtDesc(pipe.rtScene), normal: rtDesc(pipe.rtNormal), a: rtDesc(pipe.rtA), b: rtDesc(pipe.rtB) },
      passes: pipe.passes.map((p) => ({ name: p.name, order: p.order, enabled: p.enabled !== false })),
      preRender: pipe.preRender.length,
      shadowOnce: pipe.shadowOnce,
      shadowMapType: r.shadowMap.type,
      shadowAutoUpdate: r.shadowMap.autoUpdate,
      updaters: e.updaters.length,
      counts: c,
      visible: vis,
      topMeshes,
      materials: mats.size,
      materialTypes: matTypes,
      geometries: geos.size,
      lights,
      shadowMaps,
      townLights: Array.isArray(e.townLights) ? e.townLights.length : null,
      programs: { total: r.info.programs?.length ?? null, byName: programs },
      memory: { ...r.info.memory },
      scenes: P.scenes.length,
      renderers: P.renderers.length,
      engineStats: numStats,
      gl: { version: gl.getParameter(gl.VERSION), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') },
      gpu: window.__pixel?.gpu ?? null,
    };
  };

  // ------------------------------------------------------------------ measurement windows
  const q = (xs, f) => {
    if (!xs.length) return 0;
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.max(0, Math.ceil(f * a.length) - 1))];
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const agg = (xs) => ({ mean: r2(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)), p50: r2(q(xs, 0.5)), p95: r2(q(xs, 0.95)), max: r2(xs.length ? Math.max(...xs) : 0) });
  const postBy = (fr) => {
    const acc = {};
    for (const f of fr) for (const [k, v] of Object.entries(f.postBy ?? {})) acc[k] = (acc[k] ?? 0) + v;
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, r2(v / Math.max(1, fr.length))]).sort((a, b) => b[1] - a[1]));
  };
  const FIELDS = ['raf', 'micro', 'renderAt', 'upd', 'cam', 'sun', 'pipe', 'mw', 'shadow', 'color', 'normal', 'pre', 'post', 'up', 'otherR', 'calls', 'tris', 'shadowCalls', 'postN', 'renders', 'programs'];
  /** Collect `secs` seconds (at least `minFrames` host frames) of instrumented frames; also rAF deltas. */
  P.run = ({ secs = 8, minFrames = 20, maxSecs = 120, instrument = true } = {}) =>
    new Promise((res) => {
      P.frames = [];
      P.mut = 0;
      P.rafOther = 0;
      P.on = instrument;
      const deltas = [];
      let prev = null;
      const t0 = now();
      const ra0 = P.renderAts;
      const heap0 = performance.memory?.usedJSHeapSize ?? null;
      let heapMin = Infinity;
      let heapMax = 0;
      let drops = 0;
      let lastHeap = heap0 ?? 0;
      const tick = (t) => {
        if (prev !== null) deltas.push(t - prev);
        prev = t;
        const hp = performance.memory?.usedJSHeapSize;
        if (hp) {
          if (hp < lastHeap) drops++;
          lastHeap = hp;
          heapMin = Math.min(heapMin, hp);
          heapMax = Math.max(heapMax, hp);
        }
        const el = (now() - t0) / 1000;
        const frames = P.renderAts - ra0;
        if ((el < secs || frames < minFrames) && el < maxSecs) origRaf(tick);
        else {
          P.on = false;
          const wall = now() - t0;
          const fr = P.frames.slice();
          const out = { wallMs: Math.round(wall), hostFrames: P.renderAts - ra0, instrumentedFrames: fr.length, fps: r2(((P.renderAts - ra0) * 1000) / wall), delta: agg(deltas), domMutPerSec: r2((P.mut * 1000) / wall), rafOtherMs: r2(P.rafOther) };
          if (instrument && fr.length) {
            out.perFrame = {};
            for (const k of FIELDS) out.perFrame[k] = agg(fr.map((f) => f[k]));
            // game JS outside renderAt (TownGame3d frame() + after()), per frame
            out.perFrame.game = agg(fr.map((f) => Math.max(0, f.raf - f.renderAt)));
            out.perFrame.renderAtOther = agg(fr.map((f) => Math.max(0, f.renderAt - f.upd - f.cam - f.sun - f.pipe)));
            out.perFrame.pipeOther = agg(fr.map((f) => Math.max(0, f.pipe - f.mw - f.shadow - f.color - f.normal - f.pre - f.post - f.up - f.otherR)));
            const upd = {};
            for (const f of fr) for (const [k, v] of Object.entries(f.upds ?? {})) upd[k] = (upd[k] ?? 0) + v;
            out.updatersTop = Object.entries(upd)
              .map(([k, v]) => [k, r2(v / fr.length)])
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12);
            const st = {};
            for (const f of fr) for (const [k, v] of Object.entries(f.stages ?? {})) (st[k] ??= []).push(v);
            out.stageCalls = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, agg(v)]));
            out.programsSeen = [...new Set(fr.map((f) => f.programs))];
            out.postByMs = postBy(fr);
          }
          if (heap0 != null) out.heap = { startMB: r2(heap0 / 2 ** 20), minMB: r2(heapMin / 2 ** 20), maxMB: r2(heapMax / 2 ** 20), endMB: r2((performance.memory?.usedJSHeapSize ?? 0) / 2 ** 20), drops };
          out.v3 = window.__ctCamera?.v3?.() ?? null;
          res(out);
        }
      };
      origRaf(tick);
    });

  /** n back-to-back renderAt(t) calls, each followed by a synchronous read (SwiftShader raster included). */
  P.synced = ({ n = 12, passes = false } = {}) => {
    const e = P.engine;
    if (!e) return { error: 'engine not captured' };
    instrumentEngine(e);
    wrapUpdaters(e);
    const r = e.renderer;
    const totals = [];
    const fr = [];
    P.syncPasses = passes;
    P.on = true;
    let t = e.time ?? 0;
    try {
      for (let i = 0; i < n; i++) {
        t += 1 / 60;
        const f = { raf: 0, micro: 0, renderAt: 0, upd: 0, cam: 0, sun: 0, pipe: 0, mw: 0, shadow: 0, shadowCalls: 0, color: 0, normal: 0, pre: 0, post: 0, postN: 0, up: 0, otherR: 0, renders: 0, calls: 0, tris: 0, stages: null, programs: 0, upds: null };
        P.cur = f;
        const t0 = now();
        e.renderAt(t);
        sync(r);
        totals.push(now() - t0);
        P.cur = null;
        fr.push(f);
      }
    } finally {
      P.on = false;
      P.syncPasses = false;
      P.cur = null;
    }
    const out = { n, passes, total: agg(totals.slice(2)) };
    out.perFrame = {};
    for (const k of FIELDS) out.perFrame[k] = agg(fr.slice(2).map((f) => f[k]));
    out.postByMs = postBy(fr.slice(2));
    return out;
  };

  /**
   * What-if experiments (synced, SwiftShader raster included): each one mutates the live engine, measures `n` synced
   * frames, and restores. Ranks the candidate optimisations by the frame cost they would remove, without editing code.
   * The image is NOT what the game shows during an experiment (e.g. a skipped normal pass leaves stale outlines).
   */
  P.whatIf = ({ n = 4, only = null } = {}) => {
    const e = P.engine;
    if (!e) return { error: 'engine not captured' };
    const r = e.renderer;
    const pipe = e.pipeline;
    const sun = e.sun;
    const exps = [];
    const add = (name, apply) => {
      if (!only || name === 'baseline' || only.some((o) => name.startsWith(o))) exps.push({ name, apply });
    };
    add('baseline', () => () => undefined);
    add('no-shadow-render', () => {
      const a = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      return () => {
        r.shadowMap.autoUpdate = a;
      };
    });
    add('shadow-half', () => {
      const old = sun.shadow.mapSize.x;
      const set = (v) => {
        sun.shadow.mapSize.set(v, v);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      };
      set(Math.max(256, old / 2));
      return () => set(old);
    });
    add('skip-normal-pass', () => {
      const prev = r.render;
      r.render = function (scene, cam) {
        if (r.getRenderTarget() === pipe.rtNormal) return undefined;
        return prev.call(this, scene, cam);
      };
      return () => {
        r.render = prev;
      };
    });
    if (pipe.preRender.length)
      add('no-preRender', () => {
        const pr = pipe.preRender;
        pipe.preRender = [];
        return () => {
          pipe.preRender = pr;
        };
      });
    for (const p of pipe.passes)
      if (p.enabled !== false)
        add(`post-off:${p.name}`, () => {
          p.enabled = false;
          return () => {
            p.enabled = true;
          };
        });
    add('all-post-off', () => {
      const on = pipe.passes.filter((p) => p.enabled !== false);
      for (const p of on) p.enabled = false;
      return () => {
        for (const p of on) p.enabled = true;
      };
    });
    add('scale+1', () => {
      e.pixelScale += 1;
      e.lowW = Math.ceil(e.width / e.pixelScale);
      e.lowH = Math.ceil(e.height / e.pixelScale);
      e.camera.resize(e.lowW, e.lowH);
      pipe.resize(e.lowW, e.lowH);
      return () => e.resize();
    });
    const pls = [];
    e.scene.traverse((o) => o.isPointLight && o.visible && pls.push(o));
    if (pls.length)
      add('point-lights-hidden', () => {
        // fewer lights = a different light count = new programs (compiled here, outside the timed frames' p50)
        for (const l of pls) l.visible = false;
        return () => pls.forEach((l) => (l.visible = true));
      });
    const out = { pointLights: pls.length };
    for (const x of exps) {
      let restore = null;
      try {
        restore = x.apply();
        // mean over an even count: 30 fps sub-systems (the river reflection) run on every other 1/60 s step
        const s = P.synced({ n: n + 2 });
        out[x.name] = { mean: s.total.mean, p50: s.total.p50, calls: s.perFrame.calls.mean, tris: s.perFrame.tris.mean, programs: s.perFrame.programs.p50 };
      } catch (err) {
        out[x.name] = { error: String(err?.message ?? err) };
      } finally {
        try {
          restore?.();
        } catch (err) {
          P.errors.push(`whatIf restore ${x.name}: ${err?.message ?? err}`);
        }
      }
      const b = out.baseline?.mean;
      if (b && out[x.name].mean != null && x.name !== 'baseline') out[x.name].savedPct = r2(((b - out[x.name].mean) / b) * 100);
    }
    P.synced({ n: 2 }); // re-render with everything restored
    return out;
  };

  /** Spawn k extra vendor characters in a ring around the own player, walking (the per-character cost). */
  P.addChars = async ({ k, ids, lite, radius = 3 }) => {
    const e = P.engine;
    if (!e) return { error: 'engine not captured' };
    const C = await import('/src/game3d/vendor/characters.ts');
    const me = window.__ctCamera?.me?.();
    const cx = (me?.x ?? 0) / 32;
    const cz = (me?.y ?? 0) / 32;
    // the town's ground height (0 for the flat square when no ground piece exposes heightAt)
    const heightAt = () => 0;
    P.extra ??= [];
    const t0 = now();
    const made = [];
    for (let i = 0; i < k; i++) {
      const id = ids[i % ids.length];
      const a0 = (i / k) * Math.PI * 2;
      const rr = radius + (i % 3) * 0.9;
      const at = (t) => {
        const a = a0 + t * 0.35;
        return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr];
      };
      const [x, z] = at(e.time ?? 0);
      try {
        const h = await C.spawnCharacter(e, id, { x, z, heightAt, lite });
        e.scene.add(h.root);
        const track = C.driveAlong(h, heightAt);
        track.reset(e.time ?? 0, x, z);
        made.push({ id, h, track, at });
      } catch (err) {
        P.errors.push(`spawn ${id}: ${err?.message ?? err}`);
      }
    }
    P.extra.push(...made);
    // what one character adds to the scene: meshes, material groups (one draw call each), layers, culling
    const perChar = made.slice(0, 3).map((c) => {
      const o = { id: c.id, nodes: 0, meshes: 0, skinned: 0, points: 0, groups: 0, casters: 0, colorOnly: 0, noCull: 0, tris: 0, bones: 0 };
      c.h.root.traverse((x) => {
        o.nodes++;
        if (x.isBone) o.bones++;
        if (x.isPoints) o.points++;
        if (!x.isMesh) return;
        o.meshes++;
        if (x.isSkinnedMesh) o.skinned++;
        if (x.castShadow) o.casters++;
        if (x.layers.mask === 2) o.colorOnly++;
        if (x.frustumCulled === false) o.noCull++;
        o.groups += Array.isArray(x.material) ? Math.max(1, x.geometry?.groups?.length ?? 1) : 1;
        const g = x.geometry;
        if (g) o.tris += Math.round((g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3);
      });
      return o;
    });
    if (!P.extraUpd) {
      P.extraUpd = (t) => {
        if (P.extraPaused) return;
        for (const c of P.extra) {
          const [x, z] = c.at(t);
          c.track.push(t, x, z);
          c.h.update(t);
        }
      };
      e.onUpdate(P.extraUpd);
    }
    return { spawned: made.length, total: P.extra.length, ms: Math.round(now() - t0), perChar, errors: [...P.errors] };
  };

  /**
   * The extra characters' exact cost at ONE camera position: synced frames with them hidden + paused, then shown +
   * updating (the walk windows move the camera, so window-to-window call counts also change with the view).
   */
  P.charDelta = ({ n = 6 } = {}) => {
    const k = P.extra?.length ?? 0;
    if (!k) return { error: 'no extra characters' };
    const set = (on) => {
      P.extraPaused = !on;
      for (const c of P.extra) c.h.root.visible = on;
    };
    set(false);
    P.synced({ n: 2 });
    const off = P.synced({ n: n + 2 });
    set(true);
    P.synced({ n: 2 });
    const on = P.synced({ n: n + 2 });
    const d = (k2, s = 'mean') => r2(on.perFrame[k2][s] - off.perFrame[k2][s]);
    const per = (v) => r2(v / k);
    return {
      k,
      off: { calls: off.perFrame.calls.mean, tris: off.perFrame.tris.mean, shadowCalls: off.perFrame.shadowCalls.mean, syncedMs: off.total.mean, renderAtMs: off.perFrame.renderAt.p50, updMs: off.perFrame.upd.p50, mwMs: off.perFrame.mw.p50 },
      on: { calls: on.perFrame.calls.mean, tris: on.perFrame.tris.mean, shadowCalls: on.perFrame.shadowCalls.mean, syncedMs: on.total.mean, renderAtMs: on.perFrame.renderAt.p50, updMs: on.perFrame.upd.p50, mwMs: on.perFrame.mw.p50 },
      perChar: {
        calls: per(d('calls')),
        shadowCalls: per(d('shadowCalls')),
        tris: Math.round(d('tris') / k),
        syncedMs: per(r2(on.total.mean - off.total.mean)),
        renderAtJsMs: per(d('renderAt', 'p50')),
        updJsMs: per(d('upd', 'p50')),
        pipeJsMs: per(d('pipe', 'p50')),
        mwJsMs: per(d('mw', 'p50')),
      },
    };
  };

  P.destroy = () => {
    P.walk(false);
    if (P.m?.timer) clearInterval(P.m.timer);
    for (const c of P.extra ?? []) {
      try {
        c.h.dispose();
      } catch {
        /* best effort */
      }
    }
    P.extra = [];
    P.m?.hd.destroy();
    P.m?.el.remove();
    return { canvases: document.querySelectorAll('canvas').length, ctCamera: '__ctCamera' in window };
  };
})();
