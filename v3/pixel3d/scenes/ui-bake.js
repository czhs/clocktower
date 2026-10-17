// UI atlas bake page (owner: UI lead). Driven by tools/uibake.mjs; not a visual scene.
//
//   index.html?scene=ui-bake&group=<group>[&tod=noon][&width=256][&sheetScale=4]
//
// Loads the group's bake module (src/ui/<group>/bake.js; 'kit' = src/ui/kit-bake.js, 'social' = src/ui/social-bake.js), packs its frames with the
// kit shelf packer (insertion order, 1-px gutter, v2 layout) and publishes window.__uibake = { png, json, sheet,
// coverage } (PNG data URLs + the manifest). Bake module contract: docs/UI.md §3.4.
//   export default {
//     image: 'markers.png',                         // optional, default '<group>.png'
//     width: 256,                                   // atlas width (px), optional
//     v2: 'social.json',                            // optional: v2 manifest in refs/ui/_src/ for frame-name coverage
//     skip: ['nick_face', 'icon_nicksong'],         // v2 frames intentionally absent (user skips)
//     only: (name) => name.startsWith('pin_'),      // optional: which v2 frames this group owns (coverage filter)
//     async frames(env) { return [['pin_gold', img], ...]; },   // env = { engine, kit, params, tod, T }
//     meta(env, rects) { return { anchors: {...}, fps: {...}, newStyle: {...} }; },
//     manifest(env, { img, rects, meta, image }) { ... }        // optional: custom JSON shape (e.g. cast-portraits)
//   }
import * as kit from '../src/ui/kit.js';

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const group = P('group', 'kit');
  const tod = P('tod', 'noon');
  const SHARED = { kit: '../src/ui/kit-bake.js', social: '../src/ui/social-bake.js' };   // lead-owned composite bakes
  // '<group>:<name>' = a second atlas of a group: src/ui/<group>/<name>.bake.js -> out/ui/<name>.{png,json}
  const [g0, sub] = group.split(':');
  const mod = (await import(SHARED[group] ?? (sub ? `../src/ui/${g0}/${sub}.bake.js` : `../src/ui/${group}/bake.js`))).default;
  const env = { engine, kit, params, tod, T: kit.tokens(tod), group };
  const frames = await mod.frames(env);
  const { img, rects } = kit.packAtlas(frames, { width: Number(P('width', mod.width ?? 256)) });
  const image = mod.image ?? `${sub ?? group}.png`;
  const meta = { ...(mod.meta ? await mod.meta(env, rects) : {}), bakedBy: 'pixel3d tools/uibake', tod };
  const json = mod.manifest ? await mod.manifest(env, { img, rects, meta, image }) : kit.atlasJson({ image, img, rects, meta });

  // coverage vs the v2 manifest (frame names must be kept verbatim: drop-in replacement)
  let coverage = null;
  const v2name = P('v2', mod.v2);   // ?v2=<file> overrides (tool self-test)
  if (v2name) {
    try {
      const v2 = await (await fetch(`refs/ui/_src/${v2name}`)).json();
      const skip = new Set(mod.skip || []);
      const v2names = Object.keys(v2.frames || v2.sheets || {}).filter((n) => !skip.has(n) && (!mod.only || mod.only(n)));
      const have = new Set(Object.keys(json.frames || json.sheets || rects));
      coverage = { v2: v2names.length, missing: v2names.filter((n) => !have.has(n)), extra: [...have].filter((n) => !v2names.includes(n)) };
    } catch (e) { coverage = { error: String(e.message || e) }; }
  }

  // preview sheet: every frame x sheetScale on a checker, labelled with the tiny font
  const S = Number(P('sheetScale', 4));
  const T = kit.tokens('noon');
  const cells = frames.map(([n, im]) => {
    const label = n.length > 22 ? n.slice(0, 21) + '…' : n;
    const w = Math.max(im.w * S, kit.textWidth(label, 'tiny')) + 6, h = im.h * S + 14;
    return { n, im, label, w, h };
  });
  const SW = Math.max(480, Math.min(1600, cells.reduce((a, c) => Math.max(a, c.w + 8), 0) * 6));
  let x = 4, y = 4, rowH = 0;
  for (const c of cells) {
    if (x + c.w > SW) { x = 4; y += rowH + 4; rowH = 0; }
    c.x = x; c.y = y; x += c.w + 4; rowH = Math.max(rowH, c.h);
  }
  const sheet = new kit.PixelImage(SW, y + rowH + 4).fill('#18151F');
  for (const c of cells) {
    for (let j = 0; j < c.im.h * S; j++) for (let i = 0; i < c.im.w * S; i++)
      sheet.set(c.x + 3 + i, c.y + j, ((i >> 3) + (j >> 3)) & 1 ? '#2C2836' : '#24212D');
    sheet.blit(c.im, c.x + 3, c.y, { scale: S });
    kit.drawText(sheet, c.x + 3, c.y + c.im.h * S + 4, c.label, { font: 'tiny', color: T.textDim });
  }
  const url = (im) => kit.toCanvas(im).toDataURL('image/png');
  window.__uibake = { group, png: url(img), sheet: url(sheet), json, coverage, frames: frames.length, size: [img.w, img.h] };
  engine.stats.uibake = { group, frames: frames.length, size: [img.w, img.h], coverage };
}
