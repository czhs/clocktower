// Probe: which Chromium flags give hardware WebGL on hshi-u1 (for the egg verification run).
import { chromium } from '@playwright/test';
const variants = {
  default: [],
  egl: ['--use-gl=egl', '--enable-gpu', '--ignore-gpu-blocklist'],
  angleVulkan: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'],
  angleGl: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'],
};
for (const [name, args] of Object.entries(variants)) {
  try {
    const b = await chromium.launch({ args });
    const p = await b.newPage();
    await p.setContent('<canvas id=c width=1280 height=800></canvas>');
    const r = await p.evaluate(async () => {
      const gl = document.getElementById('c').getContext('webgl');
      if (!gl) return { renderer: 'none' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      let frames = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          for (let i = 0; i < 50; i++) { gl.clearColor(Math.random(), 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
          frames++;
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      return { renderer, fps: frames / ((performance.now() - t0) / 1000) };
    });
    console.log(name, JSON.stringify(r));
    await b.close();
  } catch (e) {
    console.log(name, 'error', String(e).slice(0, 200));
  }
}
