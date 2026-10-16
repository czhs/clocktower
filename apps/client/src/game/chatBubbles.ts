// A visual echo of server-delivered chat. The chat log remains the accessible, permanent copy.
// Anchors come from the rendered avatars (including indoor scale and interpolation), never from
// raw world positions or door boards. No bubble survives losing sight of its speaker.
import type { LocationId } from '@ct/protocol';
import type { RoomConnection } from '../net/room';
import './chatBubbles.css';

const LIFETIME_MS = 5000;
const MAX_PER_SPEAKER = 3;
const EDGE = 8;

interface Anchor {
  /** CSS pixels in the canvas host, just above the avatar's name. */
  x: number;
  y: number;
}

interface Bubble {
  el: HTMLDivElement;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

interface Stack {
  el: HTMLDivElement;
  location: LocationId;
  messages: Bubble[];
}

export interface ChatBubbles {
  update(): void;
  clear(): void;
  destroy(): void;
}

export function createChatBubbles(
  host: HTMLElement,
  conn: RoomConnection,
  ctx: { location(): LocationId; anchor(pid: string): Anchor | null },
): ChatBubbles {
  const root = document.createElement('div');
  root.className = 'ct-chat-bubbles';
  // ChatPanel's live log already announces the same messages to screen readers.
  root.setAttribute('aria-hidden', 'true');
  host.append(root);
  const bubbles = new Map<string, Stack>();

  function remove(pid: string) {
    const b = bubbles.get(pid);
    if (!b) return;
    for (const msg of b.messages) clearTimeout(msg.timer);
    b.el.remove();
    bubbles.delete(pid);
  }

  function removeMessage(pid: string, msg: Bubble) {
    const stack = bubbles.get(pid);
    if (!stack) return;
    clearTimeout(msg.timer);
    msg.el.remove();
    stack.messages = stack.messages.filter((m) => m !== msg);
    if (!stack.messages.length) remove(pid);
  }

  function clear() {
    for (const pid of bubbles.keys()) remove(pid);
  }

  function update() {
    if (!bubbles.size) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    const now = performance.now();
    // Read geometry before writing positions, avoiding a layout pass for every speaker.
    const visible: { b: Stack; anchor: Anchor; w: number; h: number }[] = [];
    for (const [pid, b] of bubbles) {
      const anchor = ctx.anchor(pid);
      if (b.location !== ctx.location() || !anchor) {
        remove(pid);
        continue;
      }
      for (const msg of [...b.messages]) if (now >= msg.expiresAt) removeMessage(pid, msg);
      if (!b.messages.length) continue;
      // Keep an off-camera speaker's bubble off-camera too; never pin it to the viewport edge.
      const inView = anchor.x >= 0 && anchor.x <= width && anchor.y >= 0 && anchor.y <= height;
      b.el.hidden = !inView;
      if (inView) visible.push({ b, anchor, w: b.el.offsetWidth, h: b.el.offsetHeight });
    }
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    // Top speakers first: bubbles lower on screen can find space beside or above them.
    visible.sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x);
    for (const { b, anchor, w, h } of visible) {
      const clampX = (x: number) => Math.max(EDGE, Math.min(width - w - EDGE, x));
      const top = Math.max(EDGE, anchor.y - h - 10);
      const xs = [clampX(anchor.x - w / 2), clampX(anchor.x - w + 18), clampX(anchor.x - 18)];
      // Prefer a short tail; crowded cottages may use a second row with a fine pointer to the name.
      const ys = [top, ...occupied.map((r) => r.y - h - 12).filter((y) => y >= EDGE && top - y < h + 32)];
      let best = { x: xs[0]!, y: top, score: Infinity };
      for (const y of ys) for (const x of xs) {
        let overlap = 0;
        for (const r of occupied) {
          overlap += Math.max(0, Math.min(x + w + 4, r.x + r.w) - Math.max(x - 4, r.x)) *
            Math.max(0, Math.min(y + h + 8, r.y + r.h) - Math.max(y - 4, r.y));
        }
        const score = overlap * 1000 + (top - y) * 2 + Math.abs(x + w / 2 - anchor.x);
        if (score < best.score) best = { x, y, score };
      }
      occupied.push({ ...best, w, h });
      b.el.style.transform = `translate(${Math.round(best.x)}px, ${Math.round(best.y)}px)`;
      b.el.style.setProperty('--tail-x', `${Math.max(10, Math.min(w - 10, anchor.x - best.x))}px`);
      b.el.style.setProperty('--tail-h', `${Math.max(6, anchor.y - best.y - h)}px`);
      b.el.style.visibility = 'visible';
    }
  }

  const offChat = conn.events.on('chat:message', (msg) => {
    // Only accepted messages from a currently visible character. No optimistic or history replay.
    const pid = msg.fromPid;
    if (!pid || msg.scope === 'system' || !ctx.anchor(pid) || conn.status.get() !== 'open') return;
    let stack = bubbles.get(pid);
    if (!stack) {
      const el = document.createElement('div');
      el.className = 'ct-chat-stack';
      root.append(el);
      stack = { el, location: ctx.location(), messages: [] };
      bubbles.set(pid, stack);
    }
    const el = document.createElement('div');
    el.className = `ct-chat-bubble${msg.scope === 'storyteller' ? ' ct-chat-bubble-st' : ''}`;
    el.dataset.pid = pid;
    const text = document.createElement('span');
    text.className = 'ct-chat-bubble-text';
    text.textContent = msg.text;
    el.append(text);
    stack.el.append(el);
    const bubble: Bubble = {
      el,
      expiresAt: performance.now() + LIFETIME_MS,
      timer: setTimeout(() => removeMessage(pid, bubble), LIFETIME_MS),
    };
    stack.messages.push(bubble);
    if (stack.messages.length > MAX_PER_SPEAKER) removeMessage(pid, stack.messages[0]!);
    update();
  });
  const offStatus = conn.status.subscribe((status) => {
    if (status !== 'open') clear();
  });
  return {
    update,
    clear,
    destroy() {
      offChat();
      offStatus();
      clear();
      root.remove();
    },
  };
}
