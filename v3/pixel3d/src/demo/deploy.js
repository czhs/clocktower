// STUB (owner: deploy; docs/DEMO.md §4.5). Written by the demo lead so the page runs end to end; REPLACE it.
// Agreed exports:
//   installDeploy(demo) -> { update(t, dt), dispose() }
// Owns: the test / automation hooks on window.__demo (below; Playwright scripts tools/demo-*.mjs read them), the
// on-page error overlay, the frame-time watchdog (suggest quality low when slow), and the serving side
// (tools/demo-serve.mjs, docs/DEMO.md §6).
// window.__demo = { ready, errors[], state() (store snapshot), set(patch) (store.set, source 'test'),
//                   info() ({ state, player: [x, z, facing], character, fps, cut, tod, engine: __pixel.info() }),
//                   frames (rendered frame count) }
export function installDeploy(demo) {
  const D = window.__demo ?? (window.__demo = { ready: false, errors: [] });
  let frames = 0, fpsN = 0, fpsT = 0, fps = 0;
  Object.defineProperty(D, 'frames', { get: () => frames, configurable: true });
  Object.assign(D, {
    state: () => JSON.parse(JSON.stringify(demo.store.state)),
    set: (patch) => demo.store.set(patch, 'test'),
    info: () => ({
      state: D.state(), fps: +fps.toFixed(1),
      player: demo.player ? [+demo.player.position.x.toFixed(2), +demo.player.position.z.toFixed(2), +demo.player.facing.toFixed(2)] : null,
      character: demo.player?.handle?.id ?? null, nearDoor: demo.player?.nearDoor?.id ?? null,
      cut: demo.cut?.info ?? null, tod: demo.time?.preset ?? null, hours: demo.time?.hours ?? null,
      location: demo.player?.location ?? 'town', room: demo.player?.interior ? { id: demo.player.interior.id, name: demo.player.interior.name, stub: !!demo.player.interior.stub } : null,
      transition: demo.player?.transition ?? null, intro: demo.intro ? demo.intro.phase : null, timeLights: demo.time?.info ? { lit: demo.time.info.lit, room: demo.time.info.room ?? null } : null,
      engine: window.__pixel?.info?.() ?? null,
    }),
  });
  return {
    update(t) {
      frames++; fpsN++;
      if (t - fpsT > 1) { fps = fpsN / (t - fpsT); fpsN = 0; fpsT = t; }
    },
    dispose() {},
  };
}
