import { useEffect, useRef } from 'preact/hooks';
import type { Cosmetics } from '@ct/protocol';
import { CHAR, composeSheet, frameIndex, layerKeys, loadCharactersImage } from './sprites';

// OWNED BY world-art. Renders the composed character sprite for a cosmetics selection
// (used by the lobby cosmetics editor). Walks in place, turning every couple of seconds.
export function CosmeticPreview(props: { cosmetics: Cosmetics; ghost?: boolean; scale?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = props.scale ?? 4;
  const keys = layerKeys({ kind: 'player', cosmetics: props.cosmetics, ghost: !!props.ghost }).join('|');

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const canvas = ref.current;
    if (!canvas) return;
    loadCharactersImage()
      .then((img) => {
        if (!alive) return;
        const sheet = composeSheet(img, keys.split('|'));
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        const dirs = ['down', 'left', 'up', 'right'] as const;
        const t0 = performance.now();
        const draw = (now: number) => {
          const t = (now - t0) / 1000;
          const dir = props.animate === false ? 'down' : dirs[Math.floor(t / 2.4) % 4]!;
          const col = props.animate === false ? 0 : 1 + (Math.floor(t * CHAR.walkFps * 0.8) % (CHAR.frames.length - 1));
          const f = frameIndex(dir, col);
          const cols = CHAR.frames.length;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            sheet,
            (f % cols) * CHAR.frameWidth,
            Math.floor(f / cols) * CHAR.frameHeight,
            CHAR.frameWidth,
            CHAR.frameHeight,
            0,
            0,
            CHAR.frameWidth * scale,
            CHAR.frameHeight * scale,
          );
          if (props.animate !== false) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [keys, scale, props.animate]);

  return (
    <canvas
      ref={ref}
      width={CHAR.frameWidth * scale}
      height={CHAR.frameHeight * scale}
      style={{ imageRendering: 'pixelated', width: `${CHAR.frameWidth * scale}px`, height: `${CHAR.frameHeight * scale}px` }}
      aria-label="Character preview"
      role="img"
    />
  );
}
