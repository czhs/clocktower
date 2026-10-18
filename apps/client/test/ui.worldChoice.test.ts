// (v3 WP6, v3-ui; v3 URL paths 2026-10-18) The lobby's town: the create dialog sends the page's app world (no Town
// choice since the URL-path decision, docs/v3/INTEGRATION.md §11), the request body (validated by the server's
// CreateLobbyRequest schema), and the world badge on the waiting room and the join preview. Node, no DOM: the Preact components are called as functions and their
// vnode trees inspected. Runs under the root vitest.config.ts or apps/client's vite config alike (the zod schema
// is imported from the full protocol source: apps/client aliases '@ct/protocol' to the schema-free client entry).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VNode } from 'preact';
import type { LobbySummary, WorldId } from '@ct/protocol';
import { CreateLobbyRequest } from '../../../packages/protocol/src/lobby';
import { WORLDS } from '../../../packages/protocol/src/world';
import { createLobbyBody, worldOfLobby } from '../src/ui/lobby/finder';
import { WORLD_BADGE, WorldBadge } from '../src/ui/lobby/ModeSettings';
import { fetchJoinPreview, JoinPreviewView } from '../src/ui/lobby/JoinPreview';

type Node = VNode<Record<string, unknown>>;
const kids = (n: Node): Node[] => {
  const c = (n.props as { children?: unknown }).children;
  return (Array.isArray(c) ? c.flat(Infinity) : [c]).filter((x): x is Node => !!x && typeof x === 'object' && 'props' in (x as object));
};
const all = (n: Node): Node[] => [n, ...kids(n).flatMap(all)];
const text = (n: Node): string => {
  const c = (n.props as { children?: unknown }).children;
  return (Array.isArray(c) ? c.flat(Infinity) : [c]).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : x && typeof x === 'object' && 'props' in x ? text(x as Node) : '')).join('');
};
const ROOT = path.resolve(import.meta.dirname, '../../..');
const src = (f: string) => readFileSync(path.join(ROOT, 'apps/client/src', f), 'utf8');

describe('town of a new lobby (create dialog): the URL path, no Town choice (user decision 2026-10-18)', () => {
  it('has no Town radios and sends the page\'s app world (appWorld(): `/` = v3, `/v2/` = v2)', () => {
    const dialog = src('ui/lobby/CreateLobbyModal.tsx');
    expect(dialog).not.toMatch(/WorldChoice|DEFAULT_WORLD|WORLD_COPY|radiogroup|aria-label="Town"/);
    expect(dialog).toMatch(/createLobbyBody\(\{[^}]*world: appWorld\(\) \}\)/);
    // nothing else decides the world: no stored pick is read or written anywhere in the client
    for (const f of ['ui/lobby/CreateLobbyModal.tsx', 'ui/lobby/LobbyFinder.tsx', 'ui/lobby/finder.ts']) expect(src(f), f).not.toMatch(/ct\.create\.world|CREATE_WORLD_KEY/);
  });

  it('the create dialog is a lazy chunk (its copy stays out of the entry)', () => {
    const finder = src('ui/lobby/LobbyFinder.tsx');
    expect(finder).toMatch(/lazyComponent\(\s*\(\) => import\('\.\/CreateLobbyModal'\)/);
    expect(finder).not.toMatch(/from '\.\/CreateLobbyModal'/);
  });

  it('sends the world in the create request, which the server schema accepts', () => {
    const base = { name: 'Moss Lane', maxPlayers: 10, script: 'trouble-brewing' as const, description: '  hi ', takeStoryteller: true, mode: 'human' as const };
    for (const world of WORLDS) {
      const body = createLobbyBody({ ...base, world });
      expect(body).toEqual({ name: 'Moss Lane', maxPlayers: 10, script: 'trouble-brewing', description: 'hi', takeStoryteller: true, world });
      expect(CreateLobbyRequest.parse(body).world).toBe(world);
    }
    // automatic games: no Storyteller seat, the mode flag, the world still sent
    const auto = createLobbyBody({ ...base, mode: 'auto', world: 'v3' });
    expect(auto).toMatchObject({ takeStoryteller: false, storytellerMode: 'auto', world: 'v3' });
    expect(CreateLobbyRequest.parse(auto)).toMatchObject({ storytellerMode: 'auto', world: 'v3' });
  });
});

describe('world badge', () => {
  it('names the town; an absent world is a classic (pre-v3) lobby', () => {
    expect(worldOfLobby(undefined)).toBe('v2');
    expect(worldOfLobby({})).toBe('v2');
    expect(worldOfLobby({ world: 'v3' })).toBe('v3');
    // the room view shape: view.world, else view.lobby.world
    expect(worldOfLobby({ lobby: { world: 'v3' } })).toBe('v3');
    expect(worldOfLobby({ world: 'v2', lobby: { world: 'v3' } })).toBe('v2');
    expect(worldOfLobby(null)).toBe('v2');
    for (const [world, want] of [[undefined, 'v2'], ['v2', 'v2'], ['v3', 'v3']] as const) {
      const b = WorldBadge({ world }) as Node;
      expect(b.props['data-world']).toBe(want);
      expect(String(b.props.class)).toContain(`ct-world-badge-${want}`);
      expect(text(b)).toBe(WORLD_BADGE[want].badge);
      expect(b.props.title).toBe(WORLD_BADGE[want].title);
    }
    expect(WORLD_BADGE.v3.badge).toBe('Hollowmere');
  });

  it('is shown on the waiting room title and the join preview; not on list rows (each path lists one world)', () => {
    expect(src('ui/lobby/LobbyFinder.tsx')).not.toMatch(/WorldBadge/);
    // waiting room: in the meta line under the title, so a long lobby name keeps the whole title width
    expect(src('ui/lobby/WaitingRoom.tsx')).toMatch(/<div class="muted ct-small ct-waiting-meta">\s*<WorldBadge world=\{worldOfLobby\(view\)\} \/>/);
    expect(src('ui/lobby/WaitingRoom.tsx')).toMatch(/<h2 class="ct-waiting-name">\{view\.lobby\.name\}<\/h2>/);
  });
});

describe('join preview (share link /lobby/:id)', () => {
  const summary = { name: 'Moss Lane', world: 'v3' } as LobbySummary;
  it('renders "Joining <name>… [badge]" once the summary is known, the plain line before', () => {
    const plain = JoinPreviewView({ lobby: null }) as Node;
    expect(plain.props.role).toBe('status');
    expect(text(plain)).toBe('Joining lobby…');
    const known = JoinPreviewView({ lobby: summary }) as Node;
    const preview = all(known).find((n) => n.props.class === 'ct-join-preview')!;
    expect(preview).toBeDefined();
    const badge = kids(preview).find((n) => n.type === WorldBadge)!;
    expect(badge.props.world).toBe('v3');
    expect(text(preview)).toContain('Joining Moss Lane…');
    expect(text(WorldBadge({ world: 'v3' }) as Node)).toBe('Hollowmere');
  });
  it('fetches the summary once; a failure or a cancel keeps the plain line', async () => {
    const asked: string[] = [];
    const got: LobbySummary[] = [];
    fetchJoinPreview('abc', (id) => (asked.push(id), Promise.resolve({ lobby: summary })), (l) => got.push(l));
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toEqual(['abc']);
    expect(got).toEqual([summary]);
    // failure: silent (the join reports real errors itself)
    const failed: LobbySummary[] = [];
    fetchJoinPreview('x', () => Promise.reject(new Error('404')), (l) => failed.push(l));
    // cancelled before the answer (the join won the race / the route changed): nothing is set
    let answer!: (v: { lobby: LobbySummary }) => void;
    const late: LobbySummary[] = [];
    const cancel = fetchJoinPreview('y', () => new Promise((r) => (answer = r)), (l) => late.push(l));
    cancel();
    answer({ lobby: summary });
    await new Promise((r) => setTimeout(r, 0));
    expect(failed).toEqual([]);
    expect(late).toEqual([]);
  });
});
