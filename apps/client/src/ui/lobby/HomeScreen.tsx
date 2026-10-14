import type { AccountView } from '@ct/protocol';

// OWNED BY lobby-auth (stub). Account home: cosmetic editor, stats, live Lobby Finder,
// Create Lobby modal (no password field).
export function HomeScreen(_props: {
  account: AccountView;
  onAccountChange: (a: AccountView) => void;
  onSignedOut: () => void;
  onJoin: (lobbyId: string, intent: 'player' | 'storyteller') => void;
}) {
  return <div class="screen center">Lobby finder (stub)</div>;
}
