import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CHAT_MAX, type AccountView, type AnnouncementView, type ChatMessage, type LocationId, type MemberRole } from '@ct/protocol';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
import { shallowEqual, useStore, useStoreSelector } from '../../net/store';
import { localPlayer } from '../../net/localPlayer';
import type { RoomConnection } from '../../net/room';
import { ReportDialog } from '../lobby/moderation'; // (v2.3 OPS-6)
import { shortcutAllowed, storedPttCode } from '../hud/logic';
import {
  annKey,
  atBottom,
  buildLog,
  CHAT_BUCKET,
  chatScope,
  cleanChat,
  clockTime,
  countHere,
  expireOutbox,
  isRecentDuplicate,
  makeCid,
  matchEcho,
  FAIL_ALL_CODES,
  mergeAnnouncements,
  nextPill,
  refuseOldest,
  secondsLeft,
  TokenBucket,
  unreadAfter,
  type ChatScope,
  type LogItem,
  type OutLine,
} from './logic';
import './chat.css';

// Text chat. In every phase the server delivers a message only to members who could hear the
// sender's voice (same acoustic zone: outdoors = everyone outside, a building = that room, players
// at night = their own home). (v2.3 chat/ux) The panel always says who reads you RIGHT NOW (derived
// from the own location + the own snapshot only), tags lines said somewhere else, keeps the town
// crier's announcements re-readable (Crier tab + distinct lines), sends optimistically with a
// client-side mirror of the server's rate limit (queue + countdown instead of silent drops), never
// loses typed text, keeps focus for the next line and only follows the bottom when you are there.
// Docked bottom-left on desktop (voice panel is bottom-right); on phones it starts collapsed to a
// button and opens as a bottom sheet that rides above the virtual keyboard. Text is escaped by Preact.

const SCOPE_LABEL: Record<ChatMessage['scope'], string> = {
  lobby: 'Lobby',
  zone: 'Nearby',
  storyteller: 'Storyteller',
  system: 'Town',
};

const buildingOf = (id: string) => currentLayout().buildings.find((b) => b.id === id);
const buildingName = (id: string) => buildingOf(id)?.name ?? null;
const houseIndexOf = (id: string) => buildingOf(id)?.houseIndex ?? null;

const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const EMPTY_ANN: AnnouncementView[] = [];

interface Me {
  youPid: string | null;
  role: MemberRole | null;
  seat: number | null;
  muted: boolean;
  inGame: boolean;
  /** "seat:name|…" of seated members (house owners are public once seats are dealt). */
  owners: string;
  /** "pid,pid,…" of members (count only real people in the own room). */
  pids: string;
}

function selectMe(l: ReturnType<RoomConnection['lobbyView']['get']>): Me {
  const me = l?.members.find((m) => m.pid === l.youPid);
  return {
    youPid: l?.youPid ?? null,
    role: me?.role ?? null,
    seat: me?.seat ?? null,
    muted: !!me?.muted,
    inGame: !!l && l.lobby.phase !== 'waiting' && l.lobby.phase !== 'finished',
    owners: (l?.members ?? [])
      .filter((m) => m.seat !== null)
      .map((m) => `${m.seat}:${m.displayName}`)
      .join('|'),
    pids: (l?.members ?? []).map((m) => m.pid).join(','),
  };
}

/** Own location + people in the own room, from the own snapshot; re-renders only when they change. */
function useWhere(conn: RoomConnection, youPid: string | null, pids: string): { loc: LocationId | null; here: number } {
  const [where, setWhere] = useState<{ loc: LocationId | null; here: number }>(() => {
    const lp = localPlayer.get();
    return { loc: youPid && lp.pid === youPid ? lp.location : null, here: 1 };
  });
  useEffect(() => {
    const members = new Set(pids.split(',').filter(Boolean));
    const isMember = (p: string) => members.has(p);
    let key = '';
    return conn.events.on('world:snapshot', (s) => {
      const own = youPid ? s.entities.find((e) => e.id === youPid) : undefined;
      const lp = localPlayer.get();
      const loc = own?.location ?? (youPid && lp.pid === youPid ? lp.location : null);
      const here = countHere(s.entities, loc, isMember);
      const k = `${loc}|${here}`;
      if (k === key) return;
      key = k;
      setWhere({ loc, here });
    });
  }, [conn, youPid, pids]);
  return where;
}

/** Pixels the on-screen keyboard covers at the bottom (iOS keeps the layout viewport; Android may not). */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}

type Hint = { text: string; until?: number; tone?: 'warn' | 'info' } | null;

export function ChatPanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const messages = useStore(conn.chat);
  const me = useStoreSelector(conn.lobbyView, selectMe, shallowEqual);
  const phase = useStoreSelector(conn.gameView, (g) => g?.phase ?? null);
  const hasGame = phase !== null;
  const gameAnns = useStoreSelector(
    conn.gameView,
    (g) => g?.announcements ?? EMPTY_ANN,
    (a, b) => a.length === b.length && (a.length === 0 || annKey(a[a.length - 1]!) === annKey(b[b.length - 1]!)),
  );
  const [liveAnns, setLiveAnns] = useState<AnnouncementView[]>([]);
  const anns = useMemo(() => mergeAnnouncements([gameAnns, liveAnns]), [gameAnns, liveAnns]);

  const [open, setOpen] = useState(() => !narrow());
  const [tab, setTab] = useState<'chat' | 'crier'>('chat');
  const [hint, setHint] = useState<Hint>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null); // (v2.3 OPS-6)
  const [outbox, setOutbox] = useState<OutLine[]>([]);
  const [focused, setFocused] = useState(false);
  const outRef = useRef(outbox);
  outRef.current = outbox;
  const rootRef = useRef<HTMLElement>(null);
  const composer = useRef<ComposerApi | null>(null);
  const focusOnOpen = useRef(false);
  const bucket = useRef(new TokenBucket(CHAT_BUCKET.capacity, CHAT_BUCKET.refillPerSec, Date.now()));
  const lastSaid = useRef<{ text: string; at: number } | null>(null);
  const youRef = useRef(me.youPid);
  youRef.current = me.youPid;

  // ---- who reads me right now
  const where = useWhere(conn, me.youPid, me.pids);
  const ownerOf = useCallback(
    (hi: number) => {
      for (const part of me.owners.split('|')) {
        const i = part.indexOf(':');
        if (i > 0 && Number(part.slice(0, i)) === hi) return part.slice(i + 1);
      }
      return null;
    },
    [me.owners],
  );
  const scope = useMemo(
    () => chatScope({ role: me.role, phase, location: where.loc, seat: me.seat, here: where.here, buildingName, houseIndexOf, ownerOf }),
    [me.role, phase, where.loc, where.here, me.seat, ownerOf],
  );
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  /** Where the viewer was when each line arrived (lines are only delivered inside the own area). */
  const tags = useRef(new Map<string, { key: string; tag: string }>());

  // ---- folding in game, peeks, unread
  // The world does the talking: once the game starts the chat folds to a button (unless the player
  // opened it themselves), new messages "peek" next to it for a few seconds.
  const userOpened = useRef(false);
  const wasInGame = useRef(me.inGame);
  useEffect(() => {
    if (me.inGame && !wasInGame.current && !userOpened.current) setOpen(false);
    wasInGame.current = me.inGame;
  }, [me.inGame]);
  const [peek, setPeek] = useState<{ kind: 'chat' | 'crier'; id: string; from: string; text: string } | null>(null);
  const showPeek = useCallback((p: { kind: 'chat' | 'crier'; id: string; from: string; text: string }, ms: number) => {
    setPeek(p);
    setTimeout(() => setPeek((x) => (x?.id === p.id ? null : x)), ms);
  }, []);
  const lastSeenId = useRef<string | null>(messages.at(-1)?.id ?? null);
  const [crierSeen, setCrierSeen] = useState(0);
  const chatVisible = open && tab === 'chat';
  if (chatVisible) lastSeenId.current = messages.at(-1)?.id ?? lastSeenId.current;
  const unread = chatVisible ? 0 : unreadAfter(messages, lastSeenId.current, me.youPid);
  useEffect(() => {
    if (open && tab === 'crier') setCrierSeen(anns.length);
  }, [open, tab, anns.length]);
  const crierNew = Math.max(0, anns.length - crierSeen);

  // ---- incoming: own echoes confirm pending lines; others peek while folded
  useEffect(
    () =>
      conn.events.on('chat:message', (m: ChatMessage) => {
        tags.current.set(m.id, { key: scopeRef.current.key, tag: scopeRef.current.tag });
        if (tags.current.size > 400) tags.current.delete(tags.current.keys().next().value!);
        if (m.fromPid && m.fromPid === youRef.current) {
          lastSaid.current = { text: m.text, at: Date.now() };
          setOutbox((o) => {
            const i = matchEcho(o, m.text, m.cid);
            return i < 0 ? o : o.filter((_, k) => k !== i);
          });
        }
      }),
    [conn],
  );
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || open || (last.fromPid && last.fromPid === me.youPid)) return;
    if (peek?.id === last.id) return;
    showPeek({ kind: 'chat', id: last.id, from: last.fromName, text: last.text }, 6000);
  }, [messages]);
  useEffect(
    () =>
      conn.events.on('announcement', (a: AnnouncementView) => {
        setLiveAnns((x) => [...x.filter((y) => annKey(y) !== annKey(a)), a].slice(-60));
        // The HUD toasts announcements while a game view exists. One that ends the game view (host
        // abort -> back to the waiting room) would vanish with the HUD: show it here instead.
        setTimeout(() => {
          if (!conn.gameView.get()) showPeek({ kind: 'crier', id: annKey(a), from: 'Town crier', text: a.text }, 9000);
        }, 600);
      }),
    [conn],
  );

  // ---- outbox: client-side rate mirror, echo timeout, server refusals
  const pump = useCallback(() => {
    const now = Date.now();
    const open = conn.status.get() === 'open';
    let changed = false;
    const next = outRef.current.map((o) => {
      if (o.state !== 'queued' || !open) return o;
      if (o.notBefore && o.notBefore > now) return o;
      if (!bucket.current.take(now)) return o;
      changed = true;
      conn.send('chat:send', { text: o.text, cid: o.cid });
      return { ...o, state: 'sending' as const, sentAt: now, notBefore: undefined, tries: o.tries + 1 };
    });
    const expired = expireOutbox(next, now);
    if (changed || expired) setOutbox((outRef.current = expired ?? next));
  }, [conn]);
  const busy = outbox.some((o) => o.state !== 'failed');
  useEffect(() => {
    if (!busy) return;
    pump();
    const t = setInterval(pump, 250);
    return () => clearInterval(t);
  }, [busy, pump]);
  useEffect(() => conn.status.subscribe((s) => s === 'open' && pump()), [conn, pump]);

  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for !== 'chat:send') return;
        const now = Date.now();
        if (e.code === 'rate_limited') {
          bucket.current.drain(now);
          setHint({ text: e.message && e.message !== 'Slow down' ? e.message : 'Slow down a little', until: now + 2000, tone: 'warn' });
        } else if (e.code === 'duplicate') setHint({ text: 'You just said that', tone: 'info' });
        else setHint({ text: e.message || 'That message was not sent', tone: 'warn' });
        setOutbox((o) => {
          if (FAIL_ALL_CODES.includes(e.code)) return o.map((x) => (x.state === 'failed' ? x : { ...x, state: 'failed' as const, reason: e.message || 'Not sent' }));
          return refuseOldest(o, e.code, e.message, now);
        });
      }),
    [conn],
  );
  // A failed line goes back into an empty input (never lose what was typed); else it stays with Retry.
  useEffect(() => {
    const failed = outbox.find((o) => o.state === 'failed');
    if (!failed || !composer.current || composer.current.text().trim()) return;
    composer.current.restore(failed.text);
    setOutbox((o) => o.filter((x) => x.cid !== failed.cid));
    if (!hint) setHint({ text: `${failed.reason ?? 'Not sent'}: your message is back in the box`, tone: 'warn' });
  }, [outbox]);
  useEffect(() => {
    if (!hint) return;
    const ms = Math.max(4000, (hint.until ?? 0) - Date.now() + 1500);
    const t = setTimeout(() => setHint(null), ms);
    return () => clearTimeout(t);
  }, [hint]);

  const submit = useCallback(
    (raw: string): boolean => {
      const text = cleanChat(raw);
      if (!text) return false;
      if (me.muted) {
        setHint({ text: 'The host or Storyteller muted your chat in this lobby', tone: 'warn' });
        return false;
      }
      const now = Date.now();
      if (isRecentDuplicate(text, lastSaid.current, now, outRef.current)) {
        setHint({ text: 'You just said that', tone: 'info' });
        return false;
      }
      const s = scopeRef.current;
      const line: OutLine = { cid: makeCid(now), text, state: 'queued', at: now, tries: 0, zoneKey: s.key, zoneTag: s.tag };
      outRef.current = [...outRef.current, line];
      setOutbox(outRef.current);
      pump();
      const wait = bucket.current.waitMs(now);
      if (outRef.current.some((o) => o.state === 'queued') && wait > 0) setHint({ text: 'Slow down a little', until: now + wait, tone: 'info' });
      return true;
    },
    [me.muted, pump],
  );
  const retry = (cid: string) => {
    setOutbox((o) => o.map((x) => (x.cid === cid ? { ...x, state: 'queued' as const, tries: 0, reason: undefined, notBefore: undefined } : x)));
  };
  const discard = (cid: string) => setOutbox((o) => o.filter((x) => x.cid !== cid));

  // ---- keyboard: Enter / T opens the chat and focuses the input (never while typing or under a modal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isEnter = e.key === 'Enter';
      if (!isEnter && e.code !== 'KeyT') return;
      const active = document.activeElement as HTMLElement | null;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      if (!shortcutAllowed(e, active, { modalOpen, pttCode: storedPttCode() })) return;
      if (active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.getAttribute('role') === 'button')) {
        if (isEnter) return; // Enter activates the focused button
      }
      e.preventDefault();
      userOpened.current = true;
      setPeek(null);
      setTab('chat');
      if (open) composer.current?.focus();
      else {
        focusOnOpen.current = true;
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      composer.current?.focus();
    }
  }, [open, tab]);

  // Publish the dock's footprint so left-column panels (waiting room) can stop above it.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => {
      const r = el.getBoundingClientRect();
      // Only a bottom-left dock matters; the phone toggle sits bottom-right.
      root.style.setProperty('--ct-chat-h', r.left < window.innerWidth / 2 ? `${Math.ceil(window.innerHeight - r.top)}px` : '0px');
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--ct-chat-h');
    };
  }, [open]);

  const kb = useKeyboardInset(open && focused && coarse());

  const openChat = (t: 'chat' | 'crier' = 'chat') => {
    userOpened.current = true;
    setPeek(null);
    setTab(t);
    setOpen(true);
  };

  if (!open)
    return (
      <>
        {peek && (
          <button
            class={`ct-chat-peek${peek.kind === 'crier' ? ' ct-chat-peek-crier' : ''}`}
            onClick={() => openChat(peek.kind === 'crier' ? 'crier' : 'chat')}
            aria-label={peek.kind === 'crier' ? `Announcement: ${peek.text}. Open the crier` : `New message from ${peek.from}. Open chat`}
          >
            <span class="ct-chat-from">{peek.from}</span> <span class="ct-chat-text">{peek.text}</span>
          </button>
        )}
        <button
          ref={rootRef as unknown as preact.Ref<HTMLButtonElement>}
          class="ct-chat-toggle"
          onClick={() => openChat()}
          aria-label={unread > 0 ? `Open chat (${unread} unread)` : 'Open chat'}
          title="Chat (Enter or T)"
        >
          Chat
          {unread > 0 && (
            <span class="ct-chat-unread" aria-hidden="true">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </>
    );

  return (
    <section
      ref={rootRef}
      class={`ct-chat${me.inGame ? ' ct-chat-ingame' : ''}${kb > 0 ? ' ct-chat-kb' : ''}`}
      style={kb > 0 ? `--ct-kb: ${kb}px` : undefined}
      aria-label="Chat"
      onKeyDown={(e) => {
        // Escape outside the input folds the panel (inside the input it only leaves the input).
        if (e.key === 'Escape' && (e.target as HTMLElement).tagName !== 'INPUT') {
          e.stopPropagation();
          userOpened.current = false;
          setOpen(false);
        }
      }}
    >
      <header class="ct-chat-head">
        <div class="ct-chat-tabs" role="tablist" aria-label="Chat panel">
          <button role="tab" aria-selected={tab === 'chat'} class={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
            Chat
          </button>
          <button role="tab" aria-selected={tab === 'crier'} class={tab === 'crier' ? 'on' : ''} onClick={() => setTab('crier')} title="Every public announcement, to re-read">
            Crier
            {crierNew > 0 && tab !== 'crier' && (
              <span class="ct-chat-dot" aria-label={`${crierNew} new`}>
                {crierNew > 9 ? '9+' : crierNew}
              </span>
            )}
          </button>
        </div>
        <button class="ct-chat-min" onClick={() => ((userOpened.current = false), setOpen(false))} aria-label="Minimise chat" title="Minimise chat (Esc)">
          –
        </button>
      </header>
      {tab === 'chat' ? (
        <>
          <ScopeBar scope={scope} />
          <ChatLog
            items={buildLog(messages, anns, true)}
            outbox={outbox}
            youPid={me.youPid}
            scopeKey={scope.key}
            tags={tags.current}
            onReport={setReporting}
            onRetry={retry}
            onDiscard={discard}
          />
          {reporting?.fromPid && <ReportDialog conn={conn} target={{ pid: reporting.fromPid, name: reporting.fromName }} messageId={reporting.id} onClose={() => setReporting(null)} />}
          <SendHint hint={hint} queued={outbox.filter((o) => o.state === 'queued').length} offline={busy && conn.status.get() !== 'open'} />
          <Composer
            api={composer}
            placeholder={me.muted ? 'Your chat is muted in this lobby' : scope.placeholder}
            disabled={me.muted}
            onSubmit={submit}
            onFocusChange={setFocused}
          />
        </>
      ) : (
        <CrierLog items={anns} hasGame={hasGame} />
      )}
    </section>
  );
}

function ScopeBar({ scope }: { scope: ChatScope }) {
  return (
    <div class={`ct-chat-scope-bar ct-scope-${scope.kind}`} aria-live="polite" title="Who reads your messages right now">
      <span class="ct-scope-icon" aria-hidden="true">
        {scope.kind === 'square' ? '☼' : scope.kind === 'nobody' ? '∅' : scope.kind === 'unknown' ? '◌' : '⌂'}
      </span>
      <span class="ct-scope-title">{scope.title}</span>
      <span class="ct-scope-detail">{scope.detail}</span>
    </div>
  );
}

function ChatLog(props: {
  items: LogItem[];
  outbox: OutLine[];
  youPid: string | null;
  scopeKey: string;
  tags: Map<string, { key: string; tag: string }>;
  onReport: (m: ChatMessage) => void;
  onRetry: (cid: string) => void;
  onDiscard: (cid: string) => void;
}) {
  const { items, outbox, youPid, scopeKey, tags } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastKey = useRef<string | null>(null);
  const outCount = useRef(outbox.length);
  const [pill, setPill] = useState(0);
  // Follow the bottom only if the reader is there (or it is their own line); else count a pill.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const prev = lastKey.current;
    const idx = prev ? items.findIndex((i) => i.key === prev) : -1;
    const fresh = prev === null ? [] : items.slice(idx + 1);
    lastKey.current = items.at(-1)?.key ?? null;
    const ownAdded = outbox.length > outCount.current || fresh.some((i) => i.type === 'chat' && !!youPid && i.msg.fromPid === youPid);
    outCount.current = outbox.length;
    const added = fresh.filter((i) => i.type === 'chat').length;
    if (prev === null || stick.current || ownAdded) {
      el.scrollTop = el.scrollHeight;
      stick.current = true;
    }
    setPill((p) => (prev === null ? 0 : nextPill(p, added, stick.current, ownAdded)));
  }, [items.length, items.at(-1)?.key, outbox.length]);
  const jump = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setPill(0);
  };
  const empty = items.length === 0 && outbox.length === 0;
  return (
    <div class="ct-chat-logwrap">
      <div
        class="ct-chat-list"
        ref={listRef}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          stick.current = atBottom(e.currentTarget as HTMLDivElement);
          if (stick.current && pill) setPill(0);
        }}
      >
        {empty && <div class="ct-chat-empty">Nothing said here yet. Say hello!</div>}
        {items.map((it) =>
          it.type === 'crier' ? (
            <div key={it.key} class={`ct-chat-msg ct-chat-crier ct-crier-${it.ann.kind}`} title={clockTime(it.at)}>
              <span class="ct-chat-meta">
                <span class="ct-chat-scope">Crier</span>
              </span>
              <span class="ct-chat-text">{it.ann.text}</span>
            </div>
          ) : (
            <ChatLine key={it.key} m={it.msg} mine={!!youPid && it.msg.fromPid === youPid} tag={tags.get(it.msg.id)} scopeKey={scopeKey} onReport={props.onReport} />
          ),
        )}
        {outbox.map((o) => (
          <div key={o.cid} class={`ct-chat-msg ct-chat-zone ct-chat-mine ct-chat-out ct-out-${o.state}`}>
            <span class="ct-chat-meta">
              {o.zoneKey !== scopeKey && <span class="ct-chat-where">({o.zoneTag})</span>}
              <span class="ct-chat-from">You</span>
            </span>
            <span class="ct-chat-text">{o.text}</span>
            {o.state === 'failed' ? (
              <span class="ct-out-fail">
                {o.reason ?? 'Not sent'} ·{' '}
                <button class="ct-chat-linkbtn" onClick={() => props.onRetry(o.cid)}>
                  Retry
                </button>{' '}
                <button class="ct-chat-linkbtn" onClick={() => props.onDiscard(o.cid)} aria-label="Discard this message">
                  ✕
                </button>
              </span>
            ) : (
              <span class="ct-out-state" aria-label={o.state === 'queued' ? 'waiting to send' : 'sending'}>
                {o.state === 'queued' ? '…' : '·'}
              </span>
            )}
          </div>
        ))}
      </div>
      {pill > 0 && (
        <button class="ct-chat-pill" onClick={jump}>
          {pill} new ↓
        </button>
      )}
    </div>
  );
}

function ChatLine({
  m,
  mine,
  tag,
  scopeKey,
  onReport,
}: {
  m: ChatMessage;
  mine: boolean;
  tag: { key: string; tag: string } | undefined;
  scopeKey: string;
  onReport: (m: ChatMessage) => void;
}) {
  const elsewhere = tag && tag.key !== scopeKey ? tag.tag : null;
  return (
    <div class={`ct-chat-msg ct-chat-${m.scope}${mine ? ' ct-chat-mine' : ''}${elsewhere ? ' ct-chat-elsewhere' : ''}`} title={clockTime(m.at)}>
      <span class="ct-chat-meta">
        <time class="ct-chat-time" dateTime={new Date(m.at).toISOString()}>
          {clockTime(m.at)}
        </time>
        {elsewhere && <span class="ct-chat-where">({elsewhere})</span>}
        {m.scope !== 'lobby' && m.scope !== 'zone' && <span class="ct-chat-scope">{SCOPE_LABEL[m.scope]}</span>}
        <span class="ct-chat-from">{mine ? 'You' : m.fromName}</span>
      </span>
      <span class="ct-chat-text">{m.text}</span>
      {m.fromPid && !mine && (
        <button class="ct-chat-report" onClick={() => onReport(m)} aria-label={`Report ${m.fromName}`} title="Report this message">
          !
        </button>
      )}
    </div>
  );
}

function CrierLog({ items, hasGame }: { items: AnnouncementView[]; hasGame: boolean }) {
  const ref = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [items.length]);
  return (
    <>
      <div class="ct-chat-scope-bar ct-scope-crier">
        <span class="ct-scope-icon" aria-hidden="true">
          📜
        </span>
        <span class="ct-scope-title">Town crier</span>
        <span class="ct-scope-detail">public announcements · everyone hears these</span>
      </div>
      {items.length === 0 ? (
        <div class="ct-chat-list">
          <div class="ct-chat-empty">{hasGame ? 'Nothing announced yet.' : 'Announcements appear here once the game begins.'}</div>
        </div>
      ) : (
        <ol class="ct-chat-list ct-crier-list" ref={ref} role="log" aria-live="polite">
          {items.map((a) => (
            <li key={annKey(a)} class={`ct-chat-msg ct-chat-crier ct-crier-${a.kind}`}>
              <time class="ct-crier-time" dateTime={new Date(a.at).toISOString()}>
                {clockTime(a.at)}
              </time>
              <span class="ct-chat-text">{a.text}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SendHint({ hint, queued, offline }: { hint: Hint; queued: number; offline: boolean }) {
  const [now, setNow] = useState(Date.now());
  const counting = !!hint?.until && hint.until > now;
  useEffect(() => {
    if (!hint?.until) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [hint?.until]);
  if (offline)
    return (
      <div class="ct-chat-hint ct-hint-info" role="status">
        Reconnecting… your message will be sent when you are back.
      </div>
    );
  if (!hint) return null;
  const s = hint.until ? secondsLeft(hint.until, now) : 0;
  return (
    <div class={`ct-chat-hint ct-hint-${hint.tone ?? 'warn'}`} role={hint.tone === 'info' ? 'status' : 'alert'}>
      {hint.text}
      {counting && s > 0 && (queued > 0 ? ` · sending in ${s}s` : ` · ${s}s`)}
    </div>
  );
}

interface ComposerApi {
  focus(): void;
  text(): string;
  restore(t: string): void;
}

/** The input owns its text, so typing re-renders only this component (not the message list). */
function Composer({
  api,
  placeholder,
  disabled,
  onSubmit,
  onFocusChange,
}: {
  api: { current: ComposerApi | null };
  placeholder: string;
  disabled: boolean;
  onSubmit: (t: string) => boolean;
  onFocusChange: (f: boolean) => void;
}) {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const inputRef = useRef<HTMLInputElement>(null);
  api.current = {
    focus: () => inputRef.current?.focus(),
    text: () => textRef.current,
    restore: (t) => {
      setText(t);
      textRef.current = t;
    },
  };
  const send = (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    // Enter on an empty line hands the keyboard back to walking.
    if (!t) {
      inputRef.current?.blur();
      return;
    }
    if (onSubmit(t)) {
      setText('');
      textRef.current = '';
    }
    // Keep typing: the next line is one Enter away (Escape or an empty Enter returns to the town).
    inputRef.current?.focus();
  };
  return (
    <form class="ct-chat-form" onSubmit={send}>
      <input
        ref={inputRef}
        value={text}
        maxLength={CHAT_MAX}
        placeholder={placeholder}
        aria-label="Chat message"
        enterKeyHint="send"
        autoComplete="off"
        disabled={disabled}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        // Keep WASD/arrow keys from moving the character while typing; Escape returns to the town.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
        }}
        onKeyUp={(e) => e.stopPropagation()}
      />
      {text.length > CHAT_MAX - 40 && <span class="ct-chat-count">{CHAT_MAX - text.length}</span>}
      <button type="submit" aria-label="Send" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
