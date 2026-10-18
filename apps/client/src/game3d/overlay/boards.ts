// v3 WP4 (v3-overlay). Door boards (who is inside each cottage) and house-name callouts for the 3D town.
//
// Door boards (v2.2 rules, gameplay/doorTags.ts + boardTokens.ts): data only from `doorTagsStore` (the
// public occupancy the server sends every viewer in waiting / setup / day, never the Storyteller; the
// gameplay core publishes it on every snapshot), shown by day for lived-in cottages while the viewer is
// outdoors. Up to MAX_ICONS (4) round character tokens (indicators `token_ring[_ghost]` with the
// occupant's `icon_<preset>[/ghost]` portrait on its disc, laid out with boardTokens `tokenGrid`), then a
// "+N" badge; names only as a hover (mouse) / tap (touch) tooltip, as in v2. Anchored per §3 at the door
// point + doorNormal · 0.6 m, 1.6 m above the ground.
//
// House names (v2.2, gameplay/houseNames.ts): every lived-in house shows its owner's display name (public
// seats only: `houseOwners`), shortened with `fitName`, coloured with `labelStyle` (own home gold, a dead
// owner pale blue, dimmer at night), as a DOM callout at the house's placed centre at roof height, moved
// off its door board with `labelShift`.
//
// Text is always textContent (never markup); positions are transform writes (place.ts).
import { tileCenterPx, type BuildingDef } from '@ct/protocol';
import { doorTagsStore, type DoorBoardView } from '../../game/gameplay/doorTags';
import { overflowText, tokenGrid, tokenLabel } from '../../game/gameplay/boardTokens';
import { fitName, houseOwners, labelShift, labelStyle } from '../../game/gameplay/houseNames';
import { houseInUse } from '../../game/rules/doors';
import { inRect, type Rect } from './anchors';
import { cull, newPlaceState, place, setShown, setStyle, setText, type PlaceState } from './place';
import { measureEl } from './surface';
import type { OverlayEnv, OverlayFrame, OverlayView } from './types';

const DAYLIKE: ReadonlySet<string> = new Set(['waiting', 'setup', 'day', 'finished']);
/** §3: board anchor = door point + doorNormal · 0.6 m, at 1.6 m. */
const BOARD_OUT_M = 0.6;
const BOARD_H_M = 1.6;
/** Roof height of the callout anchor (cottage ridges are ≈ 4.7 m, §3 "ST taps"). */
const ROOF_M = 5;
/** Token cell (texels): token_ring is 16×17 with its disc centre at (8, 9). */
const TOKEN_T = 17;
const TOKEN_ANCHOR = { x: 8, y: 9 };
const TOKEN_ICON = { x: 2, y: 3, cx: 6, cy: 6, r: 5 };
const BOARD_PAD = 3;
const WOOD = '#3d2a1c';
const WOOD_EDGE = '#6b4c30';

interface BoardState {
  key: string;
  view: DoorBoardView;
  /** Last drawn box (root-local CSS px) and token discs for hover. */
  box: Rect | null;
  hits: { x: number; y: number; r: number; text: string }[];
  badge: { el: HTMLElement; st: PlaceState; text: string; size: number; color: string } | null;
  /** tokenLabel of each shown token (built with the board, not per frame) and the reused hit objects. */
  labels: string[];
  hitPool: { x: number; y: number; r: number; text: string }[];
  boxBuf: Rect;
  /** World px of the anchor (door + normal · 0.6 m). */
  at: { x: number; y: number };
}

export interface BoardInspect {
  tokens: string[];
  badge: string | null;
  /** World px box of the board (v2 shape; derived from the screen box at the anchor's zoom). */
  rect: { x: number; y: number; w: number; h: number };
  /** Built and the viewer is outdoors (v2 meaning). */
  visible: boolean;
  /** Page CSS px of the drawn board, or null while it is off-screen. */
  screen: { x: number; y: number; w: number; h: number } | null;
}

export interface BoardsView extends OverlayView {
  inspect(): Record<string, BoardInspect>;
  /** Root-local CSS box of a drawn board (house names avoid it). */
  boxOf(id: string): Rect | null;
}

export function createBoardsView(env: OverlayEnv): BoardsView {
  const { deps, surface, atlas, stats } = env;
  const el = deps.surface ?? deps.parent;
  const boards = new Map<string, BoardState>();
  let tags = doorTagsStore.get();
  let dirty = true;
  const offTags = doorTagsStore.subscribe((v) => {
    tags = v;
    dirty = true;
  });
  let lastPhase = '';
  let lastPlayers: unknown = undefined;
  let outdoors = false;
  let lastFrame: OverlayFrame | null = null;
  const tip = { el: null as HTMLElement | null, st: newPlaceState(), text: '', color: '', until: 0, hit: null as { x: number; y: number; r: number; text: string } | null };
  const tmp = { x: 0, y: 0 };
  const pBuf = { x: 0, y: 0 };

  const anchorOf = (b: BuildingDef, f: OverlayFrame) => {
    const d = tileCenterPx(f.state.layout, b.door);
    const n = b.doorNormal ?? [0, 1];
    const k = BOARD_OUT_M * 16;
    return { x: d.x + n[0] * k, y: d.y + n[1] * k };
  };

  function rebuild(f: OverlayFrame) {
    const game = f.state.game;
    const day = DAYLIKE.has(f.state.phase);
    const seen = new Set<string>();
    for (const b of f.state.layout.buildings) {
      const view = tags[b.id];
      if (!day || !view?.shown.length || !houseInUse(game, b)) continue;
      seen.add(b.id);
      const key = JSON.stringify([view.tags.map((t) => [t.pid, t.name, t.ghost, t.preset]), view.overflow]);
      const cur = boards.get(b.id);
      if (cur && cur.key === key) continue;
      const st: BoardState = cur ?? { key, view, box: null, hits: [], badge: null, at: anchorOf(b, f), labels: [], hitPool: [], boxBuf: { x: 0, y: 0, w: 0, h: 0 } };
      st.key = key;
      st.view = view;
      st.labels = view.shown.map(tokenLabel);
      st.at = anchorOf(b, f);
      const badgeText = view.overflow > 0 ? overflowText(view.overflow) : null;
      if (badgeText) {
        if (!st.badge) {
          st.badge = { el: surface.text('badge'), st: newPlaceState(), text: '', size: 0, color: '' };
          setStyle(st.badge.el, 'fontWeight', '700', stats);
        }
        if (st.badge.text !== badgeText) {
          st.badge.text = badgeText;
          setText(st.badge.el, badgeText, stats);
        }
      } else if (st.badge) {
        st.badge.el.remove();
        stats.content++;
        st.badge = null;
      }
      boards.set(b.id, st);
    }
    for (const [id, st] of boards)
      if (!seen.has(id)) {
        st.badge?.el.remove();
        if (st.badge) stats.content++;
        boards.delete(id);
      }
  }

  function update(f: OverlayFrame) {
    lastFrame = f;
    outdoors = f.location === 'outdoors';
    // rebuild on new door tags, a phase change or a new seat list (payloads are replaced on update)
    const players = f.state.game?.players ?? null;
    if (dirty || f.state.phase !== lastPhase || players !== lastPlayers) {
      dirty = false;
      lastPhase = f.state.phase;
      lastPlayers = players;
      rebuild(f);
    }
    const px = f.px;
    for (const st of boards.values()) {
      st.box = null;
      st.hits.length = 0;
      const p = outdoors ? f.project(st.at, BOARD_H_M, pBuf) : null;
      if (!p) {
        if (st.badge) setShown(st.badge.el, st.badge.st, false, stats);
        continue;
      }
      const shown = st.view.shown;
      const grid = tokenGrid(shown.length, TOKEN_T, st.view.overflow);
      const bw = Math.ceil(grid.w) + 2 * BOARD_PAD + (grid.badge ? 6 : 0);
      const bh = Math.ceil(grid.h) + 2 * BOARD_PAD;
      const left = p.x - (bw * px) / 2;
      const top = p.y - bh * px;
      const box = (st.box = st.boxBuf);
      box.x = left;
      box.y = top;
      box.w = bw * px;
      box.h = bh * px;
      // wooden plaque (v2 board colours) with a 1-texel edge, its post down to the anchor
      f.fx.rect(left - px, top - px, bw + 2, bh + 2, f.tokens.outline, 0.9);
      f.fx.rect(left, top, bw, bh, WOOD, 1);
      f.fx.rect(left, top, bw, 1, WOOD_EDGE, 1);
      const cx = left + (bw * px) / 2;
      const cy = top + (bh * px) / 2;
      for (let i = 0; i < shown.length; i++) {
        const t = shown[i]!;
        const s = grid.slots[i]!;
        const tx = cx + s.dx * px;
        const ty = cy + s.dy * px;
        const ring = atlas.frame('indicators', t.ghost ? 'token_ring_ghost' : 'token_ring', f.night);
        const icon = t.preset ? (atlas.frame('portraits', t.ghost ? `icon_${t.preset}/ghost` : `icon_${t.preset}`, f.night) ?? atlas.frame('portraits', `icon_${t.preset}`, f.night)) : null;
        if (!f.fx.blit(ring, tx, ty, TOKEN_ANCHOR.x, TOKEN_ANCHOR.y)) f.fx.ellipse(tx, ty, 6, 6, t.ghost ? f.tokens.ghost : f.tokens.parchment);
        f.fx.blitDisc(icon, tx - (TOKEN_ANCHOR.x - TOKEN_ICON.x) * px, ty - (TOKEN_ANCHOR.y - TOKEN_ICON.y) * px, TOKEN_ICON.cx, TOKEN_ICON.cy, TOKEN_ICON.r, t.ghost ? 0.72 : 1);
        const h = (st.hitPool[i] ??= { x: 0, y: 0, r: 0, text: '' });
        h.x = tx;
        h.y = ty;
        h.r = 6 * px;
        h.text = st.labels[i] ?? '';
        st.hits.push(h);
      }
      if (st.badge && grid.badge) {
        const bx = cx + grid.badge.dx * px;
        const by = cy + grid.badge.dy * px;
        f.fx.rect(bx - 6 * px, by - 4 * px, 12, 8, f.tokens.ink, 0.95);
        const size = Math.max(10, 4 * px + 2);
        if (st.badge.size !== size) {
          st.badge.size = size;
          setStyle(st.badge.el, 'fontSize', `${size}px`, stats);
        }
        if (st.badge.color !== f.tokens.text) {
          st.badge.color = f.tokens.text;
          setStyle(st.badge.el, 'color', f.tokens.text, stats);
        }
        place(st.badge.el, st.badge.st, bx - 5 * px, by - size / 2, stats);
      }
    }
    updateTip(f);
  }

  // ---- token tooltip (hover with a mouse, tap on touch: auto-hides)
  function hitAt(cx: number, cy: number) {
    const p = surface.toLocal(cx, cy, tmp);
    for (const st of boards.values()) {
      if (!st.box || !inRect(p, st.box, 2)) continue;
      for (let i = st.hits.length - 1; i >= 0; i--) {
        const h = st.hits[i]!;
        if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 <= h.r * h.r) return h;
      }
    }
    return null;
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    tip.hit = hitAt(e.clientX, e.clientY);
    tip.until = tip.hit ? Infinity : 0;
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const h = hitAt(e.clientX, e.clientY);
    if (h) {
      tip.hit = h;
      tip.until = performance.now() + 2500;
    }
  };
  const onLeave = () => {
    if (tip.until === Infinity) tip.hit = null;
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerleave', onLeave);
  function updateTip(f: OverlayFrame) {
    if (tip.hit && f.now > tip.until) tip.hit = null;
    const h = tip.hit && outdoors ? tip.hit : null;
    if (!h) {
      if (tip.el) setShown(tip.el, tip.st, false, stats);
      return;
    }
    if (!tip.el) {
      tip.el = surface.text('tip');
      setStyle(tip.el, 'fontWeight', '700', stats);
      setStyle(tip.el, 'padding', '1px 4px', stats);
      setStyle(tip.el, 'borderRadius', '2px', stats);
      setStyle(tip.el, 'background', 'rgba(20, 13, 28, 0.8)', stats);
      setStyle(tip.el, 'fontSize', '12px', stats);
    }
    if (tip.text !== h.text) {
      tip.text = h.text;
      setText(tip.el, h.text, stats);
    }
    if (tip.color !== f.tokens.labelText) {
      tip.color = f.tokens.labelText;
      setStyle(tip.el, 'color', tip.color, stats);
    }
    // centred over the token (text width ≈ 6.5 px / char; no layout read per frame)
    place(tip.el, tip.st, h.x - (h.text.length * 6.5) / 2 - 4, h.y - h.r - 18, stats);
  }

  return {
    update,
    boxOf: (id) => boards.get(id)?.box ?? null,
    inspect() {
      const out: Record<string, BoardInspect> = {};
      const z = Math.max(0.05, deps.view.cssPerPx());
      for (const [id, st] of boards) {
        const box = st.box;
        const page = box ? surface.toPage(box.x, box.y) : null;
        const w = (box?.w ?? 0) / z;
        const h = (box?.h ?? 0) / z;
        out[id] = {
          tokens: st.view.shown.map(tokenLabel),
          badge: st.view.overflow > 0 ? overflowText(st.view.overflow) : null,
          rect: { x: st.at.x - w / 2, y: st.at.y - h, w, h },
          visible: outdoors && !!lastFrame,
          screen: box && page ? { x: page.x, y: page.y, w: box.w, h: box.h } : null,
        };
      }
      return out;
    },
    destroy() {
      offTags();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerleave', onLeave);
      for (const st of boards.values()) st.badge?.el.remove();
      boards.clear();
      tip.el?.remove();
    },
  };
}

// ---------------------------------------------------------------------------------------
// house names

interface Callout {
  el: HTMLElement;
  st: PlaceState;
  key: string;
  w: number;
  h: number;
  dirty: boolean;
  seen: number;
}

export function createHouseNamesView(env: OverlayEnv, boards: Pick<BoardsView, 'boxOf'>): OverlayView {
  const { surface, stats } = env;
  const callouts = new Map<string, Callout>();
  let measureCtx: CanvasRenderingContext2D | null | undefined;
  let measureFont = '';
  const fit = (s: string) => {
    if (measureCtx === undefined) measureCtx = surface.root.ownerDocument.createElement('canvas').getContext('2d');
    if (!measureCtx) return s.length * 7;
    if (measureCtx.font !== measureFont) measureCtx.font = measureFont;
    return measureCtx.measureText(s).width;
  };
  // The callouts' content only changes with the seats / names / deaths (game view), the lobby members, the UI
  // scale, the time of day and who "I" am: owners and fitted names are rebuilt only when one of those changes
  // (the store payloads are replaced on every update, so reference checks suffice); per frame only placing.
  const key = { layout: null as unknown, players: null as unknown, members: null as unknown, px: -1, tod: '', me: null as string | null };
  const list: { c: Callout; ax: number; ay: number; id: string }[] = [];
  const at = { x: 0, y: 0 };
  const box = { x: 0, y: 0, w: 0, h: 0 };

  /** Font epoch the callout sizes were measured at (surface.fontEpoch: web fonts arriving re-measure once). */
  let fontSeen = surface.fontEpoch();
  /** Some callout measured 0 × 0 (e.g. the town was hidden): measure it again on the next frame. */
  let unmeasured = false;
  function measureCallouts(cs: readonly Callout[]) {
    unmeasured = false;
    for (const c of cs) {
      const m = measureEl(c.el);
      c.w = m.w;
      c.h = m.h;
      c.dirty = c.w === 0 && !!c.el.textContent;
      if (c.dirty) unmeasured = true;
    }
  }
  const remeasure: Callout[] = [];

  function rebuild(f: OverlayFrame, players: unknown, members: unknown) {
    const lobby = env.deps.conn.lobbyView.get();
    const owners = houseOwners(f.state.layout, f.state.game?.players ?? null, lobby?.members ?? null);
    const fontPx = Math.min(14, Math.max(11, 3 + 4 * f.px));
    measureFont = `700 ${fontPx}px "Alegreya Sans", "Segoe UI", system-ui, sans-serif`;
    const toMeasure: Callout[] = [];
    list.length = 0;
    const ts = f.state.layout.tileSize;
    for (const b of f.state.layout.buildings) {
      const owner = owners[b.id];
      if (!owner) continue;
      const style = labelStyle(owner.pid === f.state.myPid, owner.ghost, f.night);
      const name = fitName(owner.name, 140, fit);
      const ckey = `${name}|${style.color}|${style.alpha}|${fontPx}|${f.night ? 1 : 0}`;
      let c = callouts.get(b.id);
      if (!c) {
        c = { el: surface.text('callout'), st: newPlaceState(), key: '', w: 0, h: 0, dirty: true, seen: 0 };
        setStyle(c.el, 'fontWeight', '700', stats);
        setStyle(c.el, 'padding', '1px 5px 2px', stats);
        setStyle(c.el, 'borderRadius', '3px', stats);
        callouts.set(b.id, c);
      }
      if (c.key !== ckey) {
        c.key = ckey;
        setText(c.el, name, stats);
        setStyle(c.el, 'color', style.color, stats);
        setStyle(c.el, 'opacity', String(style.alpha), stats);
        setStyle(c.el, 'fontSize', `${fontPx}px`, stats);
        setStyle(c.el, 'background', f.night ? 'rgba(12, 11, 22, 0.62)' : 'rgba(26, 21, 36, 0.55)', stats);
        c.dirty = true;
        toMeasure.push(c);
      }
      const fp = b.footprint;
      list.push({ c, ax: (fp.x + fp.w / 2) * ts, ay: (fp.y + fp.h / 2) * ts, id: b.id });
    }
    measureCallouts(toMeasure);
    for (const [id, c] of callouts) {
      let used = false;
      for (let i = 0; i < list.length; i++) if (list[i]!.c === c) used = true;
      if (!used) {
        c.el.remove();
        stats.content++;
        callouts.delete(id);
      }
    }
    key.layout = f.state.layout;
    key.players = players;
    key.members = members;
    key.px = f.px;
    key.tod = f.tod;
    key.me = f.state.myPid;
  }

  function update(f: OverlayFrame) {
    // (v3.1 QA C2) not during the voting-circle frame: the foreground houses' pills projected into the circle, over the
    // player labels, repeating a seated player's name (WP1 Camera3d has cameraMode(); other views never hide them)
    if (f.location !== 'outdoors' || (env.deps.view as { cameraMode?: () => string }).cameraMode?.() === 'vote') {
      for (const c of callouts.values()) setShown(c.el, c.st, false, stats);
      return;
    }
    const players = f.state.game?.players ?? null;
    const members = env.deps.conn.lobbyView.get()?.members ?? null;
    if (key.layout !== f.state.layout || key.players !== players || key.members !== members || key.px !== f.px || key.tod !== f.tod || key.me !== f.state.myPid) rebuild(f, players, members);
    const fe = surface.fontEpoch();
    if (fe !== fontSeen || unmeasured) {
      const all = fe !== fontSeen;
      fontSeen = fe;
      remeasure.length = 0;
      for (let i = 0; i < list.length; i++) if (all || list[i]!.c.dirty) remeasure.push(list[i]!.c);
      measureCallouts(remeasure);
    }
    for (let i = 0; i < list.length; i++) {
      const { c, ax, ay, id } = list[i]!;
      at.x = ax;
      at.y = ay;
      const p = f.project(at, ROOF_M, at);
      if (!p) {
        cull(c.el, c.st, stats); // off the canvas: parked, not a visibility flip
        continue;
      }
      box.x = p.x - c.w / 2;
      box.y = p.y - c.h - 3 * f.px;
      box.w = c.w;
      box.h = c.h;
      const shift = labelShift(box, boards.boxOf(id), c.w / 2);
      const x = box.x + shift.dx;
      const y = box.y + shift.dy;
      place(c.el, c.st, x, y, stats, { w: f.w, h: f.h, margin: 160 });
      // the little tail down to the anchor
      if (shift.dy === 0) {
        f.fx.rect(p.x - f.px, y + c.h, 3, 1, f.tokens.outline, 0.55);
        f.fx.rect(p.x, y + c.h + f.px, 1, 1, f.tokens.outline, 0.55);
      }
    }
  }

  return {
    update,
    destroy() {
      for (const c of callouts.values()) c.el.remove();
      callouts.clear();
      list.length = 0;
    },
  };
}
