// Headless capture harness (charkit copy of pixel3d tools/shot.mjs; runs where tools/remote.sh runs: locally by default).
//   node tools/shot.mjs <scene> <out.png> [--size 1280x720] [--t 2.5] [--times 0,0.1,0.2]
//        [--q key=val&key2=val] [--gpu-info] [--timeout 60000] [--bench N]
// Serves the repo through request interception at http://pixel3d.local/ (no ports, no file://).
// Page contract: window.__pixel = { ready, renderAt(t), errors[] } (see src/core/Engine.js).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const scene = args[0];
const out = args[1];
if (!scene || !out) { console.error('usage: shot.mjs <scene> <out.png> [opts]'); process.exit(2); }
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const times = opt('times', opt('t', '2.0')).split(',').map(Number);
const extra = opt('q', '').replace(/#/g, '%23');   // (module fix T20) a '#' in --q (hex colours, JSON) used to start the URL fragment
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // (charkit) fileURLToPath: paths with spaces / Windows
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glsl': 'text/plain', '.css': 'text/css', '.wasm': 'application/wasm' };

// (charkit) GPU backend: PIXEL3D_GL=auto (default) | vulkan | gl | metal | d3d11 | swiftshader | none.
// auto = ANGLE/Vulkan on Linux (what pixel3d uses on an NVIDIA box), the platform default elsewhere (Metal on macOS,
// D3D11 on Windows). Without a usable GPU Chromium falls back to SwiftShader (software: correct pixels, ~5-20x slower);
// force it with PIXEL3D_GL=swiftshader if the GPU path fails. The GPU in use is printed with --gpu-info (charpack: report.txt).
function glArgs() {
  const gl = (process.env.PIXEL3D_GL || "auto").toLowerCase();
  const base = ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
  const angle = gl === "auto" ? (process.platform === "linux" ? "vulkan" : null) : (gl === "none" ? null : gl);
  return angle ? [...base, "--use-gl=angle", `--use-angle=${angle}`] : base;
}

const browser = await chromium.launch({
  headless: true,
  args: glArgs(),
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.route('http://pixel3d.local/**', async (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
const url = `http://pixel3d.local/index.html?scene=${encodeURIComponent(scene)}&capture=1${extra ? '&' + extra : ''}`;
let code = 0;
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__pixel && (window.__pixel.ready || window.__pixel.errors.length), null, { timeout: Number(opt('timeout', '60000')) });
  if (flag('gpu-info')) console.log('GPU:', await page.evaluate(() => window.__pixel.gpu));
  const errs = await page.evaluate(() => window.__pixel.errors);
  if (errs.length) { console.error('PAGE ERRORS:\n' + errs.join('\n')); code = 1; }
  const canvas = await page.$('canvas');
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.__pixel.renderAt(t), times[i]);
    const file = times.length > 1 ? out.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`) : out;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await canvas.screenshot({ path: file });
    console.log('wrote', file, `t=${times[i]}`);
  }
  const info = await page.evaluate(() => window.__pixel.info && window.__pixel.info());
  if (info) console.log('info:', JSON.stringify(info));
  // --bench N: render N more frames (1/60 s apart) inside the page, each followed by a 1-pixel readPixels
  // (GPU sync), and report mean / max wall ms per frame plus whether the shader-program count changed.
  const bench = Number(opt('bench', '0'));
  if (bench > 0) {
    const r = await page.evaluate((n) => {
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2');
      const px = new Uint8Array(4);
      const t0 = 3;
      const prog0 = window.__pixel.info().programs;
      const ms = [];
      for (let i = 0; i < n; i++) {
        const a = performance.now();
        window.__pixel.renderAt(t0 + i / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ms.push(performance.now() - a);
      }
      const inf = window.__pixel.info();
      ms.sort((x, y) => x - y);
      return { frames: n, meanMs: +(ms.reduce((x, y) => x + y, 0) / n).toFixed(2), medianMs: +ms[n >> 1].toFixed(2),
        maxMs: +ms[n - 1].toFixed(2), programsBefore: prog0, programsAfter: inf.programs, calls: inf.calls, stages: inf.stages };
    }, bench);
    console.log('bench:', JSON.stringify(r));
  }
} catch (e) { console.error('CAPTURE FAILED:', e.message); code = 1; }
if (logs.length) console.log('console:\n' + logs.slice(0, 40).join('\n'));
await browser.close();
process.exit(code);
