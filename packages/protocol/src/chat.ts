import { z } from 'zod';
import { ChatText } from './text.js';

// Text chat follows voice in EVERY phase: only members in the sender's server-computed acoustic
// zone receive it. Waiting/finished cottages are private too. 'lobby' remains a legacy scope.

export const ChatSendMsg = z.object({ text: ChatText });

export interface ChatMessage {
  id: string;
  fromPid: string | null;
  fromName: string;
  text: string;
  scope: 'lobby' | 'zone' | 'storyteller' | 'system';
  at: number;
}
