// v3 perf (classic): pixel proof for apps/client/src/game/render/fan.ts. Renders, in real Phaser 3.90 WebGL on
// SwiftShader (the Classic CPU stand-in), each shape twice side by side: once with Phaser's own path call
// (fillEllipse / slice + fillPath / fillCircle) and once with the triangle-fan helper, at the town's zooms, with
// translucent fills over a patterned background, then compares the two halves pixel for pixel.
//   CT_AGENT=v3-perf-classic scripts/remote.sh pnpm exec tsx tests/perf/classic-fan-pixels.ts
// Exit 0 = identical (or within --tol differing pixels per shape set), 1 = different (prints counts).
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { REPO_ROOT } from '../support/server.js';

const argv = process.argv.slice(2);
const TOL = Number(argv.includes('--tol') ? argv[argv.indexOf('--tol') + 1] : 0);
// --selftest: the fan side draws its ellipses 1 px wider, so the comparison MUST report differences (exit 1)
const SELFTEST = argv.includes('--selftest');
const req = createRequire(path.join(REPO_ROOT, 'apps/client/package.json'));
const phaserJs = readFileSync(req.resolve('phaser/dist/phaser.min.js'), 'utf8');
const fanTs = readFileSync(path.join(REPO_ROOT, 'apps/client/src/game/render/fan.ts'), 'utf8');
const fanJs = stripTypeScriptTypes(fanTs)
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');

// never hold the browser lock for long: hard stop after 2 min
setTimeout(() => {
  console.error('timeout');
  process.exit(3);
}, 120_000).unref();

type Gfx = {
  fillStyle(c: number, a: number): unknown;
  fillEllipse(x: number, y: number, w: number, h: number): unknown;
  fillCircle(x: number, y: number, r: number): unknown;
  slice(x: number, y: number, r: number, a0: number, a1: number, acw: boolean): unknown;
  fillPath(): unknown;
  fillTriangle(...a: number[]): unknown;
};

const main = async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><body style="margin:0;background:#000"></body>');
  await page.addScriptTag({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' }); // tsx/esbuild keepNames shim
  await page.addScriptTag({ content: phaserJs });
  await page.addScriptTag({ content: `${fanJs}\nwindow.__fan = { fillEllipseFan, fillSliceFan, fillCircleFan };` });
  const results = [];
  for (const zoom of [1, 2, 2.25, 2.7, 3]) {
    const r = await page.evaluate(async ([zoom, selftest]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Phaser's global UMD build, not resolvable from tests/
      const P = (window as unknown as { Phaser: any }).Phaser;
      const fan = (window as unknown as { __fan: Record<string, (...a: unknown[]) => void> }).__fan;
      const HALF = 200; // world px between the two copies (integer screen px at every tested zoom)
      const W = Math.round(HALF * 2 * zoom);
      const H = Math.round(160 * zoom);
      return await new Promise<{ zoom: number; differ: number; total: number; renderer: string; drawn: number }>((resolve) => {
        const draw = (g: Gfx, ox: number, useFan: boolean) => {
          let i = 0;
          const ell = (x: number, y: number, w: number, h: number, col: number, a: number) => {
            g.fillStyle(col, a);
            if (useFan) fan.fillEllipseFan!(g, ox + x, y, w + (selftest ? 1 : 0), h);
            else g.fillEllipse(ox + x, y, w, h);
            i++;
          };
          // the seat markers (gameplay/phaserView.ts) at a few positions, incl. the pulsing glow sizes and wisps
          for (const [x, y] of [[20, 20], [61, 23], [100, 30], [140, 26], [33, 70]]) {
            for (const k of [0, 0.5, 1]) ell(x, y + 40 * k + 40, 22 + Math.round(4 * k), 12 + Math.round(2 * k), 0xd5b56a, 0.18 + 0.2 * k);
            ell(x, y + 1, 16, 9, 0x191c29, 0.55);
            ell(x, y, 14, 8, 0x505061, 1);
            ell(x + 1, y - 7, 6, 7, 0xcce1de, 0.65);
            ell(x, y, 14, 8, 0x8eb4c2, 0.75);
          }
          // the vote-clock hub
          for (const [x, y] of [[170, 120], [150, 140]]) {
            g.fillStyle(0x211f2c, 1);
            if (useFan) fan.fillCircleFan!(g, ox + x, y, 3);
            else g.fillCircle(ox + x, y, 3);
          }
          // the town clock wedge at many stage fractions (TownScene.drawTownClock: r = f.r * 0.86, start at the top)
          const top = -Math.PI / 2;
          let n = 0;
          for (const frac of [0.003, 0.05, 0.25, 0.4999, 0.5, 0.62, 0.9, 0.999, 1]) {
            const cx = 20 + (n % 5) * 34;
            const cy = 120 + Math.floor(n / 5) * 30;
            n++;
            for (const [col, a] of [[0xd5b56a, 0.5], [0xc0413b, 0.28]] as const) {
              g.fillStyle(col, a);
              if (useFan) fan.fillSliceFan!(g, ox + cx + 0.37, cy + 0.61, 13.1 * 0.86, top, top + frac * Math.PI * 2);
              else {
                g.slice(ox + cx + 0.37, cy + 0.61, 13.1 * 0.86, top, top + frac * Math.PI * 2, false);
                g.fillPath();
              }
            }
          }
          return i;
        };
        let drawn = 0;
        const game = new P.Game({
          type: P.WEBGL,
          width: W,
          height: H,
          pixelArt: true,
          roundPixels: true,
          backgroundColor: '#09070d',
          banner: false,
          audio: { noAudio: true },
          disablePreFX: true,
          disablePostFX: true,
          render: { antialias: false, preserveDrawingBuffer: true },
          scene: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            create(this: any) {
              const bg = this.add.graphics();
              // a patterned background so blending differences show up
              for (let y = 0; y < 160; y += 4) for (let x = 0; x < HALF * 2; x += 4) {
                bg.fillStyle((((x % HALF) * 7 + y * 13) % 255) * 0x10101, 1); // same in both halves
                bg.fillRect(x, y, 4, 4);
              }
              const a = this.add.graphics();
              const b = this.add.graphics();
              drawn = draw(a, 0, false);
              draw(b, HALF, true);
              this.cameras.main.setZoom(zoom).centerOn(HALF, 80).setRoundPixels(true);
              let frames = 0;
              this.game.events.on('postrender', () => {
                if (++frames !== 3) return;
                const gl = (game.renderer as unknown as { gl: WebGLRenderingContext }).gl;
                const px = new Uint8Array(W * H * 4);
                gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
                const hw = Math.round(HALF * zoom);
                let differ = 0;
                for (let y = 0; y < H; y++)
                  for (let x = 0; x < hw; x++) {
                    const i = (y * W + x) * 4;
                    const j = (y * W + x + hw) * 4;
                    if (px[i] !== px[j] || px[i + 1] !== px[j + 1] || px[i + 2] !== px[j + 2]) differ++;
                  }
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
                game.destroy(true);
                resolve({ zoom, differ, total: hw * H, renderer, drawn });
              });
            },
          },
        });
      });
    }, [zoom, SELFTEST] as const);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  await browser.close();
  const bad = results.filter((r) => r.differ > TOL);
  if (!/SwiftShader|llvmpipe|Software/i.test(results[0]?.renderer ?? '')) console.log('warning: not software GL');
  console.log(bad.length ? `DIFFERENT at zoom ${bad.map((r) => r.zoom).join(', ')}` : 'IDENTICAL: fan helpers draw the same pixels as Phaser paths');
  process.exit(bad.length ? 1 : 0);
};
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
