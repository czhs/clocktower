import { useEffect, useState } from 'preact/hooks';
import { errorText } from '../lobby/finder';
import { adminApi } from './adminApi';
import { ConfirmDialog, isForbidden, type ConfirmSpec, type Notify } from './shared';
import type { AdminSettingView, AdminSettingsPage } from './types';

// (v2.3, sec-ops) "Security & limits": every server knob from the settings registry, grouped by
// area. Each row shows the current value, the default, a Reset, a lock badge when the server's env
// fixes the value, and "after restart" for keys read at start-up. Dangerous keys ask for the admin's
// own passphrase (step-up). The server validates everything; this page only edits.

type Val = boolean | number | string;

function fmt(s: AdminSettingView, v: Val | null): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (s.unit === 'bytes' || s.unit === 'bytes/s') {
    const n = Number(v);
    const t = n >= 1048576 ? `${(n / 1048576).toFixed(n % 1048576 ? 1 : 0)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)} KiB` : `${n} B`;
    return s.unit === 'bytes/s' ? `${t}/s` : t;
  }
  if (v === '') return '(empty)';
  return `${v}${s.unit ? ` ${s.unit}` : ''}`;
}

function SettingRow({ s, onSaved, ask, notify }: { s: AdminSettingView; onSaved: (n: AdminSettingView) => void; ask: (c: ConfirmSpec) => void; notify: Notify }) {
  const [draft, setDraft] = useState<string>(s.sensitive ? '' : String(s.value ?? ''));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(s.sensitive ? '' : String(s.value ?? '')), [s.value]);
  const parsed = (): Val | null => {
    if (s.type === 'bool') return draft === 'true';
    if (s.type === 'int' || s.type === 'duration') return /^-?\d+$/.test(draft.trim()) ? Number(draft.trim()) : null;
    return draft;
  };
  const changed = s.sensitive ? draft !== '' : String(s.value ?? '') !== draft;
  const run = async (fn: (pass?: string) => Promise<{ setting: AdminSettingView }>, label: string) => {
    const go = async (pass?: string) => {
      setBusy(true);
      try {
        onSaved((await fn(pass)).setting);
        notify(true, `${s.label}: ${label}.`);
      } finally {
        setBusy(false);
      }
    };
    if (s.dangerous)
      ask({
        title: `Change “${s.label}”?`,
        body: (
          <>
            <p>{s.help}</p>
            <p class="ct-adm-warn ct-small">This weakens or changes a protection. Confirm with your own passphrase.</p>
          </>
        ),
        confirmLabel: 'Apply',
        danger: true,
        passphrase: true,
        run: go,
      });
    else
      await go().catch((e) => {
        notify(false, errorText(e));
      });
  };
  const save = () => {
    const v = parsed();
    if (v === null) return notify(false, `${s.label}: enter a whole number`);
    void run((pass) => adminApi.setSetting(s.id, v, pass), s.sensitive ? 'saved' : `now ${fmt(s, v)}`);
  };
  const control =
    s.type === 'bool' ? (
      <label class="ct-set-switch">
        <input
          type="checkbox"
          checked={draft === 'true'}
          disabled={s.locked || busy}
          onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            if (!s.dangerous) setDraft(String(on));
            else (e.target as HTMLInputElement).checked = !on; // shown after the confirmed save
            void run((pass) => adminApi.setSetting(s.id, on, pass), on ? 'on' : 'off');
          }}
        />{' '}
        {draft === 'true' ? 'On' : 'Off'}
      </label>
    ) : s.type === 'enum' ? (
      <select value={draft} disabled={s.locked || busy} onChange={(e) => setDraft((e.target as HTMLSelectElement).value)}>
        {(s.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={s.sensitive ? 'password' : s.type === 'string' ? 'text' : 'number'}
        inputMode={s.type === 'string' ? undefined : 'numeric'}
        min={s.type === 'string' ? undefined : s.min}
        max={s.type === 'string' ? undefined : s.max}
        placeholder={s.sensitive ? (s.isSet ? 'set — type to replace' : 'not set') : undefined}
        value={draft}
        disabled={s.locked || busy}
        autoComplete="off"
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
      />
    );
  return (
    <li class={`ct-set-row${s.locked ? ' locked' : ''}`}>
      <div class="ct-set-head">
        <strong>{s.label}</strong>
        {s.locked && (
          <span class="ct-adm-badge" title={s.envVar ? `Set by ${s.envVar} in the server's environment` : 'Fixed by the server'}>
            locked by server config{s.envVar ? ` (${s.envVar})` : ''}
          </span>
        )}
        {s.applies === 'restart' && <span class="ct-adm-badge">after restart</span>}
        {s.dangerous && <span class="ct-adm-badge admin">needs passphrase</span>}
      </div>
      <p class="muted ct-small">{s.help}</p>
      <div class="ct-set-ctl">
        {control}
        {s.type !== 'bool' && !s.locked && (
          <button disabled={!changed || busy} onClick={save}>
            Save
          </button>
        )}
        {!s.locked && !s.isDefault && (
          <button class="ct-link" disabled={busy} onClick={() => void run((pass) => adminApi.resetSetting(s.id, pass), 'reset to default')}>
            Reset to default
          </button>
        )}
      </div>
      <p class="muted ct-small">
        {s.sensitive ? (s.isSet ? 'A value is set.' : 'Not set.') : `Now ${fmt(s, s.value)} · default ${fmt(s, s.default)}`}
        {s.min !== undefined && s.type !== 'string' && s.type !== 'enum' && s.type !== 'bool' ? ` · allowed ${s.min}–${s.max}` : ''}
      </p>
    </li>
  );
}

export function SettingsTab({ notify, onForbidden }: { notify: Notify; onForbidden: () => void }) {
  const [page, setPage] = useState<AdminSettingsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    adminApi
      .settings()
      .then(setPage)
      .catch((e) => (isForbidden(e) ? onForbidden() : setError(errorText(e))));
  }, []);
  if (!page) return <p class="muted">{error ?? 'Loading settings…'}</p>;
  const saved = (n: AdminSettingView) => setPage((p) => (p ? { ...p, settings: p.settings.map((x) => (x.id === n.id ? n : x)) } : p));
  const q = filter.trim().toLowerCase();
  const shown = page.settings.filter((s) => !q || `${s.label} ${s.help} ${s.id}`.toLowerCase().includes(q));
  return (
    <div class="ct-set">
      {page.degraded && (
        <p class="ct-error" role="alert">
          The settings store could not be read: every setting runs on its SAFE value until the database is fixed.
        </p>
      )}
      <p class="muted ct-small">
        Changes apply at once unless marked “after restart”. Values locked by the server's environment can only be changed there. Not settable on purpose:
        per-player secrecy of game information, admin-only checks, cross-site request protection and server-side validation.
      </p>
      <input class="ct-set-filter" type="search" placeholder="Filter settings…" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} aria-label="Filter settings" />
      {page.groups.map((g) => {
        const items = shown.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <details key={g.id} class="panel ct-set-group" open>
            <summary>
              <h3>{g.label}</h3>
              <span class="muted ct-small">{items.length}</span>
            </summary>
            <ul class="ct-set-list">
              {items.map((s) => (
                <SettingRow key={s.id} s={s} onSaved={saved} ask={setConfirm} notify={notify} />
              ))}
            </ul>
          </details>
        );
      })}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
