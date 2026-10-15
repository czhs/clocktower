// Every clip ships as .ogg (Opus: Chrome, Firefox, Edge) and .m4a (AAC: Safari, everything else).
// Pick by canPlayType; the engine falls back to the other format if decoding ever fails.

export type AudioFormat = 'ogg' | 'm4a';

const MIME: Record<AudioFormat, string> = {
  ogg: 'audio/ogg; codecs="opus"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
};

/** Formats in order of preference for this browser. */
export function preferredFormats(canPlayType: ((mime: string) => string) | null): AudioFormat[] {
  if (!canPlayType) return ['m4a', 'ogg'];
  const ogg = safe(canPlayType, MIME.ogg);
  const m4a = safe(canPlayType, MIME.m4a);
  // Only trust Opus when the browser is sure: some Safari builds answer "maybe" for Ogg yet
  // cannot decode it with WebAudio. AAC is universally decodable, so it is the safe second choice.
  if (ogg === 'probably') return ['ogg', 'm4a'];
  if (m4a) return ['m4a', 'ogg'];
  return ['ogg', 'm4a'];
}

function safe(fn: (mime: string) => string, mime: string): string {
  try {
    return fn(mime) || '';
  } catch {
    return '';
  }
}

export function browserFormats(): AudioFormat[] {
  if (typeof document === 'undefined') return ['m4a', 'ogg'];
  const el = document.createElement('audio');
  return preferredFormats(typeof el.canPlayType === 'function' ? (m) => el.canPlayType(m) : null);
}
