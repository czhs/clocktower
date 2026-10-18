// Point / pin pie menu overlay (v2.2 radial). State + gesture: apps/client/src/game/social/radial.ts.
// A fixed DOM overlay in viewport px, centred on the press: Point at 12 o'clock, the 8 pin colours
// around it, "Remove" at 6 o'clock when the press was on a pin you may remove. A caption plate above
// names the picked wedge. Renders nothing (and subscribes to one store) while closed.
import { useStore } from '../../net/store';
import { v3AtlasNow, v3Skin } from '../common/v3skin';
import { SOCIAL_SHEET } from '../../game/social/art';
import { PIN_HEX } from '../../game/social/logic';
import { pieControl, pieMenu, PIE_RADIUS } from '../../game/social/radial';
import { DEAD_ZONE_PX, wedgeAngle, type PieItem } from '../../game/social/radialLogic';
import './pie.css';

/** One sprite frame on a sheet (v2 social sheet or a v3 atlas). */
export interface SpriteFrame {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sheetW: number;
  sheetH: number;
}
function v2Frame(name: string): SpriteFrame | null {
  const f = SOCIAL_SHEET?.json.frames[name];
  if (!SOCIAL_SHEET || !f) return null;
  const W = SOCIAL_SHEET.json.width ?? Math.max(...Object.values(SOCIAL_SHEET.json.frames).map((r) => r.x + r.w));
  const H = SOCIAL_SHEET.json.height ?? Math.max(...Object.values(SOCIAL_SHEET.json.frames).map((r) => r.y + r.h));
  return { url: SOCIAL_SHEET.url, x: f.x, y: f.y, w: f.w, h: f.h, sheetW: W, sheetH: H };
}

/**
 * (v3 WP6) The art lookup for the social dock and pie: v2 lobbies use the v2 social sheet; v3 lobbies use the
 * v3 atlases (emotes / portraits / markers, `-night` by the game hour) and keep v2 art only for the documented
 * skips (nick_face, icon_nicksong, icon_brianbi). Until the v3 atlas has loaded, nothing (the emoji / dot /
 * portrait fallbacks show) rather than v2 art.
 */
/** The frames with no v3 art (= v3atlas.ts V3_SKIPPED_FRAMES; kept here so the lazy atlas stays out of this chunk). */
export const SKIPPED: readonly string[] = ['nick_face', 'icon_nicksong', 'icon_brianbi'];
export function useSocialArt(): (name: string) => SpriteFrame | null {
  const skin = useStore(v3Skin); // re-render on skin, look and atlas-data changes
  if (!skin.on) return v2Frame;
  const v3 = v3AtlasNow();
  return (name) => (SKIPPED.includes(name) ? v2Frame(name) : (v3?.frame(name, skin.night) ?? null));
}

/** A sheet frame as a crisp CSS sprite (null when the frame is missing). */
export function SpriteIcon({ frame, scale = 1, class: cls }: { frame: SpriteFrame | null; scale?: number; class?: string }) {
  if (!frame) return null;
  return (
    <span
      class={cls}
      aria-hidden="true"
      style={{
        width: `${frame.w * scale}px`,
        height: `${frame.h * scale}px`,
        backgroundImage: `url(${frame.url})`,
        backgroundPosition: `${-frame.x * scale}px ${-frame.y * scale}px`,
        backgroundSize: `${frame.sheetW * scale}px ${frame.sheetH * scale}px`,
      }}
    />
  );
}

/** SVG path of an annular sector (angles in radians, screen coords). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

function Icon({ it, art }: { it: PieItem; art: (name: string) => SpriteFrame | null }) {
  const a = it.action;
  const point = art('emote_point');
  const pin = a.kind === 'pin' ? art(`pin_${a.color}`) : null;
  if (a.kind === 'point')
    return (
      <>
        {point ? <SpriteIcon frame={point} scale={2} class="ctp-sprite" /> : <span class="ctp-emoji">👉</span>}
        <small>Point</small>
      </>
    );
  if (a.kind === 'unpin')
    return (
      <>
        <span class="ctp-remove" aria-hidden="true">
          ✕
        </span>
        <small>Remove</small>
      </>
    );
  return pin ? <SpriteIcon frame={pin} scale={1} class="ctp-sprite" /> : <span class="ctp-dot" style={{ background: PIN_HEX[a.color].fill, borderColor: PIN_HEX[a.color].dark }} />;
}

export function PieMenu() {
  const m = useStore(pieMenu);
  const art = useSocialArt();
  if (!m) return null;
  const touch = m.input === 'touch';
  const R = PIE_RADIUS[m.input];
  const r0 = DEAD_ZONE_PX[m.input] + 4;
  const pad = 6;
  const S = 2 * (R + pad);
  const c = S / 2;
  const n = m.items.length;
  const step = (2 * Math.PI) / n;
  const gap = 0.035;
  const rm = (r0 + R) / 2 + 1;
  const hot = m.hot !== null ? m.items[m.hot] : null;
  const caption = hot ? hot.label : m.sticky ? `${m.title} — ${touch ? 'tap' : 'click'} one` : `${m.title} — ${touch ? 'slide' : 'drag'} to choose`;
  // the caption sits above the pie, or below it near the top of the screen
  const capBelow = m.y - R - 44 < 4;
  const choose = (i: number) => pieControl.get()?.choose(i);
  return (
    <div class={`ctp-pie${touch ? ' ctp-touch' : ''}${m.sticky ? ' ctp-sticky' : ''}`} data-pie="1" style={{ left: `${m.x}px`, top: `${m.y}px` }} role="menu" aria-label={m.title} onContextMenu={(e) => e.preventDefault()}>
      <svg class="ctp-ring" width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ left: `${-c}px`, top: `${-c}px` }}>
        <circle class="ctp-back" cx={c} cy={c} r={R + 3} />
        {m.items.map((it, i) => {
          const a = wedgeAngle(i, n);
          const isHot = m.hot === i;
          const pinC = it.action.kind === 'pin' ? PIN_HEX[it.action.color] : null;
          const style = isHot && pinC ? { fill: pinC.dark, stroke: pinC.light } : undefined;
          return (
            <path
              key={it.key}
              d={sector(c, c, r0, R, a - step / 2 + gap, a + step / 2 - gap)}
              class={`ctp-wedge${isHot ? ' hot' : ''}${it.action.kind === 'unpin' ? ' danger' : ''}`}
              style={style}
              data-pie-key={it.key}
              role="menuitem"
              aria-label={it.label}
              onClick={() => choose(i)}
            />
          );
        })}
        {m.items.map((it, i) =>
          it.action.kind === 'pin' && it.action.color === m.color ? (
            <circle key={`cur-${it.key}`} class="ctp-current" cx={c + (R - 4) * Math.cos(wedgeAngle(i, n))} cy={c + (R - 4) * Math.sin(wedgeAngle(i, n))} r={2.5} />
          ) : null,
        )}
        <circle class={`ctp-hub${m.hot === null ? ' idle' : ''}`} cx={c} cy={c} r={r0 - 6} />
      </svg>
      {m.items.map((it, i) => {
        const a = wedgeAngle(i, n);
        return (
          <span key={`ico-${it.key}`} class={`ctp-icon${m.hot === i ? ' hot' : ''}`} style={{ left: `${rm * Math.cos(a)}px`, top: `${rm * Math.sin(a)}px` }} aria-hidden="true">
            <Icon it={it} art={art} />
          </span>
        );
      })}
      <span class="ctp-press" style={{ left: `${m.px - m.x}px`, top: `${m.py - m.y}px` }} aria-hidden="true" />
      <div class={`ctp-caption${capBelow ? ' below' : ''}`} style={{ [capBelow ? 'top' : 'bottom']: `${R + 10}px` }} role="status">
        {caption}
      </div>
    </div>
  );
}
