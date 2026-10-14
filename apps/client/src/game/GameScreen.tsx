import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../net/room';
import { unlockAudio } from './audio';
import './game.css';

// OWNED BY world-art. Mounts the Phaser town for this lobby; renders `children`
// (HUD, Storyteller panel, voice panel, chat — composed by main.tsx) above the canvas.
export function GameScreen(props: { conn: RoomConnection; account: AccountView; children?: ComponentChildren }) {
  const host = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<{ key: string; text: string; locked?: boolean } | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let game: { destroy(): void } | null = null;
    let cancelled = false;
    import('./TownGame')
      .then(({ createTownGame }) => {
        if (cancelled) return;
        game = createTownGame(el, { conn: props.conn, setPrompt, setCaption });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    const gesture = () => unlockAudio();
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      game?.destroy();
    };
  }, [props.conn]);

  return (
    <div class="ct-game">
      <div class="ct-game-canvas" ref={host} />
      {status === 'loading' && <div class="ct-game-loading">Lighting the lamps…</div>}
      {status === 'error' && <div class="ct-game-loading">The town failed to load. Reload the page to try again.</div>}
      {caption && (
        <div class="ct-game-caption" role="status" aria-live="polite">
          {caption}
        </div>
      )}
      {prompt && (
        <div class={`ct-game-prompt${prompt.locked ? ' locked' : ''}`} aria-live="polite">
          {!prompt.locked && <kbd>{prompt.key}</kbd>}
          <span>{prompt.text}</span>
        </div>
      )}
      {props.children}
    </div>
  );
}
