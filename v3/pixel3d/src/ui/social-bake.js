// Composite bake (owner: UI lead): the drop-in replacement for v2 packages/assets/generated/social.{png,json}.
//   tools/uibake.sh social [--strict]
// v2 keeps the markers (pins, drop, finger, ping), the emote button icon and the 12x12 cast icons in ONE atlas. Each
// group bakes its own atlas (out/ui/<group>.*); this module re-packs the v2-named frames of markers + emotes + portraits
// into social.png with the v2 manifest shape (frames + meta: anchors, fps, point, pinIcon, icons, pinColors, ...).
// Frames come from the groups' bake modules (src/ui/<group>/bake.js frames()); a group that has not landed yet is
// skipped and its frames show up as MISSING in the coverage line. Meta (module fix 2026-10-17): social.json stays
// v2-shaped. v2 meta keys from the groups override the v2 base (later group wins; anchors / fps merged per entry, but
// only entries for v2 anchor keys or for frames that are IN this atlas); every other group key (newStyle, emotePop, pie,
// timing, paletteAudit, per-frame anchors of frames not in social.png, ...) lands under meta.newStyle.<group>, so groups
// never overwrite each other ('icons' stays the v2 list minus the skips). Skipped by the user: 'nick_face' and the
// pipeline/skip.txt member.
const GROUPS = ['markers', 'emotes', 'portraits'];
export const SOCIAL_SKIP = ['nick_face', 'icon_nicksong', 'icon_brianbi'];   // brianbi: no pixel3d character (v2 HD import only)

let v2cache = null;
async function v2() { return (v2cache ??= await (await fetch('refs/ui/_src/social.json')).json()); }

export default {
  image: 'social.png',
  width: 256,
  v2: 'social.json',
  skip: SOCIAL_SKIP,
  async frames(env) {
    const want = new Set(Object.keys((await v2()).frames).filter((n) => !SOCIAL_SKIP.includes(n)));
    const out = [];
    this._metas = [];
    for (const g of GROUPS) {
      let mod = null;
      try { mod = (await import(`./${g}/bake.js`)).default; } catch (e) { console.warn(`social-bake: ${g} has no bake.js yet (${e.message.slice(0, 80)})`); continue; }
      const fr = await mod.frames({ ...env, group: g });
      for (const [n, im] of fr) if (want.has(n) && !out.some(([m]) => m === n)) out.push([n, im]);
      if (mod.meta) this._metas.push([g, await mod.meta({ ...env, group: g }, {})]);
    }
    // keep the v2 frame order (stable layout, easy diffing against the v2 sheet)
    const order = [...want];
    out.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    return out;
  },
  async meta(env, rects = {}) {
    const base = (await v2()).meta;
    const V2KEYS = new Set(Object.keys(base));
    const m = { iconSize: base.iconSize, icons: base.icons.filter((i) => !SOCIAL_SKIP.includes(`icon_${i}`)), pinColors: base.pinColors,
      pinColorHex: base.pinColorHex, pinIcon: base.pinIcon, anchors: { ...base.anchors }, fps: { ...base.fps }, point: base.point, place: base.place };
    delete m.anchors.nick_face;
    const v2Entry = { anchors: new Set(Object.keys(base.anchors)), fps: new Set(Object.keys(base.fps)) };
    const names = Object.keys(rects);
    const inAtlas = (k) => names.some((n) => n === k || n.startsWith(k + '_'));
    const newStyle = {};
    const ns = (g) => (newStyle[g] ??= {});
    for (const [g, gm] of this._metas || []) {
      for (const [k, v] of Object.entries(gm || {})) {
        if (k === 'anchors' || k === 'fps') {
          for (const [e, ev] of Object.entries(v || {})) {
            if (v2Entry[k].has(e) || inAtlas(e)) m[k][e] = ev;
            else (ns(g)[k] ??= {})[e] = ev;
          }
        } else if (k === 'newStyle' && v && typeof v === 'object') Object.assign(ns(g), v);
        else if (k === 'icons' || k === 'bakedBy' || k === 'tod') continue;
        else if (V2KEYS.has(k)) m[k] = v;
        else ns(g)[k] = v;
      }
    }
    if (Object.keys(newStyle).length) m.newStyle = newStyle;
    return m;
  },
};
