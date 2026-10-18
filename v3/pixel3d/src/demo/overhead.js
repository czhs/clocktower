// (OH) THE OVERHEAD STACK: one per character, owning the placement of everything that floats over a head (owner: ui;
// docs/DEMO.md §4.7 "Overhead stack"; the user, 2026-10-18: "there are some overlapping of emojis and tags and other
// indicators ... all the possible stuff that can float on the head of a character").
//   createOverhead() -> OH { begin(frame), labelSteps(who, l, st, max), core(who, c), place(who, kind, rel, opts),
//                            status(who), slot(who, kind), popRel(key, frames, A, bob), info() }
// gameui.js keeps DRAWING every piece (its art, its tiers, its z order); this module only decides WHERE, per frame:
//
//   the stack, from the head up (every row GAP = 1 art px above the one below it):
//     0  the halo zone      a ghost's halo sprite (halos.js): the head point the label hangs from is already lifted over
//                           it (gameui haloLift: the sprite's top + its glow); the sprite box is registered as the
//                           character's 'halo' (others keep off it)
//     1  the label row      the name label (+ a ghost's wisp at its left) + the talk glyph at its right end
//     2  the status row     the "you" chevron (yours) or YOUR person pins' fan (theirs) - the marks that belong to the
//                           name; the label row + the status row = the CORE: it moves as one
//     3  the pop            emoji reaction / emote pop / system ('!', '?', the point / pin pops): ONE per head, the
//                           newest replaces the older (gameui pop(), the v2 rule), never queued behind a bubble
//     4  the bubble         the speech bubble (NPC chatter), on top: its tail still points down at the speaker
//
//   across neighbours, in SCREEN space, front to back (lowest head first: the nearest character keeps its natural place):
//     - town names slide a little (still spanning their head) or step up whole label rows (11 art px, at most
//       TOWN_STEPS; FULL_STEPS with the full pin fan) until the core (label row + status row) clears every core already
//       placed and every other ghost's halo; in a CROWD (two natural cores overlapped last frame) your pins go COMPACT
//       (7x9 pin glyphs at the name's left end: ~11 px a name instead of ~38); the vote camera's ring slots and the
//       staged court's step-up are gameui's own rules (unchanged), their names are registered here as they land
//     - the transients (every pop first, yours first; then the bubbles) try their natural slot, then slide sideways (a
//       pop by halves of its width up to twice it; a bubble only as far as its tail can still reach the speaker) or
//       stack higher (just over whatever they met), a pop last of all beside its own name;
//       they never cover another character's core, another transient, a halo / seal / nominee keep-out, the HUD (the
//       top row, the toolbar, the action bar, the dock, the tip, HUD clients, off-screen discs) nor leave the visible
//       area (the canvas minus the panel / notebook bands); a transient with no free slot is dropped for that frame
//       (counted: info().dropped) - an overprinted name is worse than a missing pop (the vote ring's old rule)
//   stable: a moved element keeps its last slot while that stays free and returns to its natural slot only once that is
//   free by HYST more art px (no flip-flop on the 1-px bobs or a walking neighbour); every bobbing piece reserves its
//   bob; every offset is whole art px (d units at D=2). Deterministic: a function of the positions, the clock (the
//   pops / bubbles alive) and the last frame's choice.
// Units: HD world px when the D=2 tiers draw (L.hd.world: u = L.hd.k units per scene texel, d = L.hd.d units per art
// px), scene texels on the 1x path (u = d = 1). info() reports logical screen px (gameui.info()'s unit).

export const OH = {
  GAP: 1,           // art px between two rows of one stack
  SIDE: 2,          // art px between a transient slid sideways and what it slid off
  HYST: 2,          // art px of extra room before a moved element returns to its natural slot
  TOWN_STEPS: 5,    // town names: at most 5 label rows up (the old rule: 2; a 5-name huddle needs 4)
  FULL_STEPS: 2,    // ... with the full pin fan over it at most 2 (a fan is ~2.5 rows): higher, the pins go compact
  CHIP: 8,          // art px per compact pin glyph (emotes pinIconSmall 7x9 + 1-px gap) at a crowded name's left end
  ROW: 11,          // art px per label row (gameui's step)
  LIFT_MAX: 160,    // art px a transient may stack over its natural slot (the visible area's top bounds it first)
  CHEV: { dx: -4, w: 9, h: 7, over: 9 },   // the chevron (indicators youChevron 9x6 + its 1-px bob), 9 px over the cap top
  PIN: { left: 8, right: 10, h: 27 },      // a person pin (markers 18x26, tip anchor x 8; + its 1-px bob)
  GLYPH: 10,        // the talk glyph (9 px) + its 1-px gap, right of the name
  WISP: 4,          // art px a D=2 ghost wisp reaches left of the centred prediction
};
const CORE = new Set(['label', 'wisp', 'glyph', 'chev', 'pins', 'halo']);

/** dx / dy (art px) of pin i of n in the person-pin fan (markers drawPersonPins / hd drawPersonPinsHD). */
export const fanOf = (i, n) => {
  const mid = (n - 1) / 2, spread = Math.min(0.62, 2.4 / Math.max(1, n)), kk = i - mid;
  return { dx: n > 1 ? Math.round(kk * 18 * spread) : 0, dy: n > 1 ? Math.round(Math.abs(kk) * 1.5) : 0 };
};

export function createOverhead() {
  let F = { u: 1, d: 1, lu: 1, lo: { x: 0, y: 0 }, vis: { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, t: 0, hd: false };
  const rects = [];                 // this frame: { x0, y0, x1, y1, who, kind }
  const slots = new Map();          // who -> { hx, top, base, status, pop, bubble }
  const memo = new Map();           // `${who}|${kind}` -> { v, t } (last frame's choice)
  const relCache = new Map();
  const compactOf = new Map();      // who -> this frame's labelSteps chose the compact pins
  const natNow = new Map(), crowded = new Set();   // natural cores (this frame) / the crowd (from the last frame)
  let clashes = [], dropped = 0, frames = 0;

  const box = (x0, y0, w, h, who = null, kind = 'obstacle') => ({ x0, y0, x1: x0 + w, y1: y0 + h, who, kind });
  const hit = (a, b, m) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
  const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const add = (r) => { if (r && r.x1 > r.x0 && r.y1 > r.y0) rects.push(r); return r; };
  const remember = (k, v) => memo.set(k, { v, t: F.t });
  const recall = (k) => memo.get(k)?.v;

  /** the status row's rect over a label row (units) */
  function statusOf(who, hx, top, st) {
    const d = F.d;
    if (st.chev) return box(hx + OH.CHEV.dx * d, top + d - OH.CHEV.over * d, OH.CHEV.w * d, OH.CHEV.h * d, who, 'chev');
    if (st.pins > 0) {
      let a = 0, b = 0, dyM = 0;
      for (let i = 0; i < st.pins; i++) { const f = fanOf(i, st.pins); a = Math.min(a, f.dx); b = Math.max(b, f.dx); dyM = Math.max(dyM, f.dy); }
      const B = top - OH.GAP * d;
      return box(hx + (a - OH.PIN.left) * d, B - OH.PIN.h * d, (b - a + OH.PIN.left + OH.PIN.right) * d, (OH.PIN.h + dyM) * d, who, 'pins');
    }
    return null;
  }

  const api = {
    OH,
    /** A new frame: f = { hd, u, d, lu, lo: {x, y} (units = logical x lu + lo), vis {x0, y0, x1, y1} + keep [{x, y, w, h}]
     *  (logical px), obstacles [{x0, y0, x1, y1, who, kind}] (units), t }. */
    begin(f) {
      F = { ...F, ...f };
      rects.length = 0; slots.clear(); compactOf.clear(); clashes = []; dropped = 0; frames++;
      // the crowd (from last frame's natural cores): in it while any other natural core overlaps yours, out once they
      // are clear by HYST more
      const g = OH.GAP * F.d, was = new Set(crowded), nat = [...natNow];
      crowded.clear(); natNow.clear();
      for (const [a, A] of nat) for (const [b, B] of nat) {
        if (a >= b) continue;
        const m = was.has(a) || was.has(b) ? g + OH.HYST * F.d : g;
        if (A.some((x) => B.some((y) => hit(x, y, m)))) { crowded.add(a); crowded.add(b); }
      }
      const L = (x, y) => ({ x: x * F.lu + F.lo.x, y: y * F.lu + F.lo.y });
      if (f.vis) { const a = L(f.vis.x0, f.vis.y0), b = L(f.vis.x1, f.vis.y1); F.vis = { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }
      for (const k of f.keep ?? []) { if (!k || !(k.w > 0) || !(k.h > 0)) continue; const a = L(k.x, k.y); add(box(a.x, a.y, k.w * F.lu, k.h * F.lu, null, 'hud')); }
      for (const o of f.obstacles ?? []) add({ ...o });
      for (const [k, m] of memo) if (F.t - m.t > 2) memo.delete(k);
    },
    /**
     * A TOWN name's step-up (label rows), its core counted: l = { x0, y0, w, h (the predicted label row at step 0,
     * units), step (units per row) }, st = { hx (units), glyph, wisp, chev, pins (count) }. The natural row if it is
     * clear by HYST more, else last frame's while it is clear, else the lowest clear one; none: the least overlapped
     * (a clash, info().clashes).
     */
    labelSteps(who, l, st, max = OH.TOWN_STEPS) {
      const d = F.d, g = OH.GAP * d, V = F.vis;
      const wl = st.wisp && F.hd ? OH.WISP * d : 0;
      // compact (c): a crowded name carries your pins as small pin glyphs at its left end instead of the fan above it
      const coreAt = (s, dx, c) => {
        const y0 = l.y0 - s * l.step, cw = c ? st.pins * OH.CHIP * d : 0;
        const row = box(l.x0 + dx - wl - cw, y0, l.w + wl + cw + (st.glyph ? OH.GLYPH * d : 0), l.h, who, 'label');
        return [row, c ? null : statusOf(who, st.hx, y0, st)].filter(Boolean);
      };
      const others = rects.filter((r) => r.who !== who && r.who != null && CORE.has(r.kind));
      // a stepped row stays below the visible area's top; a slid name still spans its head (6 art px inside either end)
      const ok = (s, dx) => (s === 0 && dx === 0) || (l.y0 - s * l.step >= V.y0 && l.x0 + dx >= Math.min(l.x0, V.x0) && l.x0 + dx + l.w <= Math.max(l.x0 + l.w, V.x1));
      const clear = (s, dx, c, m) => ok(s, dx) && coreAt(s, dx, c).every((a) => others.every((r) => !hit(a, r, m)));
      const k = `${who}|steps`, last = recall(k);
      natNow.set(who, coreAt(0, 0, false));
      // in a CROWD (last frame's natural cores of two characters overlap) your pins go compact at once: a fan per
      // name stacks ~38 px a character, the compact row 11
      const crowd = crowded.has(who) && st.pins > 0;
      let pick = null;
      if (!crowd && clear(0, 0, false, g + OH.HYST * d)) pick = [0, 0, false];
      else if (last && last[0] <= max && (last[2] ? st.pins > 0 : !crowd) && clear(last[0], last[1], last[2], g)) pick = last;
      else {
        // sideways (2-px steps, as far as the name still spans its head) and whole rows up (a row costs ~ 9 px of
        // slide); the full fan at most FULL_STEPS rows up, the compact pins (+ 14 px) up to `max`
        const span = Math.max(0, Math.floor((l.w / d - 12) / 2 / 2) * 2) * d, cands = [];
        for (let s = 0; s <= max; s++) for (let dx = -span; dx <= span; dx += 2 * d) {
          if (!crowd && (s <= OH.FULL_STEPS || !st.pins)) cands.push([Math.abs(dx) + s * 9 * d, s, dx, false]);
          if (st.pins > 0) cands.push([Math.abs(dx) + s * 9 * d + (crowd ? 0 : 14 * d), s, dx, true]);
        }
        cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        for (const [, s, dx, c] of cands) if (clear(s, dx, c, g)) { pick = [s, dx, c]; break; }
        if (!pick) {
          let bo = Infinity;
          for (const [, s, dx, c] of cands) { if (!ok(s, dx)) continue; const o = coreAt(s, dx, c).reduce((n, a) => n + others.reduce((q, r) => q + area(a, r), 0), 0); if (o < bo) { bo = o; pick = [s, dx, c]; } }
          pick ??= [0, 0, false];
          clashes.push({ who, kind: 'label', steps: pick[0], dx: pick[1], compact: pick[2] });
        }
      }
      remember(k, pick);
      compactOf.set(who, pick[2]);
      return { steps: pick[0], dx: pick[1], compact: pick[2] };
    },
    /**
     * Registers a character's core as DRAWN (units): c = { label, wisp, glyph, chev ({x, y, w, h} | null), hx, top (the y
     * the status row stands on: the label box top, or the head for a name beside its figure), pins (count),
     * mark (a vote mark's top: the transients stay over it) }. Returns the status anchor for the pins.
     */
    core(who, c) {
      const R = (b, kind) => (b ? add(box(b.x, b.y, b.w, b.h, who, kind)) : null);
      const own = [R(c.label, 'label'), R(c.wisp, 'wisp'), R(c.glyph, 'glyph'), R(c.chev, 'chev')].filter(Boolean);
      let status = null;
      const d = F.d;
      if (c.pins > 0 && compactOf.get(who) && c.label) {
        // compact: the pin glyphs (7x9) right-aligned 1 px left of the name (its wisp), centred on the label row
        const lx = Math.min(c.label.x, c.wisp?.x ?? Infinity), x = lx - OH.GAP * d, y = c.label.y + Math.floor((c.label.h - 9 * d) / 2);
        own.push(add(box(x - c.pins * OH.CHIP * d + d, y, c.pins * OH.CHIP * d - d, 9 * d, who, 'pins')));
        status = { compact: true, x, y, step: OH.CHIP * d };
      } else if (c.pins > 0) {
        const p = add(statusOf(who, c.hx, c.top, { pins: c.pins }));
        own.push(p);
        status = { cx: c.hx, bottom: c.top - OH.GAP * d };
      }
      for (const r of rects) if (r.who === who && r.kind === 'halo') own.push(r);
      let base = Math.min(c.top, ...own.filter((r) => r.kind !== 'halo').map((r) => r.y0)) - OH.GAP * F.d;
      if (c.mark != null) base = Math.min(base, c.mark - F.d);
      // the label row (name + wisp + glyph + compact pins): a pop's last resort stands beside it
      const rowR = own.filter((r) => r.kind === 'label' || r.kind === 'wisp' || r.kind === 'glyph' || (r.kind === 'pins' && status?.compact));
      const row = rowR.length ? { x0: Math.min(...rowR.map((r) => r.x0)), x1: Math.max(...rowR.map((r) => r.x1)), y1: Math.max(...rowR.map((r) => r.y1)) } : null;
      slots.set(who, { hx: c.hx, top: c.top, base, status, row, pop: null, bubble: null });
      return status;
    },
    /** the person pins' anchor { cx, bottom } (units) of a registered core, or null */
    status: (who) => slots.get(who)?.status ?? null,
    /**
     * A transient over a registered core: kind 'pop' | 'bubble'; rel = its box relative to its anchor point (units:
     * {x0, y0, x1, y1}; the anchor sits at the head's x, the box's bottom on the stack); opts.slide = the sideways
     * offsets allowed (units, both ways). Returns { ax, ay, x0, y0, x1, y1 } (the anchor + the box) or null (dropped).
     */
    place(who, kind, rel, { slide = null } = {}) {
      const S = slots.get(who);
      if (!S) return null;
      const d = F.d, g = OH.GAP * d, V = F.vis;
      // the pop stands on the core, the bubble on the pop (whichever is higher)
      let base = S.base;
      // (a pop slid off the head's column does not lift the bubble: it only has to keep off it)
      if (kind === 'bubble' && S.pop && S.pop.x0 <= S.hx && S.pop.x1 >= S.hx) base = Math.min(base, S.pop.y0 - g);
      const ax0 = S.hx, ay0 = base - rel.y1, W = rel.x1 - rel.x0;
      const at = (dx, L) => ({ ax: ax0 + dx, ay: ay0 - L, x0: ax0 + dx + rel.x0, y0: ay0 - L + rel.y0, x1: ax0 + dx + rel.x1, y1: ay0 - L + rel.y1 });
      const fits = (b) => b.x0 >= V.x0 && b.x1 <= V.x1 && b.y0 >= V.y0 && b.y1 <= V.y1;
      const free = (b, m) => fits(b) && rects.every((r) => !hit(b, r, r.who === who ? g : m));
        // sideways: a pop by halves of its width up to twice it, a bubble as far as its tail reaches; clamped into the
      // visible area
      const hw = Math.ceil(W / 2 / d) * d, dxs = new Set([0]);
      for (const s of slide ?? [1, 2, 3, 4].map((i) => i * hw + OH.SIDE * d)) if (s > 0) { dxs.add(s); dxs.add(-s); }
      const clampDx = (dx) => { const x0 = ax0 + dx + rel.x0; return x0 < V.x0 ? dx + Math.ceil((V.x0 - x0) / d) * d : x0 + W > V.x1 ? dx - Math.ceil((x0 + W - V.x1) / d) * d : dx; };
      for (const dx of [...dxs]) dxs.add(clampDx(dx));
      // higher: just over whatever the column meets (its top - GAP), up to LIFT_MAX
      const lifts = new Set([0]);
      for (const r of rects) { const L = ay0 + rel.y1 - (r.y0 - g); if (L > 0 && L <= OH.LIFT_MAX * d) lifts.add(L); }
      // a pop may also stand BESIDE its own name (bottom-aligned with the label row, SIDE px off either end): the
      // last resort under a crowded sky (the top of a huddle's name tower)
      if (kind === 'pop' && S.row) {
        lifts.add(ay0 + rel.y1 - S.row.y1);
        dxs.add(S.row.x1 + OH.SIDE * d - (ax0 + rel.x0)); dxs.add(S.row.x0 - OH.SIDE * d - (ax0 + rel.x1));
      }
      const k = `${who}|${kind}`, last = recall(k);
      let pick = null;
      const nat = at(clampDx(0), 0);
      if (free(nat, g + OH.HYST * d)) pick = nat;
      else if (last && free(at(last.dx, last.L), g)) pick = at(last.dx, last.L);
      else {
        const cands = [];
        for (const dx of dxs) for (const L of lifts) cands.push([Math.abs(dx) + 1.5 * Math.abs(L) + (L < 0 ? 24 * d : 0), dx, L]);
        cands.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
        for (const [, dx, L] of cands) { const b = at(dx, L); if (free(b, g)) { pick = b; break; } }
      }
      if (!pick) { dropped++; memo.delete(k); return null; }
      pick.hx = ax0;                    // the head's x (a slid bubble's tail still points there)
      remember(k, { dx: pick.ax - ax0, L: ay0 - pick.ay });
      add(box(pick.x0, pick.y0, pick.x1 - pick.x0, pick.y1 - pick.y0, who, kind));
      S[kind] = pick;
      return pick;
    },
    /** this frame's slot of a transient (place's result) or null */
    slot: (who, kind) => slots.get(who)?.[kind] ?? null,
    /** A pop's box relative to its anchor (units): the union of its frames' drawn pixels (the burst is wider than the
     *  hold) + its bob; cached per key. frames = PixelImages at the tier's density, A = their anchor. */
    popRel(key, frames, A, bob) {
      let r = relCache.get(key);
      if (r) return r;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const im of frames) { const b = im?.bbox?.(); if (!b) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
      if (!(x1 > x0)) return null;
      r = { x0: x0 - A.x, y0: y0 - A.y - bob, x1: x1 - A.x, y1: y1 - A.y };
      relCache.set(key, r);
      if (relCache.size > 200) relCache.delete(relCache.keys().next().value);
      return r;
    },
    /** every rect this frame in LOGICAL screen px ({who: 'you' | 'npc<slot>' | null (HUD / keep-outs), kind}), the clashes
     *  (a name that found no clear row), the transients dropped (no free slot) */
    info() {
      const q = (v) => Math.round(v * 2) / 2;
      return {
        units: F.hd ? 'hd' : '1x', d: F.d, frames,
        rects: rects.map((r) => ({ who: r.who, kind: r.kind, x: q((r.x0 - F.lo.x) / F.lu), y: q((r.y0 - F.lo.y) / F.lu), w: q((r.x1 - r.x0) / F.lu), h: q((r.y1 - r.y0) / F.lu) })),
        clashes: clashes.map((c) => ({ ...c })), dropped,
      };
    },
  };
  return api;
}
