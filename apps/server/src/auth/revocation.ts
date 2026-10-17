// (v2.3 AUTH-1) Session revocation fan-out. Deleting session rows only stops *new* HTTP requests;
// an account's live room WebSocket, its Colyseus reconnection token and its open SSE lobby streams
// were unaffected. Everything that holds a long-lived connection subscribes here and closes it.
//
//   revoke(accountId)        every connection of the account (sign out everywhere, passphrase
//                            rotation, account deletion)
//   revoke(accountId, sid)   only connections opened with that session (single-device sign-out)
//
// `sid` is a short, non-secret session id: the first 16 hex chars of SHA-256(token), i.e. a prefix
// of the stored token hash. It travels inside join tickets so the room can tell sessions apart.
import { hashToken } from './crypto.js';

export type RevokeReason = 'signed_out' | 'passphrase_changed' | 'account_deleted';

export type RevokeListener = (accountId: string, sid: string | undefined, reason: RevokeReason) => void;

export function sessionId(token: string): string {
  return hashToken(token).slice(0, 16);
}

export class Revocations {
  private listeners = new Set<RevokeListener>();

  constructor(private readonly onError: (err: unknown) => void = () => undefined) {}

  subscribe(fn: RevokeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  revoke(accountId: string, reason: RevokeReason, sid?: string): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(accountId, sid, reason);
      } catch (e) {
        this.onError(e);
      }
    }
  }
}
