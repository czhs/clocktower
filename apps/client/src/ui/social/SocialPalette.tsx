// Emote + pin dock (HUD), the touch long-press radial and the pin tooltip (social-client agent).
// Mounted by GameScreen. The in-world half lives in apps/client/src/game/social.
//
//   dock     bottom-right, one small button (your pin colour + your character) that opens a compact
//            strip: 👉 Point / 📍 Pin (arm the next tap), 8 colour swatches (remembered), clear mine,
//            the Storyteller's clear all, and the shortcuts. Never needed: right-click / F / long-press
//            work without it.
//   radial   touch long-press: two round buttons above the finger (slide + lift, or tap)
//   tooltip  "<name>'s pin on <target>" over the hovered pin
import { useEffect, useState } from 'preact/hooks';
import { castById, PLAYABLE } from '@ct/assets';
import { NICK_FACE_CHARACTER, PIN_COLORS, type PinColor } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore, useStoreSelector } from '../../net/store';
import { CastPortrait } from '../common/castPortrait';
import { isPinColor, PIN_HEX, savePinColor } from '../../game/social/logic';
import { socialActions, socialHover, socialInfo, socialMode, socialRadial } from '../../game/social/state';
import './social.css';
import { PieMenu, SpriteIcon, useSocialArt, type SpriteFrame } from './PieMenu';
import { useV3Skin } from '../common/v3skinLobby';

const OPEN_KEY = 'ct.social.dockOpen';

/** The cast id the town draws for a member (TownScene.castKey: their pick, else a stable stand-in). */
function castIdFor(pid: string, preset: string | null | undefined): string {
  const picked = castById(preset ?? null);
  if (picked && (picked.kind === 'villager' || picked.kind === 'mascot')) return picked.id;
  let h = 0;
  for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PLAYABLE[h % PLAYABLE.length]!.id;
}
const HINT_KEY = 'ct.hint.social.v1';

function readFlag(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeFlag(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // storage blocked
  }
}

type Art = (name: string) => SpriteFrame | null;
/** One frame of the social art (v2 sheet, or the v3 atlases in a v3 lobby) as a crisp CSS sprite. */
function SheetIcon({ art, frame, scale = 1, class: cls }: { art: Art; frame: string; scale?: number; class?: string }) {
  return <SpriteIcon frame={art(frame)} scale={scale} class={`cts-sheet${cls ? ` ${cls}` : ''}`} />;
}

export function SocialPalette(props: { conn: RoomConnection; touch: boolean }) {
  // (v3 WP6) the lobby's v3 DOM skin while the town is up (ref-counted with the waiting room's). This mount alone
  // drops the skin whenever GameScreen leaves 'ready' after game start (in-place renderer swap, perf / error
  // fallback, mid-game reload before the town is ready): CONTRACT-REQUEST(lead): call useV3Skin(conn) once in
  // LobbyRoute `InLobby` (lives exactly as long as the connection); this mount then becomes a harmless extra ref.
  useV3Skin(props.conn);
  return (
    <>
      <Dock conn={props.conn} touch={props.touch} />
      <Radial />
      <PieMenu />
      <Tooltip />
    </>
  );
}

function Dock({ conn, touch }: { conn: RoomConnection; touch: boolean }) {
  const lobby = useStore(conn.lobbyView);
  const stView = useStoreSelector(conn.gameView, (g) => g?.kind === 'storyteller');
  const mode = useStore(socialMode);
  const info = useStore(socialInfo);
  const art = useSocialArt();
  const has = (f: string) => art(f) !== null;
  const [open, setOpen] = useState(() => readFlag(OPEN_KEY) === '1');
  const [hint, setHint] = useState(() => readFlag(HINT_KEY) !== '1');
  const meM = lobby?.members.find((m) => m.pid === lobby.youPid);
  const st = stView || meM?.role === 'storyteller';
  const character = st ? 'storyteller' : meM ? castIdFor(meM.pid, meM.cosmetics.preset) : null;
  /** (v2.2) Only Nick Song gets the 'nick-face' emote (the server checks the same lobby character). */
  const nick = !st && meM?.cosmetics.preset === NICK_FACE_CHARACTER;
  const color = mode.color;

  // sit beside the voice panel (desktop: to its left; touch: above it), whatever its size
  const [place, setPlace] = useState<{ right: number; bottom: number } | null>(null);
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let el: Element | null = null;
    const measure = () => {
      const v = document.querySelector('.ctv');
      if (v !== el) {
        ro?.disconnect();
        el = v;
        if (v && typeof ResizeObserver === 'function') {
          ro = new ResizeObserver(measure);
          ro.observe(v);
        }
      }
      if (!v) return setPlace(null);
      const r = v.getBoundingClientRect();
      if (!r.width) return setPlace(null);
      const next = touch ? { right: 14, bottom: Math.max(132, Math.round(window.innerHeight - r.top) + 10) } : { right: Math.round(window.innerWidth - r.left) + 10, bottom: 12 };
      setPlace((p) => (p && p.right === next.right && p.bottom === next.bottom ? p : next));
    };
    measure();
    const t = setInterval(measure, 1500); // the voice panel may mount / unmount later
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(t);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [touch]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => (writeFlag(HINT_KEY, '1'), setHint(false)), 14_000);
    return () => clearTimeout(t);
  }, [hint]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeFlag(OPEN_KEY, next ? '1' : '0');
    if (hint) (writeFlag(HINT_KEY, '1'), setHint(false));
  };
  const pick = (c: PinColor) => {
    if (!isPinColor(c)) return;
    socialMode.set((m) => ({ ...m, color: c }));
    try {
      savePinColor(localStorage, c);
    } catch {
      // storage blocked
    }
  };
  const arm = (m: 'point' | 'pin') => {
    socialMode.set((s) => ({ ...s, mode: s.mode === m ? 'idle' : m }));
    if (touch && socialMode.get().mode !== 'idle') setOpen(false); // get the panel off the town
  };
  const hex = PIN_HEX[color];
  const armed = mode.mode !== 'idle';

  return (
    <div class={`cts-dock${touch ? ' cts-touch' : ''}${open ? ' cts-open' : ''}`} style={place ? { right: `calc(${place.right}px + var(--safe-right, 0px))`, bottom: `calc(${place.bottom}px + var(--safe-bottom, 0px))` } : undefined}>
      {armed && (
        <div class="cts-armed" role="status">
          <span>{mode.mode === 'point' ? (touch ? 'Tap what to point at' : 'Click what to point at') : touch ? 'Tap where to drop your pin' : 'Click where to drop your pin'}</span>
          <button type="button" onClick={() => socialActions.get()?.cancel() ?? socialMode.set((s) => ({ ...s, mode: 'idle' }))}>
            Cancel
          </button>
        </div>
      )}
      {open && (
        <div class="cts-panel" role="group" aria-label="Point and pins">
          <div class="cts-acts">
            <button type="button" class={`cts-act${mode.mode === 'point' ? ' on' : ''}`} aria-pressed={mode.mode === 'point'} onClick={() => arm('point')} title={touch ? 'Then tap what to point at' : 'Or right-click anything (Q points at the cursor)'}>
              {has('emote_point') ? <SheetIcon art={art} frame="emote_point" scale={touch ? 2 : 1} /> : <span aria-hidden="true">👉</span>} Point
            </button>
            <button type="button" class={`cts-act${mode.mode === 'pin' ? ' on' : ''}`} aria-pressed={mode.mode === 'pin'} onClick={() => arm('pin')} title={touch ? 'Then tap a person or a spot' : 'Or press F over a person or a spot'}>
              <PinGlyph art={art} color={color} /> Pin
            </button>
            {nick && (
              <button type="button" class="cts-act cts-nick" onClick={() => socialActions.get()?.nickFace?.()} title="Nick face: your head becomes a 😝 for a few seconds">
                {has('nick_face') ? <SheetIcon art={art} frame="nick_face" scale={touch ? 2 : 1} /> : <span aria-hidden="true">😝</span>} Face
              </button>
            )}
          </div>
          <div class="cts-swatches" role="radiogroup" aria-label="Pin colour">
            {PIN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={PIN_HEX[c].label}
                title={PIN_HEX[c].label}
                class={`cts-swatch${c === color ? ' on' : ''}${has(`pin_${c}`) ? ' art' : ''}`}
                style={has(`pin_${c}`) ? undefined : { background: PIN_HEX[c].fill, borderColor: PIN_HEX[c].dark }}
                onClick={() => pick(c)}
              >
                <SheetIcon art={art} frame={`pin_${c}`} />
              </button>
            ))}
          </div>
          <div class="cts-row">
            <button type="button" class="cts-small" disabled={info.mine === 0} onClick={() => socialActions.get()?.clear('mine')}>
              Clear my pins{info.mine ? ` (${info.mine})` : ''}
            </button>
            {st && (
              <button type="button" class="cts-small" disabled={info.here === 0} onClick={() => socialActions.get()?.clear('all')} title="Remove everyone's pins">
                Clear all
              </button>
            )}
          </div>
          <p class="cts-tip">
            {touch ? (
              <>
                <b>Hold</b> a finger on the town, then slide to point or pick a pin colour · tap your pin to remove it
              </>
            ) : (
              <>
                <kbd>Right-click</kbd> point · <kbd>Right-drag</kbd> point / pin menu · <kbd>F</kbd> pin · click your pin to remove
              </>
            )}
          </p>
        </div>
      )}
      <button
        type="button"
        class="cts-toggle"
        aria-expanded={open}
        aria-label={open ? 'Close point and pins' : 'Point and pins'}
        title={touch ? 'Point & pins — or hold a finger on the town' : 'Point & pins — right-click to point, right-drag for the pin menu, F to pin'}
        style={{ borderColor: hex.fill, boxShadow: `0 0 0 2px ${hex.dark}, 0 3px 10px #000a` }}
        onClick={toggle}
      >
        {character && has(`icon_${character}`) ? (
          <SheetIcon art={art} frame={`icon_${character}`} scale={touch ? 3 : 2} />
        ) : character ? (
          <CastPortrait id={character} size={touch ? 30 : 24} crop="bust" />
        ) : (
          <span aria-hidden="true">📍</span>
        )}
        <span class="cts-toggle-pin" style={{ background: hex.fill, borderColor: hex.dark }} aria-hidden="true" />
      </button>
      {hint && !open && (
        <div class="cts-hint" role="status">
          {touch ? (
            <>
              <b>New:</b> hold a finger on the town to point or drop a pin
            </>
          ) : (
            <>
              <b>New:</b> <kbd>Right-click</kbd> to point · <kbd>Right-drag</kbd> to pick point or a pin
            </>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => (writeFlag(HINT_KEY, '1'), setHint(false))}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function PinGlyph({ art, color, big }: { art: Art; color: PinColor; big?: boolean }) {
  if (art(`pin_${color}`)) return <SheetIcon art={art} frame={`pin_${color}`} scale={1} class={big ? 'big' : undefined} />;
  const hex = PIN_HEX[color];
  return <span class={`cts-pin-dot${big ? ' big' : ''}`} style={{ background: hex.fill, borderColor: hex.dark }} aria-hidden="true" />;
}

const R_DX = 46;
const R_DY = 56;

function Radial() {
  const r = useStore(socialRadial);
  const mode = useStore(socialMode);
  const art = useSocialArt();
  const has = (f: string) => art(f) !== null;
  if (!r) return null;
  // keep both buttons on screen
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const x = Math.max(R_DX + 30, Math.min(vw - R_DX - 30, r.sx));
  const y = Math.max(R_DY + 34, r.sy);
  const go = (k: 'point' | 'pin') => {
    const a = socialActions.get();
    if (!a) return socialRadial.set(null);
    if (k === 'point') a.point(r.target);
    else a.pin(r.target);
  };
  return (
    <div class="cts-radial" style={{ left: `${x}px`, top: `${y}px` }} role="menu" aria-label="Point or pin">
      <span class="cts-radial-dot" style={{ left: `${r.sx - x}px`, top: `${r.sy - y}px` }} aria-hidden="true" />
      <button type="button" role="menuitem" data-social-act="point" class={`cts-rbtn${r.hot === 'point' ? ' hot' : ''}`} style={{ left: `${-R_DX}px`, top: `${-R_DY}px` }} onClick={() => go('point')} aria-label={r.target.pid ? 'Point at them' : 'Point here'}>
        {has('emote_point') ? <SheetIcon art={art} frame="emote_point" scale={2} /> : <span aria-hidden="true">👉</span>}
        <small>Point</small>
      </button>
      <button type="button" role="menuitem" data-social-act="pin" class={`cts-rbtn${r.hot === 'pin' ? ' hot' : ''}`} style={{ left: `${R_DX}px`, top: `${-R_DY}px` }} onClick={() => go('pin')} aria-label={r.target.pid ? 'Pin them' : 'Drop a pin here'}>
        <PinGlyph art={art} color={mode.color} big />
        <small>Pin</small>
      </button>
    </div>
  );
}

function Tooltip() {
  const h = useStore(socialHover);
  if (!h) return null;
  return (
    <div class={`cts-tooltip${h.removable ? ' removable' : ''}`} style={{ left: `${h.sx}px`, top: `${h.sy}px` }} role="tooltip">
      {h.text}
    </div>
  );
}
