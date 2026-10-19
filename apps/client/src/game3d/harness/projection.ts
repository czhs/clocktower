// v3 WP7 (v3-qa). Harness scenario `projection` (docs/v3/INTEGRATION.md §1.5): checks coords.ts worldToCss against
// what the pixel pipeline really draws. For each pixel scale (2, 3, 4: canvas height = scale·360 at the 'high' tier,
// pixelScaleFor) and each world point, one camera-facing quad exactly one low-res texel wide is drawn on the
// COLOR_ONLY layer (no normal / outline pass) in an otherwise empty scene, the camera target is moved by a fraction
// of a texel (so the sub-texel offset path runs), the frame is rendered and read back with gl.readPixels in the same
// task (no preserveDrawingBuffer needed). The quad covers exactly one texel = a scale×scale CSS block; worldToCss must
// land inside that block (±0.5 CSS px). A naive `project()` mapped onto the canvas rect (no MARGIN, no offset) is
// reported next to it for comparison (it is off by MARGIN·scale CSS px).
import * as THREE from 'three';
import { createEngineHost } from '../vendor/engineHost';
import { worldToCss } from '../coords';

/** Vendor src/core/PixelPipeline.js LAYERS.COLOR_ONLY (objects on it skip the normal pass). */
const COLOR_ONLY_LAYER = 1;

export interface ProjectionSample {
  scale: number;
  point: [number, number, number];
  offset: { x: number; y: number };
  expected: { x: number; y: number };
  /** Drawn block (page CSS px, inclusive-exclusive), null when the marker was not found. */
  block: { x0: number; y0: number; x1: number; y1: number; px: number } | null;
  /** Distance of `expected` to the block centre (CSS px). */
  err: number | null;
  /** Naive mapping error (CSS px) for comparison. */
  naiveErr: number | null;
  ok: boolean;
}

export interface ProjectionResult {
  ok: boolean;
  samples: ProjectionSample[];
  gpu: string | null;
}

export async function runProjection(root: HTMLElement, points: [number, number, number][], scales: number[]): Promise<ProjectionResult> {
  const samples: ProjectionSample[] = [];
  let gpu: string | null = null;
  for (const scale of scales) {
    const parent = document.createElement('div');
    // a non-zero page offset, so rect.left / rect.top are exercised too
    parent.style.position = 'absolute';
    parent.style.left = '13px';
    parent.style.top = '7px';
    parent.style.width = '960px';
    parent.style.height = `${scale * 360}px`;
    parent.style.overflow = 'hidden';
    root.appendChild(parent);
    const host = createEngineHost(parent, { tier: 'high' });
    try {
      gpu = host.gpu();
      const engine = host.engine as unknown as {
        scene: THREE.Scene;
        renderer: THREE.WebGLRenderer;
        camera: { set(o: object): void; texelWorld: number; cam: THREE.Camera; offset: { x: number; y: number } };
        pixelScale: number;
        width: number;
        height: number;
      };
      const target = new THREE.Vector3(22.5, 0, 22);
      engine.camera.set({ target, yaw: 0, pitch: Math.PI / 6, viewHeight: 12 });
      host.renderNow(0);
      const texel = engine.camera.texelWorld;
      const geo = new THREE.PlaneGeometry(texel, texel);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, toneMapped: false, side: THREE.DoubleSide });
      const marker = new THREE.Mesh(geo, mat);
      marker.layers.set(COLOR_ONLY_LAYER);
      engine.scene.add(marker);
      const gl = engine.renderer.getContext();
      const w = engine.width;
      const h = engine.height;
      const buf = new Uint8Array(w * h * 4);
      const rect = parent.getBoundingClientRect();
      for (const [k, p] of points.entries()) {
        // a different sub-texel camera position for every point (0.13, 0.37, … of a texel)
        const frac = ((k * 0.37 + 0.13) % 1) * texel;
        engine.camera.set({ target: new THREE.Vector3(target.x + frac, 0, target.z - frac * 0.7) });
        marker.position.set(p[0], p[1], p[2]);
        host.renderNow((k + 1) / 30); // camera.update() inside, then the pipeline
        marker.quaternion.copy(engine.camera.cam.quaternion); // camera-facing (orthographic: exactly one texel)
        marker.updateMatrixWorld(true);
        host.renderNow((k + 1) / 30 + 0.001);
        const proj = host.projection();
        engine.renderer.setRenderTarget(null);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        let n = 0;
        for (let row = 0; row < h; row++)
          for (let col = 0; col < w; col++) {
            const i = (row * w + col) * 4;
            const r = buf[i]!;
            const g = buf[i + 1]!;
            const b = buf[i + 2]!;
            if (r > 160 && b > 160 && g < 90) {
              const cy = h - 1 - row; // GL rows are bottom-up
              x0 = Math.min(x0, col);
              x1 = Math.max(x1, col + 1);
              y0 = Math.min(y0, cy);
              y1 = Math.max(y1, cy + 1);
              n++;
            }
          }
        const expected = worldToCss(proj, p[0], p[1], p[2]);
        const v = new THREE.Vector3(p[0], p[1], p[2]).project(engine.camera.cam as THREE.Camera);
        const naive = { x: rect.left + ((v.x + 1) / 2) * w, y: rect.top + ((1 - v.y) / 2) * h };
        let block: ProjectionSample['block'] = null;
        let err: number | null = null;
        let naiveErr: number | null = null;
        let ok = false;
        if (n > 0) {
          block = { x0: rect.left + x0, y0: rect.top + y0, x1: rect.left + x1, y1: rect.top + y1, px: n };
          const cx = (block.x0 + block.x1) / 2;
          const cy = (block.y0 + block.y1) / 2;
          err = Math.hypot(expected.x - cx, expected.y - cy);
          naiveErr = Math.hypot(naive.x - cx, naive.y - cy);
          ok = expected.x >= block.x0 - 0.5 && expected.x <= block.x1 + 0.5 && expected.y >= block.y0 - 0.5 && expected.y <= block.y1 + 0.5;
        }
        samples.push({ scale: engine.pixelScale, point: p, offset: { x: proj.offset.x, y: proj.offset.y }, expected, block, err, naiveErr, ok });
      }
      engine.scene.remove(marker);
      geo.dispose();
      mat.dispose();
    } finally {
      host.dispose();
      parent.remove();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { ok: samples.length > 0 && samples.every((s) => s.ok), samples, gpu };
}
