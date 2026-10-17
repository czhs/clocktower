// Point / pin pie menu overlay (v2.2 radial). State + gesture: apps/client/src/game/social/radial.ts.
// A fixed DOM overlay in viewport px, centred on the press: Point at 12 o'clock, the 8 pin colours
// around it, "Remove" at 6 o'clock when the press was on a pin you may remove. A caption plate above
// names the picked wedge. Renders nothing (and subscribes to one store) while closed.
import { useStore } from '../../net/store';
import { SOCIAL_SHEET } from '../../game/social/art';
import { PIN_HEX } from '../../game/social/logic';
import { pieControl, pieMenu, PIE_RADIUS } from '../../game/social/radial';
import { DEAD_ZONE_PX, wedgeAngle, type PieItem } from '../../game/social/radialLogic';
import './pie.css';

function Sprite({ frame, scale }: { frame: string; scale: number }) {
  const f = SOCIAL_SHEET?.json.frames[frame];
  if (!SOCIAL_SHEET || !f) return null;
  const W = SOCIAL_SHEET.json.width ?? Math.max(...Object.values(SOCIAL_SHEET.json.frames).map((r) => r.x + r.w));
  const H = SOCIAL_SHEET.json.height ?? Math.max(...Object.values(SOCIAL_SHEET.json.frames).map((r) => r.y + r.h));
  return (
    <span
      class="ctp-sprite"
      aria-hidden="true"
      style={{
        width: `${f.w * scale}px`,
        height: `${f.h * scale}px`,
        backgroundImage: `url(${SOCIAL_SHEET.url})`,
        backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`,
        backgroundSize: `${W * scale}px ${H * scale}px`,
      }}
    />
  );
}
const hasFrame = (f: string) => !!SOCIAL_SHEET?.json.frames[f];

/** SVG path of an annular sector (angles in radians, screen coords). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

function Icon({ it }: { it: PieItem }) {
  const a = it.action;
  if (a.kind === 'point')
    return (
      <>
        {hasFrame('emote_point') ? <Sprite frame="emote_point" scale={2} /> : <span class="ctp-emoji">👉</span>}
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
  return hasFrame(`pin_${a.color}`) ? <Sprite frame={`pin_${a.color}`} scale={1} /> : <span class="ctp-dot" style={{ background: PIN_HEX[a.color].fill, borderColor: PIN_HEX[a.color].dark }} />;
}

export function PieMenu() {
  const m = useStore(pieMenu);
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
            <Icon it={it} />
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
