// (v3 WP6, v3-ui) The join-by-id / share-link preview: while a /lobby/:id link connects, say which lobby and which
// town it is (docs/v3/INTEGRATION.md §9.1 user decision: "the join-by-id preview shows the lobby's world").
// Best-effort: the public summary (GET /api/lobbies/:id) is fetched once; when it fails or is slower than the
// join, the plain "Joining lobby…" stays. Lobby chunk only. Unit: apps/client/test/ui.worldChoice.test.ts.
// CONTRACT-REQUEST(lead): in LobbyRoute.tsx replace `if (!conn) return <LoadingScreen text="Joining lobby…" />`
// with `if (!conn) return <JoiningLobby id={id} />`, and the InLobby `layout !== 'ready'` loading screen (also
// visible while the v3 layout loads) with `<JoiningLobby id={conn.lobbyId} />` (lead-owned file).
import { useEffect, useState } from 'preact/hooks';
import type { LobbySummary } from '@ct/protocol';
import { api } from '../../net/api';
import { worldOfLobby } from './finder';
import { WorldBadge } from './ModeSettings';
import { appWorld, syncWorldPath } from '../common/appWorld';
import { V3LoadingStep } from '../common/townLoading';

type GetLobby = (id: string) => Promise<{ lobby: LobbySummary }>;

/** Fetch the preview once; `onLobby` only fires while not cancelled, a failure is silent. Returns the cancel. */
export function fetchJoinPreview(id: string, get: GetLobby, onLobby: (l: LobbySummary) => void): () => void {
  let alive = true;
  get(id).then(
    ({ lobby }) => alive && onLobby(lobby),
    () => undefined, // the join reports real errors itself
  );
  return () => {
    alive = false;
  };
}

/** The preview screen for a known (or not yet known) lobby summary. */
export function JoinPreviewView({ lobby }: { lobby: Pick<LobbySummary, 'name' | 'world'> | null }) {
  return (
    <div class="screen center" role="status" aria-live="polite">
      <span class="ct-spinner" aria-hidden="true" />
      {lobby ? (
        <span class="ct-join-preview">
          Joining {lobby.name}… <WorldBadge world={lobby.world} />
        </span>
      ) : (
        'Joining lobby…'
      )}
    </div>
  );
}

export function JoiningLobby({ id, get = api.getLobby }: { id: string; get?: GetLobby }) {
  const [lobby, setLobby] = useState<LobbySummary | null>(null);
  // (v3 URL paths) a lobby of the other world (an old v2 share link at /lobby/x): the address bar moves to its
  // app (/v2/lobby/x) as soon as the summary says so; the join itself keeps going (the room's first lobby:view
  // re-checks it, ui/common/v3skinLobby.ts)
  useEffect(() => fetchJoinPreview(id, get, (l) => (syncWorldPath(worldOfLobby(l)), setLobby(l))), [id]);
  // (v3 WP8) the v3 app (`/`) shows the Hollowmere loading scene from here on; the v2 app keeps the plain line
  if (appWorld() === 'v3') return <V3LoadingStep step="join" {...(lobby ? { label: `Joining ${lobby.name}…` } : {})} />;
  return <JoinPreviewView lobby={lobby} />;
}
