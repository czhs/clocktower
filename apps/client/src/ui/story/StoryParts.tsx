// OWNED BY records. Shared renderers for the play-by-play (Storyteller story, admin Games tab) and
// the parchment pamphlet. All text is rendered through Preact (escaped) — never innerHTML.
import { CHARACTER_INFO, type CharacterId, type GamePhase, type Pamphlet, type StoryEntry, type StorySection } from '@ct/protocol';
import './story.css';

const NIGHTISH: GamePhase[] = ['first_night', 'night', 'dawn'];

/** Same grouping as the server (apps/server/src/records/story.ts): Night / Day headers. */
export function groupTimeline(entries: StoryEntry[]): StorySection[] {
  const out: StorySection[] = [];
  for (const e of entries) {
    if (e.undone) continue;
    const title =
      e.kind === 'end' || e.phase === 'finished'
        ? 'The end'
        : e.phase === 'setup'
          ? 'Setup'
          : NIGHTISH.includes(e.phase)
            ? e.night <= 1
              ? 'The first night'
              : `Night ${e.night}`
            : `Day ${e.day}`;
    let sec = out.at(-1);
    if (!sec || sec.title !== title) out.push((sec = { title, day: e.day, night: e.night, entries: [] }));
    sec.entries.push(e);
  }
  return out;
}

const ICON: Partial<Record<StoryEntry['kind'], string>> = {
  setup: '📖',
  night_step: '🕯',
  info: '✉',
  nomination: '☝',
  vote: '✋',
  vote_changed: '✎',
  execution: '⚖',
  death: '☠',
  revival: '✚',
  ability: '✦',
  role_change: '⇄',
  status: '•',
  storyteller: '✎',
  announcement: '📣',
  result_pending: '⏳',
  result_overridden: '↺',
  end: '🏁',
};

const fmtT = (ms: number) => {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** The play-by-play: section headers (Night / Day) + one line per entry. */
export function StorySections({ sections, showTime = false }: { sections: StorySection[]; showTime?: boolean }) {
  if (!sections.length) return <p class="cty-muted">Nothing has happened yet.</p>;
  return (
    <div class="cty-story">
      {sections.map((s, i) => (
        <section key={`${s.title}-${i}`} class={`cty-sec ${s.title.startsWith('Night') || s.title === 'The first night' ? 'night' : ''}`}>
          <h4>{s.title}</h4>
          <ol>
            {s.entries.map((e, j) => (
              <li key={j} class={`cty-e cty-${e.kind}`}>
                <span class="cty-icon" aria-hidden="true">
                  {ICON[e.kind] ?? '•'}
                </span>
                <span class="cty-text">{e.text}</span>
                {showTime && <time class="cty-t">{fmtT(e.t)}</time>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const charName = (c: CharacterId) => CHARACTER_INFO[c]?.name ?? c;

/** A pamphlet on parchment (mid-game public story of the day, or the full story with the reveal). */
export function PamphletView({ p }: { p: Pamphlet }) {
  return (
    <article class={`cty-pamphlet ${p.kind}`}>
      <header>
        <h3>{p.title}</h3>
        {p.headline && <p class="cty-headline">{p.headline}</p>}
        {p.kind === 'final' && p.winner && (
          <p class={`cty-winner ${p.winner}`}>
            {p.winner === 'good' ? 'Good' : 'Evil'} wins{p.reason ? ` — ${p.reason}` : ''}
          </p>
        )}
      </header>
      {p.reveal && (
        <table class="cty-reveal">
          <caption>The Grimoire</caption>
          <tbody>
            {p.reveal.map((r) => (
              <tr key={r.seat} class={`${r.alignment}${r.alive ? '' : ' dead'}`}>
                <td>{r.name}</td>
                <td>
                  {charName(r.character)}
                  {r.startingCharacter !== r.character && <span class="cty-was"> (was {charName(r.startingCharacter)})</span>}
                </td>
                <td>{r.alive ? 'alive' : 'dead'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.sections.length === 0 && <p class="cty-muted-ink">Nothing of note was seen in town.</p>}
      {p.sections.map((s, i) => (
        <section key={`${s.title}-${i}`}>
          <h4>{s.title}</h4>
          {s.lines.map((l, j) => (
            <p key={j} class={l.tone ? `tone-${l.tone}` : ''}>
              {l.text}
            </p>
          ))}
        </section>
      ))}
      {p.flavour && <footer class="cty-flavour">{p.flavour}</footer>}
    </article>
  );
}
