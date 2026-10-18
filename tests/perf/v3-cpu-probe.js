// v3 perf, CPU-only tier prototype (v3-perf-cpu). In-page add-on to tests/perf/v3-frame-probe.js (load it AFTER that
// probe): runtime "levers" that each change ONE thing on the live engine and return a restore function, so the cost
// of each lever can be measured on SwiftShader without editing game3d or the vendor tree. Also: RAF windows (real
// fps, frame JS split) and an input-to-motion probe.
//
//   window.__v3c.levers                     names
//   window.__v3c.apply(['res180','noNormal']) -> applied names (restore with __v3c.restore())
//   window.__v3c.synced({n})                 synced frames (raster included), via __v3f.synced
//   window.__v3c.raf({secs})                 RAF window via __v3f.run
//   window.__v3c.input({trials})             keydown -> first frame whose own-avatar position changed
(() => {
  if (window.__v3c) return;
  const P = window.__v3f;
  if (!P) throw new Error('v3-cpu-probe: load v3-frame-probe.js first');
  const now = () => performance.now();
  const r2 = (v) => Math.round(v * 100) / 100;
  const C = { applied: [], restores: [], errors: [] };
  window.__v3c = C;

  const eng = () => {
    if (!P.engine) throw new Error('engine not captured');
    return P.engine;
  };
  const setScale = (e, s) => {
    e.pixelScale = s;
    e.lowW = Math.ceil(e.width / s);
    e.lowH = Math.ceil(e.height / s);
    e.camera.resize(e.lowW, e.lowH);
    e.pipeline.resize(e.lowW, e.lowH);
  };
  const scaleLever = (rows) => (e) => {
    const old = e.pixelScale;
    setScale(e, Math.max(1, Math.round(e.height / rows)));
    return () => setScale(e, old);
  };
  const meshes = (e, pred) => {
    const out = [];
    e.scene.traverse((o) => {
      if (o.isMesh && pred(o)) out.push(o);
    });
    return out;
  };
  const pathOf = (o) => {
    let n = o.name || '';
    for (let p = o.parent; p; p = p.parent) if (p.name) n = `${p.name}/${n}`;
    return n;
  };
  const hide = (list) => {
    const was = list.map((o) => o.visible);
    for (const o of list) o.visible = false;
    return () => list.forEach((o, i) => (o.visible = was[i]));
  };
  const passesOff = (e, pred) => {
    const on = e.pipeline.passes.filter((p) => p.enabled !== false && pred(p));
    for (const p of on) p.enabled = false;
    return () => on.forEach((p) => (p.enabled = true));
  };
  const skipNormal = (e) => {
    const r = e.renderer;
    const pipe = e.pipeline;
    const prev = r.render;
    r.render = function (scene, cam) {
      if (r.getRenderTarget() === pipe.rtNormal) return undefined; // the vendor already cleared it (flat normal, no flags)
      return prev.call(this, scene, cam);
    };
    return () => {
      r.render = prev;
    };
  };
  const characterMeshes = (e) => meshes(e, (o) => o.isSkinnedMesh || /billboard|avatar|ct-av/i.test(pathOf(o)));

  const unlitWhere = (e, pred) => {
    const THREE_ = window.__v3cTHREE;
    const swaps = [];
    const cache = new Map();
    e.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const one = (m) => {
        if (!m || !(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial) || !pred(o, m)) return m;
        let b = cache.get(m);
        if (!b) {
          b = new THREE_.MeshBasicMaterial({ color: m.color, map: m.map ?? null, vertexColors: m.vertexColors, alphaTest: m.alphaTest, side: m.side, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
          cache.set(m, b);
        }
        return b;
      };
      const old = o.material;
      o.material = Array.isArray(old) ? old.map(one) : one(old);
      if (o.material !== old) swaps.push([o, old]);
    });
    return () => {
      for (const [o, m] of swaps) o.material = m;
      for (const b of cache.values()) b.dispose();
    };
  };
  // v3.1 (cpu): set the cpu tier's live rewrite set (engine.__ctCpuShade) and recompile every scene material (a cache
  // key suffix per set, so three builds new programs instead of reusing the cached ones)
  const reshade = (names) => (e) => {
    const set = e.__ctCpuShade;
    if (!set) throw new Error('no __ctCpuShade (not the cpu tier)');
    const was = [...set];
    const mats = new Set();
    e.scene.traverse((o) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    const setTo = (list) => {
      set.clear();
      for (const n of list) set.add(n);
      const tag = list.join('+') || 'none';
      for (const m of mats) {
        if (!m.__v3cKey) m.__v3cKey = m.customProgramCacheKey;
        const base = m.__v3cKey;
        m.customProgramCacheKey = function () {
          return `${base.call(this)}|shade:${tag}`;
        };
        m.needsUpdate = true;
      }
    };
    setTo(names);
    return () => setTo(was);
  };

  const L = {
    // ---- internal render resolution (rows of the low-res target; 960x540: 270 = pixelScale 2 = today's high/low)
    res270: scaleLever(270),
    res180: scaleLever(180),
    res135: scaleLever(135),
    // ---- shadows
    noShadow: (e) => {
      const r = e.renderer;
      const a = r.shadowMap.enabled;
      const c = e.sun.castShadow;
      r.shadowMap.enabled = false;
      e.sun.castShadow = false; // NUM_DIR_LIGHT_SHADOWS 0: the receive / compare code leaves every toon program
      return () => {
        r.shadowMap.enabled = a;
        e.sun.castShadow = c;
      };
    },
    shadowFreeze: (e) => {
      const r = e.renderer;
      const a = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      return () => {
        r.shadowMap.autoUpdate = a;
      };
    },
    shadow1024: (e) => {
      const s = e.sun.shadow;
      const old = s.mapSize.x;
      const set = (v) => {
        s.mapSize.set(v, v);
        s.map?.dispose();
        s.map = null;
      };
      set(1024);
      return () => set(old);
    },
    // ---- passes
    noNormal: (e) => skipNormal(e),
    noNormalOutline: (e) => {
      const a = skipNormal(e);
      const b = passesOff(e, (p) => p.name === 'outline' || p.name === 'contact');
      return () => {
        b();
        a();
      };
    },
    waterOff: (e) => passesOff(e, (p) => /^water|^river/.test(p.name)),
    postGradeOnly: (e) => passesOff(e, (p) => p.name !== 'grade'),
    postOff: (e) => passesOff(e, () => true),
    noPreRender: (e) => {
      const pr = e.pipeline.preRender;
      e.pipeline.preRender = [];
      return () => {
        e.pipeline.preRender = pr;
      };
    },
    // final pass at low-res size, scaled by CSS (image-rendering: pixelated) instead of a full-canvas shader pass
    cssUpscale: (e) => {
      const r = e.renderer;
      const pipe = e.pipeline;
      const prevRender = pipe.render;
      const W = e.width;
      const H = e.height;
      const lw = () => e.lowW;
      const lh = () => e.lowH;
      r.setSize(lw(), lh(), false);
      pipe.render = function (...a) {
        const ps = e.pixelScale;
        const w = e.width;
        const h = e.height;
        // the upscale reads pixelScale / width / height only: draw it 1:1 into the low-res canvas
        e.pixelScale = 1;
        e.width = lw();
        e.height = lh();
        try {
          return prevRender.apply(this, a);
        } finally {
          e.pixelScale = ps;
          e.width = w;
          e.height = h;
        }
      };
      return () => {
        pipe.render = prevRender;
        r.setSize(W, H, false);
      };
    },
    // ---- lights / materials
    lights0: (e) => {
      const pls = [];
      e.scene.traverse((o) => o.isPointLight && o.visible && pls.push(o));
      return hide(pls);
    },
    noCloudPenumbraNoise: (e) => {
      const T = e.toonUniforms;
      const old = { c: T.uCloud?.value.x, p: T.uPenumbra?.value.x };
      if (T.uCloud) T.uCloud.value.x = 0;
      if (T.uPenumbra) T.uPenumbra.value.x = 0;
      const mats = new Map();
      e.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const u = m?.userData?.toon?.uNormalNoise;
          if (u && !mats.has(u)) mats.set(u, u.value);
        }
      });
      for (const u of mats.keys()) u.value = 0;
      return () => {
        if (T.uCloud) T.uCloud.value.x = old.c;
        if (T.uPenumbra) T.uPenumbra.value.x = old.p;
        for (const [u, v] of mats) u.value = v;
      };
    },
    canopyOff: (e) => {
      let u = null;
      e.scene.traverse((o) => {
        if (u || !o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.__ctCanopy) u = m.__ctCanopy;
      });
      if (!u) return () => undefined;
      const box = u.uCtCanN;
      let v = box.value;
      Object.defineProperty(box, 'value', { configurable: true, get: () => 0, set: (x) => (v = x) });
      return () => {
        delete box.value;
        box.value = v;
      };
    },
    // diagnostic floor: every lit material -> MeshBasicMaterial with the same colour / map (no lighting at all)
    unlit: (e) => unlitWhere(e, () => true),
    // v3.1 (cpu): the same floor per material family (where the shading cost lives)
    unlitGround: (e) => unlitWhere(e, (o) => /ground-terrain/.test(o.name)),
    unlitKit: (e) => unlitWhere(e, (o, m) => /^town-kit/.test(m.name || '')),
    unlitChars: (e) => unlitWhere(e, (o) => o.isSkinnedMesh || /billboard|avatar|ct-av/i.test(pathOf(o))),
    // v3.1 (cpu): the cpu tier's program rewrites (vendor/cpuTier.ts CPU_REWRITES) set to exactly these, recompiled
    shadeNone: reshade([]),
    // the v3.0 cpu tier's look (no kit swap) / the v3.1 default (vendor/cpuTier.ts CPU_SHADE_DEFAULT)
    shadeToonKit: reshade(['flight']),
    shadeDefault: reshade(['flight', 'kitBasic']),
    shadeKitPat: reshade(['flight', 'kitBasic', 'kitPat']),
    // diagnostics (dead-code elimination of one family's fragment shading), on top of the v3.0 look
    shadeKitFlat: reshade(['flight', 'xKitFlat']),
    shadeGroundFlat: reshade(['flight', 'xGroundFlat']),
    shadeToonMid: reshade(['flight', 'xToonMid']),
    shadeAllFlat: reshade(['flight', 'xKitFlat', 'xGroundFlat', 'xToonMid']),
    // ---- geometry
    noGrass: (e) => hide(meshes(e, (o) => /grass/i.test(pathOf(o)))),
    noFlowers: (e) => hide(meshes(e, (o) => /flower|clover|weed/i.test(pathOf(o)))),
    noLife: (e) => hide(meshes(e, (o) => /life|ambient|bird|cat|butterfl|smoke|particle/i.test(pathOf(o)))),
    // v3 perf (cpu): small dressing geometry (moss clumps, soft layers, ivy, cobble / wall detail)
    noDetail: (e) => hide(meshes(e, (o) => /moss|clump|soft|ivy|detail|pebble|cobble/i.test(pathOf(o)))),
    // the 3D town without its townsfolk NPCs (keeps the 14 players)
    noNpc: (e) => hide(meshes(e, (o) => /avatar:npc/i.test(pathOf(o)))),
    noCast: (e) => {
      const list = meshes(e, (o) => o.castShadow && !o.isSkinnedMesh);
      for (const o of list) o.castShadow = false;
      return () => list.forEach((o) => (o.castShadow = true));
    },
    // ---- characters
    charsHidden: (e) => hide(characterMeshes(e)),
    // far-LOD stand-in for every body: colour pass only (COLOR_ONLY layer), no shadow
    charsLite: (e) => {
      const list = characterMeshes(e);
      const was = list.map((o) => [o.layers.mask, o.castShadow]);
      for (const o of list) {
        o.layers.set(1);
        o.castShadow = false;
      }
      return () =>
        list.forEach((o, i) => {
          o.layers.mask = was[i][0];
          o.castShadow = was[i][1];
        });
    },
  };
  C.levers = Object.keys(L);

  C.apply = (names) => {
    const e = eng();
    const done = [];
    for (const n of names) {
      const f = L[n];
      if (!f) {
        C.errors.push(`unknown lever ${n}`);
        continue;
      }
      try {
        C.restores.push(f(e));
        C.applied.push(n);
        done.push(n);
      } catch (err) {
        C.errors.push(`${n}: ${err?.message ?? err}`);
      }
    }
    return done;
  };
  C.restore = () => {
    while (C.restores.length) {
      try {
        C.restores.pop()();
      } catch (err) {
        C.errors.push(`restore: ${err?.message ?? err}`);
      }
    }
    C.applied = [];
    return true;
  };

  /** Synced frames (raster included): mean / p50 total, calls, tris, programs. 2 warm frames compile new programs. */
  C.synced = ({ n = 6 } = {}) => {
    P.synced({ n: 3 }); // compile whatever a lever changed, outside the timed frames
    const s = P.synced({ n: n + 2 });
    const pf = s.perFrame;
    return { mean: s.total.mean, p50: s.total.p50, p95: s.total.p95, calls: pf.calls.mean, tris: Math.round(pf.tris.mean), programs: pf.programs.p50, renderAtJs: pf.renderAt.p50 };
  };
  C.syncedPasses = ({ n = 4 } = {}) => {
    P.synced({ n: 2 });
    const s = P.synced({ n: n + 2, passes: true });
    const out = {};
    for (const k of ['shadow', 'pre', 'color', 'normal', 'post', 'up']) out[k] = s.perFrame[k].p50;
    out.total = s.total.p50;
    out.postBy = s.postByMs;
    return out;
  };

  /** A RAF window: real frame rate of the running game loop (rAF deltas), and the frame's JS split. */
  C.raf = async ({ secs = 10, minFrames = 12 } = {}) => {
    const s = await P.run({ secs, minFrames, maxSecs: Math.max(60, secs * 4) });
    const pf = s.perFrame ?? {};
    const g = (k, q = 'p50') => pf[k]?.[q] ?? null;
    return { fps: s.fps, deltaP50: s.delta.p50, deltaP95: s.delta.p95, frames: s.hostFrames, rafJs: g('raf'), rafJsP95: g('raf', 'p95'), renderAtJs: g('renderAt'), gameJs: g('game'), micro: g('micro'), calls: g('calls'), tris: g('tris'), domMutPerSec: s.domMutPerSec, programs: s.programsSeen };
  };

  /**
   * Input to motion: keydown (window, like the e2e) at T; the first RAF frame AFTER which __ctCamera.me() moved;
   * reported as that frame's end - T (JS-visible; + about one frame until the compositor shows it). Then keyup and a
   * pause so the avatar stops before the next trial.
   */
  C.input = async ({ trials = 6, codes = ['ArrowRight', 'ArrowLeft'] } = {}) => {
    const me = () => window.__ctCamera?.me?.() ?? null;
    const press = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frameEnd = () => new Promise((r) => P.origRaf(() => setTimeout(() => r(now()), 0)));
    const out = [];
    for (let i = 0; i < trials; i++) {
      const code = codes[i % codes.length];
      await wait(400 + Math.random() * 120);
      const p0 = me();
      if (!p0) return { error: 'no __ctCamera.me()' };
      const T = now();
      press(code, 'keydown');
      let ms = null;
      let frames = 0;
      while (now() - T < 3000) {
        const t1 = await frameEnd();
        frames++;
        const p = me();
        if (p && (Math.abs(p.x - p0.x) > 0.01 || Math.abs(p.y - p0.y) > 0.01)) {
          ms = t1 - T;
          break;
        }
      }
      await wait(250);
      press(code, 'keyup');
      out.push({ ms: ms === null ? null : r2(ms), frames });
    }
    const ok = out.filter((x) => x.ms !== null).map((x) => x.ms).sort((a, b) => a - b);
    return { trials: out, p50: ok.length ? ok[(ok.length - 1) >> 1] : null, max: ok.length ? ok[ok.length - 1] : null };
  };

  /** Triangles / calls by top-level piece (visible meshes), for the "where are the triangles" table. */
  C.trisByPiece = () => {
    const e = eng();
    const acc = new Map();
    // the piece (child of the 'town' root) or the top-level group (avatars, lights, rooms)
    const top = (o) => {
      let n = o;
      while (n.parent && n.parent !== e.scene && n.parent.name !== 'town') n = n.parent;
      return (n.parent?.name === 'town' ? 'town/' : '') + (n.name || n.type);
    };
    e.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g) return;
      const cnt = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
      const dr = g.drawRange?.count;
      const tri = ((Number.isFinite(dr) ? Math.min(cnt, dr) : cnt) / 3) * (o.isInstancedMesh ? o.count : 1);
      const k = top(o);
      const a = acc.get(k) ?? { meshes: 0, tris: 0, casters: 0, colorOnly: 0 };
      a.meshes++;
      a.tris += tri;
      if (o.castShadow) a.casters++;
      if (o.layers.mask === 2) a.colorOnly++;
      acc.set(k, a);
    });
    return [...acc.entries()].map(([k, v]) => ({ piece: k, ...v, tris: Math.round(v.tris) })).sort((a, b) => b.tris - a.tris).slice(0, 25);
  };
})();
