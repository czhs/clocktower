// Phaser bootstrap (lazy-loaded by GameScreen so the lobby UI does not wait for Phaser).
import * as Phaser from 'phaser';
import { TownScene, type TownBridge } from './TownScene';

export function createTownGame(parent: HTMLElement, bridge: TownBridge): { destroy(): void } {
  const size = () => ({ w: Math.max(64, Math.floor(parent.clientWidth)), h: Math.max(64, Math.floor(parent.clientHeight)) });
  const s0 = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: s0.w,
    height: s0.h,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#09070d',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, gamepad: false },
    // We size the canvas ourselves (ResizeObserver) — fills the container at any size.
    scale: { mode: Phaser.Scale.NONE },
    render: { antialias: false, powerPreference: 'high-performance' },
    // dev sandbox only: keep ticking in a hidden pane (RAF is paused there)
    ...(import.meta.env.DEV && (window as unknown as { __ctForceTimeout?: boolean }).__ctForceTimeout ? { fps: { forceSetTimeOut: true, target: 30 } } : {}),
    scene: [new TownScene(bridge)],
  });
  const ro = new ResizeObserver(() => {
    const s = size();
    if (game.scale && (s.w !== game.scale.width || s.h !== game.scale.height)) game.scale.resize(s.w, s.h);
  });
  ro.observe(parent);
  return {
    destroy() {
      ro.disconnect();
      game.destroy(true);
    },
  };
}
