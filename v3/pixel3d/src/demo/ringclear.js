// (B, vote-fix5) THE RING KEPT CLEAR during the vote (docs/DEMO.md §4.9; critic-4 P1-2: "idle NPCs walk through the ring
// during the vote; a white-shirt NPC crosses Old Delve's stone exactly as it locks"). The figure was a TOWN LIFE walker
// (src/town/life day routes, read-only here: the baker walks (31.5, 18.6) -> (14.2, 18.4) straight across the circle,
// the hound passes r 5.5 from its centre) - their timed routes cross the square ~8-20 s after a page load, exactly when
// a ceremony started at once votes. The demo's own idle NPCs (characters.js createNPCs) walk radially out from the
// nomination on and never enter it.
//
// While the vote camera is up, or the phase is the nomination / the vote, every life walker within CLEAR_R m of the
// circle's centre is hidden the way life hides a walker indoors (root scale 1e-4: the material stays compiled, the
// program count never changes): each walker's own update is wrapped, so the walker is shown again the frame it leaves
// the radius or the vote ends. Nothing else of life changes (the ambient folk keep their stations, never on the circle).
//   createRingClear(demo) -> { update(), check() -> { hidden, nearest (m: the nearest SHOWN figure: life walker or
//                              idle NPC), inside [names within CLEAR_R shown] }, info }      ?ringClear=0 = off
const CLEAR_R = 8.5;        // m (the brief: none inside r 8 m; half a metre of margin for a figure's own width)

export function createRingClear(demo) {
  const params = demo.params ?? new URLSearchParams();
  if (params.get('ringClear') === '0') return null;
  const { store } = demo;
  const C = demo.layout?.CIRCLE ?? { cx: 22.5, cz: 19.75 };
  const life = demo.town?.registry?.get?.('life');
  const walkers = life?.api?.walkers ?? [];
  const info = { walkers: walkers.length, hidden: 0, on: false };
  const on = () => !demo.player?.interior && (store.state.camera === 'vote' || store.state.phase === 'nomination' || store.state.phase === 'vote');
  const rootOff = () => life?.group?.parent?.position ?? { x: 0, z: 0 };
  const rOf = (p) => Math.hypot(p.x - C.cx, p.z - C.cz);
  const hidden = new Set();
  for (const w of walkers) {
    if (!w?.ch?.root || typeof w.update !== 'function' || w.__ringClear) continue;
    const base = w.update.bind(w);
    w.update = (tl) => {
      base(tl);
      const root = w.ch.root, o = rootOff();
      const hide = on() && rOf({ x: root.position.x + o.x, z: root.position.z + o.z }) < CLEAR_R;
      if (hide) { root.scale.setScalar(1e-4); hidden.add(w); } else hidden.delete(w);
    };
    w.__ringClear = true;
  }
  return {
    info,
    update() { info.on = on(); info.hidden = hidden.size; },
    /** the nearest figure SHOWN on the square (life walkers at full scale + the idle NPCs) and those inside CLEAR_R */
    check() {
      const o = rootOff(), shown = [];
      for (const w of walkers) { const r = w.ch?.root; if (!r || !r.visible || r.scale.x < 0.01 || !life.group.visible) continue; shown.push({ name: w.name, r: rOf({ x: r.position.x + o.x, z: r.position.z + o.z }) }); }
      for (const n of demo.npcs?.members ?? []) if (n && n.slot < 1000 && n.handle?.root?.visible !== false) shown.push({ name: `npc:${n.id}`, r: rOf(n.spot) });
      shown.sort((a, b) => a.r - b.r);
      return { on: on(), hidden: hidden.size, nearest: shown[0] ? { name: shown[0].name, r: +shown[0].r.toFixed(2) } : null, inside: shown.filter((s) => s.r < CLEAR_R).map((s) => `${s.name}@${s.r.toFixed(1)}`) };
    },
    dispose() { /* the wrappers stay (harmless: off when no vote) */ },
  };
}
