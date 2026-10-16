// (v2.3, sec-ops) Settings registry: bounds, env override (locked), fail-closed defaults, live apply,
// sensitive masking. The admin endpoints are tested in ops.moderation.test.ts (shared server, port 3396).
import { describe, expect, it } from 'vitest';
import { createSettingsRegistry, SettingError, type SettingDef, type SettingsStore } from '../src/settings/registry.js';

const DEFS: SettingDef[] = [
  { id: 'a.int', group: 'abuse', label: 'An int', help: '', type: 'int', default: 10, min: 1, max: 100, owner: 't', envVar: 'T_A_INT' },
  { id: 'a.enum', group: 'chat', label: 'An enum', help: '', type: 'enum', options: ['x', 'y'], default: 'x', owner: 't' },
  { id: 'a.flag', group: 'browser', label: 'Protect', help: '', type: 'bool', default: true, safe: true, owner: 't' },
  { id: 'a.open', group: 'signups', label: 'Openness', help: '', type: 'enum', options: ['open', 'closed'], default: 'open', safe: 'closed', owner: 't' },
  { id: 'a.secret', group: 'voice', label: 'Secret', help: '', type: 'string', default: '', sensitive: true, owner: 't' },
];
const memStore = (rows: Record<string, unknown> = {}): SettingsStore & { rows: Record<string, unknown> } => ({
  rows,
  load: () => ({ ...rows }),
  save: (k, v) => {
    rows[k] = v;
  },
});

describe('settings registry (unit)', () => {
  it('validates type and bounds; persists and applies live', () => {
    const applied: unknown[] = [];
    const defs = DEFS.map((d) => (d.id === 'a.int' ? { ...d, apply: (v: unknown) => applied.push(v) } : d));
    const store = memStore();
    const r = createSettingsRegistry({ defs, store, env: {} });
    r.applyAll();
    expect(r.get('a.int')).toBe(10);
    expect(() => r.set('a.int', 0, 'adm')).toThrow(SettingError);
    expect(() => r.set('a.int', 101, 'adm')).toThrow(SettingError);
    expect(() => r.set('a.int', 1.5, 'adm')).toThrow(SettingError);
    expect(() => r.set('a.enum', 'z', 'adm')).toThrow(SettingError);
    expect(() => r.set('a.flag', 'yes', 'adm')).toThrow(SettingError);
    expect(r.set('a.int', 42, 'adm')).toEqual({ old: 10, value: 42 });
    expect(r.get('a.int')).toBe(42);
    expect(store.rows['setting:a.int']).toBe(42);
    expect(applied).toEqual([10, 42]);
    // a new registry over the same store sees the persisted value
    expect(createSettingsRegistry({ defs, store, env: {} }).get('a.int')).toBe(42);
  });

  it('env wins and locks; invalid env values are ignored', () => {
    const r = createSettingsRegistry({ defs: DEFS, store: memStore({ 'setting:a.int': 50 }), env: { T_A_INT: '7' } });
    expect(r.get('a.int')).toBe(7);
    expect(r.isLocked('a.int')).toBe(true);
    expect(() => r.set('a.int', 9, 'adm')).toThrow(/locked/);
    expect(r.view().find((v) => v.id === 'a.int')).toMatchObject({ locked: true, envVar: 'T_A_INT', value: 7 });
    const bad = createSettingsRegistry({ defs: DEFS, store: memStore(), env: { T_A_INT: '9999' } });
    expect(bad.get('a.int')).toBe(10);
    expect(bad.isLocked('a.int')).toBe(false);
  });

  it('fails closed: unreadable store -> SAFE values; a corrupt stored value -> default', () => {
    const broken: SettingsStore = {
      load: () => {
        throw new Error('disk gone');
      },
      save: () => undefined,
    };
    const r = createSettingsRegistry({ defs: DEFS, store: broken, env: {} });
    expect(r.degraded).toBe(true);
    expect(r.get('a.open')).toBe('closed');
    expect(r.get('a.flag')).toBe(true);
    const c = createSettingsRegistry({ defs: DEFS, store: memStore({ 'setting:a.int': 'lots', 'setting:a.enum': 'q' }), env: {} });
    expect(c.degraded).toBe(false);
    expect(c.get('a.int')).toBe(10);
    expect(c.get('a.enum')).toBe('x');
  });

  it('never returns sensitive values', () => {
    const r = createSettingsRegistry({ defs: DEFS, store: memStore(), env: {} });
    r.set('a.secret', 'hunter2-hook', 'adm');
    const v = r.view().find((x) => x.id === 'a.secret')!;
    expect(v.value).toBeNull();
    expect(v.isSet).toBe(true);
    expect(JSON.stringify(r.view())).not.toContain('hunter2');
  });
});

