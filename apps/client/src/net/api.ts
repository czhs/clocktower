import type {
  AccountView,
  ApiError,
  CreateAccountResponse,
  CreateLobbyRequest,
  DirectoryEvent,
  JoinTicketRequest,
  JoinTicketResponse,
  LobbySummary,
  StatsView,
  UpdateProfileRequest,
  AdminStatusView,
} from '@ct/protocol';

// LEAD-OWNED. Same-origin JSON API client. All URLs are relative, so the app works unchanged
// behind Tailscale Funnel (https), SSH forwarding (http://localhost:3001) and Vite dev proxy.

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiFailure(res.status, data as ApiError);
  return data as T;
}

export const api = {
  createAccount: (displayName: string) => call<CreateAccountResponse>('POST', '/api/auth/create', { displayName }),
  signIn: (passphrase: string) => call<AccountView>('POST', '/api/auth/signin', { passphrase }),
  signOut: () => call<{ ok: true }>('POST', '/api/auth/signout', {}),
  signOutAll: () => call<{ ok: true }>('POST', '/api/auth/signout-all', {}),
  me: () => call<AccountView>('GET', '/api/me'),
  updateMe: (patch: UpdateProfileRequest) => call<AccountView>('PATCH', '/api/me', patch),
  stats: () => call<StatsView>('GET', '/api/me/stats'),
  listLobbies: () => call<{ lobbies: LobbySummary[] }>('GET', '/api/lobbies'),
  getLobby: (id: string) => call<{ lobby: LobbySummary }>('GET', `/api/lobbies/${encodeURIComponent(id)}`),
  createLobby: (req: Partial<CreateLobbyRequest> & { name: string; maxPlayers: number }) =>
    call<{ lobby: LobbySummary }>('POST', '/api/lobbies', req),
  ticket: (id: string, req: JoinTicketRequest) =>
    call<JoinTicketResponse>('POST', `/api/lobbies/${encodeURIComponent(id)}/ticket`, req),
  adminStatus: () => call<AdminStatusView>('GET', '/api/admin/status'),
  adminCloseLobby: (id: string) => call<{ ok: true }>('POST', `/api/admin/lobbies/${encodeURIComponent(id)}/close`, {}),
};

/** Resync cadence while the stream is down or refused (SR-6: more tabs than streams fall back to this). */
const DIRECTORY_RESYNC_MS = 30_000;
/** (v3 perf, net) Safety-net resync while the stream is healthy (it sends a snapshot on every (re)connect). */
const DIRECTORY_HEALTHY_RESYNC_MS = 5 * 60_000;
/** The server sends a heartbeat every 20 s (directory/http.ts SSE_HEARTBEAT_MS): silence beyond this = unhealthy. */
const DIRECTORY_STALE_MS = 45_000;

/**
 * Live lobby directory over SSE with automatic reconnect (EventSource) + resync. (v3 perf, net) The full
 * `GET /api/lobbies` ran every 30 s even while the stream was healthy (≈ 10 KB per open finder per 30 s at
 * 30 lobbies, all of a quiet directory's traffic); now it runs every 30 s only while the stream is not
 * open or has gone quiet, and every 5 min otherwise.
 */
export function subscribeDirectory(onEvent: (e: DirectoryEvent) => void): () => void {
  const es = new EventSource('/api/lobbies/stream', { withCredentials: true });
  let lastEventAt = 0;
  let lastSyncAt = Date.now();
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as DirectoryEvent;
    lastEventAt = Date.now();
    if (e.type === 'snapshot') lastSyncAt = lastEventAt;
    onEvent(e);
  };
  const resync = setInterval(() => {
    const now = Date.now();
    const healthy = es.readyState === EventSource.OPEN && now - lastEventAt < DIRECTORY_STALE_MS;
    if (healthy && now - lastSyncAt < DIRECTORY_HEALTHY_RESYNC_MS) return;
    lastSyncAt = now;
    api
      .listLobbies()
      .then(({ lobbies }) => onEvent({ type: 'snapshot', lobbies }))
      .catch(() => undefined);
  }, DIRECTORY_RESYNC_MS);
  return () => {
    clearInterval(resync);
    es.close();
  };
}
