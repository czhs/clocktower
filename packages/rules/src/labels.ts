// OWNED BY rules-storyteller. Short human labels for undoable Storyteller commands, so the Undo
// button can say WHAT it reverts ("↶ Undo: kill Alice") instead of "the last game action".
// Advisory UX only: never used for rules decisions. Labels are Storyteller-only (they may name a
// night target), so they appear only in the Storyteller projection.
import type { StCommand } from '@ct/protocol';
import { CHARACTER_INFO, storylineById } from '@ct/protocol';
import type { GameState } from './types.js';

const PHASE_WORD: Record<string, string> = {
  setup: 'back to setup',
  first_night: 'first night',
  day: 'start the day',
  gather: 'gather the circle',
  bedtime: 'bedtime bell',
  night: 'night falls',
  dawn: 'dawn',
};

/** "kill Alice", "start vote on Bob", … (≤ 60 chars). */
export function commandLabel(s: GameState, cmd: StCommand): string {
  const nm = (seat: number | null | undefined) => (seat === null || seat === undefined ? 'nobody' : (s.players.find((p) => p.seat === seat)?.name ?? `seat ${seat + 1}`));
  const nomName = (id: string) => {
    const n = s.day?.nominations.find((x) => x.id === id);
    return n ? nm(n.nomineeSeat) : 'a nomination';
  };
  const stepName = (id: string) => {
    const st = s.nightQueue.find((x) => x.id === id);
    if (!st) return 'a night step';
    const role = st.kind in CHARACTER_INFO ? CHARACTER_INFO[st.kind as keyof typeof CHARACTER_INFO].name : st.kind.replace(/_/g, ' ');
    return st.seat === null ? role : `${role} (${nm(st.seat)})`;
  };
  const text = ((): string => {
    switch (cmd.type) {
      case 'random_setup':
        return 'random setup';
      case 'assign_characters':
        return 'assign characters';
      case 'deal_preset':
        return `deal ${storylineById(cmd.storyline)?.title ?? 'a storyline'}`;
      case 'deal_bag':
        return 'deal your bag';
      case 'begin_first_night':
        return 'first night';
      case 'advance_phase':
      case 'force_phase':
        return PHASE_WORD[cmd.to] ?? cmd.to;
      case 'set_nominations_open':
        return cmd.open ? 'open nominations' : 'close nominations';
      case 'start_vote':
      case 'force_vote':
        return `vote on ${nomName(cmd.nominationId)}`;
      case 'cancel_nomination':
        return `cancel nomination of ${nomName(cmd.nominationId)}`;
      case 'create_nomination':
        return `${nm(cmd.nominatorSeat)} nominates ${nm(cmd.nomineeSeat)}`;
      case 'close_vote':
        return cmd.mode === 'tally' ? 'close the vote' : 'cancel the vote';
      case 'execute':
      case 'force_execute':
        return cmd.seat === null ? 'no execution' : `execute ${nm(cmd.seat)}`;
      case 'kill':
        return `kill ${nm(cmd.seat)}`;
      case 'set_alive':
        return cmd.alive ? `revive ${nm(cmd.seat)}` : `mark ${nm(cmd.seat)} dead`;
      case 'set_status':
        return `${nm(cmd.seat)}'s status`;
      case 'set_ghost_vote':
        return `${nm(cmd.seat)}'s ghost vote`;
      case 'change_character':
        return `change ${nm(cmd.seat)}'s character`;
      case 'add_reminder':
      case 'remove_reminder':
        return `${nm(cmd.seat)}'s reminder`;
      case 'prompt_player':
        return `prompt ${nm(cmd.seat)}`;
      case 'send_info':
        return `info to ${nm(cmd.seat)}`;
      case 'resolve_step':
        return `resolve ${stepName(cmd.stepId)}`;
      case 'skip_step':
        return `skip ${stepName(cmd.stepId)}`;
      case 'strike_vote':
        return `strike ${nm(cmd.seat)}'s vote`;
      case 'set_vote':
        return `${nm(cmd.seat)}'s vote`;
      case 'set_block':
        return cmd.seat === null ? 'clear the block' : `${nm(cmd.seat)} on the block`;
      case 'gather':
        return cmd.on ? 'gather the circle' : 'dissolve the circle';
      case 'set_red_herring':
        return 'red herring';
      case 'set_drunk_belief':
        return "the Drunk's belief";
      case 'override_result':
        return 'override the game end';
      case 'announce':
        return 'announcement';
      case 'bedtime_timer':
        return `bedtime timer (${cmd.action})`;
      default:
        return cmd.type.replace(/_/g, ' ');
    }
  })();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}
