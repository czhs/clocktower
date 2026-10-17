// Nick Song's 'nick-face' emote (v2.2): for NICK_FACE_MS his whole head — hair included — is replaced
// by a pixel-art 😝 sitting on his neck, then he is back to normal.
//
// How: the avatar sprite is cropped to the rows below the neck (Phaser setCrop, in frame px: the head
// and hair pixels are simply not drawn), and the `nick_face` frame of the social sheet
// (packages/assets/scripts/social/nickface.ts) is drawn with its neck anchor at feet + meta.nickFace.neck,
// one hair above the avatar in the y-sort (so the night lighting and buildings in front treat it like
// his head). The crop is undone when the emote ends, the avatar disappears or the layer is destroyed.
//
// Only events delivered by the server (it checks that the emoter really is nicksong and relays to the
// members who can see him) and our own optimistic send reach show().
import type * as Phaser from 'phaser';
import { NICK_FACE_MS } from '@ct/protocol';
import { reducedMotion } from '../fx/motion';
import type { SocialArt } from './art';

export interface NickFaceCtx {
  art: SocialArt;
  /** The avatar sprite drawing this pid (visible or not), else null. */
  spriteOf(pid: string): Phaser.GameObjects.Sprite | null;
}

export interface NickFaceLayer {
  show(pid: string): void;
  /** Is this pid's head currently a 😝 (tests / debug). */
  active(pid: string): boolean;
  update(): void;
  clear(): void;
  destroy(): void;
}

/** The emoji pops in over this long (ms; not with reduced motion). */
const POP_MS = 140;

interface Face {
  pid: string;
  t0: number;
  img: Phaser.GameObjects.Image | null;
  sprite: Phaser.GameObjects.Sprite | null;
}

export function createNickFace(scene: Phaser.Scene, ctx: NickFaceCtx): NickFaceLayer {
  const faces = new Map<string, Face>();
  const now = () => performance.now();

  function uncrop(f: Face) {
    if (f.sprite?.active) f.sprite.setCrop();
    f.sprite = null;
  }
  function drop(f: Face) {
    uncrop(f);
    f.img?.destroy();
    f.img = null;
  }

  function update() {
    const t = now();
    for (const [pid, f] of faces) {
      if (t - f.t0 >= NICK_FACE_MS) {
        drop(f);
        faces.delete(pid);
        continue;
      }
      const piece = ctx.art.nickFace();
      const spr = ctx.spriteOf(pid);
      if (!piece || !spr || !spr.active) {
        // art still loading, or he is not drawn right now: keep his normal head
        if (f.img) f.img.setVisible(false);
        if (f.sprite && f.sprite !== spr) uncrop(f);
        continue;
      }
      if (f.sprite !== spr) {
        uncrop(f);
        f.sprite = spr;
      }
      // hide the head + hair (frame rows above the neck); re-applied every frame (cheap: crop UVs
      // only) so an animation frame change or a re-skin can never bring the head back mid-emote
      const fw = spr.frame.realWidth;
      const fh = spr.frame.realHeight;
      spr.setCrop(0, piece.cropY, fw, fh - piece.cropY);
      if (!f.img) f.img = scene.add.image(0, 0, piece.key, piece.frame).setOrigin(piece.ox, piece.oy);
      const age = t - f.t0;
      const pop = reducedMotion() || age >= POP_MS ? 1 : 0.6 + 0.4 * (age / POP_MS);
      f.img
        .setPosition(Math.round(spr.x + piece.neck.x), Math.round(spr.y + piece.neck.y))
        .setScale(pop)
        .setDepth(spr.depth + 0.002)
        .setAlpha(spr.alpha)
        .setVisible(spr.visible);
    }
  }

  return {
    show(pid) {
      const old = faces.get(pid);
      if (old) {
        old.t0 = now(); // again: extend
        return;
      }
      faces.set(pid, { pid, t0: now(), img: null, sprite: null });
      update();
    },
    active: (pid) => faces.has(pid),
    update,
    clear() {
      for (const f of faces.values()) drop(f);
      faces.clear();
    },
    destroy() {
      for (const f of faces.values()) drop(f);
      faces.clear();
    },
  };
}
