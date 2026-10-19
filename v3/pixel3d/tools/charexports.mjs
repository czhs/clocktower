// Lead: check src/chars/index.js — every module imports and no export name clashes (an `export *` clash silently
// drops the name). Run on render-host: tools/remote.sh node tools/charexports.mjs  → "dups []".
const mods = ['rig', 'kit', 'look', 'anim', 'dynamics', 'ik', 'locomotion', 'character', 'smear', 'fx'];
const seen = {};
for (const m of mods) {
  const ns = await import(`../src/chars/${m}.js`);
  for (const k of Object.keys(ns)) (seen[k] ||= []).push(m);
}
const dups = Object.entries(seen).filter(([, v]) => v.length > 1);
console.log('exports', Object.keys(seen).length, 'dups', JSON.stringify(dups));
const idx = await import('../src/chars/index.js');
console.log('index exports', Object.keys(idx).length);
if (dups.length || Object.keys(idx).length !== Object.keys(seen).length) process.exit(1);
