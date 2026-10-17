// Markers <-> mock-HUD glue (owner: markers group): where the markers attach to the cast of scenes/ui-hud.js
// buildHudStage (hud.cast / hud.st), and the dropper icons. Used by src/ui/markers/hud.js and scenes/ui-markers.js.
import { markerFrames } from './art.js';
import { initialIcon, loadCastIcons } from './draw.js';
import { createPinPass } from './pinPass.js';
import { textWidth } from '../kit.js';

/**
 * Build the markers context once per hud (async: tries the portraits group's icon atlas, falls back to initials).
 * Also creates the depth-tested pin pass (pinPass.js, one per page: cached on the hud).
 */
export async function markersContext(hud) {
  if (hud._markersM) return hud._markersM;
  const icons = await loadCastIcons();
  const fallback = new Map();
  const M = {
    hud,
    iconsFrom: icons ? 'out/ui/portraits.json' : 'initials (portraits atlas not baked yet)',
    frames: (L) => markerFrames(L.tok),
    /** {icon, iconKey} of a dropper (cast member or id). */
    icon(m, T) {
      const id = typeof m === 'string' ? m : m.id;
      if (icons?.has(id)) return { icon: icons.get(id), iconKey: `p:${id}` };
      const name = typeof m === 'string' ? (hud.byId(id)?.name ?? id) : m.name;
      const k = `${name[0]}|${T.textInk}`;
      if (!fallback.has(k)) fallback.set(k, initialIcon(name[0], T));
      return { icon: fallback.get(k), iconKey: `i:${k}` };
    },
    /** Emoter head point (v2: feet - 26 px; here 0.72 of the character height) in layer px. */
    head: (L, m) => L.at(m.pos.clone().setY(m.pos.y + m.height * 0.72)),
    /** Where a finger aims at a person (v2: feet - 14 px; here 0.4 of the height). */
    aim: (L, m) => L.at(m.pos.clone().setY(m.pos.y + m.height * 0.4)),
    feet: (L, m) => L.at(m.pos),
    /** Top of the name label box (docs/UI.md §2.3: label 1 px above the head anchor, box 10 px). */
    // (uses the indicators group's hud.indicators.stackTop when it has landed: ghost lift + the "You" chevron)
    labelTop: (L, m) => {
      const p = L.at(m.head());
      const y = hud.indicators?.stackTop ? hud.indicators.stackTop(m, L) : p.y - 11;
      return { x: p.x, y: hud.indicators?.stackTop ? y + 1 : y };
    },
    /** A ground point (world x, z on the terrain): layer px + view depth {x, y, d} (d for the depth-tested pins). */
    ground: (L, p) => {
      const g = p.clone().setY(hud.terrain.heightAt(p.x, p.z)), q = L.at(g);
      return { x: q.x, y: q.y, d: pins ? pins.depthOf(g) : undefined };
    },
    /**
     * Approximate name-label rects (layer px) of the cast + Storyteller, for label collision (the ST pick label).
     * Box = text width + 2-px outline/pad, 11 px tall, top at the indicators' labelTop (else head anchor - 11).
     */
    labelRects: (L) => [...hud.cast, ...(hud.st ? [hud.st] : [])].map((m) => {
      const p = L.at(m.head()), top = hud.indicators?.labelTop ? hud.indicators.labelTop(m, L) : p.y - 11;
      const w = textWidth(m.name) + 4;
      return { x: p.x - (w >> 1) - 1, y: top - 1, w: w + 2, h: 12 };
    }),
    /** A phase-tagged view of L ('trail' | 'main'; draw.js header). */
    phase: (L, ph) => Object.assign(Object.create(L), { phase: ph }),
    /**
     * Register one scene draw function for all phases: depth-tested pins (pass 301), the trail under the indicators
     * (z trailZ = 15, below labels/bubbles at 20) and the rest at z mainZ (30). Returns the three handles.
     */
    register(fn, { trailZ = 15, mainZ = 30, main = true } = {}) {
      return {
        pins: pins?.add((P) => fn(P)),
        trail: hud.ui.add((L) => fn(M.phase(L, 'trail')), trailZ),
        main: main ? hud.ui.add((L) => fn(M.phase(L, 'main')), mainZ) : null,
      };
    },
  };
  const pins = hud.engine?.pipeline ? createPinPass(hud.engine, hud.ui, { timeFn: hud.clock }) : null;
  M.pins = pins;
  hud._markersM = M;
  return M;
}
