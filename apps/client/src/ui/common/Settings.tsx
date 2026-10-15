import { useEffect, useRef, useState } from 'preact/hooks';
import { getAmbientVolume, getSfxVolume, setAmbientVolume, setSfxVolume } from '../../game/audio';
import { FX_QUALITY_KEY, readQualityPref, type FxQualityPref } from '../../game/fx/quality';
import { openHelp } from './HowToPlay';

// Small settings popover behind the gear button: ambient sound volume (separate from voice),
// sound-effects volume, graphics quality, how-to-play and "show tips again". All per-browser
// preferences; the sound engine (game/audio.ts) persists its own volumes.

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // ignore
  }
}

/** Re-apply the persisted ambience volume (the sound engine stores it in 'ct.ambientVolume'). */
export function applyAmbientVolume() {
  setAmbientVolume(getAmbientVolume());
}

const QUALITY: { v: FxQualityPref; label: string }[] = [
  { v: 'auto', label: 'Auto' },
  { v: 'low', label: 'Low' },
  { v: 'medium', label: 'Medium' },
  { v: 'high', label: 'High' },
];

function VolumeRow({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <label class="ct-settings-row">
      <span>
        {label} <small class="muted">{Math.round(value * 100)}%</small>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-label={`${label} volume`}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value) / 100)}
      />
      <small class="muted">{hint}</small>
    </label>
  );
}

const HINT_KEYS = ['ct.hint.move.v1', 'ct.help.seen.v1'];

export function SettingsButton({ onLeave, leaveLabel }: { onLeave?: () => void; leaveLabel?: string } = {}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div class="ct-settings" ref={root}>
      <button class="ct-tb-icon" aria-label="Settings" title="Settings" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        ⚙
      </button>
      {open && <SettingsPanel onClose={() => setOpen(false)} onLeave={onLeave} leaveLabel={leaveLabel} />}
    </div>
  );
}

function SettingsPanel({ onClose, onLeave, leaveLabel }: { onClose: () => void; onLeave?: () => void; leaveLabel?: string }) {
  const [vol, setVol] = useState(getAmbientVolume);
  const [sfx, setSfx] = useState(getSfxVolume);
  const [quality, setQuality] = useState<FxQualityPref>(readQualityPref);
  const [tipsReset, setTipsReset] = useState(false);
  return (
    <div class="ct-settings-panel panel" role="dialog" aria-label="Settings">
      <VolumeRow
        label="Town ambience"
        hint="Wind, birds, the fountain — kept under voice chat."
        value={vol}
        onChange={(v) => {
          setVol(v);
          setAmbientVolume(v);
        }}
      />
      <VolumeRow
        label="Sound effects"
        hint="Footsteps, doors, bells and votes. Voice volume is in the Voice panel."
        value={sfx}
        onChange={(v) => {
          setSfx(v);
          setSfxVolume(v);
        }}
      />
      <div class="ct-settings-row" role="radiogroup" aria-label="Graphics quality">
        <span>Graphics</span>
        <div class="ct-seg">
          {QUALITY.map((q) => (
            <button
              key={q.v}
              role="radio"
              aria-checked={quality === q.v}
              class={quality === q.v ? 'on' : ''}
              onClick={() => {
                setQuality(q.v);
                save(FX_QUALITY_KEY, q.v);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <small class="muted">Lower it if the town feels sluggish. Auto adjusts by itself.</small>
      </div>
      <div class="ct-settings-actions">
        <button
          onClick={() => {
            onClose();
            openHelp();
          }}
        >
          How to play
        </button>
        <button
          disabled={tipsReset}
          onClick={() => {
            for (const k of HINT_KEYS)
              try {
                localStorage.removeItem(k);
              } catch {
                // ignore
              }
            setTipsReset(true);
          }}
        >
          {tipsReset ? 'Tips will show again' : 'Show tips again'}
        </button>
        {onLeave && (
          <button
            class="ct-settings-leave"
            onClick={() => {
              onClose();
              onLeave();
            }}
          >
            {leaveLabel ?? 'Leave'}
          </button>
        )}
      </div>
    </div>
  );
}
