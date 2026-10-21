// Rulebook Grimoire entry points. `openRulebook()` opens it from anywhere (toolbar, waiting room,
// home); `RulebookHost` is mounted once per screen and passes the lobby's script so the book opens
// on it. The book itself (and the engine role table it reads) is a separate chunk, loaded on first
// open and prefetched when idle.
import { useEffect, useState } from 'preact/hooks';
import type { CharacterId, ScriptId } from '@ct/protocol';
import { lazyComponent, whenIdle } from '../common/lazy';
import type { RulebookProps } from './Rulebook';
import type { BookId } from './content';

const LazyRulebook = lazyComponent<RulebookProps>(
  () => import('./Rulebook').then((m) => m.Rulebook),
  (failed) =>
    failed ? (
      <div class="ct-rb-backdrop">
        <p class="ct-rb-loading">The rulebook could not load. Check your connection and try again.</p>
      </div>
    ) : null,
  { reloadOnFail: true },
);

export interface OpenRulebook {
  book?: BookId;
  character?: CharacterId;
}

/** Open the rulebook (on the lobby's script, unless `book` or `character` says otherwise). */
export function openRulebook(opts?: OpenRulebook | Event) {
  const detail = opts && !(opts instanceof Event) ? opts : {};
  window.dispatchEvent(new CustomEvent<OpenRulebook>('ct:rulebook', { detail }));
}

/** Mount once per screen. `script` = the lobby's script; `mine` = the viewer's own character. */
export function RulebookHost({ script, mine }: { script?: ScriptId; mine?: CharacterId }) {
  const [open, setOpen] = useState<OpenRulebook | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<OpenRulebook>).detail ?? {});
    window.addEventListener('ct:rulebook', on);
    const cancel = whenIdle(() => void LazyRulebook.preload(), 6000);
    return () => {
      window.removeEventListener('ct:rulebook', on);
      cancel();
    };
  }, []);
  if (!open) return null;
  return <LazyRulebook script={script} book={open.book} initialCharacter={open.character} mine={mine} onClose={() => setOpen(null)} />;
}
