// Scripted playtest of the demo (owner: deploy; extended by the demo lead; docs/DEMO.md §9 as a script). Runs on
// render-host via tools/remote.sh, headless Chromium on the 4090, REAL TIME. One session, real keyboard events, a recorder
// grabbing a frame every --every ms for the GIF:
//   1 boot            the loading screen (progress rises, labels change, it fades), the cinematic (?intro=1: forced on
//                     under automation) flies, Esc skips it: camera back at the spawn pose, panel back, player unmoved;
//                     noon, wanderer at the spawn
//   1b crates         walks straight through a walk-through prop (layout.js walkable: crates / barrels / pumpkins)
//   1c houses         enters 3 houses (walking INTO a door; the Travel panel's 'enter' button; the store's location),
//                     inside: the room, the time module's light pool aimed at the room, the town cut-away off, night
//                     scrub + the 'bed' (night visit) button; leaves by walking out / the 'leave' button; cut back on
//   2 doors           walks (W/A/S/D held, camera-relative, grid path around the cottages) to each door in --doors and
//                     checks __demo.info().nearDoor (house-14 is targeted at its PIECE door anchor, the real door)
//   3 roster          --chars N (default 5; 'all') offered characters, shipped AND work-in-progress ones (] key when
//                     bound, else the store), walks a few steps with each, checks no leftover model (scene children
//                     constant), programs grow at most once per new character; the panel groups Shipped / WIP
//   4 time            scrubs the clock noon -> night (00:00) in steps (screenshots), then a full 24 h at --day-speed game
//                     minutes / s, unrecorded: programs constant, frame gaps measured
//   5 phases          vote camera, 10 seats (2 dead, 1 ghost vote spent), nominee; V key through day -> night, bell (B)
//   5b ceremony       the scripted voting ceremony (time.playCeremony, its key when bound): day -> nomination -> vote ->
//                     execution -> night, seats filled, the nominee dies
//   6 controls        Q / E, C (camera modes), L (life), H (panel), cut-away auto / on / off
//   6b gameui         the game UI (gameui.js): point (right-click a townsperson / a spot), the pie (right-hold + hover
//                     + release = a pin; right-drag + dead zone = sticky + click), pins (F, dock swatch, click = remove,
//                     Clear my pins), the notebook (J, Notes typing = the quill, localStorage, Esc), both toggles
//                     (Notebook held / big, Pointer new / v2 size) from the panel, live; programs constant
//   6c touch          a phone (390 x 844 @2x, touch): the HUD below the folded panel, a tap on the toolbar notebook opens it, the
//                     notebook above the reader, the panel's notebook button folds the panel, long press = the touch pie
//                     (sticky, tap a wedge = a pin, no walking), a short tap still walks, the dock's touch hints
//   7 quality reload  store quality=low -> the page reloads; character / phase / clock / position must survive
// Exit 1 on any console / page / shader error, __demo.errors, a door not reached, a swap that fails, a key that did nothing.
//
//   tools/remote.sh node tools/demo-play.mjs [--out shots/demo-deploy/play] [--doors auto|house-9,house-14,...]
//        [--every 400] [--gif-fps 8] [--gif-scale 0.4] [--size 1280x720] [--q "..."] [--base http://<tailnet-ip>:8090]
//        [--skip loading,crates,houses,doors,roster,time,phases,ceremony,controls,gameui,touch,reload] [--day-speed 120] [--chars 5]
//        [--houses auto|house-3,house-9,house-12]
//   rsync -az render-host:pixel3d/shots/demo-deploy/play/ shots/demo-deploy/play/ --exclude frames/      # then LOOK at them
// Writes <out>/NN-<step>.png, <out>/play.gif (tools/sheet.py gif), <out>/sheet.png (contact sheet), <out>/play.json.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = opt('out', 'shots/demo-deploy/play');
const FRAMES = path.join(OUT, 'frames');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const BASE = opt('base', 'http://pixel3d.local');
const EVERY = Number(opt('every', '400'));
const SKIP = new Set(opt('skip', '').split(',').filter(Boolean));
const DAY_SPEED = Number(opt('day-speed', '120'));
const NCHARS = opt('chars', '5');
const DEBUG = args.includes('--debug');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const SHADER_RX = /WebGLProgram|Shader Error|shader error|program not valid|VALIDATE_STATUS|could not compile/i;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const bad = [], notes = [], report = { steps: {} };
const fail = (m) => { bad.push(m); console.log('   ! ' + m); };
const note = (m) => { notes.push(m); console.log('   - ' + m); };
page.on('console', (m) => { if (m.type() === 'error' || SHADER_RX.test(m.text())) bad.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
page.on('response', (r) => { if (r.status() >= 400) bad.push(`[http ${r.status()}] ${r.url()}`); });
if (BASE === 'http://pixel3d.local') {
  await page.route('http://pixel3d.local/**', (route) => {
    const u = new URL(route.request().url());
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
}

// ---------------------------------------------------------------------------------------------------------- helpers
const sleep = (ms) => page.waitForTimeout(ms);
const info = () => page.evaluate(() => {
  const d = window.__demo, i = d.info?.() ?? {}, e = window.__pixel?.info?.() ?? {}, dm = d.demo;
  return { state: i.state, fps: i.fps, character: i.character, player: i.player, nearDoor: i.nearDoor, tod: i.tod, hours: i.hours,
    cut: i.cut ? { on: i.cut.on, house: i.cut.house ?? null } : null, programs: e.programs, calls: e.calls,
    yaw: dm?.engine?.camera ? (dm.engine.camera.targetYaw ?? dm.engine.camera.yaw) : 0, children: dm?.engine?.scene?.children?.length ?? null,
    lifeVisible: dm?.town?.registry?.get?.('life')?.group?.visible ?? null, errors: d.errors?.length ?? 0 };
});
const sceneNames = () => page.evaluate(() => (window.__demo.demo?.engine?.scene?.children ?? []).map((o, i) => `${o.name || o.type}${o.visible ? '' : '(hidden)'}`));
const programNames = () => page.evaluate(() => (window.__demo.demo?.engine?.renderer?.info?.programs ?? []).map((p) => `${p.name || "?"}#${p.id} ${String(p.cacheKey).slice(0, 90)}`));
const diffNames = (a, b) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });
const setState = (patch) => page.evaluate((p) => window.__demo.set(p), patch);
const bindings = () => page.evaluate(() => window.__demo.demo?.input?.bindings?.() ?? []);
// the key bound for an action, found by its help text (owners may move keys; DEMO.md §6 lists the defaults)
let BINDS = [];
const keyFor = (rx, fallback = null) => BINDS.find((b) => rx.test(b.desc ?? ''))?.code ?? (BINDS.some((b) => b.code === fallback) ? fallback : null);
async function press(code) { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press(code); await sleep(120); }
async function hold(codes, ms) {
  await page.evaluate(() => document.activeElement?.blur?.());
  for (const c of codes) await page.keyboard.down(c);
  await sleep(ms);
  for (const c of codes) await page.keyboard.up(c);
}
let shotN = 0;
async function shot(name) {
  const f = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: f });
  return f;
}
// background recorder for the GIF
let recording = false, frameN = 0, recLoop = null;
function record(on) {
  recording = on;
  if (on && !recLoop) recLoop = (async () => {
    while (recording) {
      const t = Date.now();
      try { await page.screenshot({ path: path.join(FRAMES, `f${String(frameN++).padStart(4, '0')}.png`) }); } catch { /* page navigating */ }
      await new Promise((r) => setTimeout(r, Math.max(0, EVERY - (Date.now() - t))));
    }
    recLoop = null;
  })();
  return on ? Promise.resolve() : (recLoop ?? Promise.resolve());
}
// in-page frame-gap monitor (rAF intervals) for a named segment
const gapsStart = () => page.evaluate(() => {
  const g = (window.__deployGaps = { dts: [], on: true }); let prev = performance.now();
  const f = (now) => { g.dts.push(now - prev); prev = now; if (g.on) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const gapsStop = () => page.evaluate(() => {
  const g = window.__deployGaps; g.on = false; const s = g.dts.slice(1).sort((a, b) => a - b);
  return { n: s.length, medianMs: +(s[s.length >> 1] ?? 0).toFixed(1), maxMs: +(s[s.length - 1] ?? 0).toFixed(1), over50: s.filter((d) => d > 50).length };
});
/** The cinematic (src/demo/intro.js) under ?intro=1: wait for its flight, then Esc. Returns what happened. */
async function skipIntro({ shotName = null, flyMs = 2500 } = {}) {
  const ph = () => page.evaluate(() => window.__demo.demo?.intro?.phase ?? null);
  let p = await ph();
  if (!p || p === 'done') return { phase: p };
  for (let k = 0; k < 150 && p === 'warm'; k++) { await sleep(100); p = await ph(); }
  if (p !== 'fly' && p !== 'title') return { phase: p, error: `intro stuck in '${p}'` };
  await sleep(flyMs);
  const mid = await page.evaluate(() => { const c = window.__demo.demo.engine.camera; return { yaw: +(c.yaw * 180 / Math.PI).toFixed(1), vh: c.viewHeight, target: [+c.target.x.toFixed(2), +c.target.z.toFixed(2)], introCls: document.body.classList.contains('ct-intro') }; });
  if (shotName) await shot(shotName);
  await page.keyboard.press('Escape');
  await sleep(700);
  const after = await page.evaluate(() => {
    const d = window.__demo.demo, c = d.engine.camera, ld = document.getElementById('demo-loading');
    return { phase: d.intro?.phase ?? null, yaw: +(c.yaw * 180 / Math.PI).toFixed(1), target: [+c.target.x.toFixed(2), +c.target.z.toFixed(2)], vh: c.viewHeight,
      introCls: document.body.classList.contains('ct-intro'), loadingShown: !!ld && getComputedStyle(ld).display !== 'none' && +getComputedStyle(ld).opacity > 0.05,
      programs: d.intro?.info?.programs ?? null, maxGapMs: d.intro?.info?.maxGapMs ?? null };
  });
  return { phase: p, mid, after };
}
async function waitReady() {
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
  const e = await page.evaluate(() => window.__demo.errors ?? []);
  if (e.length) throw new Error('boot errors: ' + e.join(' | '));
}

// ---- walking: grid path (layout.blocked, 1 tile = 1 m, 8-neighbour, no corner cutting) + camera-relative key steering
async function townGrid() {
  return page.evaluate(async () => {
    const L = window.__demo.demo.layout;
    const api = await import(new URL('src/demo/api.js', location.href).href);
    const W = L.TOWN_W, H = L.TOWN_H, g = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.push(L.blocked(x, y) ? 1 : 0);
    const doors = {};
    // approach tiles per door from the GAME's own collision (player.townCollision, collision.js: the SDF of the placed
    // cottages minus their carved door corridors): a free tile within 1.6 m whose centre has a collision-free straight
    // line to the doorstep (0.75 m out along the door normal). The 1 m layout grid alone can close the last tile in
    // front of a door (house-7: its footprint fills the whole x = 39 column, the nearest free tile is 1.02 m away)
    // although the real player walks in fine; the final leg is then checked against the real collision instead.
    const col = window.__demo.demo.player?.townCollision ?? null;
    for (const h of L.houses) {
      const d = api.doorOf(window.__demo.demo.town.registry, h.id);
      if (!d) continue;
      const normal = d.normal ?? h.doorNormal ?? [0, 1], nl = Math.hypot(normal[0], normal[1]) || 1;
      const step = { x: d.pos.x + normal[0] / nl * 0.75, z: d.pos.z + normal[1] / nl * 0.75 };
      const approach = [];
      if (col?.lineFree) {
        for (let y = Math.floor(d.pos.z - 2); y <= Math.floor(d.pos.z + 2); y++) for (let x = Math.floor(d.pos.x - 2); x <= Math.floor(d.pos.x + 2); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || g[y * W + x]) continue;
          const c = { x: x + 0.5, z: y + 0.5 };
          if (Math.hypot(c.x - d.pos.x, c.z - d.pos.z) < 1.6 && col.free(c.x, c.z) && col.lineFree(c, step)) approach.push(y * W + x);
        }
      }
      doors[h.id] = { x: d.pos.x, z: d.pos.z, anchor: !!d.anchor, layout: h.doorPoint ?? null, normal, approach, stepFree: col ? col.free(step.x, step.z) : null };
    }
    return { W, H, g, doors };
  });
}
function findPath(grid, from, goalTest) {
  const { W, H, g } = grid, free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !g[y * W + x];
  const s = [Math.floor(from.x), Math.floor(from.z)];
  const prev = new Map([[s[1] * W + s[0], -1]]), q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    if (goalTest(x, y)) {
      const out = []; let k = y * W + x;
      while (k !== -1) { out.unshift({ x: (k % W) + 0.5, z: Math.floor(k / W) + 0.5 }); k = prev.get(k); }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (!free(nx, ny) || prev.has(k)) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
      prev.set(k, y * W + x); q.push([nx, ny]);
    }
  }
  return null;
}
function simplify(pts) {   // drop points on a straight run (same step direction)
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (Math.sign(b.x - a.x) !== Math.sign(c.x - b.x) || Math.sign(b.z - a.z) !== Math.sign(c.z - b.z)) out.push(b);
  }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}
// keys for a world direction, relative to the camera (api.js cameraAxes: fwd = (-sin, -cos), right = (cos, -sin))
function keysFor(dx, dz, yaw) {
  const f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  const k = [], t = Math.tan(Math.PI / 8) * Math.hypot(f, r);   // 8 sectors
  if (f > t) k.push('KeyW'); else if (f < -t) k.push('KeyS');
  if (r > t) k.push('KeyD'); else if (r < -t) k.push('KeyA');
  return k;
}
async function steerTo(target, { tol = 0.22, timeout = null } = {}) {
  const t0 = Date.now();
  if (timeout === null) { const p = (await info()).player; timeout = 3000 + Math.hypot(target.x - p[0], target.z - p[1]) / 0.8 * 1000; }   // >= 0.8 m/s
  let held = [], lastP = null, lastMove = Date.now();
  const setKeys = async (k) => {
    for (const c of held) if (!k.includes(c)) await page.keyboard.up(c);
    for (const c of k) if (!held.includes(c)) await page.keyboard.down(c);
    held = k;
  };
  try {
    while (Date.now() - t0 < timeout) {
      const i = await info();
      const [x, z] = i.player;
      const dx = target.x - x, dz = target.z - z;
      if (Math.hypot(dx, dz) < tol) return true;
      if (lastP && Math.hypot(x - lastP[0], z - lastP[1]) > 0.02) lastMove = Date.now();
      if (Date.now() - lastMove > 1500) { if (DEBUG) console.log(`     stuck at ${x},${z} -> ${target.x},${target.z} keys ${held} yaw ${i.yaw}`); return false; }   // stuck
      lastP = [x, z];
      await setKeys(keysFor(dx, dz, i.yaw));
      await sleep(Math.hypot(dx, dz) < 0.5 ? 25 : 60);
    }
    if (DEBUG) console.log(`     timeout -> ${target.x},${target.z}`);
    return false;
  } finally { await setKeys([]); }
}
async function walkToDoor(grid, id) {
  const d = grid.doors[id];
  if (!d) { fail(`doors: no door for ${id}`); return null; }
  const start = await info();
  const from = { x: start.player[0], z: start.player[1] };
  // a tile whose nearest point is within 0.95 m of the door (the trigger radius is 1.4 m; the last step walks into the
  // doorstep until collision stops it). house-14's real door sits in a corner the layout's collision mostly blocks.
  // or a tile from which the game's own collision has a free straight line to the doorstep (townGrid: d.approach)
  const appr = new Set(d.approach ?? []);
  const near = (x, y) => Math.hypot(Math.max(x - d.x, 0, d.x - x - 1), Math.max(y - d.z, 0, d.z - y - 1)) < 0.95 || appr.has(y * grid.W + x);
  const t0 = Date.now();
  let ok = false, legs = 0, replans = 0, p = null;
  // walk tile centre to tile centre (the first waypoint is the start tile's centre: a straight run from an off-centre
  // start clips corners); when the player gets stuck (finer collision than the tile grid), re-plan from where it stands
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    // (perf fleet) a leg toward the start tile's centre can push the player into the door it just stepped back from
    // (house-10's diagonal toe door): come back out and re-plan from the doorstep instead of failing every later step
    if (attempt) {
      await sleep(900);
      const loc = await page.evaluate(() => window.__demo.demo?.player?.location ?? 'town');
      if (loc !== 'town') { note(`doors: on the way to ${id} the player went into ${loc}: leaving, re-planning`); await setState({ location: 'town' }); await sleep(1800); }
    }
    const at = attempt ? { x: (await info()).player[0], z: (await info()).player[1] } : from;
    p = findPath(grid, at, near);
    if (!p) break;
    const pts = simplify(p);
    if (DEBUG) console.log(`     path ${id}: ${pts.map((q) => `${q.x},${q.z}`).join(' ')}`);
    ok = true;
    for (const wp of pts) { legs++; if (!(await steerTo(wp))) { ok = false; replans++; break; } }
  }
  if (!p) {
    const wh = await page.evaluate(() => ({ p: window.__demo.info?.().player, loc: window.__demo.demo?.player?.location, tr: window.__demo.demo?.player?.transition ?? null }));
    fail(`doors: no walkable path to ${id} door (${d.x.toFixed(2)}, ${d.z.toFixed(2)}) from ${JSON.stringify(wh)}`); return null;
  }
  // the last step onto the doorstep, 0.75 m in front of the door: walking ON into the door would go in (player.js
  // enters a cottage when pushed into its doorway; step 1c tests that)
  if (ok) { const n = d.normal, l = Math.hypot(n[0], n[1]) || 1; await steerTo({ x: d.x + n[0] / l * 0.75, z: d.z + n[1] / l * 0.75 }, { tol: 0.3, timeout: 2500 }); }
  await sleep(500);
  const end = await info();
  const r = { id, door: [+d.x.toFixed(2), +d.z.toFixed(2)], anchor: d.anchor, from: start.player.slice(0, 2), to: end.player.slice(0, 2),
    tiles: p.length, legs, replans, walkedMs: Date.now() - t0, pathOk: ok, nearDoor: end.nearDoor, cut: end.cut,
    dist: +Math.hypot(end.player[0] - d.x, end.player[1] - d.z).toFixed(2) };
  r.shot = await shot(`door-${id}`);
  // step back off the doorstep (1.6 m out): the next leg's first waypoint (this tile's centre) can lie toward the
  // door, and walking into a door goes in
  { const n = d.normal, l = Math.hypot(n[0], n[1]) || 1; await steerTo({ x: d.x + n[0] / l * 1.6, z: d.z + n[1] / l * 1.6 }, { tol: 0.3, timeout: 2000 }); }
  // (perf fleet) the step back off a diagonal door (house-10's toe chamfer, normal SE) sometimes went IN: every later
  // step then ran inside the room (no path to the next door, cut-away off, the reload kept `in=`). Report it and walk
  // back out, so one flaky step-back does not fail the rest of the playtest.
  { await sleep(1200);   // an entry fades out first (location changes at black)
    const loc = await page.evaluate(() => window.__demo.demo?.player?.location ?? 'town');
    if (loc && loc !== 'town') {
      note(`doors: stepping back from ${id} went into ${loc}: leaving`);
      r.wentIn = loc;
      await setState({ location: 'town' }); await sleep(1800);
      const n = d.normal, l = Math.hypot(n[0], n[1]) || 1;
      await steerTo({ x: d.x + n[0] / l * 1.6, z: d.z + n[1] / l * 1.6 }, { tol: 0.3, timeout: 2000 });
    } }
  return r;
}

// ---------------------------------------------------------------------------------------------------------- run
const t00 = Date.now();
try {
  console.log('1 boot');
  const q = new URLSearchParams(opt('q', ''));
  if (!q.has('tod')) q.set('tod', 'noon');
  if (!SKIP.has('loading') && !q.has('intro')) q.set('intro', '1');    // the cinematic is off under automation by default
  await page.goto(`${BASE}/demo.html?${q}`);
  // the loading screen: sample its bar / label while the town builds (the build blocks the page between pieces, so the
  // samples are sparse; the label must change and the bar must rise)
  const ldSamples = [];
  if (!SKIP.has('loading')) {
    for (let k = 0; k < 400; k++) {
      const smp = await page.evaluate(async () => {
        const m = await import(new URL('src/demo/loading.js', location.href).href).catch(() => null);
        const el = document.getElementById('demo-loading');
        return { t: Math.round(performance.now()), value: m?.loading?.value ?? null, label: m?.loading?.label ?? null, done: m?.loading?.done ?? null,
          shown: !!el && getComputedStyle(el).display !== 'none', ready: !!window.__demo?.ready, err: window.__demo?.errors?.length ?? 0 };
      }).catch(() => null);
      if (smp) ldSamples.push(smp);
      if (smp && (smp.ready || smp.err)) break;
      await sleep(80);
    }
  }
  await waitReady();
  report.steps.boot = { readyMs: Date.now() - t00, ...(await info()) };
  delete report.steps.boot.state;
  console.log(`   ready after ${report.steps.boot.readyMs} ms, ${report.steps.boot.character} @ ${report.steps.boot.player}, programs ${report.steps.boot.programs}`);
  if (!SKIP.has('loading')) {
    const labels = [...new Set(ldSamples.map((x) => x.label).filter(Boolean))];
    const vals = ldSamples.map((x) => x.value).filter((v) => typeof v === 'number');
    const rising = vals.every((v, i) => !i || v >= vals[i - 1] - 1e-9);
    report.steps.loading = { samples: ldSamples.length, labels, first: vals[0], last: vals[vals.length - 1], rising, shownAtStart: ldSamples[0]?.shown ?? null };
    console.log(`   loading: ${ldSamples.length} samples, bar ${vals[0]?.toFixed?.(2)} -> ${vals[vals.length - 1]?.toFixed?.(2)}, labels: ${labels.join(' | ')}`);
    if (!ldSamples.length || !ldSamples[0].shown) fail('loading: the loading screen was not up at the start');
    if (labels.length < 2) fail(`loading: the label never changed (${labels.join(' | ')})`);
    if (!rising) fail('loading: the bar moved backwards');
    if (!(vals[vals.length - 1] > 0.5)) fail(`loading: the bar only reached ${vals[vals.length - 1]}`);
    const p0 = (await info()).player;
    const it = await skipIntro({ shotName: 'intro-fly' });
    report.steps.intro = it;
    console.log(`   intro: ${JSON.stringify(it)}`);
    if (it.error) fail(`intro: ${it.error}`);
    else if (!it.phase) fail('intro: no cinematic (demo.intro missing) with ?intro=1');
    else {
      if (it.after.phase !== 'done') fail(`intro: Esc did not skip (phase ${it.after.phase})`);
      if (it.after.introCls) fail('intro: body.ct-intro still set after the skip (panel hidden)');
      if (it.after.loadingShown) fail('intro: the loading screen is still up after the skip');
      if (Math.abs(it.after.yaw) > 0.5) fail(`intro: camera yaw ${it.after.yaw} deg after the skip (want 0)`);
      if (Math.abs(it.after.vh - 12) > 0.01) fail(`intro: viewHeight ${it.after.vh} after the skip (want 12)`);
      const p1 = (await info()).player;
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.05) fail(`intro: the player moved during the intro / skip (${p0} -> ${p1})`);
      if (Math.hypot(it.after.target[0] - p1[0], it.after.target[1] - p1[1]) > 0.6) fail(`intro: the camera is not on the player after the skip (${it.after.target} vs ${p1})`);
    }
  }
  await sleep(1500);
  await setState({ timeSpeed: 0 });   // the clock stands while walking (screenshots comparable); step 4 runs it
  await shot('boot');
  BINDS = await bindings();
  const keys = new Set(BINDS.map((b) => b.code));
  report.bindings = BINDS.map((b) => `${b.code}: ${b.desc}`);
  await record(true);

  // ---------------------------------------------------------------------------------------------- 1b crates
  if (!SKIP.has('crates')) {
    console.log('1b crates (walk-through props)');
    // a walk-through prop with free ground 1.3 m either side (an axis-aligned line through its centre)
    const plan = await page.evaluate(async () => {
      const d = window.__demo.demo, L = d.layout, col = d.player.collision;
      const cm = await import(new URL('src/demo/collision.js', location.href).href);
      const out = [];
      for (const o of L.objects) {
        if (!cm.walkable(o)) continue;
        const c = o.center ?? { x: o.rect.x + o.rect.w / 2, z: o.rect.z + o.rect.d / 2 };
        for (const [ax, az] of [[1, 0], [0, 1]]) {
          const a = { x: c.x - ax * 1.3, z: c.z - az * 1.3 }, b = { x: c.x + ax * 1.3, z: c.z + az * 1.3 };
          if (col.lineFree(a, b)) out.push({ kind: o.kind, c: [c.x, c.z], a, b, rect: o.rect });
        }
      }
      return out;
    });
    const kinds = [...new Set(plan.map((p) => p.kind))];
    note(`walk-through props with a clear line across: ${plan.length} (${kinds.join(', ')})`);
    const pick = [plan.find((p) => p.kind === 'crates'), plan.find((p) => p.kind !== 'crates')].filter(Boolean);
    if (!pick.length) fail('crates: no walk-through prop with free ground on both sides');
    report.steps.crates = [];
    for (const pp of pick) {
      await page.evaluate(({ a }) => window.__demo.demo.player.teleport(a.x, a.z, null, { exact: true }), pp);
      await sleep(400);
      const ok = await steerTo(pp.b, { tol: 0.25, timeout: 6000 });
      const end = (await info()).player;
      const r = { kind: pp.kind, at: pp.c, from: [pp.a.x, pp.a.z], to: end.slice(0, 2), reached: ok };
      r.shot = await shot(`through-${pp.kind}`);
      report.steps.crates.push(r);
      console.log(`   ${ok ? 'ok ' : 'BAD'} walked through ${pp.kind} at ${pp.c.map((v) => v.toFixed(1))}: ${r.from.map((v) => v.toFixed(2))} -> ${r.to}`);
      if (!ok) fail(`crates: could not walk through the ${pp.kind} at ${pp.c} (stopped at ${end.slice(0, 2)})`);
    }
    await page.evaluate(() => window.__demo.demo.player.goTo('spawn'));
    await sleep(500);
  }

  // ---------------------------------------------------------------------------------------------- 1c houses
  if (!SKIP.has('houses')) {
    console.log('1c houses');
    report.steps.houses = [];
    const grid = await townGrid();
    const loc = () => page.evaluate(() => ({ store: window.__demo.demo.store.state.location, player: window.__demo.demo.player.location,
      room: window.__demo.demo.player.interior ? { id: window.__demo.demo.player.interior.id, name: window.__demo.demo.player.interior.name, stub: !!window.__demo.demo.player.interior.stub,
        out: window.__demo.demo.player.interior.out, exit: window.__demo.demo.player.interior.exit, visit: window.__demo.demo.player.interior.visitPoint ?? null } : null,
      transition: window.__demo.demo.player.transition, timeRoom: window.__demo.demo.time?.info?.room ?? null, cut: window.__demo.demo.cut?.info ? { ...window.__demo.demo.cut.info } : null,
      lit: window.__demo.demo.time?.info?.lit ?? null }));
    const waitLoc = async (want, ms = 8000) => { let l; const t0 = Date.now(); do { l = await loc(); if (l.player === want && !l.transition) return l; await sleep(100); } while (Date.now() - t0 < ms); return l; };
    // leaving on foot: click-walk back to the room's spawn (just inside the door), then hold the camera-relative keys
    // for the way out; the keys are released the moment the fade starts (held on, they would walk off the doorstep)
    const pushOut = async () => {
      let l = await loc();
      await page.evaluate(() => { const P = window.__demo.demo.player, r = P.interior; P.walkTo(r.spawn.x, r.spawn.z); });
      const sp = await page.evaluate(() => { const r = window.__demo.demo.player.interior; return { x: r.spawn.x, z: r.spawn.z }; });
      for (let k = 0; k < 60; k++) { await sleep(100); const p = (await info()).player; if (Math.hypot(p[0] - sp.x, p[1] - sp.z) < 0.15) break; }
      l = await loc();
      if (l.player === 'town') return waitLoc('town', 6000);
      const yaw = (await info()).yaw, k = keysFor(l.room.out[0], l.room.out[1], yaw);
      await page.evaluate(() => document.activeElement?.blur?.());
      for (const c of k) await page.keyboard.down(c);
      const t0 = Date.now();
      try { while (Date.now() - t0 < 3000) { const q = await loc(); if (q.transition || q.player === 'town') break; await sleep(40); } }
      finally { for (const c of k) await page.keyboard.up(c); }
      return waitLoc('town', 6000);
    };
    let ids = opt('houses', 'auto');
    if (ids === 'auto') {
      // 1: the door nearest the spawn by path (walked into), 2: house-9 (the moved low-centre clockworks; the panel),
      // 3: house-12 (the store's location key)
      const sp = (await info()).player;
      const near = Object.keys(grid.doors).filter((k) => k !== 'house-9' && k !== 'house-12' && k !== 'house-14')
        .sort((a, b) => Math.hypot(grid.doors[a].x - sp[0], grid.doors[a].z - sp[1]) - Math.hypot(grid.doors[b].x - sp[0], grid.doors[b].z - sp[1]))[0];
      ids = [near, 'house-9', 'house-12'];
    } else ids = ids.split(',');
    const progs0 = (await info()).programs;
    for (const [n, id] of ids.entries()) {
      const how = ['walk', 'panel', 'store'][n % 3];
      const r = { id, how };
      const t0 = Date.now();
      if (how === 'walk') {
        const w = await walkToDoor(grid, id);
        r.door = w ? { dist: w.dist, nearDoor: w.nearDoor } : null;
        const d = grid.doors[id];
        const n2 = await page.evaluate((hid) => { const x = window.__demo.demo.player.nearDoor; return x && x.id === hid ? x.normal : null; }, id);
        const l0 = await loc();
        if (l0.transition || l0.player === id) note(`${id}: the last step onto the doorstep already walked in`);
        else if (!n2) fail(`houses: not at ${id}'s door after walking there`);
        else if (n2) {   // push into the doorway; keys up as soon as the fade starts
          const k = keysFor(-n2[0], -n2[1], (await info()).yaw);
          await page.evaluate(() => document.activeElement?.blur?.());
          for (const c of k) await page.keyboard.down(c);
          const tp = Date.now();
          try { while (Date.now() - tp < 2500) { const q = await loc(); if (q.transition || q.player !== 'town') break; await sleep(40); } }
          finally { for (const c of k) await page.keyboard.up(c); }
        }
        void d;
      } else if (how === 'panel') {
        await page.evaluate(() => { const d = document.querySelector('details[data-sec="travel"]'); if (d) d.open = true; });
        await sleep(200);
        await page.selectOption('details[data-sec="travel"] select', id).catch((e) => fail(`houses: travel select: ${e.message}`));
        await page.evaluate(() => document.activeElement?.blur?.());
        await sleep(300);   // the select's change event travels to the door ('go'); then 'enter'
        await page.click('details[data-sec="travel"] button:has-text("enter")');
      } else {
        await setState({ location: id });
      }
      let l = await waitLoc(id, 9000);
      r.enterMs = Date.now() - t0;
      r.inside = l.player === id && l.store === id;
      r.room = l.room; r.timeRoom = l.timeRoom; r.cutInside = l.cut;
      await sleep(900);
      r.shot = await shot(`in-${id}-noon`);
      console.log(`   ${r.inside ? 'ok ' : 'BAD'} ${id} (${how}): location ${l.player} / store ${l.store} in ${r.enterMs} ms, room ${l.room?.name}${l.room?.stub ? ' (STUB)' : ''}, ` +
        `time lights ${JSON.stringify(l.timeRoom)}, cut ${JSON.stringify(l.cut)}`);
      if (!r.inside) { fail(`houses: ${how} did not get into ${id} (player ${l.player}, store ${l.store})`); report.steps.houses.push(r); continue; }
      if (l.room?.stub) fail(`houses: ${id} fell back to the stub room (the kit failed?)`);
      if (!l.timeRoom || l.timeRoom.id !== id || !(l.timeRoom.lights > 0)) fail(`houses: the time module's lights are not aimed at ${id}'s room (${JSON.stringify(l.timeRoom)})`);
      if (l.cut?.on) fail(`houses: the town cut-away is still on inside ${id}`);
      // walk a little inside (W then S), at night: the bed / night visit point, lights
      await hold(['KeyW'], 500); await hold(['KeyS'], 300);
      if (n === 0) {
        await setState({ timeOfDay: 23, timeSpeed: 0 });
        await sleep(800);
        await page.evaluate(() => { const d = document.querySelector('details[data-sec="travel"]'); if (d) d.open = true; });
        await page.click('details[data-sec="travel"] button:has-text("bed")');
        const v = l.room.visit;
        let dv = null;
        for (let k = 0; k < 60; k++) { await sleep(100); const p = (await info()).player; dv = v ? Math.hypot(p[0] - v.x, p[1] - v.z) : null; if (dv !== null && dv < 0.35) break; }
        r.visit = { point: v, dist: dv === null ? null : +dv.toFixed(2) };
        l = await loc(); r.nightLit = l.lit;
        r.shotNight = await shot(`in-${id}-night-bed`);
        console.log(`   night: walked to the bedside (${r.visit.dist} m from the visit point), lights lit ${l.lit}`);
        if (!v) fail(`houses: ${id} has no visitPoint`); else if (!(dv < 0.6)) fail(`houses: the 'bed' button did not walk to ${id}'s visit point (${dv} m)`);
        if (!(l.lit > 0)) fail(`houses: no point light lit inside ${id} at night`);
        await setState({ timeOfDay: 12.5 });
        await sleep(400);
      }
      // leave: walk out (1st, 3rd), the panel's 'leave' (2nd)
      if (how === 'panel') { await page.click('details[data-sec="travel"] button:has-text("leave")'); l = await waitLoc('town', 6000); }
      else l = await pushOut();
      await sleep(700);
      const after = await info();
      r.left = l.player === 'town' && l.store === 'town';
      r.outAt = after.player.slice(0, 2); r.cutAfter = after.cut;
      r.shotOut = await shot(`out-${id}`);
      console.log(`   ${r.left ? 'ok ' : 'BAD'} left ${id}: at ${r.outAt}, nearDoor ${after.nearDoor}, cut ${JSON.stringify(after.cut)}`);
      if (!r.left) fail(`houses: could not leave ${id} (${how === 'panel' ? 'leave button' : 'walking out'})`);
      else {
        if (after.nearDoor !== id) fail(`houses: left ${id} but not at its door (nearDoor ${after.nearDoor}, at ${r.outAt})`);
        if (after.state.cutaway === 'auto' && !after.cut?.on) fail(`houses: the town cut-away did not come back after leaving ${id}`);
      }
      report.steps.houses.push(r);
      await page.evaluate(() => window.__demo.demo.player.goTo('spawn'));
      await sleep(400);
    }
    // the room programs compile once per house (behind the fade); a second visit of the first house compiles nothing
    const p1 = (await info()).programs;
    await setState({ location: ids[0] }); await waitLoc(ids[0], 9000); await sleep(600);
    await setState({ location: 'town' }); await waitLoc('town', 6000); await sleep(600);
    const p2 = (await info()).programs;
    report.steps.housesPrograms = [progs0, p1, p2];
    console.log(`   programs: before ${progs0}, after 3 houses ${p1}, after re-visiting ${ids[0]} ${p2}`);
    if (p2 > p1) fail(`houses: re-visiting ${ids[0]} compiled ${p2 - p1} new programs`);
    await page.evaluate(() => window.__demo.demo.player.goTo('spawn'));
    await sleep(500);
  }

  // ---------------------------------------------------------------------------------------------- 2 doors
  if (!SKIP.has('doors')) {
    console.log('2 doors');
    const grid = await townGrid();
    let ids = opt('doors', 'auto');
    if (ids === 'auto') {   // the 3 doors nearest the spawn by path order (greedy), then house-14 (the anchor-vs-layout case)
      const sp = (await info()).player, left = Object.keys(grid.doors).filter((k) => k !== 'house-14');
      const pick = []; let at = { x: sp[0], z: sp[1] };
      for (let n = 0; n < 3; n++) {
        left.sort((a, b) => Math.hypot(grid.doors[a].x - at.x, grid.doors[a].z - at.z) - Math.hypot(grid.doors[b].x - at.x, grid.doors[b].z - at.z));
        const k = left.shift(); pick.push(k); at = grid.doors[k];
      }
      ids = [...pick, 'house-14'];
    } else ids = ids.split(',');
    report.steps.doors = [];
    for (const id of ids) {
      const r = await walkToDoor(grid, id);
      if (!r) continue;
      let lc = null;
      for (let k = 0; k < 30; k++) { lc = await page.evaluate(() => (window.__demo.demo.player.transition ? 'transition' : window.__demo.demo.player.location)); if (lc !== 'transition') break; await sleep(100); }
      if (lc !== 'town') { fail(`doors: walking to ${id}'s doorstep went into ${lc}`); await page.evaluate(() => window.__demo.demo.player.leave({ instant: true })); await sleep(300); }
      report.steps.doors.push(r);
      const okDoor = r.nearDoor === id;
      console.log(`   ${okDoor ? 'ok ' : 'BAD'} ${id}: door (${r.door}) ${r.anchor ? 'piece anchor' : 'layout'}; walked ${r.from} -> ${r.to} in ${r.walkedMs} ms ` +
        `(${r.tiles} tiles), ${r.dist} m from the door, nearDoor=${r.nearDoor}, cut house=${r.cut?.house}`);
      if (!r.pathOk) fail(`doors: got stuck walking to ${id} (at ${r.to})`);
      if (!okDoor) fail(`doors: at ${id}'s door (${r.dist} m) but nearDoor = ${r.nearDoor}`);
      // DEMO.md §4.6 / §9.2: the cottage whose door the player stands at is cut away (the character stays visible)
      if (okDoor && r.cut && r.cut.house !== id) fail(`cut-away: standing at ${id}'s door, the cut controller protects ${r.cut.house} (character hidden behind ${id}?)`);
    }
  }

  // ---------------------------------------------------------------------------------------------- 3 roster
  if (!SKIP.has('roster')) {
    console.log('3 roster');
    await steerTo({ x: 22.5, z: 25.5 }, { timeout: 4000 }).catch(() => {});
    const roster = await page.evaluate(() => (window.__demo.demo?.characters ?? []).map((c) => ({ id: c.id, complete: !!c.complete })));
    const offered = roster.filter((c) => c.complete);
    let ids = offered.map((c) => c.id);
    if (NCHARS !== 'all') {
      // N characters: the player's own, then alternately shipped / work in progress (both kinds get exercised)
      const st = await page.evaluate(() => Object.fromEntries((window.__demo.demo?.characters ?? []).map((c) => [c.id, c.status ?? null])));
      const sh = ids.filter((i) => st[i] !== 'wip'), wip = ids.filter((i) => st[i] === 'wip');
      const cur = (await info()).character, pick = [cur];
      for (let k = 0; pick.length < Number(NCHARS) && (k < sh.length || k < wip.length); k++) {
        for (const a of [sh[k], wip[k * 3]]) if (a && !pick.includes(a) && pick.length < Number(NCHARS)) pick.push(a);
      }
      ids = pick;
    }
    note(`offered characters: ${offered.length} of ${roster.length} listed; switching through ${ids.join(', ')}`);
    // the Character panel: Shipped / Work in progress headers, portraits, WIP labels
    const panelInfo = await page.evaluate(() => ({ groups: [...document.querySelectorAll('.dui-char-grp')].map((e) => e.textContent),
      buttons: document.querySelectorAll('.dui-char').length, thumbs: document.querySelectorAll('.dui-char img').length,
      wip: document.querySelectorAll('.dui-char[data-status="wip"]').length }));
    report.steps.rosterPanel = panelInfo;
    console.log(`   panel: ${panelInfo.buttons} characters, ${panelInfo.thumbs} portraits, ${panelInfo.wip} WIP, groups ${JSON.stringify(panelInfo.groups)}`);
    if (panelInfo.buttons !== offered.length) fail(`roster: the panel lists ${panelInfo.buttons} characters, ${offered.length} are offered`);
    if (panelInfo.wip && panelInfo.groups.length < 2) fail('roster: WIP characters but no Shipped / Work in progress group headers');
    const nextKey = keyFor(/next character/i, 'BracketRight'), useKey = !!nextKey;
    note(useKey ? `next character: ${nextKey}` : 'no "next character" key bound yet: switching through the store (source test)');
    const base = await info();
    const baseNames = await sceneNames();
    if (DEBUG) console.log('     scene: ' + baseNames.join(', '));
    report.steps.roster = [];
    let progs = base.programs;
    const order = NCHARS === 'all' ? [...ids.slice(ids.indexOf(base.character) + 1), ...ids.slice(0, ids.indexOf(base.character) + 1)] : [...ids.slice(1), ids[0]];
    for (const id of order) {
      const t0 = Date.now();
      if (useKey && NCHARS === 'all') await press(nextKey); else await setState({ character: id });
      let i;
      for (let k = 0; k < 100; k++) { i = await info(); if (i.character === id) break; await sleep(100); }
      const swapMs = Date.now() - t0;
      if (i.character !== id) { fail(`roster: ${useKey && NCHARS === 'all' ? '] gave' : 'store gave'} ${i.character}, expected ${id} after ${swapMs} ms`); if (useKey) await setState({ character: id }); continue; }
      const p0 = i.player;
      await hold(['KeyD'], 700); await hold(['KeyA'], 700);   // walking with the new character
      await sleep(250);
      const j = await info();
      const r = { id, swapMs, programs: j.programs, children: j.children, moved: +Math.hypot(j.player[0] - p0[0], j.player[1] - p0[1]).toFixed(2), fps: j.fps };
      r.shot = await shot(`char-${id}`);
      report.steps.roster.push(r);
      console.log(`   ${id}: swap ${swapMs} ms, programs ${progs} -> ${j.programs}, scene children ${j.children}, fps ${j.fps}`);
      // scene children vary with the character (the shipped four add scene-level 'smears' / 'char-fx' holders, the cast
      // members none): the leftover test counts character models (constant: player + NPCs) and their FX holders
      const names = await sceneNames(), nChar = (l) => l.filter((x) => x.startsWith('character:')).length, nFx = (l) => l.filter((x) => /^(smears|char-fx)/.test(x)).length;
      if (nChar(names) !== nChar(baseNames) || nFx(names) > 2 * nChar(names) || names.filter((x) => x === `character:${id}`).length !== 1) {
        fail(`roster: character models ${nChar(baseNames)} -> ${nChar(names)} (fx holders ${nFx(names)}) after ${id} ` +
          `added ${JSON.stringify(names.filter((x) => !baseNames.includes(x)))} removed ${JSON.stringify(baseNames.filter((x) => !names.includes(x)))}`);
      }
      if (j.programs - progs > 6) fail(`roster: programs jumped ${progs} -> ${j.programs} on ${id}`);
      progs = j.programs;
      if (j.character !== id) fail(`roster: character changed to ${j.character} while walking as ${id}`);
    }
    // a second lap must compile nothing new
    const lap0 = (await info()).programs;
    for (const id of order) { await setState({ character: id }); for (let k = 0; k < 60; k++) { if ((await info()).character === id) break; await sleep(100); } }
    const lap1 = (await info()).programs;
    report.steps.rosterLap2 = { programs: [lap0, lap1] };
    console.log(`   second lap: programs ${lap0} -> ${lap1}`);
    if (lap1 > lap0) fail(`roster: a second lap through the roster compiled ${lap1 - lap0} new programs`);
  }

  // ---------------------------------------------------------------------------------------------- 4 time
  if (!SKIP.has('time')) {
    console.log('4 time');
    report.steps.time = { scrub: [] };
    const p0 = (await info()).programs;
    for (let h = 12; h <= 24.001; h += 1) {
      await setState({ timeOfDay: h % 24, timeSpeed: 0 });
      await sleep(h === 12 || h % 3 === 0 ? 700 : 350);
      const i = await info();
      report.steps.time.scrub.push({ set: h % 24, hours: i.hours, tod: i.tod, programs: i.programs });
      if (h % 3 === 0 || h > 23) await shot(`time-${String(h % 24).padStart(2, '0')}h`);
    }
    const sc = report.steps.time.scrub;
    console.log('   scrub: ' + sc.map((s) => `${s.set}h->${typeof s.hours === 'number' ? s.hours.toFixed(2) : s.hours}/${s.tod}`).join(' '));
    const off = sc.filter((s) => typeof s.hours !== 'number' || Math.abs(((s.hours - s.set + 36) % 24) - 12) > 0.1);
    if (off.length) fail(`time: clock did not follow the slider at ${off.map((s) => s.set).join(', ')} h`);
    // a full day at DAY_SPEED game min / s, not recorded (frame gaps would include the screenshots)
    await record(false);
    await setState({ timeOfDay: 12, timeSpeed: DAY_SPEED, paused: false });
    await sleep(300);
    await gapsStart();
    const h0 = (await info()).hours, progSeen = new Set([p0]);
    let names = await programNames();
    const progDiffs = [];
    const dayMs = (24 * 60 / DAY_SPEED) * 1000, tStart = Date.now();
    let elapsedH = 0, lastH = h0, lastProg = null;
    const progLog = [];
    while (Date.now() - tStart < dayMs + 500) {
      await sleep(250);
      const i = await info();
      progSeen.add(i.programs);
      if (i.programs !== lastProg) {
        progLog.push([+(+i.hours).toFixed(2), i.tod, i.programs]); lastProg = i.programs;
        const n = await programNames(); progDiffs.push({ h: +(+i.hours).toFixed(2), ...diffNames(names, n) }); names = n;
      }
      if (typeof i.hours === 'number') { elapsedH += (i.hours - lastH + 24) % 24; lastH = i.hours; }
    }
    const gaps = await gapsStop();
    report.steps.time.day = { speed: DAY_SPEED, realMs: Date.now() - tStart, hoursAdvanced: +elapsedH.toFixed(2), programsSeen: [...progSeen], programsBefore: p0, programsLog: progLog, programsDiff: progDiffs.slice(1), gaps };
    console.log(`   24 h at ${DAY_SPEED} min/s: clock advanced ${elapsedH.toFixed(2)} h in ${Date.now() - tStart} ms, programs seen ${[...progSeen]} ` +
      `(before ${p0}), frames median ${gaps.medianMs} ms / max ${gaps.maxMs} ms, >50 ms: ${gaps.over50}`);
    if (progSeen.size > 1) fail(`time: programs changed during the day cycle: [hour, preset, programs] ${JSON.stringify(progLog)}; ` +
      `changed programs ${JSON.stringify(progDiffs.slice(1))}`);
    if (elapsedH < 20) fail(`time: clock advanced only ${elapsedH.toFixed(2)} h over a 24 h run`);
    if (gaps.maxMs > 50) fail(`time: frame hitch ${gaps.maxMs} ms during the day cycle`);
    await setState({ timeOfDay: 18.5, timeSpeed: 0 });
    await record(true);
  }

  // ---------------------------------------------------------------------------------------------- 5 phases
  if (!SKIP.has('phases')) {
    console.log('5 phases');
    const seats = Array.from({ length: 15 }, (_, i) => ({ occupied: i < 10, dead: i === 2 || i === 7, ghostVote: i !== 7, nominated: false, onBlock: false }));
    await setState({ camera: 'vote', seats, nominee: 4, phase: 'day', timeOfDay: 16, timeSpeed: 0 });
    await sleep(1500);
    report.steps.phases = [];
    const useV = keys.has('KeyV');
    if (!useV) note('V (next phase) is not bound: phases through the store');
    for (const want of ['nomination', 'vote', 'execution', 'night', 'day']) {
      if (useV) await press('KeyV'); else await setState({ phase: want });
      await sleep(want === 'vote' || want === 'execution' ? 2500 : 1500);
      const i = await info();
      report.steps.phases.push({ want, phase: i.state.phase, nominee: i.state.nominee });
      await shot(`phase-${want}`);
      console.log(`   ${useV ? 'V' : 'set'} -> ${i.state.phase} (nominee ${i.state.nominee})`);
      if (i.state.phase !== want) fail(`phases: expected ${want}, got ${i.state.phase}`);
    }
    if (keys.has('KeyB')) {
      await setState({ camera: 'follow' }); await sleep(900);
      await press('KeyB'); await sleep(400);
      await shot('bell');
      note('bell: B pressed (look at the bell shot / GIF for the swing)');
    } else fail('bell: B is not bound');
  }

  // ---------------------------------------------------------------------------------------------- 5b ceremony
  if (!SKIP.has('ceremony')) {
    console.log('5b ceremony');
    await setState({ camera: 'follow', phase: 'day', nominee: null, timeOfDay: 17, timeSpeed: 0 });
    await sleep(600);
    const cKey = keyFor(/ceremony/i);
    if (cKey) await press(cKey); else await page.evaluate(() => window.__demo.demo.time.playCeremony());
    note(cKey ? `ceremony key: ${cKey}` : 'no ceremony key: time.playCeremony()');
    const seen = [], t0 = Date.now();
    let last = null, maxSeats = 0, deadNominee = false, shots = 0;
    while (Date.now() - t0 < 40000) {
      const i = await info();
      const c = await page.evaluate(() => window.__demo.demo.time?.ceremony ?? null);
      const ph = i.state.phase;
      maxSeats = Math.max(maxSeats, i.state.seats.filter((x) => x.occupied).length);
      if (ph !== last) { seen.push(ph); last = ph; if (shots < 4 && ph !== 'day') { shots++; await sleep(1200); await shot(`ceremony-${ph}`); } }
      if (i.state.seats.some((x) => x.dead && x.occupied)) deadNominee = true;
      if (!c && seen.length > 1) break;
      await sleep(250);
    }
    report.steps.ceremony = { phases: seen, maxSeats, deadSeen: deadNominee, ms: Date.now() - t0 };
    console.log(`   phases ${seen.join(' -> ')}, seats up to ${maxSeats}, ${Date.now() - t0} ms`);
    for (const want of ['nomination', 'vote', 'execution', 'night']) if (!seen.includes(want)) fail(`ceremony: never reached ${want} (${seen.join(' -> ')})`);
    if (maxSeats < 5) fail(`ceremony: only ${maxSeats} seats filled`);
    await setState({ camera: 'follow', phase: 'day', nominee: null });
    await sleep(500);
  }

  // ---------------------------------------------------------------------------------------------- 6 controls
  if (!SKIP.has('controls')) {
    console.log('6 controls');
    await setState({ camera: 'follow', timeOfDay: 12.5 });
    await sleep(600);
    const checks = [];
    const keyCheck = async (code, key, expect, wait = 500) => {
      if (!keys.has(code)) { fail(`controls: ${code} is not bound`); return; }
      const a = (await info()).state[key]; await press(code); await sleep(wait); const b = (await info()).state[key];
      const ok = expect(a, b); checks.push({ code, key, from: a, to: b, ok });
      console.log(`   ${ok ? 'ok ' : 'BAD'} ${code}: ${key} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
      if (!ok) fail(`controls: ${code} did not change ${key} as expected (${JSON.stringify(a)} -> ${JSON.stringify(b)})`);
    };
    await keyCheck('KeyQ', 'yaw', (a, b) => b === a + 45, 900);
    await shot('yaw-45');
    await keyCheck('KeyE', 'yaw', (a, b) => b === a - 45, 900);
    await keyCheck('Minus', 'zoom', (a, b) => b > a, 700);
    await shot('zoom-out');
    await keyCheck('Equal', 'zoom', (a, b) => b < a, 700);
    for (let n = 0; n < 5; n++) {
      await keyCheck('KeyC', 'camera', (a, b) => b !== a, 900);
      await shot(`cam-${(await info()).state.camera}`);
    }
    await keyCheck('KeyL', 'life', (a, b) => b === !a);
    const lv = (await info()).lifeVisible;
    if (lv !== null && lv !== false) fail(`controls: life is off but the life group is visible`);
    await shot('life-off');
    await keyCheck('KeyL', 'life', (a, b) => b === !a);
    const panelKey = keyFor(/panel/i, 'KeyH');
    const visibleUI = () => page.evaluate(() => [...(document.getElementById('demo-ui')?.querySelectorAll('*') ?? [])].filter((c) => c.offsetParent !== null && c.getBoundingClientRect().width > 40).length);
    const vis0 = await visibleUI();
    await keyCheck(panelKey ?? 'KeyH', 'ui', (a, b) => b === !a);
    const vis1 = await visibleUI();
    await shot('ui-hidden');
    note(`panel key ${panelKey}: visible #demo-ui elements ${vis0} -> ${vis1}`);
    if (!(vis1 < vis0)) fail(`controls: panel key ${panelKey} set ui=false but nothing in #demo-ui was hidden`);
    await keyCheck(panelKey ?? 'KeyH', 'ui', (a, b) => b === !a);
    const helpKey = keyFor(/overlay|help|keys/i);
    if (helpKey) {
      await press(helpKey); await sleep(400);
      await shot('help');
      const vis2 = await visibleUI();
      note(`help key ${helpKey}: visible #demo-ui elements ${vis0} -> ${vis2}`);
      await press('Escape'); await sleep(300);
    }
    for (const c of ['on', 'off', 'auto']) {
      await setState({ cutaway: c }); await sleep(500);
      const i = await info();
      checks.push({ cutaway: c, on: i.cut?.on });
      console.log(`   cutaway ${c}: cut.on = ${i.cut?.on}`);
      if (c === 'on' && i.cut && !i.cut.on) fail('controls: cutaway on but cut.on is false');
      if (c === 'off' && i.cut?.on) fail('controls: cutaway off but cut.on is true');
      if (c === 'off') await shot('cut-off');
    }
    report.steps.controls = checks;
  }

  // ---------------------------------------------------------------------------------------------- 6b game UI
  // the pixel3d UI library in the demo (src/demo/gameui.js, notebook.js): REAL mouse / keyboard input
  //   point (right-click a townsperson + a spot), the pie (right-hold, hover a wedge, release = a pin; right-drag +
  //   release in the dead zone = sticky, click a wedge), pins (drop animation, F at the cursor, the dock's swatch,
  //   click your own pin = remove, Clear my pins), the notebook (J: Seats; the Notes tab; typing = the quill; saved to
  //   localStorage; Esc closes; the reading book visible to the town), both toggles from the panel (Notebook held / big,
  //   Pointer new / v2 size: live, no reload), programs constant
  if (!SKIP.has('gameui')) {
    console.log('6b game UI');
    const gi = () => page.evaluate(() => window.__demo.demo.gameui?.info?.() ?? null);
    const G0 = await gi();
    if (!G0) fail('gameui: no game UI (demo.gameui missing)');
    else {
      await setState({ camera: 'follow', timeOfDay: 12.5, timeSpeed: 0, phase: 'day', nominee: null, zoom: 12, yaw: 0, ui: true, bookStyle: 'held', pointerScale: 'new' });
      await page.evaluate(() => { window.__playNoReload = 1; });
      await steerTo({ x: 22.5, z: 25.5 }, { timeout: 5000 }).catch(() => {});
      await sleep(600);
      const prog0 = (await info()).programs;
      const S = await page.evaluate(() => window.__demo.demo.engine.pixelScale);
      const px = (s, dy = 0) => ({ x: s.x * S + S / 2, y: (s.y + dy) * S + S / 2 });
      const visibleNpc = (g) => g.members.find((m) => !m.you && m.screen.x > 24 && m.screen.x < g.screen[0] - g.cover.right - 24 && m.screen.y > 40 && m.screen.y < g.screen[1] - 50);
      const r = report.steps.gameui = {};
      // -- point at a townsperson, then at a spot
      let g = await gi();
      const npc = visibleNpc(g);
      if (!npc) fail(`gameui: no townsperson on screen to point at (${JSON.stringify(g.members.map((m) => [m.id, m.screen]))})`);
      else {
        const face0 = (await info()).player[2];
        const a = px(npc.screen, -12);
        await page.mouse.click(a.x, a.y, { button: 'right' });
        await sleep(450);
        g = await gi();
        const face1 = (await info()).player[2];
        r.pointPerson = { at: npc.id, point: g.point, face: [face0, face1], clip: g.members.find((m) => m.you)?.clip };
        console.log(`   point at ${npc.id}: ${JSON.stringify(g.point)}, facing ${face0} -> ${face1}, clip ${r.pointPerson.clip}`);
        if (g.point?.kind !== 'person') fail(`gameui: right-click on ${npc.id} did not point at them (${JSON.stringify(g.point)})`);
        await shot('ui-point');
        await sleep(3400);
        if ((await gi()).point) fail('gameui: the point did not end after EMOTE_POINT_MS');
      }
      const you = () => g.members.find((m) => m.you);
      g = await gi();
      const spot = px({ x: you().screen.x + 60, y: you().screen.y + 36 });
      await page.mouse.click(spot.x, spot.y, { button: 'right' });
      await sleep(400);
      g = await gi();
      r.pointPlace = g.point;
      if (g.point?.kind !== 'place') fail(`gameui: right-click on the ground did not point at a spot (${JSON.stringify(g.point)})`);
      await sleep(3300);
      // -- the pie: right-hold, hover teal, release = a teal pin with the drop animation
      g = await gi();
      const pinsBefore = g.pins.length;
      const pc = px({ x: you().screen.x - 70, y: you().screen.y + 30 });
      await page.mouse.move(pc.x, pc.y);
      await page.mouse.down({ button: 'right' });
      await sleep(400);
      g = await gi();
      r.pie = g.pie;
      if (!g.pie?.open) fail('gameui: holding the right button did not open the pie');
      else {
        const k = g.pie.items.indexOf('pin:teal'), n = g.pie.items.length, ang = -Math.PI / 2 + k * 2 * Math.PI / n;
        await page.mouse.move((g.pie.at[0] + Math.cos(ang) * 26) * S, (g.pie.at[1] + Math.sin(ang) * 26) * S, { steps: 4 });
        await sleep(200);
        g = await gi();
        if (g.pie?.hot !== k) fail(`gameui: hovering the teal wedge made wedge ${g.pie?.hot} hot (want ${k})`);
        await shot('ui-pie');
      }
      await page.mouse.up({ button: 'right' });
      await sleep(120);
      await shot('ui-pin-drop');
      await sleep(700);
      g = await gi();
      const teal = g.pins.find((p) => p.color === 'teal' && p.kind === 'place' && !p.removing);
      r.pin = { pins: g.pins, pops: g.pops };
      console.log(`   pie -> pins ${pinsBefore} -> ${g.pins.length}: ${JSON.stringify(g.pins.map((p) => [p.color, p.kind]))}, pops ${JSON.stringify(g.pops.map((p) => [p.who, p.kind, p.color]))}`);
      if (!teal) fail('gameui: releasing on the teal wedge dropped no teal pin');
      if (!g.pops.some((p) => p.who === 'you' && p.kind === 'pin' && p.color === 'teal')) fail('gameui: no pin pop over the player');
      await shot('ui-pin');
      // right-drag (moves past RIGHT_DRAG_PX at once) + release in the dead zone = sticky; then click the crimson wedge
      const pd = px({ x: you().screen.x + 80, y: you().screen.y - 10 });
      await page.mouse.move(pd.x, pd.y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(pd.x + 14, pd.y, { steps: 3 });
      await sleep(80);
      await page.mouse.move(pd.x, pd.y, { steps: 2 });
      await page.mouse.up({ button: 'right' });
      await sleep(250);
      g = await gi();
      if (!g.pie?.sticky) fail(`gameui: right-drag + release in the dead zone did not leave a sticky pie (${JSON.stringify(g.pie)})`);
      else {
        const k = g.pie.items.indexOf('pin:crimson'), n = g.pie.items.length, ang = -Math.PI / 2 + k * 2 * Math.PI / n;
        await page.mouse.click((g.pie.at[0] + Math.cos(ang) * 26) * S, (g.pie.at[1] + Math.sin(ang) * 26) * S);
        await sleep(500);
        g = await gi();
        if (!g.pins.some((p) => p.color === 'crimson' && !p.removing)) fail('gameui: clicking the crimson wedge of the sticky pie dropped no pin');
      }
      // the dock: G, the violet swatch, F at the cursor
      await press('KeyG');
      await sleep(200);
      g = await gi();
      if (!g.dock?.open || !g.dock.rects) fail('gameui: G did not open the social dock');
      else {
        const sw = g.dock.rects['swatch:violet'];
        await page.mouse.click((sw.x + sw.w / 2) * S, (sw.y + sw.h / 2) * S);
        await sleep(150);
        const pf = px({ x: you().screen.x + 30, y: you().screen.y - 46 });
        await page.mouse.move(pf.x, pf.y);
        await press('KeyF');
        await sleep(600);
        g = await gi();
        r.dock = { color: g.dock.color, pins: g.pins.map((p) => p.color) };
        if (g.dock.color !== 'violet') fail(`gameui: the violet swatch set the colour to ${g.dock.color}`);
        if (!g.pins.some((p) => p.color === 'violet' && !p.removing)) fail('gameui: F at the cursor dropped no violet pin');
        await shot('ui-dock');
      }
      // left-click your own pin = remove it; Clear my pins
      g = await gi();
      const own = g.pins.find((p) => p.kind === 'place' && p.color === 'teal' && !p.removing);
      if (own?.screen) {
        await page.mouse.click(own.screen.x * S + S / 2, (own.screen.y - 14) * S);
        await sleep(200);
        g = await gi();
        if (!g.pins.some((p) => p.color === 'teal' && p.removing) && g.pins.some((p) => p.color === 'teal')) fail('gameui: clicking your own teal pin did not remove it');
      }
      if (g.dock?.rects?.clear) {
        await page.mouse.click((g.dock.rects.clear.x + 20) * S, (g.dock.rects.clear.y + 5) * S);
        await sleep(700);
        g = await gi();
        if (g.pins.some((p) => !p.removing)) fail(`gameui: Clear my pins left ${JSON.stringify(g.pins)}`);
      }
      await press('KeyG');
      // -- the notebook: J, Seats, the Notes tab, typing (quill), saved, Esc
      await press('KeyJ');
      await sleep(700);
      g = await gi();
      r.notebook = { open: g.notebook, readers: g.readers };
      console.log(`   notebook: ${JSON.stringify(g.notebook)} readers ${JSON.stringify(g.readers)}`);
      if (!g.notebook.open) fail('gameui: J did not open the notebook');
      if (!g.notebook.rows) fail('gameui: the Seats page lists nobody');
      if (g.toasts.some((x) => /notebook/i.test(x))) fail(`gameui: a notebook toast is shown (it covered name labels): ${JSON.stringify(g.toasts)}`);
      if (g.youIcon === 'initial') fail(`gameui: ${g.members.find((m) => m.you)?.id}'s pins show an initial, not a portrait`);
      if (!g.readers.some((x) => x.who === 'you' && x.style === 'held' && (x.phase === 'hold' || x.phase === 'open'))) fail(`gameui: the player shows no held book while the notebook is open (${JSON.stringify(g.readers)})`);
      await shot('ui-notebook-seats');
      await page.click('.dnb .ctn-tab-notes');
      await sleep(150);
      const typed = 'Hound sniffed at the mill twice.';
      await page.keyboard.type(typed, { delay: 25 });
      await sleep(150);
      g = await gi();
      r.notebook.typing = { notebook: g.notebook, readers: g.readers };
      if (!g.notebook.typing) fail('gameui: typing in the Notes page is not "typing"');
      if (!g.readers.some((x) => x.who === 'you' && x.phase === 'write')) fail(`gameui: no quill (write) while typing (${JSON.stringify(g.readers)})`);
      const st = (await info()).state;
      if (Math.abs(st.timeOfDay - 12.5) > 0.02 || st.camera !== 'follow' || st.yaw !== 0 || !st.life) fail(`gameui: keys typed into the notebook reached the game (clock ${st.timeOfDay}, camera ${st.camera})`);
      await shot('ui-notebook-write');
      await sleep(1400);
      const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('hollowmere-notebook:notes')); } catch { return null; } });
      r.notebook.saved = saved;
      if (saved !== typed) fail(`gameui: the notes were not saved to localStorage (${JSON.stringify(saved)})`);
      await page.keyboard.press('Escape');
      await sleep(250);
      g = await gi();
      if (g.notebook.open) fail('gameui: Esc in the notebook did not close it');
      await sleep(600);
      g = await gi();
      if (g.readers.some((x) => x.who === 'you')) fail(`gameui: the player still shows a book after closing (${JSON.stringify(g.readers)})`);
      // -- toggles (the panel's Game UI section, real clicks): Notebook big, Pointer v2 size; live (no reload)
      await page.click('[data-sec="gameui"] .dui-seg button:has-text("big")');
      await sleep(200);
      await press('KeyJ');
      await sleep(900);
      g = await gi();
      r.big = { options: g.options, readers: g.readers, books3d: g.books3d, merged: g.mergedBooks };
      console.log(`   big: ${JSON.stringify(r.big)}`);
      if (g.options.bookStyle !== 'big') fail(`gameui: the "big" toggle set bookStyle ${g.options.bookStyle}`);
      if (!g.readers.some((x) => x.who === 'you' && x.style === 'big') || g.books3d < 1) fail(`gameui: no 3D big book in front of the player (${JSON.stringify(r.big)})`);
      if (!g.mergedBooks) fail('gameui: the 3D books are not the merged runtime books (src/ui/runtime/book3d.js)');
      await shot('ui-book-big');
      await press('KeyJ');
      await sleep(400);
      await page.click('[data-sec="gameui"] .dui-seg button:has-text("v2 size")');
      await sleep(150);
      g = await gi();
      const npc2 = visibleNpc(g);
      if (npc2) {
        const a = px(npc2.screen, -12);
        await page.mouse.click(a.x, a.y, { button: 'right' });
        await sleep(450);
        g = await gi();
        r.pointV2 = g.point;
        if (g.point?.scale !== 'v2' || g.point?.frameSize !== 24) fail(`gameui: the v2-size toggle did not give the v2 finger (${JSON.stringify(g.point)})`);
        await shot('ui-point-v2');
      }
      await page.click('[data-sec="gameui"] .dui-seg button:has-text("held")');
      await page.click('[data-sec="gameui"] .dui-seg button:has-text("new")');
      await sleep(300);
      g = await gi();
      if (g.options.bookStyle !== 'held' || g.options.pointerScale !== 'new') fail(`gameui: the toggles did not switch back (${JSON.stringify(g.options)})`);
      if (!(await page.evaluate(() => window.__playNoReload === 1))) fail('gameui: a toggle reloaded the page');
      const prog1 = (await info()).programs;
      r.programs = [prog0, prog1];
      console.log(`   programs ${prog0} -> ${prog1}`);
      if (prog1 > prog0) fail(`gameui: the game UI compiled ${prog1 - prog0} programs mid-game (${prog0} -> ${prog1})`);
    }
  }

  // ---------------------------------------------------------------------------------------------- 6c touch (a phone)
  // a second page in the same browser, 390 x 844 @2x, isMobile + hasTouch (coarse pointer), REAL touch input (taps +
  // a CDP long press): the auto-folded panel is a top band the HUD drops below (cover.top), the toolbar's notebook is
  // on the canvas and a tap opens it (not the keys overlay), the notebook stays above the reader, the panel's notebook
  // button folds the unfolded panel, a long press opens the touch pie (not before LONG_PRESS_MS), the lift in the dead
  // zone leaves it sticky, a tap on a wedge drops a pin without walking, a short tap still walks, the dock opens from
  // the portrait; no errors, no CSP violations
  if (!SKIP.has('touch')) {
    console.log('6c touch (phone)');
    const r = report.steps.touch = {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const ph = await ctx.newPage();
    const pbad = [];
    ph.on('console', (m) => { if (m.type() === 'error' || SHADER_RX.test(m.text())) pbad.push(`[touch console.${m.type()}] ${m.text()}`); });
    ph.on('pageerror', (e) => pbad.push(`[touch pageerror] ${e.stack || e.message}`));
    await ph.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    try {
      await ph.goto(`${BASE}/demo.html?intro=0&tod=noon`);
      await ph.waitForFunction(() => window.__demo?.ready, null, { timeout: 120000 });
      await ph.waitForTimeout(2500);
      const gi = () => ph.evaluate(() => window.__demo.demo.gameui?.info?.() ?? null);
      const cl = (x, y) => ph.evaluate(([x, y]) => {   // screen texel -> client px (gameui toScreen inverted)
        const d = window.__demo.demo, e = d.engine, c = e.renderer.domElement, b = c.getBoundingClientRect(), s = e.pixelScale || 1, H = d.gameui.info().screen[1];
        return { x: b.left + (x + 0.5) * s * b.width / e.width, y: b.top + (e.height - (H - 1 - y + 0.5) * s) * b.height / e.height };
      }, [x, y]);
      const tapEl = async (sel) => { const b = await ph.evaluate((s) => { const q = document.querySelector(s)?.getBoundingClientRect(); return q ? [q.x + q.width / 2, q.y + q.height / 2] : null; }, sel); if (!b) throw new Error(`no ${sel}`); await ph.touchscreen.tap(b[0], b[1]); };
      const pshot = (name) => ph.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`) });
      let g = await gi();
      r.cover = g?.cover; r.touchUI = g?.touch;
      if (!g?.touch) fail('touch: the game UI did not detect the touch screen (coarse pointer)');
      if (!(g?.cover?.top > 0)) fail(`touch: the folded panel is no top band for the HUD (cover ${JSON.stringify(g?.cover)})`);
      if (g?.toolbar?.notebook?.y < g?.cover?.top) fail('touch: the toolbar is drawn under the folded panel');
      const tb = await cl(g.toolbar.notebook.x + 7, g.toolbar.notebook.y + 7);
      r.underToolbar = await ph.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [tb.x, tb.y]);
      if (r.underToolbar !== 'CANVAS') fail(`touch: the toolbar's notebook lies under ${r.underToolbar}, not the canvas`);
      await ph.touchscreen.tap(tb.x, tb.y); await ph.waitForTimeout(900);
      g = await gi();
      r.toolbarTap = { notebook: g.notebook.open, keys: await ph.evaluate(() => !document.querySelector('.dui-help')?.hidden) };
      if (!g.notebook.open) fail('touch: tapping the toolbar notebook did not open the notebook');
      if (r.toolbarTap.keys) fail('touch: tapping the toolbar notebook opened the keys overlay');
      const nbBottom = await ph.evaluate(() => document.querySelector('#demo-ui > .dnb').getBoundingClientRect().bottom);
      const feet = (await cl(0, g.members.find((m) => m.you).screen.y)).y;
      r.notebookBottom = Math.round(nbBottom); r.readerFeet = Math.round(feet);
      if (nbBottom > feet - 40) fail(`touch: the notebook (bottom ${nbBottom.toFixed(0)} px) covers the reader (feet ${feet.toFixed(0)} px)`);
      if (!g.readers.some((x) => x.who === 'you')) fail('touch: no reading book on the player while the notebook is open');
      await pshot('touch-notebook');
      await tapEl('.dnb .dnb-close'); await ph.waitForTimeout(600);
      // unfold the panel, then its notebook button: the panel folds away
      await tapEl('.dui-panel .dui-head .dui-btn[title="fold the panel"]'); await ph.waitForTimeout(500);
      const unfolded = await ph.evaluate(() => !document.querySelector('.dui-panel').classList.contains('collapsed'));
      await ph.evaluate(() => document.querySelector('[data-sec="gameui"]')?.setAttribute('open', ''));
      const btn = ph.locator('[data-sec="gameui"] button:has-text("notebook")');
      await btn.scrollIntoViewIfNeeded();
      const bb = await btn.boundingBox();
      await ph.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await ph.waitForTimeout(900);
      r.panelButton = { unfolded, open: (await gi()).notebook.open, folded: await ph.evaluate(() => document.querySelector('.dui-panel').classList.contains('collapsed')) };
      if (!unfolded || !r.panelButton.open || !r.panelButton.folded) fail(`touch: the panel's notebook button on a phone: ${JSON.stringify(r.panelButton)} (want unfolded first, then open + folded)`);
      await tapEl('.dnb .dnb-close'); await ph.waitForTimeout(600);
      // a long press (CDP touch events) beside the player: the touch pie
      g = await gi();
      const me = g.members.find((m) => m.you), sp = await cl(me.screen.x - 30, me.screen.y + 20);
      const cdp = await ctx.newCDPSession(ph);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      const pos0 = await ph.evaluate(() => window.__demo.info().player);
      await touch('touchStart', sp.x, sp.y); await ph.waitForTimeout(250);
      r.pieEarly = (await gi()).pie;
      await ph.waitForTimeout(450);
      g = await gi(); r.pie = g.pie;
      if (r.pieEarly) fail('touch: the pie opened before the long press time');
      if (!g.pie?.open || g.pie.input !== 'touch') fail(`touch: a long press did not open the touch pie (${JSON.stringify(g.pie)})`);
      await touch('touchEnd'); await ph.waitForTimeout(300);
      g = await gi();
      if (!g.pie?.sticky) fail('touch: lifting the finger in the dead zone did not leave a sticky pie');
      else {
        const k = Math.max(0, g.pie.items.indexOf('pin:teal')), n = g.pie.items.length, a = -Math.PI / 2 + k * 2 * Math.PI / n;
        const wp = await cl(g.pie.at[0] + Math.cos(a) * 32, g.pie.at[1] + Math.sin(a) * 32);
        await ph.touchscreen.tap(wp.x, wp.y); await ph.waitForTimeout(1200);
        g = await gi(); r.pins = g.pins.map((p) => p.color);
        if (!g.pins.some((p) => p.color === 'teal' && !p.removing)) fail(`touch: tapping the teal wedge dropped no teal pin (${JSON.stringify(r.pins)})`);
      }
      const pos1 = await ph.evaluate(() => window.__demo.info().player);
      r.walkedByPie = +Math.hypot(pos1[0] - pos0[0], pos1[1] - pos0[1]).toFixed(2);
      if (r.walkedByPie > 0.3) fail(`touch: the long press / wedge tap also walked the player ${r.walkedByPie} m`);
      await pshot('touch-pin');
      // a short tap still walks
      const tp = await cl(me.screen.x + 25, me.screen.y + 30);
      await ph.touchscreen.tap(tp.x, tp.y); await ph.waitForTimeout(1500);
      const pos2 = await ph.evaluate(() => window.__demo.info().player);
      r.tapWalk = +Math.hypot(pos2[0] - pos1[0], pos2[1] - pos1[1]).toFixed(2);
      if (r.tapWalk < 0.3) fail(`touch: a short tap no longer walks (${r.tapWalk} m)`);
      // the dock: tap the portrait
      g = await gi();
      const db = await cl(g.dock.button.x + 13, g.dock.button.y + 13);
      await ph.touchscreen.tap(db.x, db.y); await ph.waitForTimeout(600);
      if (!(await gi()).dock.open) fail('touch: tapping your portrait did not open the dock');
      await pshot('touch-dock');
      r.csp = await ph.evaluate(() => window.__csp);
      if (r.csp.length) fail(`touch: CSP violations ${JSON.stringify(r.csp)}`);
      const errs = await ph.evaluate(() => window.__demo?.errors ?? []);
      if (errs.length) pbad.push(...errs.map((e) => `[touch __demo] ${e}`));
    } catch (e) { fail('touch: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')); }
    for (const b of pbad) fail(b);
    console.log(`   cover ${JSON.stringify(r.cover)} · toolbar under ${r.underToolbar} · notebook ${JSON.stringify(r.toolbarTap)} bottom ${r.notebookBottom} < feet ${r.readerFeet} · panel button ${JSON.stringify(r.panelButton)}`);
    console.log(`   long press pie ${r.pie?.input} sticky -> pins ${JSON.stringify(r.pins)} · walked by pie ${r.walkedByPie} m · tap walk ${r.tapWalk} m`);
    await ctx.close();
  }

  // ---------------------------------------------------------------------------------------------- 7 quality reload
  if (!SKIP.has('reload')) {
    console.log('7 quality reload');
    await record(false);
    const roster = await page.evaluate(() => (window.__demo.demo?.characters ?? []).filter((c) => c.complete).map((c) => c.id));
    const ch = roster.includes('keeper') ? 'keeper' : roster[roster.length - 1];
    await setState({ character: ch, phase: 'nomination', timeOfDay: 19.25, timeSpeed: 0 });
    for (let k = 0; k < 60; k++) { if ((await info()).character === ch) break; await sleep(100); }
    const before = await info();
    const nav = page.waitForNavigation({ timeout: 30000 });
    await setState({ quality: 'low' });
    await nav;
    await waitReady();
    if (!SKIP.has('loading')) await skipIntro({ flyMs: 300 });
    await sleep(1200);
    const after = await info();
    const keep = { quality: after.state.quality === 'low', character: after.character === before.character, phase: after.state.phase === before.state.phase,
      clock: Math.abs(after.state.timeOfDay - before.state.timeOfDay) < 0.2,
      position: Math.hypot(after.player[0] - before.player[0], after.player[1] - before.player[1]) < 0.6,
      location: after.state.location === before.state.location };
    report.steps.reload = { before: { character: before.character, phase: before.state.phase, tod: before.state.timeOfDay, player: before.player },
      after: { quality: after.state.quality, character: after.character, phase: after.state.phase, tod: after.state.timeOfDay, player: after.player, programs: after.programs }, keep,
      url: page.url().replace(BASE, '') };
    console.log(`   ${page.url().replace(BASE, '')}\n   kept: ${JSON.stringify(keep)}`);
    for (const [k, v] of Object.entries(keep)) if (!v) fail(`reload: ${k} not kept across the quality reload`);
    await shot('reload-low');
    // inside a house: the reload keeps the house (?in=house-N), the player starts in its room
    await setState({ location: 'house-3' });
    for (let k = 0; k < 80; k++) { const l = await page.evaluate(() => window.__demo.demo.player.location); if (l === 'house-3') break; await sleep(100); }
    const nav2 = page.waitForNavigation({ timeout: 30000 });
    await setState({ quality: 'high' });
    await nav2;
    await waitReady();
    if (!SKIP.has('loading')) await skipIntro({ flyMs: 300 });
    let inLoc = null;
    for (let k = 0; k < 80; k++) { inLoc = await page.evaluate(() => ({ p: window.__demo.demo.player.location, s: window.__demo.demo.store.state.location, q: window.__demo.demo.store.state.quality })); if (inLoc.p === 'house-3') break; await sleep(100); }
    await sleep(800);
    report.steps.reloadInside = { ...inLoc, url: page.url().replace(BASE, '') };
    console.log(`   inside reload: ${page.url().replace(BASE, '')} -> player ${inLoc.p}, store ${inLoc.s}, quality ${inLoc.q}`);
    if (inLoc.p !== 'house-3' || inLoc.s !== 'house-3') fail(`reload: inside house-3 before the reload, ${inLoc.p} / ${inLoc.s} after`);
    await shot('reload-inside');
  }
} catch (e) { fail('PLAYTEST ABORTED: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }

await record(false);
const final = await page.evaluate(() => window.__demo?.errors ?? []).catch(() => []);
if (final.length) bad.push(...final.map((e) => `[__demo] ${e}`));
await browser.close();

// GIF + contact sheet (tools/sheet.py, PIL on render-host)
try {
  const gfps = opt('gif-fps', '8'), gscale = opt('gif-scale', '0.4');
  if (frameN) {
    execFileSync('python3', ['tools/sheet.py', 'gif', path.join(OUT, 'play.gif'), path.join(FRAMES, 'f*.png'), '--fps', gfps, '--scale', gscale], { cwd: ROOT, stdio: 'inherit' });
    report.gif = { file: path.join(OUT, 'play.gif'), frames: frameN, everyMs: EVERY, fps: Number(gfps), bytes: fs.statSync(path.join(ROOT, OUT, 'play.gif')).size };
  }
  const shots = fs.readdirSync(OUT).filter((f) => /^\d\d-.*\.png$/.test(f)).map((f) => path.join(OUT, f));
  if (shots.length) execFileSync('python3', ['tools/sheet.py', 'sheet', path.join(OUT, 'sheet.png'), ...shots, '--cols', '4', '--scale', '0.25'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) { fail('gif/sheet: ' + e.message); }

report.totalMs = Date.now() - t00; report.errors = bad; report.notes = notes;
fs.writeFileSync(path.join(OUT, 'play.json'), JSON.stringify(report, null, 1));
console.log(bad.length ? `PLAYTEST FAILED (${bad.length}):\n` + bad.slice(0, 40).map((b) => '  ' + b.slice(0, 400)).join('\n') : 'PLAYTEST OK', `(${(report.totalMs / 1000).toFixed(0)} s) ->`, OUT);
process.exit(bad.length ? 1 : 0);
