// (B) Pass B of the Hollowmere demo: the voting circle + the clock tower (docs/DEMO.md §4.9).
//   createPassB(demo) -> { update(t, dt), votecam, timer, tower, seats, interior, ui, info(), dispose() }
// One factory, loaded by main.js after the view inset (so the vote camera wraps the rig's final update) and BEFORE the
// shader warm-up (so every program the pass adds - the seated cast, the tower interior - compiles behind the loading
// screen). Each part is optional: a part that fails is reported in __demo.errors and the rest keeps running.
//   votestage.js      the vote STAGING: where the cast stand during the vote, their scale, the camera's yaw / pitch,
//                     which clock face shares the frame (?voteStage=<letter>; the staging study's options)
//   votecam.js        the voting-circle camera (tight frame of the staged cast + the clock face)
//   towertimer.js     the Storyteller's countdown (state, keys, events) + the tower dials showing it + the readout board
//   seatcast.js       the cast characters on the 15 seats (instead of the townsfolk mannequins), gathering to their
//                     vote spots while staged
//   tower-interior.js the walkable clockwork room inside the clock tower
//   timer-ui.js       the HUD chip + the Storyteller's controls + the control panel section
//   votemarks.js      the per-voter vote states in the world (candle tokens, raised hands, the wax seal of a counted
//                     vote, guttering no-votes, ghost flames), the tally plaque, the threshold moment, the gather puffs
const parts = [
  ['stage', './votestage.js', 'createVoteStage'],
  ['votecam', './votecam.js', 'installVoteCam'],
  ['timer', './towertimer.js', 'createTowerTimer'],
  ['seats', './seatcast.js', 'createSeatCast'],
  ['interior', './tower-interior.js', 'createTowerInterior'],
  ['ui', './timer-ui.js', 'createTimerUI'],
  ['marks', './votemarks.js', 'createVoteMarks'],
];

export async function createPassB(demo) {
  const out = { info: () => ({}) };
  demo.passB = out;
  const fail = (name, e) => {
    console.error(`[passB] ${name} failed:`, e);
    window.__demo?.errors?.push(`passB.${name}: ${e?.stack || e}`);
  };
  for (const [name, path, factory] of parts) {
    if (demo.params?.get(`passB.${name}`) === '0') continue;
    try {
      const mod = await import(path);
      out[name] = (await mod[factory](demo)) ?? null;
    } catch (e) { fail(name, e); out[name] = null; }
  }
  const updaters = parts.map(([n]) => n).filter((n) => typeof out[n]?.update === 'function');
  out.update = (t, dt) => {
    for (const n of updaters) {
      const p = out[n];
      if (!p?.update) continue;
      try { p.update(t, dt); } catch (e) { fail(`${n}.update`, e); p.update = null; }
    }
  };
  out.info = () => Object.fromEntries(parts.map(([n]) => [n, out[n]?.info ? (typeof out[n].info === 'function' ? out[n].info() : out[n].info) : null]));
  return out;
}
