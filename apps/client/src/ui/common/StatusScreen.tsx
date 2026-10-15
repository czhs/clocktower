import type { ComponentChildren } from 'preact';

// Full-page status card used for loading and error states (lobby full / started / kicked /
// replaced / closed / connection lost). Text is rendered by Preact (escaped).

export interface StatusAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export function StatusScreen(props: { icon?: string; title: string; message?: ComponentChildren; actions?: StatusAction[] }) {
  return (
    <div class="screen center">
      <div class="panel" role="alert">
        {props.icon && (
          <div class="ct-status-icon" aria-hidden="true">
            {props.icon}
          </div>
        )}
        <h1 class="ct-status-title">{props.title}</h1>
        {props.message && <p>{props.message}</p>}
        {props.actions && props.actions.length > 0 && (
          <div class="ct-status-actions">
            {props.actions.map((a) => (
              <button key={a.label} class={a.primary ? 'primary' : ''} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LoadingScreen({ text }: { text: string }) {
  return (
    <div class="screen center" role="status" aria-live="polite">
      <span class="ct-spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

/** Friendly copy for lobby join/close failures. `code` is an ApiError code or a close reason. */
export function lobbyErrorCopy(code: string | undefined, fallback: string): { icon: string; title: string; message: string } {
  switch (code) {
    case 'lobby_full':
      return { icon: '⛫', title: 'This lobby is full', message: 'Every seat is taken. Pick another lobby or start your own.' };
    case 'lobby_started':
      return {
        icon: '☾',
        title: 'The game has begun',
        message: 'Only players seated in this game can return to it. Spectating is disabled to keep secrets safe.',
      };
    case 'not_found':
      return { icon: '?', title: 'Lobby not found', message: 'It may have closed after everyone left.' };
    case 'kicked':
      return { icon: '✕', title: 'Removed from the lobby', message: 'The host removed you from this lobby.' };
    case 'replaced':
      return {
        icon: '⇄',
        title: 'Opened somewhere else',
        message: 'This account joined the lobby from another tab or device, so this one was disconnected.',
      };
    case 'lobby_closed':
      return { icon: '⌂', title: 'Lobby closed', message: 'This lobby was closed.' };
    case 'connection_lost':
      return { icon: '⚠', title: 'Connection lost', message: 'We could not reach the server. Your seat is kept for a while — reload to try again.' };
    default:
      return { icon: '⚠', title: 'Could not join', message: fallback };
  }
}
