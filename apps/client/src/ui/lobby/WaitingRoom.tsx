import { useEffect, useState } from 'preact/hooks';
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
import { CosmeticEditor } from './CosmeticEditor';
import { copyText, SCRIPT_LABEL, shareUrl } from './finder';
import '../auth/auth.css';
import './lobby.css';

// OWNED BY lobby-auth. Overlay on top of the town while the lobby is waiting: members, ready
// states, Storyteller seat, host controls, share URL, start button. (Lobby chat is ChatPanel,
// rendered bottom-left by main.tsx.)
export function WaitingRoom({ conn, onLeave }: { conn: RoomConnection; account: AccountView; onLeave: () => void }) {
  const view = useStore(conn.lobbyView);
  const status = useStore(conn.status);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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

  if (!view) return <div class="ct-waiting panel">Joining lobby…</div>;
  const me = view.members.find((m) => m.pid === view.youPid);
  const isHost = !!me?.isHost;
  const isSt = me?.role === 'storyteller';
  const st = view.members.find((m) => m.role === 'storyteller') ?? null;
  const players = view.members.filter((m) => m.role === 'player');

  if (collapsed)
    return (
      <div class="ct-waiting ct-waiting-collapsed panel">
        <strong>{view.lobby.name}</strong>
        <span class="muted">
          {players.length}/{view.lobby.maxPlayers} players
        </span>
        <button onClick={() => setCollapsed(false)}>Show lobby</button>
      </div>
    );

  return (
    <div class="ct-waiting panel" role="dialog" aria-label="Waiting room">
      <header class="ct-waiting-head">
        <div>
          <h2>{view.lobby.name}</h2>
          <div class="muted ct-small">
            {SCRIPT_LABEL[view.lobby.script]} · {players.length}/{view.lobby.maxPlayers} players · host {view.lobby.hostName}
            {status === 'reconnecting' && <span class="ct-error"> · reconnecting…</span>}
          </div>
          {view.lobby.description && <p class="ct-waiting-desc">{view.lobby.description}</p>}
        </div>
        <div class="ct-row">
          <button class="ct-link" onClick={() => setCollapsed(true)} title="Look around the town while you wait">
            Hide
          </button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </header>

      <ShareLink lobbyId={view.lobby.id} />

      <div class="ct-waiting-grid">
        <section>
          <h3>Storyteller</h3>
          {st ? (
            <MemberRow m={st} view={view} me={me} />
          ) : (
            <div class="ct-member ct-member-empty">
              <span class="muted">Seat open</span>
              {!isSt && <button onClick={() => conn.send('lobby:claimStoryteller', {})}>Take the Storyteller seat</button>}
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
            {players.length === 0 && <li class="muted">No players yet — share the link.</li>}
          </ul>
        </section>

        <section class="ct-waiting-side">
          {me?.role === 'player' && (
            <button class={me.ready ? '' : 'primary'} onClick={() => conn.send('lobby:ready', { ready: !me.ready })}>
              {me.ready ? 'Not ready' : "I'm ready"}
            </button>
          )}
          {isSt && (
            <>
              <button class="primary ct-start" disabled={!view.canStart} onClick={() => conn.send('lobby:start', {})}>
                Start game
              </button>
              {view.startBlockers.length > 0 && (
                <ul class="ct-blockers">
                  {view.startBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <button onClick={() => conn.send('lobby:releaseStoryteller', {})}>Give up Storyteller seat</button>
            </>
          )}
          {!isSt && view.startBlockers.length > 0 && (
            <p class="muted ct-small">Waiting: {view.startBlockers.join(' · ')}</p>
          )}
          {isHost && <HostSettings view={view} conn={conn} />}
          {me && <LobbyAppearance conn={conn} current={me.cosmetics} />}
        </section>
      </div>

      {notice && (
        <p class="ct-error ct-notice" role="alert">
          {notice}
        </p>
      )}
    </div>
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
        {m.role === 'storyteller' && <span class="ct-badge ct-badge-st">Storyteller</span>}
        {m.isHost && <span class="ct-badge ct-badge-host">Host</span>}
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
        Change appearance…
      </button>
    );
  return (
    <div class="ct-lobby-appearance">
      <CosmeticEditor value={draft} onChange={setDraft} />
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
