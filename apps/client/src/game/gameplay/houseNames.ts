// House name callouts (world-art, v2.2): every lived-in house shows its OWNER's display name as a
// small floating label with a little tail pointing down at the house's door ("Ada" -> Ada's
// house), so people find each other's homes at a glance. Not a sign on the building: a plain
// readable label (the avatar-name text style, a touch smaller and dimmer) over a faint dark
// backdrop, above the doorway — clear of the door board (beside the door) and the roof / chimney.
//
// Owners come from PUBLIC data only: the game view's public player list (seat -> house via
// homeBuilding) or, without a game view, lobby members that have a seat (seats are fixed and
// public once the game starts). The waiting room has no seats yet, so no labels then. Nothing
// hidden (roles, alignment, night whereabouts) is involved; homes are public, so labels stay at
// night too (above the lighting layer, slightly dimmer).
import type * as Phaser from 'phaser';
import { homeBuilding, type TownLayout } from '@ct/protocol';

// ---------------------------------------------------------------------------------------
// pure parts (unit-tested)

export interface HouseOwner {
  pid: string;
  name: string;
  /** Publicly dead (the public alive flag): the label is drawn in the pale ghost colour. */
  ghost: boolean;
}

/** Only the public fields this needs (PublicPlayerView / MemberView subsets). */
export interface PublicSeatPlayer {
  pid: string;
  seat: number;
  name: string;
  alive?: boolean;
}
export interface PublicMember {
  pid: string;
  displayName: string;
  role: string;
  seat: number | null;
}

/**
 * buildingId -> owner. From the game view's public players when there is one, else from lobby
 * members with a seat (role 'player'); the Storyteller never owns a house.
 */
export function houseOwners(layout: TownLayout, players: readonly PublicSeatPlayer[] | null | undefined, members: readonly PublicMember[] | null | undefined): Record<string, HouseOwner> {
  const out: Record<string, HouseOwner> = {};
  const src: { pid: string; seat: number; name: string; ghost: boolean }[] = players
    ? players.map((p) => ({ pid: p.pid, seat: p.seat, name: p.name, ghost: p.alive === false }))
    : (members ?? []).filter((m) => m.role === 'player' && m.seat !== null).map((m) => ({ pid: m.pid, seat: m.seat!, name: m.displayName, ghost: false }));
  for (const p of src) {
    const b = homeBuilding(layout, p.seat);
    if (b && !out[b.id]) out[b.id] = { pid: p.pid, name: p.name, ghost: p.ghost };
  }
  return out;
}

/** The longest prefix of `name` (+ "…") whose measured width fits `maxW`; the whole name if it fits. */
export function fitName(name: string, maxW: number, measure: (s: string) => number, maxChars = 18): string {
  const clean = name.replace(/\s+/g, ' ').trim() || '?';
  const chars = Array.from(clean);
  let s = chars.length > maxChars ? chars.slice(0, maxChars - 1).join('').trimEnd() + '…' : clean;
  if (measure(s) <= maxW) return s;
  let n = Math.min(chars.length, maxChars - 1);
  while (n > 1) {
    n--;
    s = chars.slice(0, n).join('').trimEnd() + '…';
    if (measure(s) <= maxW) return s;
  }
  return chars[0]! + '…';
}

export interface LabelAnchor {
  id: string;
  /** Tail tip (world px): just above the doorway. */
  x: number;
  y: number;
  /** House width (world px): a label never gets much wider than its house. */
  houseW: number;
}

/**
 * Max label width per anchor: about the house width, and never reaching more than halfway to a
 * neighbouring label on a similar row (so neighbours' labels cannot overlap).
 */
export function maxLabelWidths(anchors: readonly LabelAnchor[], rowBand = 24, gap = 4): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of anchors) {
    let w = Math.max(24, a.houseW + 8);
    for (const b of anchors) {
      if (b === a || Math.abs(b.y - a.y) > rowBand) continue;
      const half = Math.abs(b.x - a.x) - gap;
      w = Math.min(w, Math.max(16, half));
    }
    out[a.id] = Math.floor(w);
  }
  return out;
}

export interface LabelStyle {
  color: string;
  alpha: number;
}
/** Text colour / alpha: your own home gold, a dead owner's pale blue, others parchment; dimmer at night. */
export function labelStyle(mine: boolean, ghost: boolean, night: boolean): LabelStyle {
  const color = mine ? '#f2cf7a' : ghost ? '#b9d3dc' : '#e4d8ba';
  return { color, alpha: night ? 0.8 : 0.9 };
}

/**
 * Label font size in CSS px for a camera zoom (CSS px per world px): 20 % above the avatar-name
 * size (12.6) at full-town desktop zooms (>= 1.8), easing down to the avatar-name size (10.5) at
 * phone zooms (<= 1) so labels don't crowd a phone screen.
 */
export function labelFontCss(cssZoom: number): number {
  const k = Math.max(0, Math.min(1, (cssZoom - 1) / 0.8));
  return Math.round((10.5 + 2.1 * k) * 10) / 10;
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/**
 * Move a label box off `avoid` (the house's door board): sideways (away from the board) when that
 * keeps the tail under the label (|dx| <= maxDx), else straight up above the board.
 */
export function labelShift(box: Rect, avoid: Rect | null | undefined, maxDx: number): { dx: number; dy: number } {
  if (!avoid || !overlaps(box, avoid)) return { dx: 0, dy: 0 };
  const boardRight = avoid.x + avoid.w / 2 > box.x + box.w / 2;
  const dx = boardRight ? avoid.x - (box.x + box.w) - 1 : avoid.x + avoid.w - box.x + 1;
  if (Math.abs(dx) <= Math.max(0, maxDx)) return { dx, dy: 0 };
  return { dx: 0, dy: avoid.y - (box.y + box.h) - 1 };
}

// ---------------------------------------------------------------------------------------
// Phaser renderer

const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

export interface HouseLabelInput extends LabelAnchor {
  owner: HouseOwner;
  mine: boolean;
  /** The house's (grown) door board, if any: the label never covers it. */
  avoid?: Rect | null;
}

export interface HouseNameEnv {
  /** CSS px per world px. */
  cssZoom(): number;
  textRes(): number;
  lowTier(): boolean;
  night(): boolean;
}

export interface HouseNameLayer {
  /** Redraw labels whose content / zoom / phase changed (cheap no-op otherwise). */
  update(inputs: readonly HouseLabelInput[]): void;
  setVisible(v: boolean): void;
  destroy(): void;
}

interface Built {
  key: string;
  objs: (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];
}

export function createHouseNameLayer(scene: Phaser.Scene, env: HouseNameEnv): HouseNameLayer {
  const built = new Map<string, Built>();
  let visible = true;

  const clear = (b: Built) => {
    for (const o of b.objs) o.destroy();
    b.objs = [];
  };

  function build(inp: HouseLabelInput, maxW: number): Built['objs'] {
    const z = Math.max(0.2, env.cssZoom());
    const fs = Math.max(4, labelFontCss(z) / z);
    const st = labelStyle(inp.mine, inp.owner.ghost, env.night());
    const low = env.lowTier();
    const text = scene.add.text(0, 0, '', {
      fontFamily: LABEL_FONT,
      fontSize: `${fs}px`,
      fontStyle: '700',
      color: st.color,
      stroke: '#0b0812',
      strokeThickness: Math.max(1, fs / 4),
      resolution: env.textRes(),
    });
    text.setText(fitName(inp.owner.name, maxW, (s) => (text.setText(s), text.width)));
    const tail = Math.max(2, Math.round(4 / z));
    const padX = fs * 0.3;
    const w = text.width + padX * 2;
    const h = text.height;
    const { dx, dy } = labelShift({ x: inp.x - w / 2, y: inp.y - tail - h, w, h: h + tail }, inp.avoid, w / 2 - tail - 1);
    const cx = inp.x + dx;
    const bottom = inp.y - tail + dy;
    text.setOrigin(0.5, 1).setPosition(Math.round(cx), Math.round(bottom)).setAlpha(st.alpha).setDepth(5150);
    const objs: Built['objs'] = [];
    // faint backdrop + a tail pointing at the doorway (the tail alone on the low tier)
    const g = scene.add.graphics().setDepth(5149);
    g.fillStyle(0x0b0812, low ? 0.5 : 0.42);
    if (!low) g.fillRoundedRect(Math.round(cx - w / 2), Math.round(bottom - h), Math.round(w), Math.round(h), Math.min(h / 2, fs * 0.45));
    g.fillTriangle(inp.x - tail, bottom, inp.x + tail, bottom, inp.x, inp.y); // tip stays on the doorway
    g.setAlpha(st.alpha);
    objs.push(g, text);
    for (const o of objs) o.setVisible(visible);
    return objs;
  }

  return {
    update(inputs) {
      const widths = maxLabelWidths(inputs);
      const seen = new Set<string>();
      const zoomKey = Math.round(env.cssZoom() * 20);
      for (const inp of inputs) {
        seen.add(inp.id);
        const key = JSON.stringify([inp.owner.name, inp.owner.ghost, inp.mine, inp.x, inp.y, inp.avoid ?? null, widths[inp.id], zoomKey, env.textRes(), env.lowTier(), env.night()]);
        const cur = built.get(inp.id);
        if (cur && cur.key === key) continue;
        if (cur) clear(cur);
        built.set(inp.id, { key, objs: build(inp, widths[inp.id] ?? 60) });
      }
      for (const [id, b] of built)
        if (!seen.has(id)) {
          clear(b);
          built.delete(id);
        }
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      for (const b of built.values()) for (const o of b.objs) o.setVisible(v);
    },
    destroy() {
      for (const b of built.values()) clear(b);
      built.clear();
    },
  };
}
