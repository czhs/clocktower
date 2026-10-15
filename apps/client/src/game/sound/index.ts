import type { PlayerGameView, S2CMessages, StorytellerGameView } from '@ct/protocol';
import { localPlayer as defaultLocal, remoteEntities as defaultRemotes, type LocalPlayerState } from '../../net/localPlayer';
import type { Store } from '../../net/store';
import type { ClipId } from './catalog';
import { browserFormats } from './codec';
import { GameCueTracker } from './cues';
import { SoundEngine } from './engine';
import { SoundDirector, type Entity } from './world';

// Wiring: one engine per page; attachSound(conn) connects it to a lobby connection for the life
// of the game screen. See docs/audio.md for the API and the night-leak rules.

export type Cue = S2CMessages['sound']['cue'];

/** What the voice client exposes for ducking: `voiceActivity` in apps/client/src/voice/VoiceClient.ts (~10 Hz). */
export interface VoiceActivity {
  anyoneSpeaking: boolean;
  /** 0..1 loudness of the loudest audible remote speaker (optional precision). */
  level: number;
}
export type VoiceActivityStore = Pick<Store<VoiceActivity>, 'get' | 'subscribe'>;

/** The parts of RoomConnection the sound system listens to. */
export interface SoundConn {
  events: { on<K extends 'sound' | 'world:teleport'>(type: K, fn: (p: S2CMessages[K]) => void): () => void };
  gameView: Pick<Store<PlayerGameView | StorytellerGameView | null>, 'get' | 'subscribe'>;
}

let engine: SoundEngine | null = null;

/** The page-wide engine (created lazily; the AudioContext itself only on unlock). */
export function soundEngine(): SoundEngine {
  return (engine ??= new SoundEngine({
    createContext: () => {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return AC ? new AC({ latencyHint: 'interactive' }) : null;
    },
    fetchBytes: async (url) => {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`audio ${r.status}`);
      return r.arrayBuffer();
    },
    formats: browserFormats,
    baseUrl: `${import.meta.env?.BASE_URL ?? '/'}audio/`,
    seed: (Math.random() * 2 ** 31) | 0,
  }));
}

/** Test hook: replace the page-wide engine. */
export function setSoundEngine(e: SoundEngine | null): void {
  engine = e;
}

// --- server cues ---------------------------------------------------------------------------

const lastCueAt = new WeakMap<SoundEngine, Map<string, number>>();

/**
 * Play a world cue (bell / dawn / toll / door / visit). Duplicates within 300 ms (audio clock) are
 * dropped, so TownScene's own playCue calls and attachSound's listeners never double up.
 */
export function playCue(cue: Cue, e: SoundEngine = soundEngine()): void {
  if (!e.running) return;
  let seen = lastCueAt.get(e);
  if (!seen) lastCueAt.set(e, (seen = new Map()));
  const now = e.now();
  const last = seen.get(cue);
  if (last !== undefined && now - last < 0.3 && now >= last) return;
  seen.set(cue, now);
  e.play(cue as ClipId);
}

// --- UI ------------------------------------------------------------------------------------

const UI_SELECTOR = 'button.primary, [data-sfx="click"]';

/**
 * Unlock audio on the first gesture and click softly on primary buttons (one delegated listener;
 * opt out with data-sfx="off" on the element or an ancestor). Returns an uninstaller.
 */
export function installUiSounds(root: Document = document, e: SoundEngine = soundEngine()): () => void {
  // Idempotent per document: main.tsx and attachSound may both install; one click = one sound.
  const existing = uiInstalls.get(root);
  if (existing) {
    existing.count++;
    return once(() => {
      if (--existing.count === 0) {
        existing.off();
        uiInstalls.delete(root);
      }
    });
  }
  const entry = { count: 1, off: listenUi(root, e) };
  uiInstalls.set(root, entry);
  return once(() => {
    if (--entry.count === 0) {
      entry.off();
      uiInstalls.delete(root);
    }
  });
}

const uiInstalls = new Map<Document, { count: number; off: () => void }>();
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      fn();
    }
  };
}

function listenUi(root: Document, e: SoundEngine): () => void {
  const unlock = () => e.unlock();
  const click = (ev: Event) => {
    const t = ev.target as Element | null;
    const el = t && typeof t.closest === 'function' ? t.closest(UI_SELECTOR) : null;
    if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-sfx="off"]')) return;
    e.unlock();
    e.play('click', { rate: 0.97 + Math.random() * 0.06 });
  };
  root.addEventListener('pointerdown', unlock, true);
  root.addEventListener('keydown', unlock, true);
  root.addEventListener('click', click, true);
  return () => {
    root.removeEventListener('pointerdown', unlock, true);
    root.removeEventListener('keydown', unlock, true);
    root.removeEventListener('click', click, true);
  };
}

// --- voice ducking -------------------------------------------------------------------------

let voiceSource: VoiceActivityStore | null = null;
const voiceSubs = new Set<(s: VoiceActivityStore | null) => void>();

/** Give the sound system the voice client's activity store (ambience ducks while anyone talks). */
export function setVoiceActivitySource(store: VoiceActivityStore | null): void {
  voiceSource = store;
  for (const fn of voiceSubs) fn(store);
}

/**
 * Pick up the voice client's `voiceActivity` store. Imported dynamically so the sound system (and
 * its unit tests) never pull LiveKit in by themselves; in the app the module is already loaded by
 * the voice panel, so this resolves to the same store instance.
 */
async function discoverVoiceActivity(): Promise<void> {
  if (voiceSource) return;
  try {
    const m = (await import('../../voice/VoiceClient')) as unknown as Record<string, unknown>;
    const s = m.voiceActivity as VoiceActivityStore | undefined;
    if (s && typeof s.get === 'function' && typeof s.subscribe === 'function') setVoiceActivitySource(s);
  } catch {
    // no voice client: no ducking
  }
}

// --- attach --------------------------------------------------------------------------------

export interface AttachOptions {
  engine?: SoundEngine;
  local?: Pick<Store<LocalPlayerState>, 'get'>;
  remotes?: Map<string, { x: number; y: number; location: LocalPlayerState['location'] }>;
  /** Frame scheduler; default requestAnimationFrame. Receives a callback taking ms. */
  schedule?: (fn: (ms: number) => void) => () => void;
  /** 'auto' = discover the voice client's `voiceActivity` export; null = no ducking. */
  voice?: VoiceActivityStore | null | 'auto';
  /** Document for the UI click/unlock listeners; null = none. */
  uiRoot?: Document | null;
  /** Seed for the director's random streams (tests). */
  seed?: number;
}

function rafLoop(fn: (ms: number) => void): () => void {
  let id = 0;
  const tick = (ms: number) => {
    fn(ms);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

/** Ducking hold: ambience stays dipped this long after the last speech (no pumping between words). */
const DUCK_HOLD_S = 0.5;

/**
 * Connect the sound system to a lobby connection: ambience + footsteps every frame, server cues,
 * door teleports, vote ticks / gavel / ghost from the public game view, voice ducking and UI
 * clicks. Returns a detach function (stops all sounds).
 */
export function attachSound(conn: SoundConn, opts: AttachOptions = {}): () => void {
  const e = opts.engine ?? soundEngine();
  const local = opts.local ?? defaultLocal;
  const remotes = opts.remotes ?? defaultRemotes;
  const director = new SoundDirector(e, opts.seed);
  const tracker = new GameCueTracker();
  const offs: (() => void)[] = [];
  let phase = conn.gameView.get()?.phase ?? 'waiting';

  // public game view: phase + cues
  const onView = (v: PlayerGameView | StorytellerGameView | null) => {
    phase = v?.phase ?? 'waiting';
    for (const c of tracker.next(v)) e.play(c.cue, { delay: c.delay });
  };
  onView(conn.gameView.get());
  offs.push(conn.gameView.subscribe(onView));

  // server cues (bell/dawn/toll public; visit is only ever sent to the visited player)
  offs.push(conn.events.on('sound', (s) => playCue(s.cue, e)));
  // our own door use
  let lastLoc = local.get().location;
  offs.push(
    conn.events.on('world:teleport', (t) => {
      if (t.reason === 'door' && t.location !== lastLoc) playCue('door', e);
      lastLoc = t.location;
    }),
  );

  // voice ducking
  let speakingUntil = -Infinity;
  let speakingNow = false;
  let speakingLevel = 0;
  let voiceOff: (() => void) | null = null;
  const useVoice = (s: VoiceActivityStore | null) => {
    voiceOff?.();
    voiceOff = null;
    speakingNow = false;
    if (!s) return;
    const apply = (a: VoiceActivity) => {
      speakingNow = !!a.anyoneSpeaking;
      if (speakingNow) speakingLevel = Math.min(1, Math.max(0, Number(a.level) || 0));
    };
    apply(s.get());
    voiceOff = s.subscribe(apply);
  };
  if (opts.voice === undefined || opts.voice === 'auto') {
    voiceSubs.add(useVoice);
    offs.push(() => voiceSubs.delete(useVoice));
    useVoice(voiceSource);
    void discoverVoiceActivity();
  } else useVoice(opts.voice);
  offs.push(() => voiceOff?.());

  // per-frame world sound
  const others: Entity[] = [];
  offs.push(
    (opts.schedule ?? rafLoop)((ms) => {
      const now = ms / 1000;
      const lp = local.get();
      others.length = 0;
      for (const [id, r] of remotes) others.push({ id, x: r.x, y: r.y, location: r.location });
      director.frame({ me: lp.pid ? { id: lp.pid, x: lp.x, y: lp.y, location: lp.location } : null, others, phase }, now);
      lastLoc = lp.location;
      if (speakingNow) speakingUntil = now + DUCK_HOLD_S;
      // Any audible speech dips ambience at least 70% of the way; louder speech dips it fully.
      e.setDuck(now < speakingUntil ? 0.7 + 0.3 * speakingLevel : 0);
    }),
  );

  if (opts.uiRoot !== null && typeof document !== 'undefined') offs.push(installUiSounds(opts.uiRoot ?? document, e));

  return () => {
    for (const off of offs.splice(0)) off();
    e.stopAll();
  };
}
