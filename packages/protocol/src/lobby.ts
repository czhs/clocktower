import { z } from 'zod';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import { Cosmetics } from './cosmetics.js';
import { LobbyDescription, LobbyName } from './text.js';

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

export const SCRIPTS = ['trouble-brewing'] as const;
export type ScriptId = (typeof SCRIPTS)[number];

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
}

export interface LobbyRoomView {
  lobby: LobbySummary;
  members: MemberView[];
  youPid: string;
  canStart: boolean;
  startBlockers: string[];
}

// Lobby C2S payloads
export const LobbyReadyMsg = z.object({ ready: z.boolean() });
export const LobbyCosmeticsMsg = z.object({ cosmetics: Cosmetics });
export const LobbyPidMsg = z.object({ pid: z.string().min(1).max(64) });
export const LobbySettingsMsg = z.object({
  name: LobbyName.optional(),
  description: LobbyDescription.optional(),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS).optional(),
  /** (v2.1) host only, waiting phase only. */
  storytellerMode: z.enum(['human', 'auto']).optional(),
  autoTimings: z
    .object({ discussionMin: z.number().min(1).max(30), nominationsMin: z.number().min(1).max(20), bedtimeSec: z.number().int().min(15).max(180), nightSec: z.number().int().min(20).max(300) })
    .partial()
    .optional(),
});
export const EmptyMsg = z.object({}).strict();
