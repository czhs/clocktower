// Demo performance harness (perf fleet, runtime owner). Loads demo.html in REAL TIME on render-host, waits for ready,
// lets it settle, then measures one scenario:
//   load:     navigation -> __demo.ready (ms), the town build / compile ms, the slowest pieces
//   realtime: RAF frame intervals (mean / p95 / max ms, fps) and the CPU ms of every renderAt split into
//             updaters (per demo module + per town piece) / camera+sun / pipeline (three's render submission)
//   synced:   N back-to-back renderAt + readPixels (GPU finished each frame): the throughput bound per frame
//   scene:    draw calls, triangles, programs, geometries, textures
//   --alloc:  CDP sampling heap profiler over the realtime window: bytes allocated per frame by function (top 15)
//   --prof:   CDP CPU profile over the realtime window: top self-time functions
//   --hitch "enter:house-8,leave,char:keeper" : timed actions after the window; worst frame in the 2 s after each
//   --throttle 4 : Chrome CPU throttling (laptop proxy, with --size 1280x720)
//   --ab 6       : synced bursts alternating window.__demo.rtopt(false/true) in the same page (A/B of the runtime opts)
//   node tools/demo-perf.mjs [--q "tod=night&quality=low&at=7,18"] [--size 1280x720] [--secs 5] [--frames 60]
//        [--throttle 1] [--alloc] [--prof] [--hitch ...] [--shot out.png] [--json out.json] [--label name]
// Exit 1 on any console error / pageerror / __demo.errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const throttle = Number(opt('throttle', '1'));
const q = opt('q', '');
const label = opt('label', q || 'default');

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const bad = [];
page.on('console', (m) => { if (m.type() === 'error') bad.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
const cdp = await page.context().newCDPSession(page);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r2 = (v) => Math.round(v * 100) / 100;
const out = { label, q, size: [W, H], throttle };
let code = 0;
try {
  const t0 = Date.now();
  await page.goto(`http://pixel3d.local/demo.html?intro=0${q ? '&' + q : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 240000 });
  out.load = await page.evaluate(() => {
    const e = window.__demo.demo?.engine, s = e?.stats ?? {};
    const nav = performance.getEntriesByType('navigation')[0];
    const pieces = Object.entries(s.pieces ?? {}).map(([k, v]) => [k, v[2]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { readyMs: Math.round(performance.now() - (nav?.startTime ?? 0)), buildMs: s.demoBuildMs, compileMs: s.demoCompileMs, townBuildMs: s.townBuildMs,
      lifeBuildMs: s.life?.lifeBuildMs, pieces, marks: window.__demo.loadMarks ?? null };
  });
  out.load.wallMs = Date.now() - t0;
  await page.waitForTimeout(Number(opt('settle', '2500')));
  // install the per-frame instrumentation (wrapped functions; removed after the window)
  await page.evaluate(() => {
    const d = window.__demo.demo, e = d.engine;
    const P = (window.__perf = { frames: [], cur: null, on: false, restore: [] });
    const wrap = (obj, key, name) => {
      const fn = obj?.[key];
      if (typeof fn !== 'function') return;
      obj[key] = function (...a) {
        if (!P.on) return fn.apply(this, a);
        const t = performance.now();
        try { return fn.apply(this, a); } finally { const c = P.cur; if (c) c[name] = (c[name] ?? 0) + performance.now() - t; }
      };
      P.restore.push(() => { obj[key] = fn; });
    };
    for (const m of ['player', 'camera', 'intro', 'cut', 'time', 'ui', 'deploy']) wrap(d[m], 'update', 'demo:' + m);
    for (const [id, p] of d.town.registry.map) wrap(p, 'update', 'piece:' + id);
    // every engine updater (town pieces, the demo's, life's Characters, shadow cull, sprite placement ...): 'upd:all'
    e.updaters.forEach((fn, i) => wrap(e.updaters, i, 'upd:all'));
    wrap(e.camera, 'update', 'engine:camera');
    wrap(e, '_updateSun', 'engine:sun');
    wrap(e.pipeline, 'render', 'engine:pipeline');
    const ra = e.renderAt;
    e.renderAt = function (t) {
      if (!P.on) return ra.call(this, t);
      P.cur = { _t: performance.now() };
      ra.call(this, t);
      P.cur.total = performance.now() - P.cur._t;
      P.cur.calls = e.renderer.info.render.calls; P.cur.tris = e.renderer.info.render.triangles;
      P.frames.push(P.cur); P.cur = null;
    };
    P.restore.push(() => { e.renderAt = ra; });
    // RAF intervals (a separate RAF chain: it runs in the same frame as the demo's)
    P.raf = []; let last = null;
    const tick = (now) => { if (P.on) { if (last !== null) P.raf.push(now - last); last = now; } else last = null; if (!P.stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  if (flag('alloc')) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 1024 }); }
  if (flag('prof')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const heap0 = await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(() => { window.__perf.on = true; });
  await page.waitForTimeout(Number(opt('secs', '5')) * 1000);
  await page.evaluate(() => { window.__perf.on = false; });
  const heap1 = await cdp.send('Runtime.getHeapUsage');
  const rt = await page.evaluate(() => {
    const P = window.__perf;
    return { frames: P.frames.map((f) => { const o = { ...f }; delete o._t; return o; }), raf: P.raf };
  });
  const nF = rt.frames.length;
  const keys = new Set(); rt.frames.forEach((f) => Object.keys(f).forEach((k) => keys.add(k)));
  const mod = {};
  for (const k of keys) if (k !== 'calls' && k !== 'tris') {
    const v = rt.frames.map((f) => f[k] ?? 0);
    mod[k] = { mean: r2(v.reduce((a, b) => a + b, 0) / nF), p95: r2(pct(v, 0.95)), max: r2(Math.max(...v)) };
  }
  const upd = rt.frames.map((f) => Object.entries(f).filter(([k]) => /^(demo|piece):/.test(k)).reduce((a, [, v]) => a + v, 0));
  out.realtime = {
    frames: nF, fps: r2(1000 / (rt.raf.reduce((a, b) => a + b, 0) / Math.max(1, rt.raf.length))),
    frameMs: { mean: r2(rt.raf.reduce((a, b) => a + b, 0) / Math.max(1, rt.raf.length)), p95: r2(pct(rt.raf, 0.95)), max: r2(Math.max(0, ...rt.raf)) },
    cpuMs: mod.total, updatersMs: { mean: r2(upd.reduce((a, b) => a + b, 0) / nF), p95: r2(pct(upd, 0.95)), max: r2(Math.max(...upd)) },
    split: Object.fromEntries(Object.entries(mod).filter(([k]) => k !== 'total').sort((a, b) => b[1].mean - a[1].mean).slice(0, 14).map(([k, v]) => [k, [v.mean, v.p95, v.max]])),
    heapGrowKB: Math.round((heap1.usedSize - heap0.usedSize) / 1024),
  };
  if (flag('prof')) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), dtSum = profile.timeDeltas.reduce((a, b) => a + b, 0) / 1000;
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const cnt = new Map(); for (const s of profile.samples) cnt.set(s, (cnt.get(s) ?? 0) + 1);
    const per = dtSum / profile.samples.length;
    for (const [id, c] of cnt) { const n = byId.get(id), cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + c * per); }
    out.prof = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, r2(v / nF)]);
    // inclusive (total) ms per frame by function name (each sample counts a name once)
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const incl = new Map();
    for (const [id, c] of cnt) {
      const seen = new Set();
      for (let x = id; x !== undefined; x = parent.get(x)) { const cf = byId.get(x).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + c * per); } }
    }
    out.profIncl = [...incl.entries()].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, r2(v / nF)]);
  }
  if (flag('alloc')) {
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const acc = new Map();
    const walk = (n) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; acc.set(k, (acc.get(k) ?? 0) + n.selfSize); for (const c of n.children ?? []) walk(c); };
    walk(profile.head);
    const tot = [...acc.values()].reduce((a, b) => a + b, 0);
    out.alloc = { kbPerFrame: r2(tot / 1024 / nF), top: [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, r2(v / 1024 / nF)]) };
  }
  // synced throughput: renderAt + readPixels back to back (the RAF loop keeps running in between: pause it by
  // overriding requestAnimationFrame for the burst)
  out.synced = await page.evaluate((n) => {
    const e = window.__demo.demo.engine, gl = e.renderer.getContext(), px = new Uint8Array(4), ms = [];
    let t = e.time;
    for (let k = 0; k < n; k++) { const a = performance.now(); t += 1 / 60; e.renderAt(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - a); }
    const s = [...ms].sort((x, y) => x - y);
    return { mean: Math.round(ms.reduce((a, b) => a + b, 0) / n * 100) / 100, p95: Math.round(s[Math.floor(0.95 * (n - 1))] * 100) / 100, max: Math.round(s[n - 1] * 100) / 100 };
  }, Number(opt('frames', '60')));
  // --ab N: synced bursts alternating window.__demo.rtopt(false / true) N times (the same page: no load-to-load noise)
  if (opt('ab', '')) {
    out.ab = await page.evaluate(async ([rounds, n]) => {
      const e = window.__demo.demo.engine, gl = e.renderer.getContext(), px = new Uint8Array(4), acc = { off: [], on: [] };
      let t = e.time;
      for (let r = 0; r < rounds; r++) for (const mode of ['off', 'on']) {
        window.__demo.rtopt?.(mode === 'on');
        for (let k = 0; k < 5; k++) { t += 1 / 60; e.renderAt(t); }     // settle
        for (let k = 0; k < n; k++) { const a = performance.now(); t += 1 / 60; e.renderAt(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); acc[mode].push(performance.now() - a); }
        await new Promise((res) => setTimeout(res, 50));
      }
      window.__demo.rtopt?.(true);
      const st = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), med: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(0.95 * (s.length - 1))].toFixed(2) }; };
      return { off: st(acc.off), on: st(acc.on) };
    }, [Number(opt('ab')), Number(opt('frames', '60'))]);
  }
  out.scene = await page.evaluate(() => {
    const e = window.__demo.demo.engine, i = e.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length, geometries: i.memory.geometries, textures: i.memory.textures, low: [e.lowW, e.lowH], loc: window.__demo.demo.player?.location };
  });
  // hitches: timed actions, worst RAF gap in the following 2 s
  if (opt('hitch', '')) {
    out.hitch = [];
    for (const act of opt('hitch', '').split(',').filter(Boolean)) {
      const [kind, arg] = act.split(':');
      const r = await page.evaluate(async ([kind, arg]) => {
        const d = window.__demo.demo, gaps = [], p0 = d.engine.renderer.info.programs.length;
        let last = performance.now(), stop = false;
        const tick = (now) => { gaps.push(now - last); last = now; if (!stop) requestAnimationFrame(tick); };
        requestAnimationFrame((n) => { last = n; requestAnimationFrame(tick); });
        await new Promise((r) => setTimeout(r, 300));
        const a = performance.now();
        if (kind === 'enter') d.store.set({ location: arg }, 'test');
        else if (kind === 'leave') d.store.set({ location: 'town' }, 'test');
        else if (kind === 'char') d.store.set({ character: arg }, 'test');
        else if (kind === 'yaw') d.store.set({ yaw: Number(arg) }, 'test');
        else if (kind === 'tod') d.store.set({ timeOfDay: Number(arg) }, 'test');
        await new Promise((r) => setTimeout(r, 2500));
        stop = true;
        const s = [...gaps].sort((x, y) => y - x);
        return { act: kind + (arg ? ':' + arg : ''), worst: s.slice(0, 3).map((v) => Math.round(v)), over33: gaps.filter((g) => g > 33.4).length, programs: [p0, d.engine.renderer.info.programs.length], ms: Math.round(performance.now() - a), loc: d.player?.location };
      }, [kind, arg]);
      out.hitch.push(r);
    }
  }
  if (opt('shot', '')) { fs.mkdirSync(path.dirname(opt('shot')), { recursive: true }); await page.evaluate(() => { const ui = document.getElementById('demo-ui'); if (ui) ui.style.visibility = 'hidden'; }); await page.screenshot({ path: opt('shot') }); out.shot = opt('shot'); }
  const errs = await page.evaluate(() => window.__demo.errors);
  if (errs.length) bad.push(...errs.map((e) => `[__demo] ${e}`));
} catch (e) { bad.push('PERF FAILED: ' + (e.stack || e.message)); }
out.errors = bad.slice(0, 20);
console.log(JSON.stringify(out, null, 1));
if (opt('json', '')) { fs.mkdirSync(path.dirname(opt('json')), { recursive: true }); fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1)); }
if (bad.length) code = 1;
await browser.close();
process.exit(code);
