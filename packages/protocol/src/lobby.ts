import { z } from 'zod';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import { Cosmetics } from './cosmetics.js';
import { SCRIPT_IDS, type ScriptId } from './characters/types.js';
import { LobbyDescription, LobbyName } from './text.js';
import { STORYLINE_IDS } from './storylines.js';
import { CHAT_FILTER_MODES } from './moderationShared.js';
import { WORLDS } from './world.js';

// Lobby directory (all require a signed-in session):
//   GET  /api/lobbies                      -> { lobbies: LobbySummary[] }
//   GET  /api/lobbies/stream   (SSE)       -> DirectoryEvent stream (snapshot first, then deltas, heartbeat 20s)
//   POST /api/lobbies          CreateLobbyRequest -> { lobby: LobbySummary }
//   GET  /api/lobbies/:id                  -> { lobby: LobbySummary }
//   POST /api/lobbies/:id/ticket JoinTicketRequest -> JoinTicketResponse
// The client then joins the Colyseus room `roomId` with options { ticket }.
// Tickets are short-lived (60s) HMAC-signed {accountId, lobbyId, intent, exp}; they are not
// reusable across lobbies. Reconnection uses Colyseus reconnection tokens, falling back to a
// fresh ticket — the server maps the account back to its previous seat.

// Script ids live in ./characters/types.js (shared with the character catalogue).
export const SCRIPTS = SCRIPT_IDS;

/** Coarse phase shown in the lobby finder. */
export type DirectoryPhase = 'waiting' | 'starting' | 'day' | 'night' | 'finished';

export interface LobbySummary {
  /** Public, URL-safe id (also used in /lobby/<id> share links). Not a credential. */
  id: string;
  name: string;
  description: string;
  script: ScriptId;
  maxPlayers: number;
  playerCount: number;
  storytellerName: string | null;
  storytellerSeatOpen: boolean;
  phase: DirectoryPhase;
  /** waiting && playerCount < maxPlayers (storyteller seat counted separately). */
  joinable: boolean;
  hostName: string;
  createdAt: number;
  updatedAt: number;
  /** (v2.1, auto-st) 'auto' = no Storyteller seat: the server runs the game (clock.ts). Absent = 'human'. */
  storytellerMode?: import('./clock.js').StorytellerMode;
  /** (v2.1, auto-st) Automatic-game timings (present when storytellerMode is 'auto'). */
  autoTimings?: import('./clock.js').AutoTimings;
  /**
   * (v2.2) Automatic games: the storyline fate deals. 'random' = an ordinary random setup; 'secret'
   * = the host picked a storyline but has not announced it; a StorylineId = announced by the host.
   * Absent in human games (the Storyteller's choice is never public).
   */
  autoStoryline?: 'random' | 'secret' | import('./storylines.js').StorylineId;
  /** (v2.3 OPS-6) The host's chat filter for this lobby (absent = default 'slurs'). */
  chatFilter?: import('./moderationShared.js').ChatFilterMode;
  /** (v3) The town this lobby uses, fixed at creation (absent = 'v2'). */
  world?: import('./world.js').WorldId;
}

export type DirectoryEvent =
  | { type: 'snapshot'; lobbies: LobbySummary[] }
  | { type: 'upsert'; lobby: LobbySummary }
  | { type: 'remove'; id: string }
  | { type: 'heartbeat'; at: number };

export const CreateLobbyRequest = z.object({
  name: LobbyName,
  description: LobbyDescription.default(''),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  script: z.enum(SCRIPTS).default('trouble-brewing'),
  takeStoryteller: z.boolean().default(false),
  /** (v2.1) 'auto' = no Storyteller seat; the server runs the game (clock.ts). */
  storytellerMode: z.enum(['human', 'auto']).optional(),
  /** (v3) The town: 'v2' (classic, the default) or 'v3' (Hollowmere). Immutable after creation. */
  world: z.enum(WORLDS).optional(),
});
export type CreateLobbyRequest = z.infer<typeof CreateLobbyRequest>;

export const JoinTicketRequest = z.object({
  /** 'player' joins a free seat; 'storyteller' claims an open ST seat; 'reconnect' restores. */
  intent: z.enum(['player', 'storyteller', 'reconnect']).default('player'),
});
export type JoinTicketRequest = z.infer<typeof JoinTicketRequest>;

export interface JoinTicketResponse {
  lobbyId: string;
  roomId: string;
  ticket: string;
  expiresAt: number;
}

/** Options passed to Colyseus `joinById(roomId, options)`. */
export const RoomJoinOptions = z.object({ ticket: z.string().min(10).max(2048) });
export type RoomJoinOptions = z.infer<typeof RoomJoinOptions>;

// ---------------------------------------------------------------------------------------
// In-room lobby view (sent as S2C 'lobby:view' to every member on change; no hidden info).

export type MemberRole = 'player' | 'storyteller';

export interface MemberView {
  /** Per-lobby public id. Account ids are never sent to other clients. */
  pid: string;
  displayName: string;
  role: MemberRole;
  /** 0-based seat (players only), fixed at game start; house = seat index. */
  seat: number | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  cosmetics: Cosmetics;
  /** (v2.3 OPS-6) The host/Storyteller muted this member's chat in this lobby (public moderation act). */
  muted?: boolean;
}

export interface LobbyRoomView {
  lobby: LobbySummary;
  members: MemberView[];
  youPid: string;
  canStart: boolean;
  /**
   * (additive) You may remove / mute / unban: the host (lobby creator) at any time, or the seated
   * Storyteller once the game is running. Lobby settings and Start are the host's alone.
   */
  youAdmin?: boolean;
  /** (additive) ONLY in the seated Storyteller's view: pids asking for the Storyteller seat, oldest first. */
  stRequests?: string[];
  /** (additive) You asked the seated Storyteller for their seat and they have not answered yet. */
  youRequestedSt?: boolean;
  startBlockers: string[];
  /** (v2.2) ONLY in the seated Storyteller's own view: their pre-game settings ('prepare'). */
  stPrepare?: import('./storyteller.js').StPrepareView;
  /** (v2.2) ONLY in the host's own view of an automatic lobby: the storyline they picked (null = random). */
  autoStorylineChoice?: import('./storylines.js').StorylineId | null;
  /** (v2.3 OPS-6) ONLY in the host's / seated Storyteller's own view: members removed from this lobby (for unban). */
  removed?: import('./moderation.js').RemovedMemberView[];
  /** (v3) The lobby's town (= lobby.world; absent = 'v2'). Picks the layout and, with the Graphics setting, the renderer. */
  world?: import('./world.js').WorldId;
}

// Lobby C2S payloads
export const LobbyReadyMsg = z.object({ ready: z.boolean() });
export const LobbyCosmeticsMsg = z.object({ cosmetics: Cosmetics });
export const LobbyPidMsg = z.object({ pid: z.string().min(1).max(64) });
/** (additive) The seated Storyteller answers a member's request for the seat. */
export const LobbyStAnswerMsg = z.object({ pid: z.string().min(1).max(64), accept: z.boolean() });
export const LobbySettingsMsg = z.object({
  name: LobbyName.optional(),
  description: LobbyDescription.optional(),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS).optional(),
  /** (v2.1) host only, waiting phase only. */
  storytellerMode: z.enum(['human', 'auto']).optional(),
  /** (multi-script, additive) host only, waiting phase only. Leaving Trouble Brewing clears a storyline. */
  script: z.enum(SCRIPTS).optional(),
  autoTimings: z
    .object({ discussionMin: z.number().min(1).max(30), nominationsMin: z.number().min(1).max(20), bedtimeSec: z.number().int().min(15).max(180), nightSec: z.number().int().min(20).max(300) })
    .partial()
    .optional(),
  /** (v2.2) automatic games: the storyline fate deals (null = random). Host only, waiting phase only. */
  autoStoryline: z.enum(STORYLINE_IDS).nullable().optional(),
  /** (v2.2) automatic games: announce the chosen storyline in the public lobby summary (default false). */
  autoStorylinePublic: z.boolean().optional(),
  /** (v2.3 OPS-6) chat filter (host only, waiting phase only). */
  chatFilter: z.enum(CHAT_FILTER_MODES).optional(),
});
export const EmptyMsg = z.object({}).strict();
