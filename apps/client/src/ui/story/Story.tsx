// OWNED BY records. "The story": the Storyteller's private play-by-play ("Story of the day", "So far" /
// "The whole game") with an optional pamphlet release, and the pamphlets everyone receives.
// Mounted by GameScreen ({conn, touch}). One button (top centre) + one panel; no modal stacks.
//
//   * Storyteller: story:get (polled every 3 s while the panel is open; same rev -> no reply) ->
//     story:st. Mid-game "Pamphlet: Day N" only when the ST setting `pamphlets` is on (public facts
//     only, built by the server). At the end: "The story of this game" (full reveal) — or keep it
//     to tell yourself. The preview shown is exactly what is sent (release quotes its digest).
//   * Everyone: story:pamphlet (gentle toast, open to read) and story:pamphlets (list on (re)connect).
// CONTRACT-REQUEST (lead): net/room.ts must subscribe to the S2C types 'story:st', 'story:pamphlet'
// and 'story:pamphlets' (add them to the `types` list) so they reach conn.events.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Pamphlet, PamphletKind, StoryStView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { PamphletView, StorySections } from './StoryParts';

type Tab = 'day' | 'all' | 'pamphlets';

export function Story({ conn, touch }: { conn: RoomConnection; touch: boolean }) {
  const lobby = useStore(conn.lobbyView);
  const game = useStore(conn.gameView);
  const status = useStore(conn.status);
  const isSt = game?.kind === 'storyteller';
  const finished = game?.phase === 'finished';
  const [pamphlets, setPamphlets] = useState<Pamphlet[]>([]);
  const [view, setView] = useState<StoryStView | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('day');
  const [reading, setReading] = useState<string | null>(null);
  const [toast, setToast] = useState<Pamphlet | null>(null);
  const [seenDay, setSeenDay] = useState(0);
  const [seenEnd, setSeenEnd] = useState(false);
  const viewRef = useRef<StoryStView | null>(null);
  viewRef.current = view;
  const isStRef = useRef(isSt);
  isStRef.current = isSt;

  // Pamphlets of this game: on mount and after every reconnect.
  useEffect(() => {
    if (status === 'open') conn.send('story:pamphlets', {});
  }, [conn, status]);
  useEffect(() => {
    const offs = [
      conn.events.on('story:pamphlets', (m) => setPamphlets(m.pamphlets)),
      conn.events.on('story:st', (v) => setView(v)),
      conn.events.on('story:pamphlet', (p) => {
        setPamphlets((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, p]));
        if (!isStRef.current) setToast(p);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conn]);
  // Rematch: the lobby is waiting again -> a new game, nothing released yet.
  const waiting = lobby?.lobby.phase === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    setPamphlets([]);
    setView(null);
    setOpen(false);
    setSeenDay(0);
    setSeenEnd(false);
  }, [waiting]);
  // Storyteller: refresh the story while the panel is open.
  useEffect(() => {
    if (!isSt || !open) return;
    conn.send('story:get', {});
    const t = setInterval(() => conn.send('story:get', viewRef.current ? { rev: viewRef.current.rev } : {}), 3000);
    return () => clearInterval(t);
  }, [conn, isSt, open]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 15000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!game) return null;
  const pamphletsOn = isSt && game.kind === 'storyteller' && game.settings?.pamphlets === true;
  // Gentle nudge for the Storyteller: a new day's story is ready (pamphlets on), or the game ended.
  const nudge = isSt && !open && ((pamphletsOn && game.phase === 'day' && game.dayNumber > seenDay) || (finished && !seenEnd));
  if (!isSt && pamphlets.length === 0 && !toast) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && isSt) {
      setSeenDay(game.dayNumber);
      if (finished) {
        setSeenEnd(true);
        setTab('all');
      }
    }
    if (next && !isSt) {
      setTab('pamphlets');
      setReading((r) => r ?? pamphlets.at(-1)?.id ?? null);
    }
  };
  const read = (p: Pamphlet) => {
    setToast(null);
    setOpen(true);
    setTab('pamphlets');
    setReading(p.id);
  };

  return (
    <div class={`cty-root${touch ? ' touch' : ''}`}>
      <button class={`cty-btn${open ? ' on' : ''}`} onClick={toggle} aria-expanded={open} title={isSt ? 'The story so far (only you can see it)' : 'Pamphlets released by the Storyteller'}>
        <span aria-hidden="true">📜</span> {isSt ? 'Story' : `Pamphlets${pamphlets.length ? ` (${pamphlets.length})` : ''}`}
        {nudge && <span class="cty-dot" aria-label={finished ? 'The story of this game is ready' : 'A new day: the story of the day is ready'} />}
      </button>
      {toast && !open && (
        <div class="cty-toast" role="status">
          <span>📜 The Storyteller released “{toast.title}”.</span>
          <button class="primary" onClick={() => read(toast)}>
            Read
          </button>
          <button aria-label="Dismiss" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
      {open && (
        <div class="cty-panel" role="dialog" aria-label={isSt ? 'The story' : 'Pamphlets'}>
          <div class="cty-head">
            {isSt ? (
              <div class="cty-tabs" role="tablist">
                <TabButton id="day" tab={tab} setTab={setTab} label="Story of the day" />
                <TabButton id="all" tab={tab} setTab={setTab} label={finished ? 'The whole game' : 'So far'} />
                <TabButton id="pamphlets" tab={tab} setTab={setTab} label={`Released (${pamphlets.length})`} />
              </div>
            ) : (
              <strong>Pamphlets</strong>
            )}
            <button class="cty-close" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div class="cty-body">
            {isSt && tab !== 'pamphlets' && <StorytellerStory view={view} tab={tab} conn={conn} pamphletsOn={pamphletsOn} />}
            {tab === 'pamphlets' && <PamphletShelf pamphlets={pamphlets} reading={reading} setReading={setReading} isSt={isSt} />}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ id, tab, setTab, label }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; label: string }) {
  return (
    <button role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
      {label}
    </button>
  );
}

function StorytellerStory({ view, tab, conn, pamphletsOn }: { view: StoryStView | null; tab: Tab; conn: RoomConnection; pamphletsOn: boolean }) {
  if (!view) return <p class="cty-muted">Gathering the story…</p>;
  const day = tab === 'day';
  return (
    <>
      <p class="cty-muted cty-small">Only you can see this — it includes everything (characters, night info, statuses).</p>
      {day ? (
        view.ofTheDay ? (
          <>
            <h3 class="cty-title">{view.ofTheDay.title}</h3>
            <StorySections sections={view.ofTheDay.sections} />
          </>
        ) : (
          <p class="cty-muted">The story of the day begins with the first night.</p>
        )
      ) : (
        <StorySections sections={view.soFar} />
      )}
      {day && pamphletsOn && view.previews.day && (
        <ReleaseBox
          key={view.previews.day.digest}
          conn={conn}
          kind="day"
          preview={view.previews.day}
          intro="Share the public part of this story with the town as a pamphlet (only what everyone already saw or heard: no characters, night info or statuses). Or don't, and tell it yourself."
        />
      )}
      {view.previews.final && (
        <ReleaseBox
          key={view.previews.final.digest}
          conn={conn}
          kind="final"
          preview={view.previews.final}
          intro="The game is over. Share the whole story with the Grimoire revealed — or keep it to tell yourself."
        />
      )}
    </>
  );
}

/** Preview + optional headline / flavour line + a two-step release. */
function ReleaseBox({ conn, kind, preview, intro }: { conn: RoomConnection; kind: PamphletKind; preview: Pamphlet; intro: string }) {
  const [headline, setHeadline] = useState('');
  const [flavour, setFlavour] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<'idle' | 'sent' | string>('idle');
  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for === 'story:release') setState(e.message);
      }),
    [conn],
  );
  const release = () => {
    conn.send('story:release', { kind, digest: preview.digest, ...(headline.trim() ? { headline: headline.trim() } : {}), ...(flavour.trim() ? { flavour: flavour.trim() } : {}) });
    setConfirming(false);
    setState('sent');
  };
  const shown: Pamphlet = { ...preview, ...(headline.trim() ? { headline: headline.trim() } : {}), ...(flavour.trim() ? { flavour: flavour.trim() } : {}) };
  return (
    <div class="cty-release">
      <h4>{kind === 'final' ? 'The story of this game' : preview.title}</h4>
      <p class="cty-small">{intro}</p>
      <label class="cty-field">
        Headline (optional)
        <input maxLength={120} value={headline} onInput={(e) => setHeadline((e.currentTarget as HTMLInputElement).value)} placeholder="e.g. Murder at the Mill!" />
      </label>
      <label class="cty-field">
        A line of your own (optional)
        <textarea maxLength={300} rows={2} value={flavour} onInput={(e) => setFlavour((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>
      <div class="cty-row">
        <button onClick={() => setShowPreview(!showPreview)} aria-expanded={showPreview}>
          {showPreview ? 'Hide preview' : 'Preview'}
        </button>
        {confirming ? (
          <>
            <button class="primary" onClick={release}>
              Yes, release to everyone
            </button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </>
        ) : (
          <button class="primary" onClick={() => setConfirming(true)}>
            Release to everyone…
          </button>
        )}
      </div>
      {state === 'sent' && <p class="cty-ok cty-small">Sent. It is in “Released”.</p>}
      {state !== 'idle' && state !== 'sent' && (
        <p class="cty-err cty-small" role="alert">
          {state}
        </p>
      )}
      {showPreview && <PamphletView p={shown} />}
    </div>
  );
}

function PamphletShelf({ pamphlets, reading, setReading, isSt }: { pamphlets: Pamphlet[]; reading: string | null; setReading: (id: string) => void; isSt: boolean }) {
  if (!pamphlets.length) return <p class="cty-muted">{isSt ? 'You have not released anything to the town.' : 'No pamphlets yet.'}</p>;
  const cur = pamphlets.find((p) => p.id === reading) ?? pamphlets.at(-1)!;
  return (
    <>
      {pamphlets.length > 1 && (
        <div class="cty-row cty-wrap">
          {pamphlets.map((p) => (
            <button key={p.id} class={p.id === cur.id ? 'on' : ''} onClick={() => setReading(p.id)}>
              {p.title}
            </button>
          ))}
        </div>
      )}
      <PamphletView p={cur} />
    </>
  );
}
