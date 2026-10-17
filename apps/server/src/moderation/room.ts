// (v2.3 OPS-6, sec-ops) In-lobby moderation message handlers, called from GameRoom.dispatch through
// one hook line. GameRoom passes a narrow context; nothing here reads game state, so a report can
// never carry hidden information (characters, alignments, Grimoire, whispers the reporter did not get).
import { cleanText, type C2SParsed, type ServerErrorMsg, type S2CMessages } from '@ct/protocol';
import type { LobbyModeration } from './lobby.js';
import type { ModerationService } from './service.js';

export interface ModMember {
  pid: string;
  accountId: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'storyteller';
}

export interface ModRoomCtx {
  lobbyId: string;
  lobbyName: string;
  /** Public directory phase (waiting / day / night / finished …). */
  phase: string;
  mod: LobbyModeration;
  moderation: ModerationService;
  member(pid: string): ModMember | null;
  members(): ModMember[];
  sendAck(pid: string, ack: S2CMessages['report:ack']): void;
  error(err: ServerErrorMsg): void;
  markDirty(): void;
}

export type ModerationType = 'lobby:mute' | 'lobby:unban' | 'report:player';

/** Host, or the seated Storyteller, may moderate (mute / unban / kick). */
export const canModerate = (m: ModMember) => m.isHost || m.role === 'storyteller';

export function handleModeration(ctx: ModRoomCtx, me: ModMember, type: ModerationType, msg: unknown): void {
  switch (type) {
    case 'lobby:mute': {
      const { pid, on } = msg as C2SParsed<'lobby:mute'>;
      if (!canModerate(me)) return ctx.error({ code: 'forbidden', message: 'Only the host or Storyteller can mute', for: type });
      const target = ctx.member(pid);
      if (!target) return ctx.error({ code: 'not_found', message: 'No such member', for: type });
      if (target.pid === me.pid) return ctx.error({ code: 'forbidden', message: 'You cannot mute yourself', for: type });
      if (ctx.mod.setMuted(target.accountId, on)) ctx.markDirty();
      return;
    }
    case 'lobby:unban': {
      const { key } = msg as C2SParsed<'lobby:unban'>;
      if (!canModerate(me)) return ctx.error({ code: 'forbidden', message: 'Only the host or Storyteller can do that', for: type });
      if (!ctx.mod.unban(key)) return ctx.error({ code: 'not_found', message: 'Nobody to let back in', for: type });
      ctx.markDirty();
      return;
    }
    case 'report:player': {
      const r = msg as C2SParsed<'report:player'>;
      const target = ctx.member(r.pid);
      if (!target) return ctx.error({ code: 'not_found', message: 'No such member', for: type });
      if (target.pid === me.pid) return ctx.error({ code: 'invalid', message: 'You cannot report yourself', for: type });
      const refused = ctx.mod.takeReport(me.accountId);
      if (refused) return ctx.sendAck(me.pid, { ok: false, message: refused });
      const note = r.note ? cleanText(r.note).slice(0, 300) || null : null;
      ctx.moderation.fileReport({
        lobbyId: ctx.lobbyId,
        lobbyName: ctx.lobbyName,
        phase: ctx.phase,
        dayNumber: null,
        reporter: { accountId: me.accountId, pid: me.pid, name: me.name },
        target: { accountId: target.accountId, pid: target.pid, name: target.name },
        reason: r.reason,
        note,
        // ONLY lines the server delivered to the reporter (by id), never anyone else's.
        lines: ctx.mod.reportLines(me.pid, r.messageIds ?? []),
        members: ctx.members().map((m) => ({ pid: m.pid, name: m.name })),
      });
      return ctx.sendAck(me.pid, { ok: true, message: 'Thanks. Your report was sent to the server admins.' });
    }
  }
}
