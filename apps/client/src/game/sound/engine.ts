import { CLIPS, clipDef, clipFile, type BusName, type ClipId, type LoopId } from './catalog';
import type { AudioFormat } from './codec';
import { AMBIENT_DEFAULT, AMBIENT_KEY, clamp01, readVolume, SFX_DEFAULT, SFX_KEY, writeVolume } from './prefs';
import { synthCue, type SynthCue } from './synth';

// WebAudio engine: master <- {sfx, ui, amb -> duck} buses, decoded-buffer cache with lazy loading
// and release, capped one-shot voices, and smoothly crossfaded loops. It knows nothing about the
// game: the director (world.ts) and cue wiring (index.ts) decide what plays.

export interface EngineDeps {
  /** Create the AudioContext. Called from inside a user gesture (unlock). */
  createContext(): AudioContext | null;
  fetchBytes(url: string): Promise<ArrayBuffer>;
  formats(): AudioFormat[];
  /** URL prefix of the audio folder, e.g. '/audio/'. */
  baseUrl: string;
  /** Seed for the engine's own variation (loop start offsets). */
  seed?: number;
}

export interface PlayOpts {
  /** Linear gain multiplier on top of the clip's mix gain. */
  gain?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
  /** Playback rate (pitch variation). */
  rate?: number;
  /** Seconds from now. */
  delay?: number;
  /** 1-based variant for clips with variants. */
  variant?: number;
  /** Optional low-pass cutoff in Hz (muffled through walls). */
  lowpass?: number;
}

export interface LoopOpts {
  /** Low-pass cutoff in Hz; omit for an open sound. */
  lowpass?: number;
  /** Keep (or start) the buffer loaded even at level 0: the player is approaching the area. */
  warm?: boolean;
}

/** Max simultaneous one-shot voices across all buses. */
export const MAX_VOICES = 14;
/** A silent loop voice is stopped after this many seconds… */
const LOOP_STOP_AFTER = 6;
/** …and its decoded buffer released after this many seconds out of range. */
const LOOP_RELEASE_AFTER = 30;
const LEVEL_EPS = 0.0005;
const OPEN_LOWPASS = 20000;
/** Ducked ambience gain = 1 - DUCK_DEPTH * duck (about -7 dB at full duck). */
const DUCK_DEPTH = 0.55;

interface Entry {
  buf: AudioBuffer | null;
  promise: Promise<AudioBuffer | null> | null;
  failed: boolean;
}
interface Voice {
  clip: ClipId;
  src: AudioBufferSourceNode;
  nodes: AudioNode[];
  ended: boolean;
}
interface LoopVoice {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  level: number;
  lowpass: number;
  silentSince: number | null;
}
interface LoopState {
  level: number;
  lowpass: number;
  warm: boolean;
  /** ctx time when the loop was last wanted (level > 0 or warm). */
  wantedAt: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SoundEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: Record<BusName, GainNode> | null = null;
  private duckNode: GainNode | null = null;
  private ambVol = readVolume(AMBIENT_KEY, AMBIENT_DEFAULT);
  private sfxVol = readVolume(SFX_KEY, SFX_DEFAULT);
  private masterVol = 1;
  private duck = 0;
  private fmts: AudioFormat[] | null = null;
  private buffers = new Map<string, Entry>();
  private voices: Voice[] = [];
  private loops = new Map<LoopId, LoopVoice>();
  private loopState = new Map<LoopId, LoopState>();
  private rng: () => number;

  constructor(private deps: EngineDeps) {
    this.rng = mulberry32(deps.seed ?? 0x5eed);
  }

  /** True once the context exists and is running (sounds can be heard). */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture (pointerdown/keydown):
   * browsers refuse to start audio otherwise. Safe to call repeatedly.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = this.deps.createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.duckNode = ctx.createGain();
    this.duckNode.connect(this.master);
    this.bus = { sfx: ctx.createGain(), ui: ctx.createGain(), amb: ctx.createGain() };
    this.bus.sfx.connect(this.master);
    this.bus.ui.connect(this.master);
    this.bus.amb.connect(this.duckNode);
    this.applyVolumes(true);
    // iOS: a (silent) buffer played inside the gesture fully unlocks output.
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.master);
      s.start();
    } catch {
      // ignore
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    this.preload();
  }

  // ---------------------------------------------------------------------------------------
  // volumes

  setAmbientVolume(v: number, persist = true): void {
    this.ambVol = clamp01(v);
    if (persist) writeVolume(AMBIENT_KEY, this.ambVol);
    this.applyVolumes();
  }
  getAmbientVolume(): number {
    return this.ambVol;
  }
  setSfxVolume(v: number, persist = true): void {
    this.sfxVol = clamp01(v);
    if (persist) writeVolume(SFX_KEY, this.sfxVol);
    this.applyVolumes();
  }
  getSfxVolume(): number {
    return this.sfxVol;
  }
  setMasterVolume(v: number): void {
    this.masterVol = clamp01(v);
    this.applyVolumes();
  }

  /** 0 = nobody speaking, 1 = full duck. Ambience dips quickly and recovers slowly. */
  setDuck(amount: number): void {
    const a = clamp01(amount);
    if (Math.abs(a - this.duck) < 0.01) return;
    const down = a > this.duck;
    this.duck = a;
    if (!this.ctx || !this.duckNode) return;
    this.duckNode.gain.setTargetAtTime(1 - DUCK_DEPTH * a, this.ctx.currentTime, down ? 0.08 : 0.6);
  }

  private applyVolumes(immediate = false): void {
    if (!this.ctx || !this.bus || !this.master) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => (immediate ? g.gain.setValueAtTime(v, t) : g.gain.setTargetAtTime(v, t, 0.05));
    // Perceptual-ish curves; ambience tops out well under voice chat.
    set(this.bus.amb, 0.7 * this.ambVol);
    set(this.bus.sfx, this.sfxVol);
    set(this.bus.ui, 0.6 * this.sfxVol);
    set(this.master, this.masterVol);
    if (immediate && this.duckNode) this.duckNode.gain.setValueAtTime(1 - DUCK_DEPTH * this.duck, t);
  }

  // ---------------------------------------------------------------------------------------
  // loading

  private formats(): AudioFormat[] {
    return (this.fmts ??= this.deps.formats());
  }

  /** Decoded buffer for a file path, or null if not (yet) available. Starts loading if needed. */
  private buffer(file: string): AudioBuffer | null {
    const e = this.buffers.get(file);
    if (e?.buf) return e.buf;
    if (!e) void this.load(file);
    return null;
  }

  load(file: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(file);
    if (existing?.buf) return Promise.resolve(existing.buf);
    if (existing?.promise) return existing.promise;
    if (existing?.failed || !this.ctx) return Promise.resolve(null);
    const entry: Entry = { buf: null, promise: null, failed: false };
    this.buffers.set(file, entry);
    entry.promise = (async () => {
      for (const fmt of this.formats()) {
        try {
          const bytes = await this.deps.fetchBytes(`${this.deps.baseUrl}${file}.${fmt}`);
          const buf = await this.decode(bytes);
          // A format that decodes becomes the preference for later files.
          if (this.fmts && this.fmts[0] !== fmt) this.fmts = [fmt, ...this.fmts.filter((f) => f !== fmt)];
          if (this.buffers.get(file) === entry) entry.buf = buf;
          entry.promise = null;
          return buf;
        } catch {
          // try the next format
        }
      }
      entry.failed = true;
      entry.promise = null;
      return null;
    })();
    return entry.promise;
  }

  private decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ctx!;
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  /** Fetch every small preload clip (footsteps, doors, cues, ticks, clicks): about 150 KB. */
  preload(): void {
    for (const id of Object.keys(CLIPS) as ClipId[]) {
      const d = clipDef(id);
      if (!d.preload) continue;
      for (let v = 1; v <= (d.variants ?? 1); v++) void this.load(clipFile(id, v));
    }
  }

  /** Paths currently decoded (for tests and the debug overlay). */
  loadedFiles(): string[] {
    return [...this.buffers.entries()].filter(([, e]) => e.buf).map(([f]) => f);
  }

  // ---------------------------------------------------------------------------------------
  // one-shots

  /** Play a clip once. Returns false if audio is locked or the clip is not decoded yet. */
  play(id: ClipId, opts: PlayOpts = {}): boolean {
    if (!this.running || !this.bus) return false;
    const ctx = this.ctx!;
    const d = clipDef(id);
    const buf = this.buffer(clipFile(id, opts.variant ?? 1));
    if (!buf) {
      if (id === 'bell' || id === 'toll' || id === 'dawn' || id === 'door' || id === 'visit') {
        synthCue(ctx, this.bus[d.bus], id as SynthCue, ctx.currentTime + 0.02 + (opts.delay ?? 0));
        return true;
      }
      return false;
    }
    this.reap();
    const same = this.voices.filter((v) => v.clip === id);
    if (d.maxVoices && same.length >= d.maxVoices) this.kill(same[0]!);
    if (this.voices.length >= MAX_VOICES) this.kill(this.voices[0]!);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate && opts.rate !== 1) src.playbackRate.value = opts.rate;
    const g = ctx.createGain();
    g.gain.value = d.gain * (opts.gain ?? 1);
    const nodes: AudioNode[] = [src, g];
    let tail: AudioNode = src;
    if (opts.lowpass && opts.lowpass < OPEN_LOWPASS) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpass;
      tail.connect(f);
      tail = f;
      nodes.push(f);
    }
    tail.connect(g);
    tail = g;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(this.bus[d.bus]);
    const voice: Voice = { clip: id, src, nodes, ended: false };
    src.onended = () => {
      voice.ended = true;
      for (const n of nodes) n.disconnect();
    };
    this.voices.push(voice);
    src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
    return true;
  }

  private kill(v: Voice): void {
    try {
      v.src.stop();
    } catch {
      // already stopped
    }
    v.ended = true;
    this.voices = this.voices.filter((x) => x !== v);
  }

  private reap(): void {
    if (this.voices.some((v) => v.ended)) this.voices = this.voices.filter((v) => !v.ended);
  }

  activeVoices(): number {
    this.reap();
    return this.voices.length;
  }

  // ---------------------------------------------------------------------------------------
  // loops

  /**
   * Set a loop's target level (0..1, before the clip gain and the ambience bus). Levels crossfade
   * smoothly; a loop is fetched only once wanted (level > 0 or warm), stopped after a few silent
   * seconds and its buffer released after LOOP_RELEASE_AFTER seconds out of range.
   */
  setLoop(id: LoopId, level: number, opts: LoopOpts = {}): void {
    const lv = clamp01(level);
    const lowpass = opts.lowpass ?? OPEN_LOWPASS;
    const now = this.now();
    const prev = this.loopState.get(id);
    const wanted = lv > LEVEL_EPS || !!opts.warm;
    this.loopState.set(id, { level: lv, lowpass, warm: !!opts.warm, wantedAt: wanted ? now : (prev?.wantedAt ?? now) });
    if (!this.ctx || !this.bus) return;
    const d = clipDef(id);
    const file = clipFile(id);
    const voice = this.loops.get(id);
    if (wanted && !voice) {
      const buf = this.buffer(file);
      if (buf && lv > LEVEL_EPS && this.running) this.startLoop(id, buf, lv, lowpass);
      return;
    }
    if (!voice) {
      // Out of range for long enough: forget the decoded buffer (memory) — it is re-fetched lazily.
      const st = this.loopState.get(id)!;
      if (!wanted && now - st.wantedAt > LOOP_RELEASE_AFTER && this.buffers.get(file)?.buf) this.buffers.delete(file);
      return;
    }
    const t = this.ctx.currentTime;
    if (Math.abs(voice.level - lv) > 0.002) {
      voice.gain.gain.setTargetAtTime(lv * d.gain, t, 1.0);
      voice.level = lv;
    }
    if (Math.abs(voice.lowpass - lowpass) > 1) {
      voice.filter.frequency.setTargetAtTime(lowpass, t, 0.35);
      voice.lowpass = lowpass;
    }
    if (lv > LEVEL_EPS) voice.silentSince = null;
    else {
      voice.silentSince ??= now;
      if (now - voice.silentSince > LOOP_STOP_AFTER) this.stopLoop(id, voice);
    }
  }

  private startLoop(id: LoopId, buf: AudioBuffer, level: number, lowpass: number): void {
    const ctx = this.ctx!;
    const d = clipDef(id);
    const loop = d.loop!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = loop.pad;
    src.loopEnd = loop.pad + loop.period;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(level * d.gain, t, 1.0);
    src.connect(filter).connect(gain).connect(this.bus!.amb);
    // Start somewhere random in the loop so two areas never phase together.
    src.start(t, loop.pad + this.rng() * loop.period);
    this.loops.set(id, { src, filter, gain, level, lowpass, silentSince: null });
  }

  private stopLoop(id: LoopId, v: LoopVoice): void {
    try {
      v.src.stop();
    } catch {
      // ignore
    }
    v.src.disconnect();
    v.filter.disconnect();
    v.gain.disconnect();
    this.loops.delete(id);
  }

  /** Loops with a live voice (for tests and debugging). */
  activeLoops(): LoopId[] {
    return [...this.loops.keys()];
  }

  /** Stop everything (leaving the game). Buffers stay cached. */
  stopAll(): void {
    for (const [id, v] of this.loops) this.stopLoop(id, v);
    for (const v of [...this.voices]) this.kill(v);
    this.loopState.clear();
    this.setDuck(0);
  }
}
