import { render, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getAmbientVolume, setAmbientVolume } from '../../game/audio';
import type { RoomConnection } from '../../net/room';
import { lazyComponent, whenIdle } from './lazy';

// (v2.3) ⚙ Settings: every per-browser player preference in one dialog, grouped into sections —
// Audio & voice · Graphics · Chat & social · Controls · Privacy & safety · About. This module is the
// small always-loaded part (gear button, openSettings(), the section list); the dialog itself
// (./SettingsDialog.tsx + Settings.css) is its own chunk, prefetched on idle. Preferences and their
// single stores: ./prefs.ts. Nothing here is sent to the server.

export type SettingsSection = 'audio' | 'graphics' | 'chat' | 'controls' | 'privacy' | 'about';
export const SECTIONS: { id: SettingsSection; label: string; glyph: string }[] = [
  { id: 'audio', label: 'Audio & voice', glyph: '♪' },
  { id: 'graphics', label: 'Graphics', glyph: '◐' },
  { id: 'chat', label: 'Chat & social', glyph: '✉' },
  { id: 'controls', label: 'Controls', glyph: '⌨' },
  { id: 'privacy', label: 'Privacy & safety', glyph: '◈' },
  { id: 'about', label: 'About', glyph: 'ℹ' },
];
const SETTINGS_EVENT = 'ct:settings';
const TAB_KEY = 'ct.settings.tab';

/** Open ⚙ Settings (at a section) from anywhere a SettingsButton is mounted, e.g. the voice panel. */
export function openSettings(section?: SettingsSection) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: section }));
}

/** Re-apply the persisted ambience volume (the sound engine stores it in 'ct.ambientVolume'). */
export function applyAmbientVolume() {
  setAmbientVolume(getAmbientVolume());
}

export const isSection = (v: unknown): v is SettingsSection => SECTIONS.some((s) => s.id === v);
function lastTab(): SettingsSection {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return isSection(v) ? v : 'audio';
  } catch {
    return 'audio';
  }
}
export function rememberTab(t: SettingsSection) {
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    // per-viewer convenience only
  }
}

export interface SettingsDialogProps {
  conn?: RoomConnection;
  start: SettingsSection;
  onClose: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
}

const SettingsDialog = lazyComponent<SettingsDialogProps>(
  () => import('./SettingsDialog').then((m) => m.SettingsDialog),
  (failed) =>
    failed ? (
      <div class="ct-help-backdrop">
        <div class="panel" role="alert">
          Settings could not be loaded. Check your connection and try again.
        </div>
      </div>
    ) : null,
  { reloadOnFail: false },
);

/** Render into <body>: the toolbar's button styling and stacking context must not apply. */
function BodyPortal({ children }: { children: ComponentChildren }) {
  const host = useMemo(() => document.createElement('div'), []);
  useEffect(() => {
    document.body.appendChild(host);
    return () => {
      render(null, host);
      host.remove();
    };
  }, [host]);
  useEffect(() => {
    render(<>{children}</>, host);
  });
  return null;
}

export function SettingsButton({ conn, onLeave, leaveLabel }: { conn?: RoomConnection; onLeave?: () => void; leaveLabel?: string } = {}) {
  const [open, setOpen] = useState<SettingsSection | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => whenIdle(() => void SettingsDialog.preload()), []);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      setOpen(isSection(d) ? d : lastTab());
    };
    window.addEventListener(SETTINGS_EVENT, on);
    return () => window.removeEventListener(SETTINGS_EVENT, on);
  }, []);
  const close = () => {
    setOpen(null);
    btn.current?.focus();
  };
  return (
    <>
      <button
        ref={btn}
        class="ct-tb-icon"
        aria-label="Settings"
        title="Settings"
        aria-expanded={!!open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(lastTab()))}
      >
        ⚙
      </button>
      {open && (
        <BodyPortal>
          <SettingsDialog conn={conn} start={open} onClose={close} onLeave={onLeave} leaveLabel={leaveLabel} />
        </BodyPortal>
      )}
    </>
  );
}
