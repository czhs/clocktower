import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CHAT_MAX, type AccountView, type ChatMessage } from '@ct/protocol';
import { useStore } from '../../net/store';
import type { RoomConnection } from '../../net/room';
import './chat.css';

// Text chat. Waiting room: whole lobby. In game: the server delivers a message only to members who
// could hear the sender's voice (same acoustic zone), so the panel says so. Docked bottom-left on
// desktop (voice panel is bottom-right); on phones it starts collapsed to a button and opens as a
// bottom sheet. Text is escaped by Preact. Enter focuses the input; Escape leaves it.

const SCOPE_LABEL: Record<ChatMessage['scope'], string> = {
  lobby: 'Lobby',
  zone: 'Nearby',
  storyteller: 'Storyteller',
  system: 'Town',
};

const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function ChatPanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const messages = useStore(conn.chat);
  const lobby = useStore(conn.lobbyView);
  const [open, setOpen] = useState(() => !narrow());
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const focusOnOpen = useRef(false);
  const seen = useRef(messages.length);
  const inGame = !!lobby && lobby.lobby.phase !== 'waiting' && lobby.lobby.phase !== 'finished';
  // The world does the talking: once the game starts the chat folds to a button (unless the player
  // opened it themselves), new messages "peek" next to it for a few seconds.
  const userOpened = useRef(false);
  const wasInGame = useRef(inGame);
  useEffect(() => {
    if (inGame && !wasInGame.current && !userOpened.current) setOpen(false);
    wasInGame.current = inGame;
  }, [inGame]);
  const [peek, setPeek] = useState<ChatMessage | null>(null);
  const lastSeenId = useRef<string | null>(messages.at(-1)?.id ?? null);
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.id === lastSeenId.current) return;
    lastSeenId.current = last.id;
    if (open || (last.fromPid && last.fromPid === lobby?.youPid)) return;
    setPeek(last);
    const t = setTimeout(() => setPeek((p) => (p?.id === last.id ? null : p)), 6000);
    return () => clearTimeout(t);
  }, [messages, open]);

  useEffect(() => {
    if (open) {
      seen.current = messages.length;
      setUnread(0);
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else setUnread(Math.max(0, messages.length - seen.current));
  }, [messages, open]);

  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for === 'chat:send') setHint(e.code === 'rate_limited' ? 'Slow down a little.' : e.message);
      }),
    [conn],
  );
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  // Enter (outside any text field) opens the chat and focuses the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement) || document.activeElement?.tagName === 'BUTTON') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      if (open) inputRef.current?.focus();
      else {
        focusOnOpen.current = true;
        userOpened.current = true;
        setPeek(null);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      inputRef.current?.focus();
    }
  }, [open]);

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

  const send = (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    conn.send('chat:send', { text: t });
    setText('');
    // Desktop: Enter-to-chat, Enter-to-send hands the keyboard straight back to walking.
    if (!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) inputRef.current?.blur();
  };

  const openChat = () => {
    userOpened.current = true;
    setPeek(null);
    setOpen(true);
  };
  if (!open)
    return (
      <>
      {peek && (
        <button class="ct-chat-peek" onClick={openChat} aria-label={`New message from ${peek.fromName}. Open chat`}>
          <span class="ct-chat-from">{peek.fromName}</span> <span class="ct-chat-text">{peek.text}</span>
        </button>
      )}
      <button
        ref={rootRef as unknown as preact.Ref<HTMLButtonElement>}
        class="ct-chat-toggle"
        onClick={openChat}
        aria-label={unread > 0 ? `Open chat (${unread} unread)` : 'Open chat'}
        title="Chat (Enter)"
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
    <section ref={rootRef} class={`ct-chat${inGame ? ' ct-chat-ingame' : ''}`} aria-label="Chat">
      <header class="ct-chat-head">
        <span>{inGame ? 'Nearby chat' : 'Lobby chat'}</span>
        <button class="ct-chat-min" onClick={() => ((userOpened.current = false), setOpen(false))} aria-label="Minimise chat" title="Minimise chat">
          –
        </button>
      </header>
      {inGame && <div class="ct-chat-note">Only people who can hear you will see your messages.</div>}
      <div class="ct-chat-list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && <div class="ct-chat-empty">{inGame ? 'Nothing said nearby yet.' : 'No messages yet — say hello.'}</div>}
        {messages.map((m) => (
          <div key={m.id} class={`ct-chat-msg ct-chat-${m.scope} ${m.fromPid && m.fromPid === lobby?.youPid ? 'ct-chat-mine' : ''}`}>
            <span class="ct-chat-meta">
              {m.scope !== 'lobby' && <span class="ct-chat-scope">{SCOPE_LABEL[m.scope]}</span>}
              <span class="ct-chat-from">{m.fromName}</span>
            </span>
            <span class="ct-chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {hint && (
        <div class="ct-chat-hint" role="alert">
          {hint}
        </div>
      )}
      <form class="ct-chat-form" onSubmit={send}>
        <input
          ref={inputRef}
          value={text}
          maxLength={CHAT_MAX}
          placeholder={inGame ? 'Say something nearby…' : 'Message the lobby…'}
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          // Keep WASD/arrow keys from moving the character while typing; Escape returns to the town.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
          }}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
