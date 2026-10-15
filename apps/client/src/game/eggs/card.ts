// DOM card + prompt for the CMU easter eggs (cmu-eggs). Text is set with textContent only.
import './eggs.css';

export type CardStyle = 'parchment' | 'notice' | 'terminal' | 'stone';

export interface CardSpec {
  style: CardStyle;
  title: string;
  lines: string[];
  foot?: string;
  /** terminal: clickable commands */
  commands?: { label: string; run: () => void }[];
  /** big centred line (the Fence's paint) */
  banner?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class EggUi {
  private card: HTMLDivElement | null = null;
  private prompt: HTMLDivElement;
  private touchBtn: HTMLButtonElement;
  private onTouch: (() => void) | null = null;

  constructor(private host: HTMLElement) {
    this.prompt = el('div', 'ct-game-prompt ct-egg-prompt');
    this.prompt.setAttribute('aria-live', 'polite');
    this.prompt.hidden = true;
    host.appendChild(this.prompt);
    this.touchBtn = el('button', 'ct-egg-touch', 'Look');
    this.touchBtn.type = 'button';
    this.touchBtn.hidden = true;
    this.touchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onTouch?.();
    });
    this.touchBtn.addEventListener('click', (e) => {
      // keyboard / screen-reader activation (pointer taps are handled on pointerdown)
      if ((e as MouseEvent).detail === 0) this.onTouch?.();
    });
    host.appendChild(this.touchBtn);
  }

  /** Show the "E — examine" hint (and the touch button) or hide it with null. */
  setPrompt(text: string | null, onTouch: (() => void) | null) {
    this.onTouch = onTouch;
    const show = !!text && !this.card;
    this.prompt.hidden = !show;
    this.touchBtn.hidden = !show;
    if (!show) return;
    if (this.prompt.dataset.text !== text) {
      this.prompt.dataset.text = text!;
      this.prompt.replaceChildren(el('kbd', '', 'E'), el('span', '', text!));
      this.touchBtn.textContent = text!.split(' ')[0] ?? 'Look';
    }
  }

  get open() {
    return !!this.card;
  }

  show(spec: CardSpec, onClose: () => void) {
    this.close();
    const card = el('div', `ct-egg-card ct-egg-${spec.style}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', spec.title);
    const x = el('button', 'ct-egg-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => onClose());
    card.appendChild(x);
    card.appendChild(el('h3', 'ct-egg-title', spec.title));
    if (spec.banner) card.appendChild(el('p', 'ct-egg-banner', spec.banner));
    const body = el('div', 'ct-egg-body');
    for (const l of spec.lines) body.appendChild(el(spec.style === 'terminal' ? 'pre' : 'p', 'ct-egg-line', l));
    card.appendChild(body);
    if (spec.commands?.length) {
      const row = el('div', 'ct-egg-cmds');
      for (const c of spec.commands) {
        const b = el('button', 'ct-egg-cmd', c.label);
        b.type = 'button';
        b.addEventListener('click', () => c.run());
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    if (spec.foot) card.appendChild(el('p', 'ct-egg-foot', spec.foot));
    // clicks inside the card must not walk the avatar
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.host.appendChild(card);
    this.card = card;
    this.prompt.hidden = true;
    this.touchBtn.hidden = true;
    if (spec.style === 'terminal') body.scrollTop = body.scrollHeight;
  }

  close() {
    this.card?.remove();
    this.card = null;
  }

  destroy() {
    this.close();
    this.prompt.remove();
    this.touchBtn.remove();
  }
}
