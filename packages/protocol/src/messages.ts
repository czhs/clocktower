import type { z } from 'zod';
import { ChatSendMsg, type ChatMessage } from './chat.js';
import {
  NominateMsg,
  PromptResponseMsg,
  SlayerShotMsg,
  ExileHandMsg,
  VoteMsg,
  type AnnouncementView,
  type PlayerGameView,
} from './game.js';
import {
  EmptyMsg,
  LobbyCosmeticsMsg,
  LobbyPidMsg,
  LobbyStAnswerMsg,
  LobbyReadyMsg,
  LobbySettingsMsg,
  type LobbyRoomView,
} from './lobby.js';
import { StCommand, type StorytellerGameView } from './storyteller.js';
import { VoiceAnnounceMsg, VoiceStatusMsg, type VoiceGrant, type VoiceRevoke, type VoiceUnavailable } from './voice.js';
import { MoveMsg, UseDoorMsg, type WorldSnapshot, type WorldTeleport } from './world.js';
import type { Snap2Frame } from './snapshotCodec.js';
import { EmoteMsg, PinClearMsg, PinDropMsg, PinRemoveMsg, type EmoteEvent } from './social.js';
import { ClockProposeMsg, ClockVoteMsg } from './clock.js';
import { StoryGetMsg, StoryPamphletsMsg, StoryReleaseMsg, type Pamphlet, type StoryStView } from './story.js';
import { NotebookLoadMsg, NotebookSaveMsg, type NotebookDataMsg, type NotebookUnavailableMsg } from './notebook.js';
import { LobbyMuteMsg, LobbyUnbanMsg, ReportPlayerMsg, type ReportAck } from './moderation.js';

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
  'lobby:claimStoryteller': EmptyMsg, // open seat: take it; taken: ask the seated Storyteller
  'lobby:cancelStoryteller': EmptyMsg, // (additive) withdraw your request for the seat
  'lobby:answerStoryteller': LobbyStAnswerMsg, // (additive) seated Storyteller only, waiting phase: hand over or keep
  'lobby:releaseStoryteller': EmptyMsg,
  'lobby:transferStoryteller': LobbyPidMsg, // host or current ST; target must be a member
  'lobby:transferHost': LobbyPidMsg,
  'lobby:kick': LobbyPidMsg, // (v2.3 OPS-6) host any time / seated Storyteller in game; bans account + network from this lobby
  'lobby:settings': LobbySettingsMsg, // host only, waiting phase only
  'lobby:start': EmptyMsg, // the host; a human game also needs its Storyteller seated
  'lobby:leave': EmptyMsg,
  'lobby:abort': EmptyMsg, // (v2.1, auto-st) automatic games: the host ends the running game (abandoned record) -> waiting room
  // (v2.3 OPS-6) moderation: host/ST mute + unban; any member reports (see moderation.ts)
  'lobby:mute': LobbyMuteMsg,
  'lobby:unban': LobbyUnbanMsg,
  'report:player': ReportPlayerMsg,
  // world
  move: MoveMsg,
  'world:useDoor': UseDoorMsg,
  // clock (v2.1): automatic games — propose / vote on extending the town clock
  'clock:propose': ClockProposeMsg,
  'clock:vote': ClockVoteMsg,
  // social (v2): emotes + pins
  'social:emote': EmoteMsg,
  'social:pin': PinDropMsg,
  'social:unpin': PinRemoveMsg,
  'social:clearPins': PinClearMsg,
  // (v2, notebook) private per-game notebook (owner-only; see notebook.ts)
  'notebook:save': NotebookSaveMsg,
  'notebook:load': NotebookLoadMsg,
  // chat
  'chat:send': ChatSendMsg,
  // game (players)
  'game:nominate': NominateMsg,
  'game:vote': VoteMsg,
  'game:promptResponse': PromptResponseMsg,
  'game:slayerShot': SlayerShotMsg,
  'game:exileHand': ExileHandMsg, // (additive, travellers) any seated player, alive or dead
  // storyteller
  'st:command': StCommand,
  // story (v2, records): 'story:get' / 'story:release' Storyteller only; 'story:pamphlets' anyone
  'story:get': StoryGetMsg,
  'story:release': StoryReleaseMsg,
  'story:pamphlets': StoryPamphletsMsg,
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
  code: 'invalid' | 'forbidden' | 'phase' | 'rate_limited' | 'not_found' | 'internal' | 'muted' | 'duplicate'; // (v2.3) muted / duplicate: chat:send only
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
  /** (v2.2, WP4) Compact snapshot frame, only to clients that joined with `snap: SNAP_CAPABILITY` (see snapshotCodec.ts). */
  'world:snap2': Snap2Frame;
  'world:teleport': WorldTeleport;
  /** (v2) Someone you can see made a gesture (only sent to viewers who can see them). */
  'social:emote': EmoteEvent;
  /** (v2, notebook) Your own private notebook (owner-only: never sent to anyone else). */
  'notebook:data': NotebookDataMsg;
  /** (v2, notebook) A notebook load/save could not be served (no game / retry later). */
  'notebook:unavailable': NotebookUnavailableMsg;
  'chat:message': ChatMessage;
  /** (v2, records) The Storyteller's story (play-by-play + pamphlet previews). Seated Storyteller ONLY. */
  'story:st': StoryStView;
  /** (v2, records) A pamphlet the Storyteller just released (to everyone in the lobby). */
  'story:pamphlet': Pamphlet;
  /** (v2, records) Every pamphlet released in this game so far (reply to story:pamphlets). */
  'story:pamphlets': { pamphlets: Pamphlet[] };
  announcement: AnnouncementView;
  /** Sound cue (bell at bedtime, dawn chime, death toll). */
  sound: { cue: 'bell' | 'dawn' | 'toll' | 'door' | 'visit' };
  'voice:grant': VoiceGrant;
  'voice:revoke': VoiceRevoke;
  'voice:unavailable': VoiceUnavailable;
  error: ServerErrorMsg;
  kicked: { reason: string };
  /** (v2.3 OPS-6) Reply to report:player. */
  'report:ack': ReportAck;
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
  // (v2.3 sec-host HOST-11 / sec-secrecy SEC-7) connection closed for abusive traffic (frame/byte budget
  // or message-violation score). Terminal: the client must not auto-reconnect.
  abuse: 4105,
  // (v2.3 sec-auth AUTH-1) the account's session was revoked (sign out [everywhere], passphrase
  // rotation, account deletion). Terminal: the client shows "You were signed out".
  signedOut: 4106,
} as const;
export const TERMINAL_CLOSE_CODES: readonly number[] = Object.values(CLOSE_CODES);
