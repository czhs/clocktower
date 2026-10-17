// Renderer-free "who looks like what" rule (v3 WP0: the identity part of TownScene.castKey). Each renderer
// maps the result onto its own art: TownScene onto cast.png sheet keys (with ghost variants), the 3D town
// onto pixel3d specs (game3d/avatars/castMap.ts).
import { castById, PLAYABLE } from '@ct/assets';
import type { LobbyRoomView, PlayerGameView, StorytellerGameView } from '@ct/protocol';

export interface CastIdentity {
  /** Cast id ('storyteller' for the Storyteller). */
  id: string;
  name: string;
  st: boolean;
  lantern: boolean;
  /** Publicly dead. */
  dead: boolean;
  ghostVoteAvailable: boolean;
}

export function castIdentity(pid: string, lobby: LobbyRoomView | null | undefined, gview: PlayerGameView | StorytellerGameView | null | undefined, myPid: string | null): CastIdentity {
  const m = lobby?.members.find((x) => x.pid === pid);
  const st = m?.role === 'storyteller' || (gview?.kind === 'storyteller' && pid === myPid);
  const name = m?.displayName ?? '…';
  if (st) return { id: 'storyteller', name, st: true, lantern: true, dead: false, ghostVoteAvailable: false };
  const picked = castById(m?.cosmetics.preset ?? null);
  let id: string;
  if (picked && (picked.kind === 'villager' || picked.kind === 'mascot')) id = picked.id;
  else {
    // Unknown / legacy: a stable stand-in until the server assigns a character.
    let h = 0;
    for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    id = PLAYABLE[h % PLAYABLE.length]!.id;
  }
  const pub = gview?.players.find((p) => p.pid === pid);
  const dead = pub ? !pub.alive : false;
  return { id, name, st: false, lantern: !!castById(id)?.lantern, dead, ghostVoteAvailable: !!pub?.ghostVoteAvailable };
}
