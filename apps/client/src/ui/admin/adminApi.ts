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
  AdminIpBlockView,
  AdminOpsView,
  AdminReportView,
  AdminSettingView,
  AdminSettingsPage,
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
  // (v2.3 AUTH-8) `passphrase` = the acting admin's own (step-up re-authentication).
  rotatePassphrase: (id: string, confirmSelf = false, passphrase?: string) =>
    call<AdminRotateResponse>('POST', acct(id, 'rotate-passphrase'), { ...(confirmSelf ? { confirmSelf } : {}), ...(passphrase ? { passphrase } : {}) }),
  signOutAll: (id: string, confirmSelf = false) => call<AdminAccountView>('POST', acct(id, 'signout-all'), confirmSelf ? { confirmSelf } : {}),
  deleteAccount: (id: string, passphrase?: string) => call<{ ok: true }>('POST', acct(id, 'delete'), { confirm: 'delete', ...(passphrase ? { passphrase } : {}) }),
  bulkDelete: (ids: string[], passphrase?: string) =>
    call<AdminBulkDeleteResponse>('POST', '/api/admin/accounts/bulk-delete', { ids, confirm: 'delete', ...(passphrase ? { passphrase } : {}) }),
  closeLobby: (id: string) => call<{ ok: true }>('POST', `/api/admin/lobbies/${encodeURIComponent(id)}/close`, {}),
  // (records) saved games (read-only)
  games: (before?: number) => call<AdminGamesPage>('GET', `/api/admin/games?limit=50${before ? `&before=${before}` : ''}`),
  game: (matchId: string) => call<AdminGameRecord>('GET', `/api/admin/games/${encodeURIComponent(matchId)}`),
  gameDownloadUrl: (matchId: string) => `/api/admin/games/${encodeURIComponent(matchId)}?download=1`,
  audit: (before?: number) =>
    call<{ entries: AdminAuditView[] }>('GET', `/api/admin/audit?limit=50${before ? `&before=${before}` : ''}`),
  // (v2.3 OPS-1/2/6) safety: panic switches, suspensions, network blocks, reports
  ops: () => call<AdminOpsView>('GET', '/api/admin/ops'),
  setOps: (patch: Partial<{ signupMode: 'open' | 'code' | 'closed'; signupCode: string | null; maintenance: boolean; maintenanceMessage: string; voice: boolean }>) =>
    call<AdminOpsView>('POST', '/api/admin/ops', patch),
  revokeAllSessions: () => call<{ ok: true; accounts: number }>('POST', '/api/admin/ops/revoke-all-sessions', { confirm: 'sign everyone out' }),
  closeAllLobbies: () => call<{ ok: true; closed: number }>('POST', '/api/admin/lobbies/close-all', { confirm: 'close all' }),
  suspend: (id: string, reason: string, days: number | null) => call<{ ok: true }>('POST', acct(id, 'suspend'), { reason, days }),
  unsuspend: (id: string) => call<{ ok: true }>('POST', acct(id, 'unsuspend'), {}),
  blockNetwork: (id: string, reason: string, days: number | null) => call<{ ok: true; key: string }>('POST', acct(id, 'block-network'), { reason, days }),
  ipBlocks: () => call<{ blocks: AdminIpBlockView[] }>('GET', '/api/admin/ip-blocks'),
  blockIp: (ip: string, reason: string, days: number | null) => call<{ ok: true; key: string }>('POST', '/api/admin/ip-blocks', { ip, reason, days }),
  unblockIp: (key: string) => call<{ ok: true }>('POST', '/api/admin/ip-blocks/remove', { key }),
  // (v2.3) settings registry ("Security & limits"); `passphrase` = step-up for dangerous keys
  settings: () => call<AdminSettingsPage>('GET', '/api/admin/settings'),
  setSetting: (id: string, value: boolean | number | string, passphrase?: string) =>
    call<{ setting: AdminSettingView }>('POST', `/api/admin/settings/${encodeURIComponent(id)}`, passphrase ? { value, passphrase } : { value }),
  resetSetting: (id: string, passphrase?: string) =>
    call<{ setting: AdminSettingView }>('POST', `/api/admin/settings/${encodeURIComponent(id)}/reset`, passphrase ? { passphrase } : {}),
  reports: (status: 'open' | 'resolved') => call<{ reports: AdminReportView[] }>('GET', `/api/admin/reports?status=${status}`),
  resolveReport: (id: number, action: 'dismissed' | 'warned' | 'suspended', note?: string) =>
    call<{ ok: true }>('POST', `/api/admin/reports/${id}/resolve`, note ? { action, note } : { action }),
};
