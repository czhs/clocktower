import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAT_MAX, type AccountView, type ChatMessage } from '@ct/protocol';
import { useStore } from '../../net/store';
import type { RoomConnection } from '../../net/room';
import './chat.css';

// OWNED BY lobby-auth. Text chat. Waiting room: whole lobby. In game: the server delivers a
// message only to members who could hear the sender's voice (same acoustic zone), so the panel
// says so. Rendered bottom-left (voice panel is bottom-right). Text is escaped by Preact.

const SCOPE_LABEL: Record<ChatMessage['scope'], string> = {
  lobby: 'Lobby',
  zone: 'Nearby',
  storyteller: 'Storyteller',
  system: 'Town',
};

export function ChatPanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const messages = useStore(conn.chat);
  const lobby = useStore(conn.lobbyView);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(messages.length);
  const inGame = !!lobby && lobby.lobby.phase !== 'waiting' && lobby.lobby.phase !== 'finished';

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

  const send = (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    conn.send('chat:send', { text: t });
    setText('');
  };

  if (!open)
    return (
      <button class="ct-chat-toggle" onClick={() => setOpen(true)}>
        Chat{unread > 0 && <span class="ct-chat-unread">{unread}</span>}
      </button>
    );

  return (
    <section class="ct-chat" aria-label="Chat">
      <header class="ct-chat-head">
        <span>{inGame ? 'Nearby chat' : 'Lobby chat'}</span>
        <button class="ct-chat-min" onClick={() => setOpen(false)} aria-label="Minimise chat">
          –
        </button>
      </header>
      {inGame && <div class="ct-chat-note">Only people who can hear you will see your messages.</div>}
      <div class="ct-chat-list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && <div class="ct-chat-empty">No messages yet.</div>}
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
      {hint && <div class="ct-chat-hint">{hint}</div>}
      <form class="ct-chat-form" onSubmit={send}>
        <input
          value={text}
          maxLength={CHAT_MAX}
          placeholder={inGame ? 'Say something nearby…' : 'Message the lobby…'}
          aria-label="Chat message"
          onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          // Keep WASD/arrow keys from moving the character while typing.
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
