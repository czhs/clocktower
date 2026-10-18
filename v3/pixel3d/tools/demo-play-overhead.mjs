// (OH) The overhead-stack checks (owner: ui; docs/DEMO.md §4.7 "Overhead stack"): the STRESS scene (3-4 townsfolk
// close round the player, each with a name + a ghost halo + your person pin + a speech bubble + an emoji / emote pop,
// the player's chevron + talk glyph + its own pop) and the overlap test over every overhead rect gameui.info().overhead
// reports (src/demo/overhead.js). Used by tools/demo-play.mjs (step 6f) and tools/demo-overhead.mjs (the before /
// after shots).
//   setupStress(page, { ghosts })  -> { npcs, restore() }   (page = a ready demo page, the game UI on)
//   overheadOf(page)               -> gameui.info().overhead (null before overhead.js)
//   overlaps(ov)                   -> [{ a, b, area }] the pairs that overlap and are not an allowed exception
// Allowed exceptions (documented in docs/DEMO.md): a name on its OWN halo ('halo' x 'label' / 'wisp' / 'glyph' of one
// character: the label is lifted onto the halo's top, they may touch by a pixel on the walk's bob); nothing else.

// the stress cast: a long neck (Honk), a small bird (Mortimer), a short one (Clover), a broad one (Clarabelle): all
// carry talk + ghost (the shipped four the NPCs start as have neither)
export const CAST = ['honk', 'crow', 'rabbit', 'clarabelle', 'owl', 'fox'];
/** Gives the idle NPCs the `cast` characters through the player's swap rule (taking an NPC's character gives that NPC
 *  your previous one): per slot, become the wanted id, then take the NPC's; finally back to the first character. */
export async function castNPCs(page, cast, sleep) {
  const st = () => page.evaluate(() => { const d = window.__demo.demo; return { you: d.player?.handle?.id ?? null, npcs: (d.npcs?.members ?? []).filter((n) => n && n.slot < 1000).map((n) => n.id) }; });
  const become = async (id) => {
    await page.evaluate((id) => window.__demo.set({ character: id }), id);
    for (let k = 0; k < 100; k++) { if ((await st()).you === id) break; await sleep(100); }
    await sleep(250);
  };
  const s0 = await st(), home = s0.you;
  const want = cast.filter((id) => id !== home);
  for (let i = 0; i < s0.npcs.length && i < want.length; i++) {
    const s = await st();
    if (s.npcs.includes(want[i])) continue;
    await become(want[i]);
    const old = (await st()).npcs[i];
    await become(old);                              // NPC i takes want[i]
    for (let k = 0; k < 60; k++) { if ((await st()).npcs[i] === want[i]) break; await sleep(100); }
  }
  if ((await st()).you !== home) await become(home);
  await sleep(600);
  return st();
}

/** Puts the NPCs round the player (camera right +- 0.85 m, one a step behind, one a step in front), stops their idle
 *  emotes, makes `ghosts` of them ghosts (the halo), pins each, plays their talk clip (bubble), then a pop on each
 *  (emoji / emote alternating), and the player talks + reacts. Resolves ~0.9 s after the last trigger. */
export async function setupStress(page, { ghosts = 2, playerGhost = true, sleep = (ms) => page.waitForTimeout(ms), cast = CAST } = {}) {
  await castNPCs(page, cast, sleep);
  const saved = await page.evaluate(({ ghosts }) => {
    const d = window.__demo.demo, P = d.player.position, R = d.engine.camera.right;
    const fw = { x: R.z, z: -R.x };
    const offs = [[-0.85, 0], [0.85, 0], [0.35, 0.7], [-0.4, -0.6], [1.2, 0.5], [-1.2, 0.5]];
    const list = (d.npcs?.members ?? []).filter((n) => n && n.slot < 1000 && n.base);
    const saved = list.map((n) => ({ slot: n.slot, base: [n.base.x, n.base.y, n.base.z], next: n.next }));
    list.forEach((n, i) => {
      const [a, b] = offs[i % offs.length];
      n.base.set(P.x + R.x * a + fw.x * b, 0, P.z + R.z * a + fw.z * b);
      n.spot.copy(n.base); n.next = 1e9;
      // a ghost: the walking-ghost override (the halo, src/demo/halos.js) over whatever clip plays next
      if (i < ghosts && n.handle?.ch && n.handle.spec?.clips?.ghost) { n.handle.ch.ghost = 1; n.handle.play('ghost'); }
    });
    d.gameui.closeTip?.(); d.gameui.clearPins?.();
    return saved;
  }, { ghosts });
  await sleep(800);
  // your pins (one per townsperson), then everyone talks (the bubbles)
  await page.evaluate(() => {
    const d = window.__demo.demo, g = d.gameui;
    for (const n of (d.npcs?.members ?? []).filter((n) => n && n.slot < 1000 && n.base)) {
      g.dropPin({ member: { slot: n.slot, id: n.id, name: n.handle?.name ?? n.id, you: false, pos: n.spot } });
      if (n.handle?.spec?.clips?.talk) n.handle.play('talk');
    }
  });
  if (playerGhost) { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Digit5'); await sleep(250); }
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Digit1');   // you talk (the talk glyph)
  await sleep(700);
  // the pops: emoji on the even ones, an emote (a clip with a pop: raise / wave / bark / sniff / vote = '!') on the odd ones
  await page.evaluate(() => {
    const d = window.__demo.demo, g = d.gameui, keys = ['laugh', 'shocked', 'agree', 'suspicious'];
    (d.npcs?.members ?? []).filter((n) => n && n.slot < 1000 && n.base).forEach((n, i) => {
      const clip = ['raise', 'wave', 'bark', 'sniff', 'vote'].find((c) => n.handle?.spec?.clips?.[c]);
      if (i % 2 && clip) n.handle.play(clip); else g.npcReact(n.slot, keys[i % keys.length], 0);
    });
    g.react('laugh');
  });
  await sleep(900);
  return {
    npcs: saved.length,
    restore: () => page.evaluate((saved) => {
      const d = window.__demo.demo;
      for (const s of saved) { const n = d.npcs?.members?.[s.slot]; if (!n) continue; n.base.set(...s.base); n.next = s.next; if (n.handle?.ch) n.handle.ch.ghost = null; }
      d.gameui.clearPins?.();
    }, saved),
  };
}

export const overheadOf = (page) => page.evaluate(() => window.__demo.demo.gameui.info().overhead ?? null);

const SELF_OK = new Set(['halo|label', 'halo|wisp', 'halo|glyph']);
// a keep-out (who null: the HUD, a seal / nominee / unowned halo box) only binds the transients: a name under the HUD is
// the HUD's business (gameui hides names under the top row / the panel), the vote ring's names have their own slots
const CORE = new Set(['label', 'wisp', 'glyph', 'chev', 'pins', 'halo']);
/** Overlapping pairs of overhead rects (logical px, strict: a shared edge is not an overlap), minus the exceptions. */
export function overlaps(ov) {
  const out = [], R = ov?.rects ?? [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j];
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0) continue;
    if (a.who === b.who && (SELF_OK.has(`${a.kind}|${b.kind}`) || SELF_OK.has(`${b.kind}|${a.kind}`))) continue;
    if (a.who == null && b.who == null) continue;          // two obstacles (HUD / seals) are not ours
    if ((a.who == null && CORE.has(b.kind)) || (b.who == null && CORE.has(a.kind))) continue;
    out.push({ a: `${a.who}:${a.kind}`, b: `${b.who}:${b.kind}`, area: +(w * h).toFixed(1), at: [a.x, a.y, b.x, b.y].map((v) => +v.toFixed(1)) });
  }
  return out;
}

/** The playtest step (tools/demo-play.mjs 6f): the stress scene in the running page, sampled 8 times over ~1.2 s. */
export async function runOverhead({ page, sleep, shot, fail, note }) {
  const r = { samples: [] };
  const st = await setupStress(page, { ghosts: 2, playerGhost: false, sleep });
  if (st.npcs < 3) note(`overhead: only ${st.npcs} townsfolk for the stress scene`);
  await shot('overhead-stress');
  const hist = [];
  let jitter = 0;
  for (let k = 0; k < 8; k++) {
    const ov = await overheadOf(page);
    if (!ov) { fail('overhead: gameui.info().overhead missing'); break; }
    // stable: nobody moves, so no name may flip back and forth (A -> B -> A) between samples (hysteresis; the bobs are
    // reserved; a talk glyph ending may move a name once)
    const lab = Object.fromEntries(ov.rects.filter((x) => x.kind === 'label').map((x) => [x.who, `${x.x},${x.y}`]));
    if (hist.length >= 2) for (const [w, p] of Object.entries(lab)) { const a = hist[hist.length - 2][w], b = hist[hist.length - 1][w]; if (a && b && a === p && b !== p) jitter++; }
    hist.push(lab);
    const bad = overlaps(ov), kinds = {};
    for (const x of ov.rects) if (x.who != null) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
    r.samples.push({ rects: ov.rects.filter((x) => x.who != null).length, kinds, clashes: ov.clashes?.length ?? 0, dropped: ov.dropped ?? 0, bad: bad.length });
    if (bad.length) fail(`overhead: ${bad.length} overlapping overhead rects (sample ${k}): ${JSON.stringify(bad.slice(0, 6))}`);
    if (k === 0) {
      if (!kinds.label || kinds.label < 3) fail(`overhead: the stress scene shows ${kinds.label ?? 0} names (want >= 3): ${JSON.stringify(kinds)}`);
      if (!kinds.pins) fail(`overhead: no person pins in the stress scene: ${JSON.stringify(kinds)}`);
      if (!kinds.pop) fail(`overhead: no pops in the stress scene: ${JSON.stringify(kinds)}`);
      // (a bubble with no free slot in the visible area is dropped by design: chatter yields to names and reactions)
      if (!kinds.bubble && !ov.dropped) fail(`overhead: no speech bubbles in the stress scene (none dropped either): ${JSON.stringify(kinds)}`);
      if (!kinds.bubble) note(`overhead: every bubble dropped this sample (${ov.dropped} transients had no free slot)`);
      if (!kinds.halo) note(`overhead: no halo rect in the stress scene: ${JSON.stringify(kinds)}`);
      if (!kinds.chev) fail(`overhead: no "you" chevron in the stress scene: ${JSON.stringify(kinds)}`);
    }
    await sleep(150);
  }
  r.jitter = jitter;
  if (jitter) fail(`overhead: names moved ${jitter} times between samples of a still scene (jitter)`);
  console.log(`   overhead: ${JSON.stringify(r.samples[0])} .. ${r.samples.length} samples, jitter ${jitter}`);
  await st.restore();
  await sleep(300);
  return r;
}
