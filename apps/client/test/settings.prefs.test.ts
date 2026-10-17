// (v2.3 settings) Player preference registry: defaults, read/write, reset, migration of stored
// values (ct.fxQuality, ct.talkOutline, ct.reducedMotion, volumes, ct.voice.prefs), corrupted and
// blocked storage. apps/client/src/ui/common/prefs.ts
import { describe, expect, it } from 'vitest';
import {
  migratePrefs,
  parseVoicePrefs,
  PREF_DEFAULTS,
  readPref,
  readPrefs,
  readVoicePrefs,
  resetHints,
  resetPrefs,
  VOICE_PREFS_KEY,
  writePref,
  writeVoicePrefs,
  type PrefStorage,
} from '../src/ui/common/prefs';

function mem(init: Record<string, string> = {}): PrefStorage & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}
const blocked: PrefStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('defaults', () => {
  it('empty storage reads every default', () => {
    expect(readPrefs(mem())).toEqual(PREF_DEFAULTS);
    expect(PREF_DEFAULTS).toEqual({ ambientVolume: 0.25, sfxVolume: 0.7, fxQuality: 'auto', graphics: 'auto', talkOutline: 'behind', reducedMotion: 'system', pinColor: 'gold' });
  });
  it('null / blocked storage falls back to defaults and never throws', () => {
    expect(readPrefs(null)).toEqual(PREF_DEFAULTS);
    expect(readPrefs(blocked)).toEqual(PREF_DEFAULTS);
    expect(() => writePref(blocked, 'fxQuality', 'low')).not.toThrow();
    expect(() => resetPrefs(blocked)).not.toThrow();
    expect(() => migratePrefs(blocked)).not.toThrow();
    expect(() => resetHints(blocked)).not.toThrow();
    expect(readVoicePrefs(blocked).pttKey).toBe('KeyV');
  });
});

describe('read / write use the owners’ keys and formats', () => {
  it('round-trips through the existing keys', () => {
    const s = mem();
    writePref(s, 'fxQuality', 'medium');
    writePref(s, 'talkOutline', 'top');
    writePref(s, 'reducedMotion', 'on');
    writePref(s, 'ambientVolume', 0.4);
    writePref(s, 'pinColor', 'teal');
    expect(Object.fromEntries(s.m)).toEqual({ 'ct.fxQuality': 'medium', 'ct.talkOutline': 'top', 'ct.reducedMotion': '1', 'ct.ambientVolume': '0.4', 'ct.social.pinColor': 'teal' });
    expect(readPrefs(s)).toMatchObject({ fxQuality: 'medium', talkOutline: 'top', reducedMotion: 'on', ambientVolume: 0.4, pinColor: 'teal' });
  });
  it('reduced motion: off is stored as 0, "match device" removes the key (OS decides)', () => {
    const s = mem();
    writePref(s, 'reducedMotion', 'off');
    expect(s.m.get('ct.reducedMotion')).toBe('0');
    writePref(s, 'reducedMotion', 'system');
    expect(s.m.has('ct.reducedMotion')).toBe(false);
  });
  it('volumes are clamped to 0..1', () => {
    const s = mem();
    writePref(s, 'sfxVolume', 7);
    expect(readPref(s, 'sfxVolume')).toBe(1);
    writePref(s, 'sfxVolume', -2);
    expect(readPref(s, 'sfxVolume')).toBe(0);
  });
});

describe('corrupted values', () => {
  it('unknown or garbage values read as defaults', () => {
    const s = mem({ 'ct.fxQuality': 'ultra', 'ct.talkOutline': '{', 'ct.reducedMotion': 'maybe', 'ct.ambientVolume': 'loud', 'ct.sfxVolume': '', 'ct.social.pinColor': 'pink' });
    expect(readPrefs(s)).toEqual(PREF_DEFAULTS);
  });
  it('corrupt voice JSON → voice defaults; wrong field types are fixed one by one', () => {
    expect(parseVoicePrefs('{not json')).toEqual({ inputMode: 'ptt', pttKey: 'KeyV', deviceId: null, outputId: null, crowdMute: true, volumes: {} });
    expect(parseVoicePrefs('[1,2]').inputMode).toBe('ptt');
    expect(parseVoicePrefs('null').crowdMute).toBe(true);
    const p = parseVoicePrefs(JSON.stringify({ inputMode: 'open', pttKey: 42, deviceId: 'default', outputId: 'abc', crowdMute: false, volumes: { a: 0, b: 9, c: 'x' } }));
    expect(p).toEqual({ inputMode: 'open', pttKey: 'KeyV', deviceId: null, outputId: 'abc', crowdMute: false, volumes: { a: 0, b: 1.5 } });
  });
});

describe('migration of stored values', () => {
  it('canonicalises legacy spellings and drops values equal to the default', () => {
    const s = mem({ 'ct.fxQuality': ' HIGH ', 'ct.talkOutline': 'TOP', 'ct.reducedMotion': 'true', 'ct.ambientVolume': '1.7', 'ct.social.pinColor': 'gold' });
    const changed = migratePrefs(s);
    expect(Object.fromEntries(s.m)).toEqual({ 'ct.fxQuality': 'high', 'ct.talkOutline': 'top', 'ct.reducedMotion': '1', 'ct.ambientVolume': '1' });
    expect(changed.sort()).toEqual(['ct.ambientVolume', 'ct.fxQuality', 'ct.reducedMotion', 'ct.social.pinColor', 'ct.talkOutline']);
  });
  it('removes unreadable values so every reader agrees on the default', () => {
    const s = mem({ 'ct.fxQuality': 'ultra', 'ct.reducedMotion': 'off' });
    migratePrefs(s);
    expect(s.m.has('ct.fxQuality')).toBe(false);
    expect(s.m.get('ct.reducedMotion')).toBe('0');
  });
  it('rewrites ct.voice.prefs in canonical form, keeping per-person volumes', () => {
    const s = mem({ [VOICE_PREFS_KEY]: JSON.stringify({ pttKey: 'Mouse1', inputMode: 'nope', volumes: { p1: 0, p2: 0.5 }, junk: true }) });
    expect(migratePrefs(s)).toEqual([VOICE_PREFS_KEY]);
    expect(JSON.parse(s.m.get(VOICE_PREFS_KEY)!)).toEqual({ inputMode: 'ptt', pttKey: 'Mouse1', deviceId: null, outputId: null, crowdMute: true, volumes: { p1: 0, p2: 0.5 } });
  });
  it('corrupt voice JSON is replaced by the defaults', () => {
    const s = mem({ [VOICE_PREFS_KEY]: '{oops' });
    migratePrefs(s);
    expect(readVoicePrefs(s)).toMatchObject({ inputMode: 'ptt', pttKey: 'KeyV' });
    expect(() => JSON.parse(s.m.get(VOICE_PREFS_KEY)!)).not.toThrow();
  });
  it('is idempotent', () => {
    const s = mem({ 'ct.fxQuality': 'Low', 'ct.talkOutline': 'top', [VOICE_PREFS_KEY]: '{"inputMode":"open"}' });
    migratePrefs(s);
    const snap = Object.fromEntries(s.m);
    expect(migratePrefs(s)).toEqual([]);
    expect(Object.fromEntries(s.m)).toEqual(snap);
  });
});

describe('reset', () => {
  it('restores every default but keeps silenced people, tips state and unrelated keys', () => {
    const s = mem({
      'ct.fxQuality': 'low',
      'ct.talkOutline': 'top',
      'ct.reducedMotion': '1',
      'ct.ambientVolume': '0.9',
      'ct.sfxVolume': '0.1',
      'ct.social.pinColor': 'black',
      [VOICE_PREFS_KEY]: JSON.stringify({ inputMode: 'open', pttKey: 'KeyB', deviceId: 'mic1', outputId: 'spk1', crowdMute: false, volumes: { p1: 0 } }),
      'ct.hint.move.v1': '1',
      'ct.finder.filters': '{"x":1}',
      'ct.st.dock': 'left',
    });
    expect(resetPrefs(s)).toEqual(PREF_DEFAULTS);
    expect(readPrefs(s)).toEqual(PREF_DEFAULTS);
    expect(readVoicePrefs(s)).toEqual({ inputMode: 'ptt', pttKey: 'KeyV', deviceId: null, outputId: null, crowdMute: true, volumes: { p1: 0 } });
    expect(s.m.get('ct.hint.move.v1')).toBe('1');
    expect(s.m.get('ct.finder.filters')).toBe('{"x":1}');
    expect(s.m.get('ct.st.dock')).toBe('left');
  });
  it('does not create voice prefs that were never stored', () => {
    const s = mem();
    resetPrefs(s);
    expect(s.m.size).toBe(0);
  });
  it('resetHints clears only the first-visit hint flags', () => {
    const s = mem({ 'ct.hint.move.v1': '1', 'ct.hint.social.v1': '1', 'ct.help.seen.v1': '1', 'ct.intro.seen.v1': '1' });
    resetHints(s);
    expect(Object.fromEntries(s.m)).toEqual({ 'ct.intro.seen.v1': '1' });
  });
});

describe('voice prefs without a running voice client', () => {
  it('writeVoicePrefs patches and keeps the rest', () => {
    const s = mem({ [VOICE_PREFS_KEY]: JSON.stringify({ inputMode: 'open', volumes: { p: 0.3 } }) });
    writeVoicePrefs(s, { pttKey: 'Space' });
    expect(readVoicePrefs(s)).toMatchObject({ inputMode: 'open', pttKey: 'Space', volumes: { p: 0.3 } });
  });
});
