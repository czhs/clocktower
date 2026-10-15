import { useEffect, useRef, useState } from 'preact/hooks';
import {
  LOBBY_DESCRIPTION_MAX,
  LOBBY_NAME_MAX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type AccountView,
  type Cosmetics,
  type LobbyRoomView,
  type MemberView,
} from '@ct/protocol';
import { useStore } from '../../net/store';
import type { RoomConnection } from '../../net/room';
import { helpSeen, openHelp } from '../common/HowToPlay';
import { CosmeticEditor } from './CosmeticEditor';
import { copyText, SCRIPT_LABEL, shareUrl } from './finder';
import '../auth/auth.css';
import './lobby.css';

// Waiting room: a compact, collapsible sheet over the town (top-left on desktop, where the HUD
// lives once the game starts; a top sheet on phones) so players can walk around while they wait.
// The header + primary action (Ready / Start) are always visible; details scroll. (Lobby chat is
// ChatPanel, docked bottom-left; this sheet stops above it via --ct-chat-h.)
const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;

export function WaitingRoom({ conn, onLeave }: { conn: RoomConnection; account: AccountView; onLeave: () => void }) {
  const view = useStore(conn.lobbyView);
  const status = useStore(conn.status);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(narrow);

  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (!e.for || e.for.startsWith('lobby:')) setNotice(e.message);
      }),
    [conn],
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!view)
    return (
      <div class="ct-waiting panel" role="status">
        <span class="ct-spinner" aria-hidden="true" />
        Joining lobby…
      </div>
    );
  const me = view.members.find((m) => m.pid === view.youPid);
  const isHost = !!me?.isHost;
  const isSt = me?.role === 'storyteller';
  const st = view.members.find((m) => m.role === 'storyteller') ?? null;
  const players = view.members.filter((m) => m.role === 'player');
  const readyCount = players.filter((m) => m.ready).length;
  const notReady = players.filter((m) => !m.ready);

  return (
    <div class={`ct-waiting panel${collapsed ? ' ct-waiting-collapsed' : ''}`} role="dialog" aria-label="Waiting room" aria-modal="false">
      <header class="ct-waiting-head">
        <button
          class="ct-waiting-toggle"
          aria-expanded={!collapsed}
          aria-controls="ct-waiting-body"
          title={collapsed ? 'Show lobby details' : 'Hide lobby details (look around the town)'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          <span class="ct-sr-only">{collapsed ? 'Show lobby details' : 'Hide lobby details'}</span>
        </button>
        <div class="ct-waiting-title">
          <h2>{view.lobby.name}</h2>
          <div class="muted ct-small">
            {players.length}/{view.lobby.maxPlayers} players · {readyCount} ready
            {!collapsed && <> · {SCRIPT_LABEL[view.lobby.script]}</>}
            {status === 'reconnecting' && <span class="ct-error"> · reconnecting…</span>}
          </div>
        </div>
        <button class="ct-waiting-leave" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div class="ct-waiting-actions">
        {me?.role === 'player' && <ReadyButton conn={conn} ready={me.ready} lastOne={!me.ready && notReady.length === 1 && players.length >= MIN_PLAYERS} />}
        {isSt && (
          <button class="primary ct-start" disabled={!view.canStart} onClick={() => conn.send('lobby:start', {})}>
            Start game
          </button>
        )}
        {!st && !isSt && (
          <button onClick={() => conn.send('lobby:claimStoryteller', {})} title="Run the game as the Storyteller (not counted as a player)">
            Be the Storyteller
          </button>
        )}
        {notReady.length > 0 && players.length >= MIN_PLAYERS && (isSt || isHost || me?.ready) ? (
          <p class="ct-waiting-status muted ct-small" aria-live="polite">
            Waiting for {listNames(notReady.map((m) => m.displayName))} to press Ready
            {notReady.some((m) => !m.connected) && ' (some are disconnected)'}
          </p>
        ) : view.startBlockers.length > 0 ? (
          <p class="ct-waiting-status muted ct-small" aria-live="polite">
            {view.startBlockers[0]}
            {view.startBlockers.length > 1 && ` (+${view.startBlockers.length - 1} more)`}
          </p>
        ) : (
          <p class="ct-waiting-status ct-ok ct-small" aria-live="polite">
            {isSt ? 'Everyone is ready — start when you like.' : 'Everyone is ready. Waiting for the Storyteller to start.'}
          </p>
        )}
      </div>

      {!helpSeen() && (
        <button class="ct-waiting-newbie" onClick={openHelp}>
          <span aria-hidden="true">?</span> First time here? <u>How to play</u> — one minute
        </button>
      )}
      {notice && (
        <p class="ct-error ct-notice" role="alert">
          {notice}
        </p>
      )}

      {!collapsed && (
        <div class="ct-waiting-body" id="ct-waiting-body">
          {view.lobby.description && <p class="ct-waiting-desc">{view.lobby.description}</p>}
          <ShareLink lobbyId={view.lobby.id} />

          <h3>Storyteller</h3>
          {st ? (
            <MemberRow m={st} view={view} me={me} />
          ) : (
            <div class="ct-member ct-member-empty">
              <span class="muted">Seat open — someone must take it to start.</span>
            </div>
          )}
          <h3>
            Players <span class="muted">({players.length}/{view.lobby.maxPlayers})</span>
          </h3>
          <ul class="ct-members">
            {players.map((m) => (
              <li key={m.pid}>
                <MemberRow m={m} view={view} me={me} conn={conn} />
              </li>
            ))}
            {players.length === 0 && <li class="muted ct-small">No players yet — share the link above.</li>}
          </ul>
          {view.startBlockers.length > 1 && (
            <ul class="ct-blockers">
              {view.startBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          <div class="ct-waiting-more">
            {isSt && (
              <button class="ct-link" onClick={() => conn.send('lobby:releaseStoryteller', {})}>
                Give up Storyteller seat
              </button>
            )}
            {isHost && <HostSettings view={view} conn={conn} />}
            {me && <LobbyAppearance conn={conn} current={me.cosmetics} />}
            <button class="ct-link" onClick={openHelp}>
              How to play
            </button>
          </div>
          <p class="muted ct-small ct-waiting-tip">Walk around while you wait — WASD / arrow keys{narrow() ? ' or the joystick' : ''}.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Ready toggle. Optimistic: the label flips on click, and the latest server view confirms it. If the
 * server hasn't confirmed within 2.5 s the request is re-sent once (lost click / dropped frame),
 * then the button falls back to the server's state with a hint. The click handler reads the
 * desired state from a ref, never from a stale render.
 */
function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

function ReadyButton({ conn, ready, lastOne }: { conn: RoomConnection; ready: boolean; lastOne?: boolean }) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const serverReady = useRef(ready);
  serverReady.current = ready;
  const pendingRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (pendingRef.current !== null && pendingRef.current === ready) {
      pendingRef.current = null;
      setPending(null);
      setHint(null);
    }
  }, [ready]);
  useEffect(() => {
    if (pending === null) return;
    const want = pending;
    const retry = setTimeout(() => {
      if (pendingRef.current === want && serverReady.current !== want) conn.send('lobby:ready', { ready: want });
    }, 2500);
    const giveUp = setTimeout(() => {
      if (pendingRef.current === want && serverReady.current !== want) {
        pendingRef.current = null;
        setPending(null);
        setHint('The server did not confirm — check your connection and try again.');
      }
    }, 6000);
    return () => {
      clearTimeout(retry);
      clearTimeout(giveUp);
    };
  }, [pending, conn]);
  const shown = pending ?? ready;
  return (
    <>
      <button
        class={shown ? 'ct-ready-on' : `primary${lastOne ? ' ct-nudge' : ''}`}
        title={lastOne && !shown ? 'Everyone else is ready' : undefined}
        aria-pressed={shown}
        onClick={() => {
          const want = !(pendingRef.current ?? serverReady.current);
          pendingRef.current = want;
          setPending(want);
          setHint(null);
          conn.send('lobby:ready', { ready: want });
        }}
      >
        {shown ? 'Not ready' : "I'm ready"}
      </button>
      {hint && (
        <p class="ct-error ct-small ct-waiting-status" role="alert">
          {hint}
        </p>
      )}
    </>
  );
}

function ShareLink({ lobbyId }: { lobbyId: string }) {
  const url = shareUrl(lobbyId);
  const [copied, setCopied] = useState(false);
  return (
    <div class="ct-share">
      <input readOnly value={url} aria-label="Share link" onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      <button
        onClick={async () => {
          setCopied(await copyText(url));
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

function MemberRow({ m, view, me, conn }: { m: MemberView; view: LobbyRoomView; me: MemberView | undefined; conn?: RoomConnection }) {
  const you = m.pid === view.youPid;
  const canTransferSt = !!me && (me.isHost || me.role === 'storyteller') && m.role === 'player';
  const hostTools = !!me?.isHost && !you;
  return (
    <div class={`ct-member ${m.connected ? '' : 'ct-member-away'}`}>
      <span class="ct-member-name">
        {m.displayName}
        {you && <span class="ct-badge">you</span>}
        {m.role === 'storyteller' && (
          <span class="ct-badge ct-badge-st">
            <img class="ct-icon" src="/art/ui/storyteller.png" alt="" /> Storyteller
          </span>
        )}
        {m.isHost && (
          <span class="ct-badge ct-badge-host">
            <img class="ct-icon" src="/art/ui/host.png" alt="" /> Host
          </span>
        )}
        {m.role === 'player' && (m.ready ? <span class="ct-badge ct-badge-ready">Ready</span> : <span class="ct-badge ct-badge-wait">Not ready</span>)}
        {!m.connected && <span class="ct-badge ct-badge-away">reconnecting</span>}
      </span>
      {conn && (canTransferSt || hostTools) && (
        <span class="ct-member-tools">
          {canTransferSt && (
            <button class="ct-link" onClick={() => conn.send('lobby:transferStoryteller', { pid: m.pid })}>
              Make Storyteller
            </button>
          )}
          {hostTools && (
            <>
              <button class="ct-link" onClick={() => conn.send('lobby:transferHost', { pid: m.pid })}>
                Make host
              </button>
              <button
                class="ct-link ct-danger"
                onClick={() => {
                  if (confirm(`Remove ${m.displayName} from this lobby?`)) conn.send('lobby:kick', { pid: m.pid });
                }}
              >
                Kick
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function HostSettings({ view, conn }: { view: LobbyRoomView; conn: RoomConnection }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(view.lobby.name);
  const [description, setDescription] = useState(view.lobby.description);
  const [maxPlayers, setMaxPlayers] = useState(view.lobby.maxPlayers);
  const seated = view.members.filter((m) => m.role === 'player').length;
  if (!open)
    return (
      <button class="ct-link" onClick={() => setOpen(true)}>
        Lobby settings…
      </button>
    );
  return (
    <form
      class="ct-host-settings"
      onSubmit={(e) => {
        e.preventDefault();
        conn.send('lobby:settings', { name: name.trim(), description: description.trim(), maxPlayers });
        setOpen(false);
      }}
    >
      <label class="ct-field">
        <span>Name</span>
        <input value={name} maxLength={LOBBY_NAME_MAX} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <label class="ct-field">
        <span>Description</span>
        <textarea rows={2} value={description} maxLength={LOBBY_DESCRIPTION_MAX} onInput={(e) => setDescription((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>
      <label class="ct-field">
        <span>Player seats</span>
        <select value={String(maxPlayers)} onChange={(e) => setMaxPlayers(Number((e.currentTarget as HTMLSelectElement).value))}>
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
            <option key={n} value={n} disabled={n < seated}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div class="ct-row">
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" class="primary">
          Apply
        </button>
      </div>
    </form>
  );
}

function LobbyAppearance({ conn, current }: { conn: RoomConnection; current: Cosmetics }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  if (!open)
    return (
      <button
        class="ct-link"
        onClick={() => {
          setDraft(current);
          setOpen(true);
        }}
      >
        Change character…
      </button>
    );
  return (
    <div class="ct-lobby-appearance">
      <CosmeticEditor value={draft} onChange={setDraft} compact />
      <div class="ct-row">
        <button onClick={() => setOpen(false)}>Cancel</button>
        <button
          class="primary"
          onClick={() => {
            conn.send('lobby:cosmetics', { cosmetics: draft });
            setOpen(false);
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
