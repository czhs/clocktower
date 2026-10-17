import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { errorText } from '../lobby/finder';

// Small building blocks shared by the admin console tabs. All user-provided text (display names,
// lobby names) is rendered through Preact (auto-escaped) — never innerHTML.

export type Notify = (ok: boolean, text: string) => void;

export function isForbidden(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 403 && (e as { body?: { message?: string } }).body?.message === 'Admins only';
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  return fmtDate(iso);
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
}

export function Kv({ k, v }: { k: string; v: ComponentChildren }) {
  return (
    <div class="ct-stat">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Modal shell (backdrop click / Escape closes unless busy). */
export function Dialog({
  title,
  onClose,
  busy = false,
  children,
  labelId,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ComponentChildren;
  labelId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [busy]);
  return (
    <div class="ct-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div class="panel ct-modal ct-adm-dialog" role="dialog" aria-modal="true" aria-labelledby={labelId} ref={ref}>
        <h2 id={labelId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export interface ConfirmSpec {
  title: string;
  body: ComponentChildren;
  confirmLabel: string;
  danger?: boolean;
  /** Second step: the confirm button only appears after ticking this acknowledgement. */
  acknowledge?: string;
  /** (v2.3 AUTH-8) Ask for the admin's own passphrase (step-up); passed to run(). */
  passphrase?: boolean;
  run: (passphrase?: string) => Promise<void>;
}

/** Confirmation dialog for every admin mutation; shows its own progress and error. */
export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(!spec.acknowledge);
  const [pass, setPass] = useState('');
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await spec.run(spec.passphrase ? pass : undefined);
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={spec.title} onClose={onClose} busy={busy} labelId="ct-adm-confirm-title">
      <div class="ct-adm-dialog-body">{spec.body}</div>
      {spec.acknowledge && (
        <label class="ct-adm-ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck((e.target as HTMLInputElement).checked)} disabled={busy} />
          <span>{spec.acknowledge}</span>
        </label>
      )}
      {spec.passphrase && (
        <label class="ct-adm-ack">
          <span>Your own passphrase (confirms it is you)</span>
          <input
            type="password"
            autoComplete="current-password"
            value={pass}
            onInput={(e) => setPass((e.target as HTMLInputElement).value)}
            disabled={busy}
          />
        </label>
      )}
      {error && (
        <p class="ct-error" role="alert">
          {error}
        </p>
      )}
      <div class="ct-adm-dialog-actions">
        <button type="button" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button type="button" class={spec.danger ? 'ct-danger-btn ct-adm-danger-solid' : 'primary'} disabled={busy || !ack || (spec.passphrase && pass.trim().length < 10)} onClick={() => void go()}>
          {busy ? 'Working…' : spec.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
