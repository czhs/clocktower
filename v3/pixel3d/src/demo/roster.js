// Demo character roster, browser side (owner: demo characters; docs/DEMO.md §4.2).
//   loadRoster()   -> Promise<manifest>  src/demo/roster.json (tools/demo-roster.mjs) or, if it is missing / broken, the
//                     built-in fallback (the shipped four of docs/CHARACTER_STATUS.md, 2026-10-16). Manifest rows (v2):
//                     { id, name, status 'shipped'|'wip', offered (loads + animates), complete (= offered), verified? ... }
//   loadSpec(id)   -> Promise<{ spec, mod }>  imports characters/<id>.js once (cached), validates the default export;
//                     rejects with an Error (never throws at import time of this module)
//   probe(id)      -> Promise<{ ok, error?, ms }>  loadSpec without throwing (used to drop broken characters at boot)
//   wipMode()      -> boolean  ?wip=1: also offer the work-in-progress characters (internal testing)
//   publicOffer(c, roster) / wipOffer(c) -> boolean  whether a manifest row is offered publicly / with ?wip=1
// The PUBLIC demo offers only FINISHED characters (manifest v3 `offered`: shipped in CHARACTER_STATUS.md, a final
// critic verdict that ships, or the user allow-list src/demo/roster-allow.json; tools/demo-roster.mjs decides).
// ?wip=1 adds the playable work in progress (`wipOffered`), labelled WIP. Older manifests (v1/v2, where `offered`
// included WIP rows) are read the same way: publicly only status 'shipped'.
// The character session keeps editing characters/* while the demo runs: every import is guarded and a failure only
// removes that character from the offer. ?roster=all (debug) offers every character that loads, complete or not;
// ?roster=a,b,c offers exactly those ids (if they load); ?roster=shipped = the finished ones.

export const FALLBACK = {
  generated: null,
  generator: 'built-in fallback (src/demo/roster.js)',
  complete: ['wanderer', 'keeper', 'hound', 'duelist'],
  characters: [
    { id: 'wanderer', name: 'Wanderer', complete: true, offered: true, status: 'shipped', reason: 'fallback: CHARACTER_STATUS shipped' },
    { id: 'keeper', name: 'Keeper', complete: true, offered: true, status: 'shipped', reason: 'fallback: CHARACTER_STATUS shipped' },
    { id: 'hound', name: 'Hound', complete: true, offered: true, status: 'shipped', reason: 'fallback: CHARACTER_STATUS shipped' },
    { id: 'duelist', name: 'Duelist', complete: true, offered: true, status: 'shipped', reason: 'fallback: CHARACTER_STATUS shipped' },
  ],
};

const ID_OK = /^[a-z0-9][a-z0-9-]*$/;

export function wipMode(search = globalThis.location?.search ?? '') {
  const v = new URLSearchParams(search).get('wip');
  return v != null && !['0', 'false', 'off', 'no'].includes(v.toLowerCase());
}
/** finished: v3 `finished`, else status 'shipped' (the fallback roster's rows are shipped) */
export const isFinished = (c) => (c.finished ?? (c.status ? c.status === 'shipped' : !!c.shipped));
/** loads + animates: v3 `playable`; v2 `offered` (any status); v1 `complete` */
const isPlayable = (c) => !!(c.playable ?? c.offered ?? c.complete);
export const publicOffer = (c) => isFinished(c) && isPlayable(c);
export const wipOffer = (c) => isPlayable(c);
let rosterP = null;
const specs = new Map();

export function loadRoster() {
  rosterP ??= (async () => {
    try {
      const r = await fetch(new URL('./roster.json', import.meta.url), { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = await r.json();
      if (!Array.isArray(m?.characters) || !m.characters.length) throw new Error('no characters[]');
      m.characters = m.characters.filter((c) => typeof c?.id === 'string' && ID_OK.test(c.id));
      m.source = 'roster.json';
      return m;
    } catch (e) {
      console.warn('[demo] roster.json unavailable, using the built-in roster:', e?.message || e);
      return { ...FALLBACK, characters: FALLBACK.characters.map((c) => ({ ...c })), source: 'fallback' };
    }
  })();
  return rosterP;
}

export function loadSpec(id) {
  if (typeof id !== 'string' || !ID_OK.test(id)) return Promise.reject(new Error(`bad character id '${id}'`));
  if (!specs.has(id)) {
    const p = import(`../../characters/${id}.js`).then((mod) => {
      const spec = mod.default;
      if (!spec || typeof spec !== 'object') throw new Error(`character '${id}': no default export spec`);
      if (!spec.skeleton) throw new Error(`character '${id}': spec has no skeleton`);
      if (!Array.isArray(spec.parts) || !spec.parts.length) throw new Error(`character '${id}': spec has no parts`);
      return { spec, mod };
    });
    p.catch(() => specs.delete(id));   // a later retry (after the character session fixes it) re-imports... once the
    specs.set(id, p);                   // browser's module map lets it (a failed module stays failed until reload)
  }
  return specs.get(id);
}

export async function probe(id, timeoutMs = 8000) {
  const t0 = performance.now();
  try {
    await Promise.race([loadSpec(id), new Promise((_, rej) => setTimeout(() => rej(new Error(`import timed out after ${timeoutMs} ms`)), timeoutMs))]);
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).split('\n')[0], ms: Math.round(performance.now() - t0) };
  }
}
