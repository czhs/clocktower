// Hostile-client case catalogue (security v2.3, area 4: game secrecy vs modified clients).
//
// Everything here is DERIVED FROM THE PROTOCOL `C2S` MAP so a new message type (or a new StCommand
// variant) is covered automatically:
//   * `validSamples(type)`   — schema-valid payloads, built by walking the Zod 4 schema (one per
//                              discriminated-union option, e.g. every StCommand `type`);
//   * `hostileCases(type)`   — schema-INVALID mutations of those samples: every leaf replaced by wrong
//                              types / NaN / ±Infinity / negative / huge numbers / oversized strings /
//                              unicode tricks / prototype-pollution objects, required keys removed,
//                              whole-payload garbage;
//   * `benignOddities(type)` — odd but tolerated inputs (extra keys, own `__proto__` / `constructor`
//                              keys): the schema strips them, the test asserts they never take effect.
// `catalogueGaps()` lists types (or union options) the walker could not build a valid sample for; the
// coverage test fails on any gap, so a new type must either be walkable or get a HAND_SAMPLES entry.
import { C2S, type C2SType } from '../../packages/protocol/src/index.js';

type Json = unknown;
type Schema = { safeParse(v: unknown): { success: boolean; data?: unknown }; _zod?: { def: Def } };
interface Def {
  type: string;
  shape?: Record<string, Schema>;
  innerType?: Schema;
  element?: Schema;
  options?: Schema[];
  entries?: Record<string, string | number>;
  values?: unknown[];
  in?: Schema;
  out?: Schema;
  catchall?: Schema;
}

export const C2S_TYPES = Object.keys(C2S) as C2SType[];
const schemaOf = (type: C2SType) => (C2S as unknown as Record<string, Schema>)[type]!;
const defOf = (s: Schema): Def => (s as { _zod: { def: Def } })._zod.def;

/** Hand-written samples for anything the generic walker cannot satisfy (refinements etc.). */
const HAND_SAMPLES: Partial<Record<C2SType, Json[]>> = {
  'notebook:save': [{ matchId: 'm_probe', rev: 1, data: { text: 'probe', seats: [{ seat: 0, note: 'hm', guess: 'imp', mark: 'unsure' }] } }],
};

const STRING_CANDIDATES = ['abcd', 'a', 'trouble-brewing', 'villager', 'abcdefghijkl', 'x'.repeat(40)];
const NUMBER_CANDIDATES = [1, 0, 5, 10, 15, 2, 0.5, 20, 60, 100, 3, 30];

/** A schema-valid value for `s` (best effort; null when none of the candidates fit). */
export function sampleOf(s: Schema, depth = 0): Json | undefined {
  if (depth > 12) return undefined;
  const d = defOf(s);
  const ok = (v: unknown) => s.safeParse(v).success;
  const first = (cands: unknown[]) => cands.find(ok);
  switch (d.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.shape ?? {})) {
        const vd = defOf(v);
        if (vd.type === 'optional') continue; // minimal sample: required keys only
        const x = sampleOf(v, depth + 1);
        if (x === undefined) return undefined;
        out[k] = x;
      }
      return ok(out) ? out : undefined;
    }
    case 'optional':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'catch':
    case 'nonoptional':
      return sampleOf(d.innerType!, depth + 1);
    case 'nullable':
      return sampleOf(d.innerType!, depth + 1) ?? null;
    case 'pipe':
      return first(STRING_CANDIDATES) ?? (d.in ? sampleOf(d.in, depth + 1) : undefined);
    case 'string':
      return first(STRING_CANDIDATES);
    case 'number':
    case 'int':
      return first(NUMBER_CANDIDATES);
    case 'boolean':
      return true;
    case 'enum':
      return Object.values(d.entries ?? {})[0];
    case 'literal':
      return d.values?.[0];
    case 'array': {
      for (let n = 0; n <= 15; n++) {
        const el = sampleOf(d.element!, depth + 1);
        if (el === undefined) return undefined;
        // distinct-ish elements (seats must often be unique)
        const arr = Array.from({ length: n }, (_, i) => (typeof el === 'number' ? i : el));
        if (ok(arr)) return arr;
      }
      return undefined;
    }
    case 'union': {
      for (const o of d.options ?? []) {
        const x = sampleOf(o, depth + 1);
        if (x !== undefined && ok(x)) return x;
      }
      return undefined;
    }
    case 'unknown':
    case 'any':
      return null;
    default:
      return undefined;
  }
}

/** Options of a (discriminated) union at the top level, else the schema itself. */
function topOptions(s: Schema): Schema[] {
  const d = defOf(s);
  return d.type === 'union' && d.options?.length ? d.options : [s];
}

/** Schema-valid payloads for `type` (one per top-level union option). */
export function validSamples(type: C2SType): Json[] {
  if (HAND_SAMPLES[type]) return HAND_SAMPLES[type]!;
  const s = schemaOf(type);
  return topOptions(s)
    .map((o) => sampleOf(o))
    .filter((x) => x !== undefined && s.safeParse(x).success);
}

/** Union options of `type` that have no valid sample (coverage gaps). */
export function catalogueGaps(): string[] {
  const gaps: string[] = [];
  for (const type of C2S_TYPES) {
    if (HAND_SAMPLES[type]) continue;
    const opts = topOptions(schemaOf(type));
    opts.forEach((o, i) => {
      const x = sampleOf(o);
      if (x === undefined || !schemaOf(type).safeParse(x).success) gaps.push(`${type}#${i}`);
    });
  }
  return gaps;
}

// ---- mutations --------------------------------------------------------------------------------

export const NASTY_STRINGS = [
  '‮gnp.exe', // RTL override
  'a​‌‍﻿b', // zero-width
  '\u0000\u0001\u001F', // control chars
  'ｓｔｏｒｙｔｅｌｌｅｒ', // fullwidth
  '😀'.repeat(50),
  '<img src=x onerror=alert(1)>',
  '../../etc/passwd',
  '%s%n%x',
  '\uD800', // lone surrogate
];

/** Values that are wrong for (almost) every leaf. */
export const BAD_LEAVES: unknown[] = [
  null,
  'str',
  123,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  1e300,
  true,
  [],
  {},
  'x'.repeat(20_000),
  [...Array(2000).keys()],
  { $ne: null },
];

/** Whole-payload garbage (applies to every type). */
export function garbagePayloads(): unknown[] {
  const protoObj = JSON.parse('{"__proto__":{"polluted":"yes","isHost":true,"role":"storyteller"},"constructor":{"prototype":{"polluted":"yes"}}}');
  return [undefined, null, 'string', 42, -0, Number.NaN, true, [], [1, 2, 3], {}, protoObj, { type: 'kill', seat: 0 }, { nested: JSON.parse('['.repeat(64) + ']'.repeat(64)) }];
}

type Path = (string | number)[];

function leafPaths(v: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (v !== null && typeof v === 'object') {
    const entries = Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v);
    if (!entries.length) out.push(path);
    for (const [k, x] of entries) leafPaths(x, [...path, k], out);
  } else out.push(path);
  return out;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const copy = clone(root) as Record<string | number, unknown>;
  let cur = copy;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string | number, unknown>;
  cur[path.at(-1)!] = value;
  return copy;
}

function deleteAt(root: unknown, path: Path): unknown {
  const copy = clone(root) as Record<string | number, unknown>;
  let cur = copy;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string | number, unknown>;
  if (Array.isArray(cur)) cur.splice(Number(path.at(-1)), 1);
  else delete cur[path.at(-1)!];
  return copy;
}

export interface HostileCase {
  type: C2SType;
  label: string;
  payload: unknown;
}

/** Schema-INVALID payloads for `type` (each one is checked: the schema rejects it). */
export function hostileCases(type: C2SType): HostileCase[] {
  const s = schemaOf(type);
  const out: HostileCase[] = [];
  const add = (label: string, payload: unknown) => {
    if (!s.safeParse(payload ?? {}).success) out.push({ type, label, payload });
  };
  for (const g of garbagePayloads()) add(`garbage:${typeof g}`, g);
  for (const sample of validSamples(type)) {
    const tag = (sample as { type?: string })?.type ?? '';
    for (const p of leafPaths(sample)) {
      const where = `${tag}${tag ? '.' : ''}${p.join('.') || '<root>'}`;
      BAD_LEAVES.forEach((bad, i) => add(`${where}=bad[${i}]`, setAt(sample, p, bad)));
      NASTY_STRINGS.forEach((str, i) => add(`${where}=nasty[${i}]`, setAt(sample, p, str)));
      if (p.length) add(`${where} removed`, deleteAt(sample, p));
    }
  }
  return out;
}

/** Odd-but-schema-valid inputs that must be stripped / ignored (extra keys, prototype keys). */
export function benignOddities(type: C2SType): HostileCase[] {
  const s = schemaOf(type);
  const out: HostileCase[] = [];
  for (const sample of validSamples(type)) {
    if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) continue;
    const variants: [string, unknown][] = [
      ['extra keys', { ...sample, isHost: true, role: 'storyteller', seat: 0, pid: 'p_victim', accountId: 'a_x' }],
      ['own __proto__', Object.assign(JSON.parse('{"__proto__":{"polluted":"yes","isHost":true}}'), sample)],
      ['own constructor', { ...sample, constructor: { prototype: { polluted: 'yes' } } }],
    ];
    for (const [label, payload] of variants) if (s.safeParse(payload).success) out.push({ type, label, payload });
  }
  return out;
}

/** Numeric leaves of valid samples that accept `value` (unbounded fields). */
export function numericFieldsAccepting(value: number): string[] {
  const hits = new Set<string>();
  for (const type of C2S_TYPES) {
    const s = schemaOf(type);
    for (const sample of validSamples(type)) {
      const tag = (sample as { type?: string })?.type ?? '';
      for (const p of leafPaths(sample)) {
        let cur: unknown = sample;
        for (const k of p) cur = (cur as Record<string | number, unknown>)[k];
        if (typeof cur !== 'number') continue;
        if (s.safeParse(setAt(sample, p, value)).success) hits.add(`${type}${tag ? `[${tag}]` : ''}.${p.join('.')}`);
      }
    }
  }
  return [...hits].sort();
}

/** Types whose schema accepts ANY extra payload (passthrough): flagged for review. */
export function passthroughTypes(): string[] {
  return C2S_TYPES.filter((t) => {
    const r = schemaOf(t).safeParse({ zz_unexpected: 'x'.repeat(100) });
    return r.success && (r.data as Record<string, unknown> | undefined)?.zz_unexpected !== undefined;
  });
}

/** Round-robin pacing per message type (stays under the room's per-type token buckets). */
export const PACE_PER_SEC: Partial<Record<C2SType, number>> = {
  move: 25,
  'chat:send': 1.8,
  'voice:status': 0.9,
  'voice:announce': 1.8,
  'notebook:save': 0.45,
  'notebook:load': 0.18,
  'social:emote': 1.8,
  'social:pin': 1, // shares one bucket with unpin / clearPins (3/s)
  'social:unpin': 1,
  'social:clearPins': 0.9,
};
export const DEFAULT_PACE_PER_SEC = 9;
