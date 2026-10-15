import type { ApiError } from '@ct/protocol';
import { ApiFailure } from '../../net/api';
import type {
  AdminAccountsPage,
  AdminAccountView,
  AdminAuditView,
  AdminBulkDeleteResponse,
  AdminGameRecord,
  AdminGamesPage,
  AdminOverview,
  AdminRotateResponse,
} from './types';

// Same-origin JSON client for /api/admin/* (mirrors net/api.ts semantics: relative URLs,
// same-origin cookies, JSON bodies, ApiFailure on non-2xx).
// CONTRACT-REQUEST (lead): fold these into net/api.ts if preferred.

async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: 'internal', message: `Unexpected response (${res.status})` };
  }
  if (!res.ok) throw new ApiFailure(res.status, data as ApiError);
  return data as T;
}

export interface AccountQuery {
  q: string;
  match: 'contains' | 'prefix';
  sort: 'created' | 'lastSeen' | 'name' | 'games';
  dir: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const acct = (id: string, action: string) => `/api/admin/accounts/${encodeURIComponent(id)}/${action}`;

export const adminApi = {
  overview: () => call<AdminOverview>('GET', '/api/admin/overview'),
  accounts: (q: AccountQuery) => {
    const p = new URLSearchParams({ q: q.q, match: q.match, sort: q.sort, dir: q.dir, limit: String(q.limit), offset: String(q.offset) });
    return call<AdminAccountsPage>('GET', `/api/admin/accounts?${p.toString()}`);
  },
  rename: (id: string, displayName: string, confirmSelf = false) =>
    call<AdminAccountView>('POST', acct(id, 'rename'), confirmSelf ? { displayName, confirmSelf } : { displayName }),
  rotatePassphrase: (id: string, confirmSelf = false) =>
    call<AdminRotateResponse>('POST', acct(id, 'rotate-passphrase'), confirmSelf ? { confirmSelf } : {}),
  signOutAll: (id: string, confirmSelf = false) => call<AdminAccountView>('POST', acct(id, 'signout-all'), confirmSelf ? { confirmSelf } : {}),
  deleteAccount: (id: string) => call<{ ok: true }>('POST', acct(id, 'delete'), { confirm: 'delete' }),
  bulkDelete: (ids: string[]) => call<AdminBulkDeleteResponse>('POST', '/api/admin/accounts/bulk-delete', { ids, confirm: 'delete' }),
  closeLobby: (id: string) => call<{ ok: true }>('POST', `/api/admin/lobbies/${encodeURIComponent(id)}/close`, {}),
  // (records) saved games (read-only)
  games: (before?: number) => call<AdminGamesPage>('GET', `/api/admin/games?limit=50${before ? `&before=${before}` : ''}`),
  game: (matchId: string) => call<AdminGameRecord>('GET', `/api/admin/games/${encodeURIComponent(matchId)}`),
  gameDownloadUrl: (matchId: string) => `/api/admin/games/${encodeURIComponent(matchId)}?download=1`,
  audit: (before?: number) =>
    call<{ entries: AdminAuditView[] }>('GET', `/api/admin/audit?limit=50${before ? `&before=${before}` : ''}`),
};
