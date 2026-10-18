import type { CreateLobbyRequest, DirectoryEvent, LobbySummary, ScriptId, StorytellerMode, WorldId } from '@ct/protocol';
import { appPath, appWorld, pathInWorld } from '../common/appWorld';

// Pure lobby-finder logic (sorting/filtering happens client-side over the public summaries).

export interface FinderFilters {
  search: string;
  /** 'waiting' = only lobbies still in the waiting room. */
  status: 'waiting' | 'all';
  /** Lobby size bucket by maxPlayers. */
  size: 'any' | 'small' | 'medium' | 'large';
  /** Minimum players currently seated. */
  minPlayers: number;
  script: 'any' | ScriptId;
}

export const DEFAULT_FILTERS: FinderFilters = { search: '', status: 'waiting', size: 'any', minPlayers: 0, script: 'any' };

// ------------------------------------------------------------------------------------ (v3 WP6) the town

/** The world a lobby summary or room view uses (`view.world`, else `view.lobby.world`; absent = 'v2', every
 * lobby created before v3). The one copy of this rule for the client. */
export const worldOfLobby = (l: { world?: WorldId; lobby?: { world?: WorldId } } | null | undefined): WorldId => l?.world ?? l?.lobby?.world ?? 'v2';

/** The lobbies of one world (each app lists only its own: `/` = v3, `/v2/` = v2; docs/v3 §11 URL paths). Pure. */
export function lobbiesOfWorld(lobbies: Iterable<LobbySummary>, world: WorldId): LobbySummary[] {
  return [...lobbies].filter((l) => worldOfLobby(l) === world);
}

/** The create dialog's fields → the POST /api/lobbies body (pure; `world` is always sent: the page's app world). */
export function createLobbyBody(f: {
  name: string;
  maxPlayers: number;
  script: ScriptId;
  description: string;
  takeStoryteller: boolean;
  mode: StorytellerMode;
  world: WorldId;
}): Partial<CreateLobbyRequest> & { name: string; maxPlayers: number } {
  return {
    name: f.name,
    maxPlayers: f.maxPlayers,
    script: f.script,
    description: f.description.trim(),
    takeStoryteller: f.mode === 'human' && f.takeStoryteller,
    ...(f.mode === 'auto' ? { storytellerMode: 'auto' as const } : {}),
    world: f.world,
  };
}

const SIZE_RANGES: Record<Exclude<FinderFilters['size'], 'any'>, [number, number]> = {
  small: [5, 8],
  medium: [9, 12],
  large: [13, 15],
};

export function applyDirectoryEvent(prev: Map<string, LobbySummary>, e: DirectoryEvent): Map<string, LobbySummary> {
  switch (e.type) {
    case 'snapshot':
      return new Map(e.lobbies.map((l) => [l.id, l]));
    case 'upsert': {
      const next = new Map(prev);
      next.set(e.lobby.id, e.lobby);
      return next;
    }
    case 'remove': {
      if (!prev.has(e.id)) return prev;
      const next = new Map(prev);
      next.delete(e.id);
      return next;
    }
    default:
      return prev;
  }
}

export function filterLobbies(lobbies: Iterable<LobbySummary>, f: FinderFilters): LobbySummary[] {
  const q = f.search.trim().toLowerCase();
  return [...lobbies].filter((l) => {
    if (q && !l.name.toLowerCase().includes(q) && !l.description.toLowerCase().includes(q)) return false;
    if (f.status === 'waiting' && l.phase !== 'waiting') return false;
    if (f.size !== 'any') {
      const [lo, hi] = SIZE_RANGES[f.size];
      if (l.maxPlayers < lo || l.maxPlayers > hi) return false;
    }
    if (l.playerCount < f.minPlayers) return false;
    if (f.script !== 'any' && l.script !== f.script) return false;
    return true;
  });
}

/** Default order: joinable first, then most occupied, then most recent. */
export function sortLobbies(lobbies: LobbySummary[]): LobbySummary[] {
  return lobbies.slice().sort((a, b) => {
    if (a.joinable !== b.joinable) return a.joinable ? -1 : 1;
    if (a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
    return b.createdAt - a.createdAt;
  });
}

export const PHASE_LABEL: Record<LobbySummary['phase'], string> = {
  waiting: 'Waiting',
  starting: 'Starting',
  day: 'Day',
  night: 'Night',
  finished: 'Finished',
};

export const SCRIPT_LABEL: Record<ScriptId, string> = { 'trouble-brewing': 'Trouble Brewing' };

/** The share link of a lobby: inside its world's app (`/lobby/x` = v3, `/v2/lobby/x` = v2; default = this page's). */
export function shareUrl(lobbyId: string, world: WorldId = appWorld()): string {
  return `${location.origin}${pathInWorld(world, `/lobby/${encodeURIComponent(lobbyId)}`)}`;
}

/** Copies text; falls back to execCommand for insecure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Same mechanism as main.tsx `navigate` (avoids importing main.tsx, which renders on import); stays in this app. */
export function goTo(path: '/' | '/admin') {
  const route = path === '/admin' ? { name: 'admin' } : { name: 'home' };
  history.pushState(route, '', appPath(path));
  window.dispatchEvent(new CustomEvent('ct:navigate', { detail: route }));
}

const FIELD_LABEL: Record<string, string> = {
  displayName: 'Name',
  name: 'Lobby name',
  description: 'Description',
  passphrase: 'Passphrase',
  maxPlayers: 'Player seats',
};

/** Turn a server validation message ("displayName: Too big: expected string to have <=24
 * characters") into plain language. Other server messages are already written for players. */
function humanize(message: string): string {
  const m = message.match(/^([A-Za-z.]+): (.*)$/);
  if (!m) return message;
  const field = FIELD_LABEL[m[1]!.split('.').pop()!] ?? 'That value';
  const rest = m[2]!;
  const big = rest.match(/Too big.*?(\d+)/i);
  if (big) return `${field} is too long (at most ${big[1]} characters).`;
  const small = rest.match(/Too small.*?(\d+)/i);
  if (small) return `${field} is too short (at least ${small[1]} characters).`;
  return `${field}: ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
}

/** Friendly message for a failed API call (server messages are plain text, rendered escaped). */
export function errorText(e: unknown): string {
  const err = e as { status?: number; body?: { message?: unknown; error?: unknown } } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  if (status === 429) return 'Too many attempts — please wait a moment and try again.';
  if (status >= 500) return 'The server had a problem. Please try again in a moment.';
  const body = err?.body;
  if (body && typeof body.message === 'string' && body.message) return humanize(body.message);
  if (status === 401) return 'Your session has ended — please sign in again.';
  if (e instanceof TypeError) return "Can't reach the server — check your internet connection and try again.";
  if (e instanceof SyntaxError) return 'The server sent an unexpected reply. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}
