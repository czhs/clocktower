import { z } from 'zod';
import { CHAT_FILTER_MODES, REPORT_MAX_MESSAGES, REPORT_NOTE_MAX, REPORT_REASONS } from './moderationShared.js';

// (v2.3 OPS-6, sec-ops) In-lobby moderation messages. Authorisation is server-side:
//   lobby:mute   host or seated Storyteller; mutes/unmutes a member's chat in this lobby (public: MemberView.muted)
//   lobby:unban  host or seated Storyteller; lifts a removal (key from LobbyRoomView.removed)
//   report:player any member; reports another member to the admins. The server attaches ONLY chat
//                lines it actually delivered to the reporter (by id), never hidden game information.
// The host/ST kick ('lobby:kick') bans the account AND its network from this lobby for the lobby's lifetime.

export const LobbyMuteMsg = z.object({ pid: z.string().min(1).max(64), on: z.boolean() });
export const LobbyUnbanMsg = z.object({ key: z.string().min(1).max(64) });
export const ReportPlayerMsg = z.object({
  pid: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(REPORT_NOTE_MAX).optional(),
  messageIds: z.array(z.string().min(1).max(32)).max(REPORT_MAX_MESSAGES).optional(),
});
export const ChatFilterSetting = z.enum(CHAT_FILTER_MODES);

/** A member the host/ST removed from this lobby (ONLY in the host's / Storyteller's own lobby:view). */
export interface RemovedMemberView {
  /** Opaque per-lobby key for lobby:unban (not an account id). */
  key: string;
  displayName: string;
  at: number;
}

/** S2C 'report:ack' — the report was filed (or why not). */
export interface ReportAck {
  ok: boolean;
  message: string;
}
