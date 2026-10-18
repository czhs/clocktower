// Pass B playtest steps (tools/demo-play.mjs step '8 passb'; docs/DEMO.md §4.9 / §9). One function, called with the
// playtest's page + helpers. Checks, by REAL keys / clicks where the game has them:
//   votecam   the vote camera: the stepped transition in (<= TRANS_STEPS + 1 distinct poses, settled in < 1.2 s), every
//             seat (feet + head) and the clock face inside the visible area and clear of the HUD, with the panel open
//             AND hidden; the seated figures larger on screen than the old preset's (viewHeight 19 x the inset's fit)
//   cast      15 seats filled by CAST characters (never the player's, never 'storyteller'), the townsfolk mannequins
//             hidden, dead seats in a ghost clip, voters raise the 'vote' clip as the vote opens
//   staging   (votestage.js, ?voteStage, default the court crescent) the vote camera gathers the cast to their vote
//             spots (the Storyteller's puffs drawn at both ends, every seat staged at its stage spot, the cast scale on
//             the root), the camera at the stage's yaw / pitch; leaving the vote camera puts everyone back on the stones
//   marks     (votemarks.js) every vote state seen in the run: waiting, raised (pending), counted (the seal, the gold
//             candle), passed (snuffed), the ghost's vote (ghost-raised -> ghost-counted), a spent ghost; the tally
//             plaque counts up to the needed votes, the threshold rings the tower bell and turns the plaque gold
//   timer     K start / pause, Y reset, I / U +- a minute (keys), the Storyteller's on-screen control by a REAL click;
//             the tower's dial wedge and the HUD chip (+ the hour-board's digits with ?board=1) agree with the timer's state; the tower's
//             own hands hidden while it shows the timer and back after reset; zero: done + the bell strikes
//   tower     walk INTO the tower door (held W at the doorstep), the room (not a stub), no shader program compiled by
//             entering, the gears turn with the timer (the drum stops when paused), the stair raises the feet, walk
//             out (held S on the exit) back onto the doorstep
// Programs constant across the step. Screenshots: NN-passb-*.png.
export async function runPassB({ page, sleep, info, shot, fail, note, press, hold }) {
  const r = {};
  const ev = (fn, a) => page.evaluate(fn, a);
  const pb = () => ev(() => window.__demo.demo.passB?.info?.() ?? null);
  // (diagnostics: the names of the programs compiled during the step, printed when the count changes)
  const pnames = () => ev(() => (window.__demo.demo.engine.renderer.info.programs ?? []).map((p) => `${p.name || (p.cacheKey ?? '').split(",").filter((s, i, a) => i < 6 || /ghost|GHOST|SKIN|BONE|MORPH|TONE|LOOK/.test(s)).join(",").slice(0, 400)}#${p.id}`));
  const pn0 = await pnames();
  const progs0 = (await info()).programs;
  const base = await pb();
  if (!base?.votecam || !base?.timer || !base?.seats || !base?.interior) { fail(`passb: parts missing ${JSON.stringify(Object.keys(base ?? {}))}`); return r; }

  // ---- seats + the vote camera (panel open)
  await ev(() => {
    const d = window.__demo.demo;
    d.store.set({ ui: true, camera: 'follow', phase: 'day', nominee: null }, 'test');
    d.store.set({ seats: Array.from({ length: 15 }, (_, i) => ({ occupied: true, dead: i === 3 || i === 11, ghostVote: i === 3, nominated: false, onBlock: false })) }, 'test');
    // (seal vote) stand by seat 5's stone: the vote camera seats YOU there (seatcast.js yours: the nearest seat)
    d.player.goTo('seat-5');
  });
  await sleep(900);
  // the transition: poll the camera pose while it steps in
  await ev(() => window.__demo.demo.store.set({ camera: 'vote', phase: 'nomination', nominee: 6 }, 'test'));
  const poses = new Set();
  const t0 = Date.now();
  let settled = null, poofs = 0, gatheredMid = [];
  for (let k = 0; k < 60; k++) {
    const p = await ev(() => { const d = window.__demo.demo, c = d.engine.camera, v = d.passB.votecam.info; return { vh: +c.viewHeight.toFixed(3), yaw: +c.yaw.toFixed(3), trans: v.trans, poofs: d.passB.marks?.info?.().poofs ?? 0, gathered: d.passB.stage?.info?.gathered ?? null }; });
    poses.add(`${p.vh}|${p.yaw}`);
    poofs = Math.max(poofs, p.poofs); gatheredMid.push(p.gathered);
    if (p.trans === null && k > 2) { settled = Date.now() - t0; break; }
    await sleep(25);
  }
  r.transition = { poses: poses.size, settledMs: settled, poofs, gathered: [...new Set(gatheredMid)] };
  if (settled === null || settled > 1500) fail(`passb: the vote camera did not settle (${settled} ms)`);
  if (poses.size > 7) fail(`passb: the vote transition glided (${poses.size} distinct poses, want stepped key poses)`);
  await sleep(600);
  // ---- the staging: every seat on its vote spot (scaled), the puffs seen while they moved
  const stg = await ev(() => { const d = window.__demo.demo, st = d.passB.stage; if (!st) return null; return { letter: st.letter, onStones: st.onStones, scale: st.scale, gathered: st.info.gathered, spots: st.spots.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]), list: d.passB.seats.list.map((x) => ({ staged: x.staged, at: x.at })), roots: d.passB.seats.list.map((x, i) => +(d.scene?.getObjectByName?.(`seat-cast:${i}:${x.id}`)?.scale?.x ?? d.engine.scene.getObjectByName(`seat-cast:${i}:${x.id}`)?.scale?.x ?? 0).toFixed(2)) }; });
  r.stage = stg ? { letter: stg.letter, scale: stg.scale, gathered: stg.gathered, poofs, roots: [...new Set(stg.roots)] } : null;
  if (stg && !stg.onStones) {
    const off = stg.list.filter((x, i) => !x.staged || Math.hypot(x.at[0] - stg.spots[i][0], x.at[1] - stg.spots[i][1]) > 0.05).length;
    if (stg.gathered !== 15 || off) fail(`passb: the cast did not gather to the vote spots (${stg.gathered}/15, ${off} off their spot)`);
    if (!(poofs > 0)) fail('passb: no Storyteller puff drawn while the cast gathered');
    if (stg.roots.some((s) => Math.abs(s - stg.scale) > 0.01)) fail(`passb: staged cast scale ${JSON.stringify(stg.roots)} vs ${stg.scale}`);
  }
  let v = await ev(() => window.__demo.demo.passB.votecam.check());
  r.votePanel = { yaw: v.yaw, vh: v.viewHeight, px: v.px, inFrame: v.inFrame, cover: v.cover, candidates: v.candidates };
  if (!v.active || v.inFrame?.seats !== 15 || !v.inFrame?.dial) fail(`passb: vote frame (panel open) seats ${v.inFrame?.seats}/15 dial ${v.inFrame?.dial} bad ${JSON.stringify(v.inFrame?.bad)}`);
  // the old preset at the same window: viewHeight 19, widened by main.js's inset fit (15.2 m + margins beside the panel)
  const old = await ev(() => { const c = window.__demo.demo.engine.camera, cw = innerWidth, ch = innerHeight; const p = document.querySelector('#demo-ui > .dui-panel'); const px = p && !p.classList.contains('collapsed') ? Math.max(0, cw - p.getBoundingClientRect().left) : 0; const vis = Math.max(0.3, (cw - px) / cw); return { vh: 19 * Math.min(1.35, Math.max(1, 16.2 / (19 * (cw / ch) * vis))), lowH: c.lowH, S: window.__demo.demo.engine.pixelScale }; });
  r.oldPanel = { vh: +old.vh.toFixed(2), seat13: +(1.3 * Math.cos(Math.PI / 6) * (old.lowH / old.vh) * old.S).toFixed(1) };
  if (!(v.viewHeight < old.vh)) fail(`passb: the vote frame is not tighter than the old preset (${v.viewHeight} vs ${old.vh})`);
  await shot('passb-votecam-panel');

  // ---- the seated cast
  let s = await ev(() => window.__demo.demo.passB.seats.info());
  const player = await ev(() => window.__demo.demo.player.handle?.id);
  const yours = await ev(() => window.__demo.demo.passB.seats.yours);
  r.cast = { ids: s.ids, shown: s.shown, folkHidden: s.folkHidden, members: s.members, yours };
  // (seal vote) on the stones you sit in the circle: your seat's cast member steps aside (14 shown + you)
  const onStones = stg?.onStones !== false;
  if (onStones && yours !== 5) fail(`passb: you were not seated on seat 5 in the vote camera (yours ${yours})`);
  if (s.shown !== 15 - (yours >= 0 ? 1 : 0)) fail(`passb: ${s.shown}/${15 - (yours >= 0 ? 1 : 0)} seated cast shown (yours ${yours})`);
  if (s.ids.includes(player) || s.ids.includes('storyteller')) fail(`passb: the player's character / the Storyteller in a seat (${s.ids.join(',')})`);
  if (s.folkHidden !== true) fail('passb: the townsfolk mannequins still shown on the seats');
  await sleep(1900);
  s = await ev(() => window.__demo.demo.passB.seats.info());
  if (!/ghost/.test(s.clips[3] ?? '') || !/ghost/.test(s.clips[11] ?? '')) fail(`passb: dead seats not ghosts (${s.clips[3]}, ${s.clips[11]})`);
  // THE SEAL VOTE (sealvote.js / votemarks.js; docs/DEMO.md §4.9 "the seal vote"): nominee 6; seals slapped before the
  // vote opens: 7 9 10 12 0 1 + the ghost 3 (its one ghost vote); during the sweep seat 1 TAKES ITS SEAL BACK and seat
  // 14 slaps LATE (both before the hand reaches them); YOU (seat 5) press X: slap, take back, slap again; seat 11 a spent
  // ghost; 13 alive = 7 needed -> 7 9 10 12 14 0 3 5 = "8 votes · 7 needed · ON THE BLOCK" (the threshold on the ghost 3)
  const stateSeen = {}, drawnSeen = {}, kindsAt = [], plaques = new Set(), lit = new Set();
  let marksInfo = null, voting = [];
  const nomMark = await ev(() => window.__demo.demo.passB.marks?.info?.() ?? null);
  r.nomination = { ghost3: nomMark?.seats?.[3]?.kind ?? null, nominee: nomMark?.nominee ?? null };
  if (onStones && r.nomination.ghost3 !== 'ghost') fail(`passb: no ghost token at the ghost seat 3 in the nomination (${JSON.stringify(nomMark?.seats?.[3])})`);
  if (onStones && r.nomination.nominee?.seat !== 6) fail(`passb: no nominee marker at seat 6 (${JSON.stringify(r.nomination.nominee)})`);
  // (integrate7) the ghost seat 3's halo BEFORE its vote, sampled here in the nomination (its seal goes down with the
  // vote's opening, so the vote loop may never see the 'ghost' kind: the earlier flaky "showed no halo before its vote");
  // + the halo SPRITE (halos.js) drawn over it, and the snuff count before the vote
  const pre3 = await ev(() => { const d = window.__demo.demo, h = d.passB.halos, g = d.passB.seats.info().ghosts?.[3]; const id = d.passB.seats.handleOf?.(3)?.id ?? null; const hi = h?.info?.() ?? null; return { haloShown: g?.haloShown ?? null, spent: g?.spent ?? null, id, sprite: !!hi?.list?.some((x) => x.id === id && x.snuff == null), snuffs: hi?.snuffs ?? null, halos: !!h }; });
  r.nomination.halo3 = pre3;
  {
    // (integrate7) NO snuff on un-ghosting (key 5's toggle / a revive): your ghost's halo sprite just goes. Done here in
    // the nomination: in the vote, ghosting with your seal already counted spends the ghost vote at once (seatcast.js)
    const g0 = await ev(() => { const d = window.__demo.demo, P = d.player; if (!d.passB.halos || P.ghost) return null; const on = P.setGhost(true); return { on, spent: P.ghostSpent, snuffs: d.passB.halos.info().snuffs }; });
    if (g0?.on) {
      await sleep(900);
      const mid = await ev(() => { const d = window.__demo.demo, id = d.player.handle?.id; return d.passB.halos.info().list.some((x) => x.id === id && x.snuff == null); });
      await ev(() => window.__demo.demo.player.setGhost(false));
      await sleep(700);
      const g1 = await ev(() => { const d = window.__demo.demo, id = d.player.handle?.id, hi = d.passB.halos.info(); return { snuffs: hi.snuffs, on: hi.list.some((x) => x.id === id) }; });
      r.nomination.unghost = { before: g0.snuffs, spent: g0.spent, haloWhileGhost: mid, ...g1 };
      if (!mid || g1.on || g1.snuffs !== g0.snuffs) fail(`passb: your ghost's halo sprite on un-ghosting ${JSON.stringify(r.nomination.unghost)} (want shown, then gone with NO snuff)`);
    } else r.nomination.unghost = { skipped: g0 };
  }
  await ev(() => { window.__voteBells = 0; window.__demo.demo.events.on('bell', () => { window.__voteBells++; }); window.__ghostSpent = []; window.__demo.demo.events.on('ghost:spent', (e) => { window.__ghostSpent.push(e); }); });
  await ev(() => { const d = window.__demo.demo; for (const i of [7, 9, 10, 12, 0, 1, 3]) d.time.setVote(i, true); d.store.set({ phase: 'vote' }, 'test'); });
  const tv0 = Date.now();
  let shotCounted = false;
  // (vote-fix5, critic-4 P2-2 / P2-5) the hand: 1.1 s per seat, 3 s after the opening (seat 5 locks ~17.8 s in); the
  // first slap is a DOUBLE press (X X 120 ms apart: the debounce keeps ONE slap), then take back, then slap again
  const acts = [[900, 'xx'], [1700, 'x'], [2300, 'wd1'], [2500, 'late14'], [2900, 'x']];
  const pressed = [];
  let ringMin = Infinity, ringIn = new Set(), beamSeen = false, burstSeen = false;
  // (vote-fix6) the under-circle: every drawn mark centred on its own voter's feet (marks.seats[i].w = the seat's feet,
  // world; off by > 2 cm = bad); the ghost halo: seat 3's halo shown before its ghost vote is counted, gone from the lock
  // on (+ 'ghost-spent'); seat 11 (spent at the start) never shows one
  const offFeet = [], halo3 = [], halo11 = new Set();
  while (Date.now() - tv0 < 24000) {
    for (const a of acts) if (!a.done && Date.now() - tv0 >= a[0]) {
      a.done = true;
      if (a[1] === 'x' || a[1] === 'xx') { if (onStones) { await press('KeyX'); if (a[1] === 'xx') { await sleep(120); await page.keyboard.press('KeyX'); } pressed.push(await ev(() => !!window.__demo.demo.time.seals.downAt(5))); } }
      else await ev((w) => { const d = window.__demo.demo; if (w === 'wd1') d.time.setVote(1, false); else d.time.setVote(14, true); }, a[1]);
    }
    // (vote-fix5, critic-4 P1-2) no town-life walker / idle NPC shown inside r 8 m of the ring while the vote runs
    const rc = await ev(() => window.__demo.demo.passB.ringclear?.check?.() ?? null);
    if (rc?.nearest) ringMin = Math.min(ringMin, rc.nearest.r);
    for (const x of rc?.inside ?? []) if (+x.split('@')[1] < 8) ringIn.add(x);
    marksInfo = await ev(() => window.__demo.demo.passB.marks?.info?.() ?? null);
    if (marksInfo?.nominee?.beam && marksInfo.spot?.extra?.includes(0)) beamSeen = true;
    if (marksInfo?.nominee?.burst) burstSeen = true;
    if (!marksInfo) break;
    for (const [i, x] of Object.entries(marksInfo.seats)) { (stateSeen[x.kind] ??= new Set()).add(+i); if (x.drawn) (drawnSeen[x.drawn] ??= new Set()).add(+i); }
    {
      const g = await ev(() => { const d = window.__demo.demo, s = d.passB.seats; const feet = {}; for (let i = 0; i < 15; i++) { const p = s.spotOf(i)?.pos; if (p) feet[i] = [p.x, p.z]; } return { feet, ghosts: s.info().ghosts }; });
      for (const [i, x] of Object.entries(marksInfo.seats)) if (x.drawn && x.drawn !== 'token' && g.feet[i] && Math.hypot(x.w[0] - g.feet[i][0], x.w[1] - g.feet[i][1]) > 0.02) offFeet.push(`${i}:${x.kind}`);
      const g3 = g.ghosts?.[3], k3 = marksInfo.seats?.[3]?.kind ?? null;
      if (g3) halo3.push([k3, g3.haloShown, g3.spent]);
      if (g.ghosts?.[11]?.haloShown) halo11.add(marksInfo.seats?.[11]?.kind ?? '?');
    }
    for (const i of marksInfo.spot?.lit ?? []) lit.add(i);
    if (marksInfo.plaque?.text) plaques.add(marksInfo.plaque.text);
    kindsAt.push({ ms: Date.now() - tv0, tally: marksInfo.tally, plaque: marksInfo.plaque?.text ?? null });
    if (Date.now() - tv0 > 1000 && !voting.length) { const s1 = await ev(() => window.__demo.demo.passB.seats.info()); voting = Object.entries(s1.clips).filter(([, c]) => c === 'vote').map(([i]) => +i); }
    if (!shotCounted && marksInfo.tally >= 3) { shotCounted = true; await shot('passb-vote-marks'); }
    if (marksInfo.tally >= 8 && Date.now() - tv0 > 9000) break;
    await sleep(100);
  }
  r.cast.voting = voting;
  r.under = { offFeet: [...new Set(offFeet)].slice(0, 10), halo3: halo3.filter((x, j) => !j || JSON.stringify(x) !== JSON.stringify(halo3[j - 1])), halo11: [...halo11] };
  if (offFeet.length) fail(`passb: vote marks not centred on their own voter's feet (${r.under.offFeet.join(', ')})`);
  // (integrate7) before its vote = the nomination sample, or any loop sample before the lock ('ghost' / 'ghost-sealed')
  if (pre3.haloShown !== true && !halo3.some(([k, h]) => (k === 'ghost' || k === 'ghost-sealed') && h === true)) fail(`passb: the ghost seat 3 showed no halo before its vote (${JSON.stringify({ pre3, loop: r.under.halo3 })})`);
  if (pre3.halos && !pre3.sprite) fail(`passb: no halo SPRITE over the ghost seat 3 before its vote (${JSON.stringify(pre3)})`);
  {
    // the sprite: gone after the spend, and SNUFFED (halos.js: only on a 'ghost:spent'); never one over the spent seat 11
    await sleep(600);
    const post = await ev((id3) => { const d = window.__demo.demo, hi = d.passB.halos?.info?.() ?? null; const id11 = d.passB.seats.handleOf?.(11)?.id ?? null; return { snuffs: hi?.snuffs ?? null, on3: !!hi?.list?.some((x) => x.id === id3 && x.snuff == null), on11: !!hi?.list?.some((x) => x.id === id11 && x.snuff == null) }; }, pre3.id);
    r.under.sprite = { before: pre3.snuffs, ...post };
    if (pre3.halos && (post.on3 || post.on11 || !(post.snuffs > pre3.snuffs))) fail(`passb: the halo sprite after the ghost vote ${JSON.stringify(r.under.sprite)} (want seat 3 gone + snuffed, none on 11)`);
  }
  // (one sample at the lock itself may still hold the old clip's pose: at most 2 samples with the halo after the lock)
  if (!halo3.some(([k, h, sp]) => k === 'ghost-counted' && h === false && sp === true) || halo3.filter(([k, h]) => k === 'ghost-counted' && h === true).length > 2) fail(`passb: the ghost seat 3 kept its halo after its ghost vote was counted (${JSON.stringify(r.under.halo3)})`);
  r.under.spentEvents = await ev(() => window.__ghostSpent);
  if (!(r.under.spentEvents ?? []).some((e) => e.seat === 3) || r.under.spentEvents.some((e) => e.seat === 11)) fail(`passb: 'ghost:spent' events ${JSON.stringify(r.under.spentEvents)} (want seat 3 once, never the already-spent 11)`);
  if (halo11.size) fail(`passb: the spent ghost seat 11 showed a halo (${r.under.halo11.join(',')})`);
  if (ringIn.size || (Number.isFinite(ringMin) && ringMin < 8)) fail(`passb: a townsperson inside r 8 m of the ring during the vote (${JSON.stringify(r.ring)})`);
  r.threshold = { beam: beamSeen, burst: burstSeen };
  if (!beamSeen || !burstSeen) fail(`passb: the threshold moment (the burst + the nominee's crimson beam) not seen (${JSON.stringify(r.threshold)})`);
  if (voting.length < 4) fail(`passb: only ${voting.length} seated voters played the 'vote' clip with their seal down`);
  r.marks = { seen: Object.fromEntries(Object.entries(stateSeen).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])), drawn: Object.fromEntries(Object.entries(drawnSeen).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])),
    tally: marksInfo?.tally, needed: marksInfo?.needed, passed: marksInfo?.passed, bell: marksInfo?.bell, bells: await ev(() => window.__voteBells), plaque: marksInfo?.plaque?.text ?? null, gold: marksInfo?.plaque?.gold ?? null, hand: marksInfo?.hand, plaques: [...plaques], lit: [...lit].sort((a, b) => a - b), yourX: pressed };
  const has = (k, seat) => stateSeen[k]?.has(seat);
  const need = [['waiting', 13], ['sealed', 7], ['counted', 7], ['counted', 0], ['passed', 8], ['sealed', 1], ['withdrawn', 1], ['passed', 1], ['sealed', 14], ['counted', 14],
    ['ghost-sealed', 3], ['ghost-counted', 3], ['spent', 11]];
  if (onStones) need.push(['sealed', 5], ['withdrawn', 5], ['counted', 5]);
  const miss = need.filter(([k, s]) => !has(k, s));
  if (!marksInfo) fail('passb: no vote marks (votemarks.js)');
  else if (miss.length) fail(`passb: vote states not seen: ${miss.map(([k, s]) => `${k}@${s}`).join(', ')} (seen ${JSON.stringify(r.marks.seen)})`);
  // the animations ran: a slap (fall / slam / settle), a take-back (unstamp / rise / gone), a lock (the stamp)
  const dr = (ks) => ks.some((k) => drawnSeen[k]?.size);
  if (!dr(['fall', 'slam', 'settle', 'lift'])) fail(`passb: no slap animation seen (${JSON.stringify(r.marks.drawn)})`);
  if (!dr(['unstamp', 'rise', 'gone'])) fail(`passb: no take-back animation seen (${JSON.stringify(r.marks.drawn)})`);
  if (!dr(['stamp-down', 'pressed', 'stamp-up'])) fail(`passb: no brass stamp seen (${JSON.stringify(r.marks.drawn)})`);
  // the old marks are gone: no candle / raised-hand states
  const oldKinds = Object.keys(stateSeen).filter((k) => /raised|candle|snuff/.test(k));
  if (oldKinds.length) fail(`passb: old vote-mark states still drawn: ${oldKinds.join(', ')}`);
  // a spotlight on every counted voter (and on nobody else)
  const counted = [...new Set([...(stateSeen.counted ?? []), ...(stateSeen['ghost-counted'] ?? [])])].sort((a, b) => a - b);
  if (JSON.stringify(r.marks.lit) !== JSON.stringify(counted)) fail(`passb: spotlights ${JSON.stringify(r.marks.lit)} vs the counted voters ${JSON.stringify(counted)}`);
  const want = onStones ? 8 : 7;
  if (marksInfo && (marksInfo.tally !== want || marksInfo.needed !== 7 || !marksInfo.passed)) fail(`passb: the tally ${marksInfo.tally} / ${marksInfo.needed} passed ${marksInfo.passed} (want ${want} / 7, passed)`);
  if (marksInfo && !(marksInfo.bell >= 1 && r.marks.bells >= 1)) fail(`passb: the threshold did not ring the tower bell (marks ${marksInfo.bell}, bell events ${r.marks.bells})`);
  if (marksInfo && !(marksInfo.plaque?.gold)) fail(`passb: the tally plaque did not turn gold at the threshold (${JSON.stringify(marksInfo.plaque)})`);
  if (marksInfo && !(marksInfo.nominee?.block)) fail(`passb: the nominee's ring did not become the block ring (${JSON.stringify(marksInfo.nominee)})`);
  // the tally's wording: "<name>: N votes · 7 needed", from the threshold "... · ON THE BLOCK"; never "8 / 7"
  const badP = [...plaques].filter((p) => !/^[A-Za-z ]+: (\d+ votes? · 7 needed( · ON THE BLOCK)?|ON THE BLOCK · \d+ votes?)$/.test(p));
  if (badP.length || !plaques.size) fail(`passb: tally wording ${JSON.stringify([...plaques])}`);
  if (marksInfo && !new RegExp(`: ${want} votes · 7 needed · ON THE BLOCK$|ON THE BLOCK · ${want} votes$`).test(marksInfo.plaque?.text ?? '')) fail(`passb: the final tally reads "${marksInfo.plaque?.text}"`);
  if (kindsAt.some((x) => x.plaque === null && x.tally > 0)) fail('passb: the tally plaque vanished mid-vote');
  // the plaque counted up one by one: the tallies seen are non-decreasing
  const tallies = kindsAt.map((x) => x.tally);
  if (tallies.some((x, i) => i && x < tallies[i - 1])) fail(`passb: the tally went down ${JSON.stringify(tallies)}`);
  r.marks.tallies = [...new Set(tallies)];
  // no vote-dial card; the captions name the nominee
  const ge = await ev(() => { const g = window.__demo.demo.gameui; const i = g.info(); return { card: g.voteCardRect, vote: i.events?.vote ?? null, captions: i.events?.captions ?? [], bar: (i.bar ?? i.R?.bar ?? null) }; });
  r.marks.captions = ge.captions.slice(-4);
  if (ge.card || ge.vote?.card) fail(`passb: the vote-dial card is drawn (${JSON.stringify(ge.card ?? ge.vote)})`);
  if (!ge.captions.some((c) => / (is|are) nominated/.test(c) && !/Seat \d/.test(c))) fail(`passb: no caption names the nominee (${JSON.stringify(ge.captions)})`);
  if (onStones && !(pressed[0] === true && pressed[1] === false && pressed[2] === true)) fail(`passb: your seal did not follow X (down after each press: ${JSON.stringify(pressed)})`);
  await shot('passb-vote-threshold');
  // the marks at the game UI's density (D=2 at 1280x720: the HD art on the HD tiers, the plaque through the HD view)
  r.marks.hd = marksInfo?.hd ?? null; r.marks.plaqueHD = marksInfo?.plaque?.hd ?? null;
  const dens = await ev(() => window.__demo.demo.gameui?.info?.().density ?? 1);
  if (dens > 1 && (!r.marks.hd || r.marks.plaqueHD !== true)) fail(`passb: the vote marks are not on the D=2 tiers (marks ${JSON.stringify(r.marks.hd)}, plaque hd ${r.marks.plaqueHD})`);
  // (emoji) the townsfolk react: suspicious at the nomination, the counted voters agree when the vote ends
  await sleep(1500);
  const rx = await ev(() => window.__demo.demo.gameui?.info?.().reactions ?? null);
  r.reactions = rx;
  if (!(rx?.byKey?.suspicious >= 1)) fail(`passb: nobody reacted 'suspicious' to the nomination (${JSON.stringify(rx)})`);
  if (!(rx?.byKey?.agree >= 1)) fail(`passb: the counted voters did not 'agree' when the vote ended (${JSON.stringify(rx)})`);
  await shot('passb-vote-reactions');
  // the court staged: the dais parked (its brass hand points at the court, its stones empty), the pool's court lights
  // in the candidates, the idle NPCs walked out of the frame
  const court = await ev(() => { const d = window.__demo.demo, st = d.town?.registry?.get?.('dais')?.api?.state; return { court: d.passB.stage?.court ?? null, hand: st?.hand ?? null, occupied: st ? st.seats.filter((x) => x.occupied).length : null, timeCourt: d.time?.info?.court ?? null, npcs: d.npcs?.list ?? null }; });
  r.court = court;
  if (court.court && (court.hand !== 0 || court.occupied !== 0)) fail(`passb: the dais is not parked while the court is staged (hand ${court.hand}, ${court.occupied} stones occupied)`);
  if (court.npcs?.length && court.npcs.some((n) => !n.away)) fail(`passb: idle NPCs still in the vote frame (${JSON.stringify(court.npcs)})`);
  // the whole canvas: the demo's control panel slid out while the vote camera is up (the user: "in game there won't be
  // the side panel"), the frame fitted with no right band
  const away = await ev(() => ({ cls: document.querySelector('#demo-ui > .dui-panel')?.classList.contains('dui-away') ?? null, right: window.__demo.demo.passB.votecam.info.cover?.right ?? null }));
  r.panelAway = away;
  if (away.cls !== true || away.right !== 0) fail(`passb: the control panel did not slide out of the vote frame (${JSON.stringify(away)})`);
  // the panel hidden: the frame grows and still holds everything
  await ev(() => window.__demo.demo.store.set({ ui: false }, 'test'));
  await sleep(1400);
  v = await ev(() => window.__demo.demo.passB.votecam.check());
  r.voteNoPanel = { yaw: v.yaw, vh: v.viewHeight, px: v.px, inFrame: v.inFrame };
  if (v.inFrame?.seats !== 15 || !v.inFrame?.dial) fail(`passb: vote frame (no panel) seats ${v.inFrame?.seats}/15 dial ${v.inFrame?.dial}`);
  await shot('passb-votecam');
  await ev(() => window.__demo.demo.store.set({ ui: true }, 'test'));
  await sleep(400);

  // ---- the timer (keys + the ST control)
  const T = () => ev(() => { const d = window.__demo.demo, tm = d.passB.timer.info(), ui = d.passB.ui?.info?.(); return { ...tm, chip: ui?.chip?.text ?? null, st: ui?.st ?? null }; });
  const fmt = (sec) => { const x = Math.max(0, Math.ceil(sec - 1e-6)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
  const digits = (sec) => { const x = Math.max(0, Math.ceil(sec - 1e-6)), m = Math.floor(x / 60), ss = x % 60; return `${m >= 10 ? Math.floor(m / 10) : ' '}${m % 10}${Math.floor(ss / 10)}${ss % 10}`; };
  const agree = (tm, what) => {
    const st = tm.state, q = st.mode === 'done' ? 180 : Math.round(st.frac * 180);
    const dialQ = Number(tm.key.split('|')[2]);
    // (the user: the counter lives in the HUD, not on a board over the door: the hour-board is off by default, ?board=1)
    const okDial = st.mode === 'idle' ? !tm.handsHidden : Math.abs(dialQ - q) <= 2, okBoard = tm.board === false ? true : [digits(st.remaining), digits(st.remaining + 1), digits(st.remaining - 1)].includes(tm.digits);
    const okChip = st.mode === 'idle' ? tm.chip === null : st.mode === 'done' ? !!tm.chip : [fmt(st.remaining), fmt(st.remaining + 1), fmt(st.remaining - 1)].some((f) => tm.chip?.includes(f));
    if (!okDial || !okBoard || !okChip) fail(`passb: timer ${what}: dial ${dialQ} vs ${q}, board '${tm.digits}' vs '${digits(st.remaining)}', chip '${tm.chip}' (${st.mode} ${st.remaining})`);
    return { mode: st.mode, remaining: st.remaining, dial: dialQ, board: tm.digits, chip: tm.chip, handsHidden: tm.handsHidden };
  };
  await press('KeyY');
  let tm = await T();
  r.timer = { reset0: agree(tm, 'reset') };
  if (tm.state.mode !== 'idle' || tm.handsHidden) fail(`passb: Y did not reset the timer (${tm.state.mode}, hands hidden ${tm.handsHidden})`);
  await ev(() => window.__demo.demo.passB.timer.setMinutes(1));
  await press('KeyI');
  tm = await T();
  if (tm.state.minutes !== 2) fail(`passb: I did not add a minute (${tm.state.minutes})`);
  await press('KeyU');
  tm = await T();
  if (tm.state.minutes !== 1) fail(`passb: U did not take a minute (${tm.state.minutes})`);
  await press('KeyK');
  await sleep(1600);
  tm = await T();
  r.timer.running = agree(tm, 'running');
  if (tm.state.mode !== 'running' || !(tm.state.remaining < 59.5) || !tm.handsHidden) fail(`passb: K did not start the timer (${tm.state.mode}, ${tm.state.remaining}, hands hidden ${tm.handsHidden})`);
  await shot('passb-timer-running');
  // the countdown in the HUD during the staged vote court: the timer chip shown, inside the canvas, clear of the caption;
  // no hour-board built over the tower door
  {
    const c = await ev(() => { const d = window.__demo.demo, g = d.gameui?.info?.(), ui = d.passB.ui?.info?.(); return { court: d.passB.stage?.court ?? null, chip: ui?.chip ?? null, screen: g?.screen, board: !!d.engine.scene.getObjectByName('demo-tower-board')?.parent, caption: g?.events?.caption ?? null }; });
    r.timer.chipCourt = c;
    if (c.board) fail('passb: the hour-board is still built over the tower door (the counter lives in the HUD now)');
    if (!c.chip?.logical) fail(`passb: no timer chip in the HUD during the vote court (${JSON.stringify(c)})`);
    else if (c.chip.logical.x < 0 || c.chip.logical.x + c.chip.logical.w > c.screen[0] || c.chip.logical.y < 0) fail(`passb: the timer chip is outside the screen (${JSON.stringify(c.chip.logical)})`);
  }
  await press('KeyK');
  const pr = (await T()).state.remaining;
  await sleep(1200);
  tm = await T();
  r.timer.paused = agree(tm, 'paused');
  if (tm.state.mode !== 'paused' || Math.abs(tm.state.remaining - pr) > 0.05) fail(`passb: K did not pause (${tm.state.mode}, ${pr} -> ${tm.state.remaining})`);
  // the Storyteller's control on screen: a REAL click on its Resume button
  await ev(() => { window.__demo.demo.passB.ui.onScreen = true; });
  await sleep(500);
  tm = await T();
  const btn = tm.st?.rects?.find((x) => x.k === 'resume');
  if (!btn) fail(`passb: the ST control has no Resume button (${JSON.stringify(tm.st?.rects?.map((x) => x.k))})`);
  else { await page.mouse.click(btn.x, btn.y); await sleep(700); }
  tm = await T();
  r.timer.stClick = { mode: tm.state.mode };
  if (tm.state.mode !== 'running') fail(`passb: the ST control's Resume click did not resume (${tm.state.mode})`);
  await shot('passb-st-controls');
  // the tower interior while it runs: walk in through the door
  await ev(() => window.__demo.demo.passB.ui.onScreen = false);
  const progsIn0 = (await info()).programs;
  await ev(() => { const d = window.__demo.demo; d.store.set({ camera: 'follow' }, 'test'); d.player.goTo('clocktower'); });
  await sleep(900);
  // leaving the vote camera: the cast puff back onto the stones (unscaled)
  const back = await ev(() => { const d = window.__demo.demo; return { staged: d.passB.seats.list.filter((x) => x.staged).length, gathered: d.passB.stage?.info?.gathered ?? 0, pitch: +d.engine.camera.pitch.toFixed(4) }; });
  r.stage && (r.stage.back = back);
  if (back.staged || back.gathered) fail(`passb: after the vote camera ${back.staged} seats still staged`);
  if (Math.abs(back.pitch - Math.PI / 6) > 1e-3) fail(`passb: the follow camera kept the vote pitch (${back.pitch})`);
  await hold(['KeyW'], 900);
  let loc = null;
  for (let k = 0; k < 40; k++) { loc = await ev(() => window.__demo.demo.player.location); if (loc === 'clocktower') break; await sleep(100); }
  await sleep(900);
  const inside = await ev(() => window.__demo.demo.passB.interior.info());
  const progsIn1 = (await info()).programs;
  r.tower = { walkedIn: loc === 'clocktower', kit: inside.kit, programs: [progsIn0, progsIn1], room: await ev(() => window.__demo.demo.time?.info?.room ?? null), chip: (await T()).chip };
  if (loc === 'clocktower' && !r.tower.chip) fail('passb: no timer chip in the HUD inside the tower while the timer runs');
  if (loc !== 'clocktower') fail(`passb: holding W at the tower door did not go in (${loc})`);
  if (inside.kit !== 'passB') fail(`passb: the tower room is a ${inside.kit} room`);
  if (progsIn1 !== progsIn0) fail(`passb: entering the tower compiled ${progsIn1 - progsIn0} program(s)`);
  const g0 = inside.parts?.drum;
  await sleep(2600);
  const g1 = (await ev(() => window.__demo.demo.passB.interior.info())).parts?.drum;
  await press('KeyK');            // pause: the timer train stops
  await sleep(300);
  const g2 = (await ev(() => window.__demo.demo.passB.interior.info())).parts?.drum;
  await sleep(1200);
  const g3 = (await ev(() => window.__demo.demo.passB.interior.info())).parts?.drum;
  r.tower.drum = [g0, g1, g2, g3];
  if (g1 === g0) fail(`passb: the timer wheel did not turn while the timer ran (${g0} -> ${g1})`);
  if (g3 !== g2) fail(`passb: the timer wheel turned while paused (${g2} -> ${g3})`);
  await press('KeyK');
  await shot('passb-tower-interior');
  // up the stair onto the landing (the feet rise)
  await ev(() => { const d = window.__demo.demo, o = d.passB.interior.raw.origin; d.player.walkTo(o.x + 3.3, o.z - 1.4); });
  await sleep(4200);
  const up = await ev(() => { const p = window.__demo.demo.player; return { y: +(p.handle?.root?.position?.y ?? 0).toFixed(2), z: +p.position.z.toFixed(2) }; });
  r.tower.landing = up;
  if (!(up.y > 0.9)) fail(`passb: the stair did not raise the character onto the landing (${JSON.stringify(up)})`);
  await shot('passb-tower-landing');
  // back down and out: walk to the exit spot
  await ev(() => { const d = window.__demo.demo, e = d.player.interior.exit; d.player.walkTo(e.x, e.z - 0.9); });
  await sleep(4500);
  // hold S (out of the door) until the fade takes the player out, then let go (a key still held after the fade walks on)
  await ev(() => document.activeElement?.blur?.());
  await page.keyboard.down('KeyS');
  for (let k = 0; k < 40; k++) { loc = await ev(() => window.__demo.demo.player.location); if (loc === 'town') break; await sleep(50); }
  await page.keyboard.up('KeyS');
  await sleep(700);
  const outP = (await info()).player, step = await ev(() => window.__demo.demo.player.spots().clocktower);
  r.tower.out = { loc, player: outP, doorstep: [+step.x.toFixed(2), +step.z.toFixed(2)] };
  if (loc !== 'town') fail(`passb: walking onto the exit did not leave the tower (${loc})`);
  else if (Math.hypot(outP[0] - step.x, outP[1] - step.z) > 1.2) fail(`passb: left the tower but not onto its doorstep (${outP} vs ${step.x}, ${step.z})`);
  // zero: done, the bell strikes; then reset (the tower shows the time again)
  const bells0 = await ev(() => window.__demo.demo.time?.info?.strikes ?? 0);
  await ev(() => { window.__bellsB = 0; window.__demo.demo.events.on('bell', () => { window.__bellsB++; }); window.__demo.demo.passB.timer.add(-(window.__demo.demo.passB.timer.remaining() - 1.5)); });
  await sleep(2600);
  tm = await T();
  r.timer.done = { ...agree(tm, 'done'), bells: await ev(() => window.__bellsB), strikes0: bells0 };
  if (tm.state.mode !== 'done' || !(r.timer.done.bells >= 1)) fail(`passb: the timer did not reach zero with a bell (${tm.state.mode}, bells ${r.timer.done.bells})`);
  await shot('passb-timer-done');
  await press('KeyY');
  tm = await T();
  if (tm.state.mode !== 'idle' || tm.handsHidden) fail(`passb: reset after zero: ${tm.state.mode}, hands hidden ${tm.handsHidden}`);
  // programs constant over the whole step
  const progs1 = (await info()).programs;
  r.programs = [progs0, progs1];
  if (progs1 !== progs0) { const pn1 = await pnames(); fail(`passb: programs ${progs0} -> ${progs1} (new: ${pn1.filter((x) => !pn0.includes(x)).join(', ')}; gone: ${pn0.filter((x) => !pn1.includes(x)).join(', ')})`); }
  await ev(() => window.__demo.demo.store.set({ camera: 'follow', phase: 'day', nominee: null }, 'test'));
  // (vote-fix6) the ghost vote seat 3 used is recorded spent once the vote phase ended (the store: ghostVote false)
  await sleep(200);
  r.under.spentAfter = await ev(() => window.__demo.demo.store.state.seats[3]?.ghostVote);
  if (r.under.spentAfter !== false) fail(`passb: the counted ghost vote of seat 3 was not recorded spent after the vote (ghostVote ${r.under.spentAfter})`);

  // ---- (vote-fix6) P ALWAYS SEATS YOU (the user: "p doesn't reliably send me to join the voting circle"): P from a
  // room, the tower, a door fade, as the Storyteller (by the dais, no seat), with a held walk key, from every camera
  // mode, with the vote camera already up (never on a seat the ceremony needs), inside the 3 s after a ceremony's
  // night, P twice; P again later stops it (follow + day). Seated = the vote camera up, seats.yours >= 0, within
  // 0.3 m of that stone, in the town, at +1.5 s and still at +4 s.
  {
    const char0 = await ev(() => window.__demo.demo.player.handle?.id);
    const pst = () => ev(() => {
      const d = window.__demo.demo, p = d.player, y = d.passB.seats.yours, q = y >= 0 ? d.layout.seatPos(y, 15) : null, C = d.layout.CIRCLE;
      return { cam: d.store.state.camera, vc: !!d.passB.votecam.info.active, yours: y, dSeat: q ? +Math.hypot(p.position.x - q.x, p.position.z - q.z).toFixed(2) : null, loc: p.location, cer: !!d.time.ceremony, st: d.passB.seats.storyteller, rDais: +Math.hypot(p.position.x - C.cx, p.position.z - C.cz).toFixed(2), phase: d.store.state.phase };
    });
    const seated = (s, st) => st ? s.cam === 'vote' && s.vc && s.loc === 'town' && s.yours < 0 && s.st === true && s.rDais < 3.6 : s.cam === 'vote' && s.vc && s.yours >= 0 && s.dSeat < 0.3 && s.loc === 'town';
    const preset = async (char) => {
      await page.keyboard.up('KeyW');
      await ev(async (char) => {
        const d = window.__demo.demo;
        d.time.stopCeremony?.();
        d.store.set({ camera: 'follow', phase: 'day', nominee: null }, 'test');
        if (d.player.location !== 'town') await d.player.leave({ instant: true });
        if (d.player.handle?.id !== char) await d.player.setCharacter(char);
        const s = d.player.spots().spawn; d.player.teleport(s.x, s.z);
      }, char);
      await sleep(900);
    };
    const cases = [
      ['house', async () => { await ev(() => window.__demo.demo.player.enter('house-3', { instant: true })); await sleep(900); }],
      ['tower', async () => { await ev(() => window.__demo.demo.player.enter('clocktower', { instant: true })); await sleep(900); }],
      ['doorfade', async () => { await ev(() => { window.__demo.demo.player.enter('house-2'); }); await sleep(100); }],
      ['storyteller', async () => { await ev(() => window.__demo.demo.player.setCharacter('storyteller')); await sleep(1200); }, { st: true }],
      ['walkkey', async () => { await page.keyboard.down('KeyW'); await sleep(350); }, { hold: true }],
      ['camOverview', async () => { await ev(() => window.__demo.demo.store.set({ camera: 'overview' }, 'key')); await sleep(600); }],
      ['camIso', async () => { await ev(() => window.__demo.demo.store.set({ camera: 'iso' }, 'key')); await sleep(600); }],
      ['camFree', async () => { await ev(() => window.__demo.demo.store.set({ camera: 'free' }, 'key')); await sleep(600); }],
      // the vote camera already up (C) next to the ceremony's nominee seat 6: you must not keep seat 6
      ['camVoteFirst', async () => { await ev(() => { const d = window.__demo.demo, s = d.player.spots()['seat-6']; d.player.teleport(s.x, s.z); }); await sleep(500); await ev(() => window.__demo.demo.store.set({ camera: 'vote' }, 'key')); await sleep(900); }, { notSeat: [6, 3, 11] }],
      // a ceremony's night 1 s ago (the vote camera hands back to follow 3 s after it): P again
      ['afterNight', async () => { await ev(() => { const d = window.__demo.demo; d.store.set({ camera: 'vote' }, 'time'); }); await sleep(900); await ev(() => window.__demo.demo.store.set({ phase: 'night' }, 'time')); await sleep(1000); }],
      ['twice', async () => {}, { twice: true }],
    ];
    r.pcases = {};
    for (const [name, setup, o = {}] of cases) {
      await preset(char0);
      let s1 = null, s4 = null, err = null;
      try {
        await setup();
        await press('KeyP');
        if (o.twice) { await sleep(150); await page.keyboard.press('KeyP'); }
        await sleep(1500);
        s1 = await pst();
        if (o.hold) { await sleep(800); await page.keyboard.up('KeyW'); await sleep(1700); } else await sleep(2500);
        s4 = await pst();
      } catch (e) { err = String(e); }
      const ok = !err && seated(s1, o.st) && seated(s4, o.st) && s4.cer && !(o.notSeat ?? []).includes(s4.yours);
      r.pcases[name] = ok ? 'ok' : { s1, s4, err };
      if (!ok) fail(`passb: P (${name}) did not bring you into the voting circle (${JSON.stringify({ s1, s4, err })})`);
    }
    // P again (> 1 s after the start) stops the ceremony: back to the follow camera and day, your seat given back
    await sleep(300);
    await press('KeyP');
    await sleep(900);
    const sp = await pst();
    r.pcases.stop = sp.cam === 'follow' && !sp.cer && sp.phase === 'day' && sp.yours < 0 ? 'ok' : sp;
    if (r.pcases.stop !== 'ok') fail(`passb: P during the ceremony did not stop it cleanly (${JSON.stringify(sp)})`);
    await preset(char0);
    console.log(`   P cases: ${JSON.stringify(r.pcases)}`);
  }
  console.log(`   vote: panel yaw ${r.votePanel.yaw} vh ${r.votePanel.vh} (old ${r.oldPanel.vh}) seat ${r.votePanel.px?.seat13} px (old ${r.oldPanel.seat13}) · no panel vh ${r.voteNoPanel.vh} seat ${r.voteNoPanel.px?.seat13} px · transition ${r.transition.poses} poses ${r.transition.settledMs} ms`);
  console.log(`   cast ${r.cast.ids.join(',')} · voting ${r.cast.voting.join(',')} · timer ${JSON.stringify(r.timer.running)} · tower ${JSON.stringify(r.tower.programs)} drum ${JSON.stringify(r.tower.drum)} landing y ${r.tower.landing?.y} · programs ${r.programs.join(' -> ')}`);
  console.log(`   staging ${JSON.stringify(r.stage)} · marks ${JSON.stringify(r.marks)}`);
  note(`passb: seated figures ${r.oldPanel.seat13} -> ${r.votePanel.px?.seat13} px (panel open), ${r.voteNoPanel.px?.seat13} px (panel hidden); stage ${r.stage?.letter}; vote states ${Object.keys(r.marks?.seen ?? {}).join(' ')}; tally ${r.marks?.tally}/${r.marks?.needed}`);
  return r;
}
