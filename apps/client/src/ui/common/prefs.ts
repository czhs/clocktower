// (v2.3 settings) Player preferences: one typed registry over the per-browser localStorage keys.
//
// Every preference keeps the key its owner module already reads (the town polls fx quality, talking
// outlines and reduced motion about once a second; the sound engine and the voice client read their
// own keys), so this file is the single description of *what* is stored, its default and how a
// stored value is parsed — not a second copy of the state. The Settings panel reads and writes
// through here and then calls the owner's live API (sound engine, voice client, social store).
//
// Pure: no DOM, no Preact; storage is passed in (tests use a Map-backed fake). Every access is
// wrapped: blocked storage (private mode, sandboxed previews) silently falls back to defaults.
// Nothing here is ever sent to the server.
import { PIN_COLORS, type PinColor } from '@ct/protocol';
import { FX_QUALITY_KEY, type FxQualityPref } from '../../game/fx/quality';
import { TALK_OUTLINE_KEY, type TalkOutlineMode } from '../../game/fx/talkingPref';
import { REDUCED_MOTION_KEY } from '../../game/fx/motion';
import { AMBIENT_DEFAULT, AMBIENT_KEY, SFX_DEFAULT, SFX_KEY } from '../../game/sound/prefs';
import { PIN_COLOR_KEY } from '../../game/social/logic';
import { normalizePttCode, PTT_DEFAULT } from '../../voice/ptt';

export type PrefStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** window.localStorage, or null when it is unavailable / throws on access. */
export function safeStorage(): PrefStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function get(s: PrefStorage | null | undefined, k: string): string | null {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function put(s: PrefStorage | null | undefined, k: string, v: string | null): void {
  try {
    if (v === null) s?.removeItem(k);
    else s?.setItem(k, v);
  } catch {
    /* storage blocked or full: the choice just isn't remembered */
  }
}

export type ReducedMotionPref = 'system' | 'on' | 'off';
export const FX_QUALITY_PREFS: readonly FxQualityPref[] = ['auto', 'low', 'medium', 'high'];

interface PrefDef<T> {
  key: string;
  def: T;
  /** Stored string → value (anything unknown or malformed → the default). */
  parse(raw: string | null): T;
  /** Value → stored string; null removes the key (the owner then uses its own default). */
  serialize(v: T): string | null;
}

const volume = (key: string, def: number): PrefDef<number> => ({
  key,
  def,
  parse(raw) {
    if (raw === null || raw.trim() === '') return def;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : def;
  },
  serialize: (v) => String(Math.min(1, Math.max(0, Number.isFinite(v) ? v : def))),
});

/** The simple (one key = one value) preferences. */
export const PREFS = {
  ambientVolume: volume(AMBIENT_KEY, AMBIENT_DEFAULT),
  sfxVolume: volume(SFX_KEY, SFX_DEFAULT),
  fxQuality: {
    key: FX_QUALITY_KEY,
    def: 'auto',
    parse: (raw) => {
      const v = raw?.trim().toLowerCase();
      return (FX_QUALITY_PREFS as readonly string[]).includes(v ?? '') ? (v as FxQualityPref) : 'auto';
    },
    serialize: (v) => v,
  } as PrefDef<FxQualityPref>,
  talkOutline: {
    key: TALK_OUTLINE_KEY,
    def: 'behind',
    parse: (raw) => (raw?.trim().toLowerCase() === 'top' ? 'top' : 'behind'),
    serialize: (v) => v,
  } as PrefDef<TalkOutlineMode>,
  reducedMotion: {
    key: REDUCED_MOTION_KEY,
    def: 'system',
    // game/fx/motion.ts accepts '1' | 'true' | 'on' and '0' | 'false' | 'off'; unset = follow the OS
    parse: (raw) => {
      const v = raw?.trim().toLowerCase();
      if (v === '1' || v === 'true' || v === 'on') return 'on';
      if (v === '0' || v === 'false' || v === 'off') return 'off';
      return 'system';
    },
    serialize: (v) => (v === 'on' ? '1' : v === 'off' ? '0' : null),
  } as PrefDef<ReducedMotionPref>,
  pinColor: {
    key: PIN_COLOR_KEY,
    def: 'gold',
    parse: (raw) => ((PIN_COLORS as readonly string[]).includes(raw ?? '') ? (raw as PinColor) : 'gold'),
    serialize: (v) => v,
  } as PrefDef<PinColor>,
} satisfies Record<string, PrefDef<unknown>>;

export type PrefName = keyof typeof PREFS;
export type PrefValues = { [K in PrefName]: (typeof PREFS)[K]['def'] };

export function readPref<K extends PrefName>(s: PrefStorage | null | undefined, name: K): PrefValues[K] {
  const d = PREFS[name] as PrefDef<PrefValues[K]>;
  return d.parse(get(s, d.key));
}

export function writePref<K extends PrefName>(s: PrefStorage | null | undefined, name: K, v: PrefValues[K]): void {
  const d = PREFS[name] as PrefDef<PrefValues[K]>;
  put(s, d.key, d.serialize(v));
}

export function readPrefs(s: PrefStorage | null | undefined): PrefValues {
  const out = {} as Record<string, unknown>;
  for (const name of Object.keys(PREFS) as PrefName[]) out[name] = readPref(s, name);
  return out as PrefValues;
}

export const PREF_DEFAULTS: PrefValues = Object.fromEntries(Object.entries(PREFS).map(([k, d]) => [k, d.def])) as PrefValues;

// ------------------------------------------------------------------------------------ voice

/** 'ct.voice.prefs' (JSON, owned by voice/VoiceClient.ts): the fields Settings shows. */
export const VOICE_PREFS_KEY = 'ct.voice.prefs';
export interface VoicePrefs {
  inputMode: 'ptt' | 'open';
  pttKey: string;
  deviceId: string | null;
  outputId: string | null;
  crowdMute: boolean;
  /** Per-person volume (pid → 0..1.5; 0 = silenced for me). Never reset by "Reset to defaults". */
  volumes: Record<string, number>;
}
export const VOICE_DEFAULTS: Readonly<Omit<VoicePrefs, 'volumes'>> = { inputMode: 'ptt', pttKey: PTT_DEFAULT, deviceId: null, outputId: null, crowdMute: true };

function parseVolumes(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [pid, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[pid] = Math.min(1.5, Math.max(0, n));
  return out;
}
const deviceOf = (v: unknown) => (typeof v === 'string' && v && v !== 'default' ? v : null);

/** Same rules as VoiceClient.loadPrefs (corrupt JSON or wrong types → defaults, field by field). */
export function parseVoicePrefs(raw: string | null): VoicePrefs {
  let p: Record<string, unknown> = {};
  try {
    const j: unknown = raw ? JSON.parse(raw) : {};
    if (j && typeof j === 'object' && !Array.isArray(j)) p = j as Record<string, unknown>;
  } catch {
    /* corrupt: defaults */
  }
  return {
    inputMode: p.inputMode === 'open' ? 'open' : 'ptt',
    pttKey: normalizePttCode(p.pttKey),
    deviceId: deviceOf(p.deviceId),
    outputId: deviceOf(p.outputId),
    crowdMute: p.crowdMute !== false,
    volumes: parseVolumes(p.volumes),
  };
}

export function readVoicePrefs(s: PrefStorage | null | undefined): VoicePrefs {
  return parseVoicePrefs(get(s, VOICE_PREFS_KEY));
}

/** Patch the stored voice prefs (used only when no voice client is running to do it live). */
export function writeVoicePrefs(s: PrefStorage | null | undefined, patch: Partial<VoicePrefs>): void {
  put(s, VOICE_PREFS_KEY, JSON.stringify({ ...readVoicePrefs(s), ...patch }));
}

// ------------------------------------------------------------------------------------ tips

/** "Show tips again": first-visit hints (moving, the emote dock, the how-to-play nudge). */
export const HINT_KEYS = ['ct.hint.move.v1', 'ct.hint.social.v1', 'ct.help.seen.v1'] as const;
export function resetHints(s: PrefStorage | null | undefined): void {
  for (const k of HINT_KEYS) put(s, k, null);
}

// ------------------------------------------------------------------------------------ reset / migrate

/**
 * Reset every preference to its default (storage only; the caller applies them live). Keeps on
 * purpose: per-person voice volumes / silenced people (a social choice, not a setting), which tips
 * were seen (own button), the lobby-finder filters and the Storyteller panel layout.
 */
export function resetPrefs(s: PrefStorage | null | undefined): PrefValues {
  for (const name of Object.keys(PREFS) as PrefName[]) put(s, PREFS[name].key, null);
  const v = readVoicePrefs(s);
  if (get(s, VOICE_PREFS_KEY) !== null) put(s, VOICE_PREFS_KEY, JSON.stringify({ ...v, ...VOICE_DEFAULTS }));
  return { ...PREF_DEFAULTS };
}

/**
 * One-time tidy-up of stored values written by older builds or by hand: odd spellings
 * ('HIGH', 'true', ' top '), out-of-range volumes and corrupt JSON are rewritten in canonical form
 * (or removed when they were unreadable), so every reader agrees. Values that already parse to the
 * default are removed rather than stored. Safe to call on every open. Returns the keys it changed.
 */
export function migratePrefs(s: PrefStorage | null | undefined): string[] {
  const changed: string[] = [];
  for (const name of Object.keys(PREFS) as PrefName[]) {
    const d = PREFS[name] as PrefDef<unknown>;
    const raw = get(s, d.key);
    if (raw === null) continue;
    const v = d.parse(raw);
    const canon = d.serialize(v);
    const next = v === d.def && name !== 'ambientVolume' && name !== 'sfxVolume' ? null : canon;
    if (next !== raw) {
      put(s, d.key, next);
      changed.push(d.key);
    }
  }
  const rawVoice = get(s, VOICE_PREFS_KEY);
  if (rawVoice !== null) {
    const canon = JSON.stringify(parseVoicePrefs(rawVoice));
    if (canon !== rawVoice) {
      put(s, VOICE_PREFS_KEY, canon);
      changed.push(VOICE_PREFS_KEY);
    }
  }
  return changed;
}
