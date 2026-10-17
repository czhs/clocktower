import { useEffect, useRef, useState } from 'preact/hooks';
import {
  LOBBY_DESCRIPTION_MAX,
  LOBBY_NAME_MAX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type AccountView,
  type LobbyRoomView,
  type MemberView,
  type StorytellerMode,
  WORD_LOBBY_ID_RE,
} from '@ct/protocol';
import { useStore } from '../../net/store';
import type { RoomConnection } from '../../net/room';
import { helpSeen, openHelp } from '../common/HowToPlay';
import { CastPortrait } from '../common/castPortrait';
import { CharacterPicker, characterOf, takenBy } from './CharacterPicker';
import { copyText, SCRIPT_LABEL, shareUrl } from './finder';
import { MODE_COPY, modeOf, timingsOf, timingsSummary } from '../clock/logic';
import { AutoTimingsEditor, useTimingsDraft } from './ModeSettings';
import { StPrepareButton } from '../storyteller/prepareSlot'; // (v2.2) the Storyteller's tools before the game
import { AutoStorylineSetting } from '../common/lazyTown'; // (v2.2) automatic games: storyline (v2.4: lazy chunk)
import { ChatFilterSetting, MemberModTools, MutedBadge, RemovedList } from './moderation'; // (v2.3 OPS-6)
import '../auth/auth.css';
import './lobby.css';

// Waiting room: a compact, collapsible sheet over the town (top-left on desktop, where the HUD
// lives once the game starts; a top sheet on phones) so players can walk around while they wait.
// The header + primary action (Ready / Start) are always visible; details scroll. (Nearby chat is
// ChatPanel, docked bottom-left; this sheet stops above it via --ct-chat-h.)
const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;

export function WaitingRoom({ conn, onLeave }: { conn: RoomConnection; account: AccountView; onLeave: () => void }) {
  const view = useStore(conn.lobbyView);
  const status = useStore(conn.status);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(narrow);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for === 'lobby:cosmetics') {
          // Lost a race for a character (or similar): explain it inside the picker.
          setPickError(/taken|already|in use/i.test(e.message) ? 'Someone just picked that character. Choose another one.' : e.message);
          setPickOpen(true);
          setCollapsed(false);
          return;
        }
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
  const auto = isAuto(view);
  const host = view.members.find((m) => m.isHost) ?? null;
  // automatic games have no Storyteller: the host starts
  const canStartHere = isSt || (auto && isHost);

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
            {auto && <> · Automatic</>}
            {status === 'reconnecting' && <span class="ct-error"> · {navigator.onLine === false ? 'offline, waiting for network…' : 'reconnecting…'}</span>}
          </div>
        </div>
        <button class="ct-waiting-leave" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div class="ct-waiting-actions">
        {me?.role === 'player' && <ReadyButton conn={conn} ready={me.ready} lastOne={!me.ready && notReady.length === 1 && players.length >= MIN_PLAYERS} />}
        {canStartHere && (
          <button class="primary ct-start" disabled={!view.canStart} onClick={() => conn.send('lobby:start', {})}>
            Start game
          </button>
        )}
        {isSt && !auto && <StPrepareButton conn={conn} /> /* (v2.2, rules-storyteller) prepare + practice */}
        {!st && !isSt && !auto && (
          <button onClick={() => conn.send('lobby:claimStoryteller', {})} title="Run the game as the Storyteller (not counted as a player)">
            Be the Storyteller
          </button>
        )}
        {players.length < MIN_PLAYERS && <InviteButton lobbyId={view.lobby.id} lobbyName={view.lobby.name} />}
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
            {canStartHere
              ? 'Everyone is ready — start when you like.'
              : auto
                ? `Everyone is ready. Waiting for ${host?.displayName ?? 'the host'} to start.`
                : 'Everyone is ready. Waiting for the Storyteller to start.'}
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

          <GameMode view={view} conn={conn} isHost={isHost} st={st} auto={auto} />
          {!auto &&
            (st ? (
              <MemberRow m={st} view={view} me={me} />
            ) : (
              <div class="ct-member ct-member-empty">
                <span class="muted">Seat open — someone must take it to start.</span>
              </div>
            ))}
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
          <RemovedList view={view} conn={conn} />
          <ChatFilterSetting view={view} conn={conn} isHost={isHost} />
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
            {me && <LobbyCharacter conn={conn} view={view} me={me} open={pickOpen} setOpen={setPickOpen} error={pickError} setError={setPickError} />}
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
    <>
      {WORD_LOBBY_ID_RE.test(lobbyId) && (
        <p class="ct-share-code muted" title="Friends can also type this after /lobby/ in the address bar">
          Lobby code <strong>{lobbyId}</strong>
        </p>
      )}
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
    </>
  );
}

function MemberRow({ m, view, me, conn }: { m: MemberView; view: LobbyRoomView; me: MemberView | undefined; conn?: RoomConnection }) {
  const you = m.pid === view.youPid;
  const canTransferSt = !!me && (me.isHost || me.role === 'storyteller') && m.role === 'player' && !isAuto(view);
  const hostTools = !!me?.isHost && !you;
  const face = m.role === 'storyteller' ? 'storyteller' : characterOf(m.cosmetics)?.id;
  return (
    <div class={`ct-member ${m.connected ? '' : 'ct-member-away'}`}>
      <span class="ct-member-name">
        {face && <CastPortrait id={face} size={28} crop="bust" class="ct-member-face" />}
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
        <MutedBadge m={m} />
      </span>
      {conn && !you && (
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
          <MemberModTools m={m} view={view} me={me} conn={conn} />
        </span>
      )}
    </div>
  );
}

/** (v2.1) The lobby's mode (read defensively: the summary or the room view may carry it). */
function isAuto(view: LobbyRoomView): boolean {
  return modeOf(view.lobby) === 'auto' || modeOf(view) === 'auto';
}

/**
 * (v2.1) "Storyteller" heading, or the automatic game's line + timings. The host switches the mode
 * with a two-way toggle and steps the automatic timings in place (sent as lobby:settings).
 */
function GameMode({ view, conn, isHost, st, auto }: { view: LobbyRoomView; conn: RoomConnection; isHost: boolean; st: MemberView | null; auto: boolean }) {
  const server = timingsOf(view.lobby, view);
  const { value, step } = useTimingsDraft(server, (patch) => conn.send('lobby:settings', { autoTimings: patch }));
  const setMode = (m: StorytellerMode) => {
    if (m === (auto ? 'auto' : 'human')) return;
    if (m === 'auto' && st && !confirm(`Play without a Storyteller? ${st.displayName} becomes a player.`)) return;
    conn.send('lobby:settings', { storytellerMode: m });
  };
  return (
    <>
      <div class="ct-mode-head">
        <h3>{auto ? 'Automatic game' : 'Storyteller'}</h3>
        {isHost && (
          <div class="ct-mode-seg" role="radiogroup" aria-label="Who runs the game">
            {(['human', 'auto'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={(m === 'auto') === auto}
                class={(m === 'auto') === auto ? 'on' : ''}
                title={MODE_COPY[m].line}
                onClick={() => setMode(m)}
              >
                {MODE_COPY[m].title}
              </button>
            ))}
          </div>
        )}
      </div>
      {auto && (
        <div class="ct-auto-box">
          <p class="ct-small">No Storyteller: the town clock on the tower paces the day, and night choices come to you at home. Anyone can ask the town for more time.</p>
          {isHost ? <AutoTimingsEditor value={value} onStep={step} /> : <p class="muted ct-small">{timingsSummary(value)}</p>}
          <AutoStorylineSetting view={view} conn={conn} isHost={isHost} /> {/* (v2.2) the storyline fate deals */}
        </div>
      )}
    </>
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

/**
 * "Change character" in the waiting room: the roster with everyone else's picks greyed out. A pick
 * is sent straight away; the tile shows it as pending until the lobby view confirms it. Losing a
 * race (someone else got it first) comes back as an error and is explained in the picker.
 */
function LobbyCharacter({
  conn,
  view,
  me,
  open,
  setOpen,
  error,
  setError,
}: {
  conn: RoomConnection;
  view: LobbyRoomView;
  me: MemberView;
  open: boolean;
  setOpen: (o: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const taken = takenBy(view.members, view.youPid);
  const mine = characterOf(me.cosmetics);
  const holder = pending ? taken.get(pending) : undefined;

  useEffect(() => {
    if (!pending) return;
    if (me.cosmetics.preset === pending) {
      setPending(null);
      setOk(`You are ${mine?.name ?? 'them'} now.`);
    } else if (holder) {
      setPending(null);
      setError(`${holder} just picked that one. Choose another.`);
    }
  }, [pending, me.cosmetics.preset, holder]);
  useEffect(() => {
    if (error) setPending(null);
  }, [error]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(null);
      setError('The server did not confirm. Check your connection and try again.');
    }, 6000);
    return () => clearTimeout(t);
  }, [pending]);

  if (!open)
    return (
      <button class="ct-link ct-change-char" onClick={() => (setError(null), setOk(null), setOpen(true))}>
        {mine && <CastPortrait id={mine.id} size={22} crop="bust" />}
        Change character…
      </button>
    );
  return (
    <div class="ct-lobby-appearance">
      <CharacterPicker
        value={me.cosmetics.preset}
        pending={pending}
        taken={taken}
        compact
        label="Choose your character for this lobby"
        status={error ? { text: error, tone: 'error' } : ok ? { text: ok, tone: 'ok' } : null}
        onPick={(id) => {
          setError(null);
          setOk(null);
          setPending(id);
          conn.send('lobby:cosmetics', { cosmetics: { ...me.cosmetics, preset: id } });
        }}
      />
      <div class="ct-row">
        <button onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  );
}

/**
 * "Invite friends" in the always-visible action row while the lobby is short of players (the share
 * link itself sits in the details, which start collapsed on phones). Phones get the system share
 * sheet (Messages, WhatsApp, …); elsewhere, or if sharing is unavailable, the link is copied.
 */
function InviteButton({ lobbyId, lobbyName }: { lobbyId: string; lobbyName: string }) {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2500);
    return () => clearTimeout(t);
  }, [done]);
  const invite = async () => {
    const url = shareUrl(lobbyId);
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof nav.share === 'function') {
      try {
        await nav.share({ title: 'Clocktower Town', text: `Join "${lobbyName}" in Clocktower Town`, url });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return; // the player closed the sheet
      }
    }
    setDone((await copyText(url)) ? 'Link copied: send it to your friends' : 'Copy failed: open the lobby details to copy the link');
  };
  return (
    <>
      <button class="ct-invite" onClick={() => void invite()} title="Share this lobby's link">
        Invite friends
      </button>
      {done && (
        <p class="ct-waiting-status ct-ok ct-small" role="status">
          {done}
        </p>
      )}
    </>
  );
}
