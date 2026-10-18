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
  r.cast = { ids: s.ids, shown: s.shown, folkHidden: s.folkHidden, members: s.members };
  if (s.shown !== 15) fail(`passb: ${s.shown}/15 seated cast shown`);
  if (s.ids.includes(player) || s.ids.includes('storyteller')) fail(`passb: the player's character / the Storyteller in a seat (${s.ids.join(',')})`);
  if (s.folkHidden !== true) fail('passb: the townsfolk mannequins still shown on the seats');
  await sleep(1900);
  s = await ev(() => window.__demo.demo.passB.seats.info());
  if (!/ghost/.test(s.clips[3] ?? '') || !/ghost/.test(s.clips[11] ?? '')) fail(`passb: dead seats not ghosts (${s.clips[3]}, ${s.clips[11]})`);
  // the vote: voters raise a hand as the vote opens; the marks (votemarks.js) show every state through the sweep
  // (nominee 6; voters 7 9 10 12 0 1 + the ghost 3 with its one vote; seat 11 a spent ghost; 13 alive = 7 needed)
  const stateSeen = {}, kindsAt = [];
  let marksInfo = null, voting = [];
  await ev(() => { window.__voteBells = 0; window.__demo.demo.events.on('bell', () => { window.__voteBells++; }); });
  await ev(() => { const d = window.__demo.demo; for (const i of [7, 9, 10, 12, 0, 1, 3]) d.time.setVote(i, true); d.store.set({ phase: 'vote' }, 'test'); });
  const tv0 = Date.now();
  let shotCounted = false;
  while (Date.now() - tv0 < 9600) {
    marksInfo = await ev(() => window.__demo.demo.passB.marks?.info?.() ?? null);
    if (!marksInfo) break;
    const kinds = Object.fromEntries(Object.entries(marksInfo.seats).map(([i, x]) => [i, x.kind]));
    for (const [i, k] of Object.entries(kinds)) (stateSeen[k] ??= new Set()).add(+i);
    kindsAt.push({ ms: Date.now() - tv0, tally: marksInfo.tally, plaque: marksInfo.plaque?.text ?? null });
    if (Date.now() - tv0 > 1000 && !voting.length) { const s1 = await ev(() => window.__demo.demo.passB.seats.info()); voting = Object.entries(s1.clips).filter(([, c]) => c === 'vote').map(([i]) => +i); }
    if (!shotCounted && marksInfo.tally >= 3) { shotCounted = true; await shot('passb-vote-marks'); }
    await sleep(120);
  }
  r.cast.voting = voting;
  if (voting.length < 4) fail(`passb: only ${voting.length} seated voters raised a hand as the vote opened`);
  r.marks = { seen: Object.fromEntries(Object.entries(stateSeen).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])), tally: marksInfo?.tally, needed: marksInfo?.needed, passed: marksInfo?.passed, bell: marksInfo?.bell, bells: await ev(() => window.__voteBells), plaque: marksInfo?.plaque?.text ?? null, gold: marksInfo?.plaque?.gold ?? null, hand: marksInfo?.hand };
  const has = (k, seat) => stateSeen[k]?.has(seat);
  const need = [['waiting', 13], ['raised', 1], ['counted', 7], ['counted', 0], ['passed', 8], ['passed', 14], ['ghost-raised', 3], ['ghost-counted', 3], ['spent', 11]];
  const miss = need.filter(([k, s]) => !has(k, s));
  if (!marksInfo) fail('passb: no vote marks (votemarks.js)');
  else if (miss.length) fail(`passb: vote states not seen: ${miss.map(([k, s]) => `${k}@${s}`).join(', ')} (seen ${JSON.stringify(r.marks.seen)})`);
  if (marksInfo && (marksInfo.tally !== 7 || marksInfo.needed !== 7 || !marksInfo.passed)) fail(`passb: the tally ${marksInfo.tally} / ${marksInfo.needed} passed ${marksInfo.passed} (want 7 / 7, passed)`);
  if (marksInfo && !(marksInfo.bell >= 1 && r.marks.bells >= 1)) fail(`passb: the threshold did not ring the tower bell (marks ${marksInfo.bell}, bell events ${r.marks.bells})`);
  if (marksInfo && !(marksInfo.plaque?.gold)) fail(`passb: the tally plaque did not turn gold at the threshold (${JSON.stringify(marksInfo.plaque)})`);
  // the plaque counted up one by one (a flip per count): the tallies seen are non-decreasing and reach 7
  const tallies = kindsAt.map((x) => x.tally);
  if (tallies.some((x, i) => i && x < tallies[i - 1])) fail(`passb: the tally went down ${JSON.stringify(tallies)}`);
  r.marks.tallies = [...new Set(tallies)];
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
  console.log(`   vote: panel yaw ${r.votePanel.yaw} vh ${r.votePanel.vh} (old ${r.oldPanel.vh}) seat ${r.votePanel.px?.seat13} px (old ${r.oldPanel.seat13}) · no panel vh ${r.voteNoPanel.vh} seat ${r.voteNoPanel.px?.seat13} px · transition ${r.transition.poses} poses ${r.transition.settledMs} ms`);
  console.log(`   cast ${r.cast.ids.join(',')} · voting ${r.cast.voting.join(',')} · timer ${JSON.stringify(r.timer.running)} · tower ${JSON.stringify(r.tower.programs)} drum ${JSON.stringify(r.tower.drum)} landing y ${r.tower.landing?.y} · programs ${r.programs.join(' -> ')}`);
  console.log(`   staging ${JSON.stringify(r.stage)} · marks ${JSON.stringify(r.marks)}`);
  note(`passb: seated figures ${r.oldPanel.seat13} -> ${r.votePanel.px?.seat13} px (panel open), ${r.voteNoPanel.px?.seat13} px (panel hidden); stage ${r.stage?.letter}; vote states ${Object.keys(r.marks?.seen ?? {}).join(' ')}; tally ${r.marks?.tally}/${r.marks?.needed}`);
  return r;
}
