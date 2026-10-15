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

/** Live lobby directory over SSE with automatic reconnect (EventSource) + periodic resync. */
export function subscribeDirectory(onEvent: (e: DirectoryEvent) => void): () => void {
  const es = new EventSource('/api/lobbies/stream', { withCredentials: true });
  es.onmessage = (m) => onEvent(JSON.parse(m.data) as DirectoryEvent);
  const resync = setInterval(() => {
    api
      .listLobbies()
      .then(({ lobbies }) => onEvent({ type: 'snapshot', lobbies }))
      .catch(() => undefined);
  }, 30000);
  return () => {
    clearInterval(resync);
    es.close();
  };
}
