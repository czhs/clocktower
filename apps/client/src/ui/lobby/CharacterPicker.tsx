import { useRef, useState } from 'preact/hooks';
import type { Cosmetics, MemberView } from '@ct/protocol';
import { PLAYABLE, PLAYABLE_IDS, castById, type CastMember } from '../../../../../packages/assets/src/cast';
import { CastPortrait } from '../common/castPortrait';

// Character picker (v2 roster). Players are one of a fixed cast: 13 villagers + 13 CMU course
// mascots; nobody in a lobby shares a character. A stage at the top shows the selected (or
// hovered / focused / tapped) character walking in place with its ghost, name and blurb; below,
// two portrait grids. Taken characters stay visible (greyed, "taken by <name>") but can't be
// picked. Keyboard: Tab into the grid, arrow keys / Home / End move, Enter / Space picks.

const VILLAGERS = PLAYABLE.filter((c) => c.kind === 'villager');
const MASCOTS = PLAYABLE.filter((c) => c.kind === 'mascot');

/** A random character from the roster, avoiding `taken` when possible. */
export function randomCharacter(taken?: ReadonlySet<string>): string {
  const free = PLAYABLE.filter((c) => !taken?.has(c.id));
  const pool = free.length ? free : PLAYABLE;
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

/** The roster character in `c` (undefined for legacy / unknown presets). */
export const characterOf = (c: Cosmetics | null | undefined): CastMember | undefined => {
  const id = c?.preset;
  return id && PLAYABLE_IDS.has(id) ? castById(id) : undefined;
};

/** Who holds each character among the other members of a lobby (character id -> display name). */
export function takenBy(members: readonly MemberView[], youPid: string): Map<string, string> {
  const m = new Map<string, string>();
  // The Storyteller always appears as the Storyteller sprite, so their pick blocks nobody (server: characterHolder).
  for (const x of members) if (x.pid !== youPid && x.role !== 'storyteller' && x.cosmetics.preset && PLAYABLE_IDS.has(x.cosmetics.preset)) m.set(x.cosmetics.preset, x.displayName);
  return m;
}

export function CharacterPicker({
  value,
  onPick,
  taken,
  pending,
  disabled,
  compact,
  status,
  label = 'Choose your character',
}: {
  /** The current character id (null / unknown = none picked). */
  value: string | null | undefined;
  onPick: (id: string) => void;
  /** Characters held by others: id -> their display name. */
  taken?: ReadonlyMap<string, string>;
  /** A pick sent to the server, not confirmed yet. */
  pending?: string | null;
  disabled?: boolean;
  /** Smaller stage (waiting-room sheet). */
  compact?: boolean;
  /** A line under the blurb: confirmation or a friendly error. */
  status?: { text: string; tone: 'ok' | 'error' | 'muted' } | null;
  label?: string;
}) {
  // What the stage shows: the hovered tile (real mouse only), else the focused / last-tapped one,
  // else the current pick. Kept apart so a stray mouseleave doesn't drop keyboard focus's preview.
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const peek = hover ?? focused;
  const gridRef = useRef<HTMLDivElement>(null);
  const current = value && PLAYABLE_IDS.has(value) ? value : null;
  const chosen = pending ?? current;
  const shownId = peek ?? chosen;
  const shown = shownId ? castById(shownId) : undefined;
  const holder = shown ? taken?.get(shown.id) : undefined;
  // Errors always show; confirmations only next to the character they are about.
  const showStatus = !!status && (status.tone === 'error' || shown?.id === chosen);
  // Roving tabindex: the chosen tile (else the first one) is the single Tab stop.
  const tabStop = chosen ?? PLAYABLE[0]!.id;

  const onKeyDown = (e: KeyboardEvent) => {
    const grid = gridRef.current;
    const from = e.target as HTMLElement;
    if (!grid || !from.matches('[role="radio"]')) return;
    const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const i = tiles.indexOf(from as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowRight') next = tiles[Math.min(tiles.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft') next = tiles[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = tiles[0];
    else if (e.key === 'End') next = tiles[tiles.length - 1];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') next = vertical(tiles, i, e.key === 'ArrowDown' ? 1 : -1);
    else return;
    e.preventDefault();
    if (next && next !== from) {
      from.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }
  };

  const tile = (c: CastMember) => {
    const on = c.id === chosen;
    const who = taken?.get(c.id);
    const isPending = c.id === pending && pending !== current;
    return (
      <button
        key={c.id}
        type="button"
        role="radio"
        aria-checked={on}
        aria-disabled={!!who || disabled || undefined}
        aria-label={`${c.name}${c.course ? `, ${c.course} mascot` : ''}${who ? `, taken by ${who}` : ''}`}
        title={who ? `${c.name}: taken by ${who}` : `${c.name}: ${c.blurb}`}
        tabIndex={c.id === tabStop ? 0 : -1}
        class={`ct-pick${on ? ' on' : ''}${who ? ' is-taken' : ''}${isPending ? ' is-pending' : ''}`}
        data-cast={c.id}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c.id)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        onFocus={() => setFocused(c.id)}
        onBlur={() => setFocused(null)}
        onClick={() => {
          // Taken (or locked) tiles only explain themselves; free ones are picked. (iOS doesn't
          // focus buttons on tap, hence setting it here too.)
          setFocused(c.id);
          if (who || disabled || on) return;
          onPick(c.id);
        }}
      >
        <CastPortrait id={c.id} size={48} />
        {who ? <span class="ct-pick-who">{who}</span> : c.course ? <span class="ct-pick-course">{c.course}</span> : null}
      </button>
    );
  };

  return (
    <div class={`ct-picker${compact ? ' ct-picker-compact' : ''}`}>
      <div class="ct-pick-stage" aria-live="polite">
        <div class="ct-pick-figure">
          {shown ? (
            <>
              <CastPortrait key={shown.id} id={shown.id} size={compact ? 80 : 96} crop="frame" animate />
              <CastPortrait key={`${shown.id}/g`} id={shown.id} ghost size={compact ? 40 : 48} crop="frame" class="ct-pick-ghost" />
            </>
          ) : (
            <span class="ct-pick-none" aria-hidden="true">?</span>
          )}
        </div>
        <div class="ct-pick-info">
          <div class="ct-pick-name">
            {shown ? shown.name : 'Pick a character'}
            {shown?.course && <span class="ct-pick-chip">{shown.course}</span>}
          </div>
          <div class="ct-pick-blurb">{shown ? shown.blurb : 'Everyone in a game is a different character.'}</div>
          <div class={`ct-pick-state ct-small ${holder ? 'ct-error' : showStatus && status ? (status.tone === 'muted' ? 'muted' : `ct-${status.tone}`) : 'muted'}`} role={status?.tone === 'error' ? 'alert' : undefined}>
            {holder
              ? `Taken by ${holder}`
              : shown && shown.id === pending && pending !== current
                ? 'Switching…'
                : showStatus && status
                  ? status.text
                  : shown && shown.id === chosen
                    ? 'Your character'
                    : shown
                      ? 'Tap to choose'
                      : ''}
          </div>
        </div>
      </div>
      <div class="ct-pick-grid" ref={gridRef} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        <div class="ct-pick-group" role="group" aria-label="Villagers">
          <div class="ct-pick-head" aria-hidden="true">Villagers</div>
          <div class="ct-pick-tiles">{VILLAGERS.map(tile)}</div>
        </div>
        <div class="ct-pick-group" role="group" aria-label="CMU course mascots">
          <div class="ct-pick-head" aria-hidden="true">
            Course mascots <span class="muted">· CMU</span>
          </div>
          <div class="ct-pick-tiles">{MASCOTS.map(tile)}</div>
        </div>
      </div>
    </div>
  );
}

/** The tile in the next visual row above/below tile `i`, closest horizontally (works across groups and at any width). */
function vertical(tiles: HTMLButtonElement[], i: number, dir: 1 | -1): HTMLButtonElement | undefined {
  const r = tiles[i]!.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  let rowTop: number | null = null;
  let best: HTMLButtonElement | undefined;
  let bestDx = Infinity;
  for (let j = i + dir; j >= 0 && j < tiles.length; j += dir) {
    const q = tiles[j]!.getBoundingClientRect();
    const beyond = dir > 0 ? q.top >= r.bottom - 2 : q.bottom <= r.top + 2;
    if (!beyond) continue;
    if (rowTop === null) rowTop = q.top;
    else if (Math.abs(q.top - rowTop) > 4) break;
    const dx = Math.abs(q.left + q.width / 2 - cx);
    if (dx < bestDx) (bestDx = dx), (best = tiles[j]);
  }
  return best;
}
