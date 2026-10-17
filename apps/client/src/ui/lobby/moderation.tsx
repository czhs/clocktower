import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAT_FILTER_MODES, REPORT_MAX_MESSAGES, REPORT_NOTE_MAX, REPORT_REASONS, type ChatFilterMode, type LobbyRoomView, type MemberView, type ReportReason } from '@ct/protocol';
import { useStore } from '../../net/store';
import type { RoomConnection } from '../../net/room';

// (v2.3 OPS-6, sec-ops) In-lobby moderation UI. The server decides everything (who may mute /
// remove / unban; which chat lines a report may carry); these controls only send requests.
//   - host / Storyteller: mute a member's chat, remove (in game: Storyteller or host), let removed people back in,
//     choose the lobby's chat filter (host, waiting room)
//   - everyone: report another member to the server admins (the chat lines you received from them
//     are attached by id; the server keeps only lines it actually delivered to you)

const REASON_LABEL: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech or slurs',
  cheating: 'Cheating or sharing secret info',
  spam: 'Spam or flooding',
  other: 'Something else',
};

const FILTER_LABEL: Record<ChatFilterMode, string> = {
  off: 'Off: nothing is hidden',
  slurs: 'Slurs hidden (default)',
  strict: 'Strict: slurs and swearing hidden',
};

/** Mute / remove / unban: the lobby admin (the Storyteller, or an automatic game's host). Reporting is for everyone. */
const canModerate = (view: LobbyRoomView) => !!view.youAdmin;

/** Report dialog: reason, optional note; your latest received lines from that member are attached. */
export function ReportDialog({ conn, target, messageId, onClose }: { conn: RoomConnection; target: { pid: string; name: string }; messageId?: string; onClose: () => void }) {
  const chat = useStore(conn.chat);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ids = [...new Set([...(messageId ? [messageId] : []), ...chat.filter((m) => m.fromPid === target.pid).map((m) => m.id).reverse()])].slice(0, REPORT_MAX_MESSAGES);
  useEffect(() => conn.events.on('report:ack', (a) => (setResult(a), setBusy(false))), [conn]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('select')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const send = (e: Event) => {
    e.preventDefault();
    setBusy(true);
    conn.send('report:player', { pid: target.pid, reason, ...(note.trim() ? { note: note.trim() } : {}), ...(ids.length ? { messageIds: ids } : {}) });
  };
  return (
    <div class="ct-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="panel ct-modal" role="dialog" aria-modal="true" aria-labelledby="ct-report-title" ref={ref}>
        <h2 id="ct-report-title">Report {target.name}</h2>
        {result ? (
          <>
            <p class={result.ok ? 'ct-ok' : 'ct-error'} role="status">
              {result.message}
            </p>
            <div class="ct-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={send} class="ct-report-form">
            <p class="muted ct-small">
              The server admins will see your report, the lobby, the names of the people in it
              {ids.length ? ` and the last ${ids.length} chat line${ids.length === 1 ? '' : 's'} you received from ${target.name}` : ''}. Nothing about anyone's character is
              shared.
            </p>
            <label>
              Why?
              <select value={reason} onChange={(e) => setReason((e.target as HTMLSelectElement).value as ReportReason)}>
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Anything else? (optional)
              <textarea maxLength={REPORT_NOTE_MAX} rows={3} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
            </label>
            <div class="ct-actions">
              <button type="button" class="ct-link" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Per-member buttons: Mute/Unmute (host/ST), Remove in game (ST/host), Report (anyone else). */
export function MemberModTools({ m, view, me, conn, inGame = false }: { m: MemberView; view: LobbyRoomView; me: MemberView | undefined; conn: RoomConnection; inGame?: boolean }) {
  const [reporting, setReporting] = useState(false);
  if (!me || m.pid === view.youPid) return null;
  const mod = canModerate(view);
  const canRemove = inGame && mod && m.role !== 'storyteller';
  return (
    <>
      {mod && (
        <button class="ct-link" onClick={() => conn.send('lobby:mute', { pid: m.pid, on: !m.muted })} title={m.muted ? 'Let them chat again' : 'Hide their chat from everyone in this lobby'}>
          {m.muted ? 'Unmute' : 'Mute'}
        </button>
      )}
      {canRemove && (
        <button
          class="ct-link ct-danger"
          onClick={() => {
            if (confirm(`Remove ${m.displayName} from this game? Their seat stays empty and they cannot come back to this lobby.`)) conn.send('lobby:kick', { pid: m.pid });
          }}
        >
          Remove
        </button>
      )}
      <button class="ct-link" onClick={() => setReporting(true)}>
        Report
      </button>
      {reporting && <ReportDialog conn={conn} target={{ pid: m.pid, name: m.displayName }} onClose={() => setReporting(false)} />}
    </>
  );
}

export function MutedBadge({ m }: { m: MemberView }) {
  return m.muted ? <span class="ct-badge ct-badge-away">muted</span> : null;
}

/** Host / Storyteller: people removed from this lobby, with "Let back in". */
export function RemovedList({ view, conn }: { view: LobbyRoomView; conn: RoomConnection }) {
  const removed = view.removed ?? [];
  if (!removed.length) return null;
  return (
    <details class="ct-removed">
      <summary class="muted ct-small">Removed from this lobby ({removed.length})</summary>
      <ul class="ct-members">
        {removed.map((r) => (
          <li key={r.key} class="ct-member">
            <span class="ct-member-name">{r.displayName}</span>
            <span class="ct-member-tools">
              <button class="ct-link" onClick={() => conn.send('lobby:unban', { key: r.key })}>
                Let back in
              </button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Host, waiting room: the lobby's chat filter. Everyone else sees the current setting. */
export function ChatFilterSetting({ view, conn, isHost }: { view: LobbyRoomView; conn: RoomConnection; isHost: boolean }) {
  const mode: ChatFilterMode = view.lobby.chatFilter ?? 'slurs';
  if (!isHost) return <p class="muted ct-small">Chat filter: {FILTER_LABEL[mode]}</p>;
  return (
    <label class="ct-small ct-chat-filter">
      Chat filter{' '}
      <select value={mode} onChange={(e) => conn.send('lobby:settings', { chatFilter: (e.target as HTMLSelectElement).value as ChatFilterMode })}>
        {CHAT_FILTER_MODES.map((x) => (
          <option key={x} value={x}>
            {FILTER_LABEL[x]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * In game the waiting-room member list is gone: a small "People" button opens the same per-member
 * safety tools (report; mute + remove for the host / Storyteller) and the removed list.
 */
export function LobbySafety({ conn }: { conn: RoomConnection }) {
  const view = useStore(conn.lobbyView);
  const [open, setOpen] = useState(false);
  if (!view || view.lobby.phase === 'waiting') return null;
  const me = view.members.find((x) => x.pid === view.youPid);
  return (
    <>
      <button class="ct-safety-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="People in this lobby: report, mute">
        People
      </button>
      {open && (
        <div class="ct-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="panel ct-modal" role="dialog" aria-modal="true" aria-labelledby="ct-safety-title">
            <h2 id="ct-safety-title">People in this lobby</h2>
            <ul class="ct-members">
              {view.members.map((m) => (
                <li key={m.pid} class="ct-member">
                  <span class="ct-member-name">
                    {m.displayName}
                    {m.role === 'storyteller' && <span class="ct-badge ct-badge-st">Storyteller</span>}
                    {!m.connected && <span class="ct-badge ct-badge-away">away</span>}
                    <MutedBadge m={m} />
                  </span>
                  <span class="ct-member-tools">
                    <MemberModTools m={m} view={view} me={me} conn={conn} inGame />
                  </span>
                </li>
              ))}
            </ul>
            {canModerate(view) && <RemovedList view={view} conn={conn} />}
            <div class="ct-actions">
              <button onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
