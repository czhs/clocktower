// Character pipeline entry point (lead). docs/CHARACTERS.md §5. Every module re-exported; names are unique across
// modules (verify after adding exports: `tools/remote.sh node tools/charexports.mjs` → "dups []").
// Typical scene use:
//   const ch = new Character(engine, spec, { ground: terrain }); engine.scene.add(ch.root);
//   if (spec.smears) attachSmears(engine, ch, { sockets: spec.smears });
//   if (spec.fx) attachFx(engine, ch, { ground: terrain, ...spec.fx });
//   ch.drive((t) => ({ pos: pathAt(t), action: wantAttack(t) ? 'attack' : null }));
export * from './rig.js';
export * from './kit.js';
export * from './look.js';
export * from './anim.js';
export * from './dynamics.js';
export * from './ik.js';
export * from './locomotion.js';
export * from './character.js';
export * from './smear.js';
export * from './fx.js';
