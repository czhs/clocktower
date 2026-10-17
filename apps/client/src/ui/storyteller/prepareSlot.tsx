// OWNED BY rules-storyteller. (v2.2) Waiting-room hook for the seated Storyteller: the
// "Storyteller tools" button and the lazily loaded preparation panel (prepare.tsx, its own chunk;
// prefetched on idle as soon as the button shows). Players never render this.
import { render, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { RoomConnection } from '../../net/room';
import { lazyComponent, whenIdle } from '../common/lazy';

const StPrepare = lazyComponent(
  () => import('./prepare').then((m) => m.StPrepare),
  (failed) => (failed ? <p class="ct-error ct-small">The Storyteller tools could not be loaded. Reload the page to try again.</p> : null),
  { reloadOnFail: true },
);

/**
 * Render into <body> (preact core has no createPortal): the panel must not live inside the waiting
 * sheet's stacking context, or the town toolbar / chat would sit on top of it.
 */
function BodyPortal({ children }: { children: ComponentChildren }) {
  const host = useMemo(() => document.createElement('div'), []);
  useEffect(() => {
    document.body.appendChild(host);
    return () => {
      render(null, host);
      host.remove();
    };
  }, [host]);
  useEffect(() => {
    render(<>{children}</>, host);
  });
  return null;
}

export function StPrepareButton({ conn }: { conn: RoomConnection }) {
  const [open, setOpen] = useState(false);
  useEffect(() => whenIdle(() => void StPrepare.preload()), []);
  return (
    <>
      <button class={open ? 'on' : ''} aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Prepare the game: how to deal, timers, settings — and practise the Storyteller panel">
        ☾ Storyteller tools
      </button>
      {open && (
        <BodyPortal>
          <StPrepare conn={conn} onClose={() => setOpen(false)} />
        </BodyPortal>
      )}
    </>
  );
}
