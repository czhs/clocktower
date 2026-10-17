// Chat speech bubbles — pure logic (v2.2). Rendering lives in ./bubbles.ts.
//
// A `chat:message` this client already received (the server delivers lobby chat to the lobby and
// in-game chat only to the sender's acoustic zone, exactly like voice) is also shown as a small
// bubble over the sender's avatar — but only when that avatar is one we are rendering right now.
// Nothing here creates an avatar, reveals a position or sends anything: a message from someone we
// cannot see stays in the chat panel only. 'storyteller' / 'system' messages never bubble.
import type { ChatMessage } from '@ct/protocol';

export const SPEECH = {
  /** Characters kept before the ellipsis. */
  maxChars: 80,
  /** Soft line width (characters) and line cap. */
  lineChars: 28,
  maxLines: 4,
  /** Display time: base + per char, clamped (fade included). */
  minMs: 5000,
  maxMs: 7000,
  perCharMs: 25,
  fadeInMs: 140,
  fadeOutMs: 600,
  /** Bubbles shown at once (the oldest gives way); fewer on the low render tier. */
  maxBubbles: 6,
  maxBubblesLow: 4,
  /** Messages older than this on arrival (server clock) are not bubbled (stale replays). */
  staleMs: 15000,
} as const;

const ELLIPSIS = '…';
// C0/C1 controls, zero-width and bidi overrides: never let them reshape the bubble.
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Whether a message may bubble at all (scope + sender), before the visibility check. */
export function bubbleScope(m: Pick<ChatMessage, 'scope' | 'fromPid'>): m is { scope: 'lobby' | 'zone'; fromPid: string } {
  return (m.scope === 'lobby' || m.scope === 'zone') && typeof m.fromPid === 'string' && m.fromPid.length > 0;
}

/** One line of display text: whitespace collapsed, controls stripped, cut at maxChars with an ellipsis. */
export function bubbleText(raw: string, maxChars: number = SPEECH.maxChars): string {
  const t = raw.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(t); // code points: never split a surrogate pair
  if (chars.length <= maxChars) return t;
  return chars.slice(0, maxChars - 1).join('').trimEnd() + ELLIPSIS;
}

/** Greedy word wrap to `lineChars`; over-long words are broken; more than `maxLines` ends in an ellipsis. */
export function wrapLines(text: string, lineChars: number = SPEECH.lineChars, maxLines: number = SPEECH.maxLines): string[] {
  const lines: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const word of text.split(' ')) {
    let w = Array.from(word);
    // an over-long word gets lines of its own
    while (w.length > lineChars) {
      if (cur) lines.push(cur);
      lines.push(w.slice(0, lineChars).join(''));
      w = w.slice(lineChars);
      cur = '';
      curLen = 0;
    }
    if (!w.length) continue;
    if (!cur) {
      cur = w.join('');
      curLen = w.length;
    } else if (curLen + 1 + w.length <= lineChars) {
      cur += ' ' + w.join('');
      curLen += 1 + w.length;
    } else {
      lines.push(cur);
      cur = w.join('');
      curLen = w.length;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = Array.from(kept[maxLines - 1]!);
    kept[maxLines - 1] = (last.length >= lineChars ? last.slice(0, lineChars - 1).join('') : last.join('')).trimEnd() + ELLIPSIS;
    return kept;
  }
  return lines;
}

/** How long a bubble stays (ms), scaled with its length. */
export function bubbleDurationMs(text: string): number {
  const n = Array.from(text).length;
  return Math.max(SPEECH.minMs, Math.min(SPEECH.maxMs, SPEECH.minMs + n * SPEECH.perCharMs));
}

/** Opacity at `now`: quick fade in, fade out over the last fadeOutMs; 0 once expired. */
export function bubbleAlpha(b: Pick<SpeechBubble, 'born' | 'until'>, now: number, still = false): number {
  if (now >= b.until) return 0;
  const out = Math.min(1, (b.until - now) / SPEECH.fadeOutMs);
  const inn = still ? 1 : Math.min(1, Math.max(0, now - b.born) / SPEECH.fadeInMs);
  return Math.max(0, Math.min(out, inn));
}

export interface SpeechBubble {
  pid: string;
  /** Message id (a replaced bubble gets the new id). */
  id: string;
  /** Wrapped display text ('\n'-joined). */
  text: string;
  born: number;
  until: number;
  /** Bumped on every replacement: the renderer redraws only when this changes. */
  rev: number;
}

/**
 * Live bubbles, one per speaker. `add` replaces that speaker's bubble; past the cap the oldest
 * bubble gives way. `visible(pid)` is the renderer's "am I drawing this avatar right now" check.
 */
export class SpeechBook {
  readonly list: SpeechBubble[] = [];
  private rev = 0;

  add(m: Pick<ChatMessage, 'id' | 'fromPid' | 'text' | 'scope'>, now: number, visible: (pid: string) => boolean, cap: number = SPEECH.maxBubbles, keep: string | null = null): SpeechBubble | null {
    if (!bubbleScope(m) || !visible(m.fromPid)) return null;
    const one = bubbleText(m.text);
    if (!one) return null;
    const text = wrapLines(one).join('\n');
    const until = now + bubbleDurationMs(one);
    let b = this.list.find((x) => x.pid === m.fromPid);
    if (b) {
      // replacement: move to the end (newest), keep the slot object
      this.list.splice(this.list.indexOf(b), 1);
      b.id = m.id;
      b.text = text;
      b.born = now;
      b.until = until;
      b.rev = ++this.rev;
    } else b = { pid: m.fromPid, id: m.id, text, born: now, until, rev: ++this.rev };
    this.list.push(b);
    this.trim(cap, keep);
    return b;
  }

  /** Drop expired bubbles and those whose avatar is no longer drawn. Returns how many remain. */
  prune(now: number, visible: (pid: string) => boolean): number {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]!;
      if (now >= b.until || !visible(b.pid)) this.list.splice(i, 1);
    }
    return this.list.length;
  }

  /** Keep at most `cap` bubbles: the oldest go first, but `keep`'s (your own) bubble stays. */
  trim(cap: number, keep: string | null = null) {
    for (let i = 0; this.list.length > Math.max(1, cap) && i < this.list.length; ) {
      if (this.list[i]!.pid === keep) i++;
      else this.list.splice(i, 1);
    }
  }

  clear() {
    this.list.length = 0;
  }
}

/** A bubble's box in world px: centred on `x`, bottom edge at `y - lift`. */
export interface BubbleBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Output: how far the box is raised to clear older bubbles. */
  lift: number;
}

/**
 * Raise boxes (given oldest first) so none overlaps one placed before it: each newer bubble climbs
 * above the older bubbles it would cover. Mutates `lift`; no allocations.
 */
export function stackBubbles(boxes: readonly BubbleBox[], n: number = boxes.length, gap = 1, maxLift = 200): void {
  for (let i = 0; i < n; i++) {
    const b = boxes[i]!;
    b.lift = 0;
    // repeat until a pass makes no move (a lift can create a new overlap with another older box)
    for (let pass = 0; pass < n; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const o = boxes[j]!;
        if (Math.abs(b.x - o.x) * 2 >= b.w + o.w + gap * 2) continue;
        const bTop = b.y - b.lift - b.h;
        const bBot = b.y - b.lift;
        const oTop = o.y - o.lift - o.h;
        const oBot = o.y - o.lift;
        if (bBot <= oTop - gap || bTop >= oBot + gap) continue;
        b.lift = Math.min(maxLift, b.y - (oTop - gap));
        moved = true;
      }
      if (!moved || b.lift >= maxLift) break;
    }
  }
}
