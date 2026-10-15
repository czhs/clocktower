import raw from '@ct/assets/generated/ambient.json';
import { townLayout } from '@ct/assets';
import { UPRIGHT_Y } from './projection';

const raised = <T extends { x: number; y: number }>(p: T, id: string): T => {
  const b = townLayout.buildings.find(b => b.id === id);
  if (!b) return p;
  const ground = (b.footprint.y + b.footprint.h) * townLayout.tileSize;
  return { ...p, y: ground - (ground - p.y) * UPRIGHT_Y };
};
// Match the upright building sprites while preserving original atlas-space bell rectangles.
export const anchors = { ...raw, clock: raw.clock ? raised(raw.clock, 'clocktower') : null, smoke: raw.smoke.map(p => raised(p, p.building)) };
