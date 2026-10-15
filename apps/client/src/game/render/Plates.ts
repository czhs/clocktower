// Cottage name plates: a small board above each assigned cottage's door with the owner's display
// name (seat N lives in house-N; seats are public). Your own home is marked in gold.
import type * as Phaser from 'phaser';
import { townLayout } from '@ct/assets';
import type { LobbyRoomView } from '@ct/protocol';

const L = townLayout;
const TS = L.tileSize;

export class Plates {
  private plates = new Map<string, { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; label: string }>();

  constructor(
    private scene: Phaser.Scene,
    private textRes: () => number,
  ) {}

  refresh(lobby: LobbyRoomView | null, myPid: string | null) {
    const owners = new Map<string, { name: string; mine: boolean }>();
    for (const m of lobby?.members ?? []) {
      if (m.role === 'storyteller' || m.seat === null || m.seat === undefined) continue;
      owners.set(`house-${m.seat}`, { name: m.displayName, mine: m.pid === myPid });
    }
    for (const b of L.buildings) {
      if (b.kind !== 'house') continue;
      const o = owners.get(b.id);
      const cur = this.plates.get(b.id);
      const label = o ? `${o.mine ? 'mine:' : ''}${o.name}` : '';
      if (cur && cur.label === label) continue;
      cur?.bg.destroy();
      cur?.text.destroy();
      this.plates.delete(b.id);
      if (!o) continue;
      const name = o.name.length > 14 ? o.name.slice(0, 13) + '…' : o.name;
      const bottom = (b.footprint.y + b.footprint.h) * TS;
      const cx = b.door.x * TS + 8;
      const cy = bottom - 26; // just above the 20 px cottage door
      const depth = 10 + bottom + 0.5;
      const text = this.scene.add
        .text(cx, cy, name, { fontFamily: 'Georgia, serif', fontSize: '6px', color: o.mine ? '#f0cf72' : '#e9dfc6', resolution: this.textRes() })
        .setOrigin(0.5, 0.5)
        .setDepth(depth + 0.1);
      const w = Math.ceil(text.width) + 6;
      const h = 8;
      const bg = this.scene.add.graphics().setDepth(depth);
      bg.fillStyle(0x140d0a, 0.92).fillRect(Math.round(cx - w / 2) - 1, Math.round(cy - h / 2) - 1, w + 2, h + 2);
      bg.fillStyle(o.mine ? 0x5a4020 : 0x3d2a1c, 1).fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
      bg.fillStyle(0x6b4c30, 1).fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), w, 1);
      this.plates.set(b.id, { bg, text, label });
    }
  }

  setResolution(res: number) {
    for (const p of this.plates.values()) p.text.setResolution(res);
  }
}
