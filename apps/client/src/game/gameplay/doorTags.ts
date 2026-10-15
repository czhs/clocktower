// Door tags (gameplay): who is inside each building, hung on its door (daytime only).
//
// DATA HOOK FOR THE ART: `doorTagsStore` (below) = buildingId -> { pid, name, ghost, preset }[]
// in display order, plus `shown`/`overflow` per door (MAX_ICONS, then "+N"). It mirrors
// WorldSnapshot.doorTags, which the server sends identically to every viewer and never from
// bedtime through dawn, never for the Storyteller (apps/server/src/world/index.ts doorTags()),
// enriched with public lobby data (name, preset). Door positions: layout buildings[].door.
//
// `createDoorTags` is only a minimal PLACEHOLDER renderer of that store; the art session replaces it.
//
// Up to MAX_ICONS portraits per door, then "+N". Portrait = the player's preset portrait
// (generated/presets/<id>-portrait.png); fallback = their initial in a coloured circle. Ghosts
// (publicly dead) are drawn pale.
import type * as Phaser from 'phaser';
import { townLayout } from '@ct/assets';
import { tileCenterPx, type DoorTag, type LobbyRoomView } from '@ct/protocol';
import { createStore } from '../../net/store';
import { UPRIGHT_Y } from '../render/projection';

/** Icons per door before "+N". */
export const MAX_ICONS = 4;

export interface DoorTagView {
  pid: string;
  name: string;
  /** Publicly dead: draw the ghost variant. */
  ghost: boolean;
  /** Character preset id (portrait art), or null for layered cosmetics. */
  preset: string | null;
}
export interface DoorBoardView {
  /** Everyone inside, in display order. */
  tags: DoorTagView[];
  /** The first MAX_ICONS of them. */
  shown: DoorTagView[];
  /** How many more ("+N"); 0 when everyone fits. */
  overflow: number;
}
/** buildingId -> board. Empty object at night, when nobody is inside, or with door tags off. */
export const doorTagsStore = createStore<Record<string, DoorBoardView>>({});

/** Enrich the snapshot's tags with public lobby data (called by the gameplay layer on every snapshot). */
export function publishDoorTags(tags: Record<string, DoorTag[]> | undefined, lobby: LobbyRoomView | null): void {
  const out: Record<string, DoorBoardView> = {};
  for (const [id, list] of Object.entries(tags ?? {})) {
    const views = list.map((t) => {
      const m = lobby?.members.find((x) => x.pid === t.pid);
      return { pid: t.pid, name: m?.displayName ?? '?', ghost: t.ghost, preset: m?.cosmetics.preset ?? null };
    });
    out[id] = { tags: views, shown: views.slice(0, MAX_ICONS), overflow: Math.max(0, views.length - MAX_ICONS) };
  }
  const prev = doorTagsStore.get();
  if (JSON.stringify(prev) !== JSON.stringify(out)) doorTagsStore.set(out);
}

const ICON = 9; // world px (the camera zoom scales it)
const GAP = 1;
const PAD = 2;
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const BOARD = 0x3d2a1c;
const BOARD_EDGE = 0x6b4c30;
const SOOT = 0x191c29;
const SPIRIT = 0xcce1de;
const FALLBACK_COLOURS = [0x7a4b6b, 0x4b6b7a, 0x6b7a4b, 0x8a6a3a, 0x5a5a8a, 0x8a4a4a, 0x4a7a6a, 0x7a6a8a];

// Same source as the lobby's character picker (CosmeticEditor): <id>-portrait.png per preset.
const PORTRAITS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../../../packages/assets/generated/presets/*-portrait.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ).map(([path, url]) => [path.split('/').pop()!.replace(/-portrait\.png$/, ''), url]),
);

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Board {
  key: string;
  objs: Phaser.GameObjects.GameObject[];
}

export interface DoorTagLayer {
  /** New boards (from doorTagsStore). */
  set(boards: Record<string, DoorBoardView>): void;
  /** Show only while the viewer is outdoors (doors are outdoor objects). */
  setVisible(v: boolean): void;
  destroy(): void;
}

/** Minimal placeholder renderer (a small board beside each door). The art session replaces it. */
export function createDoorTags(scene: Phaser.Scene): DoorTagLayer {
  const boards = new Map<string, Board>();
  const loading = new Set<string>();
  let visible = true;
  let latest: Record<string, DoorBoardView> = {};
  const textRes = () => Math.max(1, Math.round(scene.cameras.main.zoom * (window.devicePixelRatio || 1)));
  const portraitKey = (preset: string) => `doortag-portrait/${preset}`;

  /** Portrait texture key when loaded (starts loading it otherwise); null = use the fallback. */
  function portrait(preset: string | null): string | null {
    if (!preset || !PORTRAITS[preset]) return null;
    const key = portraitKey(preset);
    if (scene.textures.exists(key)) return key;
    if (!loading.has(key)) {
      loading.add(key);
      scene.load.image(key, PORTRAITS[preset]!);
      scene.load.once(`filecomplete-image-${key}`, () => {
        loading.delete(key);
        rebuildAll(); // swap the fallback for the portrait
      });
      if (!scene.load.isLoading()) scene.load.start();
    }
    return null;
  }

  function clear(b: Board) {
    for (const o of b.objs) o.destroy();
    b.objs = [];
  }

  function build(buildingId: string, view: DoorBoardView): Board {
    const b = townLayout.buildings.find((x) => x.id === buildingId);
    const board: Board = { key: '', objs: [] };
    if (!b || !view.shown.length) return board;
    const door = tileCenterPx(townLayout, b.door);
    const shown = view.shown;
    const w = PAD * 2 + shown.length * ICON + (shown.length - 1) * GAP + (view.overflow > 0 ? 10 : 0);
    const h = ICON + PAD * 2;
    // Hung beside the doorframe, at head height above the doorstep.
    const x0 = Math.round(door.x + 9);
    const y0 = Math.round(door.y - 30);
    const depth = 10 + door.y - 0.4;
    const g = scene.add.graphics().setDepth(depth);
    g.fillStyle(SOOT, 0.85).fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    g.fillStyle(BOARD, 1).fillRect(x0, y0, w, h);
    g.fillStyle(BOARD_EDGE, 1).fillRect(x0, y0, w, 1);
    board.objs.push(g);
    shown.forEach((t, i) => {
      const cx = x0 + PAD + i * (ICON + GAP) + ICON / 2;
      const cy = y0 + PAD + ICON / 2;
      const key = portrait(t.preset);
      if (key) {
        const img = scene.add.image(cx, cy, key).setDisplaySize(ICON, ICON).setDepth(depth + 0.01);
        if (t.ghost) img.setTint(SPIRIT).setAlpha(0.6);
        board.objs.push(img);
      } else {
        const col = t.ghost ? SPIRIT : FALLBACK_COLOURS[hash(t.pid) % FALLBACK_COLOURS.length]!;
        g.fillStyle(col, t.ghost ? 0.55 : 1).fillCircle(cx, cy, ICON / 2);
        const initial = t.name.trim().charAt(0).toUpperCase() || '?';
        board.objs.push(
          scene.add
            .text(cx, cy, initial, { fontFamily: LABEL_FONT, fontSize: '7px', fontStyle: '700', color: t.ghost ? '#211f2c' : '#e4d8ba', resolution: textRes() })
            .setOrigin(0.5, 0.55)
            .setDepth(depth + 0.02),
        );
      }
    });
    if (view.overflow > 0)
      board.objs.push(
        scene.add
          .text(x0 + w - PAD - 5, y0 + h / 2, `+${view.overflow}`, { fontFamily: LABEL_FONT, fontSize: '6px', fontStyle: '700', color: '#e4d8ba', resolution: textRes() })
          .setOrigin(0.5, 0.55)
          .setDepth(depth + 0.02),
      );
    // Portraits, lettering and the wooden plaque are upright objects, not ground decals.
    // Compensate around the doorstep so the fixed shallow camera does not squash faces.
    for (const o of board.objs) {
      const upright = o as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible;
      upright.y = door.y + (upright.y - door.y) * UPRIGHT_Y;
      upright.scaleY *= UPRIGHT_Y;
      upright.setVisible(visible);
    }
    return board;
  }

  function rebuildAll() {
    for (const b of boards.values()) clear(b);
    boards.clear();
    apply(latest);
  }

  function apply(next: Record<string, DoorBoardView>) {
    latest = next;
    for (const [id, b] of boards)
      if (!next[id]) {
        clear(b);
        boards.delete(id);
      }
    for (const [id, view] of Object.entries(next)) {
      const key = JSON.stringify(view);
      const cur = boards.get(id);
      if (cur && cur.key === key) continue;
      if (cur) clear(cur);
      const built = build(id, view);
      built.key = key;
      boards.set(id, built);
    }
  }

  return {
    set: apply,
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      for (const b of boards.values()) for (const o of b.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
    },
    destroy() {
      for (const b of boards.values()) clear(b);
      boards.clear();
    },
  };
}
