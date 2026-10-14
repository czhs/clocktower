// Minimal same-origin API client with a cookie jar (qa-deploy). Mirrors apps/client/src/net/api.ts
// but returns raw status/body so tests can assert on failures too.
import type {
  AccountView,
  CreateAccountResponse,
  DirectoryEvent,
  JoinTicketResponse,
  LobbySummary,
} from '../../packages/protocol/src/index.js';

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export class ApiClient {
  readonly cookies = new Map<string, string>();
  constructor(
    readonly baseUrl: string,
    readonly extraHeaders: Record<string, string> = {},
  ) {}

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** The session cookie (name starts with ct_session), if any. */
  sessionCookie(): { name: string; value: string } | null {
    for (const [name, value] of this.cookies) if (name.startsWith('ct_session')) return { name, value };
    return null;
  }

  private storeCookies(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) ||
        attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split('=')[1]!) < Date.now());
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async req<T = any>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...this.extraHeaders };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      if (typeof body === 'string') payload = body;
      else payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      body: payload,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    this.storeCookies(res);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  }

  createAccount(displayName: string) {
    return this.req<CreateAccountResponse>('POST', '/api/auth/create', { displayName });
  }
  signIn(passphrase: string) {
    return this.req<AccountView>('POST', '/api/auth/signin', { passphrase });
  }
  signOut() {
    return this.req('POST', '/api/auth/signout', {});
  }
  me() {
    return this.req<AccountView>('GET', '/api/me');
  }
  listLobbies() {
    return this.req<{ lobbies: LobbySummary[] }>('GET', '/api/lobbies');
  }
  getLobby(id: string) {
    return this.req<{ lobby: LobbySummary }>('GET', `/api/lobbies/${encodeURIComponent(id)}`);
  }
  createLobby(req: { name: string; maxPlayers: number; description?: string; takeStoryteller?: boolean }) {
    return this.req<{ lobby: LobbySummary }>('POST', '/api/lobbies', req);
  }
  ticket(id: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player') {
    return this.req<JoinTicketResponse>('POST', `/api/lobbies/${encodeURIComponent(id)}/ticket`, { intent });
  }
  adminStatus() {
    return this.req('GET', '/api/admin/status');
  }

  /** Open the SSE lobby directory stream. Resolves once the HTTP response headers arrive. */
  async openDirectory(): Promise<SseStream> {
    const ctrl = new AbortController();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    const res = await fetch(this.baseUrl + '/api/lobbies/stream', { headers, signal: ctrl.signal });
    return new SseStream(res, ctrl);
  }
}

export class SseStream {
  readonly events: DirectoryEvent[] = [];
  readonly status: number;
  private waiters: { pred: (e: DirectoryEvent) => boolean; resolve: (e: DirectoryEvent) => void }[] = [];
  closed = false;

  constructor(
    readonly res: Response,
    private ctrl: AbortController,
  ) {
    this.status = res.status;
    if (res.ok && res.body) void this.pump(res.body);
  }

  private async pump(body: ReadableStream<Uint8Array>) {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          try {
            const ev = JSON.parse(data) as DirectoryEvent;
            this.events.push(ev);
            this.waiters = this.waiters.filter((w) => (w.pred(ev) ? (w.resolve(ev), false) : true));
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch {
      /* aborted */
    }
    this.closed = true;
  }

  waitFor(pred: (e: DirectoryEvent) => boolean, timeoutMs = 5000): Promise<DirectoryEvent> {
    const hit = this.events.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SSE waitFor timeout')), timeoutMs);
      this.waiters.push({ pred, resolve: (e) => (clearTimeout(t), resolve(e)) });
    });
  }

  close() {
    this.ctrl.abort();
  }
}
