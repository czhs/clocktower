// Composite bake (owner: UI lead): the drop-in replacement for v2 packages/assets/generated/social.{png,json}.
//   tools/uibake.sh social [--strict]
// v2 keeps the markers (pins, drop, finger, ping), the emote button icon and the 12x12 cast icons in ONE atlas. Each
// group bakes its own atlas (out/ui/<group>.*); this module re-packs the v2-named frames of markers + emotes + portraits
// into social.png with the v2 manifest shape (frames + meta: anchors, fps, point, pinIcon, icons, pinColors, ...).
// Frames come from the groups' bake modules (src/ui/<group>/bake.js frames()); a group that has not landed yet is
// skipped and its frames show up as MISSING in the coverage line. Meta keys: the groups' meta are merged (later wins
// per key; anchors / fps merged per entry). Skipped by the user: 'nick_face' and the pipeline/skip.txt member.
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
      if (mod.meta) this._metas.push(await mod.meta({ ...env, group: g }, {}));
    }
    // keep the v2 frame order (stable layout, easy diffing against the v2 sheet)
    const order = [...want];
    out.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    return out;
  },
  async meta() {
    const base = (await v2()).meta;
    const m = { iconSize: base.iconSize, icons: base.icons.filter((i) => !SOCIAL_SKIP.includes(`icon_${i}`)), pinColors: base.pinColors,
      pinColorHex: base.pinColorHex, pinIcon: base.pinIcon, anchors: { ...base.anchors }, fps: { ...base.fps }, point: base.point, place: base.place };
    delete m.anchors.nick_face;
    for (const g of this._metas || []) {
      for (const [k, v] of Object.entries(g)) {
        if (k === 'anchors' || k === 'fps') Object.assign(m[k], v);
        else m[k] = v;
      }
    }
    return m;
  },
};
