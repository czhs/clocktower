// (v2.3, sec-ops) Server-side settings registry: ONE typed list of every security / abuse / cost
// knob, persisted in the DB (ops_flags rows `setting:<id>`), read through a cheap in-memory getter,
// changed only from the admin console (admin-only, audited old -> new, step-up for dangerous keys,
// rate-limited: moderation/admin.ts). The definitions live in ./defs.ts.
//
// Rules:
//   - An env var named by a definition WINS and the setting shows as "locked by server config".
//   - Values are validated against type / bounds / options on every write AND when loaded; an invalid
//     stored value is ignored (the default applies) and logged.
//   - Fail closed: if the store cannot be read at all, every key takes its SAFE value (`safe`, which
//     defaults to `default`) and the registry reports `degraded: true`.
//   - Changes apply live through each definition's `apply` hook (called once at boot with every value,
//     then on each change). Keys marked `applies: 'restart'` are read once when services start.
//   - NOT toggleable (by design, never in this list): per-viewer secrecy projections, authentication
//     and admin checks on every /api/admin route, the CSRF/content-type guard, server-side validation.

export type SettingType = 'bool' | 'enum' | 'int' | 'duration' | 'string';
export type SettingValue = boolean | number | string;
export type SettingGroup = 'signups' | 'sessions' | 'abuse' | 'voice' | 'chat' | 'browser';

export const SETTING_GROUPS: { id: SettingGroup; label: string }[] = [
  { id: 'signups', label: 'Sign-ups & accounts' },
  { id: 'sessions', label: 'Sessions & admin' },
  { id: 'abuse', label: 'Abuse protection' },
  { id: 'voice', label: 'Voice & cost' },
  { id: 'chat', label: 'Chat & moderation' },
  { id: 'browser', label: 'Browser hardening' },
];

export interface SettingDef {
  id: string;
  group: SettingGroup;
  label: string;
  help: string;
  type: SettingType;
  default: SettingValue;
  /** Value used when the store cannot be read (fail closed). Defaults to `default`. */
  safe?: SettingValue;
  min?: number;
  max?: number;
  /** enum options */
  options?: readonly string[];
  /** display unit for int / duration ('ms', 'minutes', 'bytes', …) */
  unit?: string;
  /** Env var that overrides (and locks) this setting. */
  envVar?: string;
  /** Parse the env var's raw text (default: by type). Return undefined to ignore it. */
  parseEnv?: (raw: string) => SettingValue | undefined;
  /** Never returned to the client (e.g. an invite code, a webhook URL with a token). */
  sensitive?: boolean;
  /** Changing it needs the admin's passphrase (step-up, AUTH-8). */
  dangerous?: boolean;
  /** 'live' (default) or 'restart' (read once when the server starts). */
  applies?: 'live' | 'restart';
  /** Team that owns the code reading this value. */
  owner: string;
  /** Validation beyond type/bounds (return an error message). */
  validate?: (v: SettingValue) => string | null;
  /** Pushes the value into the owning module (called at boot and after each change). */
  apply?: (v: SettingValue) => void;
  /** Externally stored setting (e.g. sec-voice's kill switch): the registry delegates to it. */
  external?: { get: () => SettingValue; set: (v: SettingValue) => void; locked?: () => boolean };
}

export interface SettingView {
  id: string;
  group: SettingGroup;
  label: string;
  help: string;
  type: SettingType;
  value: SettingValue | null;
  default: SettingValue | null;
  min?: number;
  max?: number;
  options?: readonly string[];
  unit?: string;
  locked: boolean;
  envVar?: string;
  /** For sensitive keys: whether a non-empty value is set (the value itself is never returned). */
  isSet?: boolean;
  sensitive: boolean;
  dangerous: boolean;
  applies: 'live' | 'restart';
  owner: string;
  isDefault: boolean;
}

export interface SettingsStore {
  /** All stored rows (key -> parsed JSON). Throws when the store is unreadable. */
  load(): Record<string, unknown>;
  save(key: string, value: unknown, adminAccountId: string): void;
}

export class SettingError extends Error {}

const PREFIX = 'setting:';

/** Coerces + validates a candidate value; throws SettingError with a friendly message. */
export function checkValue(def: SettingDef, v: unknown): SettingValue {
  switch (def.type) {
    case 'bool':
      if (typeof v !== 'boolean') throw new SettingError(`${def.label}: expected on/off`);
      break;
    case 'enum':
      if (typeof v !== 'string' || !def.options?.includes(v)) throw new SettingError(`${def.label}: expected one of ${def.options?.join(', ')}`);
      break;
    case 'int':
    case 'duration':
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new SettingError(`${def.label}: expected a whole number`);
      if (def.min !== undefined && v < def.min) throw new SettingError(`${def.label}: at least ${def.min}`);
      if (def.max !== undefined && v > def.max) throw new SettingError(`${def.label}: at most ${def.max}`);
      break;
    case 'string':
      if (typeof v !== 'string') throw new SettingError(`${def.label}: expected text`);
      if (def.max !== undefined && v.length > def.max) throw new SettingError(`${def.label}: at most ${def.max} characters`);
      if (def.min !== undefined && v.length > 0 && v.length < def.min) throw new SettingError(`${def.label}: at least ${def.min} characters (or empty)`);
      break;
  }
  const extra = def.validate?.(v as SettingValue);
  if (extra) throw new SettingError(`${def.label}: ${extra}`);
  return v as SettingValue;
}

function parseEnvDefault(def: SettingDef, raw: string): SettingValue | undefined {
  const t = raw.trim();
  if (def.type === 'bool') return /^(1|true|yes|on)$/i.test(t) ? true : /^(0|false|no|off)$/i.test(t) ? false : undefined;
  if (def.type === 'int' || def.type === 'duration') return /^-?\d+$/.test(t) ? Number(t) : undefined;
  return t;
}

export function createSettingsRegistry(deps: {
  defs: readonly SettingDef[];
  store: SettingsStore;
  env?: NodeJS.ProcessEnv;
  log?: { warn(msg: string, data?: Record<string, unknown>): void };
}) {
  const env = deps.env ?? process.env;
  const defs = new Map(deps.defs.map((d) => [d.id, d]));
  if (defs.size !== deps.defs.length) throw new Error('duplicate setting id');
  const values = new Map<string, SettingValue>();
  const envLocked = new Map<string, SettingValue>();
  const listeners = new Set<(id: string, v: SettingValue) => void>();
  let degraded = false;

  for (const d of deps.defs) {
    const raw = d.envVar ? env[d.envVar] : undefined;
    if (raw === undefined || raw === '') continue;
    try {
      const parsed = (d.parseEnv ?? ((r) => parseEnvDefault(d, r)))(raw);
      if (parsed !== undefined) envLocked.set(d.id, checkValue(d, parsed));
      else deps.log?.warn('settings: env value ignored (invalid)', { key: d.envVar });
    } catch {
      deps.log?.warn('settings: env value ignored (out of range)', { key: d.envVar });
    }
  }

  let stored: Record<string, unknown> = {};
  try {
    stored = deps.store.load();
  } catch (e) {
    degraded = true;
    deps.log?.warn('settings: store unreadable, using SAFE defaults', { err: e instanceof Error ? e.message : String(e) });
  }
  for (const d of deps.defs) {
    if (d.external) continue;
    let v: SettingValue = degraded ? (d.safe ?? d.default) : d.default;
    const k = PREFIX + d.id;
    if (!degraded && Object.prototype.hasOwnProperty.call(stored, k)) {
      try {
        v = checkValue(d, stored[k]);
      } catch {
        deps.log?.warn('settings: stored value ignored (invalid)', { id: d.id });
      }
    }
    values.set(d.id, v);
  }

  const effective = (d: SettingDef): SettingValue => {
    if (d.external) return d.external.get();
    return envLocked.get(d.id) ?? values.get(d.id) ?? d.default;
  };
  const isLocked = (d: SettingDef) => envLocked.has(d.id) || !!d.external?.locked?.();

  const applyOne = (d: SettingDef) => {
    if (!d.apply) return;
    try {
      d.apply(effective(d));
    } catch (e) {
      deps.log?.warn('settings: apply failed', { id: d.id, err: e instanceof Error ? e.message : String(e) });
    }
  };

  const registry = {
    get degraded() {
      return degraded;
    },
    /** Cheap getter (Map lookup). Unknown id -> throws (programming error). */
    get<T extends SettingValue = SettingValue>(id: string): T {
      const d = defs.get(id);
      if (!d) throw new Error(`unknown setting ${id}`);
      return effective(d) as T;
    },
    def(id: string): SettingDef | undefined {
      return defs.get(id);
    },
    isLocked(id: string): boolean {
      const d = defs.get(id);
      return !!d && isLocked(d);
    },
    /** Push every value into its module (call once after construction). */
    applyAll(): void {
      for (const d of deps.defs) applyOne(d);
    },
    /** Validates, persists, applies. Returns old and new value. */
    set(id: string, value: unknown, adminAccountId: string): { old: SettingValue; value: SettingValue } {
      const d = defs.get(id);
      if (!d) throw new SettingError(`Unknown setting '${id}'`);
      if (isLocked(d)) throw new SettingError(`${d.label} is locked by the server configuration${d.envVar ? ` (${d.envVar})` : ''}`);
      const v = checkValue(d, value);
      const old = effective(d);
      if (d.external) d.external.set(v);
      else {
        deps.store.save(PREFIX + id, v, adminAccountId);
        values.set(id, v);
      }
      applyOne(d);
      for (const fn of listeners) {
        try {
          fn(id, v);
        } catch {
          /* listener errors never break a write */
        }
      }
      return { old, value: v };
    },
    reset(id: string, adminAccountId: string) {
      const d = defs.get(id);
      if (!d) throw new SettingError(`Unknown setting '${id}'`);
      return registry.set(id, d.default, adminAccountId);
    },
    onChange(fn: (id: string, v: SettingValue) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    view(): SettingView[] {
      return deps.defs.map((d) => {
        const v = effective(d);
        const base = {
          id: d.id,
          group: d.group,
          label: d.label,
          help: d.help,
          type: d.type,
          min: d.min,
          max: d.max,
          options: d.options,
          unit: d.unit,
          locked: isLocked(d),
          envVar: d.envVar,
          sensitive: !!d.sensitive,
          dangerous: !!d.dangerous,
          applies: d.applies ?? 'live',
          owner: d.owner,
          isDefault: v === d.default,
        };
        return d.sensitive ? { ...base, value: null, default: null, isSet: v !== '' && v !== d.default } : { ...base, value: v, default: d.default };
      });
    },
  };
  return registry;
}

export type SettingsRegistry = ReturnType<typeof createSettingsRegistry>;
