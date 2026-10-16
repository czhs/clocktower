// OWNED BY voice. Push-to-talk binding: key or mouse button (middle / back / forward).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachMousePtt, buttonsBit, isPttMouseButton, mouseCode, normalizePttCode, parsePtt, pttLabel } from '../src/voice/ptt';
import { shortcutAllowed } from '../src/ui/hud/logic';

describe('ptt binding parse / store / back-compat', () => {
  it('existing stored key codes keep working', () => {
    expect(parsePtt('KeyV')).toEqual({ kind: 'key', code: 'KeyV' });
    expect(parsePtt('Space')).toEqual({ kind: 'key', code: 'Space' });
    expect(normalizePttCode('KeyH')).toBe('KeyH');
  });
  it('mouse middle / back / forward are allowed; left and right never', () => {
    expect(parsePtt('Mouse1')).toEqual({ kind: 'mouse', button: 1 });
    expect(parsePtt('Mouse3')).toEqual({ kind: 'mouse', button: 3 });
    expect(parsePtt('Mouse4')).toEqual({ kind: 'mouse', button: 4 });
    expect(parsePtt('Mouse0')).toBeNull();
    expect(parsePtt('Mouse2')).toBeNull();
    expect(parsePtt('Mouse5')).toBeNull();
    expect(parsePtt('MouseX')).toBeNull();
    expect([0, 1, 2, 3, 4, 5].filter(isPttMouseButton)).toEqual([1, 3, 4]);
  });
  it('invalid / missing values fall back to V', () => {
    for (const v of [undefined, null, 3, '', 'Mouse0', 'Mouse2', 'a b', 'x'.repeat(30), { kind: 'mouse' }]) expect(normalizePttCode(v)).toBe('KeyV');
  });
  it('round-trips mouse codes', () => {
    for (const b of [1, 3, 4] as const) expect(parsePtt(mouseCode(b))).toEqual({ kind: 'mouse', button: b });
  });
  it('labels', () => {
    expect(pttLabel('KeyV')).toBe('V');
    expect(pttLabel('Digit5')).toBe('5');
    expect(pttLabel('ShiftLeft')).toBe('Shift');
    expect(pttLabel('Mouse1')).toBe('Middle click');
    expect(pttLabel('Mouse3')).toBe('Mouse 4 (back)');
    expect(pttLabel('Mouse4')).toBe('Mouse 5 (forward)');
  });
  it('HUD shortcut guard only reserves the PTT code when it is a key', () => {
    const k = (code: string) => ({ code, key: code.slice(-1).toLowerCase(), repeat: false, ctrlKey: false, metaKey: false, altKey: false });
    expect(shortcutAllowed(k('KeyV'), null, { modalOpen: false, pttCode: 'KeyV' })).toBe(false);
    expect(shortcutAllowed(k('KeyV'), null, { modalOpen: false, pttCode: 'Mouse3' })).toBe(true);
    expect(shortcutAllowed(k('KeyM'), null, { modalOpen: false, pttCode: 'Mouse1' })).toBe(true);
  });
  it('buttons bitmask', () => {
    expect([buttonsBit(1), buttonsBit(3), buttonsBit(4)]).toEqual([4, 8, 16]);
  });
});

// --- window listeners, on a fake window (node: EventTarget) -----------------------------------

function ev(type: string, init: { button?: number; buttons?: number } = {}) {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, 'button', { value: init.button ?? 0 });
  Object.defineProperty(e, 'buttons', { value: init.buttons ?? 0 });
  return e;
}

describe('attachMousePtt', () => {
  let w: EventTarget & { history: { go: ReturnType<typeof vi.fn> } };
  let doc: EventTarget & { visibilityState: string };
  let state: { code: string; mode: 'ptt' | 'open'; held: boolean };
  let off: () => void;
  beforeEach(() => {
    w = Object.assign(new EventTarget(), { history: { go: vi.fn() } });
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', doc);
    state = { code: 'Mouse3', mode: 'ptt', held: false };
    off = attachMousePtt(
      { code: () => state.code, active: () => state.mode === 'ptt', held: () => state.held, set: (h) => (state.held = h) },
      w as unknown as Window,
    );
  });
  afterEach(() => {
    off();
    vi.unstubAllGlobals();
  });

  it('holds while the bound button is down and prevents its default', () => {
    const d = ev('mousedown', { button: 3 });
    w.dispatchEvent(d);
    expect(state.held).toBe(true);
    expect(d.defaultPrevented).toBe(true);
    const u = ev('mouseup', { button: 3 });
    w.dispatchEvent(u);
    expect(state.held).toBe(false);
    expect(u.defaultPrevented).toBe(true);
    const a = ev('auxclick', { button: 3 });
    w.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(true);
  });

  it('ignores other buttons, and everything outside push-to-talk mode', () => {
    for (const b of [0, 1, 2, 4]) {
      const d = ev('mousedown', { button: b });
      w.dispatchEvent(d);
      expect(d.defaultPrevented).toBe(false);
    }
    expect(state.held).toBe(false);
    state.mode = 'open';
    const d = ev('mousedown', { button: 3 });
    w.dispatchEvent(d);
    expect(state.held).toBe(false);
    expect(d.defaultPrevented).toBe(false);
  });

  it('key bindings: mouse buttons do nothing', () => {
    state.code = 'KeyV';
    w.dispatchEvent(ev('mousedown', { button: 1 }));
    expect(state.held).toBe(false);
  });

  it('never sticks: blur, hidden tab, or a move without the button releases', () => {
    w.dispatchEvent(ev('mousedown', { button: 3 }));
    w.dispatchEvent(ev('blur'));
    expect(state.held).toBe(false);
    w.dispatchEvent(ev('mousedown', { button: 3 }));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(ev('visibilitychange'));
    expect(state.held).toBe(false);
    w.dispatchEvent(ev('mousedown', { button: 3 }));
    w.dispatchEvent(ev('mousemove', { buttons: 8 })); // still down (left the window, still held)
    expect(state.held).toBe(true);
    w.dispatchEvent(ev('mousemove', { buttons: 0 })); // released somewhere we didn't see
    expect(state.held).toBe(false);
  });

  it('undoes a back navigation right after the bound back button, before the app sees it', () => {
    const app = vi.fn();
    w.addEventListener('popstate', app);
    w.dispatchEvent(ev('mousedown', { button: 3 }));
    w.dispatchEvent(ev('mouseup', { button: 3 }));
    w.dispatchEvent(ev('popstate'));
    expect(w.history.go).toHaveBeenCalledWith(1);
    w.dispatchEvent(ev('popstate')); // the undo itself
    expect(app).not.toHaveBeenCalled();
    // later, ordinary history navigation reaches the app
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 10_000);
    w.dispatchEvent(ev('popstate'));
    expect(app).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
