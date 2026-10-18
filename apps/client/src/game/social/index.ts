// In-world social layer entry (v3 WP0s): pointing emotes + character pins, split into
//   * controller.ts  renderer-free: gesture input, rate buckets, the optimistic pins model, emote models and
//                    the four 'social:*' sends, socialActions + the pie menu — no Phaser;
//   * phaserView.ts  the Phaser drawing (pin / emote sprites, hover badge, cursor, __ctSocial) and
//                    `createSocialLayer(scene, ctx)`, the TownScene hook.
// The v3 3D town drives controller.ts with its own SocialSurface (game3d/overlay/socialView.ts). Existing
// importers of './social' keep working through this barrel.
export { createSocialLayer, type SocialCtx, type SocialLayer } from './phaserView';
export {
  createSocialController,
  type DisplayPin,
  type EmoteModel,
  type SocialConn,
  type SocialController,
  type SocialControllerCtx,
  type SocialCursor,
  type SocialPinHit,
  type SocialPointer,
  type SocialSurface,
} from './controller';
