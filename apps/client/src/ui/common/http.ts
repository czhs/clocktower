import type { ApiError } from '@ct/protocol';
import { ApiFailure } from '../../net/api';

// Small same-origin POST helper for endpoints not (yet) in net/api.ts. Mirrors api.ts semantics:
// relative URL, same-origin cookies, ApiFailure on non-2xx.
// CONTRACT-REQUEST (lead): add `api.signOutAll()` and `api.adminCloseLobby(id)` to net/api.ts and
// drop this helper.
export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

export const signOutAll = () => postJson<{ ok: true }>('/api/auth/signout-all');
export const adminCloseLobby = (id: string) => postJson<{ ok: true }>(`/api/admin/lobbies/${encodeURIComponent(id)}/close`);
