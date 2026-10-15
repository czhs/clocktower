// "Who can hear me" in the world (docs/vision.md): a soft sound-wave ring under the feet of any
// VISIBLE character who is speaking, and a small muted-mic icon by the local player's name while
// muted. Speaking state comes from voicePresence; rings are drawn only for avatars TownScene shows
// (same location as us), so nothing about hidden players is revealed.
import * as Phaser from 'phaser';
import { voicePresence } from '../../voice/VoiceClient';
import { UPRIGHT_Y } from './projection';

export const MUTED_ICON = 'ui-muted';
export const MUTED_ICON_URL = `${import.meta.env.BASE_URL ?? '/'}art/ui/muted.png`;

export interface VoiceBody {
  pid: string;
  x: number;
  y: number;
}

export class VoiceMarks {
  private g: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image | null = null;
  private speaking = new Set<string>();
  private muted = false;
  private selfPid: string | null = null;
  private since = new Map<string, number>();

  constructor(
    private scene: Phaser.Scene,
    toOverlay: (o: Phaser.GameObjects.GameObject) => void,
    offs: (() => void)[],
  ) {
    // just above the ground/dust, under every character (10 + y)
    this.g = scene.add.graphics().setDepth(2.7);
    if (scene.textures.exists(MUTED_ICON)) {
      this.icon = scene.add.image(0, 0, MUTED_ICON).setOrigin(0, 0.5).setDepth(5210).setVisible(false);
      toOverlay(this.icon);
    }
    const on = (p: ReturnType<typeof voicePresence.get>) => {
      this.speaking = new Set(p.speaking);
      this.muted = p.selfMuted;
      this.selfPid = p.selfPid;
    };
    on(voicePresence.get());
    offs.push(voicePresence.subscribe(on));
  }

  /**
   * @param bodies characters visible to us in our location (incl. ourselves as `myPid`)
   * @param label the local player's name label (icon sits to its right), or null
   */
  update(bodies: readonly VoiceBody[], myPid: string | null, label: Phaser.GameObjects.Text | null, zoom: number, dark: number, still = false) {
    const g = this.g;
    g.clear();
    const now = performance.now() / 1000;
    for (const b of bodies) {
      const talking = this.speaking.has(b.pid) || (b.pid === myPid && this.selfPid !== null && this.speaking.has(this.selfPid));
      if (!talking) {
        this.since.delete(b.pid);
        continue;
      }
      const t0 = this.since.get(b.pid) ?? now;
      this.since.set(b.pid, t0);
      const fadeIn = Math.min(1, (now - t0) / 0.25);
      // two soft waves spreading from the feet, ~1.1 s apart
      for (let k = 0; k < 2; k++) {
        // reduced motion: two static rings instead of spreading waves
        const age = still ? 0.15 + k * 0.4 : ((now - t0) / 1.1 + k * 0.5) % 1;
        const rx = 7 + age * 9;
        const ry = rx * 0.38;
        const a = (1 - age) * (0.55 + 0.25 * dark) * fadeIn;
        ellipse(g, b.x, b.y + 1, rx, ry, dark > 0.5 ? 0xf2e6c8 : 0xe4d8ba, a);
      }
    }
    const ic = this.icon;
    if (ic) {
      const show = this.muted && !!label && label.visible && label.alpha > 0.05;
      ic.setVisible(show);
      if (show) {
        const s = 1.25 / zoom; // 16 px art at 1.25 CSS px per texel = 20 CSS px
        ic.setScale(s, s * UPRIGHT_Y).setPosition(label!.x + label!.displayWidth + 3 / zoom, label!.y + label!.displayHeight / 2).setAlpha(label!.alpha);
      }
    }
  }
}

/** 1 px pixel ellipse outline. */
function ellipse(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, color: number, alpha: number) {
  if (alpha <= 0.02) return;
  g.fillStyle(color, alpha);
  const n = Math.max(12, Math.round(rx * 5));
  let lx = NaN;
  let ly = NaN;
  for (let i = 0; i < n; i++) {
    const x = Math.round(cx + Math.cos((i / n) * Math.PI * 2) * rx);
    const y = Math.round(cy + Math.sin((i / n) * Math.PI * 2) * ry);
    if (x === lx && y === ly) continue;
    g.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}
