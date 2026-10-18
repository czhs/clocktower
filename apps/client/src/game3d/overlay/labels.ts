// v3 WP4 (v3-overlay). Name labels and the "who is talking" indicator over the 3D avatars.
//
// Labels: interim DOM labels (§3 "Name labels") until pixel3d publishes in-canvas `L.world` labels [Q6].
// One <span> per drawn avatar, text set with textContent only (user text is never parsed as HTML), the
// kit.json label tokens (labelText / st / ghost, an 8-neighbour 1-px labelLine outline as text-shadow).
// Moved with transform only; the size is measured once whenever the name or the font size changes (and once
// more when the web fonts arrive). A label lives as long as its avatar is DRAWN in the viewer's place
// (OverlayFrame.drawn), not just while its head is on the canvas: a walker crossing the view edge costs one
// visibility write, not a destroy + rebuild (create, text, 4 styles, a layout read) each time.
//
// Talking (§3 "Talking outline", interim until pixel3d `createTalkOutline` [Q6]): reads the voice client's
// `voicePresence` (already only people this client actually hears) and draws, for avatars the town draws
// anyway, the indicators atlas' 9×9 `talk_*` glyph beside the label (yourself: `talk_self_*` while you
// speak, `talk_self_idle` while your mic transmits) plus the `talk_ring_*` ground ripple at the feet (the
// atlas' "voice ripple for renderers without the outline pass"). The Settings "Talking outlines" mode
// (talkingPref.ts) is honoured: 'top' draws the ripple at full strength, 'behind' (default) fainter, since a
// DOM overlay cannot be hidden by the buildings in front the way the v2 outline is.
// CONTRACT-REQUEST(WP2): no second talking API: extend the existing AvatarLayer.setTalking(pid, on) with an
// optional rim colour (setTalking(pid, on, rim?)) for the additive emissive rim; the composition root drives it.
import { voicePresence } from '../../voice/VoiceClient';
import { readTalkOutlineMode, type TalkOutlineMode } from '../../game/fx/talkingPref';
import { glyphAt, labelBox } from './anchors';
import { newPlaceState, place, setShown, setStyle, setText, type PlaceState } from './place';
import { labelFontPx, measureEl } from './surface';
import type { OverlayEnv, OverlayFrame, OverlayView } from './types';

interface Label {
  el: HTMLElement;
  st: PlaceState;
  text: string;
  color: string;
  font: number;
  shadow: string;
  w: number;
  h: number;
  /** Needs measuring (content / font changed, web fonts arrived, or it measured 0 × 0 while hidden). */
  dirty: boolean;
  /** The reused label box (published as DrawnAvatar.label). */
  box: { x: number; y: number; w: number; h: number };
}

/** 4.286 fps (indicators meta.fps.talk); the ripple at 7.5 fps. */
const TALK_MS = 1000 / 4.286;
const RING_MS = 1000 / 7.5;

const SHADOW_OFFSETS = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
let shadowLine = '';
let shadowCss = '';
/** The 8-neighbour 1-px outline as a text-shadow (the last colour is cached: no per-frame string building). */
export function shadowOf(line: string): string {
  if (line === shadowLine && shadowCss) return shadowCss;
  const parts: string[] = [];
  for (let i = 0; i < SHADOW_OFFSETS.length; i += 2) parts.push(`${SHADOW_OFFSETS[i]}px ${SHADOW_OFFSETS[i + 1]}px 0 ${line}`);
  shadowLine = line;
  shadowCss = parts.join(', ');
  return shadowCss;
}

export interface LabelsView extends OverlayView {
  /** Talk state for the debug hook. */
  talking(): string[];
}

export function createLabelsView(env: OverlayEnv): LabelsView {
  const { surface, atlas, stats } = env;
  const labels = new Map<string, Label>();
  let speaking: readonly string[] = voicePresence.get().speaking;
  let selfTx = voicePresence.get().selfTransmitting;
  const off = voicePresence.subscribe((p) => {
    speaking = p.speaking;
    selfTx = p.selfTransmitting;
  });
  let mode: TalkOutlineMode = readTalkOutlineMode();
  let modeAt = 0;
  const shown: string[] = [];
  const hp = { x: 0, y: 0 };

  function drop(pid: string, l: Label) {
    l.el.remove();
    stats.content++;
    labels.delete(pid);
  }
  const toMeasure: Label[] = [];
  let fontSeen = surface.fontEpoch();

  /** Text, colour and font of one label (writes only on change). */
  function content(l: Label, name: string, storyteller: boolean, ghost: boolean, f: OverlayFrame, font: number, shadow: string) {
    const text = name || '…';
    if (l.text !== text) {
      l.text = text;
      setText(l.el, text, stats);
      l.dirty = true;
    }
    const color = storyteller ? f.tokens.st : ghost ? f.tokens.ghost : f.tokens.labelText;
    if (l.color !== color) {
      l.color = color;
      setStyle(l.el, 'color', color, stats);
    }
    if (l.font !== font) {
      l.font = font;
      setStyle(l.el, 'fontSize', `${font}px`, stats);
      l.dirty = true;
    }
    if (l.shadow !== shadow) {
      l.shadow = shadow;
      setStyle(l.el, 'textShadow', shadow, stats);
    }
  }

  function update(f: OverlayFrame) {
    const px = f.px;
    const font = labelFontPx(px);
    const shadow = shadowOf(f.tokens.labelLine);
    const fe = surface.fontEpoch();
    const fontsChanged = fe !== fontSeen;
    fontSeen = fe;
    toMeasure.length = 0;
    // 0. forget the avatars that are no longer drawn in our place (left, went inside, hidden)
    for (const [pid, l] of labels) if (!f.drawn.has(pid)) drop(pid, l);
    // 1. content (writes only): on-screen avatars from the frame; a drawn avatar whose head is off the canvas
    //    keeps its label (hidden), and one first seen off the canvas gets its label made now, hidden, so
    //    walking into view is one visibility write
    for (const pid of f.drawn) {
      const a = f.byPid.get(pid);
      let l = labels.get(pid);
      if (!l) {
        l = { el: surface.text('label'), st: newPlaceState(), text: '', color: '', font: 0, shadow: '', w: 0, h: 0, dirty: true, box: { x: 0, y: 0, w: 0, h: 0 } };
        setStyle(l.el, 'fontWeight', '700', stats);
        labels.set(pid, l);
        if (!a) {
          const m = f.state.members.get(pid);
          content(l, m?.name ?? '', m?.role === 'storyteller', f.dead.has(pid), f, font, shadow);
        }
      }
      if (a) content(l, a.name, a.storyteller, a.ghost, f, font, shadow);
      else setShown(l.el, l.st, false, stats); // off the canvas: hidden, text and size kept
      if (fontsChanged) l.dirty = true;
      if (l.dirty) toMeasure.push(l);
    }
    // 2. sizes (one layout read batch, only for changed labels); 0 × 0 (hidden town) = measure again later
    for (const l of toMeasure) {
      const m = measureEl(l.el);
      l.w = m.w;
      l.h = m.h;
      l.dirty = l.w === 0 && l.text !== '';
    }
    // 3. place + publish the label boxes for the views above the label
    for (const a of f.avatars) {
      const l = labels.get(a.pid)!;
      const lift = a.ghost ? Math.round(0.14 * f.cssPerM) : 0; // indicators meta.label.ghostLiftM
      hp.x = a.head.x;
      hp.y = a.head.y - lift;
      const box = labelBox(hp, l, px, l.box);
      a.label = box;
      place(l.el, l.st, box.x, box.y, stats, { w: f.w, h: f.h, margin: 64 });
    }

    // 4. talking glyph + ripple (fx canvas; nothing while nobody talks)
    shown.length = 0;
    const me = f.state.myPid;
    if (!speaking.length && !(selfTx && me)) return;
    if (f.now >= modeAt) {
      modeAt = f.now + 1000; // the Settings toggle applies live (re-read ~1/s, only while someone talks)
      mode = readTalkOutlineMode();
    }
    const tStep = f.still ? 0 : Math.floor(f.now / TALK_MS) % 4;
    const rStep = f.still ? 0 : Math.floor(f.now / RING_MS) % 3;
    const ringAlpha = mode === 'top' ? 1 : 0.6;
    const n = f.night;
    for (const a of f.avatars) {
      const talking = speaking.includes(a.pid);
      const self = a.me;
      if (!talking && !(self && selfTx)) continue;
      shown.push(a.pid);
      const glyph = atlas.frame('indicators', self ? (talking ? `talk_self_${tStep}` : 'talk_self_idle') : `talk_${tStep}`, n);
      if (glyph) {
        const g = glyphAt(a.label, a.head, px, { w: glyph.w * px, h: glyph.h * px });
        f.fx.blit(glyph, g.x, g.y, 0, 0);
      }
      if (talking && a.foot) {
        const ring = atlas.frame('indicators', self ? `talk_ring_self_${rStep}` : `talk_ring_${rStep}`, n);
        f.fx.blit(ring, a.foot.x, a.foot.y, 23, 8, ringAlpha);
      }
    }
  }

  return {
    update,
    talking: () => [...shown],
    destroy() {
      off();
      for (const [pid, l] of labels) drop(pid, l);
    },
  };
}
