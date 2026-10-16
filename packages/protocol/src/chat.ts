import { z } from 'zod';
import { ChatText } from './text.js';

// Text chat follows voice in EVERY phase: only members in the sender's server-computed acoustic
// zone receive it. Waiting/finished cottages are private too. 'lobby' remains a legacy scope.

/** (v2.3) `cid`: optional client id echoed back ONLY in the sender's own chat:message (optimistic merge). */
export const ChatSendMsg = z.object({ text: ChatText, cid: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/).optional() });

export interface ChatMessage {
  id: string;
  fromPid: string | null;
  fromName: string;
  text: string;
  scope: 'lobby' | 'zone' | 'storyteller' | 'system';
  at: number;
  /** (v2.3) Only on the sender's own copy: the `cid` it sent. Never sent to anyone else. */
  cid?: string;
}
