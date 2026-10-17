// Player owner's headless checks (runs on render-host via tools/remote.sh). Loads demo.html in REAL TIME, waits for
// window.__demo.ready, then runs one named scenario (below) that drives the player with real key presses / mouse
// clicks, records __demo.info() and writes screenshots to shots/demo-player/.
//   node tools/demo-player.mjs <scenario> [--q "tod=night"] [--size 1280x720] [--out shots/demo-player] [--keys w+d] [--at 'x,z;x,z']
//   scenarios: dump trees tp progs walk fuzz doors click follow swap spots emotes npc camera overlay (see SCENARIOS)
// Exit 1 on any console error / pageerror / __demo.errors / shader error or a failed scenario assertion.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const scenario = args[0];
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, opt('out', 'shots/demo-player'));
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const bad = [], logs = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') bad.push(line);
  if (['error', 'warning'].includes(m.type()) || /THREE\.WebGL|shader|program/i.test(m.text())) logs.push(line);
});
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});

const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, a) => page.evaluate(fn, a);
const info = () => ev(() => {
  const d = window.__demo, p = d.demo?.player, c = d.demo?.engine?.camera;
  return { player: p ? [+p.position.x.toFixed(2), +p.position.z.toFixed(2), +p.facing.toFixed(2)] : null, nearDoor: p?.nearDoor?.id ?? null,
    char: p?.handle?.id ?? null, moving: p?.moving ?? null, path: p?.path?.length ?? null, cam: c ? [+c.target.x.toFixed(2), +c.target.z.toFixed(2), c.viewHeight, +(c.yaw * 180 / Math.PI).toFixed(1)] : null,
    cut: d.demo?.cut?.info ?? null, fps: d.info?.().fps, programs: d.info?.().engine?.programs, mode: d.demo?.store?.state?.camera };
});
const shot = async (name) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); console.log('wrote', path.relative(ROOT, f)); };
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
const holdMany = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); for (const k of keys) await page.keyboard.up(k); };
const teleport = (x, z, face) => ev(([x, z, f]) => window.__demo.demo.player.teleport(x, z, f), [x, z, face]);
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
/** screen pixel of world point (x, 0, z) */
const toScreen = (x, z, y = 0) => ev(([x, y, z]) => {
  const e = window.__demo.demo.engine, v = new e.camera.cam.position.constructor(x, y, z);
  v.project(e.camera.cam);
  const r = e.renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}, [x, y, z]);

const SCENARIOS = {
  /** Walk into an idle NPC on the square: the player stops at its circle. */
  async npc() {
    const list = await ev(() => window.__demo.demo.npcs?.list ?? []);
    console.log('npcs', JSON.stringify(list));
    if (!list.length) { check(false, 'no NPCs'); return; }
    const [x, z] = list[0].pos;
    await teleport(x, z + 2.2, Math.PI); await wait(400);
    await hold('w', 700);
    const i = await info(); const d = Math.hypot(i.player[0] - x, i.player[1] - z);
    console.log('stopped at', JSON.stringify(i.player), 'dist', d.toFixed(2));
    check(d > 0.5, `player stops at the NPC (dist ${d.toFixed(2)})`);
    await shot('npc');
  },
  /** Emote keys on a cast member (run with --q "roster=fox,wanderer&char=fox"): 1-6 + Space, walking releases. */
  async emotes() {
    await ev(() => { window.__toasts = []; window.__demo.demo.events.on('toast', (e) => window.__toasts.push(e.text)); });
    const st = () => ev(() => { const h = window.__demo.demo.player.handle; return { id: h.id, emotes: h.emotes, action: h.ch.state.action, clip: h.ch.state.clip }; });
    console.log(JSON.stringify(await st()));
    for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Space']) {
      await page.keyboard.press(k); await wait(450);
      console.log(k, JSON.stringify(await st()));
      if (k === 'Digit2' || k === 'Space') await shot(`emote-${k}`);
    }
    await hold('d', 500); await wait(100);
    console.log('walked', JSON.stringify(await st()));
    console.log('toasts', JSON.stringify(await ev(() => window.__toasts)));
  },
  /** Camera: wheel zoom ladder, Q turn + walking relative to it, modes (C), free-pan drag, back to follow. */
  async camera() {
    const cx = 640, cy = 360;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -120); await wait(300); console.log('wheel in', JSON.stringify(await info()));
    await page.mouse.wheel(0, 240); await wait(300); console.log('wheel out x2', JSON.stringify(await info()));
    await page.mouse.wheel(0, -120); await wait(300);
    await page.keyboard.press('q'); await wait(700);
    let i0 = await info(); await hold('w', 600); let i1 = await info();
    const dx = i1.player[0] - i0.player[0], dz = i1.player[1] - i0.player[1];
    console.log('yaw', i1.cam[3], 'W moved', dx.toFixed(2), dz.toFixed(2));
    check(i1.cam[3] === 45 && dx < -0.5 && dz < -0.5, `W at yaw 45 walks screen-up = north-west (${dx.toFixed(2)}, ${dz.toFixed(2)})`);
    await shot('cam-yaw45');
    await page.keyboard.press('e'); await wait(600);
    for (const m of ['vote', 'overview', 'iso', 'free']) {
      await page.keyboard.press('c'); await wait(700);
      const i = await info(); console.log('mode', i.mode, JSON.stringify(i.cam));
      await shot(`cam-${i.mode}`);
    }
    // free: drag pans, the player stays
    const before = await info();
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 200, cy - 100, { steps: 8 }); await page.mouse.up();
    await wait(300);
    const after = await info();
    console.log('free drag', JSON.stringify(before.cam), '->', JSON.stringify(after.cam), 'player', JSON.stringify(after.player), 'path', after.path);
    check(after.cam[0] !== before.cam[0] && after.path === null, 'free mode: drag pans the camera, no click-to-move');
    await page.keyboard.press('c'); await wait(500);
    const f = await info(); console.log('back to', f.mode, JSON.stringify(f.cam), JSON.stringify(f.player));
    check(f.mode === 'follow' && Math.hypot(f.cam[0] - f.player[0], f.cam[1] - f.player[1]) < 0.2, 'follow again: camera on the player');
    await shot('cam-follow-again');
  },
  async trees() {
    const t = await ev(() => window.__demo.demo.town.registry.get('foliage').api.trees.filter((t) => t.x > -1 && t.x < 46 && t.z > -1 && t.z < 38).map((t) => [t.kind, +t.x.toFixed(2), +t.z.toFixed(2), +t.r.toFixed(2), +t.top.toFixed(2)]));
    console.log(t.length); for (const r of t) console.log(JSON.stringify(r));
  },
  /** Screenshots of the collision overlay (run with --q collide=1) at a few places. */
  async overlay() {
    const at = (opt('at', '') || '32.5,15;15,14;8,13;37,19;10,24;22.5,30;35,30;22.5,6.5').split(';').map((p) => p.split(',').map(Number));
    for (const [x, z] of at) { await teleport(x, z, 0); await wait(700); await shot(`overlay-${x}-${z}`); }
  },
  /** [ / ] through every complete character while walking; emotes 1-6 + Space; speeds per character. */
  async swap() {
    const ids = await ev(() => window.__demo.demo.characters.filter((c) => c.complete).map((c) => c.id));
    console.log('complete:', ids.join(' '));
    const toasts = [];
    await ev(() => { window.__toasts = []; window.__demo.demo.events.on('toast', (e) => window.__toasts.push(e.text)); });
    for (let k = 0; k < ids.length; k++) {
      await page.keyboard.down('d'); await wait(300);
      await page.keyboard.press('BracketRight');
      await wait(500); await page.keyboard.up('d');
      const r = await ev(() => { const p = window.__demo.demo.player; return { id: p.handle?.id, sp: p.speeds(), st: window.__demo.demo.store.state.character, emotes: p.handle?.emotes }; });
      console.log('swapped', JSON.stringify(r), JSON.stringify(await info()));
      check(r.id === r.st, `swap: handle ${r.id} == store ${r.st}`);
      for (const key of ['Digit1', 'Digit2', 'Space']) { await page.keyboard.press(key); await wait(500); }
      await shot(`swap-${k}-${r.id}`);
      await hold('a', 400);
    }
    const t = await ev(() => window.__toasts);
    console.log('toasts:', JSON.stringify(t));
    const scene = await ev(() => window.__demo.demo.engine.scene.children.filter((o) => /^character:/.test(o.name)).map((o) => o.name));
    console.log('characters in scene:', JSON.stringify(scene));
  },
  /** goTo every named spot (teleport) and check where the player stands. */
  async spots() {
    const names = await ev(() => Object.keys(window.__demo.demo.player.spots()));
    for (const n of names) {
      const r = await ev((n) => { const p = window.__demo.demo.player, s = p.spots()[n]; p.goTo(n); return { n, want: [+s.x.toFixed(2), +s.z.toFixed(2)], at: [+p.position.x.toFixed(2), +p.position.z.toFixed(2)], free: p.collision.free(p.position.x, p.position.z) }; }, n);
      await wait(120);
      console.log(JSON.stringify({ ...r, near: (await info()).nearDoor }));
      check(r.free && Math.hypot(r.want[0] - r.at[0], r.want[1] - r.at[1]) < 0.6, `spot ${n} reachable: ${r.at}`);
      if (['dais', 'seat-0', 'seat-7', 'well', 'fountain'].includes(n)) { await wait(400); await shot(`spot-${n}`); }
    }
  },
  /** Where do shader programs get added? */
  async progs() {
    const pr = () => ev(() => window.__demo.demo.engine.renderer.info.programs.length);
    console.log('boot', await pr());
    await hold('w', 800); console.log('walk', await pr());
    await holdMany(['Shift', 'a'], 800); console.log('run', await pr());
    for (const [x, z] of [[30, 20], [37.5, 15.2], [10, 27]]) { await teleport(x, z); await wait(300); console.log('tp', x, z, await pr()); }
    for (const id of ['house-0', 'house-14', 'house-5', 'clocktower', 'house-9']) {
      await ev((id) => window.__demo.demo.player.goTo(id), id); await wait(300); const a = await pr();
      await ev(() => window.__demo.demo.player.teleport(22.5, 27)); await wait(300);
      console.log('door', id, a, JSON.stringify(await ev(() => window.__demo.demo.cut.info)), await pr());
    }
    const names = await ev(() => window.__demo.demo.engine.renderer.info.programs.map((p) => p.name + ':' + p.cacheKey.length));
    console.log(names.join('\n'));
  },
  async tp() {
    for (const [x, z] of [[30, 20], [37.5, 15.2], [10, 27]]) {
      const r = await ev(([x, z]) => { const p = window.__demo.demo.player; const a = p.teleport(x, z); return [a, [p.position.x, p.position.z], p.collision.free(x, z), p.collision.sdf(x, z)]; }, [x, z]);
      console.log(x, z, JSON.stringify(r));
    }
  },
  /** World data for the collision model: door anchors, house records, the dais. */
  async dump() {
    const d = await ev(() => {
      const { town, layout } = window.__demo.demo;
      const r2 = (v) => Math.round(v * 100) / 100;
      const doors = town.registry.anchors('doors').map((a) => {
        const w = a.pivot ? a.pivot.getWorldPosition(new a.pivot.position.constructor()) : null;
        return { piece: a.piece, id: a.id, point: a.point ? [r2(a.point.x), r2(a.point.z)] : null, pivot: w ? [r2(w.x), r2(w.y), r2(w.z)] : null, normal: a.normal };
      });
      const houses = layout.houses.map((h) => ({ id: h.id, facing: h.facing, fp: h.footprint, corners: h.corners, door: h.door, doorPoint: h.doorPoint, n: h.doorNormal }));
      return { doors, houses, mismatch: window.__demo.demo.engine.stats.doorMismatch, ct: layout.clocktower.footprint };
    });
    console.log(JSON.stringify(d, null, 0));
  },
  /** Keyboard walking, 8 directions, Shift run, collision against a cottage. */
  async walk() {
    let i = await info(); console.log('start', JSON.stringify(i));
    await shot('walk-0');
    await hold('w', 1000); i = await info(); console.log('after W 1s', JSON.stringify(i));
    await holdMany(['w', 'd'], 600); i = await info(); console.log('after W+D 0.6s', JSON.stringify(i));
    await holdMany(['Shift', 'a'], 800); i = await info(); console.log('after Shift+A 0.8s', JSON.stringify(i));
    await wait(500);
    await shot('walk-1');
  },
  /** Collision fuzz (in page, the player's own collision.move): 20 000 random walks of 0.1-3 m from random free
   *  starts; the centre must never end inside a cottage (placed footprint, minus its door corridor), the dais or a
   *  blocked ground tile, and every sdf sample must stay >= R - 1 cm. */
  async fuzz() {
    const r = await ev(() => {
      const { player, layout } = window.__demo.demo, c = player.collision;
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      let bad = 0, tests = 0, worst = 9, inside = [];
      const p = { x: 0, z: 0 };
      for (let k = 0; k < 20000; k++) {
        let x, z;
        do { x = 1 + rnd() * 43; z = 1 + rnd() * 35; } while (!c.free(x, z));
        p.x = x; p.z = z;
        const a = rnd() * Math.PI * 2, L = 0.1 + rnd() * 3;
        c.move(p, Math.sin(a) * L, Math.cos(a) * L);
        tests++;
        const d = c.sdf(p.x, p.z); worst = Math.min(worst, d);
        const inCorr = (h) => { const q = c.doors.find((q) => q.id === h.id); if (!q) return false; const dx = p.x - q.pos.x, dz = p.z - q.pos.z, sN = dx * q.normal[0] + dz * q.normal[1], lat = Math.abs(dx * q.normal[1] - dz * q.normal[0]); return sN > -0.05 && lat < 0.5; };
        const inH = layout.houses.find((h) => layout.insideHouse(h, p.x, p.z, -0.05) && !inCorr(h));
        const inDais = Math.hypot(p.x - layout.CIRCLE.cx, p.z - layout.CIRCLE.cz) < 2.3;
        if (d < c.R - 0.01 || inH || inDais) { bad++; if (inside.length < 8) inside.push([+p.x.toFixed(2), +p.z.toFixed(2), +d.toFixed(3), inH?.id ?? (inDais ? 'dais' : '')]); }
      }
      return { tests, bad, worst: +worst.toFixed(3), R: c.R, inside, stats: c.stats };
    });
    console.log(JSON.stringify(r));
    check(r.bad === 0, `fuzz: ${r.bad} of ${r.tests} random walks ended in geometry (worst sdf ${r.worst})`);
  },
  /** Every door: teleport to 3 m in front of it, walk at it with the real keys (W after turning the camera so the
   *  door is ahead is not needed: walkTo the door front), check nearDoor + the leaf moved; screenshots of a few. */
  async doors() {
    const ids = await ev(() => window.__demo.demo.player.collision.doors.map((d) => d.id));
    for (const id of ids) {
      const r0 = await ev((id) => {
        const p = window.__demo.demo.player, d = p.collision.doors.find((q) => q.id === id);
        const s = p.spots()[id];
        p.teleport(d.pos.x + d.normal[0] * 3.2, d.pos.z + d.normal[1] * 3.2);
        return { spot: [s.x, s.z], at: [p.position.x, p.position.z], mismatch: d.mismatch };
      }, id);
      await wait(350);
      const ok = await ev((id) => window.__demo.demo.player.goTo(id, { walk: true }), id);
      await wait(1400);
      const r = await ev((id) => {
        const p = window.__demo.demo.player, d = p.collision.doors.find((q) => q.id === id);
        const rot = (o) => (o ? [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(2)) : null);
        return { at: [+p.position.x.toFixed(2), +p.position.z.toFixed(2)], near: p.nearDoor?.id ?? null, leaf: rot(d.anchor?.pivot), dist: +Math.hypot(p.position.x - d.pos.x, p.position.z - d.pos.z).toFixed(2) };
      }, id);
      console.log(id, JSON.stringify({ ...r0, ok, ...r }));
      check(r.near === id, `door ${id}: nearDoor = ${r.near} (dist ${r.dist})`);
      if (['house-14', 'house-5', 'house-0', 'house-7', 'clocktower', 'house-10'].includes(id)) await shot(`door-${id}`);
    }
  },
  /** Click to move: click a cottage roof (walk to its door), then the setts. */
  async click() {
    await teleport(22.5, 27.1, 0); await wait(400);
    // house-9's roof is right below the player at the gameplay camera
    let [sx, sy] = await toScreen(22.5, 32.5, 3.5);
    console.log('click house-9 roof at', sx, sy);
    await page.mouse.click(sx, sy);
    await wait(150); console.log('path', JSON.stringify(await info()));
    await wait(1800);
    let i = await info(); console.log('after', JSON.stringify(i));
    check(i.nearDoor === 'house-9', `click on house-9 walked to its door (nearDoor ${i.nearDoor})`);
    await shot('click-house9');
    // click the setts north-west of the dais: the path must go round the dais
    await teleport(22.5, 23.5, Math.PI); await wait(400);
    [sx, sy] = await toScreen(21.0, 15.2, 0);
    await page.mouse.click(sx, sy);
    await wait(100); i = await info(); console.log('path', JSON.stringify(i));
    await wait(250); await shot('click-dais-0');
    await wait(1800);
    i = await info(); console.log('after', JSON.stringify(i));
    check(Math.hypot(i.player[0] - 21.0, i.player[1] - 15.2) < 0.35, `click round the dais reached (21, 15.2): ${i.player}`);
    await shot('click-dais-1');
  },
  /** Camera follow lock: the character's snapped position vs the snapped camera, per frame, while walking. */
  async follow() {
    await teleport(22.5, 27.1, 0); await wait(400);
    await ev(() => {
      const d = window.__demo.demo, e = d.engine, cam = e.camera;
      window.__fl = [];
      const V = cam.target.constructor;
      const rec = () => {
        const root = d.player.handle?.root; if (!root) return;
        const sp = cam.snapWorld(new V(d.player.position.x, 0, d.player.position.z));
        const t = cam.texelWorld, R = cam.right, U = cam.up, cp = cam.cam.position;
        window.__fl.push([+((sp.dot(R) - cp.dot(R)) / t).toFixed(3), +((sp.dot(U) - cp.dot(U)) / t).toFixed(3), d.camera.follow?.lag?.join(',')]);
      };
      const loop = () => { rec(); if (window.__fl.length < 400) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await holdMany((opt('keys', 'd')).split('+'), 1500);
    await wait(800);
    const fl = await ev(() => window.__fl);
    const steady = fl.slice(40, 80).map((r) => r[0] + '/' + r[1]);
    console.log('screen offset (texels) first 120 frames:', JSON.stringify(fl.slice(0, 120).map((r) => `${r[0]},${r[1]}|${r[2]}`)));
    console.log('distinct offsets in frames 40-80 (steady walk):', [...new Set(steady)].join(' '));
  },
};

let code = 0;
try {
  const t0 = Date.now();
  await page.goto(`http://pixel3d.local/demo.html${opt('q', '') ? '?' + opt('q', '') : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
  console.log('ready after', Date.now() - t0, 'ms');
  await wait(Number(opt('wait', '1500')));
  if (!SCENARIOS[scenario]) throw new Error(`unknown scenario '${scenario}' (${Object.keys(SCENARIOS).join(' ')})`);
  await SCENARIOS[scenario]();
  const e = await ev(() => window.__demo.errors);
  if (e?.length) bad.push(...e.map((x) => `[__demo] ${x}`));
  console.log('final', JSON.stringify(await info()));
} catch (e) { bad.push('CHECK FAILED: ' + (e.stack || e.message)); }
if (logs.length) console.log('console:\n' + logs.slice(0, 40).join('\n'));
if (fails.length) { console.error('ASSERTIONS FAILED:\n' + fails.join('\n')); code = 1; }
if (bad.length) { console.error('ERRORS:\n' + bad.slice(0, 40).join('\n')); code = 1; }
await browser.close();
process.exit(code);
