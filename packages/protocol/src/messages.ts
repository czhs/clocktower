import type { z } from 'zod';
import { ChatSendMsg, type ChatMessage } from './chat.js';
import {
  NominateMsg,
  PromptResponseMsg,
  SlayerShotMsg,
  VoteMsg,
  type AnnouncementView,
  type PlayerGameView,
} from './game.js';
import {
  EmptyMsg,
  LobbyCosmeticsMsg,
  LobbyPidMsg,
  LobbyReadyMsg,
  LobbySettingsMsg,
  type LobbyRoomView,
} from './lobby.js';
import { StCommand, type StorytellerGameView } from './storyteller.js';
import { VoiceAnnounceMsg, VoiceStatusMsg, type VoiceGrant, type VoiceRevoke, type VoiceUnavailable } from './voice.js';
import { MoveMsg, UseDoorMsg, type WorldSnapshot, type WorldTeleport } from './world.js';
import { EmoteMsg, PinClearMsg, PinDropMsg, PinRemoveMsg, type EmoteEvent } from './social.js';

/**
 * Every client -> server Colyseus message type and its Zod schema. The GameRoom validates
 * every incoming message against this map and drops unknown/invalid ones (rate-limited error).
 * Authorisation (host/storyteller/seat/phase) is checked by the handling module, never trusted
 * from the payload.
 */
export const C2S = {
  // lobby (waiting room)
  'lobby:ready': LobbyReadyMsg,
  'lobby:cosmetics': LobbyCosmeticsMsg,
  'lobby:claimStoryteller': EmptyMsg,
  'lobby:releaseStoryteller': EmptyMsg,
  'lobby:transferStoryteller': LobbyPidMsg, // host or current ST; target must be a member
  'lobby:transferHost': LobbyPidMsg,
  'lobby:kick': LobbyPidMsg, // host only, waiting phase only
  'lobby:settings': LobbySettingsMsg, // host only, waiting phase only
  'lobby:start': EmptyMsg, // storyteller only
  'lobby:leave': EmptyMsg,
  // world
  move: MoveMsg,
  'world:useDoor': UseDoorMsg,
  // social (v2): emotes + pins
  'social:emote': EmoteMsg,
  'social:pin': PinDropMsg,
  'social:unpin': PinRemoveMsg,
  'social:clearPins': PinClearMsg,
  // chat
  'chat:send': ChatSendMsg,
  // game (players)
  'game:nominate': NominateMsg,
  'game:vote': VoteMsg,
  'game:promptResponse': PromptResponseMsg,
  'game:slayerShot': SlayerShotMsg,
  // storyteller
  'st:command': StCommand,
  // voice
  'voice:status': VoiceStatusMsg,
  'voice:announce': VoiceAnnounceMsg,
  // misc
  ping: EmptyMsg.extend({}).passthrough(),
} as const;

export type C2SType = keyof typeof C2S;
export type C2SPayload<T extends C2SType> = z.input<(typeof C2S)[T]>;
export type C2SParsed<T extends C2SType> = z.output<(typeof C2S)[T]>;

export interface ServerErrorMsg {
  code: 'invalid' | 'forbidden' | 'phase' | 'rate_limited' | 'not_found' | 'internal';
  message: string;
  /** The C2S type that caused the error, if any. */
  for?: string;
}

/** Every server -> client message type and payload. */
export interface S2CMessages {
  'lobby:view': LobbyRoomView;
  /** Exactly one of these per client, depending on their seat. */
  'game:view': PlayerGameView | StorytellerGameView;
  'world:snapshot': WorldSnapshot;
  'world:teleport': WorldTeleport;
  /** (v2) Someone you can see made a gesture (only sent to viewers who can see them). */
  'social:emote': EmoteEvent;
  'chat:message': ChatMessage;
  announcement: AnnouncementView;
  /** Sound cue (bell at bedtime, dawn chime, death toll). */
  sound: { cue: 'bell' | 'dawn' | 'toll' | 'door' | 'visit' };
  'voice:grant': VoiceGrant;
  'voice:revoke': VoiceRevoke;
  'voice:unavailable': VoiceUnavailable;
  error: ServerErrorMsg;
  kicked: { reason: string };
  pong: { t: number };
}
export type S2CType = keyof S2CMessages;

/**
 * Close codes used by the GameRoom when it forcibly disconnects a client. 41xx avoids Colyseus'
 * own 4000-range codes (e.g. 4002 = WS_CLOSE_WITH_ERROR).
 */
export const CLOSE_CODES = {
  kicked: 4101,
  replaced: 4102, // same account joined from another device (newest connection wins)
  lobbyClosed: 4103,
  unauthorized: 4104,
} as const;
export const TERMINAL_CLOSE_CODES: readonly number[] = Object.values(CLOSE_CODES);
