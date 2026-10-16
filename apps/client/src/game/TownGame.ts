// Phaser bootstrap (lazy-loaded by GameScreen so the lobby UI does not wait for Phaser).
import * as Phaser from 'phaser';
import { FrameGate, renderScaleFor, TierState } from './fx/tier';
import { outdoorZoom, TownScene, type TownBridge } from './TownScene';

export function createTownGame(parent: HTMLElement, bridge: TownBridge): { destroy(): void } {
  const size = () => ({ w: Math.max(64, Math.floor(parent.clientWidth)), h: Math.max(64, Math.floor(parent.clientHeight)) });
  const s0 = size();
  // Opt-in frame cap (tests / low-power): localStorage 'ct.debug.fps' = e.g. '8'.
  let fpsLimit = 0;
  try {
    fpsLimit = Number(localStorage.getItem('ct.debug.fps') ?? 0) || 0;
  } catch {
    // storage blocked
  }
  const forceTimeout = import.meta.env.DEV && !!(window as unknown as { __ctForceTimeout?: boolean }).__ctForceTimeout;
  // Render tier (fx/tier.ts): 60 fps cap, 30 + lighter ambience on the low tier. The debug cap's
  // frame times are artificial, so it never auto-drops the tier.
  const tier = new TierState(performance.now(), undefined, fpsLimit <= 0 && !forceTimeout);
  const k0 = renderScaleFor(tier.tier, outdoorZoom(s0.w, s0.h));
  tier.renderScale = k0;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.round(s0.w * k0),
    height: Math.round(s0.h * k0),
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
    ...(forceTimeout ? { fps: { forceSetTimeOut: true, target: 30 } } : fpsLimit > 0 ? { fps: { limit: fpsLimit } } : {}),
    scene: [new TownScene(bridge, tier)],
  });
  if (!forceTimeout && fpsLimit <= 0) gateLoop(game, tier);
  // Canvas size = CSS size x render scale (1 except on the low tier, see fx/tier.ts); a scaled canvas
  // is stretched back to the CSS size by its style (image-rendering: pixelated in game.css).
  let styled = k0 !== 1;
  const fit = () => {
    if (!game.scale || !game.canvas) return;
    const s = size();
    const k = renderScaleFor(tier.tier, outdoorZoom(s.w, s.h));
    const cw = Math.round(s.w * k);
    const ch = Math.round(s.h * k);
    const changed = k !== tier.renderScale || cw !== game.scale.width || ch !== game.scale.height;
    tier.renderScale = k;
    if (changed) game.scale.resize(cw, ch);
    if (k !== 1 || styled) {
      game.canvas.style.width = k !== 1 ? `${s.w}px` : '';
      game.canvas.style.height = k !== 1 ? `${s.h}px` : '';
      styled = k !== 1;
      game.scale.refresh(); // pointer mapping (display scale) from the styled size
    }
  };
  game.events.once(Phaser.Core.Events.READY, fit);
  const ro = new ResizeObserver(fit);
  ro.observe(parent);
  const offTier = tier.subscribe(fit);
  return {
    destroy() {
      offTier();
      ro.disconnect();
      game.destroy(true);
    },
  };
}

/**
 * Tier frame cap. Phaser's own `fps.limit` drops whole frames on ordinary rAF jitter (a 16.5 ms
 * tick under a 60 cap is skipped), so the loop's limiter hook is replaced by a grid gate
 * (fx/tier.ts FrameGate) before the loop starts; skipped ticks neither update nor render, and
 * the next step gets the full elapsed delta.
 */
function gateLoop(game: Phaser.Game, tier: TierState) {
  const loop = game.loop as unknown as { hasFpsLimit: boolean; stepLimitFPS: (time: number) => void; step: (time: number) => void };
  const gate = new FrameGate();
  let last = -1;
  tier.subscribe(() => gate.reset());
  loop.hasFpsLimit = true;
  loop.stepLimitFPS = (time: number) => {
    if (!gate.pass(time, tier.frameMs)) return;
    if (last >= 0) tier.sample(time - last, time);
    last = time;
    loop.step(time);
  };
}
