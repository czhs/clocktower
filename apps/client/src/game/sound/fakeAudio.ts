// Test double for WebAudio (no DOM needed). Every node creation, connection, parameter automation
// and source start/stop is appended to `log`, so two runs can be compared for byte-identical
// audible behaviour. Only used by apps/client/test/sound*.test.ts; never imported by the app.


export interface FakeAudio {
  ctx: AudioContext;
  log: string[];
  /** Files whose bytes were fetched, in order. */
  fetched: string[];
  /** Advance the audio clock (seconds). */
  advance(dt: number): void;
  /** Sources started so far: `<file>@<time>` (one-shots and loops). */
  starts(): string[];
  fetchBytes(url: string): Promise<ArrayBuffer>;
}

export function createFakeAudio(): FakeAudio {
  const log: string[] = [];
  const fetched: string[] = [];
  const startsList: string[] = [];
  let nextId = 1;
  const r = (v: number) => (Math.round(v * 1000) / 1000).toString();

  class Param {
    value: number;
    constructor(
      private owner: string,
      private name: string,
      v: number,
    ) {
      this.value = v;
    }
    private rec(op: string, ...a: number[]) {
      log.push(`${this.owner}.${this.name}.${op}(${a.map(r).join(',')})`);
      return this;
    }
    setValueAtTime(v: number, t: number) {
      this.value = v;
      return this.rec('set', v, t);
    }
    setTargetAtTime(v: number, t: number, tc: number) {
      this.value = v;
      return this.rec('target', v, t, tc);
    }
    linearRampToValueAtTime(v: number, t: number) {
      this.value = v;
      return this.rec('lin', v, t);
    }
    exponentialRampToValueAtTime(v: number, t: number) {
      this.value = v;
      return this.rec('exp', v, t);
    }
    cancelScheduledValues(t: number) {
      return this.rec('cancel', t);
    }
  }

  class Node {
    id: string;
    constructor(kind: string) {
      this.id = `${kind}#${nextId++}`;
      log.push(`new ${this.id}`);
    }
    connect(dest: any) {
      log.push(`${this.id}->${dest?.id ?? '?'}`);
      return dest;
    }
    disconnect() {
      log.push(`${this.id}-x`);
    }
  }
  class Gain extends Node {
    gain: Param;
    constructor() {
      super('gain');
      this.gain = new Param(this.id, 'gain', 1);
    }
  }
  class Filter extends Node {
    type = 'lowpass';
    frequency: Param;
    Q: Param;
    constructor() {
      super('filter');
      this.frequency = new Param(this.id, 'freq', 350);
      this.Q = new Param(this.id, 'q', 1);
    }
  }
  class Panner extends Node {
    pan: Param;
    constructor() {
      super('pan');
      this.pan = new Param(this.id, 'pan', 0);
    }
  }
  class Source extends Node {
    buffer: any = null;
    loop = false;
    loopStart = 0;
    loopEnd = 0;
    playbackRate: Param;
    onended: (() => void) | null = null;
    constructor() {
      super('src');
      this.playbackRate = new Param(this.id, 'rate', 1);
    }
    start(when = 0, offset = 0) {
      const name = this.buffer?.name ?? 'silence';
      log.push(`${this.id}.start(${name},${r(when)},${r(offset)},loop=${this.loop})`);
      if (this.buffer?.name) startsList.push(`${name}@${r(when)}`);
    }
    stop() {
      log.push(`${this.id}.stop`);
    }
  }
  class Osc extends Node {
    type = 'sine';
    frequency: Param;
    constructor() {
      super('osc');
      this.frequency = new Param(this.id, 'freq', 440);
    }
    start(t = 0) {
      log.push(`${this.id}.start(${r(t)})`);
      startsList.push(`synth@${r(t)}`);
    }
    stop() {
      log.push(`${this.id}.stop`);
    }
  }

  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: new Node('dest'),
    createGain: () => new Gain(),
    createBiquadFilter: () => new Filter(),
    createStereoPanner: () => new Panner(),
    createBufferSource: () => new Source(),
    createOscillator: () => new Osc(),
    createBuffer: (_c: number, len: number, sr: number) => ({ name: '', duration: len / sr }),
    resume: () => Promise.resolve(),
    decodeAudioData(bytes: ArrayBuffer) {
      const name = new TextDecoder().decode(bytes);
      return Promise.resolve({ name: name.replace(/^\/audio\//, '').replace(/\.(ogg|m4a)$/, ''), duration: 1 });
    },
  };

  return {
    ctx: ctx as unknown as AudioContext,
    log,
    fetched,
    advance(dt: number) {
      ctx.currentTime += dt;
    },
    starts: () => [...startsList],
    fetchBytes(url: string) {
      fetched.push(url);
      return Promise.resolve(new TextEncoder().encode(url).buffer as ArrayBuffer);
    },
  };
}
