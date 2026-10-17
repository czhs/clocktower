// The rulebook Grimoire: an open book with a bookmark ribbon per script (plus general rules,
// Travellers, Fabled and Homebrew). The left page is the book's tokens laid out like the
// Storyteller's Grimoire; the right page shows the picked token, or the book's rules and night
// order. Opens on the lobby's script; every book is one click away. Loaded as its own chunk
// (see ./index.tsx), so the engine's role table (night order) never weighs on the main bundle.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CHARACTER_INFO, type CharacterId, type CharacterType, type ScriptId } from '@ct/protocol';
import { RoleIcon } from '../common/RoleIcon';
import {
  BOOK_IDS,
  BOOKS,
  TYPE_LABEL,
  bookForScript,
  factsOf,
  groupsOf,
  nightOrderOf,
  searchCharacters,
  setupRows,
  wakeSummary,
  type Book,
  type BookId,
} from './content';
import './rulebook.css';

export interface RulebookProps {
  /** The lobby's script: the book it opens on by default, marked ★ on its ribbon. */
  script?: ScriptId;
  /** Open on this book instead (e.g. 'rules'). */
  book?: BookId;
  /** Open straight on this character (e.g. "my character"). */
  initialCharacter?: CharacterId;
  /** The viewer's own character in the current game, highlighted wherever it appears. */
  mine?: CharacterId;
  onClose: () => void;
}

const TYPE_SINGULAR: Record<CharacterType, string> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsider',
  minion: 'Minion',
  demon: 'Demon',
  traveller: 'Traveller',
  fabled: 'Fabled',
};

export function Rulebook({ script, book: initialBook, initialCharacter, mine, onClose }: RulebookProps) {
  const lobbyBook = script ? bookForScript(script) : undefined;
  const [bookId, setBookId] = useState<BookId>(initialCharacter ? factsOf(initialCharacter).book : (initialBook ?? bookForScript(script)));
  const [picked, setPicked] = useState<CharacterId | null>(initialCharacter ?? null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CharacterType | 'all'>('all');
  const closeRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const prevFocus = useRef<Element | null>(null);
  const book = BOOKS[bookId];

  useEffect(() => {
    prevFocus.current = document.activeElement;
    closeRef.current?.focus();
    return () => (prevFocus.current as HTMLElement | null)?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      // Esc steps back first (token → book overview, search → cleared), then closes.
      if (query) setQuery('');
      else if (picked) setPicked(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [query, picked, onClose]);

  const openBook = (id: BookId) => {
    setBookId(id);
    setPicked(null);
    setFilter('all');
    setQuery('');
  };
  const pick = (c: CharacterId) => {
    setPicked(c);
    setBookId(factsOf(c).book);
    setQuery('');
    // On phones the pages stack: bring the detail page into view.
    requestAnimationFrame(() => detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
  };

  const results = useMemo(() => searchCharacters(query), [query]);

  return (
    <div class="ct-rb-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Keys pressed inside the book stay in it (the town must not walk while you read). Esc is
          handled on window (capture phase) above, so it still works. */}
      <div class="ct-rb" role="dialog" aria-modal="true" aria-labelledby="ct-rb-title" onKeyDown={(e) => e.stopPropagation()}>
        <nav class="ct-rb-ribbons" aria-label="Books" role="tablist">
          {BOOK_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              class={`ct-rb-ribbon ct-rb-ribbon--${id}${id === bookId ? ' on' : ''}`}
              aria-selected={id === bookId}
              onClick={() => openBook(id)}
              title={id === lobbyBook ? `${BOOKS[id].title} (this lobby)` : BOOKS[id].title}
            >
              {BOOKS[id].tab}
              {id === lobbyBook && (
                <span class="ct-rb-here" aria-label="(this lobby)">
                  ★
                </span>
              )}
            </button>
          ))}
        </nav>

        <header class="ct-rb-head">
          <div>
            <h2 id="ct-rb-title">{book.title}</h2>
            <p class="ct-rb-blurb">{book.blurb}</p>
          </div>
          <div class="ct-rb-tools">
            <input
              type="search"
              class="ct-rb-search"
              placeholder="Search every character…"
              aria-label="Search every character"
              value={query}
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            />
            <button ref={closeRef} class="ct-rb-close" onClick={onClose} aria-label="Close the rulebook">
              ✕
            </button>
          </div>
        </header>

        <div class="ct-rb-spread">
          <section class="ct-rb-page ct-rb-left" aria-label={query ? 'Search results' : `${book.title}: characters`}>
            {query ? (
              <SearchResults results={results} query={query} mine={mine} onPick={pick} />
            ) : book.characters.length ? (
              <TokenPage book={book} filter={filter} setFilter={setFilter} picked={picked} mine={mine} onPick={pick} />
            ) : (
              <RulesPage book={book} />
            )}
          </section>
          <section class="ct-rb-page ct-rb-right" ref={detailRef} aria-live="polite">
            {picked ? (
              <CharacterPage c={picked} mine={mine} onBack={() => setPicked(null)} onPick={pick} onBook={openBook} currentBook={bookId} />
            ) : book.characters.length ? (
              <Overview book={book} mine={mine} onPick={pick} />
            ) : (
              <SetupPage onBook={openBook} lobbyBook={lobbyBook} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------- left page

function Token({ c, picked, mine, onPick, size = 48 }: { c: CharacterId; picked?: boolean; mine?: CharacterId; onPick: (c: CharacterId) => void; size?: number }) {
  const info = CHARACTER_INFO[c];
  return (
    <button
      class={`ct-rb-token ct-rb-token--${info.alignment}${picked ? ' on' : ''}${c === mine ? ' mine' : ''}`}
      onClick={() => onPick(c)}
      aria-pressed={picked}
      title={info.ability}
    >
      <span class="ct-rb-disc">
        <RoleIcon id={c} size={size} label={false} />
      </span>
      <span class="ct-rb-token-name">{info.name}</span>
      {c === mine && <span class="ct-rb-mine-tag">You</span>}
    </button>
  );
}

function TokenPage({
  book,
  filter,
  setFilter,
  picked,
  mine,
  onPick,
}: {
  book: Book;
  filter: CharacterType | 'all';
  setFilter: (f: CharacterType | 'all') => void;
  picked: CharacterId | null;
  mine?: CharacterId;
  onPick: (c: CharacterId) => void;
}) {
  const groups = groupsOf(book);
  const shown = filter === 'all' ? groups : groups.filter((g) => g.type === filter);
  return (
    <>
      {groups.length > 1 && (
        <div class="ct-rb-filters" role="group" aria-label="Show">
          <button class={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <small>{book.characters.length}</small>
          </button>
          {groups.map((g) => (
            <button key={g.type} class={`ct-rb-f--${g.type}${filter === g.type ? ' on' : ''}`} aria-pressed={filter === g.type} onClick={() => setFilter(g.type)}>
              {g.label} <small>{g.ids.length}</small>
            </button>
          ))}
        </div>
      )}
      {shown.map((g) => (
        <div class={`ct-rb-group ct-rb-group--${g.type}`} key={g.type}>
          <h3>{g.label}</h3>
          <div class="ct-rb-tokens">
            {g.ids.map((c) => (
              <Token key={c} c={c} picked={c === picked} mine={mine} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function SearchResults({ results, query, mine, onPick }: { results: CharacterId[]; query: string; mine?: CharacterId; onPick: (c: CharacterId) => void }) {
  if (!results.length) return <p class="ct-rb-empty">No character matches “{query}”.</p>;
  return (
    <>
      <h3 class="ct-rb-search-head">
        {results.length} {results.length === 1 ? 'match' : 'matches'} across every book
      </h3>
      <ul class="ct-rb-results">
        {results.map((c) => {
          const f = factsOf(c);
          return (
            <li key={c}>
              <button class={`ct-rb-result${c === mine ? ' mine' : ''}`} onClick={() => onPick(c)}>
                <RoleIcon id={c} size={32} label={false} />
                <span>
                  <b>{f.name}</b> <small class={`ct-rb-type ct-rb-type--${f.type}`}>{TYPE_SINGULAR[f.type]}</small> <small class="ct-rb-from">{BOOKS[f.book].tab}</small>
                  <span class="ct-rb-result-ability">{f.ability}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RulesPage({ book }: { book: Book }) {
  return (
    <div class="ct-rb-rules">
      {book.rules.map((r) => (
        <div key={r.heading}>
          <h3>{r.heading}</h3>
          <ul>
            {r.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------ right page

function CharacterPage({
  c,
  mine,
  onBack,
  onPick,
  onBook,
  currentBook,
}: {
  c: CharacterId;
  mine?: CharacterId;
  onBack: () => void;
  onPick: (c: CharacterId) => void;
  onBook: (b: BookId) => void;
  currentBook: BookId;
}) {
  const f = factsOf(c);
  const order = nightOrderOf(BOOKS[f.book]);
  const firstPos = order ? order.first.indexOf(c) : -1;
  const otherPos = order ? order.other.indexOf(c) : -1;
  return (
    <article class={`ct-rb-detail ct-rb-detail--${f.alignment}`}>
      <button class="ct-link ct-rb-back" onClick={onBack}>
        ← {BOOKS[currentBook].title}
      </button>
      <div class="ct-rb-detail-head">
        <span class="ct-rb-disc ct-rb-disc--big">
          <RoleIcon id={c} size={96} label={false} />
        </span>
        <div>
          <h3>{f.name}</h3>
          <p>
            <span class={`ct-rb-type ct-rb-type--${f.type}`}>{TYPE_SINGULAR[f.type]}</span>{' '}
            {f.type === 'traveller' ? (
              <span class="ct-rb-align">Good or evil (the Storyteller decides)</span>
            ) : f.type === 'fabled' ? (
              <span class="ct-rb-align">Not a player</span>
            ) : (
              <span class={`ct-rb-align ct-rb-align--${f.alignment}`}>{f.alignment === 'good' ? 'Good' : 'Evil'}</span>
            )}
            {c === mine && <span class="ct-rb-mine-tag">Your character</span>}
          </p>
        </div>
      </div>
      <p class="ct-rb-ability">{f.ability}</p>
      <dl class="ct-rb-facts">
        <dt>Night</dt>
        <dd>
          {wakeSummary(f)}
          {firstPos >= 0 && <> First night: #{firstPos + 1}.</>}
          {otherPos >= 0 && <> Other nights: #{otherPos + 1}.</>}
        </dd>
        {f.setupHint && (
          <>
            <dt>Setup</dt>
            <dd>{f.setupHint.replace(/^\[|\]$/g, '')}</dd>
          </>
        )}
        {f.believesOther && (
          <>
            <dt>Secret</dt>
            <dd>This player is told they are a {TYPE_SINGULAR[f.believesOther]}, and does not know their real character.</dd>
          </>
        )}
        {f.dayAbility && (
          <>
            <dt>Day</dt>
            <dd>Used publicly during the day ({f.dayAbility}).</dd>
          </>
        )}
        {f.reminders.length > 0 && (
          <>
            <dt>Reminders</dt>
            <dd class="ct-rb-reminders">
              {f.reminders.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </dd>
          </>
        )}
        <dt>Found in</dt>
        <dd>
          <button class="ct-link" onClick={() => onBook(f.book)}>
            {BOOKS[f.book].title}
          </button>
        </dd>
      </dl>
      <Neighbours c={c} onPick={onPick} />
    </article>
  );
}

/** Same-type characters from the same book, for quick browsing. */
function Neighbours({ c, onPick }: { c: CharacterId; onPick: (c: CharacterId) => void }) {
  const f = factsOf(c);
  const same = BOOKS[f.book].characters.filter((x) => x !== c && CHARACTER_INFO[x].type === f.type);
  if (!same.length) return null;
  return (
    <div class="ct-rb-neighbours">
      <h4>Other {TYPE_LABEL[f.type]}</h4>
      <div>
        {same.map((x) => (
          <button key={x} class="ct-rb-chip" onClick={() => onPick(x)} title={CHARACTER_INFO[x].ability}>
            <RoleIcon id={x} size={24} label={false} /> {CHARACTER_INFO[x].name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Overview({ book, mine, onPick }: { book: Book; mine?: CharacterId; onPick: (c: CharacterId) => void }) {
  const order = nightOrderOf(book);
  return (
    <div class="ct-rb-overview">
      <p class="ct-rb-hint">Pick a token to read its character.</p>
      <RulesPage book={book} />
      {order && (
        <div class="ct-rb-nights">
          <NightList title="First night" ids={order.first} note="Evil players learn each other first (7+ players)." mine={mine} onPick={onPick} />
          <NightList title="Other nights" ids={order.other} mine={mine} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

function NightList({ title, ids, note, mine, onPick }: { title: string; ids: CharacterId[]; note?: string; mine?: CharacterId; onPick: (c: CharacterId) => void }) {
  return (
    <div class="ct-rb-night">
      <h3>{title}</h3>
      {note && <p class="ct-rb-note">{note}</p>}
      <ol>
        {ids.map((c) => (
          <li key={c}>
            <button class={`ct-rb-night-row${c === mine ? ' mine' : ''}`} onClick={() => onPick(c)}>
              <RoleIcon id={c} size={24} label={false} /> {CHARACTER_INFO[c].name}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SetupPage({ onBook, lobbyBook }: { onBook: (b: BookId) => void; lobbyBook?: BookId }) {
  return (
    <div class="ct-rb-setup">
      <h3>Characters by player count</h3>
      <div class="ct-rb-table-wrap">
        <table class="ct-rb-table">
          <thead>
            <tr>
              <th scope="col">Players</th>
              <th scope="col" class="ct-rb-c--townsfolk">Townsfolk</th>
              <th scope="col" class="ct-rb-c--outsider">Outsiders</th>
              <th scope="col" class="ct-rb-c--minion">Minions</th>
              <th scope="col" class="ct-rb-c--demon">Demons</th>
            </tr>
          </thead>
          <tbody>
            {setupRows().map((r) => (
              <tr key={r.players}>
                <th scope="row">{r.players}</th>
                <td>{r.townsfolk}</td>
                <td>{r.outsiders}</td>
                <td>{r.minions}</td>
                <td>{r.demons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Open a script</h3>
      <div class="ct-rb-jump">
        {(['trouble-brewing', 'bad-moon-rising', 'sects-and-violets', 'travellers', 'fabled', 'homebrew'] as const).map((id) => (
          <button key={id} class={id === lobbyBook ? 'primary' : ''} onClick={() => onBook(id)}>
            {BOOKS[id].title}
            {id === lobbyBook && ' ★'}
          </button>
        ))}
      </div>
    </div>
  );
}
