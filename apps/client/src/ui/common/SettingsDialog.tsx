import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PIN_COLORS, type ChatFilterMode, type LobbyRoomView, type PinColor, type WorldId } from '@ct/protocol';
import { getAmbientVolume, getSfxVolume, setAmbientVolume, setSfxVolume } from '../../game/audio';
import type { FxQualityPref } from '../../game/fx/quality';
import type { TalkOutlineMode } from '../../game/fx/talkingPref';
// (v3 WP6) the Graphics (renderer) setting: three-free decision table + in-place swap signal
import { chooseRendererHere, clearAutoFallback, notifyGraphicsChange, type GraphicsPref } from '../../game3d/select';
import { currentRender, graphicsStatus } from './graphicsStatus';
import { resetBootGuard } from '../../game3d/bootGuard';
import { PIN_HEX } from '../../game/social/logic';
import { socialMode } from '../../game/social/state';
import type { RoomConnection } from '../../net/room';
import { createStore, useStore, type Store } from '../../net/store';
import { activeVoiceClient } from '../../voice/active';
import { isPttMouseButton, mouseCode, pttLabel } from '../../voice/ptt';
import type { VoiceClient, VoiceClientState } from '../../voice/VoiceClient';
import { DeviceSettings } from '../voice/DeviceSettings';
import { ReportDialog } from '../lobby/moderation';
import { goTo, worldOfLobby } from '../lobby/finder';
import { openHelp } from './HowToPlay';
import {
  migratePrefs,
  readPrefs,
  readVoicePrefs,
  resetHints,
  resetPrefs,
  safeStorage,
  VOICE_DEFAULTS,
  writePref,
  writeVoicePrefs,
  type PrefValues,
  type ReducedMotionPref,
  type VoicePrefs,
} from './prefs';
import { rememberTab, SECTIONS, type SettingsDialogProps, type SettingsSection } from './Settings';
import './Settings.css';

// (v2.3) The ⚙ Settings dialog (lazy chunk; the gear button is ./Settings.tsx). Desktop: a left nav,
// one section at a time. Phones: one scrolling sheet with sticky section headers and a chip row
// that jumps between them. Each preference has exactly one store (see ./prefs.ts); changes apply
// live through the owner's API (sound engine, voice client, social store; the town polls graphics /
// outline / motion about once a second).

function useMedia(q: string): boolean {
  const get = () => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const [m, setM] = useState(get);
  useEffect(() => {
    const on = () => setM(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [q]);
  return m;
}

// ------------------------------------------------------------------------------------ primitives

let uid = 0;
/** A labelled setting: name, control, one line of help (wired with aria-describedby). */
function Row({ label, help, children, id, wide }: { label: string; help?: ComponentChildren; children: ComponentChildren; id?: string; wide?: boolean }) {
  const hid = useMemo(() => id ?? `ct-set-h${++uid}`, [id]);
  return (
    <div class={`ct-set-row${wide ? ' ct-set-wide' : ''}`} aria-describedby={help ? hid : undefined}>
      <div class="ct-set-label">{label}</div>
      <div class="ct-set-ctl">{children}</div>
      {help && (
        <p class="ct-set-help" id={hid}>
          {help}
        </p>
      )}
    </div>
  );
}

/** Segmented single choice (radio group, arrow keys move the choice). */
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n]![0]);
    refs.current[n]?.focus();
  };
  return (
    <div class="ct-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text], i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === v}
          tabIndex={value === v ? 0 : -1}
          class={value === v ? 'on' : ''}
          onClick={() => onChange(v)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(i + 1));
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(i - 1));
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} class={`ct-switch${checked ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!checked)}>
      <span class="ct-switch-knob" aria-hidden="true" />
      <span class="ct-switch-text">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span class="ct-set-slider">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value) / 100)}
      />
      <output>{Math.round(value * 100)}%</output>
    </span>
  );
}

// ------------------------------------------------------------------------------------ dialog

interface Ctx {
  prefs: PrefValues;
  set: <K extends keyof PrefValues>(k: K, v: PrefValues[K]) => void;
  conn?: RoomConnection;
  onLeave?: () => void;
  close: () => void;
  binding: { current: boolean };
  reporting: { current: boolean };
}

export function SettingsDialog({ conn, start, onClose, onLeave, leaveLabel }: SettingsDialogProps) {
  const wide = useMedia('(min-width: 720px)');
  const [tab, setTab] = useState<SettingsSection>(start);
  const [prefs, setPrefs] = useState<PrefValues>(() => {
    const s = safeStorage();
    migratePrefs(s);
    // the sound engine is the live owner of the volumes
    return { ...readPrefs(s), ambientVolume: getAmbientVolume(), sfxVolume: getSfxVolume() };
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const voice = useStore(activeVoiceClient);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const binding = useRef(false);
  const reporting = useRef(false);

  useEffect(() => setTab(start), [start]);
  useEffect(() => rememberTab(tab), [tab]);

  // Focus in, Esc closes (not while capturing a push-to-talk key or with the report dialog open),
  // Tab stays inside the dialog.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[aria-selected="true"], .ct-set-close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (binding.current || reporting.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea, [href]')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const set: Ctx['set'] = (k, v) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    setResetDone(false);
    if (k === 'ambientVolume') return setAmbientVolume(v as number); // the engine persists it
    if (k === 'sfxVolume') return setSfxVolume(v as number);
    writePref(safeStorage(), k, v);
    if (k === 'pinColor') socialMode.set((m) => ({ ...m, color: v as PinColor }));
    if (k === 'graphics') notifyGraphicsChange(); // (v3) a mounted town swaps renderer in place
  };

  const resetAll = () => {
    const d = resetPrefs(safeStorage());
    setAmbientVolume(d.ambientVolume);
    setSfxVolume(d.sfxVolume);
    socialMode.set((m) => ({ ...m, color: d.pinColor }));
    if (voice) {
      voice.setInputMode(VOICE_DEFAULTS.inputMode);
      voice.setPttKey(VOICE_DEFAULTS.pttKey);
      voice.setCrowdMute(VOICE_DEFAULTS.crowdMute);
      void voice.setDevice('');
      void voice.setOutput('');
    }
    setPrefs(d);
    setConfirmReset(false);
    setResetDone(true);
    notifyGraphicsChange(); // (v3) back to 'auto'
  };

  const ctx: Ctx = { prefs, set, conn, onLeave, close: onClose, binding, reporting };
  const section = (id: SettingsSection) => {
    switch (id) {
      case 'audio':
        return <AudioSection ctx={ctx} voice={voice} />;
      case 'graphics':
        return <GraphicsSection ctx={ctx} />;
      case 'chat':
        return <ChatSection ctx={ctx} />;
      case 'controls':
        return <ControlsSection voice={voice} close={onClose} />;
      case 'privacy':
        return <PrivacySection ctx={ctx} voice={voice} />;
      case 'about':
        return <AboutSection close={onClose} />;
    }
  };
  const jump = (id: SettingsSection) => {
    setTab(id);
    body.current?.querySelector(`#ct-set-${id}`)?.scrollIntoView({ block: 'start' });
  };

  return (
    <div class="ct-set-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} class={`ct-set panel${wide ? ' ct-set-desk' : ' ct-set-phone'}`} role="dialog" aria-modal="true" aria-labelledby="ct-set-title">
        <header class="ct-set-head">
          <h2 id="ct-set-title">Settings</h2>
          <span class="ct-set-sub muted">Saved in this browser only</span>
          <button type="button" class="ct-set-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>
        <nav class="ct-set-nav" role="tablist" aria-label="Settings sections" aria-orientation={wide ? 'vertical' : 'horizontal'}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`ct-set-tab-${s.id}`}
              aria-controls={`ct-set-${s.id}`}
              aria-selected={tab === s.id}
              tabIndex={tab === s.id ? 0 : -1}
              class={tab === s.id ? 'on' : ''}
              onClick={() => jump(s.id)}
              onKeyDown={(e) => {
                const k = e.key;
                const d = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const n = SECTIONS[(i + d + SECTIONS.length) % SECTIONS.length]!.id;
                jump(n);
                root.current?.querySelector<HTMLElement>(`#ct-set-tab-${n}`)?.focus();
              }}
            >
              <span class="ct-set-glyph" aria-hidden="true">
                {s.glyph}
              </span>
              {s.label}
            </button>
          ))}
        </nav>
        <div class="ct-set-body" ref={body}>
          {(wide ? SECTIONS.filter((s) => s.id === tab) : SECTIONS).map((s) => (
            <section key={s.id} id={`ct-set-${s.id}`} class="ct-set-section" role="tabpanel" aria-labelledby={`ct-set-tab-${s.id}`}>
              <h3 class="ct-set-h">{s.label}</h3>
              {section(s.id)}
            </section>
          ))}
        </div>
        <footer class="ct-set-foot">
          {confirmReset ? (
            <span class="ct-set-confirm" role="alert">
              Reset sound, voice, graphics and pin colour to their defaults?{' '}
              <button type="button" class="ct-danger-btn" onClick={resetAll}>
                Reset
              </button>{' '}
              <button type="button" class="ct-link" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" class="ct-link" onClick={() => setConfirmReset(true)} title="Per-person voice volumes and silenced people are kept">
              {resetDone ? 'Defaults restored' : 'Reset to defaults'}
            </button>
          )}
          <span class="ct-set-spacer" />
          {onLeave && (
            <button
              type="button"
              class="ct-settings-leave"
              onClick={() => {
                onClose();
                onLeave();
              }}
            >
              {leaveLabel ?? 'Leave'}
            </button>
          )}
          <button type="button" class="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ sections

/** Voice state: the live client when the voice panel is mounted, else the stored prefs. */
const storedVoice: Store<VoiceClientState | null> = createStore<VoiceClientState | null>(null);

function AudioSection({ ctx, voice }: { ctx: Ctx; voice: VoiceClient | null }) {
  const s = useStore((voice?.state ?? storedVoice) as Store<VoiceClientState | null>);
  const [stored, setStored] = useState<VoicePrefs>(() => readVoicePrefs(safeStorage()));
  const v = s ?? { ...stored, enabled: false };
  const patchStored = (p: Partial<VoicePrefs>) => {
    writeVoicePrefs(safeStorage(), p);
    setStored(readVoicePrefs(safeStorage()));
  };
  const setMode = (m: 'ptt' | 'open') => (voice ? voice.setInputMode(m) : patchStored({ inputMode: m }));
  const setKey = (code: string) => (voice ? voice.setPttKey(code) : patchStored({ pttKey: code }));
  const setCrowd = (on: boolean) => (voice ? voice.setCrowdMute(on) : patchStored({ crowdMute: on }));
  return (
    <>
      <Row label="Town ambience" help="Wind, birds, the fountain — kept quietly under voice chat.">
        <Slider label="Town ambience volume" value={ctx.prefs.ambientVolume} onChange={(x) => ctx.set('ambientVolume', x)} />
      </Row>
      <Row label="Sound effects" help="Footsteps, doors, bells and votes.">
        <Slider label="Sound effects volume" value={ctx.prefs.sfxVolume} onChange={(x) => ctx.set('sfxVolume', x)} />
      </Row>
      <h4 class="ct-set-sub-h">Voice</h4>
      <Row label="Talk with" help={v.inputMode === 'ptt' ? 'Hold a key (or the on-screen button) while you talk.' : 'Your mic is live whenever you are not muted.'}>
        <Seg label="Microphone mode" value={v.inputMode} options={[['ptt', 'Push-to-talk'], ['open', 'Open mic']] as const} onChange={setMode} />
      </Row>
      {v.inputMode === 'ptt' && <PttBinding code={v.pttKey} onBind={setKey} binding={ctx.binding} />}
      <Row label="Join busy rooms muted" help="Open mic only: arriving where 8 or more people talk mutes you once, so you don't burst in.">
        <Toggle label="Join busy rooms muted" checked={v.crowdMute} onChange={setCrowd} />
      </Row>
      {voice && s?.enabled ? (
        <Row label="Microphone & speaker" wide help="The microphone and speaker this browser uses for voice.">
          <DeviceSettings client={voice} s={s} />
        </Row>
      ) : (
        <Row label="Microphone & speaker" help="Choose devices once voice is on — your browser only lists them after you allow the microphone.">
          {voice && s?.availability !== 'not_configured' ? (
            <button type="button" onClick={() => void voice.enable()} disabled={s?.loading}>
              {s?.loading ? 'Loading voice…' : 'Enable voice'}
            </button>
          ) : (
            <span class="muted ct-small">{voice ? 'Voice is not set up on this server.' : 'Join a lobby to use voice.'}</span>
          )}
        </Row>
      )}
      <p class="ct-set-note">Per-person volume and “silence for me” are next to each name in the Voice panel.</p>
    </>
  );
}

/** Rebind push-to-talk: the next key, or the middle / side mouse button (Esc or a left/right click cancels). */
function PttBinding({ code, onBind, binding }: { code: string; onBind: (c: string) => void; binding: { current: boolean } }) {
  const [on, setOn] = useState(false);
  // layout effect: listen from the moment the button says "Press a key…" (no gap for a fast press)
  useLayoutEffect(() => {
    binding.current = on;
    if (!on) return;
    const stop = () => setTimeout(() => setOn(false), 0); // let this event finish before Esc closes anything
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return void stop();
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') onBind(e.code);
      stop();
    };
    const onMouse = (e: MouseEvent) => {
      if (isPttMouseButton(e.button)) {
        e.preventDefault();
        e.stopPropagation();
        onBind(mouseCode(e.button));
      }
      stop();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('mousedown', onMouse, { capture: true });
    return () => {
      binding.current = false;
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('mousedown', onMouse, { capture: true });
    };
  }, [on]);
  return (
    <Row label="Push-to-talk key" help="A key, or the middle / side mouse button. Left and right click walk and point, so they can't be used.">
      <button type="button" class={`ct-set-key${on ? ' binding' : ''}`} aria-live="polite" onClick={() => setOn(true)}>
        {on ? (
          'Press a key or mouse button… (Esc cancels)'
        ) : (
          <>
            <kbd>{pttLabel(code)}</kbd> Change
          </>
        )}
      </button>
    </Row>
  );
}

function osReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// (v3 WP6) The renderer setting. Row 1 of game3d/select.ts: a v2 lobby always draws the classic town.
const GRAPHICS_OPTIONS = [
  ['auto', 'Auto'],
  ['v3', 'v3 3D'],
  ['classic', 'Classic 2D'],
] as const;

function RendererRow({ ctx }: { ctx: Ctx }) {
  const lobby = useStore(ctx.conn?.lobbyView ?? storedLobby);
  const world: WorldId | null = lobby ? worldOfLobby(lobby) : null;
  const now = useStore(currentRender); // what the mounted town really draws (a runtime fallback shows here)
  const [, bump] = useState(0);
  // re-read on every render: the pref, the memo and the boot guard can change from here or from the town
  const choice = world ? chooseRendererHere(world) : null;
  const st = graphicsStatus(world, choice, now);
  const act = () => {
    if (st.action === 'auto-fallback') clearAutoFallback();
    else if (st.action === 'boot-guard') resetBootGuard();
    // ('retry': nothing to clear) GameScreen re-evaluates chooseRenderer and swaps / remounts in place
    notifyGraphicsChange();
    bump((n) => n + 1);
  };
  return (
    <Row
      label="Town graphics"
      help={
        <>
          <span role="status" aria-live="polite" class="ct-set-graphics-status">
            {st.text}
          </span>{' '}
          {st.action && (
            <button type="button" class="ct-link" onClick={act}>
              {st.action === 'boot-guard' ? 'Try v3' : 'Try v3 again'}
            </button>
          )}
          {world === 'v3' && !st.action && <span class="ct-small"> Auto picks 3D where it runs well.</span>}
        </>
      }
    >
      <Seg<GraphicsPref>
        label="Graphics"
        value={ctx.prefs.graphics}
        options={GRAPHICS_OPTIONS}
        onChange={(x) => {
          ctx.set('graphics', x);
          bump((n) => n + 1);
        }}
      />
    </Row>
  );
}

function GraphicsSection({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <RendererRow ctx={ctx} />
      <Row label="Quality" help="Lower it if the town feels sluggish. Auto starts high and steps down by itself.">
        <Seg<FxQualityPref> label="Graphics quality" value={ctx.prefs.fxQuality} options={[['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const} onChange={(x) => ctx.set('fxQuality', x)} />
      </Row>
      <Row label="Talking outlines" help="Whoever is speaking gets an outline. “Always on top” also shows it through buildings.">
        <Seg<TalkOutlineMode> label="Talking outlines" value={ctx.prefs.talkOutline} options={[['behind', 'Behind buildings'], ['top', 'Always on top']] as const} onChange={(x) => ctx.set('talkOutline', x)} />
      </Row>
      <Row label="Reduced motion" help={`Stills drifting particles, flicker, fog and bobbing; the lighting stays. “Match device” follows your system (now ${osReducedMotion() ? 'on' : 'off'}).`}>
        <Seg<ReducedMotionPref> label="Reduced motion" value={ctx.prefs.reducedMotion} options={[['system', 'Match device'], ['on', 'On'], ['off', 'Off']] as const} onChange={(x) => ctx.set('reducedMotion', x)} />
      </Row>
      <p class="ct-set-note">Changes reach the town within a second.</p>
    </>
  );
}

const FILTER_TEXT: Record<ChatFilterMode, string> = { off: 'Off', slurs: 'Slurs hidden', strict: 'Strict' };

function ChatSection({ ctx }: { ctx: Ctx }) {
  const lobby = useStore(ctx.conn?.lobbyView ?? storedLobby);
  const [tipsReset, setTipsReset] = useState(false);
  const filter = lobby?.lobby.chatFilter ?? 'slurs';
  return (
    <>
      <Row label="Pin colour" help="The colour of the pins you drop (F, or right-drag the pie menu).">
        <div class="ct-set-swatches" role="radiogroup" aria-label="Pin colour">
          {PIN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={ctx.prefs.pinColor === c}
              aria-label={PIN_HEX[c].label}
              title={PIN_HEX[c].label}
              class={`ct-set-swatch${ctx.prefs.pinColor === c ? ' on' : ''}`}
              style={{ background: PIN_HEX[c].fill, borderColor: PIN_HEX[c].dark }}
              onClick={() => ctx.set('pinColor', c)}
            />
          ))}
        </div>
      </Row>
      <Row label="Open chat" help="Only people in your area see your messages; inside a cottage, chat stays in that room.">
        <span>
          <kbd>Enter</kbd> or <kbd>T</kbd> <span class="muted ct-small">· Esc goes back to walking</span>
        </span>
      </Row>
      <Row label="Chat filter" help="Set for the whole lobby by its host, in the waiting room.">
        <span>{FILTER_TEXT[filter]}</span>
      </Row>
      <Row label="Tips" help="The first-visit hints (moving, pins and emotes, how to play) show again.">
        <button
          type="button"
          disabled={tipsReset}
          onClick={() => {
            resetHints(safeStorage());
            setTipsReset(true);
          }}
        >
          {tipsReset ? 'Tips will show again' : 'Show tips again'}
        </button>
      </Row>
    </>
  );
}
const storedLobby = createStore<LobbyRoomView | null>(null);

function ControlsSection({ voice, close }: { voice: VoiceClient | null; close: () => void }) {
  const s = useStore((voice?.state ?? storedVoice) as Store<VoiceClientState | null>);
  const ptt = s?.pttKey ?? readVoicePrefs(safeStorage()).pttKey;
  const rows: [ComponentChildren, string][] = [
    [
      <>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> / arrows · click
      </>,
      'Walk',
    ],
    [
      <>
        <kbd>E</kbd> / <kbd>Space</kbd>
      </>,
      'Use a door',
    ],
    [<kbd>{pttLabel(ptt)}</kbd>, 'Push-to-talk (hold) — change it in Audio & voice'],
    [
      <>
        <kbd>Enter</kbd> / <kbd>T</kbd>
      </>,
      'Chat',
    ],
    [<kbd>?</kbd>, 'How to play'],
  ];
  return (
    <>
      <table class="ct-set-keys">
        <tbody>
          {rows.map(([k, what], i) => (
            <tr key={i}>
              <td>{k}</td>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="ct-set-note">On a phone or tablet: tap to walk, or drag the joystick; long-press to point or pin.</p>
      <button
        type="button"
        onClick={() => {
          close();
          openHelp('Keys');
        }}
      >
        All keyboard shortcuts…
      </button>
    </>
  );
}

function PrivacySection({ ctx, voice }: { ctx: Ctx; voice: VoiceClient | null }) {
  const lobby = useStore(ctx.conn?.lobbyView ?? storedLobby);
  const [, bump] = useState(0);
  const [reportPid, setReportPid] = useState('');
  const [reporting, setReporting] = useState<{ pid: string; name: string } | null>(null);
  ctx.reporting.current = !!reporting;
  const others = (lobby?.members ?? []).filter((m) => m.pid !== lobby?.youPid);
  const vols = voice?.prefs.volumes ?? readVoicePrefs(safeStorage()).volumes;
  const silenced = others.filter((m) => vols[m.pid] === 0);
  const inGame = !!lobby && lobby.lobby.phase !== 'waiting';
  return (
    <>
      <h4 class="ct-set-sub-h">What others can see</h4>
      <ul class="ct-set-list">
        <li>Your display name and the character you picked.</li>
        <li>Where you are in town — only to people who could see you there.</li>
        <li>Your voice and chat — only people in the same area or room.</li>
        <li>Never your character (unless the game reveals it), your account details or your passphrase.</li>
      </ul>
      {silenced.length > 0 && (
        <Row label="Silenced for you" wide help="Only you stop hearing them; they are not told.">
          <ul class="ct-set-people">
            {silenced.map((m) => (
              <li key={m.pid}>
                {m.displayName}{' '}
                <button
                  type="button"
                  class="ct-link"
                  onClick={() => {
                    voice?.setVolume(m.pid, 1);
                    bump((n) => n + 1);
                  }}
                >
                  Hear again
                </button>
              </li>
            ))}
          </ul>
        </Row>
      )}
      {ctx.conn && others.length > 0 && (
        <Row label="Report a player" help="Goes to the server admins with the lobby and the chat lines you received from them — never anyone's character.">
          <span class="ct-set-inline">
            <select value={reportPid} aria-label="Player to report" onChange={(e) => setReportPid((e.currentTarget as HTMLSelectElement).value)}>
              <option value="">Choose…</option>
              {others.map((m) => (
                <option key={m.pid} value={m.pid}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!reportPid}
              onClick={() => {
                const m = others.find((x) => x.pid === reportPid);
                if (m) setReporting({ pid: m.pid, name: m.displayName });
              }}
            >
              Report…
            </button>
          </span>
        </Row>
      )}
      <p class="ct-set-note">
        Hosts and the Storyteller can mute or remove people from {inGame ? 'People in the top bar' : 'the member list in the waiting room'}. You can also report a single chat line with its ! button.
      </p>
      <Row label="Your account" help="Download everything stored about you, or delete your account — on the home screen, in the Account panel.">
        <button
          type="button"
          onClick={() => {
            if (ctx.onLeave) ctx.onLeave(); // in game: asks first, keeps your seat
            else {
              ctx.close();
              goTo('/');
            }
          }}
        >
          {ctx.onLeave ? 'Leave to my account…' : 'Go to my account'}
        </button>
      </Row>
      {reporting && ctx.conn && <ReportDialog conn={ctx.conn} target={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}

function AboutSection({ close }: { close: () => void }) {
  return (
    <>
      <p class="ct-set-about">
        <b>Clocktower Town</b> — a little gothic town where friends play <i>Blood on the Clocktower</i> (Trouble Brewing) with a human Storyteller, walking
        and whispering by voice.
      </p>
      <p class="ct-set-note">An unofficial fan project. Blood on the Clocktower belongs to its creators.</p>
      <p class="ct-set-note">Your settings live in this browser only. They are never sent to the server; another browser or device starts with the defaults.</p>
      <button
        type="button"
        onClick={() => {
          close();
          openHelp();
        }}
      >
        How to play
      </button>
    </>
  );
}

