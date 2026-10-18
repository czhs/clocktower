// Door-board character tokens (world-art, v2.2): the bulletin board by each door shows WHO IS
// INSIDE as little pinned round tokens — each occupant's roster character (bust of the cast
// sheet's idle 'down' frame) — instead of printed names. Ghosts (the tag's public `ghost` flag) get
// a pale blue spirit token; more than MAX_ICONS occupants end in a "+N" badge. Names are not
// printed on the board: hovering (or tapping) a token shows that player's name as a small tooltip.
//
// Data: only `DoorBoardView` from doorTagsStore (public occupancy the server sends every viewer in
// waiting / setup / day; never the Storyteller). Nothing new from the server.
//
// Art: tokens are canvas textures built once per (character, ghost) from the already-loaded 'cast'
// texture, at 2 texture px per world px (the bust at its native pixel scale inside a pixel-perfect
// disc), then displayed at a zoom-dependent world size so they stay readable on phones.
import type * as Phaser from 'phaser';
import castJson from '@ct/assets/generated/cast.json';
import type { DoorBoardView, DoorTagView } from './doorTags';

// ---------------------------------------------------------------------------------------
// pure parts (unit-tested)

/** Token disc diameter in texture px (2 texture px per world px at the base size). */
export const TOKEN_TEX = 22;
/** Base token size in world px; the display size grows at small zoom (see tokenWorldSize). */
export const TOKEN_MIN = 11;
export const TOKEN_MAX = 20;
/** Target on-screen size (CSS px) of one token. */
export const TOKEN_CSS = 18;

/** World px per token at a camera zoom (CSS px per world px): TOKEN_MIN unless that would be under TOKEN_CSS on screen. */
export function tokenWorldSize(cssZoom: number): number {
  const z = Number.isFinite(cssZoom) && cssZoom > 0 ? cssZoom : 1;
  return Math.max(TOKEN_MIN, Math.min(TOKEN_MAX, Math.round(TOKEN_CSS / z)));
}

export interface TokenSlot {
  /** Index into `view.shown`. */
  i: number;
  /** Centre, relative to the grid centre (world px). */
  dx: number;
  dy: number;
}
export interface TokenGrid {
  slots: TokenSlot[];
  /** Grid size (world px). */
  w: number;
  h: number;
  /** "+N" badge centre relative to the grid centre, or null when everyone fits. */
  badge: { dx: number; dy: number; text: string } | null;
}

/**
 * Token placement for `n` shown occupants (1..4) of size `t` world px: one row for 1-2, two rows
 * (2 + 1 centred, or 2 + 2) for 3-4. The "+N" badge hangs off the bottom-right corner.
 */
export function tokenGrid(n: number, t: number, overflow: number): TokenGrid {
  const count = Math.max(0, Math.min(4, Math.floor(n)));
  const gap = Math.max(1, Math.round(t * 0.12));
  const cols = count <= 1 ? count : 2;
  const rows = count === 0 ? 0 : count <= 2 ? 1 : 2;
  const w = cols ? cols * t + (cols - 1) * gap : 0;
  const h = rows ? rows * t + (rows - 1) * gap : 0;
  const slots: TokenSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = i < 2 ? 0 : 1;
    const inRow = row === 0 ? Math.min(2, count) : count - 2;
    const col = row === 0 ? i : i - 2;
    const rowW = inRow * t + (inRow - 1) * gap;
    slots.push({ i, dx: -rowW / 2 + t / 2 + col * (t + gap), dy: -h / 2 + t / 2 + row * (t + gap) });
  }
  const badge = overflow > 0 ? { dx: w / 2, dy: h / 2, text: overflowText(overflow) } : null;
  return { slots, w, h, badge };
}

/** "+N" (capped so the badge stays small). */
export const overflowText = (n: number): string => (n > 99 ? '+99' : `+${Math.max(0, Math.floor(n))}`);

export interface TokenStyle {
  /** Cast sheet to draw from: the ghost variant when the roster has one. */
  sheet: string;
  /** Multiplicative tint for the token image (0xffffff = none). */
  tint: number;
  alpha: number;
  /** Disc fill / rim colours (texture). */
  face: string;
  rim: string;
}
/** Living: warm parchment disc, full colour. Ghost: pale blue spirit disc, tinted and faded. */
export function tokenStyle(preset: string, ghost: boolean, sheets: Record<string, unknown> = CAST_SHEETS): TokenStyle {
  if (!ghost) return { sheet: preset, tint: 0xffffff, alpha: 1, face: '#e8dcb8', rim: '#2a1d16' };
  const g = `${preset}/ghost`;
  return { sheet: sheets[g] ? g : preset, tint: 0xbfe0ff, alpha: 0.72, face: '#cfe3ea', rim: '#33445a' };
}

/** The tooltip / accessible text for a token. */
export const tokenLabel = (t: Pick<DoorTagView, 'name' | 'ghost'>): string => (t.ghost ? `${t.name} (ghost)` : t.name);

/** A short sentence listing everyone inside (screen readers / the board tooltip). */
export function boardSummary(view: DoorBoardView | undefined): string {
  const tags = view?.tags ?? [];
  if (!tags.length) return '';
  return `Inside: ${tags.map(tokenLabel).join(', ')}`;
}

type Box = { x: number; y: number; w: number; h: number };
/**
 * Head-and-shoulders square of a sprite whose opaque bounds are `b`: from the top of the sprite,
 * ~58% of its height on each side (not limited to its width, so tall ears / hats still leave room
 * for the face), centred horizontally.
 */
export function bustRect(b: Box): Box {
  const side = Math.max(12, Math.round(b.h * 0.58));
  return { x: Math.round(b.x + b.w / 2 - side / 2) - 1, y: b.y - 1, w: side + 2, h: side + 2 };
}

/** Is texture pixel (x, y) inside a disc of diameter d (pixel-perfect, no anti-aliasing)? */
export function inDisc(x: number, y: number, d: number): boolean {
  const r = d / 2;
  const dx = x + 0.5 - r;
  const dy = y + 0.5 - r;
  return dx * dx + dy * dy <= r * r;
}

// --- the board itself grows to hold its tokens (v2.2 fix: tokens sit ON the board's face)

/** The board art (square-props 'board', 22x28): roof + framed face rows 0..18, post rows 19..27. */
export const BOARD_ART = { w: 22, h: 28, face: { x: 4, y: 7, w: 14, h: 9 }, headH: 19, foot: { x: 11, y: 26 } } as const;

export interface BoardSize {
  /** Face (parchment) size in world px (>= the art's 14 x 9). */
  faceW: number;
  faceH: number;
  /** Whole board texture size. */
  w: number;
  h: number;
  /** Face rect inside the board texture. */
  face: { x: number; y: number; w: number; h: number };
  /** Foot of the post inside the board texture (the anchor that sits on houses[id].board). */
  foot: { x: number; y: number };
}
/**
 * The board grown to hold a token grid: the face is at least the grid + a 1 px margin (2 px on top
 * for the pins); the frame / roof keep their pixel widths around it and the post stays as drawn.
 */
export function boardSize(grid: { w: number; h: number }): BoardSize {
  const A = BOARD_ART;
  const faceW = Math.max(A.face.w, Math.ceil(grid.w) + 2);
  const faceH = Math.max(A.face.h, Math.ceil(grid.h) + 3);
  const w = A.w - A.face.w + faceW;
  const headH = A.headH - A.face.h + faceH;
  const h = headH + (A.h - A.headH);
  const postX = Math.round((w - A.w) / 2); // the post block is centred under the grown head
  return { faceW, faceH, w, h, face: { x: A.face.x, y: A.face.y, w: faceW, h: faceH }, foot: { x: postX + A.foot.x, y: headH + (A.foot.y - A.headH) } };
}

/**
 * Horizontal nudge (world px) that keeps a board of width `w` whose post foot is at `bx` (foot at
 * `footX` inside it) clear of the doorway [doorL, doorR] (+ `gap`), on whichever side it stands.
 */
export function boardNudge(bx: number, w: number, footX: number, doorL: number, doorR: number, gap = 1): number {
  const left = bx - footX;
  const right = left + w;
  const doorC = (doorL + doorR) / 2;
  if (bx >= doorC) return Math.max(0, doorR + gap - left); // board right of the door: push right
  return -Math.max(0, right - (doorL - gap)); // left of the door: push left
}

type HouseFx = { board?: { x: number; y: number }; boarded?: { wx: number; wy: number; w: number; h: number } };
/**
 * Horizontal room per board (world px, inclusive): off its own doorway (the side the board stands
 * on) and at most halfway to any neighbouring board on the same row, so grown boards never cover a
 * door or each other (houses-2/-3 face each other across a short gap).
 */
export function boardSpans(houses: Record<string, HouseFx>, rowBand = 30): Record<string, { lo: number; hi: number }> {
  const out: Record<string, { lo: number; hi: number }> = {};
  const list = Object.entries(houses).filter(([, h]) => h.board);
  for (const [id, h] of list) {
    const b = h.board!;
    let lo = -Infinity;
    let hi = Infinity;
    const d = h.boarded;
    if (d && b.y > d.wy && b.y - 60 < d.wy + d.h) {
      if (b.x >= d.wx + d.w / 2) lo = d.wx + d.w + 1;
      else hi = d.wx - 2;
    }
    for (const [oid, o] of list) {
      if (oid === id || Math.abs(o.board!.y - b.y) > rowBand) continue;
      const mid = (o.board!.x + b.x) / 2;
      if (o.board!.x > b.x) hi = Math.min(hi, Math.floor(mid) - 1);
      else lo = Math.max(lo, Math.ceil(mid) + 1);
    }
    out[id] = { lo, hi };
  }
  return out;
}

/**
 * Largest token size <= `want` (down to `min`) whose grown board fits a span `room` wide; plus that
 * board's left edge: centred on the post foot `bx`, then slid inside [lo, hi].
 */
export function fitBoard(n: number, overflow: number, want: number, bx: number, span: { lo: number; hi: number } | undefined, min = 8): { t: number; left: number; size: BoardSize } {
  const room = span ? span.hi - span.lo + 1 : Infinity;
  let t = want;
  let size = boardSize(tokenGrid(n, t, overflow));
  while (size.w > room && t > min) size = boardSize(tokenGrid(n, --t, overflow));
  let left = Math.round(bx) - size.foot.x;
  if (span) left = Math.max(span.lo, Math.min(left, span.hi - size.w + 1));
  return { t, left, size };
}

/** Source pixel (in the 22x28 art) for pixel (x, y) of a grown board of size `b`. */
export function boardSourcePx(x: number, y: number, b: BoardSize): { x: number; y: number } | null {
  const A = BOARD_ART;
  const headH = b.h - (A.h - A.headH);
  if (y >= headH) {
    // post: copied unscaled, centred
    const sx = x - (b.foot.x - A.foot.x);
    return sx >= 0 && sx < A.w ? { x: sx, y: A.headH + (y - headH) } : null;
  }
  const rightW = A.w - A.face.x - A.face.w; // 4
  const sx = x < A.face.x ? x : x >= b.w - rightW ? A.w - (b.w - x) : A.face.x + 2 + ((x - A.face.x) % 2); // studs repeat with period 2
  const fy0 = A.face.y;
  const fy1 = A.face.y + b.faceH - 1;
  const sy = y < fy0 ? y : y > fy1 ? A.face.y + A.face.h + (y - fy1 - 1) : y === fy0 ? fy0 : y === fy1 ? A.face.y + A.face.h - 1 : A.face.y + 3;
  return { x: sx, y: sy };
}

/** Index of the token under world point (px, py), or -1. */
export function hitToken(rects: readonly { x: number; y: number; r: number }[], px: number, py: number): number {
  for (let i = rects.length - 1; i >= 0; i--) {
    const c = rects[i]!;
    if ((px - c.x) ** 2 + (py - c.y) ** 2 <= c.r * c.r) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------
// Phaser renderer

interface CastJson {
  frameWidth: number;
  frameHeight: number;
  directions: readonly string[];
  sheets: Record<string, { x: number; y: number }>;
  /** (v2.4) ghost variants live in cast-ghosts.* (loaded on the first death, TownScene.wantGhosts). */
  ghosts?: { cellHeight: number; rowOffset: readonly number[]; sheets: Record<string, { x: number; y: number }> };
}
const CAST = castJson as unknown as CastJson;
// Board placement per house (square-props meta, optional like in TownScene).
const FX_HOUSES = (
  Object.values(import.meta.glob('../../../../../packages/assets/generated/square-props.json', { eager: true, import: 'default' }) as Record<string, { meta?: { houses?: Record<string, HouseFx> } }>)[0]?.meta?.houses ?? {}
) as Record<string, HouseFx>;
const SPANS = boardSpans(FX_HOUSES);
const CAST_SHEETS: Record<string, unknown> = { ...CAST.sheets, ...CAST.ghosts?.sheets };
const DOWN_ROW = Math.max(0, CAST.directions.indexOf('down'));
const FALLBACK = ['#7a4b6b', '#4b6b7a', '#6b7a4b', '#8a6a3a', '#5a5a8a', '#8a4a4a', '#4a7a6a', '#7a6a8a'];
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Opaque bounds of a cast frame on the source image (frame-local), or the whole frame. */
function frameBounds(img: CanvasImageSource, sx: number, sy: number): Box {
  const fw = CAST.frameWidth;
  const fh = CAST.frameHeight;
  try {
    const c = document.createElement('canvas');
    c.width = fw;
    c.height = fh;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('no 2d');
    g.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
    const d = g.getImageData(0, 0, fw, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++)
        if (d[(y * fw + x) * 4 + 3]! > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 >= 0) return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch {
    /* no canvas / tainted: whole frame */
  }
  return { x: 0, y: 0, w: fw, h: fh };
}

/** Paint a pixel disc (rim + face + a 1px lower shade) of diameter d. */
function paintDisc(g: CanvasRenderingContext2D, d: number, face: string, rim: string) {
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      if (!inDisc(x, y, d)) continue;
      const inner = inDisc(x - 1, y - 1, d - 2) && x >= 1 && y >= 1 && x < d - 1 && y < d - 1;
      g.fillStyle = inner ? face : rim;
      g.fillRect(x, y, 1, 1);
    }
}

/** The token texture key for (preset, ghost), building it on first use. */
function tokenTexture(scene: Phaser.Scene, preset: string | null, ghost: boolean, pid: string): string {
  const id = preset && CAST.sheets[preset] ? preset : null;
  // (v2.4) until the ghost atlas is in, a ghost token shows the living bust (own key: rebuilt after)
  const ghostArt = !!id && !!CAST.ghosts?.sheets[tokenStyle(id, true).sheet];
  const pending = ghost && ghostArt && !scene.textures.exists('cast-ghosts');
  const key = `board-token/${id ?? `anon-${hash(pid) % FALLBACK.length}`}${ghost ? (pending ? '/ghost-pending' : '/ghost') : ''}`;
  if (scene.textures.exists(key)) return key;
  const D = TOKEN_TEX;
  const c = document.createElement('canvas');
  c.width = D;
  c.height = D + 2; // + 2 px for the pin head above the disc
  const g = c.getContext('2d');
  if (!g) return key;
  g.imageSmoothingEnabled = false;
  const st = tokenStyle(id ?? '', ghost);
  g.save();
  g.translate(0, 2);
  paintDisc(g, D, st.face, st.rim);
  // the bust, clipped to the inner disc
  const inner = D - 4;
  const bust = document.createElement('canvas');
  bust.width = inner;
  bust.height = inner;
  const bg = bust.getContext('2d');
  const fromGhosts = ghost && ghostArt && !pending;
  const sheetTex = fromGhosts ? 'cast-ghosts' : 'cast';
  const src = scene.textures.exists(sheetTex) ? (scene.textures.get(sheetTex).getSourceImage() as CanvasImageSource) : null;
  const pos = !id ? undefined : fromGhosts ? CAST.ghosts!.sheets[st.sheet] : CAST.sheets[id];
  if (bg && src && pos) {
    bg.imageSmoothingEnabled = false;
    const sx = pos.x;
    const sy = fromGhosts ? pos.y + DOWN_ROW * CAST.ghosts!.cellHeight + CAST.ghosts!.rowOffset[0]! : pos.y + DOWN_ROW * CAST.frameHeight;
    const r = bustRect(frameBounds(src, sx, sy));
    // native pixels when the bust fits; otherwise the largest exact fit (still nearest-neighbour)
    const k = r.w <= inner ? 1 : inner / r.w;
    const dw = Math.round(r.w * k);
    const ox = Math.floor((inner - dw) / 2);
    const oy = Math.max(0, Math.floor((inner - dw) / 2) + 1);
    // clip the source rect to the frame cell
    const cx0 = Math.max(0, r.x), cy0 = Math.max(0, r.y);
    const cx1 = Math.min(CAST.frameWidth, r.x + r.w), cy1 = Math.min(CAST.frameHeight, r.y + r.h);
    if (cx1 > cx0 && cy1 > cy0)
      bg.drawImage(src, sx + cx0, sy + cy0, cx1 - cx0, cy1 - cy0, ox + (cx0 - r.x) * k, oy + (cy0 - r.y) * k, (cx1 - cx0) * k, (cy1 - cy0) * k);
  } else if (bg) {
    // no art for this player (legacy cosmetics): a little silhouette in a stable colour
    bg.fillStyle = ghost ? '#b9dbe6' : FALLBACK[hash(pid) % FALLBACK.length]!;
    const m = inner / 2;
    bg.fillRect(m - 3, 3, 6, 6);
    bg.fillRect(m - 5, 10, 10, inner - 10);
  }
  if (bg) {
    // pixel-perfect circular clip
    // (one mask image: every separate destination-in draw would clear the rest of the canvas)
    const mask = document.createElement('canvas');
    mask.width = inner;
    mask.height = inner;
    const mg = mask.getContext('2d');
    if (mg) {
      mg.fillStyle = '#000';
      for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) if (inDisc(x, y, inner)) mg.fillRect(x, y, 1, 1);
      bg.globalCompositeOperation = 'destination-in';
      bg.drawImage(mask, 0, 0);
    }
    g.drawImage(bust, 2, 2);
  }
  g.restore();
  // brass pin at the top
  g.fillStyle = '#3a2410';
  g.fillRect(D / 2 - 2, 0, 4, 3);
  g.fillStyle = ghost ? '#cfe3ea' : '#d9a441';
  g.fillRect(D / 2 - 1, 0, 2, 2);
  scene.textures.addCanvas(key, c);
  return key;
}

/** Texture key of the board grown to `b` (built from the 'fx' board frame); null without the art. */
function boardTexture(scene: Phaser.Scene, b: BoardSize): string | null {
  const key = `board-sized/${b.faceW}x${b.faceH}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists('fx') || !scene.textures.get('fx').has('board')) return null;
  const fr = scene.textures.getFrame('fx', 'board');
  const img = fr.source.image as CanvasImageSource;
  try {
    const src = document.createElement('canvas');
    src.width = BOARD_ART.w;
    src.height = BOARD_ART.h;
    const sg = src.getContext('2d', { willReadFrequently: true });
    const c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    const g = c.getContext('2d');
    if (!sg || !g) return null;
    sg.drawImage(img, fr.cutX, fr.cutY, BOARD_ART.w, BOARD_ART.h, 0, 0, BOARD_ART.w, BOARD_ART.h);
    const sd = sg.getImageData(0, 0, BOARD_ART.w, BOARD_ART.h).data;
    const out = g.createImageData(b.w, b.h);
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const p = boardSourcePx(x, y, b);
        if (!p) continue;
        const si = (p.y * BOARD_ART.w + p.x) * 4;
        const di = (y * b.w + x) * 4;
        out.data[di] = sd[si]!;
        out.data[di + 1] = sd[si + 1]!;
        out.data[di + 2] = sd[si + 2]!;
        out.data[di + 3] = sd[si + 3]!;
      }
    g.putImageData(out, 0, 0);
    scene.textures.addCanvas(key, c);
    return key;
  } catch {
    return null;
  }
}

export interface BoardTokenEnv {
  /** CSS px per world px. */
  cssZoom(): number;
  /** Phaser text resolution. */
  textRes(): number;
  /** The low render tier (fewer extras). */
  lowTier(): boolean;
  /** (v3 WP5b) The town's per-house overlay anchors (square-props meta.houses of the lobby's world); default v2. */
  houses?: Record<string, HouseFx>;
}

interface Hit {
  x: number;
  y: number;
  r: number;
  text: string;
  obj: Phaser.GameObjects.Image;
}

export interface BoardTokenLayer {
  /**
   * Draw one OCCUPIED board — the board art grown to hold its tokens, nudged clear of the doorway
   * [door.l, door.r] — and its tokens inside the face; post foot at (bx, by) (the art's anchor). Returns
   * the created objects (the caller owns visibility + destruction, like the rest of the board).
   */
  build(buildingId: string, bx: number, by: number, depth: number, view: DoorBoardView, door?: { l: number; r: number; t: number; b: number }): Phaser.GameObjects.GameObject[];
  /** World rect of a board built by `build` (null when that board has no tokens). */
  rectOf(buildingId: string): { x: number; y: number; w: number; h: number } | null;
  /** Forget a board's hover targets (call before destroying its objects). */
  forget(buildingId: string): void;
  /** Test/debug only: what a board shows (token labels in order, the "+N" badge, world rect, drawn). */
  inspect(buildingId: string): { tokens: string[]; badge: string | null; rect: { x: number; y: number; w: number; h: number }; visible: boolean } | null;
  destroy(): void;
}

export function createBoardTokenLayer(scene: Phaser.Scene, env: BoardTokenEnv): BoardTokenLayer {
  const spans = env.houses ? boardSpans(env.houses) : SPANS; // (v3 WP5b) the board slots of this world
  const hits = new Map<string, Hit[]>();
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  /** "+N" badge per board and how many token hits precede it (for `inspect`). */
  const badges = new Map<string, { text: string; n: number }>();
  let tip: Phaser.GameObjects.Text | null = null;
  let tipFor: Hit | null = null;
  let tipTimer: Phaser.Time.TimerEvent | null = null;

  function hideTip() {
    tipFor = null;
    tip?.setVisible(false);
    tipTimer?.remove();
    tipTimer = null;
  }
  function showTip(h: Hit, autoHideMs?: number) {
    if (tipFor !== h) {
      tipFor = h;
      const fs = Math.max(4, 12 / Math.max(0.2, env.cssZoom()));
      if (!tip)
        tip = scene.add
          .text(0, 0, '', { fontFamily: LABEL_FONT, fontStyle: '700', color: '#efe6cf', backgroundColor: '#140d1ccc', padding: { left: 3, right: 3, top: 1, bottom: 1 } })
          .setOrigin(0.5, 1)
          .setDepth(5160);
      tip.setStyle({ fontSize: `${fs}px`, resolution: env.textRes() });
      tip.setPadding(fs * 0.35, fs * 0.12, fs * 0.35, fs * 0.15);
      tip.setText(h.text).setPosition(Math.round(h.x), Math.round(h.y - h.r - 1)).setVisible(true);
    }
    tipTimer?.remove();
    tipTimer = autoHideMs ? scene.time.delayedCall(autoHideMs, hideTip) : null;
  }
  function find(p: Phaser.Input.Pointer): Hit | null {
    const cam = scene.cameras.main;
    const w = cam.getWorldPoint(p.x, p.y);
    for (const list of hits.values()) {
      const live = list.filter((h) => h.obj.active && h.obj.visible);
      const i = hitToken(live, w.x, w.y);
      if (i >= 0) return live[i]!;
    }
    return null;
  }
  // Hover (mouse) and tap (touch) without making the tokens interactive, so the town's own
  // tap-to-walk / radial handlers are untouched.
  const onMove = (p: Phaser.Input.Pointer) => {
    if (p.wasTouch) return;
    const h = find(p);
    if (h) showTip(h);
    else if (tipFor && !tipTimer) hideTip();
  };
  const onDown = (p: Phaser.Input.Pointer) => {
    const h = find(p);
    if (h) showTip(h, 2500);
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerdown', onDown);

  return {
    build(buildingId, bx, by, depth, view, door) {
      const objs: Phaser.GameObjects.GameObject[] = [];
      const list: Hit[] = [];
      hits.set(buildingId, list);
      badges.delete(buildingId);
      const shown = view.shown;
      if (!shown.length) return objs;
      // the board, grown so its parchment face holds the grid, foot on the art's anchor — within
      // its room between the doorway and the neighbouring board (smaller tokens when crowded)
      const span = spans[buildingId];
      const fit = fitBoard(shown.length, view.overflow, tokenWorldSize(env.cssZoom()), bx, span);
      const t = fit.t;
      const size = fit.size;
      const grid = tokenGrid(shown.length, t, view.overflow);
      const top = Math.round(by) - size.foot.y;
      // no layout data for this house: only a board level with the doorway can cover it
      const nudge = !span && door && top < door.b && by > door.t ? boardNudge(bx, size.w, size.foot.x, door.l, door.r) : 0;
      const left = fit.left + Math.round(nudge);
      rects.set(buildingId, { x: left, y: top, w: size.w, h: size.h });
      const bkey = boardTexture(scene, size);
      if (bkey) objs.push(scene.add.image(left, top, bkey).setOrigin(0, 0).setDepth(depth));
      else {
        const g = scene.add.graphics().setDepth(depth);
        g.fillStyle(0x2a1d16, 1).fillRect(left + size.face.x - 2, top + size.face.y - 2, size.faceW + 4, size.faceH + 4);
        g.fillStyle(0xe8dcb8, 1).fillRect(left + size.face.x, top + size.face.y, size.faceW, size.faceH);
        g.fillStyle(0x2a1d16, 1).fillRect(left + size.foot.x - 1, top + size.face.y + size.faceH + 2, 3, size.foot.y - size.face.y - size.faceH - 2);
        objs.push(g);
      }
      // grid centred in the face (1 px lower: the pins poke up into the top margin)
      const fx0 = left + size.face.x;
      const fy0 = top + size.face.y;
      const cx = fx0 + size.faceW / 2;
      const cy = fy0 + (size.faceH + 1) / 2;
      const k = t / TOKEN_TEX; // world px per texture px
      for (const s of grid.slots) {
        const tag = shown[s.i]!;
        const key = tokenTexture(scene, tag.preset, tag.ghost, tag.pid);
        const st = tokenStyle(tag.preset ?? '', tag.ghost);
        const x = cx + s.dx;
        const y = cy + s.dy;
        // origin at the disc centre (the texture has 2 px of pin above the disc)
        const img = scene.add
          .image(x, y, key)
          .setOrigin(0.5, (TOKEN_TEX / 2 + 2) / (TOKEN_TEX + 2))
          .setScale(k)
          .setDepth(depth + 0.01 + s.i * 0.001)
          .setAlpha(st.alpha);
        if (st.tint !== 0xffffff) img.setTint(st.tint);
        objs.push(img);
        list.push({ x, y, r: t / 2 + 0.5, text: tokenLabel(tag), obj: img });
      }
      if (grid.badge) {
        const fs = Math.max(5, Math.round(t * 0.55));
        // tucked into the face's bottom-right corner (inside the board)
        const bxp = fx0 + size.faceW;
        const byp = fy0 + size.faceH;
        const label = scene.add
          .text(bxp, byp, grid.badge.text, {
            fontFamily: LABEL_FONT,
            fontSize: `${fs}px`,
            fontStyle: '700',
            color: '#efe2c0',
            backgroundColor: '#2a1d16',
            padding: { left: Math.max(1, fs * 0.25), right: Math.max(1, fs * 0.25), top: 0, bottom: 0 },
            resolution: env.textRes(),
          })
          .setOrigin(1, 1)
          .setDepth(depth + 0.02);
        objs.push(label);
        badges.set(buildingId, { text: grid.badge.text, n: list.length });
        const rest = view.tags.slice(view.shown.length).map(tokenLabel);
        list.push({ x: bxp - label.width / 2, y: byp - label.height / 2, r: fs * 0.8, text: rest.join(', '), obj: label as unknown as Phaser.GameObjects.Image });
      }
      return objs;
    },
    rectOf: (buildingId) => rects.get(buildingId) ?? null,
    inspect(buildingId) {
      const list = hits.get(buildingId);
      const rect = rects.get(buildingId);
      if (!list || !rect) return null;
      const badge = badges.get(buildingId) ?? null;
      const tokens = (badge ? list.slice(0, badge.n) : list).filter((h) => h.obj.active);
      return { tokens: tokens.map((h) => h.text), badge: badge?.text ?? null, rect: { ...rect }, visible: tokens.some((h) => h.obj.visible) };
    },
    forget(buildingId) {
      rects.delete(buildingId);
      badges.delete(buildingId);
      if (tipFor && hits.get(buildingId)?.includes(tipFor)) hideTip();
      hits.delete(buildingId);
    },
    destroy() {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerdown', onDown);
      tipTimer?.remove();
      tip?.destroy();
      tip = null;
      hits.clear();
    },
  };
}
